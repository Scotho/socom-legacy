import {parseZdb,Zar,zdbMember,type ZarKey,type ZdbEntry} from '@s2u/archive';
import {decodeTexture,parseTextureRecord,PaletteTable,type Rgba,type TextureRecord} from '@s2u/gs';
import {requirePack,validateSource,type PackSource} from './texturePack';
const textureKey=(name:string):string=>name.toLowerCase();
const say=(e:unknown):string=>e instanceof Error?e.message:String(e);

/**
 * The asset libraries a map loads, in the order it loads them, as ZDB member stems.
 *
 * A map does not keep its textures in one archive. The world root's `assetlibs` key lists library
 * paths, and `CSaveLoad::LoadAssetLib_PS2` (`zNode/node_saveload.cpp:91-114`) turns each into a member
 * name by taking the **first four characters of the last path element**: `//common/assetlib/weapons`
 * becomes `WEAP`, `//mp/mp61/junkyard` becomes `JUNK`, `//mp/mp73/c73` becomes `C73`. The map's own
 * library is last in that list, which matters -- see `textureLibrary`.
 *
 * Falls back to the map's own stem so a root that will not parse still draws the map the way it did.
 */
export function assetLibStems(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: {add(line:string):void}): string[] {
  try {
    const root = Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`));
    const libs = root.find('assetlibs')?.children ?? [];
    const stems: string[] = [];
    for (const lib of libs) {
      const last = lib.name.split('/').filter(Boolean).pop() ?? '';
      const member = last.slice(0, 4).toUpperCase();
      if (member && !stems.includes(member)) stems.push(member);
    }
    if (stems.length) return stems;
    notes.add(`${stem}.ZED: no assetlibs key, so only ${stem}_TXR.ZED is read`);
  } catch (e) {
    notes.add(`assetlibs: ${say(e)} -- only ${stem}_TXR.ZED is read`);
  }
  return [stem];
}

/**
 * Every texture the map can name, across all of its asset libraries, and every palette beside them.
 *
 * The viewer used to read `MP<N>_TXR.ZED` alone, which is why twelve maps reported missing skies,
 * weapons and vehicles: those live in the shared libraries the world root lists, and they are already
 * inside the same `MP<N>.ZDB` the viewer downloads. Reading the chain costs no new bytes.
 *
 * **First wins.** `LoadTextures_PS2` (`zNode/node_saveload.cpp:172-193`) skips a name an
 * already-loaded library owns, and the map's own library is last in `assetlibs`, so a map-local name
 * never overrides a shared one. `PaletteTable.fromZars` already resolves its ids the same way, so the
 * palettes go in the same order.
 *
 * A library missing its `_TXR` or `_PAL` member is normal -- `JUNK_PAL.ZED` does not exist on most
 * maps, because `null_xmas.bmp` is direct 16bpp and needs no palette -- so a missing member of one
 * library is a skip. Only a total failure costs the diagnostic and the textures.
 */
export function textureLibrary(bytes: Uint8Array, toc: ZdbEntry[], stem: string, notes: {add(line:string):void}):
{ palettes: PaletteTable; keys: Map<string, { zar: Zar; key: ZarKey; library:string }>; libs: number } | null {
  const stems = assetLibStems(bytes, toc, stem, notes);
  const keys = new Map<string, { zar: Zar; key: ZarKey; library:string }>();
  const pals: Zar[] = [];
  let found = 0;
  for (const lib of stems) {
    try {
      const txr = Zar.parse(zdbMember(bytes, toc, `${lib}_TXR.ZED`));
      found++;
      for (const key of txr.find('textures')?.children ?? []) {
        const name = textureKey(key.name);
        if (!keys.has(name)) keys.set(name, { zar: txr, key, library:lib });   // first library wins
      }
    } catch { /* a library with no textures of its own is ordinary */ }
    try {
      pals.push(Zar.parse(zdbMember(bytes, toc, `${lib}_PAL.ZED`)));
    } catch { /* and one with no palettes likewise */ }
  }
  if (found === 0) {
    notes.add(`textures: no readable _TXR.ZED among ${stems.length} asset libs -- `
      + 'the map draws in vertex colour alone');
    return null;
  }
  return { palettes: PaletteTable.fromZars(pals), keys, libs: stems.length };
}

export function isOpaque(rgba: Rgba): boolean {
  const a = rgba.data;
  const step = Math.max(4, (Math.floor(a.length / 4 / 4096) || 1) * 4);
  for (let i = 3; i < a.length; i += step) if (a[i]! < 247) return false;
  return true;
}

export function isGraded(rgba: Rgba): boolean {
  const a = rgba.data;
  let soft = 0;
  // Every fourth byte, and only a sample of them: a 256x256 texture is 65,536 pixels and the answer
  // does not need all of them.
  const step = Math.max(4, (Math.floor(a.length / 4 / 4096) || 1) * 4);
  for (let i = 3; i < a.length; i += step) {
    const v = a[i]!;
    if (v > 8 && v < 247 && ++soft > 16) return true;
  }
  return false;
}

const recordsByAddr = new WeakMap<Zar, Map<number, ZarKey>>();

/**
 * A mipmapped texture's own levels (`LoadedMap.textureMips`): `MIPTBP1`'s pointers resolved to the records beside it,
 * each decoded and required to be exactly half the level above. Null when the texture asks for none, or when a level
 * is missing or the wrong size -- the caller then lets the renderer generate the chain, with a diagnostic.
 */
export function mipLevels(txr: Zar, record: TextureRecord, palettes: PaletteTable, note: (line: string) => void, maxEdge?:number): Rgba[] | null {
  const tbps = record.gs?.mipmaps ? record.gs.mipTbp : undefined;
  if (!tbps || tbps.length === 0) return null;
  let byAddr = recordsByAddr.get(txr);
  if (!byAddr) {
    byAddr = new Map();
    for (const key of txr.find('textures')?.children ?? []) {
      const texdat = txr.child(key, 'texdat');
      if (!texdat) continue;
      const data = txr.data(texdat);
      if (data.length >= 12) byAddr.set(new DataView(data.buffer, data.byteOffset).getUint32(8, true), key);   // 36 §5: gsaddr
    }
    recordsByAddr.set(txr, byAddr);
  }
  const levels: Rgba[] = [];
  for (const [i, tbp] of tbps.entries()) {
    const key = byAddr.get(tbp);
    const texdat = key ? txr.child(key, 'texdat') : undefined;
    if (!key || !texdat) { note(`mip level ${i + 1} at gsaddr ${tbp} is not in its library; the chain is generated`); return null; }
    const mipRecord = parseTextureRecord(key.name, txr.data(texdat));
    if (maxEdge !== undefined) requirePack(mipRecord.width <= maxEdge && mipRecord.height <= maxEdge);
    const level = decodeTexture(mipRecord, palettes).rgba;
    if (level.width !== record.width >> (i + 1) || level.height !== record.height >> (i + 1)) {
      note(`mip level ${i + 1} (${key.name}) is ${level.width}x${level.height}, not half the level above; the chain is generated`);
      return null;
    }
    levels.push(level);
  }
  return levels;
}


/** A bounded selected-texture decode using the same library precedence and mips as loadMap; `stem` the map's (GX-1c). */
export function readSelectedMapTextures(bytes:Uint8Array,names:string[],stem='MP51'):PackSource[]{
  requirePack(bytes.length>0&&bytes.length<=128*1024*1024&&names.length>0&&names.length<=4&&new Set(names).size===names.length);
  const notes={add(_line:string){}};const lib=textureLibrary(bytes,parseZdb(bytes),stem,notes);requirePack(lib);
  return names.map(name=>{const hit=lib.keys.get(name);requirePack(hit);const data=hit.zar.child(hit.key,'texdat');requirePack(data);
    const record=parseTextureRecord(hit.key.name,hit.zar.data(data));requirePack(record.width <= 512 && record.height <= 512);
    const rgba=decodeTexture(record,lib.palettes).rgba;
    const source:PackSource={key:name,library:hit.library,record:hit.key.name,levels:[rgba,...(mipLevels(hit.zar,record,lib.palettes,()=>undefined,512)??[])],
      flags:{bilinear:record.bilinear,transparent:record.transparent,graded:isGraded(rgba),opaque:isOpaque(rgba),gs:record.gs}};validateSource(source);return source;});
}
