import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { RdrNode } from '@s2u/archive';
import { MovieLayer, buildDialogScreen, loadDialog, type UiDrawItem, type UiModelTriangle, type UiModelVertex } from '@s2u/ui';
import { drawDialogFrame, presentUiFrame, rasterizeUiDrawList, type UiCanvasTarget } from '../src/uiCompositorView';

// PLAT-14's drawer (web research 112 §6): the draw list rasterised into the 640 x 448 frame as the GS draws a 2D quad
// (readings named in the drawer), against made-up lists and bitmaps -- no disc bytes, no DOM.

const W = 640;
const px = (f: Rgba, x: number, y: number): number[] => [...f.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
const solid = (w: number, h: number, top: number[], bottom = top): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(y < h / 2 ? top : bottom, (y * w + x) * 4);
  return { width: w, height: h, data };
};
const clear: UiDrawItem = { kind: 'clear', rgb: [0, 0, 0] };
const quad = (o: Partial<Extract<UiDrawItem, { kind: 'sprite' }>>): UiDrawItem => ({
  kind: 'sprite', node: 'q', texture: null, x0: 0, y0: 0, x1: 4, y1: 4, u0: 0.01, v0: 0.01, u1: 0.99, v1: 0.99, rgba: [128, 128, 128, 128], clip: null, ...o,
});

describe('rasterizeUiDrawList', () => {
  it('keeps the live match visible behind a transparent native UI overlay', () => {
    const { frame } = rasterizeUiDrawList([quad({ rgba: [200, 100, 0, 64] })], () => null, { transparent: true });
    expect(px(frame, 20, 20)).toEqual([0, 0, 0, 0]);
    expect(px(frame, 1, 1)).toEqual([199, 100, 0, 128]);
  });
  it('fills an untextured quad over x0 <= x < x1, y0 <= y < y1 in its colour as it stands (GS_SPRITE_COVERAGE_READING)', () => {
    const { frame } = rasterizeUiDrawList([clear, quad({ x0: 2.5, y0: 1, x1: 5, y1: 3, rgba: [128, 64, 0, 128] })], () => null);
    expect(px(frame, 2, 1)).toEqual([0, 0, 0, 255]);
    expect(px(frame, 3, 1)).toEqual([128, 64, 0, 255]);
    expect(px(frame, 4, 2)).toEqual([128, 64, 0, 255]);
    expect(px(frame, 5, 2)).toEqual([0, 0, 0, 255]);
    expect(px(frame, 3, 3)).toEqual([0, 0, 0, 255]);
  });
  it('blends by the alpha, 128 = 1 (GS_MODULATE_BLEND_READING)', () => {
    const { frame } = rasterizeUiDrawList([
      { kind: 'clear', rgb: [200, 100, 0] }, quad({ rgba: [0, 0, 0, 64] }), quad({ x0: 10, x1: 12, rgba: [0, 0, 0, 0] }),
    ], () => null);
    expect(px(frame, 1, 1)).toEqual([100, 50, 0, 255]);
    expect(px(frame, 10, 1)).toEqual([200, 100, 0, 255]);
  });
  it('draws a bitmap upright: the quad\'s top samples the image\'s top rows; the colour modulates (128 = the texel)', () => {
    const tex = solid(16, 16, [200, 0, 0, 255], [0, 0, 200, 255]);
    const { frame } = rasterizeUiDrawList([clear, quad({ texture: 'a.tif', x1: 16, y1: 16 }), quad({ texture: 'a.tif', x0: 20, x1: 36, y1: 16, rgba: [64, 128, 128, 128] })], (n) => (n === 'a.tif' ? tex : null));
    expect(px(frame, 8, 2)).toEqual([200, 0, 0, 255]);
    expect(px(frame, 8, 13)).toEqual([0, 0, 200, 255]);
    expect(px(frame, 28, 2)).toEqual([100, 0, 0, 255]);
  });
  it('lets a texel\'s alpha (255 = 128 on the GS) scale the blend', () => {
    const tex = solid(8, 8, [255, 255, 255, 128]);
    const { frame } = rasterizeUiDrawList([clear, quad({ texture: 't', x1: 8, y1: 8 })], () => tex);
    expect(Math.abs(px(frame, 4, 4)[0]! - 128)).toBeLessThanOrEqual(1);
  });
  it('keeps a quad inside its clip, both corners in', () => {
    const { frame } = rasterizeUiDrawList([clear, quad({ x1: 10, y1: 10, rgba: [128, 128, 128, 128], clip: { x0: 2, y0: 2, x1: 3, y1: 3 } })], () => null);
    expect([px(frame, 1, 2)[0], px(frame, 2, 2)[0], px(frame, 3, 3)[0], px(frame, 4, 3)[0]]).toEqual([0, 128, 128, 0]);
  });
  it('draws glyph quads from their texels (top row first)', () => {
    const atlas = solid(32, 32, [0, 200, 0, 255], [200, 0, 0, 255]);
    const { frame } = rasterizeUiDrawList([clear, {
      kind: 'glyphs', node: 't', clip: null,
      quads: [{ code: 65, texture: 'f', shadow: false, left: 10, top: 10, right: 18, bottom: 18, u0: 0, u1: 8, v0: 1, v1: 9, rgba: [128, 128, 128, 128] }],
    }], () => atlas);
    expect(px(frame, 14, 14)).toEqual([0, 200, 0, 255]);
    expect(px(frame, 18, 14)).toEqual([0, 0, 0, 255]);
  });
  it('draws the movie layer black until a picture, then the picture at the origin', () => {
    const red = solid(640, 448, [255, 0, 0, 255]);
    const black = rasterizeUiDrawList([{ kind: 'clear', rgb: [9, 9, 9] }, { kind: 'movie', picture: null, x0: 0, y0: 0, x1: 640, y1: 448 }], () => null);
    expect(px(black.frame, 320, 200)).toEqual([0, 0, 0, 255]);
    const pic = { width: 640, height: 448, image: red };
    const shown = rasterizeUiDrawList([clear, { kind: 'movie', picture: pic, x0: 0, y0: 0, x1: 640, y1: 448 }], () => null, { movie: (p) => p.image as Rgba });
    expect(px(shown.frame, 639, 447)).toEqual([255, 0, 0, 255]);
  });
  it('names what it does not draw: the widgets (PLAT-15) and the models pass', () => {
    const items: UiDrawItem[] = [clear, { kind: 'models' }, quad({ texture: 'missing' })];
    expect(rasterizeUiDrawList(items, () => null).undrawn).toEqual(['models', 'q: no bitmap missing']);
  });
});

describe('the 3D pass (MENU-02a): a models item with triangles', () => {
  const v = (x: number, y: number, invW: number, u: number, vv: number, rgba: [number, number, number, number] = [128, 128, 128, 128]): UiModelVertex => ({ x, y, invW, u, v: vv, rgba });
  const tri = (o: Partial<UiModelTriangle>): UiModelTriangle => ({ node: 'new_on', texture: null, cull: true, a: v(0, 0, 1, 0, 1), b: v(8, 0, 1, 1, 1), c: v(0, 8, 1, 0, 0), ...o });
  it('fills the pixels whose centres are inside a counter-clockwise (front) triangle, in its colour; an empty list draws nothing and is not undrawn', () => {
    const r = rasterizeUiDrawList([clear, { kind: 'models', triangles: [tri({ a: v(0, 0, 1, 0, 0, [128, 0, 0, 128]), b: v(0, 8, 1, 0, 0, [128, 0, 0, 128]), c: v(8, 0, 1, 0, 0, [128, 0, 0, 128]) })] }], () => null);
    expect(r.undrawn).toEqual([]);
    expect(px(r.frame, 1, 1)).toEqual([128, 0, 0, 255]);
    expect(px(r.frame, 2, 2)).toEqual([128, 0, 0, 255]);
    expect(px(r.frame, 6, 6)).toEqual([0, 0, 0, 255]);
    expect(rasterizeUiDrawList([clear, { kind: 'models', triangles: [] }], () => null).undrawn).toEqual([]);
  });
  it('drops a back face (clockwise on the frame) when the mesh culls, keeps it otherwise', () => {
    const back = tri({ a: v(0, 0, 1, 0, 0), b: v(8, 0, 1, 0, 0), c: v(0, 8, 1, 0, 0) });
    expect(px(rasterizeUiDrawList([clear, { kind: 'models', triangles: [back] }], () => null).frame, 1, 1)).toEqual([0, 0, 0, 255]);
    expect(px(rasterizeUiDrawList([clear, { kind: 'models', triangles: [{ ...back, cull: false }] }], () => null).frame, 1, 1)).toEqual([128, 128, 128, 255]);
  });
  it('samples the texture as stored, v 0 the first row (the map is top row first: v flipped back), modulated and alpha-blended', () => {
    const tex = solid(8, 8, [200, 0, 0, 255], [0, 0, 200, 255]);      // rows 0-3 red, 4-7 blue
    const front = (vTop: number, vBottom: number): UiModelTriangle => tri({ a: v(0, 0, 1, 0, vTop), b: v(0, 16, 1, 0, vBottom), c: v(16, 0, 1, 1, vTop), texture: 't.tif' });
    const r = rasterizeUiDrawList([clear, { kind: 'models', triangles: [front(1, 0)] }], (n) => (n === 't.tif' ? tex : null));
    expect(px(r.frame, 1, 1)).toEqual([200, 0, 0, 255]);              // v 1 at the top: the map's first row (red)
    expect(px(r.frame, 1, 12)).toEqual([0, 0, 200, 255]);
    const dim = rasterizeUiDrawList([clear, { kind: 'models', triangles: [{ ...front(1, 0), a: v(0, 0, 1, 0, 1, [128, 128, 128, 64]), b: v(0, 16, 1, 0, 0, [128, 128, 128, 64]), c: v(16, 0, 1, 1, 1, [128, 128, 128, 64]) }] }], () => tex);
    expect(px(dim.frame, 1, 1)).toEqual([100, 0, 0, 255]);
  });
  it('the nearer triangle wins through the depth buffer of the pass, whichever is drawn first', () => {
    const near = tri({ a: v(0, 0, 1 / 10, 0, 0, [0, 128, 0, 128]), b: v(0, 8, 1 / 10, 0, 0, [0, 128, 0, 128]), c: v(8, 0, 1 / 10, 0, 0, [0, 128, 0, 128]) });
    const far = tri({ a: v(0, 0, 1 / 20, 0, 0, [128, 0, 0, 128]), b: v(0, 8, 1 / 20, 0, 0, [128, 0, 0, 128]), c: v(8, 0, 1 / 20, 0, 0, [128, 0, 0, 128]) });
    for (const order of [[near, far], [far, near]]) expect(px(rasterizeUiDrawList([clear, { kind: 'models', triangles: order }], () => null).frame, 1, 1)).toEqual([0, 128, 0, 255]);
  });
  it('a texel of alpha 0 writes neither colour nor depth (UI_MODEL_ZWRITE_READING): a farther face shows through the clear part of a nearer one, whichever is drawn first', () => {
    const clearTex = solid(8, 8, [255, 255, 255, 0]);
    const near = tri({ a: v(0, 0, 1 / 10, 0, 1), b: v(0, 16, 1 / 10, 0, 0), c: v(16, 0, 1 / 10, 1, 1), texture: 'clear.tif' });
    const far = tri({ a: v(0, 0, 1 / 20, 0, 0, [128, 0, 0, 128]), b: v(0, 16, 1 / 20, 0, 0, [128, 0, 0, 128]), c: v(16, 0, 1 / 20, 0, 0, [128, 0, 0, 128]) });
    for (const order of [[near, far], [far, near]]) expect(px(rasterizeUiDrawList([clear, { kind: 'models', triangles: order }], (n) => (n === 'clear.tif' ? clearTex : null)).frame, 1, 1)).toEqual([128, 0, 0, 255]);
    // A covered texel still occludes: the half-clear map's opaque rows hide the far face under them.
    const half = solid(8, 8, [0, 0, 200, 255], [255, 255, 255, 0]);      // rows 0-3 blue, 4-7 clear
    const r = rasterizeUiDrawList([clear, { kind: 'models', triangles: [far, { ...near, texture: 'half.tif' }] }], (n) => (n === 'half.tif' ? half : null));
    expect(px(r.frame, 1, 1)).toEqual([0, 0, 200, 255]);                 // v 1 at the top: the map's first rows
    expect(px(r.frame, 1, 12)).toEqual([128, 0, 0, 255]);                // v 0.25, the map's clear rows: the far face through
  });
  it('names a missing bitmap once per node and draws nothing of it', () => {
    const r = rasterizeUiDrawList([clear, { kind: 'models', triangles: [tri({ texture: 'gone.tif', cull: false }), tri({ texture: 'gone.tif', cull: false })] }], () => null);
    expect(r.undrawn).toEqual(['new_on: no bitmap gone.tif']);
  });
});

describe('the GS\'s ALPHA_1 register (research 141 §2): a texture\'s bind sets the blend, an untextured quad draws with the one last set', () => {
  // The bind packet of a texture record writes ALPHA_1 (0x44 `source`, 0x48 `additive`: `@s2u/gs`'s `decodeAlpha`);
  // `FUN_003643b0` sends an untextured quad with no register but its PRIM, so the last bind's blend is the one it draws with.
  const v = (x: number, y: number, rgba: [number, number, number, number] = [128, 128, 128, 128]): UiModelVertex => ({ x, y, invW: 1, u: 0, v: 0, rgba });
  const glow = { ...solid(8, 8, [100, 60, 20, 255]), blend: 'additive' as const };
  const plain = { ...solid(8, 8, [100, 60, 20, 255]), blend: 'source' as const };
  const bitmaps = (n: string) => (n === 'glow.tif' ? glow : n === 'plain.tif' ? plain : null);
  const grey: UiDrawItem = { kind: 'clear', rgb: [50, 50, 50] };
  const fader = (alpha: number): UiDrawItem => quad({ node: 'MENUFADER', x0: 0, y0: 0, x1: 640, y1: 448, rgba: [0, 0, 0, alpha] });

  it('a textured quad blends by its own texture\'s ALPHA_1: additive is Cd + Cs x As, clamped; source is Cd + (Cs - Cd) x As; a bitmap that says nothing is source', () => {
    const add = rasterizeUiDrawList([grey, quad({ texture: 'glow.tif', x0: 100, x1: 108, y0: 100, y1: 108 })], bitmaps).frame;
    expect(px(add, 102, 102)).toEqual([150, 110, 70, 255]);
    const half = rasterizeUiDrawList([grey, quad({ texture: 'glow.tif', x0: 100, x1: 108, y0: 100, y1: 108, rgba: [128, 128, 128, 64] })], bitmaps).frame;
    expect(px(half, 102, 102)).toEqual([100, 80, 60, 255]);
    const bright = rasterizeUiDrawList([{ kind: 'clear', rgb: [200, 250, 0] }, quad({ texture: 'glow.tif', x0: 100, x1: 108, y0: 100, y1: 108 })], bitmaps).frame;
    expect(px(bright, 102, 102)).toEqual([255, 255, 20, 255]);                    // COLCLAMP: clamped, not wrapped
    const src = rasterizeUiDrawList([grey, quad({ texture: 'plain.tif', x0: 100, x1: 108, y0: 100, y1: 108 })], bitmaps).frame;
    expect(px(src, 102, 102)).toEqual([100, 60, 20, 255]);
    const bare = rasterizeUiDrawList([grey, quad({ texture: 'bare.tif', x0: 100, x1: 108, y0: 100, y1: 108 })], (n) => (n === 'bare.tif' ? solid(8, 8, [100, 60, 20, 255]) : null)).frame;
    expect(px(bare, 102, 102)).toEqual([100, 60, 20, 255]);
  });

  it('the black fader after an additive texture changes no pixel, whatever its alpha -- 128, a part, a wrapped byte; after a source texture it covers', () => {
    const lit = (alpha: number, last: string): number[] => px(rasterizeUiDrawList([grey, quad({ texture: last, x0: 0, x1: 8, y0: 0, y1: 8 }), fader(alpha)], bitmaps).frame, 300, 200);
    for (const alpha of [128, 121, 60, 0, 250, 199]) expect(lit(alpha, 'glow.tif'), `additive, alpha ${alpha}`).toEqual([50, 50, 50, 255]);
    expect(lit(128, 'plain.tif')).toEqual([0, 0, 0, 255]);
    expect(lit(64, 'plain.tif')).toEqual([25, 25, 25, 255]);
    expect(lit(250, 'plain.tif')).toEqual([0, 0, 0, 255]);                         // the packed byte over 128, clamped: black
  });

  it('a frame starts at the source blend (GS_ALPHA_FRAME_START_READING): a fader drawn before any texture covers', () => {
    expect(px(rasterizeUiDrawList([grey, fader(128)], bitmaps).frame, 300, 200)).toEqual([0, 0, 0, 255]);
    expect(px(rasterizeUiDrawList([grey, fader(64)], bitmaps).frame, 300, 200)).toEqual([25, 25, 25, 255]);
  });

  it('the 3D pass binds too: a triangle draws by its texture\'s blend and leaves it for the foreplane\'s fader; a pass that draws nothing leaves the backplane\'s', () => {
    const tri = (texture: string | null): UiModelTriangle => ({ node: 'new_on', texture, cull: false, a: v(0, 0), b: v(0, 16), c: v(16, 0) });
    const roller = rasterizeUiDrawList([grey, quad({ texture: 'plain.tif', x0: 100, x1: 108, y0: 100, y1: 108 }), { kind: 'models', triangles: [tri('glow.tif')] }, fader(128)], bitmaps).frame;
    expect(px(roller, 2, 2)).toEqual([150, 110, 70, 255]);                          // the triangle, added
    expect(px(roller, 300, 200)).toEqual([50, 50, 50, 255]);                        // the fader, adding black: nothing
    expect(px(roller, 102, 102)).toEqual([100, 60, 20, 255]);
    const hidden = rasterizeUiDrawList([grey, quad({ texture: 'plain.tif', x0: 100, x1: 108, y0: 100, y1: 108 }), { kind: 'models', triangles: [] }, fader(128)], bitmaps).frame;
    expect(px(hidden, 300, 200)).toEqual([0, 0, 0, 255]);                           // the roller hidden: the last bind is the backplane's
    const untextured = rasterizeUiDrawList([grey, quad({ texture: 'glow.tif', x0: 100, x1: 108, y0: 100, y1: 108 }), { kind: 'models', triangles: [tri(null)] }], bitmaps).frame;
    expect(px(untextured, 2, 2)).toEqual([178, 178, 178, 255]);                     // an untextured triangle draws with the last bind as well
  });

  it('glyphs bind their atlas: a fader after text covers again', () => {
    const atlas = { ...solid(16, 16, [255, 255, 255, 255]), blend: 'source' as const };
    const text: UiDrawItem = { kind: 'glyphs', node: 't', clip: null, quads: [{ texture: 'font.tif', left: 0, top: 0, right: 4, bottom: 4, u0: 0, v0: 0, u1: 4, v1: 4, rgba: [128, 128, 128, 128] }] as never };
    const f = rasterizeUiDrawList([grey, quad({ texture: 'glow.tif', x0: 100, x1: 108, y0: 100, y1: 108 }), text, fader(128)], (n) => (n === 'font.tif' ? atlas : bitmaps(n))).frame;
    expect(px(f, 300, 200)).toEqual([0, 0, 0, 255]);
  });
});

describe('the canvas presenter and the dev entry', () => {
  const fakeTarget = (): UiCanvasTarget & { put: { w: number; h: number; x: number; y: number; first: number[] }[] } => {
    const put: { w: number; h: number; x: number; y: number; first: number[] }[] = [];
    return {
      put,
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (img, x, y) => put.push({ w: img.width, h: img.height, x, y, first: [...img.data.subarray(0, 4)] }),
    };
  };
  it('puts the 640 x 448 frame at the target\'s origin', () => {
    const t = fakeTarget();
    presentUiFrame(t, solid(640, 448, [1, 2, 3, 255]));
    expect(t.put).toEqual([{ w: 640, h: 448, x: 0, y: 0, first: [1, 2, 3, 255] }]);
  });
  it('shows a dialog: built, composed, drawn -- under its fader (opaque while it has bindings, clear without)', () => {
    const r = (...kv: (string | RdrNode)[]): RdrNode[] => kv.map((v) => (Array.isArray(v) || kv.indexOf(v) % 2 === 0 ? v : [v]));
    const dlg = (bindings: boolean): RdrNode => [['SCREENS', [
      'BACKGROUND', r('TYPE', 'IMAGE', 'FILENAME', 'back.tif'),
      ...(bindings ? ['ANIMATIONS', [r('EVENT', 'ONSTART', 'ANIMATION', 'go')]] : []),
    ], '0', '0']];
    const back = solid(64, 64, [0, 100, 0, 255]);
    const lit = fakeTarget(), dark = fakeTarget();
    drawDialogFrame(lit, buildDialogScreen(loadDialog(dlg(false))), () => back);
    drawDialogFrame(dark, buildDialogScreen(loadDialog(dlg(true)), { movie: new MovieLayer() }), () => back);
    expect(lit.put[0]!.first).toEqual([0, 100, 0, 255]);
    expect(dark.put[0]!.first).toEqual([0, 0, 0, 255]);
  });
});
