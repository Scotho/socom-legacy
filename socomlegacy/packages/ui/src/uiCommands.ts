import type { DialogDesign } from './dialog';
import type { ZAnimHost, ZAnimSoundCommand, ZAnimTime, ZAnimUiCommand } from './zanimRuntime';

/**
 * The UI command binding table and the host that fills PLAT-07's `ZAnimHost` (PLAT-08; web research 107).
 *
 * A `ui::UI_COMMAND` that no node takes falls back to the game's global table at 0x3dd4d0: 207 rows of
 * `{id, name, fn, fn2}` (web research 96 §4, read from `socom2_game.elf` through its program headers by
 * `tools/elfImage.ts` `readBindingTable`; `tools/test/uiCommandTableDisc.test.ts` holds this copy to the ELF row by
 * row). `UiCommandHost.uiCommand` is the tick `FUN_002745a0` (D:L121344-121431, `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`):
 *
 * 1. With a node (`nodeIndex` != 0) the node's object is asked first (D:L121370-121385, its vtable +100): when it takes
 *    the command its answer stands (written through a pointer the dispatcher set to 1 beforehand, D:L121365).
 * 2. Otherwise the key is byte +10 of the command when non-zero (D:L121389-121391); else the name `names[+6]` is looked
 *    up (D:L121392-121407): no name 0xE8, an empty one 0, else the walk from row 0 while the next row's id is non-zero,
 *    comparing with `FUN_00198b80` (case-insensitive, `uiCommandFold`), the first match's **id**, none 0. The original
 *    caches the key in byte +10 (D:L121409); this host's lookup is a pure function of the name, so it recomputes it.
 * 3. The row whose id is the key, with a non-null `fn`, answers through `fn(cmd, ...)` (D:L121411-121427); no such row
 *    -- key 0, 0xE8, 30 -- and the answer is 1 (D:L121428-121430).
 *
 * This task implements only the dispatcher and the four rows whose whole body is a constant (`UI_COMMAND_TABLE`'s
 * `status: 'here'`); every other row is `declared` for the roadmap task that owns its body (`task`) or `unknown`, and a
 * call of one is the typed outcome `not implemented: <task>`, logged, answering the row's cited constant return or
 * `UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER`. Every row cites where the original's answer comes from
 * (`uiCommandCitation`: its block, or the instructions of a body the decompiler folds away, `folded`), and carries the
 * block's Gap's class (`category`).
 *
 * `fn2` (11 rows) is never called by the dispatcher (it calls only the word at +8). Each of the 11 bodies allocates a
 * zeroed record (`FUN_0034eae0(1, size)`, D:L248953), marks its header timeless with the record's size, writes the
 * key of a name it is given into +6 by the same walk (e.g. `FUN_0027fbc0` D:L127209-127264, `FUN_0027fd70`
 * D:L127267-127320) and fills the rest from named parameters (`ARGUMENT`, `RECIP_UIVAR`, `From`, `To`, `INDEX`, ...,
 * read with `FUN_0032ee10`): a builder of the command's longer record from a parameter list. Its caller was not found
 * (nothing in the decompilation reads +12 of a row); the disc's scripts arrive compiled, so the port needs none.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** A row's status: its body implemented here; declared for the roadmap task named in `task`; or no task found. */
export type UiCommandStatus = 'here' | 'declared' | 'unknown';

/**
 * The block's Gap's classes (research 107 §4): UI pure (screens, buttons, popups), valve/state (UI variables, options,
 * the ARMORY's selection), card (memory card and saved games), movie, music/stream, net/Medius (segments 05/06), mission
 * (the campaign's state, DEFERRED) and system (the IOP, the network configuration, video mode, the pad, the locale).
 */
export type UiCommandCategory = 'ui' | 'valve' | 'card' | 'movie' | 'music' | 'net' | 'mission' | 'system';

/**
 * What the instructions of a row function with no decompiled block show (research 107 §5; read from the ELF, held to it
 * by `tools/test/uiCommandTableDisc.test.ts`):
 * - `leaf`: the whole body is `jr ra` with the answer set in its delay slot at `ret`;
 * - `tail`: a tail jump `j target` at `at`: the answer is `target`'s return, whose block is `lines` (null: none);
 * - `state`: the answer is computed from the globals loaded from `reads`, up to the `jr ra` at `ret`;
 * - `return`: the body's one `jr ra`, which every branch reaches through `addiu v0, zero, 1` at `ret` (nothing after it
 *   writes v0): the constant 1;
 * - `unread`: a longer body whose answer is not that constant and was not traced.
 */
export type UiCommandFolded =
  | { kind: 'leaf'; ret: number }
  | { kind: 'tail'; at: number; target: number; lines: readonly [number, number] | null }
  | { kind: 'state'; reads: readonly number[]; ret: number }
  | { kind: 'return'; ret: number }
  | { kind: 'unread' };

/** One row of the table at 0x3dd4d0, and its classification (research 107 §4). */
export interface UiCommandRow {
  /** The row's place in the table (0..206). */
  index: number;
  /** The row's id (+0): the key a lookup returns. 1..208, 30 unused. */
  id: number;
  /** The name (+4), as the ELF spells it; matched case-insensitively. */
  name: string;
  /** The function the dispatcher calls (+8). */
  fn: number;
  /** The record builder (+12), 0 for none (11 rows have one; see the module's doc). */
  fn2: number;
  status: UiCommandStatus;
  /** The roadmap task that owns the body (`declared`); null for `here` and `unknown`. */
  task: string | null;
  /**
   * The body's answer when it is a constant: 1 (true) or 0 (false) at every `return` of `fn`'s decompiled body (the
   * lines in `lines`), or of its disassembly where the decompiler folds it away; null when the answer depends on state
   * or the body was not read.
   */
  answer: boolean | null;
  /** `fn`'s block in the decompilation, from its `// ---- FUN_` line to its closing brace; null when it has none. */
  lines: readonly [number, number] | null;
  /** When `lines` is null: what `fn`'s instructions show (null when it has a block). */
  folded: UiCommandFolded | null;
  category: UiCommandCategory;
}

type RowTuple = readonly [id: number, name: string, fn: number, fn2: number, status: UiCommandStatus, task: string | null,
  answer: boolean | null, lines: readonly [number, number] | null];

/**
 * The 207 rows in table order. The body answers: research 107 §5 (a scan of each block's `return` statements; for the
 * 40 rows with no block, their instructions read from the ELF: `FOLDED`). The owners: research 107 §4 (the roadmap block that names the
 * command, else the screen task of the dialogs whose scripts call it).
 */
const ROWS: readonly RowTuple[] = [
  [1, 'SetMission', 0x27eb50, 0, 'declared', 'ONL-13', true, [126655, 126679]],
  [2, 'IsMissionSuccessful', 0x280770, 0, 'declared', 'MENU-16', null, null],
  [3, 'ChooseEquipment', 0x2828b0, 0, 'declared', 'PLAT-34', null, [128568, 128601]],
  [4, 'ChoosePrimary', 0x2827e0, 0, 'declared', 'PLAT-34', null, [128532, 128565]],
  [5, 'ChooseSecondary', 0x2826c0, 0, 'declared', 'PLAT-34', null, [128494, 128529]],
  [6, 'ChooseEquip1', 0x2825e0, 0, 'declared', 'PLAT-34', null, [128458, 128491]],
  [7, 'ChooseEquip2', 0x282500, 0, 'declared', 'PLAT-34', null, [128422, 128455]],
  [8, 'ChooseEquip3', 0x282420, 0, 'declared', 'PLAT-34', null, null],
  [9, 'UpdateSelItemValves', 0x282410, 0, 'declared', 'PLAT-34', null, null],
  [10, 'ChooseDefaultEquipment', 0x282980, 0, 'declared', 'PLAT-34', true, [128604, 128650]],
  [11, 'RemoveEquipment', 0x2800c0, 0, 'declared', 'PLAT-34', true, [127398, 127432]],
  [12, 'IsEquipmentSelected', 0x280790, 0, 'declared', 'PLAT-34', null, [127644, 127684]],
  [13, 'SwitchMenu', 0x27e720, 0, 'declared', 'MENU-01', true, [126554, 126639]],
  [14, 'PopUpDialog', 0x27eb10, 0, 'declared', 'MENU-01', true, [126642, 126652]],
  [15, 'KillPopUp', 0x27d190, 0, 'declared', 'MENU-01', true, [125846, 125859]],
  [16, 'ActivateButton', 0x27c360, 0, 'declared', 'MENU-01', true, [125375, 125392]],
  [17, 'ClearGameState', 0x27c7e0, 0, 'here', null, true, null],
  [18, 'GetTextInput', 0x2808d0, 0x395f40, 'declared', 'MENU-01', true, null],
  [19, 'EnableButton', 0x27c260, 0, 'declared', 'MENU-01', true, [125355, 125372]],
  [20, 'DisableButton', 0x27c160, 0, 'declared', 'MENU-01', true, [125335, 125352]],
  [21, 'StoreOptions', 0x27b960, 0, 'declared', 'MENU-01', true, [125111, 125258]],
  [22, 'InitOptions', 0x27b420, 0, 'declared', 'MENU-01', true, [124947, 125060]],
  [23, 'PlayMPEG', 0x27ab30, 0x27ad60, 'declared', 'MENU-01', null, [124609, 124673]],
  [24, 'IsTerrorist', 0x27d160, 0, 'declared', 'ONL-16', null, [125834, 125843]],
  [25, 'SwitchSides', 0x27d100, 0, 'declared', 'ONL-16', true, [125816, 125831]],
  [31, 'SendChatText', 0x27cb80, 0x27fbc0, 'declared', 'ONL-23', true, [125617, 125624]],
  [75, 'VCButton', 0x27e1c0, 0, 'declared', 'SVC-22', true, null],
  [26, 'ToggleAutoMessages', 0x27c750, 0, 'declared', 'ONL-15', true, [125470, 125489]],
  [27, 'SetFilters', 0x27c460, 0, 'declared', 'ONL-15', true, [125395, 125467]],
  [28, 'ReadyToLoad', 0x27caf0, 0, 'declared', 'ONL-16', true, [125593, 125614]],
  [29, 'SetMenuState', 0x27c9f0, 0, 'declared', 'MENU-01', true, [125558, 125590]],
  [32, 'IsSessionMaster', 0x27e6e0, 0, 'declared', 'ONL-16', null, null],
  [33, 'InitNetwork', 0x276dc0, 0, 'declared', 'ONL-03', null, [122649, 122690]],
  [34, 'UnInitNetwork', 0x27e5c0, 0, 'declared', 'ONL-10', true, [126505, 126515]],
  [35, 'ConnectToGameServer', 0x27e4c0, 0, 'declared', 'ONL-16', null, [126454, 126477]],
  [73, 'JoinGameServer', 0x27e380, 0, 'declared', 'ONL-16', null, [126407, 126428]],
  [36, 'DisconnectFromGameServer', 0x27e420, 0, 'declared', 'ONL-22', true, [126431, 126451]],
  [37, 'LobbyRegister', 0x27dde0, 0, 'declared', 'ONL-07', null, [126272, 126300]],
  [38, 'GetAcctInfo', 0x27dc80, 0, 'here', null, false, null],
  [39, 'LobbyLogin', 0x27dd20, 0, 'declared', 'ONL-07', null, [126241, 126269]],
  [41, 'RefreshGameList', 0x27db40, 0, 'declared', 'ONL-12', null, [126173, 126210]],
  [42, 'RefreshRoomList', 0x27daa0, 0, 'declared', 'ONL-11', null, [126149, 126170]],
  [43, 'RefreshRoomPlayerList', 0x27d900, 0, 'declared', 'ONL-12', null, [126105, 126146]],
  [44, 'CreateMPGame', 0x27d7d0, 0, 'declared', 'ONL-13', null, [126048, 126065]],
  [45, 'JoinMPGame', 0x27d730, 0, 'declared', 'ONL-12', null, [126023, 126045]],
  [74, 'CheckJoinMP', 0x27e2b0, 0, 'declared', 'ONL-12', true, [126377, 126404]],
  [46, 'MediusEnabled', 0x27aff0, 0, 'unknown', null, null, null],
  [40, 'LobbyLogout', 0x27dcc0, 0, 'declared', 'ONL-10', null, [126223, 126238]],
  [84, 'LobbyBailout', 0x27dc90, 0, 'declared', 'ONL-22', true, [126213, 126220]],
  [47, 'JoinMPRoom', 0x27d270, 0, 'declared', 'ONL-11', null, null],
  [48, 'SendMediusChat', 0x27d220, 0x27fbc0, 'declared', 'ONL-23', true, [125872, 125879]],
  [49, 'GetMediusAnnouncements', 0x27d1f0, 0, 'declared', 'ONL-09', true, [125862, 125869]],
  [50, 'CreateClan', 0x27a950, 0, 'declared', 'ONL-26', true, [124567, 124586]],
  [51, 'DisbandClan', 0x27a920, 0, 'declared', 'ONL-27', true, null],
  [52, 'IsMemberOfClan', 0x27a910, 0, 'declared', 'ONL-27', null, null],
  [53, 'IsLeaderOfClan', 0x27a890, 0, 'declared', 'ONL-27', null, [124550, 124564]],
  [54, 'GetClan', 0x27aa60, 0, 'declared', 'ONL-27', null, null],
  [55, 'IsMemCardInserted', 0x27e1b0, 0, 'declared', 'OPT-05a', null, null],
  [56, 'IsMemCardFormatted', 0x27e1a0, 0, 'declared', 'OPT-05a', null, null],
  [57, 'IsSpaceForSaveGameFile', 0x27b3d0, 0, 'declared', 'OPT-05a', null, [124930, 124944]],
  [58, 'FormatMemCard', 0x27e110, 0, 'declared', 'OPT-05a', null, null],
  [59, 'DoesSlotHaveGame', 0x27dfe0, 0, 'declared', 'OPT-05a', null, [126346, 126374]],
  [60, 'LoadSavedGame', 0x27fa40, 0, 'declared', 'MENU-13', true, [127166, 127189]],
  [61, 'SaveSavedGame', 0x27f820, 0, 'declared', 'MENU-12', true, null],
  [62, 'ListSavedGames', 0x2801c0, 0, 'declared', 'MENU-13', true, [127435, 127556]],
  [63, 'LoadConfig', 0x27b0e0, 0, 'declared', 'OPT-05a', true, [124789, 124813]],
  [64, 'SaveConfig', 0x27b000, 0, 'declared', 'OPT-05a', true, [124762, 124786]],
  [65, 'MC_ChDir', 0x27b300, 0, 'declared', 'OPT-05a', null, [124890, 124900]],
  [66, 'MC_ChPort', 0x27b260, 0, 'declared', 'OPT-05a', true, [124858, 124874]],
  [67, 'MC_ChSlot', 0x27b200, 0, 'declared', 'OPT-05a', true, [124839, 124855]],
  [68, 'MC_Exists', 0x27b1c0, 0, 'declared', 'OPT-05a', null, [124826, 124836]],
  [69, 'MC_MkDir', 0x27b2c0, 0, 'declared', 'OPT-05a', null, [124877, 124887]],
  [70, 'MC_CreateIconFiles', 0x27b190, 0, 'declared', 'OPT-05a', true, [124816, 124823]],
  [71, 'ReplayMission', 0x280040, 0, 'declared', 'ONL-20', true, [127379, 127395]],
  [72, 'CloseAndSwitch', 0x281a70, 0, 'declared', 'ONL-20', true, [128101, 128133]],
  [76, 'InvitePlayerToClan', 0x27a740, 0, 'declared', 'ONL-28', null, [124510, 124547]],
  [77, 'RevokeInvite', 0x27a310, 0, 'declared', 'ONL-28', null, [124363, 124377]],
  [78, 'RemovePlayerFromClan', 0x27a840, 0, 'declared', 'ONL-27', true, null],
  [79, 'GetInvitedPlayers', 0x27a3f0, 0, 'declared', 'ONL-28', true, [124400, 124407]],
  [80, 'GetClanRoster', 0x27a390, 0, 'declared', 'ONL-27', true, [124380, 124387]],
  [81, 'SendClanMessage', 0x2797f0, 0, 'declared', 'ONL-29', null, [123956, 123993]],
  [82, 'IsClanChallengeGame', 0x2795d0, 0, 'here', null, false, null],
  [83, 'AdvanceMPMission', 0x279490, 0, 'declared', 'ONL-16', true, [123842, 123884]],
  [85, 'CheckMyInvites', 0x27a3c0, 0, 'declared', 'ONL-28', true, [124390, 124397]],
  [86, 'HaveBeenBannedFromGame', 0x278ea0, 0, 'declared', 'ONL-22', null, null],
  [87, 'GameStatePopCommand', 0x278df0, 0, 'declared', 'ONL-20', true, [123729, 123745]],
  [88, 'SetDefaultMenuScreen', 0x278d60, 0, 'declared', 'PLAT-10', true, [123712, 123726]],
  [89, 'BanSelfFromGame', 0x278d30, 0, 'declared', 'SVC-23', true, [123702, 123709]],
  [90, 'ChangeCharacterType', 0x2795e0, 0, 'declared', 'PLAT-34', true, [123887, 123933]],
  [93, 'GetNumSavedGames', 0x27dea0, 0, 'declared', 'OPT-05a', true, [126303, 126343]],
  [94, 'RefreshGamePlayerList', 0x27d820, 0, 'declared', 'ONL-16', null, [126068, 126089]],
  [91, 'QuitClan', 0x278d00, 0, 'declared', 'ONL-27', true, [123692, 123699]],
  [92, 'GetLadderInfo', 0x2784d0, 0x278750, 'declared', 'ONL-30a', null, [123407, 123492]],
  [95, 'TestUIVar', 0x278200, 0, 'declared', 'MENU-01', null, [123324, 123365]],
  [96, 'SetControllerConfig', 0x27fb40, 0, 'declared', 'MENU-01', true, [127192, 127206]],
  [97, 'AbortLoad', 0x278060, 0, 'declared', 'ONL-18', false, [123260, 123270]],
  [98, 'ForceMPLaunch', 0x27d070, 0, 'declared', 'ONL-16', true, [125792, 125813]],
  [99, 'CheckForcedLaunch', 0x27cbf0, 0, 'declared', 'ONL-16', true, [125642, 125789]],
  [100, 'IsNetwork', 0x27e6d0, 0, 'unknown', null, null, null],
  [101, 'SetPlayerDescription', 0x277640, 0, 'declared', 'OPT-15', true, [122933, 122945]],
  [102, 'UpdateClanStats', 0x277610, 0, 'declared', 'ONL-27', true, [122923, 122930]],
  [103, 'NotOnCorrectClanTeam', 0x2775e0, 0, 'declared', 'SVC-11', null, [122911, 122920]],
  [104, 'IsSwitchTeamsOK', 0x277420, 0, 'declared', 'ONL-16', null, null],
  [105, 'NetCnfInit', 0x278040, 0, 'declared', 'ONL-01', true, [123250, 123257]],
  [106, 'NetCnfUninit', 0x278020, 0, 'declared', 'ONL-01', true, [123240, 123247]],
  [107, 'NetCnfOpen', 0x277dd0, 0, 'declared', 'ONL-01', null, [123168, 123237]],
  [108, 'NetCnfClose', 0x277d50, 0, 'declared', 'ONL-01', true, [123151, 123165]],
  [109, 'NetCnfCurrCombo', 0x277bf0, 0, 'declared', 'ONL-01', true, [123098, 123148]],
  [110, 'NetGetInterfaceList', 0x277970, 0, 'declared', 'ONL-01', true, null],
  [111, 'NetCnfSelectCombo', 0x277ab0, 0, 'declared', 'ONL-01', null, [123055, 123095]],
  [112, 'ForceMediusStatusReport', 0x2776b0, 0, 'declared', 'ONL-16', true, [122948, 122955]],
  [113, 'AcceptInvitation', 0x277550, 0, 'declared', 'ONL-28', true, [122892, 122908]],
  [114, 'DeclineInvitation', 0x2774c0, 0, 'declared', 'ONL-28', true, [122873, 122889]],
  [115, 'TransferLeadership', 0x277430, 0, 'declared', 'ONL-27', true, null],
  [116, 'PasswordSecurity', 0x277400, 0, 'declared', 'ONL-01', true, [122863, 122870]],
  [117, 'SetTtySpeedFactor', 0x27ff20, 0, 'declared', 'MENU-01', true, [127337, 127355]],
  [118, 'SetCounterSpeedFactor', 0x27ffb0, 0, 'declared', 'MENU-01', true, [127358, 127376]],
  [119, 'SetMPMissionSeq', 0x278eb0, 0, 'declared', 'ONL-14', true, null],
  [120, 'SetStickPreset', 0x27b790, 0, 'declared', 'MENU-01', true, [125063, 125108]],
  [121, 'RebootIOP', 0x2777f0, 0, 'declared', 'MENU-01', true, [122994, 123032]],
  [122, 'GameHasPassword', 0x27d390, 0, 'declared', 'ONL-13', null, [125899, 125919]],
  [171, 'GameHasSpectatorPassword', 0x27d310, 0, 'declared', 'ONL-13', null, [125882, 125896]],
  [123, 'NetCensorText', 0x2776e0, 0, 'declared', 'SVC-23', true, [122958, 122979]],
  [124, 'ClanHasInvitations', 0x277960, 0, 'declared', 'ONL-28', null, null],
  [125, 'SwitchProgressiveVideo', 0x27bf90, 0, 'declared', 'MENU-01', true, [125281, 125306]],
  [126, 'CheckVideoMode', 0x27c070, 0, 'declared', 'MENU-01', null, [125309, 125332]],
  [127, 'StopAllSounds', 0x277930, 0, 'declared', 'MENU-01', true, [123045, 123052]],
  [128, 'FadeAllSounds', 0x277910, 0, 'declared', 'MENU-01', true, [123035, 123042]],
  [129, 'SysPostInit', 0x277390, 0, 'declared', 'MENU-01', true, [122844, 122860]],
  [130, 'HasClanInvitations', 0x277950, 0, 'declared', 'ONL-28', null, null],
  [131, 'SysLoadIRX', 0x277300, 0, 'unknown', null, true, [122826, 122841]],
  [132, 'FlushMenuHistory', 0x27c7f0, 0, 'declared', 'MENU-01', true, [125492, 125512]],
  [133, 'InvitePlayerToClanWithArg', 0x27a6c0, 0, 'declared', 'ONL-28', null, [124493, 124507]],
  [134, 'PlayMPEGNoFade', 0x27aa70, 0, 'declared', 'MENU-01', null, null],
  [135, 'VagStreaming', 0x27a5e0, 0, 'declared', 'MENU-01', true, [124465, 124490]],
  [136, 'BackgroundMPEG', 0x27a420, 0, 'declared', 'MENU-01', true, [124410, 124436]],
  [137, 'AutoAim', 0x27a510, 0, 'declared', 'OPT-13', true, [124439, 124462]],
  [138, 'GetClanMessages', 0x279790, 0, 'declared', 'ONL-29', true, [123936, 123943]],
  [139, 'PruneUIVarSpaces', 0x278370, 0, 'declared', 'MENU-01', true, [123368, 123404]],
  [140, 'GetUsagePolicy', 0x2797c0, 0, 'declared', 'ONL-08', true, [123946, 123953]],
  [141, 'MC_Changed', 0x27b340, 0, 'declared', 'OPT-05a', null, [124903, 124927]],
  [142, 'DoAllSelCharsHaveWeapon', 0x2808e0, 0, 'declared', 'PLAT-34', null, null],
  [143, 'ChooseDefaultEquipmentOnly', 0x281be0, 0, 'declared', 'PLAT-34', true, [128146, 128198]],
  [144, 'ClearUIVar', 0x2780a0, 0, 'declared', 'MENU-01', true, [123273, 123321]],
  [145, 'UpdateMpFinalStatsUiVars', 0x27ff00, 0, 'declared', 'ONL-20', true, [127327, 127334]],
  [146, 'CleanupMissionMemory', 0x281bc0, 0, 'declared', 'MENU-01', true, [128136, 128143]],
  [147, 'CheckTeamStatus', 0x2772c0, 0, 'unknown', null, null, null],
  [148, 'SelectLocale', 0x279400, 0, 'declared', 'BOOT-08', true, [123823, 123839]],
  [149, 'DMEInit', 0x276ce0, 0, 'declared', 'ONL-03', true, [122614, 122646]],
  [150, 'MediusInit', 0x276c60, 0, 'declared', 'ONL-03', true, [122586, 122611]],
  [151, 'GetServerList', 0x2fb080, 0, 'declared', 'ONL-03', null, [198609, 198652]],
  [152, 'LobbyConnect', 0x276780, 0, 'declared', 'ONL-07', null, [122454, 122545]],
  [153, 'LobbyDisconnect', 0x274d60, 0, 'declared', 'ONL-04', true, [121599, 121614]],
  [154, 'UpdateAcctInfo', 0x275130, 0, 'declared', 'ONL-06', true, [121727, 121796]],
  [155, 'UpdateServerInfo', 0x274c00, 0, 'declared', 'ONL-04', true, [121558, 121596]],
  [156, 'ClanGameClosed', 0x27d4c0, 0, 'declared', 'SVC-11', null, [125939, 125953]],
  [157, 'GetFriendsList', 0x27a2e0, 0, 'declared', 'ONL-24', true, [124353, 124360]],
  [158, 'RemoveFriend', 0x279980, 0, 'declared', 'ONL-24', true, [124017, 124035]],
  [159, 'GetLeaderMessages', 0x27a0b0, 0, 'declared', 'ONL-29', true, [124272, 124279]],
  [160, 'ModifyClanMessage', 0x27a0e0, 0, 'declared', 'ONL-29', true, [124282, 124301]],
  [161, 'DeleteClanMessage', 0x27a1c0, 0, 'declared', 'ONL-29', true, [124304, 124320]],
  [162, 'GetClanRanking', 0x27a250, 0, 'declared', 'ONL-30', true, [124323, 124330]],
  [163, 'AddFriend', 0x27a050, 0, 'declared', 'ONL-24', true, [124254, 124269]],
  [164, 'GetFriendInfo', 0x279ab0, 0, 'declared', 'ONL-24', true, [124057, 124075]],
  [165, 'GetIgnoreList', 0x27a280, 0, 'declared', 'ONL-25', true, [124333, 124340]],
  [166, 'RemoveFromIgnore', 0x2798e0, 0, 'declared', 'ONL-25', true, [123996, 124014]],
  [167, 'AddToIgnore', 0x279f50, 0, 'declared', 'ONL-25', true, [124215, 124230]],
  [168, 'ConfirmFriend', 0x279eb0, 0, 'declared', 'ONL-24', true, [124194, 124212]],
  [169, 'RejectFriend', 0x279e10, 0, 'declared', 'ONL-24', true, [124173, 124191]],
  [170, 'AddFriendDirectly', 0x279fb0, 0, 'declared', 'ONL-24', true, [124233, 124251]],
  [172, 'GetGameInfo', 0x279d50, 0, 'declared', 'ONL-12', true, [124148, 124170]],
  [173, 'GetPlayerInfo', 0x279b50, 0x279bf0, 'declared', 'ONL-30a', true, [124078, 124094]],
  [174, 'GetClanMemberInfo', 0x279a20, 0, 'declared', 'ONL-27', true, [124038, 124054]],
  [175, 'GetMUISPersonaInfo', 0x275350, 0x2756a0, 'declared', 'ONL-06', true, [121799, 121888]],
  [176, 'DeleteMUISPersona', 0x2761a0, 0, 'declared', 'ONL-06', true, [122290, 122391]],
  [177, 'CompareValues', 0x274db0, 0x274fc0, 'declared', 'MENU-01', null, [121617, 121672]],
  [178, 'MUISPersonaExists', 0x276580, 0, 'declared', 'ONL-06', null, [122394, 122426]],
  [179, 'GetAvailableMPMissions', 0x274940, 0, 'declared', 'ONL-14', true, [121471, 121555]],
  [180, 'DoAllSelCharsHaveEquip1', 0x281080, 0, 'declared', 'PLAT-34', null, null],
  [181, 'DoAllSelCharsHaveEquip2', 0x281070, 0, 'declared', 'PLAT-34', null, null],
  [182, 'DoAllSelCharsHaveEquip3', 0x281060, 0, 'declared', 'PLAT-34', null, null],
  [183, 'HostLANGame', 0x27e540, 0, 'declared', 'MENU-08', null, [126480, 126502]],
  [184, 'ClanGameSwapSides', 0x27d540, 0, 'declared', 'SVC-11', null, [125956, 125999]],
  [185, 'CanJoinRoom', 0x27d690, 0, 'declared', 'ONL-11', null, [126002, 126020]],
  [186, 'CharacterProfile', 0x275770, 0x275d30, 'declared', 'PLAT-34', null, [121919, 122131]],
  [187, 'SuspendMenuInput', 0x277220, 0, 'declared', 'MENU-01', true, [122805, 122823]],
  [188, 'GetMissionInformation', 0x275ef0, 0x276080, 'declared', 'ONL-15', true, [122200, 122252]],
  [189, 'CopyUIVar', 0x281090, 0x27fd70, 'declared', 'MENU-01', null, null],
  [190, 'CanInviteMorePlayersToClan', 0x27a830, 0, 'declared', 'ONL-28', null, null],
  [191, 'ClearCareerStats', 0x27aa30, 0, 'declared', 'MENU-01', true, [124599, 124606]],
  [192, 'GameRejectsRank', 0x27d440, 0, 'declared', 'SVC-14', null, [125922, 125936]],
  [194, 'SetCareerStatsUIVars', 0x27aa00, 0, 'declared', 'MENU-01', true, [124589, 124596]],
  [193, 'IsControllerConnected', 0x277150, 0, 'declared', 'MENU-01', null, [122778, 122802]],
  [195, 'DownloadPatch', 0x2ca340, 0, 'declared', 'ONL-05', null, [169368, 169431]],
  [196, 'DeletePatch', 0x2ca330, 0, 'here', null, true, null],
  [197, 'VerifyPatchLevel', 0x2766b0, 0, 'declared', 'ONL-05', null, [122429, 122451]],
  [198, 'RemoveNonSuppressionMaps', 0x2791e0, 0, 'declared', 'ONL-14', true, [123748, 123820]],
  [199, 'DNASAuthenticate', 0x2cc670, 0, 'declared', 'ONL-03', null, [170469, 170513]],
  [200, 'SetScreenOrigin', 0x27bf10, 0, 'declared', 'MENU-01', true, [125261, 125278]],
  [201, 'DoAllSelCharsHaveLockedEquip1', 0x281050, 0, 'declared', 'PLAT-34', null, null],
  [202, 'DoAllSelCharsHaveLockedEquip2', 0x281040, 0, 'declared', 'PLAT-34', null, null],
  [203, 'DoAllSelCharsHaveLockedEquip3', 0x281030, 0, 'declared', 'PLAT-34', null, null],
  [204, 'IsMemcardSaveOK', 0x27e120, 0, 'declared', 'OPT-05a', null, null],
  [205, 'HardDriveOperation', 0x278980, 0, 'declared', 'MENU-01', null, [123579, 123656]],
  [206, 'GetFriendInvitations', 0x27a2b0, 0, 'declared', 'ONL-24', true, [124343, 124350]],
  [207, 'CanCharactersSelectUIWeapon', 0x280d60, 0, 'declared', 'PLAT-34', null, [127687, 127735]],
  [208, 'InitializeOnlineArmory', 0x27d8c0, 0, 'declared', 'ONL-17', true, [126092, 126102]],
];

/**
 * The 40 rows with no block, by name: what their first instructions show (research 107 §5). The tail targets' blocks:
 * `FUN_00282140` D:L128327-128419, `FUN_0038d770` D:L283988-284046 (its one exit `return 1`, D:L284045: GetTextInput's
 * constant), `FUN_002e6830` D:L186491-186497, `FUN_002e8a90` D:L187723-187766, `FUN_003a1650` D:L295921-295953,
 * `FUN_003a1580` D:L295886-295918, `FUN_003a12e0` D:L295810-295831, `FUN_002c3550` D:L164913-165084, `FUN_002f8ce0`
 * D:L197459-197476, `FUN_00281160` D:L127787-127924, `FUN_002815d0` D:L127927-128060; 0x2e7290, 0x2e8770 and 0x2e5fe0
 * have none.
 */
const FOLDED: Readonly<Record<string, UiCommandFolded>> = {
  ClearGameState: { kind: 'leaf', ret: 0x27c7e4 },
  GetAcctInfo: { kind: 'leaf', ret: 0x27dc84 },
  IsClanChallengeGame: { kind: 'leaf', ret: 0x2795d4 },
  DeletePatch: { kind: 'leaf', ret: 0x2ca334 },
  UpdateSelItemValves: { kind: 'tail', at: 0x282410, target: 0x282140, lines: [128327, 128419] },
  GetTextInput: { kind: 'tail', at: 0x2808d0, target: 0x38d770, lines: [283988, 284046] },
  IsMemberOfClan: { kind: 'tail', at: 0x27a914, target: 0x2e6830, lines: [186491, 186497] },
  GetClan: { kind: 'tail', at: 0x27aa64, target: 0x2e8a90, lines: [187723, 187766] },
  IsMemCardInserted: { kind: 'tail', at: 0x27e1b4, target: 0x3a1650, lines: [295921, 295953] },
  IsMemCardFormatted: { kind: 'tail', at: 0x27e1a4, target: 0x3a1580, lines: [295886, 295918] },
  FormatMemCard: { kind: 'tail', at: 0x27e114, target: 0x3a12e0, lines: [295810, 295831] },
  HaveBeenBannedFromGame: { kind: 'tail', at: 0x278ea0, target: 0x2c3550, lines: [164913, 165084] },
  IsSwitchTeamsOK: { kind: 'tail', at: 0x277424, target: 0x2f8ce0, lines: [197459, 197476] },
  ClanHasInvitations: { kind: 'tail', at: 0x277964, target: 0x2e7290, lines: null },
  HasClanInvitations: { kind: 'tail', at: 0x277954, target: 0x2e8770, lines: null },
  CanInviteMorePlayersToClan: { kind: 'tail', at: 0x27a834, target: 0x2e5fe0, lines: null },
  DoAllSelCharsHaveEquip1: { kind: 'tail', at: 0x281084, target: 0x281160, lines: [127787, 127924] },
  DoAllSelCharsHaveEquip2: { kind: 'tail', at: 0x281074, target: 0x281160, lines: [127787, 127924] },
  DoAllSelCharsHaveEquip3: { kind: 'tail', at: 0x281064, target: 0x281160, lines: [127787, 127924] },
  DoAllSelCharsHaveLockedEquip1: { kind: 'tail', at: 0x281054, target: 0x2815d0, lines: [127927, 128060] },
  DoAllSelCharsHaveLockedEquip2: { kind: 'tail', at: 0x281044, target: 0x2815d0, lines: [127927, 128060] },
  DoAllSelCharsHaveLockedEquip3: { kind: 'tail', at: 0x281034, target: 0x2815d0, lines: [127927, 128060] },
  IsMissionSuccessful: { kind: 'state', reads: [0x4364f8], ret: 0x28077c },                  // the byte == 2
  MediusEnabled: { kind: 'state', reads: [0x45a1c8], ret: 0x27aff4 },                        // the byte
  IsNetwork: { kind: 'state', reads: [0x45a0c1], ret: 0x27e6d4 },                            // the byte
  IsSessionMaster: { kind: 'state', reads: [0x45a0c1, 0x45a0c0], ret: 0x27e710 },            // both bytes non-zero
  CheckTeamStatus: { kind: 'state', reads: [0x437ce8, 0x45a0c0, 0x441470], ret: 0x2772f8 },  // w1 && (b2 || w3)
  DisbandClan: { kind: 'return', ret: 0x27a938 },                                         // after a call of 0x2e6850
  RemovePlayerFromClan: { kind: 'return', ret: 0x27a878 },                                // after a call of 0x2e7450
  TransferLeadership: { kind: 'return', ret: 0x2774a4 },                                  // after 0x2e81b0; jr ra at 0x2774ac
  VCButton: { kind: 'return', ret: 0x27e298 },                                            // its branches reach 0x27e290 at most
  SaveSavedGame: { kind: 'return', ret: 0x27fa30 },                                       // its branches reach 0x27fa28 at most
  ChooseEquip3: { kind: 'unread' },
  JoinMPRoom: { kind: 'unread' },
  NetGetInterfaceList: { kind: 'return', ret: 0x277a8c },                                 // its branches reach 0x277a68 at most
  SetMPMissionSeq: { kind: 'return', ret: 0x2791c8 },                                     // its branches reach 0x2791c0 at most
  PlayMPEGNoFade: { kind: 'unread' },
  DoAllSelCharsHaveWeapon: { kind: 'unread' },
  CopyUIVar: { kind: 'unread' },
  IsMemcardSaveOK: { kind: 'unread' },
};

/**
 * Every category but `net`, by name (the rule: research 107 §4). Every other row is net/Medius: the online owners'
 * (ONL-*, SVC-*) bar the NetCnf layer, MediusEnabled, IsNetwork, CheckTeamStatus, HostLANGame, and three stubs here.
 */
const CATEGORY: Readonly<Record<Exclude<UiCommandCategory, 'net'>, readonly string[]>> = {
  ui: ['SwitchMenu', 'PopUpDialog', 'KillPopUp', 'ActivateButton', 'EnableButton', 'DisableButton', 'GetTextInput',
    'SetMenuState', 'FlushMenuHistory', 'SuspendMenuInput', 'SetDefaultMenuScreen'],
  valve: ['ChooseEquipment', 'ChoosePrimary', 'ChooseSecondary', 'ChooseEquip1', 'ChooseEquip2', 'ChooseEquip3',
    'UpdateSelItemValves', 'ChooseDefaultEquipment', 'RemoveEquipment', 'IsEquipmentSelected', 'ChangeCharacterType',
    'DoAllSelCharsHaveWeapon', 'ChooseDefaultEquipmentOnly', 'DoAllSelCharsHaveEquip1', 'DoAllSelCharsHaveEquip2',
    'DoAllSelCharsHaveEquip3', 'CharacterProfile', 'DoAllSelCharsHaveLockedEquip1', 'DoAllSelCharsHaveLockedEquip2',
    'DoAllSelCharsHaveLockedEquip3', 'CanCharactersSelectUIWeapon', 'StoreOptions', 'InitOptions', 'SetControllerConfig',
    'SetTtySpeedFactor', 'SetCounterSpeedFactor', 'SetStickPreset', 'TestUIVar', 'ClearUIVar', 'CopyUIVar',
    'PruneUIVarSpaces', 'CompareValues', 'AutoAim'],
  card: ['IsMemCardInserted', 'IsMemCardFormatted', 'IsSpaceForSaveGameFile', 'FormatMemCard', 'DoesSlotHaveGame',
    'LoadConfig', 'SaveConfig', 'MC_ChDir', 'MC_ChPort', 'MC_ChSlot', 'MC_Exists', 'MC_MkDir', 'MC_CreateIconFiles',
    'GetNumSavedGames', 'MC_Changed', 'IsMemcardSaveOK', 'LoadSavedGame', 'SaveSavedGame', 'ListSavedGames'],
  movie: ['PlayMPEG', 'PlayMPEGNoFade', 'BackgroundMPEG'],
  music: ['VagStreaming', 'StopAllSounds', 'FadeAllSounds'],
  mission: ['IsMissionSuccessful', 'ClearGameState', 'CleanupMissionMemory', 'ClearCareerStats', 'SetCareerStatsUIVars'],
  system: ['RebootIOP', 'SysPostInit', 'SysLoadIRX', 'NetCnfInit', 'NetCnfUninit', 'NetCnfOpen', 'NetCnfClose',
    'NetCnfCurrCombo', 'NetCnfSelectCombo', 'NetGetInterfaceList', 'HardDriveOperation', 'SwitchProgressiveVideo',
    'CheckVideoMode', 'SetScreenOrigin', 'IsControllerConnected', 'SelectLocale'],
};
const CATEGORY_OF = new Map<string, UiCommandCategory>();
for (const [c, names] of Object.entries(CATEGORY) as [UiCommandCategory, readonly string[]][]) for (const n of names) CATEGORY_OF.set(n, c);

/** The table, in its order. */
export const UI_COMMAND_TABLE: readonly UiCommandRow[] = ROWS.map(([id, name, fn, fn2, status, task, answer, lines], index) => ({
  index, id, name, fn, fn2, status, task, answer, lines,
  folded: lines ? null : FOLDED[name] ?? null, category: CATEGORY_OF.get(name) ?? 'net',
}));

const hex = (n: number): string => `0x${n.toString(16)}`;
const fun = (n: number): string => `FUN_${n.toString(16).padStart(8, '0')}`;

/**
 * Where a row's answer comes from, for every row: its block (`FUN_<fn> D:L<a>-<b>`), or, with none, what its
 * instructions show (`0x<fn>: ...`, from `folded`).
 */
export function uiCommandCitation(row: UiCommandRow): string {
  if (row.lines) return `${fun(row.fn)} D:L${row.lines[0]}-${row.lines[1]}`;
  const f = row.folded, at = `${hex(row.fn)}:`;
  switch (f?.kind) {
    case 'leaf': return `${at} jr ra, v0 = ${row.answer ? 1 : 0} at ${hex(f.ret)}`;
    case 'tail': return `${at} j ${fun(f.target)} at ${hex(f.at)}, ${f.lines ? `D:L${f.lines[0]}-${f.lines[1]}` : 'no block'}`;
    case 'state': return `${at} reads ${f.reads.map(hex).join(', ')}, jr ra at ${hex(f.ret)}`;
    case 'return': return `${at} v0 = 1 at ${hex(f.ret)}`;
    default: return `${at} body not read`;
  }
}

/** Where a constant answer is cited (the outcome's `answerFrom`); null when the answer is not a constant. */
function answerSource(row: UiCommandRow): string | null {
  if (row.answer === null) return null;
  if (row.lines) return `D:L${row.lines[0]}-${row.lines[1]}`;
  const f = row.folded;
  if (f?.kind === 'tail' && f.lines) return `D:L${f.lines[0]}-${f.lines[1]} (${fun(f.target)})`;
  return f && 'ret' in f ? `asm ${hex(f.ret)}` : 'asm';
}

/** The key of an absent name (`FUN_002745a0` D:L121393, `FUN_00274870` D:L121444): 0xE8, which no row has. */
export const UI_COMMAND_KEY_ABSENT = 0xe8;

/**
 * UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER: what a row whose body is not implemented and whose answer is not a
 * constant (`answer` null: 83 rows) answers -- 1, the dispatcher's own answer when nothing takes a command
 * (D:L121428-121430) and the constant answer of 121 of the 207 bodies (research 107 §5). The original's answer is its body's; each owning task
 * replaces it.
 */
export const UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER = true;

/**
 * `FUN_00198b80`'s fold (D:L15551-15606): a byte whose ctype entry (the table at 0x1d08d1) has bit 0 set gets +0x20.
 * In the ELF that bit is set for 'A'..'Z' alone among 0..255 (research 107 §2), so the fold is ASCII lower-casing.
 */
export function uiCommandFold(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x20));
}

const BY_FOLDED = new Map<string, UiCommandRow>();
for (const r of UI_COMMAND_TABLE) if (!BY_FOLDED.has(uiCommandFold(r.name))) BY_FOLDED.set(uiCommandFold(r.name), r);
const BY_ID = new Map(UI_COMMAND_TABLE.map((r) => [r.id, r]));
const BY_NAME = new Map(UI_COMMAND_TABLE.map((r) => [r.name, r]));

/**
 * A name's key (`FUN_00274870` D:L121436-121458, the same walk inline at D:L121392-121407): null -> 0xE8; '' -> 0;
 * else the id of the first row, in table order, whose name `FUN_00198b80` finds equal; none -> 0. The walk stops at the
 * all-zero row 207 (its id 0, D:L121405).
 */
export function uiCommandKey(name: string | null): number {
  if (name === null) return UI_COMMAND_KEY_ABSENT;
  if (name === '') return 0;
  return BY_FOLDED.get(uiCommandFold(name))?.id ?? 0;
}

/**
 * The row a key calls (D:L121411-121427): the row at index `key` when its id is the key, else the first row whose id is
 * the key and whose `fn` is not null, walking while the id is non-zero; null when none -- the answer is then 1. The ids
 * are unique, so both branches pick the row of that id.
 */
export function uiCommandRowByKey(key: number): UiCommandRow | null {
  const r = BY_ID.get(key);
  return r && r.fn !== 0 ? r : null;
}

/** A row by its exact table name (as the ELF spells it). */
export function uiCommandRowByName(name: string): UiCommandRow | undefined {
  return BY_NAME.get(name);
}

/**
 * The dispatcher's second argument (`param_2`, passed on to the node's handler D:L121384 and to `fn` D:L121414,
 * D:L121421): a pointer to the tick's time, the float `FUN_0026a6e0` hands every command's tick (D:L115202-115208); a
 * body that consumes time lowers it, and the sequence's clocks advance by what it took. The runtime's `ZAnimTime`.
 */
export type UiCommandTime = ZAnimTime;

/**
 * A row's body, filled by the task that owns it: the command, its row and the tick's time (undefined when the caller
 * has none); the answer is the tick's return.
 */
export type UiCommandHandler = (cmd: ZAnimUiCommand, row: UiCommandRow, time: UiCommandTime | undefined) => boolean;

/**
 * The node's object (D:L121372-121385: the node through `FUN_0026f4e0`, its object `FUN_00317ec0`, that object's
 * vtable +0x1c, the handler at +0x68, its vtable +100): `{ answer }` when it takes the command, null when there is no
 * such object or it declines (returns 0). An answer the handler does not write is 1 (D:L121365). The widget set
 * (PLAT-15) and the screens fill it.
 */
export type UiNodeCommandHandler = (cmd: ZAnimUiCommand, time: UiCommandTime | undefined) => { answer: boolean } | null;

/** What a dispatch did. */
export type UiCommandOutcome =
  /** The node's object took it. */
  | { kind: 'node'; answer: boolean }
  /** A row's body answered: one implemented here or a handler a later task registered. */
  | { kind: 'table'; row: UiCommandRow; answer: boolean }
  /** No row has the key: nothing was called (D:L121428-121430). */
  | { kind: 'none'; key: number; answer: true }
  /** A row whose body is not implemented: the task that owns it (null: none found), and the answer given in its place. */
  | {
    kind: 'not-implemented'; message: `not implemented: ${string}`; task: string | null; row: UiCommandRow; answer: boolean;
    /**
     * Where `answer` comes from: the row's cited block (`D:L<a>-<b>`), a tail target's (`D:L<a>-<b> (FUN_<x>)`), its
     * disassembly (`asm 0x<va>`), or the placeholder.
     */
    answerFrom: string;
    /** The row's citation (`uiCommandCitation`): where the original's answer comes from, constant or not. */
    cite: string;
  };

export interface UiCommandHostOptions {
  /** Bodies by exact table name; a name no row has throws. A handler replaces a body implemented here too. */
  handlers?: Readonly<Record<string, UiCommandHandler>>;
  node?: UiNodeCommandHandler;
  /** `SOUND` (30), passed through to the runtime (`ZAnimHost.sound`). */
  sound?: (cmd: ZAnimSoundCommand) => void;
  /** An instance's end, passed through to the runtime (`ZAnimHost.instanceStop`: the cues' `stopInstance`, PF-32). */
  instanceStop?: (anim: string) => void;
  /** Every `not implemented` outcome, as it happens. */
  log?: (o: UiCommandOutcome) => void;
}

/**
 * The bodies implemented here: the four whose whole body is two instructions, `jr ra` and the answer in its delay slot
 * (read from the ELF, research 107 §5): 0x27c7e0 ClearGameState and 0x2ca330 DeletePatch `addiu v0, zero, 1`;
 * 0x27dc80 GetAcctInfo and 0x2795d0 IsClanChallengeGame `move v0, zero` (no side effect, nothing else).
 */
const HERE: Readonly<Record<string, UiCommandHandler>> = {
  ClearGameState: () => true,
  GetAcctInfo: () => false,
  IsClanChallengeGame: () => false,
  DeletePatch: () => true,
};

/** A binding's start as a dialog's scripts make it (`screenScripts`' `startBinding`): the dialog, its design, the animation. */
export interface UiBindingStart {
  dialog: string;
  design: DialogDesign;
  animation: string;
  argument: string | null;
}

/**
 * **A browser adaptation, no row of the table** (PLAT-28; web research 142 §2): a gate a dialog's scripts ask before
 * they start a binding's animation; true takes the start (the animation is not started), false lets it go on. The
 * desktop-recompilation screen's hooks are the one gate (`DesktopScreen.register`); the original has none.
 */
export type UiBindingGate = (b: UiBindingStart) => boolean;

/**
 * **A browser adaptation, no row of the table**: a gate the menu input asks before it hands the focused control the
 * pad (`FUN_00368650`'s step 3); true parks the control -- it takes no record, so the pad falls to the screen's
 * bindings and the ring as for a control that takes nothing (a parked RADIOSTRIP neither moves nor sounds).
 */
export type UiControlGate = (c: { dialog: string; control: string }) => boolean;

/** `FUN_002745a0`, as the zAnim runtime's host (PLAT-07's `ZAnimHost`, filled). */
export class UiCommandHost implements ZAnimHost {
  readonly sound?: (cmd: ZAnimSoundCommand) => void;
  readonly instanceStop?: (anim: string) => void;
  private readonly handlers = new Map<number, UiCommandHandler>();
  private readonly gates = new Map<string, UiBindingGate>();
  private readonly controlGates = new Map<string, UiControlGate>();
  private readonly node?: UiNodeCommandHandler;
  private readonly log?: (o: UiCommandOutcome) => void;

  constructor(opts: UiCommandHostOptions = {}) {
    for (const [name, h] of Object.entries(HERE)) this.handlers.set(BY_NAME.get(name)!.id, h);
    for (const [name, h] of Object.entries(opts.handlers ?? {})) this.setHandler(name, h);
    this.node = opts.node;
    this.log = opts.log;
    if (opts.sound) this.sound = opts.sound;
    if (opts.instanceStop) this.instanceStop = opts.instanceStop;
  }

  /** Fill (or replace) a row's body after construction, by its exact table name; a name no row has throws. */
  setHandler(name: string, h: UiCommandHandler): void {
    const r = BY_NAME.get(name);
    if (!r) throw new Error(`UiCommandHost: no row of the table at 0x3dd4d0 is named '${name}' (the table's own spelling)`);
    this.handlers.set(r.id, h);
  }

  /** A binding gate set (or, with null, removed) under its owner's name (`UiBindingGate`; PLAT-28's `DESKTOP_SCREEN_GATE`). */
  setBindingGate(owner: string, gate: UiBindingGate | null): void {
    if (gate) this.gates.set(owner, gate);
    else this.gates.delete(owner);
  }

  /** The gates asked in the order they were set: true when one took the start (none set: false, the original's path). */
  bindingStart(b: UiBindingStart): boolean {
    for (const gate of this.gates.values()) if (gate(b)) return true;
    return false;
  }

  /** A control gate set (or, with null, removed) under its owner's name (`UiControlGate`). */
  setControlGate(owner: string, gate: UiControlGate | null): void {
    if (gate) this.controlGates.set(owner, gate);
    else this.controlGates.delete(owner);
  }

  /** Whether a gate parks the focused control (none set: false, the original's path). */
  controlParked(c: { dialog: string; control: string }): boolean {
    for (const gate of this.controlGates.values()) if (gate(c)) return true;
    return false;
  }

  /** The dispatch, with what it did; `time` is the dispatcher's second argument (`UiCommandTime`). */
  dispatch(cmd: ZAnimUiCommand, time?: UiCommandTime): UiCommandOutcome {
    if (cmd.nodeIndex !== 0 && this.node) {                                       // D:L121370-121385
      const taken = this.node(cmd, time);
      if (taken) return { kind: 'node', answer: taken.answer };
    }
    const cached = cmd.bytes[10] ?? 0;                                            // D:L121389-121391
    const key = cached !== 0 ? cached : uiCommandKey(cmd.fn);                     // D:L121392-121407
    const row = uiCommandRowByKey(key);                                           // D:L121411-121427
    if (!row) return { kind: 'none', key, answer: true };                         // D:L121428-121430
    const h = this.handlers.get(row.id);
    if (h) return { kind: 'table', row, answer: h(cmd, row, time) };
    const o: UiCommandOutcome = {
      kind: 'not-implemented', message: `not implemented: ${row.task ?? 'unknown'}`, task: row.task, row,
      answer: row.answer ?? UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER,
      answerFrom: answerSource(row) ?? 'placeholder', cite: uiCommandCitation(row),
    };
    this.log?.(o);
    return o;
  }

  /** `ZAnimHost.uiCommand`: the dispatch's answer. */
  uiCommand(cmd: ZAnimUiCommand, time?: UiCommandTime): boolean {
    return this.dispatch(cmd, time).answer;
  }
}
