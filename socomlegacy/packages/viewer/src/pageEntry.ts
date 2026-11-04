import type { AssetSource } from '@s2u/archive';
import { openFrontEndDisc, openFrontEndImage, setDiscState, watchDiscPrompt } from './discPrompt';
import { discLabel, discName, type DiscRequest } from './discSource';
import { PLAYTEST_SEGMENT, TEST_ROOM_SEGMENT } from '@s2u/ui';
import { mountFrontEnd, type FrontEndMount, type FrontEndMountOptions } from './frontEnd';
import { publishDiscImage } from './modern/discImage';
import { publishDisc } from './modern/discStore';
import { beforeLaunch } from './modern/launchGate';
import { routeSegmentsOfPath } from './menuRoutes';
import { startSource } from './source';
import type { LaunchSheetMount, LaunchSheetOptions } from './launchSettings/sheet';
import type { OverlayPage } from './modern/overlay';
import type { SourceRequest } from './worker';

/**
 * The page's entry decision (OT.R12 and OT.R19 in `docs/plans/2026-10-02-online-path-target.md`; the owner, 2026-10-03:
 * "when &menuflow is initiated, do not render the action game in any mode behind and proceed as you were"; 2026-10-04:
 * "remove the need now for &menuflow and make it the default. make all the old params for matches only relevant to a
 * new /testroom. the default load is the menu flow now"). `entry.ts`, `index.html`'s one script, hands the address
 * (`location.pathname + location.search`) here, and the **path** decides, relative to the page's base (Vite's `base`,
 * `/socomlegacy/` on the site, `/` in development, read as `./menuRoutes` reads it: `routeSegmentsOfPath`):
 *
 * - **at the base path, and every path whose first segment is not `testroom`** (`@s2u/ui`'s `TEST_ROOM_SEGMENT`, a
 *   reserved segment of the route table) the page is the front end alone, with no parameter asking for it;
 *   `menuflow=<dialog>.rdr` stays the developer's start dialog (`frontEndEntry`), a bare `menuflow` means nothing, and
 *   none of the map viewer's or the match's parameters is read -- their readers are all `./main`'s:
 *   `./main` -- the map viewer in every mode (explore, recom, play), the match's net page, the ARMORY, the HUD, the pad
 *   and touch, the world's render and workers, the `maps/index.json` and `/rooms` requests -- is **never imported**;
 *   the markup it would drive (`#view`, the disc page, the bar, the panel and its mode switch, the loading screen, the
 *   Controls popover, the touch layer, the tip) is **removed** from the body before the front end's module loads, and
 *   the page is black under the front end's 640 x 448 frame (the body's PS2-picture state, `ps2-look`: the body covers
 *   the viewport, `styles.css` `html, body { height: 100% }`). Removed, not hidden: the `hidden` attribute loses to the chrome's own `display` rules (`.s2u-overlay`,
 *   `body.touch #touch`), and an element that is not in the page cannot be drawn on, listened to or tabbed to; one
 *   loop, no stylesheet change, no new class. The front end makes its own canvas (`mountFrontEnd`) and needs nothing
 *   else of the document.
 *   **Without `?devmode`** (OT.R14, the owner, 2026-10-03 ~13:30Z: "We need to read everything from the disk from the
 *   iso as a rule, devmode is just a convenience"; web research 148) the front end reads the visitor's own disc image,
 *   as the map viewer does: the disc page (`#disc-page`, its file input and status line) is the one element kept and
 *   shown, the whole window its drop target (`./discPrompt`), and once the image opens (`openFrontEndImage`,
 *   `@s2u/archive`'s `IsoAssetSource`) the disc page goes and the front end mounts over a source backed by it -- the
 *   worker's `{ kind: 'iso', file }` request (`./worker` `SourceRequest`) with that `IsoAssetSource` as its `assets`.
 *   With `?devmode` the served tree is read as before (`./source` `startSource`).
 *   **CX-9b** (CX.R8, the owner, 2026-10-12: the console layout "becomes the new launcher default disposing of the old
 *   layout entirely but keeping the plumbing beneath it where useful"): the setup page of OT.R28 (`./startup`'s
 *   `Startup` and `./modern/launcher`'s frame over `#disc-page`, its START mounting the front end) is gone with the old
 *   layout; the launcher is the console's page at the base path (`./console`). This page, at `<base>setup`, is the
 *   plain disc page again: an image that opens takes the page down and mounts the front end over it at once (the
 *   opener, then the main menu), past the START boundary (`./modern/launchGate`).
 * - **at `<base>/testroom`** (and below it) `./main` is imported, the page as it was with every parameter it reads
 *   (OT.R9: "our original params can continue to exist") -- its one difference that the import is dynamic, so the
 *   viewer's script runs after the document's `load` event, not before it -- and the front end is never mounted.
 *   The test room keeps its direct path for development (OT.R28): the disc page is the viewer's own disc page code's
 *   (`./ui` `Ui.onDisc`), and an image loads at once.
 * - **PTT-9, the launch settings** (web sprint 37, W37.R6; research 243 §9; LAUNCH_SETTINGS_ADAPTATION), on a
 *   **development build only**: `<base>/testroom` with no parameter at all, or with `launch` (bare, or any value but
 *   `off`; `wantsLaunchSheet`), shows the launch settings sheet (`./launchSettings/sheet`) instead of importing `./main`,
 *   and its Launch goes to the address it built -- the test room as above; `<base>/playtest` (`@s2u/ui`'s
 *   `PLAYTEST_SEGMENT`, reserved beside the test room's) shows the same sheet in playtest mode. A test room link WITH
 *   parameters (`launch=off` among them) is the page it was: `./main`, nothing else. The sheet's loader is made under a
 *   literal `import.meta.env.DEV` and is a dynamic import (`PAGE_LOADERS.launchSettings`), as the keyboard's sites are
 *   (OT.R29): a release and the demo have no loader, so there `/testroom` with no parameter is the test room and
 *   `/playtest` the front end, as before.
 *
 * - **MU2-10, the modern UI's overlay** (MU2.R4 of `docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`;
 *   `MODERN_OVERLAY_ADAPTATION`, a browser adaptation): every page this entry boots is "the active page" and takes the
 *   overlay, once, after it has booted (`mountOverlayOver`, the one seam: `PAGE_LOADERS.overlay`, in every build) -- the
 *   forge's page among them since MU2-17 (MU2.R9: its kind handed on as before, and the overlay now takes it); the
 *   console launcher at the base path never passes this entry, so it is never under it. A failure to load or mount it
 *   is said and never fails the page.
 *
 * A browser adaptation: the page's wiring, nothing of the game.
 */

/** What the entry loads: `./main` (the viewer) or `./frontEnd` (the front end); the tests hand in their own. */
export interface PageLoaders {
  /** The map viewer and the match, as the page was: `import('./main')`, the one chunk the front end never loads. */
  main: () => Promise<unknown>;
  /** The front end's module (`./frontEnd`): its `mountFrontEnd`. */
  frontEnd: () => Promise<{ mountFrontEnd: (search: string, source: SourceRequest | null, doc: Document, opts?: FrontEndMountOptions) => FrontEndMount | null }>;
  /** Opens the visitor's image for the front end (OT.R14); absent, `./discPrompt` `openFrontEndImage`. Refuses in the reader's words. */
  openDisc?: (file: File) => Promise<AssetSource>;
  /** PTT-9: the launch settings sheet (`./launchSettings/sheet`), a development build's only (absent in a release). */
  launchSettings?: () => Promise<{ mountLaunchSettings: (o: LaunchSheetOptions) => LaunchSheetMount }>;
  /** MU2-10: the modern UI's overlay (`./modern/overlay`), mounted over the page once it has booted; absent, none. */
  overlay?: () => Promise<{ mountPageOverlay: (doc: Document, page: OverlayPage) => unknown }>;
  /** FORGE (the owner, 2026-10-12; in every build since FG.R9): the forge (`./forge/page`). */
  forge?: () => Promise<{ mountForge: (doc: Document) => Promise<void> }>;
}

/**
 * The page's own loaders. `./frontEnd` is imported statically above for the decision (`frontEndEntry`), so its loader
 * answers with that module rather than a second, dynamic `import('./frontEnd')` of the same chunk (which the build
 * warns is moot); `./main` is the dynamic import, and is what the split is for.
 */
export const PAGE_LOADERS: PageLoaders = {
  main: async () => {
    const main = await import('./main');
    void import('./agent/testroomInstall').then(m => m.mountTestroomAgent(document)).catch(e => console.error('test-room agent: not mounted', e));
    return main;
  },
  frontEnd: async () => ({ mountFrontEnd }),
  overlay: () => import('./modern/overlay'),                       // MU2-10 (MU2.R4): a release feature, every build
};
/** PTT-9 (W37.R6): the launch settings sheet, a development build's only -- folded out of a release and the demo. */
if (import.meta.env.DEV) PAGE_LOADERS.launchSettings = () => import('./launchSettings/sheet');
/**
 * FORGE (FG.R9, the owner 2026-10-13: "Ship in release, + controller"; OT.R52 at the landing): the forge in every build.
 * Its keyboard and its captured-mouse look stay a development build's inside it (OT.R29 / OT.R38).
 */
PAGE_LOADERS.forge = async () => {
  const page = await import('./forge/page');
  // FUI-1 (FUI.R3): the agent dock, a registered panel in every build -- loaded beside the page, placed after Settings.
  // R4: handed the page's own local packs (`ForgePageServices`), the Assets panel's too; the page disposes them.
  return { mountForge: async doc => {
    const install = import('./agent/install');
    install.catch(() => undefined);         // the page logs a failed panel; a page that never reaches it leaves no unhandled rejection
    await page.mountForge(doc, { panels: [({ packs }) => install.then(m => m.forgeAgentPanel({ packs }))] });
  } };
};

/**
 * Which entry the page took: the viewer (`/testroom`); the front end, mounted at once over the served tree
 * (`?devmode`); or the front end's disc page without it (OT.R14), whose `mount` settles once the visitor's image has
 * opened and the front end is mounted over it.
 */
export type PageEntry = { entry: 'viewer' } | { entry: 'front-end'; mount: FrontEndMount | null } | { entry: 'disc'; mount: Promise<FrontEndMount | null> }
  | { entry: 'launch-settings'; mount: LaunchSheetMount } | { entry: 'forge' };

/** The path the page is served under (Vite's `base`, `VIEWER_BASE`: `/socomlegacy/` on the site, `/` in development). */
const PAGE_BASE: string = import.meta.env.BASE_URL ?? '/';
/** The served tree's root, as `main.ts` has it: `maps/` under the site's base (`VIEWER_BASE`). */
const MAPS = `${PAGE_BASE}maps`;

/** The address split as the entry reads it. */
export interface PageAddress {
  /** The page is the test room: the path's first segment under `base` is `TEST_ROOM_SEGMENT` (OT.R19). */
  testRoom: boolean;
  /** PTT-9: the page is the playtest's launch settings: the first segment under `base` is `PLAYTEST_SEGMENT`. */
  playtest: boolean;
  /** The query, as `location.search` has it (`''` or `?...`). */
  search: string;
}

/**
 * Reads an address -- a path and its query (`location.pathname + location.search`), or a query alone, which is the
 * base path's -- against the page's base: the test room when its first segment is `testroom`, else the front end's
 * page (a path outside the base too). Never throws.
 */
export function readPageAddress(address: string, base: string = PAGE_BASE): PageAddress {
  const b = base.endsWith('/') ? base : `${base}/`;
  let url: URL;
  // A path, never a URL: a leading `//` would be read as a host (`//evil.com/testroom`), so the slashes collapse to one.
  const path = address.replace(/^[\\/]{2,}/, '/');
  try { url = new URL(path, `http://page${b}`); } catch { return { testRoom: false, playtest: false, search: '' }; }
  const first = routeSegmentsOfPath(url.pathname, b)[0];
  return { testRoom: first === TEST_ROOM_SEGMENT, playtest: first === PLAYTEST_SEGMENT, search: url.search };
}

/** FORGE: the forge's path segment (`<base>forge`, `vite.config.ts` `PAGE_ROUTES`). */
export const FORGE_SEGMENT = 'forge';

/** FORGE: whether `address` is the forge's page -- its first segment under `base`, read as `readPageAddress` reads. */
export function isForgeAddress(address: string, base: string = PAGE_BASE): boolean {
  const b = base.endsWith('/') ? base : `${base}/`;
  try { return routeSegmentsOfPath(new URL(address.replace(/^[\\/]{2,}/, '/'), `http://page${b}`).pathname, b)[0] === FORGE_SEGMENT; } catch { return false; }
}

/**
 * CX-9a: the old page's own path segment. Since the console launcher took the base path (CX.R8, the owner, 2026-10-12)
 * this page is served at `<base>setup` (`vite.config.ts` `projectRoutes`); the front end's menu router would read
 * "setup" as an unknown place and land on the main menu past the boot and the intro, so the front end is mounted at the
 * base, the query and the fragment kept (`mountAtBase`), as it was when this page was the base path's.
 */
export const SETUP_SEGMENT = 'setup';

/** CX-9a: at `<base>setup`, the address made the base's (the query and the fragment as they are) just before the mount. */
function mountAtBase(doc: Document, address: string, base: string): () => void {
  const b = base.endsWith('/') ? base : `${base}/`;
  let first: string | undefined;
  try { first = routeSegmentsOfPath(new URL(address.replace(/^[\\/]{2,}/, '/'), `http://page${b}`).pathname, b)[0]; } catch { first = undefined; }
  const win = doc.defaultView;
  if (first !== SETUP_SEGMENT || !win) return () => {};
  return () => { win.history.replaceState(win.history.state, '', `${b}${win.location.search}${win.location.hash}`); };
}

/** PTT-9: the launch settings sheet's own key (`?launch`; `launch=off` goes past the sheet). */
export const LAUNCH_PARAM = 'launch';

/**
 * PTT-9: whether the test room's address asks for the launch settings sheet: no parameter at all, or `launch` present
 * with any value but `off`. Never throws (a query that does not read asks for nothing).
 */
export function wantsLaunchSheet(search: string): boolean {
  try {
    const q = new URLSearchParams(search);
    if ([...q.keys()].length === 0) return true;
    return q.has(LAUNCH_PARAM) && q.get(LAUNCH_PARAM) !== 'off';
  } catch {
    return false;
  }
}

/**
 * The front end's page: the viewer's markup gone, black behind the front end's frame. The black is the page's own
 * PS2-picture state (`styles.css` `body.ps2-look`: "the 640x448 frame on a 4:3 box, letterboxed in black", the
 * system's `--s2u-ground-deep`), which is what the front end's frame is; the design system owns the colour, so no
 * inline style (`test/chrome_classes.test.ts`).
 */
function clearPage(doc: Document, ...keep: (Element | null)[]): void {
  for (const el of Array.from(doc.body.children)) if (!keep.includes(el)) el.remove();
  doc.body.classList.add('ps2-look');
}

/**
 * Boots the page for `address` (`location.pathname + location.search`; `readPageAddress`): the viewer at
 * `<base>/testroom`, else the front end alone. The served tree is still `?devmode`'s to grant (`./source`
 * `startSource`, the owner's rule of 2026-09-29).
 */
export async function bootPage(address: string, doc: Document = document, loaders: PageLoaders = PAGE_LOADERS, base: string = PAGE_BASE): Promise<PageEntry> {
  const entry = await bootEntry(address, doc, loaders, base);
  await mountOverlayOver(doc, entry, loaders);
  return entry;
}

/**
 * MU2-10's seam (MU2.R4): the overlay over the page `entry` booted -- its kind, and on the front end's pages its mount
 * (the disc page's promise of it), through which the overlay reads the game's own account and its match. Awaited, so
 * the page's boot settles with it in place; a failure (a navigation aborting the chunk) is said, never the boot's.
 */
async function mountOverlayOver(doc: Document, entry: PageEntry, loaders: PageLoaders): Promise<void> {
  if (!loaders.overlay) return;
  try {
    const overlay = await loaders.overlay();
    overlay.mountPageOverlay(doc, { kind: entry.entry, frontEnd: entry.entry === 'front-end' || entry.entry === 'disc' ? entry.mount : null });
  } catch (e) {
    console.error('overlay: not mounted over the page', e);
  }
}

/** The page itself, as `bootPage` boots it (above). */
async function bootEntry(address: string, doc: Document, loaders: PageLoaders, base: string): Promise<PageEntry> {
  const { testRoom, playtest, search } = readPageAddress(address, base);
  if (loaders.forge && isForgeAddress(address, base)) {
    const forge = await loaders.forge();
    await forge.mountForge(doc);
    return { entry: 'forge' };
  }
  if (import.meta.env.DEV && loaders.launchSettings && (playtest || (testRoom && wantsLaunchSheet(search)))) {
    const sheet = await loaders.launchSettings();
    return { entry: 'launch-settings', mount: sheet.mountLaunchSettings({ doc, mode: playtest ? 'playtest' : 'testroom', search, base }) };
  }
  if (testRoom) {
    doc.body.classList.add('test-room');
    await loaders.main();
    return { entry: 'viewer' };
  }
  const served = startSource(search, MAPS);
  const page = served ? null : doc.getElementById('disc-page');
  clearPage(doc, page);
  const frontEnd = await loaders.frontEnd();
  const atBase = mountAtBase(doc, address, base);
  if (served || !page) { atBase(); return { entry: 'front-end', mount: frontEnd.mountFrontEnd(search, served, doc) }; }
  return { entry: 'disc', mount: offerDisc(doc, page, (source, assets) => { atBase(); return frontEnd.mountFrontEnd(search, source, doc, { assets }); }, loaders.openDisc ?? openFrontEndImage) };
}

/**
 * OT.R14's disc page: shown (`Ui.offerDisc`'s `hidden = false`) and answering every image chosen or dropped; each is
 * opened in turn, the last one chosen winning, and said on the page's line as the viewer says it (`main.ts`
 * `openDisc`: "reading the disc image X ..."; a refusal as the worker's `doing` and the reader's words, `is-bad`). The
 * first that opens takes the disc page down (`Ui.hideDiscPage`, here removed: nothing else will show it) and mounts the
 * front end over it (CX-9b: the setup page of OT.R28, whose START stood between the two, is gone with the old layout).
 * The image that opened is also published for the modern UI (`./modern/discImage`, MU-4b / MU-5b; a browser
 * adaptation), and cleared when the next image is read or one is refused: a record of what is already held, which
 * changes neither the order above nor what the front end is mounted over. The disc's state goes to the modern UI's
 * disc store (`./modern/discStore`, OV-1; MU.R23 (4)): the reading and the refusal, and the launch's `in-game` (the
 * disc is still in, the front end has the window). A record again: nothing of the order or the mount changes.
 * Every launch passes the page's START boundary (`./modern/launchGate`, MU-F2a) before the page goes: when the modern UI
 * has a session to end it is awaited (bounded by LOGOUT_TIMEOUT_MS); otherwise the launch runs at once, as it did.
 */
function offerDisc(doc: Document, page: HTMLElement, mount: (source: SourceRequest, assets: AssetSource) => FrontEndMount | null,
  open: (file: File) => Promise<AssetSource>): Promise<FrontEndMount | null> {
  page.hidden = false;
  return new Promise((resolve) => {
    let latest: DiscRequest | null = null;
    // DA-4: an image goes to `open` as before; a folder dropped on the window (`./discPrompt` `watchDiscPrompt`'s
    // `onFolder`; the visible folder chooser is the console launcher's, `folderRequestFromInput`) to `openFrontEndDisc`
    // (DA-3: its SYSTEM.CNF checked first, DA.R8). Either is named by `./discSource` `discName` / `discLabel`: an image
    // by its file name as before, a folder by its own (a drive's, a volume's or a folder's) name.
    const take = (disc: DiscRequest): void => {
      latest = disc;
      const name = discName(disc), label = discLabel(disc);
      publishDiscImage(doc, null);
      publishDisc(doc, { state: 'reading', filename: name });
      setDiscState(page, `reading ${label} ...`);
      (disc.kind === 'iso' ? open(disc.file) : openFrontEndDisc(disc)).then((assets) => {
        if (latest !== disc || !page.isConnected) return;
        publishDiscImage(doc, assets);
        const go = (): void => {
          if (!page.isConnected) return;
          page.remove();
          publishDisc(doc, { state: 'in-game', filename: name });
          resolve(mount(disc, assets));
        };
        // The START boundary (MU-F2a; `./modern/launchGate`): what the modern UI registered ends first -- its session's
        // logout awaited, bounded -- so the original's LOGIN is not refused for an account still held. Nothing to wait
        // for (signed out, offline, the modern UI never loaded): mounted at once, in this same call, as before. No image
        // is taken while it waits (`detach` first): the one that opened is the one mounted.
        detach();
        const wait = beforeLaunch(doc);
        if (wait) void wait.then(go); else go();
      }, (e: unknown) => {
        if (latest !== disc || !page.isConnected) return;
        publishDiscImage(doc, null);
        const words = e instanceof Error ? e.message : String(e);
        const line = `failed while reading ${label}: ${words}`;
        publishDisc(doc, { state: 'error', filename: name, refusal: words });   // MU2-8: the reader's bare words, as the console's error() holds them
        setDiscState(page, line, 'error');
      });
    };
    const detach = watchDiscPrompt(doc, page, (file) => { take({ kind: 'iso', file }); }, take);
  });
}
