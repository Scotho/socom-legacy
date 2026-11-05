import { describe, expect, it, vi } from 'vitest';
import type { DoorSpec } from '../../viewer/src/doors';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, type SimMap } from '../../viewer/src/sim';
import { WalkingNavigation, prepareBotNavigation, validateBotNavigation, type Point } from '../src/bots/navigation';
import { CombatPositions } from '../src/bots/positions';

/**
 * SEGMENT-BODY (research 217 s2.9): a hull face is hit only from in front of its own normal (research 281 s4.3), so a
 * solid wall is two faces back to back, as a hull's closed solid is; one quad is a wall from one side only. `back` is the
 * quad's reverse winding.
 */
const back = (p: Float32Array): Float32Array => Float32Array.from([p[9]!, p[10]!, p[11]!, p[6]!, p[7]!, p[8]!, p[3]!, p[4]!, p[5]!, p[0]!, p[1]!, p[2]!]);

function arena(wall = false): SimMap {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-190, 0, -190, 190, 0, -190, 190, 0, 190, -190, 0, 190]) };
  const polys = [floor];
  if (wall) {
    const face = Float32Array.from([0, 0, -200, 0, 50, -200, 0, 50, 200, 0, 0, 200]);
    polys.push({ ...floor, path: 'wall', ditype: 2, points: face }, { ...floor, path: 'wall', ditype: 2, points: back(face) });
  }
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1 }));
  const ground = packGround(params, polys, owners);
  return { stem: 'MP99', name: 'BOT NAV TEST', ground, grid: groundGrid(ground), slots: [], respawns: [], spawns: null, notes: [] };
}

describe('prepared authored bot walking routes on the existing human mover', () => {
  it('does no graph synthesis in a live controller and still allows short collision-checked local movement', () => {
    const map = arena(), nav = new WalkingNavigation(map);
    expect(nav.nodes).toHaveLength(0);
    expect(nav.route([-30, 0, 0], [30, 0, 0])).toEqual([[30, 0, 0]]);
    expect(nav.offset([180, 0, 0], 1, 0, 40)).toBeNull();
  });

  it('prepares outside the tick, preserves disconnected components and never routes across a solid wall', () => {
    const map = arena(true), prepared = prepareBotNavigation(map);
    expect(prepared.nodes.length).toBeGreaterThan(0);
    const nav = new WalkingNavigation(map, prepared);
    expect(nav.route([-90, 0, 0], [-90, 0, 90]).length).toBeGreaterThan(0);
    expect(nav.route([-90, 0, 0], [90, 0, 0])).toEqual([]);
    expect(nav.canWalk([-10, 0, 0], [10, 0, 0])).toBe(false);
  });

  it('rejects a mismatched map, non-finite points, dangling edges and duplicate node indices before use', () => {
    const map = arena(), data = { version: 2, map: 'MP99', nodes: [{ at: [0, 0, 0], edges: [] }] };
    expect(validateBotNavigation(map, data)).not.toBeNull();
    expect(validateBotNavigation(map, { ...data, map: 'MP2' })).toBeNull();
    expect(validateBotNavigation(map, { ...data, nodes: [{ at: [NaN, 0, 0], edges: [] }] })).toBeNull();
    expect(validateBotNavigation(map, { ...data, nodes: [{ at: [0, 0, 0], edges: [1] }] })).toBeNull();
    expect(validateBotNavigation(map, { ...data, nodes: [...data.nodes, ...data.nodes] })).toBeNull();
  });
});


it('refreshes closed-door graph partitions after the native leaf moves, without permitting a closed wall crossing', () => {
  const map = arena(true), prepared = prepareBotNavigation(map);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  map.doors = [{ index: 0, node: 'wall', path: 'wall', valve: 'door', range: 30, elevation: -1,
    local: identity, parent: identity, owners: [1], programs: [],
    sweep: { minX: -10, maxX: 10, minZ: -200, maxZ: 200 } } satisfies DoorSpec];
  map.doors[0]!.owners = [1, 2];                                 // SEGMENT-BODY: the leaf's two faces
  const nav = new WalkingNavigation(map, prepared);
  expect(nav.route([-90, 0, 0], [90, 0, 0])).toEqual([]);
  // Synthetic analogue of DoorSet's in-place hull mutation: move the closed leaf above the actors.
  for (let k = 13; k < map.ground.points.length; k += 3) map.ground.points[k]! += 100;
  nav.doorsChanged();
  expect(nav.route([-90, 0, 0], [90, 0, 0]).length).toBeGreaterThan(0);
  for (let k = 13; k < map.ground.points.length; k += 3) map.ground.points[k]! -= 100;
  nav.doorsChanged();
  expect(nav.route([-90, 0, 0], [90, 0, 0])).toEqual([]);
});

it('LATER 535: the scratch probe keeps no wall contacts across walk tests -- a long game never grows it', () => {
  // The FF lobby's bots-only match died at V8's 512 MB heap cap after 20-85 min (LATER 535): `clearBody` glides the one
  // probe walker the controller keeps for the whole game, and its wall contacts were never emptied between tests.
  const map = arena(true), nav = new WalkingNavigation(map);
  const probe = (nav as unknown as { probe: { wallHits(): readonly unknown[] } }).probe;
  expect(nav.canWalk([-10, 0, 0], [10, 0, 0])).toBe(false);
  const one = probe.wallHits().length;                         // one walk test's own contacts
  expect(one).toBeGreaterThan(0);
  for (let i = 1; i < 2000; i++) expect(nav.canWalk([-10, 0, 0], [10, 0, 0])).toBe(false);
  expect(probe.wallHits().length).toBe(one);                   // after 2000 tests, still only the last one's
});

it('BOP-S: a door change keeps the different-component shortcut -- an unreachable goal is refused without an A* walk', () => {
  // `doorsChanged` used to wipe every node's component label and nothing set it again, so after the first door toggle
  // each unreachable goal ran the whole A* (up to 6,000 expansions). A door far from the solid wall cannot join the two
  // halves; the refusal must stay as cheap after the toggle as before it, and every answer must stay the same.
  const map = arena(true), prepared = prepareBotNavigation(map);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  map.doors = [{ index: 0, node: 'wall', path: 'wall', valve: 'door', range: 30, elevation: -1,
    local: identity, parent: identity, owners: [1], programs: [],
    sweep: { minX: -150, maxX: -130, minZ: -150, maxZ: -130 } } satisfies DoorSpec];
  const nav = new WalkingNavigation(map, prepared), fresh = new WalkingNavigation(map, prepared);
  const expansions = vi.spyOn(nav as unknown as { neighbours(id: number): number[] }, 'neighbours');
  const pairs: [Point, Point][] = [[[-90, 0, 0], [90, 0, 0]], [[-150, 0, -150], [-90, 0, 120]], [[90, 0, -170], [150, 0, 160]],
    [[-170, 0, 170], [170, 0, -170]]];
  expect(nav.route([-90, 0, 0], [90, 0, 0])).toEqual([]);
  expect(expansions).not.toHaveBeenCalled();                   // the prepared labels refuse it at once
  nav.doorsChanged();
  expect(nav.route([-90, 0, 0], [90, 0, 0])).toEqual([]);
  expect(expansions.mock.calls.length).toBe(0);               // RED before the fix: the whole left half expanded
  for (const [a, b] of pairs) expect(nav.route(a, b)).toEqual(fresh.route(a, b));
});

it('BOP-S review: a door across a gap in the wall -- shut it refuses the far side, open it routes there, through toggles', () => {
  // The door-safe labels join every pair a door's edge test could ever accept. A narrowing of `linkable` that dropped a
  // real door edge would have the labels refuse the open door's route with no search at all: this test fails then.
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const quad = (path: string, ditype: number, p: number[]): WorldPoly => ({ modelName: 'worldmodel', path, region: 0, ditype,
    material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(p) });
  const polys = [quad('floor', 3, [-190, 0, -190, 190, 0, -190, 190, 0, 190, -190, 0, 190]),
    quad('wall', 2, [0, 0, -200, 0, 50, -200, 0, 50, -30, 0, 0, -30]),
    quad('wall', 2, [0, 0, 30, 0, 50, 30, 0, 50, 200, 0, 0, 200]),
    quad('leaf', 2, [0, 0, -30, 0, 50, -30, 0, 50, 30, 0, 0, 30])];
  // SEGMENT-BODY: each wall and the leaf two faces back to back (`back`), the backs after, so the leaf's front keeps its
  // points (37-47) and its back is the seventh polygon's (73-83).
  for (const i of [1, 2, 3]) polys.push({ ...polys[i]!, points: back(polys[i]!.points) });
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1 }));
  const ground = packGround(params, polys, owners);
  const map: SimMap = { stem: 'MP99', name: 'BOT NAV TEST', ground, grid: groundGrid(ground), slots: [], respawns: [], spawns: null, notes: [] };
  const prepared = prepareBotNavigation(map);                  // prepared with the leaf shut
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  map.doors = [{ index: 0, node: 'leaf', path: 'leaf', valve: 'door', range: 30, elevation: -1,
    local: identity, parent: identity, owners: [3, 6], programs: [],
    sweep: { minX: -10, maxX: 10, minZ: -30, maxZ: 30 } } satisfies DoorSpec];
  const nav = new WalkingNavigation(map, prepared);
  const expansions = vi.spyOn(nav as unknown as { neighbours(id: number): number[] }, 'neighbours');
  const leaf = (dy: number): void => { for (const at of [37, 73]) for (let k = at; k < at + 11; k += 3) map.ground.points[k]! += dy; };
  const from: Point = [-90, 0, 120], to: Point = [90, 0, -120];
  expect(nav.route(from, to)).toEqual([]);
  expect(expansions).not.toHaveBeenCalled();                   // shut, before any toggle: the prepared labels refuse it
  for (let round = 0; round < 2; round++) {
    leaf(100); nav.doorsChanged();                             // open: the far side is reachable and routed
    const open = nav.route(from, to);
    expect(open.length).toBeGreaterThan(0);
    expect(open.at(-1)).toEqual(to);
    expect(open.some((p) => Math.abs(p[0]) < 10 && Math.abs(p[2]) < 30)).toBe(true);   // through the gap
    leaf(-100); nav.doorsChanged();                            // shut again: refused, and never through the leaf
    expansions.mockClear();
    expect(nav.route(from, to)).toEqual([]);
    // After a toggle the labels hold in every door state, so they must join the halves across this door: the refusal
    // is the search's own, not the labels'. (Labels that split here would refuse the open door too.)
    expect(expansions.mock.calls.length).toBeGreaterThan(0);
  }
});

it('BOP-S S1: a search attaches its origin once, and an attachment (found or failed) is remembered until a door moves', () => {
  // CombatPositions.search tries up to six candidates; each route used to re-attach the same origin (Benny's
  // attribution, PR #569: the same answer every time). The attachment is now remembered by its exact coordinates,
  // a failure too, and forgotten when a door changes the hull.
  const map = arena(true), prepared = prepareBotNavigation(map), nav = new WalkingNavigation(map, prepared);
  const fresh = new WalkingNavigation(map, prepared);
  // The walk test is counted in its resumable form: since the attach bypass `nearestSteps` runs `canWalkSteps`.
  const from: Point = [-150, 0, 3], contact: Point = [150, 0, 0], walks = vi.spyOn(nav, 'canWalkSteps');
  const fromWalks = (): number => walks.mock.calls.filter(([a]) => a[0] === from[0] && a[1] === from[1] && a[2] === from[2]).length;
  expect(new CombatPositions(nav).search(from, contact, [])).toEqual(new CombatPositions(fresh).search(from, contact, []));
  expect(fromWalks()).toBe(1);                                 // RED before: one attachment per attempt (6)
  const outside: Point = [195, 0, 195];                        // off the floor: no node attaches
  expect(nav.nearest(outside)).toBeNull();
  const failed = walks.mock.calls.length;
  expect(nav.nearest(outside)).toBeNull();
  expect(walks.mock.calls.length).toBe(failed);                // the failure is remembered too
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  map.doors = [{ index: 0, node: 'wall', path: 'wall', valve: 'door', range: 30, elevation: -1,
    local: identity, parent: identity, owners: [1], programs: [], sweep: { minX: -150, maxX: -130, minZ: -150, maxZ: -130 } } satisfies DoorSpec];
  nav.doorsChanged();
  const before = fromWalks();
  expect(nav.nearest(from)).toBe(fresh.nearest(from));
  expect(fromWalks()).toBe(before + 1);                        // a door change forgets every attachment
});

it('BOP-S review F1: a hull change that is not a door (the world\'s revision: a barrier, a gate\'s owner) gets a fresh answer', () => {
  // worldState bumps `grid.revision` whenever it flips an owner's active bit (C4 access barriers, the round reset); the
  // attachment answers must not outlive that. Here the wall is raised out of reach and the revision bumped, as the
  // world does: the same point must be looked up again, and answer as a fresh navigation does.
  const map = arena(true), prepared = prepareBotNavigation(map), nav = new WalkingNavigation(map, prepared);
  const at: Point = [-2, 0, 0], walks = vi.spyOn(nav, 'canWalkSteps');
  nav.nearest(at);
  const cached = walks.mock.calls.length;
  nav.nearest(at);
  expect(walks.mock.calls.length).toBe(cached);               // unchanged hull: the remembered answer
  for (let k = 13; k < map.ground.points.length; k += 3) map.ground.points[k]! += 100;
  map.grid.revision++;
  const answer = nav.nearest(at);
  expect(walks.mock.calls.length).toBeGreaterThan(cached);    // RED before the fold: the stale answer, no walk test
  expect(answer).toBe(new WalkingNavigation(map, prepared).nearest(at));
});

it('BOP-S batch 8 (F2): an attachment lookup paused across a cache clear stores nothing stale', () => {
  // 04's review F2 on #572: a paused `nearestSteps` that finishes after a hull move (`hullMoving` cleared the cache)
  // stored the answer it computed on the old hull, and the next lookup of that point reused it. Each clear now starts a
  // new generation; a lookup that began in an older one returns its answer and stores nothing.
  const map = arena(true), prepared = prepareBotNavigation(map), nav = new WalkingNavigation(map, prepared);
  const at: Point = [-2, 0, 0];
  const steps = nav.nearestSteps(at);
  expect(steps.next().done, 'the lookup pauses at its first walk test').toBe(false);
  nav.hullMoving();                                            // the hull moves while it is paused
  let r = steps.next();
  while (!r.done) r = steps.next();
  const answer = r.value;
  expect(answer).toBe(new WalkingNavigation(map, prepared).nearest(at));   // the paused lookup still answers
  const attached = (nav as unknown as { attached: Map<string, number | null> }).attached;
  expect(attached.has(`${at[0]},${at[1]},${at[2]}`), 'no answer from before the clear is stored').toBe(false);   // RED: stored
});
