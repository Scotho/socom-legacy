import { isLobbyId, uiCommandFold, type InviteLink } from '@s2u/ui';
import type { SessionState } from './modern/session';

/**
 * LOBBY-LINK-DIRECT (the owner, 2026-11-11 ~05:10Z, verbatim: "Make it so players coming in with a link like:
 * https://socomlegacy.com/online/lobby/TOwttYxGFFw who already have their disc installed, and who are already signed in,
 * take them straight to the lobby."; his choices ~05:40Z, MISSION OT.R121: the screens skipped entirely, the launcher's
 * acceptance of the USER AGREEMENT counting for the game's; product track, OT.R53). A browser adaptation with no original:
 * the console had no links. "The lobby" is the original's GAME LOBBY (`dlgGameLobby.rdr`), reached by its own join -- the
 * briefing room's JoinGame, state 15, state 17, `join_game` (`@s2u/ui` `INVITE_JOIN_ADAPTATION`, LINK-2).
 *
 * **When.** The launcher's START on a lobby link's address (`./console/adapters/invite`) with the disc kept whole in this
 * browser (DSH.R7's "disc added": a complete extraction) and the launcher's session `signed-in` (its login done and the
 * USER AGREEMENT accepted, `./modern/session`) marks the front end it mounts (`markLobbyLinkDirect`, in memory, used
 * once by `./inviteHost` `pageInvite`). Anything else: today's flow, the link carried through (the original's screens
 * for the player, the join after his login).
 *
 * **What is skipped: the screens, never a request.** The front end boots on LOGIN as every lobby link does
 * (`INVITE_ROUTE`) and runs the original's own login path -- LOGIN, DNAS, SELECT UNIVERSE, the persona form,
 * CONNECTING, USER AGREEMENT, SOCOM II ONLINE -- and the join, each screen's own scripts sending each request as ever,
 * but behind a cover (`./lobbyLinkCover`): none of them is drawn, and the menus read no pad meanwhile (the player's
 * presses never reach a screen he cannot see). The presses the player would make are made for him, once each, as the
 * pad's CROSS on that button (the widget's own input, `widgetPad({ CROSS: 'FALLING' })`):
 * - LOGIN (`dlgNetLogin.rdr`): `login_btn`, once it is enabled (its card read; `proceed_net_login`'s binding);
 * - the persona form (`dlgNetPlayerName.rdr`): `connect_btn`, only while it is enabled (a password in the field: the
 *   saved password's stand-in, OT.R61) and the form's PLAYERNAMEVAR is the name the launcher signed in as -- the login is
 *   then the original's, by the remember cookie (`SAVED_PASSWORD_BY_COOKIE_ADAPTATION`);
 * - USER AGREEMENT (`dlgUsagePolicy.rdr`): `YesAccept` (`ForceUsagePolicyReturn`) -- the launcher's acceptance counts
 *   (OT.R121: `signed-in` is reached only through its ACCEPT, MU-13a, or AGREEMENT-ONCE's earlier one).
 * Each only with the screen idle and settled (`LOBBY_LINK_DIRECT_SETTLE_FRAMES_ADAPTATION`), no popup up and the menu's
 * input not suspended. SELECT UNIVERSE is `INVITE_FLOW_ADAPTATION`'s advance; a lobby link names no universe, so with
 * more than one up the hidden path takes the first one up (`directUniverse`) -- the rule the launcher read its own
 * server by (`./console/universe` `readUniverseHost`), so the persona and the remember cookie are that sign-in's. The
 * login holds OT.R20 added for the eye (LOGIN's connect, DNAS) are `LOBBY_LINK_DIRECT_HOLD_SECONDS_ADAPTATION` behind
 * the cover: nothing is drawn to hold.
 *
 * **The reveal.** The cover goes -- for good, the presses ended -- at the GAME LOBBY (`lobby`), or where the player must
 * act, the screen and its message the original's: the join refused on SOCOM II ONLINE (`refused`: #441 full or
 * password-locked, #528 ended, ... -- `INVITE_REFUSAL_ADAPTATION`, the player signed in there), the persona form not
 * the signed-in name's or with no password (`persona`), a screen already pressed come back to (`returned`: a refused
 * login back on the persona form with its line), a screen off the path (`off-path`: TRIANGLE, a network error, a memory
 * card's dialog), or a screen that does not move on (`stalled`, `LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION`: a popup the
 * player must answer, a button never enabled; a join under way is not one -- b0's run of 2026-11-11: the game socket's
 * welcome alone may take 30 s). The join has its own bound, `LOBBY_LINK_DIRECT_JOIN_FRAMES_ADAPTATION`: a JoinGame or a
 * room join that never answers leaves the lobby's state where it was (the disc's `abort_join` stops its sequences and
 * changes none), so past the disc's own two waits the cover goes (`stalled`) with the player on SOCOM II ONLINE; and the
 * game socket seen and then gone while the join runs (its hello refused, a final close before the lobby) reveals at once
 * (`refused`, `./inviteHost`). Never a dead end. The address is consumed as before
 * (`INVITE_PENDING_ADAPTATION`: stripped to `main/online` once the join starts), so a reload never joins twice.
 */
export const LOBBY_LINK_DIRECT_ADAPTATION = "a lobby link opened with the disc kept whole and the launcher signed in boots into the GAME LOBBY: the original's login path and join run behind a cover, LOGIN's CROSS, the persona form's CONNECT and USER AGREEMENT's ACCEPT pressed for the player; revealed at the lobby or where the player must act, with the original's message; the join bounded by the disc's own two waits" as const;

/** The frames a screen stands idle before its press (half a second at the menus' 30 Hz): its ONSTART run. A browser adaptation's own bound. */
export const LOBBY_LINK_DIRECT_SETTLE_FRAMES_ADAPTATION = 15;

/** The frames past the settle the persona form is given to be pressable before it is revealed for the player. A browser adaptation's own bound. */
export const LOBBY_LINK_DIRECT_GRACE_FRAMES_ADAPTATION = 15;

/** The frames one screen may stand behind the cover (20 s at 30 Hz) before it is revealed for the player. A browser adaptation's own bound. */
export const LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION = 600;

/**
 * The frames the link's join may run behind the cover before it is revealed (part of `LOBBY_LINK_DIRECT_ADAPTATION`; the
 * release re-review's SHOULD, 2026-11-11): past the join's own two waits on the disc -- `dlgWorldOfSOCOM.rdr`'s
 * `join_game`: `monitor_timeout`'s WAIT 30, then `join_after_a_while`'s WAIT 33.333, each ending in `abort_join`
 * (the set as `tools/test/onlineDialogs.pinned.json` holds it) -- 63.3 s, 1898 ticks at the menus' 100/2997 s
 * (`UI_TICK_SECONDS`); 2100 (70 s) with a margin, so the bound never cuts a join the game itself still waits on. A
 * browser adaptation's own bound.
 */
export const LOBBY_LINK_DIRECT_JOIN_FRAMES_ADAPTATION = 2100;

/** OT.R20's two holds (LOGIN's connect, the DNAS screen) behind the cover, in seconds: none (nothing is drawn). A browser adaptation. */
export const LOBBY_LINK_DIRECT_HOLD_SECONDS_ADAPTATION = 0;

/**
 * The mark's life (ms): the launcher's START (its arming, the session's logout bounded by `LOGOUT_TIMEOUT_MS`) to the
 * front end's mount on the link's address. A browser adaptation's own bound.
 */
export const LOBBY_LINK_DIRECT_MARK_TTL_MS_ADAPTATION = 30_000;

/**
 * How long a lobby link's auto-START waits for the load's quick sign-in (PERSONA-PERSIST (a)) to answer before it goes on
 * as today (ms): the universe read and the login, with room to spare. A browser adaptation's own bound.
 */
export const LOBBY_LINK_QUICK_WAIT_MS_ADAPTATION = 10_000;

/** The presses, in the login path's order: the screen, its button, whether the persona form's name must be the signed-in one. */
export const LOBBY_LINK_DIRECT_PRESSES: readonly { dialog: string; control: string; named: boolean }[] = [
  { dialog: 'dlgNetLogin.rdr', control: 'login_btn', named: false },
  { dialog: 'dlgNetPlayerName.rdr', control: 'connect_btn', named: true },
  { dialog: 'dlgUsagePolicy.rdr', control: 'YesAccept', named: false },
];

/** The screens the hidden path passes through (research 128's online chain, `@s2u/ui` `MENU_ROUTES`' online rows). */
const PATH = [
  'dlgMPswitch.rdr', 'dlgNetLogin.rdr', 'dlgNetAuthenticate.rdr', 'dlgNetServerSelect.rdr', 'dlgNetPlayerName.rdr',
  'dlgNetConnect.rdr', 'dlgUsagePolicy.rdr', 'dlgWorldOfSOCOM.rdr', 'dlgMPBriefingRoom.rdr',
].map(uiCommandFold);
const LOBBY = uiCommandFold('dlgGameLobby.rdr');

/** What the launcher knows at START. */
export interface LobbyLinkFacts {
  /** The address's lobby id (`/online/lobby/<id>`), or null. */
  lobbyId: string | null;
  /** The disc's extraction kept whole in this browser (DSH.R7). */
  discWhole: boolean;
  /** The launcher's session (`signed-in`: logged in, the USER AGREEMENT accepted). */
  session: SessionState;
  /** The account the session is signed in as, or null. */
  account: string | null;
}

export type LobbyLinkRoute =
  | { route: 'direct'; lobbyId: string; account: string }
  | { route: 'menus'; why: 'no-link' | 'no-disc' | 'signed-out' };

/** The decision (`LOBBY_LINK_DIRECT_ADAPTATION`): direct only with a lobby link, the disc whole and a signed-in account. */
export function lobbyLinkRoute(f: LobbyLinkFacts): LobbyLinkRoute {
  if (f.lobbyId === null || !isLobbyId(f.lobbyId)) return { route: 'menus', why: 'no-link' };
  if (!f.discWhole) return { route: 'menus', why: 'no-disc' };
  if (f.session !== 'signed-in' || !f.account) return { route: 'menus', why: 'signed-out' };
  return { route: 'direct', lobbyId: f.lobbyId, account: f.account };
}

/** The launcher's decision, kept in memory for the front end it mounts in this document (never stored, never in the address). */
let mark: { lobbyId: string; account: string; at: number } | null = null;

/** The launcher's START decided: a direct route marked, a menus one clearing any earlier mark. */
export function markLobbyLinkDirect(r: LobbyLinkRoute, at: number = Date.now()): void {
  mark = r.route === 'direct' ? { lobbyId: r.lobbyId, account: r.account, at } : null;
}

/** The front end's mount (`./inviteHost` `pageInvite`): the mark, once, when it is the address's lobby link's and fresh; cleared either way. */
export function takeLobbyLinkDirect(link: InviteLink | null, now: number = Date.now()): { account: string } | null {
  const m = mark;
  mark = null;
  if (!m || !link?.lobbyId || link.lobbyId !== m.lobbyId) return null;
  const age = now - m.at;
  return age >= 0 && age < LOBBY_LINK_DIRECT_MARK_TTL_MS_ADAPTATION ? { account: m.account } : null;
}

/** SELECT UNIVERSE behind the cover when the link settles none: the first universe up in the list's order, or null. */
export function directUniverse(listed: readonly { name: string; up: boolean }[]): string | null {
  return listed.find((u) => u.up)?.name ?? null;
}

/** What a frame shows the hidden path. */
export interface DirectPressView {
  /** The dialog the menu state shows, idle (nothing switching or queued), or null. */
  dialog: string | null;
  /** A popup is up on it. */
  popup: boolean;
  /** The menu's input is suspended (`SuspendMenuInput`). */
  suspended: boolean;
  /** The named control is enabled. */
  enabled(control: string): boolean;
  /** The persona form's PLAYERNAMEVAR, or null. */
  playerName(): string | null;
  /**
   * The invite's join is under way (armed, or `InviteSearch.joining`: the room's join, JoinGame, the game socket's welcome,
   * up to its own 30 s): progress, not a stall -- the screen's stall count waits, the join's own count runs
   * (`LOBBY_LINK_DIRECT_JOIN_FRAMES_ADAPTATION`); the join's refusals and ends reveal it sooner.
   */
  joining?: boolean;
}

/** Why the cover went (see the module's header). */
export type DirectReveal = 'lobby' | 'refused' | 'persona' | 'returned' | 'off-path' | 'stalled';

/** The hidden path for one mount: the screen it stands on, for how long, the presses done, and the reveal. */
export class LobbyLinkDirect {
  /** The last idle dialog (folded), and the frames since it changed (the stall's count). */
  private at: string | null = null;
  private onIt = 0;
  /** The frames the link's join has been under way, all told (the join's own bound). */
  private joiningFor = 0;
  /** The frames the current screen has stood idle and settled (the press's count). */
  private settled = 0;
  private readonly done = new Set<string>();
  private why: DirectReveal | null = null;

  constructor(readonly account: string) {}

  /** The cover stands: not revealed yet. */
  get covering(): boolean { return this.why === null; }
  /** Why it was revealed, or null. */
  get revealed(): DirectReveal | null { return this.why; }

  /** Revealed for `why` (the first reason kept); the presses end. */
  reveal(why: DirectReveal): void { if (this.why === null) this.why = why; }

  /** Once a frame: the control to press now, or null; a reveal as it comes. */
  step(v: DirectPressView): string | null {
    if (this.why !== null) return null;
    const d = v.dialog === null ? null : uiCommandFold(v.dialog);
    if (d !== null && d !== this.at) {
      this.at = d; this.onIt = 0; this.settled = 0;
      if (d === LOBBY) { this.reveal('lobby'); return null; }
      if (!PATH.includes(d)) { this.reveal('off-path'); return null; }
      if (this.done.has(d)) { this.reveal('returned'); return null; }
    }
    // A join under way is not the screen's stall, and is bounded by its own count: never covered for good.
    if (v.joining ? ++this.joiningFor >= LOBBY_LINK_DIRECT_JOIN_FRAMES_ADAPTATION : ++this.onIt >= LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION) { this.reveal('stalled'); return null; }
    if (d === null || this.done.has(d)) return null;                       // pressed: the screen's own scripts go on
    if (v.popup || v.suspended) { this.settled = 0; return null; }
    const p = LOBBY_LINK_DIRECT_PRESSES.find((x) => uiCommandFold(x.dialog) === d);
    if (!p || ++this.settled < LOBBY_LINK_DIRECT_SETTLE_FRAMES_ADAPTATION) return null;
    if (v.enabled(p.control) && (!p.named || v.playerName() === this.account)) {
      this.done.add(d);
      return p.control;
    }
    // The persona form not the signed-in name's, or with no password: the player's, shown to him.
    if (p.named && this.settled >= LOBBY_LINK_DIRECT_SETTLE_FRAMES_ADAPTATION + LOBBY_LINK_DIRECT_GRACE_FRAMES_ADAPTATION) this.reveal('persona');
    return null;
  }
}
