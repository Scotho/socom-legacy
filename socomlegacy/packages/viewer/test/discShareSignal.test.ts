import { describe, expect, it, vi } from 'vitest';
import {
  DISCSHARE_CALL_TIMEOUT_MS_ADAPTATION, DISCSHARE_POLL_TIMEOUT_MS_ADAPTATION, DiscShareError, discShareSignal,
} from '../src/discShareSignal';
import {
  DISCSHARE_CLAIM_ROUTE, DISCSHARE_NEARBY_ROUTE, DISCSHARE_POLL_HOLD_MS, DISCSHARE_REQUEST_ROUTE, DISCSHARE_SECRET_HEADER, DISCSHARE_SIGNAL_ROUTE,
  isPageMsg, normaliseDiscShareCode,
} from '../src/discShareWire';

/**
 * DSH-3: the page's client of disc share's pairing routes (a browser adaptation, product track). `fetch` is stubbed:
 * each test reads the requests' shapes -- method, path, body, headers -- and the answers' reading.
 */

const BASE = 'https://play.redotcom.test';

interface Seen { url: string; init: RequestInit }
function stub(answers: { status: number; body?: unknown }[]) {
  const seen: Seen[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), init: init ?? {} });
    const a = answers.shift() ?? { status: 500 };
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status, headers: a.body === undefined ? {} : { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { seen, fetchFn };
}
const headerOf = (init: RequestInit, name: string): string | null => new Headers(init.headers).get(name);

describe('DSH-3: the page\'s pairing client', () => {
  it('request: POST {} as JSON to the route at the base, no credentials, no cache', async () => {
    const s = stub([{ status: 200, body: { id: 'i1', code: 'QX7K4M', secret: 's1', expiresAt: 5 } }]);
    const r = await discShareSignal(BASE, s.fetchFn).request();
    expect(r).toEqual({ id: 'i1', code: 'QX7K4M', secret: 's1', expiresAt: 5 });
    expect(s.seen[0]!.url).toBe(`${BASE}${DISCSHARE_REQUEST_ROUTE}`);
    expect(s.seen[0]!.init.method).toBe('POST');
    expect(s.seen[0]!.init.body).toBe('{}');
    expect(headerOf(s.seen[0]!.init, 'content-type')).toBe('application/json');
    expect(s.seen[0]!.init.credentials).toBe('omit');
    expect(s.seen[0]!.init.cache).toBe('no-store');
  });

  it('nearby: a GET; the list read, a malformed row dropped', async () => {
    const s = stub([{ status: 200, body: { requests: [{ id: 'a', code: 'QX7K4M', createdAt: 1 }, { id: 3, code: 'x' }] } }]);
    expect(await discShareSignal(BASE, s.fetchFn).nearby()).toEqual([{ id: 'a', code: 'QX7K4M', createdAt: 1 }]);
    expect(s.seen[0]!.url).toBe(`${BASE}${DISCSHARE_NEARBY_ROUTE}`);
    expect(s.seen[0]!.init.method).toBe('GET');
  });

  it('claim: the typed code normalised before it is sent; a code the grammar refuses never leaves the page', async () => {
    const s = stub([{ status: 200, body: { id: 'a', secret: 's2' } }]);
    const c = discShareSignal(BASE, s.fetchFn);
    expect(await c.claim(' qx7-k4m ')).toEqual({ id: 'a', secret: 's2' });
    expect(s.seen[0]!.url).toBe(`${BASE}${DISCSHARE_CLAIM_ROUTE}`);
    expect(JSON.parse(String(s.seen[0]!.init.body))).toEqual({ code: 'QX7K4M' });
    await expect(c.claim('O0I1L!')).rejects.toMatchObject({ status: 400 });
    expect(s.seen.length).toBe(1);
  });

  it('send: POST { id, secret, msg }; poll: GET with id and after, the secret in its header, never the URL', async () => {
    const s = stub([{ status: 204 }, { status: 200, body: { messages: [{ seq: 2, msg: { type: 'answer', sdp: 'v=0' } }] } }]);
    const c = discShareSignal(BASE, s.fetchFn);
    await c.send('i 1', 'sec', { type: 'offer', sdp: 'v=0' });
    expect(s.seen[0]!.url).toBe(`${BASE}${DISCSHARE_SIGNAL_ROUTE}`);
    expect(JSON.parse(String(s.seen[0]!.init.body))).toEqual({ id: 'i 1', secret: 'sec', msg: { type: 'offer', sdp: 'v=0' } });
    const abort = new AbortController();
    expect(await c.poll('i 1', 'sec', 1, abort.signal)).toEqual([{ seq: 2, msg: { type: 'answer', sdp: 'v=0' } }]);
    expect(s.seen[1]!.url).toBe(`${BASE}${DISCSHARE_SIGNAL_ROUTE}?id=i+1&after=1`);
    expect(s.seen[1]!.url).not.toContain('sec');
    expect(s.seen[1]!.init.method).toBe('GET');
    expect(headerOf(s.seen[1]!.init, DISCSHARE_SECRET_HEADER)).toBe('sec');
    // DSH-4: the caller's signal is combined with the call's timeout (the next describe's tests abort through it).
    expect(s.seen[1]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('a refusal is a DiscShareError with its status and reason; no answer is status 0', async () => {
    const s = stub([{ status: 429, body: { error: 'too many tries' } }, { status: 404 }]);
    const c = discShareSignal(BASE, s.fetchFn);
    await expect(c.claim('QX7K4M')).rejects.toEqual(new DiscShareError(429, 'too many tries', true));
    await expect(c.poll('i', 's', 0)).rejects.toMatchObject({ status: 404 });
    const down = discShareSignal(BASE, (async () => { throw new TypeError('offline'); }) as typeof fetch);
    await expect(down.request()).rejects.toMatchObject({ status: 0 });
  });

  it('the wire\'s grammar: the code and the page\'s message types', () => {
    expect(normaliseDiscShareCode('qx7k4m')).toBe('QX7K4M');
    expect(normaliseDiscShareCode('QX7K4')).toBeNull();
    expect(normaliseDiscShareCode('QX7K40')).toBeNull();          // 0 is not in the alphabet
    expect(isPageMsg({ type: 'candidate', candidate: 'c' })).toBe(true);
    expect(isPageMsg({ type: 'claimed' })).toBe(false);
    expect(isPageMsg(['offer'])).toBe(false);
  });
});

/**
 * The merge controller's landing condition for DSH-4 (2026-10-29): while `/api/discshare/` is unreachable -- the static
 * page host answering 404/405, or 200 with its `index.html` -- or never answers, every call ends, in a bounded time, as a
 * `DiscShareError` the adapter can say. `routed` tells the route's own JSON refusal from a host's page.
 */
describe('DSH-4: the pairing client never hangs and tells a route\'s refusal from a host\'s page', () => {
  it('a call with no answer times out at DISCSHARE_CALL_TIMEOUT_MS_ADAPTATION as DiscShareError(0, "no answer"); its timer is gone', async () => {
    vi.useFakeTimers();
    try {
      const never = ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_ok, no) => {
        init?.signal?.addEventListener('abort', () => { no(new DOMException('aborted', 'AbortError')); });
      })) as typeof fetch;
      const c = discShareSignal(BASE, never);
      for (const call of [() => c.request(), () => c.nearby(), () => c.claim('QX7K4M'), () => c.send('i', 's', { type: 'bye' })]) {
        const p = call();
        const seen = expect(p).rejects.toEqual(new DiscShareError(0, 'no answer'));
        await vi.advanceTimersByTimeAsync(DISCSHARE_CALL_TIMEOUT_MS_ADAPTATION - 1);
        await vi.advanceTimersByTimeAsync(1);
        await seen;
        expect(vi.getTimerCount()).toBe(0);
      }
    } finally { vi.useRealTimers(); }
  });

  it('a poll is held the server\'s hold plus slack before it times out', async () => {
    vi.useFakeTimers();
    try {
      expect(DISCSHARE_POLL_TIMEOUT_MS_ADAPTATION).toBe(DISCSHARE_POLL_HOLD_MS + 10_000);
      let aborted = false;
      const never = ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_ok, no) => {
        init?.signal?.addEventListener('abort', () => { aborted = true; no(new DOMException('aborted', 'AbortError')); });
      })) as typeof fetch;
      const p = discShareSignal(BASE, never).poll('i', 's', 0);
      const seen = expect(p).rejects.toMatchObject({ status: 0, reason: 'no answer' });
      await vi.advanceTimersByTimeAsync(DISCSHARE_CALL_TIMEOUT_MS_ADAPTATION + 1);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(DISCSHARE_POLL_TIMEOUT_MS_ADAPTATION);
      await seen;
      expect(aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('the caller\'s own signal still aborts a call (combined with the timeout), and the timer goes with it', async () => {
    vi.useFakeTimers();
    try {
      const never = ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_ok, no) => {
        init?.signal?.addEventListener('abort', () => { no(new DOMException('aborted', 'AbortError')); });
      })) as typeof fetch;
      const ac = new AbortController();
      const p = discShareSignal(BASE, never).nearby(ac.signal);
      const seen = expect(p).rejects.toMatchObject({ status: 0 });
      ac.abort();
      await seen;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('a host\'s page is not the route: an HTML 200 is malformed, a 404/405 page is unrouted; the route\'s JSON refusal is routed', async () => {
    const html = (status: number): typeof fetch => (async () => new Response('<!doctype html><html></html>', { status, headers: { 'content-type': 'text/html' } })) as typeof fetch;
    await expect(discShareSignal(BASE, html(200)).request()).rejects.toMatchObject({ status: 200, reason: 'malformed answer', routed: false });
    await expect(discShareSignal(BASE, html(200)).poll('i', 's', 0)).rejects.toMatchObject({ status: 200, routed: false });
    await expect(discShareSignal(BASE, html(404)).claim('QX7K4M')).rejects.toMatchObject({ status: 404, routed: false });
    await expect(discShareSignal(BASE, html(405)).nearby()).rejects.toMatchObject({ status: 405, routed: false });
    const s = stub([{ status: 404, body: { error: 'no such request' } }]);
    await expect(discShareSignal(BASE, s.fetchFn).claim('QX7K4M')).rejects.toMatchObject({ status: 404, reason: 'no such request', routed: true });
  });
});
