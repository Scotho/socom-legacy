import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { bodyTextureNames, bodyTransferables, characterTableFor } from '../src/body';
import { BOT_MODEL_BY_NAME_ADAPTATION } from '../src/botRoster';
import { buildCharacterCatalogue } from '../src/characters/catalogue';
import { inventoryFor } from '../src/characters/inventory';
import { loadMap, transferables, type LoadedMap } from '../src/loadMap';

const SERVED = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/maps');
const HAVE = ['RUN/MP2.ZDB', 'RUN/READERC.ZAR', 'characters/index.json'].every((path) => existsSync(resolve(SERVED, path)));

describe.skipIf(!HAVE)('regional character assets in the loaded Frostfire map (FBA.R10)', () => {
  let pending: Promise<LoadedMap> | undefined;
  const loaded = (): Promise<LoadedMap> => (pending ??= loadMap(new FsAssetSource(SERVED), 'RUN/MP2.ZDB'));

  it('carries matching regional bodies and namespaced textures beside the unchanged native types', async () => {
    const map = await loaded();
    expect(map.characters?.catalogue.region).toBe('russia');
    const catalogue = map.characters!.catalogue;
    const source = new FsAssetSource(SERVED), characters = await characterTableFor(source, 'RUN/MP2.ZDB'), inventory = await inventoryFor(source);
    const expected = buildCharacterCatalogue(characters.table!, inventory!, 'MP2');
    expect(catalogue.choices.map((choice) => choice.key)).toEqual(expected.choices.map((choice) => choice.key));
    expect(catalogue.choices.map((choice) => choice.name)).toEqual(expect.arrayContaining(['Specter', 'Jester', 'Arjan', 'Valeska']));
    // BOTN (a browser adaptation): HUGE's fixed look on Frostfire is a terrorist choice of the real catalogue, in its pool.
    const raincoat = catalogue.choices.filter((c) => c.team === 'terrorist' && c.model === BOT_MODEL_BY_NAME_ADAPTATION['HUGE']!['MP2']);
    expect(raincoat.some((c) => catalogue.pool.terrorist.includes(c.key))).toBe(true);
    for (const choice of catalogue.choices) {
      const body = map.characters!.bodies[choice.key]!;
      expect(body, choice.key).toBeTruthy();
      expect(body.model, choice.key).toBe(choice.model);
      for (const name of bodyTextureNames(body)) {
        expect(name, choice.key).toMatch(/^character\//);
        expect(map.textures[name], name).toBeTruthy();
        expect(map.textureFlags[name]?.bilinear, name).toBeTypeOf('boolean');
      }
    }
    expect(map.body).toMatchObject({ character: 'mp2_seal1', model: 'seal_A_scuba' });
    expect(map.types!.seal[0]).toBe(map.body);
    expect(map.types!.terrorist[0]).toBe(map.terrorist);
    expect(map.textures['brown_eye.tif']).toBeTruthy();
    expect(map.diagnostics).toEqual([]);
    expect(map.characters!.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining('arjan_hands.tif')]));
  });

  it('transfers regional mesh buffers and shared textures exactly once across the worker boundary', async () => {
    const map = await loaded(), buffers = transferables(map), unique = new Set(buffers);
    for (const body of Object.values(map.characters!.bodies)) {
      for (const buffer of bodyTransferables(body)) expect(unique.has(buffer), body.model).toBe(true);
    }
    for (const [name, rgba] of Object.entries(map.textures)) {
      if (name.startsWith('character/')) expect(unique.has(rgba.data.buffer), name).toBe(true);
    }
    expect(buffers).toHaveLength(unique.size);
  });
});
