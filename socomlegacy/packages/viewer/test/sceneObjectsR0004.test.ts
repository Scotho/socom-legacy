// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { ITEM, MISSION_NAME_READING, missionNameOf, missionValves, parseAnimSets, readKitTable, valveAllows, type ZAnimArchive } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { armoryFromDisc } from '../src/armoryData';
import { r0004ShieldOf, R0004_SHIELD_EDITS } from '../src/sceneHealth';
import { loadSimMap, type SimMap } from '../src/simMap';
import { WorldState } from '../src/worldState';

/**
 * R4B-05 (G13; OT.R97; research 376): r0004's special-cased objects, where the port has the matching path.
 *
 * - The antenna shields: r4 0x26d1d0 (r0001 `FUN_0026c600`, D:L116314-116388, the set's activation) writes MP7's
 *   `ant_base1` / `ant_base2` shield 50.0 (0x42480000 at 0x26d3e8 / 0x26d3f8; `strncmp` 9 at 0x26d3ac / 0x26d3d0) and
 *   MP12's `ant_base1` 22.0 (0x41b00000 at 0x26d440 / 0x26d450; `strcmp` at 0x26d428) into the `Anim_Health` record
 *   (`+0x30` -> `+0x14`) and the built destructible (`+0x2c` -> `+0x10`) before the start loop. The port's one table is
 *   `MapMeta.scene` (`sceneOf`, read by the page and by the room through `simMap.ts`): the shields are edited there.
 * - M63's Thermal Scope: r4 0x2ae920-0x2ae944 (r0001 `FUN_002acc10`, D:L152294-, after the `Valves` loop) sets
 *   `Enable_ThermScope` 1 (type 2, TEMP) when the mission's name is `m63`: `missionValves`.
 * - MP1's outhouses (flag bits 4 and 3): moot -- the room decides every scene death and the wire carries it; pinned below.
 *
 * The r0001 disc values stay asserted beside each: the disc's data is r0001's, unchanged in r0004 (the cluster's md5s).
 */

const DISC = process.env.SOCOM_DISC;
const has = (path: string): boolean => !!DISC && existsSync(resolve(DISC, path));
const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');

/** The disc's own animation records of `stem`'s set (r0001's data), through the zAnim reader. */
const discAnims = (stem: string): ZAnimArchive => {
  const zdb = readFileSync(resolve(DISC!, `RUN/${stem}.ZDB`));
  return parseAnimSets(Zar.parse(zdbMember(zdb, parseZdb(zdb), 'MZANIM.ZAR')));
};
const records = (a: ZAnimArchive, name: string) => a.sets.flatMap((s) => s.anims).filter((x) => x.name === name);

describe('r0004 G13: the shield edits by mission and animation name (r4 0x26d1d0)', () => {
  it('MP7: ant_base1 and ant_base2 by their first nine characters (strncmp 9) -> 50; MP12: ant_base1 exactly (strcmp) -> 22', () => {
    expect(R0004_SHIELD_EDITS).toEqual([
      { mission: 'mp7', name: 'ant_base1', match: 'prefix', shield: 50 },
      { mission: 'mp7', name: 'ant_base2', match: 'prefix', shield: 50 },
      { mission: 'mp12', name: 'ant_base1', match: 'exact', shield: 22 },
    ]);
    expect(r0004ShieldOf('mp7', 'ant_base1')).toBe(50);
    expect(r0004ShieldOf('mp7', 'ant_base2')).toBe(50);
    expect(r0004ShieldOf('mp7', 'ant_base10')).toBe(50);          // strncmp over 9: a longer name matches
    expect(r0004ShieldOf('mp12', 'ant_base1')).toBe(22);
    expect(r0004ShieldOf('mp12', 'ant_base10')).toBeNull();       // strcmp: exact
    expect(r0004ShieldOf('mp12', 'ant_base2')).toBeNull();
    expect(r0004ShieldOf('mp12', 'tower_hitme')).toBeNull();      // 0.2 / 12, not in the list
    expect(r0004ShieldOf('mp71', 'ant_base1')).toBeNull();        // the mission name by strcmp: mp7 only
    expect(r0004ShieldOf('mp1', 'outhouse1')).toBeNull();
    expect(r0004ShieldOf(null, 'ant_base1')).toBeNull();          // no name: 0x26d248's null pointer skips every edit
  });

  it('MISSION_NAME_READING: the mission name the patch compares is the archive stem in lower case', () => {
    expect(MISSION_NAME_READING).toBe('stem-lower-case');
    expect(missionNameOf('MP7')).toBe('mp7');
    expect(missionNameOf('M63')).toBe('m63');
  });

  it('M63: missionValves adds Enable_ThermScope = 1 after the Valves loop for the mission m63 only', () => {
    // `parseRdr`'s shape, as `@s2u/scene`'s arsenal test spells it.
    const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
    const mission: RdrNode = ['Valves', [rec(['NAME', 'Enable_M16'], ['VALUE', '3']), rec(['NAME', 'Enable_c4'], ['VALUE', '2'])]];
    expect(missionValves(mission).get('Enable_ThermScope')).toBeUndefined();
    expect(missionValves(mission, 'm63').get('Enable_ThermScope')).toBe(1);
    expect(missionValves(mission, 'm71').get('Enable_ThermScope')).toBeUndefined();
    expect(missionValves(mission, 'm63').get('Enable_M16')).toBe(3);
  });
});

describe.skipIf(!has('RUN/MP7.ZDB'))(`MP7 Night Stalker's antenna bases on the disc${has('RUN/MP7.ZDB') ? '' : ' (SOCOM_DISC with RUN/MP7.ZDB absent)'}`, () => {
  let map: SimMap;
  const load = async (): Promise<SimMap> => (map ??= await loadSimMap(new FsAssetSource(DISC!), 'RUN/MP7.ZDB'));

  it('the disc (r0001) holds ant_base1/2 twice: kind 1 with no Anim_Health, and kind 3 at 1 / 0 / 9', () => {
    const a = discAnims('MP7');
    for (const name of ['ant_base1', 'ant_base2']) {
      const r = records(a, name);
      expect(r.map((x) => x.params.flags & 0xff), name).toEqual([0x21, 0x23]);
      expect(r[0]!.health, name).toBeNull();
      expect([r[1]!.health!.healthReset, r[1]!.health!.armorReset, r[1]!.health!.shield], name).toEqual([1, 0, 9]);
    }
  });

  it.skipIf(!ZWEAPON)("r0004: the bases' shield is 50 in the room's table -- the satchel's 20 and C4's 18 refused, MPBOMB's 50 qualifies", async () => {
    const m = await load();
    const bases = m.meta!.scene!.destructibles.filter((d) => /^ant_base[12]$/.test(d.anim));
    expect(bases.map((d) => d.anim).sort()).toEqual(['ant_base1', 'ant_base2']);
    for (const d of bases) expect([d.health, d.armor, d.shield], d.anim).toEqual([1, 0, 50]);
    const table = readKitTable(ZWEAPON!);
    const damage = (id: number): number => table.throwables!.get(id)!.record.explosionDamage;
    expect([damage(ITEM.C4), damage(ITEM.SATCHEL), damage(154)]).toEqual([18, 20, 50]);
    const world = new WorldState(m.meta!, m.ground, m.grid);
    world.applyInitial();
    for (const d of bases) {
      expect(world.health.accepts(d.id, damage(ITEM.C4))).toBe(false);
      expect(world.health.accepts(d.id, damage(ITEM.SATCHEL))).toBe(false);
      expect(world.health.accepts(d.id, damage(154))).toBe(true);
      const at = { kind: 'explosion' as const, modifier: 0, point: [0, 0, 0] as [number, number, number] };
      expect(world.health.hitAt(d.targetPath, { ...at, rating: 20 })).toEqual({ applied: false, died: false });
    }
  });
});

describe.skipIf(!has('RUN/MP12.ZDB'))(`MP12 The Ruins' antenna on the disc${has('RUN/MP12.ZDB') ? '' : ' (SOCOM_DISC with RUN/MP12.ZDB absent)'}`, () => {
  it('the disc (r0001): ant_base1 and tower_hitme both 0.2 / 12', () => {
    const a = discAnims('MP12');
    for (const name of ['ant_base1', 'tower_hitme']) {
      const r = records(a, name).filter((x) => x.health);
      expect(r.length, name).toBe(1);
      expect([r[0]!.health!.healthReset, r[0]!.health!.shield], name).toEqual([Math.fround(0.2), 12]);   // f32 on the disc
    }
  });

  it("r0004: ant_base1's shield is 22 -- 20 refused, MPBOMB's 50 qualifies; tower_hitme stays 12", async () => {
    const m = await loadSimMap(new FsAssetSource(DISC!), 'RUN/MP12.ZDB');
    const list = m.meta!.scene!.destructibles;
    const ant = list.filter((d) => d.anim === 'ant_base1');
    expect(ant.length).toBeGreaterThan(0);
    for (const d of ant) expect(d.shield).toBe(22);
    const tower = list.filter((d) => d.anim === 'tower_hitme');
    expect(tower.length).toBeGreaterThan(0);
    for (const d of tower) expect(d.shield).toBe(12);
    const world = new WorldState(m.meta!, m.ground, m.grid);
    world.applyInitial();
    for (const d of ant) {
      expect(world.health.accepts(d.id, 20)).toBe(false);
      expect(world.health.accepts(d.id, 50)).toBe(true);
    }
  });
});

describe.skipIf(!has('RUN/MP1.ZDB'))(`MP1 Blizzard's outhouses on the disc (moot: the room decides)${has('RUN/MP1.ZDB') ? '' : ' (SOCOM_DISC with RUN/MP1.ZDB absent)'}`, () => {
  it("the disc (r0001): outhouse1/2 are kind-3 0x23, no bit 3 or 4; the room's death turns the target off, which the wire carries", async () => {
    const a = discAnims('MP1');
    for (const name of ['outhouse1', 'outhouse2']) {
      const r = records(a, name).filter((x) => x.health);
      expect(r.map((x) => x.params.flags & 0xff), name).toEqual([0x23]);
    }
    const m = await loadSimMap(new FsAssetSource(DISC!), 'RUN/MP1.ZDB');
    const houses = m.meta!.scene!.destructibles.filter((d) => /^outhouse[12]$/.test(d.anim));
    expect(houses.map((d) => d.anim).sort()).toEqual(['outhouse1', 'outhouse2']);
    const world = new WorldState(m.meta!, m.ground, m.grid);
    world.applyInitial();
    for (const d of houses) {
      expect(world.isActive(d.targetPath), d.anim).toBe(true);
      const hit = world.health.hitAt(d.targetPath, { kind: 'explosion', rating: 50, modifier: 0, point: [0, 0, 0] });
      expect(hit, d.anim).toEqual({ applied: true, died: true });
      // SCENE_DEATH_ON_WIRE_READING ('targetOff'): the room's state turns the target off, so every page follows it.
      expect(world.isActive(d.targetPath), d.anim).toBe(false);
    }
  });
});

describe.skipIf(!has('RUN/M63.ZDB'))(`M63's Thermal Scope on the disc${has('RUN/M63.ZDB') ? '' : ' (SOCOM_DISC with RUN/M63.ZDB absent)'}`, () => {
  const mission = (stem: string) => {
    const zdb = readFileSync(resolve(DISC!, `RUN/${stem}.ZDB`));
    const readerm = Zar.parse(zdbMember(zdb, parseZdb(zdb), 'READERM.ZAR'));
    return parseRdr(readerm.data(readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr')!));
  };

  it('the disc (r0001): M63, M71 and M83 carry no Enable_ThermScope; M61 does', () => {
    for (const stem of ['M63', 'M71', 'M83']) expect(missionValves(mission(stem)).has('Enable_ThermScope'), stem).toBe(false);
    expect(missionValves(mission('M61')).has('Enable_ThermScope')).toBe(true);
  });

  it("r0004: M63's valves offer the SEALs the Thermal Scope; M71 and M83 are left alone", () => {
    const v = missionValves(mission('M63'), 'm63');
    expect(v.get('Enable_ThermScope')).toBe(1);
    expect(valveAllows(v, 'seal', ITEM.THERMAL)).toBe(true);
    expect(valveAllows(v, 'terrorist', ITEM.THERMAL)).toBe(false);
    for (const stem of ['M71', 'M83']) expect(missionValves(mission(stem), stem.toLowerCase()).has('Enable_ThermScope'), stem).toBe(false);
  });

  it("the ARMORY's world valves on M63 (armoryFromDisc) carry it", async () => {
    const data = await armoryFromDisc(new FsAssetSource(DISC!), 'RUN/M63.ZDB', 'M63', { models: false, world: true });
    expect(data.world?.valves.get('Enable_ThermScope')).toBe(1);
  });
});
