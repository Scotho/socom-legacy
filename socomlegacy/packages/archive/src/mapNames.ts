/**
 * MN-1 (OT.R113, the owner 2026-11-07: "Everywhere that we do public facing UI (replays etc), we should always use the
 * display name not the map code"): the one map-name table. Product track (OT.R53): it names maps on the launcher's
 * pages, the lobby card, `/api/live` and Discord, and changes nothing the game does. The original's own screens keep
 * the disc's strings (GAME DETAILS, CREATE GAME, the loading screen read `missionlist.rdr` / `mission.rdr` at run time);
 * the stem (`MP72`) stays in URLs, room keys, replay headers, the APIs, logs and dev tooling.
 *
 * Its sources, by row:
 * - **The 22 disc maps**: `name` is each archive's `READERM.ZAR/mission.rdr` `description` (`./mapIndex` `mapName`),
 *   as `test/golden/map-archives.json` pins it off the disc; `type` is `READERC.ZAR/missionlist.rdr`'s TYPE for the
 *   map (research 192; `viewer/test/rules.test.ts` reads it off the disc; central's `lobbyCard.ts` `MAP_TYPES`).
 * - **The three HDD maps** (MP54, MP63, MP74; not on the r0001 disc): the names their packages' headers carry
 *   (`docs/plans/2026-10-31-hd-texture-pack-parity.md` HD.R6: AFTER HOURS = MP63, LIBERATION = MP74, LAST BASTION =
 *   MP54) and research 342 line 122 (map 63 "After Hours" in the disc's `mp_rooms.rdr`) -- a reading. After Hours'
 *   type is Suppression by `mp_rooms.rdr` (its "Suppression Medley" lists 63, research 342 §1.4); Last Bastion's
 *   (Breach) and Liberation's (Escort) are the owner's popularity list's (`viewer/src/mapOrder.ts`, 2026-09-21), no
 *   source in the original read yet -- used by no rule, only beside a name.
 *
 * `title` is `name` in the disc's own mixed case (`titleCase`): each word's first letter kept, the rest lowered, the
 * form the disc's `mp_rooms.rdr` game names take ("Rat's Nest", "The Mixer", "After Hours"; ONL-33's pin,
 * `tools/test/onlineDialogs.pinned.json`; `test/mapNames.test.ts` checks all 20 it names). FOXHUNT is one word on the
 * disc (`mission.rdr`), so it is "Foxhunt" (research 342 §1.4 writes it so); the popularity list's "Fox Hunt" is not
 * the disc's.
 */

/** missionlist.rdr's TYPE numbers (research 192): 1 BREACH, 2 DEMOLITION, 3 ESCORT, 4 EXTRACTION, 5 SUPPRESSION. */
export type MapType = 1 | 2 | 3 | 4 | 5;

/** A TYPE's word in the launcher's case (the popularity list's `mode`; GAME DETAILS' own words are `@s2u/ui`'s). */
export const MAP_TYPE_WORDS: Readonly<Record<MapType, string>> = {
  1: 'Breach', 2: 'Demolition', 3: 'Escort', 4: 'Extraction', 5: 'Suppression',
};

export interface MapRow {
  /** The archive's stem (`MP72`): the address's `map=`, the room key's head, the replay header's `map`. */
  readonly stem: string;
  /** The map number (the stem's digits; the lobby's GameLevel). */
  readonly level: number;
  /** The disc's own description, upper case (`CROSSROADS`). */
  readonly name: string;
  /** The display name (`Crossroads`): `titleCase(name)`. */
  readonly title: string;
  /** missionlist.rdr's TYPE. */
  readonly type: MapType;
  /** Where the row is read: the disc's archives, or the HDD packages (a reading, see the header). */
  readonly source: 'disc' | 'hdd';
}

/** "RAT'S NEST" -> "Rat's Nest": each space-separated word's first letter kept, the rest lowered. */
export function titleCase(name: string): string {
  return name.split(' ').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ');
}

const row = (level: number, name: string, type: MapType, source: 'disc' | 'hdd' = 'disc'): MapRow =>
  ({ stem: `MP${level}`, level, name, title: titleCase(name), type, source });

/** The 25 maps: the 22 disc archives in the golden's (archive-number) order, then the three HDD maps. */
export const MAP_TABLE: readonly MapRow[] = [
  row(1, 'BLIZZARD', 2),
  row(2, 'FROSTFIRE', 5),
  row(5, 'ABANDONED', 5),
  row(6, 'DESERT GLORY', 4),
  row(7, 'NIGHT STALKER', 2),
  row(8, "RAT'S NEST", 5),
  row(9, 'BITTER JUNGLE', 2),
  row(10, 'BLOOD LAKE', 4),
  row(11, 'DEATH TRAP', 4),
  row(12, 'THE RUINS', 2),
  row(51, 'VIGILANCE', 5),
  row(52, 'THE MIXER', 3),
  row(53, 'FOXHUNT', 3),
  row(61, 'SUJO', 1),
  row(62, 'ENOWAPI', 1),
  row(64, 'SHADOW FALLS', 5),
  row(71, 'FISH HOOK', 4),
  row(72, 'CROSSROADS', 2),
  row(73, 'SANDSTORM', 1),
  row(81, 'CHAIN REACTION', 5),
  row(82, 'GUIDANCE', 3),
  row(83, 'REQUIEM', 2),
  row(54, 'LAST BASTION', 1, 'hdd'),
  row(63, 'AFTER HOURS', 5, 'hdd'),
  row(74, 'LIBERATION', 3, 'hdd'),
];

const BY_LEVEL = new Map(MAP_TABLE.map((r) => [r.level, r] as const));
const STEM = /^MP(\d{1,3})$/i;

/** Whether a text is a map stem (`MP2`, `mp72`): a code to be named, never shown. */
export function isMapStem(text: string): boolean {
  return STEM.test(text);
}

/** The row for a stem (`MP72`, any case) or a level (72); undefined off the table. */
export function mapRow(stemOrLevel: string | number): MapRow | undefined {
  if (typeof stemOrLevel === 'number') return Number.isInteger(stemOrLevel) ? BY_LEVEL.get(stemOrLevel) : undefined;
  const m = STEM.exec(stemOrLevel);
  return m ? BY_LEVEL.get(Number(m[1])) : undefined;
}

/** The text said for a map off the table: never its code. */
export const UNKNOWN_MAP = 'Unknown map';

/** A map's display name by stem or level (`Crossroads`); `Unknown map` for anything else -- never the code. */
export function mapDisplayName(stemOrLevel: string | number): string {
  return mapRow(stemOrLevel)?.title ?? UNKNOWN_MAP;
}

const BY_NAME = new Map(MAP_TABLE.map((r) => [r.name, r] as const));

/**
 * A map text for one of the launcher's own surfaces: a stem becomes its display name (`Unknown map` off the table); a
 * known map's disc name (`FROSTFIRE`, read off `missionlist.rdr` once the disc is in) becomes its title, so the
 * launcher says a map one way before and after the disc (MN-1's review F5, the controller's call on the product track;
 * the original's own screens keep the disc's caps and never come through here); any other text -- a blank floor's
 * words, `--`, a name the table does not hold -- passes as it is.
 */
export function mapLabel(text: string): string {
  if (isMapStem(text)) return mapDisplayName(text);
  return BY_NAME.get(text.toUpperCase())?.title ?? text;
}
