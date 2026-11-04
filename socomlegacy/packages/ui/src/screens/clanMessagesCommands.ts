import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { LobbyClan } from './createClanCommands';

/**
 * The clan messages (ONL-29, web sprint 18's clans' half; web research 274): the member's pane -- SOCOM II ONLINE's
 * MESSAGES band "Clan messages" (#775) -- and the leader's EDIT NEWS on the leader's roster, with their five rows of
 * PLAT-08's table -- `GetClanMessages`, `SendClanMessage`, `GetLeaderMessages`, `ModifyClanMessage`,
 * `DeleteClanMessage` -- over SVC-10's GetMyClanMessages, GetAllClanMessages, SendClanMessage, ModifyClanMessage and
 * DeleteClanMessage (`packages/central/src/clans.ts`, research 262 §5). `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; `S:0x...` a string of the retail ELF. Transcribed, cited, never pasted; reading, pending
 * review.
 *
 * **The band is the disc's** (`tools/dump-online-dialogs.ts --dialog dlgWorldOfSOCOM.rdr`; research 274 §1): the
 * `motd` WRAPPEDTEXT's children `ClanMessages` (a WRAPPEDTEXT on MEDIUS_CLAN_MESSAGES), `DescFieldMid` and
 * `ClanMessageText` (#775), shown with `motd` by MESSAGES' ONACTIVATE `OnNewsbtn`. MEDIUS_CLAN_MESSAGES (S:0x3f3900, the
 * lobby's +0xcc) is the empty string from the session's start (`FUN_002df6a0` D:L182212-182214) and written only by
 * GetMyClanMessages and its replies (`myClanMessages`, `myClanMessagesReply`), which GetMyClans' success sends (ONL-27's
 * GetClan, `./manageRosterCommands`, the seam research 274 §1.3 left), and by a quit's and a disband's success ("No clan
 * messages.", ONL-27's rows).
 *
 * **The leader's edit is the disc's** (`--dialog dlgManageRosterLeader.rdr`; research 274 §2): ONSTART
 * `MRosterLeaderStartData` runs `GetLeaderMessages`; EDIT NEWS' ONACTIVATE `OnEditNewsBtn` (#485) shows `motd` and the
 * LISTBOX `ClanMessageList` on ClanLeaderMessages, its CROSS `OnEditNewsPress` enables and activates the list (#498); a
 * row's CROSS (`SendClanMessage`, the animation) clears SEND_CLAN_MESSAGE, opens the game's keyboard on it (`ChatSkb`,
 * #497, 199 characters of 199 bytes), waits on `skb_done` and runs `ModifyClanMessage(INPUT_STRING)` -- the row's first
 * cell, its id, "-1" for the new one; its CIRCLE runs `DeleteClanMessage(INPUT_STRING)`; its TRIANGLE
 * `OnMRosterLeaderStart`. The events are the set's popups: CLAN_MESSAGE_ID_ERR #503, CLAN_MESSAGE_EMPTY #504.
 *
 * The transport is ours (OT.R27): `ClanMessagesService` is the page's `/clan/messages`, `/clan/all-messages`,
 * `/clan/send-message`, `/clan/modify-message` and `/clan/delete-message` with the session's ticket as the bearer
 * (`packages/viewer/src/clanMessagesHost.ts`). A rejection is a request never answered.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The rows this module fills (PLAT-08's table: id, name, function), and the task the table names as their bodies' owner. */
export const CLAN_MESSAGES_COMMAND_ROWS = [
  { id: 81, name: 'SendClanMessage', fn: 0x2797f0, task: 'ONL-29' },
  { id: 138, name: 'GetClanMessages', fn: 0x279790, task: 'ONL-29' },
  { id: 159, name: 'GetLeaderMessages', fn: 0x27a0b0, task: 'ONL-29' },
  { id: 160, name: 'ModifyClanMessage', fn: 0x27a0e0, task: 'ONL-29' },
  { id: 161, name: 'DeleteClanMessage', fn: 0x27a1c0, task: 'ONL-29' },
] as const;
export type ClanMessagesCommandName = (typeof CLAN_MESSAGES_COMMAND_ROWS)[number]['name'];

/** MEDIUS_CLAN_MESSAGES (S:0x3f3900; the lobby's +0xcc, `FUN_002df6a0` D:L182212-182214): the member's pane, the band's text. */
export const MEDIUS_CLAN_MESSAGES_VAR = 'MEDIUS_CLAN_MESSAGES';
/** ClanLeaderMessages (S:0x3f3f20): the leader's list, `ClanMessageList`'s rows. */
export const CLAN_LEADER_MESSAGES_VAR = 'ClanLeaderMessages';
/** SEND_CLAN_MESSAGE (S:0x3eedb0): the text the leader's keyboard writes and the post and the edit read. */
export const SEND_CLAN_MESSAGE_VAR = 'SEND_CLAN_MESSAGE';
/** The pane while the read is out (S:0x3f4460; `FUN_002e8460` D:L187496, `FUN_002e8bd0` D:L187824). */
export const CLAN_MESSAGES_RETRIEVING = 'Retrieving messages from server...';
/** The pane when the read is refused or holds none (S:0x3f3f60; `FUN_002e84e0` D:L187521-187523). */
export const NO_CLAN_MESSAGES = 'No clan messages.';
/** The separator each message is drawn after (S:0x3f44a8; `FUN_002e84e0` D:L187554). */
export const CLAN_MESSAGE_SEPARATOR = '\n';
/** The new message's row: its id "-1" (S:0x3f3f10) and its blank text (S:0x3f3f18; `FUN_002e6400` D:L186377-186383). */
export const CLAN_MESSAGE_NEW_ID = -1;
const BLANK_CELL = ' ';
/** The leader's list offers the new-message row only below five (`FUN_002e6400` D:L186377: `DAT_0044f764 < 5`). */
export const CLAN_MESSAGE_SLOTS = 5;

/** Both reads' words (`FUN_002e8460` D:L187497-187501, `FUN_002e6310` D:L186315-186318): start 1, page 999. */
export const CLAN_MESSAGES_PAGE = { start: 1, pageSize: 999 } as const;

/** The arguments the rows test (S:0x3ee898). */
const INPUT_STRING = 'INPUT_STRING';
/** The lobby's state in the menus (`WORLD_LOBBY_STATE_READING`, `./worldOfSocomCommands`): 0x0b. */
const LOBBY_STATE_ONLINE = 0x0b;
/** `FUN_003857c0(.., 0, 1)`: TEMPORARY. */
const TEMPORARY = 1;

/**
 * CLAN_MESSAGES_LATEST_REPLY_ADAPTATION: as the sent list's (`INVITED_PLAYERS_LATEST_REPLY_ADAPTATION`,
 * `./invitedPlayersCommands`), a read's replies -- the member's pane's and the leader's list's -- are taken only for the
 * latest request of their kind, under the ticket it was sent with and still held. The console's replies come in order
 * on one connection that dies with the session; the page's HTTP replies can come out of order (the leader's list is
 * asked again after each post, edit and delete) and after a logoff. A browser adaptation of the transport.
 */
export const CLAN_MESSAGES_LATEST_REPLY_ADAPTATION = 'a read\'s replies taken only for the latest request, under the ticket still held' as const;

/**
 * CLAN_MESSAGE_TICKET_ADAPTATION: a post's, an edit's or a delete's reply asks the leader's list again only under the
 * session's ticket the request began with, as the invitations' chains (`CLAN_INVITE_TICKET_ADAPTATION`). A browser
 * adaptation of the transport.
 */
export const CLAN_MESSAGE_TICKET_ADAPTATION = 'a post, an edit or a delete asks the list again only under the ticket it began with' as const;

/** One Lobby 0x6d reply (`MediusGetMyClanMessagesResponse`): the fields `FUN_002e84e0` reads (+0x18, +0x20) and the two it does not. */
export interface MyClanMessageReply { status: number; clanId: number; message: string; endOfList: boolean }
/** One Lobby 0x7f reply (`MediusGetAllClanMessagesResponse`): `FUN_002e65b0` keeps +0x1c the id, +0x20 the text, +0xe8 the state, +0xec the list's end. */
export interface ClanMessageReply { status: number; clanMessageId: number; message: string; clanMessageStatus: number; endOfList: boolean }

/** The page's half: each request sent, its reply back (a rejection is a request never answered). */
export interface ClanMessagesService {
  /** GetMyClanMessages (Lobby 0x6c, 0x34 bytes: the clan id +0x28, start +0x2c, page +0x30; `FUN_00645ec0`). */
  myMessages(q: { clanId: number; start: number; pageSize: number }): Promise<readonly MyClanMessageReply[]>;
  /** GetAllClanMessages (Lobby 0x7e, 0x30 bytes: start +0x28, page +0x2c; `FUN_00646520`). */
  allMessages(q: { start: number; pageSize: number }): Promise<readonly ClanMessageReply[]>;
  /** SendClanMessage (Lobby 0x6e, 0xee bytes: the text +0x26:200; `FUN_00645f60`). */
  send(q: { message: string }): Promise<{ status: number }>;
  /** ModifyClanMessage (Lobby 0x70, 0xf4 bytes: the id +0x28, the text +0x2c:200; `FUN_00646008`). */
  modify(q: { clanMessageId: number; newMessage: string }): Promise<{ status: number }>;
  /** DeleteClanMessage (Lobby 0x72, 0x2c bytes: the id +0x28; `FUN_006460b0`). */
  delete(q: { clanMessageId: number }): Promise<{ status: number }>;
}

/** A message the leader's list keeps (0x44f760's 0xf0-byte records, `FUN_002e65b0` D:L186393-186450): the id, the text, the state. */
export interface ClanMessageRecord { clanMessageId: number; message: string; clanMessageStatus: number }

const str = (value: string): UiVarValue => ({ type: 'string', value });

/** `strtol(s, 0, 10)` (`FUN_00191490`): the leading integer, else 0. */
function strtol(s: string | null): number {
  const m = /^\s*([+-]?\d+)/.exec(s ?? '');
  return m ? Number(m[1]) | 0 : 0;
}

/**
 * The leader's rows as `FUN_002e6400` (D:L186347-186390) builds them from the kept messages, in order: each [its id
 * "%d" (S:0x3f3ef8), its text, "Message %d:" (S:0x3f3f00) counting from 1]; then, below five, ["-1", " ",
 * "Message %d:"] -- the row a new message is written on.
 */
export function clanLeaderMessageRows(kept: readonly { clanMessageId: number; message: string }[]): UiVarValue[] {
  const rows: UiVarValue[] = kept.map((m, i) => ({ type: 'array', value: [str(String(m.clanMessageId)), str(m.message), str(`Message ${i + 1}:`)] }));
  if (kept.length < CLAN_MESSAGE_SLOTS) {
    rows.push({ type: 'array', value: [str(String(CLAN_MESSAGE_NEW_ID)), str(BLANK_CELL), str(`Message ${kept.length + 1}:`)] });
  }
  return rows;
}

/**
 * The member's pane after one GetMyClanMessages reply (`FUN_002e84e0` D:L187508-187560): a status not Success
 * (`FUN_002f42d0` "GetMyClanMessages", S:0x3f4490: status == 0) sets "No clan messages."; a Success builds an array of
 * the strings the pane already holds when it is an array (its string elements only, D:L187529-187553), then "\n" and
 * the reply's text (D:L187554-187557).
 */
export function clanMessagesPane(held: UiVarValue, r: MyClanMessageReply): UiVarValue {
  if (r.status !== 0) return str(NO_CLAN_MESSAGES);
  const kept = held.type === 'array' ? held.value.filter((e) => e.type === 'string') : [];
  return { type: 'array', value: [...kept, str(CLAN_MESSAGE_SEPARATOR), str(r.message)] };
}

export interface ClanMessagesCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The client's clan (`WorldOfSocomCommands.clan`): its id, the one GetMyClanMessages carries (`DAT_0044f59c`). */
  clan: LobbyClan;
  /** The page's half; absent, every request is never answered. */
  service?: ClanMessagesService;
  /** `DAT_0044f3c8(name, 0)`: a named event into the built dialog. */
  event?: (kind: number, text: string | null) => void;
  /** The running animation's input string (`FUN_00272480(ctx + 0x18, 0)`): a row's INPUT_STRING. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** The lobby session's +0x7d and its state byte +0x60 (`WORLD_LOBBY_STATE_READING`); absent, up in state 11. */
  lobbyUp?: () => boolean;
  lobbyState?: () => number;
  /** The session's ticket, for the two adaptations; absent, not checked. */
  ticket?: () => string | null;
  /** A row called, as it happens. */
  log?: (name: ClanMessagesCommandName, arg: string, answer: boolean) => void;
}

export class ClanMessagesCommands {
  /** The leader's kept messages (0x44f760: its count `DAT_0044f764`, its records `DAT_0044f768`). */
  private kept: ClanMessageRecord[] = [];
  /** The latest request of each read (`CLAN_MESSAGES_LATEST_REPLY_ADAPTATION`). */
  private mineSeq = 0;
  private allSeq = 0;

  constructor(private readonly o: ClanMessagesCommandsOptions) {}

  private answer(name: ClanMessagesCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  private post(event: string): void { this.o.event?.(DIALOG_EVENTS[event]!, null); }

  /** The lobby session up and in state 11 (`WORLD_LOBBY_STATE_READING`). */
  private online(): boolean {
    return (this.o.lobbyUp?.() ?? true) && (this.o.lobbyState?.() ?? LOBBY_STATE_ONLINE) === LOBBY_STATE_ONLINE;
  }

  /** `CLAN_MESSAGE_TICKET_ADAPTATION`: whether the session's ticket is still the one held now (absent the hook, always). */
  private sameSession(): () => boolean {
    if (this.o.ticket === undefined) return () => true;
    const ticket = this.o.ticket();
    return () => ticket !== null && this.o.ticket!() === ticket;
  }

  /** A text variable's string, the variable added TEMPORARY when absent (`FUN_003857c0(.., 0, 1)`); null when it holds none (not type 3). */
  private text(name: string): string | null {
    const v = this.o.uiVars.add(name, null, TEMPORARY).value;
    return v.type === 'string' ? v.value : null;
  }

  /** A row's argument: INPUT_STRING replaced by the running animation's input string (`FUN_0026ed60`, `FUN_00198f18`, `FUN_00272480`). */
  private argument(cmd: ZAnimUiCommand): string | null {
    return cmd.arg === INPUT_STRING ? this.o.inputString?.(cmd) ?? null : cmd.arg === '' ? null : cmd.arg;
  }

  /** The leader's kept messages, in their order. */
  records(): readonly Readonly<ClanMessageRecord>[] { return this.kept; }

  // ---- the member's pane ----

  /** `FUN_00279790` (D:L123936-123943) -> `FUN_002e8460`; 1. Bound on the member's roster's ONSTART (`OnMRosterStart`). */
  GetClanMessages: UiCommandHandler = (cmd) => {
    this.myClanMessages();
    return this.answer('GetClanMessages', cmd, true);
  };

  /**
   * `FUN_002e8460` (D:L187484-187504), and GetMyClans' success the same way (`FUN_002e8bd0` D:L187824-187831 -- ONL-27's
   * GetClan calls this, `./manageRosterCommands`): with no check of the session, MEDIUS_CLAN_MESSAGES
   * (the lobby's +0xcc) set to "Retrieving messages from server..." and GetMyClanMessages sent (0x34 bytes: the session
   * key at +0x15, the clan id `DAT_0044f59c` at +0x28, start 1 at +0x2c, page 999 at +0x30; `FUN_00645ec0`) with the
   * callback `FUN_002e84e0`.
   */
  myClanMessages(): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(MEDIUS_CLAN_MESSAGES_VAR, null, TEMPORARY), str(CLAN_MESSAGES_RETRIEVING));
    const seq = ++this.mineSeq;
    const ticket = this.o.ticket?.() ?? null;
    const current = (): boolean => seq === this.mineSeq && (this.o.ticket === undefined || (ticket !== null && this.o.ticket() === ticket));
    this.o.service?.myMessages({ clanId: this.o.clan.clanId, ...CLAN_MESSAGES_PAGE }).then((rs) => {
      if (current()) for (const r of rs) this.myClanMessagesReply(r);                // CLAN_MESSAGES_LATEST_REPLY_ADAPTATION
    }, () => { /* never answered: the retrieving text stays */ });
  }

  /** `FUN_002e84e0` (D:L187508-187560), one reply: `clanMessagesPane` set into MEDIUS_CLAN_MESSAGES (`FUN_003862a0` / `FUN_00386460`). */
  myClanMessagesReply(r: MyClanMessageReply): void {
    const vars = this.o.uiVars;
    const pane = vars.add(MEDIUS_CLAN_MESSAGES_VAR, null, TEMPORARY);
    vars.set(pane, clanMessagesPane(pane.value, r));
  }

  // ---- the leader's list ----

  /** `FUN_0027a0b0` (D:L124272-124280) -> `FUN_002e6310`; 1. Bound on the leader's roster's ONSTART (`MRosterLeaderStartData`). */
  GetLeaderMessages: UiCommandHandler = (cmd) => {
    this.leaderMessages();
    return this.answer('GetLeaderMessages', cmd, true);
  };

  /**
   * `FUN_002e6310` (D:L186303-186321), also each post's, edit's and delete's success: with no check of the session, the
   * kept messages emptied (`FUN_002e66f0(0x44f760)`) and GetAllClanMessages sent (0x30 bytes: the session key at +0x15,
   * start 1 at +0x28, page 999 at +0x2c; `FUN_00646520`) with the callback `FUN_002e6390`.
   */
  private leaderMessages(): void {
    this.kept = [];
    const seq = ++this.allSeq;
    const ticket = this.o.ticket?.() ?? null;
    const current = (): boolean => seq === this.allSeq && (this.o.ticket === undefined || (ticket !== null && this.o.ticket() === ticket));
    this.o.service?.allMessages({ ...CLAN_MESSAGES_PAGE }).then((rs) => {
      if (current()) for (const r of rs) this.leaderMessagesReply(r);               // CLAN_MESSAGES_LATEST_REPLY_ADAPTATION
    }, () => { /* never answered */ });
  }

  /**
   * `FUN_002e6390` (D:L186325-186345), one reply: a status not Success ("GetLeaderMessages", S:0x3f3ee0) draws the list
   * as kept; a Success is kept by its id unless a record holds it (`FUN_002e65b0` D:L186393-186450), and the list drawn
   * when the reply ends it (+0xec).
   */
  leaderMessagesReply(r: ClanMessageReply): void {
    if (r.status !== 0) { this.drawLeader(); return; }
    if (!this.kept.some((k) => k.clanMessageId === r.clanMessageId)) {
      this.kept.push({ clanMessageId: r.clanMessageId, message: r.message, clanMessageStatus: r.clanMessageStatus });
    }
    if (r.endOfList) this.drawLeader();
  }

  /** `FUN_002e6400` (D:L186347-186390): `clanLeaderMessageRows` set into ClanLeaderMessages (added TEMPORARY, `FUN_00386460`). */
  private drawLeader(): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(CLAN_LEADER_MESSAGES_VAR, null, TEMPORARY), { type: 'array', value: clanLeaderMessageRows(this.kept) });
  }

  /**
   * `FUN_0027a0e0` (D:L124282-124302): the argument, INPUT_STRING replaced by the running animation's input string -- the
   * row's first cell, its id -- read by `strtol` (`FUN_00191490`); SEND_CLAN_MESSAGE (added TEMPORARY when absent) when it
   * holds a string, with the id to `FUN_002e60c0`; 1.
   */
  ModifyClanMessage: UiCommandHandler = (cmd) => {
    const id = strtol(this.argument(cmd));
    const text = this.text(SEND_CLAN_MESSAGE_VAR);
    if (text !== null) this.write(id, text);
    return this.answer('ModifyClanMessage', cmd, true);
  };

  /**
   * `FUN_002e60c0` (D:L186223-186284): an empty text raises CLAN_MESSAGE_EMPTY (S:0x3f3e80, D:L186239-186242); the "-1"
   * row, only while the session is up in state 11, posts it (`send`, D:L186244-186256); an id the kept messages do not hold
   * raises CLAN_MESSAGE_ID_ERR (S:0x3f3ea0, D:L186261-186270); else ModifyClanMessage (0xf4 bytes: the id at +0x28, the
   * text at +0x2c:200; `FUN_00646008`, D:L186272-186280) with the callback `FUN_002e62d0` (D:L186287-186300): Success
   * ("ModifyClanMessage", S:0x3f3ec0) asks the list again; a failure is silent.
   */
  private write(id: number, text: string): void {
    if (text === '') { this.post('CLAN_MESSAGE_EMPTY'); return; }
    if (id === CLAN_MESSAGE_NEW_ID) { if (this.online()) this.send(text); return; }
    if (!this.kept.some((k) => k.clanMessageId === id)) { this.post('CLAN_MESSAGE_ID_ERR'); return; }
    const held = this.sameSession();
    this.o.service?.modify({ clanMessageId: id, newMessage: text }).then((s) => {
      if (s.status === 0 && held()) this.leaderMessages();                         // CLAN_MESSAGE_TICKET_ADAPTATION
    }, () => { /* never answered */ });
  }

  /**
   * SendClanMessage (0xee bytes: the session key at +0x15, the text at +0x26:200; `FUN_00645f60`, as `FUN_002e8310`
   * D:L187451-187455 and `FUN_002e60c0` D:L186250-186254 build it) with the callback `FUN_002e83f0` (D:L187462-187480):
   * Success ("SendClanMessage", S:0x3f4420) asks the list again; a failure formats "Failed To Send Message. Error -> %s"
   * (S:0x3f4430) into a buffer nothing draws -- nothing shown.
   */
  private send(text: string): void {
    const held = this.sameSession();
    this.o.service?.send({ message: text }).then((s) => {
      if (s.status === 0 && held()) this.leaderMessages();                         // CLAN_MESSAGE_TICKET_ADAPTATION
    }, () => { /* never answered */ });
  }

  /**
   * `FUN_002797f0` (D:L123956-123994): SEND_CLAN_MESSAGE (added TEMPORARY when absent) when it holds a string, to
   * `FUN_002e8310` (D:L187434-187458) and its answer, 1 -- only while the session is up in state 11: an empty text raises
   * CLAN_MESSAGE_EMPTY, else the post (`send`); else 1. No dialog of the online chapter binds this row (the leader's post
   * is `ModifyClanMessage` on the "-1" row); it is the table's, filled as read.
   */
  SendClanMessage: UiCommandHandler = (cmd) => {
    const text = this.text(SEND_CLAN_MESSAGE_VAR);
    if (text !== null && this.online()) {
      if (text === '') this.post('CLAN_MESSAGE_EMPTY');
      else this.send(text);
    }
    return this.answer('SendClanMessage', cmd, true);
  };

  /**
   * `FUN_0027a1c0` (D:L124304-124321): the argument, INPUT_STRING replaced by the row's first cell, its id, by `strtol`, to
   * `FUN_002e6010` (D:L186187-186204): any id but -1, with no check of the session or the list, DeleteClanMessage (0x2c
   * bytes: the id at +0x28; `FUN_006460b0`) with the callback `FUN_002e6080` (D:L186207-186220): Success
   * ("DeleteClanMessage", S:0x3f3e60) asks the list again; a failure is silent. 1.
   */
  DeleteClanMessage: UiCommandHandler = (cmd) => {
    const id = strtol(this.argument(cmd));
    if (id !== CLAN_MESSAGE_NEW_ID) {
      const held = this.sameSession();
      this.o.service?.delete({ clanMessageId: id }).then((s) => {
        if (s.status === 0 && held()) this.leaderMessages();                       // CLAN_MESSAGE_TICKET_ADAPTATION
      }, () => { /* never answered */ });
    }
    return this.answer('DeleteClanMessage', cmd, true);
  };

  /** The entries by their table name. */
  entries(): Record<ClanMessagesCommandName, UiCommandHandler> {
    return {
      SendClanMessage: this.SendClanMessage, GetClanMessages: this.GetClanMessages, GetLeaderMessages: this.GetLeaderMessages,
      ModifyClanMessage: this.ModifyClanMessage, DeleteClanMessage: this.DeleteClanMessage,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
