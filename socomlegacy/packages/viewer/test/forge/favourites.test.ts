import { describe, expect, it } from 'vitest';
import { assetsShown, FAVOURITES_KEY, readFavourites, toggleFavourite, writeFavourites } from '../../src/forge/favourites';
import { PAGE_SETTING_KEYS } from '../../src/pageStore';
import { floorGround, layoutGround } from '../../src/forge/ground';
import { hullSegments } from '../../src/forge/hull';

/** FORGE: favourites lead the list and are a filter of their own, across archives; kept in this browser. */
const e = (archive: string, model: string, placed = 1) => ({ asset: `${archive}:${model}`, model, placed });
const pal = [e('MP2', 'barrel'), e('MP2', 'crate'), e('MP2', 'drum')];

describe('FORGE: favourites', () => {
  it('lead the archive\'s list, starred, the rest after them in order', () => {
    const shown = assetsShown(pal, new Set(['MP2:drum']), 'all', '');
    expect(shown.map((s) => [s.model, s.fav])).toEqual([['drum', true], ['barrel', false], ['crate', false]]);
  });

  it('are a filter of their own, from every archive, the query applied', () => {
    const favs = new Set(['MP2:drum', 'M51:oaktree_near', 'MP2:crate']);
    expect(assetsShown(pal, favs, 'favs', '').map((s) => s.asset)).toEqual(['M51:oaktree_near', 'MP2:crate', 'MP2:drum']);
    expect(assetsShown(pal, favs, 'favs', 'OAK').map((s) => s.asset)).toEqual(['M51:oaktree_near']);
    expect(assetsShown(pal, favs, 'favs', '')[0]).toMatchObject({ model: 'oaktree_near', archive: 'M51', placed: null });
  });

  it('toggle, and read back what was written; a broken store reads as none', () => {
    // Through the page's store (`../pageStore` `pageSettings`'s get / set), never the browser's storage itself.
    const store = new Map<string, string>();
    const s = { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => { store.set(k, v); return { ok: true as const }; } };
    const favs = toggleFavourite(toggleFavourite(new Set(), 'MP2:crate'), 'MP2:drum');
    writeFavourites(favs, s);
    expect([...readFavourites(s)].sort()).toEqual(['MP2:crate', 'MP2:drum']);
    expect([...toggleFavourite(favs, 'MP2:crate')]).toEqual(['MP2:drum']);
    store.set('s2u-forge-favourites', '{nope');
    expect(readFavourites(s).size).toBe(0);
    expect(readFavourites({ get: () => { throw new Error('blocked'); }, set: () => ({ ok: true as const }) }).size).toBe(0);
    expect(PAGE_SETTING_KEYS).toContain(FAVOURITES_KEY);
  });
});

describe('FORGE: the hull drawn', () => {
  it('is each polygon\'s edges as line segments, ground and walls told apart by colour', () => {
    const { positions, colors } = hullSegments(layoutGround(floorGround(100), []));
    expect(positions.length).toBe(4 * 2 * 3);                     // a quad: four edges, two ends, xyz
    expect(colors.length).toBe(positions.length);
    expect([...positions.slice(0, 6)]).toEqual([-50, 0, -50, 50, 0, -50]);
  });
});
