import { pageInMatch } from '../src/pwa/matchSignals';
import { fetchServedRev, showUpdateNotice, watchInstalledRelease, watchRelease } from '../src/pwa/update';

/**
 * The update page's script (PWA-7). The real `watchRelease`: a new `/version.json` reloads outside a match and waits
 * through one. `/live.html` runs the real worker lifecycle (`watchInstalledRelease`): a first claim does not reload,
 * and a match in another tab is not reloaded when this page asks the worker to take over. A browser adaptation.
 */

if (location.pathname.endsWith('/live.html')) bootLive();
else if (new URLSearchParams(location.search).get('notice') === '1') {
  showUpdateNotice(document, { restart() { /* this fixture only checks that the toast leaves the controls clear */ } });
} else bootVersionWatch();

function bootLive(): void {
  const q = new URLSearchParams(location.search);
  const loads = Number(sessionStorage.getItem('pwa-loads') ?? '0') + 1;
  sessionStorage.setItem('pwa-loads', String(loads));
  let match = q.get('match') === '1';
  // A file pick lives in the page. A reload drops it, as the launcher's does, so the flag does not survive `reloaded`.
  const disc = q.get('disc') === '1' && q.get('reloaded') == null;
  const had = navigator.serviceWorker.controller != null;
  const reload = (): void => {
    const n = Number(sessionStorage.getItem('pwa-reloads') ?? '0') + 1;
    sessionStorage.setItem('pwa-reloads', String(n));
    const next = new URL(location.href);
    next.searchParams.set('reloaded', String(n));
    // The reloaded document is the new build. This fixture has no new HTML, so the rev query stands in for it.
    next.searchParams.set('rev', 'build-b');
    location.replace(next.toString());
  };
  let restart: () => void = reload;
  const win = window as Window & { __setMatch?: (on: boolean) => void; __checkUpdate?: () => Promise<unknown> };
  win.__setMatch = (on) => { match = on; };
  watchInstalledRelease({
    serviceWorker: navigator.serviceWorker,
    scriptURL: '/sw.js',
    hadController: had,
    inMatch: () => match,
    fileDisc: () => disc,
    reload,
    showNotice: () => showUpdateNotice(document, { restart: () => restart() }),
    settleMs: 150,
    onRegistration(reg, client) {
      restart = () => { client.restart(reg); };
      win.__checkUpdate = () => reg.update();
      watchRelease({
        pageRev: q.get('rev') ?? 'build-a',
        inMatch: () => match,
        servedRev: () => fetchServedRev(fetch, '/version.json'),
        waiting: () => reg.waiting != null,
        activateWaiting: () => { client.requestUpdate(reg.waiting, reg); },
        reload: () => { client.applyVersionChange(reg); },
        onVisible: (cb) => {
          const fn = (): void => { if (document.visibilityState === 'visible') cb(); };
          document.addEventListener('visibilitychange', fn);
          return () => document.removeEventListener('visibilitychange', fn);
        },
      });
    },
  });
}

function bootVersionWatch(): void {
  const q = new URLSearchParams(location.search);
  const pageRev = q.get('rev') ?? 'build-a';
  let forceMatch = q.get('match') === '1';

  const state = { reloads: 0 };
  const win = window as Window & { __pwa?: typeof state; __setMatch?: (on: boolean) => void };
  win.__pwa = state;
  win.__setMatch = (on) => { forceMatch = on; };

  watchRelease({
    pageRev,
    inMatch: () => forceMatch || pageInMatch(window),
    servedRev: async () => {
      const res = await fetch('/version.json', { cache: 'no-store' });
      const body: unknown = await res.json();
      if (!body || typeof body !== 'object' || !('release' in body)) return null;
      const release = (body as { release: unknown }).release;
      return typeof release === 'string' ? release : null;
    },
    waiting: () => false,
    activateWaiting: () => {},
    reload: () => {
      state.reloads += 1;
      const next = new URL(location.href);
      if (next.searchParams.get('reloaded') === '1') return;
      next.searchParams.set('reloaded', '1');
      location.replace(next.toString());
    },
    onVisible: (cb) => {
      const fn = (): void => { if (document.visibilityState === 'visible') cb(); };
      document.addEventListener('visibilitychange', fn);
      return () => document.removeEventListener('visibilitychange', fn);
    },
    intervalMs: 200,
  });
}
