// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheFirstFrom, type CacheLike, type CacheStorageLike } from '../../src/pwa/swCache';
import {
  applyStaleMessage, blockStalePassthrough, chunkUrlFromReason, emptyStaleGate, gateFor, hashedMissUsesNetwork, StaleGates,
  staleFromServed, type StaleStore,
} from '../../src/pwa/staleRelease';
import {
  CHUNK_RELOAD_NOTICE, UPDATE_NOTICE_GAME_FADE_ADAPTATION, bindChunkLoadFailures, markPageBroken, showUpdateNotice, watchRelease,
} from '../../src/pwa/update';

/**
 * PT195-5 (LATER 331, issue #463). A browser adaptation. Pages left open across a release kept requesting hashed
 * scripts the new build no longer serves. The version poll and a failed lazy chunk both stop those requests and
 * ask the player to reload. A match is never reloaded by the page itself; a failed chunk prompts during it.
 */

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-pwa-broken');
  delete (window as unknown as { __frontEnd?: unknown }).__frontEnd;
});

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
      for (const m of names.values()) {
        const hit = m.get(new URL(req.url).pathname);
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
}

const req = (path: string): Request => new Request(`https://nightly.test${path}`);

describe('the version-change path', () => {
  it('a new /version.json stops missing-chunk fetches and does not reload during a match; it reloads once the match is over', async () => {
    let inMatch = true;
    const events: string[] = [];
    const watch = watchRelease({
      pageRev: 'build-a',
      inMatch: () => inMatch,
      servedRev: async () => 'build-b',
      waiting: () => false,
      activateWaiting() { events.push('activate'); },
      reload() { events.push('reload'); },
      onStale() { events.push('stale'); },
      onVisible: () => () => {},
      intervalMs: 60_000,
    });
    await watch.check();
    expect(events.filter((event) => event === 'reload')).toEqual([]);
    expect(events).toContain('stale');

    const gate = emptyStaleGate();
    expect(applyStaleMessage(gate, { type: 'stale-release' })).toBe(true);
    expect(hashedMissUsesNetwork(gate, 'https://nightly.test/assets/old-BMVRGKxO.js')).toBe(false);
    expect(blockStalePassthrough('/testroom/assets/old-BMVRGKxO.js', gate, 'https://nightly.test/testroom/assets/old-BMVRGKxO.js')).toBe(true);
    expect(blockStalePassthrough('/maps/MP01.zed', gate, 'https://nightly.test/maps/MP01.zed')).toBe(false);
    expect(applyStaleMessage(gate, { type: 'skip-waiting' })).toBe(false);

    inMatch = false;
    await watch.check();
    expect(events).toContain('reload');
    watch.stop();
  });

  it('the same revision does not stop fetches or reload', async () => {
    const events: string[] = [];
    const watch = watchRelease({
      pageRev: 'build-a',
      inMatch: () => false,
      servedRev: async () => 'build-a',
      waiting: () => false,
      activateWaiting() {},
      reload() { events.push('reload'); },
      onStale() { events.push('stale'); },
      onVisible: () => () => {},
    });
    await watch.check();
    expect(events).toEqual([]);
    watch.stop();
  });

  it('a cached chunk is still served after the release is stale, and a miss is not fetched', async () => {
    const s = storage();
    await (await s.open('s2u-A')).put(req('/assets/kept-BMVRGKxO.js'), new Response('kept'));
    let fetches = 0;
    const fetchFn = async (): Promise<Response> => { fetches += 1; return new Response('net'); };
    const hit = await cacheFirstFrom(s, 's2u-B', req('/assets/kept-BMVRGKxO.js'), fetchFn, () => false);
    expect([hit.status, await hit.text(), fetches]).toEqual([200, 'kept', 0]);
    const miss = await cacheFirstFrom(s, 's2u-B', req('/assets/gone-BMVRGKxO.js'), fetchFn, () => false);
    expect([miss.status, fetches]).toEqual([404, 0]);
  });
});

// The takeover's review (OT.R69): the worker outlives the page that told it. After a release the old worker stays active
// (it never skips waiting by itself), so a tab opened after the release -- or the stale tab after its own reload -- is
// served by the same worker, asking for the NEW build's hashed files. One gate for the whole worker answered those 404:
// a page on the current build broke, and its Restart reloaded into the same worker. The gate is each page's (client id).
describe('the stale gate is the page\'s, not the worker\'s', () => {
  it('a page that said stale stops its own hashed misses; another page, a fresh tab or the same tab reloaded, still fetches', () => {
    const gates = new StaleGates();
    const oldChunk = 'https://nightly.test/assets/old-BMVRGKxO.js';
    const newChunk = 'https://nightly.test/assets/new-Cq81ZzAa.js';
    expect(gates.apply('tab-old', { type: 'stale-release' })).toBe(true);
    expect(hashedMissUsesNetwork(gates.gate('tab-old'), oldChunk)).toBe(false);
    expect(blockStalePassthrough('/testroom/assets/room-BMVRGKxO.js', gates.gate('tab-old'), 'https://nightly.test/testroom/assets/room-BMVRGKxO.js')).toBe(true);
    // a tab opened after the release (new index.html, new hashes), and the old tab after its reload (a new client id)
    for (const fresh of ['tab-new', 'tab-old-reloaded']) {
      expect(hashedMissUsesNetwork(gates.gate(fresh), newChunk), fresh).toBe(true);
      expect(blockStalePassthrough('/testroom/assets/room-Cq81ZzAa.js', gates.gate(fresh), 'https://nightly.test/testroom/assets/room-Cq81ZzAa.js'), fresh).toBe(false);
    }
    // a failed chunk marks only its own page
    expect(gates.apply('tab-b', { type: 'chunk-failed', url: oldChunk })).toBe(true);
    expect(hashedMissUsesNetwork(gates.gate('tab-b'), oldChunk)).toBe(false);
    expect(hashedMissUsesNetwork(gates.gate('tab-b'), newChunk), "the review's F4: only the failed file").toBe(true);
    expect(hashedMissUsesNetwork(gates.gate('tab-new'), oldChunk)).toBe(true);
  });

  it('a message with no page to name, or not a stale message, changes nothing; a closed page\'s gate is dropped', () => {
    const gates = new StaleGates();
    expect(gates.apply(undefined, { type: 'stale-release' })).toBe(true);   // handled (not a skip-waiting), but no page to mark
    expect(gates.apply('', { type: 'stale-release' })).toBe(true);
    expect(hashedMissUsesNetwork(gates.gate(undefined), 'https://nightly.test/assets/a-BMVRGKxO.js')).toBe(true);
    expect(hashedMissUsesNetwork(gates.gate(''), 'https://nightly.test/assets/a-BMVRGKxO.js')).toBe(true);
    expect(gates.apply('tab', { type: 'skip-waiting' })).toBe(false);
    expect(gates.size).toBe(0);
    gates.apply('tab-a', { type: 'stale-release' });
    gates.apply('tab-b', { type: 'stale-release' });
    gates.drop('tab-a');                                                    // tab-a closed
    expect(gates.ids()).toEqual(['tab-b']);
    expect(gates.size).toBe(1);
    expect(hashedMissUsesNetwork(gates.gate('tab-a'), 'https://nightly.test/assets/a-BMVRGKxO.js')).toBe(true);
    expect(hashedMissUsesNetwork(gates.gate('tab-b'), 'https://nightly.test/assets/a-BMVRGKxO.js')).toBe(false);
  });

  // The takeover's review (F2): the browser stops an idle worker after about 30 s, and an in-memory gate with it, while
  // the page said `stale-release` once. Each page's mark is stored where a restarted worker reads it back.
  it('a restarted worker reads the page\'s stored mark back; a store that fails reads as none; a page met once asks the store once', async () => {
    const marks = new Set<string>();
    let reads = 0;
    const store: StaleStore = {
      marked: async (id) => { reads += 1; return marks.has(id); },
      mark: async (id) => { marks.add(id); },
      keep: async (open) => { for (const id of [...marks]) if (!(await open(id))) marks.delete(id); },
    };
    const before = new StaleGates();
    before.apply('tab-old', { type: 'stale-release' });
    await store.mark('tab-old');
    const after = new StaleGates();                                  // the worker stopped and started again: memory empty
    expect(hashedMissUsesNetwork(await gateFor(after, store, 'tab-old'), 'https://nightly.test/assets/old-BMVRGKxO.js')).toBe(false);
    expect(hashedMissUsesNetwork(await gateFor(after, store, 'tab-new'), 'https://nightly.test/assets/new-Cq81ZzAa.js')).toBe(true);
    reads = 0;
    await gateFor(after, store, 'tab-new');
    await gateFor(after, store, 'tab-old');
    expect(reads, 'memory answers once the page is met').toBe(0);
    expect(hashedMissUsesNetwork(await gateFor(after, null, 'tab-x'), 'https://nightly.test/assets/x-BMVRGKxO.js')).toBe(true);
    expect(hashedMissUsesNetwork(await gateFor(after, store, undefined), 'https://nightly.test/assets/x-BMVRGKxO.js')).toBe(true);
    const broken: StaleStore = { marked: async () => { throw new Error('quota'); }, mark: async () => undefined, keep: async () => undefined };
    expect(hashedMissUsesNetwork(await gateFor(new StaleGates(), broken, 'tab-old'), 'https://nightly.test/assets/old-BMVRGKxO.js')).toBe(true);
    await store.keep(async (id) => id === 'tab-new');
    expect(marks.has('tab-old')).toBe(false);
  });

  it('the revision says stale only when it is read, named and another build\'s (the failed chunk\'s check, the poll\'s)', () => {
    expect(staleFromServed('b2', 'a1')).toBe(true);
    expect(staleFromServed('a1', 'a1')).toBe(false);
    expect(staleFromServed(null, 'a1')).toBe(false);
    expect(staleFromServed('', 'a1')).toBe(false);
    expect(staleFromServed('b2', '')).toBe(false);
  });

  // The rendered check across a release (the takeover review's F1): across a worker swap `clients.matchAll` listed the
  // open pages under other ids than their messages carried, and the prune deleted the mark it had just stored; and a page
  // that said `stale-release` once never said it again to a worker that lost it.
  it('the worker drops a gate only for a page clients.get no longer finds, never the sender; the page says stale at every check (source pins)', () => {
    const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/pwa/sw.ts'), 'utf8');
    const handler = src.slice(src.indexOf("addEventListener('message'"), src.indexOf("addEventListener('fetch'"));
    expect(handler).toContain('id === from');
    expect(handler).toContain('scope.clients.get(id)');
    expect(handler).not.toContain('matchAll(');
    const bootSrc = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/pwa/boot.ts'), 'utf8');
    const post = bootSrc.slice(bootSrc.indexOf('const postStale'), bootSrc.indexOf('let reloading'));
    expect(post).not.toContain('if (stalePosted) return');
  });

  it('the worker stores each page\'s mark and consults it, and a failed chunk asks the revision (source pins)', () => {
    const sw = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/pwa/sw.ts'), 'utf8');
    expect(sw).toContain('staleStore.mark(from)');
    expect(sw).toContain('gateFor(stale, staleStore,');
    const boot = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/pwa/boot.ts'), 'utf8');
    const chunk = boot.slice(boot.indexOf('bindChunkLoadFailures(win'), boot.indexOf("if (!sw) return;"));
    expect(chunk).toContain('staleFromServed(served, rev)');
    expect(chunk).not.toContain('stalePosted = true');
  });

  it('the worker keys the gate by the message\'s source and the fetch\'s client, never one gate for every page', () => {
    const src = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../src/pwa/sw.ts'), 'utf8');
    expect(src).toContain('new StaleGates()');
    expect(src).not.toContain('emptyStaleGate()');
    expect(src).toContain('event.source');
    expect(src).toContain('event.clientId');
  });
});

describe('the failed-chunk path', () => {
  it('a failed lazy script prompts during a match, does not reload by itself, and stops the next hashed fetch', () => {
    const urls: string[] = [];
    const stop = bindChunkLoadFailures(window, (url) => { urls.push(url); });

    const preload = new Event('vite:preloadError', { cancelable: true });
    Object.assign(preload, { payload: new Error('Unable to preload CSS for https://nightly.test/assets/app-BMVRGKxO.css') });
    window.dispatchEvent(preload);
    // the takeover's review (F3): not cancelled -- Vite resolves a cancelled failure's import to undefined
    expect(preload.defaultPrevented).toBe(false);
    expect(urls).toEqual(['https://nightly.test/assets/app-BMVRGKxO.css']);

    const repeat = new Event('vite:preloadError', { cancelable: true });
    Object.assign(repeat, { payload: new Error('Unable to preload CSS for https://nightly.test/assets/app-BMVRGKxO.css') });
    window.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(false);
    expect(urls).toHaveLength(1);

    const imported = new Event('unhandledrejection', { cancelable: true });
    Object.assign(imported, {
      reason: new TypeError('Failed to fetch dynamically imported module: https://nightly.test/testroom/assets/room-BMVRGKxO.js'),
    });
    window.dispatchEvent(imported);
    expect(imported.defaultPrevented).toBe(true);
    expect(urls[1]).toBe('https://nightly.test/testroom/assets/room-BMVRGKxO.js');

    const unrelated = new Event('unhandledrejection', { cancelable: true });
    Object.assign(unrelated, { reason: new Error('the room closed') });
    window.dispatchEvent(unrelated);
    expect(unrelated.defaultPrevented).toBe(false);
    expect(urls).toHaveLength(2);
    expect(chunkUrlFromReason(new Error('the room closed'))).toBeNull();

    const script = document.createElement('script');
    script.src = 'https://nightly.test/assets/page-BMVRGKxO.js';
    document.body.append(script);
    script.dispatchEvent(new Event('error'));
    expect(urls).toContain('https://nightly.test/assets/page-BMVRGKxO.js');

    const gate = emptyStaleGate();
    expect(applyStaleMessage(gate, { type: 'chunk-failed', url: urls[0] })).toBe(true);
    expect(hashedMissUsesNetwork(gate, urls[0]!)).toBe(false);
    // the takeover's review (F4): only the failed file -- a dropped connection on the current build is not a release
    expect(hashedMissUsesNetwork(gate, 'https://nightly.test/assets/other-BMVRGKxO.js')).toBe(true);
    applyStaleMessage(gate, { type: 'chunk-failed', url: urls[1] });
    expect(hashedMissUsesNetwork(gate, 'https://nightly.test/testroom/assets/room-BMVRGKxO.js?retry=1')).toBe(false);

    vi.useFakeTimers();
    const dialog = { name: 'dlgGameRoom.rdr' };
    (window as unknown as { __frontEnd: unknown }).__frontEnd = {
      session: { match: { phase: 'match' }, machine: { shell: () => ({ currentName: dialog.name }) } },
    };
    const clicks: string[] = [];
    showUpdateNotice(document, { restart() { clicks.push('restart'); } });
    const bar = (): HTMLElement => document.querySelector<HTMLElement>('[data-pwa-update]')!;
    expect(bar().hidden, 'a version notice stays hidden in a match').toBe(true);
    markPageBroken(document);
    expect(bar().hidden, 'a broken page shows the prompt during the match').toBe(false);
    expect(bar().textContent).toContain(CHUNK_RELOAD_NOTICE);
    expect(bar().querySelector<HTMLElement>('[data-pwa-later]')!.hidden).toBe(true);
    vi.advanceTimersByTime(UPDATE_NOTICE_GAME_FADE_ADAPTATION * 1000 + 2000);
    expect(bar().hidden, 'it does not fade while the page is broken').toBe(false);
    bar().querySelector<HTMLButtonElement>('[data-pwa-restart]')!.click();
    expect(clicks).toEqual(['restart']);
    stop();
  });
});
