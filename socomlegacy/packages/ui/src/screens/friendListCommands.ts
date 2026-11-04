import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { IGNORE_STATUS_GLYPH } from './ignoreListCommands';
import type { LadderOnlineState } from './ladderLobbyCommands';
import { atoi } from './menuCommands';

/**
 * FRIENDS (`dlgFriendList.rdr`, ONL-24, web sprint 18; web research 269 §3) and the friends' eight rows of PLAT-08's
 * table -- `GetFriendsList`, `RemoveFriend`, `AddFriend`, `GetFriendInfo`, `ConfirmFriend`, `RejectFriend`,
 * `AddFriendDirectly`, `GetFriendInvitations` -- over SVC-16's friends (`packages/central/src/friends.ts`, research 268
 * §2), with the two pushes the console reads on its lobby connection (the forward, LobbyExt 0x06; the request's reply,
 * Lobby 0x44) polled. `D:L<line>` = a line of `socom2_game.elf.decomp.c`; `S:0x...` a string of the retail ELF.
 * Transcribed, cited, never pasted; reading, pending review.
 *
 * **The page is the disc's** (`tools/dump-online-dialogs.ts --dialog dlgFriendList.rdr`; research 269 §3.1): ONSTART
 * `OnFriendListStart` runs `GetFriendsList`, activates ADD NEW FRIEND and disables both lists; ADD NEW FRIEND's CROSS
 * (`OnAddNewFriendPress`) clears PLAYER_FRIEND_NAME, opens the keyboard on it and, a name typed, runs `AddFriend`;
 * MESSAGE, VIEW INFO and REMOVE FRIEND set `FriendListAction` 1, 2, 0 and hand the focus to the list; the list's CROSS
 * (`OnFriendListPress`) by that action -- REMOVE: #329 YES / NO, `RemoveFriend(INPUT_STRING)`; MESSAGE: the keyboard on
 * CHATTEXT, `SendMediusChat(CHATTEXT)` to the name `FriendInfoName` holds (ONL-23's whisper, the command's +0x10);
 * VIEW INFO: PLAYER INFO over the page (`GetPlayerInfo(INPUT_STRING)`, origin 2, FRIEND: ONL-30a's body); the list's
 * focus runs `GetFriendInfo(INPUT_STRING)`. CONFIRM FRIEND and REJECT FRIEND set `ConfirmListPurpose` 1, 2 and hand the
 * focus to the `ConfirmationList`; its CROSS confirms (`ConfirmFriend`, then `AskToAddFriend`: #336 YES / NO,
 * `AddFriendDirectly`) or asks a literal "reject?" (NO / YES) and rejects. The events: MP_PLAYER_NOT_FOUND
 * `PlayerNotFound` (a literal of 74 bytes, the whisper's), MP_PLAYER_IS_FRIEND `PlayerAlreadyFriend` (#335),
 * MP_FRIEND_CONFIRMATION_REQUESTED `OnFriendListConfirmationSent` (#337).
 *
 * **The client's two lists** (research 268 §2.1): the friends list at 0x44fdc0 (`DAT_0044fdc4` the count, pointers at
 * `DAT_0044fdc8` to the reply's 0xd0-byte rows -- the status +0x18, the account +0x1c, the name +0x20:32, the online
 * state +0x40..+0xcb, the end of list +0xcc), emptied at each ask (`FUN_00302210` D:L203018-203034); and the requests
 * to me at 0x44fe00 (`DAT_0044fe04`, 0x40-byte records at `DAT_0044fe08`: the account +0x18, the name +0x1c:32, the
 * word +0x3c), filled by the forward and by GetBuddyInvitations, emptied by nothing but an answer.
 *
 * The transport is ours (OT.R27): `FriendListService` is the page's seven `/lobby/friend-*` paths (`LOBBY_FRIEND_PATHS`)
 * with the session's ticket as the bearer (`packages/viewer/src/friendListHost.ts`). A rejection is a request never
 * answered.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog. */
export const FRIEND_LIST = 'dlgFriendList.rdr';
/** FriendListVar (S:0x3f6160): the variable `FUN_00301a70` sets, the LISTBOX `FriendList` of this page and of SOCOM II ONLINE's pane shows. */
export const FRIEND_LIST_VAR = 'FriendListVar';
/** FriendConfirmationListVar (S:0x3f6120): the variable `FUN_00301810` sets, the page's `ConfirmationList` shows. */
export const FRIEND_CONFIRMATION_LIST_VAR = 'FriendConfirmationListVar';
/** PLAYER_FRIEND_NAME (S:0x3eee20): the name `AddFriend` reads (`FUN_0027a050` D:L124254-124269), which the keyboard writes. */
export const PLAYER_FRIEND_NAME_VAR = 'PLAYER_FRIEND_NAME';
/** The info window's three variables `FUN_00301140` writes (S:0x3f6058, S:0x3f6068, S:0x3f6080). */
export const FRIEND_INFO_VARS = { name: 'FriendInfoName', game: 'FriendInfoGame', lobby: 'FriendInfoLobby' } as const;

/** The rows this module fills (PLAT-08's table: id, name, function), and the task the table names as their bodies' owner. */
export const FRIEND_LIST_COMMAND_ROWS = [
  { id: 157, name: 'GetFriendsList', fn: 0x27a2e0, task: 'ONL-24' },
  { id: 158, name: 'RemoveFriend', fn: 0x279980, task: 'ONL-24' },
  { id: 163, name: 'AddFriend', fn: 0x27a050, task: 'ONL-24' },
  { id: 164, name: 'GetFriendInfo', fn: 0x279ab0, task: 'ONL-24' },
  { id: 168, name: 'ConfirmFriend', fn: 0x279eb0, task: 'ONL-24' },
  { id: 169, name: 'RejectFriend', fn: 0x279e10, task: 'ONL-24' },
  { id: 170, name: 'AddFriendDirectly', fn: 0x279fb0, task: 'ONL-24' },
  { id: 206, name: 'GetFriendInvitations', fn: 0x27a2b0, task: 'ONL-24' },
] as const;
export type FriendListCommandName = (typeof FRIEND_LIST_COMMAND_ROWS)[number]['name'];

/** The answer LobbyExt 0x07 carries at +0x18: CONFIRM's 2 (RequestAccepted, D:L202125), REJECT's 0xfffffc27 = -985 (RequestDenied, D:L202149). */
export const FRIEND_ANSWER = { confirm: 2, reject: -985 } as const;

/**
 * The lobby and game cells for a friend on the menus (`FUN_00301a70` D:L202759-202762, `FUN_00301140`): a lobby whose
 * name opens "Medius" (S:0x3f6090, six characters, `FUN_00199648`) is drawn "MAIN MENU" (S:0x3f6098) with " "
 * (S:0x3f60a8); a friend whose PlayerStatus is 0 gets two empty cells (S:0x3f5f50, ""). Read off the ELF's bytes.
 */
export const FRIEND_MAIN_MENU = { prefix: 'Medius', lobby: 'MAIN MENU', game: ' ' } as const;

/**
 * The forward's line (`FUN_003009c0` D:L202089-202108): "%s has invited you to join their friends list." (S:0x3f5f20)
 * of the requester's name (+0x1c), to the front end screen's line call (vtable +0x2c, `FUN_001f4d20`) with the empty
 * name (S:0x3f5f50), the flag 1 and the kind 1 -- the flag in `t2`, the kind the ninth argument on the stack, read from
 * the ELF's instructions at 0x3009f8-0x300a50 (the decompiled text drops the ninth), as `CHAT_LINE_ARGS_READING` reads
 * the chat's: so a universe line, added to every room's history in state 11, else to the game lobby's panel.
 */
export const FRIEND_INVITED_LINE = { name: '', flag: 1, kind: 1 } as const;
export const friendInvitedText = (name: string): string => `${name} has invited you to join their friends list.`;

/**
 * FRIEND_REQUEST_EVENT_READING: the event ADD NEW FRIEND raises from `/lobby/friend-request`'s one answer
 * (`FRIEND_REQUEST_BY_NAME_ADAPTATION`, the server's: FindPlayer and the request in one call). The console raises
 * MP_PLAYER_NOT_FOUND when FindPlayer fails (`FUN_003015d0` D:L202562-202565) and, when it succeeds, sends the request
 * and raises MP_FRIEND_CONFIRMATION_REQUESTED **at once** (D:L202569-202576), reading no status of the request: its
 * reply's one reader acts on 2 only (`FUN_00300be0` D:L202178-202189). So here -998 (FindPlayer's not-found, an unknown
 * account) is MP_PLAYER_NOT_FOUND; any other -- Success, the server's -958 (`FRIEND_REQUEST_REFUSED_PLACEHOLDER`: a
 * second request, one on the invitee's ignore list), the caps' and the rate's -956, a DBError -- is
 * MP_FRIEND_CONFIRMATION_REQUESTED, as the console shows for any request it sent: it reads no status of the request, so
 * a refusal it cannot check itself shows nothing else (ONL-24's review, B1: the -958 once shown as MP_PLAYER_IS_FRIEND
 * followed research 268 §2.4's design line, not the code; the console raises MP_PLAYER_IS_FRIEND only before a send,
 * `FUN_003013c0` D:L202535, D:L202541). What is unread is Sony's server's status for a refused request, which the
 * console's code would not show either (ONL-32's transcript). [reading]
 */
export const FRIEND_REQUEST_EVENT_READING = '-998 MP_PLAYER_NOT_FOUND; any other MP_FRIEND_CONFIRMATION_REQUESTED' as const;

/**
 * FRIEND_EVENTS_POLL_MS_ADAPTATION (the page's half of the server's `FRIEND_EVENTS_POLL_ADAPTATION`, a browser
 * adaptation of the transport): the forward (LobbyExt 0x06) and the request's reply (Lobby 0x44) are pushes on the
 * console's lobby connection (`FUN_00300840` D:L202025-202045 files the forward's callback); the HTTP seam holds them
 * in the receiver's mailbox, so the page asks `/lobby/friend-events` once this period while the lobby is up with a
 * ticket, one request at a time, a reply taken only under the ticket it was sent with -- the chat's period
 * (`CHAT_POLL_MS_ADAPTATION`). The cost: a forward drawn up to a period late. The original has no period.
 */
export const FRIEND_EVENTS_POLL_MS_ADAPTATION = 1000;

/**
 * FRIEND_LIST_LATEST_REPLY_ADAPTATION: as the ignore list's (`IGNORE_LIST_LATEST_REPLY_ADAPTATION`), a friends-list
 * reply is taken only for the latest request, under the ticket it was sent with and still held. The console's replies
 * come in order on one connection that dies with the session. A browser adaptation of the transport.
 */
export const FRIEND_LIST_LATEST_REPLY_ADAPTATION = 'a list reply taken only for the latest request, under the ticket still held' as const;

/**
 * FRIEND_TICKET_ADAPTATION: as `IGNORE_ADD_TICKET_ADAPTATION`, a request's answer acts -- an event raised, the list
 * asked again, an invitation kept -- only under the session's ticket it was sent with: the page's HTTP answers can land
 * after a logoff and another login. A browser adaptation of the transport.
 */
export const FRIEND_TICKET_ADAPTATION = 'an answer acts only under the ticket its request began with' as const;

/** GetBuddyList_ExtraInfo's reply row (Lobby 0xd7): the fields `FUN_003020a0` keeps, as SVC-16's `/lobby/friend-list` answers them. */
export interface FriendListEntry { status: number; accountId: number; accountName: string; onlineState: LadderOnlineState; endOfList: boolean }
/** GetBuddyInvitations' reply row (LobbyExt 0x09): the account +0x1c, the name +0x20, the word +0x40 (`FUN_00301350`). */
export interface FriendInvitationEntry { status: number; accountId: number; accountName: string; addType: number; endOfList: boolean }
/** A push (`FRIEND_EVENTS_POLL_MS_ADAPTATION`): the forward (LobbyExt 0x06) or the request's reply (Lobby 0x44). */
export type FriendEvent =
  | { kind: 'forward'; accountId: number; accountName: string; addType: number }
  | { kind: 'answer'; accountId: number; accountName: string; status: number };

/** The page's half: each request sent, its reply back (a rejection is a request never answered). */
export interface FriendListService {
  /** GetBuddyList_ExtraInfo (Lobby 0xd6): the rows, the last ending the list. */
  list(): Promise<readonly FriendListEntry[]>;
  /** FindPlayer then AddToBuddyListConfirmation (LobbyExt 0x05), by name (`FRIEND_REQUEST_BY_NAME_ADAPTATION`). */
  request(q: { name: string }): Promise<{ status: number }>;
  /** AddToBuddyListFwdConfirmationResponse (LobbyExt 0x07): no reply. */
  answer(q: { accountId: number; status: number }): Promise<void>;
  /** GetBuddyInvitations (LobbyExt 0x08): the requests waiting on me. */
  invitations(): Promise<readonly FriendInvitationEntry[]>;
  /** AddToBuddyList (Lobby 0x3f), the add back. */
  add(q: { accountId: number }): Promise<{ status: number }>;
  /** RemoveFromBuddyList (Lobby 0x41). */
  remove(q: { accountId: number }): Promise<{ status: number }>;
  /** The pushes waiting (`FRIEND_EVENTS_POLL_MS_ADAPTATION`), oldest first. */
  events(): Promise<readonly FriendEvent[]>;
}

/** One record of the requests to me (0x44fe00, 0x40 bytes). */
export interface FriendRequestRecord { accountId: number; accountName: string; addType: number }

const str = (value: string): UiVarValue => ({ type: 'string', value });
const SUCCESS = 0;
const NOT_FOUND = -998;
const INPUT_STRING = 'INPUT_STRING';
const PLAYER_NAME_VAR = 'PLAYERNAMEVAR';
const LOBBY_STATE_ONLINE = 0x0b;

/** `FUN_00199648(lobby, "Medius", 6)`: the lobby's name opens "Medius". */
const onMenus = (lobbyName: string): boolean => lobbyName.slice(0, FRIEND_MAIN_MENU.prefix.length) === FRIEND_MAIN_MENU.prefix;

/**
 * The rows `FUN_00301a70` (D:L202724-202778) builds from the friends list, in order: each [`"%d"` (S:0x3f6118) of the
 * account, the name, the glyph (S:0x3f6140 for a PlayerStatus of 0, S:0x3f6148 for the rest), then for a status of 0
 * two empty cells, for a lobby named "Medius..." "MAIN MENU" and " ", else the lobby (+0x4c) and the game (+0x8c)].
 */
export function friendListRows(records: readonly FriendListEntry[]): UiVarValue[] {
  return records.map((r) => {
    const s = r.onlineState;
    const off = s.connectStatus === 0;
    const glyph = off ? IGNORE_STATUS_GLYPH.disconnected : IGNORE_STATUS_GLYPH.other;
    const [lobby, game] = off ? ['', ''] : onMenus(s.lobbyName) ? [FRIEND_MAIN_MENU.lobby, FRIEND_MAIN_MENU.game] : [s.lobbyName, s.gameName];
    return { type: 'array', value: [str(String(r.accountId | 0)), str(r.accountName), str(glyph), str(lobby), str(game)] };
  });
}

/** The rows `FUN_00301810` (D:L202654-202682) builds from the requests to me: each [`"%d"` of the account (+0x18), the name (+0x1c)]. */
export function friendConfirmationRows(records: readonly FriendRequestRecord[]): UiVarValue[] {
  return records.map((r) => ({ type: 'array', value: [str(String(r.accountId | 0)), str(r.accountName)] }));
}

/** `FUN_00198b80` (strcasecmp): the bytes compared with A-Z folded to a-z; 0 when equal. */
function caseless(a: string, b: string): boolean {
  const fold = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return fold(a) === fold(b);
}

export interface FriendListCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The page's half; absent, every request is never answered. */
  service?: FriendListService;
  /** `DAT_0044f3c8(name, 0)`: a named event into the built dialog. */
  event?: (kind: number, text: string | null) => void;
  /** The running animation's input string (`FUN_00272480(ctx + 0x18, 0)`): a row's INPUT_STRING. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** The session's ticket (`FRIEND_LIST_LATEST_REPLY_ADAPTATION`, `FRIEND_TICKET_ADAPTATION`); absent, not checked. */
  ticket?: () => string | null;
  /** The lobby session's +0x7d and state byte +0x60 (`WORLD_LOBBY_STATE_READING`); absent, up in state 11. */
  lobbyUp?: () => boolean;
  lobbyState?: () => number;
  /** The session's account name, 0x66a4f4 (`ACCOUNT_NAME_READING`); absent or null, PLAYERNAMEVAR's text. */
  accountName?: () => string | null;
  /** The front end screen's line call (vtable +0x2c, `FUN_001f4d20`): ONL-23's `BriefingRoomChat.screenLine`; absent, no line. */
  line?: (text: string, name: string | null, flag: number, kind: number) => void;
  /** A row called, as it happens. */
  log?: (name: FriendListCommandName, arg: string, answer: boolean) => void;
}

export class FriendListCommands {
  /** The friends list (0x44fdc0), each a copy of its reply row. */
  private friends: FriendListEntry[] = [];
  /** The requests to me (0x44fe00). */
  private requests: FriendRequestRecord[] = [];
  /** The latest list request's number (`FRIEND_LIST_LATEST_REPLY_ADAPTATION`). */
  private listSeq = 0;
  private nextPoll = -Infinity;
  private polling = false;

  constructor(private readonly o: FriendListCommandsOptions) {}

  private answer(name: FriendListCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  private post(event: string): void { this.o.event?.(DIALOG_EVENTS[event]!, null); }

  /** The friends list's records, in their order. */
  records(): readonly FriendListEntry[] { return this.friends; }
  /** The requests to me, in their order. */
  invitationRecords(): readonly FriendRequestRecord[] { return this.requests; }

  /**
   * `FUN_00301c40` (D:L202781-202800): the friends list's record of the name, case-blind (`FUN_00198b80`), or none --
   * PLAYER INFO's FRIEND origin reads its online state whole from it (`FUN_002f0020` D:L191859-191890).
   */
  onlineStateByName(name: string): LadderOnlineState | null {
    const r = name === '' ? undefined : this.friends.find((x) => caseless(x.accountName, name));
    return r ? { ...r.onlineState } : null;
  }

  /** `FRIEND_TICKET_ADAPTATION`: whether the session's ticket is still the one held now (absent the hook, always). */
  private sameSession(): () => boolean {
    if (this.o.ticket === undefined) return () => true;
    const ticket = this.o.ticket();
    return () => ticket !== null && this.o.ticket!() === ticket;
  }

  /** The row's text: INPUT_STRING the running animation's (`FUN_0026ed60`, `FUN_00198f18`, `FUN_00272480`), else the argument; none, null. */
  private argText(cmd: ZAnimUiCommand): string | null {
    return cmd.arg === INPUT_STRING ? this.o.inputString?.(cmd) ?? null : cmd.arg === '' ? null : cmd.arg;
  }

  // ---- the friends list ----

  /** `FUN_0027a2e0` (D:L124353-124360) -> `FUN_00301750`: the list emptied and asked; 1. */
  GetFriendsList: UiCommandHandler = (cmd) => {
    this.requestList();
    return this.answer('GetFriendsList', cmd, true);
  };

  /**
   * `FUN_00301750` (D:L202617-202629), also the answers' re-ask (`FUN_00300be0`, `FUN_00300c10`, `FUN_00301710`): the
   * list emptied (`FUN_00302210`, no draw), GetBuddyList_ExtraInfo sent (0x15 bytes, `FUN_0064ae58`) with the callback
   * `FUN_003017a0`.
   */
  private requestList(): void {
    this.friends = [];
    const seq = ++this.listSeq;
    const held = this.sameSession();
    this.o.service?.list().then((rows) => { if (seq === this.listSeq && held()) this.listReply(rows); }, () => { /* never answered */ });
  }

  /**
   * `FUN_003017a0` (D:L202632-202651), each row in turn: a status not Success (`FUN_002f42d0` "GetBuddyList", S:0x3f6108)
   * draws the list as it stands; a Success row is kept (`FUN_003020a0` D:L202951-203014: appended, the row copied whole,
   * unless a record holds its account, D:L202972) and the list drawn when it ends it (+0xcc).
   */
  listReply(rows: readonly FriendListEntry[]): void {
    for (const r of rows) {
      if (r.status !== SUCCESS) { this.drawList(); continue; }
      if (!this.friends.some((x) => x.accountId === r.accountId)) this.friends.push({ ...r, onlineState: { ...r.onlineState } });
      if (r.endOfList) this.drawList();
    }
  }

  /** `FUN_00301a70`: the rows set into FriendListVar, added TEMPORARY (`FUN_003857c0(.., 0, 1)`, `FUN_00386460`). */
  private drawList(): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(FRIEND_LIST_VAR, null, 1), { type: 'array', value: friendListRows(this.friends) });
  }

  /**
   * `FUN_00279ab0` (D:L124057-124075) -> `FUN_00301140` (D:L202393-202432): the three variables added TEMPORARY; the
   * friends list's record of the account (`strtol` of the text, `FUN_00191490`) -- none: the three empty (S:0x3f5f50);
   * else FriendInfoName the name, and a lobby named "Medius..." FriendInfoGame "MAIN MENU" and FriendInfoLobby " ", any
   * other the game (+0x8c) and the lobby (+0x4c). Local: nothing is sent. No status is tested. 1.
   */
  GetFriendInfo: UiCommandHandler = (cmd) => {
    const text = this.argText(cmd);
    if (text !== null) {
      const vars = this.o.uiVars;
      const name = vars.add(FRIEND_INFO_VARS.name, null, 1), game = vars.add(FRIEND_INFO_VARS.game, null, 1), lobby = vars.add(FRIEND_INFO_VARS.lobby, null, 1);
      const id = atoi(text);
      const r = this.friends.find((x) => x.accountId === id);
      if (!r) { vars.set(name, str('')); vars.set(game, str('')); vars.set(lobby, str('')); }
      else {
        vars.set(name, str(r.accountName));
        const menus = onMenus(r.onlineState.lobbyName);
        vars.set(game, str(menus ? FRIEND_MAIN_MENU.lobby : r.onlineState.gameName));
        vars.set(lobby, str(menus ? FRIEND_MAIN_MENU.game : r.onlineState.lobbyName));
      }
    }
    return this.answer('GetFriendInfo', cmd, true);
  };

  // ---- ADD NEW FRIEND ----

  private myName(): string | null {
    const n = this.o.accountName?.() ?? null;
    if (n !== null) return n;
    const v = this.o.uiVars.find(PLAYER_NAME_VAR)?.value;
    return v?.type === 'string' ? v.value : null;
  }

  /** `FUN_0027a050` (D:L124254-124269): PLAYER_FRIEND_NAME (added TEMPORARY when absent), its text when it holds a string (type 3), else none, to `FUN_003013c0`; 1. */
  AddFriend: UiCommandHandler = (cmd) => {
    const v = this.o.uiVars.add(PLAYER_FRIEND_NAME_VAR, null, 1).value;
    this.addFriend(v.type === 'string' ? v.value : null);
    return this.answer('AddFriend', cmd, true);
  };

  /**
   * `FUN_003013c0` (D:L202483-202544): no name raises MP_PLAYER_IS_FRIEND (S:0x3f60b0, D:L202541: the body's fall
   * through); a name on the friends list (+0x20, case-blind, D:L202500), on the requests to me (+0x1c,
   * D:L202514) or the session's own (0x66a4f4, D:L202522) raises MP_PLAYER_IS_FRIEND (D:L202535) and sends
   * nothing; else FindPlayer by the name, type 1 (D:L202524-202530), whose reply `FUN_003015d0` (D:L202547-202580)
   * raises MP_PLAYER_NOT_FOUND on a failure, else sends the request and raises MP_FRIEND_CONFIRMATION_REQUESTED -- here
   * one call and its status (`FRIEND_REQUEST_EVENT_READING`).
   */
  private addFriend(name: string | null): void {
    if (name === null) { this.post('MP_PLAYER_IS_FRIEND'); return; }
    const me = this.myName();
    if (this.friends.some((r) => caseless(r.accountName, name)) || this.requests.some((r) => caseless(r.accountName, name)) || (me !== null && caseless(me, name))) {
      this.post('MP_PLAYER_IS_FRIEND');
      return;
    }
    const svc = this.o.service;
    if (!svc) return;
    const held = this.sameSession();
    svc.request({ name }).then((r) => {
      if (!held()) return;                                                              // FRIEND_TICKET_ADAPTATION
      this.post(r.status === NOT_FOUND ? 'MP_PLAYER_NOT_FOUND' : 'MP_FRIEND_CONFIRMATION_REQUESTED');   // FRIEND_REQUEST_EVENT_READING
    }, () => { /* never answered */ });
  }

  // ---- the requests to me ----

  /**
   * `FUN_0027a2b0` (D:L124343-124350) -> `FUN_003012f0` (D:L202435-202454): only while the lobby is up (+0x7d) and in
   * state 11 (+0x60), GetBuddyInvitations sent (0x15 bytes, `FUN_0064b368`) with the callback `FUN_00301350`; 1.
   */
  GetFriendInvitations: UiCommandHandler = (cmd) => {
    if ((this.o.lobbyUp?.() ?? true) && (this.o.lobbyState?.() ?? LOBBY_STATE_ONLINE) === LOBBY_STATE_ONLINE) {
      const held = this.sameSession();
      this.o.service?.invitations().then((rows) => {
        if (!held()) return;                                                            // FRIEND_TICKET_ADAPTATION
        for (const r of rows) this.keepRequest({ accountId: r.accountId, accountName: r.accountName, addType: r.addType });   // FUN_00301350 D:L202457-202480: no status read
      }, () => { /* never answered */ });
    }
    return this.answer('GetFriendInvitations', cmd, true);
  };

  /**
   * `FUN_00301db0` (D:L202828-202881): a record with no name skipped (D:L202844); one already holding the account
   * (+0x18, D:L202849) kept as it is; else appended and the list drawn (`FUN_00301810`, D:L202877).
   */
  private keepRequest(r: FriendRequestRecord): void {
    if (r.accountName === '' || this.requests.some((x) => x.accountId === r.accountId)) return;
    this.requests.push({ ...r });
    this.drawRequests();
  }

  /** `FUN_00301810` (D:L202654-202682): the rows set into FriendConfirmationListVar, added at longevity 2 (`FUN_003857c0(.., 0, 2)`). */
  private drawRequests(): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(FRIEND_CONFIRMATION_LIST_VAR, null, 2), { type: 'array', value: friendConfirmationRows(this.requests) });
  }

  /**
   * `FUN_00279eb0` (D:L124194-124212) -> `FUN_00300a70` (D:L202111-202132): the account (`strtol` of the text), the
   * answer 2 sent whether or not it is listed (LobbyExt 0x07, no reply), then every request from it dropped and the
   * list drawn (`FUN_00301cf0` D:L202803-202825). 1.
   */
  ConfirmFriend: UiCommandHandler = (cmd) => {
    const text = this.argText(cmd);
    if (text !== null) this.answerRequest(atoi(text), FRIEND_ANSWER.confirm);
    return this.answer('ConfirmFriend', cmd, true);
  };

  /** `FUN_00279e10` (D:L124173-124191) -> `FUN_00300af0` (D:L202135-202156): as CONFIRM, with -985. 1. */
  RejectFriend: UiCommandHandler = (cmd) => {
    const text = this.argText(cmd);
    if (text !== null) this.answerRequest(atoi(text), FRIEND_ANSWER.reject);
    return this.answer('RejectFriend', cmd, true);
  };

  private answerRequest(accountId: number, status: number): void {
    this.o.service?.answer({ accountId, status }).catch(() => { /* LobbyExt 0x07 has no reply */ });
    this.requests = this.requests.filter((r) => r.accountId !== accountId);
    this.drawRequests();
  }

  /**
   * `FUN_00279fb0` (D:L124233-124251) -> `FUN_00300b70` (D:L202159-202175): AddToBuddyList for the account (`strtol`
   * of the text; +0x28), its reply `FUN_00300c10` (D:L202192-202205): Success ("AddToBuddyList", S:0x3f5f88) asks the
   * list again, anything else nothing. 1.
   */
  AddFriendDirectly: UiCommandHandler = (cmd) => {
    const text = this.argText(cmd);
    if (text !== null) {
      const held = this.sameSession();
      this.o.service?.add({ accountId: atoi(text) }).then((r) => { if (r.status === SUCCESS && held()) this.requestList(); }, () => { /* never answered */ });
    }
    return this.answer('AddFriendDirectly', cmd, true);
  };

  /**
   * `FUN_00279980` (D:L124017-124035) -> `FUN_003016a0` (D:L202583-202598): RemoveFromBuddyList for the account
   * (`strtol` of the text; +0x28), whether or not it is listed; its reply `FUN_00301710` (D:L202601-202614): Success
   * ("RemoveFromBuddyList", S:0x3f60f0) asks the list again, a failure nothing. 1.
   */
  RemoveFriend: UiCommandHandler = (cmd) => {
    const text = this.argText(cmd);
    if (text !== null) {
      const held = this.sameSession();
      this.o.service?.remove({ accountId: atoi(text) }).then((r) => { if (r.status === SUCCESS && held()) this.requestList(); }, () => { /* never answered */ });
    }
    return this.answer('RemoveFriend', cmd, true);
  };

  // ---- the pushes ----

  /**
   * One push: the forward (`FUN_003009c0` D:L202089-202108) -- the request kept (`FUN_00301db0`) and its line drawn
   * (`FRIEND_INVITED_LINE`) -- or the request's reply (`FUN_00300be0` D:L202178-202189): status 2 asks the list again,
   * any other nothing.
   */
  pushed(e: FriendEvent): void {
    if (e.kind === 'forward') {
      this.keepRequest({ accountId: e.accountId, accountName: e.accountName, addType: e.addType });
      this.o.line?.(friendInvitedText(e.accountName), FRIEND_INVITED_LINE.name, FRIEND_INVITED_LINE.flag, FRIEND_INVITED_LINE.kind);
    } else if (e.status === FRIEND_ANSWER.confirm) this.requestList();
  }

  /** Once a frame (`FRIEND_EVENTS_POLL_MS_ADAPTATION`): `/lobby/friend-events` asked when due, its pushes handled in order. */
  frame(now: number): void {
    const svc = this.o.service;
    if (!svc || !(this.o.lobbyUp?.() ?? true) || this.polling || now < this.nextPoll) return;
    const ticket = this.o.ticket?.() ?? null;
    if (this.o.ticket && ticket === null) return;
    this.polling = true;
    this.nextPoll = now + FRIEND_EVENTS_POLL_MS_ADAPTATION;
    const current = (): boolean => (this.o.lobbyUp?.() ?? true) && (this.o.ticket === undefined || this.o.ticket() === ticket);
    svc.events().then((events) => {
      this.polling = false;
      if (current()) for (const e of events) this.pushed(e);
    }, () => { this.polling = false; });
  }

  /** The entries by their table name. */
  entries(): Record<FriendListCommandName, UiCommandHandler> {
    return {
      GetFriendsList: this.GetFriendsList, RemoveFriend: this.RemoveFriend, AddFriend: this.AddFriend, GetFriendInfo: this.GetFriendInfo,
      ConfirmFriend: this.ConfirmFriend, RejectFriend: this.RejectFriend, AddFriendDirectly: this.AddFriendDirectly, GetFriendInvitations: this.GetFriendInvitations,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
