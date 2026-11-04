import { NTGUI_RETURN } from './launch';

/**
 * ONL-02 -- EDIT NETWORK CONFIGURATIONS as a desktop-only row (web research 145; OT.R3). The row's hook is PLAT-28's
 * (`ONL_02_HOOKS` in `../desktopScreen/hooks.ts`, appended to `DESKTOP_SCREEN_HOOKS`): CROSS on `configureBtn` opens
 * the desktop-recompilation screen in place of `launchNTGUI2` (`.DINK`, `SwitchMenu(SHUTDOWN)`), and CONTINUE lands on
 * LOGIN with the cursor on the row, nothing of the chain started. This file holds what the task read of the original's
 * own return, which the browser never takes.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The dialog the network GUI hands back to (`SWITCHMENU SHUTDOWN`'s return argument, WAN; research 115, `FUN_0022ea70` D:L80981-81008). */
export const NTGUI_RETURN_DIALOG = NTGUI_RETURN.wan;

/**
 * ONL_02_RETURN_FOCUS_READING: where the original's cursor rests after EDIT NETWORK CONFIGURATIONS returns. A read of
 * `dlgReturnFromNTGUI2.rdr` (`RUN/UI/READERC.ZAR`, 904 B: no control, its one binding ONSTART -> `do_onstart`) and its
 * set (`RUN/UIZANIM.ZAR`): `do_onstart` calls `intro_onstart` (the card check), the HDD block under `HDD_ENABLE`, then
 * `SWITCHMENU(dlgNetLogin.rdr)` -- so LOGIN is built afresh and its own ONSTART decides: `OnLoginRoomstart` ->
 * `OpenCardOne` ends `ActivateButton(login_btn)` when slot 1's card lists a configuration, and
 * `ActivateButton(configureBtn)` after the #578 popup when it lists none (research 144 §6). Replayed on the disc by
 * `netLoginDesktopHook.test.ts`. The browser's return is PLAT-28's (the row kept): the two agree only for a card with
 * no configuration, which OT.R3's first-use write never leaves on slot 1. [reading]
 */
export const ONL_02_RETURN_FOCUS_READING = { configured: 'login_btn', unconfigured: 'configureBtn' } as const;
