// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { livePad } from '../../src/console/adapters/pad';
import { liveOptions } from '../../src/console/adapters/options';
import { remapAdapter } from '../../src/console/adapters/remap';
import { prompts } from '../../src/console/render/legend';
import { REMAP_ACTION_ROW, REMAP_CROUCH_ROW, REMAP_DEAD_ROW, REMAP_FINISH_TOAST, REMAP_PRONE_ROW, REMAP_STANCE_ROW, remapOwnRows } from '../../src/console/render/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, type Adapters } from '../../src/console/state';
import { PadBinding } from '../../src/padBinding';
import { SETUP_KEY, STANCE_MODE_ABOUT, STANCE_MODE_KEY, controllerStanceMode, defaultController, parseController, setControllerStanceMode } from '../../src/startupSettings';
import { mountShell } from './shell';

/**
 * STM-1 (the plan 2026-10-30-stance-modes-and-emulator-harness; STM.R1, the owner, 2026-10-30: "only when SEPARATE is
 * selected should the two separate bindings show for prone and crouch ... There should be tooltips explaining these two
 * modes concicesly"; STM.R1a: Crouch unbound, the binds "Kept, hidden" in COMBINED): the Button mapping's rows by mode --
 * the Stance mode (COMBINED / SEPARATE), the dead zone (DEAD-UP), the sixteen actions, then Crouch and Prone in SEPARATE only, then
 * the extras (Teach again, Finish) -- and the Options Controller tab's Stance mode row. The console has no hover: a row's
 * tooltip is its `about`, in the side panel. A browser adaptation (OT.R28); what the binds do in the game is
 * `../stanceModes.test.ts`'s.
 */
const pad = () => ({
  index: 0, id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const stored = (p: Pad): ReturnType<typeof parseController> => parseController(localStorage.getItem(profileKey(p)));
const TRIANGLE = 3, R3 = 11;

let page: ConsolePage | null = null;
let pads: Pad[] = [];
let t = 10_000;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mountShell(document);
  pads = [];
  t = 10_000;
  window.requestAnimationFrame = (() => 1) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
});
afterEach(() => {
  page?.dispose(); page = null;
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  localStorage.clear();
  vi.useRealTimers();
});

/** The sample adapters with a remap adapter over one standard pad; the Button mapping screen pushed and read once. */
function openMapping(o: { prone?: number; mode?: 'pop' | 'separate' } = {}) {
  const p = pad();
  pads = [p];
  if (o.prone !== undefined) localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), prone: o.prone }));
  if (o.mode) setControllerStanceMode(o.mode);
  const remap = remapAdapter(() => new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0 }));
  page = bootConsole(document, window, { ...sampleAdapters(), remap } as Adapters, { keymap: true });
  const ctl = page.ctl;
  ctl.doAct('opt:controller');
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
  ctl.press('cross');
  ctl.remapFrame(t += 16);
  return { ctl, p, remap };
}
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-act="remaprow"]')];
const titles = (): string[] => rows().map((r) => r.querySelector('.cx-item__title, .cx-roller__label')!.textContent!);
const rowValue = (i: number): string => rows()[i]!.querySelector('.cx-roller__value')!.textContent!;
const glyph = (i: number): Element => rows()[i]!.querySelector('.cx-item__state')!;
const aside = (): string => document.querySelector('#stage .cx-aside p')!.textContent!;
const said = (ctl: ConsolePage['ctl']): [string, string][] => prompts(ctl.S, ctl.A).map((x) => [x.k, x.label]);
const ACTIONS = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right'];

describe('STM.R1: the Button mapping\'s rows are a function of the mode', () => {
  // DEAD-UP (the owner, 2026-11-03: "can we move stick dead zone up below stance mode"): the dead zone at 1, the actions 2-17.
  it('the row numbers: Stance mode 0 (STANCE-TOP), dead zone 1 (DEAD-UP), actions 2-17, Crouch 18 and Prone 19 (SEPARATE only); 18 own rows in COMBINED, 20 in SEPARATE', () => {
    expect([REMAP_STANCE_ROW, REMAP_DEAD_ROW, REMAP_ACTION_ROW, REMAP_CROUCH_ROW, REMAP_PRONE_ROW]).toEqual([0, 1, 2, 18, 19]);
    expect(remapOwnRows('pop')).toBe(18);
    expect(remapOwnRows('separate')).toBe(20);
  });

  it('COMBINED (the default): the Stance mode first (STANCE-TOP), the dead zone under it (DEAD-UP), the actions, Finish -- no Crouch and no Prone row', () => {
    openMapping();
    expect(controllerStanceMode()).toBe('pop');
    expect(titles()).toEqual(['Stance mode', 'Stick dead zone', ...ACTIONS, 'Extra binds', 'Finish']);   // h59U9CLb: Extra binds
    expect(rowValue(REMAP_STANCE_ROW)).toBe('COMBINED');
  });

  it('COMBINED with Prone bound in the profile: kept, hidden -- no row, and no bind mark on the drawing (STM.R1a)', () => {
    const { p } = openMapping({ prone: R3 });
    expect(titles()).not.toContain('Prone');
    expect(document.querySelector('#stage .cx-pad__bind')).toBeNull();
    expect(stored(p).prone).toBe(R3);
  });

  it('SEPARATE: the Stance mode first (STANCE-TOP), the dead zone under it (DEAD-UP), Crouch and Prone after the actions, then Finish', () => {
    openMapping({ mode: 'separate' });
    expect(titles()).toEqual(['Stance mode', 'Stick dead zone', ...ACTIONS, 'Crouch', 'Prone', 'Extra binds', 'Finish']);
    expect(rowValue(REMAP_STANCE_ROW)).toBe('SEPARATE');
  });

  it('the Stance mode row\'s tooltip (its aside) is one line per mode, the same words as the Options row', () => {
    const { ctl } = openMapping();
    ctl.S.rm.row = REMAP_STANCE_ROW;
    page!.render();
    expect(aside()).toBe(STANCE_MODE_ABOUT);
    expect(said(ctl)).toEqual([['dpad-h', 'Change'], ['circle', 'Back'], ['square', 'Reset to default'], ['triangle', 'Restore defaults']]);
  });

  it('the d-pad walks the rows of the mode: it opens on Cross, Up is the dead zone then the Stance mode (the first row), and in COMBINED down from the last action is Finish, then no further', () => {
    const { ctl } = openMapping();
    // STANCE-TOP: the screen still opens on its first binding (Cross); DEAD-UP: the dead zone above it, the Stance mode first.
    expect(titles()[ctl.S.rm.row]).toBe('Cross');
    ctl.press('up');
    expect(ctl.S.rm.row).toBe(REMAP_DEAD_ROW);
    ctl.press('up');
    expect(ctl.S.rm.row).toBe(REMAP_STANCE_ROW);
    ctl.press('up');
    expect(ctl.S.rm.row).toBe(0);
    ctl.press('down');
    expect(titles()[ctl.S.rm.row]).toBe('Stick dead zone');
    ctl.press('down');
    expect(titles()[ctl.S.rm.row]).toBe('Cross');
    ctl.S.rm.row = REMAP_ACTION_ROW + 15;                    // Right, the last action
    ctl.press('down');
    expect(titles()[ctl.S.rm.row]).toBe('Extra binds');      // h59U9CLb: the extras' row, folded, before Finish
    ctl.press('down');
    expect(titles()[ctl.S.rm.row]).toBe('Finish');
    ctl.press('down');
    expect(ctl.S.rm.row).toBe(19);
  });
});

describe('STM.R1: stepping the Stance mode on the Button mapping', () => {
  // SEP-SHOW (the owner, 2026-10-31: "Yes, with those defaults"): this pad is a DualShock 4 (a touchpad, 18 buttons), so
  // Crouch takes the free touchpad (17) on the way in, said; a pad without one keeps STM.R1a's unbound Crouch
  // (`./touchpadCrouch.test.ts`).
  it('Right to SEPARATE: the rows appear, Prone takes Triangle\'s button (saved), Crouch the DS4\'s free touchpad (SEP-SHOW)', () => {
    const { ctl, p } = openMapping();
    ctl.S.rm.row = REMAP_STANCE_ROW;
    ctl.press('right');
    ctl.remapFrame(t += 16);
    expect(controllerStanceMode()).toBe('separate');
    expect(localStorage.getItem(STANCE_MODE_KEY)).toBe('separate');
    expect(titles().slice(0, 2)).toEqual(['Stance mode', 'Stick dead zone']);   // DEAD-UP
    expect(titles().slice(17)).toEqual(['Right', 'Crouch', 'Prone', 'Extra binds', 'Finish']);
    expect(stored(p)).toMatchObject({ prone: TRIANGLE, crouch: 17 });
    expect(ctl.S.toast).toBe('Crouch bound to Touchpad');
    expect(glyph(REMAP_PRONE_ROW).querySelector('.cx-btn--triangle')).not.toBeNull();
    expect(glyph(REMAP_CROUCH_ROW).textContent).toBe('Touchpad');
    expect(document.querySelector(`#stage [data-pad-key="${TRIANGLE}"] .cx-pad__bind`)!.textContent).toBe('P');
  });

  it('Left back to COMBINED: the rows hide, the binds kept; SEPARATE again brings back what was set (STM.R1a)', () => {
    const { ctl, p, remap } = openMapping({ mode: 'separate', prone: R3 });
    remap.current()!.setCrouch(12);
    ctl.S.rm.row = REMAP_STANCE_ROW;
    ctl.press('left');
    ctl.remapFrame(t += 16);
    expect(controllerStanceMode()).toBe('pop');
    expect(titles()).not.toContain('Crouch');
    expect(titles()).not.toContain('Prone');
    expect(stored(p)).toMatchObject({ prone: R3, crouch: 12 });
    ctl.press('right');
    ctl.remapFrame(t += 16);
    expect(stored(p)).toMatchObject({ prone: R3, crouch: 12 });    // a bound Prone is kept, never cloned over
    expect(glyph(REMAP_PRONE_ROW).textContent).toBe('R3');
  });

  it('Cross on the row toggles it (and clones as Right does); Square resets it to COMBINED, said', () => {
    const { ctl, p } = openMapping();
    ctl.S.rm.row = REMAP_STANCE_ROW;
    ctl.press('cross');
    expect(controllerStanceMode()).toBe('separate');
    expect(stored(p).prone).toBe(TRIANGLE);
    ctl.press('square');
    expect(controllerStanceMode()).toBe('pop');
    expect(ctl.S.toast).toBe('Stance mode reset to COMBINED');
  });

  it('the focus past the end when the mode hides rows is clamped to the last row', () => {
    const { ctl } = openMapping({ mode: 'separate' });
    ctl.S.rm.row = 21;                                                  // Finish in SEPARATE (h59U9CLb: after Extra binds)
    expect(titles()[21]).toBe('Finish');
    setControllerStanceMode('pop');                                     // changed elsewhere (the Options row, over the screen)
    page!.render();
    expect(ctl.S.rm.row).toBe(19);
    expect(titles()[ctl.S.rm.row]).toBe('Finish');
  });

  it('the Prone row in SEPARATE: Cross listens, Square unbinds (the legend says so)', () => {
    const { ctl, p } = openMapping({ mode: 'separate', prone: R3 });
    ctl.S.rm.row = REMAP_PRONE_ROW;
    page!.render();
    expect(said(ctl)).toEqual([['cross', 'Change'], ['circle', 'Back'], ['square', 'Unbind'], ['triangle', 'Restore defaults']]);
    // The review's F1: Triangle stops only while Prone is bound -- the aside says so, not "it starts on Triangle's button".
    expect(aside()).toMatch(/while it is bound, Triangle changes no stance/);
    expect(aside()).not.toMatch(/It starts on Triangle/);
    ctl.press('square');
    expect(stored(p).prone).toBe(-1);
  });

  it('the review\'s F1 (d): Restore defaults in SEPARATE puts Prone back on Triangle\'s button; in COMBINED it stays unbound', () => {
    const { ctl, p } = openMapping({ mode: 'separate', prone: R3 });
    ctl.press('triangle'); ctl.press('down'); ctl.press('cross');      // Restore defaults, Yes
    expect(stored(p)).toMatchObject({ prone: TRIANGLE, crouch: -1 });
    expect(glyph(REMAP_PRONE_ROW).querySelector('.cx-btn--triangle')).not.toBeNull();
    setControllerStanceMode('pop');
    ctl.press('triangle'); ctl.press('down'); ctl.press('cross');
    expect(stored(p).prone).toBe(-1);
  });
});

describe('OBF-13 kept: Finish is the last row in either mode, and closes the screen with its confirmation', () => {
  for (const mode of ['pop', 'separate'] as const) {
    it(`${mode}: the d-pad down to the end lands on Finish; Cross closes back to Options, said`, () => {
      const { ctl, remap } = openMapping({ mode });
      for (let k = 0; k < 30; k++) ctl.press('down');
      expect(titles()[ctl.S.rm.row]).toBe('Finish');
      expect(ctl.S.rm.row).toBe(remapOwnRows(mode) + 1);                // h59U9CLb: Extra binds before it
      ctl.press('cross');
      expect(ctl.S.screen).toBe('options');
      expect(ctl.S.toast).toBe(REMAP_FINISH_TOAST);
      expect(remap.current()).toBeNull();
    });
  }
});

describe('STM.R1: the Options Controller tab offers the Stance mode again (OBF-11 retired)', () => {
  function options() {
    const p = pad();
    const lp = livePad(() => {}, { source: { getGamepads: () => [p] } });
    lp.read();                                                          // the pad read: its profile known
    return { p, o: liveOptions(() => {}, { signedIn: () => false, pads: () => [], pad: lp }) };
  }
  it('the row: COMBINED / SEPARATE, COMBINED by default, its tooltip the Button mapping\'s', () => {
    const { o } = options();
    const row = o.categories().find((c) => c.id === 'controller')!.rows.find((r) => r.id === 'stance-mode')!;
    expect(row.label).toBe('Stance mode');
    expect(row.values).toEqual(['COMBINED', 'SEPARATE']);
    expect(row.about).toBe(STANCE_MODE_ABOUT);
    expect(o.value('stance-mode')).toBe(0);
  });
  it('choosing SEPARATE there clones Triangle\'s button to an unbound Prone too (SEP-SHOW: the DS4\'s touchpad to Crouch); COMBINED again keeps it', () => {
    const { p, o } = options();
    o.set('stance-mode', 1);
    expect(controllerStanceMode()).toBe('separate');
    expect(stored(p)).toMatchObject({ prone: TRIANGLE, crouch: 17 });
    expect(o.takeToast!()).toBe('Crouch bound to Touchpad');
    expect(o.takeToast!()).toBeNull();                                 // said once
    o.set('stance-mode', 0);
    expect(controllerStanceMode()).toBe('pop');
    expect(stored(p).prone).toBe(TRIANGLE);
  });
});

