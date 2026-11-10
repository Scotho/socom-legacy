import type { MapInfo } from '@s2u/archive';
import { MAP_TYPE_WORDS, mapRow } from '@s2u/archive/mapNames';

/**
 * The map picker's order: the owner's popularity ranking of the multiplayer maps (2026-09-21), most played
 * first. `mode` is the map's game type. Names are matched to the archive's own `mission.rdr` description with
 * spaces and punctuation ignored, so "Foxhunt" finds FOXHUNT and "Rat's Nest" finds RAT'S NEST.
 *
 * Last Bastion, After Hours and Liberation are on the list but not on the r0001 disc (they were later
 * additions), so they never appear in the picker.
 */
export interface MapRank {
  readonly name: string;
  readonly mode: string;
  readonly popularity: string;
}

/**
 * The owner's order (2026-09-21) by stem, with his popularity words. MN-1 (OT.R113): each row's `name` and `mode` are
 * `@s2u/archive`'s one name table's (`MAP_TABLE` `title`, `MAP_TYPE_WORDS[type]`) -- the same words the list held, but
 * "Fox Hunt", now the disc's own "Foxhunt" (`normaliseName` finds FOXHUNT by either).
 */
const POPULARITY: readonly (readonly [stem: string, popularity: string])[] = [
  ['MP72', 'Legendary'], ['MP6', 'Legendary'], ['MP2', 'Legendary'],
  ['MP71', 'Extremely high'], ['MP7', 'Extremely high'],
  ['MP1', 'Very high'], ['MP12', 'Very high'], ['MP51', 'Very high'],
  ['MP53', 'High'], ['MP61', 'High'], ['MP81', 'High'],
  ['MP82', 'High/moderate'],
  ['MP62', 'Moderate'], ['MP83', 'Moderate'], ['MP52', 'Moderate'], ['MP73', 'Moderate'],
  ['MP64', 'Lower / cult favorite'], ['MP5', 'Lower in S2'], ['MP11', 'Lower / cult favorite'], ['MP10', 'Lower / cult favorite'],
  ['MP9', 'Lower'], ['MP8', 'Lower in S2'],
  ['MP54', 'Limited exposure'], ['MP63', 'Limited exposure'], ['MP74', 'Limited exposure'],
];

export const MAP_POPULARITY: readonly MapRank[] = POPULARITY.map(([stem, popularity]) => {
  const row = mapRow(stem)!;
  return { name: row.title, mode: MAP_TYPE_WORDS[row.type], popularity };
});

/** "Rat's Nest", "RAT'S NEST" and "ratsnest" all become "ratsnest". */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const RANK_BY_NAME = new Map(MAP_POPULARITY.map((m, i) => [normaliseName(m.name), i] as const));

/** The rank entry for an archive's display name, or undefined for a map the list does not know. */
export function rankOf(name: string): MapRank | undefined {
  const i = RANK_BY_NAME.get(normaliseName(name));
  return i === undefined ? undefined : MAP_POPULARITY[i];
}

/**
 * Maps in popularity order. Maps the list does not know keep their incoming (archive-number) order and follow
 * the ranked ones, so a map is never dropped from the picker.
 */
export function sortByPopularity(maps: readonly MapInfo[]): MapInfo[] {
  const indexed = maps.map((m, i) => ({ m, i, rank: RANK_BY_NAME.get(normaliseName(m.name)) ?? Infinity }));
  indexed.sort((a, b) => (a.rank === b.rank ? a.i - b.i : a.rank - b.rank));
  return indexed.map((x) => x.m);
}

/** The picker label: the archive's own name, its game type when known, and the archive id. */
export function labelFor(m: MapInfo): string {
  const rank = rankOf(m.name);
  return rank ? `${m.name} · ${rank.mode} (${m.archive})` : `${m.name} (${m.archive})`;
}
