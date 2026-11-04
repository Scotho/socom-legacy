import type {Rgba} from '@s2u/gs';
import type {TextureFlags} from './materialSpec';

/**
 * Owner-authorized browser experiment, research260 (sections 4 and 9). Budgets are experiment limits, not console values:
 * GX.R4 (plan 2026-10-09-web-graphics-upscale-pack) -- every eligible MP51 world texture (256 a sanity bound), 2x or 4x,
 * a 2048 replacement edge, 16 MiB an entry, 192 MiB in all; the manifest bound grows with the entry bound.
 */
export const PACK_LIMITS = {entries:256,sourceEdge:512,outputEdge:2048,manifestBytes:1024*1024,entryBytes:16*1024*1024,totalBytes:192*1024*1024,methodLength:512} as const;
/** The replacement scales a pack may declare; one size-changing swap serves both (texturePackRuntime). */
export const PACK_SCALES = [2,4] as const;
export type PackScale = typeof PACK_SCALES[number];
/** GX-1b: which source set a pack was made from and is applied to (`packSourcesFor`); a manifest without it is 'world'. */
export const PACK_ROLES = ['world','wide'] as const;
export type PackRoles = typeof PACK_ROLES[number];
/**
 * The maps a pack may serve: every map archive, `MP<n>` (GX.R9, 2026-10-09; GX-1c had the three lobby maps), and since
 * GX-27 the campaign's, `M<n>` (`RUN/M51.ZDB` ... `RUN/M83.ZDB`; the merge controller's word, 2026-10-15). Each has its
 * own directory and manifest, and the manifest names its map. `MAP_ARCHIVE` is the manifest's and the export's form.
 */
export type PackMap = `MP${number}` | `M${number}`;
export type PackMapArchive = `RUN/${PackMap}.ZDB`;
const MAP_STEM = /^MP?\d+$/;
export const MAP_ARCHIVE = /^RUN\/MP?\d+\.ZDB$/;
export const packMap=(v:unknown):v is PackMap=>typeof v==='string'&&MAP_STEM.test(v);
export const mapArchiveOf=(map:PackMap):PackMapArchive=>`RUN/${map}.ZDB`;
/** The served directory of a map's packs: `current.json` and the content-addressed packs beneath it. */
export const packRoot=(map:PackMap):string=>`/experimental-packs/${map.toLowerCase()}/`;
export const packRoles=(v:unknown):v is PackRoles=>(PACK_ROLES as readonly unknown[]).includes(v);
/** A level-count bound: a full chain of an outputEdge texture down to 1x1. */
const MAX_LEVELS = Math.log2(PACK_LIMITS.outputEdge)+1;
export interface PackSource {key:string;flags:TextureFlags;levels:Rgba[];library?:string;record?:string}
export interface PackLevel {width:number;height:number;offset:number;bytes:number;sourceLevel:number|null}
export interface PackEntry {
  key:string;file:string;bytes:number;sha256:string;sourceDigest:string;sourceFlags:TextureFlags;
  sourceLevels:{width:number;height:number;sha256:string}[];library:string;record:string;
  mipmaps:boolean;levels:PackLevel[];
}
export interface PackProvenance {archiveSha256:string;archiveBytes:number;toolCommit:string;toolSha256:string}
export interface PackManifest {
  format:'s2u-local-texture-pack';version:1;mapArchive:PackMapArchive;localOnly:true;
  /** How the base levels were made: "lanczos3", or an import's tool, model and weights hash (GX.R2). Printable ASCII. */
  method:string;scale:PackScale;roles?:PackRoles;
  provenance:PackProvenance;totalBytes:number;entries:PackEntry[];
}
export function requirePack(ok:unknown):asserts ok {if(!ok)throw new Error('Invalid or unsupported local texture pack');}
export const hashString=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(n:unknown,min:number,max:number):n is number=>Number.isSafeInteger(n)&&Number(n)>=min&&Number(n)<=max;
/** A manifest's method: printable ASCII, 1 to methodLength characters. */
export const packMethod=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=PACK_LIMITS.methodLength&&/^[\x20-\x7e]+$/.test(v);
export const packScale=(v:unknown):v is PackScale=>(PACK_SCALES as readonly unknown[]).includes(v);
const edge=(n:unknown,max:number):n is number=>integer(n,1,max)&&(Number(n)&(Number(n)-1))===0;
export async function sha256(bytes:Uint8Array):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));
  requirePack(typeof value!=='number'||Number.isFinite(value));return value;
}
export function validateSource(s:PackSource):void {
  requirePack(typeof s.key==='string'&&s.key.length>0&&s.key.length<=128&&s.key===s.key.toLowerCase());
  requirePack(s.flags.opaque&&!s.flags.transparent&&!s.flags.graded&&s.levels.length>0&&s.levels.length<=10);
  const mip=s.flags.gs?.mipmaps===true;
  requirePack(s.levels.length===(mip?(s.flags.gs!.levels+1):1));
  for(const [i,l] of s.levels.entries()){
    requirePack(edge(l.width,PACK_LIMITS.sourceEdge)&&edge(l.height,PACK_LIMITS.sourceEdge)&&l.data.length===l.width*l.height*4);
    if(i)requirePack(l.width===Math.max(1,s.levels[i-1]!.width>>1)&&l.height===Math.max(1,s.levels[i-1]!.height>>1));
    for(let a=3;a<l.data.length;a+=4)requirePack(l.data[a]===255);
  }
}
export async function sourceDigest(s:PackSource,map:PackMapArchive='RUN/MP51.ZDB'):Promise<string>{
  // Runtime binds only the selected decoded inputs, not an unverified whole-archive identity.
  const levels=[];for(const l of s.levels)levels.push({width:l.width,height:l.height,sha256:await sha256(new Uint8Array(l.data.buffer,l.data.byteOffset,l.data.byteLength))});
  return descriptorDigest(s.key,s.flags,levels,map);
}
export function descriptorDigest(key:string,flags:TextureFlags,levels:PackEntry['sourceLevels'],map:PackMapArchive='RUN/MP51.ZDB'):Promise<string>{
  return sha256(new TextEncoder().encode(JSON.stringify(canonical({version:1,map,key,flags,levels}))));
}
/** JSON is bounded before parsing. No manifest field is used as a URL except this fixed safe filename form. */
export function validateManifest(raw:unknown):PackManifest {
  const m=raw as PackManifest;requirePack(m&&typeof m==='object');
  requirePack(m.format==='s2u-local-texture-pack'&&m.version===1&&m.localOnly===true&&typeof m.mapArchive==='string'&&MAP_ARCHIVE.test(m.mapArchive)&&packScale(m.scale)&&packMethod(m.method)&&(m.roles===undefined||packRoles(m.roles)));
  requirePack(m.provenance&&hashString(m.provenance.archiveSha256)&&hashString(m.provenance.toolSha256)&&/^[a-f0-9]{40}$/.test(m.provenance.toolCommit));
  requirePack(integer(m.provenance.archiveBytes,1,128*1024*1024));
  requirePack(Array.isArray(m.entries)&&m.entries.length>0&&m.entries.length<=PACK_LIMITS.entries);
  const keys=new Set<string>(),files=new Set<string>();let total=0;
  for(const e of m.entries){
    requirePack(e&&typeof e.key==='string'&&e.key.length>0&&e.key.length<=128&&e.key===e.key.toLowerCase()&&!keys.has(e.key));keys.add(e.key);
    requirePack(typeof e.file==='string'&&/^(0|[1-9][0-9]{0,2})\.rgba$/.test(e.file)&&parseInt(e.file,10)<PACK_LIMITS.entries&&!files.has(e.file));files.add(e.file);
    requirePack(hashString(e.sha256)&&hashString(e.sourceDigest)&&integer(e.bytes,4,PACK_LIMITS.entryBytes));
    requirePack(typeof e.mipmaps==='boolean'&&Array.isArray(e.sourceLevels)&&e.sourceLevels.length>0&&e.sourceLevels.length<=10);
    for(const [i,s] of e.sourceLevels.entries()){
      requirePack(s&&edge(s.width,PACK_LIMITS.sourceEdge)&&edge(s.height,PACK_LIMITS.sourceEdge)&&hashString(s.sha256));
      if(i)requirePack(s.width===Math.max(1,e.sourceLevels[i-1]!.width>>1)&&s.height===Math.max(1,e.sourceLevels[i-1]!.height>>1));
    }
    requirePack(Array.isArray(e.levels)&&e.levels.length>=e.sourceLevels.length&&e.levels.length<=MAX_LEVELS);
    if(!e.mipmaps)requirePack(e.levels.length===1&&e.sourceLevels.length===1);
    let offset=0;
    for(const [i,l] of e.levels.entries()){
      requirePack(l&&edge(l.width,PACK_LIMITS.outputEdge)&&edge(l.height,PACK_LIMITS.outputEdge));
      requirePack(l.offset===offset&&l.bytes===l.width*l.height*4);offset+=l.bytes;
      if(i)requirePack(l.width===Math.max(1,e.levels[i-1]!.width>>1)&&l.height===Math.max(1,e.levels[i-1]!.height>>1));
      // GX-25 round 7: a chain ends at its first 1x1, as the generator's `mipChain` does (max(1, 1>>1) would let more through).
      if(i)refusePack(e.levels[i-1]!.width>1||e.levels[i-1]!.height>1,'levels past the first 1x1');
      const source=e.sourceLevels[i];
      requirePack(source?l.sourceLevel===i&&l.width===source.width*m.scale&&l.height===source.height*m.scale:l.sourceLevel===null);
    }
    if(e.mipmaps){const last=e.levels.at(-1)!;requirePack(last.width===1&&last.height===1);}
    requirePack(offset===e.bytes);total+=offset;requirePack(total<=PACK_LIMITS.totalBytes);
  }
  requirePack(total===m.totalBytes);return m;
}

/** Reads with a live cap even if the server omits or lies about Content-Length. */
export async function boundedBytes(response:Response,limit:number,signal:AbortSignal):Promise<Uint8Array>{
  if(!response.ok||!response.body)throw new Error('Local pack unavailable');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
  try{
    const declared=response.headers.get('Content-Length');requirePack(declared===null||integer(Number(declared),0,limit));
    for(;;){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;
      length+=value.byteLength;requirePack(length<=limit);chunks.push(value);
    }
    const bytes=new Uint8Array(length);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return bytes;
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}

/**
 * GX-21 (plan 2026-10-10-web-graphics-slice-4-packs, GX.R10/R11): the library of packs a map holds,
 * `experimental-packs/<map>/packs.json`. The index is the library: a pack on disk but not in it is not offered.
 * `current.json` stays the default's pointer. Browser adaptation limits, not console values.
 */
export const PACK_INDEX_LIMITS = {packs:32,indexBytes:64*1024,nameLength:48,notesLength:240} as const;
/** The kinds a loader exists for (GX.R11); any other kind is listed refused until its loader lands. */
export const PACK_KINDS = ['textures'] as const;
/** The chooser's value for "the map's default pack" (`current.json`'s) before the library is listed. */
export const PACK_CHOICE_DEFAULT = 'default';
/** A refusal with the reason the status line shows ("<name>: refused -- <reason>"). */
export class PackRefusal extends Error {constructor(readonly reason:string){super(reason);this.name='PackRefusal';}}
export function refusePack(ok:unknown,reason:string):asserts ok {if(!ok)throw new PackRefusal(reason);}
const printable=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v.length>=min&&v.length<=max&&/^[\x20-\x7e]*$/.test(v);
export const packName=(v:unknown):v is string=>printable(v,1,PACK_INDEX_LIMITS.nameLength);
export const packNotes=(v:unknown):v is string=>printable(v,0,PACK_INDEX_LIMITS.notesLength);
/** An ISO-8601 UTC instant as `Date.toISOString` writes it (milliseconds optional), and a real calendar date. */
export const packTime=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v)
  &&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19);
interface PackIndexCommon {id:string;name:string;kind:string;generatedAt:string;notes:string}
/** A texture pack's entry: its manifest's method, scale and roles, its entry count and payload bytes. */
export interface TexturePackIndexEntry extends PackIndexCommon {kind:'textures';method:string;scale:PackScale;roles:PackRoles;textures:number;bytes:number}
/** An entry of a kind with no loader: listed, never applied (GX.R11). */
export interface RefusedPackIndexEntry extends PackIndexCommon {refused:string}
export type PackIndexEntry = TexturePackIndexEntry | RefusedPackIndexEntry;
export interface PackIndex {version:1;packs:PackIndexEntry[]}
/** What the chooser lists for the loaded map: the index's entries, and the default (`current.json`'s, if listed). */
/** `pointerRefused`: a present but malformed `current.json` (no default; the index still listed), with its reason. */
/** `uploaded` (GX-27): the ids among `entries` that are the test room's uploads, kept in the page's store. */
export interface PackLibrary {entries:PackIndexEntry[];defaultId:string|null;refused?:string;refusedFile?:'packs.json'|'current.json';pointerRefused?:string;uploaded?:string[]}
/** Bounded before parsing (`PACK_INDEX_LIMITS.indexBytes`); every field checked; only the known fields are kept. */
export function validatePackIndex(raw:unknown):PackIndex {
  const x=raw as {version?:unknown;packs?:unknown}|null;
  refusePack(x&&typeof x==='object'&&!Array.isArray(x)&&x.version===1,'not a version 1 pack index');
  refusePack(Array.isArray(x.packs),'no pack list');
  refusePack(x.packs.length<=PACK_INDEX_LIMITS.packs,`more than ${PACK_INDEX_LIMITS.packs} packs`);
  const ids=new Set<string>(),packs:PackIndexEntry[]=[];
  for(const [i,p] of (x.packs as Record<string,unknown>[]).entries()){
    const at=`pack ${i+1}`;
    refusePack(p&&typeof p==='object'&&!Array.isArray(p),`${at} is not an object`);
    refusePack(hashString(p['id']),`${at}: id is not a sha256`);refusePack(!ids.has(p['id']),`duplicate id ${p['id'].slice(0,12)}`);ids.add(p['id']);
    refusePack(packName(p['name']),`${at}: name is not 1-${PACK_INDEX_LIMITS.nameLength} printable characters`);
    refusePack(typeof p['kind']==='string'&&/^[a-z][a-z0-9-]{0,31}$/.test(p['kind']),`${at}: kind is not a name`);
    refusePack(packTime(p['generatedAt']),`${at}: generatedAt is not an ISO-8601 UTC time`);
    const notes=p['notes']??'';refusePack(packNotes(notes),`${at}: notes are not 0-${PACK_INDEX_LIMITS.notesLength} printable characters`);
    const common={id:p['id'],name:p['name'],kind:p['kind'],generatedAt:p['generatedAt'],notes};
    if(!(PACK_KINDS as readonly string[]).includes(common.kind)){packs.push({...common,refused:`no loader for kind ${common.kind}`});continue;}
    refusePack(packMethod(p['method']),`${at}: method is not 1-${PACK_LIMITS.methodLength} printable characters`);
    refusePack(packScale(p['scale']),`${at}: scale is not 2 or 4`);refusePack(packRoles(p['roles']),`${at}: roles is not world or wide`);
    refusePack(integer(p['textures'],1,PACK_LIMITS.entries),`${at}: textures is not 1-${PACK_LIMITS.entries}`);
    refusePack(integer(p['bytes'],4,PACK_LIMITS.totalBytes),`${at}: bytes is out of bounds`);
    packs.push({...common,kind:'textures',method:p['method'],scale:p['scale'],roles:p['roles'],textures:p['textures'],bytes:p['bytes']});
  }
  return {version:1,packs};
}
/** An index entry agrees with the manifest it names: method, scale, roles, entry count and payload bytes. */
export const indexMatches=(e:TexturePackIndexEntry,m:PackManifest):boolean=>
  e.method===m.method&&e.scale===m.scale&&e.roles===(m.roles??'world')&&e.textures===m.entries.length&&e.bytes===m.totalBytes;
