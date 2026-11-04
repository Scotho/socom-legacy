import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { applyPicks, arsenalOf, FULL_SLOT, ITEM, type Loadout } from '@s2u/scene';
import {
  ARMORY_POPUP_FOCUS, armoryValves, closeArmory, ITEM_OF_UI, nextRow, openArmory, picksToReach, popupOf, profileOf, pullOut, PULL_OUT_SECONDS,
  readProfile, SCROLL, scrollAdmits, stepArmory, stepItem, SUSPEND, takesInput, tickArmory, UI_OF_ITEM, uiOf,
  type ArmoryContext, type ArmoryInput, type ArmoryState,
} from '../src/armoryState';

/**
 * The ARMORY's STATE TABLE (research 95 §4.2, S0-S7), row by row, over a hand-built arsenal: `parseRdr`'s shape, the
 * game's ids (the class is the id range), the valves as a map's `mission.rdr` spells them.
 */

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const item = (name: string, id: number, extra: [string, RdrNode][] = []): RdrNode[] =>
  rec(['InternalName', name], ['ID', String(id)], ['AMMO_TYPES', []], ...extra);
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('M16A2', 51), item('M4A1', 54), item('HK5', 31), item('AK-47', 58), item('870', 84),
  item('Mark 23', 15), item('M9', 5), item('F57', 4),
  item('M67', 121), item('AN-M8', 122), item('HE', 126), item('C4', 151), item('Claymore', 153), item('PMN Mine', 158),
  item('Double Ammo Load', 194), item('LAW', 145, [['SlotCost', '2']]), item('LAW HEAT', 185),
]] as RdrNode);
const valves = new Map([
  // Primaries and pistols: exactly 9 or the side's bit; 870 carries a lock bit (17), so the scroll passes it.
  ['Enable_M16', 1], ['Enable_m4Acarbine', 1], ['Enable_mp5', 9], ['Enable_ak47', 8], ['Enable_870', 17],
  ['Enable_Mark23', 1], ['Enable_beretta_m9', 9], ['Enable_fiveseven', 8],
  ['Enable_frag', 9], ['Enable_smoke', 9], ['Enable_HEgren', 9], ['Enable_c4', 17], ['Enable_claymore', 1], ['Enable_pmn', 8],
  ['Enable_2xammo', 9], ['Enable_LAW', 9],
]);
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const KITS = [kit(54, 15, 121, 126, 194), kit(84, 15, 121, 122, 194), kit(31, 15, 121, 126, 194), kit(51, 5, 121, 153, 194)];
const seal: ArmoryContext = { arsenal, valves, side: 'seal', kits: KITS, fourthOpen: true, eqLimit: 0, comeFromLan: false };
const terr: ArmoryContext = { ...seal, side: 'terrorist', kits: [kit(58, 4, 121, 126, 158), kit(58, 4, 121, 122, 158), kit(58, 4, 121, 126, 194), kit(58, 4, 158, 126, 121)] };
const ONSTART = ['UnlockMPChar', 'OnlyModes', 'UiEquipSwitch', 'MPSealPlace', 'MPTypeValveSet'];

const open = (ctx = seal, t = 0, profile: Parameters<typeof openArmory>[3] = null): ArmoryState => openArmory(ctx, t, null, profile, ONSTART).state;
/** Steps inputs, each a second after the last (past every suspension but the store's). */
function drive(ctx: ArmoryContext, s: ArmoryState, t0: number, ...inputs: ArmoryInput[]): { state: ArmoryState; t: number } {
  let t = t0, state = s;
  for (const i of inputs) { t += 1; state = stepArmory(ctx, state, i, t).state; }
  return { state, t };
}
/** Open, commit column `c`, and wait out the commit's suspension. */
function committed(ctx = seal, c = 0): { state: ArmoryState; t: number } {
  const s = open(ctx);
  const rights = Array.from({ length: c }, () => 'right' as const);
  return drive(ctx, s, 0, ...rights, 'cross');
}

describe('the UI indices (FUN_003d3230 L325704-325934) and the scroll (research 95 §3.4)', () => {
  it('maps the ids research 95 names, both ways', () => {
    for (const [ui, id] of [[35, 194], [36, 121], [37, 126], [38, 158], [39, 123], [40, 186], [41, 153], [42, 151], [49, 122], [50, 145],
      [51, 146], [52, 195], [53, 127], [54, 152], [55, 181], [57, 183], [252, 141], [255, FULL_SLOT], [254, ITEM.LAW_HEAT], [0, 255],
      [1, 51], [2, 33], [3, 31], [4, 58], [8, 57], [9, 37], [18, 54], [65, 67], [75, 15], [76, 16], [83, 11], [85, 13]] as const) {
      expect([ui, ITEM_OF_UI.get(ui)]).toEqual([ui, id]);
      expect(uiOf(id)).toBe(ui);
    }
    expect(uiOf(999)).toBe(0xfe);
    expect(UI_OF_ITEM.size).toBe(ITEM_OF_UI.size);             // one to one
  });

  it('scrolls the primaries without 6 and 16, the pistols 75-85, the equipment 35-57 then 0', () => {
    expect(SCROLL.primary).not.toContain(6);
    expect(SCROLL.primary).not.toContain(16);
    expect(SCROLL.primary.at(-1)).toBe(65);
    expect(SCROLL.secondary).toEqual([75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85]);
    expect([SCROLL.equipment[0], SCROLL.equipment.at(-2), SCROLL.equipment.at(-1)]).toEqual([35, 57, 0]);
  });

  it('stops a primary or a pistol only on exactly 9 or the side\'s bit; equipment on the bit', () => {
    expect(scrollAdmits(valves, 'seal', 1)).toBe(true);        // M16A2: 1
    expect(scrollAdmits(valves, 'seal', 3)).toBe(true);        // HK5: 9
    expect(scrollAdmits(valves, 'seal', 4)).toBe(false);       // AK-47: 8
    expect(scrollAdmits(valves, 'terrorist', 4)).toBe(true);
    expect(scrollAdmits(valves, 'seal', 27)).toBe(false);      // 870: 17, a lock bit -> passed
    expect(scrollAdmits(valves, 'seal', 42)).toBe(true);       // C4: 17 & 1 (equipment tests the bit)
    expect(scrollAdmits(valves, 'seal', 38)).toBe(false);      // PMN: 8
    expect(scrollAdmits(valves, 'seal', 83)).toBe(false);      // the designator: no valve
  });
});

describe('the ARMORY, state by state (research 95 §4.2)', () => {
  it('S0 Boot: opens on character select, column SEAL 1, nothing committed, the ONSTART scripts, .DINK', () => {
    const { state, events } = openArmory(seal, 10, null, null, ONSTART);
    expect([state.screen, state.column, state.committed, state.custom, state.row]).toEqual(['select', 0, null, null, 1]);
    expect(events.sounds).toEqual(['.DINK']);
    expect(events.run).toEqual(ONSTART);
    expect(events.valves).toMatchObject({ player_team: 0, MpCharSet: 1, UiCharSet: 1, ArmoryType: 1, InWhichAOP: 0, DisableFourthChar: 0, EQlimit: 0 });
    expect(takesInput(state, 10)).toBe(true);                   // the slide runs while S1 takes input
    expect(openArmory(terr, 0, null, null, []).events.valves).toMatchObject({ player_team: 8, MpCharSet: 5, UiCharSet: 16 });
  });

  it('S0 Boot: a stored profile is the cursor, captioned CUSTOM and committed, its kit re-validated', () => {
    const p = { charSet: 2, items: [3, 75, 36, 37, 35] as [number, number, number, number, number], valid: true };
    const s = open(seal, 0, p);
    expect([s.column, s.committed, s.custom]).toEqual([1, 1, 1]);
    expect(s.kits[1]).toEqual([31, 15, 121, 126, 194]);
    // Mode 7's cleared record, another side's, a column the map lacks: none.
    expect(open(seal, 0, { ...p, valid: false }).committed).toBeNull();
    expect(open(seal, 0, { ...p, charSet: 6 }).committed).toBeNull();
    expect(open({ ...seal, kits: KITS.slice(0, 1) }, 0, p).committed).toBeNull();
    // ARMORY-UI (research 182 §2.18, `UICharacterProfile.rdr` `EquipCharacterProfileSeal*`): each stored item re-chosen
    // only when its `Enable_` valve has the side's bit; a refused one is skipped and its slot keeps what it held. The
    // AK-47 (8) is refused the SEAL: the type's own primary (870) stays, the other four items are the record's.
    const ak = open(seal, 0, { ...p, items: [4, 75, 36, 37, 35] });
    expect([ak.committed, ak.kits[1]]).toEqual([1, [84, 15, 121, 126, 194]]);
    expect(applyPicks(arsenal, valves, 'seal', KITS[1]!, ak.picks[1]!)).toEqual({ loadout: [84, 15, 121, 126, 194] });
    // A refused item in the middle (the PMN, 8): the slot keeps the type's own M67, the items around it are the record's.
    const pmn = open(seal, 0, { ...p, items: [3, 75, 38, 37, 35] });
    expect(pmn.kits[1]).toEqual([31, 15, 121, 126, 194]);
    expect(readProfile(terr, { ...p, charSet: 6 })?.column).toBe(1);
  });

  it('S1 Character select: Left/Right wrap in the side\'s four with .DINK and the ONACTIVATE look; the 4th skipped when locked', () => {
    const s = open();
    const right = stepArmory(seal, s, 'right', 1);
    expect([right.state.column, right.events.sounds, right.events.run]).toEqual([1, ['.DINK'], ['OnMpSealBtnAct']]);
    expect(right.events.valves).toMatchObject({ MpCharSet: 2, UiCharSet: 2 });
    expect(stepArmory(seal, s, 'left', 1).state.column).toBe(3);
    const locked = { ...seal, fourthOpen: false };
    expect(stepArmory(locked, s, 'left', 1).state.column).toBe(2);
    expect(drive(locked, s, 0, 'right', 'right', 'right').state.column).toBe(0);
    expect(stepArmory(terr, open(terr), 'right', 1).events.run).toEqual(['OnMpTerrBtnAct']);
  });

  it('S1: Up/Down .DINK only; Circle and Square unbound; Triangle leaves with nothing committed', () => {
    const s = open();
    const up = stepArmory(seal, s, 'up', 1);
    expect([up.state.column, up.events.sounds, up.events.run]).toEqual([0, ['.DINK'], []]);
    for (const i of ['circle', 'square'] as const) expect(stepArmory(seal, s, i, 1).state).toBe(s);
    const back = stepArmory(seal, s, 'triangle', 1);
    expect([back.state.screen, back.events.sounds, back.events.closed, back.events.change]).toEqual(['closed', ['.DINK'], true, undefined]);
  });

  it('S1a Commit: Cross commits the column, the press look, input suspended 0.5 s, then the Primary row', () => {
    const s = drive(seal, open(), 0, 'right').state;
    const x = stepArmory(seal, s, 'cross', 5);
    expect([x.state.screen, x.state.committed, x.state.row, x.state.suspendedUntil]).toEqual(['row', 1, 1, 5 + SUSPEND.commit]);
    // The commit's .DINK is `OnMpSealBtnPress`'s own SOUND, which the page's script player plays (ARMORY_SCRIPT_SOUNDS):
    // the state voices none of its own here, so it sounds once (research 182 §2.21).
    expect([x.events.sounds, x.events.run]).toEqual([[], ['OnMpSealBtnPress']]);
    expect(x.events.valves).toMatchObject({ MpCharSet: 2, UiLastEquipClassBtn: 1, UiWeapon: 27, primsel: 27, secsel: 75 });
    expect(stepArmory(seal, x.state, 'down', 5.2).state).toBe(x.state);   // suspended
    expect(takesInput(x.state, 5.5)).toBe(true);
    expect(stepArmory({ ...seal, eqLimit: 1 }, s, 'cross', 5).state.row).toBe(2);       // Pistols Only: the Secondary row
    expect(stepArmory(terr, open(terr), 'cross', 1).events.run).toEqual(['OnMpTerrBtnPress']);
  });

  it('S2 Weapon row: Left/Right step the item by the scroll and the room\'s rules, .SLIDE, applied at once', () => {
    const { state: s, t } = committed();                        // SEAL 1: M4A1 (UI 18)
    const r = stepArmory(seal, s, 'right', t + 1);
    expect(r.state.kits[0]![0]).toBe(51);                       // 19-34, 65 pass; 1 M16A2 stops
    expect([r.events.sounds, r.events.run, r.state.suspendedUntil]).toEqual([['.SLIDE'], ['CallShowAndSpin'], t + 1 + SUSPEND.weaponStep]);
    expect(r.state.picks[0]).toEqual([{ slot: 0, id: 51 }]);
    expect(stepArmory(seal, s, 'left', t + 1).state.kits[0]![0]).toBe(31);   // 17 .. 4 (AK, 8) pass; 3 HK5
    const eq = drive(seal, s, t, 'down', 'down').state;         // Equipment 1: M67 (UI 36)
    expect(stepArmory(seal, eq, 'right', t + 5).state.kits[0]![2]).toBe(126);   // 37 HE
    expect(stepItem(seal, KITS[0]!, 2, 1)).toBe(5);             // Mark 23 -> 76..80 pass (no record / 8) -> 81 M9
    expect(stepItem(terr, terr.kits[0]!, 5, 1)).toBe(122);     // PMN (38) -> 39-48 (no record, or a round) -> 49 AN-M8
    expect(stepItem(terr, kit(58, 4, 121, 126, 153), 5, 1)).toBe(122);   // Claymore (41) -> 42 C4 (17: not &8) -> 43-48 -> 49
    // R4B-06 (OT.R97; research 378): a C4 carried in another slot is passed, r0004's no-duplicate list (r4 0x2d2280);
    // r0001's FUN_0023c390 (D:L87443-87444) offered it.
    expect(stepItem(seal, kit(54, 15, 153, 126, ITEM.C4), 3, 1)).toBe(122);   // Claymore (41) -> 42 C4 carried -> 43-48 -> 49
  });

  it('S2: the equipment scroll wraps past 57 and the empty 0 (ARMORY_EMPTY_PICK_READING)', () => {
    const noLaw = new Map([...valves].filter(([k]) => k !== 'Enable_LAW'));
    const ctx = { ...seal, valves: noLaw };
    expect(stepItem(ctx, kit(54, 15, 121, 126, 122), 5, 1)).toBe(ITEM.DOUBLE_AMMO);   // 49 -> 50-57 none, 0 skipped, 35 2X
    expect(stepItem(ctx, kit(54, 15, 121, 126, 194), 5, -1)).toBe(122);              // 35 -> (0) -> 57 .. 50 none -> 49
    // The LAW (cost 2): the in-game rule the room replays takes it, its LAW HEAT in the next slot (ARMORY_RULES_READING).
    expect(stepItem(seal, kit(54, 15, 121, 126, 122), 5, 1)).toBe(ITEM.LAW);
  });

  it('S2: a locked slot refuses (the lock-bit C4) -- .SLIDE, no move', () => {
    const ctx = { ...seal, kits: [kit(54, 15, 121, 126, ITEM.C4)] };
    const { state: s, t } = committed(ctx);
    const at5 = drive(ctx, s, t, 'up', 'up').state;             // 1 -> DONE -> 5
    expect(at5.row).toBe(5);
    const r = stepArmory(ctx, at5, 'right', t + 5);
    expect([r.state.kits[0], r.events.sounds, r.events.run]).toEqual([at5.kits[0], ['.SLIDE'], []]);
  });

  it('S2: Up/Down walk the rows 1-6 cyclically with .DINK, a 253-255 row skipped; 6 is DONE (S3)', () => {
    const { state: s, t } = committed();
    const d = stepArmory(seal, s, 'down', t + 1);
    expect([d.state.row, d.state.screen, d.events.sounds, d.events.run]).toEqual([2, 'row', ['.DINK'], ['OnMpSecondaryBtn']]);
    const up = stepArmory(seal, s, 'up', t + 1);
    expect([up.state.row, up.state.screen, up.events.run]).toEqual([6, 'done', ['OnMPEquipDoneAct']]);
    const law = kit(54, 15, 145, ITEM.LAW_HEAT, 194);
    expect(nextRow(law, 3, 1)).toBe(5);                         // 4 holds LAW HEAT (UI 254)
    expect(nextRow(kit(54, 15, 145, FULL_SLOT, 194), 5, -1)).toBe(3);
  });

  it('S3 DONE row: Cross simply closes -- every change was handed on as it was made; Up/Down back to the rows', () => {
    const { state: s, t } = committed(seal, 2);                 // SEAL 3: HK5
    const stepped = drive(seal, s, t, 'right', 'up').state;     // HK5 -> AK (8) passed -> 5, 7 .. -> next the SEAL admits
    expect(stepped.screen).toBe('done');
    expect(stepArmory(seal, stepped, 'down', t + 9).state.row).toBe(1);
    expect(stepArmory(seal, stepped, 'up', t + 9).state.row).toBe(5);
    for (const i of ['left', 'right', 'square'] as const) expect(stepArmory(seal, stepped, i, t + 9).state).toBe(stepped);
    const out = stepArmory(seal, stepped, 'cross', t + 9);
    expect([out.state.screen, out.events.sounds, out.events.closed, out.events.change]).toEqual(['closed', ['.DINK'], true, undefined]);
  });

  it('live (W5.R1, the S3 review): the commit, each item step and the defaults hand on the type, its kit and its picks at once', () => {
    const s0 = openArmory(seal, 0, { type: 0, kit: KITS[0]! }, null, ONSTART);
    expect(s0.events.change).toBeUndefined();                                   // the page's own: nothing to hand on
    const x = stepArmory(seal, stepArmory(seal, s0.state, 'right', 1).state, 'cross', 2);
    expect(x.events.change).toEqual({ type: 1, kit: KITS[1], picks: [] });      // ChangeCharacterType: at once
    const same = stepArmory(seal, s0.state, 'cross', 2);
    expect(same.events.change).toBeUndefined();                                 // the type the page holds already
    const r = stepArmory(seal, x.state, 'right', 3);
    expect(r.events.change).toMatchObject({ type: 1, kit: r.state.kits[1], picks: [{ slot: 0, id: r.state.kits[1]![0] }] });
    expect(applyPicks(arsenal, valves, 'seal', KITS[1]!, r.events.change!.picks)).toEqual({ loadout: r.state.kits[1] });
    const d = stepArmory(seal, r.state, 'circle', 4);
    expect(d.events.change).toEqual({ type: 1, kit: KITS[1], picks: [] });      // the defaults
    const blocked = stepArmory(seal, x.state, 'down', 3);
    expect(blocked.events.change).toBeUndefined();                              // a row move changes nothing
    // A stored record opened on is the page's from the opening.
    const p = { charSet: 2, items: [3, 75, 36, 37, 35] as [number, number, number, number, number], valid: true };
    const withRecord = openArmory(seal, 0, { type: 0, kit: KITS[0]! }, p, ONSTART);
    expect(withRecord.events.change).toMatchObject({ type: 1 });
  });

  it('S4 Confirm: Triangle on a row opens popup 1245 (NO 246 / YES 253) on NO; Right then Cross: YES, back to character select, the kit kept', () => {
    const { state: s, t } = committed(seal, 1);
    const stepped = stepArmory(seal, s, 'right', t + 1).state;
    const c = stepArmory(seal, stepped, 'triangle', t + 2);
    expect([c.state.screen, c.events.run, c.events.sounds, c.events.valves['AreYouSure']]).toEqual(['confirm', ['OnEquipWeaponBtnDefault'], [], 0]);
    // ARMORY_POPUP_FOCUS (research 182 §2.15, research 118 §4): a record with buttons focuses its first slot, NO.
    expect(popupOf(c.state)).toEqual({ text: 1245, buttons: [{ text: 246, focused: true }, { text: 253, focused: false }] });
    expect(ARMORY_POPUP_FOCUS).toBe('no');
    // Right moves to YES with the popup's SELECTION (.METAL; FUN_00370990 D:L268527-268534).
    const right = stepArmory(seal, c.state, 'right', t + 3);
    expect([popupOf(right.state)!.buttons.map((b) => b.focused), right.events.sounds]).toEqual([[false, true], ['.METAL']]);
    // Cross answers 2 with SELECTION; the .DINK is the script's (`OnMPWeaponBtnTriangle`), not the state's.
    const yes = stepArmory(seal, right.state, 'cross', t + 4);
    expect([yes.state.screen, yes.state.column, yes.state.committed, yes.events.sounds, yes.events.valves['AreYouSure']]).toEqual(['select', 1, 1, ['.METAL'], 2]);
    expect(yes.state.kits[1]).toEqual(stepped.kits[1]);
    expect(yes.state.suspendedUntil).toBe(t + 4 + SUSPEND.confirm);
  });

  it('S4: an immediate Cross answers NO (AreYouSure 1) back where it was; Triangle, Up and Down in the popup do nothing', () => {
    const { state: s, t } = committed();
    const c = stepArmory(seal, s, 'triangle', t + 1).state;
    // Record 1245's +64 is 0: TRIANGLE is not armed (FUN_00370990 D:L268514; research 182 ARMORY_POPUP_TRIANGLE).
    const tri = stepArmory(seal, c, 'triangle', t + 2);
    expect([tri.state, tri.events.sounds, tri.events.run]).toEqual([c, [], []]);
    // UP and DOWN are no keys of the popup (research 118 §4): swallowed, no move, no sound.
    for (const k of ['up', 'down'] as const) expect(stepArmory(seal, c, k, t + 2).state).toBe(c);
    const no = stepArmory(seal, c, 'cross', t + 3);
    expect([no.state.screen, no.state.row, no.events.valves['AreYouSure'], no.events.sounds]).toEqual(['row', 1, 1, ['.METAL']]);
    // Left from NO is YES, and Left again NO: the two slots toggle.
    const left = stepArmory(seal, c, 'left', t + 2).state;
    expect(popupOf(left)!.buttons.map((b) => b.focused)).toEqual([false, true]);
    expect(popupOf(stepArmory(seal, left, 'left', t + 3).state)!.buttons.map((b) => b.focused)).toEqual([true, false]);
    const done = drive(seal, s, t, 'up', 'triangle').state;
    expect(stepArmory(seal, done, 'cross', t + 9).state.screen).toBe('done');
  });

  it('S5 Store: Square writes the record (the column\'s MpCharSet and five UI indices), CUSTOM, the .DINK the script\'s; input held 3 s', () => {
    const { state: s, t } = committed(seal, 1);
    const st = stepArmory(seal, s, 'square', t + 1);
    expect(st.state.screen).toBe('store');
    expect(st.events.store).toEqual({ charSet: 2, items: [27, 75, 36, 49, 35], valid: true });
    expect(st.events.store).toEqual(profileOf(seal, s));
    // The store's .DINK is `StoringLoadout`'s own SOUND (the script player's): none from the state.
    expect([st.state.custom, st.events.sounds, st.events.run]).toEqual([1, [], ['StoringLoadout']]);
    expect(stepArmory(seal, st.state, 'down', t + 2).state).toBe(st.state);
    expect(tickArmory(seal, st.state, t + 2)).toBeNull();
    expect(tickArmory(seal, st.state, t + 1 + SUSPEND.store)!.state.screen).toBe('row');
    expect(stepArmory({ ...seal, comeFromLan: true }, s, 'square', t + 1).state).toBe(s);   // the LAN path: unbound
    expect(stepArmory({ ...seal, eqLimit: 2 }, s, 'square', t + 1).state).toBe(s);
  });

  it('S6 Defaults: Circle restores the type\'s whole kit, clears the record, no sound; input held 2.3 s', () => {
    const { state: s, t } = committed();
    const stepped = drive(seal, s, t, 'right', 'down', 'right').state;
    expect(stepped.kits[0]).not.toEqual(KITS[0]);
    const d = stepArmory(seal, stepped, 'circle', t + 9);
    expect([d.state.screen, d.state.kits[0], d.state.picks[0], d.state.custom]).toEqual(['defaults', KITS[0], [], null]);
    expect([d.events.sounds, d.events.run, d.events.store]).toEqual([[], ['returnto_Defaults'], 'clear']);
    expect(tickArmory(seal, d.state, t + 9 + SUSPEND.defaults)!.state.screen).toBe('row');
    const fromDone = stepArmory(seal, drive(seal, s, t, 'up').state, 'circle', t + 9).state;
    expect(tickArmory(seal, fromDone, t + 20)!.state.screen).toBe('done');
  });

  it('S7 Pulled out: popup 47 as a notice -- the screen still takes input, the page\'s close (the round\'s start) ends it', () => {
    const { state: s, t } = committed(seal, 3);
    const p = pullOut(s, t + 1);
    expect([p.screen, p.pulledAt, popupOf(p)]).toEqual(['row', t + 1, { text: 47, buttons: [] }]);
    expect(pullOut(p, t + 2)).toBe(p);                                   // shown once
    expect(stepArmory(seal, p, 'right', t + 2).events.change).toMatchObject({ type: 3 });   // still live
    expect(tickArmory(seal, p, t + 1 + PULL_OUT_SECONDS + 10)).toBeNull();                // no exit of its own
    const confirm = stepArmory(seal, p, 'triangle', t + 2).state;
    expect(popupOf(confirm)!.text).toBe(1245);                           // the confirm over the notice
    const closed = { ...s, screen: 'closed' as const };
    expect(pullOut(closed, 0)).toBe(closed);
    const out = closeArmory(p, t + 3);
    expect([out.state.screen, out.events.closed, out.events.sounds, out.events.change]).toEqual(['closed', true, [], undefined]);
    expect(PULL_OUT_SECONDS).toBe(5);
  });

  it('the valves the scripts read follow the state (UpdateSelItemValves, the row, MpCharSet)', () => {
    const { state: s, t } = committed(terr, 2);
    const v = armoryValves(terr, drive(terr, s, t, 'down', 'down').state);
    expect(v).toMatchObject({ player_team: 8, MpCharSet: 7, UiCharSet: 64, UiLastEquipClassBtn: 3, UiWeapon: 36, primsel: 4, secsel: 80, equip3sel: 35 });
  });

  it('picksToReach replays to the kit, one pick a changed slot, or keeps the log', () => {
    const want = kit(51, 5, 126, 126, 194);
    const p = picksToReach(seal, KITS[0]!, want)!;
    expect(p).toEqual([{ slot: 0, id: 51 }, { slot: 1, id: 5 }, { slot: 2, id: 126 }]);
    expect(applyPicks(arsenal, valves, 'seal', KITS[0]!, p)).toEqual({ loadout: want });
    expect(picksToReach(seal, KITS[0]!, KITS[0]!)).toEqual([]);
    expect(picksToReach(seal, KITS[0]!, kit(58, 15, 121, 126, 194))).toBeNull();   // the AK: the SEAL may not
  });
});
