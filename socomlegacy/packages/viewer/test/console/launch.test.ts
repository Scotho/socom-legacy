// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOCOM2_US_BOOT } from '@s2u/archive';
import { MEDIUS_STATUS } from '@s2u/ui';
import { buildIso } from '../../../archive/test/isoImage';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveDisc } from '../../src/console/adapters/disc';
import { liveLaunch } from '../../src/console/adapters/launch';
import { liveSession } from '../../src/console/adapters/session';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import { fetchAccountService } from '../../src/connectHost';
import { openedDiscImage as openedFile, openFrontEndDisc } from '../../src/discPrompt';
import type { SourceRequest } from '../../src/worker';
import type { FrontEndMount } from '../../src/frontEnd';
import { openedDiscImage, publishDiscImage } from '../../src/modern/discImage';
import { publishDisc, readDisc } from '../../src/modern/discStore';
import { registerBeforeLaunch } from '../../src/modern/launchGate';
import { createSession, type ModernSession } from '../../src/modern/session';
import { routeSegmentsOfPath } from '../../src/menuRoutes';
import { mountShell } from './shell';

/**
 * The console launcher's hand-over (slice 3, CX-6): START arms for dur-signature, the LaunchScreen shows with the honest
 * seam (H179 / H180), then -- as the current launcher does it (`../../src/modern/launch/launch` `launch()`: the session's
 * sign-out awaited; `../../src/pageEntry` `offerDisc`: the START boundary's `beforeLaunch` hooks, `in-game` published,
 * the front end mounted over the opened image with the same arguments) -- the front end takes the window. A failure is
 * one warn line on the LaunchScreen with Circle back to the launcher, the disc store back to ready. Circle before the
 * mount cancels it. `mountFrontEnd` is faked at the boundary and held to its arguments; the session, the disc store and
 * the launch gate are the real modules. Generated values only. A browser adaptation with no original (OT.R28).
 */
const BASE = 'https://lobby.test';
let page: ConsolePage | null = null;
let release: (() => void) | null = null;
// The disc store and the opened source are per Document, and the tests share one: each starts with no disc.
beforeEach(() => { sessionStorage.clear(); publishDisc(document, { state: 'empty', filename: null }); publishDiscImage(document, null); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; release?.(); release = null; vi.restoreAllMocks(); });

const settle = async (ms = 0): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); if (ms) await new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };
const GOOD = (): File => new File([buildIso([{ path: 'RUN/UI/READERC.ZAR', bytes: new Uint8Array(64) }])], 'socom2.iso');

interface AtMount { path: string; search: string; state: unknown; sheets: string[]; rootFont: string; body: string; dataInput: string | null; consoleMark: boolean }
interface Rig { modern: ModernSession; mount: ReturnType<typeof vi.fn>; order: string[]; ctl: ConsolePage['ctl']; logout: { hold(): void; go(): void }; at: AtMount[] }

/** The stylesheets the document links, by their file names. */
const sheets = (): string[] => [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => (l.getAttribute('href') ?? '').split('/').pop()!.split('?')[0]!);

async function rig(o: { mount?: (...a: unknown[]) => FrontEndMount | null; disc?: boolean; path?: string; search?: string; state?: unknown; hrefs?: string[]; loadSheet?: () => Promise<void> } = {}): Promise<Rig> {
  const order: string[] = [];
  const at: AtMount[] = [];
  // The console page as the browser has it: its address and its two stylesheets (`console/index.html`).
  window.history.replaceState(o.state ?? null, '', `${o.path ?? '/console'}${o.search ?? '?menuflow=x'}`);
  document.body.className = '';                                           // a hand-over before left the game page's classes
  document.head.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
  // The dev server's addresses by default; a build's are hashed assets (`/assets/index-<hash>.css` the design system's,
  // `/assets/console-<hash>.css` the page's own) -- the hand-over must not tell them apart by address.
  for (const href of o.hrefs ?? ['/src/ds/index.css', '/src/console/console.css']) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.append(l);
  }
  let held: (() => void) | null = null;
  let holding = false;
  const fetchFn = (async (input: RequestInfo | URL) => {
    const path = String(input).slice(BASE.length);
    if (path === '/account/logout') {
      order.push('logout sent');
      if (holding) await new Promise<void>((r) => { held = r; });
      order.push('logout answered');
    }
    const body = path === '/account/login' ? { status: MEDIUS_STATUS.Success, ticket: 'tk-gen' } : { status: 0 };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  const modern = createSession(fetchAccountService(BASE, fetchFn), { every: () => () => {}, after: () => () => {} });
  await modern.signIn({ name: 'RANGER7', password: 'pw' });
  modern.accept!();
  // A hook at the START boundary that records the session's state when it ran: the order is the console's own awaits,
  // not the hook's (the session is not registered at the boundary: its sign-out is the console's own, awaited).
  release = registerBeforeLaunch(document, () => { order.push(`gate (${modern.state()})`); return null; });
  const mount = vi.fn((...a: unknown[]) => {
    order.push(`mount:${readDisc(document).state}`);
    at.push({ path: window.location.pathname, search: window.location.search, state: window.history.state as unknown, sheets: sheets(), rootFont: document.documentElement.style.fontSize, body: document.body.className, dataInput: document.documentElement.getAttribute('data-input'), consoleMark: document.documentElement.hasAttribute('data-console') });
    return o.mount ? o.mount(...a) : ({ canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} } as FrontEndMount); });
  const notify = (): void => { page?.render(); };
  const disc = liveDisc(document, notify);
  const session = liveSession(notify, { session: modern, policy: { policy: async () => [] } });
  // The sheets' addresses as the dev server serves them (`index.html`'s); in a test the build's `?url` assets are empty.
  const launch = liveLaunch(document, { session: modern, mount: mount as never, sheets: ['/src/styles.css', '/src/startup.css'], loadSheet: o.loadSheet ?? (async () => {}) });
  const A: Adapters = { ...sampleAdapters(), data: 'live', states: undefined, disc, session, launch };
  page = bootConsole(document, window, A, { keymap: true });
  if (o.disc !== false) {
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [GOOD()] });
    input.dispatchEvent(new Event('change'));
    await settle();
  }
  return { modern, mount, order, ctl: page.ctl, logout: { hold: () => { holding = true; }, go: () => { holding = false; held?.(); } }, at };
}

describe('the hand-over', () => {
  it('arms, shows the LaunchScreen with the seam, signs out and awaits it, runs the gate, publishes in-game, mounts from the opened image', async () => {
    const r = await rig();
    expect(readDisc(document).state).toBe('ready');
    const file = openedFile();
    const assets = openedDiscImage(document);
    r.logout.hold();
    r.ctl.press('options');
    expect(r.ctl.S.start).toBe('arming');
    await settle(360);
    // The sign-out is out and not answered: nothing past it has run (the console awaits it, H179).
    expect(r.order).toEqual(['logout sent']);
    expect(r.mount).not.toHaveBeenCalled();
    r.logout.go();
    await settle();
    expect(r.order).toEqual(['logout sent', 'logout answered', 'gate (signed-out)', 'mount:in-game']);
    expect(r.modern.state()).toBe('signed-out');
    expect(readDisc(document).state).toBe('in-game');
    expect(r.mount).toHaveBeenCalledTimes(1);
    const [search, source, doc, opts] = r.mount.mock.calls[0] as [string, { kind: string; file: File }, Document, { assets: unknown }];
    expect(search).toBe('?menuflow=x');
    expect(source.kind).toBe('iso');
    expect(source.file).toBe(file);                                        // the very File opened, not a copy
    expect(doc).toBe(document);
    expect(opts.assets).toBe(assets);
    // The whole-branch review's BLOCK 1: the front end mounts at the page's base, as from the current launcher, so its
    // menu router reads no menu path (the boot and the intro play), the query kept without devmode.
    expect(r.at[0]!.path).toBe('/');
    expect(r.at[0]!.search).toBe('?menuflow=x');
    expect(routeSegmentsOfPath(r.at[0]!.path, '/')).toEqual([]);
    expect(routeSegmentsOfPath('/console', '/')).toEqual(['console']);      // what it read before: a menu path
    // BLOCK 2: the game page's stylesheets -- the design system's kept, styles.css and startup.css added -- and the
    // console's own rules off (its mark gone: its sheet applies nothing); the body as the page entry leaves it when it
    // mounts (index.html's class, ps2-look; no-served removed, pageEntry.ts go); the root's font-size and input mode cleared.
    expect(r.at[0]!.sheets).toEqual(['index.css', 'console.css', 'styles.css', 'startup.css']);
    expect(r.at[0]!.consoleMark).toBe(false);
    expect(r.at[0]!.rootFont).toBe('');
    expect(r.at[0]!.dataInput).toBeNull();
    expect(r.at[0]!.body).toBe('panel-collapsed ps2-look');
    expect(document.querySelector('.cx-app')).toBeNull();                  // the console page gave the window up
    expect(document.getElementById('overlay')).toBeNull();
    page = null;                                                            // taken down by the hand-over
  });

  it('the LaunchScreen says the honest seam: the target named at START, the game\'s own LOGIN', async () => {
    const r = await rig();
    r.logout.hold();
    r.ctl.S.rooms.selected = 'Bravo';                                        // the sample rooms: a target picked
    r.ctl.press('options');
    await settle(360);
    expect(r.ctl.S.overlay).toBe('launch');
    expect(document.querySelector('#overlay .cx-launch__note')!.textContent)
      .toBe('Room Bravo is your target. The game opens at its own LOGIN screen: sign in there, then join Bravo from the briefing rooms.');
    r.ctl.press('circle');
    r.logout.go();
  });

  it('without a target: the game opens at its own title screen', async () => {
    const r = await rig();
    r.logout.hold();
    r.ctl.press('options');
    await settle(360);
    expect(document.querySelector('#overlay .cx-launch__note')!.textContent).toBe('The game opens at its own title screen.');
    r.ctl.press('circle');
    r.logout.go();
  });

  it('a mount that throws is one warn line with the reason; Circle is Back; the disc is ready again, the session signed out', async () => {
    const r = await rig({ mount: () => { throw new Error('the canvas was refused'); } });
    r.ctl.press('options');
    await settle(360);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#overlay .cx-launch [role="alert"]')!.textContent).toBe('The game could not start: the canvas was refused');
    expect(readDisc(document).state).toBe('ready');
    expect(r.modern.state()).toBe('signed-out');
    expect(document.querySelector('.cx-app')).not.toBeNull();
    expect(document.querySelector('#overlay .cx-launch__back')!.textContent).toContain('Back to launcher');
    // The refusal puts the console page back: its address, its stylesheets and its rules' mark, its scale.
    expect(window.location.pathname).toBe('/console');
    expect(sheets()).toEqual(['index.css', 'console.css']);
    expect(document.documentElement.hasAttribute('data-console')).toBe(true);
    expect(document.documentElement.style.fontSize).not.toBe('');
    expect(document.body.classList.contains('ps2-look')).toBe(false);
    r.ctl.press('circle');
    expect([r.ctl.S.overlay, r.ctl.S.start]).toEqual([null, 'idle']);
    // The slice-3 review's finding 2: after a refusal the session is usable again -- a sign-in goes through.
    expect(await r.modern.signIn({ name: 'RANGER7', password: 'pw' })).toEqual({ ok: true });
  });

  it('an image offered while START waits is not taken: the image START was pressed for is the one mounted', async () => {
    const r = await rig();
    const file = openedFile();
    r.logout.hold();
    r.ctl.press('options');
    await settle(360);
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([new Uint8Array(40 * 2048)], 'other.iso')] });
    input.dispatchEvent(new Event('change'));
    const drop = new Event('drop', { cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [GOOD()] } });
    document.dispatchEvent(drop);
    await settle();
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: 'socom2.iso' });
    r.logout.go();
    await settle();
    expect((r.mount.mock.calls[0] as [string, { file: File }])[1].file).toBe(file);
    page = null;
  });

  it('Back after a cancel takes images again', async () => {
    const r = await rig();
    r.logout.hold();
    r.ctl.press('options');
    await settle(360);
    r.ctl.press('circle');
    const input = document.getElementById('disc-page-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [GOOD()] });
    input.dispatchEvent(new Event('change'));
    expect(readDisc(document).state).toBe('reading');
    r.logout.go();
    await settle();
    expect(r.mount).not.toHaveBeenCalled();
  });

  it('a build: hashed sheets -- the design system kept, the page own rules off, the game page sheets added', async () => {
    const r = await rig({ hrefs: ['/assets/index-abc.css', '/assets/console-abc.css'] });
    r.ctl.press('options');
    await settle(360);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(r.at[0]!.sheets).toEqual(['index-abc.css', 'console-abc.css', 'styles.css', 'startup.css']);
    expect(r.at[0]!.consoleMark).toBe(false);
    page = null;
  });

  it('a resize while the sheets load writes no root font-size onto the game page', async () => {
    const waiting: (() => void)[] = [];
    const loaded = (): void => { for (const done of waiting.splice(0)) done(); };   // both sheets' loads
    const r = await rig({ loadSheet: () => new Promise<void>((done) => { waiting.push(done); }) });
    r.ctl.press('options');
    await settle(360);
    expect(r.mount).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('resize'));
    loaded();
    await settle();
    expect(r.at[0]!.rootFont).toBe('');
    page = null;
  });

  it('the query passes through as written, devmode included (CX-9a fix round, the B2 ruling: devmode is the game key)', async () => {
    const r = await rig({ search: '?menuflow&devmode&server=lobby.test' });
    r.ctl.press('options');
    await settle(360);
    expect((r.mount.mock.calls[0] as [string])[0]).toBe('?menuflow&devmode&server=lobby.test');
    expect(r.at[0]!.search).toBe('?menuflow&devmode&server=lobby.test');
    page = null;
  });

  it('under ?devmode the image mounts with it (the B2 ruling, 2026-10-12: the account routing of OT.R22 and the DEV front-end keys are the game keys)', async () => {
    const r = await rig({ search: '?devmode&menuflow=x&server=lobby.test' });
    r.ctl.press('options');
    await settle(360);
    expect((r.mount.mock.calls[0] as [string])[0]).toBe('?devmode&menuflow=x&server=lobby.test');
    expect(r.at[0]!.search).toBe('?devmode&menuflow=x&server=lobby.test');
    page = null;
  });

  it("CX-9a: the owner's local link at / -- ?devmode&server=ws://... -- hands devmode and server= to the game as written", async () => {
    const r = await rig({ path: '/', search: '?devmode&server=ws://127.0.0.1:8787/ws' });
    r.ctl.press('options');
    await settle(360);
    expect((r.mount.mock.calls[0] as [string])[0]).toBe('?devmode&server=ws://127.0.0.1:8787/ws');
    expect(r.at[0]!.path).toBe('/');
    expect(r.at[0]!.search).toBe('?devmode&server=ws://127.0.0.1:8787/ws');
    expect(new URLSearchParams(r.at[0]!.search).get('server')).toBe('ws://127.0.0.1:8787/ws');
    page = null;
  });

  it.each(['/main/online', '/main/online/d/dlgOptions_Menu'])("CX-9a: a page loaded at a menu route (OT.R10, %s) keeps its path through the hand-over, so the front end's router reads it", async (path) => {
    const r = await rig({ path, search: '?menuflow' });
    r.ctl.press('options');
    await settle(360);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(r.at[0]!.path).toBe(path);
    expect(r.at[0]!.search).toBe('?menuflow');
    expect(routeSegmentsOfPath(r.at[0]!.path, '/')).toEqual(path.split('/').filter((x) => x));
    page = null;
  });

  it('CX-9a fix round (N1): a kept menu path keeps the entry history state, so the saved trail of the router (Back after a reload) survives', async () => {
    const state = { s2uMenuRoute: { depth: 1, trail: [[], ['dlgMenu.rdr', 'dlgOnline.rdr']] } };
    const r = await rig({ path: '/main/online', search: '?menuflow', state });
    r.ctl.press('options');
    await settle(360);
    expect(r.at[0]!.path).toBe('/main/online');
    expect(r.at[0]!.state).toEqual(state);
    page = null;
  });

  it('CX-9a fix round (N1): a replaced path drops the console page state, as before', async () => {
    const r = await rig({ path: '/console', search: '?menuflow', state: { mine: 1 } });
    r.ctl.press('options');
    await settle(360);
    expect(r.at[0]!.path).toBe('/');
    expect(r.at[0]!.state).toBeNull();
    page = null;
  });

  it('a launcher page handed over is not restored at take-down (the address stays the base)', async () => {
    const r = await rig({ path: '/settings/audio', search: '?menuflow=x' });
    expect(window.location.pathname).toBe('/settings/audio');
    r.ctl.press('options');
    await settle(360);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(r.at[0]!.path).toBe('/');
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?menuflow=x');
    page = null;
  });

  it('after START, Back does not walk the launcher entries that led to the hand-over', async () => {
    const r = await rig({ path: '/', search: '?menuflow=x' });
    r.ctl.S.screen = 'options';
    r.ctl.S.opt.cat = 1;
    page!.render();
    expect(window.location.pathname).toBe('/settings/audio');
    r.ctl.press('options');
    await settle(360);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/');
    window.history.back();
    await settle();
    expect(window.location.pathname).not.toBe('/settings/audio');
    page = null;
  });

  it.each(['/console', '/console/', '/nowhere'])('CX-9a: a path that names no menu place (%s: the alias, an unknown one) is replaced by the base, as before', async (path) => {
    const r = await rig({ path, search: '?menuflow' });
    r.ctl.press('options');
    await settle(360);
    expect(r.mount).toHaveBeenCalledTimes(1);
    expect(r.at[0]!.path).toBe('/');
    page = null;
  });

  it('Circle on the LaunchScreen before the mount cancels it: nothing mounts, the disc stays ready', async () => {
    const r = await rig();
    r.logout.hold();
    r.ctl.press('options');
    await settle(360);
    expect(r.ctl.S.overlay).toBe('launch');
    r.ctl.press('circle');
    expect([r.ctl.S.overlay, r.ctl.S.start]).toEqual([null, 'idle']);
    r.logout.go();
    await settle();
    expect(r.mount).not.toHaveBeenCalled();
    expect(readDisc(document).state).toBe('ready');
    expect(document.querySelector('.cx-app')).not.toBeNull();
  });

  it('Options with no disc is still blocked; nothing signs out', async () => {
    const r = await rig({ disc: false });
    r.ctl.press('options');
    await settle();
    expect(r.ctl.S.legendError).toBe('Choose your disc image first: Cross on Play, or the disc mark.');   // LR-24 (was: Home, then Disc)
    expect(r.order).toEqual([]);
    expect(r.modern.state()).toBe('signed-in');
  });
});

describe('the hand-over of a folder (DA-4; DA-3 review F2)', () => {
  /** A picked folder with the two files the page's check reads: SYSTEM.CNF (the retail boot line, generated) and the dialogs. */
  const folder = (): Extract<SourceRequest, { kind: 'dir' }> => ({ kind: 'dir', entries: [
    { path: 'SOCOM2/SYSTEM.CNF', file: new File([new TextEncoder().encode(`BOOT2 = cdrom0:\\${SOCOM2_US_BOOT};1\r\nVER = 1.00\r\nVMODE = NTSC\r\n`)], 'SYSTEM.CNF') },
    { path: 'SOCOM2/RUN/UI/READERC.ZAR', file: new File([new Uint8Array(4)], 'READERC.ZAR') },
  ] });

  it('a folder the setup page opened is handed to mountFrontEnd as its request, with its source -- not refused as no image', async () => {
    window.history.replaceState(null, '', '/console?menuflow=x');
    const request = folder();
    const assets = await openFrontEndDisc(request);
    publishDiscImage(document, assets);
    publishDisc(document, { state: 'ready', filename: 'SOCOM2' });
    const mount = vi.fn((): FrontEndMount => ({ canvas: document.createElement('canvas'), status: '', session: Promise.resolve(null), stop: () => {} }));
    const session = { signOut: async () => {}, end: () => {} } as unknown as ModernSession;
    const launch = liveLaunch(document, { session, mount: mount as never, base: '/', sheets: [], loadSheet: async () => {} });
    const r = await launch.run({ suspend: () => {}, resume: () => {}, takeDown: () => {} });
    expect(r).toEqual({ ok: true });
    expect(mount).toHaveBeenCalledTimes(1);
    const [, source, , opts] = mount.mock.calls[0] as unknown as [string, SourceRequest, Document, { assets: unknown }];
    expect(source).toBe(request);                                   // the very request opened, not a copy
    expect(opts.assets).toBe(assets);
    expect(readDisc(document)).toMatchObject({ state: 'in-game', filename: 'SOCOM2' });
  });
});
