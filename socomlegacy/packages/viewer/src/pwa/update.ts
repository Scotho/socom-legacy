import { pageInMatch } from './matchSignals';
import { chunkUrlFromReason, staleFromServed, takeChunkFailure } from './staleRelease';

/**
 * Whether a running page moves to a new release (PWA-4, PWA.R3). A browser adaptation.
 * Outside a match it reloads. In a match it waits, and a later check (the match ending, or the tab shown again)
 * reloads once the match is over. A controller press is not involved: nothing here installs the app.
 *
 * `controllerchange` is not itself a reload. It fires in every tab when any tab asks the worker to take over,
 * and on a first visit when the worker calls `clients.claim()`. The claim on a visit that had no controller is
 * ignored. A later change reloads only when this page asked for the update and it is not in a match. A match
 * defers that reload until the match ends. A file-picked disc shows `UPDATE_NOTICE` and leaves the new worker
 * waiting; Restart is what asks it to take over, and that reload is still the one `controllerchange`. The game's front
 * end mounted or an unsaved edit holds the page the same way (`held`, CX.R18).
 */

export type UpdateChoice = 'none' | 'reload' | 'wait';

/** Shown instead of reloading once a file-picked disc is mounted. A reload would drop the file. */
export const UPDATE_NOTICE = 'New version available, restart';

/**
 * PT195-5: a lazy script or chunk of this build failed to load. The page is already broken, so this stays up
 * during a match (the version notice hides then) and Later is not offered.
 */
export const CHUNK_RELOAD_NOTICE = 'This page needs a reload';

/**
 * LATER 187 (a browser adaptation; the merge controller's call, product taste): on the game page the notice fades out by
 * itself after this many seconds and comes back at the next menu (the front end's dialog changes) -- a controller-only
 * player cannot answer its pointer buttons. The launcher keeps it up.
 */
export const UPDATE_NOTICE_GAME_FADE_ADAPTATION = 6;

/** The front end's current dialog on the game page (`../frontEnd` `__frontEnd`), or null off it. */
function frontEndDialog(win: Window | null): string | null {
  try {
    const hook = (win as (Window & { __frontEnd?: { session?: { machine?: { shell?: () => { currentName?: string } | null } } } }) | null)?.__frontEnd;
    if (hook == null) return null;
    return hook.session?.machine?.shell?.()?.currentName ?? '';
  } catch { return null; }
}

/** How often a visible tab asks the browser for a new worker. Inside 10 to 15 minutes, and never during a match. */
export const RELEASE_POLL_MS = 12 * 60 * 1000;

export type ControllerChangeAction = 'reload' | 'defer' | 'notice' | 'ignore';

/**
 * What this page does when its service-worker controller changes.
 * `firstClaim` is the one `clients.claim()` on a visit that had no controller at startup: that event is not
 * an update, including on a direct match link. A later change reloads only when this page asked the worker
 * to take over and the page is not in a match. Any other change during a match waits until the match ends.
 * A file-picked disc shows the notice until this page itself asks to restart.
 */
export function controllerChangeAction(p: {
  firstClaim: boolean;
  requestedUpdate: boolean;
  inMatch: boolean;
  fileDisc: boolean;
}): ControllerChangeAction {
  if (p.firstClaim) return 'ignore';
  if (p.inMatch) return 'defer';
  if (p.requestedUpdate) return 'reload';
  if (p.fileDisc) return 'notice';
  return 'ignore';
}

export function updateChoice(p: { inMatch: boolean; pageRev: string; servedRev: string | null; waiting: boolean }): UpdateChoice {
  const differed = p.servedRev !== null && p.servedRev !== '' && p.pageRev !== '' && p.servedRev !== p.pageRev;
  if (!differed && !p.waiting) return 'none';
  return p.inMatch ? 'wait' : 'reload';
}

export interface ReleaseWatchOpts {
  pageRev: string;
  inMatch: () => boolean;
  servedRev: () => Promise<string | null>;
  waiting: () => boolean;
  /** Ask the waiting worker to take over. The page reloads on `controllerchange`, not here. */
  activateWaiting: () => void;
  reload: () => void;
  /** Fires when the document becomes visible. Returns the unsubscribe. */
  onVisible: (cb: () => void) => () => void;
  /** How often to look again while a reload is waiting for a match to end. */
  intervalMs?: number;
  /**
   * The served revision is not this page's (PT195-5). The page tells its worker to stop fetching this build's
   * missing hashed files. It does not reload by itself: a match still waits, and a held page still shows the notice.
   */
  onStale?: () => void;
}

export interface ReleaseWatch {
  check(): Promise<UpdateChoice>;
  stop(): void;
}

/**
 * Compare the page's revision with the one served, on start and whenever the document is shown.
 * A waiting worker counts as a new build even when the revisions already match (the worker was found first).
 * While the choice is to wait, the check repeats until the match ends.
 */
export function watchRelease(o: ReleaseWatchOpts): ReleaseWatch {
  let stopped = false;
  let acting = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stopTimer = (): void => { if (timer !== null) { clearInterval(timer); timer = null; } };

  const check = async (): Promise<UpdateChoice> => {
    if (stopped) return 'none';
    let served: string | null = null;
    try { served = await o.servedRev(); } catch { served = null; }
    if (stopped) return 'none';
    // Before the reload-or-wait choice, so a match that is still running stops asking for files the server deleted.
    if (staleFromServed(served, o.pageRev)) o.onStale?.();
    const choice = updateChoice({ inMatch: o.inMatch(), pageRev: o.pageRev, servedRev: served, waiting: o.waiting() });
    if (choice === 'wait') {
      if (timer === null) timer = setInterval(() => { void check(); }, o.intervalMs ?? 2000);
      return choice;
    }
    stopTimer();
    if (choice === 'reload' && !acting) {
      acting = true;
      if (o.waiting()) o.activateWaiting();
      else o.reload();
    }
    return choice;
  };

  const off = o.onVisible(() => { void check(); });
  void check();
  return {
    check,
    stop() { stopped = true; stopTimer(); off(); },
  };
}

export interface WorkerHandle {
  state: string;
  postMessage(data: unknown): void;
  addEventListener(type: 'statechange', fn: () => void): void;
}

export interface RegistrationHandle {
  /** The worker in charge of the scope, if any (LATER 188: present on a Shift-reload, absent on a first install). */
  active?: WorkerHandle | null;
  waiting: WorkerHandle | null;
  installing: WorkerHandle | null;
  update(): Promise<unknown>;
  addEventListener(type: 'updatefound', fn: () => void): void;
}

export interface ServiceWorkerHost {
  register(scriptURL: string, options: { updateViaCache: 'none' }): Promise<RegistrationHandle>;
  addEventListener(type: 'controllerchange', fn: () => void): void;
}

export interface UpdateClientOpts {
  hadController: boolean;
  inMatch: () => boolean;
  fileDisc: () => boolean;
  /** CX.R18: the front end mounted or an unsaved edit (`./matchSignals` `pageReloadHeld`), treated as `fileDisc` is. */
  held?: () => boolean;
  /**
   * A lazy script or chunk has already failed (PT195-5). Restart reloads even during a match, because the page
   * is already broken. A controller change during the match still does not reload the page by itself.
   */
  broken?: () => boolean;
  reload: () => void;
  showNotice: () => void;
}

export interface UpdateClient {
  /**
   * Ask the waiting worker to take over. A file-picked disc does not: the page is still using this build's
   * chunks, and activating the new worker deletes them. The notice is shown instead.
   */
  requestUpdate(worker: { postMessage(data: unknown): void } | null, reg?: RegistrationHandle): void;
  /**
   * The visitor pressed Restart. The waiting worker is asked to take over, and this page reloads on
   * `controllerchange` (one reload, including over a file-picked disc). With nothing waiting, it reloads now.
   */
  restart(reg: RegistrationHandle): void;
  /** The controller changed. Returns the action it took, so a deferral can be watched. */
  onControllerChange(): ControllerChangeAction;
  /**
   * LATER 188 (its re-check's F5): the registration, once `register` answers. A worker already active while the page has
   * no controller is a Shift-reload's bypassed worker: no first claim comes from it, so the visit is not a first install.
   */
  noteRegistration(reg: RegistrationHandle): void;
  /**
   * The new worker reached `installed` (or is still on the way).
   * Outside a match, and with no file-picked disc, it is asked to take over now.
   * A file-picked disc is left waiting for `restart`. In a match it is parked until `settle`.
   */
  onInstalled(worker: WorkerHandle): 'activated' | 'parked' | 'ignored';
  /**
   * A version difference, with no reliance on the tab being hidden.
   * An installed worker is activated. One still installing is left for `onInstalled`.
   * With neither, after `update()`, the page reloads. A file-picked disc shows the notice and fetches the
   * worker, but does not activate it.
   */
  applyVersionChange(reg: RegistrationHandle): void;
  /** A deferred controller change, once the match has ended. True when it reloaded or showed the notice. */
  settle(): boolean;
  /** The slow release poll. Skipped while a match is running. */
  onPollTick(update: () => void): void;
}

/** A worker that has finished installing and is waiting to take over. */
function readyWorker(reg: RegistrationHandle): WorkerHandle | null {
  return reg.waiting ?? (reg.installing?.state === 'installed' ? reg.installing : null);
}

export function createUpdateClient(o: UpdateClientOpts): UpdateClient {
  // A file-picked disc, the front end or an unsaved edit: the notice, and no reload until Restart (CX.R18).
  const keep = (): boolean => o.fileDisc() || (o.held?.() ?? false);
  let requested = false;
  let deferred = false;
  let parked: WorkerHandle | null = null;
  // A visit that started with no controller has not yet seen `clients.claim()`. Until it has, an `installed`
  // worker is the first one and activates on its own; marking it as a requested update would reload the page.
  let sawController = o.hadController;
  // LATER 188 and its review's F1: a request made while the registration had an active worker -- one that replaces it, as on
  // a Shift-reload -- is a take-over, never the visit's first claim; a first install's own worker briefly waiting is not.
  let takeover = false;

  const client: UpdateClient = {
    requestUpdate(worker, reg) {
      if (keep()) { o.showNotice(); return; }
      requested = true;
      if (reg?.active && reg.active !== worker) takeover = true;
      worker?.postMessage({ type: 'skip-waiting' });
    },
    restart(reg) {
      // The player asked. A broken page reloads now, match included: waiting for the match would leave it broken.
      if (o.broken?.()) { o.reload(); return; }
      requested = true;
      if (reg.active) takeover = true;
      if (o.inMatch()) return;
      const worker = reg.waiting ?? reg.installing;
      if (worker) worker.postMessage({ type: 'skip-waiting' });
      else o.reload();
    },
    onControllerChange() {
      // LATER 188: a take-over this page asked for (`takeover`) is never the visit's first claim -- a Shift-reload starts
      // with no controller, and its next claim is the new worker it asked for, not a first visit's `clients.claim()`.
      const firstClaim = !sawController && !takeover;
      sawController = true;
      const action = controllerChangeAction({
        firstClaim,
        requestedUpdate: requested,
        inMatch: o.inMatch(),
        fileDisc: keep(),
      });
      if (action === 'reload') o.reload();
      else if (action === 'notice') o.showNotice();
      else if (action === 'defer') deferred = true;
      return action;
    },
    noteRegistration(reg) {
      // Its re-check 2's F6: a worker done activating -- a first worker still activating has its first claim to come.
      if (reg.active?.state === 'activated') sawController = true;
    },
    onInstalled(worker) {
      if (worker.state !== 'installed') return 'ignored';
      if (!sawController) return 'ignored';
      if (o.inMatch()) { parked = worker; return 'parked'; }
      if (keep()) { o.showNotice(); return 'ignored'; }
      client.requestUpdate(worker);
      return 'activated';
    },
    applyVersionChange(reg) {
      if (o.inMatch()) return;
      if (keep()) {
        o.showNotice();
        // Fetch the new worker so Restart can activate it, and leave it waiting. Activating it now deletes
        // this build's cached chunks while the page is still running them.
        if (!readyWorker(reg) && !reg.installing) void reg.update();
        return;
      }
      if (requested) return;
      if (reg.waiting) { client.requestUpdate(reg.waiting, reg); return; }
      if (reg.installing) return;
      void reg.update().then(() => {
        if (o.inMatch() || requested) return;
        if (keep()) {
          o.showNotice();
          const next = readyWorker(reg);
          if (next) client.requestUpdate(next, reg);
          return;
        }
        if (reg.waiting) client.requestUpdate(reg.waiting, reg);
        else if (!reg.installing) o.reload();
      }, () => { /* a failed check is not a new release */ });
    },
    settle() {
      if (o.inMatch()) return false;
      const waiting = parked;
      parked = null;
      if (!deferred && !waiting) return false;
      if (deferred) {
        deferred = false;
        if (requested || !keep()) o.reload();
        else o.showNotice();
        return true;
      }
      if (waiting) client.onInstalled(waiting);
      return true;
    },
    onPollTick(update) {
      if (o.inMatch()) return;
      update();
    },
  };
  return client;
}

export interface InstalledReleaseOpts extends UpdateClientOpts {
  serviceWorker: ServiceWorkerHost;
  scriptURL: string;
  /** How soon a deferred reload is applied after the match ends. */
  settleMs?: number;
  onRegistration?: (reg: RegistrationHandle, client: UpdateClient) => void;
}

/**
 * Register `/sw.js` and follow its lifecycle. The controller listener is attached before `register`,
 * so a first visit's `clients.claim()` is seen and ignored. A browser adaptation.
 */
export function watchInstalledRelease(p: InstalledReleaseOpts): void {
  const client = createUpdateClient(p);
  let settleTimer: ReturnType<typeof setInterval> | null = null;
  const armSettle = (): void => {
    if (settleTimer !== null) return;
    settleTimer = setInterval(() => {
      if (!client.settle() || settleTimer === null) return;
      clearInterval(settleTimer);
      settleTimer = null;
    }, p.settleMs ?? 2000);
  };
  p.serviceWorker.addEventListener('controllerchange', () => {
    if (client.onControllerChange() === 'defer') armSettle();
  });
  const arm = (worker: WorkerHandle | null): void => {
    if (!worker) return;
    const onState = (): void => { if (client.onInstalled(worker) === 'parked') armSettle(); };
    worker.addEventListener('statechange', onState);
    onState();
  };
  void p.serviceWorker.register(p.scriptURL, { updateViaCache: 'none' }).then((reg) => {
    client.noteRegistration(reg);                                  // LATER 188 F5: a Shift-reload is no first install
    // Before any installed worker can show the notice, so Restart activates that worker instead of reloading cold.
    p.onRegistration?.(reg, client);
    reg.addEventListener('updatefound', () => arm(reg.installing));
    arm(reg.waiting);
    arm(reg.installing);
  }, () => { /* a browser that refuses the worker keeps the page as a tab */ });
}

/**
 * The toast is hidden only while a match is running. The game's front end shows it (CX.R18): there the update
 * waits for Restart instead of reloading.
 */
export function updateNoticeHidden(p: { inMatch: boolean }): boolean {
  return p.inMatch;
}

/** The page has already failed a lazy script or chunk (`markPageBroken`). The prompt stays up through a match. */
export function pageBroken(doc: Document): boolean {
  return doc.documentElement?.getAttribute('data-pwa-broken') === '1';
}

export function shouldHideUpdateNotice(doc: Document): boolean {
  if (pageBroken(doc)) return false;
  if (!doc.body) return false;
  const win = doc.defaultView;
  return updateNoticeHidden({ inMatch: win ? pageInMatch(win) : false });
}

/** Remember that a chunk failed, and refresh a notice that is already on the page. */
export function markPageBroken(doc: Document): void {
  doc.documentElement.setAttribute('data-pwa-broken', '1');
  doc.querySelector('[data-pwa-update]')?.dispatchEvent(new Event('pwa-refresh'));
}

/**
 * The restart notice. One per page. Restart activates the waiting build; Later dismisses the toast. CX.R18 (the joint
 * review, F1): it stacks above the front end's and the match's canvas (z-index 1000) and the loading screen (19000), so
 * the game page shows it; and it re-checks once a second too, since a match the front end starts changes neither the
 * body's class nor `data-console`.
 * It is a small toast in the launcher toast slot (centred, above the legend), so it does not cover the forge
 * toolbar or the launcher header. A full-width bar does. It hides while a match runs.
 */
export function showUpdateNotice(doc: Document, actions: { restart: () => void }): void {
  const mount = (): void => {
    if (!doc.body || doc.querySelector('[data-pwa-update]')) return;
    const bar = doc.createElement('div');
    bar.setAttribute('data-pwa-update', '');
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;z-index:20000;left:50%;bottom:9.5rem;transform:translateX(-50%);gap:12px;align-items:center;width:max-content;max-width:min(24rem,calc(100vw - 32px));padding:10px 12px;background:#000e11;color:#e7eef2;border:1px solid #c4a04a;font:14px/1.3 system-ui,sans-serif';
    const text = doc.createElement('span');
    text.textContent = UPDATE_NOTICE;
    const restart = doc.createElement('button');
    restart.type = 'button';
    restart.dataset['pwaRestart'] = '';
    restart.textContent = 'Restart';
    restart.style.cssText = 'font:inherit;background:#c4a04a;color:#000e11;border:0;padding:6px 12px;cursor:pointer';
    restart.addEventListener('click', () => actions.restart());
    const later = doc.createElement('button');
    later.type = 'button';
    later.dataset['pwaLater'] = '';
    later.textContent = 'Later';
    later.style.cssText = 'font:inherit;background:transparent;color:#e7eef2;border:1px solid #c4a04a;padding:6px 12px;cursor:pointer';
    // LATER 187: on the game page, shown since the dialog it was shown over; faded past the adaptation's seconds.
    let dialog: string | null = null, shownAt = Date.now();
    const faded = (): boolean => {
      // A broken page has nothing to fade back to: the prompt stays until Restart.
      if (pageBroken(doc)) return false;
      const now = frontEndDialog(doc.defaultView);
      if (now === null) return false;
      if (now !== dialog) { dialog = now; shownAt = Date.now(); }
      return Date.now() - shownAt >= UPDATE_NOTICE_GAME_FADE_ADAPTATION * 1000;
    };
    const sync = (): void => {
      // Its review's F3: a match's end is the next menu -- in a match the dialog is forgotten, so the return shows it again.
      const broken = pageBroken(doc);
      if (broken) {
        text.textContent = CHUNK_RELOAD_NOTICE;
        later.hidden = true;
        bar.removeAttribute('data-pwa-dismissed');
      }
      const inMatch = shouldHideUpdateNotice(doc);
      if (inMatch) dialog = null;
      const hide = !broken && (bar.getAttribute('data-pwa-dismissed') === '1' || inMatch || faded());
      bar.hidden = hide;
      // `display` in the style attribute beats the `hidden` attribute, so the toast sets it itself.
      bar.style.display = hide ? 'none' : 'flex';
    };
    bar.addEventListener('pwa-refresh', sync);
    later.addEventListener('click', () => {
      bar.setAttribute('data-pwa-dismissed', '1');
      sync();
    });
    const obs = new MutationObserver(sync);
    obs.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-console'] });
    obs.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    bar.append(text, restart, later);
    doc.body.append(bar);
    sync();
    doc.defaultView?.setInterval(sync, 1000);
  };
  if (doc.body) mount();
  else doc.addEventListener('DOMContentLoaded', mount, { once: true });
}

/**
 * A failed lazy script or chunk (Vite's `vite:preloadError`, a dynamic `import()`, or a script/link error).
 * The first failure of a build chunk calls `onFail` once. Anything else is left alone. A browser adaptation (PT195-5).
 */
export function bindChunkLoadFailures(win: Window, onFail: (url: string) => void): () => void {
  const seen = new Set<string>();
  const take = (reason: unknown, cancel?: () => void): void => {
    // A repeat still must not surface as an unhandled error. Only the first one prompts.
    if (!chunkUrlFromReason(reason)) return;
    cancel?.();
    const url = takeChunkFailure(seen, reason);
    if (url) onFail(url);
  };
  const onPreload = (ev: Event): void => {
    // The takeover's review (F3): not cancelled. Vite's preload helper resolves a cancelled failure's import to
    // undefined, so its caller met a TypeError instead of the load error; uncancelled it rejects, and an uncaught one
    // arrives below as an `unhandledrejection` (the same file: counted once).
    take((ev as Event & { payload?: unknown }).payload);
  };
  const onReject = (ev: Event): void => {
    take((ev as Event & { reason?: unknown }).reason, () => ev.preventDefault());
  };
  const onError = (ev: Event): void => {
    // A resource error's target is the element. A script error's target is the window, which has no tag.
    const el = ev.target as { tagName?: string; src?: string; href?: string } | null;
    const tag = el?.tagName?.toUpperCase();
    if (tag === 'SCRIPT' && el?.src) take(el.src);
    else if (tag === 'LINK' && el?.href) take(el.href);
  };
  win.addEventListener('vite:preloadError', onPreload);
  win.addEventListener('unhandledrejection', onReject);
  win.addEventListener('error', onError, true);
  return () => {
    win.removeEventListener('vite:preloadError', onPreload);
    win.removeEventListener('unhandledrejection', onReject);
    win.removeEventListener('error', onError, true);
  };
}

/** `GET /version.json`, uncached. Null when it cannot be read: a failed read is not a new release. */
export async function fetchServedRev(fetchFn: typeof fetch = fetch, url = '/version.json'): Promise<string | null> {
  try {
    const res = await fetchFn(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object' || !('release' in body)) return null;
    const release = (body as { release: unknown }).release;
    return typeof release === 'string' ? release : null;
  } catch {
    return null;
  }
}
