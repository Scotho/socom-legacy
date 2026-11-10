import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import type { Rgba } from '@s2u/gs';
import { parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import { loadingFaderAlpha, type LoadingSpin } from '@s2u/ui/loading';
import type { LoadingScreen } from '../src/loadingAssets';
import { loadingQuads } from '../src/loadingLayout';
import { LoadingPanel, loadingDrawList } from '../src/loadingPanel';
import { rasterizeUiDrawList, type RasterOptions, type UiBitmap, type UiHdTextures, type UiTextures } from '../src/uiCompositorView';

// HD-4 (OT.R92, HD.R8; a browser adaptation, only under HD (GoE Soul)): the loading screen drawn at the HD pack's scale,
// each bitmap the pack replaces drawn from its HD texels, its quads' places in the 640 x 448 frame unchanged. Since
// GM-22's code step (research 380 §4) the panel draws through the menus' compositor (HD-3's scale and lookup), no
// longer Canvas 2D; without the option, or at scale 1, it draws the original frame.

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'LIBRARY', ['common/assetlib/loading'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['LittleBlack.tif']], 'FONT', ['font_text_01'],
    'OBJECTS', [
      obj('NAME', ['LoadingPicture'], 'TYPE', ['IMAGE'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['XSIZE', ['580'], 'YSIZE', ['210'], 'UIVAR', ['NAME', ['load_picture']]]),
      obj('NAME', ['title'], 'TYPE', ['TEXT'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['COLOR', ['14', '57', '65'], 'SCALE', ['1.2'], 'UIVAR', ['NAME', ['mission_title']]]),
      obj('NAME', ['ReturnToLobby'], 'TYPE', ['TEXT'], 'XPOS', ['320'], 'YPOS', ['420'], 'SPEC', ['SCALE', ['1.2'], 'COLOR', ['14', '57', '65'], 'HCENTERED', [], 'CAPTION', ['_2000_ToReturn_MSG']]),
      obj('NAME', ['load_CD_Parent'], 'TYPE', ['IMAGE'], 'XPOS', ['590'], 'YPOS', ['360'], 'SPEC', ['XSIZE', ['40'], 'YSIZE', ['40']]),
      obj('NAME', ['load_CD_spinning'], 'TYPE', ['IMAGE'], 'XPOS', ['-15'], 'YPOS', ['-15'], 'SPEC', ['CHILDOF', ['load_CD_Parent'], 'FILENAME', ['loading_CD.tif'], 'XSIZE', ['30'], 'YSIZE', ['30']]),
    ],
  ],
]]);
function face(): FontFace {
  const glyphs: FontGlyph[] = [];
  for (let c = 32; c < 127; c++) glyphs.push({ code: c, texture: 1, baseline: 0, color: null, ul: [c * 2, 0], lr: [c * 2 + 10, 25], disp: [0, 0], hscale: 1, vscale: 1 });
  return { name: 'font_text_01', textures: ['font_text_01.tif'], xspacing: 0, opacity: 0.7, scale: 1, topy: null, boty: null, dropShadow: null, glyphs };
}
const SPIN: LoadingSpin = {
  node: 'load_CD_Parent', loops: true, period: 1.5, segments: [
    { from: [1.1, 1.1, 0], to: [0, 1, 0], rate: [-1.1 / 0.75, -0.1 / 0.75, 0], seconds: 0.75 },
    { from: [0, 1, 0], to: [1.1, 1.1, 0], rate: [1.1 / 0.75, 0.1 / 0.75, 0], seconds: 0.75 },
  ],
};
const pattern = (w: number, h: number, seed: number): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([(i * 37 + seed) & 255, (i * 91 + seed * 3) & 255, (i * 13 + seed * 7) & 255, 255], i * 4);
  return { width: w, height: h, data };
};
const bitmaps: [string, Rgba][] = [['littleblack.tif', pattern(8, 8, 1)], ['ld_mp2_prog.tif', pattern(64, 32, 2)], ['loading_cd.tif', pattern(32, 32, 3)], ['font_text_01.tif', pattern(256, 32, 4)]];
const screen = (): LoadingScreen => ({
  map: 'RUN/MP2.ZDB', layout, libraries: [], spin: SPIN, fade: null, fonts: [face()], unheld: [], missing: [],
  binding: { title: 'FROSTFIRE', description: ' ', picture: 'ld_mp2_prog.tif', library: 'ui/assetlib/ld/om02', stem: 'OM02', vars: new Map([['mission_title', 'FROSTFIRE'], ['load_picture', 'ld_mp2_prog.tif'], ['mission_description', ' ']]) },
  strings: [{ id: 2000, msg: '_2000_ToReturn_MSG', text: 'TO RETURN TO THE LOBBY.' }],
  bitmaps,
});

interface Put { width: number; height: number; data: Uint8ClampedArray }
/**
 * A document whose panel canvas has a 2D context recording each frame the panel puts (Node has no canvas), and whose
 * clock is the test's (ms).
 */
function fakeDoc(clock = { now: 0 }) {
  const puts: Put[] = [];
  let n = 0;
  type Fake = { id: number; width: number; height: number; style: Record<string, string>; append(): void; getContext(): unknown };
  const canvases: Fake[] = [];
  const make = (tag: string): unknown => {
    if (tag !== 'canvas') return { hidden: false, id: '', setAttribute() {}, append() {} };
    const c: Fake = { id: n++, width: 300, height: 150, style: {}, append() {}, getContext: () => ctx };
    const ctx = {
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (d: Put) => { if (c.id === 0) puts.push({ width: d.width, height: d.height, data: d.data.slice() }); },
    };
    canvases.push(c);
    return c;
  };
  const doc = { createElement: make, body: { append() {} }, defaultView: { performance: { now: () => clock.now } } } as unknown as Document;
  return { doc, puts, canvases, clock };
}

const sha = (d: Uint8ClampedArray): string => createHash('sha256').update(d).digest('hex');
/**
 * The redraw's time: 1 s after the show, past the load state's 0.5 s fade from black (`loadStateFaderAlpha`, the fader
 * at 0 with no `fade`), so the frame shows the quads; the show's own draw, at 0, is black under the fader at 128.
 */
const T = 1;
function drawn(hd?: () => { scale: number; hd?: UiHdTextures }) {
  const f = fakeDoc();
  const panel = hd ? new LoadingPanel(f.doc, hd) : new LoadingPanel(f.doc);
  panel.show(screen());
  f.clock.now = T * 1000;
  panel.redraw();
  return { puts: f.puts, canvas: f.canvases[0]! };
}
const textures: UiTextures = (name) => new Map(bitmaps).get(name) ?? null;
const sizes = Object.fromEntries(bitmaps.map(([n, r]) => [n, { width: r.width, height: r.height }]));
/** The menus' rasteriser's frame for the screen's quads at `T`, the fader over them. */
const compositor = (o: RasterOptions = {}): Uint8ClampedArray =>
  rasterizeUiDrawList(loadingDrawList(loadingQuads({ screen: screen(), sizes, t: T }), sizes, loadingFaderAlpha(null, T)), textures, o).frame.data;

/**
 * The scale-1 frame's bytes (GM-22's code step, 2026-11-09). Re-pinned from HD-4's `TODAY` -- the sha of the Canvas 2D
 * calls the panel made (agent/hd-menus 3a2933c33) -- because GM-22 moved the panel off Canvas 2D: research 380 §4
 * (`LOADING_PANEL_ALPHA_CLAMP_READING`, re-read 2026-11-01) reads the original drawing the loading screen through the
 * menus' walker (LoadState's Tick `FUN_001f5e70` D:L55769 -> `FUN_003691c0` -> `FUN_00336c10`), so the panel now puts
 * the menus' rasteriser's frame for its quads (P1-P23). This pins those bytes; `loadingPanelCompositor.test.ts` holds
 * that they are the compositor's for a draw list built from the rules independently.
 */
const TODAY = 'c1fe4afdde7ef43e896d746d1b83c65cdf4e73e355da2aaff40ef67e0ed49cdb';

describe('HD-4: the loading screen with the pack off draws the original frame', () => {
  it('no option, and an option at scale 1, give the same 640 x 448 frame: the compositor\'s for its quads', () => {
    const off = drawn();
    expect(off.puts).toHaveLength(2);                                          // the show's draw and the redraw
    expect([off.canvas.width, off.canvas.height, off.puts[1]!.width, off.puts[1]!.height]).toEqual([640, 448, 640, 448]);
    expect(sha(off.puts[1]!.data)).toBe(TODAY);
    expect(sha(off.puts[1]!.data)).toBe(sha(compositor()));
    expect(off.puts[1]!.data.some((v, i) => i % 4 !== 3 && v !== 0)).toBe(true);   // not the black of the fader at 128
    expect(sha(drawn(() => ({ scale: 1 })).puts[1]!.data)).toBe(TODAY);
    // At scale 1 the lookup is not asked (the original frame), as before GM-22.
    let asked = 0;
    expect(sha(drawn(() => ({ scale: 1, hd: () => { asked++; return null; } })).puts[1]!.data)).toBe(TODAY);
    expect(asked).toBe(0);
  });
});

describe('HD-4: the loading screen under HD (GoE Soul) draws at the pack\'s scale', () => {
  const picture = bitmaps[1]![1];
  const hdPicture = pattern(256, 128, 9);
  it('a 2560 x 1792 frame at 4x, the replaced bitmap drawn from its HD texels at the same frame place', () => {
    const asked: UiBitmap[] = [];
    const hd: UiHdTextures = (b) => { asked.push(b); return b.data === picture.data ? hdPicture : null; };
    const on = drawn(() => ({ scale: 4, hd }));
    expect([on.canvas.width, on.canvas.height, on.puts[1]!.width, on.puts[1]!.height]).toEqual([2560, 1792, 2560, 1792]);
    // Keyed by the panel's own top-row-first texels: since GM-22 review F3 the panel hands its blend-tagged copy of the
    // bitmap (`loadingBitmap`), the same texel array, so the pack (keyed by the bytes) sees the same bitmap.
    expect(asked.some((b) => b.data === picture.data)).toBe(true);
    expect(sha(on.puts[1]!.data)).toBe(sha(compositor({ scale: 4, hd: (b) => (b.data === picture.data ? hdPicture : null) })));
    // The picture's place (30, 120, 580 x 210) at 4x holds the HD texels: the frame differs there from the pack's absence.
    const none = compositor({ scale: 4 });
    const at = (x: number, y: number): number => (y * 2560 + x) * 4;
    const inside = [at(4 * 100, 4 * 200), at(4 * 300, 4 * 150), at(4 * 500, 4 * 300)];
    expect(inside.some((i) => on.puts[1]!.data[i] !== none[i] || on.puts[1]!.data[i + 1] !== none[i + 1])).toBe(true);
    const outside = at(4 * 10, 4 * 10);                                         // the background, not replaced
    expect([...on.puts[1]!.data.slice(outside, outside + 4)]).toEqual([...none.slice(outside, outside + 4)]);
  });
  it('with no replacement every bitmap still draws: the compositor\'s frame at 4x, the canvas back at 640 x 448 at 1', () => {
    const none = drawn(() => ({ scale: 4, hd: () => null }));
    expect([none.canvas.width, none.canvas.height]).toEqual([2560, 1792]);
    expect(sha(none.puts[1]!.data)).toBe(sha(compositor({ scale: 4 })));
    // Back to scale 1 on the same panel: the canvas follows the frame (HD-4), the original frame again.
    const f = fakeDoc();
    let scale = 4;
    const panel = new LoadingPanel(f.doc, () => ({ scale }));
    panel.show(screen());
    expect([f.canvases[0]!.width, f.canvases[0]!.height]).toEqual([2560, 1792]);
    scale = 1; f.clock.now = T * 1000; panel.redraw();
    expect([f.canvases[0]!.width, f.canvases[0]!.height]).toEqual([640, 448]);
    expect(sha(f.puts.at(-1)!.data)).toBe(TODAY);
  });
});

describe('HD-4: the front end hands its loading screen the menus\' own pack', () => {
  it('`./frontEnd`\'s panel takes `hdMenus`\' options; the test room\'s (`./main`) takes none', () => {
    const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
    // GM-23 re-pin (was GM-28's `() => ({ scale: 1 })`): the menus' options again, beside the panel's own GPU surface,
    // which alone draws them; the panel's software draws 1x in every state (`loadingPanelGpu.test.ts`).
    // GM-XBOX1 re-pin (review F1): the menus' options and the GPU option from one `uiGpuSurfaceWiring('loading', ...)`, the
    // 1x option where the GPU's is withheld (the Xbox class), so the panel's software is 1x there too.
    expect(src('frontEnd.ts')).toMatch(/new LoadingPanel\(doc, w\.hd, w\.gpu\)\)\(uiGpuSurfaceWiring\('loading', pageDeviceClass\(\), \(\) => hdMenus\?\.options\(\) \?\? \{ scale: 1 \}, \(\) => \(\{ resolveAt: /);
    expect(src('loadingPanel.ts')).toMatch(/const panel = new LoadingPanel\(doc\);/);
  });
});
