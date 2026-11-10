import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAP_TABLE, MAP_TYPE_WORDS, isMapStem, mapDisplayName, mapLabel, mapRow, titleCase } from '../src/mapNames';

/**
 * MN-1 (OT.R113, product track): the one map-name table every public surface names a map from. The 22 disc rows are
 * the disc's own `mission.rdr` descriptions, pinned in `golden/map-archives.json`; the three HDD rows are research 342
 * line 122 and the HD-pack plan's HD.R6 (a reading). The title is the description in the disc's own mixed case: each
 * word's first letter kept, the rest lowered -- the form `mp_rooms.rdr`'s game names take (ONL-33's pin,
 * `tools/test/onlineDialogs.pinned.json`), checked here against every map that pin names.
 */
const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(here, 'golden/map-archives.json'), 'utf8')) as { archives: { stem: string; name: string }[] };
const pinned = JSON.parse(readFileSync(resolve(here, '../../../tools/test/onlineDialogs.pinned.json'), 'utf8')) as { mpRooms: { games: string[] }[] };

describe('the map table (MN-1)', () => {
  it('holds 25 rows: the 22 disc maps exactly as the golden pins them, then MP54, MP63, MP74', () => {
    expect(MAP_TABLE).toHaveLength(25);
    const disc = MAP_TABLE.filter((r) => r.source === 'disc');
    expect(disc.map((r) => ({ stem: r.stem, name: r.name }))).toEqual(golden.archives.map((a) => ({ stem: a.stem, name: a.name })));
    expect(MAP_TABLE.filter((r) => r.source === 'hdd').map((r) => [r.stem, r.name])).toEqual([
      ['MP54', 'LAST BASTION'], ['MP63', 'AFTER HOURS'], ['MP74', 'LIBERATION'],
    ]);
    for (const r of MAP_TABLE) expect(r.stem).toBe(`MP${r.level}`);
    expect(new Set(MAP_TABLE.map((r) => r.level)).size).toBe(25);
  });

  it('titles every row in the disc\'s own case, and every title the mp_rooms.rdr pin names matches it', () => {
    expect(MAP_TABLE.map((r) => r.title)).toEqual([
      'Blizzard', 'Frostfire', 'Abandoned', 'Desert Glory', 'Night Stalker', "Rat's Nest", 'Bitter Jungle', 'Blood Lake',
      'Death Trap', 'The Ruins', 'Vigilance', 'The Mixer', 'Foxhunt', 'Sujo', 'Enowapi', 'Shadow Falls', 'Fish Hook',
      'Crossroads', 'Sandstorm', 'Chain Reaction', 'Guidance', 'Requiem', 'Last Bastion', 'After Hours', 'Liberation',
    ]);
    const single = new Map<number, string>();
    for (const room of pinned.mpRooms) {
      for (const g of room.games) {
        const [name, , , levels] = g.split(' | ');
        const list = levels!.trim().split(/\s+/);
        if (list.length === 1) single.set(Number(list[0]), name!);
      }
    }
    let seen = 0;
    for (const r of MAP_TABLE) {
      const n = single.get(r.level);
      if (n === undefined || n.startsWith('TBD ')) continue;   // map 53 and 62 are "TBD MP53" / "TBD MP62" there (research 342 §1.4)
      expect(r.title, r.stem).toBe(n);
      seen++;
    }
    expect(seen).toBe(20);                                    // the 22 less 53, 62 (TBD) and the unlisted 64, plus After Hours (63)
    expect(titleCase("RAT'S NEST")).toBe("Rat's Nest");
    expect(titleCase('FOXHUNT')).toBe('Foxhunt');
  });

  it('types every row: the disc rows missionlist.rdr\'s TYPE (research 192), After Hours Suppression, the other two the owner\'s list', () => {
    const t = (stem: string): string => MAP_TYPE_WORDS[mapRow(stem)!.type]!;
    expect([t('MP2'), t('MP72'), t('MP53'), t('MP61'), t('MP6')]).toEqual(['Suppression', 'Demolition', 'Escort', 'Breach', 'Extraction']);
    expect([t('MP54'), t('MP63'), t('MP74')]).toEqual(['Breach', 'Suppression', 'Escort']);
  });

  it('names a map by stem or level, never by its code: Unknown map for anything off the table', () => {
    expect(mapDisplayName('MP72')).toBe('Crossroads');
    expect(mapDisplayName('mp2')).toBe('Frostfire');
    expect(mapDisplayName(72)).toBe('Crossroads');
    expect(mapDisplayName(63)).toBe('After Hours');
    expect(mapDisplayName('MP54')).toBe('Last Bastion');
    expect(mapDisplayName('MP74')).toBe('Liberation');
    for (const bad of ['MP99', 99, 0, -1, 1.5, '', 'Frostfire', 'MP', 'blank:MP2', Number.NaN]) {
      expect(mapDisplayName(bad), String(bad)).toBe('Unknown map');
    }
    for (const r of MAP_TABLE) expect(mapDisplayName(r.stem)).not.toMatch(/\bMP\d{1,2}\b/);
  });

  it('mapLabel: a stem or a known disc name becomes its title, any other text passes as it is', () => {
    expect(mapLabel('MP2')).toBe('Frostfire');
    expect(mapLabel('MP99')).toBe('Unknown map');
    expect(mapLabel('FROSTFIRE')).toBe('Frostfire');                    // review F5: a known disc name in Title case
    expect(mapLabel('SOMETHING NEW')).toBe('SOMETHING NEW');
    expect(mapLabel('--')).toBe('--');
    expect(isMapStem('MP2')).toBe(true);
    expect(isMapStem('MP2/classic')).toBe(false);
  });
});
