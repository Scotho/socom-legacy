import type { UniverseEntry, UniverseNewsChunk, UniverseQuery, UniverseReply, UniverseService } from '@s2u/ui';

/**
 * ONL-04's page half (web research 147 §4): `GetServerList`'s worker (`@s2u/ui`'s `UniverseList.job`) sends the
 * universe query through this service to central, which answers it from SVC-05's texts
 * (`packages/central/src/serverTexts.ts`, `POST /texts/universe`, mounted on central's listener when it has a data
 * directory; SA-16: the universe's name the owner's, its USERS central's live lobby sessions). The transport is ours (a browser adaptation, as SVC-05's endpoint is); the query's words
 * and the replies' fields are the original's (research 133 §1-§2). A failure of any kind -- no server, no endpoint, a
 * refusal, a reply of another shape -- is a query never answered: the promise rejects, the client's lists stay
 * unfinished and the DNAS screen's 90-s watchdog reboots, as the console's would with no MUIS answer.
 */

/**
 * UNIVERSE_SERVICE_URL_READING: where the page asks. The console reaches MUIS by a host name through the DNS its
 * network configuration names; OT.R3 skips the DNS ("we have a central host"), and the card's configuration names our
 * server (research 136 §4, ONL-01's to pass). Until ONL-01 hands that string to the front end, the page asks the server
 * the address's `server=` names (its WebSocket URL, OT.R9's parameter, over HTTP at the same origin), else the page's own
 * origin -- `&mp`'s rule for `/ws` (`netPage.ts`). A browser adaptation. [reading]
 */
export const UNIVERSE_SERVICE_URL_READING = 'server= (its origin over HTTP), else the page\'s own origin' as const;

/** The base URL of the match server's services for this page (`UNIVERSE_SERVICE_URL_READING`). */
export function universeServiceBase(search: string, location: { protocol: string; host: string; origin?: string }): string {
  const own = location.origin ?? `${location.protocol}//${location.host}`;
  const named = new URLSearchParams(search).get('server');
  if (!named) return own;
  try {
    const u = new URL(named);
    const protocol = u.protocol === 'wss:' || u.protocol === 'https:' ? 'https:' : u.protocol === 'ws:' || u.protocol === 'http:' ? 'http:' : null;
    return protocol === null ? own : `${protocol}//${u.host}`;
  } catch {
    return own;
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function entryOf(raw: unknown): UniverseEntry {
  const e = raw as Record<string, unknown> | null;
  if (!e || typeof e !== 'object') throw new Error('universe entry: not an object');
  const ok = isInt(e['status']) && isStr(e['name']) && isStr(e['dns']) && isInt(e['port']) && isStr(e['description'])
    && isInt(e['universeStatus']) && isInt(e['userCount']) && isInt(e['maxUsers']) && isStr(e['billing'])
    && isStr(e['billingName']) && isStr(e['extendedInfo']) && isBool(e['endOfList']);
  if (!ok) throw new Error('universe entry: a field of another type');
  return {
    status: e['status'] as number, name: e['name'] as string, dns: e['dns'] as string, port: e['port'] as number,
    description: e['description'] as string, universeStatus: e['universeStatus'] as number, userCount: e['userCount'] as number,
    maxUsers: e['maxUsers'] as number, billing: e['billing'] as string, billingName: e['billingName'] as string,
    extendedInfo: e['extendedInfo'] as string, endOfList: e['endOfList'] as boolean,
  };
}

function newsOf(raw: unknown): UniverseNewsChunk {
  const n = raw as Record<string, unknown> | null;
  if (!n || typeof n !== 'object' || !isInt(n['status']) || !isStr(n['news']) || !isBool(n['endOfList'])) throw new Error('news: a field of another type');
  return { status: n['status'] as number, news: n['news'] as string, endOfList: n['endOfList'] as boolean };
}

/** The server's reply checked field by field (`UniverseReply`); anything else throws. */
export function universeReplyOf(raw: unknown): UniverseReply {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r['universes']) || !Array.isArray(r['news'])) throw new Error('universe reply: not the shape');
  return { universes: (r['universes'] as unknown[]).map(entryOf), news: (r['news'] as unknown[]).map(newsOf) };
}

/** The universe service over the match server's `POST <base>/texts/universe`. */
export function fetchUniverseService(base: string, fetchFn: typeof fetch = (...a) => fetch(...a)): UniverseService {
  return {
    query: async (q: UniverseQuery) => {
      const res = await fetchFn(`${base}/texts/universe`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q),
        credentials: 'omit', cache: 'no-store',   // TEXTS-OMIT: no cookie and no cache, as the account routes' clients
      });
      if (!res.ok) throw new Error(`universe query: HTTP ${res.status}`);
      return universeReplyOf(await res.json());
    },
  };
}
