import { DIALOG_BUTTONS } from '../dialog';
import { PAD, PAD_BUTTON_COUNT, type PadButtonName, type WidgetPad } from '../widgets/pad';

/**
 * The pad as the menus read it (PLAT-11; web research 116 §1): the per-frame reader `FUN_002da930` turns each of 16
 * buttons into a state byte at pad +1+slot through `FUN_002d9ff0` (D:L179128-179186) -- 0 up, 1 pressed this frame, 2
 * held, 3 released this frame -- and keeps the left stick at +0x220 / +0x224. `CMenuState`'s init flushes it
 * (`FUN_002d9e00` D:L179043-179050 -> `FUN_002dba60(pad, 0)` D:L179891-179936): every state zeroed, then one read with
 * dt 1/30, so a button held across the state change is 1 in the flush's own read and 2 on the state's first frame.
 *
 * Where the physical buttons come from is the caller's (`PadSnapshot`, filled by the page's adapter): this package reads
 * no browser global. The pressures and the double-press timers the same call keeps (pad +0x14, +0x74) are not kept:
 * no menu path reads them (research 116 §1.2).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/**
 * The game's slot order (R116.1): the slot is the byte's index less one. `GetButton` (`FUN_0036a5d0`, `DIALOG_BUTTONS`)
 * gives the same numbers for the 14 words a binding can spell; L3 and R3 (slots 15, 14) have no word.
 */
export const PAD_SLOTS = [
  'START', 'SELECT', 'RIGHT', 'LEFT', 'UP', 'DOWN', 'TRIANGLE', 'CIRCLE', 'SQUARE', 'CROSS',
  'TRIGGER_R1', 'TRIGGER_R2', 'TRIGGER_L1', 'TRIGGER_L2', 'R3', 'L3',
] as const;
export type PadSlotName = (typeof PAD_SLOTS)[number];
export const PAD_SLOT_COUNT = 16;

/**
 * The libpad2 button id the reader asks `scePad2GetButtonInfo` for, per slot (D:L179819-179862): 3, 0, 5, 7, 4, 6,
 * 0xc, 0xd, 0xf, 0xe, 0xb, 9, 0xa, 8, 2, 1. With libpad2's ids (PC runtime `socom2_host_input.h:15-16`: 0 SELECT,
 * 1 L3, 2 R3, 3 START, 4 UP, 5 RIGHT, 6 DOWN, 7 LEFT, 8 L2, 9 R2, 10 L1, 11 R1, 12 TRIANGLE, 13 CIRCLE, 14 CROSS,
 * 15 SQUARE) that is `PAD_SLOTS`' order -- the cross-check of research 116 §1.2.
 */
export const PAD2_ID_BY_SLOT: readonly number[] = [3, 0, 5, 7, 4, 6, 0xc, 0xd, 0xf, 0xe, 0xb, 9, 0xa, 8, 2, 1];
/** libpad2's names for its ids (`socom2_host_input.h:15-16`), for the cross-check. */
export const PAD2_NAMES: readonly PadSlotName[] = [
  'SELECT', 'L3', 'R3', 'START', 'UP', 'RIGHT', 'DOWN', 'LEFT', 'TRIGGER_L2', 'TRIGGER_R2', 'TRIGGER_L1', 'TRIGGER_R1',
  'TRIANGLE', 'CIRCLE', 'CROSS', 'SQUARE',
];

/** The flush's read's dt (`0x3d088889`, 1/30 as a float; D:L179918). */
export const PAD_FLUSH_DT = Math.fround(1 / 30);

/**
 * `FUN_002d9ff0`'s transition (D:L179135-179162): the state byte after a read with the slot's digital bit `down`.
 * Pressed: 0 -> 1, 1 -> 2, 2 -> 2, 3 -> 1 (a new press the frame after a release), any other -> 2. Released: 1 -> 3,
 * 2 -> 3, 3 -> 0, 0 -> 0, any other -> 0.
 */
export function nextPadState(state: number, down: boolean): number {
  if (down) {
    if (state === PAD.RISING) return PAD.FALLING;
    if (state === PAD.FALLING) return PAD.DOWN;
    if (state === PAD.DOWN) return PAD.DOWN;
    return state === PAD.UP ? PAD.FALLING : PAD.DOWN;
  }
  if (state === PAD.RISING) return PAD.UP;
  if (state === PAD.FALLING || state === PAD.DOWN) return PAD.RISING;
  return PAD.UP;
}

/**
 * The physical pad at one read: which slots are down, and the left stick in the game's signs -- **x positive left, y
 * positive up** (the reader's `(127.5 - b) / 127.5`, D:L179556-179811) -- after whatever dead zone the source applies.
 */
export interface PadSnapshot {
  readonly down: ReadonlySet<PadSlotName>;
  readonly stickX: number;
  readonly stickY: number;
}

export const NO_PAD: PadSnapshot = { down: new Set(), stickX: 0, stickY: 0 };

/** The pad object (`DAT_0044f108`) as far as the menus read it: the 16 state bytes and the stick. */
export class MenuPad {
  /** pad +1 .. +0x10: the state byte of each slot. */
  readonly states = new Array<number>(PAD_SLOT_COUNT).fill(PAD.UP);
  /** pad +0x220 / +0x224. */
  stickX = 0;
  stickY = 0;

  /** `FUN_002da930`: one read -- every slot through `nextPadState`, the stick taken as it is. */
  read(s: PadSnapshot): void {
    for (let i = 0; i < PAD_SLOT_COUNT; i++) this.states[i] = nextPadState(this.states[i]!, s.down.has(PAD_SLOTS[i]!));
    this.stickX = s.stickX;
    this.stickY = s.stickY;
  }

  /** `FUN_002dba60(pad, 0)`: the states and the stick zeroed, then one read (with `PAD_FLUSH_DT`). */
  flush(s: PadSnapshot): void {
    this.states.fill(PAD.UP);
    this.stickX = 0;
    this.stickY = 0;
    this.read(s);
  }

  /** The state byte of a named button. */
  state(name: PadSlotName): number { return this.states[PAD_SLOTS.indexOf(name)]!; }

  /**
   * The record a control's +0x44 and the popup's input read (`WidgetPad`): the 14 bytes a binding can name, by
   * `GetButton`'s code (the slot), and the stick's direction for this dispatch (`MenuStick.direction`).
   */
  record(stick: number): WidgetPad {
    return { bytes: this.states.slice(0, PAD_BUTTON_COUNT), stick };
  }
}

/** A binding's code for a slot name, where a binding can name it (`DIALOG_BUTTONS`); L3 / R3: none. */
export const bindingCode = (name: PadSlotName): number | undefined => DIALOG_BUTTONS[name as PadButtonName];
