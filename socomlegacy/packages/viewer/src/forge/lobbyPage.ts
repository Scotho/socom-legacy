import { pinnedForgeDoor, type PinnedSocketUrl } from '../connectHost';
import type { GameLobbyHandOff } from '../gameLobbyHost';
import type { EnterAnswer, ForgeLobbyHandOff } from './lobbyClient';
import { LOBBY_PASSWORD_MAX, lobbyPasswordOk } from './lobby/deps';
import type { MenuItem } from './padMenu';

/**
 * FORGE (FG-26; FG.R20-R23, a browser adaptation with no original): the page's lobby pieces, pure -- the START menu's
 * rows for the lobby (the popup's open and close are the forge's START menu, a toolbar button and the window's close,
 * FG.R22; never the pad's Home button), the typing guard the forge's development keys answer first (FG.R23: typing in
 * the lobby's chat is allowed in every build and reaches no forge shortcut), the lobby's default name, the create card's
 * visibility toggle (FG-45) and password field (FG-48a), a locked lobby's join (FG-48a, `joinLockedLobby`), the host's
 * leave in its order (the FG-48 batch review's F2, `leaveLobbyInOrder`; the re-review's F1, no request once the socket is
 * gone, and `forgetStaleHost`), and the match's hand-off over the lobby's client (`./match` `startForgeLobbyMatch`, as
 * `../gameLobbyHost` hands the game lobby's on); LATER 275, where the lobby's socket opens (`lobbySocketOf`).
 */

/** The lobby as the menu sees it: none, or one open (the page's role in it, whether its window shows, whether it ended). */
export interface LobbyRowsState {
  lobby: { name: string; role: 'host' | 'joiner'; shown: boolean; ended: boolean } | null;
  /** A layout to post (a base loaded, nothing busy). */
  canCreate: boolean;
}

export interface LobbyRowActs {
  create(): void;
  show(on: boolean): void;
  /** LEAVE: a joiner's seat let go; FG-48c the host's hands the lobby on (closed with none to take it). */
  leave(): void;
  /** FG-48c: the host's "Close the lobby", for everyone. */
  close(): void;
  copyLink(): void;
}

/**
 * The START menu's lobby rows. `role` is the page's now (FG-48c: `host` while its seat carries the host's flag, a
 * successor's too -- `lobbyHostProof`): the host's LEAVE hands the lobby on, and its "Close the lobby" is a row of its own.
 */
export function lobbyMenuItems(s: LobbyRowsState, a: LobbyRowActs): MenuItem[] {
  const l = s.lobby;
  if (!l || l.ended) {
    return [{ id: 'lobby-create', label: 'Create lobby', note: 'This layout on the server: others join from its link, then the host launches the match', disabled: !s.canCreate, act: () => a.create() }];
  }
  const host = l.role === 'host';
  return [
    { id: 'lobby-window', label: l.shown ? 'Hide the lobby' : 'Show the lobby', value: l.name, note: 'The lobby window: READY, SWITCH SIDES, ARMORY, chat, voice', act: () => a.show(!l.shown) },
    { id: 'lobby-link', label: 'Copy the lobby link', note: 'The address others open to join', act: () => a.copyLink() },
    { id: 'lobby-leave', label: 'Leave the lobby', ...(host ? { note: 'The lobby passes to the next player; with none left it closes' } : {}), act: () => a.leave() },
    ...(host ? [{ id: 'lobby-close', label: 'Close the lobby', note: 'It ends for every player in it', act: () => a.close() }] : []),
  ];
}

/**
 * FG-48c (FG.R24; a product-track adaptation, no original): how this page proves the lobby's host -- the host ticket
 * (the creator's, until a hand-on) and the bearer of the host's requests (`./lobbyClient` `setListed`, `setPassword`,
 * `kickSeat`, `handOnLobby`, `closeLobby`).
 */
export interface LobbyHostProof { hostTicket: string | null; bearer: string | null }

/**
 * FG-48c: this page's proof of the host, or null when it does not host -- its own seat's host flag (`me`, the room's
 * view; before the welcome, null, the creator's page stands on its host ticket, the creator's path) and something to
 * prove it with: the creator's host ticket, or a bearer -- the login's ticket, or an FG-28 guest successor's pass (the
 * only proof it has; `forgeBearerIdentify` takes it). A guest creator proves itself by its host ticket alone (FG-38: its
 * pass is never the host's bearer). FG.R21's ticketless seat has nothing to prove itself by.
 */
export function lobbyHostProof(
  l: { role: 'host' | 'joiner'; hostTicket: string | null; ticket: string | null; guest: boolean }, me: { host: boolean } | null,
): LobbyHostProof | null {
  const flagged = me !== null ? me.host : l.role === 'host' && l.hostTicket !== null;
  if (!flagged) return null;
  const bearer = l.guest && l.hostTicket !== null ? null : l.ticket;
  if (l.hostTicket === null && bearer === null) return null;
  return { hostTicket: l.hostTicket, bearer };
}

/**
 * The FG-48 re-review's F1 (FG.R24; a product-track adaptation, no original): a told lobby (the `gameLobby` view) that
 * names another seat as host -- its host flag on a seat not this page's own (`me`, the room's view) -- drops this page's
 * creator's proof: `hostTicket` set to null, so `lobbyHostProof` no longer stands on the creator's path (its fallback
 * before a seat, and after the match, when `me` is null). A page that handed the lobby on then never proves itself host
 * again with a dead ticket, on any path; handed the host back, it proves itself by its bearer, as any successor. Nothing
 * dropped while this page has no seat yet (`me` null), when its own seat is the host, or when no seat is. Whether it
 * dropped the ticket.
 */
export function forgetStaleHost(
  l: { hostTicket: string | null }, ev: { seats: readonly { id: number; host: boolean }[] }, me: { id: number } | null,
): boolean {
  if (me === null || l.hostTicket === null) return false;
  if (!ev.seats.some((s) => s.host && s.id !== me.id)) return false;
  l.hostTicket = null;
  return true;
}

/**
 * The FG-48 batch review's F2 (FG.R24; a product-track adaptation, no original): how long the host's LEAVE or CLOSE LOBBY
 * waits for its request before the socket closes anyway, ms -- a few seconds, so a dead server never holds the page. A
 * page policy.
 */
export const LOBBY_LEAVE_WAIT_MS = 4000;

/** F2: what the host's leave asks of the page, in its order. */
export interface LobbyLeaveEffects {
  /**
   * The host's request -- the close's DELETE (`./lobbyClient` `closeLobby`) or the LEAVE's POST (`handOnLobby`) -- its
   * failure in words; null when this page hosts nothing (a joiner: nothing to ask).
   */
  request: (() => Promise<{ ok: true } | { ok: false; words: string }>) | null;
  /** The lobby's socket closed (`ForgeLobbySession.close`). */
  closeSocket(): void;
  /** A line said (the page's `say`, as its other refusals). */
  say(line: string): void;
  /** The bound's timer (tests hold it); absent, a `setTimeout` of `ms`, cleared once the request settles. */
  wait?: (ms: number) => Promise<void>;
  /**
   * The re-review's F1: the lobby's socket is already gone -- at a lobby match's end the match's close shut it (the
   * session handed it to the match), or the start failed after the hand-off -- so the socket's close was the hand-on
   * (the server's `leave`, the same successor) and nothing is asked after it: a request then would meet a 403 and say an
   * untrue line. Absent or false, the socket is still the session's (an explicit LEAVE or CLOSE LOBBY): F2's order.
   */
  socketGone?: boolean;
}

/**
 * F2: how the leave ended -- nothing asked (a joiner), the request done, refused or failed, or the bound lapsed; the
 * re-review's F1 `gone`, nothing asked because the socket was already gone.
 */
export type LobbyLeaveEnd = 'none' | 'gone' | 'done' | 'failed' | 'timeout';

/**
 * F2: the host's LEAVE (`leave`) or CLOSE LOBBY (`close`) in its order -- the request first, the socket closed only once
 * it settles, or once `waitMs` has lapsed with no answer. The order matters: the server reading the socket's end first
 * would hand the lobby on and drop the old host's proof (FG-48c), so a CLOSE then met a 403 and the lobby stayed open
 * under the successor, and a LEAVE with none to take it left the lobby waiting for its host instead of closing it. A
 * failure, a throw or the bound's lapse is said; the socket is closed after it all the same. With no request (a joiner)
 * the socket closes at once, in the caller's own tick. The re-review's F1: with the socket already gone (`socketGone`, a
 * lobby match's end) nothing is asked and nothing said -- the socket's close was the hand-on -- and the session is let go
 * at once, in the caller's own tick (`closeSocket`: nothing left to close).
 */
export async function leaveLobbyInOrder(what: 'leave' | 'close', e: LobbyLeaveEffects, waitMs: number = LOBBY_LEAVE_WAIT_MS): Promise<LobbyLeaveEnd> {
  if (e.socketGone) { e.closeSocket(); return 'gone'; }
  if (!e.request) { e.closeSocket(); return 'none'; }
  const failed = what === 'close' ? 'the lobby was not closed' : 'the lobby was not handed on';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lapse = e.wait ? e.wait(waitMs) : new Promise<void>((r) => { timer = setTimeout(r, waitMs); });
  const wordsOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));
  let end: LobbyLeaveEnd = 'failed';
  try {
    let asked: Promise<string | null>;
    try {
      asked = e.request().then((a) => (a.ok ? null : a.words), wordsOf);
    } catch (err) {
      asked = Promise.resolve(wordsOf(err));                         // a request that threw before its promise
    }
    const first = await Promise.race([asked.then((words) => ({ words })), lapse.then(() => null)]);
    if (first === null) {
      end = 'timeout';
      e.say(`the server did not answer the ${what} in ${waitMs / 1000} s: the lobby may still be open`);
    } else if (first.words !== null) {
      end = 'failed';
      e.say(`${failed}: ${first.words}`);
    } else {
      end = 'done';
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    e.closeSocket();
  }
  return end;
}

/** Whether a key's target is a place text is typed into (the chat's input, the docks' fields): no forge shortcut reads it. */
export function typingTarget(t: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t.isContentEditable || t.contentEditable === 'true';
}

/** The server's bound on a lobby's name (`forgeLobby.ts` `FORGE_LOBBY_NAME_MAX`: 1..32 printable ASCII). */
export const LOBBY_NAME_MAX = 32;

/** The name a lobby is offered under: the map's label, printable ASCII only, cut to the server's bound. */
export function defaultLobbyName(label: string): string {
  const clean = label.replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();
  return (clean ? `Forge: ${clean}` : 'Forge').slice(0, LOBBY_NAME_MAX).trim();
}

/**
 * FG-45 (FG.R24; a product-track adaptation, no original): the create card's visibility toggle, beside the lobby's name --
 * "Show in Custom matches" (the modern UI's Lobbies), off unless ticked. The mouse and the keyboard set it here; the pad
 * sets it from the window afterwards (the host's LISTED / UNLISTED control).
 */
export function lobbyVisibilityToggle(doc: Document): { root: HTMLLabelElement; listed(): boolean } {
  const root = doc.createElement('label');
  root.className = 'fx-toggle fx-lobby-visibility';
  const box = doc.createElement('input');
  box.type = 'checkbox';
  box.checked = false;
  const text = doc.createElement('span');
  text.textContent = 'Show in Custom matches';
  root.title = 'Listed in Play online, Lobbies, for anyone to join; unticked, the lobby is joined by its link alone';
  root.append(box, text);
  return { root, listed: () => box.checked };
}

/**
 * FG-48a (FG.R24; a product-track adaptation, no original): the create card's optional password, under the visibility
 * toggle -- a masked field cut at the server's bound (`LOBBY_PASSWORD_MAX`); empty, an open lobby (`password()` null);
 * `ok()` false for one the server would refuse (`lobbyPasswordOk`). Typed by a keyboard; the pad sets it later from the
 * window's PASSWORD card.
 */
export function lobbyPasswordField(doc: Document): { root: HTMLLabelElement; password(): string | null; ok(): boolean } {
  const root = doc.createElement('label');
  root.className = 'fx-lobby-password';
  const text = doc.createElement('span');
  text.textContent = 'Password (optional)';
  const field = doc.createElement('input');
  field.type = 'password';
  field.className = 'fx-search';
  field.maxLength = LOBBY_PASSWORD_MAX;
  field.autocomplete = 'off';
  field.placeholder = 'None: anyone with the link joins';
  root.title = 'Players type it before they join; the host may change or clear it from the lobby window';
  root.append(text, field);
  return {
    root,
    password: () => (field.value === '' ? null : field.value),
    ok: () => field.value === '' || lobbyPasswordOk(field.value),
  };
}

/**
 * FG-48a (FG.R24; a product-track adaptation, no original): what the locked join asks of the page -- the password card
 * (`ask`, null a cancel), the entry over `POST .../enter` with a bearer (`./lobbyClient` `enterLocked`), a fresh guest
 * pass (`renew`: FG-38's `askGuest`; null for a login-ticket seat, which has none to renew), and a line said.
 */
export interface LockedJoinEffects {
  ask(line: string): Promise<string | null>;
  enter(password: string, bearer: string): Promise<EnterAnswer>;
  renew: (() => Promise<{ ok: true; bearer: string } | { ok: false; words: string }>) | null;
  say(line: string): void;
}

/** The locked join's end: admitted under `bearer` (the hello's ticket), cancelled, or stopped with the line to say. */
export type LockedJoinAnswer = { ok: true; bearer: string } | { ok: false; cancelled: true } | { ok: false; cancelled: false; line: string };

/**
 * FG-48a, extracted at its review (F3a), with F2: a locked lobby's join -- its password asked in a card, the seat entered
 * by its bearer; a wrong password, 429 (the address's tries) or 400 said and asked again; a cancel the join's end; any
 * other refusal its stop. F2: FG-28's 60 s idle bound runs while the card is open, so a guest's pass may lapse there
 * (401): a guest seat is given a fresh pass once and entered again with the same typed password, and the hello then
 * carries the fresh pass (`bearer` in the answer). A login-ticket seat's 401 stops, as does a second one.
 */
export async function joinLockedLobby(name: string, bearer: string, e: LockedJoinEffects): Promise<LockedJoinAnswer> {
  let seat = bearer;
  let renewed = false;
  let line = `${name} asks a password before you join.`;
  for (;;) {
    const typed = await e.ask(line);
    if (typed === null) return { ok: false, cancelled: true };
    let entered = await e.enter(typed, seat);
    if (!entered.ok && entered.status === 401 && e.renew && !renewed) {
      renewed = true;
      const fresh = await e.renew();
      if (!fresh.ok) return { ok: false, cancelled: false, line: `No fresh guest pass for this lobby: ${fresh.words}.` };
      seat = fresh.bearer;
      entered = await e.enter(typed, seat);
    }
    if (entered.ok) return { ok: true, bearer: seat };
    if (!entered.wrong && entered.status !== 429 && entered.status !== 400) return { ok: false, cancelled: false, line: `The lobby did not admit you: ${entered.words}.` };
    line = `Not admitted: ${entered.words}. Type it again.`;
    e.say(`not admitted: ${entered.words}`);
  }
}

/**
 * LATER 275 (SA-7i's page half; product track, the transport -- a browser adaptation with no original): where the
 * lobby's socket opens and with what. No seat (a lobby central runs itself, `npm run local`'s): the page's pinned `/ws`
 * and no token, as before. A placed lobby's seat (`./lobbyClient` `ForgeSeat`: the create's, or a joiner's
 * `askForgeSeat`): its door pinned by `pinnedForgeDoor` (the devmode loopback only where the page's pin allows it,
 * `PinnedSocketUrl.devDoors`) and its token. A door the page does not follow: null, and the page says so.
 */
export function lobbySocketOf(pinned: PinnedSocketUrl, seat: { door: string; token: string } | null): { url: string; token: string | null } | null {
  if (!seat) return { url: pinned.url, token: null };
  const door = pinnedForgeDoor(seat.door, pinned.devDoors);
  return door ? { url: door.url, token: seat.token } : null;
}

/**
 * The match's hand-off (`../matchMount` `MatchMountOptions.handOff`) over the lobby's client: the lobby's name as the
 * game's, the base's stem as its mission (as Play's), the pinned socket the client was opened on. The forge lobby is no
 * room-service game: `mediusWorldId` 0 and no ticket (the match's drop reconnect names a game, not a forge lobby -- the
 * limit said in `./match`).
 */
export function matchHandOff(h: ForgeLobbyHandOff, o: { gameName: string; mission: string; pinned: PinnedSocketUrl; lateJoiner: boolean }): GameLobbyHandOff {
  return {
    mediusWorldId: 0, gameName: o.gameName, mission: o.mission, lateJoiner: o.lateJoiner,
    client: h.client, pinned: o.pinned, ticket: '', held: true, welcome: h.welcome, roundStart: h.roundStart,
  };
}
