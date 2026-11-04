import { GAME_FRAME_DT, type RifleKick as KickRecord, type WeaponRecord } from '@s2u/scene';

/**
 * The rifle's kick on the aim (the WEAPON workstream; research 79 §5 left it a placeholder, `RECOIL_PLACEHOLDER` 0).
 * A port of the inventory's two routines in `socom2_game.elf`:
 *
 * - **A round** (`FUN_005b91c0` 0x5b91c0, decomp lines 472032-472058): the weapon's stance record
 *   (`FUN_003c5a50(weapon, FUN_0058a720(seal, 1))`: `zweapon.rdr`'s `Reticule_Modifiers STANCE_STAND/CROUCH/PRONE`)
 *   gives the kick's size, `FireRifleKickBaseDist` + `FireRifleKickRandomDist` x rand (`+0x44`, `+0x48`, read by
 *   `FUN_003c5f70` / `FUN_003c5f60`); the aim's pitch now (`ctrl+0x130`) is kept as the rest (`inv+0x38`), the size as
 *   the goal (`+0x3c`), the kick's progress (`+0x40`) goes to 0 and its state (`+0x44`) to 1, rising.
 * - **Each tick** (`FUN_005b9280` 0x5b9280, lines 472060-472135, run from `FUN_00550ef0` line 418393 while the
 *   inventory holds a gun), behind the flag `DAT_00650938` -- **1 in the image's `.data`** (`overlays/socom2_game.elf`
 *   at 0x650938), so the kick is on: rising, the pitch climbs at `FireRifleKickRate` (`+0x3c` of the stance record,
 *   `FUN_003c5f90`) a second and the progress with it, until the progress passes the goal (state 2); falling, the pitch
 *   drops at `FireRifleKickReturnRate` (`+0x40`, `FUN_003c5f80`) a second until it is back at the rest (state 0).
 *
 * The pitch is `ctrl+0x130`, the aim's pitch in radians: `FUN_00594600` holds it inside `dynamics.rdr`'s aim limits,
 * which the loader stores in radians (`FUN_0059ba80`: `x 0.017453292`). So the M4A1 standing kicks 0.09 to 0.105 rad
 * (5.2 to 6.0 degrees) at 0.5 rad a second and settles at 0.18; each round re-seats the rest at the pitch it finds,
 * so a held trigger climbs while the rounds come faster than a kick completes (at `FireWait` 0.12, 0.06 rad a round).
 *
 * - **The stick follow** (`FUN_005b9280` D:L472095-472117, PF-06): while the kick falls, an upward pitch push raises
 *   the rest by `param_2 x DAT_00650980` (0x3d23d70a = 0.04) once a call -- once a game frame of 525/15734 s -- capped
 *   at the falling pitch, which then ends the fall there. `param_2` is `ctrl+0x138 x DAT_003df198` (D:L418393; 1.0
 *   in `.data`): `ctrl+0x138` is the pad's pitch axis, `FUN_002c6280` -> `FUN_002c65b0`'s sum of the configured
 *   sticks' y clamped to [-1, 1], the same value that drives the look's pitch before its x 1.72 (`FUN_005966a0`
 *   D:L453773; research 202 section 2.5; research 181 section 2.9). The port takes it from the look law's ramped pitch
 *   push (`LookLaw.pitchAxis`, the pad's stick and the arrow keys standing for it); the raw mouse is no stick and
 *   gives 0. The page's frames are any length, so a frame of `dt` adds `0.04 x push x dt / GAME_FRAME_DT`: the
 *   continuous per-second equivalent MISSION R8 rules (a known deviation, research 208 section 9; the original's rise
 *   comes in once-a-frame steps).
 * - The rest of `FUN_005b9280` (the hurt sway through `FUN_00592b40` and the sniper drift behind `DAT_00650940`) is not
 *   ported.
 */

/** The kick's state at `inv+0x44`: 0 settled, 1 rising, 2 falling. */
export type KickState = 0 | 1 | 2;

/** The stance the kick reads its record for (`FUN_0058a720`). */
export type KickStance = 'stand' | 'crouch' | 'prone';

/**
 * `DAT_00650980` (0x3d23d70a in `.data` = 0.04): the rest's rise a game frame per unit of the pad's upward pitch push
 * while the kick falls (`FUN_005b9280`; research 181 section 2.9, research 202 section 2.5). It was
 * `STICK_FOLLOW_PLACEHOLDER` 0 (research 84 section 11) until PF-06.
 */
export const STICK_FOLLOW = 0.04;

export interface KickStats { state: KickState; goal: number; progress: number; rest: number }

export class RifleKick {
  private state: KickState = 0;
  private goal = 0;
  private progress = 0;
  private rest = 0;
  private stance: KickStance = 'stand';

  constructor(private readonly rifle: Pick<WeaponRecord, 'rifleKick'>, private readonly random: () => number = Math.random) {}

  private record(): KickRecord | null {
    return this.rifle.rifleKick?.[this.stance] ?? null;
  }

  /** `FUN_005b91c0`: a round left at aim pitch `pitch` (radians) in `stance`. */
  round(pitch: number, stance: KickStance): void {
    this.stance = stance;
    const k = this.record();
    if (!k) return;
    this.rest = pitch;
    this.goal = k.baseDist + k.randomDist * this.random();
    this.state = 1;
    this.progress = 0;
  }

  /**
   * `FUN_005b9280`'s kick: one tick of `dt` seconds on the aim pitch `pitch` (radians), the pad's pitch push `push`
   * (`ctrl+0x138 x DAT_003df198`, -1..1, up positive; 0 from the mouse). Returns the change to make to the pitch
   * (radians; 0 when settled).
   */
  frame(dt: number, pitch: number, push = 0): number {
    const k = this.record();
    if (!k || dt <= 0) return 0;
    if (this.state === 1 && this.goal > 0) {
      const progress = this.progress + k.rate * dt;
      this.progress = progress;
      if (this.goal < progress) { this.state = 2; return 0; }
      return k.rate * dt;
    }
    if (this.state === 2) {
      const next = pitch - k.returnRate * dt;
      this.progress -= k.returnRate * dt;
      if (push > 0) {                                                // the stick follow, a game frame's per GAME_FRAME_DT
        this.rest += push * STICK_FOLLOW * (dt / GAME_FRAME_DT);
        if (next < this.rest) this.rest = next;
      }
      if (next <= this.rest) {
        const back = this.rest - pitch;
        this.state = 0; this.goal = 0; this.progress = 0;
        return back;
      }
      return next - pitch;
    }
    return 0;
  }

  /** A new map, or leaving the walk: settled. */
  reset(): void {
    this.state = 0; this.goal = 0; this.progress = 0; this.rest = 0;
  }

  stats(): KickStats {
    return { state: this.state, goal: this.goal, progress: this.progress, rest: this.rest };
  }
}
