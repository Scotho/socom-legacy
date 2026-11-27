import { describe, expect, it } from 'vitest';
import {
  buildGrid, CLUTTER_PATH_ROOT, FIRST_BOUNCE_DAMPING, GAME_FRAME_DT, GRENADE_INSTANCE_NODE_SIDES_READING,
  GRENADE_PATCH_NODE_SIDES_READING, gridCast, launchGrenade, MARK141, projectileNodeSides, R0004_NODE_NAME_PREFIX, SOILS, stepGrenade,
  VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION, VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION,
  type CollisionOwner, type Grenade, type GrenadeEvent, type GridParams, type HullCast, type ThrowableRecord, type V3, type WorldPoly,
} from '../src/index';

/**
 * GRENADE-ONE-SIDED (GRENADE_FLIGHT_ONE_SIDED_READING; research 85 §5.1): the projectile's per-frame segment query
 * (r0001 `FUN_0031dd90` -> `FUN_002d3030`, the hull node's mode 0x20 and the surface loop's side-bit test,
 * D:L175276-175282, D:L175350-175352; r0004 0x33b3a0 -> 0x2eff40, 0x2f0268-0x2f02a8, 0x2f08c0-0x2f08cc) records a map
 * face only when the grenade's segment enters it from its FRONT, and only a face with the side bit (`m_ditype` bit 1).
 * Captured on r0004 (Shadow PC 2, GRENADE-CEILING-C-PC2, unscored): 3 of 3 grenades thrown at a single-sided face from
 * behind cross its plane with the velocity unchanged; the same face from the front bounces at k 0.375. MP51's six tunnel
 * owners keep OT.R140's labelled rule, narrowed to MISSION's text: a THROWN grenade's ceiling contact met from below counts
 * whatever the winding; their walls, floors and roofs from behind, and every launched round, follow the one-sided rule.
 *
 * Synthetic worlds; the grenade flown one game frame at a time.
 */

const STONE = SOILS.findIndex((m) => m.name === 'STONE') + 2;
const STONE_E = SOILS.find((m) => m.name === 'STONE')!.elasticity;
const LISTED = VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION[1]!;              // worldmodel/wc12A/di_tunnels_wc12
const OTHER = 'worldmodel/wc12A/di_roof_b09';                             // an MP51 owner beside it, not listed

function face(points: number[], path: string, ditype = 3): WorldPoly {
  return { modelName: 'worldmodel', path, region: 0, ditype, material: STONE, ptcount: 4, cameratype: 0, points: Float32Array.from(points) };
}
/** A vertical wall across x at `x` whose front ((P2 - P1) x (P0 - P1), Newell's sign) faces +x. */
const wallFacingPlusX = (x: number, path = OTHER, ditype = 3): WorldPoly =>
  face([x, -500, 2000, x, -500, -2000, x, 500, -2000, x, 500, 2000], path, ditype);
/** A level sheet at `y` facing UP (a roof walked on from above). */
const roofAt = (y: number, path: string): WorldPoly => face([-2000, y, 2000, 2000, y, 2000, 2000, y, -2000, -2000, y, -2000], path);

function hull(polys: WorldPoly[]): HullCast {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1 }));
  return gridCast(buildGrid(params, [], [], polys, owners));
}

/** Flies `frames` game frames; each frame's events and the velocity before it (after its gravity) and after it. */
function fly(g: Grenade, cast: HullCast, frames: number): { events: GrenadeEvent[]; before: V3; after: V3; pos: V3 }[] {
  const out: { events: GrenadeEvent[]; before: V3; after: V3; pos: V3 }[] = [];
  for (let i = 0; i < frames && g.state === 'flight'; i++) {
    const before: V3 = [g.vel[0], g.vel[1] - g.record.gravity * GAME_FRAME_DT, g.vel[2]];
    const events = stepGrenade(g, GAME_FRAME_DT, cast);
    out.push({ events, before, after: [...g.vel], pos: [...g.pos] });
  }
  return out;
}
const bounced = (f: { events: GrenadeEvent[] }): boolean => f.events.some((e) => e.kind === 'bounce');

describe('GRENADE-ONE-SIDED: the flight meets a map face from its front only, side-bit faces only', () => {
  it('a grenade swept at a wall from BEHIND passes through it, the velocity unchanged at the plane', () => {
    const frames = fly(launchGrenade([0, 0, 0], [200, 0, 0], MARK141), hull([wallFacingPlusX(50)]), 12);
    expect(frames.some(bounced), 'no contact from behind').toBe(false);
    const crossing = frames.findIndex((f) => f.pos[0] > 50);
    expect(crossing, 'it crossed the plane').toBeGreaterThanOrEqual(0);
    const f = frames[crossing]!;
    expect(f.after, 'v unchanged across the plane (gravity only)').toEqual(f.before);
    expect(f.after[0]).toBe(200);
  });

  it('MID-FLIGHT: a grenade 128 u from its release crosses a wall\'s BACK with v unchanged; wound toward it, the same wall is met', () => {
    // The controller's BACKFACE-FAR (PC 2, r0004, 2026-11-25: a grenade 128 u from its release crossed the back of MP51
    // face 623 (wc02A), v gravity-only, no contact, 3 of 3; its record is not on this host, so no disc replay here): the
    // faces are one-sided mid-flight too, not only at the release. A lofted throw: the frame that crosses x 128 starts
    // far from the release and well clear of the plane.
    const launch = (): Grenade => launchGrenade([0, 0, 0], [180, 60, 0], MARK141);
    const frames = fly(launch(), hull([wallFacingPlusX(128)]), 30);
    expect(frames.some(bounced), 'no contact from behind mid-flight').toBe(false);
    const crossing = frames.findIndex((f) => f.pos[0] > 128);
    expect(crossing, 'crossed after several frames of flight').toBeGreaterThan(10);
    expect(frames[crossing]!.after, 'v unchanged across the plane (gravity only)').toEqual(frames[crossing]!.before);
    const facing: WorldPoly = face([128, 500, 2000, 128, 500, -2000, 128, -500, -2000, 128, -500, 2000], OTHER);   // its front toward -x
    const met = fly(launch(), hull([facing]), 30).find(bounced);
    expect(met, 'the front-wound wall is met mid-flight').toBeDefined();
    expect(met!.after[0]).toBeCloseTo(-180 * STONE_E * FIRST_BOUNCE_DAMPING, 9);
  });

  it('the same wall from its FRONT bounces: the mirror, x the material and x0.75 on the first bounce, as before', () => {
    const frames = fly(launchGrenade([100, 0, 0], [-200, 0, 0], MARK141), hull([wallFacingPlusX(50)]), 12);
    const hit = frames.find(bounced);
    expect(hit, 'met from the front').toBeDefined();
    const k = STONE_E * FIRST_BOUNCE_DAMPING;
    expect(hit!.after[0]).toBeCloseTo(-hit!.before[0] * k, 9);
    expect(hit!.after[1]).toBeCloseTo(hit!.before[1] * k, 9);
    expect(hit!.after[2]).toBeCloseTo(0, 9);
  });

  it('a face without the side bit (m_ditype bit 1 clear) is not met, even from its front', () => {
    for (const ditype of [0, 1]) {
      const frames = fly(launchGrenade([100, 0, 0], [-200, 0, 0], MARK141), hull([wallFacingPlusX(50, OTHER, ditype)]), 12);
      expect(frames.some(bounced), `ditype ${ditype}: not recorded`).toBe(false);
      expect(frames.at(-1)!.pos[0], `ditype ${ditype}: carried past the plane`).toBeLessThan(50);
    }
  });

  it('OT.R140 keeps its rule: a LISTED tunnel sheet wound UP is met from below and carries; an unlisted one is passed', () => {
    const listed = fly(launchGrenade([0, 90, 0], [200, 100, 0], MARK141), hull([roofAt(100, LISTED)]), 30).find(bounced);
    expect(listed, 'the listed sheet is met from below, whatever the winding').toBeDefined();
    expect(listed!.after[0]).toBeCloseTo(200 * VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION, 6);
    const other = fly(launchGrenade([0, 90, 0], [200, 100, 0], MARK141), hull([roofAt(100, OTHER)]), 30);
    expect(other.some(bounced), 'the same sheet under an unlisted owner is passed from behind').toBe(false);
  });

  // OT.R140 is a THROWN grenade's contact met from BELOW only (MISSION OT.R140: "every wall, floor and roof ... keep the
  // original's bounce"; seat-kill's ruling on the review's F3): every other contact with a listed owner is one-sided.
  it('OT.R140 is a ceiling only: a LISTED wall met from behind is passed, the velocity unchanged', () => {
    const frames = fly(launchGrenade([0, 0, 0], [200, 0, 0], MARK141), hull([wallFacingPlusX(50, LISTED)]), 12);
    expect(frames.some(bounced), 'no contact from behind, listed or not').toBe(false);
    const crossing = frames.findIndex((f) => f.pos[0] > 50);
    expect(crossing, 'it crossed the plane').toBeGreaterThanOrEqual(0);
    expect(frames[crossing]!.after).toEqual(frames[crossing]!.before);
  });

  it('OT.R140 is a ceiling only: a grenade falling onto a LISTED sheet wound DOWN (met from behind, from above) passes it', () => {
    const ceiling = face([-2000, 100, -2000, 2000, 100, -2000, 2000, 100, 2000, -2000, 100, 2000], LISTED);   // its front DOWN
    const frames = fly(launchGrenade([0, 120, 0], [50, -100, 0], MARK141), hull([ceiling]), 30);
    expect(frames.some((f) => f.pos[1] < 100), 'it fell through the plane').toBe(true);
    expect(frames.some(bounced), 'no contact from behind on a floor-like approach').toBe(false);
  });

  it('OT.R140 is thrown grenades only: a launched bounce-typed round (0xb2) meeting a LISTED sheet wound UP from below passes it', () => {
    // vigiCeiling.test.ts's live launched smoke round: category 0xab, not 0x79 / 0x97.
    const launched: ThrowableRecord = { ...MARK141, name: 'launched 0xb2', id: 0xb2, impact: false, armingDistance: 100 };
    const frames = fly(launchGrenade([0, 90, 0], [200, 100, 0], launched), hull([roofAt(100, LISTED)]), 30);
    expect(frames.some((f) => f.pos[1] > 100), 'it crossed the plane').toBe(true);
    expect(frames.some(bounced), 'a launched round keeps the one-sided rule').toBe(false);
  });
});

/**
 * GRENADE-ONE-SIDED's drop sweep, cause B (seat-kill, 2026-11-25; `viewer/test/helpers/grenadeDropSweep.ts`): on a WARPED
 * face the two-sided cast finds the crossing on the polygon's Newell plane through p0 (`segment.ts` `crossing`); the
 * flight's side test must decide front or back on that SAME plane, or a frame that ends in the sliver between it and the
 * first three vertices' plane meets the face in neither frame (1,534 real-map throws, about 120 faces).
 */
describe('GRENADE-ONE-SIDED: a warped face is met on one plane, the crossing\'s', () => {
  const W = 0.2;
  // A 20 u floor wound face UP, its last vertex lifted W off the first three's plane (y 0): the Newell plane through p0
  // lies W * 0.4 above y 0 at (-8, -8) and W * 0.4 below it at (8, 8).
  const warped = (): WorldPoly => face([-10, 0, 10, 10, 0, 10, 10, 0, -10, -10, W, -10], OTHER);

  it('a frame ending between the two planes over the raised corner is recorded from the front', () => {
    const cast = hull([warped()]);
    const hits = cast([-8, 1, -8], [-8, 0.04, -8]);          // ends above y 0 (the p0-p1-p2 plane), under the Newell plane
    expect(hits.length, 'the two-sided cast finds the crossing').toBe(1);
    expect(hits[0]!.recorded, 'entered from the front of the plane it was found on').toBe(true);
  });

  it('a frame starting between the two planes over the sunk corner is recorded from the front', () => {
    const cast = hull([warped()]);
    const hits = cast([8, -0.04, 8], [8, -1, 8]);            // starts under y 0, above the Newell plane (-0.08 there)
    expect(hits.length, 'the two-sided cast finds the crossing').toBe(1);
    expect(hits[0]!.recorded, 'entered from the front of the plane it was found on').toBe(true);
  });

  it('no drop onto the warped floor passes through it, at either corner, from any start height', () => {
    const passed: string[] = [];
    for (const [x, z] of [[-8, -8], [8, 8]] as const) {
      for (let k = 0; k < 200; k++) {
        const y0 = 2 + k * 0.003;
        const frames = fly(launchGrenade([x, y0, z], [0, 0, 0], MARK141), hull([warped()]), 40);
        const first = frames.findIndex(bounced);
        const fell = frames.findIndex((f) => f.pos[1] < -0.5);
        if (first < 0 || (fell >= 0 && fell < first)) passed.push(`(${x}, ${y0.toFixed(3)}, ${z})`);
      }
    }
    expect(passed, 'drops that pass through the warped floor').toEqual([]);
  });
});

/**
 * GRENADE-ONE-SIDED's drop sweep, causes A and C (seat-kill's ruling, 2026-11-25): the port keeps the one-sided rule for
 * the map hull's own nodes only (the hull collider's constructor clears `+0x80` bit 1, `FUN_00316e30` D:L215827-215828;
 * mode 0x20, `FUN_002d3030` D:L175276-175282). The r0004 map patch's added nodes (`r0004@<pc>`, `applyR0004MapPatch`; the
 * r4 0x3343d0 constructor is that same `FUN_00316e30`, research 383 §3) and the clutter instances' nodes
 * (`clutter/<model>#<record>`; inferred, research 422 §2.5) are READ one-sided too; the port meets them from both sides as
 * a labelled departure from the reading, pending a capture (GRENADE_PATCH_NODE_SIDES_READING,
 * GRENADE_INSTANCE_NODE_SIDES_READING; research 85 §5.1). The side-bit test (the surface loop's,
 * D:L175350-175352) holds for every node.
 */
describe('GRENADE-ONE-SIDED: one-sided on the map hull\'s own nodes only', () => {
  // A level sheet at y 0 wound face DOWN (its front below), as MP83's patched floors and MP61's dilite tops.
  const faceDown = (path: string, ditype = 3): WorldPoly => face([-2000, 0, -2000, 2000, 0, -2000, 2000, 0, 2000, -2000, 0, 2000], path, ditype);
  const drop = (path: string, ditype = 3): boolean =>
    fly(launchGrenade([5, 10, 5], [0, 0, 0], MARK141), hull([faceDown(path, ditype)]), 60).some(bounced);
  const PATCH = `worldmodel/c1/${R0004_NODE_NAME_PREFIX}0x2d52e0`;
  const CLUTTER = `${CLUTTER_PATH_ROOT}light_round_nosource#4/light_round_nosource/dilite`;

  it('the readings are named: patch and instance nodes two-sided', () => {
    expect(GRENADE_PATCH_NODE_SIDES_READING).toBe('two-sided');
    expect(GRENADE_INSTANCE_NODE_SIDES_READING).toBe('two-sided');
    expect(projectileNodeSides('worldmodel/wc09/di_extwalls_h02_1')).toBe('one-sided');
    expect(projectileNodeSides('worldmodel/wc02A')).toBe('one-sided');
    expect(projectileNodeSides(PATCH)).toBe('two-sided');
    expect(projectileNodeSides(`worldmodel/${R0004_NODE_NAME_PREFIX}0x2d78d4`)).toBe('two-sided');
    expect(projectileNodeSides(CLUTTER)).toBe('two-sided');
    expect(projectileNodeSides(undefined)).toBe('one-sided');
    // Not a patch node: a hull node whose name merely holds the text elsewhere.
    expect(projectileNodeSides('worldmodel/xr0004@0x1')).toBe('one-sided');
  });

  it('a hull floor wound face-down is passed from above (the read rule)', () => {
    expect(drop(OTHER)).toBe(false);
  });

  it('an r0004 patch floor wound face-down is met from above', () => {
    expect(drop(PATCH)).toBe(true);
    expect(drop(`worldmodel/${R0004_NODE_NAME_PREFIX}0x2d78d4`)).toBe(true);
  });

  it('a clutter top wound face-down is met from above', () => {
    expect(drop(CLUTTER)).toBe(true);
  });

  it('the side bit holds on every node: a patch or clutter face without it is not met', () => {
    expect(drop(PATCH, 1)).toBe(false);
    expect(drop(CLUTTER, 1)).toBe(false);
  });
});
