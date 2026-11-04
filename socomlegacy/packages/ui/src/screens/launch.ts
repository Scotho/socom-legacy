import type { UiVarManager } from '../uiVars';

/**
 * Leaving the game (PLAT-10; web research 115 §9): `SWITCHMENU REBOOT` relaunches the game's own ELF on a start dialog
 * (`FUN_0022ed10` D:L81077-81096; the call at 0x22ED54, PC research 78 §0, KNOWN [logoff-relaunch]) and `SWITCHMENU
 * SHUTDOWN`'s state launches the network setup GUI, which returns to the game on a dialog of its own (`FUN_0022ea70`
 * D:L80981-81008). Both go through `LoadExecPS2` with an argument block; the game reads `--menu_state` back at boot
 * (`FUN_001eabd0` D:L49976-49996 registers it; its handler 0x1eace0 copies the value into MS+0x30).
 *
 * The strings are the ELF's (read through its program headers): 0x3e5c60 and 0x3e5ba0 the ELFs, 0x3dc9d0 and 0x3dc9c0
 * the argument tables, 0x3e5b80 / 0x3e5b60 the two return dialogs. The `host0:` variants (a development boot,
 * `DAT_0049e2cd` clear) are not modelled: the browser runs the disc's game.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/**
 * What the game's main registers in the UI variable manager (0x437e80) before the first frame (D:L47860-47876: after
 * the game object's construction and CG's first request, before the loop): `VERSION_STRING` (the name at 0x3e17c8,
 * `FUN_003857c0(.., name, 0, 2)`) set to the build string at 0x3e17e0 (`FUN_003862a0`) -- the retail ELF's
 * `SOCOM 2 r0001 17:22:21 Oct 11 2003`, which the main menu's `VERSION` text (`UIVAR VERSION_STRING`, research 96 M1)
 * shows under the legalese. The longevity word is the call's 2.
 */
export const MAIN_UI_VARS = [{ name: 'VERSION_STRING', value: 'SOCOM 2 r0001 17:22:21 Oct 11 2003', longevity: 2 }] as const;

/** `MAIN_UI_VARS` registered in the game's one manager, as the main does (`add`, then the string set). */
export function registerMainUiVars(uiVars: UiVarManager): void {
  for (const v of MAIN_UI_VARS) uiVars.set(uiVars.add(v.name, null, v.longevity), { type: 'string', value: v.value });
}

/** A `LoadExecPS2` call: the ELF and its arguments. */
export interface Launch { elf: string; argv: string[] }

/** The game's ELF on the disc (0x3e5c60). */
export const GAME_ELF = 'cdrom0:\\SCUS_972.75;1';
/** The boot option that names the start dialog (`FUN_001eabd0`). */
export const MENU_STATE_OPTION = '--menu_state';

/** `FUN_0022ed10` from the disc: three arguments (0x3dc9d0). */
export const REBOOT_LAUNCH: Readonly<Launch> = { elf: GAME_ELF, argv: [MENU_STATE_OPTION, 'dlgAfterErrorReboot.rdr', ''] };

/** The network GUI's return dialogs (0x3e5b80, 0x3e5b60), picked by `FUN_003045b0(0x44fe10)`. */
export const NTGUI_RETURN = { wan: 'dlgReturnFromNTGUI2.rdr', lan: 'dlgReturnFromNTGUI2LAN.rdr' } as const;
/** The network setup GUI's ELF (0x3e5ba0). */
export const NETWORK_GUI_ELF = 'cdrom0:\\SCUSNGUI.ELF;1';

/**
 * NTGUI_RETURN_LAN_PLACEHOLDER: which return dialog `SHUTDOWN` names -- `FUN_003045b0(0x44fe10)`'s answer (the LAN one
 * when non-zero) was not read. False (the WAN dialog) stands in. [placeholder]
 */
export const NTGUI_RETURN_LAN_PLACEHOLDER = false;

/**
 * NETWORK_GUI_PLACEHOLDER: `SHUTDOWN` launches `SCUSNGUI.ELF`, Sony's network setup GUI, which has no browser
 * counterpart; the owner's call (research 115 §9). Until then the browser behaves as if the GUI returned at once: the
 * game is relaunched with the arguments the GUI is handed for its return (`--menu_state` and the return dialog).
 * [placeholder]
 */
export const NETWORK_GUI_PLACEHOLDER = 'return at once' as const;

/** `FUN_0022ea70`'s block (0x3dc9c0): `ENGLISH`, the game's ELF, `--menu_state`, the return dialog. */
export function shutdownLaunch(lan: boolean): Launch {
  return { elf: NETWORK_GUI_ELF, argv: ['ENGLISH', GAME_ELF, MENU_STATE_OPTION, lan ? NTGUI_RETURN.lan : NTGUI_RETURN.wan] };
}

/** The value after `--menu_state` in an argument block (the handler 0x1eace0's), or null. */
export function menuStateOf(argv: readonly string[]): string | null {
  const i = argv.indexOf(MENU_STATE_OPTION);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v !== undefined && v !== '' ? v : null;
}
