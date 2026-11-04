import { DIALOG_BUTTONS, DIALOG_BUTTON_STATES } from '../dialog';

/**
 * The pad record a widget's input entry (run-time vtable +0x44) receives (web research 117 §1, "The pad record"): one
 * byte per PS2 button at `record + 1 + code`, the codes of `FUN_0036a5d0` (D:L264986-265078, `DIALOG_BUTTONS`), each
 * holding a binding state of `ParseButtonAnim` (D:L262766-262784, `DIALOG_BUTTON_STATES`): 0 UP, 1 FALLING (pressed
 * this frame), 2 DOWN (held), 3 RISING (released this frame). The left stick is read apart, through `FUN_0036a060`
 * (D:L264745-264799). Where the bytes come from, and when a held button repeats, is PLAT-11's (research 116): a widget
 * takes the record as it is given.
 */

/** The PS2 buttons, by the names a dialog's `BUTTON` binding spells. */
export type PadButtonName =
  | 'START' | 'SELECT' | 'RIGHT' | 'LEFT' | 'UP' | 'DOWN' | 'TRIANGLE' | 'CIRCLE' | 'SQUARE' | 'CROSS'
  | 'TRIGGER_R1' | 'TRIGGER_R2' | 'TRIGGER_L1' | 'TRIGGER_L2';
export type PadStateName = 'UP' | 'FALLING' | 'DOWN' | 'RISING';

/** The binding states (`DIALOG_BUTTON_STATES`), by name. */
export const PAD = { UP: 0, FALLING: 1, DOWN: 2, RISING: 3 } as const;

/** The codes `FUN_0036a5d0` gives: 14 buttons, 0 .. 13. */
export const PAD_BUTTON_COUNT = 14;

/**
 * What `FUN_0036a060` answers (D:L264745-264799): 5 while both axes are within 0.2 (the stick centred, the "was
 * centred" flag `DAT_003e0368` clear), a direction while the flag is set and an axis is past 0.6 -- 1 LEFT, 2 RIGHT,
 * 3 UP, 4 DOWN by the button's mapping (D:L271900-271914) -- else 0. The flag's upkeep (`FUN_00368650`) and the axes'
 * signs are PLAT-11's.
 */
export const STICK = { NONE: 0, LEFT: 1, RIGHT: 2, UP: 3, DOWN: 4, CENTRED: 5 } as const;

/** The record: `bytes[code]` is the state of button `code`; `stick` is `FUN_0036a060`'s answer this call. */
export interface WidgetPad { readonly bytes: readonly number[]; readonly stick: number }

/**
 * PAD_PAST_BUTTONS_READING: what a LISTBOX's binding with a code past 13 (an `EVENT` binding: ONFOCUS 0x2b, ONSCROLL
 * 0x29, ...) finds at `record + 1 + code` (`FUN_003745e0` D:L270374-270378 reads it unchecked). The record's bytes past
 * the 14 buttons were not read (its builder is PLAT-11's, research 116); 0 (UP) is taken, under which such a binding,
 * whose state is FALLING, never matches. [reading]
 */
export const PAD_PAST_BUTTONS_READING = 0;

/** A record from the buttons' states by name (absent: UP) and the stick's answer. */
export function widgetPad(states: Partial<Record<PadButtonName, PadStateName>>, stick: number = STICK.NONE): WidgetPad {
  const bytes = new Array<number>(PAD_BUTTON_COUNT).fill(PAD.UP);
  for (const [name, state] of Object.entries(states)) {
    const code = DIALOG_BUTTONS[name];
    if (code !== undefined && state !== undefined) bytes[code] = DIALOG_BUTTON_STATES[state] ?? PAD.UP;
  }
  return { bytes, stick };
}

/** `record + 1 + code`: the state of button `code`; past the buttons, `PAD_PAST_BUTTONS_READING`. */
export function padByte(pad: WidgetPad, code: number): number {
  return code >= 0 && code < PAD_BUTTON_COUNT ? pad.bytes[code] ?? PAD.UP : PAD_PAST_BUTTONS_READING;
}

/** The pad byte of a named button. */
export const padOf = (pad: WidgetPad, name: PadButtonName): number => padByte(pad, DIALOG_BUTTONS[name]!);
