# 145 -- EDIT NETWORK CONFIGURATIONS as a desktop-only row: the hook, the return, the cursor (ONL-02)

Written 2026-10-03 for ONL-02 (`../roadmap/05-online-front-end.md` "ONL-02"; the online-path plan
`../plans/2026-10-02-online-path-target.md`, OT.R3: Sony's network set-up program is not built, the row leads to
PLAT-28's screen). Its number was assigned by the controller's brief (notes 140-147 to sprint 11's streams). Sources:
the disc's `RUN/UI/READERC.ZAR` (`dlgNetLogin.rdr`, `dlgReturnFromNTGUI2.rdr`) and `RUN/UIZANIM.ZAR` (their sets),
through the repository's readers (decoded names and sizes only, RS.R8); research 115 (`SWITCHMENU SHUTDOWN`, the
ShutdownState, `FUN_0022ea70` D:L80981-81008), 128 (the online dialogs, R128.3), 142 (PLAT-28's hook API and harness)
and 144 (ONL-01: LOGIN's rows, its ONSTART and its walk), which it does not restate.

The code: `ONL_02_HOOKS` in `packages/ui/src/desktopScreen/hooks.ts` (appended to `DESKTOP_SCREEN_HOOKS`, so the page's
screen -- `packages/viewer/src/menuCommandsHost.ts`, made with the default list -- holds it with no page change);
`packages/ui/src/screens/netLoginDesktopHook.ts` (the return's reading); PLAT-28's rig gains a `uiVars` option
(`packages/ui/src/desktopScreen/harness.ts`) so a task whose rows write variables the dialog's lists follow can run the
harness over them. The test: `packages/ui/test/screens/netLoginDesktopHook.test.ts` (CI on the committed fixtures; its
last two tests on the dev disc). PLAT-28's own list pins (`desktopScreen.test.ts`, `desktopScreenHost.test.ts`) now
name the sixth hook and keep their dlgMenu checks to the five on dlgMenu. Confidence: **reading, pending review**; the
row's look is ONL-01's (research 144 §7, scored with `A_31`), not changed here.

Work done on agent/login after merging agent/desk at 6106b87e (PLAT-28's harness; one conflict, `packages/ui/src/index.ts`,
both export lines kept). No section of note 144 is used: one note per task, as the ledger rules.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R145.1 | **The row is `configureBtn`, its CROSS binding `launchNTGUI2`, bound nowhere else on the dialog** (`bindersOf` answers one binder); `launchNTGUI2` is `.DINK` then `SwitchMenu(SHUTDOWN)` -- the ShutdownState that names the return dialog and `LoadExecPS2`s `SCUSNGUI.ELF` (research 115) | `dlgNetLogin.rdr`, its set | §1 |
| R145.2 | **The hook is one entry of PLAT-28's registry**, `{ task: 'ONL-02', feature: 'EDIT NETWORK CONFIGURATIONS', dialog: 'dlgNetLogin.rdr', control: 'configureBtn', press: 'CROSS', replaces: 'launchNTGUI2' }`, with no `removableBy` (OT.R3: the program is never built). PLAT-28's harness over the real LOGIN with ONL-01's rows passes: the screen at CROSS, drawn in `POPUP`, CONTINUE back on LOGIN with the cursor on `configureBtn`, every valve, UI variable (`NETCNF_DB` among them) and card write as the untouched twin's, `launchNTGUI2` never started; without the hook the same press starts it | `netLoginDesktopHook.test.ts` | §2 |
| R145.3 | **The original's own return does not keep the row**: `dlgReturnFromNTGUI2.rdr` (READERC, 904 B) has no control and one binding, ONSTART -> `do_onstart`, which calls `intro_onstart`, runs the HDD block under `HDD_ENABLE`, then `SWITCHMENU(dlgNetLogin.rdr)`: LOGIN is built afresh and its ONSTART lights `login_btn` when slot 1 lists a configuration, `configureBtn` (after #578) when it lists none (`ONL_02_RETURN_FOCUS_READING`) | the set; ONL-01's ONSTART on the disc | §3 |

## 1. What the original does at the press

`dlgNetLogin.rdr`'s `configureBtn` (`_567_EditNetwork_MSG`, the fourth row; its ONACTIVATE `OnConfigureactive` writes
the help line #583 and stops the card-removal watch, research 144 §6) binds CROSS to `launchNTGUI2`, decoded from
`RUN/UIZANIM.ZAR` set `dlgNetLogin.rdr`: a `.DINK` sound, then `SwitchMenu(SHUTDOWN)`. Research 115's row for
`SWITCHMENU SHUTDOWN` (`FUN_0022ea70` D:L80981-81008) has the ShutdownState set the return dialog
(`dlgReturnFromNTGUI2.rdr`, or the LAN one by `FUN_003045b0(0x44fe10)`: `NTGUI_RETURN_LAN_PLACEHOLDER`) and exec
`cdrom0:\SCUSNGUI.ELF` -- Sony's network configuration program (N18), which this port does not build (OT.R3).

## 2. The hook and its check

PLAT-28's API (research 142 §2): the hook is appended as its own array to `DESKTOP_SCREEN_HOOKS`, the list the page's
`DesktopScreen` is made with by default; the gate is told the binding's start (dialog, design, animation), and on
`dlgNetLogin` `launchNTGUI2` has one binder, so nothing else on LOGIN opens the screen.

The check is PLAT-28's `checkDesktopHook` over `desktopHookRig` started on `dlgNetLogin.rdr`, with ONL-01's
`NetLoginCommands` registered through the rig's `register` over the rig's own UI variables (the new `uiVars` option:
without it `NETCNF_DB` would be written into a manager the lists and `TestUIVar` do not read, and LOGIN would take its
no-configuration branch), a fake eznetcnf with one combination on `mc0:` (the page's card after OT.R3's first-use
write) and both ports inserted and formatted. Settle 120 ticks (ONSTART's 93, research 144 §6); the walk is the
player's, three DOWNs from LOGIN; then CROSS, the notice, CONTINUE. Held: no failure; the bound animation
`launchNTGUI2`; the row reached, the screen shown and drawn, closed; the dialog `dlgNetLogin.rdr` and the focus
`configureBtn` after; the state equal to the twin's and the card unwritten; no row dispatched beside the twin's.
The control test removes the hook and sees the same press start `launchNTGUI2`. The mutation (the hook dropped from
`DESKTOP_SCREEN_HOOKS`) fails the list test and the harness test.

The rig's one manager (the review's finding 1): the dialog's widgets (`DialogPartsHost`) take the manager the rig's rows
write -- the option's, else the rig's own -- and `register` is handed it as its third argument, so a later task's rows
need not pass the option for its lists to follow them. Held by a test without the option that reads the widget, not the
manager: `COMBOLIST`'s items are `["1", "Setting 1"]` after the settle (before the fix: none, the list following
nothing while `state().uiVars` still showed `NETCNF_DB`). The rig answers `widget(name)` for that read.

**The acceptance's cursor is PLAT-28's**: "returning lands on LOGIN with the cursor on EDIT NETWORK CONFIGURATIONS" is
what CONTINUE does -- the notice closes over the dialog it opened on, and nothing rebuilds it.

## 3. The original's return (`dlgReturnFromNTGUI2`, the block's unknown)

The block's unknown was "where the original's cursor sits after `dlgReturnFromNTGUI2` -- a read of that set (904 B)".
The 904 B is the dialog file in `RUN/UI/READERC.ZAR`; its set in `RUN/UIZANIM.ZAR` is 362 bytes under its key, one
animation, 11 names. Read:

| what | read |
|---|---|
| the dialog | 0 objects, 0 controls; `scripts` `dlgReturnFromNTGUI2.rdr`, `uianim.rdr`, `UIMemCardAnim.rdr`; an empty background file; the screen's one binding `ONSTART` -> `do_onstart` |
| `do_onstart`, in order | `call intro_onstart` (blocking); `IF HDD_ENABLE == 1`: `hard_disk_error_code = 0`, `IF HardDriveOperation(OPEN)`: `HardDriveOperation(GET_MISSION_DATA)`, on an error code `call DisplayHDDError` and `HDD_ENABLE = 0`; `ELSE` `call DisplayHDDError`, `HDD_ENABLE = 0`; then `SWITCHMENU(dlgNetLogin.rdr)` |

So the original's cursor after the return is not kept from before the reboot (the program was a separate ELF; the game
restarted): it is wherever `dlgNetLogin`'s own ONSTART leaves it. `OnLoginRoomstart` -> `OpenCardOne` ends
`ActivateButton(login_btn)` when `NetCnfOpen(mc0:)` lists a configuration, and, when it lists none, raises #578 and at
CONTINUE `ActivateButton(configureBtn)` (with LOGIN and SELECT disabled). Both replayed on the disc with ONL-01's rig
(`netLoginDesktopHook.test.ts`, the last two tests). That is `ONL_02_RETURN_FOCUS_READING`.

**Where it differs from the acceptance.** With a configuration on slot 1 -- the only state OT.R3's first-use write
leaves -- the original would come back with LOGIN lit, not EDIT NETWORK CONFIGURATIONS. The port's return keeps the
row because the original's return never happens: no reboot, no ELF, PLAT-28's notice closes in place (the harness's
"CONTINUE back to the same row"). The block's acceptance is met as written; the difference is the controller's and the
owner's to rule should the return be made to look like the original's (rebuild LOGIN: `SWITCHMENU(dlgNetLogin.rdr)`
at CONTINUE instead of closing in place).

**Not replayed: `intro_onstart` before the switch.** With two cards and no loaded configuration (`memcard_have_loaded_config`
0, `memcard_already_selected` 0, `num_memcards` 2) it raises UIMemCardAnim's slot popup (`A_30`, research 128 R128.3)
and, at Slot 1, reaches `IsSpaceForSaveGameFile` (OPT-05a's row, not on this branch: "not implemented"). The whole
return path from the dialog's ONSTART is owed to OPT-05i's (chain C, merged on agent/online) and OPT-05a's rows; the
browser never takes it under OT.R3.

## 4. What the page gets

Nothing to wire: `connectMenuCommands` makes `DesktopScreen` with the default list and sets it as the host's binding
gate, so `?menuflow` -> ONLINE -> LOGIN -> EDIT NETWORK CONFIGURATIONS -> CROSS shows the notice on the page.
`desktopScreenHost.test.ts`' count (`desktop.hooks.all()` equal to `DESKTOP_SCREEN_HOOKS`) now counts six, and it runs
the hook over the page's own pieces (the review's finding 2): PLAT-25's slot store, PLAT-26a's libmc and
`connectNetLogin` (`packages/viewer/src/netLoginHost.ts`) registered through the rig's `register` -- LOGIN's ONSTART
makes OT.R3's first-use write on slot 1 in both rigs, CONTINUE lands on `configureBtn`, both slots' records byte for byte
as the twin's (the `BWNETCNF` folder among them) and `NETCNF_DB` set. No browser run was made (the notice's look is PLAT-28's, its frame owed there, H78).

## 5. Placeholders and readings

| name | stands for | searched / reading | status |
|---|---|---|---|
| `ONL_02_RETURN_FOCUS_READING` (`ui/src/screens/netLoginDesktopHook.ts`) | where the original's cursor rests after EDIT NETWORK CONFIGURATIONS returns | `dlgReturnFromNTGUI2`'s `do_onstart` ends `SWITCHMENU(dlgNetLogin.rdr)`; LOGIN's ONSTART decides (`login_btn` with a configuration, `configureBtn` without); replayed from the switch on; `intro_onstart` before it not replayed (§3) | open: a console capture of the return from `SCUSNGUI.ELF` (s4's `A_29_backtogame` -> `A_30` -> `A_31` has LOGIN lit, consistent; one frame per step would settle it) |

Reused, not added: research 115's `NTGUI_RETURN_LAN_PLACEHOLDER` (which return dialog SHUTDOWN names), research 142's
`DESKTOP_SCREEN_TEXT_PLACEHOLDER` (the notice's sentence, H78).

## 6. Settled, not settled, owed

- **Settled (reading, pending review):** the row's binding and its chain (§1); the hook registered with PLAT-28's API
  and held by its harness over the real LOGIN (§2); the read of `dlgReturnFromNTGUI2` (§3).
- **Owed:** the return path's `intro_onstart` replay (OPT-05i / OPT-05a's rows, §3); a ruling on whether CONTINUE should
  rebuild LOGIN as the original's return does (§3); the notice's frame (PLAT-28, H78). The LAN twin
  (`dlgReturnFromNTGUI2LAN`, 920 B in READERC) is the paused LAN plan's (OT.R5).
- **Where the sources disagree:** the block's acceptance (the cursor on EDIT NETWORK CONFIGURATIONS after the return)
  and the original's return (LOGIN lit when a configuration is loaded); §3.
