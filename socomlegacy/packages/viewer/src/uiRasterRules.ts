import type { Rgba } from '@s2u/gs';
import type { UiClip } from '@s2u/ui';
import type { UiBitmap, UiBlend, UiHdTextures } from './uiCompositorView';

/**
 * GM-05 (the GPU menus plan): the software drawer's raster rules, moved out of `uiCompositorView.ts` unchanged so a
 * second drawer (the GPU planner) takes them from the same code. Moved, not rewritten: every expression is the one the
 * compositor used, in the same operation order. The readings these rules carry out stay named where they were
 * (`GS_SPRITE_COVERAGE_READING`, `UI_TEXTURE_FILTER_READING`, `GS_MODULATE_BLEND_READING`,
 * `GS_ALPHA_FRAME_START_READING`, `UI_MESH_BIND_READING` in `uiCompositorView.ts`; web research 112, 141). GM-05b
 * names here, at the end of this module, the nine readings the rules made without a name (research 380 §4), each
 * equal to what the code does; none changes a rule. A change to a rule here changes both drawers, in one task.
 */

/**
 * HD-3: the scale a caller asked for as a whole factor of at least 1 (`RasterOptions.scale`); anything else is 1.
 * HD_MENU_SCALE_LIMIT bounds it: a browser budget (the frame's software raster costs its pixel count), not a game value.
 */
export const HD_MENU_SCALE_LIMIT = 4;
export function rasterScale(scale: number | undefined): number {
  return scale !== undefined && Number.isInteger(scale) && scale > 1 ? Math.min(scale, HD_MENU_SCALE_LIMIT) : 1;
}

/** HD-3: a position on the scaled grid. At scale 1 every position is passed as it stands (no arithmetic). */
export function scaleAt(s: number): (v: number) => number {
  return s === 1 ? (v: number): number => v : (v: number): number => v * s;
}

/** HD-3: a clip on the scaled grid -- its whole pixels' span, `x0 s` .. `(x1 + 1) s - 1`. At scale 1 the clip as it stands. */
export function scaleClip(s: number): (c: UiClip | null) => UiClip | null {
  return (c: UiClip | null): UiClip | null => (s === 1 || !c ? c : { ...c, x0: c.x0 * s, y0: c.y0 * s, x1: (c.x1 + 1) * s - 1, y1: (c.y1 + 1) * s - 1 });
}

/**
 * The pixels a 2D quad covers (`GS_SPRITE_COVERAGE_READING`): `ceil(min)` .. `ceil(max)`, within the frame and the clip; null
 * when none. The corners are taken as given, no 1/16 step (`GS_SPRITE_SUBPIXEL_READING`).
 */
export function coverageBounds(
  x0: number, y0: number, x1: number, y1: number, W: number, H: number, clip: UiClip | null,
): { xs: number; ys: number; xe: number; ye: number } | null {
  let xs = Math.ceil(Math.min(x0, x1)), xe = Math.ceil(Math.max(x0, x1)), ys = Math.ceil(Math.min(y0, y1)), ye = Math.ceil(Math.max(y0, y1));
  xs = Math.max(xs, 0, clip ? clip.x0 : 0); ys = Math.max(ys, 0, clip ? clip.y0 : 0);
  xe = Math.min(xe, W, clip ? clip.x1 + 1 : W); ye = Math.min(ye, H, clip ? clip.y1 + 1 : H);
  if (xs >= xe || ys >= ye) return null;
  return { xs, ys, xe, ye };
}

/** HD-3: the bitmap to sample and the factors on a texel coordinate -- its HD replacement when the pack has one (the bitmap's blend kept). */
export function pickBitmap(hd: UiHdTextures | undefined, tex: UiBitmap): { tex: UiBitmap; su: number; sv: number } {
  const r = hd?.(tex) ?? null;
  return r ? { tex: { width: r.width, height: r.height, data: r.data, ...(tex.blend ? { blend: tex.blend } : {}) }, su: r.width / tex.width, sv: r.height / tex.height } : { tex, su: 1, sv: 1 };
}

/**
 * `ALPHA_1` after a bind (web research 141 §2): a bound texture sets its bind packet's blend, `source` (0x44) when it
 * names none. The frame's start is `GS_ALPHA_FRAME_START_READING`; an untextured quad draws by the register as it
 * stands and a missing bitmap leaves it (the compositor's draw loop).
 */
export function blendAfterBind(bitmap: UiBitmap): UiBlend {
  return bitmap.blend ?? 'source';
}

/** A movie item without a picture: black there, not a GS quad -- drawn by `source`, and the register is not touched. */
export const MOVIE_NO_PICTURE_BLEND: UiBlend = 'source';

/**
 * A clear's packed pixel: (r, g, b, 255) through the clamped byte view, so fractional or out-of-range RGB keeps the
 * same conversion, and read as one word in this host's byte order (no assumption that alpha is the high byte).
 */
export function clearPacker(): (r: number, g: number, b: number) => number {
  const pixel = new Uint8ClampedArray([0, 0, 0, 255]);
  const packedPixel = new Uint32Array(pixel.buffer);
  return (r: number, g: number, b: number): number => { pixel[0] = r; pixel[1] = g; pixel[2] = b; return packedPixel[0]!; };
}

/** A clear's four bytes, as `clearPacker` packs them. */
export function clearBytes(rgb: readonly [number, number, number] | readonly number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(new Uint32Array([clearPacker()(rgb[0]!, rgb[1]!, rgb[2]!)]).buffer);
}

/** A texel index repeated into 0 .. n - 1 (the bitmap repeating, `UI_TEXTURE_FILTER_READING`; every bitmap, `UI_TEXTURE_WRAP_READING`). */
export function wrap(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/**
 * GM-29: `wrap` for a whole texel index (`Math.floor`'s answer, or one past it), with no division when it is already in
 * 0 .. n - 1. The same value as `wrap` for every whole `i` and every `n` a bitmap has: in range `i % n` is `i` and `i + n`
 * is exact, so `wrap` gives `i` back, `+ 0` turning a `-0` into the `+0` `wrap` gives; out of range, NaN or infinite it is
 * `wrap` itself (`test/uiRasterRules.test.ts` holds it, `Object.is`, over the edges). A cost, not a rule: the axis tables
 * of both drawers are what they were.
 */
export function wrapIndex(i: number, n: number): number {
  return i >= 0 && i < n ? i + 0 : ((i % n) + n) % n;
}

/**
 * A quad's horizontal texel axis, one entry per covered column `xs` .. `xe - 1`: the left and right texels' byte
 * offsets in a row and the fraction between them. `u = u0 + (du (x - x0)) / dx` in Float64 -- multiply then divide,
 * never a reciprocal or an increment, which can change rounded colour bytes; bilinear takes texel centres at +0.5. The
 * fraction is the whole Float64 one (`GS_BILINEAR_WEIGHT_READING`).
 */
export function columnAxis(
  xs: number, xe: number, x0: number, dx: number, u0: number, du: number, width: number, nearest: boolean | undefined,
  left: Float64Array, right: Float64Array, fraction: Float64Array,
): void {
  for (let k = 0, x = xs; x < xe; k++, x++) {
    const u = u0 + (du * (x - x0)) / dx;
    const tx = nearest ? u : u - 0.5, base = Math.floor(tx);
    left[k] = wrapIndex(base, width) * 4;
    right[k] = wrapIndex(base + 1, width) * 4;
    fraction[k] = tx - base;
  }
}

/** The four values `rowAxis` gives for one screen row. */
export interface RowAxis { top: number; bottom: number; fy: number; iy: number }

/**
 * A quad's vertical texel axis at screen row `y`: the two source rows' byte offsets and the weights between them, as
 * `columnAxis`. With `out` it writes into that object and returns it (fillQuad's row loop passes one, so a row
 * allocates nothing); without, a fresh object.
 */
export function rowAxis(
  y: number, y0: number, dy: number, v0: number, dv: number, height: number, width: number, nearest: boolean | undefined,
  out?: RowAxis,
): RowAxis {
  const v = v0 + (dv * (y - y0)) / dy;
  const ty = nearest ? v : v - 0.5, base = Math.floor(ty), fy = ty - base, iy = 1 - fy;
  const top = wrapIndex(base, height) * width * 4;
  const bottom = wrapIndex(base + 1, height) * width * 4;
  if (!out) return { top, bottom, fy, iy };
  out.top = top; out.bottom = bottom; out.fy = fy; out.iy = iy;
  return out;
}

/*
 * GM-05b (the GPU menus plan; web research 380 §4): the nine readings the software drawer made without naming them.
 * Each value is what the code here and in `uiCompositorView.ts` does today -- nothing changes with them -- and each is
 * reading, pending review. A `D:L` citation is the decompilation (`socom2_game.elf.decomp.c`); "unread" says the rule
 * is the GS's hardware, or the VU1 microcode's, which no line of it shows. Research 380 §4 lists what settles each.
 */

/**
 * GS_BLEND_ROUNDING_READING: a blended colour is computed in Float64 (0x44 `C + (r - C) a`, 0x48 `C + r a`) and stored
 * through the frame's `Uint8ClampedArray` after every quad and triangle: clamped to 0..255, rounded half to even, NaN
 * to 0. The GS blends in its integer unit (`((A - B) x C >> 7) + D`), then clamps (`COLCLAMP` 1, the environment
 * packet at 0x3e0880, research 185 §3.1, pending review) and dithers by `DTHE`, which the per-flip packet 0x3e0980
 * writes (`FUN_003aff30` D:L304731-304835, research 141 §2; its value not stated in a note); that arithmetic is the
 * hardware's: unread in the decompilation.
 */
export const GS_BLEND_ROUNDING_READING = 'float64 blend, stored round-half-even, clamped 0..255' as const;

/**
 * GS_BILINEAR_WEIGHT_READING: the bilinear weights are the texel coordinate's full Float64 fraction (`columnAxis`,
 * `rowAxis`, the compositor's `sample`). `TEX1_1` 0x60 (LINEAR) is every UI bind packet's (research 185 §3.1, pending
 * review); the GS's weight is a 1/16 step of the coordinate, the hardware's: unread in the decompilation.
 */
export const GS_BILINEAR_WEIGHT_READING = 'float64 weights' as const;

/**
 * GS_SPRITE_SUBPIXEL_READING: a 2D quad's corners stay Float64 into the fill rule (`coverageBounds`). The original
 * maps each corner to the GS's frame (`DAT_0049ea00` + x `DAT_0049e9f0`, `FUN_003643b0` D:L261689-261690,
 * D:L261696-261697) and converts it with `vftoi4` (`FUN_001bfee8` D:L40826-40838, D:L261695, D:L261700): x 16,
 * truncated -- a 1/16 corner (research 185 §3.3, pending review). Whole corners, every untransformed quad's (the
 * position is an int at D:L261675-261679), are the same both ways; a scaled node's fractional corner is not.
 */
export const GS_SPRITE_SUBPIXEL_READING = 'float corners' as const;

/**
 * UI_MODEL_EDGE_RULE_READING: the GS's top-left fill rule (GM-15d). A 3D-pass triangle covers a pixel of its bounding
 * box when each of its three edge functions at the integer point, times the winding's sign, is positive -- or exactly 0
 * on an edge that is a left edge (the interior at +x) or a top edge (horizontal, the interior at +y, the frame's y
 * growing down): `modelEdgeOwns`. A pixel on an edge two triangles share is therefore the one triangle's whose left or
 * top edge it is, and a pixel on a right or bottom edge is not drawn. The meshes are drawn through VU1 to the GS, whose
 * triangle fill rule is the hardware's, in no repository source: a reading, pending a GS capture (research 380 §4). The
 * port's own GS reading for its 2D quads is the same half-open rule (research 185 §3.3, `GS_SPRITE_COVERAGE_READING`).
 * Before GM-15d the value was "inclusive on every edge"; both are recorded in the plan's Log (the lane holder's choice
 * between readings, 2026-11-09).
 */
export const UI_MODEL_EDGE_RULE_READING = 'top-left: a pixel on a left or top edge in, on a right or bottom edge out' as const;

/**
 * The top-left rule for one edge (`UI_MODEL_EDGE_RULE_READING`): does a triangle own the pixel whose edge function is
 * `e`, for an edge whose function grows by `gx` a pixel to the right and `gy` a pixel down, `s` the triangle's winding
 * sign (-1 when its signed area is negative)? Inside (`s e > 0`), or on the edge (`e` 0) of a left edge (`s gx > 0`) or a
 * top one (`gx` 0, `s gy > 0`). For the edge P -> Q of `e = (P.x - x)(Q.y - y) - (Q.x - x)(P.y - y)`, `gx = P.y - Q.y`
 * and `gy = Q.x - P.x`: a shared edge, walked the other way or under the other winding, gives each sign flipped, so
 * exactly one of its two triangles owns a pixel on it -- in IEEE arithmetic, where `a b - c d` rounds each product, as
 * JavaScript does (`modelEdgeF32` too). A GPU that fuses the expression into an FMA breaks the exact negation, so two
 * walks of one edge can leave leftovers of the same sign: a double add or a hole on that GPU (GM-27 measures it). The software's (`drawModels`, the plan's executor) and the twin's
 * (`T3_inside`, the model programs' `owns`) are this rule in f64 and in f32.
 */
export function modelEdgeOwns(e: number, gx: number, gy: number, s: number): boolean {
  return s * e > 0 || (e === 0 && (s * gx > 0 || (gx === 0 && s * gy > 0)));
}

const fr = Math.fround;
/**
 * GM-15d (the disc fold): the 3D pass decides coverage and depth in one arithmetic, the GPU's -- every operation rounded
 * to f32, in the twin's order (`uiGpuTwin.ts` T2, T4; the model programs' `e0` .. `e2`, `w0` .. `w2`, `invW`) -- so the
 * software reference, the twin and the shader meet every edge and depth tie alike. The dev-disc run at 4d62d9c02 showed
 * why: with the edge functions, weights and invW in f64 and only the stored depth rounded, the ARMORY's ties came out
 * differently (seam 1,479 / coplanar 53 / other 410 pixels, every one a depth tie; the plan's Log). Neither precision is
 * the original's: the GS compares 16-bit integer Z (`UI_MODEL_DEPTH_QUANTISE_READING`). The attributes (the
 * perspective-correct texel and colour) stay f64 in the software, the B class's.
 *
 * One edge function at the integer point (x, y), `(P.x - x)(Q.y - y) - (Q.x - x)(P.y - y)`, from f32 vertices.
 */
export function modelEdgeF32(px: number, py: number, qx: number, qy: number, x: number, y: number): number {
  return fr(fr(fr(px - x) * fr(qy - y)) - fr(fr(qx - x) * fr(py - y)));
}
/**
 * GM-15d (the disc fold): the depth from two edge functions in f32 -- the weights `e inv`, the third `1 - w0 - w1`, then
 * `invW = (w0 aw + w1 bw) + w2 cw` -- with `inv` the f32 of the f64 area's reciprocal and the three invW as f32: the
 * twin's T2_weight, T2_third and T4_invW (before its power-of-two `depthScale`, which moves no equality).
 */
export function modelDepthF32(e0: number, e1: number, inv: number, aw: number, bw: number, cw: number): number {
  const w0 = fr(e0 * inv), w1 = fr(e1 * inv), w2 = fr(fr(1 - w0) - w1);
  return fr(fr(fr(w0 * aw) + fr(w1 * bw)) + fr(w2 * cw));
}

/**
 * UI_MODEL_DEPTH_FORMAT_READING: the 3D pass's depth is the interpolated invW computed in f32 (`modelDepthF32`, the
 * GPU's arithmetic; GM-15d's disc fold), stored in a Float32 buffer per pass (0 = empty); a pixel draws when its f32 depth is at least the stored one -- GEQUAL, f32 against the
 * f32 store, so the later of two equal depths wins (`drawModels`; GM-15d). The original's is the GS's Z buffer under the
 * bind packets' `TEST_1` 0x5000c (ZTE 1, ZTST GEQUAL; research 185 §3.1, re-read in §11.3) and the `ZBUF_1` the
 * environment packets write: 0x3a000118 -- ZBP 0x118, PSMZ16S, ZMSK 0 -- read off the ELF at 0x3e0940 (the env packet
 * 0x3e0880) and 0x3e09f0 (the per-flip packet 0x3e0980), and not patched at run time: the per-flip `FUN_003aff30`
 * patches only FRAME_1 and XYOFFSET (D:L304822-304823; its pointers set by `FUN_003b1180` at D:L305249-305250). Reading, pending review
 * (research 380 §4). The 16-bit store itself is not modelled: `UI_MODEL_DEPTH_QUANTISE_READING`. Before GM-15d an f64
 * invW had to be strictly greater than the f32 store, so the first won a tie -- R1's double adds, the port's artefact.
 */
export const UI_MODEL_DEPTH_FORMAT_READING = 'float32 invW, GEQUAL (the later of two equal depths wins), 0 empty' as const;

/**
 * UI_MODEL_DEPTH_QUANTISE_READING: the depth is not quantised -- two f32 invW that differ are different depths, however
 * close (`drawModels`). The GS stores a 16-bit Z (PSMZ16S, `UI_MODEL_DEPTH_FORMAT_READING`) of the integer Z each
 * vertex's XYZF2 sends through `FTOI4` (desktop research 12, `desktop@be5578311:docs/research/12-vu1-entry0-ui-path.md`
 * L530-626, from the recompilation's VU1 dumps); the menus' own VU1 lists, and so the Z scale of their viewport, are
 * unread. Inside one Z unit the GS ties two depths an f32 tells apart, and GEQUAL keeps the later: what that changes is
 * unknown until the scale is read (research 380 §4: a GS dump of the roller and the ARMORY, or the VU1 lists decoded).
 */
export const UI_MODEL_DEPTH_QUANTISE_READING = 'none: the float32 invW compared as it stands; the Z16S store and the menus\' Z scale unread' as const;

/**
 * UI_MODEL_GOURAUD_READING: a 3D-pass triangle's vertex colour is interpolated perspective-correctly (by 1/w), as its
 * texel is (`drawModels`). The GS interpolates colour linearly on the screen (its Gouraud) and only STQ by 1/w; the
 * meshes' PRIM is sent by VU1's microcode: unread in the decompilation.
 */
export const UI_MODEL_GOURAUD_READING = 'perspective-correct colour' as const;

/**
 * UI_2D_QUAD_Z_READING: a 2D quad carries no depth: the software draws the list in its order and no quad is tested
 * against the 3D pass's depth. The original sends a Z in each quad's XYZ2 -- `DAT_004a44e0` for an untransformed quad
 * (`FUN_003643b0` D:L261681-261683), the transformed point's otherwise (`FUN_00308640`, D:L261686-261687), the first
 * corner's for both (D:L261691) -- and the bind packets' `TEST_1` has ZTE 1, ZTST GEQUAL (research 185 §3.1, pending
 * review). `DAT_004a44e0`'s value and what the 2D quads' test does against the 3D pass's Z are unread.
 */
export const UI_2D_QUAD_Z_READING = 'unread, unused: list order only' as const;

/**
 * UI_TEXTURE_WRAP_READING: every bitmap repeats at its edges, on both axes (`wrap`; `UiBitmap` carries no clamp). The
 * original's wrap is each texture's `CLAMP_1` in its bind packet (kept by `FUN_00354f80` D:L252786-252801 for
 * `FUN_003c3ce0`); research 185 §3.1 (pending review) reads REPEAT on 536 of the 537 UI and font binds and CLAMP on
 * one, `UI_TXR/specular_map.tif`. Whether the menus draw that one is unread.
 */
export const UI_TEXTURE_WRAP_READING = 'repeat for every bitmap' as const;

/**
 * UI_QUAD_ALPHA_RANGE_READING: a quad's alpha is taken as it stands, `rgba[3] / 128`, unclamped -- 255 gives
 * 1.9921875 and a fractional value is used as it is (`fillQuad`); no range is assumed. The original sends the
 * colour through `vftoi0` (`FUN_001bfef8` D:L40841-40853; `FUN_003643b0` D:L261694, D:L261699) into a PACKED RGBAQ,
 * whose alpha is the low byte (research 141 R141.5): a whole 0..255. GM-04's tally (research 380 §3, dev disc): the
 * menus' draw lists send 0 .. 254 (254: dlgMenu's MENUFADER under 0, packed), whole bytes on the dialogs' quads and
 * glyphs (`@s2u/ui` `packedAlphaByte`), fractional on three paths that do not pack -- the ARMORY's quads
 * (`armoryLayout.ts`, alpha x 128), the TELETYPE cursor (`@s2u/ui` drawList, TELETYPE_CURSOR_READING) and the loader
 * screens' PMODE fade (`loaderScreens.ts`). The drawer still takes what it is sent (GM.R14: a correction is its own task).
 */
export const UI_QUAD_ALPHA_RANGE_READING = 'rgba[3] / 128 as it stands, unclamped; the menus send 0 .. 254, fractional on three paths' as const;
