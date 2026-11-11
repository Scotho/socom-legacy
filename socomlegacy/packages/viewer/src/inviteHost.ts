import {
  appendGameLobbyChat, DIALOG_EVENTS, drawnGameName, GAME_LOBBY, inviteButtonGate, INVITE_JOIN_ANIMATION, INVITE_UNIVERSE_ANIMATION, INVITE_UNIVERSE_DIALOG,
  InviteSearch, inviteHref, inviteOf, inviteUniverse, isLobbyId, lobbyInviteOf, locTextOf, uiCommandFold, widgetPad, withInviteButton as designWithInviteButton, withoutInvite, WORLD_OF_SOCOM,
  type AutoplayService, type BriefingRoomCommands, type CaptionSource, type ChannelListEntry, type DialogDesign, type GameLobbyCommands, type InviteLink,
  type LobbyService, type UiCommandHost, type UiScreen, type UiVarManager, type ValveStore, type WidgetHost, type WidgetPad, type ZAnimUiCommand,
  INVITE_ROUTE,
} from '@s2u/ui';
import { directUniverse, LobbyLinkDirect, takeLobbyLinkDirect } from './lobbyLinkDirect';
import { routeSegmentsOfPath } from './menuRoutes';

/**
 * LOBBY-INVITE's page half (web sprint 41, W41.R2; product track, OT.R53): the address's invite, the cross-tab hand-off,
 * the login guard, the GAME LOBBY button's copy, and the session's part of the flow -- SELECT UNIVERSE advanced, the
 * join started on SOCOM II ONLINE. The link's form, the search, the refusals and the button's design are `@s2u/ui`'s
 * `inviteJoin`. Every part is a labelled browser adaptation; the screens are the original's own, unchanged.
 */

// ---- the hand-off (INVITE_HANDOFF_ADAPTATION) ----

/**
 * INVITE_HANDOFF_ADAPTATION (the merge controller's ruling, 2026-10-16, with SESSION-TAKEOVER's newest-wins in mind): a
 * tab opened on an invite link first asks the other tabs of this browser, over the same-origin channel `s2u-invite`,
 * whether one holds a session (a ticket, or a login under way) -- `ping`, answered `held` with what the tab is busy
 * with (`'lobby'`: a game lobby's socket or a join under way; `'match'`: a match; `'asking'`: it holds a session but
 * cannot take an invite now -- a tab itself asking, or a holder such as the console launcher mid-extraction or with an
 * overlay up (INVITE-SKIP); else none, free). Only a free tab is sent the invite (`offer`): it keeps it pending, joins
 * it on SOCOM II ONLINE and answers `taken`; the new tab says so and stops before it reads the disc's dialogs or shows
 * LOGIN -- an 'asking' holder answering first is passed over for a free one. A tab in a lobby or a match takes
 * nothing: the new tab says which and stops, without logging in; so does one whose holders are all 'asking', or that
 * answered free and then took nothing or declined (`take` false, INVITE-DECLINE) (the review's 4).
 * No answer within the window (none holds a session, or no BroadcastChannel) and the new tab goes on to LOGIN. While its invite is
 * pending the new tab also asks again before each login and registration (`guardInviteLogin`): it never logs in while
 * another tab holds the session. A tab that is itself asking answers no ping and takes no offer, bar one tie: two tabs
 * asking at once -- the lower id answers the higher `held` ("asking"), so exactly one goes on (the review's 5). Only
 * the invite crosses -- no ticket, account or password; nothing is stored. A browser adaptation.
 */
export const INVITE_HANDOFF_ADAPTATION = 's2u-invite: ping / held{busy: lobby, match, asking or free} / offer / taken; a free holding tab takes the invite, the new tab stops' as const;
export const INVITE_HANDOFF_CHANNEL = 's2u-invite';
/** The reply window, and again the offer's (ms): one tab's message is delivered at once; a stall is no answer. A browser adaptation's own bound. */
export const INVITE_HANDOFF_WAIT_MS_ADAPTATION = 500;

export type InviteBusy = 'lobby' | 'match';
export type InviteHanded = 'taken' | 'busy-lobby' | 'busy-match' | 'busy';
/** The new tab's line for each outcome (drawn where the front end would be, then it stops). */
export const INVITE_HANDOFF_LINES: Readonly<Record<InviteHanded, string>> = {
  taken: 'The invite went to your open SOCOM II tab.',
  'busy-lobby': 'Your open SOCOM II tab is in a game lobby: leave it there, then open the link again.',
  'busy-match': 'Your open SOCOM II tab is in a game: finish there, then open the link again.',
  busy: 'Your open SOCOM II tab is busy: leave it there, then open the link again.',
};

/** The tabs (by id) of this page whose hand-off is asking now: they answer no ping and take no offer (the review's 5). */
const ASKING = new Set<string>();
/**
 * The pings an asking tab dropped (the re-review's A), by its id: answered `held` ("asking") the moment its own ask ends
 * with no holder and it goes on to log in -- the pinger's window is still open, so it never logs in beside it.
 */
const DROPPED = new Map<string, { from: string; nonce: string }[]>();

/** The hand-off's end on the page: the address consumed only when another tab took the invite (a busy outcome keeps it, the review's 7); the line. */
export function endHandOff(mount: Pick<InviteMount, 'consumed'> | null, handed: InviteHanded): string {
  if (handed === 'taken') mount?.consumed();
  return INVITE_HANDOFF_LINES[handed];
}

/** What the hand-off uses of a BroadcastChannel. */
export interface InviteChannel {
  postMessage(message: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}
export type InviteChannelOpen = () => InviteChannel | null;

type Message =
  | { v: 1; type: 'ping'; from: string; nonce: string }
  | { v: 1; type: 'held'; to: string; from: string; nonce: string; busy: InviteBusy | 'asking' | null }
  | { v: 1; type: 'offer'; to: string; from: string; nonce: string; invite: InviteLink }
  | { v: 1; type: 'taken'; to: string; from: string; nonce: string };

const isMessage = (m: unknown): m is Message => {
  const r = m as Partial<Message> | null;
  return !!r && typeof r === 'object' && r.v === 1 && typeof r.type === 'string' && typeof r.from === 'string' && typeof r.nonce === 'string';
};
const linkOk = (l: unknown): l is InviteLink => {
  const r = l as Partial<InviteLink> | null;
  return !!r && Number.isSafeInteger(r.mediusWorldId) && typeof r.game === 'string' && (r.universe === null || typeof r.universe === 'string');
};
const randomId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const pause = (ms: number): Promise<void> => new Promise((done) => { setTimeout(done, ms); });

/** The page's channel (`s2u-invite`), or null where the browser has no BroadcastChannel. */
export function pageInviteChannel(win: { BroadcastChannel?: typeof BroadcastChannel } | null): InviteChannelOpen {
  return () => {
    if (!win || typeof win.BroadcastChannel !== 'function') return null;
    const ch = new win.BroadcastChannel(INVITE_HANDOFF_CHANNEL);
    (ch as unknown as { unref?: () => void }).unref?.();   // Node's channel would hold a test process open; a browser's has no unref
    return ch as unknown as InviteChannel;
  };
}

export interface HandOffOptions {
  open: InviteChannelOpen;
  /** This tab's id (random for the page's life). */
  id: string;
  /** The window's wait (a test's); absent, `INVITE_HANDOFF_WAIT_MS_ADAPTATION` on the clock. */
  wait?: (ms: number) => Promise<void>;
  /**
   * Ping only, never an offer (a page that took its invite, INVITE_TAKEN_MARK_ADAPTATION): only a tab in a game lobby or
   * a match stops this one (its line); a free holder or an asking tab does not -- this page goes on to log in and that
   * tab's sign-in is taken over (SESSION-TAKEOVER, newest wins). The merge controller's ruling (INVITE-DECLINE's F3).
   */
  pingOnly?: boolean;
}

/** Offers `link` to a tab of this browser that holds a session: what came of it, or null (none answered; this tab goes on). */
export async function handOff(link: InviteLink, o: HandOffOptions): Promise<InviteHanded | null> {
  const ch = o.open();
  if (!ch) return null;
  const nonce = randomId(), wait = o.wait ?? pause;
  const held: { from: string; busy: InviteBusy | 'asking' | null }[] = [];
  let taken = false;
  ch.onmessage = (e) => {
    const m = e.data;
    if (!isMessage(m) || !('to' in m) || m.to !== o.id || m.nonce !== nonce) return;
    if (m.type === 'held') held.push({ from: m.from, busy: m.busy === 'lobby' || m.busy === 'match' || m.busy === 'asking' ? m.busy : null });
    else if (m.type === 'taken') taken = true;
  };
  ASKING.add(o.id);
  DROPPED.set(o.id, []);
  let outcome: InviteHanded | null = null;
  try {
    ch.postMessage({ v: 1, type: 'ping', from: o.id, nonce } satisfies Message);
    await wait(INVITE_HANDOFF_WAIT_MS_ADAPTATION);
    if (held.length === 0) return outcome;                               // none holds a session: this tab goes on (null)
    if (o.pingOnly) {
      if (held.some((h) => h.busy === 'match')) return (outcome = 'busy-match');
      if (held.some((h) => h.busy === 'lobby')) return (outcome = 'busy-lobby');
      return outcome;                                                    // free or asking: this page goes on (null)
    }
    const free = held.find((h) => h.busy === null);
    if (free) {
      ch.postMessage({ v: 1, type: 'offer', to: free.from, from: o.id, nonce, invite: { ...link } } satisfies Message);
      await wait(INVITE_HANDOFF_WAIT_MS_ADAPTATION);
      if (taken) return (outcome = 'taken');
    }
    // Someone holds a session and nobody took the invite: never a login here (the review's 4).
    if (held.some((h) => h.busy === 'match')) return (outcome = 'busy-match');
    if (held.some((h) => h.busy === 'lobby')) return (outcome = 'busy-lobby');
    return (outcome = 'busy');
  } finally {
    // Going on to log in: every ping dropped while asking answered now, so its tab does not log in too (the re-review's A).
    if (outcome === null) for (const d of DROPPED.get(o.id) ?? []) ch.postMessage({ v: 1, type: 'held', to: d.from, from: o.id, nonce: d.nonce, busy: 'asking' } satisfies Message);
    DROPPED.delete(o.id);
    ASKING.delete(o.id);
    ch.onmessage = null;
    ch.close();
  }
}

export interface InviteAnswerOptions {
  open: InviteChannelOpen;
  id: string;
  /** This tab holds a session (a ticket) or is getting one (a login under way). */
  holds(): boolean;
  /**
   * What this tab is busy with, posted in its `held` unchanged: 'lobby', 'match', `null` (free: it is offered the invite),
   * or 'asking' (INVITE-SKIP) -- it holds a session but cannot take an invite now (the console launcher mid-extraction
   * or with an overlay up): it is never offered one, so a free tab answering after it gets the offer; with no free tab
   * the asker ends busy and never logs in; a took page's ping-only check is not stopped by it (`HandOffOptions.pingOnly`).
   */
  busy(): InviteBusy | 'asking' | null;
  /**
   * The invite taken: kept pending, joined on SOCOM II ONLINE. `false` declines it (INVITE-DECLINE): no `taken` is posted,
   * so the asker, having had this tab's `held` and no `taken`, ends busy and never logs in over this tab's session. `true`
   * or nothing: taken. It is asked only when `busy()` is `null` at the offer itself, so a holder that stopped being free
   * after its `held` is refused there, before `take` (LATER 70: the console launcher mid-extraction or with an overlay up
   * answers 'asking' and is never offered one; a holder's own decline -- the launcher's, the front end's -- is defence in
   * depth for a change to that order).
   */
  take(link: InviteLink): boolean | void;
}

/** Every game tab answers the channel: `held` while it holds a session, and takes an offer while it is outside a game. */
export function answerInvites(o: InviteAnswerOptions): { close(): void } {
  const ch = o.open();
  if (!ch) return { close: () => {} };
  ch.onmessage = (e) => {
    const m = e.data;
    if (!isMessage(m) || m.from === o.id) return;
    if (ASKING.has(o.id)) {
      // This tab is asking itself: no answer, no offer taken -- but of two tabs asking at once the lower id answers the
      // higher, so exactly one goes on to its login (the review's 5).
      if (m.type === 'ping' && o.id < m.from) ch.postMessage({ v: 1, type: 'held', to: m.from, from: o.id, nonce: m.nonce, busy: 'asking' } satisfies Message);
      else if (m.type === 'ping') DROPPED.get(o.id)?.push({ from: m.from, nonce: m.nonce });   // answered if this tab goes on (the re-review's A)
      return;
    }
    if (m.type === 'ping') {
      if (o.holds()) ch.postMessage({ v: 1, type: 'held', to: m.from, from: o.id, nonce: m.nonce, busy: o.busy() } satisfies Message);
    } else if (m.type === 'offer' && m.to === o.id && linkOk(m.invite) && o.holds() && o.busy() === null) {
      // LINK-2's lobby id carried with the three (LOBBY-LINK-DIRECT found it dropped: a lobby link handed to another tab
      // became world id 0 and an empty name, refused #528 there or lost at the launcher's address).
      const lobbyId = typeof m.invite.lobbyId === 'string' && isLobbyId(m.invite.lobbyId) ? { lobbyId: m.invite.lobbyId } : {};
      if (o.take({ mediusWorldId: m.invite.mediusWorldId, game: m.invite.game, universe: m.invite.universe, ...lobbyId }) === false) return;   // declined: the asker ends busy
      ch.postMessage({ v: 1, type: 'taken', to: m.from, from: o.id, nonce: m.nonce } satisfies Message);
    }
  };
  return { close: () => { ch.onmessage = null; ch.close(); } };
}

// ---- the address's invite and the copy ----

/** The page's invite: the address's link, this tab's channel and id, the address's strip, the button's link and copy. */
export interface InviteMount {
  /** The invite the address carried, or null. */
  link: InviteLink | null;
  /** This page took the address's invite from another tab before it mounted (INVITE_TAKEN_MARK_ADAPTATION): no offer; a ping only before the login. */
  took?: boolean;
  /**
   * LOBBY_LINK_DIRECT_ADAPTATION (`./lobbyLinkDirect`, OT.R121): the launcher's START on this lobby link found the disc kept
   * whole and its session signed in as `account`, so the login path runs behind the cover, its presses made for the player,
   * until the GAME LOBBY or a screen where he must act. Absent: today's flow.
   */
  direct?: { account: string } | null;
  id: string;
  open: InviteChannelOpen;
  wait?: (ms: number) => Promise<void>;
  /** The address's invite not yet used (its join not started). */
  pending(): boolean;
  /** The join started: the invite's keys stripped from the address (INVITE_PENDING_ADAPTATION). */
  consumed(): void;
  /** The link to a game (`inviteHref` on the page's origin, base and, on a development build, its routing keys). */
  href(link: InviteLink): string;
  /** The copy (`copyText`). */
  copy(text: string): Promise<boolean>;
}

/**
 * INVITE_PENDING_ADAPTATION: the address's invite is kept, in the page and in the address (the menu routes never touch
 * the query), through LOGIN, a refused password, a registration, TRIANGLE to the main menu, a reload; the address is
 * stripped of its three keys (`replaceState`, the path, the router's state and the fragment kept) only when the join
 * starts, so a later reload does not join again. A browser adaptation.
 */
export const INVITE_PENDING_ADAPTATION = 'the invite kept in the page and the address until its join starts, then stripped' as const;

/**
 * INVITE_TAKEN_MARK_ADAPTATION (INVITE-DECLINE; INVITE-START's review F1): a page that takes an invite from another tab
 * and then mounts its own front end on the invite's address in the same document (the console launcher: its `take`
 * rewrites the address and STARTs, `launch.ts` mounting the front end directly) marks it first, in memory --
 * `markInviteTaken(link)`, the game's id and the time. `pageInvite` uses the mark once and clears it: the same id as the
 * address's `invite` and younger than `INVITE_TAKEN_MARK_TTL_MS_ADAPTATION`, this page took it -- no offer to the other
 * tabs (`offerInvite`), and before its login and registration only a ping (`guardInviteLogin`: a tab in a game lobby or a
 * match stops it, a free one does not), so a second free tab never takes the invite from under it. A different or an
 * expired mark is cleared and ignored; `clearInviteTaken` drops it (a START that does not mount). Nothing is stored: a
 * reload, a duplicated tab or another document never sees it. A browser adaptation.
 */
export const INVITE_TAKEN_MARK_ADAPTATION = 'the taken invite marked in memory by the page that took it; used once at its mount (15 s): no re-offer' as const;
/** The mark's life (ms): the launcher's START to its front end's mount, with room to spare. A browser adaptation's own bound. */
export const INVITE_TAKEN_MARK_TTL_MS_ADAPTATION = 15000;

/** The page's taken mark (INVITE_TAKEN_MARK_ADAPTATION), or null. */
let takenMark: { key: string; at: number } | null = null;

/** A lobby link and a world-id link never share a mark (`l:` against `w:`). */
function takenKey(link: InviteLink): string {
  return link.lobbyId ? `l:${link.lobbyId}` : `w:${link.mediusWorldId}`;
}

/** A page that took an invite marks it before it mounts its front end on the invite's address (INVITE_TAKEN_MARK_ADAPTATION). */
export function markInviteTaken(link: InviteLink, at: number = Date.now()): void {
  takenMark = { key: takenKey(link), at };
}

/** The mark dropped (a START that does not mount the front end). */
export function clearInviteTaken(): void {
  takenMark = null;
}

/** The mount's use of the mark, once: true when it is `link`'s and fresh at `now`; the mark cleared either way. */
function tookMarked(link: InviteLink | null, now: number): boolean {
  const mark = takenMark;
  takenMark = null;
  if (!mark || link === null || mark.key !== takenKey(link)) return false;
  const age = now - mark.at;
  return age >= 0 && age < INVITE_TAKEN_MARK_TTL_MS_ADAPTATION;
}

interface InviteWindow {
  location: { origin: string; pathname: string; search: string; hash: string };
  history: { state: unknown; replaceState(state: unknown, unused: string, url: string): void };
  navigator?: { clipboard?: { writeText(text: string): Promise<void> } };
  document?: Document | null;
  BroadcastChannel?: typeof BroadcastChannel;
}

/** The page's invite (`mountFrontEnd`): read from `search` once, with this tab's taken mark (INVITE_TAKEN_MARK_ADAPTATION). */
export function pageInvite(search: string, win: InviteWindow, o: { base?: string; dev?: boolean; now?: () => number } = {}): InviteMount {
  const base = o.base ?? String((import.meta.env as Record<string, unknown> | undefined)?.['BASE_URL'] ?? '/');
  // The old query wins when both are present (LINK-2: `?invite=` keeps working for one release).
  const link = inviteOf(search) ?? lobbyInviteOf(routeSegmentsOfPath(win.location.pathname, base));
  const now = (o.now ?? Date.now)();
  const took = tookMarked(link, now);
  const direct = takeLobbyLinkDirect(link, now);                      // LOBBY_LINK_DIRECT_ADAPTATION: the launcher's START, once
  let used = false;
  return {
    link, took, ...(direct ? { direct } : {}), id: randomId(), open: pageInviteChannel(win),
    pending: () => link !== null && !used,
    consumed: () => {
      if (used) return;
      used = true;
      const l = win.location;
      const root = base.endsWith('/') ? base : `${base}/`;
      const path = link?.lobbyId ? `${root}${INVITE_ROUTE.join('/')}` : l.pathname;
      win.history.replaceState(win.history.state, '', `${path}${withoutInvite(l.search)}${l.hash}`);
    },
    href: (l) => inviteHref({ origin: win.location.origin, base, link: l, hostSearch: win.location.search, dev: o.dev === true }),
    copy: (text) => copyText(text, win.navigator ?? {}, win.document ?? null),
  };
}

/**
 * INVITE_COPY_ADAPTATION: the button's copy -- the Clipboard API first (a key or a tap gives the page the activation
 * it needs; a pad's press gives none, and Firefox and Safari then refuse), then the copy command over a hidden field;
 * the outcome a line in the lobby's text panel (`B_CHATLIST`, `LOBBY_VOICE_LINE_ADAPTATION`'s place): "Invite link
 * copied.", or, both refused, the link itself to read out. A browser adaptation.
 */
export const INVITE_COPY_ADAPTATION = 'the Clipboard API, else the copy command; the outcome a line in B_CHATLIST' as const;
export const INVITE_COPIED_LINE = 'Invite link copied.';
export const INVITE_COPY_REFUSED_LINE = 'Copy this invite link:';

/** Copies `text`: true when the Clipboard API or the copy command took it. Never throws. */
export async function copyText(text: string, nav: { clipboard?: { writeText(text: string): Promise<void> } }, doc: Pick<Document, 'createElement' | 'execCommand' | 'body'> | null): Promise<boolean> {
  try { if (nav.clipboard) { await nav.clipboard.writeText(text); return true; } } catch { /* refused: the copy command */ }
  if (!doc) return false;
  try {
    const field = doc.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    doc.body.append(field);
    field.select();
    const ok = doc.execCommand('copy');
    field.remove();
    return ok;
  } catch { return false; }
}

// ---- the login guard ----

/**
 * The account service with each login and registration asking the other tabs first while the invite is pending. The
 * service itself is answered -- with no invite untouched, with one its two calls wrapped in place -- because the page's
 * lines (`./connectHost`'s absent-service and signed-in-elsewhere lines) are keyed on it (the review's 1).
 */
export function guardInviteLogin(svc: LobbyService, mount: InviteMount | null, handed: (h: InviteHanded) => void): LobbyService {
  if (!mount?.link) return svc;
  // A page that took its invite (INVITE_TAKEN_MARK_ADAPTATION) only pings: a tab in a game or its lobby stops it, never an offer.
  const ask = async (): Promise<InviteHanded | null> => (mount.link && mount.pending()
    ? handOff(mount.link, { open: mount.open, id: mount.id, ...(mount.wait ? { wait: mount.wait } : {}), ...(mount.took ? { pingOnly: true } : {}) }) : null);
  const never = <T>(): Promise<T> => new Promise<T>(() => {});
  const login = svc.login.bind(svc), register = svc.register.bind(svc);
  svc.login = async (q) => { const h = await ask(); if (h) { handed(h); return never(); } return login(q); };
  svc.register = async (q) => { const h = await ask(); if (h) { handed(h); return never(); } return register(q); };
  return svc;
}

/** The address's invite offered to the other tabs first (`mountFrontEnd`'s first step); null with no invite, or one this tab took (INVITE_TAKEN_MARK_ADAPTATION). */
export function offerInvite(mount: InviteMount | null): Promise<InviteHanded | null> {
  return mount?.link && !mount.took ? handOff(mount.link, { open: mount.open, id: mount.id, ...(mount.wait ? { wait: mount.wait } : {}) }) : Promise.resolve(null);
}

// ---- the button's design on the page ----

/** `@s2u/ui`'s `withInviteButton` over the session's valves: online is `ComeFromLan` 0 (before the opener has them: online). */
export function withInviteButton(lookup: (name: string) => DialogDesign | null, valves: () => ValveStore | undefined): (name: string) => DialogDesign | null {
  return designWithInviteButton(lookup, () => (valves()?.find('ComeFromLan')?.value ?? 0) === 0);
}

// ---- the session's part ----

/** The frames SOCOM II ONLINE runs before the invite's join starts (its ONSTART's requests sent). A browser adaptation's own wait. */
export const INVITE_SETTLE_FRAMES_ADAPTATION = 30;
/**
 * The frames the invite's `join_random_game` has to reach its `JoinMPGame(RANDOM)` (the row's own WAIT 0.5 is 15 frames)
 * before the arming is given up -- a popup cancelled, the row stopped: the invite dropped, no second start (the
 * re-review's B). A browser adaptation's own bound.
 */
export const INVITE_ARM_WAIT_FRAMES_ADAPTATION = 90;
/** The lobby's states that hold or are getting a session (`LOBBY_STATE`: 3 registration, 7 account login, 12 session begin, 16 the lobby server). */
const ACQUIRING: ReadonlySet<number> = new Set([3, 7, 12, 16]);
const LOGGED_IN = 11;
/** The lobby's states of a game's join (`LOBBY_STATE_JOIN_GAME` 15, `LOBBY_STATE_IN_GAME` 17) and of the room's (19, 20). */
const IN_GAME: ReadonlySet<number> = new Set([0x0f, 0x11]);
const JOINING: ReadonlySet<number> = new Set([0x0f, 0x11, 0x13, 0x14]);

interface MachineView {
  states: { top(): unknown };
  menu: unknown;
  queue: { count: number };
  /** `inputTimer` (+0x900, `SuspendMenuInput`) and the popups LOBBY_LINK_DIRECT_ADAPTATION's presses wait on. */
  shell(): { currentName: string | null; switchState: number; inputTimer?: number; screen?: UiScreen | null; popups?: { shown(screen: UiScreen | null): boolean } } | null;
}

export interface InviteSessionOptions {
  mount: InviteMount | null;
  briefing: { service?: Pick<AutoplayService, 'clearGameListFilter' | 'gameList'>; commands: Pick<BriefingRoomCommands, 'joinRoomForRandomGame'> };
  world: { commands: { rooms(): readonly ChannelListEntry[]; clan: { clanId: number } } };
  gameLobby: { commands: Pick<GameLobbyCommands, 'randomGameFound' | 'game'>; socket: { link(): unknown } | null };
  /** The session's match (`LobbyMatch`; made after this part, so asked when needed). */
  match: () => { readonly blocked: boolean; roundClock(): number | null };
  lobby: () => { up: boolean; state(): number; ticket(): string | null } | null;
  machine: () => MachineView;
  parts: {
    current: {
      widgetHost: { animation(name: string | null, argument: string | null): boolean };
      nodeCommand(cmd: ZAnimUiCommand): unknown;
      /** PLAT-15's set (LOBBY_LINK_DIRECT_ADAPTATION's presses): a control's spec, its enabled bit, a pad record to it. */
      widgets?: { specOf(name: string): unknown; enabled(spec: never): boolean; input(name: string, pad: WidgetPad, host: WidgetHost, focus?: number): boolean };
    } | null;
    o: { captions?: CaptionSource | null };
  };
  universes: { entriesEnded: boolean; find(name: string): { universeStatus: number } | null };
  uiVars: UiVarManager;
  valves: () => ValveStore;
  /** `DAT_0044f3c8(name, argument)` into the built dialog (`lobbyEventInto`). */
  event: (kind: number, text: string | null) => void;
}

export interface InviteSession {
  /** `JoinMPGame(RANDOM)` (the lobby's `randomGame`): true when it is the invite's join, whose search it starts. */
  searchArmed(): boolean;
  /** `GameLobbyCommandsOptions.joinRefused`. */
  refused(status: number, worldId: number): boolean;
  /** Once a frame. */
  frame(): void;
  /** The channel's answer: this tab holds a session, and what it is busy with. */
  holds(): boolean;
  busy(): InviteBusy | null;
  /** LOBBY_LINK_DIRECT_ADAPTATION (OT.R121): the login path runs behind the cover now -- nothing drawn, no pad read. */
  covering(): boolean;
  /** An invite taken from another tab: false when declined (this tab's own invite join armed or under way; defence in depth, LATER 89/70). */
  take(link: InviteLink): boolean;
  close(): void;
}

/** The session's part (`FrontEndSession`'s one call). */
export function connectInvite(host: Pick<UiCommandHost, 'setBindingGate'>, o: InviteSessionOptions): InviteSession {
  let link: InviteLink | null = o.mount?.link ?? null;
  let universeTried = false;
  let armed = false;
  let settle = 0;
  /** A join state seen since the invite's join began (state 11 after it is the join's end). */
  let sawJoin = false;
  /** The frames since the invite's join_random_game started (`INVITE_ARM_WAIT_FRAMES_ADAPTATION`). */
  let armedFor = 0;
  /**
   * LOBBY_LINK_DIRECT_ADAPTATION: the game socket's client seen while the link's join runs (`gameLobby.socket.link()`: held
   * from its connect, let go only at the seat's end -- a refused hello, a final close). Seen and then gone before the GAME
   * LOBBY, the join is over whatever the disc's waits still count: the cover goes at once.
   */
  let sawSocket = false;
  /** LOBBY_LINK_DIRECT_ADAPTATION: the login path's presses, for the address's own lobby link only. */
  let direct: LobbyLinkDirect | null = o.mount?.direct && o.mount.link?.lobbyId ? new LobbyLinkDirect(o.mount.direct.account) : null;
  const locText = locTextOf(o.parts.o.captions ?? null);
  const search = new InviteSearch({
    ...(o.briefing.service ? { service: o.briefing.service } : {}),
    rooms: () => o.world.commands.rooms(),
    // OT.R121: a refusal (MP_MEDIUS_JOIN_ROOM_FAILURE, the original's line) is the player's to read: the cover goes with it.
    event: (kind, text) => { if (kind === DIALOG_EVENTS['MP_MEDIUS_JOIN_ROOM_FAILURE']) direct?.reveal('refused'); o.event(kind, text); }, found: (g) => { o.gameLobby.commands.randomGameFound(g); },
    joinRoom: (n) => o.briefing.commands.joinRoomForRandomGame(n), clanId: () => o.world.commands.clan.clanId, locText,
  });
  const string = (name: string): string | null => { const v = o.uiVars.find(name)?.value; return v?.type === 'string' ? v.value : null; };

  // The button (INVITE_BUTTON_ADAPTATION, INVITE_COPY_ADAPTATION): its focus line (#486 in DescriptionText, the node
  // command READY's OnReadystart sends with its own id) and its CROSS, taken by the binding gate; no disc animation runs.
  host.setBindingGate('lobby-invite', inviteButtonGate({ node: (cmd) => o.parts.current?.nodeCommand(cmd), copy: () => { void copyLink(); } }));
  async function copyLink(): Promise<void> {
    const g = o.gameLobby.commands.game(), mount = o.mount;
    if (!g || !mount) return;
    const href = mount.href({
      mediusWorldId: g.mediusWorldId, game: drawnGameName(g.gameName), universe: string('SERVER_NAME') || null,
      ...(g.lobbyId ? { lobbyId: g.lobbyId } : {}),
    });
    const ok = await mount.copy(href);
    appendGameLobbyChat(o.uiVars, `${ok ? INVITE_COPIED_LINE : `${INVITE_COPY_REFUSED_LINE} ${href}`}\n`);
  }

  const holds = (): boolean => { const l = o.lobby(); return !!l && (l.ticket() !== null || ACQUIRING.has(l.state())); };
  // `'match'`: the match's load or a round under way; `'lobby'`: a game's join or the GAME LOBBY (the lobby in state 15 or
  // 17, or the game socket held -- the review's 2: never the held game alone, which a refused join leaves set) or this
  // tab's own invite join under way (the review's 6).
  const busy = (): InviteBusy | null => {
    const match = o.match();
    if (match.blocked || match.roundClock() !== null) return 'match';
    const l = o.lobby();
    return (l && IN_GAME.has(l.state())) || o.gameLobby.socket?.link() || armed || search.joining ? 'lobby' : null;
  };
  const answers = o.mount ? answerInvites({ open: o.mount.open, id: o.mount.id, holds, busy, take: (l) => take(l) }) : { close: () => {} };
  // An offer while this tab's own invite join is armed or under way is declined (the review's 6): its answer is busy --
  // `busy()` above is 'lobby' then, so `answerInvites` refuses the offer before `take`, and this decline is defence in
  // depth (LATER 89/70).
  function take(l: InviteLink): boolean { if (armed || search.joining) return false; link = l; universeTried = true; settle = 0; direct = null; return true; }   // a taken invite: no presses (they are the address's link's)

  /** The dialog the menu state shows with nothing switching or queued, else null. */
  const idleDialog = (): string | null => {
    const m = o.machine();
    const sh = m.states ? m.shell() : null;
    if (!m.states || m.states.top() !== m.menu || !sh || sh.switchState >= 0 || m.queue.count !== 0) return null;   // before the boot: no states
    return sh.currentName;
  };
  const same = (a: string | null, b: string): boolean => a !== null && uiCommandFold(a) === uiCommandFold(b);
  const listed = (): { name: string; up: boolean }[] => {
    const v = o.uiVars.find('SERVER_LIST')?.value;
    if (v?.type !== 'array') return [];
    return v.value.flatMap((row) => {
      const name = row.type === 'array' && row.value[0]?.type === 'string' ? row.value[0].value : null;
      return name === null ? [] : [{ name, up: (o.universes.find(name)?.universeStatus ?? 0) !== 0 }];
    });
  };
  const start = (anim: string, arg: string | null): boolean => o.parts.current?.widgetHost.animation(anim, arg) ?? false;
  /** LOBBY_LINK_DIRECT_ADAPTATION: the frame's view of the screen, and the pad's CROSS on a control (its own input, as the player's). */
  const directView = (dialog: string | null): Parameters<LobbyLinkDirect['step']>[0] => {
    const sh = o.machine().shell(), widgets = o.parts.current?.widgets;
    return {
      dialog: widgets ? dialog : null,
      popup: sh?.popups?.shown(sh.screen ?? null) ?? false,
      suspended: (sh?.inputTimer ?? 0) > 0,
      enabled: (c) => { const spec = widgets?.specOf(c); return spec !== undefined && (widgets?.enabled(spec as never) ?? false); },
      playerName: () => string('PLAYERNAMEVAR'),
      joining: armed || search.joining,                                   // the join's own time is not a stall
    };
  };
  const cross = (control: string): void => {
    const parts = o.parts.current;
    parts?.widgets?.input(control, widgetPad({ CROSS: 'FALLING' }), parts.widgetHost as WidgetHost, 0);
  };

  return {
    searchArmed: () => {
      if (!armed || link === null) return false;
      const l = link;
      link = null; armed = false;
      o.mount?.consumed();
      search.start(l);
      return true;
    },
    refused: (status, worldId) => search.refused(status, worldId),
    frame: () => {
      const dialog = idleDialog();
      // The invite's join ends -- the GAME LOBBY reached, the session gone, or the lobby back at 11 outside the GAME LOBBY
      // after a join state (a room or game refused, BACK): its refusals are the game's own again (the review's 3).
      const lobby = o.lobby();
      if (search.joining) {
        if (same(dialog, GAME_LOBBY) || !lobby?.up || lobby.ticket() === null) { search.done(); sawJoin = false; }
        else if (JOINING.has(lobby.state())) sawJoin = true;
        else if (lobby.state() === LOGGED_IN && sawJoin && dialog !== null) { search.done(); sawJoin = false; }
      }
      // LOBBY_LINK_DIRECT_ADAPTATION: the game socket seen and then gone while the link's join still runs -- the seat ended
      // before the lobby (a refused hello, a final close): revealed at once, not after the disc's waits.
      if (search.joining && direct?.covering) {
        if (o.gameLobby.socket?.link()) sawSocket = true;
        else if (sawSocket) direct.reveal('refused');
      } else sawSocket = false;
      // The re-review's B: an arming that never reached JoinMPGame(RANDOM) ends with the session, with SOCOM II ONLINE left,
      // or past its wait (the invite then dropped: no second start); `busy` never answers 'lobby' for it after.
      if (armed) {
        if (!lobby?.up || lobby.ticket() === null || (dialog !== null && !same(dialog, WORLD_OF_SOCOM))) { armed = false; settle = 0; }
        else if (++armedFor > INVITE_ARM_WAIT_FRAMES_ADAPTATION) { armed = false; link = null; o.mount?.consumed(); direct?.reveal('refused'); }
      }
      // LOBBY_LINK_DIRECT_ADAPTATION (OT.R121): behind the cover, LOGIN's CROSS, the persona form's CONNECT and USER
      // AGREEMENT's ACCEPT, once each; to the GAME LOBBY, past the join's start, or a reveal.
      if (direct?.covering) { const c = direct.step(directView(dialog)); if (c) cross(c); }
      if (link === null) return;
      // INVITE_FLOW_ADAPTATION: SELECT UNIVERSE, once per invite, when its list has come.
      if (!universeTried && same(dialog, INVITE_UNIVERSE_DIALOG) && o.universes.entriesEnded) {
        universeTried = true;
        const name = inviteUniverse(link, listed()) ?? (direct?.covering ? directUniverse(listed()) : null);   // OT.R121: the launcher's rule
        if (name !== null) start(INVITE_UNIVERSE_ANIMATION, name);
      }
      // INVITE_JOIN_ADAPTATION: SOCOM II ONLINE, logged in, its rooms answered, settled: the screen's own join_random_game, once.
      if (!same(dialog, WORLD_OF_SOCOM)) { settle = 0; return; }
      settle++;
      const l = o.lobby();
      if (armed || settle < INVITE_SETTLE_FRAMES_ADAPTATION || !l?.up || l.state() !== LOGGED_IN || o.world.commands.rooms().length === 0) return;
      armed = start(INVITE_JOIN_ANIMATION, null);
      armedFor = 0;
    },
    holds, busy, take,
    covering: () => direct?.covering ?? false,
    close: () => { answers.close(); },
  };
}
