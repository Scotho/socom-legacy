// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { livePad } from '../../src/console/adapters/pad';
import { liveRemap } from '../../src/console/adapters/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ACTION_ROW, REMAP_ROW, type Adapters } from '../../src/console/state';
import { REMAP_FINISH_TOAST } from '../../src/console/render/remap';
import { HOLD_TO_BIND_MS_ADAPTATION } from '../../src/padLayout';
import { knownLayout } from '../../src/padKnownLayouts';
import { PAD_SELECTION_KEY } from '../../src/setupPad';
import { GamePad } from '../../src/setupPad';
import { SETUP_KEY, controllerStanceMode, parseController } from '../../src/startupSettings';
import { mountShell } from './shell';

/**
 * OBF-10 (the owner: "playstation pad rebinding on the menu"): a remap driven end to end through the LIVE chain -- the
 * console's own pad reading (`livePad`, the menus' `GamePad` through the profile) as the walker, and the live remap
 * adapter (`liveRemap`, its hold to bind) -- with a PlayStation pad and an Xbox pad, as a player's frames would. A browser
 * adaptation with no original (OT.R28).
 */
type Btn = { pressed: boolean; touched: boolean; value: number };
type Pad = { index: number; id: string; connected: boolean; mapping: string; timestamp: number; axes: number[]; buttons: Btn[] };
const make = (id: string, n: number): Pad => ({ index: 0, id, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 })) });
/** Each pad as the browser names it, and the words its own print gives buttons 8, 9, 16 and the last one. */
const PADS: Record<string, { make: () => Pad; names: [string, string, string, string] }> = {
  'DualSense (Chromium)': { make: () => make('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 18), names: ['Create', 'Options', 'PS', 'Touchpad'] },
  'DualShock 4 (Chromium)': { make: () => make('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 18), names: ['Share', 'Options', 'PS', 'Touchpad'] },
  'DualShock 4 (Firefox)': { make: () => make('054c-09cc-Wireless Controller', 18), names: ['Share', 'Options', 'PS', 'Touchpad'] },
  'Xbox (Chromium, XInput)': { make: () => make('Xbox 360 Controller (XInput STANDARD GAMEPAD)', 17), names: ['View', 'Menu', 'Guide', 'Guide'] },
};
const hold = (p: Pad, ...down: number[]): void => { p.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; }); };
const stored = (): ReturnType<typeof parseController> | null => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(`${SETUP_KEY}.pad.`) && k !== PAD_SELECTION_KEY) return parseController(localStorage.getItem(k));
  }
  return null;
};

let page: ConsolePage | null = null;
let pads: Pad[] = [];
let t = 10_000;
let frame: ((now: number) => void) | null = null;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mountShell(document);
  pads = []; t = 10_000; frame = null;
  window.requestAnimationFrame = ((cb: (now: number) => void) => { frame = cb; return 1; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => { frame = null; }) as typeof window.cancelAnimationFrame;
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
});
afterEach(() => {
  page?.dispose(); page = null;
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  localStorage.clear();
  vi.useRealTimers();
});

function bootLive(p: Pad) {
  pads = [p];
  const source = { getGamepads: () => pads };
  const pad = livePad(() => {}, { source });
  const remap = liveRemap(window, pad, { pads: source, now: () => t });
  const a: Adapters = { ...sampleAdapters(), pad, remap };
  page = bootConsole(document, window, a, { keymap: false });
  return { ctl: page.ctl, remap, pad };
}
const tick = (ms = 16): void => { t += ms; const f = frame; frame = null; f?.(t); };
/** A press on the pad as a player makes it: down for a few frames, then let go for a few. */
const tap = (p: Pad, b: number): void => { hold(p, b); tick(); tick(); hold(p); tick(); tick(); };
/** Held through the hold-to-bind and let go. */
const holdToBind = (p: Pad, b: number): void => { hold(p, b); for (let ms = 0; ms <= HOLD_TO_BIND_MS_ADAPTATION + 100; ms += 16) tick(); hold(p); tick(); tick(); };

describe.each(Object.entries(PADS))('OBF-10: a remap end to end, live chain: %s', (_name, { make: mk, names }) => {
  it('the screen opened by the pad, Triangle onto Square by a swap, saved, read by the menus and by the match', () => {
    const p = mk();
    const { ctl, remap } = bootLive(p);
    for (let i = 0; i < 4; i++) tick();
    ctl.doAct('opt:controller');
    ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
    tap(p, 0);                                               // the pad's Cross on the row: the screen
    expect(ctl.S.screen).toBe('remap');
    tick(); tick();
    tap(p, 13); tap(p, 13); tap(p, 13);                      // down to Triangle's row
    expect(ctl.S.rm.row).toBe(REMAP_ACTION_ROW + 3);         // STANCE-TOP: the Stance mode is row 0
    tap(p, 0);                                               // Cross: listen
    expect(remap.current()!.listening()).toBe(3);
    holdToBind(p, 2);                                        // Square, held: the question (Square drives Square)
    expect(ctl.S.overlay).toBe('confirm');
    expect(ctl.S.confirmRow).toBe(2);
    tap(p, 12); tap(p, 12);                                  // up to Swap
    expect(ctl.S.confirmRow).toBe(0);
    tap(p, 0);                                               // Cross: Swap
    expect(ctl.S.overlay).toBeNull();
    expect(stored()!.bindings[3]).toBe(2);
    expect(stored()!.bindings[2]).toBe(3);
    // The menus' reading follows at once: the physical Square is the logical Triangle.
    tick(); tick();
    tap(p, 13);                                              // the walker still moves
    expect(ctl.S.rm.row).toBe(REMAP_ACTION_ROW + 4);
    tap(p, 1);                                               // Circle: back to Options
    expect(ctl.S.screen).toBe('options');
    // The match's reading (`GamePad`, as main reads it) through the same profile.
    const game = new GamePad({ waitForRest: false });
    hold(p, 2);
    const read = game.poll({ getGamepads: () => pads })!;
    expect(read.buttons[3]!.pressed).toBe(true);
    expect(read.buttons[2]!.pressed).toBe(false);
  });

  it('the buttons whose print differs from the PS2 pad (8, 9, 16 PS / Guide, 17 the touchpad) are named as the pad prints them: the row, the toast', () => {
    const p = mk();
    const { ctl, remap } = bootLive(p);
    for (let i = 0; i < 4; i++) tick();
    ctl.doAct('opt:controller');
    ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
    tap(p, 0);
    tick(); tick();
    tap(p, 13); tap(p, 13);                                  // Square's row
    tap(p, 0);
    expect(remap.current()!.listening()).toBe(2);
    const extra = p.buttons.length - 1;
    holdToBind(p, extra);
    expect(stored()!.bindings[2]).toBe(extra);
    const m = remap.current()!;
    expect([m.label(8), m.label(9), m.label(16), m.label(extra)]).toEqual(names);
    expect(ctl.S.toast).toBe(`Square now uses ${names[3]}.`);
    const glyph = document.querySelectorAll('#stage [data-act="remaprow"]')[REMAP_ACTION_ROW + 2]!.querySelector('.cx-item__state')!;
    expect(glyph.textContent).toBe(names[3]);
  });
});

/**
 * OBF-10b: a PlayStation pad the browser reads WITHOUT the standard mapping (common over Bluetooth, and in Firefox) is
 * read through its built-in layout (`../../src/padKnownLayouts`, SDL's DirectInput and macOS entries; the HID button
 * order the one stated assumption), so the mapping screen takes its buttons at once. Raw HID order: Square 0, Cross 1,
 * Circle 2, Triangle 3, L1 4, R1 5, Share 8, Options 9, L3 10, R3 11, PS 12; L2 / R2 axes 3 / 4 from -1; the sticks 0/1
 * and 2/5; the d-pad a hat on axis 9 (Chromium's eighths, rest outside [-1, 1]).
 */
const HAT_REST = 3.2857;
/** A standard button's raw source on such a pad (the layout under test, written out by hand from SDL's lines). */
const RAW_BUTTON: Record<number, number> = { 0: 1, 1: 2, 2: 0, 3: 3, 4: 4, 5: 5, 8: 8, 9: 9, 10: 10, 11: 11, 16: 12 };
const HAT_OF: Record<number, number> = { 12: 0, 15: 2, 13: 4, 14: 6 };
const rawSony = (id: string, buttons: number, axes = 10): Pad => {
  const p = make(id, buttons);
  p.mapping = '';
  p.axes = [0, 0, 0, -1, -1, 0, 0, 0, 0, HAT_REST, 0, 0].slice(0, axes);
  return p;
};
/** Holds standard buttons on the raw pad (none: everything at rest). */
let rawMap: Record<number, number> = RAW_BUTTON;
const holdStd = (p: Pad, ...std: number[]): void => {
  hold(p, ...std.flatMap((s) => (rawMap[s] === undefined ? [] : [rawMap[s]!])));
  p.axes[3] = std.includes(6) ? 1 : -1;
  p.axes[4] = std.includes(7) ? 1 : -1;
  const hat = std.find((s) => HAT_OF[s] !== undefined);
  if (p.axes.length > 9) p.axes[9] = hat === undefined ? HAT_REST : -1 + HAT_OF[hat]! * 2 / 7;
};
const tapStd = (p: Pad, s: number): void => { holdStd(p, s); tick(); tick(); holdStd(p); tick(); tick(); };
const holdStdToBind = (p: Pad, s: number): void => { holdStd(p, s); for (let ms = 0; ms <= HOLD_TO_BIND_MS_ADAPTATION + 100; ms += 16) tick(); holdStd(p); tick(); tick(); };

/**
 * OBF-10b's review (1): Teach again reached with the pad alone -- the d-pad (its hat) down past the last row, Cross on
 * it -- for a pad read through a built-in layout whose raw buttons are `map`.
 */
function teachAgainByPad(p: Pad, map: Record<number, number>): void {
  rawMap = map;
  const { ctl, remap } = bootLive(p);
  for (let i = 0; i < 4; i++) tick();
  ctl.doAct('opt:controller');
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
  tapStd(p, 0);
  expect(ctl.S.screen).toBe('remap');
  tick(); tick();
  for (let k = 0; k < 30; k++) tapStd(p, 13);
  tapStd(p, 12);                                            // OBF-13: Finish is the last row; Teach again just above it
  const focused = document.querySelector('#stage [data-act="remaprow"].is-focused .cx-item__title');
  expect(focused?.textContent).toBe('Teach again');
  expect(remap.current()!.teachState()).toBeNull();
  tapStd(p, 0);
  expect(remap.current()!.teachState()?.step).toBe(0);
  rawMap = RAW_BUTTON;
}

const RAW_PADS: Record<string, { make: () => Pad; share: string }> = {
  'DUALSHOCK 4 05c4 (Firefox id)': { make: () => rawSony('054c-05c4-Wireless Controller', 14), share: 'Share' },
  'DUALSHOCK 4 v2 09cc (Chromium id, Bluetooth)': { make: () => rawSony('Wireless Controller (Vendor: 054c Product: 09cc)', 14), share: 'Share' },
  'DualSense 0ce6 (Chromium id)': { make: () => rawSony('DualSense Wireless Controller (Vendor: 054c Product: 0ce6)', 15), share: 'Create' },
};

describe.each(Object.entries(RAW_PADS))('OBF-10b: a PlayStation pad without the standard mapping: %s', (_name, { make: mk, share }) => {
  it('reads as a standard pad through its built-in layout: every button, the triggers, the d-pad, the sticks', () => {
    const p = mk();
    expect(knownLayout(p)).not.toBeNull();
    const game = new GamePad({ waitForRest: false });
    const down = (): number[] => game.poll({ getGamepads: () => pads })!.buttons.flatMap((b, i) => (b.pressed ? [i] : []));
    pads = [p];
    holdStd(p);
    expect(down()).toEqual([]);
    for (const s of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) { holdStd(p, s); expect(down(), `standard ${s}`).toEqual([s]); }
    holdStd(p);
    p.axes[0] = 0.6; p.axes[1] = 0.8; p.axes[2] = -0.7; p.axes[5] = 0.9;
    expect(game.poll({ getGamepads: () => pads })!.axes).toEqual([0.6, 0.8, -0.7, 0.9]);
  });

  it('the remap end to end: opened by the pad, Triangle onto Square by a swap, saved, named in the pad\'s words, read by the match', () => {
    const p = mk();
    const { ctl, remap } = bootLive(p);
    for (let i = 0; i < 4; i++) tick();
    ctl.doAct('opt:controller');
    ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
    tapStd(p, 0);                                            // Cross (raw 1): the screen
    expect(ctl.S.screen).toBe('remap');
    const m = remap.current()!;
    expect(m.usable()).toBe(true);
    expect(m.teachState()).toBeNull();                       // no pass asked for
    tick(); tick();
    tapStd(p, 13); tapStd(p, 13); tapStd(p, 13);             // the d-pad (the hat) down to Triangle's row
    expect(ctl.S.rm.row).toBe(REMAP_ACTION_ROW + 3);
    tapStd(p, 0);                                            // Cross: listen
    expect(m.listening()).toBe(3);
    holdStdToBind(p, 2);                                     // Square (raw 0), held: the question
    expect(ctl.S.overlay).toBe('confirm');
    tapStd(p, 12); tapStd(p, 12);                            // up to Swap
    tapStd(p, 0);
    expect(ctl.S.overlay).toBeNull();
    expect(stored()!.bindings[3]).toBe(2);
    expect(stored()!.bindings[2]).toBe(3);
    expect([m.label(8), m.label(9), m.label(16)]).toEqual([share, 'Options', 'PS']);
    tapStd(p, 1);                                            // Circle (raw 2): back
    expect(ctl.S.screen).toBe('options');
    const game = new GamePad({ waitForRest: false });
    holdStd(p, 2);                                           // the raw Square: the logical Triangle in a match
    const read = game.poll({ getGamepads: () => pads })!;
    expect(read.buttons[3]!.pressed).toBe(true);
    expect(read.buttons[2]!.pressed).toBe(false);
  });

  it('Teach again is a row the pad reaches (players use a controller only): the d-pad down to it, Cross begins the pass', () => {
    teachAgainByPad(mk(), RAW_BUTTON);
  });
});

describe('OBF-10b: the built-in Sony layouts ask for what they read, and nothing else', () => {
  it('fewer than ten axes (no hat on axis 9: Firefox\'s d-pad form is not sourced) or than thirteen buttons: the teach pass', () => {
    expect(knownLayout(rawSony('054c-09cc-Wireless Controller', 18, 6))).toBeNull();
    expect(knownLayout(rawSony('054c-09cc-Wireless Controller', 12))).toBeNull();
    expect(knownLayout(rawSony('054c-09cc-Wireless Controller', 18, 12))).not.toBeNull();   // a minimum, not an exact count
  });
  it('the DualSense Edge (0df2, no Windows or macOS entry in SDL) and the standard mapping are not taken', () => {
    expect(knownLayout(rawSony('054c-0df2-DualSense Edge Wireless Controller', 15))).toBeNull();
    expect(knownLayout({ ...rawSony('054c-09cc-Wireless Controller', 18), mapping: 'standard' })).toBeNull();
  });
  it('a pad left to the pass is not remapped until taught: nothing listens', () => {
    const p = rawSony('054c-0ce6-DualSense Wireless Controller', 18, 6);
    const { ctl, remap } = bootLive(p);
    for (let i = 0; i < 4; i++) tick();
    ctl.doAct('opt:controller');
    ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
    ctl.press('cross');
    expect(ctl.S.screen).toBe('remap');
    tick();
    expect(remap.current()!.teachable()).toBe(true);
    expect(remap.current()!.usable()).toBe(false);
    expect(remap.current()!.listen(0)).toBe(false);
  });
});

describe('OBF-10b review (1): Teach again by the pad on the GameSir-G7 HE (the other built-in layout)', () => {
  it('the d-pad reaches the row and Cross begins the pass', () => {
    const p = make('GameSir-G7 HE Controller for Xbox (Vendor: 3537 Product: 1082)', 15);
    p.mapping = '';
    p.axes = [0, 0, 0, -1, -1, 0, 0, 0, 0, HAT_REST];
    // The GameSir's raw buttons (`../../src/padKnownLayouts` XBOX_HID_MACOS): A 0, B 1, X 3, Y 4, LB 6, RB 7, View 10, Menu 11.
    teachAgainByPad(p, { 0: 0, 1: 1, 2: 3, 3: 4, 4: 6, 5: 7, 8: 10, 9: 11, 10: 13, 11: 14, 16: 12 });
  });
  it('a standard pad has no such row (nothing to teach)', () => {
    const p = make('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 18);
    const { ctl } = bootLive(p);
    for (let i = 0; i < 4; i++) tick();
    ctl.doAct('opt:controller');
    ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
    ctl.press('cross');
    tick();
    expect([...document.querySelectorAll('#stage .cx-item__title')].map((e) => e.textContent)).not.toContain('Teach again');
  });
});

// STM-1 (STM.R1): the Stance mode row is shown again -- at 0 since STANCE-TOP (the owner, 2026-11-02: "move stance mode
// to the top"), the dead zone under it at 1 since DEAD-UP (the owner, 2026-11-03: "can we move stick dead zone up below
// stance mode"); in COMBINED (the default) the extra rows follow the last action (17, Right) at 18.
describe('OBF-10b fold: the extra row just after the screen\'s own rows (18 in COMBINED) is none of the Stance mode\'s', () => {
  it('on Teach again, Left / Right / Square leave the Stance mode alone, and the legend is the row\'s own', () => {
    const p = rawSony('054c-09cc-Wireless Controller', 14);
    const { ctl } = bootLive(p);
    for (let i = 0; i < 4; i++) tick();
    ctl.doAct('opt:controller');
    ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
    ctl.press('cross');
    tick();
    // STANCE-TOP, DEAD-UP: from Cross (row 2, where the screen opens) to the last of the screen's own rows (17, Right).
    // h59U9CLb: Extra binds (18) comes first among the extra rows; Teach again follows it (19).
    expect(REMAP_ACTION_ROW).toBe(2);
    for (let k = REMAP_ACTION_ROW; k < 19; k++) ctl.press('down');
    expect(document.querySelector('#stage [data-act="remaprow"].is-focused .cx-item__title')?.textContent).toBe('Teach again');
    for (const b of ['square', 'right', 'left', 'right'] as const) ctl.press(b);
    expect(controllerStanceMode()).toBe('pop');
    const legend = document.querySelector('#legend')!.textContent!;
    expect(legend).toContain('Teach again');
    expect(legend).not.toContain('Reset to default');
  });
});

/**
 * OBF-13 (the owner: "Add a finish button to controller binding UI for people"): a Finish row last on the mapping screen,
 * reached by the d-pad and taken by Cross, or clicked: the screen closes back to Options > Controller on its Button
 * mapping row, with a short confirmation (every binding is saved as it is made). A browser adaptation (OT.R28).
 */
describe('OBF-13: Finish closes the button mapping screen with a confirmation', () => {
  const open = (p: Pad) => {
    const r = bootLive(p);
    for (let i = 0; i < 4; i++) tick();
    r.ctl.doAct('opt:controller');
    r.ctl.S.opt.row = r.ctl.A.options.categories()[r.ctl.S.opt.cat]!.rows.findIndex((x) => x.id === REMAP_ROW);
    return r;
  };
  const focusedTitle = (): string | undefined => document.querySelector('#stage [data-act="remaprow"].is-focused .cx-item__title')?.textContent ?? undefined;

  it('an Xbox pad: a binding made, the d-pad down to the last row, Finish; Cross closes back to the Button mapping row, saved', () => {
    const p = PADS['Xbox (Chromium, XInput)']!.make();
    const { ctl, remap } = open(p);
    const from = { ...ctl.S.opt };
    tap(p, 0);
    expect(ctl.S.screen).toBe('remap');
    tick(); tick();
    tap(p, 13); tap(p, 13);                                  // Square's row
    tap(p, 0);
    holdToBind(p, 16);                                       // Guide: free, taken
    expect(stored()!.bindings[2]).toBe(16);
    for (let k = 0; k < 30; k++) tap(p, 13);
    expect(focusedTitle()).toBe('Finish');
    expect(document.querySelector('#legend')!.textContent).toContain('Finish');
    tap(p, 0);
    expect(ctl.S.screen).toBe('options');
    expect(ctl.S.opt).toEqual(from);
    expect(ctl.S.toast).toBe(REMAP_FINISH_TOAST);
    expect(remap.current()).toBeNull();
    expect(stored()!.bindings[2]).toBe(16);                  // nothing undone
  });

  it('a click (mouse or touch) on the Finish row does the same', () => {
    const p = PADS['DualSense (Chromium)']!.make();
    const { ctl } = open(p);
    ctl.press('cross');
    tick();
    const finish = [...document.querySelectorAll<HTMLElement>('#stage [data-act="remaprow"]')].find((e) => e.querySelector('.cx-item__title')?.textContent === 'Finish');
    expect(finish).toBeDefined();
    finish!.click();
    expect(ctl.S.screen).toBe('options');
    expect(ctl.S.toast).toBe(REMAP_FINISH_TOAST);
  });

  it('with no controller (every row locked) Finish still closes', () => {
    const { ctl } = (() => { const r = bootLive(make('x', 17)); pads = []; return r; })();
    for (let i = 0; i < 4; i++) tick();
    ctl.doAct('opt:controller');
    ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((x) => x.id === REMAP_ROW);
    ctl.press('cross');
    tick();
    for (let k = 0; k < 30; k++) ctl.press('down');
    expect(focusedTitle()).toBe('Finish');
    ctl.press('cross');
    expect(ctl.S.screen).toBe('options');
  });
});
