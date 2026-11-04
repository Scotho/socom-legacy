import { IsoAssetSource, readZdbMember, Zar, type AssetSource } from '@s2u/archive';
import { meshNames } from '@s2u/mesh';
import { characterTableFor } from '../body';
import { buildCharacterCatalogue, type CharacterCatalogue, type CharacterInventory } from './catalogue';

const inventories = new WeakMap<AssetSource, Promise<CharacterInventory | null>>();
export const MEMBERS = ['CLIB_MDL.ZED', 'CLIB_GEO.ZED', 'CLIB_TXR.ZED', 'CLIB_PAL.ZED', 'FLIB_MDL.ZED', 'FLIB_GEO.ZED', 'FLIB_TXR.ZED', 'FLIB_PAL.ZED'];

/**
 * The maps whose load reads the bots' character libraries: those a room can give bots -- H314 (the owner, 2026-10-24:
 * "yes frostfire only to start"), the room's own gate (`match/src/roomBots.ts` `RoomBots.for`). Any other map reads
 * none, on the page (`./assets` `loadCharacterAssets`; the area (c) review's finding 4) or on the match server
 * (`../simMap` `loadSimSkeletons`; its re-read's finding 1). The respawn half is LATER 395.
 */
export const CHARACTER_LIBRARY_MAPS: readonly string[] = ['MP2', 'MP51'];   // H314 extended to Vigilance, 2026-10-29 (`match/src/botGates.ts` `BOT_MAPS`)

/**
 * Whether a map's load reads the character libraries: `CHARACTER_LIBRARY_MAPS`, or -- `all`, PR #537's lift (Fuse's
 * 82aa02c14) under P537-L2's `CREATE_GAME_ALL_MAPS=1` (`match/src/botGates.ts` `allMapsSwitch`, a developer's test server;
 * the match server passes it, `../simMap` `loadSimSkeletons`) -- any disc map's stem (`MP` and one or two digits). `all`
 * false, the default and every public room's, is the list alone.
 */
export const hasCharacterLibraries = (stem: string, all = false): boolean =>
  all ? /^MP\d{1,2}$/.test(stem) : CHARACTER_LIBRARY_MAPS.includes(stem);

/**
 * One library's entry of the inventory (`characters/index.json`): its CLIB models and FLIB fittings, read off its own
 * members -- the same for a disc image read here and for the served tree `tools/prepare-characters.ts` writes.
 */
export function characterLibraryEntry(archive: string, member: (name: string) => Uint8Array): CharacterInventory['libraries'][number] {
  const models = meshNames(Zar.parse(member('CLIB_MDL.ZED')));
  const fittings = Zar.parse(member('FLIB_MDL.ZED')).root.children.map((k) => k.name);
  return { archive, models, fittings, members: [...MEMBERS] };
}

/** Metadata only is cached across worker transfers; decoded buffers belong to one map load. */
export async function inventoryFor(source: AssetSource): Promise<CharacterInventory | null> {
  let pending = inventories.get(source);
  if (!pending) {
    pending = (async () => {
      try {
        const value: CharacterInventory = JSON.parse(new TextDecoder().decode(await source.read('characters/index.json')));
        if (value.version !== 1 || !Array.isArray(value.libraries)
          || !value.libraries.every((l) => /^MP?\d+$/.test(l.archive) && Array.isArray(l.models) && l.models.every((m) => typeof m === 'string') && Array.isArray(l.members))) {
          throw new Error('Invalid prepared character index');
        }
        return value;
      } catch {
        // An older served extraction keeps its original bodies. A disc image can read all original libraries directly.
        if (!(source instanceof IsoAssetSource)) return null;
        const libraries: CharacterInventory['libraries'] = [];
        for (const path of (await source.list()).filter((p) => /^RUN\/MP?\d+\.ZDB$/i.test(p))) {
          const clib = await readZdbMember(source, path, 'CLIB_MDL.ZED'), flib = await readZdbMember(source, path, 'FLIB_MDL.ZED');
          libraries.push(characterLibraryEntry(path.replace(/^.*\//, '').replace(/\.ZDB$/i, ''), (name) => name === 'CLIB_MDL.ZED' ? clib : flib));
        }
        return { version: 1, libraries };
      }
    })();
    inventories.set(source, pending);
  }
  return pending;
}


/** Optional prepared metadata; old extractions keep native multiplayer bodies unchanged. */
export async function loadCharacterCatalogue(source: AssetSource, mapPath: string): Promise<CharacterCatalogue | null> {
  const [inventory, characters] = await Promise.all([inventoryFor(source), characterTableFor(source, mapPath)]);
  return inventory && characters.table
    ? buildCharacterCatalogue(characters.table, inventory, mapPath.replace(/^.*\//, '').replace(/\.ZDB$/i, '')) : null;
}

export function readCharacterMember(source: AssetSource, archive: string, name: string): Promise<Uint8Array> {
  return source instanceof IsoAssetSource ? readZdbMember(source, `RUN/${archive}.ZDB`, name)
    : source.read(`characters/${archive}/${name}`);
}
