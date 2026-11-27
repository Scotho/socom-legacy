/**
 * R4P-245 PARTICLE-LENS-TINT (research 89 §24; reading, pending review): the one colour step every particle draw takes,
 * the original's `FUN_003b59a0` (r0004 `0x003d7af0`, D4:L333224-333244). All four of `FUN_003251b0`'s particle draws
 * call it on the particle's colour before writing it to the GS packet (D:L223968, D:L224250, D:L224548, D:L224751), the
 * colour being the key times 128 (`FUN_001bfe68(128.0, ...)`, D:L225585) and the lens row the caller's
 * (`FUN_003b7590(row, index)`, the four rows at `0x4b4c70`; D:L223967):
 *
 * - **The lens fold**, while the lens flag `DAT_004b4a68` is up (D:L307592; r0004 `0x4b82a8`): ACC = row x c.x, + row x
 *   c.y, + row x c.z, then c = ACC + row x row.z, on .xyz only (D:L307604-307607) -- `c' = row.rgb x (R + G + B +
 *   row.z)`, alpha kept: the lens monochrome of the colour at about its brightness. [The broadcast fields (x, y, z of the
 *   colour; **z** of the row in the last term, where the world's VU1 command `0x5c` takes the row's w, `./nightVision`)
 *   and the .xyz masks are read off the instruction words at `0x003b59c0`-`0x003b59d4` of the disc's
 *   `socom2_game.elf` (r0004 the same words at `0x003d7b10`-`0x003d7b24`): the decompilation drops them.]
 * - **The wash**, always, after the fold: `c.xyz = c.xyz x wash.xyz + wash.w` (VMUL, VADDbc.w on .xyz; D:L307595-307596
 *   without the lens, D:L307608-307609 with it), the TRUE_COLOR_SCALE row `_DAT_004b4d30` (r0004 `0x4b8570`).
 *
 * The inputs are proven by capture Q245-PC2 (IQ-137): the flag is 1 exactly while the goggles are on and stays 1
 * through a flashbang's wash; the wash row rests at (1, 1, 1, 0.5) and a flashbang sets (0.75, 0.75, 0.75, 60.5).
 *
 * The page's colours are in units of the GS's unity (1 = 128), so the constants (`row.z`, `wash.w`) are divided by 128.
 * The rows are the page's own lens and wash state: `./nightVision`'s `setLensRows` and `./trueColourScale`'s
 * `setTrueColourScale` hand them here as they set the world's uniforms, so the step needs no three.js and the shared
 * particle core (`./particleGeometry`, drawn by three's path and the raw path alike) runs it on the CPU, as the original
 * does. A wash of none is the identity, as `./trueColourScale` reads the resting row's `+ 0.5` (the console's rounding).
 */
import { lensRow } from './lensFx';

/**
 * READING: which of the four lens rows a particle draw takes. The caller passes `FUN_003b7590(row, i)` the word at
 * `+0x10` of the particle's source (record `+0x10` the emitter, D:L225597; emitter `+0x4` its source, `FUN_00327cd0`
 * D:L225646 from `FUN_00329b40`'s `param_2`), which is not traced. The goggles set all four rows alike, so under them
 * it changes nothing; under a lens that sets them apart it is read as the world's row 0 (which lens, if any: the
 * setter's caller `FUN_00264580` writes rows by a 4-bit mask from the lens data, not traced; the lens flag is 0 under
 * the thermal scope, Q245-PC2, so the fold never runs there).
 */
export const PARTICLE_LENS_ROW_READING = 0;

/** The lens row in use, `[r, g, b, z / 128]` (null: the flag down). */
let lens: [number, number, number, number] | null = null;
/** The wash row, `[r, g, b, w / 128]` (null: none, the identity). */
let wash: [number, number, number, number] | null = null;

/** The lens's four row colours as `./nightVision` takes them (`SCALE_COLOR`'s), or null when the flag drops. */
export function setParticleLens(colours: readonly (readonly number[])[] | null): void {
  if (!colours) { lens = null; return; }
  const r = lensRow(colours[PARTICLE_LENS_ROW_READING] ?? [1, 1, 1, 0]);
  lens = [r[0], r[1], r[2], r[2] / 128];
}

/** The TRUE_COLOR_SCALE row as `./trueColourScale` takes it (`[r, g, b, w]`, w in 0..255 units), or null. */
export function setParticleWash(row: readonly number[] | null): void {
  wash = row ? [row[0]!, row[1]!, row[2]!, row[3]! / 128] : null;
}

/** `FUN_003b59a0` on `r, g, b, a` (1 = 128) into `out`, which it returns. */
export function particleTintInto<T extends number[]>(out: T, r: number, g: number, b: number, a: number): T {
  if (lens) {
    const sum = r + g + b + lens[3];
    r = lens[0] * sum; g = lens[1] * sum; b = lens[2] * sum;
  }
  if (wash) {
    r = r * wash[0] + wash[3]; g = g * wash[1] + wash[3]; b = b * wash[2] + wash[3];
  }
  out[0] = r; out[1] = g; out[2] = b; out[3] = a;
  return out;
}

/** `FUN_003b59a0` on one colour (RGBA, 1 = 128), for tests and the page's stats. */
export function particleTint(c: readonly number[]): [number, number, number, number] {
  return particleTintInto<[number, number, number, number]>([0, 0, 0, 0], c[0]!, c[1]!, c[2]!, c[3]!);
}
