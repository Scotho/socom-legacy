import {DataTexture,type Texture} from 'three';
import {hdTextures} from './hdTexturePack';
import {descriptorDigest,boundedBytes,hashString,PACK_LIMITS,requirePack,sha256,sourceDigest,validateManifest,validateSource,type PackEntry,type PackRoles,type PackSource,mapArchiveOf,packMap,packRoot,
  indexMatches,PACK_CHOICE_DEFAULT,PACK_INDEX_LIMITS,PackRefusal,refusePack,validatePackIndex,type PackIndexEntry,type PackLibrary,type PackManifest,type PackMap,type TexturePackIndexEntry} from './texturePack';
import {showPackLibrary} from './experimentalGraphics';
import {UploadedPacks,UploadStoreUnavailable,idbUploadBackend} from './texturePackStore';
import {buildUploadPart,importSummary,plainProvenance,readUpload,skippedLine,stagedFilesWithin,stagedPart} from './texturePackUpload';
import {viewerCommit} from './revision';
import type {BuiltPack} from './texturePackBuild';
import {blobSource} from './zipReader';
import {pageIndexedDb} from './pageStore';

/** Owns replacement images, never source pixels or shader/material graphs. GPU recreation awaits browser validation. */
export class TexturePackTarget {
  alive=true;
  private originals=new Map<string,{texture:DataTexture;image:DataTexture['image'];mips:DataTexture['mipmaps'];generate:boolean;bytes:number}>();
  /** `sources(roles)` is the map's eligible set for a manifest's roles (`packSourcesFor`); world and prop draws share one texture object per name. */
  /** `map` is the loaded archive's id (`LoadedMap.archive`): only a pack made from that map applies (GX-1c). */
  constructor(private sources:(roles:PackRoles)=>Map<string,PackSource>,private textures:ReadonlyMap<string,Texture>,readonly map:string){ }
  get retainedBytes():number{return [...this.originals.values()].reduce((n,v)=>n+v.bytes,0);}
  get applied():number{return this.originals.size;}
  private sourceCache=new Map<PackRoles,Map<string,PackSource>>();
  private set(roles:PackRoles):Map<string,PackSource>{
    let set=this.sourceCache.get(roles);if(!set){set=this.sources(roles);this.sourceCache.set(roles,set);}
    return set;
  }
  source(key:string,roles:PackRoles='world'):PackSource|undefined{
    if(!this.alive)return undefined;
    return this.set(roles).get(key);
  }
  /** GX-27: the whole eligible set for `roles`, as the generator's import reads it (an upload is built against it). */
  sourcesFor(roles:PackRoles):PackSource[]{return this.alive?[...this.set(roles).values()]:[];}
  apply(entry:PackEntry,bytes:Uint8Array):boolean {
    if(!this.alive||this.originals.has(entry.key))return false;
    const texture=this.textures.get(entry.key);
    if(!(texture instanceof DataTexture)||bytes.length!==entry.bytes||this.retainedBytes+bytes.length>PACK_LIMITS.totalBytes)return false;
    const levels=entry.levels.map(l=>{requirePack(l.offset+l.bytes<=bytes.length);return {width:l.width,height:l.height,data:new Uint8Array(bytes.buffer,bytes.byteOffset+l.offset,l.bytes)};});
    this.originals.set(entry.key,{texture,image:texture.image,mips:texture.mipmaps,generate:texture.generateMipmaps,bytes:bytes.length});
    // A larger DataTexture cannot be uploaded into an existing smaller backend allocation. Disposed through the HD
    // registry, which then keeps knowing the texture (OT.R92 review finding 1).
    hdTextures.reallocate(texture);texture.image=levels[0]!;texture.mipmaps=entry.mipmaps?levels:[];texture.generateMipmaps=false;texture.needsUpdate=true;
    return true;
  }
  restore(upload=true):void {
    for(const o of this.originals.values()){
      if(upload)hdTextures.reallocate(o.texture);o.texture.image=o.image;o.texture.mipmaps=o.mips;o.texture.generateMipmaps=o.generate;
      if(upload)o.texture.needsUpdate=true;
    }
    this.originals.clear();
  }
  /** Called before the world's ordinary texture disposal; no replacement upload on a world being destroyed. */
  dispose():void{this.alive=false;this.restore(false);}
}

/**
 * GX-1d: the one rule for which world gets a pack target -- a world built for any map archive (`MP<n>`, GX.R9), whatever
 * it is. The page used to ask `map.archive === 'MP51'` itself, which kept MP2 and MP72 from ever loading their packs.
 */
export function packTargetFor(world:{texturePack?:TexturePackTarget|undefined}):TexturePackTarget|null{
  return world.texturePack&&packMap(world.texturePack.map)?world.texturePack:null;
}

type FetchPack=(url:string,init?:RequestInit)=>Promise<Response>;
/** What the chooser and its status line are told: the library, the chosen entry, how far it has applied, a refusal. */
/** A refused entry of the applied pack: its key and why it kept its original (GX-25 review). */
export interface PackSkip {key:string;reason:string}
export interface PackReport {library:PackLibrary|null;chosen:PackIndexEntry|null;applied:number;done:boolean;refused:string|null;skipped:PackSkip[]}
const OFF_REPORT:PackReport={library:null,chosen:null,applied:0,done:true,refused:null,skipped:[]};
/** The status line (GX-21): the applied pack by name and its count, a refusal with its reason, or the originals. */
export function packStatusText(r:PackReport):string{
  // GX-27: a refused served library still lists the uploaded packs; one of them chosen reports as any pack does.
  if(r.library?.refused&&!r.chosen)return `${r.library.refusedFile??'packs.json'}: refused -- ${r.library.refused}`;
  if(!r.chosen)return r.library?.pointerRefused?`current.json: refused -- ${r.library.pointerRefused}`:'Original textures active.';
  if(r.refused)return `${r.chosen.name}: refused -- ${r.refused}`;
  const total='textures' in r.chosen?r.chosen.textures:0,count=`${r.applied} of ${total} texture${total===1?'':'s'} applied`;
  const kept=r.skipped.length?` Kept original: ${r.skipped.slice(0,2).map(s=>`${s.key} (${s.reason})`).join(', ')}${r.skipped.length>2?` and ${r.skipped.length-2} more`:''}.`:'';
  return r.done?`${r.chosen.name}: ${count}.${kept}`:`${r.chosen.name}: loading, ${count}.${kept}`;
}
interface Listed {library:PackLibrary;manifests:Map<string,Uint8Array>;uploaded?:Set<string>}
/**
 * GX-27: the test room's uploads -- the page's pack store (`texturePackStore.ts`), the panel's import status line
 * (`status`), the chooser's value set by an import or a removal (`selected`), and the import controls' state (`state`).
 */
/** `hd` (OT.R92, HD-6): offered each zip first; it answers the status line of an HD pack zip it imported or refused, or null. */
export interface UploadHooks {store?:UploadedPacks|null;status?:(text:string)=>void;selected?:(value:string)=>void;removed?:(id:string)=>void;state?:()=>void;
  hd?:(file:Blob,name:string)=>Promise<string|null>}
const reasonOf=(e:unknown):string=>e instanceof PackRefusal?e.reason:e instanceof UploadStoreUnavailable?`uploads are unavailable (${e.message})`:e instanceof Error?e.message:String(e);
const packFiles=(pack:BuiltPack):Map<string,Uint8Array>=>new Map([['manifest.json',pack.manifestBytes],...pack.payloads]);
const MOUNTED=new WeakMap<Document,LocalTexturePacks>();
const randomId=():string=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const decode=(bytes:Uint8Array)=>new TextDecoder().decode(bytes);
/**
 * Testroom controller: no work until explicitly enabled, one request at a time, silent per-entry fallback. GX-21: the
 * map's library (`packs.json`, or `current.json`'s pack alone without one) is read once per map and switch-on; the
 * choice (`choose`) is a listed pack's id, `PACK_CHOICE_DEFAULT` (`current.json`'s) or null (Original: nothing applied).
 */
export class LocalTexturePacks {
  private target:TexturePackTarget|null=null;
  private enabled=false;
  private choice:string|null=PACK_CHOICE_DEFAULT;
  private request:AbortController|null=null;
  private generation=0;
  private session:{abort:AbortController;library:Promise<Listed>;listed:Listed|null}|null=null;
  /** The entry id the current run applies (null: Original), or undefined when no run has resolved one. */
  private resolved:string|null|undefined=undefined;
  private skips:PackSkip[]=[];
  ready:Promise<void>=Promise.resolve();
  /** GX-27: the latest import or removal, settled when it has finished (its status said, the chooser set). */
  upload:Promise<void>=Promise.resolve();
  /** GX-27: an import or a removal is running. */
  busy=false;
  /** GX-27: false once the pack store has failed (or there is none); the import is then disabled and says why. */
  uploadsAvailable=true;
  private store:UploadedPacks|null;
  /** The loaded map archive's bytes, from the page's disc source. A plain pack's provenance; without it a plain import is refused. */
  private readArchive:(()=>Promise<Uint8Array>)|null=null;
  /** `described(scale)`: the applied manifest's scale, or null when none is loaded for the current map. `reported`: the chooser's state. */
  constructor(private fetcher:FetchPack=(url,init)=>fetch(url,init),private changed:(count:number)=>void=()=>undefined,private described:(scale:number|null)=>void=()=>undefined,
    private reported:(report:PackReport)=>void=()=>undefined,private uploads:UploadHooks={}){
    this.store=uploads.store??null;if(!this.store)this.uploadsAvailable=false;
  }
  describe(scale:number|null):void{this.described(scale);}
  /** GX-27: the Experimental view is on (the import's prerequisite). */
  get isEnabled():boolean{return this.enabled;}
  /** GX-27: `id` is an uploaded pack of the loaded map's library. */
  isUploaded(id:string):boolean{return this.session?.listed?.uploaded?.has(id)??false;}
  private say(text:string):void{this.uploads.status?.(text);}
  private state():void{this.uploads.state?.();}
  get applied():number{return this.target?.alive?this.target.applied:0;}
  /** Browser adaptation: selected or applying uploads count too, so removal cancels pending chooser work. */
  isApplied(map:string,id:string):boolean{return this.enabled&&this.target?.alive===true&&this.target.map===map&&(this.resolved===id||this.choice===id);}
  /** The loaded map's library, in the index's order; empty until it has been read with the switch on. */
  library():PackIndexEntry[]{return this.session?.listed?.library.entries.slice()??[];}
  /** The applied pack's refused entries, each with its reason; empty when Original or nothing was refused. */
  skipped():PackSkip[]{return this.skips.slice();}
  setTarget(target:TexturePackTarget|null):void{if(target===this.target)return;this.endSession();this.target=target;this.describe(null);this.start();this.state();}
  setEnabled(enabled:boolean):void{if(enabled===this.enabled)return;this.endSession();this.enabled=enabled;this.start();this.state();}
  /** Changing the choice restores the originals first, exactly as OFF does, then applies the new one. */
  choose(choice:string|null):void{
    if(choice===this.choice)return;this.choice=choice;
    const listed=this.session?.listed;if(listed&&this.resolved!==undefined&&(this.pick(listed.library)?.id??null)===this.resolved)return;
    this.stopApply();this.start();
  }
  /** Browser adaptation: a validated local import, applied by the same manifest/source/payload checks as the chooser.
   * The local-only listing avoids a served-library request, and every async apply continuation checks the live grant. */
  async activateStored(packId:string,alive:()=>boolean,signal?:AbortSignal):Promise<void>{
    const target=this.target,store=this.store;
    const check=()=>{signal?.throwIfAborted();refusePack(alive()&&target===this.target&&target?.alive,'the test-room build session changed');};
    check();refusePack(target&&store&&packMap(target.map),'no loaded texture-pack target');
    const records=await store.list(target.map as PackMap);check();
    const record=records.find(r=>r.id===packId&&r.state==='pack');refusePack(record,'the stored texture pack was not found');
    this.endSession();this.enabled=true;this.choice=packId;
    const listed:Listed={library:{entries:[record.entry],defaultId:packId,uploaded:[packId]},manifests:new Map(),uploaded:new Set([packId])};
    const session={abort:new AbortController(),library:Promise.resolve(listed),listed};this.session=session;
    this.start(()=>alive()&&!signal?.aborted);const generation=this.generation;
    const cancel=()=>{if(this.generation===generation)this.endSession();};signal?.addEventListener('abort',cancel,{once:true});
    try{
      await this.ready;check();
      refusePack(this.resolved===packId&&this.applied===record.entry.textures&&this.skips.length===0,'the live texture pack did not completely apply');
      this.uploads.selected?.(packId);this.state();
    }catch(e){if(this.generation===generation)this.endSession();throw e;}
    finally{signal?.removeEventListener('abort',cancel);}
  }
  /** Restore the runtime's originals before the local catalogue deletes an active upload. */
  deactivateStored(alive:()=>boolean):void{
    refusePack(alive(),'the test-room build session changed');
    this.choice=null;this.endSession();this.enabled=false;this.describe(null);this.uploads.selected?.('');this.state();
  }
  dispose():void{this.endSession();this.target=null;this.enabled=false;}
  /**
   * GX-27: imports an uploaded base pack zip (`texturePackUpload.ts`) while the Experimental view is on: the loaded map's
   * part is built now against its sources, stored, listed and chosen; another map's part is stored staged and built when
   * that map is loaded. A plain pack (no `export.json`) is built for the loaded map at once and never staged. The status
   * line says what happened, or the refusal with its reason; nothing is applied otherwise.
   */
  setArchiveReader(read:()=>Promise<Uint8Array>):void{this.readArchive=read;}
  importZip(file:Blob,name:string):Promise<void>{
    const run=(async()=>{
      const store=this.store,target=this.target;
      if(!store||!this.enabled||this.busy)return;
      this.busy=true;this.state();this.say(`importing ${name}...`);
      try{
        // An HD pack zip (OT.R92) is the HD switch's, kept in this browser; any other zip is a per-map pack, as before.
        const hd=await this.uploads.hd?.(file,name)??null;
        if(hd!==null){this.say(hd);return;}
        const map=target?.alive&&packMap(target.map)?target.map:undefined;
        const upload=await readUpload(blobSource(file),name,undefined,map&&target?{map,sourcesFor:roles=>target.sourcesFor(roles)}:undefined),lines:string[]=[];let chosen:string|null=null;
        for(const part of upload.parts){
          // One map's refusal is its own line; the zip's other maps still import. A store that fails stops the import.
          try{
            if(part.plainMembers){
              if(!target?.alive||target.map!==part.map)throw new PackRefusal('a plain pack is built for the loaded map and is not staged');
              const readArchive=this.readArchive;
              if(!readArchive)throw new PackRefusal('plain pack: the loaded map archive is not readable from this page');
              const built=await buildUploadPart(part,target.sourcesFor(part.roles),{provenance:await plainProvenance(await readArchive(),viewerCommit())});
              const added=await store.add(part.map,'pack',built.entry,packFiles(built.pack));chosen=built.entry.id;
              lines.push(added==='added'?importSummary(part.meta.name,built):`${part.meta.name}: already imported (the same pack), chosen again.`);
            }else if(target?.alive&&target.map===part.map){
              const built=await buildUploadPart(part,target.sourcesFor(part.roles));
              const added=await store.add(part.map,'pack',built.entry,packFiles(built.pack));chosen=built.entry.id;
              lines.push(added==='added'?importSummary(part.meta.name,built):`${part.meta.name}: already imported (the same pack), chosen again.`);
            }else{
              // Review F2: what the zip declares must fit the store's room before any PNG of the part is read.
              const files=await stagedFilesWithin(part,await store.room(part.map)),bytes=[...files.values()].reduce((n,b)=>n+b.byteLength,0);
              const entry:TexturePackIndexEntry={id:randomId(),name:part.meta.name,kind:'textures',method:part.meta.method,scale:part.scale,roles:part.roles,
                generatedAt:new Date().toISOString(),textures:Math.max(1,part.replaced),bytes:Math.max(4,bytes),notes:part.meta.notes};
              await store.add(part.map,'staged',entry,files);
              lines.push(`${part.meta.name}: staged for ${part.map} (${part.replaced} replaced PNG${part.replaced===1?'':'s'}); it is built when that map is loaded with Experimental on.`);
            }
          }catch(e){
            if(e instanceof UploadStoreUnavailable||upload.parts.length===1)throw e;
            lines.push(`${part.meta.name} (${part.map}): refused -- ${reasonOf(e)}`);
          }
        }
        const skipped=skippedLine(upload.skipped.length);if(skipped)lines.push(skipped);
        this.say(lines.join(' '));
        if(chosen&&this.target===target&&this.enabled){this.choice=chosen;this.endSession();this.start();await this.ready;this.uploads.selected?.(chosen);}
      }catch(e){this.say(`${name}: refused -- ${reasonOf(e)}`);}
      finally{this.busy=false;this.state();}
    })();
    this.upload=run;return run;
  }
  /** GX-27: removes an uploaded pack of the loaded map from the store; the chooser returns to Original. */
  removeUploaded(id:string):Promise<void>{
    const run=(async()=>{
      const store=this.store,target=this.target;
      if(!store||!target||this.busy||!this.isUploaded(id))return;
      const name=this.library().find(e=>e.id===id)?.name??'the pack';
      this.busy=true;this.state();
      try{
        await store.remove(target.map as PackMap,id);this.say(`${name} removed.`);
        this.choice=null;this.uploads.selected?.('');this.uploads.removed?.(id);this.endSession();this.start();await this.ready;
      }catch(e){this.say(`${name}: not removed -- ${reasonOf(e)}`);}
      finally{this.busy=false;this.state();}
    })();
    this.upload=run;return run;
  }
  private stopApply():void{this.generation++;this.request?.abort();this.request=null;this.resolved=undefined;this.skips=[];this.target?.restore();this.changed(0);}
  private endSession():void{this.stopApply();this.session?.abort.abort();this.session=null;this.reported(OFF_REPORT);}
  /** A listed choice, else the default; a choice of another map's pack falls back to this map's default. */
  private pick(library:PackLibrary):PackIndexEntry|null{
    if(this.choice===null)return null;
    return library.entries.find(e=>e.id===this.choice)??library.entries.find(e=>e.id===library.defaultId)??null;
  }
  /**
   * A JSON file of the pack directory, or null when absent. The dev server is an SPA: a missing file is answered 200 with
   * index.html to a plain fetch, so the request asks for JSON (Vite's HTML fallback then answers 404) and an HTML answer
   * is absent too (GX-21 review).
   */
  private async bytes(url:string,max:number,signal:AbortSignal):Promise<Uint8Array|null>{
    const response=await this.fetcher(url,{signal,cache:'no-store',redirect:'error',headers:{accept:'application/json'}});
    if(response.status===404||/^text\/html\b/i.test(response.headers.get('content-type')??'')){await response.body?.cancel().catch(()=>undefined);return null;}
    return boundedBytes(response,max,signal);
  }
  /** The map's library: the index if there is one (the index is the library), else `current.json`'s pack alone. */
  private async readLibrary(map:PackMap,signal:AbortSignal,target:TexturePackTarget):Promise<Listed>{
    const pointer:{refused?:string}={},listed=await this.readLibraryFrom(map,signal,pointer);
    const served=pointer.refused===undefined?listed:{...listed,library:{...listed.library,pointerRefused:pointer.refused}};
    return this.withUploads(map,served,signal,target);
  }
  /**
   * GX-27: the served library and, after it, the map's uploaded packs (an id the server lists stays the server's). A
   * staged upload of this map is built first, against the loaded map's sources, and stored as a pack. A pack store that
   * fails leaves the served library as it was, and the import says why.
   */
  private async withUploads(map:PackMap,listed:Listed,signal:AbortSignal,target:TexturePackTarget):Promise<Listed>{
    const store=this.store;
    if(!store){this.say('Uploads are unavailable: this page has no pack store.');return listed;}
    try{
      let records=await store.list(map);signal.throwIfAborted();
      for(const r of records.filter(x=>x.state==='staged')){
        // Review F3: a world already disposed (or a session ended) builds nothing and keeps the staged upload; the sources
        // are taken before any await, so a later disposal cannot hand the build an empty set.
        if(signal.aborted||!target.alive)break;
        const sources=target.sourcesFor(r.entry.roles);
        this.say(`${r.entry.name}: building the upload staged for ${map}...`);
        try{
          const part=await stagedPart(name=>store.file(map,r.id,name)),built=await buildUploadPart(part,sources);
          if(signal.aborted||!target.alive)break;
          // The staged upload is replaced by its pack, never counted twice against the store's limits.
          await store.replace(map,r.id,'pack',built.entry,packFiles(built.pack));this.say(importSummary(part.meta.name,built));
        }catch(e){
          if(e instanceof UploadStoreUnavailable)throw e;
          if(signal.aborted||!target.alive)break;
          await store.remove(map,r.id);this.say(`${r.entry.name}: refused -- ${reasonOf(e)}`);
        }
      }
      signal.throwIfAborted();
      if(records.some(x=>x.state==='staged'))records=await store.list(map);
      signal.throwIfAborted();
      const served=new Set(listed.library.entries.map(e=>e.id)),packs=records.filter(r=>r.state==='pack'&&!served.has(r.id));
      if(!this.uploadsAvailable){this.uploadsAvailable=true;this.state();}
      const uploaded=new Set(packs.map(r=>r.id));
      return {...listed,uploaded,library:{...listed.library,entries:[...listed.library.entries,...packs.map(r=>r.entry)],uploaded:[...uploaded]}};
    }catch(e){
      signal.throwIfAborted();
      this.uploadsAvailable=false;this.state();this.say(`Uploads are unavailable: ${e instanceof Error?e.message:String(e)}.`);
      return listed;
    }
  }
  private async readLibraryFrom(map:PackMap,signal:AbortSignal,pointerState:{refused?:string}):Promise<Listed>{
    const ROOT=packRoot(map),manifests=new Map<string,Uint8Array>();
    let defaultId:string|null=null,pointer:Uint8Array|null;
    // A pointer the server cannot give within its bound is a broken directory: nothing more is read from it.
    try{pointer=await this.bytes(ROOT+'current.json',1024,signal);}
    catch{signal.throwIfAborted();return {library:{entries:[],defaultId:null,refused:'unreadable or over 1 KiB',refusedFile:'current.json'},manifests};}
    // GX-25 round 5: an absent pointer (404, an SPA's HTML) is the silent no-default case; a present one that is malformed
    // is refused with its reason -- no default, the index still listed and selectable.
    if(pointer){
      type Pointer={version?:unknown;packId?:unknown}|null;
      let p:Pointer=null,parsed=false;
      try{p=JSON.parse(decode(pointer)) as Pointer;parsed=true;}catch{pointerState.refused='not JSON';}
      if(parsed){
        if(p===null||typeof p!=='object'||p.version!==1)pointerState.refused='not version 1';
        else if(!hashString(p.packId))pointerState.refused='packId is not a sha256';
        else defaultId=p.packId;
      }
    }
    let index:Uint8Array|null;
    try{index=await this.bytes(ROOT+'packs.json',PACK_INDEX_LIMITS.indexBytes,signal);}
    catch{signal.throwIfAborted();return {library:{entries:[],defaultId:null,refused:`unreadable or over ${PACK_INDEX_LIMITS.indexBytes/1024} KiB`},manifests};}
    if(index){
      let raw:unknown;try{raw=JSON.parse(decode(index));}catch{return {library:{entries:[],defaultId:null,refused:'not JSON'},manifests};}
      try{const {packs}=validatePackIndex(raw);return {library:{entries:packs,defaultId:packs.some(e=>e.id===defaultId)?defaultId:null},manifests};}
      catch(e){if(e instanceof PackRefusal)return {library:{entries:[],defaultId:null,refused:e.reason},manifests};throw e;}
    }
    if(!defaultId)return {library:{entries:[],defaultId:null},manifests};
    // No index: the default's own manifest names it (its method) and gives the chooser its scale.
    const common={id:defaultId,generatedAt:'',notes:''};
    try{
      const bytes=await this.manifestBytes(ROOT,defaultId,signal),m=this.checkedManifest(map,defaultId,bytes,await sha256(bytes));manifests.set(defaultId,bytes);
      const entry:TexturePackIndexEntry={...common,kind:'textures',name:m.method.slice(0,PACK_INDEX_LIMITS.nameLength),method:m.method,scale:m.scale,roles:m.roles??'world',textures:m.entries.length,bytes:m.totalBytes};
      return {library:{entries:[entry],defaultId},manifests};
    }catch(e){signal.throwIfAborted();return {library:{entries:[{...common,kind:'textures',name:'current.json',refused:e instanceof PackRefusal?e.reason:'manifest unavailable'}],defaultId},manifests};}
  }
  private async manifestBytes(ROOT:string,id:string,signal:AbortSignal):Promise<Uint8Array>{
    let bytes:Uint8Array|null=null;
    try{bytes=await this.bytes(ROOT+id+'/manifest.json',PACK_LIMITS.manifestBytes,signal);}catch{signal.throwIfAborted();}
    refusePack(bytes,'manifest unavailable');return bytes;
  }
  private async storedManifest(map:PackMap,id:string):Promise<Uint8Array>{
    let bytes:Uint8Array|null=null;try{bytes=await this.store?.file(map,id,'manifest.json')??null;}catch{bytes=null;}
    refusePack(bytes&&bytes.length<=PACK_LIMITS.manifestBytes,'manifest unavailable');return bytes;
  }
  private async storedPayload(map:PackMap,id:string,entry:PackEntry):Promise<Uint8Array>{
    const bytes=await this.store?.file(map,id,entry.file)??null;requirePack(bytes&&bytes.length<=entry.bytes);return bytes;
  }
  private checkedManifest(map:PackMap,id:string,bytes:Uint8Array,digest:string):PackManifest{
    refusePack(digest===id,'manifest does not match its id');
    let manifest:PackManifest;try{manifest=validateManifest(JSON.parse(decode(bytes)));}catch(e){throw e instanceof PackRefusal?e:new PackRefusal('invalid manifest');}
    refusePack(manifest.mapArchive===mapArchiveOf(map),`made for ${manifest.mapArchive}`);return manifest;
  }
  private start(alive:()=>boolean=()=>true):void {
    if(!this.enabled||!this.target?.alive||!packMap(this.target.map)){this.ready=Promise.resolve();return;}
    const target=this.target,map=this.target.map,ROOT=packRoot(map),id=this.generation,request=new AbortController();this.request=request;
    if(!this.session){
      const abort=new AbortController(),session:{abort:AbortController;library:Promise<Listed>;listed:Listed|null}={abort,library:this.readLibrary(map,abort.signal,target),listed:null};
      session.library.then(l=>{session.listed=l;},()=>undefined);this.session=session;
    }
    const session=this.session;
    const current=()=>id===this.generation&&this.enabled&&target.alive&&alive();
    const get=async(url:string,max:number)=>boundedBytes(await this.fetcher(url,{signal:request.signal,cache:'no-store',redirect:'error'}),max,request.signal);
    this.ready=(async()=>{
      const listed=await session.library;session.listed=listed;if(!current())return;
      const chosen=this.pick(listed.library);this.resolved=chosen?.id??null;
      const skipped:PackSkip[]=[];this.skips=skipped;
      const report=(r:Partial<PackReport>)=>this.reported({library:listed.library,chosen,applied:this.applied,done:false,refused:null,skipped:skipped.slice(),...r});
      if(!chosen||'refused' in chosen){report({done:true,refused:chosen&&'refused' in chosen?chosen.refused:null});return;}
      // GX-27: an uploaded pack's manifest and payloads come from the page's store, checked exactly as a served pack's.
      const uploaded=listed.uploaded?.has(chosen.id)===true;
      report({});
      let manifest:PackManifest;
      try{
        const bytes=listed.manifests.get(chosen.id)??(uploaded?await this.storedManifest(map,chosen.id):await this.manifestBytes(ROOT,chosen.id,request.signal));if(!current())return;
        manifest=this.checkedManifest(map,chosen.id,bytes,await sha256(bytes));if(!current())return;
        refusePack(indexMatches(chosen,manifest),'the index entry does not match its manifest');
      }catch(e){if(current())report({done:true,refused:e instanceof PackRefusal?e.reason:'manifest unavailable'});return;}
      const root=ROOT+chosen.id+'/';this.describe(manifest.scale);
      // GX-25 review: a refused entry keeps its original and says why (the reason in the report and the status line).
      // Each check returns its reason; undefined is applied, or a run that is no longer current (nothing to say).
      const check=async(entry:PackEntry):Promise<string|undefined>=>{
        const source=target.source(entry.key,manifest.roles??'world');if(!source)return 'not eligible on this map';
        try{validateSource(source);}catch{return 'source not eligible (not opaque, or a malformed chain)';}
        if(await sourceDigest(source,manifest.mapArchive)!==entry.sourceDigest||await descriptorDigest(entry.key,entry.sourceFlags,entry.sourceLevels,manifest.mapArchive)!==entry.sourceDigest)return 'source digest mismatch';
        if(!current())return undefined;
        // Bind declared layout to actual source levels too; a self-consistent malicious manifest cannot change sampler semantics.
        if(entry.mipmaps!==(source.flags.gs?.mipmaps===true)||entry.sourceLevels.length!==source.levels.length)return 'source levels do not match';
        for(const [i,l] of source.levels.entries())if(entry.sourceLevels[i]!.width!==l.width||entry.sourceLevels[i]!.height!==l.height||entry.sourceLevels[i]!.sha256!==await sha256(new Uint8Array(l.data.buffer,l.data.byteOffset,l.data.byteLength)))return 'source levels do not match';
        let data:Uint8Array;try{data=uploaded?await this.storedPayload(map,chosen.id,entry):await get(root+entry.file,entry.bytes);}catch{return current()?'payload missing or over its declared size':undefined;}
        if(data.length!==entry.bytes)return 'payload missing or over its declared size';
        if(await sha256(data)!==entry.sha256)return 'payload hash mismatch';
        for(let i=3;i<data.length;i+=4)if(data[i]!==255)return 'payload alpha is not 255';
        if(!current())return undefined;
        if(!target.apply(entry,data))return `not applied (no such texture, or over the ${PACK_LIMITS.totalBytes/1024/1024} MiB cap)`;
        this.changed(this.applied);report({});return undefined;
      };
      for(const entry of manifest.entries){
        if(!current())return;
        let reason:string|undefined;try{reason=await check(entry);}catch{reason='malformed entry';}
        if(reason!==undefined&&current()){skipped.push({key:entry.key,reason});report({});}
      }
      if(current())report({done:true});
    })().catch(()=>undefined);
  }
}

/**
 * Only a testroom document can create a pack loader. Leaving that route cancels and restores immediately. GX-27: `store` is the page's pack store (the page's own IndexedDB unless a test passes one; null for none). The
 * panel's import controls (`#exp-pack-import`, `#exp-pack-file`, `#exp-pack-remove`, `#exp-pack-import-status`) are
 * wired by delegation, so the panel may be mounted after this.
 */
export function mountLocalTexturePacks(doc:Document,fetcher?:FetchPack,store:UploadedPacks|null=new UploadedPacks(idbUploadBackend(pageIndexedDb)),
  hd?:UploadHooks['hd']):LocalTexturePacks|null {
  if(!doc.body.classList.contains('test-room'))return null;
  const select=()=>doc.getElementById('exp-texturePack') as HTMLSelectElement|null;
  const sync=():void=>{
    const importer=doc.getElementById('exp-pack-import') as HTMLButtonElement|null,remover=doc.getElementById('exp-pack-remove') as HTMLButtonElement|null,value=select()?.value??'';
    if(importer)importer.disabled=!packs.isEnabled||packs.busy||!packs.uploadsAvailable;
    if(remover)remover.disabled=!packs.isEnabled||packs.busy||!packs.isUploaded(value);
  };
  const packs:LocalTexturePacks=new LocalTexturePacks(fetcher,undefined,undefined,report=>{
    if(report.library)showPackLibrary(doc,report.library);
    const note=doc.getElementById('exp-pack-status');if(note)note.textContent=packStatusText(report);
    sync();
  },{store,state:sync,hd,
    status:text=>{const note=doc.getElementById('exp-pack-import-status');if(note)note.textContent=text;},
    selected:value=>{const s=select();if(s&&s.value!==value){s.value=value;s.dispatchEvent(new Event('change'));}sync();},
    removed:id=>{for(const o of Array.from(select()?.options??[]))if(o.value===id)o.remove();}});
  // One loader answers the panel: a document mounted again (a test's next page) leaves the earlier listeners inert.
  MOUNTED.set(doc,packs);const live=()=>MOUNTED.get(doc)===packs;
  doc.addEventListener('click',e=>{
    if(!live())return;
    const button=(e.target as Element|null)?.closest?.('button');
    if(button?.id==='exp-pack-import')(doc.getElementById('exp-pack-file') as HTMLInputElement|null)?.click();
    else if(button?.id==='exp-pack-remove'){const value=select()?.value??'';if(packs.isUploaded(value))void packs.removeUploaded(value);}
  });
  doc.addEventListener('change',e=>{
    if(!live())return;
    const el=e.target as HTMLElement|null;
    if(el?.id==='exp-pack-file'){
      const input=el as HTMLInputElement,file=input.files?.[0];
      if(file)void packs.importZip(file,file.name);
      try{input.value='';}catch{/* a browser that refuses: the next choice of the same file still fires */}
    }else if(el?.id==='exp-texturePack')sync();
  },true);   // the capture phase: a change event that does not bubble still reaches the document's listener first
  const Observer=doc.defaultView?.MutationObserver;
  const observer=Observer?new Observer(()=>{if(!doc.body.classList.contains('test-room'))packs.setEnabled(false);}):null;
  observer?.observe(doc.body,{attributes:true,attributeFilter:['class']});
  doc.defaultView?.addEventListener('pagehide',()=>{packs.dispose();observer?.disconnect();},{once:true});return packs;
}
