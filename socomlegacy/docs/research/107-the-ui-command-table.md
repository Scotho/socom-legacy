# 107 -- The UI command table at 0x3dd4d0: its 207 rows classified, the dispatcher's rule, `fn2`, and the host (web sprint 7, PLAT-08)

Written 2026-10-02 for PLAT-08 (the block is `../roadmap/01-platform.md` "PLAT-08"). Read-only research. Sources: the
retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address
retail); for the 40 row functions the decompiler folds into a neighbour, their instructions read from
`game/disc/socom2_game.elf` through its program headers by a probe outside the repository (a MIPS disassembler over
the PT_LOAD image); the disc's `RUN/UIZANIM.ZAR`, `RUN/EXTZANIM.ZAR` and `RUN/MPZANIM.ZAR` read with `@s2u/archive`
(`Zar`) and `@s2u/scene` (`parseAnimSets`); the roadmap's task blocks (`../roadmap/0*.md`). Names, counts and short
constants only: no disc bytes, no decompiled text. It stands on research 96 §4 (the table, 207 rows) and 106 (the
runtime whose host this fills). The code is `packages/ui/src/uiCommands.ts`; the CI test
`packages/ui/test/uiCommands.test.ts`, the dev-disc test `tools/test/uiCommandTableDisc.test.ts`.

## 0. Answers

| # | finding | section |
|---|---|---|
| R107.1 | **207 rows, confirmed.** `UI_COMMAND_TABLE` equals `readBindingTable(elf, 0x3dd4d0)` row for row (index, id, name, fn, fn2), then the all-zero row 207; ids 1..208 without 30; the names equal research 96's pin. | §1 |
| R107.2 | **The lookup is case-insensitive over ASCII letters only, and returns the row's id.** `FUN_00198b80` adds 0x20 to a byte whose ctype entry (0x1d08d1) has bit 0; in the ELF that bit is set for `A`..`Z` alone among 0..255. No name -> 0xE8, empty -> 0, no match -> 0; the walk compares row 0 first and stops before the first row whose id is 0. The disc's scripts need the folding: `SWITCHMENU` (454 calls), `POPUPDIALOG` (252), `KILLPOPUP`/`KillPopup`, `CopyUiVar`, `NetCnfUnInit`, `CLEARGAMESTATE`, `SETMISSION`, `UNINITNETWORK` all differ in case from their row. | §2, §6 |
| R107.3 | **The dispatch order** (`FUN_002745a0` D:L121344-121431): a node's object first; then the key (byte +10 if set, else the lookup, cached in +10); then the row of that id calls `fn`; nothing -> 1. Byte +10 is 0 in all 6,130 `ui::UI_COMMAND`s on the disc, so every first tick looks up. | §3, §6 |
| R107.4 | **Every row has a host entry and a category.** 4 implemented here, 199 declared for 42 roadmap tasks (MENU-01 37, PLAT-34 21, OPT-05a 16, ONL-16 12, ...), 4 unknown. A declared or unknown row answers the typed outcome `not implemented: <task>` and is logged. The Gap's classes: UI 11, valve/state 33, card 19, movie 3, music/stream 3, net/Medius 117, mission 5, system 16. | §4 |
| R107.5 | **The answers, every one cited.** 121 bodies return 1 at every exit (111 by their decompiled `return`s; `GetTextInput` by its tail jump into `FUN_0038d770`, whose one exit is `return 1`; `ClearGameState`, `DeletePatch` and the 7 one-exit bodies of §5 by their instructions), 3 return 0 (`AbortLoad`, `GetAcctInfo`, `IsClanChallengeGame`); 83 depend on state or were not read. Each of the 40 rows with no block records what its instructions show (`folded`: 4 leaves, 18 tail jumps, 5 global reads, 7 one-exit bodies answering 1, 6 longer bodies not read), and `uiCommandCitation` names every row's source. A not-implemented row answers its cited constant, else the placeholder (1). | §5 |
| R107.6 | **What `fn2` is:** a builder. Each of the 11 allocates a zeroed command record of its own size (0x14..0xac), marks the header timeless with that size, keys a name into +6 by the same table walk and fills the rest from named parameters (`ARGUMENT`, `RECIP_UIVAR`, `From`, `To`, `FILE`, `INDEX`, `NAME`, `NUMBER`, `VALUE1/2`, `UIVAR1/2`, `UiVar`, `Purpose`, ...). Its caller was not found; the disc's scripts are compiled, so the port calls none. | §7 |
| R107.7 | **Two retail stubs a later task must keep:** `IsClanChallengeGame` always answers 0 and `GetAcctInfo` always 0 (each `jr ra` / `move v0, zero`); `ClearGameState` and `DeletePatch` always 1. SVC-11 and ONL-07 inherit them. | §5 |

**The proven level** is PLAT-36's call trace (`PS2X_CALL_TRACE` on `FUN_002745a0` and the row functions) and PLAT-32's
script-trace goldens. Everything here is the reading level.

## 1. The table

`readBindingTable` (`tools/elfImage.ts`) reads 16-byte rows `{id, name, fn, fn2}` from 0x3dd4d0 to the first null name;
`tools/test/uiCommandTableDisc.test.ts` holds `UI_COMMAND_TABLE` (`packages/ui/src/uiCommands.ts`) to it: the same
207 rows in the same order with the same five fields, the terminator at index 207 all zero, the names equal to
`tools/test/dialogInventory.pinned.json`'s `elf.bindingNames`. The ids run 1..208 with 30 unused (row 25 is
`SendChatText` id 31, row 26 `VCButton` id 75; ids 26-29 follow at rows 27-30): research 96 §4, unchanged.

Past the terminator the table's memory holds other data: the word at row 0xE8 (0x3de350) is not 0xE8, so the
dispatcher's direct test for key 0xE8 fails and its walk, stopping at row 207, finds no id 0xE8 (§3).

## 2. The lookup and its case rule

The name a command keys is `names[+6]` of its animation's name table (`FUN_0026ed60`). The walk appears three times,
always the same: inline in the dispatcher (D:L121392-121407), as `FUN_00274870` (D:L121436-121458), and in two `fn2`
builders (`FUN_0027fbc0` D:L127231-127246, `FUN_0027fd70` D:L127288-127303):

- a null name -> **0xE8** (D:L121393, D:L121444); an empty one -> **0** (D:L121394);
- else, from row 0, `FUN_00198b80(row.name, name)`; the first 0 (equal) gives that row's **id** (D:L121400), and the
  loop goes on while the **next** row's id is non-zero (D:L121405) -- so row 0 is always compared and the all-zero
  row 207 never is; no match -> **0** (D:L121406).

`FUN_00198b80` (D:L15551-15606) compares byte by byte, each byte folded by `+0x20` when its entry in the ctype table at
0x1d08d1 has bit 0 set, and returns the difference of the first folded bytes that differ. The dev-disc test reads that
table: bit 0 is set for 0x41..0x5a and for no other value 0..255, so the fold is ASCII lower-casing (`uiCommandFold`).
(The loop indexes the table with the byte as a *signed* char, D:L15564-15589; a byte above 0x7f would read before the
table. No script name on the disc has one: the dev-disc test checks every name is printable ASCII.)

## 3. The dispatch (`FUN_002745a0`, D:L121344-121431)

1. A result byte is set to 1 (D:L121365).
2. **With a node** (+4 non-zero, D:L121370): `FUN_00271650` and `FUN_0026f4e0` resolve it; its object
   (`FUN_00317ec0`), that object's vtable +0x1c, and the handler at +0x68 (D:L121372-121377). With a handler, its vtable
   +100 is called with the command and the result byte's address (D:L121384); a non-zero return means it took the
   command and the result byte -- 1 unless the handler wrote it -- is the answer (D:L121387, D:L121430). Without one,
   `FUN_0026edb0` runs (D:L121380-121381) and the table answers.
3. **The key** (D:L121388-121410): byte +10 if non-zero, else the lookup of §2, written into byte +10 (D:L121409).
   `FUN_0026ed60(+8)` is called first and its result unused (D:L121388).
4. **The call** (D:L121411-121427): if the row at index *key* has id *key*, its `fn` (when non-null) is called; else the
   rows are walked while the id is non-zero for one whose id is the key and whose `fn` is non-null. `fn(command, ...)`'s
   return is the answer (D:L121414-121415, D:L121421-121422). The ids being unique, both branches call the row of that
   id.
5. **Nothing** -- key 0, 0xE8, 30, or a null `fn` -- and the answer is 1 (D:L121428-121430).

`UiCommandHost` (`uiCommands.ts`) is this, as PLAT-07's `ZAnimHost`: `node` stands for step 2 (`{ answer }` taken, null
declined or absent: the widget set PLAT-15 and the screens fill it), `handlers` for the row bodies by their table name
(a name no row has throws; `setHandler` fills one after construction), `dispatch` returns what happened (`node`,
`table`, `none`, `not-implemented`) and `uiCommand` its answer. It honours a non-zero byte +10 and otherwise recomputes
the key: the runtime hands the host a copy of the command's bytes (research 106), so the cache cannot persist, and the
lookup is a pure function of the name.

**The second argument.** `FUN_002745a0(param_1, param_2)` passes `param_2` on to the node's handler (D:L121384) and to
`fn` (D:L121414, D:L121421). It is registered as set 1's tick (D:L106923), so its caller is `FUN_0026a6e0`, which calls
every command's tick with the command and a pointer to the tick's time, a float (D:L115202-115203), and advances the
sequence's clocks by what the tick consumed (D:L115208). The runtime passes its `Dt` (`ZAnimTime`, `{ v }`) to
`ZAnimHost.uiCommand`; the host hands it to the node's handler and to a row's handler as `time` (`UiCommandTime`). No
body read here consumes it; one that waits (a movie, a load) may.

## 4. The classification

Each row's owner is the roadmap block that names the command; where none does, the screen task of the dialogs whose
scripts call it (§6's scan, by dialog); where neither, unknown. `*` marks a row whose answer is not a cited constant
(§5).

| owner | rows | commands |
|---|---|---|
| here (PLAT-08) | 4 | ClearGameState, GetAcctInfo, IsClanChallengeGame, DeletePatch |
| MENU-01 | 37 | SwitchMenu, PopUpDialog, KillPopUp, ActivateButton, GetTextInput, EnableButton, DisableButton, StoreOptions, InitOptions, PlayMPEG*, SetMenuState, TestUIVar*, SetControllerConfig, SetTtySpeedFactor, SetCounterSpeedFactor, SetStickPreset, RebootIOP, SwitchProgressiveVideo, CheckVideoMode*, StopAllSounds, FadeAllSounds, SysPostInit, FlushMenuHistory, PlayMPEGNoFade*, VagStreaming, BackgroundMPEG, PruneUIVarSpaces, ClearUIVar, CleanupMissionMemory, CompareValues*, SuspendMenuInput, CopyUIVar*, ClearCareerStats, SetCareerStatsUIVars, IsControllerConnected*, SetScreenOrigin, HardDriveOperation* (MENU-01's block lists every one) |
| OPT-05a | 16 | the card commands of O17: IsMemCardInserted*, IsMemCardFormatted*, IsSpaceForSaveGameFile*, FormatMemCard*, DoesSlotHaveGame*, LoadConfig, SaveConfig, MC_ChDir*, MC_ChPort, MC_ChSlot, MC_Exists*, MC_MkDir*, MC_CreateIconFiles, GetNumSavedGames, MC_Changed*, IsMemcardSaveOK* |
| PLAT-34 | 21 | the ARMORY's: ChooseEquipment*, ChoosePrimary*, ChooseSecondary*, ChooseEquip1-3*, UpdateSelItemValves*, ChooseDefaultEquipment, RemoveEquipment, IsEquipmentSelected*, ChangeCharacterType, DoAllSelCharsHaveWeapon*, ChooseDefaultEquipmentOnly, DoAllSelCharsHaveEquip1-3*, CharacterProfile*, DoAllSelCharsHaveLockedEquip1-3*, CanCharactersSelectUIWeapon* (called from `dlg_equipment_*`, `UICharacterProfile`, `ShowAndSpin`, `dlgGameLobby`) |
| PLAT-10 | 1 | SetDefaultMenuScreen (PLAT-10's block names it) |
| BOOT-08 | 1 | SelectLocale |
| OPT-13, OPT-15 | 1, 1 | AutoAim (OPT-13); SetPlayerDescription (`dlgOnlineOptions`, OPT-15) |
| MENU-08 | 1 | HostLANGame* |
| MENU-12, MENU-13, MENU-16 (future scope, R1) | 1, 2, 1 | SaveSavedGame* (`dlgDebriefing`); LoadSavedGame, ListSavedGames; IsMissionSuccessful* |
| ONL-01 | 8 | NetCnfInit, NetCnfUninit, NetCnfOpen*, NetCnfClose, NetCnfCurrCombo, NetGetInterfaceList*, NetCnfSelectCombo*, PasswordSecurity (`dlgNetLogin`) |
| ONL-03 | 5 | InitNetwork*, DMEInit, MediusInit, GetServerList*, DNASAuthenticate* (`dlgNetAuthenticate`) |
| ONL-04, ONL-05, ONL-08, ONL-09 | 2, 2, 1, 1 | LobbyDisconnect, UpdateServerInfo; DownloadPatch*, VerifyPatchLevel*; GetUsagePolicy; GetMediusAnnouncements |
| ONL-06, ONL-07, ONL-10 | 4, 3, 2 | UpdateAcctInfo, GetMUISPersonaInfo, DeleteMUISPersona, MUISPersonaExists*; LobbyRegister*, LobbyLogin*, LobbyConnect*; UnInitNetwork, LobbyLogout* |
| ONL-11, ONL-12, ONL-13, ONL-14, ONL-15 | 3, 5, 4, 3, 3 | RefreshRoomList*, JoinMPRoom*, CanJoinRoom*; RefreshGameList*, RefreshRoomPlayerList*, JoinMPGame*, CheckJoinMP, GetGameInfo; SetMission, CreateMPGame*, GameHasPassword*, GameHasSpectatorPassword*; SetMPMissionSeq*, GetAvailableMPMissions, RemoveNonSuppressionMaps; ToggleAutoMessages, SetFilters, GetMissionInformation |
| ONL-16, ONL-17, ONL-18 | 12, 1, 1 | IsTerrorist*, SwitchSides, ReadyToLoad, IsSessionMaster*, ConnectToGameServer*, JoinGameServer*, AdvanceMPMission, RefreshGamePlayerList*, ForceMPLaunch, CheckForcedLaunch, IsSwitchTeamsOK*, ForceMediusStatusReport; InitializeOnlineArmory; AbortLoad |
| ONL-20, ONL-22, ONL-23 | 4, 3, 2 | ReplayMission, CloseAndSwitch, GameStatePopCommand, UpdateMpFinalStatsUiVars (READERX's round and final dialogs); DisconnectFromGameServer, LobbyBailout, HaveBeenBannedFromGame*; SendChatText, SendMediusChat |
| ONL-24, ONL-25, ONL-26 | 8, 3, 1 | GetFriendsList, RemoveFriend, AddFriend, GetFriendInfo, ConfirmFriend, RejectFriend, AddFriendDirectly, GetFriendInvitations; GetIgnoreList, RemoveFromIgnore, AddToIgnore; CreateClan |
| ONL-27, ONL-28, ONL-29, ONL-30 | 10, 10, 5, 3 | DisbandClan, IsMemberOfClan*, IsLeaderOfClan*, GetClan*, RemovePlayerFromClan*, GetClanRoster, QuitClan, UpdateClanStats, TransferLeadership*, GetClanMemberInfo; InvitePlayerToClan*, RevokeInvite*, GetInvitedPlayers, CheckMyInvites, AcceptInvitation, DeclineInvitation, ClanHasInvitations*, HasClanInvitations*, InvitePlayerToClanWithArg*, CanInviteMorePlayersToClan*; SendClanMessage*, GetClanMessages, GetLeaderMessages, ModifyClanMessage, DeleteClanMessage; GetLadderInfo*, GetClanRanking, GetPlayerInfo |
| SVC-11, SVC-14, SVC-22, SVC-23 | 3, 1, 1, 2 | NotOnCorrectClanTeam*, ClanGameClosed*, ClanGameSwapSides*; GameRejectsRank*; VCButton*; BanSelfFromGame, NetCensorText |
| unknown | 4 | MediusEnabled*, IsNetwork*, SysLoadIRX, CheckTeamStatus*: no script on the disc calls them and no roadmap block names them |

**The categories** (`category`, the block's Gap's classes). The rule, by what the command's name and owner say its body
serves (the bodies are their owners' to read, so this is a reading of names, not of bodies): **UI** -- screens, popups,
buttons, menu state and input (SwitchMenu, PopUpDialog, KillPopUp, Activate/Enable/DisableButton, GetTextInput,
SetMenuState, FlushMenuHistory, SuspendMenuInput, SetDefaultMenuScreen: 11); **valve/state** -- the ARMORY's 21 (PLAT-34),
the options and controller settings (StoreOptions, InitOptions, SetControllerConfig, SetStickPreset, SetTty- and
SetCounterSpeedFactor, AutoAim) and the UI-variable commands (TestUIVar, ClearUIVar, CopyUIVar, PruneUIVarSpaces,
CompareValues): 33; **card** -- OPT-05a's 16 and the saved games (LoadSavedGame, SaveSavedGame, ListSavedGames): 19;
**movie** -- PlayMPEG, PlayMPEGNoFade, BackgroundMPEG; **music/stream** -- VagStreaming, StopAllSounds, FadeAllSounds;
**mission** (the campaign's state, DEFERRED) -- IsMissionSuccessful, ClearGameState, CleanupMissionMemory,
ClearCareerStats, SetCareerStatsUIVars; **system** -- the IOP and the console (RebootIOP, SysPostInit, SysLoadIRX,
HardDriveOperation), the network configuration (the six NetCnf* and NetGetInterfaceList, the Gap's own example),
video mode and origin (SwitchProgressiveVideo, CheckVideoMode, SetScreenOrigin), the pad (IsControllerConnected) and
the locale (SelectLocale): 16; **net/Medius** -- every other row: the online owners' (ONL-*, SVC-*), HostLANGame,
MediusEnabled, IsNetwork, CheckTeamStatus, and GetAcctInfo, IsClanChallengeGame and DeletePatch: 117. The Gap's
`REBOOT` is not a row: it keys 0 (§6), as do `MENUFADER` and `PREVIOUS_SCREEN`.

**The desktop-only screen.** PLAT-28 names `RebootIOP`, `SwitchProgressiveVideo`, `CheckVideoMode` and the HDD among
its candidate hooks; their bodies stay MENU-01's, and the per-row choice (desktop screen, emulated, or a no-op) is
PLAT-28's, an owner call. No row is routed there by this task.

## 5. The answers

A row's `answer` is its body's when that is a constant, and is what a not-implemented row answers. Read so:

- **111 decompiled bodies** return `1` at every `return` of their block (`lines`, from the `// ---- FUN_` line to the
  closing brace; e.g. `SwitchMenu` D:L126554-126639, `PopUpDialog` D:L126642-126652); one, `AbortLoad`
  (`FUN_00278060` D:L123260-123270), returns `0`. Their side effects are the owning task's. Every `lines` -- a row's
  and a tail target's -- is held to the decompilation when `SOCOM_PC_ROOT` holds it (`tools/test/uiCommandTableDisc.test.ts`:
  its first line is that function's `// ---- FUN_` header, its last the block's last closing brace; a row or target
  cited without a block has no header).
- **40 row functions have no block** (the decompiler has no function at their address). Their instructions, read from
  the ELF, are recorded per row as `folded` and pinned by the dev-disc test (each jump, load and constant decoded from
  the ELF's words):
  - **4 leaves** -- `jr ra` with the answer in its delay slot: `ClearGameState` 0x27c7e0 and `DeletePatch` 0x2ca330
    `addiu v0, zero, 1`; `GetAcctInfo` 0x27dc80 and `IsClanChallengeGame` 0x2795d0 `move v0, zero` -- implemented here
    (`status: 'here'`).
  - **18 tail jumps** (`j target`, the answer the target's): `UpdateSelItemValves` -> `FUN_00282140` D:L128327-128419;
    `GetTextInput` -> `FUN_0038d770` D:L283988-284046, whose one exit is `return 1` (D:L284045), so its answer is 1;
    `IsMemberOfClan` -> `FUN_002e6830` D:L186491-186497; `GetClan` -> `FUN_002e8a90` D:L187723-187766;
    `IsMemCardInserted` -> `FUN_003a1650` D:L295921-295953; `IsMemCardFormatted` -> `FUN_003a1580` D:L295886-295918;
    `FormatMemCard` -> `FUN_003a12e0` D:L295810-295831; `HaveBeenBannedFromGame` -> `FUN_002c3550` D:L164913-165084;
    `IsSwitchTeamsOK` -> `FUN_002f8ce0` D:L197459-197476; `DoAllSelCharsHaveEquip1-3` -> `FUN_00281160`
    D:L127787-127924 with 0, 1, 2; `DoAllSelCharsHaveLockedEquip1-3` -> `FUN_002815d0` D:L127927-128060 with 0, 1, 2;
    `ClanHasInvitations` -> 0x2e7290, `HasClanInvitations` -> 0x2e8770, `CanInviteMorePlayersToClan` -> 0x2e5fe0 (these
    three targets have no block either). The card and clan ones pass a global object in `a0` (0x436460, 0x44f370).
  - **5 global reads**: `IsMissionSuccessful` the byte at 0x4364f8 == 2; `MediusEnabled` the byte at 0x45a1c8;
    `IsNetwork` the byte at 0x45a0c1; `IsSessionMaster` 1 when the bytes at 0x45a0c1 and 0x45a0c0 are both non-zero;
    `CheckTeamStatus` 1 when the word at 0x437ce8 is non-zero and the byte at 0x45a0c0 or the word at 0x441470 is.
  - **7 one-exit bodies answering 1** (`return`): one `jr ra`, which every branch reaches through `addiu v0, zero, 1`
    with nothing after it writing v0 -- `DisbandClan` 0x27a920 (calls 0x2e6850; 1 at 0x27a938), `RemovePlayerFromClan`
    0x27a840 (calls 0x2e7450; 1 at 0x27a878), `TransferLeadership` 0x277430 (its branches meet at 0x277490, calls
    0x2e81b0; 1 at 0x2774a4, `jr ra` at 0x2774ac), `VCButton` 0x27e1c0 (branches reach 0x27e290 at most; 1 at
    0x27e298), `SaveSavedGame` 0x27f820 (0x27fa28; 1 at 0x27fa30), `NetGetInterfaceList` 0x277970 (0x277a68; 1 at
    0x277a8c, `jr ra` at 0x277aa0), `SetMPMissionSeq` 0x278eb0 (0x2791c0; 1 at 0x2791c8, `jr ra` at 0x2791d8). Their
    side effects are their owners'.
  - **6 longer bodies not read**: ChooseEquip3, JoinMPRoom, PlayMPEGNoFade, DoAllSelCharsHaveWeapon, CopyUIVar,
    IsMemcardSaveOK: their answer is not that constant (the dev-disc test holds each to it); their owners read them.
  `uiCommandCitation(row)` turns a row into its source (`FUN_<fn> D:L<a>-<b>`, or `0x<fn>: j FUN_<t> at ..., D:L...`,
  `reads ...`, `v0 = 1 at ...`, `body not read`); a not-implemented outcome carries it as `cite`.
- **83 rows** have no constant answer; a call of one before its task lands answers
  `UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER` (1: the dispatcher's own answer when nothing takes a command, and
  121 of the 207 bodies' constant), and its `cite` names where the original's answer comes from.

## 6. What the disc's scripts send

The three archives' 6,130 `ui::UI_COMMAND`s (2,985 with a node, 3,145 without) were read with `parseAnimSets`:

- byte +10 is 0 in every one (the dev-disc test pins it), so no key is pre-baked on the disc;
- every name is printable ASCII;
- without a node, every name keys a row except `NA` (the name table's index 0: one command), which keys 0 and answers 1;
- with a node, 2,647 name past the name table (the runtime's `fn` null: key 0xE8 if no node takes them), 322 name `NA`
  and 16 a refresh command (`RefreshGameList`, `RefreshRoomList`, `REFRESHROOMPLAYERLIST`, `RefreshGameListInfo`); the
  node's object answers them (step 2), so their key matters only when it declines.

The most-called rows without a node: SwitchMenu 467 (454 `SWITCHMENU`), DisableButton 415, PopUpDialog 252, ActivateButton
242, EnableButton 229, SuspendMenuInput 153, VagStreaming 107, ChoosePrimary 104, ChooseEquip3 99. Names the
tools quote as commands but that no row holds -- `MENUFADER`, `REBOOT`, `PREVIOUS_SCREEN` (research 106, PLAT-10) --
key 0 here: they are not table commands.

## 7. `fn2`

The dispatcher calls only the word at +8 (D:L121413-121414, D:L121420-121421); nothing in the decompilation reads +12 by
address (`0x3dd4dc`, `PTR_FUN_003dd4dc`: no hit; every reference to 0x3dd4d0 is in the dispatcher, `FUN_00274870` or the two builders of §2). The 11 `fn2`
bodies all begin with `FUN_0034eae0(1, size)` (D:L248953-248966: a zeroed allocation of `size` bytes), then set the
record's header byte +2 bit 1 (the timeless bit 17, research 106) and its size field to `size` (e.g. 0x30 for
`FUN_0027fbc0`: `0xc0 >> 2`), write 0 into +4 (no node), the key of their first argument (a command name) into +6 by
the walk of §2, and the rest from their second argument through `FUN_0032ee10(params, key)` with the keys `ARGUMENT`
(0x3ee888), `RECIP_UIVAR` (0x3ef468), `From`/`To` (0x3ef478/0x3ef480), `FILE` (0x3eee78), `INDEX`/`NAME`
(0x3ee9d0/0x3ee9d8), `VALUE1`/`UIVAR1`/`VALUE2`/`UIVAR2` (0x3ee900-0x3ee918), `NUMBER` (0x3eead0), `UiVar` and
`Purpose` (0x3fb418, 0x3fb460). Sizes: `GetTextInput` 0xac (`FUN_00395f40` D:L289092), `PlayMPEG` 0x44 (`FUN_0027ad60`
D:L124676), `SendChatText` and `SendMediusChat` 0x30 (both `FUN_0027fbc0`), `GetLadderInfo`, `GetPlayerInfo`,
`GetMUISPersonaInfo`, `CharacterProfile` 0x14 (`FUN_00278750` D:L123495, `FUN_00279bf0` D:L124097, `FUN_002756a0`
D:L121891, `FUN_00275d30` D:L122134), `CompareValues` and `CopyUIVar` 0x18 (`FUN_00274fc0` D:L121675, `FUN_0027fd70`),
`GetMissionInformation` 0x20 (`FUN_00276080` D:L122255).

So `fn2` builds a command's longer record -- the words past +0x10 the row's `fn` reads -- from a parameter list: the
shape of a script compiler's per-command hook. One oddity: the builders write a **key** into +6, where the dispatcher
reads a **name index** (`names[+6]`); whoever calls them was not found, so whether their records reach
`FUN_002745a0` at all is open (§8). The port reads compiled scripts and calls no `fn2`.

## 8. What is settled, what is not, what would settle it

- Settled (reading): the row count, the lookup, the case rule, the dispatch order, the cache's state on the disc, every
  row's owner or its absence, every row's category, the constant answers of 124 rows and the source of every answer,
  what `fn2` builds, what the dispatcher's second argument is.
- **The node's handler** (vtable +100 of the object at +0x68): not read here; the widget set (PLAT-15) and PLAT-34's
  ARMORY own it. Its answers for 2,985 commands are what the screens see first.
- **`fn2`'s caller**, and the +6 key-or-index oddity: a search for indirect calls through a row pointer + 12, or a
  recomp call trace of the 11 builders (PLAT-36).
- **The 83 answers that are not constants**: each owning task reads its body (or its tail target's) at the cited place.
- **The categories** are a reading of names and owners (§4); a body read may move a row (e.g. a valve command that
  turns out to touch the card).
- **The four unknown rows**: whether anything calls them (a recomp call trace; `IsNetwork` and `MediusEnabled` read
  globals another command sets).
- **Overlaps in the roadmap:** `LoadConfig` and `SaveConfig` are listed both in MENU-01 and in OPT-05a's O17; this
  table gives them to OPT-05a (the card layer). `CharacterProfile` is OPT-20's card file as well as the ARMORY's; the
  row is PLAT-34's.

## 9. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER` (`packages/ui/src/uiCommands.ts`) | the answer of a row whose body is not implemented and whose answer is not a constant (83 rows; each row's `cite` names its source) | 1, the dispatcher's answer when nothing takes a command (D:L121428-121430) and 121 bodies' constant; each owning task replaces it with its body | placeholder |
