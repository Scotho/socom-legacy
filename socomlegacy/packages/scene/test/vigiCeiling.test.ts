import { describe, expect, it } from 'vitest';
import {
  buildGrid, GAME_FRAME_DT, gridCast, launchGrenade, M67, MARK141, SOILS, stepGrenade,
  VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION, VIGI_TUNNEL_CEILING_MIN_DOWN_ADAPTATION, VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION,
  type CollisionOwner, type Grenade, type GridParams, type HullCast, type ThrowableRecord, type V3, type WorldPoly,
} from '../src/index';

/**
 * VIGI-CEILING (MISSION OT.R140, an INTENTIONAL DIVERGENCE, the owner's: Craig, relayed by the main controller
 * seat-controller-q 2026-11-23, "Soften the ceiling bounce"). On Vigilance (MP51) the original's flashbang thrown hard in a
 * low stone tunnel hits the vault's ceiling, keeps ~37% of its speed (`HandleBounce`: reflected, x ELASTICITY_COEFF, x0.75
 * on the first bounce) and bursts short (IQ-084, the r0004 capture; the port matches it, #213). The divergence: on one of
 * MP51's six tunnel owners, a contact met from BELOW (a ceiling) keeps `VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION` of the
 * velocity ALONG the face; the part off the face keeps the original's damping. Every other face and owner is unchanged.
 *
 * A synthetic world (the tunnel's owner path on a plain quad); the grenade is flown one game frame at a time and its
 * velocity read after the frame that bounced (the bounce sets it last). The ceiling is wound to face DOWN (its front
 * toward the tunnel below), so the case holds under a one-sided flight too.
 */

const STONE = SOILS.findIndex((m) => m.name === 'STONE') + 2;
const LISTED = VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION[1]!;          // worldmodel/wc12A/di_tunnels_wc12 (Kill's vault)
const OTHER = 'worldmodel/wc12A/di_roof_b09';                         // a real MP51 owner beside it, not listed

function face(points: number[], path: string): WorldPoly {
  return { modelName: 'worldmodel', path, region: 0, ditype: 3, material: STONE, ptcount: 4, cameratype: 0, points: Float32Array.from(points) };
}
/** A level sheet at `y` facing DOWN ((P2 - P1) x (P0 - P1) has n_y < 0): a ceiling. */
const ceilingAt = (y: number, path: string): WorldPoly => face([-2000, y, -2000, 2000, y, -2000, 2000, y, 2000, -2000, y, 2000], path);
/** A level sheet at `y` facing UP: a roof walked on from above. */
const roofAt = (y: number, path: string): WorldPoly => face([-2000, y, 2000, 2000, y, 2000, 2000, y, -2000, -2000, y, -2000], path);
/** A vertical wall across x at `x`, facing -x (wound so: it was wound facing +x, which a one-sided flight from -x passes). */
const wallX = (x: number, path: string): WorldPoly => face([x, 500, 2000, x, 500, -2000, x, -500, -2000, x, -500, 2000], path);

function hull(polys: WorldPoly[]): HullCast {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1 }));
  return gridCast(buildGrid(params, [], [], polys, owners));
}
/** Flies until the first bounce; the velocity the bounce left (or null if none in 1 s). */
function firstBounce(g: Grenade, cast: HullCast): V3 | null {
  for (let i = 0; i < Math.round(1 / GAME_FRAME_DT) && g.state !== 'removed'; i++) {
    if (stepGrenade(g, GAME_FRAME_DT, cast).some((e) => e.kind === 'bounce')) return [...g.vel];
  }
  return null;
}
const upInto = (polys: WorldPoly[], record: ThrowableRecord = MARK141): V3 | null =>
  firstBounce(launchGrenade([0, 90, 0], [200, 100, 0], record), hull(polys));

describe('VIGI-CEILING (OT.R140): a grenade off an MP51 tunnel ceiling keeps most of its forward speed; nothing else changes', () => {
  it('the table names the six MP51 tunnel owners; the factor keeps most of the speed; a ceiling is within 60 degrees of level', () => {
    expect([...VIGI_TUNNEL_CEILING_OWNERS_ADAPTATION]).toEqual([
      'worldmodel/wc11/di_tunnel_wc11', 'worldmodel/wc12A/di_tunnels_wc12', 'worldmodel/wc12A/di_tunnels_wc12a',
      'worldmodel/wc13/di_tunnel_wc13', 'worldmodel/wc13/di_tunnel_wc13a', 'worldmodel/wc14A/di_tunnels_wc14',
    ]);
    expect(VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION).toBeGreaterThan(0.5);
    expect(VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION).toBeLessThanOrEqual(1);
    expect(VIGI_TUNNEL_CEILING_MIN_DOWN_ADAPTATION).toBe(0.5);
  });

  it('a flashbang up into a LISTED tunnel ceiling: the forward speed is kept at the factor; the drop off the ceiling is the original', () => {
    const listed = upInto([ceilingAt(100, LISTED)])!;
    const other = upInto([ceilingAt(100, OTHER)])!;
    expect(listed, 'it bounced').not.toBeNull();
    expect(listed[0], 'forward: 200 x the kept-speed factor').toBeCloseTo(200 * VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION, 6);
    expect(listed[1], 'off the ceiling: the original damping, as on any other face').toBeCloseTo(other[1], 6);
    expect(listed[1], 'still going down after the ceiling').toBeLessThan(0);
    expect(listed[2]).toBeCloseTo(0, 6);
  });

  it('the SAME ceiling under an owner not listed: the original bounce (the whole velocity damped, so it drops short)', () => {
    const other = upInto([ceilingAt(100, OTHER)])!;
    const e = other[0] / 200;                                         // the original's ELASTICITY_COEFF x the first-bounce 0.75
    expect(e, 'the original keeps well under half').toBeLessThan(0.5);
    expect(other[1] / e, 'one factor on the whole reflected velocity').toBeLessThan(0);
  });

  it('a WALL of a listed owner, and a ROOF of a listed owner met from above: the original bounce, unchanged', () => {
    const wall = firstBounce(launchGrenade([0, 0, 0], [200, 0, 0], MARK141), hull([wallX(50, LISTED)]));
    const wallOther = firstBounce(launchGrenade([0, 0, 0], [200, 0, 0], MARK141), hull([wallX(50, OTHER)]));
    expect(wall, 'the wall was met').not.toBeNull();
    expect(wall).toEqual(wallOther);
    const roof = firstBounce(launchGrenade([0, 110, 0], [200, -50, 0], MARK141), hull([roofAt(100, LISTED)]));
    const roofOther = firstBounce(launchGrenade([0, 110, 0], [200, -50, 0], MARK141), hull([roofAt(100, OTHER)]));
    expect(roof, 'the roof was met').not.toBeNull();
    expect(roof).toEqual(roofOther);
  });

  it('the rule is the SIDE met, not the winding: a listed sheet wound UP and met from below (two-sided flight) carries too', () => {
    // The flight is one-sided (GRENADE_FLIGHT_ONE_SIDED_READING), so the up-wound sheet met from below is unrecorded; OT.R140's
    // contact (a thrown grenade on a listed CEILING met from below, `flightMeets`) is met whatever the winding.
    const upWound = upInto([roofAt(100, LISTED)]);
    const downWound = upInto([ceilingAt(100, LISTED)])!;
    expect(upWound, 'the two-sided flight meets the up-wound sheet from below').not.toBeNull();
    expect(upWound![0]).toBeCloseTo(downWound[0], 6);
    expect(upWound![1]).toBeCloseTo(downWound[1], 6);
  });

  it('a launched round that hits inside its arming distance (a DUD) keeps the original bounce off a listed ceiling', () => {
    const launched: ThrowableRecord = { ...M67, impact: true, armingDistance: 100000 };
    const dud = upInto([ceilingAt(100, LISTED)], launched);
    const dudOther = upInto([ceilingAt(100, OTHER)], launched);
    expect(dud, 'the dud bounced').not.toBeNull();
    expect(dud).toEqual(dudOther);
  });

  it('the vault ARCH: a listed face sloped 57 degrees (n_y -0.55, as Kill hits wc12A) counts; one sloped 70 degrees does not', () => {
    // A sheet through (0, 100, 0) whose downward normal is (0, -cos a, -sin a): the grenade flies +x and up, so it meets it from below.
    const sloped = (deg: number, path: string): WorldPoly => {
      const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      // the sheet's in-plane axes: x, and (0, -s, c); wound so (P2 - P1) x (P0 - P1) points down-and-toward -z
      const pt = (u: number, v: number): number[] => [u, 100 - s * v, c * v];
      return face([...pt(-2000, -2000), ...pt(2000, -2000), ...pt(2000, 2000), ...pt(-2000, 2000)], path);
    };
    const arch = upInto([sloped(56.6, LISTED)]);
    const archOther = upInto([sloped(56.6, OTHER)]);
    expect(arch, 'the arch face was met').not.toBeNull();
    expect(arch![0], 'the arch keeps more of the forward speed than the original').toBeGreaterThan(archOther![0] + 50);
    const steep = upInto([sloped(70, LISTED)]);
    const steepOther = upInto([sloped(70, OTHER)]);
    expect(steep, 'the steep face was met').not.toBeNull();
    expect(steep).toEqual(steepOther);
  });

  it('LIVE launched smoke rounds (0xb2 the M203, 0xb6 the OICW) off a listed ceiling keep the original bounce: OT.R140 is thrown grenades only', () => {
    // The v0.4.31 release-head review's F1: both are bounce-typed (`bouncesByType`), so a live one reaches the bounce, not
    // HandleImpact; Craig's ruling covers THROWN grenades (categories 0x79 / 0x97) only. 0xac and 0xad, the other two
    // bounce-typed smoke rounds, fall outside the guard the same way (glance N1); the review named these two.
    for (const id of [0xb2, 0xb6]) {
      const live: ThrowableRecord = { ...M67, name: `launched ${id}`, id, impact: false, armingDistance: 100 };
      const listed = upInto([ceilingAt(100, LISTED)], live);
      const other = upInto([ceilingAt(100, OTHER)], live);
      expect(listed, `0x${id.toString(16)} bounced`).not.toBeNull();
      expect(listed, `0x${id.toString(16)}: the original bounce`).toEqual(other);
    }
    const thrown = upInto([ceilingAt(100, LISTED)], MARK141)!;
    expect(thrown[0], 'a thrown flashbang still keeps 0.9').toBeCloseTo(200 * VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION, 6);
  });

  it('a FRAG off a listed ceiling carries the same way (the rule is the face, not the grenade)', () => {
    const frag = upInto([ceilingAt(100, LISTED)], M67)!;
    const flash = upInto([ceilingAt(100, LISTED)], MARK141)!;
    expect(frag[0]).toBeCloseTo(200 * VIGI_TUNNEL_CEILING_KEPT_SPEED_ADAPTATION, 6);
    expect(frag[0]).toBeCloseTo(flash[0], 6);
  });
});
