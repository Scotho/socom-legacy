import {decodePngAsync,pngSize} from './png';
import {openZip,ZipError,ZIP_LIMITS,type ZipArchive,type ZipLimits,type ZipMember,type ZipSource} from './zipReader';
import {buildImportedPack,importExport,EXPORT_INDEX_FORMAT,EXPORT_STEM,type BuiltPack,type ExportReader,type LeftOut} from './texturePackBuild';
import {hashString,MAP_ARCHIVE,mapArchiveOf,packMethod,packName,packNotes,packRoles,PACK_LIMITS,PackRefusal,refusePack,sha256,
  type PackMap,type PackProvenance,type PackRoles,type PackScale,type PackSource,type TexturePackIndexEntry} from './texturePack';

/**
 * GX-27 (plan 2026-10-10-web-graphics-slice-4-packs; the owner's word 2026-10-15; product track): a texture pack
 * uploaded in the test room -- a browser adaptation with no original, under H135 (GX.R1/R8/R9/R11): it changes texels
 * only, only in `/testroom` with the Experimental view on. The upload is a base pack's zip (the generator's `--export`,
 * zipped) after an artist replaced some PNGs, each exactly 2x or 4x its padded export, all at one scale; a PNG left at
 * its export's size keeps its original. Its map is its `export.json`'s `mapArchive`, never a file or folder name (the
 * controller's word, 2026-10-15): the files sit flat at the root or under folders of any name, one map a folder. The
 * pack is built by the generator's own import core (`importExport`), so the same PNGs give the same pack.
 * A zip with no `export.json` and at least one `.png` is a plain pack (conventions §10): PNGs named after texture
 * keys, each exactly 2x or 4x the source's base level, built at once for the loaded map and never staged.
 */
export const UPLOAD_LIMITS = {packJsonBytes: 4096, exportJsonBytes: 1024 * 1024, sidecarBytes: 64 * 1024} as const;
/** The method recorded when `pack.json` names none. */
export const UPLOAD_METHOD_DEFAULT = 'uploaded';
/** The name recorded when neither `pack.json` nor the file name gives one. */
export const UPLOAD_NAME_DEFAULT = 'uploaded pack';
/** The uploader's identity: its sha256 is the manifest's `provenance.toolSha256` (conventions §10; a hand-made pack's own digest, §6). */
export const UPLOAD_TOOL = 's2u-texture-pack-upload/1';
/** The largest padded PNG the import decodes (the generator's own bound: 3 x 512 at 4x). */
const MAX_EDGE = 3 * PACK_LIMITS.sourceEdge * 4;
/** A plain PNG is not padded: the largest the import decodes is 4x the source edge (512). */
const PLAIN_EDGE = 4 * PACK_LIMITS.sourceEdge;

export interface UploadMeta {name: string; notes: string; method: string}
/**
 * One map's part of an upload: its folder (`''` the root), the map and roles its `export.json` names, its metadata,
 * the scale, the textures kept original before any decode (`kept`, by stem: `untouched`, `size`, `unreadable`), the
 * count and stems replaced, `declaredBytes` (what the zip declares for `export.json`, the sidecars and the replaced
 * PNGs: what staging stores, known before any of it is read), and `read` -- a file of the folder (`export.json`,
 * `<stem>.json`, `<stem>.png`) or, for a plain pack, a zip member by its path. `plainMembers` is set only for a plain
 * pack: the zip member of each replaced key. That part is built for the loaded map at once and never staged.
 */
export interface UploadPart {
  map: PackMap; folder: string; roles: PackRoles; meta: UploadMeta; scale: PackScale;
  stems: string[]; kept: Map<string, LeftOut['reason']>; replaced: number; replacedStems: string[]; declaredBytes: number;
  plainMembers?: ReadonlyMap<string, string>;
  read(file: string): Promise<Uint8Array | null>;
}
/**
 * What a plain pack is built against: the loaded map, and its eligible sources for the roles `pack.json` names
 * (`packSourcesFor`). Absent, a zip of PNGs with no `export.json` is refused -- a plain pack is never staged.
 */
export interface PlainLoad {
  map: PackMap;
  sourcesFor(roles: PackRoles): readonly PackSource[];
}
/** `skipped` (review F4): the maps whose folders replaced no PNG (an all-maps package's untouched maps), left out. */
export interface Upload {scale: PackScale; parts: UploadPart[]; skipped: PackMap[]}

const decode = (b: Uint8Array): string => new TextDecoder().decode(b);
/** The default name: the file's name without `.zip`, anything not printable ASCII as `_`, at most 48 characters. */
export function uploadName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.zip$/i, '').replace(/[^\x20-\x7e]/g, '_').trim().slice(0, 48).trim();
  return base || UPLOAD_NAME_DEFAULT;
}
/** `pack.json` (optional): `{name?, notes?, method?}`, each checked as the library's (§2); absent fields take the defaults. */
export function uploadMeta(raw: Uint8Array | null, fileName: string): UploadMeta {
  const fallback = {name: uploadName(fileName), notes: '', method: UPLOAD_METHOD_DEFAULT};
  if (!raw) return fallback;
  refusePack(raw.length <= UPLOAD_LIMITS.packJsonBytes, `pack.json: over ${UPLOAD_LIMITS.packJsonBytes} bytes`);
  let v: unknown;
  try { v = JSON.parse(decode(raw)); } catch { throw new PackRefusal('pack.json: not JSON'); }
  refusePack(v !== null && typeof v === 'object' && !Array.isArray(v), 'pack.json: not an object');
  const o = v as Record<string, unknown>;
  const name = o['name'] ?? fallback.name, notes = o['notes'] ?? '', method = o['method'] ?? fallback.method;
  refusePack(packName(name), 'pack.json: name is not 1-48 printable characters');
  refusePack(packNotes(notes), 'pack.json: notes are not 0-240 printable characters');
  refusePack(packMethod(method), `pack.json: method is not 1-${PACK_LIMITS.methodLength} printable characters`);
  return {name, notes, method};
}

interface ExportIndex {mapArchive: string; archiveSha256: string; archiveBytes: number; toolCommit: string; roles?: PackRoles; entries: {key: string; stem: string}[]}
/** The export index's form (`export.json`): what the import reads of it, checked before anything else is. */
function exportIndex(v: unknown): ExportIndex | null {
  const x = v as Partial<ExportIndex> & {format?: unknown; version?: unknown} | null;
  if (!x || typeof x !== 'object' || x.format !== EXPORT_INDEX_FORMAT || x.version !== 1) return null;
  if (typeof x.mapArchive !== 'string' || !MAP_ARCHIVE.test(x.mapArchive) || !hashString(x.archiveSha256)) return null;
  if (!Number.isSafeInteger(x.archiveBytes) || x.archiveBytes! < 1 || x.archiveBytes! > 128 * 1024 * 1024) return null;
  if (typeof x.toolCommit !== 'string' || !/^[a-f0-9]{40}$/.test(x.toolCommit) || (x.roles !== undefined && !packRoles(x.roles))) return null;
  if (!Array.isArray(x.entries) || x.entries.length > PACK_LIMITS.entries) return null;
  for (const e of x.entries) if (!e || typeof e.key !== 'string' || typeof e.stem !== 'string' || !EXPORT_STEM.test(e.stem)) return null;
  return x as ExportIndex;
}
const sidecarSize = (b: Uint8Array): {width: number; height: number} | null => {
  try {
    const s = JSON.parse(decode(b)) as {width?: unknown; height?: unknown; paddedWidth?: unknown; paddedHeight?: unknown};
    const ok = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 1 && (n as number) <= PACK_LIMITS.sourceEdge;
    return s && ok(s.width) && ok(s.height) && s.paddedWidth === 3 * s.width && s.paddedHeight === 3 * s.height ? {width: s.paddedWidth, height: s.paddedHeight} : null;
  } catch { return null; }
};

/** A plain PNG's texture key (the owner's loader): basename without `.png`, lower-cased; a name with no dot gains `.tif`. */
function plainTextureKey(memberName: string): string {
  const base = memberName.slice(memberName.lastIndexOf('/') + 1);
  const file = base.replace(/\.png$/i, '').toLowerCase();
  return file.includes('.') ? file : file + '.tif';
}
/** `pack.json` for a plain pack: today's name, notes and method, plus optional `roles` (default `wide`) and `mapArchive`. */
function plainJson(raw: Uint8Array | null): {roles: PackRoles; mapArchive: string | null} {
  if (!raw) return {roles: 'wide', mapArchive: null};
  const o = JSON.parse(decode(raw)) as Record<string, unknown>;
  const roles = o['roles'] ?? 'wide';
  refusePack(packRoles(roles), 'pack.json: roles is not world or wide');
  if (o['mapArchive'] === undefined) return {roles, mapArchive: null};
  refusePack(typeof o['mapArchive'] === 'string' && MAP_ARCHIVE.test(o['mapArchive']), 'pack.json: mapArchive is not a map archive');
  return {roles, mapArchive: o['mapArchive']};
}
/**
 * A zip with no `export.json` and at least one `.png`: one part for `loaded`, classified by each PNG's header against
 * the eligible source's base level. Pixels are not read here. Two files that give one key refuse the upload.
 */
async function readPlainPack(zip: ZipArchive, byName: Map<string, ZipMember>, read: (m: ZipMember, max: number) => Promise<Uint8Array>, fileName: string, limits: ZipLimits, loaded: PlainLoad): Promise<Upload> {
  const metaMember = byName.get('pack.json');
  if (metaMember) refusePack(metaMember.size <= UPLOAD_LIMITS.packJsonBytes, `pack.json: over ${UPLOAD_LIMITS.packJsonBytes} bytes`);
  const raw = metaMember ? await read(metaMember, UPLOAD_LIMITS.packJsonBytes) : null;
  const meta = uploadMeta(raw, fileName), extra = plainJson(raw);
  const wanted = mapArchiveOf(loaded.map);
  refusePack(extra.mapArchive === null || extra.mapArchive === wanted, `pack.json mapArchive is ${extra.mapArchive}; the loaded map is ${wanted}`);
  const byKey = new Map<string, ZipMember>();
  for (const m of byName.values()) {
    if (!/\.png$/i.test(m.name)) continue;
    const key = plainTextureKey(m.name), other = byKey.get(key);
    refusePack(other === undefined, `${other?.name} and ${m.name} both name ${key}`);
    byKey.set(key, m);
  }
  const sources = loaded.sourcesFor(extra.roles), sourceByKey = new Map(sources.map(s => [s.key, s]));
  const kept = new Map<string, LeftOut['reason']>(), replacedStems: string[] = [], plainMembers = new Map<string, string>(), scales = new Set<PackScale>();
  let declaredBytes = 0;
  for (const source of sources) {
    const png = byKey.get(source.key);
    if (!png) continue;
    const dim = pngSize(await zip.head(png, 33).catch(() => new Uint8Array(0))), base = source.levels[0];
    const scale = dim && base ? [2, 4].find(n => dim.width === base.width * n && dim.height === base.height * n) : undefined;
    if (scale === undefined) kept.set(source.key, 'size');
    else { scales.add(scale as PackScale); replacedStems.push(source.key); plainMembers.set(source.key, png.name); declaredBytes += png.size; }
  }
  for (const key of byKey.keys()) if (!sourceByKey.has(key)) kept.set(key, 'notEligible');
  // The review's ask (2): more than a pack may hold is refused here, before a pixel is decoded (`buildImportedPack` checks it after).
  refusePack(replacedStems.length <= PACK_LIMITS.entries, `more than ${PACK_LIMITS.entries} replaced textures (a pack holds at most ${PACK_LIMITS.entries})`);
  refusePack(scales.size < 2, 'mixed scales: 2x and 4x (every replaced PNG must be at one scale)');
  refusePack(scales.size === 1, `no PNG names an eligible texture on ${loaded.map} at 2x or 4x`);
  const scale = [...scales][0]!;
  const part: UploadPart = {map: loaded.map, folder: '', roles: extra.roles, meta, scale, stems: [...byKey.keys()], kept, replaced: replacedStems.length, replacedStems, declaredBytes, plainMembers, read: async file => {
    const m = byName.get(file);
    return m ? read(m, limits.memberBytes) : null;
  }};
  return {scale, parts: [part], skipped: []};
}

/**
 * Reads an upload: every folder holding an `export.json` is one map's part (`__MACOSX/` aside); two folders exporting
 * one archive, a malformed index, a malformed `pack.json` (the folder's own, else the nearest above it), mixed scales,
 * or no PNG replaced refuses the whole upload with its reason. Each PNG is classified by its header alone against its
 * sidecar's padded size; the pixels are decoded only when the part is built. A zip with no `export.json` and at least
 * one `.png` is a plain pack (`readPlainPack`); any other zip without an `export.json` keeps the refusal below.
 */
export async function readUpload(source: ZipSource, fileName: string, limits: ZipLimits = ZIP_LIMITS, loaded?: PlainLoad): Promise<Upload> {
  let zip: ZipArchive;
  try { zip = await openZip(source, limits); } catch (e) { throw e instanceof ZipError ? new PackRefusal(e.message) : e; }
  const read = async (m: ZipMember, max: number): Promise<Uint8Array> => {
    refusePack(m.size <= max, `${m.name}: over ${max} bytes`);
    try { return await zip.read(m); } catch (e) { throw e instanceof ZipError ? new PackRefusal(e.message) : e; }
  };
  const byName = new Map(zip.members.filter(m => !m.name.endsWith('/') && !m.name.startsWith('__MACOSX/')).map(m => [m.name, m]));
  const folders = [...byName.keys()].filter(n => n === 'export.json' || n.endsWith('/export.json')).map(n => n.slice(0, -'export.json'.length));
  if (folders.length === 0) {
    const pngs = [...byName.values()].filter(m => /\.png$/i.test(m.name));
    if (pngs.length === 0) refusePack(false, 'no export.json in the zip (a base pack holds one for its map)');
    refusePack(loaded, 'a plain pack is built for the loaded map, and none is loaded');
    return readPlainPack(zip, byName, read, fileName, limits, loaded);
  }
  const packJson = async (folder: string): Promise<Uint8Array | null> => {
    for (let dir = folder; ; dir = dir.slice(0, dir.slice(0, -1).lastIndexOf('/') + 1)) {
      const m = byName.get(dir + 'pack.json');
      if (m) { refusePack(m.size <= UPLOAD_LIMITS.packJsonBytes, `pack.json: over ${UPLOAD_LIMITS.packJsonBytes} bytes`); return read(m, UPLOAD_LIMITS.packJsonBytes); }
      if (dir === '') return null;
    }
  };
  const parts: Omit<UploadPart, 'scale'>[] = [], scales = new Set<PackScale>(), seen = new Map<string, string>(), skipped: PackMap[] = [];
  for (const folder of folders) {
    const label = folder || 'the zip\'s root';
    let index: ExportIndex | null = null;
    try { index = exportIndex(JSON.parse(decode(await read(byName.get(folder + 'export.json')!, UPLOAD_LIMITS.exportJsonBytes)))); } catch (e) { if (e instanceof PackRefusal) throw e; }
    refusePack(index, `${folder}export.json: not a base pack's export index`);
    const other = seen.get(index.mapArchive);
    refusePack(other === undefined, `${other || 'the zip\'s root'} and ${label} both export ${index.mapArchive}`);
    seen.set(index.mapArchive, folder);
    const meta = uploadMeta(await packJson(folder), fileName);
    const kept = new Map<string, LeftOut['reason']>(), stems = index.entries.map(e => e.stem), replacedStems: string[] = [];
    let declaredBytes = byName.get(folder + 'export.json')!.size;
    for (const stem of stems) {
      const side = byName.get(`${folder}${stem}.json`), png = byName.get(`${folder}${stem}.png`);
      if (side) declaredBytes += side.size;
      if (!side || !png) continue;                                     // the import says `missing`
      const padded = sidecarSize(await read(side, UPLOAD_LIMITS.sidecarBytes));
      // Re-review finding 3: a sidecar without a padded size of 3x its texture keeps that texture original as `changed`,
      // the same whether the part is built now or staged (its PNG is then never stored).
      if (!padded) { kept.set(stem, 'changed'); continue; }
      const size = pngSize(await zip.head(png, 33).catch(() => new Uint8Array(0)));
      if (!size) { kept.set(stem, 'unreadable'); continue; }
      const scale = size.width === padded.width && size.height === padded.height ? 1
        : [2, 4].find(n => size.width === padded.width * n && size.height === padded.height * n);
      if (scale === 1) kept.set(stem, 'untouched');
      else if (scale === undefined) kept.set(stem, 'size');
      else { scales.add(scale as PackScale); replacedStems.push(stem); declaredBytes += png.size; }
    }
    const map = index.mapArchive.slice(4, -4) as PackMap, files = new Set([...byName.keys()].filter(n => n.startsWith(folder)));
    // Review F4: a map with nothing replaced (an all-maps package's untouched maps) is skipped, counted for one line.
    if (replacedStems.length === 0) { skipped.push(map); continue; }
    parts.push({map, folder, roles: index.roles ?? 'world', meta, stems, kept, replaced: replacedStems.length, replacedStems, declaredBytes, read: async file => {
      const m = files.has(folder + file) ? byName.get(folder + file) : undefined;
      return m ? read(m, file === 'export.json' ? UPLOAD_LIMITS.exportJsonBytes : file.endsWith('.json') ? UPLOAD_LIMITS.sidecarBytes : limits.memberBytes) : null;
    }});
  }
  refusePack(scales.size < 2, 'mixed scales: 2x and 4x (every replaced PNG must be at one scale)');
  refusePack(scales.size === 1, 'no texture was replaced (a replaced PNG is exactly 2x or 4x its export\'s size)');
  const scale = [...scales][0]!;
  return {scale, parts: parts.map(p => ({...p, scale})), skipped};
}

/** The provenance an upload records: the export's archive and commit, and the uploader's own digest (`UPLOAD_TOOL`). */
export async function uploadProvenance(part: UploadPart): Promise<PackProvenance> {
  const raw = await part.read('export.json'), index = raw ? exportIndex(JSON.parse(decode(raw))) : null;
  refusePack(index, `${part.folder}export.json: not a base pack's export index`);
  return {archiveSha256: index.archiveSha256, archiveBytes: index.archiveBytes, toolCommit: index.toolCommit, toolSha256: await sha256(new TextEncoder().encode(UPLOAD_TOOL))};
}
/**
 * A plain pack's provenance: the loaded map archive's own sha256 and size, `toolCommit` the build's full commit, and
 * the same uploader digest as an export upload. The caller read the archive; this does not invent either value.
 */
export async function plainProvenance(archive: Uint8Array, toolCommit: string): Promise<PackProvenance> {
  refusePack(archive.byteLength >= 1 && archive.byteLength <= 128 * 1024 * 1024, `the map archive is ${archive.byteLength} bytes (a plain pack records the archive's size)`);
  refusePack(/^[a-f0-9]{40}$/.test(toolCommit), 'plain pack: this build has no 40-character commit to record');
  return {archiveSha256: await sha256(archive), archiveBytes: archive.byteLength, toolCommit, toolSha256: await sha256(new TextEncoder().encode(UPLOAD_TOOL))};
}

export interface BuiltUpload {pack: BuiltPack; leftOut: LeftOut[]; entry: TexturePackIndexEntry}
/**
 * Builds one part against `sources` -- the loaded map's eligible set for the part's roles (`packSourcesFor`) -- through
 * the generator's import core; the library entry is the pack's (§2). Nothing left to import refuses, with its reason.
 */
/** The bounds a plain part's decode keeps: `PACK_LIMITS`' entries and total bytes (a test may pass smaller). */
export type PlainPackLimits = Pick<typeof PACK_LIMITS, 'entries' | 'totalBytes'> | {entries: number; totalBytes: number};
/**
 * A plain part: decode only the replaced PNGs (no crop -- they are not padded) and hand them to `buildImportedPack`. The
 * decode is bounded as it goes (the review's ask (2)): no more than `entries` replaced, and once the next image would take
 * the running total of decoded bytes past `totalBytes`, it is left out as `totalBytes` undecoded and every key after it unread.
 */
async function buildPlainPart(part: UploadPart, sources: readonly PackSource[], provenance: PackProvenance, now?: Date, limits: PlainPackLimits = PACK_LIMITS): Promise<BuiltUpload> {
  const members = part.plainMembers;
  refusePack(members, 'plain pack: nothing was classified');
  const bySource = new Map(sources.map(s => [s.key, s])), leftOut: LeftOut[] = [...part.kept].map(([key, reason]) => ({key, reason}));
  const items: {source: PackSource; base: Awaited<ReturnType<typeof decodePngAsync>>}[] = [];
  refusePack(part.replacedStems.length <= limits.entries, `more than ${limits.entries} replaced textures (a pack holds at most ${limits.entries})`);
  let decoded = 0;
  for (const [i, key] of part.replacedStems.entries()) {
    const source = bySource.get(key), name = members.get(key), bytes = name ? await part.read(name) : null;
    if (!source || !bytes) { leftOut.push({key, reason: 'missing'}); continue; }
    // The review's ask (2), with its re-review's finding 1: sized off the header before a pixel is decoded, the image that
    // would take the decoded total past a pack's bound is left out as `totalBytes`, not decoded, with every key after it unread, and
    // the pack is built from what is held -- `buildImportedPack`'s own rule for the cap (§5: refused only when nothing is left).
    const dim = pngSize(bytes), size = dim ? dim.width * dim.height * 4 : 0;
    if (decoded + size > limits.totalBytes) {
      for (const rest of part.replacedStems.slice(i)) leftOut.push({key: rest, reason: 'totalBytes'});
      break;
    }
    let base: Awaited<ReturnType<typeof decodePngAsync>>;
    try { base = await decodePngAsync(bytes, PLAIN_EDGE); }
    catch { leftOut.push({key, reason: 'unreadable'}); continue; }
    decoded += base.data.length;
    items.push({source, base});
  }
  let built: BuiltPack & {leftOut: LeftOut[]};
  try { built = await buildImportedPack(items, {method: part.meta.method, scale: part.scale, roles: part.roles, map: part.map}, provenance, leftOut); }
  catch (e) { throw e instanceof PackRefusal ? e : new PackRefusal(`no replaced texture could be imported on ${part.map} (each kept its original)`); }
  const m = built.manifest;
  return {pack: built, leftOut: built.leftOut, entry: {id: built.id, name: part.meta.name, kind: 'textures', method: m.method, scale: m.scale, roles: m.roles ?? 'wide',
    generatedAt: (now ?? new Date()).toISOString(), textures: m.entries.length, bytes: m.totalBytes, notes: part.meta.notes}};
}

export async function buildUploadPart(part: UploadPart, sources: readonly PackSource[], options: {provenance?: PackProvenance; now?: Date; packLimits?: PlainPackLimits} = {}): Promise<BuiltUpload> {
  if (part.plainMembers) {
    refusePack(options.provenance, 'a plain pack records the loaded map archive, and none was given');
    return buildPlainPart(part, sources, options.provenance, options.now, options.packLimits);
  }
  const provenance = options.provenance ?? await uploadProvenance(part);
  const reader: ExportReader = {
    index: async () => { const b = await part.read('export.json'); return b ? JSON.parse(decode(b)) : null; },
    sidecar: async stem => { const b = await part.read(`${stem}.json`); if (!b) return null; try { return JSON.parse(decode(b)); } catch { return {}; } },
    image: async stem => {
      const kept = part.kept.get(stem);
      if (kept) return kept;
      const b = await part.read(`${stem}.png`);
      return b ? () => decodePngAsync(b, MAX_EDGE) : null;
    },
  };
  let built: BuiltPack & {leftOut: LeftOut[]};
  try { built = await importExport(sources, reader, {method: part.meta.method, scale: part.scale, roles: part.roles, map: part.map}, provenance); }
  catch (e) { throw e instanceof PackRefusal ? e : new PackRefusal(`no replaced texture could be imported on ${part.map} (each kept its original)`); }
  const m = built.manifest;
  return {pack: built, leftOut: built.leftOut, entry: {id: built.id, name: part.meta.name, kind: 'textures', method: m.method, scale: m.scale, roles: m.roles ?? 'world',
    generatedAt: (options.now ?? new Date()).toISOString(), textures: m.entries.length, bytes: m.totalBytes, notes: part.meta.notes}};
}

/** "<n> texture(s) imported, <k> kept original (<count> <reason>, ...)." -- the panel's line for a built part. */
export function importSummary(name: string, built: BuiltUpload): string {
  const n = built.pack.manifest.entries.length, k = built.leftOut.length, counts = new Map<string, number>();
  for (const l of built.leftOut) counts.set(l.reason, (counts.get(l.reason) ?? 0) + 1);
  const why = k ? ` (${[...counts].map(([r, c]) => `${c} ${r}`).join(', ')})` : '';
  return `${name}: ${n} texture${n === 1 ? '' : 's'} imported, ${k} kept original${why}.`;
}

/** Review F4: the line for the maps an upload skipped ("15 maps unchanged, skipped."), empty for none. */
export const skippedLine = (n: number): string => n === 0 ? '' : `${n} map${n === 1 ? '' : 's'} unchanged, skipped.`;
/**
 * A part to stage (another map's): `export.json`, the sidecars and the replaced PNGs as the zip holds them, and
 * `staged.json` carrying what the zip's reading found.
 */
export async function stagedFiles(part: UploadPart): Promise<Map<string, Uint8Array>> {
  refusePack(!part.plainMembers, 'a plain pack is built for the loaded map and is not staged');
  const files = new Map<string, Uint8Array>(), add = async (name: string) => { const b = await part.read(name); if (b) files.set(name, b); };
  await add('export.json');
  for (const stem of part.stems) await add(`${stem}.json`);
  for (const stem of part.replacedStems) await add(`${stem}.png`);
  files.set('staged.json', new TextEncoder().encode(JSON.stringify({map: part.map, folder: part.folder, roles: part.roles, meta: part.meta, scale: part.scale,
    stems: part.stems, kept: [...part.kept], replaced: part.replaced, replacedStems: part.replacedStems, declaredBytes: part.declaredBytes})));
  return files;
}
/**
 * Review F2: `stagedFiles` within `room` bytes -- the sizes the zip declares are checked first, so a part that cannot be
 * stored is refused before any of its PNGs is read.
 */
export async function stagedFilesWithin(part: UploadPart, room: number): Promise<Map<string, Uint8Array>> {
  refusePack(part.declaredBytes <= room, `${part.meta.name} (${part.map}) would pass the room left in the browser's pack store (${part.declaredBytes} bytes declared, ${room} left)`);
  return stagedFiles(part);
}
/** A staged part back from its stored files (`stagedFiles`), read through `file`. */
export async function stagedPart(file: (name: string) => Promise<Uint8Array | null>): Promise<UploadPart> {
  const raw = await file('staged.json');
  refusePack(raw, 'the staged upload is incomplete');
  const s = JSON.parse(decode(raw)) as Omit<UploadPart, 'read' | 'kept'> & {kept: [string, LeftOut['reason']][]};
  return {...s, kept: new Map(s.kept), read: file};
}
