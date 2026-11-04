import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture } from '../../archive/test/fixtures';
import { loadMap, type LoadedMap } from '../src/loadMap';

/** Web sprint 3 M5: the map's own first Terrorist type rides along with the SEAL (research 91 §14). */
const here = dirname(fileURLToPath(import.meta.url));
const SERVED = resolve(here, '../../../public/maps');
const MP2 = fixture('RUN/MP2.ZDB');
const dressed = existsSync(resolve(SERVED, 'RUN/READERC.ZAR')) && existsSync(resolve(SERVED, 'RUN/MP2.ZDB'));

describe.skipIf(!MP2 || !dressed)("Frostfire's Terrorist", () => {
  let map: LoadedMap;
  it('is a terrorist type, not the SEAL model, with sub-meshes whose textures are loaded', async () => {
    map = await loadMap(new FsAssetSource(SERVED), 'RUN/MP2.ZDB');
    const t = map.terrorist!;
    expect(t).toBeTruthy();
    expect(t.character).toBe('mp2_terror1');
    expect(t.model).toBe('al_gman01');
    expect(t.model).not.toBe(map.body!.model);
    expect(t.subMeshes.length).toBeGreaterThan(0);
    for (const s of t.subMeshes) if (s.textureName !== null) expect(map.textures[s.textureName]).toBeTruthy();
  });
});

/**
 * Web sprint 5 S2 (research 95 §6, W5.R2): every ARMORY type's body rides along -- each side's four, `chartype.rdr`
 * order, the first of each the map's `body` / `terrorist` themselves -- with their textures loaded, and the transfer
 * list names each buffer once (a duplicate would make the worker's `postMessage` throw).
 */
describe.skipIf(!MP2 || !dressed)("Frostfire's eight character types", () => {
  it('each its own body and model; index 0 is the placed body and the Terrorist; textures loaded; buffers once', async () => {
    const { transferables } = await import('../src/loadMap');
    const map = await loadMap(new FsAssetSource(SERVED), 'RUN/MP2.ZDB');
    const types = map.types!;
    expect(types.seal.map((b) => b?.model)).toEqual(['seal_A_scuba', 'seal_E_scuba', 'seal_D_scuba', 'seal_C_scuba']);
    expect(types.terrorist.map((b) => b?.model)).toEqual(['al_gman01', 'al_gman02', 'al_leader', 'al_captain']);
    expect(types.seal.map((b) => b?.character)).toEqual(['mp2_seal1', 'mp2_seal2', 'mp2_seal3', 'mp2_seal4']);
    expect(types.seal[0]).toBe(map.body);
    expect(types.seal[0]!.at).not.toBeNull();
    expect(types.terrorist[0]).toBe(map.terrorist);
    for (const b of [...types.seal, ...types.terrorist]) {
      for (const s of b!.subMeshes) if (s.textureName !== null) expect(map.textures[s.textureName], `${b!.model} ${s.textureName}`).toBeTruthy();
    }
    const list = transferables(map);
    expect(new Set(list).size).toBe(list.length);
  });
});
