import {
  INVITE_ROUTE, inviteHref, inviteOf, isLobbyId, lobbyInviteOf, withoutInvite, type InviteLink,
} from '@s2u/ui';
import { answerInvites, clearInviteTaken, markInviteTaken, pageInviteChannel, type InviteChannelOpen } from '../../inviteHost';
import { routeSegmentsOfPath } from '../../menuRoutes';
import type { SessionState } from '../../modern/session';
import type { ConsoleState, DiscState, InvitePage, Overlay } from '../state';

/**
 * INVITE-START (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R8, the merge controller's ruling on
 * the owner's "invite link takes you to login screen directly"; the product track, OT.R53). A browser adaptation with no
 * original: the console had no invite links, and nothing the game does changes -- the front end the START hands over to
 * is the same, with the same address (`./launch` `gamePage`: the path `main/online` kept for the menu router, every query
 * key passed by `isoSearch`), so the invite's route (`@s2u/ui` `INVITE_LINK_ADAPTATION`) reaches LOGIN after it.
 *
 * **Part A, the auto-START** (`INVITE_START_ADAPTATION`). On a page whose address is an invite's -- the path's segments
 * `main/online` (`INVITE_ROUTE`) and a query `inviteOf` reads -- the launcher presses START by itself, once, as soon as
 * START could be pressed: the disc ready (kept whole in this browser, read at the load; or chosen and its extraction
 * done; or the player going on from the disc), no extraction running, no overlay up, START's other needs met (a
 * controller, `startReady`), and START idle. A plain visit is unchanged (FI.R8 a); a fresh browser still gets the
 * chooser and the extraction first (FI.R8 b). With no disc yet, the Disc item says one line more (`INVITE_WAITING_LINE`).
 * A START the player presses first is the same START: the auto-START is spent then too, so it never runs twice in a page
 * (a cancelled or refused START is not pressed again by itself).
 *
 * **Part B, the invite channel** (`../../inviteHost` `INVITE_HANDOFF_ADAPTATION`, the online seat's, reused as it is:
 * `answerInvites`). While the page's session holds a sign-in and the launcher can take an invite -- its own page up, START
 * idle, no overlay, no extraction, START ready -- a ping is answered `held` with `busy: null`; an offer then is taken:
 * the address becomes the invite's (`inviteAddress`: `<base>main/online`, the other keys kept, the invite's three set),
 * START is pressed as the auto-START presses it, the tab asks for the focus, and `answerInvites` answers `taken`. A
 * signed-in launcher that cannot take one now (a dialog up, no disc, an extraction running, START under way, or its own
 * address an invite's) answers `held` with `busy: 'asking'` (INVITE-SKIP, INVITE-SKIP-FOLLOW): the asker never offers to
 * it, so a free tab answering after it -- a game tab -- gets the invite; with no free tab the asker ends busy and never
 * logs in over this session. One that stopped being free between its `held` and the offer is refused at the offer by
 * `answerInvites`, which asks `busy()` again before `take` (LATER 89: `take`'s own decline is defence in depth). The
 * channel is closed when the page gives the window up.
 */
export const INVITE_START_ADAPTATION = 'an invite address presses START once, when START is ready; the launcher takes an invite offered on s2u-invite' as const;

/** The Disc item's line while an invite waits for its disc (before the ask). A browser adaptation's own words. */
export const INVITE_WAITING_LINE = 'Your invite is waiting for your disc.';

/** The invite `loc` carries under `base` (the path `main/online` and an invite `inviteOf` reads, or `/online/lobby/<id>`), or null: a plain visit. */
export function inviteAt(loc: { pathname: string; search: string }, base: string): InviteLink | null {
  const segments = routeSegmentsOfPath(loc.pathname, base);
  const onInviteRoute = segments.length === INVITE_ROUTE.length && segments.every((s, i) => s === INVITE_ROUTE[i]);
  const lobby = lobbyInviteOf(segments);
  // The old query wins when both are present, and only on an invite address, so `/?invite=` stays a plain visit.
  if (onInviteRoute || lobby) {
    const fromQuery = inviteOf(loc.search);
    if (fromQuery) return fromQuery;
  }
  return lobby;
}

/** The invite's address on this page: `<base>main/online`, the query's other keys as written, then the invite's three; the fragment kept. */
export function inviteAddress(loc: { search: string; hash: string }, base: string, link: InviteLink): string {
  // The invite's own keys as the GAME LOBBY's link writes them (`@s2u/ui` `inviteHref`): this file writes the
  // address and reads no key of it (the launch settings' scan, `launchSettingsTable.test.ts`).
  const kept = withoutInvite(loc.search);
  const root = base.endsWith('/') ? base : `${base}/`;
  if (link.lobbyId && isLobbyId(link.lobbyId)) return `${root}online/lobby/${link.lobbyId}${kept}${loc.hash}`;
  const href = inviteHref({ origin: '', base: '/', link, hostSearch: '', dev: false });
  const invite = href.slice(href.indexOf('?') + 1);
  return `${root}${INVITE_ROUTE.join('/')}${kept ? `${kept}&` : '?'}${invite}${loc.hash}`;
}

/** What the auto-START reads, each check. */
export interface AutoStartView {
  /** The address carries an invite (FI.R8 a). */
  invite: boolean;
  /** The auto-START is spent in this page (it ran, or the player's START did). */
  spent: boolean;
  start: ConsoleState['start'];
  overlay: Overlay;
  disc: DiscState;
  /** The disc's extraction is running (its popover up, or about to be: FI.R8 b). */
  extracting: boolean;
  /** START's own needs met (`startReady`: the disc ready, a controller). */
  ready: boolean;
}

/** `off`: nothing to do (a plain visit, or spent); `met`: the player's START is under way, which spends it; `wait`; `start`. */
export type AutoStartStep = 'off' | 'met' | 'wait' | 'start';

/** The auto-START's decision (see the module's header). */
export function autoStartStep(v: AutoStartView): AutoStartStep {
  if (!v.invite || v.spent) return 'off';
  if (v.start !== 'idle') return 'met';
  if (v.disc !== 'ready' || v.extracting || v.overlay !== null || !v.ready) return 'wait';
  return 'start';
}

export interface InviteDeps {
  /** The page's session's state (`../../modern/session` `pageSession`). */
  session: { state(): SessionState };
  /** The disc adapter (`./disc`): its state, its extraction under way, its load's read of the kept extraction. */
  disc: { state(): DiscState; extracting?(): boolean; loaded?(): Promise<void> };
  /** Re-draws the page (the adapters' `notify`). */
  notify?: () => void;
  /** The site's base path; absent, the build's (`BASE_URL`). */
  base?: string;
  /** The invite channel; absent, the page's (`pageInviteChannel`). */
  open?: InviteChannelOpen;
  /** This page's id on the channel; absent, a random one. */
  id?: string;
}

export interface LiveInvite {
  /** The address's invite now, or null. */
  link(): InviteLink | null;
  /** The Disc item's line while the invite waits for its disc ('' none). */
  waiting(): string;
  /** Binds the page (`../app` `bootConsole`): `check` at each draw; `detach` when the page gives the window up. */
  attach(page: InvitePage): { check(): void; detach(): void };
}

const randomId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function liveInvite(win: Window, deps: InviteDeps): LiveInvite {
  const base = deps.base ?? String((import.meta.env as Record<string, unknown> | undefined)?.['BASE_URL'] ?? '/');
  const link = (): InviteLink | null => inviteAt(win.location, base);
  let spent = false;
  let loaded = !deps.disc.loaded;
  void deps.disc.loaded?.().then(() => { loaded = true; deps.notify?.(); }, () => { loaded = true; });

  return {
    link,
    waiting: () => (loaded && !spent && link() !== null && deps.disc.state() !== 'ready' ? INVITE_WAITING_LINE : ''),
    attach(page: InvitePage) {
      let detached = false;
      const view = (): AutoStartView => ({
        invite: link() !== null, spent, start: page.S.start, overlay: page.S.overlay, disc: deps.disc.state(),
        extracting: deps.disc.extracting?.() ?? false, ready: page.ready(),
      });
      const check = (): void => {
        if (detached) return;
        const step = autoStartStep(view());
        if (step === 'met') spent = true;
        else if (step === 'start') { spent = true; page.start(); }
      };
      // Part B: a launcher that holds a sign-in and could press START now, on a page that is not itself asking.
      const free = (): boolean => !detached && link() === null && page.S.start === 'idle' && page.S.overlay === null
        && deps.disc.state() === 'ready' && !(deps.disc.extracting?.() ?? false) && page.ready();
      const answers = answerInvites({
        open: deps.open ?? pageInviteChannel(win as Window & { BroadcastChannel?: typeof BroadcastChannel }), id: deps.id ?? randomId(),
        holds: () => deps.session.state() !== 'signed-out',          // INVITE-FOLLOW: while it holds a sign-in, free or not
        // INVITE-SKIP-FOLLOW (INVITE-SKIP's contract): a launcher that cannot take one now answers 'asking', so the
        // asker never offers to it -- a free tab answering after it gets the offer; with none, the asker ends busy.
        busy: () => (free() ? null : 'asking'),
        take: (l) => {
          // INVITE-FOLLOW (INVITE-DECLINE's contract): declined when it cannot START now, or has already taken one --
          // `free()` is false once the address carries the invite (`link()`) or START is no longer idle. Defence in depth
          // (LATER 89, kept and labelled): `answerInvites` asks `busy()` again at the offer, and `busy()` is 'asking'
          // whenever `free()` is false, so a launcher no longer free -- the gap between its `held` and the offer -- is
          // never asked to take one, and this decline does not run today; it stays for a change to that order. The layer
          // that refuses is held by `inviteHost.test.ts` ("the offer-time busy()").
          if (!free()) return false;
          markInviteTaken(l);                                           // first: the mount skips its own re-offer
          win.history.replaceState(null, '', inviteAddress(win.location, base, l));
          spent = true;
          // START after `take` returns (answerInvites posts 'taken' next); the answerer closed at START, before the
          // front end's own opens. A START refused at once (its needs gone meanwhile) drops the mark.
          queueMicrotask(() => {
            page.start();
            // The answerer closed once START is under way (the review's F4): a START refused at once drops the mark and
            // keeps answering, so a later invite tab still finds this launcher's session held.
            if (page.S.start === 'idle') clearInviteTaken();
            else answers.close();
            try { win.focus(); } catch { /* the browser's to allow */ }
          });
          return true;
        },
      });
      return { check, detach: () => { if (detached) return; detached = true; answers.close(); } };
    },
  };
}
