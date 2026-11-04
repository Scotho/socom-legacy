import { describe, expect, it } from 'vitest';
import type { Loadout } from '@s2u/scene';
import {
  ITEM_OF_UI, openArmory, profileOf, readProfile, rowUi, stepArmory, uiOf, type ArmoryContext, type ArmoryState,
} from '../../../src/armoryState';
import {
  armoryContextOf, chooseColumn, chooseItem, clearedRecord, columnsOf, defaultsOf, kitOf, LOADOUT_MISSIONS, openEditor, recordOf,
  slotChoices, storedOf,
} from '../../../src/console/loadoutModel';
import { kit, missionData, seal, SEAL_KITS, terr } from './fixture';
import { expectedPresses, fewestPresses, labelHolds } from './pressSearch';

/**
 * MU-13f, the loadout editor's rules: every one the original ARMORY's (`src/armoryState.ts`, research 95 §3-§4) -- the
 * items a slot offers are what any run of its Left / Right presses shows (`stepItem` then `pick`, as `stepArmory` steps
 * it; held to `./pressSearch`'s independent search), the record is
 * `profileOf`'s, the stored record is read back by `openArmory` / `readProfile`. These tests hold the editor to those
 * functions' own outputs over `test/armoryState.test.ts`'s world.
 */

/** The screen (`stepArmory`): open, commit column `col`, walk down to `row`, then `presses` on it. */
function drive(ctx: ArmoryContext, col: number, row: number, presses: readonly ('left' | 'right')[]): ArmoryState {
  let t = 0;
  let s: ArmoryState = openArmory(ctx, t, null, null, []).state;
  for (let c = 0; c < col; c++) s = stepArmory(ctx, s, 'right', (t += 1)).state;
  s = stepArmory(ctx, s, 'cross', (t += 1)).state;
  while (s.row !== row) s = stepArmory(ctx, s, 'down', (t += 1)).state;
  for (const p of presses) s = stepArmory(ctx, s, p, (t += 1)).state;
  return s;
}

describe('the loadout editor\'s rules are the ARMORY\'s', () => {
  it('the missions are the first release\'s maps, upper-cased as the page keys them', () => {
    expect(LOADOUT_MISSIONS).toEqual(['MP2', 'MP7', 'MP51', 'MP72']);              // OT.R45: Night Stalker the fourth
  });

  it('the context is the one the shared ARMORY screen builds from the mission\'s data', () => {
    const ctx = armoryContextOf(missionData(), 'seal')!;
    expect(ctx.side).toBe('seal');
    expect(ctx.kits).toEqual(SEAL_KITS);
    expect([ctx.fourthOpen, ctx.eqLimit, ctx.comeFromLan]).toEqual([true, 0, false]);
    expect(armoryContextOf(missionData(), 'terrorist')!.kits[0]).toEqual(kit(58, 4, 121, 126, 158));
    expect(armoryContextOf({ ...missionData(), world: null }, 'seal')).toBeNull();
  });

  it('a mixed run of presses reaches what neither direction alone does: SEAL type 1, row 4, Left Left Right shows UI 35', () => {
    const screen = drive(seal, 0, 4, ['left', 'left', 'right']);
    expect(rowUi(screen.kits[0]!, 4)).toBe(35);
    const c = slotChoices(seal, SEAL_KITS[0]!, 4);
    expect(c.options).toContain(35);
    const mine = chooseItem(seal, openEditor(seal, null), 4, 35);
    expect(rowUi(kitOf(mine), 4)).toBe(35);
    expect(c.reach.get(35)!.presses).toHaveLength(fewestPresses(seal, SEAL_KITS[0]!, 4).get(35)!);
  });

  for (const ctx of [seal, terr]) {
    it(`every slot of every ${ctx.side} type offers what any run of Left / Right presses shows, by the fewest presses (an independent search)`, () => {
      // The types' kits and every kit one listed choice leaves: the starts.
      const starts = new Map<string, Loadout>();
      for (const k of ctx.kits) {
        starts.set(k.join(','), k);
        for (let row = 1; row <= 5; row++) for (const r of slotChoices(ctx, k, row).reach.values()) starts.set(r.kit.join(','), r.kit);
      }
      for (const start of starts.values()) {
        for (let row = 1; row <= 5; row++) {
          const c = slotChoices(ctx, start, row);
          const { cursorSkips, want } = expectedPresses(ctx, start, row);
          expect(labelHolds(ctx, start, row, c.fixed, cursorSkips), `${ctx.side} ${start.join(',')} row ${row} label ${c.fixed}`).toBe(true);
          const at = `${ctx.side} ${start.join(',')} row ${row}`;
          expect(new Set(c.options), at).toEqual(new Set([rowUi(start, row), ...want.keys()]));
          for (const [ui, n] of want) expect(c.reach.get(ui)!.presses.length, `${at} UI ${ui}`).toBe(n);
          expect(c.current).toBe(rowUi(start, row));
        }
      }
    });
  }

  it('the side\'s Enable_ valves decide: the AK-47 is the terrorists\', never the SEALs\'', () => {
    const ak = uiOf(58);
    expect(slotChoices(seal, SEAL_KITS[0]!, 1).options).not.toContain(ak);
    expect(slotChoices(terr, terr.kits[0]!, 1).options).toContain(ak);
    // An item not offered is refused: the state stays as it was.
    const s = openEditor(seal, null);
    expect(chooseItem(seal, s, 1, ak)).toBe(s);
  });

  it('a choice is the screen\'s step: the kit and the record equal the ARMORY\'s for the same item', () => {
    // The screen: open, commit the first type, Right once on the primary row.
    let t = 0;
    let screen: ArmoryState = openArmory(seal, t, null, null, []).state;
    screen = stepArmory(seal, screen, 'cross', (t += 1)).state;
    screen = stepArmory(seal, screen, 'right', (t += 1)).state;
    const chosen = rowUi(screen.kits[0]!, 1);
    // The editor: the same item picked from the list.
    const editor = chooseItem(seal, openEditor(seal, null), 1, chosen);
    expect(kitOf(editor)).toEqual(screen.kits[0]);
    expect(recordOf(seal, editor)).toEqual(profileOf(seal, screen));
    expect(recordOf(seal, editor)).toEqual({ charSet: 1, items: [1, 75, 36, 37, 35], valid: true });
  });

  it('every listed item lands the kit the screen leaves after the same presses (stepArmory S2)', () => {
    for (const ctx of [seal, terr]) {
      for (let col = 0; col < ctx.kits.length; col++) {
        const e = chooseColumn(ctx, openEditor(ctx, null), col);
        for (let row = 1; row <= 5; row++) {
          for (const [ui, r] of slotChoices(ctx, kitOf(e), row).reach) {
            const screen = drive(ctx, col, row, r.presses);
            const mine = chooseItem(ctx, e, row, ui);
            expect(kitOf(mine), `${ctx.side} type ${col + 1} row ${row} UI ${ui}`).toEqual(screen.kits[col]);
            expect(rowUi(kitOf(mine), row)).toBe(ui);
            expect(recordOf(ctx, mine)).toEqual(profileOf(ctx, screen));
          }
        }
      }
    }
  });

  it('a slot cost of two fills the next slot (253-255), which the cursor skips (nextRow): it offers nothing else', () => {
    const law = uiOf(145);
    const s = chooseItem(seal, openEditor(seal, null), 3, law);
    expect(rowUi(kitOf(s), 3)).toBe(law);
    const next = slotChoices(seal, kitOf(s), 4);
    expect(next.fixed).toBe('skipped');
    expect(next.options).toEqual([rowUi(kitOf(s), 4)]);
    expect(next.options[0]).toBeGreaterThanOrEqual(253);
    expect(chooseItem(seal, s, 4, uiOf(121))).toBe(s);
  });

  it('opens on the stored record as the screen does (readProfile), else on the first type', () => {
    const stored = { charSet: 3, items: [1, 75, 36, 37, 35] as [number, number, number, number, number], valid: true };
    const e = openEditor(seal, stored);
    const read = readProfile(seal, stored)!;
    expect([e.committed, kitOf(e)]).toEqual([read.column, read.kit]);
    expect(openEditor(seal, { ...stored, valid: false }).committed).toBe(0);
    expect(openEditor(terr, null).committed).toBe(0);
    expect(recordOf(terr, openEditor(terr, null)).charSet).toBe(5);
  });

  it('the fourth type only where the map opens it', () => {
    const shut: ArmoryContext = { ...seal, fourthOpen: false };
    expect(columnsOf(shut).map((c) => [c.charSet, c.open])).toEqual([[1, true], [2, true], [3, true], [4, false]]);
    const s = openEditor(shut, null);
    expect(chooseColumn(shut, s, 3)).toBe(s);
    expect(chooseColumn(seal, s, 3).committed).toBe(3);
    expect(recordOf(seal, chooseColumn(seal, s, 3)).charSet).toBe(4);
  });

  it('defaults are the type\'s own kit; mode 7 clears the stored record\'s valid byte', () => {
    const s = chooseItem(seal, openEditor(seal, null), 1, uiOf(51));
    expect(kitOf(defaultsOf(seal, s))).toEqual(SEAL_KITS[0]);
    const p = { charSet: 1, items: [1, 75, 36, 37, 35] as [number, number, number, number, number], valid: true };
    expect(clearedRecord(p)).toEqual({ ...p, valid: false });
    expect(clearedRecord({ ...p, valid: false })).toBeNull();
    expect(clearedRecord(null)).toBeNull();
  });

  it('reads one side of one mission from the account\'s list, any case', () => {
    const p = { charSet: 5, items: [4, 77, 36, 37, 38] as [number, number, number, number, number], valid: true };
    const list = [{ mission: 'mp72', seal: null, terrorist: p }];
    expect(storedOf(list, 'MP72', 'terrorist')).toEqual(p);
    expect(storedOf(list, 'MP72', 'seal')).toBeNull();
    expect(storedOf(list, 'MP2', 'terrorist')).toBeNull();
    expect(ITEM_OF_UI.get(p.items[0])).toBe(58);
  });
});
