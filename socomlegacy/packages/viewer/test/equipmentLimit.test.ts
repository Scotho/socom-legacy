import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, readZarMembers, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { arsenalOf, decodeUiSet, parseAnimSets, VALVE_OF_ITEM, type Loadout, type Side, type UiProgram } from '@s2u/scene';
import { equipmentLimit, equipmentLimitKit, equipmentLimitValves } from '../src/equipmentLimit';
import { UiRunner } from '../src/uiScript';

/** Research 362 §2: one shared original UI archive, not an all-map traversal. */
const DISC = process.env.SOCOM_DISC;
const present = !!DISC && ['RUN/UIZANIM.ZAR', 'RUN/ZWEAPON.ZAR'].every((p) => existsSync(resolve(DISC, p)));
const BASE: Loadout = [54, 15, 121, 126, 255];

describe('equipment-limit compatibility and source distinctions', () => {
  it('defaults absent/invalid additive metadata to unrestricted', () => {
    expect([undefined, null, 0, -1, 5, 1.2, '2'].map(equipmentLimit)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect([1, 2, 3, 4].map(equipmentLimit)).toEqual([1, 2, 3, 4]);
    const v = new Map([['Enable_c4', 17]]);
    expect(equipmentLimitValves(v, 0)).toBe(v);
    expect(equipmentLimitKit(BASE, v, 'seal', 0)).toBe(BASE);
  });
  it('shotgun mode leaves pistol/map-specific valves intact, while the secondary is FULL_SLOT; C4 thresholds are side-specific', () => {
    const v = new Map([['Enable_Mark23', 8], ['Enable_c4', 17], ['Enable_F2000HE', 9], ['Enable_red_smoke', 8]]);
    const restricted = equipmentLimitValves(v, 2);
    expect([restricted.get('Enable_Mark23'), restricted.get('Enable_c4'), restricted.get('Enable_F2000HE'), restricted.get('Enable_red_smoke')]).toEqual([8, 17, 9, 8]);
    expect(equipmentLimitKit(BASE, v, 'seal', 2)).toEqual([81, 254, 194, 122, 151]);
    expect(equipmentLimitKit(BASE, v, 'terrorist', 2)).toEqual([83, 254, 194, 122, 254]);
    expect(v.has('Enable_spas')).toBe(false);
  });
});

describe.skipIf(!present)(`equipment mode transcription against original scripts${present ? '' : ' (SOCOM_DISC absent)'}`, () => {
  let cached: Promise<{ programs: Map<string, UiProgram>; names: ReadonlyMap<string, { id: number }> }> | null = null;
  const source = () => cached ??= (async () => {
    const s = new FsAssetSource(DISC!);
    const sets = parseAnimSets(Zar.parse(await s.read('RUN/UIZANIM.ZAR')));
    const set = sets.sets.find((x) => x.name.toLowerCase() === 'dlggamelobby.rdr')!;
    const bytes = (await readZarMembers(s, 'RUN/ZWEAPON.ZAR', ['zweapon.rdr'])).get('zweapon.rdr')!;
    return { programs: decodeUiSet(set), names: arsenalOf(parseRdr(bytes)).byName };
  })();

  it.each([1, 2, 3, 4])('EQlimit %i rewrites exactly the valves in SetMPWeaponValves', async (mode) => {
    const { programs } = await source();
    const p = programs.get('setmpweaponvalves') ?? [...programs.values()].find((x) => x.name === 'SetMPWeaponValves')!;
    const keys = new Set([...VALVE_OF_ITEM.values(), 'Enable_LasDes', 'Enable_RPG_ammo']);
    for (const seq of p.sequences) for (const op of seq.ops) if (op.op === 'valve') keys.add(op.valve);
    // Seed distinct nonzero map values, so a missing rewrite or an extra blanket rewrite is observable.
    const initial = new Map([...keys].map((name, i) => [name, i + 20]));
    const r = new UiRunner([p], [], { command: () => true });
    for (const [name, value] of initial) r.setValve(name, value);
    r.setValve('EQlimit', mode); r.start(p.name); r.step(0);
    const actual = equipmentLimitValves(initial, mode);
    for (const key of keys) expect(actual.get(key), key).toBe(r.valve(key));
  });

  it.each([1, 2, 3, 4])('EQlimit %i gives all eight characters the original forced kit, including each C4 boundary', async (mode) => {
    const { programs, names } = await source();
    const p = [...programs.values()].find((x) => x.name === 'SetMPCharWeaponValves')!;
    const slot: Record<string, number> = { ChoosePrimary: 0, ChooseSecondary: 1, ChooseEquip1: 2, ChooseEquip2: 3, ChooseEquip3: 4 };
    for (const c4 of [0, 9, 10, 17, 18, 49]) {
      const kits = Array.from({ length: 8 }, () => [...BASE]);
      const r = new UiRunner([p], [], { command: (cmd, runner) => {
        const at = slot[cmd.fn ?? ''];
        if (at === undefined) return true;
        const item = cmd.arg === 'FULL_SLOT' ? 254 : names.get(cmd.arg)?.id;
        expect(item, cmd.arg).toBeDefined();
        const mask = runner.valve('UiCharSet');
        kits.forEach((kit, i) => { if ((mask & (1 << i)) !== 0) kit[at] = item!; });
        return true;
      } });
      r.setValve('EQlimit', mode); r.setValve('Enable_c4', c4); r.setValve('MpCharSet', 1);
      r.start(p.name); r.step(0);
      for (const [i, kit] of kits.entries()) {
        const side: Side = i < 4 ? 'seal' : 'terrorist';
        expect(equipmentLimitKit(BASE, new Map([['Enable_c4', c4]]), side, mode), `${side} ${i % 4}, C4 ${c4}`).toEqual(kit);
      }
    }
  });
});
