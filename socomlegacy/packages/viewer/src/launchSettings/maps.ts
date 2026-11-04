import type { MapInfo } from '@s2u/archive';
import { rankOf, sortByPopularity } from '../mapOrder';

/**
 * The test room's map tiles (LAUNCH_SETTINGS_ADAPTATION). The 22 multiplayer archives, stem and the archive's own
 * description, as pinned in `packages/archive/test/golden/map-archives.json`. `launchSettings.test.ts` holds this list
 * to that pin. Order is the picker's (`../mapOrder` `sortByPopularity`). Last Bastion, After Hours and
 * Liberation are on the popularity list and not on the disc, so they are not here (`mapOrder.ts`). No picture: the
 * tile is the design system's blank frame. A stem that is not one of these is still typed in the map field.
 */

/** One disc map: `stem` is the address's `map=` value; `name` is the archive description, as the pin prints it. */
const DISC_MAPS: readonly { readonly stem: string; readonly name: string }[] = [
  { stem: 'MP1', name: 'BLIZZARD' },
  { stem: 'MP2', name: 'FROSTFIRE' },
  { stem: 'MP5', name: 'ABANDONED' },
  { stem: 'MP6', name: 'DESERT GLORY' },
  { stem: 'MP7', name: 'NIGHT STALKER' },
  { stem: 'MP8', name: "RAT'S NEST" },
  { stem: 'MP9', name: 'BITTER JUNGLE' },
  { stem: 'MP10', name: 'BLOOD LAKE' },
  { stem: 'MP11', name: 'DEATH TRAP' },
  { stem: 'MP12', name: 'THE RUINS' },
  { stem: 'MP51', name: 'VIGILANCE' },
  { stem: 'MP52', name: 'THE MIXER' },
  { stem: 'MP53', name: 'FOXHUNT' },
  { stem: 'MP61', name: 'SUJO' },
  { stem: 'MP62', name: 'ENOWAPI' },
  { stem: 'MP64', name: 'SHADOW FALLS' },
  { stem: 'MP71', name: 'FISH HOOK' },
  { stem: 'MP72', name: 'CROSSROADS' },
  { stem: 'MP73', name: 'SANDSTORM' },
  { stem: 'MP81', name: 'CHAIN REACTION' },
  { stem: 'MP82', name: 'GUIDANCE' },
  { stem: 'MP83', name: 'REQUIEM' },
];

export interface LaunchMap {
  /** The address's `map=` value (`MP2`). */
  readonly stem: string;
  /** The popularity list's name when it has one (`Frostfire`, `Fox Hunt`), else the archive description. */
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
