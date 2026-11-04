/**
 * The server's state in Home's words (LU-2' of `docs/plans/2026-10-09-modern-ui-parallel.md`; the brief
 * `docs/plans/briefs/modern-ui-live-site-scope.md` 3; rulings MU.R18, MU.R19, MU.R23 (2), MU.R24), as a pure function of
 * what the rooms poll already read (nothing here asks anything). A browser adaptation (MU.R1): the project's own
 * launcher, no value of the original game -- every word below is the launcher's own, under the design system's Voice
 * (shared/ds README: the least text that makes it clear; a status says the next step).
 *
 * CX-25 (the console plan): Home itself (`./index`, which gathered the input and drew the cards) is retired with the
 * modern shell. CX-26: its card builders (`homeCards`, the Ready check's `readyFacts` and `readyLede`, the overlay's
 * `discLine`), read by their tests alone, are retired too. What stays is what the console's adapters read:
 * `serverStateWords` (`../../console/adapters/server`) and `RoomsReading` (`../../console/adapters/server`,
 * `../../console/adapters/rooms`).
 */
import { serverFailureWords, type LobbyFailure } from '../lobbies/data';

/**
 * The server's state in one wording (MU-P1b 14, the rendered design review r1; dot's Q3): the console's server line
 * says it with these words. A failed rooms poll retries on its own (`../lobbies/poller`), so offline is said with its
 * retry; a lost session is the account's, not the server's (online).
 *
 * MU-P1d: the failure words are `../lobbies/data` `serverFailureWords` (no answer `Offline`, an answer that fails `Server
 * unavailable`). A reader cannot see a retry in flight (the shared poll's timer is the poller's), only that the poll
 * retries on its own, so the line says it retries.
 */
export function serverStateWords(r: RoomsReading): string {
  if (r.kind === 'waiting') return 'Checking';
  return r.kind === 'failed' && r.why !== 'session-lost' ? serverFailureWords(r.why, true) : 'Online';
}

/** The rooms as the shared poll last read them: a room's name (a map stem from `/rooms`, a lobby name signed in), its map. */
export type RoomsReading =
  | { kind: 'waiting' }
  | { kind: 'ok'; rooms: readonly { name: string; map: string | null; players: number }[] }
  | { kind: 'failed'; why: LobbyFailure };
