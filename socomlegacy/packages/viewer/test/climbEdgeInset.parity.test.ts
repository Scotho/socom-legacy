import { describe, expect, it } from 'vitest';
import { polygonNormal, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import { contactOf, crossSection, obstacleRay, planClimb } from '../src/climb';

/**
 * LATER 142 (research 313 section 8.10; `CLIMB_EDGE_INSET_PLACEHOLDER`, a placeholder; pending review): a hit at its cut's end is
 * taken 0.01 inside the cut. The walk's hit at an outside corner is the cut's end vertex (`mover.ts` `slide`: `nearest`
 * over `bandFootprint`), on the polygon's boundary, where the original's segment crossings almost never land; there
 * `'inside'`'s clamp (LATER 111) can still keep no edge by f32 rounding on a face not aligned to the axes, and the port
 * found no top -- no offer. Fixture-backed (MP2, MP6): the corner hits LATER 142's scratch found with the slide's own
 * hit, a body 3.2 in front of the face and 0.05 past its end, the low line at `step_height` (6.5) over the floor.
 * Contact-level: the walk's selection between the corner's two faces is not run here.
 */

const MP2 = fixture('RUN/MP2.ZDB'), MP6 = fixture('RUN/MP6.ZDB');

/** The horizontal unit normal of a face. */
const flat = (p: WorldPoly): [number, number] => { const n = polygonNormal(p.points)!, h = Math.hypot(n[0], n[2]); return [n[0] / h, n[2] / h]; };
/**
 * The climb face of `path` whose cut at the hit's height ends at the hit and that the body stands square in front of: the
 * corner's two faces both end there, and the body (3.2 out along this face's normal) is far more in front of its own.
 */
function faceAt(polys: readonly WorldPoly[], path: string, hit: readonly number[], body: readonly number[]): WorldPoly {
  const found = polys.filter((p) => p.path === path && crossSection(p.points, hit[1]!).some((c) => Math.hypot(c[0] - hit[0]!, c[2] - hit[2]!) < 1e-3));
  expect(found.length).toBe(2);                                            // the corner's two faces
  const ahead = (p: WorldPoly) => { const [nx, nz] = flat(p); return nx * (body[0]! - hit[0]!) + nz * (body[2]! - hit[2]!); };
  return found.sort((a, b) => ahead(b) - ahead(a))[0]!;
}
function offer(bytes: Uint8Array, stem: string, path: string, body: readonly number[], hit: readonly number[]) {
  const sim = simMapFromBytes(bytes, `RUN/${stem}.ZDB`);
  const polys = sim.grid.objects.flatMap((o) => (o.kind === 'collision' ? o.polys : []));
  const p = faceAt(polys, path, hit, body), [nx, nz] = flat(p);
  const c = contactOf(p, p.appflags ?? 0, body[0]!, body[2]!, hit)!;
  return { c, plan: planClimb(sim.grid, obstacleRay(sim.grid, c, body[0]!, body[1]!, body[2]!) ?? c, body[0]!, body[1]!, body[2]!, -nx, -nz) };
}

describe(`movement.climb: LATER 142 -- a hit at an outside corner keeps its column${MP2 && MP6 ? '' : ` (${FIXTURES_ABSENT} -- skipped)`}`, () => {
  it.skipIf(!MP2)('Frostfire prop02\'s corner: the crate climb offered, the top the face\'s (was: no top, nothing offered)', () => {
    const { c, plan } = offer(MP2!, 'MP2', 'worldmodel/prop02', [943.1579, 100, 857.0283], [941.71161, 106.5, 859.8833]);
    expect(c.top).toBeCloseTo(111.85, 2);                                   // RED before the build: NaN
    expect(plan?.kind).toBe('low');
    expect(plan!.target[1]).toBeCloseTo(111.85, 2);
  });
  it.skipIf(!MP6)('Desert Glory mp6_justbox1\'s corner: the climb over offered at the crate\'s top 13 (was: no top, nothing offered)', () => {
    const { c, plan } = offer(MP6!, 'MP6', 'worldmodel/crate05/mp6_justbox1=mp6_justbox1/parts_good/diclimb', [1254.8202, 0, 1589.0577], [1256.52356, 6.5, 1591.76709]);
    expect(c.top).toBeCloseTo(13, 2);                                       // RED before the build: NaN
    expect(plan?.kind).toBe('over');
    expect(plan!.target[1]).toBeCloseTo(13, 2);
  });
});
