import { describe, expect, it, vi } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { resolve } from 'node:path';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { encodeCommands, loadKitSource, PROTOCOL_VERSION, simClipsFromBytes, simKitsFromBytes, simMapFromBytes, TICK_HZ, type Command } from '../../viewer/src/sim';
import { doorInReach } from '../../viewer/src/doors';
import { Room } from '../src/room';
import { MatchBots } from '../src/bots/matchBots';
import type { Point } from '../src/bots/navigation';

/**
 * BOT-DOOR (Craig's live game 2755, MP2 Frostfire, v0.3.36): he closed an open door near the terrorist spawn and a CPU
 * standing near it reopened it at the swing's end -- over and over, so the door stayed busy and his prompt vanished.
 * The original's AI uses a door only through a door task that names it (`FUN_005efa50`: its target door at the task's
 * +0x58, D:L502499-502505; the walk to its stand point, D:L502520-502521; the use, `FUN_002b44e0`, D:L502648-502654), the
 * followers having no door logic (research 199 section 6, research 200 section 3.1); the human's press is the reticle's
 * (`FUN_005920c0`, D:L451484-451517). The bots are the port's own (OT.R81): a CPU presses a door only when the walk it
 * is on goes through that door's swing (`routeCrossesDoor`), never because it merely stands within reach of it.
 *
 * On MP2's own hull, doors and kits (the fixtures); no prepared navigation graph, so a bot's route is the test's. The
 * reopen of a door a player shuts on a CPU's walk is `botDoorRoute.test.ts`'s, on the CPU's own planner (the review's
 * finding 1: this file forced that walk every tick).
 */
const ROOT = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const MP2 = fixture('RUN/MP2.ZDB'), READERC = fixture('RUN/READERC.ZAR'), WEAPONS = fixture('RUN/ZWEAPON.ZAR'), MOTION = fixture('RUN/MOTION_P.ZAR');
const READY = !!MP2 && !!READERC && !!WEAPONS && !!MOTION;

type BotActor = { route: Point[]; lastPlan: number; pathFailedUntil: number };

async function frostfire() {
  const source = await loadKitSource(new FsAssetSource(ROOT));
  const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB', source);
  const kits = simKitsFromBytes(source!, MP2!);
  const clips = simClipsFromBytes(MOTION!, READERC);
  let now = 0;
  const room = new Room(map, clips, { rules: 'respawn', heldLaunch: true, now: () => now, random: () => 0.5 }, null, kits);
  room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'Craig', map: map.stem }, '', { host: true, side: 'terrorist' });
  // A seal seated (a launch wants both sides), idle at its own spawn far off: a second human who never presses anything.
  room.hello(2, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION, name: 'Seal', map: map.stem }, '', { side: 'seal' });
  const bots = new MatchBots(room, { random: () => 0.5, kits, navigation: { version: 2, map: map.stem, nodes: [] }, teamProfile: { seal: [], terrorist: [] } });
  bots.setRoster({ seal: 0, terrorist: 1 });
  expect(room.launch(0)).toBe(true);
  /** The human's idle command each tick (a page sends one), so a `door` it asks is decided at its own command. */
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
  return { map, room, bots, step, humanCommand, botId, actor };
}

/** The MP2 door nearest the terrorists' spawn slots (side 1), and two standing points in its reach outside its swing. */
function doorNearTerrorists(s: Awaited<ReturnType<typeof frostfire>>) {
  const slots = s.map.slots.filter((slot) => slot.side === 1);
  const centre = (i: number): Point => { const b = s.room.doors.specs[i]!.sweep; return [(b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2]; };
  const far = (i: number): number => Math.min(...slots.map((slot) => Math.hypot(slot.position[0] - centre(i)[0], slot.position[2] - centre(i)[2])));
  const door = [...s.room.doors.specs.keys()].sort((a, b) => far(a) - far(b))[0]!;
  const sweep = s.room.doors.specs[door]!.sweep, leafY = Math.min(...s.room.doors.leaf(door).flatMap((pts) => [...pts].filter((_, k) => k % 3 === 1)));
  const spots: Point[] = [];
  for (let a = 0; a < 32 && spots.length < 2; a++) {
    for (const r of [24, 28, 32]) {
      const [cx, , cz] = centre(door), x = cx + Math.cos(a * Math.PI / 16) * r, z = cz + Math.sin(a * Math.PI / 16) * r;
      if (x >= sweep.minX - 2 && x <= sweep.maxX + 2 && z >= sweep.minZ - 2 && z <= sweep.maxZ + 2) continue;
      const probe = s.room.player(1)!.sim.walker;
      if (!probe.place(x, leafY + 20, z)) continue;
      const at: Point = [probe.state.x, probe.state.y, probe.state.z];
      if (Math.abs(at[1] - leafY) > 12 || !doorInReach(s.room.doors, door, at)) continue;
      if (spots.some((q) => Math.hypot(q[0] - at[0], q[2] - at[2]) < 12)) continue;
      spots.push(at); break;
    }
  }
  return { door, spots, centre: centre(door), slotDistance: far(door) };
}

describe.skipIf(!READY)(`BOT-DOOR: a CPU near a door the player closed (MP2 fixtures)${READY ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('a bystander CPU within reach, its walk not through the door, leaves the closed door shut', async () => {
    const s = await frostfire();
    const { door, spots, centre, slotDistance } = doorNearTerrorists(s);
    expect(spots).toHaveLength(2);
    console.log(`MP2 door ${s.room.doors.specs[door]!.node} (index ${door}) at ${centre.map((v) => v.toFixed(1)).join(', ')}, ${slotDistance.toFixed(0)} from the nearest terrorist slot; human ${spots[0]!.map((v) => v.toFixed(1)).join(', ')}, bot ${spots[1]!.map((v) => v.toFixed(1)).join(', ')}`);
    s.room.player(1)!.sim.walker.place(spots[0]![0], spots[0]![1] + 5, spots[0]![2]);
    s.room.player(s.botId)!.sim.walker.place(spots[1]![0], spots[1]![1] + 5, spots[1]![2]);
    // The human opens it, and waits out its swing (head 0.3 s, swing 0.7 s).
    s.room.text(1, { type: 'door', seq: s.humanCommand(), door });
    s.step(2 * TICK_HZ);
    expect(s.room.doors.state(door)).toMatchObject({ open: true, busy: false });
    // The bot stands still on a walk away from the door (no point of it in the door's swing).
    const away: Point = [spots[1]![0] + (spots[1]![0] - centre[0]) * 3, spots[1]![1], spots[1]![2] + (spots[1]![2] - centre[2]) * 3];
    const sent = vi.spyOn(s.room, 'text');
    // The human closes it; the bot, within reach throughout, must not reopen it.
    s.room.text(1, { type: 'door', seq: s.humanCommand(), door });
    for (let i = 0; i < 4 * TICK_HZ; i++) {
      s.room.player(s.botId)!.sim.walker.place(spots[1]![0], spots[1]![1] + 5, spots[1]![2]);
      s.actor.route = [away]; s.actor.lastPlan = s.room.tick;
      s.step();
    }
    const botDoors = sent.mock.calls.filter(([who, ev]) => who === s.botId && (ev as { type: string }).type === 'door');
    expect(botDoors).toHaveLength(0);
    expect(s.room.doors.state(door)).toMatchObject({ open: false, busy: false });
    s.bots.dispose();
  }, 60_000);

  it('a CPU whose walk goes through the closed door still opens it', async () => {
    const s = await frostfire();
    const { door, spots } = doorNearTerrorists(s);
    s.room.player(1)!.sim.walker.place(spots[0]![0], spots[0]![1] + 5, spots[0]![2]);
    s.room.player(s.botId)!.sim.walker.place(spots[1]![0], spots[1]![1] + 5, spots[1]![2]);
    expect(s.room.doors.state(door)).toMatchObject({ open: false, busy: false });
    // BOT-DOOR-PRESS: its walk through the doorway itself -- from just before the shut leaf's middle to beyond it, along
    // the leaf's normal -- since a CPU presses only a door whose own leaf bars its way (a line from the bot through the
    // swing box's centre runs by the hinge, which the leaf does not hold, and no longer asks for the door).
    const pts = s.room.doors.leaf(door).flatMap((p) => [...p]);
    const xs = pts.filter((_, k) => k % 3 === 0), zs = pts.filter((_, k) => k % 3 === 2);
    const mid = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2] as const;
    const normal = Math.max(...xs) - Math.min(...xs) > Math.max(...zs) - Math.min(...zs) ? [0, 1] : [1, 0];
    const side = Math.sign((spots[1]![0] - mid[0]) * normal[0]! + (spots[1]![2] - mid[1]) * normal[1]!);
    const at = (d: number): Point => [mid[0] + normal[0]! * d * side, spots[1]![1], mid[1] + normal[1]! * d * side];
    const sent = vi.spyOn(s.room, 'text');
    s.actor.route = [at(8), at(-30)]; s.actor.lastPlan = s.room.tick;
    s.step();
    expect(sent.mock.calls.some(([who, ev]) => who === s.botId && (ev as { type: string }).type === 'door')).toBe(true);
    expect(s.room.doors.state(door).busy).toBe(true);
    s.bots.dispose();
  }, 60_000);
});
