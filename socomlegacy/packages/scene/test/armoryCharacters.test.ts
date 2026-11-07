import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, zdbMember, Zar, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  ARMORY_COLUMNS, ARMORY_TYPES_PER_SIDE, armoryRoster, armoryTypeAllowed, arsenalOf, assetLibStem, CAMPAIGN_UNLOCK_VALVES,
  CAMPAIGN_UNLOCKS_EARNED_RULING, campaignUnlockValves, DEFAULT_ARMORY_TYPE, fourthArmoryTypeOpen, FOURTH_UNLOCK_READING, missionUiVarEntries, missionUiVars, parseCharacterTable, readArsenal, uiVehicleNames, type ArmoryRoster, type Arsenal,
} from '../src/index';

/**
 * The ARMORY's eight columns per map (web sprint 5, S1; socomlegacy/docs/research/95 §6): each type's body, kit and
 * portrait, from hand-built scripts and then from the fixture maps.
 */

const weapon = (id: number, name: string): RdrNode => ['InternalName', [name], 'ID', [String(id)], 'DisplayName', [name]];
const arsenal: Arsenal = arsenalOf([['ZWEAPON', [weapon(54, 'M4A1'), weapon(15, 'Mark 23'), weapon(121, 'M67')], 'ZAMMO', [['InternalName', ['x']]]]]);
const character: RdrNode = [[
  'characters', [
    'basic_seal', ['model_name', ['seal_A.xsi'], 'texture_asset', ['jnglseal'], 'default_weapons', [['wep_name', ['M4A1']], ['wep_name', ['Mark 23']], ['wep_name', ['M67']]]],
    'mpx_seal1', ':', 'basic_seal', [],
    'mpx_seal2', ':', 'basic_seal', ['model_name', ['seal_E.xsi']],
    'mpx_terror1', ['model_name', ['al_gman01.xsi'], 'texture_asset', ['algunman'], 'default_weapons', [['wep_name', ['Mark 23']]]],
  ],
]];
const chartype: RdrNode = [[
  'navyseals', [['name', ['Seal1'], 'character', ['mpx_seal1']], ['name', ['Seal2'], 'character', ['mpx_seal2']]],
  'terrorists', ['name', ['Terrorist1'], 'character', ['mpx_terror1']],
]];
const mission: RdrNode = [[
  'description', ['X'],
  'UiVars', [
    ['NAME', ['EQUIPMENT_LIBRARY'], 'VALUE', ['ui/assetlib/eq/em02']], ['NAME', ['mission_title'], 'VALUE', ['FROSTFIRE']],
    ['NAME', ['Seal1'], 'VALUE', ['Seal1_scuba.tif']], ['NAME', ['Seal2'], 'VALUE', ['Seal2_scuba.tif']], ['NAME', ['Terr1'], 'VALUE', ['terr1_mp2.tif']],
    ['NAME', ['Seal1'], 'VALUE', ['second.tif']],
  ],
]];

describe('the ARMORY roster on hand-built scripts', () => {
  it('reads mission.rdr\'s UiVars, the first of a repeated name kept', () => {
    const vars = missionUiVars(mission);
    expect(vars.get('Seal1')).toBe('Seal1_scuba.tif');
    expect(vars.get('EQUIPMENT_LIBRARY')).toBe('ui/assetlib/eq/em02');
    expect(missionUiVars([['description', ['X']]]).size).toBe(0);
  });

  it('a column is its type by its UiVehicles name (UiCharType<n>, FUN_002af8c0 -> FUN_0053b4b0), not by chartype position', () => {
    const table = parseCharacterTable(character);
    const vehicles = (...names: string[]): RdrNode => [[...(mission as RdrNode[])[0] as RdrNode[], 'UiVehicles', names.map((n) => ['Name', [n]])]];
    expect(uiVehicleNames(vehicles('Seal2', 'Seal1', 'x', 'y', 'Terrorist1'))).toEqual(['Seal2', 'Seal1', 'x', 'y', 'Terrorist1']);
    expect(uiVehicleNames(mission)).toEqual([]);
    // UiVehicles swaps the two SEALs: column Seal1 is type Seal2 (index 1), and the other way round.
    const swapped = armoryRoster(arsenal, vehicles('seal2', 'Seal1', 'Seal3', 'Seal4', 'Terrorist1'), chartype, character, table);
    expect(swapped.characters.map((c) => [c.column, c.index, c.type, c.model])).toEqual([
      ['Seal1', 1, 'Seal2', 'seal_E'], ['Seal2', 0, 'Seal1', 'seal_A'], ['Terr1', 0, 'Terrorist1', 'al_gman01'],
    ]);
    // A name the side does not list, or no UiVehicles at all: the chartype position.
    const unknown = armoryRoster(arsenal, vehicles('Nobody', 'Seal2', 'x', 'x', 'Seal1'), chartype, character, table);
    expect(unknown.characters.map((c) => [c.column, c.index])).toEqual([['Seal1', 0], ['Seal2', 1], ['Terr1', 0]]);
  });

  it('LOBBY-MAPNAME: missionUiVarEntries reads each UiVars entry as CUIVariableSpec does -- the LONGEVITY word kept, a two-element VALUE an array, a one-element VALUE its typed node, an entry with no NAME skipped', () => {
    const s = (value: string) => ({ type: 'string', value } as const);
    const typed = [[s('UiVars'), [
      [s('NAME'), [s('kept')], s('VALUE'), [s('A')], s('LONGEVITY'), [s('PERMANENT')]],
      [s('NAME'), [s('pair')], s('VALUE'), [{ type: 'int', value: 3 } as const, { type: 'real', value: 0.5 } as const]],
      [s('VALUE'), [s('nameless')]],
      [s('NAME'), [s('progress')], s('VALUE'), [{ type: 'real', value: 25 } as const]],
      [s('NAME'), [s('empty')]],
    ]]];
    expect(missionUiVarEntries(typed)).toEqual([
      { name: 'kept', value: { type: 'string', value: 'A' }, longevity: 'PERMANENT' },
      { name: 'pair', value: { type: 'array', value: [{ type: 'int', value: 3 }, { type: 'real', value: 0.5 }] } },
      { name: 'progress', value: { type: 'real', value: 25 } },
      { name: 'empty', value: null },
    ]);
    expect(missionUiVarEntries([[s('Other'), [s('x')]]])).toEqual([]);
  });

  it('names an asset library\'s file as FUN_003199c0 does: the last element, four characters, upper case', () => {
    expect(assetLibStem('ui/assetlib/eq/em02')).toBe('EM02');
    expect(assetLibStem('ui/assetlib/uimp')).toBe('UIMP');
    expect(assetLibStem('//common/assetlib/weapons')).toBe('WEAP');
  });

  it('builds each column from chartype, character and UiVars: type, body, kit, portrait', () => {
    const table = parseCharacterTable(character);
    const r = armoryRoster(arsenal, mission, chartype, character, table);
    expect([r.equipmentLibrary, r.equipmentStem, r.missionTitle]).toEqual(['ui/assetlib/eq/em02', 'EM02', 'FROSTFIRE']);
    expect(r.characters).toEqual([
      { column: 'Seal1', side: 'seal', index: 0, type: 'Seal1', character: 'mpx_seal1', model: 'seal_A', textures: ['jnglseal'], loadout: [54, 15, 121, 255, 255], portrait: 'Seal1_scuba.tif' },
      { column: 'Seal2', side: 'seal', index: 1, type: 'Seal2', character: 'mpx_seal2', model: 'seal_E', textures: ['jnglseal'], loadout: [54, 15, 121, 255, 255], portrait: 'Seal2_scuba.tif' },
      { column: 'Terr1', side: 'terrorist', index: 0, type: 'Terrorist1', character: 'mpx_terror1', model: 'al_gman01', textures: ['algunman'], loadout: [15, 255, 255, 255, 255], portrait: 'terr1_mp2.tif' },
    ]);
    expect(ARMORY_COLUMNS).toHaveLength(8);
    expect(DEFAULT_ARMORY_TYPE).toEqual({ seal: 0, terrorist: 0 });
  });
});

describe('which type a player may be (web sprint 5 S2; research 95 §3.1-§3.2, R95.5, R95.6 as corrected)', () => {
  const kits = { seal: [1, 2, 3, 4, 5], terrorist: [1, 2, 3, 4] };
  const at = (aop: number | null) => ({ kits, valves: new Map(aop === null ? [] : [['InWhichAOP', aop]]) });
  it('is one of the side\'s columns the map lists, at most four; the fourth open on a map whose InWhichAOP is 0', () => {
    expect(ARMORY_TYPES_PER_SIDE).toBe(4);
    expect([0, 1, 2, 3].map((i) => armoryTypeAllowed(at(0), 'seal', i))).toEqual([true, true, true, true]);
    expect(armoryTypeAllowed(at(0), 'seal', 4)).toBe(false);                // a fifth chartype entry is no column
    expect([0, 1, 2].map((i) => armoryTypeAllowed({ kits: { seal: [1], terrorist: [1, 2] }, valves: new Map() }, 'terrorist', i))).toEqual([true, true, false]);
  });
  it('the original locks the fourth on a campaign map (InWhichAOP 50/60/70/80: the owner\'s Crossroads capture, ALG OFFICER LOCKED) -- the rule with the ruling off', () => {
    for (const aop of [50, 60, 70, 80]) {
      expect(fourthArmoryTypeOpen(at(aop).valves, false), String(aop)).toBe(false);
      for (const side of ['seal', 'terrorist'] as const) {
        expect([0, 1, 2, 3].map((i) => armoryTypeAllowed(at(aop), side, i, false)), `${aop} ${side}`).toEqual([true, true, true, false]);
      }
    }
    expect(fourthArmoryTypeOpen(at(0).valves, false)).toBe(true);
    expect(fourthArmoryTypeOpen(at(null).valves, false)).toBe(true);       // a mission with no InWhichAOP: the menu's 0
    expect(fourthArmoryTypeOpen(at(40).valves, false)).toBe(false);        // no UnlockMPChar row: locked, as before
    expect(FOURTH_UNLOCK_READING).toBe(0);                                 // the viewer holds no campaign: Set<Name> 0
    expect([...campaignUnlockValves(false).values()]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('OT.R91 (the owner, 2026-10-31): every campaign unlockable earned -- the eight Set<Name> valves read 1, the fourth open on 50-80', () => {
    expect(CAMPAIGN_UNLOCKS_EARNED_RULING).toBe(true);
    expect(CAMPAIGN_UNLOCK_VALVES).toEqual(['SetSabre', 'SetPius', 'SetFeral', 'SetQuixada', 'SetReaver', 'SetOfficer', 'SetSpecialist', 'SetValeska']);
    expect([...campaignUnlockValves()]).toEqual(CAMPAIGN_UNLOCK_VALVES.map((n) => [n, 1]));
    for (const aop of [0, 50, 60, 70, 80, null]) {
      expect(fourthArmoryTypeOpen(at(aop).valves), String(aop)).toBe(true);
      for (const side of ['seal', 'terrorist'] as const) {
        expect([0, 1, 2, 3].map((i) => armoryTypeAllowed(at(aop), side, i)), `${aop} ${side}`).toEqual([true, true, true, true]);
      }
    }
    expect(fourthArmoryTypeOpen(at(40).valves)).toBe(false);               // the ruling earns UnlockMPChar's rows, no other
    expect(armoryTypeAllowed(at(70), 'seal', 4)).toBe(false);              // still at most four columns
  });
  it('refuses what is not a whole index, and without the map\'s table allows the default alone', () => {
    for (const bad of [-1, 1.5, '1', null, undefined, NaN]) expect(armoryTypeAllowed(at(0), 'seal', bad)).toBe(false);
    expect(armoryTypeAllowed(null, 'seal', DEFAULT_ARMORY_TYPE.seal)).toBe(true);
    expect(armoryTypeAllowed(null, 'terrorist', 1)).toBe(false);
  });
});

/**
 * OT.R91 on every MP map, from the maps' own valves and kits as `weaponTable.parity.test.ts` pins them off each map's
 * `READERM.ZAR` (`golden/map-arsenals.json`; that file's data half re-reads the pin off the disc): on each map whose
 * `InWhichAOP` is not 0 (MP51-53, MP61/62/64, MP71-73, MP81-83) the fourth type is open for both sides; with the
 * ruling off, the original's lock.
 */
describe('OT.R91 on every campaign-AOP MP map (golden/map-arsenals.json, pinned off the disc)', () => {
  type Pinned = { valves: Record<string, number>; kits: Record<'seal' | 'terrorist', unknown[]> };
  const pin = JSON.parse(readFileSync(resolve(import.meta.dirname, 'golden', 'map-arsenals.json'), 'utf8')) as { maps: Record<string, Pinned> };
  const campaign = Object.entries(pin.maps).filter(([, m]) => (m.valves.InWhichAOP ?? 0) !== 0).map(([n]) => n);
  it('names the twelve maps', () => {
    expect(campaign).toEqual(['MP51', 'MP52', 'MP53', 'MP61', 'MP62', 'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83']);
  });
  it.each(campaign)('%s: the fourth type open for both sides (the ruling); locked with the ruling off (the original)', (name) => {
    const m = pin.maps[name]!, map = { kits: m.kits, valves: new Map(Object.entries(m.valves)) };
    expect(fourthArmoryTypeOpen(map.valves)).toBe(true);
    expect(fourthArmoryTypeOpen(map.valves, false)).toBe(false);
    for (const side of ['seal', 'terrorist'] as const) {
      expect(armoryTypeAllowed(map, side, 3), side).toBe(true);
      expect(armoryTypeAllowed(map, side, 3, false), side).toBe(false);
    }
  });
});

const ZWEAPON = fixture('RUN/ZWEAPON.ZAR'), READERC = fixture('RUN/READERC.ZAR');
const MAPS = { MP2: fixture('RUN/MP2.ZDB'), MP72: fixture('RUN/MP72.ZDB') };
const absent = ZWEAPON === null || READERC === null || MAPS.MP2 === null || MAPS.MP72 === null;

describe.skipIf(absent)(`the ARMORY roster on the fixture maps${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const roster = (stem: keyof typeof MAPS): { roster: ArmoryRoster; em: string[] } => {
    const bytes = MAPS[stem]!, toc = parseZdb(bytes);
    const rm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
    const script = (n: string) => parseRdr(rm.data(rm.root.children.find((k) => k.name.toLowerCase() === n)!));
    const rc = Zar.parse(READERC!);
    const chr = parseRdr(rc.data(rc.find('character.rdr')!));
    const r = armoryRoster(readArsenal(ZWEAPON!), script('mission.rdr'), script('chartype.rdr'), chr, parseCharacterTable(chr));
    const em = Zar.parse(zdbMember(bytes, toc, `${r.equipmentStem}_TXR.ZED`)).find('textures')!.children.map((k) => k.name);
    return { roster: r, em };
  };

  it('Frostfire (MP2): eight columns, their bodies, kits and portraits in EM02\'s order (R95.13)', () => {
    const { roster: r, em } = roster('MP2');
    expect([r.equipmentStem, r.missionTitle]).toEqual(['EM02', 'FROSTFIRE']);
    expect(r.characters.map((c) => [c.column, c.character, c.model, c.portrait])).toEqual([
      ['Seal1', 'mp2_seal1', 'seal_A_scuba', 'Seal1_scuba.tif'], ['Seal2', 'mp2_seal2', 'seal_E_scuba', 'Seal2_scuba.tif'],
      ['Seal3', 'mp2_seal3', 'seal_D_scuba', 'Seal3_scuba.tif'], ['Seal4', 'mp2_seal4', 'seal_C_scuba', 'Seal4_scuba.tif'],
      ['Terr1', 'mp2_terror1', 'al_gman01', 'terr1_mp2.tif'], ['Terr2', 'mp2_terror2', 'al_gman02', 'terr2_mp2.tif'],
      ['Terr3', 'mp2_terror3', 'al_leader', 'terr3_mp2.tif'], ['Terr4', 'mp2_terror4', 'al_captain', 'terr4_mp2.tif'],
    ]);
    expect(r.characters[0]!.loadout).toEqual([54, 15, 121, 126, 194]);          // M4A1, Mark 23, M67, HE, Double Ammo Load
    expect(em).toEqual(r.characters.map((c) => c.portrait));
  });

  it.each(['MP2', 'MP72'] as const)('%s: UiVehicles names the columns in chartype.rdr\'s order (the columns by name and by position agree)', (stem) => {
    const bytes = MAPS[stem]!, toc = parseZdb(bytes);
    const rm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
    const script = (n: string) => parseRdr(rm.data(rm.root.children.find((k) => k.name.toLowerCase() === n)!));
    expect(uiVehicleNames(script('mission.rdr'))).toEqual(['Seal1', 'Seal2', 'Seal3', 'Seal4', 'Terrorist1', 'Terrorist2', 'Terrorist3', 'Terrorist4']);
    const { roster: r } = roster(stem);
    expect(r.characters.map((c) => c.index)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(r.characters.map((c) => c.type)).toEqual(uiVehicleNames(script('mission.rdr')));
  });

  it('Crossroads (MP72): the 4th of each side is the campaign\'s unlockable -- SAS_01 and alg_officer (§6)', () => {
    const { roster: r, em } = roster('MP72');
    expect(r.equipmentStem).toBe('EM72');
    expect(r.characters[3]).toMatchObject({ column: 'Seal4', model: 'SAS_01', portrait: 'sas2_alb.tif' });
    expect(r.characters[7]).toMatchObject({ column: 'Terr4', model: 'alg_officer', portrait: 'Terr_Alg_leader.tif' });
    expect(em).toEqual(r.characters.map((c) => c.portrait));
  });
});
