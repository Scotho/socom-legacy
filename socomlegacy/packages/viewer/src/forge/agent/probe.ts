import { FORGE_PROBE_LIMITS } from '@s2u/forge-agent-protocol';
import { isGroundSurface, probeGround, segmentHits, type Grid } from '@s2u/scene';
import { ForgeAgentError } from './api';

/**
 * AX-17 (plan item 17; a browser adaptation, product track): `world.probe` (`forge.probe` on the wire) -- where the ground
 * is, what a segment first meets, and free floor near a point -- read off the collision and bounds the editor ALREADY
 * builds for its placement checks: the placement grid (`../page` `refreshPlacementGround`, the base's hull and every
 * piece's, `../ground` `layoutGround`) and the pieces' bounds (the obstacles `../../creator/catalogue` `checkPlacement`
 * compares against). It adds no physics path and no simulation value: the ground probe is `@s2u/scene` `probeGround`
 * (the walk's own vertical probe), the ray `segmentHits`, and every bound is an instrument limit (`FORGE_PROBE_LIMITS`).
 * A diagnostic that never certifies traversability; nothing here changes the layout or the game.
 */
type Vec3 = [number, number, number];
export interface ForgeProbeWorld {
  /** The editor's placement grid; null while no base is loaded (NO_GROUND). */
  grid: Grid | null;
  /** The placed pieces' world bounds, by their revision-scoped refs (the placement check's obstacles). */
  obstacles: readonly { ref: string; bounds: { min: readonly number[]; max: readonly number[] } }[];
  /** A hull owner's path (`forge/piece_<i>`) to its placement ref; null for the base's own hull. */
  refOfOwner(path: string): string | null;
  /** The editor's snap grid step: `free`'s default sample step. */
  gridStep: number;
}
export interface ForgeProbeOptions {
  /** The clock the time budget reads (ms); `performance.now` by default. */
  now?: () => number;
}
export type ForgeProbeSurface = { kind: 'piece'; ref: string } | { kind: 'base'; path: string };

const DIAGNOSTIC = "A browser adaptation's diagnostic over the editor's placement collision: it never certifies traversability; walk it in Play to know.";
/** The other surfaces a ground probe lists under the first (a bound on the answer's size only). */
const OTHERS_MAX = 8;
/** `free`'s candidate count when the call names none. */
const DEFAULT_LIMIT = 8;

const fail = (code: string, message: string): never => { throw new ForgeAgentError(code, message); };
const vec = (value: unknown, n: number, name: string): number[] => {
  if (!Array.isArray(value) || value.length !== n || value.some((v) => typeof v !== 'number' || !Number.isFinite(v))) fail('INVALID_ARGUMENT', `args.${name} is required for this kind`);
  return value as number[];
};
const tidy = (n: number): number => Math.round(n * 1e4) / 1e4 + 0;

export function probeForge(world: ForgeProbeWorld, args: Record<string, unknown>, revision: number, options: ForgeProbeOptions = {}): Record<string, unknown> {
  const now = options.now ?? (() => performance.now());
  const grid = world.grid;
  const kind = args['kind'];
  const common = { kind, revision, traversability: 'unverified' as const, diagnostic: DIAGNOSTIC };
  const surfaceOf = (path: string): ForgeProbeSurface => {
    const ref = world.refOfOwner(path);
    return ref ? { kind: 'piece', ref } : { kind: 'base', path };
  };
  /** Every ground surface under (x, z), highest first, at or below `below` (the walk's own vertical probe). */
  const groundsAt = (x: number, z: number, below: number) => probeGround(grid!, x, z).filter((h) => h.y <= below).sort((a, b) => b.y - a.y);

  if (kind === 'ground') {
    const [x, z] = vec(args['at'], 2, 'at') as [number, number];
    if (!grid) return fail('NO_GROUND', 'This base has no hull to probe');
    const below = typeof args['below'] === 'number' ? args['below'] : Infinity;
    const hits = groundsAt(x, z, below);
    const top = hits[0];
    if (!top) return { ...common, at: [x, z], hit: false, partial: false, bounds: [] };
    return { ...common, at: [x, z], hit: true, y: tidy(top.y), point: [x, tidy(top.y), z], normal: top.normal.map(tidy), surface: surfaceOf(top.owner.path),
      others: hits.slice(1, 1 + OTHERS_MAX).map((h) => ({ y: tidy(h.y), surface: surfaceOf(h.owner.path) })), partial: hits.length - 1 > OTHERS_MAX,
      bounds: hits.length - 1 > OTHERS_MAX ? ['others'] : [] };
  }

  if (kind === 'ray') {
    const from = vec(args['from'], 3, 'from') as Vec3, to = vec(args['to'], 3, 'to') as Vec3;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    if (!(length > 0)) return fail('INVALID_ARGUMENT', 'args.from and args.to must differ');
    if (length > FORGE_PROBE_LIMITS.ray) return fail('PROBE_TOO_LARGE', `A ray is at most ${FORGE_PROBE_LIMITS.ray} units long`);
    if (!grid) return fail('NO_GROUND', 'This base has no hull to probe');
    const hit = segmentHits(grid, from, to)[0];
    if (!hit) return { ...common, from, to, hit: false, partial: false, bounds: [] };
    return { ...common, from, to, hit: true, point: hit.point.map(tidy), normal: hit.normal.map(tidy), t: tidy(hit.t), distance: tidy(hit.t * length),
      ground: isGroundSurface(hit.poly), surface: surfaceOf(hit.owner.path), partial: false, bounds: [] };
  }

  if (kind === 'free') {
    const near = vec(args['near'], 3, 'near') as Vec3;
    if (typeof args['radius'] !== 'number') return fail('INVALID_ARGUMENT', 'args.radius is required for this kind');
    const radius = args['radius'];
    if (radius > FORGE_PROBE_LIMITS.radius) return fail('PROBE_TOO_LARGE', `A free probe's radius is at most ${FORGE_PROBE_LIMITS.radius} units`);
    if (!grid) return fail('NO_GROUND', 'This base has no hull to probe');
    const [w, d] = (args['footprint'] as [number, number] | undefined) ?? [0, 0];
    const limit = (args['limit'] as number | undefined) ?? DEFAULT_LIMIT;
    const below = typeof args['below'] === 'number' ? args['below'] : Infinity;
    const bounds: string[] = [];
    // The lattice about `near`: (2m + 1)^2 points at most, within the sample cap; a finer step is widened to fit.
    let step = (args['step'] as number | undefined) ?? (world.gridStep > 0 ? world.gridStep : 1);
    const reach = Math.floor((Math.floor(Math.sqrt(FORGE_PROBE_LIMITS.samples)) - 1) / 2);
    if (Math.floor(radius / step) > reach) { step = radius / reach; bounds.push('sample-cap'); }
    const m = Math.floor(radius / step + 1e-9);
    const lattice: { x: number; z: number; distance: number }[] = [];
    for (let i = -m; i <= m; i++) for (let k = -m; k <= m; k++) {
      const distance = Math.hypot(i * step, k * step);
      if (distance <= radius + 1e-9) lattice.push({ x: near[0] + i * step, z: near[2] + k * step, distance });
    }
    lattice.sort((a, b) => a.distance - b.distance || a.x - b.x || a.z - b.z);
    const start = now();
    const candidates: { point: number[]; distance: number; surface: ForgeProbeSurface }[] = [];
    let samples = 0;
    for (const s of lattice) {
      if (candidates.length >= limit) break;
      if (now() - start > FORGE_PROBE_LIMITS.budgetMs) { bounds.push('time-budget'); break; }
      samples++;
      const top = groundsAt(s.x, s.z, below)[0];
      if (!top) continue;
      // Plan view, conservative: the footprint's box against each piece's bounds; touching faces are not overlap.
      const x0 = s.x - w / 2, x1 = s.x + w / 2, z0 = s.z - d / 2, z1 = s.z + d / 2;
      if (world.obstacles.some((o) => x0 < o.bounds.max[0]! && x1 > o.bounds.min[0]! && z0 < o.bounds.max[2]! && z1 > o.bounds.min[2]!)) continue;
      candidates.push({ point: [tidy(s.x), tidy(top.y), tidy(s.z)], distance: tidy(s.distance), surface: surfaceOf(top.owner.path) });
    }
    return { ...common, near, radius, footprint: [w, d], step: tidy(step), limit, candidates, samples, sampleCap: FORGE_PROBE_LIMITS.samples,
      overlapScope: 'placed pieces\' bounds, plan view', partial: bounds.length > 0, bounds };
  }
  return fail('INVALID_ARGUMENT', 'args.kind must be ground, ray or free');
}
