import { GAME_FRAME_DT } from '@s2u/scene';
import { TICK_HZ } from '../../viewer/src/net/protocol';

/**
 * PF-37 (web sprint 30; research 236 s1; ruling PF.R57, PF.R58): the shotgun's hit guard, kept on the VICTIM as the
 * original keeps it. `FUN_005abbc0` (D:L464701-464737) skips a hit whose ammo is class 'Q' (`FUN_003d1e10`) while the
 * victim's remembered last projectile (`+0x1048`) is set and also class 'Q', and remembers the one it applies
 * (L464737); `CZSealBody`'s update (`FUN_00550ef0` D:L418081-418083, `piVar14[0x412]`, retail 0x550f9c
 * `sw zero,0x1048(s5)`; vtable 0x6691a0 slot +0x18) clears the memory before the controller's update (L418091), after
 * the `+0x105c & 0x40` gate (L418074); the constructor `FUN_00553ea0` (L419774) clears it too (research 194 s7 A09).
 * One shotgun-class hit per victim per victim update, never latched. Pure: the room holds the victim's tick
 * (`Player.qHitAt`) and asks here. A reading, pending review.
 */

/**
 * The port's window: the victim's update is a game frame (`GAME_FRAME_DT`, PF.R8: 525/15734 s) and the room steps the
 * victim at 60 Hz, so the memory lives `SHOTGUN_GUARD_TICKS` room ticks. Which projectiles share one of the original's
 * intervals depends on its update ordering across shooters and pellet contacts -- owed: 194 A09's capture (two
 * shooters' same-frame volleys, a second volley after the actor update, impacts spanning adjacent updates).
 */
export const SHOTGUN_GUARD_WINDOW_READING = 'victim update (one game frame)';
/** One game frame in room ticks: round(`GAME_FRAME_DT` x `TICK_HZ`) = round(2.002) = 2 (`SHOTGUN_GUARD_WINDOW_READING`). */
export const SHOTGUN_GUARD_TICKS = Math.round(GAME_FRAME_DT * TICK_HZ);
/**
 * The guard skips class 'Q' only (the 12-gauge's volley, the port's `pelletsOf(record) > 1`): the `+0x1048` compare's
 * other branches (L464740+) apply their hit and only remember -- a rifle round on a victim a volley just hit lands.
 */
export const SHOTGUN_GUARD_SCOPE_READING = 'class Q only';

/** Whether a shotgun volley at room tick `now` is skipped on a victim whose last one landed at tick `qHitAt`. */
export function guarded(now: number, qHitAt: number): boolean {
  return now - qHitAt < SHOTGUN_GUARD_TICKS;
}
