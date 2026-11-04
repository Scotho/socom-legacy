/**
 * Single-precision arithmetic as the text code does it (web research 111 §1.4). The text functions compute their pen
 * steps and widths in `float` and truncate with `(int)` (`FUN_00362b70` D:L260792-260796, `FUN_00363c20`
 * D:L261360-261363): `int((W - 1) x S + 0.5)` lands on either side of a whole number by one float step, so the result
 * depends on the float format and its rounding. At scale 0.9 (`0.89999998f`) a glyph 6 texels wide gives 4.4999999 +
 * 0.5: 5 when the sum rounds to nearest, 4 when it rounds toward zero.
 *
 * EE_FPU_ROUNDING_READING: the PS2 EE's FPU rounds every result toward zero (it has no other mode), and PCSX2's
 * default EE rounding mode ("Chop / Zero") reproduces it; so each step here is rounded to single precision toward zero
 * in the order the decompiled expression writes it. A fused multiply-add (`madd.s`), if the compiler emitted one, would
 * round once where this rounds twice: the instructions were not read. Settled by a caption crop whose width depends on
 * it (PLAT-30's scorer; research 111 §7).
 */
export const EE_FPU_ROUNDING_READING = 'toward zero, each step' as const;

const BOX = new Float32Array(1);
const BITS = new Uint32Array(BOX.buffer);

/** `x` to single precision, rounded toward zero (`EE_FPU_ROUNDING_READING`). */
export function f32(x: number): number {
  if (!Number.isFinite(x)) return Math.fround(x);
  const r = Math.fround(x);
  if (r === x || Math.abs(r) <= Math.abs(x)) return r;
  BOX[0] = r;
  BITS[0] = BITS[0]! - 1;   // one step toward zero: the magnitude's bits less one, either sign
  return BOX[0]!;
}

export const fmul = (a: number, b: number): number => f32(a * b);
export const fadd = (a: number, b: number): number => f32(a + b);
export const fsub = (a: number, b: number): number => f32(a - b);
export const fdiv = (a: number, b: number): number => f32(a / b);
/** C's `(int)` of a float: truncation toward zero. */
export const toInt = (x: number): number => (Number.isFinite(x) ? Math.trunc(x) : 0);
