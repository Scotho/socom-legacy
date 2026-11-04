import type { UiDrawItem } from '../compositor/drawList';
import type { UiScreen } from '../compositor/scene';
import { deliverDialogEvent } from '../movie/movieCommands';
import type { MenuSoftKeyboard } from '../input/menuInput';
import type { DialogPartsHost } from '../screens/dialogParts';
import type { FrontEndMachine } from '../screens/frontEndMachine';
import type { TextFace } from '../text/face';
import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import { UiVarManager } from '../uiVars';
import type { WidgetPad } from '../widgets/pad';
import { SKB_ARGUMENT_VAR, decodeTextInput } from './textInput';
import { SoftKeyboard } from './softKeyboard';
import type { SoftKeyboardParams } from './params';
import type { UsbKey } from './usb';

/**
 * The soft keyboard connected to the front end (PLAT-17; web research 119 §3, §8; sprint 9's W9.R4 lines): the
 * `GetTextInput` row of PLAT-08's table (the table is a registry, as S9-WIRE found), the dispatch's step 2 and the taps
 * (PLAT-11's `MenuInput.softKeyboard`), A8's tick (`FrontEndMachine`'s `focusTick`), the draw over the screen
 * (`FrontEndMachine`'s `draw`), the events to the built dialog's records with the text as the animation's argument
 * (`FUN_00367810` D:L263359-263395), `skb_done` and `ChatRecipient` in the launch's valves, MENUFADER's opacity
 * (`FUN_0036a210`). The file (`UiParams.rdr`) and the USB keys are the page's (`packages/viewer/src/softKeyboardKeys.ts`).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** `GetTextInput`'s row (18) in PLAT-08's table: `0x2808d0`, a tail jump to `FUN_0038d770`, whose one exit returns 1. */
export const GET_TEXT_INPUT = 'GetTextInput';

export interface SoftKeyboardFrontEndOptions {
  machine: () => FrontEndMachine;
  parts: DialogPartsHost;
  /** PLAT-23's `UiSoundCues.keyboard(slot)`; absent: silent. */
  sound?: (slot: number) => void;
  face?: (name: string) => TextFace | null;
  locText?: (key: string) => string | null;
  /**
   * The game's UI variables (`0x437e80`, its one `CUIVarManager`): the manager the dialogs' widgets are given too
   * (`DialogPartsOptions.uiVars`), so the persona form's TEXT / SECURETEXT print what the keyboard writes. The page's
   * session hands both its one manager; absent (a test rig), a manager of the keyboard's own.
   */
  uiVars?: UiVarManager;
}

const NO_PARAMS: SoftKeyboardParams = {
  common: { repeatDelay: 0, repeatSpeedStart: 0, repeatSpeedEnd: 0, repeatAccelTime: 0, sounds: [], usbKbdOnIcon: null, legend: { texture: null, size: [0, 0], slideInSec: 0, slideOutSec: 0 }, backgroundsOpacity: 1 },
  layouts: [],
};

export class SoftKeyboardFrontEnd implements MenuSoftKeyboard {
  readonly keyboard: SoftKeyboard;
  readonly uiVars: UiVarManager;
  /** The page's USB queue (`FUN_002dbd90`); none until the page connects one. */
  usbKey: (() => UsbKey | null) | null = null;

  constructor(private readonly o: SoftKeyboardFrontEndOptions) {
    this.uiVars = o.uiVars ?? new UiVarManager();
    this.keyboard = new SoftKeyboard({
      params: NO_PARAMS,
      host: {
        event: (code, text) => this.event(code, text),
        valves: () => o.machine().valves ?? null,
        uiVars: () => this.uiVars,
        sound: o.sound,
        fader: (opacity) => { const s = o.machine().shell(); if (s?.design) s.screen.fader.opacity = opacity; },
        usbKey: () => this.usbKey?.() ?? null,
        face: o.face,
        locText: o.locText,
      },
    });
  }

  /** `UiParams.rdr` read (`FUN_0038d6a0` at the front end's load); before it no layout is found and `skb_done` is 1 at once. */
  load(params: SoftKeyboardParams): void { this.keyboard.params = params; }

  /** The built dialog's event records of `code` (`FUN_00367810`): with `text` as each animation's argument when there is one. */
  private event(code: number, text: string | null): void {
    const shell = this.o.machine().shell();
    if (!shell) return;
    if (text === null) { shell.event(code); return; }
    const parts = this.o.parts.current;
    if (!shell.design || !parts) return;
    deliverDialogEvent(shell.design.bindings, code, (anim) => parts.widgetHost.animation(anim, text));
  }

  /**
   * Row 18's body (`FUN_0038d770`): the block decoded with the running animation's names, `UiVar` `$1` replaced by the
   * running script's argument (`FUN_00397640` D:L289873-289876; none: the empty name), the keyboard opened. Answers 1.
   */
  getTextInput: UiCommandHandler = (cmd) => {
    const parts = this.o.parts.current;
    const req = decodeTextInput(cmd.bytes, (i) => parts?.name(cmd, i) ?? null);
    req.uiVar = cmd.arg !== '' ? cmd.arg : req.uiVar;
    const varName = req.uiVar.toLowerCase() === SKB_ARGUMENT_VAR ? this.o.machine().shell()?.inputString(cmd.anim) ?? '' : req.uiVar;
    this.keyboard.open(req, varName);
    return true;
  };

  /** The dispatch's step 2 (`FUN_0038dc00`): true when a keyboard is up and took the pad. */
  input = (pad: WidgetPad): boolean => this.keyboard.input(pad);

  /** A tap (`SKB_TOUCH_READING`). */
  tap = (x: number, y: number): 'key' | 'lost' | 'none' => this.keyboard.tap(x, y);

  /** A8 (`FUN_0038d8f0`). */
  tick = (step: number, popupHidden: boolean): void => { this.keyboard.tick(step, popupHidden); };

  /** The draw over a screen's list (`AllSkbsRoot` over the screen): wraps the machine's other `draw`. */
  drawOver(inner: (screen: UiScreen, items: UiDrawItem[]) => UiDrawItem[]): (screen: UiScreen, items: UiDrawItem[]) => UiDrawItem[] {
    return (screen, items) => [...inner(screen, items), ...this.keyboard.draw()];
  }

  /** Row 18 in PLAT-08's table and the menu input's step 2 and taps. */
  connect(host: UiCommandHost, input: { softKeyboard: MenuSoftKeyboard | null }): void {
    host.setHandler(GET_TEXT_INPUT, this.getTextInput);
    input.softKeyboard = this;
  }
}
