import { describe, expect, it } from 'vitest';
import {
  ALL_LAYERS, buildGrid, isWallSurface, materialTable, polygonNormal, probeFloor, probeGround, segmentHits, surfaceMaterial, type CollisionOwner, type Grid, type GridParams, type WorldPoly,
} from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  localCamera, nearRectCorners, lookHeight, pitchLimits, PlayerCamera, CAM_MARGIN, INIT_AIM_PITCH, type Vec3,
} from '../src/playerCamera';
import { simMapFromBytes } from '../src/simMap';
import { isCameraClassSurface, STANCE, wallProbeHeights, Walker } from '../src/mover';
import { proneAimLean } from '../src/look';

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
/**
 * LATER 1057: the same face wound the other way, its normal reversed (`wallZ` faces +z, `wallX` -x). The pass is
 * one-sided on the hull -- a face counts only entered from its front (`FUN_002d2890` side mode 0x20, research 382 s8) --
 * so a camera wall the boom meets from the body's side is wound to face the body.
 */
const rewound = (p: WorldPoly): WorldPoly => {
  const q = p.points, out: number[] = [];
  for (let i = q.length / 3 - 1; i >= 0; i--) out.push(q[i * 3]!, q[i * 3 + 1]!, q[i * 3 + 2]!);
  return { ...p, points: Float32Array.from(out) };
};

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
    const grid = world([rewound(wallZ(0, -40, 40))]);
    const feet: Vec3 = [0, 0, -STAND_CLEAR];
    const cam = new PlayerCamera(grid);
    settle(cam, feet, yawToward([0, 0, 1]), 0, STAND, 8);
    const v = cam.view(1);
    expect(pastWall(grid, v.target, v.eye)).toBeNull();
    expect(v.eye[2]).toBeLessThan(0);
    expect(v.eye[2]).toBeCloseTo(-CAM_MARGIN, 3);
  });

  it('backing into a corner keeps the eye inside both planes', () => {
    const grid = world([wallZ(0, -5, 40), rewound(wallX(0, -5, 40))]);
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
    const beside = world([rewound(wallX(0, -40, 40))]);
    const feetBeside: Vec3 = [PRONE_BESIDE, 0, 10];
    const cam = new PlayerCamera(beside);
    settle(cam, feetBeside, yawToward([0, 0, 1]), 0, PRONE, 8);
    let v = cam.view(1);
    expect(pastWall(beside, v.target, v.eye)).toBeNull();
    expect(v.eye[0]).toBeGreaterThan(0);

    const behind = world([rewound(wallZ(0, -40, 40))]);
    const feetBack: Vec3 = [0, 0, -PRONE_BESIDE];
    const cam2 = new PlayerCamera(behind);
    settle(cam2, feetBack, yawToward([0, 0, 1]), INIT_AIM_PITCH, PRONE, 8);
    v = cam2.view(1);
    expect(pastWall(behind, v.target, v.eye), JSON.stringify(v.eye)).toBeNull();
    expect(v.eye[2]).toBeLessThan(0);
  });

  it('a step around a pillar does not draw the in-between eye through it', () => {
    // A square pillar, its faces facing out. The actor slides across its face; the rendered eye is the blend of the two ticks.
    const pillar = [
      rewound(wallZ(-2, -2, 2)), wallZ(2, -2, 2), wallX(-2, -2, 2), rewound(wallX(2, -2, 2)),
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
    const grid = world([rewound(wallZ(z, -40, 40))], { cellDim: 100, cellsX: 8, cellsZ: 8, originX: -400, originZ: -400 });
    const feet: Vec3 = [0, 0, z - STAND_CLEAR];
    const cam = new PlayerCamera(grid);
    settle(cam, feet, yawToward([0, 0, 1]), 0, STAND, 4);
    const v = cam.view(1);
    expect(pastWall(grid, v.target, v.eye), JSON.stringify(v.eye)).toBeNull();
    expect(v.eye[2]).toBeLessThan(z);
  });

  it('two faces meeting at a seam, and a thin wall, still stop the eye', () => {
    const seam = world([
      rewound(wallZ(0, -40, 0)),
      rewound(wallZ(0, 0, 40)),
    ]);
    const cam = new PlayerCamera(seam);
    settle(cam, [0, 0, -STAND_CLEAR], yawToward([0, 0, 1]), 0, STAND, 4);
    expect(pastWall(seam, cam.view(1).target, cam.view(1).eye)).toBeNull();

    const thin = world([rewound(wallZ(0, -40, 40)), wallZ(0.4, -40, 40)]);
    const cam2 = new PlayerCamera(thin);
    settle(cam2, [0, 0, -STAND_CLEAR], yawToward([0, 0, 1]), 0, STAND, 4);
    const v = cam2.view(1);
    expect(pastWall(thin, v.target, v.eye)).toBeNull();
    expect(v.eye[2]).toBeLessThan(0);
  });

  it('looking up at the aim limit, backed against a wall at the body stand-off, stays this side', () => {
    const grid = world([rewound(wallZ(0, -40, 40))]);
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
    const bush = world([rewound(wallZ(10, -40, 40, 0, 80, leafy))]);
    const through = new PlayerCamera(bush);
    settle(through, [0, 0, 0], yawToward([0, 0, 1]), 0, STAND, 4);
    // The goal is 28.75 behind. A solid face at 10 would have left the eye at 9.25.
    expect(through.view(1).eye[2]).toBeGreaterThan(20);

    const both = world([rewound(wallZ(6, -40, 40, 0, 80, leafy)), rewound(wallZ(10, -40, 40))]);
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
    const grid = world([rewound(wallZ(0, -40, 40))]);
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

/**
 * LATER 1057 (re-filed; reading, pending review; research 382 s8): a face is a camera wall only from its front. The
 * pass counts a hull face only entered from its front (`FUN_002d2890` D:L174831-174837 / `FUN_002d3030`
 * D:L175152-175157, its type-2 records' branch from D:L175246 at D:L175277-175282: side mode 0x20 while the collider's
 * `+0x80` bit 1 is clear). Every owner this sweep meets is a scene node the level's reader builds through
 * `FUN_00316e30`, which clears that bit (D:L215827-215828): a world-model node of type 1 or 5 (`FUN_00311520`
 * D:L212597-212602), or an instance node (type 2, D:L212604-212608), a copy of its prototype's nodes (`FUN_00310da0`
 * D:L212356 -> `FUN_00317d90` D:L216393), which writes no `+0x80` itself; its copy is `FUN_00316e10` (D:L216411 ->
 * D:L215801), a virtual call through the prototype's vtable `+0xc` whose target the decompilation does not show, so the
 * instance's bit rests on the prototype being an `FUN_00316e30` node, no bit-1 setter on that path, and the capture
 * below. The bit's only setters found are a particle effect's box (`FUN_0032ad20` D:L227610-227611, its node named
 * "PARTICLE DI NODE", D:L227596), the SEAL's body (D:L419731) and `FUN_001ff8a0`'s structure (D:L59846) (research 281
 * s4.3's census, research 382 s8); MP51's `access1` instance read `+0x80` = 0x41 in a capture of the original
 * (research 281 s4.3, SEGMENT-BODY part 11). So the stand is taken only on the side the original's pass meets the face
 * from (`frontOnly` on the approach). It took both sides while the pass was two-sided; stood behind a one-sided face
 * (MP2's `bigtank/di_invis`, MP72's `table_desk`, `wc13/di_inta_12`, `stopper1/di_stopper14`), the original's pass does
 * not stop at it either.
 */
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
              const approach = segmentHits(grid, far, into, isCameraClassSurface, ALL_LAYERS, true)[0];   // LATER 1057: its front
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
    // LATER 1057: the look target lies past the wall (H337), so the pass's cast from it toward the eye meets the wall
    // from the target's side. Wound to face the target (-z) the one-sided pass stops on it and leaves the game's eye past
    // it -- the case the drawn guard is for; wound to face the body (+z) the pass would not stop and no guard is asked.
    const grid = world([rewound(wallZ(0, -200, 200))]);
    const cam = new PlayerCamera(grid); cam.nearAspect = 16 / 9;
    cam.tick([0, 0, STAND_CLEAR], 0, pitch, STAND);
    const v = cam.view(1);
    expect(v.eye[2]).toBeGreaterThan(0);
    for (const corner of nearRectCorners(v.eye, v.target, 16 / 9) ?? []) expect(corner[2]).toBeGreaterThan(0);
    expect(v.aim.eye[2]).toBeLessThan(0); // H337 stays unresolved: only the drawn pose is protected.
  });
  it.each([-45, -70])('a wall facing the body it stands against, the target past it (research 382 s1), pitch %s: the front-only pass does not pull the eye in; the drawn guard keeps the view outside', (pitch) => {
    // Research 382 s1 / research 201 s14.1's real case: the body faces the wall it stands against (as on the disc, the
    // face toward the body: `wallZ` faces +z) and the look target lies past it. The pass casts from that target toward
    // the eye, so it meets the face from behind: front-only on the hull (`FUN_002d2890` / `FUN_002d3030` side mode 0x20,
    // research 382 s8) it neither stops the boom nor sets the 1.5 s hold -- the boom is the open floor's. The drawn camera
    // (H309, `NEAR_CLEARANCE_ADAPTATION`) keeps its own two-sided guard, so the drawn eye and near rectangle stay outside.
    // The dev-disc counterpart is `h337PredictionDisc.test.ts` (6 of 6 on the box under the front-only pass).
    const grid = world([wallZ(0, -200, 200)]);
    const cam = new PlayerCamera(grid); cam.nearAspect = 16 / 9;
    cam.tick([0, 0, STAND_CLEAR], 0, pitch, STAND);
    const open = new PlayerCamera(world([])); open.nearAspect = 16 / 9;
    open.tick([0, 0, STAND_CLEAR], 0, pitch, STAND);
    expect(open.view(1).aim.target[2]).toBeLessThan(0);   // the look target lies past the wall's plane (z 0)
    expect(cam.distance()).toBeCloseTo(open.distance(), 9);
    expect(cam.hold()).toBe(0);
    const v = cam.view(1);
    expect(v.aim.target[2]).toBeLessThan(0);   // the walled camera's own target lies past the plane too: not vacuous
    expect(v.eye[2]).toBeGreaterThan(0);
    for (const corner of nearRectCorners(v.eye, v.target, 16 / 9) ?? []) expect(corner[2]).toBeGreaterThan(0);
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
    const grid = world([wallZ(0, -200, 200), rewound(wallX(0, -200, 200))]);   // both faces toward the body's corner
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

/**
 * B-19 (players, 2026-11-19: on Crossroads prone, "every wall is see-through"): the finding.
 * Prone, the look-at target is only `lookHeight(PRONE)` = 7.67 over the feet (`FUN_0029a950`: root 2.168 + ramp 5.5,
 * `./cameraRig` `ramp`), so a look up past about 17 degrees puts the goal eye under the feet's level; the prone pitch
 * limit is `prone_max_aim_pitch` 25 (`SEAL_TUNING.proneAimPitch`, `FUN_00594600`'s prone pair, `pitchLimits`) plus the
 * slope's lean along the facing (`proneAimLean`, `FUN_00594600` D:L452839-452884). Two mechanisms, named per row:
 * (1) the drawn guard, not the pass: `PlayerCamera.draw`'s `bodySide` casts LEVEL from the feet's axis at the eye's own
 * height; with the pass's eye under the feet's level (0.84 under at pitch 21 on a level roof) the cast starts under the
 * floor the body lies on, meets that floor's edge, a stair or a wall's foot a few tenths off the axis, and pulls the
 * drawn eye to it -- and the look span is kept (`target = out + span`), so the drawn camera is carried 10-39 units
 * off the pass's, past walls (feet 580,144.42,940 yaw 135 pitch 21: `wc12/di_roof12` at t 0.05, drawn eye 38.7 off);
 * `clearNearRect`'s slides then move it on. (2) the disc's hull: where a step has no riser (`wc27/di_road27` 41.44
 * beside its slab at 42.50, `probeGround` at x 780 changing level between z 1676 and 1677 with no face crossed by a
 * level cast at y 39-42.4; `wc11/di_road11` 0.00 / 1.06; `wc13/di_road13`; r0004's `0x2d87d0` slab), the boom enters
 * under the higher slab's open edge and crosses nothing: the pass (front-only) and the drawn guard's casts (two-sided)
 * both see an empty segment, and the eye or a near corner ends under the road with no drawn-guard move at all.
 * The sweep's failing poses are split three ways: B-19's own (looking up, not (2)) are asserted; (2)'s, a data question,
 * and the level-or-down rows (the feet-axis check, a separate finding, not B-19) are printed, only finiteness asserted.
 */
describe('B-19: prone with the pitch up on Crossroads, the drawn eye and near rectangle stay above the floor', () => {
  const file = 'RUN/MP72.ZDB';
  const bytes = fixture(file);
  /**
   * One pose of the sweep that failed a check, and its class: `b19` -- looking up (pitch > 0), not mechanism (2), and
   * the game pass's eye (`aim.eye`) under the feet's level: B-19's own rows, by its mechanism (1), whatever check fails;
   * `gapAxisArtefact` / `gapAxisOnFace` / `gapNearCorner` -- looking up, not mechanism (2), the pass's eye at or over the
   * feet's level: the gaps split off B-19 (c3c1401d36's split narrowed by mechanism), see their `it`; `riserless` --
   * mechanism (2), a point under a riserless step's open edge with no drawn-guard move: the disc's data; `feetAxis` -- level or looking down (pitch <= 0): a separate finding, not B-19.
   */
  type Pose = { cls: 'b19' | 'b19Slide' | 'b19TargetOverSlab' | 'b19RiserlessMoved' | 'gapAxisArtefact' | 'gapAxisOnFace' | 'gapNearCorner' | 'riserless' | 'feetAxis'; keys: string[]; failures: string[]; polys: string[]; finite: boolean };
  let swept: { poses: Pose[]; tried: number; placed: number } | undefined;
  const sweep = (): { poses: Pose[]; tried: number; placed: number } => {
    if (swept) return swept;
    const map = simMapFromBytes(bytes!, file);
    const grid = map.grid;
    const p = grid.params;
    const fmt = (v: readonly number[]): string => v.map((n) => n.toFixed(2)).join(',');
    const name = (q: WorldPoly, n?: readonly number[]): string =>
      `${q.path} ditype ${q.ditype} cameratype ${q.cameratype} material ${q.material} cameraClass ${isCameraClassSurface(q)}${n ? ` n ${fmt(n)}` : ''}`;
    // The points: the two Crossroads tight spots, then a 40-unit grid of floors (n.y >= 0.7) the walker can be placed on,
    // kept where a camera-class side face (|n.y| < 0.3) stands within 16 of the feet at 3 up in one of eight directions.
    const starts: Vec3[] = SPOTS.filter((s) => s.file === file).map((s) => s.at);
    for (let x = p.originX + 20; x < p.originX + p.cellDim * p.cellsX; x += 40) {
      for (let z = p.originZ + 20; z < p.originZ + p.cellDim * p.cellsZ; z += 40) {
        const g = probeGround(grid, x, z);
        if (!g.length) continue;
        const top = g.reduce((a, b) => (b.y > a.y ? b : a));
        if (top.normal[1] < 0.7) continue;
        const nearWall = [0, 45, 90, 135, 180, 225, 270, 315].some((deg) => {
          const r = deg * Math.PI / 180, from: Vec3 = [x, top.y + 3, z];
          return segmentHits(grid, from, add(from, [Math.sin(r) * 16, 0, Math.cos(r) * 16]), isCameraClassSurface)
            .some((h) => Math.abs(h.normal[1]) < 0.3);
        });
        if (nearWall) starts.push([x, top.y, z]);
      }
    }
    const poses: Pose[] = [];
    let tried = 0, placed = 0;
    for (const start of starts) {
      const w = new Walker(grid);
      if (!w.place(start[0], start[1] + 5, start[2])) continue;
      const feet: Vec3 = [w.state.x, w.state.y, w.state.z];
      const floor = probeFloor(grid, feet[0], feet[1], feet[2]);
      if (!floor) continue;
      placed++;
      const focus: Vec3 = [feet[0], feet[1] + lookHeight(PRONE), feet[2]];
      for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const [minPitch, maxPitch] = pitchLimits('prone', proneAimLean(floor.normal, yaw));
        const pitches = [minPitch, -10, 0, 10, 17, 21, maxPitch].filter((q) => q >= minPitch && q <= maxPitch);
        for (const pitch of pitches) {
          tried++;
          const cam = new PlayerCamera(grid);
          settle(cam, feet, yaw, pitch, PRONE, 8);
          const v = cam.view(1);
          const failures: string[] = [], keys: string[] = [], polys: string[] = [];
          let riserless = false;
          let axisT: number | undefined, axisDrawnClear = false;
          // How far the drawn guard (`PlayerCamera.draw`: `bodySide`, then `clearNearRect`) moved the drawn eye off the pass's,
          // and what moved it: `bodySide` casts LEVEL from the feet's axis at the eye's own height to the eye; prone with the
          // pitch up that height is under the feet's floor, and the cast starts under the floor the body lies on.
          const slide = len(sub(v.eye, v.aim.eye));
          const bodyFrom: Vec3 = [feet[0], v.aim.eye[1], feet[2]];
          const bodyHit = segmentHits(grid, bodyFrom, v.aim.eye, isCameraClassSurface)[0];
          const underFeet = v.aim.eye[1] < feet[1];
          const mover = slide <= 0.5 ? 'no drawn-guard move'
            : bodyHit ? `bodySide's level cast ${underFeet ? 'from under the feet\'s floor ' : ''}met a face`
              : 'clearNearRect slide';
          const slid = ` [${mover}, ${pitch > 0 ? 'looking up' : 'level or down'}]`;
          const row = `feet ${fmt(feet)} yaw ${yaw} pitch ${pitch.toFixed(1)} (the pass's eye ${fmt(v.aim.eye)}, `
            + `${(v.aim.eye[1] - feet[1]).toFixed(2)} over the feet; drawn eye ${slide.toFixed(2)} off it`
            + `${slide > 0.5 && bodyHit ? `, bodySide met ${name(bodyHit.poly, bodyHit.normal)} at t ${bodyHit.t.toFixed(3)}` : ''})`;
          const wall = pastWall(grid, focus, v.eye);
          if (wall) {
            // Which line the face is on: the drawn look's own (target to eye), or only the feet axis's (the target led off
            // the axis: -3 n.y behind looking up, -8 n.y ahead looking down, `FUN_0029a950`; `clearNearRect` casts from it).
            const drawn = pastWall(grid, v.target, v.eye);
            const kind = drawn ? 'also past from the drawn target' : 'clear from the drawn target (the target off the axis)';
            axisT = wall.t; axisDrawnClear = !drawn;
            failures.push(`${row}: past a camera face ${wall.path} t ${wall.t.toFixed(3)} between the feet's axis and the eye, ${kind}`);
            keys.push(`eye: past a camera face from the feet axis, ${kind}${slid}`);
          }
          const corners = nearRectCorners(v.eye, v.target) ?? [];
          const points: [string, Vec3][] = [['eye', v.eye], ...corners.map((c, i) => [`near corner ${i}`, c] as [string, Vec3])];
          for (const [label, q] of points) {
            // Under the floor: a floor of q's column lies over q and no higher than the look target.
            const over = probeGround(grid, q[0], q[2]).filter((h) => h.y > q[1] + 0.01 && h.y <= focus[1]).sort((a, b) => a.y - b.y)[0];
            if (!over) continue;
            // The cast the drawn guard makes for this point (`clearNearRect`): focus to eye, eye to corner. Every polygon, both sides.
            const from = label === 'eye' ? focus : v.eye;
            const crossed = segmentHits(grid, from, q).filter((h) => h.t < 1);
            const slab = crossed.find((h) => h.poly === over.poly);
            const mechanism = !crossed.length
              ? 'no face crossed: under the open edge of a riserless step'
              : !slab ? 'the slab over it not crossed (other faces crossed)'
                : !isCameraClassSurface(over.poly) ? 'crossed a face the camera class skips (isCameraClassSurface)'
                  : 'crossed a camera face the drawn guard did not clear (clearNearRect)';
            if (!crossed.length && slide <= 0.5) { riserless = true; polys.push(over.poly.path); }
            keys.push(`${label === 'eye' ? 'eye' : 'near corner'}: ${mechanism}${slid}`);
            failures.push(`${row}: ${label} ${fmt(q)} is ${(over.y - q[1]).toFixed(2)} under ${name(over.poly, over.normal)} at ${over.y.toFixed(2)}`
              + ` (feet floor ${floor.y.toFixed(2)}${label === 'eye' ? `, the pass's eye ${fmt(v.aim.eye)}` : ''}) -- ${mechanism}`);
            break;
          }
          if (!failures.length) continue;
          const finite = [v.eye, v.target, ...corners].every((c) => c.every(Number.isFinite));
          // Looking up, not riserless: B-19's mechanism (1) is the pass's eye under the feet's level; the rest are gaps, by
          // sub-class: the feet axis ON a face (the axis check's hit at t 0.000: the sweep's placement), the eye past a face
          // only from the feet's axis (clear from the drawn target: the check's own artefact), and the rest (near corners
          // under a floor, riserless-like edges near a corner).
          // B-19's rows split by what still fails at the fix (agent/b19-camera; the controller's (A)), by the mechanism this
          // check names: a riserless step's open edge with a guard move (iii); a point under a slab the drawn guard's cast does
          // not cross (ii); the drawn eye carried through a face by the near clearance's slide (i); the rest is the cured
          // mechanism, `bodySide`'s level cast from under the feet's floor (B-19).
          const has = (m: string): boolean => keys.some((k) => k.includes(m));
          const b19cls: Pose['cls'] = has('under the open edge of a riserless step') && slide > 0.5 ? 'b19RiserlessMoved'
            : has('the slab over it not crossed') ? 'b19TargetOverSlab'
              : mover === 'clearNearRect slide' ? 'b19Slide' : 'b19';
          const cls: Pose['cls'] = riserless ? 'riserless' : pitch <= 0 ? 'feetAxis' : underFeet ? b19cls
            : axisT !== undefined && axisT < 0.0005 ? 'gapAxisOnFace'
              : axisT !== undefined && axisDrawnClear ? 'gapAxisArtefact' : 'gapNearCorner';
          poses.push({ cls, keys, failures, polys, finite });
        }
      }
    }
    return swept = { poses, tried, placed };
  };
  const summarize = (cls: Pose['cls']): { rows: Pose[]; text: string } => {
    const { poses, tried, placed } = sweep();
    const rows = poses.filter((q) => q.cls === cls);
    const byKey = new Map<string, number>();
    for (const k of rows.flatMap((q) => q.keys)) byKey.set(k, (byKey.get(k) ?? 0) + 1);
    const summary = [...byKey].map(([k, n]) => `${n} x ${k}`).join('\n');
    return { rows, text: `${rows.length} of ${tried} poses at ${placed} points\n${summary}\n${rows.flatMap((q) => q.failures).slice(0, 16).join('\n')}` };
  };

  it.skipIf(!bytes)(`${file}: prone beside walls, 8 yaws, looking up to the prone limit with the lean, 8 ticks: B-19's rows${bytes ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
    const { placed } = sweep();
    expect(placed).toBeGreaterThan(200);   // 277 points placed on the fixture: the sweep is not vacuous
    // B-19's asserted rows: the pass's eye under the feet's level, by the mechanism the fix cures (`bodySide`'s level cast
    // from under the feet's floor: 60 rows of agent/next's 78 before the fix, none after -- of the 78, 59 are gone at the
    // fix and 19 remain; 2 more are NEW at the fix, in (ii)). The rest of the pass-eye-under-the-feet rows are the three
    // named classes below, each REAL see-through, pinned exactly (LATER 1394: B-19's remainder).
    const { rows, text } = summarize('b19');
    expect(rows.flatMap((q) => q.failures), text).toEqual([]);
  }, 300_000);

  /**
   * B-19's REMAINDER, three named classes (the controller's ruling (A), 2026-11-22; seat-movement's mechanism rule): each
   * is real drawn see-through, not a check's artefact, left for a LATER row and pinned EXACTLY as measured on the MP72
   * fixture at the fix's head (a growth or a silent cure goes red). (i) `b19Slide`: the near clearance's slide
   * (`clearNearRect`, NEAR_CLEARANCE_ADAPTATION) carries the drawn eye ~20 u through a face the feet stand on
   * (wc32/di_ext16_2 at (1180, 41.49, 340) and (1340, 42.39, 340); the drawn look crosses it at t 0.64-0.80); the same at
   * agent/next without the fix. (ii) `b19TargetOverSlab`: a near corner (or the eye) under a slab or roof the drawn
   * guard's cast does not cross (b2_wc06's roof, wc18, wc11); 2 of the 3 are NEW with the fix -- near corners ~0.07 u
   * under b2_wc06's roof at (1740, 126.60, 1140) and (1860, 131.06, 1140), yaw 0: the cast from the look target's height
   * stops on a roof lip the old cast missed (the review's F3). (iii) `b19RiserlessMoved`: under a riserless step's open
   * edge, but with a drawn-guard move (so not the data class). Only finiteness and the counts asserted.
   */
  it.skipIf(!bytes)(`${file}: B-19's remainder -- three named classes, real see-through, counts pinned${bytes ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
    const counts: Record<string, number> = {};
    for (const cls of ['b19Slide', 'b19TargetOverSlab', 'b19RiserlessMoved'] as const) {
      const { rows, text } = summarize(cls);
      console.log(`B-19 remainder ${cls}: ${text}`);
      expect(rows.filter((q) => !q.finite), cls).toEqual([]);
      counts[cls] = rows.length;
    }
    expect(counts).toEqual({ b19Slide: 16, b19TargetOverSlab: 3, b19RiserlessMoved: 2 });
  }, 300_000);

  /**
   * GAPS split off B-19 by mechanism, for a LATER row (c3c1401d36 split the sweep three ways; this narrows its looking-up
   * class to B-19's mechanism (1), the pass's eye under the feet's level). Looking up, not riserless, the pass's eye at or
   * over the feet's level, three sub-classes, each printed and its count PINNED exactly as measured on this tree (a port
   * measurement on the MP72 fixture, not a parity value: a change in a count goes red, so nothing hides):
   * `gapAxisArtefact` -- the eye past a face only on the line from the feet's axis, the line from the drawn target clear
   * (the feet-axis check's own artefact); `gapAxisOnFace` -- the feet's axis lies ON a wall face (the axis check's hit at
   * t 0.000: the sweep's placement); `gapNearCorner` -- the rest (a near corner or the eye under a floor: riserless-like
   * or near-corner rows). On the fixture: 65, 44 and 14 of the 201 looking-up rows; B-19 keeps 78. Only finiteness and
   * the counts asserted.
   */
  it.skipIf(!bytes)(`${file}: gaps split off B-19 (looking up, the pass's eye not under the feet) -- printed by sub-class, counts pinned${bytes ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
    const counts: Record<string, number> = {};
    for (const cls of ['gapAxisArtefact', 'gapAxisOnFace', 'gapNearCorner'] as const) {
      const { rows, text } = summarize(cls);
      console.log(`B-19 gap ${cls}: ${text}`);
      expect(rows.filter((q) => !q.finite), cls).toEqual([]);
      counts[cls] = rows.length;
    }
    expect(counts).toEqual({ gapAxisArtefact: 65, gapAxisOnFace: 44, gapNearCorner: 14 });
  }, 300_000);

  /**
   * A separate finding, NOT B-19: level or looking down (pitch <= 0) the check's own line runs from the feet's axis,
   * while the game leads the look target off it (`FUN_0029a950`: -8 n.y ahead looking down), so a face between the axis
   * and the eye need not lie on the drawn look's line. Printed with its count and mechanism; only finiteness asserted.
   */
  it.skipIf(!bytes)(`${file}: a separate finding (not B-19) -- level or looking down, the eye past a face from the feet's axis${bytes ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
    const { rows, text } = summarize('feetAxis');
    console.log(`feet-axis check, pitch <= 0 (not B-19): ${text}`);
    expect(rows.filter((q) => !q.finite)).toEqual([]);
    // Pinned (B-19's product review, F1): 73 at agent/next and at the B-19 fix alike, so a pose the fix moves into this
    // class, or out of it, goes red.
    expect(rows.length, text).toBe(73);
  }, 300_000);

  /**
   * B-19's mechanism (2), a data question for the owner or a rig: a step in the disc's collision with no riser lets the
   * eye or a near corner pass under the higher slab's open edge crossing no face, with no drawn-guard move (on the fixture
   * 16 poses, 6 under `wc11/di_road11`, 2 under r0004's `0x2d87d0` slab; the run prints the rest by polygon). What the original draws at a
   * riserless curb is not known; nothing here changes. Printed and listed by polygon; only finiteness asserted.
   */
  it.skipIf(!bytes)(`${file}: B-19 mechanism (2) -- under a riserless step's open edge (the disc's data, for the owner or a rig)${bytes ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
    const { rows, text } = summarize('riserless');
    const byPoly = new Map<string, number>();
    for (const path of rows.flatMap((q) => q.polys)) byPoly.set(path, (byPoly.get(path) ?? 0) + 1);
    console.log(`riserless steps (data, not code): ${text}\nby polygon:\n${[...byPoly].map(([k, n]) => `${n} x ${k}`).join('\n')}`);
    expect(rows.filter((q) => !q.finite)).toEqual([]);
    // Pinned (B-19's product review, F1): 16 at agent/next and at the B-19 fix alike.
    expect(rows.length, text).toBe(16);
  }, 300_000);
});
