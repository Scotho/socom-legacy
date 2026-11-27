import { describe, expect, it } from 'vitest';
import { buildGrid, type AiLoc, type AiMaps, type AiSubMap, type Grid, type WorldPoly } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { simClipsFromBytes, simMapFromBytes, type SimClips } from '../../viewer/src/simMap';
import { Walker } from '../../viewer/src/mover';
import { FollowTrail, HostageFollow, type FollowLeader } from '../src/hostageFollow';
import { HostagePathPlanner } from '../src/hostagePath';
import { HostageObstacles } from '../src/hostageObstacles';
import type { HostageActor } from '../src/hostageActors';
import { sampleFixtureLeader } from './helpers/hostageLeaderSample';

/*
 * LATER 933 (HOSTAGE-LANDING-PIN) -- NOW THE GUARD (2026-11-19). Written as a RED alone in draft PR #798 (agent/xs-933-red,
 * by Scotho; carried in unchanged below this note bar the two case comments marked 2026-11-19). It turned green with the
 * 434 gate (83eb5f1ea0: the follower's AI-map correction runs only with the controller's +0x171 bit 7 set, as
 * `FUN_005483d0` D:L413920-413922; research 434): on agent/next both cases pass, and with `match/src/hostageFollow.ts` alone
 * set back to 83eb5f1ea0^ both fail again (held on #0 (218,71) 138 ticks, never on tophost; the synthetic seam 142 ticks;
 * dev-disc / unit runs, 2026-11-19). The standing account below was the right lead. A third case, added 2026-11-19, holds
 * the original's own hold: a STANDING leader upstairs keeps the follower on the flight (research 404 s31, run B).
 *
 * The note as written for the PR (2026-11-12):
 *
 * THE MECHANISM IS NOT ESTABLISHED: a first reading (research 404 s13) was corrected by a trace of the original (build
 * r0004, n = 1); no change is proposed yet. This file therefore asserts no mechanism, only the observable behaviour.
 *
 * THE REFERENCE, MEASURED ON THE ORIGINAL (2026-11-12, the rig's scenario C repeated with snapshots, r0004): the gate
 * opens at 8 cells of the leader's trail, then straight up and across about 1.5 s behind a walking leader, no stop
 * (measured, n = 1). The earlier run's 14 s lag and wander is one run's odd case (its trail was not empty at the order
 * and capped at 75 before the follower ran), recorded and not the reference. In the same scenario under node our port
 * pins on the landing (a node run, not the original): that hold is the departure this test asserts against. A FIX IS
 * SCORED AGAINST THE REFERENCE: crosses, no stop on the flight or the landing, about a second and a half behind, and
 * does not leave walkable cells. WHY is not established here: the correction is the standing lead (research 404, its
 * standing account and s32.7, s33), no stronger.
 *
 * What it asserts is what LATER 933 records: on Fish Hook (MP71) a hostage following a leader up the east stair is, in
 * our port (the owner's own game, replay 537448d10119d441, v0.4.19), "held on the top landing while the leader stays on
 * the upper floor", at (2139-2144.6, 220.8, 661.8); the row asks how "the original keeps a body out of that state" and
 * for "a dev-disc RED ... followers located on tophost within a bounded time" (socomlegacy/docs/LATER.md, row 933). So: the
 * follower does not stay held at the top of that flight of stairs; it is located on tophost (#1) within the run and is
 * there at its end. The port's follower is instead held on #0 (218,71) at about (2139.6-2144.6, 220.8, 661.8) -- the
 * row's coordinates -- so this file is red on the port as it stands (the measured values are in the comments below).
 *
 * Test adaptations (not game behaviour), each taken from `hostageTraversal.test.ts` (the dev-disc traversal test):
 * the leader is a scripted real `Walker` steered in XZ at 45 u/s through a list of cell centres, sampled into the trail by
 * `sampleFixtureLeader`, waiting while more than MAX_LEAD = 100 world units ahead of the follower; a waypoint counts as
 * reached within 5 units; both bodies are bound to occupancy as that test binds them; the real `HostageFollow` steps at
 * 30 Hz. The follower's start is one cell behind the leader's first cell: FOLLOW starts only once the trail is 8 cells
 * long (`FOLLOW_RULES_READING.trailStart`, cell 10 u, so 80 u of leader travel), and with MAX_LEAD 100 the leader stops
 * for good before that if the follower starts more than 20 u behind (a start three cells behind, (218,85), never starts;
 * the scratch harness's work-round was a 150-unit wait, not used here).
 */

const DT = 1 / 30, LEADER_SPEED = 45, MAX_LEAD = 100, RUN_TICKS = 30 * 20;
/** A short bound on consecutive ticks located on the landing cell: walking through a 10-unit cell takes well under 1 s. */
const HELD_BOUND_TICKS = 30;
type V3 = [number, number, number];
const gap = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
const same = (a: AiLoc | null, b: AiLoc) => !!a && a.map === b.map && a.x === b.x && a.z === b.z;

interface ClimbCase {
  planner: HostagePathPlanner; obstacles: HostageObstacles; grid: Grid; material: string | undefined; clips: SimClips | null;
  /** The leader's waypoints, start first (cell centres at the cells' stored heights). */
  leaderCells: readonly AiLoc[];
  followerCell: AiLoc;
  /** The landing cell the port holds the follower on, and the upper sub-map past the seam. */
  landing: AiLoc; upper: number;
}
interface ClimbResult {
  /** First tick the follower is located on the upper sub-map, -1 if never. */
  firstUpper: number;
  /** The longest run of consecutive ticks the follower is located on the landing cell. */
  heldTicks: number;
  final: AiLoc | null; finalFeet: V3; finalSub: number; leaderFinal: AiLoc | null; gap: number;
}

function climb(c: ClimbCase): ClimbResult {
  const { planner, obstacles } = c;
  const points = c.leaderCells.map(p => planner.point(p));
  const leaderWalker = new Walker(c.grid);
  expect(leaderWalker.place(points[0]![0], points[0]![1] + 1, points[0]![2]), 'leader placed on the floor').toBe(true);
  const leader: FollowLeader = { id: 1, feet: [...points[0]!], yaw: 0, velocity: [0, 0, 0], topSpeed: 65, stance: 0 };
  const start = planner.point(c.followerCell);
  const actorViews = (): HostageActor[] => [
    { id: leader.id, alive: true, cell: obstacles.actorCell(leader.id), velocity: [leaderWalker.state.vx, leaderWalker.state.vy, leaderWalker.state.vz],
      position: leader.feet, rawCell: planner.locate(leader.feet), ai: false, stance: leader.stance, excluded: false, yieldTo: null, probeRefused: false },
    { id: 240, alive: true, cell: obstacles.actorCell(240), velocity: follower.bodyVelocity, position: follower.feet, rawCell: planner.locate(follower.feet),
      ai: true, stance: follower.stance, excluded: false, yieldTo: follower.yieldTo, probeRefused: false },
  ];
  const follower: HostageFollow = new HostageFollow(planner, c.grid, [start[0], start[1] + 1, start[2]], 0, c.material, c.clips,
    { id: 240, actors: actorViews });
  const trail = new FollowTrail();
  let segment = 1, firstUpper = -1, held = 0, heldTicks = 0;
  for (let tick = 0; tick < RUN_TICKS; tick++) {
    const moving = segment < points.length && gap(leader.feet, follower.feet) < MAX_LEAD;
    const body = leaderWalker.state;
    if (moving) {
      const next = points[segment]!, dx = next[0] - body.x, dz = next[2] - body.z;
      if (dx || dz) leader.yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
      body.yaw = leader.yaw;
    }
    leaderWalker.tick({ forward: moving ? LEADER_SPEED / 65 : 0, right: 0, boost: false }, DT);
    if (segment < points.length && gap([body.x, body.y, body.z], points[segment]!) < 5) segment++;
    const cell = sampleFixtureLeader(body, leader, planner, trail, DT);
    if (cell && planner.traversable(cell)) obstacles.moveActor(leader.id, cell);
    const before = planner.locate(follower.feet);
    if (before && planner.traversable(before)) obstacles.moveActor(240, before);
    follower.step(DT, leader, trail, 0);
    const at = planner.locate(follower.feet);
    if (at && planner.traversable(at)) obstacles.moveActor(240, at);
    expect([...follower.feet, ...follower.velocity].every(Number.isFinite)).toBe(true);
    if (firstUpper < 0 && at?.map === c.upper) firstUpper = tick;
    held = same(at, c.landing) ? held + 1 : 0;
    heldTicks = Math.max(heldTicks, held);
  }
  return { firstUpper, heldTicks, final: planner.locate(follower.feet), finalFeet: follower.feet, finalSub: follower.sub,
    leaderFinal: planner.locate(leader.feet), gap: gap(leader.feet, follower.feet) };
}

const mp71 = fixture('RUN/MP71.ZDB'), motion = fixture('RUN/MOTION_P.ZAR'), reader = fixture('RUN/READERC.ZAR');
describe.skipIf(!mp71 || !motion || !reader)('LATER 933 Fish Hook (MP71) landing: a following hostage is not held at the top of the stair (dev-disc fixture; SKIPPED without test-fixtures RUN/MP71.ZDB, MOTION_P.ZAR, READERC.ZAR)', () => {
  // 2026-11-19: green since the 434 gate (83eb5f1ea0); red with hostageFollow.ts before it (the A/B in the header).
  it('climbs the east column and is not held on the landing #0 (218,71): it is on tophost within the run and at its end', () => {
    const map = simMapFromBytes(mp71!, 'RUN/MP71.ZDB'), clips = simClipsFromBytes(motion!, reader!);
    const obstacles = new HostageObstacles(), planner = new HostagePathPlanner(map.ai!, obstacles);
    const L = (m: number, x: number, z: number): AiLoc => ({ map: m, x, z });
    // The leader climbs MP71's east column from the ground floor #0 (218,82) up the stair to the landing #0 (218,71),
    // crosses onto sub-map #1 `tophost` (13,7), (13,6) and walks west to (8,6), where it stands. The cells are the disc's
    // (research 404 s2 lists their words -- data, not the withdrawn mechanism: the soil-0 #0 (218,70) north of the
    // landing, no tophost (13,8) above it, the one link #0 (217,71) <-> #1 (12,8)).
    const result = climb({ planner, obstacles, grid: map.grid, material: map.defaultMaterial, clips,
      leaderCells: [L(0, 218, 82), L(0, 218, 78), L(0, 218, 76), L(0, 218, 74), L(0, 218, 72), L(0, 218, 71),
        L(1, 13, 7), L(1, 13, 6), L(1, 11, 6), L(1, 8, 6)],
      followerCell: L(0, 218, 83), landing: L(0, 218, 71), upper: 1 });
    const said = JSON.stringify(result);
    // Measured on the port as it stands (agent/v0420 f2d9c9c87, under node, 2026-11-12): the follower never reaches
    // tophost (firstUpper -1); it is held on #0 (218,71) at z 661.81 for 141 consecutive ticks (4.7 s) and again until
    // the run ends; final (2139.56, 220.76, 661.81) (the link cell's edge, #0 (217,71)), ~46 u from the leader on
    // tophost (8,6) -- the row's (2139-2144.6, 220.8, 661.8). The bounded time is the run's 20 s (LATER 933: "located on
    // tophost within a bounded time"); the held bound is a test bound, not a game value.
    expect.soft(result.heldTicks, `held on the landing #0 (218,71) beyond a short bound: ${said}`).toBeLessThanOrEqual(HELD_BOUND_TICKS);
    expect.soft(result.firstUpper, `never located on tophost within the run: ${said}`).toBeGreaterThanOrEqual(0);
    expect.soft(result.final?.map, `not on tophost at the end: ${said}`).toBe(1);
  }, 60000);

  /**
   * The original's own hold, which a change to the follower must keep (LATER 933's row: "that hold is the original's own
   * and STAYS"): research 404 s31, run B, measured on the original (r0004, the Shadow PC's rig, 2026-11-12, n = 1). The
   * leader climbed mid-column 218 and STOOD on tophost (1,13,6) at about (2144.3-2145.4, 222, 641.4-642.4); the follower
   * climbed to (2145.0, 210.9, 676.2), #0 (218,72), ON THE FLIGHT below the landing, and stood about 39 s with bit 7 clear,
   * never crossing the seam. Here the leader takes the guard's route and stands on (1,13,6): the follower must never reach
   * tophost and stop within STOP_TOLERANCE of the original's stop; it also stands in the port's own follow state 7, which
   * is the port's, not measured on the original (research 404 s31.5 records the original's state as not measured). The
   * port on agent/next 87f4a984dc stops at (2144.58, 210.49, 676.85), #0 (218,73): 0.87 units off by the 3-D distance
   * asserted (0.77 flat). STOP_TOLERANCE is a test bound on one measurement, not a
   * game value; the follower's start is the guard's (the original's walked in from (2130.2, 179, 808.2)).
   */
  it('the original’s hold: a leader standing on tophost (1,13,6) holds the follower on the flight at the original’s stop', () => {
    const STOP: V3 = [2145.0, 210.9, 676.2], STOP_TOLERANCE = 1.5;
    const map = simMapFromBytes(mp71!, 'RUN/MP71.ZDB'), clips = simClipsFromBytes(motion!, reader!);
    const obstacles = new HostageObstacles(), planner = new HostagePathPlanner(map.ai!, obstacles);
    const L = (m: number, x: number, z: number): AiLoc => ({ map: m, x, z });
    const result = climb({ planner, obstacles, grid: map.grid, material: map.defaultMaterial, clips,
      leaderCells: [L(0, 218, 82), L(0, 218, 78), L(0, 218, 76), L(0, 218, 74), L(0, 218, 72), L(0, 218, 71), L(1, 13, 7), L(1, 13, 6)],
      followerCell: L(0, 218, 83), landing: L(0, 218, 71), upper: 1 });
    const said = JSON.stringify(result);
    expect.soft(result.firstUpper, `crossed onto tophost behind a standing leader: ${said}`).toBe(-1);
    expect.soft(result.leaderFinal, `the leader stands on (1,13,6): ${said}`).toEqual(L(1, 13, 6));
    expect.soft(result.finalSub, `standing (the port's follow state 7; the original's state is not measured): ${said}`).toBe(7);
    expect.soft(Math.hypot(result.finalFeet[0] - STOP[0], result.finalFeet[1] - STOP[1], result.finalFeet[2] - STOP[2]),
      `stopped away from the original's stop on the flight: ${said}`).toBeLessThanOrEqual(STOP_TOLERANCE);
  }, 60000);
});

/*
 * The same shape by hand, no disc: a lower sub-map 0 whose two stair columns (WEST, EAST) rise from the south to the
 * landing row; north of the landing the ground floor 42 below, soil 0 and layered (bit 21), as MP71's #0 (218,70); walls
 * (soil 0) on the stair's level either side. An upper sub-map 1 north of the landing, its grid offset by OFFSET cells
 * (as tophost's indices are not sub-map 0's), storing at the landing row only the link cell of the WEST column: no cell
 * above the east column. One link pair, #0 (WEST, LAND) <-> #1 (WEST, LAND), word 8, bit 8 set on both cells. The
 * physical floor is flat (no wall), so whatever holds the port's follower here is its AI-map layer, not collision. It is
 * kept because it reproduces the port's MP71 hold faithfully (held at the landing cell's centre, recoveries through the
 * link that re-enter the east column, never on the upper sub-map); it asserts the same observable, no mechanism.
 */
const COLS = 10, ROWS = 20, LAND = 10, EAST = 8, WEST = 7, OFFSET = 10;
/** A stored first word: bit 31, soil in bits 0-4, bit 8 the link bit, bits 9-18 the height (y = alt - 512 here), bit 21. */
const cellWord = (soil: number, y: number, o: { link?: boolean; layered?: boolean } = {}) =>
  (0x80000000 | ((y + 512) << 9) | soil | (o.link ? 0x100 : 0) | (o.layered ? 1 << 21 : 0)) >>> 0;
function subMap(index: number, offset: number, cell: (x: number, z: number) => number | null): AiSubMap {
  const rows: AiSubMap['rows'] = [], cells: number[] = [];
  for (let z = 0; z < ROWS + offset; z++) {
    const xs = Array.from({ length: COLS + offset }, (_, x) => x).filter(x => cell(x - offset, z - offset) !== null);
    const x0 = xs[0] ?? 0, x1 = xs.length ? xs.at(-1)! + 1 : 0;
    rows.push({ x0, x1, first: cells.length });
    for (let x = x0; x < x1; x++) cells.push(cell(x - offset, z - offset) ?? cellWord(0, 0));
  }
  return { index, id: index, name: index ? 'upper' : 'lower', flags: 0, min: [-offset * 10, -512, -offset * 10], max: [COLS * 10, 512, ROWS * 10],
    cellsX: COLS + offset, cellsZ: ROWS + offset, cellSize: [10, 10], param: 0.5, stamp: 0, rows, cells: Uint32Array.from(cells),
    cellsB: new Uint32Array(cells.length).fill(0xffffffff), points: [], markers: [], links: [], zones: [], spawns: [], lines: [] };
}
function landingMaps(): AiMaps {
  const lower = subMap(0, 0, (x, z) => {
    if (z < LAND) return cellWord(0, -42, { layered: true });
    if (x === WEST && z === LAND) return cellWord(7, 0, { link: true, layered: true });
    return x === WEST || x === EAST ? cellWord(7, 0) : cellWord(0, 0);
  });
  const upper = subMap(1, OFFSET, (x, z) => {
    if (x < 0 || z < 0) return null;
    if (z < LAND) return x === 0 || x === COLS - 1 ? cellWord(0, 0) : cellWord(1, 0);
    return z === LAND && x === WEST ? cellWord(1, 0, { link: true }) : null;
  });
  const down = { map: 0, x: WEST, z: LAND }, up = { map: 1, x: WEST + OFFSET, z: LAND + OFFSET };
  lower.links.push({ from: down, to: up, word: 8 });
  upper.links.push({ from: up, to: down, word: 8 });
  return { version: 2, maps: [lower, upper], links: { words: 0, records: 0 }, spawns: [] };
}

describe('LATER 933 synthetic landing (no disc): a following hostage is not held at a seam beside a soil-0 cell', () => {
  // 2026-11-19: green since the 434 gate (83eb5f1ea0); red with hostageFollow.ts before it (the A/B in the header).
  it('climbs the east column and is not held on the landing: it is on the upper sub-map within the run and at its end', () => {
    const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]) };
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
      [], [], [floor], [{ modelName: floor.modelName, path: floor.path, first: 0, count: 1 }]);
    const obstacles = new HostageObstacles(), planner = new HostagePathPlanner(landingMaps(), obstacles);
    const at = (m: number, x: number, z: number): AiLoc => ({ map: m, x: m ? x + OFFSET : x, z: m ? z + OFFSET : z });
    // The shape is what the test says it is: the landing is located on sub-map 0, a step north of it on sub-map 1.
    expect(planner.locate([85, 0, 105])).toEqual(at(0, EAST, LAND));
    expect(planner.locate([85, 0, 99])).toEqual(at(1, EAST, LAND - 1));
    const result = climb({ planner, obstacles, grid, material: '', clips: null,
      leaderCells: [at(0, EAST, 18), at(0, EAST, LAND), at(1, EAST, LAND - 1), at(1, EAST, LAND - 2), at(1, EAST - 5, LAND - 2)],
      followerCell: at(0, EAST, 19), landing: at(0, EAST, LAND), upper: 1 });
    const said = JSON.stringify(result);
    // Measured on the port as it stands (agent/v0420 f2d9c9c87, under node, 2026-11-12): MP71's signature -- held at the
    // landing's centre (z 105) for 142 consecutive ticks, three recoveries that replan through the link and re-enter the
    // east column, never on sub-map 1; final #0 (7,10) or (8,10).
    expect.soft(result.heldTicks, `held on the landing beyond a short bound: ${said}`).toBeLessThanOrEqual(HELD_BOUND_TICKS);
    expect.soft(result.firstUpper, `never located on the upper sub-map: ${said}`).toBeGreaterThanOrEqual(0);
    expect.soft(result.final?.map, `not on the upper sub-map at the end: ${said}`).toBe(1);
  }, 60000);
});
