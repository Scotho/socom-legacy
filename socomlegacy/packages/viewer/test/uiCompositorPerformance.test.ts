import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { Rgba } from '@s2u/gs';
import type { UiClip, UiDrawItem } from '@s2u/ui';
import { sharpenBitmap, type UiSamplingSettings } from '../src/experimentalUiSampling';
import { rasterizeUiDrawList, UiQuadRasterCache, type UiBitmap, type UiBlend } from '../src/uiCompositorView';

// Frozen pre-MPS-1 quad raster from d571966d, with 490d75e06's frame alpha (each quad pixel raises it, a clear sets
// 255; the transparent frame is not covered here): an optimization oracle, not new evidence about the original GS.
// Keep its expression order independent of the production implementation. All inputs below are synthetic.
const W = 640, H = 448;
function referenceSample(t: Rgba, u: number, v: number, out: number[]): void {
  const x = u - 0.5, y = v - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const wrap = (i: number, n: number): number => ((i % n) + n) % n;
  const xa = wrap(x0, t.width), xb = wrap(x0 + 1, t.width), ya = wrap(y0, t.height), yb = wrap(y0 + 1, t.height);
  const d = t.data;
  for (let c = 0; c < 4; c++) {
    const a = d[(ya * t.width + xa) * 4 + c]!, b = d[(ya * t.width + xb) * 4 + c]!;
    const e = d[(yb * t.width + xa) * 4 + c]!, g = d[(yb * t.width + xb) * 4 + c]!;
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + g * fx) * fy;
  }
}

function referenceQuad(
  frame: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number,
  tex: Rgba | null, uv: [number, number, number, number] | null, rgba: readonly number[], clip: UiClip | null, blend: UiBlend,
  sampling?: UiSamplingSettings,
): void {
  const nearest = sampling?.enabled && sampling.mode !== 'bilinear';
  if (tex && sampling?.enabled && sampling.mode === 'sharpen') tex = sharpenBitmap(tex, sampling.sharpness);
  let xs = Math.ceil(Math.min(x0, x1)), xe = Math.ceil(Math.max(x0, x1)), ys = Math.ceil(Math.min(y0, y1)), ye = Math.ceil(Math.max(y0, y1));
  xs = Math.max(xs, 0, clip ? clip.x0 : 0); ys = Math.max(ys, 0, clip ? clip.y0 : 0);
  xe = Math.min(xe, W, clip ? clip.x1 + 1 : W); ye = Math.min(ye, H, clip ? clip.y1 + 1 : H);
  const s: number[] = [0, 0, 0, 0];
  for (let y = ys; y < ye; y++) {
    for (let x = xs; x < xe; x++) {
      let r: number, g: number, b: number, a: number;
      if (tex && uv) {
        const u = uv[0] + ((uv[2] - uv[0]) * (x - x0)) / (x1 - x0);
        const v = uv[1] + ((uv[3] - uv[1]) * (y - y0)) / (y1 - y0);
        if (nearest) {
          const x = ((Math.floor(u) % tex.width) + tex.width) % tex.width;
          const y = ((Math.floor(v) % tex.height) + tex.height) % tex.height;
          const i = (y * tex.width + x) * 4;
          for (let ch = 0; ch < 4; ch++) s[ch] = tex.data[i + ch]!;
        } else referenceSample(tex, u, v, s);
        r = Math.min(255, (s[0]! * rgba[0]!) / 128); g = Math.min(255, (s[1]! * rgba[1]!) / 128); b = Math.min(255, (s[2]! * rgba[2]!) / 128);
        a = (s[3]! / 255) * (rgba[3]! / 128);
      } else {
        r = rgba[0]!; g = rgba[1]!; b = rgba[2]!; a = rgba[3]! / 128;
      }
      const i = (y * W + x) * 4;
      frame[i + 3] = frame[i + 3]! + (255 - frame[i + 3]!) * Math.min(1, a);
      if (blend === 'additive') {                              // 0x48: Cd + Cs x As (the array clamps, as COLCLAMP does)
        frame[i] = frame[i]! + r * a;
        frame[i + 1] = frame[i + 1]! + g * a;
        frame[i + 2] = frame[i + 2]! + b * a;
      } else {                                                 // 0x44: Cd + (Cs - Cd) x As
        frame[i] = frame[i]! + (r - frame[i]!) * a;
        frame[i + 1] = frame[i + 1]! + (g - frame[i + 1]!) * a;
        frame[i + 2] = frame[i + 2]! + (b - frame[i + 2]!) * a;
      }
    }
  }
}


type Sprite = Extract<UiDrawItem, { kind: 'sprite' }>;
const quad = (o: Partial<Sprite> = {}): Sprite => ({
  kind: 'sprite', node: 'q', texture: 'texture', x0: 0, y0: 0, x1: W, y1: H,
  u0: 0.01, v0: 0.01, u1: 0.99, v1: 0.99, rgba: [128, 128, 128, 128], clip: null, ...o,
});
const texture = (width: number, height: number, blend: UiBlend): UiBitmap => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 43 + (i >>> 3) * 19) % 256;
  return { width, height, data, blend };
};
function reference(items: readonly UiDrawItem[], textures: ReadonlyMap<string, UiBitmap>, sampling?: UiSamplingSettings): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  let blend: UiBlend = 'source';
  for (const item of items) {
    if (item.kind === 'clear') {
      for (let i = 0; i < data.length; i += 4) { data[i] = item.rgb[0]; data[i + 1] = item.rgb[1]; data[i + 2] = item.rgb[2]; data[i + 3] = 255; }
    } else if (item.kind === 'sprite') {
      const tex = item.texture === null ? null : textures.get(item.texture)!;
      if (tex) blend = tex.blend ?? 'source';
      referenceQuad(data, item.x0, item.y0, item.x1, item.y1, tex,
        tex ? [item.u0 * tex.width, item.v0 * tex.height, item.u1 * tex.width, item.v1 * tex.height] : null,
        item.rgba, item.clip, blend, sampling);
    } else if (item.kind === 'glyphs') {
      for (const q of item.quads) {
        const tex = textures.get(q.texture)!;
        blend = tex.blend ?? 'source';
        referenceQuad(data, q.left, q.top, q.right, q.bottom, tex, [q.u0, q.v0, q.u1, q.v1], q.rgba, item.clip, blend, sampling);
      }
    } else throw new Error('The frozen oracle covers clear, sprite and glyphs only');
  }
  return data;
}
function sameBytes(actual: Uint8ClampedArray, expected: Uint8ClampedArray): void {
  expect(actual.length).toBe(expected.length);
  const first = actual.findIndex((v, i) => v !== expected[i]);
  expect(first, first === -1 ? 'all rendered bytes match' : `byte ${first}: ${actual[first]} != ${expected[first]}`).toBe(-1);
}
const samplingModes: (UiSamplingSettings | undefined)[] = [undefined,
  { enabled: false, mode: 'sharpen', sharpness: 0.75, snap: 1 },
  ...(['bilinear', 'nearest', 'integer', 'sharpen'] as const).map(mode => ({ enabled: true, mode, sharpness: 0.75, snap: 1 })),
];

describe('MPS-1: byte-identical quad raster optimization', () => {
  for (const sampling of samplingModes) it(`retains the frozen raster for ${sampling?.enabled ? sampling.mode : 'original'} sampling`, () => {
    const textures = new Map<string, UiBitmap>();
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [17, 89, 231] }];
    const sizes = [[1, 1], [1, 7], [9, 1], [7, 11], [16, 8]] as const;
    const colours: Sprite['rgba'][] = [[128, 128, 128, 128], [0, 199, 53, 64], [255, 73, 201, 250], [91, 133, 41, 0]];
    for (let n = 0; n < sizes.length; n++) for (const blend of ['source', 'additive'] as const) {
      const name = `${n}-${blend}`, [w, h] = sizes[n]!;
      textures.set(name, texture(w, h, blend));
      for (let c = 0; c < colours.length; c++) {
        const x = n * 113 + c * 7, y = (blend === 'source' ? 0 : 200) + c * 19;
        const base = { texture: name, rgba: colours[c]!, x0: x - 3.375, y0: y - 2.625, x1: x + 75.875, y1: y + 63.125 };
        items.push(quad({ ...base, u0: -1.3, v0: 2.2, u1: 2.4, v1: -0.7 }));
        items.push(quad({ ...base, x0: x + 67.375, x1: x + 6.125, y0: y + 53.75, y1: y + 9.125,
          u0: 1.125, u1: -0.425, v0: -0.01, v1: 1.99, clip: { x0: x + 19, y0: y + 11, x1: x + 55, y1: y + 41 } }));
        items.push(quad({ ...base, texture: null, x0: x + 30, x1: x + 45, y0: y + 20, y1: y + 30 }));
      }
    }
    // Edge clipping, empty coverage and fractional clip endpoints retain the old index arithmetic too.
    items.push(quad({ texture: '3-additive', x0: 630.25, x1: 659.5, y0: 435.25, y1: 470.5 }));
    items.push(quad({ texture: '3-source', x0: 9, x1: 9 }), quad({ texture: '3-source', y0: 6, y1: 6 }));
    items.push(quad({ texture: '3-source', x1: 20, y1: 20, clip: { x0: 2.25, y0: 3.5, x1: 11.5, y1: 12.5 } }));
    items.push({ kind: 'glyphs', node: 'glyph', clip: { x0: 20, y0: 390, x1: 300, y1: 440 }, quads: [
      { code: 65, shadow: false, texture: '3-source', left: 16.25, top: 386.75, right: 310.5, bottom: 445.25,
        u0: -5.25, v0: 13.125, u1: 17.75, v1: -2.625, rgba: [72, 211, 156, 93] },
    ] });
    sameBytes(rasterizeUiDrawList(items, n => textures.get(n) ?? null, { uiSampling: sampling }).frame.data, reference(items, textures, sampling));
  });

  it('retains exact clear clamping and alpha for fractional, out-of-range and non-finite RGB', () => {
    const colours: [number, number, number][] = [[-35, 260, 127.5], [0.5, 1.5, 254.5], [NaN, Infinity, -Infinity]];
    sameBytes(rasterizeUiDrawList([], () => null).frame.data, reference([], new Map()));
    for (const rgb of colours) {
      const items: UiDrawItem[] = [{ kind: 'clear', rgb }];
      sameBytes(rasterizeUiDrawList(items, () => null).frame.data, reference(items, new Map()));
    }
  });

  it('a clear after fractional clipped draws leaves the bytes the clear on main leaves (rgb, 255)', () => {
    const items: UiDrawItem[] = [quad({ texture: null, x1: 20, y1: 20, rgba: [10, 20, 30, 128],
      clip: { x0: 2.25, y0: 3.5, x1: 11.5, y1: 12.5 } }), { kind: 'clear', rgb: [77, 88, 99] }];
    sameBytes(rasterizeUiDrawList(items, () => null).frame.data, reference(items, new Map()));
  });

  it('transparent and clipped textured draws still leave their bind for the next untextured draw', () => {
    const textures = new Map([['add', texture(1, 1, 'additive')], ['source', texture(1, 1, 'source')]]);
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [59, 137, 231] },
      quad({ texture: 'add', rgba: [128, 128, 128, 0] }),
      quad({ texture: null, rgba: [0, 0, 0, 128] }),
      quad({ texture: 'source', clip: { x0: W, x1: W, y0: H, y1: H } }),
      quad({ texture: null, x1: 20, y1: 20, rgba: [0, 0, 0, 64] }),
    ];
    sameBytes(rasterizeUiDrawList(items, n => textures.get(n) ?? null).frame.data, reference(items, textures));
  });

  const fullFrame = () => {
    const textures = new Map([['texture', texture(113, 79, 'source')]]);
    const items: UiDrawItem[] = [{ kind: 'clear', rgb: [17, 89, 231] }, quad({ rgba: [221, 73, 199, 93] }),
      quad({ x0: 35.75, y0: 13.125, x1: 615.5, y1: 425.75, u0: -0.2, u1: 1.3, v0: 1.4, v1: -0.1 })];
    return {
      current: () => rasterizeUiDrawList(items, n => textures.get(n) ?? null).frame.data,
      old: () => reference(items, textures),
    };
  };

  it('a full-frame bilinear scene keeps the frozen per-pixel sampler\'s bytes', () => {
    const { current, old } = fullFrame();
    sameBytes(current(), old());
    sameBytes(current(), old());                                     // a repeated draw, through the cache
  });

  // #460's takeover (OT.R69): a measurement, not a unit test. A timing ratio fails at random on a loaded host (beside a
  // gate, a browser run or another seat's files -- HAZARDS' loaded-gate stalls), so it is not asserted in the suite.
  // The speed claim is the plan's browser re-measure (MPS-1); run this case by hand to read the ratio.
  it.skip('halves full-frame bilinear raster cost against the frozen per-pixel sampler (a measurement, not a unit test)', () => {
    // Relative median, after warmup, avoids a machine-specific millisecond budget. The real login frame is
    // profiled separately by the controller; this synthetic scene catches restoring the old dominant work.
    const { current, old } = fullFrame();
    for (let n = 0; n < 3; n++) { current(); old(); }
    const times = (fn: () => Uint8ClampedArray): number => {
      const start = performance.now(); fn(); return performance.now() - start;
    };
    const currentTimes: number[] = [], oldTimes: number[] = [];
    for (let n = 0; n < 7; n++) {
      if (n % 2) { currentTimes.push(times(current)); oldTimes.push(times(old)); }
      else { oldTimes.push(times(old)); currentTimes.push(times(current)); }
    }
    const median = (a: number[]) => a.sort((a, b) => a - b)[3]!;
    const ratio = median(currentTimes) / median(oldTimes);
    console.info(`MPS-1 raster median: current=${median(currentTimes).toFixed(2)} ms frozen=${median(oldTimes).toFixed(2)} ms ratio=${ratio.toFixed(3)}`);
    expect(ratio).toBeLessThan(0.5);
    sameBytes(current(), old());
  });
});


describe('bounded large-quad cache', () => {
  const scene = (o: Partial<Sprite> = {}): UiDrawItem[] => [{ kind: 'clear', rgb: [43, 85, 137] },
    quad({ x0: 11, y0: 17, x1: 203, y1: 145, rgba: [97, 231, 159, 73], ...o })];
  const check = (cache: UiQuadRasterCache, tex: UiBitmap, items = scene(), sampling?: UiSamplingSettings): void => {
    const textures = new Map([['texture', tex]]);
    sameBytes(rasterizeUiDrawList(items, () => tex, { quadCache: cache, uiSampling: sampling }).frame.data, reference(items, textures, sampling));
  };
  it('hits reproduce every byte and see source mutation, replacement and dimension changes', () => {
    const cache = new UiQuadRasterCache(2 * 1024 * 1024), tex = texture(16, 16, 'source');
    check(cache, tex); expect(cache.size).toBe(1); check(cache, tex);
    tex.data[0] = 251; tex.data[3] = 1; check(cache, tex);
    tex.data = new Uint8ClampedArray(tex.data.length).fill(47); check(cache, tex);
    tex.width = 8; tex.height = 32; check(cache, tex);
    check(cache, texture(8, 32, 'source'));
  });
  it('includes colour, UV, coverage and sampling in the key while applying the current blend', () => {
    const cache = new UiQuadRasterCache(4 * 1024 * 1024), tex = texture(16, 16, 'source');
    check(cache, tex); check(cache, tex);
    check(cache, tex, scene({ rgba: [255, 64, 137, 128] }));
    check(cache, tex, scene({ u0: -1.25, u1: 2.75, v0: 1.9, v1: -0.1 }));
    check(cache, tex, scene({ clip: { x0: 20, x1: 201, y0: 19, y1: 144 } }));
    check(cache, tex, scene({ x0: 12, x1: 204 }));
    for (const sampling of samplingModes) { check(cache, tex, scene(), sampling); check(cache, tex, scene(), sampling); }
    tex.blend = 'additive'; check(cache, tex); check(cache, tex);
  });
  it('a hit on a transparent frame raises the alpha as the miss does (the overlay of 490d75e06)', () => {
    const cache = new UiQuadRasterCache(2 * 1024 * 1024), tex = texture(16, 16, 'source'), items = scene().slice(1);
    const draw = (): Uint8ClampedArray => rasterizeUiDrawList(items, () => tex, { quadCache: cache, transparent: true }).frame.data;
    const miss = draw(); expect(cache.size).toBe(1);
    expect(miss[(20 * W + 20) * 4 + 3]).toBeGreaterThan(0);
    sameBytes(draw(), miss);
  });
  it('evicts by retained array bytes, supports clearing and does not cache small or oversized quads', () => {
    const budget = 900 * 1024, cache = new UiQuadRasterCache(budget), tex = texture(16, 16, 'source');
    check(cache, tex); expect(cache.size).toBe(1); const bytes = cache.byteLength;
    expect(bytes).toBe(192 * 128 * 4 * 8 + tex.data.byteLength);
    check(cache, tex, scene({ rgba: [129, 128, 128, 128] }));
    expect(cache.size).toBe(1); expect(cache.byteLength).toBe(bytes); expect(cache.byteLength).toBeLessThanOrEqual(budget);
    check(cache, tex); expect(cache.size).toBe(1);
    cache.clear(); expect(cache.byteLength).toBe(0); expect(cache.size).toBe(0);
    check(cache, tex, scene({ x1: 20, y1: 20 })); expect(cache.size).toBe(0);
    const tiny = new UiQuadRasterCache(1); check(tiny, tex); expect(tiny.byteLength).toBe(0);
    // A narrow view must not keep the large backing array alive through the cache.
    const storage = new Uint8ClampedArray(8 * 1024 * 1024); tex.data = storage.subarray(1, 1 + 16 * 16 * 4);
    check(cache, tex); check(cache, tex); expect(cache.byteLength).toBe(bytes);
    tex.data[7] = 123; check(cache, tex); // unaligned byte-comparison fallback still detects mutation
  });
});
