// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, ITEM, type Loadout, type MapArsenal } from '@s2u/scene';
import type { SimKits } from '../../src/loadout';
import { DEFAULT_SETTINGS, type ArsenalSetting } from '../../src/forge/layout';
import { buildArsenalSection } from '../../src/forge/panels/arsenalSection';
import { buildSettings, formatSetting, MAP_SETTING_ROWS, settingsMenuSection, type SettingsMenuHooks } from '../../src/forge/panels/settingsPanel';

/**
 * The Map Settings panel's match rows (CREATE GAME's RESPAWN and EQlimit, research 348 and 362) and its Weapons &
 * equipment section (`../../src/forge/panels/arsenalSection`, a browser adaptation over `./arsenalSetting`'s edits).
 */
const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const weapon = (name: string, id: number, extra: [string, RdrNode][] = []): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '30'],
  ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ['ModelName', name.toLowerCase()], ['IconTextureName', `${name}_icon.tif`], ...extra,
);
const arsenal = arsenalOf(['ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])], 'ZWEAPON', [
  weapon('M4A1', 54), weapon('AK-47', 58), weapon('Mark 23', 15), weapon('M9', 5), weapon('M67', 121), weapon('HE', 126),
  weapon('C4', 151), weapon('LAW', 145, [['SlotCost', '2']]), weapon('M203 HE', 171), weapon('Double Ammo Load', 194),
]]);
const SEAL: Loadout = [54, 15, 121, 126, 194];
const map: MapArsenal = {
  valves: new Map([['Enable_m4Acarbine', 1], ['Enable_ak47', 8], ['Enable_Mark23', 1], ['Enable_beretta_m9', 8], ['Enable_frag', 9], ['Enable_HEgren', 9], ['Enable_c4', 0]]),
  selectable: { seal: [], terrorist: [] },
  kits: { seal: [{ type: 's1', character: 'c', loadout: SEAL }], terrorist: [{ type: 't1', character: 'c', loadout: [58, 5, 121, 126, 194] }] },
};
const kits = { table: { arsenal }, map } as unknown as SimKits;

describe('Map Settings: the match rows', () => {
  it('RESPAWN and EQlimit are rows of the dock and the START menu, with the game\'s words', () => {
    expect(MAP_SETTING_ROWS.map((r) => r.id)).toEqual(expect.arrayContaining(['respawn', 'eqLimit']));
    expect(formatSetting('respawn', { ...DEFAULT_SETTINGS, respawn: true }, 0)).toBe('On');
    expect(['None', 'Pistols only', 'Shotguns only', 'Snipers only', 'No bombs'].map((_, i) => formatSetting('eqLimit', { ...DEFAULT_SETTINGS, eqLimit: i }, 0)))
      .toEqual(['None', 'Pistols only', 'Shotguns only', 'Snipers only', 'No bombs']);
    const dom = buildSettings(document);
    expect(dom.body.contains(dom.respawnIn) && dom.body.contains(dom.eqSel)).toBe(true);
    expect([...dom.eqSel.options].map((o) => o.value)).toEqual(['0', '1', '2', '3', '4']);
    const calls: string[] = [];
    const hooks: SettingsMenuHooks = {
      settings: () => DEFAULT_SETTINGS, discFar: () => 0, gameTypeLabel: () => '', cycleGameType: () => {}, resetFog: () => {}, resetLighting: () => {},
      locked: () => false, step: (k, d) => { calls.push(`${k} ${d}`); },
    };
    const items = settingsMenuSection(hooks);
    items.find((i) => i.id === 'setting-respawn')!.act!();
    items.find((i) => i.id === 'setting-eqLimit')!.right!();
    expect(calls).toEqual(['respawn 1', 'eqLimit 1']);
  });
});

describe('Map Settings: Weapons & equipment', () => {
  const changes: (ArsenalSetting | null)[] = [];
  const make = () => {
    const s = buildArsenalSection(document);
    s.onChange((next) => changes.push(next));
    return s;
  };

  it('says so on a map with no arsenal, and draws no grid', () => {
    const s = make();
    s.draw({ setting: null, kits: null, locked: false });
    expect(s.body.textContent).toMatch(/no arsenal/i);
    expect(s.body.querySelectorAll('input[data-side]').length).toBe(0);
  });

  it('draws a row an enabling valve each item, its sides\' bits as the map\'s; launcher rounds left to their launcher', () => {
    const s = make();
    s.draw({ setting: null, kits, locked: false });
    const row = (valve: string) => s.body.querySelector<HTMLElement>(`[data-valve="${valve}"]`);
    expect(row('Enable_c4')).not.toBeNull();
    expect(row('Enable_203HE')).toBeNull();                                  // the menu rewrites the round valves itself
    const box = (valve: string, side: string) => row(valve)!.querySelector<HTMLInputElement>(`input[data-side="${side}"]`)!;
    expect([box('Enable_m4Acarbine', 'seal').checked, box('Enable_m4Acarbine', 'terrorist').checked]).toEqual([true, false]);
    expect([box('Enable_HEgren', 'seal').checked, box('Enable_HEgren', 'terrorist').checked]).toEqual([true, true]);
    changes.length = 0;
    box('Enable_c4', 'seal').checked = true;
    box('Enable_c4', 'seal').dispatchEvent(new Event('change'));
    expect(changes).toEqual([{ valves: { Enable_c4: 1 }, kits: { seal: [], terrorist: [] } }]);
  });

  it('presets, kit slots and Map\'s own write through the same edits; a refusal is shown', () => {
    const s = make();
    s.draw({ setting: null, kits, locked: false });
    changes.length = 0;
    const breach = (): HTMLButtonElement => s.body.querySelector<HTMLButtonElement>('[data-preset="breach"]')!;
    expect([breach().classList.contains('is-on'), breach().getAttribute('aria-pressed')]).toEqual([false, 'false']);
    breach().click();
    expect(changes.pop()).toEqual({ valves: { Enable_c4: 9 }, kits: { seal: [], terrorist: [] } });
    // Drawn with it on: lit, and a second click undoes it (the map's own).
    s.draw({ setting: { valves: { Enable_c4: 9 }, kits: { seal: [], terrorist: [] } }, kits, locked: false });
    expect([breach().classList.contains('is-on'), breach().getAttribute('aria-pressed')]).toEqual([true, 'true']);
    breach().click();
    expect(changes.pop()).toBeNull();
    s.draw({ setting: null, kits, locked: false });
    const slot = s.body.querySelector<HTMLSelectElement>('select[data-kit-side="terrorist"][data-kit-slot="4"]')!;
    expect([...slot.options].map((o) => o.value)).toEqual(expect.arrayContaining(['', String(ITEM.C4)]));
    expect([...slot.options].map((o) => o.value)).not.toContain('54');      // a rifle is no equipment
    slot.value = String(ITEM.C4);
    slot.dispatchEvent(new Event('change'));
    expect(changes.pop()).toEqual({ valves: { Enable_c4: 8 }, kits: { seal: [], terrorist: [{ slot: 4, id: ITEM.C4 }] } });
    // A pick the menu refuses (C4 not the SEALs') is named under the section.
    s.draw({ setting: { valves: {}, kits: { seal: [{ slot: 4, id: ITEM.C4 }], terrorist: [] } }, kits, locked: false });
    expect(s.body.querySelector('.fx-arsenal-refused')!.textContent).toMatch(/SEAL s1: pick 1 \(slot 5, C4\) refused/);
    s.body.querySelector<HTMLButtonElement>('[data-arsenal-reset]')!.click();
    expect(changes.pop()).toBeNull();
    s.draw({ setting: null, kits, locked: true });
    expect([...s.body.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')].every((e) => e.disabled)).toBe(true);
  });
});
