import type { Rgba } from '@s2u/gs';
import { sharpenBitmap, type UiSamplingSettings } from './experimentalUiSampling';
import { UI_FRAME, composeScreen, type MoviePicture, type UiClip, type UiDrawItem, type UiModelTriangle, type UiModelVertex, type UiScreen } from '@s2u/ui';
import {
  MOVIE_NO_PICTURE_BLEND, blendAfterBind, clearPacker, columnAxis, coverageBounds, modelDepthF32, modelEdgeF32, modelEdgeOwns, pickBitmap, rasterScale, rowAxis, scaleAt, scaleClip, wrap,
  type RowAxis,
} from './uiRasterRules';

// GM-05: the raster rules live in `uiRasterRules.ts` (shared with the GPU planner); these two stay importable from here.
export { HD_MENU_SCALE_LIMIT, rasterScale } from './uiRasterRules';

/**
 * PLAT-14's viewer drawer (web research 112 §6): `@s2u/ui`'s draw list rasterised into the 640 x 448 frame the way the
 * GS draws the menu's 2D quads, into an RGBA frame -- which a canvas target shows (`presentUiFrame`) or a three.js
 * pass takes as a texture. Software, so a frame is the same pixels everywhere and a test can read them; the page's
 * front-end entry (PLAT-10) decides where and how often it draws. A widget (PLAT-15's) and the models' 3D pass are
 * not drawn here: they come back in `undrawn`.
 *
 * Bitmaps are taken top row first (as `hudAssets.ts` `flipRows` gives the disc's bottom-row-first bitmaps), so the
 * draw list's upright `u`/`v` (and a glyph's texel rows, top first) address them directly. The 3D pass's triangles
 * (MENU-02a: a `models` item with `triangles`, `@s2u/ui`'s `projectModels`) are drawn in software too -- perspective-
 * correct texels, the same modulate and blend, a depth buffer for the pass (a clear texel writes none of it), back faces dropped where the mesh culls --
 * their textures addressed as stored (the models module's stored-rows reading: the same top-row-first map, v flipped back).
 */

/**
 * The blend a texture's bind packet sets in the GS's `ALPHA_1` (web research 141 §2): `source` is 0x44,
 * Cd + (Cs - Cd) x As; `additive` is 0x48, Cd + Cs x As. Every texture of the 57 `RUN/UI/*_TXR.ZED` libraries and of
 * `FONT_TXR` binds 0x44 but twelve: the main menu roller's `menu_*_on.tif` / `menu_*_off.tif` in `UI_TXR`, 0x48
 * (`tools/test/menuEntryFadeDisc.test.ts` holds the tally).
 */
export type UiBlend = 'source' | 'additive';

/** A bitmap and the blend its texture's bind packet sets; without `blend` it is `source` (what every other UI texture binds). */
export interface UiBitmap extends Rgba { blend?: UiBlend }

/** A bitmap by name (lower-case or as written: the caller's map decides), top row first; null when it has none. */
export type UiTextures = (name: string) => UiBitmap | null;

export interface RasterOptions {
  /** Browser implementation cache; an explicit instance lets a caller bound/clear its own lifetime. */
  quadCache?: UiQuadRasterCache;
  /** Browser adaptation: native panels composited over a live match, with no menu background. */
  transparent?: boolean;
  /**
   * GM-09 (a browser adaptation, the transparent overlay's; no original behind it): a transparent frame handed back
   * before its divide to straight RGB -- RGB premultiplied by its alpha, what a premultiplied GPU buffer holds (P14,
   * P22; research 380). Absent: today's straight frame. No effect on an opaque frame, which is never divided.
   */
  preDivide?: boolean;
  /** Explicit dev menu experiment only; absent/off is the original bilinear path (research 260). */
  uiSampling?: UiSamplingSettings;
  /** A movie picture's pixels (the decoder's frame, top row first); without it a picture draws black. */
  movie?: (picture: MoviePicture) => Rgba | null;
  /**
   * HD-3 (OT.R92, HD.R8; a browser adaptation, only under HD (GoE Soul)): the frame drawn at 640 x 448 times this
   * whole factor -- every position, clip and the 3D pass scaled, the GS's raster rules (integer pixel corners, bilinear
   * texel centres) kept on the larger grid. Absent or 1: the original frame, byte for byte.
   */
  scale?: number;
  /**
   * HD-3: a bitmap's replacement from the HD pack (top row first, its own larger size), or null to draw the bitmap.
   * A replaced bitmap is sampled from the replacement, its texel coordinates scaled by the two sizes' ratio; its blend
   * stays the bitmap's.
   */
  hd?: UiHdTextures;
}

/** HD-3: the HD pack's image for a bitmap the lookup handed over (by identity), or null: none, or not loaded yet. */
export type UiHdTextures = (bitmap: UiBitmap) => Rgba | null;

interface CachedQuad {
  key: number[];
  source: Uint8ClampedArray;
  samples: Float64Array;
  bytes: number;
}

/**
 * Browser implementation policy, not a game value: cache large quads within 32 MiB of retained array storage.
 * Entries own exact source-byte snapshots and Float64 modulated samples, never original textures/data views.
 * Source mutation is checked on every hit; no hash or bitmap-identity immutability assumption is involved.
 */
export class UiQuadRasterCache {
  private entries: CachedQuad[] = [];
  private retained = 0;
  constructor(readonly maxBytes = 32 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid quad cache byte budget');
  }
  get byteLength(): number { return this.retained; }
  get size(): number { return this.entries.length; }
  clear(): void { this.entries = []; this.retained = 0; }
  read(key: readonly number[], source: Rgba['data']): Float64Array | null {
    const index = this.entries.findIndex(entry => entry.key.length === key.length && entry.key.every((v, i) => v === key[i]));
    if (index < 0) return null;
    const entry = this.entries[index]!;
    let equal = entry.source.length === source.length;
    if (equal && source.byteOffset % 4 === 0 && source.byteLength % 4 === 0) {
      const current = new Uint32Array(source.buffer, source.byteOffset, source.byteLength / 4);
      const previous = new Uint32Array(entry.source.buffer);
      for (let i = 0; equal && i < current.length; i++) if (previous[i] !== current[i]) equal = false;
    } else {
      for (let i = 0; equal && i < source.length; i++) if (entry.source[i] !== source[i]) equal = false;
    }
    this.entries.splice(index, 1);
    if (!equal) { this.retained -= entry.bytes; return null; }
    this.entries.push(entry); // least recently used entry remains at the front
    return entry.samples;
  }
  remember(key: readonly number[], source: Rgba['data'], samples: Float64Array): void {
    const bytes = source.byteLength + samples.byteLength;
    if (bytes > this.maxBytes) return;
    while (this.retained + bytes > this.maxBytes && this.entries.length) this.retained -= this.entries.shift()!.bytes;
    // A caller's narrow view must not retain its potentially much larger backing buffer.
    const owned = samples.byteOffset === 0 && samples.byteLength === samples.buffer.byteLength ? samples : samples.slice();
    this.entries.push({ key: [...key], source: new Uint8ClampedArray(source), samples: owned, bytes });
    this.retained += bytes;
  }
}
const defaultQuadCache = new UiQuadRasterCache();

/**
 * GS_SPRITE_COVERAGE_READING: a 2D quad covers the pixels whose integer coordinates lie in x0 <= x < x1, y0 <= y < y1
 * and samples its texture at that integer coordinate (the GS's pixel centres; the frame's offset 2048 - 320 and
 * 2048 - 224 is whole). The quads' sub-pixel corners (`FUN_001bfee8` to the GS's 1/16) were not followed further.
 */
export const GS_SPRITE_COVERAGE_READING = 'top-left, integer centres' as const;

/**
 * UI_TEXTURE_FILTER_READING: bilinear (texel centres at +0.5, the texture repeating). The 2D quads' `TEX1_1` was not
 * read; the quads' 1% inset (`SPRITE_ST`, 0.01 .. 0.99) is what keeps a bilinear sample off the wrapped edge, which a
 * point sample would not need.
 */
export const UI_TEXTURE_FILTER_READING = 'bilinear' as const;

/**
 * GS_MODULATE_BLEND_READING: a textured quad's colour is texel x colour / 128 per channel (clamped at 255), its alpha
 * the texel's (255 = the GS's 128) x alpha / 128; an untextured quad is its colour as it stands; the blend's result is
 * clamped (`COLCLAMP` 1 in the GS environment the game sets once, the ELF's packet at 0x3e0880). The quads' `TEX0_1`
 * function was not read: this is the GS's MODULATE, as the ARMORY's pass draws (research 95 §2.8). The blend equation
 * is no longer part of this reading: it is `ALPHA_1`, read (the next paragraph; web research 141 §2).
 *
 * **`ALPHA_1` is a register, and the texture last bound set it.** A texture record ends in its bind packet -- a GIF
 * A+D block of `ALPHA_1`, `TEX1_1`, `TEX0_1`, `TEST_1`, `CLAMP_1`, all six quadwords selected (`selectQwc` 6) -- which
 * `FUN_00354f80` (D:L252772-252832) hands to `FUN_003c3ce0` (D:L315838-315872): one DMA reference for a 2D quad (a
 * `DIRECT` of the packet, kept at the texture's +0x30, which `FUN_003643b0` D:L261658-261668 copies in front of a
 * textured quad) and one for a mesh (an `UNPACK` of it into VU1's memory, +0x40). An untextured quad -- MENUFADER's --
 * sends its PRIM in the GIF tag and ST, RGBAQ, XYZ2 (`FUN_003643b0` D:L261669-261707) and nothing else: the bind hook
 * of the menu's draw context (the vtable at 0x406c10, +0x10: 0x1f5cd0) is an empty function, and the frame's own
 * environment packet (0x3e0980: DTHE, DIMX, FRAME_1, XYOFFSET_1, SCISSOR_1, TEST_1, ZBUF_1) does not write `ALPHA_1`.
 * So it is blended by whatever the last bound texture set. On `dlgMenu` that is the roller: the tick draws the
 * backplane (the controls), then the 3D pass, then the foreplane (MENUFADER, POPUP) -- CMenuState's Tick, 0x1f4700 to
 * 0x1f47dc -- and the roller's twelve textures bind 0x48, so the black fader adds nothing and is not seen at any alpha
 * while the roller is drawn. Measured on the console (PCSX2, `mb10_pcsx2/s06_burst_010..016`): the menu whole on the
 * build's own frame and at MENULOOP's pictures 2, 9, 16, 22, 29, 36.
 */
export const GS_MODULATE_BLEND_READING = 'modulate; the blend is the last bind\'s ALPHA_1' as const;

/**
 * GS_ALPHA_FRAME_START_READING: an untextured quad drawn before any texture is bound in its frame blends by `source`
 * -- 0x44, what the game's GS environment sets once (the ELF's packet at 0x3e0880: `ALPHA_1` 0x44). On the console the
 * register is not rewritten between frames (the per-frame packet at 0x3e0980 leaves it), so such a quad draws with
 * the previous frame's last bind; that differs from this reading only when that bind was additive and the next frame
 * draws an untextured quad before any texture -- a dialog with no control and no background image entered while the
 * roller is still drawn, which no script of `dlgMenu` does (each hides `Roller` before it switches).
 */
export const GS_ALPHA_FRAME_START_READING: UiBlend = 'source';

/**
 * UI_MESH_BIND_READING: a triangle of the 3D pass sets the register when it is drawn (its mesh's texture bound, the
 * packet unpacked to VU1 and kicked with the mesh); a culled face and a triangle whose bitmap is missing set nothing.
 * Whether VU1 kicks a mesh's bind packet when every one of its triangles is culled was not read: on the roller it
 * cannot matter, the twelve textures binding the same 0x48.
 */
export const UI_MESH_BIND_READING = 'a drawn triangle binds' as const;

/** Bilinear, repeating, at texel coordinates (u, v) of a top-row-first bitmap: RGBA 0..255. */
function sample(t: Rgba, u: number, v: number, out: number[]): void {
  const x = u - 0.5, y = v - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = wrap(x0, t.width), xb = wrap(x0 + 1, t.width), ya = wrap(y0, t.height), yb = wrap(y0 + 1, t.height);
  const d = t.data;
  for (let c = 0; c < 4; c++) {
    const a = d[(ya * t.width + xa) * 4 + c]!, b = d[(ya * t.width + xb) * 4 + c]!;
    const e = d[(yb * t.width + xa) * 4 + c]!, g = d[(yb * t.width + xb) * 4 + c]!;
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + g * fx) * fy;
  }
}

/** Cached samples have integer coverage; keep their blend loop separate from generic/fractional sampling. */
function blendCachedQuad(frame: Uint8ClampedArray, W: number, samples: Float64Array, xs: number, ys: number, count: number, rows: number, additive: boolean): void {
  let source = 0;
  if (additive) {
    for (let y = 0; y < rows; y++) for (let x = 0, i = (((ys + y) * W + xs) * 4) | 0; x < count; x++, i += 4) {
      const r = samples[source++]!, g = samples[source++]!, b = samples[source++]!, a = samples[source++]!;
      frame[i + 3] = frame[i + 3]! + (255 - frame[i + 3]!) * Math.min(1, a);
      frame[i] = frame[i]! + r * a;
      frame[i + 1] = frame[i + 1]! + g * a;
      frame[i + 2] = frame[i + 2]! + b * a;
    }
  } else {
    for (let y = 0; y < rows; y++) for (let x = 0, i = (((ys + y) * W + xs) * 4) | 0; x < count; x++, i += 4) {
      const r = samples[source++]!, g = samples[source++]!, b = samples[source++]!, a = samples[source++]!;
      frame[i + 3] = frame[i + 3]! + (255 - frame[i + 3]!) * Math.min(1, a);
      frame[i] = frame[i]! + (r - frame[i]!) * a;
      frame[i + 1] = frame[i + 1]! + (g - frame[i + 1]!) * a;
      frame[i + 2] = frame[i + 2]! + (b - frame[i + 2]!) * a;
    }
  }
}

/**
 * One quad into the frame: `uv` in texels (null: untextured); `blend` the `ALPHA_1` it is drawn under. The blend is
 * Float64, stored by the clamped byte view (`GS_BLEND_ROUNDING_READING`); a quad has no depth (`UI_2D_QUAD_Z_READING`).
 */
function fillQuad(
  frame: Uint8ClampedArray, W: number, H: number, x0: number, y0: number, x1: number, y1: number,
  tex: Rgba | null, uv: [number, number, number, number] | null, rgba: readonly number[], clip: UiClip | null, blend: UiBlend,
  sampling?: UiSamplingSettings, cache = defaultQuadCache,
): void {
  const nearest = sampling?.enabled && sampling.mode !== 'bilinear';
  if (tex && sampling?.enabled && sampling.mode === 'sharpen') tex = sharpenBitmap(tex, sampling.sharpness);
  const bounds = coverageBounds(x0, y0, x1, y1, W, H, clip);
  if (!bounds) return;
  const { xs, ys, xe, ye } = bounds;
  const red = rgba[0]!, green = rgba[1]!, blue = rgba[2]!, alpha = rgba[3]! / 128;   // UI_QUAD_ALPHA_RANGE_READING: unclamped
  const additive = blend === 'additive';
  if (!tex || !uv) {
    // Bind state belongs to the draw-list caller, so skipping an invisible quad cannot discard a texture bind. An
    // additive black quad is not skipped: on a transparent frame it still raises the alpha.
    if (Number.isFinite(red) && Number.isFinite(green) && Number.isFinite(blue) && alpha === 0) return;
    for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) {
      const i = (y * W + x) * 4;
      frame[i + 3] = frame[i + 3]! + (255 - frame[i + 3]!) * Math.min(1, alpha);
      if (additive) {
        frame[i] = frame[i]! + red * alpha;
        frame[i + 1] = frame[i + 1]! + green * alpha;
        frame[i + 2] = frame[i + 2]! + blue * alpha;
      } else {
        frame[i] = frame[i]! + (red - frame[i]!) * alpha;
        frame[i + 1] = frame[i + 1]! + (green - frame[i + 1]!) * alpha;
        frame[i + 2] = frame[i + 2]! + (blue - frame[i + 2]!) * alpha;
      }
    }
    return;
  }
  const width = tex.width, height = tex.height, data = tex.data;
  const du = uv[2] - uv[0], dv = uv[3] - uv[1], dx = x1 - x0, dy = y1 - y0;
  const count = Math.ceil(xe - xs);
  const integerCoverage = Number.isInteger(xs) && Number.isInteger(ys);
  const rows = Math.ceil(ye - ys), sampleBytes = count * rows * 4 * Float64Array.BYTES_PER_ELEMENT;
  const key = [x0, y0, x1, y1, xs, ys, xe, ye, width, height, ...uv, ...rgba, nearest ? 1 : 0];
  // Small glyphs stay stateless: scanning their atlas on every draw would cost more than sampling them.
  const cacheable = integerCoverage && count * rows >= 16384 && key.every(Number.isFinite)
    && Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && data.length >= width * height * 4
    && sampleBytes + data.byteLength <= cache.maxBytes;
  const cached = cacheable ? cache.read(key, data) : null;
  if (cached) {
    blendCachedQuad(frame, W, cached, xs | 0, ys | 0, count | 0, rows | 0, additive);
    return;
  }
  const remembered = cacheable ? new Float64Array(count * rows * 4) : null;
  let rememberedOffset = 0;
  // Screen-aligned quads reuse each horizontal sample for every row. Float64 preserves the original arithmetic;
  // do not replace multiply-then-divide with a reciprocal or increment u, which can change rounded colour bytes.
  const left = new Float64Array(count), right = new Float64Array(count), fraction = new Float64Array(count);
  columnAxis(xs, xe, x0, dx, uv[0], du, width, nearest, left, right, fraction);
  // The two source rows usually recur across several screen rows (especially the stretched 16x16 UI panels).
  // Cache only their horizontal interpolation for this quad. This is bounded scratch, not a bitmap/frame cache:
  // a later draw always sees the current texture bytes, and models retain the original sample() above.
  let topRow = new Float64Array(count * 4), bottomRow = new Float64Array(count * 4);
  let topIndex = -1, bottomIndex = -1;
  const horizontal = (row: Float64Array, offset: number): void => {
    for (let k = 0; k < count; k++) {
      const l = offset + left[k]!, r = offset + right[k]!, fx = fraction[k]!, ix = 1 - fx, i = k * 4;
      row[i] = data[l]! * ix + data[r]! * fx;
      row[i + 1] = data[l + 1]! * ix + data[r + 1]! * fx;
      row[i + 2] = data[l + 2]! * ix + data[r + 2]! * fx;
      row[i + 3] = data[l + 3]! * ix + data[r + 3]! * fx;
    }
  };
  const axis: RowAxis = { top: 0, bottom: 0, fy: 0, iy: 0 };
  for (let y = ys; y < ye; y++) {
    const { top, bottom, fy, iy } = rowAxis(y, y0, dy, uv[1], dv, height, width, nearest, axis);
    if (!nearest) {
      if (top !== topIndex) {
        if (top === bottomIndex) {
          const savedRow = topRow; topRow = bottomRow; bottomRow = savedRow;
          const savedIndex = topIndex; topIndex = bottomIndex; bottomIndex = savedIndex;
        } else { horizontal(topRow, top); topIndex = top; }
      }
      if (bottom !== top && bottom !== bottomIndex) { horizontal(bottomRow, bottom); bottomIndex = bottom; }
    }
    const lowerRow = bottom === top ? topRow : bottomRow;
    for (let k = 0, x = xs; x < xe; k++, x++) {
      const tl = top + left[k]!;
      let r: number, g: number, b: number, a: number;
      if (nearest) {
        r = data[tl]!; g = data[tl + 1]!; b = data[tl + 2]!; a = data[tl + 3]!;
      } else {
        const i = k * 4;
        r = topRow[i]! * iy + lowerRow[i]! * fy;
        g = topRow[i + 1]! * iy + lowerRow[i + 1]! * fy;
        b = topRow[i + 2]! * iy + lowerRow[i + 2]! * fy;
        a = topRow[i + 3]! * iy + lowerRow[i + 3]! * fy;
      }
      r = Math.min(255, (r * red) / 128); g = Math.min(255, (g * green) / 128); b = Math.min(255, (b * blue) / 128);
      a = (a / 255) * alpha;
      if (remembered) {
        remembered[rememberedOffset++] = r; remembered[rememberedOffset++] = g;
        remembered[rememberedOffset++] = b; remembered[rememberedOffset++] = a;
      }
      const i = (y * W + x) * 4;
      frame[i + 3] = frame[i + 3]! + (255 - frame[i + 3]!) * Math.min(1, a);
      if (additive) {                                           // 0x48: Cd + Cs x As (COLCLAMP)
        frame[i] = frame[i]! + r * a;
        frame[i + 1] = frame[i + 1]! + g * a;
        frame[i + 2] = frame[i + 2]! + b * a;
      } else {                                                  // 0x44: Cd + (Cs - Cd) x As
        frame[i] = frame[i]! + (r - frame[i]!) * a;
        frame[i + 1] = frame[i + 1]! + (g - frame[i + 1]!) * a;
        frame[i + 2] = frame[i + 2]! + (b - frame[i + 2]!) * a;
      }
    }
  }
  if (remembered) cache.remember(key, data, remembered);
}

/** The draw list into a fresh 640 x 448 RGBA frame (alpha 255; times `o.scale` under HD-3), and what it left undrawn. */
export function rasterizeUiDrawList(items: readonly UiDrawItem[], textures: UiTextures, o: RasterOptions = {}): { frame: Rgba; undrawn: string[] } {
  const s = rasterScale(o.scale);
  const W = UI_FRAME.width * s, H = UI_FRAME.height * s;
  const data = new Uint8ClampedArray(W * H * 4);
  // Pack through the clamped byte view (`clearPacker`), so fractional/out-of-range RGB keeps exactly the same
  // conversion and Uint32.fill uses this host's byte order. A transparent frame starts all zero, as allocated.
  const pack = clearPacker(), words = new Uint32Array(data.buffer);
  if (!o.transparent) words.fill(pack(0, 0, 0));
  const undrawn: string[] = [];
  // HD-3: at scale 1 every position and clip is passed as it stands (no arithmetic), so the frame is the original's.
  const at = scaleAt(s);
  const clipAt = scaleClip(s);
  /** The bitmap to sample and the factors on a texel coordinate: its HD replacement when the pack has one. */
  const pick = (tex: UiBitmap): { tex: UiBitmap; su: number; sv: number } => pickBitmap(o.hd, tex);
  let alpha: UiBlend = GS_ALPHA_FRAME_START_READING;           // the GS's ALPHA_1 as the draws leave it, in order
  for (const it of items) {
    switch (it.kind) {
      case 'clear':
        // Every clear leaves each pixel (rgb, 255), as one packed fill.
        words.fill(pack(it.rgb[0], it.rgb[1], it.rgb[2]));
        break;
      case 'movie': {
        const pic = it.picture ? o.movie?.(it.picture) ?? null : null;
        if (!pic) { fillQuad(data, W, H, at(it.x0), at(it.y0), at(it.x1), at(it.y1), null, null, [0, 0, 0, 128], null, MOVIE_NO_PICTURE_BLEND); break; }   // no picture: black there, not a GS quad
        // HD-3: at a scale each picture pixel covers s x s (the movie has no HD replacement).
        for (let y = 0; y < Math.min(H, pic.height * s); y++) {
          const sy = s === 1 ? y : Math.floor(y / s);
          for (let x = 0; x < Math.min(W, pic.width * s); x++) {
            const sx = s === 1 ? x : Math.floor(x / s);
            const p = (sy * pic.width + sx) * 4, d = (y * W + x) * 4;
            data[d] = pic.data[p]!; data[d + 1] = pic.data[p + 1]!; data[d + 2] = pic.data[p + 2]!;
          }
        }
        break;
      }
      case 'sprite': {
        if (it.texture === null) { fillQuad(data, W, H, at(it.x0), at(it.y0), at(it.x1), at(it.y1), null, null, it.rgba, clipAt(it.clip), alpha); break; }   // no bind: the register as it stands
        const bitmap = textures(it.texture);
        if (!bitmap) { undrawn.push(`${it.node}: no bitmap ${it.texture}`); break; }
        alpha = blendAfterBind(bitmap);
        const { tex } = pick(bitmap);
        fillQuad(data, W, H, at(it.x0), at(it.y0), at(it.x1), at(it.y1), tex, [it.u0 * tex.width, it.v0 * tex.height, it.u1 * tex.width, it.v1 * tex.height], it.rgba, clipAt(it.clip), alpha, o.uiSampling, o.quadCache);
        break;
      }
      case 'glyphs':
        for (const q of it.quads) {
          const bitmap = textures(q.texture);
          if (!bitmap) { undrawn.push(`${it.node}: no bitmap ${q.texture}`); continue; }
          alpha = blendAfterBind(bitmap);
          const { tex, su, sv } = pick(bitmap);
          const uv: [number, number, number, number] = su === 1 && sv === 1 ? [q.u0, q.v0, q.u1, q.v1] : [q.u0 * su, q.v0 * sv, q.u1 * su, q.v1 * sv];
          fillQuad(data, W, H, at(q.left), at(q.top), at(q.right), at(q.bottom), tex, uv, q.rgba, clipAt(it.clip), alpha, o.uiSampling, o.quadCache);
        }
        break;
      case 'widget':
        undrawn.push(`widget ${it.node} (${it.record.type ?? 'untyped'})`);
        break;
      case 'models':
        if (!it.triangles) { undrawn.push('models'); break; }
        alpha = drawModels(data, W, H, s, it.triangles, textures, undrawn, alpha, o.hd ? (t) => pick(t).tex : null);
        break;
    }
  }
  // The software pass accumulates premultiplied RGB over black. Canvas ImageData expects straight RGB.
  if (o.transparent && !o.preDivide) for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    if (a > 0 && a < 1) { data[i] = data[i]! / a; data[i + 1] = data[i + 1]! / a; data[i + 2] = data[i + 2]! / a; }
  }
  return { frame: { width: W, height: H, data }, undrawn };
}

/**
 * The 3D pass's triangles into the frame: each pixel whose integer point is inside the triangle by the GS's top-left
 * rule (`UI_MODEL_EDGE_RULE_READING`, `modelEdgeOwns`: a pixel on a left or top edge in, on a right or bottom edge out,
 * the half-open rule the quads keep) -- the edge functions and the depth in the GPU's f32 arithmetic (`modelEdgeF32`,
 * `modelDepthF32`), the attributes in f64 -- the texel and the colour interpolated perspective-correctly (by 1/w), the depth
 * buffer of the pass tested GEQUAL with the f32 depth against the f32 store, so the later of two equal depths wins
 * (`UI_MODEL_DEPTH_FORMAT_READING`, `TEST_1` ZTST GEQUAL), a back face (clockwise on the frame) dropped when the mesh culls. A texture the map lacks
 * leaves its triangles undrawn, named once per node. Each drawn triangle blends by its texture's `ALPHA_1` (an
 * untextured one by the register as it stands) and leaves it set: the answer is the register after the pass
 * (`UI_MESH_BIND_READING`).
 */
function drawModels(frame: Uint8ClampedArray, W: number, H: number, scale: number, tris: readonly UiModelTriangle[], textures: UiTextures, undrawn: string[], alpha: UiBlend,
  hd: ((t: UiBitmap) => UiBitmap) | null): UiBlend {
  const depth = new Float32Array(W * H);
  const scaled = (p: UiModelVertex): UiModelVertex => (scale === 1 ? p : { ...p, x: p.x * scale, y: p.y * scale });
  const missing = new Set<string>();
  const s: number[] = [0, 0, 0, 0];
  for (const t of tris) {
    const a = scaled(t.a), b = scaled(t.b), c = scaled(t.c);
    const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (area === 0) continue;
    if (t.cull && area > 0) continue;                         // clockwise on the frame (y down): a back face
    const bitmap = t.texture === null ? null : textures(t.texture);
    const tex = bitmap && hd ? hd(bitmap) : bitmap;
    if (t.texture !== null && !tex) { if (!missing.has(t.node)) { missing.add(t.node); undrawn.push(`${t.node}: no bitmap ${t.texture}`); } continue; }
    if (tex) alpha = blendAfterBind(tex);
    const additive = alpha === 'additive';
    const xs = Math.max(0, Math.ceil(Math.min(a.x, b.x, c.x))), xe = Math.min(W, Math.ceil(Math.max(a.x, b.x, c.x)));
    const ys = Math.max(0, Math.ceil(Math.min(a.y, b.y, c.y))), ye = Math.min(H, Math.ceil(Math.max(a.y, b.y, c.y)));
    const inv = 1 / area, finv = Math.fround(inv), sign = finv < 0 ? -1 : 1;
    // Coverage and depth in the GPU's f32 arithmetic (modelEdgeF32, modelDepthF32; GM-15d's disc fold).
    const ax = Math.fround(a.x), ay = Math.fround(a.y), bx = Math.fround(b.x), by = Math.fround(b.y), cx = Math.fround(c.x), cy = Math.fround(c.y);
    const aw = Math.fround(a.invW), bw = Math.fround(b.invW), cw = Math.fround(c.invW);
    const g0x = Math.fround(by - cy), g0y = Math.fround(cx - bx), g1x = Math.fround(cy - ay), g1y = Math.fround(ax - cx), g2x = Math.fround(ay - by), g2y = Math.fround(bx - ax);
    for (let y = ys; y < ye; y++) {
      for (let x = xs; x < xe; x++) {
        // The edge functions at the pixel's integer point, inside by the top-left rule (UI_MODEL_EDGE_RULE_READING).
        const e0 = modelEdgeF32(bx, by, cx, cy, x, y), e1 = modelEdgeF32(cx, cy, ax, ay, x, y), e2 = modelEdgeF32(ax, ay, bx, by, x, y);
        if (!modelEdgeOwns(e0, g0x, g0y, sign) || !modelEdgeOwns(e1, g1x, g1y, sign) || !modelEdgeOwns(e2, g2x, g2y, sign)) continue;
        const i = y * W + x, z = modelDepthF32(e0, e1, finv, aw, bw, cw);
        if (z < depth[i]!) continue;                           // GEQUAL, f32 against the f32 store, 0 empty (UI_MODEL_DEPTH_FORMAT_READING)
        // The attributes in f64 from the same integer point (M4).
        let w0 = ((b.x - x) * (c.y - y) - (c.x - x) * (b.y - y)) * inv;
        let w1 = ((c.x - x) * (a.y - y) - (a.x - x) * (c.y - y)) * inv;
        let w2 = 1 - w0 - w1;
        const invW = w0 * a.invW + w1 * b.invW + w2 * c.invW;
        // Perspective-correct: each attribute over w, divided back -- the colour too (UI_MODEL_GOURAUD_READING).
        w0 *= a.invW / invW; w1 *= b.invW / invW; w2 *= c.invW / invW;
        const lerp = (k: 'u' | 'v'): number => w0 * a[k] + w1 * b[k] + w2 * c[k];
        const rgba = [0, 1, 2, 3].map((ch) => w0 * a.rgba[ch]! + w1 * b.rgba[ch]! + w2 * c.rgba[ch]!);
        let r: number, g: number, bl: number, al: number;
        if (tex) {
          const u = lerp('u'), v = lerp('v');
          sample(tex, u * tex.width, (1 - v) * tex.height, s);     // the models module's stored-rows reading: stored row v = 0 is the map's last row
          r = Math.min(255, (s[0]! * rgba[0]!) / 128); g = Math.min(255, (s[1]! * rgba[1]!) / 128); bl = Math.min(255, (s[2]! * rgba[2]!) / 128);
          al = (s[3]! / 255) * (rgba[3]! / 128);
        } else { r = rgba[0]!; g = rgba[1]!; bl = rgba[2]!; al = rgba[3]! / 128; }
        if (al <= 0) continue;                                 // UI_MODEL_ZWRITE_READING (the models module): a clear texel writes neither colour nor depth
        depth[i] = z;
        const o = i * 4;
        if (additive) {
          frame[o] = frame[o]! + r * al;
          frame[o + 1] = frame[o + 1]! + g * al;
          frame[o + 2] = frame[o + 2]! + bl * al;
        } else {
          frame[o] = frame[o]! + (r - frame[o]!) * al;
          frame[o + 1] = frame[o + 1]! + (g - frame[o + 1]!) * al;
          frame[o + 2] = frame[o + 2]! + (bl - frame[o + 2]!) * al;
        }
      }
    }
  }
  return alpha;
}

/** The part of a 2D canvas context the presenter uses (`CanvasRenderingContext2D` fits; a test passes a fake). */
export interface UiCanvasTarget {
  createImageData(width: number, height: number): { width: number; height: number; data: Uint8ClampedArray };
  putImageData(image: { width: number; height: number; data: Uint8ClampedArray }, dx: number, dy: number): void;
}

/** The frame onto the target at its origin, 1:1 (the canvas's CSS size scales it for the page). */
export function presentUiFrame(target: UiCanvasTarget, frame: Rgba): void {
  const img = target.createImageData(frame.width, frame.height);
  img.data.set(frame.data);
  target.putImageData(img as Parameters<UiCanvasTarget['putImageData']>[0], 0, 0);
}

/**
 * Dev only: a built screen drawn once onto a canvas target -- composed (`composeScreen`), rasterised, presented. What
 * it could not draw comes back. For a test, or for a later entry (PLAT-10's) to look at a dialog before its widgets.
 */
export function drawDialogFrame(target: UiCanvasTarget, screen: UiScreen, textures: UiTextures, o: RasterOptions = {}): { undrawn: string[] } {
  const { frame, undrawn } = rasterizeUiDrawList(composeScreen(screen), textures, o);
  presentUiFrame(target, frame);
  return { undrawn };
}
