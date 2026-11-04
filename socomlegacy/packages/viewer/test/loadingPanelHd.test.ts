import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import type { Rgba } from '@s2u/gs';
import { parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import type { LoadingSpin } from '@s2u/ui/loading';
import type { LoadingScreen } from '../src/loadingAssets';
import { LoadingPanel } from '../src/loadingPanel';
import type { UiBitmap, UiHdTextures } from '../src/uiCompositorView';

// HD-4 (OT.R92, HD.R8; a browser adaptation, only under HD (GoE Soul)): the loading screen drawn at the HD pack's scale,
// each bitmap the pack replaces drawn from its HD texels -- the panel's own Canvas 2D path (it has no compositor), its
// quads' places in the 640 x 448 frame unchanged. Without the option the panel's drawing is today's, call for call.

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

/** A document whose canvases record every 2D call: the panel's own canvas and each tinted bitmap's. */
function fakeDoc() {
  const log: string[] = [];
  let n = 0;
  const sha = (d: Uint8ClampedArray): string => createHash('sha256').update(d).digest('hex').slice(0, 16);
  type Fake = { id: number; width: number; height: number; pixels: string; style: Record<string, string>; append(): void; getContext(): unknown };
  const canvases: Fake[] = [];
  const make = (tag: string): unknown => {
    if (tag !== 'canvas') return { hidden: false, id: '', setAttribute() {}, append() {} };
    const c: Fake = { id: n++, width: 300, height: 150, pixels: '', style: {}, append() {}, getContext: () => ctx };
    const main = c.id === 0;
    const ctx = {
      _alpha: 1, fillStyle: '',
      get globalAlpha() { return this._alpha; },
      set globalAlpha(v: number) { this._alpha = v; if (main) log.push(`alpha ${v}`); },
      fillRect: (...r: number[]) => { if (main) log.push(`fill ${String(ctx.fillStyle)} ${r.join(',')}`); },
      setTransform: (...m: number[]) => { if (main) log.push(`transform ${m.join(',')}`); },
      drawImage: (img: Fake, ...r: number[]) => { log.push(`draw [${img.width}x${img.height} ${img.pixels}] ${r.map((v) => +v.toFixed(4)).join(',')}`); },
      putImageData: (d: { data: Uint8ClampedArray }) => { c.pixels = sha(d.data); },
    };
    canvases.push(c);
    return c;
  };
  const doc = { createElement: make, body: { append() {} } } as unknown as Document;
  return { doc, log, canvases };
}

class FakeImageData { data: Uint8ClampedArray; constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4); } }
const had = (globalThis as { ImageData?: unknown }).ImageData;
beforeAll(() => { (globalThis as { ImageData?: unknown }).ImageData = FakeImageData; });
afterAll(() => { (globalThis as { ImageData?: unknown }).ImageData = had; });

const logSha = (log: string[]): string => createHash('sha256').update(log.join('\n')).digest('hex');
function drawn(hd?: () => { scale: number; hd?: UiHdTextures }) {
  const f = fakeDoc();
  const panel = hd ? new LoadingPanel(f.doc, hd) : new LoadingPanel(f.doc);
  panel.show(screen());
  panel.redraw();
  return { log: f.log, canvas: f.canvases[0]! };
}

/** Today's drawing (agent/hd-menus 3a2933c33, before HD-4), taken from the panel as it stood. */
const TODAY = '428fb8641efefd9b7d0484867587e3a96fb047f687312b2e2435286321fd0e3c';

describe('HD-4: the loading screen with the pack off draws as today, call for call', () => {
  it('no option, and an option at scale 1, give today\'s calls on a 640 x 448 canvas', () => {
    const off = drawn();
    expect(off.log.length).toBeGreaterThan(20);
    expect([off.canvas.width, off.canvas.height]).toEqual([640, 448]);
    expect(logSha(off.log)).toBe(TODAY);
    expect(logSha(drawn(() => ({ scale: 1 })).log)).toBe(TODAY);
  });
});

describe('HD-4: the loading screen under HD (GoE Soul) draws at the pack\'s scale', () => {
  const picture = bitmaps[1]![1];
  const hdPicture = pattern(256, 128, 9);
  it('a 2560 x 1792 canvas under a 4x transform, the replaced bitmap drawn from its HD texels at the same frame place', () => {
    const asked: UiBitmap[] = [];
    const on = drawn(() => ({ scale: 4, hd: (b) => { asked.push(b); return b === picture ? hdPicture : null; } }));
    expect([on.canvas.width, on.canvas.height]).toEqual([2560, 1792]);
    expect(on.log).toContain('transform 4,0,0,4,0,0');
    expect(asked).toContain(picture);                                          // keyed by the panel's own top-row-first bitmap
    const pic = on.log.filter((l) => l.startsWith('draw [256x128'));
    expect(pic).toHaveLength(2);                                               // the show's draw and the redraw
    // The source rectangle in HD texels (the original's on the 64 x 32 bitmap, times 4), the destination as the original's.
    const was = drawn().log.find((l) => l.startsWith('draw [64x32'))!.split('] ')[1]!.split(',').map(Number);
    const now = pic[0]!.split('] ')[1]!.split(',').map(Number);
    expect(now.slice(0, 4)).toEqual(was.slice(0, 4).map((v) => +(v * 4).toFixed(4)));
    expect(now.slice(4)).toEqual(was.slice(4));
    expect(now.slice(4)).toEqual([30, 120, 580, 210]);
    expect(on.log.some((l) => l.startsWith('draw [64x32'))).toBe(false);
  });
  it('with no replacement every bitmap still draws, the originals at their own texels under the 4x transform', () => {
    const off = drawn(), none = drawn(() => ({ scale: 4, hd: () => null }));
    expect([none.canvas.width, none.canvas.height]).toEqual([2560, 1792]);
    const draws = (log: string[]): string[] => log.filter((l) => l.startsWith('draw '));
    expect(draws(none.log)).toEqual(draws(off.log));
    expect(none.log.filter((l) => l.startsWith('fill '))).toEqual(off.log.filter((l) => l.startsWith('fill ')));
  });
});

describe('HD-4: the front end hands its loading screen the menus\' own pack', () => {
  it('`./frontEnd`\'s panel takes `hdMenus`\' options; the test room\'s (`./main`) takes none', () => {
    const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
    expect(src('frontEnd.ts')).toMatch(/new LoadingPanel\(doc, \(\) => hdMenus\?\.options\(\) \?\? \{ scale: 1 \}\)/);
    expect(src('loadingPanel.ts')).toMatch(/const panel = new LoadingPanel\(doc\);/);
  });
});
