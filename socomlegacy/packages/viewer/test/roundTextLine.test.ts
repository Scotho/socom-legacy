// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsbKey } from '@s2u/ui';
import { AT_REST, DEFAULT_MODEL, DEFAULT_ROUND, Hud, hudLayout, MESSAGE_SCALE, TEXT_LINE_LAYOUT, type BannerLine } from '../src/hud';
import { FONT_TEXT_01, textWidth } from '../src/hudFont';
import { MESSAGE_COLOURS } from '../src/matchMessages';
import { roundLineTakes } from '../src/roundLineKeys';
import { devKeysHeld, holdDevKeys } from '../src/devKeyHolds';
import {
  attachRoundTextKeys, mountRoundTextLine, parseRoundWhisper, roundKey, RoundTextLine, ROUND_TEXT_LINE_CAP, unavailableLine,
  whisperPasses, type RoundActor, type RoundSender,
} from '../src/roundTextLine';

/**
 * KEYBOARD-WHISPER (OT.R48; web research 266 §3.9): the online round's USB-keyboard text line. The round's frame, online
 * with `ComeFromLan` 0, drains the USB keys (`FUN_001f7ff0` D:L56828-56830 -> `FUN_002c6c70` D:L167242-167320) into the
 * HUD's text line 0x437540; ENTER runs `FUN_002c9b80` (D:L169081-169131) -> `FUN_002c9990` (D:L169000-169077) ->
 * `FUN_002c9810` (D:L168944-168982); 0x29 `FUN_002c9cc0` (D:L169134-169142), 0x2a `FUN_002c9d00` (D:L169145-169168),
 * a character `FUN_002c9d90` (D:L169171-169198); the line's place `FUN_002ca100` (D:L169289-169322) and the static
 * initializer at 0x400830; its fade `FUN_002c9e90` (D:L169201-169254). Unit tests against the transcription.
 */

const key = (hid: number, shift = false, capsLamp = false): UsbKey => ({ hid, shift, capsLamp });
const chars = (hids: number[], shift = false): string => hids.map((h) => { const k = roundKey(key(h, shift)); return k?.kind === 'char' ? k.char : '?'; }).join('');

describe('the key map (FUN_002c6c70 D:L167256-167304; the ELF tables 0x3f2b00-0x3f2b3f and 0x3f2d78)', () => {
  it('letters 4-0x1d: lower case, upper with Shift XOR the caps lamp', () => {
    expect(chars([0x04, 0x05, 0x1d])).toBe('abz');
    expect(roundKey(key(0x04, true))).toEqual({ kind: 'char', char: 'A' });
    expect(roundKey(key(0x04, false, true))).toEqual({ kind: 'char', char: 'A' });
    expect(roundKey(key(0x04, true, true))).toEqual({ kind: 'char', char: 'a' });
  });
  it('the digit row 0x1e-0x27: 0x3f2b30 plain, 0x3f2b20 shifted', () => {
    expect(chars([0x1e, 0x1f, 0x26, 0x27])).toBe('1290');
    expect(chars([0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27], true)).toBe('!@#$%^&*()');
  });
  it('the symbols 0x2d-0x38: 0x3f2b10 plain, 0x3f2b00 shifted (0x32, non-US #, types ] and })', () => {
    const hids = [0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38];
    expect(chars(hids)).toBe('-=[]\\];\'`,./');
    expect(chars(hids, true)).toBe('_+{}|}:"~<>?');
  });
  it('the keypad: its digits and point type (0x59-0x63 from 0x3f2d78), its + - * / (0x57-0x54), whatever the shift', () => {
    expect(chars([0x59, 0x5a, 0x61, 0x62, 0x63])).toBe('1290.');
    expect(chars([0x57, 0x56, 0x55, 0x54], true)).toBe('+-*/');
  });
  it('space types; ENTER 0x28, 0x29 and 0x2a are the line\'s three commands; every other key does nothing', () => {
    expect(roundKey(key(0x2c))).toEqual({ kind: 'char', char: ' ' });
    expect(roundKey(key(0x28))).toEqual({ kind: 'enter' });
    expect(roundKey(key(0x29))).toEqual({ kind: 'escape' });
    expect(roundKey(key(0x2a))).toEqual({ kind: 'backspace' });
    for (const h of [0x2b, 0x58, 0x4f, 0x50, 0x51, 0x52, 0x3a, 0x00, 0x03]) expect(roundKey(key(h)), `0x${h.toString(16)}`).toBeNull();   // Tab, keypad Enter, the arrows, F1
  });
});

describe('ENTER\'s parse: `/w` then ` <name|"name"> <message>` (FUN_002c9b80 D:L169081-169131, FUN_002c9990 D:L169000-169077)', () => {
  it('a bare name and the message, the word `w` (S:0x3f2f10) case-blind', () => {
    expect(parseRoundWhisper('/w kilo hi')).toEqual({ name: 'kilo', message: 'hi' });
    expect(parseRoundWhisper('/W Kilo hi there')).toEqual({ name: 'Kilo', message: 'hi there' });
  });
  it('a quoted name with spaces; the message after any run of spaces, its own spaces kept', () => {
    expect(parseRoundWhisper('/w "kilo one" hi')).toEqual({ name: 'kilo one', message: 'hi' });
    expect(parseRoundWhisper('/w "kilo"hi')).toEqual({ name: 'kilo', message: 'hi' });
    expect(parseRoundWhisper('/w kilo    hi  you ')).toEqual({ name: 'kilo', message: 'hi  you ' });
  });
  it('anything else is no whisper', () => {
    for (const line of ['hello', '', '/', '/w', '/w ', '/w kilo', '/w kilo ', '/w  kilo hi', '/w "kilo hi', '/whisper kilo hi', '/x kilo hi', ' /w kilo hi', 'w kilo hi']) {
      expect(parseRoundWhisper(line), JSON.stringify(line)).toBeNull();
    }
  });
});

describe('the target rule (FUN_002c9810 D:L168944-168982)', () => {
  const actors: RoundActor[] = [
    { id: 1, name: 'Me', team: 'seal', alive: true }, { id: 2, name: 'Mate', team: 'seal', alive: true },
    { id: 3, name: 'Kilo', team: 'terrorist', alive: true }, { id: 4, name: 'DeadMate', team: 'seal', alive: false },
  ];
  const me: RoundSender = { id: 1, spectator: false };
  it('an actor passes only as a living teammate of a living sender; an enemy, a dead teammate, oneself do not', () => {
    expect(whisperPasses('mate', actors, me)).toBe(true);                    // case-blind (FUN_0029e590, FUN_00198b80)
    expect(whisperPasses('kilo', actors, me)).toBe(false);
    expect(whisperPasses('DeadMate', actors, me)).toBe(false);
    expect(whisperPasses('me', actors, me)).toBe(false);
  });
  it('a dead sender: a dead teammate passes, a living one does not (+0xe1 bit 4 alike)', () => {
    const dead = actors.map((a) => (a.id === 1 ? { ...a, alive: false } : a));
    expect(whisperPasses('DeadMate', dead, me)).toBe(true);
    expect(whisperPasses('Mate', dead, me)).toBe(false);
  });
  it('a name no actor bears passes; a spectator sender passes only such a name', () => {
    expect(whisperPasses('outsider', actors, me)).toBe(true);
    const watcher: RoundSender = { id: 9, spectator: true };
    expect(whisperPasses('Mate', actors, watcher)).toBe(false);
    expect(whisperPasses('outsider', actors, watcher)).toBe(true);
  });
  it('the refusal\'s text (S:0x3f2ef0)', () => {
    expect(unavailableLine('kilo')).toBe(':: Player "kilo" is unavailable');
  });
});

/** A line on a fake HUD: what is shown and what is posted. */
function rig(o: { actors?: RoundActor[]; sender?: RoundSender | null; width?: (t: string) => number } = {}) {
  const shown: string[] = [];
  const posted: BannerLine[] = [];
  const sent: [string, string][] = [];
  let held = '';
  const line = new RoundTextLine({
    hud: {
      postMessage: (l: string | BannerLine[]) => { posted.push(...(typeof l === 'string' ? [{ text: l, scale: MESSAGE_SCALE }] : l)); },
      setTextLine: (t: string) => { held = t; shown.push(t); }, textLineText: () => held, roundStarts: () => 0,
    },
    whisper: (message, name) => { sent.push([message, name]); },
    actors: () => o.actors ?? [{ id: 1, name: 'Me', team: 'seal', alive: true }, { id: 2, name: 'Mate', team: 'seal', alive: true }, { id: 3, name: 'Kilo', team: 'terrorist', alive: true }],
    sender: () => (o.sender === undefined ? { id: 1, spectator: false } : o.sender),
    ...(o.width ? { width: o.width } : {}),
    devOpen: false,                                                      // the original's line (no DEV open state)
  });
  const type = (s: string): void => {
    for (const c of s) {
      const lower = c.toLowerCase();
      if (c === ' ') line.key(key(0x2c));
      else if (c === '/') line.key(key(0x38));
      else if (c === '"') line.key(key(0x34, true));
      else if (lower >= 'a' && lower <= 'z') line.key(key(0x04 + lower.charCodeAt(0) - 97, c !== lower));
      else if (c >= '1' && c <= '9') line.key(key(0x1e + c.charCodeAt(0) - 49));
      else if (c === '0') line.key(key(0x27));
      else throw new Error(`no key for ${c}`);
    }
  };
  return { line, shown, posted, sent, type, enter: () => line.key(key(0x28)) };
}
const colour = (n: number): [number, number, number] => MESSAGE_COLOURS[n]!.map((v) => v / 128) as [number, number, number];

describe('the line: typing, ESC, BACKSPACE, ENTER', () => {
  it('a printing key appends and the HUD shows the line (FUN_002c9d90)', () => {
    const r = rig();
    r.type('Hi 2');
    expect(r.line.text).toBe('Hi 2');
    expect(r.shown.at(-1)).toBe('Hi 2');
  });
  it('the cap: FUN_002c9960(0x437540, 0x80) keeps 100 (clamped to 5..100), and a key appends while the line is under 98', () => {
    expect(ROUND_TEXT_LINE_CAP).toBe(100);
    const r = rig({ width: () => 0 });
    r.type('a'.repeat(120));
    expect(r.line.text).toHaveLength(98);
  });
  it('the width: a key appends only while the drawn line is narrower than (615 - 25) - 3 x 4 = 578 (FUN_002c9d90 D:L169187)', () => {
    expect(TEXT_LINE_LAYOUT.widthLimit).toBe(578);
    const r = rig({ width: (t) => t.length * 100 });
    r.type('abcdefgh');
    expect(r.line.text).toBe('abcdef');                                   // 500 < 578 takes the sixth; 600 refuses the seventh
    const real = rig();
    real.type('w'.repeat(98));
    expect(textWidth(real.line.text.slice(0, -1), TEXT_LINE_LAYOUT.text.scale)).toBeLessThan(578);
  });
  it('BACKSPACE drops the last character (FUN_002c9d00); on an empty line it does nothing', () => {
    const r = rig();
    r.type('hey');
    r.line.key(key(0x2a));
    expect(r.line.text).toBe('he');
    const e = rig();
    e.line.key(key(0x2a));
    expect(e.line.text).toBe('');
    expect(e.shown).toEqual([]);
  });
  it('ESC (0x29) clears the line unsent (FUN_002c9cc0)', () => {
    const r = rig();
    r.type('/w mate hi');
    r.line.key(key(0x29));
    expect(r.line.text).toBe('');
    expect(r.shown.at(-1)).toBe('');
    expect(r.sent).toEqual([]);
    expect(r.posted).toEqual([]);
  });
  it('ENTER on `/w <a name no actor bears> hi`: whispered through the lobby, echoed in colour 0 at the window\'s scale, cleared', () => {
    const r = rig();
    r.type('/w outsider hi');
    r.enter();
    expect(r.sent).toEqual([['hi', 'outsider']]);
    expect(r.posted).toEqual([{ text: 'hi', scale: MESSAGE_SCALE, rgb: colour(0) }]);
    expect(r.line.text).toBe('');
    expect(r.shown.at(-1)).toBe('');
  });
  it('ENTER on `/w kilo hi` with Kilo an enemy in the round: the unavailable line in colour 2, nothing sent', () => {
    const r = rig();
    r.type('/w kilo hi');
    r.enter();
    expect(r.sent).toEqual([]);
    expect(r.posted).toEqual([{ text: ':: Player "kilo" is unavailable', scale: MESSAGE_SCALE, rgb: colour(2) }]);
    expect(r.line.text).toBe('');
  });
  it('ENTER on `/W "Mate" hello there` to a teammate: whispered and echoed', () => {
    const r = rig();
    r.type('/W "Mate" hello there');
    r.enter();
    expect(r.sent).toEqual([['hello there', 'Mate']]);
    expect(r.posted.map((p) => p.text)).toEqual(['hello there']);
  });
  it('ENTER on `hello`: cleared unsent, nothing posted; ENTER on an empty line the same', () => {
    const r = rig();
    r.type('hello');
    r.enter();
    r.enter();
    expect(r.sent).toEqual([]);
    expect(r.posted).toEqual([]);
    expect(r.line.text).toBe('');
  });
});

/** The page's window: the line listens on its capture phase; a game key's listener on the document, after it. */
const offs: (() => void)[] = [];
afterEach(() => { for (const off of offs.splice(0)) off(); });
function keyWindow() {
  const later: string[] = [];
  const game = (e: Event): void => { later.push((e as KeyboardEvent).code); };
  document.addEventListener('keydown', game);
  offs.push(() => { document.removeEventListener('keydown', game); });
  return { target: window as EventTarget, later };
}
const press = (_t: EventTarget, code: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true, ...init });
  document.body.dispatchEvent(e);
  return e;
};
const attach = (...a: Parameters<typeof attachRoundTextKeys>): (() => void) => { const off = attachRoundTextKeys(...a); offs.push(off); return off; };

describe('the page\'s keys into the line (ROUND_TEXT_KEYS_READING): online only, never the game\'s controls', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it('online: a printing key types and goes no further; a key the line does not take passes on', () => {
    const r = rig(), w = keyWindow();
    const detach = attach(w.target, r.line, () => true);
    const a = press(w.target, 'KeyA');
    press(w.target, 'KeyW', { shiftKey: true });
    press(w.target, 'Numpad5');
    press(w.target, 'ArrowUp');
    press(w.target, 'Tab');
    press(w.target, 'KeyC', { ctrlKey: true });                           // a chord stays the browser's
    expect(r.line.text).toBe('aW5');
    expect(a.defaultPrevented).toBe(true);
    expect(w.later).toEqual(['ArrowUp', 'Tab', 'KeyC']);                 // the line's keys never reach a game listener
    detach();
    press(w.target, 'KeyB');
    expect(r.line.text).toBe('aW5');
  });
  it('the caps lamp from the event (getModifierState), XOR the shift', () => {
    const r = rig(), w = keyWindow();
    attach(w.target, r.line, () => true);
    const e = new KeyboardEvent('keydown', { code: 'KeyQ', cancelable: true, bubbles: true });
    Object.defineProperty(e, 'getModifierState', { value: (k: string) => k === 'CapsLock' });
    document.body.dispatchEvent(e);
    expect(r.line.text).toBe('Q');
  });
  it('offline, or a LAN game (not online, or ComeFromLan set): no line, every key passes on', () => {
    const r = rig(), w = keyWindow();
    attach(w.target, r.line, () => false);
    const a = press(w.target, 'KeyA');
    press(w.target, 'Enter');
    expect(r.line.text).toBe('');
    expect(a.defaultPrevented).toBe(false);
    expect(w.later).toEqual(['KeyA', 'Enter']);
  });
  it('LATER 190: a development editor holding the keys (`devKeysHeld`, the SETUP TAUNTS dev editor open) takes them from an open line until it lets go; with nothing registered (a release build) the line keeps them', () => {
    expect(devKeysHeld()).toBe(false);
    const r = rig(), w = keyWindow();
    attach(w.target, r.line, () => true);
    press(w.target, 'KeyA');
    expect(r.line.text).toBe('a');
    let open = true;
    const release = holdDevKeys(() => open);
    offs.push(release);
    const b = press(w.target, 'KeyB');
    expect(r.line.text).toBe('a');                                       // the line yields: the editor's key, not the line's
    expect(b.defaultPrevented).toBe(false);
    expect(roundLineTakes(b)).toBe(false);                               // so a listener ahead of the line hears it as no line key
    open = false;
    press(w.target, 'KeyC');
    expect(r.line.text).toBe('ac');                                      // the editor closed: the line takes its keys again
    release();
    expect(devKeysHeld()).toBe(false);
  });
  it('a release build (DEV false) takes the line\'s keys as well: a player\'s text entry, not a testing path', () => {
    vi.stubEnv('DEV', false);
    const r = rig(), w = keyWindow();
    attach(w.target, r.line, () => true);
    press(w.target, 'KeyH'); press(w.target, 'KeyI');
    expect(r.line.text).toBe('hi');
  });
});

describe('mountRoundTextLine: the line, its keys and its HUD', () => {
  it('typed on the window, shown on the HUD, the keys let go at the dispose', () => {
    const hud = new Hud();
    const w = keyWindow();
    const sent: [string, string][] = [];
    const m = mountRoundTextLine({
      hud, win: w.target, online: () => true, whisper: (msg, name) => { sent.push([msg, name]); },
      actors: () => [], sender: () => ({ id: 1, spectator: false }),
    });
    press(w.target, 'Enter');                                             // a development build: ENTER opens the line (ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION)
    for (const c of ['Slash', 'KeyW', 'Space', 'KeyK', 'KeyI', 'KeyL', 'KeyO', 'Space', 'KeyH', 'KeyI']) press(w.target, c);
    hud.step(0.1);
    expect(hud.state().model.textLine?.text).toBe('/w kilo hi');
    press(w.target, 'Enter');
    expect(sent).toEqual([['hi', 'kilo']]);
    expect(hud.postsForDev().map((p) => p.text)).toEqual(['hi']);
    m.dispose();
    press(w.target, 'KeyZ');
    expect(w.later.at(-1)).toBe('KeyZ');
    expect(m.line.text).toBe('');
  });
});

/**
 * ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION (a development build's only; research 266 §3.9, §6): with the keyboard testing
 * layer (OT.R29) the line is closed until ENTER opens it, so the testing keys keep working through an online round; open,
 * it takes every key `FUN_002c6c70` acts on, the talk key's V among them; ENTER sends and closes it, ESC clears and closes
 * it. A release build has no open state: the original's line, taking its keys whenever the round is online.
 */
describe('ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION: closed until ENTER in a development build; the original always in a release', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  const mount = (sent: [string, string][]) => {
    const hud = new Hud();
    const w = keyWindow();
    const m = mountRoundTextLine({
      hud, win: w.target, online: () => true, whisper: (msg, name) => { sent.push([msg, name]); },
      actors: () => [], sender: () => ({ id: 1, spectator: false }),
    });
    offs.push(() => { m.dispose(); });
    return { m, w };
  };
  it('a development build: closed, every key goes on to the testing layer; ENTER opens it and is not passed on', () => {
    vi.stubEnv('DEV', true);
    const sent: [string, string][] = [];
    const { m, w } = mount(sent);
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR', 'KeyV', 'Backspace', 'Escape']) press(w.target, c);
    expect(m.line.text).toBe('');
    expect(m.line.open).toBe(false);
    expect(w.later).toEqual(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR', 'KeyV', 'Backspace', 'Escape']);
    const opened = press(w.target, 'Enter');
    expect(m.line.open).toBe(true);
    expect(opened.defaultPrevented).toBe(true);
    expect(w.later.at(-1)).toBe('Escape');                                // ENTER taken
    for (const c of ['Slash', 'KeyW', 'Space', 'KeyK', 'KeyI', 'KeyL', 'KeyO', 'Space', 'KeyH', 'KeyI']) press(w.target, c);
    expect(m.line.text).toBe('/w kilo hi');
    expect(w.later).toHaveLength(9);                                      // open: every printing key the line's
    press(w.target, 'Enter');
    expect(sent).toEqual([['hi', 'kilo']]);
    expect(m.line.open).toBe(false);                                      // ENTER sends and closes
    press(w.target, 'KeyW');
    expect(m.line.text).toBe('');
    expect(w.later.at(-1)).toBe('KeyW');
  });
  it('a development build: ESC clears the open line and closes it, nothing sent', () => {
    vi.stubEnv('DEV', true);
    const sent: [string, string][] = [];
    const { m, w } = mount(sent);
    press(w.target, 'Enter');
    for (const c of ['KeyH', 'KeyE', 'KeyY']) press(w.target, c);
    expect(m.line.text).toBe('hey');
    press(w.target, 'Escape');
    expect([m.line.text, m.line.open, sent]).toEqual(['', false, []]);
    press(w.target, 'KeyA');
    expect([m.line.text, w.later.at(-1)]).toEqual(['', 'KeyA']);
  });
  it('a release build: no open state -- the original line takes its keys at once, and stays taking them after ENTER', () => {
    vi.stubEnv('DEV', false);
    const sent: [string, string][] = [];
    const { m, w } = mount(sent);
    for (const c of ['Slash', 'KeyW', 'Space', 'KeyK', 'KeyI', 'KeyL', 'KeyO', 'Space', 'KeyH', 'KeyI']) press(w.target, c);
    expect(m.line.text).toBe('/w kilo hi');
    expect(w.later).toEqual([]);
    press(w.target, 'Enter');
    expect(sent).toEqual([['hi', 'kilo']]);
    press(w.target, 'KeyA');
    expect([m.line.text, w.later]).toEqual(['a', []]);
    press(w.target, 'Escape');
    press(w.target, 'KeyB');
    expect([m.line.text, w.later]).toEqual(['b', []]);
  });
});

describe('the second review: a round start closes an open DEV line; a key aimed at a page control is left alone', () => {
  afterEach(() => { vi.unstubAllEnvs(); document.body.replaceChildren(); });
  const mount = () => {
    const hud = new Hud();
    const w = keyWindow();
    const m = mountRoundTextLine({ hud, win: w.target, online: () => true, whisper: () => undefined, actors: () => [], sender: () => ({ id: 1, spectator: false }) });
    offs.push(() => { m.dispose(); });
    return { hud, m, w };
  };
  it('a development build: open with ENTER, nothing typed, a new round -- closed, and G goes on to the testing layer', () => {
    vi.stubEnv('DEV', true);
    const { hud, m, w } = mount();
    press(w.target, 'Enter');
    expect(m.line.open).toBe(true);
    hud.startRound(DEFAULT_ROUND);
    expect(m.line.open).toBe(false);
    press(w.target, 'KeyG');
    expect(m.line.text).toBe('');
    expect(w.later.at(-1)).toBe('KeyG');
  });
  /** A key aimed at a control on the page: dispatched at the control, bubbling to the window. */
  const at = (el: Element, code: string): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true });
    el.dispatchEvent(e);
    return e;
  };
  const controls = (): HTMLElement[] => {
    const select = document.createElement('select'), input = document.createElement('input'), area = document.createElement('textarea');
    const button = document.createElement('button'), editable = document.createElement('div');
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true });   // jsdom computes no isContentEditable
    const all = [select, input, area, button, editable];
    document.body.append(...all);
    return all;
  };
  it('a release build: a key aimed at a select, an input, a textarea, a button or a contenteditable passes untouched', () => {
    vi.stubEnv('DEV', false);
    const { m, w } = mount();
    for (const el of controls()) {
      for (const code of ['KeyA', 'Space', 'Enter']) {
        const e = at(el, code);
        expect(e.defaultPrevented, `${el.tagName} ${code}`).toBe(false);
        expect(m.line.text, `${el.tagName} ${code}`).toBe('');
      }
    }
    expect(w.later).toHaveLength(15);                                     // every one reached the page's own listener
    press(w.target, 'KeyA');                                              // aimed at the page itself: the line's
    expect(m.line.text).toBe('a');
  });
  it('a development build: ENTER aimed at a select does not open the line', () => {
    vi.stubEnv('DEV', true);
    const { m } = mount();
    const [select] = controls();
    expect(at(select!, 'Enter').defaultPrevented).toBe(false);
    expect(m.line.open).toBe(false);
  });
});

describe('a new round clears the line (FUN_001fb420 D:L57631 -> FUN_002ca0b0 D:L169276-169286)', () => {
  it('typed, then a new round: the line empty, both alphas zeroed, and the next ENTER sends nothing', () => {
    const hud = new Hud();
    const w = keyWindow();
    const sent: [string, string][] = [];
    const m = mountRoundTextLine({
      hud, win: w.target, online: () => true, whisper: (msg, name) => { sent.push([msg, name]); },
      actors: () => [], sender: () => ({ id: 1, spectator: false }), devOpen: false,
    });
    offs.push(() => { m.dispose(); });
    for (const c of ['Slash', 'KeyW', 'Space', 'KeyK', 'KeyI', 'KeyL', 'KeyO', 'Space', 'KeyH', 'KeyI']) press(w.target, c);
    hud.step(0.5);
    expect(hud.state().model.textLine).toEqual({ text: '/w kilo hi', box: 76.8, ink: 100 });
    hud.startRound(DEFAULT_ROUND);
    expect(m.line.text).toBe('');
    hud.step(0);
    expect(hud.state().model.textLine).toBeNull();                       // no fade out: FUN_002ca0b0 zeroes +0xa0 and +0x13c
    press(w.target, 'Enter');
    expect(sent).toEqual([]);
    expect(hud.postsForDev()).toEqual([]);
    press(w.target, 'KeyA');
    expect(m.line.text).toBe('a');                                       // the line types on in the new round
  });
});

describe('the HUD\'s text line (FUN_002ca100 D:L169289-169322; the static initializer 0x400830; FUN_002c9e90 D:L169201-169254)', () => {
  it('its place, font and colour: the box 25..615 x 338..360 black, the pen (28, 354) at 0.8 in (100, 100, 20)', () => {
    expect(TEXT_LINE_LAYOUT.box).toEqual({ x: 25, y: 338, w: 590, h: 22 });
    expect(TEXT_LINE_LAYOUT.text).toEqual({ x: 28, y: 354, scale: 0.8 });
    expect(TEXT_LINE_LAYOUT.rgb).toEqual([100, 100, 20]);
    expect([TEXT_LINE_LAYOUT.boxAlpha, TEXT_LINE_LAYOUT.inkAlpha, TEXT_LINE_LAYOUT.boxRate, TEXT_LINE_LAYOUT.inkRate]).toEqual([76.8, 100, 200, 200]);
  });
  it('fades in while the line has text, at 200 a second to 76.8 (the box) and 100 (the text), and out once it is empty', () => {
    const hud = new Hud();
    hud.setTextLine('hi');
    hud.step(0.1);
    expect(hud.state().model.textLine).toEqual({ text: 'hi', box: 20, ink: 20 });
    hud.step(1);
    expect(hud.state().model.textLine).toEqual({ text: 'hi', box: 76.8, ink: 100 });
    hud.setTextLine('');
    hud.step(0.25);
    const out = hud.state().model.textLine!;
    expect(out.text).toBe('');
    expect(out.box).toBeCloseTo(26.8, 5);
    expect(out.ink).toBeCloseTo(50, 5);
    hud.step(1);
    expect(hud.state().model.textLine).toBeNull();
  });
  it('drawn: the box untextured black at its alpha, the text in the HUD\'s font at the pen, the shadow at min(alpha, 96)', () => {
    const sizes = { white: { width: 1, height: 1 }, [FONT_TEXT_01.texture]: { width: 256, height: 256 } };
    const model = { ...DEFAULT_MODEL, textLine: { text: 'hi', box: 76.8, ink: 100 } };
    const quads = hudLayout({ width: 640, height: 448 }, model, sizes, AT_REST).quads.filter((q) => q.element === 'textLine');
    const box = quads.find((q) => q.texture === 'white')!;
    expect([box.x, box.y, box.w, box.h]).toEqual([320, 349, 590, 22]);
    expect(box.rgba).toEqual([0, 0, 0, 76.8 / 128]);
    const glyphs = quads.filter((q) => q.texture === FONT_TEXT_01.texture);
    expect(glyphs.length).toBe(4);                                         // two glyphs, each with its shadow
    expect(glyphs.some((g) => g.rgba[0] === 100 / 128 && g.rgba[1] === 100 / 128 && g.rgba[2] === 20 / 128 && g.rgba[3] === 100 / 128)).toBe(true);
    expect(glyphs.some((g) => g.rgba[0] === 0 && g.rgba[3] === 96 / 128)).toBe(true);
    expect(Math.min(...glyphs.map((g) => g.x - g.w / 2))).toBeGreaterThan(27);
    const none = hudLayout({ width: 640, height: 448 }, { ...DEFAULT_MODEL }, sizes, AT_REST).quads.filter((q) => q.element === 'textLine');
    expect(none).toEqual([]);
  });
});

/**
 * OT.R43 (both matches): /testroom's match mounts the same line on its HUD (`main.ts`, the block after `const hud =
 * new Hud();`), online while its NetPage is a server's (not the page's own `LoopbackMatch`), with no lobby session to
 * whisper through -- `FUN_002f4860` with the lobby down (its +0x7d test, D:L194549-194550) sends nothing and answers 0,
 * and `FUN_002c9810` echoes regardless (D:L168977-168978). Held on the source: main.ts runs no unit test of its own.
 */
describe('/testroom mounts the line (main.ts; OT.R43)', () => {
  const main = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf-8');
  it('imports it, and mounts it on the HUD right after the HUD is made, online with a server, its whisper sending nothing', () => {
    expect(main).toMatch(/^import \{ mountRoundTextLine \} from '\.\/roundTextLine';$/m);
    const at = main.indexOf('const hud = new Hud();');
    const block = main.slice(at, at + 900);
    expect(block).toMatch(/const hud = new Hud\(\);\r?\n(?:\/\/[^\n]*\r?\n)*mountRoundTextLine\(\{/);
    expect(block).toMatch(/online: \(\) => net !== null && !solo/);
    expect(block).toMatch(/whisper: \(\) => \{ \/\* [^*]*\*\/ \}/);
    expect(block).toMatch(/actors: \(\) => net\?\.rows \?\? \[\]/);
  });
});

/**
 * ROUND-LINE-YIELDS (issue #260; research 266 §3.9, §6; `ROUND_LINE_UNDER_MENU_READING`): the original's line is live
 * under WEAPON EXCHANGE and the R2 inventory -- the round's frame ticks both menus from the pad (`FUN_001f7ff0`
 * D:L56657 `FUN_00219c80`, D:L56660 `FUN_00240600`) and then drains the USB keys into the line with no menu test
 * (D:L56828-56830), and neither menu pops a USB key. The page's development keyboard is the pad's stand-in too (OT.R29):
 * while a menu holds the pad's keys a closed DEV line does not open, and ENTER goes on to the menu
 * (`ROUND_LINE_MENU_YIELD_ADAPTATION`, a dev-keyboard adaptation over OT.R29's shared keys); an open line keeps its
 * keys, and a release build's line (no open state) is the original's under every menu.
 */
describe('ROUND-LINE-YIELDS: a closed DEV line leaves ENTER to a menu that holds the pad\'s keys', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  const mount = (menu: { open: boolean }, sent: [string, string][] = []) => {
    const hud = new Hud();
    const w = keyWindow();
    const m = mountRoundTextLine({
      hud, win: w.target, online: () => true, whisper: (msg, name) => { sent.push([msg, name]); },
      actors: () => [], sender: () => ({ id: 1, spectator: false }), menu: () => menu.open,
    });
    offs.push(() => { m.dispose(); });
    return { m, w };
  };
  const event = (code: string, init: KeyboardEventInit = {}): KeyboardEvent => new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true, ...init });
  it('a development build, the line closed and a menu holding: ENTER passes on, the line stays closed, the registry answers false', () => {
    vi.stubEnv('DEV', true);
    const menu = { open: true };
    const { m, w } = mount(menu);
    expect(roundLineTakes(event('Enter'))).toBe(false);
    const enter = press(w.target, 'Enter');
    expect(enter.defaultPrevented).toBe(false);
    expect(w.later).toEqual(['Enter']);                                   // the menu's listener hears it
    expect(m.line.open).toBe(false);
    press(w.target, 'KeyA');
    expect([m.line.text, w.later]).toEqual(['', ['Enter', 'KeyA']]);
    menu.open = false;                                                    // the menu closed: ENTER opens the line as before
    expect(roundLineTakes(event('Enter'))).toBe(true);
    expect(press(w.target, 'Enter').defaultPrevented).toBe(true);
    expect(m.line.open).toBe(true);
    expect(w.later).toEqual(['Enter', 'KeyA']);
  });
  it('a development build, the line open when a menu opens: the line keeps its keys (the original\'s, live under the menus) until ENTER closes it', () => {
    vi.stubEnv('DEV', true);
    const menu = { open: false };
    const sent: [string, string][] = [];
    const { m, w } = mount(menu, sent);
    press(w.target, 'Enter');
    expect(m.line.open).toBe(true);
    menu.open = true;
    expect(roundLineTakes(event('KeyH'))).toBe(true);
    for (const c of ['Slash', 'KeyW', 'Space', 'KeyK', 'KeyI', 'KeyL', 'KeyO', 'Space', 'KeyH', 'KeyI']) press(w.target, c);
    expect([m.line.text, w.later]).toEqual(['/w kilo hi', []]);
    press(w.target, 'Enter');                                             // sends and closes (FUN_002c9b80)
    expect([sent, m.line.open, w.later]).toEqual([[['hi', 'kilo']], false, []]);
    press(w.target, 'Enter');                                             // closed now, the menu still holding: the menu's
    expect([m.line.open, w.later]).toEqual([false, ['Enter']]);
  });
  it('a development build, no menu: a closed line opens on a fresh ENTER only, never on the browser\'s repeat of a held one', () => {
    vi.stubEnv('DEV', true);
    const { m, w } = mount({ open: false });
    expect(roundLineTakes(event('Enter', { repeat: true }))).toBe(false);
    expect(press(w.target, 'Enter', { repeat: true }).defaultPrevented).toBe(false);
    expect([m.line.open, w.later]).toEqual([false, ['Enter']]);
    press(w.target, 'Enter');
    expect(m.line.open).toBe(true);
    press(w.target, 'KeyA', { repeat: true });                            // open, the repeat types (ROUND_TEXT_KEYS_READING)
    expect(m.line.text).toBe('a');
  });
  it('a release build: a menu holding changes nothing -- the original line takes its keys under WEAPON EXCHANGE and the R2 inventory', () => {
    vi.stubEnv('DEV', false);
    const sent: [string, string][] = [];
    const { m, w } = mount({ open: true }, sent);
    expect(roundLineTakes(event('Enter'))).toBe(true);
    for (const c of ['Slash', 'KeyW', 'Space', 'KeyK', 'KeyI', 'KeyL', 'KeyO', 'Space', 'KeyH', 'KeyI', 'Enter']) press(w.target, c);
    expect([sent, w.later]).toEqual([[['hi', 'kilo']], []]);
  });
  it('attachRoundTextKeys\' fourth argument, absent: no menu ever holds (the mount sites\' state before they pass it)', () => {
    vi.stubEnv('DEV', true);
    const hud = new Hud();
    const w = keyWindow();
    const line = new RoundTextLine({ hud, whisper: () => undefined, actors: () => [], sender: () => null });
    const off = attachRoundTextKeys(w.target, line, () => true);         // three arguments: today's line
    press(w.target, 'Enter');
    expect(line.open).toBe(true);
    press(w.target, 'Escape');
    off();
    attach(w.target, line, () => true, () => true);                      // a menu holding
    press(w.target, 'Enter');
    expect([line.open, w.later]).toEqual([false, ['Enter']]);
  });
});

/**
 * ROUND-LINE-YIELDS (OT.R43, both matches; `ROUND_LINE_MENU_YIELD_ADAPTATION`): each mount passes the page's own menus
 * as the line's `menu` -- `/testroom` (`main.ts`) the ARMORY, WEAPON EXCHANGE, the R2 inventory and (LATER 183) the open
 * SETUP TAUNTS dev editor, the front end's match (`matchMount.ts`) the first three. Held on the sources: main.ts runs no
 * unit test of its own.
 */
describe('ROUND-LINE-YIELDS: both mounts pass the page\'s menus as the line\'s menu (main.ts, matchMount.ts)', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it('main.ts: the mount after the HUD passes the ARMORY, WEAPON EXCHANGE and the R2 inventory', () => {
    const main = src('main.ts');
    const at = main.indexOf('const hud = new Hud();');
    const mount = main.slice(at, main.indexOf('\n', main.indexOf('mountRoundTextLine({', at)));
    // LATER 76: the ARMORY by the DEV key path's own test (`armoryTakesKeys`: Play mode, past the hold, the ARMORY open).
    expect(mount).toMatch(/menu: \(\) => armoryTakesKeys\(\) \|\| exchange\.isOpen\(\) \|\| inventory\.isOpen\(\)/);
  });
  it('matchMount.ts: the text line\'s mount passes the ARMORY, WEAPON EXCHANGE and the R2 inventory', () => {
    const mm = src('matchMount.ts');
    const at = mm.indexOf('const typed = line ? mountRoundTextLine({');
    expect(at).toBeGreaterThan(0);
    const mount = mm.slice(at, mm.indexOf('}) : null;', at));
    expect(mount).toMatch(/menu: \(\) => armory\.isOpen\(\) \|\| exchange\.isOpen\(\) \|\| throws\.inventory\.isOpen\(\)/);
  });
});
