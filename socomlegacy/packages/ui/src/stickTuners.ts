/**
 * CONTROLLER OPTIONS' stick tuners (OT.R72, LATER 315-318; research 302's controller section): the presets and the maps
 * between the three sliders (the UI vars `STICK_SENSITIVITY`, `STICK_INERTIA`, `STICK_DEADZONE`) and the pad reader's
 * words for a stick (`+0x288` the dead zone, `+0x290` the curve's gain, `+0x294` its power, `+0x2a4` the ramp, a stick
 * `0x28` on: the look stick, 1, at `+0x2b0` / `+0x2b8` / `+0x2bc` / `+0x2cc`). Read from the decompilation; each value
 * in f32 (`Math.fround` at each step, the MIPS single's), the constants `DAT_003df208` 0.5, `DAT_003df210` 1.0 and
 * `DAT_003df218` 2.0 (research 204).
 */

const f = Math.fround;
const LO = 0.5, HI = 1.0, TWO = 2.0;                                          // DAT_003df208, DAT_003df210, DAT_003df218

/** A stick's tuner words (`FUN_002da6c0`'s four). */
export interface StickPadWords { gain: number; exponent: number; deadZone: number; ramp: number }

/** The three sliders' values, 0..1 (`SetStickPreset` writes them, the watchers read them). */
export interface StickSliders { sensitivity: number; inertia: number; deadZone: number }

const word = (u: number): number => { const b = new Uint32Array([u]); return new Float32Array(b.buffer)[0]!; };

/**
 * The presets `FUN_002da6c0` (D:L179394-179419): RECRUIT (0), SAILOR (1), SEAL (2), for the stick it is given -- the
 * options' apply gives the look stick (`FUN_0027b790` passes 1, `addiu $a1, $zero, 1` at 0x27b7dc).
 */
export const STICK_PRESETS: readonly StickPadWords[] = [
  { gain: word(0x3f266666), exponent: word(0x40400000), deadZone: word(0x3e99999a), ramp: word(0x3f400000) },
  { gain: word(0x3f51eb85), exponent: word(0x40400000), deadZone: word(0x3e23d70a), ramp: word(0x3f000000) },
  { gain: word(0x3f800000), exponent: word(0x40400000), deadZone: word(0x3e23d70a), ramp: word(0x3e800000) },
];

/** The `stick_preset` value of the CUSTOM box: `SetStickPreset` applies no preset at it or above (`< 3`, D:L125078). */
export const STICK_PRESET_CUSTOM = 3;

/** `FUN_002da8a0` (D:L179462-179474), LOOK SPEED's watcher's setter: the slider 0..1 to the curve's gain 0.5..1.0. */
export function stickGainOfSensitivity(v: number): number {
  const u = v < 0.5 ? f(v * f(0.6)) : f(f(f(v - 0.5) * f(1.4)) + f(0.3));
  return f(LO + f(u * f(HI - LO)));
}

/**
 * `FUN_002da800` (D:L179443-179457), the gain back to the slider. Its split is at 0.5 where the setter's is at 0.3, so a
 * slider set in [0.5, ~0.643) reads back higher -- the original's, kept.
 */
export function stickSensitivityOfGain(gain: number): number {
  const x = f(f(gain - LO) / f(HI - LO));
  return x < 0.5 ? f(x / f(0.6)) : f(f(f(x - f(0.3)) * f(0.71428573)) + f(0.5));
}

/**
 * DEAD ZONE's watcher `FUN_00389e70` with `FUN_002da7d0` (D:L281942-281957, D:L179433-179438): min(v + 0.02, 1) / 2 --
 * the watcher clamps the sum at 1.0 before the halving (D:L281947-281951), so a slider at its top gives 0.5.
 */
export function stickDeadZoneOfSlider(v: number): number {
  const sum = f(v + f(0.02));
  return f((sum <= 1 ? sum : 1) / TWO);
}

/** `FUN_002da7a0` (D:L179424-179428) less 0.02 (`FUN_0027b790`, D:L125098-125104): the dead zone back to the slider. */
export function stickSliderOfDeadZone(deadZone: number): number {
  return f(f(deadZone * TWO) - f(0.02));
}

/** ACCELERATION's watcher (0x389f10, research 204's disassembly): the ramp is 1 - v. */
export function stickRampOfInertia(v: number): number {
  return f(1 - v);
}

/** `FUN_0027b790` (D:L125091-125097): the slider is 1 - the ramp (`+0x2cc`, the look stick's). */
export function stickInertiaOfRamp(ramp: number): number {
  return f(1 - ramp);
}

/** The three sliders `SetStickPreset` writes for preset `n` (0..2): its words read back through the getters. */
export function stickTunersOfPreset(n: number): StickSliders {
  const p = STICK_PRESETS[n]!;
  return { sensitivity: stickSensitivityOfGain(p.gain), inertia: stickInertiaOfRamp(p.ramp), deadZone: stickSliderOfDeadZone(p.deadZone) };
}

/**
 * A stick's words from the three sliders, as their watchers write them for each of the two sticks
 * (`InitSystemTuners` binds each var twice, research 104 §4): the gain, the dead zone and the ramp; the power is not
 * a slider's -- the look stick keeps the preset's 3 (`FUN_002da6c0` writes it, none of the watchers does).
 */
export function stickWordsOfSliders(s: StickSliders, exponent: number): StickPadWords {
  return { gain: stickGainOfSensitivity(s.sensitivity), exponent, deadZone: stickDeadZoneOfSlider(s.deadZone), ramp: stickRampOfInertia(s.inertia) };
}
