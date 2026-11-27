import type { RoomRoundResult } from './roomResults';

/**
 * OT.R85 (the owner, 2026-10-24, "sure thing" on H299; amended by B4, 2026-11-21, to four humans; `docs/MISSION.md`) --
 * **product track, the owner's rule for our services, not the original's** (the original counts every online game with
 * respawn off, research 155 §6 call 3): a match counts toward stats and ratings when its humans number at least the
 * minimum (`ladderMinimumAt`, central's `ladderMinimum.ts`) counted at round 1's START and at round 1's END, the greater
 * deciding. One count for the three places that make the figure -- central's intake of a host's result
 * (`central/src/hostResults.ts`), central's in-process game track (`central/src/bridge.ts`) and the match process's own
 * figure, logged only (`match/src/game.ts`) -- so the host's and central's agree.
 */

/**
 * The humans on a side at round 1's end: its round result's seats with a side -- a classic ghost (seated after the
 * round's start, `room.ts` `ghostOf`) and a seat joined in progress included, which is the case OT.R85 was ruled for
 * (game 195: an eight-player match that started with four). A seat carries an account, so a CPU is none of them.
 * DISTINCT ACCOUNTS, never seats (LATER 1573's review F1): central's own checks pass a seat held as a player, and a
 * ghost's or a joiner's skips the start lists' containment, so an account a host listed twice would count twice; the
 * start lists are de-duplicated at the intake and this count must be no looser than they are.
 */
export function humansOnSides(r: Pick<RoomRoundResult, 'seats'>): number {
  return new Set(r.seats.filter((s) => s.side !== null).map((s) => s.account)).size;
}

/**
 * The count OT.R85 decides by: the greater of the humans at round 1's start and at its end. `atRound1End` null -- round
 * 1's result unknown to the caller (a guest's round, consumed with no figure; a row an older build wrote) -- falls back
 * to the start alone, OT.R33 as it was.
 */
export function humansCounted(atStart: number, atRound1End: number | null): number {
  return atRound1End === null ? atStart : Math.max(atStart, atRound1End);
}
