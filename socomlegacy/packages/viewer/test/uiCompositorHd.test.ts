import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiDrawItem, UiModelTriangle, UiModelVertex } from '@s2u/ui';
import { rasterizeUiDrawList, type UiBitmap } from '../src/uiCompositorView';

// HD-3 (OT.R92, HD.R8; plan 2026-10-31-hd-texture-pack-parity): the menus under HD (GoE Soul) -- a browser adaptation.
// The frame drawn at 640 x 448 times a scale, each bitmap the pack replaces sampled from its HD image. Off, the frame
// is today's, byte for byte.

const pattern = (w: number, h: number, seed: number, alpha = 255): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([(i * 37 + seed) & 255, (i * 91 + seed * 3) & 255, (i * 13 + seed * 7) & 255, alpha], i * 4);
  return { width: w, height: h, data };
};
const solid = (w: number, h: number, px: number[]): Rgba => ({ width: w, height: h, data: new Uint8ClampedArray(Array.from({ length: w * h }, () => px).flat()) });
const vtx = (x: number, y: number, invW: number, u: number, v: number): UiModelVertex => ({ x, y, invW, u, v, rgba: [128, 128, 128, 128] });

/** A list that takes every path of the drawer: clear, untextured, sprite (big: the quad cache), additive, clip, glyphs, models, movie black. */
const textures: Record<string, UiBitmap> = {
  'bg.tif': pattern(64, 32, 1), 'panel.tif': pattern(16, 16, 5, 200), 'roller.tif': { ...pattern(32, 32, 9), blend: 'additive' }, 'font.tif': pattern(32, 32, 3),
};
const lookup = (n: string): UiBitmap | null => textures[n] ?? null;
const items: UiDrawItem[] = [
  { kind: 'clear', rgb: [10, 20, 30] },
  { kind: 'sprite', node: 'bg', texture: 'bg.tif', x0: 0, y0: 0, x1: 640, y1: 448, u0: 0.01, v0: 0.01, u1: 0.99, v1: 0.99, rgba: [128, 128, 128, 128], clip: null },
  { kind: 'sprite', node: 'panel', texture: 'panel.tif', x0: 100.5, y0: 50.25, x1: 300, y1: 200, u0: 0.01, v0: 0.01, u1: 0.99, v1: 0.99, rgba: [100, 128, 90, 110], clip: { x0: 120, y0: 60, x1: 280, y1: 180 } },
  { kind: 'sprite', node: 'fill', texture: null, x0: 20, y0: 300, x1: 90, y1: 340, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [60, 70, 80, 90], clip: null },
  { kind: 'models', triangles: [{ node: 'roller', texture: 'roller.tif', cull: true, a: vtx(400, 100, 1, 0, 1), b: vtx(400, 300, 0.5, 0, 0), c: vtx(600, 100, 1, 1, 1) } as UiModelTriangle] },
  { kind: 'sprite', node: 'fader', texture: null, x0: 0, y0: 0, x1: 640, y1: 448, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [0, 0, 0, 40], clip: null },
  { kind: 'glyphs', node: 'text', clip: null, quads: [
    { code: 65, texture: 'font.tif', shadow: false, left: 30, top: 400, right: 38, bottom: 410, u0: 0, u1: 8, v0: 0, v1: 10, rgba: [128, 128, 128, 128] },
    { code: 66, texture: 'font.tif', shadow: false, left: 38.5, top: 400, right: 46.5, bottom: 410, u0: 8, u1: 16, v0: 0, v1: 10, rgba: [128, 100, 60, 128] },
  ] },
  { kind: 'movie', picture: null, x0: 600, y0: 400, x1: 640, y1: 448 },
];
const sha = (f: Rgba): string => createHash('sha256').update(f.data).digest('hex');
/** Today's frame (agent/hd-goe 3692dc5e7, before HD-3's menus), taken from the drawer as it stood. */
const TODAY = 'cd7f4c1a389b8f1dc319a83f608ffe055df5c657bfc4735f27c608de8fafcac6';

describe('HD-3: the pack off draws today\'s frame, byte for byte', () => {
  it('no options, scale 1 and a lookup that replaces nothing all give today\'s 640 x 448 frame', () => {
    expect(sha(rasterizeUiDrawList(items, lookup).frame)).toBe(TODAY);
    const off = rasterizeUiDrawList(items, lookup, { scale: 1, hd: () => null }).frame;
    expect([off.width, off.height]).toEqual([640, 448]);
    expect(sha(off)).toBe(TODAY);
  });
});

describe('HD-3: the pack on draws the frame at the scale, sampling the HD image', () => {
  const px = (f: Rgba, x: number, y: number): number[] => [...f.data.subarray((y * f.width + x) * 4, (y * f.width + x) * 4 + 4)];
  const small = pattern(4, 4, 11), hd = pattern(16, 16, 77);
  type Sprite = Extract<UiDrawItem, { kind: 'sprite' }>;
  const sprite = (texture: string): Sprite => ({ kind: 'sprite', node: 's', texture, x0: 10, y0: 10, x1: 26, y1: 26, u0: 0, v0: 0, u1: 1, v1: 1, rgba: [128, 128, 128, 128], clip: null });
  const clear: UiDrawItem = { kind: 'clear', rgb: [0, 0, 0] };

  it('the frame is 640 x 448 times the scale, the quad\'s geometry scaled with it', () => {
    const { frame } = rasterizeUiDrawList([clear, { ...sprite('x'), texture: null, rgba: [128, 0, 0, 128] }], () => null, { scale: 4 });
    expect([frame.width, frame.height]).toEqual([2560, 1792]);
    expect(px(frame, 39, 39)).toEqual([0, 0, 0, 255]);
    expect(px(frame, 40, 40)).toEqual([128, 0, 0, 255]);
    expect(px(frame, 103, 103)).toEqual([128, 0, 0, 255]);
    expect(px(frame, 104, 103)).toEqual([0, 0, 0, 255]);
  });
  it('a replaced bitmap is sampled from its HD image: each scaled pixel at an HD texel centre is that texel', () => {
    const { frame } = rasterizeUiDrawList([clear, sprite('a.tif')], (n) => (n === 'a.tif' ? small : null), { scale: 4, hd: (b) => (b === small ? hd : null) });
    // The quad is 64 pixels over 16 HD texels: pixel 40 + 2 + 4k samples u = k + 0.5, the centre of HD texel k.
    for (const [tx, ty] of [[0, 0], [5, 3], [15, 15], [7, 12]] as const) {
      const at = (ty * 16 + tx) * 4;
      expect(px(frame, 42 + 4 * tx, 42 + 4 * ty)).toEqual([hd.data[at], hd.data[at + 1], hd.data[at + 2], 255]);
    }
  });
  it('glyphs take the HD atlas, their texel u/v scaled by its size', () => {
    const atlas = solid(8, 8, [9, 9, 9, 255]);
    const big = solid(32, 32, [200, 0, 0, 255]);                         // columns 0..15 red, 16..31 blue
    for (let y = 0; y < 32; y++) for (let x = 16; x < 32; x++) big.data.set([0, 0, 200, 255], (y * 32 + x) * 4);
    const { frame } = rasterizeUiDrawList([clear, { kind: 'glyphs', node: 't', clip: null,
      quads: [{ code: 65, texture: 'f', shadow: false, left: 10, top: 10, right: 14, bottom: 14, u0: 2, u1: 6, v0: 2, v1: 6, rgba: [128, 128, 128, 128] }] }],
    () => atlas, { scale: 4, hd: () => big });
    // 16 scaled pixels over HD texels 8..24 (the glyph's 2..6 times 4): the left of the glyph red, its right blue --
    // unscaled, texels 2..6 of the 32-wide atlas would be red throughout.
    expect(px(frame, 42, 44)).toEqual([200, 0, 0, 255]);
    expect(px(frame, 53, 44)).toEqual([0, 0, 200, 255]);
  });
  it('a bitmap the pack does not replace still draws, the original upscaled through the same bilinear filter', () => {
    const flat = solid(4, 4, [30, 60, 90, 255]);
    const { frame, undrawn } = rasterizeUiDrawList([clear, sprite('b.tif')], () => flat, { scale: 4, hd: () => null });
    expect(undrawn).toEqual([]);
    expect(px(frame, 40, 40)).toEqual([30, 60, 90, 255]);
    expect(px(frame, 103, 103)).toEqual([30, 60, 90, 255]);
    expect(px(frame, 104, 104)).toEqual([0, 0, 0, 255]);
  });
  it('the 3D pass and a clip scale with the frame', () => {
    const tri: UiModelTriangle = { node: 'r', texture: null, cull: true, a: { ...vtx(0, 0, 1, 0, 0), rgba: [0, 128, 0, 128] }, b: { ...vtx(0, 8, 1, 0, 0), rgba: [0, 128, 0, 128] }, c: { ...vtx(8, 0, 1, 0, 0), rgba: [0, 128, 0, 128] } };
    const m = rasterizeUiDrawList([clear, { kind: 'models', triangles: [tri] }], () => null, { scale: 2 }).frame;
    expect(px(m, 12, 2)).toEqual([0, 128, 0, 255]);                      // (6, 1) in the PS2 frame
    const c = rasterizeUiDrawList([clear, { ...sprite('x'), texture: null, x0: 0, y0: 0, x1: 10, y1: 10, clip: { x0: 2, y0: 2, x1: 3, y1: 3 } }], () => null, { scale: 2 }).frame;
    expect([px(c, 3, 4)[0], px(c, 4, 4)[0], px(c, 7, 7)[0], px(c, 8, 7)[0]]).toEqual([0, 128, 128, 0]);
  });
});
