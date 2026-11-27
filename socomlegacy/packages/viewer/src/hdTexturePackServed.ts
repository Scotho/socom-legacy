import type {Rgba} from '@s2u/gs';
import {decodeDds} from './dds';
import {decodeKtx2} from './hdPackBlocks';
import {HdPackRuntime,HdRefusal,HD_LIMITS,hdTextures,validateHdManifest,type HdAlphaStep,type HdEntry,type HdManifest,type HdRuntimeOptions,type HdTextureRegistry} from './hdTexturePack';
import {HdDownloadFailed,HdNotServed,type HdPackSource,type HdStore} from './hdTexturePackStore';
import {decodePngAsync} from './png';
import {boundedBytes,hashString,sha256} from './texturePack';

/**
 * OT.R92 (HD-6): the HD pack -- the one kept in this browser (`./hdTexturePackStore`, installed in Home > Experiments >
 * Mods since B206) when there is one, else the one served from `experimental-packs/hd/` (`current.json` naming the
 * pack by the sha256 of its manifest; the generator is `tools/hd-pack-from-pcsx2.ts`). Nothing is requested until it is
 * enabled; disabling restores every original. Payloads are read and decoded as textures need them, a few at a time
 * (`HD_CONCURRENT_LOADS`).
 */
export const HD_ROOT='/experimental-packs/hd/';
type Fetch=(url:string,init?:RequestInit)=>Promise<Response>;
/** A PNG payload's decode (`png.ts` `decodePngAsync` by default; GM-13b: the menus' pack passes their worker's). */
export type HdPngDecode=(bytes:Uint8Array,maxEdge:number)=>Promise<Rgba>;
/** GM-13d: a DDS payload's decode at its entry's size (`dds.ts` `decodeDds` here by default; the menus' pass their worker's). */
export type HdDdsDecode=(bytes:Uint8Array,size:{width:number;height:number})=>Rgba|Promise<Rgba>;
/**
 * WM-PACK-2 RUNTIME (a browser adaptation): a KTX2 payload's decode at its entry's size, its blocks held beside the
 * decode (`hdPackBlocks.ts` `decodeKtx2` here by default; the menus' decoder decodes in its worker).
 */
export type HdKtx2Decode=(bytes:Uint8Array,size:{width:number;height:number})=>Rgba|Promise<Rgba>;
/**
 * GM-13d (plan 2026-11-01-gpu-menus, row GM-13d): the pack's decodes, each defaulting to today's -- `decodePngAsync`,
 * `decodeDds` and `fullAlpha` (`HdPackRuntime`'s alpha step) on this thread. The menus' pack passes its `HdMenuDecoder`
 * (all three in its worker); since B206 ML-4 (ML.R10) the match's (`matchMount.ts`), the Forge's and the test room's
 * (`main.ts`) pass the page's `HdMenuDecoder` too, so a payload is decoded and hashed once, off the main thread. PRODUCT
 * TRACK, a browser adaptation: the same functions, so the same bytes.
 */
export interface HdPackDecoders {png?:HdPngDecode;dds?:HdDdsDecode;ktx2?:HdKtx2Decode;alpha?:HdAlphaStep;
  /** PR #729's Codex P2: the decoders' worker ended (`HdMenuDecoder.close`), called by the pack's `dispose`. */
  close?:()=>void;
  /** B-48 (b): where the decodes run (a worker, or the main thread) and why, once the decoder is made; null before. */
  decoderMode?:()=>{mode:string;failure:string|null}|null}
/**
 * B206 ML-4 (ML.R10; product track, ML.R2): a page's world pack's `HdPackDecoders`, its decoder made at the first
 * payload (`make`, the page's lazy `import('./hdMenuTextures')` and its `HdMenuDecoder`), so a page that applies no pack
 * never loads the decoder's module or starts its worker. Each decode is the made decoder's own (`png`, `dds`, `alpha`),
 * so its keys are seeded (GM-13d's `seedHdKey`) and a payload is hashed once. PR #729's Codex P2: `close` ends the made
 * decoder (its worker terminated, `HdMenuDecoder.close`) -- nothing when none was made -- and the next payload makes one
 * again; the pack's `dispose` calls it, so a match's teardown leaves no worker behind.
 */
export function lazyHdPackDecoders(make:()=>Promise<Required<Omit<HdPackDecoders,'close'|'decoderMode'>>&{close?:()=>void;mode?:string;failure?:string|null}>):HdPackDecoders{
  let made:ReturnType<typeof make>|null=null;
  /** B-48 (b): the made decoder, read by `decoderMode` (an `HdMenuDecoder`'s `mode` and `failure`). */
  let ready:{mode?:string;failure?:string|null}|null=null;
  const get=()=>made??=make().then(d=>{ready=d;return d;});
  return {
    png:(bytes,maxEdge)=>get().then(d=>d.png(bytes,maxEdge)),
    dds:(bytes,size)=>get().then(d=>d.dds(bytes,size)),
    ktx2:(bytes,size)=>get().then(d=>d.ktx2(bytes,size)),
    alpha:(r)=>get().then(d=>d.alpha(r)),
    close:()=>{const m=made;made=null;ready=null;void m?.then(d=>d.close?.(),()=>undefined);},
    decoderMode:()=>ready&&typeof ready.mode==='string'?{mode:ready.mode,failure:ready.failure??null}:null,
  };
}
/**
 * B206 ML-3 / ML-4 (plan 2026-11-06-mods-loader; product track, ML.R2). `storeOnly` (ML.R4, R16): the pack comes from
 * the MODS store alone -- the match, the Forge and the test room read packs from there; with none kept it is refused in
 * words and nothing is fetched (the served path stays for ML-12's temporary button only). `runtime`: the runtime's
 * online guard and frame budget (`HdRuntimeOptions`; its `alpha` is the decoders' when they name one).
 */
export interface HdServedOptions {storeOnly?:boolean;runtime?:HdRuntimeOptions}
/** ML-4's overlay: the pack's name, the textures replaced of those it names here, done, or refused with its words. */
export interface HdApplyProgress {name:string;applied:number;total:number;done:boolean;refused:string|null}
const reasonOf=(e:unknown)=>e instanceof HdRefusal?e.reason:e instanceof Error?e.message:String(e);

/**
 * A served file's bytes, at most `max`. A missing file -- a 404, or the static host's HTML for an address it does not
 * hold (an SPA's fallback) -- is `missing(name)`'s refusal; `cache`: the pointer (current.json) is fetched uncached, a
 * pack's manifest and payloads are named by the manifest's hash, so the browser keeps them (served immutable a year,
 * HD.R8) and a returning player downloads them once.
 */
async function servedBytes(fetcher:Fetch,url:string,max:number,signal:AbortSignal,cache:RequestCache,missing:(name:string)=>HdRefusal):Promise<Uint8Array>{
  const r=await fetcher(url,{signal,cache,redirect:'error'});
  if(r.status===404||/^text\/html\b/i.test(r.headers.get('content-type')??'')){await r.body?.cancel().catch(()=>undefined);throw missing(url.slice(HD_ROOT.length));}
  return boundedBytes(r,max,signal);
}
/** A served payload's bound: its decoded size plus a DDS header, and gzip's worst case on near-random data (0.2% plus 1 KiB). */
const payloadBound=(bytes:number):number=>bytes+Math.ceil(bytes/512)+1024;

export {HdNotServed} from './hdTexturePackStore';

/**
 * LATER 1135 (tier 1 row 9; a browser adaptation, the PS2 has no texture pack): how many times a served file's request
 * is made before the install says it "could not be downloaded" -- a failed request (the network, a status), never a
 * missing file or one over its size, which are refused at once. Four: a dropped connection or a busy server mid-way
 * through a 1.5 GB install costs a wait, not the install.
 */
export const HD_FETCH_ATTEMPTS_ADAPTATION = 4;
/** LATER 1135: the wait before each further attempt, doubling from this (1 s, 2 s, 4 s): a browser adaptation's backoff. */
export const HD_FETCH_BACKOFF_MS_ADAPTATION = 1000;
/**
 * LATER 1135 (the served run, Shadow PC 2: a fresh install stalled at 1325.6 MB of 1510.4 MB for 30 min with no error):
 * the longest one attempt at one file may take before it counts as a failed request and is tried again -- a response
 * whose body stops arriving never errors by itself. 60 s: the largest payload over a slow link, with room; a browser
 * adaptation's bound.
 */
export const HD_FETCH_ATTEMPT_TIMEOUT_MS_ADAPTATION = 60_000;
/** LATER 1135: the source's retry, for tests (`attempts`, an instant `sleep`, a short `attemptMs`); the page's by default. */
export interface HdFetchRetry {attempts?:number;sleep?:(ms:number,signal:AbortSignal)=>Promise<void>;attemptMs?:number}
const pageSleep=(ms:number,signal:AbortSignal)=>new Promise<void>((ok,no)=>{
  const t=setTimeout(()=>{signal.removeEventListener('abort',stop);ok();},ms);
  const stop=()=>{clearTimeout(t);no(signal.reason);};
  signal.addEventListener('abort',stop,{once:true});
});
/** `boundedBytes`' refusal of a body over its bound (`requirePack`): a bad file, not a failed request. */
const overBound=(x:unknown):boolean=>x instanceof Error&&x.message==='Invalid or unsupported local texture pack';

/**
 * B206 ML-12 (plan 2026-11-06-mods-loader, ML.R16; `TEST_HD_PACK_BUTTON_ADAPTATION`, removed by ML-13 on the owner's
 * word): the served pack (`HD_ROOT`, H417) as a source for `installHdFromSource` -- the MODS screen's temporary "Add test
 * HD texture pack" installs it into the HD library a dropped zip reaches. Each file through `servedBytes`: the pointer
 * uncached and missing as `HdNotServed`, the manifest and the payloads cached and bounded, a missing one refused.
 * LATER 1135: the manifest's and each payload's request is tried again on a failure (`HD_FETCH_ATTEMPTS_ADAPTATION`,
 * backing off from `HD_FETCH_BACKOFF_MS_ADAPTATION`), then refused as `HdDownloadFailed` ("could not be downloaded");
 * a missing file or one over its size is refused at once, in its own words (was: any failure "over its entry's size or
 * unreadable", and no retry).
 */
export function servedHdSource(fetcher:Fetch=(u,i)=>fetch(u,i),signal:AbortSignal=new AbortController().signal,retry:HdFetchRetry={}):HdPackSource{
  const gone=(name:string)=>new HdRefusal(`${name} is missing`);
  const attempts=Math.max(1,retry.attempts??HD_FETCH_ATTEMPTS_ADAPTATION),sleep=retry.sleep??pageSleep;
  const attemptMs=retry.attemptMs??HD_FETCH_ATTEMPT_TIMEOUT_MS_ADAPTATION;
  /** One attempt under its own time limit: the caller's abort ends it as before; the limit aborts this attempt only. */
  const attempt=async(url:string,max:number):Promise<Uint8Array>=>{
    const one=new AbortController();
    const stop=()=>one.abort(signal.reason);
    signal.addEventListener('abort',stop,{once:true});
    const timer=setTimeout(()=>one.abort(new Error('the attempt timed out')),attemptMs);
    try{return await servedBytes(fetcher,url,max,one.signal,'default',gone);}
    finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
  };
  const tried=async(file:string,url:string,max:number):Promise<Uint8Array>=>{
    for(let n=1;;n++){
      try{return await attempt(url,max);}
      catch(x){
        if(x instanceof HdRefusal||signal.aborted)throw x;
        if(overBound(x))throw new HdRefusal(`${file} is over its entry's size`);
        if(n>=attempts)throw new HdDownloadFailed(file);
        await sleep(HD_FETCH_BACKOFF_MS_ADAPTATION*2**(n-1),signal);
      }
    }
  };
  return {
    pointer:()=>servedBytes(fetcher,HD_ROOT+'current.json',1024,signal,'no-store',()=>new HdNotServed()),
    manifest:id=>tried('manifest.json',`${HD_ROOT}${id}/manifest.json`,HD_LIMITS.manifestBytes),
    payload:(id,e)=>tried(e.file,`${HD_ROOT}${id}/${e.file}`,payloadBound(e.bytes)),
  };
}

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
  private readonly decodePng:HdPngDecode;
  private readonly decodeDds:HdDdsDecode;
  private readonly decodeKtx2:HdKtx2Decode;
  private readonly closeDecoders:(()=>void)|undefined;
  private readonly decoderMode:(()=>{mode:string;failure:string|null}|null)|undefined;
  /** `decoders`: the pack's decodes (GM-13d, `HdPackDecoders`), or a PNG decode alone (GM-13b's form); today's by default. */
  constructor(private fetcher:Fetch=(u,i)=>fetch(u,i),private status:(text:string)=>void=()=>undefined,registry:HdTextureRegistry=hdTextures,
    private store:HdStore|null=null,decoders:HdPngDecode|HdPackDecoders={},private options:HdServedOptions={}){
    const d:HdPackDecoders=typeof decoders==='function'?{png:decoders}:decoders;
    this.decodePng=d.png??decodePngAsync;this.decodeDds=d.dds??decodeDds;this.decodeKtx2=d.ktx2??decodeKtx2;this.closeDecoders=d.close;this.decoderMode=d.decoderMode;
    this.runtime=new HdPackRuntime(registry,e=>this.load(e),()=>this.say(),{...options.runtime,...(d.alpha?{alpha:d.alpha}:{})});
  }
  /** ML-4: what the overlay draws; null while off. */
  progress():HdApplyProgress|null{
    if(this.state==='off')return null;
    if(this.state==='refused')return {name:this.name,applied:0,total:0,done:true,refused:this.refused};
    const applied=this.runtime.applied,total=Math.max(applied,this.runtime.matched);
    return {name:this.name,applied,total,done:this.state==='on'&&this.runtime.idle,refused:null};
  }
  get isEnabled():boolean{return this.enabled;}
  /**
   * B-48 (b) (an instrument): the pack's state for `contextdiag` (`./matchDiag` `feedPackDiag`) -- `s` the state, `dm`/`df`
   * the decoder's mode and failure (null before the first payload), `a` applied of `n` matched.
   */
  diag():{s:string;dm:string|null;df:string|null;a:number;n:number}{
    const m=this.decoderMode?.()??null;
    return {s:this.state,dm:m?.mode??null,df:failureCode(m?.failure??null),a:this.runtime.applied,n:this.runtime.matched};
  }
  /** B-48 (`./packRevealHold`): the manifest loading or an apply in flight -- the loading screen may wait on it. */
  busy():boolean{return this.state==='loading'||(this.state==='on'&&!this.runtime.idle);}
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
        }else if(this.options.storeOnly){
          throw new HdRefusal('the HD pack is not installed (add it in Home > Experiments > Mods)');
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
   * PR #729's Codex P2 (matchMount.ts:900): the pack off (every original back) and its decoders closed -- the lazy
   * `HdMenuDecoder`'s worker terminated -- for a page's pack that ends with its page's world (the match's teardown,
   * `PackApplier.dispose`). A later `setEnabled(true)` still works: the next payload starts the decoder again.
   */
  async dispose():Promise<void>{await this.setEnabled(false);this.closeDecoders?.();}
  /** A served file (`servedBytes`): `cache` 'no-store' for the pointer, 'default' for what its hash names. */
  private bytes(url:string,max:number,signal:AbortSignal,cache:RequestCache='no-store'):Promise<Uint8Array>{
    return servedBytes(this.fetcher,url,max,signal,cache,name=>new HdRefusal(`${name} is missing`));
  }
  private async load(e:HdEntry):Promise<Rgba>{
    const id=this.id,signal=this.abort?.signal;if(!id||!signal)throw new Error('the pack is off');
    // A payload is at most its decoded size plus a DDS header (an uncompressed one), usually far less. Served gzipped
    // (HD.R8, gzip_static), its declared length is the compressed one, which on near-random data runs a little over the
    // file (gzip's worst case is about 0.03% plus 18 bytes): the bound leaves 0.2% plus 1 KiB (`payloadBound`).
    const max=payloadBound(e.bytes);
    let bytes:Uint8Array;
    if(this.imported){
      const b=await this.store!.file(e.file);if(!b)throw new Error(`${e.file} is not in the imported pack`);
      if(b.length>e.bytes+1024)throw new Error(`${e.file} is over its entry's size`);bytes=b;
    }else bytes=await this.bytes(`${HD_ROOT}${id}/${e.file}`,max,signal,'default');
    // WM-PACK-2 RUNTIME: a KTX2 is decoded for the same check (size, sha256, alpha) and carries its blocks beside it.
    if(e.format==='ktx2')return this.decodeKtx2(bytes,{width:e.outWidth,height:e.outHeight});
    return e.format==='dds'?this.decodeDds(bytes,{width:e.outWidth,height:e.outHeight}):this.decodePng(bytes,HD_LIMITS.outputEdge);
  }
}

/**
 * B-48 (b) review F1 (privacy): the decoder's failure for the report as a fixed code -- `nostart` (the worker did not
 * start), `failed` (it failed while running), `other` -- never the error's own text, which can carry a script URL or a path.
 */
function failureCode(failure:string|null):string|null{
  if(!failure)return null;
  if(failure.startsWith('the decode worker did not start'))return 'nostart';
  if(failure.startsWith('the decode worker failed'))return 'failed';
  return 'other';
}
