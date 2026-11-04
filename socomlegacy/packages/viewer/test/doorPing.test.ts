import { describe, expect, it } from 'vitest';
import { DOOR_PING_TIMEOUT_MS_ADAPTATION, timeDoorPing } from '../src/doorPing';

/**
 * LATER 455 (OT.R84; product track, a browser adaptation): the briefing room's PING -- one round trip from the page to a
 * host's door, `GET <door>/ping` (the door's 204, `packages/host/src/door.ts` `DOOR_PING_PATH`). Timed by Resource
 * Timing's `responseStart - requestStart` when a matching entry exists with its phases (the door's
 * `Timing-Allow-Origin: *`), else by the clock around the fetch; anything but a 204, a failure or no answer within
 * `DOOR_PING_TIMEOUT_MS_ADAPTATION` is unknown (null, drawn `--`). The fetch, the clock and the entries are fakes here;
 * the door names are invented. The first block has no `PerformanceObserver` (`observer: null`: the buffer, then the
 * clock); the second, a fake one, the entry's source on a page whose buffer is full.
 */

type Call = { url: string; init: RequestInit };
const DOOR = 'https://door-a.example';
const answering = (status: number, calls: Call[], during?: () => void) =>
  (async (url: string, init: RequestInit) => { calls.push({ url, init }); during?.(); return new Response(null, { status }); }) as unknown as typeof fetch;
const entry = (o: { startTime: number; requestStart: number; responseStart: number }): PerformanceEntry => ({ name: `${DOOR}/ping`, entryType: 'resource', duration: 0, ...o } as unknown as PerformanceEntry);

describe('LATER 455: timeDoorPing', () => {
  it('one plain GET to <door>/ping: cors, no-store, no credentials, no header (a simple request: no preflight)', async () => {
    const calls: Call[] = [];
    let now = 10;
    expect(await timeDoorPing(DOOR, { fetch: answering(204, calls, () => { now = 52.4; }), now: () => now, resources: () => [], observer: null })).toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://door-a.example/ping');
    const init = calls[0]!.init;
    expect([init.method, init.mode, init.cache, init.credentials, init.headers, init.body]).toEqual(['GET', 'cors', 'no-store', 'omit', undefined, undefined]);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('a matching Resource Timing entry with its phases: responseStart - requestStart, rounded', async () => {
    let now = 100;
    const resources = (url: string) => (url === `${DOOR}/ping` ? [entry({ startTime: 100.5, requestStart: 140.2, responseStart: 163.9 })] : []);
    expect(await timeDoorPing(DOOR, { fetch: answering(204, [], () => { now = 190; }), now: () => now, resources, observer: null })).toBe(24);
  });

  it('the latest entry of this probe, not an older probe\'s of the same door', async () => {
    let now = 500;
    const resources = () => [entry({ startTime: 100, requestStart: 110, responseStart: 210 }), entry({ startTime: 501, requestStart: 520, responseStart: 551 })];
    expect(await timeDoorPing(DOOR, { fetch: answering(204, [], () => { now = 600; }), now: () => now, resources, observer: null })).toBe(31);
  });

  it('an entry zeroed (no Timing-Allow-Origin), an older one only, or none: the fetch\'s own elapsed time', async () => {
    for (const listed of [
      [entry({ startTime: 101, requestStart: 0, responseStart: 0 })],
      [entry({ startTime: 50, requestStart: 60, responseStart: 70 })],
      [],
    ]) {
      let now = 100;
      expect(await timeDoorPing(DOOR, { fetch: answering(204, [], () => { now = 137.6; }), now: () => now, resources: () => listed, observer: null })).toBe(38);
    }
  });

  it('anything but a 204 -- a 200, a 429 past the door\'s bucket, a 404 from a door without the route -- is unknown', async () => {
    for (const status of [200, 404, 429, 503]) {
      expect(await timeDoorPing(DOOR, { fetch: answering(status, []), now: () => 0, resources: () => [], observer: null }), String(status)).toBeNull();
    }
  });

  it('a network failure (CORS refused, DNS, offline) is unknown', async () => {
    const failing = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await timeDoorPing(DOOR, { fetch: failing, now: () => 0, resources: () => [], observer: null })).toBeNull();
  });

  it('no answer within the timeout: unknown, and the request aborted', async () => {
    const seen: { signal?: AbortSignal | null } = {};
    const silent = ((_url: string, init: RequestInit) => { seen.signal = init.signal; return new Promise<Response>(() => undefined); }) as unknown as typeof fetch;
    expect(await timeDoorPing(DOOR, { fetch: silent, now: () => 0, resources: () => [], observer: null, timeoutMs: 5 })).toBeNull();
    expect(seen.signal?.aborted).toBe(true);
    expect(DOOR_PING_TIMEOUT_MS_ADAPTATION).toBe(3_000);
  });

  it('an invalid duration (a clock that ran backwards, or not finite) is unknown', async () => {
    for (const after of [-5, NaN, Infinity]) {
      let now = 0;
      expect(await timeDoorPing(DOOR, { fetch: answering(204, [], () => { now = after; }), now: () => now, resources: () => [], observer: null }), String(after)).toBeNull();
    }
  });
});

/**
 * The rendered run of 2026-10-25 (`agent-mail` evidence l455/rendered-run.md, finding 1): on the game page Chromium's
 * resource-timing buffer (250 entries by default) is already full, so `getEntriesByName` never holds the probe's entry
 * and every sample fell back to the clock, which carries the page's main-thread stalls. A `PerformanceObserver` for
 * `resource` entries is fed whatever the buffer's state; registered before the fetch, it is the entry's source. The
 * observer here is a fake: it records `observe`/`disconnect` and delivers what a test hands it.
 */
type FakeObserver = { observed: PerformanceObserverInit[]; disconnected: number; deliver: (entries: PerformanceEntry[]) => void };
function fakeObserverClass() {
  const made: FakeObserver[] = [];
  class Fake {
    observed: PerformanceObserverInit[] = [];
    disconnected = 0;
    constructor(private readonly cb: PerformanceObserverCallback) { made.push(this); }
    observe(o: PerformanceObserverInit) { this.observed.push(o); }
    disconnect() { this.disconnected++; }
    takeRecords() { return []; }
    deliver(entries: PerformanceEntry[]) { this.cb({ getEntries: () => entries } as unknown as PerformanceObserverEntryList, this as unknown as PerformanceObserver); }
  }
  return { made, ctor: Fake as unknown as typeof PerformanceObserver };
}
const named = (name: string, o: { startTime: number; requestStart: number; responseStart: number }): PerformanceEntry => ({ name, entryType: 'resource', duration: 0, ...o } as unknown as PerformanceEntry);

describe('LATER 455: timeDoorPing reads its entry from a PerformanceObserver (the full buffer of the rendered run)', () => {
  it('the observer is registered for resource entries, unbuffered, before the fetch', async () => {
    const { made, ctor } = fakeObserverClass();
    let atFetch: PerformanceObserverInit[] | undefined;
    const fetchFn = (async () => { atFetch = [...(made[0]?.observed ?? [])]; return new Response(null, { status: 204 }); }) as unknown as typeof fetch;
    await timeDoorPing(DOOR, { fetch: fetchFn, now: () => 0, resources: () => [], observer: ctor, entryWaitMs: 1 });
    expect(made).toHaveLength(1);
    expect(atFetch).toEqual([{ type: 'resource', buffered: false }]);
  });

  it('the buffer full (getEntriesByName empty), the observer delivers the probe\'s entry: responseStart - requestStart, not the clock', async () => {
    const { made, ctor } = fakeObserverClass();
    let now = 100;
    const fetchFn = answering(204, [], () => {
      now = 148;                                                                   // a 48 ms main-thread stall on the clock
      made[0]!.deliver([
        named('https://other.example/x', { startTime: 101, requestStart: 102, responseStart: 190 }),   // another URL
        named(`${DOOR}/ping`, { startTime: 50, requestStart: 60, responseStart: 99 }),                  // an older probe
        named(`${DOOR}/ping`, { startTime: 100.2, requestStart: 120.1, responseStart: 120.5 }),
      ]);
    });
    expect(await timeDoorPing(DOOR, { fetch: fetchFn, now: () => now, resources: () => [], observer: ctor })).toBe(0);
    const { made: made2, ctor: ctor2 } = fakeObserverClass();
    let now2 = 100;
    const fetch2 = answering(204, [], () => { now2 = 148; made2[0]!.deliver([named(`${DOOR}/ping`, { startTime: 100.2, requestStart: 120.1, responseStart: 126.9 })]); });
    expect(await timeDoorPing(DOOR, { fetch: fetch2, now: () => now2, resources: () => [], observer: ctor2 })).toBe(7);
  });

  it('an entry delivered after the response (the observer\'s own task) is still the sample', async () => {
    const { made, ctor } = fakeObserverClass();
    let now = 0;
    const fetchFn = answering(204, [], () => {
      now = 30;
      setTimeout(() => made[0]!.deliver([named(`${DOOR}/ping`, { startTime: 1, requestStart: 5, responseStart: 9 })]), 5);
    });
    expect(await timeDoorPing(DOOR, { fetch: fetchFn, now: () => now, resources: () => [], observer: ctor, entryWaitMs: 1_000 })).toBe(4);
  });

  it('the observer delivers nothing (or a zeroed entry, no Timing-Allow-Origin): the clock around the fetch', async () => {
    for (const delivered of [[], [named(`${DOOR}/ping`, { startTime: 1, requestStart: 0, responseStart: 0 })]]) {
      const { made, ctor } = fakeObserverClass();
      let now = 0;
      const fetchFn = answering(204, [], () => { now = 37.6; made[0]!.deliver(delivered); });
      expect(await timeDoorPing(DOOR, { fetch: fetchFn, now: () => now, resources: () => [], observer: ctor, entryWaitMs: 5 })).toBe(38);
    }
  });

  it('the observer is disconnected once the sample is taken, on a non-204, on a failure and on the timeout', async () => {
    const sample = fakeObserverClass();
    await timeDoorPing(DOOR, { fetch: answering(204, [], () => sample.made[0]!.deliver([named(`${DOOR}/ping`, { startTime: 0, requestStart: 1, responseStart: 2 })])), now: () => 0, resources: () => [], observer: sample.ctor });
    const fallback = fakeObserverClass();
    await timeDoorPing(DOOR, { fetch: answering(204, []), now: () => 0, resources: () => [], observer: fallback.ctor, entryWaitMs: 1 });
    const refused = fakeObserverClass();
    await timeDoorPing(DOOR, { fetch: answering(429, []), now: () => 0, resources: () => [], observer: refused.ctor });
    const failed = fakeObserverClass();
    await timeDoorPing(DOOR, { fetch: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch, now: () => 0, resources: () => [], observer: failed.ctor });
    const silent = fakeObserverClass();
    await timeDoorPing(DOOR, { fetch: (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch, now: () => 0, resources: () => [], observer: silent.ctor, timeoutMs: 5 });
    for (const [what, f] of Object.entries({ sample, fallback, refused, failed, silent })) {
      expect(f.made, what).toHaveLength(1);
      expect(f.made[0]!.disconnected, what).toBeGreaterThanOrEqual(1);
    }
  });

  it('an observer that cannot observe resource entries (observe throws): the buffer, then the clock, as without one', async () => {
    class Refusing { constructor(_cb: PerformanceObserverCallback) {} observe() { throw new TypeError('unsupported'); } disconnect() {} }
    let now = 100;
    const resources = () => [entry({ startTime: 100.5, requestStart: 140.2, responseStart: 163.9 })];
    expect(await timeDoorPing(DOOR, { fetch: answering(204, [], () => { now = 190; }), now: () => now, resources, observer: Refusing as unknown as typeof PerformanceObserver })).toBe(24);
  });
});
