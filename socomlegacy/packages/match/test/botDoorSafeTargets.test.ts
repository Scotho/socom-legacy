import { describe, expect, it, vi } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { resolve } from 'node:path';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadKitSource, PROTOCOL_VERSION, simMapFromBytes } from '../../viewer/src/sim';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import { drain, WalkingNavigation, type NavSteps, type Point } from '../src/bots/navigation';
import { TeamTactics } from '../src/bots/teamTactics';

/**
 * BOT-DOOR-PRESS, plan failures (5d's condition for B198; product track, a bot adaptation, OT.R81). `doorsChanged` erases
 * every node's `component` at the first door change; from then on `patrolSteps` drew its pool unfiltered (its filter
 * reads `component`), and the search fallback's `nearby` candidates had no filter at all -- so a CPU drew targets the
 * door-safe labels (`doorSafeLabels`) already prove it cannot reach, each refused by `routeSteps`, its three tries spent
 * before a local leg (BCMP MP51's leading failure kind; bot 233 tops it on both sides). The fix keeps, before the draw,
 * only candidates `routeSteps` would not refuse on their labels alone (`WalkingNavigation.mayReach`).
 *
 * On MP2's own hull (the fixtures), its graph built on demand from the AI cells (several weak components: the largest
 * about 6,000 of 10,059 nodes), after one door change.
 */
const ROOT = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const MP2 = fixture('RUN/MP2.ZDB');

/** A seeded draw (mulberry32), so the test's draws are its own and repeatable. */
const seeded = (seed: number) => (): number => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

async function frostfire() {
  const source = await loadKitSource(new FsAssetSource(ROOT));
  const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB', source);
  const nav = new WalkingNavigation(map, undefined, true);
  nav.doorsChanged();   // the first door change: every component erased, the door-safe labels in use
  const labels = (nav as unknown as { doorSafeLabels(): Int32Array }).doorSafeLabels();
  const idOf = new Map(nav.nodes.map((n, i) => [n.at.join(','), i] as const));
  /** The targets `routeSteps` is asked for while `run` runs (each a graph node's own point). */
  const targets = <T>(run: () => T): { value: T; asked: Point[] } => {
    const asked: Point[] = [];
    const real = nav.routeSteps.bind(nav);
    const spy = vi.spyOn(nav, 'routeSteps').mockImplementation(function (from: Point, to: Point): NavSteps<Point[]> { asked.push(to); return real(from, to); });
    try { return { value: run(), asked }; } finally { spy.mockRestore(); }
  };
  return { map, nav, labels, idOf, targets };
}

describe.skipIf(!MP2)(`BOT-DOOR-PRESS: after a door change a CPU draws no target its door-safe label rules out (MP2 fixtures)${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('patrol: every target drawn shares the start\'s label, and a patrol still finds a target where one exists', async () => {
    const s = await frostfire();
    const random = seeded(7), sizes = new Map<number, number>();
    for (const l of s.labels) sizes.set(l, (sizes.get(l) ?? 0) + 1);
    const largest = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    let foreign = 0, asked = 0, found = 0, tried = 0;
    for (let i = 0; i < s.nav.nodes.length; i += 151) {
      const from = s.nav.nodes[i]!.at, start = s.nav.nearest(from);
      if (start === null) continue;
      const w = s.targets(() => s.nav.patrol(from, random));
      for (const to of w.asked) {
        const id = s.idOf.get(to.join(','));
        if (id === undefined) continue;   // a local leg's point, not a node
        asked++;
        if (s.labels[id] !== s.labels[start]) foreign++;
      }
      if (s.labels[start] === largest) { tried++; if (w.value.length) found++; }
    }
    console.log(`patrol from ${Math.ceil(s.nav.nodes.length / 151)} starts: ${asked} node targets asked, ${foreign} with another label; in the largest label ${found} of ${tried} found a route`);
    expect(asked).toBeGreaterThan(50);
    expect(foreign).toBe(0);
    expect(tried).toBeGreaterThan(10);
    // Not every start: a door-safe label is a weak union (every edge any door state could give), so a draw it allows may
    // still find no route; before the fix 43 of these 46 starts found one (the RED run), and no fewer do now.
    expect(found).toBeGreaterThanOrEqual(43);
  }, 300_000);

  it("search fallback: `nearby`'s candidates the CPU tries all share its label", async () => {
    const s = await frostfire();
    let now = 0;
    const room = new Room(s.map, null, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5 });
    room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'Craig', map: s.map.stem }, '', { host: true, side: 'terrorist' });
    const tactics = new TeamTactics(s.nav, () => 0.5, { seal: [], terrorist: [] });
    const bots = new MatchBots(room, { random: () => 0.5, teamProfile: { seal: [], terrorist: [] } }, { navigation: s.nav, tactics });
    try {
      const inner = bots as unknown as { positions: { searchSteps: () => NavSteps<Point[]> }; searchAnglesSteps(memory: Point, feet: Point, reserved: Point[]): NavSteps<Point[]> };
      // The search's own views answered empty, so the fallback (`nearby`) runs.
      vi.spyOn(inner.positions, 'searchSteps').mockImplementation(function* () { return []; });
      let foreign = 0, asked = 0;
      for (let i = 0; i < s.nav.nodes.length; i += 157) {
        const feet = s.nav.nodes[i]!.at, start = s.nav.nearest(feet);
        if (start === null) continue;
        const memory: Point = [feet[0] + 120, feet[1], feet[2] + 80];
        const w = s.targets(() => drain(inner.searchAnglesSteps(memory, feet, [])));
        for (const to of w.asked) {
          const id = s.idOf.get(to.join(','));
          if (id === undefined) continue;
          asked++;
          if (s.labels[id] !== s.labels[start]) foreign++;
        }
      }
      console.log(`search fallback: ${asked} node targets asked, ${foreign} with another label`);
      expect(asked).toBeGreaterThan(50);
      expect(foreign).toBe(0);
    } finally { bots.dispose(); vi.restoreAllMocks(); }
  }, 300_000);
});
