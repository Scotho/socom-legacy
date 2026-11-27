// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, GAME_FRAME_DT, isCameraSurface, materialTable, probeFloor, segmentHit, SEAL_TUNING, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera, TOUCH_LOOK } from '../src/camera';
import { MAX_PITCH_RATE, MAX_YAW_RATE, MOUSE_RADIANS_PER_COUNT, PITCH_PER_YAW } from '../src/look';
import { loadMap } from '../src/loadMap';
import {
  aimPoint, cameraPass, localCamera, nearRectCorners, newPassState, scopeEyeHeight, lookHeight, pitchLimits, ramp, PlayerCamera, viewFar,
  CAM_BACK, CAM_MARGIN, CAM_REGROW, INIT_AIM_PITCH, LEAD_PROBE_START_PLACEHOLDER, ROOT_RATE_READING, toWorld, type Vec3,
  GAME_ASPECT,
} from '../src/playerCamera';
import { groundGrid, packGround, rootY, WalkMode, EYE_HEIGHT, TICK } from '../src/walk';
import { STANCE_HOLD_S_PLACEHOLDER } from '../src/stanceButton';
import { STANCE } from '../src/mover';

/**
 * The game's third-person camera (web sprint 2, W2.1): `FUN_0029a950`'s target and eye, `FUN_00296f10`'s look line,
 * `FUN_0029bf70`'s pass, `FUN_0029bc90`'s placement (`playerCamera.ts`'s header). Synthetic worlds pin the rules
 * against research 17 section 1's console numbers; Frostfire's spawn A pins the whole on the disc's hull.
 */

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

function quad(points: number[], ditype: number, path: string): WorldPoly {
  return { modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) };
}
const floor = (y: number): WorldPoly => quad([-200, y, -200, 200, y, -200, 200, y, 200, -200, y, 200], 3, 'worldmodel/floor');
/** A vertical wall across x at `z`, x0..x1, y0..y1. */
const wallZ = (z: number, x0: number, x1: number, y0 = 0, y1 = 60): WorldPoly => quad([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], 2, 'worldmodel/wallz');
/** A vertical wall across z at `x`, z0..z1, y0..y1. */
const wallX = (x: number, z0: number, z1: number, y0 = 0, y1 = 60): WorldPoly => quad([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0], 2, 'worldmodel/wallx');
/**
 * LATER 1057: the same face wound the other way, its normal reversed. The pass is one-sided on the hull (a face counts
 * only entered from its front: `FUN_002d2890` side mode 0x20, research 382 s8), and `wallZ` faces +z -- the camera's
 * side at yaw 0 -- so a wall meant to stand behind the body and stop the boom is wound to face the body (-z).
 */
const rewound = (p: WorldPoly): WorldPoly => {
  const q = p.points, out: number[] = [];
  for (let i = q.length / 3 - 1; i >= 0; i--) out.push(q[i * 3]!, q[i * 3 + 1]!, q[i * 3 + 2]!);
  return { ...p, points: Float32Array.from(out) };
};

function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

const STAND = 11.484, CROUCH = 5.504;
/** The console's own root at spawn, research 17 section 1 (`walk.ts` keeps it to three places). */
const CONSOLE_ROOT = 5.50391;
const ORIGIN: Vec3 = [0, 0, 0];
const close = (a: readonly number[], b: readonly number[], digits = 3): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v, `component ${i}: ${a.join(', ')} against ${b.join(', ')}`).toBeCloseTo(b[i]!, digits));
};
/** Runs `ticks` camera ticks standing still at `feet`, facing `yaw`, at `pitch`, with `root`. */
function settle(cam: PlayerCamera, feet: Vec3, yaw: number, pitch: number, root: number, ticks = 1): void {
  for (let i = 0; i < ticks; i++) cam.tick(feet, yaw, pitch, root);
}

describe('FUN_0029a950: the ramp and the target (research 17 section 3)', () => {
  it('the ramp at rootY 5.504, 5.6, 2.169 and 0 is 9.874, 10.0, 5.5 and 10.0 (the no-root fallback)', () => {
    expect(ramp(5.504)).toBeCloseTo(9.874, 3);
    expect(ramp(5.6)).toBe(10);
    expect(ramp(2.169)).toBe(5.5);
    expect(ramp(0)).toBe(10);
    expect(ramp(11.484)).toBe(10);                                          // standing: saturated
  });

  it('the target is 15.378 over the feet crouched (the console\'s 15.3782) and 21.484 standing', () => {
    expect(lookHeight(CROUCH)).toBeCloseTo(15.378, 3);
    expect(lookHeight(STAND)).toBeCloseTo(21.484, 3);
    expect(rootY('stand')).toBe(STAND);
    expect(rootY('crouch')).toBe(CROUCH);
  });

  it('the rest pitch is dynamics.rdr\'s init_aim_pitch, -9.167 degrees (the console\'s actor+0x1070 quaternion)', () => {
    expect(SEAL_TUNING.initAimPitch).toBe(-9.167);
    expect(INIT_AIM_PITCH).toBe(-9.167);
  });

  it('at pitch 0 the goal is 28 behind the target, level (fStack_8 + 28.0)', () => {
    const local = localCamera(STAND, 0);
    close(local.target, [0, 21.484, 0]);
    close(local.eye, [0, 21.484, CAM_BACK]);
    expect(local.dist).toBeCloseTo(28, 9);
  });

  it('with the console\'s crouched spawn geometry it is the console\'s local eye (0, 19.483, 24.166) exactly: the pitch shortens it, not the pass', () => {
    // research 17 section 4.1 row #13: target local (0, 15.378, -1.274), eye local (0, 19.483, 24.166)
    const local = localCamera(CONSOLE_ROOT, INIT_AIM_PITCH);
    close(local.target, [0, 15.378, -1.2745]);             // -8 x 0.15931; research 17 prints -1.274
    close(local.eye, [0, 19.483, 24.166]);
    expect(local.dist).toBeCloseTo(25.770, 3);                              // 28 + |sin p| x (14 - 28)
  });
});

describe('the placed camera on open ground (FUN_0029bf70 with no hit, FUN_0029bc90)', () => {
  const open = world([floor(0)]);

  it('pitch 0, standing: the eye 28.75 behind the feet (the pass reaches 0.75 past the goal) and 21.484 up', () => {
    const cam = new PlayerCamera(open);
    settle(cam, ORIGIN, 0, 0, STAND);
    const v = cam.view(1);
    close(v.target, [0, 21.484, 0]);
    close(v.eye, [0, 21.484, 28 + CAM_MARGIN]);                              // yaw 0 faces -z: behind is +z
    close(v.far, [0, 21.484, -1000]);
    // Turned to face -x (yaw 90), the camera is behind on +x.
    settle(cam, ORIGIN, 90, 0, STAND);
    close(cam.view(1).eye, [28.75, 21.484, 0]);
  });

  it('crouched at the rest pitch it is the console\'s smoothed eye: 19.603 up and 24.906 behind (cam+0xd8)', () => {
    // research 17 section 1: player (939.4391, -145.8672, 857.0661), cam+0xd8 (939.439, -126.264, 832.160); the
    // console's view runs +z, ours at yaw 0 runs -z, so its -24.906 is our +24.906.
    const cam = new PlayerCamera(open);
    settle(cam, [10, 0, 20], 0, INIT_AIM_PITCH, CONSOLE_ROOT);
    const v = cam.view(1);
    close(v.eye, [10, 19.603, 20 + 24.906]);
    close(v.target, [10, 15.378, 20 - 1.2745]);
    expect(cam.distance()).toBeCloseTo(26.51936, 3);                          // DAT_003de268 on the dump
  });

  it('standing at the rest pitch: 25.709 up, 24.906 behind', () => {
    const cam = new PlayerCamera(open);
    settle(cam, ORIGIN, 0, INIT_AIM_PITCH, STAND);
    close(cam.view(1).eye, [0, 25.709, 24.906]);
  });

  it('the view line runs from the eye through the target to the far point, so the reticle sits on the frame\'s centre', () => {
    const cam = new PlayerCamera(open);
    settle(cam, ORIGIN, 30, INIT_AIM_PITCH, STAND);
    const v = cam.view(1);
    const three = new PerspectiveCamera(49, 640 / 448, 4, 4000);
    three.position.set(...v.eye);
    three.lookAt(...v.target);
    three.updateMatrixWorld(true);
    const [nx, ny] = aimPoint(three, v.far);
    expect(nx).toBeCloseTo(0.5, 6);
    expect(ny).toBeCloseTo(0.5, 6);
  });

  it('draws between ticks: view(alpha) is the eye between the last two ticks', () => {
    const cam = new PlayerCamera(open);
    settle(cam, ORIGIN, 0, 0, STAND);
    settle(cam, [0, 0, -10], 0, 0, STAND);
    close(cam.view(0).eye, [0, 21.484, 28.75]);
    close(cam.view(0.5).eye, [0, 21.484, 23.75]);
    close(cam.view(1).eye, [0, 21.484, 18.75]);
  });

  it("with no posed root a stance change moves the root over seal_stand2crouch's 0.603 s, not in one frame (research 180 s1.10)", () => {
    expect(ROOT_RATE_READING).toBeCloseTo((11.484 - 5.504) / (0.65 * (26 / 27) ** 2), 9);   // 9.92 a second
    const cam = new PlayerCamera(open);
    settle(cam, ORIGIN, 0, 0, STAND);
    settle(cam, ORIGIN, 0, 0, CROUCH);
    expect(cam.rootY()).toBeLessThan(STAND);
    expect(cam.rootY()).toBeGreaterThan(CROUCH);
    settle(cam, ORIGIN, 0, 0, CROUCH, 34);                                 // 35 ticks: 0.583 s, not yet down
    expect(cam.rootY()).toBeGreaterThan(CROUCH);
    settle(cam, ORIGIN, 0, 0, CROUCH, 2);                                  // 37 ticks: past 0.603 s
    expect(cam.rootY()).toBe(CROUCH);
  });

  it("the body's posed root is taken as it stands (FUN_0029a950 reads the posed skel_root): the jump's 15.08 at once", () => {
    const cam = new PlayerCamera(open);
    cam.tick(ORIGIN, 0, 0, STAND, 1 / 60, true);
    cam.tick(ORIGIN, 0, 0, 15.08, 1 / 60, true);
    expect(cam.rootY()).toBe(15.08);
    expect(cam.view(1).target[1]).toBeCloseTo(15.08 + 10, 6);            // the ramp is at its top over 5.6
  });
});

describe('the pass against the hull (FUN_0029bf70)', () => {
  it('a wall 10 behind the actor pulls the eye in to 0.75 short of it, never through', () => {
    const cam = new PlayerCamera(world([floor(0), rewound(wallZ(10, -50, 50))]));
    for (let i = 0; i < 120; i++) {
      settle(cam, ORIGIN, 0, 0, STAND);
      const eye = cam.view(1).eye;
      expect(eye[2]).toBeLessThanOrEqual(10 - CAM_MARGIN + 1e-9);
    }
    close(cam.view(1).eye, [0, 21.484, 10 - CAM_MARGIN]);
    // At any pitch the eye stays on the actor's side of the wall.
    for (const pitch of [-60, -30, INIT_AIM_PITCH, 20, 50]) {
      settle(cam, ORIGIN, 0, pitch, STAND, 5);
      expect(cam.view(1).eye[2], `pitch ${pitch}`).toBeLessThan(10);
    }
  });

  it('a camera-type-1 polygon within 2.75 of the target is passed over for the next hit (FUN_0029cd20); at 5 it stops the eye', () => {
    const typeOne = (z: number): WorldPoly => ({ ...rewound(wallZ(z, -50, 50)), cameratype: 1, path: 'worldmodel/camera1' });
    const near = new PlayerCamera(world([floor(0), typeOne(2), rewound(wallZ(10, -50, 50))]));
    settle(near, ORIGIN, 0, 0, STAND, 3);
    close(near.view(1).eye, [0, 21.484, 10 - CAM_MARGIN]);                  // not inside the head, 1.25 behind the target
    const far = new PlayerCamera(world([floor(0), typeOne(5), rewound(wallZ(10, -50, 50))]));
    settle(far, ORIGIN, 0, 0, STAND, 3);
    close(far.view(1).eye, [0, 21.484, 5 - CAM_MARGIN]);
  });

  it('a filtered hit still counts as a hit (DAT_00416038): the distance lets out during the hold', () => {
    // A plain wall behind x < 0 only, a type-1 polygon 2 behind everywhere.
    const typeOne: WorldPoly = { ...rewound(wallZ(2, -100, 100)), cameratype: 1, path: 'worldmodel/camera1' };
    const cam = new PlayerCamera(world([floor(0), rewound(wallZ(10, -100, 0)), typeOne]));
    settle(cam, [-10, 0, 0], 0, 0, STAND, 3);                               // the plain wall behind: pulled in, held
    expect(cam.distance()).toBeCloseTo(9.25, 6);
    settle(cam, [20, 0, 0], 0, 0, STAND, 1);                                // past its end: only the filtered hit
    // Out at once, the hold notwithstanding: one 60 Hz tick is half a game frame of the 3 % (PF-02, research 180 U2).
    expect(cam.distance()).toBeCloseTo(9.25 + (1 - 0.97 ** (1 / 60 / GAME_FRAME_DT)) * (28.75 - 9.25), 6);
  });

  it('lets out 3 % of the gap a game frame of 525/15734 s, not a 60 Hz tick: a time constant of 1.09 s (research 180 U2)', () => {
    // DAT_003de270 = 0.03 is FUN_0029bf70's per call, once a game frame (research 180 sections 0 and 2.3, U2; research 208).
    const target: Vec3 = [0, 20, 0], eye: Vec3 = [0, 20, 28];                // reach 28 + 0.75
    const out = (steps: number[]): number => {
      const s = { ...newPassState(), dist: 10 };
      for (const dt of steps) cameraPass(null, target, eye, s, dt);
      return s.dist;
    };
    expect(out([GAME_FRAME_DT])).toBeCloseTo(10 + CAM_REGROW * 18.75, 9);    // one frame: 3 % of the gap
    expect(out([GAME_FRAME_DT / 2, GAME_FRAME_DT / 2])).toBeCloseTo(10 + CAM_REGROW * 18.75, 9);   // the same frame in halves
    expect(out([1 / 60])).toBeCloseTo(10 + (1 - (1 - CAM_REGROW) ** (1 / 60 / GAME_FRAME_DT)) * 18.75, 9);   // 1.51 %, not 3
    expect(-GAME_FRAME_DT / Math.log(1 - CAM_REGROW)).toBeCloseTo(1.0955, 4); // the time constant, s (0.55 at 60 Hz)
    expect(out(Array.from({ length: 30 }, () => GAME_FRAME_DT))).toBeCloseTo(28.75 - 18.75 * 0.97 ** 30, 9);
  });

  it('holds the pulled-in distance 1.5 s after the last hit, then lets it out at 3 % a game frame', () => {
    const cam = new PlayerCamera(world([floor(0), rewound(wallZ(10, -50, 50))]));
    settle(cam, ORIGIN, 0, 0, STAND, 5);
    expect(cam.distance()).toBeCloseTo(10 - CAM_MARGIN, 6);
    const away: Vec3 = [120, 0, 0];                                          // past the wall's end: nothing behind
    settle(cam, away, 0, 0, STAND, 85);
    expect(cam.distance()).toBeCloseTo(9.25, 6);                             // cam+0x4c still counting down
    settle(cam, away, 0, 0, STAND, 10);
    expect(cam.distance()).toBeGreaterThan(9.3);
    expect(cam.distance()).toBeLessThan(28.75);
    settle(cam, away, 0, 0, STAND, 400);                                     // 6.7 s out: ~6 time constants of 1.09 s
    expect(28.75 - cam.distance()).toBeGreaterThan(0.03);                   // 19.5 x 0.97^(6.75 s / 525/15734) = 0.041
    expect(28.75 - cam.distance()).toBeLessThan(0.05);                      // (at the old 60 Hz tick it was 0.0001)
    settle(cam, away, 0, 0, STAND, 500);
    expect(cam.distance()).toBeCloseTo(28.75, 2);
  });

  it('the four side probes push the eye 0.75 off a wall beside it; the drawn eye then clears the near rectangle', () => {
    // A wall along the view line 0.5 to the eye's right (+x at yaw 0): the +side probe ends 0.25 inside it.
    // FUN_0029bf70 still stops 0.75 short. The 16:9 near plane is wider than that (research 90 §10), so the eye the
    // frame is drawn from is pushed further off the wall, along it, not back toward the player.
    const grid = world([floor(0), wallX(0.5, 5, 60)]);
    const local = localCamera(STAND, 0);
    const target = toWorld(ORIGIN, 0, local.target);
    const eye0 = toWorld(ORIGIN, 0, [
      local.target[0] + local.back[0] * local.dist,
      local.target[1] + local.back[1] * local.dist,
      local.target[2] + local.back[2] * local.dist,
    ]);
    const passed = cameraPass(grid, target, eye0, newPassState());
    expect(passed[0]).toBeCloseTo(0.5 - CAM_MARGIN, 6);
    expect(passed[2]).toBeCloseTo(28.75, 6);
    // H309 ("no see through anywhere"): at the game's frame (the default) and at 4:3 the drawn eye is pushed off the wall
    // too (NEAR_CLEARANCE_ADAPTATION), its rectangle clear; the game's eye stays the pass's.
    for (const aspect of [GAME_ASPECT, 4 / 3]) {
      const game = new PlayerCamera(grid);
      game.nearAspect = aspect;
      settle(game, ORIGIN, 0, 0, STAND);
      const v = game.view(1);
      expect(v.eye[0], `aspect ${aspect}`).toBeLessThan(passed[0] - 1);
      expect(v.aim.eye[0]).toBeCloseTo(passed[0], 6);
      for (const c of nearRectCorners(v.eye, v.target, aspect)!) expect(segmentHit(grid, v.eye, c, isCameraSurface)).toBeNull();
    }
    // A 16:9 window: the wider rectangle pushes the drawn eye further off the wall.
    const cam = new PlayerCamera(grid);
    cam.nearAspect = 16 / 9;
    settle(cam, ORIGIN, 0, 0, STAND);
    const eye = cam.view(1).eye;
    // The look translates with the eye, so a lateral step moves the corner one-to-one and the eye stops at the gap
    // (research 90 §10). Was -3.27 while the look stayed put and the rectangle yawed, which needed a longer step.
    expect(eye[0]).toBeCloseTo(-2.855, 2);
    expect(eye[2]).toBeCloseTo(28.75, 6);
    // #479's review F1: only the drawn eye moves; the game's (the shot's and the order's) stays the pass's.
    expect(cam.view(1).aim.eye[0]).toBeCloseTo(passed[0], 6);
    expect(cam.view(1).aim.eye[2]).toBeCloseTo(passed[2], 6);
    const corners = nearRectCorners(eye, cam.view(1).target, 16 / 9);
    expect(corners).not.toBeNull();
    for (const c of corners!) expect(segmentHit(grid, eye, c, isCameraSurface)).toBeNull();
  });

  /**
   * The reticle is the game's aim point (`viewFar`, the pass's eye through its target) projected through the drawn
   * camera (`matchFirearm.ts` `aimReticle`). Beside a wall the near clearance slides the drawn eye off that line.
   * The look has to stay parallel to the aim, or the point leaves the frame's centre.
   */
  function aimScreenX(cam: PlayerCamera, aspect: number): number {
    const v = cam.view(1);
    const far = viewFar(v.aim.eye, v.aim.target, v.far);
    const three = new PerspectiveCamera(49, aspect, 4, 4000);
    three.position.set(v.eye[0]!, v.eye[1]!, v.eye[2]!);
    three.lookAt(v.target[0]!, v.target[1]!, v.target[2]!);
    three.updateMatrixWorld(true);
    return aimPoint(three, far)[0];
  }

  it('walking up beside a wall, the aim point stays at the frame centre and the near rectangle stays clear', () => {
    // The wall runs along the boom (x = 0.5, through the eye's z). Feet close in +x until the eye is beside it,
    // the case the side-probe test settles at the origin. The pass may nudge the eye; the drawn view must not
    // yaw off the aim, and the near corners must still miss the face.
    const grid = world([floor(0), wallX(0.5, -40, 80)]);
    for (const aspect of [GAME_ASPECT, 16 / 9, 21 / 9]) {
      const cam = new PlayerCamera(grid);
      cam.nearAspect = aspect;
      let prev = 0.5;
      const trace: string[] = [];
      for (let x = -8; x <= 0; x += 0.5) {
        cam.tick([x, 0, 0], 0, 0, STAND);
        const v = cam.view(1);
        const nx = aimScreenX(cam, aspect);
        trace.push(`x ${x.toFixed(1)} screen ${nx.toFixed(3)} eye ${v.eye[0]!.toFixed(2)} aim ${v.aim.eye[0]!.toFixed(2)}`);
        expect(Math.abs(nx - 0.5), `aspect ${aspect} feet x ${x} screen ${nx}\n${trace.join('\n')}`).toBeLessThan(0.02);
        expect(Math.abs(nx - prev), `aspect ${aspect} feet x ${x} jumped ${nx - prev}`).toBeLessThan(0.02);
        // The shot's eye stays the pass's (a side nudge of at most 0.75), not the drawn eye's slide.
        expect(Math.abs(v.aim.eye[0] - x), `aspect ${aspect} feet x ${x} aim ${v.aim.eye[0]}`).toBeLessThan(CAM_MARGIN + 0.05);
        prev = nx;
        const corners = nearRectCorners(v.eye, v.target, aspect);
        expect(corners, `aspect ${aspect}`).not.toBeNull();
        for (const c of corners!) expect(segmentHit(grid, v.eye, c, isCameraSurface), `aspect ${aspect} feet x ${x}`).toBeNull();
      }
    }
  });

  it('a ceiling over the eye: the pass stops 0.75 short, the drawn eye clears the near rectangle', () => {
    const ceiling = quad([-50, 22, 20, 50, 22, 20, 50, 22, 40, -50, 22, 40], 3, 'worldmodel/ceiling');
    const grid = world([floor(0), ceiling]);
    const local = localCamera(STAND, 0);
    const target = toWorld(ORIGIN, 0, local.target);
    const eye0 = toWorld(ORIGIN, 0, [
      local.target[0] + local.back[0] * local.dist,
      local.target[1] + local.back[1] * local.dist,
      local.target[2] + local.back[2] * local.dist,
    ]);
    const passed = cameraPass(grid, target, eye0, newPassState());
    expect(passed[1]).toBeCloseTo(22 - CAM_MARGIN, 6);
    const game = new PlayerCamera(grid);                                 // the game's frame: cleared too (H309)
    settle(game, ORIGIN, 0, 0, STAND);
    expect(game.view(1).eye[1]).toBeLessThan(passed[1] - 1);
    expect(game.view(1).aim.eye[1]).toBeCloseTo(passed[1], 6);
    for (const c of nearRectCorners(game.view(1).eye, game.view(1).target, GAME_ASPECT)!) expect(segmentHit(grid, game.view(1).eye, c, isCameraSurface)).toBeNull();
    const cam = new PlayerCamera(grid);
    cam.nearAspect = 16 / 9;                                              // a 16:9 window
    settle(cam, ORIGIN, 0, 0, STAND);
    const eye = cam.view(1).eye;
    // Same translation as the side wall: the corner moves with the eye, so the step is the gap, not the yawed one (was 19.87).
    expect(eye[1]).toBeCloseTo(20.065, 2);
    expect(eye[1]).toBeLessThan(22 - CAM_MARGIN);
    const corners = nearRectCorners(eye, cam.view(1).target, 16 / 9);
    expect(corners).not.toBeNull();
    for (const c of corners!) expect(segmentHit(grid, eye, c, isCameraSurface)).toBeNull();
  });
});

// LATER 308 (research 201 section 14): `FUN_0029a950` reads the lead probe's start z, `param_3[2]` (`sp+0x1c8`), before
// writing it (D:L142498-142518) -- an uninitialised stack word, `LEAD_PROBE_START_PLACEHOLDER`. Started at last frame's
// output, a surface inside the probe's 8 gives Z_n = L0 + 8 + W - Z_{n-1}: a two-frame orbit of the eye with the body
// still (Fuse's disc check r7). The placeholder's value starts it at this frame's target. (The cases are Fuse's,
// `325f24fb6` / `bf1fd1b1f`.)
describe('the lead probe while the body stands still (FUN_0029cbb0, LATER 308)', () => {
  // Pitch -65 is past n.y 0.625, so the probe runs: 8 ahead (actor -z). Yaw 20 turns a local-z change into world x and z.
  const PITCH = -65, YAW = 20;

  it('the start is the placeholder\'s: this frame\'s target', () => {
    expect(LEAD_PROBE_START_PLACEHOLDER).toBe('target');
  });

  it('in the open, a held downward look does not move the eye', () => {
    const cam = new PlayerCamera(world([floor(0)]));
    settle(cam, ORIGIN, YAW, PITCH, STAND, 5);
    const eye = cam.view(1).eye;
    settle(cam, ORIGIN, YAW, PITCH, STAND, 90);
    close(cam.view(1).eye, eye, 6);
  });

  it('a wall in the 8 ahead pulls the look target back once, and the eye stays there', () => {
    // The lead at this pitch is about -7.25, so z = -10 sits inside the 8-unit probe.
    const cam = new PlayerCamera(world([floor(0), wallZ(-10, -50, 50)]));
    const open = new PlayerCamera(world([floor(0)]));
    settle(cam, ORIGIN, YAW, PITCH, STAND, 2);
    settle(open, ORIGIN, YAW, PITCH, STAND, 2);
    const held = cam.view(1).eye;
    let min = [...held] as Vec3, max = [...held] as Vec3;
    for (let i = 0; i < 90; i++) {
      cam.tick(ORIGIN, YAW, PITCH, STAND);
      const eye = cam.view(1).eye;
      min = [Math.min(min[0], eye[0]), Math.min(min[1], eye[1]), Math.min(min[2], eye[2])];
      max = [Math.max(max[0], eye[0]), Math.max(max[1], eye[1]), Math.max(max[2], eye[2])];
    }
    // From last frame's output: several units in and out along the lead, the height fixed (RED before LATER 308).
    expect(max[0] - min[0]).toBeLessThan(1e-4);
    expect(max[1] - min[1]).toBeLessThan(1e-4);
    expect(max[2] - min[2]).toBeLessThan(1e-4);
    close(cam.view(1).eye, held, 6);
    expect(Math.hypot(held[0] - open.view(1).eye[0], held[2] - open.view(1).eye[2])).toBeGreaterThan(1);
  });
});

describe('the look limits and the eye of the scope', () => {
  it('the pitch is the aim pitch: min/max_aim_pitch -70..60, prone -20..25 (FUN_00594600)', () => {
    expect(pitchLimits('stand')).toEqual([-70, 60]);
    expect(pitchLimits('crouch')).toEqual([-70, 60]);
    expect(pitchLimits('prone')).toEqual([-20, 25]);
  });

  it('the scope puts the eye on the skeleton root (FUN_0029ae50, PF-05): + 4.4 standing and crouched, + 3.6 prone on flat ground', () => {
    expect(scopeEyeHeight('stand', rootY('stand'))).toBeCloseTo(15.884, 9);
    expect(scopeEyeHeight('crouch', rootY('crouch'))).toBeCloseTo(9.904, 9);
    expect(scopeEyeHeight('prone', rootY('prone'))).toBeCloseTo(rootY('prone') + 3.6, 9);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The mode: third person, or the view from the head (first person and the scope, both the zoom's: the owner, 2026-10-01), the mouse on
// the body's yaw and the camera's pitch, and C's stance (a tap toggles crouch, a hold goes prone).

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};
const GROUND = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [floor(0)], [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }],
);

describe('walk mode\'s camera (W2.1)', () => {
  const made: WalkMode[] = [];
  const setUp = () => {
    const c = canvas();
    const fly = new FlyCamera(c);
    fly.setScale(0.1);
    const mode = new WalkMode(fly);
    mode.setGround(GROUND, [150, 0, 150]);
    mode.bindKey();
    made.push(mode);
    return { fly, mode, c };
  };
  afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

  it('the window\'s aspect reaches the near rectangle: a wider one pushes further, a square one less (H309: every aspect)', () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const polys = [floor(0), wallX(3.8, 5, 60)];
    const ground = packGround(params, polys, polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}#${i}`, first: i, count: 1 })));
    const stand = (aspect: number): { drawn: Vec3; aim: Vec3; look: Vec3; game: { eye: Vec3; target: Vec3 } | null } => {
      const fly = new FlyCamera(canvas());
      fly.setAspect(aspect);
      fly.setScale(0.1);
      fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
      const mode = new WalkMode(fly);
      mode.setGround(ground, [0, 0, 0]);
      mode.bindKey();
      made.push(mode);
      mode.setMode('walk');
      const s = mode.cameraState()!;
      return { drawn: s.drawnEye, aim: s.eye, look: mode.lookAim()!.eye, game: mode.gameCamera() };
    };
    const eye16 = stand(16 / 9);
    const eye21 = stand(21 / 9);
    const square = stand(1);
    expect(eye21.drawn[0]).toBeLessThan(eye16.drawn[0] - 0.4);
    // The wall at x 3.8 is past the 16:9 rectangle's half-width (3.24), and the square's: neither needs a push there.
    expect(square.drawn[0]).toBeCloseTo(eye16.drawn[0], 4);
    expect(square.drawn[2]).toBeCloseTo(eye16.drawn[2], 4);
    // #479's review F1: the drawn camera moves, the game's eye (the shot's and the order's) does not -- whatever the window.
    expect(eye21.aim).toEqual(square.aim);
    expect(eye16.aim).toEqual(square.aim);
    // #479's re-review F1, F2, F4: the use prompt's ray (`lookAim`), the perception cone's apex and the listener
    // (`gameCamera`) take the game's eye, never the pushed one -- on the ground MISSION R8's lift is 0.
    expect(eye21.drawn).not.toEqual(eye21.aim);
    expect(eye21.look).toEqual(eye21.aim);
    expect(eye21.game?.eye).toEqual(eye21.aim);
    expect(eye21.game?.eye).not.toEqual(eye21.drawn);
    expect(eye21.game?.target).toEqual(square.game?.target);
  });

  it('the game camera is asked only in third person: the scope draws the game\'s own (`gameCamera` null)', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    expect(mode.gameCamera()).not.toBeNull();
    mode.setScoped(true);
    mode.frame(1 / 60);
    expect(mode.gameCamera()).toBeNull();
  });

  it('lifted by MISSION R8\'s drawn offset beside the wall at 21:9: the use prompt\'s eye and the game camera are the game\'s eye plus the lift, never the pushed one', () => {
    // #479's second re-review F1: the private drawnEye/drawnTarget (lookAim's, gameCamera's) lift the game's eye, not frameEye.
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const polys = [floor(0), wallX(3.8, 5, 60)];
    const ground = packGround(params, polys, polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}#${i}`, first: i, count: 1 })));
    const fly = new FlyCamera(canvas());
    fly.setAspect(21 / 9);
    fly.setScale(0.1);
    fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
    const mode = new WalkMode(fly);
    mode.setGround(ground, [0, 0, 0]);
    mode.bindKey();
    made.push(mode);
    mode.setMode('walk');
    const w = (mode as unknown as { walker: { drawOffset: Vec3; drawnFeet(): Vec3; tickFeet(): Vec3 } }).walker;
    w.drawOffset = [0, 2, 0];                                          // as the turret page sets it, after the tick
    mode.frame(1 / 60);
    const s = mode.cameraState()!, look = mode.lookAim()!, game = mode.gameCamera()!;
    const d = [0, 1, 2].map((k) => w.drawnFeet()[k]! - w.tickFeet()[k]!);
    expect(d[1]).toBeCloseTo(2, 6);
    for (let k = 0; k < 3; k++) {
      expect(look.eye[k]!, `the use prompt's eye, axis ${k}`).toBeCloseTo(s.eye[k]! + d[k]!, 6);
      expect(game.eye[k]!, `the game camera's eye, axis ${k}`).toBeCloseTo(s.eye[k]! + d[k]!, 6);
    }
    expect(Math.abs(s.drawnEye[0] - look.eye[0]), 'the pushed (drawn) eye stands off the use prompt\'s').toBeGreaterThan(0.4);
  });

  it('enters in third person at the rest pitch, the camera behind and over the feet; the hook reads it', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    expect(mode.feet()).toEqual([0, 0, 0]);
    const cam = mode.cameraState()!;
    expect(cam.mode).toBe('third');
    expect(cam.pitch).toBeCloseTo(INIT_AIM_PITCH, 9);
    expect(cam.rootY).toBe(STAND);
    close(cam.target, [0, 21.484, -1.2745]);
    close(cam.eye, [0, 25.709, 24.906]);
    close([fly.camera.position.x, fly.camera.position.y, fly.camera.position.z], cam.eye);
    expect(fly.pose().pitch).toBeCloseTo(INIT_AIM_PITCH, 9);
  });

  it('no first-person key: V is not bound; the view from the head (first person, the scope: the zoom) is setScoped', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    const e = new KeyboardEvent('keydown', { code: 'KeyV', cancelable: true });
    globalThis.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(mode.cameraState()!.mode).toBe('third');
    expect((mode as unknown as Record<string, unknown>).setView).toBeUndefined();
    mode.setScoped(true);
    expect(mode.view()).toBe('scope');
    expect(mode.cameraState()!.mode).toBe('scope');
    close([fly.camera.position.x, fly.camera.position.y, fly.camera.position.z], [0, rootY('stand') + 4.4, -2.5]);   // FUN_0029ae50 (PF-05)
    expect(fly.camera.rotation.y).toBeCloseTo(0, 9);
    expect(fly.camera.rotation.x).toBeCloseTo((INIT_AIM_PITCH * Math.PI) / 180, 9);
    mode.setScoped(false);
    expect(mode.cameraState()!.mode).toBe('third');
  });

  it('C: a tap toggles stand and crouch, from prone a tap crouches, a hold of 0.4 s goes prone (owner, 2026-09-29)', () => {
    const { fly, mode } = setUp();
    mode.setStanceMode('separate');                                // OT.R67: KEY_STANCE is the fallback's (the default's: pronePopWalk.test.ts)
    fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    const key = (type: 'keydown' | 'keyup', init: KeyboardEventInit = {}): boolean => {
      const e = new KeyboardEvent(type, { code: 'KeyC', cancelable: true, ...init });
      globalThis.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const frames = (seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += TICK) mode.frame(TICK); };
    // A quick tap, down and up between two frames, still counts: the press is latched for the next frame.
    expect(key('keydown')).toBe(true);
    key('keyup');
    frames(2 * TICK);
    expect(mode.stance()).toBe('crouch');
    key('keydown'); frames(0.1); key('keyup'); frames(TICK);
    expect(mode.stance()).toBe('stand');
    frames(1);                                         // PAR-19: Stand -> Crouch (0x11) on top refuses prone (D:L418932)
    // The hold acts at the threshold, still down, and its release does nothing more; the key's auto-repeat is ignored.
    key('keydown');
    frames(STANCE_HOLD_S_PLACEHOLDER - 3 * TICK);
    key('keydown', { repeat: true });
    expect(mode.stance()).toBe('stand');
    frames(5 * TICK);                                  // the press's own frame counts nothing (`StanceButton`): one more
    expect(mode.stance()).toBe('prone');
    key('keyup'); frames(TICK);
    expect(mode.stance()).toBe('prone');
    // From prone: a tap crouches, a hold stays prone.
    key('keydown'); frames(0.6); key('keyup'); frames(TICK);
    expect(mode.stance()).toBe('prone');
    frames(0.5);                                       // PAR-19: Stand -> Prone (0x19) on top refuses crouch (D:L418953)
    key('keydown'); frames(TICK); key('keyup'); frames(TICK);
    expect(mode.stance()).toBe('crouch');
    // A hold from crouched goes prone too.
    key('keydown'); frames(0.5); key('keyup'); frames(TICK);
    expect(mode.stance()).toBe('prone');
    // Ctrl+C is the browser's copy; in the fly camera C is nobody's.
    expect(key('keydown', { ctrlKey: true })).toBe(false);
    key('keyup', { ctrlKey: true });
    mode.setMode('fly');
    expect(key('keydown')).toBe(false);
    key('keyup');
  });

  /** A drag on the canvas: down, one move of (dx, dy) pixels, up -- by a mouse or a finger. */
  const dragOn = (c: HTMLCanvasElement, pointerType: 'mouse' | 'touch') => (dx: number, dy: number): void => {
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 100, clientY: 100, pointerType }));
    c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy, pointerType }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, button: 0, clientX: 100 + dx, clientY: 100 + dy, pointerType }));
  };

  // OT.R38 / H115 (NET-LOOK, PR #61; research 223 §8): the mouse's drag look sits under a literal `import.meta.env.DEV`
  // only (`camera.ts` onPointerDown, `./mouseTesting`), never devmode; vitest runs as a development build, so the mouse
  // path is attached here. The release half (no mouse site in a built bundle) is `build_keyboard.test.ts`'s.
  it('the mouse (a development build\'s) turns the body\'s yaw (research 83\'s raw mapping) and the pitch at pitch_rate / turn_maxrate of it, held', () => {
    expect(import.meta.env.DEV).toBe(true);                                 // the premise: the mouse path is attached
    const { fly, mode, c } = setUp();
    fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    const drag = dragOn(c, 'mouse');
    const before = fly.pose();
    drag(-20, -20);                                                          // the raw mapping: 20 counts, at once
    const after = fly.pose();
    const look = (MOUSE_RADIANS_PER_COUNT * 20 * 180) / Math.PI;
    expect(look).toBeCloseTo((0.0028 * 20 * 180) / Math.PI, 1);             // the fly camera's own feel, to 0.2 %
    expect(after.yaw - before.yaw).toBeCloseTo(look, 6);
    expect(after.pitch - before.pitch).toBeCloseTo(look * PITCH_PER_YAW, 6);
    expect(PITCH_PER_YAW).toBeCloseTo(SEAL_TUNING.pitchRate / SEAL_TUNING.turnMaxRate, 9);
    drag(0, -10000);
    expect(fly.pose().pitch).toBeCloseTo(60, 6);
    drag(0, 10000);
    expect(fly.pose().pitch).toBeCloseTo(-70, 6);
    // Prone: the limits are -20..25, and the pitch comes back to them at 0.5 rad/s (FUN_00594600), not at once.
    mode.setStance('prone');
    mode.frame(TICK);
    fly.update(TICK);
    expect(fly.pose().pitch).toBeCloseTo(-70 + (0.5 * TICK * 180) / Math.PI, 6);
    for (let i = 0; i < 120; i++) { mode.frame(TICK); fly.update(TICK); }
    expect(fly.pose().pitch).toBeCloseTo(-20, 6);
  });

  // TOUCH_LOOK_STICK_LAW_ADAPTATION (NET-LOOK 5fc264e56, PR #61; research 223 §8): a finger's drag, in every build, does
  // not move the look -- its angles (the raw mapping x TOUCH_LOOK) become a target the look reaches at most at the full
  // stick's rate, frame by frame; at a pitch limit the rest of the drag is spent.
  it('a finger\'s drag walking sets the look\'s target: reached frame by frame, never past the full stick\'s rate', () => {
    const { fly, mode, c } = setUp();
    fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    const drag = dragOn(c, 'touch');
    const DEG = 180 / Math.PI;
    const maxYaw = MAX_YAW_RATE * TICK * DEG, maxPitch = MAX_PITCH_RATE * TICK * DEG;
    /** Frames until the look stops moving; each frame's step held to the stick's law. */
    const settleLook = (): number => {
      let frames = 0;
      for (let quiet = 0; quiet < 3 && frames < 600; frames++) {
        const p0 = fly.pose();
        mode.frame(TICK);
        fly.update(TICK);
        const p1 = fly.pose();
        const dy = Math.abs(p1.yaw - p0.yaw), dp = Math.abs(p1.pitch - p0.pitch);
        expect(dy).toBeLessThanOrEqual(maxYaw + 1e-9);
        expect(dp).toBeLessThanOrEqual(maxPitch + 1e-9);
        quiet = dy < 1e-12 && dp < 1e-12 ? quiet + 1 : 0;
      }
      return frames;
    };
    const before = fly.pose();
    drag(-10, -10);                                                          // a touch drag turns twice as far (TOUCH_LOOK)
    expect(fly.pose().yaw).toBe(before.yaw);                                 // the drag alone moves nothing
    expect(fly.pose().pitch).toBe(before.pitch);
    settleLook();
    const look = (MOUSE_RADIANS_PER_COUNT * 10 * TOUCH_LOOK * 180) / Math.PI;
    expect(fly.pose().yaw - before.yaw).toBeCloseTo(look, 6);                // the whole drag arrives
    expect(fly.pose().pitch - before.pitch).toBeCloseTo(look * PITCH_PER_YAW, 6);
    // The limits: a long drag up is spent at 60, and the next drag down starts from there, not from the remainder.
    const lifted = fly.pose().pitch;
    drag(0, -10000);
    expect(fly.pose().pitch).toBe(lifted);                                   // not at once
    expect(settleLook()).toBeGreaterThan(30);                                // ~58.6 deg at 54.4 deg/s: about 32 ticks
    expect(fly.pose().pitch).toBeCloseTo(60, 6);
    drag(0, 10000);
    expect(fly.pose().pitch).toBeCloseTo(60, 6);
    expect(settleLook()).toBeGreaterThan(60);                                // 130 deg at 54.4 deg/s: about 72 ticks
    expect(fly.pose().pitch).toBeCloseTo(-70, 6);
  });

  it('a turn-only setCamera keeps the camera\'s pass: the pulled-in distance and the hold survive it', () => {
    const fly = new FlyCamera(canvas());
    const mode = new WalkMode(fly);
    made.push(mode);
    mode.setGround(packGround(
      { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
      [floor(0), rewound(wallZ(10, -50, 50))],
      [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/wall', first: 1, count: 1 }],
    ), null);
    fly.setPose({ x: 0, y: 30, z: 0, yaw: 0, pitch: 0 });
    mode.setMode('walk');
    mode.setCamera({ pitch: 0 });
    mode.frame(0.5);                                                         // 30 ticks against the wall behind
    const before = mode.cameraState()!.pass;
    expect(before.distance).toBeCloseTo(9.25, 6);
    expect(before.hold).toBeCloseTo(1.5, 6);
    mode.setCamera({ yaw: 180 });                                            // a turn: nothing behind now
    const after = mode.cameraState()!.pass;
    expect(after.distance).toBeCloseTo(9.25, 6);
    expect(after.hold).toBeCloseTo(1.5, 6);
    mode.frame(0.5);                                                         // held, counting down
    expect(mode.cameraState()!.pass.distance).toBeCloseTo(9.25, 6);
    expect(mode.cameraState()!.pass.hold).toBeCloseTo(1.0, 6);
    // A pose with a position is a new stand: a new camera.
    mode.setCamera({ x: 0, y: 30, z: 0, yaw: 0 });
    expect(mode.cameraState()!.pass.distance).toBeCloseTo(9.25, 6);       // the wall behind again, at once
    expect(mode.cameraState()!.pass.hold).toBeCloseTo(1.5, 6);
    mode.setCamera({ x: 0, y: 30, z: 0, yaw: 180 });
    expect(mode.cameraState()!.pass.distance).toBeCloseTo(28.75, 6);      // turned away, a new camera: no hold
  });

  it('the hook\'s setCamera still drops the mover from a pose, and walkFor moves the camera with the feet', () => {
    const { fly, mode } = setUp();
    fly.setPose({ x: 0, y: 30, z: 0 });
    mode.setMode('walk');
    mode.setCamera({ x: 50, y: EYE_HEIGHT, z: 50, yaw: 0, pitch: 0 });
    expect(mode.feet()).toEqual([50, 0, 50]);
    close(mode.cameraState()!.eye, [50, 21.484, 78.75]);
    mode.walkFor(1, { forward: 1, right: 0, boost: false });
    const feet = mode.feet()!;
    expect(feet[2]).toBeLessThan(0);
    close(mode.cameraState()!.eye, [50, 21.484, feet[2] + 28.75]);
  });
});

describe.skipIf(!MP2)(`the camera at Frostfire's spawn A${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('standing at A facing +z (along research 24\'s route), the eye is 25.709 over the floor and 24.906 behind, unobstructed', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const grid = groundGrid(map.ground!);
    const feet: Vec3 = [796, 100, 614];
    expect(probeFloor(grid, feet[0], feet[1], feet[2])?.y).toBe(100);
    // Facing +z is yaw 180: the camera stands on the -z side. Nothing between the target and 0.75 past the goal.
    const cam = new PlayerCamera(grid);
    settle(cam, feet, 180, INIT_AIM_PITCH, STAND, 3);
    const v = cam.view(1);
    close(v.eye, [796, 125.709, 614 - 24.906]);
    close(v.target, [796, 121.484, 614 + 1.2745]);
    expect(segmentHit(grid, v.target, v.eye)).toBeNull();
  });
});

describe('the peek on the camera (web research 86 section 4.2; FUN_0029a950, FUN_00297410)', () => {
  const open = world([floor(0)]);
  /** The horizontal angle, degrees, between the aim (eye to far) and the facing -z at yaw 0; + to the right. */
  const aimYaw = (v: { eye: Vec3; far: Vec3 }): number => (Math.atan2(v.far[0] - v.eye[0], -(v.far[2] - v.eye[2])) * 180) / Math.PI;

  it('a held right peek aims straight ahead: far = targetL + rotate(pitch, (0, 0, -1000)), the shift 2.8 across', () => {
    const cam = new PlayerCamera(open);
    cam.peek = 1;
    settle(cam, ORIGIN, 0, 0, STAND, 3);
    const v = cam.view(1);
    close(v.far, [2.8, 21.484, -1000]);                                      // not along -n: the shift is not in the aim
    expect(Math.abs(aimYaw(v))).toBeLessThan(0.2);                            // the game's 0.16 inward, from the eye 5.6 out
    expect(v.eye[0]).toBeCloseTo(5.6, 1);                                     // targetL.x 2.8 + n.x x dist 2.8
  });

  it('a held left peek likewise at the rest pitch: the shift 2.5, the eye 4.8 out (the pitch shortens it), the aim parallel', () => {
    const cam = new PlayerCamera(open);
    cam.peek = -1;
    settle(cam, ORIGIN, 0, INIT_AIM_PITCH, STAND, 3);
    const v = cam.view(1);
    expect(Math.abs(aimYaw(v))).toBeLessThan(0.2);
    expect(v.eye[0]).toBeCloseTo(localCamera(STAND, INIT_AIM_PITCH, -1).eye[0], 1);   // -2.5 - 2.5 x 25.8 / 28.1
    expect(v.far[0]).toBeCloseTo(-2.5, 3);
  });

  it('easing in, the eye only goes out and the aim never swings back toward the body', () => {
    const cam = new PlayerCamera(open);
    let lastEye = 0;
    for (let i = 0; i <= 60; i++) {
      cam.peek = 1 - Math.exp(-6 * i * TICK);                                // FUN_002998f0's ease at cam_peek_decay_rate 6
      cam.tick(ORIGIN, 0, INIT_AIM_PITCH, STAND);
      const v = cam.view(1);
      expect(v.eye[0]).toBeGreaterThanOrEqual(lastEye - 1e-9);
      expect(Math.abs(aimYaw(v))).toBeLessThan(0.2);
      lastEye = v.eye[0];
    }
  });
});

describe('JUMP_OVERHEAD_CAMERA_ADAPTATION: a jump under a roof keeps the drawn camera in the room', () => {
  /** `floor(h)` is wound facing down: the underside of a roof at `h`, with no face above it (a room's ceiling). */
  const roofed = (h: number): Grid => world([floor(0), floor(h)]);
  const jumped = (grid: Grid, feet: Vec3, root: number): PlayerCamera => {
    const cam = new PlayerCamera(grid);
    settle(cam, ORIGIN, 0, INIT_AIM_PITCH, STAND, 60);
    cam.jumping = true;                                                   // the walk's gate: the jump's action / the air
    cam.tick(feet, 0, INIT_AIM_PITCH, root, 1 / 60, true);
    cam.tick(feet, 0, INIT_AIM_PITCH, root, 1 / 60, true);
    return cam;
  };

  it('standing, the eye and the look point are under the roof; the standing jump\'s root and a running jump\'s feet leave them there', () => {
    for (const h of [23, 24, 26, 28, 30]) {
      const grid = roofed(h);
      for (const [feet, root] of [[ORIGIN, STAND], [ORIGIN, 15.08], [[0, 6, 0], STAND], [[0, 12, 0], STAND]] as [Vec3, number][]) {
        const v = jumped(grid, feet, root).view(1);
        expect(v.eye[1], `roof ${h}, feet ${feet[1]}, root ${root}: the eye`).toBeLessThan(h);
        expect(v.target[1], `roof ${h}, feet ${feet[1]}, root ${root}: the look point`).toBeLessThan(h);
        expect(segmentHit(grid, [feet[0], feet[1] + 1, feet[2]], v.eye), `roof ${h}, feet ${feet[1]}, root ${root}: the body sees its eye`).toBeNull();
      }
    }
  });

  it('with no roof over the body the jump\'s camera is the pass\'s own, untouched; the game\'s aim is the pass\'s under a roof too', () => {
    const open = new PlayerCamera(world([floor(0)]));
    settle(open, ORIGIN, 0, INIT_AIM_PITCH, STAND, 60);
    open.jumping = true;
    open.tick(ORIGIN, 0, INIT_AIM_PITCH, 15.08, 1 / 60, true); open.tick(ORIGIN, 0, INIT_AIM_PITCH, 15.08, 1 / 60, true);
    const free = open.view(1);
    close(free.eye, free.aim.eye, 6);
    close(free.target, free.aim.target, 6);
    const under = jumped(roofed(23), ORIGIN, 15.08).view(1);
    expect(under.aim.target[1]).toBeCloseTo(15.08 + 10, 6);                // the game's look point: the posed root's, as before
    expect(under.target[1]).toBeLessThan(23);
  });

  it('the airborne lift is rechecked where it is drawn: a lift that would carry the eye through the roof is held under it', () => {
    const still = new PlayerCamera(world([floor(0)]));
    settle(still, ORIGIN, 0, INIT_AIM_PITCH, STAND, 60);
    const h = still.view(1).eye[1] + 1.5;                                   // a roof the standing camera clears
    const cam = new PlayerCamera(roofed(h));
    cam.jumping = true;                                                     // airborne: the walk's gate (review F1)
    settle(cam, ORIGIN, 0, INIT_AIM_PITCH, STAND, 60);
    const flat = cam.view(1), lifted = cam.view(1, [0, 2.5, 0]);
    expect(flat.eye[1]).toBeLessThan(h);
    expect(flat.eye[1] + 2.5).toBeGreaterThan(h);                           // the lift added after the recheck crossed it
    expect(lifted.eye[1]).toBeLessThan(h);
    close(lifted.aim.eye, flat.aim.eye, 6);                                 // the game's aim is not lifted
    // In the open the lift is the plain offset.
    const openLift = still.view(1, [0, 2.5, 0]), openFlat = still.view(1);
    close(openLift.eye, [openFlat.eye[0], openFlat.eye[1] + 2.5, openFlat.eye[2]], 6);
    close(openLift.target, [openFlat.target[0], openFlat.target[1] + 2.5, openFlat.target[2]], 6);
  });

  it('a drawn offset that is no jump (a turret catch-up restart) does not open the cap: under the roof it is the plain offset (review F1)', () => {
    const still = new PlayerCamera(world([floor(0)]));
    settle(still, ORIGIN, 0, INIT_AIM_PITCH, STAND, 60);
    const h = still.view(1).eye[1] + 1.5;
    const cam = new PlayerCamera(roofed(h));                                // `jumping` false: on the floor
    settle(cam, ORIGIN, 0, INIT_AIM_PITCH, STAND, 60);
    const flat = cam.view(1), lifted = cam.view(1, [0, 2.5, 0]);
    const capped = new PlayerCamera(roofed(h)); capped.jumping = true;
    settle(capped, ORIGIN, 0, INIT_AIM_PITCH, STAND, 60);
    const cl = capped.view(1, [0, 2.5, 0]);
    // The cap did not open: the overhead axis clamp pulls the capped eye in (z 10.57 here); the uncapped one stays back
    // (z 18.71). The lift still moves the recheck (the ruling), so the near clearance (H309) keeps it under the roof.
    expect(lifted.eye[2]).toBeGreaterThan(cl.eye[2] + 4);
    expect(lifted.eye[1]).toBeLessThan(h);
    close(lifted.aim.eye, flat.aim.eye, 6);                                 // the game's aim is not lifted
  });
});

describe('JUMP_OVERHEAD_CAMERA_ADAPTATION: the walk feeds the gate (review F4)', () => {
  it('on the floor standing and prone the gate is shut; from the jump through the air it is open; after the landing shut', () => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    const mode = new WalkMode(fly);
    mode.setGround(GROUND, [150, 0, 150]);
    mode.bindKey();
    try {
      mode.setMode('walk');
      const inner = mode as unknown as { walker: { jump(): boolean; airborne: boolean; action: { name: string } | null; stance: string }; player: PlayerCamera };
      const frames = (n: number): void => { for (let i = 0; i < n; i++) mode.frame(TICK); };
      frames(10);
      expect(inner.player.jumping, 'standing on the floor').toBe(false);
      expect(inner.walker.jump(), 'a standing jump starts').toBe(true);
      frames(1);
      let open = 0, airborneShut = 0;
      for (let i = 0; i < 300 && (inner.walker.airborne || inner.walker.action !== null); i++) {
        if (inner.player.jumping) open++;
        else if (inner.walker.airborne) airborneShut++;
        frames(1);
      }
      expect(open, 'the gate was open in the jump').toBeGreaterThan(0);
      expect(airborneShut, 'never shut while airborne').toBe(0);
      frames(3);
      expect(inner.walker.airborne || inner.walker.action !== null, 'landed and settled').toBe(false);
      expect(inner.player.jumping, 'after the landing').toBe(false);
    } finally {
      mode.unbindKey();
    }
  });
});

describe.skipIf(!MP2)(`JUMP_OVERHEAD_CAMERA_ADAPTATION on Frostfire's hull${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('under the refinery\'s low roof (23.6 over the floor) a standing jump\'s eye stays where the body sees it, at every facing', async () => {
    // The report (Discord, 2026-11-19): "In frostfire going into tunnels if you jump you can see through the whole map".
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const grid = groundGrid(map.ground!);
    const feet: Vec3 = [396, 138, 852], hip: Vec3 = [feet[0], feet[1] + 10, feet[2]];
    const roof = segmentHit(grid, [feet[0], feet[1] + 1, feet[2]], [feet[0], feet[1] + 40, feet[2]], isCameraSurface)!;
    expect(roof.point[1] - feet[1]).toBeCloseTo(23.6, 1);
    for (const yaw of [0, 90, 180, 270]) {
      const cam = new PlayerCamera(grid);
      settle(cam, feet, yaw, INIT_AIM_PITCH, STAND, 40);
      expect(segmentHit(grid, hip, cam.view(1).eye, isCameraSurface), `standing, yaw ${yaw}`).toBeNull();
      cam.jumping = true;
      cam.tick(feet, yaw, INIT_AIM_PITCH, 15.08, 1 / 60, true); cam.tick(feet, yaw, INIT_AIM_PITCH, 15.08, 1 / 60, true);
      const v = cam.view(1);
      expect(v.aim.target[1], `yaw ${yaw}: the game's look point is over the roof`).toBeGreaterThan(roof.point[1]);
      expect(v.eye[1], `yaw ${yaw}: the drawn eye is under it`).toBeLessThan(roof.point[1]);
      expect(segmentHit(grid, hip, v.eye, isCameraSurface), `the jump, yaw ${yaw}`).toBeNull();
    }
  });
});

describe(`JUMP_OVERHEAD_CAMERA_ADAPTATION is the jump's only (Crossroads, no jump)${fixture('RUN/MP72.ZDB') ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  // #842's overhead cap ran on every camera: a prone body beside an upper road slab (wc10/di_road10) or under the edge of
  // a sloped roof (wc16/di_roof16) had a face over its axis below the look point, and the drawn eye was put CAM_MARGIN
  // under it -- here under the floor (cameraWallClip's B-19 sweep, seat-movement's row diff: 165 poses moved, 69 under
  // the feet). H309 rules out see-through, not a camera moved where nothing was wrong: the cap is the jump's.
  const PRONE_ROOT = STANCE.prone.rootY;
  const spots: { feet: Vec3; next180: Vec3 }[] = [
    // `next180`: agent/next's drawn eye at yaw 180, pitch -20 (seat-movement's run of the sweep at 860632b675).
    { feet: [420, 0, 1380], next180: [420, 15.86, 1360.22] },
    { feet: [1940, 176.37, 940], next180: [1940, 186.6, 935.7] },
    { feet: [1980, 176.37, 940], next180: [1980, 186.6, 935.7] },
  ];
  it.skipIf(!fixture('RUN/MP72.ZDB'))('a prone body not jumping keeps its drawn eye over its feet, as on next, at eight facings', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP72.ZDB');
    const grid = groundGrid(map.ground!);
    for (const { feet, next180 } of spots) {
      for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const cam = new PlayerCamera(grid);
        settle(cam, feet, yaw, -20, PRONE_ROOT, 8);
        const v = cam.view(1);
        expect(v.eye[1], `feet ${feet.join(',')} yaw ${yaw}: the drawn eye over the feet`).toBeGreaterThan(feet[1]);
        if (yaw === 180) close(v.eye, next180, 1);
      }
    }
  });
});

describe('JUMP-CAMERA-DIP (Craig\'s playtest, 2026-11-22): the jump\'s overhead cap ignores water and the ground under the body, and never casts from under the floor', () => {
  // The report: "the majority of the time when my character jumps, the camera is going underneath the screen and jumping
  // back up. this was every time in the water and while climbing a ramp, usually while on flat ground too"; the same with
  // the camera aimed level. The cap met a wading body's WATER surface over its axis, or -- the drawn lift lagging below the
  // simulated feet -- the ground from below, and put the drawn eye CAM_MARGIN under it. A real roof can be modelled facing
  // up (Frostfire's refinery), so the fix keys on the material and on where the cast starts, not on the face's direction.
  const upFacing = (y: number): WorldPoly => rewound(floor(y));
  /** A water surface: the engine's first LIQUID material (`materialTable`, the SOILS key). */
  const LIQUID = materialTable().findIndex((m) => m.liquid);
  const water = (y: number): WorldPoly => ({ ...upFacing(y), material: LIQUID, path: 'worldmodel/water' });
  const jumpIn = (grid: Grid, pitch: number): PlayerCamera => {
    const cam = new PlayerCamera(grid);
    settle(cam, ORIGIN, 0, pitch, STAND, 60);
    cam.jumping = true;
    cam.tick(ORIGIN, 0, pitch, 15.08, 1 / 60, true);
    cam.tick(ORIGIN, 0, pitch, 15.08, 1 / 60, true);
    return cam;
  };
  it('WATER: wading (the water surface 8 over the feet), a jump keeps the drawn eye over the water, aimed at rest and level', () => {
    expect(LIQUID).toBeGreaterThanOrEqual(0);
    const grid = world([upFacing(0), water(8)]);
    for (const pitch of [INIT_AIM_PITCH, 0]) {
      const v = jumpIn(grid, pitch).view(1);
      expect(v.eye[1], `pitch ${pitch}: the drawn eye`).toBeGreaterThan(8);
      expect(v.target[1], `pitch ${pitch}: the look point`).toBeGreaterThan(8);
    }
  });
  it('THE GROUND FROM BELOW: a drawn lift that starts the overhead cast under an up-facing ground does not drop the camera under it', () => {
    const grid = world([upFacing(0)]);
    const cam = jumpIn(grid, INIT_AIM_PITCH);
    const v = cam.view(1, [0, -2, 0]);                                     // the drawn feet a little under the simulated
    expect(v.eye[1], 'the drawn eye').toBeGreaterThan(0);
    expect(v.target[1], 'the look point').toBeGreaterThan(0);
  });
  it('THE RAMP: running uphill, the airborne feet sit just under the slope at their own column (MP64: 1.46 under walkable terrain); that ground is no roof', () => {
    // seat-movement's MP64 frame at c481097c1b: sim feet y 121.17, the up-cast met worldmodel/walkable_terrain_2062
    // (n.y 0.908, up-facing) at 122.63 and put the drawn eye 0.90 over the feet. The walker's own floor window
    // (PROBE_LIFT_FLOOR_R0004.stand, 11.48 over the feet) is the ground the body is over, not a roof.
    const grid = world([upFacing(-20), upFacing(1.46)]);
    for (const pitch of [INIT_AIM_PITCH, 0]) {
      const v = jumpIn(grid, pitch).view(1);
      expect(v.eye[1], `pitch ${pitch}: the drawn eye`).toBeGreaterThan(15);
    }
  });
  it('a ROOF still caps the jump, as #842 asks (H309): a down-facing underside and an up-facing slab met from below alike', () => {
    for (const roof of [floor(24), upFacing(24)]) {
    const grid = world([upFacing(0), roof]);
    const v = jumpIn(grid, INIT_AIM_PITCH).view(1);
    expect(v.eye[1]).toBeLessThan(24);
    expect(v.target[1]).toBeLessThan(24);
    }
  });
});
