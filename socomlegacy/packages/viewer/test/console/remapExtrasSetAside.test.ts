// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { remapAdapter } from '../../src/console/adapters/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, type Adapters } from '../../src/console/state';
import { PadBinding } from '../../src/padBinding';
import { padExtrasKeyOf } from '../../src/padExtras';
import { SETUP_KEY, STANCE_MODE_KEY, defaultController, setControllerStanceMode } from '../../src/startupSettings';
import { mountShell } from './shell';

/**
 * SEP-ROWS's settings-loss check (the owner, 2026-11-11: "don't lose existing settings"): the one saved setting the
 * Button mapping could lose. A browser adaptation (h59U9CLb's extra binds, OT.R28; product track).
 */
const pad = () => ({
  index: 0, id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const plainPad = pad;
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

function openMapping(o: { p: Pad }) {
  pads = [o.p];
  const remap = remapAdapter(() => new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0 }));
  page = bootConsole(document, window, { ...sampleAdapters(), remap } as Adapters, { keymap: true });
  const ctl = page.ctl;
  ctl.doAct('opt:controller');
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
  ctl.press('cross');
  ctl.remapFrame(t += 16);
  return { ctl, remap };
}

describe('SEP-ROWS\'s settings-loss finding: an extra set aside in SEPARATE survives another extra\'s change', () => {
  // h59U9CLb (80e60d8c2f): in SEPARATE a combo whose modifier is a stance bind's button is set aside at the read
  // (`../../src/padExtras` `parsePadExtras`, 'held-bind'), and an add or a remove then wrote back only the list read
  // (`PadBinding.saveExtraRows`), so the set-aside combo was gone for good -- COMBINED never brought it back.
  it('a combo on Prone\'s button, set aside in SEPARATE, is kept when another extra is removed, and comes back in COMBINED', () => {
    const p = plainPad();
    const key = padExtrasKeyOf(profileKey(p));
    localStorage.setItem(STANCE_MODE_KEY, 'separate');
    localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), crouch: 13, prone: TRIANGLE }));
    localStorage.setItem(key, JSON.stringify({ version: 1, doubles: [{ button: 6, action: 'reload' }], combos: [{ modifier: TRIANGLE, button: 0, action: 'inventory' }] }));
    const { ctl, remap } = openMapping({ p });
    const m = remap.current()!;
    expect(m.extraList().map((x) => x.kind)).toEqual(['double']);    // the combo set aside while Triangle is Prone's
    m.removeExtra(0);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, doubles: [], combos: [{ modifier: TRIANGLE, button: 0, action: 'inventory' }] });
    setControllerStanceMode('pop');
    ctl.remapFrame(t += 16);
    expect(m.extraList()).toEqual([{ kind: 'combo', modifier: TRIANGLE, button: 0, action: 'inventory', warning: 'same-thumb' }]);   // Q3's warning, read again
  });

  // The fold's F1 (the review of 687b8c520e): the set-aside combo keeps its stored place -- it was written after the shown
  // ones, so the first save in SEPARATE reordered the combos.
  it('the stored order is unchanged by a remove in SEPARATE, and COMBINED reads the combos in that order', () => {
    const p = plainPad();
    const key = padExtrasKeyOf(profileKey(p));
    const K1 = { modifier: 4, button: 0, action: 'inventory' }, S = { modifier: TRIANGLE, button: 1, action: 'reload' };
    const K2 = { modifier: 5, button: 2, action: 'scoreboard' };
    localStorage.setItem(STANCE_MODE_KEY, 'separate');
    localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), crouch: 13, prone: TRIANGLE }));
    localStorage.setItem(key, JSON.stringify({ version: 1, doubles: [{ button: 6, action: 'reload' }], combos: [K1, S, K2] }));
    const { ctl, remap } = openMapping({ p });
    const m = remap.current()!;
    expect(m.extraList().map((x) => x.modifier)).toEqual([-1, 4, 5]);   // the double, K1, K2; S set aside
    m.removeExtra(1);                                                   // K1
    expect(JSON.parse(localStorage.getItem(key)!).combos).toEqual([S, K2]);
    m.removeExtra(0);                                                   // the double
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, doubles: [], combos: [S, K2] });
    setControllerStanceMode('pop');
    ctl.remapFrame(t += 16);
    expect(m.extraList().map(({ modifier, button, action }) => ({ modifier, button, action }))).toEqual([S, K2]);
  });

  it('Square\'s clear on Extra binds still clears them all, the set-aside one with them', () => {
    const p = plainPad();
    const key = padExtrasKeyOf(profileKey(p));
    localStorage.setItem(STANCE_MODE_KEY, 'separate');
    localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), crouch: 13, prone: TRIANGLE }));
    localStorage.setItem(key, JSON.stringify({ version: 1, doubles: [{ button: 6, action: 'reload' }], combos: [{ modifier: TRIANGLE, button: 0, action: 'inventory' }] }));
    const { remap } = openMapping({ p });
    remap.current()!.clearExtras();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, doubles: [], combos: [] });
  });
});
