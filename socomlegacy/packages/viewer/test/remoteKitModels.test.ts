import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { itemClass } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadMap } from '../src/loadMap';
import { setRemoteMap } from '../src/matchCore';
import { DEFAULT_LIGHTING } from '../src/lighting';
import type { SideKit } from '../src/remotePlayers';
import type { WorldView } from '../src/world';

/**
 * NU-6 P1, the dev-disc case (research 324 §1.1, §6 P1; NU.R1 "including picked-up weapons"): a weapon of the other
 * side's kit, taken up, is drawn from its own record's model -- the kit's fill makes each slot's instance from the
 * record's model name (`FUN_00599f00` D:L455793-455817, `FUN_005c72c0` D:L480077-480121), with no side read -- so the
 * page's `kitOf` (`./matchCore` `setRemoteMap`) must resolve a Terrorist's AK-47 for a SEAL seat, and a SEAL's M4A1 for
 * a Terrorist seat, to a model the map's weapon library builds (`LoadedMap.weapons`, which `WorldView.held` draws).
 * Frostfire (`RUN/MP2.ZDB`, the copied fixture); skipped, and said, without it. No behaviour change: a pin.
 */
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

describe(`NU-6 P1: a cross-side weapon's model resolves for either side's seat${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)("Frostfire: kitOf hangs the AK-47 and TERRORIST 1's primary on a SEAL seat and the SEAL's M4A1 on a Terrorist seat, each its record's model, built by the map's library", async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const items = map.arsenal!.table.arsenal.items;
    const ak47 = items.get(58)!, m4 = items.get(54)!;
    expect([itemClass(58), itemClass(54)]).toEqual(['rifle', 'rifle']);
    expect(map.arsenal!.map!.kits.seal[0]!.loadout[0]).toBe(54);                       // the SEAL's own primary
    const tKit = map.arsenal!.map!.kits.terrorist[0]!.loadout, tPrimary = items.get(tKit[0])!;   // TERRORIST 1's
    expect(tKit[0]).not.toBe(54);
    for (const m of [ak47.model!, m4.model!, tPrimary.model!]) expect(map.weapons![m]!.parts.length).toBeGreaterThan(0);
    // `WorldView.held` stands in: a node named for each model the map built, none for another.
    const view = { held: (model: string) => (map.weapons?.[model]?.parts.length ? Object.assign(new Group(), { name: model }) : null) } as unknown as WorldView;
    const got: { kitOf: SideKit | null } = { kitOf: null };
    setRemoteMap({ setMap: (_m, _l, k) => { got.kitOf = k; } }, map, DEFAULT_LIGHTING, () => view);
    const seal = got.kitOf!('seal', [58, 15, 121, 126, 194], 0);
    expect([seal.rifle?.object.name, seal.pistol?.object.name, seal.ids]).toEqual([ak47.model, items.get(15)!.model, [58, 15]]);
    const terrorist = got.kitOf!('terrorist', [54, 15, 121, 255, 255], 0);
    expect([terrorist.rifle?.object.name, terrorist.ids]).toEqual([m4.model, [54, 15]]);
    // TERRORIST 1's own primary, taken by a SEAL seat into its kit's slot 0.
    const taken = got.kitOf!('seal', [tKit[0], 15, 121, 126, 194], 0);
    expect([taken.rifle?.object.name, taken.ids?.[0]]).toEqual([tPrimary.model, tKit[0]]);
  }, 120_000);

  // NU-6 F2 (the review of 384b7d288): the kit's rocket launcher has its own field on the callback -- the kit's first
  // launcher's record's model (`FUN_005c6a40` D:L479823 / D:L479872-479876), never a firearm slot's -- so a page draws the
  // LAW's and the RPG-7's own models on the launcher node, and none for a kit without one.
  it.skipIf(!MP2)("Frostfire: kitOf names the kit's launcher -- AT4 for the LAW (145), RPG7 for the RPG-7 (146), built by the map's library; none without one", async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB');
    const items = map.arsenal!.table.arsenal.items;
    expect([items.get(145)!.model, items.get(146)!.model]).toEqual(['AT4', 'RPG7']);
    for (const m of ['AT4', 'RPG7']) expect(map.weapons![m]!.parts.length).toBeGreaterThan(0);
    const view = { held: (model: string) => (map.weapons?.[model]?.parts.length ? Object.assign(new Group(), { name: model }) : null) } as unknown as WorldView;
    const got: { kitOf: SideKit | null } = { kitOf: null };
    setRemoteMap({ setMap: (_m, _l, k) => { got.kitOf = k; } }, map, DEFAULT_LIGHTING, () => view);
    /** The callback's `launcher`: its model's name, null for none, 'absent' when the callback names no such field. */
    const launcherOf = (k: object): string | null => {
      const l = (k as { launcher?: { object: { name: string } } | null }).launcher;
      return l === undefined ? 'absent' : l?.object.name ?? null;
    };
    expect(launcherOf(got.kitOf!('seal', [54, 15, 145, 185, 255], 0))).toBe('AT4');
    expect(launcherOf(got.kitOf!('terrorist', [58, 15, 146, 186, 255], 0))).toBe('RPG7');
    expect(launcherOf(got.kitOf!('seal', [54, 15, 121, 126, 194], 0))).toBeNull();
    expect(got.kitOf!('seal', [54, 15, 145, 185, 255], 0).rifle?.object.name).toBe(items.get(54)!.model);   // the rifle stays the rifle
  }, 120_000);
});
