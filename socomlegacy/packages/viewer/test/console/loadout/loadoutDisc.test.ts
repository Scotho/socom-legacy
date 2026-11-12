import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { FIXTURES_ABSENT } from '../../../../archive/test/fixtures';
import { armoryFromDisc } from '../../../src/armoryData';
import type { Loadout } from '@s2u/scene';
import { profileOf, rowUi } from '../../../src/armoryState';
import { readArmoryItemNames, readMissionList } from '../../../src/modern/discAssets';
import { armoryContextOf, chooseItem, columnsOf, kitOf, missionRowsOf, openEditor, recordOf, slotChoices } from '../../../src/console/loadoutModel';
import { missionMapPath } from '../../../src/lobbyMatch';
import { expectedPresses, fewestPresses, labelHolds } from './pressSearch';

/**
 * MU-13f on the disc's data (the fixture tree `npm run extract-maps` writes; skipped, and said, without it): the editor's
 * context is the game lobby's read of a first-release map, and every slot offers exactly the items some run of the
 * ARMORY's Left / Right presses shows (`./pressSearch`'s independent search), by the fewest presses, each named by the
 * disc's caption -- from every type's kit and every kit one listed choice leaves.
 */
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../../../test-fixtures');
/** How many kits a side is held to the search over (the closure's first, breadth first). */
const KITS_PER_SIDE = 600;
const MISSIONS = ['MP2', 'MP6', 'MP7', 'MP51', 'MP72'].filter((m) => existsSync(resolve(FIXTURES, `RUN/${m}.ZDB`)));   // DF-11: MP6 (Desert Glory's release; its fixture is committed)
const present = MISSIONS.length > 0 && ['RUN/UIZANIM.ZAR', 'RUN/UI/READERC.ZAR', 'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/ZWEAPON.ZAR']
  .every((p) => existsSync(resolve(FIXTURES, p)));

describe.skipIf(!present)(`the loadout editor on the fixture tree's maps${present ? ` (${MISSIONS.join(', ')})` : ` (${FIXTURES_ABSENT})`}`, () => {
  const source = (): FsAssetSource => new FsAssetSource(FIXTURES);

  for (const mission of MISSIONS) {
    it(`${mission}: both sides, every slot offers what any run of presses shows (an independent search), each named by the disc`, async () => {
      const data = await armoryFromDisc(source(), missionMapPath(mission)!, mission, { models: false, world: true });
      const names = await readArmoryItemNames(source());
      let cases = 0;
      for (const side of ['seal', 'terrorist'] as const) {
        const ctx = armoryContextOf(data, side);
        expect(ctx, `${mission} ${side}`).not.toBeNull();
        expect(columnsOf(ctx!).length).toBeGreaterThanOrEqual(3);
        // The kits the editor can come to hold: the types' kits, closed under every row's choices breadth first, the
        // first KITS_PER_SIDE of them (the whole closure is ~34,000 kits a map, minutes of search: run once by hand).
        const starts = new Map<string, Loadout>(ctx!.kits.map((k) => [k.join(','), k]));
        for (let todo = [...starts.values()]; todo.length > 0 && starts.size < KITS_PER_SIDE;) {
          const k = todo.shift()!;
          for (let row = 1; row <= 5; row++) for (const r of slotChoices(ctx!, k, row).reach.values()) {
            if (!starts.has(r.kit.join(','))) { starts.set(r.kit.join(','), r.kit); todo.push(r.kit); }
          }
        }
        cases += starts.size * 5;
        let offered = 0;
        for (const start of starts.values()) {
          for (let row = 1; row <= 5; row++) {
            const c = slotChoices(ctx!, start, row);
            const { cursorSkips, want } = expectedPresses(ctx!, start, row);
            expect(labelHolds(ctx!, start, row, c.fixed, cursorSkips), `${ctx!.side} ${start.join(',')} row ${row} label ${c.fixed}`).toBe(true);
            const at = `${mission} ${side} ${start.join(',')} row ${row}`;
            expect(new Set(c.options), at).toEqual(new Set([rowUi(start, row), ...want.keys()]));
            for (const [ui, n] of want) expect(c.reach.get(ui)!.presses.length, `${at} UI ${ui}`).toBe(n);
            // Every item a choice lands is named by the disc (UI 0, empty, and the fillers 252-255 a pick puts beside an item have no caption).
            for (const ui of c.reach.keys()) if (ui !== 0 && ui < 252) expect(names.get(ui), `${mission} ${side} UI ${ui}`).toBeTruthy();
            offered += want.size;
          }
        }
        // The review's case: MP72's terrorists, [81,7,146,194,186] row 3 offers UI 35.
        if (mission === 'MP72' && side === 'terrorist') {
          const k = [81, 7, 146, 194, 186] as unknown as Loadout;
          expect(slotChoices(ctx!, k, 3).options).toContain(35);
          expect(new Set(slotChoices(ctx!, k, 3).options)).toEqual(new Set([rowUi(k, 3), ...fewestPresses(ctx!, k, 3).keys()]));
        }
        expect(offered, `${mission} ${side}`).toBeGreaterThan(0);
        const e = openEditor(ctx!, null);
        for (let row = 1; row <= 5; row++) for (const ui of slotChoices(ctx!, kitOf(e), row).reach.keys()) {
          const chosen = chooseItem(ctx!, e, row, ui);
          expect(rowUi(kitOf(chosen), row)).toBe(ui);
          expect(recordOf(ctx!, chosen)).toEqual(profileOf(ctx!, chosen));
        }
      }
      console.log(`${mission}: ${cases} kit/row cases held to the independent search`);
    }, 300_000);
  }
});

/**
 * MU2-4: the editor's missions on the disc's own mission table (`RUN/READERC.ZAR :: missionlist.rdr`, read by the
 * opened image's `readMissionList`, `../../createGameHost` `missionsFromReaderc`): CREATE GAME's rows, in the table's
 * order and by its names -- the release's eight as `createGameCommands.test.ts` (packages/ui) reads them off the disc,
 * VIGILANCE, FISH HOOK, CROSSROADS, BLIZZARD, FROSTFIRE, DESERT GLORY, NIGHT STALKER, THE RUINS (V13-2, V13-3, DF-14) -- and
 * a served offer's maps in the same order, Medley and Random out.
 */
const TABLE_PRESENT = existsSync(resolve(FIXTURES, 'RUN/READERC.ZAR'));
describe.skipIf(!TABLE_PRESENT)(`the loadout editor's missions on the fixture tree's missionlist.rdr${TABLE_PRESENT ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('the release\'s eight in CREATE GAME\'s order and names; a served offer in the table\'s order', async () => {
    const table = await readMissionList(new FsAssetSource(FIXTURES));
    expect(table.filter((m) => m.multiplayer)).toHaveLength(22);
    expect(missionRowsOf(table, null).map((r) => [r.mission, r.name])).toEqual([
      ['MP51', 'Vigilance'], ['MP71', 'Fish Hook'], ['MP72', 'Crossroads'], ['MP1', 'Blizzard'], ['MP2', 'Frostfire'],
      ['MP6', 'Desert Glory'], ['MP7', 'Night Stalker'], ['MP12', 'The Ruins'],
    ]);
    const every = table.filter((m) => m.multiplayer).map((m) => m.number);
    expect(missionRowsOf(table, [...every].reverse().concat([0xfe, 0xff])).map((r) => r.number)).toEqual(every);
    expect(missionRowsOf(table, [7, 2]).map((r) => r.mission)).toEqual(['MP2', 'MP7']);
  });
});
