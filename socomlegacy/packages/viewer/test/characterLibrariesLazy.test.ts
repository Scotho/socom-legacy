import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { CHARACTER_LIBRARY_MAPS, hasCharacterLibraries } from '../src/characters/assets';
import { ALL_MAPS_SWITCH } from '../../match/src/botGates';
import { loadMap } from '../src/loadMap';
import { loadSimSkeletons } from '../src/simMap';

/**
 * The area (c) review's finding 4 (BOTS-LAND): the bots' character libraries are read only for a map a room can give
 * bots -- H314's Frostfire (`match/src/roomBots.ts` `RoomBots.for`) -- never on every map a human loads. A source that
 * records its reads: MP7 asks nothing of the character inventory; MP2 still does.
 */
const SERVED = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/maps');
const HAVE = ['RUN/MP2.ZDB', 'RUN/MP7.ZDB', 'RUN/READERC.ZAR'].every((path) => existsSync(resolve(SERVED, path)));

function recording(): { source: AssetSource; reads: string[] } {
  const inner = new FsAssetSource(SERVED), reads: string[] = [];
  const source = new Proxy(inner, {
    get(target, key) {
      const v = Reflect.get(target, key) as unknown;
      if (key === 'read') return (path: string, ...rest: unknown[]) => { reads.push(path); return (v as (...a: unknown[]) => unknown).call(target, path, ...rest); };
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  }) as AssetSource;
  return { source, reads };
}

describe.skipIf(!HAVE)('the character libraries, only for a map that can have bots (H314)', () => {
  it('names Frostfire alone', () => {
    expect(CHARACTER_LIBRARY_MAPS).toEqual(['MP2', 'MP51']);
  });

  it('MP7 reads no character inventory and carries no regional catalogue; MP2 asks for it', async () => {
    const other = recording();
    const map = await loadMap(other.source, 'RUN/MP7.ZDB');
    expect(other.reads.filter((p) => p.startsWith('characters/'))).toEqual([]);
    expect(map.characters).toBeUndefined();
    const frostfire = recording();
    await loadMap(frostfire.source, 'RUN/MP2.ZDB');
    expect(frostfire.reads).toContain('characters/index.json');
  }, 120_000);

  // The area (c) re-read's finding 1: the match server's own read (`loadSimSkeletons`, every room) takes the same gate,
  // and decodes no regional skeleton -- the room hits a bot on its type's volumes (BTL.R4), so none is used.
  it('the server: MP7\'s skeletons read no character inventory; MP2\'s carry the catalogue and no regional skeletons', async () => {
    const other = recording();
    const seven = await loadSimSkeletons(other.source, 'RUN/MP7.ZDB');
    expect(other.reads.filter((p) => p.startsWith('characters/'))).toEqual([]);
    expect(seven.catalogue).toBeUndefined();
    const frostfire = recording();
    const two = await loadSimSkeletons(frostfire.source, 'RUN/MP2.ZDB');
    expect(frostfire.reads.filter((p) => p.startsWith('characters/') && p !== 'characters/index.json')).toEqual([]);
    expect('characters' in two).toBe(false);
  }, 120_000);
});

// P537-L2: Fuse's `hasCharacterLibraries` (82aa02c14), every disc map's stem only when told -- the match server passes
// `CREATE_GAME_ALL_MAPS=1` (`allMapsSwitch`, a developer's test server); unset, and on every page, main's list alone.
describe('hasCharacterLibraries: main\'s list by default, every disc map\'s stem under the switch (P537-L2)', () => {
  it('default: Frostfire and Vigilance alone', () => {
    for (const stem of ['MP2', 'MP51']) expect(hasCharacterLibraries(stem), stem).toBe(true);
    for (const stem of ['MP1', 'MP7', 'MP72', 'MP83', '', 'mp2']) expect(hasCharacterLibraries(stem), stem).toBe(false);
  });

  it('told all: every disc map\'s stem (MP and one or two digits) and nothing else', () => {
    for (const stem of ['MP1', 'MP2', 'MP7', 'MP51', 'MP72', 'MP83']) expect(hasCharacterLibraries(stem, true), stem).toBe(true);
    for (const stem of ['', 'MP', 'MP123', 'M51', '../MP2', 'frostfire', 'mp2']) expect(hasCharacterLibraries(stem, true), stem).toBe(false);
  });
});

describe.skipIf(!HAVE)('the server under CREATE_GAME_ALL_MAPS=1 (P537-L2): MP7\'s skeletons carry the catalogue, as MP2\'s', () => {
  it('MP7 asks for the character inventory and decodes no regional skeleton', async () => {
    vi.stubEnv(ALL_MAPS_SWITCH, '1');
    try {
      const r = recording();
      const skeletons = await loadSimSkeletons(r.source, 'RUN/MP7.ZDB');
      expect(r.reads).toContain('characters/index.json');
      expect(r.reads.filter((p) => p.startsWith('characters/') && p !== 'characters/index.json')).toEqual([]);
      expect('characters' in skeletons).toBe(false);
    } finally { vi.stubEnv(ALL_MAPS_SWITCH, undefined); }
  }, 120_000);
});
