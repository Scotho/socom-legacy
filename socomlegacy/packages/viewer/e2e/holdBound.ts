import { HOLD_S, PLACEMENT_S } from '../src/net/objective';
import { TICK_HZ } from '../src/net/protocol';

/**
 * The menu-path specs' bound on a timed hold (the plant, the defuse), pure so a unit test holds it
 * (`../test/menuHoldBound.test.ts`); `./menuMatch.ts` `holdCross` measures, the specs assert.
 *
 * ACT.R8 (the plan `docs/plans/2026-10-07-actions-on-the-menu-match.md`): a timed hold takes the original's real time on
 * any honest machine, and never less for anyone -- the room counts it in elapsed room ticks while the hold is live
 * (`../../match/src/bomb.ts` `step`), not in the page's frames or commands. So the bound that matters is ABOVE and in
 * the room's ticks (`/metrics` `s2u_ticks_total`): 5 s (`HOLD_S`, `FUN_00594600` D:L453260-453294, through
 * `../src/net/objective.ts`) plus the plant's 2.25 s placement (`PLACEMENT_S`, `FUN_005be9a0` D:L475479-475488) plus the
 * harness's sampling. A regression to a frame-counted hold (research 250 s7 finding 3: one count a page frame, ~20 s at
 * 15 fps) fails it on any page under ~46 fps.
 */

/**
 * The slack on a hold's room time, seconds: the spec's judgement, not a game value. What the ticks read between the
 * press and the state frame include beyond the hold itself: the fake pad's write (two frames), the first held command's
 * frame (one page frame of wall time: 0.2 s at 5 fps -- `main.ts`'s 0.1 s dt clamp bounds simulation time, not the
 * frame's latency), the socket both ways, `holdCross`'s 100 ms poll and the two `/metrics`
 * reads -- a few hundred ms on the GREEN runs' 15-20 fps pages -- and room for one page hitch past the room's live window
 * (`HOLD_LIVE_TICKS_PLACEHOLDER`, 250 ms: the hold pauses while room ticks run on). Research 250 s8.
 */
export const MENU_HOLD_ROOM_TOLERANCE_READING = 1.5;

export type HoldKind = 'plant' | 'defuse';

/** The most seconds of the room's clock a hold may take from the press to its state frame (ACT.R8). */
export const holdRoomCeiling = (kind: HoldKind): number =>
  HOLD_S + (kind === 'plant' ? PLACEMENT_S : 0) + MENU_HOLD_ROOM_TOLERANCE_READING;

/**
 * The pre-ACT.R8 room's hold count a second for a page at `fps` (once a room tick on which a held command ran, so at the
 * page's frame rate up to `TICK_HZ`: research 250 s7 finding 3). NOT how the room counts now; kept only to size the
 * harness's wait (`holdWaitMs`), so that a hold regressed to frame counting still lands within the wait and fails on
 * `holdRoomCeiling` with its measured time rather than on a bare time-out.
 */
export const holdCountRate = (fps: number): number => Math.max(1, Math.min(TICK_HZ, fps));

/** How long `holdCross` waits for the hold, ms: `ms` on a 60 fps page, longer in proportion on a slower one (the fallback). */
export const holdWaitMs = (ms: number, fps: number): number => ms * (TICK_HZ / holdCountRate(fps));
