import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import type { Rgba } from '@s2u/gs';
import { parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import type { UiDrawItem } from '@s2u/ui';
import { loadingFaderAlpha, type LoadingFade, type LoadingSpin } from '@s2u/ui/loading';
import type { LoadingScreen } from '../src/loadingAssets';
import { loadingQuads } from '../src/loadingLayout';
import { LOADING_TEXTURE_BLEND_READING, LoadingPanel, loadingBitmap } from '../src/loadingPanel';
import { rasterizeUiDrawList, type RasterOptions, type UiHdTextures, type UiTextures } from '../src/uiCompositorView';

/**
 * GM-22, the code step (research 380 §4, `LOADING_PANEL_ALPHA_CLAMP_READING`; plan 2026-11-01-gpu-menus): the original
 * builds the loading screen as a menu -- the same `CGameMenu` constructor `FUN_00369b60` and builder `FUN_00368570`
 * (LoadState `FUN_001f6660` D:L55818, D:L55826) -- and draws it through the menus' walker (LoadState's Tick
 * `FUN_001f5e70` D:L55769 -> `FUN_003691c0` -> `FUN_00336c10(0x4887c0, ...)` D:L264266-264274). So the panel's quads
 * follow the menus' compositor rules (research 380 §2, P1-P23): its frame is the menus' rasteriser's frame for the
 * same quads -- each a sprite of its bitmap (texels over the bitmap's size, the GS colour and alpha) in
 * `loadingQuads`' order, MENUFADER last as an untextured black quad at `loadingFaderAlpha` -- at scale 1 and at an HD
 * scale with the pack's lookup, and an alpha over 128 is blended as it stands (P8-P10), not clamped at 128.
 *
 * The expected draw list is written here from those rules, independently of the panel's own code.
 */

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'LIBRARY', ['common/assetlib/loading'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['LittleBlack.tif']], 'FONT', ['font_text_01'],
    'OBJECTS', [
      obj('NAME', ['LoadingPicture'], 'TYPE', ['IMAGE'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['XSIZE', ['580'], 'YSIZE', ['210'], 'UIVAR', ['NAME', ['load_picture']]]),
      obj('NAME', ['title'], 'TYPE', ['TEXT'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['COLOR', ['14', '57', '65'], 'SCALE', ['1.2'], 'UIVAR', ['NAME', ['mission_title']]]),
      obj('NAME', ['load_CD_Parent'], 'TYPE', ['IMAGE'], 'XPOS', ['590'], 'YPOS', ['360'], 'SPEC', ['XSIZE', ['40'], 'YSIZE', ['40']]),
      obj('NAME', ['load_CD_spinning'], 'TYPE', ['IMAGE'], 'XPOS', ['-15'], 'YPOS', ['-15'], 'SPEC', ['CHILDOF', ['load_CD_Parent'], 'FILENAME', ['loading_CD.tif'], 'XSIZE', ['30'], 'YSIZE', ['30']]),
    ],
  ],
]]);
function face(opacity: number): FontFace {
  const glyphs: FontGlyph[] = [];
  for (let c = 32; c < 127; c++) glyphs.push({ code: c, texture: 1, baseline: 0, color: null, ul: [c * 2, 0], lr: [c * 2 + 10, 25], disp: [0, 0], hscale: 1, vscale: 1 });
  return { name: 'font_text_01', textures: ['font_text_01.tif'], xspacing: 0, opacity, scale: 1, topy: null, boty: null, dropShadow: null, glyphs };
}
const SPIN: LoadingSpin = {
  node: 'load_CD_Parent', loops: true, period: 1.5, segments: [
    { from: [1.1, 1.1, 0], to: [0, 1, 0], rate: [-1.1 / 0.75, -0.1 / 0.75, 0], seconds: 0.75 },
    { from: [0, 1, 0], to: [1.1, 1.1, 0], rate: [1.1 / 0.75, 0.1 / 0.75, 0], seconds: 0.75 },
  ],
};
const FADE: LoadingFade = { node: 'MENUFADER', from: 1, to: 0, rate: -1 / 1.5, seconds: 1.5 };
const pattern = (w: number, h: number, seed: number, alpha = 255): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([(i * 37 + seed) & 255, (i * 91 + seed * 3) & 255, (i * 13 + seed * 7) & 255, alpha], i * 4);
  return { width: w, height: h, data };
};
const bitmaps = (): [string, Rgba][] => [
  ['littleblack.tif', pattern(8, 8, 1)], ['ld_mp2_prog.tif', pattern(64, 32, 2)], ['loading_cd.tif', pattern(32, 32, 3, 200)], ['font_text_01.tif', pattern(256, 32, 4)],
];
const screen = (o: { opacity?: number; fade?: LoadingFade | null; bitmaps?: [string, Rgba][] } = {}): LoadingScreen => ({
  map: 'RUN/MP2.ZDB', layout, libraries: [], spin: SPIN, fade: o.fade ?? null, fonts: [face(o.opacity ?? 0.7)], unheld: [], missing: [],
  binding: { title: 'FROSTFIRE', description: ' ', picture: 'ld_mp2_prog.tif', library: 'ui/assetlib/ld/om02', stem: 'OM02', vars: new Map([['mission_title', 'FROSTFIRE'], ['load_picture', 'ld_mp2_prog.tif'], ['mission_description', ' ']]) },
  strings: [], bitmaps: o.bitmaps ?? bitmaps(),
});

interface Put { width: number; height: number; data: Uint8ClampedArray }
/**
 * A document whose panel canvas has a 2D context that records each `putImageData` (Node has no canvas) and reads the last
 * one back; every other 2D call is a no-op, so a panel drawn any other way puts nothing. The clock is the test's.
 */
function fakeDoc(clock: { now: number }) {
  const puts: Put[] = [];
  let n = 0;
  const canvases: { width: number; height: number }[] = [];
  const make = (tag: string): unknown => {
    if (tag !== 'canvas') return { hidden: false, id: '', setAttribute() {}, append() {} };
    const main = n++ === 0;
    const c = { width: 300, height: 150, style: {}, append() {}, getContext: () => ctx };
    canvases.push(c);
    const ctx = {
      globalAlpha: 1, fillStyle: '', fillRect() {}, setTransform() {}, drawImage() {},
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (img: Put) => { if (main) puts.push({ width: img.width, height: img.height, data: img.data.slice() }); },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: (puts.at(-1)?.data ?? new Uint8ClampedArray(w * h * 4)).slice() }),
    };
    return c;
  };
  const view = { performance: { now: () => clock.now } };
  const doc = { createElement: make, body: { append() {} }, defaultView: view } as unknown as Document;
  return { doc, puts, canvases };
}

/** The expected draw list, from the rules above: each quad a sprite of its bitmap, MENUFADER last. */
function expectedList(s: LoadingScreen, t: number): UiDrawItem[] {
  const sizes = Object.fromEntries(s.bitmaps.map(([name, r]) => [name, { width: r.width, height: r.height }]));
  const items: UiDrawItem[] = loadingQuads({ screen: s, sizes, t }).map((q) => {
    const z = sizes[q.texture]!;
    return {
      kind: 'sprite', node: q.object, texture: q.texture, x0: q.x, y0: q.y, x1: q.x + q.w, y1: q.y + q.h,
      u0: q.u0 / z.width, v0: q.v0 / z.height, u1: q.u1 / z.width, v1: q.v1 / z.height,
      rgba: [q.rgb[0], q.rgb[1], q.rgb[2], q.alpha], clip: null,
    };
  });
  items.push({ kind: 'sprite', node: 'MENUFADER', texture: null, x0: 0, y0: 0, x1: 640, y1: 448, u0: 0, v0: 0, u1: 0, v1: 0, rgba: [0, 0, 0, loadingFaderAlpha(s.fade, t)], clip: null });
  return items;
}
const texturesOf = (s: LoadingScreen): UiTextures => { const m = new Map(s.bitmaps); return (name) => m.get(name) ?? null; };
const expectedFrame = (s: LoadingScreen, t: number, o: RasterOptions = {}): Rgba => rasterizeUiDrawList(expectedList(s, t), texturesOf(s), o).frame;

/** The panel shown at 0 and drawn at `t` seconds: the last frame it put on its canvas. */
function panelFrame(s: LoadingScreen, t: number, hd?: () => { scale: number; hd?: UiHdTextures }) {
  const clock = { now: 1000 };
  const f = fakeDoc(clock);
  const panel = hd ? new LoadingPanel(f.doc, hd) : new LoadingPanel(f.doc);
  panel.show(s);
  clock.now = 1000 + t * 1000;
  panel.redraw();
  return { put: f.puts.at(-1), canvas: f.canvases[0]!, panel };
}
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

describe('GM-22: the loading panel draws its quads through the menus\' compositor', () => {
  it('scale 1: the panel\'s frame is the compositor\'s frame for the same quads, the fader over them', () => {
    const s = screen({ fade: FADE });
    for (const t of [0.3, 0.75, 2]) {
      const { put, canvas } = panelFrame(s, t);
      expect(put, `t ${t}: the panel put no frame`).toBeDefined();
      const want = expectedFrame(s, t);
      expect([put!.width, put!.height, canvas.width, canvas.height]).toEqual([640, 448, 640, 448]);
      expect(same(put!.data, want.data), `t ${t}`).toBe(true);
    }
    // An option at scale 1 (the front end's with the pack off) is the same frame.
    const one = panelFrame(s, 0.75, () => ({ scale: 1 }));
    expect(same(one.put!.data, expectedFrame(s, 0.75).data)).toBe(true);
  });

  it('an HD scale with the pack\'s lookup: the compositor\'s frame at that scale, the replaced bitmap from its HD texels', () => {
    const s = screen();
    const picture = s.bitmaps[1]![1];
    const hdPicture = pattern(256, 128, 9);
    const hd: UiHdTextures = (b) => (b.data === picture.data ? hdPicture : null);   // by texels: the panel hands its blend-tagged copy
    const { put, canvas } = panelFrame(s, 0.4, () => ({ scale: 2, hd }));
    expect(put).toBeDefined();
    const want = expectedFrame(s, 0.4, { scale: 2, hd });
    expect([put!.width, put!.height, canvas.width, canvas.height]).toEqual([1280, 896, 1280, 896]);
    expect(same(put!.data, want.data)).toBe(true);
    // The lookup mattered: without it the frame differs inside the picture.
    expect(same(want.data, expectedFrame(s, 0.4, { scale: 2 }).data)).toBe(false);
  });

  it('an alpha over 128 is blended as it stands (P8-P10), not clamped at 128', () => {
    const s = screen({ opacity: 1.5 });
    const sizes = Object.fromEntries(s.bitmaps.map(([name, r]) => [name, { width: r.width, height: r.height }]));
    expect(loadingQuads({ screen: s, sizes, t: 0.1 }).filter((q) => q.texture === 'font_text_01.tif').map((q) => q.alpha).every((a) => a === 192)).toBe(true);
    const { put } = panelFrame(s, 0.1);
    expect(put).toBeDefined();
    expect(same(put!.data, expectedFrame(s, 0.1).data)).toBe(true);
    // The clamp would draw another frame: the same list with every alpha held to 128.
    const clamped = expectedList(s, 0.1).map((it) => (it.kind === 'sprite' ? { ...it, rgba: [it.rgba[0], it.rgba[1], it.rgba[2], Math.min(128, it.rgba[3])] as [number, number, number, number] } : it));
    const clampedFrame = rasterizeUiDrawList(clamped, texturesOf(s)).frame;
    expect(same(put!.data, clampedFrame.data)).toBe(false);
  });

  // GM-22 review F3: the named reading drives the frame -- the panel's bitmaps carry `blend` from
  // LOADING_TEXTURE_BLEND_READING (`loadingBitmap`), which the compositor's bind reads (`blendAfterBind`).
  it('LOADING_TEXTURE_BLEND_READING drives the bind: another blend draws another frame; the panel draws the reading\'s', () => {
    expect(LOADING_TEXTURE_BLEND_READING).toBe('source');
    const s = screen();
    const raw = s.bitmaps[1]![1];
    const tagged = loadingBitmap(raw);
    expect([tagged.blend, tagged.data === raw.data, tagged.width, tagged.height]).toEqual(['source', true, raw.width, raw.height]);
    const as = (blend: 'source' | 'additive'): Rgba => {
      const m = new Map(s.bitmaps.map(([n, r]) => [n, loadingBitmap(r, blend)]));
      return rasterizeUiDrawList(expectedList(s, 0.4), (name) => m.get(name) ?? null).frame;
    };
    const source = as('source'), additive = as('additive');
    expect(same(source.data, additive.data)).toBe(false);                   // the value matters to the frame
    const { put } = panelFrame(s, 0.4);
    expect(same(put!.data, source.data)).toBe(true);                       // the panel draws under the reading's value
  });
});
