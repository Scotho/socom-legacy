# 114 -- The unplaced dialogs: `dlgExitState`, `dlgHype`, `dlgStickSetup` -- what opens each, and its place in the port (web sprint 9, MENU-09)

Written 2026-10-01 for task MENU-09 (`../roadmap/03-menus.md` "MENU-09", row M6 of that file's "What the original
does"; web sprint 9 in `../roadmap/SPRINTS.md`). Read-only research, no game run. Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; addresses retail), its strings list
`socom2_game.elf.strings.txt` beside it, the retail ELF on the disc (`game/disc/socom2_game.elf`, read by address with
`tools/elfImage.ts`: the vtables, the type descriptors and three-instruction getters the decompilation does not list
as functions), the disc's `RUN/UI/READERC.ZAR`, `RUN/UI/READERX.ZAR` and the three zAnim archives read with PLAT-06's
readers (`tools/dump-dialogs.ts`, `tools/dialogInventory.ts`; web research 96), reCOM (SOCOM 1; used only where the
decompilation agrees) and the PC research notes 11 and 60. Names, addresses and counts only: no disc bytes, no
decompiled text. The checkable facts are held by `tools/test/unplacedDialogs.test.ts` (CI: the readers on made-up
input and PLAT-06's pin; dev disc: the ELF and the archives) on the readers in `tools/unplacedDialogs.ts`.

## 0. Answers

| # | dialog | answer | port | section |
|---|---|---|---|---|
| R114.1 | `dlgExitState` | **The single-player mission's end screen ("mission statistics")**: the dialog of the class `CExitMenu` (0x3e2c98, a `CGameMenu`), whose vtable's dialog getter (0x1f3b00) returns `dlgExitState.rdr` (0x3e2ce0); the menu is made by the game state `CExitState` ("ExitState") on entry, `FUN_001f1bb0` (D:L53451-53503), which mounts `run/ui/readerx.zar` and `run/extzanim.zar` for it. The state is pushed only **offline**, at a mission's end, from three sites (§1.4): at once when the mission is aborted or the player is down and the valve `nofade` is 1 (`FUN_002a9b30`, D:L150592-150606); by the `MissionFadeToEnd` task's own tick 0x2a98a0 when the fade ends (push at 0x2a9a2c, not a function in the decompilation; scheduled only by `FUN_002a97c0`, itself offline only); and by `FUN_002a9a70` (D:L150569) at the end of `FUN_001ebed0`'s one-second post-end count, which runs only while no `MissionFadeToEnd` task does and is itself a fade to black with the world held still (`FUN_003b1760`, D:L50792-50797). Online, the round's end pushes `MPExitState` instead (D:L151127-151134) | campaign only: **not built** (R1); it belongs with the README's future-scope end-of-mission screens | §1 |
| R114.2 | `dlgHype` | **No caller found.** The one reference anywhere is the switch handler's `strstr` (`FUN_00365a00`, D:L262431-262433), which, *when some switch already names it*, prints the empty string and goes on to load it as any other dialog: it reacts to the name, it does not open it. No dialog, no zAnim set, no binding row and no other ELF string names it; its own script set `dlgHype.rdr` and its asset library `ui/assetlib/hype` are on no archive, so even opened its three bindings would resolve to nothing. A placeholder screen ("YOUR / CREDITS / GO HERE" over five `hype_screen*.tif`) left in READERC | **unreachable, not built** | §2 |
| R114.3 | `dlgStickSetup` | **Not on the disc** (no READERC or READERX member, no file, no ELF string). Named only by `dlgOptions_Menu.rdr`'s own animation `GoToStickSetup` (UIZANIM) -- and by that member's string pool in READERC -- and **nothing starts `GoToStickSetup`**: no binding of any dialog, no `CALL_ANIMATION`, no ELF string, no binding-table row (it is an animation, not a table function). Were it started, `SWITCHMENU` would tear the OPTIONS dialog down and the loader would find no file and load nothing (`FUN_00367430`, D:L263210-263221): a reading, not run | **unreachable, not built**; OPTIONS keeps its four buttons, HDD and RETURN (row O2) | §3 |
| R114.4 | captures | No archived frame of any of the three (§4). `dlgExitState`'s is owed, reachable by a campaign run (§1.7); the other two cannot be reached by any input, so no capture can be taken of them in the original | -- | §4 |

**What changes elsewhere.** Research 96 §3.4 classes `dlgExitState` and `dlgHype` as **code** (named by the ELF):
this note gives the code path for the first and shows the second's is a no-op; web research 96 carries a dated
addition pointing here. Row M6 stands as written.

## 1. `dlgExitState`

### 1.1 The strings and how they are reached

The strings list holds, in one block: `CExitState` 0x3e29b8, `readerx.zar` 0x3e29e8, `run/ui` 0x3e29f8,
`run/extzanim.zar` 0x3e2a00, `ExitState` 0x3e2a18, `common/assetlib/splash` 0x3e2a30, the statistics' valve names
0x3e2a48-0x3e2c80 (twenty `Stat*`, `TimeInGame`, `scoring_alarm`), `CExitMenu` 0x3e2c98, `CGameMenu` 0x3e2ca8, `dlgExitState.rdr` 0x3e2ce0, `CMenuState`
0x3e2cf8. Neither 0x3e2c98 nor 0x3e2ce0 appears as a number in the decompilation (`grep -n 3e2c98`, `3e2ce0`: no
line). A scan of the ELF's PT_LOAD images for each address as a data word and as a `lui`/`addiu` (or `ori`, load,
store) pair on the same register finds:

- `CExitMenu` 0x3e2c98: one data word, at 0x3e2cd0 -- word 0 of a type descriptor (§1.2); no code.
- `dlgExitState.rdr` 0x3e2ce0: one pair, `lui` at 0x1f3b00, `addiu` at 0x1f3b08 -- the getter of §1.2; no data word.
- `CExitState` 0x3e29b8: one data word, at 0x3e29d8 (`CExitState`'s type descriptor).

### 1.2 `CExitMenu`: the vtable and its dialog getter

`FUN_001f1bb0` makes the menu: it allocates 0x920 bytes, runs `FUN_00369b60` on them (the base menu's constructor,
by its use here) and writes 0x404ff0 at +0x910 (D:L53481-53488); the destructor `FUN_001f1ae0` writes the same vtable back
(D:L53424). Read off the ELF (`EXIT_MENU_VTABLE_VA` in `tools/unplacedDialogs.ts`):

| address | word | what it is |
|---|---|---|
| 0x404ff0 | 0x3e2cd0 | the type descriptor: its word 0 is 0x3e2c98 `CExitMenu`, its word 1 0x3e2cc0, the base's (-> 0x3e2cb8 -> 0x3e2ca8 `CGameMenu`) |
| 0x404ff4 | 0 | the offset word |
| 0x404ff8 | 0x1f1ae0 | +0x08 the destructor `FUN_001f1ae0` |
| 0x404ffc | 0x1f3b20 | +0x0c a `jr ra` shared with `CMenuStateMenu`'s vtable (0x40504c; its descriptor 0x3e2eb0); research 60 §4 names this body `MyTick__9CGameMenuFf` |
| 0x405000 | 0x1f3b00 | **+0x10 the dialog getter**: `lui v0,0x3e`, `jr ra`, `addiu v0,v0,0x2ce0` -> 0x3e2ce0 `dlgExitState.rdr` |
| 0x405004 | 0x1f3b10 | +0x14 returns 0 |
| 0x405008 | 0x1f3b30 | +0x18 a `jr ra` |

The getter at 0x1f3b00 lies between `FUN_001f38f0` and `FUN_001f3b40` and is not a function in the decompilation.
What calls slot +0x10 is `FUN_00368570`, the menu's start: it calls the menu vtable's +0x10 and passes the result to
the dialog loader `FUN_00367430` (D:L263797-263798); the switch handler calls the same loader with a switch's name
(D:L262442). So `CExitMenu` is the `CGameMenu` whose dialog is `dlgExitState.rdr`.

### 1.3 `CExitState`: the game state that makes the menu

- **The constructor** `FUN_001f1d70` (D:L53508-53533) names the state `ExitState` (0x3e2a18), sets its vtable 0x404fc0
  (descriptor 0x3e29d8 -> `CExitState`) and keeps `common/assetlib/splash` (0x3e2a30), the library the dialog names.
- **Where it lives**: `FUN_001e7530` builds it at word 0x78 of its object (D:L47942); for the game object 0x4084c0
  that is **0x4086a0**, the address the three pushes below name. The same object holds, at word 0x1e, the state named
  `MenuState` (0x3e1888) with `dlgIntroScreen.rdr` (0x408538, D:L47929-47937), at word 0x3b the `LoadState`
  (0x4085ac; `FUN_001f69f0` names it 0x3e2fa0), at word 0x82 the `MPExitState` (0x4086c8; `FUN_00224110`, D:L76190,
  0x3e5350), at word 0x8d a `Cinematic` state (0x3e1898). reCOM `zgame.h:110-111` has the game's `m_exitState` and
  `m_MPexitState` members, and `fts_state.h:150-185` the two classes (with a library name, a texture name, an asset
  library and a menu), which agrees. (PC research 60 labels `FUN_001e7530` `CMenuState::CMenuState`; this read shows
  it constructing the whole object's states. Not corrected there: a PC note.)
- **The state stack** (`FUN_002cf2f0` / `FUN_002cf380` / `FUN_002cf410`, D:L172222-172297): a request of kind 0 (pop),
  1 (push: the state's +0x0c is called at once) or 2 (switch) is queued; the stack holds 16 (`< 0x10`), as reCOM's
  `CGame` does.

### 1.4 Who pushes it: the mission's end, offline only

- **The mission's states.** `FUN_002abd40` makes the mission's valves `mission_complete`, `mission_failure`,
  `mission_abort`, `mission_timeout`, `mission_replay` and `nofade` (0x3f18b0-0x3f1910, D:L151843-151854); the mission
  tick `FUN_002aa490` turns the first four into the states 2, 3, 4, 5 (D:L151137-151159). reCOM's `MISSION_STATE`
  (`zfts.h:54-62`: UNLOADED, RUNNING, SUCCESS, FAILURE, ABORTED, TIMEOUT) gives 2-5 the same meaning.
- **At once.** `FUN_002a9b30` (D:L150577-150611; reCOM `CMission::OnMissionComplete`, `fts_mission.cpp:450-490`, the
  same shape) runs only while `DAT_0045a0c1` is 0 (reCOM: `!theNetwork.m_bNetwork`) and the state has changed; when the
  new state is 4 (aborted) or a flag of the player's is set (bit 4 of +0xe1; reCOM: `!ftsPlayer->m_isAlive`) and
  `nofade` (mission +0x1b4) holds 1, it pushes 0x4086a0 (D:L150596-150606).
- **When the fade ends.** `FUN_002a97c0` (D:L150533-150554) runs only while `DAT_0045a0c1` is 0; it sets bit 0 of
  the mission's +0xfc (`DAT_004365dc`, "a fade is active") and starts the task `MissionFadeToEnd` (0x3f1360) at 0.98
  (0x3f7ae148) with the tick 0x2a98a0 (D:L150550) -- reCOM line 481 adds the same task with the same 0.98. Its callers
  are `FUN_002980d0` (D:L141398, D:L141569, D:L141622) and `FUN_00561b90` (D:L426542); what they are was not read
  (`EXIT_FADE_CALLERS_READING`). The tick 0x2a98a0 is not a function in the decompilation (it lies between
  `FUN_002a97c0` and `FUN_002a9a70`); read off the ELF it ends with the same calls as `FUN_002a9a70` (`jal`s to
  0x2aa910, 0x3afd50, 0x2286e0, 0x299150) and pushes 0x4086a0 itself: `lui`/`addiu` at 0x2a9a20/0x2a9a28, `jal
  0x2cf380` at 0x2a9a2c. Its one reference is `FUN_002a97c0`'s `lui`/`addiu` at 0x2a9808/0x2a9824, so this push is
  offline only too.
- **After the frame tick's own fade to black.** `FUN_001ebed0` (D:L50781-50797) counts its +200 down only while the
  mission's state byte `DAT_004364f8` (mission +0x18) is not 1 (RUNNING), bit 0 of `DAT_004365dc` is clear (no
  `MissionFadeToEnd` task active) and `DAT_0045a0c1` is 0; otherwise it reloads it from +0xc0. The length +0xc0 is 1.0
  and +0xc4 its inverse (the constructor `FUN_001eca50`, D:L51027-51029). When the count passes zero it calls
  `FUN_002a9a70` (D:L50789), which (bit 0 still clear) pushes 0x4086a0 (D:L150559-150570). This is a fade of its own,
  separate from the `MissionFadeToEnd` task (D:L50792-50797): every frame of the count it calls `FUN_003b1760`
  (D:L305412-305425) with the count times +0xc4 (1 -> 0) and the colour 0,0,0, which writes RGB 0,0,0 and that level
  times 255 into `DAT_004a43d8..db`; the frame flip `FUN_003aff30` (called at D:L50809/D:L50813) blends the picture
  against that black background colour with it as the alpha (`GS_BGCOLOR`, `GS_PMODE` ALP, D:L304813-304815; 0xff is
  the plain picture, D:L304797), so the screen goes to black over one second. On the frame the count passes zero the
  level is set back to 1.0 (D:L50790) before `FUN_003b1760` is called (D:L50792): alpha 255, so the push's own frame
  shows the scene undimmed, not black. The branch also clears `bVar2` (D:L50793), so the world's update
  (D:L50796-50805) is skipped: the world holds still while the screen darkens. Which ends arm the count:
  `FUN_002a9b30`'s else (D:L150608-150609) pairs with the `nofade` test (D:L150596), inside the block for "state
  changed and (state 4 or player down)"; in the ELF the `nofade` short's `bne` at 0x2a9ddc is the only branch to
  0x2a9ea8, the code that clears bit 0 of +0xfc, while the "state unchanged" `beq` (0x2a9da0) and the "neither abort
  nor down" `beq` (0x2a9dc4) go straight to the epilogue at 0x2a9ec0. So an **abort or a death with `nofade` not 1**
  is the case that clears the bit here and lets this count, fade and push run (with `nofade` 1 the bit is cleared too,
  D:L150597, and the push is at once, above). A **success, failure or timeout** does not touch the bit in this
  function. That is not "only an abort or a death arms the count": the count runs whenever bit 0 of `DAT_004365dc` is
  clear (D:L50781), and `grep DAT_004365dc` finds writers besides this function, `FUN_002a97c0`'s set (D:L150547) and
  `FUN_002a9a70`'s clear (D:L150566): `FUN_002980d0` sets it directly, offline, not through `FUN_002a97c0`
  (D:L141368) and clears it just before its own `FUN_002a97c0` call (D:L141620), and `FUN_002232a0` clears it
  (D:L75870). `grep` misses the writer that matters most: `FUN_002a7d40` clears bit 0 of its `param_1 + 0xfc`
  (D:L149686), and all three of its callers pass 0x4364e0 (D:L50946 in `FUN_001ec480`, D:L51049 in `FUN_001ecb10`,
  D:L75935 in `FUN_00223680`; in the ELF `lui a0,0x43` before each `jal 0x2a7d40` and `addiu a0,a0,0x64e0` in its
  delay slot), so it writes `DAT_004365dc` (0x4364e0 + 0xfc). The same function sets the mission state to 1, RUNNING
  (D:L149683): it is the mission's (re)start. So a success that arrives with no `FUN_002a97c0` call and no D:L141368 set since the start
  finds the bit clear because the start cleared it, not because of D:L75870 or D:L141620. An end that arrives while
  the bit is clear (cleared at the start, D:L149686, or later at D:L75870 or D:L141620, not set again) runs the count
  and `FUN_002a9a70`'s push whatever the end. Whether the count or the `MissionFadeToEnd` task carries a
  given end depends on who calls `FUN_002a97c0` and on the bit's state at that moment (`EXIT_FADE_CALLERS_READING`,
  open).
- The ELF's `lui`/`addiu` pairs naming 0x4086a0 are exactly these three: 0x2a9a20 (the tick), 0x2a9b0c
  (`FUN_002a9a70`), 0x2a9e8c (`FUN_002a9b30`); the test holds all three and the tick's `jal`.
- **Online, never**: the network branch of the mission tick pushes 0x4086c8, `MPExitState` (D:L151127-151134), whose
  menu names `dlgMultiplayerRound.rdr` / `dlgMultiplayerFinal.rdr` (0x3e5470, 0x3e5490: `lui`/`addiu` pairs at
  0x226028-0x226038, between `FUN_00225f30` and `FUN_00226060`, again a getter the decompilation does not list).

### 1.5 What the state does when entered

`FUN_001f1bb0` is `CExitState`'s slot +0x10 (0x404fd0; `Init` in reCOM's `CGameState` order, where +0x08 is the
destructor and +0x0c `PreInit` -- a reading: the stack's caller of +0x10 was not traced). It tallies the mission's
statistics into the `Stat*` valves (`FUN_001f38f0`, `FUN_001f21b0`; the writes D:L53761-54271), then (D:L53475-53501):

1. if `mission_abort` (`DAT_0043668c` = mission 0x4364e0 + 0x1ac) holds **2**: pop the state -- no screen. The
   writer is the in-game menu's confirm, `FUN_002041e0` (D:L61884-61908; its caller D:L60892): its pending choice
   +0xbe0 = 1 sets `mission_abort` to **2**, +0xbe0 = 2 sets it to **1** (and calls `FUN_00592ac0`), then both call
   `FUN_00205200`. Choice 1 is the row of action type 1, REPLAY MISSION, which shows the prompt texts at
   +0xeb8..+0xfe8 -- among them "to replay the mission?" (0x3e3d20, set at D:L61097) -- and hides +0xcf0..+0xe20, which
   hold "to abort the game?" (0x3e3d00, D:L61094); choice 2, ABORT, the reverse (D:L61679-61698). So the pause menu's
   **replay** sets 2 and ends with no statistics screen, and its **abort** sets 1. *Corrected 2026-10-13 (MATCH-02,
   research 266 §8.10.1):* this item first read the pairing the other way round (abort 2, replay 1), taking slot +0x18 as
   the show and +0x1c as the hide from the pairing alone (`EXIT_PAUSE_ROW_READING`); the widgets' own slots say the
   reverse -- the box class's +0x1c (`FUN_00364e30`, D:L262086-262091) sets the visible bit of +0x14 and its +0x18
   (`FUN_00364e50`, D:L262096-262101) clears it, its draw (`FUN_00364e70`, D:L262106-262115) walking its children only
   with the bit set, and the menu's builder, open and close use the two so (D:L61347-61359, D:L61953, D:L62206). Online,
   ABORT's 1 lands in SOCOM II ONLINE through `dlgNetAbort.rdr` (research 266 §8.10.2). The mission tick makes any
   non-zero `mission_abort` state 4 (D:L151146, D:L151157-151158);
2. else, if word 3 of the menu state (`DAT_00408544`) is 0: mount `run/ui/readerx.zar` (`FUN_0032c1e0`), make the
   `CExitMenu` once, load `run/extzanim.zar` (`FUN_00267e70`), and start the menu (`FUN_00368570`), which loads
   `dlgExitState.rdr` through slot +0x10 (§1.2);
3. else: switch to the `LoadState` (0x4085ac) -- no screen (`EXIT_TO_LOAD_FLAG_READING`: what sets that word was not
   read).

`FUN_001f1a00` (D:L53389-53415, slot +0x1c) frees the zAnim archive and the menu and unmounts `readerx.zar`
(`FUN_0032c2b0`). The state mounts READERX before the load and the menu state mounts READERC (D:L54801); which copy
of `dlgExitState.rdr` the loader's lookup (`FUN_0032f630` -> `FUN_0032c040`) returns when both are mounted was not read
(`EXIT_DIALOG_COPY_READING`; research 96 §8's open question, now narrowed to the lookup order). The two copies'
layouts agree (research 96 §1.1).

### 1.6 What the dialog shows and where it leads

`npx tsx tools/dump-dialogs.ts --dialog dlgExitState.rdr` (with `SOCOM_DISC`): 60 objects (55 TEXT, 5 IMAGE), no
controls, background `db_back.tif`, its one set `RUN/EXTZANIM.ZAR:dlgExitState.rdr` (23 animations). The captions are
ids 2245-2266 -- `_2263_MissionStatistics_MSG` / `_2264_FOR_MSG` and the mission's name; the stealth, accuracy,
teamwork and mission-completion ratings, each with three or four counts; the elapsed time; `_2262_OverallGrade_MSG`;
the help line `_2265_padMissionBriefing_MSG` / `_2266_ReplayMission_MSG` -- with UI variables the `Stat*` valves of
§1.5. ONSTART `ExitOnStart` (`SetCareerStatsUIVars`, `IsMissionSuccessful`, ids 2201 and 2267-2282) and `RateDisplay`
(2283-2287); CROSS `ExitOnCross` -> `CloseAndSwitch(dlgDebriefing.rdr)` or `ReplayMission`; TRIANGLE `ExitOnTriangle`
-> `CloseAndSwitch` to the mission's `dlg_Brief_*` (twelve). These are research 96's edges from `dlgExitState`
(the pin's `edges`); its set's online animations (`OnMultiplayerDisconnect`, `ReturnToBriefingRoom`, ...) are copies
of library scripts no binding of this dialog runs.

### 1.7 The capture (owed)

None archived (§4). A capture run, on the recompiled game or PCSX2 under the host lock and in the owner's window:
boot to the main menu; NEW GAME -> a rank -> a preset -> the first mission's briefing (`dlg_Brief_Alb51`) -> DEPLOY;
in the mission, let the player be killed (not the pause menu's replay: by §1.5 it sets `mission_abort` to 2 and the
state pops with no screen; its abort row sets 1 and may reach the screen, a second run to record); wait out the
`MissionFadeToEnd` fade or the frame tick's own fade to black (§1.4: a death with `nofade` not 1 arms the count; the
screen darkens over a second, but the push's own frame is undimmed, D:L50790) and capture the frame once the screen
holds (`dlgExitState`);
then CROSS (expect `dlgDebriefing` or the replay) and, from a second run, TRIANGLE (expect `dlg_Brief_Alb51`). A run
that replays from the pause menu checks the no-screen branch. Record which of §1.5's three branches each ending took.

### 1.8 For the port

`dlgExitState` is reached only at the end of a single-player mission, and it leads only to the debriefing, a replay
or a campaign briefing. Under R1 (`../MISSION.md`) the port stops before any mission loads (MENU-03), so no path of
the port reaches it. It is **not built** by any active task; it belongs with the README's future-scope
"end-of-mission and single-player armory screens" (`dlgCareerStats`, `dlgDebriefing`, `dlgGameComplete`). The online
match's end is `MPExitState` with `dlgMultiplayerRound` / `dlgMultiplayerFinal`, outside MENU-09.

## 2. `dlgHype`

### 2.1 Every reference, and the searches

- **The ELF**: `findStrings(elf, /hype/i)` -- every whole NUL-terminated string holding "hype" -- gives one,
  `dlgHype` at 0x3f8c88 (no `.rdr`). Its `lui`/`addiu` pair is at 0x365c4c/0x365c58, inside `FUN_00365a00`; no data
  word holds 0x3f8c88. In the decompilation: `grep -n 3f8c88` gives D:L262431 only; `grep -ni hype` gives nothing more.
- **The disc**: a byte search for `dlghype` (no case) over every file of the disc tree hits `RUN/UI/READERC.ZAR` (the
  member itself, whose `SCRIPT_LIBRARY` is `dlgHype.rdr`) and `socom2_game.elf` only; over the ISO, two matching
  lines, the same count. No file of the tree is named for "hype" (the test's last check).
- **The dialogs and sets**: research 96's graph has no edge to it, by binding, script or library (1,023 edges, 68
  library edges: the pin); no zAnim set is named for it; `resolveSets` finds nothing for its `SCRIPT_LIBRARY`.
- **The binding table** (207 rows, `readBindingTable` at 0x3dd4d0): no row's name holds "hype".

### 2.2 What the switch handler does with the name

`FUN_00365a00` (D:L262375-262458) is the menu's switch handler: the menu tick `FUN_003654c0` hands it the queued
request's string (kinds 5 and 2, D:L262321-262333) and the menu's own name (D:L262364-262369). When its countdown
at +0x8fc reaches 0, it tests the name against `LOAD_SCREEN`, `POP_TO_MENU_STATE`, `MENU_SCREEN`, `SHUTDOWN` and
`REBOOT` (0x3f8c38-0x3f8c78, D:L262402-262425); any other name is a dialog: it tears the current dialog down (`FUN_00369210`,
D:L262428), then -- if the name contains `dlgHype` (`FUN_00199a10`, a `strstr`), and again if it contains
`dlgNetLogin` -- calls `FUN_00196c20` (a `printf`: it hands its format and arguments to `FUN_0019c0d0` with the C library's output stream, D:L13984-14010) with 0x3f8c90, which is the empty string
(D:L262431-262436), and loads the dialog (`FUN_00367430`, D:L262442). The test is a debug hook with no effect on
the screen; it runs only for a switch something else asked for.

### 2.3 Who could ask for it

A switch request is queued by `SwitchMenu` (table row 12, id 13, `FUN_0027e720`; its argument the binding's
`INPUT_STRING` or the name given, D:L126554-126639) and the commands like it (`CloseAndSwitch`, row 74). Their
arguments are the scripts' strings; no script on the disc names `dlgHype` (§2.1). **None found.**

### 2.4 What it is

`--dialog dlgHype.rdr`: 9 objects, no controls, no background; five full-screen IMAGEs `hype_screen5.tif` ..
`hype_screen1.tif` (640x448), three TEXT "YOUR", "CREDITS", "GO HERE" (not message ids), `SplashLogo.tif`; libraries
`ui/assetlib/ui2d`, `ui/assetlib/hype`; bindings CROSS and TRIANGLE `BackOutWithMusic`, ONSTART `EnterSlideShow`.
Its set `dlgHype.rdr` is on no archive; `BackOutWithMusic` is defined only in `dlgCredits.rdr`'s and
`dlgMissionSelection.rdr`'s own sets, which `dlgHype` does not load, and `EnterSlideShow` nowhere.

### 2.5 For the port

Unreachable in the original -- no caller (§2.1, §2.3) -- and incomplete on the disc (its script set and its asset
library are absent). **Not built**; no task carries it.

## 3. `dlgStickSetup`

### 3.1 On the disc?

No. READERC's 110 members and READERX's 4 (the pin's `readercMembers`, `readerxMembers`) have no such name; no file of
the disc tree is named for it; `findStrings(elf, /sticksetup/i)` finds nothing. A byte search for `sticksetup` (no
case) over the tree hits `RUN/UI/READERC.ZAR` -- inside `dlgOptions_Menu.rdr`'s string pool, among its animation
strings, in no record (`stringsOf` finds none) -- and `RUN/UIZANIM.ZAR`, `dlgOptions_Menu.rdr`'s set; over the ISO,
two matching lines.

### 3.2 Who starts `GoToStickSetup`

`GoToStickSetup` is an animation of `RUN/UIZANIM.ZAR:dlgOptions_Menu.rdr`, one command, `SWITCHMENU(dlgStickSetup.rdr)`
(`--dialog dlgOptions_Menu.rdr`). `animationStarters` over READERC's 103 dialogs and the three archives' named sets
(the test): defined in that one set; **no binding** of any dialog names it, **no animation calls it**. It is not a
binding-table row -- the table holds the engine's functions (`SwitchMenu`, `SetStickPreset`, ...), the animation goes
through `SwitchMenu` -- and no ELF string holds its name. **None found.** OPTIONS' six controls are bound to
`ToAudOpt`, `ToVidOpt`, `ToControlOpt`, `GoToPresets`, the HDD strip and `check_then_save_and_leave` (row O2).

### 3.3 What it would do (a reading)

Were it run: `SwitchMenu` queues `dlgStickSetup.rdr` (kind 2, D:L126632-126636); the switch handler fades out, tears
OPTIONS down (D:L262428) and calls the loader (D:L262442); `FUN_00367430` builds the dialog's path for its log line
(`(%.2f)CGameDlgDesign::LoadFromRdr(): %s`, 0x3f8d10) and asks `FUN_0032f630` for the file under
`data/common/zrdr/dialog` (0x3f8d40, D:L263210); on a null it only destroys its locals (D:L263211-263221). So the menu
would hold no dialog. Not run; the loader's fallback beyond the mounted archives was not read
(`STICK_SETUP_MISS_READING`). No input reaches it, so the roadmap's "recomp capture" cannot be taken without patching
the game (§4).

### 3.4 For the port

Unreachable in the original and absent from the disc. **Not built**; the port's OPTIONS (OPT tasks) has no stick
setup row because the original's has none.

## 4. Captures searched

No frame of any of the three exists in the archives. Searched 2026-10-01: file names under
`C:/Projects/socom_pc/logs/parity` and `D:/socom_archive/parity` (219,585 PNGs) matching
`exit|stats|debrief|abort|quit|stick|hype|fade|end[_.]|result|complete|death|dead` -- the hits are `s17_q0/sheet_exit*.png`
(the briefing's "leave the mission?" popup), `pcsx2_end.png` (a controller-presets screen with a card popup), the
online-quit runs `s17_q2/online_quit*`, harness copies of `map_death_trap.png` and `cinematic_abort.png`, and the
gates' in-mission frames: none is the statistics screen, viewed; directory names matching
`mission|abort|exit|stat|debrief|quit|end` (in-mission gates only); and every `.log` / `.txt` under both trees for
`dlgExitState`, `dlgHype`, `dlgStickSetup` and the loader's `LoadFromRdr(): ` line: no hit. `dlgExitState`'s capture is
owed (§1.7); `dlgHype`'s and `dlgStickSetup`'s cannot be taken by playing.

## 5. The searches, to repeat

From `redotcom` with `SOCOM_DISC=<disc>` (and `SOCOM_PC_ROOT=<pc root>`):

- `npx vitest run tools/test/unplacedDialogs.test.ts` -- every check above that the ELF, the archives or the pin can
  hold.
- `npx tsx tools/dump-dialogs.ts --dialog dlgExitState.rdr` (and `--readerx`), `--dialog dlgHype.rdr`,
  `--dialog dlgOptions_Menu.rdr`; `--set 'dlgOptions_Menu'`.
- In the decompilation's folder: `grep -n "3e2c98\|3e2ce0\|3f8c88" socom2_game.elf.decomp.c` (one line, D:L262431);
  `grep -ni "exitmenu\|exitstate\|hype\|sticksetup" socom2_game.elf.decomp.c` (none);
  `grep -n "^003e29\|^003e2[a-d]" socom2_game.elf.strings.txt` (the block of §1.1).
- Over the disc tree: `grep -rlai dlghype .`, `grep -rlai sticksetup .`; `find . -iname '*hype*'`.
- The ELF data-word and `lui`/`addiu` scan of §1.1 is the kind `tools/unplacedDialogs.ts` reads at known addresses; the
  scan itself was a throwaway probe (not kept): for each PT_LOAD word, equal to the target, or a `lui` of the target's
  adjusted high half followed within 16 instructions by an `addiu`/`ori`/load/store of its low half on that register.

## 6. What is not settled, and what would settle it

- Which of the ends of §1.4-§1.5 a given mission ending takes (the fade's callers, the menu state's word 3): the
  capture run of §1.7 with a valve trace (PLAT-32's). Which pause row sets 2 of `mission_abort` is read since 2026-10-13:
  REPLAY MISSION (§1.5, corrected; research 266 §8.10.1).
- Which copy of `dlgExitState.rdr` loads: a read of `FUN_0032c040`'s mount order, or a recomp trace of the loader.
- `GoToStickSetup`'s outcome is a reading only; it would need a patched run, and nothing in the port needs it.

## 7. Placeholders and readings

No constant in the code stands in for these; they are open questions of this note (*note only*).

| name | stands for | searched / reading | status |
|---|---|---|---|
| `EXIT_FADE_CALLERS_READING` | what `FUN_002980d0` and `FUN_00561b90` are, the callers that start `MissionFadeToEnd` -- and so which of them, if any, sets the fade bit on a success, failure or timeout (`FUN_002a9b30` clears it only for an abort or a death, §1.4), and what state the bit's other writers leave it in when an end arrives | their call sites (D:L141398, D:L141569, D:L141622, D:L426542) only; the bit's other writers by `grep DAT_004365dc`: `FUN_002980d0`'s direct set (D:L141368) and clear (D:L141620), `FUN_002232a0`'s clear (D:L75870), their conditions not read; and, through `param_1 + 0xfc` with 0x4364e0 (so not found by that grep), the mission (re)start `FUN_002a7d40`'s clear (D:L149686, beside its state = 1 at D:L149683; callers D:L50946, D:L51049, D:L75935); reCOM's `OnMissionComplete` starts the fade for an abort or a death | *note only* |
| `EXIT_ABORT_POP_READING` | the `mission_abort` value 2 at which `CExitState` pops itself with no screen | `FUN_001f1bb0` D:L53475-53476 reads it; the writer is `FUN_002041e0` D:L61899-61902, the in-game menu's confirm on REPLAY MISSION, its choice 1 (§1.5; named so 2026-10-13 by MATCH-02's correction -- ABORT, choice 2, writes 1 at D:L61891-61895, research 266 §8.10.1) | resolved 2026-10-02 (MENU-09 fix round) |
| `EXIT_PAUSE_ROW_READING` | which of the in-game menu's choices is its replay row and which its abort row | first read (the pairing alone, slot +0x18 taken as the show): choice 1 abort, choice 2 replay -- **wrong**. Read 2026-10-13 (MATCH-02, research 266 §8.10.1): choice 1 (type 1) is REPLAY MISSION and choice 2 (type 2) ABORT -- the box class's +0x1c `FUN_00364e30` sets the visible bit (D:L262086-262091), its +0x18 `FUN_00364e50` clears it (D:L262096-262101), the vtable 0x406e80's words in the ELF (`matchAbort.test.ts`'s dev-disc case); the six prompt lines themselves are the text class (vtable 0x406df0, set by `FUN_00363e70` D:L261452), whose +0x18 is 0x363c10 (`thunk_FUN_00364e50`, D:L261318) and +0x1c 0x363c00 (raw MIPS `j 0x364e30`), the same two in the same dev-disc case; the texts set D:L61093-61098, shown and hidden by case D:L61679-61698 | resolved 2026-10-13 (MATCH-02: corrected, §1.5) |
| `EXIT_TO_LOAD_FLAG_READING` | the menu state's word 3 (`DAT_00408544`) that sends `CExitState` to the `LoadState` | D:L53478, D:L53498-53500; its writers not found by name (`grep DAT_00408544`: one line) | *note only* |
| `EXIT_DIALOG_COPY_READING` | which of READERC's and READERX's `dlgExitState.rdr` the loader returns | the state mounts READERX (D:L53479); the lookup order of `FUN_0032c040` not read | *note only* |
| `STICK_SETUP_MISS_READING` | what the menu shows when `GoToStickSetup` switches to the missing file | `FUN_00367430`'s null branch (D:L263211-263221) loads nothing; `FUN_0032f630`'s file fallback not read; never run | *note only* |
