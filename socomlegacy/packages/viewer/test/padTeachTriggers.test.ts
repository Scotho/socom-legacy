// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControllerInput } from '../src/controllerInput';
import { PadBinding, type BindingEvent } from '../src/padBinding';
import { detectSource, HOLD_TO_BIND_MS_ADAPTATION, TEACH_STEPS } from '../src/padLayout';
import { SETUP_KEY, parseController } from '../src/startupSettings';

/**
 * LATER 380's pass on an Xbox-style pad read without the standard mapping (product track, a browser adaptation): the
 * GameSir-G7 HE for Xbox on macOS Chromium, as a player's diagnostic recorded it on 2026-10-28 -- fifteen buttons, ten
 * axes, the sticks on axes 0/1 and 2/5, the triggers on axes 3/4 resting at -1, the d-pad a hat on axis 9, and each
 * trigger also pressing a digital button (8, 9) early in its pull. Chromium reports a trigger axis as 0 until it is first
 * touched, and at -1 once let go.
 */
const HAT_REST = 3.2857;
const HAT = [-1, -1 + 2 / 7, -1 + 4 / 7, -1 + 6 / 7, -1 + 8 / 7, -1 + 10 / 7, -1 + 12 / 7, 1];
const ID = 'GameSir-G7 HE Controller for Xbox (Vendor: 3537 Product: 1082)';

/** The pad, its triggers untouched (`fresh`) or already pulled once. */
function gamesir(fresh: boolean) {
  const touched = new Set<number>(fresh ? [] : [3, 4]);
  const pad = {
    index: 0, id: ID, connected: true, mapping: '',
    axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, HAT_REST], buttons: Array.from({ length: 15 }, () => ({ pressed: false, value: 0 })),
  };
  /** The pad held as `o`: buttons down, axes moved; a trigger axis reads 0 untouched, -1 at rest once touched. */
  const set = (o: { buttons?: number[]; axes?: Record<number, number> } = {}): void => {
    pad.buttons.forEach((b, i) => { b.pressed = (o.buttons ?? []).includes(i); b.value = b.pressed ? 1 : 0; });
    for (const k of Object.keys(o.axes ?? {})) touched.add(Number(k));
    pad.axes = pad.axes.map((_, i) => o.axes?.[i] ?? (i === 9 ? HAT_REST : (i === 3 || i === 4) && touched.has(i) ? -1 : 0));
  };
  set();
  return { pad, set };
}

const L2 = { buttons: [8], axes: { 3: 1 } };
const R2 = { buttons: [9], axes: { 4: 1 } };
const TEACH_INPUT: Record<string, { buttons?: number[]; axes?: Record<number, number> }> = {
  Cross: { buttons: [0] }, Circle: { buttons: [1] }, START: { buttons: [11] },
  'D-pad up': { axes: { 9: HAT[0]! } }, 'D-pad down': { axes: { 9: HAT[4]! } }, 'D-pad left': { axes: { 9: HAT[6]! } }, 'D-pad right': { axes: { 9: HAT[2]! } },
  'Left stick right': { axes: { 0: 1 } }, 'Left stick down': { axes: { 1: 1 } }, 'Right stick right': { axes: { 2: 1 } }, 'Right stick down': { axes: { 5: 1 } },
  Square: { buttons: [3] }, Triangle: { buttons: [4] }, L1: { buttons: [6] }, R1: { buttons: [7] }, L2, R2,
  SELECT: { buttons: [10] }, L3: { buttons: [13] }, R3: { buttons: [14] },
};

const profile = (): ReturnType<typeof parseController> | null => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(`${SETUP_KEY}.pad.[`)) return parseController(localStorage.getItem(k));
  }
  return null;
};

function teachAll(fresh: boolean) {
  const g = gamesir(fresh);
  let t = 10_000;
  const b = new PadBinding({ pads: { getGamepads: () => [g.pad] }, now: () => t });
  const events: BindingEvent[] = [];
  b.onChange((e) => { events.push(e); });
  const hold = (o: Parameters<typeof g.set>[0], ms: number): void => { for (let e = 0; e < ms; e += 16) { g.set(o); b.frame(t += 16); } };
  hold({}, 64);
  expect(b.teach()).toBe(true);
  for (const s of TEACH_STEPS) {
    hold({}, 64);
    expect(b.teachState(), `the pass waits at ${s.name}`).toMatchObject({ name: s.name });
    hold(TEACH_INPUT[s.name]!, HOLD_TO_BIND_MS_ADAPTATION + 32);
  }
  hold({}, 64);
  return { g, b, events };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('a trigger that also presses a button: the axis is the one input', () => {
  it('detectSource takes the trigger axis when its digital twin is pressed with it', () => {
    const { pad, set } = gamesir(false);
    const rest = { buttons: pad.buttons.map(() => ({ pressed: false, value: 0 })), axes: [...pad.axes] };
    set(L2);
    expect(detectSource(pad, rest)).toEqual({ axis: 3, from: -1, to: 1 });
  });

  it('two axes moved together are still no one input', () => {
    const { pad, set } = gamesir(false);
    const rest = { buttons: pad.buttons.map(() => ({ pressed: false, value: 0 })), axes: [...pad.axes] };
    set({ buttons: [8], axes: { 3: 1, 4: 1 } });
    expect(detectSource(pad, rest)).toBeNull();
  });
});

describe('the whole pass on the GameSir', () => {
  it('triggers already touched: L2 and R2 are taught as their axes, and the pad reads as a standard one', () => {
    const { g, events } = teachAll(false);
    expect(events.map((e) => e.kind)).toContain('taught');
    const layout = profile()!.layout!;
    expect(layout.buttons[6]).toEqual({ axis: 3, from: -1, to: 1 });
    expect(layout.buttons[7]).toEqual({ axis: 4, from: -1, to: 1 });
    expect(layout.axes).toEqual([{ axis: 0, invert: false }, { axis: 1, invert: false }, { axis: 2, invert: false }, { axis: 5, invert: false }]);
    const input = new ControllerInput();
    input.waitForRest = false;
    g.set({});
    const idle = input.poll({ getGamepads: () => [g.pad] })!;
    expect(idle.buttons[6]!.pressed || idle.buttons[7]!.pressed, 'released triggers are not held').toBe(false);
    g.set(L2);
    expect(input.poll({ getGamepads: () => [g.pad] })!.buttons[6]!.pressed).toBe(true);
  });

  it('triggers untouched when the pass begins (Chromium reads them 0): the pass still finishes, each trigger rests at -1', () => {
    const { g, events } = teachAll(true);
    expect(events.map((e) => e.kind)).toContain('taught');
    const layout = profile()!.layout!;
    expect(layout.buttons[6]).toEqual({ axis: 3, from: -1, to: 1 });
    expect(layout.buttons[7]).toEqual({ axis: 4, from: -1, to: 1 });
    expect(layout.buttons[8]).toEqual({ button: 10 });            // SELECT, the step after both triggers
    const input = new ControllerInput();
    input.waitForRest = false;
    g.set({});
    const idle = input.poll({ getGamepads: () => [g.pad] })!;
    expect(idle.buttons[6]!.pressed || idle.buttons[7]!.pressed, 'released triggers are not held').toBe(false);
  });

  it('after a reload the untouched triggers read 0, halfway on a -1..1 axis: not held, by press or by value', () => {
    teachAll(false);
    const again = gamesir(true);
    const input = new ControllerInput();
    input.waitForRest = false;
    const v = input.poll({ getGamepads: () => [again.pad] })!;
    for (const b of [6, 7]) expect(v.buttons[b]!.pressed || v.buttons[b]!.value >= 0.5, `button ${b}`).toBe(false);
  });
});
