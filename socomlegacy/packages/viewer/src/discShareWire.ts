/**
 * **Disc share's pairing wire** (`docs/plans/2026-10-18-disc-share.md`, DSH-3; DSH.R9, DSH.R10, DSH.R13): the routes,
 * the shapes and the code's grammar shared by central's routes (`packages/central/src/discShareHttp.ts`) and the page's
 * client (`./discShareSignal`). **A browser adaptation, product track** (OT.R53): a service whose wire is not the
 * original's (the original had no disc share); it changes nothing the game does.
 *
 * Signalling only: the messages carried are WebRTC's offer, answer and candidates and the pair's own `bye` and
 * `claimed`, small JSON; no disc data ever passes through these routes (DSH.R11, DSH.R15). Same origin only (DSH.R10):
 * the routes answer no CORS.
 *
 * | method and path | body | answer |
 * |---|---|---|
 * | `POST /api/discshare/request` | `{}` | `{ id, code, secret, expiresAt }` -- the receiver's request |
 * | `GET /api/discshare/nearby` | | `{ requests: [{ id, code, createdAt }] }` -- open requests from the caller's IPv4 address or IPv6 /64 |
 * | `POST /api/discshare/claim` | `{ code }` | `{ id, secret }` -- the sender's side; single use |
 * | `POST /api/discshare/signal` | `{ id, secret, msg }` | 204 -- `msg` queued for the other side |
 * | `GET /api/discshare/signal?id=&after=` | header `x-discshare-secret` | `{ messages: [{ seq, msg }] }` -- a long-poll, empty at its bound |
 * | `GET /api/discshare/ice?id=` | header `x-discshare-secret` | `{ iceServers }` -- DSH.R15: this side's ICE servers, a claimed pair only |
 *
 * The long-poll's secret travels in a header, not the query: a query string is written to a proxy's access log.
 */

/** Every route's common prefix (one row of the deploy's route list, `deploy/pages/routes.json`). */
export const DISCSHARE_PREFIX = '/api/discshare/';
export const DISCSHARE_REQUEST_ROUTE = '/api/discshare/request';
export const DISCSHARE_NEARBY_ROUTE = '/api/discshare/nearby';
export const DISCSHARE_CLAIM_ROUTE = '/api/discshare/claim';
export const DISCSHARE_SIGNAL_ROUTE = '/api/discshare/signal';
/** DSH.R15: the ICE servers for one side of a claimed pair (Cloudflare's STUN, and its TURN when central holds a key). */
export const DISCSHARE_ICE_ROUTE = '/api/discshare/ice';
export const DISCSHARE_ROUTE_LIST = [DISCSHARE_REQUEST_ROUTE, DISCSHARE_NEARBY_ROUTE, DISCSHARE_CLAIM_ROUTE, DISCSHARE_SIGNAL_ROUTE, DISCSHARE_ICE_ROUTE] as const;
/** The long-poll's secret (GET carries no body; a query string reaches access logs). */
export const DISCSHARE_SECRET_HEADER = 'x-discshare-secret';

/** The code's alphabet (DSH.R9: unambiguous -- no 0/O, 1/I/L), and its length. */
export const DISCSHARE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const DISCSHARE_CODE_LENGTH = 6;
/** A request's life unclaimed, and a pair's after its claim (DSH.R9: "expiring in 10 minutes"). */
export const DISCSHARE_LIFE_MS = 10 * 60 * 1000;
/** The longest a long-poll is held before its empty answer (DSH.R13: a bounded hold). */
export const DISCSHARE_POLL_HOLD_MS = 25_000;
/**
 * The bound of every body. The match server's door refuses a body declared past `HTTP_BODY_BYTES` (4096,
 * `packages/match/src/limits.ts`) before any handler reads it, so the routes' own bound is the same number: a larger one
 * would never be reached. A data-channel-only offer with its candidates trickled is well under it.
 */
export const DISCSHARE_BODY_BYTES = 4096;

/** The message types a page may post; `claimed` is the server's own, told to the receiver at the claim. */
export const DISCSHARE_PAGE_TYPES = ['offer', 'answer', 'candidate', 'bye'] as const;
export type DiscSharePageType = (typeof DISCSHARE_PAGE_TYPES)[number];
export type DiscShareMsgType = DiscSharePageType | 'claimed';
/** A relayed message: its type and the page's own JSON fields (an SDP, a candidate), opaque to the server. */
export interface DiscShareMsg { type: DiscShareMsgType; [field: string]: unknown }

export interface DiscShareRequestAnswer { id: string; code: string; secret: string; expiresAt: number }
export interface DiscShareNearbyRequest { id: string; code: string; createdAt: number }
export interface DiscShareNearbyAnswer { requests: DiscShareNearbyRequest[] }
export interface DiscShareClaimBody { code: string }
export interface DiscShareClaimAnswer { id: string; secret: string }
export interface DiscShareSignalBody { id: string; secret: string; msg: DiscShareMsg }
export interface DiscShareQueued { seq: number; msg: DiscShareMsg }
export interface DiscSharePollAnswer { messages: DiscShareQueued[] }

/** A typed code as the grammar reads it: upper case, spaces and dashes dropped; null if it is not one. */
export function normaliseDiscShareCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[\s-]+/g, '');
  if (c.length !== DISCSHARE_CODE_LENGTH) return null;
  for (const ch of c) if (!DISCSHARE_CODE_ALPHABET.includes(ch)) return null;
  return c;
}

/** Whether `v` is a message a page may post: a JSON object whose `type` is one of `DISCSHARE_PAGE_TYPES`. */
export function isPageMsg(v: unknown): v is DiscShareMsg & { type: DiscSharePageType } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    && (DISCSHARE_PAGE_TYPES as readonly unknown[]).includes((v as { type?: unknown }).type);
}

/*
 * DSH.R15 (the owner, 2026-11-07: "it should work with our forwarded cloudflare tunnel p2p"; "use cloudflare as needed
 * with my approval"): the ICE servers a connection is made with. Cloudflare's STUN always -- no credentials, and a
 * direct path across most NATs -- and, when central holds a Cloudflare Realtime TURN key, a short-lived TURN credential
 * minted per side (`packages/central/src/discShareHttp.ts`), the relay for a pair with no direct path. A browser
 * adaptation, product track. The forge agent's ICE grammar (`packages/forge-agent/src/rtc.ts` `parseIceServers`) refuses
 * a query and credentials, which Cloudflare's TURN URLs carry (`?transport=`), so it is not reused here.
 */

/** Cloudflare's STUN server (no credentials). */
export const DISCSHARE_STUN_URL = 'stun:stun.cloudflare.com:3478';
/** The servers with no TURN key, on any Cloudflare error, or when the page cannot reach the route: STUN only. */
export const DISCSHARE_STUN_ONLY: readonly DiscShareIceServer[] = Object.freeze([{ urls: DISCSHARE_STUN_URL }]);

/** One ICE server as `RTCIceServer` writes it. */
export interface DiscShareIceServer { urls: string | string[]; username?: string; credential?: string }
export interface DiscShareIceAnswer { iceServers: DiscShareIceServer[] }

/** A STUN or TURN URL: scheme, a host (a name, or an IPv6 literal in brackets), an optional port, an optional transport. */
const ICE_URL = /^(?:stuns?|turns?):(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::(\d{1,5}))?(?:\?transport=(?:udp|tcp))?$/;

/**
 * Whether a URL is one the page may use: a STUN or TURN URL of the grammar above, not on port 53 -- browsers block
 * port 53 and a URL on it only times out (Cloudflare's own advice: filter it out).
 */
export function usableIceUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const m = ICE_URL.exec(url);
  return m !== null && m[1] !== '53';
}

/**
 * ICE servers read from an answer (central's, or Cloudflare's): an array of `{ urls, username?, credential? }` -- or one
 * such object, as Cloudflare's older answer was -- each server's URLs kept only when usable (`usableIceUrl`), always as
 * an array; a server left with none, or with a username or credential that is not text, dropped. Null when `v` is not
 * a list of objects.
 */
export function readIceServers(v: unknown): DiscShareIceServer[] | null {
  const list = Array.isArray(v) ? v : typeof v === 'object' && v !== null ? [v] : null;
  if (list === null) return null;
  const out: DiscShareIceServer[] = [];
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const urls = (Array.isArray(r['urls']) ? r['urls'] : [r['urls']]).filter(usableIceUrl);
    if (urls.length === 0) continue;
    if (r['username'] !== undefined && typeof r['username'] !== 'string') continue;
    if (r['credential'] !== undefined && typeof r['credential'] !== 'string') continue;
    out.push({
      urls, ...(typeof r['username'] === 'string' ? { username: r['username'] } : {}), ...(typeof r['credential'] === 'string' ? { credential: r['credential'] } : {}),
    });
  }
  return out;
}
