/**
 * Product adaptation: bounded offline acceptance preparation, never a gameplay operation.
 * A validated source route is separate from a rendered normal-input traversal or an actual plant.
 */
import type { SimMap } from '../../packages/viewer/src/simMap';
import type { Team } from '../../packages/viewer/src/net/protocol';
import { aiCellCentre } from '../../packages/scene/src/aimaps';
import { WalkingNavigation } from '../../packages/match/src/bots/navigation';
import { atPlantSite, plantSite } from '../../packages/viewer/src/net/objective';

type Point = [number, number, number];

/** Caller-selected work limits for this tool, not original game rules or movement tuning. */
export interface WalkingRouteBudget {
  maxSourceCells: number;
  maxNodes: number;
  maxCandidates: number;
  maxRoutePoints: number;
  maxSegmentChecks: number;
}

/** Narrow seam for coordinator unit tests; production uses the existing WalkingNavigation. */
export interface WalkingRoutePlanner {
  readonly nodes: readonly { readonly at: Point }[];
  route(from: Point, to: Point): Point[];
  canWalk(from: Point, to: Point): boolean;
}

export interface WalkingRouteRequest {
  map: SimMap;
  from: Point;
  team: Team;
  budget: WalkingRouteBudget;
  /** Candidate selection only. Collision data must remain complete. */
  corridor?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export type WalkingRouteReport = {
  status: 'refused';
  reason: string;
} | {
  status: 'validated';
  goal: Point;
  raw: Point[];
  waypoints: Point[];
  evidence: {
    sourceRoute: 'validated';
    plantEligibility: 'eligible';
    renderedTraversal: 'not-run';
    actualPlant: 'not-run';
  };
};

const refused = (reason: string): WalkingRouteReport => ({ status: 'refused', reason });
const finitePoint = (point: readonly number[]): boolean => point.length === 3 && point.every(Number.isFinite);
const samePoint = (a: Point, b: Point): boolean => a.every((value, axis) => value === b[axis]);
const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Select source AI columns before graph generation. aiCellCentre (research 75) supplies the coordinate
 * convention; the corridor is only the caller's product work bound. No source cell arrays or hulls change.
 */
function candidateMap(request: WalkingRouteRequest): SimMap | 'budget-exceeded' | 'unsupported-source' {
  const { map, corridor, budget } = request;
  let count = 0;
  const maps = [];
  for (const sub of map.ai!.maps) {
    if (!finitePoint(sub.min) || !sub.cellSize.every((value) => Number.isFinite(value) && value > 0)) return 'unsupported-source';
    const rows = [];
    for (let z = 0; z < sub.rows.length; z++) {
      const row = sub.rows[z]!;
      if (![row.x0, row.x1, row.first].every(Number.isSafeInteger)
        || row.x0 < 0 || row.x1 < row.x0 || row.x1 > sub.cellsX || row.first < 0
        || row.first + row.x1 - row.x0 > sub.cells.length) return 'unsupported-source';
      let { x0, x1 } = row;
      if (corridor) {
        const [originX, worldZ] = aiCellCentre(sub, 0, z);
        if (worldZ < corridor.minZ || worldZ > corridor.maxZ) x1 = x0;
        else {
          x0 = Math.min(row.x1, Math.max(row.x0, Math.ceil((corridor.minX - originX) / sub.cellSize[0])));
          x1 = Math.max(x0, Math.min(row.x1, Math.floor((corridor.maxX - originX) / sub.cellSize[0]) + 1));
        }
      }
      count += x1 - x0;
      if (count > budget.maxSourceCells) return 'budget-exceeded';
      rows.push({ x0, x1, first: row.first + x0 - row.x0 });
    }
    maps.push({ ...sub, rows });
  }
  return { ...map, ai: { ...map.ai!, maps } };
}

/**
 * Offline product aid. Goals are actual navigation floor nodes under source AI cell centres, accepted by
 * plantSite/atPlantSite (objective.ts, research 214 and PLANT_REACH_READING). An objective's exact origin
 * need not have a floor. No guessed waypoint, floor snap, teleport, input or player-state write is used.
 *
 * WalkingNavigation generates only the bounded selected columns and checks graph edges lazily; .prepare()
 * is never called. Its canWalk uses the existing Walker and its current floor/body tolerances unchanged.
 * maxNodes refuses excess layered floor nodes before any route search. maxSegmentChecks also bounds
 * canWalk calls made inside route(), including attachments and lazy edge discovery, not just final checks.
 * The injected factory is a coordinator-test seam and must supply a fresh planner for this synchronous call.
 */
export function findPlantWalkingRoute(request: WalkingRouteRequest,
  createPlanner: (map: SimMap) => WalkingRoutePlanner = (map) => new WalkingNavigation(map, undefined, true)): WalkingRouteReport {
  const { map, from, team, budget, corridor } = request;
  if (!finitePoint(from) || (team !== 'seal' && team !== 'terrorist')
    || !Object.values(budget).every((value) => Number.isSafeInteger(value) && value > 0)
    || [budget.maxSourceCells, budget.maxNodes, budget.maxCandidates, budget.maxRoutePoints, budget.maxSegmentChecks].some((value) => value === undefined)
    || (corridor && (!Object.values(corridor).every(Number.isFinite)
      || corridor.minX > corridor.maxX || corridor.minZ > corridor.maxZ))) return refused('invalid-request');
  const site = plantSite(team, map.meta?.actions ?? []);
  if (!site) return refused('no-plant-site');
  if (!finitePoint(site.at) || !Number.isFinite(site.range) || !Number.isFinite(site.elevation)) return refused('unsupported-source');
  if (!map.ai?.maps.length) return refused('missing-source-ai');
  const selected = candidateMap(request);
  if (typeof selected === 'string') return refused(selected);

  let nav: WalkingRoutePlanner;
  try { nav = createPlanner(selected); } catch { return refused('unsupported-source'); }
  if (nav.nodes.length > budget.maxNodes) return refused('budget-exceeded');
  if (nav.nodes.some((node) => !finitePoint(node.at))) return refused('unsupported-source');
  const goals = nav.nodes.map((node) => node.at).filter((at) => atPlantSite(site, at))
    .sort((a, b) => distance(from, a) - distance(from, b));
  if (!goals.length) return refused('no-eligible-goal');

  const exhausted = Symbol('product segment-check budget exhausted');
  const originalCanWalk = nav.canWalk;
  let checks = 0;
  // This fresh scratch planner has no combatant. Intercepting its predicate keeps its own lazy search
  // inside the same product budget without changing any movement or collision implementation.
  nav.canWalk = (a, b) => {
    if (checks >= budget.maxSegmentChecks) throw exhausted;
    checks++;
    return originalCanWalk.call(nav, a, b);
  };
  try {
    for (let attempt = 0; attempt < Math.min(goals.length, budget.maxCandidates); attempt++) {
      const goal: Point = [...goals[attempt]!];
      const raw = nav.route([...from], [...goal]);
      if (raw.length > budget.maxRoutePoints) return refused('budget-exceeded');
      if (!raw.length || raw.some((point) => !finitePoint(point)) || !samePoint(raw[raw.length - 1]!, goal)
        || !atPlantSite(site, raw[raw.length - 1]!)) continue;
      let previous = from, valid = true;
      for (const point of raw) {
        if (!nav.canWalk(previous, point)) { valid = false; break; }
        previous = point;
      }
      if (!valid) continue;

      const waypoints: Point[] = [];
      previous = from;
      for (let cursor = 0; cursor < raw.length;) {
        // Keeping the next raw edge is already verified above. Any skipped corner needs a fresh
        // canWalk check; a failed long shortcut says nothing about a shorter one.
        let best = cursor;
        for (let next = raw.length - 1; next > cursor; next--) {
          if (nav.canWalk(previous, raw[next]!)) { best = next; break; }
        }
        previous = raw[best]!;
        waypoints.push([...previous]);
        cursor = best + 1;
      }
      return { status: 'validated', goal, raw: raw.map((point) => [...point]), waypoints,
        evidence: { sourceRoute: 'validated', plantEligibility: 'eligible', renderedTraversal: 'not-run', actualPlant: 'not-run' } };
    }
    return refused(goals.length > budget.maxCandidates ? 'budget-exceeded' : 'no-validated-route');
  } catch (error) {
    return refused(error === exhausted ? 'budget-exceeded' : 'unsupported-source');
  } finally {
    nav.canWalk = originalCanWalk;
  }
}
