import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { STICK } from '../../src/widgets/pad';
import {
  SKB_EVENTS, SKB_FN, SKB_KEY_TYPE, SKB_SOUND, readSoftKeyboards, skbRepeats, usbKeyAction, type TextInputRequest,
} from '../../src/keyboard';
import { uiParams } from './fixtures';
import { STEP, fnKey, isChar, keyAt, openedOn, pad, press, request, rig as rigOn, typeOnGrid, typeUsb, usb, walkTo, type Rig } from './walk';

/**
 * PLAT-17's soft keyboard as a state machine (web research 119 §3-§10) on the synthetic `UiParams.rdr` of
 * `./fixtures`: the open and its `skb_done`, the pad's moves and keys, the case rule, the caps, the two modes, ENTER,
 * the cancels and the close with their events and sounds, the USB keyboard (the owner's default 2) -- and typed strings
 * read back equal through the key-walk model (the PC project's `test_chat_round.py` method: walk the highlight to each
 * character, press CROSS, read the variable).
 */

const params = readSoftKeyboards(uiParams());
const rig = (): Rig => rigOn(params);
const opened = (o: Partial<TextInputRequest> = {}): Rig => openedOn(params, o);

describe('the open (GetTextInput: FUN_0038d770, FUN_0038b440, FUN_00395540)', () => {
  it('a layout found: skb_done 0, the open sound, MENUFADER at 0.5, the scale-up swallowing the pad for ScaleUpSec', () => {
    const r = rig();
    expect(r.kb.open(request(), 'PLAYERNAMEVAR')).toBe(true);
    expect(r.valves.find('skb_done')?.value).toBe(0);
    expect(r.sounds).toEqual([SKB_SOUND.SCALE_UP]);
    expect(r.fader).toEqual([0.5]);
    expect(r.kb.isOpen && r.kb.busy).toBe(true);
    expect(r.kb.input(pad({ RIGHT: 'FALLING' }))).toBe(true);           // taken, nothing done
    expect([r.kb.col, r.kb.row]).toEqual([0, 6]);
    for (let i = 0; i < 6; i++) r.kb.tick(STEP, true);
    expect(r.kb.busy).toBe(false);                                     // 6 x 1/30 s > 0.2 s
    expect(r.kb.text).toBe('');
  });

  it('no layout of that name: skb_done 1 at once, nothing opens; the open sound still plays', () => {
    const r = rig();
    expect(r.kb.open(request({ skbName: 'ClanSkbX' }), 'V')).toBe(false);
    expect(r.valves.find('skb_done')?.value).toBe(1);
    expect(r.kb.isOpen).toBe(false);
    expect(r.sounds).toEqual([SKB_SOUND.SCALE_UP]);
  });
});

describe('the pad (FUN_00394f60, FUN_0038c130, FUN_0038c990)', () => {
  it('the highlight starts on StartGridPos and steps over a wide key and the empty cells, wrapping, with .SKB_NAV', () => {
    const r = opened();
    expect(keyAt(r)).toEqual({ type: SKB_KEY_TYPE.SWITCH, value: 1 });
    press(r, 'RIGHT');
    expect(isChar(keyAt(r), 0x20)).toBe(true);                          // Space: Switch1's second cell crossed
    press(r, 'RIGHT');
    expect(fnKey(SKB_FN.Legend)(keyAt(r))).toBe(true);
    press(r, 'RIGHT');
    expect(keyAt(r).type).toBe(SKB_KEY_TYPE.SWITCH);                    // wrapped within the row
    press(r, 'UP');                                                     // row 6 is Switch1 too: on to Shift
    expect(fnKey(SKB_FN.Shift)(keyAt(r))).toBe(true);
    expect(r.sounds).toEqual([SKB_SOUND.NAVIGATION, SKB_SOUND.NAVIGATION, SKB_SOUND.NAVIGATION, SKB_SOUND.NAVIGATION]);
    r.kb.input(pad({}, STICK.DOWN));                                    // the stick's flick moves as the d-pad
    expect(fnKey(SKB_FN.Shift)(keyAt(r))).toBe(false);
  });

  it('CROSS types the highlighted letter lower case; L1 held, Shift (one key only) and caps lock raise it, XOR', () => {
    const r = opened();
    typeOnGrid(r, 'g');
    expect(r.kb.text).toBe('g');
    walkTo(r, fnKey(SKB_FN.Shift));
    expect(r.kb.shift).toBe(true);
    walkTo(r, (k) => isChar(k, 0x48));                                  // H, shifted once
    walkTo(r, (k) => isChar(k, 0x48));                                  // and lower again
    expect(r.kb.text).toBe('gHh');
    r.kb.input(pad({ TRIGGER_L1: 'FALLING', CROSS: 'FALLING' }));         // L1 held raises
    r.kb.input(pad({ TRIGGER_L1: 'RISING', CROSS: 'RISING' }));
    press(r, 'TRIGGER_R1');                                             // caps lock
    expect(r.kb.caps).toBe(true);
    press(r, 'CROSS');
    expect(r.kb.text).toBe('gHhHH');
  });

  it('SQUARE deletes before the cursor, L2 / R2 move it, a character goes in at it', () => {
    const r = opened();
    typeOnGrid(r, 'abc');
    press(r, 'TRIGGER_L2');
    press(r, 'TRIGGER_L2');
    expect(r.kb.cursor).toBe(1);
    press(r, 'SQUARE');
    expect(r.kb.text).toBe('bc');
    press(r, 'SQUARE');                                                 // at the start: nothing deleted, the sound still
    expect(r.kb.text).toBe('bc');
    press(r, 'TRIGGER_R2');
    typeOnGrid(r, 'x');
    expect(r.kb.text).toBe('bxc');
  });

  it('the caps refuse: name 14 characters, a refused character .NEG and nothing changed', () => {
    const r = opened();
    const q = Array.from({ length: 15 }, () => usb(0x04));
    typeUsb(r, q);
    expect(r.kb.text).toBe('a'.repeat(14));
    expect(r.sounds.at(-1)).toBe(SKB_SOUND.NEGATIVE);
  });

  it('NoDQuote types \' for "; without it " itself', () => {
    const r = opened();
    walkTo(r, (k) => isChar(k, 0x22));
    expect(r.kb.text).toBe('\'');
    const s = opened({ noDQuote: false });
    walkTo(s, (k) => isChar(k, 0x22));
    expect(s.kb.text).toBe('"');
  });

  it('Switch1 swaps to its twin at the twin\'s start, the text kept; the accent capitals follow the case rule', () => {
    const r = opened();
    typeOnGrid(r, 'a');
    walkTo(r, (k) => k.type === SKB_KEY_TYPE.SWITCH);
    expect(r.kb.layout?.name).toBe('CREATEPLAYERNAME2');
    expect([r.kb.col, r.kb.row]).toEqual([0, 6]);
    walkTo(r, (k) => isChar(k, 0xc4));
    walkTo(r, (k) => isChar(k, 8364));
    expect(r.kb.text).toBe('aä€');
  });
});

describe('the result (FUN_0038c040, FUN_00399d20, FUN_0038b390, FUN_00394da0)', () => {
  it('ENTER: the variable written, ON_SKB_APPLY with the text, then ON_SKB_CLOSE; .THUNK; skb_done 1 at the close\'s end', () => {
    const r = opened();
    typeOnGrid(r, 'Ghost');
    press(r, 'CIRCLE');
    expect(r.vars.find('PLAYERNAMEVAR')?.value).toEqual({ type: 'string', value: 'Ghost' });
    expect(r.events).toEqual([[SKB_EVENTS.APPLY, 'Ghost'], [SKB_EVENTS.CLOSE, null]]);
    expect(SKB_EVENTS).toEqual({ APPLY: DIALOG_EVENTS.ON_SKB_APPLY, APPLY2: DIALOG_EVENTS.ON_SKB_APPLY2, CLOSE: DIALOG_EVENTS.ON_SKB_CLOSE, CANCEL: DIALOG_EVENTS.ON_SKB_CANCEL });
    expect(r.sounds.slice(-2)).toEqual([SKB_SOUND.SCALE_DOWN, SKB_SOUND.ENTER]);
    expect(r.valves.find('skb_done')?.value).toBe(0);
    for (let i = 0; i < 7; i++) r.kb.tick(STEP, true);
    expect(r.valves.find('skb_done')?.value).toBe(1);
    expect(r.kb.isOpen).toBe(false);
    expect(r.fader.at(-1)).toBe(0);
  });

  it('ENTER on an empty, a blank or an unchanged text is a cancel: CLOSE then CANCEL; AllowEmpty applies the empty text', () => {
    const r = opened();
    press(r, 'CIRCLE');
    expect(r.events).toEqual([[SKB_EVENTS.CLOSE, null], [SKB_EVENTS.CANCEL, null]]);
    const b = opened();
    typeUsb(b, [usb(0x2c), usb(0x2c)]);
    press(b, 'CIRCLE');
    expect(b.events.map((e) => e[0])).toEqual([SKB_EVENTS.CLOSE, SKB_EVENTS.CANCEL]);
    const u = rig();
    u.vars.add('PLAYERNAMEVAR', { type: 'string', value: 'ab' }, 1);
    u.kb.open(request(), 'PLAYERNAMEVAR');
    for (let i = 0; i < 7; i++) u.kb.tick(STEP, true);
    typeUsb(u, [usb(0x04), usb(0x05)]);
    press(u, 'CIRCLE');
    expect(u.events.map((e) => e[0])).toEqual([SKB_EVENTS.CLOSE, SKB_EVENTS.CANCEL]);
    const e = opened({ allowEmpty: true, uiVar: 'PLAYERHOMETOWN' });
    press(e, 'CIRCLE');
    expect(e.events).toEqual([[SKB_EVENTS.APPLY, ''], [SKB_EVENTS.CLOSE, null]]);
    expect(e.vars.find('PLAYERHOMETOWN')?.value).toEqual({ type: 'string', value: '' });
  });

  it('TRIANGLE: CANCEL then CLOSE; the Exit key CLOSE then CANCEL; neither writes the variable', () => {
    const r = opened();
    typeOnGrid(r, 'a');
    press(r, 'TRIANGLE');
    expect(r.events).toEqual([[SKB_EVENTS.CANCEL, null], [SKB_EVENTS.CLOSE, null]]);
    expect(r.vars.find('PLAYERNAMEVAR')).toBeUndefined();
    const x = opened();
    walkTo(x, fnKey(SKB_FN.Exit));
    expect(x.events).toEqual([[SKB_EVENTS.CLOSE, null], [SKB_EVENTS.CANCEL, null]]);
  });
});

describe('the chat layout: message mode and Action2 (FUN_00399150, FUN_00399280, FUN_00399100)', () => {
  const chat = { skbName: 'ChatSkb', uiVar: 'CHATTEXT', uiVar2: 'MsgPlayer_Recipient', maxBytes: 63, maxChars: 63, maxBytes2: 31, maxChars2: 14, noDQuote: false, msgPlayerTitle: 'To', action2Title: 'Ignore' };

  it('MsgPlayer: the recipient edit focused; SELECT swaps; ENTER writes both variables', () => {
    const r = opened(chat);
    walkTo(r, fnKey(SKB_FN.MsgPlayer));
    expect(r.kb.mode).toBe(1);
    typeUsb(r, [usb(0x05), usb(0x04)]);
    press(r, 'SELECT');
    typeUsb(r, [usb(0x0b), usb(0x0c)]);
    expect([r.kb.text, r.kb.recipient]).toEqual(['hi', 'ba']);
    press(r, 'CIRCLE');
    expect(r.vars.find('MsgPlayer_Recipient')?.value).toEqual({ type: 'string', value: 'ba' });
    expect(r.events[0]).toEqual([SKB_EVENTS.APPLY, 'hi']);
  });

  it('Action2: ENTER posts ON_SKB_APPLY2', () => {
    const r = opened(chat);
    walkTo(r, fnKey(SKB_FN.Action2));
    expect(r.kb.mode).toBe(2);
    typeUsb(r, [usb(0x04)]);
    press(r, 'CIRCLE');
    expect(r.events[0]).toEqual([SKB_EVENTS.APPLY2, 'a']);
  });

  it('chat holds 63 characters (the game lobby\'s cap)', () => {
    const r = opened(chat);
    typeUsb(r, Array.from({ length: 70 }, () => usb(0x04)));
    expect(r.kb.text.length).toBe(63);
  });

  it('Tab (the USB Recip) toggles the valve ChatRecipient on a layout with a Recip key', () => {
    const r = opened(chat);
    typeUsb(r, [usb(0x2b)]);
    expect(r.valves.find('ChatRecipient')?.value).toBe(1);
    typeUsb(r, [usb(0x2b)]);
    expect(r.valves.find('ChatRecipient')?.value).toBe(0);
  });
});

describe('the USB keyboard (FUN_0038c630; the owner\'s default 2, PHYSICAL_TYPING_READING)', () => {
  it('the HID table: letters by shift XOR the lamp, digits and US punctuation with shift, keypad operators, the actions', () => {
    expect(usbKeyAction(usb(0x04))).toEqual({ kind: 'char', code: 0x61 });
    expect(usbKeyAction(usb(0x04, true))).toEqual({ kind: 'char', code: 0x41 });
    expect(usbKeyAction(usb(0x04, true, true))).toEqual({ kind: 'char', code: 0x61 });
    expect([0x1e, 0x27].map((h) => usbKeyAction(usb(h)))).toEqual([{ kind: 'char', code: 0x31 }, { kind: 'char', code: 0x30 }]);
    expect(usbKeyAction(usb(0x1f, true))).toEqual({ kind: 'char', code: 0x40 });
    const p = [0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38];
    expect(String.fromCharCode(...p.map((h) => (usbKeyAction(usb(h)) as { code: number }).code))).toBe('-=[]\\];\'`,./');
    expect(String.fromCharCode(...p.map((h) => (usbKeyAction(usb(h, true)) as { code: number }).code))).toBe('_+{}|}:"~<>?');
    expect([0x54, 0x55, 0x56, 0x57].map((h) => (usbKeyAction(usb(h)) as { code: number }).code)).toEqual([0x2f, 0x2a, 0x2d, 0x2b]);
    expect([0x28, 0x58, 0x29, 0x2a, 0x2b, 0x4f, 0x50, 0x2c].map((h) => usbKeyAction(usb(h)).kind))
      .toEqual(['enter', 'enter', 'escape', 'backspace', 'recip', 'right', 'left', 'char']);
    expect([0x59, 0x62, 0x52, 0x51, 0x4c].map((h) => usbKeyAction(usb(h)).kind)).toEqual(['none', 'none', 'none', 'none', 'none']);
  });

  it('typed keys go through the same insert (NoDQuote, the caps); Enter applies, Escape is CLOSE then CANCEL', () => {
    const r = opened();
    typeUsb(r, [usb(0x0a, true), usb(0x0b), usb(0x12), usb(0x16), usb(0x17), usb(0x2d, true), usb(0x1e), usb(0x34, true)]);
    expect(r.kb.text).toBe('Ghost_1\'');
    typeUsb(r, [usb(0x28)]);
    expect(r.events[0]).toEqual([SKB_EVENTS.APPLY, 'Ghost_1\'']);
    const e = opened();
    typeUsb(e, [usb(0x29)]);
    expect(e.events).toEqual([[SKB_EVENTS.CLOSE, null], [SKB_EVENTS.CANCEL, null]]);
  });
});

describe('typed strings read back equal (the key walk, the online path\'s three fields)', () => {
  it('the persona name (14 / 31), the password (12 / 31) and CREATE GAME\'s name (15 / 63) read back as typed', () => {
    for (const [o, s] of [
      [{}, 'Ghost Recon 01'],
      [{ uiVar: 'PLAYERPASSWORD', maxChars: 12, noDQuote: false, purpose: '_604_EnterPassword_MSG' }, 'Pa55word!x9Z'],
      [{ uiVar: 'GAMENAMEVAR', maxChars: 15, maxBytes: 63, noDQuote: false, purpose: '_305_EnterGameName_MSG' }, 'Seals vs Terror'],
    ] as [Partial<TextInputRequest>, string][]) {
      const r = opened(o);
      typeOnGrid(r, s);
      press(r, 'CIRCLE');
      expect(r.vars.find(o.uiVar ?? 'PLAYERNAMEVAR')?.value).toEqual({ type: 'string', value: s });
      expect(r.events[0]).toEqual([SKB_EVENTS.APPLY, s]);
    }
  });
});

describe('the repeat (FUN_003949c0 D:L288488-288540) and the tick', () => {
  it('the repeats owed by t past RepeatDelay: floor(min(t,A)(S + (E-S)/2 min(t,A)/A) + E max(0,t-A)) + 1', () => {
    const c = params.common;
    expect([0, 0.1, 0.5, 1].map((t) => skbRepeats(t, c))).toEqual([0, 1, 6, 13]);
  });

  it('a held RIGHT moves once at the press, then by the repeats while held; a release stops it', () => {
    const r = opened();
    r.kb.input(pad({ RIGHT: 'FALLING' }));
    const moved = r.sounds.length;
    for (let i = 0; i < 15; i++) { r.kb.input(pad({ RIGHT: 'DOWN' })); r.kb.tick(STEP, true); }   // 0.5 s: 0.25 delay + 0.25
    expect(r.sounds.length - moved).toBe(2);                            // t = 0.25 past the delay: floor(0.25 x 7.5) + 1
    const n = r.sounds.length;
    r.kb.input(pad({ RIGHT: 'RISING' }));
    for (let i = 0; i < 10; i++) r.kb.tick(STEP, true);
    expect(r.sounds.length).toBe(n);
  });
});

describe('the draw (code-drawn over the screen, research 119 §3)', () => {
  it('open: the background at SkbPos, the highlight on the start key; growing from the lower left while it scales', () => {
    const r = opened();
    const items = r.kb.draw();
    const bg = items.find((i) => i.kind === 'sprite' && i.texture === 'Skbbg_LC.tif');
    expect(bg).toMatchObject({ x0: 15, y0: 200, x1: 475, y1: 430 });
    expect(items.some((i) => i.kind === 'sprite' && i.texture === 'SkbHighlight.tif')).toBe(true);
    const s = rig();
    s.kb.open(request(), 'V');
    s.kb.tick(0.1, true);                                               // half way
    const half = s.kb.draw().find((i) => i.kind === 'sprite' && i.texture === 'Skbbg_LC.tif');
    expect(half).toMatchObject({ x0: 7.5, y0: 324, x1: 237.5, y1: 439 });
  });
});
