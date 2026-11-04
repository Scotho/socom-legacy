import { isRanged, type AssetSource } from './assetSource';
import {
  addedZdbEntries, looseMemberOverride, noteMemberArchive, noteRangedZdbMember, zdbOverrideBytes,
} from './memberOverride';
import { Zar, ZAR_HEAD, zarIndexLength } from './zar';
import { parseZdb, zdbEntry, zdbMember, zdbTocLength, ZDB_HEAD, type ZdbEntry } from './zdb';

/**
 * Named members of a ZAR archive on a source, by path inside the archive (`Zar.find`'s `a/b/c`). Over a
 * `RangedAssetSource` -- the player's disc image, the served tree over HTTP -- it reads the head, then the string
 * table and the key tree (`zarIndexLength`), then each member's own bytes, and nothing else: the sound banks a map
 * needs are its three and `HUDUI` of `SOUNDS/BNKSTORE.ZAR`'s 115 (socomlegacy/docs/research/81 §1), about 1.9 MB of
 * its 67 for Frostfire. Any other source reads the archive whole. A name the archive does not hold is left out of the answer rather than thrown on.
 */
export async function readZarMembers(source: AssetSource, path: string, names: readonly string[]): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  if (!isRanged(source)) {
    const bytes = await source.read(path);
    noteMemberArchive(path, bytes);
    const zar = Zar.parse(bytes);
    for (const name of names) {
      const key = zar.find(name);
      if (key) out.set(name, zar.data(key));
    }
    return out;
  }
  // The index is not the archive. A member the mod replaces or adds is answered here, by name, and the disc
  // range is not read. A key that exists only as an offset, with no override, is still that range.
  const head = await source.readRange(path, 0, ZAR_HEAD);
  const zar = Zar.parse(await source.readRange(path, 0, zarIndexLength(head)));
  for (const name of names) {
    const hit = looseMemberOverride(path, name);
    if (hit) { out.set(name, hit); continue; }
    const key = zar.find(name);
    if (key) out.set(name, await source.readRange(path, zar.dataOffset + key.offset, key.size));
  }
  return out;
}

/**
 * One member of a ZDB archive (`zdbEntry`'s suffix match), as `mapIndex`'s `READERM.ZAR` read does it: over a ranged
 * source the header, the table of contents and the member; otherwise the archive whole. The sound reads each map's
 * `CZANIM.ZAR` this way for the zAnim callbacks' sounds (socomlegacy/docs/research/81 §4).
 */
export async function readZdbMember(source: AssetSource, path: string, suffix: string): Promise<Uint8Array> {
  if (!isRanged(source)) {
    const bytes = await source.read(path);
    noteMemberArchive(path, bytes);
    return zdbMember(bytes, parseZdb(bytes), suffix);
  }
  const size = await source.size(path);
  const head = await source.readRange(path, 0, Math.min(ZDB_HEAD, size));
  const toc = parseZdb(await source.readRange(path, 0, Math.min(zdbTocLength(head), size)), size);
  const entries: ZdbEntry[] = [...toc, ...addedZdbEntries(path, toc)];
  const entry = zdbEntry(entries, suffix);
  const hit = zdbOverrideBytes(path, entry.name);
  if (hit) {
    noteRangedZdbMember(path, entry.name, hit);
    return hit;
  }
  if (entry.offset < 0) throw new Error(`ZDB member ${entry.name} is not in the archive`);
  const bytes = await source.readRange(path, entry.offset, entry.size);
  noteRangedZdbMember(path, entry.name, bytes);
  return bytes;
}
