import type { MapInfo } from '@s2u/archive';
import { MAP_TABLE } from '@s2u/archive/mapNames';
import { rankOf, sortByPopularity } from '../mapOrder';

/**
 * The test room's map tiles (LAUNCH_SETTINGS_ADAPTATION). The 22 multiplayer archives, stem and the archive's own
 * description, as pinned in `packages/archive/test/golden/map-archives.json`. `launchSettings.test.ts` holds this list
 * to that pin. Order is the picker's (`../mapOrder` `sortByPopularity`). Last Bastion, After Hours and
 * Liberation are on the popularity list and not on the disc, so they are not here (`mapOrder.ts`). No picture: the
 * tile is the design system's blank frame. A stem that is not one of these is still typed in the map field.
 */

/**
 * One disc map: `stem` is the address's `map=` value; `name` is the archive description, as the pin prints it. MN-1
 * (OT.R113): the rows are `@s2u/archive`'s one name table's disc rows (`MAP_TABLE`), no longer a copy of it.
 */
const DISC_MAPS: readonly { readonly stem: string; readonly name: string }[] =
  MAP_TABLE.filter((m) => m.source === 'disc').map((m) => ({ stem: m.stem, name: m.name }));

export interface LaunchMap {
  /** The address's `map=` value (`MP2`). */
  readonly stem: string;
  /** The popularity list's name when it has one (`Frostfire`, `Foxhunt`: the name table's title), else the archive description. */
  readonly name: string;
  /** The popularity list's game type, when the list knows the map. */
  readonly mode: string;
}

/** The 22 maps in popularity order, for the tiles. */
export function launchMaps(): LaunchMap[] {
  const infos: MapInfo[] = DISC_MAPS.map((m) => ({ archive: m.stem, path: `RUN/${m.stem}.ZDB`, name: m.name }));
  return sortByPopularity(infos).map((m) => {
    const rank = rankOf(m.name);
    return { stem: m.archive, name: rank?.name ?? m.name, mode: rank?.mode ?? '' };
  });
}
