import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, zdbMember, Zar, type ZdbEntry } from '@s2u/archive';
import { decodeTexture, PaletteTable, parseTextureRecord } from '@s2u/gs';
import { readMeshLibrary } from '@s2u/mesh';
import { parseCharacterTable, type CharacterTable } from '@s2u/scene';
import { mapPlayer } from '../src/body';
import { BOT_MODEL_BY_NAME_ADAPTATION, BOT_MODEL_CHARACTER_ADAPTATION, botNativeTypeFor } from '../src/botRoster';
import { buildCharacterCatalogue, MP2_ROSTER_PLACEHOLDER } from '../src/characters/catalogue';
import { characterLibraryEntry } from '../src/characters/inventory';

/**
 * BOTN (a browser adaptation, product track; the owner, 2026-10-31: "HUGE (yellow raincoat model on frostfire always)"):
 * which of Frostfire's terrorist models is the yellow raincoat, read off the disc's own files through the repository's
 * readers, not assumed. Every terrorist model a Frostfire bot can wear is checked -- MP2's four armory types
 * (`READERM.ZAR` `chartype.rdr`, `mapPlayer`; their models `READERC.ZAR` `character.rdr`, `CharacterTable.model`) and
 * the catalogue's Frostfire terrorist pool (`MP2_ROSTER_PLACEHOLDER.terroristModels`: those four and `rus_snowter01`,
 * `rus_snowter02`, `rus_snowter03`, `rus_ter01`): each model's textures (`CLIB_MDL.ZED` sub-meshes' texture names,
 * `readMeshLibrary`), decoded from its own library's `CLIB_TXR.ZED` with that library's `CLIB_PAL.ZED` (`decodeTexture`;
 * the palette the page draws it with, `characters/assets.ts`), counted for yellow texels. Only `mp2_terror4`'s
 * `al_captain` has a yellow texture, its coat: `al_sailer_jacket_front`, `_back` and `al_sailer_sleave`.
 *
 * MP2's four are in MP2's own library (the committed fixture `RUN/MP2.ZDB`, with `RUN/READERC.ZAR`); the four Russian
 * models are not in MP2 but in the campaign's (M81, M82), which are not fixtures, so that half reads the disc tree
 * (`SOCOM_DISC`) and skips without it.
 */
const FIXTURES = resolve(import.meta.dirname, '../../../test-fixtures');
const ZDB = resolve(FIXTURES, 'RUN/MP2.ZDB'), READERC = resolve(FIXTURES, 'RUN/READERC.ZAR');
const HAVE = existsSync(ZDB) && existsSync(READERC);
if (!HAVE) console.warn('botRaincoat.fixture.test: SKIPPED -- test-fixtures/RUN/MP2.ZDB or RUN/READERC.ZAR is missing');
const DISC = process.env['SOCOM_DISC'] ?? '';
/** Where each of the pool's Russian models is read (its library on the disc, `CLIB_MDL.ZED` holding the mesh). */
const RUSSIAN_LIBRARY: Readonly<Record<string, string>> = { rus_snowter01: 'M81', rus_snowter02: 'M81', rus_ter01: 'M81', rus_snowter03: 'M82' };
const HAVE_DISC = DISC !== '' && ['M81', 'M82'].every((m) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));

/** A yellow texel: red and green both bright and near each other, blue well under both. */
const yellow = (r: number, g: number, b: number): boolean => r > 120 && g > 100 && Math.abs(r - g) < 70 && b < 0.6 * Math.min(r, g);

/** A model's textures over half yellow, read from the library `bytes` with that library's own palette. */
function yellowTextures(bytes: Uint8Array, toc: ZdbEntry[], model: string): string[] {
  const mdl = Zar.parse(zdbMember(bytes, toc, 'CLIB_MDL.ZED')), txr = Zar.parse(zdbMember(bytes, toc, 'CLIB_TXR.ZED'));
  const palettes = PaletteTable.fromZars([Zar.parse(zdbMember(bytes, toc, 'CLIB_PAL.ZED'))]);
  const keys = txr.find('textures')?.children ?? [];
  const mesh = readMeshLibrary(mdl, [model])[0]?.mesh;
  expect(mesh, model).toBeTruthy();
  const named = mesh!.subMeshes.map((s) => s.textureName).filter((n): n is string => n !== null);
  expect(named.length, model).toBeGreaterThan(0);
  return named.flatMap((name) => {
    const key = keys.find((k) => k.name.toLowerCase() === name.toLowerCase());
    expect(key, `${model} ${name}`).toBeTruthy();
    const { rgba } = decodeTexture(parseTextureRecord(key!.name, txr.data(txr.child(key!, 'texdat')!)), palettes);
    let n = 0;
    for (let i = 0; i < rgba.data.length; i += 4) if (yellow(rgba.data[i]!, rgba.data[i + 1]!, rgba.data[i + 2]!)) n++;
    return n * 4 > rgba.data.length / 2 ? [name] : [];
  }).sort();
}

const table = (): CharacterTable => {
  const rz = Zar.parse(new Uint8Array(readFileSync(READERC)));
  return parseCharacterTable(parseRdr(rz.data(rz.root.children.find((k) => k.name === 'character.rdr')!)));
};

describe.skipIf(!HAVE)('Frostfire\'s yellow raincoat terrorist, off the disc (BOTN)', () => {
  it('is al_captain (mp2_terror4), the one armory terrorist model whose coat textures are yellow; HUGE\'s rule names it', () => {
    const bytes = new Uint8Array(readFileSync(ZDB)), toc = parseZdb(bytes), characters = table();
    const types = [0, 1, 2, 3].map((i) => mapPlayer(bytes, toc, 'terrorists', i)!);
    expect(types).toEqual(['mp2_terror1', 'mp2_terror2', 'mp2_terror3', 'mp2_terror4']);
    const models = types.map((t) => characters.model(t)!);
    expect(models).toEqual(['al_gman01', 'al_gman02', 'al_leader', 'al_captain']);
    expect(Object.fromEntries(models.map((m) => [m, yellowTextures(bytes, toc, m)]))).toEqual({
      al_gman01: [], al_gman02: [], al_leader: [],
      al_captain: ['al_sailer_jacket_back.tif', 'al_sailer_jacket_front.tif', 'al_sailer_sleave.tif'],
    });
    // The pool's other four are the Russian models, read below; together the eight are every look a Frostfire bot draws.
    expect(new Set(MP2_ROSTER_PLACEHOLDER.terroristModels)).toEqual(new Set([...models, ...Object.keys(RUSSIAN_LIBRARY)]));
    expect(BOT_MODEL_BY_NAME_ADAPTATION['HUGE']?.['MP2']).toBe('al_captain');
    // The native type the bots' armory seats HUGE on (RUN/-only hosts, no catalogue): its record wears that model.
    expect(characters.model(BOT_MODEL_CHARACTER_ADAPTATION['al_captain']!)).toBe('al_captain');
    expect(botNativeTypeFor('HUGE', 'MP2', types.map((character) => ({ character })))).toBe(3);
    expect(botNativeTypeFor('HUGE', 'MP51', types.map((character) => ({ character })))).toBeUndefined();
    expect(botNativeTypeFor('Shinobison', 'MP2', types.map((character) => ({ character })))).toBeUndefined();
  });

  it('the real catalogue builder offers Frostfire\'s bots an al_captain terrorist choice, in its pool', () => {
    const bytes = new Uint8Array(readFileSync(ZDB)), toc = parseZdb(bytes);
    // MP2's own library is the one that holds al_captain; the rest of the inventory adds other maps' looks only.
    const inventory = { version: 1, libraries: [characterLibraryEntry('MP2', (name) => zdbMember(bytes, toc, name))] };
    const catalogue = buildCharacterCatalogue(table(), inventory, 'MP2');
    const raincoat = catalogue.choices.filter((c) => c.team === 'terrorist' && c.model === BOT_MODEL_BY_NAME_ADAPTATION['HUGE']!['MP2']);
    expect(raincoat.length).toBeGreaterThan(0);
    expect(raincoat.some((c) => catalogue.pool.terrorist.includes(c.key))).toBe(true);
  });

  it.skipIf(!HAVE_DISC)('the pool\'s four Russian models (disc tree, SOCOM_DISC) have no yellow texture', () => {
    const found: Record<string, string[]> = {};
    for (const [model, library] of Object.entries(RUSSIAN_LIBRARY)) {
      const bytes = new Uint8Array(readFileSync(join(DISC, 'RUN', `${library}.ZDB`)));
      found[model] = yellowTextures(bytes, parseZdb(bytes), model);
    }
    expect(found).toEqual({ rus_snowter01: [], rus_snowter02: [], rus_snowter03: [], rus_ter01: [] });
  });
});
