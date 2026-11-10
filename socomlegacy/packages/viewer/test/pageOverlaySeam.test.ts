// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootPage, PAGE_LOADERS, type PageLoaders } from '../src/pageEntry';
import type { FrontEndMount } from '../src/frontEnd';
import type { LaunchSheetMount } from '../src/launchSettings/sheet';
import { bootLauncher } from '../src/console/launcherEntry';
import { FORGE_MATCH_CLASS, overlayEnabled, overlayPageReads, OVERLAY_PAGE_KINDS, videoPictureFollows, type OverlayPage } from '../src/modern/overlay/page';
import { FORGE_MATCHING_CLASS } from '../src/forge/matchState';

/**
 * MU2-10 (MU2.R4 of `docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`): the overlay mounts through ONE seam in
 * `src/pageEntry.ts` -- once, after the page has booted -- over every page the entry boots (the front end over the
 * served tree, the disc page and the front end it mounts, the menu flow's deep routes the development console hands to
 * the entry, the test room, the launch settings sheet; since MU2-17 the forge, MU2.R9), and never over the console
 * launcher (`/`, `/console`: the home page, which never passes the entry). A browser adaptation
 * (`MODERN_OVERLAY_ADAPTATION`, MU2.R3).
 */
const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');
const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
const body = (): string => html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/^<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
function loadPage(): void { document.body.className = 'panel-collapsed'; document.body.innerHTML = body(); }

interface Seen { order: string[]; pages: OverlayPage[]; docs: Document[] }
function loaders(o: { overlay?: 'ok' | 'reject' } = {}): { loaders: PageLoaders; seen: Seen; mount: FrontEndMount } {
  const seen: Seen = { order: [], pages: [], docs: [] };
  const mount: FrontEndMount = { canvas: document.createElement('canvas'), status: 'test', session: Promise.resolve(null), stop: () => {} };
  const sheet = { dispose: () => {} } as unknown as LaunchSheetMount;
  return {
    seen, mount,
    loaders: {
      main: async () => { seen.order.push('main'); },
      frontEnd: async () => ({ mountFrontEnd: () => { seen.order.push('frontEnd'); return mount; } }),
      launchSettings: async () => ({ mountLaunchSettings: () => { seen.order.push('launchSettings'); return sheet; } }),
      forge: async () => ({ mountForge: async () => { seen.order.push('forge'); } }),   // MU2-17: the forge's page, a double
      overlay: async () => {
        if (o.overlay === 'reject') throw new Error('a navigation aborted the overlay chunk');
        return { mountPageOverlay: (doc: Document, page: OverlayPage) => { seen.order.push(`overlay:${page.kind}`); seen.pages.push(page); seen.docs.push(doc); return null; } };
      },
    },
  };
}

beforeEach(loadPage);
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; window.history.replaceState(null, '', '/'); });

describe('MU2-10: the seam in pageEntry.ts mounts the overlay over every page it boots (MU2.R4)', () => {
  // The table: each address the entry boots, the page kind it is, and the overlay mounted once, after the page.
  const TABLE: [address: string, kind: OverlayPage['kind'], booted: string][] = [
    ['/setup?devmode', 'front-end', 'frontEnd'],                   // the front end over the served tree (the MU2-9 specs' page)
    ['/?devmode', 'front-end', 'frontEnd'],                        // the development console's hand-off at the base (`launcherEntry`)
    ['/main/online?devmode', 'front-end', 'frontEnd'],             // a menu flow's deep route the development console hands on
    ['/setup', 'disc', ''],                                        // the disc page: the front end once the image opens
    ['/testroom?map=MP2', 'viewer', 'main'],                       // the test room (the map viewer and the match)
    ['/testroom', 'launch-settings', 'launchSettings'],            // a development build's launch settings sheet
    ['/playtest', 'launch-settings', 'launchSettings'],
    ['/forge', 'forge', 'forge'],                                  // MU2-17 (MU2.R9): the forge, the overlay over it
  ];
  for (const [address, kind, booted] of TABLE) {
    it(`${address}: the ${kind} page, the overlay mounted once over it, after it booted`, async () => {
      loadPage();
      const t = loaders();
      const r = await bootPage(address, document, t.loaders);
      expect(r.entry).toBe(kind);
      expect(t.seen.pages.map((p) => p.kind)).toEqual([kind]);
      expect(t.seen.docs).toEqual([document]);
      expect(t.seen.order).toEqual(booted ? [booted, `overlay:${kind}`] : [`overlay:${kind}`]);
      expect(overlayEnabled(kind)).toBe(true);
    });
  }

  it('the front end\'s page hands the overlay its mount (the game\'s session and its match read through it); the disc page its promise', async () => {
    const t = loaders();
    await bootPage('/setup?devmode', document, t.loaders);
    expect(t.seen.pages[0]!.frontEnd).toBe(t.mount);
    loadPage();
    const d = loaders();
    const r = await bootPage('/setup', document, d.loaders);
    expect(r.entry).toBe('disc');
    expect(d.seen.pages[0]!.frontEnd).toBe((r as { mount: Promise<FrontEndMount | null> }).mount);
    for (const page of ['/testroom?map=MP2', '/playtest']) {
      loadPage();
      const v = loaders();
      await bootPage(page, document, v.loaders);
      expect(v.seen.pages[0]!.frontEnd ?? null, page).toBeNull();
    }
  });

  it('the overlay\'s chunk failing (a navigation) never fails the page: the entry boots as before', async () => {
    const t = loaders({ overlay: 'reject' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await bootPage('/setup?devmode', document, t.loaders);
    expect(r).toEqual({ entry: 'front-end', mount: t.mount });
    expect(t.seen.pages).toEqual([]);
  });

  it('the page\'s own loaders carry the overlay\'s, in every build (a release feature: no development gate around it)', () => {
    expect(typeof PAGE_LOADERS.overlay).toBe('function');
    const text = readFileSync(resolve(SRC, 'pageEntry.ts'), 'utf8');
    const line = text.split('\n').find((l) => l.includes("import('./modern/overlay')"))!;
    expect(line).toBeDefined();
    expect(line).not.toContain('import.meta.env.DEV');
    expect(text.split('\n').filter((l) => /mountPageOverlay\(/.test(l) && !l.trim().startsWith('*') && !l.trim().startsWith('//')).length).toBe(1);   // one seam
  });
});

describe("RB-16 (PS-4): the overlay's Options > Display \"Video\" row on the test room", () => {
  it("offered where a match follows the page's picture: Home, the front end, the disc page and now the test room; not the forge nor the sheet", () => {
    expect(OVERLAY_PAGE_KINDS.filter(videoPictureFollows)).toEqual(['console', 'front-end', 'disc', 'viewer']);
  });
});

describe('MU2-10: never over the console (the home page, MU2.R4)', () => {
  it('the console is the one page kind the overlay does not mount on; the forge mounts it since MU2-17 (MU2.R9 lifts MU2.R7)', () => {
    expect(overlayEnabled('console')).toBe(false);
    expect(overlayEnabled('forge')).toBe(true);
    for (const k of OVERLAY_PAGE_KINDS) expect(overlayEnabled(k), k).toBe(k !== 'console');
    expect(OVERLAY_PAGE_KINDS).toContain('forge');
  });
  it('the forge (`/forge`, FG.R9: a sandbox driven by the pad): the seam hands its kind on, after the forge has mounted, and the overlay takes it', async () => {
    loadPage();
    const t = loaders();
    const r = await bootPage('/forge', document, t.loaders);
    expect(r.entry).toBe('forge');
    expect(t.seen.order).toEqual(['forge', 'overlay:forge']);
    expect(t.seen.pages).toEqual([{ kind: 'forge', frontEnd: null }]);
    expect(overlayEnabled('forge')).toBe(true);
  });

  it('the console\'s page shown (`/`, `/console`, no served tree): the entry is never passed, so no overlay', async () => {
    for (const path of ['/', '/console', '/console?devmode']) {
      window.history.replaceState(null, '', path);
      const game = vi.fn(async () => {});
      const shown = vi.fn();
      const r = await bootLauncher(document, { dev: true, base: '/', served: async () => false, game, console: shown });
      expect(r, path).toBe('console');
      expect(game, path).not.toHaveBeenCalled();
      expect(shown, path).toHaveBeenCalledTimes(1);
    }
  });

  it('under src/console/ only the START hand-over loads the overlay (MU2-10c), after the console is taken down', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
    const loads = files(join(SRC, 'console')).filter((f) => /(?:from\s*|import\(\s*)'[^']*modern\/overlay/.test(readFileSync(f, 'utf8').replace(/^import type .*$/gm, '')));
    expect(loads.map((f) => f.slice(SRC.length + 1).replace(/\\/g, '/'))).toEqual(['console/adapters/launch.ts']);
    const text = readFileSync(join(SRC, 'console/adapters/launch.ts'), 'utf8');
    const takeDown = text.indexOf('page.takeDown();');
    expect(takeDown).toBeGreaterThan(-1);
    expect(text.indexOf('mountPageOverlay(', takeDown)).toBeGreaterThan(takeDown);              // its one call after the take-down
    expect(text.slice(0, takeDown).includes('mountPageOverlay(')).toBe(false);
  });

  it('the two development mounts are gone from the game\'s modules: main.ts and frontEnd.ts load no overlay', () => {
    for (const f of ['main.ts', 'frontEnd.ts']) expect(readFileSync(resolve(SRC, f), 'utf8'), f).not.toMatch(/(?:from\s*|import\(\s*)'[^']*modern\/overlay/);
  });
});

describe('MU2-10: what the overlay reads of the page kind (the session and the round)', () => {
  const lobby = { loggedIn: () => true, ticket: () => 'game-ticket', account: () => 'GAMEPERSONA' };
  const feSession = (phase: string) => ({ lobby, match: { phase } });
  const mountOf = (s: unknown): FrontEndMount => ({ canvas: document.createElement('canvas'), status: '', session: Promise.resolve(s as never), stop: () => {} });
  const settle = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

  it('front end: the game\'s own lobby client once its session is made; a round runs while its match loads or plays', async () => {
    const fe = feSession('idle');
    const reads = overlayPageReads({ kind: 'front-end', frontEnd: mountOf(fe) });
    expect(reads.game()).toBeNull();                               // the session not made yet
    await settle();
    expect(reads.game()).toBe(lobby);
    expect(reads.roundRunning()).toBe(false);
    for (const [phase, running] of [['loading', true], ['match', true], ['idle', false]] as const) {
      fe.match.phase = phase;
      expect(reads.roundRunning(), phase).toBe(running);
    }
  });

  it('the disc page: nothing until the image opens and the front end mounts, then the same reads', async () => {
    let done: (m: FrontEndMount | null) => void = () => {};
    const reads = overlayPageReads({ kind: 'disc', frontEnd: new Promise<FrontEndMount | null>((r) => { done = r; }) });
    await settle();
    expect(reads.game()).toBeNull();
    expect(reads.roundRunning()).toBe(false);
    expect(reads.startBoundary).toBe(true);                        // MU-F2a: the image's START ends the overlay's own session
    done(mountOf(feSession('match')));
    await settle();
    expect(reads.game()).toBe(lobby);
    expect(reads.roundRunning()).toBe(true);
  });

  it("the test room: no game account (the overlay's own session); a round runs while its room's round runs (the loopback's)", () => {
    // The page's hook by the shape the overlay reads (`TestRoomReads`), not the global `Window.__viewer` (`src/hook.ts`).
    const hook: { __viewer?: { net?(): { waiting: boolean } | null } } = {};
    const reads = overlayPageReads({ kind: 'viewer' }, hook as unknown as Window);
    expect(reads.game()).toBeNull();
    expect(reads.startBoundary).toBe(false);
    expect(reads.roundRunning()).toBe(false);                      // the viewer's script not run yet: no hook
    let room: { waiting: boolean } | null = null;
    hook.__viewer = { net: () => room };
    expect(reads.roundRunning()).toBe(false);                      // no room: exploring, no round
    room = { waiting: true };
    expect(reads.roundRunning()).toBe(false);                      // a room no round has started in
    room = { waiting: false };
    expect(reads.roundRunning()).toBe(true);                       // the round runs: the gates hold
  });

  // CX-25's review F2: whether the game itself runs under the overlay -- its front end, whose menus hold ONLINE, where an
  // account is made -- for the console's sign-in words; every other page kind (the forge, the test room, the launch sheet,
  // the disc page before its image) is a game page for the locks (`gamePage`) but runs no front end.
  it('CX-25 F2: the front end runs only on the front end\'s pages once its session is made; never on the other kinds', async () => {
    const fe = overlayPageReads({ kind: 'front-end', frontEnd: mountOf(feSession('idle')) });
    expect(fe.frontEndRuns()).toBe(false);                         // its session not made yet
    await settle();
    expect(fe.frontEndRuns()).toBe(true);
    let done: (m: FrontEndMount | null) => void = () => {};
    const disc = overlayPageReads({ kind: 'disc', frontEnd: new Promise<FrontEndMount | null>((r) => { done = r; }) });
    await settle();
    expect(disc.frontEndRuns()).toBe(false);                       // the disc page before START: no game yet
    done(mountOf(feSession('idle')));
    await settle();
    expect(disc.frontEndRuns()).toBe(true);
    for (const kind of ['viewer', 'launch-settings', 'forge'] as const) expect(overlayPageReads({ kind }, window).frontEndRuns(), kind).toBe(false);
  });

  it('the launch settings sheet: no game account, no round', () => {
    const reads = overlayPageReads({ kind: 'launch-settings' });
    expect(reads.game()).toBeNull();
    expect(reads.roundRunning()).toBe(false);
  });

  it("MU2-17, the forge: no game account (the overlay's own session); a round runs while the forge's match plays (its `is-matching` body class)", () => {
    // The forge's own mark of its Play match (`src/forge/page.ts` `startMatch` adds it, `endMatch` removes it), read and
    // never written: the forge's walk (`is-playing`, no match) and its building are no round.
    document.body.className = 'forge-page';
    const reads = overlayPageReads({ kind: 'forge' }, window);
    expect(reads.game()).toBeNull();
    expect(reads.startBoundary).toBe(false);
    expect(reads.servedTree()).toBe(false);
    expect(reads.roundRunning()).toBe(false);
    document.body.classList.add('is-playing');
    expect(reads.roundRunning()).toBe(false);                      // the walk: no match
    document.body.classList.add('is-matching');
    expect(reads.roundRunning()).toBe(true);                       // the match: the gates hold
    document.body.classList.remove('is-matching');
    expect(reads.roundRunning()).toBe(false);
    expect(overlayPageReads({ kind: 'forge' }).roundRunning()).toBe(false);   // no window: none
  });

  it("MU2-17 (the checkpoint 5 batch review's F2): `FORGE_MATCH_CLASS` is the forge's own `FORGE_MATCHING_CLASS`, and the forge's page sets its body by that export alone", () => {
    // Since the forge lane's checkpoint 2 the forge exports the class (`src/forge/matchState.ts`) and the overlay imports it,
    // so a rename on the forge's side moves both. The forge's page must still set and clear its body by the export, never by
    // a literal: read as text, every `classList.add` / `remove` on the body names the constant, none the string.
    expect(FORGE_MATCH_CLASS).toBe(FORGE_MATCHING_CLASS);
    const forge = readFileSync(join(SRC, 'forge/page.ts'), 'utf-8');
    expect(forge.includes('doc.body.classList.add(FORGE_MATCHING_CLASS)')).toBe(true);
    expect(forge.includes('doc.body.classList.remove(FORGE_MATCHING_CLASS)')).toBe(true);
    expect(forge.includes(`classList.add('${FORGE_MATCHING_CLASS}')`)).toBe(false);
    expect(forge.includes(`classList.remove('${FORGE_MATCHING_CLASS}')`)).toBe(false);
  });
});
