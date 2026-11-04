import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { LiveLongevity, UiVarManager, UiVarValue } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { MEDIUS_CLAN_MESSAGES_VAR, NO_CLAN_MESSAGES } from './clanMessagesCommands';
import { CLAN_DESCRIPTION_VAR, CLAN_NAME_VAR, playerNameAndTag, type ClanRosterMember, type LobbyClan } from './createClanCommands';
import { ladderMedal, type LadderOnlineState } from './ladderLobbyCommands';

/**
 * The clan client and the member's roster (`dlgManageRoster.rdr`, ONL-27, web sprint 18's clans' half; web research
 * 272): six rows of PLAT-08's table -- `GetClan` (GetMyClans), `IsMemberOfClan`, `IsLeaderOfClan`, `GetClanRoster`,
 * `GetClanMemberInfo`, `QuitClan` -- over SVC-08's GetMyClans and GetClanMemberList_ExtraInfo and SVC-09's
 * RemovePlayerFromClan (`packages/central/src/clans.ts`: `/clan/my-clans`, `/clan/roster`, `/clan/remove`; research 262).
 * The leader's rows are `./manageRosterLeaderCommands`'s. `D:L<line>` = a line of `socom2_game.elf.decomp.c`; `S:0x...` a
 * string of the retail ELF; `ELF 0x...` an instruction read off the ELF where the decompilation has no block.
 * Transcribed, cited, never pasted; reading, pending review.
 *
 * **GetMyClans** replaces ONL-26's stub (`GET_CLAN_STUB_READING`, retired): SOCOM II ONLINE's `init_screen` and the
 * member's roster's ONSTART run `GetClan`, whose request's reply (`FUN_002e8bd0`) tells the client its clan -- the ids,
 * the leader, the name, the tag -- and on success asks the roster (`FUN_002e69f0`) and the MESSAGES band
 * (`myClanMessages`, ONL-29's rows, the seam research 274 §1.3 left). So the CLAN row reaches a member's and the leader's
 * roster (`create_modify_clan`), the room list draws "+Clan - %s", RESPOND TO INVITES takes its member and leader branches
 * and INVITE PLAYERS counts and refuses by the roster (`CLAN_ROSTER_UNHELD_READING`, retired).
 *
 * **The member's page is the disc's** (`tools/dump-online-dialogs.ts --dialog dlgManageRoster.rdr`; research 272 §1):
 * ONSTART `OnMRosterStart` disables the list, enables and activates LEAVE CLAN and runs `GetClanRoster`,
 * `GetClanMessages` and `GetClan`; the LISTBOX `RosterList` on CLAN_ROSTER, its columns RANK #464 / ONLINE #316 / MEDAL
 * #465 / MEMBER #466 / POSITION #467; the clan rating #462 on ClanRating; LEAVE CLAN's CROSS (`leave_clan`) asks #473
 * (NO / YES): YES runs `QuitClan`, says #474 and switches to SOCOM II ONLINE, NO says #389; VIEW INFO's CROSS activates
 * the list (#472), a row's CROSS PLAYER INFO (`GetPlayerInfo(INPUT_STRING)`, origin CLAN); MP_MEDIUS_BECAME_LEADER #469 then
 * the leader's roster; MP_CLAN_DISBANDED #470 then SOCOM II ONLINE; TRIANGLE and RETURN go back to SOCOM II ONLINE.
 *
 * The transport is ours (OT.R27): `ManageRosterService` is the page's `/clan/my-clans`, `/clan/roster` and
 * `/clan/remove` with the session's ticket as the bearer (`packages/viewer/src/manageRosterHost.ts`). A rejection is a
 * request never answered.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The member's roster (the leader's is `MANAGE_ROSTER_LEADER`, `./createClanCommands`). */
export const MANAGE_ROSTER = 'dlgManageRoster.rdr';

/** The rows this module fills (PLAT-08's table: id, name, function), and the task the table names as their bodies' owner. */
export const MANAGE_ROSTER_COMMAND_ROWS = [
  { id: 54, name: 'GetClan', fn: 0x27aa60, task: 'ONL-27' },
  { id: 52, name: 'IsMemberOfClan', fn: 0x27a910, task: 'ONL-27' },
  { id: 53, name: 'IsLeaderOfClan', fn: 0x27a890, task: 'ONL-27' },
  { id: 80, name: 'GetClanRoster', fn: 0x27a390, task: 'ONL-27' },
  { id: 174, name: 'GetClanMemberInfo', fn: 0x279a20, task: 'ONL-27' },
  { id: 91, name: 'QuitClan', fn: 0x278d00, task: 'ONL-27' },
] as const;
export type ManageRosterCommandName = (typeof MANAGE_ROSTER_COMMAND_ROWS)[number]['name'];

/** CLAN_ROSTER (S:0x3f3930; the lobby's +0xd8, `DAT_0044f448`, added TEMPORARY at the session's start, D:L182217-182218): the roster's rows. */
export const CLAN_ROSTER_VAR = 'CLAN_ROSTER';
/** ClanRating (S:0x3f4038, added TEMPORARY by the roster's builder, D:L186694): the clan rating #462 shows. */
export const CLAN_RATING_VAR = 'ClanRating';
/** PLAYER_NAME_AND_TAG (S:0x3f4380), added PERMANENT by GetMyClans' reply (D:L187837). */
const PLAYER_NAME_AND_TAG_VAR = 'PLAYER_NAME_AND_TAG';
/** The persona's name as ONL-06 keeps it (0x3ee980), the account name's stand-in (`ACCOUNT_NAME_READING`). */
const PLAYER_NAME_VAR = 'PLAYERNAMEVAR';

/** GetMyClans' words (`FUN_002e8a90` D:L187756-187757: 1 at +0x28, 999 at +0x2c). */
export const MY_CLANS_QUERY = { start: 1, pageSize: 999 } as const;
/** GetClanMemberList_ExtraInfo's words after the clan id (`FUN_002e69f0` D:L186574-186576: 0 at +0x1c, 1 at +0x20). */
export const CLAN_ROSTER_QUERY = { ladderStatIndex: 0, sortOrder: 1 } as const;
/** The rows the clan rating is the mean of, and the least the roster must hold for one (`FUN_002e6af0` D:L186626, D:L186634; `FUN_002e7f50` D:L187302). */
export const CLAN_RATING_ROWS = 8;
/** The ONLINE column's glyphs (S:0x3f4000 for a state of 0, S:0x3f4008 else; D:L186647-186653): as the ignore list's. */
export const ROSTER_ONLINE_GLYPH = { offline: '\xaa', online: '\xa7' } as const;
/** The POSITION column (S:0x3f4010 for the leader's row, S:0x3f3f18 else; D:L186657-186662). */
export const ROSTER_LEADER_MARK = '(Leader)';
/** A room named "Medius..." (`strncmp` 6 with S:0x3f4020, D:L186670) is shown "MAIN MENU" (S:0x3f4028). */
const MEDIUS_PREFIX = 'Medius';
export const ROSTER_MAIN_MENU = 'MAIN MENU';

/** The lobby's state in the menus (`WORLD_LOBBY_STATE_READING`, `./worldOfSocomCommands`): 0x0b. */
const LOBBY_STATE_ONLINE = 0x0b;
/** `FUN_003857c0(.., 0, 1)`: TEMPORARY; `(.., 0, 2)`: PERMANENT. */
const TEMPORARY = 1;
const PERMANENT = 2;
/** The arguments the rows test (S:0x3ee898). */
const INPUT_STRING = 'INPUT_STRING';
/** The keyed cell's key (S:0x3f3ff8, `FUN_003333f0`, D:L186644). */
const VALUE_KEY = 'VALUE';
const BLANK = ' ';
const EMPTY = '';
/** The tag's place in the clan stats (0x44f5f7 = the record at 0x44f5e8 + 0xf, D:L187818). */
const CLAN_TAG_OFFSET = 15;
/** The description's place in an account's stats record (+0x9f, 66 bytes; the roster row's +0xdf, D:L186654; research 261 §1). */
const DESCRIPTION_OFFSET = 0x9f;

/**
 * CLAN_SELF_BY_NAME_ADAPTATION: the session's own account id, `DAT_0066a4f0`, which the console holds from its login
 * and the page is never told (`CLAN_LEADER_MINE_ADAPTATION`, `./createClanCommands`; `OWN_WHISPER_BY_NAME_ADAPTATION`).
 * The rows that need it -- `IsLeaderOfClan`'s compare (`FUN_002e67d0`), the roster's POSITION column, the leader's
 * removal of his own row (`FUN_002e7450` D:L186924-186928), QuitClan's request (`FUN_002e8ef0` D:L187863) and
 * MP_MEDIUS_BECAME_LEADER's test (D:L187806-187807) -- read it from `LobbyClan.self`, learned by the session's account
 * name: a GetMyClans reply whose leader's name is it (case-blind, `FUN_00198b80`) gives the leader's id, a roster row of
 * that name gives its account. Until then it is unknown, and QuitClan sends nothing. A browser adaptation of the
 * representation; what the rows answer is the original's.
 */
export const CLAN_SELF_BY_NAME_ADAPTATION = 'the session\'s own account id learned by its name: the leader\'s in GetMyClans\' reply, a roster row\'s' as const;

/**
 * CLAN_REQUEST_SESSION_ADAPTATION: GetMyClans' replies are taken only for the latest request, under the ticket it was
 * sent with and still held; and at the first clan row under a new ticket (a logoff, another login on the same page,
 * `lobbyClient`'s re-login on one connection) the client's clan, the session's own id and GetClan's request state
 * (`DAT_0044f788`) reset (`session`, `LobbyClan.reset`) -- the console's lobby teardown resets the state (`FUN_002df8e0`
 * -> `FUN_002e81a0`, D:L182267, D:L187362-187368), its init the ids and the name (D:L182792-182795), its login the own
 * id (`DAT_0066a4f0`, D:L191037, D:L191185), with the connection the replies would have come on (ONL-27's review, F1). A
 * browser adaptation of the transport.
 */
export const CLAN_REQUEST_SESSION_ADAPTATION = "GetMyClans' reply taken under the ticket it was asked with; a new ticket resets the client's clan, its own id and GetClan's state" as const;

/**
 * CLAN_ROSTER_TICKET_ADAPTATION: the roster's replies are taken only for the latest request, under the ticket still held;
 * a quit's (and the leader's rows' -- `./manageRosterLeaderCommands`) reply acts only under the ticket the request began
 * with, as the invitations' chains (`CLAN_INVITE_TICKET_ADAPTATION`). A browser adaptation of the transport.
 */
export const CLAN_ROSTER_TICKET_ADAPTATION = 'a roster reply taken only for the latest request; a quit or a leader\'s action acts only under its ticket' as const;

/**
 * CLAN_DISBANDED_OWN_RECORD_READING: GetMyClans' request remembers whether the player was in a clan (`DAT_0044f790`,
 * D:L187753) as the client's clan id not -1 **or** the first byte of the session's own stats record's clan name
 * (0x66a790: the parsed record at 0x66a750, its +0x40) not 0; a no-clan reply then raises MP_CLAN_DISBANDED (S:0x3f4550,
 * D:L187795-187800). The page holds no parsed own record (only its description, OPT-15's own-stats read), so the test
 * reads the clan id alone. The record's clan name is the original's post's (`FUN_002faa80`), which the services write
 * in its place at the account's own GetMyClans reply and quit (server `clans.ts`, `RECORD_CLAN_FIELDS_READING`); held by
 * the server, not by the page. [reading]
 */
export const CLAN_DISBANDED_OWN_RECORD_READING = 'MP_CLAN_DISBANDED\'s test reads the clan id alone: the own record\'s clan name (0x66a790) not held' as const;

/**
 * CLAN_ROSTER_SORT_READING: the roster's order before it is drawn and summed (`FUN_002e9b40` D:L188320-188454): below 21
 * rows the selection sort `FUN_002ea240` (D:L188497-188526) -- the largest ladder stat (+0x1cc) first, the first of equal
 * ones kept, the displaced row swapped into the found one's place; from 21 rows a quicksort with a rotating pivot pick
 * (`DAT_003df2a8`), not transcribed. The page sorts every roster with the selection sort: a clan holds at most 16 (the
 * client's seat rule, `CLAN_INVITE_SEATS`), so 21 rows are not reached. [reading]
 */
export const CLAN_ROSTER_SORT_READING = 'the selection sort FUN_002ea240 for every roster; the 21-row quicksort past the 16 seats not transcribed' as const;

/** One Lobby 0x7d reply (`MediusGetMyClansResponse`; Horizon's ids, `CLAN_PAIRS` in `packages/central/src/clans.ts`): the fields `FUN_002e8bd0` reads -- +0x18, +0x1c, +0x24:32, +0x44, +0x68:256 -- and the leader's name. */
export interface MyClansReply {
  status: number;
  clanId: number;
  clanName: string;
  leaderAccountId: number;
  /** The leader's account name (+0x48:32): read by the page only to learn its own id (`CLAN_SELF_BY_NAME_ADAPTATION`). */
  leaderAccountName: string;
  /** The clan stats, 256 bytes as 512 hex digits. */
  stats: string;
  endOfList: boolean;
}

/** One reply row of GetClanMemberList_ExtraInfo (Lobby 0xdb): the fields `FUN_002e9590` copies. */
export interface ClanRosterEntry {
  status: number;
  accountId: number;
  accountName: string;
  /** The account's stats record, 256 bytes as 512 hex digits. */
  stats: string;
  onlineState: LadderOnlineState;
  ladderStat: number;
  ladderPosition: number;
  totalRankings: number;
  /** +0x1d8. */
  endOfList: boolean;
}

/** The page's half: each request sent, its replies back (a rejection is a request never answered). */
export interface ManageRosterService {
  /** GetMyClans (Lobby 0x7c, 0x30 bytes: the session key at +0x15, start +0x28, page +0x2c; `FUN_006463e0`). */
  myClans(q: { start: number; pageSize: number }): Promise<readonly MyClansReply[]>;
  /** GetClanMemberList_ExtraInfo (0x24 bytes: the clan +0x18, the stat +0x1c, the order +0x20; `FUN_006468c8`). */
  roster(q: { clanId: number; ladderStatIndex: number; sortOrder: number }): Promise<readonly ClanRosterEntry[]>;
  /** RemovePlayerFromClan (Lobby 0x60, 0x30 bytes: the session key +0x15, the account +0x28, the clan +0x2c; `FUN_00645af0`): QuitClan's and the leader's removal. */
  remove(q: { playerAccountId: number; clanId: number }): Promise<{ status: number }>;
}

const str = (value: string): UiVarValue => ({ type: 'string', value });
const int = (value: number): UiVarValue => ({ type: 'int', value });
const arr = (...value: UiVarValue[]): UiVarValue => ({ type: 'array', value });
/** `%d`: a 32-bit value printed signed (S:0x3f3ef8). */
const d = (n: number): string => String(n | 0);

/** The C string at `from` of a record's hex (to its NUL or the record's end), a byte a character. */
export function hexCString(hex: string, from: number): string {
  let s = '';
  for (let i = from; i * 2 + 1 < hex.length; i++) {
    const b = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (!Number.isFinite(b) || b === 0) break;
    s += String.fromCharCode(b);
  }
  return s;
}

/** A reply row as the client keeps it (`FUN_002e9590` D:L188060-188138): its account, name, description, online state and ladder fields. */
export function rosterMemberOf(e: ClanRosterEntry): ClanRosterMember {
  return {
    accountId: e.accountId, name: e.accountName, description: hexCString(e.stats, DESCRIPTION_OFFSET), online: { ...e.onlineState },
    ladderStat: e.ladderStat, ladderPosition: e.ladderPosition, totalRankings: e.totalRankings,
  };
}

/** `FUN_002ea240` (D:L188497-188526) in place: for each place, the largest ladder stat from it on (the first of equals), swapped in (`CLAN_ROSTER_SORT_READING`). */
export function sortClanRoster(rows: ClanRosterMember[]): void {
  for (let i = 0; i < rows.length - 1; i++) {
    let best = i;
    for (let j = i + 1; j < rows.length; j++) if (rows[best]!.ladderStat < rows[j]!.ladderStat) best = j;
    if (best !== i) { const t = rows[best]!; rows[best] = rows[i]!; rows[i] = t; }
  }
}

/**
 * The clan rating of a sorted roster (`FUN_002e6af0` D:L186623-186690, `FUN_002e7f50` D:L187301-187320): with eight rows
 * or more, the first eight's ladder stats summed (32-bit) and divided by 8 toward zero (`+ 7` when below 0, `>> 3`);
 * else 0.
 */
export function clanRosterRating(rows: readonly ClanRosterMember[]): number {
  if (rows.length < CLAN_RATING_ROWS) return 0;
  let sum = 0;
  for (let i = 0; i < CLAN_RATING_ROWS; i++) sum = (sum + (rows[i]!.ladderStat | 0)) | 0;
  return (sum < 0 ? (sum + 7) | 0 : sum) >> 3;
}

/**
 * The roster's rows as `FUN_002e6af0` builds them (D:L186641-186680), in the roster's order: [the key cell -- VALUE
 * (S:0x3f3ff8) and `"%d"` of the account (`LADDER_KEYED_CELL_READING`'s flat form) --, the name, the ONLINE glyph, the
 * description (+0xdf), `"%d"` of the ladder position, "(Leader)" for the leader's row else " ", the medal (an int), then
 * for a member offline "" and "", else the room -- "MAIN MENU" and " " for a "Medius..." one -- and the game]. The
 * layout's seven columns draw the first seven: the key at x -270 and the description at 875, both off the page; RANK
 * the position, ONLINE the glyph, MEDAL the image, MEMBER the name, POSITION the mark.
 */
export function clanRosterRows(rows: readonly ClanRosterMember[], isLeader: (accountId: number) => boolean, medal: (position: number) => number): UiVarValue[] {
  return rows.map((m) => {
    const online = m.online.connectStatus !== 0;
    const where = !online ? [str(EMPTY), str(EMPTY)]
      : m.online.lobbyName.startsWith(MEDIUS_PREFIX) ? [str(ROSTER_MAIN_MENU), str(BLANK)] : [str(m.online.lobbyName), str(m.online.gameName)];
    return arr(
      arr(str(VALUE_KEY), str(d(m.accountId))), str(m.name), str(online ? ROSTER_ONLINE_GLYPH.online : ROSTER_ONLINE_GLYPH.offline), str(m.description),
      str(d(m.ladderPosition)), str(isLeader(m.accountId) ? ROSTER_LEADER_MARK : BLANK), int(medal(m.ladderPosition)), ...where,
    );
  });
}

/** `FUN_00198b80` (strcasecmp): equal with A-Z folded. */
function caseless(a: string, b: string): boolean {
  const fold = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return fold(a) === fold(b);
}

export interface ManageRosterCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The client's clan (`WorldOfSocomCommands.clan`), the one every clan row reads. */
  clan: LobbyClan;
  /** The page's half; absent, every request is never answered. */
  service?: ManageRosterService;
  /** `DAT_0044f3c8(name, 0)`: a named event into the built dialog (MP_CLAN_DISBANDED, MP_MEDIUS_BECAME_LEADER). */
  event?: (kind: number, text: string | null) => void;
  /** The running animation's input string (`FUN_00272480(ctx + 0x18, 0)`): a row's INPUT_STRING. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** The lobby session's +0x7d and its state byte +0x60 (`WORLD_LOBBY_STATE_READING`); absent, up in state 11. */
  lobbyUp?: () => boolean;
  lobbyState?: () => number;
  /** The session's account name, 0x66a4f4 (`ACCOUNT_NAME_READING`); absent or null, PLAYERNAMEVAR's text. */
  accountName?: () => string | null;
  /** The session's ticket, for the two adaptations; absent, not checked. */
  ticket?: () => string | null;
  /** ONL-29's rows: GetMyClans' success asks the MESSAGES band through them (`FUN_002e8bd0` D:L187824-187831); absent, not asked. */
  clanMessages?: { myClanMessages(): void };
  /** My ladder total (`DAT_0044f800`, ONL-30a's position answer) the medal column reads (`FUN_002eaee0`); absent, 0: no medal. */
  ladderTotal?: () => number;
  /** My ladder position (`DAT_0044f7f8`), which `FUN_002eaee0` puts for a row's -1 (D:L188943-188945); absent, 0 (the BSS's). */
  ladderPosition?: () => number;
  /** A row called, as it happens. */
  log?: (name: ManageRosterCommandName, arg: string, answer: boolean) => void;
}

export class ManageRosterCommands {
  /** `DAT_0044f788`: GetClan's request state (0 idle, 1 asked, 2 answered). */
  private clanState: 0 | 1 | 2 = 0;
  /** The ticket the clan rows last ran under (`CLAN_REQUEST_SESSION_ADAPTATION`); undefined before the first. */
  private sessionTicket: string | null | undefined = undefined;
  /** The latest GetMyClans and roster requests (`CLAN_REQUEST_SESSION_ADAPTATION`, `CLAN_ROSTER_TICKET_ADAPTATION`). */
  private clanSeq = 0;
  private rosterSeq = 0;
  /** `DAT_0044f790`: in a clan at the request (`CLAN_DISBANDED_OWN_RECORD_READING`). */
  private wasInClan = false;

  constructor(private readonly o: ManageRosterCommandsOptions) {}

  private answer(name: ManageRosterCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  private post(event: string, text: string | null = null): void { this.o.event?.(DIALOG_EVENTS[event]!, text); }

  private up(): boolean { return this.o.lobbyUp?.() ?? true; }
  /** The lobby session up and in state 11 (`WORLD_LOBBY_STATE_READING`). */
  private online(): boolean { return this.up() && (this.o.lobbyState?.() ?? LOBBY_STATE_ONLINE) === LOBBY_STATE_ONLINE; }

  private ticketNow(): string | null { return this.o.ticket?.() ?? null; }

  /**
   * `CLAN_REQUEST_SESSION_ADAPTATION`: at the first clan row under a ticket other than the one the rows last ran under
   * (a logoff, a new login on the same page), the client's clan and the session's own id reset (`LobbyClan.reset`) and
   * GetClan's state back to 0 -- as the console's lobby teardown (`FUN_002df8e0` -> `FUN_002e81a0`, D:L182267), its init
   * (the ids -1 and the name zeroed, D:L182792-182795) and its login (`DAT_0066a4f0` from the reply, D:L191037,
   * D:L191185) do. Absent the ticket hook, nothing is checked. Public: the leader's rows run it too.
   */
  session(): void {
    if (this.o.ticket === undefined) return;
    const now = this.ticketNow();
    if (now === this.sessionTicket) return;
    if (this.sessionTicket !== undefined) { this.o.clan.reset(); this.clanState = 0; }
    this.sessionTicket = now;
  }

  /** `CLAN_ROSTER_TICKET_ADAPTATION`: whether the session's ticket is still the one held now (absent the hook, always). */
  sameSession(): () => boolean {
    if (this.o.ticket === undefined) return () => true;
    const ticket = this.o.ticket();
    return () => ticket !== null && this.o.ticket!() === ticket;
  }

  /** A row's argument: INPUT_STRING replaced by the running animation's input string (`FUN_0026ed60`, `FUN_00198f18`, `FUN_00272480`). */
  argument(cmd: ZAnimUiCommand): string | null {
    return cmd.arg === INPUT_STRING ? this.o.inputString?.(cmd) ?? null : cmd.arg === '' ? null : cmd.arg;
  }

  /** The session's account name (0x66a4f4), else PLAYERNAMEVAR's text (`ACCOUNT_NAME_READING`). */
  myName(): string {
    const held = this.o.uiVars.find(PLAYER_NAME_VAR)?.value;
    return this.o.accountName?.() ?? (held?.type === 'string' ? held.value : '');
  }

  private setVar(name: string, text: string, longevity: LiveLongevity = PERMANENT): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(name, null, longevity), str(text));
  }

  // ---- GetMyClans ----

  /**
   * 0x27aa60: `j FUN_002e8a90` (ELF 0x27aa64), `FUN_002e8a90` (D:L187723-187766): 1 at once unless the session is up in
   * state 11; by its state `DAT_0044f788`: 1 (asked, not answered) 0; 2 (answered) back to 0 and 1; else CLANNAMEVAR and
   * Clan_Description (the lobby's +0xf0 / +0xf4) emptied, `DAT_0044f790` the clan held (D:L187753, `CLAN_DISBANDED_OWN_RECORD_READING`),
   * GetMyClans sent (`MY_CLANS_QUERY`; `FUN_006463e0`, the callback `FUN_002e8bd0`), the state 1, and 0 -- a statement
   * answering 0 holds its sequence and is asked again next tick.
   */
  GetClan: UiCommandHandler = (cmd) => {
    this.session();
    if (!this.online()) return this.answer('GetClan', cmd, true);
    if (this.clanState === 1) return this.answer('GetClan', cmd, false);
    if (this.clanState === 2) { this.clanState = 0; return this.answer('GetClan', cmd, true); }
    this.setVar(CLAN_NAME_VAR, EMPTY);
    this.setVar(CLAN_DESCRIPTION_VAR, EMPTY);
    this.clanState = 1;
    this.wasInClan = this.o.clan.member;
    const seq = ++this.clanSeq;
    const held = this.sameSession();
    this.o.service?.myClans({ ...MY_CLANS_QUERY }).then((rs) => {
      if (seq !== this.clanSeq || !held()) return;                                  // CLAN_REQUEST_SESSION_ADAPTATION
      for (const r of rs) this.myClansReply(r);
    }, () => { /* never answered: the state stays 1 */ });
    return this.answer('GetClan', cmd, false);
  };

  /**
   * `FUN_002e8bd0` (D:L187769-187847), one reply. A status not Success (`FUN_002f42d0` "GetMyClans", S:0x3f4518,
   * D:L187787): the three ids -1 and the name zeroed (D:L187789-187792), CLANNAMEVAR and Clan_Description ""
   * (D:L187793-187794), when the request was made in a clan MP_CLAN_DISBANDED (D:L187795-187800; the record's post,
   * D:L187799, is the services' at the reply -- server `clans.ts`, `RECORD_CLAN_FIELDS_READING`), the roster emptied and
   * drawn (D:L187801-187802). Success:
   * MP_MEDIUS_BECAME_LEADER when the leader was known and not mine and the reply's (+0x44) is mine (D:L187806-187809); the
   * clan id (+0x1c), the leader id (+0x44) and the name (+0x24, 32 bytes) kept (D:L187810-187813), the stats (+0x68)
   * copied (D:L187814-187816); CLANNAMEVAR the name, Clan_Description the tag at the stats' +15 (D:L187817-187818); the
   * icon's file name made of `atoi` of the first three characters (`clan_icon_%.2d.tif`, S:0x3f4310, D:L187819-187822)
   * into a buffer nothing reads; the roster asked (`FUN_002e69f0`, D:L187823) and the band (`myClanMessages`,
   * D:L187824-187831). Both: PLAYER_NAME_AND_TAG added PERMANENT and set to `playerNameAndTag` of Clan_Description's
   * text and the account's name (D:L187837-187844); the state 2 (D:L187845).
   */
  myClansReply(r: MyClansReply): void {
    const clan = this.o.clan;
    const me = this.myName();
    let tag: string | null = null;
    if (r.status !== 0) {
      clan.clanId = -1; clan.leader = -1; clan.name = EMPTY;
      this.setVar(CLAN_NAME_VAR, EMPTY);
      this.setVar(CLAN_DESCRIPTION_VAR, EMPTY);
      if (this.wasInClan) this.post('MP_CLAN_DISBANDED');                            // FUN_002faa80 after it: the services' (RECORD_CLAN_FIELDS_READING)
      clan.roster.length = 0;                                                        // FUN_002e9740
      this.drawRoster();                                                             // FUN_002e6af0
    } else {
      const replyIsMine = caseless(r.leaderAccountName, me);
      if (replyIsMine) clan.self = r.leaderAccountId | 0;                          // CLAN_SELF_BY_NAME_ADAPTATION
      if (clan.leader !== -1 && !clan.leaderIsSelf() && replyIsMine) this.post('MP_MEDIUS_BECAME_LEADER');
      clan.clanId = r.clanId | 0;
      clan.leader = r.leaderAccountId | 0;
      clan.name = r.clanName;
      tag = hexCString(r.stats, CLAN_TAG_OFFSET);
      this.setVar(CLAN_NAME_VAR, clan.name);
      this.setVar(CLAN_DESCRIPTION_VAR, tag);
      this.requestRoster();
      this.o.clanMessages?.myClanMessages();
    }
    const held = this.o.uiVars.find(CLAN_DESCRIPTION_VAR)?.value;
    const text = r.status !== 0 ? null : held?.type === 'string' ? held.value : tag;
    this.setVar(PLAYER_NAME_AND_TAG_VAR, playerNameAndTag(text ?? EMPTY, me));
    this.clanState = 2;
  }

  /** 0x27a910 -> `FUN_002e6830` (D:L186491-186497): the clan id is not -1. */
  IsMemberOfClan: UiCommandHandler = (cmd) => { this.session(); return this.answer('IsMemberOfClan', cmd, this.o.clan.member); };

  /**
   * `FUN_0027a890` (D:L124550-124564): the argument (`FUN_0026ed60`, the record's +8), INPUT_STRING replaced by the
   * running animation's input string, to `FUN_002e67d0` (D:L186474-186488) -- the leader id is the roster row's of that
   * name or id (`FUN_002e9460`), else mine (`LobbyClan.leaderIsMine`) -- whose answer it returns.
   */
  IsLeaderOfClan: UiCommandHandler = (cmd) => { this.session(); return this.answer('IsLeaderOfClan', cmd, this.o.clan.leaderIsMine(this.argument(cmd))); };

  // ---- the roster ----

  /** `FUN_0027a390` (D:L124380-124387) -> `FUN_002e69f0`; 1. */
  GetClanRoster: UiCommandHandler = (cmd) => {
    this.session();
    this.requestRoster();
    return this.answer('GetClanRoster', cmd, true);
  };

  /**
   * `FUN_002e69f0` (D:L186557-186582), also GetMyClans' success and the leader's removal: only while the session is up in
   * state 11, the roster emptied (`FUN_002e9740`) and drawn (`FUN_002e6af0`), then GetClanMemberList_ExtraInfo sent --
   * the clan id `DAT_003df298` at +0x18, `CLAN_ROSTER_QUERY` (0x24 bytes, no session key; `FUN_006468c8`) -- with the
   * callback `FUN_002e6a90`. 1 when sent, else 0.
   */
  requestRoster(): boolean {
    if (!this.online()) return false;
    const clan = this.o.clan;
    clan.roster.length = 0;
    this.drawRoster();
    const seq = ++this.rosterSeq;
    const held = this.sameSession();
    this.o.service?.roster({ clanId: clan.clanId, ...CLAN_ROSTER_QUERY }).then((rs) => {
      if (seq !== this.rosterSeq || !held()) return;                                // CLAN_ROSTER_TICKET_ADAPTATION
      for (const r of rs) this.rosterReply(r);
    }, () => { /* never answered */ });
    return true;
  }

  /**
   * `FUN_002e6a90` (D:L186585-186598), one reply row: a Success ("MemberListRequest", S:0x3f3fe0) kept by its account
   * unless a row holds it (`FUN_002e9590` D:L188060-188138) and, when it ends the list (+0x1d8), the roster drawn; a
   * refusal nothing. The row of the session's name gives its id (`CLAN_SELF_BY_NAME_ADAPTATION`).
   */
  rosterReply(r: ClanRosterEntry): void {
    if (r.status !== 0) return;
    const clan = this.o.clan;
    if (!clan.roster.some((m) => m.accountId === r.accountId)) clan.roster.push(rosterMemberOf(r));
    if (caseless(r.accountName, this.myName()) && r.accountName !== '') clan.self = r.accountId | 0;
    if (r.endOfList) this.drawRoster();
  }

  /**
   * `FUN_002e6af0` (D:L186601-186704): the rating 0, the roster sorted (`FUN_002e9b40`, `CLAN_ROSTER_SORT_READING`), the
   * rows set into CLAN_ROSTER (`clanRosterRows`, the medal `FUN_002eaee0` of each position against my total, a -1 my
   * position, D:L186663, D:L188943-188945) and the rating -- the first eight's mean with eight or more (`clanRosterRating`) -- into `DAT_0044f770`
   * and ClanRating (added TEMPORARY, an int, written when it differs, D:L186693-186701).
   */
  drawRoster(): void {
    const clan = this.o.clan;
    sortClanRoster(clan.roster);
    const total = this.o.ladderTotal?.() ?? 0;
    const rows = clanRosterRows(clan.roster, (id) => clan.leaderIs(id), (p) => ladderMedal(p, total, this.o.ladderPosition?.() ?? 0));
    clan.rating = clanRosterRating(clan.roster);
    const vars = this.o.uiVars;
    vars.set(vars.add(CLAN_ROSTER_VAR, null, TEMPORARY), arr(...rows));
    const rating = vars.add(CLAN_RATING_VAR, null, TEMPORARY);
    if (rating.value.type !== 'int' || rating.value.value !== clan.rating) vars.set(rating, int(clan.rating));
  }

  /**
   * `FUN_00279a20` (D:L124038-124054): the argument, INPUT_STRING replaced; when there is one, `FUN_002e6000`
   * (D:L186177-186184), which looks the name up in the roster (`FUN_002e9460`) and keeps nothing. 1.
   */
  GetClanMemberInfo: UiCommandHandler = (cmd) => {
    this.session();
    const name = this.argument(cmd);
    if (name !== null) this.o.clan.find(name);
    return this.answer('GetClanMemberInfo', cmd, true);
  };

  // ---- QuitClan ----

  /**
   * `FUN_00278d00` (D:L123692-123699) -> `FUN_002e8ef0` (D:L187850-187870): only while the session's +0x7d is set (no
   * state test), RemovePlayerFromClan with the session's own account (`DAT_0066a4f0`, `CLAN_SELF_BY_NAME_ADAPTATION`: not
   * sent while it is unknown) at +0x28 and the clan `DAT_003df298` at +0x2c (0x30 bytes, `FUN_00645af0`), the callback
   * `FUN_002e8f70`; 1.
   */
  QuitClan: UiCommandHandler = (cmd) => {
    this.session();
    const clan = this.o.clan;
    if (this.up() && clan.self !== null) {
      const held = this.sameSession();
      this.o.service?.remove({ playerAccountId: clan.self, clanId: clan.clanId }).then((s) => { if (held()) this.quitReply(s); }, () => { /* never answered */ });
    }
    return this.answer('QuitClan', cmd, true);
  };

  /**
   * `FUN_002e8f70` (D:L187873-187895): a Success ("QuitClan", S:0x3f4568) -- the three ids -1 and the name zeroed,
   * CLANNAMEVAR and Clan_Description "", MEDIUS_CLAN_MESSAGES "No clan messages." (S:0x3f3f60, D:L187889), the roster
   * emptied and drawn, then the record's post -- the services' at the quit's Success (server `clans.ts`,
   * `RECORD_CLAN_FIELDS_READING`); a refusal nothing.
   */
  private quitReply(s: { status: number }): void {
    if (s.status !== 0) return;
    const clan = this.o.clan;
    clan.clanId = -1; clan.leader = -1; clan.name = EMPTY;
    this.setVar(CLAN_NAME_VAR, EMPTY);
    this.setVar(CLAN_DESCRIPTION_VAR, EMPTY);
    this.setVar(MEDIUS_CLAN_MESSAGES_VAR, NO_CLAN_MESSAGES, TEMPORARY);
    clan.roster.length = 0;
    this.drawRoster();
  }

  /** The entries by their table name. */
  entries(): Record<ManageRosterCommandName, UiCommandHandler> {
    return {
      GetClan: this.GetClan, IsMemberOfClan: this.IsMemberOfClan, IsLeaderOfClan: this.IsLeaderOfClan, GetClanRoster: this.GetClanRoster,
      GetClanMemberInfo: this.GetClanMemberInfo, QuitClan: this.QuitClan,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
