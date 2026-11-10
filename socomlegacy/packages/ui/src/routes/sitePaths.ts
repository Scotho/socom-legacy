/**
 * The site's path table (the lobby links plan's URL pathing consolidation; the owner's "the URL pathing
 * consolidation(s)", 2026-10-23, the merge controller's scope): who answers each first segment under the page's base.
 * One module owns it. The launcher's routes (`packages/viewer/src/console/routes.ts`) and Vite's page routes
 * (`packages/viewer/vite.config.ts`) read it; nginx (`deploy/nightly/nginx.conf`, `deploy/central/nginx.conf`) and the
 * hostname's route list (`deploy/pages/routes.json`) are held to it by a test (`viewer/test/sitePaths.test.ts`), not
 * generated from it. A browser adaptation: nothing here is a menu place.
 */

/**
 * The test room's first segment (OT.R19, the owner, 2026-10-04: "make all the old params for matches only relevant to a
 * new /testroom. the default load is the menu flow now"): `<base>testroom` is the map viewer's and the match's page with
 * every parameter they read; every other path under the base is the front end's (`packages/viewer/src/pageEntry.ts`).
 * A browser adaptation: the page's wiring, nothing of the game.
 */
export const TEST_ROOM_SEGMENT = 'testroom';
/** The playtest's launch settings (PTT-9, W37.R6; a development build's page, `packages/viewer/src/pageEntry.ts`). */
export const PLAYTEST_SEGMENT = 'playtest';
/**
 * Names the site serves under the page's base (`shared/deploy/site/nginx.conf`'s `/socomlegacy/maps/` and
 * `/socomlegacy/assets/`, the build's `fmv/` and `fonts/`, Vite's `src/` in development), and the test room's
 * (`TEST_ROOM_SEGMENT`, OT.R19): a first segment never takes one.
 */
export const RESERVED_ROUTE_SEGMENTS: readonly string[] = ['maps', 'assets', 'fmv', 'fonts', 'src', 'index.html', 'favicon.ico', TEST_ROOM_SEGMENT, PLAYTEST_SEGMENT];

/** The game's router: the menu flow's deep paths (`main/...`, OT.R10) and the disc picker's (`d/...`). */
export const GAME_FIRST: readonly string[] = ['main', 'd'];

/** The launcher's own pages (CX-33): `/online/...`, `/watch`, `/profile/...`, `/settings/...`, `/experiments`. */
export const LAUNCHER_FIRST: readonly string[] = ['online', 'watch', 'profile', 'settings', 'experiments'];

/**
 * The project pages, each its own document (`<page>/index.html`). `agent` (FP-14, FP.R10; a browser adaptation): the agent
 * connection's public setup, MC-12's route, steps 1 and 2 before the Forge is open.
 */
export const PROJECT_PAGES: readonly string[] = ['news', 'roadmap', 'journey', 'archive', 'server', 'status', 'agent'];

/**
 * The stats pages (the LIVE cards plan, LCM.R10, R11): each its own document (`<page>/index.html`) in the project site's
 * shell, reading central's public routes -- `/leaderboard` (LCM-11b). Not a project page (no generated section), but since
 * LCM-16 (LCM.R18 (e)) the project-site nav's seventh link, Leaderboard.
 * A browser adaptation: nothing here is a menu place.
 */
export const STATS_PAGES: readonly string[] = ['leaderboard'];

/** The console launcher's first address (CX-2), an alias of the base path since CX-9a. */
export const LAUNCHER_ALIASES: readonly string[] = ['console'];

/** The game page's own document (CX-9a). */
export const GAME_PAGE_FILE = 'setup/index.html';

/**
 * The paths the game page answers (`GAME_PAGE_FILE`): `/setup` itself, and the test room (OT.R19), the playtest's launch
 * settings (PTT-9) and the forge (FG.R9) with every path below them.
 */
export const GAME_PAGES: readonly { readonly page: string; readonly below: boolean }[] = [
  { page: 'setup', below: false },
  { page: TEST_ROOM_SEGMENT, below: true },
  { page: PLAYTEST_SEGMENT, below: true },
  { page: 'forge', below: true },
];

/** A page route as the dev server's rewrite takes it (`vite.config.ts` `projectRoutes`). */
export interface SitePageRoute { readonly page: string; readonly file: string; readonly below?: true }

/** Every page route: the project pages, the stats pages, the launcher's alias, the game page's paths. */
export function sitePageRoutes(): SitePageRoute[] {
  return [
    ...PROJECT_PAGES.map((page) => ({ page, file: `${page}/index.html` })),
    ...STATS_PAGES.map((page) => ({ page, file: `${page}/index.html` })),
    ...LAUNCHER_ALIASES.map((page) => ({ page, file: 'index.html' })),
    ...GAME_PAGES.map((g) => (g.below ? { page: g.page, file: GAME_PAGE_FILE, below: true as const } : { page: g.page, file: GAME_PAGE_FILE })),
  ];
}

/**
 * The first segments the server answers rather than the page: the match server's and central's routes (nginx's
 * proxied locations, `routes.json`'s box rows and its off-list), and the box's own (`/metrics`, the maps tree, the HD
 * pack's tree: HD.R8, OT.R92).
 * Multi-segment server paths under a page segment are `SERVER_PREFIXES`.
 */
export const SERVER_FIRST: readonly string[] = [
  'ws', 'health', 'rooms', 'maps', 'replays', 'account', 'lobby', 'clan', 'texts', 'modern', 'metrics', 'hosts', 'api', 'dev', '.well-known',
  'experimental-packs',
  'client-errors',   // the client error beacon (part B): central's intake, on the box only (the Worker's /api/client-error is under 'api')
];

/** Static files the site serves under the base besides the build's own (`RESERVED_ROUTE_SEGMENTS`): the startup page's. */
export const STATIC_FIRST: readonly string[] = ['startup'];

/** The share links (LINK-2; the forge's): the page's path, its head the server's for the lobby's. */
export const LOBBY_LINK_SEGMENTS = ['online', 'lobby'] as const;
export const FORGE_LINK_SEGMENTS = ['forge', 'lobby'] as const;

/**
 * LCM-8: the match page `/match/<id>` (the LCM plan; the design's Part 8): since LCM-16 its own document in the site's
 * shell (`leaderboard/match/index.html`, central's `MATCH_PAGE_DOCUMENT`), never the launcher's; its head central's
 * (`matchPageHttp.ts` injects the match's link preview), so a server prefix whose first segment the launcher never writes.
 */
export const MATCH_PAGE_SEGMENT = 'match';

/**
 * LCM-12: the player page `/player/<name>` (the LCM plan; LCM.R10): since LCM-16 its own document in the site's shell
 * (`leaderboard/player/index.html`, central's `PLAYER_PAGE_DOCUMENT`), never the launcher's; its head central's
 * (`playerPageHttp.ts` injects the player's link preview), so a server prefix whose first segment the launcher never writes.
 */
export const PLAYER_PAGE_SEGMENT = 'player';

/** Server paths below a page's or the launcher's segment: the lobby link's page (central injects its head) and its card. */
export const SERVER_PREFIXES: readonly string[] = [`/${LOBBY_LINK_SEGMENTS.join('/')}/`, '/api/lobby/', `/${MATCH_PAGE_SEGMENT}/`, `/${PLAYER_PAGE_SEGMENT}/`];

/** Every first segment the launcher's table may never write: the game's, the pages', the server's and the files'. */
export function reservedFirstSegments(): string[] {
  return [...new Set([
    ...GAME_FIRST,
    ...RESERVED_ROUTE_SEGMENTS,
    ...sitePageRoutes().map((r) => r.page),
    ...SERVER_FIRST,
    ...STATIC_FIRST,
    MATCH_PAGE_SEGMENT,   // LCM-8: the match page's, the server's head
    PLAYER_PAGE_SEGMENT,  // LCM-12: the player page's, the server's head
  ])];
}
