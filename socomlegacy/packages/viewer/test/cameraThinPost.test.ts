// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera, Vector3 } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import {
  buildGrid, isCameraSurface, segmentHit, segmentHits,
  type CollisionOwner, type Grid, type GridParams, type WorldPoly,
} from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { MAP_FOV } from '../src/accuracy';
import { loadMap } from '../src/loadMap';
import {
  CAM_FAR, CAM_MARGIN, GAME_ASPECT, INIT_AIM_PITCH, PlayerCamera, cameraPass, isPeekCameraSurface, localCamera,
  nearRectCorners, newPassState, toWorld, type Vec3,
} from '../src/playerCamera';
import { groundGrid, groundPolygons, Walker, type GroundData } from '../src/walk';
import { Traversal } from '../src/traversal';
import { STANCE } from '../src/mover';

/**
 * A thin post and a corner leave `FUN_0029bf70`'s eye outside the solid and still inside the near rectangle
 * (research 90 §10). The pass stays at its 0.75. The eye `PlayerCamera` draws does not.
 * The post is a box 4.7 by 1.3, the size of a Crossroads arcade jamb; it is not a disc mesh.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP72 = fixture('RUN/MP72.ZDB');
const STAND = STANCE.stand.rootY;

function quad(points: number[], path: string, ditype = 2): WorldPoly {
  return { modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) };
}
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 8, cellsZ: 8, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}#${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
const floor = quad([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200], 'floor', 3);

/** A post 4.7 wide and 1.3 thick, standing through the camera's height. */
function postPolys(): WorldPoly[] {
  const x0 = 0, x1 = 4.7, z0 = 0, z1 = 1.3, y0 = 0, y1 = 80;
  const f = (pts: number[], name: string) => quad(pts, name);
  return [
    f([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0], 'post-z0'),
    f([x0, y0, z1, x0, y1, z1, x1, y1, z1, x1, y0, z1], 'post-z1'),
    f([x0, y0, z0, x0, y1, z0, x0, y1, z1, x0, y0, z1], 'post-x0'),
    f([x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0], 'post-x1'),
  ];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? scale(a, 1 / l) : [0, 0, 0];
};

/** The target and the goal eye `PlayerCamera.tick` hands `cameraPass`, with no lead probe (rest pitch, any peek). */
function goal(feet: Vec3, yaw: number, pitch: number, peek: number): { target: Vec3; eye0: Vec3 } {
  const local = localCamera(STAND, pitch, peek);
  const targetL = local.target;
  const eyeL = add(targetL, scale(local.back, local.dist));
  const eye0 = toWorld(feet, yaw, eyeL);
  const far = toWorld(feet, yaw, add(targetL, scale(local.ahead, CAM_FAR)));
  return { eye0, target: add(eye0, scale(unit(sub(far, eye0)), local.dist)) };
}

function hitsNear(grid: Grid, eye: Vec3, target: Vec3, accept: (p: WorldPoly) => boolean, aspect = 16 / 9): boolean {
  const corners = nearRectCorners(eye, target, aspect);
  if (!corners) return false;
  return corners.some((c) => {
    const h = segmentHit(grid, eye, c, accept);
    return h !== null && h.t > 0.001 && h.t < 0.999;
  });
}

function crosses(grid: Grid, target: Vec3, eye: Vec3, accept: (p: WorldPoly) => boolean): boolean {
  return segmentHits(grid, target, eye, accept).some((h) => h.t > 0.001 && h.t < 0.999);
}

function drawn(grid: Grid, feet: Vec3, yaw: number, pitch: number, peek = 0, aspect = 16 / 9): { eye: Vec3; target: Vec3 } {
  const cam = new PlayerCamera(grid);
  cam.peek = peek;
  cam.nearAspect = aspect;
  for (let i = 0; i < 6; i++) cam.tick(feet, yaw, pitch, STAND);
  const v = cam.view(1);
  return { eye: v.eye, target: v.target };
}

describe('a thin post and a corner (research 90 §10)', () => {
  const post = world([floor, ...postPolys()]);
  const corner = world([
    floor,
    quad([0, 0, 0, 0, 80, 0, 0, 80, 40, 0, 0, 40], 'wall-x'),
    quad([0, 0, 0, 40, 0, 0, 40, 80, 0, 0, 80, 0], 'wall-z'),
  ]);

  it('the pass leaves a near corner in a thin post the body is clear of; the drawn eye does not', () => {
    const feet: Vec3 = [-2, 0, -3.6];
    const g = goal(feet, 60, INIT_AIM_PITCH, 0);
    const passed = cameraPass(post, g.target, g.eye0, newPassState());
    expect(hitsNear(post, passed, g.target, isCameraSurface)).toBe(true);
    expect(crosses(post, g.target, passed, isCameraSurface)).toBe(false);
    const view = drawn(post, feet, 60, INIT_AIM_PITCH);
    expect(hitsNear(post, view.eye, view.target, isCameraSurface)).toBe(false);
    expect(crosses(post, view.target, view.eye, isCameraSurface)).toBe(false);
    expect(view.eye[2]).toBeLessThan(0);
  });

  it('a corner the boom has swung up to clips the near rectangle; the drawn eye is pushed off both walls', () => {
    const feet: Vec3 = [-3.6, 0, -3.6];
    const g = goal(feet, 15, INIT_AIM_PITCH, 0);
    const passed = cameraPass(corner, g.target, g.eye0, newPassState());
    expect(hitsNear(corner, passed, g.target, isCameraSurface)).toBe(true);
    const view = drawn(corner, feet, 15, INIT_AIM_PITCH);
    expect(hitsNear(corner, view.eye, view.target, isCameraSurface)).toBe(false);
    expect(crosses(corner, view.target, view.eye, isCameraSurface)).toBe(false);
    expect(view.eye[0]).toBeLessThan(-2);
    expect(view.eye[2]).toBeGreaterThan(8);
  });

  it('a full right peek whose side ray misses the post still draws the eye on the body\'s side of it', () => {
    const feet: Vec3 = [-3.6, 0, -3.6];
    const g = goal(feet, 300, INIT_AIM_PITCH, 1);
    const passed = cameraPass(post, g.target, g.eye0, newPassState(), 1 / 60, isPeekCameraSurface);
    expect(hitsNear(post, passed, g.target, isPeekCameraSurface)).toBe(true);
    const view = drawn(post, feet, 300, INIT_AIM_PITCH, 1);
    expect(hitsNear(post, view.eye, view.target, isPeekCameraSurface)).toBe(false);
    expect(view.eye[0]).toBeLessThan(0);
  });

  it('the 0.75 minimum would put the eye past a face the target is against; the drawn eye stays on the target\'s side', () => {
    const wall = world([floor, quad([-80, 0, 0, 80, 0, 0, 80, 80, 0, -80, 80, 0], 'wallz')]);
    const feet: Vec3 = [0, 0, -0.4];
    const g = goal(feet, 0, 0, 0);
    const passed = cameraPass(wall, g.target, g.eye0, newPassState());
    expect(passed[2]).toBeGreaterThan(0);
    expect(passed[2]).toBeCloseTo(-0.4 + CAM_MARGIN, 2);
    const view = drawn(wall, feet, 0, 0);
    expect(view.eye[2]).toBeLessThan(0);
    expect(hitsNear(wall, view.eye, view.target, isCameraSurface)).toBe(false);
    expect(crosses(wall, view.target, view.eye, isCameraSurface)).toBe(false);
  });

  it('a wall directly behind the player still stops the eye 0.75 short (research 90 §5)', () => {
    const wall = world([floor, quad([-50, 0, 10, 50, 0, 10, 50, 60, 10, -50, 60, 10], 'wallz')]);
    const view = drawn(wall, [0, 0, 0], 0, 0);
    expect(view.eye[0]).toBeCloseTo(0, 6);
    expect(view.eye[1]).toBeCloseTo(21.484, 3);
    expect(view.eye[2]).toBeCloseTo(10 - CAM_MARGIN, 6);
  });

  it('the near corners are the projection\'s, at m_near_plane 4 and vertical MAP_FOV, for 16:9, 21:9 and 32:9', () => {
    const view = drawn(post, [-2, 0, -3.6], 60, INIT_AIM_PITCH);
    const ndc = new Vector3();
    for (const aspect of [16 / 9, 21 / 9, 32 / 9]) {
      const mine = nearRectCorners(view.eye, view.target, aspect)!;
      const cam = new PerspectiveCamera((2 * MAP_FOV.vfov * 180) / Math.PI, aspect, 4, 1000);
      cam.position.set(view.eye[0], view.eye[1], view.eye[2]);
      cam.up.set(0, 1, 0);
      cam.lookAt(view.target[0], view.target[1], view.target[2]);
      cam.updateMatrixWorld(true);
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        ndc.set(x, y, -1).unproject(cam);
        const hit = mine.some((m) => Math.hypot(ndc.x - m[0], ndc.y - m[1], ndc.z - m[2]) < 0.02);
        expect(hit, `${aspect.toFixed(3)} ${ndc.x.toFixed(2)},${ndc.y.toFixed(2)},${ndc.z.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('a wall the 16:9 corners miss and the 21:9 corners cut is cleared only when the frame is that wide', () => {
    // Half-width at 16:9 is ≈ 3.24, at 21:9 ≈ 4.25, at 32:9 ≈ 6.48. The face at x = 3.8 is past the first.
    const wall = world([floor, quad([3.8, 0, 5, 3.8, 0, 60, 3.8, 80, 60, 3.8, 80, 5], 'wide')]);
    const feet: Vec3 = [0, 0, 0];
    const at = (aspect: number) => drawn(wall, feet, 0, INIT_AIM_PITCH, 0, aspect);
    const wide16 = at(16 / 9);
    const game = Math.tan(MAP_FOV.hfov) / Math.tan(MAP_FOV.vfov);
    const gameView = at(game);
    const square = at(1);
    expect(hitsNear(wall, wide16.eye, wide16.target, isCameraSurface, 16 / 9)).toBe(false);
    expect(hitsNear(wall, wide16.eye, wide16.target, isCameraSurface, 21 / 9)).toBe(true);
    expect(hitsNear(wall, wide16.eye, wide16.target, isCameraSurface, 32 / 9)).toBe(true);
    expect(gameView.eye[0]).toBeCloseTo(wide16.eye[0], 4);
    expect(gameView.eye[1]).toBeCloseTo(wide16.eye[1], 4);
    expect(gameView.eye[2]).toBeCloseTo(wide16.eye[2], 4);
    expect(square.eye[0]).toBeCloseTo(wide16.eye[0], 4);
    expect(square.eye[2]).toBeCloseTo(wide16.eye[2], 4);
    const a21 = at(21 / 9);
    expect(hitsNear(wall, a21.eye, a21.target, isCameraSurface, 21 / 9)).toBe(false);
    expect(a21.eye[0]).toBeLessThan(wide16.eye[0] - 0.4);
    const a32 = at(32 / 9);
    expect(hitsNear(wall, a32.eye, a32.target, isCameraSurface, 32 / 9)).toBe(false);
    expect(a32.eye[0]).toBeLessThan(a21.eye[0] - 0.4);
    expect(hitsNear(wall, a32.eye, a32.target, isCameraSurface, 16 / 9)).toBe(false);
  });
});

/**
 * Crossroads arcade, b1_wc05 (Dustin, 2026-10-23). The west leg's face is x = 1359.92; the walkable side is the
 * lesser x. The north leg's face is z = 1724.08; the walkable side is the lesser z. Floor y = 42.5.
 */
const WEST = 1359.92, NORTH = 1724.08, FLOOR_Y = 42.5;
const CROUCH = STANCE.crouch.rootY;

function drawnAt(grid: Grid, feet: Vec3, yaw: number, peek: number, root: number, aspect = 16 / 9): { eye: Vec3; target: Vec3 } {
  const cam = new PlayerCamera(grid);
  cam.peek = peek;
  cam.nearAspect = aspect;
  for (let i = 0; i < 8; i++) cam.tick(feet, yaw, INIT_AIM_PITCH, root);
  const v = cam.view(1);
  return { eye: v.eye, target: v.target };
}

/** A near corner or the target-to-eye segment meets the arcade leg. The floor in front of a downward look is not that cut. */
function legHit(grid: Grid, eye: Vec3, target: Vec3, accept: (p: WorldPoly) => boolean, leg: 'west' | 'north', aspect = 16 / 9): string | null {
  const onLeg = (point: Vec3, path: string): boolean => {
    if (path.includes('b1_wc05') || path.includes('b1_wc04')) return true;
    return leg === 'west' ? Math.abs(point[0] - WEST) < 0.35 : Math.abs(point[2] - NORTH) < 0.35;
  };
  const corners = nearRectCorners(eye, target, aspect) ?? [];
  for (const c of corners) {
    const h = segmentHit(grid, eye, c, accept);
    if (h && h.t > 0.001 && h.t < 0.999 && onLeg(h.point, h.poly.path)) return `${h.poly.path} @${h.t.toFixed(2)}`;
  }
  const cross = segmentHits(grid, target, eye, accept).find((h) => h.t > 0.001 && h.t < 0.999 && onLeg(h.point, h.poly.path));
  return cross ? `cross ${cross.poly.path}` : null;
}

/** The drawn eye and its look target stay on the walkable side, and the 16:9 near rectangle does not enter the leg. */
function expectClear(grid: Grid, feet: Vec3, yaw: number, peek: number, root: number, leg: 'west' | 'north'): void {
  const view = drawnAt(grid, feet, yaw, peek, root);
  const accept = peek !== 0 ? isPeekCameraSurface : isCameraSurface;
  if (leg === 'west') {
    expect(view.eye[0], `eye x yaw ${yaw} peek ${peek}`).toBeLessThan(WEST);
    expect(view.target[0], `target x yaw ${yaw} peek ${peek}`).toBeLessThan(WEST);
  } else {
    expect(view.eye[2], `eye z yaw ${yaw} peek ${peek}`).toBeLessThan(NORTH);
    expect(view.target[2], `target z yaw ${yaw} peek ${peek}`).toBeLessThan(NORTH);
  }
  expect(legHit(grid, view.eye, view.target, accept, leg), `leg yaw ${yaw} peek ${peek} root ${root} eye ${view.eye.map((n) => n.toFixed(2)).join(',')}`).toBeNull();
}

const STILL = { forward: 0, right: 0, boost: false };

describe.skipIf(!MP72)(`Crossroads arcade b1_wc05, MP72${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let grid: Grid;
  let ground: GroundData;
  beforeAll(async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP72.ZDB');
    ground = map.ground!;
    grid = groundGrid(ground);
  });

  it('a stand at the west leg, yaw 15, puts the pass\'s near rectangle through the wall; the drawn eye does not', () => {
    const feet: Vec3 = [1356.4, FLOOR_Y, 1800];
    const g = goal(feet, 15, INIT_AIM_PITCH, 0);
    const passed = cameraPass(grid, g.target, g.eye0, newPassState());
    expect(passed[0]).toBeCloseTo(1359.2, 1);
    expect(hitsNear(grid, passed, g.target, isCameraSurface)).toBe(true);
    expectClear(grid, feet, 15, 0, STAND, 'west');
  });

  it('the disc\'s no-peek cuts stay on the walkable side, stand and crouch', () => {
    const west: Vec3 = [1356.4, FLOOR_Y, 1800];
    const along: Vec3 = [1356.4, FLOOR_Y, 1760];
    const north: Vec3 = [1450, FLOOR_Y, 1720.6];
    for (const root of [STAND, CROUCH]) {
      for (const yaw of [15, 30]) expectClear(grid, west, yaw, 0, root, 'west');
      expectClear(grid, along, 15, 0, root, 'west');
      expectClear(grid, north, 285, 0, root, 'north');
    }
  });

  it("21:9 and 32:9 clear the west leg; H309 (\"no see through anywhere\"): the game's frame and 4:3 clear it too (NEAR_CLEARANCE_ADAPTATION)", () => {
    const feet: Vec3 = [1356.4, FLOOR_Y, 1800];
    const at16 = drawnAt(grid, feet, 15, 0, STAND);
    expect(legHit(grid, at16.eye, at16.target, isCameraSurface, 'west', 21 / 9)).not.toBeNull();
    expect(legHit(grid, at16.eye, at16.target, isCameraSurface, 'west', 32 / 9)).not.toBeNull();
    for (const aspect of [21 / 9, 32 / 9]) {
      const view = drawnAt(grid, feet, 15, 0, STAND, aspect);
      expect(view.eye[0], `aspect ${aspect}`).toBeLessThan(at16.eye[0]);
      expect(view.eye[0]).toBeLessThan(WEST);
      expect(legHit(grid, view.eye, view.target, isCameraSurface, 'west', aspect)).toBeNull();
    }
    // H309 (Craig, 2026-10-23: "no see through anywhere"): at the game's frame the pass's eye (x 1359.20 at this spot, the
    // original's own cut of the leg, a reading) is pushed off the leg too, and at 4:3 and square; the game's eye stays it.
    const pass = cameraPass(grid, goal(feet, 15, INIT_AIM_PITCH, 0).target, goal(feet, 15, INIT_AIM_PITCH, 0).eye0, newPassState());
    expect(pass[0]).toBeCloseTo(1359.2, 1);
    for (const aspect of [GAME_ASPECT, 984 / 640, 4 / 3, 1]) {
      const view = drawnAt(grid, feet, 15, 0, STAND, aspect);
      expect(view.eye[0], `aspect ${aspect}`).toBeLessThan(pass[0] - 0.1);       // a narrower rectangle needs less
      expect(view.eye[0]).toBeLessThan(WEST);
      expect(legHit(grid, view.eye, view.target, isCameraSurface, 'west', aspect), `aspect ${aspect}`).toBeNull();
    }
  });

  it('the disc\'s no-clip controls are not pulled through the wall', () => {
    const west = drawnAt(grid, [1356.4, FLOOR_Y, 1800], 0, 0, STAND);
    expect(west.eye[0]).toBeCloseTo(1356.4, 1);
    expect(west.eye[2]).toBeGreaterThan(1820);
    expect(legHit(grid, west.eye, west.target, isCameraSurface, 'west')).toBeNull();
    const north = drawnAt(grid, [1450, FLOOR_Y, 1720.6], 255, 0, STAND);
    expect(north.eye[2]).toBeLessThan(NORTH);
    expect(legHit(grid, north.eye, north.target, isCameraSurface, 'north')).toBeNull();
    const cam = new PlayerCamera(grid);
    for (let i = 0; i < 8; i++) cam.tick([1450, FLOOR_Y, 1720.6], 255, INIT_AIM_PITCH, STAND);
    expect(cam.distance()).toBeGreaterThan(20);
  });

  it('a peek held into either leg, stand and crouch, left and right, keeps the eye and the target on the walkable side', () => {
    const west: Vec3 = [1356.4, FLOOR_Y, 1800];
    const intoNorth: Vec3 = [1436, FLOOR_Y, 1708.2];
    const alongNorth: Vec3 = [1526, FLOOR_Y, 1720.6];
    for (const root of [STAND, CROUCH]) {
      for (const yaw of [0, 15, 30, 45, 330, 345]) expectClear(grid, west, yaw, 1, root, 'west');
      for (const yaw of [135, 150, 165, 180, 195, 210]) expectClear(grid, west, yaw, -1, root, 'west');
      // Facing the wall (yaw 270 looks +x) and leaning either way.
      expectClear(grid, west, 270, 1, root, 'west');
      expectClear(grid, west, 270, -1, root, 'west');
      expectClear(grid, intoNorth, 195, -1, root, 'north');
      expectClear(grid, alongNorth, 345, 1, root, 'north');
      // Facing the north wall (yaw 180 looks +z).
      expectClear(grid, [1450, FLOOR_Y, 1720.6], 180, 1, root, 'north');
      expectClear(grid, [1450, FLOOR_Y, 1720.6], 180, -1, root, 'north');
    }
  });

  it("at the game's frame (H309) a held peek turned into the wall still leaves the drawn eye and target on the walkable side", () => {
    // The side ray every held frame (FUN_00594cf0 D:L453432-453457) ends such a lean in the game; the drawn camera's
    // pull-backs (HEAD_EYE_WALL_BACK_PLACEHOLDER) and the near clearance keep it off the wall at every aspect meanwhile.
    for (const root of [STAND, CROUCH]) {
      for (const peek of [1, -1] as const) {
        const cam = new PlayerCamera(grid);
        cam.peek = peek;
        for (const yaw of [180, 135, 90, 45, 15, 0, 345, 330]) {
          cam.tick([1356.4, FLOOR_Y, 1800], yaw, INIT_AIM_PITCH, root);
          const v = cam.view(1);
          expect(v.eye[0], `west yaw ${yaw} peek ${peek}`).toBeLessThan(WEST);
          expect(v.target[0]).toBeLessThan(WEST);
          expect(legHit(grid, v.eye, v.target, isPeekCameraSurface, 'west', GAME_ASPECT), `west yaw ${yaw}`).toBeNull();
        }
      }
    }
  });

  it('turning while a peek is held does not carry the eye through the wall', () => {
    for (const root of [STAND, CROUCH]) {
      for (const peek of [1, -1] as const) {
        const cam = new PlayerCamera(grid);
        cam.peek = peek;
        cam.nearAspect = 16 / 9;                                         // the disc check's window (wider than the game's frame)
        const feet: Vec3 = [1356.4, FLOOR_Y, 1800];
        for (const yaw of [180, 135, 90, 45, 15, 0, 345, 330]) {
          cam.tick(feet, yaw, INIT_AIM_PITCH, root);
          const v = cam.view(1);
          expect(v.eye[0], `west yaw ${yaw} peek ${peek}`).toBeLessThan(WEST);
          expect(v.target[0]).toBeLessThan(WEST);
          expect(legHit(grid, v.eye, v.target, isPeekCameraSurface, 'west'), `west yaw ${yaw}`).toBeNull();
        }
        const north = new PlayerCamera(grid);
        north.peek = peek;
        north.nearAspect = 16 / 9;
        const at: Vec3 = [1450, FLOOR_Y, 1720.6];
        for (const yaw of [0, 45, 90, 180, 255, 285, 345]) {
          north.tick(at, yaw, INIT_AIM_PITCH, root);
          const v = north.view(1);
          expect(v.eye[2], `north yaw ${yaw} peek ${peek}`).toBeLessThan(NORTH);
          expect(v.target[2]).toBeLessThan(NORTH);
          expect(legHit(grid, v.eye, v.target, isPeekCameraSurface, 'north'), `north yaw ${yaw}`).toBeNull();
        }
      }
    }
  });

  it('a lean started flush against the wall is refused, and a lean already held ends when the turn puts the side ray in the wall', () => {
    const polys = groundPolygons(ground);
    for (const stance of ['stand', 'crouch'] as const) {
      const w = new Walker(grid);
      const t = new Traversal(grid, polys);
      w.driver = t;
      expect(w.place(1356.4, 80, 1800)).toBe(true);
      w.stance = stance;
      w.state.yaw = 0;                                             // right is +x, into the west leg
      t.lean(1);
      w.tick(STILL);
      expect(t.peeking(), `${stance} flush right`).toBe(0);
      t.lean(-1);                                                  // left is clear
      w.tick(STILL);
      expect(t.peeking(), `${stance} flush left, wall on the right`).toBe(-1);
      w.state.yaw = 180;                                           // left is now +x, into the wall
      w.tick(STILL);
      expect(t.peeking(), `${stance} turn while held`).toBe(0);

      const n = new Walker(grid);
      const tn = new Traversal(grid, polys);
      n.driver = tn;
      expect(n.place(1450, 80, 1720.6)).toBe(true);
      n.stance = stance;
      n.state.yaw = 180;                                           // facing +z; right is -x, along the north leg
      tn.lean(1);
      n.tick(STILL);
      expect(tn.peeking(), `${stance} facing the north leg`).toBe(1);
      n.state.yaw = 270;                                           // right is +z, into the north leg
      n.tick(STILL);
      expect(tn.peeking(), `${stance} turn the held right lean into the north leg`).toBe(0);
    }
  });
});
