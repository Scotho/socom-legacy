import type { RdrNode } from '@s2u/archive';
import { arsenalOf, type Loadout } from '@s2u/scene';
import type { ArmoryData } from '../../../src/armoryData';
import type { ArmoryContext } from '../../../src/armoryState';

/**
 * A hand-built world for the loadout editor's tests: `test/armoryState.test.ts`'s arsenal and `mission.rdr` valves (the
 * game's ids, the valves as a map spells them), so the editor is held to the very rules the ARMORY's table is.
 */
const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const item = (name: string, id: number, extra: [string, RdrNode][] = []): RdrNode[] =>
  rec(['InternalName', name], ['ID', String(id)], ['AMMO_TYPES', []], ...extra);
export const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [
  item('M16A2', 51), item('M4A1', 54), item('HK5', 31), item('AK-47', 58), item('870', 84),
  item('Mark 23', 15), item('M9', 5), item('F57', 4),
  item('M67', 121), item('AN-M8', 122), item('HE', 126), item('C4', 151), item('Claymore', 153), item('PMN Mine', 158),
  item('Double Ammo Load', 194), item('LAW', 145, [['SlotCost', '2']]), item('LAW HEAT', 185),
]] as RdrNode);
export const valves = new Map([
  ['Enable_M16', 1], ['Enable_m4Acarbine', 1], ['Enable_mp5', 9], ['Enable_ak47', 8], ['Enable_870', 17],
  ['Enable_Mark23', 1], ['Enable_beretta_m9', 9], ['Enable_fiveseven', 8],
  ['Enable_frag', 9], ['Enable_smoke', 9], ['Enable_HEgren', 9], ['Enable_c4', 17], ['Enable_claymore', 1], ['Enable_pmn', 8],
  ['Enable_2xammo', 9], ['Enable_LAW', 9],
]);
export const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
export const SEAL_KITS = [kit(54, 15, 121, 126, 194), kit(84, 15, 121, 122, 194), kit(31, 15, 121, 126, 194), kit(51, 5, 121, 153, 194)];
export const TERR_KITS = [kit(58, 4, 121, 126, 158), kit(58, 4, 121, 122, 158), kit(58, 4, 121, 126, 194), kit(58, 4, 158, 126, 121)];
export const seal: ArmoryContext = { arsenal, valves, side: 'seal', kits: SEAL_KITS, fourthOpen: true, eqLimit: 0, comeFromLan: false };
export const terr: ArmoryContext = { ...seal, side: 'terrorist', kits: TERR_KITS };

/** The mission's data as `armoryFromDisc(..., { world: true })` answers it, reduced to what the context reads. */
export function missionData(archive = 'MP2', worldValves: Map<string, number> = valves): ArmoryData {
  const characters = [
    ...SEAL_KITS.map((loadout, index) => ({ side: 'seal' as const, index, loadout })),
    ...TERR_KITS.map((loadout, index) => ({ side: 'terrorist' as const, index, loadout })),
  ];
  return {
    archive, layout: { objects: [], controls: [], models: [], scripts: [] } as unknown as ArmoryData['layout'], uiSounds: [], scripts: [], items: [], strings: [],
    fonts: [], models: [], modelTextures: [], bitmaps: [], light: null, missing: [],
    roster: { equipmentLibrary: null, equipmentStem: null, missionTitle: 'FROSTFIRE', characters } as unknown as ArmoryData['roster'],
    world: { arsenal, valves: worldValves },
  };
}
