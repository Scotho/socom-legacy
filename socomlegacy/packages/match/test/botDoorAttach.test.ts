import { afterEach, describe, expect, it, vi } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeCommands, loadKitSource, PROTOCOL_VERSION, simClipsFromBytes, simKitsFromBytes, simMapFromBytes, TICK_HZ, type Command } from '../../viewer/src/sim';
import { Walker } from '../../viewer/src/mover';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import { WalkingNavigation, type Point } from '../src/bots/navigation';
import { routeCrossesDoor } from '../src/bots/navScheduler';
import { TeamTactics, type TacticalIntent } from '../src/bots/teamTactics';

/**
 * BOT-DOOR doorway attach (product track, a bot adaptation; the bots' planning only, never a player's walker). BCMP MP51
 * (Vigilance) seed 43 on b2 + BOT-CORNER + BOT-DOOR: bot 234 stood at (950, 39, 920), inside door_ft_2's swing box
 * (x 939.9-965.0, z 902.6-927.6), with no route for 25.5k of 36k ticks (r8 `stillTop`). The spot is a niche whose one
 * way out is east, across the place the leaf stands when the door is open: with the door open at rest every
 * attachment candidate's walk test meets the leaf (or the niche's walls), `nearest` answers null, `routeSteps` returns
 * no route, and with no route `wantsDoor` never asks for the door -- the bot stands until someone shuts it. With the
 * door shut the same spot attaches (east, through the doorway's swing), so the door's state is what traps it -- and a
 * bot in the niche with the door shut opened it onto itself: every route from inside the swing box crossed it
 * (`wantsDoor`), so BOT-DOOR's press fired at once -- the likely way bot 234 came to be shut in (BOT-DOOR-PRESS now
 * presses only a door whose own leaf bars the way: case c2).
 *
 * The fix (`WalkingNavigation.nearestSteps`' leaf-less retry; `MatchBots`' press of a leaf that bars its way,
 * BOT-DOOR-PRESS): a point inside a door's swing box whose ordinary attachment fails retries its candidates on the
 * hull without the door leaves, through doors that are not locked, whatever their state; the bot then has a route out
 * across the swing, and presses the door whose leaf bars its leg (shutting the open leaf swings it off the niche's
 * mouth).
 *
 * On the disc's MP51 (`SOCOM_DISC`; the fixtures do not hold it), with a navigation graph built on demand from the
 * map's AI cells; skipped without the disc.
 */
const DISC = process.env.SOCOM_DISC;
const READY = !!DISC && ['RUN/MP51.ZDB', 'RUN/READERC.ZAR', 'RUN/MOTION_P.ZAR'].every((f) => existsSync(join(DISC, f)));
const read = (f: string): Uint8Array => new Uint8Array(readFileSync(join(DISC!, f)));

/** The niche behind door_ft_2's open leaf (BCMP's bot 234 stood at (950, 39, 920)), and a floor point east of it. */
const NICHE: readonly [number, number] = [950, 921];
const EAST: readonly [number, number] = [960, 926];

type BotActor = { route: Point[] };
/**
 * Out of the niche (the review of f6e5a0fd5, F3: a radius round a point east of it passed by about 0.1): the bot's feet
 * outside door_ft_2's swing box, or east of the open leaf's far face (x 955.1; the open leaf stands at x 952.5-955.1,
 * z 915-927.4) -- past the niche's mouth. The walk's goal lies beyond the box (`OUT`), so a CPU that stops a waypoint
 * short of it is still out.
 */
const MOUTH_X = 955.1;
const OUT: readonly [number, number] = [960, 934];

async function vigilance() {
  const source = await loadKitSource(new FsAssetSource(DISC!));
  const zdb = read('RUN/MP51.ZDB');
  const map = simMapFromBytes(zdb, 'RUN/MP51.ZDB', source);
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
  /** The bot's own assignment: its planner plans to `goal` and walks it; nothing forces a route. */
  const assign = (goal: Point): void => {
    const intent = tactics.intent.bind(tactics);
    vi.spyOn(tactics, 'intent').mockImplementation((id: number, at: Point, tick: number): TacticalIntent | null =>
      id === botId ? { goal, hold: false, watch: goal } : intent(id, at, tick));
  };
  const door = room.doors.specs.findIndex((d) => d.node === 'door_ft_2');
  /** The floor under (x, z), from `y` down, as a body stands there (a scratch walker, no player's). */
  const probe = new Walker(map.grid);
  const floor = (x: number, z: number, y = 45): Point | null => (probe.place(x, y, z) ? [probe.state.x, probe.state.y, probe.state.z] : null);
  /** Opens door_ft_2 and lets its swing end (the room's own use, no player's press). */
  const openDoor = (): void => {
    expect(room.doors.use(door)).toBe(true);
    step(4 * TICK_HZ);
    expect(room.doors.state(door)).toMatchObject({ open: true, busy: false });
  };
  const sweep = map.doors![door]!.sweep;
  const outOfNiche = (x: number, z: number): boolean => x > MOUTH_X || x < sweep.minX || x > sweep.maxX || z < sweep.minZ || z > sweep.maxZ;
  return { map, room, bots, navigation, step, botId, actor, assign, door, floor, openDoor, outOfNiche };
}

/** The pre-fix attachment: the first candidate, nearest first, whose walk test passes on the hull as it stands. */
const ordinary = (nav: WalkingNavigation, at: Point): number | null => nav.nearestCandidates(at).find((id) => nav.canWalk(at, nav.nodes[id]!.at)) ?? null;

describe.skipIf(!READY)(`BOT-DOOR doorway attach: a bot inside a door's swing plans out (MP51, the disc)${READY ? '' : ' (skipped: SOCOM_DISC unset or without MP51)'}`, () => {
  let dispose: (() => void) | null = null;
  afterEach(() => { dispose?.(); dispose = null; vi.restoreAllMocks(); });

  it("(a) door shut: the niche attaches through the shut door's swing, as before (the retry does not run)", async () => {
    const s = await vigilance(); dispose = () => s.bots.dispose();
    expect(s.door).toBeGreaterThanOrEqual(0);
    expect(s.room.doors.state(s.door)).toMatchObject({ open: false, busy: false });
    const at = s.floor(...NICHE)!;
    const found = s.navigation.nearest(at);
    console.log(`door_ft_2 shut: niche ${at.map((v) => v.toFixed(1))} attaches to ${found}`);
    expect(found).not.toBeNull();
    expect(found).toBe(ordinary(s.navigation, at));
  }, 300_000);

  it('(b) door open at rest, the bot behind its leaf: the niche attaches across the swing (was null)', async () => {
    const s = await vigilance(); dispose = () => s.bots.dispose();
    s.openDoor();
    s.step();   // the bots read the door change (`doorsChanged`) and its state
    const at = s.floor(...NICHE)!;
    expect(ordinary(s.navigation, at)).toBeNull();   // the trap: every walk test meets the open leaf or the niche's walls
    const found = s.navigation.nearest(at);
    console.log(`door_ft_2 open: niche ${at.map((v) => v.toFixed(1))} attaches to ${found} ${found === null ? '' : s.navigation.nodes[found]!.at.map((v) => v.toFixed(1))}`);
    expect(found).not.toBeNull();
    const route = s.navigation.route(at, s.floor(...EAST)!);
    expect(route.length).toBeGreaterThan(0);
    expect(routeCrossesDoor(at, route, [s.room.doors.specs[s.door]!.sweep])).toBe(true);
  }, 300_000);

  it('(c) the bot in the niche plans its way out, presses the door whose leaf bars it, and leaves the niche', async () => {
    const s = await vigilance(); dispose = () => s.bots.dispose();
    s.openDoor();
    const at = s.floor(...NICHE)!, goal = s.floor(...OUT)!;
    s.room.player(s.botId)!.sim.walker.place(at[0], at[1] + 5, at[2]);
    s.assign(goal);
    const sent = vi.spyOn(s.room, 'text');
    let routed = -1, pressed = -1, out = -1;
    for (let i = 0; i < 12 * TICK_HZ && out < 0; i++) {
      s.step();
      if (routed < 0 && s.actor.route.length) routed = s.room.tick;
      if (pressed < 0 && sent.mock.calls.some(([who, ev]) => who === s.botId && (ev as { type: string; door?: number }).type === 'door' && (ev as { door: number }).door === s.door)) pressed = s.room.tick;
      const f = s.room.player(s.botId)!.sim.walker.state;
      if (s.outOfNiche(f.x, f.z)) out = s.room.tick;
    }
    const presses = sent.mock.calls.filter(([who, ev]) => who === s.botId && (ev as { type: string }).type === 'door').length;
    const f = s.room.player(s.botId)!.sim.walker.state;
    console.log(`presses ${presses}; routed at ${routed}, pressed at ${pressed}, out at ${out}; door ${JSON.stringify(s.room.doors.state(s.door))}, bot at ${[f.x, f.y, f.z].map((v) => v.toFixed(1))}`);
    expect(routed).toBeGreaterThan(0);
    expect(pressed).toBeGreaterThan(0);
    expect(out).toBeGreaterThan(0);
  }, 300_000);

  // BOT-DOOR-PRESS: before it, the bot's own press opened the shut leaf onto the niche's mouth (its route crossed the
  // swing box), and it shut it again to get out (2 presses); now no leaf bars its way, so it presses nothing.
  it("(c2) door shut: the bot leaves the niche without opening the door onto itself (BOT-DOOR-PRESS)", async () => {
    const s = await vigilance(); dispose = () => s.bots.dispose();
    const at = s.floor(...NICHE)!, goal = s.floor(...OUT)!;
    s.room.player(s.botId)!.sim.walker.place(at[0], at[1] + 5, at[2]);
    s.assign(goal);
    const sent = vi.spyOn(s.room, 'text');
    let routed = -1, pressed = -1, out = -1;
    for (let i = 0; i < 12 * TICK_HZ && out < 0; i++) {
      s.step();
      if (routed < 0 && s.actor.route.length) routed = s.room.tick;
      if (pressed < 0 && sent.mock.calls.some(([who, ev]) => who === s.botId && (ev as { type: string; door?: number }).type === 'door' && (ev as { door: number }).door === s.door)) pressed = s.room.tick;
      const f = s.room.player(s.botId)!.sim.walker.state;
      if (s.outOfNiche(f.x, f.z)) out = s.room.tick;
    }
    const presses = sent.mock.calls.filter(([who, ev]) => who === s.botId && (ev as { type: string }).type === 'door').length;
    const f = s.room.player(s.botId)!.sim.walker.state;
    console.log(`presses ${presses}; routed at ${routed}, pressed at ${pressed}, out at ${out}; door ${JSON.stringify(s.room.doors.state(s.door))}, bot at ${[f.x, f.y, f.z].map((v) => v.toFixed(1))}`);
    expect(routed).toBeGreaterThan(0);
    expect(presses).toBe(0);
    expect(pressed).toBe(-1);
    expect(out).toBeGreaterThan(0);
  }, 300_000);

  it("(d) outside every door's swing the attachment is the ordinary one, door shut or open", async () => {
    const s = await vigilance(); dispose = () => s.bots.dispose();
    const sweeps = (s.map.doors ?? []).map((d) => d.sweep);
    const inside = (p: Point): boolean => sweeps.some((w) => p[0] >= w.minX && p[0] <= w.maxX && p[2] >= w.minZ && p[2] <= w.maxZ);
    // Points just outside every door's swing box (at its leaf's foot), and a spread of the map's own nodes, offset off-node.
    const points: Point[] = [];
    for (let i = 0; i < sweeps.length; i++) {
      const w = sweeps[i]!, foot = Math.min(...s.room.doors.leaf(i).flatMap((p) => [...p].filter((_, k) => k % 3 === 1))) + 6;
      for (const [x, z] of [[w.minX - 3, w.minZ - 3], [w.maxX + 3, w.maxZ + 3], [w.minX - 3, w.maxZ + 3], [w.maxX + 3, w.minZ - 3],
        [(w.minX + w.maxX) / 2, w.minZ - 4], [(w.minX + w.maxX) / 2, w.maxZ + 4], [w.minX - 4, (w.minZ + w.maxZ) / 2], [w.maxX + 4, (w.minZ + w.maxZ) / 2]] as const) {
        const p = s.floor(x, z, foot);
        if (p) points.push(p);
      }
    }
    for (let i = 0; i < s.navigation.nodes.length; i += 97) { const n = s.navigation.nodes[i]!.at; points.push([n[0] + 1.3, n[1], n[2] - 0.7]); }
    const outside = points.filter((p) => !inside(p));
    expect(outside.length).toBeGreaterThan(100);
    const check = (): void => { for (const p of outside) expect(s.navigation.nearest(p), p.join(',')).toBe(ordinary(s.navigation, p)); };
    check();
    s.openDoor(); s.step();
    check();
  }, 300_000);
});
