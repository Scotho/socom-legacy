/**
 * Product adaptation: offline route-acceptance coordinator tests.
 * All geometry, AI cells and action records below are synthetic. Injected planner responses test
 * refusal/selection logic only; they establish no original-map route, rendered traversal or actual plant.
 * The production adapter must use WalkingNavigation lazily and keep the complete collision grid.
 */
import { describe, expect, it, vi } from 'vitest';
import { packGround, groundGrid } from '../../packages/viewer/src/mover';
import { probeGround } from '../../packages/scene/src/probe';
import type { SimMap } from '../../packages/viewer/src/simMap';
import type { MapAction } from '../../packages/viewer/src/mapActions';
import { atPlantSite } from '../../packages/viewer/src/net/objective';
import {
  findPlantWalkingRoute, type WalkingRoutePlanner, type WalkingRouteBudget,
} from './walkingRoute';

type Point = [number, number, number];
const start: Point = [0, 0, 0];
const eligible: Point = [35, 0, 0];
const budget: WalkingRouteBudget = {
  maxSourceCells: 16, maxNodes: 16, maxCandidates: 4, maxRoutePoints: 16, maxSegmentChecks: 64,
};

function site(): MapAction {
  return {
    node: 'terrorist_tent', type: 'MPBOMB', typeCode: 4, valve: '', anims: [], team: null,
    range: 10, elevation: 10, points: 0, bitmap: '', path: 'synthetic/terrorist_tent', at: [40, 0, 0],
  };
}

function map(): SimMap {
  // Empty synthetic collision data: the injected planner, never this hull, supplies coordinator cases.
  const ground = packGround({ atomCount: 64, posts: 4, cellDim: 20, cellsX: 4, cellsZ: 2,
    originX: 0, originZ: 0 }, [], []);
  return {
    stem: 'SYNTHETIC', name: 'COORDINATOR ONLY', ground, grid: groundGrid(ground),
    spawns: null, slots: [], respawns: [], notes: [],
    meta: { stem: 'SYNTHETIC', actions: [site()], instances: [], instanceByPath: new Map(), initial: [], diagnostics: [] },
    ai: {
      version: 2, links: { words: 0, records: 0 }, spawns: [], maps: [{
        index: 0, name: 'synthetic', id: 0, flags: 0, min: [0, 0, 0], max: [40, 0, 20],
        cellsX: 4, cellsZ: 2, cellSize: [10, 10], param: 0, stamp: 0,
        rows: [{ x0: 0, x1: 4, first: 0 }, { x0: 0, x1: 4, first: 4 }],
        cells: new Uint32Array(8), cellsB: new Uint32Array(8), points: [], markers: [],
        links: [], zones: [], spawns: [], lines: [],
      }],
    },
  };
}

function planner(points: Point[] = [eligible]): WalkingRoutePlanner {
  return {
    nodes: points.map((at) => ({ at })),
    route: vi.fn((_from: Point, to: Point): Point[] => [[...to]]),
    canWalk: vi.fn(() => true),
  };
}

function find(nav: WalkingRoutePlanner, limits = budget, source = map()) {
  return findPlantWalkingRoute({ map: source, from: start, team: 'seal', budget: limits }, () => nav);
}

function syntheticWalkingMap(wall = false): SimMap {
  const source = map();
  const floor = { modelName: 'worldmodel', path: 'synthetic-floor', region: 0, ditype: 3,
    material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-20, 0, -20, 38, 0, -20, 38, 0, 60, -20, 0, 60]) };
  const polys = [floor];
  // Wound to face -x, toward a walk from x 0: a hull face is met only from its front (research 281 s4.3; SEGMENT-BODY).
  if (wall) polys.push({ ...floor, path: 'synthetic-wall', ditype: 2,
    points: Float32Array.from([20, 0, -20, 20, 0, 60, 20, 50, 60, 20, 50, -20]) });
  const ground = packGround({ atomCount: 64, posts: 4, cellDim: 20, cellsX: 4, cellsZ: 2,
    originX: 0, originZ: 0 }, polys,
  polys.map((poly, index) => ({ modelName: poly.modelName, path: poly.path, first: index, count: 1 })));
  return { ...source, ground, grid: groundGrid(ground) };
}

describe('bounded offline walking-route acceptance (product adaptation)', () => {
  const nonfinitePoints: { label: string; point: Point }[] = [
    { label: 'NaN x', point: [NaN, 0, 0] },
    { label: 'positive infinite y', point: [35, Infinity, 0] },
    { label: 'negative infinite z', point: [35, 0, -Infinity] },
  ];
  const budgetKeys: (keyof WalkingRouteBudget)[] = [
    'maxSourceCells', 'maxNodes', 'maxCandidates', 'maxRoutePoints', 'maxSegmentChecks',
  ];
  const invalidBudgets = budgetKeys.flatMap((key) => [
    { key, label: 'zero', value: 0 }, { key, label: 'negative', value: -1 },
    { key, label: 'fractional', value: 1.5 }, { key, label: 'NaN', value: NaN },
    { key, label: 'infinite', value: Infinity },
    { key, label: 'unsafe integer', value: Number.MAX_SAFE_INTEGER + 1 },
  ]);

  it.each(nonfinitePoints)('refuses nonfinite request feet: $label before planner construction', ({ point }) => {
    const createPlanner = vi.fn(() => planner());
    expect(findPlantWalkingRoute({ map: map(), from: point, team: 'seal', budget }, createPlanner))
      .toMatchObject({ status: 'refused', reason: 'invalid-request' });
    expect(createPlanner).not.toHaveBeenCalled();
  });

  it.each(nonfinitePoints)('refuses nonfinite planner node: $label before requesting a route', ({ point }) => {
    const nav = planner([point]);
    expect(find(nav)).toMatchObject({ status: 'refused', reason: 'unsupported-source' });
    expect(nav.route).not.toHaveBeenCalled();
  });

  it.each(nonfinitePoints)('refuses nonfinite intermediate route point: $label despite an exact eligible endpoint', ({ point }) => {
    const nav = planner();
    nav.route = vi.fn<WalkingRoutePlanner['route']>(() => [point, [35, 0, 0]]);
    // The deliberately permissive coordinator fake would accept this route without the finite-point guard.
    expect(find(nav)).toMatchObject({ status: 'refused', reason: 'no-validated-route' });
    expect(nav.canWalk).not.toHaveBeenCalled();
  });

  it.each(invalidBudgets)('refuses $label $key before planner construction', ({ key, value }) => {
    const createPlanner = vi.fn(() => planner());
    expect(findPlantWalkingRoute({ map: map(), from: start, team: 'seal',
      budget: { ...budget, [key]: value } }, createPlanner))
      .toMatchObject({ status: 'refused', reason: 'invalid-request' });
    expect(createPlanner).not.toHaveBeenCalled();
  });

  it.each(budgetKeys)('refuses an omitted %s even when all remaining limits are valid', (key) => {
    const incomplete: Partial<WalkingRouteBudget> = { ...budget };
    delete incomplete[key];
    const createPlanner = vi.fn(() => planner());
    // Intentional runtime-invalid request: omission needs its own guard beyond checking present values.
    expect(findPlantWalkingRoute({ map: map(), from: start, team: 'seal',
      budget: incomplete as WalkingRouteBudget }, createPlanner))
      .toMatchObject({ status: 'refused', reason: 'invalid-request' });
    expect(createPlanner).not.toHaveBeenCalled();
  });

  it('refuses a map with no source plant site instead of inventing an objective', () => {
    const source = map();
    source.meta!.actions = [];
    const createPlanner = vi.fn(() => planner());
    expect(findPlantWalkingRoute({ map: source, from: start, team: 'seal', budget }, createPlanner))
      .toMatchObject({ status: 'refused', reason: 'no-plant-site' });
    expect(createPlanner).not.toHaveBeenCalled();
  });

  it('refuses absent source AI instead of generating fallback grid candidates', () => {
    const source = map();
    delete source.ai;
    const createPlanner = vi.fn(() => planner());
    expect(findPlantWalkingRoute({ map: source, from: start, team: 'seal', budget }, createPlanner))
      .toMatchObject({ status: 'refused', reason: 'missing-source-ai' });
    expect(createPlanner).not.toHaveBeenCalled();
  });

  it('refuses no eligible source goal without asking for a route', () => {
    const nav = planner([[20, 0, 0], [35, 20, 0]]);
    expect(find(nav)).toMatchObject({ status: 'refused', reason: 'no-eligible-goal' });
    expect(nav.route).not.toHaveBeenCalled();
  });

  it('selects a reachable eligible source node when the exact objective origin has no usable floor', () => {
    const nav = planner();
    nav.canWalk = vi.fn((_from, to) => to[0] !== 40);
    const result = find(nav);
    expect(result).toMatchObject({ status: 'validated', goal: [35, 0, 0], waypoints: [[35, 0, 0]] });
    expect(nav.route).toHaveBeenCalledWith(start, eligible);
    // This checks existing eligibility, not any newly copied radius/elevation rule.
    if (result.status === 'validated') expect(atPlantSite(site(), result.goal)).toBe(true);
  });

  it('refuses a partial path even when its last point would also be plant eligible', () => {
    const nav = planner();
    nav.route = vi.fn<WalkingRoutePlanner['route']>(() => [[34, 0, 0]]);
    expect(find(nav)).toMatchObject({ status: 'refused', reason: 'no-validated-route' });
  });

  it('refuses an empty planner path instead of treating eligibility as arrival', () => {
    const nav = planner();
    nav.route = vi.fn<WalkingRoutePlanner['route']>(() => []);
    expect(find(nav)).toMatchObject({ status: 'refused', reason: 'no-validated-route' });
  });

  it('refuses an unwalkable segment despite a complete planner endpoint', () => {
    const nav = planner();
    nav.route = vi.fn<WalkingRoutePlanner['route']>(() => [[10, 0, 0], [35, 0, 0]]);
    nav.canWalk = vi.fn((from, to) => !(from[0] === 10 && to[0] === 35));
    expect(find(nav)).toMatchObject({ status: 'refused', reason: 'no-validated-route' });
  });

  it('checks the start attachment instead of trusting only internal route edges', () => {
    const nav = planner();
    nav.route = vi.fn<WalkingRoutePlanner['route']>(() => [[10, 0, 0], [35, 0, 0]]);
    nav.canWalk = vi.fn((from, to) => !(from[0] === 0 && to[0] === 10));
    expect(find(nav)).toMatchObject({ status: 'refused', reason: 'no-validated-route' });
  });

  it('keeps verified corners when simplification would cross a blocked shortcut', () => {
    const nav = planner();
    nav.route = vi.fn<WalkingRoutePlanner['route']>(() => [[0, 0, 20], [35, 0, 20], [35, 0, 0]]);
    // Synthetic directed edge oracle: only the three raw edges are walkable.
    const allowed = new Set(['0,0,0>0,0,20', '0,0,20>35,0,20', '35,0,20>35,0,0']);
    nav.canWalk = vi.fn((from, to) => allowed.has(`${from}>${to}`));
    expect(find(nav)).toMatchObject({ status: 'validated',
      waypoints: [[0, 0, 20], [35, 0, 20], [35, 0, 0]] });
  });

  it('bounds source candidate columns before constructing a planner', () => {
    const createPlanner = vi.fn(() => planner());
    expect(findPlantWalkingRoute({ map: map(), from: start, team: 'seal',
      budget: { ...budget, maxSourceCells: 7 } }, createPlanner))
      .toMatchObject({ status: 'refused', reason: 'budget-exceeded' });
    expect(createPlanner).not.toHaveBeenCalled();
  });

  it('refuses excess generated floor nodes before routing', () => {
    const nav = planner([[35, 0, 0], [36, 0, 0], [37, 0, 0]]);
    expect(find(nav, { ...budget, maxNodes: 2 })).toMatchObject({ status: 'refused', reason: 'budget-exceeded' });
    expect(nav.route).not.toHaveBeenCalled();
  });

  it('caps goal attempts rather than searching an unbounded eligible candidate list', () => {
    const nav = planner([[35, 0, 0], [36, 0, 0], [37, 0, 0]]);
    nav.route = vi.fn<WalkingRoutePlanner['route']>((_from, goal) => goal[0] === 37 ? [[...goal]] : []);
    expect(find(nav, { ...budget, maxCandidates: 2 })).toMatchObject({ status: 'refused', reason: 'budget-exceeded' });
    expect(nav.route).toHaveBeenCalledTimes(2);
  });

  it('bounds planner output before verifying or simplifying a long path', () => {
    const nav = planner();
    nav.route = vi.fn<WalkingRoutePlanner['route']>(() => [[1, 0, 0], [2, 0, 0], [35, 0, 0]]);
    expect(find(nav, { ...budget, maxRoutePoints: 2 })).toMatchObject({ status: 'refused', reason: 'budget-exceeded' });
  });

  it('refuses an exhausted segment-check budget rather than returning unverified waypoints', () => {
    const nav = planner();
    nav.route = vi.fn<WalkingRoutePlanner['route']>(() => [[1, 0, 0], [2, 0, 0], [35, 0, 0]]);
    expect(find(nav, { ...budget, maxSegmentChecks: 1 })).toMatchObject({ status: 'refused', reason: 'budget-exceeded' });
    expect(vi.mocked(nav.canWalk).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('clips only AI candidate columns while preserving collision and original source arrays', () => {
    const source = map();
    const originalRows = structuredClone(source.ai!.maps[0]!.rows);
    const originalCells = source.ai!.maps[0]!.cells;
    const createPlanner = vi.fn((input: SimMap) => {
      expect(input.grid).toBe(source.grid);
      expect(input.ground).toBe(source.ground);
      expect(input.ai!.maps[0]!.cells).toBe(originalCells);
      expect(input.ai!.maps[0]!.rows).toEqual([
        { x0: 3, x1: 4, first: 3 }, { x0: 0, x1: 0, first: 4 },
      ]);
      return planner();
    });
    expect(findPlantWalkingRoute({ map: source, from: start, team: 'seal', budget,
      corridor: { minX: 30, maxX: 40, minZ: 0, maxZ: 10 } }, createPlanner))
      .toMatchObject({ status: 'validated' });
    expect(source.ai!.maps[0]!.rows).toEqual(originalRows);
  });

  it('reports source-route and eligibility evidence separately from actual traversal and planting', () => {
    expect(find(planner())).toMatchObject({ status: 'validated', evidence: {
      sourceRoute: 'validated', plantEligibility: 'eligible', renderedTraversal: 'not-run', actualPlant: 'not-run',
    } });
  });

  it('uses the real WalkingNavigation and Walker on synthetic floors, without requiring floor at the objective origin', () => {
    const source = syntheticWalkingMap();
    expect(probeGround(source.grid, 40, 0)).toEqual([]);
    expect(findPlantWalkingRoute({ map: source, from: start, team: 'seal', budget }))
      .toMatchObject({ status: 'validated', goal: [35, 0, 5], waypoints: [[35, 0, 5]],
        evidence: { actualPlant: 'not-run', renderedTraversal: 'not-run' } });
  });

  it('refuses a wall crossing through the real walker rather than trusting eligible AI columns', () => {
    expect(findPlantWalkingRoute({ map: syntheticWalkingMap(true), from: start, team: 'seal', budget }))
      .toMatchObject({ status: 'refused', reason: 'no-validated-route' });
  });

  it('bounds canWalk calls made inside the lazy planner search as well as output validation', () => {
    const nav = planner();
    nav.route = vi.fn<WalkingRoutePlanner['route']>(() => {
      nav.canWalk(start, [10, 0, 0]);
      nav.canWalk(start, [20, 0, 0]);
      return [[35, 0, 0]];
    });
    expect(find(nav, { ...budget, maxSegmentChecks: 1 })).toMatchObject({ status: 'refused', reason: 'budget-exceeded' });
    expect(vi.mocked(nav.canWalk).mock.calls).toHaveLength(1);
  });
});
