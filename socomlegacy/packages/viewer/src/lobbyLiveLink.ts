import { lobbyInviteOf } from '@s2u/ui';
import { routeSegmentsOfPath } from './menuRoutes';

/**
 * LCM-8, LCM-18d (the LCM plan, `docs/plans/2026-11-09-live-cards-and-match-pages.md`; LCM.R3): the lobby page's
 * (`/online/lobby/<id>`) "Live match stats" link -- shown while `/api/live` names that lobby's match, a link to its match
 * page `/match/<matchId>`. Its own small module (LCM-18d) so the launcher's entry (`./console/main.ts`) loads none of the
 * match page, the site shell or the site's data.
 *
 * It lives only as long as the lobby's page: each read checks the address is still that lobby's (the launcher's own
 * parse, `lobbyInviteOf`), a `popstate` or the launcher's own move (LCM-19, `LOBBY_LIVE_NAVIGATE_EVENT_ADAPTATION`) checks at once, and the game taking the page (the body's
 * `LOBBY_LIVE_GAME_BODY_CLASS_ADAPTATION`, which the game page keeps the lobby's address under) ends it at once; ended,
 * its link is removed and never added again. It asks nothing while the tab is hidden and reads at once when it is shown;
 * a failed read keeps the link and waits longer (`LOBBY_LIVE_BACKOFF_MS_ADAPTATION`).
 *
 * Product track (OT.R53): a browser adaptation with no original -- the game has no web pages; nothing of the game reads it.
 */

/** An adaptation: the link reads `/api/live` this often (ms) -- the match page's pace (`MATCH_PAGE_POLL_MS_ADAPTATION`, held equal by the test). */
export const LOBBY_LIVE_POLL_MS_ADAPTATION = 15_000;

/** An adaptation: after the 1st, 2nd, 3rd and later failed read in a row, the next read waits this long (ms); a good read resets it. */
export const LOBBY_LIVE_BACKOFF_MS_ADAPTATION: readonly number[] = [15_000, 30_000, 60_000];

/**
 * An adaptation: the body's class that marks the game's page (`./console/adapters/launch.ts` `GAME_BODY`, at the
 * launcher's hand-over; `./pageEntry.ts` `clearPage`, the old page's entry) -- the game has taken the page.
 */
export const LOBBY_LIVE_GAME_BODY_CLASS_ADAPTATION = 'ps2-look';

/**
 * An adaptation (LCM-19): the event the launcher's history fires after each of its own `pushState`/`replaceState`
 * (`./console/history.ts` `LAUNCHER_NAVIGATE_EVENT_ADAPTATION`, held equal by `test/lobbyLiveLink.test.ts`; not imported,
 * so this module loads none of the launcher) -- the link checks the address at once.
 */
export const LOBBY_LIVE_NAVIGATE_EVENT_ADAPTATION = 's2u:navigate';

/** An adaptation: the match page's address segment (`./matchPage.ts` `MATCH_PAGE_SEGMENT_ADAPTATION`, held equal by `test/lobbyLiveLink.test.ts`). */
const MATCH_SEGMENT_ADAPTATION = 'match';

/** The base with one trailing slash. */
const withSlash = (base: string): string => (base.endsWith('/') ? base : `${base}/`);

/** `/api/live`'s match of the public lobby `lobbyId` (its `matchId`) as the match page's address under `base`, or null. */
export function liveMatchHrefOf(live: unknown, lobbyId: string, base = '/'): string | null {
  const lobbies = typeof live === 'object' && live !== null ? (live as { lobbies?: unknown }).lobbies : null;
  if (!Array.isArray(lobbies)) return null;
  for (const l of lobbies) {
    if (typeof l !== 'object' || l === null) continue;
    const { id, matchId } = l as { id?: unknown; matchId?: unknown };
    if (id === lobbyId && typeof matchId === 'string' && matchId !== '') return `${withSlash(base)}${MATCH_SEGMENT_ADAPTATION}/${encodeURIComponent(matchId)}`;
  }
  return null;
}

/** The lobby id the address `/online/lobby/<id>` under `base` names (the launcher's parse), or null. */
export function lobbyIdOfPath(pathname: string, base = '/'): string | null {
  return lobbyInviteOf(routeSegmentsOfPath(pathname, base))?.lobbyId ?? null;
}

/** A fetch's answer, the parts the link reads. */
export interface LivePageResponse { ok: boolean; status: number; json(): Promise<unknown> }
export interface LobbyLiveLinkDeps {
  fetch?: (url: string) => Promise<LivePageResponse>;
  /** Schedules `fn` in `ms`; its return is the handle `clearTimer` takes. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  base?: string;
  win?: Window;
}

/** Mounts the link for `lobbyId`: reads now, then on its pace while it lives. `stop` ends it and removes the link. */
export function mountLobbyLiveLink(doc: Document, lobbyId: string, deps: LobbyLiveLinkDeps = {}): { stop(): void } {
  const win = deps.win ?? doc.defaultView!;
  const base = deps.base ?? '/';
  const get = deps.fetch ?? ((url: string): Promise<LivePageResponse> => win.fetch(url, { cache: 'no-cache', headers: { accept: 'application/json' } }));
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number): unknown => win.setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown): void => { win.clearTimeout(h as number); });
  let stopped = false;
  let pending: unknown = null;
  let paused = false;
  let failures = 0;

  const anchor = (): HTMLAnchorElement | null => doc.querySelector<HTMLAnchorElement>('a.project-live-link');
  const gameHasPage = (): boolean => doc.body?.classList.contains(LOBBY_LIVE_GAME_BODY_CLASS_ADAPTATION) === true;
  const stillHere = (): boolean => !gameHasPage() && lobbyIdOfPath(win.location.pathname, base) === lobbyId;

  const onPop = (): void => { if (!stillHere()) stop(); };
  const onVisible = (): void => { if (!stopped && paused && !doc.hidden) { paused = false; void read(); } };
  const Observer = (win as Window & typeof globalThis).MutationObserver;
  const observer = typeof Observer === 'function' ? new Observer(() => { if (gameHasPage()) stop(); }) : null;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (pending !== null) { clearTimer(pending); pending = null; }
    win.removeEventListener('popstate', onPop);
    win.removeEventListener(LOBBY_LIVE_NAVIGATE_EVENT_ADAPTATION, onPop);
    doc.removeEventListener('visibilitychange', onVisible);
    observer?.disconnect();
    anchor()?.remove();
  }

  const schedule = (ms: number): void => {
    pending = setTimer(() => {
      pending = null;
      if (stopped) return;
      if (doc.hidden) { paused = true; return; }     // read again once shown (`onVisible`)
      void read();
    }, ms);
  };

  async function read(): Promise<void> {
    if (stopped) return;
    if (!stillHere()) { stop(); return; }
    let ok = false;
    let href: string | null = null;
    try {
      const res = await get('/api/live');
      if (res.ok) { href = liveMatchHrefOf(await res.json(), lobbyId, base); ok = true; }
    } catch { /* a failed read: below */ }
    if (stopped) return;
    if (!stillHere()) { stop(); return; }
    if (ok) {
      failures = 0;
      let a = anchor();
      if (href === null) a?.remove();
      else {
        if (!a) {
          a = doc.createElement('a');
          a.className = 's2u-action s2u-action--secondary project-live-link';
          a.textContent = 'Live match stats';
          a.setAttribute('style', 'position: fixed; right: var(--s2u-space-6); bottom: var(--s2u-space-6); z-index: 20;'); // its old stacking, kept (under any launcher layer above 20)
          doc.body.appendChild(a);
        }
        a.setAttribute('href', href);
      }
      schedule(LOBBY_LIVE_POLL_MS_ADAPTATION);
    } else {
      // a network blip, a 429 or a 5xx: the link as it was, the next read later
      failures++;
      schedule(LOBBY_LIVE_BACKOFF_MS_ADAPTATION[Math.min(failures, LOBBY_LIVE_BACKOFF_MS_ADAPTATION.length) - 1]!);
    }
  }

  win.addEventListener('popstate', onPop);
  win.addEventListener(LOBBY_LIVE_NAVIGATE_EVENT_ADAPTATION, onPop);
  doc.addEventListener('visibilitychange', onVisible);
  if (doc.body) observer?.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  void read();
  return { stop };
}
