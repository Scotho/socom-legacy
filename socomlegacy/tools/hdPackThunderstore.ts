import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,openAsBlob,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {open,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkThunderstorePackage,THUNDERSTORE_PACKAGE_RULES,unwrapThunderstore,type CheckReport,type ThunderstoreManifest} from '@s2u/creator-contracts';
import {validateHdManifest,type HdManifest} from '../packages/viewer/src/hdTexturePack';
import {HD_PACK_AUTHOR,HD_PACK_CREDIT} from '../packages/viewer/src/hdPackCredit';
import {importHdZip,type HdStore,type HdStoredMeta} from '../packages/viewer/src/hdTexturePackStore';
import {openZip,ZIP_LIMITS,type ZipSource} from '../packages/viewer/src/zipReader';
import {decodePng,encodePng} from './png';
import {writeZipFile,type ZipFileEntry} from './parity-pack/zipStream';

/**
 * B206 ML-5 (plan 2026-11-06-mods-loader, ML.R3, ML.R4, ML.R16): the owner's Thunderstore upload zip, made from an HD
 * pack `hd-pack-from-pcsx2.ts` has built, and its check. Product track (OT.R53): a tool's packaging, a browser
 * adaptation with no original; it changes nothing the game does. The owner uploads the zip (H413, H342); players
 * download it and drop it into Home > Experiments > Mods (ML-1, ML-2) -- they never build it (ML.R16). Nothing here
 * fetches or uploads, and the zip is written where the owner says, never into the repository (the pack is third-party
 * art, OT.R92: never in git, a build or a release).
 *
 * The package (Thunderstore's wiki, "Creating a package", https://wiki.thunderstore.io/mods/creating-a-package, read
 * 2026-11-07): a zip whose root holds `manifest.json` (`name` 1-128 of `[A-Za-z0-9_]`, `version_number`
 * Major.Minor.Patch, `website_url` an empty string or an address, `description` at most 250 characters,
 * `dependencies`), `README.md` and `icon.png` (a PNG of exactly 256x256), with any further files -- here the served HD
 * layout under `experimental-packs/hd/` (`current.json`, `<id>/manifest.json`, its payloads), which `importHdZip`
 * finds under any folder. The rules are the repository's own data (`THUNDERSTORE_PACKAGE_RULES`, creator-contracts),
 * checked by its own `checkThunderstorePackage`; the wiki's package size limit (10 GB, "a soft-limit") is
 * `THUNDERSTORE_PACKAGE_BYTES`, and the binding bound is MODS's own import (`ZIP_LIMITS.archiveBytes`, 2 GiB).
 */
export const HD_THUNDERSTORE_ADAPTATION='The owner\'s Thunderstore upload of the HD pack (B206 ML-5): a tool\'s packaging, no game value' as const;
/** The wiki's stated package size limit (read 2026-11-07: "a maximum package size limit of 10 GB, but this is a soft-limit"). */
export const THUNDERSTORE_PACKAGE_BYTES=10_000_000_000;
/** The plan's defaults (ML-5's row): the store name and the first version. */
export const HD_TS_NAME_DEFAULT='SOCOM_II_HD_Textures';
export const HD_TS_VERSION_DEFAULT='1.0.0';
const HD_ROOT='experimental-packs/hd/';

export interface HdThunderstoreOptions {
  /** The store's `name` (default `HD_TS_NAME_DEFAULT`). */
  readonly name?:string;
  /** The store's `version_number` (default `HD_TS_VERSION_DEFAULT`). */
  readonly version?:string;
  /** The store's `description`, at most 250 characters (default: one written from the pack's counts). */
  readonly description?:string;
  /** The store's `website_url`, empty by default. */
  readonly websiteUrl?:string;
  /** `icon.png`'s bytes, a 256x256 PNG (default: `generatedIcon()`). */
  readonly icon?:Uint8Array;
  /** The community pack's credit as the owner gives it, written into the README; absent, `HD_PACK_CREDIT` (GoE SouL). */
  readonly credit?:string;
}

/** The `--ts-name`, `--ts-version`, `--ts-description`, `--website`, `--icon <png>` and `--credit` flags, taken out of `args`. */
export function hdThunderstoreFlags(args:string[]):HdThunderstoreOptions{
  const flag=(n:string)=>{const i=args.indexOf(n);if(i<0)return undefined;const v=args[i+1];if(v===undefined)throw new Error(`${n} needs a value`);args.splice(i,2);return v;};
  const name=flag('--ts-name'),version=flag('--ts-version'),description=flag('--ts-description'),websiteUrl=flag('--website'),icon=flag('--icon'),credit=flag('--credit');
  return {...(name!==undefined&&{name}),...(version!==undefined&&{version}),...(description!==undefined&&{description}),
    ...(websiteUrl!==undefined&&{websiteUrl}),...(icon!==undefined&&{icon:new Uint8Array(readFileSync(icon))}),...(credit!==undefined&&{credit})};
}

/** A plain 256x256 icon, one flat colour: no third-party art is ours to pick (ML-5's row); the owner gives his with `--icon`. */
export function generatedIcon():Uint8Array{
  const {width,height}=THUNDERSTORE_PACKAGE_RULES.icon,px=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<px.length;i+=4)px.set([0x1f,0x2a,0x33,0xff],i);
  return encodePng(width,height,px);
}

/** The built pack `current.json` names in `layoutDir` (an `--out` of the builder): its manifest, id and payload files. */
function readLayout(layoutDir:string):{manifest:HdManifest;manifestBytes:Uint8Array;id:string;payloads:string[]}{
  const pointer=join(layoutDir,'current.json');
  if(!existsSync(pointer))throw new Error(`${layoutDir} has no current.json: build the pack first (hd-pack-from-pcsx2.ts --out)`);
  const p=JSON.parse(readFileSync(pointer,'utf8')) as {version?:unknown;packId?:unknown};
  if(p.version!==1||typeof p.packId!=='string'||!/^[0-9a-f]{64}$/.test(p.packId))throw new Error(`${pointer} does not name a pack`);
  const manifestBytes=new Uint8Array(readFileSync(join(layoutDir,p.packId,'manifest.json')));
  if(createHash('sha256').update(manifestBytes).digest('hex')!==p.packId)throw new Error(`${p.packId}/manifest.json does not match its id`);
  const manifest=validateHdManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
  return {manifest,manifestBytes,id:p.packId,payloads:[...new Set(manifest.entries.map(e=>e.file))]};
}

function tierCounts(m:HdManifest):[string,number][]{
  const n=new Map<string,number>();for(const e of m.entries)n.set(e.tier,(n.get(e.tier)??0)+1);
  return [...n].sort(([a],[b])=>a<b?-1:a>b?1:0);
}

/** The store's description written from the pack, when none is given. */
function defaultDescription(m:HdManifest):string{
  return `${HD_PACK_CREDIT}, for the SOCOM II browser port: ${m.entries.length} textures from ${HD_PACK_AUTHOR}'s PCSX2 replacement pack. Drop the zip into Home > Experiments > Mods.`;
}

/** README.md: what it is, what it is made from and its credit, the counts by tier, how to drop it into MODS. */
export function hdReadme(m:HdManifest,store:ThunderstoreManifest,credit:string|undefined):string{
  const rows=tierCounts(m).map(([t,c])=>`| ${t} | ${c} |`).join('\n');
  return [`# ${store.name.replace(/_/g,' ')}`,'',
    `${store.description}`,'',
    '## Install','',
    'Download the zip. In the game, open Home > Experiments > Mods and drop the zip in (or choose it), then choose the pack as',
    'the texture pack. It is kept in this browser only and changes what this player sees; nothing is sent to other players.','',
    '## What it is','',
    `The pack "${m.name}" (${m.entries.length} textures for ${m.game}, ${m.totalBytes} bytes decoded), built from a community`,
    'PCSX2 replacement texture pack by the project\'s tool: each replacement bound to the disc\'s own texture by hash (tiers A to',
    'C) or by an accepted image match (tiers D to F).','',
    `Method: ${m.method}`,'',
    '| tier | textures |','|---|---|',rows,'',
    '## Credit','',
    credit??`${HD_PACK_CREDIT}.`,''].join('\n');   // the owner, 2026-11-09: always credit GoE SouL (`--credit` replaces the line)
}

/** Thrown before anything is written: each finding of the store's rules, one a line. */
export class ThunderstoreRefusal extends Error {constructor(readonly problems:readonly string[]){super(problems.join('\n'));this.name='ThunderstoreRefusal';}}
const findings=(r:CheckReport)=>r.diagnostics.filter(d=>d.severity==='error').map(d=>`${d.code} ${d.file??''}${d.field?` ${d.field}`:''}: ${d.text}`);

/**
 * Writes the upload zip at `outZip` from the built pack in `layoutDir` -- the store's root files, then the HD layout
 * under `experimental-packs/hd/` (`current.json`, the manifest, every payload it names; `below-bar.json` left out) --
 * and checks it (`checkThunderstoreZip`). A store rule broken by an option is refused before anything is written; a
 * zip that fails its check is removed. Payloads are streamed from their files (`zipStream.ts`), never held whole.
 */
export async function writeHdThunderstoreZip(outZip:string,layoutDir:string,opts:HdThunderstoreOptions={}):Promise<{bytes:number;entries:number;manifest:ThunderstoreManifest;textures:number}>{
  const pack=readLayout(layoutDir);
  const store:ThunderstoreManifest={name:opts.name??HD_TS_NAME_DEFAULT,version_number:opts.version??HD_TS_VERSION_DEFAULT,
    website_url:opts.websiteUrl??'',description:opts.description??defaultDescription(pack.manifest),dependencies:[]};
  const icon=opts.icon??generatedIcon(),enc=new TextEncoder();
  const rootFiles=[{path:'manifest.json',bytes:enc.encode(JSON.stringify(store,null,2))},{path:'icon.png',bytes:icon},
    {path:'README.md',bytes:enc.encode(hdReadme(pack.manifest,store,opts.credit))}];
  const problems=findings(checkThunderstorePackage(rootFiles));
  try{decodePng(icon);}catch(e){problems.push(`icon.png does not decode as a PNG: ${(e as Error).message}`);}
  if(problems.length)throw new ThunderstoreRefusal(problems);
  const staged=mkdtempSync(join(tmpdir(),'s2u-ts-wrap-')),partial=`${outZip}.partial`;
  try{
    const entries:ZipFileEntry[]=rootFiles.map(f=>{const p=join(staged,f.path);writeFileSync(p,f.bytes);return {name:f.path,path:p};});
    const pointer=join(staged,'current.json');writeFileSync(pointer,JSON.stringify({version:1,packId:pack.id}));
    entries.push({name:`${HD_ROOT}current.json`,path:pointer},{name:`${HD_ROOT}${pack.id}/manifest.json`,path:join(layoutDir,pack.id,'manifest.json')},
      ...pack.payloads.map(f=>({name:`${HD_ROOT}${pack.id}/${f}`,path:join(layoutDir,pack.id,f)})));
    const written=await writeZipFile(partial,entries);
    const check=await checkThunderstoreZip(partial);
    if(!check.ok){await unlink(partial).catch(()=>undefined);throw new ThunderstoreRefusal(check.problems);}
    renameSync(partial,outZip);
    return {...written,manifest:store,textures:pack.manifest.entries.length};
  }finally{rmSync(staged,{recursive:true,force:true});}
}

/** A file read by ranges, as the page reads a dropped `File` (`blobSource`). */
function fileSource(path:string):ZipSource{
  const size=statSync(path).size;
  return {size,async read(offset,length){
    const f=await open(path,'r');
    try{const b=Buffer.alloc(length);const {bytesRead}=await f.read(b,0,length,offset);return new Uint8Array(b.buffer,b.byteOffset,bytesRead);}finally{await f.close();}
  }};
}

export interface ThunderstoreZipCheck {ok:boolean;problems:string[];warnings:string[];bytes:number;name?:string;version?:string;textures?:number}
/**
 * `--check`: the zip as MODS will read it. Its size within the wiki's limit and MODS's import bound; the zip read by
 * the page's own reader (`openZip`, `ZIP_LIMITS`); recognised as a store package and its root files kept to the store's
 * rules (`unwrapThunderstore`, `checkThunderstorePackage`); the HD pack under it imported by the page's own importer
 * (`importHdZip`) into a store that only counts -- every payload read through, so each member's CRC is checked.
 */
export async function checkThunderstoreZip(zipPath:string):Promise<ThunderstoreZipCheck>{
  const problems:string[]=[],warnings:string[]=[],bytes=statSync(zipPath).size;
  const out=(more:Partial<ThunderstoreZipCheck>={}):ThunderstoreZipCheck=>({ok:problems.length===0,problems,warnings,bytes,...more});
  if(bytes>THUNDERSTORE_PACKAGE_BYTES)problems.push(`the zip is ${bytes} bytes: over Thunderstore's ${THUNDERSTORE_PACKAGE_BYTES}`);
  if(bytes>ZIP_LIMITS.archiveBytes)problems.push(`the zip is ${bytes} bytes: over MODS's import bound of ${ZIP_LIMITS.archiveBytes}`);
  let zip;
  try{zip=await openZip(fileSource(zipPath));}catch(e){problems.push(`the zip does not read: ${(e as Error).message}`);return out();}
  const small=new Set(['manifest.json','icon.png','README.md','CHANGELOG.md']),top=zip.members[0]?.name.split('/')[0]??'';
  const entries=await Promise.all(zip.members.map(async m=>{
    const leaf=m.name.startsWith(`${top}/`)?m.name.slice(top.length+1):m.name;
    return small.has(m.name)||small.has(leaf)?{path:m.name,bytes:await zip.read(m)}:{path:m.name};
  }));
  const u=unwrapThunderstore(entries);
  if(!u.wrapped){problems.push('not a Thunderstore package: no manifest.json with the store\'s keys at its root');return out();}
  problems.push(...findings(u.report));
  const name=String(u.manifest.name),version=String(u.manifest.version_number);
  const readme=u.store.find(e=>e.path==='README.md');
  if(readme?.bytes&&new TextDecoder().decode(readme.bytes).includes('(--credit)'))warnings.push('README.md carries no credit for the community pack (--credit)');
  let meta:HdStoredMeta|null=null;
  const counting:HdStore={current:async()=>meta,file:async()=>null,async replace(m,names,read){for(const n of names)await read(n);meta=m;}};
  try{
    const got=await importHdZip(await openAsBlob(zipPath),counting);
    if(got===null)problems.push(`no HD pack under the package (no ${HD_ROOT}current.json)`);
    else return out({name,version,textures:got.textures});
  }catch(e){problems.push(`the HD pack: ${(e as Error).message}`);}
  return out({name,version});
}
