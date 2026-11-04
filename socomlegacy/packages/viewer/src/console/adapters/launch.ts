import type { AssetSource } from '@s2u/archive';
import { openedDiscRequest } from '../../discPrompt';
import { assetSourceFor, discName, type DiscRequest } from '../../discSource';
import { KEPT_DISC_TITLE } from './disc';
import { mountFrontEnd, type FrontEndMount, type FrontEndMountOptions } from '../../frontEnd';
import { openedDiscImage } from '../../modern/discImage';
import { publishDisc, readDisc } from '../../modern/discStore';
import { beforeLaunch } from '../../modern/launchGate';
import { pageSession, type ModernSession } from '../../modern/session';
import type { OverlayPage } from '../../modern/overlay';
import type { SourceRequest } from '../../worker';
import type { Adapters, LaunchPage, LaunchResult } from '../state';
import { skipMenuEntry, skipMenuOn } from '../skipMenu';
// The game page's own stylesheets, as `setup/index.html` links them beside the design system's (the build emits each as an
// asset: neither has an import or a url() to rewrite).
import STYLES_HREF from '../../styles.css?url';
import STARTUP_HREF from '../../startup.css?url';

/** The game page's own stylesheets (`setup/index.html`'s, beside the design system's), the build's addresses. */
export const GAME_SHEETS: readonly string[] = [STYLES_HREF, STARTUP_HREF];

/**
 * The console launcher's hand-over (slice 3, CX-6): START gives the window to the original's front end, in the current
 * launcher's order and with its arguments -- nothing of the game's own flow changes:
 *
 * 1. the session's sign-out, awaited (as the retired modern Launch's `launch()` did, CX-25; H179: the original's LOGIN must find the
 *    account free; `signOut` ends the session here whatever the answer, bounded by LOGOUT_TIMEOUT_MS);
 * 2. the START boundary's hooks (`../../modern/launchGate` `beforeLaunch`, as `../../pageEntry` `offerDisc`'s launch runs
 *    them: whatever the page registered, awaited, bounded; the console registers no session there -- its sign-out is
 *    step 1, and its `end()` follows a mount that took, since `end()` cannot be undone);
 * 3. the disc store says `in-game` (`offerDisc`'s `go`: the disc is still in, the front end has the window);
 * 4. the game page made (`gamePage`: the base address, `setup/index.html`'s stylesheets, the root and the body as the entry
 *    leaves them), then `mountFrontEnd(search, request, document, { assets })`, exactly `offerDisc`'s call: the opened
 *    disc's request (`../../discPrompt` `openedDiscRequest`: the image's `{ kind: 'iso', file }`, or -- DA-4, opened on
 *    the setup page -- a folder's `{ kind: 'dir' }`) and the source opened over it (`../../modern/discImage`). The front end needs no id of `setup/index.html`'s -- it puts its own fixed 640 x 448 canvas in
 *    `document.body` -- but it does need the page's base address (its menu router reads the path) and `setup/index.html`'s
 *    stylesheets (`styles.css` places the match's loading screen, `#original-loading`). The console page stops reading its inputs just
 *    before the mount and takes its own markup down once the front end is up ("removed, not hidden", as the entry does).
 * 5. MU2-10 (MU2.R4; row MU2-10c): once the front end has the window and the console's markup is taken down, the modern
 *    UI's overlay is mounted over that game page (`../../modern/overlay` `mountPageOverlay`, `kind: 'front-end'`, the
 *    mount: the game's own account and its match read through it) -- the same call `../../pageEntry`'s seam makes for
 *    every page it boots; this hand-over never passes the entry. Never over the console page: no call before the
 *    take-down, none for a refused mount or a cancel. A failure to load it is said, never the launch's.
 *
 * DX-3 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6): with `start` (the page's: the disc
 * adapter's `discForStart`), the request in step 4 is the start's -- `{ kind: 'stored' }` when the disc's read set is
 * kept whole in this browser (with no chooser and no prompt; its source the stored one, `../../discStored`), else the
 * disc's own request as before -- asked after the boundary's hooks, before `in-game`.
 *
 * Circle before the mount cancels: nothing is mounted, the disc stays ready (the session is signed out already: the
 * sign-out is the first step). A refusal -- the image no longer open, the mount throwing or answering none -- is said in
 * one line; the disc store goes back to `ready` and the page reads its inputs again. A browser adaptation with no
 * original (OT.R28).
 */
export type LiveLaunch = NonNullable<Adapters['launch']>;

/**
 * The address flags handed to the front end: every key as written, `devmode` included. CX-6 (the slice-3 review,
 * finding 4) took `devmode` out to copy the old page's meaning of it (the served tree instead of an image); the CX-9a
 * fix round's ruling (B2, 2026-10-12) is that it is the game's key, not the launcher's -- the account and match-socket
 * routing to `server=` on a development build (`../../connectHost` `accountServiceBase`, OT.R22) and the front end's
 * development keys (`expMenu*`; MU2-10: no longer `overlay`, which the overlay over the game page does not read) read
 * it -- so it passes. The source is the opened disc either way: the mount
 * is handed the image's request, so `devmode` does not turn the served tree on here (`../../pageEntry` `startSource`
 * is the old page's). Only empty parts are dropped.
 */
export function isoSearch(search: string): string {
  // By string: every key passes exactly as written (`?menuflow` stays `?menuflow`, not `?menuflow=`).
  const keep = search.replace(/^\?/, '').split('&').filter((part) => part !== '');
  return keep.length ? `?${keep.join('&')}` : '';
}

export interface LaunchDeps {
  session?: ModernSession;
  /** The front end's mount; absent, `../../frontEnd`'s. */
  mount?: (search: string, source: SourceRequest | null, doc: Document, opts?: FrontEndMountOptions) => FrontEndMount | null;
  /** The site's base path (Vite's `BASE_URL`); absent, the build's. */
  base?: string;
  /** The game page's own stylesheets' addresses; absent, the build's (`styles.css`, `startup.css`). */
  sheets?: readonly string[];
  /** Waits for a stylesheet link to load (or fail); absent, its `load` / `error` event, bounded at SHEET_WAIT_MS. */
  loadSheet?: (link: HTMLLinkElement) => Promise<void>;
  /**
   * The opened disc and its source; absent, the page's (`openFrontEndDisc`'s request -- an image's or, DA-4, a folder's
   * -- and the published source).
   */
  image?: () => { request: DiscRequest; assets: AssetSource } | null;
  /**
   * DX-3: START's disc, `../../discStart` `discForStart` through the console's seams (`./disc` `start`); absent, `image`
   * (the opened disc, as before DX-3).
   */
  start?: () => Promise<SourceRequest>;
  /** MU2-10: the modern UI's overlay, mounted over the game page after the take-down; absent, its module (a dynamic import). */
  overlay?: () => Promise<{ mountPageOverlay: (doc: Document, page: OverlayPage) => unknown }>;
  /** SKIP-MENU (LR.R33): whether "Skip menu" is on; absent, this browser's saved choice (`../skipMenu` `skipMenuOn`). */
  skipMenu?: () => boolean;
}

/** The longest the hand-over waits for the game page's stylesheets: then the mount goes ahead (a sheet is not a refusal). */
export const SHEET_WAIT_MS = 5_000;

/** The body's classes on the game page when the front end mounts: `setup/index.html`'s, then the page entry's (`clearPage`). */
const GAME_BODY = 'panel-collapsed ps2-look';

export const waitSheet = (link: HTMLLinkElement): Promise<void> => new Promise((done) => {
  const t = setTimeout(done, SHEET_WAIT_MS);
  const end = (): void => { clearTimeout(t); done(); };
  link.addEventListener('load', end, { once: true });
  link.addEventListener('error', end, { once: true });
});

/**
 * The game page, made of the console page just before the mount (the whole-branch review's two blocks), and the way
 * back. (1) The address: the page's base with the query (every key, `devmode` included since the CX-9a fix round), so
 * the front end's menu router (`../../menuRoutes` `routeSegmentsOfPath`) reads no menu path -- at `/console` it read "console", an unknown path, and
 * landed on the main menu past the boot and the intro; the current launcher mounts at the base. Since CX-9a the console
 * is also what a menu flow's deep route is answered with (OT.R10): a path that names a menu place is kept, so the
 * router replays it (`./gamePath`), with the entry's history state; the query passes as written (`isoSearch`). (2) The stylesheets:
 * exactly `setup/index.html`'s set (the design system's, `styles.css` -- which places `#original-loading`, the match's
 * loading screen -- and `startup.css`) linked beside the design system's, each awaited; the console's own sheet stays
 * linked but inert: its rules apply only under `html[data-console]`, and the mark is dropped (a build's sheets are hashed
 * assets, so none is told apart by address). (3) The root and the body as the page
 * entry leaves them: no font-size or input mode of the console's, the body's classes `setup/index.html`'s and `ps2-look`.
 * SKIP-MENU (LR.R33, a browser adaptation): with `skipMenu`, a path that would be replaced by the base is LOGIN's route
 * instead (`../skipMenu` `SKIP_MENU_SEGMENTS`, `/main/online`), so the router replays the original's stack to LOGIN
 * TO SOCOM II ONLINE and builds it; a kept menu path (a link, an invite) still wins.
 */
export function gamePage(doc: Document, base: string, hrefs: readonly string[], load: (l: HTMLLinkElement) => Promise<void>, skipMenu = false): { search: string; ready: Promise<void>; undo(): void } {
  const win = doc.defaultView!;
  const html = doc.documentElement;
  const prior = { url: `${win.location.pathname}${win.location.search}${win.location.hash}`, state: win.history.state as unknown, style: html.getAttribute('style'), input: html.getAttribute('data-input'), body: doc.body.className };
  const search = isoSearch(win.location.search);
  // A kept path keeps the entry's state (the router's saved trail: Back after a reload at a menu route, N1); a replaced
  // one -- the console's own alias, an unknown path -- starts the game page's entry afresh, as before.
  const path = skipMenuEntry(win.location.pathname, base, skipMenu);
  win.history.replaceState(path === win.location.pathname ? prior.state : null, '', `${path}${search}${win.location.hash}`);
  // The console's own rules off: they apply only under its mark (`../console.css`); no sheet is told apart by address
  // (a build's are hashed assets), so the design system's is never at risk.
  const marked = html.hasAttribute('data-console');
  html.removeAttribute('data-console');
  const added = hrefs.map((href) => {
    const l = doc.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    doc.head.append(l);
    return l;
  });
  html.removeAttribute('style');
  html.removeAttribute('data-input');
  doc.body.className = GAME_BODY;
  return {
    search,
    ready: Promise.all(added.map(load)).then(() => undefined),
    undo(): void {
      win.history.replaceState(prior.state, '', prior.url);
      for (const l of added) l.remove();
      if (marked) html.setAttribute('data-console', '');
      if (prior.style === null) html.removeAttribute('style'); else html.setAttribute('style', prior.style);
      if (prior.input !== null) html.setAttribute('data-input', prior.input);
      doc.body.className = prior.body;
    },
  };
}

export function liveLaunch(doc: Document, deps: LaunchDeps = {}): LiveLaunch {
  const session = deps.session ?? pageSession();
  const mount = deps.mount ?? mountFrontEnd;
  const overlay = deps.overlay ?? ((): Promise<{ mountPageOverlay: (doc: Document, page: OverlayPage) => unknown }> => import('../../modern/overlay'));
  const image = deps.image ?? ((): { request: DiscRequest; assets: AssetSource } | null => {
    const request = openedDiscRequest();
    const assets = openedDiscImage(doc);
    return request && assets ? { request, assets } : null;
  });
  let run = 0;

  return {
    async run(page: LaunchPage): Promise<LaunchResult> {
      const mine = ++run;
      const live = (): boolean => mine === run;
      try { await session.signOut(); } catch { /* ended here whatever the answer (launch.ts) */ }
      if (!live()) return { ok: false, cancelled: true };
      const wait = beforeLaunch(doc);
      if (wait) await wait;
      if (!live()) return { ok: false, cancelled: true };
      let opened: { request: SourceRequest; assets: AssetSource } | null;
      if (deps.start) {
        let request: SourceRequest | null = null;
        let refused = '';
        try { request = await deps.start(); } catch (e) { refused = e instanceof Error ? e.message : String(e); }
        if (!live()) return { ok: false, cancelled: true };
        if (refused) return { ok: false, error: refused };
        // The kept extraction's source (the stored request's own); a disc's, the one opened on the page.
        opened = !request ? null : request.kind === 'stored' ? { request, assets: assetSourceFor(request) }
          : { request, assets: openedDiscImage(doc) ?? assetSourceFor(request) };
      } else opened = image();
      if (readDisc(doc).state !== 'ready' || !opened) return { ok: false, error: 'The disc image is no longer open: choose it again' };
      const filename = opened.request.kind === 'stored' ? KEPT_DISC_TITLE : opened.request.kind === 'http' ? null : discName(opened.request);
      page.suspend();
      const game = gamePage(doc, deps.base ?? String((import.meta.env as Record<string, unknown> | undefined)?.['BASE_URL'] ?? '/'), deps.sheets ?? GAME_SHEETS, deps.loadSheet ?? waitSheet, (deps.skipMenu ?? skipMenuOn)());
      await game.ready;
      publishDisc(doc, { state: 'in-game', filename });
      let m: FrontEndMount | null = null;
      let why = '';
      try { m = mount(game.search, opened.request, doc, { assets: opened.assets }); }
      catch (e) { why = e instanceof Error ? e.message : String(e); }
      if (!m) {
        game.undo();
        publishDisc(doc, { state: 'ready', filename });
        page.resume();
        return { ok: false, error: why ? `The game could not start: ${why}` : 'The game could not start' };
      }
      // The front end has the window: the session takes no attempt from now on (`end()`, the START boundary's contract,
      // `../../modern/session`). Called here, after the mount, never before it: `end()` cannot be undone, and a START
      // that did not mount leaves the launcher -- and its sign-in -- as they were (the slice-3 review, finding 2).
      session.end?.();
      page.takeDown();
      // MU2-10 (row MU2-10c): the overlay over the game page the hand-over made -- never over the console (taken down above).
      const game_ = m;
      void overlay().then((o) => { o.mountPageOverlay(doc, { kind: 'front-end', frontEnd: game_ }); }).catch((e: unknown) => { console.error('overlay: not mounted over the game', e); });
      return { ok: true };
    },
    cancel(): void { run++; },
  };
}
