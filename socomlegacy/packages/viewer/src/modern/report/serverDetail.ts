/**
 * The raw server detail the UI never says (MU-P2, the rendered design review round 2, P3-2; dot's items 14/18: "raw
 * detail in the Report"). A browser adaptation with no original (MU.R1): the launcher's own Report tool. The sections
 * say a failed server in the one wording (`../lobbies/data` `serverFailureWords`, `../../console/universe`
 * `universeFailureWords`) and note the detail here; the Report (`./index`) shows the latest as one context line,
 * "server: unavailable (universe query: HTTP 500)", and saves it in its file. Kept per document (the overlay has its
 * own), in memory only, cleared by the source's next success -- and wholly (`clearServerDetails`) when the shared rooms
 * feed answers or the session signs out (`../index`; the review of MU-P2), so the Report never carries a stale one.
 *
 * The detail is a state and a status, never an address or an account: `safeServerDetail` keeps a message only when it
 * is "<what>: HTTP <code>" with <what> one of the fixed prefixes this code's readers write (`SERVER_DETAIL_PREFIXES`),
 * else names the failure by its kind -- a URL, a host or a server's own text in a message is never copied.
 */
export type ServerDetailSource = 'universe' | 'lobby';
export interface ServerDetail { state: 'offline' | 'unavailable'; detail: string }

const held = new WeakMap<Document, Map<ServerDetailSource, ServerDetail>>();

/** Notes `source`'s failure (or, null, its success, which clears it) for `doc`'s Report. */
export function noteServerDetail(doc: Document, source: ServerDetailSource, d: ServerDetail | null): void {
  let m = held.get(doc);
  if (!m) { m = new Map(); held.set(doc, m); }
  m.delete(source);
  if (d) m.set(source, d);   // re-set last: the map's order is the failures' order, the latest last
}

/** Forgets every source's failure for `doc` (the server answered again, or the account left). */
export function clearServerDetails(doc: Document): void {
  held.delete(doc);
}

/** The latest failure still held, as "<state> (<detail>)", or null. */
export function serverDetailLine(doc: Document): string | null {
  const m = held.get(doc);
  if (!m || m.size === 0) return null;
  const last = [...m.values()][m.size - 1]!;
  return `${last.state} (${last.detail})`;
}

/**
 * The prefixes the readers' own refusals carry, exactly: `../lobbies/data` "rooms", `../../universeHost` "universe
 * query", `../../worldOfSocomHost` "channel list", `../../briefingRoomHost` "game-list" (its `op`, the one Lobbies reads).
 */
export const SERVER_DETAIL_PREFIXES: readonly string[] = ['rooms', 'universe query', 'channel list', 'game-list'];

/** `message` when it is "<prefix>: HTTP <code>" for a known prefix (a status, no address), else `fallback`. */
export function safeServerDetail(message: unknown, fallback: string): string {
  if (typeof message !== 'string') return fallback;
  const m = /^([a-z -]+): HTTP \d{3}$/.exec(message);
  return m && SERVER_DETAIL_PREFIXES.includes(m[1]!) ? message : fallback;
}
