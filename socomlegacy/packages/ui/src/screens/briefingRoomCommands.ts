import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import { VALVE_TYPE, valveTypeOf, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { BriefingRoomChat } from './briefingRoomChat';
import type { MissionRecord } from './createGameCommands';
import type { LobbyClient } from './lobbyClient';
import { gameTypePasses, playListOf } from './onlineFiltersCommands';
import type { ChannelListEntry, WorldEntryCommand } from './worldOfSocomCommands';

/**
 * The BRIEFING ROOM (`dlgMPBriefingRoom.rdr`, ONL-12; web research 162, on research 154, 157, 161): the join's half of
 * the rooms list -- `CanJoinRoom`, `JoinMPRoom` and the lobby's states 19 and 20 they lead to -- and the room's game
 * list, `RefreshGameList` with its reply and its draw (CREATE GAME runs since ONL-13, `./createGameCommands`, and a
 * listed game's join since ONL-16a, `./gameLobbyCommands`, research 165). The chat panel is the disc's own layout
 * (ONL-23a); its text chat -- R1's keyboard, `SendMediusChat`, the lines -- is ONL-23's (`./briefingRoomChat`, research
 * 266 §1), whose room's lines the join's success draws (`FUN_002efc80` D:L191662-191664). `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; an address is the retail ELF's (`S:0x...` a string).
 * Transcribed, cited, never pasted; reading, pending review.
 *
 * **The join** (`join_room`, ROOMLIST's CROSS on `dlgWorldOfSOCOM.rdr`): `SuspendMenuInput(5.0)`, then
 * `CanJoinRoom(INPUT_STRING)` -- 0 shows #50 for 2.5 s -- then `.DINK`, the JOINING strip, `JoinMPRoom(INPUT_STRING)`
 * and a WHILE until `socom_online_state` is 11 (19 and 20 wait; any other state runs `OnBadJoinState`). `JoinMPRoom`
 * (0x27d270 -> `FUN_002e3790`) keeps the room's world id (`DAT_0066a538`), sets the valve `room_rank_bits`, writes the
 * name into MEDIUS_LOBBY_NAME (lobby +0xc0, `FUN_002e0450` D:L182779-182780) and queues state 19 -- JoinChannel
 * (`FUN_002ee290`) -- or, with no world id, state 20 (CreateChannel1, `FUN_002ed740`; `FUN_002ed460`
 * D:L190211-190216 installs both). JoinChannel's success leads to state 11 and MP_JOIN_ROOM, which the menu binds to
 * `switch_to_briefing_room` (`SWITCHMENU(dlgMPBriefingRoom.rdr)`); a refusal to state 11 and
 * MP_MEDIUS_JOIN_ROOM_FAILURE with the client's text, which the menu binds to `OnJoinRoomFailure` (the room list asked
 * again, the text in a popup for 2 s).
 *
 * **The room** (`dlgMPBriefingRoom.rdr`): its ONSTART's `autorefresh` asks `RefreshGameList` at `GAMELIST` every 30 s
 * while `socom_online_state` is 11, REFRESH LIST asks it once; the reply keeps each game in the room's record
 * (`FUN_002e2b00`) and the draw sets GAMELISTVAR (`FUN_002e2ce0`), B_43's columns. TRIANGLE's `exit_triage` runs
 * `exit_lobby`: `JoinMPRoom(NONE)`, which answers 1 at once (D:L184805-184808), and `ReturnToWorldOfSOCOM`.
 *
 * **GAME DETAILS** (`GetGameInfo`, `FUN_00279d50` D:L124151-124170; research 154 §7.1): GAMELIST's focus runs
 * `UpdateGameListInfo`, `GetGameInfo(INPUT_STRING)` -- the listed record's details (`FUN_002e1f20`, `gameDetails`) --
 * and the game lobby's SELECT runs `show_game_details`, `GetGameInfo(CurrentGame)` -- the player's own game from the
 * valves (`FUN_002e24d0`, `currentGameDetails`). Both fill GAME_INFO_DETAILS, which GameInfoText shows.
 *
 * **The room's PLAYER LIST** (SVC-15, web research 268 §3): `RefreshRoomPlayerList` (`FUN_0027d900` D:L126105-126146) --
 * `PLAYERLIST.op5` / `.op6` / `.op3` in the set (OnPlayerListAct with the list empty, `auto_refresh_gamelist`,
 * `refresh_gamelist`; OnPlayerListStart and OnPlayerListScrollEnd with CLAN_TAGS) -- asks GetLobbyPlayerNames_ExtraInfo
 * for the room joined at most every 10 s, one at a time (`FUN_002f1240` D:L192307-192340), keeps each row in the room's
 * record by its account (`FUN_002f13f0` D:L192348-192437) and draws ROOMPLAYERLISTVAR sorted by name (`FUN_002f1670`
 * D:L192442-192520); PLAYER INFO's BRIEFING origin reads those rows (`roomPlayerState`, `FUN_002e3610`).
 *
 * The transport is ours (OT.R27; a browser adaptation, as SVC-06's endpoint is): `BriefingRoomService` is the page's
 * `/lobby/join-channel`, `/lobby/set-filter`, `/lobby/leave-channel`, `/lobby/game-list` and (SVC-15)
 * `/lobby/room-player-list` with the session's ticket as the bearer (`packages/viewer/src/briefingRoomHost.ts`). A
 * rejection is a request never answered.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog. */
export const BRIEFING_ROOM = 'dlgMPBriefingRoom.rdr';

/** The rows this module fills (`readBindingTable`; held to PLAT-08's table by the test): the task the table names as each body's owner. */
export const BRIEFING_ROOM_COMMAND_ROWS = [
  { row: 49, id: 47, name: 'JoinMPRoom', fn: 0x27d270, task: 'ONL-11' },
  { row: 183, id: 185, name: 'CanJoinRoom', fn: 0x27d690, task: 'ONL-11' },
  { row: 40, id: 41, name: 'RefreshGameList', fn: 0x27db40, task: 'ONL-12' },
  { row: 42, id: 43, name: 'RefreshRoomPlayerList', fn: 0x27d900, task: 'ONL-12' },
  { row: 170, id: 172, name: 'GetGameInfo', fn: 0x279d50, task: 'ONL-12' },
] as const;
export type BriefingRoomCommandName = (typeof BRIEFING_ROOM_COMMAND_ROWS)[number]['name'];

const existing = (name: string, task: string, ...spelt: string[]): WorldEntryCommand => ({ name, state: 'existing', task, spelt });
const parked = (name: string, task: string, why: string): WorldEntryCommand => ({ name, state: 'parked', task, spelt: [], why });

/**
 * Every bound function `dlgMPBriefingRoom.rdr`'s chapter names (ONL-33's pin, `tools/test/onlineDialogs.pinned.json`),
 * and the two rows its set aims at a node (`GAMELIST.op4` RefreshGameList, `PLAYERLIST.op6` RefreshRoomPlayerList,
 * printed by the pin as `<node>.op<n>`, research 158 §2.3), each answered by a task. Held to the pin by
 * `tools/test/briefingRoomEntryCommands.test.ts`.
 */
export const BRIEFING_ROOM_ENTRY_COMMANDS: readonly WorldEntryCommand[] = [
  existing('SwitchMenu', 'PLAT-10', 'SWITCHMENU'), existing('PopUpDialog', 'PLAT-10', 'POPUPDIALOG'), existing('KillPopUp', 'PLAT-10', 'KillPopup'),
  existing('ActivateButton', 'PLAT-10'), existing('EnableButton', 'PLAT-10'), existing('DisableButton', 'PLAT-10'),
  existing('SuspendMenuInput', 'PLAT-11'), existing('StopAllSounds', 'PLAT-23'), existing('VagStreaming', 'PLAT-23'),
  existing('ClearUIVar', 'MENU-01a'), existing('TestUIVar', 'MENU-01a'), existing('PruneUIVarSpaces', 'ONL-06'),
  existing('GetTextInput', 'PLAT-17'), existing('NetCnfClose', 'ONL-01'), existing('NetCnfUninit', 'ONL-01', 'NetCnfUnInit'),
  // This module.
  { name: 'JoinMPRoom', state: 'here', task: 'ONL-11', spelt: [] },
  { name: 'RefreshGameList', state: 'here', task: 'ONL-12', spelt: [] },
  // SVC-15 (research 268 §3): the room's PLAYER LIST over `/lobby/room-player-list`; its CLAN_TAGS arm ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER.
  { name: 'RefreshRoomPlayerList', state: 'here', task: 'ONL-12', spelt: [] },
  // `UpdateGameListInfo` (GAMELIST's ONFOCUS and ONACTIVATE): GAME DETAILS of the listed record (`FUN_00279d50` ->
  // `FUN_002e1f20`, research 154 §7.1); the game lobby's `show_game_details` calls the same row with CurrentGame.
  { name: 'GetGameInfo', state: 'here', task: 'ONL-12', spelt: [] },
  // ONL-30a (research 269 §2): `playerinfo_activate`, PLAYERLIST's CROSS, origin BRIEFING -- the body is `LadderLobbyCommands`'
  // (`./ladderLobbyCommands`), mounted on the session; reached since SVC-15 fills the list, its presence lines this
  // module's rows (`roomPlayerState`, handed in as its `roomState`).
  existing('GetPlayerInfo', 'ONL-30a'),
  // ONL-23 (research 266 §1): `send_chat` and `playerinfo_send_message`, filled by `BriefingRoomChat` (`./briefingRoomChat`).
  existing('SendMediusChat', 'ONL-23'),
  // ONL-25 (research 269 §1): `on_skb_apply_2` (ON_SKB_APPLY2: the chat keyboard's Action2, the ignore by name) --
  // `CopyUIVar` CHATMESSAGE -> PLAYER_IGNORE_NAME (OPTIONS' body, `./optionsCommands`), then `AddToIgnore` (`./ignoreListCommands`).
  existing('CopyUIVar', 'MENU-01'),
  existing('AddToIgnore', 'ONL-25'),
  // ONL-16a (research 165): a listed game's join, filled by `GameLobbyCommands` (`./gameLobbyCommands`).
  existing('JoinMPGame', 'ONL-16a'), existing('ClanGameClosed', 'ONL-16a'), existing('GameRejectsRank', 'ONL-16a'),
  existing('GameHasPassword', 'ONL-16a'), existing('GameHasSpectatorPassword', 'ONL-16a'), existing('CheckJoinMP', 'ONL-16a'),
  existing('ConnectToGameServer', 'ONL-16a'), existing('JoinGameServer', 'ONL-16a'), existing('DisconnectFromGameServer', 'ONL-16a'),
  // ONL-22 (research 315 §6 E5): `OnMultiplayerDisconnect` (UIanim.rdr), bound on MP_MEDIUS_ERROR, before UnInitNetwork --
  // the lobby's teardown (`FUN_0027dc90` -> `FUN_002f4240`, D:L126213-126220), ONL-10's module's (`logoffCommands.ts`).
  existing('LobbyBailout', 'ONL-22'),
  existing('UnInitNetwork', 'ONL-10'),
];

// ---- names the bodies use ----

/** GAMELISTVAR (0x3f3890): lobby +0xb0, `DAT_0044f420` (`FUN_002df6a0` D:L182197-182199), which the layout's GAMELIST shows. */
export const GAME_LIST_VAR = 'GAMELISTVAR';
/** ROOMPLAYERLISTVAR (S:0x3f38b0): lobby +0xb8, `DAT_0044f428` (`FUN_002df6a0` D:L182202-182203), which the layout's PLAYERLIST shows. */
export const ROOM_PLAYER_LIST_VAR = 'ROOMPLAYERLISTVAR';
/** The list's one element while it holds no row (S:0x3f4f20, `FUN_002f1240` D:L192324-192335). */
export const ROOM_PLAYER_LIST_RETRIEVING = 'Retrieving player list from server...';
/**
 * The list's period (`FUN_002f1240` D:L192307-192308): the next request no sooner than 10.0 s on the frame clock
 * `DAT_004a44a0` (the sum of the frames' seconds, `FUN_003aff30` D:L304766) -- here the page's clock (`now`, ms).
 */
export const ROOM_PLAYER_LIST_PERIOD_S = 10;
/** The "In Lobby" cell's colour (the floats 91, 72, 36: `FUN_002f1670` D:L192475-192477) and the tag cell's (128, 64, 32: D:L192472-192474). */
export const ROOM_PLAYER_IN_LOBBY_COLOR = [91, 72, 36] as const;
export const ROOM_PLAYER_TAG_COLOR = [128, 64, 32] as const;
/** The row's other argument (S:0x3ef370), compared without case (`FUN_00198b80`, D:L126119). */
const CLAN_TAGS = 'CLAN_TAGS';
/** MEDIUS_LOBBY_NAME (S:0x3f39e0): lobby +0xc0 (`DAT_0044f430`), added PERMANENT by `FUN_002e0450` (D:L182779-182780); the room's `roomname` shows it. */
export const MEDIUS_LOBBY_NAME_VAR = 'MEDIUS_LOBBY_NAME';
/** The valve `JoinMPRoom` sets to the room's four rank bits (S:0x3f3e00; D:L184790, D:L184824). */
export const ROOM_RANK_BITS_VALVE = 'room_rank_bits';
/** The lobby states the join queues (`FUN_002efe20` with 0x13 / 0x14, D:L184840-184845). */
export const LOBBY_STATE_JOIN_CHANNEL = 0x13;
export const LOBBY_STATE_CREATE_CHANNEL = 0x14;
const LOBBY_STATE_LOGGED_IN = 0x0b;
/** JoinChannel's refusal text (S:0x3f49a0, `FUN_002ee3a0` D:L190718-190723), posted with MP_MEDIUS_JOIN_ROOM_FAILURE (S:0x3f4760). */
export const JOIN_ROOM_FAILURE_TEXT = 'Cannot join room. It may be full. Please try another.';
/** JoinChannel's password (S:0x3f48d0, the empty string, `FUN_002ee290` D:L190691). */
const ROOM_PASSWORD = '';
/** The lobby world's game-list filter `FUN_002efc80` sends on entering a room (D:L191653-191657: field 10, operator and baseline 0 by the memset). */
export const LOBBY_WORLD_FILTER = { filterField: 10, comparisonOperator: 0, baselineValue: 0 } as const;
/** GameList_ExtraInfo0's two words (`FUN_002e2920` D:L184290-184292: PageID 1, PageSize 0x100). */
export const GAME_LIST_QUERY = { pageId: 1, pageSize: 256 } as const;
/** The arguments the rows test (S:0x3ee898, S:0x3f3df8, S:0x3f3e10). */
const INPUT_STRING = 'INPUT_STRING';
const RANDOM = 'RANDOM';
const NONE = 'NONE';

/**
 * The valves the game list's filters read (`FUN_002e2920` D:L184278-184289: GameTypeFilter, GamePlayerFilter,
 * GameSpeedFilter, GamePasswordFilter, FF_FILTER, LockedFilter) that no dialog on the path names, so ONL-09's seed does
 * not hold them: `global_valves.rdr` gives both 2 PERSIST (read on the disc by the test), the "any" of each filter.
 */
export const BRIEFING_ROOM_GLOBAL_VALVES: readonly { name: string; value: number; type: 'PERM' | 'PERSIST' }[] = [
  { name: 'GamePasswordFilter', value: 2, type: 'PERSIST' }, { name: 'LockedFilter', value: 2, type: 'PERSIST' },
];

/** A launch's start for those two (`CValve_Parse`), beside `seedWorldOfSocomValves`. */
export function seedBriefingRoomValves(valves: ValveStore): void {
  for (const v of BRIEFING_ROOM_GLOBAL_VALVES) valves.set(v.name, v.value, valveTypeOf(v.type, VALVE_TYPE.PERM));
}

// ---- the readings and adaptations ----

/**
 * ROOM_JOIN_NO_SECOND_SERVER_ADAPTATION: JoinChannel's success copies the channel's connection info and queues state 16
 * (`FUN_002ee3a0` D:L190727-190774), whose entry connects that server (`FUN_002efa90` D:L191516-191616) and whose
 * callback queues state 11, posts MP_JOIN_ROOM and sends UpdateUserState, the lobby world's filter and VersionServer
 * (`FUN_002efc80` D:L191621-191667). Our server is one host and answers JoinChannel with no connection info (research
 * 154 §6), so the success goes on as that callback does, at once: state 11, MP_JOIN_ROOM, the filter. The session's
 * UpdateUserState and VersionServer are not sent (research 154 §10, owed to the session). A browser adaptation; the
 * order and the event are the original's.
 */
export const ROOM_JOIN_NO_SECOND_SERVER_ADAPTATION = 'no channel server: state 11, MP_JOIN_ROOM and the filter follow the reply at once' as const;

/**
 * ROOM_LEAVE_ADAPTATION: `exit_lobby`'s `JoinMPRoom(NONE)` answers 1 and sends nothing (`FUN_002e3790` D:L184805-184808):
 * the console stays in the channel until it joins another or leaves the lobby. Our server counts a room's players by
 * its members (SVC-06's `joinChannel` / `leaveRoom`), so the page tells it the room is left -- `/lobby/leave-channel`,
 * research 154 §4's BACK. The row does not wait for it; a JoinChannel after it is sent only once it is answered (or
 * failed), so a quick leave and rejoin reach the server in order. A browser adaptation; what the player sees is the
 * original's.
 */
export const ROOM_LEAVE_ADAPTATION = 'JoinMPRoom(NONE) also posts /lobby/leave-channel; a later JoinChannel waits for it' as const;

/**
 * CREATE_CHANNEL_STATE_READING: state 20 (`FUN_002ed740` D:L190224-190263) finds the room's record by MEDIUS_LOBBY_NAME
 * and, found, sends CreateChannel1, whose -974 leads to FindWorldByName and JoinChannel (research 154 R154.2). It is
 * reached only for a room with no world id, which no kept record lacks (`FUN_002e3b00` keeps ids from 0, D:L184914), and
 * `join_room` asks `CanJoinRoom` first, which refuses a name no record holds; so here state 20 finds no record and sends
 * nothing, as the original does for a name it does not hold, and the chain past it is not wired. [reading]
 */
export const CREATE_CHANNEL_STATE_READING = 'state 20 sends nothing: no kept record lacks a world id; the CreateChannel1 chain is not wired' as const;

/**
 * ROOM_JOIN_UNANSWERED_READING: a JoinChannel never answered leaves state 19 standing, and `join_room` waits in its WHILE
 * (its `SuspendMenuInput(5.0)` lapses). The console registers the request with `FUN_002f4080(request, 0x2d)`
 * (D:L190692), not read: whether it times the request out, and what follows, is not known. [reading]
 */
export const ROOM_JOIN_UNANSWERED_READING = 'a JoinChannel never answered leaves state 19 standing; FUN_002f4080 (0x2d) not read' as const;

/**
 * GAME_LIST_LATEST_REPLY_ADAPTATION: as the room list's (research 161 §7), a game list reply is taken only for the
 * latest request, while the session stands, under the ticket it was sent with and still held -- so a reply in flight
 * across a logoff and a fresh login is dropped, not kept in the room joined again. The page's HTTP replies can return
 * out of order and after the session ends; the console's come in order on one connection. A browser adaptation of the
 * transport.
 */
export const GAME_LIST_LATEST_REPLY_ADAPTATION = 'a game list reply taken only for the latest request, under the ticket still held' as const;

/**
 * GAME_NAME_DRAWN_CUT_READING: a game's name is drawn up to its first "$~" (research 154 §7: the engine's text setter
 * `FUN_00363830` D:L261214-261243 ends the text there, and B_43 shows "test" for `test$~Channel 1`). The original puts
 * the whole name in the row (`FUN_00333610`, D:L184416) and the setter cuts it when the cell is drawn; the port's
 * LISTBOX draws a cell as given, so the row carries the cut name. [reading]
 */
export const GAME_NAME_DRAWN_CUT_READING = 'the name cut at "$~" in the row, where the original\'s text setter cuts it at the draw' as const;

/**
 * ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER (research 268 §3.4): `RefreshRoomPlayerList(CLAN_TAGS)` (S:0x3ef370; OnPlayerListStart
 * on the list's ONACTIVATE, OnPlayerListScrollEnd on its ONSCROLL_END and ON_UPDATE_UIVAR) runs `FUN_002f0ea0`
 * (D:L126143; D:L192151-192214): for each row the PLAYERLIST box shows -- from its first visible row (+0xb8) as many as
 * its height holds (+0x78 / +0xac, D:L192177-192179) -- whose tag was not yet asked (the row's +0 byte 0), PlayerInfo by
 * the row's id (D:L192200-192202), its reply (`FUN_002f10b0` D:L192219-192266) writing `[%s]` (S:0x3f4f18) of the record's
 * clan tag into the row's +0 and drawing again (D:L192249-192254), or marking the row asked, no tag (D:L192257). The
 * commands are not told which rows a box shows (a row's command is handed no widget), so this arm answers as its body
 * does (0 unless the session is up, else 1) and sends nothing: every row's tag cell is the reply's empty +0 (the request's
 * MessageID zeroed, D:L192336, and echoed), "" -- what a row with no tag draws. Settles: the box's visible rows handed to
 * the row (a shell seam) and SVC-15a's lookup asked for each. [placeholder]
 */
export const ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER = 'CLAN_TAGS sends nothing: the box\'s visible rows are not the commands\'; every tag cell ""' as const;

/**
 * ROOM_PLAYER_LIST_SESSION_ADAPTATION: a player list reply is taken only under the ticket its request was sent with --
 * one that lands after the session changed is dropped and frees the request -- and the lobby client's reset (its connect
 * and disconnect, `onReset`) frees a request out. The console's replies come in order on its one connection, and its
 * flag (`DAT_0044f9f0`) is freed by a reply alone (D:L192424, D:L192430); the page's HTTP replies can land after the
 * session ends. A request never answered (a refusal) holds the flag until that reset, as a reply that never came would
 * on the console. A browser adaptation of the transport.
 */
export const ROOM_PLAYER_LIST_SESSION_ADAPTATION = 'a list reply taken only under its ticket; the lobby\'s reset frees a request out' as const;

// ---- the service ----

export interface JoinChannelQuery { mediusWorldId: number; lobbyChannelPassword: string }
export interface WorldReply { status: number; mediusWorldId: number }
export interface GameListFilterQuery { filterField: number; comparisonOperator: number; baselineValue: number }
export type GameListQuery = { pageId: number; pageSize: number };
/**
 * One Lobby 0xeb entry, as `FUN_002e2b00` copies it (`FUN_002e1d50` / `FUN_002e1e10` D:L183873-183970): the status
 * +0x18, the world id +0x1c, the players +0x20, min +0x22, max +0x24, level +0x28, skill +0x2c, rules +0x30, GF1 +0x34,
 * GF2 +0x38, GF3 +0x3c, security +0x40, world status +0x44, host type +0x48, the name +0x4c:64, GameStats +0x8c:256 (as
 * hex), EndOfList +0x18c -- SVC-06's `/lobby/game-list` answers them by name (research 154 §1).
 */
export interface GameListEntry {
  status: number; mediusWorldId: number; playerCount: number; minPlayers: number; maxPlayers: number; gameLevel: number;
  playerSkillLevel: number; rulesSet: number; genericField1: number; genericField2: number; genericField3: number;
  securityLevel: number; worldStatus: number; gameHostType: number; gameName: string; gameStats: string; endOfList: boolean;
  /** LINK-1: the share id, when the server sent one. A product adaptation; absent on an older server and on NoResult. */
  lobbyId?: string;
  /**
   * BOTS-LAND (central's `CPU_SEAT_REPLACEABLE_ADAPTATION`): of `playerCount`, the CPU seats a joining player may take;
   * absent (read 0) with no CPUs, on NoResult and from an older server. A product adaptation.
   */
  replaceable?: number;
}
/** `MediusPlayerOnlineState` as a player list row carries it (+0x40: the status, the two world ids, the lobby's and the game's names). */
export interface RoomPlayerOnlineState { connectStatus: number; lobbyWorldId: number; gameWorldId: number; lobbyName: string; gameName: string }
/** A GetLobbyPlayerNames_ExtraInfo reply row (Lobby 0xdd, 0xd0 bytes) as `FUN_002f13f0` reads it: the status +0x18, the account +0x1c, the name +0x20, the online state +0x40, the end +0xcc. */
export interface RoomPlayerEntry { status: number; accountId: number; accountName: string; onlineState: RoomPlayerOnlineState; endOfList: boolean }

/** The page's half (research 154 §1's paths with the session's bearer): a rejection is a request never answered. */
export interface BriefingRoomService {
  joinChannel(q: JoinChannelQuery): Promise<WorldReply>;
  setGameListFilter(q: GameListFilterQuery): Promise<{ status: number; filterId: number }>;
  leaveChannel(): Promise<{ status: number }>;
  gameList(q: GameListQuery): Promise<readonly GameListEntry[]>;
  /** SVC-15: GetLobbyPlayerNames_ExtraInfo (`/lobby/room-player-list`, +0x18 the world id); absent, never answered. */
  roomPlayerList?(q: { mediusWorldId: number }): Promise<readonly RoomPlayerEntry[]>;
}

/** The lobby (0x44f370) the join stands on: ONL-07's client. */
export type RoomLobby = Pick<LobbyClient, 'up' | 'state' | 'queueState' | 'setHandler'> & Partial<Pick<LobbyClient, 'onReset'>>;

// ---- the game list's record and row ----

/** GameStats' width (the entry's +0x8c..+0x18c). */
const GAME_STATS_BYTES = 256;
/** The 'D' record's width (`FUN_002f7d90`). */
const STATS_D_BYTES = 0x28;
/** The row's cap on MAX (D:L184423-184426). */
const GAME_PLAYERS_MAX = 16;

function hexBytes(hex: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n && 2 * i + 1 < hex.length; i++) { const b = parseInt(hex.slice(2 * i, 2 * i + 2), 16); out[i] = Number.isNaN(b) ? 0 : b; }
  return out;
}

/**
 * GameStats brought up to the client's 'D' record (0x28 bytes), as `FUN_002f7d90` (D:L196759-196877) does before it
 * keeps it at the record's +0x19a: 'D' as is; 'C' gains a zero byte 7; 'B' a zero byte 6; 'A' a zero byte 5; anything
 * else is the oldest form, its bytes 0, 1, 3, 4 and 5.. made 'A' (research 154 §7, SVC-06's `gameStatsD`).
 */
export function gameStatsD(hex: string): Uint8Array {
  const up = (src: Uint8Array): Uint8Array => {
    const out = new Uint8Array(STATS_D_BYTES);
    switch (src[0]) {
      case 0x44: out.set(src.subarray(0, STATS_D_BYTES)); return out;
      case 0x43: out[0] = 0x44; out.set(src.subarray(1, 7), 1); out.set(src.subarray(7, 0x27), 8); return out;
      case 0x42: { const c = new Uint8Array(STATS_D_BYTES); c[0] = 0x43; c.set(src.subarray(1, 6), 1); c.set(src.subarray(6, 0x26), 7); return up(c); }
      case 0x41: { const b = new Uint8Array(STATS_D_BYTES); b[0] = 0x42; b.set(src.subarray(1, 5), 1); b.set(src.subarray(5, 0x25), 6); return up(b); }
      default: {
        const a = new Uint8Array(STATS_D_BYTES);
        a[0] = 0x41; a[1] = src[0]!; a[2] = src[1]!; a[3] = src[3]!; a[4] = src[4]!;
        a.set(src.subarray(5, 0x25), 5);
        return up(a);
      }
    }
  };
  return up(hexBytes(hex, GAME_STATS_BYTES));
}

/** A name up to its first "$~" (`GAME_NAME_DRAWN_CUT_READING`). */
export function drawnGameName(name: string): string {
  const cut = name.indexOf('$~');
  return cut < 0 ? name : name.slice(0, cut);
}

/** A game record (0x1c4 bytes, `FUN_00180e10(0x1c4)` D:L184353): the entry, its 'D' record (+0x19a) and the stale mark (+0x198). */
interface GameRecord { e: GameListEntry; d: Uint8Array; stale: boolean }

/** `FUN_002e1d50` / `FUN_002e1e10` with `FUN_002f7d90`: the entry kept, its 'D' record, GameLevel from byte 8 when it is 0 (`FUN_002e1e00`, D:L184368-184370). */
function keep(e: GameListEntry): GameRecord {
  const d = gameStatsD(e.gameStats);
  return { e: { ...e, gameLevel: e.gameLevel !== 0 ? e.gameLevel : d[8]! }, d, stale: false };
}

/** The cells `FUN_002e2ce0` (D:L184391-184506) builds for one record: [name, IN, MAX, SPEC, SPEC MAX, ping, pass, clan, then the rank icons]. */
function rowCells(r: GameRecord): (string | number)[] {
  const e = r.e, d = r.d;
  const players = e.playerCount & 0xffff;
  let spec = Math.min(players, d[3]!);                                                  // D:L184418-184422
  const max = Math.min((e.maxPlayers & 0xffff) - d[4]!, GAME_PLAYERS_MAX);              // D:L184423-184426
  const inPlayers = Math.min(players - spec, max);                                      // D:L184427-184432
  const out: (string | number)[] = [drawnGameName(e.gameName), inPlayers, max];
  spec = Math.min(spec, d[4]!);                                                         // D:L184433-184437
  out.push(spec, d[4]!);
  out.push(players === 0 ? 0 : e.genericField2 < 300 ? 1 : e.genericField2 < 600 ? 2 : 3);   // D:L184438-184452
  out.push((e.securityLevel & 1) === 0 ? 1 : 0);                                        // D:L184453-184458
  out.push(e.genericField3 === 0 ? 1 : 0);                                              // D:L184459-184464
  const ranks = d[7]!;
  for (const [bit, icon] of [[1, 1], [2, 2], [4, 3], [8, 4]] as const) if (ranks === 0 || (ranks & bit) !== 0) out.push(icon);   // D:L184465-184492
  return out;
}

/** One entry's row as `FUN_002e2ce0` draws it (GameStats brought up to 'D' first). */
export function gameListRow(e: GameListEntry): (string | number)[] { return rowCells(keep(e)); }

// ---- the room's player list (SVC-15) ----

/** A row of the room's record's player list (0xd0 bytes at +0x84, the count +0x80): the reply's row kept whole, its +0 the tag cell's text. */
interface RoomPlayerRecord { accountId: number; accountName: string; online: RoomPlayerOnlineState; tag: string }

const strCell = (value: string): UiVarValue => ({ type: 'string', value });
/** A keyed cell (`LADDER_KEYED_CELL_READING`, `./ladderLobbyCommands`: built flat, `VALUE` the text, `COLOR` the three floats). */
const keyedCell = (text: string, rgb: readonly number[]): UiVarValue => ({
  type: 'array', value: [strCell('VALUE'), strCell(text), strCell('COLOR'), { type: 'array', value: rgb.map((value) => ({ type: 'real' as const, value })) }],
});

/**
 * One row as `FUN_002f1670` draws it (D:L192481-192514): `"%d"` (S:0x3f4cc0) of the account, the name, then by the state
 * -- 3 the game's name (drawn to its "$~", `GAME_NAME_DRAWN_CUT_READING`), 2 "In Lobby" (S:0x3f4da0) keyed in
 * `ROOM_PLAYER_IN_LOBBY_COLOR`, 1 "Logging In" (S:0x3f4d88), 0 "Disconnecting" (S:0x3f4d78), any other no cell -- and
 * the tag cell keyed in `ROOM_PLAYER_TAG_COLOR`: "" (S:0x3f4cb8) for a row asked with no tag (+0 is 1), else the row's +0.
 */
function roomPlayerRow(p: RoomPlayerRecord): UiVarValue {
  const cells: UiVarValue[] = [strCell(String(p.accountId | 0)), strCell(p.accountName)];
  const s = p.online.connectStatus;
  if (s === 3) cells.push(strCell(drawnGameName(p.online.gameName)));
  else if (s === 2) cells.push(keyedCell('In Lobby', ROOM_PLAYER_IN_LOBBY_COLOR));
  else if (s === 1) cells.push(strCell('Logging In'));
  else if (s === 0) cells.push(strCell('Disconnecting'));
  cells.push(keyedCell(p.tag, ROOM_PLAYER_TAG_COLOR));
  return { type: 'array', value: cells };
}

// ---- GAME DETAILS (`FUN_002e1f20`, research 154 §7.1) ----

/** The type words GAME DETAILS draws (`FUN_002e1f20` D:L184050-184068: S:0x3f3b78, 0x3f3b48, 0x3f3b80, 0x3f3b58, 0x3f3b68); any other type "UNKNOWN" (S:0x3f3b88). */
export const GAME_DETAILS_TYPE_WORDS: Readonly<Record<number, string>> = { 1: 'BREACH', 2: 'DEMOLITION', 3: 'ESCORT', 4: 'EXTRACTION', 5: 'SUPPRESSION' };
/** The EQlimit line's words ('D'[5], `FUN_002e1f20` D:L184087-184099: S:0x3f3bd0, 0x3f3be0, 0x3f3bf0); 0 draws no line, any other value an empty one. */
export const GAME_DETAILS_EQUIPMENT_WORDS: Readonly<Record<number, string>> = { 1: 'PISTOLS ONLY', 2: 'SHOTGUNS ONLY', 3: 'SNIPERS ONLY' };
/** The play list's bound (`FUN_002e1f20` D:L184010-184013: 0x20 bytes from the record's +0x1a2, ending at a 0). */
const PLAY_LIST_BYTES = 0x20;

/** What GAME DETAILS reads off the mission table (`missionlist.rdr`, the disc's): null without one. */
export interface GameDetailsMission {
  /** MISSION_AVAILABLE (S:0x3f3b20): every play-list byte a multiplayer mission of the table (`FUN_002c9040(.., 1)`). */
  available: boolean;
  /** The record's GameLevel's NAME (`FUN_002c8ae0(.., 1)`, "unknown" S:0x3f2e10 when none); null when unavailable. */
  mapName: string | null;
  /** MEDLEY (S:0x3f3b40) when the play list's types differ, else GameLevel's type word; null when unavailable. */
  typeWord: string | null;
  /** GAME_INFO_DETAILS' caption as `FUN_002e1f20` builds it, or "UNAVAILABLE" (S:0x3f3c20). */
  text: string;
}

/** A listed game's settings as GAME DETAILS reads them from the record. */
export interface GameDetails {
  /** ROUND COUNT ('D'[1], the record's +0x19b). */
  rounds: number;
  /** ROUND TIME ('D'[2], +0x19c): minutes (`FUN_002f83b0` writes it x 60 into `mp_max_round_time`). */
  roundMinutes: number;
  /** FRIENDLY FIRE: RulesSet bit 0 (+0x30, D:L184079). */
  friendlyFire: boolean;
  /** RESPAWN: RulesSet bit 1 (D:L184083). */
  respawn: boolean;
  /** EQlimit ('D'[5], +0x19f) and its word, null for none. */
  equipment: number;
  equipmentWord: string | null;
  /** `game_info_rank_restrictions` ('D'[7], +0x1a1, D:L184100-184112). */
  rankRestrictions: number;
  /** The play list ('D'[8..], +0x1a2: the record's accessor `0x2e24c0`, `addiu v0, a0, 0x1a2`), up to its first 0. */
  playList: number[];
  mission: GameDetailsMission | null;
}

/** `FUN_002c9040` / `FUN_002c8ae0` / `FUN_002c8b80`: the table's first record of `number` with MULTIPLAYER (its +0xc, 1). */
const mpMission = (missions: readonly MissionRecord[], number: number): MissionRecord | undefined =>
  missions.find((m) => m.multiplayer && m.number === number);

/**
 * GAME DETAILS of a listed game, as `FUN_002e1f20` (D:L183973-184130) draws the record's 'D' GameStats (research 154
 * R154.5, §7.1): with the mission table, the availability check, the map's name, the type word or MEDLEY and the
 * caption line by line; without one (`missions` null) the settings only. The record is `keep`'s (GameLevel from 'D'[8]
 * when 0). The list path of `GetGameInfo` (ONL-12) and the modern lobby's reader (MU-13d).
 */
export function gameDetails(e: GameListEntry, missions: readonly MissionRecord[] | null): GameDetails {
  const r = keep(e), d = r.d;
  const playList: number[] = [];
  for (let i = 0; i < PLAY_LIST_BYTES && d[8 + i] !== 0; i++) playList.push(d[8 + i]!);
  const out: GameDetails = {
    rounds: d[1]!, roundMinutes: d[2]!, friendlyFire: (e.rulesSet & 1) !== 0, respawn: (e.rulesSet & 2) !== 0,
    equipment: d[5]!, equipmentWord: GAME_DETAILS_EQUIPMENT_WORDS[d[5]!] ?? null, rankRestrictions: d[7]!, playList, mission: null,
  };
  if (missions === null) return out;
  if (!playList.every((n) => mpMission(missions, n) !== undefined)) {                       // D:L184010-184021
    out.mission = { available: false, mapName: null, typeWord: null, text: 'UNAVAILABLE' };  // D:L184114-184121
    return out;
  }
  const level = r.e.gameLevel;
  const typeOf = (n: number): number => mpMission(missions, n)?.type ?? 0;                  // FUN_002c8b80
  const mapName = mpMission(missions, level)?.name ?? 'unknown';                            // D:L184030
  const first = typeOf(d[8]!);
  const medley = playList.slice(1).some((n) => typeOf(n) !== first);                        // D:L184034-184045
  const typeWord = medley ? 'MEDLEY' : GAME_DETAILS_TYPE_WORDS[typeOf(level)] ?? 'UNKNOWN';  // D:L184046-184069
  let text = `${mapName}\n${typeWord}\nROUND COUNT:${d[1]!}\nROUND TIME:${d[2]!}\n`;        // D:L184031-184078
  if (out.friendlyFire) text += 'FRIENDLY FIRE\n';                                          // D:L184079-184082
  if (out.respawn) text += 'RESPAWN\n';                                                     // D:L184083-184086
  if (d[5] !== 0) text += `${out.equipmentWord ?? ''}\n`;                                   // D:L184087-184099
  out.mission = { available: true, mapName, typeWord, text };
  return out;
}

// ---- GAME DETAILS through `GetGameInfo` (`FUN_00279d50`, research 154 §7.1) ----

/** GAME_INFO_DETAILS (S:0x3f3b00): both builders add it TEMPORARY (`FUN_003857c0(.., 0, 1)`, D:L183993, D:L184150), GameInfoText's variable. */
export const GAME_INFO_DETAILS_VAR = 'GAME_INFO_DETAILS';
/** MISSION_AVAILABLE (S:0x3f3b20): acquired TEMP by the list path (`FUN_00351ff0(.., 2)`, D:L183995), 1 or 0 by the check (D:L184024-184029, D:L184114-184119). */
export const MISSION_AVAILABLE_VALVE = 'MISSION_AVAILABLE';
/** game_info_rank_restrictions (S:0x3f3c00): acquired TEMP and set to 'D'[7] by the list path when available (D:L184100-184112). */
export const GAME_INFO_RANK_RESTRICTIONS_VALVE = 'game_info_rank_restrictions';
/** `FUN_00279d50`'s two names (S:0x3eede8 compared without case, `FUN_00198b80` D:L124161; S:0x3ee898 compared exactly, `FUN_00198f18` D:L124157). */
const CURRENT_GAME = 'CurrentGame';
/** TEMPORARY (`FUN_003857c0(.., 0, 1)`). */
const TEMPORARY = 1;

/**
 * What `GetGameInfo('CurrentGame')` reads of the lobby besides the valves: the play list held at lobby +0x84..+0xa4
 * (`FUN_002f82e0` D:L197073-197098 copies its 0x20 bytes; the join writes it from the record's 'D'[8..],
 * `FUN_002f83b0` D:L197313-197325, and the create from its list, `FUN_002f8270` D:L197045-197070) and the current
 * mission's name at 0x414e00 (`FUN_0027f800` D:L127147-127153; written "mp%d" (S:0x3f59b8) by `FUN_0027f810`, D:L197344-197345).
 * The page holds both on the game lobby's held game (`GameLobbyCommands.currentGame`).
 */
export interface CurrentGameHeld {
  /** Lobby +0x84: up to 0x20 mission numbers; past the list, zeros. */
  playList: readonly number[];
  /** 0x414e00: the current mission ("mp<n>"), '' for none. */
  mission: string;
}

/**
 * `FUN_002c8a00` (D:L168442-168471): the mission's type by its name -- a name longer than two characters, its number
 * read past the first two (`FUN_00191490`, atoi), the table's first MULTIPLAYER record of it; else 0.
 */
function missionTypeByName(missions: readonly MissionRecord[], name: string): number {
  if (name.length <= 2) return 0;
  const n = Number.parseInt(name.slice(2), 10);
  return mpMission(missions, Number.isNaN(n) ? 0 : n)?.type ?? 0;
}

/**
 * GAME DETAILS of the player's own game, as `FUN_002e24d0` (D:L184131-184228) builds it from the valves, each part
 * ended by "\n" (S:0x3f3b38), no map line:
 * - the type word: MEDLEY (S:0x3f3b40) when any held play-list entry from the second on, up to its first 0, has a
 *   type (`FUN_002c8b80`) other than the first entry's (D:L184155-184167); else the current mission's type
 *   (`FUN_0027f800`, `FUN_002c8a00`, D:L184169-184170) -- BREACH, DEMOLITION, ESCORT, EXTRACTION, SUPPRESSION, any
 *   other UNKNOWN (D:L184171-184188, the list path's words);
 * - "ROUND COUNT:" (S:0x3f3b90) and `mp_max_rounds` (S:0x3f3c30) by "%d" (S:0x3f3ba0; the u16, `lhu` at 0x2e26d8 read
 *   off the ELF), D:L184191-184195;
 * - "ROUND TIME:" (S:0x3f3ba8) and `mp_max_round_time` (S:0x3f3c40) / 60, truncated, by "%d min." (S:0x3f3c58),
 *   D:L184196-184200;
 * - FRIENDLY FIRE (S:0x3f3bb8) when `mp_friendly_fire` (S:0x3f3c60) is not 0, D:L184201-184205;
 * - RESPAWN (S:0x3f3bc8) when `mp_allow_respawn` (S:0x3f3c80) is not 0, D:L184206-184210;
 * - for an `EQlimit` (S:0x3f3c98) other than 0, PISTOLS ONLY, SHOTGUNS ONLY or SNIPERS ONLY for 1, 2, 3 -- any other
 *   value the line's ending alone (D:L184211-184225).
 * The valves are acquired PERM (`FUN_00351ff0(.., 1)`). `held` null: the lobby's play list as its constructor leaves
 * it, zeros (`FUN_002e0710` D:L182874-182885), and no mission.
 */
export function currentGameDetails(valves: ValveStore, held: CurrentGameHeld | null, missions: readonly MissionRecord[]): string {
  const v = (name: string): number => valves.acquire(name, VALVE_TYPE.PERM).value;
  const list = held?.playList ?? [];
  const at = (i: number): number => list[i] ?? 0;
  const typeOf = (n: number): number => mpMission(missions, n)?.type ?? 0;      // FUN_002c8b80
  const first = typeOf(at(0));
  let medley = false;
  for (let i = 1; i < PLAY_LIST_BYTES && at(i) !== 0; i++) if (typeOf(at(i)) !== first) medley = true;
  let text = medley ? 'MEDLEY' : GAME_DETAILS_TYPE_WORDS[missionTypeByName(missions, held?.mission ?? '')] ?? 'UNKNOWN';
  text += `\nROUND COUNT:${v('mp_max_rounds')}\n`;
  text += `ROUND TIME:${Math.trunc(v('mp_max_round_time') / 60)} min.\n`;
  if (v('mp_friendly_fire') !== 0) text += 'FRIENDLY FIRE\n';
  if (v('mp_allow_respawn') !== 0) text += 'RESPAWN\n';
  const eq = v('EQlimit');
  if (eq !== 0) text += `${GAME_DETAILS_EQUIPMENT_WORDS[eq] ?? ''}\n`;
  return text;
}

/** The six filter valves `FUN_002e2920` reads before each request (D:L184278-184289). */
interface GameListFilters { type: number; players: number; speed: number; password: number; ff: number; locked: number }

/**
 * `FUN_002e3080` (D:L184509-184546): the client's filters over one record -- the game type by its play list
 * (`FUN_002e31e0`, `gameTypePasses`, ONL-15: research 265 §2).
 */
function passes(r: GameRecord, f: GameListFilters, missions: readonly MissionRecord[]): boolean {
  const e = r.e;
  const sec = e.securityLevel >>> 0;
  if (sec !== 0xffffffff && f.password !== 2) {
    const locked = sec & 1;
    if (locked !== 0 && f.password === 0) return false;
    if (locked === 0 && f.password === 1) return false;
  }
  if (!gameTypePasses(f.type, playListOf(r.d), missions)) return false;              // FUN_002e31e0 (D:L184527-184530)
  if (f.players > (e.playerCount & 0xffff)) return false;
  if (e.genericField2 > f.speed) return false;
  if (f.ff !== 2 && (f.ff === 1) !== ((e.rulesSet & 1) !== 0)) return false;
  if (f.locked === 2) return true;
  return (f.locked !== 0 || e.worldStatus === 3) && e.worldStatus !== 3;
}

/** `FUN_00198b80` (strcasecmp): the bytes compared with A-Z folded to a-z. */
function caseless(a: string, b: string): number {
  const x = a.replace(/[A-Z]/g, (c) => c.toLowerCase()), y = b.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return x < y ? -1 : x > y ? 1 : 0;
}

export interface BriefingRoomCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The valve registry (0x49e800). */
  valves: () => ValveStore;
  /** ONL-07's lobby client; absent, the session's flag is clear: nothing is joined or asked. */
  lobby?: RoomLobby | null;
  /** The page's half; absent, every request is never answered. */
  service?: BriefingRoomService;
  /** The client's rooms (0x44f568), ONL-11's records (`WorldOfSocomCommands.rooms()`). */
  rooms: () => readonly ChannelListEntry[];
  /** The running animation's input string (`FUN_00272480`): a row's INPUT_STRING. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** `DAT_0044f3c8(name, argument)`: a named event into the built dialog with its text. */
  event?: (kind: number, text: string | null) => void;
  /** `FUN_00197740` / 2^31, for JoinMPRoom(RANDOM); absent, `Math.random`. */
  random?: () => number;
  /** The session's ticket (ONL-07's seam), for `GAME_LIST_LATEST_REPLY_ADAPTATION`: a reply is dropped when it changed or is gone; absent, not checked. */
  ticket?: () => string | null;
  /** `missionlist.rdr`'s records (the mission table 0x441650): the game-type filter's types (ONL-15); absent, none. */
  missions?: () => readonly MissionRecord[];
  /** A row called, as it happens. */
  log?: (name: BriefingRoomCommandName, arg: string, answer: boolean) => void;
  /** ONL-23's chat (`BriefingRoomChat`): the room's lines drawn at the join's success (`FUN_002efc80` D:L191662-191664); absent, none. */
  chat?: Pick<BriefingRoomChat, 'drawRoom'>;
  /** SVC-15: the page's clock, ms, for the player list's period (`ROOM_PLAYER_LIST_PERIOD_S`); absent, `performance.now`. */
  now?: () => number;
  /** `GetGameInfo('CurrentGame')`: the game lobby's held game (`GameLobbyCommands.currentGame`); absent or null, none (`currentGameDetails`). */
  currentGame?: () => CurrentGameHeld | null;
  /**
   * GAME-PING (product track, a browser adaptation; Craig's "go", 2026-10-31/11-01): the drawn row's PING cell for a game
   * with players, by the room's name and the entry -- the page's measured band (viewer `gamePing.ts`) in place of
   * GenericField2's (65000 from every SOCOM II host, so the red dot: `FUN_002ef590` D:L191395, research 343 R343.6).
   * Undefined keeps the original's band; a game with no players is never asked (its 0 stands). The entries kept, the
   * filter (`passes`, GenericField2 against GameSpeedFilter) and the wire are the original's. Absent, the original.
   */
  gamePing?: (room: string, e: GameListEntry) => number | undefined;
}

/** The lobby's JoinGame state (`FUN_002ed460`'s slot +0x3c, `FUN_002eda60`): AUTOPLAY's room join goes on to it (`FUN_002efc80` D:L191648-191650). */
const LOBBY_STATE_JOIN_GAME = 0x0f;

export class BriefingRoomCommands {
  /** `DAT_0066a538`: the world id of the room being joined, -1 for none. */
  private worldId = -1;
  /** Each room record's games (the record's list at +4 / +8): keyed by the record itself, so a room list refresh, which frees the records, frees them. */
  private readonly games = new WeakMap<ChannelListEntry, GameRecord[]>();
  /** The filters read at the latest request (`DAT_0044f528` .. `DAT_0044f550`). */
  private filters: GameListFilters = { type: 0, players: 0, speed: 0, password: 2, ff: 2, locked: 2 };
  /** `DAT_0066a5e8`: AUTOPLAY's room join pending -- its JoinChannel's success goes on to the game's join (ONL-15). */
  private randomJoin = false;
  private gameListSeq = 0;
  private joinSeq = 0;
  /** The last `/lobby/leave-channel` sent, settled either way: a join waits for it (`ROOM_LEAVE_ADAPTATION`). */
  private leaving: Promise<void> = Promise.resolve();
  /** SVC-15: each room record's players (the record's vector at +0x7c..+0x84), keyed by the record as `games`. */
  private readonly players = new WeakMap<ChannelListEntry, RoomPlayerRecord[]>();
  /** `DAT_0044f9f0`: a player list request out; `DAT_0044f9f8`: the clock (ms) before which none is sent. */
  private playersOut = false;
  private playersNext = 0;
  /** Bumped at the lobby's reset: a reply of an earlier session frees nothing (`ROOM_PLAYER_LIST_SESSION_ADAPTATION`). */
  private playersSeq = 0;
  /** GAME-PING (a browser adaptation): the rows GAMELISTVAR last held, for `redrawGameList` (0: nothing to redraw). */
  private drawnRows = 0;

  constructor(private readonly o: BriefingRoomCommandsOptions) {}

  /** `DAT_0066a538`: the room joined's world id, -1 for none (CREATE GAME's GF1 and its room check, ONL-13; the host's report, ONL-16a). */
  roomWorldId(): number { return this.worldId; }

  private answer(name: BriefingRoomCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** `FUN_0026ed60` with `FUN_00272480`: the argument, or the running animation's input string for INPUT_STRING. */
  private argument(cmd: ZAnimUiCommand): string | null {
    if (cmd.arg === INPUT_STRING) return this.o.inputString?.(cmd) ?? null;
    return cmd.arg === '' ? null : cmd.arg;
  }

  private up(): boolean { return this.o.lobby?.up ?? false; }
  private online(): boolean { return this.up() && this.o.lobby!.state() === LOBBY_STATE_LOGGED_IN; }
  private record(name: string | null): ChannelListEntry | undefined {
    return name === null ? undefined : this.o.rooms().find((r) => r.lobbyName === name);   // strcmp over the records (D:L184695-184703)
  }
  private post(event: string, text: string | null = null): void { this.o.event?.(DIALOG_EVENTS[event]!, text); }

  /** The room being joined or stood in: MEDIUS_LOBBY_NAME's text when it holds one (`*DAT_0044f430 == 3`). */
  private lobbyName(): string | null {
    const v = this.o.uiVars.find(MEDIUS_LOBBY_NAME_VAR)?.value;
    return v?.type === 'string' ? v.value : null;
  }

  /** `FUN_0027d690` (D:L126002-126020) -> `FUN_002e34e0` (D:L184681-184712): the room found, 1 (the page holds no tier: PLAYER_TIER_PARKED_READING, `./gameLobbyCommands`; the services judge the rank, SVC-14); not found, 0. */
  CanJoinRoom: UiCommandHandler = (cmd) => this.answer('CanJoinRoom', cmd, this.record(this.argument(cmd)) !== undefined);

  /**
   * 0x27d270 -> `FUN_002e3790` (D:L184759-184849): 0 unless the session is up in state 11; NONE answers 1 at once
   * (`ROOM_LEAVE_ADAPTATION`); RANDOM takes the record (count - 1) x the draw; a name its record. A record found: its
   * world id kept and `room_rank_bits` set to its four bits (written through the watchers); then the name into
   * MEDIUS_LOBBY_NAME and state 19 queued -- 20 with no world id. 1.
   */
  JoinMPRoom: UiCommandHandler = (cmd) => this.answer('JoinMPRoom', cmd, this.joinRoom(this.argument(cmd)));

  /** `FUN_002e3790`'s body for a name (or RANDOM, NONE, none). */
  private joinRoom(arg: string | null): boolean {
    const lobby = this.o.lobby;
    if (!lobby || !this.online()) return false;
    let name = arg;
    this.worldId = -1;
    let found: ChannelListEntry | undefined;
    if (name === RANDOM) {
      const rooms = this.o.rooms();
      if (rooms.length > 0) {
        found = rooms[Math.trunc((rooms.length - 1) * (this.o.random ?? Math.random)())];   // D:L184779-184786: FUN_00197740() / 2.1474836e+09
        name = found?.lobbyName ?? name;
      }
    } else if (name === NONE) {
      this.leave();
      return true;
    } else {
      found = this.record(name);
    }
    if (found) {
      this.worldId = found.mediusWorldId;
      const valves = this.o.valves();
      valves.acquire(ROOM_RANK_BITS_VALVE, VALVE_TYPE.PERM);
      valves.set(ROOM_RANK_BITS_VALVE, found.genericField1 & 0xf, VALVE_TYPE.PERM);
    }
    const vars = this.o.uiVars;
    vars.set(vars.add(MEDIUS_LOBBY_NAME_VAR, null, 2), { type: 'string', value: name ?? '' });   // FUN_003862a0 (D:L184838)
    lobby.queueState(this.worldId < 0 ? LOBBY_STATE_CREATE_CHANNEL : LOBBY_STATE_JOIN_CHANNEL);   // D:L184839-184845
    return true;
  }

  /** `ROOM_LEAVE_ADAPTATION`: the server told the room is left; the row does not wait, the next join does. */
  private leave(): void {
    const svc = this.o.service;
    if (!svc) return;
    const before = this.leaving;
    this.leaving = before.then(() => svc.leaveChannel()).then(() => {}, () => { /* never answered */ });
  }

  /**
   * State 19's entry (`FUN_002ee290` D:L190668-190701): GAMELISTVAR set to an empty array, JoinChannel sent with the kept
   * world id and the empty password. Its reply (`FUN_002ee3a0` D:L190704-190776): a refusal queues state 11 and posts
   * MP_MEDIUS_JOIN_ROOM_FAILURE with `JOIN_ROOM_FAILURE_TEXT`; a success goes on as `ROOM_JOIN_NO_SECOND_SERVER_ADAPTATION`.
   */
  private joinChannel(): void {
    const vars = this.o.uiVars;
    vars.set(vars.add(GAME_LIST_VAR, null, 1), { type: 'array', value: [] });
    this.drawnRows = 0;
    const svc = this.o.service, lobby = this.o.lobby;
    if (!svc || !lobby) return;
    const seq = ++this.joinSeq, worldId = this.worldId;
    this.leaving.then(() => svc.joinChannel({ mediusWorldId: worldId, lobbyChannelPassword: ROOM_PASSWORD })).then((r) => {   // after a leave in flight (ROOM_LEAVE_ADAPTATION)
      if (seq !== this.joinSeq || !lobby.up || lobby.state() !== LOBBY_STATE_JOIN_CHANNEL) return;
      if (r.status !== 0) { lobby.queueState(LOBBY_STATE_LOGGED_IN); this.post('MP_MEDIUS_JOIN_ROOM_FAILURE', JOIN_ROOM_FAILURE_TEXT); return; }
      if (this.randomJoin) {                                                                      // FUN_002efc80 D:L191648-191651: AUTOPLAY's
        this.randomJoin = false;
        lobby.queueState(LOBBY_STATE_JOIN_GAME);
      } else {
        lobby.queueState(LOBBY_STATE_LOGGED_IN);
        this.post('MP_JOIN_ROOM');                                                                // FUN_002efc80 D:L191641-191646
      }
      svc.setGameListFilter({ ...LOBBY_WORLD_FILTER }).catch(() => { /* the reply is not read (0x2efe10) */ });
      this.o.chat?.drawRoom();                                                                    // FUN_002efc80 D:L191662-191664: FUN_002f5020
    }, () => { /* never answered: ROOM_JOIN_UNANSWERED_READING */ });
  }

  // ---- AUTOPLAY's half (ONL-15, `./autoplayCommands`; research 265 §2) ----

  /**
   * `FUN_002f8ed0` (D:L197569-197578): GameTypeFilter, GamePlayerFilter, GameSpeedFilter, FF_FILTER and LockedFilter
   * read into the list's globals; GamePasswordFilter's keeps the value of the last list asked.
   */
  readAutoplayFilters(): void {
    const v = (n: string): number => this.o.valves().acquire(n, VALVE_TYPE.PERM).value;
    this.filters = { ...this.filters, type: v('GameTypeFilter'), players: v('GamePlayerFilter'), speed: v('GameSpeedFilter'), ff: v('FF_FILTER'), locked: v('LockedFilter') };
  }

  /** `FUN_002e3080` over the record `FUN_002e1d50` makes of the entry, at the filters held. */
  admits(e: GameListEntry): boolean { return passes(keep(e), this.filters, this.o.missions?.() ?? []); }

  /** GamePlayerFilter as the globals hold it (`DAT_0044f530`). */
  playerFilter(): number { return this.filters.players; }

  /**
   * `FUN_002f9220`'s join (D:L197706-197710): the random-join flag (`DAT_0066a5e8`) set and `FUN_002e3790` with the
   * room's name -- `JoinMPRoom`'s body, 1 when state 19 was queued. The flag stays set after a refused JoinChannel, as
   * the console's does until state 15 or the lobby's own resets clear it (D:L190399; the close `FUN_002df650`
   * D:L182182, the lists' reset `FUN_002df8e0` D:L182283, the init `FUN_002e0450` D:L182778): here the lobby client's
   * `onReset` at its connect and disconnect, and state 15's queueing.
   */
  joinRoomForRandomGame(name: string): boolean {
    this.randomJoin = true;
    return this.joinRoom(name);
  }

  /** State 20's entry (`FUN_002ed740`): `CREATE_CHANNEL_STATE_READING`. */
  private createChannel(): void { /* no kept record lacks a world id: nothing is sent */ }

  /**
   * `FUN_0027db40` (D:L126173-126210) -> `FUN_002e28d0` (D:L184233-184252): 0 unless the session is up; then
   * `FUN_002e2920` and 1. The row's own body is void: the answer is the call's, left in the register.
   */
  RefreshGameList: UiCommandHandler = (cmd) => {
    if (!this.up()) return this.answer('RefreshGameList', cmd, false);
    this.requestGameList();
    return this.answer('RefreshGameList', cmd, true);
  };

  /**
   * `FUN_002e2920` (D:L184255-184315): the room's record by MEDIUS_LOBBY_NAME; its games with no player dropped
   * (`FUN_002e4700`); the six filters read; its games still stale since the last request dropped and the rest marked
   * stale (`FUN_002e4630`, D:L184297-184308); GameList_ExtraInfo0 sent (`GAME_LIST_QUERY`, the callback `FUN_002e2b00`).
   */
  private requestGameList(): void {
    const room = this.record(this.lobbyName());
    if (room) this.games.set(room, (this.games.get(room) ?? []).filter((g) => (g.e.playerCount & 0xffff) !== 0));
    const v = (n: string): number => this.o.valves().acquire(n, VALVE_TYPE.PERM).value;
    this.filters = { type: v('GameTypeFilter'), players: v('GamePlayerFilter'), speed: v('GameSpeedFilter'), password: v('GamePasswordFilter'), ff: v('FF_FILTER'), locked: v('LockedFilter') };
    if (room) {
      const held = (this.games.get(room) ?? []).filter((g) => !g.stale);
      for (const g of held) g.stale = true;
      this.games.set(room, held);
    }
    const seq = ++this.gameListSeq;
    const ticket = this.o.ticket?.() ?? null;
    const current = (): boolean => seq === this.gameListSeq && this.up()
      && (this.o.ticket === undefined || (ticket !== null && this.o.ticket() === ticket));   // GAME_LIST_LATEST_REPLY_ADAPTATION
    this.o.service?.gameList({ ...GAME_LIST_QUERY }).then((entries) => { if (current()) this.gameListReply(entries); }, () => { /* never answered */ });
  }

  /**
   * `FUN_002e2b00` (D:L184318-184388), each entry in turn: a non-success draws what is held; a success with a world id
   * from 0 updates the room's game of that name (`FUN_002e4570`, strcmp at +0x4c) or adds one, unmarked; EndOfList
   * draws. A reply for a room no record holds keeps nothing.
   */
  gameListReply(entries: readonly GameListEntry[]): void {
    for (const e of entries) {
      const room = this.record(this.lobbyName());
      if (e.status !== 0) { if (room) this.drawGames(room); continue; }
      if (e.mediusWorldId >= 0 && room) {
        const list = this.games.get(room) ?? [];
        const i = list.findIndex((g) => g.e.gameName === e.gameName);
        if (i < 0) list.push(keep(e)); else list[i] = keep(e);
        this.games.set(room, list);
      }
      if (e.endOfList && room) this.drawGames(room);
    }
  }

  /** The room's games now held, in their order. */
  gamesHeld(): readonly GameListEntry[] {
    const room = this.record(this.lobbyName());
    return room ? (this.games.get(room) ?? []).map((g) => g.e) : [];
  }

  /**
   * `FUN_002e2ce0` (D:L184391-184506): with GAMELISTVAR held, the room's games sorted in place (`FUN_002e4a90`:
   * GameStats byte 6, then the name without case, `FUN_002e5d90`), a row for each whose security is not -1 and that the
   * filters pass (`FUN_002e3080`), the whole set into GAMELISTVAR (`FUN_00386460`, D:L184500).
   */
  private drawGames(room: ChannelListEntry): void {
    const vars = this.o.uiVars;
    const v = vars.find(GAME_LIST_VAR);
    if (!v) return;
    const list = this.games.get(room) ?? [];
    list.sort((a, b) => (a.d[6]! - b.d[6]!) || caseless(a.e.gameName, b.e.gameName));
    const missions = this.o.missions?.() ?? [];
    const rows: UiVarValue[] = list.filter((g) => (g.e.securityLevel >>> 0) !== 0xffffffff && passes(g, this.filters, missions))
      .map((g) => ({ type: 'array', value: this.drawnCells(room, g).map((c): UiVarValue => (typeof c === 'string' ? { type: 'string', value: c } : { type: 'int', value: c })) }));
    vars.set(v, { type: 'array', value: rows });
    this.drawnRows = rows.length;
  }

  /** `rowCells`, its PING cell the page's measured band when `gamePing` answers one (GAME-PING, a browser adaptation). */
  private drawnCells(room: ChannelListEntry, g: GameRecord): (string | number)[] {
    const cells = rowCells(g);
    if (this.o.gamePing && (g.e.playerCount & 0xffff) !== 0) {
      const band = this.o.gamePing(room.lobbyName, g.e);
      if (band !== undefined) cells[5] = band;
    }
    return cells;
  }

  /**
   * GAME-PING (a browser adaptation): the joined room's held games drawn again (a measured ping's band changed); nothing
   * sent. Never onto a list last drawn empty: setting GAMELISTVAR runs its OnGameListUpdateUIVar, and an empty list there
   * may run OnBriefingRoomstart a second time, which the original never does (the review's F2).
   */
  redrawGameList(): void {
    if (this.drawnRows === 0) return;
    const room = this.record(this.lobbyName());
    if (room) this.drawGames(room);
  }

  // ---- the room's PLAYER LIST (SVC-15; research 268 §3) ----

  private now(): number { return this.o.now?.() ?? performance.now(); }

  /**
   * `FUN_0027d900` (D:L126105-126146): the argument (INPUT_STRING the running animation's, D:L126116-126118); none, or
   * any but CLAN_TAGS (`FUN_00198b80`, D:L126119), `FUN_002f11f0` (D:L192271-192290: 0 unless the session's +0x7d, else
   * `FUN_002f1240` and 1); CLAN_TAGS, `FUN_002f0ea0` (`ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER`: 0 unless up, else 1, nothing
   * sent). The row's own body is void: the answer is the call's, left in the register (as `RefreshGameList`'s).
   */
  RefreshRoomPlayerList: UiCommandHandler = (cmd) => {
    if (!this.up()) return this.answer('RefreshRoomPlayerList', cmd, false);
    const arg = this.argument(cmd);
    if (arg === null || caseless(arg, CLAN_TAGS) !== 0) this.askPlayerList();
    return this.answer('RefreshRoomPlayerList', cmd, true);
  };

  /**
   * `FUN_002f1240` (D:L192307-192340): only with no request out and the period passed -- the next no sooner than
   * `ROOM_PLAYER_LIST_PERIOD_S` on (set before the room is looked for, D:L192308); the room's record by
   * MEDIUS_LOBBY_NAME (`FUN_002e4470`, D:L192309-192313), none: nothing more; the request marked out, every held row's
   * state cleared to 0 (D:L192318-192322), ROOMPLAYERLISTVAR set to `[ROOM_PLAYER_LIST_RETRIEVING]` while it holds no row
   * (D:L192324-192335), and the request sent for the world joined (`DAT_0066a538`, D:L192337) with the callback
   * `FUN_002f13f0`.
   */
  private askPlayerList(): void {
    const now = this.now();
    if (this.playersOut || this.playersNext > now) return;
    this.playersNext = now + ROOM_PLAYER_LIST_PERIOD_S * 1000;
    const room = this.record(this.lobbyName());
    if (!room) return;
    this.playersOut = true;
    for (const p of this.players.get(room) ?? []) p.online = { ...p.online, connectStatus: 0 };
    const vars = this.o.uiVars;
    const v = vars.find(ROOM_PLAYER_LIST_VAR);
    if (v && !(v.value.type === 'array' && v.value.value.length > 0)) vars.set(v, { type: 'array', value: [strCell(ROOM_PLAYER_LIST_RETRIEVING)] });
    const seq = this.playersSeq;
    const ticket = this.o.ticket?.() ?? null;
    const held = (): boolean => this.o.ticket === undefined || (ticket !== null && this.o.ticket() === ticket);
    this.o.service?.roomPlayerList?.({ mediusWorldId: this.worldId }).then((rows) => {
      if (seq !== this.playersSeq) return;                                                  // ROOM_PLAYER_LIST_SESSION_ADAPTATION
      if (!held()) { this.playersOut = false; return; }
      for (const e of rows) this.playerListRow(e);
    }, () => { /* never answered: the request stays out until the lobby's reset */ });
  }

  /**
   * `FUN_002f13f0` (D:L192348-192437), one reply row: a status not Success draws what is held and frees the request
   * (D:L192428-192431); a Success, with the room's record found by MEDIUS_LOBBY_NAME (D:L192366-192371; none, nothing):
   * the row of its account (+0x1c, D:L192378) takes the reply's online state whole (D:L192382-192403), or the reply's row
   * is added (`FUN_002f2d90`, D:L192407-192409); at the row ending the list (+0xcc, D:L192411) every row whose state is
   * still 0 is dropped (`FUN_002f2740`, D:L192412-192422), the list drawn and the request freed (D:L192423-192424).
   */
  playerListRow(e: RoomPlayerEntry): void {
    if (e.status !== 0) { this.drawPlayers(); this.playersOut = false; return; }
    const room = this.record(this.lobbyName());
    if (!room) return;
    const list = this.players.get(room) ?? [];
    const held = list.find((p) => p.accountId === e.accountId);
    if (held) held.online = { ...e.onlineState };
    else list.push({ accountId: e.accountId, accountName: e.accountName, online: { ...e.onlineState }, tag: '' });   // +0: the reply's MessageID, empty
    this.players.set(room, list);
    if (!e.endOfList) return;
    this.players.set(room, list.filter((p) => p.online.connectStatus !== 0));
    this.drawPlayers();
    this.playersOut = false;
  }

  /**
   * `FUN_002f1670` (D:L192442-192520): the room's rows sorted by name (`FUN_002f1980` with `FUN_002f1950`, D:L192470:
   * strcmp at +0x20, ascending), each `roomPlayerRow`, the set into ROOMPLAYERLISTVAR (`FUN_00386460`, D:L192517) -- an
   * empty set when no room record is held.
   */
  private drawPlayers(): void {
    const room = this.record(this.lobbyName());
    const rows: UiVarValue[] = [];
    if (room) {
      const list = this.players.get(room) ?? [];
      list.sort((a, b) => (a.accountName < b.accountName ? -1 : a.accountName > b.accountName ? 1 : 0));
      for (const p of list) rows.push(roomPlayerRow(p));
    }
    const vars = this.o.uiVars;
    const v = vars.find(ROOM_PLAYER_LIST_VAR);
    if (v) vars.set(v, { type: 'array', value: rows });
  }

  /**
   * PLAYER INFO's BRIEFING origin (`FUN_002f0020` D:L191891-191929): the room's record by MEDIUS_LOBBY_NAME
   * (`FUN_002e4470`), the row of the reply's name in it (`FUN_002e3610` D:L184719-184735, strcmp: case kept) and its online
   * state, copied whole; none, null.
   */
  roomPlayerState(name: string): RoomPlayerOnlineState | null {
    const room = this.record(this.lobbyName());
    const p = room ? (this.players.get(room) ?? []).find((x) => x.accountName === name) : undefined;
    return p ? { ...p.online } : null;
  }

  // ---- GAME DETAILS (`GetGameInfo`; research 154 §7.1) ----

  /**
   * `FUN_00279d50` (D:L124151-124170): the argument -- INPUT_STRING the running animation's (D:L124156-124159) -- and,
   * with one, 'CurrentGame' (without case) `FUN_002e24d0`, any other name `FUN_002e1f20`; none, nothing. 1 always.
   */
  GetGameInfo: UiCommandHandler = (cmd) => {
    const arg = this.argument(cmd);
    if (arg !== null) {
      if (caseless(arg, CURRENT_GAME) === 0) this.currentGameInfo();
      else this.listedGameInfo(arg);
    }
    return true;
  };

  /** GAME_INFO_DETAILS added TEMPORARY and emptied (S:0x3f3b18, "": D:L183993-183994, D:L184150-184151). */
  private detailsVar() {
    const vars = this.o.uiVars;
    const v = vars.add(GAME_INFO_DETAILS_VAR, null, TEMPORARY);
    vars.set(v, { type: 'string', value: '' });
    return v;
  }

  /** `FUN_002e24d0` (D:L184131-184228): `currentGameDetails` over the valves and the held game, into GAME_INFO_DETAILS (`FUN_00386460`, D:L184227). */
  private currentGameInfo(): void {
    const v = this.detailsVar();
    this.o.uiVars.set(v, { type: 'string', value: currentGameDetails(this.o.valves(), this.o.currentGame?.() ?? null, this.o.missions?.() ?? []) });
  }

  /**
   * `FUN_002e1f20` (D:L183973-184130): GAME_INFO_DETAILS emptied and MISSION_AVAILABLE acquired TEMP (D:L183993-183995);
   * the joined room's record by MEDIUS_LOBBY_NAME (`FUN_002e4470`, D:L184000-184004; the LAN lobby's branch is not
   * taken, OT.R1) and its game of that name (`FUN_002e4570`, D:L184006 -- by the drawn name the row carries,
   * `GAME_JOIN_BY_DRAWN_NAME_READING`, `./gameLobbyCommands`); none, nothing more. Found: `gameDetails` over the
   * mission table -- available, MISSION_AVAILABLE 1, the caption and game_info_rank_restrictions 'D'[7] (D:L184024-184112);
   * not, MISSION_AVAILABLE 0 and "UNAVAILABLE" (D:L184113-184121) -- into GAME_INFO_DETAILS (D:L184123).
   */
  private listedGameInfo(name: string): void {
    const v = this.detailsVar();
    const valves = this.o.valves();
    valves.acquire(MISSION_AVAILABLE_VALVE, VALVE_TYPE.TEMP);
    const room = this.record(this.lobbyName());
    const g = room ? (this.games.get(room) ?? []).find((x) => drawnGameName(x.e.gameName) === name) : undefined;
    if (!g) return;
    const details = gameDetails(g.e, this.o.missions?.() ?? []);
    const m = details.mission!;
    valves.set(MISSION_AVAILABLE_VALVE, m.available ? 1 : 0, VALVE_TYPE.TEMP);
    if (m.available) {
      valves.acquire(GAME_INFO_RANK_RESTRICTIONS_VALVE, VALVE_TYPE.TEMP);
      valves.set(GAME_INFO_RANK_RESTRICTIONS_VALVE, details.rankRestrictions, VALVE_TYPE.TEMP);
    }
    this.o.uiVars.set(v, { type: 'string', value: m.text });
  }

  /** The entries by their table name. */
  entries(): Record<BriefingRoomCommandName, UiCommandHandler> {
    return { JoinMPRoom: this.JoinMPRoom, CanJoinRoom: this.CanJoinRoom, RefreshGameList: this.RefreshGameList, RefreshRoomPlayerList: this.RefreshRoomPlayerList, GetGameInfo: this.GetGameInfo };
  }

  /** Each row's body set in PLAT-08's host, the gate, and the lobby's states 19 and 20 (`FUN_002ed460`'s slots +0x4c, +0x50). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
    this.o.lobby?.setHandler(LOBBY_STATE_JOIN_CHANNEL, (phase) => { if (phase === 1) this.joinChannel(); });
    this.o.lobby?.setHandler(LOBBY_STATE_CREATE_CHANNEL, (phase) => { if (phase === 1) this.createChannel(); });
    this.o.lobby?.onReset?.(() => {
      this.randomJoin = false;                                                    // DAT_0066a5e8 = 0 (D:L182283, D:L182778)
      this.playersOut = false;                                                    // ROOM_PLAYER_LIST_SESSION_ADAPTATION
      this.playersSeq++;
    });
  }
}
