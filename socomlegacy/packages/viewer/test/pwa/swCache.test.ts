import { describe, expect, it } from 'vitest';
import { cacheFirstFrom, pruneCaches, staleCaches, type CacheLike, type CacheStorageLike } from '../../src/pwa/swCache';

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
