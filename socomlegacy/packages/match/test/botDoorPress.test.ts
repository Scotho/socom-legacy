import { afterEach, describe, expect, it, vi } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fixture } from '../../archive/test/fixtures';
import { encodeCommands, loadKitSource, PROTOCOL_VERSION, simClipsFromBytes, simKitsFromBytes, simMapFromBytes, TICK_HZ, type Command } from '../../viewer/src/sim';
import { Walker } from '../../viewer/src/mover';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import { WalkingNavigation, type Point } from '../src/bots/navigation';
import { TeamTactics, type TacticalIntent } from '../src/bots/teamTactics';

/**
 * BOT-DOOR-PRESS (product track, a bot adaptation, OT.R81; the review of BOT-DOOR doorway attach, eca29fc99): one rule
 * for a CPU's press of a door, shut or open -- that door's own leaf, where it stands now, bars the bot's way through the
 * door's swing box (`MatchBots.wantsDoor` / `leafBarsRoute`, `WalkingNavigation.legBar`). The review's findings:
 * (1) with two swing boxes overlapping a CPU pressed the first door in reach by index, whichever leaf was in its way
 *     (MP71's door_ft_2 and door_ft_5 overlap, a floor apart; every door's `elevation` is -1, so a CPU upstairs is in
 *     the lower one's reach);
 * (2) any route from inside a box counted as crossing it, so after shutting door_ft_2's leaf off MP51's niche a CPU
 *     reopened the shut door at once (the reviewer's probe toward (960, 945): shut at t357, reopened at t466);
 * (3) the open-door press read the bot's own position, not its planned leg, so a CPU off its line inside an open
 *     doorway's box (strafing, pushed) shut the door -- on a player, perhaps.
 *
 * MP2 from the fixtures; MP51 and MP71 from the disc (`SOCOM_DISC`), each skipped without its data. Graphs built on
 * demand from the maps' AI cells.
 */
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const DISC = process.env.SOCOM_DISC;
const DISC_FILES = ['RUN/READERC.ZAR', 'RUN/MOTION_P.ZAR'];
const onDisc = (stem: string): boolean => !!DISC && [`RUN/${stem}.ZDB`, ...DISC_FILES].every((f) => existsSync(join(DISC, f)));
const HAVE_MP2 = !!fixture('RUN/MP2.ZDB') && !!fixture('RUN/READERC.ZAR') && !!fixture('RUN/MOTION_P.ZAR');

type BotActor = { route: Point[]; lastPlan: number };

async function rig(stem: string) {
  const root = stem === 'MP2' ? FIXTURES : DISC!;
  const read = (f: string): Uint8Array => new Uint8Array(readFileSync(join(root, f)));
  const source = await loadKitSource(new FsAssetSource(root));
  const zdb = read(`RUN/${stem}.ZDB`);
  const map = simMapFromBytes(zdb, `RUN/${stem}.ZDB`, source);
  const kits = simKitsFromBytes(source!, zdb);
  const clips = simClipsFromBytes(read('RUN/MOTION_P.ZAR'), read('RUN/READERC.ZAR'));
  let now = 0;
  const room = new Room(map, clips, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5 }, null, kits);
  room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'Craig', map: map.stem }, '', { host: true, side: 'terrorist' });
  room.hello(2, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'Seal', map: map.stem }, '', { side: 'seal' });
  const navigation = new WalkingNavigation(map, undefined, true);
  const tactics = new TeamTactics(navigation, () => 0.5, { seal: [], terrorist: [] });
  const bots = new MatchBots(room, { random: () => 0.5, kits, teamProfile: { seal: [], terrorist: [] } }, { navigation, tactics });
  bots.setRoster({ seal: 0, terrorist: 1 });
  expect(room.launch(0)).toBe(true);
  const humanCommand = (): void => {
    const p = room.player(1)!;
    const cmd: Command = { seq: p.sim.seq + 1, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: p.sim.weapon, forward: 0, right: 0 };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
  };
  const step = (n = 1): void => { for (let i = 0; i < n; i++) { now += 1000 / TICK_HZ; humanCommand(); bots.step(); room.step(); } };
  step();
  const botId = bots.botIds()[0]!;
  const actor = (bots as unknown as { actors: Map<number, BotActor> }).actors.get(botId)!;
  const assign = (goal: Point): void => {
    const intent = tactics.intent.bind(tactics);
    vi.spyOn(tactics, 'intent').mockImplementation((id: number, at: Point, tick: number): TacticalIntent | null =>
      id === botId ? { goal, hold: false, watch: goal } : intent(id, at, tick));
  };
  const door = (node: string): number => room.doors.specs.findIndex((d) => d.node === node);
  const probe = new Walker(map.grid);
  /** The floor under (x, z), found from just above `floorY`; asserted within 6 of it. */
  const floor = (x: number, z: number, floorY: number): Point => {
    expect(probe.place(x, floorY + 8, z), `floor at ${x}, ${z}`).toBe(true);
    expect(Math.abs(probe.state.y - floorY), `floor at ${x}, ${z}: ${probe.state.y}`).toBeLessThan(6);
    return [probe.state.x, probe.state.y, probe.state.z];
  };
  const open = (i: number): void => {
    expect(room.doors.use(i)).toBe(true);
    step(4 * TICK_HZ);
    expect(room.doors.state(i)).toMatchObject({ open: true, busy: false });
  };
  /** The doors the bot asked, with their ticks. */
  const log: { door: number; tick: number }[] = [];
  const pressed = (): { door: number; tick: number }[] => log;
  vi.spyOn(room, 'text').mockImplementation(function (this: Room, who: number, ev: unknown) {
    const e = ev as { type: string; door?: number };
    if (who === botId && e.type === 'door') log.push({ door: e.door!, tick: room.tick });
    return Room.prototype.text.call(room, who, ev as never);
  });
  const feet = (): Point => { const s = room.player(botId)!.sim.walker.state; return [s.x, s.y, s.z]; };
  /** Walks the bot from `from` to `goal` on its own planner: the tick it came within 8 of `goal` (its arrival), or -1. */
  const walk = (from: Point, goal: Point, seconds = 12): number => {
    room.player(botId)!.sim.walker.place(from[0], from[1] + 5, from[2]);
    assign(goal);
    for (let i = 0; i < seconds * TICK_HZ; i++) {
      step();
      const f = feet();
      if (Math.hypot(f[0] - goal[0], f[2] - goal[2]) < 8) return room.tick;
    }
    return -1;
  };
  return { map, room, bots, step, botId, actor, door, floor, open, pressed, feet, walk };
}

describe('BOT-DOOR-PRESS: a CPU presses a door only when that door\'s own leaf bars its way through the swing', () => {
  let dispose: (() => void) | null = null;
  afterEach(() => { dispose?.(); dispose = null; vi.restoreAllMocks(); });

  it.skipIf(!onDisc('MP71'))(`(1) overlapping swings (MP71 door_ft_2 below, door_ft_5 above): it presses only the leaf in its way${onDisc('MP71') ? '' : ' (skipped: SOCOM_DISC unset or without MP71)'}`, async () => {
    const s = await rig('MP71'); dispose = () => s.bots.dispose();
    const below = s.door('door_ft_2'), above = s.door('door_ft_5');
    expect(below).toBeGreaterThanOrEqual(0); expect(above).toBeGreaterThanOrEqual(0);
    expect(below).toBeLessThan(above);   // the lower door first by index: the old rule's pick
    // Upstairs, in both swing boxes, and through door_ft_5's shut leaf to its far side.
    const from = s.floor(2128, 612, 222), goal = s.floor(2116.5, 640, 222);
    const through = s.walk(from, goal);
    console.log(`MP71: presses ${JSON.stringify(s.pressed())} (door_ft_2 ${below}, door_ft_5 ${above}), through at ${through}, bot at ${s.feet().map((v) => v.toFixed(1))}`);
    expect(s.pressed().filter((p) => p.door === below)).toEqual([]);
    expect(s.pressed().some((p) => p.door === above)).toBe(true);
    expect(s.room.doors.state(below).open).toBe(false);
    expect(through).toBeGreaterThan(0);
  }, 300_000);

  it.skipIf(!onDisc('MP51'))(`(2) MP51's niche: the CPU shuts door_ft_2's leaf off its way and does not reopen it (the reviewer's probe)${onDisc('MP51') ? '' : ' (skipped: SOCOM_DISC unset or without MP51)'}`, async () => {
    const s = await rig('MP51'); dispose = () => s.bots.dispose();
    const door = s.door('door_ft_2');
    s.open(door);
    // The reviewer's goal (960, 945) attaches to no graph node (it is on y 45, off the graph), so the CPU's walk there was
    // its patrol fallback's, whose draw the door-safe targets' filter changes; the goal here is the floor east of the
    // niche past the swing box (as `botDoorAttach`'s), which its own planner routes to.
    const from = s.floor(950, 921, 38.8), goal = s.floor(960, 934, 38.8);
    const through = s.walk(from, goal);
    s.step(4 * TICK_HZ);   // the probe's reopen came 8 ticks after its arrival, the bot still in the door's reach
    const mine = s.pressed().filter((p) => p.door === door);
    console.log(`MP51: presses ${JSON.stringify(mine)}, through at ${through}, door ${JSON.stringify(s.room.doors.state(door))}`);
    expect(mine).toHaveLength(1);   // the shut, and no reopen
    expect(through).toBeGreaterThan(0);
  }, 300_000);

  it.skipIf(!HAVE_MP2)('(3a) a CPU walking through an open doorway (MP2 bdoor_4) presses nothing', async () => {
    const s = await rig('MP2'); dispose = () => s.bots.dispose();
    const door = s.door('bdoor_4');
    s.open(door);
    const from = s.floor(582, 1092, 142), goal = s.floor(582, 1140, 142);
    const through = s.walk(from, goal);
    console.log(`MP2 through the open bdoor_4: presses ${JSON.stringify(s.pressed())}, through at ${through}, bot at ${s.feet().map((v) => v.toFixed(1))}, route ${JSON.stringify(s.actor.route)}`);
    expect(s.pressed()).toEqual([]);
    expect(s.room.doors.state(door)).toMatchObject({ open: true, busy: false });
    expect(through).toBeGreaterThan(0);
  }, 300_000);

  it.skipIf(!HAVE_MP2)('(3b) a CPU pushed off its planned line in an open doorway\'s swing, behind the leaf, does not shut it', async () => {
    const s = await rig('MP2'); dispose = () => s.bots.dispose();
    const door = s.door('bdoor_4');
    s.open(door);
    // Its plan: into the doorway and through it; its body: pushed east of the open leaf (x 588-592, z 1104-1117), inside
    // the swing box, so the leg from where it stands to its next point crosses the leaf it was planned clear of. On
    // bdoor_4 every such spot lies in the pocket between the open leaf and the east wall, where that leg meets the wall
    // too: no rule presses there (a pin, green before and after BOT-DOOR-PRESS; the press is the leaf's alone).
    const next = s.floor(582, 1110, 142), beyond = s.floor(582, 1140, 142), off = s.floor(596, 1110, 142);
    for (let i = 0; i < TICK_HZ; i++) {
      s.room.player(s.botId)!.sim.walker.place(off[0], off[1] + 5, off[2]);
      s.actor.route = [next, beyond]; s.actor.lastPlan = s.room.tick;
      s.step();
    }
    console.log(`MP2 off-line by the open bdoor_4: presses ${JSON.stringify(s.pressed())}`);
    expect(s.pressed()).toEqual([]);
    expect(s.room.doors.state(door)).toMatchObject({ open: true, busy: false });
  }, 300_000);

  // The review of f6e5a0fd5, F2: the press read the leg from the feet only for a shut-in bot, so a CPU whose next point
  // already lay past a shut leaf (its plan's leg into the leaf walked, or a route from before the door shut) waited for a
  // replan (60-90 ticks) to press. That leg counts when it crosses the leaf itself.
  it.skipIf(!HAVE_MP2)('(4) a CPU in reach whose next point lies past the shut leaf presses at once, without a replan', async () => {
    const s = await rig('MP2'); dispose = () => s.bots.dispose();
    const door = s.door('bdoor_4');
    expect(s.room.doors.state(door)).toMatchObject({ open: false, busy: false });
    // bdoor_4's shut leaf: x 575.8-588.8 at z about 1117; its doorway's walkable middle x 580-584 (research 364 s10).
    const near = s.floor(582, 1109, 142), past = s.floor(582, 1128, 142);
    s.room.player(s.botId)!.sim.walker.place(near[0], near[1] + 5, near[2]);
    let pressed = -1;
    const start = s.room.tick;
    for (let i = 0; i < 20 && pressed < 0; i++) {
      s.actor.route = [past]; s.actor.lastPlan = s.room.tick;   // its walk as it stands; no replan
      s.step();
      if (s.pressed().some((p) => p.door === door)) pressed = s.room.tick - start;
    }
    console.log(`MP2 next point past the shut bdoor_4: pressed after ${pressed} ticks, presses ${JSON.stringify(s.pressed())}`);
    expect(pressed).toBeGreaterThan(0);
    expect(s.pressed().map((p) => p.door)).toEqual([door]);
  }, 300_000);
});
