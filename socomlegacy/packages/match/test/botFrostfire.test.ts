import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadKitSource, simKitsFromBytes, simMapFromBytes, simClipsFromBytes, PROTOCOL_VERSION, TICK_HZ } from '../../viewer/src/sim';
import { itemClass } from '@s2u/scene';
import { Room } from '../src/room';
import { ALL_MAPS_SWITCH } from '../src/botGates';
import { MatchBots } from '../src/bots/matchBots';
import { validateBotNavigation } from '../src/bots/navigation';

const ROOT = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const MP2 = fixture('RUN/MP2.ZDB'), READERC = fixture('RUN/READERC.ZAR'), WEAPONS = fixture('RUN/ZWEAPON.ZAR'), MOTION = fixture('RUN/MOTION_P.ZAR');
const READY = !!MP2 && !!READERC && !!WEAPONS && !!MOTION;
const NAV = resolve(import.meta.dirname, '../../../public/maps/nav/MP2.json');

describe.skipIf(!READY)(`Frostfire fixture authored CPU integration${READY ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  // Product test budget: each fixed 17 * TICK_HZ run drives 15 CPUs through native hull/motion data. The two-worker
  // gate measured 53 seconds for classic and 59 for respawn; bound each scenario without shortening either simulation.
  it('H315: a classic Frostfire room seats no CPU -- the room refuses each CPU hello', async () => {
    const source = await loadKitSource(new FsAssetSource(ROOT));
    const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB', source);
    const kits = simKitsFromBytes(source!, MP2!);
    const room = new Room(map, null, { rules: 'classic', heldLaunch: true }, null, kits);
    expect(room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION,
      name: 'Solo tester', map: map.stem }, '', { host: true, side: 'seal' })).toBe(true);
    const bots = new MatchBots(room, { kits });
    bots.setRoster({ seal: 7, terrorist: 8 });
    expect(bots.botIds()).toHaveLength(0);
    expect(room.lobby.players()).toHaveLength(1);
    bots.dispose();
  });

  // P537-L2: Fuse's lifted case (82aa02c14), under CREATE_GAME_ALL_MAPS=1 only (a developer's test server).
  it('H315 lifted under CREATE_GAME_ALL_MAPS=1 (P537-L2): a classic Frostfire room seats the CPUs, as a respawn one does', async () => {
    vi.stubEnv(ALL_MAPS_SWITCH, '1');
    try {
      const source = await loadKitSource(new FsAssetSource(ROOT));
      const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB', source);
      const kits = simKitsFromBytes(source!, MP2!);
      const room = new Room(map, null, { rules: 'classic', heldLaunch: true }, null, kits);
      expect(room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION,
        name: 'Solo tester', map: map.stem }, '', { host: true, side: 'seal' })).toBe(true);
      const bots = new MatchBots(room, { kits });
      bots.setRoster({ seal: 7, terrorist: 8 });
      expect(bots.botIds()).toHaveLength(15);
      expect(room.lobby.players()).toHaveLength(16);
      bots.dispose();
    } finally { vi.stubEnv(ALL_MAPS_SWITCH, undefined); }
  });

  it.each(['respawn'] as const)('runs one human and fifteen faction-legal firearm CPUs through a real %s Room and original motion data', async (rules) => {
    const source = await loadKitSource(new FsAssetSource(ROOT));
    expect(source).not.toBeNull();
    const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB', source);
    const kits = simKitsFromBytes(source!, MP2!);
    const clips = simClipsFromBytes(MOTION!, READERC);
    let now = 0, seed = 7;
    const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
    const room = new Room(map, clips, { rules, heldLaunch: true, now: () => now, random }, null, kits);
    expect(room.hello(1, { send: () => {}, close: () => {} }, { type: 'hello', version: PROTOCOL_VERSION,
      name: 'Solo tester', map: map.stem }, '', { host: true, side: 'seal' })).toBe(true);
    const navigation = existsSync(NAV) ? validateBotNavigation(map, JSON.parse(readFileSync(NAV, 'utf8'))) ?? undefined : undefined;
    const bots = new MatchBots(room, { random, kits, navigation });
    expect(bots.stats().nodes).toBe(navigation?.nodes.length ?? 0);
    bots.setRoster({ seal: 7, terrorist: 8 });
    expect(bots.botIds()).toHaveLength(15);
    room.launch(0);
    for (let i = 0; i < 5 * TICK_HZ; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); }
    for (const id of bots.botIds()) {
      const p = room.player(id)!;
      expect(p.sim.seq).toBeGreaterThan(0);
      expect(itemClass(p.records[0].id)).not.toBe('grenadeLauncher');
      expect(p.records[0].id).toBe(p.loadout[0]);
      expect(Number.isFinite(p.sim.walker.state.x)).toBe(true);
    }
    const fallen = room.player(bots.botIds()[0]!)!;
    (room as unknown as { kill(v: unknown, k: null, w: null, how: string, cause: number): void }).kill(fallen, null, null, 'fall', 0);
    expect(fallen.alive).toBe(false);
    for (let i = 0; i < 12 * TICK_HZ; i++) { now += 1000 / TICK_HZ; bots.step(); room.step(); }
    expect(fallen.alive).toBe(rules === 'respawn');
    const drops = room.takeDrops() ?? {};
    expect(drops['fire: muzzle reach'] ?? 0).toBe(0);
    expect(drops['fire: cone: eye'] ?? 0).toBe(0);
    bots.dispose();
  }, 120_000);
});
