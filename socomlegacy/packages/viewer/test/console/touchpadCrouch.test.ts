// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { livePad } from '../../src/console/adapters/pad';
import { liveOptions } from '../../src/console/adapters/options';
import { remapAdapter } from '../../src/console/adapters/remap';
import { REMAP_STANCE_ROW } from '../../src/console/render/remap';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, type Adapters } from '../../src/console/state';
import { TOUCHPAD_BUTTON, TOUCHPAD_CROUCH_TOAST } from '../../src/controllerInput';
import { OVERLAY_BUTTON_KEY } from '../../src/modern/overlay/binding';
import { PadBinding } from '../../src/padBinding';
import { SETUP_KEY, controllerStanceMode, defaultController, parseController, type ControllerConfig } from '../../src/startupSettings';
import { mountShell } from './shell';

/**
 * SEP-SHOW (the owner, 2026-10-31, seat 5d: "Yes, with those defaults"): when the Stance mode is set to SEPARATE, a
 * PlayStation pad with a touchpad (`PadBinding.touchpad()`: the standard mapping, the PlayStation family, more than 17
 * buttons) gets Crouch on the touchpad's click (17) -- only when Crouch is unbound and the touchpad is free (none of the
 * sixteen bindings, not Prone's bind, not the overlay's button) -- and the console says "Crouch bound to Touchpad". Only
 * at the mode change, by either way into it (the Button mapping's Stance mode row, `grammar.ts` `stanceModeStep`; the
 * Options Controller tab's row, `adapters/options.ts`); never at a pad connected later. A browser adaptation (OT.R28).
 */
type Btn = { pressed: boolean; touched: boolean; value: number };
type Pad = { index: number; id: string; connected: boolean; mapping: string; timestamp: number; axes: number[]; buttons: Btn[] };
const make = (id: string, n: number): Pad => ({ index: 0, id, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 })) });
const DUALSENSE = (): Pad => make('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 18);
const DS4 = (): Pad => make('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 18);
const DS3 = (): Pad => make('Sony PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)', 17);
const XBOX = (): Pad => make('Xbox 360 Controller (XInput STANDARD GAMEPAD)', 17);
const profileKey = (p: Pad): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const saveProfile = (p: Pad, c: Partial<ControllerConfig>): void => { localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), ...c })); };
const stored = (p: Pad): ControllerConfig => parseController(localStorage.getItem(profileKey(p)));
const TRIANGLE = 3, UP = 12, R3 = 11;

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
  localStorage.clear();
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  vi.useRealTimers();
});

/** The Button mapping's way in: the screen pushed over `p`, Right on its Stance mode row (`grammar.ts` `stanceModeStep`). */
function viaMapping(p: Pad) {
  pads = [p];
  const remap = remapAdapter(() => new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0 }));
  page = bootConsole(document, window, { ...sampleAdapters(), remap } as Adapters, { keymap: true });
  const ctl = page.ctl;
  ctl.doAct('opt:controller');
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
  ctl.press('cross');
  ctl.remapFrame(t += 16);
  ctl.S.toast = '';
  ctl.S.rm.row = REMAP_STANCE_ROW;
  ctl.press('right');
  ctl.remapFrame(t += 16);
  return { ctl };
}

/** The Options Controller tab's way in: its Stance mode row, Right (`adapters/options.ts`), over the console's live pad. */
function viaOptions(p: Pad | null) {
  pads = p ? [p] : [];
  const source = { getGamepads: () => pads };
  const pad = livePad(() => {}, { source });
  pad.read();
  const options = liveOptions(() => { page?.render(); }, { signedIn: () => false, pads: () => [], pad });
  page = bootConsole(document, window, { ...sampleAdapters(), pad, options } as Adapters, { keymap: true });
  const ctl = page.ctl;
  ctl.doAct('opt:controller');
  ctl.S.opt.zone = 'rows';
  ctl.S.opt.row = options.categories().find((c) => c.id === 'controller')!.rows.findIndex((r) => r.id === 'stance-mode');
  ctl.S.toast = '';
  ctl.press('right');
  return { ctl, pad };
}

const WAYS = { 'the Button mapping row (grammar stanceModeStep)': viaMapping, 'the Options Controller row (adapters/options)': viaOptions } as const;

describe.each(Object.entries(WAYS))('SEP-SHOW: the touchpad becomes Crouch on SEPARATE, by %s', (_way, via) => {
  for (const [name, mk] of [['DualSense', DUALSENSE], ['DualShock 4', DS4]] as const) {
    it(`${name}: Crouch bound to the touchpad (17), saved, said; Prone still takes Triangle's button`, () => {
      const p = mk();
      const { ctl } = via(p);
      expect(controllerStanceMode()).toBe('separate');
      expect(stored(p)).toMatchObject({ crouch: TOUCHPAD_BUTTON, prone: TRIANGLE });
      expect(TOUCHPAD_BUTTON).toBe(17);
      expect(ctl.S.toast).toBe(TOUCHPAD_CROUCH_TOAST);
      expect(TOUCHPAD_CROUCH_TOAST).toBe('Crouch bound to Touchpad');
    });
  }

  for (const [name, mk] of [['Xbox', XBOX], ['DualShock 3 (no touchpad)', DS3]] as const) {
    it(`${name}: Crouch left unbound, nothing said`, () => {
      const p = mk();
      const { ctl } = via(p);
      expect(controllerStanceMode()).toBe('separate');
      expect(stored(p).crouch).toBe(-1);
      expect(ctl.S.toast).not.toBe(TOUCHPAD_CROUCH_TOAST);
    });
  }

  it('a Crouch already bound is kept, nothing said', () => {
    const p = DS4();
    saveProfile(p, { crouch: UP });
    const { ctl } = via(p);
    expect(stored(p).crouch).toBe(UP);
    expect(ctl.S.toast).not.toBe(TOUCHPAD_CROUCH_TOAST);
  });

  it('the touchpad taken by one of the sixteen (Select on it): Crouch left unbound, nothing said', () => {
    const p = DUALSENSE();
    const bindings = defaultController().bindings;
    bindings[8] = TOUCHPAD_BUTTON;
    saveProfile(p, { bindings });
    const { ctl } = via(p);
    expect(stored(p).crouch).toBe(-1);
    expect(ctl.S.toast).not.toBe(TOUCHPAD_CROUCH_TOAST);
  });

  it('the touchpad taken by Prone: Crouch left unbound, nothing said', () => {
    const p = DS4();
    saveProfile(p, { prone: TOUCHPAD_BUTTON });
    const { ctl } = via(p);
    expect(stored(p)).toMatchObject({ crouch: -1, prone: TOUCHPAD_BUTTON });
    expect(ctl.S.toast).not.toBe(TOUCHPAD_CROUCH_TOAST);
  });

  it('the touchpad taken by the overlay button: Crouch left unbound, nothing said', () => {
    const p = DUALSENSE();
    localStorage.setItem(OVERLAY_BUTTON_KEY, String(TOUCHPAD_BUTTON));
    const { ctl } = via(p);
    expect(stored(p).crouch).toBe(-1);
    expect(ctl.S.toast).not.toBe(TOUCHPAD_CROUCH_TOAST);
  });
});

describe('SEP-SHOW: only at the mode change, never at a later pad connect', () => {
  it('SEPARATE chosen on Options with no pad; a DualSense connected after keeps Crouch unbound, on Options and on the Button mapping', () => {
    const { ctl, pad } = viaOptions(null);
    expect(controllerStanceMode()).toBe('separate');
    expect(ctl.S.toast).not.toBe(TOUCHPAD_CROUCH_TOAST);
    const p = DUALSENSE();
    pads = [p];
    pad.read();                                                      // the console's live pad reads it now
    expect(stored(p).crouch).toBe(-1);
    const b = new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0 });
    b.poll();                                                        // the Button mapping's machine reads it now
    expect(b.crouch()).toBe(-1);
    expect(ctl.S.toast).not.toBe(TOUCHPAD_CROUCH_TOAST);
  });

  it('Restore defaults in SEPARATE is no mode change: Prone cloned again, Crouch unbound', () => {
    const p = DS4();
    pads = [p];
    localStorage.setItem(`s2u.startup.v1.stanceMode`, 'separate');
    const b = new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0 });
    b.poll();
    b.setProne(R3);
    b.restoreDefaults();
    expect([b.prone(), b.crouch()]).toEqual([TRIANGLE, -1]);
  });

  it('PadBinding.touchpad() is the predicate: DualSense and DS4 yes; Xbox and DS3 no', () => {
    for (const [mk, want] of [[DUALSENSE, true], [DS4, true], [XBOX, false], [DS3, false]] as const) {
      const p = mk();
      pads = [p];
      const b = new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0 });
      b.poll();
      expect(b.touchpad(), p.id).toBe(want);
    }
  });
});
