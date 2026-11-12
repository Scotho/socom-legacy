import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { ITEM, readKitTable, readMapArsenal } from '@s2u/scene';
import type { SimKits } from '../../src/loadout';
import { equipmentLimitKit, equipmentLimitValves } from '../../src/equipmentLimit';
import { ARSENAL_PRESETS, arsenalWith, EMPTY_ARSENAL } from '../../src/forge/arsenalSetting';

/**
 * Frostfire (MP2) off the disc: a map whose `mission.rdr` gives no side C4, LAW or RPG (`Enable_c4` 0, `Enable_LAW` 0,
 * `Enable_RPG` 0; `scene/test/golden/map-arsenals.json`), opened to breaching by the layout's arsenal. Its SEAL type 1
 * carries M4A1 / Mark 23 / M67 / HE / Double Ammo and its Terrorist type 4 M82A1A / Model 18 / M67 / PMN / HE
 * (`scene/test/arsenal.test.ts`), so slot 5 takes the C4 on both through the menu's rules.
 */
const ZWEAPON = fixture('RUN/ZWEAPON.ZAR'), READERC = fixture('RUN/READERC.ZAR'), MP2 = fixture('RUN/MP2.ZDB');
const present = !!(ZWEAPON && READERC && MP2);

describe.skipIf(!present)(`Frostfire opened to breaching by the layout's arsenal${present ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const table = present ? readKitTable(ZWEAPON!) : null;
  const kits: SimKits | null = table ? { table, map: readMapArsenal(table.arsenal, MP2!, READERC!) } : null;

  it('the disc gives no side C4, LAW or RPG on Frostfire', () => {
    for (const side of ['seal', 'terrorist'] as const) {
      expect(kits!.map!.selectable[side]).not.toContain(ITEM.C4);
      expect(kits!.map!.selectable[side]).not.toContain(ITEM.LAW);
      expect(kits!.map!.selectable[side]).not.toContain(ITEM.RPG7);
    }
  });

  it('Breaching and Launchers make C4, the LAW and the RPG-7 every side\'s pick; the C4 kit puts it in slot 5', () => {
    let s = EMPTY_ARSENAL;
    for (const p of ARSENAL_PRESETS) s = p.apply(s, kits!.map!.valves);
    const out = arsenalWith(kits, s);
    const m = out.kits!.map!;
    for (const side of ['seal', 'terrorist'] as const) {
      expect(m.selectable[side]).toEqual(expect.arrayContaining([ITEM.C4, ITEM.LAW, ITEM.RPG7]));
      // Every type either carries the C4 or is named as refused (a cost-2 item's partner in slot 5 is locked).
      for (const k of m.kits[side]) {
        const named = out.refused.some((r) => r.includes(k.type));
        expect([k.type, k.loadout[4] === ITEM.C4 || named]).toEqual([k.type, true]);
      }
    }
    expect(m.kits.seal[0]!.loadout[4]).toBe(ITEM.C4);
    expect(m.kits.terrorist[3]!.loadout[4]).toBe(ITEM.C4);
    // CREATE GAME's No Bombs over the layout's valves (research 362): the explosives' valves are its to close.
    const nb = equipmentLimitValves(m.valves, 4);
    expect(nb.get('Enable_LAW')).toBe(0);
    expect(nb.get('Enable_c4')).toBe(9);                                         // unmentioned by the script: the layout's
    expect(equipmentLimitKit(m.kits.seal[0]!.loadout, m.valves, 'seal', 4)[4]).toBe(122);   // 9 is not > 9: no C4 kit
  });
});
