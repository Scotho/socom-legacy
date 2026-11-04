// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { readSoftKeyboards, usbKeyAction, type UsbKey } from '@s2u/ui';
import { textInputBlock, uiParams } from '../../ui/test/keyboard/fixtures';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import { HID_BY_CODE, PHYSICAL_TYPING_READING, SoftKeyboardKeys, connectSoftKeyboard, readUiParams } from '../src/softKeyboardKeys';

/**
 * PLAT-17's physical typing (the owner's default 2; web research 119 §10, `PHYSICAL_TYPING_READING`): the page's keys as
 * the USB keyboard the game reads while a soft keyboard is up -- `KeyboardEvent.code` to the HID usage, the US
 * characters, Shift and the caps lamp from the event -- kept from PLAT-11's menu keys while it is up, and the
 * `UiParams.rdr` the keyboard is loaded with. jsdom; the dev disc's file when `SOCOM_DISC` / `SOCOM_PC_ROOT` is set.
 */

const open = { isOpen: true };
const closed = { isOpen: false };

function key(type: 'keydown' | 'keyup', code: string, o: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...o });
}

describe('HID_BY_CODE (the USB usages the game reads, FUN_0038c630)', () => {
  it('letters, digits, the US punctuation, the keypad, the editing keys', () => {
    expect([HID_BY_CODE.KeyA, HID_BY_CODE.KeyZ, HID_BY_CODE.Digit1, HID_BY_CODE.Digit0]).toEqual([0x04, 0x1d, 0x1e, 0x27]);
    expect(['Enter', 'Escape', 'Backspace', 'Tab', 'Space', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'IntlHash',
      'Semicolon', 'Quote', 'Backquote', 'Comma', 'Period', 'Slash'].map((c) => HID_BY_CODE[c])).toEqual(
      [0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38]);
    expect(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'NumpadDivide', 'NumpadEnter', 'Numpad1', 'Numpad0', 'NumpadDecimal'].map((c) => HID_BY_CODE[c]))
      .toEqual([0x4f, 0x50, 0x51, 0x52, 0x54, 0x58, 0x59, 0x62, 0x63]);
    expect(PHYSICAL_TYPING_READING).toMatch(/Shift XOR CapsLock/);
  });

  it('through the game\'s table a US key types its US character, whatever the visitor\'s layout', () => {
    const k = (code: string, shift = false): UsbKey => ({ hid: HID_BY_CODE[code]!, shift, capsLamp: false });
    expect(usbKeyAction(k('Quote', true))).toEqual({ kind: 'char', code: 0x22 });
    expect(usbKeyAction(k('Digit2', true))).toEqual({ kind: 'char', code: 0x40 });
  });
});

describe('SoftKeyboardKeys: the page\'s keys while a soft keyboard is up', () => {
  const seen: string[] = [];
  const pl11 = (e: Event) => { seen.push(`${e.type} ${(e as KeyboardEvent).code}`); };
  let detach: (() => void) | null = null;
  afterEach(() => { detach?.(); detach = null; seen.length = 0; document.removeEventListener('keydown', pl11, { capture: true }); document.removeEventListener('keyup', pl11, { capture: true }); });

  function setup(state: { isOpen: boolean }) {
    const keys = new SoftKeyboardKeys();
    detach = keys.attach(window, state);
    document.addEventListener('keydown', pl11, { capture: true });                      // PLAT-11's menu keys, as attachMenuInput listens
    document.addEventListener('keyup', pl11, { capture: true });
    return keys;
  }

  it('up: a key the game\'s USB table acts on is queued with Shift and the caps lamp, and PLAT-11 never sees it', () => {
    const keys = setup(open);
    document.body.dispatchEvent(key('keydown', 'KeyW', { shiftKey: true }));
    document.body.dispatchEvent(key('keydown', 'Enter'));
    expect(keys.next()).toEqual({ hid: 0x1a, shift: true, capsLamp: false });
    expect(keys.next()).toEqual({ hid: 0x28, shift: false, capsLamp: false });
    expect(keys.next()).toBeNull();
    expect(seen).toEqual([]);
    document.body.dispatchEvent(key('keyup', 'KeyW'));
    expect(seen).toEqual(['keyup KeyW']);                                                // a keyup always reaches the menus
  });

  it('up: ArrowUp / ArrowDown, PageUp and the chords stay the menus\' (the grid driven by keys); a repeat only of a typed key', () => {
    const keys = setup(open);
    for (const c of ['ArrowUp', 'ArrowDown', 'PageUp']) document.body.dispatchEvent(key('keydown', c));
    document.body.dispatchEvent(key('keydown', 'KeyC', { ctrlKey: true }));
    expect(keys.next()).toBeNull();
    expect(seen).toEqual(['keydown ArrowUp', 'keydown ArrowDown', 'keydown PageUp', 'keydown KeyC']);
    seen.length = 0;
    document.body.dispatchEvent(key('keydown', 'Enter', { repeat: true }));              // held from before the keyboard: dropped
    expect([keys.next(), seen]).toEqual([null, []]);
    document.body.dispatchEvent(key('keydown', 'Backspace'));
    document.body.dispatchEvent(key('keydown', 'Backspace', { repeat: true }));
    expect([keys.next()?.hid, keys.next()?.hid]).toEqual([0x2a, 0x2a]);
  });

  it('down: nothing is queued and every key is the menus\'', () => {
    const keys = setup(closed);
    document.body.dispatchEvent(key('keydown', 'KeyA'));
    document.body.dispatchEvent(key('keydown', 'Enter'));
    expect(keys.next()).toBeNull();
    expect(seen).toEqual(['keydown KeyA', 'keydown Enter']);
  });
});

describe('connectSoftKeyboard: UiParams.rdr loaded, the queue the keyboard\'s USB source', () => {
  it('a loader\'s file loaded into the front end\'s keyboard; the queue connected; detach stops the keys', async () => {
    const fe = { keyboard: { isOpen: true }, load: (p: unknown) => { loaded.push(p); }, usbKey: null as (() => UsbKey | null) | null };
    const loaded: unknown[] = [];
    const c = connectSoftKeyboard(fe, window, async () => uiParams());
    expect(await c.loaded).toBe(true);
    expect(loaded).toEqual([readSoftKeyboards(uiParams())]);
    document.body.dispatchEvent(key('keydown', 'KeyQ'));
    expect(fe.usbKey?.()).toEqual({ hid: 0x14, shift: false, capsLamp: false });
    c.detach();
    document.body.dispatchEvent(key('keydown', 'KeyQ'));
    expect(fe.usbKey?.()).toBeNull();
  });

  it('a file that will not read leaves the keyboard without layouts (GetTextInput then sets skb_done at once)', async () => {
    const fe = { keyboard: { isOpen: false }, load: () => { throw new Error('not loaded'); }, usbKey: null };
    const c = connectSoftKeyboard(fe, window, async () => { throw new Error('missing'); });
    expect(await c.loaded).toBe(false);
    c.detach();
  });
});

describe('the session (the lines in frontEnd.ts)', () => {
  it('binds GetTextInput (row 18) to its keyboard, hands the menu input step 2, and opens on the loaded file', () => {
    const disc: FrontEndDisc = { dialog: () => null, sets: [], faces: [], captions: null, loader: {}, missing: [] };
    const s = new FrontEndSession({ disc });
    expect(s.input.softKeyboard).toBe(s.keyboard);
    s.keyboard.load(readSoftKeyboards(uiParams()));
    const bytes = textInputBlock({ uiVarIndex: 0, purpose: '_455_EnterPlayerName_MSG', skb: 'CREATEPLAYERNAME', maxBytes: 31, maxChars: 14 });
    const o = s.host.dispatch({ anim: 'ChoosePersona', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'GetTextInput', arg: 'PLAYERNAMEVAR', loc: 0, bytes });
    expect(o).toMatchObject({ kind: 'table', answer: true });
    expect(s.keyboard.keyboard.layout?.name).toBe('CREATEPLAYERNAME');
  });

  it('hands one UI variable manager to the widgets, the popup and the keyboard (the game\'s one, 0x437e80)', () => {
    const disc: FrontEndDisc = { dialog: () => null, sets: [], faces: [], captions: null, loader: {}, missing: [] };
    const s = new FrontEndSession({ disc });
    expect(s.keyboard.uiVars).toBe(s.uiVars);
    expect(s.parts.o.uiVars).toBe(s.uiVars);
  });
});

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN/UI/READERC.ZAR'));

describe.skipIf(!HAVE_DISC)('the dev disc: readUiParams', () => {
  it('reads UiParams.rdr out of RUN/UI/READERC.ZAR: 12 layouts', async () => {
    const p = readSoftKeyboards(await readUiParams(new FsAssetSource(DISC)));
    expect(p.layouts).toHaveLength(12);
  });
});
