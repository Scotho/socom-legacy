// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { livePad } from '../../src/console/adapters/pad';
import { liveOptions } from '../../src/console/adapters/options';
import { remapAdapter } from '../../src/console/adapters/remap';
import {
  PAD_DEAD_ZONE_LABEL, REMAP_CROUCH_ROW, REMAP_PRONE_ROW, REMAP_STANCE_ROW, remapActionRow, remapDeadRow, remapOwnRows,
} from '../../src/console/render/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, type Adapters } from '../../src/console/state';
import { TOUCHPAD_CROUCH_TOAST } from '../../src/controllerInput';
import { CROUCH_BIND, PadBinding } from '../../src/padBinding';
import { padExtrasKeyOf, parsePadExtras } from '../../src/padExtras';
import {
  SETUP_KEY, STANCE_MODE_KEY, STANCE_SEPARATE_BINDS_TIP, controllerStanceMode, defaultController, parseController, setControllerStanceMode,
  stanceBindsMissing,
} from '../../src/startupSettings';
import { mountShell } from './shell';

/**
 * SEP-ROWS (the owner, 2026-11-11: "in controller remapping we have a setting for separate that opens up two new items -
 * prone and crouch at the bottom. please open them directly under the special setting switch with a nice slide down or up
 * animation ... don't lose existing settings ... that alias should now show a tooltip ... and a warning icon when separate
 * is on and crouch and prone are not set"). A browser adaptation (the console's settings screens, OT.R28; product track):
 * the rows' order and motion, the Options row's tip and mark -- nothing the game does.
 */
const pad = (buttons = 18) => ({
  index: 0, id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: buttons }, () => ({ pressed: false, touched: false, value: 0 })),
});
/** A DualShock with no touchpad button read (17 buttons): SEPARATE leaves its Crouch unbound (STM.R1a). */
const plainPad = () => pad(17);
type Pad = ReturnType<typeof pad>;
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const stored = (p: Pad): ReturnType<typeof parseController> => parseController(localStorage.getItem(profileKey(p)));
const TRIANGLE = 3;

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

function openMapping(o: { mode?: 'pop' | 'separate'; p?: Pad } = {}) {
  const p = o.p ?? pad();
  pads = [p];
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
const focusedTitle = (): string => document.querySelector('#stage [data-act="remaprow"].is-focused')!.querySelector('.cx-item__title, .cx-roller__label')!.textContent!;
const sep = (): HTMLElement => document.querySelector<HTMLElement>('#stage [data-key="remap-sep"]')!;
const ACTIONS = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right'];

describe('SEP-ROWS: SEPARATE\'s Crouch and Prone directly under the Stance mode, the dead zone under them', () => {
  it('the row numbers by mode: Stance 0; SEPARATE Crouch 1, Prone 2, dead zone 3, actions 4-19; COMBINED dead zone 1, actions 2-17; own rows 20 / 18', () => {
    expect([REMAP_STANCE_ROW, REMAP_CROUCH_ROW, REMAP_PRONE_ROW]).toEqual([0, 1, 2]);
    expect([remapDeadRow('separate'), remapActionRow('separate')]).toEqual([3, 4]);
    expect([remapDeadRow('pop'), remapActionRow('pop')]).toEqual([1, 2]);
    expect([remapOwnRows('separate'), remapOwnRows('pop')]).toEqual([20, 18]);
  });

  it('SEPARATE draws Stance mode, Crouch, Prone, then the dead zone, the actions and the extras', () => {
    openMapping({ mode: 'separate' });
    expect(titles()).toEqual(['Stance mode', 'Crouch', 'Prone', PAD_DEAD_ZONE_LABEL, ...ACTIONS, 'Extra binds', 'Finish']);
    // The DOM's order is the row numbers' (a click's `data-i`, the frame's focus key).
    expect(rows().map((r) => Number(r.dataset.i))).toEqual(rows().map((_, i) => i));
  });

  it('COMBINED draws no Crouch and no Prone row: the dead zone directly under the Stance mode', () => {
    openMapping({ mode: 'pop' });
    expect(titles()).toEqual(['Stance mode', PAD_DEAD_ZONE_LABEL, ...ACTIONS, 'Extra binds', 'Finish']);
    // The folded group is out of every reach: inert, hidden from a reader, its rows no row of the screen's.
    expect(sep().classList.contains('is-open')).toBe(false);
    expect(sep().hasAttribute('inert')).toBe(true);
    expect(sep().getAttribute('aria-hidden')).toBe('true');
    expect(sep().querySelector('[data-act], [data-fk]')).toBeNull();
  });

  it('the group is one element under the Stance row in both modes, patched in place by the toggle (its slide is a transition)', () => {
    const { ctl } = openMapping({ mode: 'pop' });
    const before = sep();
    expect(before.previousElementSibling!.querySelector('[data-i="0"]')).not.toBeNull();
    ctl.S.rm.row = REMAP_STANCE_ROW;
    ctl.press('right');
    ctl.remapFrame(t += 16);
    expect(sep()).toBe(before);
    expect(before.classList.contains('is-open')).toBe(true);
    expect(before.hasAttribute('inert')).toBe(false);
    expect(before.hasAttribute('aria-hidden')).toBe(false);
    ctl.press('left');
    ctl.remapFrame(t += 16);
    expect(sep()).toBe(before);
    expect(before.classList.contains('is-open')).toBe(false);
  });

  it('the slide: ~200 ms on the design system\'s ease (--s2u-dur-base, --s2u-ease), none under reduced motion', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/console/console.css'), 'utf-8');
    expect(css).toMatch(/\.cx-remap__sep \{[^}]*grid-template-rows: 0fr;[^}]*transition: grid-template-rows var\(--s2u-dur-base\) var\(--s2u-ease\)/);
    expect(css).toMatch(/\.cx-remap__sep\.is-open \{ grid-template-rows: 1fr; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ :root\[data-console\] \.cx-remap__sep[^{]*\{ transition: none; \}/);
  });
});

describe('SEP-ROWS: the focus across the toggle', () => {
  it('Right on the Stance mode opens the rows under it, the focus kept on the switch; Down walks Crouch, Prone, the dead zone, Cross', () => {
    const { ctl, p } = openMapping({ p: plainPad() });
    ctl.press('up'); ctl.press('up');
    expect(ctl.S.rm.row).toBe(REMAP_STANCE_ROW);
    ctl.press('right');
    ctl.remapFrame(t += 16);
    expect(controllerStanceMode()).toBe('separate');
    expect(stored(p).prone).toBe(TRIANGLE);                           // STM.R1: Prone takes Triangle's button, as before
    expect(ctl.S.rm.row).toBe(REMAP_STANCE_ROW);
    expect(focusedTitle()).toBe('Stance mode');
    const walk: string[] = [];
    for (let k = 0; k < 4; k++) { ctl.press('down'); walk.push(focusedTitle()); }
    expect(walk).toEqual(['Crouch', 'Prone', PAD_DEAD_ZONE_LABEL, 'Cross']);
    for (let k = 0; k < 4; k++) ctl.press('up');
    expect(focusedTitle()).toBe('Stance mode');
  });

  it('Left closes them, the focus kept on the switch; Down is the dead zone, never a hidden row', () => {
    const { ctl } = openMapping({ mode: 'separate' });
    ctl.S.rm.row = REMAP_STANCE_ROW;
    ctl.press('left');
    ctl.remapFrame(t += 16);
    expect(controllerStanceMode()).toBe('pop');
    expect(focusedTitle()).toBe('Stance mode');
    ctl.press('down');
    expect(focusedTitle()).toBe(PAD_DEAD_ZONE_LABEL);
  });

  it('a mode changed under the screen keeps the focus on the same row: an action stays itself, a hidden bind falls to the switch', () => {
    const { ctl } = openMapping({ mode: 'pop' });
    ctl.S.rm.row = remapActionRow('pop') + 1;                         // Circle
    page!.render();
    expect(focusedTitle()).toBe('Circle');
    setControllerStanceMode('separate');                              // elsewhere (the pressure default, the Options row)
    page!.render();
    expect(ctl.S.rm.row).toBe(remapActionRow('separate') + 1);
    expect(focusedTitle()).toBe('Circle');
    ctl.S.rm.row = REMAP_PRONE_ROW;
    page!.render();
    setControllerStanceMode('pop');
    page!.render();
    expect(ctl.S.rm.row).toBe(REMAP_STANCE_ROW);
    expect(focusedTitle()).toBe('Stance mode');
  });

  it('the DS4\'s touchpad toast still says Crouch was bound on the way in; Cross on Crouch listens for Crouch\'s bind', () => {
    const { ctl, remap } = openMapping();
    ctl.S.rm.row = REMAP_STANCE_ROW;
    ctl.press('right');
    ctl.remapFrame(t += 16);
    expect(ctl.S.toast).toBe(TOUCHPAD_CROUCH_TOAST);
    ctl.press('down');
    expect(focusedTitle()).toBe('Crouch');
    ctl.press('cross');
    expect(remap.current()!.listening()).toBe(CROUCH_BIND);
  });

  it('Cross on an action row in SEPARATE listens for that action (Cross: 0), not the row number', () => {
    const { ctl, remap } = openMapping({ mode: 'separate' });
    expect(focusedTitle()).toBe('Cross');                             // the screen still opens on the first binding
    expect(ctl.S.rm.row).toBe(remapActionRow('separate'));
    ctl.press('cross');
    expect(remap.current()!.listening()).toBe(0);
  });
});

describe('SEP-ROWS: Options > Controller\'s Stance mode row -- the tip and the warning', () => {
  function options(p: Pad) {
    pads = [p];
    const lp = livePad(() => {}, { source: { getGamepads: () => pads } });
    lp.read();
    const o = liveOptions(() => {}, { signedIn: () => false, pads: () => [], pad: lp });
    const row = () => o.categories().find((c) => c.id === 'controller')!.rows.find((r) => r.id === 'stance-mode')!;
    return { lp, o, row };
  }

  it('the tip: SEPARATE needs Crouch and Prone mapped in Button mapping', () => {
    expect(STANCE_SEPARATE_BINDS_TIP).toBe('SEPARATE needs Crouch and Prone mapped in Button mapping.');
    const { row } = options(pad());
    expect(row().tip).toBe(STANCE_SEPARATE_BINDS_TIP);
  });

  it('either bind unreachable is missing; a pressure pad\'s light press reaches an unbound Crouch', () => {
    expect(stanceBindsMissing({ crouch: -1, prone: -1 }, false)).toBe(true);
    expect(stanceBindsMissing({ crouch: 12, prone: -1 }, false)).toBe(true);
    expect(stanceBindsMissing({ crouch: -1, prone: 3 }, false)).toBe(true);
    expect(stanceBindsMissing({ crouch: -1, prone: 3 }, true)).toBe(false);
    expect(stanceBindsMissing({ crouch: 12, prone: 3 }, false)).toBe(false);
  });

  it('COMBINED: no warning; SEPARATE with Crouch unbound: the warning; Crouch bound: gone, live', () => {
    const p = plainPad();
    const { lp, o, row } = options(p);
    expect(row().warn).toBeUndefined();
    o.set('stance-mode', 1);                                          // Prone takes Triangle's; this pad has no touchpad
    lp.read();
    expect(stored(p)).toMatchObject({ prone: TRIANGLE, crouch: -1 });
    expect(row().warn).toBe(STANCE_SEPARATE_BINDS_TIP);
    localStorage.setItem(profileKey(p), JSON.stringify({ ...stored(p), crouch: 13 }));   // Crouch bound on Button mapping
    lp.read();
    expect(row().warn).toBeUndefined();
    o.set('stance-mode', 0);
    localStorage.setItem(profileKey(p), JSON.stringify({ ...stored(p), crouch: -1, prone: -1 }));
    lp.read();
    expect(row().warn).toBeUndefined();                               // COMBINED needs neither
  });

  it('drawn: the amber alert mark on the row and the tip in its aside (the focused or hovered row\'s tooltip)', () => {
    const p = plainPad();
    pads = [p];
    setControllerStanceMode('separate');
    const lp = livePad(() => {}, { source: { getGamepads: () => pads } });
    lp.read();
    const options = liveOptions(() => {}, { signedIn: () => false, pads: () => [], pad: lp });
    page = bootConsole(document, window, { ...sampleAdapters(), options } as Adapters, { keymap: true });
    page.ctl.doAct('opt:controller');
    page.ctl.S.opt.row = 0;
    page.render();
    const stance = document.querySelector<HTMLElement>('#stage [data-id="stance-mode"]')!;
    const mark = stance.querySelector<HTMLElement>('.cx-r__warn')!;
    expect(mark).not.toBeNull();
    expect(mark.getAttribute('title')).toBe(STANCE_SEPARATE_BINDS_TIP);
    expect(mark.querySelector('.cx-ico')).not.toBeNull();
    expect(stance.getAttribute('aria-label')).toContain(STANCE_SEPARATE_BINDS_TIP);
    expect(document.querySelector('#stage .cx-aside .cx-aside__tip')!.textContent).toContain(STANCE_SEPARATE_BINDS_TIP);
    localStorage.setItem(profileKey(p), JSON.stringify({ ...stored(p), crouch: 13, prone: TRIANGLE }));
    lp.read();
    page.render();
    expect(document.querySelector('#stage [data-id="stance-mode"] .cx-r__warn')).toBeNull();
    expect(document.querySelector('#stage .cx-aside .cx-aside__tip')!.textContent).toContain(STANCE_SEPARATE_BINDS_TIP);   // the tip stays
  });
});

describe('SEP-ROWS: every saved setting kept across the change (the owner: "don\'t lose existing settings")', () => {
  // The blobs as the code before SEP-ROWS writes them (`ControllerInput.save`: JSON of the config; `saveExtras`; the
  // Stance mode's own key): the round trips below prove each is that code's own form, then the new screen reads them.
  const p = plainPad();
  const SWAPPED = [0, 1, 2, 3, 5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];   // L1 and R1 swapped
  const CONFIG = JSON.stringify({ version: 1, bindings: SWAPPED, deadZone: 0.22, crouch: 13, prone: 3 });
  const EXTRAS = JSON.stringify({ version: 1, doubles: [{ button: 6, action: 'reload' }], combos: [{ modifier: 7, button: 0, action: 'inventory' }] });
  const seed = (): void => {
    localStorage.setItem(STANCE_MODE_KEY, 'separate');
    localStorage.setItem(profileKey(p), CONFIG);
    localStorage.setItem(padExtrasKeyOf(profileKey(p)), EXTRAS);
  };
  const snapshot = (): Record<string, string | null> => Object.fromEntries([STANCE_MODE_KEY, profileKey(p), padExtrasKeyOf(profileKey(p))].map((k) => [k, localStorage.getItem(k)]));

  it('the fixture is the saved form: the config and the extras round-trip unchanged', () => {
    expect(JSON.stringify(parseController(CONFIG))).toBe(CONFIG);
    const x = parsePadExtras(EXTRAS, { overlayButton: -1, heldBinds: [13, 3] });
    expect(x.dropped).toEqual([]);
    expect(JSON.stringify({ version: 1, doubles: x.extras.doubles, combos: x.extras.combos })).toBe(EXTRAS);
    expect(parseController(CONFIG)).not.toEqual(defaultController());
  });

  it('the new screen reads the mode, both binds, the dead zone, the swapped buttons and the extras; walking and toggling writes nothing new', () => {
    seed();
    const before = snapshot();
    const { ctl, remap } = openMapping({ p });
    expect(controllerStanceMode()).toBe('separate');
    const m = remap.current()!;
    expect([m.crouch(), m.prone(), m.deadZone()]).toEqual([13, 3, 0.22]);
    expect(m.extraList()).toHaveLength(2);
    expect(titles().slice(0, 4)).toEqual(['Stance mode', 'Crouch', 'Prone', PAD_DEAD_ZONE_LABEL]);
    expect(rows()[remapDeadRow()]!.querySelector('.cx-roller__value')!.textContent).toBe('22%');
    expect(rows()[REMAP_CROUCH_ROW]!.getAttribute('aria-label')).toBe('Crouch: Down');
    expect(rows()[REMAP_PRONE_ROW]!.getAttribute('aria-label')).toBe('Prone: Triangle');
    expect(rows()[remapActionRow() + 4]!.getAttribute('aria-label')).toBe('L1: R1');
    expect(rows()[remapActionRow() + 5]!.getAttribute('aria-label')).toBe('R1: L1');
    for (let k = 0; k < 30; k++) ctl.press('down');
    for (let k = 0; k < 30; k++) ctl.press('up');
    ctl.press('left'); ctl.remapFrame(t += 16);                       // COMBINED: the binds kept, hidden (STM.R1a)
    ctl.press('right'); ctl.remapFrame(t += 16);                      // SEPARATE again: a bound Prone never cloned over
    expect(snapshot()).toEqual(before);
    ctl.press('circle');                                              // back to Options: nothing written on the way out
    expect(snapshot()).toEqual(before);
  });
});
