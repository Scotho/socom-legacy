import { execFileSync } from 'node:child_process';
import { sonyNoticePlugin } from './sonyNotice';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { dsAlias, fontsAlias, shipFontLicences } from '../../../shared/vite';
import { fmvPlugin } from '../../tools/fmvShip';
import { describeLobby, injectLobbyHead, isLobbyId, lobbyStateHash, lobbyStateMaterial, publicLobbyFromJson, withId } from '../central/src/lobbyCard';
import { sitePageRoutes } from '../ui/src/routes/sitePaths';
import { devLocalProxy } from './devProxy';
import { pwaPlugin } from './pwaPlugin';
import { releaseVersion } from './releaseVersion';

const here = fileURLToPath(new URL('.', import.meta.url));
const webRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The revision the build came from, for the panel's About (`src/revision.ts`): the short hash, with
 * `-dirty` when anything under `socomlegacy/` differs from it, and `unknown` when git is not there to ask.
 */
function gitRevision(): string {
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: webRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const hash = git('rev-parse', '--short', 'HEAD');
    return git('status', '--porcelain', '--', '.') ? `${hash}-dirty` : hash;
  } catch {
    return 'unknown';
  }
}

/** The full commit (`git rev-parse HEAD`), or '' when git cannot say. A plain texture pack records it; the short revision cannot (it is not 40 hex). */
function gitCommit(): string {
  try {
    const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: webRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[a-f0-9]{40}$/.test(hash) ? hash : '';
  } catch {
    return '';
  }
}

/**
 * LR-40 (6): the launcher's version, the nearest release tag (`./releaseVersion.ts`), for its badge and App's Version row
 * (`src/console/pageVersion.ts`); the package's version where git names none.
 */
function viewerVersion(): string {
  const pkg = JSON.parse(readFileSync(join(webRoot, 'package.json'), 'utf8')) as { version: string };
  return releaseVersion((...args: string[]) => execFileSync('git', args, { cwd: webRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }), process.env, pkg.version);
}

/** When the build ran, UTC, `YYYY-MM-DD HH:MM:SS` -- the s2u site's footer stamp. */
const buildStamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

/**
 * The viewer is its own Vite root inside the workspace. `publicDir` points at `socomlegacy/public`, so the
 * extracted disc tree served at `/maps/` is the app's default `AssetSource` without a copy.
 */
/**
 * `VIEWER_BASE` is the path the built site is served under (for example `/socomlegacy/`, the site's); the dev server
 * and the default build use `/`. The extracted maps are never copied into the build: on a server they are a
 * separate directory mounted beside the site, in dev Vite serves
 * `socomlegacy/public` itself.
 */
/** `redotcom`, `/socomlegacy` and `/socomlegacy/` all mean `/socomlegacy/`; unset means `/`. Only the last path
 *  segment counts, because on Windows Git Bash rewrites a leading-slash value into `C:/Program Files/Git/...`. */
function basePath(value: string | undefined): string {
  const parts = (value ?? '').split(/[\/]+/).filter((p) => p.length > 0);
  const name = parts[parts.length - 1];
  return name ? `/${name}/` : '/';
}

/**
 * The design system and its fonts are read in place from `shared` (no vendored copy since 2026-09-29):
 * `/src/ds/` in `index.html` is aliased to `shared/ds/`, and `fonts.css`'s `/fonts/*.woff2` to `shared/fonts/`,
 * so the build bundles the woff2 files under `base` and `shipFontLicences` copies them and their OFL texts into
 * `<outDir>/fonts/`. `copyPublicDir` stays off: `socomlegacy/public/` is the extracted disc tree, which must never
 * be copied into `dist/`. `packages/viewer/test/build_fonts.test.ts` reads the result.
 */
const publicDir = fileURLToPath(new URL('../../public', import.meta.url));

/**
 * The movie decoder (PLAT-19b, W9.R9; research 120 §6): `fmvPlugin` serves `/fmv/libmpeg2.wasm` from
 * `packages/fmv/wasm/out/` in dev and, at the end of a build, ships it into `<outDir>/fmv/` with upstream's `COPYING`
 * and the source offer -- when the dev host has built it (`build.sh`; never committed) -- then fails the build if the
 * output holds a movie (`.pss`, `.m2v` or a transcode), which CI's `npm run build` thereby checks. The worker
 * (`src/movieWorker.ts`) is an ES module worker like `src/worker.ts` (`worker.format` below).
 */
const fmvWasm = fileURLToPath(new URL('../fmv/wasm', import.meta.url));

export default defineConfig(({ command, isPreview }) => {
  const release = gitRevision();
  const commit = gitCommit();
  // CX-13: the setup page's backdrop media (the background video, its poster, the cards' captures) is no longer shipped
  // or announced -- no page has read it since CX-9b. The Sony notice it also emitted went with the last Sony art (the
  // owner, 2026-10-18: "yeah sure, remove if we're not using it"; the console launcher plan's Log).
  return {
  root: here,
  // appType stays Vite's default, `spa`: the menu flow's deep routes are answered with index.html (OT.R10;
  // test/menuRoutesServe.test.ts) -- since CX-9a (CX.R8, the owner, 2026-10-12) the console launcher, whose hand-over
  // keeps a menu path for the front end's router (src/console/adapters/gamePath.ts). The project pages are extra HTML
  // inputs beside it, and `projectRoutes` below sends `/news`, `/roadmap`, `/journey`, `/archive`, `/server`, `/status` to theirs,
  // `/console` (the console's first address, kept as an alias) to index.html, and `/setup`, `/testroom` (OT.R19) and
  // `/playtest` (PTT-9) to the old page, setup/index.html, before that fallback (test/console/route.test.ts).
  base: basePath(process.env.VIEWER_BASE),
  publicDir,
  // MU-6: the dev server only, under its own opt-in S2U_DEV_PROXY_PORT -- a development adaptation (`./devProxy`); never a build or preview.
  server: { port: 5173, strictPort: true, ...withProxy(devLocalProxy(process.env, command, isPreview)) },
  build: {
    outDir: fileURLToPath(new URL('../../dist/viewer', import.meta.url)), emptyOutDir: true, copyPublicDir: false,
    // Vite writes each HTML input at its path under `root`: `index.html` is the site's `/`, `<page>/index.html` its `/<page>/`.
    rollupOptions: { input: {
      // The console launcher (the S2U Briefing design system's "Console launcher"; OT.R28): the base path's page since
      // CX-9a (CX.R8, the owner, 2026-10-12: it "becomes the new launcher default"); `/console` is its alias.
      console: join(here, 'index.html'),
      // The old page (the setup page, the test room's and the playtest sheet's page; `src/entry.ts`), at /setup since CX-9a.
      setup: join(here, 'setup/index.html'),
      news: join(here, 'news/index.html'),
      roadmap: join(here, 'roadmap/index.html'), journey: join(here, 'journey/index.html'), archive: join(here, 'archive/index.html'),
      server: join(here, 'server/index.html'),
      status: join(here, 'status/index.html'),
    } },
  },
  worker: { format: 'es' },
  define: { __VIEWER_REV__: JSON.stringify(release), __VIEWER_COMMIT__: JSON.stringify(commit), __BUILD_STAMP__: JSON.stringify(buildStamp), __VIEWER_VERSION__: JSON.stringify(viewerVersion()) },
  resolve: { alias: [dsAlias, fontsAlias] },
  plugins: [pwaPlugin({ release }), shipFontLicences(), fmvPlugin(fmvWasm), lobbyLinkHeadPlugin(), sonyNoticePlugin(join(here, 'src/assets/sony/NOTICE.txt')), {
    name: 'project-page-routes',
    // Vite's HTML fallback does not resolve /news to news/index.html without this rewrite.
    // Keep dev and preview equivalent to the static host's clean-route contract.
    configureServer(server) { projectRoutes(server.middlewares, server.config.base); },
    configurePreviewServer(server) { projectRoutes(server.middlewares, server.config.base); },
  }],
  };
});

/** The `proxy` key only when there is one, so the config without the variable is the config as it was. */
function withProxy(proxy: ReturnType<typeof devLocalProxy>): { proxy?: NonNullable<ReturnType<typeof devLocalProxy>> } {
  return proxy ? { proxy } : {};
}

/**
 * The clean routes: each page's path segment under the base -> the HTML file under `root` that answers it (the segment
 * and its slash form; with `below`, every HTML request under it too), before Vite's own fallback, which answers every
 * other HTML request with `index.html`, the console launcher since CX-9a. The static host's copy of this contract is
 * `shared/deploy/site/nginx.conf` (its `/setup`, `/testroom` and `/playtest` lines since CX-9b, held by `test/menuRoutesServe.test.ts`).
 */
// The project pages, the launcher's alias (`/console`), and the game page's paths (`/setup`; the test room, the playtest's
// sheet and the forge, each with the paths below it): the site path table's (`@s2u/ui` `sitePaths.ts`, the URL pathing
// consolidation), no longer written here.
const PAGE_ROUTES: readonly { readonly page: string; readonly file: string; readonly below?: true }[] = sitePageRoutes();

/** LINK-4 in dev: the page origin is Vite, so the head is injected here. The live card is fetched when the proxy port is set. */
function lobbyLinkHeadPlugin(): import('vite').Plugin {
  return {
    name: 'lobby-link-head',
    apply: 'serve',
    async transformIndexHtml(html, ctx) {
      const path = (ctx.originalUrl ?? '').split('?')[0] ?? '';
      const m = /\/online\/lobby\/([A-Za-z0-9_-]{10,22})\/?$/.exec(path);
      const id = m && isLobbyId(m[1]!) ? m[1]! : null;
      if (!id) return html;
      const ended = describeLobby(null);
      let lobby = withId(ended, id, lobbyStateHash(lobbyStateMaterial(ended)));
      const port = process.env['S2U_DEV_PROXY_PORT'];
      if (port && /^\d{1,5}$/.test(port)) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/lobby/${id}`);
          if (res.ok) lobby = publicLobbyFromJson(await res.json(), id);
        } catch { /* the generic card: central is not up */ }
      }
      return injectLobbyHead(html, lobby, '');
    },
  };
}

/** `prefix` is the resolved base (`VIEWER_BASE` or an inline `base`), so the rewrite follows the page's base. */
function projectRoutes(middlewares: import('vite').Connect.Server, prefix: string): void {
  middlewares.use((req, _res, next) => {
    const [path, query] = (req.url ?? '').split('?');
    // A path below a page is an HTML request (Vite's fallback's test): a module or an asset under it is left alone.
    const html = req.headers.accept === undefined || req.headers.accept === '' || req.headers.accept.includes('text/html');
    for (const r of PAGE_ROUTES) {
      const at = `${prefix}${r.page}`;
      if (path === at || path === `${at}/` || (r.below && html && path!.startsWith(`${at}/`))) {
        req.url = `${prefix}${r.file}${query === undefined ? '' : `?${query}`}`;
        break;
      }
    }
    next();
  });
}
