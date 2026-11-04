import { describe, expect, it } from 'vitest';
import { noInput, PAD_BUTTON, pressedSince, type Input } from '../src/gamepad';
import type { Stance } from '../src/mover';
import { StanceButton, STANCE_HOLD_S_PLACEHOLDER } from '../src/stanceButton';
import {
  applyPadExtras, EMPTY_PAD_EXTRAS, PAD_EXTRA_ACTIONS, PadExtrasState, parsePadExtras, physicalPressed, sameThumb,
  type PadExtras, type PadExtrasContext,
} from '../src/padExtras';

/**
 * h59U9CLb (a **browser adaptation**, off by default, not wired): double binds and combo binds -- the pure core. The
 * owner's rule: "when combo bound it will do the original action then it will do what you tell it"; the controller's
 * defaults pending Craig (Q1 the same frame, Q2 any modifier keeps its action, Q3 any pair with a same-thumb warning,
 * Q4 targets are actions). The scoping: agent-mail handoffs/2026-11-02/binds-edge-cases-70.md.
 */

const CTX: PadExtrasContext = { overlayButton: 16, heldBinds: [] };
const PADDLE = 18;                                           // a button the game never reads (a back paddle)
/** The physical buttons down, as `pressed` takes them. */
const down = (...buttons: number[]): boolean[] => { const p = Array<boolean>(20).fill(false); for (const b of buttons) p[b] = true; return p; };
const with_ = (flags: Partial<Input>): Input => ({ ...noInput(), ...flags });
const extras = (raw: unknown): PadExtras => parsePadExtras(raw, CTX).extras;

/** Frames of physical states through the extras, each from a base input; the inputs out. */
function drive(x: PadExtras, frames: readonly { pressed: boolean[]; base?: Partial<Input>; menu?: boolean }[], state = new PadExtrasState()): Input[] {
  return frames.map((f) => applyPadExtras(x, with_(f.base ?? {}), f.pressed, state, f.menu ?? false));
}
/** Each frame's rising edges of `flag`. */
const edges = (inputs: readonly Input[], flag: keyof Input): number[] => {
  const out: number[] = [];
  inputs.forEach((after, i) => { const before = i ? inputs[i - 1]! : noInput(); if (pressedSince(before, after).includes(flag as never)) out.push(i); });
  return out;
};

describe('padExtras: empty is identity (nothing stored changes nothing)', () => {
  it('EMPTY and an absent store leave every frame deep-equal to its input, menus or not', () => {
    const none = parsePadExtras(null, CTX).extras;
    expect(none).toEqual(EMPTY_PAD_EXTRAS);
    const state = new PadExtrasState();
    for (const [base, pressed, menu] of [
      [with_({ fire: true, moveX: 0.5, stancePressure: 0.3 }), down(PAD_BUTTON.R1), false],
      [with_({ jump: true, stanceCancelled: true }), down(PAD_BUTTON.Square, PADDLE), false],
      [noInput(), down(), true],
    ] as const) {
      const copy = structuredClone(base);
      expect(applyPadExtras(none, base, pressed, state, menu)).toEqual(copy);
      expect(base).toEqual(copy);                           // never mutated
    }
  });
});

describe('padExtras: the double bind -- the logical OR of held, the same frame', () => {
  const x = extras({ version: 1, doubles: [{ button: PAD_BUTTON.Square, action: 'fire' }] });
  it('the trigger\'s own action and the added one on the same frame; one press is one rising edge of each', () => {
    const frames = [down(), down(PAD_BUTTON.Square), down(PAD_BUTTON.Square), down(PAD_BUTTON.Square), down()]
      .map((p) => ({ pressed: p, base: p[PAD_BUTTON.Square] ? { jump: true } : {} }));
    const out = drive(x, frames);
    expect(edges(out, 'jump')).toEqual([1]);
    expect(edges(out, 'fire')).toEqual([1]);
    expect(out.map((i) => i.fire)).toEqual([false, true, true, true, false]);
  });
  it('no pulse while held: 120 frames held is one edge, held throughout', () => {
    const out = drive(x, [{ pressed: down() }, ...Array.from({ length: 120 }, () => ({ pressed: down(PAD_BUTTON.Square) }))]);
    expect(edges(out, 'fire')).toEqual([1]);
    expect(out.slice(1).every((i) => i.fire)).toBe(true);
  });
  it('an action already held by its own button stays held; the OR never clears one', () => {
    const out = drive(x, [{ pressed: down(), base: { fire: true } }, { pressed: down(PAD_BUTTON.Square), base: { fire: true } }, { pressed: down(), base: { fire: true } }]);
    expect(out.map((i) => i.fire)).toEqual([true, true, true]);
    expect(edges(out, 'fire')).toEqual([0]);
  });
});

describe('padExtras: an added stance is a press, never a hold (the controller\'s default pending Craig, 2026-11-02)', () => {
  // A held trigger is never a held Triangle: the added stance is down on the trigger's press frame alone, so the stance
  // button's machine reads a tap (crouch toggled at its release), never the hold that goes prone.
  const sq = extras({ version: 1, doubles: [{ button: PAD_BUTTON.Square, action: 'stance' }] });
  it('a double bind: stance down on the press frame only, one press per trigger press, none while held', () => {
    const frames = [down(), ...Array.from({ length: 60 }, () => down(PAD_BUTTON.Square)), down(), down(PAD_BUTTON.Square), down()]
      .map((p) => ({ pressed: p, base: p[PAD_BUTTON.Square] ? { jump: true } : {} }));
    const out = drive(sq, frames);
    expect(out.map((i, n) => (i.stance ? n : -1)).filter((n) => n >= 0)).toEqual([1, 62]);
    expect(edges(out, 'stance')).toEqual([1, 62]);
    expect(edges(out, 'jump')).toEqual([1, 62]);
  });
  it('a combo: stance down on the frame the combo comes on, once', () => {
    const x = extras({ version: 1, combos: [{ modifier: PAD_BUTTON.L1, button: PADDLE, action: 'stance' }] });
    const out = drive(x, [down(PAD_BUTTON.L1), down(PAD_BUTTON.L1, PADDLE), down(PAD_BUTTON.L1, PADDLE), down(PAD_BUTTON.L1, PADDLE), down(PAD_BUTTON.L1)].map((p) => ({ pressed: p })));
    expect(out.map((i) => i.stance)).toEqual([false, true, false, false, false]);
  });
  it('a trigger held through a reset or a menu is no stance press after it', () => {
    const state = new PadExtrasState();
    drive(sq, [{ pressed: down() }], state);
    state.reset();
    expect(drive(sq, [{ pressed: down(PAD_BUTTON.Square) }, { pressed: down(PAD_BUTTON.Square) }], state).map((i) => i.stance)).toEqual([false, false]);
    expect(drive(sq, [{ pressed: down(PAD_BUTTON.Square), menu: true }, { pressed: down(PAD_BUTTON.Square) }], new PadExtrasState()).map((i) => i.stance)).toEqual([false, false]);
  });
  it('through the stance button: the trigger held past the hold\'s time gives one crouch, never prone', () => {
    const b = new StanceButton();
    const asks: string[] = [];
    let intent: Stance = 'stand';
    const t = { stanceIntent: (): Stance => intent, setStance: (st: Stance): boolean => { asks.push(st); intent = st; return true; } };
    const FRAME = 1 / 60;
    const held = Math.ceil(STANCE_HOLD_S_PLACEHOLDER / FRAME) * 3;
    const state = new PadExtrasState();
    const frames = [down(), ...Array.from({ length: held }, () => down(PAD_BUTTON.Square)), down(), down()];
    for (const pressed of frames) {
      const i = applyPadExtras(sq, with_({ jump: !!pressed[PAD_BUTTON.Square] }), pressed, state, false);
      b.lanes('pop', { triangle: i.stance }, FRAME, t);
    }
    expect(asks).toEqual(['crouch']);
  });
});

describe('padExtras: the combo -- M down before B, released M ends it', () => {
  const x = extras({ version: 1, combos: [{ modifier: PAD_BUTTON.L2, button: PAD_BUTTON.R3, action: 'fireMode' }] });
  it('M then B: the action while both are held, from B\'s press; the modifier keeps its own action (Q2)', () => {
    const frames = [down(PAD_BUTTON.L2), down(PAD_BUTTON.L2, PAD_BUTTON.R3), down(PAD_BUTTON.L2, PAD_BUTTON.R3), down(PAD_BUTTON.L2)]
      .map((p) => ({ pressed: p, base: { swap2: true, reload: !!p[PAD_BUTTON.R3] } }));
    const out = drive(x, frames);
    expect(out.map((i) => i.fireMode)).toEqual([false, true, true, false]);
    expect(out.every((i) => i.swap2)).toBe(true);
    expect(out.map((i) => i.reload)).toEqual([false, true, true, false]);
  });
  it('B then M, and M and B on one frame: never', () => {
    const late = drive(x, [down(PAD_BUTTON.R3), down(PAD_BUTTON.R3, PAD_BUTTON.L2), down(PAD_BUTTON.R3, PAD_BUTTON.L2)].map((p) => ({ pressed: p })));
    expect(late.map((i) => i.fireMode)).toEqual([false, false, false]);
    const same = drive(x, [down(), down(PAD_BUTTON.R3, PAD_BUTTON.L2), down(PAD_BUTTON.R3, PAD_BUTTON.L2)].map((p) => ({ pressed: p })));
    expect(same.map((i) => i.fireMode)).toEqual([false, false, false]);
  });
  it('releasing M ends it, and pressing M again while B is held does not bring it back', () => {
    const out = drive(x, [
      down(PAD_BUTTON.L2), down(PAD_BUTTON.L2, PAD_BUTTON.R3), down(PAD_BUTTON.R3), down(PAD_BUTTON.L2, PAD_BUTTON.R3), down(PAD_BUTTON.L2),
      down(PAD_BUTTON.L2, PAD_BUTTON.R3),
    ].map((p) => ({ pressed: p })));
    expect(out.map((i) => i.fireMode)).toEqual([false, true, false, false, false, true]);
  });
});

describe('padExtras: a menu over the game', () => {
  it('menu frames come back untouched (the same object), and a press made under the menu is no combo after it', () => {
    const x = extras({ version: 1, doubles: [{ button: PADDLE, action: 'fire' }], combos: [{ modifier: PAD_BUTTON.L1, button: PADDLE, action: 'reload' }] });
    const state = new PadExtrasState();
    const base = noInput();
    expect(applyPadExtras(x, base, down(PADDLE), state, true)).toBe(base);
    const out = drive(x, [
      { pressed: down(PAD_BUTTON.L1), menu: true }, { pressed: down(PAD_BUTTON.L1, PADDLE), menu: true }, { pressed: down(PAD_BUTTON.L1, PADDLE) },
    ], state);
    expect(out.map((i) => i.fire)).toEqual([false, false, true]);
    expect(out.map((i) => i.reload)).toEqual([false, false, false]);
  });
});

describe('padExtras: parse and validate, version 1 -- a bad entry drops alone', () => {
  it('the play set: no fly camera, no menu buttons\' actions, no TeamCommand', () => {
    expect([...PAD_EXTRA_ACTIONS].sort()).toEqual(['crouch', 'fire', 'fireMode', 'inventory', 'jump', 'prone', 'reload', 'scoreboard', 'stance', 'swap1', 'swap2'].sort());
    for (const action of ['boost', 'mode', 'action', 'zoom', 'zoomOut', 'leanLeft', 'leanRight', 'TeamCommand', 'move', 'look', 'stancePressure', 'constructor']) {
      const r = parsePadExtras({ version: 1, doubles: [{ button: PADDLE, action }] }, CTX);
      expect(r.extras.doubles, action).toEqual([]);
      expect(r.dropped.map((d) => d.reason), action).toEqual(['action']);
    }
  });
  it('each bad entry is dropped with its reason, the good ones kept in order', () => {
    const r = parsePadExtras(JSON.stringify({
      version: 1,
      doubles: [
        { button: PADDLE, action: 'fire' }, { button: 16, action: 'jump' }, { button: -1, action: 'jump' }, { button: 1.5, action: 'jump' },
        { button: 32, action: 'jump' }, 'junk', { button: 19, action: 'reload' },
      ],
      combos: [
        { modifier: 4, button: 4, action: 'reload' }, { modifier: 16, button: 5, action: 'reload' }, { modifier: 4, button: 16, action: 'reload' },
        { modifier: 17, button: 5, action: 'reload' }, { modifier: 6, button: 11, action: 'boost' }, { modifier: 6, button: 11, action: 'fireMode' },
      ],
    }), { overlayButton: 16, heldBinds: [17] });
    expect(r.extras.doubles).toEqual([{ button: PADDLE, action: 'fire' }, { button: 19, action: 'reload' }]);
    expect(r.extras.combos).toEqual([{ modifier: 6, button: 11, action: 'fireMode' }]);
    expect(r.dropped.map((d) => d.reason)).toEqual(['overlay', 'button', 'button', 'button', 'shape', 'self', 'overlay', 'overlay', 'held-bind', 'action']);
  });
  it('the whole store refused only where it is not version 1 or not an object; non-array lists are empty', () => {
    for (const raw of ['{', '[]', '7', JSON.stringify({ version: 2, doubles: [{ button: PADDLE, action: 'fire' }] }), JSON.stringify({ doubles: [] })]) {
      const r = parsePadExtras(raw, CTX);
      expect(r.extras, raw).toEqual(EMPTY_PAD_EXTRAS);
      expect(r.dropped.map((d) => d.reason), raw).toEqual(['version']);
    }
    expect(parsePadExtras({ version: 1, doubles: 'x', combos: null }, CTX)).toEqual({ extras: EMPTY_PAD_EXTRAS, dropped: [] });
  });
  it('the overlay\'s own button follows the context: a rebound overlay frees 16 and refuses its new button', () => {
    const r = parsePadExtras({ version: 1, doubles: [{ button: 16, action: 'fire' }, { button: 17, action: 'fire' }] }, { overlayButton: 17, heldBinds: [] });
    expect(r.extras.doubles).toEqual([{ button: 16, action: 'fire' }]);
    expect(r.dropped.map((d) => d.reason)).toEqual(['overlay']);
  });
});

describe('padExtras: the same-thumb warning (Q3: allowed, flagged as data)', () => {
  it('R3 + a face button and L3 + the d-pad are flagged, kept; two thumbs and the shoulders are not', () => {
    expect(sameThumb(PAD_BUTTON.R3, PAD_BUTTON.Cross)).toBe(true);
    expect(sameThumb(PAD_BUTTON.L3, PAD_BUTTON.Up)).toBe(true);
    expect(sameThumb(PAD_BUTTON.L3, PAD_BUTTON.Triangle)).toBe(false);
    expect(sameThumb(PAD_BUTTON.L2, PAD_BUTTON.R3)).toBe(false);
    const r = parsePadExtras({ version: 1, combos: [
      { modifier: PAD_BUTTON.R3, button: PAD_BUTTON.Square, action: 'fire' }, { modifier: PAD_BUTTON.L1, button: PAD_BUTTON.Square, action: 'fire' },
    ] }, CTX);
    expect(r.extras.combos).toEqual([
      { modifier: PAD_BUTTON.R3, button: PAD_BUTTON.Square, action: 'fire', warning: 'same-thumb' },
      { modifier: PAD_BUTTON.L1, button: PAD_BUTTON.Square, action: 'fire' },
    ]);
    expect(r.dropped).toEqual([]);
  });
});

describe('padExtras: reset (flush, blur, pad change) -- no stuck modifier', () => {
  it('after reset a held B is no fresh press: the combo waits for B to be let go and pressed again', () => {
    const x = extras({ version: 1, combos: [{ modifier: PAD_BUTTON.L1, button: PADDLE, action: 'reload' }] });
    const state = new PadExtrasState();
    const a = drive(x, [{ pressed: down(PAD_BUTTON.L1) }, { pressed: down(PAD_BUTTON.L1, PADDLE) }], state);
    expect(a.map((i) => i.reload)).toEqual([false, true]);
    state.reset();
    const b = drive(x, [{ pressed: down(PAD_BUTTON.L1, PADDLE) }, { pressed: down(PAD_BUTTON.L1, PADDLE) }, { pressed: down(PAD_BUTTON.L1) }, { pressed: down(PAD_BUTTON.L1, PADDLE) }], state);
    expect(b.map((i) => i.reload)).toEqual([false, false, false, true]);
  });
});

describe('padExtras: physicalPressed', () => {
  it('reads a pad\'s buttons as the reader does (pressed, or a value of .5 and over)', () => {
    expect(physicalPressed([{ pressed: true, value: 0 }, { pressed: false, value: 0.5 }, { pressed: false, value: 0.49 }])).toEqual([true, true, false]);
  });
});
