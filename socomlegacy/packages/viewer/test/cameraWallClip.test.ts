import { describe, expect, it } from 'vitest';
import {
  buildGrid, isWallSurface, materialTable, polygonNormal, segmentHits, surfaceMaterial, type CollisionOwner, type Grid, type GridParams, type WorldPoly,
} from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  localCamera, nearRectCorners, lookHeight, pitchLimits, PlayerCamera, CAM_MARGIN, INIT_AIM_PITCH, type Vec3,
} from '../src/playerCamera';
import { simMapFromBytes } from '../src/simMap';
import { isCameraClassSurface, STANCE, wallProbeHeights, Walker } from '../src/mover';

/**
 * LATER 279: the third-person eye stays on the player's side of a camera wall (`FUN_0029bf70`,
 * `playerCamera.ts` `cameraPass`). A wall the probe is meant to stop on is `isCameraClassSurface` (bit 19 clear,
 * not VOLUMETRIC) and not a cameratype-1 face within 2.75 of the target (`FUN_0029cd20`). Disc maps skip when
 * the fixture is absent.
 */

const STAND = STANCE.stand.rootY;
const PRONE = STANCE.prone.rootY;
/** Fixed camera-stress offsets based on the class radius and the prone side probe (research 217 §2).
 * Camera stress positions only: the original body's direction-dependent reach is the body work's, not these. */
const STAND_CLEAR = STANCE.stand.probe.r;
const PRONE_BESIDE = STANCE.prone.probe.r * 0.39;
const TYPE_ONE_CLEAR = 2.75;

function quad(points: number[], path: string, cameratype = 0, material = 25): WorldPoly {
  return {
    modelName: 'worldmodel', path, region: 0, ditype: 2, material, ptcount: 4, cameratype,
    points: Float32Array.from(points),
  };
}

function world(polys: WorldPoly[], params?: Partial<GridParams>): Grid {
  const grid: GridParams = {
    atomCount: 8192, posts: 16, cellDim: 100, cellsX: 8, cellsZ: 8, originX: -400, originZ: -400, ...params,
  };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}#${i}`, first: i, count: 1 }));
  return buildGrid(grid, [], [], polys, owners);
}

const wallZ = (z: number, x0: number, x1: number, y0 = 0, y1 = 80, material = 25): WorldPoly =>
  quad([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], 'wallz', 0, material);
const wallX = (x: number, z0: number, z1: number, y0 = 0, y1 = 80): WorldPoly =>
  quad([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0], 'wallx');

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const dot = (a: Vec3, b: readonly number[]): number => a[0] * b[0]! + a[1] * b[1]! + a[2] * b[2]!;

/**
 * A centroid offset may land INSIDE a solid's thickness. At both standing probe heights, opposed outward faces
 * enclose the axis (the normal points away from it at both exits). This does not reject a narrow passage whose
 * faces point into the passage, or a body merely closer than 3.5 to one face. Research 382 §5.
 */
function embeddedStandingAnchor(grid: Grid, feet: Vec3, faceNormal: readonly number[], defaultMaterial = ''): boolean {
  const l = Math.hypot(faceNormal[0]!, faceNormal[2]!);
  if (l === 0) return false;
  const n: Vec3 = [faceNormal[0]! / l, 0, faceNormal[2]! / l];
  const solid = (p: WorldPoly): boolean => {
    const m = surfaceMaterial(p.material, defaultMaterial);
    return isWallSurface(p) && !m.volumetric && !m.liquid;
  };
  return [n, [-n[2], 0, n[0]] as Vec3].some((axis) => wallProbeHeights('stand').every((height) => {
    const p: Vec3 = [feet[0], feet[1] + height, feet[2]];
    const a = segmentHits(grid, p, add(p, scale(axis, STAND_CLEAR)), solid)[0];
    const b = segmentHits(grid, p, add(p, scale(axis, -STAND_CLEAR)), solid)[0];
    return a && b && a.t > 1e-4 && b.t > 1e-4 && dot(axis, a.normal) > .999 && dot(axis, b.normal) < -.999;
  }));
}

/** Yaw whose behind-direction (+local z, `toWorld`) is `back` on the ground. */
function yawToward(back: Vec3): number {
  return Math.atan2(back[0], back[2]) * 180 / Math.PI;
}

/**
 * A blocking crossing strictly before the eye: the eye has gone past a camera wall. A cameratype-1 face
 * within 2.75 of the target is the one `FUN_0029cd20` passes over, not a wall.
 */
function pastWall(grid: Grid, target: Vec3, eye: Vec3): { path: string; t: number } | null {
  for (const h of segmentHits(grid, target, eye, isCameraClassSurface)) {
    if (h.t >= 1 - 1e-4) continue;
    const nearTypeOne = h.poly.cameratype === 1 && len(sub(h.point, target)) <= TYPE_ONE_CLEAR;
    if (!nearTypeOne) return { path: h.poly.path, t: h.t };
  }
  return null;
}

function settle(cam: PlayerCamera, feet: Vec3, yaw: number, pitch: number, root: number, ticks = 3): void {
  for (let i = 0; i < ticks; i++) cam.tick(feet, yaw, pitch, root);
}

describe('the eye stays this side of a wall (LATER 279)', () => {
  it('standing against a wall, the eye stops 0.75 short of the face', () => {
    const grid = world([wallZ(0, -40, 40)]);
    const feet: Vec3 = [0, 0, -STAND_CLEAR];
    const cam = new PlayerCamera(grid);
    settle(cam, feet, yawToward([0, 0, 1]), 0, STAND, 8);
    const v = cam.view(1);
    expect(pastWall(grid, v.target, v.eye)).toBeNull();
    expect(v.eye[2]).toBeLessThan(0);
    expect(v.eye[2]).toBeCloseTo(-CAM_MARGIN, 3);
  });

  it('backing into a corner keeps the eye inside both planes', () => {
    const grid = world([wallZ(0, -5, 40), wallX(0, -5, 40)]);
    const feet: Vec3 = [STAND_CLEAR, 0, STAND_CLEAR];
    const cam = new PlayerCamera(grid);
    // Behind the actor is toward the corner (-x, -z).
    settle(cam, feet, yawToward([-1, 0, -1]), 0, STAND, 8);
    const v = cam.view(1);
    expect(pastWall(grid, v.target, v.eye), JSON.stringify(v.eye)).toBeNull();
    expect(v.eye[0]).toBeGreaterThan(0);
    expect(v.eye[2]).toBeGreaterThan(0);
  });

  it('prone beside a wall, and backed against one at the strafe stand-off, stays this side', () => {
    const beside = world([wallX(0, -40, 40)]);
    const feetBeside: Vec3 = [PRONE_BESIDE, 0, 10];
    const cam = new PlayerCamera(beside);
    settle(cam, feetBeside, yawToward([0, 0, 1]), 0, PRONE, 8);
    let v = cam.view(1);
    expect(pastWall(beside, v.target, v.eye)).toBeNull();
    expect(v.eye[0]).toBeGreaterThan(0);

    const behind = world([wallZ(0, -40, 40)]);
    const feetBack: Vec3 = [0, 0, -PRONE_BESIDE];
    const cam2 = new PlayerCamera(behind);
    settle(cam2, feetBack, yawToward([0, 0, 1]), INIT_AIM_PITCH, PRONE, 8);
    v = cam2.view(1);
    expect(pastWall(behind, v.target, v.eye), JSON.stringify(v.eye)).toBeNull();
    expect(v.eye[2]).toBeLessThan(0);
  });

  it('a step around a pillar does not draw the in-between eye through it', () => {
    // A square pillar. The actor slides across its face; the rendered eye is the blend of the two ticks.
    const pillar = [
      wallZ(-2, -2, 2), wallZ(2, -2, 2), wallX(-2, -2, 2), wallX(2, -2, 2),
    ];
    const grid = world(pillar);
    const cam = new PlayerCamera(grid);
    const yaw = yawToward([0, 0, 1]);
    const samples: Vec3[] = [];
    for (let x = -8; x <= 8; x += 1) {
      const prev = cam.view(1).eye;
      settle(cam, [x, 0, -STAND_CLEAR - 2], yaw, 0, STAND, 1);
      const cur = cam.view(1).eye;
      const mid: Vec3 = [(prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2, (prev[2] + cur[2]) / 2];
      const view = cam.view(0.5);
      samples.push(view.eye);
      expect(pastWall(grid, view.target, view.eye), `x ${x} eye ${view.eye}`).toBeNull();
      expect(pastWall(grid, view.target, mid), `x ${x} mid ${mid}`).toBeNull();
    }
    expect(samples.length).toBeGreaterThan(4);
  });

  it('a wall on a grid-cell boundary still stops the probe', () => {
    // cellDim 100, origin -400: a boundary at z = -200. The actor stands just inside the next cell.
    const z = -200;
    const grid = world([wallZ(z, -40, 40)], { cellDim: 100, cellsX: 8, cellsZ: 8, originX: -400, originZ: -400 });
    const feet: Vec3 = [0, 0, z - STAND_CLEAR];
    const cam = new PlayerCamera(grid);
    settle(cam, feet, yawToward([0, 0, 1]), 0, STAND, 4);
    const v = cam.view(1);
    expect(pastWall(grid, v.target, v.eye), JSON.stringify(v.eye)).toBeNull();
    expect(v.eye[2]).toBeLessThan(z);
  });

  it('two faces meeting at a seam, and a thin wall, still stop the eye', () => {
    const seam = world([
      wallZ(0, -40, 0),
      wallZ(0, 0, 40),
    ]);
    const cam = new PlayerCamera(seam);
    settle(cam, [0, 0, -STAND_CLEAR], yawToward([0, 0, 1]), 0, STAND, 4);
    expect(pastWall(seam, cam.view(1).target, cam.view(1).eye)).toBeNull();

    const thin = world([wallZ(0, -40, 40), wallZ(0.4, -40, 40)]);
    const cam2 = new PlayerCamera(thin);
    settle(cam2, [0, 0, -STAND_CLEAR], yawToward([0, 0, 1]), 0, STAND, 4);
    const v = cam2.view(1);
    expect(pastWall(thin, v.target, v.eye)).toBeNull();
    expect(v.eye[2]).toBeLessThan(0);
  });

  it('looking up at the aim limit, backed against a wall at the body stand-off, stays this side', () => {
    const grid = world([wallZ(0, -40, 40)]);
    const cam = new PlayerCamera(grid);
    const [, maxPitch] = pitchLimits('stand');
    settle(cam, [0, 0, -STAND_CLEAR], yawToward([0, 0, 1]), maxPitch, STAND, 8);
    const v = cam.view(1);
    expect(pastWall(grid, v.target, v.eye), JSON.stringify(v.eye)).toBeNull();
    expect(v.eye[2]).toBeLessThan(0);
  });

  it('a VOLUMETRIC face is looked through; a solid face behind it still stops the eye (FUN_002d2890, DAT_0044d758 = 1)', () => {
    const leafy = materialTable().findIndex((m) => m.name === 'LEAFY_TREE');
    expect(leafy).toBeGreaterThan(0);
    const bush = world([wallZ(10, -40, 40, 0, 80, leafy)]);
    const through = new PlayerCamera(bush);
    settle(through, [0, 0, 0], yawToward([0, 0, 1]), 0, STAND, 4);
    // The goal is 28.75 behind. A solid face at 10 would have left the eye at 9.25.
    expect(through.view(1).eye[2]).toBeGreaterThan(20);

    const both = world([wallZ(6, -40, 40, 0, 80, leafy), wallZ(10, -40, 40)]);
    const stopped = new PlayerCamera(both);
    settle(stopped, [0, 0, 0], yawToward([0, 0, 1]), 0, STAND, 4);
    const v = stopped.view(1);
    expect(v.eye[2]).toBeCloseTo(10 - CAM_MARGIN, 3);
    expect(v.eye[2]).toBeLessThan(10);

    // A peek puts the probes in the movement's mode (DAT_0044d758 = 0): the volume is a wall again.
    const peeking = new PlayerCamera(bush);
    peeking.peek = 1;
    settle(peeking, [0, 0, 0], yawToward([0, 0, 1]), 0, STAND, 4);
    expect(peeking.view(1).eye[2]).toBeLessThan(10);
  });

  it('the 0.75 minimum (a reading) places the eye past a face the target is already inside (research 180 §2.3)', () => {
    // Deliberately embedded camera target, beyond ordinary body contact. The formula is the original's:
    // D = max(0.75, |h - target| - 0.75), then the same 0.75 clamp. A hit 0.4 from the target puts the eye at 0.75.
    const grid = world([wallZ(0, -40, 40)]);
    const cam = new PlayerCamera(grid);
    settle(cam, [0, 0, -0.4], yawToward([0, 0, 1]), 0, STAND, 4);
    const v = cam.view(1);
    // The pass's eye (the game's, `aim`): the original's minimum puts it past the face.
    expect(v.aim.eye[2]).toBeCloseTo(0.35, 2);
    expect(pastWall(grid, v.aim.target, v.aim.eye)).not.toBeNull();
    // H309 ("no see through anywhere"): the drawn eye is stepped back to the target's side (NEAR_CLEARANCE_ADAPTATION).
    expect(v.eye[2]).toBeLessThan(0);
    expect(pastWall(grid, v.target, v.eye)).toBeNull();
  });
});

describe('rig values per stance (FUN_0029a950)', () => {
  it('stand, crouch and prone: distance, height, no shoulder offset at rest, peek shifts', () => {
    const rows = [
      { stance: 'stand' as const, root: STAND, height: 21.484 },
      { stance: 'crouch' as const, root: STANCE.crouch.rootY, height: 15.378 },
      { stance: 'prone' as const, root: PRONE, height: lookHeight(PRONE) },
    ];
    for (const row of rows) {
      const level = localCamera(row.root, 0, 0);
      expect(level.target[0], row.stance).toBe(0);
      expect(level.target[1], row.stance).toBeCloseTo(row.height, 3);
      expect(level.dist, row.stance).toBeCloseTo(28, 6);
      expect(level.eye[2], row.stance).toBeCloseTo(28, 3);
      const rest = localCamera(row.root, INIT_AIM_PITCH, 0);
      expect(rest.target[0], row.stance).toBe(0);
      expect(rest.dist, row.stance).toBeLessThan(28);
      expect(rest.dist, row.stance).toBeGreaterThan(14);
    }
    expect(localCamera(STAND, 0, 1).target[0]).toBeCloseTo(2.8, 6);
    expect(localCamera(STAND, 0, -1).target[0]).toBeCloseTo(-2.5, 6);
  });
});

/** A few tight spots named by the map's own hull, not a tuned coordinate. */
const SPOTS: { file: string; name: string; at: Vec3; note: string }[] = [
  { file: 'RUN/MP6.ZDB', name: 'Desert Glory', at: [837, -5, 1901], note: 'spawn A (spawns.ts)' },
  { file: 'RUN/MP6.ZDB', name: 'Desert Glory', at: [1660, 30, 1428], note: 'deck inside (research 281)' },
  { file: 'RUN/MP72.ZDB', name: 'Crossroads', at: [1972, 68, 2150], note: 'spawn A (spawns.ts)' },
  { file: 'RUN/MP72.ZDB', name: 'Crossroads', at: [736, 58, 841], note: 'stair pocket (research 217 §2.6)' },
  { file: 'RUN/MP2.ZDB', name: 'Frostfire', at: [796, 100, 614], note: 'spawn A, research 90 item 6' },
  { file: 'RUN/MP7.ZDB', name: 'Night Stalker', at: [648, 124, 1675], note: 'spawn A (spawns.ts)' },
];

describe('disc tight spots', () => {
  for (const spot of SPOTS) {
    const bytes = fixture(spot.file);
    it.skipIf(!bytes)(`${spot.name} ${spot.note} (${spot.file})${bytes ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
      const map = simMapFromBytes(bytes!, spot.file);
      const grid = map.grid;
      const yaws = [0, 45, 90, 135, 180, 225, 270, 315];
      const failures: string[] = [];
      for (const yaw of yaws) {
        for (const [label, root, pitch] of [['stand', STAND, INIT_AIM_PITCH], ['prone', PRONE, 0]] as const) {
          const cam = new PlayerCamera(grid);
          const feet: Vec3 = [spot.at[0], spot.at[1], spot.at[2]];
          settle(cam, feet, yaw, pitch, root, 6);
          for (const alpha of [0, 0.5, 1]) {
            const v = cam.view(alpha);
            const hit = pastWall(grid, v.target, v.eye);
            if (hit) failures.push(`${label} yaw ${yaw} a ${alpha} past ${hit.path} t ${hit.t.toFixed(3)} eye ${v.eye.map((n) => n.toFixed(2)).join(',')}`);
          }
        }
      }
      expect(failures, failures.slice(0, 8).join('\n')).toEqual([]);
    }, 120_000);
  }
});

describe('where a legal stand meets the hull', () => {
  const maps = ['RUN/MP2.ZDB', 'RUN/MP6.ZDB', 'RUN/MP72.ZDB', 'RUN/MP7.ZDB'];
  for (const file of maps) {
    const bytes = fixture(file);
    it.skipIf(!bytes)(`${file}: standing at 3.5 off a camera wall, the eye stays this side${bytes ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
      const map = simMapFromBytes(bytes!, file);
      const grid = map.grid;
      const failures: string[] = [];
      let tried = 0;
      // Walk the grid's collision polygons once.
      const seen = new Set<WorldPoly>();
      for (const cell of grid.cells) {
        for (const atom of cell.atoms) {
          if (atom.object.kind !== 'collision') continue;
          for (const poly of atom.object.polys) {
            if (seen.has(poly) || !isCameraClassSurface(poly)) continue;
            seen.add(poly);
            const n = polygonNormal(poly.points);
            if (!n || Math.abs(n[1]) >= 0.7) continue;
            const c = centroid(poly.points);
            for (const sign of [1, -1] as const) {
              if (tried >= 80) break;
              const dir: Vec3 = [n[0] * sign, n[1] * sign, n[2] * sign];
              const far = add(c, scale(dir, STAND_CLEAR + 4));
              const into = add(c, scale(dir, -0.25));
              const approach = segmentHits(grid, far, into, isCameraClassSurface)[0];
              if (!approach || approach.poly !== poly) continue;
              const stand = add(c, scale(dir, STAND_CLEAR));
              const feet: Vec3 = [stand[0], stand[1] - lookHeight(STAND), stand[2]];
              if (embeddedStandingAnchor(grid, feet, n, map.defaultMaterial)) continue;
              tried++;
              const cam = new PlayerCamera(grid);
              settle(cam, feet, yawToward(scale(dir, -1)), 0, STAND, 3);
              const v = cam.view(1);
              const hit = pastWall(grid, v.target, v.eye);
              if (hit) failures.push(`${poly.path} feet ${feet} yaw ${yawToward(scale(dir, -1))} eye ${v.eye} past ${hit.path}`);
            }
          }
        }
      }
      expect(tried).toBe(80);
      expect(failures, failures.slice(0, 12).join('\n')).toEqual([]);
    }, 180_000);
  }
});

function centroid(points: Float32Array): Vec3 {
  let x = 0, y = 0, z = 0, n = 0;
  for (let i = 0; i < points.length; i += 3) {
    x += points[i]!; y += points[i + 1]!; z += points[i + 2]!; n++;
  }
  return [x / n, y / n, z / n];
}

describe('the hull sweep excludes solid interiors, not close walls (research 382 §5)', () => {
  it('distinguishes opposed outward slab faces from a passage and a single nearby wall', () => {
    // wallX has normal -x. Reversing the second face closes a solid whose outward normals enclose the axis.
    const left = wallX(0, -40, 40), right = wallX(1.5, 40, -40);
    expect(embeddedStandingAnchor(world([left, right]), [.5, 0, 0], [0, 0, 1])).toBe(true);
    expect(embeddedStandingAnchor(world([left]), [.5, 0, 0], [0, 0, 1])).toBe(false);
    const passage = world([wallX(0, 40, -40), wallX(1.5, -40, 40)]);
    expect(embeddedStandingAnchor(passage, [.5, 0, 0], [0, 0, 1])).toBe(false);
    for (const face of [left, right]) face.material = 0;
    expect(embeddedStandingAnchor(world([left, right]), [.5, 0, 0], [0, 0, 1], 'STONE')).toBe(true);
  });

  it.each(['LEAFY_TREE', 'WATER', 'camera-only'])('does not reject paired %s sheets as solid body interiors', (kind) => {
    const faces = [wallX(0, -40, 40), wallX(1.5, 40, -40)];
    if (kind === 'camera-only') for (const face of faces) face.cameratype = 1;
    else {
      const material = materialTable().findIndex((m) => m.name === kind);
      expect(material).toBeGreaterThan(0);
      for (const face of faces) face.material = material;
    }
    expect(embeddedStandingAnchor(world(faces), [.5, 0, 0], [0, 0, 1])).toBe(false);
    if (kind !== 'camera-only') {
      for (const face of faces) face.material = 0;
      expect(embeddedStandingAnchor(world(faces), [.5, 0, 0], [0, 0, 1], kind)).toBe(false);
    }
  });

  const bytes = fixture('RUN/MP7.ZDB');
  it.skipIf(!bytes)(`MP7 slab interiors are excluded; reachable approaches on both sides keep their camera clear${bytes ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
    const map = simMapFromBytes(bytes!, 'RUN/MP7.ZDB'), grid = map.grid;
    // Exact centroid-generated RED samples. Bounds are the paired outward faces decoded by worldCollision.
    const samples: { feet: Vec3; bounds: [number, number]; fromY: number }[] = [
      { feet: [1229, 113.84192090599919, 1431.3627369674994], bounds: [1228.5, 1230], fromY: 114 },
      { feet: [1229, 105.63648111248736, 1425.8152928180411], bounds: [1228.5, 1230], fromY: 106 },
      { feet: [1174.5, 109.49626019368301, 1393.7653656982516], bounds: [1174, 1175.5], fromY: 150 },
    ];
    for (const { feet, bounds, fromY } of samples) {
      expect(embeddedStandingAnchor(grid, feet, [0, 0, 1], map.defaultMaterial), `${feet}`).toBe(true);
      for (const height of wallProbeHeights('stand')) {
        const p: Vec3 = [feet[0], feet[1] + height, feet[2]];
        for (const sign of [-1, 1]) {
          const h = segmentHits(grid, p, add(p, [sign * STAND_CLEAR, 0, 0]), isWallSurface)[0]!;
          expect(h.point[0]).toBeCloseTo(bounds[sign === -1 ? 0 : 1], 6);
          expect(h.normal[0]).toBe(sign);
        }
      }
      for (const sign of [-1, 1]) {
        const w = new Walker(grid), startX = feet[0] + sign * 8;
        if (fromY === 150) expect(w.place(startX, feet[1], feet[2])).toBe(false); // Fabricated feet lie below support.
        expect(w.place(startX, fromY, feet[2])).toBe(true);
        w.state.yaw = sign === -1 ? 270 : 90;
        const cameras = [-70, -45, 0, 60].map((pitch) => ({ pitch, cam: new PlayerCamera(grid) }));
        for (let i = 0; i < 120; i++) {
          w.tick({ forward: 1, right: 0, boost: false });
          if (sign === -1) expect(w.state.x).toBeLessThan(bounds[0]);
          else expect(w.state.x).toBeGreaterThan(bounds[1]);
          for (const { pitch, cam } of cameras) {
            cam.tick([w.state.x, w.state.y, w.state.z], w.state.yaw, pitch, STAND);
            const v = cam.view(1);
            // The translated look target can lie beyond a visible wall, and the body's vertical extension at
            // camera height can be inside an eave. The actual body-height focus and near rectangle must be clear.
            const focus: Vec3 = [w.state.x, w.state.y + lookHeight(STAND), w.state.z];
            expect(pastWall(grid, focus, v.eye), `${feet}/${sign}/${i}/${pitch} body`).toBeNull();
            for (const c of nearRectCorners(v.eye, v.target) ?? []) {
              expect(pastWall(grid, v.eye, c), `${feet}/${sign}/${i}/${pitch} near`).toBeNull();
            }
          }
        }
      }
    }
  }, 120_000);
});


describe('WALL-CAM: ordinary downward targets and interpolated frames', () => {
  it.each([-45, -70])('keeps the drawn eye and near rectangle outside at pitch %s while preserving game aim', (pitch) => {
    const grid = world([wallZ(0, -200, 200)]);
    const cam = new PlayerCamera(grid); cam.nearAspect = 16 / 9;
    cam.tick([0, 0, STAND_CLEAR], 0, pitch, STAND);
    const v = cam.view(1);
    expect(v.eye[2]).toBeGreaterThan(0);
    for (const corner of nearRectCorners(v.eye, v.target, 16 / 9) ?? []) expect(corner[2]).toBeGreaterThan(0);
    expect(v.aim.eye[2]).toBeLessThan(0); // H337 stays unresolved: only the drawn pose is protected.
  });
  it('rechecks the chord between two clear orbit endpoints around a finite pillar', () => {
    const grid = world([wallZ(12, -2, 2), wallZ(16, -2, 2), wallX(-2, 12, 16), wallX(2, 12, 16)]);
    const cam = new PlayerCamera(grid);
    cam.tick([0, 0, 0], -45, 0, STAND); const a = cam.view(1);
    cam.tick([0, 0, 0], 45, 0, STAND); const b = cam.view(1);
    const axis: Vec3 = [0, a.eye[1], 0];
    expect(pastWall(grid, axis, a.eye)).toBeNull(); expect(pastWall(grid, axis, b.eye)).toBeNull();
    const chord = scale(add(a.eye, b.eye), .5);
    expect(pastWall(grid, axis, chord)).not.toBeNull(); // Lerp alone really crosses this finite obstruction.
    expect(pastWall(grid, axis, cam.view(.5).eye)).toBeNull();
  });
  it('keeps every rendered sample outside both faces during a corner orbit', () => {
    const grid = world([wallZ(0, -200, 200), wallX(0, -200, 200)]);
    const cam = new PlayerCamera(grid); cam.nearAspect = 32 / 9;
    for (const yaw of [0, 40, 80, 120, 160, 200, 240, 280, 320, 360]) {
      cam.tick([STAND_CLEAR, 0, STAND_CLEAR], yaw, -60, STAND);
      for (const alpha of [0, .1, .3, .5, .7, .9, 1]) {
        const v = cam.view(alpha);
        for (const c of [v.eye, ...(nearRectCorners(v.eye, v.target, 32 / 9) ?? [])]) {
          expect(c[0], `${yaw}/${alpha}: x`).toBeGreaterThan(0);
          expect(c[2], `${yaw}/${alpha}: z`).toBeGreaterThan(0);
        }
      }
    }
  });
});


describe('WALL-CAM: downward lead uses movement mode, FUN_0029cbb0', () => {
  it('skips camera type 1 and reads type 2 before the normal camera pass', () => {
    const pose = (cameratype: number | null) => {
      const wall = wallZ(-10, -200, 200); wall.cameratype = cameratype ?? 0;
      const c = new PlayerCamera(world(cameratype === null ? [] : [wall]));
      c.tick([0, 0, 0], 0, -70, STAND);
      return c.view(1).aim.target;
    };
    expect(pose(1)).toEqual(pose(null));
    expect(pose(2)).toEqual(pose(0));
    expect(pose(2)[2]).not.toBe(pose(null)[2]);
  });
});
