import { describe, expect, it } from 'vitest';
import {
  crossHoldsIn, ForgePad, MenuStick, PAD_HOLD_MS, PAD_MENU_STICK_PUSH_ADAPTATION, PAD_MENU_STICK_REST_ADAPTATION, PAD_REPEAT_DELAY_MS,
  PAD_REPEAT_EVERY_MS, type PadSnapshot,
} from '../../src/forge/pad';

/** FORGE (FG-12, FG.R9: "Ship in release, + controller"): the forge's controller scheme, from the pad's standard mapping. */
const pad = (down: number[] = [], axes: number[] = [0, 0, 0, 0], analog: Record<number, number> = {}): PadSnapshot => ({
  buttons: Array.from({ length: 17 }, (_, i) => {
    const value = analog[i] ?? (down.includes(i) ? 1 : 0);
    return { pressed: value >= 0.5, value };
  }),
  axes,
});
const CROSS = 0, CIRCLE = 1, SQUARE = 2, TRIANGLE = 3, L1 = 4, R1 = 5, L2 = 6, R2 = 7, SELECT = 8, START = 9, L3 = 10, R3 = 11, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

describe('FORGE: the controller scheme', () => {
  // OT.R112 (the Forge's UI is its contributor's): the owner's remap (06d558635, `../../src/forge/pad.ts`'s header) --
  // SELECT is undo at a tap's release and redo held past PAD_HOLD_MS, L3 snaps, R3 frames the selection.
  it('fires each button once at its press: the tools, the edits, snap, frame, the menu; SELECT not at its press', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    const names = [CROSS, SQUARE, TRIANGLE, L1, R1, SELECT, L3, R3, START].map((b, i) => {
      const t = 100 + i * 100;
      const a = p.frame(pad([b]), t).actions;
      expect(p.frame(pad([b]), t + 16).actions).toEqual([]);              // held: once
      p.frame(pad(), t + 32);
      return a;
    });
    expect(names).toEqual([['act'], ['duplicate'], ['delete'], ['prevTool'], ['nextTool'], [], ['snap'], ['frame'], ['menu']]);
  });

  it('SELECT: a tap undoes at its release; held past PAD_HOLD_MS it redoes once, its release then nothing (OT.R112)', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    expect(p.frame(pad([SELECT]), 100).actions).toEqual([]);
    expect(p.frame(pad(), 116).actions).toEqual(['undo']);
    expect(p.frame(pad([SELECT]), 200).actions).toEqual([]);
    expect(p.frame(pad([SELECT]), 200 + PAD_HOLD_MS - 1).actions).toEqual([]);
    expect(p.frame(pad([SELECT]), 200 + PAD_HOLD_MS).actions).toEqual(['redo']);
    expect(p.frame(pad([SELECT]), 200 + PAD_HOLD_MS + 100).actions).toEqual([]);
    expect(p.frame(pad(), 200 + PAD_HOLD_MS + 200).actions).toEqual([]);
  });

  it('FG-47: in the build (the page sets crossHolds), a Cross tap acts at its release; Cross held past the tap picks once, its release acts not', () => {
    const p = new ForgePad();
    p.crossHolds = true;
    p.frame(pad(), 0);
    expect(p.frame(pad([CROSS]), 100).actions).toEqual([]);              // pressed: not yet a tap or a hold
    expect(p.frame(pad([CROSS]), 116).actions).toEqual([]);
    expect(p.frame(pad(), 132).actions).toEqual(['act']);                // let go within the tap: the act, as before
    expect(p.frame(pad(), 148).actions).toEqual([]);
    expect(p.frame(pad([CROSS]), 200).actions).toEqual([]);
    expect(p.frame(pad([CROSS]), 200 + PAD_HOLD_MS - 1).actions).toEqual([]);
    expect(p.frame(pad([CROSS]), 200 + PAD_HOLD_MS).actions).toEqual(['pick']);   // held past the tap: the pick, at once
    expect(p.frame(pad([CROSS]), 200 + PAD_HOLD_MS + 100).actions).toEqual([]);   // once per hold
    expect(p.frame(pad(), 200 + PAD_HOLD_MS + 200).actions).toEqual([]);          // its release: no act
    expect(p.frame(pad([CROSS]), 1000).actions).toEqual([]);
    expect(p.frame(pad(), 1016).actions).toEqual(['act']);               // the next tap acts again
  });

  it('FG-47: with the tap-or-hold off (the default; the walk, a card, the menu), Cross acts at its press as before', () => {
    const p = new ForgePad();
    expect(p.crossHolds).toBe(false);
    p.frame(pad(), 0);
    expect(p.frame(pad([CROSS]), 100).actions).toEqual(['act']);
    expect(p.frame(pad([CROSS]), 100 + PAD_HOLD_MS * 2).actions).toEqual([]);     // held: once, no pick
    expect(p.frame(pad(), 100 + PAD_HOLD_MS * 3).actions).toEqual([]);
    // Off between a press and its release (Play started meanwhile): the release acts not.
    p.crossHolds = true;
    p.frame(pad([CROSS]), 2000);
    p.crossHolds = false;
    expect(p.frame(pad(), 2016).actions).toEqual([]);
  });

  it('ignores what was held when the pad was first seen, until it is let go', () => {
    const p = new ForgePad();
    expect(p.frame(pad([CROSS]), 0).actions).toEqual([]);
    expect(p.frame(pad([CROSS]), 16).actions).toEqual([]);
    p.frame(pad(), 32);
    expect(p.frame(pad([CROSS]), 48).actions).toEqual(['act']);
  });

  it('after a reset (the forge back from a match), what is still held waits to be let go: the exit chord fires nothing', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    p.reset();
    expect(p.frame(pad([SELECT, START]), 16).actions).toEqual([]);
    expect(p.frame(pad([SELECT, START]), 32).actions).toEqual([]);
    p.frame(pad(), 48);
    expect(p.frame(pad([START]), 64).actions).toEqual(['menu']);
  });

  it('repeats the d-pad: once at the press, then after the delay at the interval', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    const fired: number[] = [];
    for (let t = 16; t <= 16 + PAD_REPEAT_DELAY_MS + PAD_REPEAT_EVERY_MS * 2 + 1; t += 4) {
      if (p.frame(pad([DOWN]), t).actions.includes('nextAsset')) fired.push(t);
    }
    expect(fired.length).toBe(4);
    expect(fired[1]! - fired[0]!).toBeGreaterThanOrEqual(PAD_REPEAT_DELAY_MS);
    p.frame(pad(), 2000);
    expect(p.frame(pad([UP]), 2016).actions).toEqual(['prevAsset']);
    p.frame(pad(), 2032);
    expect(p.frame(pad([LEFT]), 2048).actions).toEqual(['turnLeft']);
    p.frame(pad(), 2064);
    expect(p.frame(pad([RIGHT]), 2080).actions).toEqual(['turnRight']);
  });

  it('gives the sticks past the dead zone, and the triggers as the lift (R2 up, L2 down)', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    expect(p.frame(pad([], [0.05, -0.05, 0.1, 0]), 16)).toMatchObject({ move: [0, 0], look: [0, 0], lift: 0 });
    const f = p.frame(pad([], [0.8, -0.6, 0, 0.9], { [R2]: 0.75, [L2]: 0.25 }), 32);
    expect(f.move[0]).toBeGreaterThan(0.5);
    expect(f.move[1]).toBeLessThan(-0.3);
    expect(f.look[1]).toBeGreaterThan(0.5);
    expect(f.lift).toBeCloseTo(0.5);
  });

  it('a Circle tap deselects; a Circle hold grabs the selection while held, and its release then deselects nothing', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    expect(p.frame(pad([CIRCLE]), 16)).toMatchObject({ grab: true, actions: [] });
    expect(p.frame(pad(), 100).actions).toEqual(['deselect']);
    expect(p.frame(pad([CIRCLE]), 200).grab).toBe(true);
    expect(p.frame(pad([CIRCLE], [0.9, 0, 0, 0]), 300)).toMatchObject({ grab: true });
    expect(p.frame(pad(), 400)).toMatchObject({ grab: false, actions: [] });
  });

  it('boosts the fly while the left stick is pushed to its rim (the touch stick’s rule), never short of it', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    expect(p.frame(pad([], [0.99, 0, 0, 0]), 16).boost).toBe(true);
    expect(p.frame(pad([], [0.6, 0, 0, 0]), 32).boost).toBe(false);
  });

  it('FG-47 (the review\'s F2): the tap-or-hold is the build\'s alone -- not in the walk, a card, the menu, nor while the lobby\'s window takes the pad', () => {
    const at = { playing: false, card: false, menu: false, lobbyWindow: false };
    expect(crossHoldsIn(at)).toBe(true);
    expect(crossHoldsIn({ ...at, playing: true })).toBe(false);
    expect(crossHoldsIn({ ...at, card: true })).toBe(false);
    expect(crossHoldsIn({ ...at, menu: true })).toBe(false);
    expect(crossHoldsIn({ ...at, lobbyWindow: true })).toBe(false);
  });

  it('FG-47 (F2): Cross pressed while the window had the pad (off), let go after it went (on), acts not at the release', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    p.crossHolds = false;                                                // the lobby's window shows: its LEAVE takes the press
    expect(p.frame(pad([CROSS]), 100).actions).toEqual(['act']);         // the page hands this frame to the window alone
    p.crossHolds = true;                                                 // the window went (LEAVE): the build's again
    expect(p.frame(pad([CROSS]), 116).actions).toEqual([]);
    expect(p.frame(pad(), 132).actions).toEqual([]);                    // the release: no stray act in the forge
  });

  it('with no pad, nothing: no actions, the sticks at rest', () => {
    expect(new ForgePad().frame(null, 0)).toEqual({ actions: [], move: [0, 0], look: [0, 0], lift: 0, grab: false, boost: false });
  });
});

/**
 * AM-1 (FI.R2, FI.R5; the owner, 2026-10-16: "make menu movement work with analog sticks across the board"; a browser
 * adaptation, no original -- the game has no editor): while the forge's menu is open the left stick moves its focus as
 * the d-pad does, with the d-pad's own repeat, and flies nothing.
 */
describe('AM-1: the left stick in the forge menu', () => {
  const PUSH = PAD_MENU_STICK_PUSH_ADAPTATION, REST = PAD_MENU_STICK_REST_ADAPTATION;
  /** The menu open: the pad armed (its first frame), then the menu seen with the stick at rest. */
  const open = (): ForgePad => { const p = new ForgePad(); p.menuOpen = true; p.frame(pad(), 0); p.frame(pad(), 8); return p; };

  it('names its dead zone: a direction past 0.5 on the stronger axis, re-armed under 0.3', () => {
    expect([PUSH, REST]).toEqual([0.5, 0.3]);
  });

  it("the review's F1: the d-pad held with the stick pushed the same way is one step, not two -- the stick waits", () => {
    const p = open();
    expect(p.frame(pad([13], [0, 0.8, 0, 0]), 16).actions).toEqual(['nextAsset']);       // both at once: the d-pad's alone
    const fired: string[] = [];
    for (let t = 32; t <= 1000; t += 16) fired.push(...p.frame(pad([13], [0, 0.8, 0, 0]), t).actions);
    // The d-pad's repeat alone: at 16 + 400, then every 100 ms to 1000 (416, 516, ..., 916): six, not twelve.
    expect(fired).toEqual(Array(6).fill('nextAsset'));
    expect(p.frame(pad([], [0, 0.8, 0, 0]), 1016).actions).toEqual([]);                  // the d-pad let go: the stick waits for the rest
    p.frame(pad([], [0, 0, 0, 0]), 1032);
    expect(p.frame(pad([], [0, 0.8, 0, 0]), 1048).actions).toEqual(['nextAsset']);
  });

  it('a push past the dead zone is one step, and the stick flies nothing', () => {
    const p = open();
    expect(p.frame(pad([], [0, PUSH - 0.01, 0, 0]), 16).actions).toEqual([]);          // short of the push: nothing
    const f = p.frame(pad([], [0, 0.8, 0, 0]), 32);
    expect(f).toMatchObject({ actions: ['nextAsset'], move: [0, 0], boost: false });
    expect(p.frame(pad([], [0, 0.8, 0, 0]), 48).actions).toEqual([]);                 // held: once, until the repeat
  });

  it('held, it repeats as a held d-pad button: at the delay, then at the interval', () => {
    const p = open();
    const fired: number[] = [];
    for (let t = 16; t <= 16 + PAD_REPEAT_DELAY_MS + PAD_REPEAT_EVERY_MS * 2 + 1; t += 4) {
      if (p.frame(pad([], [0, -1, 0, 0]), t).actions.includes('prevAsset')) fired.push(t);
    }
    expect(fired).toEqual([16, 16 + PAD_REPEAT_DELAY_MS, 16 + PAD_REPEAT_DELAY_MS + PAD_REPEAT_EVERY_MS, 16 + PAD_REPEAT_DELAY_MS + PAD_REPEAT_EVERY_MS * 2]);
  });

  it('re-arms only back under the rest: between the rest and the push it stays one held step', () => {
    const p = open();
    expect(p.frame(pad([], [0.9, 0, 0, 0]), 16).actions).toEqual(['turnRight']);
    expect(p.frame(pad([], [REST + 0.05, 0, 0, 0]), 32).actions).toEqual([]);          // eased, not let go
    expect(p.frame(pad([], [0.9, 0, 0, 0]), 48).actions).toEqual([]);                  // so no second press
    expect(p.frame(pad([], [REST - 0.05, 0, 0, 0]), 64).actions).toEqual([]);          // under the rest: re-armed
    expect(p.frame(pad([], [0.9, 0, 0, 0]), 80).actions).toEqual(['turnRight']);
    p.frame(pad(), 96);
    expect(p.frame(pad([], [-0.9, 0, 0, 0]), 112).actions).toEqual(['turnLeft']);
  });

  it('a diagonal takes the stronger axis', () => {
    const p = open();
    expect(p.frame(pad([], [0.6, -0.7, 0, 0]), 16).actions).toEqual(['prevAsset']);
    p.frame(pad(), 32);
    expect(p.frame(pad([], [-0.8, 0.6, 0, 0]), 48).actions).toEqual(['turnLeft']);
    p.frame(pad(), 64);
    expect(p.frame(pad([], [0.55, 0.75, 0, 0]), 80).actions).toEqual(['nextAsset']);
  });

  it('a stick already pushed when the menu opens (the fly) steps nothing until it rests', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    expect(p.frame(pad([], [0, -1, 0, 0]), 16).actions).toEqual([]);                  // flying forward
    p.menuOpen = true;                                                                 // START: the menu opens
    expect(p.frame(pad([], [0, -1, 0, 0]), 32)).toMatchObject({ actions: [], move: [0, 0] });
    expect(p.frame(pad([], [0, -1, 0, 0]), 32 + PAD_REPEAT_DELAY_MS * 2).actions).toEqual([]);
    p.frame(pad(), 1000);
    expect(p.frame(pad([], [0, -1, 0, 0]), 1016).actions).toEqual(['prevAsset']);
  });

  it('the menu shut, the stick flies the camera as before and steps nothing', () => {
    const p = new ForgePad();
    p.frame(pad(), 0);
    const f = p.frame(pad([], [0, -0.8, 0, 0]), 16);
    expect(f.actions).toEqual([]);
    expect(f.move[1]).toBeLessThan(-0.5);
    expect(p.frame(pad([], [0.99, 0, 0, 0]), 32).boost).toBe(true);
    p.menuOpen = true;                                                                 // opened, then shut again
    p.frame(pad(), 48);
    p.menuOpen = false;
    expect(p.frame(pad([], [0, 0.8, 0, 0]), 64)).toMatchObject({ actions: [] });
    expect(p.frame(pad([], [0, 0.8, 0, 0]), 80).move[1]).toBeGreaterThan(0.5);
  });

  it('the menu open, the d-pad still steps and repeats as before', () => {
    const p = open();
    expect(p.frame(pad([DOWN]), 16).actions).toEqual(['nextAsset']);
    expect(p.frame(pad([DOWN]), 16 + PAD_REPEAT_DELAY_MS).actions).toEqual(['nextAsset']);
  });

  it('MenuStick alone: up, down, left, right by the pad\'s signs (y down), none at rest', () => {
    const s = new MenuStick();
    expect(s.step([0, 0], 0)).toBeNull();
    expect(s.step([0, -0.9], 10)).toBe('up');
    expect(s.step([0, 0], 20)).toBeNull();
    expect(s.step([0, 0.9], 30)).toBe('down');
    expect(s.step([0.2, 0.9], 40)).toBeNull();
    expect(s.step([-0.9, 0.2], 50)).toBe('left');                                    // the stronger axis turned: a new press
    s.hold();
    expect(s.step([-0.9, 0], 60 + PAD_REPEAT_DELAY_MS)).toBeNull();                  // held: waits for the rest
    expect(s.step([0, 0], 1000)).toBeNull();
    expect(s.step([0.9, 0], 1010)).toBe('right');
    expect(s.step([Number.NaN, Number.NaN], 1020)).toBeNull();                       // a broken read is at rest
  });
});
