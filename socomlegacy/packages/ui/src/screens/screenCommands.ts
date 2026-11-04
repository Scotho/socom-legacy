import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { MenuQueue } from './menuQueue';
import type { MenuShell } from './menuShell';

/**
 * The screens' entries in the command table at 0x3dd4d0 (PLAT-10; web research 115 §2): the menu rows -- SwitchMenu,
 * PopUpDialog, KillPopUp, ActivateButton, EnableButton, DisableButton, FlushMenuHistory, SetDefaultMenuScreen -- and
 * the rows that cross the front end's boundary with the round -- GameStatePopCommand, CloseAndSwitch, ReplayMission,
 * AbortLoad. PLAT-08's `UiCommandHost` is a registry each module fills (`setHandler`, W9.R4): `register` binds these
 * twelve rows and the table itself is not edited. `SuspendMenuInput` is PLAT-11's row (the shell's `suspendInput`
 * is its effect); `SetMenuState` is online game-state code (research 115 §2.3), not the manager's.
 *
 * Every argument is the command's `names[+8]` (`FUN_0026ed60`); `INPUT_STRING` (strcmp) is replaced by the running
 * animation's first string input (`FUN_00272480(ctx+0x18, 0)`, D:L119977-120006) in every row but AbortLoad
 * (research 115 §2). `D:L<line>` = a line of `socom2_game.elf.decomp.c`.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The literal the commands replace (the string at 0x3ee898). */
export const INPUT_STRING = 'INPUT_STRING';

/** The rows: index in the table, id, name, function (`readBindingTable`; held to PLAT-08's table by the test). */
export const SCREEN_COMMAND_ROWS = [
  { row: 12, id: 13, name: 'SwitchMenu', fn: 0x27e720 },
  { row: 13, id: 14, name: 'PopUpDialog', fn: 0x27eb10 },
  { row: 14, id: 15, name: 'KillPopUp', fn: 0x27d190 },
  { row: 15, id: 16, name: 'ActivateButton', fn: 0x27c360 },
  { row: 18, id: 19, name: 'EnableButton', fn: 0x27c260 },
  { row: 19, id: 20, name: 'DisableButton', fn: 0x27c160 },
  { row: 73, id: 71, name: 'ReplayMission', fn: 0x280040 },
  { row: 74, id: 72, name: 'CloseAndSwitch', fn: 0x281a70 },
  { row: 85, id: 87, name: 'GameStatePopCommand', fn: 0x278df0 },
  { row: 86, id: 88, name: 'SetDefaultMenuScreen', fn: 0x278d60 },
  { row: 95, id: 97, name: 'AbortLoad', fn: 0x278060 },
  { row: 131, id: 132, name: 'FlushMenuHistory', fn: 0x27c7f0 },
] as const;
export type ScreenCommandName = (typeof SCREEN_COMMAND_ROWS)[number]['name'];

/**
 * DEFAULT_MENU_SCREEN_LENGTH_READING: the longest start-dialog name MS+0x30 holds. The writers copy with `strncpy(.., 0x40)`
 * (`FUN_00199800`: D:L123722, D:L123739, D:L128114, D:L55531), which leaves a 64-character name unterminated. Reading:
 * names are cut at 63 characters (the disc's are shorter), as MENU_NAME_LENGTH_READING cuts the records'. [reading]
 */
export const DEFAULT_MENU_SCREEN_LENGTH_READING = 0x40 - 1;

/**
 * INPUT_STRING_NULL_READING: an argument that resolves to nothing (no name, or `INPUT_STRING` with no string input)
 * reaches `strcmp` and `strcpy` as a null pointer in the original (SwitchMenu D:L126571, `FUN_0027eff0` D:L126876,
 * whose check has no null guard). Reading: the command does nothing and answers 1; no script on the disc relies on it.
 * [reading]
 */
export const INPUT_STRING_NULL_READING = 'nothing' as const;

/** The online state the boundary rows read (`DAT_0045a0c1` online, `DAT_0045a0c0` host, `*(DAT_00437ce8 + 0xd4)`). */
export interface ScreenCommandsNet {
  online: boolean;
  host: boolean;
  /** The game object's byte +0xd4 (CloseAndSwitch: 0 -> game state 5, else the pop). */
  roundFlag: boolean;
  /** `FUN_002a7490(DAT_00437ce8, 5)` (the online lane's). */
  gameState5?(): void;
  /** `FUN_002c00f0(DAT_00437ce8)` (the online lane's). */
  report?(): void;
}

export interface ScreenCommandsOptions {
  /** M. */
  queue: MenuQueue;
  /** `DAT_00414e40`: the dialog host built now (the menu state's or the load state's), or null. */
  shell: () => MenuShell | null;
  /** MS+0x30, the dialog MS's next Init builds. */
  menu: { startDialog: string };
  /** The load state's abort flag (+0x1a). */
  load: { abort: boolean };
  /** CG's requests: pop(arg) (`FUN_002cf2f0`), switch to MS (`FUN_002cf410(.., 0x408538)`). */
  states: { pop(arg: number): void; switchToMenu(): void };
  /** `INPUT_STRING`'s replacement for the command's running animation; null when it has none. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /** MS's BACK sound (`MENU_SOUND_PLAY_READING`; PLAT-23). */
  playBack?: () => void;
  /** CloseAndSwitch offline: `FUN_003b1a70("RUN\RAW\LOADING.RAW")` then `FUN_003b0c00(1)` (D:L128118-128119). */
  showLoadingPicture?: () => void;
  /** The online state; absent: offline. */
  online?: () => ScreenCommandsNet;
}

export class ScreenCommands {
  constructor(private readonly o: ScreenCommandsOptions) {}

  /** `FUN_0026ed60`, then the `INPUT_STRING` replacement. */
  private arg(cmd: ZAnimUiCommand): string | null {
    const a = cmd.arg;
    if (a === INPUT_STRING) return this.o.inputString?.(cmd) ?? null;
    return a === '' ? null : a;
  }

  private setStartDialog(name: string | null): void {
    if (name === null) return;
    this.o.menu.startDialog = name.length > DEFAULT_MENU_SCREEN_LENGTH_READING ? name.slice(0, DEFAULT_MENU_SCREEN_LENGTH_READING) : name;
  }

  private net(): ScreenCommandsNet { return this.o.online?.() ?? { online: false, host: false, roundFlag: false }; }

  /** CG pop(0), then a switch to MS. */
  private popToMenu(): void { this.o.states.pop(0); this.o.states.switchToMenu(); }

  /** `FUN_0027e720` (D:L126556-126639): research 115 §2.1's four cases. */
  SwitchMenu: UiCommandHandler = (cmd) => {
    const target = this.arg(cmd);
    if (target !== null) this.o.queue.switchMenu(target, this.o.playBack);
    return true;
  };

  /** `FUN_0027eb10` -> `FUN_0027eff0` (D:L126644-126652, D:L126862-126904): the record, the `POPUP` node shown, `.METAL`. */
  PopUpDialog: UiCommandHandler = (cmd) => {
    const name = this.arg(cmd);
    if (name === null) return true;
    const shell = this.o.shell();
    if (shell) shell.popUp(name);
    else this.o.queue.queuePopup(name);
    return true;
  };

  /** `FUN_0027d190` (D:L125846-125859). */
  KillPopUp: UiCommandHandler = () => { this.o.shell()?.killPopUp(); return true; };

  /** `FUN_0027c360` (D:L125375-125393). */
  ActivateButton: UiCommandHandler = (cmd) => { const n = this.arg(cmd); if (n !== null) this.o.queue.activateButton(n); return true; };
  /** `FUN_0027c260` (D:L125355-125373). */
  EnableButton: UiCommandHandler = (cmd) => { const n = this.arg(cmd); if (n !== null) this.o.queue.enableButton(n); return true; };
  /** `FUN_0027c160` (D:L125335-125353). */
  DisableButton: UiCommandHandler = (cmd) => { const n = this.arg(cmd); if (n !== null) this.o.queue.disableButton(n); return true; };

  /** `FUN_0027c7f0` (D:L125492-125512). */
  FlushMenuHistory: UiCommandHandler = () => { this.o.queue.flushHistory(); return true; };

  /** `FUN_00278d60` (D:L123712-123727): `strncpy(MS+0x30, name, 0x40)`. */
  SetDefaultMenuScreen: UiCommandHandler = (cmd) => { this.setStartDialog(this.arg(cmd)); return true; };

  /** `FUN_00278df0` (D:L123729-123746): the default screen, then CG pop(0) and a switch to MS. */
  GameStatePopCommand: UiCommandHandler = (cmd) => {
    this.setStartDialog(this.arg(cmd));
    this.popToMenu();
    return true;
  };

  /**
   * `FUN_00281a70` (D:L128101-128135): the default screen always; offline, pop(0), switch to MS and the loading
   * picture; online and host, game state 5 when the game object's +0xd4 is clear, else the pop and switch, then the
   * report; online and not host, nothing more.
   */
  CloseAndSwitch: UiCommandHandler = (cmd) => {
    this.setStartDialog(this.arg(cmd));
    const n = this.net();
    if (!n.online) {
      this.popToMenu();
      this.o.showLoadingPicture?.();
    } else if (n.host) {
      if (!n.roundFlag) n.gameState5?.();
      else this.popToMenu();
      n.report?.();
    }
    return true;
  };

  /** `FUN_00280040` (D:L127379-127395): offline, CG pop(1) (the round's state replays on its OnPop); online host, game state 5 and the report. */
  ReplayMission: UiCommandHandler = () => {
    const n = this.net();
    if (!n.online) this.o.states.pop(1);
    else if (n.host) { n.gameState5?.(); n.report?.(); }
    return true;
  };

  /**
   * `FUN_00278060` (D:L123260-123270) -> `FUN_001f5d00` (D:L55527-55534): the argument as it stands -- no
   * `INPUT_STRING` check -- into MS+0x30, the load state's abort flag set. Answers 0.
   */
  AbortLoad: UiCommandHandler = (cmd) => {
    this.setStartDialog(cmd.arg === '' ? null : cmd.arg);
    this.o.load.abort = true;
    return false;
  };

  /** The entries by their table name. */
  entries(): Record<ScreenCommandName, UiCommandHandler> {
    return {
      SwitchMenu: this.SwitchMenu, PopUpDialog: this.PopUpDialog, KillPopUp: this.KillPopUp,
      ActivateButton: this.ActivateButton, EnableButton: this.EnableButton, DisableButton: this.DisableButton,
      ReplayMission: this.ReplayMission, CloseAndSwitch: this.CloseAndSwitch, GameStatePopCommand: this.GameStatePopCommand,
      SetDefaultMenuScreen: this.SetDefaultMenuScreen, AbortLoad: this.AbortLoad, FlushMenuHistory: this.FlushMenuHistory,
    };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
