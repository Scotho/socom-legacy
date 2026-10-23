import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, VALVE_OF_ITEM, type Loadout, type Side } from '@s2u/scene';
import { openArmory, stepArmory, uiOf, type ArmoryContext, type ArmoryInput, type ArmoryProfile, type ArmoryState } from '../src/armoryState';
import { equipmentLimitKit, equipmentLimitValves } from '../src/equipmentLimit';

/** Original named reset programs: research 362 §2; synthetic arsenal with the source's ids, no disc prerequisite. */
const ids = [...VALVE_OF_ITEM.keys()];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', ids.map((id) => [
  'InternalName', [`item-${id}`], 'ID', [String(id)], 'AMMO_TYPES', [],
])] as RdrNode);
const CASES = (['seal', 'terrorist'] as const).flatMap((side) => [1, 2, 3, 4].map((mode) => [side, mode] as const));

function context(side: Side, mode: number): ArmoryContext {
  const original = new Map([...VALVE_OF_ITEM.values()].map((name) => [name, 9]));
  original.set('Enable_c4', 0);
  const valves = equipmentLimitValves(original, mode);
  const base: Loadout = side === 'seal' ? [54, 15, 122, 123, 194] : [58, 4, 122, 123, 194];
  return { arsenal, valves, side, eqLimit: mode, fourthOpen: true, comeFromLan: false,
    kits: Array.from({ length: 4 }, () => equipmentLimitKit(base, valves, side, mode)) };
}

function editor(ctx: ArmoryContext, column = 0) {
  let state = openArmory(ctx, 0, null, null, []).state;
  let time = 0;
  const press = (input: ArmoryInput) => {
    const out = stepArmory(ctx, state, input, time += 2);
    state = out.state;
    return out;
  };
  for (let c = 0; c < column; c++) press('right');
  press('cross');
  return { press, get: () => state };
}

/** Each column's edits are produced through actual key sequences before combining the independent type records. */
function editedColumns(ctx: ArmoryContext): ArmoryState {
  const columns = ctx.kits.map((_, c) => {
    const e = editor(ctx, c), weaponRow = ctx.eqLimit === 1 ? 2 : 1;
    e.press('right');
    expect(e.get().kits[c]![weaponRow - 1]).not.toBe(ctx.kits[c]![weaponRow - 1]);
    while (e.get().row !== 3) e.press('down');
    e.press('right');
    expect(e.get().kits[c]![2]).not.toBe(ctx.kits[c]![2]);
    return e.get();
  });
  return { ...columns[3]!, kits: columns.map((s, c) => s.kits[c]!), picks: columns.map((s, c) => s.picks[c]!) };
}

describe('restricted ARMORY native reset transitions', () => {
  it.each(['seal', 'terrorist'] as const)('%s No Bombs reopen preserves current firearms, resets equipment and reconstructs picks even when a stored profile exists', side => {
    const ctx = context(side, 4), secondary = side === 'seal' ? 5 : 15;
    const current: Loadout = [62, secondary, 122, 123, 122];
    const expected: Loadout = [62, secondary, 194, 123, 122];
    const picks = [{ slot: 0, id: 62 }, { slot: 1, id: secondary }];
    const stored: ArmoryProfile = { charSet: side === 'seal' ? 2 : 6, items: [1, 75, 49, 39, 49], valid: true };
    for (const profile of [null, stored]) {
      const opened = openArmory(ctx, 0, { type: 0, kit: current }, profile, [], { chosen: true });
      expect(opened.state.kits[0]).toEqual(expected);
      expect(opened.state.picks[0]).toEqual(picks);
      expect(opened.events.valves).toMatchObject({ primsel: uiOf(62), secsel: uiOf(secondary), equip1sel: uiOf(194) });
      expect(opened.events.change).toEqual({ type: 0, kit: expected, picks });
      expect(opened.state.custom).toBeNull();
      const unchanged = openArmory(ctx, 0, { type: 0, kit: expected }, profile, [], { chosen: true });
      expect(unchanged.state.kits[0]).toEqual(expected);
      expect(unchanged.state.picks[0]).toEqual(picks);
      expect(unchanged.events.change).toBeUndefined();
    }
  });

  it.each(CASES)('%s EQlimit %i: no current choice starts from mode defaults and ignores a stored profile', (side, mode) => {
    const ctx = context(side, mode);
    const profile: ArmoryProfile = { charSet: side === 'seal' ? 2 : 6, items: [1, 75, 49, 39, 49], valid: true };
    const opened = openArmory(ctx, 0, null, profile, []);
    expect(opened.state.kits).toEqual(ctx.kits);
    expect(opened.state.picks).toEqual([[], [], [], []]);
    expect(opened.state.custom).toBeNull();
    expect(opened.events.change).toBeUndefined();
    if (mode !== 4) {
      const forced = openArmory(ctx, 0, { type: 0, kit: [62, 15, 122, 123, 122] }, profile, [], { chosen: true });
      expect(forced.state.kits[0]).toEqual(ctx.kits[0]);
      expect(forced.state.picks[0]).toEqual([]);
      expect(forced.events.change).toEqual({ type: 0, kit: ctx.kits[0], picks: [] });
    }
  });

  it('shotgun edit -> Triangle -> Yes -> reselect restores the original SPAS instead of keeping the edited 870', () => {
    const ctx = context('seal', 2), e = editor(ctx);
    e.press('left');
    expect(e.press('left').state.kits[0]![0]).toBe(84);
    e.press('triangle'); e.press('right'); e.press('cross');
    const again = e.press('cross');
    expect(again.state.kits[0]![0]).toBe(81);
  });

  it.each(CASES)('%s EQlimit %i: Triangle -> Yes resets every type, then commits another type only on Cross', (side, mode) => {
    const ctx = context(side, mode), before = editedColumns(ctx);
    const expected = mode === 4 ? before.kits.map((k) => equipmentLimitKit(k, ctx.valves, side, mode)) : ctx.kits;
    const popup = stepArmory(ctx, before, 'triangle', 100);
    const yes = stepArmory(ctx, popup.state, 'right', 102);
    const reset = stepArmory(ctx, yes.state, 'cross', 104);
    expect(reset.state.screen).toBe('select');
    expect(reset.state.kits).toEqual(expected);
    expect(reset.events.change).toEqual({ type: 3, kit: expected[3], picks: mode === 4 ? [{ slot: 0, id: expected[3]![0] }] : [] });
    const cursor = stepArmory(ctx, reset.state, 'right', 106);
    expect(cursor.events.change).toBeUndefined();
    const commit = stepArmory(ctx, cursor.state, 'cross', 108);
    expect(commit.events.change).toMatchObject({ type: 0, kit: expected[0] });
  });

  it.each(CASES)('%s EQlimit %i: Circle reruns the mode reset for every type and leaves the saved profile alone', (side, mode) => {
    const ctx = context(side, mode), before = editedColumns(ctx);
    const expected = mode === 4 ? before.kits.map((k, c) => equipmentLimitKit(c === 3 ? ctx.kits[c]! : k, ctx.valves, side, mode)) : ctx.kits;
    const reset = stepArmory(ctx, before, 'circle', 100);
    expect(reset.state.screen).toBe('defaults');
    expect(reset.state.kits).toEqual(expected);
    expect(reset.events.change).toEqual({ type: 3, kit: expected[3], picks: [] });
    expect(reset.events.store).toBeUndefined();
    for (const [c, kit] of reset.state.kits.entries()) {
      expect(reset.state.picks[c]).toEqual(mode === 4 && c !== 3 ? [{ slot: 0, id: kit[0] }] : []);
    }
  });
});
