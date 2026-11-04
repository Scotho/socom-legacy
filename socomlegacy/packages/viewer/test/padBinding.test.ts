// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { padKey } from '../src/controllerInput';
import { CROUCH_BIND, EXTRA_DOUBLE_LISTEN, LISTEN_MS, PRONE_BIND, PadBinding, type BindingEvent, type PadBindingStore } from '../src/padBinding';
import { PAD_SELECTION_KEY } from '../src/setupPad';
import { PAD_BUTTON_NAMES, SETUP_KEY, defaultController, parseController, setControllerStanceMode } from '../src/startupSettings';

/**
 * CX-14: `../src/padBinding`, the pad-binding machine lifted out of the setup page's Controller view
 * (`mountControllerView`, retired with CX-26: its machine was its one live part) so the console's
 * button mapping screen drives it too. Its own rules, with no DOM: the events it says, the profile it writes, the
 * device choice through the store it is given, the listen's clock. A browser adaptation (MU.R1, OT.R28).
 */
const pad = (id = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', n = 18, mapping = 'standard') => ({
  index: 0, id, connected: true, mapping,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: n }, () => ({ pressed: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const hold = (p: Pad, ...down: number[]): void => { p.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; }); };
const profile = (): ReturnType<typeof parseController> | null => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(`${SETUP_KEY}.pad.`) && k !== PAD_SELECTION_KEY) return parseController(localStorage.getItem(k));
  }
  return null;
};
const memoryStore = (): PadBindingStore & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, read: (k) => m.get(k) ?? null, save: (k, v) => { m.set(k, v); } };
};

function rig(o: { p?: Pad; store?: PadBindingStore } = {}) {
  const p = o.p ?? pad();
  let t = 5000;
  let pads: Pad[] = [p];
  // `holdMs: 0`: these tests pin the listen's rules with the press taken at once; the hold (LATER 380) has its own below.
  const b = new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0, ...(o.store ? { store: o.store } : {}) });
  const events: BindingEvent[] = [];
  b.onChange((e) => { events.push(e); });
  const step = (...down: number[]): void => { hold(p, ...down); b.frame(t += 16); };
  return { p, b, events, step, kinds: () => events.map((e) => e.kind), at: (v: number) => { t = v; }, now: () => t, lose: () => { pads = []; }, back: () => { pads = [p]; } };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('padBinding: the listen', () => {
  it('waits for every button released, takes the one button pressed, and writes it under the profile', () => {
    const r = rig();
    r.b.frame(r.now());
    hold(r.p, 0);                                        // Cross held from the press that chose the action
    expect(r.b.listen(2)).toBe(true);
    expect(r.b.capturing()).toBe(true);
    expect(r.b.released()).toBe(false);
    r.step(0);
    expect(r.kinds()).toEqual(['listen']);
    r.step();
    expect(r.b.released()).toBe(true);
    expect(r.kinds()).toEqual(['listen', 'released']);
    r.step(16, 3);                                       // two at once: not taken
    expect(r.b.capturing()).toBe(true);
    r.step(16);
    expect(r.events.at(-1)).toEqual({ kind: 'bound', action: 2, physical: 16 });
    expect(r.b.capturing()).toBe(false);
    expect(r.b.listening()).toBe(-1);
    expect(profile()!.bindings[2]).toBe(16);
    expect(r.b.actions()[2]).toEqual({ index: 2, name: 'Square', physical: 16, custom: true });
    expect(r.b.actions()[0]).toEqual({ index: 0, name: 'Cross', physical: 0, custom: false });
    expect(r.b.label(16)).toBe('PS');                     // OBF-10: a PlayStation pad's own print
  });

  it('the clock: 12 s left at the start, still listening at 12000 ms, ended "timeout" past it', () => {
    const r = rig();
    r.b.frame(r.now());
    r.b.listen(8);
    const start = r.now();
    expect(r.b.remaining()).toBe(LISTEN_MS);
    expect(LISTEN_MS).toBe(12000);
    r.at(start + 4500);
    expect(r.b.remaining()).toBe(7500);
    r.b.frame(start + 12000);
    expect(r.b.capturing()).toBe(true);
    r.b.frame(start + 12001);
    expect(r.events.at(-1)).toEqual({ kind: 'end', action: 8, why: 'timeout' });
    expect(r.b.remaining()).toBe(0);
    expect(profile()).toBeNull();
  });

  it('L1 + R1 together cancel, before any release; a pad lost ends it "disconnected"; a non-standard pad is refused', () => {
    const r = rig();
    r.b.frame(r.now());
    r.b.listen(9);
    r.step(4, 5);
    expect(r.events.at(-1)).toEqual({ kind: 'end', action: 9, why: 'cancelled' });
    r.b.listen(10);
    r.lose();
    r.b.frame(r.now() + 16);
    expect(r.events.at(-1)).toEqual({ kind: 'end', action: 10, why: 'disconnected' });
    expect(r.b.standard()).toBe(false);
    expect(r.b.listen(10)).toBe(false);
    const odd = rig({ p: pad('Some HID pad', 12, '') });
    odd.b.frame(odd.now());
    expect(odd.b.raw).not.toBeNull();
    expect(odd.b.standard()).toBe(false);
    expect(odd.b.listen(0)).toBe(false);
    expect(odd.events).toEqual([]);
  });

  it('a lost window ends a listen ("idle"); stop ends one and is nothing without one; cancel always says "cancelled"', () => {
    const r = rig();
    r.b.frame(r.now());
    r.b.listen(1);
    r.b.blur();
    expect(r.events.at(-1)).toEqual({ kind: 'end', action: 1, why: 'idle' });
    r.b.focus();
    r.b.listen(1);
    r.b.stop();
    expect(r.events.at(-1)).toEqual({ kind: 'end', action: 1, why: 'idle' });
    const n = r.events.length;
    r.b.stop();
    expect(r.events).toHaveLength(n);
    r.b.cancel();
    expect(r.events.at(-1)).toEqual({ kind: 'end', action: -1, why: 'cancelled' });
  });
});

describe('padBinding: the conflict', () => {
  const ask = (r: ReturnType<typeof rig>, action: number, physical: number): void => {
    r.step();
    r.b.listen(action);
    r.step();
    r.step(physical);
  };

  it('Swap: the two exchange; the walker is not held back while the question is asked', () => {
    const r = rig();
    r.b.frame(r.now());
    ask(r, 4, 7);
    expect(r.b.question()).toEqual({ action: 4, physical: 7, occupied: 7, refused: null });
    expect(r.b.capturing()).toBe(false);
    expect(r.b.listening()).toBe(4);
    r.step(7);                                           // the question waits: frames take nothing
    expect(r.kinds().at(-1)).toBe('conflict');
    r.b.answer('swap');
    expect(r.events.at(-1)).toEqual({ kind: 'bound', action: 4, physical: 7 });
    expect(profile()!.bindings.slice(4, 8)).toEqual([7, 5, 6, 4]);
    expect(r.b.question()).toBeNull();
  });

  it('Replace leaves the other unbound; Replace on Cross, Circle or START is refused and the question stays; Cancel stores nothing', () => {
    const r = rig();
    r.b.frame(r.now());
    ask(r, 5, 6);
    r.b.answer('replace');
    expect(profile()!.bindings.slice(5, 7)).toEqual([6, -1]);
    expect(r.b.label(-1)).toBe('Unbound');
    const before = profile();
    for (const occupied of [0, 1, 9]) {
      ask(r, 3, occupied);
      r.b.answer('replace');
      const words = `${['Cross', 'Circle', 'START'][[0, 1, 9].indexOf(occupied)]} must stay bound: the menus need it. Swap instead, or cancel.`;
      expect(r.events.at(-1)).toEqual({ kind: 'refused', question: { action: 3, physical: occupied, occupied, refused: words }, words });
      expect(r.b.question()?.refused).toBe(words);
      expect(profile()).toEqual(before);
      r.b.answer('cancel');
      expect(r.events.at(-1)).toEqual({ kind: 'end', action: 3, why: 'cancelled' });
      expect(r.b.question()).toBeNull();
    }
    expect(profile()).toEqual(before);
    r.b.answer('swap');                                  // no question: nothing
    expect(profile()).toEqual(before);
  });

  // Task W2ibPC6c: the START menu's confirms reach YES only by d-pad Left (`../src/startMenu`), so the menus need the d-pad
  // as they need Cross, Circle and START: Replace on a direction is refused, Swap (every action kept bound) is not.
  it('Replace on a d-pad direction is refused and the question stays; Swap onto it binds and keeps the direction bound', () => {
    const names = ['D-pad up', 'D-pad down', 'D-pad left', 'D-pad right'];
    for (const occupied of [12, 13, 14, 15]) {
      localStorage.clear();
      const r = rig();
      r.b.frame(r.now());
      ask(r, 3, occupied);
      const before = profile();
      r.b.answer('replace');
      const words = `${names[occupied - 12]} must stay bound: the menus need it. Swap instead, or cancel.`;
      expect(r.events.at(-1), String(occupied)).toEqual({ kind: 'refused', question: { action: 3, physical: occupied, occupied, refused: words }, words });
      expect(profile()).toEqual(before);
      r.b.answer('swap');
      expect(r.events.at(-1)).toEqual({ kind: 'bound', action: 3, physical: occupied });
      expect([profile()!.bindings[3], profile()!.bindings[occupied]]).toEqual([occupied, 3]);
    }
  });

  it('a pad lost while the question is asked ends it "disconnected"', () => {
    const r = rig();
    r.b.frame(r.now());
    ask(r, 2, 3);
    r.lose();
    r.b.frame(r.now() + 16);
    expect(r.events.at(-1)).toEqual({ kind: 'end', action: 2, why: 'disconnected' });
    expect(r.b.question()).toBeNull();
  });
});

describe('padBinding: no lock-out by a Swap from an unbound action (the batch review\'s F2)', () => {
  it('fire mode onto R3\'s button by Replace (R3 unbound), then R3 onto d-pad Left\'s button: Swap refused, the question kept', () => {
    const L3 = 10, R3 = 11, LEFT = 14;
    const r = rig();
    r.b.frame(r.now());
    r.b.listen(L3); r.step(); r.step(R3);
    r.b.answer('replace');
    expect(r.b.actions()[R3]!.physical).toBe(-1);
    r.b.listen(R3); r.step(); r.step(LEFT);
    expect(r.b.question()).toMatchObject({ action: R3, occupied: LEFT });
    r.b.answer('swap');
    expect(r.events.at(-1)!.kind).toBe('refused');
    expect(r.b.question()?.refused).toContain('must stay bound');
    expect(r.b.actions()[LEFT]!.physical).toBe(LEFT);
    expect(r.b.actions()[R3]!.physical).toBe(-1);
    r.b.answer('cancel');
    expect(r.b.question()).toBeNull();
  });
  it('a Swap from a bound action onto a menu button still works', () => {
    const SQUARE = 2, LEFT = 14;
    const r = rig();
    r.b.frame(r.now());
    r.b.listen(SQUARE); r.step(); r.step(LEFT);
    r.b.answer('swap');
    expect([r.b.actions()[SQUARE]!.physical, r.b.actions()[LEFT]!.physical]).toEqual([LEFT, SQUARE]);
  });
});

describe('padBinding: the settings beside the bindings', () => {
  it('Restore defaults writes defaultController() (a listen ended first); the dead zone clamps to 0-0.4; the crouch saves', () => {
    const r = rig();
    r.b.frame(r.now());
    r.b.setDeadZone(0.3);
    expect(profile()!.deadZone).toBe(0.3);
    r.b.setDeadZone(0.9);
    expect(r.b.deadZone()).toBe(0.4);
    r.b.setDeadZone(-1);
    expect(r.b.deadZone()).toBe(0);
    r.b.setCrouch(10);
    expect(profile()!.crouch).toBe(10);
    expect(r.b.crouch()).toBe(10);
    r.b.listen(0);
    r.b.restoreDefaults();
    expect(r.kinds().slice(-2)).toEqual(['end', 'restored']);
    expect(profile()).toEqual(defaultController());
  });

  // PP-5 (OT.R67; PP.R1: "bind prone and crouch as two separate keybinds, as those who use emulators do"): Crouch (the
  // crouch shortcut's field, its saved values kept) and Prone are listened for and bound as the sixteen are.
  it('Crouch and Prone listen and bind like a button; a button an action uses is taken without a question (it is masked)', () => {
    const r = rig();
    r.b.frame(r.now());
    expect([r.b.bindName(CROUCH_BIND), r.b.bindName(PRONE_BIND), r.b.bindName(3)]).toEqual(['Crouch', 'Prone', 'Triangle']);
    expect(r.b.listen(CROUCH_BIND)).toBe(true);
    r.step();
    r.step(11);
    expect(r.b.crouch()).toBe(11);
    expect(profile()!.crouch).toBe(11);
    expect(r.events.at(-1)).toEqual({ kind: 'bound', action: CROUCH_BIND, physical: 11 });
    r.step();
    expect(r.b.listen(PRONE_BIND)).toBe(true);
    r.step();
    r.step(10);                                          // L3: the logical L3's button, taken over (masked)
    expect(r.b.prone()).toBe(10);
    expect(profile()!).toMatchObject({ crouch: 11, prone: 10 });
    expect(r.b.actions()[10]!.physical).toBe(10);          // the action keeps its binding; the match masks the button
  });

  it('Prone on Crouch\'s button asks; Swap trades them, Replace unbinds Crouch, Cancel keeps both', () => {
    for (const [answer, want] of [['swap', { crouch: 12, prone: 11 }], ['replace', { crouch: -1, prone: 11 }], ['cancel', { crouch: 11, prone: 12 }]] as const) {
      localStorage.clear();
      const r = rig();
      r.b.frame(r.now());
      r.b.setCrouch(11);
      r.b.setProne(12);
      r.b.listen(PRONE_BIND);
      r.step();
      r.step(11);
      expect(r.b.question(), answer).toMatchObject({ action: PRONE_BIND, physical: 11, occupied: CROUCH_BIND });
      r.b.answer(answer);
      expect({ crouch: r.b.crouch(), prone: r.b.prone() }, answer).toEqual(want);
    }
  });

  // The batch review's F1: the menus need Cross, Circle and START (`resolveConflict`'s rule), so no bind takes them.
  // Task W2ibPC6c: and the d-pad, which the START menu's confirms need (a bind masks its button in the match).
  it('Crouch or Prone on Cross, Circle, START or a d-pad direction is refused, the listen kept; another button then binds', () => {
    for (const menu of [0, 1, 9, 12, 13, 14, 15]) {
      localStorage.clear();
      const r = rig();
      r.b.frame(r.now());
      r.b.listen(PRONE_BIND);
      r.step();
      r.step(menu);
      expect(r.b.prone(), String(menu)).toBe(-1);
      expect(r.events.at(-1)).toMatchObject({ kind: 'refused' });
      expect((r.events.at(-1) as { words: string }).words).toMatch(/must stay a menu button/);
      expect((r.events.at(-1) as { words: string }).words).toMatch(/cannot take Cross, Circle, START or the d-pad/);
      expect(r.b.listening()).toBe(PRONE_BIND);
      r.step();
      r.step(11);
      expect(r.b.prone()).toBe(11);
    }
  });

  // The batch review's F4: an action listened onto a bind's button asks, as onto another action's.
  it('an action onto a bind\'s button asks; Swap gives the bind the action\'s old button, Replace unbinds it', () => {
    for (const [answer, want] of [['swap', 10], ['replace', -1]] as const) {
      localStorage.clear();
      const r = rig();
      r.b.frame(r.now());
      r.b.setCrouch(16);                                  // the centre button, no action's
      r.b.listen(10);                                     // L3
      r.step();
      r.step(16);                                         // Crouch's button
      expect(r.b.question(), answer).toMatchObject({ action: 10, physical: 16, occupied: CROUCH_BIND });
      r.b.answer(answer);
      expect([r.b.actions()[10]!.physical, r.b.crouch()], answer).toEqual([16, want]);
    }
  });

  it('setProne saves under the profile; Restore defaults unbinds both', () => {
    const r = rig();
    r.b.frame(r.now());
    r.b.setCrouch(10);
    r.b.setProne(6);
    expect(profile()!).toMatchObject({ crouch: 10, prone: 6 });
    r.b.restoreDefaults();
    expect(profile()!).toMatchObject({ crouch: -1, prone: -1 });
  });

  it('an Xbox layout names its buttons in its own words', () => {
    const r = rig({ p: pad('Xbox 360 Controller (XInput STANDARD GAMEPAD)', 17) });
    r.b.frame(r.now());
    expect([0, 4, 9, 12].map((i) => r.b.label(i))).toEqual(['A / Cross', 'LB', 'Menu', 'Up']);
    expect(r.b.label(16)).toBe('Guide');                 // OBF-10: the centre button, as the overlay's binding names it
  });

  it('the device choice: read from the store it is given, written there on select (a listen ended, then "device")', () => {
    const store = memoryStore();
    const p = pad();
    store.m.set(PAD_SELECTION_KEY, padKey(p));
    const r = rig({ p, store });
    expect(r.b.selection()).toBe(padKey(p));
    r.b.frame(r.now());
    r.b.listen(0);
    r.b.select('auto');
    expect(r.kinds().slice(-2)).toEqual(['end', 'device']);
    expect(store.m.get(PAD_SELECTION_KEY)).toBe('auto');
    expect(localStorage.getItem(PAD_SELECTION_KEY)).toBeNull();
    expect(r.b.selection()).toBe('auto');
  });

  it('the sixteen actions are the standard order\'s, and the machine names no DOM', () => {
    const r = rig();
    expect(r.b.actions().map((a) => a.name)).toEqual([...PAD_BUTTON_NAMES]);
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/padBinding.ts'), 'utf-8');
    expect(src).not.toMatch(/\b(?:document|window)\s*\.|\bHTML[A-Za-z]*Element\b|addEventListener/);
  });
});

/**
 * h59U9CLb task 5 (a **browser adaptation**, off by default): the extra binds' listens -- a double bind (one button held, an
 * action chosen first) and a combo (the modifier held, then the button with it) -- saved under the profile's extras key
 * (`../src/padExtras` `padExtrasKeyOf`), validated as the match reads them; every button keeps its own action (Q2), a
 * same-thumb combo kept with its warning (Q3); remove one, clear them, and Restore defaults clears them.
 */
describe('padBinding: the extra binds (h59U9CLb)', () => {
  const SQUARE = 2, L1 = 4, R1 = 5, R3 = 11, PS = 16;
  const extrasStored = (): unknown => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(`${SETUP_KEY}.pad.extras.`)) return JSON.parse(localStorage.getItem(k)!);
    }
    return null;
  };
  it('a double bind: released first, then the one button held -- saved, the button keeping its own action', () => {
    const r = rig();
    r.b.frame(r.now());
    hold(r.p, 0);
    expect(r.b.listenExtra('double', 'fire')).toBe(true);
    expect(r.b.listening()).toBe(EXTRA_DOUBLE_LISTEN);
    expect(r.b.capturing()).toBe(true);
    r.step(0);
    expect(r.b.extraList()).toEqual([]);
    r.step();
    r.step(SQUARE);
    expect(r.events.at(-1)).toEqual({ kind: 'extra', change: 'added' });
    expect(r.b.listening()).toBe(-1);
    expect(r.b.extraList()).toEqual([{ kind: 'double', modifier: -1, button: SQUARE, action: 'fire' }]);
    expect(extrasStored()).toEqual({ version: 1, doubles: [{ button: SQUARE, action: 'fire' }], combos: [] });
    expect(r.b.actions()[SQUARE]!.physical).toBe(SQUARE);                // Q2: Square still jumps
  });
  it('the overlay\'s button is refused, the listen kept for another; L1 and R1 together cancel', () => {
    const r = rig();
    r.b.frame(r.now());
    r.b.listenExtra('double', 'reload');
    r.step();
    r.step(PS);
    expect(r.events.at(-1)!.kind).toBe('refused');
    expect(r.b.listening()).toBe(EXTRA_DOUBLE_LISTEN);
    r.step();
    r.step(L1, R1);
    expect(r.events.at(-1)).toEqual({ kind: 'end', action: EXTRA_DOUBLE_LISTEN, why: 'cancelled' });
    expect(r.b.extraList()).toEqual([]);
  });
  it('a combo: the modifier held alone, then the button with it; together on one frame, or the modifier let go, starts over', () => {
    const r = rig();
    r.b.frame(r.now());
    r.b.listenExtra('combo', 'reload');
    r.step();
    r.step(L1, SQUARE);                                                   // both at once: no modifier
    r.step(L1, SQUARE);
    expect(r.b.extraList()).toEqual([]);
    r.step();
    r.step(L1);
    expect(r.b.extraModifier()).toBe(L1);
    r.step();                                                             // let go: over
    expect(r.b.extraModifier()).toBe(-1);
    r.step(L1);
    r.step(L1, SQUARE);
    expect(r.b.extraList()).toEqual([{ kind: 'combo', modifier: L1, button: SQUARE, action: 'reload' }]);
    expect(r.b.listening()).toBe(-1);
  });
  it('a same-thumb combo is kept, with its warning (Q3)', () => {
    const r = rig();
    r.b.frame(r.now());
    r.b.listenExtra('combo', 'fire');
    r.step(); r.step(R3); r.step(R3, SQUARE);
    expect(r.b.extraList()).toEqual([{ kind: 'combo', modifier: R3, button: SQUARE, action: 'fire', warning: 'same-thumb' }]);
  });
  it('SEPARATE\'s held bind is refused as a modifier', () => {
    const r = rig();
    setControllerStanceMode('separate');
    r.b.frame(r.now());
    r.b.setProne(R3);
    r.b.listenExtra('combo', 'fire');
    r.step(); r.step(R3); r.step(R3, SQUARE);
    expect(r.events.at(-1)!.kind).toBe('refused');
    expect(r.b.extraList()).toEqual([]);
  });
  it('remove one, clear them all; Restore defaults clears them too', () => {
    const r = rig();
    r.b.frame(r.now());
    for (const [kind, action, keys] of [['double', 'fire', [[SQUARE]]], ['combo', 'reload', [[L1], [L1, SQUARE]]], ['double', 'jump', [[R3]]]] as const) {
      r.b.listenExtra(kind, action);
      r.step();
      for (const k of keys) r.step(...k);
    }
    expect(r.b.extraList().map((x) => x.action)).toEqual(['fire', 'jump', 'reload']);   // the doubles, then the combos
    r.b.removeExtra(1);
    expect(r.events.at(-1)).toEqual({ kind: 'extra', change: 'removed' });
    expect(r.b.extraList().map((x) => x.action)).toEqual(['fire', 'reload']);
    r.b.clearExtras();
    expect(r.b.extraList()).toEqual([]);
    expect(extrasStored()).toEqual({ version: 1, doubles: [], combos: [] });
    r.b.listenExtra('double', 'fire'); r.step(); r.step(SQUARE);
    r.b.restoreDefaults();
    expect(r.b.extraList()).toEqual([]);
    expect(extrasStored()).toEqual({ version: 1, doubles: [], combos: [] });
  });
  it('Restore defaults with no extras stored writes no extras key', () => {
    const r = rig();
    r.b.frame(r.now());
    r.b.restoreDefaults();
    expect(extrasStored()).toBeNull();
  });
});
