import type { Rgba } from '@s2u/gs';
import type { UiDrawItem, UiModelTriangle, UiModelVertex } from '@s2u/ui';
import { UiQuadRasterCache, type RasterOptions, type UiBitmap, type UiTextures } from '../src/uiCompositorView';

/**
 * GM-03 (plan 2026-11-01-gpu-menus; research 380 §2): the shared case table. Each case is a draw list with its
 * bitmaps, the rules it holds (the parity contract's P- and M-rows), the readings those rules stand on, the class the
 * GPU must meet on it (E, E* or B), probes worked by hand from the rule, and -- in `UI_RASTER_SOFTWARE_SHA256` -- the
 * SHA-256 of today's software frame (`rasterizeUiDrawList`, `uiCompositorView.ts`) at scales 1, 2 and 4, opaque and
 * transparent. The software is the reference: the f64 CPU executor (GM-06a/b) and the GPU (GM-11b) compare to it byte
 * for byte, or within the bound the class allows.
 *
 * Sources of the cases: u4 §2.3 (cases 1-10), the hybrid design §13.2 (11-15), the plan's GM-03 row (16-20).
 * Test data only: every bitmap here is made up; no disc bytes. Pure (no DOM), so a browser harness can import it.
 *
 * Two facts the cases pin as the software stands (GM.R14: the port reproduces the software, it does not correct it):
 * - The transparent frame's output is the **post-divide** buffer (`rasterizeUiDrawList` divides premultiplied RGB back
 *   to straight RGB). The probes of cases 4 and 19 are worked through that divide. A GPU leg comparing the pre-divide
 *   buffer P14/P22 name must not use these pins for cases 4, 17 and 19: it uses `UI_RASTER_PREDIVIDE_SHA256` and
 *   `UI_RASTER_PREDIVIDE_PROBES` below, taken through GM-09's `preDivide` option (GM-03 review F2).
 * - The transparent leg adds information only for cases 4, 8, 17, 19 and 20; the other keys begin with a clear that
 *   sets alpha to 255, so both modes hash the same. Case 15's `MAX_TEXTURE_SIZE` route exists only on the GPU
 *   (GM-14b); on the software it tests the large-image draw alone (GM-03 review F4).
 * - Two model triangles with equal `invW` on a shared edge: the second is rejected by the depth test (`invW <= depth`),
 *   so the edge is drawn once; it is drawn twice only where the later triangle is nearer (case 2).
 */

export type UiRasterScale = 1 | 2 | 4;
export type UiRasterMode = 'opaque' | 'transparent';
export const UI_RASTER_CASE_SCALES: readonly UiRasterScale[] = [1, 2, 4];
export const UI_RASTER_CASE_MODES: readonly UiRasterMode[] = ['opaque', 'transparent'];

/** One pixel worked by hand from the rule; at scale 1, opaque, unless it says. */
export interface UiRasterProbe { x: number; y: number; rgba: [number, number, number, number]; scale?: UiRasterScale; mode?: UiRasterMode; why?: string }

/** What a case draws: the list, its bitmaps by name, HD replacements by bitmap name, movie pictures inline. */
export interface UiRasterCaseData {
  items: UiDrawItem[];
  textures: Record<string, UiBitmap>;
  /** HD-3: the HD image that replaces a bitmap, by the bitmap's name. */
  hd?: Record<string, Rgba>;
}

export interface UiRasterCase {
  /** The case's number: u4 §2.3 1-10, hybrid §13.2 11-15, the plan's 16-20. */
  id: number;
  /** A parametrised case's variant (case 13's residencies, case 19's source alphas); absent otherwise. */
  variant?: string;
  /** `id`, or `id.variant`: the key of the case's pins. */
  key: string;
  name: string;
  /** The parity contract's rows the case holds (research 380 §2). */
  rules: string[];
  /** The readings the rules stand on: exported constants, or one GM-05b mints. */
  readings: string[];
  /** The class the GPU must meet on the whole case: the weakest of its rules' classes (plan, "The parity contract"). */
  gpu: 'E' | 'E*' | 'B';
  /** Built on demand (case 15's 2048 x 2048 image is 16 MiB) and kept. */
  data: () => UiRasterCaseData;
  probes: UiRasterProbe[];
  /** What the software leaves undrawn, in order (empty when absent). */
  undrawn?: string[];
}

// ---- made-up bitmaps -----------------------------------------------------------------------------------------------

/** Every texel the same. */
export const solid = (w: number, h: number, px: readonly number[], blend?: UiBitmap['blend']): UiBitmap => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(px, i * 4);
  return blend ? { width: w, height: h, data, blend } : { width: w, height: h, data };
};
/** Texel i = y * w + x is ((i*37 + seed) & 255, (i*91 + seed*3) & 255, (i*13 + seed*7) & 255, alpha). */
export const pattern = (w: number, h: number, seed: number, alpha = 255): UiBitmap => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([(i * 37 + seed) & 255, (i * 91 + seed * 3) & 255, (i * 13 + seed * 7) & 255, alpha], i * 4);
  return { width: w, height: h, data };
};

type Sprite = Extract<UiDrawItem, { kind: 'sprite' }>;
type Glyph = Extract<UiDrawItem, { kind: 'glyphs' }>['quads'][number];
type Q4 = [number, number, number, number];
const clear = (r: number, g: number, b: number): UiDrawItem => ({ kind: 'clear', rgb: [r, g, b] });
/** An untextured quad. */
const fill = (x0: number, y0: number, x1: number, y1: number, rgba: Q4, clip: Sprite['clip'] = null, node = 'f'): Sprite =>
  ({ kind: 'sprite', node, texture: null, x0, y0, x1, y1, u0: 0, v0: 0, u1: 1, v1: 1, rgba, clip });
/** A textured quad over the whole image unless `uv` says. */
const sprite = (texture: string, x0: number, y0: number, x1: number, y1: number, rgba: Q4 = [128, 128, 128, 128], uv: Q4 = [0, 0, 1, 1], node = 'q'): Sprite =>
  ({ kind: 'sprite', node, texture, x0, y0, x1, y1, u0: uv[0], v0: uv[1], u1: uv[2], v1: uv[3], rgba, clip: null });
const glyph = (texture: string, left: number, top: number, right: number, bottom: number, rgba: Q4 = [128, 128, 128, 128], texel: Q4 = [0, 0, 8, 8]): Glyph =>
  ({ code: 65, texture, shadow: false, left, top, right, bottom, u0: texel[0], v0: texel[1], u1: texel[2], v1: texel[3], rgba });
const glyphs = (quads: Glyph[], node = 't'): UiDrawItem => ({ kind: 'glyphs', node, quads, clip: null });
const vtx = (x: number, y: number, invW = 1, rgba: Q4 = [128, 128, 128, 128], u = 0, v = 0): UiModelVertex => ({ x, y, invW, u, v, rgba });
const tri = (texture: string | null, a: UiModelVertex, b: UiModelVertex, c: UiModelVertex, cull = true, node = 'new_on'): UiModelTriangle => ({ node, texture, cull, a, b, c });
/** The front triangle (0,0), (0,16), (16,0) (counter-clockwise on the frame), every vertex at one depth and colour. */
const corner = (texture: string | null, invW: number, rgba: Q4 = [128, 128, 128, 128]): UiModelTriangle =>
  tri(texture, vtx(0, 0, invW, rgba, 0, 1), vtx(0, 16, invW, rgba, 0, 0), vtx(16, 0, invW, rgba, 1, 1));

/** Uint8ClampedArray's store: round half to even, clamp to 0..255, NaN to 0 (the rule P12 names). */
export const storeByte = (v: number): number => {
  if (Number.isNaN(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  const f = Math.floor(v), d = v - f;
  return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
};

const once = <T>(build: () => T): (() => T) => { let v: T | undefined; return () => (v ??= build()); };
const C = (o: Omit<UiRasterCase, 'key' | 'data'> & { data: () => UiRasterCaseData }): UiRasterCase =>
  ({ ...o, key: o.variant ? `${o.id}.${o.variant}` : String(o.id), data: once(o.data) });

const BOLD = [200, 100, 50, 255];
const GLOW = [100, 60, 20, 255];

// ---- the cases -----------------------------------------------------------------------------------------------------

/** Case 19's source alphas and their hand-worked pixel (1,1) over the case's half-alpha blue: [opaque, transparent]. */
const CASE_19: [number, Q4, Q4][] = [
  [0, [0, 0, 100, 255], [0, 0, 199, 128]],          // skipped (finite colour, alpha 0); transparent: 100 / (128/255)
  [64, [100, 50, 70, 255], [133, 66, 93, 192]],     // a .5: alpha 128 + 127 x .5 = 191.5 -> 192; RGB / (192/255)
  [128, [200, 100, 40, 255], [200, 100, 40, 255]],  // a 1: the colour; alpha 255, no divide
  [192, [255, 150, 10, 255], [255, 150, 10, 255]],  // a 1.5: 300 -> 255, 150, 100 - 90 = 10; alpha min(1, a)
  [255, [255, 199, 0, 255], [255, 199, 0, 255]],    // a 1.9921875: 398 -> 255, 199.2 -> 199, 100 - 119.5 -> 0
];

/** Case 20's ramp: one 4 x 4 cell per alpha byte 0..128, 32 to a row, the black fader over (200, 100, 50). */
const RAMP_BG: Q4 = [200, 100, 50, 128];
const rampCell = (k: number): [number, number] => [(k % 32) * 4, Math.floor(k / 32) * 4];
const rampPixel = (k: number): Q4 => [storeByte(200 + (0 - 200) * (k / 128)), storeByte(100 + (0 - 100) * (k / 128)), storeByte(50 + (0 - 50) * (k / 128)), 255];

const HD_A = [30, 60, 90, 255], HD_B = [200, 150, 100, 255];

export const UI_RASTER_CASES: readonly UiRasterCase[] = [
  C({
    id: 1, name: 'alpha above 1 under the source blend, coloured source: bold 192, a wrapped 250; sprite, untextured, glyph',
    rules: ['P8', 'P10', 'P18'], readings: ['GS_MODULATE_BLEND_READING', 'GS_SPRITE_COVERAGE_READING', 'RIGHT_EDGE_SUBTEXEL'], gpu: 'B',
    data: () => ({
      textures: { 'bold.tif': solid(8, 8, BOLD, 'source') },
      items: [
        clear(40, 80, 120),
        sprite('bold.tif', 8, 8, 16, 16, [128, 128, 128, 192]),
        sprite('bold.tif', 24, 8, 32, 16, [128, 128, 128, 250]),
        fill(40, 8, 48, 16, [200, 100, 50, 192]),
        glyphs([glyph('bold.tif', 56, 8, 64, 16, [128, 128, 128, 192])]),
      ],
    }),
    probes: [
      { x: 10, y: 10, rgba: [255, 110, 15, 255], why: 'a 1.5: 40 + 160 x 1.5 -> 255, 80 + 20 x 1.5, 120 - 70 x 1.5' },
      { x: 26, y: 10, rgba: [255, 119, 0, 255], why: 'a 250/128: 80 + 20 x 1.953125 = 119.06; 120 - 136.7 -> 0' },
      { x: 42, y: 10, rgba: [255, 110, 15, 255], why: 'untextured, the colour as it stands, the register source' },
      { x: 58, y: 10, rgba: [255, 110, 15, 255], why: 'a glyph quad at alpha 192' },
    ],
  }),
  C({
    id: 2, name: 'the additive 3D pass: a shared edge, drawn once at equal depth, twice where the later triangle is nearer',
    rules: ['M1', 'M2', 'M3', 'P11'], readings: ['UI_MODEL_EDGE_RULE_READING', 'UI_MODEL_DEPTH_FORMAT_READING', 'UI_MESH_BIND_READING', 'UI_MODEL_TEXTURE_ROWS_READING'], gpu: 'B',
    data: () => ({
      textures: { 'roll.tif': solid(4, 4, [60, 60, 60, 255], 'additive') },
      items: [clear(10, 10, 10), { kind: 'models', triangles: [
        tri('roll.tif', vtx(0, 0), vtx(0, 8), vtx(8, 0)), tri('roll.tif', vtx(8, 0), vtx(0, 8), vtx(8, 8)),
        tri('roll.tif', vtx(20, 0), vtx(20, 8), vtx(28, 0)), tri('roll.tif', vtx(28, 0, 2), vtx(20, 8, 2), vtx(28, 8, 2)),
      ] }],
    }),
    probes: [
      { x: 2, y: 2, rgba: [70, 70, 70, 255], why: '10 + 60' },
      { x: 4, y: 4, rgba: [70, 70, 70, 255], why: 'the shared edge at equal invW: the second triangle fails invW <= depth' },
      { x: 6, y: 6, rgba: [70, 70, 70, 255] },
      { x: 22, y: 2, rgba: [70, 70, 70, 255] },
      { x: 24, y: 4, rgba: [130, 130, 130, 255], why: 'the shared edge, the later triangle nearer: inclusive edges, drawn twice' },
      { x: 27, y: 1, rgba: [130, 130, 130, 255] },
      { x: 26, y: 6, rgba: [70, 70, 70, 255] },
    ],
  }),
  C({
    id: 3, name: 'a depth tie (equal invW): the first drawn triangle wins',
    rules: ['M3'], readings: ['UI_MODEL_DEPTH_FORMAT_READING', 'GS_ALPHA_FRAME_START_READING'], gpu: 'B',
    data: () => ({ textures: {}, items: [clear(0, 0, 0), { kind: 'models', triangles: [corner(null, 1, [128, 0, 0, 128]), corner(null, 1, [0, 128, 0, 128])] }] }),
    probes: [{ x: 1, y: 1, rgba: [128, 0, 0, 255] }, { x: 7, y: 7, rgba: [128, 0, 0, 255] }],
  }),
  C({
    id: 4, name: 'the transparent overlay\'s accumulation at fractional alpha, divided back to straight RGB',
    rules: ['P14', 'P22', 'P8'], readings: ['GS_MODULATE_BLEND_READING'], gpu: 'B',
    data: () => ({
      textures: { 'half.tif': solid(4, 4, [255, 255, 255, 128]) },
      items: [fill(0, 0, 4, 4, [200, 100, 0, 64]), fill(2, 2, 6, 6, [0, 0, 200, 32]), sprite('half.tif', 8, 0, 12, 4)],
    }),
    probes: [
      { x: 1, y: 1, rgba: [199, 100, 0, 128], mode: 'transparent', why: 'alpha 127.5 -> 128; 100 / (128/255) = 199.2' },
      { x: 3, y: 3, rgba: [120, 61, 80, 160], mode: 'transparent', why: 'alpha 128 + 127 x .25 = 159.75 -> 160; (75, 37.5 -> 38, 50) / (160/255)' },
      { x: 9, y: 1, rgba: [255, 255, 255, 128], mode: 'transparent', why: 'texel alpha 128/255: 255 x .502 = 128, divided back to 255' },
      { x: 1, y: 1, rgba: [100, 50, 0, 255] },
      { x: 3, y: 3, rgba: [75, 38, 50, 255], why: '50 - 12.5 = 37.5, stored half to even: 38' },
      { x: 9, y: 1, rgba: [128, 128, 128, 255] },
    ],
  }),
  C({
    id: 5, name: 'NaN, infinite, negative and above-255 colours; NaN and negative alpha',
    rules: ['P23', 'P9', 'P12', 'P8'], readings: ['GS_MODULATE_BLEND_READING', 'GS_BLEND_ROUNDING_READING'], gpu: 'B',
    data: () => ({
      textures: { 'grey.tif': solid(4, 4, [100, 100, 100, 255]), 'red.tif': solid(4, 4, [200, 0, 0, 255]) },
      items: [
        clear(100, 100, 100),
        fill(0, 0, 4, 4, [NaN, 50, 300, 128]),
        fill(8, 0, 12, 4, [-50, Infinity, -Infinity, 64]),
        fill(16, 0, 20, 4, [NaN, 0, 0, 0]),
        fill(24, 0, 28, 4, [50, 50, 50, NaN]),
        sprite('grey.tif', 32, 0, 36, 4, [NaN, 128, 128, 128]),
        sprite('red.tif', 40, 0, 44, 4, [128, 128, 128, -64]),
        fill(48, 0, 52, 4, [0, 0, 0, -64]),
      ],
    }),
    probes: [
      { x: 1, y: 1, rgba: [0, 50, 255, 255], why: 'NaN stores 0; 300 clamps' },
      { x: 9, y: 1, rgba: [25, 255, 0, 255], why: '100 - 75; +inf; -inf' },
      { x: 17, y: 1, rgba: [0, 100, 100, 255], why: 'a non-finite colour is not skipped at alpha 0: (NaN - 100) x 0 is NaN' },
      { x: 25, y: 1, rgba: [0, 0, 0, 0], why: 'NaN alpha: min(1, NaN) is NaN, so even the frame alpha stores 0' },
      { x: 33, y: 1, rgba: [0, 100, 100, 255], why: 'min(255, 100 x NaN / 128) is NaN' },
      { x: 41, y: 1, rgba: [50, 150, 150, 255], why: 'a -.5 extrapolates away from the texel' },
      { x: 49, y: 1, rgba: [150, 150, 150, 255] },
      { x: 25, y: 1, rgba: [0, 0, 0, 0], mode: 'transparent' },
    ],
  }),
  C({
    id: 6, name: 'repeat with negative and above-1 UVs on a 3 x 6 (non-power-of-two) bitmap',
    rules: ['P5', 'P6'], readings: ['UI_TEXTURE_FILTER_READING', 'UV_REPEAT_READING', 'UI_TEXTURE_WRAP_READING', 'GS_BILINEAR_WEIGHT_READING'], gpu: 'B',
    data: () => ({ textures: { 'npot.tif': pattern(3, 6, 0) }, items: [clear(0, 0, 0), sprite('npot.tif', 0, 0, 12, 12, [128, 128, 128, 128], [-1, -0.75, 2, 1.25])] }),
    probes: [
      // u = -3 + 9x/12, v = -4.5 + y: where u - .5 and v - .5 are whole the sample is one texel, column/row wrapped.
      { x: 2, y: 1, rgba: [3, 125, 91, 255], why: 'u -1.5, v -3.5: texel (wrap(-2, 3), wrap(-4, 6)) = (1, 2), i 7' },
      { x: 10, y: 9, rgba: [225, 159, 169, 255], why: 'u 4.5, v 4.5: texel (wrap(4, 3), 4) = (1, 4), i 13' },
      { x: 6, y: 5, rgba: [37, 91, 13, 255], why: 'u 1.5, v .5: texel (1, 0), i 1' },
    ],
  }),
  C({
    id: 7, name: 'fractional corners at scales 2 and 4: the scale applies before ceil',
    rules: ['P3', 'P21'], readings: ['GS_SPRITE_COVERAGE_READING', 'GS_SPRITE_SUBPIXEL_READING'], gpu: 'E',
    data: () => ({ textures: {}, items: [clear(0, 0, 0), fill(2.25, 1.5, 5.75, 3.5, [128, 64, 0, 128]), fill(10.6, 0.4, 12.4, 2.6, [0, 128, 0, 128])] }),
    probes: [
      ...([[3, 2, 1], [2, 2, 0], [5, 3, 1], [6, 3, 0], [3, 4, 0], [3, 1, 0]] as const).map(([x, y, on]) => ({ x, y, rgba: (on ? [128, 64, 0, 255] : [0, 0, 0, 255]) as Q4 })),
      ...([[5, 3, 1], [4, 3, 0], [11, 6, 1], [12, 6, 0], [5, 7, 0], [5, 2, 0]] as const).map(([x, y, on]) => ({ x, y, scale: 2 as const, rgba: (on ? [128, 64, 0, 255] : [0, 0, 0, 255]) as Q4, why: 'x from ceil(4.5) = 5, not 2 x ceil(2.25) = 6' })),
      ...([[9, 6, 1], [8, 6, 0], [22, 13, 1], [23, 13, 0], [9, 14, 0], [9, 5, 0]] as const).map(([x, y, on]) => ({ x, y, scale: 4 as const, rgba: (on ? [128, 64, 0, 255] : [0, 0, 0, 255]) as Q4 })),
      ...([[11, 1, 1], [10, 1, 0], [12, 2, 1], [13, 2, 0], [11, 0, 0], [11, 3, 0]] as const).map(([x, y, on]) => ({ x, y, rgba: (on ? [0, 128, 0, 255] : [0, 0, 0, 255]) as Q4 })),
      ...([[22, 1, 1], [21, 1, 0], [24, 5, 1], [25, 5, 0], [22, 0, 0]] as const).map(([x, y, on]) => ({ x, y, scale: 2 as const, rgba: (on ? [0, 128, 0, 255] : [0, 0, 0, 255]) as Q4 })),
      ...([[43, 2, 1], [42, 2, 0], [49, 10, 1], [50, 10, 0], [43, 1, 0], [43, 11, 0]] as const).map(([x, y, on]) => ({ x, y, scale: 4 as const, rgba: (on ? [0, 128, 0, 255] : [0, 0, 0, 255]) as Q4 })),
    ],
  }),
  C({
    id: 8, name: 'the movie at scale: a partial-size picture at the origin, RGB only, alpha untouched, nearest s x s',
    rules: ['P17'], readings: ['MOVIE_RECT_READING'], gpu: 'E',
    data: () => {
      const image = pattern(4, 3, 5, 7);
      return { textures: {}, items: [{ kind: 'movie', picture: { width: 4, height: 3, image }, x0: 0, y0: 0, x1: 640, y1: 448 }] };
    },
    probes: [
      { x: 1, y: 1, rgba: [190, 214, 100, 255], why: 'texel (1, 1), i 5; the picture\'s alpha 7 not written' },
      { x: 1, y: 1, rgba: [190, 214, 100, 0], mode: 'transparent', why: 'alpha untouched: 0, so no divide' },
      { x: 4, y: 0, rgba: [0, 0, 0, 255], why: 'beyond the picture\'s width' },
      { x: 3, y: 3, scale: 2, rgba: [190, 214, 100, 255], why: 'pixel / 2 = (1, 1)' },
      { x: 7, y: 5, scale: 2, rgba: [156, 248, 178, 255], why: 'texel (3, 2), i 11' },
      { x: 8, y: 0, scale: 2, rgba: [0, 0, 0, 255] },
      { x: 15, y: 11, scale: 4, rgba: [156, 248, 178, 255] },
      { x: 16, y: 0, scale: 4, rgba: [0, 0, 0, 255] },
      { x: 0, y: 0, scale: 4, mode: 'transparent', rgba: [5, 15, 35, 0] },
    ],
  }),
  C({
    id: 9, name: 'a clear in the middle of the list: the packed fill, alpha 255 even on a transparent frame',
    rules: ['P15', 'P14'], readings: ['FRAME_CLEAR_READING'], gpu: 'E*',
    data: () => ({ textures: {}, items: [fill(0, 0, 8, 8, [200, 0, 0, 128]), clear(10, 20, 30), fill(4, 4, 12, 12, [0, 0, 200, 64])] }),
    probes: [
      { x: 1, y: 1, rgba: [10, 20, 30, 255] },
      { x: 5, y: 5, rgba: [5, 10, 115, 255] },
      { x: 20, y: 20, rgba: [10, 20, 30, 255], mode: 'transparent' },
      { x: 5, y: 5, rgba: [5, 10, 115, 255], mode: 'transparent' },
    ],
  }),
  C({
    id: 10, name: 'an undrawn bitmap, an undrawn glyph atlas and the no-picture movie leave the register as it stands',
    rules: ['P2', 'P16', 'P20', 'P11'], readings: ['GS_MODULATE_BLEND_READING', 'MOVIE_HOLD_READING'], gpu: 'B',
    data: () => ({
      textures: { 'glow.tif': solid(8, 8, GLOW, 'additive') },
      items: [
        clear(50, 50, 50),
        sprite('glow.tif', 0, 0, 4, 4),
        sprite('missing.tif', 0, 0, 4, 4),
        glyphs([glyph('gone.tif', 4, 0, 8, 4)]),
        fill(0, 0, 64, 64, [0, 0, 0, 128], null, 'MENUFADER'),
        { kind: 'movie', picture: null, x0: 100, y0: 0, x1: 108, y1: 8 },
        fill(200, 0, 208, 8, [100, 0, 0, 64]),
      ],
    }),
    undrawn: ['q: no bitmap missing.tif', 't: no bitmap gone.tif'],
    probes: [
      { x: 1, y: 1, rgba: [150, 110, 70, 255], why: 'glow added; the fader after it adds black' },
      { x: 10, y: 10, rgba: [50, 50, 50, 255], why: 'the fader under the additive register: no change' },
      { x: 101, y: 1, rgba: [0, 0, 0, 255], why: 'the no-picture movie: black, alpha 128, source' },
      { x: 201, y: 1, rgba: [100, 50, 50, 255], why: 'still additive after the movie quad: 50 + 100 x .5' },
    ],
  }),
  C({
    id: 11, name: 'overlapping glyph quads at alpha 192: each quad blends over the one before (a batch must split them)',
    rules: ['P10', 'P18', 'P12'], readings: ['GS_MODULATE_BLEND_READING', 'GS_BLEND_ROUNDING_READING'], gpu: 'B',
    data: () => ({
      textures: { 'bold.tif': solid(8, 8, BOLD, 'source') },
      items: [clear(40, 80, 120), glyphs([
        glyph('bold.tif', 10, 10, 18, 18, [128, 128, 128, 192]),
        glyph('bold.tif', 14, 10, 22, 18, [128, 128, 128, 192]),
        glyph('bold.tif', 12, 14, 20, 22, [128, 128, 128, 192]),
      ])],
    }),
    probes: [
      { x: 11, y: 11, rgba: [255, 110, 15, 255], why: 'once' },
      { x: 15, y: 11, rgba: [172, 95, 68, 255], why: 'twice: 255 - 82.5 = 172.5 -> 172, 110 - 15, 15 + 52.5 = 67.5 -> 68' },
      { x: 13, y: 15, rgba: [172, 95, 68, 255] },
      { x: 15, y: 15, rgba: [214, 102, 41, 255], why: 'three times: 172 + 42, 95 + 7.5 = 102.5 -> 102, 68 - 27' },
      { x: 19, y: 19, rgba: [255, 110, 15, 255] },
    ],
  }),
  C({
    id: 12, name: 'a blend change inside a glyph item: each quad binds its atlas; the fader after takes the last',
    rules: ['P2', 'P18', 'P10', 'P11'], readings: ['GS_MODULATE_BLEND_READING'], gpu: 'B',
    data: () => ({
      textures: { 'font.tif': solid(8, 8, GLOW, 'source'), 'glowfont.tif': solid(8, 8, GLOW, 'additive') },
      items: [
        clear(50, 50, 50),
        glyphs([glyph('font.tif', 0, 0, 4, 4), glyph('glowfont.tif', 4, 0, 8, 4), glyph('font.tif', 8, 0, 12, 4)]),
        fill(0, 8, 4, 12, [0, 0, 0, 128]),
        glyphs([glyph('glowfont.tif', 20, 0, 24, 4)]),
        fill(20, 8, 24, 12, [0, 0, 0, 128]),
      ],
    }),
    probes: [
      { x: 1, y: 1, rgba: [100, 60, 20, 255] },
      { x: 5, y: 1, rgba: [150, 110, 70, 255] },
      { x: 9, y: 1, rgba: [100, 60, 20, 255] },
      { x: 1, y: 9, rgba: [0, 0, 0, 255], why: 'the last glyph bound source' },
      { x: 21, y: 9, rgba: [50, 50, 50, 255], why: 'the last glyph bound additive' },
    ],
  }),
  ...(['cold', 'warm', 'hot'] as const).map((variant) => C({
    id: 13, variant, name: `an HD residency switch mid-dialog (${variant}: ${variant === 'cold' ? 'nothing resident' : variant === 'warm' ? 'the background resident' : 'both resident'})`,
    rules: ['P18', 'P5', 'P6'], readings: ['UI_TEXTURE_FILTER_READING', 'UV_REPEAT_READING'], gpu: 'B',
    data: () => ({
      textures: { 'bg.tif': pattern(8, 8, 1), 'panel.tif': solid(4, 4, [10, 200, 30, 255]) },
      ...(variant === 'cold' ? {} : { hd: { 'bg.tif': pattern(32, 32, 9), ...(variant === 'hot' ? { 'panel.tif': solid(16, 16, [200, 10, 30, 255]) } : {}) } }),
      items: [clear(0, 0, 0), sprite('bg.tif', 0, 0, 64, 64, [128, 128, 128, 128], [0.01, 0.01, 0.99, 0.99]), sprite('panel.tif', 20, 20, 28, 28)],
    }),
    probes: [{ x: 24, y: 24, rgba: variant === 'hot' ? [200, 10, 30, 255] : [10, 200, 30, 255] }],
  })),
  C({
    id: 14, name: 'a one-column clip, a zero-width clip, a clip past the frame, a clip outside it, a negative clip',
    rules: ['P3', 'P4'], readings: ['GS_SPRITE_COVERAGE_READING'], gpu: 'E',
    data: () => {
      const red: Q4 = [128, 0, 0, 128];
      return { textures: {}, items: [
        clear(0, 0, 0),
        fill(0, 0, 16, 16, red, { x0: 4, y0: 4, x1: 4, y1: 8 }),
        fill(20, 0, 36, 16, red, { x0: 24, y0: 0, x1: 23, y1: 10 }),
        fill(600, 400, 640, 448, red, { x0: 630, y0: 440, x1: 700, y1: 500 }),
        fill(600, 0, 640, 10, red, { x0: 700, y0: 0, x1: 800, y1: 10 }),
        fill(-5, -5, 10, 10, [0, 128, 0, 128], { x0: -10, y0: -10, x1: 2, y1: 2 }),
      ] };
    },
    probes: [
      ...([[4, 4, 'r'], [3, 4, '-'], [5, 4, '-'], [4, 8, 'r'], [4, 9, '-'], [24, 4, '-'], [23, 4, '-'], [630, 440, 'r'], [639, 447, 'r'], [629, 440, '-'], [630, 439, '-'],
        [620, 5, '-'], [0, 0, 'g'], [2, 2, 'g'], [3, 2, '-'], [2, 3, '-']] as const).map(([x, y, c]) => ({ x, y, rgba: (c === 'r' ? [128, 0, 0, 255] : c === 'g' ? [0, 128, 0, 255] : [0, 0, 0, 255]) as Q4 })),
      ...([[8, 8, 'r'], [9, 17, 'r'], [10, 8, '-'], [7, 8, '-'], [8, 18, '-'], [48, 4, '-'], [5, 5, 'g'], [6, 5, '-']] as const).map(([x, y, c]) => ({ x, y, scale: 2 as const, rgba: (c === 'r' ? [128, 0, 0, 255] : c === 'g' ? [0, 128, 0, 255] : [0, 0, 0, 255]) as Q4, why: 'clip x0 s .. (x1 + 1) s - 1' })),
      ...([[2520, 1760, 'r'], [2559, 1791, 'r'], [2519, 1760, '-']] as const).map(([x, y, c]) => ({ x, y, scale: 4 as const, rgba: (c === 'r' ? [128, 0, 0, 255] : [0, 0, 0, 255]) as Q4 })),
    ],
  }),
  C({
    id: 15, name: 'a 2048 x 2048 HD image drawn over the whole frame (the 2560 x 1792 target at scale 4; the MAX_TEXTURE_SIZE route)',
    rules: ['P5', 'P6', 'P21'], readings: ['UI_TEXTURE_FILTER_READING', 'UV_REPEAT_READING', 'GS_BILINEAR_WEIGHT_READING'], gpu: 'B',
    data: () => {
      const big = solid(2048, 2048, HD_A);                                // columns 0..1023 A, 1024..2047 B
      for (let y = 0; y < 2048; y++) for (let x = 1024; x < 2048; x++) big.data.set(HD_B, (y * 2048 + x) * 4);
      return { textures: { 'bg.tif': pattern(64, 64, 3) }, hd: { 'bg.tif': big }, items: [clear(0, 0, 0), sprite('bg.tif', 0, 0, 640, 448)] };
    },
    probes: [
      { x: 100, y: 100, rgba: [30, 60, 90, 255], why: 'u = 2048 x 100 / 640 = 320: both taps in the A half' },
      { x: 600, y: 100, rgba: [200, 150, 100, 255], why: 'u 1920: the B half' },
      { x: 200, y: 200, scale: 2, rgba: [30, 60, 90, 255] },
      { x: 400, y: 400, scale: 4, rgba: [30, 60, 90, 255] },
      { x: 2400, y: 400, scale: 4, rgba: [200, 150, 100, 255] },
    ],
  }),
  C({
    id: 16, name: 'an alpha-0 texel in front of an opaque triangle: the opaque one shows, and its depth wins over a farther one',
    rules: ['M6', 'M3'], readings: ['UI_MODEL_ZWRITE_READING', 'UI_MODEL_DEPTH_FORMAT_READING', 'UI_MODEL_TEXTURE_ROWS_READING'], gpu: 'B',
    data: () => ({
      textures: { 'clear.tif': solid(8, 8, [255, 255, 255, 0]) },
      items: [clear(0, 0, 0), { kind: 'models', triangles: [corner('clear.tif', 1 / 10), corner(null, 1 / 20, [128, 0, 0, 128]), corner(null, 1 / 50, [0, 0, 128, 128])] }],
    }),
    probes: [
      { x: 1, y: 1, rgba: [128, 0, 0, 255], why: 'the clear texel wrote no depth; the far blue fails the opaque one\'s depth' },
      { x: 5, y: 5, rgba: [128, 0, 0, 255] },
    ],
  }),
  C({
    id: 17, name: 'a model over a transparent frame: the frame\'s alpha bytes unchanged',
    rules: ['M7', 'P14', 'P22'], readings: ['GS_ALPHA_FRAME_START_READING', 'UI_MODEL_EDGE_RULE_READING'], gpu: 'B',
    data: () => ({ textures: {}, items: [fill(8, 8, 24, 24, [0, 0, 200, 64]), { kind: 'models', triangles: [corner(null, 1, [128, 0, 0, 128])] }] }),
    probes: [
      { x: 1, y: 1, rgba: [128, 0, 0, 0], mode: 'transparent', why: 'RGB written, alpha left 0: no divide' },
      { x: 8, y: 8, rgba: [255, 0, 0, 128], mode: 'transparent', why: 'the quad\'s alpha 128 kept; 128 / (128/255)' },
      { x: 12, y: 12, rgba: [0, 0, 199, 128], mode: 'transparent' },
      { x: 1, y: 1, rgba: [128, 0, 0, 255] },
      { x: 8, y: 8, rgba: [128, 0, 0, 255], why: 'on the hypotenuse: inclusive' },
      { x: 12, y: 12, rgba: [0, 0, 100, 255] },
    ],
  }),
  C({
    id: 18, name: 'a quad after a models item: the register as the pass leaves it (a drawn bind sets it; cull, missing, zero area do not)',
    rules: ['P2', 'M1'], readings: ['UI_MESH_BIND_READING', 'GS_MODULATE_BLEND_READING'], gpu: 'B',
    data: () => ({
      textures: { 'glow.tif': solid(8, 8, GLOW, 'additive'), 'plain.tif': solid(8, 8, GLOW, 'source') },
      items: [
        clear(50, 50, 50),
        sprite('plain.tif', 100, 100, 108, 108),
        { kind: 'models', triangles: [
          tri('glow.tif', vtx(0, 0), vtx(0, 16), vtx(16, 0)),
          tri('plain.tif', vtx(20, 0), vtx(36, 0), vtx(20, 16)),
          tri('gone.tif', vtx(40, 0), vtx(40, 16), vtx(56, 0), false, 'm'),
        ] },
        fill(200, 0, 208, 8, [0, 0, 0, 128], null, 'MENUFADER'),
        sprite('plain.tif', 120, 100, 128, 108),
        { kind: 'models', triangles: [tri('glow.tif', vtx(60, 0), vtx(60, 0), vtx(70, 10))] },
        fill(220, 0, 228, 8, [0, 0, 0, 128], null, 'MENUFADER'),
      ],
    }),
    undrawn: ['m: no bitmap gone.tif'],
    probes: [
      { x: 2, y: 2, rgba: [150, 110, 70, 255], why: 'the glow triangle, added' },
      { x: 22, y: 2, rgba: [50, 50, 50, 255], why: 'the back face, culled' },
      { x: 42, y: 2, rgba: [50, 50, 50, 255], why: 'the missing bitmap, not drawn' },
      { x: 202, y: 2, rgba: [50, 50, 50, 255], why: 'the fader under the glow\'s additive (the culled and missing set nothing)' },
      { x: 102, y: 102, rgba: [100, 60, 20, 255] },
      { x: 222, y: 2, rgba: [0, 0, 0, 255], why: 'the zero-area triangle is dropped before its bind: source stands' },
    ],
  }),
  ...CASE_19.map(([alpha, opaque, transparent]) => C({
    id: 19, variant: `a${alpha}`, name: `case 4's frame-alpha rule at source alpha ${alpha}, over a half-alpha quad`,
    rules: ['P14', 'P22', 'P9', 'P10'], readings: ['GS_MODULATE_BLEND_READING', 'GS_BLEND_ROUNDING_READING'], gpu: 'E*',
    data: () => ({ textures: {}, items: [fill(0, 0, 8, 8, [0, 0, 200, 64]), fill(0, 0, 4, 4, [200, 100, 40, alpha])] }),
    probes: [
      { x: 1, y: 1, rgba: opaque },
      { x: 1, y: 1, rgba: transparent, mode: 'transparent' },
      { x: 6, y: 6, rgba: [0, 0, 100, 255] },
      { x: 6, y: 6, rgba: [0, 0, 199, 128], mode: 'transparent' },
    ],
  })),
  C({
    id: 20, name: 'a fractional untextured fade ramp: the black fader at every alpha byte 0..128 over (200, 100, 50)',
    rules: ['P13', 'P9', 'P10', 'P12'], readings: ['GS_MODULATE_BLEND_READING', 'GS_ALPHA_FRAME_START_READING', 'GS_BLEND_ROUNDING_READING'], gpu: 'E*',
    data: () => ({
      textures: {},
      items: [fill(0, 0, 128, 20, RAMP_BG), ...Array.from({ length: 129 }, (_, k) => { const [x, y] = rampCell(k); return fill(x, y, x + 4, y + 4, [0, 0, 0, k], null, 'MENUFADER'); })],
    }),
    probes: Array.from({ length: 129 }, (_, k) => {
      const [x, y] = rampCell(k);
      return { x: x + 1, y: y + 1, rgba: rampPixel(k), why: `alpha ${k}: c + (0 - c) x ${k}/128, stored half to even` };
    }),
  }),
];

/** A case's inputs to `rasterizeUiDrawList` at a scale and a frame mode (a fresh quad cache: no order dependence). */
export function caseRasterInputs(c: UiRasterCase, scale: UiRasterScale, mode: UiRasterMode, preDivide = false): { items: UiDrawItem[]; textures: UiTextures; options: RasterOptions } {
  const d = c.data();
  const textures: UiTextures = (name) => d.textures[name] ?? null;
  const options: RasterOptions = { scale, transparent: mode === 'transparent', quadCache: new UiQuadRasterCache(), movie: (p) => p.image as Rgba };
  if (preDivide) options.preDivide = true;      // GM-09: the transparent frame before its divide back to straight RGB
  if (d.hd) {
    const byBitmap = new Map<UiBitmap, Rgba>();
    for (const [name, image] of Object.entries(d.hd)) { const b = d.textures[name]; if (b) byBitmap.set(b, image); }
    options.hd = (b) => byBitmap.get(b) ?? null;
  }
  return { items: d.items, textures, options };
}

/** The key of one pinned run: `<case key>@<scale>x/<mode>`. */
export const caseRunKey = (c: UiRasterCase, scale: UiRasterScale, mode: UiRasterMode): string => `${c.key}@${scale}x/${mode}`;

// ---- GM-15b: seams (research 380 M2, M3; the GM-15 row's "seam and tie cases") -----------------------------------------

/** One square of `seamSquares`: its top-left corner and side at scale 1, and the invW of its four corners. */
export interface UiSeamSquare { x: number; y: number; n: number; invW: number }
/** The seam list's clear (every channel) and its additive texel (every channel): a pixel drawn once is 70, twice 130. */
export const UI_SEAM_CLEAR = 10;
export const UI_SEAM_TEXEL = 60;

/**
 * GM-15b: a list of squares on a grid (none overlaps another), each split along its anti-diagonal into two front-facing
 * triangles that share that edge (case 2's first pair, generalised): every vertex of square k at `invWs[k]`, one
 * additive 4 x 4 texture of `UI_SEAM_TEXEL`, sides 8, 16, 32 in turn (powers of two, so every barycentric weight is
 * dyadic at every scale). The inclusive-edge rule (M2, `UI_MODEL_EDGE_RULE_READING`) puts each seam pixel in both
 * triangles; the depth test (M3, `UI_MODEL_DEPTH_FORMAT_READING`) decides whether the second adds its texel again.
 */
export function seamSquares(invWs: readonly number[]): { items: UiDrawItem[]; textures: UiTextures; squares: UiSeamSquare[] } {
  const squares = invWs.map((invW, k): UiSeamSquare => ({ x: 4 + 40 * (k % 12), y: 4 + 40 * Math.floor(k / 12), n: [8, 16, 32][k % 3]!, invW }));
  const triangles: UiModelTriangle[] = squares.flatMap(({ x, y, n, invW }, k) => [
    tri('seam.tif', vtx(x, y, invW), vtx(x, y + n, invW), vtx(x + n, y, invW), true, `s${k}a`),
    tri('seam.tif', vtx(x + n, y, invW), vtx(x, y + n, invW), vtx(x + n, y + n, invW), true, `s${k}b`),
  ]);
  const bitmap = solid(4, 4, [UI_SEAM_TEXEL, UI_SEAM_TEXEL, UI_SEAM_TEXEL, 255], 'additive');
  return { items: [clear(UI_SEAM_CLEAR, UI_SEAM_CLEAR, UI_SEAM_CLEAR), { kind: 'models', triangles }], textures: (name) => (name === 'seam.tif' ? bitmap : null), squares };
}

/**
 * The seam pixels of one square at a scale: the integer points strictly inside its shared edge, (x s + i, (y + n) s - i)
 * for i = 1 .. n s - 1 (the edge's two ends lie on the boxes' exclusive right column and bottom row, `ceil(max)`).
 */
export function seamPixels(sq: UiSeamSquare, scale: number): [number, number][] {
  const x = sq.x * scale, y = sq.y * scale, n = sq.n * scale;
  return Array.from({ length: n - 1 }, (_, k): [number, number] => [x + k + 1, y + n - k - 1]);
}

/**
 * SHA-256 of `rasterizeUiDrawList`'s frame bytes for every case, scale and mode, taken from the software on
 * `agent/gpu-menus` at 95c4fa80e, whose `uiCompositorView.ts` and `@s2u/ui` are main cbe52f724's (v0.4.1). A later executor equal to the software reproduces these exactly.
 */
export const UI_RASTER_SOFTWARE_SHA256: Readonly<Record<string, string>> = {
  '1@1x/opaque': '63a0b669dc4f46fe08ad91a74383b1bc21b36cc9661ad62934c1c6795a51efad',
  '1@1x/transparent': '63a0b669dc4f46fe08ad91a74383b1bc21b36cc9661ad62934c1c6795a51efad',
  '1@2x/opaque': '2e7e5fc60f6bae302085894bb6400aad8c90b64b15612ee125d574712762fd2c',
  '1@2x/transparent': '2e7e5fc60f6bae302085894bb6400aad8c90b64b15612ee125d574712762fd2c',
  '1@4x/opaque': '100672c67b50fa765134a80ba0c7af1533fcbf9c389cc1b2d049f853d3fc6788',
  '1@4x/transparent': '100672c67b50fa765134a80ba0c7af1533fcbf9c389cc1b2d049f853d3fc6788',
  '2@1x/opaque': '4979ec144b9736a09bbe118055bcfceea663578cd2f1bfd7afe6f038a8bf09b2',
  '2@1x/transparent': '4979ec144b9736a09bbe118055bcfceea663578cd2f1bfd7afe6f038a8bf09b2',
  '2@2x/opaque': '80b01cdf03d13380350fb219191a4cfbb7294062812f567609cfa326a97d7260',
  '2@2x/transparent': '80b01cdf03d13380350fb219191a4cfbb7294062812f567609cfa326a97d7260',
  '2@4x/opaque': 'a717cfb29c8a2c60689504d2b8acc89233b8650f337e4c4af17f56a24ae59293',
  '2@4x/transparent': 'a717cfb29c8a2c60689504d2b8acc89233b8650f337e4c4af17f56a24ae59293',
  '3@1x/opaque': '0d4daf49ba98a25100a29bc27d73c0bd621ee039469de5d282cee40fbe1a87b3',
  '3@1x/transparent': '0d4daf49ba98a25100a29bc27d73c0bd621ee039469de5d282cee40fbe1a87b3',
  '3@2x/opaque': 'c5d322ed017ce1240aa8e1967f7f023e3e12b049aa8a22049f7d701da8d2a119',
  '3@2x/transparent': 'c5d322ed017ce1240aa8e1967f7f023e3e12b049aa8a22049f7d701da8d2a119',
  '3@4x/opaque': '3215077d4f2ba095e540f56f8dc732d2074c3d6c49baf8ef8728a82e6120aa14',
  '3@4x/transparent': '3215077d4f2ba095e540f56f8dc732d2074c3d6c49baf8ef8728a82e6120aa14',
  '4@1x/opaque': 'f83d4aa63e2e58a004d2f87f428dd5d910986f7892d02cabf110be189b4fc326',
  '4@1x/transparent': 'a148f92e8305ad29ec1476b849e1c92989e648f2c45cf5ced77141185dec073c',
  '4@2x/opaque': 'b0dc9a2a1a9a877ff6ea92b04c288b78bd769d7b30c1d33797ab401de03cca12',
  '4@2x/transparent': '1078005cc5dbfe21b3164b3662d328debd2fa0126c196b9145e6561b55e8ecb8',
  '4@4x/opaque': '7576e0a81ce1f213595f326682d157428df93625cb38791765385877232a5369',
  '4@4x/transparent': '364b717ac7945e5e1f56ef5ea73c1187ea2e2f0dba697ea2f486eccb5e1c928a',
  '5@1x/opaque': '04ffa5ac2c51aeeba37764969c197c3d4ac4dda89b2b5d808b7c12d0f743ba0e',
  '5@1x/transparent': '04ffa5ac2c51aeeba37764969c197c3d4ac4dda89b2b5d808b7c12d0f743ba0e',
  '5@2x/opaque': '321a503c7406860290e947cb5b0a086d17cd40ed928bf91a05f55b0ad9d905d3',
  '5@2x/transparent': '321a503c7406860290e947cb5b0a086d17cd40ed928bf91a05f55b0ad9d905d3',
  '5@4x/opaque': '7fd69f95baa9494bad429da0a8cd954f70cc7bb6fa3a51f34260d015891597f5',
  '5@4x/transparent': '7fd69f95baa9494bad429da0a8cd954f70cc7bb6fa3a51f34260d015891597f5',
  '6@1x/opaque': '00c5cf381dcc71adb8602672a8e16357acc01b04d39203e2d4666ea9b156fde5',
  '6@1x/transparent': '00c5cf381dcc71adb8602672a8e16357acc01b04d39203e2d4666ea9b156fde5',
  '6@2x/opaque': '33356dc4eda15ea265502c69e3d853a478ed8f17997497f152de9c0d9eba5290',
  '6@2x/transparent': '33356dc4eda15ea265502c69e3d853a478ed8f17997497f152de9c0d9eba5290',
  '6@4x/opaque': '998cec68162fae9bfee43521085745b744f0ec8b61eb640e9d17b27b346d1c80',
  '6@4x/transparent': '998cec68162fae9bfee43521085745b744f0ec8b61eb640e9d17b27b346d1c80',
  '7@1x/opaque': '531aaa6fc59deb3df8db43fe331f83338a4eda25a548b9cf596bd3815149e22b',
  '7@1x/transparent': '531aaa6fc59deb3df8db43fe331f83338a4eda25a548b9cf596bd3815149e22b',
  '7@2x/opaque': '52e708687a227bc62585e8e2eb3c83001879103d9fe52d6f3f6a716dd318df63',
  '7@2x/transparent': '52e708687a227bc62585e8e2eb3c83001879103d9fe52d6f3f6a716dd318df63',
  '7@4x/opaque': '2db8b4c5d7fc050cadb7a80090d590bdc8300eff58c4d65f6686f6ef4ea0534e',
  '7@4x/transparent': '2db8b4c5d7fc050cadb7a80090d590bdc8300eff58c4d65f6686f6ef4ea0534e',
  '8@1x/opaque': 'ca63e7880dae8f2f0e7f330aa16d64450f0c0e69e7f54b27db6057511aa419f8',
  '8@1x/transparent': '274b255e6b790ffbb85b3c6ecddf2ceae3799451a26fd25bb7c014863ec477c9',
  '8@2x/opaque': 'cc1473009bef2df82d92b59343a763d84ca624ac8fffe20bcfcc539151c93915',
  '8@2x/transparent': 'a6e5bc9abe546b51dff1d450990095d04080e3f20baa340093bf5072ae515858',
  '8@4x/opaque': '02ab3ca384913952601dec1a7d9a36a97331f02664792f71965d1f1e0ca2762f',
  '8@4x/transparent': 'ec784b10cc126de6cf4c8996d8746e51fea0844a2fa4f72a602c4c229e3f23c8',
  '9@1x/opaque': '1a7ec5087e87a6fa30876617e39e9000050adfd3414d90045c77b79a8d7c3218',
  '9@1x/transparent': '1a7ec5087e87a6fa30876617e39e9000050adfd3414d90045c77b79a8d7c3218',
  '9@2x/opaque': 'a7aa7356246bde830764d1a85fdfe9f1ba5d4edcbce96b2f7798f148dd9cf079',
  '9@2x/transparent': 'a7aa7356246bde830764d1a85fdfe9f1ba5d4edcbce96b2f7798f148dd9cf079',
  '9@4x/opaque': '05b8a35b0ba1a928d50d47d31b333c2e878257ab93ebc1475edfc6b8aaced4e0',
  '9@4x/transparent': '05b8a35b0ba1a928d50d47d31b333c2e878257ab93ebc1475edfc6b8aaced4e0',
  '10@1x/opaque': '3f78510781e6e03c2e365dd6164d9d5e883aa070f3ad50074808581a9c667fdd',
  '10@1x/transparent': '3f78510781e6e03c2e365dd6164d9d5e883aa070f3ad50074808581a9c667fdd',
  '10@2x/opaque': '8635a62fb004ee71b9ce2263087c594dc814fbea3ef90885092639373d52b812',
  '10@2x/transparent': '8635a62fb004ee71b9ce2263087c594dc814fbea3ef90885092639373d52b812',
  '10@4x/opaque': '217b9f63ada4244c5f043654c30fe8301fe7c4d01541b001f386f59653aace82',
  '10@4x/transparent': '217b9f63ada4244c5f043654c30fe8301fe7c4d01541b001f386f59653aace82',
  '11@1x/opaque': '5299ff0ef91f0fbfb26537c54d4dc2a5f8ae2f1d177bf259ae5b786c52268499',
  '11@1x/transparent': '5299ff0ef91f0fbfb26537c54d4dc2a5f8ae2f1d177bf259ae5b786c52268499',
  '11@2x/opaque': '901623782d4f5bd87c6517dc5a2ccd0c4139662e30e911a142253eeced70e5cd',
  '11@2x/transparent': '901623782d4f5bd87c6517dc5a2ccd0c4139662e30e911a142253eeced70e5cd',
  '11@4x/opaque': 'b6633286f9f39385f11535d70b6212017f8561da3baef55b47427f99aad365e4',
  '11@4x/transparent': 'b6633286f9f39385f11535d70b6212017f8561da3baef55b47427f99aad365e4',
  '12@1x/opaque': 'cf00ee238b28f5f74a5a5d753d3ccda5f50e8aa5e08833c6121c302335c9754b',
  '12@1x/transparent': 'cf00ee238b28f5f74a5a5d753d3ccda5f50e8aa5e08833c6121c302335c9754b',
  '12@2x/opaque': '1d1667def9965890d75f2f2907e56cf05ddcb247327263e7307815f3e38ad09b',
  '12@2x/transparent': '1d1667def9965890d75f2f2907e56cf05ddcb247327263e7307815f3e38ad09b',
  '12@4x/opaque': '14cec0b41a1a2817368aa6f66c72123dd495c7dd3814399943873712466e3a2a',
  '12@4x/transparent': '14cec0b41a1a2817368aa6f66c72123dd495c7dd3814399943873712466e3a2a',
  '13.cold@1x/opaque': 'ada79c42394a1a0e294461c67f42abe14b1a631c904e12c24c0e3cec8d3b7c17',
  '13.cold@1x/transparent': 'ada79c42394a1a0e294461c67f42abe14b1a631c904e12c24c0e3cec8d3b7c17',
  '13.cold@2x/opaque': '02a2d954377e636fd97aeb5c9f7434b1b07e52b77ba8fd9b89747785cb76108f',
  '13.cold@2x/transparent': '02a2d954377e636fd97aeb5c9f7434b1b07e52b77ba8fd9b89747785cb76108f',
  '13.cold@4x/opaque': '88183610daffc8d4c49a0d7691d8c744b5188631f9537bfefa58f364044caaad',
  '13.cold@4x/transparent': '88183610daffc8d4c49a0d7691d8c744b5188631f9537bfefa58f364044caaad',
  '13.warm@1x/opaque': '12921de411060ea5b27844591d64a375417c01f6f67bc7fb8b214cc8e62c992c',
  '13.warm@1x/transparent': '12921de411060ea5b27844591d64a375417c01f6f67bc7fb8b214cc8e62c992c',
  '13.warm@2x/opaque': 'e695549c276f6fb44d5742a90f78b47029bb422143efe4590518459faa318896',
  '13.warm@2x/transparent': 'e695549c276f6fb44d5742a90f78b47029bb422143efe4590518459faa318896',
  '13.warm@4x/opaque': '2db614a4c697ffa9126cad11b814fe6cc64c6d58811083ef93fc4142f029f7c8',
  '13.warm@4x/transparent': '2db614a4c697ffa9126cad11b814fe6cc64c6d58811083ef93fc4142f029f7c8',
  '13.hot@1x/opaque': '1e859b368347adf7037ca826d9b2e65a9108d1b949889ddab82a8769bb0c8b92',
  '13.hot@1x/transparent': '1e859b368347adf7037ca826d9b2e65a9108d1b949889ddab82a8769bb0c8b92',
  '13.hot@2x/opaque': 'b06952a5855485923e7492d441676dc7683a4d176e8f3c89d33f718f5674a3bc',
  '13.hot@2x/transparent': 'b06952a5855485923e7492d441676dc7683a4d176e8f3c89d33f718f5674a3bc',
  '13.hot@4x/opaque': '23a0a7dad5dd3e50242f999bc72b55bb90fe37fad384d02e6158ecf103084f5d',
  '13.hot@4x/transparent': '23a0a7dad5dd3e50242f999bc72b55bb90fe37fad384d02e6158ecf103084f5d',
  '14@1x/opaque': '7445691847650a60e3482cf9cd72ceda45fba631de2190b47997a061efdb101c',
  '14@1x/transparent': '7445691847650a60e3482cf9cd72ceda45fba631de2190b47997a061efdb101c',
  '14@2x/opaque': '323bcec597216b3d726c133a395f7b75aadb9c14c39e92074873fd3dd2bd05d2',
  '14@2x/transparent': '323bcec597216b3d726c133a395f7b75aadb9c14c39e92074873fd3dd2bd05d2',
  '14@4x/opaque': 'd70e170f53a7ed6bb683cd32cc80051d7bb45133cb8a1bb9f3d253ddad1c2832',
  '14@4x/transparent': 'd70e170f53a7ed6bb683cd32cc80051d7bb45133cb8a1bb9f3d253ddad1c2832',
  '15@1x/opaque': 'd92eb10bb41d2db389ba3ccc824e0e7465ded7ec50950b7514087f102b4ea9c7',
  '15@1x/transparent': 'd92eb10bb41d2db389ba3ccc824e0e7465ded7ec50950b7514087f102b4ea9c7',
  '15@2x/opaque': '5bf88e1e2fec5991e198af1049b850dfb4723f9fd0ed671eb28ca4ff042edd69',
  '15@2x/transparent': '5bf88e1e2fec5991e198af1049b850dfb4723f9fd0ed671eb28ca4ff042edd69',
  '15@4x/opaque': 'a7581a84100b09613e3d19068a0db1b8b54bc379e9761113ea9fb4a00b050773',
  '15@4x/transparent': 'a7581a84100b09613e3d19068a0db1b8b54bc379e9761113ea9fb4a00b050773',
  '16@1x/opaque': '0d4daf49ba98a25100a29bc27d73c0bd621ee039469de5d282cee40fbe1a87b3',
  '16@1x/transparent': '0d4daf49ba98a25100a29bc27d73c0bd621ee039469de5d282cee40fbe1a87b3',
  '16@2x/opaque': 'c5d322ed017ce1240aa8e1967f7f023e3e12b049aa8a22049f7d701da8d2a119',
  '16@2x/transparent': 'c5d322ed017ce1240aa8e1967f7f023e3e12b049aa8a22049f7d701da8d2a119',
  '16@4x/opaque': '3215077d4f2ba095e540f56f8dc732d2074c3d6c49baf8ef8728a82e6120aa14',
  '16@4x/transparent': '3215077d4f2ba095e540f56f8dc732d2074c3d6c49baf8ef8728a82e6120aa14',
  '17@1x/opaque': 'ee9d164755ebc4b3b621125a149ef9adb739d6297a37a03725a3b7db890b272d',
  '17@1x/transparent': 'a7e54bec55b03b06a59b9eca29713e36140b33192f2a8a7572e49c5b94996aaa',
  '17@2x/opaque': 'd6e1d3aba0c23ee5981d08e9bf61f05926ff5f556e2625fc309eeab84798fc83',
  '17@2x/transparent': '20f6954f19d31bd809375e2581971fd70499c9eb51eb4140cb3699aa096097dd',
  '17@4x/opaque': '7eaa684ec3ee150068387d6bbdd6b396ef0b43cd6391dc4dcd6879c7edb5364c',
  '17@4x/transparent': 'c4c71728e27236982f709a29c51f9886ace1a896d69b4fea4548dbbed4c00391',
  '18@1x/opaque': '4b9ec32bfc8bc8f55f014be053f7fb62b0eeca2e9797cfae8ec66368446bbb70',
  '18@1x/transparent': '4b9ec32bfc8bc8f55f014be053f7fb62b0eeca2e9797cfae8ec66368446bbb70',
  '18@2x/opaque': 'c1b6388b585a681520407fbe9a83ddeda7b6f772eff1434971e19a8a57808b77',
  '18@2x/transparent': 'c1b6388b585a681520407fbe9a83ddeda7b6f772eff1434971e19a8a57808b77',
  '18@4x/opaque': '709b17cc6d33508eba3197172e781a21dcecc661ad808f5ee8ce2f4221a317e9',
  '18@4x/transparent': '709b17cc6d33508eba3197172e781a21dcecc661ad808f5ee8ce2f4221a317e9',
  '19.a0@1x/opaque': '5c6d30706fddab517986c9a2320221d5b49d03cfdb373fd2319409762defff24',
  '19.a0@1x/transparent': '4563b98ea2c0e810000796df117d519e784943174f3c5491d9faef565e8a9f36',
  '19.a0@2x/opaque': 'e3acdc1dbdbbc38ace6b701c195f1698ca27e57998aa3ce5894e8bba634cfed7',
  '19.a0@2x/transparent': 'dbe87df6d68b5653fad85a62777b7ec3da092f25520cf70ffd6538fa188b6d77',
  '19.a0@4x/opaque': '93c1d6c0d4eb3d27adb0edec62efd313c85e7b30311a79fa7bd6b67dbe736c1a',
  '19.a0@4x/transparent': 'f565cb7a66cbb9bffbba1f5a8fbc5ffec8eb5dfb2e0fda73d558da1c8cb51b43',
  '19.a64@1x/opaque': '443d64c04bec34993145f303fefc27199fdd50df3f28333ca2604be3b1dea01a',
  '19.a64@1x/transparent': 'cdb7056012ed924ae25a055de6c1797ee22e05c6841f29f19b533a612c79f250',
  '19.a64@2x/opaque': '064c51bf5f9ad3b6bf004a3b963527361f6507e0bdf51cf8bc70702d8d954662',
  '19.a64@2x/transparent': '0e5412908423b8071bd03a571ecfcee254c2617f858537d96e97d14ca3bf68da',
  '19.a64@4x/opaque': '70c284608e83cbfdb317570597c2412b1335bad1fa400578f4bbe2fe89c1cb5e',
  '19.a64@4x/transparent': '98ef7c29f6962d3fb07552a2725cc6345ef8799469efa75d1a5fcedce2634956',
  '19.a128@1x/opaque': '5c7f3bb1b882e8284bedd6e96c0db45df75676dbb8da9f7f9929f06381fbfd99',
  '19.a128@1x/transparent': 'a8a48907c9ae9b0046177d2e7dde5aaf119d30a7d124cecfd7ee005e8db53167',
  '19.a128@2x/opaque': '139e31e8209da3e4458734a5e169666b47c5aaf00052e15ac3a6ac868c590e0f',
  '19.a128@2x/transparent': '415ab0d9585133e4329a40c7e6b8176b1e4d088d1def7134b411910871f27685',
  '19.a128@4x/opaque': '3ff8d0a3bef7a30f3c202015d85e199ca21ee001f66b2c044eb0c9bb47039541',
  '19.a128@4x/transparent': '4071c5448da5c78f37ea2c29ecdcd11ae07307436c354ac9bb1ee82fb55de73b',
  '19.a192@1x/opaque': 'cfdcf9a7bffc49b5958127c7b88b922b573cd0e8c981414cfb575ed0201327da',
  '19.a192@1x/transparent': '40852c15f84079ba49a98c8cc83a6e587b15adfab54f138afc8c7c09b10cdd2c',
  '19.a192@2x/opaque': '779df44fbf405357ea9a1425bb9f924f80bf63272f88ab4f5e4a66d88eff7f9a',
  '19.a192@2x/transparent': '4c0a35e2aa8191a70e25b46ad418a004183657d7321ddc436bc387076979c6bc',
  '19.a192@4x/opaque': 'b1d3cb03567421566bb1e7a9beba44938a61abb7888a878d3c3dd30a27ca39c0',
  '19.a192@4x/transparent': '088822e956611a6290ac7cabbd1a7a9a0d9ebd477a54bfd8a9e7d8e36c67e0d3',
  '19.a255@1x/opaque': 'fd696c3514963a7901cb43eb51676b9fdaedcfba399fb45f4c571076ed8bba47',
  '19.a255@1x/transparent': '149bcda7e11bc51a8aae1635d55a2d8bbf159b43182e9ee7b4961ef62fb6cd5a',
  '19.a255@2x/opaque': '014b9c9561bfb238d83c0358bf4ffa64648ca7f11b2e58d0b9ae3817715a8591',
  '19.a255@2x/transparent': 'cc3d354755dcd86266b22d2223c56ec01b5ac81a0f20dfa0324c2a28964f8b64',
  '19.a255@4x/opaque': 'f4841abd69bffd87c17f719f62a087761633a5e3e9472a4802b088974ac065bb',
  '19.a255@4x/transparent': '2390846ae3bc9a211512bedeea62f0e142587898e8433e42d74d8311594c70d3',
  '20@1x/opaque': 'd5939fd7cf47d80d384c7b4e3938fc80ea6398cc82f95da8188179b60809dd60',
  '20@1x/transparent': '949c961789836982cede29da98a3c3821964b814e0e23bd1930d39e16767aa49',
  '20@2x/opaque': '9bbca4cf3465bb30e4db273455a8558d691ec0c8c0865004de9b65d4365a4388',
  '20@2x/transparent': 'c65b9d03f05537102037126c97bc312c74e75e6d192fb18a76885fec5eef0c25',
  '20@4x/opaque': '38c64dbda55aa6f3e7864f2fa4155aa609f1fc2df5a37beb94b2880264aa1eb9',
  '20@4x/transparent': 'afb0cad31cf6ecbcd3b9a298ecff2918269c4fb163965e1fa54788bbfad95831',
};

// ---- GM-09: the pre-divide frame (GM-03 review F2) -----------------------------------------------------------------

/**
 * The cases whose transparent frame the divide changes (a pixel at 0 < alpha < 255): 4, 17 and 19. P14 and P22 compare
 * the GPU's premultiplied buffer with the software's frame **before** that divide, which `rasterizeUiDrawList` hands
 * back under `preDivide` (GM-09; a browser adaptation, the transparent overlay's, no original behind it).
 */
export const UI_RASTER_PREDIVIDE_CASE_IDS: readonly number[] = [4, 17, 19];
export const UI_RASTER_PREDIVIDE_CASES: readonly UiRasterCase[] = UI_RASTER_CASES.filter((c) => UI_RASTER_PREDIVIDE_CASE_IDS.includes(c.id));
/** The key of one pinned pre-divide run: `<case key>@<scale>x/predivide`. */
export const casePreDivideKey = (c: UiRasterCase, scale: UiRasterScale): string => `${c.key}@${scale}x/predivide`;

/**
 * The pre-divide probes, worked by hand: the transparent frame starts all zero and the opaque one black at alpha 255,
 * and no RGB step reads the frame's alpha (P8-P10 blend RGB alone; P14 keeps alpha apart), so before the divide each
 * pixel holds the opaque frame's RGB and the transparent frame's alpha. Every probe is at scale 1 unless it says.
 */
export const UI_RASTER_PREDIVIDE_PROBES: Readonly<Record<string, UiRasterProbe[]>> = {
  '4': [
    { x: 1, y: 1, rgba: [100, 50, 0, 128], why: "200 x .5, 100 x .5; alpha 255 x .5 = 127.5 -> 128 (no divide: 199 is P22's)" },
    { x: 3, y: 3, rgba: [75, 38, 50, 160], why: '(75, 37.5 -> 38, 50); alpha 128 + 127 x .25 = 159.75 -> 160' },
    { x: 9, y: 1, rgba: [128, 128, 128, 128], why: 'texel 255 x 128 / 128 x .502 = 128; alpha 255 x .502 = 128' },
    { x: 20, y: 20, rgba: [0, 0, 0, 0], why: "nothing drawn: the transparent frame's zero" },
  ],
  '17': [
    { x: 1, y: 1, rgba: [128, 0, 0, 0], why: "the model's RGB, alpha left 0 (M7)" },
    { x: 8, y: 8, rgba: [128, 0, 0, 128], why: "the model over the quad: its RGB, the quad's alpha 128 kept" },
    { x: 12, y: 12, rgba: [0, 0, 100, 128], why: 'the quad alone: 200 x .5' },
  ],
  ...Object.fromEntries(CASE_19.map(([alpha, opaque, transparent]) => [`19.a${alpha}`, [
    { x: 1, y: 1, rgba: [opaque[0], opaque[1], opaque[2], transparent[3]] as Q4, why: `source alpha ${alpha}: the opaque RGB, the transparent alpha` },
    { x: 6, y: 6, rgba: [0, 0, 100, 128] as Q4, why: 'the half-alpha quad alone' },
  ]])),
};

/**
 * SHA-256 of `rasterizeUiDrawList`'s transparent frame under `preDivide`, for cases 4, 17 and 19 at scales 1, 2 and 4,
 * taken from the software on `agent/gpu-menus` with GM-09's option (the raster itself is the GM-03 pins' unchanged;
 * the test holds that the divide applied to each gives the transparent pin above).
 */
export const UI_RASTER_PREDIVIDE_SHA256: Readonly<Record<string, string>> = {
  '4@1x/predivide': '391fe115766aefe8192b1ab2905be2dfbf858ee8a23598550e706104d861cbae',
  '4@2x/predivide': '8b7f182f10e72ae64e27ff767060392129aa679a10e7592a18c543f500499545',
  '4@4x/predivide': '2e43694c8c8cc9f82e87868806a441d27d4919db23fa500e84a1236900921ccd',
  '17@1x/predivide': '30c0b9dc5ab1449db4c59176b6cc4bfac6415d2dcd35afe84f60dda5ba931e0f',
  '17@2x/predivide': 'a0bcb415dc9736ba2ad770247be5fda3f4f9a863f87ffec6bf562e34b51fa406',
  '17@4x/predivide': 'bc06c4487906414054289fead60a9f36bc23f8e98462001863e8c73b2940bcf8',
  '19.a0@1x/predivide': '827bc1e837555baa8c9d6add721280461c423eea98a252521c9a4ffe473dcd35',
  '19.a0@2x/predivide': 'c6a3ce9cf7af244b57e11728139876f543f9e1bad97f33777d7bf56e853019f7',
  '19.a0@4x/predivide': 'b2fbc6bf6d1ae29984f0f8681f40245ef816e5e9f6d0cfe8234f5ef4357c1cfb',
  '19.a64@1x/predivide': 'e2887f49413f10730a6e41d1da2082eef513bd12bc1b691a986a305d90da042c',
  '19.a64@2x/predivide': 'c613489d463f6447ef2aa5d87a597a35335276f9d9706d4b41979a1836a1c8f2',
  '19.a64@4x/predivide': 'c3983158096bc7e71c6d3a62bbaa1d1b1d0d1d4007f221731d99440222d7fff1',
  '19.a128@1x/predivide': 'fc90d93c20a91a5fd669645fda405cb86d4097b3c1e36afe2bca20d188442958',
  '19.a128@2x/predivide': '41eacf8c919322f67af7773320f81b965327a40b9ab79b99d0c55b03df2f6b78',
  '19.a128@4x/predivide': '8aec92b827047e4ce599e0b0c06526ee818410e0fd027789c0fa11029ac1cb1a',
  '19.a192@1x/predivide': 'bfa1e704c8edecbd1ad70d098719043b2a1c910a952f9d10496e04f0eea9d35e',
  '19.a192@2x/predivide': 'c3f4771d8e817cc7a23e5da5eeab40d023d7e0a4ed192f251a51880b9097cb94',
  '19.a192@4x/predivide': '51932a4d97f242af7fbca56795f70bb75c7f25ab8581ae568085d1bdc51f8176',
  '19.a255@1x/predivide': '2157d36b46b3b1545744dbc0452721b0d2c83f9a90bbcb126e4a251a14611b73',
  '19.a255@2x/predivide': '90d0f30a789751b1baafbd3962e647c0f30747907400d1fac5665068f91694dd',
  '19.a255@4x/predivide': '431bc503d3b38f6a7628b44e4ff9ed781c382b16146de9a1331a89f8052ceaca',
};
