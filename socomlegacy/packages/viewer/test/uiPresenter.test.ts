import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import { parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import type { DialogDesign, UiDrawItem } from '@s2u/ui';
import { FsAssetSource } from '@s2u/archive/node';
import { CardSlots } from '@s2u/card';
import { ControllerConfigs } from '../src/controllerConfigs';
import { FrontEndSession, readFrontEndDisc, type FrontEndDisc } from '../src/frontEnd';
import type { LoadingScreen } from '../src/loadingAssets';
import { LoadingPanel } from '../src/loadingPanel';
import { pageNativeOptionsState } from '../src/nativeOptionsState';
import { NativeSettings } from '../src/nativeSettings';
import { presentUiFrame, rasterizeUiDrawList, UiQuadRasterCache, type RasterOptions, type UiBitmap, type UiTextures } from '../src/uiCompositorView';
import { CpuUiPresenter, type UiPresenter } from '../src/uiPresenter';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { UI_RASTER_CASES, caseRasterInputs } from './uiRasterCases';

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
/** The Settings overlay's disc part (`readFrontEndDisc`: the dialogs and their scripts; disc-derived, the public tree has none). */
const FRONT_END_PRESENT = ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR'].every((p) => existsSync(resolve(FIXTURES, p)));

// GM-09 (plan 2026-11-01-gpu-menus; product track, a browser adaptation): the seams the GPU presenter (GM-11a-1 on)
// plugs into. `UiPresenter` takes a draw list to a picture; `CpuUiPresenter` is today's software path behind it, byte
// for byte (`rasterizeUiDrawList` then `presentUiFrame`). The front end, the Settings overlay and the loading panel each
// gain `readFrame()` (the frame the page shows, straight RGBA, top row first) and `undrawn()` (what it left undrawn), so
// a browser spec reads the frame through the page rather than a 2D canvas a WebGL2 canvas will not have.

const SRC = resolve(fileURLToPath(import.meta.url), '../../src');
const src = (f: string): string => readFileSync(resolve(SRC, f), 'utf8');
const sha = (d: Uint8ClampedArray): string => createHash('sha256').update(d).digest('hex');

interface Put { width: number; height: number; data: Uint8ClampedArray }
/**
 * A 2D canvas target recording each presented image (Node has no canvas); `getImageData` reads the last image put back
 * (the whole canvas only), counting its reads -- GM-09 review F2: the CPU presenter reads the canvas back on demand.
 */
const fakeTarget = () => {
  const put: Put[] = [];
  const reads: number[][] = [];
  return { put, reads, createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (img: Put) => { put.push({ width: img.width, height: img.height, data: img.data.slice() }); },
    getImageData: (x: number, y: number, w: number, h: number) => {
      reads.push([x, y, w, h]);
      const last = put.at(-1)!;
      if (x !== 0 || y !== 0 || w !== last.width || h !== last.height) throw new Error('the fake reads the whole canvas only');
      return { width: w, height: h, data: last.data.slice() };
    } };
};
/** Today's path, as the callers wrote it before GM-09: the raster, then the present. */
const today = (items: readonly UiDrawItem[], textures: UiTextures, o: RasterOptions): { put: Put[]; undrawn: string[] } => {
  const t = fakeTarget();
  const { frame, undrawn } = rasterizeUiDrawList(items, textures, o);
  presentUiFrame(t, frame);
  return { put: t.put, undrawn };
};

describe('GM-09: CpuUiPresenter is today\'s software path, byte for byte', () => {
  it('every GM-03 case at 1, 2 and 4, opaque and transparent: the image put and the undrawn are today\'s', { timeout: 60_000 }, () => {
    for (const c of UI_RASTER_CASES.filter((k) => k.id !== 15)) for (const scale of [1, 2, 4] as const) for (const mode of ['opaque', 'transparent'] as const) {
      const a = caseRasterInputs(c, scale, mode), b = caseRasterInputs(c, scale, mode);
      const t = fakeTarget();
      const p = new CpuUiPresenter(t);
      const got = p.present(a.items, a.textures, a.options);
      const want = today(b.items, b.textures, b.options);
      const k = `${c.key}@${scale}x/${mode}`;
      expect(t.put.map((i) => [i.width, i.height, sha(i.data)]), k).toEqual(want.put.map((i) => [i.width, i.height, sha(i.data)]));
      expect(got.undrawn, k).toEqual(want.undrawn);
      expect([got.width, got.height], k).toEqual([640 * scale, 448 * scale]);
    }
  });
  it('readFrame() is null before a frame, then the frame put (straight RGBA); undrawn() the last frame\'s', () => {
    const t = fakeTarget();
    const p = new CpuUiPresenter(t);
    expect(p.kind).toBe('cpu');
    expect(p.readFrame()).toBeNull();
    expect(p.undrawn()).toEqual([]);
    const c = UI_RASTER_CASES.find((k) => k.id === 10)!;
    const { items, textures, options } = caseRasterInputs(c, 1, 'transparent');
    p.present(items, textures, options);
    const f = p.readFrame()!;
    expect([f.width, f.height]).toEqual([640, 448]);
    expect(sha(f.data)).toBe(sha(t.put[0]!.data));
    expect(p.undrawn()).toEqual(c.undrawn);
    p.present([], textures, {});
    expect(p.undrawn()).toEqual([]);
    expect(sha(p.readFrame()!.data)).toBe(sha(t.put[1]!.data));
  });
  it('fit hears the frame\'s size before the put (the overlay\'s canvas follows its frame)', () => {
    const order: string[] = [];
    const t = { createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => { order.push('put'); } };
    const p = new CpuUiPresenter(t, { fit: (w, h) => { order.push(`fit ${w}x${h}`); } });
    p.present([], () => null, { scale: 2 });
    expect(order).toEqual(['fit 1280x896', 'put']);
  });
  it('a timing probe hears raster and present apart, three reads of its clock, as `FrontEndSession.render` gave it (GM-02)', () => {
    let n = 0;
    const seen: [number, number][] = [];
    const p = new CpuUiPresenter(fakeTarget());
    p.present([], () => null, {}, { now: () => (n += 1), rendered: (r, q) => seen.push([r, q]) });
    expect([n, seen]).toEqual([3, [[1, 1]]]);
  });
  it('GM-09 review F2: holds no frame between presents; readFrame() reads the canvas back, whole, only when asked', () => {
    const t = fakeTarget();
    const p = new CpuUiPresenter(t);
    const c = UI_RASTER_CASES.find((k) => k.id === 10)!;
    const { items, textures, options } = caseRasterInputs(c, 2, 'opaque');
    p.present(items, textures, options);
    expect(t.reads).toEqual([]);
    expect(Object.values(p).some((v) => v !== null && typeof v === 'object' && 'data' in (v as object))).toBe(false);
    const f = p.readFrame()!;
    expect(t.reads).toEqual([[0, 0, 1280, 896]]);
    expect([f.width, f.height, sha(f.data)]).toEqual([1280, 896, sha(t.put[0]!.data)]);
    // A target with no read-back (not a 2D context) and no retain: nothing to read.
    const bare = new CpuUiPresenter({ createImageData: t.createImageData, putImageData: () => {} });
    bare.present([], () => null, {});
    expect(bare.readFrame()).toBeNull();
    expect(bare.undrawn()).toEqual([]);
  });
  it('GM-09 review F5: the CPU presenter refuses `preDivide` (a read-only comparison frame; the page shows the divided one)', () => {
    const t = fakeTarget();
    const p = new CpuUiPresenter(t);
    const c = UI_RASTER_CASES.find((k) => k.id === 4)!;
    const { items, textures, options } = caseRasterInputs(c, 1, 'transparent');
    expect(() => p.present(items, textures, { ...options, preDivide: true })).toThrow(/preDivide/);
    expect(t.put).toEqual([]);
    expect(p.readFrame()).toBeNull();
  });
  it('retain (a test ask): holds one frame at most, the last let go before the next raster (no second frame held across it)', () => {
    let held: Rgba | null = null;
    // A target with no read-back, so readFrame() shows only what the presenter itself holds.
    const { createImageData, putImageData } = fakeTarget();
    const p = new CpuUiPresenter({ createImageData, putImageData }, { retain: true });
    p.present([], () => null, {});
    const first = p.readFrame();
    const textures: UiTextures = () => { held = p.readFrame(); return null; };
    p.present([{ kind: 'sprite', node: 'n', texture: 'x.tif', x0: 0, y0: 0, x1: 2, y1: 2, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null }], textures, {});
    expect(first).not.toBeNull();
    expect(held).toBeNull();
    expect(p.readFrame()).not.toBe(first);
  });
});

describe('GM-09: FrontEndSession.render goes through the presenter', { timeout: 30_000 }, () => {
  const design = (): DialogDesign => ({ libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings: [], controls: [], objects: [], scripts: [], models: [], dropped: [] });
  const disc: FrontEndDisc = { dialog: (n) => (n === 'dlgMenu.rdr' ? design() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] };
  const quad = (texture: string): UiDrawItem => ({ kind: 'sprite', node: 'n', texture, x0: 0, y0: 0, x1: 2, y1: 2, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null });
  const bitmap: UiBitmap = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };

  it('a canvas target (the taunt editor\'s and the page\'s call): the frame put is today\'s; readFrame() and undrawn() are that frame\'s', () => {
    const s = new FrontEndSession({ disc, loader: false, textures: (n) => (n === 'x.tif' ? bitmap : null) });
    expect(s.readFrame()).toBeNull();
    expect(s.undrawn()).toEqual([]);
    s.last = [quad('x.tif'), quad('y.tif')];
    const t = fakeTarget();
    const { undrawn } = s.render(t);
    const want = today(s.last, (n) => (n === 'x.tif' ? bitmap : null), {});
    expect(t.put.map((i) => sha(i.data))).toEqual(want.put.map((i) => sha(i.data)));
    expect(undrawn).toEqual(['n: no bitmap y.tif']);
    expect(s.undrawn()).toEqual(['n: no bitmap y.tif']);
    expect(sha(s.readFrame()!.data)).toBe(sha(t.put[0]!.data));
  });
  it('at a scale, with a quad cache, the frame is today\'s at that scale', () => {
    const s = new FrontEndSession({ disc, loader: false, textures: (n) => (n === 'x.tif' ? bitmap : null) });
    s.last = [quad('x.tif')];
    const t = fakeTarget();
    s.render(t, undefined, { scale: 2, quadCache: new UiQuadRasterCache() });
    const want = today(s.last, (n) => (n === 'x.tif' ? bitmap : null), { scale: 2, quadCache: new UiQuadRasterCache() });
    expect(t.put.map((i) => [i.width, i.height, sha(i.data)])).toEqual(want.put.map((i) => [i.width, i.height, sha(i.data)]));
  });
  it('one presenter per target: the same target keeps it, a new target gets its own', () => {
    const s = new FrontEndSession({ disc, loader: false });
    s.last = [];
    const a = fakeTarget(), b = fakeTarget();
    s.render(a);
    const first = s.presenter;
    s.render(a);
    expect(s.presenter).toBe(first);
    s.render(b);
    expect(s.presenter).not.toBe(first);
    expect([a.put.length, b.put.length]).toEqual([2, 1]);
  });
  it('a UiPresenter handed in draws the list with the session\'s textures and options (GM-11a-1\'s seat)', () => {
    const s = new FrontEndSession({ disc, loader: false, textures: (n) => (n === 'x.tif' ? bitmap : null) });
    s.last = [quad('x.tif')];
    const calls: { items: readonly UiDrawItem[]; tex: UiBitmap | null; o: RasterOptions | undefined }[] = [];
    const fake: UiPresenter = {
      kind: 'cpu',
      present: (items, textures, o) => { calls.push({ items, tex: textures('x.tif'), o }); return { undrawn: ['fake'], width: 1, height: 1 }; },
      readFrame: () => null,
      undrawn: () => ['fake'],
    };
    expect(s.render(fake, undefined, { scale: 2 }).undrawn).toEqual(['fake']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.items).toBe(s.last);
    expect(calls[0]!.tex).toBe(bitmap);
    expect(calls[0]!.o).toMatchObject({ scale: 2, uiSampling: undefined });
    expect(s.presenter).toBe(fake);
  });
  it('the taunt editor\'s caller is unchanged (tauntEditor.ts: `s.render(ctx)` on a 2D context)', () => {
    expect(src('tauntEditor.ts')).toContain('      if (s.advance(now) > 0 && ctx) s.render(ctx);');
  });
  it('the front end, the overlay: no raster or present of their own outside the presenter', () => {
    const fe = src('frontEnd.ts'), ns = src('nativeSettings.ts');
    expect(fe).not.toMatch(/rasterizeUiDrawList\(|presentUiFrame\(/);
    expect(ns).not.toMatch(/rasterizeUiDrawList\(|presentUiFrame\(/);
    expect(fe).toMatch(/new CpuUiPresenter\(/);
    expect(ns).toMatch(/new CpuUiPresenter\(/);
  });
});

describe.skipIf(!FRONT_END_PRESENT)(`GM-09: the Settings overlay's readFrame() and undrawn()${FRONT_END_PRESENT ? '' : ` (${FIXTURES_ABSENT})`}`, { timeout: 30_000 }, () => {
  const pattern = (w: number, h: number, seed: number): Rgba => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([(i * 37 + seed) & 255, (i * 91 + seed * 3) & 255, (i * 13 + seed * 7) & 255, 255], i * 4);
    return { width: w, height: h, data };
  };
  const textures = (name: string): UiBitmap | null => (name.toLowerCase().includes('missing') ? null : pattern(8, 8, name.length));
  function fakeDoc() {
    const presented: Put[] = [];
    const target = {
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (img: Put) => { presented.push({ width: img.width, height: img.height, data: img.data.slice() }); },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: presented.at(-1)!.data.slice() }),
    };
    const doc = {
      createElement: () => ({ width: 300, height: 150, dataset: {}, style: { filter: '', removeProperty() {} }, isConnected: true,
        addEventListener() {}, removeEventListener() {}, ownerDocument: { defaultView: null }, remove() {}, getContext: () => target,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 448 }) }),
      body: { append() {} },
    } as unknown as Document;
    return { doc, presented };
  }
  let d: FrontEndDisc | null = null;

  it('null while closed; open, the frame last presented (transparent, straight) and its undrawn; null again once closed', async () => {
    d ??= await readFrontEndDisc(new FsAssetSource(FIXTURES));
    const disc_ = d;
    const f = fakeDoc();
    const state = pageNativeOptionsState(disc_, new CardSlots(() => null, () => {}), new ControllerConfigs());
    const settings = new NativeSettings({ doc: f.doc, load: async () => ({ assets: { disc: disc_, textures }, state }) });
    expect(settings.readFrame()).toBeNull();
    expect(settings.undrawn()).toEqual([]);
    await settings.preload();
    settings.open();
    for (let i = 0; i < 20; i++) settings.frame(1000 + i * 33.4, new Set());
    const last = f.presented.at(-1)!;
    const frame = settings.readFrame()!;
    expect([frame.width, frame.height]).toEqual([640, 448]);
    expect(sha(frame.data)).toBe(sha(last.data));
    expect(Array.isArray(settings.undrawn())).toBe(true);
    settings.close(); state.dispose?.();
    expect(settings.readFrame()).toBeNull();
    expect(settings.undrawn()).toEqual([]);
  });
});

describe('GM-09: the loading panel\'s readFrame() and undrawn()', () => {
  const layout = parseUiLayout([[
    'SCREENS', [
      'LIBRARY', ['common/assetlib/loading'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['LittleBlack.tif']], 'FONT', ['font_text_01'],
      'OBJECTS', [
        ['NAME', ['LoadingPicture'], 'TYPE', ['IMAGE'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['XSIZE', ['580'], 'YSIZE', ['210'], 'UIVAR', ['NAME', ['load_picture']]]],
        ['NAME', ['load_CD_Parent'], 'TYPE', ['IMAGE'], 'XPOS', ['590'], 'YPOS', ['360'], 'SPEC', ['XSIZE', ['40'], 'YSIZE', ['40']]],
        ['NAME', ['load_CD_spinning'], 'TYPE', ['IMAGE'], 'XPOS', ['-15'], 'YPOS', ['-15'], 'SPEC', ['CHILDOF', ['load_CD_Parent'], 'FILENAME', ['loading_CD.tif'], 'XSIZE', ['30'], 'YSIZE', ['30']]],
      ],
    ],
  ]]);
  const face = (): FontFace => {
    const glyphs: FontGlyph[] = [];
    for (let c = 32; c < 127; c++) glyphs.push({ code: c, texture: 1, baseline: 0, color: null, ul: [c * 2, 0], lr: [c * 2 + 10, 25], disp: [0, 0], hscale: 1, vscale: 1 });
    return { name: 'font_text_01', textures: ['font_text_01.tif'], xspacing: 0, opacity: 0.7, scale: 1, topy: null, boty: null, dropShadow: null, glyphs };
  };
  const solid = (w: number, h: number): Rgba => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(200) });
  const screen = (bitmaps: [string, Rgba][]): LoadingScreen => ({
    map: 'RUN/MP2.ZDB', layout, libraries: [], spin: null, fade: null, fonts: [face()], unheld: [], missing: [],
    binding: { title: 'FROSTFIRE', description: ' ', picture: 'ld_mp2_prog.tif', library: 'ui/assetlib/ld/om02', stem: 'OM02', vars: new Map([['load_picture', 'ld_mp2_prog.tif']]) },
    strings: [], bitmaps,
  } as unknown as LoadingScreen);
  /**
   * The panel's canvas: a 2D context (while `ctx` is true) whose `getImageData` reads the last frame put back, counting
   * its reads. GM-22: the panel draws through `CpuUiPresenter` (no tint canvases any more), so one canvas is made.
   */
  function fakeDoc() {
    const reads: number[][] = [];
    const o = { ctx: true };
    let last: { width: number; height: number; data: Uint8ClampedArray } | null = null;
    let made = 0;
    const make = (tag: string): unknown => {
      if (tag !== 'canvas') return { hidden: false, id: '', setAttribute() {}, append() {} };
      made++;
      const ctx = {
        createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: (img: { width: number; height: number; data: Uint8ClampedArray }) => { last = { width: img.width, height: img.height, data: img.data.slice() }; },
        getImageData: (x: number, y: number, w: number, h: number) => { reads.push([x, y, w, h]); return { width: w, height: h, data: last!.data.slice() }; },
      };
      return { width: 300, height: 150, style: {}, append() {}, getContext: () => (o.ctx ? ctx : null) };
    };
    return { doc: { createElement: make, body: { append() {} } } as unknown as Document, reads, o, made: () => made, last: () => last };
  }

  // A bitmap the screen does not hold is never a quad (`armoryQuads` places none without its size): it is the screen's
  // `missing` or `unheld` (`stats()`). GM-22 (re-pinned): the panel's frame is its presenter's (`CpuUiPresenter`, the
  // menus' rasteriser), read back from the canvas; with no 2D context nothing is drawn or read (it had tint canvases
  // whose missing context it named `no canvas <name>`; they went with the Canvas 2D path).
  it('hidden: no frame and nothing undrawn; shown: the canvas read whole through the presenter; no 2D context: no frame', () => {
    const f = fakeDoc();
    const panel = new LoadingPanel(f.doc);
    expect(panel.readFrame()).toBeNull();
    expect(panel.undrawn()).toEqual([]);
    const all: [string, Rgba][] = [['littleblack.tif', solid(8, 8)], ['ld_mp2_prog.tif', solid(64, 32)], ['loading_cd.tif', solid(32, 32)], ['font_text_01.tif', solid(256, 32)]];
    panel.show(screen(all));
    panel.redraw();
    expect(f.made()).toBe(1);                                                // one canvas: no tint canvases
    expect(panel.undrawn()).toEqual([]);
    const frame = panel.readFrame()!;
    expect([frame.width, frame.height, frame.data.length]).toEqual([640, 448, 640 * 448 * 4]);
    expect(f.reads.at(-1)).toEqual([0, 0, 640, 448]);
    expect(sha(frame.data)).toBe(sha(f.last()!.data));
    panel.hide();
    expect(panel.readFrame()).toBeNull();
    expect(panel.undrawn()).toEqual([]);
    const g = fakeDoc();
    g.o.ctx = false;
    const blind = new LoadingPanel(g.doc);
    blind.show(screen(all));
    blind.redraw();
    expect([blind.readFrame(), blind.undrawn(), g.last()]).toEqual([null, [], null]);
  });
  // GM-09 review F4: the `no bitmap` side. The panel builds its quads' sizes and its bitmaps from the same
  // `screen.bitmaps` (`show`), so through its API every quad's bitmap is held; reached here by letting one bitmap go
  // behind the panel's back (a private field). GM-22 (re-pinned): the string is the compositor's, `<node>: no bitmap
  // <name>`, as the front end's and the overlay's are (it was the panel's own `no bitmap <name>`).
  it('a quad whose bitmap is not held is named `<node>: no bitmap <name>` by the compositor, at scale 1 and under HD', () => {
    for (const hd of [undefined, () => ({ scale: 2, hd: () => null })]) {
      const f = fakeDoc();
      const panel = hd ? new LoadingPanel(f.doc, hd) : new LoadingPanel(f.doc);
      const all: [string, Rgba][] = [['littleblack.tif', solid(8, 8)], ['ld_mp2_prog.tif', solid(64, 32)], ['loading_cd.tif', solid(32, 32)], ['font_text_01.tif', solid(256, 32)]];
      panel.show(screen(all));
      panel.redraw();
      expect(panel.undrawn()).toEqual([]);
      (panel as unknown as { bitmaps: Map<string, Rgba> }).bitmaps.delete('loading_cd.tif');
      panel.redraw();
      expect(panel.undrawn()).toEqual(['load_CD_spinning: no bitmap loading_cd.tif']);
    }
  });
});
