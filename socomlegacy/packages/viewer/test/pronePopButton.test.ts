import { describe, expect, it } from 'vitest';
import type { Stance } from '../src/mover';
import {
  KEY_STANCE, PRONE_POP_ADAPTATION, StanceButton, STANCE_HOLD_S_PLACEHOLDER, TRIANGLE_SQUARE_POP_ADAPTATION, type StanceAct,
  type StanceMode, type StanceTarget,
} from '../src/stanceButton';

/**
 * OT.R67 (`PRONE_POP_ADAPTATION`; no original -- the owner's word, MISSION OT.R67): the stance button's machine in its
 * two modes (`StanceButton.lanes`), on a target that records what it is asked. Ported from Benny's playtest
 * (`playtests/prone-pop/cancel.test.ts`, `dive.test.ts`, `input.test.ts`, retired with OT.R67): the cases about the
 * press itself -- its edge, its hold, a menu, a reset -- each named by its old title beside it. What the mover does with
 * the asks is `pronePop.test.ts`'s and `pronePopWalk.test.ts`'s.
 */

const FRAME = 1 / 60;

/**
 * A target: the request (PAR-19's `stanceIntent`) and the asks made -- OT.R76's window seams too: `pronePress` (counted in
 * `armed`, then the ordinary prone) and `disarmPop` (counted in `disarms`).
 */
function target(o: { intent?: Stance } = {}) {
  const calls: string[] = [];
  const t = {
    intent: o.intent ?? ('stand' as Stance),
    armed: 0,
    disarms: 0,
    stanceIntent: (): Stance => t.intent,
    setStance: (s: Stance): boolean => { calls.push(`stance:${s}`); t.intent = s; return true; },
    pronePress: (): boolean => { t.armed++; return t.setStance('prone'); },
    disarmPop: (): void => { t.disarms++; },
  };
  return { t, calls };
}

/** `n` frames of the stance button `down` in `mode`; what each did. */
function run(b: StanceButton, t: StanceTarget, down: boolean, n = 1, mode: StanceMode = 'pop'): StanceAct[] {
  return Array.from({ length: n }, () => b.lanes(mode, { triangle: down }, FRAME, t));
}

/** The frames of a press, its own (which counts nothing, as `update`) the first, up to the one its hold of `seconds` acts on. */
const heldFrames = (seconds: number): number => {
  let held = 0, n = 1;
  while (held < seconds) { held += FRAME; n++; }
  return n;
};

describe('OT.R67: the prone-pop is the default stance mode', () => {
  it('PRONE_POP_ADAPTATION names the mode a browser starts in', () => {
    expect(PRONE_POP_ADAPTATION).toBe('pop');
  });
});

describe('OT.R76: the stance mode \'pop\' (StanceButton.lanes): the original\'s tap and hold, and the pop window\'s two seams', () => {
  it('TRIANGLE_SQUARE_POP_ADAPTATION names the sequence the mode runs', () => {
    expect(TRIANGLE_SQUARE_POP_ADAPTATION).toContain('jump press');
  });

  it('still: a tap toggles stand and crouch at the release, from the request it began on (PAR-19)', () => {
    for (const [from, to] of [['stand', 'crouch'], ['crouch', 'stand']] as const) {
      const b = new StanceButton(), { t, calls } = target({ intent: from });
      expect(run(b, t, true, 6)).toEqual(Array(6).fill('none'));
      expect(run(b, t, false)).toEqual(['stance']);
      expect(calls).toEqual([`stance:${to}`]);
      expect(t.armed).toBe(0);                                     // a crouch opens no window
    }
  });

  // H338 (the owner, 2026-10-26: follow the original): in 'separate' the stance button's tap from prone crouches --
  // `FUN_00594cf0` D:L453358-453371: with a crouch allowed (`FUN_005857e0`) request 2 to 1; where none is, to 0 (LATER 492).
  it("H338: in 'separate' a tap from prone crouches (FUN_00594cf0 D:L453370-453371), stand and crouch still toggle (was: stood)", () => {
    for (const [from, to] of [['prone', 'crouch'], ['stand', 'crouch'], ['crouch', 'stand']] as const) {
      const b = new StanceButton(), { t, calls } = target({ intent: from });
      run(b, t, true, 6, 'separate');
      expect(run(b, t, false, 1, 'separate')).toEqual(['stance']);
      expect(calls, from).toEqual([`stance:${to}`]);
    }
  });

  // C2: "holding one press never creates the second edge"
  it('still: a hold goes prone at the threshold, once, through pronePress (the window\'s seam); held on, nothing more', () => {
    const b = new StanceButton(), { t, calls } = target({ intent: 'crouch' });
    const acts = run(b, t, true, 90);
    expect(acts.filter((a) => a !== 'none')).toEqual(['stance']);
    expect(acts.indexOf('stance')).toBe(heldFrames(STANCE_HOLD_S_PLACEHOLDER) - 1);
    expect(run(b, t, false)).toEqual(['none']);
    expect(calls).toEqual(['stance:prone']);
    expect(t.armed).toBe(1);
  });

  // STM.R2a (the owner, 2026-10-30: "Separate should function EXACTLY as the original"): SEPARATE has no pop window. The
  // history: these were the pins before STM-2; its first build (0289fb957, 7c237f64c) turned them round to carry the window
  // into SEPARATE (STM.R2 read the other way); STM.R2a restores them.
  it('STM.R2a: \'separate\' asks the same prone by setStance alone: no window', () => {
    const b = new StanceButton(), { t, calls } = target({ intent: 'stand' });
    run(b, t, true, 90, 'separate');
    expect(calls).toEqual(['stance:prone']);
    expect(t.armed).toBe(0);
  });

  it('a fresh stance press closes the window, at its edge, once; \'separate\' never touches it (STM.R2a)', () => {
    const b = new StanceButton(), { t } = target({ intent: 'stand' });
    run(b, t, true, 20);
    expect(t.disarms).toBe(1);
    run(b, t, false);
    run(b, t, true);
    expect(t.disarms).toBe(2);
    const s = new StanceButton(), other = target({ intent: 'stand' });
    run(s, other.t, true, 3, 'separate');
    expect(other.t.disarms).toBe(0);
  });

  it('STM.R2a: in \'separate\' a Prone bind\'s edge asks setStance alone (prone from stand or crouch, then up): no window', () => {
    for (const from of ['stand', 'crouch'] as const) {
      const b = new StanceButton(), { t, calls } = target({ intent: from });
      expect(b.lanes('separate', { triangle: false, prone: true }, FRAME, t)).toBe('stance');
      expect(calls, from).toEqual(['stance:prone']);
      expect(t.armed, from).toBe(0);
      b.lanes('separate', { triangle: false }, FRAME, t);
      b.lanes('separate', { triangle: false, prone: true }, FRAME, t);   // from prone: up, the ordinary stand
      expect(calls, from).toEqual(['stance:prone', 'stance:stand']);
      expect(t.armed, from).toBe(0);
    }
  });

  it('STM.R2a: in \'separate\' the Crouch bind asks setStance alone (a crouch opens no window)', () => {
    const b = new StanceButton(), { t, calls } = target({ intent: 'stand' });
    b.lanes('separate', { triangle: false, crouch: true }, FRAME, t);
    b.lanes('separate', { triangle: false, crouch: false }, FRAME, t);
    expect(calls).toEqual(['stance:crouch']);
    expect(t.armed).toBe(0);
  });

  it('from prone, a press is the original\'s (PAD_STANCE: a tap stands, through setStance) -- never a pop (the double tap retired)', () => {
    const b = new StanceButton(), { t, calls } = target({ intent: 'prone' });
    run(b, t, true, 3);
    run(b, t, false);
    expect(calls).toEqual(['stance:stand']);
    expect(t.armed).toBe(0);
  });

  // I6: "a menu consumes a pending tap" -- the pages' `stanceButton.reset()` at a menu's open (main.ts, matchMount.ts)
  it('a reset under a press: its release is no tap', () => {
    const { t, calls } = target({ intent: 'stand' });
    const b = new StanceButton();
    run(b, t, true, 3);
    b.reset();
    run(b, t, false);
    expect(calls).toEqual([]);
  });

  // C14 + I7: "setup reset consumes an already-held button until release", "a held reset is consumed through release"
  it('a reset with the button held spends it until let go; the next press acts', () => {
    const { t, calls } = target({ intent: 'crouch' });
    const b = new StanceButton();
    b.reset(true);
    expect(run(b, t, true, 36).every((a) => a === 'none')).toBe(true);
    run(b, t, false);
    expect(calls).toEqual([]);
    run(b, t, true, heldFrames(STANCE_HOLD_S_PLACEHOLDER));
    expect(calls).toEqual(['stance:prone']);
  });

  it('a target without the window\'s seams (a test\'s walk) runs the original\'s machine', () => {
    const calls: string[] = [];
    const bare: StanceTarget = { stanceIntent: () => 'prone', setStance: (s) => { calls.push(s); return true; } };
    const b = new StanceButton();
    run(b, bare, true, 3);
    run(b, bare, false);
    expect(calls).toEqual(['stand']);                             // PAD_STANCE's tap from prone
  });
});

// PP-5 (the merge controller's call, 2026-10-20; the gameplay seat's conditions): a bound Prone is the full press in both
// modes -- in 'pop' too, beside the stance button's machine, which it never drives.
describe('PP-5: a bound Prone in the prone-pop mode', () => {
  const pop = (b: StanceButton, t: StanceTarget, l: { triangle?: boolean; prone?: boolean }): StanceAct =>
    b.lanes('pop', { triangle: l.triangle ?? false, ...l }, FRAME, t);

  it('(a) a Prone edge is stanceOnHold of the request: prone from stand or crouch, up from prone; the pop never asked', () => {
    for (const [from, to] of [['stand', 'prone'], ['crouch', 'prone'], ['prone', 'stand']] as const) {
      const b = new StanceButton(), { t, calls } = target({ intent: from });
      expect(pop(b, t, { prone: true })).toBe('stance');
      expect(calls).toEqual([`stance:${to}`]);
    }
  });

  it('(b) OT.R76: in \'pop\' a Prone edge\'s prone goes through pronePress (the sequence follows the binds); its stand never does', () => {
    const b = new StanceButton(), { t, calls } = target({ intent: 'stand' });
    pop(b, t, { prone: true });
    expect(calls).toEqual(['stance:prone']);
    expect(t.armed).toBe(1);
    pop(b, t, {});
    pop(b, t, { prone: true });                                    // from prone: up, the ordinary stand
    expect(calls).toEqual(['stance:prone', 'stance:stand']);
    expect(t.armed).toBe(1);
  });

  it('(d) a Prone held with no new edge does nothing on the frames after', () => {
    const b = new StanceButton(), { t, calls } = target({ intent: 'stand' });
    for (let i = 0; i < 30; i++) pop(b, t, { prone: true });
    expect(calls).toEqual(['stance:prone']);
  });

  // The gameplay seat's note 1: the Options roller makes a mode change easy mid-match; a Prone held across it is no press.
  it('held across a change of mode, a Prone does not act; let go and pressed again, it does', () => {
    const b = new StanceButton(), { t, calls } = target({ intent: 'stand' });
    pop(b, t, { prone: true });
    b.lanes('separate', { triangle: false, prone: true }, FRAME, t);
    b.lanes('separate', { triangle: false, prone: true }, FRAME, t);
    expect(calls).toEqual(['stance:prone']);
    b.lanes('separate', { triangle: false }, FRAME, t);
    b.lanes('separate', { triangle: false, prone: true }, FRAME, t);
    expect(calls).toEqual(['stance:prone', 'stance:stand']);
  });

  // The batch review's F5: "a bound Prone works in both modes" holds on a target without the pop's hooks too.
  it('in \'pop\' on a target without the pop\'s hooks, a Prone edge is still the full press', () => {
    const calls: string[] = [];
    let intent: 'stand' | 'crouch' | 'prone' = 'stand';
    const t: StanceTarget = { stanceIntent: () => intent, setStance: (s) => { calls.push(`stance:${s}`); intent = s as typeof intent; return true; } };
    const b = new StanceButton();
    expect(b.lanes('pop', { triangle: false, prone: true }, FRAME, t)).toBe('stance');
    expect(calls).toEqual(['stance:prone']);
  });
});

describe('OT.R67: the fallback (mode separate): the original\'s stance button, and Crouch and Prone binds', () => {
  const lanes = (b: StanceButton, t: StanceTarget, l: { triangle?: boolean; crouch?: boolean; prone?: boolean }): StanceAct =>
    b.lanes('separate', { triangle: l.triangle ?? false, ...l }, FRAME, t);

  it("the stance button takes the original's tap (H338: a tap from prone crouches; was PAD_STANCE's stand), the pop never asked", () => {
    const { t, calls } = target({ intent: 'prone' });
    const b = new StanceButton();
    for (let i = 0; i < 3; i++) lanes(b, t, { triangle: true });
    lanes(b, t, { triangle: false });
    expect(calls).toEqual(['stance:crouch']);
  });

  it('the keyboard\'s C keeps KEY_STANCE (a tap from prone crouches)', () => {
    const { t, calls } = target({ intent: 'prone' });
    const b = new StanceButton(STANCE_HOLD_S_PLACEHOLDER, KEY_STANCE);
    for (let i = 0; i < 3; i++) lanes(b, t, { triangle: true });
    lanes(b, t, { triangle: false });
    expect(calls).toEqual(['stance:crouch']);
  });

  it('Prone: the full press at once (FUN_00594cf0 D:L453377-453425): prone, and up from prone', () => {
    const { t, calls } = target({ intent: 'crouch' });
    const b = new StanceButton();
    expect(lanes(b, t, { prone: true })).toBe('stance');
    expect(lanes(b, t, { prone: true })).toBe('none');
    lanes(b, t, {});
    lanes(b, t, { prone: true });
    expect(calls).toEqual(['stance:prone', 'stance:stand']);
  });

  it('Crouch: the light press at its release (D:L453355-453376): stand and crouch toggle, prone to crouch', () => {
    for (const [from, to] of [['stand', 'crouch'], ['crouch', 'stand'], ['prone', 'crouch']] as const) {
      const { t, calls } = target({ intent: from });
      const b = new StanceButton();
      expect(lanes(b, t, { crouch: true })).toBe('none');
      expect(lanes(b, t, { crouch: false })).toBe('stance');
      expect(calls).toEqual([`stance:${to}`]);
    }
  });

  it('unbound (absent), Crouch and Prone ask nothing', () => {
    const { t, calls } = target();
    const b = new StanceButton();
    for (let i = 0; i < 10; i++) b.lanes('separate', { triangle: false }, FRAME, t);
    expect(calls).toEqual([]);
  });

  it('a change of mode under a press forgets it: no tap at its release', () => {
    const { t, calls } = target({ intent: 'stand' });
    const b = new StanceButton();
    run(b, t, true, 3, 'pop');
    run(b, t, false, 1, 'separate');
    expect(calls).toEqual([]);
  });
});
