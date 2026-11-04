import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { LobbyClient } from './lobbyClient';
import type { ChannelListEntry } from './worldOfSocomCommands';

/**
 * Text chat over the lobby server (ONL-23; web research 266 §1, on research 263 §1-§3 and 119 §5): the BRIEFING ROOM's
 * line and every whisper -- `SendMediusChat` (row 48) and the parse the game lobby's `SendChatText` shares -- the own
 * line, the lines the lobby server forwards (ChatFwdMessage), and the two panels they are drawn on: the briefing room's
 * per-room history (`CHATLIST` on MEDIUS_CHAT_RECV_VAR) and, out of the lobby's state 11, the game lobby's
 * (`B_CHATLIST` on BCHATLISTVAR). `D:L<line>` = a line of `socom2_game.elf.decomp.c`; an address is the retail ELF's
 * (`S:0x...` a string). Transcribed, cited, never pasted; reading, pending review.
 *
 * **The send** (`send_chat`, ON_SKB_APPLY of `do_chat`'s keyboard, while `KeyboardPurpose` is 1; the player info's
 * `playerinfo_send_message` after its own keyboard): `SendMediusChat(CHATMESSAGE)` (0x27d220 -> `FUN_00281d40`
 * D:L128201-128324 with the callback 0x27d250, which jumps to `FUN_002f4860(0x44f370, text, recipient)`, read from the
 * ELF's instructions 0x27d250-0x27d264). `FUN_00281d40` reads the text from the variable the argument names, the
 * recipient from the variable the command's +0x10 names (MsgPlayer_Recipient: the keyboard's second edit; for the player
 * info, PLAYER_INFO_CHAT_NAME_VAR), a typed `/w name text` when no recipient is held (`parseChatInput`), and sends only a
 * line with a character but spaces that does not open "$~". `FUN_002f4860` (D:L194526-194590) sends nothing with the
 * lobby down (+0x7d), cuts the text to 63 (D:L194556-194558), and: no recipient, TextFilter then `ChatMessage` type 0 to
 * -1 (D:L194560-194571); a recipient, FindPlayer by name (D:L194573-194586), whose reply (`FUN_002f4a20`
 * D:L194594-194651) posts MP_PLAYER_NOT_FOUND on a failure (D:L194618) or sends type 1 to the account found (+0x48).
 * `FUN_002f4ba0` (D:L194653-194711) sends the message and draws the own line unless the target is the sender
 * (D:L194700-194707). The TextFilter step is the server's (`CHAT_FILTER_PLACEHOLDER`, `packages/central/src/chat.ts`).
 *
 * **The draw**: every line reaches the screen's line call (`FUN_001f4d20` D:L54919-54934, the front end's screen class):
 * in the lobby's state 11 the room's history (`FUN_001f5020` D:L55020-55158) drawn by `FUN_002f5020` (D:L194822-194884);
 * out of it the game lobby's panel (`FUN_001f4df0` D:L54939-55015). `CHAT_LINE_ARGS_READING` holds the arguments each
 * caller passes.
 *
 * The transport is ours (OT.R27): SVC-18's `/lobby/find-player`, `/lobby/chat`, `/lobby/chat-lines`
 * (`packages/viewer/src/briefingRoomHost.ts`), the last polled (`CHAT_POLL_MS_ADAPTATION`).
 *
 * **The server's system message** (SA-43c RESTART-NOTICE; web research 345 §2): RT_MSG_SERVER_SYSTEM_MESSAGE reaches the
 * game's callback `FUN_0030dce0` (D:L210355-210398), which buffers the text to 1000 bytes ("[Server message too long]"
 * past it, S:0x3f6740), sets a flag from the severity (D:L210380-210389) and calls the current state's +0x2c (D:L210394)
 * with the text, the name "Server" (S:0x3f6760), the flag and the kind 1 (the ninth argument, 0x30ddb0-0x30ddb4, decoded
 * by hand). The front end's (`FUN_001f4d20` D:L54919-54934): kind 1 with the flag 2 -> `FUN_001f3bf0(MS,
 * "MP_SYSTEM_MESSAGE", text)` (D:L54925; its name-to-id chain gives 0x3a, D:L54618-54620; the event delivered by
 * `FUN_00367810` D:L54699), the disc's `OnSystemMessage` where the dialog binds it; else the screen's line below. A
 * round's (`FUN_001ecc40` D:L51076-51099): the text alone on the HUD's main window, the flag never read. The loading
 * states' (`FUN_001e7c80`): empty. The carrier is ours: `/lobby/chat-lines`' `system` (central's SA-43c notices), each
 * notice's id taken once. Reading, pending review.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The row this module fills (PLAT-08's table: id, name, function), and the task the table names as its owner. */
export const BRIEFING_ROOM_CHAT_ROWS = [{ id: 48, name: 'SendMediusChat', fn: 0x27d220, task: 'ONL-23' }] as const;

/** MEDIUS_CHAT_RECV_VAR (S:0x3f38d0): the briefing room's panel (`CHATLIST`), the lobby session's `DAT_0044f42c` (`FUN_002df6a0` D:L182204-182208). */
export const CHAT_RECV_VAR = 'MEDIUS_CHAT_RECV_VAR';
/** BCHATLISTVAR (S:0x3f1080): the game lobby's panel (`B_CHATLIST`), the game object's +0x94 (`FUN_002a76d0` D:L149534-149539). */
export const GAME_LOBBY_CHAT_VAR = 'BCHATLISTVAR';
/** The message field's 64 bytes and its NUL (`FUN_002f4860` D:L194556-194558; the record's text, `FUN_001f5020` with `FUN_0039fc60`, D:L55042). */
export const CHAT_MESSAGE_CHARS = 63;
/** The record's name field: 0x20 bytes with its NUL (`FUN_0039fc60`, D:L55041). */
export const CHAT_NAME_CHARS = 31;
/** FindPlayer's name field: 0x20 bytes copied (`FUN_002f4860` D:L194583). */
const FIND_PLAYER_NAME_CHARS = 32;
/** A room's history: past 10 the oldest is dropped before the new one is added (`FUN_001f5020` D:L55057-55101, D:L55110-55154). */
export const ROOM_CHAT_LINES = 11;
/** The game lobby's panel: the last 20 elements and the new one (`FUN_002ba9d0` D:L160155-160188, `FUN_001f4df0` D:L54967-55011). */
export const GAME_LOBBY_CHAT_LINES = 21;
/** The usage line `FUN_00281d40` draws for a `/w` with no message (S:0x3ef6d0, D:L128285). */
export const WHISPER_USAGE_TEXT = "Whisper usage: /w ''player name'' message";
/** A game lobby line's sender with no name (S:0x3f26f8, D:L160177-160179). */
export const UNKNOWN_SENDER = 'Unknown';
/**
 * The colour codes (`#C` and three bytes, which the wrapped text reads, `wrapLines`): a room's line S:0x3f5648 and
 * 0x3e2e78, a whisper S:0x3f5650 and 0x3e2e68, a universe line S:0x3f5658 and 0x3e2e70, any other type S:0x3f5640;
 * the bytes read from the ELF.
 */
export const CHAT_COLOUR = { room: '#C\x80\x80\x80', whisper: '#C\x80\x40\x40', universe: '#C\x80\x80\x40', other: '#C\xff\xff\xff' } as const;
/** SVC-19: the game lobby's team line's colour code, `#C` 0x40 0x80 0x40 (S:0x3f2700's first five bytes, read from the ELF). */
export const TEAM_CHAT_COLOUR = '#C\x40\x80\x40';
/** The line call's kinds (`FUN_002f4ef0` D:L194789-194795): a room's line 0, a whisper 5, a universe line 1. */
export const CHAT_KIND = { room: 0, universe: 1, whisper: 5 } as const;
/** ChatMessage's types (research 263 §2): a room's line 0, a whisper 1; ChatFwdMessage's 2, a universe broadcast. */
const MESSAGE_TYPE = { room: 0, whisper: 1, universe: 2 } as const;
const LOBBY_STATE_LOGGED_IN = 0x0b;

/**
 * CHAT_LINE_ARGS_READING: what each caller passes to the screen's line call (vtable +0x2c, `FUN_001f4d20`), read from
 * the ELF's instructions where the decompiled text drops the ninth argument (the stack word) and the front end's frame
 * has no decompiled block: the queue's lines (the frame at 0x1f4640, 0x1f46b8-0x1f46ec) pass the queued text, **no
 * name**, the flag 1 and the queued kind -- so a received line is drawn as one text, `"%s: %s"` of its name and message
 * (S:0x3f5638, `FUN_002f4ef0` D:L194798), the record's name empty, `"%s%s"` (S:0x3f5670) with no space after the colour;
 * the own line (0x2f4cc4-0x2f4d34) passes the text, the session's name (0x66a4f4), the flag 1 and the kind 5 for a
 * whisper (type 1), else 0 -- drawn `"%s %s: %s"` (S:0x3f5660); the usage line (0x281fe0-0x282040) passes the text, the
 * empty name (S:0x3eead8), the flag 0 and the kind 1. [reading]
 */
export const CHAT_LINE_ARGS_READING = 'received: one text "name: message", no name; own: the session\'s name, kind 5 a whisper else 0; usage: "" and kind 1' as const;

/**
 * CHAT_POLL_MS_ADAPTATION (a browser adaptation of the transport): the lobby server pushes ChatFwdMessage on the
 * console's connection (`FUN_00300840` D:L202025-202046 installs `FUN_002f4ef0`); SVC-18's HTTP seam holds a page's
 * lines until it asks (`CHAT_POLL_ADAPTATION`, the server's), so the page asks `/lobby/chat-lines` once this period while
 * the lobby is up with a ticket, one request at a time, a reply taken only under the ticket it was sent with (as
 * `GAME_LIST_LATEST_REPLY_ADAPTATION`). The cost: a line drawn up to a period late. The original has no period.
 */
export const CHAT_POLL_MS_ADAPTATION = 1000;

/**
 * OWN_WHISPER_BY_NAME_ADAPTATION: `FUN_002f4ba0` draws no own line for a message whose target is the sender's own
 * account id (D:L194700, `DAT_0066a4f0`). The page holds no account id (the login's reply carries none), so the target
 * is the sender when FindPlayer's account name is the session's, compared case-blind (one name per account, the store's
 * `nameKey`). A browser adaptation; what is drawn is the original's.
 */
export const OWN_WHISPER_BY_NAME_ADAPTATION = 'the whisper to oneself known by FindPlayer\'s name, the page holding no account id' as const;

/** One ChatFwdMessage as `/lobby/chat-lines` answers it (`FUN_002f4ef0` reads the type +0x3c, the name +0x1c, the message +0x40). */
export interface ChatFwdLine { originatorAccountId: number; originatorAccountName: string; messageType: number; message: string }
/**
 * SVC-19 (web research 266 §3.3): one line of the lobby server's queue (0x437690, `FUN_002a4050` D:L147615-147669) as a
 * round's frame takes it (`FUN_001f7ff0` D:L56708-56719): the queued text -- `"%s: %s"` of the sender's name and the
 * message (S:0x3f5638, D:L194798) -- its kind (5 a whisper, 1 a universe line; a room's line is queued in state 11 only,
 * D:L194797) and the sender's name (the record's +0x89, 0x20 bytes, D:L147657-147661), which the round's EXTERNAL
 * WHISPERS test reads. KEYBOARD-WHISPER (research 266 §3.9): `own`, the round state's own line call, not the queue -- a
 * whisper sent while a round runs, posted by `FUN_002f4ba0`'s current-state +0x2c (D:L194700-194707), which for the game
 * state 0x4085d0 (made by `FUN_001eca50`; its update `FUN_001ebed0` runs the round's frame, D:L50856) is `FUN_001ecc40` (its vtable 0x404f60's +0x2c, read off the ELF; D:L51076-51099): the message alone on
 * the HUD's main window at the window's scale in colour 5 (the stack word 0x2f4ce0 sets: 5 for a whisper, the type 1),
 * with no EXTERNAL WHISPERS test (`ROUND_WHISPER_REPLY_STATE_READING`).
 */
export interface RoundQueueLine { text: string; name: string; kind: number; own?: true }
/**
 * KEYBOARD-WHISPER (research 266 §3.9): FindPlayer's "no such player" while a round runs. `FUN_002f4a20` calls the lobby's
 * event callback `DAT_0044f3c8` with `MP_PLAYER_NOT_FOUND` (S:0x3f5620, D:L194616-194618) -- `FUN_0027e610`, set by
 * `FUN_00276dc0` (D:L122664) -- which hands the event to the current state (D:L126526-126550: 0x408538 at D:L126534, 0x4085d0 at D:L126544): the front end
 * (0x408538, `FUN_001f3bf0`) raises the dialog's event; the game state (0x4085d0, `FUN_001eb070`) queues this text, read
 * off the ELF at S:0x3e1e90, on the lobby's queue as a universe line with no name (`FUN_002a4050(0x437690, 0x3e1e90, 1,
 * 0)`, D:L50558-50561), which the round's frame draws in colour 1 (research 266 §3.3); any other state drops it.
 */
export const ROUND_PLAYER_NOT_FOUND_TEXT = 'PLAYER NAME DOES NOT EXIST. CHECK ENTERED NAME AND TRY AGAIN.';

/**
 * ROUND_WHISPER_REPLY_STATE_READING (research 266 §3.9, §6): the original routes a whisper's two answers -- FindPlayer's
 * "no such player" (`FUN_0027e610` D:L126518-126551) and the own line (`FUN_002f4ba0`'s +0x2c call) -- by the state
 * current when the answer comes: the front end's dialog and screen line, the game state's queue and HUD, and nothing in
 * any other (the loading states' +0x2c is the empty `FUN_001e7c80`, and `FUN_0027e610` answers 0). The page knows one
 * thing for "the game state is current": the round's sink is up (`round`, from the match's mount to its return); an
 * answer that comes with none goes the front end's way, so one answered while a match loads, or after it returns, takes
 * the front end's path where the original might drop it. Settled by ONL-32's round: a whisper whose reply comes across
 * the match's load and end. [reading]
 */
export const ROUND_WHISPER_REPLY_STATE_READING = 'a round runs while its sink is up: the reply goes to the round, else the front end way' as const;

/**
 * SA-43c: one server system message as `/lobby/chat-lines` carries it (`system`, central's notices; an adaptation of the
 * transport): RT_MSG_SERVER_SYSTEM_MESSAGE's severity and text, and an id that only increases (each taken once).
 */
export interface ServerSystemMessage { id: number; severity: number; text: string }
/** SA-43c: `/lobby/chat-lines`' reply with its `system` key; an older central's is the lines alone. */
export interface ChatLinesReply { lines: readonly ChatFwdLine[]; system?: readonly ServerSystemMessage[] }

/** `FUN_0030dce0`'s buffer (0x45b330): a text of this many bytes or more is replaced (D:L210369-210375). */
export const SERVER_MESSAGE_BYTES = 1000;
/** S:0x3f6740: the text a system message of `SERVER_MESSAGE_BYTES` or more becomes. */
export const SERVER_MESSAGE_TOO_LONG = '[Server message too long]';
/** S:0x3f6760: the name `FUN_0030dce0` passes to the state's +0x2c (D:L210394). */
export const SERVER_MESSAGE_NAME = 'Server';
/** The kind `FUN_0030dce0` passes (the ninth argument, the stack word at 0x30ddb0-0x30ddb4, decoded by hand): 1. */
export const SYSTEM_MESSAGE_KIND = 1;

/**
 * `FUN_0030dce0`'s text (D:L210366-210376), one fragment with its end-of-message flag (as every notice is): kept below
 * `SERVER_MESSAGE_BYTES` bytes (`FUN_00199288`'s length; the page counts UTF-8), else "[Server message too long]".
 */
export function systemMessageText(text: string): string {
  return new TextEncoder().encode(text).length >= SERVER_MESSAGE_BYTES ? SERVER_MESSAGE_TOO_LONG : text;
}

/** `FUN_0030dce0`'s flag (D:L210380-210389): severity below 0x80, 2; below 0xC0, 1; else 0. */
export function systemMessageFlag(severity: number): number {
  const s = severity & 0xff;
  return s < 0x80 ? 2 : s < 0xc0 ? 1 : 0;
}

/**
 * SYSTEM_MESSAGE_STATE_READING (SA-43c; web research 345 §5): which state of the original's is current when a system
 * message comes (`FUN_0030dce0` D:L210394 calls the current state's +0x2c from the network update), as the page knows it:
 * the game state (0x4085d0, `FUN_001ecc40`) while the round's sink is up (`round`, the match's mount to its return); the
 * load state (`FUN_001e7c80`, empty) from the match's hand-off until that sink is up (`loading`: the loading screen, or a
 * match whose mount is not yet ready); the front end's otherwise -- its MP_SYSTEM_MESSAGE raised at the menu state's next
 * tick step (6), at most a frame after the poll's reply, where the console raises it within the network update. Settled
 * by a capture of a system message sent across a match's load and its end (ONL-32's kind). [reading]
 */
export const SYSTEM_MESSAGE_STATE_READING = 'a round while its sink is up; a load from the hand-off until then (dropped); else the front end, at the menu tick' as const;

/** The page's half (SVC-18's paths, with the session's bearer): a rejection is a request never answered. */
export interface LobbyChatService {
  findPlayer(q: { name: string }): Promise<{ status: number; accountId: number; accountName: string }>;
  /** ChatMessage (Lobby 0x3b): no reply. */
  chat(q: { messageType: number; targetId: number; message: string }): Promise<void>;
  /** The waiting lines; SA-43c: with the live system messages (`ChatLinesReply`), or the lines alone (an older central). */
  chatLines(): Promise<readonly ChatFwdLine[] | ChatLinesReply>;
}
/** The lobby (0x44f370): up (+0x7d), its state (`DAT_0044f3d0`), the session's account name (0x66a4f4). */
export type ChatLobby = Pick<LobbyClient, 'up' | 'state'> & Partial<Pick<LobbyClient, 'account'>>;
/** What the game lobby's `SendChatText` uses of this module: the whisper and the screen's line. */
export type LobbyTextChat = Pick<BriefingRoomChat, 'mediusChat' | 'screenLine'>;

const SPACE = /[\t\n\v\f\r ]/;

/**
 * `FUN_00281d40`'s reading of the text (D:L128240-128313): with no recipient held, a text opening `/w ` (or `/W `) names
 * one -- after the spaces, to the closing `"` when it opens with one, else to the next space; the text is what follows
 * that and its spaces; a name that runs to the end is `usage` (D:L128278-128288). Then the line is sent only when it
 * does not open "$~" and holds a character but spaces (D:L128300-128313): null when not.
 */
export function parseChatInput(text: string | null, recipient: string | null): { text: string; recipient: string | null } | 'usage' | null {
  let t = text, to = recipient;
  if (to === null && t !== null && t[0] === '/' && (t[1] === 'w' || t[1] === 'W') && t[2] === ' ') {
    let i = 3;
    while (i < t.length && SPACE.test(t[i]!)) i++;
    if (i < t.length) {
      const quote = t[i] === '"';
      const end = quote ? '"' : ' ';
      if (quote) i++;
      let name = '';
      while (i < t.length && t[i] !== end) name += t[i++];
      if (i >= t.length) return 'usage';
      i++;
      while (i < t.length && SPACE.test(t[i]!)) i++;
      t = t.slice(i);
      to = name;
    }
  }
  if (t === null || t.startsWith('$~') || !/[^\t\n\v\f\r ]/.test(t)) return null;
  return { text: t, recipient: to };
}

/** The NUL-terminated name at the command's +0x10 (`FUN_00281d40` D:L128226-128227), or ''. */
function nameAt(bytes: Uint8Array, at: number): string {
  let s = '';
  for (let i = at; i < bytes.length && bytes[i] !== 0; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

/** A variable's string (`FUN_00385900` and type 3), or null. */
function varString(uiVars: UiVarManager, name: string): string | null {
  const v = uiVars.find(name)?.value;
  return v?.type === 'string' ? v.value : null;
}

/**
 * `FUN_00281d40` over a command (`SendMediusChat`, `SendChatText`): the text the argument's variable holds (its name
 * itself when it holds no string, D:L128220-128225), the recipient the variable named at +0x10 holds (none when empty,
 * D:L128226-128239), parsed (`parseChatInput`); `send` with a line to go, `usage` for a `/w` with no message.
 */
export function runChatCommand(uiVars: UiVarManager, cmd: ZAnimUiCommand, send: (text: string, recipient: string | null) => void, usage: () => void): void {
  const text = varString(uiVars, cmd.arg) ?? cmd.arg;
  const recipientVar = nameAt(cmd.bytes, 0x10);
  const held = recipientVar === '' ? null : varString(uiVars, recipientVar);
  const p = parseChatInput(text, held === null || held === '' ? null : held);
  if (p === 'usage') usage();
  else if (p !== null) send(p.text, p.recipient);
}

/**
 * The game lobby's line (`FUN_002ba9d0` D:L160177-160185): `"#C\x80\x80\x80%s (All): %s\n"` (S:0x3f2720) for scope 0;
 * SVC-19: `"#C@\x80@%s (Team): %s\n"` (S:0x3f2700) for a team scope (`team`, the scopes 1-3, D:L160183-160185);
 * "Unknown" for no name.
 */
export function gameLobbyChatLine(name: string | null, text: string, team = false): string {
  return team ? `${TEAM_CHAT_COLOUR}${name ?? UNKNOWN_SENDER} (Team): ${text}\n` : `${CHAT_COLOUR.room}${name ?? UNKNOWN_SENDER} (All): ${text}\n`;
}

/**
 * BCHATLISTVAR's update (`FUN_002ba9d0` D:L160155-160188, `FUN_001f4df0` D:L54967-55011): the string elements of its
 * array from the 20th last on, the new line after them, the whole set (`FUN_00386460`); the variable added PERMANENT
 * as the game object's init adds it (D:L149534) when it is not held.
 */
export function appendGameLobbyChat(uiVars: UiVarManager, line: string): void {
  const v = uiVars.find(GAME_LOBBY_CHAT_VAR) ?? uiVars.add(GAME_LOBBY_CHAT_VAR, null, 2);
  const held = v.value.type === 'array' ? v.value.value : [];
  const kept: UiVarValue[] = held.slice(Math.max(0, held.length - (GAME_LOBBY_CHAT_LINES - 1))).filter((e) => e.type === 'string');
  uiVars.set(v, { type: 'array', value: [...kept, { type: 'string', value: line }] });
}

/** `FUN_001f4df0`'s line (D:L54985-55004): the kind's colour, the name and ": " when one is passed, the text, "\n". */
export function lobbyPanelLine(uiVars: UiVarManager, text: string, name: string | null, kind: number): void {
  const colour = kind === CHAT_KIND.universe ? CHAT_COLOUR.universe : kind === CHAT_KIND.whisper ? CHAT_COLOUR.whisper : CHAT_COLOUR.room;
  appendGameLobbyChat(uiVars, `${colour}${name !== null ? `${name}: ` : ''}${text}\n`);
}

/** One record of a room's history (0x80 bytes: the name +0x1c, the type +0x3c, the text +0x40). */
export interface ChatRoomLine { name: string; type: number; text: string }

export interface BriefingRoomChatOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** ONL-07's lobby client; absent or down, nothing is sent. */
  lobby?: ChatLobby | null;
  /** SVC-18's paths; absent, every request is never answered. */
  service?: LobbyChatService;
  /** The client's rooms (0x44f568): each holds its history. */
  rooms: () => readonly ChannelListEntry[];
  /** `DAT_0044f3c8(name, argument)`: a named event into the built dialog. */
  event?: (kind: number, text: string | null) => void;
  /** The session's ticket (`CHAT_POLL_MS_ADAPTATION`): no poll without one, a reply dropped when it changed; absent, not checked. */
  ticket?: () => string | null;
  /**
   * SVC-19 (web research 266 §3.3): the round's frame, while a round runs. The queue is drained by whichever state's
   * frame runs -- the front end's (0x1f4640, the screen's line call) or a round's (`FUN_001f7ff0` D:L56708-56719, the
   * HUD's message window) -- so a line forwarded during a match goes to the round, never the lobby's panel. Answers the
   * round's sink, or null while none runs; absent, never one.
   */
  round?: () => ((line: RoundQueueLine) => void) | null;
  /**
   * SA-43c (`FUN_001e7c80`, the loading states' empty +0x2c): true while a match loads -- the load state current, its
   * round not yet up -- when a system message is dropped. Absent, never.
   */
  loading?: () => boolean;
}

export class BriefingRoomChat {
  /** Each room record's history (the record's list at +0x88..+0x90): keyed by the record, freed with it. */
  private readonly history = new WeakMap<ChannelListEntry, ChatRoomLine[]>();
  private nextPoll = -Infinity;
  private polling = false;
  /** SA-43c: the last system message's id taken (each once, wherever it went or was dropped). */
  private lastSystem = -Infinity;
  /** SA-43c: the front end's system messages waiting for the menu state's tick step (6) (`systemMessages`). */
  private readonly menuSystem: string[] = [];

  constructor(private readonly o: BriefingRoomChatOptions) {}

  private up(): boolean { return this.o.lobby?.up ?? false; }
  private state(): number { return this.o.lobby?.state() ?? 0; }

  /** The room MEDIUS_LOBBY_NAME holds (`*DAT_0044f430 == 3`, `FUN_002e4470` by name), or none. */
  private room(): ChannelListEntry | undefined {
    const name = varString(this.o.uiVars, 'MEDIUS_LOBBY_NAME');
    return name === null ? undefined : this.o.rooms().find((r) => r.lobbyName === name);
  }

  /** 0x27d220 (D:L125872-125879): `FUN_00281d40` with 0x27d250, which sends every line through `FUN_002f4860`; 1. */
  SendMediusChat: UiCommandHandler = (cmd) => {
    runChatCommand(this.o.uiVars, cmd, (text, recipient) => { this.mediusChat(text, recipient); }, () => { this.usage(); });
    return true;
  };

  /** `FUN_00281d40`'s usage line (D:L128278-128288; `CHAT_LINE_ARGS_READING`). */
  usage(): void { this.screenLine(WHISPER_USAGE_TEXT, '', 0, CHAT_KIND.universe); }

  /**
   * `FUN_002f4860` (D:L194526-194590) with its replies: 0 with the lobby down; the text cut to 63; a room's line sent
   * at once, a whisper after FindPlayer; the own line drawn after the send (`FUN_002f4ba0`).
   */
  mediusChat(text: string, recipient: string | null): boolean {
    const svc = this.o.service;
    if (!this.up()) return false;
    const message = text.slice(0, CHAT_MESSAGE_CHARS);
    if (recipient === null) {
      this.send(MESSAGE_TYPE.room, -1, message);
      this.ownLine(message, CHAT_KIND.room);
      return true;
    }
    svc?.findPlayer({ name: recipient.slice(0, FIND_PLAYER_NAME_CHARS) }).then((r) => {
      if (r.status !== 0) {                                                                       // D:L194614-194619
        const round = this.o.round?.() ?? null;                                                    // ROUND_WHISPER_REPLY_STATE_READING
        if (round) round({ text: ROUND_PLAYER_NOT_FOUND_TEXT, name: '', kind: CHAT_KIND.universe });   // the game state's (FUN_001eb070)
        else this.o.event?.(DIALOG_EVENTS['MP_PLAYER_NOT_FOUND']!, null);
        return;
      }
      this.send(MESSAGE_TYPE.whisper, r.accountId, message);
      const own = this.o.lobby?.account?.() ?? null;
      if (own === null || own.toLowerCase() !== r.accountName.toLowerCase()) {                   // OWN_WHISPER_BY_NAME_ADAPTATION
        const round = this.o.round?.() ?? null;
        if (round) round({ text: message, name: own ?? '', kind: CHAT_KIND.whisper, own: true });   // the game state's +0x2c (FUN_001ecc40)
        else this.ownLine(message, CHAT_KIND.whisper);
      }
    }, () => { /* never answered */ });
    return true;
  }

  private send(messageType: number, targetId: number, message: string): void {
    this.o.service?.chat({ messageType, targetId, message }).catch(() => { /* ChatMessage has no reply */ });
  }

  /** `FUN_002f4ba0`'s own line (D:L194700-194707; `CHAT_LINE_ARGS_READING`): the session's name, the flag 1, kind 5 or 0. */
  private ownLine(text: string, kind: number): void {
    this.screenLine(text, this.o.lobby?.account?.() ?? '', 1, kind);
  }

  /**
   * `FUN_002f4ef0` (D:L194781-194803), then the queue and the frame (`CHAT_LINE_ARGS_READING`): the kind from the type
   * (2 universe, 1 whisper, else a room's line); a room's line only in state 11 (D:L194797); `"%s: %s"` of the name and
   * the message (D:L194798), into the queue (`FUN_002a4050` D:L147615-147669, which cuts only a text of 128 bytes or more,
   * D:L147643-147656 -- a name of 32 and a message of 63 never reach it) and out at the next frame; the screen's line
   * with no name and the flag 1. The page hands each polled line on in order, with no queue between. SVC-19: while a
   * round runs (`round`), its frame takes the line instead -- the text, the sender's name and the kind.
   */
  received(line: ChatFwdLine): void {
    const kind = line.messageType === MESSAGE_TYPE.universe ? CHAT_KIND.universe : line.messageType === MESSAGE_TYPE.whisper ? CHAT_KIND.whisper : CHAT_KIND.room;
    if (this.state() !== LOBBY_STATE_LOGGED_IN && kind === CHAT_KIND.room) return;
    const text = `${line.originatorAccountName}: ${line.message}`;
    const round = this.o.round?.() ?? null;
    if (round) round({ text, name: line.originatorAccountName, kind });
    else this.screenLine(text, null, 1, kind);
  }

  /**
   * The front end screen's line call (`FUN_001f4d20` D:L54919-54934): in state 11 the room's history (`FUN_001f5020`),
   * else the game lobby's panel (`FUN_001f4df0`). Its first branch -- kind 1 with the flag 2, a system message -- is
   * `systemMessage`'s (SA-43c), raised at the menu state's tick.
   */
  screenLine(text: string, name: string | null, flag: number, kind: number): void {
    if (this.state() === LOBBY_STATE_LOGGED_IN) this.roomLine(text, name, flag, kind);
    else lobbyPanelLine(this.o.uiVars, text, name, kind);
  }

  /**
   * `FUN_001f5020` (D:L55020-55158): the record -- the name to 31, the type from the kind (1 universe 2, 5 whisper 1,
   * 0 room 0), the text to 63 -- added to every room's history for the flag 2 or a whisper or universe kind
   * (D:L55052-55106), else to the room MEDIUS_LOBBY_NAME holds (D:L55107-55155); each history past 10 drops its oldest
   * first. Then `FUN_002f5020`.
   */
  private roomLine(text: string, name: string | null, flag: number, kind: number): void {
    const type = kind === CHAT_KIND.universe ? MESSAGE_TYPE.universe : kind === CHAT_KIND.whisper ? MESSAGE_TYPE.whisper : MESSAGE_TYPE.room;
    const rec: ChatRoomLine = { name: (name ?? '').slice(0, CHAT_NAME_CHARS), type, text: text.slice(0, CHAT_MESSAGE_CHARS) };
    const add = (room: ChannelListEntry): void => {
      const list = this.history.get(room) ?? [];
      if (list.length > ROOM_CHAT_LINES - 1) list.shift();
      list.push({ ...rec });
      this.history.set(room, list);
    };
    if (flag === 2 || kind === CHAT_KIND.whisper || kind === CHAT_KIND.universe) for (const r of this.o.rooms()) add(r);
    else { const r = this.room(); if (r) add(r); }
    this.drawRoom();
  }

  /** The history of the room MEDIUS_LOBBY_NAME holds, oldest first. */
  roomLines(): readonly ChatRoomLine[] {
    const r = this.room();
    return r ? (this.history.get(r) ?? []) : [];
  }

  /**
   * `FUN_002f5020` (D:L194822-194884): with MEDIUS_CHAT_RECV_VAR held, the room's lines, each `"%s %s: %s"` (S:0x3f5660)
   * of its type's colour, the name and the text, or `"%s%s"` (S:0x3f5670) with no name, a "\n" (S:0x3f5678) element
   * between two; the set into the variable (`FUN_00386460`). The join's success calls it too (`FUN_002efc80` D:L191662-191664).
   */
  drawRoom(): void {
    const v = this.o.uiVars.find(CHAT_RECV_VAR);
    if (!v) return;
    const lines = this.roomLines();
    const out: UiVarValue[] = [];
    lines.forEach((l, i) => {
      const colour = l.type === MESSAGE_TYPE.universe ? CHAT_COLOUR.universe : l.type === MESSAGE_TYPE.whisper ? CHAT_COLOUR.whisper : l.type === MESSAGE_TYPE.room ? CHAT_COLOUR.room : CHAT_COLOUR.other;
      out.push({ type: 'string', value: l.name === '' ? `${colour}${l.text}` : `${colour} ${l.name}: ${l.text}` });
      if (i + 1 < lines.length) out.push({ type: 'string', value: '\n' });
    });
    this.o.uiVars.set(v, { type: 'array', value: out });
  }

  /**
   * SA-43c: one server system message (`FUN_0030dce0` D:L210355-210398) to the current state's +0x2c: in a round
   * (`round`), `FUN_001ecc40` -- the text alone on the HUD, the round state's own line; while a match loads (`loading`),
   * `FUN_001e7c80` -- nothing, gone; else the front end's `FUN_001f4d20` -- the flag 2 (kind 1): MP_SYSTEM_MESSAGE with
   * the text, raised at the menu state's next tick step (6) (`systemMessages`); the flag 1 or 0: the screen's line with
   * the name "Server".
   */
  systemMessage(text: string, severity: number): void {
    const t = systemMessageText(text);                                         // SYSTEM_MESSAGE_STATE_READING below
    const flag = systemMessageFlag(severity);
    const round = this.o.round?.() ?? null;
    if (round) { round({ text: t, name: '', kind: SYSTEM_MESSAGE_KIND, own: true }); return; }
    if (this.o.loading?.()) return;
    if (flag === 2) this.menuSystem.push(t);
    else this.screenLine(t, SERVER_MESSAGE_NAME, flag, SYSTEM_MESSAGE_KIND);
  }

  /**
   * SA-43c: the menu state's tick step (6) (`MenuStateOptions.systemMessages`): each waiting system message raised into
   * the built dialog as MP_SYSTEM_MESSAGE with its text (`FUN_001f3bf0` D:L54925, `FUN_00367810` D:L54699) -- the
   * dialog's OnSystemMessage where it binds one, nothing where it does not.
   */
  systemMessages(): void {
    for (const t of this.menuSystem.splice(0)) this.o.event?.(DIALOG_EVENTS['MP_SYSTEM_MESSAGE']!, t);
  }

  /** SA-43c: a poll's system messages, each id above the last taken, in order. */
  private receivedSystem(list: readonly ServerSystemMessage[]): void {
    for (const m of list) {
      if (!(m.id > this.lastSystem)) continue;
      this.lastSystem = m.id;
      this.systemMessage(m.text, m.severity);
    }
  }

  /** Once a frame (`CHAT_POLL_MS_ADAPTATION`): `/lobby/chat-lines` asked when due, its lines received in order. */
  frame(now: number): void {
    const svc = this.o.service;
    if (!svc || !this.up() || this.polling || now < this.nextPoll) return;
    const ticket = this.o.ticket?.() ?? null;
    if (this.o.ticket && ticket === null) return;
    this.polling = true;
    this.nextPoll = now + CHAT_POLL_MS_ADAPTATION;
    const current = (): boolean => this.up() && (this.o.ticket === undefined || this.o.ticket() === ticket);
    svc.chatLines().then((reply) => {
      this.polling = false;
      if (!current()) return;
      const r: ChatLinesReply = Array.isArray(reply) ? { lines: reply as readonly ChatFwdLine[] } : reply as ChatLinesReply;
      for (const l of r.lines) this.received(l);
      if (r.system) this.receivedSystem(r.system);                             // SA-43c
    }, () => { this.polling = false; });
  }

  /** Row 48's body set in PLAT-08's host. */
  register(host: UiCommandHost): void {
    host.setHandler('SendMediusChat', this.SendMediusChat);
  }
}
