import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Traversal, type TraversalEvent } from '../src/traversal';
import { Walker, type WalkInput } from '../src/walk';

/**
 * DG-GUARD (the owner's safety rule, `STEP_UP_FLOOR_GUARD_OWNER`; DG-CLIMB): an AUTOMATIC step-up (appflags 4,
 * 5 < h <= 10, `planClimb`'s `automatic`) is not started when its end finds no floor (`topFloor` null), the body left
 * walking as if nothing were offered; the pressed climb is unchanged. Synthetic hulls, no disc: an 8-high appflags-4 box
 * whose top is a floor (the step-up runs, as `traversal.test.ts`'s "steps onto a low crate with no press"), and the same
 * box's four sides with no floor on top (the guard refuses it, every tick, the body in front of the face).
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

/** An 8-high appflags-4 box from (-10, -30) to (10, 0) on the 0 floor; its top a floor or not. */
function stepWorld(topFloor: boolean): { grid: Grid; polys: WorldPoly[] } {
  const x0 = -10, z0 = -30, x1 = 10, z1 = 0, h = 8, app = 4;
  const sides = [
    quad([x0, 0, z1, x1, 0, z1, x1, h, z1, x0, h, z1], 2, app),
    quad([x0, 0, z0, x1, 0, z0, x1, h, z0, x0, h, z0], 2, app),
    quad([x0, 0, z0, x0, 0, z1, x0, h, z1, x0, h, z0], 2, app),
    quad([x1, 0, z0, x1, 0, z1, x1, h, z1, x1, h, z0], 2, app),
  ];
  const polys = [floor(-100, -100, 100, 100, 0), ...sides, ...(topFloor ? [floor(x0, z0, x1, z1, h)] : [])];
  return { grid: world(polys), polys };
}

function walker(polys: WorldPoly[], grid: Grid): { w: Walker; t: Traversal; events: TraversalEvent[] } {
  const w = new Walker(grid), t = new Traversal(grid, polys);
  w.driver = t;
  const events: TraversalEvent[] = [];
  t.on((e) => events.push(e));
  w.place(0, 10, 12);
  w.state.yaw = 0;
  return { w, t, events };
}

describe('DG-GUARD: the automatic step-up asks a floor at its end (STEP_UP_FLOOR_GUARD_OWNER)', () => {
  it("an automatic step-up whose top has a floor starts as before", () => {
    const { grid, polys } = stepWorld(true);
    const { w, t, events } = walker(polys, grid);
    for (let i = 0; i < 200 && events.length === 0; i++) w.tick(FORWARD);
    expect(events[0]).toEqual({ type: 'climbStart', kind: 'step' });
    for (let i = 0; i < 400 && t.state().kind !== 'none'; i++) w.tick(STILL);
    expect(w.state.y).toBeCloseTo(8, 6);
  });

  it("an automatic step-up whose top has no floor does not start; the body stays in front of the face, every tick", () => {
    const { grid, polys } = stepWorld(false);
    const { w, t, events } = walker(polys, grid);
    let offered = 0;
    for (let i = 0; i < 300; i++) {
      w.tick(FORWARD);
      const p = t.climbPrompt();
      if (p?.kind === 'step' && p.automatic) offered++;
      expect(t.state().kind, `tick ${i}`).toBe('none');
      expect(w.state.z, `tick ${i}: the feet in front of the face`).toBeGreaterThan(0);
      expect(w.state.y, `tick ${i}: the feet on the ground`).toBeCloseTo(0, 6);
    }
    expect(offered, 'the step is still offered (the prompt), only its automatic start refused').toBeGreaterThan(0);
    expect(events).toEqual([]);
  });

  it("a PRESS on the same floorless step-up does not start it either (DG-GUARD-AFTER-PC4's hole)", () => {
    // PC 4 (DG-GUARD-AFTER-PC4, MP6, 4c6ed17749): Cross pressed during the +20 deg walk-in started the floorless step-up
    // from the press (`pressed || stepUp`), ending the body 1.00 u behind the face on air. The guard is the plan's, not the
    // automatic start's alone.
    const { grid, polys } = stepWorld(false);
    const { w, t, events } = walker(polys, grid);
    for (let i = 0; i < 200 && t.climbPrompt() === null; i++) w.tick(FORWARD);
    expect(t.climbPrompt()?.kind).toBe('step');
    t.action();
    for (let i = 0; i < 60; i++) {
      w.tick(STILL);
      expect(t.state().kind, `tick ${i}`).toBe('none');
      expect(w.state.z, `tick ${i}: the feet in front of the face`).toBeGreaterThan(0);
    }
    expect(events).toEqual([]);
  });
  it("an AI body (a following hostage) takes no floorless step-up either (tickAi; the review's F2)", () => {
    // An 8-high appflags-4 wall alone (no top, no floor on it), as aiClimb.test.ts builds its contact: h 8 is the automatic
    // band, so tickAi would start the step-up into the wall's back; the guard refuses it as for a seat.
    const wall = quad([-10, 0, 0, 10, 0, 0, 10, 8, 0, -10, 8, 0], 3, 4, 'worldmodel/wall');
    const polys = [floor(-100, -100, 100, 100, 0), wall];
    const grid = world(polys);
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.place(0, 0, 5);
    w.glideAi(0, -1);
    expect(t.tickAi(w, FORWARD, 1 / 30)).toBe(false);
    expect(t.state().kind).toBe('none');
  });
});
