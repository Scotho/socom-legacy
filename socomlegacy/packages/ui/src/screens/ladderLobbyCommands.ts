import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { ClanRosterMember, LobbyClan } from './createClanCommands';
import { atoi } from './menuCommands';

/**
 * PLAYER RANKING (`dlgLadderLobby.rdr`), PLAYER INFO on its CROSS, and SOCOM II ONLINE's top ten (ONL-30a, web sprint
 * 18; web research 269 §2, on research 155 §2.2-§3, research 97 §2.2 and research 261 §9): the two rows of PLAT-08's
 * table -- `GetLadderInfo` (row 92) and `GetPlayerInfo` (row 173) -- over SVC-13's ladder and SVC-15a's PLAYER INFO
 * (`packages/central/src/ladder.ts`, `playerInfo.ts`). `D:L<line>` = a line of `socom2_game.elf.decomp.c`; `S:0x...` a
 * string of the retail ELF. Transcribed, cited, never pasted; reading, pending review.
 *
 * **The page is the disc's** (`tools/dump-online-dialogs.ts --dialog dlgLadderLobby.rdr`): ONSTART `get_ladder_top_10`
 * (`ClearUIVar(LADDER_LEADERS)`, `GetLadderInfo` mode 0, `DisableButton(LadderTop10)`), `PulseArrows`, `net_monitor`
 * and `ActivateMedalOfMerit`; THE PODIUM's `LadderTop10` on LADDER_LEADERS (columns 10 / 90 / 35: position, name, tag);
 * `LadderList` on LADDER_RANKING (columns -600 / 130 / 47 / 20 / 80: the key cell, drawn nowhere -- left of the screen
 * --, the name under PLAYER, the position and the 16 x 16 medal under RANK, the tag); L1 / L2 on the list `ladder_up` /
 * `ladder_down` (mode 2 then 4, mode 3 then 5, `WAIT 0.5`); ON_LADDER_REFRESH `RefreshArrows` (modes 3 and 2: the two
 * arrows shown or hidden); the list's CROSS `playerinfo_activate` (the page `pop_missionBack` shown, the five
 * PLAYER_INFO variables cleared, `GetPlayerInfo(INPUT_STRING)` mode 3, LADDER); the page's R1 `playerinfo_send_message`
 * (the whisper, ONL-23's `SendMediusChat`), its SQUARE `playerinfo_ignore_player` (a DEBUG op only), its TRIANGLE
 * `playerinfo_deactivate`; the screen's TRIANGLE `goto_menu(PREVIOUS_SCREEN)` (SND_DINK); MP_PLAYER_NOT_FOUND
 * `PlayerNotFound` (the whisper's FindPlayer refused, `FUN_002f4a20` D:L194614-194619). SOCOM II ONLINE's ONSTART
 * `get_ladder_top_10` sends modes 1 and 7 (the clans' podium).
 *
 * **CLAN RANKING** (`dlgClanLadderLobby.rdr`; ONL-30, web research 311): the clans' half of the same client ladder --
 * `GetLadderInfo`'s modes 6-11 and row 162 `GetClanRanking` over CLAN-BOARD-SERVER's three answers (the clan's position
 * 0xd4, the clans' total 0xd8 type 1, the clans' list 0xd2). The lobby object's clan list at 0x44f850 (the count
 * `DAT_0044f854`, the records `DAT_0044f858`, the bound `DAT_0044f85c` +0xc, the start `DAT_0044f860` +0x10), the
 * podium's at 0x44f820, my clan's position `DAT_0044f868`, `TotalClans` `DAT_0044f870`, one list request at a time
 * (`DAT_0044f880`). A clan row (0x48 bytes, `FUN_002ebcf0` D:L189511-189537): the request's tag, the clan id +0x18, the
 * name +0x1c, the position +0x3c. The client's clan (`DAT_003df298`, its copy `DAT_0044f59c`) is the session's
 * `LobbyClan` (`./createClanCommands`), handed in as `clan`.
 *
 * **The client's ladder** (the lobby object 0x44f370): the page's rows at 0x44f7b0 (the count +4, the records +8, the
 * start `DAT_0044f7bc` +0xc, the largest position `DAT_0044f7c0` +0x10 -- also the total the position answers write),
 * the podium's at 0x44f7e0, my position `DAT_0044f7f8` and the total the medal reads `DAT_0044f800`, one request of the
 * page's rows at a time (`DAT_0044f878`). A row (0xac bytes, `FUN_002ebe50` D:L189547-189606): the online state at +0
 * (`FUN_002ebfe0` D:L189609-189647), the name +0x8c, `[%s]` (S:0x3f4748) of the record's tag +0x98 (empty for none),
 * the reply's +0x20 at +0xa4 and the position +0xa8.
 *
 * The transport is ours (OT.R27): `LadderService` is the page's `/lobby/ladder-position`, `/lobby/ladder-list` and
 * `/lobby/player-info` with the session's ticket as the bearer (`packages/viewer/src/ladderLobbyHost.ts`). A rejection
 * is a request never answered. Since SVC-15 the services serve each row's account id at +0x20 and my position for the
 * bearer's own account, so the page keys its rows and asks PLAYER INFO by the id, and asks its position in one request,
 * as the original does (ONL-30a's two adaptations retired, research 269 §2.5).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialogs. */
export const LADDER_LOBBY = 'dlgLadderLobby.rdr';
export const CLAN_LADDER_LOBBY = 'dlgClanLadderLobby.rdr';

/** The rows this module fills (PLAT-08's table: id, name, function), and the task the table names as their bodies' owner. */
export const LADDER_LOBBY_COMMAND_ROWS = [
  { id: 92, name: 'GetLadderInfo', fn: 0x2784d0, task: 'ONL-30a' },
  { id: 162, name: 'GetClanRanking', fn: 0x27a250, task: 'ONL-30' },
  { id: 173, name: 'GetPlayerInfo', fn: 0x279b50, task: 'ONL-30a' },
] as const;
export type LadderLobbyCommandName = (typeof LADDER_LOBBY_COMMAND_ROWS)[number]['name'];

/**
 * `GetLadderInfo`'s mode, the command's word at +0x10 (`FUN_002784d0` D:L123407-123492; the record builder `FUN_00278750`
 * D:L123495-123578 maps the argument's words -- "CLAN" S:0x3eecd0, "Top10" S:0x3eecd8, "LadderPressUp" S:0x3eece0,
 * "LadderPressDown" S:0x3eecf0, "LadderUp" S:0x3eed00, "LadderDown" S:0x3eed10 -- to it; the disc's scripts arrive with
 * the word written). The disc's sets send 0 (PLAYER RANKING's ONSTART), 2 / 4 (L1), 3 / 5 (L2), 3 and 2 (the arrows), 1
 * and 7 (SOCOM II ONLINE's ONSTART), 6 and 8-11 (CLAN RANKING's). The clans' named for what they do (research 311 §1
 * R311.1): 6 the page's entry (the position, the total and the podium), 7 the podium alone, 8 / 9 the up / down tests,
 * 10 / 11 a page up / down.
 */
export const LADDER_INFO_MODE = {
  position: 0, top10: 1, pressUp: 2, pressDown: 3, up: 4, down: 5,
  clanPage: 6, clanPodium: 7, clanPressUp: 8, clanPressDown: 9, clanUp: 10, clanDown: 11,
} as const;

/** `GetPlayerInfo`'s origin, the command's word at +0x10 (`FUN_00279b50` D:L124093), and the tag `FUN_002efe50` (D:L191702-191716) writes for it into the request's MessageID. */
export const PLAYER_INFO_ORIGIN = { briefing: 0, clan: 1, friend: 2, ladder: 3 } as const;
/** BRIEFING (S:0x3f4c18, also any other value), CLAN (S:0x3f4c28), FRIEND (S:0x3f4c30), LADDER (S:0x3f4c38). */
export const PLAYER_INFO_ORIGIN_TAGS = ['BRIEFING', 'CLAN', 'FRIEND', 'LADDER'] as const;

/** LADDER_LEADERS (lobby +0xdc, `DAT_0044f44c`) and LADDER_RANKING (+0xe0, `DAT_0044f450`): the lobby session's variables (D:L182221-182224). */
export const LADDER_LEADERS_VAR = 'LADDER_LEADERS';
export const LADDER_RANKING_VAR = 'LADDER_RANKING';
/** The UI variable the position answers write, my position (S:0x3f4678). */
export const LADDER_POSITION_VAR = 'LadderRanking';
/** The valves the position answers write (S:0x3f4690, S:0x3f46b0): my medal and my restriction tier. */
export const LADDER_MEDAL_VALVE = 'LadderMedalOfMerit';
export const LADDER_TIER_VALVE = 'LadderRankRestriction';
/** PLAYER INFO's variables (S:0x3f4ba0, S:0x3f4be0, S:0x3f4c00, S:0x3f4c60, S:0x3f4c80). */
export const PLAYER_INFO_VAR1 = 'PLAYER_INFO_VAR1';
export const PLAYER_INFO_VAR2 = 'PLAYER_INFO_VAR2';
export const PLAYER_INFO_DESCRIPTION_VAR = 'PLAYER_INFO_DESCRIPTION';
export const PLAYER_INFO_NAME_VAR = 'PLAYER_INFO_NAME_VAR';
export const PLAYER_INFO_CHAT_NAME_VAR = 'PLAYER_INFO_CHAT_NAME_VAR';

/** CLAN_LADDER_LEADERS (lobby +0xe4, `DAT_0044f454`, S:0x3f3970) and CLAN_LADDER_RANKING (+0xe8, `DAT_0044f458`, S:0x3f3990): the lobby session's variables (D:L182225-182228). */
export const CLAN_LADDER_LEADERS_VAR = 'CLAN_LADDER_LEADERS';
export const CLAN_LADDER_RANKING_VAR = 'CLAN_LADDER_RANKING';
/** The UI variables the clans' answers write, each added TEMPORARY (`FUN_003857c0(.., 0, 1)`): my clan's position (S:0x3f4640, D:L188842) and the clans' total (S:0x3f46f8, D:L189078) -- drawn by no dialog of the disc (research 311 §3.1). */
export const CLAN_POSITION_VAR = 'ClanLadderRanking';
export const CLAN_TOTAL_VAR = 'TotalClans';
/**
 * The clans' MessageIDs: "GetSurrounding" (S:0x3f45f8) the entry's position tag (`FUN_002eab80` D:L188811-188812, its second
 * argument 1 from `GetLadderInfo`, ELF 0x2784d4), "ClanTotal" (S:0x3f4608) the total's (D:L188821), "ClanLadderList"
 * (S:0x3f4578) a page's (D:L188621), "ClanLadderLeaders" (S:0x3f4590) the podium's (D:L188650). The total's tag is the
 * console's; our reply carries none and the page knows which request it sent (the transport, OT.R27).
 */
export const CLAN_LADDER_TAGS = { surrounding: 'GetSurrounding', total: 'ClanTotal', list: 'ClanLadderList', leaders: 'ClanLadderLeaders' } as const;

/** The page's rows a request asks: `7 << 1` (`FUN_002eb510` D:L189203, the callers' 7, D:L189150, D:L123440-123452). */
export const LADDER_PAGE_ROWS = 14;
/** The podium's rows (`FUN_002eb610`'s 10 from 1, D:L123420-123425). */
export const LADDER_PODIUM_ROWS = 10;
/** The stat the client asks and its order (`LadderStatIndex` 0, `MediusSortOrder` 1: D:L189205-189206, D:L189232-189233). */
export const LADDER_LIST_STAT = { ladderStatIndex: 0, sortOrder: 1 } as const;
/** My row's colour (`FUN_002eb900` D:L189401-189403: the floats 91, 72, 36), and PLAYER INFO's "In Lobby" (`FUN_002f0020` D:L191781-191783). */
export const LADDER_OWN_ROW_COLOR = [91, 72, 36] as const;

/** The texts (S:0x3f4bc0, S:0x3f4bf8, S:0x3f4ee0, S:0x3f4748). */
export const PLAYER_INFO_RETRIEVING = 'Retrieving Player Info';
export const PLAYER_INFO_SPACE = ' ';
export const PLAYER_INFO_FAILED = 'Could not retrieve player information.';
/** PLAYER_INFO_NAME_VAR with a clan tag (S:0x3f4c40): the tag's colour `#C` 80 40 20, `[%s] `, the name's `#C` 53 48 24, `%s`. */
const NAME_WITH_TAG = (tag: string, name: string): string => `#C\x80\x40\x20[${tag}] #C\x53\x48\x24${name}`;

/**
 * LADDER_KEYED_CELL_READING (research 269 §2.4): my row's tinted cells and PLAYER INFO's "In Lobby" are built flat --
 * `VALUE`, the text, `COLOR`, the three numbers -- where the original nests each key's value in an array of its own
 * (`FUN_003333f0`, `FUN_00333490`: the key added, then an array holding the value or the three floats, D:L232672-232705),
 * which `FUN_0032ee10` reads by its first string. The page's LISTBOX reads a key's value as a string only
 * (`LISTBOX_ARRAY_CELL_KEYS_READING`); built so, the cell draws its text in its colour as the original's does. Settles:
 * that listbox reading widened to the nested value. [reading]
 */
export const LADDER_KEYED_CELL_READING = 'a keyed cell built flat (VALUE text COLOR rgb); the original nests each value in an array' as const;

/**
 * CLAN_LADDER_REPLY_ORDER_READING (research 311 §3.7, §9): the replies that meet the list's state are applied in the
 * order their requests were sent, one chain per entry. The client applies each reply as it lands, and three of them
 * write the list's bound (`FUN_002eac70` D:L188852, `FUN_002eb1b0` D:L189086, `FUN_002ebcf0` D:L189539-189541): applied
 * position-first the bound ends at the total; the other way it ends at the position and L2 cannot page down. The port's
 * HTTP answers complete in any order; the original server's order on its one connection is not read. As built
 * (CLAN-RANKING-STALL, LATER 51): the original matches a reply to its handler by its type alone -- one callback slot per
 * request type, rewritten at each send (`FUN_006467a8` D:L559258, `FUN_00646838` D:L559280, `FUN_0064aee8` D:L561948),
 * called with whatever reply of that type lands (D:L563488-563531), the list's and the podium's told apart by the tag the
 * reply carries back (`FUN_002ea730` D:L188676, D:L188684) -- no request id, no queue, so one unanswered request holds
 * nothing but the list's flag (`DAT_0044f880`, tested at D:L188617; freed by the list's end row D:L188687, by any reply
 * row not Success -- the podium's included -- D:L188671-188673, and by a "GetSurrounding" Success D:L188855). So: each
 * entry (`FUN_002eab80`: mode 6, row 162) opens a new chain -- the position, the total, and every list sent after it
 * until the next entry -- and a request that never settles holds only the replies of its own chain sent after it. At
 * the next entry, before its requests go out, the older chain is released: its turns already landed are applied then,
 * in the order sent, and any of it still out is applied as it lands, held by nothing -- the original's handlers acting
 * on a reply when it lands (`FUN_002ea730` D:L188684-188688), so a late reply never lands in a newer page held behind
 * an older turn. The trade-off, accepted: in a released chain an older position landing after its total ends the bound
 * at the position, as the original would in that order. A rejection frees its turn without effect. The podium
 * (`FUN_002ea6b0`: no flag; its rows at 0x44f820, whose +0xc nothing reads) joins no chain: applied as it lands.
 * Settles: ONL-32's capture of CLAN RANKING's entry (the order of the 0xd5, 0xd9 and 0xd3 replies, the arrows on the
 * first page). [reading]
 */
export const CLAN_LADDER_REPLY_ORDER_READING = 'the replies meeting the list\'s state applied in the order sent (position, total, list), one chain per entry, released at the next entry (then each applied as it lands); the podium applied as it lands' as const;

/**
 * CLAN_LADDER_BOOT_STATE_READING (research 311 §3.1, §9): the clan list's start 2 and bound 0 at this module's
 * construction (the console's static constructor `FUN_00401fa0` D:L328598, D:L328601), kept for the front end's life;
 * its rows outlive the page and are freed at a send (`FUN_002ec060` in `FUN_002ea5c0`, D:L188624). The console also frees
 * them at the lobby session's reset (`FUN_002df8e0` D:L182253), which is not wired here (the players' half's rows alike),
 * and keeps the start and bound across logins, where a page reload restarts all three. Settles: ONL-32's capture of an
 * off-board clan's first visit (L1 pages from 1 at the boot start). [reading]
 */
export const CLAN_LADDER_BOOT_STATE_READING = 'the clan list\'s start 2 and bound 0 at the module\'s construction, kept for the front end\'s life; its rows outlive the page, freed at a send' as const;

/**
 * Where PLAYER INFO reads the presence lines and the position from, by its origin (research 269 §2.4, §3.4; research
 * 268 §3.5; research 272 §5): the ladder's rows (LADDER, built here); the clan's roster at 0x44f740 (CLAN,
 * D:L191825-191857: its row of the reply's name, `FUN_002e9460` -- case-blind, else by the name's `strtol` against the
 * row's account -- its online state copied whole, D:L191830-191854, and its +0x1d0, the member's ladder position, in
 * place of the record's +0x08, D:L191855; PLAYER-INFO-CLAN's `ClanRosterPresence` of `LobbyClan.find`, handed in as
 * `clanState`); my friends list at 0x44fdc0 (FRIEND, D:L191859-191890: the record of the reply's name, case-blind,
 * `FUN_00301c40`, its online state copied whole, the position left the record's own +0x08; ONL-24's
 * `FriendListCommands.onlineStateByName`, handed in as `friendState`) and my briefing room's players (BRIEFING and any
 * other value, D:L191891-191929: the room's record by MEDIUS_LOBBY_NAME, `FUN_002e4470`, its row of the reply's name,
 * `FUN_002e3610`, strcmp, its online state copied whole, the position the record's own +0x08; SVC-15's
 * `BriefingRoomCommands.roomPlayerState`, handed in as `roomState`). No entry in the origin's list: state 0, NOT
 * CURRENTLY LOGGED IN (D:L192014-192017), the record's own +0x08 -- as the original with no such row.
 */
export type ClanRosterPresence = Pick<ClanRosterMember, 'online' | 'ladderPosition'>;

/**
 * PLAYER_INFO_RECORD_VERSION_READING (research 269 §2.4): the record the page reads from a reply. A first byte `'E'` is
 * read whole (`FUN_002f9ac0` copies 0xe4 bytes, D:L198088-198092); any other is the default record (D:L198207-198222:
 * version `'E'`, the rating 1000, the rest 0). The parser's conversions of the older versions `D`, `C`, `B`, `A`, `N`,
 * `Q` (D:L198093-198206) are not transcribed: the services serve every record through the one codec, which writes
 * `'E'` (`accountStatsCodec.ts`, W18.R2). A text field is read to its first NUL within its width, as the codec reads it
 * (`STATS_TEXT_ENCODING_READING`: one character a byte). Settles: a served record of another version. [reading]
 */
export const PLAYER_INFO_RECORD_VERSION_READING = 'E read whole; any other first byte the default record (the rating 1000)' as const;

const INPUT_STRING = 'INPUT_STRING';
const PLAYER_NAME_VAR = 'PLAYERNAMEVAR';
/** The lobby's state in the menus (`FUN_002eb2c0` D:L189104: +0x60 is 0x0b). */
const LOBBY_STATE_ONLINE = 0x0b;

// ---- the medal and the tier (V8) ----

/** The per-mille rank `position x 1000 / (total - 10)`, 32-bit, the division truncated (D:L188952, D:L188916). */
function perMille(position: number, total: number): number {
  return Math.trunc(Math.imul(position, 1000) / ((total - 10) | 0));
}

/**
 * The medal of merit 0-5 (`FUN_002eaee0` D:L188934-188970) of a position against **my** total (`DAT_0044f800`, the
 * position answer's): 0 while the total is 0 or below; 5 for any position while it is 1 to 11; from 12, 5 for a
 * position under 11, else by the per-mille -- under 51 4, under 301 3, under 851 2, else 1. The index is the medal
 * column's texture (`null.tif`, `Medal_Blue` ENSIGN .. `Medal_Black` ADMIRAL; research 155 §2.3). The server's
 * `medalOf` (`ladder.ts`) is the same transcription; the rows carry no medal, the client computes it. A position of -1
 * is replaced by my own, `DAT_0044f7f8` (D:L188943-188945): the caller hands it as `myPosition` (ONL-27's review, F2);
 * absent, the position is taken as given.
 */
export function ladderMedal(position: number, total: number, myPosition?: number): number {
  if (position === -1 && myPosition !== undefined) position = myPosition;
  if (total < 12) return total > 0 ? 5 : 0;
  const p = perMille(position, total);
  if (position < 11) return 5;
  return p < 51 ? 4 : p < 301 ? 3 : p < 851 ? 2 : 1;
}

/** The restriction tier 0-4 (`FUN_002eae20` D:L188898-188931): the medal's rule without the top-ten rung. */
export function ladderTier(position: number, total: number): number {
  if (total < 12) return total > 0 ? 4 : 0;
  const p = perMille(position, total);
  return p < 51 ? 4 : p < 301 ? 3 : p < 851 ? 2 : 1;
}

/**
 * The clan medal 0-4 (`FUN_002ead80` D:L188869-188895; ELF 0x2ead80-0x2eae1c): 0 while the clans' total (`DAT_0044f870`)
 * is 0 or below; else `p = position x 1000 / total` -- the product in 32 bits, the division signed and truncated (ELF
 * 0x2eada8-0x2eadc8) -- 4 under 51, 3 under 301, 2 under 851, else 1 (D:L188881-188892). No top-ten rung and no
 * small-ladder rule: never 5. A position of -1 is replaced by my clan's, `DAT_0044f868` (D:L188876-188878): the caller
 * hands it as `myPosition`; absent, the position is taken as given (the players' convention, `ladderMedal`). The index
 * is the CLAN RANKING list's third column's texture (`null.tif` .. `Medal_Gold.tif`), placed at POSITION 820, off the
 * frame (research 311 §4.3).
 */
export function clanMedalOf(position: number, total: number, myPosition?: number): number {
  if (position === -1 && myPosition !== undefined) position = myPosition;
  if (!(total > 0)) return 0;
  const p = Math.trunc(Math.imul(position, 1000) / (total | 0));
  return p < 51 ? 4 : p < 301 ? 3 : p < 851 ? 2 : 1;
}

// ---- the record PLAYER INFO reads ----

/** The fields `FUN_002f0020` reads of the parsed record (D:L191940-192131), at the record's offsets (`FUN_002fab80`'s layout, research 155 §1.1). */
export interface PlayerInfoRecord {
  version: number; hitPercent: number; clanLeader: boolean; rating: number; ladderPosition: number; minutesOnline: number;
  secondsPlayed: number; roundsWon: number; roundsLost: number; kills: number; games: number; bonusObjectives: number;
  hostagesRescued: number; vipsRescued: number; vipsKilled: number; deaths: number; suicides: number; bombsPlanted: number;
  bombsDefused: number; headShots: number; clanTag: string; clanName: string; hometown: string; description: string;
}

/** The 256-byte record's hex (512 digits), or null for another shape. */
function hexBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length !== 512) return null;
  const out = new Uint8Array(256);
  for (let i = 0; i < 256; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * The record a reply carries (`FUN_002f9ac0`, `PLAYER_INFO_RECORD_VERSION_READING`): the version +0x00, the hit
 * percentage +0x01 bits 0-6 (D:L192116), the leader +0x02 bit 7 (D:L191962), the rating +0x04, the position +0x08, the
 * minutes +0x0c (D:L192022), the seconds +0x10 (D:L192130), rounds won +0x14 and lost +0x18, kills +0x1c, the games
 * +0x20 bits 0-21 (D:L191983) and the bonus objectives its high half `>> 6` (D:L192111), the eight shorts +0x24..+0x32
 * (unsigned, D:L192076-192121), the tag +0x34 (12), the clan's name +0x40 (32), the hometown +0x60 (63), the
 * description +0x9f (66). Not a record (another shape): the default.
 */
export function readPlayerRecord(hex: string): PlayerInfoRecord {
  const b = hexBytes(hex);
  if (b === null || b[0] !== 0x45) {
    return {
      version: 0x45, hitPercent: 0, clanLeader: false, rating: 1000, ladderPosition: 0, minutesOnline: 0, secondsPlayed: 0, roundsWon: 0,
      roundsLost: 0, kills: 0, games: 0, bonusObjectives: 0, hostagesRescued: 0, vipsRescued: 0, vipsKilled: 0, deaths: 0, suicides: 0,
      bombsPlanted: 0, bombsDefused: 0, headShots: 0, clanTag: '', clanName: '', hometown: '', description: '',
    };
  }
  const v = new DataView(b.buffer);
  const text = (offset: number, size: number): string => {
    let s = '';
    for (let i = 0; i < size && b[offset + i] !== 0; i++) s += String.fromCharCode(b[offset + i]!);
    return s;
  };
  const word20 = v.getUint32(0x20, true);
  return {
    version: b[0]!, hitPercent: b[1]! & 0x7f, clanLeader: (b[2]! & 0x80) !== 0, rating: v.getInt32(0x04, true), ladderPosition: v.getInt32(0x08, true),
    minutesOnline: v.getUint32(0x0c, true), secondsPlayed: v.getUint32(0x10, true), roundsWon: v.getInt32(0x14, true), roundsLost: v.getInt32(0x18, true),
    kills: v.getInt32(0x1c, true), games: word20 & 0x3fffff, bonusObjectives: (word20 >>> 16) >>> 6,
    hostagesRescued: v.getUint16(0x24, true), vipsRescued: v.getUint16(0x26, true), vipsKilled: v.getUint16(0x28, true), deaths: v.getUint16(0x2a, true),
    suicides: v.getUint16(0x2c, true), bombsPlanted: v.getUint16(0x2e, true), bombsDefused: v.getUint16(0x30, true), headShots: v.getUint16(0x32, true),
    clanTag: text(0x34, 12), clanName: text(0x40, 32), hometown: text(0x60, 63), description: text(0x9f, 66),
  };
}

// ---- the service ----

/** `MediusPlayerOnlineState` as a row carries it (+0x144, copied whole: the status, the two world ids, the two names). */
export interface LadderOnlineState { connectStatus: number; lobbyWorldId: number; gameWorldId: number; lobbyName: string; gameName: string }
/** LadderPosition_ExtraInfo's reply (Lobby 0xf2): the status +0x18, my position +0x1c, the total +0x20 (`FUN_002eb010` D:L189006-189011). */
export interface LadderPositionReply { status: number; ladderPosition: number; totalRankings: number }
/** LadderList_ExtraInfo0's request (Lobby 0xef): stat 0, order 1, the start, the page's size. */
export interface LadderListQuery { ladderStatIndex: number; sortOrder: number; startPosition: number; pageSize: number }
/**
 * A row of its reply (Lobby 0xf0): the fields `FUN_002ebe50` reads -- the status +0x18, the position +0x1c, the account id
 * +0x20 (the page's key, SVC-15; `ladder.ts`'s `LadderRow`), the name +0x24, the record +0x44, the online state +0x144,
 * the end +0x1d0.
 */
export interface LadderListEntry {
  status: number; ladderPosition: number; accountId: number; accountName: string; stats: string; onlineState: LadderOnlineState; endOfList: boolean;
}
/** PlayerInfo's request (Lobby 0x31): by account id, the original's (every origin here); by name, the services' other form (the own record's read, `OWN_RECORD_BY_NAME_ADAPTATION`). */
export type PlayerInfoQuery = { accountId: number } | { name: string };
/** Its reply (Lobby 0x32): the status +0x18, the name +0x1c and the record +0x48 the page reads; the PlayerStatus it does not. */
export interface PlayerInfoAnswer { status: number; accountName: string; playerStatus: number; stats: string }

/**
 * ClanLadderPosition's request (Lobby 0xd4, 0x24 bytes; `FUN_002eab80` D:L188810-188818): the tag "GetSurrounding" at +0
 * or none (row 162's, D:L124328), the client's clan id `DAT_0044f59c` +0x18, stat 0 +0x1c, order 1 +0x20.
 */
export interface ClanPositionQuery { tag?: string; clanId: number; ladderStatIndex: number; sortOrder: number }
/** Its reply (Lobby 0xd5): the tag echoed, the position +0x18 and the status +0x20 `FUN_002eac70` reads; the total between them, which it does not (D:L188840-188852). */
export interface ClanPositionReply { tag: string; status: number; ladderPosition: number; totalRankings: number }
/** GetTotalRankings' reply (Lobby 0xd9) to the clans' request (type 1): the status +0x18 and the count +0x1c (`FUN_002eb1b0` D:L189066-189085). */
export interface ClanTotalReply { status: number; totalRankings: number }
/** ClanLadderList's request (Lobby 0xd2, 0x28 bytes): the tag +0, stat 0 +0x18, order 1 +0x1c, the start +0x20, the count +0x24 (`FUN_002ea5c0` D:L188620-188629, `FUN_002ea6b0` D:L188649-188655). */
export interface ClanListQuery { tag: string; ladderStatIndex: number; sortOrder: number; startPosition: number; pageSize: number }
/** A row of its reply (Lobby 0xd3): the tag echoed, the clan id +0x18, the name +0x1c, the position +0x3c, the status +0x40, the end +0x44 (`FUN_002ea730`, `FUN_002ebcf0`). */
export interface ClanListEntry { tag: string; status: number; clanId: number; clanName: string; ladderPosition: number; endOfList: boolean }

/** The page's half: each request sent, its reply back (a rejection is a request never answered). */
export interface LadderService {
  /** My position and the total: 0xf1 for the bearer's own account (its +0x18 the session's, `FUN_002eafb0` D:L188987). */
  position(): Promise<LadderPositionReply>;
  /** A page of the board, the last row ending it. */
  list(q: LadderListQuery): Promise<readonly LadderListEntry[]>;
  /** PLAYER INFO's lookup. */
  playerInfo(q: PlayerInfoQuery): Promise<PlayerInfoAnswer>;
  /** ONL-30: the clan's position (0xd4); absent, never answered. */
  clanPosition?(q: ClanPositionQuery): Promise<ClanPositionReply>;
  /** ONL-30: the clans' total (0xd8, type 1, "ClanTotal"); absent, never answered. */
  clanTotal?(): Promise<ClanTotalReply>;
  /** ONL-30: a page of the clans' board (0xd2), the last row ending it; absent, never answered. */
  clanList?(q: ClanListQuery): Promise<readonly ClanListEntry[]>;
}

/** A client row (0xac bytes): the online state +0, the name +0x8c, the tag +0x98, the reply's +0x20 (the account id) at +0xa4, the position +0xa8. */
export interface LadderRowRecord { position: number; accountId: number; name: string; tag: string; online: LadderOnlineState }
/** A clan row as `FUN_002ebcf0` keeps it (0x48 bytes, D:L189511-189537): the tag, the clan id +0x18, the name +0x1c, the position +0x3c. */
export interface ClanRowRecord { tag: string; clanId: number; name: string; position: number }

const str = (value: string): UiVarValue => ({ type: 'string', value });
const int = (value: number): UiVarValue => ({ type: 'int', value });
const arr = (...value: UiVarValue[]): UiVarValue => ({ type: 'array', value });
/** `%d`: a 32-bit value printed signed (S:0x3f45c8, S:0x3f4cc0). */
const d = (n: number): string => String(n | 0);
/** A keyed cell (`LADDER_KEYED_CELL_READING`): its text in the row colour. */
const tinted = (text: string): UiVarValue => arr(str('VALUE'), str(text), str('COLOR'), arr(...LADDER_OWN_ROW_COLOR.map((c) => ({ type: 'real' as const, value: c }))));

/** `FUN_00198b80` (strcasecmp): equal with A-Z folded. */
function caseless(a: string, b: string): boolean {
  const fold = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return fold(a) === fold(b);
}

/** A reply row as `FUN_002ebe50` keeps it (D:L189568-189604): the position (D:L189581), the name (D:L189582), the +0x20 (D:L189584), the record parsed (`FUN_002f9ac0`, D:L189580), its tag `[%s]` when it holds one (D:L189593-189594), the online state (D:L189597). */
export function ladderRowOf(e: LadderListEntry): LadderRowRecord {
  const tag = readPlayerRecord(e.stats).clanTag;
  return { position: e.ladderPosition, accountId: e.accountId, name: e.accountName, tag: tag === '' ? '' : `[${tag}]`, online: { ...e.onlineState } };
}

/** The clans' podium rows (`FUN_002ea800` D:L188697-188727): each `["%d" of the position, the name]` -- no tint, no medal. */
export function clanPodiumRows(rows: readonly ClanRowRecord[]): UiVarValue[] {
  return rows.map((r) => arr(str(d(r.position)), str(r.name)));
}

/**
 * The clans' ranking rows (`FUN_002ea930` D:L188732-188787): each `["%d" of the position, the name, the medal]` -- the
 * medal `clanMedalOf` of the row's position against the clans' total (D:L188754-188755); the row whose clan id is the
 * client's (`DAT_0044f59c`, D:L188757) has its position and name as keyed cells in the row colour (D:L188758-188768,
 * `LADDER_KEYED_CELL_READING`), the medal as it is (D:L188769).
 */
export function clanRankingRows(rows: readonly ClanRowRecord[], total: number, myClanId: number, myPosition?: number): UiVarValue[] {
  return rows.map((r) => {
    const medal = int(clanMedalOf(r.position, total, myPosition));
    if (r.clanId === myClanId) return arr(tinted(d(r.position)), tinted(r.name), medal);
    return arr(str(d(r.position)), str(r.name), medal);
  });
}

/** THE PODIUM's rows (`FUN_002eb7a0` D:L189313-189358): each `["%d" of the position, the name, the tag]`. */
export function podiumRows(rows: readonly LadderRowRecord[]): UiVarValue[] {
  return rows.map((r) => arr(str(d(r.position)), str(r.name), str(r.tag)));
}

/**
 * The page's rows (`FUN_002eb900` D:L189361-189455): each `[the key, the name, "%d" of the position, the medal, the
 * tag]` -- the key `"%d"` of the row's +0x20, the account id (D:L189390), the medal `ladderMedal` of the row's position against my total
 * (D:L189391); the row whose name is mine (`strcmp` with 0x66a4f4, D:L189399) has its name, position and tag tinted
 * (`LADDER_OWN_ROW_COLOR`, D:L189400-189427), the key and the medal as they are (D:L189428-189437 the others').
 */
export function rankingRows(rows: readonly LadderRowRecord[], myTotal: number, myName: string | null, myPosition?: number): UiVarValue[] {
  return rows.map((r) => {
    const medal = int(ladderMedal(r.position, myTotal, myPosition));
    if (myName !== null && r.name === myName) return arr(str(d(r.accountId)), tinted(r.name), tinted(d(r.position)), medal, tinted(r.tag));
    return arr(str(d(r.accountId)), str(r.name), str(d(r.position)), medal, str(r.tag));
  });
}

const EMPTY_STATE: LadderOnlineState = { connectStatus: 0, lobbyWorldId: 0, gameWorldId: 0, lobbyName: '', gameName: '' };

/**
 * PLAYER INFO's three variables made of a Success reply (`FUN_002f0020` D:L191788-192135), in the order its calls run:
 * PLAYER_INFO_VAR1 -- two blank rows around the medal's (D:L191946-191960: `ladderMedal` of the position against my
 * total), the clan's name and "(Leader)" (`%s %s`, S:0x3f4ca0, S:0x3f4ca8), LADDER POSITION, SCORE, TOTAL # OF GAMES,
 * ROUNDS WON, ROUNDS LOST, three blank rows, HOMETOWN, then NOT CURRENTLY LOGGED IN for a state of 0, else ONLINE
 * (`%d min.` of +0x0c), BRIEFING ROOM (MAIN MENU for a world named "Medius...", `strncmp` 6, D:L192027) and GAME (the
 * game's name in a game, "In Lobby" tinted in a room, "Logging In" for 1, "Disconnecting" for 0, a blank otherwise);
 * PLAYER_INFO_DESCRIPTION -- DESCRIPTION and the text (D:L192062-192068); PLAYER_INFO_VAR2 -- KILLS .. HEAD SHOTS, a
 * blank row and TOTAL PLAYING TIME (`%d : %.2d` of the seconds' hours and minutes, unsigned, D:L192130).
 */
export function playerInfoLists(rec: PlayerInfoRecord, position: number, online: LadderOnlineState, myTotal: number, myPosition?: number): { list1: UiVarValue; list2: UiVarValue; description: UiVarValue } {
  const row = (...cells: (string | number)[]): UiVarValue => arr(...cells.map((c) => (typeof c === 'number' ? int(c) : str(c))));
  const sp = PLAYER_INFO_SPACE;
  const list1: UiVarValue[] = [
    row(sp, sp), row(sp, sp, ladderMedal(position, myTotal, myPosition)), row(sp, sp),
    row(`${rec.clanName} ${rec.clanLeader ? '(Leader)' : ''}`, sp),
    row('LADDER POSITION:', d(position)), row('SCORE:', d(rec.rating)), row('TOTAL # OF GAMES:', d(rec.games & 0x3fffff)),
    row('ROUNDS WON:', d(rec.roundsWon)), row('ROUNDS LOST:', d(rec.roundsLost)),
    row(sp, sp), row(sp, sp), row(sp, sp),
    row('HOMETOWN:', rec.hometown),
  ];
  if (online.connectStatus === 0) list1.push(row('NOT CURRENTLY LOGGED IN\n', sp));
  else {
    list1.push(row('ONLINE:', `${d(rec.minutesOnline)} min.`));
    list1.push(row('BRIEFING ROOM:', online.lobbyName.startsWith('Medius') ? 'MAIN MENU' : online.lobbyName));
    const s = online.connectStatus;
    const game = s === 3 ? str(online.gameName) : s === 2 ? tinted('In Lobby') : str(s === 1 ? 'Logging In' : s === 0 ? 'Disconnecting' : sp);   // D:L192039-192056
    list1.push(arr(str('GAME:'), game));
  }
  const secs = rec.secondsPlayed >>> 0;
  const list2: UiVarValue[] = [
    row('KILLS:', d(rec.kills)), row('DEATHS:', d(rec.deaths)), row('SUICIDES:', d(rec.suicides)), row('BOMBS PLANTED:', d(rec.bombsPlanted)),
    row('BOMBS DEFUSED:', d(rec.bombsDefused)), row('HOSTAGES RESCUED:', d(rec.hostagesRescued)), row('VIPs RESCUED:', d(rec.vipsRescued)),
    row('VIPs KILLED:', d(rec.vipsKilled)), row('BONUS OBJECTIVES:', d(rec.bonusObjectives)), row('HIT PERCENTAGE:', `${d(rec.hitPercent & 0x7f)} %`),
    row('HEAD SHOTS:', d(rec.headShots)), row(sp, sp),
    row('TOTAL PLAYING TIME:', `${d(Math.floor(secs / 3600))} : ${d(Math.floor((secs % 3600) / 60)).padStart(2, '0')}`),
  ];
  return { list1: arr(...list1), list2: arr(...list2), description: arr(row('DESCRIPTION:\n', rec.description)) };
}

export interface LadderLobbyCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The launch's valves (the medal and the tier the position answers write); absent, not written. */
  valves?: () => ValveStore;
  /** The page's half; absent, every request is never answered. */
  service?: LadderService;
  /** `DAT_0044f3c8(name, 0)`: a named event into the built dialog (ON_LADDER_REFRESH). */
  event?: (kind: number, text: string | null) => void;
  /** The running animation's input string (`FUN_00272480`): the row's key for `GetPlayerInfo(INPUT_STRING)`. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** The lobby session's +0x7d and state byte +0x60 (`WORLD_LOBBY_STATE_READING`); absent, up in state 11. */
  lobbyUp?: () => boolean;
  lobbyState?: () => number;
  /** The session's account name, 0x66a4f4 (`ACCOUNT_NAME_READING`); absent or null, PLAYERNAMEVAR's text. */
  accountName?: () => string | null;
  /** ONL-24: the friends list's online state of a name (`FUN_00301c40`), PLAYER INFO's FRIEND origin; absent, none (the origins: `ClanRosterPresence`'s doc). */
  friendState?: (name: string) => LadderOnlineState | null;
  /** SVC-15: the room's player list's online state of a name (`FUN_002e3610`), PLAYER INFO's BRIEFING origin; absent, none. */
  roomState?: (name: string) => LadderOnlineState | null;
  /**
   * PLAYER-INFO-CLAN: the clan roster's row of a name (`FUN_002e9460` on 0x44f740, `LobbyClan.find`) -- its online state
   * and its +0x1d0 ladder position -- PLAYER INFO's CLAN origin; absent, none.
   */
  clanState?: (name: string) => ClanRosterPresence | null;
  /**
   * ONL-30: the client's clan -- `DAT_003df298` ("a clan held", `FUN_002e6830` D:L186493-186497) and its copy
   * `DAT_0044f59c` (the position request's id, the tinted row) -- the session's `LobbyClan`; absent, no clan held.
   */
  clan?: Pick<LobbyClan, 'clanId' | 'member'>;
  /** A row called, as it happens. */
  log?: (name: LadderLobbyCommandName, arg: string, answer: boolean) => void;
}

/** One list of client rows (0x44f7b0, 0x44f7e0): the records, the start (+0xc), the largest position (+0x10). */
interface RowList { rows: LadderRowRecord[]; start: number; largest: number }
/** One list of clan rows (0x44f850, 0x44f820): the records, the bound (+0xc, raised by each row kept), the start (+0x10). */
interface ClanRowList { rows: ClanRowRecord[]; bound: number; start: number }
/** A turn of a clans' chain (`CLAN_LADDER_REPLY_ORDER_READING`): settled once its request is answered or refused; its effect, when answered. */
interface ClanTurn { settled: boolean; apply: (() => void) | null }
/**
 * One chain (`CLAN_LADDER_REPLY_ORDER_READING`): an entry's requests that meet the list's state, in the order sent; once
 * released (the next entry), or for the podium from the start, each turn is applied as it lands, held by none before it.
 */
interface ClanChain { turns: ClanTurn[]; released: boolean }

export class LadderLobbyCommands {
  /** The page's rows (0x44f7b0): +0x10 is also `DAT_0044f7c0`, the total the position answers write. */
  private readonly rest: RowList = { rows: [], start: 0, largest: 0 };
  /** The podium's rows (0x44f7e0). */
  private readonly best: RowList = { rows: [], start: 0, largest: 0 };
  /** `DAT_0044f7f8`, `DAT_0044f800`: my position and the total the medal reads. */
  private myPosition = 0;
  private myTotal = 0;
  /** `DAT_0044f878`: a request of the page's rows out. */
  private inFlight = false;
  /** The clan list (0x44f850): its start 2 and bound 0 at construction (`CLAN_LADDER_BOOT_STATE_READING`, `FUN_00401fa0` D:L328597-328602). */
  private readonly clanRest: ClanRowList = { rows: [], bound: 0, start: 2 };
  /** The clans' podium (0x44f820; D:L328591-328596). */
  private readonly clanBest: ClanRowList = { rows: [], bound: 0, start: 2 };
  /** `DAT_0044f868`, `DAT_0044f870`: my clan's position and the clans' total (BSS, 0). */
  private clanPosition = 0;
  private clanTotal = 0;
  /** `DAT_0044f880`: a request of the clan list out. */
  private clanInFlight = false;
  /** The current entry's chain (`CLAN_LADDER_REPLY_ORDER_READING`): replaced at each entry; an older one is held by its own turns until it drains. */
  private clanChain: ClanChain = { turns: [], released: false };
  /**
   * LATER 54: true while a re-entry applies the older chain's landed turns -- a list among them landed on that earlier
   * visit, where the original drew it and raised its ON_LADDER_REFRESH, so its draw here raises none (`drawClanRanking`).
   */
  private releasing = false;

  constructor(private readonly o: LadderLobbyCommandsOptions) {}

  private answer(name: LadderLobbyCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  private post(event: string): void { this.o.event?.(DIALOG_EVENTS[event]!, null); }

  /** The page's rows, the podium's, my position and total, the page's start; the clans' half likewise (for the tests and the host). */
  state(): {
    rest: readonly LadderRowRecord[]; best: readonly LadderRowRecord[]; myPosition: number; myTotal: number; start: number; total: number; inFlight: boolean;
    clan: { rest: readonly ClanRowRecord[]; best: readonly ClanRowRecord[]; start: number; bound: number; position: number; total: number; inFlight: boolean };
  } {
    return {
      rest: this.rest.rows, best: this.best.rows, myPosition: this.myPosition, myTotal: this.myTotal, start: this.rest.start, total: this.rest.largest, inFlight: this.inFlight,
      clan: { rest: this.clanRest.rows, best: this.clanBest.rows, start: this.clanRest.start, bound: this.clanRest.bound, position: this.clanPosition, total: this.clanTotal, inFlight: this.clanInFlight },
    };
  }

  private myName(): string | null {
    const n = this.o.accountName?.() ?? null;
    if (n !== null) return n;
    const v = this.o.uiVars.find(PLAYER_NAME_VAR)?.value;
    return v?.type === 'string' ? v.value : null;
  }

  private online(): boolean {
    return (this.o.lobbyUp?.() ?? true) && (this.o.lobbyState?.() ?? LOBBY_STATE_ONLINE) === LOBBY_STATE_ONLINE;
  }

  /**
   * `FUN_002784d0` (D:L123407-123492), by the command's mode (`LADDER_INFO_MODE`): 0 my position (`FUN_002eb2c0`, only
   * in state 11) and the podium; 1 my position (`FUN_002eafb0`, at any state) and the podium; 2 0 at the page's top
   * (its start under 2); 3 0 at its bottom (the total under the start + 14); 4 the page 14 up from the start, not past
   * 1, when the start is above 1; 5 the page 14 down; 6 the clans' entry (`FUN_002eab80` tagged "GetSurrounding" -- its
   * second argument 1, ELF 0x2784d4 -- then the podium `FUN_002ea6b0(10)`, D:L123454-123456); 7 the clans' podium alone
   * (D:L123458-123460); 8 0 while the clan list's start is under 2 (`FUN_002eb780`, D:L123461-123466); 9 0 while its
   * bound is under the start + 14 (`FUN_002eb760`, D:L123467-123473); 10 the list 14 up from the start, not past 1, when
   * the start is above 1 (D:L123474-123483); 11 the list 14 down (D:L123484-123487); any other my position alone
   * (`FUN_002eb2c0`). Every other answer 1.
   */
  GetLadderInfo: UiCommandHandler = (cmd) => {
    const mode = cmd.bytes[0x10] ?? 0;
    const M = LADDER_INFO_MODE;
    let answer = true;
    switch (mode) {
      case M.position: this.askPosition(true); this.askPodium(); break;
      case M.top10: this.askPosition(false); this.askPodium(); break;
      case M.pressUp: answer = this.rest.start >= 2; break;
      case M.pressDown: answer = !(this.rest.largest < this.rest.start + LADDER_PAGE_ROWS); break;
      case M.up: if (this.rest.start > 1) this.askPage(Math.max(1, this.rest.start - LADDER_PAGE_ROWS)); break;
      case M.down: this.askPage(this.rest.start + LADDER_PAGE_ROWS); break;
      case M.clanPage: this.askClanEntry(true); this.askClanPodium(); break;
      case M.clanPodium: this.askClanPodium(); break;
      case M.clanPressUp: answer = this.clanRest.start >= 2; break;
      case M.clanPressDown: answer = !(this.clanRest.bound < this.clanRest.start + LADDER_PAGE_ROWS); break;
      case M.clanUp: if (this.clanRest.start > 1) this.askClanList(Math.max(1, this.clanRest.start - LADDER_PAGE_ROWS)); break;
      case M.clanDown: this.askClanList(this.clanRest.start + LADDER_PAGE_ROWS); break;
      default: this.askPosition(true);
    }
    return this.answer('GetLadderInfo', cmd, answer);
  };

  /**
   * My position: `FUN_002eb2c0` (D:L189094-189114; `gated`: only while +0x7d is set and the state is 11), its reply
   * `FUN_002eb340`; or `FUN_002eafb0` (D:L188973-188992), its reply `FUN_002eb010` -- each 0xf1 with the session's
   * account (`DAT_0066a4f0`, D:L188987, D:L189109), the bearer's own on the services (SVC-15).
   */
  private askPosition(gated: boolean): void {
    if (gated && !this.online()) return;
    this.o.service?.position().then((r) => { if (gated) this.positionPage(r); else this.positionReply(r); }, () => { /* never answered */ });
  }

  /** The answer's shared half (D:L189008-189019, D:L189134-189145): my position and the total held (both totals, `DAT_0044f7c0` and `DAT_0044f800`), LadderRanking added TEMPORARY and set to the position. */
  private holdPosition(r: LadderPositionReply): void {
    this.myPosition = r.ladderPosition | 0;
    this.myTotal = r.totalRankings | 0;
    this.rest.largest = this.myTotal;
    const vars = this.o.uiVars;
    vars.set(vars.add(LADDER_POSITION_VAR, null, 1), int(this.myPosition));
  }

  /** The two valves (D:L189020-189045, D:L189152-189177): my medal and my tier (`ladderMedal`, `ladderTier` of my position), each written through its watchers. */
  private writeValves(): void {
    const v = this.o.valves?.();
    if (!v) return;
    v.set(LADDER_MEDAL_VALVE, ladderMedal(this.myPosition, this.myTotal, this.myPosition), VALVE_TYPE.PERM);
    v.set(LADDER_TIER_VALVE, ladderTier(this.myPosition, this.myTotal), VALVE_TYPE.PERM);
  }

  /** `FUN_002eb010` (D:L188994-189051): a Success held, the valves written, ON_LADDER_REFRESH (S:0x3f45e0) raised; a failure changes nothing. */
  positionReply(r: LadderPositionReply): void {
    if (r.status !== 0) return;
    this.holdPosition(r);
    this.writeValves();
    this.post('ON_LADDER_REFRESH');
  }

  /**
   * `FUN_002eb340` (D:L189117-189180): a failure opens the page from 1 (D:L189130-189131); a Success held, the page's
   * request freed (D:L189146) and the page opened at `max(1, my position - 2)` (D:L189147-189151), then the valves.
   */
  positionPage(r: LadderPositionReply): void {
    if (r.status !== 0) { this.askPage(1); return; }
    this.holdPosition(r);
    this.inFlight = false;
    this.askPage(Math.max(1, this.myPosition - 2));
    this.writeValves();
  }

  /**
   * `FUN_002eb510` (D:L189183-189214): only with no request out, a start above 0, and below the total or with no row
   * held (D:L189195-189196): the rows freed (`FUN_002ec140`), the start held, "TheRest" (S:0x3f4728) asked from it,
   * 14 rows, the request marked out.
   */
  private askPage(start: number): void {
    if (this.inFlight || !((start < this.rest.largest || this.rest.rows.length === 0) && start > 0)) return;
    this.rest.rows = [];
    this.rest.start = start;
    this.inFlight = true;
    this.o.service?.list({ ...LADDER_LIST_STAT, startPosition: start, pageSize: LADDER_PAGE_ROWS }).then((rows) => { this.listReply('TheRest', rows); }, () => { /* never answered */ });
  }

  /** `FUN_002eb610` (D:L189217-189240): the podium's rows freed, "TheBest" (S:0x3f4730) asked, 10 from 1. */
  private askPodium(): void {
    this.best.rows = [];
    this.best.start = 0;
    this.best.largest = 0;
    this.o.service?.list({ ...LADDER_LIST_STAT, startPosition: 1, pageSize: LADDER_PODIUM_ROWS }).then((rows) => { this.listReply('TheBest', rows); }, () => { /* never answered */ });
  }

  /**
   * `FUN_002eb6a0` (D:L189243-189274), each row in turn: a status not Success ("GetLadderInfo", S:0x3f4738) frees the
   * page's request, whatever the tag (D:L189253-189256); a "TheRest" row kept, and at the row ending the list the
   * request freed and the page drawn; a "TheBest" row kept, and at the end the podium drawn.
   */
  listReply(tag: 'TheRest' | 'TheBest', rows: readonly LadderListEntry[]): void {
    for (const e of rows) {
      if (e.status !== 0) { this.inFlight = false; continue; }
      if (tag === 'TheRest') {
        this.keep(this.rest, e);
        if (e.endOfList) { this.inFlight = false; this.drawPage(); }
      } else {
        this.keep(this.best, e);
        if (e.endOfList) this.drawPodium();
      }
    }
  }

  /** `FUN_002ebe50` (D:L189547-189606): a row kept unless one of its position is held (D:L189570); the list's largest position raised to it (D:L189601-189603). */
  private keep(list: RowList, e: LadderListEntry): void {
    if (list.rows.some((r) => r.position === e.ladderPosition)) return;
    const r = ladderRowOf(e);
    list.rows.push(r);
    if (list.largest < r.position) list.largest = r.position;
  }

  /** `FUN_002eb7a0` (D:L189313-189358): sorted by position (`FUN_002ec260`, D:L189330), LADDER_LEADERS set (D:L189355). */
  private drawPodium(): void {
    this.best.rows.sort((a, b) => a.position - b.position);
    const vars = this.o.uiVars;
    vars.set(vars.add(LADDER_LEADERS_VAR, null, 1), { type: 'array', value: podiumRows(this.best.rows) });
  }

  /** `FUN_002eb900` (D:L189361-189455): sorted by position (`FUN_002ec260`, D:L189384), LADDER_RANKING set (D:L189449), ON_LADDER_REFRESH raised (D:L189451). */
  private drawPage(): void {
    this.rest.rows.sort((a, b) => a.position - b.position);
    const vars = this.o.uiVars;
    vars.set(vars.add(LADDER_RANKING_VAR, null, 1), { type: 'array', value: rankingRows(this.rest.rows, this.myTotal, this.myName(), this.myPosition) });
    this.post('ON_LADDER_REFRESH');
  }

  /** Row 162, `FUN_0027a250` (D:L124325-124330): the clans' entry untagged (`FUN_002eab80(.., 0)`) -- the position and the total, no list asked -- then 1. */
  GetClanRanking: UiCommandHandler = (cmd) => {
    this.askClanEntry(false);
    return this.answer('GetClanRanking', cmd, true);
  };

  // ---- the clans' half (ONL-30, web research 311) ----

  /**
   * One clans' request into a chain (`CLAN_LADDER_REPLY_ORDER_READING`), the current entry's unless one is given: its
   * reply applied once every request sent before it in that chain is answered or refused; a refusal frees its turn
   * without effect; a request that never settles holds its own chain only. No service, or none for this request: nothing
   * sent, no turn taken.
   */
  private clanSend<T>(ask: (() => Promise<T>) | null, apply: (r: T) => void, chain: ClanChain = this.clanChain): void {
    if (ask === null) return;
    const turn: ClanTurn = { settled: false, apply: null };
    chain.turns.push(turn);
    let sent: Promise<T>;
    try { sent = ask(); } catch (e) { sent = Promise.reject(e instanceof Error ? e : new Error(String(e))); }
    sent.then((r) => { turn.apply = () => { apply(r); }; }, () => { /* never answered */ })
      .finally(() => { turn.settled = true; this.drainClans(chain); });
  }

  /** A chain's head applied while it is settled, in the order sent; a released chain's every settled turn, in the order sent. */
  private drainClans(chain: ClanChain): void {
    if (!chain.released) {
      while (chain.turns.length > 0 && chain.turns[0]!.settled) chain.turns.shift()!.apply?.();
      return;
    }
    const landed = chain.turns.filter((t) => t.settled);
    chain.turns = chain.turns.filter((t) => !t.settled);
    for (const t of landed) t.apply?.();
  }

  /** The client's clan id (`DAT_0044f59c`), -1 with none. */
  private myClanId(): number { return this.o.clan?.member ? this.o.clan.clanId : -1; }

  /**
   * `FUN_002eab80` (D:L188792-188826): with a clan held (`FUN_002e6830`), ClanLadderPosition -- "GetSurrounding" when
   * `surrounding`, the clan id, stat 0, order 1 (D:L188810-188818) -- its reply `FUN_002eac70`; with none, my position 0
   * and the list from 1 (D:L188806-188807). Then, always, GetTotalRankings "ClanTotal" type 1 (D:L188820-188824), its
   * reply `FUN_002eb1b0`. No lobby-state gate. Each entry opens a new chain (`CLAN_LADDER_REPLY_ORDER_READING`), the
   * older one released first -- its landed turns applied now, before this entry's requests go out, the rest as they land:
   * what an earlier entry left unsettled holds none of this one's replies, nor its own. LATER 54: the landed turns applied
   * at the release raise no ON_LADDER_REFRESH (`releasing`): the original raised a landed list's on the page it landed on
   * (`FUN_002ea730` D:L188684-188688 -> `FUN_002ea930` D:L188782-188784), an earlier visit's, so the re-entry's page keeps
   * the dialog's own arrows; a turn still out raises its refresh when it lands, as the original's would.
   */
  private askClanEntry(surrounding: boolean): void {
    const older = this.clanChain;
    older.released = true;
    this.releasing = true;
    try { this.drainClans(older); } finally { this.releasing = false; }
    this.clanChain = { turns: [], released: false };
    const svc = this.o.service;
    const clan = this.o.clan;
    if (!clan?.member) {
      this.clanPosition = 0;
      this.askClanList(1);
    } else {
      const q: ClanPositionQuery = { ...(surrounding ? { tag: CLAN_LADDER_TAGS.surrounding } : {}), clanId: clan.clanId, ...LADDER_LIST_STAT };
      this.clanSend(svc?.clanPosition ? () => svc.clanPosition!(q) : null, (r) => { this.clanPositionReply(r); });
    }
    this.clanSend(svc?.clanTotal ? () => svc.clanTotal!() : null, (r) => { this.clanTotalReply(r); });
  }

  /**
   * `FUN_002eac70` (D:L188831-188863): on Success (`FUN_002f42d0`, the status 0) the position into ClanLadderRanking
   * (added TEMPORARY, set as an integer), my clan's position and the list's bound (D:L188840-188852); tagged
   * "GetSurrounding" (case-blind, D:L188853), the list's request freed and the list asked from the position, or from 1
   * when the position is 2 or less (D:L188854-188860; ELF 0x2ead3c-0x2ead48). The reply's total is not read. A failure
   * changes nothing.
   */
  clanPositionReply(r: ClanPositionReply): void {
    if (r.status !== 0) return;
    this.clanPosition = r.ladderPosition | 0;
    const vars = this.o.uiVars;
    vars.set(vars.add(CLAN_POSITION_VAR, null, 1), int(this.clanPosition));
    this.clanRest.bound = this.clanPosition;
    if (caseless(r.tag, CLAN_LADDER_TAGS.surrounding)) {
      this.clanInFlight = false;
      this.askClanList(this.clanPosition - 2 < 1 ? 1 : this.clanPosition);
    }
  }

  /** `FUN_002eb1b0`'s "ClanTotal" branch (D:L189074-189086): on Success the count into `DAT_0044f870`, TotalClans (added TEMPORARY) and the list's bound. */
  clanTotalReply(r: ClanTotalReply): void {
    if (r.status !== 0) return;
    this.clanTotal = r.totalRankings | 0;
    const vars = this.o.uiVars;
    vars.set(vars.add(CLAN_TOTAL_VAR, null, 1), int(this.clanTotal));
    this.clanRest.bound = this.clanTotal;
  }

  /**
   * `FUN_002ea5c0` (D:L188607-188633): only with no list request out, a start above 0, and the start under the bound or
   * no row held (D:L188617): the request marked out, the rows freed, the start held, "ClanLadderList" asked from it, 14
   * rows (`7 << 1`), its reply `FUN_002ea730`.
   */
  private askClanList(start: number): void {
    if (this.clanInFlight || !((start < this.clanRest.bound || this.clanRest.rows.length === 0) && start > 0)) return;
    this.clanInFlight = true;
    this.clanRest.rows = [];
    this.clanRest.start = start;
    const svc = this.o.service;
    const q: ClanListQuery = { tag: CLAN_LADDER_TAGS.list, ...LADDER_LIST_STAT, startPosition: start, pageSize: LADDER_PAGE_ROWS };
    this.clanSend(svc?.clanList ? () => svc.clanList!(q) : null, (rows) => { this.clanListReply(rows); });
  }

  /**
   * `FUN_002ea6b0` (D:L188638-188657): the podium's rows freed, "ClanLadderLeaders" asked, 10 from 1 -- no request flag.
   * Its reply meets none of the list's state but the flag (the leaders' branch of `FUN_002ea730` D:L188676-188681 keeps
   * into and draws 0x44f820 only; a failure row of it frees the list's flag, D:L188671-188673, as the original's does when
   * it lands), so it joins no chain: applied as it lands (`CLAN_LADDER_REPLY_ORDER_READING`).
   */
  private askClanPodium(): void {
    this.clanBest.rows = [];
    const svc = this.o.service;
    const q: ClanListQuery = { tag: CLAN_LADDER_TAGS.leaders, ...LADDER_LIST_STAT, startPosition: 1, pageSize: LADDER_PODIUM_ROWS };
    this.clanSend(svc?.clanList ? () => svc.clanList!(q) : null, (rows) => { this.clanListReply(rows); }, { turns: [], released: true });
  }

  /**
   * `FUN_002ea730` (D:L188663-188692), each row in turn: a status not Success ("GetClanLadderList", S:0x3f45b0) frees the
   * list's request, whatever the tag (D:L188671-188673); a "ClanLadderLeaders" row kept into the podium's, drawn at the
   * row ending it (D:L188676-188681); a "ClanLadderList" row kept into the list's, and at the end the list drawn and its
   * request freed (D:L188684-188688); another tag keeps nothing. The tags compared case-blind (`FUN_00198b80`).
   */
  clanListReply(rows: readonly ClanListEntry[]): void {
    for (const e of rows) {
      if (e.status !== 0) { this.clanInFlight = false; continue; }
      if (caseless(e.tag, CLAN_LADDER_TAGS.leaders)) {
        this.keepClan(this.clanBest, e);
        if (e.endOfList) this.drawClanPodium();
      } else if (caseless(e.tag, CLAN_LADDER_TAGS.list)) {
        this.keepClan(this.clanRest, e);
        if (e.endOfList) { this.drawClanRanking(); this.clanInFlight = false; }
      }
    }
  }

  /** `FUN_002ebcf0` (D:L189489-189544): a row kept unless one of its position is held (D:L189504-189510); the list's +0xc raised to it (D:L189539-189541). */
  private keepClan(list: ClanRowList, e: ClanListEntry): void {
    if (list.rows.some((r) => r.position === e.ladderPosition)) return;
    list.rows.push({ tag: e.tag, clanId: e.clanId, name: e.clanName, position: e.ladderPosition });
    if (list.bound < e.ladderPosition) list.bound = e.ladderPosition;
  }

  /** `FUN_002ea800` (D:L188697-188727): sorted by position (`FUN_002ec7e0`, D:L188710), CLAN_LADDER_LEADERS set (D:L188724). No event. */
  private drawClanPodium(): void {
    this.clanBest.rows.sort((a, b) => a.position - b.position);
    const vars = this.o.uiVars;
    vars.set(vars.add(CLAN_LADDER_LEADERS_VAR, null, 1), { type: 'array', value: clanPodiumRows(this.clanBest.rows) });
  }

  /** `FUN_002ea930` (D:L188732-188787): sorted by position (`FUN_002ec7e0`, D:L188749), CLAN_LADDER_RANKING set (D:L188781), ON_LADDER_REFRESH raised (D:L188782-188784). */
  private drawClanRanking(): void {
    this.clanRest.rows.sort((a, b) => a.position - b.position);
    const vars = this.o.uiVars;
    vars.set(vars.add(CLAN_LADDER_RANKING_VAR, null, 1), { type: 'array', value: clanRankingRows(this.clanRest.rows, this.clanTotal, this.myClanId(), this.clanPosition) });
    if (!this.releasing) this.post('ON_LADDER_REFRESH');                  // LATER 54: a list landed on an earlier visit refreshed that one
  }

  /**
   * `FUN_00279b50` (D:L124078-124094): the argument (INPUT_STRING the running animation's input string, D:L124085-124087)
   * and the command's origin (+0x10) to `FUN_002efe50` (D:L191683-191719): PLAYER_INFO_VAR1 set to "Retrieving Player
   * Info", PLAYER_INFO_VAR2 and PLAYER_INFO_DESCRIPTION to " " (each added TEMPORARY), and PlayerInfo asked by the
   * account id `strtol` reads of the text (D:L191699) -- from the ladder the row's key, `"%d"` of its +0x20 -- its reply
   * to `FUN_002f0020`. 1.
   */
  GetPlayerInfo: UiCommandHandler = (cmd) => {
    const text = cmd.arg === INPUT_STRING ? this.o.inputString?.(cmd) ?? null : cmd.arg;
    if (text !== null) this.askPlayerInfo(text, cmd.bytes[0x10] ?? 0);
    return this.answer('GetPlayerInfo', cmd, true);
  };

  private setText(name: string, text: string): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(name, null, 1), str(text));
  }

  private askPlayerInfo(text: string, origin: number): void {
    this.setText(PLAYER_INFO_VAR1, PLAYER_INFO_RETRIEVING);
    this.setText(PLAYER_INFO_VAR2, PLAYER_INFO_SPACE);
    this.setText(PLAYER_INFO_DESCRIPTION_VAR, PLAYER_INFO_SPACE);
    const q: PlayerInfoQuery = { accountId: atoi(text) };
    this.o.service?.playerInfo(q).then((r) => { this.playerInfoReply(r, origin); }, () => { /* never answered */ });
  }

  /**
   * `FUN_002f0020` (D:L191722-192146). A status not Success (D:L191788): PLAYER_INFO_VAR1 "Could not retrieve player
   * information." (S:0x3f4ee0), the two others " " (D:L192140-192143). Success: the record parsed (D:L191790); from the
   * ladder (the reply's tag LADDER, D:L191791) the page's row of the reply's name (case-blind, `FUN_002ebc20`) gives its
   * online state and its position in place of +0x08 (D:L191793-191821); from the friends list (FRIEND, D:L191859-191890)
   * the record of the name gives its online state alone (`friendState`); from the room's players (BRIEFING,
   * D:L191891-191929) the row of the name likewise (`roomState`, SVC-15); from the clan's roster (CLAN, D:L191825-191857)
   * the row of the name gives its online state and its +0x1d0 in place of +0x08 (`clanState`, PLAYER-INFO-CLAN).
   * PLAYER_INFO_NAME_VAR the name, with `[tag]` before it when the record holds
   * one (S:0x3f4c58, S:0x3f4c40, D:L191933-191940); PLAYER_INFO_CHAT_NAME_VAR the name (D:L191941-191942); the three
   * lists (`playerInfoLists`).
   */
  playerInfoReply(r: PlayerInfoAnswer, origin: number): void {
    if (r.status !== 0) {
      this.setText(PLAYER_INFO_VAR1, PLAYER_INFO_FAILED);
      this.setText(PLAYER_INFO_VAR2, PLAYER_INFO_SPACE);
      this.setText(PLAYER_INFO_DESCRIPTION_VAR, PLAYER_INFO_SPACE);
      return;
    }
    const rec = readPlayerRecord(r.stats);
    let online = EMPTY_STATE, position = rec.ladderPosition;
    if (origin === PLAYER_INFO_ORIGIN.ladder) {
      const row = this.rest.rows.find((x) => x.name !== '' && caseless(x.name, r.accountName));
      if (row) { online = row.online; position = row.position; }
    } else if (origin === PLAYER_INFO_ORIGIN.friend) {
      const state = this.o.friendState?.(r.accountName) ?? null;                     // FUN_00301c40 D:L191861; the position stays +0x08
      if (state) online = state;
    } else if (origin === PLAYER_INFO_ORIGIN.clan) {
      const row = this.o.clanState?.(r.accountName) ?? null;                         // FUN_002e9460 on 0x44f740 D:L191827
      if (row) { online = row.online; position = row.ladderPosition; }               // D:L191830-191854; +0x1d0 over +0x08, D:L191855
    } else {
      const state = this.o.roomState?.(r.accountName) ?? null;                       // BRIEFING and any other (D:L191702-191716): FUN_002e3610 D:L191899; the position stays +0x08
      if (state) online = state;
    }
    this.setText(PLAYER_INFO_NAME_VAR, rec.clanTag === '' ? r.accountName : NAME_WITH_TAG(rec.clanTag, r.accountName));
    this.setText(PLAYER_INFO_CHAT_NAME_VAR, r.accountName);
    const lists = playerInfoLists(rec, position, online, this.myTotal, this.myPosition);
    const vars = this.o.uiVars;
    vars.set(vars.add(PLAYER_INFO_VAR1, null, 1), lists.list1);
    vars.set(vars.add(PLAYER_INFO_DESCRIPTION_VAR, null, 1), lists.description);
    vars.set(vars.add(PLAYER_INFO_VAR2, null, 1), lists.list2);
  }

  /** The entries by their table name. */
  entries(): Record<LadderLobbyCommandName, UiCommandHandler> {
    return { GetLadderInfo: this.GetLadderInfo, GetClanRanking: this.GetClanRanking, GetPlayerInfo: this.GetPlayerInfo };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
