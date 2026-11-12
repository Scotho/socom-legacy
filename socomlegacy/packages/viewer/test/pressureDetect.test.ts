// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyPressureDefault, ControllerInput } from '../src/controllerInput';
import { GamePad } from '../src/setupPad';
import { PadBinding } from '../src/padBinding';
import { PRESSURE_SEPARATE_TOAST, pendingPressureDefault, pressureConnectOffered, pressureDetector } from '../src/pressureDetect';
import { PRESSURE_PAD_ID, PRESSURE_PAD_INDEX } from '../src/pressurePad';
import { SETUP_KEY, STANCE_MODE_KEY, controllerStanceMode, defaultController, parseController, setControllerStanceMode, type ControllerConfig } from '../src/startupSettings';

/**
 * PS2P (the owner, 2026-11-01, via seat 5d: "if you think feasible to auto-detect pressure sensitive controllers, and when
 * we do, default to the new separate mode we have with the two states bound"): `./pressureDetect`, a browser adaptation
 * (OT.R28; WebHID is Chromium's). A pad is pressure-capable when (a) it is the WebHID 054c:0268 reader's pad and
 * Triangle's byte reads between its ends on two or more frames of one press, or (b) a Gamepad API pad of the standard
 * mapping reads a face button (0-3) strictly between 0.05 and 0.95. L2 / R2 (6 / 7) are analog on every pad and never
 * count; a pad of another mapping never counts. The first detection, with no Stance mode stored, only records a pending
 * default (5d's fold, 2026-11-01: "The mode must never change under the player in a match"); the console's next frame
 * (the front end's, never the overlay's over a match: `applyPressureDefault`) sets and enters SEPARATE (Prone cloned
 * from Triangle, Crouch on the same button: light / firm) and says so once -- if no mode was stored meanwhile.
 */
type Btn = { pressed: boolean; value: number };
const pad = (o: { id?: string; mapping?: string; index?: number; nativePressure?: boolean } = {}) => ({
  index: o.index ?? 0, id: o.id ?? 'Sony PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)', mapping: o.mapping ?? 'standard',
  connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (): Btn => ({ pressed: false, value: 0 })),
  ...(o.nativePressure ? { nativePressure: true } : {}),
});
type Pad = ReturnType<typeof pad>;
const set = (p: Pad, button: number, value: number): Pad => { p.buttons[button] = { pressed: value > 0, value }; return p; };
/** The WebHID reader hands a new frame object per report (`PressurePad.read`): one per poll here. */
const hidFrame = (triangle: number): Pad => set(pad({ id: PRESSURE_PAD_ID, index: PRESSURE_PAD_INDEX, nativePressure: true }), 3, triangle);
const profileKey = (p: { id: string; mapping: string; buttons: unknown[]; axes: unknown[] }): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
const stored = (p: Pad): ControllerConfig => parseController(localStorage.getItem(profileKey(p)));

beforeEach(() => { localStorage.clear(); pressureDetector.clear(); });
afterEach(() => { localStorage.clear(); pressureDetector.clear(); });

describe('PS2P: the Gamepad API check -- a face button between 0.05 and 0.95 on a standard pad', () => {
  it('Cross, Circle, Square or Triangle at 0.5 detects; the detection is the pad\'s (by id) from then on', () => {
    for (const b of [0, 1, 2, 3]) {
      pressureDetector.clear();
      const p = set(pad(), b, 0.5);
      expect(pressureDetector.observe(p)).toBe(true);
      expect(pressureDetector.capable(set(pad({ index: 2 }), b, 0))).toBe(true);
      expect(pressureDetector.observe(p)).toBe(false);          // once
    }
  });
  it('L2 / R2 (6 / 7) at any value never count, nor the other buttons', () => {
    for (const b of [4, 5, 6, 7, 12, 13, 14, 15]) for (const v of [0.06, 0.3, 0.5, 0.94]) expect(pressureDetector.observe(set(pad(), b, v))).toBe(false);
    expect(pressureDetector.capable(pad())).toBe(false);
  });
  it('a pad reading only 0 or 1 never counts, nor values at the ends (0.05, 0.95 and beyond)', () => {
    for (const v of [0, 1, 0.05, 0.95, 0.02, 0.99]) for (const b of [0, 1, 2, 3]) expect(pressureDetector.observe(set(pad(), b, v))).toBe(false);
    expect(pressureDetector.capable(pad())).toBe(false);
  });
  it('a pad of another mapping never counts, a face button at 0.5 or not', () => {
    for (const b of [0, 1, 2, 3]) expect(pressureDetector.observe(set(pad({ mapping: '' }), b, 0.5))).toBe(false);
    expect(pressureDetector.capable(pad({ mapping: '' }))).toBe(false);
  });
});

describe('PS2P: the WebHID 054c:0268 pad -- Triangle\'s byte between its ends on two frames of one press', () => {
  it('one intermediate frame does not detect; a second in the same press does', () => {
    expect(pressureDetector.observe(hidFrame(0.2))).toBe(false);
    expect(pressureDetector.observe(hidFrame(0.4))).toBe(true);
  });
  it('the same report read twice is one frame (two readers poll it in one page frame)', () => {
    const f = hidFrame(0.2);
    expect(pressureDetector.observe(f)).toBe(false);
    expect(pressureDetector.observe(f)).toBe(false);
    expect(pressureDetector.capable(f)).toBe(false);
  });
  it('a release between them starts the count again; 0 and 1 are not between the ends', () => {
    expect(pressureDetector.observe(hidFrame(0.2))).toBe(false);
    expect(pressureDetector.observe(hidFrame(0))).toBe(false);
    expect(pressureDetector.observe(hidFrame(0.3))).toBe(false);
    expect(pressureDetector.observe(hidFrame(1))).toBe(false);
    expect(pressureDetector.observe(hidFrame(1))).toBe(false);
    expect(pressureDetector.observe(hidFrame(0))).toBe(false);
    expect(pressureDetector.capable(hidFrame(0))).toBe(false);
  });
  it('the cheap Gamepad API check alone does not detect the WebHID pad (a face button at 0.5 on one frame)', () => {
    expect(pressureDetector.observe(set(hidFrame(0), 0, 0.5))).toBe(false);
  });
});

describe('PS2P: the auto default -- recorded where it is seen, applied at the menus\' next frame, never over a stored mode', () => {
  /** The match's reader (`main.ts`'s `GamePad`: the binds take their buttons, no wait for rest). */
  const match = (p: Pad) => {
    const g = new GamePad({ waitForRest: false });
    const src = { getGamepads: () => [p] };
    return { g, poll: () => g.poll(src) };
  };

  it('first seen in a match: the mode and the binds are unchanged for the rest of the match -- only a pending default', () => {
    const p = pad();
    const m = match(p);
    m.poll(); set(p, 3, 0.5); m.poll();
    expect(pendingPressureDefault()?.id).toBe(p.id);
    for (let i = 0; i < 120; i++) { set(p, 3, i % 3 === 0 ? 0 : 0.6); m.poll(); }
    expect(localStorage.getItem(STANCE_MODE_KEY)).toBeNull();
    expect(controllerStanceMode()).toBe('pop');
    expect(localStorage.getItem(profileKey(p))).toBeNull();
    expect(m.g.input.config).toMatchObject({ prone: -1, crouch: -1 });
    expect([m.g.crouch, m.g.prone]).toEqual([false, false]);
  });

  it('at the menus\' next frame: SEPARATE set, Prone and Crouch both on Triangle, the toast said once', () => {
    const p = pad();
    const m = match(p);
    m.poll(); set(p, 3, 0.5); m.poll(); set(p, 3, 0); m.poll();
    expect(applyPressureDefault()).toBe(PRESSURE_SEPARATE_TOAST);
    expect(controllerStanceMode()).toBe('separate');
    expect(localStorage.getItem(STANCE_MODE_KEY)).toBe('separate');
    expect(stored(p)).toMatchObject({ prone: 3, crouch: 3 });
    expect(pendingPressureDefault()).toBeNull();
    expect(applyPressureDefault()).toBeNull();
    // Once: COMBINED chosen afterwards is a stored mode, kept; the pad is not detected again.
    setControllerStanceMode('pop');
    set(p, 2, 0.4); m.poll();
    expect(pendingPressureDefault()).toBeNull();
    expect(applyPressureDefault()).toBeNull();
    expect(controllerStanceMode()).toBe('pop');
  });

  it('the toast says what is bound: the bound case unchanged, a declined Crouch named (5d\'s fold, 2026-11-01)', () => {
    expect(PRESSURE_SEPARATE_TOAST).toBe('Pressure controller: Crouch and Prone bound to Triangle');
    // Crouch already bound in the stored profile (R3, 11): `bindPressureCrouch` declines; the line names the real binds.
    const p = pad();
    localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), crouch: 11 }));
    const m = match(p);
    m.poll(); set(p, 3, 0.5); m.poll();
    expect(applyPressureDefault()).toBe('Pressure controller: SEPARATE on; Prone on Triangle, Crouch on R3');
    expect(controllerStanceMode()).toBe('separate');
    expect(stored(p)).toMatchObject({ prone: 3, crouch: 11 });
  });

  it('a mode stored between the detection and the menus\' frame is never overridden', () => {
    const p = pad();
    const m = match(p);
    m.poll(); set(p, 3, 0.5); m.poll();
    expect(pendingPressureDefault()).not.toBeNull();
    setControllerStanceMode('pop');                               // the player chose COMBINED meanwhile
    expect(applyPressureDefault()).toBeNull();
    expect(controllerStanceMode()).toBe('pop');
    expect(localStorage.getItem(profileKey(p))).toBeNull();
    expect(pendingPressureDefault()).toBeNull();
  });

  it('COMBINED or SEPARATE stored before: nothing is recorded, the profile untouched', () => {
    for (const mode of ['pop', 'separate'] as const) {
      localStorage.clear(); pressureDetector.clear();
      setControllerStanceMode(mode);
      const p = pad();
      localStorage.setItem(profileKey(p), JSON.stringify({ ...defaultController(), prone: 3, crouch: 11 }));
      const r = new ControllerInput(); r.waitForRest = false;
      r.poll({ getGamepads: () => [p] }); set(p, 3, 0.5); r.poll({ getGamepads: () => [p] });
      expect(r.pressureCapable()).toBe(true);
      expect(pendingPressureDefault()).toBeNull();
      expect(applyPressureDefault()).toBeNull();
      expect(controllerStanceMode()).toBe(mode);
      expect(stored(p)).toMatchObject({ prone: 3, crouch: 11 });
    }
  });

  it('a digital pad never records it (0 / 1 only, L2 / R2 analog)', () => {
    const p = pad({ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' });
    const m = match(p);
    m.poll(); set(p, 0, 1); set(p, 6, 0.5); set(p, 7, 0.3); m.poll();
    expect(pendingPressureDefault()).toBeNull();
    expect(applyPressureDefault()).toBeNull();
    expect(localStorage.getItem(STANCE_MODE_KEY)).toBeNull();
  });

  it('SEPARATE entered by hand on a detected pad binds Crouch to Prone\'s Triangle too (PadBinding.enterSeparate)', () => {
    setControllerStanceMode('pop');
    const p = pad();
    const b = new PadBinding({ pads: { getGamepads: () => [p] }, now: () => 0, holdMs: 0 });
    b.frame(0); set(p, 3, 0.5); b.frame(1); set(p, 3, 0); b.frame(2);
    b.enterSeparate();
    expect(stored(p)).toMatchObject({ prone: 3, crouch: 3 });
  });

  it('LATER 663: Restore defaults in SEPARATE on a detected pad ends where entering SEPARATE does: Crouch and Prone on Triangle', () => {
    setControllerStanceMode('separate');
    const p = pad();
    const b = new PadBinding({ pads: { getGamepads: () => [p] }, now: () => 0, holdMs: 0 });
    b.frame(0); set(p, 3, 0.5); b.frame(1); set(p, 3, 0); b.frame(2);
    b.setProne(11); b.setCrouch(10);                           // the player's own binds, then the restore
    b.restoreDefaults();
    expect([b.prone(), b.crouch()]).toEqual([3, 3]);
    expect(stored(p)).toMatchObject({ prone: 3, crouch: 3 });
  });
});

describe('PS2P: the WebHID Connect row is offered on Chromium with a 054c:0268 pad only', () => {
  const ds3 = pad();
  const ds4 = pad({ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)' });
  const firefoxDs3 = pad({ id: '054c-0268-Sony PLAYSTATION(R)3 Controller' });
  it('WebHID present (Chromium) and a 054c:0268 pad: offered; without either: not', () => {
    expect(pressureConnectOffered([ds3], { hid: {} })).toBe(true);
    expect(pressureConnectOffered([firefoxDs3], { hid: {} })).toBe(true);
    expect(pressureConnectOffered([ds3], {})).toBe(false);
    expect(pressureConnectOffered([ds4], { hid: {} })).toBe(false);
    expect(pressureConnectOffered([], { hid: {} })).toBe(false);
  });
});
