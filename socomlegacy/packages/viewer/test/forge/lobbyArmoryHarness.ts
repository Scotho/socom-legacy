// The lobby window ARMORY tests' shared stand-ins (lobbyArmory.test.ts, lobbyArmoryRoom.test.ts): the recording
// screen and the small map and arsenal. It imports nothing the public export leaves out, so the public test keeps it.
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, type ArmoryCharacter, type Loadout, type MapArsenal } from '@s2u/scene';
import type { ArmoryDeps, ArmoryWorld } from '../../src/armory';
import type { ArmoryData } from '../../src/armoryData';
import type { PadButton } from '../../src/gamepad';
import type { SimKits } from '../../src/loadout';
import { EMPTY_ARSENAL } from '../../src/forge/arsenalSetting';
import type { ArsenalSetting } from '../../src/forge/layout';
import type { ArmoryLike } from '../../src/forge/lobby/lobbyArmory';

/** A stand-in for the extracted screen: what the window's part asks of it, recorded. */
export function fakeArmory() {
  const log: string[] = [];
  let open = false;
  let deps: ArmoryDeps | null = null;
  const st = { world: null as ArmoryWorld | null, opened: [] as unknown[], pads: [] as string[][], inputs: [] as (string | null)[], taps: [] as [number, number][], sizes: [] as Record<string, unknown>[], frames: 0 };
  const make = (d: ArmoryDeps): ArmoryLike => {
    deps = d;
    return {
      setData: () => { log.push('data'); },
      setWorld: (w) => { st.world = w; log.push('world'); },
      open: (cur) => { st.opened.push(cur); open = true; return true; },
      isOpen: () => open,
      frame: () => { st.frames++; },
      pad: (p: ReadonlySet<PadButton>) => { st.pads.push([...p]); return open; },
      input: (i) => { st.inputs.push(i); return open; },
      taking: () => open,
      tap: (x, y) => { st.taps.push([x, y]); return open; },
      close: () => { if (open) { open = false; d.closed?.(); } },
      quads: (sizes) => { st.sizes.push(sizes); return []; },
      models: () => [],
    };
  };
  return { make, log, st, deps: () => deps!, shut: () => { open = false; deps!.closed?.(); } };
}

// ---- a small map and arsenal (the shape of `arsenalSetting.test.ts`'s): two SEAL types, one Terrorist ----------------

const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const weapon = (name: string, id: number): RdrNode[] => rec(
  ['InternalName', name], ['DisplayName', name.toUpperCase()], ['ID', String(id)], ['NumMags', '3'], ['Ammo_Capacity', '30'],
  ['AMMO_TYPES', [rec(['NAME', '5.56 x 45mm'])]], ['ModelName', name.toLowerCase()], ['IconTextureName', `${name}_icon.tif`],
);
export const ARSENAL = arsenalOf(['ZAMMO', [rec(['InternalName', '5.56 x 45mm'], ['ID', '8'])], 'ZWEAPON', [
  weapon('M4A1', 54), weapon('AK-47', 58), weapon('Mark 23', 15), weapon('M9', 5), weapon('M67', 121), weapon('HE', 126),
  weapon('PMN Mine', 158), weapon('C4', 151), weapon('Double Ammo Load', 194),
]]);
export const SEAL1: Loadout = [54, 15, 121, 126, 194] as unknown as Loadout;
export const SEAL2: Loadout = [54, 15, 126, 126, 194] as unknown as Loadout;
export const TERR1: Loadout = [58, 5, 121, 158, 126] as unknown as Loadout;
export const MAP: MapArsenal = {
  valves: new Map([['Enable_m4Acarbine', 1], ['Enable_ak47', 8], ['Enable_Mark23', 1], ['Enable_beretta_m9', 8], ['Enable_frag', 9],
    ['Enable_HEgren', 9], ['Enable_pmn', 8], ['Enable_2xammo', 9], ['Enable_c4', 0]]),
  selectable: { seal: [], terrorist: [] },
  kits: { seal: [{ type: 'Seal1', character: 'mp99_seal1', loadout: SEAL1 }, { type: 'Seal2', character: 'mp99_seal2', loadout: SEAL2 }],
    terrorist: [{ type: 'Terrorist1', character: 'mp99_terr1', loadout: TERR1 }] },
};
export const KITS = { table: { arsenal: ARSENAL, records: new Map(), rounds: new Map() }, map: MAP } as unknown as SimKits;

const character = (side: 'seal' | 'terrorist', index: number, column: ArmoryCharacter['column'], k: { type: string; character: string; loadout: Loadout }): ArmoryCharacter =>
  ({ column, side, index, type: k.type, character: k.character, model: null, textures: [], loadout: k.loadout, portrait: null });
/** The disc roster as `armoryRoster` reads it (the map's own kits), its SEALs listed out of index order. */
export function rosterData(): ArmoryData {
  return {
    archive: 'MP99', layout: {} as ArmoryData['layout'], uiSounds: [], scripts: [], items: [], strings: [], fonts: [], models: [], modelTextures: [], bitmaps: [],
    light: null, missing: [],
    roster: { equipmentLibrary: null, equipmentStem: null, missionTitle: null, characters: [
      character('seal', 1, 'Seal1', MAP.kits.seal[1]!), character('seal', 0, 'Seal2', MAP.kits.seal[0]!), character('terrorist', 0, 'Terr1', MAP.kits.terrorist[0]!),
    ] },
  };
}
export const setting = (o: Partial<ArsenalSetting>): ArsenalSetting => ({ ...EMPTY_ARSENAL, ...o, kits: { ...EMPTY_ARSENAL.kits, ...(o.kits ?? {}) } });
