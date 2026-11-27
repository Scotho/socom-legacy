import { GAME_FRAME_DT, ITEM, type WeaponRecord } from '@s2u/scene';
import { fireFrames, fireInterval } from '../accuracy';
import { AFTER_SHOT_DEFAULT } from '../firearms';
import { TICK_HZ } from './protocol';

/**
 * The room's 'rate' gate on a player's rounds, by the commands they name (`match/src/room.ts` `fireAt`), and the page's
 * mirror of it (`../fire` `Fire.pullRound`, LATER 587's second fold): one source, so the two cannot drift. The console has
 * no command gate -- its kit fires on its own frames (`FUN_005c0ae0` D:L476446-476448, `FUN_005c0fd0`
 * D:L476643-476647) -- so the gate is the port's (the room trusts no client's clock); what it holds a round to is the
 * console's rate (LATER 588 (a)).
 *
 * Two bounds, on the weapon's fastest enabled mode (the room does not know the page's mode; a slower mode only fires
 * slower -- BL-1, r0004 0x5c76f0 (`../accuracy` `fireInterval`): `FireWait` x 0.8 in burst and automatic, x 1.2 in single):
 * - **the gap** (BL-1, LATER 326): a round's command at least the wait x `TICK_HZ`, less a tick, after the last round's;
 * - **the schedule** (LATER 588 (a), reading, pending review): the console's period, `Q` = 2 x `fireFrames` ticks -- its
 *   rounds `fireFrames` game frames apart (OBF-19, `../accuracy` `fireFrames`: the timer run down in float32), a game
 *   frame 2.002 ticks (`GAME_FRAME_DT` x `TICK_HZ`), so 2 x frames ticks is at most the console's period -- held over the
 *   chain, not per gap: a round at command `c` is taken only if `c` >= `S + Q - FIRE_SCHEDULE_SLACK_ADAPTATION`; then
 *   `S` moves on a period (`S + Q`) when `c` is at most `FIRE_SCHEDULE_WINDOW_ADAPTATION` past it, else to `c` (a new
 *   chain). A forger is held to a round per `Q` on average (the gap alone held it to the unquantised wait: an HK5
 *   automatic 12.5 a second against the console's 9.99).
 */

/**
 * LATER 588 (a) (an adaptation: the port's page jitter, not the original's): the ticks a round's command may come before
 * the schedule. Derived (LATER 588 (a)): the page named a press's round at the first command after it (`../netPage`
 * `fireEvent`, LATER 347) -- up to a tick after its moment -- and a step's at the tick at or before its own (LATER 338) --
 * up to a tick before -- so an honest chain's commands sat within a tick either side of its moments: two ticks.
 * LATER 1147 (research 443 §2; reading, pending review), re-derived and KEPT at 2: every trigger round of the page now
 * leaves at a kit step (`../fire` `update`; none at the press), named at the tick at or before its step, so one tick
 * would hold the page's honest rounds (`match/test/roomFireCadence.test.ts` passes at 1 at 30, 60 and 144 Hz and on
 * uneven frames), and the room's bots, named at the tick at or after their moments (`match/src/bots/roles.ts`
 * `BotFirePolicy`), pass at either (`match/test/botFireGate.test.ts`). Not tightened: at 1 a forged claim every command
 * stops meeting the one-tick-inside bloom (`room.ts` REFUSED_ROUND_BLOOM_TICKS, LATER 105) and lands a round each console
 * period instead of only its first (`match/test/roomRifleJitterBloom.test.ts` (b): 11 of 60 against 1) -- a change to the
 * room's answer to forged rounds, left for the controller's ruling.
 */
export const FIRE_SCHEDULE_SLACK_ADAPTATION = 2;

/**
 * LATER 588 (a) (an adaptation, as above): the ticks a round may come after its period and still keep the chain's
 * schedule (`S + Q`, not `c`) -- at least a page frame under the page's 0.1 s clamp (PAR-24: 6 ticks) and a tick for the
 * naming, so a round late by a page frame does not move the schedule late for the rounds after it.
 */
export const FIRE_SCHEDULE_WINDOW_ADAPTATION = 7;

/**
 * The wait of the record's fastest enabled mode (BL-1: single's `FireWait` x 1.2 -- SWAP-FIRE, r0004 0x5c76f0; was the
 * unscaled `FireWait`, r0001's -- or a burst's or automatic's x 0.8). Single stands in for a record with no mode listed.
 */
export function fastestWait(record: Pick<WeaponRecord, 'fireWait'> & { readonly fireModes: readonly number[] }): number {   // P3-room F2: the mounted gun's too
  return Math.min(...record.fireModes.filter((m) => m > 0).map((m) => fireInterval(record.fireWait, m)), fireInterval(record.fireWait, 1));
}

/** `FUN_003d2a60`: the first round mode (5 and up), the mode a launched round fires in. */
const FIRST_ROUND_MODE = 5;

/**
 * The room's wait in ticks after a launched round (`match/src/room.ts`): the round's `FireWait` in its round mode -- x 1.2
 * (SWAP-FIRE, r0004 0x5c76f0: modes 4 and up), as the page's kit waits (`../fireCore` through `fireInterval`) -- less a
 * tick for the page's rounding. Was the unscaled `FireWait` (r0001's).
 */
export function launchedRoundWaitTicks(fireWait: number): number {
  return Math.round(fireInterval(fireWait, FIRST_ROUND_MODE) * TICK_HZ) - 1;
}

/**
 * LATER 588 (c) (reading, pending review): the game frames a lock of `seconds` holds the kit -- `kit+0x820` run down a
 * game frame at a time in float32 while non-zero, ended on the frame it goes below 0, every frame of it skipping the fire
 * branch (`FUN_005c0fd0` D:L476550-476563; r0004 0x5c7d94-0x5c7e20, the expiry's frame included); 0 for no lock.
 * Lifted from the bots' `botFireFrames` (`match/src/bots/roles.ts`, LATER 1365) so the rockets' wait counts it the same way.
 */
export function lockFrames(seconds: number): number {
  if (!(seconds > 0)) return 0;
  const f = Math.fround, dt = f(GAME_FRAME_DT);
  let left = f(seconds), frames = 0;
  do { left = f(left - dt); frames++; } while (!(left < 0));
  return frames;
}

/** What a rocket round's kit entry says of its wait (`@s2u/scene` `KitRound`'s keys). */
export interface RocketWaitKeys { readonly fireWait: number; readonly reloadAfterShot: boolean; readonly reloadDelayAfterShot?: number }

/**
 * LATER 1365 (reading, pending review; research 84 s6): the lock a rocket round arms after its launch, seconds. The
 * launcher's own id (the LAW 145, the RPG-7 146) is in the exempt list, but the after-shot arm's other branch arms the
 * lock for a resolved round of id 0xba -- `ITEM.RPG_ROUND`, 186 -- with no test of the count or of `kit+0x820` (r0004
 * 0x5cd330-0x5cd338 in 0x5cc9d0; r0001 `FUN_005c5340` D:L479339-479342), so on the last rocket too, the round's
 * `ReloadDelayAfterShot` (else the parser's default), when the round's record carries `ReloadAfterShot`
 * (0x5cd220-0x5cd350; D:L479322-479343). The LAW HEAT (185) arms none.
 */
export function rocketLockSeconds(roundId: number, round: RocketWaitKeys): number {
  return round.reloadAfterShot && roundId === ITEM.RPG_ROUND ? round.reloadDelayAfterShot ?? AFTER_SHOT_DEFAULT : 0;
}

/**
 * LATER 1365 (reading, pending review; research 84 s6): the game frames from a rocket to the next -- the round's
 * `FireWait` in its round mode (the round's id, 4 and up: x 1.2, r0004 0x5c76f0, 0x5c7760-0x5c7770; `fireFrames`) plus
 * its lock's frames (`rocketLockSeconds`, `lockFrames`), which add: the lock's frames skip the wait's run-down (r0004
 * 0x5c7d94-0x5c7e20; r0001 `FUN_005c0fd0` D:L476550-476563, D:L476643-476646). The LAW HEAT 108, the RPG at least
 * 108 + 30 = 138 at `GAME_FRAME_DT` (r0001's 90 and 120): the RPG's is a floor until `RPG_AFTER_SHOT_CLIP_READING` is
 * read -- the lock's expiry starts the after-shot clip (r0001 `FUN_005c3000` D:L477643; r0004 0x5ca4d0 unread), which
 * may hold the fire longer. Projected, not captured: research 84 s6 names the capture that settles it.
 */
export function rocketWaitFrames(roundId: number, round: RocketWaitKeys): number {
  return fireFrames(round.fireWait, roundId) + lockFrames(rocketLockSeconds(roundId, round));
}

/**
 * LATER 1365: the room's wait in ticks after a rocket (`match/src/room.ts`), the pattern of `launchedRoundWaitTicks`: the
 * round's `FireWait` in its round mode (x 1.2) and its lock, x `TICK_HZ`, less a tick for the page's rounding -- 215 (the
 * LAW HEAT), 275 (the RPG); an honest page's 108 / 138 game frames are 216.2 / 276.3 ticks, never refused. Was
 * `max(FireWait, ReloadDelayAfterShot)` unscaled, 179 for both: r0001's wait, and no build's rule for the RPG's lock.
 */
export function rocketWaitTicks(roundId: number, round: RocketWaitKeys): number {
  return Math.round((fireInterval(round.fireWait, roundId) + rocketLockSeconds(roundId, round)) * TICK_HZ) - 1;
}

/**
 * The gap's cycle in ticks (LATER 326): the fastest wait x `TICK_HZ`, less a tick for the page's rounding. LATER 1147
 * (research 443 §2; reading, pending review), re-derived and kept: two rounds at kit steps `D` seconds apart (`D` at least
 * the wait), each named at the tick at or before its step, are at least `ceil(D x TICK_HZ) - 1` commands apart -- the
 * two floors of a 60 Hz grid may lose a tick -- so "less a tick" still holds for a wait that is not whole ticks; the
 * console's whole-frame period is the schedule's bound (`fireScheduleTicks`), not this one.
 */
export function fireCycleTicks(record: WeaponRecord): number {
  return fastestWait(record) * TICK_HZ - 1;
}

/** LATER 588 (a): the schedule's period `Q` in ticks -- 2 x the fastest enabled mode's game frames (`fireFrames`). */
export function fireScheduleTicks(record: WeaponRecord): number {
  return 2 * Math.min(...record.fireModes.filter((m) => m > 0).map((m) => fireFrames(record.fireWait, m)), fireFrames(record.fireWait, 1));
}

/** No round yet: the gap's last round and the schedule (`S`) far behind any command. */
export const FIRE_GATE_NONE = -1e9;

/** LATER 588 (a): whether a round at command `count` keeps the schedule `schedule` (`S`). */
export function scheduleOpen(schedule: number, record: WeaponRecord, count: number): boolean {
  return count >= schedule + fireScheduleTicks(record) - FIRE_SCHEDULE_SLACK_ADAPTATION;
}

/** LATER 588 (a): the schedule after a round taken at command `count` -- on a period, or a new chain at `count`. */
export function scheduleAfter(schedule: number, record: WeaponRecord, count: number): number {
  const due = schedule + fireScheduleTicks(record);
  return count - due <= FIRE_SCHEDULE_WINDOW_ADAPTATION ? due : count;
}

/** Whether a round at command `count` passes the gap after `last` (the room's: `count - last` not under the cycle). */
export function gapOpen(last: number, record: WeaponRecord, count: number): boolean {
  return count - last >= fireCycleTicks(record);
}
