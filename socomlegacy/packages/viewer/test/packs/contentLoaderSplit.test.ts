import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contentMapMemberPath, isContentLayout, parseLayout, type ContentRef } from '@s2u/creator-contracts';
import { MAP_PACK, minimalMapJson } from '../../../creator-contracts/test/contentMapFixtures';
import { loadAnyMap } from '../../src/loadMap';
import { loadContentMap, type LoadedContentMap } from '../../src/packs/content/map';
import { readContentMapDefinition, type ContentMapDefinition } from '@s2u/creator-contracts';

/**
 * S3b items 1 and 8 (product track; a browser adaptation with no original): a layout file's content base (`parseLayout`,
 * a `LayoutBase` member now) routes through `loadAnyMap` to the authored map's loader (`loadContentMap`), the ZDB branch
 * untouched; and the loader stays a dynamic import, for the reasons `loadAnyMap`'s comment gives -- the facts it reads are
 * held here (the build that would show the chunks is the S1a gate's, not run here).
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (path: string): string => readFileSync(resolve(here, '../..', path), 'utf8');

describe('S3b item 1: a parsed content base loads through loadAnyMap', () => {
  it('parseLayout -> loadAnyMap({kind: content}) reads the base\'s member by its reference and gives loadContentMap\'s map', async () => {
    const layout = parseLayout(JSON.stringify({ forge: 1, base: { kind: 'content', ref: MAP_PACK, mapId: 'yard', library: 'MP72' }, pieces: [], spawns: [] }));
    if (!isContentLayout(layout)) throw new Error('not a content layout');
    const asked: ContentRef[] = [];
    const map = await loadAnyMap({ kind: 'content', base: layout.base, readMap: async (ref) => { asked.push(ref); return minimalMapJson(); } }) as LoadedContentMap;
    expect(asked).toEqual([{ kind: 'pack', pack: MAP_PACK, assetId: 'yard' }]);
    expect(contentMapMemberPath(asked[0]!.assetId)).toBe('maps/yard.json');
    const def = readContentMapDefinition(minimalMapJson(), asked[0]!) as ContentMapDefinition;
    const direct = await loadContentMap(def);
    expect(map.content.digest).toBe(direct.content.digest);
    expect(Array.from(map.ground!.points)).toEqual(Array.from(direct.ground!.points));
  });
});

describe('S3b item 8: the content loader is a dynamic import, out of the decode workers\' graphs', () => {
  it('loadMap.ts imports the content loader only inside loadAnyMap, dynamically; the workers import loadMap, never loadAnyMap', () => {
    const loadMap = src('src/loadMap.ts');
    expect(loadMap).not.toMatch(/^import[^;]*['"]\.\/packs\/content\/map['"]/m);
    expect(loadMap).toMatch(/export async function loadAnyMap[\s\S]*await import\('\.\/packs\/content\/map'\)/);
    for (const worker of ['src/worker.ts', 'src/forge/forgeWorker.ts']) {
      const text = src(worker);
      expect(text).toMatch(/import \{[^}]*\bloadMap\b[^}]*\} from '\.\.?\/(\.\.\/)?loadMap'/);
      expect(text).not.toMatch(/loadAnyMap|packs\/content/);
    }
  });

  it('the workers are ES module bundles (vite worker.format es), which Rollup code-splits and tree-shakes', () => {
    expect(src('vite.config.ts')).toMatch(/worker: \{ format: 'es' \}/);
  });
});
