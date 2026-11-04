import { routeSegmentsOfPath } from '../menuRoutes';
import { devSwitches } from '../source';
import { GAME_SHEETS, gamePage, waitSheet } from './adapters/launch';
import { classifyLauncherPath } from './routes';

/**
 * The console page's entry decision (CX-9a fix round, the review's B1). Since the console launcher is the base path's
 * page (CX.R8), the address the old page leaves after it mounts the game -- the base and the menu flow's route, with
 * `?devmode` when the game runs over the served tree -- is answered with the console on a reload, and the console waits
 * for a disc: the served tree and the router's saved trail were lost on F5 (the owner's two-window link; the e2e specs
 * that reload after booting through `/setup`). So on a **development build** (`dev`, `import.meta.env.DEV`), with
 * the served-maps switch in the address (`../source` `devSwitches` `served`: `served`, or `devmode` which includes it) and the served tree
 * answering (`served`, `servedTree`), the console page does not show itself: it becomes the game page as the hand-over
 * makes it (`./adapters/launch` `gamePage`: the old page's stylesheets, the console's rules off, the path and the
 * entry's history state kept when it names a menu place) and boots the game through the old page's own entry (`game`,
 * absent `../pageEntry` `bootPage`: the served tree's entry, mounted at once; the router reads the path and replays the
 * state's trail). Anything else shows the console (`console`): no `devmode`, no served tree, a release build, and the
 * console's own alias `<base>console` (so the console can be looked at on a development server with `devmode`), and a
 * launcher path (LATER 184: `./routes` `classifyLauncherPath` 'ours' -- `/settings/audio`, `/online/...`, CX-33's
 * paths, which no game route takes -- whose refresh had booted the game; the bare base, the game's `main/` and `d/`, and
 * an entry whose state is the game's menu trail stay the game's).
 * The served-tree probe is new here, not the old page's: with `devmode` and no tree the old page mounted the tree
 * anyway and the front end failed to load; the console shows instead. The probe is bounded (`SERVED_TREE_TIMEOUT_MS`):
 * a dev server that does not answer is no tree, so the page is never left blank.
 * A development adaptation with no original (OT.R28; nothing of the game's flow changes).
 */
export interface LauncherEntryDeps {
  /** A development build (`import.meta.env.DEV`). */
  dev: boolean;
  /** The page's base (Vite's `BASE_URL`). */
  base: string;
  /** Whether the served tree answers under `base`; absent, `servedTree`. */
  served?: (base: string) => Promise<boolean>;
  /** Boots the game at `address` (path and query) as the old page does; absent, `../pageEntry` `bootPage`. */
  game?: (address: string, doc: Document) => Promise<unknown>;
  /** Shows the console launcher (`./app` `bootConsole`). */
  console: () => void;
  /** The game page's stylesheets; absent, the build's (`GAME_SHEETS`). */
  sheets?: readonly string[];
  /** Waits for a stylesheet; absent, `waitSheet`. */
  loadSheet?: (link: HTMLLinkElement) => Promise<void>;
}

/**
 * The longest the served-tree probe waits (N4): a loopback dev server answers a HEAD of a static file in milliseconds,
 * so two seconds is a stall, not a slow answer; past it the console shows. A development adaptation's own bound (no
 * original).
 */
export const SERVED_TREE_TIMEOUT_MS = 2_000;

/**
 * Whether the served, extracted tree answers under `base`: `maps/index.json` (`../source`: "the served tree ... if
 * `maps/index.json` answers") asked by HEAD as JSON, so the dev server's HTML fallback never answers for it (a 200 of
 * HTML is no tree), within `ms` (`SERVED_TREE_TIMEOUT_MS`). Any failure, the timeout included, is no tree.
 */
export async function servedTree(base: string, ms: number = SERVED_TREE_TIMEOUT_MS): Promise<boolean> {
  const b = base.endsWith('/') ? base : `${base}/`;
  try {
    const res = await fetch(`${b}maps/index.json`, { method: 'HEAD', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
    return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

/** Decides the page: the game over the served tree (see above), else the console. */
export async function bootLauncher(doc: Document, deps: LauncherEntryDeps): Promise<'game' | 'console'> {
  const win = doc.defaultView;
  const shown = (): 'console' => { deps.console(); return 'console'; };
  if (!win || !deps.dev || !devSwitches(win.location.search, deps.dev).served || routeSegmentsOfPath(win.location.pathname, deps.base)[0] === 'console') return shown();
  if (routeSegmentsOfPath(win.location.pathname, deps.base).length > 0
    && classifyLauncherPath(win.location.pathname, deps.base, win.history.state) === 'ours') return shown();   // LATER 184
  if (!(await (deps.served ?? servedTree)(deps.base))) return shown();
  const game = gamePage(doc, deps.base, deps.sheets ?? GAME_SHEETS, deps.loadSheet ?? waitSheet);
  await game.ready;
  // Every body child of the console page goes with the old page's own `clearPage` (`../pageEntry`), as at a mount.
  const boot = deps.game ?? (async (address: string, d: Document) => (await import('../pageEntry')).bootPage(address, d, undefined, deps.base));
  await boot(`${win.location.pathname}${win.location.search}`, doc);
  return 'game';
}
