import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGrid, materialTable, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { RangeFinder } from '../src/hud';
import { aimHitKept, aimQueryAdmits } from '../src/net/aimQuery';

/**
 * AIM-TRACE-FILTER (research 87 §13): the scope's and binoculars' `RANGE(m)` line reads the eye's aim trace's stored record
 * (`FUN_005aa6d0`: actor+0x3c0, D:L464015-464018) in `FUN_00216770` (D:L70446-70461), without tracing again: no record
 * (or its +0x1c zero) prints `"RANGE(m): ----"` (0x3e4860); otherwise the distance from the ACTOR's position
 * (`iVar13 + 0x1c`, the local actor `FUN_001fcd70`, D:L70321, D:L70357) to the record's point, / 10. The record is the
 * nearest hit `FUN_005aa6e0` keeps (class 1, D:L464117-464125; the hit rule D:L464145-464159; stored D:L464262-464286):
 * so a pane of GLASS (PENETRATION 0.99), a CHAINLINK_FENCE (0.98), WATER (LIQUID), an `m_cameratype` 1 face and a
 * bit-19 (`m_cameratype` 2) face are looked through, and the wall beyond is the range. The eye at (0, 20, 0) looks down
 * -z; the actor's position at (0, 0, 40); the wall at z -300.
 */

const TABLE = materialTable();
const byte = (name: string): number => { const i = TABLE.findIndex((m) => m.name === name); expect(i).toBeGreaterThan(1); return i; };
const face = (z: number, material: number, extra: Partial<WorldPoly> = {}): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-50, 0, z, 50, 0, z, 50, 50, z, -50, 50, z]), ...extra,
});
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 8, cellsZ: 8, originX: -400, originZ: -400 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
const AIM = { eye: [0, 20, 0], far: [0, 20, -600] };
const ACTOR = [0, 0, 40];
/** The eye query's filter as `Fire.eyeStops` composes it (`aimQueryAdmits` 'eye' + `aimHitKept`, the table given). */
const EYE_STOPS = (p: WorldPoly): boolean => aimQueryAdmits(p, 'eye') && aimHitKept(p, (m) => TABLE[m]);
const SEE_THROUGH = (): WorldPoly[] => [
  face(-60, byte('GLASS')), face(-120, byte('CHAINLINK_FENCE')), face(-180, byte('WATER')),
  face(-220, byte('STONE'), { cameratype: 1 }), face(-250, byte('STONE'), { cameratype: 2 }),
];

describe('AIM-TRACE-FILTER: the HUD range is the eye aim trace kept hit, from the actor (FUN_00216770 D:L70446-70461)', () => {
  it('a glass pane, a fence, water, a camera-only face and a bit-19 face are looked through: the wall, from the actor', () => {
    const range = new RangeFinder().measure(world([...SEE_THROUGH(), face(-300, byte('STONE'))]), AIM, 0, { stops: EYE_STOPS, actor: ACTOR });
    expect(range).not.toBeNull();
    // The record's point (0, 20, -300) from the actor's (0, 0, 40): hypot(20, 340) units, / 10 (D:L70451-70460).
    expect(range!).toBeCloseTo(Math.hypot(20, 340) / 10, 3);
  });

  it('no kept hit (only the faces it looks through) reads null -- the HUD draws "RANGE(m): ----" (0x3e4860)', () => {
    expect(new RangeFinder().measure(world(SEE_THROUGH()), AIM, 0, { stops: EYE_STOPS, actor: ACTOR })).toBeNull();
  });

  it("a wall beyond the aim trace's own reach (aimReach, D:L464096-464108) reads null; within it, the wall", () => {
    // AIM-TRACE-FILTER review F1: the record is the aim trace's, as long as its reach -- a wall 350 out with a reach of 300
    // has no record ("RANGE(m): ----"), with a reach of 400 it is the range.
    const grid = world([face(-350, byte('STONE'))]);
    expect(new RangeFinder().measure(grid, AIM, 0, { stops: EYE_STOPS, actor: ACTOR, reach: 300 })).toBeNull();
    expect(new RangeFinder().measure(grid, AIM, 0, { stops: EYE_STOPS, actor: ACTOR, reach: 400 })!).toBeCloseTo(Math.hypot(20, 390) / 10, 3);
  });

  it('the page passes the shot eye filter, the actor position and the eye reach at both of its range reads (matchFirearm)', () => {
    const src = readFileSync(new URL('../src/matchFirearm.ts', import.meta.url), 'utf8');
    const calls = src.match(/rangeFinder\.measure\([^\n]*\)/g) ?? [];
    expect(calls.length).toBe(2);
    for (const c of calls) expect(c).toContain('rangeQuery()');
    expect(src).toMatch(/const rangeQuery = \(\) => \(\{ stops: fire\.eyeStops\(\), actor: walk\.feet\(\), reach: fire\.eyeReach\(\) \}\)/);
  });
});
