import { describe, expect, it } from 'vitest';
import { DISC_ARCHIVE_STEMS, isDiscArchiveStem } from '../src/discArchives';
import { CAMPAIGN_STEMS } from '../src/mapIndex';
import { MAP_TABLE } from '../src/mapNames';

/**
 * CMV-0 (LATER 963; product track): the one list of the archives of SOCOM II's own disc a lobby, a placement, an offer and
 * a host's hash admit -- `MAP_TABLE`'s 22 `'disc'` rows as `MP<level>` and the campaign's 12 (`CAMPAIGN_STEMS`), 34 stems,
 * upper case. The predicate matches a stem exactly, without case; a path, a padded number, an empty name, the blank
 * floor's `FLOOR` and the three HDD maps' names (`'hdd'` rows: no `RUN/MP<n>.ZDB` of theirs exists to compare with) are
 * not on it. Synthetic names only.
 */

describe('CMV-0: the disc\'s archives, one list', () => {
  it('34 stems: the 22 disc maps and the 12 campaign missions, upper case, once each', () => {
    expect(DISC_ARCHIVE_STEMS).toHaveLength(34);
    expect(new Set(DISC_ARCHIVE_STEMS).size).toBe(34);
    for (const s of DISC_ARCHIVE_STEMS) expect(s).toBe(s.toUpperCase());
    const maps = MAP_TABLE.filter((r) => r.source === 'disc').map((r) => r.stem);
    expect([...DISC_ARCHIVE_STEMS].sort()).toEqual([...maps, ...CAMPAIGN_STEMS].sort());
  });

  it('true for a disc stem in any case', () => {
    expect(isDiscArchiveStem('MP2')).toBe(true);
    expect(isDiscArchiveStem('mp2')).toBe(true);
    expect(isDiscArchiveStem('M83')).toBe(true);
  });

  it('false for the HDD maps, FLOOR, a name off the table, a padded number, a path and nothing', () => {
    for (const name of ['MP54', 'MP63', 'MP74', 'FLOOR', 'MP99', 'MP02', 'RUN/MP2.ZDB', '']) {
      expect(isDiscArchiveStem(name), name).toBe(false);
    }
  });
});
