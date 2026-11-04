# 340 -- The stick in the original's screens: the round's START menu, the lobby's ARMORY, and the front end's flick end to end (AM-2)

- Date: 2026-10-16 (the front end's pad and disc, row AM-2; the plan `../plans/2026-10-16-front-end-pad-and-disc.md`,
  FI.R2 and FI.R5). Branch `agent/fi-am2` from `agent/front-input` at `8e190f296`. The number is the merge
  controller's (332 on is the gameplay lane's).
- The owner's word (2026-10-16, ANALOG-MENUS): "make menu movement work with analog sticks across the board". FI.R5:
  the original's screens follow the original; a screen of the original that does not take the stick does not get it,
  and the owner's ask for it is a `HUMAN_TASKS.md` row with the default "follows the original".
- Status: **reading, pending review.** Every value of the original below is read from the retail decompilation
  (`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`; never pasted) and
  from the disc's `RUN/UI/READERC.ZAR` through the repository's readers (`Zar`, `parseRdr`, `@s2u/ui`'s `loadDialog`;
  names and states only, RS.R8). Nothing here is measured on the original running: a PCSX2 run flicking the stick on
  the START menu and on the ARMORY is the proven level, not claimed.
- Stands on research [116](116-the-menu-input.md) (§3 the dispatch, §5.1 BUTTON, §7 the stick; R116.6, R116.9,
  R116.10), [266](266-the-chat-panels.md) §8 (the START menu, MATCH-01 / MATCH-02), [95](95-the-armory.md) §2.5 and
  §3 (the ARMORY's controls and scripts), [167](167-the-armory-from-the-game-lobby-and-the-loadouts-on-the-account.md)
  §1 (the way in from the game lobby) and [182](182-c4-armory.md) §2.4 (the dispatch's order on the ARMORY), and does
  not restate them.
- Code: `packages/viewer/src/lobbyArmory.ts` (`ArmoryStick`, `LobbyArmory.pad`, `ARMORY_STICK_ARMING_READING`,
  `ARMORY_STICK_SAME_FRAME_READING`). Nothing changed in `startMenu.ts` or `ui/src/input/**`: the START menu already
  follows the original, and the front end's flick holds end to end (§1, §3). Tests:
  `packages/viewer/test/startMenu.test.ts`, `lobbyArmory.test.ts`, `menuInput.test.ts` (§6).

## 0. The answers

| row | answer | where |
|---|---|---|
| R340.1 | **The round's START menu takes no stick.** Its cursor reads the pad's state bytes for UP and DOWN only (`FUN_00201690` D:L60817-60818: +5 UP, +6 DOWN, pressed or held), and under ABORT's confirm RIGHT and LEFT only (D:L60871-60874: +3, +4); its presses read START, TRIANGLE and CROSS (`FUN_002041e0` D:L61660-61671) and its open START (`FUN_002011f0` D:L60642-60646). Those bytes are the digital buttons' (`FUN_002da930` D:L179819-179862), never the stick's. Nothing in the menu's code reads the stick or the menus' flick. So the 0.2 s gate (`DAT_003dc430`, D:L60810-60813) is the d-pad's alone. | §1 |
| R340.2 | **The port's START menu already follows**: its held set is the W3C pad's buttons (`padButtonsDown`), never its axes, in both pages (`main.ts`, `matchMount.ts`). Nothing is changed; a transcription test holds it. The owner's ask was H228, answered 2026-10-16 (through the merge controller): "Keep D-pad only, as original". | §1.3 |
| R340.3 | **The lobby's ARMORY takes the stick in the original.** `dlg_equipment_mp.rdr` is a dialog of the menu framework, dispatched by `FUN_00368650` (D:L263804-264248). Its d-pad bindings sit on its BUTTON controls, and every one is FALLING (no `STATE`, the disc's layout, §2.2). A focused BUTTON control fires a FALLING UP / DOWN / LEFT / RIGHT binding on the stick's flick as on the press (`FUN_00377040` D:L271895-271915). So on the ARMORY a flick is the d-pad press: one step as an axis passes 0.6 from an armed stick, re-armed once both axes are back within 0.2, never a held repeat (research 116 §7). | §2 |
| R340.4 | **The port's lobby ARMORY did not take it**: `LobbyArmory.pad` read the snapshot's buttons only, and the stick's axes were dropped. That was the bug the owner met on this screen. **Fixed**: `ArmoryStick` (ui's `MenuStick`, the same hysteresis and diagonals) turns the snapshot's stick into the d-pad input it stands for. | §2.3 |
| R340.5 | **The front end's flick holds end to end**: from a standard pad's raw W3C axes, through the page's chain (`GamePad` under `MenuPageInput`), to the focus of a built dialog's ring. A push to 0.7 steps once; held 3 s it does not repeat; back to 0.3 it stays disarmed; within 0.2 for one tick it re-arms. The diagonals settle as research 116 §7's table says. On the dev disc, `dlgOptions_Menu` walks by the stick as by DOWN, and `dlgMenu`'s roller moves once for a stick held 2 s. Nothing failed, so nothing in `ui/src/input/**` changed. | §3 |
| R340.6 | **The shared ARMORY screen's other hosts are not wired here**: the test room's pre-round ARMORY (`main.ts`, `matchMount.ts`: `armory.pad(edges)`) and the forge lobby's (`forge/lobby/lobbyArmory.ts`) hand the screen button edges only. They are the same original screen, so the stick is owed there too, through the same `ArmoryStick`. Their files are not AM-2's (§4). | §2.4, §4 |
| R340.7 | **Not read**: WEAPON EXCHANGE and the round's Chat menu share neither the START menu's code nor the dialog dispatch. Whether they read the pad's stick is not read here. Neither reads the menus' flick: nothing outside the menu framework does (§1.2). The original has no in-round ARMORY (research 95 §9). | §4 |

## 1. The round's START menu (`FUN_00201690` and its callers)

### 1.1 The pad it reads

The HUD's frame `FUN_001f7ff0` hands the menu the pad object `DAT_0044f108` when the local controller's +0x114 is 0
(D:L56649-56651), and ticks the menu with it (D:L56696-56697). In the menu (research 266 §8.5):

- **The cursor** (`FUN_00201690` D:L60815-60867): byte +6 (DOWN) or +5 (UP) at 1 (pressed) or 2 (held), D:L60817-60819,
  once the gate `DAT_00409098` is open (D:L60810-60813, `DAT_003dc430` = 0.2 s). One step a gate.
- **The confirm's buttons** (D:L60869-60886): byte +3 (RIGHT) or +4 (LEFT) at 1 or 2, D:L60871-60874.
- **The rows' presses** (`FUN_002041e0` D:L61644-61918): byte +10 (CROSS) let go, D:L61660-61662; +1 (START) pressed,
  D:L61664-61666; +7 (TRIANGLE) let go, D:L61669-61671.
- **The open** (`FUN_002011f0` D:L60615-60708): byte +1 (START) pressed, and offline the pad's +0xdc (gone),
  D:L60642-60646.

The bytes are the pad's state bytes (research 116 R116.1). The reader `FUN_002da930` fills them from the digital
buttons alone: each slot through `FUN_002d9ff0` with the button's bit and its pressure (D:L179819-179862; RIGHT, LEFT,
UP and DOWN are slots 2-5, D:L179825-179834). The stick goes elsewhere: its four bytes become the floats +0x210 to
+0x21c (D:L179557-179563), shaped and copied to +0x220 / +0x224 (D:L179810-179811). No stick value reaches a state
byte.

### 1.2 Nothing of it reads the stick

- **The stick's floats.** In `FUN_002011f0` .. `FUN_00205800` (D:L60615-62375) every `+0x220` / `+0x224` / `+0x221` is
  the menu's own box (+0x220, its vtable at +0x22c, and its member +0x224: D:L60676-60682, D:L61371-61385, D:L61966,
  D:L62004, D:L62292-62294, D:L62335) or the controller's control state (+0x221, D:L60651, D:L61962). None is the
  pad's.
- **The menus' flick.** Its arming flag `DAT_003e0368`, its last values `DAT_0049ea78` / `DAT_0049ea80`, and its
  readers are read only inside the menu framework:
  - the dispatch: D:L263829-264225;
  - `FUN_0036a060`: D:L264743-264799;
  - `FUN_0036a340` and `FUN_0036a570`: D:L264886-264976;
  - `FUN_0036a7c0` and `FUN_0036a970`: D:L265084-265197;
  - the list box: D:L270413-270425;
  - the BUTTON control: D:L271895-271898;
  - `FUN_00394f60` (the soft keyboard's): D:L288622;
  - `FUN_0036d2e0` (a widget of the framework; added at the review, its F1): its binding loop fires a `STATE DOWN`
    (state 2) binding on the stick held past 0.6 (`FUN_0036a340(0.6)`, then `FUN_0036a570`, D:L266575-266596), and it
    scrolls by the pad's +0x21c (D:L266604-266610).

  The HUD's code (0x1f..0x20 addresses) reads none of them.

  **For research 116 §7's owner** (the review's F1): that section says the stick reaches "not ... a `STATE DOWN`
  binding". `FUN_0036d2e0`'s loop does fire one on the stick held, so a front-end dialog whose focused control is that
  widget, with a `STATE DOWN` d-pad binding, would repeat on a held stick. The START menu's answer is unchanged (it is
  not the framework's), and §3's flick holds for the BUTTON controls and the list box it was walked on; the widget's
  case is not walked here.

So the START menu takes the d-pad and not the stick. Its held repeat (every 0.2 s) is the d-pad's. A stick pushed while
it is open does nothing in the original.

### 1.3 The port

`StartMenu.frame` takes the set of buttons held. Both pages build that set from the pad's buttons, never its axes:
`padButtonsDown` of the polled pad with the touch pad's (`main.ts`, the frame's `down`; `matchMount.ts`, the same).
So the port follows. The test (§6) drives the menu with the W3C pad pushed every way, held a second past the gate's
0.2 s each, and finds no move and no `.TCM_SLIDE`; the d-pad's DOWN then moves it. The owner's ask is recorded as
**H228** (`../HUMAN_TASKS.md`), default "follows the original"; the stick is not added. The owner answered it on
2026-10-16, through the merge controller: "Keep D-pad only, as original".

## 2. The lobby's ARMORY (`dlg_equipment_mp.rdr`)

### 2.1 A dialog of the menu framework

The game lobby's weaponselect CROSS switches the front end to `dlg_equipment_mp.rdr` (research 167 §1). There the
menu state's UI tick runs the dialog's input: `FUN_003654c0` calls `FUN_00368650` with the pad `DAT_0044f108` on each
frame that is not suspended and not mid-switch (D:L262262-262269). The dispatch's order on this screen is research 182
§2.4's: a shown popup, the soft keyboard, the focused control, then the screen's bindings. Step 0, before all of them,
arms the stick (D:L263829-263849; research 116 §7).

The focused control here is a BUTTON (`FUN_00377040`, research 116 §5.1). Its loop over its bindings (D:L271888-271930)
asks `FUN_0036a060` for the stick's direction (D:L271895-271898). A binding fires when its state equals its button's
byte, **or** when it is FALLING (state 1) and the direction is its button's: UP 3, DOWN 4, LEFT 1, RIGHT 2
(D:L271900-271915). The first binding that matches runs and returns (D:L271915-271925), one a frame.

### 2.2 Its bindings (the disc)

Read off `RUN/UI/READERC.ZAR` (the disc's, and the fixture's byte copy, `test-fixtures/MANIFEST.json`) through
`loadDialog`. The probe listed every `BUTTON` and `EVENT` record of the file with its owner and `STATE`; the test
(§6) holds the d-pad rows.

| owner | d-pad bindings (file order), each with no `STATE` | the other bindings |
|---|---|---|
| the screen | none | TRIANGLE `returnto_lobby`; the events (`ONSTART` x7, `ON_FORCE_NEW_DB`, `MP_MEDIUS_ERROR`, `MP_SYSTEM_MESSAGE`, `HDD_ERROR`) |
| `EquipMpTerrBtn`, `EquipMpSealBtn` | UP `NothingUp`, DOWN `NothingDwn`, RIGHT `ActivateMPCharStackRt`, LEFT `ActivateMPCharStackLft` | `ONACTIVATE`, CROSS |
| `EquipWeaponBtn` | UP `ActivateMPEquipStackUp`, DOWN `ActivateMPEquipStackDown`, LEFT `OnEquipWeaponBtnLeft`, RIGHT `OnEquipWeaponBtnRight` | SQUARE (first), CIRCLE (between LEFT and RIGHT), TRIANGLE (last) |
| `EquipMPDoneBtn` | UP `OnMPEquipDoneUp`, DOWN `OnMPEquipDoneDwn` | CROSS (first), CIRCLE, TRIANGLE |

Every d-pad binding is FALLING (`STATE` absent is 1, research 116 R116.3). So each one fires on the flick that way, as
on the press. The default navigation (step 5) is never reached by a d-pad direction here: every focused control binds
UP and DOWN and consumes them, and LEFT and RIGHT never move the focus by default (R116.5).

The ARMORY's scripts suspend the input on most steps (`SuspendMenuInput`, research 95 §3.2-§3.4). While the input is
suspended the dispatch does not run, so the stick's arming is not updated (R116.9). A push held through a suspension
is measured against the arming from before it (§2.3).

### 2.3 The port: what was missing, and the fix

The front end hands every pad read to the shared screen first (`FrontEndSession.menuFrame`). While the screen is up it
gives the machine none, so the session's own `MenuInput` sees the stick at rest. `LobbyArmory.pad` stepped the screen
on the buttons pressed and dropped `stickX` / `stickY`. So the stick did nothing on the ARMORY, where the original
steps it.

The fix, in `LobbyArmory.pad` through `ArmoryStick`:

- **The flick.** ui's `MenuStick` (`ui/src/input/stick.ts`: 0.6 to fire, 0.2 to re-arm, `FUN_0036a060`'s diagonals)
  takes the snapshot's stick, in the game's signs (`MENU_STICK_READING`). Its direction is the screen's d-pad input:
  UP `up`, DOWN `down`, LEFT `left`, RIGHT `right`. The screen's own state then does what the binding's script does
  (`stepArmory`).
- **The arming's frames** (`ARMORY_STICK_ARMING_READING`). While the screen is open, the arming runs at each read the
  screen takes input (`Armory.taking`, its suspensions standing in for the dispatch's, R116.9). So a push held through
  a suspension fires once at its end, as in the original. Before the screen opens -- the lobby's frames -- the arming
  runs at every read. The original's runs only at the lobby's unsuspended dispatches. The session's own stick
  (`MenuInput.stick`, the lobby's) is not shared with this one. Either way a stick held from the lobby into the screen
  is no flick, as a button held from it is no press.
- **One a frame** (`ARMORY_STICK_SAME_FRAME_READING`). The original fires one binding a frame: the first, in the
  control's file order, that matches the buttons or the flick (§2.1). The port hands no flick in a frame where a button
  the screen reads was pressed. That is the original's answer when the flick and the press go the same way (one
  binding), and when the press's binding comes first in the file. It differs when the flick's binding comes first:
  `EquipWeaponBtn` with RIGHT pressed and the stick flicked up runs UP in the original and RIGHT here. And CROSS (the
  review's F3): the control takes CROSS (byte +10 at 1) through its vtable +0x74 before the binding loop
  (`FUN_00377040` D:L271883-271885), and the loop can still fire a flick's binding in that frame. So CROSS pressed with
  a flick does both in the original; the port does the CROSS and drops the flick.

### 2.4 The shared screen's other hosts

The same `Armory` screen is mounted in two more places. Both are the original's `dlg_equipment_mp.rdr`, so both owe the
stick in the same way:

- The test room's pre-round ARMORY, opened on taking a seat (research 95 §9, item 4): `main.ts` and `matchMount.ts`
  call `armory.pad(edges)`, the pressed buttons only.
- The forge lobby's window: `forge/lobby/lobbyArmory.ts` `pad` hands `Armory.pad` the pressed buttons only.

Both now take it (the FI plan's checkpoint 2, 8fc998fac and its review's folds; the `main.ts` / `matchMount.ts` lines
cleared by the merge controller and the gameplay seat):

- The match pages' host, `matchArmory.ts` `MatchArmory.stick`: the physical pad the page read (the touch layer is
  hidden under the screen, which takes taps), read every frame -- in the loading hold too, armed and handing nothing
  on, so a stick held through the loading screen onto a screen the welcome opened is no flick, as the buttons' baseline
  is kept through the hold -- and read before the frame's press, as the original arms first (D:L263829-263849). The
  flick is handed on only while the screen owns the pad and no button it reads was pressed this frame.
- The forge lobby's host: its first read after the opening arms and hands nothing on; then as the lobby's.

## 3. The front end's flick, end to end

Research 116 R116.10 is implemented in `ui/src/input/stick.ts` (`MenuStick`) and run by the dispatch
(`ui/src/input/dispatch.ts` `menuDispatch` step 0; the widgets' FALLING bindings, `widgets/button.ts`, and the list,
`widgets/listbox.ts`). It is fed by `viewer/src/menuInput.ts`: the W3C left stick, both axes negated, no dead zone
(`MENU_STICK_READING`). The setup's controller profile sits in front of it (`setupPad.ts` `GamePad`), and at its
default dead zone that profile is the identity (`calibrateStick`).

The new test runs the page's own chain: a standard pad's raw axes, through `GamePad` (as `attachMenuInput` builds it),
`MenuPageInput` and `FrontEndSession`'s `MenuInput`, to the focus of a built three-button dialog:

| raw W3C axes (x right, y down) | the game's (x left, y up) | direction | focus |
|---|---|---|---|
| (0, 0.7) from rest | (0, -0.7) | DOWN | the next control, once |
| held 90 ticks (3 s) | | -- (disarmed) | unchanged |
| (0, 0.3), then (0, 0.7) | | -- (not re-armed: 0.3 > 0.2) | unchanged |
| (0, 0.15) one tick, then (0, 0.7) | | DOWN | the next |
| (0, -0.7) from rest | (0, 0.7) | UP | the previous, wrapping |
| (0, 0.55) held | | NONE (within 0.6) | unchanged |
| (0.7, 0.7) down-right | (-0.7, -0.7) | DOWN (x == y < 0) | the next |
| (0.7, -0.7) up-right | (-0.7, 0.7) | UP (x == -y < 0) | the previous |
| (-0.7, -0.7) up-left | (0.7, 0.7) | LEFT (x == y > 0) | unchanged: LEFT moves nothing by default |
| (-0.7, 0.7) down-left | (0.7, -0.7) | LEFT (x == -y > 0) | unchanged |

On the dev disc (`SOCOM_DISC` / `SOCOM_PC_ROOT`; skipped without it) the same chain walks `dlgOptions_Menu` by the
stick in file order and wraps, as DOWN does. `dlgMenu`'s roller (`OnMenuBtnDown`, FALLING) moves once, on the first
frame, for a stick held 2 s (R116.7). The plan's row also names SOCOM II ONLINE, CREATE GAME and the lobby. Their
dialogs run the same dispatch, and none of them is driven on the disc by this row.

## 4. What is not done, and what is not read

- **The shared ARMORY's other hosts** (§2.4): wired since, the test room's and the menu match's (`matchArmory.ts`, its
  lines in `main.ts` and `matchMount.ts`) and the forge lobby's (`forge/lobby/lobbyArmory.ts`).
- **WEAPON EXCHANGE and the round's Chat menu** read their own pad handling. They are the HUD's (research 94, 233, 301),
  not the dialog dispatch, and not the START menu's code. Whether either reads the stick's floats (+0x220 / +0x224) is
  not read here. Neither reads the menus' flick (§1.2).
- **The in-round ARMORY** does not exist in the original: the ARMORY is reached only from the lobby (research 95 §9).
- **Not measured.** A PCSX2 run would settle the START menu and the ARMORY at the proven level. On the START menu, the
  stick pushed every way, and no move. On the ARMORY, a flick stepping the character and the row, once, and re-armed
  within 0.2.

## 5. Readings and placeholders

| name | where | the reading | what would settle it | status |
|---|---|---|---|---|
| `ARMORY_STICK_ARMING_READING` | `viewer/src/lobbyArmory.ts` | Before the screen opens, the shared ARMORY's stick is armed at every pad read (the match pages' host in the loading hold too). The original arms it at the lobby's unsuspended dispatches only, on one global the lobby shares. While the screen is open it is armed at each read the screen takes input, its suspensions standing in for the dispatch's (D:L262264-262269, R116.9). | A PCSX2 run: the stick pushed in the lobby during a suspension and held into the ARMORY; or the session's `MenuInput.stick` shared with the screen (a `frontEnd.ts` change). | open |
| `ARMORY_STICK_SAME_FRAME_READING` | `viewer/src/lobbyArmory.ts` | A frame with a button the screen reads pressed hands it no flick. The original fires the first binding in the control's file order that matches the buttons or the flick (`FUN_00377040` D:L271888-271930); the two differ when the flick's binding comes first, and when CROSS is pressed with a flick (CROSS goes through the control's vtable +0x74 before the loop, D:L271883-271885, and the flick's binding can still fire). | Transcribing each control's binding order from the disc into the screen's input. | open |

## 6. The tests

- `packages/viewer/test/startMenu.test.ts`. The left stick moves nothing: the W3C pad pushed eight ways through
  `padButtonsDown`, then the d-pad's DOWN moves the cursor. Under ABORT's confirm the stick moves neither YES nor NO.
  Both pass on the code as it was: the port already follows (§1.3).
- `packages/viewer/test/lobbyArmory.test.ts`. The flick is the d-pad press: one step past 0.6, none held, re-armed
  only within 0.2, a press and a flick the same way one step. The diagonals. A stick held from the lobby is no flick,
  and a push held through the commit's 0.5 s suspension steps the row once at its end. The disc's layout (the fixture's
  `RUN/UI/READERC.ZAR`): the d-pad bindings of §2.2, all FALLING.
- `packages/viewer/test/menuInput.test.ts`. The front end's flick end to end (§3's table), and on the dev disc
  `dlgOptions_Menu`'s walk and `dlgMenu`'s roller by the stick.
