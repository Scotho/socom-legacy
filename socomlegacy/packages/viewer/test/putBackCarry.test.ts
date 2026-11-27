import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { applyPicks, arsenalOf, replayPicks, type Loadout, type Pick } from '@s2u/scene';
import { openArmory, stepArmory, type ArmoryContext, type ArmoryInput, type ArmoryState } from '../src/armoryState';
import { compactPicks, WeaponExchange, type MatchGate } from '../src/weaponExchange';
import type { MenuContext } from '../src/weaponSelectState';

/**
 * R4P-221 (LATER 616; research 378 s11): the page carries the remembered put-back pair the way the room does. The room
 * replays the side's whole list from the type's kit (match `room.ts` `loadout` -> `applyPicks`), so the pair is the
 * one that list leaves; the in-game menu, the list's compaction and the ARMORY's scroll must agree with it, or the page
 * shows one kit and the room spawns another. A hand-built `zweapon.rdr` (the repository's convention: no disc).
 */

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const item = (name: string, id: number): RdrNode[] => rec(['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['AMMO_TYPES', []]);
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('M4A1', 54), item('M4A1-M203', 61), item('Mark 23', 15),
  item('M67', 121), item('AN-M8', 122), item('HE', 126), item('Double Ammo Load', 194),
  item('M203', 141), item('M203 HE', 171), item('M203 FRAG', 175),
]] as RdrNode);
const valves = new Map([
  ['Enable_m4Acarbine', 1], ['Enable_m4Acarbine_203', 1], ['Enable_Mark23', 1], ['Enable_frag', 9], ['Enable_smoke', 9],
  ['Enable_HEgren', 9], ['Enable_2xammo', 9],
]);
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const BASE = kit(54, 15, 121, 126, 194);
const seal: MenuContext = { arsenal, valves, side: 'seal' };
const reach = (list: readonly Pick[]): Loadout => {
  const r = applyPicks(arsenal, valves, 'seal', BASE, list);
  if ('refused' in r) throw new Error(`refused ${r.refused} at ${r.at}`);
  return r.loadout;
};

describe('R4P-221: the page and the room agree on the remembered pair', () => {
  it('compactPicks keeps a list whose shorter twin reaches the same kit but forgets what the launcher displaced', () => {
    // AN-M8 into equipment 2, then the M4A1-M203 (remembering M67 and AN-M8): the one-pick twin {0, 61} reaches the same
    // kit but remembers M67 and HE -- the M4A1 back would then give the room a different kit from the page's.
    const long: Pick[] = [{ slot: 3, id: 122 }, { slot: 0, id: 61 }];
    const short = compactPicks(seal, BASE, long);
    expect(reach([...short, { slot: 0, id: 54 }])).toEqual(reach([...long, { slot: 0, id: 54 }]));
    expect(reach([...long, { slot: 0, id: 54 }])).toEqual([54, 15, 121, 122, 194]);
  });

  it('the in-game menu reopened takes the pair the side\'s list leaves: the M4A1 back gives back the M67 and the HE', () => {
    const DEAD: MatchGate = { inMatch: true, alive: false, cameraOnSelf: true, spectator: false };
    const list: Pick[] = [];
    const x = new WeaponExchange({
      clock: () => 0, opensOn: () => reach(list), confirm: (p) => list.push(p),
      remembered: () => { const r = replayPicks(arsenal, valves, 'seal', BASE, list); return 'refused' in r ? undefined : r.remembered; },
    });
    x.setContext(seal);
    // Open, confirm the M4A1-M203 on slot 0 (the list's cursor starts there; the picker opens on the slot's item).
    const confirm = (id: number): void => {
      x.key('KeyI', DEAD);
      for (let guard = 0; guard < 20 && x.state().screen !== 'picker'; guard++) x.key('Enter', DEAD);
      for (let guard = 0; guard < 20 && x.state().item !== id; guard++) x.key('ArrowDown', DEAD);
      expect(x.state().item).toBe(id);
      x.key('Enter', DEAD);
      x.key('Escape', DEAD);
    };
    confirm(61);
    expect(x.state().loadout).toEqual([61, 15, 141, 175, 194]);
    x.reset(reach(list));                                   // the round's reset: the menu closes over the spawn's kit
    confirm(54);
    expect(x.state().loadout).toEqual([54, 15, 121, 126, 194]);
    expect(x.state().loadout).toEqual(reach(list));
  });

  it('the ARMORY\'s scroll carries its column\'s pair: the M4A1-M203 and back again gives back the M67 and the HE', () => {
    const ctx: ArmoryContext = { arsenal, valves, side: 'seal', kits: [BASE, BASE, BASE, BASE], fourthOpen: true, eqLimit: 0, comeFromLan: false };
    let t = 0;
    let s: ArmoryState = openArmory(ctx, t, null, null, []).state;
    const press = (i: ArmoryInput): void => { t += 1; s = stepArmory(ctx, s, i, t).state; };
    press('cross');                                         // column 0 committed, row 1 (the primary)
    press('right');
    expect(s.kits[0]).toEqual([61, 15, 141, 175, 194]);
    press('left');
    expect(s.kits[0]).toEqual([54, 15, 121, 126, 194]);
    expect(s.kits[0]).toEqual(reach(s.picks[0]!));
  });
});
