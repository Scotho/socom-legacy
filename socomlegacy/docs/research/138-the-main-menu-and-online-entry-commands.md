# 138 -- The UI commands the main menu and the online entry dispatch (MENU-01a)

Written 2026-10-02 for MENU-01a (`../roadmap/03-menus.md` "MENU-01a", the online path's slice of MENU-01; the plan
`../plans/2026-10-02-online-path-target.md`, OT.R5 and OT.R6). Sources: the two dialogs `dlgMenu.rdr` and
`dlgMPswitch.rdr` and the zAnim sets of `RUN/UIZANIM.ZAR`, read with ONL-33's chapter reader (`tools/dump-online-dialogs.ts
--dialog`, research 128) and PLAT-06's (`tools/dump-dialogs.ts --dialog`, research 96); the retail decompilation
`game/analysis/socom2_game.elf.decomp.c` (`D:L<line>` = its line, `FUN_<addr>` its functions; cited, never pasted); the
retail ELF's strings and program headers (`tools/elfImage.ts`); PLAT-08's table (research 107, `packages/ui/src/uiCommands.ts`);
PLAT-26a's libmc (research 134); the archived saves of the PC project's r0004 card (`SaveGame0..6`, their header read
with `tools/cardFile.ts`, nothing copied). The code is `packages/ui/src/screens/menuCommands.ts` (the rows),
`tools/menuEntryCommands.ts` (the list) and `packages/viewer/src/menuCommandsHost.ts` (the page); its tests
`packages/ui/test/screens/menuCommands.test.ts` and `tools/test/menuEntryCommands.test.ts` (CI),
`packages/ui/test/screens/menuEntryDisc.test.ts` and `tools/test/menuEntryCommandsDisc.test.ts` (dev disc),
`packages/viewer/test/menuCommandsHost.test.ts` (the page). Confidence: **reading, pending review** for every
transcription; §5 lists the placeholders and the readings.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R138.1 | **The two dialogs name 42 spellings of 39 rows** of the table at 0x3dd4d0 (`SWITCHMENU`, `POPUPDIALOG`, `KILLPOPUP` / `KillPopup`, `SETMISSION` and `IsMemcardInserted` fold to their rows, research 107 §2): 12 an earlier task answers (PLAT-10's seven screen rows, PLAT-11's `SuspendMenuInput`, PLAT-17's `GetTextInput`, PLAT-21's `BackgroundMPEG`, PLAT-23's `VagStreaming` and `FadeAllSounds`), **13 this task implements**, 14 declared for their own tasks and off this task's path (the LOAD GAME list and the campaign under OT.R5; the card's boot chain). None is silently ignored: `MENU_ENTRY_COMMANDS` is held to the pin | `tools/test/menuEntryCommands.pinned.json`; `MENU_ENTRY_COMMANDS` | §1 |
| R138.2 | **Of M1's ONSTART entries, `PulseArrows`, `UiStopAttract`, `SetMenuValve` and `has_memcard_changed` are animations and `CleanupMissionMemory` is both** -- the animation of that name in `dlgMenu.rdr`'s set, whose one op is the command. `PulseArrows` names no command (the arrows' opacity loop); `UiStopAttract` names `SuspendMenuInput` (3.0, after a 120-s WAIT: the attract idle); `SetMenuValve` names `SuspendMenuInput` (0.75), `GetNumSavedGames(GotSaveGames)` and `FlushMenuHistory`, and calls `UIMemCardAnim.rdr`'s `Ensure_MC_Dirs_Fast` (`MC_Exists(..)`, `MC_ChDir(..)`, `MC_Exists(BASCUS-97275SOCOMII)`, `MC_ChDir(BASCUS-97275SOCOMII)`) and `ActivateMenuBtns`; `has_memcard_changed` (a library animation, `UIMemCardAnim.rdr`) names `MC_Changed` in its condition and `MC_ChPort(0|1)` in the branch a YES to its popup reaches; `handle_memcard_error` (MEMCARD_ERROR) names none (`memcard_error` = 1) | the pin | §1 |
| R138.3 | **The six buttons' CROSS bindings name five rows**: `SuspendMenuInput` (1.75) and `SWITCHMENU` in all six; `ClearCareerStats` in NEW GAME's `UiprepMission1`; `BackgroundMPEG`, `POPUPDIALOG`, `IsMemcardSaveOK`, `ActivateButton`, `EnableButton`, `KillPopup` in LOAD GAME's `MainMenuOnLoad` (and `MC_ChPort` in the slot popup it calls, `IsMemcardInserted` in `WatchForMemcardRemoval`). ONLINE's `do_multi_or_medius` and LAN's `go_to_LAN_play` are the same two commands apart from the valves (`ComeFromLan` 0 / 1, `CurrentMission` 0). `dlgMPswitch`'s one animation names `VagStreaming(OFF)` and `SWITCHMENU(dlgNetLogin.rdr)` (R128.2) | the pin | §1 |
| R138.4 | **`GetNumSavedGames` counts the saves whose `zSaveHeader` text at +12 starts with `m` and is not "This game is a dummy game."** (`FUN_0027dea0` D:L126317-126330): `SaveGame0..9` that exist, their header read 0x10c bytes (`FUN_0033d4a0`), the text after the 12-byte head; the valve the argument names, acquired TEMP, takes the count through its watchers. The r0004 card's seven `SaveGame` files all carry the dummy text at +12 (the game's own fillers): research 102's "the other 260 bytes differ by run" is a title string there | D:L126303-126343; the r0004 saves | §2 |
| R138.5 | **`MC_Changed` is an alternating GetInfo poll** (`FUN_003a1370` mode 1, D:L295861-295880): one tick issues `sceMcGetInfo` on the poll port (`DAT_004a37e8`, 0 then toggled), the next reads it -- changed when the result is -1 or -2 (ChangedCard, NoFormat; `result + 2U < 2`) and the type is 2 -- and writes the polled port to `mc_changed_slot` through the watchers; the valve is acquired PERM on every tick (D:L124914), and the ticks that read nothing compare it with an unwritten stack word (`MC_CHANGED_SLOT_UNWRITTEN_READING`). libmc holds one command: every other `CMemCardIO` method opens with a blocking `sceMcSync(0)` into discard words, so a card row between two ticks consumes the poll and the next tick re-issues it on the same port, answering 0 (D:L295874-295876) | D:L124903-124927; D:L295834-295884; D:L295455, D:L295482, D:L295510, D:L295900, D:L295935 | §2 |
| R138.6 | **The card rows post `MEMCARD_ERROR` into G** on a result the body refuses -- Chdir any non-zero, Mkdir other than 0 or -4 (`FUN_001f3bf0(0x408538, "MEMCARD_ERROR", 0)`, the string at 0x3fbc78, kind 0x1b of the named-event walk D:L54424-54705) -- which `dlgMenu` and `dlgNetLogin` bind to `handle_memcard_error`; `IsMemCardInserted` and `IsMemCardFormatted` ask GetInfo up to twice (type 2 and result above -10; format not 0); `MC_Exists` is GetDir of one entry, count above 0; `MC_ChPort` is `atoi` into the port when not negative, the port and slot mirrored into the object's +8 / +0xc | D:L124826-124900; D:L295445-295520, D:L295886-295953 | §2 |
| R138.7 | **`RebootIOP`'s argument is a module set**: `Singleplayer` 2, `Multiplayer` 3, `NetConfig` 4, `MainMenu` 5 (case-insensitive, `INPUT_STRING` replaced), anything else 2, handed to the IOP module manager (`FUN_0034f9b0(0x49e2a0, set)`, which does nothing when the set is the current one, D:L249543-249545). `ClearCareerStats` zeroes the 13 words at 0x437e30; `CleanupMissionMemory` sweeps the mission allocator; `ClearUIVar` / `TestUIVar` read the variable's node type (int, real, string, array) | D:L122994-123032; D:L124599-124606, D:L147533-147550; D:L128136-128143; D:L123273-123365 | §2 |
| R138.8 | **A binding's animation was looked up archive-wide and found an earlier, inactive set's** (PLAT-10's `startBinding`): 169 names of `UIZANIM.ZAR` are defined in more than one set -- `dlgMenu`'s `PulseArrows` also in `dlgCreateGame.rdr` (set 37 before 38), `handle_memcard_error` in `dlgControllerPresetsRG.rdr`, `dlgNetLogin`'s `OnLoginRoomstart` in `dlgNetPlayerName.rdr` (set 49 before 54) -- so the arrows never pulsed and LOGIN's ONSTART never ran. The original's context holds only the dialog's `SCRIPT_LIBRARY` sets (each loaded at build step 8, D:L263692-263731); the lookup is now restricted to them, in order (`BINDING_SET_SEARCH_READING`) | `packages/ui/src/screens/screenScripts.ts` | §3 |
| R138.9 | **ONLINE reaches LOGIN through the real bodies on the dev disc**: `dlgMenu` -> `do_multi_or_medius` -> `dlgMPswitch` -> `dlgNetLogin` with no `not implemented` outcome before LOGIN's own ONSTART, where `NetCnfInit` and `NetGetInterfaceList` (ONL-01's) are the two left; dlgMenu's first 3 s dispatch 0 unimplemented rows | `menuEntryDisc.test.ts` | §3 |

## 1. The list

`tools/menuEntryCommands.ts` reads the two dialogs through ONL-33's chapter reader and lists, for the own set's
animations and for every library animation the bindings reach (and those call), the bound functions each names --
in its ops and in its `IF` / `WHILE` conditions (`namedBy`). The pin `tools/test/menuEntryCommands.pinned.json` holds
it (`menuEntryCommandsDisc.test.ts` re-derives it from the disc); `MENU_ENTRY_COMMANDS` in `menuCommands.ts` answers
each name with a task, and `menuEntryCommands.test.ts` holds the two together: a pinned spelling with no entry, an
entry the dialogs do not use, or a spelling the dispatcher's key does not fold to its row fails it.

| status | rows | task |
|---|---|---|
| earlier | SwitchMenu, PopUpDialog, KillPopUp, ActivateButton, EnableButton, DisableButton, FlushMenuHistory | PLAT-10 (`screenCommands.ts`) |
| earlier | SuspendMenuInput; GetTextInput; BackgroundMPEG; VagStreaming, FadeAllSounds | PLAT-11; PLAT-17; PLAT-21; PLAT-23 |
| here | CleanupMissionMemory, ClearCareerStats, RebootIOP, ClearUIVar, TestUIVar, GetNumSavedGames, MC_Changed, MC_ChPort, MC_Exists, MC_ChDir, MC_MkDir, IsMemCardInserted, IsMemCardFormatted | MENU-01a |
| declared | SetMission (ONL-13), LoadSavedGame (MENU-13), DoesSlotHaveGame, IsMemcardSaveOK (OPT-05a), AutoAim (OPT-13) | the LOAD GAME list and the campaign (`MainMenuOnLoad`, `LoadGameOnListBox`, `GoToNextMission`, the debug `MissionShortcutSKB` bound to nothing): under OT.R5 the item stops at the desktop-recompilation screen (MENU-03) |
| declared | IsSpaceForSaveGameFile, FormatMemCard, LoadConfig, SaveConfig, MC_CreateIconFiles (OPT-05a); ListSavedGames (MENU-13); StoreOptions, CheckVideoMode, SwitchProgressiveVideo (MENU-01) | the card's boot chain `intro_onstart` -> `load_initial_config` (`UIanim.rdr`, `UIMemCardAnim.rdr`), reached from `dlgMenu` only after `has_memcard_changed`'s popup is answered YES (D:L124903: a card changed under the menu) |

Where each is dispatched, per animation, is the pin (`dlgMenu.rdr`: 38 bindings, 23 own animations, 19 library
animations reached; `dlgMPswitch.rdr`: one binding, one animation, no library). R138.2 and R138.3 are read off it.

## 2. The bodies

Every row's argument is `names[+8]` (`FUN_0026ed60`); the dispatcher and the table are research 107's.

- **CleanupMissionMemory** `FUN_00281bc0` (D:L128136-128143): `FUN_0053df50()` -- the mission allocator's list at
  0x44cd50 swept, every block whose byte +0x300 is set released (D:L406836-406846) -- then 1. The front end holds no
  mission memory (`MISSION_MEMORY_PLACEHOLDER`).
- **ClearCareerStats** `FUN_0027aa30` (D:L124599-124606): `FUN_002a3e20(0x437e30)` zeroes the record's 13 words
  (D:L147533-147550); 1. `MenuCommands.careerStats` is that record (`SetCareerStatsUIVars`, MENU-01's, reads it).
- **RebootIOP** `FUN_002777f0` (D:L122994-123032): the argument, `INPUT_STRING` replaced by `FUN_00272480(ctx+0x18, 0)`
  (D:L122999-123002), compared with `FUN_00198b80` (case-insensitive) against `Singleplayer` (0x3eeb60) -> 2,
  `Multiplayer` (0x3eeb70) -> 3, `NetConfig` (0x3eeb80) -> 4, `MainMenu` (0x3eeb90) -> 5, else the initial 2
  (D:L122998); `FUN_0034f9b0(0x49e2a0, set)`; 1. The manager (D:L249489-249700) returns at once when the set equals
  its current one and is not 6 (D:L249543-249545), else resets the IOP and loads the set's modules
  (`IOP_REBOOT_PLACEHOLDER`: the browser has no IOP; the page's hook is empty).
- **ClearUIVar** `FUN_002780a0` (D:L123273-123321): the variable by `FUN_00385900(0x437e80, name)` (research 104 §4,
  case-insensitive); by its node type: 1 (int) not already 1 / 0 -> cleared, 0, the items told (D:L123286-123294); 2
  (real) the same with 0.0 (D:L123296-123304); 3 (string) `FUN_003862a0(var, "")` (the string at 0x3eead8, D:L123307:
  set and told when it differs); 4 (array) an empty list built (`FUN_00333ae0`, `FUN_003339b0(.., 0)`) and set through
  `FUN_00386460` (D:L123310-123314). No name or no variable: nothing. Answer 1. `UiVarManager.set` is the "same value
  does nothing; another tells the items" of `FUN_00386460`.
- **TestUIVar** `FUN_00278200` (D:L123324-123365): the variable as above; 1 -> the int is not 0; 2 -> the real is not
  0.0; 3 -> the string pointer is set and its first byte is not NUL; 4 -> the count at +2 is not 0; anything else, no
  name, no variable: 0.
- **GetNumSavedGames** `FUN_0027dea0` (D:L126303-126343): R138.4. `sprintf("SaveGame%d", i)` (0x3eeef0) for i 0..9
  into 0x414e50; `FUN_003a0950(0x436460, path)` (exists); `FUN_0033d4a0(DAT_00436478, path, 0xc, buf)` reads the
  header; `buf+12`'s first byte `m` and `strcmp(buf+12, "This game is a dummy game.")` (0x3eef00) not 0 counts; the
  valve `FUN_00351ff0(name, 2)` compared at +4 and set, `FUN_003519f0` when changed (D:L126332-126341); 1. The header
  reader is MENU-13's (`SAVE_HEADER_TEXT_PLACEHOLDER`): the page's libmc answers `exists`; the text is not read yet, so a
  save on the virtual card is not counted until it is.
- **The `MC_*` rows over `CMemCardIO` (0x436460)**, each `FUN_0026ed60` for the argument then a method on the object's
  port (+0x20, `DAT_00436480`) and slot (+0x24, `DAT_00436484`), both 0 at boot (the object is in a segment's
  zero-filled tail: 0x436460 is in no PT_LOAD file image):
  - `MC_ChPort` `FUN_0027b260` (D:L124858-124874): `FUN_00191490` (= `strtol(s, 0, 10)`, D:L9969-9977) into the port
    when not negative; `+0xc = slot`, `+8 = port` (D:L124869-124870); 1. (`MC_ChSlot` `FUN_0027b200` is the slot's
    twin; not named by the two dialogs.)
  - `MC_Exists` `FUN_0027b1c0` -> `FUN_003a0950` (D:L295499-295520): `sceMcSync` drained, `sceMcGetDir(port, slot,
    path, 0, 1, table)`; a refused issue posts MEMCARD_ERROR and answers 0; else the Sync result above 0.
  - `MC_ChDir` `FUN_0027b300` -> `FUN_003a07d0` (D:L295445-295470): `sceMcChdir`; a refused issue posts MEMCARD_ERROR
    and answers 0; a non-zero result posts it and answers 1; else 1.
  - `MC_MkDir` `FUN_0027b2c0` -> `FUN_003a0890` (D:L295472-295497): `sceMcMkdir`; as Chdir, with 0 and -4 both clean
    (R134.5).
  - `IsMemCardInserted` (the row's `j FUN_003a1650` at 0x27e1b4; D:L295921-295953): up to two `sceMcGetInfo(port, slot,
    &type, 0, 0)`; inserted when the type is 2 and the result is above -10 (D:L295943); a refused issue posts
    MEMCARD_ERROR and answers what it has.
  - `IsMemCardFormatted` (`j FUN_003a1580` at 0x27e1a4; D:L295886-295918): up to two GetInfo with the format pointer;
    formatted when it is not 0 (D:L295908).
  - `MC_Changed` `FUN_0027b340` (D:L124903-124927): R138.5; `FUN_003a1370(obj, 1, &slot)` then the valve `mc_changed_slot`
    (0x3eef30) acquired PERM on every tick (D:L124914), compared with `slot` and set through the watchers when it
    differs.

  PLAT-26a's `Libmc` answers each method's result at once and keeps it for one `sync()` (research 134: no busy state);
  the port models the poll's two ticks with its own pending slot, so the cadence is the original's (issue, then read
  1.5 s later in `has_memcard_changed`), and every other card row drains that slot first, as each `CMemCardIO` method
  opens with `sceMcSync(0, discard, discard)` (`FUN_001b4390(0, 0x4a37c0, 0x4a37c8)`): a GetDir, Chdir, Mkdir or GetInfo
  between two ticks -- `SetMenuValve`'s `Ensure_MC_Dirs_Fast`, LOGIN's `IsMemCardInserted` / `IsMemCardFormatted`
  before its `MC_Changed` -- consumes the poll, and the next tick's `sceMcSync(1)` answers -1, so it re-issues on the
  same port and answers 0 (D:L295874-295876). The stub never refuses to take a command (`MC_ISSUE_FAILURE_READING`), so
  the "refused issue" branches are not reached; the results' refusals are.

## 3. The path on the dev disc, and what it found

`menuEntryDisc.test.ts` opens `dlgMenu.rdr` on the disc with PLAT-10's rows (the machine's), PLAT-11's `SuspendMenuInput`
(a `MenuInput` with an idle pad), PLAT-23's three rows (a synthetic sound table) and this task's thirteen in one
`UiCommandHost`, every outcome recorded against the dialog built last. In the menu's first 3 s every dispatched row is
answered by a table entry (R138.9): `CleanupMissionMemory`, `GetNumSavedGames` (0: no save, `GotSaveGames` 0,
`MenuButtonChanged` 1 -- NEW GAME the top item, M3), `MC_Exists` twice (`..` and the save folder, neither on the empty
card: no `MC_ChDir`), `MC_Changed` every 1.5 s, `FlushMenuHistory`, `SuspendMenuInput`, `ActivateButton`; no
MEMCARD_ERROR. `do_multi_or_medius` started as an event's binding would be (PLAT-11's walk to the button is its own
test) switches to `dlgMPswitch` (its `StopStreaming`: `VagStreaming(OFF)`, `SWITCHMENU(dlgNetLogin.rdr)`) and on to
`dlgNetLogin` within 5 s, `ComeFromLan` 0 and `CurrentMission` 0; `go_to_LAN_play` the same with `ComeFromLan` 1.
LOGIN's `OnLoginRoomstart` then runs `SuspendMenuInput`, `ClearUIVar(NETCNF_DB)`, the button rows, `PopUpDialog`,
`IsMemCardInserted`, `IsMemCardFormatted`, `KillPopUp`, `MC_Changed`, `TestUIVar`, and leaves `NetCnfInit` and
`NetGetInterfaceList` to ONL-01: the two `not implemented` outcomes of the whole walk.

**The shadowed bindings (R138.8).** The first run of this walk reached `dlgNetLogin` and ran nothing of its ONSTART:
`startBinding` (`screenScripts.ts`, PLAT-10) looked an animation up with `ZAnimRuntime.find(name)`, which walks every
set of the archive from the first, and `OnLoginRoomstart` is defined in `dlgNetPlayerName.rdr` (set 49) before
`dlgNetLogin.rdr` (set 54); the earlier set is inactive, so `FUN_002734b0`'s gate refused the start. The same shadowing
hit `dlgMenu`'s own ONSTART (`PulseArrows`, defined in `dlgCreateGame.rdr`, set 37, before `dlgMenu.rdr`, set 38) and
its MEMCARD_ERROR (`handle_memcard_error`, in `dlgControllerPresetsRG.rdr`, set 32, first). In the original the menu state's
context (0x414bb0) holds only the sets the dialog's `SCRIPT_LIBRARY` names, loaded one by one at build step 8
(`FUN_00268250(0x414bb0, path, name)` or `FUN_00267fa0`, then `FUN_0026c600`, D:L263692-263731), and `FUN_0026a250`
walks those (the current set `DAT_00414be4` -- the last activated -- first, D:L115027-115032, then the context's others
in load order, D:L115051-115071). The fix restricts the binding lookup to the dialog's own sets, in `SCRIPT_LIBRARY`
order (`BINDING_SET_SEARCH_READING`); among those none of the path's duplicated names collide. A `CALL` from a script
still goes through the runtime's caller-first-then-archive walk (`CALL_SET_SEARCH_READING`, research 106): a called
name defined in the caller's set is found there; a cross-set call to a name an inactive earlier set also defines would
meet the same gate -- owed to PLAT-07 / PLAT-36, none found on the path.

## 4. The page

`packages/viewer/src/menuCommandsHost.ts` `connectMenuCommands` makes the `MenuCommands` over a `Libmc` on the page's
slot store (`pageStore.ts`'s `pageCard`; port 0 is slot 1, port 1 slot 2, research 134) and registers them in the
session's host -- one call in `packages/viewer/src/frontEnd.ts` beside PLAT-23's. A fresh page's slot is an inserted,
formatted, empty card (PLAT-25), so the main menu's ONSTART sees no save folder and no save (`GotSaveGames` 0) until
one is written; `MEMCARD_ERROR` goes into the dialog host built now. The libmc made here is answered to the caller for
the screens that need it next (LOGIN's `NetCnfOpen`, ONL-01a's `netCnfCombinationList`).

## 5. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `MISSION_MEMORY_PLACEHOLDER` | nothing to release | `FUN_0053df50`'s sweep of the mission allocator; the front end has none (the campaign out of scope) | the campaign's memory, if it is ever built |
| `IOP_REBOOT_PLACEHOLDER` | no IOP | `FUN_0034f9b0`'s reset and module load have no browser half; the set reaches a hook the page leaves empty | PLAT-22 (the streams across a reboot) and ONL-01 (`RebootIOP(MULTIPLAYER)` before DNAS): what the page must stop and restart |
| `SAVE_HEADER_TEXT_PLACEHOLDER` | null (a save that exists is not counted) | `FUN_0033d4a0`'s header read is MENU-13's reader; the card's files are JSON here (R7) | MENU-13: the save file's reader over the virtual card, then `MenuCardIo.saveHeaderText` |
| `MC_CHANGED_SLOT_UNWRITTEN_READING` | the valve exists from the first tick (acquired PERM, made at 0), its value left as it is on a tick that reads nothing | D:L124914 acquires `mc_changed_slot` on every tick; D:L124916-124922 compare it with, and store, a stack word written only when a poll completes | a trace of the original's `mc_changed_slot` across idle ticks (PLAT-36) |
| `MC_ISSUE_FAILURE_READING` | never | PLAT-26a's libmc, like the stub, takes every command; the "refused issue" MEMCARD_ERROR branches are not reached | PLAT-26's libmc, should it model a busy IOP |
| `BINDING_SET_SEARCH_READING` | the dialog's `SCRIPT_LIBRARY` sets, in order | the original's context holds only the dialog's sets; the current set (`DAT_00414be4`) is the last activated, which no path dialog's duplicated names reach | a trace of `DAT_00414be4` at a dialog whose own sets share a name (PLAT-36) |

## 6. What is not done, and where the sources disagree

- The 14 declared rows stay their tasks' (§1); `IsMemcardSaveOK` (0x27e120) has no decompiled block (research 107 §5)
  and is OPT-05a's to read from the instructions.
- `MC_ChSlot`, `MC_Exists`'s twin for the slot, is not named by the two dialogs and not implemented; its body is
  `MC_ChPort`'s with the slot (D:L124839-124855).
- Research 102 §4 reads the 260 bytes after `zSaveHeader`'s two words as "heap pointers and floats" that differ by run;
  the game reads a title string at +12 (R138.4), and the seven archived fillers hold the dummy text there. Both can be
  true of different saves; MENU-13's reader settles it.
- The proven level -- MENU-01's call-trace comparison for `dlgMenu` (PLAT-36) -- is not reached here; every body is a
  reading, pending review.
- The review round (PASS_WITH_FINDINGS) corrected two readings of `MC_Changed` -- the valve acquired on every tick, not
  only on a completed poll; the other card rows draining the poll (R138.5, both from the cited lines) -- and added the
  tests that hold `IsMemCardInserted`'s -10 boundary and the probe's -1 answer. Still owed to PLAT-36's trace: the
  original's `MC_Changed` / `mc_changed_slot` cadence with the card rows interleaved (invisible on the virtual card,
  whose GetInfo never answers -1 or -2).
