import { describe, expect, it } from 'vitest';
import { MAP_TABLE, MAP_TYPE_WORDS } from '@s2u/archive';
import { launchMaps } from '../src/launchSettings/maps';
import { MAP_POPULARITY, rankOf } from '../src/mapOrder';

/**
 * MN-1 (OT.R113): the viewer's two map tables are the one name table's (`@s2u/archive` `MAP_TABLE`), not copies of it
 * -- the launch sheet's 22 disc maps (`launchSettings/maps.ts` `DISC_MAPS`, through `launchMaps`) and the popularity
 * list's 25 names and modes (`mapOrder.ts` `MAP_POPULARITY`). Their shapes are unchanged, so no caller changes.
 */
describe('MN-1: the viewer\'s map tables come from the one name table', () => {
  it('launchMaps: the 22 disc rows, each named by its title (the popularity list\'s name was the same title)', () => {
    const disc = MAP_TABLE.filter((r) => r.source === 'disc');
    const tiles = launchMaps();
    expect(tiles.map((t) => t.stem).sort()).toEqual(disc.map((r) => r.stem).sort());
    for (const t of tiles) {
      const row = disc.find((r) => r.stem === t.stem)!;
      expect(t.name, t.stem).toBe(row.title);
      expect(t.mode, t.stem).toBe(MAP_TYPE_WORDS[row.type]);
    }
  });

  it('MAP_POPULARITY: the owner\'s order of 25, each name and mode the table\'s; rankOf finds every row by the disc\'s name', () => {
    expect(MAP_POPULARITY).toHaveLength(25);
    expect(new Set(MAP_POPULARITY.map((m) => m.name))).toEqual(new Set(MAP_TABLE.map((r) => r.title)));
    for (const m of MAP_POPULARITY) {
      const row = MAP_TABLE.find((r) => r.title === m.name)!;
      expect(m.mode, m.name).toBe(MAP_TYPE_WORDS[row.type]);
      expect(rankOf(row.name), row.name).toBe(m);
    }
    expect(MAP_POPULARITY.slice(0, 3).map((m) => m.name)).toEqual(['Crossroads', 'Desert Glory', 'Frostfire']);
    expect(MAP_POPULARITY.find((m) => m.popularity === 'High' && m.mode === 'Escort')!.name).toBe('Foxhunt');   // the disc's word, not "Fox Hunt"
  });
});
