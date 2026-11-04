import {mkdir,readFile,readdir,writeFile,rename,lstat,stat} from 'node:fs/promises';
import {resolve,dirname,join,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseZdb} from '@s2u/archive';
import {FsAssetSource} from '@s2u/archive/node';
import type {Rgba} from '@s2u/gs';
import {readSelectedMapTextures,textureLibrary} from '../packages/viewer/src/mapTextures';
import {hashString,packMethod,packScale,PACK_LIMITS,requirePack,sha256,validateManifest,validateSource,type PackProvenance,type PackRoles,packRoles,type PackScale,type PackMap,packMap,mapArchiveOf,type PackSource,
  PACK_INDEX_LIMITS,packName,packNotes,validatePackIndex,refusePack,indexMatches,type PackManifest} from '../packages/viewer/src/texturePack';
import {buildTexturePack,fromFourMethod,importExport,padForExport,parseEnhance,withEnhance,wrapsOf,EXPORT_FORMAT,EXPORT_INDEX_FORMAT,type EnhanceOp,type ExportSidecar,type LeftOut} from './localTexturePack';
import {decodePng,encodePng} from './png';

/** Reject any existing junction/symlink in the output chain before creating or writing a directory. */
async function plainPath(path:string):Promise<void>{
  for(let p=resolve(path);;p=dirname(p)){
    const info=await lstat(p).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return null;throw e;});
    requirePack(!info||(!info.isSymbolicLink()&&info.isDirectory()));if(dirname(p)===p)break;
  }
}
/** GX-21: how a publication enters the map's library (`packs.json`). `setDefault` false is `--no-default`. */
export interface PublishOptions {name?:string;notes?:string;setDefault?:boolean;now?:Date}
/** The name a pack is listed under without `--name`: the method's first word and the scale, as `lanczos3-2x`. */
export const defaultPackName=(method:string,scale:number):string=>`${method.split(' ')[0]!.slice(0,44)}-${scale}x`;
/**
 * GX-21 review: the first `packs.json` of a map that already has a `current.json` pack lists that pack first, so the
 * default stays listed (the index is the library). Only a pack whose manifest is whole and matches its id is listed.
 */
async function currentPackEntry(directory:string):Promise<Record<string,unknown>|null>{
  try{
    const pointer=JSON.parse(await readFile(join(directory,'current.json'),'utf8')) as {version?:unknown;packId?:unknown};
    if(pointer.version!==1||!hashString(pointer.packId))return null;
    const path=join(directory,pointer.packId,'manifest.json'),info=await stat(path);if(!info.isFile()||info.size>PACK_LIMITS.manifestBytes)return null;
    const bytes=new Uint8Array(await readFile(path));if(await sha256(bytes)!==pointer.packId)return null;
    const m=validateManifest(JSON.parse(new TextDecoder().decode(bytes)));
    return {id:pointer.packId,name:defaultPackName(m.method,m.scale),kind:'textures',method:m.method,scale:m.scale,roles:m.roles??'world',
      generatedAt:info.mtime.toISOString(),textures:m.entries.length,bytes:m.totalBytes,notes:'listed from current.json when the index was created'};
  }catch{return null;}
}
/** Writes `text` to `path` through a staging file and a rename in the same directory, as `current.json` always was. */
async function replaceAtomically(directory:string,path:string,text:string,stem:string):Promise<void>{
  const staging=join(directory,`.${stem}-${randomUUID()}.json`);
  await writeFile(staging,text,{flag:'wx'});await rename(staging,path);
}
export async function publishTexturePack(root:string,pack:Awaited<ReturnType<typeof buildTexturePack>>,options:PublishOptions={}):Promise<void>{
  const directory=resolve(root);await plainPath(directory);requirePack(hashString(pack.id));
  requirePack(await sha256(pack.manifestBytes)===pack.id);const manifest=validateManifest(JSON.parse(new TextDecoder().decode(pack.manifestBytes)));
  requirePack(JSON.stringify(manifest)===JSON.stringify(pack.manifest));
  for(const e of manifest.entries){const data=pack.payloads.get(e.file);requirePack(data&&data.length===e.bytes&&await sha256(data)===e.sha256);}
  // GX-21: the library entry, and the whole next index, are settled before anything is written.
  const name=options.name??defaultPackName(manifest.method,manifest.scale),notes=options.notes??'';
  requirePack(packName(name)&&packNotes(notes));
  const indexPath=join(directory,'packs.json'),existing=await stat(indexPath).catch(missing);
  let packs:Record<string,unknown>[]=[];
  if(existing){
    requirePack(existing.isFile()&&existing.size<=PACK_INDEX_LIMITS.indexBytes);
    const raw=JSON.parse(await readFile(indexPath,'utf8')) as {packs:Record<string,unknown>[]};validatePackIndex(raw);packs=[...raw.packs];
  }else{const seed=await currentPackEntry(directory);if(seed)packs.push(seed);}
  const entry={id:pack.id,name,kind:'textures',method:manifest.method,scale:manifest.scale,roles:manifest.roles??'world',
    generatedAt:(options.now??new Date()).toISOString(),textures:manifest.entries.length,bytes:manifest.totalBytes,notes};
  const at=packs.findIndex(p=>p['id']===pack.id);if(at<0)packs.push(entry);else packs[at]=entry;
  const index={version:1,packs};validatePackIndex(index);
  const indexText=JSON.stringify(index,null,1)+'\n';requirePack(new TextEncoder().encode(indexText).length<=PACK_INDEX_LIMITS.indexBytes);
  const destination=join(directory,pack.id);requirePack(!(await lstat(destination).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return null;throw e;})));
  await mkdir(directory,{recursive:true});await plainPath(directory);
  const staging=join(directory,'.staging-'+randomUUID());requirePack(resolve(staging).startsWith(directory+sep));await mkdir(staging);
  // A failure leaves an ignored unselected staging directory; never remove an unrelated path or publish half a pack.
  for(const e of manifest.entries)await writeFile(join(staging,e.file),pack.payloads.get(e.file)!,{flag:'wx'});
  await writeFile(join(staging,'manifest.json'),pack.manifestBytes,{flag:'wx'});await rename(staging,destination);
  // The complete pack, then the library that lists it, then (unless --no-default) the pointer that makes it the default.
  await replaceAtomically(directory,indexPath,indexText,'packs');
  if(options.setDefault!==false)await replaceAtomically(directory,join(directory,'current.json'),JSON.stringify({version:1,packId:pack.id})+'\n','current');
}
/**
 * GX-21: takes `--name <label>`, `--notes <text>` and `--no-default` out of the CLI's arguments, each at most once and
 * checked (a name of 1-48 printable characters, notes of 0-240), and returns the rest for the modes as before.
 */
export function takePublishOptions(argv:string[]):{args:string[];options:PublishOptions}{
  const args=[...argv],options:PublishOptions={};
  const take=(flag:string):string|undefined=>{
    const i=args.indexOf(flag);if(i<0)return undefined;
    const v=args[i+1];refusePack(v!==undefined&&!v.startsWith('--'),`${flag} needs a value`);args.splice(i,2);refusePack(!args.includes(flag),`${flag} is given twice`);return v;
  };
  const name=take('--name'),notes=take('--notes');
  if(name!==undefined){refusePack(packName(name),`--name is not 1-${PACK_INDEX_LIMITS.nameLength} printable characters`);options.name=name;}
  if(notes!==undefined){refusePack(packNotes(notes),`--notes are not 0-${PACK_INDEX_LIMITS.notesLength} printable characters`);options.notes=notes;}
  const i=args.indexOf('--no-default');if(i>=0){args.splice(i,1);refusePack(!args.includes('--no-default'),'--no-default is given twice');options.setDefault=false;}
  return {args,options};
}
/** The options the modes read with `option()`: each may be given once, refused by name before anything is read (review 2). */
const SINGLE_OPTIONS=['--export','--import','--method','--scale','--sidecars','--roles','--dry-run','--set-default'] as const;
export function refuseRepeatedOptions(args:readonly string[]):void{
  for(const flag of SINGLE_OPTIONS)refusePack(args.filter(a=>a===flag).length<=1,`${flag} is given twice`);
}
/**
 * The import's method as it will be recorded -- `--from 4x`'s word rewrite (`fromFourMethod`), then `--enhance`'s
 * suffix (`withEnhance`: no suffix already, at most 512 characters) -- checked on the `--method` text before the
 * archive or any PNG is read (review 2; `buildImportedPack` checks it again).
 */
export function plannedMethod(method:string,enhance:readonly EnhanceOp[],from?:4):string{
  refusePack(packMethod(method),`--method is not 1-${PACK_LIMITS.methodLength} printable characters`);
  // Review 3: the bound holds on the string recorded, so --from 4x's longer word is bounded without --enhance too.
  const final=withEnhance(from?fromFourMethod(method):method,enhance);
  refusePack(packMethod(final),`the recorded method is longer than ${PACK_LIMITS.methodLength} characters (or not printable)`);
  return final;
}
/**
 * `--set-default <packId | name>` (review 2): points `current.json` at a pack `packs.json` lists -- by its id or its
 * exact name -- whose manifest is whole and matches its id; written by a staging file and a rename. No archive is read.
 * Re-importing a known id is refused by the immutable-pack rule, so this is how a default is moved back.
 */
export async function setDefaultPack(root:string,ref:string,map:PackMap):Promise<{id:string;name:string}>{
  const directory=resolve(root);await plainPath(directory);
  const indexPath=join(directory,'packs.json'),info=await stat(indexPath).catch(missing);
  refusePack(info&&info.isFile()&&info.size<=PACK_INDEX_LIMITS.indexBytes,`no packs.json in ${directory} (or over ${PACK_INDEX_LIMITS.indexBytes/1024} KiB)`);
  const {packs}=validatePackIndex(JSON.parse(await readFile(indexPath,'utf8')));
  const byId=packs.filter(p=>p.id===ref),byName=packs.filter(p=>p.name===ref),hits=byId.length?byId:byName;
  refusePack(hits.length>0,`no pack with the id or name "${ref}" in packs.json`);
  refusePack(hits.length===1,`"${ref}" names ${hits.length} packs; give the id`);
  const pack=hits[0]!;refusePack(!('refused' in pack),`${pack.name}: ${'refused' in pack?pack.refused:''}`);
  let manifest:PackManifest|null=null;
  try{const path=join(directory,pack.id,'manifest.json'),m=await stat(path);
    if(m.isFile()&&m.size<=PACK_LIMITS.manifestBytes){const bytes=new Uint8Array(await readFile(path));if(await sha256(bytes)===pack.id)manifest=validateManifest(JSON.parse(new TextDecoder().decode(bytes)));}
  }catch{manifest=null;}
  refusePack(manifest,`${pack.name}: its manifest is missing or does not match its id`);
  // Review 3: the runtime's two checks (texturePackRuntime.ts, `checkedManifest` and `indexMatches`), so a default it would refuse is refused here.
  refusePack(manifest.mapArchive===mapArchiveOf(map),`${pack.name}: made for ${manifest.mapArchive}, not ${mapArchiveOf(map)}`);
  refusePack(indexMatches(pack,manifest),`${pack.name}: the index entry does not match its manifest`);
  await replaceAtomically(directory,join(directory,'current.json'),JSON.stringify({version:1,packId:pack.id})+'\n','current');
  return {id:pack.id,name:pack.name};
}
/**
 * GX-22: takes `--enhance <ops>` (parsed and range-checked by `parseEnhance`) and `--from 4x` out of the CLI's arguments,
 * each at most once, before anything is read or written; the rest goes to the modes as before.
 */
export function takeGeneratorOptions(argv:string[]):{args:string[];enhance:EnhanceOp[];from?:4}{
  const args=[...argv];
  const take=(flag:string):string|undefined=>{
    const i=args.indexOf(flag);if(i<0)return undefined;
    const v=args[i+1];refusePack(v!==undefined&&!v.startsWith('--'),`${flag} needs a value`);args.splice(i,2);refusePack(!args.includes(flag),`${flag} is given twice`);return v;
  };
  const text=take('--enhance'),from=take('--from');refusePack(from===undefined||from==='4x',`--from takes only 4x, not "${from}"`);
  return {args,enhance:text===undefined?[]:parseEnhance(text),...(from===undefined?{}:{from:4 as const})};
}

const missing=(e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return null;throw e;};
const levelHash=(l:Rgba)=>sha256(new Uint8Array(l.data.buffer,l.data.byteOffset,l.data.byteLength));
/** A file stem an image tool keeps: the index, then the key with anything but [a-z0-9_-] as "_" (no second dot). */
const stemFor=(i:number,key:string)=>`${String(i).padStart(3,'0')}_${key.replace(/[^a-z0-9_-]/g,'_')}`;
const INDEX_FORMAT=EXPORT_INDEX_FORMAT;
export interface ExportInfo {archiveSha256:string;archiveBytes:number;toolCommit:string;roles?:PackRoles;map?:PackMap}
type Sidecar=ExportSidecar;

/**
 * GX-1 `--export`: each source's base level as a PNG padded by GX.R3 (`padForExport`), a sidecar JSON beside it (key,
 * library, size, wrap, the source level's sha256, the padding), and `export.json` (the archive hash, the tool commit,
 * the entries' stems). Into an empty or new directory only; nothing is overwritten.
 */
export async function exportTextures(sources:PackSource[],directory:string,info:ExportInfo):Promise<{count:number}>{
  requirePack(sources.length>0&&sources.length<=PACK_LIMITS.entries&&new Set(sources.map(s=>s.key)).size===sources.length);
  sources.forEach(validateSource);const roles=info.roles??'world';requirePack(packRoles(roles)&&hashString(info.archiveSha256)&&/^[a-f0-9]{40}$/.test(info.toolCommit));
  const dir=resolve(directory);await plainPath(dir);
  const existing=await readdir(dir).catch(missing);requirePack(!existing||existing.length===0);
  await mkdir(dir,{recursive:true});await plainPath(dir);
  const entries:{key:string;stem:string}[]=[];
  for(const [i,s] of sources.entries()){
    const stem=stemFor(i,s.key),base=s.levels[0]!,[wrapS,wrapT]=wrapsOf(s),padded=padForExport(base,wrapS,wrapT);
    const sidecar:Sidecar={format:EXPORT_FORMAT,version:1,key:s.key,library:s.library??'',record:s.record??s.key,png:`${stem}.png`,
      width:base.width,height:base.height,wrapS,wrapT,mipmaps:s.flags.gs?.mipmaps===true,levels:s.levels.length,sourceSha256:await levelHash(base),
      paddedWidth:padded.width,paddedHeight:padded.height,
      padding:{left:base.width,right:base.width,top:base.height,bottom:base.height,s:wrapS==='repeat'?'tile':'edge',t:wrapT==='repeat'?'tile':'edge'}};
    await writeFile(join(dir,`${stem}.png`),encodePng(padded.width,padded.height,padded.data),{flag:'wx'});
    await writeFile(join(dir,`${stem}.json`),JSON.stringify(sidecar,null,2)+'\n',{flag:'wx'});entries.push({key:s.key,stem});
  }
  const index={format:INDEX_FORMAT,version:1,mapArchive:mapArchiveOf(info.map??'MP51'),archiveSha256:info.archiveSha256,archiveBytes:info.archiveBytes,toolCommit:info.toolCommit,roles,count:entries.length,entries};
  await writeFile(join(dir,'export.json'),JSON.stringify(index,null,2)+'\n',{flag:'wx'});
  return {count:entries.length};
}

async function boundedJson(path:string,limit:number):Promise<unknown>{
  const info=await stat(path).catch(missing);if(!info)return null;requirePack(info.isFile()&&info.size<=limit);
  return JSON.parse(await readFile(path,'utf8'));
}
/**
 * GX-1 `--import`: the PNGs an image tool wrote over the export (same stems; the sidecars and `export.json` in `dir`, or
 * in `options.sidecars`), each required to be exactly `scale` x its padded size, cropped to the centre tile and handed to
 * `buildImportedPack`. A missing, changed, unreadable, mis-sized or non-opaque result leaves that texture original,
 * counted in `leftOut` (GX.R5); an export from another archive, or nothing left, refuses. GX-22: `from: 4` (`--scale 2
 * --from 4x`) takes PNGs 4x the padded size, reduces each crop by `lanczosHalf` and builds the pack at scale 2, the
 * method's first word made `...-2x-from-4x`; `enhance` is `buildImportedPack`'s.
 */
export async function readExportRoles(sidecars:string):Promise<PackRoles>{
  const index=await boundedJson(join(resolve(sidecars),'export.json'),1024*1024) as {format?:unknown;roles?:unknown}|null;
  requirePack(index&&index.format===INDEX_FORMAT&&(index.roles===undefined||packRoles(index.roles)));return index.roles??'world';
}
export async function importTextures(sources:PackSource[],directory:string,options:{method:string;scale:PackScale;sidecars?:string;roles?:PackRoles;map?:PackMap;enhance?:readonly EnhanceOp[];from?:4},provenance:PackProvenance){
  // GX-27: the loop is the viewer's `importExport`, shared with the test room's upload; here the files come from disk.
  const dir=resolve(directory),sidecars=resolve(options.sidecars??directory);
  return importExport(sources,{
    index:()=>boundedJson(join(sidecars,'export.json'),1024*1024),
    sidecar:stem=>boundedJson(join(sidecars,`${stem}.json`),64*1024),
    image:async stem=>{
      const png=join(dir,`${stem}.png`),info=await stat(png).catch(missing);if(!info)return null;
      return async()=>{requirePack(info.isFile()&&info.size<=256*1024*1024);return decodePng(new Uint8Array(await readFile(png)),3*PACK_LIMITS.sourceEdge*4);};
    },
  },options,provenance);
}

/** Every eligible world texture of a map: the runtime's own role filter (`packSourcesFor`, map-generic) over the map as `loadMap` reads it. */
async function eligibleSources(sourcePath:string,bytes:Uint8Array,roles:PackRoles,stem:PackMap):Promise<PackSource[]>{
  const run=dirname(sourcePath);requirePack(basename(run).toUpperCase()==='RUN');
  // Lazy: only these two modes load the whole map; the named-key mode and the tests never pull its module graph.
  const [{loadMap},{packSourcesFor}]=await Promise.all([import('../packages/viewer/src/loadMap'),import('../packages/viewer/src/texturePackSources')]);
  const map=await loadMap(new FsAssetSource(dirname(run)),`${basename(run)}/${basename(sourcePath)}`);
  requirePack(map.archive===stem);const lib=textureLibrary(bytes,parseZdb(bytes),stem,{add(){}});requirePack(lib);
  return [...packSourcesFor(map,roles).values()].map(s=>{const hit=lib.keys.get(s.key);return {...s,library:hit?.library??'',record:hit?.key.name??s.key};});
}
/**
 * GX-1e (GX.R9): an archive path's map id -- any `MP<n>.ZDB`, and since GX-27 any campaign `M<n>.ZDB`, in either case --
 * or null for anything else.
 */
export function mapIdOf(archivePath:string):PackMap|null{
  const match=/^(MP?\d+)\.ZDB$/.exec(basename(archivePath).toUpperCase());
  return match&&packMap(match[1])?match[1]:null;
}
/**
 * GX-1c: the map id is the archive's own -- its table of contents must hold that map's world root, `<stem>.ZED`. The
 * member names carry their path with backslashes (RUN\MP\MP51\MP51.ZED), so the basename is compared, in either case.
 */
export function holdsMapRoot(toc:readonly {name:string}[],stem:PackMap):boolean{
  return toc.some(e=>e.name.toUpperCase().replace(/\\/g,'/').split('/').pop()===`${stem}.ZED`);
}
function option(args:string[],name:string):string|undefined{
  const i=args.indexOf(name);if(i<0)return undefined;const v=args[i+1];refusePack(v!==undefined&&!v.startsWith('--'),`${name} needs a value`);return v;
}

/**
 * Explicit local CLI. Every mode, --dry-run included, decodes disc assets and requires the controller's resource window
 * -- except `--set-default`, which reads only the map's pack directory.
 */
export async function generateLocalTexturePack(argv:string[]):Promise<void>{
  refuseRepeatedOptions(argv);
  if(argv.includes('--set-default')){
    refusePack(argv.length===3&&argv[1]==='--set-default'&&!argv[2]!.startsWith('--'),'--set-default takes only <MPn> and the pack: <MPn | MPn.ZDB> --set-default <packId | name>');
    const map=/^MP?\d+$/i.test(argv[0]!)?argv[0]!.toUpperCase():mapIdOf(argv[0]!);refusePack(map&&packMap(map),`"${argv[0]}" is not a map id (MP<n> or M<n>) or an MP<n>.ZDB / M<n>.ZDB path`);
    const result=await setDefaultPack(resolve(dirname(fileURLToPath(import.meta.url)),'../public/experimental-packs',map.toLowerCase()),argv[2]!,map);
    console.log(JSON.stringify({map,default:result.id,name:result.name}));return;
  }
  // GX-21: --name, --notes and --no-default belong to a publication (the Lanczos and import modes), never to an export or a dry run.
  const {args:rest,options:publish}=takePublishOptions(argv),publishing=Object.keys(publish).length>0;
  // GX-22: --enhance (both publishing modes) and --from 4x (the import, with --scale 2), refused here before any read.
  const {args,enhance,from}=takeGeneratorOptions(rest);
  refusePack(from===undefined||args.includes('--import'),"--from 4x is an import's option (PNGs a 4x tool returned)");
  refusePack(from===undefined||option(args,'--scale')==='2','--from 4x needs --scale 2 (a 2x pack reduced from 4x PNGs)');
  refusePack(enhance.length===0||!args.includes('--export'),'--enhance belongs to a publication, not an export');
  // Review 2: the recorded method (--from 4x's word, --enhance's suffix, the 512 bound) is settled before anything heavy.
  const methodArg=option(args,'--method');if(methodArg!==undefined)plannedMethod(methodArg,enhance,from);
  const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
  const exportDir=option(args,'--export'),importDir=option(args,'--import');requirePack(!(exportDir&&importDir));
  const sourcePath=resolve(args[0]??''),stem=mapIdOf(sourcePath);requirePack(stem);
  const out=resolve(here,'../public/experimental-packs',stem.toLowerCase());
  requirePack(!sourcePath.startsWith(resolve(here,'../public/experimental-packs')+sep));await plainPath(out);
  const size=(await stat(sourcePath)).size;requirePack(size>0&&size<=128*1024*1024);
  const started=performance.now(),bytes=new Uint8Array(await readFile(sourcePath));const fetched=performance.now();
  requirePack(holdsMapRoot(parseZdb(bytes),stem));
  const git=(...argv:string[])=>execFileSync('git',argv,{cwd:root,encoding:'utf8'}).trim();
  // Exported and imported images are decoded disc data: never inside the repository tree.
  const outside=(p:string)=>!(resolve(p)+sep).toLowerCase().startsWith((root+sep).toLowerCase());
  // GX-1b: --roles world (the default) or wide, the source set `packSourcesFor` gives the runtime too.
  const rolesArg=option(args,'--roles'),extra=rolesArg===undefined?0:2;requirePack(rolesArg===undefined||packRoles(rolesArg));
  if(exportDir){
    const roles=rolesArg??'world';requirePack(args.length===3+extra&&outside(exportDir)&&!publishing);
    const sources=await eligibleSources(sourcePath,bytes,roles,stem),decoded=performance.now();
    const {count}=await exportTextures(sources,exportDir,{archiveSha256:await sha256(bytes),archiveBytes:bytes.length,toolCommit:git('rev-parse','HEAD'),roles,map:stem});
    console.log(JSON.stringify({exported:count,map:stem,roles,directory:resolve(exportDir),readMs:fetched-started,decodeMs:decoded-fetched,writeMs:performance.now()-decoded,rssBytes:process.memoryUsage().rss}));return;
  }
  let sources:PackSource[],options:{method:string;scale:PackScale;sidecars?:string;roles:PackRoles;map:PackMap;enhance:EnhanceOp[];from?:4}|null=null;
  if(importDir){
    const method=option(args,'--method'),scale=Number(option(args,'--scale')),sidecars=option(args,'--sidecars');
    requirePack(packMethod(method)&&packScale(scale)&&outside(importDir)&&(!sidecars||outside(sidecars))&&args.length===(sidecars?9:7)+extra);
    // The export's roles decide the set; a --roles given here must agree with them (importTextures refuses otherwise).
    const roles=await readExportRoles(sidecars??importDir);requirePack(rolesArg===undefined||rolesArg===roles);
    options={method,scale,roles,map:stem,enhance,...(from?{from}:{}),...(sidecars?{sidecars}:{})};sources=await eligibleSources(sourcePath,bytes,roles,stem);
  }else{
    const dry=args.includes('--dry-run'),pos=args.filter(a=>a!=='--dry-run');requirePack(pos.length===2&&rolesArg===undefined);
    sources=readSelectedMapTextures(bytes,pos[1]!.split(','),stem);
    if(dry){requirePack(!publishing);console.log(JSON.stringify({dryRun:true,selected:sources.map(s=>({key:s.key,library:s.library,levels:s.levels.map(l=>[l.width,l.height])})),decodeMs:performance.now()-fetched}));return;}
  }
  const decoded=performance.now();
  const ignored=execFileSync('git',['check-ignore','--no-index',out],{cwd:root,encoding:'utf8'}).trim();requirePack(ignored.length>0);
  const generatorFiles=['writeLocalTexturePack.ts','localTexturePack.ts','png.ts','../packages/viewer/src/texturePackBuild.ts','../packages/viewer/src/png.ts','../packages/viewer/src/texturePack.ts','../packages/viewer/src/texturePackSources.ts','../packages/viewer/src/mapTextures.ts','../packages/viewer/src/materialSpec.ts'];
  const codeHash=createHash('sha256');for(const f of generatorFiles){codeHash.update(f+'\0');codeHash.update(await readFile(resolve(here,f)));}
  const provenance={archiveSha256:await sha256(bytes),archiveBytes:bytes.length,toolCommit:git('rev-parse','HEAD'),toolSha256:codeHash.digest('hex')};
  const pack=options?await importTextures(sources,importDir!,options,provenance):{...await buildTexturePack(sources,provenance,stem,enhance),leftOut:[] as LeftOut[]};
  const generated=performance.now();await publishTexturePack(out,pack,publish);
  const keptOriginal:Record<string,number>={};for(const l of pack.leftOut)keptOriginal[l.reason]=(keptOriginal[l.reason]??0)+1;
  console.log(JSON.stringify({packId:pack.id,name:publish.name??defaultPackName(pack.manifest.method,pack.manifest.scale),default:publish.setDefault!==false,method:pack.manifest.method,scale:pack.manifest.scale,textures:pack.manifest.entries.length,keptOriginal,leftOut:pack.leftOut,payloadBytes:pack.manifest.totalBytes,readMs:fetched-started,decodeMs:decoded-fetched,generateMs:generated-decoded,writeMs:performance.now()-generated,rssBytes:process.memoryUsage().rss,gpuMeasured:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  generateLocalTexturePack(process.argv.slice(2)).catch(e=>{console.error(e instanceof Error?e.message:String(e));console.error([
    'Usage (resource window required; the archive is any local RUN/MP<n>.ZDB, the pack goes to public/experimental-packs/<map>/; export and import directories outside the repository):',
    '  tsx tools/writeLocalTexturePack.ts <MPn.ZDB> <texture-key,...> [--dry-run] [--enhance <ops>] [--name <label>] [--notes <text>] [--no-default]     Lanczos 2x of up to four named textures',
    '  tsx tools/writeLocalTexturePack.ts <MPn.ZDB> --export <dir> [--roles world|wide]  every eligible texture as padded PNG + sidecar',
    '  tsx tools/writeLocalTexturePack.ts <MPn.ZDB> --import <dir> --method <text> --scale <2|4> [--from 4x] [--enhance <ops>] [--sidecars <export dir>] [--roles world|wide] [--name <label>] [--notes <text>] [--no-default]',
    '  tsx tools/writeLocalTexturePack.ts <MPn | MPn.ZDB> --set-default <packId | name>   point current.json at a pack packs.json lists (no archive read)',
    '--enhance "unsharp=<radius 0.5-4>,<amount 0.1-2>[,<threshold 0-32>];contrast=<amount 0.1-0.6>[,<radius 8-32>];saturation=<factor 0.5-1.5>" (in order; recorded in the method). --from 4x with --scale 2: 4x PNGs reduced to a 2x pack.',
    'A publication adds the pack to <map>/packs.json (the library; --name 1-48 printable characters, default <method>-<scale>x; --notes up to 240) and makes it the default (current.json) unless --no-default.',
  ].join('\n'));process.exitCode=1;});
}
