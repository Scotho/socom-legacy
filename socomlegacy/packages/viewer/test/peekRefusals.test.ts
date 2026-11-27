import { describe, expect, it } from 'vitest';
import { buildGrid, findLadders, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker, type WalkInput } from '../src/walk';
import { Traversal } from '../src/traversal';

/**
 * R4P-108 (R4-MOV-PEEKWATER, L107; PROVEN on r0004 by Q108-PC2, atlas-parity c23c30c5aa): the original REFUSES the peek
 * (1) crouched in water deeper than ~4.5 -- 4.406 allowed, 4.606 refused (the side ray r0004 0x59c800 / r0001
 * `FUN_00596d60`; L107's 4.5); (2) through a ladder mount and climb (the capture did not separate them: both pinned);
 * (3) on every airborne frame; (4) while placing a claymore (the action-start gate r0004 0x5ba680 / r0001
 * `FUN_005b4340`). The port refused (2)-(4) before this task and peeked in deep water; all four are pinned here so a
 * later change cannot lose them. Simulation track; synthetic geometry.
 */

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };

const quad = (pts: number[], ditype: number, appflags = 0, path = 'worldmodel/q', material = 25): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number, material = 25, path = 'worldmodel/q'): WorldPoly =>
  quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], 3, 0, path, material);

function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** A body on open ground (and in water `water` deep, material 11), settled in `stance`. */
function onGround(water: number | null, stance: 'stand' | 'crouch'): { w: Walker; t: Traversal } {
  const polys = [floor(-150, -150, 150, 150, 0)];
  if (water !== null) polys.push(floor(-150, -150, 150, 150, water, 11, 'worldmodel/water'));
  const grid = world(polys);
  const w = new Walker(grid), t = new Traversal(grid, polys);
  w.driver = t;
  w.place(0, 1, 0); w.settle(); w.state.yaw = 0;
  if (stance === 'crouch') w.stance = 'crouch';
  for (let i = 0; i < 90; i++) w.tick(STILL);
  return { w, t };
}

/** Pressed to the right and held `ticks`: how many of them held a peek. */
function peekTicks(w: Walker, t: Traversal, ticks: number, each: () => void = () => undefined): number {
  t.lean(1);
  let n = 0;
  for (let i = 0; i < ticks; i++) { each(); w.tick(STILL); if (t.peeking() !== 0) n++; }
  t.lean(0);
  return n;
}

describe('R4P-108: the peek is refused where r0004 refuses it (Q108-PC2)', () => {
  it('crouched in water 4.4 deep the peek is taken (the capture\'s 4.406 allowed)', () => {
    const { w, t } = onGround(4.4, 'crouch');
    expect(t.depth()).toBeCloseTo(4.4, 6);
    expect(w.posture).toBe('crouch');
    expect(peekTicks(w, t, 20)).toBeGreaterThan(0);
  });

  it('crouched in water 4.6 deep the peek is refused (the capture\'s 4.606 refused)', () => {
    const { w, t } = onGround(4.6, 'crouch');
    expect(t.depth()).toBeCloseTo(4.6, 6);
    expect(w.posture).toBe('crouch');
    expect(peekTicks(w, t, 20)).toBe(0);
  });

  // The review's F3 (r0004 0x59c840-0x59c88c): the refusal is strict and crouched only -- so 4.5 itself is taken, and a
  // STANDING peek is taken at any depth (without this pin a later all-stances refusal would pass every case).
  it('crouched in water exactly 4.5 deep the peek is taken (strict: refused only deeper)', () => {
    const { w, t } = onGround(4.5, 'crouch');
    expect(t.depth()).toBeCloseTo(4.5, 6);
    expect(peekTicks(w, t, 20)).toBeGreaterThan(0);
  });

  it('STANDING in water 4.6 deep the peek is taken (the water test reads crouched only)', () => {
    const { w, t } = onGround(4.6, 'stand');
    expect(t.depth()).toBeCloseTo(4.6, 6);
    expect(w.posture).toBe('stand');
    expect(peekTicks(w, t, 20)).toBeGreaterThan(0);
  });

  it('crouched and peeking, deeper water than 4.5 under the body ends the peek (the side ray is asked every frame)', () => {
    // two pools on one floor: 4.4 deep for x < 0, 4.7 deep for x > 0; the peeking body is carried across between ticks
    const polys = [floor(-150, -150, 150, 150, 0), floor(-150, -150, 0, 150, 4.4, 11, 'worldmodel/water'),
      floor(0, -150, 150, 150, 4.7, 11, 'worldmodel/water')];
    const grid = world(polys);
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    w.place(-50, 1, 0); w.settle(); w.state.yaw = 0; w.stance = 'crouch';
    for (let i = 0; i < 90; i++) w.tick(STILL);
    t.lean(1);
    for (let i = 0; i < 10; i++) w.tick(STILL);
    expect(t.depth()).toBeCloseTo(4.4, 6);
    expect(t.peeking()).toBe(1);
    w.state.x = 50;                                               // into the 4.7 pool
    for (let i = 0; i < 3; i++) w.tick(STILL);
    expect(t.depth()).toBeCloseTo(4.7, 6);
    expect(t.peeking()).toBe(0);
  });

  it('on every airborne frame the peek is refused', () => {
    const { w, t } = onGround(null, 'stand');
    for (let i = 0; i < 30; i++) w.tick(FORWARD);                 // a running jump: a standing one never leaves the floor
    expect(w.jump()).toBe(true);
    let air = 0, peeked = 0;
    t.lean(1);
    for (let i = 0; i < 60; i++) { w.tick(FORWARD); if (w.airborne) { air++; if (t.peeking() !== 0) peeked++; } }
    expect(air).toBeGreaterThan(0);
    expect(peeked).toBe(0);
  });

  it('while placing a claymore the peek is refused', () => {
    const { w, t } = onGround(null, 'crouch');
    expect(w.hold('seal_place_claymore')).toBe(true);
    let placing = 0, peeked = 0;
    t.lean(1);
    for (let i = 0; i < 40; i++) { w.tick(STILL); if (w.holding !== null) { placing++; if (t.peeking() !== 0) peeked++; } }
    expect(placing).toBeGreaterThan(0);
    expect(peeked).toBe(0);
  });

  it('through a ladder mount and the climb the peek is refused', () => {
    const polys = [
      floor(-100, 0, 100, 100, 0), floor(-100, -100, 100, 0, 40),
      quad([-100, 0, 0, 100, 0, 0, 100, 40, 0, -100, 40, 0], 2),
      quad([-3, 0, 0.2, 3, 0, 0.2, 3, 40, 0.2, -3, 40, 0.2], 2, 2, 'worldmodel/lad/ladder'),
      quad([3, 40, 0.2, -3, 40, 0.2, -3, 50, 0.2, 3, 50, 0.2], 2, 2, 'worldmodel/lad/ladder'),
    ];
    const grid = world(polys);
    expect(findLadders(polys, grid)).toHaveLength(1);
    const w = new Walker(grid), t = new Traversal(grid, polys);
    w.driver = t;
    w.place(0, 10, 20); w.state.yaw = 0;
    for (let i = 0; i < 400 && t.climbPrompt()?.kind !== 'ladder'; i++) w.tick(FORWARD);
    expect(t.climbPrompt()?.kind).toBe('ladder');
    t.action();
    w.tick(STILL);                                                // the press's tick: the mount begins
    expect(t.state().kind).toBe('ladderMount');
    let mount = 0, climb = 0, peeked = 0;
    t.lean(1);                                                    // the peek pressed through the mount and held up the climb
    for (let i = 0; i < 240; i++) {
      w.tick(i < 120 ? STILL : FORWARD);
      const k = t.state().kind;
      if (k === 'ladderMount' || k === 'ladderMountTop') mount++;
      if (k === 'ladder') climb++;
      if ((k === 'ladderMount' || k === 'ladderMountTop' || k === 'ladder') && t.peeking() !== 0) peeked++;
    }
    expect(mount).toBeGreaterThan(0);
    expect(climb).toBeGreaterThan(0);
    expect(peeked).toBe(0);
  });
});
