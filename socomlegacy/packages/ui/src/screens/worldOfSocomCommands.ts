import type { UiBindingStart, UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import { valveTypeOf, VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { LobbyClan } from './createClanCommands';

/**
 * The SOCOM II ONLINE menu's rows (`dlgWorldOfSOCOM.rdr`, ONL-09; web research 158, on research 128 §4.7, 133 and
 * 156 §2): the announcement request `GetMediusAnnouncements` sends and the reply handler that fills MEDIUS_MOTD -- the
 * text SERVER NEWS and MESSAGES both show --, the lobby session's UI variables, the valves `global_valves.rdr` gives
 * the dialog's set, the room list `RefreshRoomList` asks and draws (ONL-11, web research 161) -- its clan rooms by the
 * client's clan (`LobbyClan`), which ONL-27's GetMyClans fills (`./manageRosterCommands`, web research 272) -- and the
 * gate that keeps the rows whose pages are parked inert (OT.R8); a room row's CROSS is ONL-12's join
 * (`./briefingRoomCommands`). PLAT-08's `UiCommandHost` is a registry each module fills (`setHandler`, W9.R4); the table
 * is not edited.
 *
 * **The request.** `GetMediusAnnouncements` (`FUN_0027d1f0` D:L125862-125869) calls `FUN_002f7710(0x44f370)`
 * (D:L196520-196540): only while the lobby session's flag +0x7d is set and its state byte +0x60 is 0x0b, it sets
 * MEDIUS_MOTD (the variable at lobby +0xc8, 0x3f38e8) to "Retrieving messages from server..." (0x3f57c0) and sends the
 * 0x2c-byte request -- the session key (0x66a4d0, 17 bytes) at +0x15, the application id 0x28e8 at +0x28 -- through
 * `FUN_00649820` with the callback `FUN_002f77a0`: Lobby 0x4b GetAnnouncements (research 133 §1). The answer is 1.
 *
 * **The reply** (`FUN_002f77a0` D:L196542-196627, the 0x4d response's status at +0x18 and text at +0x20): a
 * non-success status (`FUN_002f42d0` "MediusGetAnnouncements": status == 0) sets MEDIUS_MOTD to "No server messages."
 * (0x3f5810). A success builds an array: the text, the separator "\n" (0x3f5808), then -- only when MEDIUS_MOTD is
 * already an array -- the strings it holds that fit: a budget of 800 less the text's length and two for each held
 * element is spent from the last element back, and every string after the first that does not fit is kept, in order.
 * The request has just set the variable to a string, so a reply to it finds no array: the kept tail needs two replies
 * with no request between.
 *
 * The replies arrive through the page's service (`AnnouncementService`: SVC-05's `POST /texts/announcement` on the
 * match server, `packages/central/src/serverTexts.ts`). The text is the server's: SVC-04's store's latest announcement
 * in force, none on a fresh server -- a success with an empty text, as our Horizon answers (research 133 §5), which
 * shows an empty line.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog. */
export const WORLD_OF_SOCOM = 'dlgWorldOfSOCOM.rdr';

/** The rows this module fills (`readBindingTable`; held to PLAT-08's table by the test): the task that owns each body and its state here. */
export const WORLD_OF_SOCOM_COMMAND_ROWS = [
  { row: 51, id: 49, name: 'GetMediusAnnouncements', fn: 0x27d1f0, task: 'ONL-09', state: 'here' },
  { row: 41, id: 42, name: 'RefreshRoomList', fn: 0x27daa0, task: 'ONL-11', state: 'here' },
] as const;
export type WorldOfSocomCommandName = (typeof WORLD_OF_SOCOM_COMMAND_ROWS)[number]['name'];

/**
 * A bound function of the dialog's chapter and who answers it: `here` (this module's body), `existing` (another
 * module's body, registered on the session), `stub` (registered here for the task named, answering as the original's
 * body answers with no data) or `parked` (not registered: the table's declared row answers, for the task named).
 */
export interface WorldEntryCommand {
  name: string;
  state: 'here' | 'existing' | 'stub' | 'parked';
  task: string;
  spelt: readonly string[];
  /** For `stub` and `parked`: what reaches the row from this dialog and what answers it meanwhile. */
  why?: string;
}

const existing = (name: string, task: string, ...spelt: string[]): WorldEntryCommand => ({ name, state: 'existing', task, spelt });
const parked = (name: string, task: string, why: string): WorldEntryCommand => ({ name, state: 'parked', task, spelt: [], why });


/**
 * Every bound function `dlgWorldOfSOCOM.rdr`'s chapter names (its layout's bindings, its own set and `UIanim.rdr`'s
 * `net_monitor`, `ReturnToBriefingRoom`, `OnMultiplayerDisconnect` and `OnSystemMessage`: ONL-33's pin,
 * `tools/test/onlineDialogs.pinned.json`), each answered by a task. `RefreshRoomList` is not in the pin's list: the set
 * aims it at the node `ROOMLIST` (`init_screen`, `refresh_roomlist`, `OnBadJoinState`, `OnJoinRoomFailure`), and the
 * pin's listing prints a command with a node as `<node>.op<n>` whatever its byte +6 is -- an op (0xE8 and up) or, as
 * here, a name's index (research 158 §2.3). `tools/test/worldOfSocomEntryCommands.test.ts` holds the list to the pin.
 */
export const WORLD_OF_SOCOM_ENTRY_COMMANDS: readonly WorldEntryCommand[] = [
  // PLAT-10's screen rows, PLAT-11's input row, PLAT-23's sound rows.
  existing('SwitchMenu', 'PLAT-10', 'SWITCHMENU'),
  existing('PopUpDialog', 'PLAT-10', 'POPUPDIALOG'),
  existing('KillPopUp', 'PLAT-10', 'KILLPOPUP'),
  existing('ActivateButton', 'PLAT-10'),
  existing('EnableButton', 'PLAT-10'),
  existing('DisableButton', 'PLAT-10'),
  existing('SuspendMenuInput', 'PLAT-11'),
  existing('StopAllSounds', 'PLAT-23'),
  existing('VagStreaming', 'PLAT-23'),
  // ONL-01's NetCnf rows (`exit_lobby`, `OnMultiplayerDisconnect`).
  existing('NetCnfClose', 'ONL-01'),
  existing('NetCnfUninit', 'ONL-01', 'NetCnfUnInit'),
  // SVC-09a's client half (`clanInvitations.ts`), mounted on the session by this task.
  existing('CheckMyInvites', 'SVC-09a'),
  existing('HasClanInvitations', 'SVC-09a'),
  // ONL-12's join (`./briefingRoomCommands`, web research 162): `join_room`'s two rows, the table's ONL-11 bodies.
  existing('CanJoinRoom', 'ONL-11'),
  existing('JoinMPRoom', 'ONL-11'),
  // ONL-10's two bodies (`logoffCommands.ts`, research 160), mounted on the session with this dialog's rows: `exit_lobby`
  // after YES, and `OnMultiplayerDisconnect`'s UnInitNetwork.
  existing('LobbyLogout', 'ONL-10'),
  existing('UnInitNetwork', 'ONL-10'),
  // This module.
  { name: 'GetMediusAnnouncements', state: 'here', task: 'ONL-09', spelt: [] },
  { name: 'RefreshRoomList', state: 'here', task: 'ONL-11', spelt: [] },
  // ONL-27 (research 272): `init_screen`'s last statement GetClan (GetMyClans, `FUN_002e8a90` / `FUN_002e8bd0`: the client's clan,
  // PLAYER_NAME_AND_TAG at the foot, the roster and the band on success); `ClanManageAct` and `create_modify_clan`'s
  // IsMemberOfClan / IsLeaderOfClan over that clan -- `ManageRosterCommands` (`./manageRosterCommands`).
  existing('GetClan', 'ONL-27'),
  existing('IsMemberOfClan', 'ONL-27'),
  existing('IsLeaderOfClan', 'ONL-27'),
  // ONL-30a (research 269 §2): `get_ladder_top_10` (ONSTART), modes 1 and 7 at the command's +0x10 (`FUN_002784d0`
  // D:L123407-123492): my position and THE PODIUM's ten (LADDER_LEADERS, the PLAYER RANKING row's pane `LadderTop10`),
  // then since ONL-30 (research 311 §7) the clans' podium, ClanLadderLeaders 10 from 1 (`FUN_002ea6b0`, CLAN_LADDER_LEADERS,
  // the CLAN RANKING row's pane `ClanLadderTop10` under #766); filled by `LadderLobbyCommands` (`./ladderLobbyCommands`).
  existing('GetLadderInfo', 'ONL-30a'),
  // ONL-24 (research 269 §3): `get_friend_list` (ONSTART) asks the friends list (`FUN_0027a2e0` D:L124353-124360 ->
  // `FUN_00301750`), which the FRIENDS row's pane draws (FriendListVar), filled by `FriendListCommands` (`./friendListCommands`).
  existing('GetFriendsList', 'ONL-24'),
  // ONL-25 (research 269 §1): `get_friend_list` (ONSTART) asks the ignore list (`FUN_0027a280` D:L124333-124340), which the
  // IGNORE row's pane draws (IgnoreListVar), filled by `IgnoreListCommands` (`./ignoreListCommands`).
  existing('GetIgnoreList', 'ONL-25'),
  // ONL-15 (research 265 §2): AUTOPLAY's ONACTIVATE `refresh_filter_screen` (`GetMissionInformation`, `./onlineFiltersCommands`,
  // only when GameTypeFilter names a map) and its CROSS `join_random_game` (`JoinMPGame(RANDOM)`, `./autoplayCommands`);
  // `join_game`, bound on MP_MEDIUS_READY_TO_CONNECT (state 17's entry), joins through ONL-16a's rows (`./gameLobbyCommands`).
  existing('GetMissionInformation', 'ONL-15'),
  existing('JoinMPGame', 'ONL-16a'),
  existing('CheckJoinMP', 'ONL-16a'),
  existing('ConnectToGameServer', 'ONL-16a'),
  existing('JoinGameServer', 'ONL-16a'),
  existing('DisconnectFromGameServer', 'ONL-16a'),
  // ONL-22 (research 315 §6 E5): `OnMultiplayerDisconnect` (UIanim.rdr), bound on MP_MEDIUS_ERROR, before UnInitNetwork --
  // the lobby's teardown (`FUN_0027dc90` -> `FUN_002f4240`, D:L126213-126220), ONL-10's module's (`logoffCommands.ts`).
  existing('LobbyBailout', 'ONL-22'),
];

// ---- the lobby session's UI variables ----

/** MEDIUS_MOTD (0x3f38e8): the variable at lobby +0xc8, which `motd` and `popup_motd_text` both show. */
export const MEDIUS_MOTD_VAR = 'MEDIUS_MOTD';
/** The texts `FUN_002f7710` and `FUN_002f77a0` write (0x3f57c0, 0x3f5810) and the separator (0x3f5808). */
export const MOTD_RETRIEVING = 'Retrieving messages from server...';
export const MOTD_NO_MESSAGES = 'No server messages.';
export const MOTD_SEPARATOR = '\n';
/** `FUN_002f77a0`'s budget for the held texts, in bytes (D:L196569). */
export const MEDIUS_MOTD_BUDGET = 800;

const str = (s: string): UiVarValue => ({ type: 'string', value: s });

/**
 * The variables the lobby session adds at its start (`FUN_002df6a0` D:L182187-182232, called by `LobbyConnect`'s
 * `FUN_002e0030` at D:L182671): each TEMPORARY, in this order, with the value the body gives it -- an empty array for
 * the chat's, the empty string (0x3f38f8) for MEDIUS_MOTD and MEDIUS_CLAN_MESSAGES, none for the rest.
 */
export const LOBBY_SESSION_VARS: readonly { name: string; value: UiVarValue | null }[] = [
  { name: 'GAMELISTVAR', value: null }, { name: 'ROOMLISTVAR', value: null }, { name: 'ROOMPLAYERLISTVAR', value: null },
  { name: 'MEDIUS_CHAT_RECV_VAR', value: { type: 'array', value: [] } },
  { name: MEDIUS_MOTD_VAR, value: str('') }, { name: 'MEDIUS_CLAN_MESSAGES', value: str('') },
  { name: 'INVITED_PLAYERS', value: null }, { name: 'CLAN_ROSTER', value: null }, { name: 'MY_CLAN_INVITES', value: null },
  { name: 'LADDER_LEADERS', value: null }, { name: 'LADDER_RANKING', value: null }, { name: 'CLAN_LADDER_LEADERS', value: null },
  { name: 'CLAN_LADDER_RANKING', value: null },
];

/**
 * `FUN_002df6a0`'s variables (D:L182196-182226). The two texts are added with no value and then set (`FUN_003862a0`),
 * so a later start empties them whatever they held. The body's end -- the first room list request, unless the LAN
 * lobby is up (D:L182227-182230) -- is not sent here: the port adds the variables when the session is made, before any
 * login, when the request would carry no ticket (research 161 §6; owed with `LobbyConnect`'s move, ONL-07's).
 */
export function lobbySessionStart(uiVars: UiVarManager): void {
  for (const v of LOBBY_SESSION_VARS) {
    if (v.value?.type === 'string') uiVars.set(uiVars.add(v.name, null, 1), v.value);
    else uiVars.add(v.name, v.value, 1);
  }
}

// ---- the valves ----

/**
 * The valves `global_valves.rdr` (`RUN/READERC.ZAR`) gives the dialog's set, in the table's order, with its values and
 * type words (none: the caller's PERM, `CValve_Open` `FUN_00351d40` at D:L152619; research 104 §6). Of the set's 22
 * valves the table names these twelve; the other ten start at 0, made TEMP by the script's parse. `PopupNewsOnce` is
 * the one that shows SERVER NEWS once a launch: 0 here, set to 1 by `init_screen`, and 0 again only at the next launch
 * (the logoff's reboot reads the table anew). Held to the disc by `worldOfSocomValvesDisc.test.ts`.
 *
 * The page's boot loads the whole table since OPT-02b (`@s2u/viewer` `bootValves`); these twelve are seeded over it at
 * each launch, at the table's values, so the dialog starts as the original's does.
 */
export const WORLD_OF_SOCOM_GLOBAL_VALVES: readonly { name: string; value: number; type: 'PERM' | 'PERSIST' }[] = [
  { name: 'ComeFromLan', value: 0, type: 'PERM' }, { name: 'GameTypeFilter', value: 0, type: 'PERM' },
  { name: 'socom_online_state', value: 0, type: 'PERM' }, { name: 'socom_online_initialized', value: 0, type: 'PERM' },
  { name: 'LadderMedalOfMerit', value: 0, type: 'PERM' }, { name: 'mp_join_game', value: 0, type: 'PERM' },
  { name: 'JoinAsSpectator', value: 0, type: 'PERM' }, { name: 'GamePlayerFilter', value: 0, type: 'PERSIST' },
  { name: 'GameSpeedFilter', value: 65000, type: 'PERSIST' }, { name: 'FF_FILTER', value: 2, type: 'PERSIST' },
  { name: 'PopupNewsOnce', value: 0, type: 'PERM' }, { name: 'GameTypeMapIndex', value: 0, type: 'PERSIST' },
];

/** A launch's start for those valves (`CValve_Parse` `FUN_00351a90`: each entry `set` with its type word). */
export function seedWorldOfSocomValves(valves: ValveStore): void {
  for (const v of WORLD_OF_SOCOM_GLOBAL_VALVES) valves.set(v.name, v.value, valveTypeOf(v.type, VALVE_TYPE.PERM));
}

// ---- the parked rows ----

/**
 * PARKED_ROW_GATE_READING: the rows whose pages are parked are drawn and inert (the owner's ruling OT.R8). The
 * original's CROSS on each runs the script named in `PARKED_ROWS` and leaves the menu for a page. None of those pages
 * is built, so the gate takes the start of the row's CROSS animation whole: nothing of the script runs, not the
 * statements before its switch either -- CLAN's `.DINK`, OPTIONS's `StopAllSounds` and `VagStreaming(OFF)` (which would
 * leave the menu silent with no page to restart the music). The row's ONACTIVATE -- its help line and its
 * pane -- runs as the set has it. Not the original's behaviour: each row is owed to its task, which removes its line
 * from `PARKED_ROWS` -- OPTIONS's (`Goto_Options`, OPT-15) is gone since TAUNTS (web research 301 §6): its CROSS runs
 * the set's script whole, `StopAllSounds`, `VagStreaming(OFF)`, `SwitchMenu(dlgOnlineOptions.rdr)`; ONLINE OPTIONS'
 * own rows are all unparked since OPT-15 (web research 265 §1), and AUTOPLAY's (`join_random_game`) since ONL-15
 * (web research 265 §2): its CROSS runs the set's script whole, `JoinMPGame(RANDOM)` answered by `./autoplayCommands`;
 * IGNORE's (`Goto_Ignore`) since ONL-25 (web research 269 §1): `StartMusic = 1`, `SwitchMenu(dlgIgnoreList.rdr)`,
 * the page `./ignoreListCommands` answers; PLAYER RANKING's (`Goto_Ladder`) since ONL-30a (web research 269 §2):
 * `StartMusic = 1`, `SwitchMenu(dlgLadderLobby.rdr)`, the page `./ladderLobbyCommands` answers; CLAN RANKING's
 * (`Goto_ClanLadder`) since ONL-30 (web research 311, H188's condition, W18.R13): `StartMusic = 1`,
 * `SwitchMenu(dlgClanLadderLobby.rdr)`, no sound, the page `./ladderLobbyCommands` answers (the clans' half, over
 * CLAN-BOARD-SERVER's three answers); FRIENDS' (`Goto_Friends`) since ONL-24 (web research 269 §3):
 * `StartMusic = 1`, `SwitchMenu(dlgFriendList.rdr)`, the page `./friendListCommands` answers; CLAN's
 * (`create_modify_clan`) since ONL-26 (web research 271 §3): `StartMusic = 1`, `.DINK`, then by `IsMemberOfClan` and
 * `IsLeaderOfClan` over the client's clan -- no clan, `SwitchMenu(dlgCreateClan.rdr)`, the page `./createClanCommands`
 * answers; a member or the leader, `dlgManageRoster.rdr` or `dlgManageRosterLeader.rdr`, the disc's pages whose rows are
 * ONL-27's (the table's declared answers until then); INVITATIONS' (`Goto_Invites`) since ONL-28 (web research 273 §4):
 * `StartMusic = 1`, `SwitchMenu(dlgRespondToInvites.rdr)`, no sound -- the row enabled only while the received list holds
 * an invitation (`TurnOnInvitations`), the page `./respondToInvitesCommands` answers. Every row of SOCOM II ONLINE is
 * unparked since ONL-30; the list and the gate stay, empty, for a row a later task parks. [reading]
 */
export const PARKED_ROW_GATE_READING = 'OT.R8: the CROSS animation of a row whose page is parked is not started; owed to the task named per row' as const;

/** A parked row: its control, its CROSS animation (the layout's binding), the task that owns the page, and what the original's script runs. */
export interface ParkedRow { control: string; animation: string; task: string; original: string }

export const PARKED_ROWS: readonly ParkedRow[] = [];

/** ONLINE OPTIONS, which SOCOM II ONLINE's OPTIONS row opens (`Goto_Options`). */
export const ONLINE_OPTIONS = 'dlgOnlineOptions.rdr';

/**
 * ONLINE OPTIONS' parked rows: none since OPT-15 (web research 265 §1, 2026-10-10). SETUP TAUNTS and the save were
 * unparked with the taunts (web research 301 §6) and SETUP MESSAGING with Chris's settings (web research 302 §3), both
 * 2026-10-07; OPT-15 unparked the last four -- PLAYER DESCRIPTION (`SetPlayerDescription`: the soft keyboard on
 * `PlayerDescription`, then `FUN_00277640`, `./onlineOptionsCommands`), INPUT FILTERS (`goto_menu(dlgOnlineFilters.rdr)`,
 * ONL-15's page), and the TEAMMATE NAMES and EXTERNAL WHISPERS strips (`Enable_TeamNames` / `Disable_TeamNames`,
 * `Enable_Whispers` / `Disable_Whispers`: the valves `DISPLAY_MP_TEAM_NAMES`, `EnableExternalWhispers`, research 229
 * §3). The list and its gates stay, empty, for a row a later task parks: a button's CROSS animation (with its
 * `ARGUMENT` where two rows share one) or a RADIOSTRIP whole (`strip`, `UiControlGate`).
 */
export const ONLINE_OPTIONS_PARKED_ROWS: readonly (ParkedRow & { argument?: string; strip?: boolean })[] = [];

/** The gate's name in the host (`UiCommandHost.setBindingGate`, `setControlGate`). */
export const PARKED_ROW_GATE = 'ONL-09 parked rows';

const sameName = (a: string | null | undefined, b: string | null | undefined): boolean => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

/**
 * The gate (`UiBindingGate`): true takes the start of a parked row's CROSS animation -- on SOCOM II ONLINE (`PARKED_ROWS`)
 * and on ONLINE OPTIONS (`ONLINE_OPTIONS_PARKED_ROWS`, empty since OPT-15; its argument matched where it names one). A room row's CROSS
 * (`join_room`) runs: ONL-12's join (`./briefingRoomCommands`, web research 162).
 */
export function parkedRowGate(b: Pick<UiBindingStart, 'dialog' | 'animation'> & { argument?: string | null }): boolean {
  if (sameName(b.dialog, WORLD_OF_SOCOM)) return PARKED_ROWS.some((p) => p.animation === b.animation);
  if (sameName(b.dialog, ONLINE_OPTIONS)) {
    return ONLINE_OPTIONS_PARKED_ROWS.some((p) => !p.strip && p.animation === b.animation && (p.argument === undefined || sameName(p.argument, b.argument)));
  }
  return false;
}

/** The control gate (`UiControlGate`): ONLINE OPTIONS' parked RADIOSTRIPs take no pad (none since OPT-15). */
export function parkedControlGate(c: { dialog: string; control: string }): boolean {
  return sameName(c.dialog, ONLINE_OPTIONS) && ONLINE_OPTIONS_PARKED_ROWS.some((p) => p.strip && p.control === c.control);
}

// ---- the commands ----

/** The request's one word (`FUN_002f7710` +0x28: the application id, 10472). */
export const ANNOUNCEMENT_QUERY = { applicationId: 0x28e8 } as const;
export type AnnouncementQuery = { applicationId: number };
/** One Lobby 0x4d reply (`MediusGetAnnouncementsResponse`): the fields `FUN_002f77a0` reads (+0x18, +0x20) and the two it does not. */
export interface AnnouncementReply { status: number; announcementId: number; announcement: string; endOfList: boolean }
/** The page's half: the request sent, the reply back (a rejection is a request never answered). */
export interface AnnouncementService { announcement(q: AnnouncementQuery): Promise<AnnouncementReply> }

/** PLAYER_NAME_AND_TAG (0x3f4380): the variable the layout's `playername` shows, which ONL-27's GetMyClans writes (`./manageRosterCommands`). */
export const PLAYER_NAME_AND_TAG_VAR = 'PLAYER_NAME_AND_TAG';
/** The lobby's state in the menus (`socom_online_state` 11: `dlgNetConnect` leaves for the agreement on it, research 128 R128.1). */
const LOBBY_STATE_ONLINE = 0x0b;

/**
 * WORLD_LOBBY_STATE_READING: `FUN_002f7710`, `FUN_002e3a30` and `FUN_002e8a90` act only while the lobby session's
 * +0x7d is set and its state byte +0x60 is 0x0b (11). The port has no lobby session before ONL-07's connect; the
 * original reaches this menu only past it, in state 11 (`dlgNetConnect` waits for `socom_online_state` 11, research
 * 128 R128.1), so absent the page's hooks the session counts as up in state 11. ONL-07 hands its own in (`lobbyUp`,
 * `lobbyState`). [reading]
 */
export const WORLD_LOBBY_STATE_READING = 'no hook: the session up in state 11 (the menu is reached past the connect); ONL-07 hands its own in' as const;

// ---- the room list (ONL-11, SVC-14a; web research 161) ----

/** ROOMLISTVAR (0x3f38a0): the variable at lobby +0xb4 (`DAT_0044f424`, `FUN_002df6a0` D:L182198-182199) the layout's `ROOMLIST` shows. */
export const ROOM_LIST_VAR = 'ROOMLISTVAR';
/** ChannelList_ExtraInfo0's two words (`FUN_002e3aa0` D:L184878-184895: PageID 1 at +0x16, PageSize 999 at +0x18). */
export const ROOM_LIST_QUERY = { pageId: 1, pageSize: 999 } as const;
export type RoomListQuery = { pageId: number; pageSize: number };
/**
 * One Lobby 0xed entry, the fields `FUN_002e3b00` (D:L184900-184971) reads: the status +0x18, the world id +0x1c, the
 * players +0x20, the most +0x22, the security level +0x24, GenericField1 +0x28 (the rank bits and the order's high
 * half), the name +0x2c (64 bytes), EndOfList +0x6c -- SVC-06's `/lobby/channel-list` answers them by name.
 */
export interface ChannelListEntry {
  status: number; mediusWorldId: number; playerCount: number; maxPlayers: number; securityLevel: number;
  genericField1: number; lobbyName: string; endOfList: boolean;
}
/** The page's half: the request sent, the page's entries back in order (a rejection is a request never answered). */
export interface RoomListService { channelList(q: RoomListQuery): Promise<readonly ChannelListEntry[]> }

/**
 * SVC-14a: the ELIGIBLE RANKS icons, one per bit of GenericField1's low four (`FUN_002e3cc0` D:L185011-185046 appends
 * the integer `icon` for each bit set, or all four when none is), which `ROOMLIST`'s four IMAGE columns draw as their
 * `TEXTURES[icon]` (the disc's record: `null.tif`, `Medal_Blue.tif` .. `Medal_Gold.tif`, `Medal_Black.tif`); bit
 * `icon - 1` admits rank tier `icon` (`FUN_002e34e0` D:L184706-184712; research 155 §2.3 names the four).
 */
export const ELIGIBLE_RANKS = [
  { icon: 1, bit: 1, rank: 'ENSIGN', medal: 'Medal_Blue' }, { icon: 2, bit: 2, rank: 'LIEUTENANT', medal: 'Medal_Bronze' },
  { icon: 3, bit: 4, rank: 'LT. COMMANDER', medal: 'Medal_Silver' }, { icon: 4, bit: 8, rank: 'CAPTAIN', medal: 'Medal_Gold' },
] as const;

/** A room's icons (`ELIGIBLE_RANKS`): every one when GenericField1's low four bits are 0, else one per bit set. */
export function roomEligibleRanks(genericField1: number): number[] {
  const bits = genericField1 & 0xf;
  return ELIGIBLE_RANKS.filter((r) => bits === 0 || (bits & r.bit) !== 0).map((r) => r.icon);
}

/**
 * ROOM_LIST_LATEST_REPLY_ADAPTATION (the ONL-11 review, 2026-10-05): each request is numbered with the ticket it was
 * sent under, and a reply is taken only when it answers the latest request and that ticket is still the session's.
 * Why: the console's replies come in order on one connection that dies with the session; the page's HTTP requests can
 * return out of order (a slow 30 s refresh after REFRESH LIST's newer answer would redraw stale counts or re-add a room
 * that is gone) and can return after a logoff or a lost session. A browser adaptation of the transport.
 */
export const ROOM_LIST_LATEST_REPLY_ADAPTATION = "a reply taken only for the latest request, under the ticket still held" as const;

const CLAN_ROOM_PREFIX = '+Clan - ';     // 0x3f3e28; "+Clan - %s" 0x3f3e38
const MEDIUS_ROOM_PREFIX = 'Medius';     // 0x3f3e48

/** `strlen` of a name as the console holds it: its UTF-8 bytes. */
const nameBytes = (s: string): number => byteLength(s);
/** `FUN_00198b80` (strcasecmp): the bytes compared with A-Z folded to a-z. */
export function caseless(a: string, b: string): number {
  const x = a.replace(/[A-Z]/g, (c) => c.toLowerCase()), y = b.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return x < y ? -1 : x > y ? 1 : 0;
}
/** `FUN_002e3f80` (D:L185059-185088), the sort's order: GenericField1's high half, then the name's length, then the name without case. */
export function roomOrder(a: ChannelListEntry, b: ChannelListEntry): number {
  return ((a.genericField1 >>> 16) - (b.genericField1 >>> 16)) || (nameBytes(a.lobbyName) - nameBytes(b.lobbyName)) || caseless(a.lobbyName, b.lobbyName);
}

/**
 * The rows `FUN_002e3cc0` (D:L184974-185056) builds from the client's rooms, already in order: a room with no name is
 * skipped; a name opening "+Clan - " is drawn only for a member whose "+Clan - %s" of the clan's name it is
 * (D:L184996-185003; `FUN_002e6830`, the clan's name at 0x44f5a4); a name opening "Medius" (`strncmp` 6, D:L185006) is
 * not drawn. Each row is the array [the name, the players (+0x20, 16 bits), then the icon of each eligible rank]
 * (`FUN_003339b0`, `FUN_00333610`, `FUN_00333700`, `FUN_00333770`).
 */
export function roomListRows(rooms: readonly ChannelListEntry[], clanName: string | null): UiVarValue[] {
  const rows: UiVarValue[] = [];
  for (const r of rooms) {
    const name = r.lobbyName;
    if (name === '') continue;
    if (name.startsWith(CLAN_ROOM_PREFIX) && (clanName === null || name !== `${CLAN_ROOM_PREFIX}${clanName}`)) continue;
    if (name.startsWith(MEDIUS_ROOM_PREFIX)) continue;
    rows.push({ type: 'array', value: [str(name), { type: 'int', value: r.playerCount & 0xffff }, ...roomEligibleRanks(r.genericField1).map((icon) => ({ type: 'int' as const, value: icon }))] });
  }
  return rows;
}

/**
 * ACCOUNT_NAME_READING: the name `FUN_002e8bd0` prints is the session's account name at 0x66a4f4, which the login's
 * answer fills (ONL-07's). Absent the page's hook, the UI variable PLAYERNAMEVAR's text -- the name `LobbyLogin` sends
 * as the account's (`FUN_0027dd20` D:L126251; research 156 R156.5) -- and the empty string when it holds none.
 * [reading]
 */
export const ACCOUNT_NAME_READING = 'no hook: PLAYERNAMEVAR (the name LobbyLogin sends); ONL-07 hands the session\'s in' as const;

export interface WorldOfSocomCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The announcement request's service (SVC-05's `/texts/announcement`). */
  service: AnnouncementService;
  /** The lobby session's +0x7d (`WORLD_LOBBY_STATE_READING`); absent, up. */
  lobbyUp?: () => boolean;
  /** The lobby's state byte +0x60 (`WORLD_LOBBY_STATE_READING`); absent, 11. */
  lobbyState?: () => number;
  /**
   * The session's account name, 0x66a4f4 (`ACCOUNT_NAME_READING`); absent, PLAYERNAMEVAR's text. Read by no row here since
   * GetClan's reply moved to ONL-27's `./manageRosterCommands`; the mount still hands it.
   */
  accountName?: () => string;
  /** ONL-11: the room list's service (SVC-06's `/lobby/channel-list`); absent, a request never answered. */
  roomList?: RoomListService;
  /** Optional browser presentation of the original rows; absent, `roomListRows` is drawn unchanged. */
  presentRoomList?: (rows: UiVarValue[]) => UiVarValue[];
  /** The session's ticket (ONL-07's seam), for `ROOM_LIST_LATEST_REPLY_ADAPTATION`: a reply is dropped when it changed or is gone; absent, not checked. */
  ticket?: () => string | null;
  /** The clan's name for a member (0x44f5a4, `FUN_002e6830` not -1), or null; absent, the client's clan's (`clan`). */
  clanName?: () => string | null;
  /** ONL-26: the client's clan (`LobbyClan`), which the create and ONL-27's GetMyClans write and the clan rows read; absent, one of its own. */
  clan?: LobbyClan;
  /** A row called, as it happens. */
  log?: (name: WorldOfSocomCommandName, arg: string, answer: boolean) => void;
}

/** `strlen` of a text as the wire carries it: its UTF-8 bytes. */
function byteLength(s: string): number {
  let n = 0;
  for (const ch of s) { const c = ch.codePointAt(0)!; n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  return n;
}

export class WorldOfSocomCommands {
  /** The client's rooms (0x44f568: the count `DAT_0044f56c`, the records `DAT_0044f570`), each a copy of its 0xed entry. */
  private roomRecords: ChannelListEntry[] = [];
  /** The latest room list request's number (`ROOM_LIST_LATEST_REPLY_ADAPTATION`). */
  private roomListSeq = 0;
  /** The client's clan (0x3df298, 0x44f5c4, 0x44f5a4; `./createClanCommands`), one for the session. */
  readonly clan: LobbyClan;

  constructor(private readonly o: WorldOfSocomCommandsOptions) {
    this.clan = o.clan ?? new LobbyClan();
  }

  private answer(name: WorldOfSocomCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** The lobby session up and in state 11 (`WORLD_LOBBY_STATE_READING`). */
  private online(): boolean {
    return (this.o.lobbyUp?.() ?? true) && (this.o.lobbyState?.() ?? LOBBY_STATE_ONLINE) === LOBBY_STATE_ONLINE;
  }

  /** `FUN_0027d1f0` -> `FUN_002f7710` (D:L196520-196540): the retrieving text and the request, while online; answer 1. */
  GetMediusAnnouncements: UiCommandHandler = (cmd) => {
    if (this.online()) {
      const vars = this.o.uiVars;
      vars.set(vars.add(MEDIUS_MOTD_VAR, null, 1), str(MOTD_RETRIEVING));
      this.o.service.announcement({ ...ANNOUNCEMENT_QUERY }).then((r) => { this.announcementReply(r); }, () => { /* never answered: the retrieving text stays */ });
    }
    return this.answer('GetMediusAnnouncements', cmd, true);
  };

  /** `FUN_002f77a0` (D:L196542-196627): one Lobby 0x4d reply. */
  announcementReply(r: AnnouncementReply): void {
    const vars = this.o.uiVars;
    const motd = vars.add(MEDIUS_MOTD_VAR, null, 1);
    if (r.status !== 0) { vars.set(motd, str(MOTD_NO_MESSAGES)); return; }
    const out: UiVarValue[] = [str(r.announcement), str(MOTD_SEPARATOR)];
    const held = motd.value;
    if (held.type === 'array') {
      const n = held.value.length;
      let budget = MEDIUS_MOTD_BUDGET - (byteLength(r.announcement) + n * 2);            // D:L196567-196569
      let i = n;
      for (;;) {                                                                          // D:L196576-196593: from the last back, strings only
        let e: UiVarValue | undefined;
        do { i--; e = i >= 0 ? held.value[i] : undefined; } while (i >= 0 && e?.type !== 'string');
        if (i < 0) break;
        budget -= byteLength((e as { value: string }).value);
        if (budget < 0) break;
      }
      for (i++; i < n; i++) { const e = held.value[i]!; if (e.type === 'string') out.push(e); }   // D:L196594-196615
    }
    vars.set(motd, { type: 'array', value: out });
  }

  /**
   * `FUN_0027daa0` (D:L126149-126170) -> `FUN_002e3a30` (D:L184852-184875): 0 unless the session is up in state 11;
   * then `FUN_002e3aa0` (D:L184878-184895) -- the client's rooms cleared (`FUN_002e4140`), ChannelList_ExtraInfo0 sent
   * (`ROOM_LIST_QUERY`, the callback `FUN_002e3b00`) -- and 1. The node's list the row reads off `ROOMLIST` is handed on
   * and not used (`FUN_002e3aa0` takes no argument). A rejection is a request never answered: nothing changes.
   */
  RefreshRoomList: UiCommandHandler = (cmd) => {
    if (!this.online()) return this.answer('RefreshRoomList', cmd, false);
    this.roomRecords = [];
    const seq = ++this.roomListSeq;
    const ticket = this.o.ticket?.() ?? null;
    const current = (): boolean => seq === this.roomListSeq && this.online()
      && (this.o.ticket === undefined || (ticket !== null && this.o.ticket() === ticket));   // ROOM_LIST_LATEST_REPLY_ADAPTATION
    this.o.roomList?.channelList({ ...ROOM_LIST_QUERY }).then((entries) => { if (current()) this.roomListReply(entries); }, () => { /* never answered */ });
    return this.answer('RefreshRoomList', cmd, true);
  };

  /** The client's rooms, in their order since the last draw. */
  rooms(): readonly ChannelListEntry[] { return this.roomRecords; }

  /**
   * `FUN_002e3b00` (D:L184900-184971), each entry in turn: only a success (`FUN_002f42d0`: status 0) is read -- a world
   * id from 0 keeps the entry, updating in place the room of the same name (`strcmp`, D:L184914-184961) or adding one
   * (`FUN_002e4240`); then EndOfList draws the list (`FUN_002e3cc0`, D:L184964-184965). A non-success (Horizon's NoResult
   * for an empty page) keeps nothing and draws nothing: ROOMLISTVAR keeps what it held.
   */
  roomListReply(entries: readonly ChannelListEntry[]): void {
    for (const e of entries) {
      if (e.status !== 0) continue;
      if (e.mediusWorldId >= 0) {
        const i = this.roomRecords.findIndex((r) => r.lobbyName === e.lobbyName);
        if (i < 0) this.roomRecords.push({ ...e });
        else this.roomRecords[i] = { ...e };
      }
      if (e.endOfList) this.drawRooms();
    }
  }

  /** `FUN_002e3cc0` (D:L184974-185056): the rooms sorted in place (`FUN_002e5150` by `FUN_002e3f80`), the rows set into ROOMLISTVAR (`FUN_00386460`, D:L185051). */
  private drawRooms(): void {
    this.roomRecords.sort(roomOrder);
    const vars = this.o.uiVars;
    const clanName = this.o.clanName ? this.o.clanName() : this.clan.member ? this.clan.name : null;
    const rows = roomListRows(this.roomRecords, clanName);
    vars.set(vars.add(ROOM_LIST_VAR, null, 1), { type: 'array', value: this.o.presentRoomList?.(rows) ?? rows });
  }

  /** The entries by their table name. */
  entries(): Record<WorldOfSocomCommandName, UiCommandHandler> {
    return {
      GetMediusAnnouncements: this.GetMediusAnnouncements, RefreshRoomList: this.RefreshRoomList,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`), and the parked rows' gate. */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
    host.setBindingGate(PARKED_ROW_GATE, parkedRowGate);
    host.setControlGate(PARKED_ROW_GATE, parkedControlGate);
  }
}
