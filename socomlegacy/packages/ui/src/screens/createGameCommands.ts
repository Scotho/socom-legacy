import type { RdrNode } from '@s2u/archive';
import { DIALOG_EVENTS } from '../dialog';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import { conditionTokens, type ZAnimRtSet, type ZAnimUiCommand } from '../zanimRuntime';
import { PREVIOUS_SCREEN } from './menuQueue';
import type { WorldEntryCommand } from './worldOfSocomCommands';

/**
 * CREATE GAME (`dlgCreateGame.rdr`, ONL-13; web research 163) and its PLAY LIST (the same dialog's map popup, ONL-14;
 * web research 164): the rows the dialog's own set calls that no earlier task answers -- `SetMission`,
 * `GetAvailableMPMissions`, `RemoveNonSuppressionMaps` and `CreateMPGame` -- with CreateGame1's request and its reply,
 * the two readings the first release imposes (OT.R16's maps, four since OT.R45; OT.R21's standard rules), and the entry a caller runs. Everything else the
 * screen does is its set's ANIMATIONS, replayed by PLAT-08's host as the original's: the rows' cycles and wraps, the
 * private game's password through PLAT-17's keyboard, the popups, the return. `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; `S:0x...` a string of the retail ELF. Transcribed, cited, never pasted; reading, pending
 * review.
 *
 * **The entry.** The briefing room (ONL-12) reaches this dialog by its own script -- CREATE GAME's CROSS runs
 * `OnCreateGamePress`: `.DINK`, `SWITCHMENU(dlgCreateGame.rdr)` -- so it needs only this module mounted
 * (`mountCreateGame`) and its gate line removed; `openCreateGame` runs the same switch for a stand-in caller. The way
 * back is the dialog's: TRIANGLE's `create_game_exit` and #295's `create_game_failure` both `SWITCHMENU(PREVIOUS_SCREEN)`.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog. */
export const CREATE_GAME = 'dlgCreateGame.rdr';

/** The rows this module fills (the table's names and handlers, `packages/ui/src/uiCommands.ts`). */
export const CREATE_GAME_COMMAND_ROWS = [
  { name: 'SetMission', fn: 0x27eb50, task: 'ONL-13' },
  { name: 'GetAvailableMPMissions', fn: 0x274940, task: 'ONL-14' },
  { name: 'RemoveNonSuppressionMaps', fn: 0x2791e0, task: 'RSP-1' },
  { name: 'CreateMPGame', fn: 0x27d7d0, task: 'ONL-13' },
] as const;
export type CreateGameCommandName = (typeof CREATE_GAME_COMMAND_ROWS)[number]['name'];

const existing = (name: string, task: string, ...spelt: string[]): WorldEntryCommand => ({ name, state: 'existing', task, spelt });
const parked = (name: string, task: string, why: string): WorldEntryCommand => ({ name, state: 'parked', task, spelt: [], why });
const AFTER_CREATE = '`create_game` after `CreateMPGame` answers 1 goes on to the game join, whose rows are the game lobby\'s (ONL-16a, `GameLobbyCommands.created`); `SetMPMissionSeq` itself is not answered: the play list rides the create request (`CreateGameRequest`), and the server holds it';

/** Every bound function of `dlgCreateGame.rdr`'s chapter (ONL-33's pin, `tools/test/onlineDialogs.pinned.json`) and who answers it. */
export const CREATE_GAME_ENTRY_COMMANDS: readonly WorldEntryCommand[] = [
  existing('SwitchMenu', 'PLAT-10', 'SWITCHMENU'), existing('PopUpDialog', 'PLAT-10', 'POPUPDIALOG'), existing('KillPopUp', 'PLAT-10', 'KILLPOPUP'),
  existing('ActivateButton', 'PLAT-10'), existing('EnableButton', 'PLAT-10'), existing('DisableButton', 'PLAT-10'),
  existing('SuspendMenuInput', 'PLAT-11'), existing('GetTextInput', 'PLAT-17'), existing('StopAllSounds', 'PLAT-23'), existing('VagStreaming', 'PLAT-23'),
  existing('ClearUIVar', 'MENU-01a'), existing('TestUIVar', 'MENU-01a'),
  existing('CompareValues', 'ONL-06'), existing('PruneUIVarSpaces', 'ONL-06'), existing('NetCensorText', 'ONL-06'),
  existing('NetCnfClose', 'ONL-01'), existing('NetCnfUninit', 'ONL-01', 'NetCnfUnInit'), existing('UnInitNetwork', 'ONL-10'),
  existing('IsMemberOfClan', 'ONL-09'),
  { name: 'SetMission', state: 'here', task: 'ONL-13', spelt: [] },
  { name: 'GetAvailableMPMissions', state: 'here', task: 'ONL-14', spelt: [] },
  { name: 'CreateMPGame', state: 'here', task: 'ONL-13', spelt: [] },
  existing('ConnectToGameServer', 'ONL-16a'), parked('SetMPMissionSeq', 'ONL-16a', AFTER_CREATE),
  existing('JoinGameServer', 'ONL-16a'), existing('DisconnectFromGameServer', 'ONL-16a'),
  parked('HostLANGame', 'MENU-08', '`create_game` with `ComeFromLan` 1: the LAN game, not on the online path'),
  { name: 'RemoveNonSuppressionMaps', state: 'here', task: 'RSP-1', spelt: [] },
  existing('CopyUIVar', 'MENU-01'),
  // ONL-22 (research 315 §6 E5): `OnMultiplayerDisconnect` (UIanim.rdr), before UnInitNetwork -- the lobby's teardown
  // (`FUN_0027dc90` -> `FUN_002f4240`, D:L126213-126220), ONL-10's module's (`logoffCommands.ts`).
  existing('LobbyBailout', 'ONL-22'),
];

// ---- the mission list (`missionlist.rdr`) ----

/** One `missionlist.rdr` record as `FUN_002c9540` reads it (D:L168844-168906): NUMBER, NAME, TYPE, MULTIPLAYER. */
export interface MissionRecord { number: number; name: string; type: number; multiplayer: boolean }

/** TYPE's words (`FUN_002c9540` D:L168877-168906, the strings from S:0x3f2e68): anything else 0. */
export const MISSION_TYPES: Readonly<Record<string, number>> = { BREACH: 1, DEMOLITION: 2, ESCORT: 3, EXTRACTION: 4, SUPPRESSION: 5 };
/** SUPPRESSION: the type a respawn game keeps (`FUN_00274940`'s `== 5`, D:L121528-121530). */
export const SUPPRESSION_TYPE = 5;

const scalar = (n: RdrNode | undefined): string | null => (typeof n === 'string' ? n : Array.isArray(n) ? scalar(n[0]) : null);
function records(n: RdrNode): RdrNode[][] {
  if (!Array.isArray(n)) return [];
  return n.some((v) => typeof v === 'string') ? [n] : n.flatMap(records);
}

/** `missionlist.rdr` (`RUN/READERC.ZAR`) read record by record, in its order (the order of the game's mission table). */
export function missionRecords(rdr: RdrNode): MissionRecord[] {
  return records(rdr).flatMap((r) => {
    const get = (key: string): RdrNode | undefined => { const i = r.findIndex((v) => v === key); return i >= 0 ? r[i + 1] : undefined; };
    const number = Number(scalar(get('NUMBER')) ?? NaN), name = scalar(get('NAME'));
    if (!Number.isInteger(number) || name === null) return [];
    return [{ number, name, type: MISSION_TYPES[(scalar(get('TYPE')) ?? '').toUpperCase()] ?? 0, multiplayer: r.includes('MULTIPLAYER') }];
  });
}

// ---- the PLAY LIST (ONL-14) ----

/** The two rows `FUN_00274940` puts first when respawn is off (D:L121503-121512): Medley 0xfe (S:0x3ee8c8), Random 0xff (S:0x3ee8d0). */
export const PLAY_LIST_MEDLEY = { number: 0xfe, name: 'Medley' } as const;
export const PLAY_LIST_RANDOM = { number: 0xff, name: 'Random' } as const;

/**
 * The default maps, what CREATE GAME offers (OT.R16, OT.R32; OT.R45, the owner 2026-10-12: NIGHT STALKER the fourth):
 * MP2 Frostfire, MP7 Night Stalker, MP51 Vigilance, MP72 Crossroads; since V13-2 / V13-3 (OT.R58 amended by the owner
 * 2026-11-07, plan V13.R1) MP12 The Ruins (V13-2) and MP1 Blizzard (V13-3), both DEMOLITION (`missionlist.rdr` TYPE 2; with RESPAWN on
 * `availableMissionRows` leaves them out at the source, as `FUN_00274940` does, D:L121528-121530); since DF-14 (OT.R58
 * amended a second time by the owner's word of 2026-11-08, the DF plan's DF.R1, pending his confirmation at the merge,
 * H429) MP6 Desert Glory and MP71 Fish Hook, both EXTRACTION (`missionlist.rdr` TYPE 4, `FUN_002c9540` D:L168877-168906;
 * research 192 G2), classic only (DF.R2): left out with RESPAWN on by the same filter, and a respawn create on either
 * plays classic (`playedRules`, `FUN_002a7560` D:L149405-149431). In stem order (a set:
 * the rows are drawn in `missionlist.rdr`'s order, `availableMissionRows`). **The one source**: central's
 * `FIRST_RELEASE_MAPS` (`packages/central/src/lobby.ts`) is these numbers as `MP<n>` stems, not a second list. On every
 * host, the nightly included (OT.R58): a server's offer only narrows them (`CreateGameCommandsOptions.offered`).
 */
export const FIRST_RELEASE_MAPS = [1, 2, 6, 7, 12, 51, 71, 72] as const;

/**
 * PLAY_LIST_FIRST_RELEASE_READING (OT.R16; the owner's three-map list, 2026-10-07; OT.R45's fourth, 2026-10-12; V13-2's
 * fifth and V13-3's sixth, OT.R58 amended 2026-11-07; DF-14's seventh and eighth, OT.R58 amended 2026-11-08, DF.R1):
 * `GetAvailableMPMissions` lists only the maps the release offers -- Vigilance, Fish Hook, Crossroads, Blizzard,
 * Frostfire, Desert Glory, Night Stalker and The Ruins, in `missionlist.rdr`'s order (of its 22 multiplayer records MP51
 * is the 1st, MP71 the 7th, MP72 the 8th, MP1 the 13th, MP2 the 14th, MP6 the 16th, MP7 the 17th, MP12 the 22nd;
 * `createGameCommands.test.ts` reads them off the disc) -- and leaves every other row out at the source, as the
 * original's own `FUN_00274940` leaves out the maps a game cannot play (with respawn on, every mission not SUPPRESSION, D:L121528-121530; a mission whose archive is absent, D:L121535) rather
 * than disabling them: every row listed can be taken, and nothing the list binds is swallowed. Medley (0xfe) and Random
 * (0xff) are left out too: they are not maps the release offers, and they would play maps it does not -- the
 * original's `SetMPMissionSeq` expands Medley over every present multiplayer mission and Random draws any (research
 * 203 §14), the page answers no `SetMPMissionSeq` at all (`AFTER_CREATE`), and the server refuses any map outside its
 * `FIRST_RELEASE_MAPS` (`MAP_NOT_OFFERED_STATUS_PLACEHOLDER`). With no Medley row the set's own Medley test is retired
 * (`PLAY_LIST_NO_MEDLEY_ROW_READING`). Until 2026-10-07 the 24 rows were listed and the 21 not offered keyed `DISABLED`
 * in a grey `COLOR`, on which SQUARE, TRIANGLE and RIGHT were swallowed (research 164 §3). A deviation from the
 * original's rows for the first release. [reading]
 */
export const PLAY_LIST_FIRST_RELEASE_READING = 'only the offered maps listed (Vigilance, Fish Hook, Crossroads, Blizzard, Frostfire, Desert Glory, Night Stalker, The Ruins); the rest, Medley and Random included, left out at the source' as const;

/**
 * PLAY_LIST_NO_MEDLEY_ROW_READING: the set's `add_a_mission` takes row 0 for Medley whenever respawn is off
 * (`IF tmp_idx == 0 AND mp_allow_respawn == 0`: the selection cleared, the row added alone, `IsMedleyGame` 1 and the
 * focus held in SELECTED MAPS LIST) -- true of every list the original's `FUN_00274940` builds, which writes Medley
 * first exactly when respawn is off (D:L121503-121512). The first release's list has no Medley row
 * (`PLAY_LIST_FIRST_RELEASE_READING`), so row 0 is VIGILANCE, and the test would make it a Medley: CROSS on it wiped
 * the maps already added and kept the others out. `playListSets` retires the test -- its first token `tmp_idx == 0`
 * becomes `tmp_idx < 0`, one byte of `dlgCreateGame.rdr`'s set, so it never holds -- while the list lists no Medley;
 * every other command of the set is the disc's. A deviation from the original's script, the consequence of its rows'.
 * [reading]
 */
export const PLAY_LIST_NO_MEDLEY_ROW_READING = 'add_a_mission\'s `tmp_idx == 0` read as `tmp_idx < 0` (never) while no Medley row is listed' as const;

/** The valve ops' bytes (`UI_VALVE_OPS`, `FUN_00353fd0`): `==` and `<`. */
const VALVE_OP_EQ = 2, VALVE_OP_LT = 4;
/** The zAnim VALVE command (0:61) and IF (0:2). */
const ZCMD_VALVE = 61, ZCMD_IF = 2;

/**
 * The menu's sets with `PLAY_LIST_NO_MEDLEY_ROW_READING` applied: in `dlgCreateGame.rdr`'s `add_a_mission`, the IF
 * whose first token is `tmp_idx == 0` has that token's op byte (+12) made `<`. Anything else -- another set, a set
 * without that IF, a list that offers Medley -- is returned as it was; the sets handed in are not written.
 */
export function playListSets(sets: readonly ZAnimRtSet[]): ZAnimRtSet[] {
  if ((FIRST_RELEASE_MAPS as readonly number[]).includes(PLAY_LIST_MEDLEY.number)) return [...sets];
  return sets.map((set) => {
    if (set.name.toLowerCase() !== CREATE_GAME.toLowerCase()) return set;
    let changed = false;
    const anims = set.anims.map((anim) => {
      if (anim.name !== 'add_a_mission') return anim;
      const sequences = anim.sequences.map((q) => {
        const commands = q.commands.map((c) => {
          if (c.set !== 0 || c.cmd !== ZCMD_IF) return c;
          const first = conditionTokens(c)[0];
          if (!first || first.set !== 0 || first.cmd !== ZCMD_VALVE || first.bytes.length < 16) return c;
          const v = new DataView(first.bytes.buffer, first.bytes.byteOffset, first.bytes.byteLength);
          if (anim.names[v.getUint32(4, true)] !== 'tmp_idx' || v.getUint32(8, true) !== 0 || v.getUint8(12) !== VALVE_OP_EQ) return c;
          const bytes = c.bytes.slice();
          bytes[first.offset - c.offset + 12] = VALVE_OP_LT;
          changed = true;
          return { ...c, bytes };
        });
        return { ...q, commands };
      });
      return { ...anim, sequences };
    });
    return changed ? { ...set, anims } : set;
  });
}

/**
 * MISSION_ARCHIVE_PRESENT_READING: `FUN_00274940` lists a mission only when `FUN_002c94f0` finds its archive. The page
 * serves the player's own disc, whose `RUN/` holds every multiplayer map's `.ZDB`; with no `present` hook every mission
 * is taken as present. [reading]
 */
export const MISSION_ARCHIVE_PRESENT_READING = 'no hook: every multiplayer mission present (the retail disc holds all 22)' as const;

const S = (value: string): UiVarValue => ({ type: 'string', value });
const I = (value: number): UiVarValue => ({ type: 'int', value });
const A = (value: UiVarValue[]): UiVarValue => ({ type: 'array', value });

/** One row as `FUN_00274940` builds it (D:L121538-121547): [number, name]. */
function missionRow(number: number, name: string): UiVarValue {
  return A([I(number), S(name)]);
}

/**
 * `FUN_00274940`'s rows (D:L121473-121555): with respawn off (the valve `mp_allow_respawn`, S:0x3ee8b0, not 1) Medley and
 * Random first; then each mission of the table (`DAT_00441658`, `missionlist.rdr`'s order) flagged multiplayer (+0xc),
 * of type SUPPRESSION when respawn is on (+0x14), whose archive is present (`FUN_002c94f0`). OT.R16 leaves out every
 * row not offered, Medley and Random among them (`PLAY_LIST_FIRST_RELEASE_READING`); `offered` by default
 * `FIRST_RELEASE_MAPS`.
 */
export function availableMissionRows(missions: readonly MissionRecord[], o: { respawn: boolean; present?: (n: number) => boolean; offered?: (n: number) => boolean }): UiVarValue[] {
  const offered = o.offered ?? ((n: number) => (FIRST_RELEASE_MAPS as readonly number[]).includes(n));
  const out: UiVarValue[] = [];
  if (!o.respawn) for (const r of [PLAY_LIST_MEDLEY, PLAY_LIST_RANDOM]) if (offered(r.number)) out.push(missionRow(r.number, r.name));
  for (const m of missions) {
    if (!m.multiplayer || (o.respawn && m.type !== SUPPRESSION_TYPE) || !(o.present?.(m.number) ?? true) || !offered(m.number)) continue;
    out.push(missionRow(m.number, m.name));
  }
  return out;
}

/** PLAYLISTVAR's map numbers (`accept_play_list`'s `GetContents`: each row [number, name]). */
export function playListNumbers(v: UiVarValue | undefined): number[] {
  if (!v || v.type !== 'array') return [];
  return v.value.flatMap((row) => {
    const first = row.type === 'array' ? row.value[0] : row;
    return first && first.type === 'int' ? [first.value] : [];
  });
}

// ---- CREATE (ONL-13) ----

/** CreateGame1's fields as `FUN_002edda0` fills them (D:L190525-190578): SVC-06's `CreateGameRequest`. */
export interface CreateGameRequest {
  applicationId: number; minPlayers: number; maxPlayers: number; gameLevel: number; gameName: string; gamePassword: string;
  spectatorPassword: string; playerSkillLevel: number; rulesSet: number; genericField1: number; genericField2: number;
  genericField3: number; gameHostType: number;
}
/** The 0x1e reply cbCreateGame reads (`FUN_002ee090`): the status +0x18, the world id +0x1c. */
export interface CreateGameReply { status: number; mediusWorldId: number; /** LINK-1: the share id, when the server sent one. */ lobbyId?: string }
/** `/lobby/create-game` (SVC-06, mounted by SVC-07a). A rejection is a request never answered (a 401 included: the page has handed it to the session lost). */
export interface CreateGameService { createGame(req: CreateGameRequest): Promise<CreateGameReply> }

/** The application id (`FUN_002edda0`'s 0x28e8). */
export const CREATE_GAME_APPLICATION_ID = 0x28e8;
/** GF2's 65000 (D:L190573): the s4 report's `GenericField2:0000FDE8`. */
export const CREATE_GAME_GENERIC_FIELD2 = 65000;
/** cbCreateGame's one status of its own (`FUN_002ee090` D:L190609: `-0x3cf`): Horizon's GameNameExists. */
export const CREATE_GAME_NAME_EXISTS = -975;
/** The suffix `FUN_002f9410` puts between the typed name and the room's (S:0x3f5af8). */
export const GAME_NAME_ROOM_SEPARATOR = '$~';
/** `mp_game_sort_order`'s value for a created game (`FUN_002f9410` D:L197764-197769). */
export const CREATED_GAME_SORT_ORDER = 0x7f;

/** The values a created game hands the game lobby (ONL-16a) for its world report and GameStats. */
export interface CreatedGame {
  mediusWorldId: number;
  /** LINK-1: the share id from the create reply, so the host can copy it before the list refreshes. */
  lobbyId?: string;
  gameName: string;
  request: CreateGameRequest;
  /** PLAYLISTVAR's map numbers in order (SetMPMissionSeq's input, ONL-16a's). */
  playList: number[];
  /** The valves the world report and GameStats read (`FUN_002ef590`, `FUN_002f7c40`), as the screen left them. */
  valves: Record<string, number>;
}

/** The valves `CreatedGame.valves` carries. */
export const CREATED_GAME_VALVES = [
  'MaxPlayersValve', 'MaxSpectatorsValve', 'mp_max_rounds', 'mp_max_round_time', 'mp_friendly_fire', 'mp_allow_respawn', 'EQlimit',
  'mp_rank_restrictions', 'CreateClanAffiliation', 'PasswordValve',
] as const;

/**
 * GF3 (`FUN_002e99f0` D:L188258-188282 after `FUN_002e9840(CreateClanAffiliation)` D:L188174-188201): affiliation 1..4
 * as the nibble 0xa..0xd over the clan id (`DAT_0044f59c`, -1 with no clan); 0 with none.
 */
export function clanField(affiliation: number, clanId: number): number {
  if (affiliation < 1 || affiliation > 4) return 0;
  return (((0xa + affiliation - 1) << 28) | clanId) | 0;                // DAT_0044f778 | 0xa0000000 .. 0xd0000000, as an int32
}

/**
 * CREATE_GAME_STATE_ADAPTATION: `CreateMPGame` (`FUN_002f9410`) queues the lobby's state 13, whose entry
 * (`FUN_002edda0` with 1) sends CreateGame1 on the next step; here the request is sent in the row's own call (the page's
 * lobby has no state 13; the screen reads only `socom_online_state` 17, which a create never sets). The fields, the
 * order of the checks and the events are the original's. A browser adaptation of the transport (OT.R27).
 */
export const CREATE_GAME_STATE_ADAPTATION = 'CreateGame1 sent in CreateMPGame\'s call; no lobby state 13 queued' as const;

/**
 * CREATE_LOCAL_CHECKS_READING: before queuing, `FUN_002f9410` finds the room by MEDIUS_LOBBY_NAME among the client's
 * rooms (`FUN_002e4470`) and looks the full name up (`FUN_002e4570`); either failing posts MP_GAME_NAME_EXISTS
 * (S:0x3f5b00) and answers 0. Here the room is the caller's world id (`roomWorldId`, the briefing room's
 * `DAT_0066a538`): none (-1) posts the event as a room not found does; the name's look-up is the server's -975, which
 * posts the same event and so the same #294. [reading]
 */
export const CREATE_LOCAL_CHECKS_READING = 'no room id: MP_GAME_NAME_EXISTS; a taken name: the server\'s -975 (the same event)' as const;

/**
 * GAME_LOBBY_GATE_READING: a success keeps the world id and queues state 15, JoinGame (`FUN_002ee090` D:L190637-190641);
 * the screen's `create_game` waits for state 17 and then connects and joins (`ConnectToGameServer`, `SetMPMissionSeq`,
 * `JoinGameServer`, `SWITCHMENU(dlgGameLobby.rdr)`) -- the game lobby, ONL-16a's (research 165 §5): its `created` takes the
 * game and answers true, and the script goes on into the lobby. Only a mount with no lobby (`created` absent, or not
 * answering true: a test's) hands the game over and returns to the caller (`SWITCHMENU(PREVIOUS_SCREEN)`, as TRIANGLE
 * does); that game stays pending on the server -- its host never joined -- until the host's next create replaces it
 * (`GAMES_PER_HOST_PLACEHOLDER`) or the session ends. [reading]
 */
export const GAME_LOBBY_GATE_READING = 'a success handed to `created`, which takes it into the game lobby (ONL-16a); SWITCHMENU(PREVIOUS_SCREEN) only for a mount with no lobby' as const;

/**
 * RESPAWN_ROW_DISABLED_READING (OT.R21; since OT.R71 only where respawn is not offered -- `respawnRules` false, a test's):
 * RESPAWN is drawn and not selectable. OT.R71 (2026-10-22) offers respawn on every server that hosts games, so by default
 * the row is the original's own, which `init_cg_screen` never disables (research 163 section 3). The original's way with a row that
 * cannot be taken on this screen is `DisableButton`: `init_cg_screen` disables CLAN OPTIONS for a player in no clan,
 * `refresh_cg_screen` ROUND TIME and ROUND COUNT while respawn is on; the layout gives RESPAWN its `DISABLED` look (the
 * text 50 50 50) and the ring passes a disabled row. So `SetMission`, `init_cg_screen`'s first statement on every
 * arrival, runs `DisableButton(Respawn)` after its own body, with the screen's other disables; nothing in the set enables
 * RESPAWN again. The respawn valve stays 0, the request's RulesSet 0, and the server refuses a game asking for respawn
 * (`RESPAWN_REFUSED_STATUS_PLACEHOLDER`). [reading]
 */
export const RESPAWN_ROW_DISABLED_READING = 'DisableButton(Respawn) with init_cg_screen\'s first row, every arrival' as const;

/** The animation whose first statement is `SetMission(NONE)` on this dialog. */
const INIT_ANIMATION = 'init_cg_screen';
/** The lobby's state in the menus (`FUN_002f9410` answers 0 unless the session is up in state 11). */
const LOBBY_STATE_ONLINE = 11;

export interface CreateGameCommandsOptions {
  /**
   * OT.R71: whether RESPAWN is offered -- absent or true, the original's own row, left as `init_cg_screen` draws it; false (a
   * test's, a page whose server plays no respawn) disables it (`RESPAWN_ROW_DISABLED_READING`). Never a rule or a valve.
   */
  respawnRules?: boolean;
  /** The game's one `CUIVarManager`. */
  uiVars: UiVarManager;
  /** The launch's valve store. */
  valves: () => ValveStore;
  /** The lobby's event callback (`DAT_0044f3c8`): MP_GAME_NAME_EXISTS, MP_MEDIUS_JOIN_GAME_FAILURE into the dialog host. */
  event: (kind: number) => void;
  /** A table row run through the host (`DisableButton`, `SwitchMenu`): `mountCreateGame` fills it. */
  row: (fn: string, arg: string) => void;
  /** SVC-06's `/lobby/create-game`; absent, a request never answered. */
  service?: CreateGameService;
  /** `missionlist.rdr`'s records (the page's disc); absent, none. */
  missions?: () => readonly MissionRecord[];
  /** `FUN_002c94f0`: a mission's archive present (`MISSION_ARCHIVE_PRESENT_READING`). */
  present?: (number: number) => boolean;
  /**
   * NB-7: the map numbers the server offers CREATE GAME (its `GET /maps`'s served rule), read at each
   * `GetAvailableMPMissions`, which narrow `FIRST_RELEASE_MAPS` and never widen them (OT.R58, the owner 2026-10-16:
   * "limit create match map list to 4 maps (frostfire/crossroads/vig/nightfire)"; until then OT.R50's served offer
   * listed every map the server plays); absent or null, `FIRST_RELEASE_MAPS`. Medley and Random stay out either way
   * (`PLAY_LIST_FIRST_RELEASE_READING`).
   */
  offered?: () => readonly number[] | null;
  /**
   * BAM.R4 / P537-L2 (an adaptation: a developer's test server, product track): the server's `/maps` answer said
   * `allCreateGameMaps: true` (`CREATE_GAME_ALL_MAPS=1`; the viewer's `CreateGameOfferRead.allMaps`), so `offered` is
   * listed whole; absent or false, the offer narrows `FIRST_RELEASE_MAPS` and never widens them (OT.R58), here as at
   * the transport.
   */
  allMaps?: () => boolean;
  /** The room's world id (`DAT_0066a538`, the briefing room's join keeps it); absent or -1, none. */
  roomWorldId?: () => number;
  /** The lobby session up and its state byte (ONL-07's); absent, up in state 11. */
  lobbyUp?: () => boolean;
  lobbyState?: () => number;
  /**
   * The client's clan id (`DAT_0044f59c`: GetMyClans' `FUN_002e8bd0` writes it, D:L187810-187812, and -1 on a no-clan
   * reply, D:L187790): the client clan's (`LobbyClan.clanId`, ONL-27), GF3's low 28 bits (`clanField`); absent, -1.
   */
  clanId?: () => number;
  /**
   * The game lobby's hand-off: ONL-16a's `GameLobbyCommands.created` answers true and the screen's own `create_game`
   * goes on to the join (state 17, `ConnectToGameServer`, `JoinGameServer`, `SWITCHMENU(dlgGameLobby.rdr)`); any other
   * answer returns to the caller (`GAME_LOBBY_GATE_READING`).
   */
  created?: (game: CreatedGame) => boolean | void;
  /** A row called, as it happens. */
  log?: (name: CreateGameCommandName, arg: string, answer: boolean) => void;
}

export class CreateGameCommands {
  /** 0x414e00: the mission `SetMission` named last. */
  private missionName = '';
  /** The latest create's number: a reply to an earlier one is dropped. */
  private seq = 0;

  constructor(private readonly o: CreateGameCommandsOptions) {}

  private answer(name: CreateGameCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  private online(): boolean {
    return (this.o.lobbyUp?.() ?? true) && (this.o.lobbyState?.() ?? LOBBY_STATE_ONLINE) === LOBBY_STATE_ONLINE;
  }

  private str(name: string): string | null {
    const v = this.o.uiVars.find(name)?.value;
    return v?.type === 'string' ? v.value : null;
  }

  private valve(name: string): number | undefined { return this.o.valves().find(name)?.value; }

  /** The mission `SetMission` named last (0x414e00). */
  mission(): string { return this.missionName; }

  /**
   * `FUN_0027eb50` (D:L126657-126679): the argument (INPUT_STRING replaced), a UI variable's string when one of that
   * name holds one, copied into the current mission (0x414e00) and the game's (`FUN_002acc10`); answer 1. On this
   * dialog's `init_cg_screen` RESPAWN is left as the original draws it, offered (OT.R71); only `respawnRules` false
   * disables it (`RESPAWN_ROW_DISABLED_READING`).
   */
  SetMission: UiCommandHandler = (cmd) => {
    const held = this.str(cmd.arg);
    this.missionName = held ?? cmd.arg;
    if (cmd.anim === INIT_ANIMATION && this.o.respawnRules === false) this.o.row('DisableButton', 'Respawn');
    return this.answer('SetMission', cmd, true);
  };

  /** `FUN_00274940` (D:L121473-121555): the rows set into the named variable (added TEMPORARY); answer 1. */
  GetAvailableMPMissions: UiCommandHandler = (cmd) => {
    const vars = this.o.uiVars;
    const offer = this.o.offered?.() ?? null;                    // NB-7 / BAM.R4: transport-validated server offer; no offer keeps the four.
    // OT.R58: the four among the offer, unless the server's all-maps word (BAM.R4) lists its whole offer.
    const all = this.o.allMaps?.() === true;
    const offered = offer ? (n: number) => (all || (FIRST_RELEASE_MAPS as readonly number[]).includes(n)) && offer.includes(n) : undefined;
    const rows = availableMissionRows(this.o.missions?.() ?? [], { respawn: this.valve('mp_allow_respawn') === 1, present: this.o.present, offered });
    vars.set(vars.add(cmd.arg, null, 1), A(rows));
    return this.answer('GetAvailableMPMissions', cmd, true);
  };

  /**
   * `set_respawn_valve`'s prune (`FUN_002791e0`, D:L123748-123820; research 357 §2): keep the selected rows whose
   * mission TYPE is SUPPRESSION, in their existing order, including repeats. The script owns the backup and restore.
   */
  RemoveNonSuppressionMaps: UiCommandHandler = (cmd) => {
    const selected = this.o.uiVars.find(cmd.arg);
    if (selected?.value.type === 'array') {
      const suppression = new Set((this.o.missions?.() ?? []).filter((m) => m.type === SUPPRESSION_TYPE).map((m) => m.number));
      this.o.uiVars.set(selected, A(selected.value.value.filter((row) => {
        const number = row.type === 'array' ? row.value[0] : row;
        return number?.type === 'int' && suppression.has(number.value);
      })));
    }
    return this.answer('RemoveNonSuppressionMaps', cmd, true);
  };

  /** CreateGame1's fields (`FUN_002edda0` D:L190520-190578), the two passwords' variables emptied as it empties them. */
  request(gameName: string): CreateGameRequest {
    const vars = this.o.uiVars;
    const password = this.valve('PasswordValve') ?? 0, spectators = this.valve('MaxSpectatorsValve') ?? 0;
    if (password === 0) vars.set(vars.add('PlayerGamePassword', null, 2), S(''));
    if (spectators === 0) vars.set(vars.add('SpectatorGamePassword', null, 2), S(''));
    return {
      applicationId: CREATE_GAME_APPLICATION_ID, minPlayers: 2,
      maxPlayers: (this.valve('MaxPlayersValve') ?? 8) + spectators,
      gameLevel: 0, gameName,
      gamePassword: password === 0 ? '' : (this.str('PlayerGamePassword') ?? ''),
      spectatorPassword: spectators === 0 ? '' : (this.str('SpectatorGamePassword') ?? ''),
      playerSkillLevel: 0, rulesSet: 0, genericField1: this.o.roomWorldId?.() ?? -1, genericField2: CREATE_GAME_GENERIC_FIELD2,
      genericField3: clanField(this.valve('CreateClanAffiliation') ?? 0, this.o.clanId?.() ?? -1), gameHostType: 0,
    };
  }

  /**
   * 0x27d7d0 -> `FUN_002f9410` (D:L197720-197780): 0 unless the session is up in state 11; GAMENAMEVAR becomes
   * "<name>$~<MEDIUS_LOBBY_NAME>"; with the room known (`CREATE_LOCAL_CHECKS_READING`) `mp_persistent` 0,
   * `mp_game_sort_order` 127, CreateGame1 sent (`CREATE_GAME_STATE_ADAPTATION`) and 1; else MP_GAME_NAME_EXISTS and 0.
   */
  CreateMPGame: UiCommandHandler = (cmd) => {
    if (!this.online()) return this.answer('CreateMPGame', cmd, false);
    const vars = this.o.uiVars;
    const gameName = `${this.str('GAMENAMEVAR') ?? ''}${GAME_NAME_ROOM_SEPARATOR}${this.str('MEDIUS_LOBBY_NAME') ?? ''}`;
    vars.set(vars.add('GAMENAMEVAR', null, 2), S(gameName));
    if ((this.o.roomWorldId?.() ?? -1) < 0) {
      this.o.event(DIALOG_EVENTS.MP_GAME_NAME_EXISTS!);
      return this.answer('CreateMPGame', cmd, false);
    }
    const valves = this.o.valves();
    valves.set('mp_persistent', 0, VALVE_TYPE.PERM);
    valves.set('mp_game_sort_order', CREATED_GAME_SORT_ORDER, VALVE_TYPE.PERM);
    const req = this.request(gameName);
    const seq = ++this.seq;
    this.o.service?.createGame(req).then((r) => { if (seq === this.seq) this.reply(r, req); }, () => { /* never answered */ });
    return this.answer('CreateMPGame', cmd, true);
  };

  /**
   * cbCreateGame `FUN_002ee090` (D:L190588-190645): a failure -- with `mp_persistent` 0, as `CreateMPGame` left it --
   * posts MP_GAME_NAME_EXISTS for -975 and MP_MEDIUS_JOIN_GAME_FAILURE for any other status (the lobby back to state 11);
   * a success keeps the world id and goes on to the join (`GAME_LOBBY_GATE_READING`).
   */
  reply(r: CreateGameReply, req: CreateGameRequest): void {
    if (r.status !== 0) {
      this.o.event(r.status === CREATE_GAME_NAME_EXISTS ? DIALOG_EVENTS.MP_GAME_NAME_EXISTS! : DIALOG_EVENTS.MP_MEDIUS_JOIN_GAME_FAILURE!);
      return;
    }
    const valves: Record<string, number> = {};
    for (const n of CREATED_GAME_VALVES) valves[n] = this.valve(n) ?? 0;
    const taken = this.o.created?.({ mediusWorldId: r.mediusWorldId, ...(r.lobbyId ? { lobbyId: r.lobbyId } : {}), gameName: req.gameName, request: req, playList: playListNumbers(this.o.uiVars.find('PLAYLISTVAR')?.value), valves });
    if (taken !== true) this.o.row('SwitchMenu', PREVIOUS_SCREEN);                // GAME_LOBBY_GATE_READING: no lobby took it
  }

  /** The entries by their table name. */
  entries(): Record<CreateGameCommandName, UiCommandHandler> {
    return {
      SetMission: this.SetMission, GetAvailableMPMissions: this.GetAvailableMPMissions,
      RemoveNonSuppressionMaps: this.RemoveNonSuppressionMaps, CreateMPGame: this.CreateMPGame,
    };
  }

  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}

/** A table row as a script would run it, for the module's own calls through the host (`DisableButton`, `SwitchMenu`). */
export function rowCommand(fn: string, arg: string): ZAnimUiCommand {
  return { anim: 'CreateGameCommands', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) };
}

/** The entry the briefing room (ONL-12) or the page mounts: this module's rows registered on the session's host. */
export function mountCreateGame(host: UiCommandHost, o: Omit<CreateGameCommandsOptions, 'row'>): CreateGameCommands {
  const commands = new CreateGameCommands({ ...o, row: (fn, arg) => { host.dispatch(rowCommand(fn, arg)); } });
  commands.register(host);
  return commands;
}

/** A stand-in caller's way in: `SWITCHMENU(dlgCreateGame.rdr)`, as the briefing room's `OnCreateGamePress` runs it. */
export function openCreateGame(host: UiCommandHost): void {
  host.dispatch(rowCommand('SwitchMenu', CREATE_GAME));
}
