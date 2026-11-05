// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { segmentHit, type CollisionOwner, type Grid, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { headEye, scopeEye, toWorld, type Vec3 } from '../src/cameraRig';
import { isCameraClassSurface, rootY } from '../src/mover';
import { HEAD_VIEW_NEAR_ADAPTATION, HEAD_VIEW_NEAR_MIN, nearRectCorners } from '../src/playerCamera';
import { simMapFromBytes } from '../src/simMap';
import { packGround, TICK, WalkMode, type GroundData, type Stance } from '../src/walk';

/**
 * OBF-1 (OBF.R1, Craig 2026-10-30; Trello TUz6s1uo, Frostfire by the yellow catwalk and the tank): no seeing or shooting
 * through a wall from first person or the zoom. The view from the head (`FUN_0029ae50`, `scopeEye`: 2.5 ahead of the
 * skeleton root standing and crouched) stands 1.0 off a wall the body is pressed to (`BODY_RADIUS` 3.5), and `headEye`
 * may keep it as close as 0.1 -- inside the map's near plane, `m_near_plane` 4 (research 90 §5): the frame cut the wall
 * away and drew the room behind it. That is the drawn half; the shot's start (`fireAim`, the head's eye) was already on
 * the body's side, and the eye's ray meets the wall. The fix is the projection only (`HEAD_VIEW_NEAR_ADAPTATION`, H309's
 * "no see through anywhere" on the head view): the near plane is drawn in short of the wall; the eye -- the shot's, the
 * perception's and the listener's (`WalkMode.fireAim`, the drawn camera's position) -- does not move.
 */

/** The map's `m_near_plane` (research 90 §5): the plane `nearRectCorners` lays its rectangle on. */
const MAP_NEAR = 4;

const ASPECT = 16 / 9;

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}
function wallX(x: number, z0: number, z1: number, y0: number, y1: number, path = 'worldmodel/wall'): WorldPoly {
  return {
    modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0]),
  };
}
function wallZ(z: number, x0: number, x1: number, y0: number, y1: number, path = 'worldmodel/wallz'): WorldPoly {
  return {
    modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]),
  };
}
function ground(polys: WorldPoly[]): GroundData {
  return packGround(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    polys, polys.map((p, i): CollisionOwner => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 })),
  );
}

/** The yaw facing from (x, z) toward (tx, tz) (`camera.ts`: yaw 0 looks down -z). */
const facing = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z)) * 180 / Math.PI;

/**
 * A point of the DRAWN camera's near rectangle (its position, its look, the live aspect, its near plane: the corners
 * and the edge midpoints) on the far side of a camera face: the frame cuts that face away.
 */
function drawnNearCut(grid: Grid, fly: FlyCamera): string | null {
  fly.camera.updateMatrixWorld();
  const p = fly.camera.position, d = fly.camera.getWorldDirection(new Vector3());
  const eye: Vec3 = [p.x, p.y, p.z];
  const k = fly.camera.near / MAP_NEAR;
  const at4 = nearRectCorners(eye, [p.x + d.x, p.y + d.y, p.z + d.z], fly.aspect()) ?? [];
  const corners = at4.map((c): Vec3 => [eye[0] + (c[0] - eye[0]) * k, eye[1] + (c[1] - eye[1]) * k, eye[2] + (c[2] - eye[2]) * k]);
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  if (corners.length === 4) corners.push(mid(corners[0]!, corners[1]!), mid(corners[2]!, corners[3]!), mid(corners[0]!, corners[2]!), mid(corners[1]!, corners[3]!));
  for (const c of corners) {
    const h = segmentHit(grid, eye, c, isCameraClassSurface);
    if (h && h.t > 0.001 && h.t < 0.999) return `${h.poly.path} at t ${h.t.toFixed(3)} from eye ${eye.map((v) => v.toFixed(2)).join(',')}`;
  }
  return null;
}

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

function setUp(g: GroundData, spawn: Vec3, grid?: Grid): { fly: FlyCamera; mode: WalkMode } {
  const fly = new FlyCamera(canvas());
  fly.setScale(0.1);
  fly.setAspect(ASPECT);
  const mode = new WalkMode(fly, () => undefined);
  mode.setGround(g, spawn, grid ?? null);
  made.push(mode);
  return { fly, mode };
}

/** Walk into the wall facing `yaw`, then go to the head's view; the stand's numbers for the checks. */
function pressAndScope(fly: FlyCamera, mode: WalkMode, at: Vec3, yaw: number, stance: Stance, turn = 0): void {
  fly.setPose({ x: at[0], y: at[1] + 30, z: at[2], yaw, pitch: 0 });
  expect(mode.setMode('walk')).toBe(true);
  mode.setStance(stance);
  for (let t = 0; t < 2; t += TICK) mode.frame(TICK);
  mode.walkFor(4, { forward: 1, right: 0, boost: false });
  if (turn !== 0) fly.setPose({ yaw: yaw + turn });
  mode.walkFor(0.25, { forward: 0, right: 0, boost: false });
  mode.setScoped(true);
  mode.frame(TICK);
}

/** The head's eye as `follow` places it for the shot: `scopeEye` on the stance's root, kept off a wall by `headEye`. */
function headOf(mode: WalkMode, fly: FlyCamera, grid: Grid, stance: Stance): Vec3 {
  const feet = mode.feet()!;
  return headEye(grid, feet, toWorld(feet, fly.pose().yaw, scopeEye(stance, rootY(stance), 0)));
}

describe('OBF-1: the view from the head against a wall (synthetic)', () => {
  const polys = [floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 0, 60), wallZ(-60, -150, 50, 0, 60)];
  const g = ground(polys);

  it('is labelled the adaptation it is (H309 extended by OBF.R1)', () => {
    expect(HEAD_VIEW_NEAR_ADAPTATION).toBe('the head view, the projection near plane only');
  });

  for (const stance of ['stand', 'crouch'] as const) {
    for (const turn of [0, 35, -35]) {
      it(`${stance}, pressed to the wall, turned ${turn}: the drawn frame does not cut the wall; the shot's eye is the head's`, () => {
        const { fly, mode } = setUp(g, [20, 0, 0]);
        pressAndScope(fly, mode, [20, 0, 0], facing(20, 0, 100, 0), stance, turn);
        const grid = mode.grid()!;
        const feet = mode.feet()!;
        // Pressed: SEGMENT-BODY (re-judged; was BODY_RADIUS off) where its segments stop it -- the centre line, 5.39, x 1.75
        // crouch-walking (9.43); the head line takes the muzzle only prone (`HEAD_LINE_MUZZLE_READING`); plus a move.
        expect(feet[0]).toBeGreaterThan(50 - 10.5);
        expect(feet[0]).toBeLessThan(50 - 5.3);
        expect(drawnNearCut(grid, fly)).toBeNull();                // RED before the fix: the near plane (4) cut the wall
        expect(fly.camera.near).toBeGreaterThanOrEqual(HEAD_VIEW_NEAR_MIN);
        // The shot is unchanged: its eye is the head's (`follow`), on the body's side, and its ray meets the wall.
        const aim = mode.fireAim()!;
        const head = headOf(mode, fly, grid, stance);
        for (let k = 0; k < 3; k++) expect(aim.eye[k]).toBeCloseTo(head[k]!, 6);
        expect(aim.eye[0]).toBeLessThan(50);
        if (turn === 0) expect(segmentHit(grid, aim.eye, aim.far)?.poly.path.startsWith('worldmodel/wall')).toBe(true);
        // The game's camera (perception, listener) is the head's, wherever the frame is drawn from.
        const game = mode.gameCamera();
        const p = fly.camera.position;
        const gameEye = game ? game.eye : [p.x, p.y, p.z];
        for (let k = 0; k < 3; k++) expect(gameEye[k]).toBeCloseTo(aim.eye[k]!, 6);
        // And the drawn frame looks where the head looks (no yaw off the reticle).
        const d = fly.camera.getWorldDirection(new Vector3());
        const look = [aim.far[0] - aim.eye[0], aim.far[1] - aim.eye[1], aim.far[2] - aim.eye[2]];
        const l = Math.hypot(...look);
        expect(d.x * look[0]! / l + d.y * look[1]! / l + d.z * look[2]! / l).toBeGreaterThan(0.99999);
        // Back in third person the frame is the map's near plane again (the third-person camera untouched).
        mode.setScoped(false);
        mode.frame(TICK);
        expect(fly.camera.near).toBe(MAP_NEAR);
      });
    }
  }

  it('in the open nothing changes: the drawn head view is the head\'s eye at the map\'s near plane', () => {
    const { fly, mode } = setUp(g, [-100, 0, 100]);
    pressAndScope(fly, mode, [-100, 0, 100], 180, 'stand');        // walking away from both walls, into the open
    const aim = mode.fireAim()!;
    const p = fly.camera.position;
    expect([p.x, p.y, p.z].map((v, k) => Math.abs(v - aim.eye[k]!)).every((e) => e < 1e-9)).toBe(true);
    expect(mode.gameCamera()).toBeNull();
    expect(fly.camera.near).toBe(MAP_NEAR);                        // nothing inside the map's near rectangle: the map's plane
  });
});

describe('OBF-1: Frostfire, the big tanks under the yellow catwalk (MP2 disc collision)', () => {
  const bytes = fixture('RUN/MP2.ZDB');
  // `worldmodel/bigtank`'s two twelve-sided tanks (METAL_THICK, material 25), the catwalk (`catwalk_tanks`, the yellow
  // grate at y 155) between them: facets at x 612.6 (the south-west tank's east face, z 546.3-574.5) and x 667.6 (the
  // north-east tank's west face, z 386.0-414.3), the floor at y 100.
  const STANDS: { name: string; at: Vec3; to: [number, number] }[] = [
    { name: 'south-west tank, east facet', at: [630, 100, 560], to: [600, 560] },
    { name: 'north-east tank, west facet', at: [650, 100, 400], to: [700, 400] },
    { name: 'south-west tank, at the facet joint (z 546.3)', at: [630, 100, 546.3], to: [600, 546.3] },
  ];
  for (const s of STANDS) {
    for (const stance of ['stand', 'crouch'] as const) {
      it.skipIf(!bytes)(`${s.name}, ${stance}: the drawn head view does not cut the tank; the shot's eye is the head's${bytes ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
        const map = simMapFromBytes(bytes!, 'RUN/MP2.ZDB');
        const fails: string[] = [];
        for (const turn of [0, 30, -30, 60, -60]) {
          const { fly, mode } = setUp(map.ground, s.at, map.grid);
          pressAndScope(fly, mode, s.at, facing(s.at[0], s.at[2], s.to[0], s.to[1]), stance, turn);
          const grid = mode.grid()!;
          const cut = drawnNearCut(grid, fly);
          if (cut) fails.push(`turn ${turn}: ${cut}`);
          const aim = mode.fireAim()!;
          const head = headOf(mode, fly, grid, stance);
          for (let k = 0; k < 3; k++) expect(aim.eye[k]).toBeCloseTo(head[k]!, 6);
          if (turn === 0) expect(segmentHit(grid, aim.eye, aim.far)?.poly.path.startsWith('worldmodel/bigtank')).toBe(true);
          mode.unbindKey();
        }
        expect(fails, fails.join('\n')).toEqual([]);
      }, 120_000);
    }
  }
});
