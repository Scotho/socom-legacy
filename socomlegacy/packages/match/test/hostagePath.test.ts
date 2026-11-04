import { HostageObstacles } from '../src/hostageObstacles';
import { describe, expect, it, vi } from 'vitest';
import { aiMapsFromZdb, parseEscortees, placeEscortees, zonesOfKind, type AiMaps, type AiSubMap } from '@s2u/scene';
import { parseRdr, parseZdb, Zar, zdbMember } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import { HostagePathPlanner, basicStepCost, HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER, HOSTAGE_PATH_SLICE_READING, type HostagePathTicket } from '../src/hostagePath';

function grid(index = 0, size = 7): AiSubMap {
  return { index, id: index, name: 'synthetic', flags: 0, min: [0, 0, 0], max: [size * 10, 100, size * 10],
    cellsX: size, cellsZ: size, cellSize: [10, 10], param: 0.5, stamp: 0,
    rows: Array.from({ length: size }, (_, z) => ({ x0: 0, x1: size, first: z * size })),
    cells: new Uint32Array(size * size).fill(0x80000001), cellsB: new Uint32Array(size * size).fill(0xffffffff),
    points: [], markers: [], links: [], zones: [], spawns: [], lines: [] };
}
function maps(...sub: AiSubMap[]): AiMaps { return { version: 2, maps: sub, links: { words: 0, records: 0 }, spawns: [] }; }
const loc = (x: number, z: number, map = 0) => ({ map, x, z });

describe('HF-PATH original BASIC planner (research 333)', () => {
  it('casts a world-endpoint Yield ray without requiring a stored destination', () => {
    const p = new HostagePathPlanner(maps(grid())), seen: number[] = [];
    expect(p.worldProbeCells(loc(3, 3), [35, 0, -20], s => { seen.push(s.loc.z); return s.loc.z !== 2; })).toBe(false);
    expect(seen).toEqual([3, 2]);
  });
  it('prepends the first valid perpendicular Yield detour, trying positive before negative', () => {
    const sub = grid(), p = new HostagePathPlanner(maps(sub));
    const route = [{ ...loc(5, 3), link: false, action: false, width: 0 }];
    expect(p.yieldRoute(route, loc(3, 3), [35, 0, 35], loc(4, 3))).toBe(true);
    expect(route.map(p => [p.x, p.z])).toEqual([[3, 4], [5, 3]]);
    sub.cells[4 * 7 + 3] = 9;
    const second = [{ ...loc(5, 3), link: false, action: false, width: 0 }];
    expect(p.yieldRoute(second, loc(3, 3), [35, 0, 35], loc(4, 3))).toBe(true);
    expect(second.map(p => [p.x, p.z])).toEqual([[3, 2], [5, 3]]);
  });
  it('stops a failed perpendicular ray at radius30', () => {
    const p = new HostagePathPlanner(maps(grid()));
    p.canTravel = () => false;
    const visited: number[] = [];
    p.worldProbeCells = (from, to, visit) => {
      for (const distance of [10, 30, 40]) {
        visited.push(distance);
        if (!visit({ loc: loc(3, 4), word: 1, previousWord: 1, distance, fraction: distance / 40, direction: [0, 0, 1], height: 0 })) return false;
      }
      return true;
    };
    expect(p.yieldRoute([{ ...loc(5, 3), link: false, action: false, width: 0 }], loc(3, 3), [35, 0, 35], loc(4, 3))).toBe(false);
    expect(visited).toEqual([10, 30, 10, 30]);
  });
  it('drops a route head occupied by the other raw cell before searching the detour', () => {
    const p = new HostagePathPlanner(maps(grid()));
    const route = [loc(4, 3), loc(5, 3)].map(p => ({ ...p, link: false, action: false, width: 0 }));
    expect(p.yieldRoute(route, loc(3, 3), [35, 0, 35], loc(4, 3))).toBe(true);
    expect(route.map(p => [p.x, p.z])).toEqual([[3, 4], [5, 3]]);
  });
  it('rounds the probe center before adding its authored action offset', () => {
    const sub = grid(0, 40); sub.min[0] = -39.80140686035156; sub.max[0] = 360.19859313964844;
    sub.cells[10 * 40 + 30] = 0x81;
    sub.markers.push({ loc: loc(30, 10), word: 8, flags: 1 });
    const p = new HostagePathPlanner(maps(sub));
    p.routeProbeCells(loc(29, 10), loc(30, 10), s => {
      // Separately rounded endpoint X=265.7288818359375; start X=255.19859313964844.
      expect(s.direction[2] / s.direction[0]).toBeCloseTo(-0.53033447265625 / 10.530288696289062, 8);
      return false;
    });
  });
  it('visits probe cells once including blocked soil and terminates on the callback', () => {
    const sub = grid(), p = new HostagePathPlanner(maps(sub)), seen: number[] = [];
    sub.cells[3 * 7 + 3] = 9;
    expect(p.routeProbeCells(loc(1, 3), loc(5, 3), s => { seen.push(s.loc.x); return s.loc.x !== 3; })).toBe(false);
    expect(seen).toEqual([1, 2, 3]);
    const previous: (number | null)[] = [];
    expect(p.routeProbeCells(loc(1, 3), loc(5, 3), s => { previous.push(s.previousWord); return true; })).toBe(true);
    expect(previous).toEqual([null, 0x80000001, 0x80000001, 9, 0x80000001]);
  });
  it('fails on interior missing storage but preserves success for a missing final offset cell', () => {
    const sub = grid(), p = new HostagePathPlanner(maps(sub));
    sub.rows[2] = { x0: 0, x1: 0, first: 0 };
    expect(p.routeProbeCells(loc(1, 1), loc(1, 3), () => true)).toBe(false);
    // South offset lands exactly on the missing row boundary only at t=1.
    sub.cellSize = [1.5, 1.5]; sub.max = [10.5, 100, 10.5];
    sub.cells[7 + 1] = 0x81; sub.markers.push({ loc: loc(1, 1), word: 8, flags: 4 });
    expect(p.routeProbeCells(loc(1, 0), loc(1, 1), () => true)).toBe(true);
  });
  it('casts recovery rays through blocked cells, retaining endpoints at missing cells', () => {
    const a = grid(0, 25), b = grid(1, 25); a.cells.fill(9); b.cells.fill(9);
    a.cells[10 * 25 + 12] = 1;
    const p = new HostagePathPlanner(maps(a, b));
    expect(p.recoveryRays(loc(12, 12))![0]).toMatchObject({ cell: loc(12, 10), distance: 2 });
    expect(p.recoveryRays(loc(12, 12))![2]).toMatchObject({ cell: loc(22, 12), distance: 10 });
    expect(p.recoveryRays(loc(12, 10))!.every(r => r.distance === 0 && r.cell.z === 10)).toBe(true);
    expect(p.recoveryRays(loc(3, 3))![0]).toMatchObject({ cell: loc(3, 0), distance: 3 });
    expect(p.recoveryRays(loc(3, 3, 1))![0]).toMatchObject({ cell: loc(3, 0, 1), distance: 10 });
    a.rows[2] = { x0: 0, x1: 0, first: 0 };
    expect(p.recoveryRays(loc(3, 3))![0]).toMatchObject({ cell: loc(3, 3), distance: 0 });
    expect(p.recoveryRays(loc(3, 2))![2]).toEqual({ cell: loc(3, 2), distance: 0, height: null });
    expect(p.recoveryRays(loc(3, 3, 9))).toBeNull();
  });
  it('uses original normalized diagonal action offsets when a travel line grazes a blocked cell', () => {
    const sub = grid(0, 9), p = new HostagePathPlanner(maps(sub));
    sub.cells[2 * 9 + 2] = 0x81;
    sub.markers.push({ loc: loc(2, 2), word: 8, flags: 7 }); // DOOR, offset NW
    sub.cells[4 * 9 + 1] = 9;
    // FUN_00519130 uses 0.7071067690849304 per diagonal axis. Using ±1 instead
    // moves the start far enough west that the 0.2-cell walk samples blocked (1,4).
    expect(p.canTravel(loc(2, 2), loc(1, 7))).toBe(true);
    sub.cells[4 * 9 + 2] = 9;
    expect(p.canTravel(loc(2, 2), loc(1, 7))).toBe(false);
  });
  it('reads the trail width as the first blocked square ring (including the original asymmetric perimeter)', () => {
    const sub = grid(), p = new HostagePathPlanner(maps(sub));
    expect(p.width(loc(3, 3))).toBe(4);
    sub.cells[2 * 7 + 2] = 9;
    expect(p.width(loc(3, 3))).toBe(1);
    expect(p.width(loc(3, 3), 8)).toBe(0);
    sub.cells.fill(1); sub.cells[4 * 7 + 4] = 9;
    expect(p.width(loc(3, 3))).toBe(4); // right-hand corners are not sampled by FUN_005396c0
  });
  it('routes around blocked bars through the doorway, leaves map cells immutable', () => {
    const sub = grid();
    for (let z = 0; z < 6; z++) sub.cells[z * 7 + 3] = 9;
    const before = sub.cells.slice();
    const p = new HostagePathPlanner(maps(sub));
    const path = p.plan(loc(1, 1), loc(5, 1));
    expect(path).not.toBeNull();
    expect(path!.points.some((c) => c.z === 6)).toBe(true);
    expect(path!.points[0]).toMatchObject(loc(1, 1));
    expect(path!.points.at(-1)).toMatchObject(loc(5, 1));
    expect(p.canTravel(loc(1, 1), loc(5, 1))).toBe(false);
    expect(sub.cells).toEqual(before);
    sub.cells[6 * 7 + 3] = 9;
    expect(p.plan(loc(1, 1), loc(5, 1))).toBeNull();
  });
  it('preserves EE round-toward-zero BASIC costs, including road transitions and uphill steep', () => {
    expect(basicStepCost(1, 1, false, false)).toBe(25);
    expect(basicStepCost(1, 1, true, false)).toBe(27);
    expect(basicStepCost(1, 6, true, false)).toBe(82);
    expect(basicStepCost(1, 13, true, false)).toBe(265);
    expect(basicStepCost(1, 11, false, true)).toBe(115);
    expect(basicStepCost(3, 1, false, false)).toBe(40);
    expect(basicStepCost(1, 3, true, false)).toBe(12);
  });
  it('marks persistent collision soil for the direction neighbor and contact, preserving rooms and authored cells', () => {
    const sub = grid(), ai = maps(sub), runtime = new HostageObstacles();
    const p = new HostagePathPlanner(ai, runtime), other = new HostagePathPlanner(ai);
    p.markObstacle(loc(3, 3), [1, 0], loc(1, 1));
    expect(p.plan(loc(3, 3), loc(4, 3))!.cost).toBe(265);
    expect(p.plan(loc(0, 1), loc(1, 1))!.cost).toBe(265);
    expect(other.plan(loc(3, 3), loc(4, 3))!.cost).toBe(25);
    expect(p.plan(loc(0, 1), loc(5, 1))!.points.length).toBeGreaterThan(2);
    expect(sub.cells.every(w => w === 0x80000001)).toBe(true);
    runtime.clear(); expect(p.plan(loc(3, 3), loc(4, 3))!.cost).toBe(25);
  });
  it('marks only the original eligible soils and ignores link cells without blocking the neighbor operation', () => {
    for (let soil = 0; soil < 32; soil++) {
      const sub = grid(), runtime = new HostageObstacles(), p = new HostagePathPlanner(maps(sub), runtime);
      sub.cells[1 * 7 + 1] = soil;
      sub.cells[3 * 7 + 3] = 257;
      p.markObstacle(loc(3, 3), [0, -1], loc(1, 1));
      expect(runtime.word(loc(1, 1), soil) & 31).toBe([1, 2, 4, 5, 12, 13].includes(soil) ? 13 : soil);
      expect(runtime.word(loc(3, 2), 1) & 31).toBe(13);
    }
    const sub = grid(), runtime = new HostageObstacles(), p = new HostagePathPlanner(maps(sub), runtime);
    sub.cells[1 * 7 + 1] = 257;
    p.markObstacle(loc(3, 3), [0, 0], loc(1, 1));
    expect(runtime.word(loc(1, 1), 257)).toBe(257);
    expect(runtime.word(loc(2, 3), 1) & 31).toBe(13); // zero-vector first-min tie chooses west
  });
  it('pushes proposed motion from blocked cardinal neighbors using the original five-unit AI correction', () => {
    const sub = grid(), p = new HostagePathPlanner(maps(sub));
    sub.cells[3 * 7 + 4] = 9;
    expect(p.correctMotion(loc(3, 3), [39, 7, 35])).toEqual([35, 7, 35]);
    sub.cells[4 * 7 + 3] = 0;
    const corner = p.correctMotion(loc(3, 3), [39, 7, 39]);
    expect(corner[0]).toBeCloseTo(39 - 5 / Math.sqrt(2));
    expect(corner[2]).toBeCloseTo(39 - 5 / Math.sqrt(2));
    expect(p.correctMotion(loc(3, 3), [35, 7, 35])).toEqual([35, 7, 35]);
    sub.cells[3 * 7 + 3] = sub.cells[3 * 7 + 3]! | 256;
    expect(p.correctMotion(loc(3, 3), [39, 7, 39])).toEqual([39, 7, 39]);
  });
  it('reports the first blocked correction cell in original quadrant order', () => {
    const sub = grid(), p = new HostagePathPlanner(maps(sub));
    sub.cells[3 * 7 + 4] = 9; sub.cells[4 * 7 + 3] = 9;
    expect(p.correctMotionWithContact(loc(3, 3), [39, 0, 39]).obstacle).toEqual(loc(4, 3));
    expect(p.correctMotionWithContact(loc(3, 3), [35, 0, 35]).obstacle).toBeNull();
  });
  it('locates stored blocked cells and uses the original layered-height selection', () => {
    const a = grid(), b = grid(1), p = new HostagePathPlanner(maps(a, b));
    a.cells.fill(9); b.min[1] = 20;
    expect(p.locate([15, 20, 15], 1)).toEqual(loc(1, 1));
    a.cells.fill(9 | (1 << 21));
    expect(p.locate([15, 20, 15])).toEqual(loc(1, 1, 1));
    a.cells.fill(1 | (1 << 21));
    expect(p.locate([15, 0.5, 15], 1)).toEqual(loc(1, 1));
    b.min[1] = 10;
    a.cells.fill(9 | (1 << 21));
    expect(p.locate([15, 0, 15])).toEqual(loc(1, 1));
    b.min[1] = 0; b.cells.fill(10);
    expect(p.locate([15, 5, 15])).toEqual(loc(1, 1));
  });
  it('distinguishes ordinary actor occupancy from registered dynamic footprints', () => {
    const sub = grid(), p = new HostagePathPlanner(maps(sub));
    const start = loc(1, 3), goal = loc(2, 3);
    expect(p.plan(start, goal, { occupied: () => true })!.cost).toBe(40);
    expect(p.plan(start, goal, { occupied: () => true, dynamicFootprint: () => true })!.cost).toBe(515);
    expect(p.plan(start, goal, { dynamicFootprint: () => true })!.cost).toBe(25);
    expect(p.canTravel(start, goal, { occupied: () => true, dynamicFootprint: () => true })).toBe(true);
  });
  it('reads per-room occupancy in searches and smoothing, not immutable link graph construction', () => {
    const sub = grid(), runtime = new HostageObstacles(), p = new HostagePathPlanner(maps(sub), runtime);
    runtime.moveActor(1, loc(2, 3));
    expect(p.plan(loc(1, 3), loc(2, 3))!.cost).toBe(40);
    expect(p.plan(loc(0, 3), loc(5, 3))!.points.length).toBeGreaterThan(2);
    runtime.removeActor(1);
    expect(p.plan(loc(1, 3), loc(2, 3))!.cost).toBe(25);
    runtime.setFootprint(2, { origin: loc(2, 3), width: 1, rows: [[0, 1]] });
    expect(p.plan(loc(1, 3), loc(2, 3))!.cost).toBe(515);
    expect(sub.cells.every(w => w === 0x80000001)).toBe(true);
  });
  it('follows links between submaps without teleporting or crossing absent links', () => {
    const a = grid(), b = grid(1);
    b.min = [60, 0, 0]; b.max = [130, 100, 70];
    const from = loc(6, 3), to = loc(0, 3, 1);
    a.links.push({ from, to, word: 8 }); b.links.push({ from: to, to: from, word: 8 });
    a.cells[27] = 0x101; b.cells[21] = 0x101;
    const p = new HostagePathPlanner(maps(a, b));
    const path = p.plan(loc(0, 3), loc(6, 3, 1))!;
    expect(path.points.filter((v) => v.link)).toEqual([
      { ...from, link: true, action: false, width: 0 }, { ...to, link: true, action: false, width: 0 },
    ]);
    expect(p.point(from)).toEqual(p.point(to));
    expect(new HostagePathPlanner(maps(grid(), grid(1))).plan(loc(0, 0), loc(6, 6, 1))).toBeNull();
  });
  it('honours one-way links toward the side with a traversable direction neighbour', () => {
    const a = grid(), b = grid(1), from = loc(6, 3), to = loc(0, 3, 1);
    a.links.push({ from, to, word: 2 }); b.links.push({ from: to, to: from, word: 6 });
    const p = new HostagePathPlanner(maps(a, b));
    expect(p.plan(loc(1, 3), loc(5, 3, 1))).not.toBeNull();
    expect(p.plan(loc(5, 3, 1), loc(1, 3))).toBeNull();
  });
  it('takes the newly discovered equal-cost graph node first, as the original link search does', () => {
    const a = grid(), b = grid(1);
    for (const z of [1, 5]) {
      const from = loc(6, z), to = loc(0, z, 1);
      a.links.push({ from, to, word: 8 }); b.links.push({ from: to, to: from, word: 8 });
    }
    const path = new HostagePathPlanner(maps(a, b)).plan(loc(0, 3), loc(6, 3, 1))!;
    expect(path.points.filter(v => v.link).map(v => v.z)).toEqual([5, 5]);
  });
  it('keeps climb/action gates while smoothing but travel permits occupied/collision cells', () => {
    const sub = grid(); sub.cells.fill(9);
    for (let x = 1; x < 6; x++) sub.cells[3 * 7 + x] = 1;
    sub.cells[3 * 7 + 3] = 6;
    const p = new HostagePathPlanner(maps(sub));
    expect(p.plan(loc(1, 3), loc(5, 3))!.points.length).toBeGreaterThan(2);
    sub.cells[3 * 7 + 3] = 0x21;
    expect(p.canTravel(loc(1, 3), loc(5, 3))).toBe(true);
    expect(p.plan(loc(1, 3), loc(5, 3))!.points.length).toBeGreaterThan(2);
    sub.cells[3 * 7 + 3] = 13;
    expect(p.canTravel(loc(1, 3), loc(5, 3))).toBe(true);
  });
  it('extends empty/single routes from the follower and patches an obstructed end through the leader corridor', () => {
    const sub = grid(), p = new HostagePathPlanner(maps(sub));
    expect(p.extend([], loc(1, 1), loc(5, 1))?.map(({x,z}) => [x,z])).toEqual([[5,1]]);
    expect(p.extend([loc(1, 1)], loc(1, 1), loc(5, 1))?.map(({x,z}) => [x,z])).toEqual([[5,1]]);
    sub.cells[1 * 7 + 3] = 9;
    const route = [loc(0, 1), loc(1, 1)];
    expect(p.extend(route, loc(0, 1), loc(5, 1))).toBeNull();
    const trail = [loc(5,1), loc(5,2), loc(3,2), loc(1,2), loc(1,1)].map((c) => ({...c,width:0}));
    const extended = p.extend(route, loc(0,1), loc(5,1), {trail, corridor: c => trail.some(t => t.x === c.x && t.z === c.z) });
    expect(extended?.at(-1)).toMatchObject(loc(5,1));
    expect(extended?.some(v => v.z === 2)).toBe(true);
  });
  it('respects window entry and exit direction without imposing a corner-cut rule', () => {
    const sub = grid(); sub.cells.fill(9);
    sub.cells[1 * 7 + 1] = 1; sub.cells[2 * 7 + 2] = 1;
    const p = new HostagePathPlanner(maps(sub));
    expect(p.plan(loc(1, 1), loc(2, 2))?.cost).toBe(27);
    sub.cells.fill(9);
    for (let x = 1; x < 6; x++) sub.cells[3 * 7 + x] = 1;
    sub.cells[3 * 7 + 3] = 0x81;
    sub.markers.push({ loc: loc(3, 3), word: (1 << 23) | 0 });
    expect(p.plan(loc(1, 3), loc(5, 3))).toBeNull();
    sub.markers[0]!.word = (1 << 23) | 2;
    expect(p.plan(loc(1, 3), loc(5, 3))).not.toBeNull();
  });
});

// HOSTAGE-PATH-SLICE (issue #308; research 333 §4): the room's planner queue, sliced a game frame at a time.
describe('the planner queue served head first, one slice a frame (FUN_00510570 / FUN_00510ff0)', () => {
  /** Slices until the ticket is answered; returns each slice's expansions. */
  function drain(p: HostagePathPlanner, t: HostagePathTicket, limit = 100000): number[] {
    const spent: number[] = [];
    while (t.state === 'pending' && spent.length < limit) spent.push(p.slice());
    return spent;
  }
  function walled(): AiSubMap {
    const sub = grid(0, 40);
    for (let z = 0; z < 38; z++) sub.cells[z * 40 + 20] = 9;
    return sub;
  }
  it('spends at most the frame budget a slice and answers with the points and cost plan() gives', () => {
    const sub = walled(), from = loc(1, 20), to = loc(38, 20);
    const sliced = new HostagePathPlanner(maps(sub), undefined, 10);
    const t = sliced.request([from, to])!;
    expect(t.state).toBe('pending');
    const spent = drain(sliced, t);
    expect(t.state).toBe('done');
    expect(spent.length).toBeGreaterThan(1);
    expect(Math.max(...spent)).toBeLessThanOrEqual(10);
    expect(sliced.lastSliceExpansions).toBe(spent.at(-1));
    expect(t.path).toEqual(new HostagePathPlanner(maps(sub)).plan(from, to));
  });
  it('serves the head request alone until it is answered, then the next in request order, in the same frame', () => {
    const sub = walled(), p = new HostagePathPlanner(maps(sub), undefined, 7);
    const first = p.request([loc(1, 20), loc(38, 20)])!, second = p.request([loc(1, 2), loc(5, 2)])!;
    let frames = 0;
    // Round-robin would answer the short second request first; the original's queue never does.
    while (first.state === 'pending') { expect(second.state).toBe('pending'); p.slice(); frames++; }
    while (second.state === 'pending') { p.slice(); frames++; }
    expect([first.state, second.state]).toEqual(['done', 'done']);
    const solo = (a: ReturnType<typeof loc>, b: ReturnType<typeof loc>) => {
      const q = new HostagePathPlanner(maps(sub), undefined, 7);
      return drain(q, q.request([a, b])!).length;
    };
    expect(frames).toBeLessThanOrEqual(solo(loc(1, 20), loc(38, 20)) + solo(loc(1, 2), loc(5, 2)));
  });
  it('a cancelled request leaves the queue and the next one is served', () => {
    const sub = walled(), p = new HostagePathPlanner(maps(sub), undefined, 7);
    const first = p.request([loc(1, 20), loc(38, 20)])!, second = p.request([loc(1, 2), loc(5, 2)])!;
    p.slice(); first.cancel();
    expect(first.state).toBe('cancelled');
    drain(p, second);
    expect(second.state).toBe('done');
    expect(first.path).toBeNull();
  });
  it('fails a leg still searching at its 200th slice, and restarts the count with each leg', () => {
    const sub = grid(0, 40);
    const slicesFor = (stops: ReturnType<typeof loc>[]) => {
      const p = new HostagePathPlanner(maps(sub), undefined, 1), t = p.request(stops)!;
      return { n: drain(p, t, 1000).length, state: t.state };
    };
    const long = slicesFor([loc(0, 0), loc(39, 39)]);
    expect(long).toEqual({ n: HOSTAGE_PATH_SLICE_READING.slices, state: 'failed' });
    let leg: { x: number; n: number } | null = null;
    for (let x = 1; x < 39 && !leg; x++) {
      const one = slicesFor([loc(0, 20), loc(x, 20)]);
      if (one.state === 'done' && one.n > 100 && one.n < 170) leg = { x, n: one.n };
    }
    expect(leg).not.toBeNull();
    const twice = slicesFor([loc(0, 20), loc(leg!.x, 20), loc(0, 20)]);
    expect(twice.state).toBe('done');
    expect(twice.n).toBeGreaterThan(HOSTAGE_PATH_SLICE_READING.slices);
  });
  it('builds the link graph with the planner, not inside a request', () => {
    const a = grid(), b = grid(1);
    b.min = [60, 0, 0]; b.max = [130, 100, 70];
    const from = loc(6, 3), to = loc(0, 3, 1);
    a.links.push({ from, to, word: 8 }); b.links.push({ from: to, to: from, word: 8 });
    const build = vi.spyOn(HostagePathPlanner.prototype as unknown as { buildGraph: () => unknown }, 'buildGraph');
    try {
      const p = new HostagePathPlanner(maps(a, b), undefined, HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER.expansions);
      expect(build).toHaveBeenCalledTimes(1);
      const t = p.request([loc(0, 3), loc(6, 3, 1)])!;
      drain(p, t);
      expect(t.state).toBe('done');
      expect(build).toHaveBeenCalledTimes(1);
    } finally { build.mockRestore(); }
  });
  it('refuses at registration an untraversable endpoint; a planner without a budget answers at once', () => {
    const sub = walled(), p = new HostagePathPlanner(maps(sub));
    expect(p.request([loc(1, 20), loc(20, 5)])).toBeNull();
    const t = p.request([loc(1, 20), loc(38, 20)])!;
    expect(t.state).toBe('done');
    expect(t.path).toEqual(p.plan(loc(1, 20), loc(38, 20)));
  });
});

for (const name of ['MP6', 'MP10', 'MP11', 'MP71']) {
  const data = fixture(`RUN/${name}.ZDB`);
  describe.skipIf(!data)(`${name} disc-backed hostage routing`, () => {
    it('routes every escortee start to an extraction zone through the shared planner', () => {
      const ai = aiMapsFromZdb(data!);
      const zar = Zar.parse(zdbMember(data!, parseZdb(data!), 'READERM.ZAR'));
      const entry = zar.root.children.find((e) => e.name.toLowerCase() === 'vehicles.rdr')!;
      const starts = placeEscortees(parseEscortees(parseRdr(zar.data(entry))), ai);
      const zones = zonesOfKind(ai, 1);
      expect(starts.length).toBeGreaterThan(0); expect(zones.length).toBeGreaterThan(0);
      const planner = new HostagePathPlanner(ai);
      for (const start of starts) {
        const paths = zones.map(({ zone }) => planner.plan(start.loc, { map: zone.corner.map,
          x: zone.corner.x + (zone.width >> 1), z: zone.corner.z + (zone.height >> 1) }));
        expect(paths.some(Boolean), start.name).toBe(true);
        if (name === 'MP6') {
          const route = paths[0]!;
          expect(route.cost).toBe([3794, 3823, 3744][starts.indexOf(start)]);
          if (starts.indexOf(start) === 0) expect(route.points.map((p) => [p.x, p.z])).toEqual([
            [104,5],[104,6],[104,9],[103,10],[96,8],[92,4],[91,4],[89,6],[89,19],[90,20],[90,29],
            [91,30],[97,30],[98,31],[98,32],[98,33],[95,36],[75,37],[69,44],[69,45],[58,56],[49,56],
            [40,67],[40,68],[23,82],[17,82],[12,83],[10,83],
          ]);
        }
      }
    });
    it('the room\'s sliced requests give plan()\'s routes, within the read\'s slices (HOSTAGE-PATH-SLICE, unchanged)', () => {
      const ai = aiMapsFromZdb(data!);
      const zar = Zar.parse(zdbMember(data!, parseZdb(data!), 'READERM.ZAR'));
      const entry = zar.root.children.find((e) => e.name.toLowerCase() === 'vehicles.rdr')!;
      const starts = placeEscortees(parseEscortees(parseRdr(zar.data(entry))), ai);
      const immediate = new HostagePathPlanner(ai), sliced = new HostagePathPlanner(ai, undefined, HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER.expansions);
      for (const start of starts) for (const { zone } of zonesOfKind(ai, 1)) {
        const goal = { map: zone.corner.map, x: zone.corner.x + (zone.width >> 1), z: zone.corner.z + (zone.height >> 1) };
        const t = sliced.request([start.loc, goal]);
        const want = immediate.plan(start.loc, goal);
        if (!t) { expect(want).toBeNull(); continue; }
        let frames = 0;
        while (t.state === 'pending') { expect(sliced.slice()).toBeLessThanOrEqual(HOSTAGE_PATH_SLICE_BUDGET_PLACEHOLDER.expansions); frames++; }
        expect(frames).toBeLessThanOrEqual(HOSTAGE_PATH_SLICE_READING.slices * 4);
        expect(t.state === 'done' ? t.path : null).toEqual(want);
      }
    });
  });
}
