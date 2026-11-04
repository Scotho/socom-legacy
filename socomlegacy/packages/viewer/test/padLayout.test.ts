import { describe, expect, it } from 'vitest';
import {
  HOLD_TO_BIND_MS_ADAPTATION, STANDARD_BUTTON_COUNT, TEACH_STEPS, detectAxis, detectSource, hatIndex, parseLayout, sourcePressed, standardView,
  type PadLayout,
} from '../src/padLayout';

/**
 * LATER 380 (the owner's word, 2026-10-23; product track, a browser adaptation): a pad whose `mapping` is not `standard`
 * -- a PS2 pad on a USB adapter, some pads on Firefox -- taught by press and read through its saved layout as a standard
 * pad. `../src/padLayout`'s pure rules: what counts as a press of a raw button, a trigger axis or a hat-switch d-pad; the
 * one input moved from rest; the standard view the launcher and the match read; the hold that takes a binding.
 */
const btn = (down = false) => ({ pressed: down, value: down ? 1 : 0 });
const raw = (o: { buttons?: boolean[]; axes?: number[] } = {}) => ({
  index: 0, id: 'USB Gamepad (Vendor: 0810 Product: 0001)', connected: true, mapping: '',
  buttons: (o.buttons ?? Array.from({ length: 12 }, () => false)).map(btn), axes: o.axes ?? [0, 0, 0, 0, 0, 0, 3.2857, 0],
});
const HAT = { up: -1, upRight: -1 + 2 / 7, right: -1 + 4 / 7, down: -1 + 8 / 7, left: -1 + 12 / 7, upLeft: 1, rest: 3.2857 };

describe('padLayout: the press of a raw input', () => {
  it('a raw button, an axis past halfway from its rest toward its pressed value, a hat within one step of its direction', () => {
    const p = raw({ buttons: [false, true], axes: [0, 0, 0, 0, -1, 0.2, HAT.upRight, 0] });
    expect(sourcePressed({ button: 1 }, p)).toBe(true);
    expect(sourcePressed({ button: 0 }, p)).toBe(false);
    expect(sourcePressed({ button: 40 }, p)).toBe(false);                                  // absent: not pressed
    expect(sourcePressed({ axis: 4, from: 1, to: -1 }, p)).toBe(true);                       // a trigger axis, fully in
    expect(sourcePressed({ axis: 5, from: -1, to: 1 }, p)).toBe(true);                       // 0.2 is past halfway from -1
    expect(sourcePressed({ axis: 5, from: 0, to: 1 }, p)).toBe(false);                       // 0.2 is not past halfway from 0
    expect(sourcePressed({ axis: 6, to: HAT.up, hat: true }, p)).toBe(true);                 // up-right lights up ...
    expect(sourcePressed({ axis: 6, to: HAT.right, hat: true }, p)).toBe(true);              // ... and right
    expect(sourcePressed({ axis: 6, to: HAT.down, hat: true }, p)).toBe(false);
    expect(sourcePressed({ axis: 6, to: HAT.up, hat: true }, raw({ axes: [0, 0, 0, 0, 0, 0, HAT.upLeft, 0] }))).toBe(true);   // the wrap
    expect(sourcePressed({ axis: 6, to: HAT.up, hat: true }, raw())).toBe(false);            // the hat at rest
  });

  it('a hat axis reads one of eight directions, and nothing at rest', () => {
    expect([HAT.up, HAT.upRight, HAT.right, HAT.down, HAT.left, HAT.upLeft].map(hatIndex)).toEqual([0, 1, 2, 4, 6, 7]);
    expect(hatIndex(HAT.rest)).toBe(-1);
    expect(hatIndex(0.05)).toBe(-1);                                                         // between directions: none
  });
});

describe('padLayout: the one input moved from rest', () => {
  const rest = raw();
  it('a button, a hat direction, a trigger axis; none, or two at once, is no input', () => {
    expect(detectSource(raw({ buttons: [false, false, true] }), rest)).toEqual({ button: 2 });
    expect(detectSource(raw({ axes: [0, 0, 0, 0, 0, 0, HAT.left, 0] }), rest)).toEqual({ axis: 6, to: HAT.left, hat: true });
    expect(detectSource(raw({ axes: [0, 0, 0, 0, 0, 0.9, HAT.rest, 0] }), rest)).toEqual({ axis: 5, from: 0, to: 1 });
    expect(detectSource(rest, rest)).toBeNull();
    expect(detectSource(raw({ buttons: [true, true] }), rest)).toBeNull();
    expect(detectSource(raw({ buttons: [true], axes: [0, 0, 0, 0, 0, 0, HAT.up, 0] }), rest)).toBeNull();
  });

  it('a stick: the axis moved furthest past halfway, inverted when it moved negative', () => {
    expect(detectAxis(raw({ axes: [0.9, 0.1, 0, 0, 0, 0, HAT.rest, 0] }), rest)).toEqual({ axis: 0, invert: false });
    expect(detectAxis(raw({ axes: [0, 0, 0.1, -0.8, 0, 0, HAT.rest, 0] }), rest)).toEqual({ axis: 3, invert: true });
    expect(detectAxis(raw({ axes: [0.3, 0, 0, 0, 0, 0, HAT.rest, 0] }), rest)).toBeNull();      // not past halfway
    expect(detectAxis(raw({ axes: [0, 0, 0, 0, 0, 0, HAT.up, 0] }), rest)).toBeNull();          // a hat is never a stick
  });
});

describe('padLayout: the standard view', () => {
  const layout: PadLayout = {
    version: 1,
    buttons: [{ button: 2 }, { button: 1 }, null, null, null, null, { axis: 4, from: -1, to: 1 }, null, null, { button: 9 },
      null, null, { axis: 6, to: HAT.up, hat: true }, { axis: 6, to: HAT.down, hat: true }, { axis: 6, to: HAT.left, hat: true },
      { axis: 6, to: HAT.right, hat: true }, null],
    axes: [{ axis: 0, invert: false }, { axis: 1, invert: false }, { axis: 2, invert: false }, { axis: 3, invert: true }],
  };
  it('reads the raw pad as a standard one: seventeen buttons, four axes, the trigger as a value, the hat as the d-pad', () => {
    const v = standardView(raw({ buttons: [false, false, true], axes: [0.5, -0.25, 0, 0.75, 1, 0, HAT.upRight, 0] }), layout);
    expect(v.mapping).toBe('standard');
    expect(v.buttons).toHaveLength(STANDARD_BUTTON_COUNT);
    expect(v.buttons.map((b) => b.pressed)).toEqual([true, false, false, false, false, false, true, false, false, false, false, false, true, false, false, true, false]);
    expect(v.buttons[6]!.value).toBe(1);
    expect(v.axes).toEqual([0.5, -0.25, 0, -0.75]);
    expect(v.id).toContain('USB Gamepad');
  });

  it('parses a saved layout, and refuses one that is not', () => {
    expect(parseLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout({ ...layout, version: 2 })).toBeNull();
    expect(parseLayout({ ...layout, buttons: layout.buttons.slice(1) })).toBeNull();
    expect(parseLayout({ ...layout, buttons: [{ button: -1 }, ...layout.buttons.slice(1)] })).toBeNull();
    expect(parseLayout({ ...layout, axes: [{ axis: 'x', invert: false }, ...layout.axes.slice(1)] })).toBeNull();
  });
});

describe('padLayout: the pass and the hold', () => {
  it('a hold of 800 ms takes a binding (the reading of the owner\'s "hold button style"; 0.6-1 s asked)', () => {
    expect(HOLD_TO_BIND_MS_ADAPTATION).toBe(800);
  });

  it('the pass asks the menus\' buttons first, then the d-pad and both sticks, all required; the rest may be skipped', () => {
    const required = TEACH_STEPS.filter((s) => s.required).map((s) => s.name);
    expect(required).toEqual(['Cross', 'Circle', 'START', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right',
      'Left stick right', 'Left stick down', 'Right stick right', 'Right stick down']);
    expect(TEACH_STEPS.slice(0, required.length).every((s) => s.required)).toBe(true);
    expect(TEACH_STEPS.filter((s) => !s.required).map((s) => s.name)).toEqual(['Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'SELECT', 'L3', 'R3']);
    expect(TEACH_STEPS.filter((s) => s.kind === 'axis').map((s) => s.target)).toEqual([0, 1, 2, 3]);
    expect(new Set(TEACH_STEPS.filter((s) => s.kind === 'button').map((s) => s.target)).size).toBe(16);
  });
});
