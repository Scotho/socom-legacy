/**
 * The game frame (PF-01, ruling PF.R8; research 208): one constant for the original's frame, shared by the page
 * (`packages/viewer`) and the room (`packages/match`, through `@s2u/scene` as it takes `stepGrenade`), and a
 * fixed-step accumulator that applies a per-frame constant once per game frame. The front end's clock keeps its own
 * bit-identical `GAME_FRAME_DT_SECONDS` (`@s2u/ui`'s index may load no `@s2u/scene`: INT-LOADING review F3), and
 * `packages/ui/test/clock.test.ts` pins the two equal.
 *
 * PF.R8's shape: the 60 Hz command and snapshot transport stays (a browser adaptation: the original's network was never
 * frame-locked, research 180 §8.2); a per-frame constant runs once per game frame through `GameFrameAccumulator`, so
 * its effect per second is the original's; an integration whose discretisation shows (the jump, the grenade's flight)
 * steps at `GAME_FRAME_DT` inside it; per-second laws (the run speeds, t90, the throttle) do not move.
 *
 * Pure: no DOM, no clock of its own; the caller hands in real seconds.
 */

/**
 * The game frame, seconds: **525 / 15734** = 0.03336723 s (29.9695 Hz; 29.97 nominal). Proven (research 180 §0, U1;
 * its V1 §8.2 CONFIRMED; research 208 §0):
 * - the main loop `FUN_001e7040` (D:L47855-47878) ticks the core state once per swap with the measured dt
 *   `DAT_004a449c`, no sub-step; the swap `FUN_003aff30` (D:L304731-304768) waits fields while
 *   `elapsed + 1/60 < 1/DAT_003e1400`, and the cap `DAT_003e1400` is 30 in the ELF and in all 25 RDRAM dumps (V1 #1);
 * - dt is timer 0's H-blank count times 1/15734 (`DAT_0049e2d4` = (uint)15734.25, `FUN_0034f3c0` D:L249327-249333):
 *   525 H-blanks for two NTSC fields; every PCSX2 dump reads dt 0.03336723 (research 180 §0's table; V4 #17, research
 *   184 §10.6: 525 H-blanks, 29.97 Hz);
 * - the pad reset `FUN_002dba60` primes the look ramp with a literal 1/30 s (0x3d088889, V1 #1's second line);
 * - research 179 §9.13 (`FLIGHT_TICK`): the projectile steps once per game frame, not at 1/60.
 * Per-second rates (the looped clips' rescale, research 206 §2 V6) are dt-scaled and do not move with it.
 */
export const GAME_FRAME_DT = 525 / 15734;

/**
 * The most game frames one `advance` runs; a longer backlog (a stalled tab) is dropped, not run later. The port's
 * guard, the same 30 as the existing loops (`mover.ts` `MAX_TICKS`, `accuracy.ts` `update`): the console never
 * catches up, it stretches one frame's dt instead (research 180 §0).
 */
export const GAME_FRAME_MAX_STEPS = 30;

/** A guard against a frame due exactly on a boundary being missed by a rounding of the sum (as `uiClock.ts`'s). */
const BOUNDARY_EPSILON = 1e-9;

/**
 * "Apply once per game frame": real seconds in, whole game frames out, the remainder kept for the next call.
 * Deterministic: the same dt sequence gives the same frame counts.
 */
export class GameFrameAccumulator {
  private carry = 0;

  /** `maxSteps`: the most frames one `advance` runs (default `GAME_FRAME_MAX_STEPS`). */
  constructor(readonly maxSteps: number = GAME_FRAME_MAX_STEPS) {}

  /**
   * Adds `dt` real seconds (a negative or non-finite one counts as 0) and returns how many whole game frames have
   * elapsed, at most `maxSteps`; past the cap the backlog is dropped and the remainder is 0.
   */
  advance(dt: number): number {
    if (Number.isFinite(dt) && dt > 0) this.carry += dt;
    let frames = 0;
    while (this.carry >= GAME_FRAME_DT - BOUNDARY_EPSILON && frames < this.maxSteps) {
      this.carry = Math.max(0, this.carry - GAME_FRAME_DT);
      frames++;
    }
    if (this.carry >= GAME_FRAME_DT - BOUNDARY_EPSILON) this.carry = 0;
    return frames;
  }

  /** The seconds carried toward the next game frame, in [0, GAME_FRAME_DT). */
  get remainder(): number { return this.carry; }

  /** How far into the next game frame, 0..1: what a view between two frames is drawn by. */
  alpha(): number { return Math.min(1, this.carry / GAME_FRAME_DT); }

  /** Drops the carried part-frame. */
  reset(): void { this.carry = 0; }
}
