import { ARMORY_TYPES_PER_SIDE } from '@s2u/scene';
import { IsoAssetSource, readZdbMember, Zar, zdbMember, type AssetSource, type ZdbEntry } from '@s2u/archive';
import { decodeTexture, PaletteTable, parseTextureRecord, type Rgba, type TextureRecord } from '@s2u/gs';
import { loadCharacterBody, mapPlayer, type CharacterSource, type LoadedBody } from '../body';
import { buildCharacterCatalogue, type CharacterCatalogue } from './catalogue';
import { hasCharacterLibraries, inventoryFor, MEMBERS } from './inventory';
import { markDerived } from '../hdTexturePack';

export interface LoadedCharacters { catalogue: CharacterCatalogue; bodies: Record<string, LoadedBody> }
/**
 * A browser adaptation, no original read (the area (c) review's finding 9): character UVs address TEX0's power-of-two
 * extent even when the exporter stored fewer rows (Arjan; donor catalogue, research 364), and the rows and columns past
 * the stored ones are filled by clamping to its last -- the GS's own addressing of the missing area is not read.
 */
export const ADDRESSABLE_TEXTURE_EDGE_ADAPTATION = 'texels past the stored extent clamp to its last row and column' as const;
function addressableTexture(rgba: Rgba, record: TextureRecord): Rgba {
  const width = record.tex0 ? 2 ** record.tex0.tw : rgba.width, height = record.tex0 ? 2 ** record.tex0.th : rgba.height;
  if (width === rgba.width && height === rgba.height) return rgba;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.min(y, rgba.height - 1) * rgba.width + Math.min(x, rgba.width - 1)) * 4;
    data.set(rgba.data.subarray(from, from + 4), (y * width + x) * 4);
  }
  return { width, height, data };
}

export { CHARACTER_LIBRARY_MAPS, hasCharacterLibraries } from './inventory';

/** All regional outfits share mesh data when appropriate, but retain separate character/identity records. */
export async function loadCharacterAssets(source: AssetSource, path: string, bytes: Uint8Array, toc: ZdbEntry[],
  characters: CharacterSource, note: (message: string) => void): Promise<(LoadedCharacters & { textures: Record<string, { rgba: Rgba; record: TextureRecord }> }) | null> {
  const stem = path.replace(/^.*\//, '').replace(/\.ZDB$/i, '').toUpperCase();
  if (!hasCharacterLibraries(stem)) return null;                     // P537-L2: the page reads main's list (no switch on a page)
  const inventory = await inventoryFor(source);
  if (!inventory || !characters.table) return null;
  const catalogue = buildCharacterCatalogue(characters.table, inventory, stem);
  const models = (team: 'navyseals' | 'terrorists'): string[] => Array.from({ length: ARMORY_TYPES_PER_SIDE }, (_, i) => {
    const character = mapPlayer(bytes, toc, team, i);
    return character ? characters.table!.model(character) : null;
  }).filter((model): model is string => model !== null);
  catalogue.multiplayerModels = { seal: models('navyseals'), terrorist: models('terrorists') };
  const libraries = new Map<string, Map<string, Uint8Array>>();
  for (const library of new Set(catalogue.choices.map((c) => (c.outfit ?? c).library))) {
    try {
      const members = new Map<string, Uint8Array>();
      if (library === stem) for (const name of MEMBERS) members.set(name, zdbMember(bytes, toc, name));
      else for (const name of MEMBERS) members.set(name, source instanceof IsoAssetSource
        ? await readZdbMember(source, `RUN/${library}.ZDB`, name) : await source.read(`characters/${library}/${name}`));
      libraries.set(library, members);
    } catch (e) { note(`character library ${library}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const fallbacks = new Map<string, string[]>();
  for (const choice of catalogue.choices) {
    const outfit = choice.outfit ?? choice;
    const own = inventory.libraries.find((l) => l.archive === outfit.library);
    const extra = new Set<string>();
    for (const name of characters.table.defaultGear(outfit.character)) {
      const model = characters.table.gear.get(name)?.model;
      if (!model || own?.fittings?.includes(model)) continue;
      const other = inventory.libraries.find((l) => l.fittings?.includes(model));
      if (other && other.archive !== outfit.library) extra.add(other.archive);
    }
    fallbacks.set(choice.key, [...extra]);
  }
  for (const library of new Set([...fallbacks.values()].flat())) if (!libraries.has(library)) {
    try {
      const members = new Map<string, Uint8Array>();
      for (const name of MEMBERS.filter((n) => n.startsWith('FLIB'))) members.set(name, source instanceof IsoAssetSource
        ? await readZdbMember(source, `RUN/${library}.ZDB`, name) : await source.read(`characters/${library}/${name}`));
      libraries.set(library, members);
    } catch (e) { note(`character fittings ${library}: ${String(e)}`); }
  }
  const bodies: Record<string, LoadedBody> = {};
  const decoded = new Map<string, LoadedBody>();
  const wanted = new Map<string, Set<string>>();
  const prefix = (library: string, name: string): string => `character/${library.toLowerCase()}/${name}`;
  for (const choice of catalogue.choices) {
    const outfit = choice.outfit ?? choice;
    const members = libraries.get(outfit.library); if (!members) continue;
    let body = decoded.get(choice.model);
    if (!body) {
      const read = (name: string): Uint8Array => { const m = members.get(name); if (!m) throw new Error(`No ${name}`); return m; };
      const extras = (fallbacks.get(choice.key) ?? []).flatMap((library) => {
        const m = libraries.get(library); return m ? [{ library, member: (name: string): Uint8Array => { const bytes = m.get(name); if (!bytes) throw new Error(`No ${name}`); return bytes; } }] : [];
      });
      const loaded = loadCharacterBody(read, characters, outfit.character, note, extras);
      if (!loaded) continue;
      const want = (library: string, names: (string | null)[]): void => {
        let set = wanted.get(library); if (!set) wanted.set(library, set = new Set());
        for (const name of names) if (name) set.add(name);
      };
      want(outfit.library, loaded.subMeshes.map((m) => m.textureName));
      for (const fitting of loaded.fittings) want(fitting.library ?? outfit.library, fitting.meshes.map((m) => m.textureName));
      body = { ...loaded,
        subMeshes: loaded.subMeshes.map((s) => ({ ...s, textureName: s.textureName ? prefix(outfit.library, s.textureName) : null })),
        fittings: loaded.fittings.map((f) => ({ ...f, meshes: f.meshes.map((m) => ({ ...m, textureName: m.textureName ? prefix(f.library ?? outfit.library, m.textureName) : null })) })),
      };
      decoded.set(choice.model, body);
    }
    bodies[choice.key] = body;
  }
  const textures: Record<string, { rgba: Rgba; record: TextureRecord }> = {};
  for (const [library, names] of wanted) {
    const members = libraries.get(library)!;
    const txrs = ['FLIB_TXR.ZED', 'CLIB_TXR.ZED'].flatMap((n) => members.has(n) ? [Zar.parse(members.get(n)!)] : []);
    const palettes = PaletteTable.fromZars(['FLIB_PAL.ZED', 'CLIB_PAL.ZED'].flatMap((n) => members.has(n) ? [Zar.parse(members.get(n)!)] : []));
    for (const name of names) {
      let found = false;
      for (const txr of txrs) {
        const key = txr.find('textures')?.children.find((k) => k.name.toLowerCase() === name);
        const texdat = key && txr.child(key, 'texdat');
        if (!key || !texdat) continue;
        try {
          const record = parseTextureRecord(key.name, txr.data(texdat));
          const decoded = decodeTexture(record, palettes);
          textures[prefix(library, name)] = { record, rgba: markDerived(addressableTexture(decoded.rgba, record), decoded.rgba) };
          for (const d of decoded.diagnostics) note(`character texture ${library}/${name}: ${d}`);
          found = true; break;
        } catch (e) { note(`character texture ${library}/${name}: ${String(e)}`); }
      }
      if (!found) note(`character texture ${library}/${name}: missing`);
    }
  }
  // Never advertise an appearance which could not actually be decoded.
  catalogue.choices = catalogue.choices.filter((c) => c.key in bodies);
  for (const team of ['seal', 'terrorist'] as const) catalogue.pool[team] = catalogue.pool[team].filter((key) => key in bodies);
  return { catalogue, bodies, textures };
}
