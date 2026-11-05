// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, polygonNormal, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker } from '../src/mover';

/**
 * LATER 678 (simulation track; research 217 s2.9, "The crouch run's release"; `CROUCH_RUN_RETURN_READING`, research 101):
 * a crouch run let go at full stick against a wall. ac's capture (PCSX2 r0004, M51 house2's west wall
 * `worldmodel/noreg_343344/g160_1`, plane x 5425 facing -x; `agent-mail/evidence/eph-hunt-2026-11-01/segment-body/
 * cases/out/house/probe.csv`, case house-crouch, trials 2 and 3, identical; feet to the plane): the crouch run rests at
 * 5.85 (action 2, the stick full, to 6605 ms); the stick let go at 6638 ms plays 0x11 (`Stand -> Crouch`) -- 5.85 held
 * for 4 frames (6638-6738 ms), then 5.85 -> 10.85 in one 33 ms frame (6738 -> 6771 ms, a depth push-out: the logged
 * velocity that frame is under 0.4 u a frame), then the root carries it to 12.80 (6905 ms) and 12.88 (7005 ms), held to
 * 0x12 (crouch idle) at 7238 ms. The reading (pending review): during 0x11 the head line takes the muzzle reach
 * (`FUN_0054aa30` D:L415457-415523, the transition clause at D:L415480) and the deep-hit rule (`FUN_005483d0`
 * D:L413602-413614) puts the body out by the depth less 1; the original's idle branch pushes 0x11 before 0x12
 * (`FUN_00584c60`, D:L444195 on: 0x12 at D:L444282, 0x11 at D:L444316-444317). Built in SEPARATE (LATER 678,
 * `CROUCH_RUN_RETURN_READING` 'stand-to-crouch', OT.R93: COMBINED and the bots as main has them; before it the port went
 * to crouch idle at once and the body stayed at its rest, held here as `it.fails`); the push's timing and final value
 * are `CROUCH_RUN_RELEASE_PUSH_READING`'s. A flat
 * synthetic wall (no disc): the same plane, 40 tall as house2's.
 */

const FORWARD = { forward: 1, right: 0, boost: false };
const STILL = { forward: 0, right: 0, boost: false };
/** The yaw that faces +x (the camera looks down its own -z). */
const EAST = 270;
const WALL = 50;
/** The capture's stand-offs (feet to the plane): the crouch run at rest, and where the release ends. */
const CAPTURE_REST = 5.85, CAPTURE_END = 12.88;
/**
 * The tolerances, stated: at rest the port stops between the centre line's reach (1.1 x 1.4 x 3.5 = 5.39) and that plus
 * one 60 Hz move of the run (65 / 60; owner ruling R8, research 217 s2.9 checkpoint 4), so 5.85 within 0.7; the end
 * within 1 u (the port's fixed crouched muzzle reach gives 12.58, checkpoints 1-3; the original's posed reach and the
 * clip's root travel are not read).
 */
const REST_TOLERANCE = 0.7, END_TOLERANCE = 1;

function world(): ReturnType<typeof buildGrid> {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  };
  const wall: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([WALL, 0, -200, WALL, 0, 200, WALL, 40, 200, WALL, 40, -200]),
  };
  expect(Math.sign(polygonNormal(wall.points)![0])).toBe(-1);     // facing -x, toward the body
  const polys = [floor, wall];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

describe("LATER 678: a crouch run let go against a wall (ac's r0004 house2 capture, house-crouch t2/t3)", () => {
  it('LATER 678: the release plays Stand -> Crouch and its push puts the body out to about 12.88 off the wall, never nearer than its rest', () => {
    const w = new Walker(world());
    w.stanceSeparate = true;                                          // SEPARATE: the release is built there only (OT.R93)
    expect(w.place(WALL - 30, 1, 0)).toBe(true);
    w.state.yaw = EAST;
    w.changeStance('crouch');
    for (let i = 0; i < 120; i++) w.tick(STILL);
    for (let i = 0; i < 240; i++) w.tick(FORWARD);                  // full stick until it rests
    const rest = WALL - w.state.x;
    expect(Math.abs(rest - CAPTURE_REST), `at rest ${rest}`).toBeLessThan(REST_TOLERANCE);
    let nearest = rest, standToCrouch = false;
    for (let i = 0; i < 60; i++) {                                    // let go: 1 s (the capture's 0x11 is 0.6 s)
      w.tick(STILL);
      if (w.action?.name === 'standToCrouch') standToCrouch = true;
      nearest = Math.min(nearest, WALL - w.state.x);
    }
    expect(nearest, 'never nearer the wall than at rest').toBeGreaterThan(rest - 1e-6);
    expect(standToCrouch, 'the release plays Stand -> Crouch (0x11)').toBe(true);
    const end = WALL - w.state.x;
    expect(Math.abs(end - CAPTURE_END), `the release ends ${end} off the wall`).toBeLessThan(END_TOLERANCE);
  });
});
