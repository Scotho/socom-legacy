import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { inventoryFor, MEMBERS } from '../../packages/viewer/src/characters/inventory';
import { prepareCharacters } from '../prepareCharacters';

/**
 * BOTS-LAND, the area (c) review's finding 8: the served tree's character libraries are written by a tool -- the
 * fixtures' three maps (`test-fixtures/RUN/MP2.ZDB`, `MP6`, `MP72`) stand for a disc tree -- and read back by the page's
 * own `inventoryFor` as the ISO path would have read them.
 */
const FIXTURES = resolve(import.meta.dirname, '../../test-fixtures');
const HAVE = ['MP2', 'MP6', 'MP72'].every((m) => existsSync(join(FIXTURES, 'RUN', `${m}.ZDB`)));
const out = mkdtempSync(join(tmpdir(), 's2u-characters-'));
afterAll(() => { rmSync(out, { recursive: true, force: true }); });

describe.skipIf(!HAVE)('prepare-characters: the served character libraries off a disc tree', () => {
  it('writes each map\'s eight members and an index inventoryFor reads back, its entries the members\' own', async () => {
    const first = prepareCharacters(FIXTURES, out);
    expect(first.missing).toEqual([]);
    expect(first.inventory.libraries.map((l) => l.archive)).toEqual(['MP2', 'MP6', 'MP72']);
    for (const l of first.inventory.libraries) {
      expect(l.models.length, l.archive).toBeGreaterThan(0);
      expect(l.members).toEqual(MEMBERS);
      for (const name of MEMBERS) expect(existsSync(join(out, 'characters', l.archive, name)), `${l.archive}/${name}`).toBe(true);
    }
    expect(first.tally.written).toBe(3 * MEMBERS.length + 1);
    expect(await inventoryFor(new FsAssetSource(out))).toEqual(first.inventory);
    const again = prepareCharacters(FIXTURES, out);
    expect(again.tally).toEqual({ kept: 3 * MEMBERS.length + 1, written: 0 });
  });
});
