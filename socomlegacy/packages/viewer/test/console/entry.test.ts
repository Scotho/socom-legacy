// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootLauncher, SERVED_TREE_TIMEOUT_MS, servedTree } from '../../src/console/launcherEntry';
import { LAUNCHER_FIRST } from '../../src/console/routes';
import { mountShell } from './shell';

/**
 * The console page's entry (CX-9a fix round, the review's B1): since the console is the base path's page, a reload of
 * the game the old page booted with `?devmode` over the served tree -- whose address after the mount is the base and the
 * menu route -- came back to the console, which waits for a disc: the served tree and the router's saved trail lost
 * (the owner's two-window link on F5; e2e/originalSettings.spec.ts and e2e/taunts.spec.ts reload so). So on a
 * development build, with `devmode` in the address and the served tree answering, the console page does not show
 * itself: it becomes the game page and boots the game through the old page's entry (`../../src/pageEntry` `bootPage`,
 * the served tree's entry, the router reading the path and the entry's state). The served-tree probe is new (the old
 * page under devmode mounted the tree whether or not it answered) and bounded (N4). Anything else -- no `devmode`, no served tree, a
 * release build, the console's own alias `/console` -- shows the console. The boot and the served-tree check are faked
 * at the boundary. A browser adaptation with no original (OT.R28).
 */
let calls: string[] = [];
const sheetsLinked = (): string[] => [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => (l.getAttribute('href') ?? '').split('/').pop()!);
interface At { address: string; state: unknown; sheets: string[]; consoleMark: boolean }

beforeEach(() => {
  calls = [];
  mountShell(document);
  document.head.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
  for (const href of ['/src/ds/index.css', '/src/console/console.css']) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.append(l);
  }
});
afterEach(() => { window.history.replaceState(null, '', '/'); vi.unstubAllGlobals(); });

/** Boots the entry at `address` (a path and query; `state` the entry's history state) with the served tree `served`. */
async function boot(address: string, o: { dev?: boolean; served?: boolean; state?: unknown; base?: string } = {}): Promise<{ took: string; at: At[] }> {
  window.history.replaceState(o.state ?? null, '', address);
  const at: At[] = [];
  const took = await bootLauncher(document, {
    dev: o.dev ?? true, base: o.base ?? '/',
    served: async (base) => { calls.push(`served ${base}`); return o.served ?? true; },
    game: async (a) => {
      calls.push(`game ${a}`);
      at.push({ address: `${location.pathname}${location.search}`, state: window.history.state as unknown, sheets: sheetsLinked(), consoleMark: document.documentElement.hasAttribute('data-console') });
    },
    console: () => { calls.push('console'); },
    sheets: ['/src/styles.css', '/src/startup.css'], loadSheet: async () => {},
  });
  return { took, at };
}

describe('the console page entry: the served tree under devmode boots the game as the old page did (CX-9a, B1)', () => {
  it('a development build, devmode, the served tree answering: the game is booted at the address as it is; the console never shows', async () => {
    const r = await boot('/?devmode&server=ws://127.0.0.1:8787/ws');
    expect(r.took).toBe('game');
    expect(calls).toEqual(['served /', 'game /?devmode&server=ws://127.0.0.1:8787/ws']);
    // The game page made first, as the hand-over makes it: the old page's sheets linked, the console's rules off.
    expect(r.at[0]!.sheets).toEqual(['index.css', 'console.css', 'styles.css', 'startup.css']);
    expect(r.at[0]!.consoleMark).toBe(false);
  });

  it('F5 at a menu route the game wrote: the path and the entry state are what the game boots with (the router replays its trail)', async () => {
    const state = { s2uMenuRoute: { depth: 2, trail: [[], ['dlgMenu.rdr'], ['dlgMenu.rdr', 'dlgOnline.rdr']] } };
    const r = await boot('/main/online?devmode&menuflow=dlgNetLogin.rdr', { state });
    expect(r.took).toBe('game');
    expect(r.at[0]!.address).toBe('/main/online?devmode&menuflow=dlgNetLogin.rdr');
    expect(r.at[0]!.state).toEqual(state);
  });

  it('under the site base too', async () => {
    const r = await boot('/socomlegacy/?devmode', { base: '/socomlegacy/' });
    expect(r.took).toBe('game');
    expect(calls).toEqual(['served /socomlegacy/', 'game /socomlegacy/?devmode']);
  });

  it('?served is the served-maps switch on its own; flyok and devtools do not boot the tree', async () => {
    expect((await boot('/?served')).took).toBe('game');
    expect(calls).toEqual(['served /', 'game /?served']);
    calls = [];
    expect((await boot('/?flyok')).took).toBe('console');
    expect(calls).toEqual(['console']);
    calls = [];
    expect((await boot('/?devtools')).took).toBe('console');
    expect(calls).toEqual(['console']);
  });

  it('devmode without a served tree: the console', async () => {
    const r = await boot('/?devmode', { served: false });
    expect(r.took).toBe('console');
    expect(calls).toEqual(['served /', 'console']);
    expect(document.documentElement.hasAttribute('data-console')).toBe(true);
  });

  it('no devmode: the console, and the served tree is not asked', async () => {
    for (const a of ['/', '/?server=ws://127.0.0.1:8787/ws', '/main/online']) {
      calls = [];
      expect((await boot(a)).took, a).toBe('console');
      expect(calls, a).toEqual(['console']);
    }
  });

  it('a release build: the console, devmode or not', async () => {
    expect((await boot('/?devmode', { dev: false })).took).toBe('console');
    expect(calls).toEqual(['console']);
  });

  it('the console alias /console shows the console under devmode (the console looked at on a development server)', async () => {
    for (const a of ['/console?devmode', '/console/?devmode&sample']) {
      calls = [];
      expect((await boot(a)).took, a).toBe('console');
      expect(calls, a).toEqual(['console']);
    }
  });

  // LATER 184 (#356's review F6; the merge controller's call (A), 2026-10-21): a launcher path is the launcher's own
  // (CX-33, `../../src/console/routes.ts` `LAUNCHER_FIRST`), never a game route, and a refresh at one under devmode booted
  // the game page. The bare base and the game's `main/` stay the game's, and so does an entry whose state is the game's
  // menu trail (`classifyLauncherPath`'s 'foreign').
  it('LATER 184: a refresh at a launcher path under devmode shows the console; the served tree is not asked', async () => {
    for (const first of LAUNCHER_FIRST) {
      for (const [a, base] of [[`/${first}/x?devmode`, '/'], [`/socomlegacy/${first}?devmode`, '/socomlegacy/']] as const) {
        calls = [];
        expect((await boot(a, { base })).took, a).toBe('console');
        expect(calls, a).toEqual(['console']);
      }
    }
    calls = [];
    expect((await boot('/settings/audio?devmode')).took).toBe('console');
    expect(calls).toEqual(['console']);
  });

  it("LATER 184: the bare base, the game's main/ and a launcher path whose entry is the game's trail stay the game's", async () => {
    expect((await boot('/main/online?devmode')).took).toBe('game');
    const state = { s2uMenuRoute: { depth: 1, trail: [[], ['dlgMenu.rdr']] } };
    expect((await boot('/settings/audio?devmode', { state })).took).toBe('game');
    expect((await boot('/?devmode')).took).toBe('game');
  });
});

describe('the served tree check (the default)', () => {
  it('asks <base>maps/index.json by HEAD as JSON, never the HTML fallback: a 200 of HTML is no tree', async () => {
    const asked: { url: string; method?: string; accept: string | null }[] = [];
    const answer = (status: number, type: string): void => {
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        asked.push({ url, method: init?.method, accept: new Headers(init?.headers).get('accept') });
        return new Response(null, { status, headers: { 'content-type': type } });
      }));
    };
    answer(200, 'application/json');
    expect(await servedTree('/')).toBe(true);
    answer(200, 'text/html');
    expect(await servedTree('/')).toBe(false);
    answer(404, 'text/plain');
    expect(await servedTree('/socomlegacy/')).toBe(false);
    expect(asked.map((a) => a.url)).toEqual(['/maps/index.json', '/maps/index.json', '/socomlegacy/maps/index.json']);
    expect(asked.every((a) => a.method === 'HEAD' && a.accept === 'application/json')).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await servedTree('/')).toBe(false);
  });

  it('a probe that stalls is no tree once SERVED_TREE_TIMEOUT_MS passes (N4): the console shows, never a blank page', async () => {
    let signal: AbortSignal | undefined;
    // A dev server that never answers: the request ends only when its signal aborts.
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_ok, fail) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener('abort', () => fail(signal!.reason));
    })));
    expect(SERVED_TREE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SERVED_TREE_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
    const t0 = Date.now();
    expect(await servedTree('/', 30)).toBe(false);
    expect(signal).toBeDefined();
    expect(Date.now() - t0).toBeLessThan(1_000);
    // And through the entry: devmode on a development build, the probe stalls, the console shows.
    window.history.replaceState(null, '', '/?devmode');
    const shown: string[] = [];
    expect(await bootLauncher(document, { dev: true, base: '/', served: (b) => servedTree(b, 30), console: () => { shown.push('console'); } })).toBe('console');
    expect(shown).toEqual(['console']);
  }, 3_000);
});
