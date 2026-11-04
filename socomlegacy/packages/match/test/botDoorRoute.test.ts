import { describe, expect, it, vi } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { resolve } from 'node:path';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { encodeCommands, loadKitSource, PROTOCOL_VERSION, simClipsFromBytes, simKitsFromBytes, simMapFromBytes, TICK_HZ, type Command } from '../../viewer/src/sim';
import { doorInReach } from '../../viewer/src/doors';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import { WalkingNavigation, type Point } from '../src/bots/navigation';
import { routeCrossesDoor } from '../src/bots/navScheduler';
import { TeamTactics, type TacticalIntent } from '../src/bots/teamTactics';

/**
 * BOT-DOOR's fold (f9's 10-seed check: MP2 stuck +11 %, MP51 +23 %, routes completed -8 % and -14 %): with the
 * proximity press gone the doors stayed shut all round (PF.R10), and the bots' planner treated a shut leaf as a wall, so a
 * CPU went the long way round -- or, where the door was its only way (the review's finding 2), stood. The original's
 * planner reads a static AI map that plans through a doorway whatever the door's state, and a door task walks to its
 * stand point and uses the door (`FUN_005efa50`, D:L502499-502654). Here the bots' planning (theirs alone, never the
 * player's walker or collision) takes an edge a shut, unlocked leaf alone blocks (`WalkingNavigation`'s door edge), and
 * the CPU presses the door on that walk (`wantsDoor`), waits out the swing and goes on. The bots are the port's own (OT.R81).
 *
 * On MP2's own hull, doors and kits (the fixtures), with a navigation graph built on demand from the map's AI cells.
 */
const ROOT = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const MP2 = fixture('RUN/MP2.ZDB'), READERC = fixture('RUN/READERC.ZAR'), WEAPONS = fixture('RUN/ZWEAPON.ZAR'), MOTION = fixture('RUN/MOTION_P.ZAR');
const READY = !!MP2 && !!READERC && !!WEAPONS && !!MOTION;

type BotActor = { route: Point[] };

async function frostfire() {
  const source = await loadKitSource(new FsAssetSource(ROOT));
  const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB', source);
  const kits = simKitsFromBytes(source!, MP2!);
  const clips = simClipsFromBytes(MOTION!, READERC);
  let now = 0;
  const room = new Room(map, clips, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5 }, null, kits);
  room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'Craig', map: map.stem }, '', { host: true, side: 'terrorist' });
  room.hello(2, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'Seal', map: map.stem }, '', { side: 'seal' });
  const navigation = new WalkingNavigation(map, undefined, true);
  const tactics = new TeamTactics(navigation, () => 0.5, { seal: [], terrorist: [] });
  const bots = new MatchBots(room, { random: () => 0.5, kits, teamProfile: { seal: [], terrorist: [] } }, { navigation, tactics });
  bots.setRoster({ seal: 0, terrorist: 1 });
  expect(room.launch(0)).toBe(true);
  const humanCommand = (): number => {
    const p = room.player(1)!;
    const cmd: Command = { seq: p.sim.seq + 1, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: p.sim.weapon, forward: 0, right: 0 };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
    return cmd.seq;
  };
  const step = (n = 1): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; humanCommand(); bots.step(); room.step(); } };
  step();
  const botId = bots.botIds()[0]!;
  const actor = (bots as unknown as { actors: Map<number, BotActor> }).actors.get(botId)!;
  /** The bot's own assignment (a door task's walk): its planner plans to `goal` and walks it; nothing forces a route. */
  const assign = (goal: Point): void => {
    const intent = tactics.intent.bind(tactics);
    vi.spyOn(tactics, 'intent').mockImplementation((id: number, at: Point, tick: number): TacticalIntent | null =>
      id === botId ? { goal, hold: false, watch: goal } : intent(id, at, tick));
  };
  return { map, room, bots, navigation, step, humanCommand, botId, actor, assign };
}

/** MP2's bdoor_4 (by the terrorists' spawn), and a standing point each side of its shut leaf, off its swing's edge. */
function sidesOf(s: Awaited<ReturnType<typeof frostfire>>) {
  const door = s.room.doors.specs.findIndex((d) => d.node === 'bdoor_4');
  const pts = s.room.doors.leaf(door).flatMap((p) => [...p]);
  const xs = pts.filter((_, k) => k % 3 === 0), ys = pts.filter((_, k) => k % 3 === 1), zs = pts.filter((_, k) => k % 3 === 2);
  const c = [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys), (Math.min(...zs) + Math.max(...zs)) / 2];
  // The shut leaf's long side on the ground; its normal crosses the doorway.
  const along = Math.max(...xs) - Math.min(...xs) > Math.max(...zs) - Math.min(...zs) ? [1, 0] : [0, 1];
  const normal = [along[1]!, along[0]!];
  const stand = (sign: number, radii = [32, 36, 40, 44]): Point | null => {
    for (const r of radii) {
      const probe = s.room.player(2)!.sim.walker;
      if (!probe.place(c[0]! + normal[0]! * r * sign, c[1]! + 20, c[2]! + normal[1]! * r * sign)) continue;
      if (Math.abs(probe.state.y - c[1]!) > 6) continue;
      return [probe.state.x, probe.state.y, probe.state.z];
    }
    return null;
  };
  return { door, near: stand(1), far: stand(-1), back: stand(1, [72, 66, 60, 54, 48]), sweep: s.room.doors.specs[door]!.sweep };
}

const length = (from: Point, route: readonly Point[]): number => route.reduce((sum, p, i) => sum + Math.hypot(p[0] - (i ? route[i - 1]! : from)[0], p[2] - (i ? route[i - 1]! : from)[2]), 0);

describe.skipIf(!READY)(`BOT-DOOR fold: a CPU plans through a shut door and opens it on its walk (MP2 fixtures)${READY ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('the planner routes through the shut door where that is the short way (finding 2: no CPU stranded behind it)', async () => {
    const s = await frostfire();
    const { door, near, far, sweep } = sidesOf(s);
    expect(near && far).toBeTruthy();
    expect(s.room.doors.state(door)).toMatchObject({ open: false, busy: false });
    const route = s.navigation.route(near!, far!);
    console.log(`bdoor_4 shut: ${near!.map((v) => v.toFixed(1))} -> ${far!.map((v) => v.toFixed(1))}, route of ${route.length} points, ${length(near!, route).toFixed(0)} long`);
    expect(route.length).toBeGreaterThan(0);
    expect(routeCrossesDoor(near!, route, [sweep])).toBe(true);
    expect(length(near!, route)).toBeLessThan(3 * Math.hypot(far![0] - near![0], far![2] - near![2]));
    s.bots.dispose();
  }, 120_000);

  it('a CPU sent through the shut door presses it on arrival and is through within bounded ticks', async () => {
    const s = await frostfire();
    const { door, near, far } = sidesOf(s);
    s.room.player(s.botId)!.sim.walker.place(near![0], near![1] + 5, near![2]);
    s.assign(far!);
    const sent = vi.spyOn(s.room, 'text');
    let pressed = -1, through = -1;
    for (let i = 0; i < 12 * TICK_HZ && through < 0; i++) {
      s.step();
      if (pressed < 0 && sent.mock.calls.some(([who, ev]) => who === s.botId && (ev as { type: string; door?: number }).type === 'door' && (ev as { door: number }).door === door)) pressed = s.room.tick;
      const f = s.room.player(s.botId)!.sim.walker.state;
      if (Math.hypot(f.x - far![0], f.z - far![2]) < 10) through = s.room.tick;
    }
    console.log(`pressed at ${pressed}, through at ${through}`);
    expect(pressed).toBeGreaterThan(0);
    expect(through).toBeGreaterThan(0);
    s.bots.dispose();
  }, 120_000);

  it("finding 1: a CPU on its own walk through the door the player shuts on it reopens it, no route forced", async () => {
    const s = await frostfire();
    const { door, near, back, far } = sidesOf(s);
    const home = { ...s.room.player(1)!.sim.walker.state };
    s.room.player(1)!.sim.walker.place(far![0], far![1] + 5, far![2]);
    s.room.text(1, { type: 'door', seq: s.humanCommand(), door });
    s.step(2 * TICK_HZ);
    expect(s.room.doors.state(door)).toMatchObject({ open: true, busy: false });
    s.room.player(s.botId)!.sim.walker.place(back![0], back![1] + 5, back![2]);
    s.assign(far!);
    // The bot plans its own walk through the open doorway; the player shuts the door once that walk is under way.
    for (let i = 0; i < 2 * TICK_HZ && !routeCrossesDoor(back!, s.actor.route, [s.room.doors.specs[door]!.sweep]); i++) s.step();
    expect(routeCrossesDoor(back!, s.actor.route, [s.room.doors.specs[door]!.sweep])).toBe(true);
    const sent = vi.spyOn(s.room, 'text');
    // The player steps up to the open leaf (in its reach), shuts it ...
    const reach = [0, 0.25, 0.5, 0.75].map((t): Point => [far![0] + (near![0] - far![0]) * t, far![1], far![2] + (near![2] - far![2]) * t])
      .find((at) => doorInReach(s.room.doors, door, at))!;
    s.room.player(1)!.sim.walker.place(reach[0], reach[1] + 5, reach[2]);
    s.room.text(1, { type: 'door', seq: s.humanCommand(), door });
    s.step();
    expect(s.room.doors.state(door).busy).toBe(true);
    s.room.player(1)!.sim.walker.place(home.x, home.y + 5, home.z);   // ... and walks off, out of the bot's way
    let shut = -1, reopened = -1, through = -1;
    for (let i = 0; i < 12 * TICK_HZ && through < 0; i++) {
      s.step();
      if (shut < 0 && !s.room.doors.state(door).open && !s.room.doors.state(door).busy) shut = s.room.tick;
      if (reopened < 0 && sent.mock.calls.some(([who, ev]) => who === s.botId && (ev as { type: string }).type === 'door')) reopened = s.room.tick;
      const f = s.room.player(s.botId)!.sim.walker.state;
      if (Math.hypot(f.x - far![0], f.z - far![2]) < 12) through = s.room.tick;
    }
    console.log(`shut at ${shut}, reopened at ${reopened}, through at ${through}`);
    expect(shut).toBeGreaterThan(0);
    expect(reopened).toBeGreaterThan(shut);
    expect(through).toBeGreaterThan(0);
    s.bots.dispose();
  }, 120_000);
});
