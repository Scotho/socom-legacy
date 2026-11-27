import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAP_TABLE, MAP_TYPE_WORDS, MAP_VARIANTS, isMapStem, mapDisplayName, mapLabel, mapRow, mapVariant, titleCase, variantName, variantTitle,
} from '../src/mapNames';

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

/**
 * DAY-1 (`docs/plans/2026-11-23-day-mode.md`, DAY.R2, product track): a variant is the pair (stem, time) -- MP5 day,
 * MP64 day, MP6 night -- one table beside MAP_TABLE; its names are the row's name plus the word, never a new literal of
 * the map's name. A variant is in the release's offer once the owner accepts it (DAY.R7 flips `accepted`; DAY-R1: MP5 day).
 */
describe('the map variants (DAY-1, DAY.R2)', () => {
  // DAY-RN1 (the owner, 2026-11-24 ~17:52Z: "prepare the day version the same way we did abandoned"): Rat's Nest (Day),
  // MP8, a fourth pair -- accepted by the owner from its stills (MISSION OT.R158, 2026-11-25: "rats nest day: accepted").
  it('holds the four pairs, each built on its MAP_TABLE row', () => {
    expect(MAP_VARIANTS.map((v) => [v.stem, v.level, v.variant, v.word])).toEqual([
      ['MP5', 5, 'day', 'DAY'], ['MP64', 64, 'day', 'DAY'], ['MP6', 6, 'night', 'NIGHT'], ['MP8', 8, 'day', 'DAY'],
    ]);
    for (const v of MAP_VARIANTS) {
      expect(mapRow(v.stem), v.stem).toBeDefined();
      expect(v.stem).toBe(`MP${v.level}`);
    }
  });

  // DAY-R1 (DAY.R7): the owner accepted Abandoned (Day) for v0.4.32 (2026-11-24 ~05:20Z, the plan's Log), and Rat's
  // Nest (Day) (MISSION OT.R158, 2026-11-25, verbatim: "rats nest day: accepted, using 5. Sky MP2, foc current[17,18,23]
  // option"); Shadow Falls (Day) and Desert Glory (Night) stay out until he accepts their stills. The accepted set is pinned whole.
  it('offers only the accepted variants: MP5 day (DAY-R1) and MP8 day (OT.R158)', () => {
    expect(MAP_VARIANTS.filter((v) => v.accepted).map((v) => [v.stem, v.variant])).toEqual([['MP5', 'day'], ['MP8', 'day']]);
  });

  it("names each variant in the disc's caps and in the launcher's case", () => {
    expect([variantName(5, 'day'), variantTitle(5, 'day')]).toEqual(['ABANDONED (DAY)', 'Abandoned (Day)']);
    expect([variantName(64, 'day'), variantTitle(64, 'day')]).toEqual(['SHADOW FALLS (DAY)', 'Shadow Falls (Day)']);
    expect([variantName(6, 'night'), variantTitle(6, 'night')]).toEqual(['DESERT GLORY (NIGHT)', 'Desert Glory (Night)']);
    expect([variantName(8, 'day'), variantTitle(8, 'day')]).toEqual(["RAT'S NEST (DAY)", "Rat's Nest (Day)"]);
    for (const v of MAP_VARIANTS) {
      expect(variantName(v.level, v.variant)).toBe(`${mapRow(v.level)!.name} (${v.word})`);
      expect(variantTitle(v.level, v.variant)).toBe(`${mapRow(v.level)!.title} (${titleCase(v.word)})`);
    }
  });

  it('finds a pair by stem or level alike, and refuses a pair off the table', () => {
    for (const v of MAP_VARIANTS) {
      expect(mapVariant(v.stem, v.variant)).toBe(v);
      expect(mapVariant(v.stem.toLowerCase(), v.variant)).toBe(v);
      expect(mapVariant(v.level, v.variant)).toBe(v);
    }
    expect(mapVariant('MP2', 'day')).toBeUndefined();
    expect(mapVariant('MP5', 'night')).toBeUndefined();
    expect(mapVariant(64, 'night')).toBeUndefined();
    expect(mapVariant(8, 'night')).toBeUndefined();
    expect(mapVariant('MP99', 'day')).toBeUndefined();
    expect(mapVariant(5.5, 'day')).toBeUndefined();
    expect(variantName(5, 'night')).toBeUndefined();
    expect(variantTitle('MP2', 'day')).toBeUndefined();
  });
});
