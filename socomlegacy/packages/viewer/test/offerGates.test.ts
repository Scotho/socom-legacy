import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker, type WalkInput } from '../src/walk';
import type { MoverAction } from '../src/mover';
import { AIR_STEP_UP_READING, Traversal, type TraversalEvent } from '../src/traversal';

/**
 * R4P-243 (research 313 s8.24; ATLAS L367, L372, L373; reading, pending review; capture IQ-179 queued): the three gates
 * r0004 adds to the climb's and the ladder's offers, which r0001 (the port's base) does not have.
 *   L367 -- r0004 `FUN_00598d30` (CSealCtrl::SampleActionAvailable), its air branch D4:L493145-493148 and its ground
 *     branch D4:L493164-493168: an item in hand that isSelectableItem (0x5c47e0, the twin of `FUN_005bdc30`,
 *     `./equipment` `slotSelectable`) refuses skips CanClimbWall (0x5a3400: the climb, and CanTraverse kind 4, the
 *     automatic step-up) and CanClimbLadder (0x5a34e0); an empty hand passes. The r0001 twin `FUN_00593500` has no test.
 *   L372 -- r0004 CanTraverse `FUN_005b9ff0` kind 2, after the one-SEAL-a-ladder test (D4:L510524-510554): the top blend
 *     `Place claymore` (DAT_00409d18) refuses the ladder (D4:L510555-510557). The r0001 twin `FUN_005b3ce0`
 *     (D:L469165-469197) has no blend test.
 *   L373 -- r0004 CanTraverse kind 4 (D4:L510624-510642): for 5 < h <= 10 the step-up runs only when `FUN_0058d580`
 *     answers 0 -- the top blend neither `Jump launch` (8) nor `Jump fall` (9), airborne or not; `Jump land` passes. The
 *     r0001 twin (D:L469263-469276) runs it unconditionally.
 */

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3);

function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** A box of height `h` (its sides appflags `app`, 4 the crate's) from z 0 back to z -30, the ground at 0 round it. */
function crateWorld(h: number, app = 4): { grid: Grid; polys: WorldPoly[] } {
  const [x0, z0, x1, z1] = [-10, -30, 10, 0];
  const polys = [
    floor(-100, -100, 100, 100, 0),
    quad([x0, 0, z1, x1, 0, z1, x1, h, z1, x0, h, z1], 2, app),
    quad([x0, 0, z0, x1, 0, z0, x1, h, z0, x0, h, z0], 2, app),
    quad([x0, 0, z0, x0, 0, z1, x0, h, z1, x0, h, z0], 2, app),
    quad([x1, 0, z0, x1, 0, z1, x1, h, z1, x1, h, z0], 2, app),
    floor(x0, z0, x1, z1, h),
  ];
  return { grid: world(polys), polys };
}

/** A 40-high wall at z 0, a deck behind it at 40, and a ladder on its face (the span 0..40, the cap 40..50). */
function ladderWorld(): { grid: Grid; polys: WorldPoly[] } {
  const polys = [
    floor(-100, 0, 100, 100, 0),
    floor(-100, -100, 100, 0, 40),
    quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ];
  return { grid: world(polys), polys };
}

function rig(at: { grid: Grid; polys: WorldPoly[] }, z: number): { w: Walker; t: Traversal; events: TraversalEvent[] } {
  const w = new Walker(at.grid), t = new Traversal(at.grid, at.polys), events: TraversalEvent[] = [];
  w.driver = t;
  t.on((e) => events.push(e));
  w.place(0, 10, z);
  w.state.yaw = 0;                                                     // facing -z, at the face
  return { w, t, events };
}

function run(w: Walker, input: WalkInput, until: () => boolean, max = 400): number {
  for (let i = 0; i < max; i++) { if (until()) return i; w.tick(input); }
  return max;
}

/** At the 12 crate's face, the climb offered. */
function atCrate(): { w: Walker; t: Traversal; events: TraversalEvent[] } {
  const c = rig(crateWorld(12), 12);
  run(c.w, FORWARD, () => c.t.climbPrompt() !== null, 240);
  for (let i = 0; i < 10; i++) c.w.tick(STILL);
  expect(c.t.climbPrompt()?.kind).toBe('low');
  return c;
}

/** At the ladder's foot, CLIMB offered. */
function atLadder(): { w: Walker; t: Traversal; events: TraversalEvent[] } {
  const c = rig(ladderWorld(), 20);
  run(c.w, FORWARD, () => c.t.climbPrompt() !== null, 240);
  for (let i = 0; i < 10; i++) c.w.tick(STILL);
  expect(c.t.climbPrompt()?.kind).toBe('ladder');
  return c;
}

/** At the 8 face (the step-up's band), walked in until the frame's hit has made the contact; nothing climbed yet. */
function atStep(): { w: Walker; t: Traversal; events: TraversalEvent[] } {
  const c = rig(crateWorld(8), 12);
  run(c.w, FORWARD, () => c.w.storedContact() !== null, 200);
  expect(c.w.storedContact()).not.toBeNull();
  expect(c.events).toEqual([]);
  return c;
}

/** The mover's top action set to `name` for the next tick (the blend `FUN_0058d580` reads), grounded or not. */
function topAction(w: Walker, name: MoverAction['name'], seconds: number | null = null): void {
  (w as unknown as { action_: MoverAction }).action_ = { name, serial: 9999, t: 0, seconds, reversed: false };
}

describe('R4P-243 L367: no climb, ladder or step-up offered with an unselectable item in hand (r0004 FUN_00598d30)', () => {
  it('the hook unset (an empty hand) and answering false (a selectable item) leave the crate, the ladder and the step-up offered', () => {
    for (const hook of [null, () => false]) {
      const crate = atCrate();
      crate.t.handRefusesClimb = hook;
      crate.w.tick(STILL);
      expect(crate.t.climbPrompt()?.kind).toBe('low');
      const ladder = atLadder();
      ladder.t.handRefusesClimb = hook;
      ladder.w.tick(STILL);
      expect(ladder.t.climbPrompt()?.kind).toBe('ladder');
      const step = atStep();
      step.t.handRefusesClimb = hook;
      step.w.tick(STILL);
      expect(step.events[0]).toEqual({ type: 'climbStart', kind: 'step' });
    }
  });

  it('an emptied launcher in hand (the hook true) refuses the crate climb: no prompt, the press climbs nothing', () => {
    const { w, t, events } = atCrate();
    t.handRefusesClimb = () => true;                                   // D4:L493164-493168
    w.tick(STILL);
    expect(t.climbPrompt()).toBeNull();
    t.action();
    w.tick(STILL);
    expect(events).toEqual([]);
    expect(t.state().kind).toBe('none');
    t.handRefusesClimb = () => false;                                  // the item put away: offered again
    w.tick(STILL);
    expect(t.climbPrompt()?.kind).toBe('low');
  });

  it('refuses the ladder: no CLIMB, the press mounts nothing', () => {
    const { w, t, events } = atLadder();
    t.handRefusesClimb = () => true;
    w.tick(STILL);
    expect(t.climbPrompt()).toBeNull();
    t.action();
    w.tick(STILL);
    expect(events).toEqual([]);
    expect(t.state().kind).toBe('none');
  });

  it('refuses the automatic step-up (CanClimbWall holds CanTraverse kind 4)', () => {
    const { w, t, events } = atStep();
    t.handRefusesClimb = () => true;
    for (let i = 0; i < 30; i++) w.tick(STILL);
    expect(events).toEqual([]);
    expect(t.state().kind).toBe('none');
  });

  it('refuses in the air too (the air branch, D4:L493145-493148): a drop past the 8 face with the hook true never steps up', () => {
    const { w, t, events } = atStep();
    t.handRefusesClimb = () => true;
    w.setAirborne(true, 0);
    topAction(w, 'land');                                              // not a jump blend: only the hand refuses here
    for (let i = 0; i < 30; i++) w.tick(STILL);
    expect(events.filter((e) => e.type === 'climbStart')).toEqual([]);
  });
});

describe('R4P-243 L372: no ladder while Place claymore is on top (r0004 FUN_005b9ff0 kind 2)', () => {
  it("the claymore's placing refuses the ladder's CLIMB, and the press mounts nothing", () => {
    const { w, t, events } = atLadder();
    expect(w.hold('seal_place_claymore')).toBe(true);
    w.tick(STILL);
    expect(t.climbPrompt()).toBeNull();                                // D4:L510555-510557
    t.action();
    w.tick(STILL);
    expect(events).toEqual([]);
    expect(t.state().kind).toBe('none');
  });

  it("after the claymore's clip the ladder is offered again (the queue's L372 control)", () => {
    const { w, t } = atLadder();
    expect(w.hold('seal_place_claymore')).toBe(true);
    w.tick(STILL);
    expect(t.climbPrompt()).toBeNull();
    run(w, STILL, () => w.holding === null, 400);
    expect(w.holding).toBeNull();
    w.tick(STILL);
    expect(t.climbPrompt()?.kind).toBe('ladder');
  });

  it("the claymore's placing does not refuse the crate's climb (kind 2 only)", () => {
    const { w, t } = atCrate();
    expect(w.hold('seal_place_claymore')).toBe(true);
    w.tick(STILL);
    expect(t.climbPrompt()?.kind).toBe('low');
  });

  it("C4's wall placing (`seal_put_onwall`, the 'place' family too) is not the claymore's blend: the ladder stays offered", () => {
    const { w, t } = atLadder();
    expect(w.hold('seal_put_onwall')).toBe(true);
    w.tick(STILL);
    expect(t.climbPrompt()?.kind).toBe('ladder');
  });
});

describe('R4P-243 L373: no automatic step-up under Jump launch or Jump fall (r0004 FUN_005b9ff0 kind 4, FUN_0058d580)', () => {
  it('the reading names the blend test', () => {
    expect(AIR_STEP_UP_READING).toBe('not-in-jump-blend');
  });

  it("refused under 'fall' (airborne)", () => {
    const { w, events } = atStep();
    w.setAirborne(true, 0);
    topAction(w, 'fall');
    w.tick(STILL);
    expect(events.filter((e) => e.type === 'climbStart')).toEqual([]);
  });

  it("refused under 'fall' on the ground (a blend test, not an airborne test)", () => {
    const { w, events } = atStep();
    topAction(w, 'fall');
    w.tick(STILL);
    expect(events.filter((e) => e.type === 'climbStart')).toEqual([]);
  });

  it("refused under a grounded 'launch'", () => {
    const { w, events } = atStep();
    expect(w.airborne).toBe(false);
    topAction(w, 'launch', 1);
    w.tick(STILL);
    expect(events.filter((e) => e.type === 'climbStart')).toEqual([]);
  });

  it("runs under 'land' (the landing is not a jump blend `FUN_0058d580` holds)", () => {
    const { w, events } = atStep();
    topAction(w, 'land', 1);
    w.tick(STILL);
    expect(events[0]).toEqual({ type: 'climbStart', kind: 'step' });
  });
});
