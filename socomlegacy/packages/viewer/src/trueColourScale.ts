import { Vector4 } from 'three';
import type { Node } from 'three/webgpu';
import { renderGroup, uniform, vec3, vec4 } from 'three/tsl';

/**
 * The zAnim command `TRUE_COLOR_SCALE` (set 0, command 36; `FUN_002642f0` D:L111608-111705) as the engine applies it
 * (research 181 §3.7 and its V1 #10; research 202 §3.9; PF-07b): its keys ease into the rows `DAT_004b4d40`, the frame's
 * combine (D:L308514-308527) multiplies the rows' rgb and sums their w **plus 0.5** into `DAT_004b4d30`, and
 * `FUN_003b59a0` / `FUN_003b5a10` (D:L307585-307634) put every lit colour through it: `c' = c x rgb + w` (`vmul`, then
 * `vaddbc` of the w), after the night vision's command `0x5c` when the goggles are on (`FUN_003b59a0`'s second branch).
 * The same scale lifts the fog colour (`FUN_003b5a10` on `cam+0xd0 x 255`, D:L236755-236769).
 *
 * The flashbang's `blindplayer0<level>` is its one user here (`./flash`). The lit colours are in units of the GS's unity
 * (1 = 128, as `./nightVision`), so the w is divided by 128 there; the fog colour is in 0..255 units of 255, so by 255.
 * While no row is set the colours pass unchanged: the neutral row's own `+ 0.5` is the float-to-integer rounding of the
 * console's colour path, which the page's float pipeline does not have.
 *
 * No row is the identity row `(1, 1, 1, 0)` on the same uniforms, and the graphs always apply it (`c x 1 + 0` is `c`
 * exactly): no conditional. A `select` here, over `./nightVision`'s own, made three.js r186 regenerate that inner
 * conditional in each arm of this one and read, in the wash-off arm, a temporary only the other arm assigns -- every
 * character drew black while no flashbang was running (2026-10-04; `test/litColourShader.test.ts`).
 */

/** `[r, g, b, w]`: the rgb scale and the constant, w in the VU lane's 0..255 units (the combine's + 0.5 included). */
export type ColourScaleRow = [number, number, number, number];

// CPS H9, 2026-11-03: per-object compares 0.7 ms and uploads 0.8 ms a frame across ~550 draws; a render-group
// uniform is compared once a render. So the frame-wide uniforms below sit in three's render group, not the per-object
// default -- a browser adaptation on the CPU side only: the same values through the same arithmetic.
/** The row: rgb as given, w / 128 for the lit colours (the identity while none is set). */
const lit = uniform(new Vector4(1, 1, 1, 0)).setName('washLit').setGroup(renderGroup);
/** The same row, w / 255 for the fog colour. */
const fog = uniform(new Vector4(1, 1, 1, 0)).setName('washFog').setGroup(renderGroup);
let current: ColourScaleRow | null = null;

/** Sets the row in use (null: none, the colours unchanged). */
export function setTrueColourScale(row: readonly number[] | null): void {
  if (!row) { lit.value.set(1, 1, 1, 0); fog.value.set(1, 1, 1, 0); current = null; return; }
  current = [row[0]!, row[1]!, row[2]!, row[3]!];
  lit.value.set(row[0]!, row[1]!, row[2]!, row[3]! / 128);
  fog.value.set(row[0]!, row[1]!, row[2]!, row[3]! / 255);
}

/** The row in use, or null (the page's stats and tests). */
export function trueColourScaleRow(): ColourScaleRow | null {
  return current ? [...current] : null;
}

/** A lit colour (1 = 128) through the row: `c x rgb + w / 128`, alpha kept; unchanged with no row. */
export function washLit(c: Node<'vec4'>): Node<'vec4'> {
  return vec4(c.rgb.mul(lit.xyz).add(lit.w), c.a) as unknown as Node<'vec4'>;
}

/** The fog colour (0..1 of 255) through the row: `c x rgb + w / 255`; unchanged with no row. */
export function washFog(colour: Node<'vec3'> | Node<'color'>): Node<'vec3'> {
  const c = colour as unknown as Node<'vec3'>;
  return vec3(c.mul(fog.xyz).add(fog.w)) as unknown as Node<'vec3'>;
}
