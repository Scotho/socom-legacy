# 146 -- The DNAS screen (`dlgNetAuthenticate`): its five commands, the bypass, the set replayed (ONL-03)

Written 2026-10-03 for ONL-03 (`../roadmap/05-online-front-end.md` "ONL-03", on the segment's fact N7 and OT.R4's mark;
the plan `../plans/2026-10-02-online-path-target.md`). Sources: `dlgNetAuthenticate.rdr`'s layout and set as ONL-33's
chapter reader decoded them (research 128 §3, `tools/test/onlineDialogs.pinned.json`; the ops are decoded data,
RS.R8); the US disc's `UIMnLOC.rdr` through `@s2u/scene`'s `readLocArchive` (the texts below, decoded data); the retail
decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; `FUN_<addr>` its
functions; cited, never pasted); the retail ELF's data words by address (`tools/elfImage.ts`, the workers' vtables); the
desktop recompilation's override (`desktop@be557831:third_party/ps2recomp/ps2xRuntime/src/lib/game_overrides_socom2.cpp`,
the submodule's pin; `SOCOM_PC_ROOT`'s copy read); the recomp's one DNAS frame on record (`logs/parity/s17_q2_logoff/online1/01_universe.png`,
the LOCATING stage, `online.locating-universes` of the golden manifest). It stands on research 106 (the runtime), 107
(the command table), 115 (the dialog host), 128 (the online dialogs; R128.7-R128.9 are this screen's), 138 (MENU-01a's
card rows, which the set calls) and 139 (the loaded-set rule), and does not restate them.

The code: `packages/ui/src/screens/dnasCommands.ts` (the five rows and `DNAS_ENTRY_COMMANDS`), registered on the page by
`packages/viewer/src/frontEnd.ts` (two lines, claimed in HANDOFF §3). The tests: `packages/ui/test/screens/dnasCommands.test.ts`
(the bodies), `dnasScreen.test.ts` (CI: the set's transcription replayed through PLAT-10's machine with PLAT-15's parts),
`dnasScreenDisc.test.ts` (dev disc: the disc's own set and `UIMnLOC`), `tools/test/dnasEntryCommands.test.ts` (every
command the chapter names answered by a task), one case in `packages/viewer/test/frontEnd.test.ts` (the page's host).
Confidence: **reading, pending review** for every transcription; the bypass is a **ruled deviation** (OT.R4), not a
reading; the screen's **score is owed** to the owner's capture H70 (§5).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R146.1 | **The chapter names 25 distinct rows of the table and one row-less `NA`** (27 command lines; `KillPopUp` appears twice; the review of 2026-10-03 recounted it: it read 26): 3 PLAT-10 answers (`SwitchMenu`, `PopUpDialog`, `KillPopUp`), 7 MENU-01a's (`Ensure_MC_Dirs_Fast`'s and `has_memcard_changed`'s card rows), **5 this task implements** (`InitNetwork`, `DNASAuthenticate`, `DMEInit`, `MediusInit`, `GetServerList`), 10 declared for their own tasks and off this path (`UnInitNetwork` ONL-10's, TRIANGLE's exit; nine of the card's boot chain behind a card change). `NA` (`init_socom_online`'s failure branch) reaches no row and answers 1 | `DNAS_ENTRY_COMMANDS`; `dnasEntryCommands.test.ts` | §1 |
| R146.2 | **`InitNetwork` and `GetServerList` are two-phase**: the first tick acquires the valve the argument names TEMP, makes a worker with that valve at +0x38 and starts it, answering 0 (the sequence holds, research 106 R106.3); each later tick pumps and asks whether it ended; the tick it has, the worker is freed and the answer is 1. `InitNetwork` runs its worker's `+8` inline (D:L122674); `GetServerList` starts a thread (stack 0x19000, priority 6, D:L198630) and yields while it runs (D:L198637). The worker's handlers write the valve; the one that does was not followed (`NET_WORKER_RESULT_READING` = 1) | D:L122649-122690; D:L198609-198652; the worker base D:L298242-298436 | §2 |
| R146.3 | **`DMEInit` and `MediusInit` answer 1 at once and write the valve**: DME's init `FUN_0030dbb0(0x45a0c0)` 0 means success and the valve 1, else 0 (`DME_INIT_RESULT_READING` 0); Medius's `FUN_00300840()` low byte is the valve's value (`MEDIUS_INIT_RESULT_READING` 1); both tell the watchers only on a change | D:L122614-122646; D:L122586-122611 | §2 |
| R146.4 | **The bypass is the recomp's**: `DNASAuthenticate` answers 1 on its first tick and does nothing else -- no libdnas2 object, `DNAS_ERROR_CODE` neither acquired nor zeroed, no `MP_DNAS_ERROR` -- as `socom2_DnasTickDone` replaces `FUN_002cc670` whole (`game_overrides_socom2.cpp:120-131`, bound `:2107-2115`) and as PSRewired's r0001 pnach reads (a `jr ra` at the entry; the caller's `andi` of v0, the tick's own address, non-zero). `DNAS_AUTHENTICATE_BYPASS` = 1, a ruled deviation (OT.R4) labelled as one | `dnasCommands.ts`; the override | §2, §4 |
| R146.5 | **The set, replayed, builds SELECT UNIVERSE 82 ticks (2.74 s) after the DNAS screen (tick 1 to tick 83)**, on the disc's own set and on the transcription alike: the build at tick 1; ONSTART's timeless ops and `InitNetwork`'s start at 2; its end at 3; `WAIT 2` to 62 (#535, the logo's SHOW, `Ensure_MC_Dirs_Fast`'s two `MC_Exists` on the empty card); `DNASAuthenticate`, `DMEInit`, `MediusInit`, #536/#537, `GetServerList`'s start and `has_memcard_changed`'s first `MC_Changed` at 63; `GetServerList`'s end and `SWITCHMENU` at 64; the switch's 15 ticks of fade, 3 of countdown and the dispatch (research 115 §4.1; 139 §5) to the build at 83. Every tick but the workers' is the set's and the manager's; the workers' are `NET_WORKER_TIME_PLACEHOLDER` | `dnasScreen.test.ts`, `dnasScreenDisc.test.ts` | §3 |
| R146.6 | **The captions change in R128.7's order and on these ticks**: `bar_title` #448 CONNECTING and `ONLINE_LOBBY_STATE` #534 CONNECTING TO INTERNET at 2; #535 AUTHENTICATING DNAS DATA at 62; #535 again, `bar_title` #536 LOCATING UNIVERSES and #537 LOCATING AVAILABLE SOCOM II UNIVERSES at 63 -- so under the bypass AUTHENTICATING DNAS DATA stands one tick, and the LOCATING pair stands from 63 to the unload at 83. The texts are the US disc's `UIMnLOC` (N7) | the two replay tests | §3 |
| R146.7 | **The build's frame draws the layout's captions** (`_533_AUTHENTICATING_MSG`, `_446_START_MSG`) and the logo as the layout places it (visible, opacity 1); ONSTART's animation starts at the build and runs its first ops on the next tick (research 106 §2: a just-started instance is set up, then stepped). The port's answer to `DNAS_FIRST_FRAME_READING`; whether the console draws that frame is the state machine's order (research 115 §7) and H70's capture | `dnasScreenDisc.test.ts` | §3 |
| R146.8 | **Under the bypass the logo's two motions cancel**: `TurnOnLogo` (SHOW, 0 -> 1 in 0.8 s) starts at 62 and `TurnOffLogo` (1 -> 0 in 0.8 s, then HIDE) at 63, one tick later, both on `DNASLogo` (and the trademark's pair on `DNASTrademark1`); both instances live in the scheduler's list and each tick adds its rate (`FUN_0025f880`: `+= rate x dt`), +1.25/s and -1.25/s, so from 63 the logo stands visible at 0.958 until the unload at 83; neither motion's 0.8 s (24 ticks) runs out first, so the HIDE never comes. The port's answer to `DNAS_LOGO_OVERLAP_READING`, a transcription's; H70's capture settles what the console shows | the two replay tests | §3 |
| R146.9 | **A failed `InitNetwork` (the valve 0) shows CONNECTING TO INTERNET with no logo for 90 s, then `monitor_timeout` stops the sequence and reboots** (the #450 popup between, PLAT-16's); a slow worker holds its caption pair for its polls and moves the switch by as many ticks | `dnasScreen.test.ts` | §3 |

## 1. The list (R146.1)

`tools/test/onlineDialogs.pinned.json`'s chapter for `dlgNetAuthenticate.rdr` lists 27 command lines: the bound
functions its own set and the library animations its bindings reach name (research 128 §7's rule: followed through
`CALL`, first definition wins). `DNAS_ENTRY_COMMANDS` answers each by a task and `tools/test/dnasEntryCommands.test.ts`
holds the two together: a pinned spelling with no entry, an entry the chapter does not use, or a spelling the
dispatcher's key does not fold to its row fails it.

| status | rows | task |
|---|---|---|
| earlier | SwitchMenu (`SWITCHMENU`), PopUpDialog (`POPUPDIALOG`), KillPopUp (`KILLPOPUP`) | PLAT-10 |
| earlier | MC_Exists, MC_ChDir (`Ensure_MC_Dirs_Fast`); MC_ChPort, MC_Changed (`has_memcard_changed`); MC_MkDir, IsMemCardInserted, IsMemCardFormatted (the chain behind its popup) | MENU-01a (research 138) |
| here | InitNetwork, DNASAuthenticate, DMEInit, MediusInit, GetServerList | ONL-03 |
| declared | UnInitNetwork (`UNINITNETWORK`) | ONL-10: TRIANGLE's `exit_connect_screen` and the error paths' exit; its body answers the constant 1 (D:L126505-126515), which PLAT-08's table answers unimplemented too, so `SWITCHMENU(REBOOT)` follows either way |
| declared | IsSpaceForSaveGameFile, FormatMemCard, LoadConfig, SaveConfig, MC_CreateIconFiles (OPT-05a); ListSavedGames (MENU-13); StoreOptions, CheckVideoMode, SwitchProgressiveVideo (MENU-01) | the card's boot chain `has_memcard_changed` -> `AskToLoadData` -> `intro_onstart` -> `load_initial_config`, reached from this screen only after a card change is answered YES; on the path `init_socom_online` runs `Ensure_MC_Dirs_Fast` and `has_memcard_changed`'s poll alone |

What the path dispatches on the empty virtual card, measured (§3): `MC_Exists` twice (`..`, the save folder; neither
exists, so no `MC_ChDir`), `MC_Changed` once (the poll's 1.5-s loop does not come round before the switch), and nothing
of the declared rows.

## 2. The five bodies (R146.2-R146.4)

Every row's argument is `names[+8]` (`FUN_0026ed60`), the valve's name; all five are `declared` for ONL-03 in PLAT-08's
table (research 107 §4), which is not edited: `DnasCommands.register` sets the handlers (W9.R4).

- **InitNetwork** `FUN_00276dc0` (D:L122649-122690). With `DAT_00414eb8` null: the valve acquired TEMP
  (`FUN_00351ff0(name, 2)`, D:L122658-122659); `DAT_0044f3c8 = FUN_0027e610` (D:L122660) -- the network layer's event
  sink, which posts a named event into the menu state when it is the top state (`FUN_001f3bf0(0x408538, name)`,
  D:L126527-126534) or the mission state (`FUN_001eb070(0x4085d0, ..)`, D:L126544): `MP_DNAS_ERROR`, `MP_MEDIUS_ERROR` and the rest
  reach the dialog's bindings this way; a 0x3c-byte worker made (`FUN_00180e10`, the base ctor `FUN_003a5dd0`, the vtable
  `0x4060b0`, the valve at +0x38; D:L122661-122668), stored, and its `+8` called inline (D:L122674) -- `FUN_00276ee0`
  (D:L122693-122705): two messages posted through `+0xc` (`FUN_00276f40` -> `FUN_002852b0`, the queue at +0x14), the done
  byte +0x2c cleared; answer 0. With a worker: `FUN_003a5c30` (D:L298358-298368: no thread, so the pump `FUN_003a5b20`
  dispatches the queued messages), then `FUN_003a5c10` (D:L298343-298355: the done byte, once the thread handle +4 is 0);
  ended -- `FUN_003a5cc0(w, 0)`, `FUN_00180ad0` (D:L122680-122684), the pointer nulled, answer 1 (D:L122686).
- **DNASAuthenticate** `FUN_002cc670` (D:L170469-170513), the original: `FUN_002846f0()` read (D:L170478); with
  `DAT_0044af40` null a 0x10044-byte object made (vtable `0x4065a0`, +0x4003 8 = -1, [0x400f] = that value), the valve
  `DNAS_ERROR_CODE` (the string at 0x3f33e0) acquired PERM and zeroed, its watchers told if it was non-zero
  (D:L170486-170494), the object stored and its `+8` run (`FUN_002cc820` D:L170532-170551: a message, the done byte
  cleared, and when `FUN_003515d0(0x49e7e8, 3)` allows it the IOP module manager asked for the DNAS module with the
  callback `0x2cc8b0`); answer 0. With an object: pumped and asked; ended -- `+0x10` with 1 (`FUN_002cc7c0`: the base
  teardown and the free), nulled, answer 1. **The bypass** (R146.4): none of this runs; the row answers
  `DNAS_AUTHENTICATE_BYPASS` (1) at once. The recomp's comment on why the pnach's `jr ra` reads as done is cited, not
  restated. `success`, which the set names as the argument, keeps `InitNetwork`'s value.
- **DMEInit** `FUN_00276ce0` (D:L122614-122646): the valve acquired TEMP (D:L122622-122623); `FUN_002e05d0(0x44f370)`
  (D:L122624); `FUN_0030dbb0(0x45a0c0)` (D:L122625): 0 -- `FUN_0030e3a0(0x45a0c0, 1)`, `FUN_002b8660()`, the valve 1
  (D:L122627-122633); else the valve 0 (D:L122636-122641); the watchers told when it changed; answer 1.
- **MediusInit** `FUN_00276c60` (D:L122586-122611): the valve acquired TEMP (D:L122594-122595); `FUN_00300840()`'s low
  byte (D:L122596-122597) written into it, the watchers told when it changed (D:L122599-122607); answer 1.
- **GetServerList** `FUN_002fb080` (D:L198609-198652): the valve acquired TEMP on every tick (D:L198618-198619); with
  `DAT_0044fd98` null a 0x3c-byte worker made (vtable `0x406730`, the valve at +0x38; D:L198621-198627) and its thread
  started (`FUN_003a59d0(w, 0x19000, 6)` D:L198630 -> `CreateThread` of `FUN_003a5a70`, which runs `+8` -- `FUN_002fe1d0`
  D:L200267-200279, two messages -- then pumps until the done byte), answer 0; with one, pumped and asked
  (D:L198633-198634); not ended, `FUN_0034f0e0(DAT_0049e2d4 / 0x3c)` (a yield, D:L198637) and 0; ended, freed and
  nulled (D:L198640-198646), answer 1.

**The port's shape.** `DnasCommands` keeps the two worker pointers; a worker is a `NetJob` -- `poll()` once a tick
after the start, true when ended; `result` what it wrote. The page hands one in (`initNetwork`, `getServerList`); without
one `immediateNetJob` stands in: ended at its first poll with `NET_WORKER_RESULT_READING`, so each command takes two
ticks (`NET_WORKER_TIME_PLACEHOLDER`). The valve is written by the command the tick the worker ends (the original's
worker writes it from a handler; what the script sees is the same: written before the command answers 1). `DMEInit`
and `MediusInit` take the page's `dmeInit` / `mediusInit` results and default to the two readings. `frontEnd.ts`
registers the five with no page half; ONL-04 hands `GetServerList` the universe list over SVC-05.

**The vtables** (the ELF's words at the addresses the constructors store; `tools/elfImage.ts`): `0x4060b0` -> `+8`
`FUN_00276ee0`, `+0xc` `FUN_00276f40`, `+0x18` `FUN_0028a550`, `+0x1c` `FUN_0028a5c0`; `0x406730` -> `+8`
`FUN_002fe1d0`, `+0xc` `FUN_00276f40`; `0x4065a0` -> `+8` `FUN_002cc820`, `+0xc` `FUN_00276f40`, `+0x10`
`FUN_002cc7c0`; the base `0x408240` -> `+8` `FUN_003a5ae0`, `+0x18` `FUN_003aa1b0`, `+0x1c` `FUN_002c7be0`. The message
handlers the pump dispatches (`FUN_001828a0`) were not followed: which one writes +0x38's valve, and with what, is the
reading above.

## 3. The set replayed (R146.5-R146.9)

Two tests replay `init_socom_online` through PLAT-10's machine (`FrontEndMachine` on `dlgNetAuthenticate.rdr`), PLAT-15's
parts (`DialogPartsHost` with a `locText` that resolves the ids), PLAT-11's input, MENU-01a's rows over the empty card
and this task's five, and record every dispatched command with its tick, every node command's `UIMnLOC` id, each
dialog's build tick, and `DNASLogo`'s visibility and opacity:

- `dnasScreenDisc.test.ts` on the disc's own `dlgNetAuthenticate.rdr`, `UIanim.rdr` and `UIMemCardAnim.rdr` sets and
  the layout's 29 objects, with the `UIMnLOC` texts read off `RUN/LOCALE/STATES/UIMNLOC.ZAR` (skips without a disc);
- `dnasScreen.test.ts` (CI) on a transcription of the set's ops as the pin lists them -- `init_socom_online` op for op
  but the progress strip's `CALL ScaleSet`; the four logo animations; `Ensure_MC_Dirs_Fast`; `has_memcard_changed`'s
  poll loop without its card-change popup; `monitor_timeout` without its #450 popup; `exit_connect_screen` -- over a
  layout of the four nodes the set writes, assembled as `parseAnimSets` lays the disc's out, plus `dlgNetConnect.rdr`'s
  own `init_socom_online` in an unloaded set earlier in the archive (the loaded-set rule, research 139 §4).

Both give the ticks of R146.5 (at PLAT-12's tick of 100/2997 s): `WAIT 2` is 59.94 ticks, so the WAIT started on tick 3
ends on 62; a blocking `CALL` takes its own tick (`Ensure_MC_Dirs_Fast` at 62, its two timeless `MC_Exists` inside it);
everything timeless after `DNASAuthenticate` runs on 63 up to `GetServerList`'s start; the switch record queued on 64 is
consumed on that frame's A5, then 15 ticks of fade (2/29.97 a tick to 1.0 from the fader's 0), the three-frame
countdown and the dispatch: the build on 83, as research 139 §5 measured the same 18 between a switch's and a build's
stamps. In seconds: SELECT UNIVERSE is built 2.736 s after the DNAS screen; the console's time adds `InitNetwork`'s and
`GetServerList`'s real durations (H70).

The captions (R146.6) are the disc's: 448 CONNECTING (`_448_ConnectingNoDots_MSG`), 534 CONNECTING TO INTERNET, 535
AUTHENTICATING DNAS DATA, 536 LOCATING UNIVERSES, 537 LOCATING AVAILABLE SOCOM II UNIVERSES; the layout's own 533
AUTHENTICATING and 446 START are the build frame's (R146.7); 532 (the trademark line) is `DNASTrademark1`'s caption,
shown with the logo. `_538_ConnectFailureCaps_MSG` and `_450_Connectfailure_MSG` ("Connect failure. Press [circle] to
return to the Main Menu.") are the watchdog's and the error paths' (§4); 149 is the BACK hint.

The logo (R146.8): the transcription shows what the runtime, transcribed from `FUN_0025f880`, does with two opacity
motions on one node, and the disc's set does the same -- 0.0417 on tick 62, 0.958 from 63 on, visible, until the
unload. Research 128's `DNAS_LOGO_OVERLAP_READING` stays a *note only* row there; this is the port's measured answer,
not the console's.

The watchdog and the failures (R146.9): with a worker that writes 0 the four `IF success > 0` blocks are skipped and
`NA(NA)` answers 1 -- the screen stands on CONNECTING / CONNECTING TO INTERNET with the logo hidden; `monitor_timeout`'s
`WAIT 90` (2697.3 ticks from its first tick, 2; a WAIT counts the tick it begins on, so it ends on 2699 as the 2-s one
begun on 3 ended on 62) then stops `init_socom_online`, raises #450 (on the disc; the transcription leaves the popup
out) and runs `exit_connect_screen`: `UNINITNETWORK` (ONL-10's, the table's 1) and `SWITCHMENU(REBOOT)`, whose
dispatch -- after the switch's 15 + 3 + 1 ticks, on 2718 in the transcription's replay (the popup left out, `dnasScreen.test.ts`); on the disc's own set `monitor_timeout` blocks on the `ConfirmPopup` popup until the player confirms, so no tick-2718 reboot exists there -- is a launch. A `GetServerList` worker of 31 polls holds the LOCATING pair 30 more
ticks and moves the switch and the build by 30; an `InitNetwork` worker of 10 polls moves everything after it by 9.

## 4. The error dialogs: never shown (the block's owner call, recorded)

The block's owner call -- whether the DNAS error dialogs (`UIMnLOC` 1105-1144, 1232-1235) are ever shown -- carries the
default "under the bypass: never", and the segment's OT.R4 mark rules the substance: "Authentication always succeeds".
An error dialog needs an error: `MP_DNAS_ERROR` is posted by the DNAS object's handlers through the sink of §2
(`FUN_0027e610`), which the bypass never creates, so `OnDNASError` never runs and `DNAS_ERROR_CODE` is never written
(the disc test pins the valve absent); `MP_MEDIUS_ERROR` would come from a Medius failure, and `MediusInit` writes
`MEDIUS_INIT_RESULT_READING`. The default is recorded here as the behaviour: **never**, by OT.R4; no HUMAN_TASKS row is
added for it (the call is ruled in the segment). What the error texts and their popups look like stays readable from
the ELF and the set (`OnDNASErrorContinue` / `OnDNASErrorHalt` / `OnNetError`, research 128 §3) for a task that ever
needs them; `_450` (the watchdog's) is the one popup this screen can still raise, and only when a worker fails.

## 5. The score: owed to H70

No archive holds the DNAS screen's frames: the s4 PCSX2 run skipped `A_32` / `A_33`, and the recomp's `01_universe.png`
(`online.locating-universes`, `logoff-q2`) is the LOCATING stage -- the last caption pair before SELECT UNIVERSE, one
tick of the port's sequence -- which under W9.R8 and W9.R12 never meets the CONNECTING / AUTHENTICATING states. The
golden manifest carries the owed row `state.dnas-connecting-authenticating` (`statesWithoutFrame`, owed to ONL-32's
capture task, the method `login-to-universe-1fps`: H70's window, OT.R4) -- the one owed row for the one screen: the
older `state.dnas-screen` (N7: "the DNAS screen's CONNECTING / AUTHENTICATING stages and its failure", method
`recomp-local-stack-walk`, from the manifest's first cut) owed the same frames and was folded into it at sprint 11's
close (2026-10-03); its failure stage is never shown under OT.R4 (§4), so no frame of it is owed. No score was run
here: the page draws no bitmaps or glyphs yet (research 115 §15's textures placeholder), so a frame comparison would
measure nothing of the captions; the screenshot of `?devmode&menuflow=dlgNetAuthenticate.rdr` taken for this task (§6)
is a picture of the run, not a score.
> Superseded 2026-10-03 (sprint 11's close): the textures placeholder was retired at ONL-01's merge (the page's banks
> and captions, `frontEndAssets.ts`); the screen's frame is drawn now (on `tools/test/universeScore.test.ts`'s rig
> through the DNAS screen: nothing undrawn but the 3D pass from its first stepped frame on). What the score waits on is
> a reference -- H70's capture -- not the drawing.

## 6. The page

`frontEnd.ts` registers `DnasCommands` with the machine's valves and no page half (two lines; HANDOFF §3's claim). At
`?devmode&menuflow=dlgNetAuthenticate.rdr` the page builds the screen from the served tree, runs the set as §3 measures
it and switches to `dlgNetServerSelect.rdr` 82 ticks later (its build on tick 83), whose ONSTART (`enter_server_select`:
`LobbyDisconnect`, `UpdateServerInfo`) is ONL-04's. The route's path mirrors it (`/main/online/dnas`, then
`/main/online/dnas/universe`;
research 129). A browser run on 2026-10-03 (Chromium over Playwright on port 5350, the served tree, the page's hook
`__frontEnd` read at 0.05, 1, 2.5 and 4 s; four screenshots in the task's scratch folder, every one a black 640 x 448
frame since nothing textured or lettered reaches the canvas yet -- a picture of the run and not a score) showed: the build's frame with the layout's captions and the logo (R146.7); at 1 s the logo hidden and 26 draw
items; the switch event at t = 2.135 s (the tests' 64 ticks); SELECT UNIVERSE built with its `_609_SelectUniverse_MSG`
by 4 s. Two findings on the page, neither this task's two lines: (1) **the page resolves no `UIMnLOC` id** -- its
`DialogPartsHost` is made with no `locText` and the disc's `captions` null, so a node command with an id writes an
empty caption (`baseTextCommand`: a null text is no codes) and `bar_title` / `ONLINE_LOBBY_STATE` read "" from the
second frame on; today nothing is drawn of them anyway (research 115 §15's textures placeholder; no glyph reaches the
canvas), so the gap is invisible, but the first screen whose captions are drawn needs the page to hand the table
(PLAT-04's `LocService` over `RUN/LOCALE/STATES/UIMNLOC.ZAR`) to the parts host -- MENU-02a's or the controller's line,
owed here; (2) **the card rows on the page are BOOT-04's stubs**, not MENU-01a's rows over the virtual card: the
`Opener` registers `BootStubs` after `connectMenuCommands`, so `Ensure_MC_Dirs_Fast` finds the f0 card's folder
(`MC_Exists(BASCUS-97275SOCOMII)` true, `MC_ChDir`) where the tests' empty card finds none -- BOOT-05's replacement, as
research 139 §3 says; the sequence's ticks are the same either way (both timeless inside the blocking CALL). What the
frame shows today: the layout's quads with no bitmap (`DNASLogo.tif`, the strip's `goldstreak.tif` / `backsolid.tif` /
`LittleBlack.tif` and the background come back undrawn) and no glyphs -- the captions are in the node tree, not on the
canvas, until MENU-02a's textures and PLAT-13's glyph draw reach the page.
> Superseded 2026-10-03 (sprint 11's close): the black screenshots, finding (1) and "what the frame shows today" were
> true on ONL-03's base. Since ONL-01's merge the page hands the parts host PLAT-04's captions and the UI banks
> (`frontEndAssets.ts`, `pageCaptions` in `readFrontEndDisc`), so the captions resolve and the bitmaps and glyphs reach
> the canvas; the preview re-run after the merges (the plan's Log, 2026-10-03 ~23:30Z) drew the path through to SELECT
> UNIVERSE. Finding (2), the card rows as BOOT-04's stubs, is not changed by it.

## 7. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `NET_WORKER_RESULT_READING` | 1 | the InitNetwork / GetServerList worker writes the valve at its +0x38 from a message handler (`FUN_001828a0`'s dispatch) that was not followed; the console on our Horizon (`A_34`) and the recomp (`01_universe.png`) both pass the four `IF success > 0` | the handler read (the vtables' `+0x18` / `+0x1c`, §2), or PLAT-36's trace of the valve |
| `NET_WORKER_TIME_PLACEHOLDER` | one poll (two ticks a command) | the console's time is the IOP's network start and the MUIS round trip; the port has no worker yet | H70's capture of the CONNECTING TO INTERNET and LOCATING stands; ONL-04's job for `GetServerList` |
| `DME_INIT_RESULT_READING` | 0 (success: the valve 1) | `FUN_0030dbb0(0x45a0c0)`'s meaning read from `DMEInit`'s two branches; the DME layer is ours (R6) | a trace of `DMEInit` on the recomp (PLAT-36), should it ever answer otherwise |
| `MEDIUS_INIT_RESULT_READING` | 1 | `FUN_00300840()`'s low byte is the valve; the Medius client is ours (R6) | the same trace |
| `DNAS_LOGO_OVERLAP_READING` (research 128 §8, *note only* there) | the port: 0.958, visible, to the unload | two opacity motions on one node, both live, their rates cancelling (R146.8) | H70's capture of the logo's frames |
| `DNAS_FIRST_FRAME_READING` (research 128 §8, *note only* there) | the port: the layout's `_533` / `_446` on the build's frame, #448 / #534 from the next | ONSTART's instance is set up at the build and stepped on the next tick (R146.7) | the state machine's order (research 115 §7) or H70's first frame |
| `DNAS_HOLD_SECONDS_PLACEHOLDER` (added 2026-10-04, §9) | 3 s (90 ticks, `DNAS_HOLD_TICKS`) | **the owner's pacing, OT.R20**: `DNASAuthenticate` answers "in progress" this long before the bypass's done, in place of an authentication time nothing observes; the one run of the original on record bypassed DNAS too | the owner's word (a figure of his), or a console run that authenticates against DNAS with a clock -- none possible since 2016 |

`DNAS_AUTHENTICATE_BYPASS` (1) is a ruled deviation (OT.R4), not a reading or a placeholder: nothing would "settle" it
short of the owner un-ruling the bypass.

## 8. Settled, not settled, owed

- Settled at the reading level: the five bodies' tick shape and valve writes (§2); the caption order and the ticks of
  the whole sequence under the bypass (§3); the loaded-set rule holds for `init_socom_online`'s two definitions.
- Not settled: the workers' real durations and the handler that writes `success` (§7); what the console draws on the
  build's frame and over the logo's overlap (§7); whether `GetServerList`'s worker writes `SERVER_LIST` before or after
  the valve (ONL-04's).
- Owed: the score (§5, H70); the page's bitmaps and glyphs for a frame that shows the captions (MENU-02a, PLAT-13's
  draw) and the page's `UIMnLOC` table for the parts host (§6, finding 1); `GetServerList`'s job over SVC-05 and
  `SELECT UNIVERSE`'s ONSTART rows (ONL-04); `UnInitNetwork` (ONL-10); the card rows on the page (BOOT-05, §6 finding
  2); the review that re-reads every cited line.

## 9. The owner's pacing: the screen held (added 2026-10-04, OT.R20)

The owner, 2026-10-04, verbatim: "menu time should be extended slightly, the login and DNAS screen in particular. a few
seconds each atleast. no capture neede dnow, it looks great." (OT.R20 in the online path's plan.) **An owner's pacing
choice in place of an unobservable network time, not a change to what the screen draws**: no caption, motion, valve or
watchdog of the set changes.

- **Where.** `DNASAuthenticate` (`packages/ui/src/screens/dnasCommands.ts`): the original's body (`FUN_002cc670`,
  D:L170469-170513) answers 0 while libdnas2 works and 1 when the authentication has finished, and the set runs it as
  a statement (`init_socom_online`, §3: `DNASInProgress = 1`, `DNASAuthenticate(success)`, `DNASInProgress = 0`), so a 0
  holds the sequence on it, ticked again next frame (research 106 R106.3). The page answers 0 on each of
  `DNAS_HOLD_TICKS` ticks from the first call, then the bypass's 1 (§2); the next authentication holds again from its
  own first tick, and a new boot's valve store starts it over. Counted on the machine's ticks (one call a tick while
  the sequence holds), never wall time; `holdTicks` rounds the seconds up to the next whole tick of 100/2997 s.
- **The constant.** `DNAS_HOLD_SECONDS_PLACEHOLDER` = 3 (90 ticks): the ruling's figure, "3 s unless the archive shows
  the original's own time on that stage was longer" -- and it does not (below). Its row is §7's.
- **The ticks** (`dnasScreen.test.ts`, `dnasScreenDisc.test.ts`, the transcription and the disc's own set alike):
  `DNASAuthenticate` dispatched on ticks 63 to 153 (91 calls, the last the done one), `DMEInit`, `MediusInit` and
  `GetServerList`'s start on 153, the switch on 154, SELECT UNIVERSE built on **173** (was 83): the screen up 5.74 s
  (was 2.74 s). During the hold AUTHENTICATING DNAS DATA (#535) stands, `DNASInProgress` is 1, and the logo's
  `TurnOnLogo` (0.8 s) runs out to opacity 1 before `TurnOffLogo` starts on 153 -- the set's own motions, now not
  overlapping, so R146.8's 0.958 is the hold-0 picture only. The 90-s watchdog is unchanged (2699). With
  `holdSeconds: 0` every number of §3 is reproduced (the tests keep both). `universeScreen.test.ts` and
  `tools/test/universeScore.test.ts` run 90 ticks longer through the screen; the scores did not move (98.9 / 95.3).
- **The search for the original's time.** No archive measures the DNAS authentication on the original: every run of
  the game online on record bypasses it -- the recomp (`socom2_DnasTickDone`, §2), PSRewired's r0001 pnach (R128.9)
  and the one run of the original game with a clock, PCSX2 on PSRewired (the desktop host's
  `logs/parity/pcsx2_psrewired_url/emulog_url.txt`, "Enabled patch: General Cheats\DNAS Bypass"). That run does time the
  rest of the screen, which is the workers' (`NET_WORKER_TIME_PLACEHOLDER`, §7, not this ruling's): the IOP's network
  modules load from 109.39 s (NETCNF.IRX ... EZNETCTL.IRX, `InitNetwork`'s worker, CONNECTING TO INTERNET), DHCP from
  114.25 s, the address set at 114.78 s; the set's 2-s WAIT; at 116.90 s the DNS query for the MUIS host
  (`GetServerList`'s worker, LOCATING), retried at 122.91 s and answered, the MUIS connection 122.93-123.77 s -- the
  original's screen up about 15 s, of which 0 s authenticating. A note, not a reading: an emulator's network timings,
  under the bypass; it is the evidence `NET_WORKER_TIME_PLACEHOLDER` names (H70's capture), recorded here for it.
- **And a frame.** The same run's `logs/parity/pcsx2_psrewired_url/A_07_after_login.png` is the DNAS screen at its
  LOCATING stage on the original (LOCATING UNIVERSES / LOCATING AVAILABLE SOCOM II UNIVERSES, the DNAS logo and its
  trademark line at full opacity, the progress strip): §5's "no archive holds the DNAS screen's frames" is contradicted
  by it; it is not scored here (the frame is hand-timed and the page's LOCATING stage is one tick).
