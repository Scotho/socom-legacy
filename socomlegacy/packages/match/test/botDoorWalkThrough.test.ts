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
 * BOT-DOOR-PRESS, the review of f6e5a0fd5 (F1): a CPU walking through a SHUT door presses it once, and goes through.
 * On f6e5a0fd5 the bot opened it, its route was replanned while the leaf swung (a door edge is allowed through a
 * swinging door), and when the leaf came to rest open across that route's leg the door change dropped the route and the
 * press read it on the same tick: the open leaf barred a planned leg, so the bot shut the door from the doorway, then
 * opened it again (MP2 bdoor_4 from 24 off: presses at t27, t88, t149, through at 265; eca29fc99: one press, through at
 * 157). The reviewer's walk-throughs: 5 of 51 starts did the extra shut and reopen; the base, none.
 *
 * The reviewer's starts (his probe `approach.mts`): each door's shut leaf, the bot `r` along its normal on either side
 * and `lat` along it, walking to 40 past the leaf on the other side; the bot's own planner, nothing forced. A start with
 * no floor within 6 of the leaf's foot is not listed, as the probe skipped it. `BASE` is each start's time through
 * under the segment body (SEGMENT-BODY, `WALL_BODY_READING` 'segments'), re-measured on agent/segment-body with main
 * 3bb5197aa merged (2026-11-04, the owner's host: one press each, every start); it was eca29fc99's under the disc body
 * (2026-11-02), which the segment body moves (its side lines meet the jambs). A start may take `SLACK` more.
 */
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const DISC = process.env.SOCOM_DISC;
const onDisc = (stem: string): boolean => !!DISC && [`RUN/${stem}.ZDB`, 'RUN/READERC.ZAR', 'RUN/MOTION_P.ZAR'].every((f) => existsSync(join(DISC, f)));
const HAVE_MP2 = !!fixture('RUN/MP2.ZDB') && !!fixture('RUN/READERC.ZAR') && !!fixture('RUN/MOTION_P.ZAR');
const SLACK = 30;

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
  const human = (): void => {
    const p = room.player(1)!;
    const cmd: Command = { seq: p.sim.seq + 1, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: p.sim.weapon, forward: 0, right: 0 };
    room.binary(1, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
  };
  const step = (): void => { now += 1000 / TICK_HZ; human(); bots.step(); room.step(); };
  step();
  const botId = bots.botIds()[0]!;
  const presses: number[] = [];   // the doors the bot pressed, in order
  vi.spyOn(room, 'text').mockImplementation(function (who: number, ev: unknown) {
    if (who === botId && (ev as { type: string }).type === 'door') presses.push((ev as { door: number }).door);
    return Room.prototype.text.call(room, who, ev as never);
  });
  const assign = (goal: Point): void => {
    const intent = tactics.intent.bind(tactics);
    vi.spyOn(tactics, 'intent').mockImplementation((id: number, at: Point, tick: number): TacticalIntent | null =>
      id === botId ? { goal, hold: false, watch: goal } : intent(id, at, tick));
  };
  return { map, room, bots, step, botId, presses, assign };
}

/** A walk through `node` from `r` off its shut leaf on side `sign`, `lat` along it: its presses and time through. */
async function walkThrough(stem: string, node: string, sign: number, r: number, lat: number) {
  const s = await rig(stem);
  try {
    const door = s.room.doors.specs.findIndex((d) => d.node === node);
    expect(door).toBeGreaterThanOrEqual(0);
    expect(s.room.doors.state(door)).toMatchObject({ open: false, busy: false });
    const pts = s.room.doors.leaf(door).flatMap((p) => [...p]);
    const xs = pts.filter((_, k) => k % 3 === 0), ys = pts.filter((_, k) => k % 3 === 1), zs = pts.filter((_, k) => k % 3 === 2);
    const c = [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys), (Math.min(...zs) + Math.max(...zs)) / 2] as const;
    const along = Math.max(...xs) - Math.min(...xs) > Math.max(...zs) - Math.min(...zs) ? [1, 0] : [0, 1];
    const normal = [along[1]!, along[0]!];
    const probe = new Walker(s.map.grid);
    const at = (d: number, l: number): Point | null => {
      if (!probe.place(c[0] + normal[0]! * d + along[0]! * l, c[1] + 20, c[2] + normal[1]! * d + along[1]! * l)) return null;
      return Math.abs(probe.state.y - c[1]) > 6 ? null : [probe.state.x, probe.state.y, probe.state.z];
    };
    const from = at(r * sign, lat), to = at(-40 * sign, 0);
    if (!from || !to) return null;
    s.room.player(s.botId)!.sim.walker.place(from[0], from[1] + 5, from[2]);
    s.assign(to);
    let through = -1;
    for (let i = 0; i < 20 * TICK_HZ && through < 0; i++) {
      s.step();
      const f = s.room.player(s.botId)!.sim.walker.state;
      if (Math.hypot(f.x - to[0], f.z - to[2]) < 8) through = s.room.tick;
    }
    return { door, presses: [...s.presses], through };
  } finally { s.bots.dispose(); }
}

/**
 * The time through (ticks from the round's start) for each start with floor -- 52 here, the reviewer's probe
 * counted 51 -- less MP71 door_ft_5's three starts 64 off on side -1: the base does not get through from them in 20 s, its
 * walk never reaching the door, so they hold nothing about a press.
 */
const BASE: Record<string, number> = {
  'MP2 bdoor_4 1 24 -12': 144,
  'MP2 bdoor_4 1 24 0': 159,
  'MP2 bdoor_4 1 24 12': 253,
  'MP2 bdoor_4 1 40 -12': 160,
  'MP2 bdoor_4 1 40 0': 182,
  'MP2 bdoor_4 1 64 -12': 188,
  'MP2 bdoor_4 1 64 0': 189,
  'MP2 bdoor_4 1 64 12': 208,
  'MP2 bdoor_4 -1 24 -12': 160,
  'MP2 bdoor_4 -1 24 0': 147,
  'MP2 bdoor_4 -1 24 12': 147,
  'MP2 bdoor_4 -1 40 -12': 169,
  'MP2 bdoor_4 -1 40 0': 162,
  'MP2 bdoor_4 -1 40 12': 176,
  'MP2 bdoor_4 -1 64 -12': 193,
  'MP2 bdoor_4 -1 64 0': 194,
  'MP2 bdoor_4 -1 64 12': 191,
  'MP51 door_ft_1 1 24 -12': 233,
  'MP51 door_ft_1 1 24 0': 229,
  'MP51 door_ft_1 1 24 12': 178,
  'MP51 door_ft_1 1 40 -12': 237,
  'MP51 door_ft_1 1 40 0': 184,
  'MP51 door_ft_1 1 40 12': 188,
  'MP51 door_ft_1 -1 24 -12': 184,
  'MP51 door_ft_1 -1 24 0': 190,
  'MP51 door_ft_1 -1 24 12': 184,
  'MP51 door_ft_1 -1 40 -12': 180,
  'MP51 door_ft_1 -1 40 0': 180,
  'MP51 door_ft_1 -1 40 12': 196,
  'MP51 door_ft_1 -1 64 -12': 215,
  'MP51 door_ft_1 -1 64 0': 190,
  'MP51 door_ft_1 -1 64 12': 255,
  'MP51 door_ft_4 1 24 -12': 207,
  'MP51 door_ft_4 1 24 0': 199,
  'MP51 door_ft_4 1 24 12': 229,
  'MP51 door_ft_4 1 40 -12': 173,
  'MP51 door_ft_4 1 40 0': 180,
  'MP51 door_ft_4 1 40 12': 185,
  'MP51 door_ft_4 1 64 -12': 246,
  'MP51 door_ft_4 1 64 0': 242,
  'MP51 door_ft_4 1 64 12': 214,
  'MP51 door_ft_4 -1 24 -12': 158,
  'MP51 door_ft_4 -1 24 0': 158,
  'MP51 door_ft_4 -1 24 12': 156,
  'MP51 door_ft_4 -1 40 -12': 172,
  'MP51 door_ft_4 -1 40 0': 157,
  'MP71 door_ft_5 -1 24 -12': 150,
  'MP71 door_ft_5 -1 24 0': 149,
  'MP71 door_ft_5 -1 24 12': 140,
};
const ready = (stem: string): boolean => (stem === 'MP2' ? HAVE_MP2 : onDisc(stem));

describe('BOT-DOOR-PRESS F1: a CPU walking through a shut door presses it once and goes through', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  for (const [start, base] of Object.entries(BASE)) {
    const [stem, node, sign, r, lat] = start.split(' ') as [string, string, string, string, string];
    it.skipIf(!ready(stem))(`${start} (base through at ${base})${ready(stem) ? '' : ` (skipped: ${stem} absent)`}`, async () => {
      const w = await walkThrough(stem, node, +sign, +r, +lat);
      console.log(`WALK ${start}: ${w ? `presses ${JSON.stringify(w.presses)} through ${w.through}` : 'no floor'}`);
      expect(w).not.toBeNull();
      expect(w!.presses).toEqual([w!.door]);   // one press, of this door
      expect(w!.through).toBeGreaterThan(0);
      expect(w!.through).toBeLessThanOrEqual(base + SLACK);
    }, 120_000);
  }
});
