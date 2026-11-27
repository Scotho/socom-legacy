import { beforeAll, describe, expect, it } from 'vitest';
import type { AiLoc } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../../viewer/src/simMap';
import { FollowTrail, formationGoalCell } from '../src/hostageFollow';
import { HostagePathPlanner } from '../src/hostagePath';

/**
 * WM-HOSTAGE task 1 (simulation track): the port's formation-goal RULE (`formationGoalCell`; FUN_005fd790
 * D:L509786-509897, research 435) fed the rig's OWN trail arrays directly -- not a trail the port builds -- on MP71's
 * disc data (the fixture `RUN/MP71.ZDB`, sub-map 0, the planner's soil and widths).
 *
 * THE RULE: the base is the trail point at index `depth` (slot 0 = (2, 2): trail[2]); lateral steps i = 1..2 from that
 * base, (x + trunc(0.5 - hz*i), z + trunc(0.5 + hx*i)), each kept only while the trail contains it (FUN_00524760,
 * `FollowTrail.contains`: some entry within its width, Manhattan cells) and its soil is walkable (FUN_0052a090,
 * `traversable`); the first failure stops. For the heading (-0.9147, 0.4040): step 1 is the base itself
 * (trunc(0.5 - 0.404) = 0, trunc(0.5 - 0.9147) = 0) and step 2 is (x, z - 1).
 *
 * THE RIG'S ARRAYS (r0004, MP71, the door match: the leader's +0x4e8 heading (-0.9147, 0.4040), the goal's slot (2, 2),
 * the trail newest first and the goal cell read by relay-1 at the leader's stand; relayed by the main controller
 * 2026-11-15; one match, each case one run). Each entry's width is the planner's `width(cell)`, as the port's
 * `trail.add` stores it (extraction.ts) -- the rig's own widths were not relayed (a test choice, stated).
 *
 * WHAT THIS DOES NOT TEST: whether the port BUILDS the same arrays from the same walk -- a separate open question, the
 * open-door test's job (`hostageOpenDoor.devdisc.test.ts`). The report in each expect message recomputes the candidates
 * by the same formula for diagnosis only; the assertion is on `formationGoalCell`'s answer.
 */

const MP71 = fixture('RUN/MP71.ZDB');
const HEADING = [-0.9147, 0.4040] as const;
const SLOT = [2, 2] as const;
type Cell = readonly [number, number];
const CASES: readonly { run: string; trail: readonly Cell[]; goal: Cell; why?: string; heading?: readonly [number, number] }[] = [
  { run: 'D1', trail: [[223, 81], [223, 82], [223, 83], [223, 84], [221, 84], [218, 83], [125, 148]], goal: [223, 82] },
  { run: 'C1', trail: [[223, 81], [223, 82], [223, 83], [223, 84], [221, 84], [220, 84], [219, 84], [218, 83], [125, 148]], goal: [223, 82] },
  { run: 'C2', trail: [[224, 81], [223, 83], [223, 84], [221, 84], [220, 84], [219, 84], [218, 84], [218, 83], [125, 148]], goal: [223, 83] },
  { run: 'C3', trail: [[224, 81], [223, 83], [223, 84], [221, 84], [220, 84], [218, 83], [125, 148]], goal: [223, 83] },
  { run: 'C5', trail: [[225, 81], [225, 82], [223, 83], [223, 84], [221, 84], [220, 84], [218, 83], [125, 148]], goal: [223, 82],
    why: '(223,82) is not itself in the array: only an entry\'s width can contain it' },
  { run: 'C6', trail: [[224, 81], [223, 84], [221, 84], [220, 84], [218, 83], [125, 148]], goal: [221, 84],
    why: 'the lateral step to (221,83) must fail containment or walkability' },
  /**
   * F1 (the rig's F-1: r0004, MP71, run F12a, one run; relayed by the main controller 2026-11-15): on his run due east the
   * leader's +0x4e8 became (1.0000, 0, -0.0029); in the frame it switched the goal's cell (slot (2, 2)) read (235,83), and
   * settled with him in (236,81) it read (234,83). The rig gave the GOALS, not these arrays: both are CONSTRUCTED from his
   * run's cells, one a cell east along z 81, column 237 inferred from the walk-east positions (x ~2334) -- not read off
   * the rig (a test choice, stated). F1-switch: the leader in (237,81). F1-settled: back in (236,81), his return within
   * the 5-entry loop window (FUN_00524d50, `FollowTrail.add`) cutting the 237 head, which leaves the array starting at 236.
   * With heading (1, -0.0029) the base is trail[2] and the lateral steps are (x, z + 1), (x, z + 2)
   * (trunc(0.5 + 0.0029 i) = 0; trunc(0.5 + i) = i).
   */
  { run: 'F1-switch', heading: [1, -0.0029], trail: [[237, 81], [236, 81], [235, 81], [234, 81], [233, 81], [232, 81], [231, 81], [230, 81],
    [229, 81], [228, 81], [227, 81], [226, 81], [225, 81], [224, 81]], goal: [235, 83],
    why: 'east heading, the switch frame: base (235,81), both lateral steps kept' },
  { run: 'F1-settled', heading: [1, -0.0029], trail: [[236, 81], [235, 81], [234, 81], [233, 81], [232, 81], [231, 81], [230, 81], [229, 81],
    [228, 81], [227, 81], [226, 81], [225, 81], [224, 81]], goal: [234, 83],
    why: 'east heading, settled: base (234,81), both lateral steps kept' },
];

describe.skipIf(!MP71)(`the formation goal on the rig's trail arrays, MP71 (dev-disc)${MP71 ? '' : ` -- ${FIXTURES_ABSENT}`}`, () => {
  // Built in a beforeAll, not in the factory: a skipped describe's factory still runs at collection (skipIfFactories, BL-7).
  let planner: HostagePathPlanner | null = null;
  beforeAll(() => { planner = new HostagePathPlanner(simMapFromBytes(MP71!, 'RUN/MP71.ZDB').ai!); });

  for (const c of CASES) {
    it(`${c.run}: trail[2] (${c.trail[2]!.join(',')}) -> goal (${c.goal.join(',')})${c.why ? ` -- ${c.why}` : ''}`, () => {
      const trail = new FollowTrail();
      for (const [x, z] of c.trail) {
        const loc: AiLoc = { map: 0, x, z };
        trail.points.push({ ...loc, width: planner!.width(loc) });
      }
      const heading = c.heading ?? HEADING;
      const goal = formationGoalCell(trail, heading, SLOT, planner!);

      // The diagnosis: the base, each candidate (contained / traversable / the containing entries' widths), the result.
      const base = trail.points[SLOT[0]]!;
      const sign = Math.sign(SLOT[1]);
      let stopped = false;
      const candidates = [];
      for (let i = 1; i <= Math.abs(SLOT[1]); i++) {
        const cell = { map: 0, x: base.x + Math.trunc(0.5 - heading[1] * sign * i), z: base.z + Math.trunc(0.5 + heading[0] * sign * i) };
        const containing = trail.points.map((p, index) => ({ index, x: p.x, z: p.z, width: p.width, cells: Math.abs(p.x - cell.x) + Math.abs(p.z - cell.z) }))
          .filter(p => p.cells <= p.width);
        const contained = trail.contains(cell), traversable = planner!.traversable(cell);
        candidates.push({ i, x: cell.x, z: cell.z, reached: !stopped, contained, traversable, containing });
        if (!contained || !traversable) stopped = true;
      }
      const report = {
        run: c.run,
        heading,
        entries: trail.points.map(p => ({ x: p.x, z: p.z, width: p.width, traversable: planner!.traversable(p) })),
        base: { x: base.x, z: base.z, width: base.width },
        candidates,
        result: goal ? { x: goal.x, z: goal.z } : null,
        expected: { x: c.goal[0], z: c.goal[1] },
      };
      expect(goal ? { map: goal.map, x: goal.x, z: goal.z } : null, JSON.stringify(report)).toEqual({ map: 0, x: c.goal[0], z: c.goal[1] });
    });
  }
});
