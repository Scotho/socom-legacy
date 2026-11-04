import {
  DISCSHARE_CLAIM_ROUTE, DISCSHARE_NEARBY_ROUTE, DISCSHARE_POLL_HOLD_MS, DISCSHARE_REQUEST_ROUTE, DISCSHARE_SECRET_HEADER, DISCSHARE_SIGNAL_ROUTE,
  normaliseDiscShareCode, type DiscShareClaimAnswer, type DiscShareMsg, type DiscShareNearbyRequest, type DiscShareQueued,
  type DiscShareRequestAnswer, type DiscSharePageType,
} from './discShareWire';

/**
 * **The page's client of disc share's pairing** (`docs/plans/2026-10-18-disc-share.md`, DSH-3; the routes are central's,
 * `packages/central/src/discShareHttp.ts`, over the one wire `./discShareWire`). **A browser adaptation, product track**
 * (OT.R53): signalling only -- it sends and reads small JSON messages (the WebRTC offer, answer and candidates, and
 * `bye`), never disc data; the transfer itself is DSH-4's.
 *
 * `base` is the account requests' base (`./connectHost` `accountServiceBase`): the page's own origin in a release, so
 * the routes are reached same-origin (DSH.R10) and answer no CORS. Every request omits credentials (the routes need
 * none: the pair's secrets are its authority) and is never cached. A refusal is a `DiscShareError` with the status and
 * the route's reason; a request with no answer (offline, aborted, or past its timeout) is status 0.
 *
 * **It never hangs** (the merge controller's landing condition for DSH-4, 2026-10-29): until the front Worker routes
 * `/api/discshare/*` to central, a release may send them to the static page host, which answers 404/405 or 200 with its
 * `index.html`, or not at all. Every call carries a timeout (`DISCSHARE_CALL_TIMEOUT_MS_ADAPTATION`; a poll the server's
 * hold plus slack, `DISCSHARE_POLL_TIMEOUT_MS_ADAPTATION`) on an `AbortSignal` combined with the caller's, and its timer
 * is cleared when the call ends either way. A refusal says whether it is the route's own (`routed`: its JSON `{ error }`)
 * or a host's page; an answer that is not the route's JSON (an HTML 200) is `malformed answer`, unrouted.
 */

/** How long a request, nearby, claim or send waits for its whole answer. An adaptation, ours: chosen, not measured. */
export const DISCSHARE_CALL_TIMEOUT_MS_ADAPTATION = 10_000;
/** How long a long-poll waits: the server's bounded hold (`DISCSHARE_POLL_HOLD_MS`) and 10 s of slack. An adaptation. */
export const DISCSHARE_POLL_TIMEOUT_MS_ADAPTATION = DISCSHARE_POLL_HOLD_MS + 10_000;

export class DiscShareError extends Error {
  /** `routed`: the refusal is the route's own JSON (`{ error }`), not a host's page or a network failure. */
  constructor(readonly status: number, readonly reason: string, readonly routed: boolean = false) {
    super(`disc share: ${status} ${reason}`);
    this.name = 'DiscShareError';
  }
}

export interface DiscShareSignalOptions {
  /** `DISCSHARE_CALL_TIMEOUT_MS_ADAPTATION` by default. */
  timeoutMs?: number;
  /** `DISCSHARE_POLL_TIMEOUT_MS_ADAPTATION` by default. */
  pollTimeoutMs?: number;
}

export interface DiscShareSignal {
  /** The receiver's request: its id, the code it shows, its secret, its expiry (epoch ms). */
  request(signal?: AbortSignal): Promise<DiscShareRequestAnswer>;
  /** The open requests from this device's network (DSH.R9); polled only while the sender's screen is open. */
  nearby(signal?: AbortSignal): Promise<DiscShareNearbyRequest[]>;
  /** The sender's claim of a typed or listed code; a code the grammar refuses is a 400 without a request. */
  claim(code: string, signal?: AbortSignal): Promise<DiscShareClaimAnswer>;
  /** A message queued for the other side. */
  send(id: string, secret: string, msg: DiscShareMsg & { type: DiscSharePageType }, signal?: AbortSignal): Promise<void>;
  /** The long-poll: this side's messages after `after` (empty when the hold ends with none). */
  poll(id: string, secret: string, after: number, signal?: AbortSignal): Promise<DiscShareQueued[]>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The client over `fetchFn` at `base`. */
export function discShareSignal(base: string, fetchFn: typeof fetch = (...a) => fetch(...a), opts: DiscShareSignalOptions = {}): DiscShareSignal {
  const callMs = opts.timeoutMs ?? DISCSHARE_CALL_TIMEOUT_MS_ADAPTATION;
  const pollMs = opts.pollTimeoutMs ?? DISCSHARE_POLL_TIMEOUT_MS_ADAPTATION;
  /** One call, its whole answer (the body read too) within `ms`, the caller's `signal` combined; the timer always cleared. */
  const call = async (path: string, init: RequestInit, ms: number = callMs, signal?: AbortSignal): Promise<unknown> => {
    const ac = new AbortController();
    const timer = setTimeout(() => { ac.abort(); }, ms);
    const onCaller = (): void => { ac.abort(); };
    if (signal?.aborted) ac.abort(); else signal?.addEventListener('abort', onCaller, { once: true });
    const gone = new Promise<never>((_ok, no) => {
      if (ac.signal.aborted) no(new DiscShareError(0, 'no answer'));
      ac.signal.addEventListener('abort', () => { no(new DiscShareError(0, 'no answer')); }, { once: true });
    });
    gone.catch(() => undefined);
    try {
      let res: Response;
      try {
        res = await Promise.race([fetchFn(`${base}${path}`, { credentials: 'omit', cache: 'no-store', ...init, signal: ac.signal }), gone]);
      } catch {
        throw new DiscShareError(0, 'no answer');
      }
      let text: string;
      try { text = await Promise.race([res.text(), gone]); } catch (e) { if (e instanceof DiscShareError) throw e; text = ''; }
      let body: unknown = null;
      try { body = text === '' ? null : JSON.parse(text); } catch { body = null; }
      if (!res.ok) {
        const routed = isObj(body) && typeof body['error'] === 'string';
        throw new DiscShareError(res.status, routed ? (body as Record<string, unknown>)['error'] as string : res.statusText || 'refused', routed);
      }
      return body;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCaller);
    }
  };
  const post = (path: string, body: unknown, signal?: AbortSignal): Promise<unknown> =>
    call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, callMs, signal);
  const malformed = (): DiscShareError => new DiscShareError(200, 'malformed answer');

  return {
    async request(signal) {
      const b = await post(DISCSHARE_REQUEST_ROUTE, {}, signal);
      if (!isObj(b) || typeof b['id'] !== 'string' || typeof b['code'] !== 'string' || typeof b['secret'] !== 'string' || typeof b['expiresAt'] !== 'number') throw malformed();
      return { id: b['id'], code: b['code'], secret: b['secret'], expiresAt: b['expiresAt'] };
    },
    async nearby(signal) {
      const b = await call(DISCSHARE_NEARBY_ROUTE, { method: 'GET' }, callMs, signal);
      if (!isObj(b) || !Array.isArray(b['requests'])) throw malformed();
      return b['requests'].flatMap((r: unknown) => (isObj(r) && typeof r['id'] === 'string' && typeof r['code'] === 'string' && typeof r['createdAt'] === 'number'
        ? [{ id: r['id'], code: r['code'], createdAt: r['createdAt'] }] : []));
    },
    async claim(typed, signal) {
      const code = normaliseDiscShareCode(typed);
      if (code === null) throw new DiscShareError(400, 'not a code');
      const b = await post(DISCSHARE_CLAIM_ROUTE, { code }, signal);
      if (!isObj(b) || typeof b['id'] !== 'string' || typeof b['secret'] !== 'string') throw malformed();
      return { id: b['id'], secret: b['secret'] };
    },
    async send(id, secret, msg, signal) {
      await post(DISCSHARE_SIGNAL_ROUTE, { id, secret, msg }, signal);
    },
    async poll(id, secret, after, signal) {
      // the request's own query, built by hand: not a read of the page's address (PTT-9's scan reads URLSearchParams as one)
      const form = (v: string): string => encodeURIComponent(v).replace(/%20/g, '+');   // a space as URLSearchParams writes it; id is base64url and after a number
      const q = `id=${form(id)}&after=${form(String(after))}`;
      const b = await call(`${DISCSHARE_SIGNAL_ROUTE}?${q}`, { method: 'GET', headers: { [DISCSHARE_SECRET_HEADER]: secret } }, pollMs, signal);
      if (!isObj(b) || !Array.isArray(b['messages'])) throw malformed();
      return b['messages'].flatMap((m: unknown) => (isObj(m) && typeof m['seq'] === 'number' && isObj(m['msg']) && typeof m['msg']['type'] === 'string'
        ? [{ seq: m['seq'], msg: m['msg'] as DiscShareMsg }] : []));
    },
  };
}
