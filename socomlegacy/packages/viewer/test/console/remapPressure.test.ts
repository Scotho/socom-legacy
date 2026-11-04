// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { remapAdapter } from '../../src/console/adapters/remap';
import { REMAP_CROUCH_ROW, REMAP_PRONE_ROW } from '../../src/console/render/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, type Adapters } from '../../src/console/state';
import { PadBinding } from '../../src/padBinding';
import { PRESSURE_SEPARATE_TOAST, pendingPressureDefault, pressureDetector } from '../../src/pressureDetect';
import { GamePad } from '../../src/setupPad';
import { SETUP_KEY, controllerStanceMode, defaultController, setControllerStanceMode, type ControllerConfig } from '../../src/startupSettings';
import { mountShell } from './shell';

/**
 * PS2P (the owner, 2026-11-01, via seat 5d): the Button mapping with a pressure pad. Phil's "Triangle pressure" toggle row
 * is gone (shown for every pad, it sent a DualSense's every Triangle press prone); "Connect USB pressure controller" is
 * offered only where WebHID is (Chromium) and a 054c:0268 pad is connected. SEPARATE's Crouch and Prone on one pressure
 * button say which press is which (light / firm); the auto default's toast reaches the console. A browser adaptation.
 */
const DS3_ID = 'Sony PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)';
const DS4_ID = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
const pad = (id = DS3_ID, n = 17) => ({
  index: 0, id, connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const CONNECT = 'Connect USB pressure controller';

let page: ConsolePage | null = null;
let pads: Pad[] = [];
let t = 10_000;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
const withHid = (on: boolean): void => {
  if (on) Object.defineProperty(navigator, 'hid', { value: {}, configurable: true });
  else delete (navigator as unknown as { hid?: unknown }).hid;
};
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  pressureDetector.clear();
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
  withHid(false);
  localStorage.clear();
  pressureDetector.clear();
  vi.useRealTimers();
});

function openMapping(p: Pad, o: { mode?: 'pop' | 'separate'; profile?: Partial<ControllerConfig>; console?: 'page' | 'overlay' } = {}) {
  pads = [p];
  if (o.profile) localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), ...o.profile }));
  if (o.mode) setControllerStanceMode(o.mode);
  const remap = remapAdapter(() => new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0 }));
  page = bootConsole(document, window, { ...sampleAdapters(), remap } as Adapters, { keymap: true, ...(o.console ? { mode: o.console } : {}) });
  const ctl = page.ctl;
  ctl.doAct('opt:controller');
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
  ctl.press('cross');
  ctl.remapFrame(t += 16);
  return { ctl };
}
/** The match's reader saw the pad pressed lightly (`main.ts`'s `GamePad`): the default recorded, not applied. */
function seenInMatch(p: Pad): void {
  const g = new GamePad({ waitForRest: false });
  const src = { getGamepads: () => [p] };
  g.poll(src);
  p.buttons[3] = { pressed: true, touched: true, value: 0.5 };
  g.poll(src);
  p.buttons[3] = { pressed: false, touched: false, value: 0 };
  g.poll(src);
}
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-act="remaprow"]')];
const titles = (): string[] => rows().map((r) => r.querySelector('.cx-item__title, .cx-roller__label')!.textContent!);
const sub = (i: number): string => rows()[i]!.querySelector('.cx-item__sub')?.textContent ?? '';
const glyph = (i: number): Element => rows()[i]!.querySelector('.cx-item__state')!;

describe('PS2P: the Button mapping\'s pressure rows', () => {
  it('no "Triangle pressure" row, in either mode, for any pad', () => {
    withHid(true);
    for (const id of [DS3_ID, DS4_ID]) for (const mode of ['pop', 'separate'] as const) {
      openMapping(pad(id, id === DS4_ID ? 18 : 17), { mode });
      expect(titles()).not.toContain('Triangle pressure');
      page!.dispose(); page = null; mountShell(document);
    }
  });

  it('Connect is offered with WebHID and a 054c:0268 pad, before Finish', () => {
    withHid(true);
    openMapping(pad(), { mode: 'pop' });
    expect(titles().slice(-2)).toEqual([CONNECT, 'Finish']);
  });

  it('no Connect without WebHID (not Chromium), nor for a pad that is not 054c:0268', () => {
    openMapping(pad(), { mode: 'pop' });
    expect(titles()).not.toContain(CONNECT);
    expect(titles().at(-1)).toBe('Finish');
    page!.dispose(); page = null; mountShell(document);
    withHid(true);
    openMapping(pad(DS4_ID, 18), { mode: 'pop' });
    expect(titles()).not.toContain(CONNECT);
  });

  it('SEPARATE on a pressure pad: Crouch and Prone both show Triangle, light and firm', () => {
    openMapping(pad(), { mode: 'separate', profile: { prone: 3, crouch: 3, nativePressure: true } });
    expect(glyph(REMAP_CROUCH_ROW).querySelector('.cx-btn--triangle')).not.toBeNull();
    expect(glyph(REMAP_PRONE_ROW).querySelector('.cx-btn--triangle')).not.toBeNull();
    expect(sub(REMAP_CROUCH_ROW)).toBe('Light press');
    expect(sub(REMAP_PRONE_ROW)).toBe('Firm press');
  });

  it('the auto default, detected on the mapping screen: SEPARATE set and the toast said', () => {
    const p = pad();
    const { ctl } = openMapping(p);
    expect(controllerStanceMode()).toBe('pop');                 // none stored: COMBINED, read
    ctl.S.toast = '';
    p.buttons[3] = { pressed: true, touched: true, value: 0.5 };
    ctl.remapFrame(t += 16);
    ctl.remapFrame(t += 16);
    expect(controllerStanceMode()).toBe('separate');
    expect(ctl.S.toast).toBe(PRESSURE_SEPARATE_TOAST);
    expect(titles()).toContain('Crouch');
  });
});

describe('PS2P fold (5d, 2026-11-01): "The mode must never change under the player in a match"', () => {
  it('detected in a match, applied at the front end\'s next console frame: SEPARATE and the toast', () => {
    const p = pad();
    seenInMatch(p);
    expect(controllerStanceMode()).toBe('pop');
    expect(pendingPressureDefault()).not.toBeNull();
    const { ctl } = openMapping(p);
    expect(controllerStanceMode()).toBe('separate');
    expect(ctl.S.toast).toBe(PRESSURE_SEPARATE_TOAST);
    expect(titles()).toContain('Crouch');
  });

  it('the overlay\'s console over a match never applies it: the mode stays, the default stays pending', () => {
    const p = pad();
    seenInMatch(p);
    const { ctl } = openMapping(p, { console: 'overlay' });
    ctl.remapFrame(t += 16);
    expect(controllerStanceMode()).toBe('pop');
    expect(ctl.S.toast).not.toBe(PRESSURE_SEPARATE_TOAST);
    expect(pendingPressureDefault()).not.toBeNull();
  });

  it('a mode stored before the front end\'s frame is kept: no SEPARATE, no toast', () => {
    const p = pad();
    seenInMatch(p);
    setControllerStanceMode('pop');
    const { ctl } = openMapping(p);
    expect(controllerStanceMode()).toBe('pop');
    expect(ctl.S.toast).not.toBe(PRESSURE_SEPARATE_TOAST);
  });
});

describe('PS2P fold (5d, 2026-11-01): Crouch unbound while pressure is active says where its light press is', () => {
  it('SEPARATE, a detected pad, Prone on Triangle, Crouch unbound: Crouch reads "Light press (Triangle)"', () => {
    openMapping(pad(), { mode: 'separate', profile: { prone: 3, crouch: -1, nativePressure: true } });
    expect(glyph(REMAP_CROUCH_ROW).textContent).toBe('Light press (Triangle)');
    expect(rows()[REMAP_CROUCH_ROW]!.getAttribute('aria-label')).toBe('Crouch: Light press (Triangle)');
  });

  it('Prone on another button: the light press is that button\'s', () => {
    openMapping(pad(), { mode: 'separate', profile: { prone: 11, crouch: -1, nativePressure: true } });
    expect(glyph(REMAP_CROUCH_ROW).textContent).toBe('Light press (R3)');
  });

  it('no pressure (a digital pad), or COMBINED, or Crouch bound: the row is as B193\'s', () => {
    openMapping(pad(DS4_ID, 18), { mode: 'separate', profile: { prone: 3, crouch: -1 } });
    expect(glyph(REMAP_CROUCH_ROW).textContent).toBe('Unbound');
    page!.dispose(); page = null; mountShell(document);
    openMapping(pad(), { mode: 'separate', profile: { prone: 3, crouch: 11, nativePressure: true } });
    expect(glyph(REMAP_CROUCH_ROW).textContent).not.toContain('Light press');
  });
});
