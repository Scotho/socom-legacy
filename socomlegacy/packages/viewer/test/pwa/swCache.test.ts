import { describe, expect, it } from 'vitest';
import { activateFrom, cacheFirstFrom, networkFirstFrom, pruneCaches, staleCaches, type CacheLike, type CacheStorageLike } from '../../src/pwa/swCache';

/**
 * The worker's caches across a deploy (the joint review of #353 and the hold, P3; our fold on Fuse's `sw.ts`). A browser
 * adaptation. CX.R18 keeps a page on its build while the front end is mounted, so a held tab on build A can be claimed
 * by build B's worker (another tab asked) and still need A's lazy chunks -- the front end's first match imports
 * `./matchMount` -- after the server serves B alone (`/assets/` is `try_files =404`).
 */

/** A `CacheStorage` over maps, its keys in creation order as the spec's are. */
function storage(): CacheStorageLike & { names: Map<string, Map<string, Response>> } {
  const names = new Map<string, Map<string, Response>>();
  const cacheOf = (m: Map<string, Response>): CacheLike => ({
    match: async (req) => m.get(new URL(req.url).pathname)?.clone(),
    put: async (req, res) => { m.set(new URL(req.url).pathname, res); },
  });
  return {
    names,
    keys: async () => [...names.keys()],
    delete: async (name) => names.delete(name),
    open: async (name) => { if (!names.has(name)) names.set(name, new Map()); return cacheOf(names.get(name)!); },
    match: async (req) => {
      for (const m of names.values()) { const hit = m.get(new URL(req.url).pathname); if (hit) return hit.clone(); }
      return undefined;
    },
  };
}

const req = (path: string): Request => new Request(`https://nightly.test${path}`);
const gone = async (): Promise<Response> => new Response('', { status: 404 });

describe('P3: a held tab on build A after build B activates', () => {
  it("still loads A's lazy chunk (the front end's first match imports `./matchMount`) once the server serves B alone", async () => {
    const s = storage();
    await (await s.open('s2u-A')).put(req('/assets/matchMount-a.js'), new Response('chunk-a'));   // A's install precached it
    await (await s.open('s2u-B')).put(req('/assets/matchMount-b.js'), new Response('chunk-b'));   // B's install
    await pruneCaches(s, 's2u-B');                                                                // B activates (another tab asked)
    const res = await cacheFirstFrom(s, 's2u-B', req('/assets/matchMount-a.js'), gone);           // B's worker serves the held tab
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('chunk-a');
  });

  it('keeps one release back: C activating deletes A and keeps B; caches not ours are never touched', () => {
    expect(staleCaches(['s2u-A', 's2u-B', 's2u-C'], 's2u-C')).toEqual(['s2u-A']);
    expect(staleCaches(['s2u-A', 's2u-C'], 's2u-C')).toEqual([]);
    expect(staleCaches(['other', 's2u-A', 's2u-B'], 's2u-B')).toEqual([]);
  });

  it('a third release prunes the oldest: exactly one back is kept, so the caches never grow', async () => {
    const s = storage();
    for (const r of ['A', 'B', 'C']) { await s.open(`s2u-${r}`); await pruneCaches(s, `s2u-${r}`); }
    expect([...s.names.keys()]).toEqual(['s2u-B', 's2u-C']);
  });
});

describe('LATER 186: a tab held through two deploys keeps its own release (each activating worker records its cache)', () => {
  /** Where the worker records the release it activated (`./sw` passes its own scope's). */
  const KEY = 'https://nightly.test/__pwa-active';

  it("B installs and waits, C replaces it and activates: A -- the release last active, the held tab's -- is kept and B (never active) deleted", async () => {
    const s = storage();
    await (await s.open('s2u-A')).put(req('/assets/matchMount-a.js'), new Response('chunk-a'));
    await pruneCaches(s, 's2u-A', KEY);                                                      // A activates: recorded
    await s.open('s2u-B');                                                                    // B installs, waits on the held tab
    await s.open('s2u-C');                                                                    // C installs, B is discarded unactivated
    await pruneCaches(s, 's2u-C', KEY);                                                      // C activates (another tab asked)
    expect([...s.names.keys()].filter((k) => k.startsWith('s2u-'))).toEqual(['s2u-A', 's2u-C']);
    const res = await cacheFirstFrom(s, 's2u-C', req('/assets/matchMount-a.js'), gone);
    expect([res.status, await res.text()]).toEqual([200, 'chunk-a']);
  });

  it("its review's F2: a newer worker still installing when an older one activates keeps its cache (never one created after this release)", async () => {
    const s = storage();
    await s.open('s2u-A');
    await pruneCaches(s, 's2u-A', KEY);                                                      // A recorded
    await s.open('s2u-B');                                                                    // B installs, waits
    await (await s.open('s2u-C')).put(req('/offline.html'), new Response('offline-c'));     // C installing (its precache)
    await pruneCaches(s, 's2u-B', KEY);                                                      // B told to skip waiting: activates
    expect([...s.names.keys()].filter((k) => k.startsWith('s2u-'))).toEqual(['s2u-A', 's2u-B', 's2u-C']);
  });

  it('no record yet (the release before was activated by a worker without this rule): the newest other kept, as P3', async () => {
    const s = storage();
    for (const r of ['A', 'B']) await s.open(`s2u-${r}`);
    await pruneCaches(s, 's2u-B', KEY);
    expect([...s.names.keys()].filter((k) => k.startsWith('s2u-'))).toEqual(['s2u-A', 's2u-B']);
    await s.open('s2u-C');
    await pruneCaches(s, 's2u-C', KEY);                                                      // B was recorded: A goes
    expect([...s.names.keys()].filter((k) => k.startsWith('s2u-'))).toEqual(['s2u-B', 's2u-C']);
  });
});

describe('SW-ASSET-FETCH: a quota or storage failure must never turn a 200 into a network error (the worker, a browser adaptation)', () => {
  /*
   * Seat redotcom-e4's look after v0.4.22 (2026-11-14, 17:38-17:52Z, the worker on): /replay/ loads failed with
   * net::ERR_FAILED -- no response -- on the build's own /assets/ chunks that the server answered 200, while each failing
   * profile held its release's cache EMPTY (a good run's: 82). The store was refused ("Entry already exists") because the
   * test profiles sat under a deep folder and Chromium's cache files passed Windows' 260-character path limit; any refused
   * store did the same, as the cache-first answer awaited the store before it answered and a rejection rejected `respondWith`.
   * No player was observed failing; the fix makes any refused store harmless. A cache that
   * cannot be read or written is a miss and a lost copy -- never the page's failure. The 404 of a stale build's miss
   * (PT195-5) is unchanged.
   */
  const NETWORK = 'chunk-from-network';
  const ok = async (): Promise<Response> => new Response(NETWORK, { status: 200 });
  const refused = (what: string) => (): Promise<never> => Promise.reject(new DOMException(`${what} refused`, 'QuotaExceededError'));
  /** A store over `storage()` with one of its calls failing as a full or evicted origin's does. */
  const failing = (fail: { match?: boolean; open?: boolean; put?: boolean; putHangs?: boolean }): CacheStorageLike => {
    const s = storage();
    return {
      keys: s.keys,
      delete: s.delete,
      match: fail.match ? refused('match') : s.match,
      open: fail.open ? refused('open') : async (name) => {
        const c = await s.open(name);
        return { match: c.match, put: fail.put ? refused('put') : fail.putHangs ? () => new Promise<void>(() => undefined) : c.put };
      },
    };
  };
  /** Within a bound: the old path awaited a store that never settles, and the page waited with it. */
  const within = <T>(p: Promise<T>, ms = 1000): Promise<T> =>
    Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(`no answer in ${ms} ms`)), ms))]);

  it('a store that refuses the copy (a full disk, a tight quota) still answers the 200 the network gave', async () => {
    const res = await within(cacheFirstFrom(failing({ put: true }), 's2u-B', req('/assets/launchGate-a.js'), ok, () => true, (p) => { void p; }));
    expect([res.status, await res.text()]).toEqual([200, NETWORK]);
  });

  it("a release cache that cannot be opened still answers the network's 200", async () => {
    const res = await within(cacheFirstFrom(failing({ open: true }), 's2u-B', req('/assets/pageStore-a.js'), ok, () => true, (p) => { void p; }));
    expect([res.status, await res.text()]).toEqual([200, NETWORK]);
  });

  it("a cache that cannot be read is a miss: the network's 200 is the answer", async () => {
    const res = await within(cacheFirstFrom(failing({ match: true }), 's2u-B', req('/assets/setup-a.js'), ok, () => true, (p) => { void p; }));
    expect([res.status, await res.text()]).toEqual([200, NETWORK]);
  });

  it('the answer does not wait for the copy: a store that never settles still lets the 200 through', async () => {
    const res = await within(cacheFirstFrom(failing({ putHangs: true }), 's2u-B', req('/assets/pageVersion-a.js'), ok, () => true, (p) => { void p; }));
    expect([res.status, await res.text()]).toEqual([200, NETWORK]);
  });

  it("a stale build's miss is still answered 404 here and never requested, the cache unreadable or not (PT195-5 unchanged)", async () => {
    let asked = 0;
    const count = async (): Promise<Response> => { asked++; return new Response(NETWORK); };
    const res = await within(cacheFirstFrom(failing({ match: true }), 's2u-B', req('/assets/gone-a.js'), count, () => false, (p) => { void p; }));
    expect([res.status, asked]).toEqual([404, 0]);
  });

  it("a store that works still keeps the copy -- handed to the worker's `waitUntil` -- and the next read is a hit", async () => {
    const s = storage();
    const kept: Promise<unknown>[] = [];
    const first = await within(cacheFirstFrom(s, 's2u-B', req('/assets/app-a.js'), ok, () => true, (p) => { kept.push(p); }));
    expect(await first.text()).toBe(NETWORK);
    expect(kept).toHaveLength(1);
    await kept[0];
    const again = await cacheFirstFrom(s, 's2u-B', req('/assets/app-a.js'), gone, () => true, (p) => { kept.push(p); });
    expect([again.status, await again.text(), kept.length]).toEqual([200, NETWORK, 1]);
  });

  it("a worker that refuses to be kept alive (waitUntil throws InvalidStateError: a timed-out event, another engine) still answers the network's 200", async () => {
    const s = storage();
    const throwing = (): void => { throw new DOMException('the event is no longer active', 'InvalidStateError'); };
    const res = await within(cacheFirstFrom(s, 's2u-B', req('/assets/console-a.js'), ok, () => true, throwing));
    expect([res.status, await res.text()]).toEqual([200, NETWORK]);
  });

  it("a navigation the network refuses, with the cache unopenable too, still answers the 503 offline page (never no response)", async () => {
    const down = (): Promise<never> => Promise.reject(new TypeError('Failed to fetch'));
    const res = await within(networkFirstFrom(failing({ open: true }), 's2u-B', '/offline.html', req('/testroom'), down));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('offline');
  });

  it("a navigation the network refuses answers the cached offline page when there is one, and the network's answer when it has one", async () => {
    const s = storage();
    await (await s.open('s2u-B')).put(req('/offline.html'), new Response('the kept offline page', { status: 200 }));
    const down = (): Promise<never> => Promise.reject(new TypeError('Failed to fetch'));
    const off = await networkFirstFrom(s, 's2u-B', 'https://nightly.test/offline.html', req('/testroom'), down);
    expect([off.status, await off.text()]).toEqual([200, 'the kept offline page']);
    const on = await networkFirstFrom(s, 's2u-B', 'https://nightly.test/offline.html', req('/testroom'), ok);
    expect([on.status, await on.text()]).toEqual([200, NETWORK]);
  });

  it('a failed store is swallowed where it is kept: the promise handed on never rejects', async () => {
    const kept: Promise<unknown>[] = [];
    await within(cacheFirstFrom(failing({ put: true }), 's2u-B', req('/assets/discStart-a.js'), ok, () => true, (p) => { kept.push(p); }));
    expect(kept).toHaveLength(1);
    await expect(kept[0]).resolves.toBeUndefined();
  });
});

/**
 * LATER 1048 (the worker, a browser adaptation): activate claims the open pages whatever its prune did. Before, `./sw`
 * ran `pruneCaches(...).then(() => clients.claim())`, and any rejecting step -- the record book's open, an old cache's
 * delete, the record's put, on a full or evicted origin -- stopped the chain: the open pages stayed uncontrolled until
 * their next load (SW-ASSET-FETCH's review, finding 4).
 */
describe('LATER 1048: activate claims the pages even when its prune fails', () => {
  const KEY = 'https://nightly.test/__pwa-active';
  const quota = (what: string) => (): Promise<never> => Promise.reject(new DOMException(`${what} refused`, 'QuotaExceededError'));
  /** `storage()` holding an old release, with one of the prune's calls rejecting. */
  const pruning = (fail: { keys?: boolean; open?: boolean; delete?: boolean; put?: boolean }): CacheStorageLike => {
    const s = storage();
    void s.open('s2u-A'); void s.open('s2u-B'); void s.open('s2u-C');
    return {
      keys: fail.keys ? quota('keys') : s.keys,
      delete: fail.delete ? quota('delete') : s.delete,
      match: s.match,
      open: fail.open ? quota('open') : async (name) => {
        const c = await s.open(name);
        return { match: c.match, put: fail.put ? quota('put') : c.put };
      },
    };
  };

  for (const fail of [{ open: true }, { keys: true }, { delete: true }, { put: true }] as const) {
    it(`the ${Object.keys(fail)[0]} rejecting: the claim still runs once and activate's promise resolves`, async () => {
      let claims = 0;
      await expect(activateFrom(pruning(fail), 's2u-C', KEY, async () => { claims++; })).resolves.toBeUndefined();
      expect(claims).toBe(1);
    });
  }

  it('a prune that works: the old release deleted, this one recorded, then the claim -- after the prune, never before', async () => {
    const s = storage();
    await s.open('s2u-A'); await s.open('s2u-B'); await s.open('s2u-C');
    const seen: string[] = [];
    await activateFrom(s, 's2u-C', KEY, async () => {
      const recorded = await (await (await s.open('pwa-active')).match(new Request(KEY)))?.text();
      seen.push(`claim with ${(await s.keys()).join(',')}, recorded ${recorded}`);
    });
    expect(seen).toEqual(['claim with s2u-B,s2u-C,pwa-active, recorded s2u-C']);   // the delete AND the record before the claim
  });

  it("its review (1): a prune that fails after an older record stood drops the record, so the next activation keeps the release that really ran (P3, LATER 186)", async () => {
    const s = storage();
    await s.open('s2u-B');
    await pruneCaches(s, 's2u-B', KEY);                                                       // B activates: recorded
    await s.open('s2u-C');
    const putRefused: CacheStorageLike = {
      ...s,
      open: async (name) => { const c = await s.open(name); return { match: c.match, put: quota('put') }; },
    };
    let claims = 0;
    await activateFrom(putRefused, 's2u-C', KEY, async () => { claims++; });                  // C activates, its record refused
    expect(claims).toBe(1);
    expect(await (await s.open('pwa-active')).match(new Request(KEY))).toBeUndefined();        // B's stale record gone
    await s.open('s2u-D');
    await activateFrom(s, 's2u-D', KEY, async () => undefined);                               // D activates
    expect([...s.names.keys()].filter((k) => k.startsWith('s2u-'))).toEqual(['s2u-C', 's2u-D']);   // C -- the release that ran -- kept
  });

  it('a claim that rejects is not swallowed (it is the browser\'s, and the event should see it)', async () => {
    await expect(activateFrom(storage(), 's2u-C', KEY, () => Promise.reject(new Error('claim refused')))).rejects.toThrow('claim refused');
  });
});
