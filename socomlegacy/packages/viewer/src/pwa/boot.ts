import { viewerRev } from '../revision';
import { fileDiscMounted } from './fileDisc';
import { bindInstallOffer } from './install';
import { pageInMatch, pageReloadHeld } from './matchSignals';
import { staleFromServed } from './staleRelease';
import { bindChunkLoadFailures, fetchServedRev, markPageBroken, RELEASE_POLL_MS, showUpdateNotice, watchInstalledRelease, watchRelease } from './update';

/**
 * Register the service worker and watch for a release (PWA-3, PWA-4). A browser adaptation.
 * The worker is registered with `updateViaCache: 'none'`, so a long-open tab sees a new `sw.js`.
 * Dev servers do not register one: a worker would pin the dev modules. The install prompt is held in every build,
 * so the launcher's Install row can use it when the browser offers it.
 *
 * A new worker is asked to take over when it reaches `installed`, if this page is outside a match and no file-picked
 * disc is mounted. A visible tab also calls `registration.update()` on a slow
 * poll, and skips that poll during a match. The reload itself is `watchInstalledRelease`'s: only the page that
 * asked, only outside a match, never on the first claim. A file-picked disc, the game's front end or an unsaved edit
 * (CX.R18) waits for Restart, which activates the waiting worker and reloads once on `controllerchange`.
 * A changed `/version.json`, or a lazy script that fails to load (PT195-5), tells the worker to stop fetching
 * this build's missing hashed files and shows the reload prompt. The page still never reloads itself during a match.
 */

let started = false;

function siteRoot(base: string): string {
  if (!base || base === '/') return '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function startPwa(win: Window, rev = viewerRev(), base = import.meta.env.BASE_URL ?? '/'): void {
  if (started || typeof win === 'undefined') return;
  started = true;
  bindInstallOffer(win);
  if (!import.meta.env.PROD) return;
  const nav = win.navigator;
  const sw = nav?.serviceWorker;
  // PT195-5: a failed chunk prompts even when this browser has no worker. The worker, when it is there, is what
  // stops the next hashed fetch from reaching the server.
  let broken = false;
  let stalePosted = false;
  const failedChunks: string[] = [];
  const root = siteRoot(base);
  const servedRev = (): Promise<string | null> => fetchServedRev(win.fetch.bind(win), `${root}version.json`);
  const tellWorker = (data: unknown): void => { sw?.controller?.postMessage(data); };
  // At every check that finds another build, not once: a worker the browser stopped, or one that took the page over,
  // may have lost what the page said (the rendered check across a release). The message is small and idempotent.
  const postStale = (): void => {
    stalePosted = true;
    tellWorker({ type: 'stale-release' });
  };
  let reloading = false;
  const reload = (): void => { if (reloading) return; reloading = true; win.location.reload(); };
  let restart: () => void = reload;
  const notice = (): void => showUpdateNotice(win.document, { restart: () => restart() });
  bindChunkLoadFailures(win, (url) => {
    broken = true;
    failedChunks.push(url);
    markPageBroken(win.document);
    tellWorker({ type: 'chunk-failed', url });
    notice();
    // The takeover's review (F4): a failed chunk blocks only itself; the revision says whether the build is gone.
    void servedRev().then((served) => { if (staleFromServed(served, rev)) postStale(); }).catch(() => undefined);
  });
  if (!sw) return;
  sw.addEventListener('controllerchange', () => {
    // A new worker starts with a clear gate. Say it again, or the next miss goes to the network.
    if (stalePosted) tellWorker({ type: 'stale-release' });
    for (const url of failedChunks) tellWorker({ type: 'chunk-failed', url });
  });
  const hadController = sw.controller != null;
  watchInstalledRelease({
    serviceWorker: sw,
    scriptURL: `${root}sw.js`,
    hadController,
    inMatch: () => pageInMatch(win),
    fileDisc: fileDiscMounted,
    held: () => pageReloadHeld(win),
    broken: () => broken,
    reload,
    showNotice: notice,
    onRegistration(reg, client) {
      restart = () => { client.restart(reg); };
      const watch = watchRelease({
        pageRev: rev,
        inMatch: () => pageInMatch(win),
        servedRev,
        waiting: () => reg.waiting != null,
        activateWaiting: () => { client.requestUpdate(reg.waiting, reg); },
        reload: () => { client.applyVersionChange(reg); },
        onStale: postStale,
        onVisible: (cb) => {
          const fn = (): void => { if (win.document.visibilityState === 'visible') cb(); };
          win.document.addEventListener('visibilitychange', fn);
          return () => win.document.removeEventListener('visibilitychange', fn);
        },
      });
      win.setInterval(() => {
        client.onPollTick(() => { void reg.update(); void watch.check(); });
      }, RELEASE_POLL_MS);
    },
  });
}

/** Tests that import an entry more than once. */
export function resetPwaForTest(): void {
  started = false;
}
