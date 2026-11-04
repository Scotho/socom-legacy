import { BLIND_KEYS } from '@s2u/scene';
import { setTrueColourScale, type ColourScaleRow } from './trueColourScale';

/**
 * The flashbang's blind (socomlegacy/docs/research/85 §9.5; PF-07b: research 202 §3.9 item 13 and its V7 §8.2, research
 * 206 §1.2; research 181 §3.7 and V1 #10). The player controller starts the map's `MZANIM.ZAR` animation
 * `blindplayer0<level>` (0x597c00) for a Mark141 inside 150 units -- level 3 facing it close, 2 half-turned or further,
 * 1 facing away or far (`@s2u/scene`'s `flashLevel`). It runs two commands, both from the flash:
 *
 * - **The wash** (`TRUE_COLOR_SCALE`, its sequence `NA`, row 2): every lit colour becomes `c x grey + strength + 0.5`
 *   (`./trueColourScale`) -- grey 0.75 and 60 for levels 2 and 3, held to 1.5 s / 8 s and neutral by 4 s / 10 s; grey
 *   0.9 and 25 for level 1, neutral by 2 s (`BLIND_KEYS`). The world stays visible, washed out: dark areas are lifted.
 * - **The glow** (`BLUR3D`, handler `FUN_00264a40` D:L111838-111903): 2 passes (level 1) or 3 (levels 2, 3), each the
 *   frame drawn into a 320 x 224 buffer, bilinear, and drawn back over the whole frame additively, `Cs x FIX / 128 + Cd`
 *   (ALPHA 0x68; colour 0x80808080, unity), so bright areas bloom toward white. `fadein` keys FIX from 0 to 2.0 (x 128,
 *   clamped to 255) over 0.2 s; `fadeout_normal` starts when it ends (0.2 s after the flash) with its own keys; passes
 *   go to 0 when it is over: full glow 0.2-8.2 s and clear at 10.2 s for level 3 (V7's correction of R2-C3's times).
 *
 * The page draws the wash on the lit colours and the fog (`./trueColourScale`, through `./nightVision`'s `nightLit` and
 * `./fog`) and the glow as the renderer's passes over the world's frame (`./renderer` `setGlow`), before the HUD
 * [reading: where the console's `FUN_0033b570` (D:L50849) falls against its HUD draws is not traced]. The DOM's white
 * overlay and its 60-is-full-white reading are gone.
 */

/** The glow's keys: `fadein` (from the flash) and each level's `fadeout_normal` (from its end), (seconds, FIX / 128). */
export const BLIND_GLOW = {
  fadeIn: { seconds: 0.2, keys: [[0, 0], [0.2, 2]] as [number, number][] },
  fadeOut: {
    1: [[0, 2], [1, 0.5], [2, 0]],
    2: [[0, 2], [1.5, 2], [4, 0]],
    3: [[0, 2], [8, 2], [10, 0]],
  } as Record<1 | 2 | 3, [number, number][]>,
  /** `fadein`'s passes (its BLUR3D +5): 2 for level 1, 3 for levels 2 and 3. */
  passes: { 1: 2, 2: 3, 3: 3 } as Record<1 | 2 | 3, number>,
} as const;

/** `FUN_0025c5f0` (D:L106931): the keys interpolated linearly at `t` (held past both ends). */
function keyed(keys: readonly (readonly [number, number])[], t: number): number {
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [ta, va] = keys[i - 1]!, [tb, vb] = keys[i]!;
    if (t <= tb) return va + (vb - va) * ((t - ta) / (tb - ta));
  }
  return keys[keys.length - 1]![1];
}

/** The key's value into the FIX byte: x 128, clamped to 0..255, truncated (`FUN_0025c5f0`, the handler's `0xff < x`). */
const fixOf = (v: number): number => Math.max(0, Math.min(255, Math.trunc(v * 128)));

/** When a level's glow is over: `fadein` then `fadeout_normal`, seconds from the flash. */
export function glowLength(level: 1 | 2 | 3): number {
  return BLIND_GLOW.fadeIn.seconds + BLIND_GLOW.fadeOut[level].at(-1)![0];
}

/** The glow `t` seconds after the flash: its passes and FIX (0 and 0 before the flash and once it is over). */
export function blindGlow(level: 1 | 2 | 3, t: number): { passes: number; fix: number } {
  if (t < 0 || t > glowLength(level)) return { passes: 0, fix: 0 };
  const passes = BLIND_GLOW.passes[level];
  const fadeIn = BLIND_GLOW.fadeIn.seconds;
  const fix = t < fadeIn ? fixOf(keyed(BLIND_GLOW.fadeIn.keys, t)) : fixOf(keyed(BLIND_GLOW.fadeOut[level], t - fadeIn));
  return { passes, fix };
}

/** A pass's weight on the half-size copy: ALPHA 0x68's `Cs x FIX / 128`. */
export const glowGain = (fix: number): number => fix / 128;

/** The pass's buffer: half the frame each way (the original's 320 x 224 of its 640 x 448), at least 1. */
export function glowHalfSize(width: number, height: number): [number, number] {
  return [Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2))];
}

/** The combine's `+ 0.5` on the summed w (D:L308527; V1 #10: 60 becomes 60.5). */
export const COMBINE_W_BIAS = 0.5;

/**
 * The wash `t` seconds after the flash: row 2 of `TRUE_COLOR_SCALE`, `[grey, grey, grey, strength + 0.5]`, the keys
 * linearly between (`BLIND_KEYS`); null once its last key is reached (neutral) or before the flash.
 */
export function blindWash(level: 1 | 2 | 3, t: number): ColourScaleRow | null {
  const keys = BLIND_KEYS[level];
  if (t < 0 || t >= keys.at(-1)!.t) return null;
  const grey = keyed(keys.map((k) => [k.t, k.grey] as [number, number]), t);
  const strength = keyed(keys.map((k) => [k.t, k.strength] as [number, number]), t);
  return [grey, grey, grey, strength + COMBINE_W_BIAS];
}

/** A lit colour (1 = the GS's 128) through a row: `c x rgb + w / 128`, alpha kept (`./trueColourScale` on the CPU). */
export function washLitColour(c: readonly number[], row: readonly number[]): [number, number, number, number] {
  return [c[0]! * row[0]! + row[3]! / 128, c[1]! * row[1]! + row[3]! / 128, c[2]! * row[2]! + row[3]! / 128, c[3]!];
}

/** The fog colour (0..255) through a row: `c x rgb + w` (`FUN_003b5a10` on `cam+0xd0 x 255`). */
export function washFogColour(c: readonly number[], row: readonly number[]): [number, number, number] {
  return [c[0]! * row[0]! + row[3]!, c[1]! * row[1]! + row[3]!, c[2]! * row[2]! + row[3]!];
}

export interface WhiteOutState {
  level: 1 | 2 | 3 | null;
  t: number;
  /** The glow's strength now, FIX / 255 (0..1): how far the frame is whited out. */
  opacity: number;
  passes: number;
  fix: number;
  /** The wash's row now, null when none. */
  wash: ColourScaleRow | null;
  /** When the running blind is over: the longer of the wash and the glow, seconds. */
  length: number;
}

/** The running blind: its wash on the lit colours (`./trueColourScale`) and its glow for the renderer (`glow`). */
export class WhiteOut {
  private level: 1 | 2 | 3 | null = null;
  private t = 0;

  /** A flash: the stronger of the running level and the new one takes over, from its start. */
  start(level: 1 | 2 | 3): void {
    if (this.level !== null && this.level > level) return;
    this.level = level;
    this.t = 0;
    this.apply();
  }

  stop(): void {
    this.level = null;
    this.apply();
  }

  update(dt: number): void {
    if (this.level === null) return;
    this.t += dt;
    if (this.t > this.length()) this.level = null;
    this.apply();
  }

  /** The glow's passes and FIX now, for the renderer (`ViewerRenderer.setGlow`). */
  glow(): { passes: number; fix: number } {
    return this.level === null ? { passes: 0, fix: 0 } : blindGlow(this.level, this.t);
  }

  opacity(): number {
    return this.glow().fix / 255;
  }

  state(): WhiteOutState {
    const g = this.glow();
    return {
      level: this.level, t: this.t, opacity: g.fix / 255, passes: g.passes, fix: g.fix,
      wash: this.level === null ? null : blindWash(this.level, this.t), length: this.length(),
    };
  }

  private length(): number {
    return this.level === null ? 0 : Math.max(BLIND_KEYS[this.level].at(-1)!.t, glowLength(this.level));
  }

  private apply(): void {
    setTrueColourScale(this.level === null ? null : blindWash(this.level, this.t));
  }
}
