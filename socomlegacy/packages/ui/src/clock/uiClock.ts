/**
 * The front end's frame clock (PLAT-12; web research 110): a fixed UI tick at the original's rate, fed by a `now()` the
 * caller passes in (the viewer's `requestAnimationFrame` timestamp or `performance.now()`, in milliseconds), with the
 * interpolation fraction for drawing, a capped catch-up for a late frame, and a frozen clock for a hidden tab.
 *
 * What the original does (research 110 §1-§3; `D:L<line>` = a line of `socom2_game.elf.decomp.c`):
 * - **The tick is the frame.** The menu state's tick (`CMenuState_Tick` 0x1f4640, research 115 §7) runs once a frame,
 *   and the frame ends in the flip `FUN_003aff30` (D:L304731-304768), which waits vertical blanks (`sceGsSyncV`
 *   0x1a2110) while the frame's time plus 1/60 is below 1/`DAT_003e1400`, then once more. `DAT_003e1400` is **30** in
 *   the ELF (0x3e1400; the movie open writes 30 again, D:L207813, `FUN_003b17d0` D:L305431-305441): two NTSC fields a
 *   frame when the work fits in one.
 * - **dt is measured**, not fixed: timer 0 counts H-blanks (mode 0x83, `FUN_0034f3c0` D:L249318-249335) and dt is the
 *   count times 1/15734: `FUN_003b14a0` writes 15734.25 for video mode 0 (D:L305383) and `FUN_0034f3c0` truncates it to
 *   an integer before the reciprocal (D:L249327-249333). 525 H-blanks for two fields, so the game's own dt is
 *   525 / 15734 s (29.9695 Hz), 16 ppm longer than the hardware's two-field frame 1001/30000 s (29.97003 Hz).
 * - **A dropped frame** (work over one field) lasts three fields: one tick with dt = 0.05 s. The shell then clamps the
 *   step it gives scripts and fades to `min(dt, 0.05)` (`FUN_003654c0` A2, D:L262270-262273): past 0.05 s a frame's time
 *   is lost to the scripts, while everything counted in frames (the switch countdown, one movie picture a tick) moves
 *   one frame. This clock does not reproduce the console's overruns (that is the console's own load, PLAT-36's to
 *   measure); it reproduces the steady two-field tick, and a late browser frame is caught up in whole fixed ticks
 *   (`DROPPED_FRAME_READING`), at most `CATCHUP_LIMIT_READING` seconds of them per advance.
 *
 * Pure: no `performance`, no `requestAnimationFrame`, no DOM (web sprint 6 package boundaries; W9.R10).
 */

/** A rate in hertz as a fraction `num / den`, so tick times and PTS compare exactly. */
export interface Rate { readonly num: number; readonly den: number }

/** Timer 0's H-blanks a second in video mode 0 (NTSC) as the game writes it: `DAT_004a44f8` = 0x4675d900 = 15734.25 (`FUN_003b14a0` D:L305383). */
export const NTSC_HBLANK_HZ = 15734.25;
/**
 * dt's scale as the game computes it: `DAT_0049e2d4` = `(uint)DAT_004a44f8` = 15734 (`FUN_0034f3c0` D:L249327-249328),
 * and dt = count x `DAT_0049e2d8` = count / 15734 (D:L249333; the flip, D:L304764).
 */
export const NTSC_HBLANK_SCALE = Math.trunc(NTSC_HBLANK_HZ);
/** H-blanks in two NTSC fields (262.5 each): what timer 0 counts over a two-field frame. */
export const NTSC_FRAME_HBLANKS = 525;
/**
 * The dt the game measures for a two-field frame: 525 / 15734 s = 0.0333672 s (29.9695 Hz) =
 * `NTSC_FRAME_HBLANKS / NTSC_HBLANK_SCALE`. The page and the room read `@s2u/scene`'s `GAME_FRAME_DT` (PF-01, PF.R8,
 * research 208 §2); the UI keeps its own copy, bit-identical, because `@s2u/ui`'s index must load no `@s2u/scene`
 * (INT-LOADING review F3, `test/headless.test.ts`). `test/clock.test.ts` pins the two equal.
 */
export const GAME_FRAME_DT_SECONDS = NTSC_FRAME_HBLANKS / NTSC_HBLANK_SCALE;
/**
 * Fields a menu frame lasts when its work fits in one: `DAT_003e1400` = 30 (the ELF's word at 0x3e1400), the flip's
 * wait `elapsed + 1/60 < 1/30` (D:L304747) then one more `sceGsSyncV` (D:L304766).
 */
export const UI_FIELDS_PER_TICK = 2;
/**
 * The UI tick, in hertz: two NTSC fields, the hardware's two-field frame 30000/1001 = 29.97003 Hz to 1 ppm. [reading]
 * Read from the flip and its cap word, not measured: the block's "60 Hz" (PC research 09, no line cited) is contradicted
 * (research 110 §1); the recomp VBlank count over a scripted WAIT (PLAT-36) would prove it. Research 116's
 * `MENU_TICK_RATE_READING` agrees.
 */
export const UI_TICK_HZ_READING = 29.97;
/** `UI_TICK_HZ_READING` as an exact fraction. */
export const UI_TICK_RATE: Rate = { num: 2997, den: 100 };
/**
 * A tick's seconds (the dt each tick hands on): 100 / 2997. The game's own measured dt is `GAME_FRAME_DT_SECONDS`
 * (525 / 15734, 16 ppm longer); no tick count in research 110 moves between the two, and the clock hands on the tick's.
 */
export const UI_TICK_SECONDS = 100 / 2997;
/** The shell's step clamp: scripts, the fader and the widgets are stepped with `min(dt, 0.05)` (`FUN_003654c0` D:L262270-262273). */
export const SHELL_STEP_CLAMP_SECONDS = 0.05;
/**
 * The most wall time one `advance` turns into ticks; the rest is lost. [reading] The console's own limit: past 0.05 s
 * a frame's time is lost to its scripts (the shell's clamp, above), so a browser frame up to 0.05 s late -- a display at
 * 20 Hz or more -- loses nothing, and a longer stall runs at most two ticks, not a burst. Research 110 §3.
 */
export const CATCHUP_LIMIT_READING = SHELL_STEP_CLAMP_SECONDS;
/**
 * A late frame is caught up in whole fixed ticks, each with the tick's dt, so a frame-indexed trace (PLAT-32's goldens)
 * keeps the console's tick count for the wall time; the console's alternative -- one tick with a longer dt -- happens
 * only when its own work overruns, which the port does not model. [reading] Research 110 §3.
 */
export const DROPPED_FRAME_READING = 'fixed-ticks' as const;
/**
 * A hidden tab freezes the clock: no ticks while hidden, no catch-up on return, the carry kept. The console has no
 * hidden tab; a browser stops `requestAnimationFrame` there and slows timers to about 1 Hz. [reading] Research 110 §4.
 */
export const HIDDEN_TAB_READING = 'freeze' as const;

/** A guard against a tick due exactly on a boundary being missed by a rounding of the sum (60 Hz frames on a 60 Hz rate). */
const BOUNDARY_EPSILON = 1e-9;

/** The seconds of one tick at `rate`. */
export function tickSeconds(rate: Rate): number { return rate.den / rate.num; }

export interface UiClockOptions {
  /** The tick rate; default `UI_TICK_RATE` (29.97 Hz). */
  rate?: Rate;
  /** The most seconds one advance turns into ticks; default `CATCHUP_LIMIT_READING`. */
  catchUpLimit?: number;
}

/**
 * The fixed UI tick. Each `advance(now)` adds the wall time since the last (capped) to an accumulator and runs every
 * whole tick it holds, oldest first, each with `tickSeconds`; `alpha` is the fraction of a tick left for drawing.
 * Deterministic: the same `now()` sequence (and `setHidden` calls) gives the same ticks and fractions.
 */
export class UiClock {
  readonly rate: Rate;
  readonly tickSeconds: number;
  readonly catchUpLimit: number;
  /** Ticks run so far. */
  ticks = 0;
  /** The game's frame counter `_DAT_004a4490`: bumped by every tick and every `frameSync` (D:L304765, D:L304882). */
  frames = 0;
  /** Wall seconds the catch-up cap dropped (a hidden tab's time is not counted: it never ran). */
  lostSeconds = 0;
  hidden = false;
  private acc = 0;
  private last: number | null = null;

  constructor(opts: UiClockOptions = {}) {
    this.rate = opts.rate ?? UI_TICK_RATE;
    this.tickSeconds = tickSeconds(this.rate);
    this.catchUpLimit = opts.catchUpLimit ?? CATCHUP_LIMIT_READING;
  }

  /** The interpolation fraction: the part of the next tick the accumulator holds, in [0, 1). */
  get alpha(): number { return this.acc; }

  /**
   * Feeds `now` (milliseconds) and runs the ticks due, calling `onTick(tick, dt)` for each (1-based tick index, dt in
   * seconds). Returns how many ran. The first call anchors; a `now` earlier than the last runs nothing and keeps the
   * anchor (the latest `now` seen), so a backwards jitter -- `requestAnimationFrame` timestamps mixed with
   * `performance.now()`, one origin -- counts no time twice; a caller that changes time origin re-anchors through
   * `setHidden(clock.hidden, now)`. A non-finite `now` (NaN from an undefined timestamp, or an infinity) runs nothing
   * and the next finite one anchors.
   */
  advance(now: number, onTick?: (tick: number, dt: number) => void): number {
    if (!Number.isFinite(now)) { this.last = null; return 0; }
    const last = this.last;
    if (last !== null && now <= last) return 0;
    this.last = now;
    if (last === null || this.hidden) return 0;
    let seconds = (now - last) / 1000;
    if (seconds > this.catchUpLimit) { this.lostSeconds += seconds - this.catchUpLimit; seconds = this.catchUpLimit; }
    this.acc += seconds * this.rate.num / this.rate.den;
    const n = Math.floor(this.acc + BOUNDARY_EPSILON);
    this.acc = Math.max(0, this.acc - n);
    for (let i = 0; i < n; i++) {
      this.ticks++;
      this.frames++;
      onTick?.(this.ticks, this.tickSeconds);
    }
    return n;
  }

  /** The page's visibility (`HIDDEN_TAB_READING`): hidden freezes the clock; shown re-anchors at `now` with no catch-up. */
  setHidden(hidden: boolean, now: number): void {
    this.hidden = hidden;
    this.last = Number.isFinite(now) ? now : null;
  }

  /**
   * `FUN_003b05e0` (D:L304875-304886), which the state machine calls before a state's Init (research 115 §8.1,
   * `STATE_CHANGE_FRAME_SYNC_READING`): it bumps the frame counter and re-samples the elapsed time the flip's wait reads.
   * The wait is the fixed tick here, so only the counter moves.
   */
  frameSync(): void { this.frames++; }
}
