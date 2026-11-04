import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseZdb, zdbMember } from '@s2u/archive';
import type { CharacterInventory } from '../packages/viewer/src/characters/catalogue';
import { characterLibraryEntry, MEMBERS } from '../packages/viewer/src/characters/inventory';
import type { Fresh } from './freshFiles';

/**
 * The served tree's character libraries (BOTS-LAND, the area (c) review's finding 8): what viewer
 * `characters/inventory.ts` `inventoryFor` and `characters/assets.ts` read from a served build -- `characters/index.json`
 * (`CharacterInventory`) and each library's eight members at `characters/<archive>/<member>` -- off the disc tree's
 * `RUN/M<nn>.ZDB` and `RUN/MP<n>.ZDB` through the archive readers (`parseZdb`, `zdbMember`), each library's entry the same
 * `characterLibraryEntry` a disc image is read with. An archive without the members is reported, never faked. The output
 * is game data (`public/maps/`, git-ignored, RS.R8); an ISO source needs none of it.
 */
export interface PreparedCharacters { inventory: CharacterInventory; tally: Record<Fresh, number>; missing: string[] }

/** `bytes` written to `path` as a new file, unless it already holds exactly them (`./freshFiles`' rule, for bytes). */
function writeBytesFresh(path: string, bytes: Uint8Array): Fresh {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && statSync(path).size === bytes.byteLength) {
    const fd = openSync(path, 'r'), got = Buffer.alloc(bytes.byteLength);
    try { readSync(fd, got, 0, got.length, 0); } finally { closeSync(fd); }
    if (got.equals(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))) return 'kept';
  }
  if (existsSync(path)) unlinkSync(path);
  writeFileSync(path, bytes);
  return 'written';
}

/** Reads every character library of `disc`'s `RUN/` and writes it, with the index, under `out` (`public/maps`). */
export function prepareCharacters(disc: string, out: string): PreparedCharacters {
  const run = join(disc, 'RUN');
  const archives = readdirSync(run).filter((f) => /^MP?\d+\.ZDB$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const tally: Record<Fresh, number> = { kept: 0, written: 0 };
  const libraries: CharacterInventory['libraries'] = [], missing: string[] = [];
  for (const file of archives) {
    const archive = file.replace(/\.ZDB$/i, '').toUpperCase();
    const bytes = new Uint8Array(readFileSync(join(run, file))), toc = parseZdb(bytes);
    const members = new Map<string, Uint8Array>();
    try { for (const name of MEMBERS) members.set(name, zdbMember(bytes, toc, name)); } catch (e) {
      missing.push(`${archive}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    libraries.push(characterLibraryEntry(archive, (name) => members.get(name)!));
    for (const [name, data] of members) tally[writeBytesFresh(join(out, 'characters', archive, name), data)]++;
  }
  const inventory: CharacterInventory = { version: 1, libraries };
  tally[writeBytesFresh(join(out, 'characters', 'index.json'), new TextEncoder().encode(`${JSON.stringify(inventory)}\n`))]++;
  return { inventory, tally, missing };
}
