import { DIALOG_EVENTS, type DialogBinding } from '../dialog';
import { PAD, STICK, padByte, type WidgetPad } from '../widgets/pad';
import type { FocusRing } from './focusRing';
import type { MenuPad } from './padStates';
import type { MenuStick } from './stick';

/**
 * The menu's input dispatch, `FUN_00368650(G, pad)` (PLAT-11; web research 116 §3, D:L263804-264248), called from the
 * dialog host's tick when no suspension runs and no switch is in flight (`MenuShell.tick` A1). In order, each of steps
 * 1-4 ending the dispatch when it takes the pad:
 *
 * 0. the stick's arming (`MenuStick.arm`);
 * 1. a shown `POPUP` node: the popup object gets the pad, and the dispatch ends whatever it answers (D:L263850-263855);
 * 2. an open soft keyboard (`DAT_0049ecd0`, `FUN_0038dc00`) takes it (PLAT-17's; absent here, D:L263856-263859);
 * 3. the control list's root (`FUN_00377040` over +0x290 with the focus index): only the **focused** control is asked
 *    (D:L263860-263864);
 * 4. the screen's bindings in file order, kind BUTTON only: the first whose state equals its button's byte -- or, a
 *    FALLING one on UP / DOWN / LEFT / RIGHT, whose direction the stick flicked -- starts its animation and ends the
 *    dispatch, **found or not** (R116.16; D:L263865-264123);
 * 5. the default navigation: DOWN's byte 1 or the stick flicked down -> the next control with the sound; else UP's
 *    byte 1 or the stick flicked up -> the previous (D:L264124-264241);
 * 6. one USB-keyboard key popped (`FUN_002dbd90`): HID 0x28 (Enter) or 0x58 (Keypad Enter) fires every screen
 *    `USBKBD_ENTER` binding (`FUN_00367810(G, 0x2c, 0)`, D:L264243-264246).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The event a USB Enter raises (`USBKBD_ENTER`, 0x2c). */
export const USBKBD_ENTER = DIALOG_EVENTS.USBKBD_ENTER!;
/** The HID usages `FUN_00368650` tests after the pop: `'('` 0x28 Enter, `'X'` 0x58 Keypad Enter (D:L264244). */
export const USB_ENTER_KEYS: readonly number[] = [0x28, 0x58];

/** The four directions a FALLING binding also takes from the stick: button slot -> `STICK` code (D:L264090-264105). */
const STICK_OF_BUTTON: Readonly<Record<number, number>> = { 4: STICK.UP, 5: STICK.DOWN, 3: STICK.LEFT, 2: STICK.RIGHT };

/** What the dispatch reaches on the dialog host. */
export interface MenuDispatchTarget {
  /** Step 1: the `POPUP` node shows (+0xcc's +0x5c bit 0); `popup` then takes the record. */
  popupShown(): boolean;
  popup(pad: WidgetPad): void;
  /** Step 2 (PLAT-17's): the soft keyboard takes the record when it is open; absent, none is. */
  softKeyboard?(pad: WidgetPad): boolean;
  /** Step 3: the focused control's +0x44 with the record (its third argument 0); true when it took it. */
  focused(pad: WidgetPad): boolean;
  /** Step 4: the screen's bindings (the design's `ANIMATIONS`), in file order. */
  bindings: readonly DialogBinding[];
  /** `FUN_0026a250(0x414bb0, name)` then the start with or without the argument: false when not found. */
  start(animation: string | null, argument: string | null): boolean;
  /** Step 5. */
  ring: FocusRing;
  /** Step 6: one key from the USB keyboard's queue, or null (PLAT-17's adapter; absent, none). */
  usbKey?(): number | null;
  /** `FUN_00367810(G, code, 0)`: every screen EVENT binding of the code fired. */
  event(code: number): void;
}

/** What one dispatch did, for the tests and the page's log. */
export type MenuDispatchResult = 'popup' | 'softKeyboard' | 'control' | 'screen' | 'next' | 'previous' | 'none';

/** `FUN_00368650`. */
export function menuDispatch(pad: MenuPad, stick: MenuStick, t: MenuDispatchTarget): MenuDispatchResult {
  stick.arm(pad.stickX, pad.stickY);                                                       // step 0
  const dir = stick.direction();
  const rec = pad.record(dir);
  if (t.popupShown()) { t.popup(rec); return 'popup'; }                                    // step 1
  if (t.softKeyboard?.(rec)) return 'softKeyboard';                                       // step 2
  if (t.focused(rec)) return 'control';                                                   // step 3
  for (const b of t.bindings) {                                                           // step 4
    if (b.kind !== 'button') continue;
    const flick = b.state === PAD.FALLING && STICK_OF_BUTTON[b.code] !== undefined && STICK_OF_BUTTON[b.code] === dir;
    if (b.state === padByte(rec, b.code) || flick) {
      t.start(b.animation, b.argument);
      return 'screen';
    }
  }
  let moved: MenuDispatchResult = 'none';
  if (padByte(rec, 5) === PAD.FALLING || dir === STICK.DOWN) { t.ring.next(true); moved = 'next'; }        // step 5
  else if (padByte(rec, 4) === PAD.FALLING || dir === STICK.UP) { t.ring.previous(true); moved = 'previous'; }
  const key = t.usbKey?.() ?? null;                                                       // step 6
  if (key !== null && USB_ENTER_KEYS.includes(key)) t.event(USBKBD_ENTER);
  return moved;
}
