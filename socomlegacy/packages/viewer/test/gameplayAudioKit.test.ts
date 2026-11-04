import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { applyPicks, ITEM, menuValves, readMapArsenal, slotLocked, type MapArsenal } from '@s2u/scene';
import { loadKitSource, type KitSource } from '../src/loadout';
import { pouchOf } from '../src/equipment';
import { prepareAudioKit } from '../e2e/gameplayAudioKit';

const disc = process.env.SOCOM_DISC;
const names = disc && existsSync(join(disc, 'RUN')) ? readdirSync(join(disc, 'RUN')).filter(n => /^MP\d+\.ZDB$/i.test(n)).sort() : [];
describe.skipIf(!disc || !names.length)('audio browser fixture kits from the supplied disc', () => {
  let source: FsAssetSource, kits: KitSource;
  const maps = new Map<string, MapArsenal>();
  beforeAll(async () => { expect(names).toHaveLength(22); source = new FsAssetSource(disc!); kits = (await loadKitSource(source))!; expect(kits).not.toBeNull(); });
  async function map(name: string) {
    if (!maps.has(name)) maps.set(name, readMapArsenal(kits.table.arsenal, await source.read(`RUN/${name}.ZDB`), kits.readerc));
    return maps.get(name)!;
  }
  for (const name of ['MP61', 'MP62', 'MP73']) it(`${name}: the old three-slot fixture overwrites mandatory C4; the plan retains it`, async () => {
    // RUN/<map>.ZDB :: READERM.ZAR/mission.rdr Enable_c4; chartype.rdr
    // and RUN/READERC.ZAR :: character.rdr establish the original default kit.
    const m = await map(name), base = m.kits.seal[0]!.loadout;
    expect(base[4]).toBe(ITEM.C4);
    expect(applyPicks(kits.table.arsenal, m.valves, 'seal', base, [{ slot: 2, id: 121 }, { slot: 3, id: 122 }, { slot: 4, id: 123 }])).toEqual({ refused: 'locked', at: 2 });
    expect(prepareAudioKit(kits.table.arsenal, m.valves, 'seal', base, 123).kit[4]).toBe(ITEM.C4);
  });
  for (const file of names) for (const side of ['seal', 'terrorist'] as const) it(`${file}/${side}: all four original character kits support each audio case without losing locked equipment`, async () => {
    const m = await map(file.replace(/\.ZDB$/i, ''));
    expect(m.kits[side]).toHaveLength(4);
    // IDs and quantities are checked against RUN/ZWEAPON.ZAR's original table.
    for (const { loadout: base } of m.kits[side]) for (const [target, kind] of [[121, 'M67'], [126, 'HE'], [122, 'AN-M8'], [123, 'Mark141']] as const) {
      const plan = prepareAudioKit(kits.table.arsenal, m.valves, side, base, target);
      expect(applyPicks(kits.table.arsenal, m.valves, side, base, plan.picks)).toEqual({ loadout: plan.kit });
      expect(plan.kit.slice(0, 2)).toEqual(base.slice(0, 2));
      for (let slot = 2; slot <= 4; slot++) if (slotLocked(menuValves(m.valves, base[0]), side, base, slot)) expect(plan.kit[slot]).toBe(base[slot]);
      expect(plan.kit.slice(2)).toContain(target);
      expect(pouchOf(plan.kit, kits.table)[kind]).toBeGreaterThan(0);
      if (base.slice(2).includes(target)) { expect(plan.picks).toEqual([]); expect(plan.kit).toEqual(base); }
    }
  });
  it('fails closed when every equipment slot is locked, or the target is not a supported audio-case grenade', async () => {
    const m = await map('MP61'), base = m.kits.seal[0]!.loadout;
    expect(() => prepareAudioKit(kits.table.arsenal, m.valves, 'seal', [base[0], base[1], ITEM.C4, ITEM.C4, ITEM.C4], 123)).toThrow();
    expect(() => prepareAudioKit(kits.table.arsenal, m.valves, 'seal', base, -1)).toThrow();
    const forbidden = new Map(m.valves); forbidden.set('Enable_HEgren', 0);
    expect(() => prepareAudioKit(kits.table.arsenal, forbidden, 'seal', base, 126)).toThrow('no legal audio fixture kit');
  });
});
