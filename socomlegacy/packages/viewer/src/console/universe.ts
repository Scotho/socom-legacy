import { UNIVERSE_QUERY, type UniverseService } from '@s2u/ui';
import { SERVER_OFFLINE, SERVER_UNAVAILABLE } from '../modern/lobbies/data';
import { safeServerDetail, type ServerDetail } from '../modern/report/serverDetail';

/**
 * The HOST and PORT a persona made on the console's Persona screen is filed under (MU-13e fix; research 153 §5 "HOST
 * (OC-3)"). Moved from `../modern/profile/universe.ts` with CX-PERSONA (the modern Profile section retired; nothing else
 * in `src/modern` read it), unchanged but its imports.
 * The original files a persona under the universe the player connected to: `LobbyConnect` (`FUN_00276780`
 * D:L122454-122545) takes the first universe of the chosen name whose status word is not 0 (`FUN_002fd7e0`
 * D:L199853-199872: 0 is the red dot, which cannot be connected to) and the persona form lists and saves under that
 * entry's LOBBY_HOST (+0x9c, the entry's `dns`) and LOBBY_PORT (+0x11c, its `port`) -- `../personaHost`'s
 * `seedName(u.dns, u.port)` and `enterForm(first.dns, first.port)`. The console has no SELECT UNIVERSE screen, so it asks
 * the same service the front end's does (`../universeHost` `fetchUniverseService` at `universeServiceBase`: SVC-05's
 * `POST /texts/universe`, the query `UNIVERSE_QUERY` of `FUN_002fb340` D:L198741-198744) and takes the first connectable
 * entry, as the form's deep link takes the list's first universe. A browser adaptation of the choice; the field mapping
 * is the original's. With SVC-05's placeholder universe the answer is an empty `dns` and port 0 (research 153 §5).
 */
export interface UniverseHost { readonly host: string; readonly port: number }

/** The reader's own refusal of a list that names no universe it can file under: its message is said as it is. */
export class UniverseRefusal extends Error {
  constructor(message: string) { super(message); this.name = 'UniverseRefusal'; }
}

/**
 * A failed universe read in the launcher's one wording (MU-P1c 18, the rendered design review r1; dot's items 14/18):
 * the reader's own refusal as it is; no answer (`fetch`'s TypeError) `SERVER_OFFLINE`; anything else -- an HTTP 500, an
 * answer not of the shape -- `SERVER_UNAVAILABLE` (both `../modern/lobbies/data`). The raw message ("universe query:
 * HTTP 500") is never said in the UI. A browser adaptation (MU.R1).
 */
export function universeFailureWords(e: unknown): string {
  if (e instanceof UniverseRefusal) return e.message;
  return e instanceof TypeError ? `${SERVER_OFFLINE}.` : `${SERVER_UNAVAILABLE}.`;
}

/**
 * The same failure's raw detail for the Report (MU-P2, the design review r2, P3-2; `../modern/report/serverDetail`): an HTTP
 * status as the reader says it ("universe query: HTTP 500"), no answer named as such, anything else by its kind -- a
 * message is copied only when it is a status, so no address reaches the file. The reader's own refusal is null: it is
 * said in the UI already.
 */
export function universeFailureDetail(e: unknown): ServerDetail | null {
  if (e instanceof UniverseRefusal) return null;
  if (e instanceof TypeError) return { state: 'offline', detail: 'universe query: no answer' };
  return { state: 'unavailable', detail: safeServerDetail(e instanceof Error ? e.message : null, 'universe query: unreadable answer') };
}

export async function readUniverseHost(service: UniverseService): Promise<UniverseHost> {
  const reply = await service.query({ ...UNIVERSE_QUERY });
  // `FUN_002fdaf0` D:L199953-200104: an entry of a non-zero status ends the list and is no universe.
  const open = reply.universes.find((u) => u.status === 0 && u.universeStatus !== 0);
  if (!open) throw new UniverseRefusal(reply.universes.some((u) => u.status === 0) ? 'No universe is open to connect to' : 'The server named no universe');
  return { host: open.dns, port: open.port };
}
