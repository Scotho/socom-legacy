// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveRemap, remapAdapter } from '../../src/console/adapters/remap';
import { prompts } from '../../src/console/render/legend';
import { RESTORE_CONFIRM } from '../../src/console/render/overlay';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAD_ART } from '../../src/console/render/padArt';
import { remapActionRow, REMAP_ASKING_WORDS, REMAP_CROUCH_ROW, remapDeadRow, REMAP_PRONE_ROW, REMAP_STANCE_ROW, padTeachMarks, remapOwnRows, type PadTeachMark } from '../../src/console/render/remap';
import { TEACH_STEPS } from '../../src/padLayout';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { HOME_CATEGORY, REMAP_ROW, type Adapters } from '../../src/console/state';
import { captureLauncher } from '../../src/console/history';
import { pageList } from '../../src/console/grammar';
import { PadBinding } from '../../src/padBinding';
import { PAD_SELECTION_KEY } from '../../src/setupPad';
import { SETUP_KEY, controllerStanceMode, defaultController, parseController, setControllerStanceMode } from '../../src/startupSettings';
import { mountShell } from './shell';

/**
 * CX-14 (the console launcher plan; CX.R13, OT.R60): button mapping as a console screen. Options > Controller's Button
 * mapping row pushes it, as Rooms and Replays are pushed; it drives `../../src/padBinding` (the machine the setup page's
 * Controller view drives too) and draws in the console's own parts -- an ActionList row per action with its bound
 * button's glyph, the Confirm for a conflict (Swap / Replace / Cancel) and for Restore defaults (Triangle), Options'
 * tuners for the dead zone and the crouch shortcut, the legend. The console's pad walker stands down while a binding is
 * listened for. A browser adaptation with no original (OT.R28); nothing of the game's behaviour.
 */
const pad = (id = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', mapping = 'standard') => ({
  index: 0, id, connected: true, mapping, timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
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
  pads = [];
  t = 10_000;
  frame = null;
  // The page's frame by hand: the console's pad poll is run one frame at a time (`tick`).
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

/** The sample adapters with a remap adapter over the shimmed pads and clock. */
function boot(o: { keymap?: boolean; withPad?: Pad | null; holdMs?: number } = {}) {
  const p = o.withPad === undefined ? pad() : o.withPad;
  if (p) pads = [p];
  // `holdMs: 0` but where a test names it: these pin the screen's rules with the press taken at once (LATER 380's hold
  // has its own test below and in `../padTeach.test.ts`).
  const remap = remapAdapter(() => new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: o.holdMs ?? 0 }));
  const a: Adapters = { ...sampleAdapters(), remap };
  page = bootConsole(document, window, a, { keymap: o.keymap ?? true });
  // `p` is null only under `withPad: null`, whose test never reads it (the type checker's view of the helpers).
  return { ctl: page.ctl, A: a, remap, p: p as Pad };
}
/** One frame of the page's pad poll at the next clock tick. */
const tick = (): void => { t += 16; const f = frame; frame = null; f?.(t); };
/** Options > Controller, the Button mapping row focused, Cross: the screen pushed. */
function openScreen(ctl: ConsolePage['ctl']): void {
  ctl.doAct('opt:controller');
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
  ctl.press('cross');
}
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-act="remaprow"]')];
const rowTitle = (i: number): string => rows()[i]!.querySelector('.cx-item__title, .cx-roller__label')!.textContent!;
const rowSub = (i: number): string => rows()[i]!.querySelector('.cx-item__sub')?.textContent ?? '';
const rowValue = (i: number): string => rows()[i]!.querySelector('.cx-roller__value')!.textContent!;
const glyph = (i: number): Element => rows()[i]!.querySelector('.cx-item__state')!;
/** STANCE-TOP: action `i`'s row (the Stance mode is row 0, DEAD-UP's dead zone 1, the actions from `remapActionRow()`). */
const A = (i: number): number => remapActionRow() + i;
const said = (ctl: ConsolePage['ctl']): [string, string][] => prompts(ctl.S, ctl.A).map((x) => [x.k, x.label]);

describe('the grammar opens and closes the screen', () => {
  it('Options > Controller > Button mapping pushes it; Circle goes back to that row', () => {
    const { ctl, remap } = boot();
    openScreen(ctl);
    const at = { ...ctl.S.opt };
    expect(ctl.S.screen).toBe('remap');
    expect(remap.current()).not.toBeNull();
    expect(document.querySelector('#stage section')!.getAttribute('aria-label')).toBe('Button mapping');
    expect(document.querySelector('#stage .cx-title')!.textContent).toBe('Button mapping');
    expect(document.querySelector('#stage .cx-back__label')!.textContent).toBe('Controller');
    expect(document.querySelector('#stage .cx-back')!.getAttribute('aria-label')).toBe('Back to Controller');
    expect(document.getElementById('backdrop')!.classList.contains('is-deep')).toBe(true);
    ctl.press('down');
    expect(ctl.S.rm.row).toBe(A(1));                     // STANCE-TOP: it opens on Cross, the Stance mode above it
    ctl.press('circle');
    expect(ctl.S.screen).toBe('options');
    expect(ctl.S.opt).toEqual(at);
    expect(remap.current()).toBeNull();
  });

  it('browser Back closes the binding machine', async () => {
    const { ctl, remap } = boot();
    ctl.doAct('opt:controller');
    page!.render();
    openScreen(ctl);
    expect(ctl.S.screen).toBe('remap');
    expect(remap.current()).not.toBeNull();
    window.history.back();
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(10);
    expect(ctl.S.screen).toBe('options');
    expect(remap.current()).toBeNull();
  });

  it('Cross on the row opens the screen: no toast, no "until CX-14"', () => {
    const { ctl } = boot();
    ctl.doAct('opt:controller');
    page!.render();
    expect(document.getElementById('stage')!.textContent).not.toMatch(/CX-14|In the overlay/);
    openScreen(ctl);
    expect(ctl.S.toast).toBe('');
  });

  it('without a remap adapter the screen is not pushed (the row\'s own action instead)', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    openScreen(page.ctl);
    expect(page.ctl.S.screen).toBe('options');
  });
});

describe('Cross listens, and the pad walker stands down', () => {
  it('the row says the seconds left; the legend says L1 + R1 to cancel; a press for the binding neither moves nor acts', () => {
    const { ctl, remap, p } = boot();
    openScreen(ctl);
    tick();
    // The pad's Cross on the first row (Cross): the walker's press starts the listen.
    hold(p, 0); tick();
    expect(remap.current()!.listening()).toBe(0);
    expect(ctl.capturing()).toBe(true);
    expect(rowSub(A(0))).toBe('Release all buttons… 12 s');
    expect(said(ctl)).toEqual([['L1 R1', 'Cancel']]);
    hold(p); tick();
    expect(rowSub(A(0))).toBe('Hold a button… 12 s');                  // LATER 380: a binding is a hold
    t += 4000; tick();
    expect(rowSub(A(0))).toBe('Hold a button… 8 s');
    // Down and Circle together: not a binding (two at once), and neither moves the focus nor closes the screen.
    hold(p, 13, 1); tick(); tick();
    expect(ctl.S.rm.row).toBe(A(0));
    expect(ctl.S.screen).toBe('remap');
    expect(ctl.capturing()).toBe(true);
    // The one button (16, the PS button, bound to nothing) is taken; held through the next frames it is no press of the walker's.
    hold(p); tick();
    hold(p, 16); tick();
    expect(ctl.capturing()).toBe(false);
    expect(stored()!.bindings[0]).toBe(16);
    expect(ctl.S.toast).toBe('Cross now uses PS.');
    tick(); tick();
    expect(ctl.S.rm.row).toBe(A(0));
    expect(ctl.S.screen).toBe('remap');
    expect(glyph(A(0)).textContent).toBe('PS');
    // Released, the walker reads the pad again: Down moves the focus.
    hold(p); tick();
    hold(p, 13); tick();
    expect(ctl.S.rm.row).toBe(A(1));
  });

  it('the question of a conflict frees the walker: the pad answers the Confirm', () => {
    const { ctl, p } = boot();
    openScreen(ctl);
    tick();
    hold(p, 0); tick();
    hold(p); tick();
    hold(p, 13); tick();                                 // Down's button, for Cross: the question
    expect(ctl.S.overlay).toBe('confirm');
    expect(ctl.S.confirmKind).toBe('conflict');
    expect(ctl.capturing()).toBe(false);
    tick();                                              // still held: no press
    expect(ctl.S.confirmRow).toBe(2);                    // Cancel first (the console's confirms: the safe answer)
    hold(p); tick();
    hold(p, 12); tick();                                 // Up: Replace
    expect(ctl.S.confirmRow).toBe(1);
    hold(p); tick();
    hold(p, 0); tick();                                  // Cross: Replace refused (task W2ibPC6c: the menus need the d-pad)
    expect(ctl.S.overlay).toBe('confirm');
    expect(document.querySelector('#overlay .cx-field__error')!.textContent).toBe('D-pad down must stay bound: the menus need it. Swap instead, or cancel.');
    hold(p); tick();
    hold(p, 12); tick();                                 // Up: Swap
    expect(ctl.S.confirmRow).toBe(0);
    hold(p); tick();
    hold(p, 0); tick();                                  // Cross: answered
    expect(ctl.S.overlay).toBeNull();
    expect(stored()!.bindings[0]).toBe(13);
    expect(stored()!.bindings[13]).toBe(0);
  });

  it('a release build keyboard is the menu keys only (CX.R6, LR-30): Enter is Cross and starts a listen, and while a button is awaited no key listens or cancels', () => {
    // Was (CX.R6): with no keymap a key neither listened nor cancelled. LR.R24 puts Enter on Cross in every build; the
    // capture itself stays the pad's (a key binds nothing), so Escape while listening is not read.
    const { ctl, remap, p } = boot({ keymap: false });
    openScreen(ctl);
    tick();
    expect(remap.current()!.listening()).toBe(-1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const row = remap.current()!.listening();
    expect(row).toBeGreaterThanOrEqual(0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(remap.current()!.listening()).toBe(row);
    hold(p, 0); tick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(remap.current()!.listening()).toBe(row);               // the pad press is the first half of a bind; the key cancels nothing
  });
});

describe('a conflict reaches the Confirm, each answer stored', () => {
  /** Listen on row `i` and press `physical` by the machine's frame (no walker). */
  function ask(ctl: ConsolePage['ctl'], p: Pad, i: number, physical: number): void {
    ctl.S.rm.row = A(i);
    ctl.press('cross');
    hold(p); ctl.remapFrame(t += 16);
    hold(p, physical); ctl.remapFrame(t += 16);
    hold(p);
  }

  it("the seat's fold (OVERLAY-CONSOLE): while the Confirm asks, the listened row says to answer it, no countdown behind it", () => {
    const { ctl, p } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    ctl.S.rm.row = A(4);
    ctl.press('cross');
    hold(p); ctl.remapFrame(t += 16);
    expect(rowSub(A(4))).toMatch(/^Hold a button… \d+ s$/);
    hold(p, 7); ctl.remapFrame(t += 16);                 // L1 to R2's button: the question
    hold(p);
    expect(ctl.S.confirmKind).toBe('conflict');
    for (let i = 0; i < 5; i++) { t += 1000; ctl.remapFrame(t); }
    expect(rowSub(A(4))).toBe(REMAP_ASKING_WORDS);
    expect(document.getElementById('stage')!.textContent).not.toMatch(/Hold a button…|Release all buttons…|\d+ s/);
    ctl.press('cross');                                  // Cancel
    expect(ctl.S.overlay).toBeNull();
    expect(rowSub(A(4))).not.toBe(REMAP_ASKING_WORDS);
  });

  it('Swap, Replace, Cancel; Replace refused on Cross with the reason in the dialog, the question kept', () => {
    const { ctl, p } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    ask(ctl, p, 4, 7);                                   // L1 to R2's button
    expect(ctl.S.overlay).toBe('confirm');
    const dialog = (): string => document.querySelector('#overlay .cx-dialog')!.textContent!;
    expect(document.querySelector('#overlay [data-key="confirm-conflict"]')).not.toBeNull();
    expect([...document.querySelectorAll('#overlay .cx-toggle')].map((b) => b.textContent)).toEqual(['Swap', 'Replace', 'Cancel']);
    // The controller's button and the action apart (the merge controller's wording, 2026-10-16): "R2 is already bound
    // to R2" read as one thing twice.
    expect(dialog()).toContain('R2 is already used for R2. Swap them, replace it, or cancel.');
    // Cancel first and focused, as every console Confirm starts on its safe answer (OT.R60's one design; the
    // merge controller's call, 2026-10-16): the setup page's view focused Swap.
    expect(ctl.S.confirmRow).toBe(2);
    expect(document.querySelector('#overlay .cx-toggle.is-focused')!.textContent).toBe('Cancel');
    ctl.press('up'); ctl.press('up');                    // Swap
    expect(ctl.S.confirmRow).toBe(0);
    ctl.press('cross');
    expect(ctl.S.overlay).toBeNull();
    expect(stored()!.bindings.slice(4, 8)).toEqual([7, 5, 6, 4]);
    expect(ctl.S.toast).toBe('L1 now uses R2.');

    ask(ctl, p, 5, 6);                                   // R1 to L2's button: Replace
    ctl.press('up');                                     // from Cancel
    ctl.press('cross');
    expect(stored()!.bindings.slice(4, 8)).toEqual([7, 6, -1, 4]);
    expect(glyph(A(6)).textContent).toBe('Unbound');

    const before = stored();
    ask(ctl, p, 3, 0);                                   // Triangle to Cross's button: Cancel by Circle
    ctl.press('circle');
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.capturing()).toBe(false);
    expect(ctl.S.toast).toBe('Binding cancelled.');
    expect(stored()).toEqual(before);

    ask(ctl, p, 3, 0);                                   // and Replace: refused
    ctl.press('up');                                     // from Cancel
    ctl.press('cross');
    expect(ctl.S.overlay).toBe('confirm');
    expect(document.querySelector('#overlay .cx-field__error')!.textContent).toBe('Cross must stay bound: the menus need it. Swap instead, or cancel.');
    expect(stored()).toEqual(before);
    ctl.press('down');                                   // Cancel
    ctl.press('cross');
    expect(ctl.S.overlay).toBeNull();
    expect(stored()).toEqual(before);
  });

  it('a click answers too (the Confirm\'s rows)', () => {
    const { ctl, p } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    ask(ctl, p, 2, 3);
    document.querySelectorAll<HTMLElement>('#overlay .cx-toggle')[0]!.click();
    expect(stored()!.bindings.slice(2, 4)).toEqual([3, 2]);
  });
});

describe('Triangle restores the defaults, behind a Confirm', () => {
  it('No first and focused; Yes writes defaultController()', () => {
    const { ctl } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    ctl.S.rm.row = remapDeadRow();
    ctl.press('right');
    expect(stored()!.deadZone).toBe(0.16);
    ctl.press('triangle');
    expect(ctl.S.overlay).toBe('confirm');
    expect(ctl.S.confirmKind).toBe('restore');
    expect(ctl.S.confirmRow).toBe(0);
    expect(document.querySelector('#overlay .cx-dialog__title')!.textContent).toBe('Restore the defaults?');
    ctl.press('cross');                                  // No
    expect(ctl.S.overlay).toBeNull();
    expect(stored()!.deadZone).toBe(0.16);
    ctl.press('triangle');
    ctl.press('down');
    ctl.press('cross');                                  // Yes
    expect(stored()).toEqual(defaultController());
    expect(ctl.S.toast).toBe('Default bindings and dead zone restored.');
    expect(ctl.S.screen).toBe('remap');
    expect(ctl.S.toast).not.toBe('');
    expect(ctl.S.cat).toBe(HOME_CATEGORY);               // Triangle is not the account here
  });
});

describe('Circle cancels a listen first, then goes back', () => {
  it('the first Circle (a key or the legend\'s prompt) cancels; the second leaves', () => {
    const { ctl, remap } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    ctl.press('cross');
    expect(remap.current()!.listening()).toBe(0);
    ctl.press('down');                                   // not the walker's while listening: nothing
    expect(ctl.S.rm.row).toBe(A(0));
    ctl.press('circle');
    expect(remap.current()!.listening()).toBe(-1);
    expect(ctl.S.screen).toBe('remap');
    expect(ctl.S.toast).toBe('Binding cancelled.');
    ctl.press('cross');
    document.querySelector<HTMLElement>('#legend [data-act="press"][data-b="circle"]')!.click();
    expect(remap.current()!.listening()).toBe(-1);
    ctl.press('circle');
    expect(ctl.S.screen).toBe('options');
  });

  it('L1 + R1 cancel on the pad; 12 s without a press ends it on the warn line', () => {
    const { ctl, remap, p } = boot();
    openScreen(ctl);
    tick();
    hold(p, 0); tick();
    hold(p); tick();
    hold(p, 4, 5); tick();
    expect(remap.current()!.listening()).toBe(-1);
    expect(ctl.S.toast).toBe('Binding cancelled.');
    hold(p); tick();
    hold(p, 0); tick();
    hold(p); tick();
    t += 12_000; tick();
    expect(remap.current()!.listening()).toBe(-1);
    expect(ctl.S.legendError).toBe('No button received. Select a binding to try again.');
  });
});

describe('the live adapter', () => {
  it('one machine at a time; a lost window ends its listen; each change has the console\'s pad read the profile again', () => {
    const p = pad();
    pads = [p];
    const selected: string[] = [];
    const livePad = { connected: () => true, setConnected() {}, read: () => [], deadZone: () => 0.15, setDeadZone() {}, select(k: string) { selected.push(k); } };
    const remap = liveRemap(window, livePad, { pads: { getGamepads: () => pads }, now: () => t });
    const b = remap.open();
    expect(remap.open()).toBe(b);
    b.frame(t += 16);
    b.listen(1);
    window.dispatchEvent(new Event('blur'));
    expect(b.listening()).toBe(-1);
    window.dispatchEvent(new Event('focus'));
    b.setDeadZone(0.2);
    expect(selected).toEqual(['auto']);
    remap.close();
    expect(remap.current()).toBeNull();
    b.listen(1);
    window.dispatchEvent(new Event('blur'));             // closed: its listeners are gone
    expect(b.listening()).toBe(1);
  });
});

describe('the render: the rows and their glyphs', () => {
  // STM-1 (STM.R1, 2026-10-30; was OBF-11's 19 rows): in SEPARATE the Stance mode, the dead zone (DEAD-UP, the owner,
  // 2026-11-03: "can we move stick dead zone up below stance mode"), the actions; SEP-ROWS (the owner, 2026-11-11): Crouch
  // and Prone directly under the Stance mode, above the dead zone (COMBINED shows neither: `remapStanceModes.test.ts`).
  it('the Stance mode first (STANCE-TOP), Crouch and Prone under it (SEPARATE, SEP-ROWS), the dead zone (DEAD-UP), sixteen actions with the console\'s glyphs; the pad named at the top', () => {
    setControllerStanceMode('separate');
    const { ctl, p } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    expect(rows()).toHaveLength(remapOwnRows('separate') + 2); // h59U9CLb: Extra binds; OBF-13: Finish, the last row
    expect(remapOwnRows('separate')).toBe(20);
    expect([REMAP_STANCE_ROW, REMAP_CROUCH_ROW, REMAP_PRONE_ROW, remapDeadRow(), remapActionRow()]).toEqual([0, 1, 2, 3, 4]);
    expect([0, 1, 2, 3, 4].map(rowTitle)).toEqual(['Stance mode', 'Crouch', 'Prone', 'Pad dead zone (this browser)', 'Cross']);
    expect(rowTitle(REMAP_STANCE_ROW)).toBe('Stance mode');
    expect(rows().slice(A(0), A(16)).map((_, i) => rowTitle(A(i)))).toEqual(['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right']);
    for (const [i, k] of [[0, 'cross'], [1, 'circle'], [2, 'square'], [3, 'triangle']] as const) expect(glyph(A(i)).querySelector(`.cx-btn--${k}`)).not.toBeNull();
    expect(glyph(A(4)).querySelector('.cx-shoulder')!.textContent).toBe('L1');
    expect(glyph(A(7)).querySelector('.cx-shoulder.is-trigger')!.textContent).toBe('R2');
    expect(glyph(A(9)).textContent).toBe('Options');                // OBF-10: the PlayStation pad's own print (the action stays Start)
    expect(rows()[A(0)]!.classList.contains('is-focused')).toBe(true);   // STANCE-TOP: it opens on Cross
    expect([rowTitle(remapDeadRow()), rowValue(remapDeadRow())]).toEqual(['Pad dead zone (this browser)', '15%']);
    expect([rowTitle(REMAP_CROUCH_ROW), glyph(REMAP_CROUCH_ROW).textContent]).toEqual(['Crouch', 'Unbound']);
    // The review's F1 (a): a SEPARATE reached through storage (saved, not stepped on the row) clones nothing -- Prone shows
    // Unbound, and Triangle keeps its stance until Prone is bound (`ControllerInput.poll`; `../stanceModes.test.ts`).
    expect([rowTitle(REMAP_PRONE_ROW), glyph(REMAP_PRONE_ROW).textContent]).toEqual(['Prone', 'Unbound']);
    expect([rowTitle(REMAP_STANCE_ROW), rowValue(REMAP_STANCE_ROW)]).toEqual(['Stance mode', 'SEPARATE']);
    expect(document.querySelector('#stage [data-remap-pad]')!.textContent).toBe(p!.id);
    // A swap shows on both rows, the changed one marked.
    ctl.S.rm.row = A(2);
    ctl.press('cross');
    hold(p!); ctl.remapFrame(t += 16);
    hold(p!, 3); ctl.remapFrame(t += 16);
    ctl.press('up'); ctl.press('up');                    // from Cancel to Swap
    ctl.press('cross');
    expect(glyph(A(2)).querySelector('.cx-btn--triangle')).not.toBeNull();
    expect(glyph(A(3)).querySelector('.cx-btn--square')).not.toBeNull();
    expect(rowSub(A(2))).toBe('Changed from the default');
    expect(rowSub(A(0))).toBe('');
  });

  // STM-1: in SEPARATE (Crouch and Prone shown); SEP-ROWS: Crouch and Prone right under the Stance mode (the first row,
  // STANCE-TOP), the dead zone under them (DEAD-UP), Cross right after it.
  it('the tuners: the dead zone steps 1 % and Square resets it; Crouch and Prone listen, Square unbinds; the Stance mode steps', () => {
    setControllerStanceMode('separate');
    const { ctl, p } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    ctl.S.rm.row = remapDeadRow();
    ctl.press('right'); ctl.press('right');
    expect(rowValue(remapDeadRow())).toBe('17%');
    expect(stored()!.deadZone).toBe(0.17);
    ctl.press('square');
    expect(stored()!.deadZone).toBe(0.15);
    ctl.press('down');
    expect(ctl.S.rm.row).toBe(A(0));                            // DEAD-UP: Cross under the dead zone
    ctl.S.rm.row = REMAP_STANCE_ROW;                            // SEP-ROWS: Crouch directly under the Stance mode
    ctl.press('down');
    expect(ctl.S.rm.row).toBe(REMAP_CROUCH_ROW);
    expect(document.querySelector('#stage .cx-aside')!.textContent).toContain('Unbound by default.');
    ctl.press('cross');                                         // listen, as an action's row
    hold(p); ctl.remapFrame(t += 16);
    hold(p, 11); ctl.remapFrame(t += 16);
    hold(p); ctl.remapFrame(t += 16);
    expect(stored()!.crouch).toBe(11);
    expect(glyph(REMAP_CROUCH_ROW).textContent).toBe('R3');
    expect(document.querySelector('#stage .cx-aside')!.textContent).toContain('Replaces R3.');
    ctl.press('down');
    expect(ctl.S.rm.row).toBe(REMAP_PRONE_ROW);
    // The batch review's F2: a bind row's legend is Cross to change it and Square to unbind it, not a tuner's.
    expect(said(ctl)).toEqual([['cross', 'Change'], ['circle', 'Back'], ['square', 'Unbind'], ['triangle', 'Restore defaults']]);
    ctl.press('cross');
    hold(p); ctl.remapFrame(t += 16);
    hold(p, 10); ctl.remapFrame(t += 16);
    hold(p); ctl.remapFrame(t += 16);
    expect(stored()!).toMatchObject({ crouch: 11, prone: 10 });
    ctl.press('square');                                        // Square unbinds the row
    expect(stored()!.prone).toBe(-1);
    expect(glyph(REMAP_PRONE_ROW).textContent).toBe('Unbound');
    ctl.press('down');                                          // SEP-ROWS: the dead zone under Prone
    expect(ctl.S.rm.row).toBe(remapDeadRow());
    ctl.S.rm.row = A(15);                                       // Right, the last of the screen's own; OBF-13: Finish is
    ctl.press('down');
    expect(ctl.S.rm.row).toBe(remapOwnRows());
    expect(rowTitle(remapOwnRows())).toBe('Extra binds');       // h59U9CLb: the extras' row, then Finish
    expect(rowTitle(remapOwnRows() + 1)).toBe('Finish');
    expect(controllerStanceMode()).toBe('separate');
  });

  // LATER 208's spec found it: the conflict's Confirm named the occupied action by `actions()`, so a bind's (16, 17)
  // read empty ("R3 is already used for . Swap them ..."); it names the bind (`PadBinding.bindName`).
  it('Prone onto Crouch\'s button: the Confirm names CROUCH; Restore defaults\' words name the two binds', () => {
    setControllerStanceMode('separate');                        // STM.R1: the bind rows are SEPARATE's
    const { ctl, p, remap } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    remap.current()!.setCrouch(11);
    ctl.S.rm.row = REMAP_PRONE_ROW;
    ctl.press('cross');
    hold(p); ctl.remapFrame(t += 16);
    hold(p, 11); ctl.remapFrame(t += 16);
    expect(document.querySelector('#overlay .cx-dialog__lead')!.textContent).toBe('R3 is already used for CROUCH. Swap them, replace it, or cancel.');
    expect(RESTORE_CONFIRM.lead).toContain('the Crouch and Prone binds');
  });

  it('no pad: "Press any button on your controller", every row locked with its line, nothing listens', () => {
    setControllerStanceMode('separate');                        // STM.R1: the bind rows are SEPARATE's
    const { ctl, remap } = boot({ withPad: null });
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    expect(document.querySelector('#stage [data-remap-pad]')!.textContent).toBe('Press any button on your controller');
    expect(rows().slice(A(0), A(16)).every((r) => r.classList.contains('is-disabled'))).toBe(true);
    expect(rows()[remapDeadRow()]!.classList.contains('is-locked')).toBe(true);
    // PP-5: the Crouch and Prone binds are the pad's (locked as an action's); the Stance mode the browser's (never locked).
    expect([REMAP_CROUCH_ROW, REMAP_PRONE_ROW].every((i) => rows()[i]!.classList.contains('is-disabled'))).toBe(true);
    expect(rowValue(remapDeadRow())).toBe('Connect a controller');
    ctl.press('cross');
    expect(remap.current()!.listening()).toBe(-1);
    expect(ctl.S.legendError).toBe('Connect a controller, then press a button.');
    ctl.S.rm.row = remapDeadRow();
    ctl.press('right');
    expect(stored()).toBeNull();
  });

  // LATER 380: a pad of another layout is no longer refused -- it is taught here (`teachHtml`), the rows waiting for it.
  it('a pad of another layout: named, and the screen asks to teach it (Start, Back)', () => {
    const { ctl } = boot({ withPad: pad('Some HID pad', '') });
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    expect(document.querySelector('#stage [data-remap-pad]')!.textContent).toBe('Some HID pad');
    expect(document.querySelector('#stage [data-key="teach"] .cx-teach__ask')!.textContent).toBe('Teach this controller');
    expect(rows()).toHaveLength(0);
    expect(said(ctl)).toEqual([['cross', 'Start'], ['circle', 'Back']]);
  });

  /**
   * The batch A review's F1: the walker drops the press that completes a binding (`standDown`, read before the
   * machine's frame). On the Cross row, Cross listens; Cross again is taken as its own binding -- and must not reach the
   * walker as a fresh Cross, which would start a second listen at once.
   */
  it('review F1: the press that completes a binding never reaches the walker (no second listen)', () => {
    const { ctl, p } = boot();
    openScreen(ctl);
    tick();
    expect(ctl.S.rm.row).toBe(A(0));                     // Cross's row
    hold(p!, 0); tick();                                 // Cross: listen
    expect(ctl.capturing()).toBe(true);
    hold(p!); tick();                                    // let go
    hold(p!, 0); tick();                                 // Cross again: taken as Cross's own binding
    expect(ctl.capturing()).toBe(false);
    tick(); tick();                                      // still held: no press, no listen
    expect(ctl.capturing()).toBe(false);
    expect(ctl.S.screen).toBe('remap');
    expect(stored()!.bindings[0]).toBe(0);
  });

  /**
   * The batch A review's F2: the conflicting button held through the question walks nothing. On the Square row, Cross
   * listens; d-pad Up (Up's own button) asks the conflict, which opens on Cancel; Up held on past the repeat delay must
   * not step the Confirm off Cancel -- only a fresh press does.
   */
  it('the conflict names the controller button apart from the action: a d-pad button says "D-pad"', () => {
    const { ctl, p } = boot();
    openScreen(ctl);
    tick();
    ctl.S.rm.row = A(2);                                 // Square's row
    hold(p, 0); tick();                                  // Cross: listen
    hold(p); tick();
    hold(p, 12); tick();                                 // d-pad Up, Up's own: the question
    const lead = document.querySelector('#overlay .cx-dialog__lead')!.textContent;
    expect(lead).toBe('D-pad Up is already used for UP. Swap them, replace it, or cancel.');
  });

  it('review F2: the conflicting button held through the question never walks the Confirm off Cancel', () => {
    const { ctl, p } = boot();
    openScreen(ctl);
    tick();
    ctl.S.rm.row = A(2);                                 // Square's row
    hold(p!, 0); tick();                                 // Cross: listen
    hold(p!); tick();
    hold(p!, 12); tick();                                // d-pad Up, Up's own: the question
    expect(ctl.S.overlay).toBe('confirm');
    expect(ctl.S.confirmKind).toBe('conflict');
    expect(ctl.S.confirmRow).toBe(2);
    for (let k = 0; k < 60; k++) tick();                 // ~1 s held: past the walker's repeat delay
    expect(ctl.S.confirmRow).toBe(2);
    hold(p!); tick();                                    // let go, then a fresh Up: the walker moves it
    hold(p!, 12); tick();
    expect(ctl.S.confirmRow).toBe(1);
  });

});

// CX-12: the mapping's rows are a list L2 / R2 page when it overflows its pane -- never while a binding is listened for,
// when every pad button is the binding's (the grammar's `pageList`; the page itself is `grammar.test.ts`'s).
describe('CX-12: the mapping\'s rows are a paged list', () => {
  it('pageList holds its rows and moves its focus; none while a binding is listened for', () => {
    const { ctl, remap } = boot();
    openScreen(ctl);
    const list = pageList(ctl.S, ctl.A)!;
    expect([list.at, list.count]).toEqual([A(0), remapOwnRows('pop') + 2]);   // STANCE-TOP: open on Cross; h59U9CLb: Extra binds; OBF-13: and Finish (STM-1: COMBINED's rows)
    expect(rows()).toHaveLength(remapOwnRows('pop') + 2);
    list.set(4);
    expect(ctl.S.rm.row).toBe(4);
    ctl.S.rm.row = A(0);
    ctl.press('cross');                                                         // the first action: listen for its button
    expect(remap.current()!.listening()).toBeGreaterThanOrEqual(0);
    expect(pageList(ctl.S, ctl.A)).toBeNull();
  });
});

/**
 * LATER 380 (the owner's word, 2026-10-23: "more visual and cohesive ... the ps4 controller the socom2legacy-teaser had and
 * hold button style remapping with as many button icons reused as possile and a clean and pleasing ui"): the screen drawn
 * round the controller (`../../src/console/render/padArt`, one swappable drawing), the action and its button lit both
 * ways, the hold's ring, and a pad of another layout taught on the same screen at its first connect.
 */
describe('LATER 380: the screen drawn round the controller', () => {
  const key = (i: number): Element => document.querySelector(`#stage [data-pad-key="${i}"]`)!;
  const click = (el: Element): void => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };

  it("the drawing: its sixteen buttons, the focused row's button lit, a button clicked focusing its row", () => {
    const { ctl } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    expect(document.querySelector('#stage svg.cx-pad image')!.getAttribute('href')).toMatch(/dualshock4/);
    expect(document.querySelectorAll('#stage [data-pad-key]')).toHaveLength(16);
    expect(key(0).classList.contains('is-lit')).toBe(true);           // Cross's row, Cross's button
    ctl.press('down'); ctl.press('down');
    expect(key(2).classList.contains('is-lit')).toBe(true);           // Square
    expect(key(0).classList.contains('is-lit')).toBe(false);
    click(key(5));                                                     // R1 on the drawing: R1's row
    expect(ctl.S.rm.row).toBe(A(5));
    expect(key(5).classList.contains('is-lit')).toBe(true);
    expect(glyph(A(12)).querySelector('.cx-dpad')).not.toBeNull();         // the d-pad's rows wear the d-pad's glyph
  });

  it('a button held lights on the drawing and on the row it drives', () => {
    const { ctl, p } = boot();
    openScreen(ctl);
    tick();
    hold(p, 7); ctl.remapFrame(t += 16);                               // R2 held (no walker press: R2 pages nothing here)
    expect(key(7).classList.contains('is-down')).toBe(true);
    expect(rows()[A(7)]!.classList.contains('is-live')).toBe(true);
    hold(p); ctl.remapFrame(t += 16);
    expect(key(7).classList.contains('is-down')).toBe(false);
  });

  it('the hold: the ring fills round the button held, and the binding is taken once it is full', () => {
    setControllerStanceMode('separate');                        // STM.R1: the Crouch row is SEPARATE's
    const { ctl, p } = boot({ holdMs: 800 });
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    // Crouch (PP-5): it takes an action's button without the Swap / Replace question (the match masks it), so the hold
    // alone decides -- every button 0-15 an action holds by default would ask instead.
    ctl.S.rm.row = REMAP_CROUCH_ROW;
    ctl.press('cross');
    hold(p); ctl.remapFrame(t += 16);
    for (let e = 0; e < 400; e += 16) { hold(p, 10); ctl.remapFrame(t += 16); }
    const ring = document.querySelector('#stage [data-pad-key="10"] .cx-pad__ring')!;
    const dash = Number(ring.getAttribute('stroke-dasharray')!.split(' ')[0]);
    expect(dash).toBeGreaterThan(35);
    expect(dash).toBeLessThan(65);
    expect(stored()?.crouch ?? -1).toBe(-1);
    for (let e = 0; e < 480; e += 16) { hold(p, 10); ctl.remapFrame(t += 16); }
    expect(stored()!.crouch).toBe(10);
    expect(document.querySelector('#stage .cx-pad__ring')).toBeNull();
    expect(document.querySelector('#stage [data-pad-key="10"] .cx-pad__bind')!.textContent).toBe('C');   // the bind it carries
  });

  it('first connect of a pad of another layout: the screen opens, its first press begins the pass, Not now is the panel\'s', () => {
    const { ctl } = boot({ withPad: null });
    const odd = pad('Twin USB Joystick (Vendor: 0810 Product: 0001)', '');
    pads = [odd];
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: odd }));
    expect(ctl.S.screen).toBe('remap');
    ctl.remapFrame(t += 16);
    expect(document.querySelector('#stage [data-key="teach"]')).not.toBeNull();
    hold(odd, 2); ctl.remapFrame(t += 16);                             // any press begins it (let go first)
    hold(odd); ctl.remapFrame(t += 16);
    expect(document.querySelector('#stage .cx-teach__count')!.textContent).toBe('Step 1 of 20');
    expect(document.querySelector('#stage .cx-teach__ask')!.textContent).toBe('Hold Cross');
    expect(key(0).classList.contains('is-lit')).toBe(true);           // the step's button glows on the drawing
    // #491's review, 3: a required step has no prompt (Circle on the pad would be the step's own input), and its line says
    // the ways out; 5: Escape is not the pass's (the page's keydown never reaches a pad being taught).
    expect(said(ctl)).toEqual([]);
    expect(document.querySelector('#stage .cx-teach__line')!.textContent).toBe('Hold it until the ring fills. The menus need it. To stop, choose Not now, or leave the controller for 20 seconds.');
    expect(ctl.capturing()).toBe(true);
    expect(ctl.escape()).toBe(false);
    click(document.querySelector('#stage [data-act="teachcancel"]')!);  // the panel's Not now
    expect(document.querySelector('#stage .cx-teach__count')!.textContent).toBe('Another layout');
    expect(document.querySelector('#stage .cx-teach__go')!.textContent).toBe('Choose Start to begin.');
    hold(odd, 2); ctl.remapFrame(t += 16);                             // Not now: a press does not begin it again
    expect(document.querySelector('#stage .cx-teach__count')!.textContent).toBe('Another layout');
    expect(said(ctl)).toEqual([['cross', 'Start'], ['circle', 'Back']]);
  });

  it("a step that may be skipped: the legend's one prompt is Circle's Skip, as the taught Circle's tap does on the pad", () => {
    const { ctl } = boot({ withPad: null });
    const odd = pad('Twin USB Joystick (Vendor: 0810 Product: 0001)', '');
    pads = [odd];
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: odd }));
    ctl.remapFrame(t += 16);
    const count = (): string => document.querySelector('#stage .cx-teach__count')!.textContent!;
    const step = (input: () => void): void => {
      hold(odd); odd.axes = [0, 0, 0, 0]; ctl.remapFrame(t += 16); ctl.remapFrame(t += 16);
      input(); ctl.remapFrame(t += 16); ctl.remapFrame(t += 16);
    };
    hold(odd, 2); ctl.remapFrame(t += 16);                             // any press begins it
    // The required eleven (holdMs 0 here): seven buttons, then each stick's two directions on the four axes.
    for (const b of [0, 1, 9, 12, 13, 14, 15]) step(() => hold(odd, b));
    for (const [axis, v] of [[0, 1], [1, 1], [2, 1], [3, 1]] as const) step(() => { hold(odd); odd.axes = [0, 0, 0, 0].map((x, i) => (i === axis ? v : x)); });
    hold(odd); odd.axes = [0, 0, 0, 0]; ctl.remapFrame(t += 16);
    expect(count()).toBe('Step 12 of 20');
    expect(said(ctl)).toEqual([['circle', 'Skip']]);
    expect(document.querySelector('#stage .cx-teach__line')!.textContent).toBe('Hold it until the ring fills, or tap Circle to skip it.');
    ctl.press('circle');                                                // the prompt's Circle: Skip, never Not now
    ctl.remapFrame(t += 16);
    expect(count()).toBe('Step 13 of 20');
  });

  // #491's re-read, 1: the screen's Back (and the overlay's close) send Circle, which is Skip during the pass -- so on this
  // screen during the pass they are Not now, never a Skip and never nothing.
  it("the screen's Back during the pass is Not now", () => {
    const { ctl } = boot({ withPad: null });
    const odd = pad('Twin USB Joystick (Vendor: 0810 Product: 0001)', '');
    pads = [odd];
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: odd }));
    ctl.remapFrame(t += 16);
    hold(odd, 2); ctl.remapFrame(t += 16);
    hold(odd); ctl.remapFrame(t += 16);
    expect(document.querySelector('#stage .cx-teach__count')!.textContent).toBe('Step 1 of 20');
    click(document.querySelector('#stage [data-act="press"][data-b="circle"]')!);   // the header's Back
    expect(document.querySelector('#stage .cx-teach__count')!.textContent).toBe('Another layout');
    expect(ctl.S.toast).toBe('Not now. Teach it later in Settings · Controller.');
    expect(ctl.S.screen).toBe('remap');
  });

  // #491's re-read, 2: Browser Back mid-pass closes the machine; the next visit's ends are a listen's, not the pass's.
  it("Browser Back mid-pass leaves no pass behind: the next visit's cancel is a binding's", () => {
    const { ctl } = boot({ withPad: null });
    ctl.doAct('opt:controller');
    ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
    const options = captureLauncher(ctl.S, ctl.A);
    const odd = pad('Twin USB Joystick (Vendor: 0810 Product: 0001)', '');
    pads = [odd];
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: odd }));
    ctl.remapFrame(t += 16);
    hold(odd, 2); ctl.remapFrame(t += 16);
    hold(odd); ctl.remapFrame(t += 16);
    expect(document.querySelector('#stage .cx-teach__count')!.textContent).toBe('Step 1 of 20');
    ctl.applySnap(options);                                             // Browser Back to Options
    expect(ctl.S.screen).toBe('options');
    const std = pad();
    pads = [std];
    ctl.press('cross');                                                 // Button mapping again, a standard pad now
    expect(ctl.S.screen).toBe('remap');
    ctl.remapFrame(t += 16);
    ctl.press('cross');                                                 // listen on Cross's row
    ctl.press('circle');                                                // and cancel it
    expect(ctl.S.toast).toBe('Binding cancelled.');
  });

  it('a standard pad connecting opens nothing: the toast only', () => {
    const { ctl } = boot({ withPad: null });
    const std = pad();
    pads = [std];
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: std }));
    expect(ctl.S.screen).not.toBe('remap');
  });

  it("the drawing is the screen's hero: the body under Sony's lines, which take the text token, never inverted", () => {
    const { ctl } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    const svg = document.querySelector('#stage svg.cx-pad')!;
    expect(svg.querySelector('mask#cx-pad-art image')!.getAttribute('href')).toMatch(/dualshock4/);
    expect(svg.querySelector('rect.cx-pad__art')!.getAttribute('mask')).toBe('url(#cx-pad-art)');
    const body = svg.querySelector('path.cx-pad__body')!;
    expect(body.getAttribute('d')).toBe(PAD_ART.body.d);
    // The body under the lines, the lines under the buttons.
    expect(body.compareDocumentPosition(svg.querySelector('.cx-pad__art')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(svg.querySelector('.cx-pad__art')!.compareDocumentPosition(svg.querySelector('[data-pad-key]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf8');
    expect(/\.cx-pad__art\s*\{([^}]*)\}/.exec(css)![1]).toMatch(/fill:\s*var\(--s2u-text\)/);
    expect(/\.cx-pad__body\s*\{([^}]*)\}/.exec(css)![1]).toMatch(/fill:\s*var\(--s2u-highlight\);\s*fill-opacity:\s*0\.45/);
    expect(css).not.toMatch(/\.cx-pad__art[^{]*\{[^}]*invert/);
  });

  it('the line art reads against its panel and the body (3:1 or better for a graphic, WCAG 1.4.11)', () => {
    // WCAG 2's relative luminance and contrast ratio over the Briefing tokens' hex literals.
    const tokens = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../shared/ds/tokens.css'), 'utf8');
    const rgb = (n: string): number[] => {
      const hex = new RegExp(`${n}:\\s*#([0-9a-f]{6});`, 'i').exec(tokens)![1]!;
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    };
    const lum = (c: number[]): number => {
      const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: number[], b: number[]): number => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };
    const panel = rgb('--s2u-panel');
    const body = rgb('--s2u-highlight').map((v, i) => v * 0.45 + panel[i]! * 0.55);   // the body's fill-opacity over the panel
    expect(ratio(rgb('--s2u-text'), panel)).toBeGreaterThanOrEqual(3);
    expect(ratio(rgb('--s2u-text'), body)).toBeGreaterThanOrEqual(3);
    expect(ratio(panel, rgb('--s2u-ground'))).toBeGreaterThan(1.2);       // the panel lifted off the page
  });

  it("each button's chip wears the glyph of the action it drives: a moved action on its new button, the old one free", () => {
    const { ctl, p } = boot();
    openScreen(ctl);
    ctl.remapFrame(t += 16);
    expect(key(0).querySelector('.cx-pad__glyph.cx-btn--cross')).not.toBeNull();   // the console's own marks
    // The d-pad's arrows: the console's chevron turned to each arm (the review of the first shots: a lone arm sat lopsided).
    expect(key(12).querySelector('.cx-pad__glyph.is-dpad path')!.getAttribute('transform')).toBe('rotate(-90 12 12)');
    expect(key(15).querySelector('.cx-pad__glyph.is-dpad path')!.getAttribute('transform')).toBe('rotate(0 12 12)');
    expect(key(8).querySelector('rect.cx-pad__chip')).not.toBeNull();     // SELECT's pill, its whole word
    expect(key(8).querySelector('.cx-pad__word')!.textContent).toBe('SELECT');
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf8');
    // The face glyphs in their own colours; the printed buttons' chips hidden at every width unless the print is wrong.
    expect(css).toMatch(/\.cx-pad__glyph\.cx-btn--square \{ color: var\(--s2u-glyph-square\); \}/);
    const printed = css.split('\n').find((l) => l.includes("[data-p='8']") && l.includes('display: none'))!;
    expect(printed.startsWith(':root[data-console]')).toBe(true);        // top level, not inside the phone rule
    expect(printed).toContain(':not(.is-moved, .is-free, .is-lit, .is-down, .is-teach)');
    expect(key(4).querySelector('.cx-pad__word')!.textContent).toBe('L1');
    expect(key(10).querySelector('.cx-pad__word')!.textContent).toBe('L3');
    expect(document.querySelectorAll('#stage .cx-pad__key.is-moved, #stage .cx-pad__key.is-free')).toHaveLength(0);
    ctl.S.rm.row = A(5);                                                // R1 to L2's button: Replace
    ctl.press('cross');
    hold(p); ctl.remapFrame(t += 16);
    hold(p, 6); ctl.remapFrame(t += 16);
    hold(p);
    ctl.press('up');
    ctl.press('cross');
    ctl.remapFrame(t += 16);
    expect(key(6).classList.contains('is-moved')).toBe(true);
    expect(key(6).querySelector('.cx-pad__word')!.textContent).toBe('R1');
    expect(key(5).classList.contains('is-free')).toBe(true);
    expect(key(5).querySelector('.cx-pad__glyph, .cx-pad__word')).toBeNull();
  });

  it('the teach pass on the drawing: the button asked now glows, taught ones ticked, skipped plain, the rest outlined', () => {
    const at = (step: number, taught: number[]): PadTeachMark[] => padTeachMarks({ step, taught: TEACH_STEPS.map((_, i) => taught.includes(i)) });
    expect(padTeachMarks(null).filter((m) => m === 'todo')).toHaveLength(16);       // before the pass: every button
    const m = at(3, [0, 1, 2]);                                         // D-pad up asked; Cross, Circle, START taught
    expect([m[0], m[1], m[9], m[12], m[13]]).toEqual(['taught', 'taught', 'taught', 'now', 'todo']);
    const stick = TEACH_STEPS.findIndex((x) => x.kind === 'axis');
    expect(at(stick, [0, 1, 2, 3, 4, 5, 6])[10]).toBe('now');            // a stick's steps are its cap's
    const skippedAt = TEACH_STEPS.findIndex((x) => !x.required);
    const skipped = at(skippedAt + 1, TEACH_STEPS.map((_, i) => i).filter((i) => i < skippedAt));
    expect(skipped[TEACH_STEPS[skippedAt]!.target]).toBe('');            // skipped: neither ticked nor outlined
    const { ctl } = boot({ withPad: null });
    const odd = pad('Twin USB Joystick (Vendor: 0810 Product: 0001)', '');
    pads = [odd];
    window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: odd }));
    ctl.remapFrame(t += 16);
    hold(odd, 2); ctl.remapFrame(t += 16);
    hold(odd); ctl.remapFrame(t += 16);
    expect(key(0).classList.contains('is-now')).toBe(true);
    expect(key(0).querySelector('.cx-pad__halo')).not.toBeNull();
    expect(key(1).classList.contains('is-todo')).toBe(true);
    expect(document.querySelector('#stage .cx-pad__glyph:not(.is-tick)')).toBeNull();   // no action glyphs in the pass
  });
});
