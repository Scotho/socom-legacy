import type { WeaponRecord } from '@s2u/scene';
import { fireFrames, fireInterval } from '../accuracy';
import { TICK_HZ } from './protocol';

/**
 * The room's 'rate' gate on a player's rounds, by the commands they name (`match/src/room.ts` `fireAt`), and the page's
 * mirror of it (`../fire` `Fire.pullRound`, LATER 587's second fold): one source, so the two cannot drift. The console has
 * no command gate -- its kit fires on its own frames (`FUN_005c0ae0` D:L476446-476448, `FUN_005c0fd0`
 * D:L476643-476647) -- so the gate is the port's (the room trusts no client's clock); what it holds a round to is the
 * console's rate (LATER 588 (a)).
 *
 * Two bounds, on the weapon's fastest enabled mode (the room does not know the page's mode; a slower mode only fires
 * slower -- BL-1, `FUN_005c09f0` D:L476323-476341: `FireWait`, x 0.8 in burst and automatic):
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
 * the schedule. The page names a press's round at the first command after it (`../netPage` `fireEvent`, LATER 347) -- up
 * to a tick after its moment -- and a step's at the tick at or before its own (LATER 338) -- up to a tick before -- so an
 * honest chain's commands sit within a tick either side of its moments: two ticks.
 */
export const FIRE_SCHEDULE_SLACK_ADAPTATION = 2;

/**
 * LATER 588 (a) (an adaptation, as above): the ticks a round may come after its period and still keep the chain's
 * schedule (`S + Q`, not `c`) -- at least a page frame under the page's 0.1 s clamp (PAR-24: 6 ticks) and a tick for the
 * naming, so a round late by a page frame does not move the schedule late for the rounds after it.
 */
export const FIRE_SCHEDULE_WINDOW_ADAPTATION = 7;

/** The wait of the record's fastest enabled mode (BL-1: the record's `FireWait`, or a burst's or automatic's x 0.8). */
export function fastestWait(record: Pick<WeaponRecord, 'fireWait'> & { readonly fireModes: readonly number[] }): number {   // P3-room F2: the mounted gun's too
  return Math.min(...record.fireModes.filter((m) => m > 0).map((m) => fireInterval(record.fireWait, m)), record.fireWait);
}

/** The gap's cycle in ticks (LATER 326): the fastest wait x `TICK_HZ`, less a tick for the page's rounding. */
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
