import { ARMORY_COLUMNS, type ArmoryCharacter, type Loadout, type Side } from '@s2u/scene';
import type { ArmoryData } from '../armoryData';
import type { RosterPick } from './layout';

/**
 * The ARMORY's columns as the layout plays them (the owner, 2026-11-25: "when I set the default characters and weapons in
 * my map settings, it does not show correctly in the simulated lobby"; a browser adaptation, FG.R2): the screen reads its
 * columns, portraits and kits off the map's own `chartype.rdr` and `character.rdr` (`ArmoryData.roster`), so the layout's
 * Characters (`./rosterSetting`) and its spawn kits (`./arsenalSetting`) are put over that read here, before it opens:
 * - each side's columns the layout's (`columns`), in its order -- one of the map's own types, or another disc map's,
 *   whose character entry and portrait bitmap come from that map's own ARMORY read (`donor`, the portrait renamed
 *   `<map>_<name>` so two maps' bitmaps of one name never meet);
 * - each column's kit the one the match plays (`kitOf`: the composed map's `arsenal.map.kits`), so the screen's kit and
 *   the room's agree, and a pick replays over the same kit.
 * A column whose map or type is not read is left out. Nothing of the disc's data is changed: a new data object.
 */
export function armoryWithLayout(
  data: ArmoryData, home: string, columns: Readonly<Record<Side, readonly RosterPick[]>>,
  kitOf: (side: Side, index: number) => Loadout | null, donor: (stem: string) => ArmoryData | null,
): ArmoryData {
  const roster = data.roster;
  if (!roster) return data;
  const bitmaps = [...data.bitmaps];
  const characters: ArmoryCharacter[] = [];
  for (const side of ['seal', 'terrorist'] as const) {
    columns[side].slice(0, 4).forEach((pick, i) => {
      const src = pick.map === home ? data : donor(pick.map);
      const from = src?.roster?.characters.find((c) => c.side === side && c.index === pick.index);
      if (!src || !from) return;
      let portrait = from.portrait;
      if (src !== data && portrait) {
        const name = portrait.toLowerCase();
        const bitmap = src.bitmaps.find(([n]) => n === name);
        portrait = `${pick.map.toLowerCase()}_${portrait}`;
        if (bitmap && !bitmaps.some(([n]) => n === portrait!.toLowerCase())) bitmaps.push([portrait.toLowerCase(), bitmap[1]]);
      }
      characters.push({ ...from, column: ARMORY_COLUMNS[i + (side === 'terrorist' ? 4 : 0)]!, index: i, portrait, loadout: kitOf(side, i) ?? from.loadout });
    });
  }
  return { ...data, bitmaps, roster: { ...roster, characters } };
}
