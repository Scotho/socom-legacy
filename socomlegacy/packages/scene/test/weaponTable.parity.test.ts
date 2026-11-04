// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Zar, parseRdr, parseZdb, zdbMember } from '@s2u/archive';
import {
  EMPTY_ITEM, ITEM, LOCK_BIT, SIDE_BIT, FULL_SLOT, VALVE_OF_ITEM, itemClass, mapKits, missionValves, pick, readArsenal, readKitTable,
  selectable, selectableItems, slotKindOf, slotLocked, valveAllows,
  type Arsenal, type ArsenalItem, type CharacterKit, type ItemClass, type Loadout, type Side,
} from '../src/arsenal';
import {
  DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM, M60E3_FIRE_WAIT_READING, R0004_M60E3_NAME, UNITS_PER_METRE, type WeaponRecord,
} from '../src/weapons';
import { fourthArmoryTypeOpen, uiVehicleNames } from '../src/armoryCharacters';

/**
 * TA-WEAPONS: the weapon table and the arsenal, pinned (TA.R3). The unit half reads the golden pins under
 * `test/golden/` (decoded from the disc by `readKitTable`, `readArsenal`, `missionValves`, `uiVehicleNames` and
 * `mapKits`; each file's `_source` names them) and drives the arsenal's rules from them with no game data, against
 * research 84 section 1 and research 94 sections A1, A3, A4, A7, C1.3, C1.4 and C11. The data half re-reads every pin
 * whole from `ZWEAPON.ZAR`, `READERC.ZAR` and each MP map's `READERM.ZAR`, and skips cleanly without them.
 */

const golden = <T>(name: string): T => JSON.parse(readFileSync(resolve(import.meta.dirname, 'golden', name), 'utf8')) as T;
const RECORDS = golden<{ _source: string; records: Record<string, WeaponRecord> }>('weapon-records.json');
const ITEMS = golden<{ _source: string; items: ArsenalItem[] }>('arsenal-items.json');
interface PinnedMap { valves: Record<string, number>; uiVehicles: string[]; kits: Record<Side, CharacterKit[]> }
const MAPS = golden<{ _source: string; maps: Record<string, PinnedMap> }>('map-arsenals.json');

const record = (id: number): WeaponRecord => {
  const r = RECORDS.records[String(id)];
  if (!r) throw new Error(`no pinned record ${id}`);
  return r;
};
const byName = (name: string): WeaponRecord => {
  const r = Object.values(RECORDS.records).find((x) => x.name === name);
  if (!r) throw new Error(`no pinned record ${name}`);
  return r;
};
const arsenal: Arsenal = {
  items: new Map(ITEMS.items.map((i) => [i.id, i])), byName: new Map(ITEMS.items.map((i) => [i.name, i])), order: ITEMS.items.map((i) => i.id),
};
const valvesOf = (m: string): Map<string, number> => new Map(Object.entries(MAPS.maps[m]!.valves));
const MAP_NUMBERS = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 51, 52, 53, 61, 62, 64, 71, 72, 73, 81, 82, 83];

const note = (n: string): string[] => readFileSync(resolve(import.meta.dirname, '../../../docs/research', n), 'utf8').split('\n');
/** The rows of the markdown table whose header row starts with `head`. */
function table(lines: string[], head: string): string[][] {
  const at = lines.findIndex((l) => l.startsWith(head));
  if (at < 0) throw new Error(`no table ${head}`);
  const rows: string[][] = [];
  for (let i = at + 2; i < lines.length && lines[i]!.startsWith('|'); i++) rows.push(lines[i]!.split('|').slice(1, -1).map((c) => c.trim()));
  return rows;
}

describe('the pins name their source (TA.R3)', () => {
  it('each golden file opens with _source: the disc file, the reader and the date', () => {
    for (const pin of [RECORDS, ITEMS, MAPS]) {
      expect(Object.keys(pin)[0]).toBe('_source');
      expect(pin._source).toMatch(/^disc RUN\/.+; .*reader.*; 2026-\d\d-\d\d$/);
    }
    expect(Object.keys(RECORDS.records)).toHaveLength(44);
    expect(ITEMS.items).toHaveLength(86);
    expect(Object.keys(MAPS.maps)).toEqual(MAP_NUMBERS.map((m) => `MP${m}`));
  });
});

describe('the weapon table, unit half: the pinned records against the notes (research 84 §1, research 94 §C1.3, §C1.4, §C11)', () => {
  it('the baked records the page and the room fire without the tables are the pinned ones: HELD_RIFLE 62, DEFAULT_RIFLE 54, HELD_SIDEARM 15', () => {
    expect(record(62)).toEqual(HELD_RIFLE);
    expect(record(54)).toEqual(DEFAULT_RIFLE);
    expect(record(15)).toEqual(HELD_SIDEARM);
  });

  it('the M4A1 SD and the M4A1 per stance, as research 84 §1 prints them', () => {
    const sd = record(62), m4 = record(54);
    // ReticuleKnock / Return / Max, stand crouch prone.
    expect([sd.stances.stand, sd.stances.crouch, sd.stances.prone].map((s) => [s.knock, s.knockReturn, s.knockMax])).toEqual([[12, 70, 45], [11, 75, 45], [10, 75, 20]]);
    expect([m4.stances.stand, m4.stances.crouch, m4.stances.prone].map((s) => [s.knock, s.knockReturn, s.knockMax])).toEqual([[12, 70, 45], [9, 75, 45], [8, 75, 20]]);
    // TargetDilateUponFire 7; TargetDilateUponMovement 1 x Mult 1 / 13 / 63; TargetConstrict 50 / 55 / 50; TargetMin/Max.
    for (const r of [sd, m4]) {
      expect(Object.values(r.stances).map((s) => [s.dilateFire, s.dilateMove, s.dilateMoveMult, s.constrict])).toEqual([[7, 1, 1, 50], [7, 1, 13, 55], [7, 1, 63, 50]]);
      expect(Object.values(r.stances).map((s) => [s.knockCount, s.knockEntry])).toEqual([[1, 0.4], [1, 0.4], [1, 0.4]]);
      expect(Object.values(r.stances).map((s) => [s.kickRate, s.kickReturnRate, s.kickBase, s.kickRandom]))
        .toEqual([[0.5, 0.18, 0.09, 0.015], [0.5, 0.18, 0.08, 0.015], [0.5, 0.18, 0.06, 0.015]]);
    }
    expect(Object.values(sd.stances).map((s) => [s.targetMin, s.targetMax])).toEqual([[1, 26], [0.75, 25], [1, 24]]);
    expect(Object.values(m4.stances).map((s) => [s.targetMin, s.targetMax])).toEqual([[1, 26], [1, 25], [1, 24]]);
    // SniperDistPPFrameX/Y, LimitX/Y, SniperDecayRate.
    expect(Object.values(sd.stances).map((s) => [s.swayRateX, s.swayRateY, s.swayLimitX, s.swayLimitY, s.sniperDecay]))
      .toEqual([[6, 6, 20, 24, -0.04], [5, 5, 16, 19, -0.05], [4, 4, 12, 15, -0.2]]);
    expect(Object.values(m4.stances).map((s) => [s.swayRateX, s.swayRateY, s.sniperDecay])).toEqual([[5, 4, -0.06], [4, 4, -0.06], [4, 4, -0.2]]);
    // Weapon-wide, SD then M4A1.
    expect([sd.fireWait, m4.fireWait]).toEqual([0.14, 0.12]);
    expect([sd.zoomModes, m4.zoomModes]).toEqual([[1.5, 3], [1.5, 2.5]]);
    expect([sd.accuracyBurst, m4.accuracyBurst]).toEqual([{ countMin: 5, countMax: 10, scalarMin: 0, scalarMax: 0 }, { countMin: 4, countMax: 7, scalarMin: 0, scalarMax: 0.03 }]);
    expect([sd.effectiveRange, m4.effectiveRange, sd.maximumRange, m4.maximumRange]).toEqual([550, 600, 800, 1000]);
    expect([sd.damageModifier, m4.damageModifier]).toEqual([0.15, 0.3]);
    for (const r of [sd, m4]) expect([r.magazine, r.mags, r.maxFireMode, r.recoilPct]).toEqual([30, 3, 3, 0.2]);
    // The round both fire (ZAMMO 5.56 x 45mm): ID 8, ImpactDamage 2.3, Piercing 3 (research 84 §13).
    for (const r of [sd, m4]) expect([r.ammo, r.ammoId, r.impactDamage, r.piercing]).toEqual(['5.56 x 45mm', 8, 2.3, 3]);
    expect(sd.maximumRange * UNITS_PER_METRE).toBe(8000);
  });

  it('the Mark 23, as research 84 §16 prints it: FireWait 0.2, 12 rounds of 45 ACP (Piercing 4), 125 m, a heavy knock and bloom, no kick', () => {
    const m23 = record(15);
    expect([m23.fireWait, m23.magazine, m23.ammo, m23.piercing, m23.maximumRange, m23.zoomModes, m23.fireModes]).toEqual([0.2, 12, '45 ACP', 4, 125, [1.5], [1]]);
    expect([m23.stances.stand.knock, m23.stances.stand.knockReturn, m23.stances.stand.knockMax, m23.stances.stand.dilateFire]).toEqual([20, 60, 40, 20]);
    expect([m23.stances.stand.dilateMove, m23.stances.stand.constrict, m23.stances.stand.targetMin, m23.stances.stand.targetMax]).toEqual([0.75, 75, 10, 30]);
    expect([m23.stances.prone.targetMin, m23.stances.prone.targetMax]).toEqual([14, 34]);
    expect([m23.stances.stand.knockCount, m23.stances.stand.knockEntry]).toEqual([1, 1]);
    expect(m23.rifleKick).toEqual({ stand: null, crouch: null, prone: null });
  });

  it('every row of research 94 §C11 is the pinned arsenal: rate, magazine, reload keys, arming, backblast, cost, gravity, timers, muzzle speed', () => {
    const rows = table(note('94-the-arsenal.md'), '| record | ID | FireWait |');
    expect(rows.length).toBe(65);
    const absent = (c: string): boolean => c.startsWith('·');
    const num = (c: string, fallback: number): number => (absent(c) ? fallback : Number(c));
    for (const [name, id, fireWait, , , , , , , cap, mags, relTime, relDelay, ras, rdas, arming, backblast, slotCost, gravity, timer1, timer2, , , mv] of rows) {
      const item = arsenal.byName.get(name!);
      expect(item, name).toBeDefined();
      // OT.R97, R4B-06 (R4B-01's follow-up): the item's FireWait is the record's, r0004's parser's -- 0.16 over research 94's
      // r0001 0.14 for the M60E3 alone (r4 0x3f054c; research 374, 378); the note's row stays r0001's.
      const wait = name === R0004_M60E3_NAME ? M60E3_FIRE_WAIT_READING : Number(fireWait);
      if (name === R0004_M60E3_NAME) expect(Number(fireWait)).toBe(0.14);
      expect([name, item!.id, item!.fireWait, item!.magazine, item!.mags], name).toEqual([name, Number(id), wait, Number(cap), Number(mags)]);
      expect([name, item!.reloadTime, item!.reloadDelay, item!.reloadAfterShot, item!.reloadDelayAfterShot])
        .toEqual([name, num(relTime!, 0), num(relDelay!, 0.01), ras === 'flag', num(rdas!, 0.01)]);
      expect([name, item!.hasBackblast, item!.slotCost, item!.timer1, item!.timer2]).toEqual([name, backblast === 'flag', num(slotCost!, 1), num(timer1!, 9999999), num(timer2!, 9999999)]);
      // The parser's x10 (DAT_003dfe10) on the distances, speeds and the gravity.
      expect(item!.armingDistance / UNITS_PER_METRE, `${name} ArmingDistance`).toBeCloseTo(num(arming!, 0), 9);
      expect(item!.gravity / UNITS_PER_METRE, `${name} Gravity`).toBeCloseTo(num(gravity!, 9.8), 9);
      expect(item!.muzzleVelocity / UNITS_PER_METRE, `${name} Muzzle_Velocity`).toBeCloseTo(Number(mv), 9);
    }
  });

  it('every firearm row of research 94 §C11 is the pinned record: FireWait, the fire modes MaxFireMode and the mode keys enable, the zoom modes', () => {
    const rows = table(note('94-the-arsenal.md'), '| record | ID | FireWait |');
    let firearms = 0;
    for (const [name, id, fireWait, maxFM, single, auto, nZoom, zoom1, zoom2, cap, mags] of rows) {
      const r = RECORDS.records[id!];
      if (!r) continue;
      firearms++;
      // FUN_003d2a80(MaxFireMode) enables 0..n; SingleMode / AutoMode enable 1 / 3 (L322496-322512).
      const max = maxFM!.startsWith('·') ? 0 : Number(maxFM);
      const modes = [1, 2, 3].filter((m) => m <= max || (m === 1 && single === 'flag') || (m === 3 && auto === 'flag'));
      const zooms = [1.5, ...(zoom1!.startsWith('·') ? [] : [Number(zoom1)]), ...(zoom2!.startsWith('·') ? [] : [Number(zoom2)])];
      // OT.R97, R4B-01: research 94's table is r0001's disc (the M60E3's FireWait 0.14, kept there as r0001's); the pinned
      // record is r0004's parser's, which stores 0.16 over that one record's (r4 0x3f054c; research 374).
      const wait = name === R0004_M60E3_NAME ? M60E3_FIRE_WAIT_READING : Number(fireWait);
      if (name === R0004_M60E3_NAME) expect(Number(fireWait)).toBe(0.14);
      expect([name, r.fireWait, r.fireModes, r.zoomModes.length, r.zoomModes, r.magazine, r.mags])
        .toEqual([name, wait, modes, Number(nZoom), zooms, Number(cap), Number(mags)]);
    }
    // The 41 in-scope firearms of the table and the two grenade-launcher carriers (MGL, M79); not the M203 item (141).
    expect(firearms).toBe(43);
  });

  it('the fire modes, weapon by weapon, as research 94 §C1.3 lists them', () => {
    const modes = (names: string[]): number[][] => names.map((n) => byName(n).fireModes);
    const semi = ['Mark 23', 'F57', 'DE .50', 'M9', '226', 'Mark 23SD', '9mm Pistol', 'P228', 'SR-1 Gyurza', '870', 'Spas 12',
      'M82A1A', 'M40A1', 'M87ELR', 'Dragunov', 'SR-25 SD', 'SR-25'];
    const all = ['M4A1', 'M4A1 SD', 'M4A1-M203', '552', '552SD', 'AK-47', 'AKS-74', 'AK-105', 'KBP OTs-14 Groza', 'HK5', 'HK5SD', 'F90', '9mm Sub', 'MP5K'];
    const semiAuto = ['Model 18', 'M14', 'JACKHAMMER', 'SA-80 A2', 'Steyr Aug'];
    expect(modes(semi)).toEqual(semi.map(() => [1]));
    expect(modes(['M16A2', 'M16A2-M203'])).toEqual([[1, 2], [1, 2]]);
    expect(modes(all)).toEqual(all.map(() => [1, 2, 3]));
    expect(modes(semiAuto)).toEqual(semiAuto.map(() => [1, 3]));
    expect(modes(['M60E3', 'M63A', '.PKM'])).toEqual([[3], [3], [3]]);
    // The F2000 (63, out of scope: Enable_F2000 is 0 on all 22 maps, research 94 §A1) is the one record §C1.3 leaves out.
    expect(byName('F2000').fireModes).toEqual([1, 2, 3]);
    expect([record(ITEM.MGL), record(ITEM.M79)].map((r) => [r.maxFireMode, r.fireModes])).toEqual([[0, []], [0, []]]);
    // The burst is no key on the disc (no record has BurstMode): MaxFireMode 2 or 3 alone gives it.
    expect(Object.values(RECORDS.records).filter((r) => r.fireModes.includes(2) && r.id !== ITEM.F2000).length).toBe(2 + all.length);
  });

  it('the 13 scoped weapons and their levels (research 94 §C1.4); ZoomMode0 1.5 on every record', () => {
    // The out-of-scope F2000 (63; research 94 §A1) is scoped too, at 6: §C1.4 lists the in-scope records only.
    expect(byName('F2000').zoomModes).toEqual([1.5, 6]);
    const scoped = Object.values(RECORDS.records).filter((r) => r.zoomModes.length >= 2 && r.id !== ITEM.F2000).map((r) => [r.name, r.zoomModes.slice(1)]);
    expect(Object.fromEntries(scoped)).toEqual({
      'M4A1': [2.5], 'M4A1 SD': [3], '552': [3], '552SD': [3], 'SA-80 A2': [4], 'KBP OTs-14 Groza': [3], 'Steyr Aug': [2.5],
      'SR-25': [8], 'SR-25 SD': [8], 'Dragunov': [8], 'M40A1': [6, 12], 'M82A1A': [8, 16], 'M87ELR': [8, 16],
    });
    for (const r of Object.values(RECORDS.records)) expect([r.name, r.zoomModes[0]]).toEqual([r.name, 1.5]);
  });

  it('the class keys only where the record has them (research 94 §C1.1, §C1.2, §C2.1): the bolt, the pump, the reload times, the pellets', () => {
    const keys = (r: WeaponRecord) => [r.reloadTime, r.reloadDelay, r.reloadAfterShot, r.reloadDelayAfterShot, r.afterShotSound, r.pellets];
    expect(keys(byName('M40A1'))).toEqual([undefined, undefined, true, 0.5, undefined, undefined]);
    expect(keys(byName('M87ELR'))).toEqual([undefined, undefined, true, 0.5, undefined, undefined]);
    // R94.12: the 870's ReloadAfterShotDelay is no key the parser reads.
    expect(keys(byName('870'))).toEqual([undefined, 1, true, undefined, '.SHOTGUN_COCK', 4]);
    expect(keys(byName('Spas 12'))).toEqual([2, 0.5, undefined, undefined, undefined, 4]);
    expect(keys(byName('JACKHAMMER'))).toEqual([2, 0.5, undefined, undefined, undefined, 4]);
    expect(keys(byName('M60E3'))[0]).toBe(3);
    expect(keys(byName('M63A'))[0]).toBe(2.5);
    const withPellets = Object.values(RECORDS.records).filter((r) => r.pellets !== undefined).map((r) => [r.name, r.ammo, r.pellets, r.piercing, r.impactDamage]);
    expect(withPellets).toEqual([['Spas 12', '12 Gauge', 4, 6, 2.5], ['JACKHAMMER', '12 Gauge', 4, 6, 2.5], ['870', '12 Gauge', 4, 6, 2.5]]);
  });
});

describe('the arsenal, unit half: the pinned items and maps under the select\'s rules (research 94 §A1-§A4, §A7)', () => {
  const CLASS_OF: Record<string, ItemClass> = {
    pistol: 'pistol', SMG: 'smg', rifle: 'rifle', shotgun: 'shotgun', MG: 'mg', sniper: 'sniper', grenade: 'grenade',
    'grenade launcher': 'grenadeLauncher', 'rocket launcher': 'rocketLauncher', explosive: 'explosive', 'launcher round': 'launcherRound',
    'rocket round': 'rocketRound', gear: 'gear', armour: 'armour', turret: 'turret', turret2: 'turret2', internal: 'internal',
  };

  it('every row of research 94 §A1 is a pinned item in the file\'s order: its names, its class by its id range, its slot, its valve', () => {
    const rows = table(note('94-the-arsenal.md'), '| ID | InternalName | DisplayName |');
    expect(rows.length).toBe(86);
    expect(new Set(rows.map((r) => Number(r[0])))).toEqual(new Set(arsenal.order));
    for (const [id, name, display, cls, slot, , ammo, valve] of rows) {
      const item = arsenal.items.get(Number(id))!;
      expect([id, item.name, item.displayName.trim()]).toEqual([id, name, display]);
      expect([id, itemClass(Number(id))]).toEqual([id, CLASS_OF[cls!]]);
      expect([id, slotKindOf(Number(id))]).toEqual([id, slot === 'rocket' ? 'equipment' : slot]);
      expect([id, VALVE_OF_ITEM.get(Number(id)) ?? '-']).toEqual([id, valve]);
      expect([id, item.ammo ?? '-']).toEqual([id, ammo]);
    }
  });

  it('SlotCost 2 on the LAW, the RPG-7 and the Satchel only; the pick fills the partner slot, 4 wrapping to 2 (FUN_0023fef0)', () => {
    expect(ITEMS.items.filter((i) => i.slotCost === 2).map((i) => i.id).sort((a, b) => a - b)).toEqual([ITEM.LAW, ITEM.RPG7, ITEM.SATCHEL]);
    const kit = [54, 15, 121, 126, 194] as unknown as Loadout;
    const mp7 = valvesOf('MP7'), mp1 = valvesOf('MP1');
    expect(pick(arsenal, mp7, 'seal', kit, 2, ITEM.LAW).loadout).toEqual([54, 15, ITEM.LAW, ITEM.LAW_HEAT, 194]);
    expect(pick(arsenal, mp1, 'terrorist', kit, 4, ITEM.RPG7).loadout).toEqual([54, 15, ITEM.RPG_ROUND, 126, ITEM.RPG7]);
    // The M203 rifle brings the M203 (locked) and a FRAG; the M79 its GL FRAG; the MGL an M203 FRAG (§A0).
    const m203 = pick(arsenal, valvesOf('MP1'), 'seal', kit, 0, ITEM.M4_203);
    expect(m203.loadout).toEqual([ITEM.M4_203, 15, ITEM.M203, ITEM.M203_FRAG, 194]);
    expect(slotLocked(m203.valves, 'seal', m203.loadout, 2)).toBe(true);
    expect(pick(arsenal, valvesOf('MP7'), 'terrorist', kit, 0, ITEM.M79).loadout.slice(0, 3)).toEqual([ITEM.M79, 15, ITEM.GL_FRAG]);
    expect(pick(arsenal, valvesOf('MP7'), 'terrorist', kit, 0, ITEM.MGL).loadout.slice(0, 3)).toEqual([ITEM.MGL, 15, ITEM.M203_FRAG]);
  });

  // TA.R6 DRIFT, known and ruled (R94.4, W4.R2; research 94 line 28 and the INGAME_AUTOFILL_SIDE_READING row, line 583):
  // the in-game auto-fill FUN_0023b9b0 (D:L87139-87170; the MIPS at 0x23bbdc) tests `player_team == 0 -> mask 8`, and
  // player_team 0 is the SEALs (FUN_002c3330), so the shipped game refills a SEAL's dependants from the Terrorist-bit
  // items. The port refills from the player's own side (reading (b)); the owner's question stays open. Not fixed here.
  // On the 22 pinned maps the two readings part only after the Satchel (Enable_satchel 0 everywhere, in no kit): a swap
  // of the M203 rifles, the M79, the MGL, the F2000, the LAW, the RPG-7 or the M40A1 out of the default kit refills the
  // same item either way.
  it.fails('DRIFT: a SEAL\'s refill after the Satchel on MP1 is the PMN (mask 8, as FUN_0023b9b0 tests the side), not the Claymore', () => {
    const kit = pick(arsenal, valvesOf('MP1'), 'seal', [54, 15, 121, 126, 194] as unknown as Loadout, 2, ITEM.SATCHEL);
    expect(kit.loadout).toEqual([54, 15, ITEM.SATCHEL, FULL_SLOT, 194]);
    expect(pick(arsenal, valvesOf('MP1'), 'seal', kit.loadout, 2, 121).loadout).toEqual([54, 15, 121, ITEM.PMN, 194]);
  });

  it('each side\'s list on each of the 22 maps is research 94 §A4\'s: the pinned valves through FUN_003cf1f0, bit 1 the SEALs, 8 the Terrorists', () => {
    const rows = table(note('94-the-arsenal.md'), '| map | SEAL n |');
    expect(rows.length).toBe(22);
    expect([SIDE_BIT.seal, SIDE_BIT.terrorist]).toEqual([1, 8]);
    for (const [map, sealN, seal, terrN, terr] of rows) {
      const m = map!.split(' ')[0]!;
      const ids = (s: string): number[] => s.split(/\s+/).map(Number);
      const v = valvesOf(m);
      const got = (side: Side): number[] => selectableItems(arsenal, v, side).sort((a, b) => a - b);
      expect([m, got('seal')]).toEqual([m, ids(seal!)]);
      expect([m, got('terrorist')]).toEqual([m, ids(terr!)]);
      expect([m, got('seal').length, got('terrorist').length]).toEqual([m, Number(sealN), Number(terrN)]);
    }
  });

  it('C4: locked in every SEAL kit on the BREACH maps (Enable_c4 16; FUN_0023e910), selectable by nobody there; MP81\'s Enable_C4 is no valve', () => {
    expect([LOCK_BIT.seal, LOCK_BIT.terrorist]).toEqual([16, 32]);
    for (const m of ['MP61', 'MP62', 'MP73']) {
      const v = valvesOf(m);
      expect([m, v.get('Enable_c4')]).toEqual([m, 16]);
      for (const k of MAPS.maps[m]!.kits.seal) {
        const slot = k.loadout.indexOf(ITEM.C4);
        expect([m, k.type, slot >= 2, slotLocked(v, 'seal', k.loadout as Loadout, slot)]).toEqual([m, k.type, true, true]);
      }
      expect(valveAllows(v, 'seal', ITEM.C4) || valveAllows(v, 'terrorist', ITEM.C4)).toBe(false);
    }
    const mp81 = valvesOf('MP81');
    expect([mp81.has('Enable_C4'), mp81.has('Enable_c4')]).toEqual([true, false]);
    expect(valveAllows(mp81, 'seal', ITEM.C4) || valveAllows(mp81, 'terrorist', ITEM.C4)).toBe(false);
  });

  it('176 kits (4 + 4 a map), never checked against the valves: the only items a kit carries that its side may not pick are §A4\'s 226s and locked C4s', () => {
    const outside: string[] = [];
    let kits = 0;
    for (const [m, map] of Object.entries(MAPS.maps)) {
      expect([m, map.kits.seal.length, map.kits.terrorist.length]).toEqual([m, 4, 4]);
      const v = valvesOf(m);
      for (const side of ['seal', 'terrorist'] as const) {
        for (const k of map.kits[side]) {
          kits++;
          for (const id of k.loadout) if (id !== EMPTY_ITEM && !valveAllows(v, side, id)) outside.push(`${k.character} ${id}`);
        }
      }
    }
    expect(kits).toBe(176);
    const c4 = ['mp61', 'mp62', 'mp73'].flatMap((m) => [1, 2, 3, 4].map((n) => `${m}_seal${n} ${ITEM.C4}`));
    expect(outside.sort()).toEqual(['mp6_seal4 6', 'mp7_seal2 6', ...c4].sort());
    // Frostfire's first SEAL and fourth Terrorist (research 91 §14).
    const names = (l: readonly number[]): string[] => l.filter((id) => id !== EMPTY_ITEM).map((id) => arsenal.items.get(id)!.name);
    expect(names(MAPS.maps.MP2!.kits.seal[0]!.loadout)).toEqual(['M4A1', 'Mark 23', 'M67', 'HE', 'Double Ammo Load']);
    expect(names(MAPS.maps.MP2!.kits.terrorist[3]!.loadout)).toEqual(['M82A1A', 'Model 18', 'M67', 'PMN Mine', 'HE']);
  });

  it('every one of the 176 kits is research 91 §14\'s: the character, then primary / secondary / the equipment, by name', () => {
    let map = '', seen = 0;
    const names = (l: readonly number[]): string => {
      const n = l.map((id) => (id === EMPTY_ITEM ? '' : arsenal.items.get(id)!.name));
      return `${n[0]} / ${n[1]} / ${n.slice(2).filter((x) => x).join(', ')}`;
    };
    for (const line of note('91-the-round.md')) {
      const head = /^### (MP\d+) /.exec(line);
      if (head) { map = head[1]!; continue; }
      const row = /^\| (\d) \| (\S+) \(`[^`]*`\) \| ([^|]+) \| (\S+) \(`[^`]*`\) \| ([^|]+) \|$/.exec(line);
      if (!row || !map) continue;
      const i = Number(row[1]) - 1, kits = MAPS.maps[map]!.kits;
      expect([map, kits.seal[i]!.character, names(kits.seal[i]!.loadout)]).toEqual([map, row[2], row[3]!.trim()]);
      expect([map, kits.terrorist[i]!.character, names(kits.terrorist[i]!.loadout)]).toEqual([map, row[4], row[5]!.trim()]);
      seen += 2;
    }
    expect(seen).toBe(176);
  });

  it('every kit\'s two firearm slots have a pinned record; the Designator (11) and the M203 item (141) none', () => {
    for (const [m, map] of Object.entries(MAPS.maps)) {
      for (const k of [...map.kits.seal, ...map.kits.terrorist]) {
        expect([m, k.type, String(k.loadout[0]) in RECORDS.records, String(k.loadout[1]) in RECORDS.records]).toEqual([m, k.type, true, true]);
      }
    }
    expect(['11', '141'].some((id) => id in RECORDS.records)).toBe(false);
  });

  it('2X on every map for both sides (research 94 §A7), carried by 112 of the 176 kits (research 91 §14); one slot only', () => {
    for (const m of Object.keys(MAPS.maps)) expect([m, valvesOf(m).get('Enable_2xammo')]).toEqual([m, 9]);
    const carrying = Object.values(MAPS.maps).flatMap((map) => [...map.kits.seal, ...map.kits.terrorist]).filter((k) => k.loadout.includes(ITEM.DOUBLE_AMMO));
    // Research 94 §A7 (and §A1's "in a kit" column) says 44; the kits themselves -- research 91 §14's and the disc's -- 112.
    expect(carrying.length).toBe(112);
    const kit = [54, 15, ITEM.DOUBLE_AMMO, 126, 121] as unknown as Loadout;
    expect(selectable(valvesOf('MP2'), 'seal', kit, 3, ITEM.DOUBLE_AMMO)).toBe(false);
    expect(selectable(valvesOf('MP2'), 'seal', kit, 2, ITEM.DOUBLE_AMMO)).toBe(true);
  });

  it('the ARMORY\'s fourth column (research 95 R95.6, §6): open where InWhichAOP is 0 (MP1-MP12), locked on the campaign maps in the original, open by OT.R91; UiVehicles in chartype order', () => {
    const aop: Record<string, number> = {};
    for (const [m, map] of Object.entries(MAPS.maps)) {
      aop[m] = map.valves.InWhichAOP!;
      const n = Number(m.slice(2));
      expect([m, fourthArmoryTypeOpen(valvesOf(m), false)]).toEqual([m, n <= 12]);   // the original's fresh card
      expect([m, fourthArmoryTypeOpen(valvesOf(m))]).toEqual([m, true]);             // OT.R91: every campaign unlock earned
      expect([m, map.uiVehicles]).toEqual([m, ['Seal1', 'Seal2', 'Seal3', 'Seal4', 'Terrorist1', 'Terrorist2', 'Terrorist3', 'Terrorist4']]);
      expect([m, map.kits.seal.map((k) => k.type), map.kits.terrorist.map((k) => k.type)]).toEqual([m, map.uiVehicles.slice(0, 4), map.uiVehicles.slice(4)]);
    }
    const want = (n: number): number => (n <= 12 ? 0 : n < 60 ? 50 : n < 70 ? 60 : n < 80 ? 70 : 80);
    expect(aop).toEqual(Object.fromEntries(MAP_NUMBERS.map((n) => [`MP${n}`, want(n)])));
  });
});

// ---- The data half: each pin re-read whole off the disc (skips cleanly without it) --------------------------------------

const tree = resolve(import.meta.dirname, '../../..');
const fixtures = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(tree, 'test-fixtures');
const onDisc = (name: string): string | undefined => [
  resolve(tree, `public/maps/RUN/${name}`),
  resolve(fixtures, `RUN/${name}`),
  ...(process.env.SOCOM_DISC ? [resolve(process.env.SOCOM_DISC, `RUN/${name}`)] : []),
].find((p) => existsSync(p));
const ZWEAPON = onDisc('ZWEAPON.ZAR'), READERC = onDisc('READERC.ZAR');
const bytes = (p: string): Uint8Array => new Uint8Array(readFileSync(p));
/** A value as the pin stores it: through JSON (an absent optional key and an undefined one are the same). */
const asPinned = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe.skipIf(!ZWEAPON)('the weapon table, data half: the pins re-read off ZWEAPON.ZAR', () => {
  it('readKitTable(ZWEAPON.ZAR).records is weapon-records.json, whole', () => {
    const table = readKitTable(bytes(ZWEAPON!));
    expect(asPinned(Object.fromEntries([...table.records].sort((a, b) => a[0] - b[0]).map(([id, r]) => [String(id), r])))).toEqual(RECORDS.records);
  });

  it('readArsenal(ZWEAPON.ZAR) is arsenal-items.json, whole, in the file\'s order', () => {
    const disc = readArsenal(bytes(ZWEAPON!));
    expect(asPinned(disc.order.map((id) => disc.items.get(id)))).toEqual(ITEMS.items);
  });
});

describe.skipIf(!ZWEAPON || !READERC)('the map arsenals, data half: each map\'s pin re-read off its READERM.ZAR', () => {
  for (const n of MAP_NUMBERS) {
    // The fixture tree holds three maps (MP2, MP6, MP72), the disc all 22: a map absent skips, it never passes.
    const path = onDisc(`MP${n}.ZDB`);
    it.skipIf(!path)(`MP${n}: its Enable_* and InWhichAOP valves, its UiVehicles and its kits are the pin`, () => {
      const rc = Zar.parse(bytes(READERC!));
      const character = parseRdr(rc.data(rc.root.children.find((k) => k.name.toLowerCase() === 'character.rdr')!));
      const zdb = bytes(path!);
      const rm = Zar.parse(zdbMember(zdb, parseZdb(zdb), 'READERM.ZAR'));
      const script = (s: string) => parseRdr(rm.data(rm.root.children.find((k) => k.name.toLowerCase() === s)!));
      const mission = script('mission.rdr');
      const valves = Object.fromEntries([...missionValves(mission)].filter(([k]) => /^Enable|^InWhichAOP$/.test(k)));
      const pinned = MAPS.maps[`MP${n}`]!;
      expect(valves).toEqual(pinned.valves);
      expect(uiVehicleNames(mission)).toEqual(pinned.uiVehicles);
      expect(asPinned(mapKits(readArsenal(bytes(ZWEAPON!)), script('chartype.rdr'), character))).toEqual(pinned.kits);
    });
  }
});

describe.skipIf(!ZWEAPON)('CTL-2: the launched rounds, the rockets and the throwables carry their Rumble_Modifiers (the one weapon parser)', () => {
  // The weapon parser (FUN_003cda30, D:L322181-322195) reads the block for every ZWEAPON record; the shot's rumble
  // (FUN_005c3360) is the fired record's -- a launcher's round mode moves the slot to the round's (FUN_005c6600), a throw
  // or a placing runs its item's (FUN_005c1970). The review's F1 and F3: each of these is 0.04 s / 0.18 s at 175.
  it('M203 HE 171, F2000 HE 181, LAW 185, RPG 186 (the kit rounds) and the M67 121 (a throwable) are 0.04 / 0.18 / 175', () => {
    const table = readKitTable(bytes(ZWEAPON!));
    const want = { small: Math.fround(0.04), large: { time: Math.fround(0.18), power: 175 } };
    for (const id of [171, 181, 185, 186]) expect(table.rounds.get(id)?.record.rumble, `round ${id}`).toEqual(want);
    expect(table.throwables?.get(121)?.record.rumble, 'M67').toEqual(want);
  });

  // j5t3o2iU (the owner's report, 2026-11-02: "a smoke throw vibrates as if hit by a grenade"): the throw's fire step
  // (`FUN_005c5340` D:L479540-479543 -> `FUN_005c3360` D:L477739-477751) gates the motors on the fired record's own
  // flags alone, no item class -- so a smoke's release rumbles by its record, as a frag's does.
  it("every throwable the disc's kit table holds -- the smokes AN-M8 122 and red 127 among them -- is the M67's 0.04 / 0.18 / 175", () => {
    const table = readKitTable(bytes(ZWEAPON!));
    const want = { small: Math.fround(0.04), large: { time: Math.fround(0.18), power: 175 } };
    const all = [...(table.throwables?.entries() ?? [])];
    expect(all.map(([id]) => id)).toEqual(expect.arrayContaining([121, 122, 127]));
    for (const [id, t] of all) expect(t.record.rumble, `throwable ${id} ${t.record.name}`).toEqual(want);
  });
});
