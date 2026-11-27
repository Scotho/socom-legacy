import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { buildGrid, DEFAULT_RIFLE, GAME_FRAME_DT, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Fire, type FireAim } from '../src/fire';
import { MarkClipper } from '../src/markClip';

/**
 * WM-20 (the owner's IMG_8928: bullet marks hanging in the air by Frostfire's pipe; research 431; reading, pending
 * review). The round stops on the COLLISION set and the mark is clipped to the DRAWN world within 4.8 of its plane.
 * The original takes a pool entry and draws a triangle only for each drawn triangle its clip keeps: `FUN_003b3ab0`
 * calls `FUN_003b3800` inside the kept branch only (D:L306632-306662), `FUN_003b8680` flushes only `if (iVar11 != 0)`
 * (D:L309591-309593), and `FUN_003139e0` (D:L213891-213949) has no other draw. So where a collision hull stands more
 * than 4.8 off its drawn mesh the original shows NO mark; the page drew the bare square (`squareInto`) and charged it
 * to the pool. `MARK_LATE_REVEAL_ADAPTATION` keeps the page's own case honest: while the dev viewer is still revealing
 * the world over frames (`MarkClipper.worldWhole` false), a mark with nothing under it waits hidden and is clipped
 * again; once the world is whole it is dropped.
 */

type V3 = [number, number, number];

/** One drawn quad (CCW from the front, +z facing), its colour grey `v`. */
function drawnQuad(corners: V3[], v: number): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(Float32Array.from(corners.flat()), 3));
  g.setAttribute('color', new BufferAttribute(Float32Array.from(corners.flatMap(() => [v, v, v, 1])), 4));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return new Mesh(g, new MeshBasicMaterial());
}

/** The collision wall the round stops on: a quad at z = -30, facing the shooter at z = 0. */
function grid(): Grid {
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/q0', first: 0, count: 1 }];
  return buildGrid(params, [], [], [poly], owners);
}
const aim = (): FireAim => ({ eye: [0, 20, 0], far: [0, 20, -1000] });

/** A drawn wall `behind` units behind the collision face (the hull larger than its drawn mesh). */
const wallBehind = (behind: number): Mesh =>
  drawnQuad([[-50, 0, -30 - behind], [50, 0, -30 - behind], [50, 50, -30 - behind], [-50, 50, -30 - behind]], 0.3);

function rig(root: Group): { fire: Fire; clipper: MarkClipper } {
  root.updateMatrixWorld(true);
  const g = grid();
  const fire = new Fire({ grid: () => g, aim }, { ...DEFAULT_RIFLE, magazine: 200 }, undefined, () => 0.5);
  const clipper = new MarkClipper(root);
  fire.setClip(clipper);
  return { fire, clipper };
}

/** Whole game frames past the rifle's wait, so the next `shoot` goes (LATER 326). */
const frames = (fire: Fire, n = 1): void => {
  for (let i = 0; i < n; i++) fire.update(Math.ceil(DEFAULT_RIFLE.fireWait / GAME_FRAME_DT - 1e-9) * GAME_FRAME_DT + 1e-6);
};

describe('a mark whose clip keeps no drawn triangle draws nothing (FUN_003b3ab0 D:L306632-306662; WM-20)', () => {
  it('the world whole, the drawn wall 6 units behind the collision face: no mark, then or later, no pool room', () => {
    const root = new Group();
    root.add(wallBehind(6));                              // past the 4.8 test (D:L306632-306635): nothing kept
    const { fire } = rig(root);
    expect(fire.shoot()).not.toBeNull();
    expect(fire.state().lastHit).not.toBeNull();          // the round did stop on the collision wall
    const mark = fire.decalMeshes()[0];
    expect(mark?.visible ?? false, 'the bare square drawn in the air').toBe(false);
    expect(fire.state().decals).toBe(0);
    frames(fire, 10);                                     // the late clip finds nothing more and draws nothing
    expect(fire.decalMeshes().filter((m) => m.visible).length).toBe(0);
    expect(fire.state().decals).toBe(0);
  });

  it('the drawn wall 4 units behind (within 4.8): the mark is clipped onto the drawn wall', () => {
    const root = new Group();
    root.add(wallBehind(4));
    const { fire } = rig(root);
    fire.shoot();
    const mark = fire.decalMeshes()[0]!;
    expect(mark.visible).toBe(true);
    expect(fire.state().lastShade![0]).toBeCloseTo(0.3, 5);
    const p = mark.geometry.getAttribute('position');
    const index = mark.geometry.getIndex()!;
    const end = Math.min(mark.geometry.drawRange.start + mark.geometry.drawRange.count, index.count);
    expect(end - mark.geometry.drawRange.start).toBeGreaterThan(0);
    for (let i = mark.geometry.drawRange.start; i < end; i++) expect(p.getZ(index.getX(i))).toBeLessThan(-33.9);   // on the drawn wall, lifted
  });

  it('a mark with nothing kept takes no room in the temporary pool: 75 two-triangle marks still all stand', () => {
    const root = new Group();
    // The drawn wall covers x < 0 only; the collision wall all of it. Rounds alternate onto drawn and undrawn halves.
    root.add(drawnQuad([[-50, 0, -30], [0, 0, -30], [0, 50, -30], [-50, 50, -30]], 0.3));
    root.updateMatrixWorld(true);
    const g = grid();
    let x = 0;
    const fire = new Fire({ grid: () => g, aim: () => ({ eye: [x, 20, 0], far: [x, 20, -1000] }) }, { ...DEFAULT_RIFLE, magazine: 400 }, undefined, () => 0.5);
    fire.setClip(new MarkClipper(root));
    for (let i = 0; i < 150; i++) {
      x = i % 2 === 0 ? -25 : 25;                         // even: on the drawn half; odd: nothing drawn
      expect(fire.shoot()).not.toBeNull();
      frames(fire);
    }
    // The 75 drawn marks stand (each keeps about one world triangle of the half, so the pool is not filled); the 75
    // undrawn take no room. Before the fix each bare square was charged 2 and stood too: 100 marks (the RED).
    expect(fire.state().decals).toBe(75);
  });

  it('a mark with nothing kept takes no slot of the ring either: 150 one-triangle marks stand through 10 rounds into nothing', () => {
    // The second read's finding 3 (8f's seat, 2026-11-15): the ring's slot was taken before the clip was known, so with
    // MAX_DECALS (150) marks standing a round that keeps nothing recycled -- hid -- the oldest drawn one. The original
    // takes no entry for it (FUN_003b3ab0), so all 150 stay.
    const root = new Group();
    // One drawn triangle over the left half (x < 0), its corners far from the hits: each mark there keeps that one.
    const tri = new BufferGeometry();
    tri.setAttribute('position', new BufferAttribute(Float32Array.from([-200, -100, -30, -5, -100, -30, -5, 200, -30]), 3));
    tri.setAttribute('color', new BufferAttribute(Float32Array.from([0.3, 0.3, 0.3, 1, 0.3, 0.3, 0.3, 1, 0.3, 0.3, 0.3, 1]), 4));
    tri.setIndex([0, 1, 2]);
    root.add(new Mesh(tri, new MeshBasicMaterial()));
    root.updateMatrixWorld(true);
    const g = grid();
    let x = -25;
    const fire = new Fire({ grid: () => g, aim: () => ({ eye: [x, 20, 0], far: [x, 20, -1000] }) }, { ...DEFAULT_RIFLE, magazine: 400 }, undefined, () => 0.5);
    fire.setClip(new MarkClipper(root));
    for (let i = 0; i < 150; i++) { expect(fire.shoot()).not.toBeNull(); frames(fire); }
    expect(fire.state().decals, '150 one-triangle marks: the ring and the pool both full').toBe(150);
    x = 25;                                               // the collision wall with nothing drawn within 4.8
    for (let i = 0; i < 10; i++) { expect(fire.shoot()).not.toBeNull(); frames(fire); }
    expect(fire.state().decals, 'no drawn mark recycled for a mark that keeps nothing').toBe(150);
  });
});

describe('MARK_LATE_REVEAL_ADAPTATION: the dev viewer still revealing its world (no original: the level loads whole)', () => {
  it('a mark before its wall is revealed waits hidden, and is clipped once the wall is drawn', () => {
    const root = new Group();
    const wall = wallBehind(0);
    wall.visible = false;                                 // not revealed yet
    root.add(wall);
    const { fire, clipper } = rig(root);
    clipper.worldWhole = false;
    fire.shoot();
    expect((fire.decalMeshes()[0]?.visible ?? false), 'no bare square while the wall is still to come').toBe(false);
    expect(fire.state().decals).toBe(0);
    wall.visible = true;                                  // the reveal reaches it
    frames(fire);
    const mark = fire.decalMeshes()[0]!;
    expect(mark.visible).toBe(true);
    expect(fire.state().decals).toBe(1);
  });

  it('a waiting mark the whole world never drew under is dropped once the reveal ends', () => {
    const root = new Group();
    root.add(wallBehind(6));
    const { fire, clipper } = rig(root);
    clipper.worldWhole = false;
    fire.shoot();
    expect(fire.decalMeshes()[0]?.visible ?? false).toBe(false);
    clipper.worldWhole = true;                            // the reveal is done; still nothing within 4.8
    frames(fire, 10);
    expect(fire.decalMeshes()[0]?.visible ?? false).toBe(false);
    expect(fire.state().decals).toBe(0);
  });
});

describe('the test hook reads the last clip\'s kept count (`FireState.lastKept`; a test instrument, no original)', () => {
  // G1 (marksPipe.spec on PC 3, 2026-11-15T19:08Z): the spec read `lastShade === null` as "the clip kept nothing", but a
  // clip that keeps triangles with none under the square's centre (`MarkClipper.centreFound` false) also leaves
  // `lastShade` null -- and draws its mark, as the original does (FUN_003b3ab0's kept branch, D:L306632-306662). The
  // spec now reads the kept count itself.
  it('nothing kept: lastKept 0 and no mark', () => {
    const root = new Group();
    root.add(wallBehind(6));
    const { fire } = rig(root);
    fire.shoot();
    expect(fire.state().lastKept).toBe(0);
    expect(fire.state().decals).toBe(0);
  });

  it('kept off the centre: the mark is drawn, lastShade null, lastKept above 0', () => {
    const root = new Group();
    // The drawn wall on the collision face's plane, stopping 0.3 short of the hit (x = 0): the square (1-1.8 a side)
    // overlaps it, its centre does not.
    root.add(drawnQuad([[-50, 0, -30], [-0.3, 0, -30], [-0.3, 50, -30], [-50, 50, -30]], 0.3));
    const { fire } = rig(root);
    fire.shoot();
    const s = fire.state();
    expect(s.decals).toBe(1);
    expect(s.lastShade).toBeNull();
    expect(s.lastKept).toBeGreaterThan(0);
  });

  it('no clip asked (no clipper): lastKept null', () => {
    const g = grid();
    const fire = new Fire({ grid: () => g, aim }, { ...DEFAULT_RIFLE, magazine: 200 }, undefined, () => 0.5);
    fire.shoot();
    expect(fire.state().lastKept).toBeNull();
  });
});
