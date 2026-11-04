import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { atoi } from './menuCommands';

/**
 * IGNORE (`dlgIgnoreList.rdr`, ONL-25, web sprint 18; web research 269 §1) and the ignore list's three rows of PLAT-08's
 * table -- `GetIgnoreList`, `AddToIgnore`, `RemoveFromIgnore` -- over SVC-17's list (`packages/central/src/ignore.ts`,
 * research 263 §4). `D:L<line>` = a line of `socom2_game.elf.decomp.c`; `S:0x...` a string of the retail ELF.
 * Transcribed, cited, never pasted; reading, pending review.
 *
 * **The page is the disc's** (`tools/dump-online-dialogs.ts --dialog dlgIgnoreList.rdr`): ONSTART `OnIgnoreListStart`
 * runs `GetIgnoreList` and disables the list; IGNORE's CROSS (`OnIgnorePress`) clears PLAYER_IGNORE_NAME, opens the
 * keyboard on it (`MPPLAYERNAME`) and, the name typed, runs `AddToIgnore`; REMOVE's CROSS (`OnRemoveIgnorePress`)
 * enables and activates the list when IgnoreListVar holds a row; a row's CROSS (`OnIgnoreListPress`) asks #374 (YES
 * #253 / NO #246) and on YES runs `RemoveFromIgnore(INPUT_STRING)` -- the row's first cell; the list's TRIANGLE gives
 * the focus back to REMOVE; the screen's TRIANGLE is `goto_menu(PREVIOUS_SCREEN)` (SND_DINK), RETURN's CROSS
 * `SWITCHMENU(PREVIOUS_SCREEN)`. The three events the bodies raise are bound to the set's popups: MP_PLAYER_NOT_FOUND
 * `PlayerNotFound` (#376), MP_IGNORE_LIST_FULL `IgnoreListFull` and PLAYER_IS_IGNORED `PlayerIsAlreadyIgnored` (their
 * texts literal in the set). SOCOM II ONLINE asks the list at its ONSTART too (`get_friend_list`) and draws it in its
 * IGNORE row's pane; the briefing room's and the game lobby's chat keyboards run `AddToIgnore` on Action2
 * (`on_skb_apply_2`: `CopyUIVar` CHATMESSAGE -> PLAYER_IGNORE_NAME first, `./optionsCommands`).
 *
 * **The client's list** (0x44fde0: the count `DAT_0044fde4`, records of 0x48 bytes at `DAT_0044fde8` -- the status
 * +0x18, the account id +0x1c, the name +0x20:32, the PlayerStatus +0x40, the end of list +0x44; research 263 §4.2) is
 * one for the session: emptied at each fetch (`FUN_00302fc0` D:L203619-203626), filled by the reply, read by the add's
 * check and the remove's. Nothing else clears it (the lobby's resets do not touch it).
 *
 * The transport is ours (OT.R27): `IgnoreListService` is the page's `/lobby/ignore-list`, `/lobby/ignore-add`,
 * `/lobby/ignore-remove` and `/lobby/account-id` (NU-14's AccountGetID) with the session's ticket as the bearer
 * (`packages/viewer/src/ignoreListHost.ts`). A rejection is a request never answered.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog. */
export const IGNORE_LIST = 'dlgIgnoreList.rdr';
/** IgnoreListVar (S:0x3f6150): the variable `FUN_00301920` sets, the LISTBOX `IgnoreList` of this page and of SOCOM II ONLINE's pane shows. */
export const IGNORE_LIST_VAR = 'IgnoreListVar';
/** PLAYER_IGNORE_NAME (S:0x3eee00): the name `AddToIgnore` reads, which the keyboard (or `CopyUIVar`) writes. */
export const PLAYER_IGNORE_NAME_VAR = 'PLAYER_IGNORE_NAME';

/** The rows this module fills (PLAT-08's table: id, name, function), and the task the table names as their bodies' owner. */
export const IGNORE_LIST_COMMAND_ROWS = [
  { id: 165, name: 'GetIgnoreList', fn: 0x27a280, task: 'ONL-25' },
  { id: 166, name: 'RemoveFromIgnore', fn: 0x2798e0, task: 'ONL-25' },
  { id: 167, name: 'AddToIgnore', fn: 0x279f50, task: 'ONL-25' },
] as const;
export type IgnoreListCommandName = (typeof IGNORE_LIST_COMMAND_ROWS)[number]['name'];

/**
 * A row's third cell (`FUN_00301920` D:L202705-202710): the glyph at S:0x3f6140 (the byte 0xAA) for a PlayerStatus of 0,
 * the one at S:0x3f6148 (0xA7) for any other. One byte each, below 0xC0: the engine reads each as its own code
 * (`../text/codes.ts`), a glyph of the menus' font. The status is what the server's `/lobby/ignore-list` serves
 * (`IGNORE_PLAYER_STATUS_READING`, the server's), unchanged here.
 */
export const IGNORE_STATUS_GLYPH = { disconnected: '\xaa', other: '\xa7' } as const;

/** The arguments the rows test (S:0x3ee898). */
const INPUT_STRING = 'INPUT_STRING';

/**
/**
 * IGNORE_LIST_LATEST_REPLY_ADAPTATION: as the room list's (`ROOM_LIST_LATEST_REPLY_ADAPTATION`), a list reply is taken
 * only for the latest request, under the ticket it was sent with and still held. The console's replies come in order on
 * one connection that dies with the session; the page's HTTP replies can come out of order (a slow first fetch after
 * an add's re-fetch) and after a logoff. A browser adaptation of the transport.
 */
export const IGNORE_LIST_LATEST_REPLY_ADAPTATION = 'a list reply taken only for the latest request, under the ticket still held' as const;

/**
 * IGNORE_ADD_TICKET_ADAPTATION: the add's chain (AccountGetID, then AddToIgnoreList, then the list again) and the remove's
 * (RemoveFromIgnoreList, then the list again) go on only under the session's ticket they began with, as SVC-15a's
 * own-record read does (`sessionPlayerInfo`). The console's chain dies with its connection; the page's HTTP answers can
 * land after a logoff and another login, when a next step would act on the new account's list (an add of the first
 * account's choice) or raise its popup there. A browser adaptation of the transport.
 */
export const IGNORE_ADD_TICKET_ADAPTATION = 'an add or a remove goes on only under the ticket it began with' as const;

/** GetIgnoreList's reply row (Lobby 0xc1): the fields `FUN_00300f70` and `FUN_00301ed0` read; SVC-17's `/lobby/ignore-list` answers them by name. */
export interface IgnoreListEntry { status: number; ignoreAccountId: number; ignoreAccountName: string; playerStatus: number; endOfList: boolean }
/** AccountGetID's reply, the two fields `FUN_00300db0` reads. */
export interface IgnoreAccountReply { status: number; accountId: number }
/** AddToIgnoreList's and RemoveFromIgnoreList's request field (+0x28). */
export interface IgnoreAccountQuery { ignoreAccountId: number }

/** The page's half: each request sent, its reply back (a rejection is a request never answered). */
export interface IgnoreListService {
  /** GetIgnoreList (Lobby 0xc0): the rows, the last ending the list. */
  list(): Promise<readonly IgnoreListEntry[]>;
  /**
   * AccountGetID by name (Lobby 0x17, `FUN_00649e28` D:L561475-561495; the name at +0x26, 32 bytes, `FUN_00300c50`
   * D:L202232-202236): its reply's status (+0x1c) and account (+0x18), which `FUN_00300db0` (D:L202258-202270) reads.
   * NU-14: the services' own (`/lobby/account-id`, a logged-in account of the name, in a room or not:
   * `ACCOUNT_GET_ID_PRESENCE_READING`, the server's, on #376's "does not exist or is not currently logged in"); it was
   * SVC-18's FindPlayer, which finds only a player in a briefing room or a game.
   */
  accountId(q: { name: string }): Promise<IgnoreAccountReply>;
  /** AddToIgnoreList (Lobby 0xc2). */
  add(q: IgnoreAccountQuery): Promise<{ status: number }>;
  /** RemoveFromIgnoreList (Lobby 0xc4). */
  remove(q: IgnoreAccountQuery): Promise<{ status: number }>;
}

const str = (value: string): UiVarValue => ({ type: 'string', value });

/**
 * The rows `FUN_00301920` (D:L202685-202721) builds from the client's records, in order: each the array
 * [`"%d"` (S:0x3f6118) of the account id, the name, the status glyph] (`FUN_001988d0`, `FUN_00333610` x 3).
 */
export function ignoreListRows(records: readonly IgnoreListEntry[]): UiVarValue[] {
  return records.map((r) => ({
    type: 'array', value: [str(String(r.ignoreAccountId | 0)), str(r.ignoreAccountName), str(r.playerStatus === 0 ? IGNORE_STATUS_GLYPH.disconnected : IGNORE_STATUS_GLYPH.other)],
  }));
}

/** `FUN_00198b80` (strcasecmp): the bytes compared with A-Z folded to a-z; 0 when equal. */
function caseless(a: string, b: string): boolean {
  const fold = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return fold(a) === fold(b);
}

export interface IgnoreListCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The page's half; absent, every request is never answered. */
  service?: IgnoreListService;
  /** `DAT_0044f3c8(name, 0)`: a named event into the built dialog. */
  event?: (kind: number, text: string | null) => void;
  /** The running animation's input string (`FUN_00272480(ctx + 0x18, 0)`): a row's INPUT_STRING. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** The session's ticket, for `IGNORE_LIST_LATEST_REPLY_ADAPTATION`: a reply is dropped when it changed or is gone; absent, not checked. */
  ticket?: () => string | null;
  /** A row called, as it happens. */
  log?: (name: IgnoreListCommandName, arg: string, answer: boolean) => void;
}

export class IgnoreListCommands {
  /** The client's list (0x44fde0), each a copy of its reply row. */
  private list: IgnoreListEntry[] = [];
  /** The latest list request's number (`IGNORE_LIST_LATEST_REPLY_ADAPTATION`). */
  private listSeq = 0;

  constructor(private readonly o: IgnoreListCommandsOptions) {}

  private answer(name: IgnoreListCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  private post(event: string): void { this.o.event?.(DIALOG_EVENTS[event]!, null); }

  /** The client's records, in their order. */
  records(): readonly IgnoreListEntry[] { return this.list; }

  /** `FUN_0027a280` (D:L124333-124340) -> `FUN_00300f00`: the list asked; 1. */
  GetIgnoreList: UiCommandHandler = (cmd) => {
    this.requestList();
    return this.answer('GetIgnoreList', cmd, true);
  };

  /**
   * `FUN_00300f00` (D:L202303-202318), also the add's and the remove's success (`FUN_00300e60` D:L202292-202298,
   * `FUN_003010c0` D:L202382-202388): the client's list emptied (`FUN_00302fc0`), GetIgnoreList sent (0x26 bytes, the
   * session key at +0x15; `FUN_00649400`) with the callback `FUN_00300f70`.
   */
  private requestList(): void {
    this.list = [];
    const seq = ++this.listSeq;
    const ticket = this.o.ticket?.() ?? null;
    const current = (): boolean => seq === this.listSeq && (this.o.ticket === undefined || (ticket !== null && this.o.ticket() === ticket));
    this.o.service?.list().then((rows) => { if (current()) this.listReply(rows); }, () => { /* never answered */ });
  }

  /**
   * `FUN_00300f70` (D:L202321-202340), each row in turn: a status not Success (`FUN_002f42d0` "GetIgnoreList", S:0x3f6028:
   * status == 0) draws the list as it stands; a Success row is kept (`FUN_00301ed0` D:L202884-202948: appended unless a
   * record holds its account id, D:L202914-202921) and the list drawn when it ends it (+0x44).
   */
  listReply(rows: readonly IgnoreListEntry[]): void {
    for (const r of rows) {
      if (r.status !== 0) { this.draw(); continue; }
      if (!this.list.some((x) => x.ignoreAccountId === r.ignoreAccountId)) this.list.push({ ...r });
      if (r.endOfList) this.draw();
    }
  }

  /** `FUN_00301920`: the rows set into IgnoreListVar, added TEMPORARY (`FUN_003857c0(.., 0, 1)`, `FUN_00386460`). */
  private draw(): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(IGNORE_LIST_VAR, null, 1), { type: 'array', value: ignoreListRows(this.list) });
  }

  /**
   * `FUN_00279f50` (D:L124215-124230): PLAYER_IGNORE_NAME (added TEMPORARY when absent, `FUN_003857c0(.., 0, 1)`), its
   * text when it holds a string (type 3), else none, to `FUN_00300c50`; 1.
   */
  AddToIgnore: UiCommandHandler = (cmd) => {
    const v = this.o.uiVars.add(PLAYER_IGNORE_NAME_VAR, null, 1).value;
    this.add(v.type === 'string' ? v.value : null);
    return this.answer('AddToIgnore', cmd, true);
  };

  /**
   * `FUN_00300c50` (D:L202208-202244): no name or an empty one, nothing; a name on the client's list (case-blind,
   * D:L202221-202229) raises PLAYER_IS_IGNORED (S:0x3f5fa0, D:L202238-202240) and sends nothing; else AccountGetID by the
   * name (`IgnoreListService.accountId`), whose reply `FUN_00300db0` (D:L202246-202273) -- a status not Success
   * ("FindIgnoreListPlayerID", S:0x3f5fc0) -- raises MP_PLAYER_NOT_FOUND (S:0x3f5fe0), else sends AddToIgnoreList with
   * the account (+0x28, 0x2c bytes, `FUN_006494a0`); its reply `FUN_00300e60` (D:L202275-202301): any status but
   * Success ("AddToIgnoreList", S:0x3f6000) raises MP_IGNORE_LIST_FULL (S:0x3f6010), Success asks the list again.
   */
  private add(name: string | null): void {
    if (name === null || name === '') return;
    if (this.list.some((r) => caseless(r.ignoreAccountName, name))) { this.post('PLAYER_IS_IGNORED'); return; }
    const svc = this.o.service;
    if (!svc) return;
    const held = this.sameSession();
    svc.accountId({ name }).then((found) => {
      if (!held()) return;                                                         // IGNORE_ADD_TICKET_ADAPTATION
      if (found.status !== 0) { this.post('MP_PLAYER_NOT_FOUND'); return; }
      svc.add({ ignoreAccountId: found.accountId }).then((r) => {
        if (!held()) return;
        if (r.status !== 0) { this.post('MP_IGNORE_LIST_FULL'); return; }
        this.requestList();
      }, () => { /* never answered */ });
    }, () => { /* never answered */ });
  }

  /** `IGNORE_ADD_TICKET_ADAPTATION`: whether the session's ticket is still the one held now (absent the hook, always). */
  private sameSession(): () => boolean {
    if (this.o.ticket === undefined) return () => true;
    const ticket = this.o.ticket();
    return () => ticket !== null && this.o.ticket!() === ticket;
  }

  /**
   * `FUN_002798e0` (D:L123996-124014): the argument (`FUN_0026ed60`, the record's +8), INPUT_STRING (S:0x3ee898,
   * `FUN_00198f18`) replaced by the running animation's input string (`FUN_00272480`); a text there: its account id by
   * `strtol` base 10 (`FUN_00191490`, D:L9969-9977) to `FUN_00300fe0` (D:L202343-202366): RemoveFromIgnoreList sent only
   * for an account on the client's list (0x2c bytes, the account at +0x28; `FUN_00649540`), its reply `FUN_003010c0`
   * (D:L202370-202390): Success ("RemoveFromIgnoreList", S:0x3f6040) asks the list again; a failure says nothing. 1.
   */
  RemoveFromIgnore: UiCommandHandler = (cmd) => {
    const text = cmd.arg === INPUT_STRING ? this.o.inputString?.(cmd) ?? null : cmd.arg === '' ? null : cmd.arg;
    if (text !== null) this.remove(atoi(text));
    return this.answer('RemoveFromIgnore', cmd, true);
  };

  private remove(accountId: number): void {
    if (!this.list.some((r) => r.ignoreAccountId === accountId)) return;
    const held = this.sameSession();
    this.o.service?.remove({ ignoreAccountId: accountId }).then((r) => { if (r.status === 0 && held()) this.requestList(); }, () => { /* never answered */ });   // IGNORE_ADD_TICKET_ADAPTATION
  }

  /** The entries by their table name. */
  entries(): Record<IgnoreListCommandName, UiCommandHandler> {
    return { GetIgnoreList: this.GetIgnoreList, RemoveFromIgnore: this.RemoveFromIgnore, AddToIgnore: this.AddToIgnore };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
