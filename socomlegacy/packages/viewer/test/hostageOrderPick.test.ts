import { describe, expect, it } from 'vitest';
import { buildGrid, materialTable, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { crosshairPick, pickSurfaces } from '../src/net/hostageOrder';
import { aimHitKept as fireAimHitKept, aimQueryAdmits as fireAimQueryAdmits } from '../src/fire';
import { aimHitKept, aimQueryAdmits } from '../src/net/aimQuery';

/**
 * AD-2's review F1 (web sprint 40; research 84 §19): the reticle's target pick and the hostage order's pick -- the page's
 * and the room's, `pickSurfaces` then `crosshairPick` -- are copies of `FUN_005aa6e0`'s query, the shot's eye ray's own, so
 * they take its class (`aimQueryAdmits`, 'eye': the side bit, bit 19 skipped; `FUN_002d2890` D:L174845-174862) and its
 * hit rule (`aimHitKept`, D:L464145-464159: `m_cameratype` 1 looked through, an empty slot not kept). The case the review
 * found: on M62 and MP62 a palm trunk (`palmtree01/02`, WOOD_THICK, `m_cameratype` 2) the shot aims past since AD-2 but
 * the pick stopped at. The eye at (0, 20, 0) looks down -z; a face of 100 x 50 at z -60; a body 100 down the ray.
 */

const TABLE = materialTable();
const byte = (name: string): number => { const i = TABLE.findIndex((m) => m.name === name); expect(i).toBeGreaterThan(1); return i; };
const face = (z: number, material: number, extra: Partial<WorldPoly> = {}): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-50, 0, z, 50, 0, z, 50, 50, z, -50, 50, z]), ...extra,
});
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
const EYE = [0, 20, 0], FAR = [0, 20, -600];
const BODY = [{ id: 9, distance: 100 }];
/** The pick through `polys` at the body 100 down the ray. */
const pickThrough = (polys: WorldPoly[]) => crosshairPick(BODY, pickSurfaces(world(polys), EYE, FAR));

describe("AD-2 F1: the reticle's and the hostage order's pick take the eye query's admission (FUN_005aa6e0)", () => {
  it('AD-2 F1: a palm trunk -- an m_cameratype 2 WOOD_THICK face -- before a body is not met: the body is picked, as the shot aims past it', () => {
    const trunk = face(-60, byte('WOOD_THICK'), { cameratype: 2 });
    expect(pickSurfaces(world([trunk]), EYE, FAR)).toEqual([]);
    expect(pickThrough([trunk])).toEqual({ picked: 9, blocked: [] });
  });

  it('AD-2 F1: an m_cameratype 1 face (bit 18 alone, the dredge on MP1) is met but looked through (kept false); the body is picked', () => {
    const dredge = face(-60, byte('METAL_THICK'), { cameratype: 1 });
    const s = pickSurfaces(world([dredge]), EYE, FAR);
    expect(s.map((x) => [x.material.name, x.kept])).toEqual([['METAL_THICK', false]]);
    expect(pickThrough([dredge])).toEqual({ picked: 9, blocked: [] });
  });

  it('AD-2 F1: a face without the side bit (ditype 1) is ignored, and so is m_cameratype 3; the body is picked', () => {
    expect(pickSurfaces(world([face(-60, byte('STONE'), { ditype: 1 })]), EYE, FAR)).toEqual([]);
    expect(pickThrough([face(-60, byte('STONE'), { ditype: 1 })]).picked).toBe(9);
    expect(pickThrough([face(-60, byte('STONE'), { cameratype: 3 })]).picked).toBe(9);
  });

  it('AD-2 F1: a plain wall still blocks (kept true), a fence is still looked through, the default material by byte 0; a surface without kept falls back to the material rule', () => {
    const wall = face(-60, byte('STONE'));
    expect(pickSurfaces(world([wall]), EYE, FAR).map((x) => [x.material.name, x.kept])).toEqual([['STONE', true]]);
    expect(pickThrough([wall])).toEqual({ picked: null, blocked: [9] });
    expect(pickThrough([face(-60, byte('CHAINLINK_FENCE'))]).picked).toBe(9);
    // Byte 0 is the map's DefaultMaterial: a CAMO_NET default is looked through, a STONE one blocks.
    expect(crosshairPick(BODY, pickSurfaces(world([face(-60, 0)]), EYE, FAR, 'CAMO_NET')).picked).toBe(9);
    expect(crosshairPick(BODY, pickSurfaces(world([face(-60, 0)]), EYE, FAR, 'STONE')).picked).toBeNull();
    // A caller's surface without `kept` (the signature before F1): `aimPickBlocks` of its material, as before.
    expect(crosshairPick(BODY, [{ distance: 60, material: TABLE[byte('STONE')]! }]).picked).toBeNull();
    expect(crosshairPick(BODY, [{ distance: 60, material: TABLE[byte('STONE')]!, kept: false }]).picked).toBe(9);
  });

  it("AD-2 F1: fire.ts re-exports the shared module's admission -- one rule for the shot and the picks", () => {
    expect(fireAimQueryAdmits).toBe(aimQueryAdmits);
    expect(fireAimHitKept).toBe(aimHitKept);
  });
});
