/**
 * LATER 896 part 2 (`SEAT_KEEP_ON_RELOAD_ADAPTATION`; the controller's GO of 2026-11-18; product track, a browser
 * adaptation -- no game value, no wire and no server change): after a match's graphics are lost, the notice's "Reload and
 * rejoin" (`./graphicsLost`) sets this page's one flag before it reloads, and that unload then sends neither the match
 * socket's `bye` (`./netPage`'s pagehide: the socket is dropped, as a silent link's is) nor the front end's logout
 * (`./connectHost`, `PAGEHIDE_LOGOUT_ADAPTATION`). The room parks the seat (`SEAT_HOLD_MS_ADAPTATION`, 180 s), the
 * account's next login takes over the parked session (central `PARKED_SEAT_NOT_HOLDING_ADAPTATION`), and its re-join of the
 * same game takes back the SAME seat -- central `test/lobbyGameParkedResume.test.ts`, which also pins why both are skipped:
 * a logout heard while the socket lives frees the seat (4008). Nothing is promised about the body (its own hold is shorter
 * than a reload and a sign-in). Every other unload is as before; the match's end clears the flag (`releaseSeatKeep`).
 */
export const SEAT_KEEP_ON_RELOAD_ADAPTATION = "after a match's graphics loss, the chosen reload sends neither its bye nor its logout, so the room parks the seat for the account's next session" as const;

/**
 * GRAPHICS-RECOVERY (Shadow row 129, GFXRECOVERY-PC2; an adaptation): how long after the press the reload's unload is
 * waited for. `location.reload()` unloads the page later (the new document's response first), and in that wait the match's
 * own teardown can run (a loss during the load) -- its `releaseSeatKeep` and its socket's close must neither end the keep
 * nor say the bye, or the unload's bye and logout lose the seat. Past this wait with no unload the reload did not happen:
 * the keep ends at the next teardown, and a close or a logout is as today (the delta review's F2, a cancelled reload).
 */
export const SEAT_KEEP_RELOAD_PENDING_MS_ADAPTATION = 30_000;

import { SEAT_HOLD_MS_ADAPTATION } from './net/protocol';

let kept = false;
/** When the press asked the reload (`Date.now()`), or null. */
let pressedAt: number | null = null;
const reloadPending = (): boolean => kept && pressedAt !== null && Date.now() - pressedAt < SEAT_KEEP_RELOAD_PENDING_MS_ADAPTATION;
/**
 * Its product review's F1: a teardown inside the wait skipped `releaseSeatKeep`, then the reload was cancelled (Stop /
 * Esc) and nothing re-runs it -- the keep must not stand for ever. A slow reload whose unload comes after the 30 s wait
 * still keeps the seat (the page cannot tell it from a cancelled one), but not past the room's own park
 * (`SEAT_HOLD_MS_ADAPTATION`, 180 s): past it the parked seat is gone, so a later unload is an ordinary one.
 */
const stale = (): boolean => kept && !unloading && pressedAt !== null && Date.now() - pressedAt >= SEAT_HOLD_MS_ADAPTATION;
const endKeep = (): void => { kept = false; pressedAt = null; globalThis.removeEventListener?.('pagehide', onPageHide, true); };
/** Its review's F1: the page is going (its pagehide heard after the press): the teardown that unload runs keeps the keep. */
let unloading = false;
// Its delta review's F1: a pagehide into the back/forward cache (`persisted`) is no unload: the page may come back.
// LATER 1255 (LATER 1242's review F1): and it ends the keep -- the reload did not happen, so the page goes as any page
// does (`./netPage` reads the same event and says its bye), and a restored page's later close keeps nothing.
const onPageHide = (e: Event): void => {
  if (!kept) return;
  if ((e as PageTransitionEvent).persisted === true) { endKeep(); return; }
  if (stale()) { endKeep(); return; }                                     // review F1: a pagehide after the wait is an ordinary unload
  unloading = true;
};

/** "Reload and rejoin": this page's coming unload keeps the seat. */
export function keepSeatOnUnload(): void {
  kept = true;
  pressedAt = Date.now();
  // A capture listener on the window, registered at the press, so it runs before the front end's pagehide (its mount's
  // listener, registered first, then closes the match -- `NetPage.close`, the mount's teardown -- and the session).
  globalThis.addEventListener?.('pagehide', onPageHide, true);
}
/**
 * The match is over (its teardown): an unload from here on is as before -- but not the teardown the kept unload itself
 * runs (the front end's pagehide closes the match before its logout; its review's F1).
 */
export function releaseSeatKeep(): void {
  if (unloading || reloadPending()) return;   // GRAPHICS-RECOVERY: a teardown inside the reload's wait keeps it too
  kept = false;
  pressedAt = null;
  globalThis.removeEventListener?.('pagehide', onPageHide, true);
}
/** Whether this unload keeps the seat (no bye, no logout): pressed, before the page's pagehide (`./netPage`'s own capture listener). */
export function seatKeptForUnload(): boolean { if (stale()) endKeep(); return kept; }
/**
 * Its delta review's F2: kept AND the page unloading -- what a close or a logout run INSIDE the unload asks (`./net/client`
 * `NetClient.close`, `./connectHost`'s logout): a Leave match after a cancelled reload still says its bye. GRAPHICS-RECOVERY:
 * or inside the reload's wait (`SEAT_KEEP_RELOAD_PENDING_MS_ADAPTATION`), the match's teardown before the unload.
 */
export function seatKeptInThisUnload(): boolean { if (stale()) endKeep(); return kept && (unloading || reloadPending()); }
/** Tests only. */
export function resetSeatKeepForTest(): void { kept = false; pressedAt = null; unloading = false; globalThis.removeEventListener?.('pagehide', onPageHide, true); }
