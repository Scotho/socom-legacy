import { DIALOG_EVENTS, type DialogDesign, type DialogRecord } from '../dialog';
import { uiCommandFold, type UiBindingGate } from '../uiCommands';
import { NODE_OP_BASE } from '../widgets/host';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { AUTOPLAY_CLEAR_ROOM_FILTER, AUTOPLAY_LIST_QUERY, clanFieldAdmits, playerJoinFull, type AutoplayService } from './autoplayCommands';
import { drawnGameName, type GameListEntry } from './briefingRoomCommands';
import { GAME_LOBBY } from './gameLobbyCommands';
import type { ChannelListEntry } from './worldOfSocomCommands';

/**
 * LOBBY-INVITE (web sprint 41, the owner's word, W41.R2; product track, OT.R53): the GAME LOBBY's invite link and its
 * login-to-join flow. The console had no invite links: every part here is a labelled browser adaptation, and every
 * screen the invitee sees is the original's own, unchanged. Pure: no DOM, no viewer (the page's half is
 * `packages/viewer/src/inviteHost.ts`).
 *
 * - **The link** (`INVITE_LINK_ADAPTATION`): `<origin><base>main/online?invite=<world id>&game=<drawn name>&universe=<name>`.
 * - **The join** (`INVITE_JOIN_ADAPTATION`): on SOCOM II ONLINE the page runs the screen's own `join_random_game`
 *   (AUTOPLAY's row) and its `JoinMPGame(RANDOM)` runs `InviteSearch` in AUTOPLAY's place: the invited game found in
 *   the list, then AUTOPLAY's own tail -- the game held, MP_RANDOM_GAME_FOUND, the room joined, state 15, state 17,
 *   `join_game`, the GAME LOBBY (research 265 §2, `./autoplayCommands`).
 * - **The refusals** (`INVITE_REFUSAL_ADAPTATION`): the original's own strings through SOCOM II ONLINE's text popup.
 * - **SELECT UNIVERSE** (`INVITE_FLOW_ADAPTATION`): `inviteUniverse`.
 * - **The button** (`INVITE_BUTTON_ADAPTATION`): `withInviteButton`.
 */

/**
 * INVITE_LINK_ADAPTATION: the link's form. The path `main/online` is the menu routes' LOGIN (`../routes/menuRoutes`,
 * OT.R10): the deep link lands there past the boot, the intro movies and the main menu, with no new code. The query
 * names the game by its world id and its drawn name (a stale link after a server restart refuses, not joins another
 * game) and the universe the host is in; a development build also copies the host's own `devmode`, `devtools` and
 * `server=` (the routing keys `accountServiceBase` honours there: `server=` under the dev-tools switch, which `devmode`
 * includes) and nothing else. No ticket, account, persona or password: the three
 * values are what every player in the room's game list sees. A browser adaptation.
 */
export const INVITE_LINK_ADAPTATION = 'with a lobby id: /online/lobby/<id>; else main/online?invite=<world id>&game=<drawn name>&universe=<name>; dev: devmode, devtools and server= copied' as const;
/** A share id: base64url, about 10 characters (LINK-1). The same bound the server mints. */
export const LOBBY_ID_RE = /^[A-Za-z0-9_-]{10,22}$/;
export function isLobbyId(id: string): boolean { return LOBBY_ID_RE.test(id); }
export const INVITE_PARAM = 'invite';
export const INVITE_GAME_PARAM = 'game';
export const INVITE_UNIVERSE_PARAM = 'universe';
/** The route's segments: LOGIN TO SOCOM II ONLINE (`MENU_ROUTES`' `online` under `main`). */
export const INVITE_ROUTE = ['main', 'online'] as const;
/** The host keys a development build's link copies (`accountServiceBase`, `universeServiceBase`, `pinnedMatchSocket`). */
const DEV_KEYS = ['devmode', 'devtools', 'server'] as const;
/** The longest drawn name or universe name the link takes (a Medius name is 64 bytes at most). */
const NAME_MAX = 64;

export interface InviteLink {
  mediusWorldId: number;
  /** The game's drawn name (`drawnGameName`: the cut at "$~"). */
  game: string;
  /** The host's universe (SERVER_NAME), or null. */
  universe: string | null;
  /** LINK-1: the share id. Present, the link is `/online/lobby/<id>` and the search matches that id. */
  lobbyId?: string;
}

const nameOk = (v: string): boolean => v.length >= 1 && v.length <= NAME_MAX && !/[\u0000-\u001f\u007f]/.test(v);

/** The invite an address carries, or null (none, or one that does not read). Never throws. */
export function inviteOf(search: string): InviteLink | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return null; }
  const id = q.get(INVITE_PARAM) ?? '', game = q.get(INVITE_GAME_PARAM), universe = q.get(INVITE_UNIVERSE_PARAM);
  if (!/^\d{1,10}$/.test(id) || Number(id) > 0x7fffffff || game === null || !nameOk(game)) return null;
  return { mediusWorldId: Number(id), game, universe: universe !== null && nameOk(universe) ? universe : null };
}

/** The address's query without the invite's three keys, every other part as written (`''` when none is left). */
export function withoutInvite(search: string): string {
  const keep = search.replace(/^\?/, '').split('&').filter((part) => {
    if (part === '') return false;
    const key = decodeURIComponent(part.split('=')[0]!.replace(/\+/g, ' '));
    return key !== INVITE_PARAM && key !== INVITE_GAME_PARAM && key !== INVITE_UNIVERSE_PARAM;
  });
  return keep.length ? `?${keep.join('&')}` : '';
}

/** The path `/online/lobby/<id>`, or null. Never a path under `/lobby`. */
export function lobbyInviteOf(segments: readonly string[]): InviteLink | null {
  if (segments.length === 3 && segments[0] === 'online' && segments[1] === 'lobby' && isLobbyId(segments[2]!)) {
    return { mediusWorldId: 0, game: '', universe: null, lobbyId: segments[2] };
  }
  return null;
}

export function isLobbyLinkPath(segments: readonly string[]): boolean {
  return lobbyInviteOf(segments) !== null;
}

/** The link the GAME LOBBY's button copies (`INVITE_LINK_ADAPTATION`). A lobby id copies the path; without one, the query. */
export function inviteHref(o: { origin: string; base: string; link: InviteLink; hostSearch: string; dev: boolean }): string {
  const parts: string[] = [];
  if (o.dev) {
    for (const part of o.hostSearch.replace(/^\?/, '').split('&')) {
      const key = part.split('=')[0]!;
      if ((DEV_KEYS as readonly string[]).includes(key) && !parts.some((p) => p.split('=')[0] === key)) parts.push(part);
    }
  }
  const base = o.base.endsWith('/') ? o.base : `${o.base}/`;
  if (o.link.lobbyId && isLobbyId(o.link.lobbyId)) {
    const q = parts.length ? `?${parts.join('&')}` : '';
    return `${o.origin}${base}online/lobby/${o.link.lobbyId}${q}`;
  }
  const q = new URLSearchParams();
  q.set(INVITE_PARAM, String(o.link.mediusWorldId));
  q.set(INVITE_GAME_PARAM, o.link.game);
  if (o.link.universe !== null) q.set(INVITE_UNIVERSE_PARAM, o.link.universe);
  parts.push(q.toString());
  return `${o.origin}${base}${INVITE_ROUTE.join('/')}?${parts.join('&')}`;
}

// ---- SELECT UNIVERSE (INVITE_FLOW_ADAPTATION) ----

/**
 * INVITE_FLOW_ADAPTATION: the choices the invite already settles are taken for the invitee, once, on the original's own
 * screens: on SELECT UNIVERSE (`dlgNetServerSelect.rdr`) the page starts the screen's own `select_server` with the
 * universe this answers -- what the SERVERLIST's CROSS on that row starts (its binding, the row's string the argument)
 * -- the link's universe when it is listed and up, else the only one up; more than one and none named is a real
 * choice: no advance. DNAS stays as the game shows it; the persona form is the game's own (its prefill puts a saved
 * persona's name in, and the cursor on PASSWORD -- or, for a persona saved under SAVE PASSWORD: YES, its password drawn and
 * the cursor on CONNECT, MISSION OT.R61). A browser adaptation.
 */
export const INVITE_FLOW_ADAPTATION = 'SELECT UNIVERSE advanced once to the link\'s universe, or the only one up; DNAS and the persona form the game\'s own' as const;
/** The universe screen and its row's animation (`dlgNetServerSelect.rdr`'s SERVERLIST CROSS). */
export const INVITE_UNIVERSE_DIALOG = 'dlgNetServerSelect.rdr';
export const INVITE_UNIVERSE_ANIMATION = 'select_server';

/** The universe the invite settles among the listed ones (each up or not), or null: a real choice. */
export function inviteUniverse(link: InviteLink, listed: readonly { name: string; up: boolean }[]): string | null {
  const up = listed.filter((u) => u.up);
  if (link.universe !== null && up.some((u) => u.name === link.universe)) return link.universe;
  return up.length === 1 ? up[0]!.name : null;
}

// ---- the search (INVITE_JOIN_ADAPTATION) and the refusals (INVITE_REFUSAL_ADAPTATION) ----

/**
 * INVITE_JOIN_ADAPTATION: on SOCOM II ONLINE, with the session logged in (state 11) and the room list answered, the page
 * runs the screen's own `join_random_game` once for a pending invite; its `JoinMPGame(RANDOM)` (`FUN_002f83b0`
 * D:L197147-197155) then runs `InviteSearch` in AUTOPLAY's place: FilterID 10 cleared, the list asked (1 of 999),
 * the game found by world id and drawn name, AUTOPLAY's own candidate checks (a seat free past the spectator slots,
 * not closed, no password, the clan field admits), then AUTOPLAY's tail as the original runs it (`FUN_002f9220`
 * D:L197693-197710: the game held, MP_RANDOM_GAME_FOUND, `JoinMPRoom` with the room's name). A browser adaptation.
 */
export const INVITE_JOIN_ADAPTATION = 'join_random_game run for the invite; JoinMPGame(RANDOM) searches the invited game, then AUTOPLAY\'s tail' as const;
/** SOCOM II ONLINE's AUTOPLAY row's animation, run for the invite. */
export const INVITE_JOIN_ANIMATION = 'join_random_game';

/**
 * INVITE_REFUSAL_ADAPTATION: an invite that cannot be joined is refused on SOCOM II ONLINE with the original's own
 * strings, through the screen's text popup (MP_MEDIUS_JOIN_ROOM_FAILURE -> `OnJoinRoomFailure`: the text for 2 s, the
 * AUTOPLAY strip stopped, the BRIEFING ROOMS list lit with #805): full or password-protected #441 "Game Full or Locked",
 * ended (not listed, closed, renamed, its room gone) #528, another clan's game #524, the rank refused #525, any other
 * refused join #426. A JoinGame refused while the invite joins (the room filled since the list) is shown the same way
 * (`refused`, `GameLobbyCommandsOptions.joinRefused`) instead of AUTOPLAY's #803. A browser adaptation.
 */
export const INVITE_REFUSAL_ADAPTATION = 'refusals as #441 / #528 / #524 / #525 / #426 through OnJoinRoomFailure\'s text popup' as const;
export const INVITE_REFUSAL_TEXT_IDS = { full: 441, ended: 528, clan: 524, rank: 525, failed: 426 } as const;
export type InviteRefusal = keyof typeof INVITE_REFUSAL_TEXT_IDS;
/**
 * JoinGame's statuses (server `lobby.ts` `joinGame`): WorldIsFull -948 and InvalidPassword -978 are full or locked,
 * GameNotFound -977 ended, MediusFail -966 the rank refusal's (`RANK_REFUSED_STATUS_PLACEHOLDER`), anything else failed.
 */
const JOIN_REFUSALS: ReadonlyMap<number, InviteRefusal> = new Map([[-948, 'full'], [-978, 'full'], [-977, 'ended'], [-966, 'rank']]);

export interface InviteSearchOptions {
  /** The briefing room's transport, as AUTOPLAY's (`/lobby/clear-filter`, `/lobby/game-list`). */
  service?: Pick<AutoplayService, 'clearGameListFilter' | 'gameList'>;
  /** The client's rooms (0x44f568). */
  rooms: () => readonly ChannelListEntry[];
  /** `DAT_0044f3c8(name, argument)`: a named event into the built dialog, with its text. */
  event: (kind: number, text: string | null) => void;
  /** The game found: the lobby holds it for state 15's JoinGame (`GameLobbyCommands.randomGameFound`). */
  found: (game: GameListEntry) => void;
  /** `FUN_002e3790` with the random-join flag set (`BriefingRoomCommands.joinRoomForRandomGame`). */
  joinRoom: (name: string) => boolean;
  /** The client's clan id; absent, -1. */
  clanId?: () => number;
  /** A UIMnLOC string by id (`locTextOf`). */
  locText: (id: number) => string | null;
}

export class InviteSearch {
  private seq = 0;
  /** The invite's join is under way (from the room's join to the GAME LOBBY, a refusal, or its end another way). */
  private active = false;
  /** The invited game's world id while its join is under way (the review's 3: only its refusals are the invite's). */
  private invited = -1;

  constructor(private readonly o: InviteSearchOptions) {}

  /** Whether the invite's join is under way. */
  get joining(): boolean { return this.active; }

  private refuse(kind: InviteRefusal): void {
    this.active = false;
    const id = INVITE_REFUSAL_TEXT_IDS[kind];
    this.o.event(DIALOG_EVENTS['MP_MEDIUS_JOIN_ROOM_FAILURE']!, this.o.locText(id) ?? `#${id}`);
  }

  /** `JoinMPGame(RANDOM)`'s chain aimed at `link`. */
  start(link: InviteLink): void {
    const seq = ++this.seq, svc = this.o.service;
    this.active = false;
    if (!svc) return;
    const live = (): boolean => seq === this.seq;
    svc.clearGameListFilter({ ...AUTOPLAY_CLEAR_ROOM_FILTER })
      .then(() => (live() ? svc.gameList({ ...AUTOPLAY_LIST_QUERY }) : null))
      .then((list) => { if (list && live()) this.pick(link, list); })
      .catch(() => { /* never answered: the chain stands, as AUTOPLAY's */ });
  }

  private pick(link: InviteLink, list: readonly GameListEntry[]): void {
    const g = link.lobbyId
      ? list.find((e) => e.status === 0 && e.lobbyId === link.lobbyId)
      : list.find((e) => e.status === 0 && e.mediusWorldId === link.mediusWorldId && drawnGameName(e.gameName) === link.game);
    if (!g || g.worldStatus === 3) { this.refuse('ended'); return; }
    // A CPU's seat is free to the invited player (B138, `playerJoinFull`), as central admits it.
    if ((g.securityLevel & 1) !== 0 || playerJoinFull(g)) { this.refuse('full'); return; }
    if (!clanFieldAdmits(g.genericField3, this.o.clanId?.() ?? -1)) { this.refuse('clan'); return; }
    const room = this.o.rooms().find((r) => r.mediusWorldId === g.genericField1);
    if (!room) { this.refuse('ended'); return; }
    this.o.found(g);
    this.o.event(DIALOG_EVENTS['MP_RANDOM_GAME_FOUND']!, null);
    this.active = true;
    this.invited = g.mediusWorldId;
    if (!this.o.joinRoom(room.lobbyName)) this.active = false;
  }

  /**
   * The invite's join ended -- the GAME LOBBY reached, the lobby back at state 11 outside it, the session gone (the page's
   * `connectInvite` tells it): its refusals are the original's again.
   */
  done(): void { this.active = false; this.seq++; }

  /**
   * A JoinGame refused (`GameLobbyCommandsOptions.joinRefused`) for `worldId`: true when it is the invited game's, its
   * join still under way, and the invite showed its own line; any other refusal is the game's own (the review's 3).
   */
  refused(status: number, worldId: number): boolean {
    if (!this.active || worldId !== this.invited) return false;
    this.refuse(JOIN_REFUSALS.get(status) ?? 'failed');
    return true;
  }
}

// ---- the button (INVITE_BUTTON_ADAPTATION) ----

/**
 * INVITE_BUTTON_ADAPTATION: the online GAME LOBBY (`dlgGameLobby.rdr` with `ComeFromLan` 0) gains a fourth BUTTON,
 * READY's own record copied -- `brown_back.tif`, `brown_back_real.tif` and its glow when lit, 150 x 30 -- in the empty
 * slot under READY at (16, 183) (the column's 30 px pitch; the lists start at y 218), after READY in the control list
 * (DOWN from READY reaches it), its caption the disc's #377 "INVITE PLAYERS", READY's own two bindings kept and
 * re-aimed at the port (`inviteButtonGate`, the page's binding gate; no animation of the disc's runs): its ONACTIVATE
 * draws the disc's #486 "¦ Invite players to join." in the description strip -- the node command READY's `OnReadystart`
 * sends (`DescriptionText.op1(#348)`, op 1 `Caption` with the string id), the same node, the same op -- so the strip
 * names the focused button as every lobby button's does, and the next button's own ONACTIVATE draws its line when the
 * focus moves on; its CROSS copies the link. A browser adaptation.
 */
export const INVITE_BUTTON_ADAPTATION = 'the online GAME LOBBY\'s fourth BUTTON (READY\'s look, (16, 183), #377); CROSS copies the link' as const;
export const INVITE_BUTTON = 'InviteButton';
export const INVITE_BUTTON_CAPTION = '_377_InvitePlayers_MSG';
/** The button's CROSS: a name no disc animation has, taken by the page's binding gate (`UiCommandHost.setBindingGate`). */
export const INVITE_COPY_ANIMATION = 's2u_invite_copy_link';
/** The button's ONACTIVATE: a name no disc animation has, taken by the same gate. */
export const INVITE_DESCRIBE_ANIMATION = 's2u_invite_describe';
/** Its focus line: the disc's #486 "¦ Invite players to join." (the clan screens' own help line). */
export const INVITE_DESCRIPTION_LOC = 486;
/** The strip the lobby's buttons write on focus (`OnReadystart`, `OnSteamStart`, `OnGameweaponstart`). */
const DESCRIPTION_NODE = 'DescriptionText';
const BUTTON_BELOW = 'PlayerReady';

/** The dialog lookup with the online GAME LOBBY's invite button (`INVITE_BUTTON_ADAPTATION`); every other design as read. */
export function withInviteButton(lookup: (name: string) => DialogDesign | null, online: () => boolean): (name: string) => DialogDesign | null {
  return (name) => {
    const d = lookup(name);
    if (!d || uiCommandFold(name) !== uiCommandFold(GAME_LOBBY) || !online()) return d;
    const at = d.controls.findIndex((c) => c.name === BUTTON_BELOW);
    const ready = d.controls[at];
    if (!ready || ready.widget.type !== 'BUTTON' || d.controls.some((c) => c.name === INVITE_BUTTON)) return d;
    const button = ready.widget.button;
    // READY's two bindings, re-aimed: ONACTIVATE (its help line) and CROSS.
    const bindings = button.bindings.flatMap((b) => {
      if (b.kind === 'event' && b.name === 'ONACTIVATE') return [{ ...b, animation: INVITE_DESCRIBE_ANIMATION, argument: null }];
      if (b.kind === 'button' && b.name === 'CROSS') return [{ ...b, animation: INVITE_COPY_ANIMATION, argument: null }];
      return [];
    });
    const invite: DialogRecord = {
      ...ready, name: INVITE_BUTTON, y: ready.y + button.size[1],
      widget: { ...ready.widget, uivar: null, button: { ...button, caption: INVITE_BUTTON_CAPTION, bindings } },
    };
    return { ...d, controls: [...d.controls.slice(0, at + 1), invite, ...d.controls.slice(at + 1)] };
  };
}

/** `DescriptionText.op1(#486)`: the node command `OnReadystart` sends with its own id (op 1 `Caption`, the s16 string id). */
export function inviteDescriptionCommand(): ZAnimUiCommand {
  return {
    anim: INVITE_DESCRIBE_ANIMATION, sequence: INVITE_DESCRIBE_ANIMATION, nodeIndex: 1, node: DESCRIPTION_NODE, opcodeByte: NODE_OP_BASE + 1,
    fn: 'Caption', arg: '', loc: INVITE_DESCRIPTION_LOC, bytes: new Uint8Array(0x10),
  };
}

/**
 * The page's binding gate for the button (`UiCommandHost.setBindingGate`): on the GAME LOBBY, its ONACTIVATE's name
 * writes the strip through the built dialog's node commands (`DialogParts.nodeCommand`), its CROSS's copies. Every other
 * binding is the original's.
 */
export function inviteButtonGate(o: { node: (cmd: ZAnimUiCommand) => unknown; copy: () => void }): UiBindingGate {
  return (b) => {
    if (uiCommandFold(b.dialog) !== uiCommandFold(GAME_LOBBY)) return false;
    if (b.animation === INVITE_DESCRIBE_ANIMATION) { o.node(inviteDescriptionCommand()); return true; }
    if (b.animation === INVITE_COPY_ANIMATION) { o.copy(); return true; }
    return false;
  };
}
