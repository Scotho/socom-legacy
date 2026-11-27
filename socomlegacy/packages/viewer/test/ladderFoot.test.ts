import { describe, expect, it } from 'vitest';
import { buildGrid, findLadders, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker, type WalkInput } from '../src/walk';
import { Traversal, type TraversalEvent } from '../src/traversal';

/**
 * B-50 (SCOPE-C C4; tier 1 row 7; research 86 s2.7): the ladder's foot test and the slide's landing compare against the
 * actor's floor RECORD -- the last floor the probe answered, kept when it answers nothing, the body put back on its
 * point on a miss (the row 7 read of r0004, reading, pending review: 0x589840 the foot, 0x5a11e8 the slide's end,
 * 0x5b63d0-0x5b6480 the miss; `Traversal.ladderFloorAt`). The port's old pick (`groundUnder`, a fresh "highest floor
 * under the feet" or null) skipped both on null and the body went down for ever ("sliding to infinity"). Held here,
 * with no game data: (1) a ladder with no floor at all under the climber's column never takes the body under where the
 * mount hung it (each miss puts it back on the record's point) and is left within a bounded time; (2) a body left under its column's floor by a foot mount (the
 * 22-map census's shape: 10 ladders of 7 maps, `ladderFoot.devdisc.test.ts`) steps off on that floor when the stick
 * is pulled back -- the pick sees floors up to 1 over the feet (r0004 0x5bc180). Simulation track; synthetic geometry.
 */

const BACK: WalkInput = { forward: -1, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const ON_LADDER = new Set(['ladderMount', 'ladderMountTop', 'ladder', 'ladderSlide']);

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q'): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3);

function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/**
 * traversal.test.ts's `ladderWorld` (a 40-high wall at z 0, the deck behind it at 40, a ladder 0..40 with its cap
 * 40..50) with the ground in front cut back to z >= 30: the column the climber hangs in (z 5.765) has no floor under it.
 */
function floorlessLadderWorld(): { grid: Grid; polys: WorldPoly[] } {
  const polys = [
    floor(-100, 30, 100, 100, 0),
    floor(-100, -100, 100, 0, 40),
    quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ];
  return { grid: world(polys), polys };
}

/** The ground in front cut back to z >= 10: the climber's column (z 5.765) has no floor, the CLIMB press (z 18.42) has one. */
function floorlessFootWorld(): { grid: Grid; polys: WorldPoly[] } {
  const polys = [
    floor(-100, 10, 100, 100, 0),
    floor(-100, -100, 100, 0, 40),
    quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
    quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
  ];
  return { grid: world(polys), polys };
}

/** traversal.test.ts's `ladderWorld` as it is: the ground in front at 0 under the whole column. */
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

function pressLadder(w: Walker, t: Traversal, input: WalkInput, max = 400): void {
  for (let i = 0; i < max && t.climbPrompt()?.kind !== 'ladder'; i++) w.tick(input);
  if (t.climbPrompt()?.kind !== 'ladder') throw new Error('no ladder CLIMB offered');
  t.action();
  w.tick(input);
}

/** Ticks `input` while the traversal holds a ladder state, up to `max`; returns the ticks run and the lowest y on it. */
function whileOnLadder(w: Walker, t: Traversal, input: WalkInput, max: number): { ticks: number; lowest: number } {
  let lowest = w.state.y, i = 0;
  for (; i < max && ON_LADDER.has(t.state().kind); i++) { w.tick(input); if (ON_LADDER.has(t.state().kind)) lowest = Math.min(lowest, w.state.y); }
  return { ticks: i, lowest };
}

/** Mounted from the deck and settled on the rungs, as traversal.test.ts's deck mount. */
function mountedFromDeck(): { w: Walker; t: Traversal; bottom: number; events: TraversalEvent[] } {
  const { grid, polys } = floorlessLadderWorld();
  const w = new Walker(grid), t = new Traversal(grid, polys), events: TraversalEvent[] = [];
  w.driver = t;
  t.on((e) => events.push(e));
  const ladder = findLadders(polys, grid)[0]!;
  w.place(0, 60, -20); w.state.yaw = 180;
  pressLadder(w, t, FORWARD);
  for (let i = 0; i < 400 && t.state().kind !== 'ladder'; i++) w.tick(STILL);
  expect(t.state().kind).toBe('ladder');
  return { w, t, bottom: ladder.bottom, events };
}

describe('B-50: the ladder ends on its floor record, never below it', () => {
  it("the synthetic ladder has a foot at 0 and no floor in the climber's column", () => {
    const { grid, polys } = floorlessLadderWorld();
    expect(findLadders(polys, grid)).toHaveLength(1);
    expect(findLadders(polys, grid)[0]!.bottom).toBeCloseTo(0, 6);
  });

  // With no floor at all under the column the probe misses every tick: the record is the deck's (seeded at the mount)
  // and each miss puts the body back on its point (r0004 0x5b6458-0x5b6468), so it never goes under where it hung.
  it('no floor under the column: climbing down never goes under where the mount hung the body, and the ladder is left', () => {
    const { w, t } = mountedFromDeck();
    const hung = w.state.y;
    const { ticks, lowest } = whileOnLadder(w, t, BACK, 3000);
    expect(lowest).toBeGreaterThanOrEqual(hung - 1);
    expect(ticks).toBeLessThan(3000);
    expect(ON_LADDER.has(t.state().kind)).toBe(false);
  });

  it('no floor under the column: the slide never goes under where the mount hung the body, lands and ends', () => {
    const { w, t, events } = mountedFromDeck();
    const hung = w.state.y;
    t.action();
    w.tick(STILL);
    expect(t.state().kind).toBe('ladderSlide');
    const { ticks, lowest } = whileOnLadder(w, t, STILL, 3000);
    expect(lowest).toBeGreaterThanOrEqual(hung - 1);
    expect(ticks).toBeLessThan(3000);
    expect(events.map((e) => e.type)).toContain('ladderSlideLand');
  });

  it("a body left 0.8 under its column's floor steps off on that floor when the stick is pulled back at once", () => {
    const { grid, polys } = ladderWorld();
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 20); w.state.yaw = 0;
    pressLadder(w, t, FORWARD);
    for (let i = 0; i < 400 && t.state().kind !== 'ladder'; i++) w.tick(FORWARD);
    expect(t.state().kind).toBe('ladder');
    w.state.y = -0.8;                                              // the census's shape: the mount ends under the floor
    const { ticks, lowest } = whileOnLadder(w, t, BACK, 3000);
    expect(lowest).toBeGreaterThanOrEqual(-1);
    expect(ticks).toBeLessThan(3000);
    for (let i = 0; i < 400 && t.state().kind !== 'none'; i++) w.tick(STILL);
    expect(t.state().kind).toBe('none');
    expect(w.state.y).toBeCloseTo(0, 6);
  });
  // Review F2 (row 7 review): the SEED and the miss's PUT-BACK point pinned. The record carried onto the ladder is the
  // walk's (the addendum read: state 5's entry, 0x58c710, writes none), seeded where the mover stood on the press; a
  // miss puts the body back on the record's point (r0004 0x5b6458-0x5b6468) -- not the mount's end column, not the
  // body's own point.
  it("a foot mount over a floorless column: a tick on the rungs puts the body back where it stood on the press, and the stick back steps off", () => {
    const { grid, polys } = floorlessFootWorld();
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 20); w.state.yaw = 0;
    for (let i = 0; i < 400 && t.climbPrompt()?.kind !== 'ladder'; i++) w.tick(FORWARD);
    expect(t.climbPrompt()?.kind).toBe('ladder');
    const press: [number, number, number] = [w.state.x, w.state.y, w.state.z];
    expect(press[2]).toBeGreaterThan(10);                          // the press stands on the floor
    t.action(); w.tick(FORWARD);
    for (let i = 0; i < 400 && t.state().kind !== 'ladder'; i++) w.tick(FORWARD);
    expect(t.state().kind).toBe('ladder');
    expect(w.state.z).toBeLessThan(10);                            // the mount ended over the floorless column
    w.tick(STILL);                                                 // a tick on the rungs: the miss's read step
    expect([w.state.x, w.state.y, w.state.z]).toEqual(press);
    expect(t.state().kind).toBe('ladder');
    w.tick(BACK);                                                  // and the foot test fires on the record's y
    expect(t.state().kind).toBe('ladderOffBottom');
  });

  it("a deck mount over a floorless column: the first ladder tick's miss puts the body back on the deck where it pressed", () => {
    const { grid, polys } = floorlessLadderWorld();
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 60, -20); w.state.yaw = 180;
    for (let i = 0; i < 400 && t.climbPrompt()?.kind !== 'ladder'; i++) w.tick(FORWARD);
    expect(t.climbPrompt()?.kind).toBe('ladder');
    const press: [number, number, number] = [w.state.x, w.state.y, w.state.z];
    t.action(); w.tick(FORWARD);
    for (let i = 0; i < 400 && t.state().kind !== 'ladder'; i++) w.tick(STILL);
    expect(t.state().kind).toBe('ladder');
    w.tick(STILL);
    expect([w.state.x, w.state.y, w.state.z]).toEqual(press);
  });
  // Re-review item 8: the slide's own put-back. Over a column with no floor every slide tick misses; the tick's end puts
  // the body back on the record's point (the deck where it pressed), and the slide lands there.
  it("the slide over a floorless column lands on the record's point (the deck where the mount was pressed)", () => {
    const { grid, polys } = floorlessLadderWorld();
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 60, -20); w.state.yaw = 180;
    for (let i = 0; i < 400 && t.climbPrompt()?.kind !== 'ladder'; i++) w.tick(FORWARD);
    const press: [number, number, number] = [w.state.x, w.state.y, w.state.z];
    t.action(); w.tick(FORWARD);
    for (let i = 0; i < 400 && t.state().kind !== 'ladder'; i++) w.tick(STILL);
    expect(t.state().kind).toBe('ladder');
    t.action(); w.tick(STILL);
    expect(t.state().kind).toBe('ladderSlide');
    for (let i = 0; i < 3000 && t.state().kind === 'ladderSlide'; i++) w.tick(STILL);
    expect(t.state().kind).toBe('ladderSlideLand');
    expect([w.state.x, w.state.y, w.state.z]).toEqual(press);
    // Fold delta F2 (i): one tick into the landing clip the body is still by the record's point (the deck), not in the
    // ladder column 12.8 away -- a landing started before the put-back would begin there and go red here.
    w.tick(STILL);
    expect(Math.hypot(w.state.x - press[0], w.state.z - press[2])).toBeLessThan(3);
  });

  // Fold delta F2 (ii): the miss branch of the foot test pinned -- the FIRST rung tick is the stick back over a floorless
  // column: the step-off starts from the record's point (where the mover pressed), not from the ladder column.
  it("a foot mount over a floorless column, the stick back on the first rung tick: the step off starts from the press point", () => {
    const { grid, polys } = floorlessFootWorld();
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 20); w.state.yaw = 0;
    for (let i = 0; i < 400 && t.climbPrompt()?.kind !== 'ladder'; i++) w.tick(FORWARD);
    const press: [number, number, number] = [w.state.x, w.state.y, w.state.z];
    t.action(); w.tick(FORWARD);
    for (let i = 0; i < 400 && t.state().kind !== 'ladder'; i++) w.tick(FORWARD);
    expect(t.state().kind).toBe('ladder');
    expect(w.state.z).toBeLessThan(10);
    w.tick(BACK);
    expect(t.state().kind).toBe('ladderOffBottom');
    expect([w.state.x, w.state.y, w.state.z]).toEqual(press);
    // One tick into the step-off clip: still by the press point, not back in the ladder column (12.7 away) -- a step-off
    // started before the put-back would begin in the column and go red here.
    w.tick(STILL);
    expect(Math.hypot(w.state.x - press[0], w.state.z - press[2])).toBeLessThan(3);
  });
});
