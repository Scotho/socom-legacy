import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { inventoryFor, MEMBERS } from '../../packages/viewer/src/characters/inventory';
import { prepareCharacters } from '../prepareCharacters';

/**
 * BOTS-LAND, the area (c) review's finding 8: the served tree's character libraries are written by a tool -- the
 * fixtures' four maps (`test-fixtures/RUN/MP2.ZDB`, `MP6`, `MP71`, `MP72`) stand for a disc tree -- and read back by the
 * page's own `inventoryFor` as the ISO path would have read them. MP71 (Fish Hook) joined the fixtures with DF-2 (DF.R5,
 * `docs/plans/2026-11-08-desert-glory-fish-hook.md`; 4eb69a297); the tool prepares every `RUN/MP*.ZDB` the tree holds.
 * The maps expected are the committed `RUN/MP<n>.ZDB` entries of the fixtures' `MANIFEST.json`, in numeric order (the
 * tool's own), so a map joining the fixtures joins here: MP11 did with LATER 1230 (363db65df7), which had left the list
 * pinned at four and the test red.
 */
const FIXTURES = resolve(import.meta.dirname, '../../test-fixtures');
// The public export does not carry test-fixtures (LATER 1607): with no MANIFEST.json there is no map to expect and the
// test skips, said, rather than throwing on import; a manifest present with no committed map runs (and fails) as before
const MANIFEST_FILE = join(FIXTURES, 'MANIFEST.json');
const MANIFEST = (existsSync(MANIFEST_FILE) ? JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) : { files: [] }) as { files: { path: string; tier?: string }[] };
const MAPS = MANIFEST.files.filter((f) => f.tier === 'committed' && /^RUN\/MP\d+\.ZDB$/.test(f.path))
  .map((f) => f.path.slice('RUN/'.length, -'.ZDB'.length)).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
const HAVE = existsSync(MANIFEST_FILE) && MAPS.every((m) => existsSync(join(FIXTURES, 'RUN', `${m}.ZDB`)));
const out = mkdtempSync(join(tmpdir(), 's2u-characters-'));
afterAll(() => { rmSync(out, { recursive: true, force: true }); });

describe.skipIf(!HAVE)('prepare-characters: the served character libraries off a disc tree', () => {
  it('writes each map\'s eight members and an index inventoryFor reads back, its entries the members\' own', async () => {
    const first = prepareCharacters(FIXTURES, out);
    expect(first.missing).toEqual([]);
    expect(first.inventory.libraries.map((l) => l.archive)).toEqual(MAPS);
    for (const l of first.inventory.libraries) {
      expect(l.models.length, l.archive).toBeGreaterThan(0);
      expect(l.members).toEqual(MEMBERS);
      for (const name of MEMBERS) expect(existsSync(join(out, 'characters', l.archive, name)), `${l.archive}/${name}`).toBe(true);
    }
    expect(first.tally.written).toBe(MAPS.length * MEMBERS.length + 1);
    expect(await inventoryFor(new FsAssetSource(out))).toEqual(first.inventory);
    const again = prepareCharacters(FIXTURES, out);
    expect(again.tally).toEqual({ kept: MAPS.length * MEMBERS.length + 1, written: 0 });
  });
});
