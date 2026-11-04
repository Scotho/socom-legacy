// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { livePad } from '../src/console/adapters/pad';
import { liveRemap } from '../src/console/adapters/remap';
import { ControllerInput } from '../src/controllerInput';
import { PadBinding, TEACH_IDLE_MS_ADAPTATION, type BindingEvent } from '../src/padBinding';
import { HOLD_TO_BIND_MS_ADAPTATION, TEACH_STEPS } from '../src/padLayout';
import { SETUP_KEY, parseController } from '../src/startupSettings';

/**
 * LATER 380 (the owner's word, 2026-10-23: "hold button style remapping"; product track, a browser adaptation): the
 * binding taken from a deliberate hold (`HOLD_TO_BIND_MS_ADAPTATION`), and a pad of another layout taught by press -- the pass on
 * its own buttons and axes saved as its profile's layout, then read as a standard pad by the launcher and the match.
 */
const HAT_REST = 3.2857;
const HAT = [-1, -1 + 2 / 7, -1 + 4 / 7, -1 + 6 / 7, -1 + 8 / 7, -1 + 10 / 7, -1 + 12 / 7, 1];   // up, ..., up-left
const stdPad = () => ({
  index: 0, id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', connected: true, mapping: 'standard',
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
});
/** A PS2 pad on a USB adapter: twelve buttons, two sticks on axes 0-3, the d-pad a hat on axis 6. */
const adapter = (index = 0) => ({
  index, id: 'Twin USB Joystick (Vendor: 0810 Product: 0001)', connected: true, mapping: '',
  axes: [0, 0, 0, 0, 0, 0, HAT_REST], buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })),
});
type Pad = ReturnType<typeof stdPad> | ReturnType<typeof adapter>;
const set = (p: Pad, o: { buttons?: number[]; axes?: Record<number, number> } = {}): void => {
  p.buttons.forEach((b, i) => { b.pressed = (o.buttons ?? []).includes(i); b.value = b.pressed ? 1 : 0; });
  const rest = p.mapping === 'standard' ? [0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, HAT_REST];
  p.axes = rest.map((v, i) => o.axes?.[i] ?? v);
};
const profile = (): ReturnType<typeof parseController> | null => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(`${SETUP_KEY}.pad.[`)) return parseController(localStorage.getItem(k));
  }
  return null;
};

function rig(pads: Pad[]) {
  let t = 10_000;
  const b = new PadBinding({ pads: { getGamepads: () => pads }, now: () => t });
  const events: BindingEvent[] = [];
  b.onChange((e) => { events.push(e); });
  /** `ms` of frames 16 ms apart with the pad held as `o`. */
  const hold = (o: Parameters<typeof set>[1], ms: number): void => { for (let e = 0; e < ms; e += 16) { set(pads[0]!, o); b.frame(t += 16); } };
  const rest = (): void => hold({}, 64);
  return { b, events, hold, rest, now: () => t, kinds: () => events.map((e) => e.kind) };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('the hold: a binding taken from a deliberate hold, never a tap', () => {
  it('a button held 800 ms binds; released before, nothing binds, and the hold starts over', () => {
    const r = rig([stdPad()]);
    r.rest();
    expect(r.b.listen(2)).toBe(true);
    r.rest();
    r.hold({ buttons: [16] }, HOLD_TO_BIND_MS_ADAPTATION / 2);
    expect(r.b.holdProgress()).toBeGreaterThan(0.4);
    expect(r.b.holdProgress()).toBeLessThan(0.6);
    expect(r.b.listening()).toBe(2);
    r.rest();                                                    // let go early: nothing
    expect(r.b.holdProgress()).toBe(0);
    expect(r.b.listening()).toBe(2);
    expect(profile()).toBeNull();
    r.hold({ buttons: [16] }, HOLD_TO_BIND_MS_ADAPTATION + 32);
    expect(r.events.at(-1)).toEqual({ kind: 'bound', action: 2, physical: 16 });
    expect(profile()!.bindings[2]).toBe(16);
  });

  it('a second button joining the hold starts it over; L1 + R1 still cancel at once', () => {
    const r = rig([stdPad()]);
    r.rest();
    r.b.listen(3);
    r.rest();
    r.hold({ buttons: [10] }, 600);
    r.hold({ buttons: [10, 11] }, 32);
    expect(r.b.holdProgress()).toBe(0);
    r.hold({ buttons: [4, 5] }, 16);
    expect(r.events.at(-1)).toEqual({ kind: 'end', action: 3, why: 'cancelled' });
  });
});

/** The pass on the adapter: each step's input held past the hold, the pad let go between. */
const TEACH_INPUT: Record<string, Parameters<typeof set>[1]> = {
  Cross: { buttons: [2] }, Circle: { buttons: [1] }, START: { buttons: [9] },
  'D-pad up': { axes: { 6: HAT[0]! } }, 'D-pad down': { axes: { 6: HAT[4]! } }, 'D-pad left': { axes: { 6: HAT[6]! } }, 'D-pad right': { axes: { 6: HAT[2]! } },
  'Left stick right': { axes: { 0: 1 } }, 'Left stick down': { axes: { 1: 1 } }, 'Right stick right': { axes: { 3: 1 } }, 'Right stick down': { axes: { 2: -1 } },
  Square: { buttons: [3] }, Triangle: { buttons: [0] },
};

describe('the pass: a pad of another layout taught by press', () => {
  it('teaches the required steps, skips the rest, saves the layout, and the pad then reads as a standard one', () => {
    const p = adapter();
    const r = rig([p]);
    r.rest();
    expect(r.b.standard()).toBe(false);
    expect(r.b.usable()).toBe(false);
    expect(r.b.listen(0)).toBe(false);                           // nothing to bind until it is taught
    expect(r.b.teach()).toBe(true);
    expect(r.b.teachState()).toMatchObject({ step: 0, name: 'Cross', required: true, total: TEACH_STEPS.length });
    for (const s of TEACH_STEPS) {
      const input = TEACH_INPUT[s.name];
      if (!input) { expect(r.b.skipStep(), s.name).toBe(true); continue; }
      r.rest();
      r.hold(input, HOLD_TO_BIND_MS_ADAPTATION + 32);
    }
    r.rest();
    expect(r.b.teachState()).toBeNull();
    expect(r.kinds()).toContain('taught');
    const saved = profile()!;
    expect(saved.layout!.buttons.slice(0, 4)).toEqual([{ button: 2 }, { button: 1 }, { button: 3 }, { button: 0 }]);
    expect(saved.layout!.buttons[9]).toEqual({ button: 9 });
    expect(saved.layout!.buttons[12]).toEqual({ axis: 6, to: HAT[0], hat: true });
    expect(saved.layout!.buttons[4]).toBeNull();                 // L1 skipped
    expect(saved.layout!.axes).toEqual([{ axis: 0, invert: false }, { axis: 1, invert: false }, { axis: 3, invert: false }, { axis: 2, invert: true }]);
    expect(r.b.usable()).toBe(true);
    // the launcher's and the match's read: the adapter as a standard pad through its layout
    const input = new ControllerInput();
    input.waitForRest = false;
    set(p, { buttons: [2], axes: { 6: HAT[1]!, 2: -0.8 } });
    const v = input.poll({ getGamepads: () => [p] })!;
    expect(v.mapping).toBe('standard');
    expect(v.buttons[0]!.pressed).toBe(true);                    // Cross
    expect(v.buttons[12]!.pressed && v.buttons[15]!.pressed).toBe(true);   // up-right: up and right
    expect(v.axes[3]).toBeCloseTo(0.8);                          // the right stick's down, inverted from axis 2
  });

  // #491's review, 1: the console's own pad reading (`livePad`, the menus' `GamePad`) loads a profile only when the pad
  // changes, so the pass's end must have it read the profile again, as a binding does -- else the taught pad stays
  // unread in the launcher until a reload, and the Options dead zone saved over it writes the profile without the layout.
  it("the launcher's pad reading follows the pass at once, and a dead-zone save after it keeps the layout", () => {
    const p = adapter();
    const pads = [p];
    let t = 10_000;
    const lp = livePad(() => undefined, { source: { getGamepads: () => pads } });
    const remap = liveRemap(window, lp, { pads: { getGamepads: () => pads }, now: () => t });
    const b = remap.open();
    const hold = (o: Parameters<typeof set>[1], ms: number): void => { for (let e = 0; e < ms; e += 16) { set(p, o); b.frame(t += 16); lp.read(); } };
    hold({}, 64);
    expect(lp.connected()).toBe(false);                          // another layout, not taught: not the console's pad
    expect(b.teach()).toBe(true);
    for (const s of TEACH_STEPS) {
      const input = TEACH_INPUT[s.name];
      if (!input) { expect(b.skipStep(), s.name).toBe(true); continue; }
      hold({}, 64);
      hold(input, HOLD_TO_BIND_MS_ADAPTATION + 32);
    }
    hold({}, 64);
    expect(b.usable()).toBe(true);
    expect(lp.connected(), 'read through its layout at once, no reload').toBe(true);
    lp.setDeadZone(0.2);
    expect(profile()!.deadZone).toBe(0.2);
    expect(profile()!.layout, 'the dead zone saved beside the layout, not over it').not.toBeUndefined();
    expect(profile()!.layout!.buttons[0]).toEqual({ button: 2 });
    remap.close();
  });

  it('a required step cannot be skipped; an input already taught is refused, the step kept', () => {
    const r = rig([adapter()]);
    r.rest();
    r.b.teach();
    expect(r.b.skipStep()).toBe(false);
    r.hold({ buttons: [2] }, HOLD_TO_BIND_MS_ADAPTATION + 32);              // Cross
    r.rest();
    r.hold({ buttons: [2] }, HOLD_TO_BIND_MS_ADAPTATION + 32);              // the same button for Circle
    expect(r.events.at(-1)).toMatchObject({ kind: 'refused' });
    expect((r.events.at(-1) as { words: string }).words).toMatch(/already Cross/);
    expect(r.b.teachState()).toMatchObject({ name: 'Circle' });
  });

  // Controller-first: during the pass the raw pad cannot walk the menus, so a step that may be skipped is skipped from
  // the pad itself -- a tap (shorter than the hold) of the button already taught as Circle.
  it('a tap of the taught Circle skips a step that may be skipped; a hold of it is refused as already Circle', () => {
    const r = rig([adapter()]);
    r.rest();
    r.b.teach();
    for (const s of TEACH_STEPS.filter((t) => t.required)) { r.rest(); r.hold(TEACH_INPUT[s.name]!, HOLD_TO_BIND_MS_ADAPTATION + 32); }
    r.rest();
    expect(r.b.teachState()).toMatchObject({ name: 'Square', required: false });
    r.hold(TEACH_INPUT['Circle']!, 200);
    r.rest();
    expect(r.b.teachState()).toMatchObject({ name: 'Triangle' });
    r.hold(TEACH_INPUT['Circle']!, HOLD_TO_BIND_MS_ADAPTATION + 32);
    expect((r.events.at(-1) as { words?: string }).words).toMatch(/already Circle/);
    expect(r.b.teachState()).toMatchObject({ name: 'Triangle' });
  });

  it('a pad that sends nothing: the pass ends "timeout" after TEACH_IDLE_MS_ADAPTATION, saving nothing; cancel saves nothing either', () => {
    const r = rig([adapter()]);
    r.rest();
    r.b.teach();
    r.hold({}, TEACH_IDLE_MS_ADAPTATION + 100);
    expect(r.events.at(-1)).toMatchObject({ kind: 'end', why: 'timeout' });
    expect(r.b.teachState()).toBeNull();
    expect(profile()).toBeNull();
    r.b.teach();
    r.hold({ buttons: [2] }, HOLD_TO_BIND_MS_ADAPTATION + 32);
    r.b.cancel();
    expect(r.events.at(-1)).toMatchObject({ kind: 'end', why: 'cancelled' });
    expect(profile()).toBeNull();
    expect(r.b.usable()).toBe(false);
  });

  // `ControllerInput.poll`'s rule, unchanged: identical pads cannot safely share a profile, so both read the defaults --
  // for a pad of another layout, no layout -- whichever is chosen.
  it('two identical pads keep the ambiguity rule: a saved layout is not applied to either', () => {
    const one = adapter(0);
    const r = rig([one]);
    r.rest();
    r.b.teach();
    for (const s of TEACH_STEPS) {
      const input = TEACH_INPUT[s.name];
      if (!input) { r.b.skipStep(); continue; }
      r.rest();
      r.hold(input, HOLD_TO_BIND_MS_ADAPTATION + 32);
    }
    expect(profile()?.layout).toBeTruthy();
    const two = new PadBinding({ pads: { getGamepads: () => [adapter(0), adapter(1)] }, now: () => 0 });
    two.frame(0);
    expect(two.usable()).toBe(false);
    two.select('1:Twin USB Joystick (Vendor: 0810 Product: 0001)');
    two.frame(16);
    expect(two.usable()).toBe(false);
    expect(r.b.usable()).toBe(true);                             // the one pad alone still reads its layout
  });
});
