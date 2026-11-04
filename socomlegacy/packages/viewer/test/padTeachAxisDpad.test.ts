// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControllerInput } from '../src/controllerInput';
import { PadBinding, type BindingEvent } from '../src/padBinding';
import { HOLD_TO_BIND_MS_ADAPTATION, TEACH_STEPS } from '../src/padLayout';
import { SETUP_KEY, parseController } from '../src/startupSettings';

/**
 * LATER 380's pass (product track, a browser adaptation) on a pad whose d-pad is two plain axes resting at 0 (axes 6
 * and 7, -1 up/left and +1 down/right), its sticks on axes 0-3: the trigger settle (`settledTrigger`) is for L2 and R2
 * only, so D-pad down on the axis D-pad up was taught on neither rewrites D-pad up nor moves the pass's rest (B178's
 * fold for #576).
 */
const pad = {
  index: 0, id: 'Generic USB Gamepad (Vendor: 0079 Product: 0006)', connected: true, mapping: '',
  axes: [0, 0, 0, 0, 0, 0, 0, 0], buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })),
};
type Held = { buttons?: number[]; axes?: Record<number, number> };
const set = (o: Held = {}): void => {
  pad.buttons.forEach((b, i) => { b.pressed = (o.buttons ?? []).includes(i); b.value = b.pressed ? 1 : 0; });
  pad.axes = pad.axes.map((_, i) => o.axes?.[i] ?? 0);
};
const TEACH_INPUT: Record<string, Held> = {
  Cross: { buttons: [0] }, Circle: { buttons: [1] }, START: { buttons: [9] },
  'D-pad up': { axes: { 7: -1 } }, 'D-pad down': { axes: { 7: 1 } }, 'D-pad left': { axes: { 6: -1 } }, 'D-pad right': { axes: { 6: 1 } },
  'Left stick right': { axes: { 0: 1 } }, 'Left stick down': { axes: { 1: 1 } }, 'Right stick right': { axes: { 2: 1 } }, 'Right stick down': { axes: { 3: 1 } },
  Square: { buttons: [2] }, Triangle: { buttons: [3] }, L1: { buttons: [4] }, R1: { buttons: [5] }, L2: { buttons: [6] }, R2: { buttons: [7] },
  SELECT: { buttons: [8] }, L3: { buttons: [10] }, R3: { buttons: [11] },
};
const profile = (): ReturnType<typeof parseController> | null => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(`${SETUP_KEY}.pad.[`)) return parseController(localStorage.getItem(k));
  }
  return null;
};

beforeEach(() => { localStorage.clear(); set(); });
afterEach(() => { localStorage.clear(); });

describe('a d-pad on two axes resting at 0', () => {
  it('the whole pass finishes, each d-pad direction its own axis and sign, the sticks on axes 0-3', () => {
    let t = 10_000;
    const b = new PadBinding({ pads: { getGamepads: () => [pad] }, now: () => t });
    const events: BindingEvent[] = [];
    b.onChange((e) => { events.push(e); });
    const hold = (o: Held, ms: number): void => { for (let e = 0; e < ms; e += 16) { set(o); b.frame(t += 16); } };
    hold({}, 64);
    expect(b.teach()).toBe(true);
    for (const s of TEACH_STEPS) {
      hold({}, 64);
      expect(b.teachState(), `the pass waits at ${s.name}`).toMatchObject({ name: s.name });
      hold(TEACH_INPUT[s.name]!, HOLD_TO_BIND_MS_ADAPTATION + 32);
    }
    hold({}, 64);
    expect(events.map((e) => e.kind)).toContain('taught');
    expect(events.map((e) => e.kind)).not.toContain('refused');
    const layout = profile()!.layout!;
    expect(layout.buttons[12]).toEqual({ axis: 7, from: 0, to: -1 });
    expect(layout.buttons[13]).toEqual({ axis: 7, from: 0, to: 1 });
    expect(layout.buttons[14]).toEqual({ axis: 6, from: 0, to: -1 });
    expect(layout.buttons[15]).toEqual({ axis: 6, from: 0, to: 1 });
    expect(layout.axes).toEqual([0, 1, 2, 3].map((axis) => ({ axis, invert: false })));
    const input = new ControllerInput();
    input.waitForRest = false;
    set();
    const idle = input.poll({ getGamepads: () => [pad] })!;
    expect([12, 13, 14, 15].some((i) => idle.buttons[i]!.pressed), 'a d-pad at rest is not held').toBe(false);
    set({ axes: { 7: 1 } });
    const down = input.poll({ getGamepads: () => [pad] })!;
    expect([down.buttons[12]!.pressed, down.buttons[13]!.pressed]).toEqual([false, true]);
  });
});
