# 115 -- The screen and state manager: the menu command queue, the history, the switch and its fade, popups, the game states and the reboot (web sprint 9, PLAT-10)

Written 2026-10-02 for web sprint 9 (plan `../plans/2026-10-02-web-sprint-9-screens-widgets.md`, task PLAT-10, W9.R4,
W9.R8; the task's block is `../roadmap/01-platform.md` "PLAT-10"). Read-only research: the reading the PLAT-10
implementer transcribes into unit tests. Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address **retail**, r0001); the
retail ELF on the disc (`game/disc/socom2_game.elf`), read by address through its program headers for the short
strings and for the four routines the decompiler did not emit as functions (`CMenuState_Tick` 0x1f4640,
`CMenuState_OnCover` 0x1f4630, the menu's start-dialog getter 0x1f5620, the `menu_state` option handler 0x1eace0 --
read as disassembly, cited by address); the binding names in `recomp/socom2_names.csv`; PC research 78 and the
online-logoff row of `docs/KNOWN.md` (line 18); and the disc's `RUN/UIZANIM.ZAR`, `RUN/EXTZANIM.ZAR`, `RUN/MPZANIM.ZAR`,
`RUN/UI/READERC.ZAR`, `RUN/UI/READERX.ZAR` read with the repository's `@s2u/archive` (`Zar`, `parseRdr`), `@s2u/scene`
(`parseAnimSets`, `decodeUiProgram`) and `tools/dialogInventory.ts` (`bindingsOf`, `scriptLibrary`) by probes outside
the tree (names, counts and the script ops' numbers only; no game bytes in git). No code changes with this note.

Conventions. **M** is the menu command object at 0x414ed0 (`FUN_00274930` D:L121462-121467 returns it). **G** is the
dialog host, a `CGameMenu` (0x920 bytes, `FUN_00369b60` D:L264593; one at a time: its constructor stores itself in
`DAT_00414e40` D:L264669, its destructor clears it D:L264523). **MS** is `CMenuState` at 0x408538. **CG** is the game
object at 0x4084c0 (its state stack). Offsets are bytes; "u32" etc. give the width; a "name" is a C string.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R115.1 | **Two layers.** The menu manager is M (a queue of 0x34-byte records and a history stack) driven by G's tick `FUN_003654c0`; the game-state machine is CG (a 16-slot state stack fed by a FIFO of requests, one request per frame, `FUN_002ce9e0`). `FUN_00365a00` is the bridge: a switch's target is either a dialog (G rebuilds itself) or one of five keywords (a CG request or the reboot) | `FUN_003654c0`, `FUN_00365a00`, `FUN_002ce9e0` | §1, §3, §4, §8 |
| R115.2 | **The queue**: 40 records `{u32 type; char name[0x30]}` at M+0; the top index u32 at M+0x824 is **pre-incremented** by every push (slot 0 is never written), the count u32 at M+0x820 incremented. Types: **2 switch, 3 popup, 5 back, 6 activate button, 7 enable button, 8 disable button**. The consumer reads **the top record (newest first, LIFO)** until the count is 0; a type-2 record ends the frame's consumption | `FUN_0027e720`, `FUN_0027eff0`, `FUN_0027c160/260/360`, `FUN_0027f460` | §1.1, §2, §3 |
| R115.3 | **SwitchMenu's three cases** (`FUN_0027e720` D:L126556-126639): `PREVIOUS_SCREEN` with history -> a type-5 record naming the history's top, **popped at once** (at queue time); `PREVIOUS_SCREEN` always plays MS's **BACK** sound, even with an empty history (then nothing else happens); a target equal (**case-insensitive**) to the history's top -> the same back, no sound; any other target -> a type-2 record, history untouched | §2.1 | §2.1 |
| R115.4 | **The history (settles the block's first Unknown)**: a stack of the names of the screens **left by a forward switch**, pushed **when the type-2 record is consumed** (`FUN_0027f3f0`), with the name G holds at that moment; a back pushes nothing; the stack lives in M and is emptied whenever MS, the exit state or the MP exit state un-inits (`FUN_0027edf0`) and by `FlushMenuHistory`. Its entries are 32 pooled 0x30-byte buffers; nothing bounds the depth | `FUN_0027f3f0`, `FUN_0027edf0`, `FUN_0027c7f0`, `FUN_0027ec60` | §1.2, §2 |
| R115.5 | **The switch is a state machine on G+0x8fc** (`FUN_00365a00` D:L262375-262458 with `FUN_003654c0` D:L262239-262372): -1 idle; a switch stores the target and sets 3; while the fader quad's alpha is not 128 the MENUFADER opacity rises by `2 x min(dt, 0.05)` a frame until it reaches 0.99 (the quad's alpha then set to 128); then three frames hide the backplane (3 -> 2 -> 1 -> 0) and a fourth shows it, sets -1 and dispatches | §4 | §4 |
| R115.6 | **MENUFADER (settles the block's second Unknown at the reading level)**: the fade to black is code (above: linear, 0.99 / (2 x step) frames -- 30 frames, 0.5 s at 60 Hz -- then 4 frames); the fade from black is data: `UIanim.rdr`'s `menu_fade_up`, `OBJECT_OPACITY_FROM_TO` MENUFADER **1 -> 0 in 1.5 s** (rate -2/3 per s), the only animation of that set whose `params.flags` is 0x21 (`& 3` = 1; the other 18 are 0x22), read as started with the set (not the per-sequence `UiSequence.activation`, which is 1 somewhere in all 19: §5); 97 of READERC's 103 dialogs carry `UIanim.rdr` in their `SCRIPT_LIBRARY`. The drawn fader alpha is `opacity x 128`, with **0.99 drawn as 128** (`FUN_0036d8b0` D:L266729-266747) | §5 | §5 |
| R115.7 | **`FUN_00365a00`'s dispatch** (strcmp, case-sensitive, in this order): `LOAD_SCREEN` -> CG switch to the load state; `POP_TO_MENU_STATE` -> CG pop, then switch to MS; `MENU_SCREEN` -> CG switch to MS; `SHUTDOWN` -> CG switch to the shutdown state (which **launches `cdrom0:\SCUSNGUI.ELF;1`**, the network setup GUI, not a power-off); `REBOOT` -> `FUN_0022ed10` at once (the logoff relaunch); anything else -> unload G's dialog and build the named one | §4.2 | §4.2, §9 |
| R115.8 | **Popups**: `PopUpDialog` queues a type-3 record (consumed later **without use**), shows G's `POPUP` node at once and plays `.METAL`; `KillPopUp` hides the `POPUP` node (only when M's popup object exists). The popup is one node, built hidden **after** MENUFADER, so it draws above the fader; its text and buttons come from the `POPUP` node's own script command (research 95 §1.2) | `FUN_0027eff0`, `FUN_0027d190`, `FUN_00367950` | §6 |
| R115.9 | **`CMenuState`** (vtable 0x405010): Init `FUN_001f4860` builds G on the default menu screen (MS+0x30, `dlgIntroScreen.rdr` unless `--menu_state` or `SetDefaultMenuScreen` wrote it); Tick 0x1f4640 runs, in order: the background movie, the pad, two sound/camera ticks, **G's tick**, the system-message queue, the backplane and 3D draw, the foreplane draw, the swap; OnPop fires `ON_STATE_POP`; UnInit destroys G and **flushes M** | §7 | §7 |
| R115.10 | **The boundaries**: front end (MS) -> `LOAD_SCREEN` -> load state (its own 0.5 s linear fade in, the map load, a 0.5 s fade out) -> core state (the round) -> exit / MP-exit state **pushed** over it at the round's end -> back to MS by a pop then a switch (`POP_TO_MENU_STATE`, `CloseAndSwitch`, `GameStatePopCommand`) or a replay by a pop alone (`ReplayMission`); online, `CloseAndSwitch`/`ReplayMission` do nothing for a non-host and a host may take game state 5 instead (§2.3) | §8, §2.3 | §8 |
| R115.11 | **Every `CGame` request is queued and applied one per frame, FIFO**, on a frame whose top state is then **not ticked**; a switch un-inits the old state before the new one's Init, and re-inits the old one if the new Init fails; a push OnCovers the old top before the new one's Init and leaves it covered if that Init fails | `FUN_002ce9e0` D:L171862-171952 | §8.1 |
| R115.12 | **No archive holds a call trace of 0x27e720, 0x27eb10, 0x27d190 or 0x365a00**; the bursts that exist are too coarse for the fade (§11) | -- | §11 |

**The proven level** is PLAT-36's (a scripted-input transcript replayed in the recomp with
`PS2X_CALL_TRACE=0x27e720:UISwitchMenu,0x27eb10:UIPopUpDialog,0x27d190:UIKillPopUp`) and PLAT-32's; everything here is
the reading level.

## 1. The objects

### 1.1 M, the menu command object (0x414ed0; constructor `FUN_0027f760` D:L127097-127115, pool `FUN_0027ec60` D:L126682-126711)

| offset | width | what | initial |
|---|---|---|---|
| +0 + i x 0x34, i = 0..39 | u32 | record i's type | -1 (`0xffffffff`) |
| +4 + i x 0x34 | char[0x30] | record i's name | `NO_ARG` (0x3ed680) |
| +0x820 | u32 | records pending (the count) | 0 |
| +0x824 | u32 | the top record's index (pre-incremented by a push) | 0 |
| +0x828 / +0x82c / +0x830 | u32 x 3 | the **history**: a vector of buffer pointers {capacity, depth, data}; `DAT_004156fc` is the depth, `DAT_00415700` the data | reserved 32, depth 0 |
| +0x834 + j x 0x30, j = 0..31 | char[0x30] | the 32 pooled name buffers, each first set to `POOL` (0x3ed688) | `POOL` |
| +0xe34 / +0xe38 / +0xe3c | u32 x 3 | the **free list** of buffers {capacity, size, data} (`0x415d04`) | the 32 buffers in order |
| +0xe40 | ptr | the popup dialog object (0xbf0 bytes, made on demand by `FUN_0027f190` D:L126907-126934) | null |

Pushing a record (every command of §2 that queues): top += 1; record[top].type = T; strcpy(record[top].name, the
name); count += 1. Nothing bounds top (a 40th pending record would write over the count; `MENU_QUEUE_OVERFLOW_READING`)
nor the name's length (strcpy into 0x30 bytes; `MENU_NAME_LENGTH_READING`).

**Consuming the top record** (`FUN_0027f460` D:L127000-127037; the decompilation shows one parameter, the caller passes
a second, unused): record[top].name = `NO_ARG`; then by record[top].type -- 0: type = -1, top unchanged; 1: top -= 1,
type unchanged; 2-8: type = -1, top -= 1; any other value (-1): nothing; then count -= 1 in every case. Only types 2,
3, 5, 6, 7, 8 are ever queued, so in practice: type = -1, name = `NO_ARG`, top -= 1, count -= 1.

**History push** (`FUN_0027f3f0` D:L126984-126997): take the free list's last buffer (size -= 1), append it to the
history (depth += 1), strcpy the name into it. **History pop** (inside SwitchMenu, D:L126583-126588): take the
history's last buffer (depth -= 1), append it to the free list, strcpy `POOL` into it. No check of either size: a 33rd
push reads below the free list (`MENU_HISTORY_OVERFLOW_READING`).

**Flushes.** `FlushMenuHistory` (`FUN_0027c7f0` D:L125492-125512) and `FUN_0027edf0(M, killPopup)` (D:L126747-126779)
both: set **all 40 names** to `NO_ARG` (types, count and top **unchanged**: a pending record survives with the name
`NO_ARG`), then pop the whole history into the free list (each buffer -> `POOL`). `FUN_0027edf0` with a non-zero second
argument also destroys M's popup object (+0xe40 -> null). `FUN_0027edf0(M, 1)` is called by `CMenuState_UnInit`
(D:L54731-54732), `CExitState_UnInit` (D:L53412-53413) and the MP exit state's UnInit `FUN_002232a0` (D:L75875-75876).

### 1.2 G, the dialog host (`CGameMenu`, constructor `FUN_00369b60` D:L264593-264680)

| offset | width | what | initial |
|---|---|---|---|
| +0xc4 | ptr | the **backplane** root node (`CGameMenu backplane`): the dialog's background | made at construction |
| +0xc8 | ptr | the **foreplane** root node (`CGameMenu foreplane`): MENUFADER, controls, objects, POPUP | made at construction |
| +0xcc | ptr | the `POPUP` node (§6) | 0 |
| +0x170 | object | the **fader quad** (vtable at +0x17c): rect 0,0 640x448, colour 0,0,0, alpha f32 at quad+0x3c (`FUN_00364850` reads it) | alpha 128.0 (D:L264670-264673) |
| +0x278 / +0x279 / +0x27a | u8 | background movie playing / the dialog has a movie background / the movie loops | 0 |
| +0x8e0 | string (12 bytes; bit 0 of +0x8e0 set: the text at the pointer +0x8e8, else inline from +0x8e1) | **the current screen's name** (the last switch target accepted, or the dialog last built) | empty |
| +0x8fc | i32 | **the switch state** (§4) | -1 (D:L264654) |
| +0x900 | f32 | the **input-suspend timer**, seconds (`SuspendMenuInput` writes it through `FUN_001f3bb0` D:L54349-54357) | 0 (D:L264655; also zeroed by the unload, D:L264301) |
| +0x910 | vtable | the subclass's: +0x10 the start dialog's name, +0x14 has-3D, +0x18 a build hook, +0xc a tick | -- |

Globals of the screen: `DAT_0049ea98` the MENUFADER node (null between an unload and the next build, D:L264316 area,
D:L263624); `DAT_0049eaa0` set when the built dialog has event records (D:L263607), cleared by the unload; the node's
opacity is node+0x9c, 1.0 for a new node (`FUN_00316e30` D:L215844).

## 2. The commands, as the manager sees them

A command that takes an argument resolves it (`FUN_0026ed60` on the command's u16 at +8); in most, if the result is
non-null and the literal `INPUT_STRING` (strcmp, case-sensitive), it is replaced by the running animation's first
string input (`FUN_00272480(context+0x18, 0)`, D:L119977-120006: the control's `ARGUMENT`). That holds for
`SwitchMenu` (D:L126568), `DisableButton`/`EnableButton`/`ActivateButton` (D:L125344, D:L125364, D:L125384),
`SetDefaultMenuScreen` (D:L123721), `GameStatePopCommand` (D:L123738), `CloseAndSwitch` (D:L128111) and
`SuspendMenuInput` (D:L122816). Two exceptions: **`AbortLoad`** (`FUN_00278060`, D:L123260-123270) passes
`FUN_0026ed60`'s result straight to `FUN_001f5d00` with **no `INPUT_STRING` check** (so `AbortLoad INPUT_STRING` stores
the literal text); **`PopUpDialog`**'s check is not in its command (`FUN_0027eb10`) but inside `FUN_0027eff0`
(D:L126876), after M+0x824 is incremented and **with no null guard** (a null argument reaches the strcmp). `KillPopUp`,
`FlushMenuHistory` and `ReplayMission` take no argument. Each returns 1 unless its row says otherwise.

### 2.1 SwitchMenu (`FUN_0027e720`, D:L126556-126639)

| case | condition | effect, in order | sound |
|---|---|---|---|
| S1 | target == `PREVIOUS_SCREEN` (strcmp, D:L126571), depth > 0 | push record {5, history top} (D:L126574-126582); pop the history (D:L126583-126588); count was incremented with the push (D:L126589) | MS's BACK sound (below) |
| S2 | target == `PREVIOUS_SCREEN`, depth 0 | nothing queued | MS's BACK sound |
| S3 | other target, depth > 0, **strcasecmp(target, history top) == 0** (`FUN_00198b80`, D:L126608) | as S1: push {5, history top}, pop the history; return (D:L126613-126629) | none |
| S4 | otherwise | sprintf(stack buffer of 136, "%s", target), push {2, that} (D:L126632-126636) | none |

The BACK sound (D:L126591-126598): the sound named by MS+0x20 (the string at 0x408558; bit 0 of its first byte picks
the pointer at 0x408560, else the inline text at 0x408559), which MS's Init reads from `uisounds.rdr` -> `SOUNDS` ->
`BACK` (D:L54829-54849); found through `FUN_00344f30`, played by its vtable +0xc with (0, 0xff)
(`MENU_SOUND_PLAY_READING`). A dead branch in S3 (the depth tested again for 0, D:L126610) never runs.

### 2.2 The other queueing commands

| command (binding) | address | lines | record | other effect |
|---|---|---|---|---|
| `DisableButton` | `FUN_0027c160` | D:L125335-125353 | {8, name} | -- |
| `EnableButton` | `FUN_0027c260` | D:L125355-125373 | {7, name} | -- |
| `ActivateButton` | `FUN_0027c360` | D:L125375-125393 | {6, name} | -- |
| `PopUpDialog` | `FUN_0027eb10` -> `FUN_0027eff0` | D:L126644-126652, D:L126862-126904 | {3, name} | §6 |

### 2.3 Commands that touch the manager without queueing

| command | address | lines | effect |
|---|---|---|---|
| `KillPopUp` | `FUN_0027d190` | D:L125846-125859 | §6 |
| `FlushMenuHistory` | `FUN_0027c7f0` | D:L125492-125512 | §1.1's flush (names to `NO_ARG`, history emptied); the popup kept |
| `SetDefaultMenuScreen` | `FUN_00278d60` | D:L123712-123727 | strncpy(MS+0x30, name, 0x40): the dialog MS opens on its next Init |
| `GameStatePopCommand` | `FUN_00278df0` | D:L123729-123746 | as `SetDefaultMenuScreen`, then CG pop(0), then CG switch to MS |
| `CloseAndSwitch` | `FUN_00281a70` | D:L128101-128135 | MS+0x30 = name (always, D:L128114); then by `DAT_0045a0c1` (online) and `DAT_0045a0c0` (host): **offline**: CG pop(0), CG switch to MS, `FUN_003b1a70(RUN\RAW\LOADING.RAW)` (the loading picture), `FUN_003b0c00(1)` (D:L128116-128120); **online, not host**: nothing more; **online host**: if `*(DAT_00437ce8+0xd4)` == 0, game state 5 (`FUN_002a7490(.., 5)`), else CG pop(0) and switch to MS; then, either way, `FUN_002c00f0(DAT_00437ce8)` (D:L128122-128131) |
| `ReplayMission` | `FUN_00280040` | D:L127379-127395 | offline: CG pop(1); online host: game state 5, then `FUN_002c00f0`; **online, not host: nothing** |
| `AbortLoad` | `FUN_00278060` -> `FUN_001f5d00` | D:L123260-123270, D:L55527-55534 | MS+0x30 = name, the load state's abort flag (+0x1a) = 1 (§8.2); returns 0, not 1 |
| `SuspendMenuInput` | `FUN_00277220` | D:L122805-122822 | G+0x900 = the argument parsed as a float (seconds) |
| `SetMenuState` | `FUN_0027c9f0` | D:L125558-125590 | **not the menu manager's**: online game-state code (`FUN_002c2c20(9)` and its neighbours); PLAT-08's row |

Which scripts use them (the three zAnim archives, distinct set/animation pairs): `SWITCHMENU` 72 sets; its literal
non-dialog targets: `PREVIOUS_SCREEN` 13 animations, `REBOOT` 18, `LOAD_SCREEN` 4, `SHUTDOWN` 1
(`dlgNetLogin.rdr/launchNTGUI2`), `INPUT_STRING` 18; no literal `POP_TO_MENU_STATE` or `MENU_SCREEN`. Through
`INPUT_STRING`, 12 READERC control bindings pass `PREVIOUS_SCREEN` as their `ARGUMENT` (11 through `goto_menu`, 1
through `switch_menu`). `POPUPDIALOG` 51 sets, `KILLPOPUP` 22, `FLUSHMENUHISTORY` 2 (`dlgMenu.rdr`, `dlgGameLobby.rdr`),
`CLOSEANDSWITCH` 2, `REPLAYMISSION` 2, `GAMESTATEPOPCOMMAND` 3.

`UIanim.rdr`'s wrappers (decoded, UIZANIM): `goto_menu` = sound `SND_DINK`, stop `menu_fade_up`, `SWITCHMENU
INPUT_STRING`; `goto_menu_silent` = the same without the sound; `switch_menu` = `SWITCHMENU INPUT_STRING` only;
`deactivate_button` = `DisableButton INPUT_STRING`; `activate_button` = `EnableButton INPUT_STRING`. So a control bound
to `goto_menu` with `ARGUMENT PREVIOUS_SCREEN` plays DINK and then BACK.

## 3. G's tick and the queue's consumer (`FUN_003654c0`, D:L262239-262372)

Inputs: dt (f32, the frame's seconds from CG; the clock is PLAT-12's) and G. Read first: `o` = MENUFADER's opacity
(`DAT_0049ea98`+0x9c), or 0.99 when there is no MENUFADER node (D:L262255-262260).

**Branch A** -- taken when G+0x8fc < 0 **or** the fader quad's alpha != 128.0 (D:L262262). In order:

| step | lines | effect |
|---|---|---|
| A1 | D:L262264-262269 | if G+0x900 > 0: G+0x900 -= dt; else, only if G+0x8fc < 0: the input handler `FUN_00368650(G, pad)` (PLAT-11's). Input is never read while a switch is in progress |
| A2 | D:L262270-262273 | step = min(dt, 0.05) |
| A3 | D:L262274-262276 | if the dialog has event records: the zAnim tick `FUN_0034e070(step, 0x49ea50)` (PLAT-07's): **scripts run on the clamped step** |
| A4 | D:L262277-262286 | if G+0x8fc >= 0: o += 2 x step; if o >= 0.99: the quad's alpha = 128.0 and o = 0.99; MENUFADER's opacity = o |
| A5 | D:L262288-262347 | the queue loop, below |
| A6 | D:L262348-262350 | M's popup object (made if absent) ticked with step |
| A7 | D:L262351-262356 | every object (list G+0x6d8), then every control (list G+0x294), ticked with step |
| A8 | D:L262357-262361 | `FUN_0038d8f0(step, G, popupHidden)`: the third argument is 1 unless the `POPUP` node exists with bit 0 of its +0x5c set (`POPUP_FOCUS_READING`) |
| A9 | D:L262362 | the subclass tick (G+0x910 vtable +0xc) with step |

**The queue loop (A5)**, while M's count != 0, on record[top]:

| type | lines | effect | then |
|---|---|---|---|
| 8 | D:L262291-262303 | find the control by name in G (vtable +0x60 +0x24, recursive), its widget: set enabled 0 (+0x4c) | consume; next |
| 7 | D:L262304-262316 | the same with 1 | consume; next |
| 6 | D:L262317-262320 | `FUN_00366b60(G, name)` (activate the named button) | consume; next |
| 5 | D:L262321-262324 | `FUN_00365a00(G, name)` (§4) | consume; next |
| 2 | D:L262325-262339 | **history push of G's current name** (G+0x8e0), then `FUN_00365a00(G, name)`, then consume | **return: A6-A9 skipped this frame**, later records wait |
| 3, other | D:L262341-262346 | nothing | consume; next |

(A lookup that fails part-way in types 7 and 8 leaves the decompiler's register unset; read as "the named control's
widget, or nothing".)

**Branch B** -- G+0x8fc >= 0 and alpha == 128.0 (D:L262364-262370): only `FUN_00365a00(G, G's current name)`. No input,
no script tick, no queue, no popup or widget tick that frame.

Because the loop reads the top, records queued in one frame are applied **newest first**; a type-2 record stops the
loop, so a switch queued after other records in one frame is applied first and the older records wait for the next
branch-A frame.

## 4. The switch (`FUN_00365a00`, D:L262375-262458)

### 4.1 The state machine on G+0x8fc

| state | condition | effect | lines |
|---|---|---|---|
| < 0 (idle) | any call | if target == `REBOOT` and `DAT_0049e2cd` (booted from the disc): `FUN_0039dfc0` (`sceCdSeek` ahead); state = 3; G's current name = target | D:L262386-262398 |
| > 0 | alpha == 128.0 **or** target == `REBOOT` | hide the backplane (+0xc4, vtable +0x60 +0x38 with 0); state -= 1 | D:L262450-262456 |
| > 0 | otherwise | nothing | -- |
| 0 | any call | show the backplane (+0x38 with 1); state = -1; dispatch (§4.2) | D:L262399-262449 |

A call with state > 0 does not change the stored target: a second switch while one is in flight only pushes the history
(type 2) and may advance the countdown (`MENU_SWITCH_REENTRY_READING`).

**A switch, frame by frame** (frame F is the one whose A5 consumes the type-2 record; the input that started it ran in
F's A1 or A3; `s` = min(dt, 0.05)):

| frame | branch | what happens |
|---|---|---|
| F | A | history push; state 3; target stored; A6-A9 skipped |
| F+1 .. F+n | A (alpha != 128) | o += 2s each frame; at frame F+n, o >= 0.99: alpha = 128, o = 0.99. n = the first k with o0 + 2ks >= 0.99 (float32): from o0 = 0, **n = 30 at s = 1/60, 15 at s = 1/30** |
| F+n+1 | B | state 3 -> 2, backplane hidden |
| F+n+2 | B | 2 -> 1 |
| F+n+3 | B | 1 -> 0 |
| F+n+4 | B | backplane shown, state -1, dispatch: the new dialog is built behind an opaque fader |
| F+n+5 .. | A | the new dialog's scripts run; `menu_fade_up` takes MENUFADER 1 -> 0 over 1.5 s (§5) |

If the fader is already opaque when the switch is consumed (alpha 128: the previous dialog's `menu_fade_up` has not yet
lowered it, or a script left it at 0.99), n = 0 and the countdown starts on F+1.

### 4.2 The dispatch (state 0, D:L262402-262444; strcmp, case-sensitive, in this order)

| target | effect | CG requests (§8) |
|---|---|---|
| `LOAD_SCREEN` (0x3f8c40) | -- | switch(load state 0x4085ac) |
| `POP_TO_MENU_STATE` (0x3f8c50) | -- | pop(0), then switch(MS) |
| `MENU_SCREEN` (0x3f8c68) | -- | switch(MS) |
| `SHUTDOWN` (0x3f8c78) | -- | switch(shutdown state 0x408758): §9 |
| `REBOOT` (0x3f8c38) | `FUN_0022ed10`: §9 (no return on a console) | -- |
| any other name | unload G's dialog (`FUN_00369210`), `FUN_003564f0`, `FUN_0027ef70` (re-reads `readerm.zar` for the mission named by `DAT_004364fc`, when set); two debug prints if the name contains `dlgHype` or `dlgNetLogin` (an empty format: no effect); the fader quad reset (rect 0,0 640x448, colour black, alpha 128); begin/end hooks on G+0x8dc around `FUN_00367430(G, name, G+0xc0)` | -- |

`FUN_00367430` (D:L263179-263243) opens `data/common/zrdr/dialog/<name>`; when it is not found, **nothing more** happens:
the old dialog is already unloaded and the screen stays as the reset left it (an opaque fader over an empty plane;
`MENU_MISSING_DIALOG_READING`). When found it sets G's current name and builds (§4.3).

### 4.3 The build, in order (`FUN_00367950`, D:L263398-263775)

1. Unload again (`FUN_00369210` D:L264277-264425: the input timer 0, the `POPUP` node hidden and dropped, M's popup
   object destroyed, both roots replaced by empty ones, MENUFADER pointer 0, the script sets stopped and released,
   event records cleared, the movie stopped).
2. Fonts and textures; the background: when the dialog's background type (dialog+0x30) is 0, its image on the
   **backplane** (D:L263541-263579).
3. The dialog's event records (dialog+0x44, 0x10 bytes each, copied to G+0x6f8.., `DAT_0049eaa0` = 1;
   `MENU_EVENT_RECORDS_READING`) (D:L263580-263611).
4. **MENUFADER**: a node named `MENUFADER` wrapping the fader quad, added to the **foreplane**, the quad's alpha 128
   (D:L263612-263626).
5. Every control (and its children), then every object, added to the foreplane (D:L263627-263659).
6. The subclass's build hook; `FUN_00366730`; then **MENUFADER removed and re-added**, so it is the foreplane's last
   child so far (D:L263660-263665).
7. The 3D hook; M's popup object made if absent, wrapped as the node `POPUP`, added **last**, hidden (D:L263666-263688).
8. No event records: the quad's alpha = 0 (D:L263689-263691). Else: each `SCRIPT_LIBRARY` set loaded and started
   (`FUN_0026c600`, which starts the set's auto-start animations), then the event records of kind 0 fired
   (`FUN_00367810(G, 0, 0)`: `ONSTART`) (D:L263692-263734).
9. The focus's first control (D:L263735-263745); a movie background (type 1, or 2 looping): started, and when it fails
   to start the kind-3 records fire (`ONMPEGEND`) (D:L263746-263764); the TELETYPE sound looked up (D:L263765-263769).

**Draw order** (the foreplane walks its children in order): controls, objects, **MENUFADER, then POPUP**. This
refines research 95's `UI_DRAW_ORDER_READING`, which places MENUFADER beneath the controls: step 6 moves it above
them (research 95 is not edited here; PLAT-34 or 95's owner applies it).

## 5. MENUFADER: duration, curve, composition

- **How it is drawn** (`FUN_0036d8b0` D:L266729-266747, the 2D adaptor's draw, vtable 0x4072d0 slot +0xc): with f the
  opacity on the walk's stack at the node (its own +0x9c, research 95's `CHILD_OPACITY_INHERIT_READING`): if f < 1.0,
  the quad's alpha is set to f x 128 -- **except f == 0.99, drawn as 128** -- then the quad is drawn; if f >= 1.0 the
  quad keeps the alpha it holds. So a new dialog (opacity 1.0, alpha 128) is black until a script lowers the opacity,
  and a dialog without event records (alpha 0) shows at once. The tick's "alpha != 128" (§3) therefore reads the last
  drawn opacity.
- **To black, in code** (§3 A4): linear, +2 x min(dt, 0.05) per frame from the current opacity, capped at 0.99 (drawn
  opaque): 0.5 s from clear at 60 Hz (30 frames) or 30 Hz (15 frames); slower in wall time below 20 Hz (the clamp).
- **From black, in data** (`RUN/UIZANIM.ZAR` -> `UIanim.rdr`, decoded): `menu_fade_up` = one sequence,
  `OBJECT_OPACITY_FROM_TO` MENUFADER from 1 to 0, rate -0.6667 per s, 1.5 s: **linear, 1.5 s**. It is the set's only
  animation whose **`params.flags`** (`ZAnimParams.flags`, the `Anim_Params` word) is 0x21, i.e. `params.flags & 3` = 1;
  the other 18 are 0x22 (`& 3` = 2). Read as "starts with the set" (`MENU_FADE_UP_AUTOSTART_READING`). Not to be
  confused with the per-sequence `UiSequence.activation` (`decodeUiProgram`, the `_zsequence` word's bits 1-7): every
  one of the 19 animations has a sequence with that field 1 -- the first sequence of 18 of them, the fourth of
  `intro_onstart` (2,2,2,1) -- so keying auto-start on it would start `goto_menu`, `OnMultiplayerDisconnect` (which
  reaches `REBOOT`) and the rest at every build. 97 of READERC's 103 `dlg*.rdr` list `UIanim.rdr` in `SCRIPT_LIBRARY`; the six that
  do not: `dlgExitState`, `dlgHype`, `dlgLoad`, `dlgMultiplayerFinal`, `dlgMultiplayerFinalReally`,
  `dlgMultiplayerRound` (READERC copies). One dialog also binds `menu_fade_up` to `EVENT ONSTART` and one to
  `ON_STATE_POP`. 99 animations stop `menu_fade_up` before they switch or open a popup (e.g. `goto_menu`).
- **Script fades of MENUFADER** across UIZANIM (the dims around popups and the scripted fade-outs; from -> to in
  seconds: count): 0 -> 0.7 in 0.05: 48; 0.7 -> 0 in 0.05: 54; 0 -> 0.99 in 0.5: 14; 0.8 -> 0 in 0.05: 3; 0 -> 0.8 in
  0.05: 1; 0.99 -> 0 in 0.75: 1; 0.99 -> 0 in 0.01: 1; 0.75 -> 0 in 0.01: 2; 0 -> 0.75 in 0.01: 1; 1 -> 0 in 1.5: 1
  (`menu_fade_up`). Their curve is `OBJECT_OPACITY_FROM_TO`'s (research 95 §1.5; PLAT-07).
- **The load state's ramps** (§8.2) are a second, separate fader: they write the quad's alpha directly, (1 - t/0.5) x
  128 in and (t/0.5) x 128 out, 0.5 s each.

## 6. Popups (`FUN_0027eff0` D:L126862-126904; `FUN_0027d190` D:L125846-125859)

| call | effect, in order |
|---|---|
| `PopUpDialog(name)` | top += 1 (directly on M+0x824); the name (or the `INPUT_STRING` input) copied into record[top] with type 3; count += 1; find the node `POPUP` in the current G (`DAT_00414e40`, vtable +0x60 +0x24, recursive); if found: show it (+0x38 with 1) and play `.METAL` (vtable +0x1c with 1, 0, 0xff) |
| `KillPopUp` | only when M's popup object exists (M+0xe40): find `POPUP` in G; if found, hide it (+0x38 with 0). The queue, the popup object and MENUFADER are untouched |
| G's unload | the `POPUP` node hidden and dropped, M's popup object destroyed (`FUN_0027ef10`) |
| record type 3 | consumed by §3's loop with no effect: **the popup's name is not used** (`POPUP_NAME_UNUSED_READING`) |

There is one popup per screen: the `POPUP` node, built hidden after MENUFADER (so above it), ticked on every branch-A
frame that consumes no switch (§3 A6). Its content is set by the script's `POPUP` node command (research 95 §1.2's
record: text id, buttons); the dimming is the script's MENUFADER fade (0 -> 0.7 in 0.05 s, §5). While it is shown, §3
A8 is told so.

## 7. `CMenuState` (MS, 0x408538; vtable 0x405010)

| slot | function | behaviour |
|---|---|---|
| +0x10 Init | `FUN_001f4860` D:L54778-54914 | if MS+0xc (0x408544) is non-zero: CG switch(load state) and nothing else (D:L54910-54912). Else: open `run/ui` `readerc.zar`, `ui`, the sound banks (`sounds.rdr` HUDUI, SMUS, UIVOICE; `UI`); read `uisounds.rdr` `SOUNDS`: TELETYPE -> MS+0x14, BACK -> MS+0x20, SELECTION -> the handle at MS+0x2c; make G (vtable 0x405040: start dialog = MS+0x30, has-3D 1); open `run/uizanim.zar`; build G on the start dialog (`FUN_00368570` D:L263778-263801); MS+0x10 = 0; write the valve `NETCNF_REQUIRED` |
| +0x14 Tick | 0x1f4640 (disassembly 0x1f4640-0x1f485c) | in order: (1) G's background movie (`FUN_00366940`, PLAT-21's); (2) the pad (`FUN_002d9e40` -> `FUN_002da930`); (3) `FUN_00341a60(0, dt)`, (4) `FUN_00341250(dt)`; (5) **G's tick** `FUN_003654c0(dt, G)` (§3); (6) drain the system-message queue at 0x437690, each message (up to 0x7e characters) to MS's vtable +0x2c, `FUN_001f4d20` D:L54919-54934, with its kind byte and the flag 1: the text display `FUN_001f4df0` (`FUN_001f5020` when `DAT_0044f3d0` is 11); only a call with 2 there fires `MP_SYSTEM_MESSAGE`; (7) draw the backplane; (8) the 3D scene when a model is set (0x45c380); (9) `CGameMenu_DrawForeplane` `FUN_00369170` (MENUFADER, controls, objects, POPUP); (10) `FUN_00350cd0`; (11) if MS+0x10 > 0: MS+0x10 -= 1 and `zVid_Swap(0, 1)`, else `zVid_Swap(1, 1)` (`ZVID_SWAP_ARG_READING`) |
| +0x18 | 0x1e7c30 | nothing |
| +0x1c UnInit | `FUN_001f4440` D:L54706-54747 | stop the sounds and streams, destroy G, **`FUN_0027edf0(M, 1)`** (§1.1), release the zAnim archive |
| +0x20 OnCover | 0x1f4630 | `FUN_00366b10(G)`: stop G's background movie (another state is pushed over MS) |
| +0x24 OnPop | `FUN_001f45e0` D:L54766-54775 | restart G's background movie (`FUN_00366a00(G, 0)`), fire `ON_STATE_POP` (event 0xd) into G, MS+0x10 = 2 |

**The start dialog.** MS+0x30 (0x408568, 0x40 bytes) is the dialog MS's Init builds. The game object's constructor
writes `dlgIntroScreen.rdr` there (`FUN_001e7530` D:L47915-47968 through `FUN_001e7b50` D:L48146-48153); the boot
option `menu_state` overwrites it (`FUN_001eabd0` D:L49976-49996 registers `menu_state` with the handler 0x1eace0, which
strncpy's its string argument into 0x408568; the options are read from the command line and `ftsxp.rdr`);
`SetDefaultMenuScreen`, `GameStatePopCommand`, `CloseAndSwitch`, `AbortLoad` (§2.3) and the network error paths
(`dlgNetError.rdr`, `dlgNetAbandoned.rdr`, `dlgNetAbort.rdr`: D:L55712-55742, D:L147823-147883, D:L150624) write it too.
Boot pushes MS first: the game object's +8 is MS (D:L47966), switched to by `FUN_002d04d0` D:L172888-172896.

**Named events into G** (`FUN_001f3bf0` D:L54424-54705, matched by strcmp to a kind, then `FUN_00367810(G, kind,
arg)` fires the event records of that kind): `ONSTART` 0 (never by name: 0 means "not found"), `ONEXIT` 1,
`ONACTIVATE` 2, `ONMPEGEND` 3, `MP_JOIN_ROOM` 4, `MP_PLAYER_NOT_FOUND` 5, `MP_SUCCESS` 6, `MP_CREATE_CLAN_SUCCESS` 7,
`ON_STATE_POP` 0xd, `ON_SKB_APPLY` 0xe, `ON_SKB_APPLY2` 0xf, `ON_SKB_CLOSE` 0x10, and more up to 0x1e+.

## 8. The game states and the boundaries

### 8.1 CG's machine (`FUN_002ce9e0` D:L171862-171952; requests `FUN_002cf2f0` pop D:L172222-172240, `FUN_002cf380` push D:L172245-172263, `FUN_002cf410` switch D:L172271-172292)

CG: +4 running (u8), +0xc the top index (u32, < 16), +0x14 the stack (16 pointers), +0x58 a FIFO of requests {kind,
state, arg}. A state's vtable: +0xc on-request (the new state, at request time), +0x10 Init (returns success), +0x14
Tick(dt), +0x18 on-leave-request (the current top, at request time, for a switch and a pop), +0x1c UnInit, +0x20
OnCover(arg), +0x24 OnPop(arg).

| request | at request time | applied (next CG tick, front of the FIFO, one per tick, that tick's top **not ticked**) |
|---|---|---|
| switch(S) | top +0x18, S +0xc | (a null S: nothing); top UnInit (skipped when the top is null); `FUN_003b05e0()` (`STATE_CHANGE_FRAME_SYNC_READING`); clamp the index to 15; S Init: success -> stack[index] = S, failure -> the old top's Init again (skipped when the top is null) (D:L171899-171913) |
| push(S) | S +0xc | (a null S: nothing); `FUN_003b05e0()` (`STATE_CHANGE_FRAME_SYNC_READING`); top OnCover(arg); S Init: success -> index += 1 (clamped to 15), stack[index] = S; **failure -> index and stack unchanged, and nothing undoes the OnCover** (the old top stays covered: for MS, its background movie stays stopped) (D:L171928-171938) |
| pop(arg) | top +0x18 | top UnInit (skipped when the top is null); stack[index] = 0; index -= 1; new top OnPop(arg) |

So `POP_TO_MENU_STATE` takes two CG ticks: the pop (the round's state gets OnPop(0)), then the switch to MS.

### 8.2 The states (the game object `COurGame`, constructor `FUN_001e7530`)

| state | object | Init / Tick / UnInit | role |
|---|---|---|---|
| MenuState | 0x408538 | §7 | the front end |
| LoadState | 0x4085ac | Init `FUN_001f6660` D:L55787-55877, Tick `FUN_001f5e70` D:L55583-55784, UnInit `FUN_001f5d40` D:L55538-55564 | builds a `CLoadMenu` G on `dlgLoad.rdr` (`run/ldzanim.zar`); fades in (+0xc: alpha (1 - t/0.5) x 128, t from 0 to 0.5 s); starts the map load (`FUN_001ebba0(CoreState, 1)`); when the load is done fades out ((t/0.5) x 128) and at t > 0.5 s **switches to CoreState**; when its abort flag (+0x1a, `AbortLoad` or a network error) is set, switches back to MS; its Tick also runs G's tick, the backplane draw and `zVid_Swap(1, 1)` |
| CoreState | 0x4085d0 | Tick `CCoreState_Tick` 0x1ebed0 | the round |
| ExitState | 0x4086a0 | Init `FUN_001f1bb0` D:L53449-53504, UnInit `CExitState_UnInit` | the offline end of a mission (`dlgExitState.rdr`, `run/extzanim.zar`), **pushed** over CoreState (D:L150569, D:L150605) |
| MPExitState | 0x4086c8 | Init 0x223970, Tick `FUN_00223680`, UnInit `FUN_002232a0` | the online end of a round, **pushed** (D:L150670, D:L151134) |
| Cinematic | 0x4086f4 | -- | pushed by `PlayMPEG` (`FUN_0027ab30` D:L124666) |
| ShutdownState | 0x408758 | Init `FUN_0022ea70` D:L80981-81008 | §9 |
| RebootState | 0x408760 | Init `FUN_0022ebf0` D:L81033-81053 | §9; no request in the decompilation names it |

**The loop.** Front end (MS, dialogs switched by §4) -> `SWITCHMENU LOAD_SCREEN` (4 animations: `LoadMission` in
`dlg_equipment_main.rdr` and `Common_Brief_Anims.rdr`, `dlgMenu.rdr/MissionShortcutSKB`, `dlgGameLobby.rdr/check_loop`) ->
after §4's countdown, CG switches MS -> LoadState (MS UnInit: G destroyed, M flushed) -> CoreState -> the end of the
round pushes ExitState or MPExitState -> its dialog leaves by `CloseAndSwitch`/`GameStatePopCommand` (pop, then switch
to MS on the default screen it set) or `ReplayMission` (pop(1): CoreState's OnPop replays). MS's Init then builds G on
MS+0x30.

## 9. Leaving the game: REBOOT and SHUTDOWN

| path | function | lines | effect |
|---|---|---|---|
| `SWITCHMENU REBOOT` | `FUN_0022ed10` | D:L81077-81096 | `FUN_0034f920`, `sceCdInit(5)`, `sceSifExitCmd`, then `LoadExecPS2`: booted from the disc, `cdrom0:\SCUS_972.75;1` with 3 arguments `--menu_state`, `dlgAfterErrorReboot.rdr`, `` (0x3dc9d0); else `host0:` + the ELF's name. The call is at 0x22ED54 (PC research 78 §0; KNOWN line 18: in-process, the restarted guest reaches the main menu) |
| `SWITCHMENU SHUTDOWN` -> ShutdownState Init | `FUN_0022ea70` | D:L80981-81008 | sets the return dialog to `dlgReturnFromNTGUI2.rdr` or `dlgReturnFromNTGUI2LAN.rdr` (by `FUN_003045b0(0x44fe10)`), then `LoadExecPS2("cdrom0:\SCUSNGUI.ELF;1", 4, {ENGLISH, cdrom0:\SCUS_972.75;1, --menu_state, <return dialog>})`; from `host0:`, `host0:.\SCUSHGUI.ELF` |
| RebootState Init | `FUN_0022ebf0` | D:L81033-81053 | as REBOOT with `dlgAfterReboot.rdr` (0x3dc9e0); unreferenced by any request read here |

For the browser (the block's "a reboot equivalent"): the relaunch is "reset every state to the boot state and open MS on
the dialog named by `--menu_state`" -- the valves and UI variables survive only through what the card or the persistent
store holds (research 104), and M, G and CG start empty. `SHUTDOWN`'s external ELF has no browser counterpart (an
owner's call: `NETWORK_GUI_PLACEHOLDER`).

## 10. Where this differs from the block, and from earlier notes

- The block's "switches are queued 0x34-byte records (type 2 switch, 5 back)" holds; the queue also carries 3, 6, 7, 8,
  and is consumed newest first. "`PREVIOUS_SCREEN` pops it": at **queue** time, not when applied; and a forward switch to
  the history's top is a back.
- "SetMenuState 0x27c9f0 (D:L125558)" is online game-state code, not the manager's state (§2.3).
- `SHUTDOWN` is not a power-off: it launches the network setup GUI ELF (§9).
- "MENUFADER (e.g. 0 -> 0.99 in 0.5 s, web R95 §4.1)" is a script fade (14 uses); the manager's own fade is the code of
  §3 A4 (same speed, 2 per s) and the fade-in is `menu_fade_up`, 1.5 s (§5).
- Research 95's `UI_DRAW_ORDER_READING`: MENUFADER is moved above the controls and objects, and POPUP above it (§4.3).
- `CMenuState_Tick` is not in the decompilation as a function (0x1f4640 is read from the ELF).

## 11. The tests to transcribe (the reading level), and the evidence for the proven level

Tests (each names its function and lines): M's push and consume (types 2-8, count, top, `NO_ARG`); SwitchMenu S1-S4
including the case-insensitive match, the empty-history BACK sound, and the pop at queue time; the history push at
consumption with G's current name; `FlushMenuHistory` leaving types, count and top while blanking names; the newest-first
order and the type-2 stop; branch A's step order and the clamp; the switch timeline of §4.1 for o0 = 0 and 0.5 at
dt = 1/60, 1/30 and 0.1; branch B freezing input, scripts and the queue; the dispatch table; the draw rule of §5 (0.99
as 128); PopUpDialog/KillPopUp; the `INPUT_STRING` substitution and its exceptions (`AbortLoad` stores the literal,
§2); `CloseAndSwitch`/`ReplayMission` by offline / online host / online non-host (§2.3); CG's one-request-per-tick FIFO,
the two-tick `POP_TO_MENU_STATE` and a push whose Init fails (the old top covered, the index unchanged, §8.1); the load
state's two 0.5 s ramps; the reboot's argument block.

**What exists for the proven level** (searched 2026-10-02):

- **No call trace of the manager.** `logs/` and `logs/parity/` hold `[call]` traces of other functions only (the
  heaviest: `ScriptEvtSound`, `LoaderNew`, `PoolNew`, `NetIdle`; and `InitExecPS2`/`SetArg`/`LoadExecPS2Wrap` in
  `logs/parity/s17_q0/*.log` and the `s11_r0004_*` title gates); none names 0x27e720, 0x27eb10, 0x27d190 or 0x365a00.
  `D:/socom_archive/parity` holds none either. The trace is PLAT-36's to make (the block's `PS2X_CALL_TRACE` line).
- **The title gate** `logs/parity/gate/x51_gate_iop/title/`: 23 settled frames s00..s22 about 6 s apart, no buttons
  (manifest `t`, `stable`); **the options run** `logs/parity/runs/options_explore/`: s00..s11, DOWN/CROSS presses
  1.8-4.6 s apart. Both are settled screens: they score screens (PLAT-30), not fades.
- **The only bursts**: `logs/parity/runs/transition_pcsx2/` (PCSX2) `s09_burst_000..063`, `s11_burst_000..062`,
  `s13_burst_000..062` after the CROSS at 73.2 s, 93.2 s, 112.0 s; the manifest records no burst interval, the files'
  modification times are about 0.22 s apart (~4.5 per s), and s09 goes from black (frames 0-10) to the scene: the load ->
  round boundary at two or three samples per 0.5 s ramp, not enough for a curve.
- **What would settle the timing**: a PCSX2 burst of at least 30 per s across one `goto_menu` switch on the main menu
  (the 30 + 4 frames and the 1.5 s `menu_fade_up`), and one across `LOAD_SCREEN` (the two 0.5 s ramps) -- OPT-19's
  capture window (W9.R8), with the PLAT-36 trace beside it.

## 12. What is settled, what is not

- **Settled at the reading level**: M's layout and both stacks; every command's queue effect; the consumer's order; the
  history's semantics; the switch state machine and its frame count; the dispatch; the build order; the fader's draw rule
  and the code fade; `menu_fade_up`'s numbers off the disc; CG's request rules; the states' roles; the reboot and
  shutdown argument blocks.
- **Not settled**: that `params.flags & 3` = 1 is what `FUN_0026c600`'s auto-start bit tests (PLAT-07); the dialog+0x44 records
  being the dialog's `EVENTS` with 10 slots; the meaning of `zVid_Swap`'s first argument; the play arguments of the BACK
  and `.METAL` sounds; what `FUN_0038d8f0` does with "popup hidden"; the frame rate the menus run at (PLAT-12).

## 13. Placeholders and readings

Written before the code: each row was *note only* until PLAT-10 (or the task named) declared it. PLAT-10's
implementation (2026-10-02, §14) declared six of them, marked in their status; the rest are still *note only* (the code
cites some in its documentation). The names the implementation added are §15's.

| name | stands for | searched / reading | status |
|---|---|---|---|
| `MENU_QUEUE_OVERFLOW_READING` | a 40th pending record | `FUN_0027e720` and kin pre-increment M+0x824 with no bound; record 40 would overwrite the count (M+0x820). Reading: refuse past 39 pending (never reached by the disc's scripts as read) | in code, `packages/ui/src/screens/menuQueue.ts` (2026-10-02) |
| `MENU_HISTORY_OVERFLOW_READING` | a 33rd history push | `FUN_0027f3f0` takes the free list's last of 32 buffers unchecked. Reading: keep the newest 32 | in code, `packages/ui/src/screens/menuQueue.ts` (2026-10-02) |
| `MENU_NAME_LENGTH_READING` | a name of 48 characters or more | records copy with strcpy into 0x30 bytes, MS+0x30 with strncpy 0x40. Reading: names cut at 47 characters (the disc's are shorter) | in code, `packages/ui/src/screens/menuQueue.ts` (2026-10-02) |
| `MENU_SWITCH_REENTRY_READING` | a switch consumed while one is in flight | §4.1: the history is pushed, the target is not replaced, the countdown may advance; transcribed as read | in code, `packages/ui/src/screens/menuShell.ts` (2026-10-02) |
| `MENU_MISSING_DIALOG_READING` | a switch to a dialog not on the disc | §4.2: unloaded, nothing built, the fader left opaque; transcribed as read | in code, `packages/ui/src/screens/menuShell.ts` (2026-10-02) |
| `MENU_FADE_UP_AUTOSTART_READING` | why `menu_fade_up` runs at a build | `FUN_0026c600` (D:L116312-116387) starts the animations whose runtime bit (+5, bit 3) is set; `menu_fade_up` is `UIanim.rdr`'s only animation with `params.flags` 0x21 (`& 3` = 1; the other 18 are 0x22). Key it on `params.flags`, never on `UiSequence.activation` (1 in all 19, §5). PLAT-07 (research 106) to confirm the mapping | *note only* |
| `MENU_EVENT_RECORDS_READING` | dialog+0x44, 0x10-byte records | the build copies them without a bound, the unload clears 10 (D:L264393-264405); taken as the dialog's `EVENTS` (kind at +0xd) | *note only* |
| `POPUP_NAME_UNUSED_READING` | `PopUpDialog`'s argument | the type-3 record is consumed with no effect (§3); no other reader of M's records found (the only users of `FUN_00274930` are §1.1's flushes and §3). Reading: the argument is ignored | *note only* |
| `POPUP_FOCUS_READING` | `FUN_0038d8f0`'s third argument | 1 unless the `POPUP` node's +0x5c bit 0 is set; read as "the dialog's focus is live while no popup shows" (PLAT-11/PLAT-16) | *note only* |
| `MENU_SOUND_PLAY_READING` | the BACK play (+0xc with 0, 0xff) and `.METAL` play (+0x1c with 1, 0, 0xff) | the sound object's slots are PLAT-23's (research 81) | *note only* |
| `STATE_CHANGE_FRAME_SYNC_READING` | `FUN_003b05e0()`, called by `FUN_002ce9e0` before a switch's and a push's Init (D:L171903, D:L171928) | `FUN_003b05e0` (D:L304875-304886): samples `REG_RCNT0_COUNT` (x `DAT_0049e2d8`) into `DAT_004a44a4`, the elapsed time the frame end `FUN_003aff30` (D:L304731+) reads for its frame-rate wait; increments the frame counter `_DAT_004a4490` (the frame end increments it too, D:L304765); `FUN_00350cd0` flips the scratchpad packet buffer (D:L250152-250171); `FUN_001a21a8(0, 0)` waits for the VIF1 and GIF DMA to go idle (D:L22456+). Frame and timer bookkeeping, PLAT-12's clock. Reading: PLAT-10 calls an injected frame-sync hook at that point of the order (a no-op until PLAT-12 gives it a body); no state-machine behaviour depends on it | *note only* |
| `ZVID_SWAP_ARG_READING` | `zVid_Swap`'s first argument, 0 for two frames after OnPop | `FUN_003aff30` D:L304731+ not read further; PLAT-12 | *note only* |
| `NETWORK_GUI_PLACEHOLDER` | `SHUTDOWN`'s launch of `SCUSNGUI.ELF` | no browser counterpart; the owner's call (keep the return dialog, or refuse the target) | in code, `packages/ui/src/screens/launch.ts` (the browser returns at once) (2026-10-02) |

## 14. The implementation (added 2026-10-02, PLAT-10)

Where each section above landed, in `packages/ui/src/screens/` (W9.R6) and the page; every value transcribed is at the
reading level, **pending review** (AGENTS.md), unit-tested against this note's lines.

| section | file | what it holds |
|---|---|---|
| §1.1, §2.1, §2.2 | `menuQueue.ts` | M: the 40 records, `push` / `peek` / `consume` (`FUN_0027f460` as read, types 0 and 1 included), the history, the two flushes, SwitchMenu's S1-S4, the button and popup records |
| §1.2, §3, §4, §6 | `menuShell.ts` | G: `tick` (branches A and B, A1-A9 in order, the f32 fade with the `min(dt, 0.05)` step), `switchTo` (`FUN_00365a00`), the dispatch, `start` / `open` / `build` / `unload` (`FUN_00368570`, `FUN_00367430`, `FUN_00367950`, `FUN_00369210`), `popUp` / `killPopUp`, `suspendInput` (G+0x900; the `SuspendMenuInput` row is PLAT-11's) |
| §6 | `popupSlot.ts` | **the overlay slot** (W9.R4): M's popup object made on demand, attached to the `POPUP` node at each build, shown and hidden; one slot per front end (`FrontEndSession.popups`, handed to every dialog host the machine makes): PLAT-16 connects its component with `session.popups.connect(factory)` |
| §8.1 | `gameStates.ts` | CG: the FIFO, one request per tick on an unticked frame, the switch / push / pop rules, the clamp, the frame-sync hook |
| §7, §8.2 | `menuState.ts` | MS (Init, Tick in 0x1f4640's order, UnInit, OnCover, OnPop and its ON_STATE_POP and two-frame hold), the load state offline (below), the shutdown state |
| §9 | `launch.ts` | the reboot's and the shutdown's argument blocks (re-read off the ELF at 0x3e5c60, 0x3dc9d0, 0x3e5ba0, 0x3dc9c0, 0x3e5b80, 0x3e5b60), `--menu_state` read back |
| §2 | `screenCommands.ts` | twelve rows registered in PLAT-08's host (below) |
| §3 A3, §4.3 step 8 | `screenScripts.ts` | PLAT-07's runtime over the **screen's** nodes (MENUFADER and POPUP reachable, which `dialogNodeTree` does not hold), the sets started, the event records fired through PLAT-21's `deliverDialogEvent` |
| §4.2 | `dialogArchive.ts` | the dialog lookup over READERC then READERX |
| §8 | `frontEndMachine.ts` | the states assembled, the boot (CG's first request: the switch to MS), the relaunch |

**PLAT-08's table is a registry** (`UiCommandHost.setHandler`, W9.R4's second case): no table row is edited; the
screens register these rows, each by index and name -- 12 SwitchMenu, 13 PopUpDialog, 14 KillPopUp, 15
ActivateButton, 18 EnableButton, 19 DisableButton, 73 ReplayMission, 74 CloseAndSwitch, 85 GameStatePopCommand, 86
SetDefaultMenuScreen, 95 AbortLoad, 131 FlushMenuHistory. The table's `task` column names ONL-20 for ReplayMission,
CloseAndSwitch and GameStatePopCommand and ONL-18 for AbortLoad: their **offline** bodies are the front end's boundary
with the round and are transcribed here; their online branches call hooks the online lane fills (`gameState5`,
`report`).

**Re-read at the source for the code** (2026-10-02): `FUN_0027e720` D:L126556-126639, `FUN_003654c0` D:L262239-262372,
`FUN_00365a00` D:L262375-262458, `FUN_0027f460` D:L127000-127037, `FUN_0027eff0` D:L126862-126904, `FUN_0027d190`
D:L125846-125859, `FUN_0027c7f0` D:L125492-125512, `FUN_002ce9e0` D:L171862-171952 with its three requests (D:L172222-
172296), `FUN_00368570` D:L263778-263801, `FUN_00367430` D:L263179-263243, the boundary rows (D:L123712-123746,
D:L127379-127395, D:L128101-128135, D:L123260-123270, D:L55527-55534), MS's Init tail, UnInit and OnPop
(D:L54706-54776, D:L54860-54914), the load state's Init, Tick and UnInit (below), `FUN_0022ea70` and `FUN_0022ed10`.
They agree with §1-§9; two facts the note did not state are added here.

**The load state, read further** (`FUN_001f6660` D:L55787-55877, `FUN_001f5e70` D:L55583-55784, `FUN_001ebba0`
D:L50633-50662, `FUN_001ebda0` D:L50717-50739). Init sets +0xc (fading in) 1, +0xd (fading out) 0, +0x10 (the ramp's
time) 0, +0x18 (load started) 0, +0x19 (not yet started) 1, and clears the abort flag +0x1a. The map load's busy flag
is CoreState+0xb4 (`DAT_00408684`): `FUN_001ebba0` sets it **before** it starts the load thread (D:L50642), and the
thread's last act clears it (D:L50735). The offline Tick, in order: an abort switches to MS unless CoreState+0xb5 and
+0xb4 are both set (a load in flight finishes first); then, if not fading out, not busy and +0x19 clear, fading out
starts (t = 0); else, if neither ramp runs and nothing started, the load starts (+0x18 = 1, +0x19 = 0); the fade in
(t += dt, capped at 0.5 where it ends, alpha (1 - t/0.5) x 128); the fade out (t += dt, past 0.5 s the switch to
CoreState and return, else alpha (t/0.5) x 128); then G's tick and draw. So the load cannot start until the fade in
has ended, and the fade out cannot start until a started load is done. `LOAD_FADE_SECONDS`.

**The dialog host's "has event records" flag** (`DAT_0049eaa0`) is taken from the build's own result: PLAT-14's
`buildDialogScreen` leaves the fader's alpha 0 exactly when nothing set the flag (§4.3 step 8, D:L263689-263691), so
the shell reads it there rather than repeating PLAT-14's rule.

**The page's entry** (`packages/viewer/src/frontEnd.ts`; the owner's default 3): `?menuflow` (or
`?menuflow=<dialog>.rdr`, as `--menu_state`; PLAT-10's `frontend`, renamed 2026-10-02 by OT.R9 with no alias kept,
its path then mirroring the menu flow: research 129) puts a 640 x 448 canvas over the page and runs the front end on PLAT-12's
`UiClock` (`frameSync` wired to CG), with PLAT-21's `MoviePlayerHost` (the black picture source until PLAT-19b's
decoder is handed in) behind a `BACKGROUND TYPE MPEG` dialog -- the player writes PLAT-14's layer, ONMPEGEND goes to
the dialog built now, the movie state's pop to MS's `statePop` -- and PLAT-21's three movie rows registered beside the
screens'. It reads the served tree only (`?devmode`); the map viewer and Play are untouched (`main.ts` gains one
call). The browser's relaunch is applied at the end of the frame that launched (the console never returns from
`LoadExecPS2`); the network GUI is not run (`NETWORK_GUI_PLACEHOLDER`).

**On the disc** (`packages/ui/test/screens/frontEndDisc.test.ts`): `dlgIntroScreen.rdr` opens and `UIanim.rdr`'s
`menu_fade_up`, run by PLAT-07's runtime on the screen's MENUFADER, takes it from 1 to 0 in 1.5 s (about 0.5 at 22-23
ticks of 29.97 Hz, 0 by 45); every one of the 114 READERC and READERX dialogs opens as a start dialog and runs 30
frames; nine carry a movie background. That is §5's fade from black, measured on the transcription, not on the
original running.

**The scored items (W9.R8, recorded by W9.R12).** The block's acceptance scores the title gate s00..s18
(`logs/parity/gate/x51_gate_iop/title/`) and `logs/parity/runs/options_explore/` (s00..s11 and `final.png`). None is
scored yet: PLAT-30's harness is merged, but the entry draws no bitmap, glyph or widget until PLAT-15's widget set is
connected to it (`FRONT_END_TEXTURES_PLACEHOLDER`), so a score now would measure a black frame against the original's
screens. The proven level stays PLAT-36's trace; PLAT-10 merges at the reading level. *[Corrected 2026-10-02 at the
review: the earlier list named the `boot.*` rows and `options.menu.video-row` by their family, unchecked, and a fourth
record "owed to the wave-7 run". The manifest's `boot.*` rows cite no title-gate frame in s00..s18 (only
`boot.loading-logo` w00_000 and `boot.zipper-card` w00_006, outside the window), and `options.menu.video-row` cites only
`presets_explore/s12_CROSS`. The rows below are re-derived from `../parity/golden-manifest.json`, every `captures[].path`
under the two runs. The records follow W9.R12, the controller, 2026-10-02; the owner may overturn: a frame that a
manifest row cites is **owed to PLAT-30** (the controller's wave-7 run, once the entry draws the dialog). A frame that
no row cites is **a missing row, owed to PLAT-31 (the manifest) and OPT-19 (the capture window)**. There is no fourth
record.]*

| frame | manifest row id | record |
|---|---|---|
| title `s00_none.png` | `menu.main` | owed to PLAT-30 (the controller's wave-7 run, once the entry draws the dialog) |
| title `s01_none.png` .. `s18_none.png` | none | a missing row, owed to PLAT-31 (the manifest) and OPT-19 (the capture window) |
| options_explore `s04_CROSS.png` | `menu.main.options-lit` | owed to PLAT-30 (the controller's wave-7 run, once the entry draws the dialog) |
| options_explore `s05_DOWN.png` | `options.menu` | owed to PLAT-30 (the controller's wave-7 run, once the entry draws the dialog) |
| options_explore `s09_DOWN.png` | `options.menu.hdd-row` | owed to PLAT-30 (the controller's wave-7 run, once the entry draws the dialog) |
| options_explore `final.png` | `options.menu` | owed to PLAT-30 (the controller's wave-7 run, once the entry draws the dialog) |
| options_explore `s00_none.png`, `s01_DOWN.png`, `s02_DOWN.png`, `s03_DOWN.png`, `s06_DOWN.png`, `s07_DOWN.png`, `s08_DOWN.png`, `s10_DOWN.png`, `s11_none.png` | none | a missing row, owed to PLAT-31 (the manifest) and OPT-19 (the capture window) |

The frames with no row are 27: title s01..s18 (18) and options_explore s00, s01, s02, s03, s06, s07, s08, s10, s11 (9).
Each is present in the archive (`SOCOM_PC_ROOT/logs/parity/`). Each options frame's MD5 is distinct, so
none is a byte copy of a cited frame. `menu.main` also cites `scripts/parity/refs/heldout/title_s03.png`, `title_s09.png`
and `title_s15.png`, but their pixels differ from the gate's s03, s09 and s15 (another run's frames), so they do not
cite these frames. No other state's frame stands in for a missing row (W9.R8). The gate run's frames outside
the window are not PLAT-10's items: w00_000 (`boot.loading-logo`), w00_006 (`boot.zipper-card`), s19
(`menu.attract-fade`), s21 and s22 (`menu.attract`); w00_001..w00_005, w00_007..w00_009, s20 and `final.png` are cited
by no row.

**Found against PLAT-21's host** (for its owner, not changed here): `MoviePlayerHost` runs the pushed movie state in
place of CG's push, so MS's OnCover (`FUN_00366b10`, the background stopped) is not called when the movie starts; the
host restarts the background at the pop (`statePop`) as OnPop does. Owed to PLAT-21 (or the controller): the host
to call MS's `onCover` (`menuState.ts`) when the pushed movie starts; no test covers it yet (re-confirmed 2026-10-02 at
the review). *[Resolved 2026-10-02 by sprint 9's connecting lines: §16.4.]*

## 15. Placeholders and readings added by the implementation (2026-10-02)

| name | stands for | searched / reading | status |
|---|---|---|---|
| `INPUT_STRING_ARGUMENT_READING` | `INPUT_STRING`'s replacement, `FUN_00272480(ctx+0x18, 0)` (D:L119977-120010) | the running instance's first string input; a binding supplies its ARGUMENT or event text (`FUN_00367810` D:L263376-263386), and CALL flag 1 copies its caller's inputs (`FUN_0025d5c0` D:L107577-107592). Updated 2026-10-23 from the former binding-name-only model: the runtime now owns inputs per instance and scopes the current instance through ticks and guards ([research 363](363-native-ui-call-inputs.md) §§1-2) | in code, `packages/ui/src/screens/screenScripts.ts`; revised ownership/inheritance **reviewed reading**, source/code PASS at `864603c5f` (MLS-PASS) |
| `INPUT_STRING_NULL_READING` | an argument that resolves to nothing | it reaches `strcmp` / `strcpy` as a null pointer in the original (D:L126571, D:L126876); the command does nothing and answers 1 | in code, `packages/ui/src/screens/screenCommands.ts` |
| `DEFAULT_MENU_SCREEN_LENGTH_READING` | a start-dialog name of 64 characters or more | MS+0x30 is written with `strncpy(.., 0x40)` (D:L123722, D:L123739, D:L128114, D:L55531); cut at 63, as `MENU_NAME_LENGTH_READING` cuts the records' | in code, `packages/ui/src/screens/screenCommands.ts` |
| `DIALOG_NAME_MATCH_READING` | how a switch's name finds its dialog | `FUN_0032f630`'s archive compare (through `FUN_0032c040`) not read to the byte; exact member name first, then case-insensitive | in code, `packages/ui/src/screens/dialogArchive.ts` |
| `NTGUI_RETURN_LAN_PLACEHOLDER` | which return dialog `SHUTDOWN` names | `FUN_003045b0(0x44fe10)` (D:L80988) not read; false (the WAN dialog) stands in | in code, `packages/ui/src/screens/launch.ts` |
| `POPUP_COMPONENT_PLACEHOLDER` | M's popup object until PLAT-16 connects | draws nothing, ticks nothing; PLAT-16's component (research 118) replaces it through `PopupSlot.connect` | replaced 2026-10-02 (sprint 9's connecting lines, §16): the page connects PLAT-16's `SlotPopup`; an unconnected slot (the shell's unit tests only) is `POPUP_UNCONNECTED` |
| `MAP_LOAD_PLACEHOLDER` | the map load the load state starts | the front end entry loads no map (the page's map load is the map viewer's and Play's); done at once | in code, `packages/ui/src/screens/frontEndMachine.ts` |
| `CORE_STATE_PLACEHOLDER` | the round, `CCoreState` (0x4085d0) | not reached from the front end entry; a state that inits and does nothing; the round and its exit states are later sprints' and the online lane's | in code, `packages/ui/src/screens/frontEndMachine.ts` |
| `LOAD_STATE_SCRIPTS_PLACEHOLDER` | the load state's zAnim archive | the map's `run/ldzanim.zar` (D:L55819); none without a map | in code, `packages/ui/src/screens/frontEndMachine.ts` |
| `FRONT_END_ENTRY_READING` | the page's address parameter for the front end | a browser adaptation (no original); the owner's default 3, beside the map viewer: `menuflow` since 2026-10-02 (the owner: "put the menus being &menuflow param", OT.R9; it was `frontend`, not kept as an alias); declared with the front end (the page reads `FRONT_END_PARAM`) | in code, `packages/ui/src/screens/frontEndMachine.ts` |
| `FRONT_END_TEXTURES_PLACEHOLDER` (retired) | the bitmaps the entry draws | was: which bank a front-end `LIBRARIES` entry and the font library resolve to is not settled, none read. ONL-01 (research 144 §5, 2026-10-03) reads the `LIBRARIES` stem's loose `RUN/UI/<STEM4>_TXR.ZED` and a map's `FONT_TXR` (`UI_TEXTURE_BANKS_READING`, `packages/viewer/src/frontEndAssets.ts`) and the page hands them to the drawer | retired 2026-10-03 (removed from `frontEndMachine.ts`) |

## 16. Sprint 9's connecting lines (added 2026-10-02, S9-WIRE; reading, pending review)

The lines W9.R4 leaves to the controller at the merge, now that PLAT-10, PLAT-15, PLAT-16, PLAT-21 and PLAT-23 are
all on the sprint's branch. Each is held by a test; nothing here is measured on the original running.

**16.1 PLAT-16's popup in the overlay slot.** `packages/ui/src/screens/dialogParts.ts` (`DialogPartsHost`, one
`DialogParts` per build) and `packages/ui/src/popup/slotPopup.ts` (`SlotPopup`, PLAT-16's `Popup` as M's object). The
page connects them: `UiCommandHost({ node: parts.nodeCommand })`, `popups.connect(parts.makePopup)`, and two hooks the
machine gained for it -- `built` (each build, after steps 2-7's screen and before its scripts start) and `draw` (the
shell's list completed, `MenuShellHost.draw`). In the original's terms:
- **made per build** (`FUN_0027f190` D:L126907-126934, the menu's load D:L263670-263688): the factory runs at build
  step 7, after `built`, so the popup takes that dialog's `FONT` (`POPUP_FONT_READING`), the launch's valve store,
  and the names of the command's own animation (`FUN_0026ed60`, through the dialog's runtime's definition);
- **the record** is the `POPUP` node's object's handler (`FUN_002745a0` D:L121370-121385 asks the node's object
  first; vtable +0x64 `FUN_0036da20`): `nodeCommand` hands a command on `POPUP` to M's object when it is this dialog's
  node's, else declines and the table answers. The record's place is written to the node (`FUN_003157d0`,
  D:L266844-266848) and read back from it at the draw, so a script that moves `POPUP` moves the popup;
- **shown and hidden by the node alone**: `PopUpDialog` and `KillPopUp` act on the node through the slot (§6), the
  popup's own close (CROSS / TRIANGLE without keep, `FUN_0027ed90`) is written back to the node by `SlotPopup.input`,
  which is the head of the menu's input (`FUN_00368650` D:L263850-263855) for PLAT-11 to call;
- **drawn last**: the foreplane's walk (`FUN_00369170`) reaches `POPUP` after MENUFADER, so its items (the panel, the
  buttons when there is a valve, the text, research 118 §3) close the draw list, at the walk's opacity
  (`pushOpacity` from the plane; the panel alone takes it, research 118 §12.2 finding 4), and only while the node and
  the plane above it are shown. The planes are unscaled: the popup's origin is the plane's translation.
`POPUP_COMPONENT_PLACEHOLDER` is replaced (§15); a slot no page connects (the shell's unit tests) is
`POPUP_UNCONNECTED`. Held by `packages/ui/test/screens/dialogParts.test.ts` and
`packages/viewer/test/frontEndWiring.test.ts`. Still open: the UIMnLOC strings (the page's front end has no caption
tables, `FrontEndDisc.captions` null), so a record's text id draws nothing until PLAT-04's service is handed in.

**16.2 PLAT-23's sound host behind the command host.** `FrontEndSession` takes PLAT-23's cues (`sounds`, the
`UiSoundCues` that `packages/viewer/src/uiSoundHost.ts`'s `makeUiSoundHost` returns) and hands them on: the zAnim
host's `sound` (a script's `SOUND`, command 30, `FUN_002659c0` D:L112317-112510) is the cues' `sound`; the shell's
`playMetal` (PopUpDialog with a `POPUP` shown, `FUN_0027eff0` D:L126897-126900) is `popup()`; the queue's `playBack`
(`SwitchMenu PREVIOUS_SCREEN`, `FUN_0027e720` D:L126591-126598) is `back()` (research 122 §6's callers). Held by
`packages/viewer/test/frontEndWiring.test.ts`. Not connected here: the page's `mountFrontEnd` makes no cues of its own --
the page's `GameAudio` holds HUDUI only through a map's sound data (`audio.ts`, a hot file, `soundData.ts`), so a front
end opened without a map would refuse every play; loading HUDUI for the front end alone is owed to the page's audio
(PLAT-22 or the owner of `audio.ts`). *[Connected 2026-10-02, S9-WIRE's review round, without touching `audio.ts`:
`mountFrontEnd` reads the three files from the served tree (`uiSoundHost.ts`'s `pageUiSounds`: `RUN/SOUNDRDR.ZAR`,
`HUDUI.bnk` out of `RUN/SOUNDS/BNKSTORE.ZAR` by its member alone, `RUN/UI/READERC.ZAR`), gives HUDUI to a `GameAudio`
of the front end's own (`frontEndSoundData`: HUDUI and nothing of a map; the page's `gameAudio` keeps the map's set),
unlocked by the first gesture on the page, and hands the cues to the session; without the files it runs silent and
says so. Held by `packages/viewer/test/uiSoundHost.test.ts` and `frontEndWiring.test.ts` (the BACK reaching the
page's audio on the dev disc). A second `AudioContext` on a `?frontend` page that also loads a map is the cost.]*
`ActivateButton`'s SELECTION (`FUN_00366b60`) waits for the focus (PLAT-11), and
`BackgroundMPEG` / `VagStreaming`'s `INPUT_STRING` are given no context input string by the page yet.

**16.3 PLAT-08's table: every row with an entry is bound.** The table is a registry each module fills
(`UiCommandHost.setHandler`; W9.R4's second case, as §14 read): no row of `packages/ui/src/uiCommands.ts` is edited.
The rows whose host entry exists, by table index and name, and where each is bound:

| index | name | bound by |
|---|---|---|
| 12, 13, 14, 15, 18, 19 | SwitchMenu, PopUpDialog, KillPopUp, ActivateButton, EnableButton, DisableButton | `FrontEndMachine.boot` (`ScreenCommands.register`), at each launch |
| 73, 74, 85, 86, 95, 131 | ReplayMission, CloseAndSwitch, GameStatePopCommand, SetDefaultMenuScreen, AbortLoad, FlushMenuHistory | the same |
| 22, 133, 135 | PlayMPEG, PlayMPEGNoFade, BackgroundMPEG | `FrontEndSession` (`MovieCommands.entries`), PLAT-10's line for PLAT-21 |
| 126, 127, 134 | StopAllSounds, FadeAllSounds, VagStreaming | `FrontEndSession` (`UiSoundCues.entries`) when it is given the cues -- **bound here** (they were the only rows with an entry and no binding) |
| 16, 38, 81, 194 (ids 17, 38, 82, 196) | ClearGameState, GetAcctInfo, IsClanChallengeGame, DeletePatch | `UiCommandHost` itself (PLAT-08's four constant bodies) |

`SuspendMenuInput` (PLAT-11) and `GetTextInput` with the keyboard rows (PLAT-17) have no entry on this branch (neither
stream is merged). Held by `packages/viewer/test/frontEndWiring.test.ts` (each of the 18 module rows answers from its
module, none `not implemented`).

**16.4 The pushed movie covers the menu state (the gap §14 recorded).** CG's push applies, in order, the frame sync
`FUN_003b05e0`, the top state's OnCover with the push's argument, then the pushed state's Init (`FUN_002ce9e0`
D:L171928-171931, re-read for this); `PlayMPEG` pushes the movie state with argument 0 (`FUN_002cf380(0x4084c0,
0x4086f4, 0)`, research 121 §3). MS's OnCover (0x1f4630) is `FUN_00366b10` (D:L262945-262958): with a movie background
(G+0x279) that is playing (G+0x278), the player closed (`FUN_003096f0`) and G+0x278 cleared -- no ONMPEGEND. PLAT-21's
`MoviePlayerHost` stands in for that push, so the fix is where the push is applied: the host's new `onCover` is called
when the queued push applies, before the movie state's init, and the page passes the push's two steps
(`clock.frameSync()`, then the top state's `onCover(0)`). Before it, a dialog's `BACKGROUND TYPE MPEG` stayed `PLAYING`
under the pushed movie (one decoder for both, research 121); now it is closed for the movie and restarted at the pop
(`background.statePop`, OnPop's `FUN_00366a00(G, 0)`). Held by `packages/viewer/test/moviePlayerHost.test.ts` (the
order) and `packages/viewer/test/frontEndWiring.test.ts` (the background closed and restarted).
**Found, not changed (PLAT-21's timing):** CG applies a request on a frame whose top is then not ticked (R115.11), so
in the original the movie state's first tick comes the frame after the push is applied; `MoviePlayerHost.frame`
applies the push and ticks the movie state in the same frame -- one frame earlier than CG. Owed to PLAT-21's owner
(a test of the frame on which the first picture is presented, against `FUN_002ce9e0`'s order). *[Fixed 2026-10-02, S9-WIRE's
review round: `MoviePlayerHost.frame` applies a queued push on a frame that ticks nothing (D:L171884-171887: the top's
tick only with the queue empty), and the movie state's pop likewise -- its tick asks for it (`FUN_002cf2f0`, 0x1ed160,
the player's `onPop`) and the next frame applies it (the exit, then the menu state's OnPop, D:L171918-171925) with no
tick. The first picture now comes the frame after the push, the menu's first tick the frame after the pop. Held by
`packages/viewer/test/moviePlayerHost.test.ts` ("CG applies the push and the pop each on a frame that ticks
nothing").]*

**16.5 PLAT-15's widgets where the entry builds and draws a dialog.** PLAT-10's entry drew a dialog through PLAT-14's
compositor alone (PLAT-15 was not in its base), so every control and stateful object came out as a `widget` item that
nothing filled. Now `DialogParts` makes PLAT-15's `WidgetSet` at each build beside the node tree
(`CGameMenu_LoadFromDesign`, D:L263627-263658; before the scripts start, so ONSTART's commands find their objects),
over the launch's valves, the build's faces and captions, and the names of the command's animation. It is reached as
the original reaches its objects:
- **A7** (`FUN_003654c0` D:L262351-262356): the machine's `widgetsTick` ticks the set with the clamped step;
- **a node command** (`FUN_002745a0` D:L121370-121385): a widget's or a plain TEXT / IMAGE / WRAPPEDTEXT object's
  command goes to the set by its op before the table (`POPUP`'s to the popup);
- **record types 7 / 8** (D:L262291-262305): `EnableButton` / `DisableButton` reach the named control's +0x4c
  (`setEnabled`, the button family's; `FUN_00377380` D:L271950-271962);
- **the widget host**: an animation of the dialog's scripts started with its argument (`ScreenScripts.startBinding`),
  found (`runtime.find`), SELECTION / TELETYPE to PLAT-23's cues (`selection()`, `teletype()`, research 122 §6), the
  screen's event records fired (`FUN_00367810`, `ScreenScripts.event`).
**What a dialog's draw list now holds**, in order: the clear; the movie layer when the dialog has a movie background;
the backplane's walk -- the background image, then each control and object in the design's order, every `widget` item
replaced in its place by its widget's quads and glyphs (`WidgetSet.draw`; a MAPCONTROL, MENU-16's, keeps its item and
is reported undrawn); the 3D pass marker; the foreplane's walk -- MENUFADER; then the popup's panel, buttons and text
when `POPUP` shows. On the dev disc (`packages/viewer/test/frontEndWiring.test.ts`) every one of the 114 READERC and
READERX dialogs runs 30 frames through the page's session with its widgets and PLAT-16's popup; the only `widget`
items left are MAPCONTROL's (in one run: 83 dialogs built at least one widget, 33 MAPCONTROL items left in the last
frames; since MENU-01a's binding lookup fix, research 138 R138.8, 88 dialogs and no item left: the map dialogs' ONSTART
now runs and hides the three before the frame). Still not drawn: every bitmap and glyph's texture (`FRONT_END_TEXTURES_PLACEHOLDER` stands), so the scored
items of §14 stay **owed to PLAT-30** (the controller's wave-7 run, once the entry draws the dialog's bitmaps), their
manifest rows as §14 lists them. Not connected here: `ActivateButton` (record type 6, `FUN_00366b60`) and the focus
tick (A8) are PLAT-11's.
