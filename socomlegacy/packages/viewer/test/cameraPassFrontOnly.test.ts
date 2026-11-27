// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, polygonNormal, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { CAM_HOLD, CAM_MARGIN, cameraPass, newPassState, type Vec3 } from '../src/cameraRig';

/**
 * LATER 1057 / issue #812 (reading, pending review; research 382 s8, research 281 s4.3): the third-person pass
 * (`FUN_0029bf70`) casts its main probe through `FUN_0031e0a0` -> `FUN_002d4780` -> `FUN_002d2890` (D:L143385,
 * D:L220094, D:L175777-175788) and its four side probes through `FUN_0031de90` -> `FUN_002d3cf0` -> `FUN_002d3030`
 * (D:L143549, D:L219997, D:L175698-175710). Both per-collider tests set the side mode `DAT_003df270` = 0x20 for a
 * collider whose `+0x80` bit 1 is clear (`FUN_002d2890` D:L174831-174837, `FUN_002d3030` D:L175152-175157 and
 * D:L175277-175282), which the hull's colliders are (`FUN_00316e30` D:L215827-215828): only a face entered from its
 * front counts. So a one-sided camera face met from BEHIND -- its normal facing away from the target, toward the eye --
 * neither pulls the boom in nor sets the hold; met from its front it does (the control). The faces' own normals are
 * checked here (`polygonNormal`, the sign `segment.ts` `crossing` takes), so the winding is the test's, not assumed.
 */

function quad(points: number[], path: string): WorldPoly {
  return { modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) };
}
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}#${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
/** A face across x at `z` (x -50..50, y 0..60), its normal +z (`sign` 1) or -z (`sign` -1). */
function faceZ(z: number, sign: 1 | -1): WorldPoly {
  const pts = sign > 0 ? [-50, 0, z, 50, 0, z, 50, 60, z, -50, 60, z] : [-50, 60, z, 50, 60, z, 50, 0, z, -50, 0, z];
  return quad(pts, 'worldmodel/facez');
}
/** A face across z at `x` (z 20..40, y 0..60), its normal +x (`sign` 1) or -x (`sign` -1). */
function faceX(x: number, sign: 1 | -1): WorldPoly {
  const pts = sign < 0 ? [x, 0, 20, x, 0, 40, x, 60, 40, x, 60, 20] : [x, 60, 20, x, 60, 40, x, 0, 40, x, 0, 20];
  return quad(pts, 'worldmodel/facex');
}

/** The target and the goal eye: 28 apart along +z, so the pass reaches 28.75 (the goal plus `CAM_MARGIN`). */
const TARGET: Vec3 = [0, 20, 0];
const EYE: Vec3 = [0, 20, 28];
const REACH = 28 + CAM_MARGIN;

function pass(face: WorldPoly): { out: Vec3; dist: number; hold: number } {
  const state = newPassState();
  const out = cameraPass(world([face]), TARGET, EYE, state);
  return { out, dist: state.dist, hold: state.hold };
}

describe("LATER 1057: the third-person pass is one-sided on the hull (FUN_002d2890 / FUN_002d3030 side mode 0x20)", () => {
  it("the main probe: a face behind the camera met from behind (its normal toward the eye) does not pull the boom in nor set the hold", () => {
    const face = faceZ(10, 1);
    expect(polygonNormal(face.points)![2]).toBeGreaterThan(0.99);           // faces +z: the eye's side, away from the target
    const got = pass(face);
    expect(got.dist).toBeCloseTo(REACH, 9);
    expect(got.hold).toBe(0);
    got.out.forEach((c, i) => expect(c, `component ${i}`).toBeCloseTo([0, 20, REACH][i]!, 9));
  });

  it("the main probe's control: the same face met from its front (its normal toward the target) pulls the boom in 0.75 short and holds 1.5 s", () => {
    const face = faceZ(10, -1);
    expect(polygonNormal(face.points)![2]).toBeLessThan(-0.99);             // faces -z: the target's side
    const got = pass(face);
    expect(got.dist).toBeCloseTo(10 - CAM_MARGIN, 9);
    expect(got.hold).toBe(CAM_HOLD);
    got.out.forEach((c, i) => expect(c, `component ${i}`).toBeCloseTo([0, 20, 10 - CAM_MARGIN][i]!, 9));
  });

  it("a side probe: a face 0.5 beside the eye met from behind (its normal away from the eye) does not shift the eye nor set the hold", () => {
    // The main probe runs along x = 0, parallel to the face; the +side probe runs from the eye 0.75 toward +x through it.
    const face = faceX(0.5, 1);
    expect(polygonNormal(face.points)![0]).toBeGreaterThan(0.99);           // faces +x: away from the eye at x 0
    const got = pass(face);
    expect(got.hold).toBe(0);
    got.out.forEach((c, i) => expect(c, `component ${i}`).toBeCloseTo([0, 20, REACH][i]!, 9));
  });

  it("a side probe's control: the same face met from its front shifts the eye to 0.75 off it and holds 1.5 s", () => {
    const face = faceX(0.5, -1);
    expect(polygonNormal(face.points)![0]).toBeLessThan(-0.99);             // faces -x: toward the eye
    const got = pass(face);
    expect(got.hold).toBe(CAM_HOLD);
    got.out.forEach((c, i) => expect(c, `component ${i}`).toBeCloseTo([0.5 - CAM_MARGIN, 20, REACH][i]!, 9));
  });
});
