// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { MenuInputSource, UsbKey } from '@s2u/ui';
import { uiParams } from '../../ui/test/keyboard/fixtures';
import { MenuPageInput } from '../src/menuInput';
import { ENTER_CHAT_STALE_MS, ENTER_OPENS_CHAT_ADAPTATION, SoftKeyboardKeys, connectSoftKeyboard } from '../src/softKeyboardKeys';

/**
 * WM-ENTER-CHAT (`ENTER_OPENS_CHAT_ADAPTATION`; product track, a browser adaptation on the owner's word, 2026-11-15):
 * with no soft keyboard up, on a screen that binds the original's `USBKBD_ENTER` event, the page's Enter / Numpad Enter
 * is the USB keyboard's Enter (HID 0x28 / 0x58) the dispatch's step 6 pops (`FUN_00368650`, D:L264243-264246), so the
 * screen's own binding opens the chat keyboard; on every other screen Enter is what it was. jsdom; synthetic state.
 */

const open = (): { isOpen: boolean } => ({ isOpen: true });
const closed = (): { isOpen: boolean } => ({ isOpen: false });
/** Two screens' designs, each with an EVENT binding of `USBKBD_ENTER` (the predicate answers the showing one, or null). */
const LOBBY = { name: 'dlgGameLobby' }, BRIEFING = { name: 'dlgMPBriefingRoom' };

function key(type: 'keydown' | 'keyup', code: string, o: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...o });
}

describe("ENTER_OPENS_CHAT_ADAPTATION: the page's Enter as the USB Enter on a screen that binds USBKBD_ENTER", () => {
  const seen: string[] = [];
  const menus = (e: Event): void => { seen.push(`${e.type} ${(e as KeyboardEvent).code}`); };
  let detach: (() => void) | null = null;
  let now = 0;
  afterEach(() => {
    detach?.(); detach = null; seen.length = 0; now = 0;
    document.removeEventListener('keydown', menus, { capture: true });
    document.removeEventListener('keyup', menus, { capture: true });
  });

  function setup(state: { isOpen: boolean }, binds: { value: boolean; screen?: object }): SoftKeyboardKeys {
    const keys = new SoftKeyboardKeys(() => now);
    detach = keys.attach(window, state, false, () => (binds.value ? binds.screen ?? LOBBY : null));
    document.addEventListener('keydown', menus, { capture: true });                    // PLAT-11's menu keys, as attachMenuInput listens
    document.addEventListener('keyup', menus, { capture: true });
    return keys;
  }

  it("carries the owner's words, the date and the original's path it rides", () => {
    expect(ENTER_OPENS_CHAT_ADAPTATION).toMatch(/enter opens keyboard in the lobby approved/);
    expect(ENTER_OPENS_CHAT_ADAPTATION).toMatch(/2026-11-15/);
    expect(ENTER_OPENS_CHAT_ADAPTATION).toMatch(/USBKBD_ENTER/);
    expect(ENTER_CHAT_STALE_MS).toBeGreaterThan(0);
  });

  it("(a) no keyboard up, the screen binds it: Enter is queued for step 6 as HID 0x28, Numpad Enter as 0x58, default prevented, kept from the menus", () => {
    const keys = setup(closed(), { value: true });
    const e = key('keydown', 'Enter');
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(seen).toEqual([]);
    expect(keys.menuKey()).toBe(0x28);
    expect(keys.menuKey()).toBeNull();
    expect(keys.next()).toBeNull();                                                     // never the keyboard's queue
    const n = key('keydown', 'NumpadEnter');
    document.body.dispatchEvent(n);
    expect(n.defaultPrevented).toBe(true);
    expect(keys.menuKey()).toBe(0x58);
    expect(seen).toEqual([]);
  });

  it("(a) a chord with Ctrl, Alt or Meta is not queued and passes; a repeat is not queued; X and Space pass untouched", () => {
    const keys = setup(closed(), { value: true });
    for (const mod of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      const e = key('keydown', 'Enter', { [mod]: true });
      document.body.dispatchEvent(e);
      expect([mod, e.defaultPrevented, keys.menuKey()]).toEqual([mod, false, null]);
    }
    document.body.dispatchEvent(key('keydown', 'Enter', { repeat: true }));
    expect(keys.menuKey()).toBeNull();
    for (const c of ['KeyX', 'Space']) {
      const e = key('keydown', c);
      document.body.dispatchEvent(e);
      expect([c, e.defaultPrevented, keys.menuKey()]).toEqual([c, false, null]);
    }
    expect(seen).toEqual(['keydown Enter', 'keydown Enter', 'keydown Enter', 'keydown KeyX', 'keydown Space']);
  });

  it("(b) the screen does not bind it: nothing queued, the event passes untouched (CROSS in a development build)", () => {
    const keys = setup(closed(), { value: false });
    const e = key('keydown', 'Enter');
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(seen).toEqual(['keydown Enter']);
    expect(keys.menuKey()).toBeNull();
    expect(keys.next()).toBeNull();
  });

  it("(c) the stale rule: an Enter not popped within ENTER_CHAT_STALE_MS is dropped", () => {
    const keys = setup(closed(), { value: true });
    document.body.dispatchEvent(key('keydown', 'Enter'));
    now = ENTER_CHAT_STALE_MS;
    expect(keys.menuKey()).toBe(0x28);                                                   // popped in time
    document.body.dispatchEvent(key('keyup', 'Enter'));
    document.body.dispatchEvent(key('keydown', 'Enter'));
    now += ENTER_CHAT_STALE_MS + 1;                                                      // a popup, a mute or a hosted frame swallowed the pops
    expect(keys.menuKey()).toBeNull();
    now += 1;
    expect(keys.menuKey()).toBeNull();
  });

  it("(c) the screen changing before the pop drops it, and it does not come back with a binding screen", () => {
    const binds = { value: true };
    const keys = setup(closed(), binds);
    document.body.dispatchEvent(key('keydown', 'Enter'));
    binds.value = false;
    expect(keys.menuKey()).toBeNull();
    binds.value = true;
    expect(keys.menuKey()).toBeNull();
  });

  it("(c) another binding screen at the pop drops it: an Enter pressed on one screen never opens the chat of the next (review F1)", () => {
    const binds: { value: boolean; screen?: object } = { value: true, screen: BRIEFING };
    const keys = setup(closed(), binds);
    document.body.dispatchEvent(key('keydown', 'Enter'));                                 // a popup or a focused control's press swallows the pops
    binds.screen = LOBBY;                                                                 // the switch completes inside ENTER_CHAT_STALE_MS
    now = 1;
    expect(keys.menuKey()).toBeNull();
    binds.screen = BRIEFING;
    expect(keys.menuKey()).toBeNull();
    document.body.dispatchEvent(key('keyup', 'Enter'));
    document.body.dispatchEvent(key('keydown', 'Enter'));                                 // pressed on the screen showing: popped
    expect(keys.menuKey()).toBe(0x28);
  });

  it("(c) one slot: two Enters before a pop are one Enter (one open)", () => {
    const keys = setup(closed(), { value: true });
    document.body.dispatchEvent(key('keydown', 'Enter'));
    document.body.dispatchEvent(key('keyup', 'Enter'));
    document.body.dispatchEvent(key('keydown', 'NumpadEnter'));
    expect(keys.menuKey()).toBe(0x58);
    expect(keys.menuKey()).toBeNull();
  });

  it("(d) a keyboard opening before the pop drops the queued Enter: neither step 6 nor the keyboard sees it", () => {
    const state = closed();
    const keys = setup(state, { value: true });
    document.body.dispatchEvent(key('keydown', 'Enter'));
    state.isOpen = true;                                                                  // R1 opened it first
    expect(keys.next()).toBeNull();
    expect(keys.menuKey()).toBeNull();
    state.isOpen = false;
    expect(keys.menuKey()).toBeNull();
  });

  it("(d) the Enter that opens the keyboard is neither typed nor APPLY: its held repeat is dropped once the keyboard is up", () => {
    const state = closed();
    const keys = setup(state, { value: true });
    document.body.dispatchEvent(key('keydown', 'Enter'));
    expect(keys.menuKey()).toBe(0x28);                                                   // step 6: the binding opens the keyboard
    state.isOpen = true;                                                                  // on a later frame
    const r = key('keydown', 'Enter', { repeat: true });
    document.body.dispatchEvent(r);
    expect(keys.next()).toBeNull();                                                      // held from before it opened
    expect(r.defaultPrevented).toBe(true);
    expect(seen).toEqual([]);
    document.body.dispatchEvent(key('keyup', 'Enter'));
    document.body.dispatchEvent(key('keydown', 'Enter'));                                 // a fresh press is the player's APPLY
    expect(keys.next()).toEqual({ hid: 0x28, shift: false, capsLamp: false });
    expect(keys.menuKey()).toBeNull();
  });

  it("(e) with a keyboard up nothing changes: Enter is the keyboard's USB Enter whatever the screen binds", () => {
    for (const value of [true, false]) {
      const keys = setup(open(), { value });
      const e = key('keydown', 'Enter');
      document.body.dispatchEvent(e);
      expect([value, e.defaultPrevented, keys.next()?.hid, keys.menuKey()]).toEqual([value, true, 0x28, null]);
      expect(seen).toEqual([]);
      detach?.(); detach = null;
      document.removeEventListener('keydown', menus, { capture: true });
      document.removeEventListener('keyup', menus, { capture: true });
    }
  });
});

describe("ENTER_OPENS_CHAT_ADAPTATION beside PLAT-11's menu keys: a live menu key wins", () => {
  const fe = () => ({ keyboard: { isOpen: false }, load: () => {}, usbKey: null as (() => UsbKey | null) | null, usbKbdEnterScreen: () => LOBBY as object | null });

  it("MenuPageInput.takesKey: a key of MENU_KEYS_READING while the keys are attached (a development build), nothing before or after", () => {
    const page = new MenuPageInput();
    expect(page.takesKey('Enter')).toBe(false);                                           // never attached: a release build
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const off = page.attach({ tap: () => null }, canvas, window);
    expect(['Enter', 'NumpadEnter', 'KeyX', 'KeyQ'].map((c) => page.takesKey(c))).toEqual([true, true, true, false]);
    off(); canvas.remove();
    expect(page.takesKey('Enter')).toBe(false);
  });

  it("the menus' keys live (a development build), a binding screen: Enter is NOT taken -- nothing queued, it reaches the menus as CROSS", () => {
    const page = new MenuPageInput();
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const detachPage = page.attach({ tap: () => null }, canvas, window);
    const c = connectSoftKeyboard(fe(), window, async () => uiParams(), false, page);
    let reached = 0;
    const after = (): void => { reached++; };                                             // the document's capture phase is reached
    document.addEventListener('keydown', after, { capture: true });
    for (const code of ['Enter', 'NumpadEnter']) {
      document.body.dispatchEvent(key('keydown', code));
      expect([code, page.usbKey?.() ?? null]).toEqual([code, null]);                      // no USB Enter for step 6: no chat
      expect([code, page.read().down.has('CROSS')]).toEqual([code, true]);                // the focused button is pressed, as before
      document.body.dispatchEvent(key('keyup', code));
      page.read();
    }
    expect(reached).toBe(2);
    document.body.dispatchEvent(key('keydown', 'KeyX'));
    expect(page.read().down.has('CROSS')).toBe(true);
    document.body.dispatchEvent(key('keyup', 'KeyX'));
    document.removeEventListener('keydown', after, { capture: true });
    c.detach(); detachPage(); canvas.remove();
  });

  it("the menus' keys not live (a release build), a binding screen: Enter opens the chat -- queued for step 6, default prevented", () => {
    const page = new MenuPageInput();                                                     // its keys never attached
    const c = connectSoftKeyboard(fe(), window, async () => uiParams(), false, page);
    const e = key('keydown', 'Enter');
    document.body.dispatchEvent(e);
    expect([e.defaultPrevented, page.usbKey?.()]).toEqual([true, 0x28]);
    expect(page.read().down.has('CROSS')).toBe(false);
    c.detach();
  });

  it("the keys' own predicate: a key the menus take passes untouched whatever the screen binds; one they do not is the adaptation's", () => {
    for (const live of [true, false]) {
      const keys = new SoftKeyboardKeys(() => 0);
      const off = keys.attach(window, { isOpen: false }, false, () => LOBBY, (code) => live && code === 'Enter');
      const e = key('keydown', 'Enter');
      document.body.dispatchEvent(e);
      expect([live, e.defaultPrevented, keys.menuKey()]).toEqual([live, !live, live ? null : 0x28]);
      const n = key('keydown', 'NumpadEnter');                                            // not a key this predicate takes
      document.body.dispatchEvent(n);
      expect([live, n.defaultPrevented, keys.menuKey()]).toEqual([live, true, 0x58]);
      off();
    }
  });
});

describe("connectSoftKeyboard: the menus' source given step 6's pop, the target asked whether its screen binds USBKBD_ENTER", () => {
  it("hands the menus' source the queue's Enter and takes it back at the detach", async () => {
    let binds = true;
    const fe = { keyboard: { isOpen: false }, load: () => {}, usbKey: null as (() => UsbKey | null) | null, usbKbdEnterScreen: () => (binds ? LOBBY : null) };
    const source: MenuInputSource = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
    const c = connectSoftKeyboard(fe, window, async () => uiParams(), false, source);
    await c.loaded;
    document.body.dispatchEvent(key('keydown', 'Enter'));
    expect(source.usbKey?.()).toBe(0x28);
    expect(fe.usbKey?.()).toBeNull();
    binds = false;
    const e = key('keydown', 'Enter');
    document.body.dispatchEvent(e);
    expect([e.defaultPrevented, source.usbKey?.()]).toEqual([false, null]);
    c.detach();
    expect(source.usbKey).toBeUndefined();
  });

  it("a target with no predicate queues no Enter (every screen is today's)", () => {
    const fe = { keyboard: { isOpen: false }, load: () => {}, usbKey: null as (() => UsbKey | null) | null };
    const source: MenuInputSource = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
    const c = connectSoftKeyboard(fe, window, async () => uiParams(), false, source);
    const e = key('keydown', 'Enter');
    document.body.dispatchEvent(e);
    expect([e.defaultPrevented, source.usbKey?.() ?? null]).toEqual([false, null]);
    c.detach();
  });
});
