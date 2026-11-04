# 142 -- The desktop-recompilation screen, its hooks and its harness (PLAT-28, MENU-03, MENU-08)

Written 2026-10-03 for PLAT-28 (`../roadmap/01-platform.md` "PLAT-28"), MENU-03 and MENU-08 (`../roadmap/03-menus.md`;
OT.R5 of the online path's plan, `../plans/2026-10-02-online-path-target.md`: "NEW GAME and LOAD GAME (MENU-03, already
ruled), OPTIONS, EXTRAS, and the LAN item (the LAN plan is paused) each open PLAT-28's screen. ONLINE is the one live
branch."). Its number was assigned by the controller's brief (notes 140-147 to sprint 11's streams). Sources: the
disc's `RUN/UI/READERC.ZAR` (`dlgMenu.rdr`'s controls and bindings), `RUN/UIZANIM.ZAR` (its sets and the POPUP
records), `RUN/READERC.ZAR` (`fonts.rdr`) and the UIMnLOC strings, through the repository's readers (decoded data,
RS.R8); MENU-01a's pin `tools/test/menuEntryCommands.pinned.json` (research 138); the retail decompilation
`socom2_game.elf.decomp.c` (`D:L<line>`, cited, never pasted), through the lines research 115, 116, 117 and 118 already
cite; research 96 §3 (the main menu's CROSS targets).

The code: `packages/ui/src/desktopScreen/` -- `hooks.ts` (the hook, the registry, MENU-03's and MENU-08's five),
`notice.ts` (the sentence, the record), `desktopScreen.ts` (the screen as a binding gate), `harness.ts` (the per-hook
harness and its rig); the gate in PLAT-08's host (`packages/ui/src/uiCommands.ts`: `UiBindingStart`, `UiBindingGate`,
`UiCommandHost.setBindingGate` / `bindingStart`), asked by the dialog's scripts (`packages/ui/src/screens/screenScripts.ts`
`startBinding`, which now knows its dialog's name from `frontEndMachine.ts`); the page's connection in
`packages/viewer/src/menuCommandsHost.ts`. The tests: `packages/ui/test/desktopScreen/desktopScreen.test.ts` (CI, a
hand-built main menu), `packages/ui/test/desktopScreen/desktopScreenFixtures.test.ts` (the real `dlgMenu` on the disc
or the committed fixtures: CI runs it), `packages/viewer/test/desktopScreenHost.test.ts` (the page's card slices).

Confidence. The screen is **a browser adaptation**: PLAT-28's block, "What the original does: none -- this screen is
the owner's mandate". Its sentence and its look are **placeholders** for the owner's approval (§7, H76). The notice's
chrome is a **reading** of the disc's own record (held field for field by the fixtures test), not yet compared with a
frame (owed: §5); its place is the original's rule (§3a, checked against `A_05` on another record). The hooks'
bindings are readings of the disc held to MENU-01a's pin. Pending review.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R142.1 | **The five hooked items are bindings, not table rows**: the main menu's CROSS starts an animation -- `new_game_button` -> `UiprepMission1`, `load_game_button` -> `MainMenuOnLoad`, `options_button` -> `CallOptions`, `Extras_button` -> `CallExtras`, `LAN_button` -> `go_to_LAN_play` -- four of which open on `SuspendMenuInput 1.75` and switch (`ClearCareerStats` then `SWITCHMENU dlgSelectRank.rdr` for NEW GAME; `SWITCHMENU` to `dlgOptions_Menu`, `dlgNetUnlockableExtras`, `dlgMPswitch` for the others), LOAD GAME's on `BackgroundMPEG OFF` and `POPUPDIALOG`. None of the five names is a row of the table at 0x3dd4d0; `ListSavedGames` (0x2801c0) is, and no hooked animation dispatches it | the disc; the pin | §1 |
| R142.2 | **The hook sits where the binding's animation would start**: a gate in PLAT-08's host that the dialog's scripts ask first (`UiCommandHost.bindingStart`), so the hooks need no drawn menu and take every path a binding is started by (the focused button's input, the screen's bindings, an event). A taken start is "found" (the dispatch ends, as on a started binding, D:L271915-271926) and the animation is never started: not one command of its chain reaches the host | `uiCommands.ts`, `screenScripts.ts` | §2 |
| R142.3 | **The notice's chrome is the main menu's own one-button popup**: `dlgMenu.rdr` `LoadGameOnListBox`'s record over UIMnLOC 517 -- `popupOp.tif` at (150, 180), 340 x 120, the text at +25 / +45 in colour 128, one button `active_back.tif` / `pop_butt.tif` at (125, 80), 85 x 25, labelled UIMnLOC 226 "CONTINUE" (offset 15, 25; colours 91,72,36 / 128 / 102,87,38; scale 0.9) -- its text replaced by `DESKTOP_SCREEN_TEXT_PLACEHOLDER` | `notice.ts`; fixtures test | §3 |
| R142.4 | **Nothing of the game's is written**: the notice is its own `Popup` in the dialog's `POPUP` node, its answer valve in its own store; M's popup object is set aside and handed back untouched (and ticked meanwhile); opening is `PopUpDialog`'s (the node shown, `.METAL`, the type-3 record queued and consumed with no effect) | `desktopScreen.ts` | §3 |
| R142.5 | **The harness measures "unchanged" against an untouched twin**, because the menu's own scripts keep running under the notice (`has_memcard_changed` writes `mc_changed_slot` every 1.5 s): after the press and CONTINUE, every valve, UI variable, the card's whole content, M's queue and history, the career record, the dialog, the focused row and the `POPUP` node's place equal the twin's; no row is dispatched that the twin did not dispatch | `harness.ts` | §4 |
| R142.6 | **On the real `dlgMenu` all five hooks pass on both card states**, M3's two orders reached by the menu's own DOWN: empty card `new_game_button > multiplayer_button > LAN_button > options_button > Extras_button > load_game_button`; a card with a counted save `load_game_button` first (`GotSaveGames` 1) | fixtures test | §5 |
| R142.7 | **The notice sits at its record's place, (150, 180) of the 640 x 448 screen, as every popup of the original does** (added 2026-10-04, POPUP-PLACE): a record on `POPUP` moves the node to its +8 / +12 and the draw starts there; nothing centres it. The page drew it at the origin (the record applied to the bare popup before the attach, the node never placed); fixed, the node's place handed back at the close | `FUN_0036da20` D:L266844-266848, `FUN_00370690` D:L268434-268444; `A_05` | §3a |

## 1. What the original does at the five presses

`dlgMenu.rdr`'s 38 bindings (MENU-01a's pin): each of the six items binds CROSS to one animation of the dialog's own
set; DOWN / RIGHT to `OnMenuBtnDown` and UP / LEFT to `OnMenuBtnUp`. The five the brief hooks, decoded from
`RUN/UIZANIM.ZAR` set `dlgMenu.rdr`:

| item | control | CROSS starts | its commands, in order |
|---|---|---|---|
| NEW GAME | `new_game_button` | `UiprepMission1` | `SuspendMenuInput 1.75`, `ClearCareerStats`, `SWITCHMENU dlgSelectRank.rdr` |
| LOAD GAME | `load_game_button` | `MainMenuOnLoad` | `BackgroundMPEG OFF`, `POPUPDIALOG` with the record 512; then, by its conditions, `ActivateButton` / `EnableButton SavedGames` and `KillPopup`, or `POPUPDIALOG` with 513 / 514 over `CannotLoadNoFormat`; `BackgroundMPEG ON` (research 118 §7) |
| OPTIONS | `options_button` | `CallOptions` | `SuspendMenuInput 1.75`, `SWITCHMENU dlgOptions_Menu.rdr` |
| EXTRAS | `Extras_button` | `CallExtras` | `SuspendMenuInput 1.75`, `SWITCHMENU dlgNetUnlockableExtras.rdr` |
| LAN | `LAN_button` | `go_to_LAN_play` | `SuspendMenuInput 1.75`, `SWITCHMENU dlgMPswitch.rdr` (then LOGIN with `ComeFromLan` 1, research 138 §3) |

The button's input (`FUN_00377040` D:L271859-271945) presses on CROSS and starts the first `BUTTON` binding whose
state matches, ending the dispatch "found or not" (D:L271915-271926). `ListSavedGames` is not in `MainMenuOnLoad`: it
is reached through the card chain (research 138 §1, `CARD_SCREENS`); the acceptance names it, and the LOAD GAME hook
carries it in `chain` so the harness checks it is never dispatched.

## 2. The hook point

The brief asked for the hooks at PLAT-08's command host so they need no drawn menu. The items are bindings, not rows
(R142.1), so a row handler cannot replace them: `UiCommandHost.setHandler` keys rows of the table, and the first
commands they run (`SuspendMenuInput`, `SWITCHMENU`) serve every other item too. The nearest correct point is the
binding's start, owned by the host as a **gate** (a browser adaptation, no row): `UiCommandHost.setBindingGate(owner,
gate)` and `bindingStart({ dialog, design, animation, argument })`; `screenScripts`' `startBinding` -- the one path of
a button's, the screen's and an event's binding (PLAT-11's dispatch through the widget host, PLAT-21's events) --
asks it before it looks the animation up. The machine passes the dialog's name to the scripts (`build(design, name)`).

A hook is `(dialog, control, press)` plus the animation the disc binds there (`replaces`). The registry matches a start
by the **design the front end built**: the control's `BUTTON <press>` binding's animation (`boundAnimation`); so a hook
follows the disc, and the harness fails a hook whose design binds another animation than `replaces`.

**A hook is effectively per (dialog, animation).** The gate is told the binding's start (dialog, design, animation),
not the control pressed, so `match` keys on the animation: any other start of it on that dialog -- another control's
binding, another press, a screen event, a checkbox's ONCHECK -- would open the screen too. `bindersOf(design,
animation)` lists every binding of an animation in a design, and the harness fails a hook whose animation has another
binder (`shared`, its failure naming the binder). On `dlgMenu.rdr` each of the five animations is bound once (MENU-01a's
pin; the fixtures test asserts `shared` empty on the disc's design), so nothing changes there; a later dialog that binds
one animation twice must hook every binder deliberately or not hook it.

**How a later task registers a hook** (ONL-02's EDIT NETWORK CONFIGURATIONS, OPT-17, BOOT-09):

1. One entry `{ task, feature, dialog, control, press, replaces, chain?, removableBy? }` (`DesktopScreenHook`): either
   an array of its own appended to `DESKTOP_SCREEN_HOOKS` in `packages/ui/src/desktopScreen/hooks.ts` (as
   `MENU_03_HOOKS` and `MENU_08_HOOKS` are), which the page's screen is made with, or at run time on the page's screen:
   `connectMenuCommands(...).desktop.hooks.register(hook)`.
2. One test: `expect(checkDesktopHook(() => desktopHookRig({ dialog, sets, startDialog, card, cardState, register }),
   hook).failures).toEqual([])` -- `register: (host, machine) => host.setHandler(name, body)` adds the rows the
   dialog's own scripts need (ONL-01's for LOGIN); it is called after MENU-01a's rows are in, so a later body replaces
   theirs (held by the test "a later task's rows (`register`) go in after MENU-01a's"). Write the hook's test against a
   literal of the hook (control, animation), not a loop over the list, so dropping the hook fails its test.
3. A hook is removed (`hooks.unregister(dialog, control, press)`) when its screens run: OPTIONS by OPT-09, EXTRAS by
   MENU-04 (`removableBy`). *2026-10-07:* OPTIONS' is unregistered by Chris's settings at the front end's session start
   (`frontEnd.ts`; web research 302 §4): CROSS on `options_button` runs `CallOptions` to `dlgOptions_Menu.rdr`, whose
   rows not built are parked there (OT.R8). NEW GAME, LOAD GAME, EXTRAS and LAN keep the notice.

## 3. The notice

**The record.** Of the 75 records the offline front end raises (research 118 §7), the main menu's own one-button one is
`LoadGameOnListBox`'s over 517 ("No saved game in that slot. Load will be aborted. CONTINUE."): one CONTINUE button,
the popup the player meets on LOAD GAME's own path. Its fields are taken whole (`DESKTOP_SCREEN_RECORD`; the fixtures
test reads the record off the disc and compares every field but the name indices, which point into the notice's own
table `DESKTOP_SCREEN_NAMES`). The text is the record's literal (`textId` 0) and names the sentence. The button's label
is UIMnLOC 226 through the dialog's own text source; the record's `labelName` is unused when the id is set
(`FUN_0036da20`, research 118 §2) and is 0 here (the disc's points at an unrelated name of its animation).

**Opening and closing.** The screen asks the dialog's popup slot for a fresh popup (`PopupSlot.make`, PLAT-16's
context: the face, the font, the texts) and builds the notice's own `Popup` over it with a valve store of its own, no
UI variables and its own names; the record is applied (`Popup.command`), the notice's `SlotPopup` attached to the
dialog's `POPUP` node, M's object (`MenuQueue.popupObject`) set aside, and `MenuShell.popUp` shows the node and plays
`.METAL` as `PopUpDialog` does (`FUN_0027eff0` D:L126862-126904; its type-3 record is consumed with no effect,
`POPUP_NAME_UNUSED_READING`). While it shows, PLAT-11's dispatch gives it the pad alone (`FUN_00368650`
D:L263850-263855); CROSS on CONTINUE writes its private valve, closes it (`keep` 0) and plays `SELECTION`
(D:L268488-268512); M's object is handed back. A6 ticks the notice and M's set-aside object
(`FUN_003654c0` D:L262348-262350, "shown or not"). Three ways back for the game, each handing M's object back: a
`KillPopUp` hiding the node (seen at the next A6), a script's record on `POPUP` (forwarded to M's popup after the
hand-back), a switch's unload (M's object destroyed, `FUN_0027ef10` D:L264301-264308: the notice goes with it).

## 3a. The place (added 2026-10-04, POPUP-PLACE)

The owner's report (2026-10-04): the notice "positioned top right stuck there" -- clarified by him the same day: "it
was not stuck - just rendered top left when it should be centered", which is what was reproduced. Reproduced in headless Chromium at
960 x 672 and 1920 x 1080 on `?devmode&menuflow=dlgMenu.rdr`: the panel at the 640 x 448 frame's top-left corner, over
the logo (at 1920 x 1080 the frame is pillarboxed, so the corner sits left of centre; no window size tried put it on
the right). "Stuck" did not reproduce: CONTINUE by Enter and by a tap (a tap while the popup shows is CROSS,
`MENU_TOUCH_READING`) closed it at every size, before the fix as after, the focus back on NEW GAME.

**What the original does.** A popup's place is its record's. The record handler `FUN_0036da20` finds the command's
node (`FUN_0026f4e0`) and, when its name is `POPUP` (0x3f9130), moves it to the record's +8 / +12 through
`FUN_003157d0` (D:L266844-266848). The draw `FUN_00370690` starts from the node's place: the panel quad from (0, 0) to
(w, h) under it (D:L267156-267157, drawn D:L268434), each button at the node's place plus its own (D:L268437-268444),
the text at the node's place plus the record's offsets (D:L268446-268453) -- research 118 §3. Nothing centres a popup
or offsets it by the dialog's place: the node is a child of the foreplane (D:L263666-263688), unscaled at the frame's
origin. Record 517 therefore draws its panel at (150, 180) to (490, 300) -- centred on x only because 150 + 340 / 2 =
320 -- and CONTINUE at (275, 260), 85 x 25. Behind it the dialog is left as it is: the popup takes the pad alone while
its node shows (`FUN_00368650` D:L263850-263855), the focus is told the popup shows (A8, D:L262357-262360,
`POPUP_FOCUS_READING`), and any dimming is the script's own `MENUFADER` fade before its `PopUpDialog`, never the
popup's (research 118 §3, "Draw order"). The hooked animations raise no popup in the original, so the notice dims
nothing: the menu behind it, NEW GAME lit, as the original leaves a dialog under its popup.

**The check against a console frame.** No capture of record 517 or of any popup over `dlgMenu` exists (§5). The one
console frame of a `popupOp.tif` popup archived is `logs/parity/s4_pcsx2/A_05_online.png` (PCSX2, LOGIN with slot 1
holding no configuration, #581 up). Reached by the original's own path on the disc (`tools/test/popupPlaceScore.test.ts`:
`OpenCardOne` on an empty `mc0:`, the record applied by the script through `SlotPopup.command`), its node is at the
record's (150, 100) and its panel drawn there, 340 x 280. Scored through `tools/captureScore.ts` with the 4:3
correction: the whole frame **95.2** (control 78.0, matched; 95.1 until FOCUS-RING, 2026-10-03, drew LOGIN's title
under the dimmed screen as `A_05` has it, research 116 §17.5), the panel band alone **87.4** (control 38.2, not matched:
twelve lines of dense glyphs through the correction's vertical resample, block 0.204 -- not the place). Moving our frame
lowers the band's score at every move tried (10 px left, right, up, down: 78.7, 79.3, 79.2, 77.8; 2 px left, right,
down: 83.9, 85.2, 84.9) but 2 px up (87.8, inside the 448 -> 480 resample's one-row rounding): the console's popup sits
at its record's place to within 2 px, the rule the notice now follows.

*(Corrected 2026-10-05, ONL-07, research 157 §8.)* The band's 87.4 was not the resample: the popup's text was drawn at
alpha 128, white, where the original gives each line its face's opacity (`FUN_00362b20`, D:L273492) and `A_05` shows
it at the body text's level. With that read the whole frame scores **99.8**, the panel band **99.6** (matched), and
every move scores lower -- 10 px left, right, up, down: 91.3, 91.3, 92.9, 90.6; 2 px left, right, down: 95.8, 95.8,
97.6; 2 px up: 97.6. The record's place is the best outright.

**Why the page drew it at the origin.** The game's path applies a record through `SlotPopup.command`, which writes the
popup's place to the node it is attached to; `SlotPopup.drawIn` reads the place back from the node at each draw. The
screen applied its record to the bare `Popup` (`popup.command`) **before** the slot was attached, so the node kept its
build place (0, 0) and the draw overwrote the record's place with it. The fix is in `desktopScreen.ts`: the notice's
slot places the node as `FUN_0036da20` would (`NoticeSlot.place`), and hands the node's previous place back when the
notice closes by any of its three ways (`NoticeSlot.unplace`), so M's popup draws where its own last record put it --
nothing of the dialog's is written. The harness compares the node's place with the twin's (`popupPlace`): a notice that
kept the node moved fails every hook. LOGIN's popup (ONL-01's, scored against `A_06`) takes the game's path and was
already placed right.

## 4. The harness

`checkDesktopHook(make, hook)` builds two rigs (`desktopHookRig`: PLAT-10's machine, PLAT-11's input, PLAT-15/16's
parts, MENU-01a's rows over a `MenuCardIo`, the screen; a seeded generator), lets both settle 90 ticks (3 s: the main
menu's ONSTART, `SetMenuValve`, the first card polls), walks both to the row with DOWN presses (8 ticks apart, past
`OnMenuBtnDown`'s 0.15-s suspend), then presses the hook's button on one and leaves the other for the same ticks,
holds 15 ticks, presses CROSS (CONTINUE) and runs 15 more. It fails on: the design's binding missing or not
`replaces`; the row not reached; the notice not up after the press or not drawn (`popupOp.tif` in the `POPUP` node's
items); CONTINUE not closing it; any part of the state differing from the twin's; the dialog or the focus moved;
`replaces` or a `chain` name dispatched or started; any row dispatched that the twin did not; another binding of the
hooked animation in the design (`shared`, §2).

The control runs (no gate) fail all five on the hand-built menu, the chain started; a hook whose `replaces` is wrong
fails with the design's binding named.

## 5. Runs

| test | kind | what |
|---|---|---|
| `desktopScreen.test.ts` | unit (CI) | the registry and the five hooks held to the pin; the record round-trip and the applied notice; the gate on the host interface: with it none of `UiprepMission1`, `MainMenuOnLoad`, `ListSavedGames`, `CallOptions`, `CallExtras`, `go_to_LAN_play` is dispatched or started, without it they are; the harness on each hook over a hand-built menu (the five written out, not read from the list), its control and its wrong-binding case; ONLINE still switches; the rig's `register` after MENU-01a's rows; a shared animation named and failed (`bindersOf`, `shared`) |
| `desktopScreenFixtures.test.ts` | the real `dlgMenu` (disc or committed fixtures; CI runs it) | the template record field for field and 226 = "CONTINUE"; M3's two first rows; the harness on all five hooks (written out) on an empty card and on a card with a counted save, none of the five animations bound twice; the drawn notice at NEW GAME: `popupOp.tif` at (150, 180) 340 x 120, CONTINUE at (275, 260) 85 x 25, CONTINUE closing it with NEW GAME focused (§3a; red on 23bb1015 with the panel at (0, 0)) |
| `tools/test/popupPlaceScore.test.ts` | the disc and `SOCOM_PC_ROOT`'s `A_05` (skips without) | the original's own popup path on LOGIN: #581's node and panel at its record's (150, 100); the frame against `A_05` 95.2 whole, 87.4 the panel band, the band lower at every move but 2 px up (§3a) |
| `desktopScreenHost.test.ts` | the page's connection (viewer) | `connectMenuCommands` sets the gate; the harness on all five over PLAT-25's slot store and PLAT-26a's libmc: both slots' records byte for byte as the twin's |

A browser (2026-10-04, POPUP-PLACE; §3a): the page's own dev server, `?devmode&menuflow=dlgMenu.rdr`, CROSS on NEW
GAME at 960 x 672, 1280 x 720 and 1920 x 1080: the panel at the frame's (150, 180) at each size (the frame letter- or
pillarboxed in the window), CONTINUE by Enter and by a tap on the button closing it, NEW GAME focused after; the
screenshots are scratch, not committed. Not run: the chrome against a frame -- no capture of record 517 exists (research 118 §8 measured three other
records on the recompiled game), so it is owed to the golden manifest's `state.load-game-empty-slot-popup` (OPT-19's
window, H25).

## 6. On the page

`connectMenuCommands` (`packages/viewer/src/menuCommandsHost.ts`, MENU-01a's connection, called once by the session in
`frontEnd.ts`) now also makes the screen and sets its gate, and answers it as `desktop`: under `?menuflow` CROSS on the
five items opens the notice in the drawn menu with no change to `frontEnd.ts` (a hot file this task does not own).
The notice's `.METAL` is the page's `playMetal` (PLAT-23's popup cue), its `SELECTION` the parts' popup host.

## 7. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `DESKTOP_SCREEN_TEXT_PLACEHOLDER` | "available in the desktop recompilation or with emulators" | no LOC string of the disc says it (PLAT-28 "Gap"); the block's own words | the owner's wording (H76) |
| `DESKTOP_SCREEN_LOOK_PLACEHOLDER` | the main menu's one-button record 517 whole, its text replaced, opened as `PopUpDialog` opens a popup | the least-invented option the block names (`popupOp.tif` POPUPDIALOG chrome); the owner signs the look off | the owner's look (H76); the chrome scored against a frame of record 517 (`state.load-game-empty-slot-popup`, OPT-19) |

## 8. What is not done, and where the sources disagree

- **The per-feature list** (HDD, 480p, Dolby Pro Logic II, the headset, vibration, `RebootIOP`, the network GUI) is the
  owner's (H16, H76); only the five items OT.R5 rules are hooked. ONL-02's EDIT NETWORK CONFIGURATIONS registers later
  (§2).
- **The attract timer runs under the notice**: `UiStopAttract`'s 120-s idle WAIT is the menu's own script and the notice
  does not reset it, so a notice left open past it ends in the attract cinematic's switch (the notice goes with the
  unload, §3). Whether the original's idle counts a popup as input was not read; the hooks open no popup in the
  original, so there is nothing to match.
- **The button's own pressed look**: CROSS presses the item's button before its binding (`FUN_00377040`,
  D:L271859-271945; PLAT-15's `ButtonWidget.input`) on the
  hooked press as on the original's; the look is not a valve and the harness does not compare it.
- **The brief's "the first command each CROSS runs"**: the five bindings' animations are what the hook replaces (R142.1);
  their first commands (`SuspendMenuInput`, `BackgroundMPEG`) are shared rows and are not touched.
- **`ListSavedGames`** is not on `MainMenuOnLoad`'s path (§1); MENU-03's block lists it with the chain, so it is
  checked, but no hooked press could reach it.
- The proven level is not reached: no frame of the notice or of record 517. The place is checked on another record
  (#581 against `A_05`, §3a), whose panel band scores 87.4 for its text, not its place. *(99.6 since 2026-10-05:
  §3a's correction.)*
- **The owner's "top right"** (§3a) was his slip for top left, and "stuck" withdrawn (his clarification, 2026-10-04).
  His "centered" is met across only, as the original has it: the record's panel is centred on x (150 + 170 = 320) and
  sits 16 rows under the frame's middle (180 + 60 = 240 against 224) -- the record's own place, kept by the parity rule.
- **The ledger** (§7): POPUP-PLACE adds and retires no placeholder or reading; the place is the record's, not a
  reading.
