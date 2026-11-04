import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM, itemClass, type WeaponRecord } from '@s2u/scene';
import { rocketRoundOf } from '../../viewer/src/equipment';

/**
 * The online parity sweep's WK-6 (P18; product track, no behaviour change): the room's `reload` and `reloadPress` know no
 * round mode (research 251 s12.3, research 312 s5) -- they act on the firearm slot's ring (`p.mags[w]`) and its record's
 * `ReloadDelay` (`p.records[w]`). The page sends no reload in a launcher round's mode because a launched round's magazine
 * is its only one (`NumMags` 1: nothing to swap, and the network refill passes no launcher round), so the room never
 * meets one; were a round to carry a second magazine, a reload in its mode would move the rifle's ring and lock on the
 * carrier's `ReloadDelay`. Latent with the retail table (every launched round `NumMags` 1); a modded table (the forge,
 * DLC) breaking it turns this red before it desyncs a ring.
 *
 * The kit table as the disc's readers read it (`../../scene/test/golden/*.json`: `readArsenal` / `arsenalOf`'s items,
 * `readKitTable(...).records`, held to the disc by `scene/test/weaponTable.parity.test.ts`).
 */
const golden = <T>(name: string): T => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden', name), 'utf8')) as T;
const ITEMS = golden<{ items: { id: number; name: string; cls: string; mags: number }[] }>('arsenal-items.json').items;
const RECORDS = golden<{ records: Record<string, WeaponRecord> }>('weapon-records.json').records;

/**
 * The carriers: the launcher primaries a launcher round comes with (`@s2u/scene` arsenal `launcherFill` /
 * `dependentOf`: the M16A2-M203, M4A1-M203, MGL, M79, F2000) and the rocket launchers (`rocketRoundOf`: LAW, RPG-7).
 */
const CARRIERS = [ITEM.M16_203, ITEM.M4_203, ITEM.MGL, ITEM.M79, ITEM.F2000, ITEM.LAW, ITEM.RPG7] as const;

describe("WK-6 (P18): the room's reload assumes no launched round has a second magazine and no carrier a ReloadDelay", () => {
  it('every launcher round and rocket round in the kit table has NumMags <= 1 (retail: 1)', () => {
    const rounds = ITEMS.filter((i) => i.cls === 'launcherRound' || i.cls === 'rocketRound');
    expect(rounds.length).toBeGreaterThanOrEqual(12);              // ten launcher rounds and the two rockets on the retail disc
    expect(rounds.filter((i) => i.mags > 1).map((i) => `${i.id} ${i.name}: ${i.mags}`)).toEqual([]);
    for (const i of rounds) expect(itemClass(i.id), i.name).toBe(i.cls);
  });

  it('no carrier of a launched round has a ReloadDelay (the room reads the slot record\'s in reloadPress)', () => {
    expect(rocketRoundOf(ITEM.LAW)).not.toBeNull();
    expect(rocketRoundOf(ITEM.RPG7)).not.toBeNull();
    const delays = CARRIERS.map((id) => RECORDS[String(id)]).filter((r): r is WeaponRecord => r !== undefined)
      .filter((r) => (r.reloadDelay ?? 0) > 0).map((r) => `${r.id} ${r.name}: ${r.reloadDelay}`);
    expect(delays).toEqual([]);
    // the five launcher primaries are firearm records (the rocket launchers are not: held items, `p.held`)
    for (const id of [ITEM.M16_203, ITEM.M4_203, ITEM.MGL, ITEM.M79, ITEM.F2000]) expect(RECORDS[String(id)], String(id)).toBeDefined();
  });

  it('Room.reload names the assumption and this test', () => {
    const room = readFileSync(resolve(import.meta.dirname, '../src/room.ts'), 'utf8');
    const body = room.slice(room.indexOf('  private reload(p: Player, seq: number): void {'), room.indexOf('    const record = p.records[w];\n    // NET-REFILL'));
    expect(body.length).toBeGreaterThan(0);
    expect(body).toMatch(/WK-6/);
    expect(body).toMatch(/launcherRoundReload\.test\.ts/);
  });
});
