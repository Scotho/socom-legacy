import { describe, expect, it } from 'vitest';
import { buildGrid, polygonNormal, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { cameraClassClear, Walker, type WalkInput } from '../src/mover';
import { Traversal } from '../src/traversal';

/**
 * INV-WATER-CROUCH (seat b6, 2026-11-07; `agent-mail/evidence/water-crouch/REPORT.md`): a crouched SEAL in water 7.5-8.5
 * deep could neither stand nor crouch-run, because the stand's camera-class cast (`FUN_0057efe0`, D:L441190-441245:
 * the idle crouch hips + 2 to the feet + 19, through `FUN_0031e1d0` -> `FUN_002d4780` -> `FUN_002d2890`) took the
 * up-facing water from below as a ceiling. The original's per-collider test is one-sided on the hull: `FUN_002d2890`
 * starts it in side mode 0x20 when the collider's `+0x80` bit 1 is clear (D:L174831-174837), and the hull's colliders
 * (`FUN_00316e30`) clear it (D:L215827-215828) -- research 281 s4.3, LATER 250. So a face is hit only entered from its
 * front: up-facing water passes the up-ray, a down-facing ceiling still stops it. Synthetic geometry; reading, pending
 * review -- not a capture of the original running.
 */

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const quad = (pts: number[], material: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype: 3, material, ptcount: 4, cameratype: 0, appflags: 0, points: Float32Array.from(pts),
});
/** A level quad at `y`, wound so its own normal (`polygonNormal`, the hull's sign, research 281 s4.3) points `face`. */
function level(y: number, face: 'up' | 'down', material: number, path: string): WorldPoly {
  const down = [-100, y, -100, 100, y, -100, 100, y, 100, -100, y, 100];
  const up = [-100, y, 100, 100, y, 100, 100, y, -100, -100, y, -100];
  const p = quad(face === 'up' ? up : down, material, path);
  expect(Math.sign(polygonNormal(p.points)![1])).toBe(face === 'up' ? 1 : -1);
  return p;
}
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** A SEAL settled crouched on a floor at 0 with `over` above it (water at its depth, or a roof). */
function crouched(over: WorldPoly[]): { w: Walker; grid: Grid } {
  const polys = [level(0, 'up', 25, 'worldmodel/floor'), ...over];
  const grid = world(polys);
  const w = new Walker(grid);
  w.driver = new Traversal(grid, polys);
  expect(w.place(0, 5, 0)).toBe(true);
  for (let i = 0; i < 30; i++) w.tick(STILL);
  w.stance = 'crouch';
  w.tick(STILL);
  expect(w.stance).toBe('crouch');
  return { w, grid };
}

describe('INV-WATER-CROUCH: the stand and crouch-run casts are one-sided (FUN_002d2890 side mode 0x20)', () => {
  it('crouched in a pool 8 deep, wound up like real water: the stand press is taken', () => {
    const { w } = crouched([level(8, 'up', 11, 'worldmodel/water')]);
    expect(w.headroom('stand')).toBe(true);
    w.changeStance('stand');
    for (let i = 0; i < 40; i++) w.tick(STILL);
    expect(w.stance).toBe('stand');
  });

  it('crouched in a pool 8 deep: a full stick runs upright (the crouch run), not the crouch walk', () => {
    const { w } = crouched([level(8, 'up', 11, 'worldmodel/water')]);
    for (let i = 0; i < 30; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.stance).toBe('crouch');
    expect(w.posture).toBe('stand');
    expect(w.ground.state).toBe('stand');
  });

  it('a ceiling wound down over the crouched head still refuses the stand and the crouch run', () => {
    const { w } = crouched([level(15, 'down', 25, 'worldmodel/roof')]);
    expect(w.headroom('stand')).toBe(false);
    w.changeStance('stand');
    for (let i = 0; i < 40; i++) w.tick(STILL);
    expect(w.stance).toBe('crouch');
    for (let i = 0; i < 30; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.posture).toBe('crouch');
  });

  it('cameraClassClear: the up-ray passes an up-facing face and stops at a down-facing one', () => {
    const grid = world([level(10, 'up', 25, 'worldmodel/a'), level(10, 'down', 25, 'worldmodel/b')]);
    const only = (face: 'up' | 'down') => world([level(10, face, 25, `worldmodel/${face}`)]);
    expect(cameraClassClear(only('up'), [0, 5, 0], [0, 19, 0])).toBe(true);
    expect(cameraClassClear(only('down'), [0, 5, 0], [0, 19, 0])).toBe(false);
    expect(cameraClassClear(grid, [0, 5, 0], [0, 19, 0])).toBe(false);
    // From above, down the line, the up-facing face is entered from its front.
    expect(cameraClassClear(only('up'), [0, 19, 0], [0, 5, 0])).toBe(false);
  });
});
