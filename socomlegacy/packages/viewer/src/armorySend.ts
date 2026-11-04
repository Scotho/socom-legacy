import { PULL_OUT_SECONDS } from './armoryState';

/**
 * The ARMORY's live changes on their way to the page's seam and the room (web sprint 5, W5.R1; `./main` `applyArmory`).
 *
 * ARMORY_SEND_DEBOUNCE_MS: at most one change per this wait, the last one taken: an item step is 0.2 s of suspended
 * input (`SUSPEND.weaponStep`), and the room's `loadout` budget is a burst of 8 then one each 6 ticks (0.1 s,
 * `match/src/room.ts` `LOADOUT_BURST`/`LOADOUT_EVERY`), so a held key never runs it out (a request past it is refused
 * `rate`, which would put the page back on the room's kit).
 *
 * ARMORY_ROUND_START_RACE_READING (research 95's ledger; the S3 repair): the room takes the screen's changes only while
 * the seat it held is not spawned (`Player.arming`, `ARMORY_SEAT_READING`). The round's start spawns it, and the
 * `roundStart` that tells the page so comes after; a change still waiting in the debounce then would reach a seat
 * already spawned and be refused (`alive`, or `round` for a type), the page put back on the room's kit. So:
 * - `drop`: the round's start closes the screen with the waiting change dropped, not sent -- the page stays on what the
 *   room holds, as the refusal would have left it, without the request;
 * - `now()` (the page's: the round-end interval's last `ARMORY_SEND_NOW_S` seconds, popup 47 on, `NetPage.nextRoundIn`):
 *   each change goes at once, unbatched, so a choice made just before a known start reaches the room before it.
 * The limit left: a waiting room's start (its other side's join) has no clock to see it coming -- a choice made inside
 * the debounce's 150 ms plus the trip before it is not taken.
 */
export const ARMORY_SEND_DEBOUNCE_MS = 150;
/**
 * ARMORY_ROUND_START_RACE_READING: the seconds before a known round start in which each change is sent at once -- from
 * popup 47 on (`PULL_OUT_SECONDS`, `UiBackToLobby` WAIT 5, research 95 §4.1). A held key steps 5 a second there (0.2 s),
 * 25 in the 5 s, inside the budget's 8 and its refill of 10 a second.
 */
export const ARMORY_SEND_NOW_S = PULL_OUT_SECONDS;

export interface ArmorySend<T> {
  /** A change made: sent at once when `now()` says so, else after the wait (the last one in it taken). */
  push(change: T): void;
  /** The waiting change sent now (the screen left by the player). */
  flush(): void;
  /** The waiting change dropped, unsent (the round's start closed the screen: ARMORY_ROUND_START_RACE_READING). */
  drop(): void;
}

export function armorySend<T>(apply: (change: T) => void, now: () => boolean = () => false, wait = ARMORY_SEND_DEBOUNCE_MS): ArmorySend<T> {
  let pending: { change: T } | null = null, timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const flush = (): void => {
    cancel();
    const p = pending; pending = null;
    if (p) apply(p.change);
  };
  return {
    push: (change) => {
      pending = { change };
      if (now()) { flush(); return; }
      if (timer === null) timer = setTimeout(flush, wait);
    },
    flush,
    drop: () => { cancel(); pending = null; },
  };
}
