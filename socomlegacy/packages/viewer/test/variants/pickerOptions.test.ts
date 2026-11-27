import { describe, expect, it } from 'vitest';
import { MAP_VARIANTS, variantName, type MapInfo } from '@s2u/archive';
import { loadVariantSearch, pickedVariant, pickerEntries, shownPickValue, variantPickValue, variantSearch, type VariantPick } from '../../src/variants/pickerOptions';

/**
 * DAY-PICK (product track: a browser adaptation, VARIANT_TESTROOM_ADAPTATION): the test room's map picker lists one more
 * option per accepted `MAP_VARIANTS` row, after its parent, whose value carries the pair; picking it loads the parent with
 * `?variant=` (`../../src/main` `onMapChange`), picking a plain map clears it. Read generically off the table: no stem here.
 */
const maps: MapInfo[] = [2, 5, 6, 8, 64].map((n) => ({ archive: `MP${n}`, path: `RUN/MP${n}.ZDB`, name: `MAP${n}` }));
const accepted = MAP_VARIANTS.filter((v) => v.accepted);
const unaccepted = MAP_VARIANTS.filter((v) => !v.accepted);

describe('pickerEntries (DAY-PICK)', () => {
  it('lists every plain map once, in order, with no variant', () => {
    const plain = pickerEntries(maps).filter((e) => !e.variant);
    expect(plain.map((e) => e.value)).toEqual(maps.map((m) => m.path));
  });

  it('adds one option per accepted variant, right after its parent, named variantName', () => {
    expect(accepted.length).toBeGreaterThan(0);
    const entries = pickerEntries(maps);
    for (const v of accepted) {
      const i = entries.findIndex((e) => e.variant === v.variant && e.map.archive === v.stem);
      expect(i, `${v.stem} ${v.variant}`).toBeGreaterThan(0);
      const parent = entries.findIndex((e) => !e.variant && e.map.archive === v.stem);
      expect(i).toBeGreaterThan(parent);
      expect(entries.slice(parent + 1, i).every((e) => e.map.archive === v.stem)).toBe(true);
      expect(entries[i]!.name).toBe(variantName(v.stem, v.variant));
    }
    expect(entries.filter((e) => e.variant).length).toBe(accepted.filter((v) => maps.some((m) => m.archive === v.stem)).length);
  });

  it('offers no unaccepted variant', () => {
    const entries = pickerEntries(maps);
    for (const v of unaccepted) expect(entries.some((e) => e.variant === v.variant && e.map.archive === v.stem)).toBe(false);
  });

  it("a variant option's value round-trips to its path, stem and variant; a plain path to no variant", () => {
    for (const v of accepted) {
      const value = variantPickValue(`RUN/${v.stem}.ZDB`, v.stem, v.variant);
      expect(pickedVariant(value)).toEqual({ path: `RUN/${v.stem}.ZDB`, stem: v.stem, variant: v.variant });
    }
    expect(pickedVariant('RUN/MP5.ZDB')).toEqual({ path: 'RUN/MP5.ZDB', stem: null, variant: null });
  });

  it('a value naming a pair off the accepted table is a plain pick (never a guess)', () => {
    for (const v of unaccepted) expect(pickedVariant(variantPickValue(`RUN/${v.stem}.ZDB`, v.stem, v.variant)).variant).toBeNull();
  });

  it('variantSearch sets ?variant= for a variant pick and clears it for a plain one, keeping the rest', () => {
    expect(variantSearch('?devmode&map=MP5', 'day')).toBe('?devmode=&map=MP5&variant=day');
    expect(variantSearch('?devmode&variant=day', null)).toBe('?devmode=');
    expect(variantSearch('', null)).toBe('');
  });

  it("shownPickValue selects a drawn variant's option, and the plain map's otherwise", () => {
    for (const v of accepted) expect(shownPickValue(`RUN/${v.stem}.ZDB`, v.stem, v.variant)).toBe(variantPickValue(`RUN/${v.stem}.ZDB`, v.stem, v.variant));
    for (const v of unaccepted) expect(shownPickValue(`RUN/${v.stem}.ZDB`, v.stem, v.variant)).toBe(`RUN/${v.stem}.ZDB`);
    expect(shownPickValue('RUN/MP5.ZDB', 'MP5', undefined)).toBe('RUN/MP5.ZDB');
    expect(shownPickValue('RUN/MP5.ZDB', 'MP5', 'dusk')).toBe('RUN/MP5.ZDB');
  });
});

describe('loadVariantSearch (DAY-PICK review: the pick is not sticky page state)', () => {
  const day = accepted.find((v) => v.variant === 'day')!;
  const other = maps.find((m) => m.archive !== day.stem)!.archive;
  const pick: VariantPick = { load: 3, stem: day.stem, variant: 'day' };

  it('applies a Day pick to the load the picker started, for that stem', () => {
    expect(new URLSearchParams(loadVariantSearch('?devmode', pick, 3, day.stem)).get('variant')).toBe('day');
    expect(new URLSearchParams(loadVariantSearch('?devmode', pick, 3, day.stem.toLowerCase())).get('variant')).toBe('day');
  });

  it('gives a later load of another stem no variant', () => {
    expect(loadVariantSearch('?devmode', pick, 4, other)).toBe('?devmode');
    expect(loadVariantSearch('?devmode', pick, 3, other)).toBe('?devmode');
  });

  it('gives a non-picker load exactly the URL, variant and all', () => {
    expect(loadVariantSearch('?variant=night&devmode', pick, 4, day.stem)).toBe('?variant=night&devmode');
    expect(loadVariantSearch('?variant=night', null, 7, other)).toBe('?variant=night');
    expect(loadVariantSearch('', pick, 4, day.stem)).toBe('');
  });

  it('a plain pick clears the URL variant for its own load only', () => {
    const plain: VariantPick = { load: 5, stem: null, variant: null };
    expect(new URLSearchParams(loadVariantSearch('?variant=day&devmode', plain, 5, day.stem)).get('variant')).toBeNull();
    expect(loadVariantSearch('?variant=day&devmode', plain, 6, day.stem)).toBe('?variant=day&devmode');
  });
});
