import { MAP_TABLE } from './mapNames';

/**
 * The campaign's twelve mission archives, as the US disc's `RUN/` holds them (`RUN/M51.ZDB` .. `RUN/M83.ZDB`, 14.7-17.3 MB
 * each; research 82 §1.1 reads M51). One list, two readers: the forge's and the devmode test room's workers probe the
 * served tree for them (`@s2u/viewer` `forge/servedPaths.ts` `servedCampaignPaths`), and `tools/extract-maps.ts` copies them there by default
 * (FG-22, FG.R16, FG.R25). They are not map archives in `MAP_ARCHIVE`'s sense: no index lists them (`listMaps` takes `MP<n>` only).
 * CMV-0: kept in this leaf (no reader imported) so `DISC_ARCHIVE_STEMS` beside it is free of heavy imports; `./mapIndex`
 * re-exports it unchanged.
 */
export const CAMPAIGN_STEMS = ['M51', 'M52', 'M53', 'M61', 'M62', 'M63', 'M71', 'M72', 'M73', 'M81', 'M82', 'M83'] as const;

/**
 * CMV-0 (LATER 963; product track, an admission rule of ours -- the original had no community hosts, OT.R27, and changes
 * nothing the game does): **the archives of SOCOM II's own disc**, the only ones a Forge lobby may name (its base, a blank
 * floor's library, a placed thing's source), a placement may ask a host for, an offer may list and a host hashes -- the
 * `'disc'` rows of `MAP_TABLE` as `MP<level>` (the 22 maps, `./mapNames`) and the campaign's 12 (`CAMPAIGN_STEMS`): 34
 * stems, upper case. It is the same set as central's digest table's `.ZDB` rows (`packages/central/src/discDigests.json`,
 * `central/test/discArchiveTable.test.ts`), so every archive admitted has a digest to compare a host's with.
 *
 * **The three HDD maps are not on it** (MP54 LAST BASTION, MP63 AFTER HOURS, MP74 LIBERATION): they are named in
 * `MAP_TABLE` (rows `'hdd'`), but the original distributed them as sets of loose files, never as `RUN/MP<n>.ZDB`, so
 * there is no archive of that name to compare with and no digest row for one. They are admitted when a reader for those
 * file sets and a digest per member exist (a later row). Nor is the blank floor's `FLOOR` (no archive in the game) nor
 * any other name, whatever its shape.
 */
export const DISC_ARCHIVE_STEMS: readonly string[] = Object.freeze([
  ...MAP_TABLE.filter((r) => r.source === 'disc').map((r) => r.stem.toUpperCase()),
  ...CAMPAIGN_STEMS,
]);

const DISC = new Set<string>(DISC_ARCHIVE_STEMS);

/**
 * Whether `name` is one of the disc's archives by its stem (`MP2`, `mp2`, `M83`): an exact match without case. A path
 * (`RUN/MP2.ZDB`), a padded number (`MP02`), an empty name, `FLOOR` and the HDD maps' names are not.
 */
export function isDiscArchiveStem(name: string): boolean {
  return typeof name === 'string' && DISC.has(name.toUpperCase());
}
