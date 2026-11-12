import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarEntry, UiVarManager, UiVarValue } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import { SKB_RECIPIENT_VALVE } from '../keyboard/softKeyboard';
import type { ZAnimUiCommand } from '../zanimRuntime';
import {
  appendGameLobbyChat, CHAT_KIND, GAME_LOBBY_CHAT_VAR, gameLobbyChatLine, lobbyPanelLine, runChatCommand, WHISPER_USAGE_TEXT, type LobbyTextChat,
} from './briefingRoomChat';
import { clanFieldAdmits } from './autoplayCommands';
import { drawnGameName, gameStatsD, MEDIUS_LOBBY_NAME_VAR, type GameListEntry } from './briefingRoomCommands';
import { clanField, type CreatedGame } from './createGameCommands';
import type { LobbyClient } from './lobbyClient';

/**
 * The GAME LOBBY to the launch (`dlgGameLobby.rdr`, ONL-16a; web research 165, on research 159, 162, 157 §6, 169): the
 * join of a listed game from the BRIEFING ROOM -- `aux_join_game`'s rows (`GameHasPassword`, `JoinMPGame` and the
 * lobby's states 15 and 17, `ConnectToGameServer`, `CheckJoinMP`, `JoinGameServer`) -- and the lobby's own rows over
 * SVC-07a's bridge (`IsSessionMaster`, `CheckForcedLaunch`, `ReadyToLoad`, `SwitchSides`, `ForceMPLaunch`,
 * `RefreshGamePlayerList`, `DisconnectFromGameServer` ...), the ARMORY reached from it (ONL-17, research 167), and the
 * text chat (ONL-23, research 266 §1: `SendChatText`, the relay's lines, the panel's 21). `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; an address is the retail ELF's (`S:0x...` a
 * string). Transcribed, cited, never pasted; reading, pending review.
 *
 * **The join** (GAMELIST's CROSS, `join_game` -> `aux_join_game` on `dlgMPBriefingRoom.rdr`): the clan, rank and
 * password checks, the keyboard for a private game (`KeyboardCameBack`), `JoinMPGame(INPUT_STRING)` -- the game's
 * record found in the room, its settings into the valves, GAMENAMEVAR, state 15 (`FUN_002f83b0` D:L197114-197390) --
 * JoinGame (`FUN_002eda60` D:L190353-190402) and its reply (`FUN_002edba0` D:L190405-190482: state 17, or state 11 and
 * MP_INVALID_PASSWORD / MP_BANNED_FROM_GAME / MP_MEDIUS_JOIN_GAME_FAILURE), then the game server's connection
 * (`ConnectToGameServer`, `CheckJoinMP` until `mp_join_game` leaves 9, `JoinGameServer`) and `SWITCHMENU(dlgGameLobby.rdr)`.
 *
 * **The lobby** reads valves the console's game object writes every frame -- `mp_major_game_state`,
 * `mp_minor_game_state`, `mp_45_sec_clock`, `mp_x_sec_clock`, `player_team`, `mp_team_unbalance`, `late_joiner` -- and
 * here they are written from the bridge's `gameLobby` messages (`GAME_LOBBY_SERVER_MASTER_ADAPTATION`): the server is
 * the session master for every game (OT.R27, research 159 §5).
 *
 * The transport is ours (OT.R27): `GameJoinService` is the page's `/lobby/join-game` and `/lobby/leave-game` with the
 * session's bearer, and `GameSocketPort` the match server's socket opened through the page's pinned URL
 * (`packages/viewer/src/gameLobbyHost.ts`). Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog. */
export const GAME_LOBBY = 'dlgGameLobby.rdr';
/** The dialog a game ended under the seat switches to (S:0x3f2780, `FUN_002bc530` -> `FUN_002a47b0` D:L161139-161140): its ONSTART pops #528. */
export const NET_ABANDONED = 'dlgNetAbandoned.rdr';

/** The rows this module fills (PLAT-08's table: id, name, function), and the task the table names as each body's owner. */
export const GAME_LOBBY_COMMAND_ROWS = [
  { id: 45, name: 'JoinMPGame', fn: 0x27d730, task: 'ONL-12' },
  { id: 122, name: 'GameHasPassword', fn: 0x27d390, task: 'ONL-13' },
  { id: 171, name: 'GameHasSpectatorPassword', fn: 0x27d310, task: 'ONL-13' },
  { id: 156, name: 'ClanGameClosed', fn: 0x27d4c0, task: 'SVC-11' },
  { id: 192, name: 'GameRejectsRank', fn: 0x27d440, task: 'SVC-14' },
  { id: 35, name: 'ConnectToGameServer', fn: 0x27e4c0, task: 'ONL-16' },
  { id: 74, name: 'CheckJoinMP', fn: 0x27e2b0, task: 'ONL-12' },
  { id: 73, name: 'JoinGameServer', fn: 0x27e380, task: 'ONL-16' },
  { id: 36, name: 'DisconnectFromGameServer', fn: 0x27e420, task: 'ONL-22' },
  { id: 32, name: 'IsSessionMaster', fn: 0x27e6e0, task: 'ONL-16' },
  { id: 104, name: 'IsSwitchTeamsOK', fn: 0x277420, task: 'ONL-16' },
  // ONL-20b (research 309 R309.4): the table names SVC-11 as the body's owner; the flip itself is CLAN-SWAP's.
  { id: 184, name: 'ClanGameSwapSides', fn: 0x27d540, task: 'SVC-11' },
  { id: 147, name: 'CheckTeamStatus', fn: 0x2772c0, task: null },
  { id: 94, name: 'RefreshGamePlayerList', fn: 0x27d820, task: 'ONL-16' },
  { id: 83, name: 'AdvanceMPMission', fn: 0x279490, task: 'ONL-16' },
  { id: 99, name: 'CheckForcedLaunch', fn: 0x27cbf0, task: 'ONL-16' },
  { id: 28, name: 'ReadyToLoad', fn: 0x27caf0, task: 'ONL-16' },
  { id: 25, name: 'SwitchSides', fn: 0x27d100, task: 'ONL-16' },
  { id: 98, name: 'ForceMPLaunch', fn: 0x27d070, task: 'ONL-16' },
  { id: 112, name: 'ForceMediusStatusReport', fn: 0x2776b0, task: 'ONL-16' },
  // ONL-16b (web sprint 20; research 227 §1): the table names SVC-22, the voice task, as the body's owner.
  { id: 75, name: 'VCButton', fn: 0x27e1c0, task: 'SVC-22' },
  // ONL-23 (research 266 §1): the game lobby's text chat.
  { id: 31, name: 'SendChatText', fn: 0x27cb80, task: 'ONL-23' },
] as const;
export type GameLobbyCommandName = (typeof GAME_LOBBY_COMMAND_ROWS)[number]['name'];

// ---- names the bodies use ----

/** The lobby's states (`FUN_002ed460` D:L190199-190206 installs JoinGame at 0xf; `FUN_002edba0` queues 0x11 on success, 0xb on a refusal). */
export const LOBBY_STATE_JOIN_GAME = 0x0f;
export const LOBBY_STATE_IN_GAME = 0x11;
const LOBBY_STATE_LOGGED_IN = 0x0b;
/** CREATE GAME's state (`FUN_002f83b0` D:L197383: a name no record holds), ONL-13's. */
export const LOBBY_STATE_CREATE_GAME = 0x0d;
/** GAMENAMEVAR (lobby +0xc4), which the lobby's `gamename_val` draws. */
export const GAME_NAME_VAR = 'GAMENAMEVAR';
/** The two password variables JoinGame reads (S:0x3f4830, S:0x3f4810; `FUN_002eda60` D:L190375-190380). */
export const PLAYER_GAME_PASSWORD_VAR = 'PlayerGamePassword';
export const SPECTATOR_GAME_PASSWORD_VAR = 'SpectatorGamePassword';
/** The three lists `FUN_002f83b0` empties (S:0x3f59c8, S:0x3f59d8, S:0x3f59e8; D:L197346-197355) and the player list's reply fills (`FUN_002f7020`). */
export const SEAL_LIST_VAR = 'BSEALLISTVAR';
export const TERRORIST_LIST_VAR = 'BTERRLISTVAR';
export const SPECTATOR_LIST_VAR = 'BSPECLISTVAR';
/** FBA-2, browser adaptation: server-echo captions for the host's native team bot selectors. */
export const LOBBY_BOT_CAPTION_VARS = { seal: 'S2U_SEAL_BOTS', terrorist: 'S2U_TERRORIST_BOTS' } as const;

/**
 * SVC-23f (research 264 §4.2-§4.3): the host's refusal of a spectator's join after VOTE ALL's eject (MaxSpectatorsValve 0,
 * `FUN_002bc620` D:L161396-161422, reason 2), as the joiner shows it: reason 2's text, "Too many spectators" (S:0x3f24b0),
 * formatted "%s" (S:0x3f2478) and posted with the event MP_EJECT_SPECTATOR (S:0x3f2530; `FUN_002b9150` D:L159215,
 * D:L159227; `FUN_002baf30` D:L160342, D:L160357, through `DAT_0044f3c8` = `FUN_0027e610`, the current dialog's
 * event). The match server refuses the hello with this reason (`TOO_MANY_SPECTATORS`, server `room.ts`); the disc's
 * BRIEFING ROOM answers it with `spectator_rejected` (DisconnectFromGameServer, POPUPDIALOG of the text, #527 on
 * JoiningAnim, SWITCHMENU to itself once the popup closes), the GAME LOBBY with its own (DisconnectFromGameServer,
 * POPUPDIALOG, KillPopup, ReturnToBriefingRoom).
 */
export const TOO_MANY_SPECTATORS_TEXT = 'Too many spectators';
/**
 * CLAN-JOIN (research 308 §3.2-§3.3): the host's two clan refusals as the joiner shows them, through the same reader and
 * event as reason 2 (`FUN_002b9150` D:L159206-159227): reason 3 "Too many players" (S:0x3f24d0, D:L159211-159212) -- a
 * clan game's forced side full (`FUN_002bc620` D:L161357-161388) -- and reason 4 "Closed clan game" (S:0x3f24f0,
 * D:L159208-159209) -- an outsider's join of a members-only game (D:L161260-161284). The match server refuses the hello
 * with these reasons (`TOO_MANY_PLAYERS`, `CLOSED_CLAN_GAME`, server `room.ts`).
 */
export const TOO_MANY_PLAYERS_TEXT = 'Too many players';
export const CLOSED_CLAN_GAME_TEXT = 'Closed clan game';
/** The Game Signal refusals `seatEnded` posts with MP_EJECT_SPECTATOR (reasons 2, 3 and 4). */
const EJECT_TEXTS: ReadonlySet<string> = new Set([TOO_MANY_SPECTATORS_TEXT, TOO_MANY_PLAYERS_TEXT, CLOSED_CLAN_GAME_TEXT]);

/**
 * VERSION_REFUSAL_ABORT_READING (VERSION-ABORT; research 315 §3.6, §6 E3): a game hello the match server refuses for its
 * protocol version is the original's version mismatch. The original's console compares a peer's version field with its
 * own (0x47; 0x817 when `DAT_00437dd4` is 1 or 2) and on a difference posts MP_VERSION_NUMBER_ERROR (S:0x3f28c0) to the
 * current dialog through `DAT_0044f3c8` (`FUN_002c0850` D:L163320-163326); the GAME LOBBY answers it with
 * `version_failure_2` (P:L6622, P:L7699-7700) and the BRIEFING ROOM with `version_failure_1` (P:L4097, P:L4418-4419),
 * each SWITCHMENU(dlgNetAbort.rdr) -- the game left, 3 s, SOCOM II ONLINE (P:L12342-12372). No `mp_net_errno` is written
 * on this path. The port's protocol version (`PROTOCOL_VERSION`, viewer `net/protocol.ts`) is its own stand-in for the
 * game version; ONL-32's transcript of two consoles of different versions, if a pair exists, is the proven level. [reading]
 */
export const VERSION_REFUSAL_ABORT_READING = 'a game hello refused for its protocol version posts MP_VERSION_NUMBER_ERROR' as const;
/** The version refusal's two fixed parts: its one spelling, which the room sends and `isVersionRefusal` matches. */
const VERSION_REFUSAL_HEAD = 'protocol ';
const VERSION_REFUSAL_SPEAKS = ', this server speaks ';
/**
 * The match server's refusal of a hello whose protocol version is not its own, "protocol N, this server speaks M" (the
 * room's text as research 91 §19 records it; a port text -- the original's mismatch carries none): built here and
 * sent by server `room.ts` `hello`, so the room and the page share one spelling (VERSION-ABORT).
 */
export function versionRefusalText(version: unknown, speaks: number): string {
  return `${VERSION_REFUSAL_HEAD}${String(version)}${VERSION_REFUSAL_SPEAKS}${speaks}`;
}
/** Whether a hello's refusal is `versionRefusalText`'s: its head, then its last "this server speaks" and a number. */
export function isVersionRefusal(reason: string | null): boolean {
  if (reason === null || !reason.startsWith(VERSION_REFUSAL_HEAD)) return false;
  const at = reason.lastIndexOf(VERSION_REFUSAL_SPEAKS);
  return at >= VERSION_REFUSAL_HEAD.length && /^\d+$/.test(reason.slice(at + VERSION_REFUSAL_SPEAKS.length));
}

/**
 * CLAN-JOIN (research 308 §2.2): the affiliation `DAT_0044f780` a GenericField3 carries, as a joiner decodes the joined
 * game's (`FUN_002e9ab0` D:L188285-188307): the top nibble 0xA..0xD is 1..4, anything else 0.
 */
export function clanAffiliationOf(genericField3: number): number {
  const n = (genericField3 >>> 28) & 0xf;
  return n >= 0xa && n <= 0xd ? n - 0x9 : 0;
}

/** JoinGame's refusals as the reply's reader tells them apart (`FUN_002edba0` D:L190418-190431): -978 and -972; any other the generic failure. */
const STATUS_INVALID_PASSWORD = -978, STATUS_PLAYER_BANNED = -972;
/** `player_team` as the scripts test it: 0 SEALs, 8 terrorists, 16 a spectator (`Enable_SM_Launch`, `ArmButtonClock`, `FromBriefing`). */
export const PLAYER_TEAM = { seal: 0, terrorist: 8, spectator: 16 } as const;
/** `mp_join_game`: `aux_join_game` sets 9 and waits; `CheckJoinMP` writes 10 once connected (`FUN_0027e2b0` D:L126394-126399). */
const JOIN_CONNECTED = 10;
/** The game states the scripts test: `check_loop` waits for major 2; `CycleReadyButton` reads minor 2 (READY) / 1 (`FUN_002c3fc0` D:L165402-165406). */
const MAJOR_LOBBY = 1, MAJOR_LAUNCHED = 2, MINOR_NOT_READY = 1, MINOR_READY = 2;
/** The slot list's ready-dot column (`B_SEALLIST`'s third column: null.tif, ping_dot_red.tif, ping_dot_green.tif). */
const DOT_NOT_READY = 1, DOT_READY = 2;
/** `ReadyToLoad` and `SwitchSides` keep their next time at now + 5000 (`FUN_0027caf0` D:L125603-125611, `FUN_0027d100` D:L125823-125828). */
const REPEAT_MS = 5000;
/**
 * R4B-08 (OT.R97; research 379 §3): r0004's E3 Index handler (r4 0x2bcb40; r0001 `FUN_002baf30` D:L160324-160370, which
 * took the side silently) tests the current dialog's name after applying a team assignment (r4 0x2bccb0-0x2bccd8, the
 * compare r4 0x198f18 = r0001 `FUN_00198f18` D:L15765, a byte compare): this one, the in-lobby ARMORY (r4 0x41dbc0) ...
 */
export const TEAM_SWITCH_ERROR_DIALOG = 'dlg_equipment_mp.rdr' as const;
/**
 * ... and fires MP_MEDIUS_ERROR (r4 0x41d9a0) with this text (r4 0x41dbe0) through the event callback (0x2bcce8-0x2bccfc),
 * which the armory's `OnNetError` shows (POPUP INPUT_STRING) before it disconnects to the BRIEFING ROOM.
 * TEAM_SWITCH_ERROR_SPLIT_READING: the text is handed whole, as the original hands it; how the popup draws its ` | `
 * (caption and button, or one line) is the popup's, not read here. Settles: a PCSX2 `--build r0004` capture of a SWITCH
 * TEAMS answer landing on the ARMORY.
 */
export const TEAM_SWITCH_ERROR_TEXT = 'Team Switch Error! | Continue' as const;
/** TEAM_SWITCH_ERROR_SPLIT_READING: the event's text handed whole (see `TEAM_SWITCH_ERROR_TEXT`). [reading] */
export const TEAM_SWITCH_ERROR_SPLIT_READING = 'the text handed whole; its split the popup\'s' as const;
/**
 * TEAM_SWITCH_STALE_ERRNO_READING (R4B-08's review P3-3; research 379 §3): r0004's Team Switch Error writes no
 * `mp_net_errno` (r4 0x2bccb0-0x2bcd04 fires the event only), and the ARMORY's `OnNetError` branches on it: 32 shows #44
 * / #45 and SWITCHMENU(REBOOT), else the event's text and the BRIEFING ROOM. So a 32 left by an earlier error -- here
 * `seatEnded`'s `NET_ERRNO_DISCONNECTED_READING` -- would turn the Team Switch Error into the disconnect popup and a
 * reboot. Kept as the original reads: nothing written here. Whether the original clears `mp_net_errno` on its REBOOT or
 * a later join is not read. Settles: the writers of `mp_net_errno` traced in r0004 (a clear on REBOOT, the BRIEFING
 * ROOM or `JoinGameServer`), or a PCSX2 `--build r0004` run: a game left by a dropped connection, a new game joined,
 * then a SWITCH TEAMS answer landing on the ARMORY. [reading]
 */
export const TEAM_SWITCH_STALE_ERRNO_READING = 'no errno written; a stale 32 left as the original leaves it' as const;

// ---- the readings and adaptations ----

/**
 * GAME_LOBBY_SERVER_MASTER_ADAPTATION (OT.R27; research 159 §5): on the console the session master's game object decides
 * the lobby (`FUN_002c3cf0` D:L165312-165395) and every console's game object writes the valves the scripts read --
 * `mp_45_sec_clock` and `mp_x_sec_clock` (`CheckForcedLaunch`, `FUN_0027cbf0` D:L125682-125780), the minor state
 * (`FUN_002c3fc0`), the major state, `player_team`, `mp_team_unbalance` (D:L165328-165352). Here the match server is the
 * master of every game and tells each seat in `gameLobby`; the page writes the same valves from it: the seat's side, its
 * READY, the launch, the seat's READY gate (`readyIn`) and the countdown (`countdown`), each clock counted down on the
 * page's own time from the message (the console's `(deadline - now) x 0.001` truncated, D:L125700-125712). A browser
 * adaptation of the transport; the valves and what the scripts do with them are the original's.
 */
export const GAME_LOBBY_SERVER_MASTER_ADAPTATION = 'the valves the game object writes, written from the bridge\'s gameLobby' as const;

/**
 * GAME_JOIN_NO_DME_ADAPTATION: JoinGame's success copies the DME's addresses and keys (`FUN_002edba0` D:L190440-190482; LATER 100)
 * and `ConnectToGameServer` connects that peer session (`FUN_002b85c0`); `CheckJoinMP` waits until the session counts
 * this console (`FUN_0030d510`, `FUN_0030cdd0`, D:L126385-126399). On our server the game is a match room on the match
 * server's own socket (SVC-07a, research 159 §4): `ConnectToGameServer` opens it (the hello's `game` and `ticket`,
 * through the pinned URL), and the room's accepted hello (`welcome`) is the connection counted. A browser adaptation.
 */
export const GAME_JOIN_NO_DME_ADAPTATION = 'the game server is the match server\'s socket; its welcome is the connection counted' as const;

/**
 * GAME_LEAVE_ADAPTATION: `DisconnectFromGameServer` (`FUN_0027e420` D:L126431-126451) ends the peer session and queues the
 * lobby's state 11 (`FUN_002e3730` D:L184739-184753); the host alone also tells Medius the game is over (`FUN_002f80c0`).
 * Here the page closes its game socket (the session's hold released, research 157 §6) and tells the room service it
 * left (`/lobby/leave-game`, research 159 §4's BACK). A browser adaptation of the transport.
 */
export const GAME_LEAVE_ADAPTATION = 'DisconnectFromGameServer closes the game socket and posts /lobby/leave-game' as const;

/**
 * GAME_JOIN_BY_DRAWN_NAME_READING: `JoinMPGame` and the password checks find the game by the row's caption, strcmp over
 * the room's records (`FUN_002e4570`, D:L197169; was cited D:L197162, `FUN_002e4470`'s line); the original's caption is the whole name, cut at "$~" only when drawn,
 * and the port's row carries the cut name (`GAME_NAME_DRAWN_CUT_READING`, research 162 §6), so the record is the first
 * of the room's whose drawn name is the caption. Every game of a room ends in that room's "$~<room>" (research 159
 * §3.3), so two records cannot share a drawn name. [reading]
 */
export const GAME_JOIN_BY_DRAWN_NAME_READING = 'the game found by its drawn name, as the row carries it' as const;

/**
 * MISSION_AVAILABLE_READING: `JoinMPGame` refuses a game whose play list names a mission the console does not hold
 * (`FUN_002e33e0` D:L184629-184649 over `FUN_002c9040`). The server lists only the maps it offers (OT.R16, research 159
 * §3.4), each of which the page plays, so every listed game passes. [reading]
 */
export const MISSION_AVAILABLE_READING = 'every listed game\'s play list passes: the server lists only the maps it offers' as const;

/**
 * RANDOM_JOIN_SETTINGS_READING (ONL-15, research 265 §2): AUTOPLAY's pick (`FUN_002f9220` D:L197693-197698) keeps the
 * world id, GAMENAMEVAR, the player count and an empty PlayerGamePassword, and writes none of the settings valves a
 * listed join writes from the record (`FUN_002f83b0` D:L197176-197300: mp_game_sort_order, MaxPlayersValve,
 * MaxSpectatorsValve, mp_friendly_fire, mp_allow_respawn, EQlimit, mp_max_rounds, mp_max_round_time,
 * mp_rank_restrictions); the port writes none either (`randomGameFound`), so the GAME LOBBY shows them as the last game
 * left them. Where the console's lobby takes a random join's settings from (the game's peer session, presumably) is
 * not read. [reading]
 */
export const RANDOM_JOIN_SETTINGS_READING = 'AUTOPLAY\'s join writes no settings valve (FUN_002f9220); their source in the console\'s lobby unread' as const;

/**
 * PLAYER_TIER_PARKED_READING: `GameRejectsRank` tests the record's four rank bits against the player's tier
 * (`FUN_002f8bc0` -> `FUN_002e3490` with `FUN_002eae20`); the ladder is SVC-13's (merged, research 261 §9) but these
 * rows read no tier, so no game rejects the player -- nor does the room's `CanJoinRoom` (`./briefingRoomCommands`). The
 * services judge both joins by the stored tier (SVC-14, server `lobby.ts`), so a restricted join is refused there.
 * *Narrowed 2026-10-12 by ONL-34 (research 269 §4.4): the player lists' medal column is drawn now, from SEAT-TOLD
 * (`LOBBY_MEDAL_TOLD_READING`); this reading is the rank refusal's only.* [reading]
 */
export const PLAYER_TIER_PARKED_READING = 'no tier on the page: no rank refusal (the rows read no tier; SVC-13 merged)' as const;

/**
 * LOBBY_MEDAL_TOLD_READING (ONL-34; W18.R7; research 269 §4.4): the SEALS and TERRORISTS lists' second column (an IMAGE
 * column 12 x 12, TEXTURES `null.tif`, `Medal_Blue.tif` .. `Medal_Black.tif`, the layout's) is each seat's medal as the
 * room's last `seatTold` named it (SVC-07c's event, the page's `SeatToldBoard`; the server's `medalOf` at the seat's
 * standing, `oop9`'s 4 applied there, `publishedMedal`), and 0 (`null.tif`) for a seat it names not. The original has
 * two writers of the column: the game's player list (`FUN_002c5010` D:L166061-166178), which draws each player state's
 * +0x42 (D:L166121, D:L166141) -- the medal each console publishes (`FUN_002c5360` D:L166200-166205) -- and the lobby
 * server's player list reply (`FUN_002f7020` D:L196331-196496), which computes `FUN_002eaee0` of each player's record
 * position against the console's own total (D:L196436, D:L196448; its own seat's position, D:L196407, D:L196420).
 * The told medal is the first's value; the second, the page's own arithmetic, is not drawn (W18.R7). Which of the two
 * the console shows last between rounds, and what a state not yet published holds, are unread -- one concrete case: the
 * second writer applies no `oop9` override (D:L196407, D:L196420, D:L196436, D:L196448), so if it is what a pre-round
 * lobby shows, the original draws `oop9`'s computed medal there where the port draws 4 from the seat's join. [reading]
 */
export const LOBBY_MEDAL_TOLD_READING = 'each seat\'s medal from the last SEAT-TOLD event; 0 (null.tif) for a seat it names not' as const;

/**
 * COME_FROM_BRIEFING_AFTER_MATCH_READING (ONL-20b; research 309 R309.2, §2.3, §8): the lobby a match returned to reads
 * `ComeFromBriefing` 0, so its `Enable_SM_Launch` runs the first entry's branch (`ArmButtonClock`, `SwapClanSides`,
 * P:L7203-7205) and a joiner's `SetupNormalJoiner` its 10 s `ClientDAReadyButton` (P:L7283-7286). The valve is TEMP (not
 * among `global_valves.rdr`'s names) and the map's load drops the TEMP valves (`FUN_002abd40` D:L151842 ->
 * `FUN_00351cb0`), the lobby's parse making it again at 0. The page loads no map into its menus' valve store, so its
 * return (`matchReturned`) writes this one valve rather than dropping every TEMP one (`VALVE_POOL_READING`: how a parsed
 * command's dropped valve is handed back is not read). [reading]
 */
export const COME_FROM_BRIEFING_AFTER_MATCH_READING = 0;

/**
 * READY_DOT_READING: the lobby's side lists carry a ready-dot column (null, red, green: `B_SEALLIST`'s third column);
 * the player list's reply writes 0 (`FUN_002f7020` D:L196438-196441) and the writer that changes it is not read. Drawn
 * from the seat's READY -- green ready, red not -- which A_ready006 (the host green, the other red at "NOT READY 5")
 * agrees with. [reading]
 */
export const READY_DOT_READING = 'the ready dot from the seat\'s READY: green ready, red not' as const;

/**
 * GAME_PLAYER_LIST_PUSH_ADAPTATION: on the console the side lists are the reply of `RefreshGamePlayerList`
 * (`FUN_002f6ec0` D:L196276-196318: GetGamePlayers; `FUN_002f7020` D:L196331-196496: each player into SEALS,
 * TERRORISTS or SPECTATORS by its stats' side, [name, tier medal, dot, clan]); here each `gameLobby` carries the seats,
 * so the lists are rebuilt from every message and `RefreshGamePlayerList` redraws the last. A browser adaptation.
 */
export const GAME_PLAYER_LIST_PUSH_ADAPTATION = 'the side lists rebuilt from every gameLobby' as const;

/**
 * NET_ERRNO_DISCONNECTED_READING: `OnNetError` (MP_MEDIUS_ERROR on `dlgGameLobby.rdr`) shows #365 "You have been
 * disconnected from SOCOM Online." only while `mp_net_errno` is 32, and then reboots to the start; any other errno shows
 * another record's text and goes back to the briefing room. The research wave read the game socket's closes other than
 * the game's end as #365 (`GAME_SOCKET_CLOSED_DIALOG_READING`, research 159 §8), so the page writes 32 before the event;
 * its one writer, `FUN_002f4090` (D:L194249-194306), is read; which network library code is 32 is not (research 315
 * §3.5; was: "the network library's writer of `mp_net_errno` is not read"). [reading]
 */
export const NET_ERRNO_DISCONNECTED_READING = 32;

/**
 * LATE_JOINER_NEXT_ROUND_READING: a seat given in a game already launched is a late joiner (`late_joiner` 1: #351, and
 * #352 / #353 "the game has already started" by its side, `SetupLateJoiner`). A late player loads on its READY as every
 * late seat does (`READY_LOADS_LATE_JOINER_READING`) and plays from the next round: the level clears the late flag once
 * loaded and sets the ghost flag `+0xd2` for a non-spectator (`FUN_001f5e70` D:L55715-55716, D:L55725-55727), and the
 * match room seats it as that ghost until the next round (research 159 §1; the welcome's `ghost`). *Was, until W19.R12
 * (2026-10-14): the page held it in the lobby until the room's next `roundStart`.* [reading]
 */
export const LATE_JOINER_NEXT_ROUND_READING = 'a late player loads on its READY as the ghost of the round in play and plays from the next round' as const;

/**
 * READY_LOADS_LATE_JOINER_READING (W19.R12; web research 314 §4.2): YES to `SetupLateJoiner`'s #352 / #353 only waits --
 * the list redrawn every 5 s while `late_joiner` is 1 (P:L7268-7271) -- and READY, lit for a late joiner at once
 * (P:L7250-7251), is what loads it: `ready_anim` -> `ReadyToLoad` (P:L6644, P:L7433), `FUN_0027caf0` D:L125595-125611,
 * whose branch on the late flag `+0xcc` writes the major state 2 (`FUN_002a7420`; the 2 is in the delay slot at
 * 0x0027cb24 of the ELF's instructions -- the decompiler drops the argument at D:L125607) and the minor state 1
 * (`FUN_002a73b0`, D:L125608), and sends nothing; `check_loop`'s wait then ends (P:L7116) on `SWITCHMENU(LOAD_SCREEN)`
 * (P:L7126). No team test: the watcher spectates the round in play, the late player loads as its ghost. A late seat that
 * never presses READY is `LATE_SEAT_NEVER_READY_PLACEHOLDER`'s. The port's hand-off goes
 * with the welcome and no `roundStart`; the page's load lets a late joiner through on a welcome with a round under way or
 * a ghost seat (viewer `lobbyMatch.ts`, `CLIENT_ROUND_WAIT_READING`). [reading]
 */
export const READY_LOADS_LATE_JOINER_READING = 'a late seat\'s READY sets the major state 2 and loads it into the round in play; YES only waits' as const;

/**
 * LATE_SEAT_NEVER_READY_PLACEHOLDER (research 314 §8; LATE-WATCH's review F2): what carries a late seat that answers YES
 * and never presses READY is not read -- the host's told game state's changes (`FUN_002c3cf0` D:L165355-165410: its state
 * 2 takes a spectator at major 1 to 2 with no READY) and the clear of the late flag on the network's message 4
 * (`FUN_002bbfa0` D:L160943-160947, dispatched by `FUN_0030d7d0` D:L210147-210151, what the message is unread). The port's
 * stand-in: such a seat stays in the lobby with the late state until its READY, and the room's view of the game no longer
 * launched (its lobby again) clears the late state (`late_joiner` 0), so its READY is then the normal ready and the next
 * launch takes it with the others. [placeholder]
 */
export const LATE_SEAT_NEVER_READY_PLACEHOLDER = 'a late seat waits for its READY; the room\'s lobby again clears the late state' as const;

/**
 * LATE_SEAT_MATCH_ENDING_OWNER (OT.R122: the owner's ruling, 2026-11-11, `socomlegacy/docs/MISSION.md`; a browser adaptation
 * that departs from the original on his word, "the current path is unacceptable even if it matches the original"): a late
 * seat is never sent out of the game while the game ends. What the original does stays recorded (research 315 §12.1 W5 /
 * W6, §14, §15; LATER 238 and 241: a late console READY in the last round's result or in GAME COMPLETE loads, and at its
 * load's end leaves for `dlgNetError.rdr` or `dlgNetAbandoned.rdr`, #528, then SOCOM II ONLINE). The port instead:
 * - **READY held while ending** (here): the lobby keeps the game's end as it hears it -- set by the room's last
 *   `roundOver` (`matchOver`) or a welcome whose standing result is the game's end (`join.result.matchOver`), heard while
 *   the game is launched; cleared by a `roundStart`, the room's `abandoned` or a view not launched (the room's return).
 *   While it stands, READY (`ReadyToLoad`) starts no load and posts nothing, and the native READY is drawn disabled with
 *   one line (`MATCH_ENDING_READY_LINE`) in the help line's place (`./lobbyRecovery`, as the lobby's recovery draws its
 *   controls). Let go, READY is as before: a late seat's load, or the normal ready once the room is in its lobby.
 * - **A late load returned to the game lobby** (viewer `lobbyMatch.ts`): a late seat's load that meets the game's end
 *   leaves at once for the same game's lobby with its client kept -- no bye, no close; the seat and central's seat stay.
 * A seat that was not late, the abandon, the final closes and the host's update are unchanged.
 */
export const LATE_SEAT_MATCH_ENDING_OWNER = 'OT.R122: a late seat at the game\'s end -- READY held while ending; a late load returned to the game lobby, the client kept' as const;
/** OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`): the held READY's line -- the browser's own text, no disc string. */
export const MATCH_ENDING_READY_LINE = 'Match ending -- READY opens when the lobby returns.' as const;

/**
 * EIGHTY_READY_SERVER_ADAPTATION: the master raises MP_EIGHTY_READY (`FUN_002c40c0` D:L165503-165507), which its
 * `launch_10sec_anim` answers with `ForceMPLaunch`, the countdown. The server is the master here (SVC-07a's `PreMatch`
 * starts that countdown itself), so no page raises the event: the countdown reaches every seat in `gameLobby`. The
 * dialog's binding and the row stay as the disc has them -- an MP_EIGHTY_READY the host's dialog is given runs
 * `launch_10sec_anim`, and `ForceMPLaunch` sends the bridge's `launch` (the host's force, `HOST_LAUNCH_READING`).
 */
export const EIGHTY_READY_SERVER_ADAPTATION = 'MP_EIGHTY_READY is the server\'s to decide; no page raises it' as const;

/**
 * CREATE_BY_JOIN_GATE_READING: `JoinMPGame` with a name no record of the room holds starts a game of that name --
 * PasswordValve 0, MaxPlayersValve 16, MaxSpectatorsValve 8, state 13 (`FUN_002f83b0` D:L197360-197383) -- CREATE
 * GAME's path, ONL-13's. Here it answers through ONL-13's hook (`createGame`); with none, 0. [reading]
 */
export const CREATE_BY_JOIN_GATE_READING = 'a name no record holds is CREATE GAME\'s (ONL-13): its hook, else 0' as const;

/**
 * CREATOR_MASTER_READING: the console that creates a game hosts its peer session -- the master byte set
 * (0x45a0c0) -- so `JoinGameServer` passes it at once (`FUN_0027e380` D:L126407-126428: only a non-master waits for the
 * host's connection, `DAT_00441470`), and CREATE GAME's `create_game` asks it straight after `ConnectToGameServer`, with
 * no `CheckJoinMP` wait. Here the page that created the game is the master until the bridge's first `gameLobby` names
 * the host (the server's star, SVC-07b), and its socket's welcome follows the switch. [reading]
 */
export const CREATOR_MASTER_READING = 'the creator is the master from its connect until the first gameLobby' as const;

/**
 * HOST_REPORT_WAIT_READING: how long the host's world report may go unanswered before it is taken as not accepted. The
 * console's WorldReport0 has no reply and `create_game` waits on state 17 with no bound of its own; the join's own
 * bound on a game server's answer is `aux_join_game`'s `monitor_timeout` (`WAIT 30`, then #440), taken here. [reading]
 */
export const HOST_REPORT_WAIT_READING = 30_000;

/**
 * HOST_REPORT_BEFORE_JOIN_ADAPTATION: the console reports its game every 25 s once it hosts (`FUN_002ef590`), and the
 * report has no reply; on our server the report makes the game's match room (research 159 §2) and answers a status, so
 * the host sends it between JoinGame's success and state 17, and the screen goes on only once it is settled. A refusal
 * (a map not offered, respawn: -966), a rejection or no answer within `HOST_REPORT_WAIT_READING` leaves no room: the
 * script's own failure tail follows (`JoinGameServer` 0, `DisconnectFromGameServer`, #295). A browser adaptation.
 * Re-filed 2026-10-18 (SA-6b; the server split, SA.R22 (2)): the report that places the game on a validated host
 * answers the game's door and game token, and the host's socket opens on that answer (`GAME_SEAT_PASS_ADAPTATION`); a
 * local game's answers the status alone, as before. (Was: 'the host report sent before state 17; the screen goes on
 * once it is settled'.)
 */
export const HOST_REPORT_BEFORE_JOIN_ADAPTATION = 'the host report sent before state 17; the screen goes on once it is settled; the socket opens on its answer (a placed game\'s door)' as const;

/**
 * GAME_SEAT_PASS_ADAPTATION (the server split, SA.R22 (1)-(2), (4); OT.R27; a browser adaptation of the transport, no
 * original): a **placed** game's successful JoinGame and the host's accepted world report answer the game's door and its
 * game token, both or neither; the lobby keeps the last such answer's pair for the game held and hands it to the
 * socket's `open` (`ConnectToGameServer`), where the page pins the door and seats the hello with the token in place of
 * the ticket (`packages/viewer/src/connectHost.ts`, `GAME_DOOR_ADAPTATION`). A **local** game's answers carry neither and
 * the socket opens as before. **One without the other** is refused on the page's existing paths, no socket opened: a
 * JoinGame answer takes `FUN_002edba0`'s refusal branch -- state 11, `joinRefused` asked with the reply's status (0: an
 * invite's join shows its own 'failed' line), else MP_MEDIUS_JOIN_GAME_FAILURE -- and, as a status refusal does, posts no
 * `/lobby/leave-game` (the seat central gave is left as today's refusals leave theirs); a world report answer is one not
 * accepted -- create_game's failure (#295).
 */
export const GAME_SEAT_PASS_ADAPTATION = 'a placed game\'s door and token, both or neither, handed to the socket; one without the other refused on the join\'s and the report\'s failure paths' as const;

/**
 * The ARMORY from the lobby (ONL-17; web research 167 §1): weaponselect's CROSS runs the disc's
 * `goto_eq_mp_set_return_valve(dlg_equipment_mp.rdr)` whole -- `team_monitor`, `GoneToArmory` 1, `NoTriangle` 1,
 * `ComeFromBriefing` 1, .DINK, `InitializeOnlineArmory`, `SWITCHMENU(INPUT_STRING)` -- under its own gate, sequence 2,
 * which FAILs while the seat is READY (`mp_minor_game_state` 2) or the game is not in its lobby (`mp_major_game_state`
 * not 1): the original forbids the ARMORY while ready, it never un-readies. The way back is the ARMORY's
 * (`returnto_lobby`, `OnEquipDoneBtnPress`, `UiBackToLobby`): `SWITCHMENU(dlgGameLobby.rdr)`, the seat and its socket
 * untouched, `check_loop` skipping `AdvanceMPMission` once (`GoneToArmory`) and `Enable_SM_Launch` no second
 * `ArmButtonClock` (`ComeFromBriefing`). The gate that held it (research 165 §6) is retired.
 */

/**
 * The text chat (ONL-23; web research 266 §1): R1 and a USB keyboard's ENTER run the disc's `do_chat` -- for a late
 * joiner (`late_joiner` 1) its popup #360 for 5 s and no keyboard -- the original's only gate, as the disc has it
 * (ONL-16, research 266 §2.1: this path tests neither the valve nor `+0xcc`) -- else `GetTextInput(CHATTEXT)` (`ChatSkb`, 63 / 63, the recipient
 * edit MsgPlayer_Recipient) -- and the keyboard's APPLY `send_chat`, `SendChatText(CHATTEXT)` with MsgPlayer_Recipient at
 * +0x10 (0x27cb80 -> `FUN_00281d40` with 0x27cbb0, D:L125617-125641): with no recipient `FUN_002ba850` -> (the text
 * filter, `FUN_002f4df0`) -> `FUN_002ba870` (D:L160067-160116), the game session's message to -1 (the bridge's `chat`,
 * `GameSocketPort.chat`) and the seat's own line drawn at once (D:L160111); with one, the lobby server's whisper
 * (`FUN_002f4860`, `./briefingRoomChat`). The relay's lines are `FUN_002ba9d0`'s (`chatLine`). The panel -- `ChatText`
 * (#343; #351 for a late joiner, `SetupLateJoiner`) over `B_CHATLIST` on BCHATLISTVAR, its last 21 lines
 * (`appendGameLobbyChat`), emptied by `ConnectToGameServer` (D:L126462 -> `FUN_002a9f00` -> `FUN_002a76d0`
 * D:L149534-149539) and nothing else on the path: PERMANENT, it keeps its lines across SWITCH TEAMS, the ARMORY and the
 * launch (ONL-16, research 266 §2.2-2.3) -- scrolls on L1 / L2 (`B_CHATLIST.op5` / `op4`).
 * The voice bar runs beside it (ONL-16b, research 227 §1): CIRCLE's three animations as the disc has them, over
 * `VCButton` and the `can_talk` valve and `PLAYERTACOVAR` that `CheckForcedLaunch` writes (below).
 */

// ---- the voice (ONL-16b, web sprint 20; research 227 §1) ----

/**
 * The game lobby's push-to-talk as the disc drives it (research 170 §4.1, §5.1; C9, C11; R2-AV §1.5, §1.6, §1.15).
 * `dlgGameLobby.rdr` binds CIRCLE three times -- STATE FALLING `do_team_button_down` (`VCButton(1T)`), STATE RISING
 * `do_team_button_up` (`VCButton(0T)`, then `ChatIconReset`: HIDE talk, SHOW notalk), STATE DOWN `do_circle_button_down`
 * every held frame (`ChatIconAction` -- SHOW talk, HIDE notalk -- while the valve `can_talk` is 1, else `ChatIconReset`)
 * -- and `SetupLateJoiner` hides the caption `InfoTextCT` (#338, "CIRCLE VOICE CHAT ALL") for a late joiner. Those are
 * the disc's own scripts, run as they stand; what the code does under them is here:
 *
 * - `VCButton` (0x27e1c0-0x27e2a0, disassembled: research 170 §4.1; the decompilation has no function there): with the
 *   game held and its `+0xcc` clear -- the late joiner, the valve `late_joiner` (C11) -- the argument's first character
 *   '1' sets the talk flag and '0' clears it; the second (T or P) is not read. 1 (`v0 = 1` at 0x27e298).
 * - `CheckForcedLaunch` (`FUN_0027cbf0`), under the same `+0xcc` test (D:L125660): `FUN_0030e710` writes `can_talk`
 *   (the voice object recording, its state 3: D:L210800-210822) through the valve's watchers on a change; then
 *   `FUN_0030e790` (D:L210826-210840) -- the listener's channel's entry held (not 0x100) by another than this console
 *   -- puts the holder's `[clan] name` (`S:0x3ef310`) or name (`S:0x3eebc8`) into `PLAYERTACOVAR` (`S:0x3ef328`), and a
 *   free entry, or one this console holds, a single space (`S:0x3ef338`); a holder no slot names (`FUN_002c3a70` 0)
 *   writes nothing (D:L125661-125680).
 *
 * The page's half -- the talk input's lobby phase, the voice client, the room's floor entry -- is
 * `packages/viewer/src/gameLobbyHost.ts`'s `GameLobbyVoice`. Research 170 §10's names here: the edges are
 * VOICE_LOBBY_BUTTON_EDGE_READING (resolved, R2-AV §1.6; the bindings' STATE re-read on the disc, research 227 §1); the
 * player rows carry no talk mark, VOICE_ROW_MARK_READING (resolved, C9: `drawLists` is unchanged); how the icon looks
 * while someone talks is VOICE_INDICATOR_LOOK_PLACEHOLDER -- the disc's two images, swapped by its own animations, is
 * all that is drawn (no frame of a talker exists to compare).
 */
export interface GameLobbyVoicePort {
  /** `VCButton`'s '1' (true) and '0' (false): the talk flag's press and release, as CIRCLE's FALLING and RISING. */
  button(on: boolean): void;
  /** `FUN_0030e710`: this console records (the voice object's state 3) -- `can_talk`. */
  recording(): boolean;
  /** The listener's channel's floor entry (voice `+0x70 + 8 x channel`): the holder's id, null when free (0x100). */
  holder(): number | null;
  /**
   * VOICE-LATE (the viewer's research 226 §3.2): a line the bar shows in the talker's place -- the page's voice found its
   * audio context suspended (a browser adaptation; the original's bar shows nothing of it) -- or null. Optional.
   */
  notice?(): string | null;
}

/** The bar's uiVar (`S:0x3ef328`), which `WRAPPEDTEXT TalkerName` draws. */
export const TALKER_BAR_VAR = 'PLAYERTACOVAR';
/** The valve `do_circle_button_down` tests, `FUN_0030e710`'s (voice `+0x1074`). */
export const CAN_TALK_VALVE = 'can_talk';
/** The bar with no other talker: a single space (`S:0x3ef338`, D:L125663-125665). */
export const TALKER_BAR_FREE = ' ';

/**
 * The bar's text for a holder (D:L125671-125677): with a clan tag, `S:0x3ef310` -- its bytes `23 43 80 40 20 5b 25 73
 * 5d 20 23 43 80 80 80 25 73`: `#C` and the colour 0x80 0x40 0x20, "[%s] ", `#C` and the colour 0x80 0x80 0x80, "%s"
 * (`wrapLines` reads `#C` and the next three bytes as a colour) -- of the tag and the
 * name; with none (`FUN_002c3ac0`'s empty string, or a null), `"%s"` (`S:0x3eebc8`) of the name.
 */
export function talkerBarText(name: string, clan: string | null): string {
  return clan ? `#C\x80@ [${clan}] #C\x80\x80\x80${name}` : name;
}

/**
 * AD-13 (the clans' finish, wave 6b; research 275 §5, 227 §3): the game lobby's clan tag of a seat is the room's told tag
 * (`seatClans`: the server's `Room.tellClan`, the bridge's read at each seat, `CLAN_TAG_AT_SEAT_READING`) -- the slot's
 * published state's +0x2e as `FUN_002c3ac0` returns it to the talker bar (D:L125670) and `FUN_002c5010` reads it for the
 * side lists (D:L166107). The lists' clan cell is keyed: `VALUE` the tag through `"[%s]"` (S:0x3f2a70; the ELF passes the
 * state's +0x2e as the `%s` -- `addiu a2,s2,46` at 0x2c50ec before the call at 0x2c510c, D:L166111, whose third argument
 * the decompilation drops), "" (S:0x3f2a30) with none (D:L166107-166108); `COLOR` the floats 128.0, 64.0, 32.0
 * (D:L166093-166096, D:L166128-166129) -- the same as the lobby server's list writes (`FUN_002f7020` D:L196380-196392,
 * "[%s]" S:0x3f5768, "" S:0x3f5770). Built flat (`LADDER_KEYED_CELL_READING`). (Was `TALKER_CLAN_PARKED_READING`, '':
 * the lobby's seats carried no tag; retired 2026-10-15 by AD-13.)
 */
export const GAME_LOBBY_CLAN_TAG_COLOR = [128, 64, 32] as const;

// ---- the service, the socket, the bridge's messages ----

export interface JoinGameQuery { mediusWorldId: number; joinType: number; gamePassword: string }
/** SA-6b: `door` and `token` a placed game's success carries, both or neither (`GAME_SEAT_PASS_ADAPTATION`). */
export interface JoinGameReply { status: number; mediusWorldId: number; door?: string; token?: string }
/** A placed game's door and game token as central answered them (`GAME_SEAT_PASS_ADAPTATION`); the page pins the door at `open`. */
export interface GameSeatPass { door: string; token: string }
/** An answer's pair (`GAME_SEAT_PASS_ADAPTATION`): the pass, null with neither (a local game), 'half' with one without the other. */
export function seatPassOf(r: { door?: string; token?: string }): GameSeatPass | null | 'half' {
  if (r.door === undefined && r.token === undefined) return null;
  return r.door !== undefined && r.token !== undefined ? { door: r.door, token: r.token } : 'half';
}
/** WorldReport0's fields as the host sends them (`FUN_002ef590` D:L191321-191411), never the world status (research 159 §4). */
export interface WorldReportQuery {
  mediusWorldId: number; gameName: string; minPlayers: number; maxPlayers: number; gameLevel: number; rulesSet: number;
  genericField1: number; genericField2: number; genericField3: number; gameStats: string;
}
/** The page's half (research 159 §4, with the session's bearer): a rejection is a request never answered. */
export interface GameJoinService {
  joinGame(q: JoinGameQuery): Promise<JoinGameReply>;
  leaveGame(): Promise<{ status: number }>;
  /** `/lobby/world-report`: the host's report, which makes the game's match room (research 159 §2); absent, none is sent. */
  worldReport?(q: WorldReportQuery): Promise<{ status: number; door?: string; token?: string }>;
}

/** The match server's game socket (`packages/viewer/src/gameLobbyHost.ts`). */
export interface GameSocketPort {
  /**
   * Opens the game's socket (the hello's `game` and `ticket`); false when it cannot be opened (no ticket, no pinned URL).
   * SA-6b: with a placed game's `pass`, at its door with its token in place of the ticket (`GAME_SEAT_PASS_ADAPTATION`);
   * false when the door is not one the page follows.
   */
  open(mediusWorldId: number, pass?: GameSeatPass): boolean;
  /** One of the bridge's requests (research 159 §4); `clanSwap`, row 184's FINISH (CLAN-SWAP, research 309 §7.2). */
  send(type: 'lobbyReady' | 'switchTeams' | 'launch' | 'clanSwap'): void;
  /**
   * ONL-23: the seat's line (`{ type: 'chat', text }`, the game session's message to -1, `FUN_002ba870` D:L160109); absent,
   * none is sent. SVC-19: `team`, `ChatRecipient` non-zero (D:L160079-160081) -- the server gives it its side's scope.
   */
  chat?(text: string, team?: boolean): void;
  /** FBA-2, browser adaptation: ask the authoritative room for a team bot target. */
  bots?(team: LobbySide, setting: BotSetting): void;
  /** Closed by the page (BACK): no dialog follows. */
  close(): void;
}

export type LobbySide = 'seal' | 'terrorist';
/** FBA-2, authored bot support: the host's target, always bounded by the room's vacancies. */
export type BotSetting = 'off' | 'fill' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export interface BotSettings { seal: BotSetting; terrorist: BotSetting }
/** One seat of the bridge's `gameLobby` (`net/protocol.ts`, research 159 §4). */
export interface GameLobbySeat { id: number; name: string; team: LobbySide | null; ready: boolean; host: boolean; readyIn: number; bot?: boolean }
/** The bridge's `gameLobby` message. */
export interface GameLobbyView { seats: readonly GameLobbySeat[]; countdown: number | null; launched: boolean; refused?: string; botSettings?: BotSettings; nextMap?: string }

/**
 * A game the lobby is entered for -- `enterGameLobby`'s argument: the record a listed game's join found (the briefing
 * room's `JoinMPGame`), or the one CREATE GAME made (ONL-13, at its success). The settings are the 'D' record's
 * (`gameStatsD`), as `FUN_002f83b0` reads them (D:L197176-197300).
 */
export interface GameLobbyEntry {
  mediusWorldId: number;
  /** The game's whole name (`<name>$~<room>`, research 159 §3.3); GAMENAMEVAR takes it drawn. */
  gameName: string;
  maxPlayers: number;
  rulesSet: number;
  /** GameStats as the list carries it (hex). */
  gameStats: string;
  /** The listed game's GenericField3 (its clan field, `FUN_002e99f0`); absent for CREATE GAME's own (`created` keeps it). */
  genericField3?: number;
  /** LINK-1: the share id, when the list or the create reply carried one. */
  lobbyId?: string;
}

/**
 * LOBBY-MAPNAME (research 165 §9): `FUN_002acc10`'s read of the mission's `mission.rdr` is synchronous, inside
 * `AdvanceMPMission`; the page reads the map's archive asynchronously (`GameLobbyCommandsOptions.missionVars`), so a
 * mission's `UiVars` reach the variables when the read resolves -- a frame or more after the row answers -- and only
 * while the lobby still stands on that mission. An adaptation of when, not of what: the same entries, the same Add.
 */
export const MISSION_VARS_ASYNC_ADAPTATION = 'the mission UiVars added when the page reads them, while the lobby stands on that mission' as const;

/** What the lobby hands ONL-18 at the match's start (`GameLobbyCommandsOptions.matchStart`): the game and its first map. */
export interface GameLobbyMatchStart { mediusWorldId: number; gameName: string; mission: string; lateJoiner: boolean }

/** The lobby (0x44f370) the join stands on: ONL-07's client. */
export type GameLobbyLobby = Pick<LobbyClient, 'up' | 'state' | 'queueState' | 'setHandler'>;

export interface GameLobbyCommandsOptions {
  /** Server-view recovery of the current native lobby only (browser adaptation; ./lobbyRecovery). */
  recoverLobby?: (state: LobbyControlRecovery) => boolean;
  uiVars: UiVarManager;
  valves: () => ValveStore;
  lobby?: GameLobbyLobby | null;
  /** The page's `/lobby/join-game` and `/lobby/leave-game`; absent, never answered. */
  service?: GameJoinService;
  /** The game socket; absent, `ConnectToGameServer` answers 0 (#425). */
  socket?: GameSocketPort;
  /** The room's games now held (`BriefingRoomCommands.gamesHeld()`). */
  games: () => readonly GameListEntry[];
  /** The running animation's input string (`FUN_00272480`). */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** `DAT_0044f3c8(name, argument)`: a named event into the built dialog. */
  event?: (kind: number, text: string | null) => void;
  /** R4B-08: the built dialog's name (r4 0x3884e0's dialog, its +0x8e1 / +0x8e8); absent, none (no Team Switch Error). */
  dialog?: () => string | null;
  /** `FUN_002a47b0`: the switch the core asks (the abandoned game's dialog). */
  switchMenu?: (dialog: string) => void;
  /** ONL-13's create (`CREATE_BY_JOIN_GATE_READING`): a name no record holds; absent, `JoinMPGame` answers 0 for it. */
  createGame?: (name: string) => boolean;
  /** ONL-15's AUTOPLAY (`AutoplaySearch.start`, `./autoplayCommands`): `JoinMPGame(RANDOM)`'s chain; absent, nothing is sent. */
  randomGame?: () => void;
  /** The match starts (round 1's launch, or a late seat's READY, `READY_LOADS_LATE_JOINER_READING`): ONL-18's hand-off point. */
  matchStart?: (m: GameLobbyMatchStart) => void;
  /** ONL-16b: the page's voice under `VCButton` and `CheckForcedLaunch` (`GameLobbyVoicePort`); absent, both do nothing for it. */
  voice?: GameLobbyVoicePort;
  /** The room's world id (`DAT_0066a538`, the briefing room's join keeps it): the host's report's GF1. */
  roomWorldId?: () => number;
  /**
   * The client's clan id (`DAT_0044f59c`: GetMyClans' `FUN_002e8bd0` writes it, D:L187810-187812, and -1 on a no-clan
   * reply, D:L187790): the client clan's (`LobbyClan.clanId`, ONL-27); absent, -1 (in no clan).
   */
  clanId?: () => number;
  /**
   * P537-L2 (product track, an adaptation: a developer's test server): whether the server this page plays on runs PR
   * #537's all-maps switch (`CREATE_GAME_ALL_MAPS=1`), as its `/maps` answer says (`allCreateGameMaps`, read by the
   * viewer's `CreateGameOfferRead`). Absent or false -- every public server -- `botsOffered` is H314/H315's. Never a
   * player setting or a lobby option.
   */
  allBotGames?: () => boolean;
  /** The page's clock, ms (`FUN_0030d540` / `FUN_0030d550`); absent, `performance.now`. */
  now?: () => number;
  log?: (name: GameLobbyCommandName, arg: string, answer: boolean) => void;
  /** ONL-23: the lobby server's chat (`BriefingRoomChat`): a whisper and the screen's line; absent, a whisper is not sent and the usage line goes to the panel. */
  chat?: LobbyTextChat;
  /** LOBBY-INVITE (INVITE_REFUSAL_ADAPTATION, `./inviteJoin`): JoinGame refused for `worldId` -- true when the page showed its own line (the invite's join of that world); absent or false, the original's event. */
  joinRefused?: (status: number, worldId: number) => boolean;
  /**
   * LOBBY-MAPNAME: a mission's ("mp<n>") `mission.rdr` `UiVars` entries as `CUIVariableSpec` reads them -- NAME, the
   * VALUE node with its type, the LONGEVITY word (`missionUiVarEntries` over `parseRdrTyped`) -- from the map's
   * `READERM.ZAR`; a promise when the page reads the archive (`MISSION_VARS_ASYNC_ADAPTATION`); null when it is not held.
   * Absent, `AdvanceMPMission` adds none.
   */
  missionVars?: (mission: string) => readonly UiVarEntry[] | Promise<readonly UiVarEntry[] | null> | null;
}

/** One line of the bridge's `chat` (`net/protocol.ts`): the sender's seat, its account's name, the text (63 at most). */
/** The bridge's `chat` (`net/protocol.ts`): `team` on a line of a team scope (SVC-19, the "(Team)" form). */
export interface GameLobbyChatLine { sender: number; name: string; text: string; team?: boolean }

/** Only named controls are written; omitted controls have returned to their native scripts. */
export interface LobbyControlRecovery {
  reset: boolean;
  restartEntryTimers: boolean;
  host: boolean;
  switchTeams?: boolean;
  ready?: boolean;
  armory?: boolean;
  /** OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`): the help line written (`MATCH_ENDING_READY_LINE`, or '' to clear it); absent, untouched. */
  line?: string;
}

const sideTeam = (t: LobbySide | null): number => (t === null ? PLAYER_TEAM.spectator : PLAYER_TEAM[t]);
/** `FUN_002f8ce0` (D:L197459-197476): SWITCH TEAMS allowed -- 0 for the held game's affiliations 1, 2 and 4, else 1. */
const switchTeamsOk = (affiliation: number): boolean => affiliation !== 1 && affiliation !== 2 && affiliation !== 4;

export class GameLobbyCommands {
  /** `DAT_0066a5f0`: the game being joined or stood in, -1 for none. */
  private worldId = -1;
  /**
   * LOBBY-MAP-STALE: the mission whose `UiVars` last landed (`loadMissionVars`), null in a newly held game -- so a move of
   * the map onto the mission already held loads it again when its entries never landed (the original's `FUN_00279490`
   * loads the mission it holds every time, D:L123881). The port's own bookkeeping for its asynchronous read.
   */
  private varsLoaded: string | null = null;
  private entry: GameLobbyEntry | null = null;
  /** The mission the game's play list starts on (`FUN_0027f810` with "mp%d", D:L197342-197344). */
  private mission = '';
  /** The socket's welcome: the room's id of this seat; null before it (or after a close). */
  private seatId: number | null = null;
  /** R4B-08: this seat's side in the room's last game lobby view since the welcome, or null (none yet, or a watcher). */
  private seatSide: LobbySide | null = null;
  /** The socket is open and the hello accepted (`GAME_JOIN_NO_DME_ADAPTATION`). */
  private connected = false;
  /** `JoinGameServer` answered 1: the lobby is this page's screen until the match. */
  private inLobby = false;
  private view: GameLobbyView | null = null;
  /** The seat's READY gate and the countdown as deadlines on the page's clock (`GAME_LOBBY_SERVER_MASTER_ADAPTATION`). */
  private readyAt: number | null = null;
  private countdownAt: number | null = null;
  private recovery: { reset: boolean; interruptedEntry: boolean; switchTeams: boolean; ready: boolean; armory: boolean } | null = null;
  private lateJoiner = false;
  /** OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`): the game's end heard while launched, until the room moves on; READY held. */
  private ending = false;
  /** OT.R122: the held READY drawn (its line written) on the dialog, so the release draws it open again once. */
  private readyHoldDrawn = false;
  private started = false;
  /**
   * Whether a view's `launched` may start a hand-off: true from the lobby's entry; false from a match's return
   * (`matchReturned`) until the room shows the game not launched again, so the room's view still carrying the last
   * launch (a view sent before the room's return, ONL-20b) starts no second hand-off without a new launch (the close review's
   * second pass, finding 2; the room's return to the lobby after a match is ONL-20b's, research 309 §7.1).
   */
  private relaunchable = true;
  /** `DAT_00414e98`, `DAT_00414e90`: READY's and SWITCH TEAMS' next times. */
  private nextReady = -Infinity;
  private nextSwitch = -Infinity;
  private joinSeq = 0;
  /** This page created the game held (CREATE GAME's success, `created`): its console hosts the session (`CREATOR_MASTER_READING`). */
  private hosting = false;
  /** SA-6b: the held game's door and token, the last successful answer's (`GAME_SEAT_PASS_ADAPTATION`); null for a local game. */
  private pass: (GameSeatPass & { world: number }) | null = null;
  /** ONL-34: each seat's medal as the room's last `seatTold` named it (`LOBBY_MEDAL_TOLD_READING`), by the room's seat id. */
  private told = new Map<number, number>();
  /** AD-13: each seat's clan tag as the room's last `seatClans` named it, by the room's seat id; a seat it names not, none. */
  private clans = new Map<number, string>();
  /** FBA presentation: each native team heading's colour, supplied by the built dialog rather than a new palette. */
  private botLabelColors = new Map<LobbySide, readonly [number, number, number]>();
  /**
   * `FUN_002e99f0`'s value as the create left it (D:L188258-188282): the affiliation `DAT_0044f780` and the clan id
   * `DAT_0044f778` that `FUN_002e9840(CreateClanAffiliation)` (D:L188174-188201) copies from `DAT_0044f59c` while
   * CreateGame1 is built (D:L190556, before its send at D:L190577) -- the request's GF3, which `created` keeps; the
   * host's world report sends it as GF3 (D:L191396).
   */
  private createdClanField = 0;
  /**
   * `DAT_0044f780`, the held game's affiliation 0..4: a listed or AUTOPLAY join's GF3 decoded (`FUN_002e9ab0`, from
   * `FUN_002f83b0` D:L197301 and `FUN_002f9220` D:L197694), the create's own on the host (`FUN_002e9840` D:L188172-188200,
   * read back from `createdClanField`). `IsSwitchTeamsOK` reads it.
   */
  private affiliation = 0;

  constructor(private readonly o: GameLobbyCommandsOptions) {}

  private now(): number { return this.o.now?.() ?? performance.now(); }
  private answer(name: GameLobbyCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }
  /** `FUN_0026ed60` with `FUN_00272480`: the argument, or the running animation's input string for INPUT_STRING. */
  private argument(cmd: ZAnimUiCommand): string | null {
    if (cmd.arg === 'INPUT_STRING') return this.o.inputString?.(cmd) ?? null;
    return cmd.arg === '' ? null : cmd.arg;
  }
  private up(): boolean { return this.o.lobby?.up ?? false; }
  private post(event: string, text: string | null = null): void { this.o.event?.(DIALOG_EVENTS[event]!, text); }
  private valve(name: string): number { return this.o.valves().acquire(name, VALVE_TYPE.PERM).value; }
  /** A valve written through its watchers (`FUN_00351ff0` then `FUN_003519f0` on a change). */
  private setValve(name: string, value: number): void {
    const v = this.o.valves();
    v.acquire(name, VALVE_TYPE.PERM);
    v.set(name, value, VALVE_TYPE.PERM);
  }
  private setVar(name: string, value: UiVarValue): void { const vars = this.o.uiVars; vars.set(vars.add(name, null, 2), value); }
  private stringVar(name: string): string {
    const v = this.o.uiVars.find(name)?.value;
    return v?.type === 'string' ? v.value : '';
  }

  /** `FUN_002e4470` then `FUN_002e4570`: the room's game by the caption (`GAME_JOIN_BY_DRAWN_NAME_READING`). */
  private record(name: string | null): GameListEntry | undefined {
    if (name === null) return undefined;
    return this.o.games().find((g) => drawnGameName(g.gameName) === name);
  }
  /** `FUN_002f6d00` (D:L196201-196215): the valve JoinAsSpectator (S:0x3f5730) set. */
  private watching(): boolean { return this.valve('JoinAsSpectator') !== 0; }

  // ---- the join's checks ----

  /** `FUN_0027d390` -> `FUN_002f8dd0` (D:L197505-197527): the game found and its security's bit 0 set. */
  GameHasPassword: UiCommandHandler = (cmd) => this.answer('GameHasPassword', cmd, ((this.record(this.argument(cmd))?.securityLevel ?? 0) & 1) !== 0);
  /** `FUN_0027d310` -> `FUN_002f8d50` (D:L197479-197501): bit 2. */
  GameHasSpectatorPassword: UiCommandHandler = (cmd) => this.answer('GameHasSpectatorPassword', cmd, ((this.record(this.argument(cmd))?.securityLevel ?? 0) & 4) !== 0);
  /**
   * `FUN_0027d4c0` (D:L125939-125953) -> `FUN_002f8c60` (D:L197433-197455): 1 for a game found whose GenericField3
   * `FUN_002e9940` (D:L188215-188244) refuses -- a clan game (affiliation 3, the top nibble 0xC) whose low 28 bits
   * are not the client's clan id `DAT_0044f59c` (`clanId`); 0 for no record, any other affiliation, or the player's own
   * clan's game.
   */
  ClanGameClosed: UiCommandHandler = (cmd) => {
    const g = this.record(this.argument(cmd));
    return this.answer('ClanGameClosed', cmd, !!g && !clanFieldAdmits(g.genericField3, this.o.clanId?.() ?? -1));
  };
  /** `FUN_0027d440` -> `FUN_002f8bc0`: the rank bits against the tier (`PLAYER_TIER_PARKED_READING`): 0. */
  GameRejectsRank: UiCommandHandler = (cmd) => this.answer('GameRejectsRank', cmd, false);

  // ---- the join ----

  /**
   * `FUN_0027d730` -> `FUN_002f83b0` (D:L197114-197390): 0 unless the session is up in state 11; "RANDOM" (S:0x3f5928,
   * AUTOPLAY) starts its chain and answers 1 (D:L197147-197155; ONL-15, `./autoplayCommands`); the room's record by
   * MEDIUS_LOBBY_NAME, else 0; the game by the caption -- none is CREATE GAME's
   * (`CREATE_BY_JOIN_GATE_READING`); a watcher's join of a game with no spectator slot answers 1 at once
   * (D:L197175-197178); else `enterGameLobby` with the record, state 15, 1.
   */
  JoinMPGame: UiCommandHandler = (cmd) => {
    const lobby = this.o.lobby;
    if (!lobby || !this.up() || lobby.state() !== LOBBY_STATE_LOGGED_IN) return this.answer('JoinMPGame', cmd, false);
    const name = this.argument(cmd);
    if (name === 'RANDOM') { this.o.randomGame?.(); return this.answer('JoinMPGame', cmd, true); }
    if (name === null || this.stringVar(MEDIUS_LOBBY_NAME_VAR) === '') return this.answer('JoinMPGame', cmd, false);
    const g = this.record(name);
    if (!g) return this.answer('JoinMPGame', cmd, this.o.createGame?.(name) ?? false);
    if (this.watching() && gameStatsD(g.gameStats)[4] === 0) return this.answer('JoinMPGame', cmd, true);
    this.enterGameLobby(g);
    lobby.queueState(LOBBY_STATE_JOIN_GAME);
    return this.answer('JoinMPGame', cmd, true);
  };

  /**
   * **The entry** both paths call -- a listed game's join (`JoinMPGame`, above) and CREATE GAME's success (ONL-13): the
   * game held (`DAT_0066a5f0`), its settings into the valves as `FUN_002f83b0` writes them (D:L197176-197300:
   * mp_game_sort_order 'D'[6], MaxPlayersValve, MaxSpectatorsValve 'D'[4], mp_friendly_fire and mp_allow_respawn from
   * RulesSet bits 0 and 1, EQlimit 'D'[5], mp_max_rounds 'D'[1], mp_max_round_time 'D'[2] x 60, mp_rank_restrictions
   * 'D'[7]), the passwords cleared for an open game (D:L197303-197310), the first mission "mp<'D'[8]>" (D:L197342-197344),
   * GAMENAMEVAR (drawn, `GAME_NAME_DRAWN_CUT_READING`) and the three side lists emptied (D:L197346-197355). The game
   * socket is opened by `ConnectToGameServer` after, as the scripts ask it.
   *
   * LATER 232 (reading, re-read at the source by its review): CREATE GAME's success (`created`) leaves MaxPlayersValve as the screen set it.
   * The record's MaxPlayers (+0x24, D:L197193-197205) is the listed total -- the create sent MaxPlayersValve +
   * MaxSpectatorsValve (`FUN_002edda0` D:L190528-190550) -- and only a listed join copies it; `cbCreateGame`
   * (`FUN_002ee090` D:L190586-190641) writes no valve. Copied on the create path, the host's report (`report`, the two
   * valves' sum, `FUN_002ef590` D:L191354-191363) counted the spectator slots twice.
   */
  enterGameLobby(game: GameLobbyEntry & { securityLevel?: number }, opts: { created?: boolean } = {}): void {
    const d = gameStatsD(game.gameStats);
    this.setValve('mp_game_sort_order', d[6]!);
    if (opts.created !== true) this.setValve('MaxPlayersValve', game.maxPlayers & 0xffff);
    this.setValve('MaxSpectatorsValve', d[4]!);
    this.setValve('mp_friendly_fire', game.rulesSet & 1);
    this.setValve('mp_allow_respawn', (game.rulesSet >> 1) & 1);
    this.setValve('EQlimit', d[5]!);
    this.setValve('mp_max_rounds', d[1]!);
    this.setValve('mp_max_round_time', d[2]! * 60);
    this.setValve('mp_rank_restrictions', d[7]!);
    const sec = game.securityLevel;
    if (sec !== undefined && (sec & 1) === 0) this.setVar(PLAYER_GAME_PASSWORD_VAR, { type: 'string', value: '' });
    if (sec !== undefined && (sec & 4) === 0) this.setVar(SPECTATOR_GAME_PASSWORD_VAR, { type: 'string', value: '' });
    this.hold(game);
    for (const n of [SEAL_LIST_VAR, TERRORIST_LIST_VAR, SPECTATOR_LIST_VAR]) this.setVar(n, { type: 'array', value: [] });
  }

  /**
   * AUTOPLAY's game found (`FUN_002f9220` D:L197693-197698, ONL-15): its world id kept (`DAT_0066a5f0`) for state 15's
   * JoinGame, its name into GAMENAMEVAR (drawn, `GAME_NAME_DRAWN_CUT_READING`) and PlayerGamePassword emptied -- and
   * nothing more: the settings valves a listed join writes (D:L197176-197300) are not written on this path
   * (`RANDOM_JOIN_SETTINGS_READING`). The port holds the record for its own match start (the first mission, 'D'[8]).
   */
  randomGameFound(game: GameLobbyEntry): void {
    this.setVar(PLAYER_GAME_PASSWORD_VAR, { type: 'string', value: '' });
    this.hold(game);
  }

  /** The game held: the record, the world id, the first mission, GAMENAMEVAR, the join's own state reset. */
  private hold(game: GameLobbyEntry): void {
    const d = gameStatsD(game.gameStats);
    this.entry = {
      mediusWorldId: game.mediusWorldId, gameName: game.gameName, maxPlayers: game.maxPlayers, rulesSet: game.rulesSet, gameStats: game.gameStats,
      ...(game.lobbyId ? { lobbyId: game.lobbyId } : {}),
    };
    this.affiliation = clanAffiliationOf(game.genericField3 ?? 0);
    this.worldId = game.mediusWorldId;
    this.mission = d[8] ? `mp${d[8]}` : '';
    this.varsLoaded = null;
    this.setVar(GAME_NAME_VAR, { type: 'string', value: drawnGameName(game.gameName) });
    this.view = null; this.seatId = null; this.connected = false; this.inLobby = false; this.started = false; this.relaunchable = true; this.lateJoiner = false; this.hosting = false; this.reportState = 'none'; this.pass = null;
    this.readyAt = null; this.countdownAt = null;
    this.recovery = null;
    this.ending = false; this.readyHoldDrawn = false;                   // OT.R122: a new game held ends nothing
    this.told = new Map(); this.clans = new Map();
    this.drawBotSettings();
  }

  /**
   * CREATE GAME's success (ONL-13's `created`, the second caller of the entry): cbCreateGame keeps the world id and
   * queues state 15, JoinGame (`FUN_002ee090` D:L190637-190641); the game's GameStats are the host's own, as
   * `FUN_002f7c40` (D:L196715-196755) builds them from the screen's valves: 'D', rounds, minutes, the spectators in it (0),
   * the spectator slots, EQlimit, the sort order, the rank bits, the play list. The screen's `create_game` then waits for
   * state 17 and connects (`ConnectToGameServer`, `JoinGameServer`, `SWITCHMENU(dlgGameLobby.rdr)`). True: the lobby takes
   * the screen on (CREATE GAME does not return to its caller).
   */
  created(game: CreatedGame): boolean {
    const v = game.valves;
    const d = new Uint8Array(256);
    d[0] = 0x44; d[1] = v['mp_max_rounds'] ?? 0; d[2] = Math.trunc((v['mp_max_round_time'] ?? 0) / 60); d[3] = 0;
    d[4] = v['MaxSpectatorsValve'] ?? 0; d[5] = v['EQlimit'] ?? 0; d[6] = this.valve('mp_game_sort_order'); d[7] = v['mp_rank_restrictions'] ?? 0;
    game.playList.slice(0, 0x20).forEach((n, i) => { d[8 + i] = n; });
    const gameStats = [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
    this.enterGameLobby({ mediusWorldId: game.mediusWorldId, ...(game.lobbyId ? { lobbyId: game.lobbyId } : {}), gameName: game.gameName, maxPlayers: game.request.maxPlayers, rulesSet: ((v['mp_allow_respawn'] ? 2 : 0) | (v['mp_friendly_fire'] ? 1 : 0)), gameStats }, { created: true });   // LATER 232
    this.hosting = true;
    // Latched with the request (D:L190556): a clan id changed between the send and the reply is not the game's.
    this.createdClanField = game.request.genericField3 ?? clanField(v['CreateClanAffiliation'] ?? 0, this.o.clanId?.() ?? -1);
    this.affiliation = clanAffiliationOf(this.createdClanField);
    this.o.lobby?.queueState(LOBBY_STATE_JOIN_GAME);
    return true;
  }

  /**
   * The host's world report (`FUN_002ef590` D:L191321-191411): the name, MinPlayers 2, MaxPlayers the two valves' sum
   * (8 when unset), GameStats (`FUN_002f7c40`), GameLevel the mission's number past "MP", RulesSet (bit 1 respawn, bit 0
   * friendly fire), GF1 the room, GF2 65000 (`DAT_0066a838`), GF3 `FUN_002e99f0()` (D:L191396) -- the clan field CREATE
   * sent (`createdClanField`: the affiliation's nibble 0xA..0xD over the clan id, -1 in no clan, 0 with no
   * affiliation). The server makes the game's match room from it; the console repeats it every 25 s, the server reports
   * itself from then (research 159 §2).
   */
  private report(e: GameLobbyEntry): WorldReportQuery {
    const maxPlayers = this.valve('MaxPlayersValve') + this.valve('MaxSpectatorsValve');
    return {
      mediusWorldId: e.mediusWorldId, gameName: e.gameName, minPlayers: 2, maxPlayers: maxPlayers || 8,
      gameLevel: Number.parseInt(this.mission.slice(2), 10) || 0, rulesSet: e.rulesSet & 3,
      genericField1: this.o.roomWorldId?.() ?? -1, genericField2: 65000, genericField3: this.createdClanField, gameStats: e.gameStats,
    };
  }

  /** The game held (`DAT_0066a5f0`) and its record, or null. */
  game(): GameLobbyEntry | null { return this.worldId < 0 ? null : this.entry; }

  /** The game's mission ("mp<n>", the play list's first, `FUN_0027f810`), '' with no game: the ARMORY record's key (ONL-17, `ArmoryProfileCommands`). */
  missionName(): string { return this.worldId < 0 ? '' : this.mission; }

  /**
   * `GetGameInfo('CurrentGame')`'s lobby half (`CurrentGameHeld`, `./briefingRoomCommands`): the play list the lobby holds
   * at +0x84 (the held record's 'D'[8..0x28), as the join copies it, `FUN_002f83b0` D:L197313-197325, and the create's
   * GameStats carry it, `created`) and the current mission (0x414e00, `this.mission`). Both stand, as the console's do,
   * until the next game's entry rewrites them; null before any game was held (the lobby's +0x84 zeroed by its
   * constructor, `FUN_002e0710` D:L182874-182885).
   */
  currentGame(): { playList: number[]; mission: string } | null {
    if (this.entry === null) return null;
    return { playList: [...gameStatsD(this.entry.gameStats).subarray(8, 8 + 0x20)], mission: this.mission };
  }

  /**
   * State 15's entry (`FUN_002eda60` D:L190353-190402, phase 1): JoinGame with the world id, the join type
   * (JoinAsSpectator) and the password variable of that type. Its reply (`FUN_002edba0` D:L190405-190482): a refusal
   * queues state 11 and posts MP_INVALID_PASSWORD (-978), MP_BANNED_FROM_GAME (-972) or MP_MEDIUS_JOIN_GAME_FAILURE; a
   * success queues state 17.
   */
  private joinGame(): void {
    const svc = this.o.service, lobby = this.o.lobby;
    if (!svc || !lobby) return;
    const watching = this.watching();
    const q: JoinGameQuery = { mediusWorldId: this.worldId, joinType: watching ? 1 : 0, gamePassword: this.stringVar(watching ? SPECTATOR_GAME_PASSWORD_VAR : PLAYER_GAME_PASSWORD_VAR) };
    const seq = ++this.joinSeq;
    svc.joinGame(q).then((r) => {
      if (seq !== this.joinSeq || !lobby.up || lobby.state() !== LOBBY_STATE_JOIN_GAME) return;
      const pass = r.status === 0 ? seatPassOf(r) : null;                          // SA-6b: GAME_SEAT_PASS_ADAPTATION
      if (r.status === 0 && pass !== 'half') {
        this.pass = pass && { ...pass, world: q.mediusWorldId };
        if (this.hosting) this.sendReport(); else lobby.queueState(LOBBY_STATE_IN_GAME);
        return;
      }
      lobby.queueState(LOBBY_STATE_LOGGED_IN);                                      // a refusal, or one without the other: no leave posted
      if (this.o.joinRefused?.(r.status, q.mediusWorldId)) return;
      this.post(r.status === STATUS_INVALID_PASSWORD ? 'MP_INVALID_PASSWORD' : r.status === STATUS_PLAYER_BANNED ? 'MP_BANNED_FROM_GAME' : 'MP_MEDIUS_JOIN_GAME_FAILURE');
    }, () => { /* never answered: aux_join_game's monitor_timeout (30 s, #440) ends the wait */ });
  }

  /**
   * The host's world report (`FUN_002ef590`) before state 17 (`HOST_REPORT_BEFORE_JOIN_ADAPTATION`): sent once JoinGame
   * answered; state 17 is queued when it is settled -- accepted, refused, rejected or past `HOST_REPORT_WAIT_READING` --
   * so `create_game`'s wait on state 17 ends either way and its tail decides: accepted, the socket and the lobby; not,
   * `JoinGameServer` 0, `DisconnectFromGameServer` and `create_game_failure` (#295).
   */
  private sendReport(): void {
    const id = this.worldId, entry = this.entry, report = entry ? this.o.service?.worldReport?.(this.report(entry)) : undefined;
    this.reportState = 'pending';
    this.reportAt = this.now();
    if (!report) { this.reportSettled(id, false); return; }
    report.then((r) => {
      const pass = r.status === 0 ? seatPassOf(r) : null;                          // SA-6b: one without the other is not accepted
      this.reportSettled(id, r.status === 0 && pass !== 'half', pass === 'half' ? null : pass);
    }, () => { this.reportSettled(id, false); });
  }
  private reportSettled(id: number, ok: boolean, pass: GameSeatPass | null = null): void {
    const lobby = this.o.lobby;
    if (id !== this.worldId || this.reportState !== 'pending' || !lobby?.up || lobby.state() !== LOBBY_STATE_JOIN_GAME) return;
    this.reportState = ok ? 'accepted' : 'failed';
    if (ok) this.pass = pass && { ...pass, world: id };                             // SA-6b: the report's pair, or none (local), over the join's
    lobby.queueState(LOBBY_STATE_IN_GAME);
  }
  /** State 15's frames: a report pending past `HOST_REPORT_WAIT_READING` is taken as not accepted. */
  private reportWait(): void {
    if (this.reportState === 'pending' && this.now() - this.reportAt >= HOST_REPORT_WAIT_READING) this.reportSettled(this.worldId, false);
  }
  /** The host's report: none sent, pending, accepted or not. */
  private reportState: 'none' | 'pending' | 'accepted' | 'failed' = 'none';
  private reportAt = 0;

  /** `FUN_0027e4c0` (D:L126454-126477): the game's socket opened (`GAME_JOIN_NO_DME_ADAPTATION`); 0 when it cannot be (#425). */
  ConnectToGameServer: UiCommandHandler = (cmd) => {
    this.o.uiVars.set(this.o.uiVars.add(GAME_LOBBY_CHAT_VAR, null, 2), { type: 'array', value: [] });   // D:L126462 -> FUN_002a76d0 D:L149534-149539
    this.connected = false; this.seatId = null; this.opened = false;
    const socket = this.o.socket, id = this.worldId;
    if (id < 0 || !socket) return this.answer('ConnectToGameServer', cmd, false);
    // The host: the socket only on a report accepted (its room made, research 159 §2); a report not accepted opens none
    // and answers 1, as the console's peer connect does, so the script's JoinGameServer 0 takes the failure.
    const pass = this.pass?.world === id ? { door: this.pass.door, token: this.pass.token } : undefined;   // SA-6b
    if (this.hosting) {
      if (this.reportState === 'accepted') this.opened = pass ? socket.open(id, pass) : socket.open(id);
      return this.answer('ConnectToGameServer', cmd, true);
    }
    this.opened = pass ? socket.open(id, pass) : socket.open(id);
    return this.answer('ConnectToGameServer', cmd, this.opened);
  };
  /** The socket asked open. */
  private opened = false;

  /** `FUN_0027e2b0` (D:L126377-126404): `mp_join_game` to 10 once the session counts this seat (the welcome); 1. */
  CheckJoinMP: UiCommandHandler = (cmd) => {
    if (this.connected && this.valve('mp_join_game') !== JOIN_CONNECTED) this.setValve('mp_join_game', JOIN_CONNECTED);
    return this.answer('CheckJoinMP', cmd, true);
  };

  /** CREATOR_MASTER_READING: the creator is the session's master before any welcome -- its report accepted, its socket opened. */
  private creatorMaster(): boolean { return this.hosting && this.reportState === 'accepted' && this.opened; }

  /** `FUN_0027e380` (D:L126407-126428): 0 unless the seat is held (the welcome); then 1, the lobby this page's. */
  JoinGameServer: UiCommandHandler = (cmd) => {
    if (!this.connected && !this.creatorMaster()) return this.answer('JoinGameServer', cmd, false);
    this.inLobby = true;
    return this.answer('JoinGameServer', cmd, true);
  };

  /** `FUN_0027e420` (D:L126431-126451): `GAME_LEAVE_ADAPTATION` -- the socket closed, the room service told, state 11. 1. */
  DisconnectFromGameServer: UiCommandHandler = (cmd) => {
    this.leave();
    return this.answer('DisconnectFromGameServer', cmd, true);
  };

  private leave(): void {
    const had = this.worldId >= 0;
    this.o.socket?.close();
    this.connected = false; this.seatId = null; this.inLobby = false; this.view = null; this.told = new Map(); this.clans = new Map();
    this.drawBotSettings();
    this.pass = null;                                                              // SA-6b: the left game's pair forgotten
    if (had) this.o.service?.leaveGame().catch(() => { /* never answered */ });
    const lobby = this.o.lobby;
    if (lobby?.up && had && this.stringVar(MEDIUS_LOBBY_NAME_VAR) !== '') lobby.queueState(LOBBY_STATE_LOGGED_IN);   // FUN_002e3730: with a room held
    this.worldId = -1;
  }

  // ---- the lobby ----

  private own(): GameLobbySeat | undefined { return this.view?.seats.find((s) => s.id === this.seatId); }

  /**
   * H314 / H315 (the owner, 2026-10-24: "yes frostfire only to start", "yes respawn only to start"), the room's own gate
   * (`match/src/roomBots.ts` `RoomBots.for`): GAME LOBBY offers its BOTS buttons (`./lobbyBots`) only for the game held
   * -- a respawn game (RulesSet bit 1) whose play list starts on Frostfire ("mp2", 'D'[8] 2) or, since the owner's word of
   * 2026-10-29 ("respawn bots on vigilance can work, just like ff - not normal games"), Vigilance ("mp51", 51), as
   * `match/src/botGates.ts` `BOT_MAPS`. Held by the join or the
   * create (`hold`) before the dialog builds, so it is known before the first `gameLobby` message. P537-L2: on a server
   * that says it runs `CREATE_GAME_ALL_MAPS=1` (`GameLobbyCommandsOptions.allBotGames`), any game held whose play list
   * starts on a mission ("mp<n>"), either rules -- the room's own gate (`RoomBots.for`) still decides whether they work.
   */
  botsOffered(): boolean {
    if (this.entry !== null && this.o.allBotGames?.() === true) return /^mp\d{1,2}$/.test(this.mission);   // P537-L2 (Fuse's 82aa02c14): any disc map, either rules
    return this.entry !== null && (this.entry.rulesSet & 2) !== 0 && (this.mission === 'mp2' || this.mission === 'mp51');
  }

  /** FBA-2: only an advertised-capable room's connected host may configure bots before its countdown. */
  canConfigureBots(): boolean {
    return this.connected && this.own()?.host === true && this.view?.botSettings !== undefined
      && this.view.countdown === null && !this.view.launched && this.view.refused === undefined && this.o.socket?.bots !== undefined;
  }

  /** The server's last target; null means the room has not advertised bot support. */
  botSetting(team: LobbySide): BotSetting | null { return this.view?.botSettings?.[team] ?? null; }

  /** The server's choice, never a pending request's. */
  botCaption(team: LobbySide): string {
    const setting = this.botSetting(team);
    return `BOTS: ${setting === null ? '--' : String(setting).toUpperCase()}`;
  }

  /** The built native header supplies the bot badge's colour; names and human clan cells keep their existing style. */
  setBotLabelColor(team: LobbySide, color: readonly [number, number, number]): void {
    if (this.botLabelColors.get(team)?.every((value, index) => value === color[index])) return;
    this.botLabelColors.set(team, [color[0], color[1], color[2]]);
    if (this.view) this.drawLists();
  }

  /** A browser-adaptation request, no original command-table row and no optimistic roster/caption edit. */
  requestBots(team: LobbySide, setting: BotSetting): boolean {
    if (!this.canConfigureBots() || (team !== 'seal' && team !== 'terrorist')
      || !(setting === 'off' || setting === 'fill' || (Number.isInteger(setting) && Number(setting) >= 1 && Number(setting) <= 8))) return false;
    this.o.socket!.bots!(team, setting);
    return true;
  }

  private drawBotSettings(): void {
    for (const team of ['seal', 'terrorist'] as const) this.setVar(LOBBY_BOT_CAPTION_VARS[team], { type: 'string', value: this.botCaption(team) });
  }

  /** 0x27e6e0: the network byte and the master byte (0x45a0c1, 0x45a0c0): here the seat's host star in `gameLobby`. */
  IsSessionMaster: UiCommandHandler = (cmd) => this.answer('IsSessionMaster', cmd, this.view === null ? this.hosting && this.opened : this.connected && (this.own()?.host ?? false));
  /**
   * 0x277420 -> `FUN_002f8ce0` (D:L197459-197476): 0 for the held game's affiliations 1, 2 and 4 (`affiliation`), else 1
   * (CLAN-JOIN, research 308 §4.3; the room refuses the same three, `CLAN_SWITCH_CLOSED_READING`).
   */
  IsSwitchTeamsOK: UiCommandHandler = (cmd) => this.answer('IsSwitchTeamsOK', cmd, switchTeamsOk(this.affiliation));
  /**
   * Row 184, `FUN_0027d540` (D:L125956-125999; research 309 R309.4), which `SwapClanSides` runs on the session master
   * in the lobby a match returned to. The argument (INPUT_STRING through the animation, D:L125968-125971), matched
   * case-insensitively (`FUN_00198b80`):
   * - START (S:0x3ef350): only when the held game's affiliation (`FUN_002e99e0` -> `DAT_0044f780`, `affiliation`) is 4,
   *   `mp_locked_game` (S:0x3ef358) acquired and set 1 through its watchers (D:L125977-125982) and 1; else 0, nothing
   *   written. `FUN_002f8350` (D:L197101-197110: `DAT_0066a5f8` 1 -- its reader not read -- and on the online host one
   *   game update, `FUN_002a9ee0`, the game object carrying the lock bit) has no effect on the page: the server is the
   *   game's host (`GAME_LOBBY_SERVER_MASTER_ADAPTATION`) and no page message carries the lock.
   * - FINISH (S:0x3ef368): `FUN_002bada0` -> `FUN_002c0040(!DAT_004412d8)` (D:L125990-125995, D:L162973-162982; CLAN-SWAP,
   *   research 309 R309.6): the flag flipped, so the console's own `player_team` is rewritten at once for its team word
   *   under the new flag (`FUN_002c3330` D:L164814-: SEAL 0 <-> TERRORIST 8, a spectator's 16 kept) -- `SwapClanSides`
   *   re-arms the master's kit by it right after -- and the game object sent (`FUN_002c00f0`), which every client follows
   *   (D:L163463-163469): here the room is the game's host, so the page sends it `clanSwap` (an open socket only), and
   *   the room's `gameLobby` brings every page's side, this one's included. No affiliation test (the script asks FINISH
   *   only after START's 1). 1.
   * - Any other argument, or none: 1, nothing done.
   */
  ClanGameSwapSides: UiCommandHandler = (cmd) => {
    const arg = this.argument(cmd)?.toLowerCase() ?? null;
    if (arg === 'finish') {
      const team = this.valve('player_team');
      if (team === PLAYER_TEAM.seal || team === PLAYER_TEAM.terrorist) this.setValve('player_team', team === PLAYER_TEAM.seal ? PLAYER_TEAM.terrorist : PLAYER_TEAM.seal);
      if (this.connected) this.o.socket?.send('clanSwap');
      return this.answer('ClanGameSwapSides', cmd, true);
    }
    if (arg !== 'start') return this.answer('ClanGameSwapSides', cmd, true);
    if (this.affiliation !== 4) return this.answer('ClanGameSwapSides', cmd, false);
    this.setValve('mp_locked_game', 1);
    return this.answer('ClanGameSwapSides', cmd, true);
  };
  /** 0x2772c0: the game object, and the master byte or the host's connection (0x437ce8, 0x45a0c0, 0x441470): the seat held. */
  CheckTeamStatus: UiCommandHandler = (cmd) => this.answer('CheckTeamStatus', cmd, this.connected);
  /** `FUN_0027d820` -> `FUN_002f6ec0` (D:L196276-196318): the lists drawn again from the last `gameLobby` (`GAME_PLAYER_LIST_PUSH_ADAPTATION`). */
  RefreshGamePlayerList: UiCommandHandler = (cmd) => {
    if (!this.up()) return this.answer('RefreshGamePlayerList', cmd, false);
    this.drawLists();
    return this.answer('RefreshGamePlayerList', cmd, true);
  };
  /**
   * `FUN_00279490` (D:L123842-123884): the lobby's deadline to now + 30 s (45 s after a match) and the host's mission set
   * -- the server's (`READY_GATE_MS_READING`, research 159 §5); the seat's gate reaches the page in `readyIn`. Then, with
   * the game object and the network up (D:L123856; here `inSession`: the seat held, or the creator let in as the master
   * before its welcome, as `JoinGameServer` lets it in), the current mission's load `FUN_002acc10(0x4364e0, 0x414e00)`
   * (D:L123881): its UiVars half (`loadMissionVars`), LOBBY-MAPNAME. 1.
   */
  AdvanceMPMission: UiCommandHandler = (cmd) => {
    if (this.inSession()) this.loadMissionVars();
    return this.answer('AdvanceMPMission', cmd, true);
  };
  /** D:L123856's test as the port holds it: the seat held (the welcome), or the creator's master (`creatorMaster`). */
  private inSession(): boolean { return this.connected || this.creatorMaster(); }
  /**
   * `FUN_002acc10`'s UiVars half (D:L152356-152381, research 104 §4 "Mission vars"): each `mission.rdr` `UiVars` entry of
   * the current mission (0x414e00, `this.mission`) through `CUIVariableSpec` (`FUN_00386ff0`) and `CUIVarManager_Add`
   * (`FUN_003857c0(0x437e80, ..)`) at the spec's longevity, with its node's type (`UiVarManager.loadUiVars`) --
   * `mission_title` among them, the title bar's `MPgamename`. Its Valves half (D:L152384-152420) and the rest of the load are not done here (research 165
   * §9). An asynchronous read adds them when it resolves, if the lobby still stands on that mission in the same game
   * (`MISSION_VARS_ASYNC_ADAPTATION`). D:L123856's network test is the call's (`AdvanceMPMission`, `moveMission`), not the
   * resolution's: the original's load is synchronous, so nothing stands between the test and the Add. LOBBY-MAP-STALE: a
   * resolution that waited on the seat as well dropped the next map's entries when the rotation's 4021 had the seat down,
   * and the welcome on that same map loaded nothing again -- the last map's `mission_title` stood in the title bar.
   */
  private loadMissionVars(): void {
    const mission = this.mission, world = this.worldId;
    const read = this.o.missionVars;
    if (!read || mission === '') return;
    const add = (entries: readonly UiVarEntry[] | null): void => {
      if (!entries) return;
      this.o.uiVars.loadUiVars(entries);
      this.varsLoaded = mission;
    };
    let got: ReturnType<typeof read>;
    try { got = read(mission); } catch { return; }
    if (got instanceof Promise) {
      got.then((entries) => { if (this.mission === mission && this.worldId === world) add(entries); }, () => {});
    } else add(got);
  }
  /** 0x2776b0 (D:L122948-122955): the host's world report -- the server reports a game's room itself (research 159 §2). 1. */
  ForceMediusStatusReport: UiCommandHandler = (cmd) => this.answer('ForceMediusStatusReport', cmd, true);

  /**
   * `FUN_0027cbf0` (D:L125642-125789): `mp_45_sec_clock` from the seat's READY gate (game +200, D:L125700-125725) and,
   * while the countdown runs (+0xd8), `mp_x_sec_clock` from its deadline (+0xe4, D:L125727-125781), each the whole
   * seconds left, written through the watchers on a change. The master's launch at the countdown's end
   * (`FUN_002c5360`, D:L125783-125785) is the server's. 1.
   */
  CheckForcedLaunch: UiCommandHandler = (cmd) => {
    this.voiceBar();
    this.clocks();
    this.holdReady();                                     // OT.R122: before the recovery, which decides READY once let go
    this.recoverControls();
    return this.answer('CheckForcedLaunch', cmd, true);
  };

  /**
   * OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`; an adaptation): while the game ends, the native READY drawn disabled on each
   * pass (the disc's own animations may light it) and the line written once; let go, READY drawn open and the line
   * cleared once -- a recovery pending then (the room's lobby again) decides READY after it, as for a late seat's wait.
   */
  private holdReady(): void {
    const recover = this.o.recoverLobby;
    if (!recover) return;
    const host = this.own()?.host ?? false;
    if (this.ending) {
      const drawn = recover({ reset: false, restartEntryTimers: false, host, ready: false, ...(this.readyHoldDrawn ? {} : { line: MATCH_ENDING_READY_LINE }) });
      if (drawn) this.readyHoldDrawn = true;
    } else if (this.readyHoldDrawn) {
      // The review's F3: let go only once drawn on the lobby (another dialog standing, the ARMORY, answers false): retried
      // on the lobby's next pass, so READY is drawn open and the line cleared when the lobby is next shown.
      if (recover({ reset: false, restartEntryTimers: false, host, ready: true, line: '' })) this.readyHoldDrawn = false;
    }
  }

  /** OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`): READY held -- the game's end heard while launched, the room not yet moved on. */
  readyHeld(): boolean { return this.ending; }

  /** Browser/server adaptation: finish explicit waiting transitions, never reconcile ordinary snapshots. */
  private recoverControls(): void {
    const pending = this.recovery, own = this.own(), view = this.view;
    if (!pending || !own || !view || !this.connected || view.launched || view.countdown !== null || this.lateJoiner) return;
    if (this.valve('MayBeExiting') !== 0 || this.valve('NoExitState') !== 0) return;
    const now = this.now();
    const switchWait = now <= this.nextSwitch;
    const readyWait = now <= this.nextReady || (switchWait && this.valve('mp_45_sec_clock') === 0) || (own.host && this.readyAt !== null && now < this.readyAt);
    const entryTimer = !own.ready && own.team !== null && this.valve('NoReadyButton') === 1;
    const restartEntryTimers = pending.reset && pending.interruptedEntry && entryTimer;
    const state: LobbyControlRecovery = {
      reset: pending.reset, restartEntryTimers, host: own.host,
      ...(pending.switchTeams ? { switchTeams: !own.ready && !switchWait && this.affiliation !== 1 && this.affiliation !== 2 && this.affiliation !== 4 } : {}),
      ...(pending.ready ? { ready: !readyWait && !(restartEntryTimers && !own.host) } : {}),
      ...(pending.armory && !entryTimer ? { armory: !own.ready && own.team !== null && !switchWait } : {}),
    };
    if (!this.o.recoverLobby?.(state)) return;
    // Entry timers, when interrupted, are resumed by the native animations. Other controls wait only for their
    // existing command/server deadlines. A press hands its control back to the native animation immediately.
    pending.reset = false;
    pending.switchTeams &&= switchWait && !own.ready;
    pending.ready &&= readyWait && !(restartEntryTimers && !own.host);
    pending.armory &&= switchWait && !own.ready && own.team !== null && !entryTimer;
    if (!pending.switchTeams && !pending.ready && !pending.armory) this.recovery = null;
  }

  /** The game held and its `+0xcc` clear (the valve `late_joiner`, which mirrors it: C11): `VCButton`'s and the bar's test. */
  private talkable(): boolean { return this.entry !== null && this.valve('late_joiner') === 0; }

  /**
   * `FUN_0027cbf0`'s voice half (D:L125660-125680; `GameLobbyVoicePort`): `can_talk` from the voice object, then the bar
   * -- another's `[clan] name` (his tag the room told, `seatClans`; AD-13) or name, or a single space.
   */
  private voiceBar(): void {
    const voice = this.o.voice;
    if (!voice || !this.talkable()) return;
    this.setValve(CAN_TALK_VALVE, voice.recording() ? 1 : 0);
    const notice = voice.notice?.() ?? null;   // VOICE-LATE: the suspended mark, never a silent drop (a browser adaptation)
    if (notice !== null) { this.setVar(TALKER_BAR_VAR, { type: 'string', value: notice }); return; }
    const holder = voice.holder();
    if (holder === null || holder === this.seatId) { this.setVar(TALKER_BAR_VAR, { type: 'string', value: TALKER_BAR_FREE }); return; }
    const s = this.view?.seats.find((x) => x.id === holder);
    if (s) this.setVar(TALKER_BAR_VAR, { type: 'string', value: talkerBarText(s.name, this.clans.get(s.id) ?? '') });   // AD-13: D:L125668-125677
  }

  /** `VCButton` (0x27e1c0; `GameLobbyVoicePort`): '1' the talk flag set, '0' cleared, the second character unread; inert for a late joiner. 1. */
  VCButton: UiCommandHandler = (cmd) => {
    const a = this.argument(cmd) ?? '';
    if (this.o.voice && this.talkable()) {
      if (a[0] === '1') this.o.voice.button(true);
      else if (a[0] === '0') this.o.voice.button(false);
    }
    return this.answer('VCButton', cmd, true);
  };

  private secondsTo(at: number): number { return Math.max(0, Math.floor((at - this.now()) / 1000)); }
  private clocks(): void {
    if (this.readyAt !== null) {
      const s = this.secondsTo(this.readyAt);
      if (this.valve('mp_45_sec_clock') !== s) this.setValve('mp_45_sec_clock', s);
    }
    if (this.countdownAt !== null) {
      const s = this.secondsTo(this.countdownAt);
      if (this.valve('mp_x_sec_clock') !== s) this.setValve('mp_x_sec_clock', s);
    }
  }

  /**
   * `FUN_0027caf0` (D:L125593-125614): once per 5 s, the seat's minor state toggled 1 <-> 2 (`FUN_002c3fc0`
   * D:L165402-165406, the console's own record, which `CycleReadyButton` reads at once) and posted -- the bridge's
   * `lobbyReady`, which holds the 30 s gate and the 5 s itself and answers with the seat's READY. For a late joiner (the
   * late flag `+0xcc`, the valve `late_joiner`), the major state 2 and the minor 1, nothing posted, and the hand-off
   * (D:L125606-125608, `READY_LOADS_LATE_JOINER_READING`). The port's welcomed socket gates both branches (the hand-off
   * carries it). OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`, an adaptation): while the game ends, neither branch runs --
   * no load, nothing posted, the 5 s not taken. 1.
   */
  ReadyToLoad: UiCommandHandler = (cmd) => {
    if (this.ending) return this.answer('ReadyToLoad', cmd, true);
    this.recovery = null;
    const now = this.now();
    if (now > this.nextReady && this.connected) {
      if (this.valve('late_joiner') === 1) {
        this.setValve('mp_minor_game_state', MINOR_NOT_READY);
        this.start();
      } else {
        this.setValve('mp_minor_game_state', this.valve('mp_minor_game_state') === MINOR_READY ? MINOR_NOT_READY : MINOR_READY);
        this.o.socket?.send('lobbyReady');
      }
      this.nextReady = now + REPEAT_MS;
    }
    return this.answer('ReadyToLoad', cmd, true);
  };

  /** `FUN_0027d100` (D:L125816-125831): once per 5 s, SwitchSides asked (`FUN_002badd0`): the bridge's `switchTeams`. 1. */
  SwitchSides: UiCommandHandler = (cmd) => {
    if (this.recovery) { this.recovery.switchTeams = false; this.recovery.armory = false; }
    const now = this.now();
    if (now > this.nextSwitch && this.connected) {
      this.o.socket?.send('switchTeams');
      this.nextSwitch = now + REPEAT_MS;
    }
    return this.answer('SwitchSides', cmd, true);
  };

  /**
   * `FUN_0027d070` (D:L125792-125813): with no countdown, start it; with one and more than 5 s left, call it off -- both
   * the bridge's `launch`, whose server holds the two branches and the host's gate (`HOST_LAUNCH_READING`). 1.
   */
  ForceMPLaunch: UiCommandHandler = (cmd) => {
    if (this.connected) this.o.socket?.send('launch');
    return this.answer('ForceMPLaunch', cmd, true);
  };

  // ---- the socket's events (the page's host feeds them) ----

  /**
   * The room's `welcome`: this seat's id, the hello accepted. OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`): `matchOver`, the
   * welcome's standing result the game's end (`join.result.matchOver`) -- the game ending, unless the lobby already
   * stands not launched; a welcome without it, the room's now, ends nothing.
   */
  welcomed(id: number, map?: string, matchOver = false): void {
    this.ending = matchOver && this.view?.launched !== false;
    this.seatId = id; this.connected = true;
    this.seatSide = null;                                         // R4B-08: a new seat's first view is no move
    this.moveMission(map);
  }

  /**
   * LOBBY-ONE-BEHIND (v0.4.14): the room's map moved under a standing lobby -- the rotation's new welcome, or the returned
   * view's `nextMap`. The original's host writes the play list's next map into 0x414e00 before loading it (`FUN_00279490`
   * D:L123863-123877, the load `FUN_002acc10(0x4364e0, 0x414e00)` at D:L123881; research 309 §2.2), so its lobby draws the
   * next map from its entry; the port's `AdvanceMPMission` ran on the map just played, so the move loads the new map's
   * variables again (`mission_title`, `MPgamename`), behind the same asynchronous guard. A reading, pending review; a
   * non-host console's moment is not read (research 309 §2.1). LOBBY-MAP-STALE: a move onto the mission already held is
   * nothing only once its entries have landed (`varsLoaded`); otherwise the welcome on that map loads it again, as the
   * original never holds a mission apart from its load (D:L123864-123881; `FUN_0027eb50` D:L126673-126674).
   */
  private moveMission(map: string | undefined): void {
    if (!map || !/^MP[0-9]{1,2}$/i.test(map)) return;
    const next = map.toLowerCase();
    if (next === this.mission && this.varsLoaded === next) return;
    this.mission = next;
    if (this.inLobby && !this.started && this.inSession()) this.loadMissionVars();
  }

  /**
   * The bridge's `gameLobby` (`GAME_LOBBY_SERVER_MASTER_ADAPTATION`): the side lists, then the valves -- `player_team`,
   * the minor state, the READY gate's and the countdown's deadlines (the original leaves the controls locked when a
   * countdown is called off -- `mp_x_sec_clock` stays where it stood, as `FUN_002a6b90` with 0 stops its writes,
   * D:L149013-149016; redotcom unlocks them by the owner's ruling LSR.R1), `mp_team_unbalance` (0 while a
   * countdown runs, D:L165348-165352), the late joiner, and the launch: the major state 2, then `matchStart`.
   */
  gameLobby(view: GameLobbyView): void {
    const first = this.view === null;
    const cancelled = this.view?.countdown != null && !this.view.launched && view.countdown === null && !view.launched;
    const lateEnded = this.lateJoiner && !view.launched;
    // OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`): the room's lobby again lets the held READY go, recovered as a late wait's end
    const heldEnded = this.ending && !view.launched;
    if (heldEnded) this.ending = false;
    this.view = view;
    // LOBBY-ONE-BEHIND: the room's next map, the lobby standing; a launched view never moves the mission (the review's F2:
    // the match starts below on the map the room plays, not the rotation's next).
    if (!view.launched) this.moveMission(view.nextMap);
    this.drawLists();
    this.drawBotSettings();
    const own = this.own();
    const now = this.now();
    if (own) {
      this.setValve('player_team', sideTeam(own.team));
      this.setValve('mp_minor_game_state', own.ready ? MINOR_READY : MINOR_NOT_READY);
      this.readyAt = now + own.readyIn * 1000;
      // R4B-08 (r0004, research 379 §3): the seat moved between the sides -- in a game whose SWITCH TEAMS is open the
      // room's SWITCH TEAMS move, the one E3 Index assignment (`FUN_002c4290` D:L165546, D:L165563); "Alternate teams"'
      // swap (affiliation 4) flips by the game object, not that message (research 309 R309.6) -- after the side is taken,
      // on the in-lobby ARMORY: MP_MEDIUS_ERROR with TEAM_SWITCH_ERROR_TEXT (r4 0x2bccb0-0x2bcd04).
      // Not the session master's page (the review's P3-1): the host's own SwitchSides runs the move and the handler in
      // the same call (`FUN_002badd0` D:L160270-160281 -> `FUN_002c4290` -> `FUN_002baea0` D:L160302-160320, its own
      // slot handled at once), so its side lands while dlgGameLobby.rdr is current, never on the ARMORY; here the
      // room's answer is a round trip, which a host's fast CROSS on the focused ARMORY button would beat.
      const moved = this.seatSide !== null && own.team !== null && own.team !== this.seatSide && !own.host;
      if (moved && switchTeamsOk(this.affiliation) && this.o.dialog?.() === TEAM_SWITCH_ERROR_DIALOG) this.post('MP_MEDIUS_ERROR', TEAM_SWITCH_ERROR_TEXT);
      this.seatSide = own.team;
    }
    this.countdownAt = view.countdown === null ? null : now + view.countdown * 1000;
    const sides = view.seats.some((s) => s.team === 'seal') && view.seats.some((s) => s.team === 'terrorist');
    this.setValve('mp_team_unbalance', sides || view.countdown !== null ? 0 : 1);
    if (first) {
      this.lateJoiner = view.launched;
      this.setValve('late_joiner', view.launched ? 1 : 0);
      this.setValve('mp_major_game_state', MAJOR_LOBBY);
    }
    this.clocks();
    if (!view.launched) this.relaunchable = true;
    // LATE_SEAT_NEVER_READY_PLACEHOLDER: the game back in its lobby ends a late seat's late state (the port's stand-in).
    if (!view.launched && this.lateJoiner) { this.lateJoiner = false; this.setValve('late_joiner', 0); }
    if (view.launched || view.countdown !== null) this.recovery = null;
    else if (cancelled || lateEnded || heldEnded) {
      // Browser/server adaptation: the original cancel stops clock writes (FUN_002a6b90, D:L149013-149016).
      // Our authoritative waiting view must also undo CountDown's locks. 11 is the native idle value
      // (dlgGameLobby check_loop/SetupSessionMaster); ./lobbyRecovery restores the existing controls.
      this.setValve('mp_x_sec_clock', 11);
      this.recovery = { reset: true, interruptedEntry: cancelled, switchTeams: true, ready: true, armory: true };
    }
    if (view.launched && !this.lateJoiner && this.relaunchable) this.start();
  }

  /**
   * ONL-34 (W18.R7; research 269 §4.4): the room's `seatTold` as the page's board holds it -- every seat's last told pair,
   * replaced whole by each event (at a seat's join and after each counted round, research 264 §2) -- and the side lists
   * drawn again with each seat's medal (`LOBBY_MEDAL_TOLD_READING`). Nothing here computes a medal.
   */
  seatTold(seats: ReadonlyMap<number, { readonly medal: number }>): void {
    this.told = new Map([...seats].map(([id, e]) => [id, e.medal]));
    if (this.view) this.drawLists();
  }

  /**
   * AD-13 (research 275 §5): the room's `seatClans` as the page's board holds it -- every seat's told tag, players' and
   * watchers' alike, replaced whole by each event -- and the side lists drawn again with each seat's tag
   * (`GAME_LOBBY_CLAN_TAG_COLOR`); the talker bar reads it at its next pass. A seat it names not has none.
   */
  seatClans(clans: ReadonlyMap<number, string>): void {
    this.clans = new Map(clans);
    if (this.view) this.drawLists();
  }

  /**
   * The room's `roundStart` heard in the lobby: no hand-off -- a late seat loads on its READY
   * (`READY_LOADS_LATE_JOINER_READING`; was, until W19.R12, a late joiner's hand-off at the next round,
   * `LATE_JOINER_NEXT_ROUND_READING`). The page's host keeps the event for the hand-off's replay (viewer `gameLobbyHost.ts`).
   */
  roundStart(): void { this.ending = false; }   // OT.R122: a round under way again ends the held READY; nothing else in the rows

  /**
   * OT.R122 (`LATE_SEAT_MATCH_ENDING_OWNER`; an adaptation): the room's `roundOver` heard in the lobby -- the game's last
   * (`matchOver`) while the game is launched holds READY until the room moves on (`roundStart`, `abandoned`, its lobby
   * again). A round's result holds nothing. The page's host feeds it (viewer `gameLobbyHost.ts`).
   */
  roundOver(matchOver: boolean): void { if (matchOver && this.view?.launched !== false) this.ending = true; }

  /** OT.R122: the room's `abandoned` heard in the lobby -- the game's end it held READY for is over; READY let go. */
  abandoned(): void { this.ending = false; }

  /**
   * The match's end back into the same game's lobby (`return_to_gamelobby`: `mp_x_sec_clock` 11, `CloseAndSwitch
   * dlgGameLobby.rdr`; research 179 §6.18, web research 166 §4): the launch undone -- the major state the lobby's, the
   * seat in the lobby again, a later launch free to start (`started` was set at the launch and reset only at a lobby's
   * entry, so a second match in the same lobby could not start, research 166 §4) -- the game and its seat kept.
   */
  matchReturned(): void {
    // ONL-20b (research 309 §2.1, §3): GAME COMPLETE's ExitOnStart (P:L14601-14637), which every console runs and the
    // port's drawn GAME COMPLETE does not -- `IDFromBriefing` 0 (the lobby's FromBriefing re-arms the kit), and
    // `ClanSwapSidesIndex` += 1 (a global valve, kept across the match) -- written here, at the return, since nothing
    // on the page reads either in between; then the lobby entered with `ComeFromBriefing` 0
    // (COME_FROM_BRIEFING_AFTER_MATCH_READING). Each at TEMP, as the script parse makes an unknown name: no promotion.
    const v = this.o.valves();
    v.set('IDFromBriefing', 0, VALVE_TYPE.TEMP);
    v.set('ClanSwapSidesIndex', v.acquire('ClanSwapSidesIndex', VALVE_TYPE.TEMP).value + 1, VALVE_TYPE.TEMP);
    v.set('ComeFromBriefing', COME_FROM_BRIEFING_AFTER_MATCH_READING, VALVE_TYPE.TEMP);
    this.started = false;
    this.relaunchable = false;
    this.lateJoiner = false;
    this.setValve('late_joiner', 0);
    this.inLobby = true;
    this.setValve('mp_major_game_state', MAJOR_LOBBY);
  }

  private start(): void {
    if (this.started || !this.entry) return;
    this.started = true;
    this.setValve('mp_major_game_state', MAJOR_LAUNCHED);
    this.o.matchStart?.({ mediusWorldId: this.entry.mediusWorldId, gameName: this.entry.gameName, mission: this.mission, lateJoiner: this.lateJoiner });
  }

  /**
   * The seat ended by the server (the host's final closes, `GAME_FINAL_CLOSES`, or a refused hello). SVC-23f: a hello
   * refused "Too many spectators" (`refusal`, `TOO_MANY_SPECTATORS_TEXT`) -- or, CLAN-JOIN, "Too many players" or "Closed
   * clan game" (`TOO_MANY_PLAYERS_TEXT`, `CLOSED_CLAN_GAME_TEXT`) -- posts MP_EJECT_SPECTATOR with that text, as
   * the host's join answer's reader does (`FUN_002b9150` D:L159215-159227), whichever dialog holds the join. VERSION-ABORT:
   * a hello refused for its protocol version (`isVersionRefusal`) posts MP_VERSION_NUMBER_ERROR, as `FUN_002c0850` posts
   * it to the current dialog (D:L163320-163326) -- the BRIEFING ROOM's `version_failure_1` and the GAME LOBBY's
   * `version_failure_2` each go to `dlgNetAbort.rdr` -- with no errno written (`VERSION_REFUSAL_ABORT_READING`). Before the lobby:
   * the join's own wait ends it (`CheckJoinMP` never connects; `JoinGameServer` 0, #427). In the lobby: 4007, the game
   * ended -- `dlgNetAbandoned.rdr` (#528, `GAME_ENDED_DIALOG_READING`), as the core switches to it (`FUN_002bc530`
   * D:L161139-161140); any other -- `mp_net_errno` 32 and MP_MEDIUS_ERROR, whose `OnNetError` shows #365
   * (`GAME_SOCKET_CLOSED_DIALOG_READING`, `NET_ERRNO_DISCONNECTED_READING`).
   */
  seatEnded(code: number | null, refusal: string | null = null): void {
    const was = this.inLobby && !this.started;
    this.connected = false; this.seatId = null;
    if (refusal !== null && EJECT_TEXTS.has(refusal)) { this.post('MP_EJECT_SPECTATOR', refusal); return; }
    if (isVersionRefusal(refusal)) { this.post('MP_VERSION_NUMBER_ERROR'); return; }   // VERSION_REFUSAL_ABORT_READING: no errno
    if (!was) return;
    this.inLobby = false;
    if (code === 4007) { this.o.switchMenu?.(NET_ABANDONED); return; }
    this.setValve('mp_net_errno', NET_ERRNO_DISCONNECTED_READING);
    this.post('MP_MEDIUS_ERROR');
  }

  /** The socket dropped and is being opened again (a drop, 4010): the seat not counted until the next welcome. */
  dropped(): void { this.connected = false; }

  // ---- the text chat (ONL-23; research 266 §1) ----

  /**
   * 0x27cb80 (D:L125617-125626): `FUN_00281d40` with 0x27cbb0 (D:L125627-125641) -- no recipient, the game's line
   * (`gameLine`); a recipient, the lobby server's whisper (`FUN_002f4860`); a `/w` with no message, the usage line. 1.
   */
  SendChatText: UiCommandHandler = (cmd) => {
    const chat = this.o.chat;
    runChatCommand(this.o.uiVars, cmd, (text, recipient) => {
      if (recipient === null) this.gameLine(text);
      else chat?.mediusChat(text, recipient);
    }, () => {
      if (chat) chat.screenLine(WHISPER_USAGE_TEXT, '', 0, CHAT_KIND.universe);
      else lobbyPanelLine(this.o.uiVars, WHISPER_USAGE_TEXT, '', CHAT_KIND.universe);
    });
    return this.answer('SendChatText', cmd, true);
  };

  /**
   * `FUN_002ba850` (D:L160057-160063) -> the text filter (`CHAT_FILTER_PLACEHOLDER`, the server's) -> `FUN_002ba870`
   * (D:L160067-160116): the game session's message to every seat (target -1, D:L160109; the bridge's `chat`, sent while
   * the socket is open), then the seat's own line through the receiver (D:L160111) under its own seat's name. SVC-19
   * (web research 266 §3.1): the scope -- 0, "(All)", unless the `ChatRecipient` valve (S:0x3f26e8, the keyboard's
   * TEAM/ALL key) is non-zero, a team's (D:L160079-160102) -- goes with the line (`team`; the server takes the side from
   * the seat) and the own line is drawn in its form, "(Team)" for a team's: the receiver passes its own scope's test.
   * The original sends and draws the filter's reply text (`FUN_002f4df0` -> `FUN_002f4ea0` hands +0x15 on,
   * D:L194765-194778); the page sends and draws the raw text at once, the same while `CHAT_FILTER_PLACEHOLDER` only cuts
   * -- a real filter would show the sender its raw line here. (The briefing room's own line is the unfiltered text in
   * the original too, `FUN_002f4ba0` D:L194707.)
   */
  private gameLine(text: string): void {
    const team = (this.o.valves().find(SKB_RECIPIENT_VALVE)?.value ?? 0) !== 0;   // `FUN_00351ef0(0x3f26e8)`, its +4 short
    if (this.connected) this.o.socket?.chat?.(text, team);
    this.chatLine({ sender: this.seatId ?? -1, name: this.own()?.name ?? '', text, team });
  }

  /**
   * `FUN_002ba9d0` (D:L160117-160195), a line of the bridge's `chat`: none drawn when its text is empty (D:L160146), the
   * sender's name ("Unknown" with none, D:L160177-160179) and the text as `"#C\x80\x80\x80%s (All): %s\n"`
   * (D:L160181) -- SVC-19: a team scope's as `"#C@\x80@%s (Team): %s\n"` (S:0x3f2700, D:L160184) -- after
   * BCHATLISTVAR's last 20 (D:L160155-160188). The scope's own test is the server's: a line of a scope the seat is not in
   * never arrives (`chat.ts` `gameChatReaches`, D:L160137-160145). An ignored sender's line never arrives: the bridge drops
   * it where the console's receiver would (D:L160149-160152; `IGNORED_GAME_LINE_ADAPTATION`, the server's).
   */
  chatLine(line: GameLobbyChatLine): void {
    if (line.text === '') return;
    appendGameLobbyChat(this.o.uiVars, gameLobbyChatLine(line.name === '' ? null : line.name, line.text, line.team === true));
  }

  /**
   * `FUN_002f7020` (D:L196331-196496), each seat into its side's list: SEALS and TERRORISTS [name, medal, ready dot,
   * clan] (the medal SEAT-TOLD's, `LOBBY_MEDAL_TOLD_READING`; `READY_DOT_READING`; the clan the room's told tag, a keyed
   * cell "[tag]" or "" in `GAME_LOBBY_CLAN_TAG_COLOR`, D:L196387-196392 and `FUN_002c5010` D:L166107-166151; AD-13),
   * SPECTATORS [name] (D:L166153-166157: a watcher's tag on no list); the three arrays set at the reply's end
   * (D:L196449-196462).
   */
  private drawLists(): void {
    const seats = this.view?.seats ?? [];
    const str = (value: string): UiVarValue => ({ type: 'string', value });
    const int = (value: number): UiVarValue => ({ type: 'int', value });
    const label = (text: string, color?: readonly [number, number, number]): UiVarValue => ({
      type: 'array', value: [str('VALUE'), str(text), ...(color ? [str('COLOR'), { type: 'array' as const, value: color.map((value) => ({ type: 'real' as const, value })) }] : [])],
    });
    const clan = (tag: string): UiVarValue => label(tag ? `[${tag}]` : '', GAME_LOBBY_CLAN_TAG_COLOR);
    // In the lobby a bot's name is drawn as any seat's (H316; the gold initial is gameplay's, BNI.R1); its separate BOT
    // cell keeps the header's gold (FBA.R9).
    const name = (s: GameLobbySeat): UiVarValue => str(s.name);
    const side = (t: LobbySide): UiVarValue[] => seats.filter((s) => s.team === t)
      .map((s) => ({ type: 'array', value: [name(s), int(this.told.get(s.id) ?? 0), int(s.ready ? DOT_READY : DOT_NOT_READY), s.bot ? label('BOT', this.botLabelColors.get(t)) : clan(this.clans.get(s.id) ?? '')] }));
    this.setVar(SEAL_LIST_VAR, { type: 'array', value: side('seal') });
    this.setVar(TERRORIST_LIST_VAR, { type: 'array', value: side('terrorist') });
    this.setVar(SPECTATOR_LIST_VAR, { type: 'array', value: seats.filter((s) => s.team === null).map((s) => ({ type: 'array', value: [name(s)] })) });
  }

  /** The entries by their table name. */
  entries(): Record<GameLobbyCommandName, UiCommandHandler> {
    return {
      JoinMPGame: this.JoinMPGame, GameHasPassword: this.GameHasPassword, GameHasSpectatorPassword: this.GameHasSpectatorPassword,
      ClanGameClosed: this.ClanGameClosed, GameRejectsRank: this.GameRejectsRank, ConnectToGameServer: this.ConnectToGameServer,
      CheckJoinMP: this.CheckJoinMP, JoinGameServer: this.JoinGameServer, DisconnectFromGameServer: this.DisconnectFromGameServer,
      IsSessionMaster: this.IsSessionMaster, IsSwitchTeamsOK: this.IsSwitchTeamsOK, ClanGameSwapSides: this.ClanGameSwapSides, CheckTeamStatus: this.CheckTeamStatus,
      RefreshGamePlayerList: this.RefreshGamePlayerList, AdvanceMPMission: this.AdvanceMPMission, CheckForcedLaunch: this.CheckForcedLaunch,
      ReadyToLoad: this.ReadyToLoad, SwitchSides: this.SwitchSides, ForceMPLaunch: this.ForceMPLaunch, ForceMediusStatusReport: this.ForceMediusStatusReport,
      VCButton: this.VCButton, SendChatText: this.SendChatText,
    };
  }

  /** Each row's body set in PLAT-08's host, the gate, and the lobby's states 15 and 17 (`FUN_002ed460`'s slots +0x3c, +0x44). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
    this.o.lobby?.setHandler(LOBBY_STATE_JOIN_GAME, (phase) => { if (phase === 1) this.joinGame(); else if (phase === 2) this.reportWait(); });
    // LAB_002ef3c0 (no decompiled block; ELF 0x2ef3c0): phase 1 (0x2ef3f0 -> 0x2ef408) acquires mp_locked_game and posts
    // MP_MEDIUS_READY_TO_CONNECT (S:0x3f4b10, through DAT_0044f3c8 at 0x2ef43c-0x2ef454) -- SOCOM II ONLINE's `join_game`
    // (AUTOPLAY, ONL-15); no other dialog of the path binds it. Not transcribed: phase 1's three other calls -- 0x2f7690
    // (0x2ef408), `FUN_002df8e0(0x44f370)` (0x2ef42c: the room list, the lobby's lists, AUTOPLAY's candidates and the
    // random-join flag reset, D:L182241-182289) and `FUN_002f4fc0(0)` (0x2ef434) -- and the other phases.
    this.o.lobby?.setHandler(LOBBY_STATE_IN_GAME, (phase) => { if (phase === 1) this.post('MP_MEDIUS_READY_TO_CONNECT'); });
  }
}
