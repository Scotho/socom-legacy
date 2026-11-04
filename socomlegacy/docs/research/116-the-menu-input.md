# 116 -- The menu input: the pad's button states, the dispatch order, focus movement, the held repeat, SuspendMenuInput, the stick, PADHOG and NOSELECT (web sprint 9, PLAT-11)

Written 2026-10-02 for web sprint 9 (plan `../plans/2026-10-02-web-sprint-9-screens-widgets.md`, PLAT-11's row and
owner default 1; the task's block is `../roadmap/01-platform.md` "PLAT-11", its "What the original does" and
"Unknowns"). Read-only research: no code and no test land with this note; the PLAT-11 implementer transcribes the
behaviour tables below into unit tests, each naming its function and lines. Sources: the retail decompilation
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its line; every address **retail**), the
retail ELF on the disc (`game/disc/socom2_game.elf`: the strings the decompilation names by address, three vtables,
two data words, and `CMenuState_Tick` 0x1f4640-0x1f485c, which the decompilation does not hold and which was read in
the disassembly), the names in `recomp/socom2_names.csv`, PC research 08 (the libpad2 HLE) and the PC runtime's
button-id table (`third_party/ps2recomp/ps2xRuntime/src/lib/socom2_host_input.h:14-18`, which agrees with the reader's
use below), and the disc's `RUN/UI/READERC.ZAR`, `READERX.ZAR` and the three zAnim archives read with the repository's
readers (`Zar`, `parseRdr`, `parseAnimSets`, `tools/dialogInventory.ts` `animFacts`, `tools/dump-dialogs.ts --dialog`)
by a probe that is in no tree (names and counts only; no game bytes in git). reCOM (SOCOM 1) was not needed: every
rule here is read from SOCOM II's own code.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R116.1 | **The pad's button states.** The per-frame reader `FUN_002da930` turns each of 16 buttons into a state byte (pad +1+slot): **0 up, 1 pressed this frame, 2 held, 3 released this frame**. A held button is 1 for exactly one frame, then 2. The game's slot order is START 0, SELECT 1, RIGHT 2, LEFT 3, UP 4, DOWN 5, TRIANGLE 6, CIRCLE 7, SQUARE 8, CROSS 9, R1 10, R2 11, L1 12, L2 13, R3 14, L3 15 | `FUN_002d9ff0` D:L179128-179186; D:L179819-179862 | §1 |
| R116.2 | **The BUTTON vocabulary** (`GetButton` `FUN_0036a5d0`): START, SELECT, TRIANGLE, CROSS, SQUARE, CIRCLE, UP, DOWN, LEFT, RIGHT, TRIGGER_L1, TRIGGER_L2, TRIGGER_R1, TRIGGER_R2 -- each the slot of R116.1, matched with `strcmp`. **Any other word is 0, which is START**: `BUTTON_EXECUTE` (6 bindings, `Common_Brief_Btn.rdr`), `L1`/`L2`/`R1`/`R2` (2 each, `dlgArtGal2`, `dlgMakeMusicMovie`) and `NONE` (42, inside CHECKBOX `ONCHECK`, where the button is not read) | D:L264984-265079 | §2 |
| R116.3 | **A binding's STATE**: `UP` 0, `FALLING` 1, `DOWN` 2, `RISING` 3, matched against R116.1's byte; absent or any other word is **1 (FALLING = the press)**. So `STATE DOWN` fires on **every** input frame the button is held. On the disc 1,060 BUTTON bindings (1,050 with an `ANIMATION`, 10 without): 861 without STATE, 196 `DOWN`, 1 `FALLING`, 2 `RISING` | `FUN_00365d50` D:L262757-262784 | §2 |
| R116.4 | **The dispatch order in a frame** (`FUN_00368650`): the stick's arming; a visible POPUP takes the pad; an open soft keyboard takes it; the **focused control** gets it; then the **screen's BUTTON bindings** (the first match fires, one per frame); then the **default navigation**; then one USB-keyboard key (Enter -> `USBKBD_ENTER`). Each of the first four `return`s when it consumes the pad | D:L263804-264248 | §3 |
| R116.5 | **Default focus movement** (a control that binds no UP/DOWN, or binds them and does not consume them): **DOWN** pressed (state 1) or the stick flicked down -> the **next** control of the screen's `CONTROLS` list (file order), wrapping; else **UP** pressed or flicked up -> the **previous**, wrapping. Disabled controls are skipped; LEFT/RIGHT never move focus by default; there is **no neighbour field** -- "explicit" navigation is a control's own `BUTTON UP/DOWN/LEFT/RIGHT` binding running a script (`dlgMenu`'s `OnMenuBtnDown`) | `FUN_003670d0` D:L263102-263176, `FUN_00366d70` D:L263021-263097; D:L264124-264241 | §4 |
| R116.6 | **No held repeat in the framework.** The default navigation and every FALLING binding act once per press. The held repeat lives in two widgets: **LISTBOX** UP/DOWN and **SLIDERBAR** LEFT/RIGHT -- the press steps at once, and after the button has been held **more than 0.4 s** it steps on **every input tick** while held (no further spacing). The timer is seconds, advanced by the control's tick with `min(dt, 0.05)` | list `FUN_003745e0` D:L270413-270438, its tick D:L270731; slider `FUN_00371d00` D:L269072-269177, its tick D:L269191 | §5 |
| R116.7 | **The main menu does not repeat.** `dlgMenu`'s buttons bind DOWN/UP (and RIGHT/LEFT) with no STATE (FALLING) to `OnMenuBtnDown`/`OnMenuBtnUp`, each `SuspendMenuInput(0.15)` and `ActivateMenuBtns`: holding DOWN 2 s moves the roller **once**, on the press frame. PLAT-11's 60-fps DOWN burst should see one focus change | §2's probe; `tools/dump-dialogs.ts --dialog dlgMenu.rdr` | §5.3 |
| R116.8 | **SuspendMenuInput(s)** (`FUN_00277220`): parses its argument as a number and **overwrites** the menu's suspend timer (`CGameMenu` +0x900, f32). While it is above 0 the frame's dispatch is skipped and the timer drops by the **raw** dt; it is not a maximum, and `SuspendMenuInput(0)` ends a suspension. 153 calls on the disc, 0 to 60 s | D:L122805-122823, `FUN_001f3bb0` D:L54349-54358; D:L262264-262269 | §6 |
| R116.9 | **A press during a suspension is lost** (state 1 lasts one frame and the reader runs every frame), but a `STATE DOWN` binding fires on the first unsuspended frame if the button is still held. The stick's arming is not updated while suspended | D:L262264-262269 with R116.1 | §6 |
| R116.10 | **The analog stick moves the focus**: the left stick (after the pad's own dead zone and curve; the right stick when the pad's swap flag +0x20c is set) is classified **edge-triggered with hysteresis**: it fires one direction when an axis passes **0.6** and re-arms when both axes are back within **0.2**. The flick counts as the d-pad press for FALLING bindings (UP/DOWN/LEFT/RIGHT), for the default navigation and for a list's UP/DOWN; not for `STATE DOWN` bindings, not for sliders or radio strips, and it never repeats | D:L263829-263849; `FUN_0036a060` D:L264743-264799; D:L264091-264105; D:L271900-271915 | §7 |
| R116.11 | **PADHOG** (list box, spec +0x37 -> list +0xea): the list consumes LEFT/RIGHT presses (and a flick up or down, unreachable after the steps) and, at its first or last item, UP/DOWN -- without it those fall through to the screen bindings and the default navigation (an UP at the top leaves the list). **NOSELECT** (+0x36 -> +0xe8) only hides the selection highlight (`Highlight_on`/`Highlight_off` clear and set it); the selection still moves. **AUTOSCROLL** (+0x35 -> +0xe9) selects the last item when items are added | D:L275975-275980, D:L271097-271099; D:L270135, D:L270303, D:L270423-270430; D:L270014; D:L269484-269491; D:L269570, D:L270789 | §8 |
| R116.12 | **ACCEL is not a menu-repeat acceleration**: it is the MAPCONTROL's `PAN` command's acceleration (`DIRECTION`, `SPEED`, `ACCEL`, `LIMIT`; the step per tick is `min(LIMIT*dt, ACCEL*held + SPEED*dt)`), driven by the maps' `STATE DOWN` bindings | `FUN_0036c760` D:L266253-266289; `FUN_0036ca30` D:L266326-266351 | §9 |
| R116.13 | **CInput::Flush at the state's init** (`FUN_002d9e00` -> `FUN_002dba60`, from `FUN_001f4860` D:L54799): zeroes every state, then reads the pad once with dt 1/30, so a button held across the state change becomes 2 without a visible 1 -- it is not a new press | D:L179043-179050, D:L179891-179936 | §1.3 |
| R116.14 | **The menu's tick rate is 30 Hz, not 60** (a reading): the frame cap `DAT_003e1400` is 30 in the ELF and a movie start sets 30; only the game state lifts it. dt is measured (timer 0's H-blank count). The repeat's 0.4 s is then **12 or 13 ticks** and `SuspendMenuInput(0.15)` 5 ticks -- the frame-index acceptance depends on it | `FUN_003aff30` D:L304747, D:L304762-304764; `FUN_003b17d0` D:L305431-305441; D:L207813 | §10 |
| R116.15 | **Touch and the PC keyboard have no original**; the USB keyboard has two: Enter or Keypad Enter raises the screen event `USBKBD_ENTER` (one key per frame, after the default navigation), and the soft keyboard types (PLAT-17's) | `FUN_002dbd90` D:L180055-180092; D:L264243-264246 | §11 |
| R116.16 | **A matching binding with no animation still consumes.** The screen (step 4) and a BUTTON control return 1 on a match whether or not `FUN_0026a250` finds the animation. The disc holds 10 such records: `BUTTON UP` and `BUTTON DOWN` with no `ANIMATION` on the BUTTON control `playerinfo_ctl_desc` of `dlgFriendList`, `dlgLadderLobby`, `dlgManageRoster`, `dlgManageRosterLeader` and `dlgMPBriefingRoom`. When it has the focus and is enabled, it **holds the focus**: UP and DOWN are consumed and the default navigation never runs. A reader that drops records with no `ANIMATION` (`UiBinding` today) loses this. A binding that names an animation no set defines (`NULL`, `NONE`, ...; 51 records, §2.3) behaves the same at the screen and at a BUTTON control | `FUN_00377040` D:L271915-271925; D:L263865-264123 | §2.1, §5.1 |
| R116.17 | **A list matches its EVENT bindings against the pad.** The LISTBOX keeps its EVENT and BUTTON bindings in one array (+0x420). Its input loop never reads the kind byte: it tests only `code != 0` and `state == pad[code+1]`, and an EVENT keeps the default state 1. So `ONACTIVATE` (code 2) fires on a **RIGHT press** (pad+3) and consumes it. 19 list `ONACTIVATE` bindings on 14 lists. On 13 of them RIGHT runs the list's first `ONACTIVATE` script. On `AVAILABLE_MISSIONS` its own `BUTTON RIGHT` comes first and runs instead. A list match whose animation is missing returns 0 at once, and the UP/DOWN steps are skipped: `dlgClanLadderLobby`'s `LadderList` binds UP and DOWN (FALLING and `STATE DOWN`) to the undefined `NONE`, so the d-pad never steps it, nor repeats; the press goes on to the default navigation, and only the stick steps the list | `FUN_003745e0` D:L270374-270411; D:L271190-271197; D:L278453-278458 | §5.2 |

**The proven level** is OPT-19's: a PCSX2 focus walk per press on `dlgOptions_Menu` and a 60-fps capture holding
DOWN. Nothing here is proven; everything is the reading level (the decompilation, the ELF, the disc).

## 1. The pad reader and the button states

### 1.1 Where the pad is read in the frame

`CMenuState_Tick` (0x1f4640; read in the disassembly, 0x1f4640-0x1f485c -- the decompilation skips it) calls, in this
order, with `this` the state (0x408538) and dt in `$f12`:

| # | call | what |
|---|---|---|
| 1 | `FUN_00366940(menu)` | the background movie's service (D:L262866-262900) |
| 2 | `FUN_002d9e40(dt)` | the pad: `FUN_002da930(dt, pad)` when the pad object `DAT_0044f108` exists (D:L179055-179065) |
| 3 | `FUN_00341a60(0, dt)`, `FUN_00341250(dt)` | not input |
| 4 | `FUN_003654c0(menu, dt)` | the UI tick: the suspension, **the input dispatch**, the command queue, the scripts, the controls' ticks (§3, §6) |
| 5 | the message queue at 0x437690, render, `FUN_003aff30` | the frame's end: the cap and the next dt (§10) |

`menu` is the state's +8, the `CGameMenu` (0x914 bytes; ctor `FUN_00369b60` D:L264595-264680, the menu-state's
subclass vtable 0x405040 at +0x910 set by `FUN_001f4580` D:L54752-54763).

### 1.2 The state machine (`FUN_002d9ff0` D:L179128-179186)

Called once per slot per frame with the slot's digital bit and its pressure. The state byte is pad +1+slot.

| state held | bit set (pressed) | bit clear |
|---|---|---|
| 0 up | **1** | 0 |
| 1 pressed | **2** | **3** |
| 2 held | 2 | 3 |
| 3 released | **1** (a new press the frame after a release) | 0 |
| anything else | 2 | 0 |

The same call writes the pressure at pad +0x14+4*slot as the raw byte times 1/255 (`DAT_003df268` = 0.0039215689;
slots 0, 1, 14, 15 pass 0) and a double-press timer at pad +0x74+4*slot: on a 1, a timer above 0 becomes -2.0 (a
double press, read and reset to -3.0 by `FUN_002da1c0` D:L179217-179228), else 0.25 s; otherwise a positive timer drops
by the reader's dt and becomes -1.0 below 0. **No menu path reads the pressure or the double-press timer.**

The slots (D:L179819-179862): the reader asks libpad2's `scePad2GetButtonInfo` for ids 3, 0, 5, 7, 4, 6, 0xc, 0xd, 0xf,
0xe, 0xb, 9, 0xa, 8, 2, 1 for slots 0-15. With libpad2's ids (`socom2_host_input.h:15-16`: 0 SELECT, 1 L3, 2 R3, 3
START, 4 UP, 5 RIGHT, 6 DOWN, 7 LEFT, 8 L2, 9 R2, 10 L1, 11 R1, 12 TRIANGLE, 13 CIRCLE, 14 CROSS, 15 SQUARE) that is
R116.1's order. `GetButton`'s numbers (§2) are the same slots, which is the cross-check.

A pad not connected (`scePad2GetState` != 1) zeroes the states, sticks and buffers (D:L179531-179546).

### 1.3 The flush at the state's init (`FUN_002dba60` D:L179891-179936)

`CMenuState`'s init (`FUN_001f4860`, D:L54778) calls `FUN_002d9e00` (D:L54799), which flushes the pad: connection
state, the 16 states (+1..+0x10), the 16 pressures and the sticks to 0, then one read with dt 0x3d088889 (1/30), then
every double-press timer to -3.0. A button held through the switch is 1 during the flush's own read and 2 on the
state's first frame: the new screen never sees it pressed.

## 2. The binding records and their vocabulary

### 2.1 The record (`FUN_00365d50` D:L262463-262795)

A binding is 0x10 bytes; the parse fills it from one `ANIMATIONS` entry (or a CHECKBOX's `ONCHECK`/`ONUNCHECK`,
`FUN_0037e2a0` D:L275636-275644):

| offset | width | field | from |
|---|---|---|---|
| +0x0 | u8 | kind: 0 BUTTON, 1 EVENT | `BUTTON` present -> 0; else `EVENT` present -> 1 |
| +0x4 | u32 | the animation (a pooled string) | `ANIMATION` |
| +0x8 | u32 | the argument, or 0 | `ARGUMENT` |
| +0xc | u8 | state (BUTTON only) | `STATE`: `UP` 0, `FALLING` 1, `DOWN` 2, `RISING` 3, else 1 (D:L262762-262784) |
| +0xd | u8 | button slot (BUTTON) or event code (EVENT) | `GetButton` (§2.2) / the event table D:L262477-262746 (ONSTART 0 ... `ONFOCUS` 0x2b, `USBKBD_ENTER` 0x2c, `SLIDER_MOVED` 0x28, `ONSCROLL` 0x29, `ONSCROLL_END` 0x2a; an unknown event word 0) |

**The defaults** every element starts with: kind 0, animation 0, argument 0, state 1, button **0x10**. The element
ctor 0x369f70 writes them (read in the disassembly, 0x369f70-0x369f90). The list spec's growing array writes the same
five values into its new element (`FUN_003838b0` D:L278453-278458). When neither `BUTTON` nor `EVENT` is present the
parse writes nothing, not even the animation. An `EVENT` record writes the kind, the code, the animation and the
argument, but never +0xc, so **an EVENT binding's state stays 1** (D:L262746-262755). That matters in a list (§5.2).

**A BUTTON record with no `ANIMATION`** is still a binding: kind 0, its slot, its state, and animation 0
(D:L262758-262792 write the animation only when the key is there). Where a handler fires on a match whatever
`FUN_0026a250` returns, such a record **consumes the press and runs nothing**. The screen's step 4 and the BUTTON
control (§5.1, D:L271915-271925) do this. The list returns 0 instead (§5.2). PLAT-05's readers drop these records:
`UiBinding` (`packages/scene/src/uiLayout.ts:86-91`) and `tools/dialogInventory.ts` `bindingsOf` (lines 98-103) keep
only bindings that have an `ANIMATION`. PLAT-11 must keep them (§2.3, the 10 on the disc). The screen holds at most **30** (`CGameMenu` +0x6f8, count +0x8d8; D:L264646); a BUTTON control at most
30 (+0x250, count +0x430); a LISTBOX 30 (+0x420, count +0x600; D:L275852).

### 2.2 `GetButton` (`FUN_0036a5d0` D:L264984-265079) -- the words a control can bind

| word (`strcmp`, case-sensitive) | slot | word | slot |
|---|---|---|---|
| `START` | 0 | `UP` | 4 |
| `SELECT` | 1 | `DOWN` | 5 |
| `TRIANGLE` | 6 | `LEFT` | 3 |
| `CROSS` | 9 | `RIGHT` | 2 |
| `SQUARE` | 8 | `TRIGGER_L1` | 12 |
| `CIRCLE` | 7 | `TRIGGER_L2` | 13 |
| (any other word, or none) | **0 = START** | `TRIGGER_R1` | 10 |
| | | `TRIGGER_R2` | 11 |

L3 and R3 (slots 15, 14) have no word: no binding can name them.

### 2.3 What the disc binds (all of READERC and READERX; the probe of §0's sources)

1,060 BUTTON bindings, 816 EVENT and 12 `TRIGGER`. Of the BUTTON bindings, 1,050 have an `ANIMATION` (958 of them
without `ARGUMENT`, 92 with), 10 have none, and 199 have a `STATE`:

| BUTTON word | screen | control | | STATE | count |
|---|---|---|---|---|---|
| CROSS | 19 | 312 | | (none: FALLING) | 861 |
| TRIANGLE | 82 | 56 | | `DOWN` (held) | 196 |
| DOWN | 15 | 74 (5 with no `ANIMATION`) | | `RISING` | 2 (`dlgGameLobby` SELECT `hide_game_details`, CIRCLE `do_team_button_up`) |
| UP | 15 | 73 (5 with no `ANIMATION`) | | `FALLING` | 1 (`dlgGameLobby` CIRCLE) |
| LEFT, RIGHT | 11 each | 71 each | | | |
| SQUARE | 36 | 40 | | | |
| NONE | 0 | 42 (CHECKBOX `ONCHECK`) | | | |
| TRIGGER_L1, TRIGGER_L2 | 35 each | 6 each | | | |
| CIRCLE | 8 | 14 | | | |
| TRIGGER_R1 | 2 | 5 | | | |
| BUTTON_EXECUTE | 0 | 6 | | | |
| START | 5 | 0 | | | |
| SELECT | 2 | 0 | | | |
| L1, L2, R1, R2 | 2 each | 0 | | | |

The `STATE DOWN` bindings are continuous actions, never focus: map panning (`dlg_Map*` MAPCONTROLs, 4 directions x 3
maps x each map dialog), screen nudging (`dlgScreenAdjust`), text scrolling (`TRIGGER_L1`/`L2` on `dlgWorldOfSOCOM`,
`dlgGameLobby`, `dlgMPBriefingRoom`, `dlgManageRosterLeader`, `dlgNetServerSelect`, the ladder lists; UP/DOWN on
`dlgUsagePolicy`). The UP/DOWN bindings of `dlgClanLadderLobby` are **not** scrolling. They are four bindings on its
LISTBOX `LadderList`: `BUTTON UP` and `BUTTON DOWN`, once with `STATE DOWN` and once with none, all with `ANIMATION
NONE`, which no set defines (`dump-dialogs --dialog dlgClanLadderLobby.rdr`: "(no set defines it)"). By §5.2 row 3
they **stop the d-pad from stepping that list** (`LadderList`, §5.2).

The roadmap's tally (CROSS 330, TRIANGLE 137, DOWN 89, UP 88, ...) matches these counts for every word except CROSS
and TRIANGLE, which it gives one lower each. These counts take every BUTTON record of both archives, screen and
control, read by field, whether or not it has an `ANIMATION`. Where the roadmap's two missing records went was not
traced.

**The 10 BUTTON records with no `ANIMATION`** are a `BUTTON UP` and a `BUTTON DOWN` (no other key) on the BUTTON
control `playerinfo_ctl_desc` of `dlgFriendList`, `dlgLadderLobby`, `dlgManageRoster`, `dlgManageRosterLeader` and
`dlgMPBriefingRoom` (all READERC). By §2.1 and §5.1, while that control is focused and enabled an UP or DOWN press,
or a flick of the stick, is consumed and runs nothing. The focus stays put. On `dlgFriendList` the control is the
player-info popup's (`playerinfo_activate` enables and activates it). The two empty bindings keep the focus on the
popup, which is left by its own TRIANGLE (`playerinfo_deactivate`). This is a reading (OPT-19 item 9).

**The BUTTON records that name an animation no set defines** act the same way, since `FUN_0026a250` returns 0 for
both. A probe over every layout of both archives, against every animation of the three zAnim archives, finds 51 (a
lower bound: it does not limit each dialog to its own `SCRIPT_LIBRARY`):

- `NULL`: the four `dlg_areaop_*` (`albania`, `Algeria`, `brazil`, `russia`), each with the screen's UP/DOWN and
  LEFT/RIGHT on its three `alaska_mission*_button`s (32); `dlgControllerPresets` and `dlgControllerPresetsNewGame`,
  the screen's UP/DOWN (4); `dlg_WeapUnlock` `ActWeaponBtn` UP/DOWN (2); `dlg_CharUnlock` `albania` CROSS (1).
- `NONE` or `none`: `dlgWorldOfSOCOM` `popup_motd_button`, LEFT/RIGHT and TRIGGER_L1/L2 twice each (6);
  `dlgClanLadderLobby` `LadderList`, UP/DOWN twice each (4, the one LISTBOX: §5.2).
- A name that is in no set: `dlgLoad` screen TRIANGLE `exit_load_screen`, `dlgNetUnlockableExtras` screen SQUARE
  `BackToSelectedAreaOp` (2).

At the screen (§3 step 4) and at a BUTTON control (§5.1) such a match consumes the press and runs nothing: a screen
UP/DOWN bound to `NULL` stops the default navigation whenever the focused control passes UP/DOWN on. Each
owner's control type was not checked one by one, so this list is a reading. A list returns 0 instead (§5.2).

**Consequences of §2.2 on the disc** (each a fact of the code, each owed a PCSX2 check, §13):

- `BUTTON_EXECUTE` on the six briefing buttons of `Common_Brief_Btn.rdr` is START: the focused briefing button runs
  its script on a START press (CROSS is not bound there).
- `L1`/`R1` on `dlgArtGal2`/`dlgMakeMusicMovie` (`ExtrasButtonActive`) are START as well, and `L2`/`R2` the same.
- The 12 `TRIGGER L1/L2/R1/R2` bindings (`dlgAttractCinematic`, `dlgPlayTutMovies`, `dlgSecondCinematic`,
  `goto_menu`) parse to the defaults of §2.1 -- button 0x10 and **no animation** -- so they run nothing (and match
  only if pad +0x11 is 1, `TRIGGER_BINDING_READING`): the
  cinematics are left by their BUTTON bindings and `ONMPEGEND`.
- `NONE` sits only in `ONCHECK`, whose handler reads only the animation and argument (§5.4).

## 3. The dispatch (`FUN_00368650` D:L263804-264248)

Called from the UI tick when the menu is not suspended and no screen switch is in progress (§6). `pad` is
`DAT_0044f108`; `menu` the `CGameMenu`.

| step | condition | effect | returns? |
|---|---|---|---|
| 0 | always | the stick's arming flag and last values (§7) | no |
| 1 | the POPUP node (`menu`+0xcc, made by `FUN_00367950` D:L263686) is shown (its +0x5c bit 0) | the popup dialog (`FUN_0027f190(FUN_00274930())`, vtable 0x4073a0, slot +0x44 = 0x370990) gets the pad | yes (D:L263850-263855) |
| 2 | the menu's class slot +0x14 (0x1f5630: always 1 for the menu state) and the soft keyboard is open (`DAT_0049ecd0`) | `FUN_0038dc00` (D:L284170-284197) routes the pad to the keyboard (PLAT-17's) | yes if open (D:L263856-263859) |
| 3 | always | the control list's root (`menu`+0x290, vtable at +0x29c, slot +0x44 = `FUN_00377040`) with the focus index `menu`+0x6d0: only the **focused** control gets the pad (§5) | yes if it consumed (D:L263860-263864) |
| 4 | for each screen binding in file order: kind 0 and (its state == the button's state byte, **or** its state is 1 and the stick flicked that way: UP<-up, DOWN<-down, LEFT<-left, RIGHT<-right) | the **first** match runs its animation (`FUN_0026a250` on the script library 0x414bb0; with an argument `FUN_00272bb0(s,1,8,arg,0)`, else `FUN_002734b0(s,0)`); a missing animation still returns | yes (D:L263865-264123) |
| 5 | DOWN's byte == 1 or the stick flicked down | the next control (`FUN_003670d0(menu, 1)`, §4) | no |
|   | else UP's byte == 1 or the stick flicked up | the previous control (`FUN_00366d70(menu, 1)`) | no (D:L264124-264241) |
| 6 | always (when reached) | pop **one** USB-keyboard key (`FUN_002dbd90`); HID 0x28 (Enter) or 0x58 (Keypad Enter) fires every screen EVENT binding of `USBKBD_ENTER` (0x2c, `FUN_00367810` D:L263357-263395) | -- (D:L264243-264246) |

So **the focused control is asked before the dialog**: a CROSS bound both on the focused button and on the screen
runs only the button's. A screen binding to DOWN (state 1) consumes the press and the default navigation does not
run; one to DOWN with `STATE DOWN` consumes every held frame. Two screen bindings that match in one frame: only the
first in file order fires. An EVENT fires **every** matching screen binding (`FUN_00367810`).

## 4. Focus movement

### 4.1 The focus ring

`FUN_00367950` (`CGameMenu_LoadFromDesign`, D:L263400-263775) appends each `CONTROLS` entry in **file order** to the
list at `menu`+0x290 (count +0x290, sentinel +0x294, first +0x298; D:L263628-263651), each control's own sub-objects
under it; `OBJECTS` go to a second list (+0x6d4) that input never sees. The focus is an index, `menu`+0x6d0 (int).

**At load** (D:L263735-263745, after the screen's `ONSTART` events at D:L263733): index 0; if the first control is
enabled it is activated (vtable +0x50), else `FUN_003670d0(menu, 0)` steps forward without a sound. `ActivateButton`
(the command queue's type 6, `FUN_00366b60` D:L262962-263016) later moves the index to a named control.

**Enabled** is the control's +0x14 bit 7 (slot +0x48 = 0x1fe270, read in the disassembly; set by slot +0x4c, e.g.
`FUN_00377380` D:L271950-271962; the queue's types 7 and 8 enable and disable, D:L262291-262316).

> Extended 2026-10-03 (FOCUS-RING, §17): the bit a class is **built with** decides the ring's stops. An IMAGE, a
> PROGRESSBAR and every text class are built with it clear, so the load's "first control enabled" test passes them over
> and the focus starts on the first button, list or map control of the file order.

### 4.2 Next and previous (`FUN_003670d0` D:L263102-263176, `FUN_00366d70` D:L263021-263097)

| step | next (DOWN) | previous (UP) |
|---|---|---|
| 1 | nothing when the list is empty | the same |
| 2 | deactivate the focused control (vtable +0x54) | the same |
| 3 | index = (index + 1) mod count | index - 1; below 0 -> count - 1 |
| 4 | if the new control is enabled: activate it (+0x50) when the index changed, and when called with sound play `SELECTION` (§4.3) | the same |
| 5 | if not: if **any** control of the list is enabled, step again (without the sound) and, when the index ended away from where this step began, play `SELECTION`; if none is, stop -- the index rests on a disabled control and nothing is active | the same |

Activation fires the control's own `EVENT ONACTIVATE` bindings (event code 2; the button's slot +0x50 = 0x3766a0, read
in the disassembly at 0x376710-0x3767a4) -- the "focus changed" script hook. `ONFOCUS` (0x2b) is the list box's item
event (§8), not the control's.

An edge read as it stands: with one control, a DOWN deactivates it and step 4 does not re-activate it (the index did
not change) -- `SINGLE_CONTROL_FOCUS_READING`.

### 4.3 The sound

`DAT_00408564` is the `SELECTION` sound of `uisounds.rdr`'s `SOUNDS` (`FUN_001f53d0` D:L55195-55216; keys `TELETYPE`,
`BACK`, `SELECTION`), played with (1, 0, 0xff) by the default navigation (D:L263082-263085) and, through
`FUN_0036a2c0` (D:L264853-264862), by a list's step, a slider's step and a radio strip's change. PLAT-23 owns the
bank.

### 4.4 Explicit neighbours

The original has **no** neighbour fields: no control record names the control above or below it. A screen that wants
another order binds the directions itself -- `dlgMenu`'s six buttons bind UP/LEFT to `OnMenuBtnUp` and DOWN/RIGHT to
`OnMenuBtnDown`, scripts that suspend the input 0.15 s and pick the next button by valves (`ActivateMenuBtns`:
`ActivateButton`/`EnableButton`/`DisableButton`). Because the focused control is asked first (§3), its UP/DOWN
binding consumes the press and the default navigation never runs. `dlgOptions_Menu`'s buttons bind only CROSS, so its
UP/DOWN reach §4.2: AudioOpBtn, VideoOpBtn, ControlOpBtn, ControlPresetBtn, HDDOnOff (a RADIOSTRIP, skipped when its
`ONSTART` leaves it disabled), SaveAndLeaveBtn, then AudioOpBtn again -- each activation running its
`ONACTIVATE` (the help line, locs 705-709).

**For PLAT-05's records** (`packages/scene/src/uiLayout.ts` today): a binding is `UiBinding { event, button,
animation }` -- it has no `state` and no `argument`, and it drops a record with no `ANIMATION` (`uiLayout.ts:86-91`;
`tools/dialogInventory.ts` `bindingsOf` does the same at lines 98-103). PLAT-11 needs all three (§2.1): `state` as
the four words with FALLING the default, `argument`, and the animation-less records, which consume (R116.16). The
neighbour fields the brief asks about do not exist to carry.

## 5. The controls' own input (the focused control's slot +0x44)

### 5.1 BUTTON (`FUN_00377040` D:L271857-271945; vtable 0x407790)

| condition | effect |
|---|---|
| not enabled | not consumed |
| a group (it has sub-objects) | passes the pad to the sub-object at the index given (the root: the focus index; a nested group: 0) and returns what it returns |
| a leaf: CROSS's byte == 1 | the pressed look (slot +0x74), then the bindings |
| a leaf: each own binding in order, kind not 1 (EVENT): state == the byte, or state 1 and the stick flicked UP/DOWN/LEFT/RIGHT as §3 step 4 | the first match runs its animation if `FUN_0026a250` finds it; **consumed either way**: a binding with no `ANIMATION` consumes and runs nothing (D:L271915-271925; §2.1, §2.3's 10 records) |
| none matched | not consumed |

### 5.2 LISTBOX (`FUN_003745e0` D:L270309-270443; vtable 0x407670)

State: items count +0xc0, selected +0x194, hold timer +0x180 (f32 seconds; the tick adds `min(dt, 0.05)` at
D:L270731), PADHOG +0xea.

| order | condition | effect | consumed |
|---|---|---|---|
| 1 | not enabled, or no items | -- | no |
| 2 | the selected item's own button (item +0xd < 0x10) is pressed (byte 1) and the item has an action (+0x24) | run the item's script (its argument, else the item's value); timer = 0; the list's slot +0x84 | yes |
| 3 | each list binding in file order, **BUTTON and EVENT alike** (the kind at +0x420 is never read): its slot or code at +0x42d != 0 (so a list's START or `ONSTART` binding never fires), and its state at +0x42c == the byte at pad + that slot or code + 1. No stick | the first match: timer = 0; if `FUN_0026a250` finds its animation, it runs (argument: the binding's, else the item's) and the list's slot +0x84 runs when the item has an action | **yes**; but a match whose animation is missing returns **0** at once, and rows 4-8 are not reached (D:L270374-270411) |
| 4 | UP's byte == 1, or the stick flicked up (`FUN_0036a7c0` D:L265082-265143) | timer = 0; step up (`FUN_00374010`) | the step's result |
| 5 | UP's byte == 2 and timer **> 0.4** | step up (the timer is **not** reset) | the step's result |
| 6 | DOWN's byte == 1, or the stick flicked down (`FUN_0036a970` D:L265146-265207) | timer = 0; step down (`FUN_003742f0`) | the step's result |
| 7 | DOWN's byte == 2 and timer > 0.4 | step down | the step's result |
| 8 | PADHOG set and (LEFT or RIGHT byte == 1, or the stick flicked down or up: `FUN_0036a970`, `FUN_0036a7c0`, D:L270423-270430) | -- | yes. The flicks cannot get here, because rows 4 and 6 have already taken them; they are listed so the table is complete |
| 9 | otherwise | -- | no |

**Row 3 and the list's EVENT bindings.** The list copies every binding of its spec into one array: EVENT and BUTTON
records, in file order (`FUN_00375e20` D:L271190-271197; copied by `FUN_00369fa0` D:L264713-264739, state included).
When the list is activated, `FUN_00374cb0` looks there for `kind 1, code 2` to fire its `ONACTIVATE` (D:L270578). The input loop
of row 3 does not test the kind, so an EVENT binding is matched as if its event code were a button slot, against its
state, which stays the default 1 (§2.1). The code + 1 byte of the pad is read:

| list event on the disc (count) | code | pad byte read | when it matches |
|---|---|---|---|
| `ONACTIVATE` (19) | 2 | +3, RIGHT's state | **a RIGHT press**: the binding's script runs and the press is consumed |
| `ONFOCUS` (12) | 0x2b | +0x2c, byte 0 of TRIANGLE's pressure (f32) | never: no raw pressure 0-255 times `DAT_003df268` gives that byte 1 (computed for this note) |
| `ON_UPDATE_UIVAR` (6) | 0x2e | +0x2f, byte 3 of TRIANGLE's pressure | never (byte 3 of 0.0 or of k/255 is 0 or 0x3b-0x3f) |
| `ONSCROLL` (1, `dlgLANBriefingRoom` GAMELIST) | 0x29 | +0x2a, byte 2 of DOWN's pressure | only when DOWN's raw pressure that frame is exactly **129** (f32 129/255 has byte 2 = 1); `LIST_EVENT_PRESSURE_READING` |
| `ONSCROLL_END` (1, `dlgMPBriefingRoom` PLAYERLIST) | 0x2a | +0x2b, byte 3 of DOWN's pressure | never |

The 19 `ONACTIVATE` bindings sit on 14 lists. On 13 of them a RIGHT press reaches an `ONACTIVATE` before any other
match and runs it: `dlgFriendList` FriendList (`OnFriendListScroll`) and ConfirmationList, `dlgIgnoreList`
IgnoreList, `dlgLANBriefingRoom` and `dlgMPBriefingRoom` GAMELIST, `dlgMPBriefingRoom` PLAYERLIST,
`dlgManageRosterLeader` and `dlgWorldOfSOCOM` RosterList, `dlgWorldOfSOCOM` ROOMLIST, `dlgNetUnlockableExtras`
TrainMovieList, MovieList and JukeList, and `dlgCreateGame` SELECTED_MISSIONS (`DisplayChosenListInst`, which comes
before its `BUTTON LEFT`). The 14th, `dlgCreateGame` AVAILABLE_MISSIONS, binds `BUTTON RIGHT` (`missiondel_activate`)
before its `ONACTIVATE`, and the first match wins, so RIGHT runs that binding. In every case RIGHT is consumed by row
3 and never reaches PADHOG (row 8) or the screen's bindings. A PLAT-11 list that matches only BUTTON bindings would
pass the press on instead. This is a reading (OPT-19 item 10).

**Row 3's "returns 0" on the disc: `dlgClanLadderLobby` `LadderList`.** The list (PADHOG, NOSELECT) binds, in this
order, `TRIGGER_L1`/`TRIGGER_L2` (FALLING, then `STATE DOWN`) to `ladder_up`/`ladder_down`, then `BUTTON UP` and
`BUTTON DOWN` with `STATE DOWN`, then `BUTTON UP` and `BUTTON DOWN` with no STATE. All four UP/DOWN name `ANIMATION
NONE`, which no set defines, so `FUN_0026a250` finds nothing (D:L270378-270382):

- **A d-pad UP or DOWN press** (byte 1) matches the FALLING binding. The timer goes to 0 and the list returns 0, so
  rows 4-7 never step. The press goes on to the screen's bindings (only TRIANGLE and EVENTs) and then to the default
  navigation (§4.2), which takes the focus off the list.
- **The button held** (byte 2) matches the `STATE DOWN` binding on every frame. The list returns 0 and the timer is
  reset each time, so rows 5 and 7 (the 0.4 s repeat) can never fire. A held byte is not 1, so the default
  navigation does nothing.
- **A flick of the stick** matches nothing in row 3, which does not read the stick. Rows 4 and 6 take it, so **only
  the stick steps this list**. `TRIGGER_L1`/`TRIGGER_L2` page it through `GetLadderInfo`.

Where the press goes (`LADDER_LIST_FOCUS_READING`): the screen's `CONTROLS` are, in file order, `MainWindow_rt` and
`MainWindow_lft` (IMAGE), `LadderList`, and `LadderTop10`, which `get_ladder_top_10` disables at `ONSTART`. The base
element's ctor `FUN_00365100` (D:L262189-262204) sets every element's enabled bit (+0x14 bit 7). If the IMAGE
controls' slot +0x48 reads that bit (their class was not traced), the ring has three enabled controls. Then UP on
`LadderList` focuses `MainWindow_lft`, and DOWN skips `LadderTop10` and wraps to `MainWindow_rt`. If they read as
disabled, `LadderList` is the one enabled control of four. A press then deactivates it and walks the ring back to
it, re-activating it with no sound (§4.2 step 5). Either way the list's selection does not move.

> Settled 2026-10-03 (FOCUS-RING, §17.2): the IMAGE class's constructor clears the bit, so the second case holds --
> `LadderList` is the one enabled control of four, and a d-pad press deactivates it and walks the ring back to it.

A step (`FUN_00374010` D:L270111-270207 up, `FUN_003742f0` D:L270210-270306 down): at the first (last) item it moves
nothing and returns **PADHOG**; else it moves the selection by one (no wrap) and scrolls, runs the new item's focus
script (item +0x14/+0x18), plays `SELECTION`, and fires the list's `EVENT ONFOCUS` (0x2b) bindings; returns 1. The
scroll animation fires `ONSCROLL` (0x29) and `ONSCROLL_END` (0x2a) from the tick (D:L270655-270730).

### 5.3 The held repeat, as ticks

Press at input tick 0 (the step happens; timer = 0). The control ticks run after the input in each frame (§6), so the
input at tick k reads timer = k x dt'. The first repeat is the first k with k x dt' > 0.4 in f32, then one step per
tick while held. With dt' the menu's dt (§10):

| dt (s) | first repeat tick | steps per second after |
|---|---|---|
| 0.033333335 (1/30) | 13 | 30 |
| 0.03336667 (2 NTSC fields) | 12 | 29.97 |
| 0.016666668 (1/60) | 24 | 60 |
| 0.016683334 (1 NTSC field) | 24 | 59.94 |

(f32 sums computed for this note: 24 x f32(1/60) is 0.40000013, above 0.4; 12 x 0.03336667 is 0.4004.)

The main menu does not have this repeat (R116.7). The same rule holds for the slider (§5.4); neither the default
navigation nor a BUTTON control repeats.

### 5.4 SLIDERBAR, RADIOSTRIP, CHECKBOX

| control | slot +0x44 | consumes | effect |
|---|---|---|---|
| SLIDERBAR (`FUN_00371d00` D:L269057-269182; vtable 0x4075e0) | LEFT byte 1, LEFT byte 2, RIGHT byte 1, RIGHT byte 2 -- in that order, the first that holds | yes for all four (byte 2 even below the delay) | byte 1: value (+0x440, 0..1) -= / += step (+0x500, an int) x 0.01, clamped; the UI var set through the curve (+0x450 the midpoint); `SELECTION`; timer +0x504 = 0; the menu's `SLIDER_MOVED` (0x28) event. Byte 2 with timer > 0.4: the same step and sound **without** the event and without resetting the timer (the tick adds `min(dt,0.05)`, D:L269187-269193) |
| RADIOSTRIP (`FUN_00370f60` D:L268669-268723; vtable 0x407430) | LEFT byte 1; RIGHT byte 1; CROSS byte 1 | yes | LEFT: previous choice (wrap); RIGHT or CROSS: next (wrap); `SELECTION`. No repeat, no stick |
| CHECKBOX (`FUN_00371680` D:L268894-268937; vtable 0x4074c0) | CROSS byte 1 | yes | toggles (+0x440) and runs `ONCHECK` or `ONUNCHECK` (their `BUTTON` word unread) |

So UP/DOWN pass through every one of them to the default navigation. The slider's step value against its pixel track
is PLAT-15's (`NUM_INTERVALS`, research 117).

## 6. The suspension and the UI tick (`FUN_003654c0` D:L262239-262372)

| order | what | lines |
|---|---|---|
| 1 | if a screen switch is finishing (+0x8fc >= 0 and the fader at 128): continue the switch (`FUN_00365a00`), nothing else | D:L262262, D:L262364-262370 |
| 2 | if the suspend timer +0x900 > 0: timer -= dt (**raw dt**); no input this frame | D:L262264-262265 |
| 3 | else, if no switch is pending (+0x8fc < 0): the dispatch (§3) | D:L262267-262268 |
| 4 | dt' = min(dt, 0.05) | D:L262270-262273 |
| 5 | the fader, the command queue (`ActivateButton` 6, enable 7, disable 8, switch 2/5) | D:L262277-262347 |
| 6 | the scripts' tick, then every control's and object's tick with dt' (the hold timers advance here) | D:L262348-262356 |
| 7 | the soft keyboard's tick; the class slot +0xc | D:L262357-262362 |

**`SuspendMenuInput`** (`UISuspendMenuInput` `FUN_00277220` D:L122805-122823): the argument (a valve or a word, as
every command's, D:L122815-122818) through `FUN_00191478` and `FUN_001a12d8` to an f32, written by `FUN_001f3bb0`
(D:L54349-54358) to the state's menu +0x900 -- overwritten, whatever it held. A suspension started by a script that a
press ran in frame t begins at frame t+1 (the dispatch of frame t has run). Frames skipped for s seconds, f32, the
first frame with timer <= 0 being the first live one:

| s | dt 1/30 | dt 2 fields | dt 1/60 | dt 1 field |
|---|---|---|---|---|
| 0.15 | 5 | 5 | 10 | 9 |
| 0.75 | 23 | 23 | 46 | 45 |
| 1.75 | 53 | 53 | 106 | 105 |

**On the disc** 153 `SuspendMenuInput` calls in the three zAnim archives (`animFacts` over every set): `.3` 48 (the
map dialogs), `0` 25 (the ARMORY's stacks: ends a suspension), `1.75` 23 (the screen switches), `0.2` 10, `0.75` 7,
`2.0` 7, `1.0` 6, `3.0` 5, `60` 4 (joining a game), `5`/`0.5`/`0.15`/`3.5` 2 each, `4.0`, `0.0`, `2.3`, `0.1`, `10.0`,
`0.6`, `5.0`, `1.25`, `.75`, `1.5` 1 each. The roadmap's "0.75/1.75/2.0/3.0" are among them.

**What a suspension does to a press** (R116.9): the reader runs every frame, so a press whose byte is 1 only in a
suspended frame is never dispatched; a button still held when the suspension ends is 2, which only `STATE DOWN`
bindings and the list's/slider's repeat see. The stick's arming (§7) is updated only inside the dispatch, so it is
stale across a suspension.

## 7. The stick in menus (D:L263829-263849; `FUN_0036a060` D:L264743-264799)

**Input.** pad +0x220/+0x224, the left stick's x and y after the reader's processing (D:L179556-179811): the raw
byte b becomes (127.5 - b)/127.5 -- **x positive = left, y positive = up** -- then the pad's dead zone (+0x288), its
curve and clamps, and the right stick takes the left's place when the pad's swap flag +0x20c is set (D:L179800-179807).

**The arming flag** `DAT_003e0368` (u8, 1 in the ELF) and the last values `DAT_0049ea78`/`DAT_0049ea80` (f32), at
the top of every dispatch:

1. threshold = 0.6 if the flag is set, else 0.2;
2. flag = (|last x| <= threshold and |last y| <= threshold);
3. last = the stick now.

**The direction** (the same rule inline at D:L263870-264089 and in `FUN_0036a060`, `FUN_0036a7c0`, `FUN_0036a970`):

| flag | stick now | direction |
|---|---|---|
| 0 | both axes within 0.2 | 5 (at rest, nothing) |
| 1 | both within 0.6 | 0 (nothing) |
| 1 | beyond 0.6 on an axis, x < y and x < -y | 2 RIGHT |
| 1 | beyond 0.6, x < y and x >= -y | 3 UP |
| 1 | beyond 0.6, x >= y and x < -y | 4 DOWN |
| 1 | beyond 0.6, x >= y and x >= -y | 1 LEFT |
| 0 | otherwise | 0 |

So a flick fires once on the frame the stick passes 0.6 (the flag still set from a centred previous frame), the
next frame clears the flag (the previous value is beyond 0.6), and the flag returns the frame after the stick is back
within 0.2. The diagonals are ties, settled by the `>=` branches (x positive = left, y positive = up). Up-left
(x == y > 0) is LEFT. Up-right (x == -y < 0) is UP. Down-left (x == -y > 0) is LEFT. **Down-right (x == y < 0) is
DOWN**: it takes the `x >= y` branch, and there x < -y (D:L264786-264795, the same in the inline copy and in
`FUN_0036a7c0` and `FUN_0036a970`).

**Who reads it**: the screen's and a BUTTON control's FALLING bindings of UP/DOWN/LEFT/RIGHT (D:L264091-264105,
D:L271900-271915), the default navigation (D:L264124-264241), a list's UP/DOWN (D:L270413, D:L270418). Not the
slider, the radio strip, the checkbox, nor a `STATE DOWN` or `RISING` binding.

## 8. NOSELECT, AUTOSCROLL, PADHOG (the list box's spec)

`FUN_0037eab0` (the list spec's ctor, D:L275893-276585) reads `NOSELECT` (spec +0x36, D:L275975-275976), `AUTOSCROLL`
(+0x35, D:L275977-275978) and `PADHOG` (+0x37, D:L275979-275980) as presence flags, copied to the list at +0xe8,
+0xe9, +0xea (`FUN_00375e20` D:L271097-271099).

| flag | read at | effect |
|---|---|---|
| PADHOG (+0xea) | D:L270135, D:L270303, D:L270423 | the list's answer at its ends and to LEFT/RIGHT presses (§5.2 rows 4-8): set, the list keeps the pad; clear, the press falls through to the screen bindings and then the default navigation |
| NOSELECT (+0xe8) | D:L270014 | the selection highlight is not drawn; the commands `Highlight_on` / `Highlight_off` (the list's zAnim commands 2 and 3, D:L269484-269491) clear and set it. Input is unchanged |
| AUTOSCROLL (+0xe9) | D:L269570, D:L270789 | adding items selects the last and scrolls to it (the chat lists) |

## 9. ACCEL (`FUN_0036c760` D:L266253-266289, `FUN_0036ca30` D:L266297-266422)

`ACCEL` (0x3f90d0) is read once, by `CUIMapCtrl_ParseZAnimCmd`, inside a `PAN` command: `DIRECTION` (`UP` 0,
`DOWN` 1, `LEFT` 2, `RIGHT` 3), `SPEED`, `ACCEL`, `LIMIT` as ints. The PAN tick keeps a held time (`DAT_0049ebf0`)
that grows by dt while the PAN runs on consecutive frames (the frame counter `DAT_004a4490` against `DAT_003e0430`)
and is reset after a gap; the step is min(LIMIT x dt, ACCEL x held + SPEED x dt) pixels in the direction. The maps'
`STATE DOWN` bindings run their PAN scripts every held frame, which is what accelerates. It is PLAT-15's (the map
control), not the menus' repeat.

## 10. The tick rate and dt (a reading)

- dt is measured: at each frame's end `FUN_003aff30` (D:L304731-304768) takes timer 0's count (mode 0x83, H-blanks,
  `FUN_0034f3c0` D:L249318-249335) times 1/H-blanks-per-second (`DAT_0049e2d8`), D:L304762-304764.
- The frame cap: `FUN_003aff30` waits vertical blanks while elapsed + 1/60 < 1/`DAT_003e1400` (D:L304747).
  `DAT_003e1400` is **30** in the ELF (read at 0x3e1400), `FUN_003b17d0` (D:L305431-305441) sets it (60 means none,
  -1), a movie's start sets 30 (D:L207813) and its end restores `DAT_003e13f8` (30 in the ELF; D:L207717); the
  uncapped -1 is set by `FUN_001ebe30` (D:L50752) and `FUN_001ed560` (D:L51260), beside `CCoreState`'s ctor
  0x1eca50 -- the in-game side, not traced further here.
- So the front end ticks at **30 Hz** (two NTSC fields, dt about 0.03337), `MENU_TICK_RATE_READING`. This differs
  from PLAT-12's "shell tick at 60 Hz" (`FUN_00366940`, PC research 09, which is the movie service, §1.1): the
  disagreement is PLAT-12's to settle, and OPT-19's DOWN burst counts the distinct frames.

## 11. What touch and the PC keyboard have no original for

- **The PS2 had no pointer.** No hit-testing exists: a tap is ours (owner default 1: step the focus to the control,
  then CROSS -- the ARMORY's precedent, `ARMORY_TOUCH_READING`). Named here `MENU_TOUCH_READING`.
- **A tap on a shown popup** (a browser adaptation, 2026-11-03, seat 70 under controller 5d; a player's report
  confirmed by the owner: on Connect to SOCOM II the memory card's AskToOverwrite, popup #857 -- NO (246) is button 1
  and focused, YES (253) button 2, research 118 -- re-prompted for a slot whenever YES was clicked, since a tap while
  the popup showed was CROSS on the focused answer). The controls are not hit-tested while the popup shows; its two
  buttons are, at their bodies where the popup's draw places them (`SlotPopup.buttonRects`, `Popup.buttonRects`, the
  button's `bodySpan`; a button with no width, or a record with no buttons, has none). A tap on the unfocused button
  takes the popup's own LEFT / RIGHT step (`Popup.step`, `FUN_00370990` D:L268528-268541: the answer, the buttons'
  states, `SELECTION`), then CROSS for one read; a tap on the focused button is CROSS alone; a tap off both is CROSS
  alone, the focused answer, as before. So a click answers the button clicked, on the NO-first records (36 of research
  118's 58 two-button records) and the YES-first ones alike; the pad's keys and the popup's own logic are unchanged.
- **The PC keyboard** is ours (owner default 1, `MENU_KEYS_READING`, §12).
- **The USB keyboard** (`FUN_002dbd90` D:L180055-180092): the menu pops one key per dispatched frame; HID usage 0x28
  (Enter) or 0x58 (Keypad Enter) raises `USBKBD_ENTER` (§3 step 6). Typing into a field is the soft keyboard's
  (`DAT_0049ecd0`, `FUN_0038dc00`; PLAT-17, research 119). A physical Enter on the page may raise `USBKBD_ENTER` as
  the original's USB Enter does; whether it also is CROSS is the key map's choice (§12).
- **The browser gamepad** is a pad: the W3C standard mapping by position (`gamepad.ts` `PAD_BUTTON`) to R116.1's
  slots, and its left stick to §7 with both axes negated (W3C: x right positive, y down positive), after the pad's own
  dead zone, rescale and circle (LATER 350), `MENU_STICK_READING` -- the in-match and the forge's ARMORY dialogs'
  flick too, through the match's live DEAD ZONE (LATER 408; the forge, with no CONTROLLER OPTIONS, the console's 0.3).

## 12. For the implementer (behaviour tables to transcribe)

1. The state machine (§1.2), one row per transition; the flush (§1.3).
2. `GetButton` (§2.2) including the fall-through to START; `STATE` (§2.1) including the FALLING default.
3. The dispatch order (§3): a screen and a focused control both binding CROSS run only the control's; a screen DOWN
   binding blocks the default navigation; one binding per frame; every EVENT match fires. **A matching binding with
   no animation still consumes** at the screen and at a BUTTON control (§2.1, R116.16). A focused, enabled
   `playerinfo_ctl_desc` holds the focus against UP and DOWN. A binding to an undefined name (§2.3's 51) is the
   same at the screen and at a BUTTON control. The binding records therefore keep `state`,
   `argument` and the animation-less entries.
4. The ring (§4): file order, wrap both ways, disabled skipped, all disabled leaves the index on a disabled control,
   the sound only when the index moved, `ONACTIVATE` on each activation.
5. The list (§5.2) and slider (§5.4) repeats in seconds, timer advanced by min(dt, 0.05) after the input; the tick
   tables of §5.3 at 30 Hz.
6. The suspension (§6): overwrite, raw dt, the frame counts of §6's table; a press inside it lost.
7. The stick (§7): the hysteresis rows and the four diagonal ties (down-right is DOWN).
8. The list's row 3 (§5.2, R116.17): EVENT and BUTTON bindings matched alike against the pad. A RIGHT press on a
   focused list with an `ONACTIVATE` runs that script and is consumed, unless a `BUTTON RIGHT` comes first in file
   order (`AVAILABLE_MISSIONS`). A matched binding whose animation is missing returns 0 and skips the steps. The
   disc's case is `dlgClanLadderLobby` `LadderList` (§5.2): a d-pad UP or DOWN press does not step it and goes on to
   the default navigation; held, it never repeats; a stick flick steps it.

**`MENU_KEYS_READING`** (owner default 1): the ARMORY's map for every menu -- W/S/A/D and the arrows the d-pad; Enter,
Numpad Enter, X and Space CROSS; Backspace TRIANGLE; R CIRCLE; V SQUARE; Esc left to the page -- and one key each for
the rest, none of them Esc and none the walk's (W, A, S, D, Space, Shift, G, F, the backtick, R, B, C, X, Q, E, 1-5, I, Tab, M): **START `P`,
SELECT `O`, TRIGGER_L1 `PageUp`, TRIGGER_L2 `PageDown`** (the disc's L1/L2 bindings scroll up/down), **TRIGGER_R1
`T`** (its bindings open the chat), **TRIGGER_R2 `Y`** (no binding on the disc; `GetButton` knows it).
`BUTTON_EXECUTE` needs no key: it is START (§2.2). L3/R3 get none (no word names them). The Controls popover lists
the same. The owner may overturn.

## 13. What the captures hold, and what OPT-19 must record

**What exists** (searched under `C:/Projects/socom_pc/logs/parity` and `D:/socom_archive/parity`): PCSX2 stills one
per press, seconds apart -- `drive_pcsx2_*.txt` and `drive_pcsx2_title1.txt` (CROSS steps 3-6 s apart),
`pcsx2_dialog_poll.txt` (the dialog name per CROSS), `pcsx2_try_UP/DOWN/CROSS/START.png`, `pcsx2_menu_probe*.png`,
the `s10_pcsx2_*` directories; and the recompilation's `s10_audio_options` (DOWN/LEFT/CROSS one per 1.8-5 s, a
manifest per step). **None** is at the frame rate, none holds a button, and none records the focused control or the
frame index of a change. Nothing here can pin a repeat or a suspension.

**What OPT-19's window must record** to pin §5.3, §6 and §10:

1. **The tick rate**: a 60-fps capture of the main menu idle -- the frames on which the picture changes (the roller,
   the movie) give the menu's tick (30 or 60 Hz, `MENU_TICK_RATE_READING`).
2. **Held DOWN on `dlgMenu`, 2 s**: the frame index of each focus change. Expected from §4.4: **one**, on the press
   frame (or the next tick).
3. **Held DOWN in a list of more than 14 items** (the load list `SavedGames`, a lobby list): the frame of the first
   step, of the first repeat, and the spacing after -- expected 0.4 s then one step per tick.
4. **Held RIGHT on a slider** (`dlgOptions_Audio`): the same three numbers, and that `SLIDER_MOVED` runs only once
   (if its script draws anything).
5. **Two presses 0.1 s apart on `dlgMenu`**: the second is lost to `SuspendMenuInput(0.15)` (§6).
6. **The stick**: a slow push to full down on `dlgOptions_Menu` (one step), then held (no repeat), released past 0.2
   and pushed again (a second step).
7. **The odd words** (§2.3): START on a briefing screen (`Common_Brief_Btn`'s `BUTTON_EXECUTE`), START and L1 on
   `dlgArtGal2`, L1 on `dlgAttractCinematic` (expected: nothing).
8. Per press, the focused control's name (`menu`+0x6d0 and the ring) from a memory read, beside the frame, so the
   walk on `dlgOptions_Menu` compares by name, not by picture.
9. **The empty bindings** (R116.16): on `dlgFriendList`, open a friend's player info (CROSS on FriendList) and press
   UP and DOWN. Expected: the focus stays on `playerinfo_ctl_desc`.
10. **RIGHT on a list** (R116.17): RIGHT on the focused FriendList and on `dlgCreateGame`'s SELECTED_MISSIONS.
    Expected: the `ONACTIVATE` script runs (its picture or help line), and the focus and selection do not move.
11. **The d-pad on `LadderList`** (R116.17, §5.2): on `dlgClanLadderLobby` with the ranking filled and the list
    focused, press DOWN, hold DOWN 2 s, then flick the stick down. Expected: the press and the hold do not move the
    selection, and the press moves the focus or leaves it on the list (`LADDER_LIST_FOCUS_READING`); the flick
    steps the selection once.

## 14. What is settled, what is not

- **Settled at the reading level**: the state machine and the slot order (and its agreement with libpad2's ids and
  `GetButton`); the binding record, `GetButton`'s vocabulary and fall-through, the STATE words and default; the
  dispatch order and its returns; the ring, its order, wrap, skip and sound; the BUTTON, LISTBOX, SLIDERBAR,
  RADIOSTRIP and CHECKBOX handlers; the 0.4 s hold rule and that it steps every tick after; the suspension's
  overwrite, raw dt and lost presses; the stick's hysteresis, direction rule and readers; PADHOG, NOSELECT, AUTOSCROLL;
  ACCEL's owner; the flush; the USB Enter event. Also these: an animation-less binding consumes (R116.16), and the
  list matches its EVENT bindings against the pad (R116.17).
- **Not settled**: the menu's tick rate and dt (`MENU_TICK_RATE_READING`), hence every tick count; the byte at
  pad +0x11 the default (TRIGGER) binding reads (`TRIGGER_BINDING_READING`); whether a pad pressure of exactly 129
  ever fires the LAN GAMELIST's `ONSCROLL` (`LIST_EVENT_PRESSURE_READING`); the single-control edge
  (`SINGLE_CONTROL_FOCUS_READING`); the popup's own handler (0x370990, PLAT-16's) and the soft keyboard's (PLAT-17's);
  whether the pad's swap flag +0x20c is an option the player sets (`STICK_SWAP_READING`). (Where a d-pad press on
  `LadderList` takes the focus was open here until 2026-10-03: §17.2 settles it at the reading level.)
- **What settles it**: OPT-19's window (§13); a read of the popup handler 0x370990 for PLAT-16.

## 15. Readings and placeholders

No constant exists yet; the PLAT-11 implementer names these in code and changes their status. No `*_PLACEHOLDER`:
every value above has a source except the rows below.

| name | stands for | searched / reading | status |
|---|---|---|---|
| `MENU_TICK_RATE_READING` | the front end's tick rate and dt | `DAT_003e1400` = 30 in the ELF, the cap loop D:L304747, the movie path's 30 (D:L207813); dt measured from timer 0 (D:L304762-304764). Reading: **30 Hz**, dt = 2/59.94 s | open -- in code: `packages/ui/src/input/menuInput.ts` (PLAT-11, §16) |
| `MENU_KEYS_READING` | the PC keys for the menus (owner default 1) | §12: the ARMORY's map plus START P, SELECT O, L1 PageUp, L2 PageDown, R1 T, R2 Y | open -- in code: `packages/viewer/src/menuInput.ts` (PLAT-11, §16.5); the owner may overturn |
| `MENU_TOUCH_READING` | a tap on a dialog control | no original (§11); reading: step the focus to the control, then CROSS (`ARMORY_TOUCH_READING`'s rule); on a strip's box, step to the strip and choose the box, no CROSS (the merge controller's ruling, 2026-10-23, §16.5) | open -- in code: `packages/ui/src/input/menuInput.ts` (PLAT-11, §16.5) |
| `MENU_STICK_READING` | the browser gamepad's stick in menus | §7 on the pad's stick 0 as `FUN_002da930` leaves it -- each axis zeroed inside `+0x288` (0.3; CONTROLLER OPTIONS' DEAD ZONE writes it for both sticks, research 204 §8), rescaled past it (`+0x2a0`), the circle (`FUN_002da200`), D:L179566-179634, the move stick's own steps (`moveStick`) -- with both axes negated; the 0.2/0.6 hysteresis on that. Was (to LATER 350, 2026-10-24): the raw W3C value ; the menus read the pad's `+0x220` / `+0x224` (D:L263848-263849), written at D:L179810-179811 after the dead zone, the rescale and the circle (D:L179566-179634), the curve (D:L179636-179689), the smoothing (D:L179744-179799) and the swap (D:L179800-179807) -- the last three off for stick 0 (research 184 §1.1); `+0x288`'s writer is research 204 §8; the menu touch layer's virtual stick takes the same steps | reading, pending review (LATER 350) -- in code: `packages/viewer/src/menuInput.ts` `menuStick` (PLAT-11, §16.5); the ARMORY's flick on it since LATER 408 (`matchArmory.ts` `stick`, `forge/lobby/lobbyArmory.ts` `pad`) |
| `TRIGGER_BINDING_READING` | the 12 `TRIGGER` bindings of the cinematics | parse to kind 0, state 1, button 0x10, no animation (§2.1); the screen and the BUTTON control compare state 1 with pad +0x11. **Nothing in the pad's code writes +0x11.** The flush `FUN_002dba60` clears only +1..+0x10 (`FUN_001959b8(pad+1,0,0x10)`, D:L179911) and the pressures from +0x14. The ctor `FUN_002dbb90` (D:L179950-180008) writes neither, and no store from D:L178990 to D:L180100 reaches +0x11..+0x13. So the byte is whatever the allocation `FUN_00180e10(0x2d4)` (D:L179010) left, and whether that allocator zeroes was not traced. If the byte were 1, each such binding would match and consume on every frame (§2.1), and the bindings after it and the default navigation would never run. Reading: 0, inert | open -- *note only*; OPT-19 item 7 |
| `LIST_EVENT_PRESSURE_READING` | the list `ONSCROLL` binding matched against the pad (§5.2 row 3) | `dlgLANBriefingRoom` GAMELIST's `ONSCROLL` (code 0x29) compares 1 with pad +0x2a, byte 2 of DOWN's pressure f32 (`FUN_002d9ff0` D:L179170-179171). That byte is 1 only for a raw pressure of 129; whether the pad reports pressure in the menus was not traced. Reading: never fires in play | open -- *note only* |
| `SINGLE_CONTROL_FOCUS_READING` | UP/DOWN on a ring of one | §4.2: the control is deactivated and not re-activated. Reading: as read | open -- in code: `packages/ui/src/input/focusRing.ts` (PLAT-11) |
| `LADDER_LIST_FOCUS_READING` | where a d-pad UP/DOWN press on `dlgClanLadderLobby` `LadderList` takes the focus | §5.2: the list returns 0 (its UP/DOWN bind the undefined `NONE`) and the default navigation runs over a ring of four (two IMAGE, `LadderList`, `LadderTop10` disabled at `ONSTART`). Read 2026-10-03 (§17.2): the IMAGE class's +0x48 is the bit's reader and its constructor clears the bit (D:L278176), so `LadderList` is the one enabled control: the press deactivates it, the ring walks back to it and activates it again, with no sound. (Until then the reading was "the IMAGE controls are enabled: UP focuses `MainWindow_lft`, DOWN wraps to `MainWindow_rt`".) | resolved at the reading level 2026-10-03 -- *note only*; OPT-19 item 11 still owes the capture |
| `STICK_SWAP_READING` | the pad's +0x20c (right stick for left) | written outside the reader; not traced. Reading: off | open -- *note only* |
| `RING_ENABLED_READING` (retired 2026-10-03, FOCUS-RING) | a ring control this front end made no enabled bit for (an IMAGE, a TEXT or a MAPCONTROL in `CONTROLS`; a LISTBOX until ONL-01) | the reading was "enabled", on the base ctor `FUN_00365100` (D:L262189-262204) and, since research 144 §3, on the reader 0x1fe270 at the IMAGE and TEXT classes' +0x48. The constructors were not read: the plain bitmap's clears the bit (`FUN_0020cd50` D:L65850, the IMAGE's copy D:L278176), the text's set-up clears it (`FUN_003792f0` D:L273066), the LISTBOX's create sets it again (D:L275854). The captures showed the reading wrong (`A_43`: ACCEPT lit on arrival; `A_34`: the list; `A_06`: the title) | retired 2026-10-03: the bit each class is built with is `ENABLED_AT_BUILD` (`packages/ui/src/widgets/widgetSet.ts`), transcribed with its cites in §17.2 and held by `packages/ui/test/input/menuInput.test.ts` and `packages/ui/test/screens/focusRingDisc.test.ts` |
| `DPTOFP_ROUNDING_READING` | `SuspendMenuInput`'s double-to-float (`FUN_001a12d8`, `dptofp` by fingerprint) | the soft-float library rounds to nearest; the body not read line by line. Reading: to nearest, so `0.15` is the float nearest 0.15 | open -- in code: `packages/ui/src/input/menuInput.ts` (PLAT-11, §16.4) |
| `MENU_KEY_LATCH_READING` | a key down and up between two pad reads | no original (a PS2 button is sampled once a frame, `FUN_002da930`). Reading: read down once, so a quick tap is a press | open -- in code: `packages/viewer/src/menuInput.ts` (PLAT-11, §16.5) |

## 16. The implementation (2026-10-02, PLAT-11)

Written by PLAT-11's implementer on `agent/s9-chain` (after S9-WIRE). Everything below is at the reading level, pending
review: the unit tests transcribe this note's tables, and the dev-disc tests run the disc's dialogs through them.
Nothing is proven (§13).

### 16.1 Where it is, and what holds it

| what | where | held by |
|---|---|---|
| the state machine (§1.2), the slot order and its libpad2 cross-check, the flush (§1.3) | `packages/ui/src/input/padStates.ts` | `packages/ui/test/input/padStick.test.ts` |
| the stick's arming and direction, the four diagonal ties (§7) | `packages/ui/src/input/stick.ts` | `packages/ui/test/input/padStick.test.ts` |
| the ring: load focus, next, previous, the disabled skip, the all-disabled rest, the sound only when the index moved, `ActivateButton` (§4) | `packages/ui/src/input/focusRing.ts` | `packages/ui/test/input/focusRing.test.ts` |
| the dispatch `FUN_00368650`, steps 0-6 (§3) | `packages/ui/src/input/dispatch.ts` | `packages/ui/test/input/menuInput.test.ts` |
| the connection to PLAT-10's front end: the pad read at tick step 2, the flush at the menu state's init (a new G), the dispatch as A1, record 6, the build's focus, `SuspendMenuInput`'s row (§6) | `packages/ui/src/input/menuInput.ts` | `packages/ui/test/input/menuInput.test.ts` |
| the page's keys, pad and taps, and keeping them from the map viewer (§11, §12) | `packages/viewer/src/menuInput.ts`; the connecting lines of `packages/viewer/src/frontEnd.ts` | `packages/viewer/test/menuInput.test.ts` |
| the Controls popover's Menus group (`ControlMode` `menu`) | `packages/viewer/src/controlsList.ts` | `packages/viewer/test/menuInput.test.ts` |

The held repeat stays the widgets' (PLAT-15's `LISTBOX_HOLD_REPEAT`, `SLIDER_HOLD_REPEAT`, 0.4 s; R116.6); NOSELECT and
PADHOG stay the list's (`ListboxWidget`); the framework adds none. ACCEL is the MAPCONTROL's `PAN` (R116.12), MENU-16's
control, which no widget is made of yet: nothing of it is PLAT-11's. The tests pin the repeat as the menu ticks it:
holding DOWN on a focused list of 40 items, the press steps at once, then the first repeat comes on tick 12 at
PLAT-12's tick (100/2997 s), 13 at 1/30 s, 24 at one NTSC field and 25 at exactly 1/60 s (§16.2), and one step on
every tick after. PADHOG is tested through the dispatch: at the list's last item a DOWN stays in the list with it and
leaves the list (the default navigation) without it.

### 16.2 A correction to §5.3's table

The hold clocks sum the step with the EE's chopped float adds (`fadd`, `EE_FPU_ROUNDING_READING`, research 111 §1.4).
At exactly 1/60 s, 24 such steps sum to 0.39999986, not past 0.4 (the literal's float is 0.40000001), so the first
repeat is on tick **25**, not 24. The table's row multiplied 24 x f32(1/60), giving 0.40000002. The other rows hold
under either rounding: 12 at two NTSC fields (and at PLAT-12's 100/2997 s), 13 at 1/30, 24 at one field. The console's
dt is measured (§10), never exactly 1/60, so this row is arithmetic only.

### 16.3 Found while connecting it

- **A8 is the soft keyboard's tick.** `FUN_0038d8f0` (D:L284049) starts by testing the soft keyboard `DAT_0049ecd0`, and
  its third argument ("popup hidden") gates a loop over the keyboard's keys. It is PLAT-17's, not the focus's.
  Research 115's `POPUP_FOCUS_READING` row, which reads it as "the dialog's focus is live while no popup shows",
  belongs to PLAT-17. PLAT-11 adds nothing at A8.
- **The list keeps no enabled bit.** PLAT-15's `ListboxWidget` has no `+0x14` bit 7 and no `setEnabled`, so
  `EnableButton` / `DisableButton` on a list do nothing, and its input does not check row 1 of §5.2. The ring counts a
  list as enabled (`RING_ENABLED_READING`). This is for PLAT-15's owner.
  > Superseded: the LISTBOX keeps the bit since ONL-01 (research 144 §3) and every control since FOCUS-RING (§17,
  > 2026-10-03), which retired the reading.
- **The build's focus has no hook of its own.** It runs after `ONSTART` and right before build step 9
  (D:L263735-263745). The machine's only call at that point is the movie host's `load` (`MenuShellHost.onBuilt`), so
  the page calls `MenuInput.built` first inside it (`frontEnd.ts`). A front end without a movie host gets no build
  focus. An `onBuilt` of its own on `FrontEndMachineOptions` is PLAT-10's to add.
- **The flush is found by a new G.** `CMenuState`'s init flushes the pad before it builds G (D:L54799). The pad read
  at tick step 2 flushes first whenever the menu state's G is not the one it last saw: the same reads, in the same
  order. An init that goes straight to the load state (MS+0xc) builds no G and is not seen: its flush is not modelled.
- **The screen's bindings are kept uncapped.** `CGameMenu` holds 30 (§2.1); no disc dialog was checked for more.

### 16.4 `SuspendMenuInput`

Bound in PLAT-08's host by `MenuInput.register` (W9.R4's registry: the table is not edited). The argument is the
command's, `INPUT_STRING` replaced by the running animation's first string input, through `atof` and `dptofp`
(`DPTOFP_ROUNDING_READING`), written over MS's G+0x900 (`FUN_001f3bb0`: the menu state's G only, not the load
state's). No argument: nothing (`INPUT_STRING_NULL_READING`, research 115). The shell's `inputTimer` skips the
dispatch and counts down by the raw dt (PLAT-10's `MenuShell.tick`). At PLAT-12's tick `SuspendMenuInput(0.15)` skips
5 dispatches (§6's table), and a press inside it is lost (tested).

### 16.5 The page's adapter (owner default 1)

- **The keys**: `MENU_KEYS_READING` as §12 gives it, held by a test against `ARMORY_MENU_KEYS_READING`
  (`armory.ts:72-76`, cited as a precedent, not called; W9.R7). A key down and up between two reads is read once
  (`MENU_KEY_LATCH_READING`).
- **The pad**: the W3C standard mapping by position (`gamepad.ts`'s `PAD_BUTTON`, `PAD_PRESS`) to the slots, the left
  stick through the pad's dead zone, rescale and circle, then negated (`MENU_STICK_READING`, LATER 350).
- **A tap or a click** on the front end's canvas, mapped onto the 640 x 448 frame (`object-fit: contain`), is
  `MenuInput.tap` (`MENU_TOUCH_READING`). The control is found by its body's box from its node's place (XSIZE x YSIZE,
  centred with `HCENTERED`; a list's `IMAGE` size), the focus stepped to it as `ActivateButton` steps it, then CROSS
  for one read. While the popup shows, a tap on one of its buttons answers that button and a tap off them is CROSS
  alone (§11, 2026-11-03).
- **Keeping it from the map viewer** (PLAT-10's review): a key is taken on the document's capture phase. That is after
  the front end's own audio unlock (`GameAudio.unlockOn(doc)`, registered first), and before every target and window
  listener of the viewer (the camera's, the walk's, `ui.ts`'s, `netPage.ts`'s). Esc and the Ctrl / Alt / Meta chords
  pass. The canvas's pointer, mouse, wheel and touch events stop at the canvas. Two things are not reached from these
  files. `main.ts`'s window capture-phase key listener runs first, but it acts only in Play. The viewer's pad poll is
  `main.ts`'s loop: a pad's buttons still reach the map viewer's walk and fly camera under the front end. Gating that
  is a `main.ts` line (a hot file), owed to the controller.

### 16.6 The dev disc

With `SOCOM_DISC` or `SOCOM_PC_ROOT` (`packages/viewer/test/menuInput.test.ts`), on the front end's own clock:

- `dlgOptions_Menu`: the ring is AudioOpBtn, VideoOpBtn, ControlOpBtn, ControlPresetBtn, HDDOnOff, SaveAndLeaveBtn
  (file order). The HDD strip is enabled in this front end. DOWN by the keyboard walks it in that order and wraps to
  AudioOpBtn; UP walks back. It is §4.4's walk.
- `dlgMenu`: DOWN held 2 s changes the focus once, on the press frame (its buttons' `OnMenuBtnDown`, R116.7).
- Observed on both screens: the card's "New memory card (8MB) ... detected. Would you like to load data?" popup is up
  at the build and comes back within a few seconds of each answer. It takes the pad first (step 1), and CROSS answers
  it. The card host is not PLAT-11's. The tests answer it before each press.

### 16.7 The scored items (W9.R8, W9.R12)

| item | reference | record |
|---|---|---|
| the focus walk on `dlgOptions_Menu`, a capture per press >= 90 against PCSX2 | no PCSX2 frame of it (§13) | a missing row, owed to PLAT-31 (the manifest) and OPT-19 (the capture window): §13 items 6 and 8 |
| the same walk against the recompiled game's frames | options_explore `s05_DOWN.png` and `final.png` (`options.menu`), `s09_DOWN.png` (`options.menu.hdd-row`); presets_explore `s12_CROSS.png` (`options.menu.video-row`) | owed to PLAT-30 (the controller's wave-7 run, once the entry draws the dialog) |
| the walk's other presses | options_explore `s06_DOWN.png`, `s07_DOWN.png`, `s08_DOWN.png`, `s10_DOWN.png` (no row, research 115 §14) | a missing row, owed to PLAT-31 and OPT-19 |
| the 60-fps capture holding DOWN 2 s on `dlgMenu`, by the frame index of each focus change | none | a missing row, owed to PLAT-31 and OPT-19: §13 items 1 and 2 |
| the repeat delay and rate | none at the frame rate (§13) | unit-pinned at the reading (§16.1); the bursts on a list and on a slider are a missing row, owed to PLAT-31 and OPT-19: §13 items 3 and 4 |

### 16.8 The review round (2026-10-02)

- **A key let go under a chord** is let go: the keyup clears the key before the Esc and Ctrl / Alt / Meta filter, which
  now applies to the keydown only. Before, a DOWN held, Ctrl pressed, DOWN let go left DOWN held for the menus, and a
  list repeated on every tick past 0.4 s until the window lost the focus (tested).
- **From the moment the canvas is up**: `attachMenuInput(canvas, win)` is called when `mountFrontEnd` puts the canvas
  over the page, and the session's input is `connect`ed when the disc is read. Before, it was attached only then, and
  while the line read "reading the front end ...", and in the no-served-tree and no-2D-canvas states, the keys and the
  pointer still reached the map viewer (tested on both states). A tap before `connect` is lost; the keys before it are
  forgotten at `connect`. Attached first, the adapter now stops a key with `stopPropagation`, not
  `stopImmediatePropagation`: the front end's audio unlock (`GameAudio.unlockOn(doc)`, registered by `pageUiSounds`
  after the files are read) is a later document capture listener and must still see the gesture (tested, and the dev
  disc's `frontEndWiring.test.ts` BACK cue holds it). The viewer has no other document capture key listener; its own
  unlock is on the window's capture phase, which runs first.
- **A tap on a disabled control is lost** (`MENU_TOUCH_READING` extended): no step, no `SELECTION`, no CROSS. The pad
  cannot focus a disabled control (the ring steps past it, `FUN_003670d0`), and before, the tap's CROSS fell from the
  disabled button (it takes no pad) to the screen's CROSS binding, with no control highlighted (tested).
- **A click on a strip's box chooses it** (`MENU_TOUCH_READING` extended; the merge controller's ruling of 2026-10-23
  for CTL-1, a matter of taste on the product track: "a click on a strip's box chooses that box"). Before, a box of a
  `RADIOSTRIP` was no ring control, so its tap was CROSS alone and the strip stepped one box on (CONTROLLER OPTIONS:
  SEAL clicked gave SAILOR; the owner's "the PRESETS checkboxes cannot change the selection" read the same). Now
  `stripBoxAt` finds the subordinate's body (as a control's) and the tap steps to the strip, then
  `RadioStripWidget.choose` sets the selection there with the step's apply, check and `SELECTION` -- no CROSS; a tap on
  the chosen box does nothing, on a disabled strip it is lost, on a parked strip (OT.R8) it steps the focus and chooses
  nothing, as the parked strip's pad is refused (the strip clicks' review F1: a click on VIBRATION's box had run its
  script). A jump runs only the chosen box's `ONCHECK` and the left box's `ONUNCHECK`, not those of the boxes the pad
  would pass -- the same end where each box's script sets an absolute value (PRESETS' `SetStickPreset`, the toggles'
  valves). The pad's CROSS on a strip is the original's, one box
  forward (FUN_00370f60), unchanged; a tap on the strip's own body is step and CROSS as before. Every strip on every
  page (tested on a synthetic strip; rendered on CONTROLLER OPTIONS, `e2e/controllerOptions.spec.ts`).
- **NOSELECT on the ring** (R116.11): a list with `NOSELECT` has the same build focus and the same DOWN steps (in the list,
  out of it at the end, back in on the wrap) as one without; +0xe8 is read only by the highlight's draw (D:L270014),
  and written by the list's Highlight commands (D:L269485, D:L269490). Tested on a synthetic list.
- **Still owed, outside these files**: the Controls popover's Menus group is in `controlsList.ts` (`ControlMode`
  'menu'), but no caller passes 'menu' -- `ui.ts` (a hot file) passes the walk or fly mode, so the page never shows
  the rows; owed to the controller. `main.ts`'s window capture-phase key listener runs before the adapter: Play
  restored from the page's storage is on under the front end, so `I` opens WEAPON EXCHANGE there and an open ARMORY
  takes every key; with the viewer's pad poll, a `main.ts` gate owed to the controller. The build's focus rides the
  movie host's `load` (`frontEnd.ts`); a machine without a movie host never focuses at the build: PLAT-10 owes an
  `onBuilt` hook. PLAT-17 passes the soft keyboard and the USB key into the dispatch and wires A8's focus tick
  (`FUN_0038d8f0`).

## 17. The enabled bit a control is built with, and the focus a dialog starts on (FOCUS-RING, 2026-10-03)

Written 2026-10-03 by FOCUS-RING's implementer on `agent/focus-ring` (cut from `agent/online` at da47da55), after two
streams found the online path closed to the keyboard and the pad: on USER AGREEMENT the focus rested on an IMAGE and
never reached ACCEPT, and SELECT UNIVERSE started on an IMAGE too (research 147 §6). Sources: the retail
decompilation (cited, never pasted); the retail ELF's vtable words and strings, read with `tools/elfImage.ts`; the
disc's dialogs through `loadDialog` and `tools/dump-online-dialogs.ts`; the captures under `SOCOM_PC_ROOT`
(`logs/parity/s4_pcsx2/`, `scripts/parity/refs/`), read-only; reCOM for one name. Confidence: **reading, pending
review**. Six console frames agree with it (§17.5); none of them scores the rule itself, so nothing here is proven.

### 17.1 The rule

| question | the original's answer | where |
|---|---|---|
| what is on the ring | **every** `CONTROLS` entry, in file order, whatever its type: the build hands each record to the control factory, which calls the record's own create (the record's vtable +0x10) and tests nothing; the element it returns is appended to the list at `menu`+0x290. A control's subordinates go under it (a RADIOSTRIP's boxes), not on the ring; `OBJECTS` go to the second list | D:L263627-263651; `FUN_003696d0` D:L264427-264489 |
| the enabled test | one function for all sixteen classes: vtable +0x48 is 0x1fe270, which answers +0x14 bit 7 and nothing else | the ELF, §17.2 |
| the bit a control is built with | what its class's constructor and set-up write: **0** for IMAGE, PROGRESSBAR and the text family; **1** for the button family, LISTBOX, MAPCONTROL and SCROLLINGTEXT | §17.2 |
| who writes it afterwards | +0x4c alone, reached by the queue's records 7 and 8 (`EnableButton`, `DisableButton`): the node found by name anywhere in the dialog, its element's +0x4c with 1 or 0, **whatever its class** | D:L262288-262316 |
| the first focus | index 0. Enabled: activated (+0x50). Not enabled: `FUN_003670d0(menu, 0)` -- the first enabled control after it in file order, activated with no `SELECTION`. None enabled: nothing is active and the index rests where the step left it -- 0 on a ring of one, 1 on a longer ring, since `FUN_003670d0` steps before it tests (D:L263131-263132; the review of 2026-10-05; no dialog on the disc has more than one control with all built disabled) | D:L263735-263745 |
| a field for it in the record | none. The ELF's UI strings hold no DEFAULT, INITIAL or focus key for a dialog: only the list's `GetFocusIndex` / `SetFocusIndex` (its row), `FOCUS_ANIM` / `FOCUS_ARG` (an item's focus script) and the `ONFOCUS` event | `findStrings` over the ELF |
| what moves it after the build | a script's `ActivateButton` (record 6, `FUN_00366b60` D:L262962-263016), applied at a tick's queue step. The build fires the screen's `ONSTART` before it sets the focus (D:L263733), but the records an ONSTART script queues are applied at the next tick, after the build's focus; the queue is read **newest first** (research 115 R115.2), so of two `ActivateButton` queued in one frame the one queued first is applied last and keeps the focus | D:L262288-262347 |
| past a control that cannot take it | §4.2, unchanged: the step goes on until an enabled control, and the control it started from is activated again when it is the only enabled one of several | `FUN_003670d0` D:L263102-263176 |
| a list that holds it on arrival | its activate `FUN_00374cb0` (D:L270514-270608): the ACTIVE colour and highlight, the selected row clamped to the last item (0 in a new list), the selected item's focus script, then the list's `ONACTIVATE` bindings. UP and DOWN then step its row (§5.2) | D:L270514-270608 |

So an IMAGE, a TEXT or a WRAPPEDTEXT listed under `CONTROLS` **is** on the ring, and is passed over like any disabled
control until a script enables it. In the online chapters' scripts (research 128's pin) every `EnableButton` names a
button or a list; `DisableButton` names buttons, lists and three WRAPPEDTEXTs (`motd`, `CHATLIST`, `B_CHATLIST`: already
0). The dialogs' ONSTART scripts disable the lists they do not want focused (`COMBOLIST`, `HWLIST`, the lobby's and the
briefing room's lists) and never an IMAGE or a TEXT: nothing built disabled needs it.

### 17.2 The bit, class by class

Every vtable below has +0x48 = 0x1fe270 (the bit's reader) and, the button family aside, +0x4c = 0x1fde10 (the bit's
writer, `FUN_001fde10` D:L58859-58866), +0x50 = 0x1fe290 and +0x54 = 0x1fe2a0 (both `jr ra`: activate and deactivate
do nothing), all read in the ELF. The button family's +0x4c is `FUN_00377380` (it writes the bit and restyles), its
+0x50 0x3766a0, its +0x54 `FUN_0036e6b0`; the LISTBOX's +0x50 is `FUN_00374cb0`, its +0x54 `FUN_00376420`.

| TYPE | run-time vtable | its create | built | where the bit is written |
|---|---|---|---|---|
| IMAGE | 0x407950 | `FUN_00382ff0` D:L278129-278182 | **0** | the plain bitmap's constructor, inline: after the base constructor, its own +0x4c with 0 (D:L278176). The same constructor as a function is `FUN_0020cd50` (D:L65834-65853, the call at D:L65850) |
| PROGRESSBAR | 0x407550 | `FUN_0037e470` D:L275649 | **0** | the plain bitmap's constructor, inline (D:L275672) |
| TEXT | 0x407a90 | `FUN_00388a60` D:L281247-281263 | **0** | the text's set-up `FUN_003792f0` (D:L273014): its own +0x4c with 0 (D:L273066) |
| SECURETEXT | 0x406fa0 | `FUN_003887b0` D:L281147-281163 | **0** | `FUN_003792f0` (D:L281161) |
| TELETYPE | 0x4078a0 | `FUN_003888a0` D:L281182 | **0** | its set-up `FUN_00378b00` opens on `FUN_003792f0` (D:L272770) |
| WRAPPEDTEXT | 0x4079e0 | `FUN_00388400` D:L281016 | **0** | its set-up `FUN_0037a430` calls `FUN_003792f0` (D:L273569) |
| COUNTER | 0x407be0 | `FUN_00381be0` D:L277425 | **0** | `FUN_003792f0` (D:L277478) |
| CLOCK | 0x407190 | `FUN_0037d220` D:L274948 | **0** | `FUN_003792f0` (D:L274962) |
| LISTBOX | 0x407670 | `FUN_0037e8b0` D:L275797-275866 | **1** | built on the plain bitmap (`FUN_0020cd50`, D:L275811: 0), then its own +0x4c with 1 (D:L275854) |
| BUTTON | 0x407790 | `FUN_00380470` D:L276657 | **1** | the button's constructor `FUN_00377800` (D:L272105) is the base constructor `FUN_00365100`, which sets the bit (D:L262201); nothing after it clears it |
| HANDLERBUTTON, CHECKBOX, SLIDERBAR, RADIOSTRIP | 0x407700, 0x4074c0, 0x4075e0, 0x407430 | `FUN_00387fe0`, `FUN_0037de60`, `FUN_0037e730`, `FUN_003874e0` | **1** | `FUN_00377800`; the check's and the knob's bitmap members are plain bitmaps, built 0 (D:L275454, D:L275779) |
| MAPCONTROL | 0x407260 | `FUN_0037d580` D:L275080 | **1** | its constructor `FUN_0036d850` (D:L266712) is the base's; its set-up `FUN_0036d140` (D:L266489-266711) calls no +0x4c |
| SCROLLINGTEXT | 0x4072f0 | `FUN_003881f0` D:L280932 | **1** | built on the text's constructor (`FUN_0027f250` D:L126937) and set up by 0x370340, which is `jr ra` in the ELF: `FUN_003792f0` is not reached. No dialog on the disc lists one under `CONTROLS` |

How the inventory was closed. Every call through a +0x4c in the UI's code (D:L255000-290000) was listed: sixteen
sites. Two are the queue's (D:L262301, D:L262314). One is the LISTBOX's 1 (D:L275854). One is the text's set-up
(D:L273066). Eleven are a plain bitmap's constructor writing 0, inline: the IMAGE (D:L278176), the PROGRESSBAR
(D:L275672), the menu's own two bitmaps (D:L264615, D:L264627), the button's body (D:L272186), the check and the knob
(D:L275454, D:L275779), the list's image cells (D:L273790, D:L274015), the teletype's bitmap (D:L281209) and the class
at vtable 0x4080a0 (`FUN_0038e620`, D:L284598). The sixteenth (D:L265753) calls another object's vtable, not an
element's. Every store of that form into +0x14 bit 7 in the whole decompilation was listed too: three, the base
constructor (D:L262201), `FUN_001fde10` (D:L58864) and `FUN_00377380` (D:L271953). The record's type words are the
factories' (`FUN_00382890` D:L277868 for controls, falling back to `FUN_00382070` D:L277596 for the object types;
SECURETEXT's branch at D:L277775-277778).

**A second reading of the name.** reCOM (SOCOM 1 re-implemented; `reCOM@5b05af1:src/gamez/zTwoD/ztwod_main.cpp:43-51`,
the base constructor at `:24`) calls the base element's flag `m_active_and_handling_input`, read by `CanHandleInput()`
and written by `SetCanHandleInput()`, set true by the base constructor: the same pair as +0x48 / +0x4c here. reCOM has
no ring code and its bitmap's constructor does not clear the flag, so it says nothing about the build's focus; the
decompilation alone carries that.

### 17.3 What the port did, and the fix

The port kept an enabled bit only where PLAT-15 made a widget with one (the button family; the LISTBOX since ONL-01).
For every other control `RING_ENABLED_READING` answered "enabled", on the base constructor's bit alone: research 144
§3 traced the reader (0x1fe270) for the IMAGE and TEXT classes and not the constructors that clear the bit. So the
build's focus rested on the first control whatever it was -- `teletype_plate` on USER AGREEMENT, `MainWindow` on SELECT
UNIVERSE and LOGIN -- and the walk stopped on every IMAGE and TEXT of the ring.

The fix is at the bit: `WidgetSet` (`packages/ui/src/widgets/widgetSet.ts`) answers `enabled(record)` for every element
-- the widget's own bit where it keeps one, else `ENABLED_AT_BUILD` (§17.2's table) or what a record 7 / 8 wrote since --
`DialogParts.setEnabled` writes it for any class, and `MenuInput`'s ring reads it per record. `RING_ENABLED_READING`
is retired (§15). The ring (`focusRing.ts`) and the dispatch are unchanged.

### 17.4 The focus each dialog of the online path starts on

`packages/ui/test/screens/focusRingDisc.test.ts` (the disc, else the committed fixtures: it runs in CI) builds each
dialog on PLAT-10's machine with the rows this base has and pins this table. "Build": the control the build's own
focus rests on, by §17.1. "Settled": after the ONSTART scripts (3.1 s); where it differs from the build, the script
named moved it.

| dialog | CONTROLS | build | settled | what moved it | the console's frame |
|---|---|---|---|---|---|
| `dlgMPswitch` | 0 | -- | -- | no control; its ONSTART switches to LOGIN | -- |
| `dlgNetLogin` (LOGIN) | 10 | `login_btn` (three IMAGEs and a TEXT before it) | `login_btn` | `OpenCardOne`: `ActivateButton(login_btn)`; the build's own activation already ran LOGIN's ONACTIVATE (the title #568) | `A_31`: LOGIN lit |
| `dlgNetAuthenticate` (the DNAS screen) | 0 | -- | -- | no control | -- |
| `dlgNetServerSelect` (SELECT UNIVERSE) | 2 | `SERVERLIST` (after the IMAGE `MainWindow`) | `SERVERLIST` | nothing: the build's own | `A_34`: the row lit |
| `dlgNetPlayerName` (the persona form) | 10 | `playername_btn` | `playername_btn` | `OnLoginRoomstart`: `ActivateButton(playername_btn)` with no name set | `A_35`: PLAYER NAME lit |
| `dlgNetConnect` | 1 | none: its one control is a TEXT, the index rests on it and nothing is active | the same | -- | -- |
| `dlgUsagePolicy` (USER AGREEMENT) | 3 | `YesAccept` (after the IMAGE `teletype_plate`) | `YesAccept` | nothing: the build's own | `A_43`, the recomp's `08_eula`, `refs/eula`: ACCEPT lit |
| `dlgWorldOfSOCOM` (SOCOM II ONLINE) | 28 | `LadderTop10` (the first LISTBOX, after the IMAGE `MainWindow`) | `popup_motd_button` | `init_screen` on the first arrival (`PopupNewsOnce` 0): `ActivateButton(popup_motd_button)`, queued before `OnBriefingRoomstart`'s `ActivateButton(newsandmessages)` and so applied last | `A_44`: SERVER NEWS up |
| `dlgMPBriefingRoom` (the briefing room) | 91 | `PLAYERLIST` (the first LISTBOX, index 30) | `JoinGame` | `OnBriefingRoomstart`: `ActivateButton(JoinGame)` | `A_48`: JOIN GAME lit |
| `dlgCreateGame` (CREATE GAME) | 101 | `gamename_btn` | `gamename_btn` | `init_cg_screen`: `ActivateButton(gamename_btn)` | `A_49`: GAME NAME lit |
| `dlgGameLobby` (the game lobby) | 15 | `B_SPECLIST` (the first LISTBOX, after three IMAGEs) | `Glswitchteams`, then `weaponselect` at 10 s | `Enable_SM_Launch` for the host (`IsSessionMaster` and `IsSwitchTeamsOK` answered true, ONL-16's rows): `ActivateButton(Glswitchteams)` queued before `ActivateButton(weaponselect)`, so SWITCH TEAMS keeps it; `ArmButtonClock`'s ten-count then activates ARMORY | `A_53`: ARMORY lit, the #350 popup still up |

LOGIN's lit row is unchanged. What changed on LOGIN is the walk's wrap: DOWN on EDIT NETWORK CONFIGURATIONS goes to
LOGIN at once, and UP from LOGIN to EDIT NETWORK CONFIGURATIONS -- research 144 R144.3's "four dead steps" over
`MainWindow`, `GreenBackTitle2`, `memcard_back` and `hw_title` were the old reading's, corrected there.
`dlgClanLadderLobby`'s `LADDER_LIST_FOCUS_READING` (§5.2) is settled the same way: its two IMAGEs are built disabled.

### 17.5 What the captures say

No capture scores the rule; six frames show its result, and two pinned scores rose with it.

| frame | what it shows | before the fix | with it |
|---|---|---|---|
| `A_43_eula.png`, `08_eula.png`, `refs/eula.png` | ACCEPT lit on arrival, no press | the focus on `teletype_plate`, nothing lit, ACCEPT out of reach | ACCEPT lit; LEFT / RIGHT to DECLINE; CROSS runs `ForceUsagePolicyReturn` |
| `A_34_universe.png` | the list's row lit on arrival | the focus on `MainWindow`; 98.9, and 99.0 only after one DOWN | the row lit on arrival: **99.0** (`tools/test/universeScore.test.ts`) |
| `A_06_login.png` | LOGIN with no configuration: the title drawn, EDIT NETWORK CONFIGURATIONS lit | no title -- LOGIN was disabled before it was ever activated, and its ONACTIVATE (`OnLoginactive`) sets the title: 98.1 | the build activates LOGIN, the title is drawn: **99.8** (`tools/test/netLoginScore.test.ts`) |
| `A_05_online.png` | the same screen under the #581 popup | no title under the dimmed screen: 95.1 | **95.2** (`tools/test/popupPlaceScore.test.ts`); *99.8 since ONL-07 (2026-10-05) drew the popup's text at its face's opacity, research 157 §8* |
| `A_44_lobby.png`, `A_48_briefingroom.png`, `A_49_creategame.png`, `A_35_persona.png` | SERVER NEWS up; JOIN GAME, GAME NAME, PLAYER NAME lit | -- | §17.4's settled column, by name |
| `A_53_gamelobby.png` | the host's lobby: ARMORY lit, SWITCH TEAMS enabled and not lit, the #350 popup up | -- | the same, from 10 s after the build (the test's last case) |

`A_06` is the one that tells the two readings apart without a press: the title can only be there if the build
activated LOGIN, which it does only if the three IMAGEs and the TEXT before it are not enabled.

**The browser look** (2026-10-03, the lock FREE; Chromium over Playwright on the worktree's own Vite at 5400, a match
server on 8862 with `DATA_DIR` in the scratch folder and `ALLOWED_ORIGINS=http://localhost:5400`): on
`?devmode&menuflow=dlgNetServerSelect.rdr&server=ws://localhost:8862/ws` the hook read the focus `SERVERLIST` on
arrival, the placeholder universe's row drawn lit; Enter (CROSS) raised the #614 popup "Connecting to server..." over
it (`select_server`; the rest is ONL-05's and ONL-07's). On `?devmode&menuflow=dlgUsagePolicy.rdr` the focus read
`YesAccept`, ACCEPT drawn lit; the arrow keys Right and Left moved it to DECLINE and back; Down left it on ACCEPT; Enter
on ACCEPT left the screen standing (`ForceUsagePolicyReturn`'s `SWITCHMENU(PREVIOUS_SCREEN)` with no history on a deep
link; the agreement's text and the way on are ONL-08's). The frames stay in the scratch folder; none is in the tree.

### 17.6 Not settled

- ~~**No capture of a press on a ring with a disabled IMAGE between two buttons**~~ -- one exists (the review of
  2026-10-05): `$SOCOM_PC_ROOT/logs/parity/netcfg1_sheet.png` and `netcfg2_sheet.png` (PCSX2, 2026-09-07), LOGIN with
  no configuration: `01_0_CROSS` EDIT NETWORK CONFIGURATIONS lit, `01_1_DOWN` SELECT MEMORY CARD slot lit with its help
  line, `01_2_DOWN` EDIT lit again -- one press past both lists, three IMAGEs, the TEXT and the two disabled buttons,
  which the old reading would have left lit on nothing; the port replays it. Owed: `netLoginDisc.test.ts` pins only
  UP in that state, not this DOWN wrap.
- **A MAPCONTROL on the ring** is enabled and takes the pad in the original (+0x44 = 0x36d2e0); the port makes no
  widget of it (MENU-16), so on a map dialog its focus stop takes no pad. None is on the online path.
- **The settled focus where a later task's row decides it**: the lobby's (`IsSessionMaster`, `IsSwitchTeamsOK`, the
  45-second clock: ONL-16) is held for the host's case only; READY's state is not held.
- **The build's focus still rides the movie host's `load`** (§16.3): a machine without a movie host sets none.
