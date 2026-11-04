import type {Rgba} from '@s2u/gs';
import {decodeDds} from './dds';
import {HdPackRuntime,HdRefusal,HD_LIMITS,hdTextures,validateHdManifest,type HdEntry,type HdManifest,type HdTextureRegistry} from './hdTexturePack';
import {importHdZip,type HdStore} from './hdTexturePackStore';
import {decodePngAsync} from './png';
import {boundedBytes,hashString,sha256} from './texturePack';

/**
 * OT.R92 (HD-6): the test room's HD pack -- the one imported in this browser (`./hdTexturePackStore`, the test room's
 * "Import pack (.zip)") when there is one, else the one served from `experimental-packs/hd/` (`current.json` naming the
 * pack by the sha256 of its manifest; the generator is `tools/hd-pack-from-pcsx2.ts`). Nothing is requested until it is
 * enabled; disabling restores every original. Payloads are read and decoded as textures need them, a few at a time
 * (`HD_CONCURRENT_LOADS`).
 */
export const HD_ROOT='/experimental-packs/hd/';
type Fetch=(url:string,init?:RequestInit)=>Promise<Response>;
const reasonOf=(e:unknown)=>e instanceof HdRefusal?e.reason:e instanceof Error?e.message:String(e);

export class HdServedPack {
  readonly runtime:HdPackRuntime;
  private enabled=false;
  private abort:AbortController|null=null;
  private id:string|null=null;
  private name='HD pack';
  private current:HdManifest|null=null;
  /** HD-3: the menus' replacements (`./hdMenuTextures`), counted on the status line; null for a pack the menus do not use. */
  private menus:number|null=null;
  private state:'off'|'loading'|'on'|'refused'='off';
  private refused='';
  /** The pack in use came from this browser's store (an import), not the server. */
  private imported=false;
  ready:Promise<void>=Promise.resolve();
  constructor(private fetcher:Fetch=(u,i)=>fetch(u,i),private status:(text:string)=>void=()=>undefined,registry:HdTextureRegistry=hdTextures,
    private store:HdStore|null=null){
    this.runtime=new HdPackRuntime(registry,e=>this.load(e),()=>this.say());
  }
  /**
   * The import button's HD path: null when `file` is not an HD pack zip (the per-map import reads it), else the status
   * line -- imported (and applied at once when the switch is on), or refused with the reason.
   */
  async importZip(file:Blob,name:string):Promise<string|null>{
    if(!this.store)return null;
    let r:Awaited<ReturnType<typeof importHdZip>>;
    try{r=await importHdZip(file,this.store);}catch(e){return `${name}: refused -- ${reasonOf(e)}`;}
    if(!r)return null;
    if(this.enabled){await this.setEnabled(false);await this.setEnabled(true);}
    return `${r.name}: imported (${r.textures} textures), kept in this browser.${this.enabled?'':' Switch on "HD texture pack - PCSX2" to use it.'}`;
  }
  get isEnabled():boolean{return this.enabled;}
  /** The pack in use once its manifest is read and checked (HD-3: the menus take their scale from it); null otherwise. */
  get manifest():HdManifest|null{return this.current;}
  statusText():string{
    if(this.state==='off')return 'HD pack off.';
    if(this.state==='refused')return `HD pack: refused -- ${this.refused}`;
    if(this.state==='loading')return 'HD pack: loading its manifest...';
    const n=this.runtime.applied,k=this.runtime.skipped().length;
    const m=this.menus===null?'':`, ${this.menus} in the menus`;
    return `${this.name}${this.imported?' (imported)':''}: ${n} texture${n===1?'':'s'} replaced in this scene${m}${k?`, ${k} kept original`:''}.`;
  }
  private say():void{this.status(this.statusText());}
  /** HD-3 (the owner, 2026-11-01): the menus' count on the status line; null takes it off. */
  setMenuCount(n:number|null):void{if(n===this.menus)return;this.menus=n;this.say();}
  setEnabled(on:boolean):Promise<void>{
    if(on===this.enabled)return this.ready;
    this.enabled=on;this.abort?.abort();this.abort=null;void this.runtime.setPack(null);this.id=null;this.current=null;
    if(!on){this.state='off';this.say();return this.ready=Promise.resolve();}
    const abort=new AbortController();this.abort=abort;this.state='loading';this.say();
    return this.ready=(async()=>{
      try{
        const stored=await this.store?.current().catch(()=>null)??null;
        let packId:string,bytes:Uint8Array;
        if(stored){
          const b=await this.store!.file('manifest.json');if(!b)throw new HdRefusal('the imported manifest is missing');
          packId=stored.id;bytes=b;
        }else{
          const pointer=JSON.parse(new TextDecoder().decode(await this.bytes(HD_ROOT+'current.json',1024,abort.signal))) as {version?:unknown;packId?:unknown};
          if(pointer?.version!==1||!hashString(pointer.packId))throw new HdRefusal('current.json does not name a pack');
          packId=pointer.packId;bytes=await this.bytes(`${HD_ROOT}${packId}/manifest.json`,HD_LIMITS.manifestBytes,abort.signal,'default');
        }
        if(await sha256(bytes)!==packId)throw new HdRefusal('the manifest does not match its id');
        const manifest=validateHdManifest(JSON.parse(new TextDecoder().decode(bytes)));
        if(abort.signal.aborted)return;
        this.id=packId;this.current=manifest;this.imported=stored!==null;this.name=manifest.name;this.state='on';this.say();
        await this.runtime.setPack(manifest);
      }catch(e){if(!abort.signal.aborted){this.state='refused';this.refused=reasonOf(e);this.say();}}
    })();
  }
  /**
   * `cache`: the pointer (current.json) is fetched uncached; a pack's manifest and payloads are named by the manifest's
   * hash, so the browser keeps them (served immutable a year, HD.R8) and a returning player downloads them once.
   */
  private async bytes(url:string,max:number,signal:AbortSignal,cache:RequestCache='no-store'):Promise<Uint8Array>{
    const r=await this.fetcher(url,{signal,cache,redirect:'error'});
    if(r.status===404||/^text\/html\b/i.test(r.headers.get('content-type')??'')){await r.body?.cancel().catch(()=>undefined);throw new HdRefusal(`${url.slice(HD_ROOT.length)} is missing`);}
    return boundedBytes(r,max,signal);
  }
  private async load(e:HdEntry):Promise<Rgba>{
    const id=this.id,signal=this.abort?.signal;if(!id||!signal)throw new Error('the pack is off');
    // A payload is at most its decoded size plus a DDS header (an uncompressed one), usually far less. Served gzipped
    // (HD.R8, gzip_static), its declared length is the compressed one, which on near-random data runs a little over the
    // file (gzip's worst case is about 0.03% plus 18 bytes): the bound leaves 0.2% plus 1 KiB.
    const max=e.bytes+Math.ceil(e.bytes/512)+1024;
    let bytes:Uint8Array;
    if(this.imported){
      const b=await this.store!.file(e.file);if(!b)throw new Error(`${e.file} is not in the imported pack`);
      if(b.length>e.bytes+1024)throw new Error(`${e.file} is over its entry's size`);bytes=b;
    }else bytes=await this.bytes(`${HD_ROOT}${id}/${e.file}`,max,signal,'default');
    return e.format==='dds'?decodeDds(bytes,{width:e.outWidth,height:e.outHeight}):decodePngAsync(bytes,HD_LIMITS.outputEdge);
  }
}
