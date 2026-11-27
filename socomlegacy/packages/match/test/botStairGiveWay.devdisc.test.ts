// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadKitSource, simClipsFromBytes, simKitsFromBytes, simMapFromBytes, PROTOCOL_VERSION, TICK_HZ, type SimMap } from '../../viewer/src/sim';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import { prepareBotNavigation, validateBotNavigation, type NavigationData, type Point } from '../src/bots/navigation';
import { TEAM_TACTICS_ADAPTATION } from '../src/bots/teamTactics';

/**
 * WM-28 (wm-botreds, 2026-11-15; the main controller's order): the FIRST case of LATER 612's dev-disc test, taken from
 * the unlanded `agent/stair-giveway` 9b52a45d79 WITHOUT its step-aside count -- a regression check of the trunk's own
 * traffic rule (`TRAFFIC_ADAPTATION.deadlockTicks`, BOT-CORNER) on MP51's stair. Red here would reopen LATER 612 on the
 * trunk. The original text follows.
 *
 * LATER 612 (product track, a bot traffic adaptation, OT.R81; no original value): on MP51 the generic team profile's
 * terrorist centre hold sits on the stair landing (879.8, 62.9, 516.1) and its station at the stair's top (869.8, 72.8,
 * 536.1). A lower-id CPU holding on the landing and a higher-id teammate walking a one-point route up the stair through
 * it deadlocked: the walker gave way (the holder has priority), found no side step on the stair and did not back off
 * (the holder was not coming at it), renewing its wait every `yieldTicks`; the holder stepped aside only for a lower-id
 * walker's `blockedBy` stamp, and the walker never stamped it; the stall recovery rebuilt the same route every 60 ticks.
 * About 1,300 ticks, until the hold ended (headless MP51 runs, 4 seeds in 10; agent-mail evidence bot-door-2/investigation).
 * The flight there is ~14 wide: no step of `passDistance` either side of the hold, so the holder steps on up the flight,
 * ahead along the walker's approach and off its route.
 * Reads MP51 off the dev disc (SOCOM_DISC, or SOCOM_PC_ROOT's game/disc); skipped without it.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP51.ZDB')));

const LANDING: Point = [879.8, 62.9, 516.1];                    // the generic profile's terrorist centre hold (the holder)
const STATION: Point = [869.8, 72.8, 536.1];                    // its station at the stair's top (the walker's goal)
const FOOT: Point = [876.8, 44.8, 488.9];                       // the walker's start, on the stair below the landing
/** OT.R81 (BTL.R3): the port's invention, no original value -- the no-wedge bound, three stall windows (`stuckTicks` 60). */
const STAIR_NO_WEDGE_ADAPTATION = 3 * 60;

let loaded: { map: SimMap; navigation: NavigationData; kits: ReturnType<typeof simKitsFromBytes>; clips: ReturnType<typeof simClipsFromBytes> } | null = null;
async function load() {
  if (loaded) return loaded;
  const bytes = (rel: string) => new Uint8Array(readFileSync(join(DISC!, rel)));
  const source = await loadKitSource(new FsAssetSource(DISC!));
  const mapBytes = bytes('RUN/MP51.ZDB'), map = simMapFromBytes(mapBytes, 'RUN/MP51.ZDB', source);
  const navigation = validateBotNavigation(map, prepareBotNavigation(map))!;
  expect(navigation).not.toBeNull();
  loaded = { map, navigation, kits: simKitsFromBytes(source!, mapBytes), clips: simClipsFromBytes(bytes('RUN/MOTION_P.ZAR'), bytes('RUN/READERC.ZAR')) };
  return loaded;
}

type Actor = { route: Point[]; lastPlan: number; progressAt: number; progress: Point; tacticGoal: Point | null; holdAside?: { to: Point; last: number };
  passing: Point | null; yieldFor: number | null; yieldUntil: number; recoverUntil: number };
type Intent = { goal: Point; hold: boolean; watch: Point };

/** Two terrorist CPUs on MP51: the lower id holds at `hold`; the higher id (if `walk`) walks a one-point route from FOOT to STATION. */
async function stair(walk: boolean) {
  const { map, navigation, kits, clips } = await load();
  let now = 0;
  const room = new Room(map, clips, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5 }, null, kits);
  expect(room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION,
    name: 'Static host', map: map.stem }, '', { host: true, side: 'seal' })).toBe(true);
  const bots = new MatchBots(room, { random: () => 0.5, kits, navigation, teamProfile: { seal: [], terrorist: [] } });
  bots.setRoster({ seal: 0, terrorist: 2 });
  expect(room.launch(0)).toBe(true);
  const step = (): void => { now += 1000 / TICK_HZ; bots.step(); room.step(); };
  step();
  const [holder, walker] = [...bots.botIds()].sort((a, b) => a - b) as [number, number];
  const actors = (bots as unknown as { actors: Map<number, Actor> }).actors;
  const near = (feet: number[], p: Point): boolean => Math.hypot(feet[0]! - p[0], feet[2]! - p[2]) <= TEAM_TACTICS_ADAPTATION.arrival
    && Math.abs(feet[1]! - p[1]) <= TEAM_TACTICS_ADAPTATION.verticalArrival;
  // TeamTactics' intent, as it gives a hold: hold while near the goal, else walk back to it; watching up the stair.
  const goals = new Map<number, Point>([[holder, LANDING], [walker, walk ? STATION : [FOOT[0] - 400, FOOT[1], FOOT[2]]]]);
  const tactics = (bots as unknown as { tactics: { intent(id: number, at: number[], tick: number): Intent | null } }).tactics;
  tactics.intent = (id: number, feet: number[]) => { const goal = goals.get(id)!; return { goal: [...goal], hold: near(feet, goal), watch: [...STATION] }; };
  room.player(1)!.sim.walker.place(FOOT[0] - 400, FOOT[1], FOOT[2] - 400);
  room.player(holder)!.sim.walker.place(...LANDING);
  Object.assign(actors.get(holder)!, { route: [], lastPlan: room.tick, progressAt: room.tick, progress: [...LANDING], tacticGoal: [...LANDING] });
  if (walk) {
    room.player(walker)!.sim.walker.place(...FOOT);
    Object.assign(actors.get(walker)!, { route: [[...STATION]], lastPlan: room.tick, progressAt: room.tick, progress: [...FOOT], tacticGoal: [...STATION],
      passing: null, yieldFor: null, yieldUntil: 0 });
  }
  const feet = (id: number): number[] => { const s = room.player(id)!.sim.walker.state; return [s.x, s.y, s.z]; };
  return { room, bots, holder, walker, step, actors, feet, near };
}

describe.skipIf(!DISC)(`LATER 612: MP51's stair give-way (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  it('a higher-id walker up the stair through a lower-id holder on the landing reaches its station within three stall windows, the no-wedge bound', async () => {
    const r = await stair(true);
    let arrived = -1;
    for (let t = 0; t < 600 && arrived < 0; t++) {
      r.step();
      if (r.near(r.feet(r.walker), STATION)) arrived = t;
    }
    const pose = (id: number): string => `${id}@${r.feet(id).map((v) => v.toFixed(1)).join(',')}`;
    expect(arrived, `the walker never reached its station: ${pose(r.walker)} holder ${pose(r.holder)}`).toBeGreaterThanOrEqual(0);   // LATER 612's red stood ~1,300 ticks
    // The NO-WEDGE bound, a bot adaptation's (OT.R81), not a game value: three stall windows (stuckTicks 60). The trunk
    // clears the stair in 129 by BOT-CORNER's deadlockTicks (box run R5, wm-botreds-stair-a4dd950b5, 2026-11-15); LATER
    // 612's wedge stood ~1,300; 120 was agent/stair-giveway's target for its give-way, not the trunk's. Printed, so a
    // change that drifts toward the bound is seen.
    console.log(`MP51 stair: the walker arrived at tick ${arrived} (measured 129 on the trunk; bound 180)`);
    expect(arrived, `arrived at tick ${arrived}`).toBeLessThan(STAIR_NO_WEDGE_ADAPTATION);
    // And the holder goes back to its hold once the walker is by.
    let home = -1;
    for (let t = 0; t < 10 * TICK_HZ && home < 0; t++) { r.step(); if (r.near(r.feet(r.holder), LANDING) && !r.actors.get(r.holder)!.holdAside) home = t; }
    expect(home, `the holder back at its hold: ${pose(r.holder)}`).toBeGreaterThanOrEqual(0);
    r.bots.dispose();
  }, 300_000);
});
