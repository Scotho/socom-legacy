import { expect } from 'vitest';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import { widgetPad, STICK, type PadButtonName, type PadStateName } from '../../src/widgets/pad';
import { SKB_KEY_TYPE, SoftKeyboard, type SkbKey, type SoftKeyboardHost, type SoftKeyboardParams, type TextInputRequest, type UsbKey } from '../../src/keyboard';

/**
 * The soft keyboard's test rig (PLAT-17): a keyboard over recorded events, sounds, UI variables and valves, the pad a
 * frame at a time, and the key-walk model (the PC project's `test_chat_round.py` method: walk the highlight to each
 * character, press CROSS, read the variable back).
 */

export const STEP = 1 / 30;

export interface Rig { kb: SoftKeyboard; events: [number, string | null][]; sounds: number[]; vars: UiVarManager; valves: ValveStore; fader: number[] }

export function rig(params: SoftKeyboardParams): Rig {
  const events: [number, string | null][] = [], sounds: number[] = [], fader: number[] = [];
  const vars = new UiVarManager(), valves = new ValveStore();
  const host: SoftKeyboardHost = {
    event: (code, text) => { events.push([code, text]); }, valves: () => valves, uiVars: () => vars,
    sound: (slot) => { sounds.push(slot); }, fader: (o) => { fader.push(o); },
  };
  return { kb: new SoftKeyboard({ params, host }), events, sounds, vars, valves, fader };
}

export const request = (o: Partial<TextInputRequest> = {}): TextInputRequest => ({
  uiVar: 'PLAYERNAMEVAR', purpose: '_455_EnterPlayerName_MSG', msgPlayerTitle: '', action2Title: '', skbName: 'CREATEPLAYERNAME',
  uiVar2: '', maxBytes: 31, maxChars: 14, maxBytes2: 0, maxChars2: 0, noDQuote: true, allowEmpty: false, ...o,
});

export function openedOn(params: SoftKeyboardParams, o: Partial<TextInputRequest> = {}): Rig {
  const r = rig(params);
  expect(r.kb.open(request(o), o.uiVar ?? 'PLAYERNAMEVAR')).toBe(true);
  for (let i = 0; i < 10; i++) r.kb.tick(STEP, true);
  expect(r.kb.busy).toBe(false);
  r.sounds.length = 0;
  return r;
}

/** One frame of the pad: the named buttons in their states (the rest up), the stick's answer. */
export const pad = (b: Partial<Record<PadButtonName, PadStateName>>, stick: number = STICK.NONE) => widgetPad(b, stick);
export const press = (r: Rig, b: PadButtonName): void => {
  r.kb.input(pad({ [b]: 'FALLING' }));
  r.kb.input(pad({ [b]: 'RISING' }));
};
export const keyAt = (r: Rig): SkbKey => r.kb.layout!.grid[r.kb.row]![r.kb.col]!;
export const isChar = (k: SkbKey, code: number): boolean => k.type === SKB_KEY_TYPE.CHAR && k.value === code;

/**
 * The key walk: RIGHT along a row that holds the key until it is highlighted, then CROSS; otherwise DOWN, or RIGHT first
 * when the cell below is empty or the same key (DOWN would step over that row).
 */
export function walkTo(r: Rig, match: (k: SkbKey) => boolean): void {
  const grid = r.kb.layout!.grid;
  for (let step = 0; step < 400; step++) {
    if (match(keyAt(r))) { press(r, 'CROSS'); return; }
    const below = grid[(r.kb.row + 1) % grid.length]![r.kb.col]!;
    const here = keyAt(r);
    if (grid[r.kb.row]!.some(match) || below.value === 0 && below.type === 0 || (below.type === here.type && below.value === here.value)) press(r, 'RIGHT');
    else press(r, 'DOWN');
  }
  throw new Error('key not reached');
}
export const fnKey = (fn: number) => (k: SkbKey) => k.type === SKB_KEY_TYPE.FN && k.value === fn;
/** Types `s` on the grid: letters through the case rule (caps lock set as each letter needs), others as they are. */
export function typeOnGrid(r: Rig, s: string): void {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const upper = ch !== ch.toLowerCase();
    const letter = ch.toLowerCase() !== ch.toUpperCase();
    if (letter && upper !== r.kb.caps) press(r, 'TRIGGER_R1');
    const target = letter ? ch.toUpperCase().codePointAt(0)! : c;
    walkTo(r, (k) => isChar(k, target) || (target === 0x20 && isChar(k, 0x20)) || (target === 0x27 && isChar(k, 0x27)));
  }
}
export const usb = (hid: number, shift = false, capsLamp = false): UsbKey => ({ hid, shift, capsLamp });
export function typeUsb(r: Rig, keys: UsbKey[]): void {
  const q = [...keys];
  r.kb.input(pad({}), () => q.shift() ?? null);
}
