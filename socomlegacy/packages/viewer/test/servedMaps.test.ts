import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_SERVER, ownOriginSocket } from '../src/online';

/** TRS-1: a deployed page's Shared service, its own origin's socket (was the retired SHARED_SERVER, the dead mp host). */
const SHARED = ownOriginSocket({ protocol: 'https:', host: 'nightly.socom2legacy.com' });
import { REQUEST_TIMEOUT_MS } from '../src/playersOnline';
import {
  fetchServedMaps, MAPS_PATH, SERVED_MAPS_TIMEOUT_MS_PLACEHOLDER, ServedMapsRead, servedMapsOf, servedMapsOrigin,
} from '../src/servedMaps';

/**
 * TR-2 (the test room's maps plan, TR.R3; research 307): the page learns the maps the online server plays before it
 * joins, from the server's `GET /maps` -- `{"maps":["MP2","MP51","MP7","MP72",...]}`, the stems in the server's order,
 * uppercase as `/rooms`' `map` (the shape the online lane agreed, landing in its MAPS-4). Built against that shape with a
 * fake server (a `fetch` stub): no server here answers `/maps` yet. Anything else -- a 404, an unreachable server, a
 * body that is not the shape, no answer in time -- is `null`, and the page marks nothing (today's behaviour). A test
 * instrument's adaptation: the original has no such request.
 */

const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('TR-2: the /maps address, from the online target\'s origin', () => {
  it('the local server\'s and the shared server\'s WebSocket give their HTTP origins (as /rooms is read beside them)', () => {
    expect(servedMapsOrigin(LOCAL_SERVER)).toBe(LOCAL_SERVER.replace(/^ws:/, 'http:').replace(/\/ws$/, ''));
    expect(servedMapsOrigin(SHARED)).toBe('https://nightly.socom2legacy.com');
    expect(servedMapsOrigin('ws://127.0.0.1:8811/ws')).toBe('http://127.0.0.1:8811');
    expect(servedMapsOrigin('wss://[::1]:9000/ws?x=1')).toBe('https://[::1]:9000');
    expect(MAPS_PATH).toBe('/maps');
  });

  it('none without a server, or for the page\'s own rooms (the offline room, a replay) and an address that is not one', () => {
    for (const url of [null, '', 'loopback:', 'replay:', 'not a url', 'ftp://x/ws']) expect(servedMapsOrigin(url), String(url)).toBeNull();
  });
});

describe('TR-2: the /maps answer read', () => {
  it('the agreed shape: the stems, in the server\'s order', () => {
    expect(servedMapsOf({ maps: ['MP2', 'MP51', 'MP7', 'MP72'] })).toEqual(['MP2', 'MP51', 'MP7', 'MP72']);
  });

  it('a lowercase stem is read uppercase (the server compares a hello\'s map uppercased, server.ts allowed(); /rooms\' map is read so)', () => {
    expect(servedMapsOf({ maps: ['mp2', 'Mp10'] })).toEqual(['MP2', 'MP10']);
  });

  it('anything else is no answer: not an object, no list, an entry that is not a stem string, an empty list', () => {
    for (const body of [null, 1, 'MP2', ['MP2'], {}, { maps: 'MP2' }, { maps: [2] }, { maps: ['MP2', null] }, { maps: [''] }, { maps: [] }]) {
      expect(servedMapsOf(body), JSON.stringify(body)).toBeNull();
    }
  });
});

describe('TR-2: fetchServedMaps against a fake server', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('asks <origin>/maps and returns the stems', async () => {
    const fetchFn = vi.fn(async () => ok({ maps: ['MP2', 'MP51', 'MP72'] }));
    expect(await fetchServedMaps('http://localhost:8787', fetchFn as unknown as typeof fetch)).toEqual(['MP2', 'MP51', 'MP72']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls[0] as unknown[])[0]).toBe('http://localhost:8787/maps');
  });

  it('a 404 (an older server, before MAPS-4) is null', async () => {
    const fetchFn = vi.fn(async () => new Response('not found', { status: 404 }));
    expect(await fetchServedMaps('http://localhost:8787', fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it('a wrong shape is null', async () => {
    const fetchFn = vi.fn(async () => ok([{ map: 'MP2', players: 1 }]));     // /rooms' list, not /maps' object
    expect(await fetchServedMaps('http://localhost:8787', fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it('malformed JSON (a page\'s index.html at a server without the route) is null', async () => {
    const fetchFn = vi.fn(async () => new Response('<!doctype html><title>x</title>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect(await fetchServedMaps('http://localhost:8787', fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it('a network error is null', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    expect(await fetchServedMaps('http://localhost:8787', fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it('no answer within SERVED_MAPS_TIMEOUT_MS_PLACEHOLDER is null, and the request is aborted', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Promise<Response>(() => undefined); });
    const read = fetchServedMaps('http://localhost:8787', fetchFn as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(SERVED_MAPS_TIMEOUT_MS_PLACEHOLDER - 1);
    let done = false;
    void read.then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await read).toBeNull();
    expect(signal?.aborted).toBe(true);
  });

  it('the bound is the /rooms read\'s own (REQUEST_TIMEOUT_MS): a chosen instrument limit, no original', () => {
    expect(SERVED_MAPS_TIMEOUT_MS_PLACEHOLDER).toBe(REQUEST_TIMEOUT_MS);
  });

  it('no origin asks nothing', async () => {
    const fetchFn = vi.fn();
    expect(await fetchServedMaps(null, fetchFn as unknown as typeof fetch)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('TR-2: ServedMapsRead, the page\'s one read per online target', () => {
  it('tells null at once for a new target, then its answer', async () => {
    const told: (readonly string[] | null)[] = [];
    const fetchFn = vi.fn(async () => ok({ maps: ['MP2', 'MP51'] }));
    const read = new ServedMapsRead((m) => told.push(m), fetchFn as unknown as typeof fetch);
    await read.read(LOCAL_SERVER);
    expect(told).toEqual([null, ['MP2', 'MP51']]);
    expect((fetchFn.mock.calls[0] as unknown[])[0]).toMatch(/^http:\/\/localhost:\d+\/maps$/);
  });

  it('no server (Online off) asks nothing and tells null', async () => {
    const told: (readonly string[] | null)[] = [];
    const fetchFn = vi.fn();
    await new ServedMapsRead((m) => told.push(m), fetchFn as unknown as typeof fetch).read(null);
    expect(told).toEqual([null]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('an earlier target\'s answer that lands after a newer read is dropped', async () => {
    const told: (readonly string[] | null)[] = [];
    let first!: (r: Response) => void;
    const fetchFn = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((res) => { first = res; }))
      .mockImplementationOnce(async () => ok({ maps: ['MP7'] }));
    const read = new ServedMapsRead((m) => told.push(m), fetchFn as unknown as typeof fetch);
    const a = read.read(LOCAL_SERVER);
    const b = read.read(SHARED);
    await b;
    first(ok({ maps: ['MP2'] }));
    await a;
    expect(told).toEqual([null, null, ['MP7']]);
  });
});
