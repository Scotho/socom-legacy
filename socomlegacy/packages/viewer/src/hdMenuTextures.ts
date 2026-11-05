import type {Rgba} from '@s2u/gs';
import {HdTextureRegistry,hdKeyOf,reverseRows,type HdManifest} from './hdTexturePack';
import type {HdDecodeReply,HdDecodeRequest} from './hdMenuDecodeWorker';
import {HdServedPack} from './hdTexturePackServed';
import {pageHdStore} from './hdTexturePackStore';
import {HD_MENU_SCALE_LIMIT,UiQuadRasterCache,type UiHdTextures} from './uiCompositorView';
import {UiGpuLoadBudget,hdLoadBytes} from './uiGpuLoadBudget';
import {HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION} from './uiGpuTextures';
import {decodePngAsync} from './png';

/**
 * HD-3 (OT.R92, HD.R8; plan 2026-10-31-hd-texture-pack-parity): the menus under HD (GoE Soul) -- a browser adaptation,
 * off unless the HD pack is on, changing only the texels the menus' CPU compositor samples and the resolution it draws
 * at, never what the menus do or where anything sits. The menus have no DataTexture for the pack's runtime to swap, so
 * each bitmap the compositor samples is looked up here: its HD image when the pack names it, at its own larger size.
 */

/**
 * The menus' scale from the pack: the commonest whole, square ratio of a replacement to its source over the manifest
 * (SOCOM II HD Textures: 3193 of 3392 entries are 4x), capped by `HD_MENU_SCALE_LIMIT` (4: a 2560 x 1792 frame, the
 * software raster's budget); 1 when no entry is a whole square ratio.
 */
export function hdMenuScale(m:Pick<HdManifest,'entries'>):number{
  const n=new Map<number,number>();
  for(const e of m.entries){
    // HD.R9: a placement's composite is its target at the placement's scale; its image's size says nothing of it.
    const p=e.placements?.[0],r=p?p.src[2]/p.dst[2]:e.outWidth/e.width;
    if(Number.isInteger(r)&&r>1&&(p||e.outHeight===e.height*r))n.set(r,(n.get(r)??0)+1);
  }
  let best=1,count=0;
  for(const [r,c] of n)if(c>count||(c===count&&r<best)){best=r;count=c;}
  return Math.min(best,HD_MENU_SCALE_LIMIT);
}

/** Browser budget, not a game value: the decoded HD images the menus keep (a 512 x 512 background is 16 MiB at 4x). */
export const HD_MENU_BYTES=384*1024*1024;
/**
 * Browser budget, not a game value: the quad cache the menus draw with while the pack is on. At 4x a full-frame
 * background's samples are 2560 x 1792 x 32 bytes (147 MiB), past the default 32 MiB cache, and re-sampling it every
 * frame doubled the frame's time (measured in Node: 169 ms against 87 ms for a background, six panels and 200 glyphs).
 */
export const HD_MENU_QUAD_CACHE_BYTES=384*1024*1024;

/**
 * The runtime's `replacement`: a bitmap's whole replacement, or (HD.R9) its placements composited over it as the
 * compositor samples it (`HD_UI_SAMPLING`, the runtime's default) -- one lookup for both.
 * GM-13b: a replacement's pixels are the lookup's to hand over (its decoder transfers them to the worker to turn them);
 * `HdPackRuntime.replacement` answers a new array each time (`fullAlpha`'s copy, or HD.R9's fresh composite), shared
 * with nothing.
 */
export interface HdReplacer {replacement(src:Rgba):Promise<Rgba|null>}

/**
 * GM-13 (agent/hd-subrect review F3): the replacement loads' byte budget -- each `replacement()` admitted under
 * `budget` with `cost(key)` bytes (`hdLoadBytes`: the key's payloads, their copies and its composite at their peak;
 * GM-13c: one payload at a time, so its largest).
 */
export interface HdMenuLoads {budget:UiGpuLoadBudget;cost(key:string):number}

/** GM-13b: the decode worker's side of the page (a `Worker`; a test passes a fake). */
export interface HdDecodeWorkerPort {
  onmessage:((e:{data:HdDecodeReply})=>void)|null;
  onerror:((e:unknown)=>void)|null;
  onmessageerror?:((e:unknown)=>void)|null;
  postMessage(m:HdDecodeRequest,transfer:Transferable[]):void;
  terminate():void;
}
/** The page's decode worker (`./hdMenuDecodeWorker.ts`, bundled by the build); null where there is no `Worker` (node). */
export function pageHdDecodeWorker():HdDecodeWorkerPort|null{
  if(typeof Worker==='undefined')return null;
  return new Worker(new URL('./hdMenuDecodeWorker.ts',import.meta.url),{type:'module'}) as unknown as HdDecodeWorkerPort;
}
/** The next animation frame, then a task after it (so work resumed here runs after that frame is drawn). */
const pageNextFrame=():Promise<void>=>new Promise<void>((r)=>{
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(r,0));else setTimeout(r,0);
});
const words=(e:unknown):string=>e instanceof Error?e.message:typeof (e as {message?:unknown})?.message==='string'?(e as {message:string}).message:String(e);
const closedError=():Error=>new Error('HdMenuDecoder: closed');
type Waiting={resolve:(r:Rgba)=>void;reject:(e:Error)=>void;req:HdDecodeRequest};

/**
 * GM-13b (plan 2026-11-01-gpu-menus, row GM-13b): the menus' HD decode off the page's main thread. PRODUCT TRACK, a
 * browser adaptation: the same `decodePngAsync` and `reverseRows`, so the same bytes, run where they cost the menus'
 * frames nothing -- in `./hdMenuDecodeWorker.ts` (started at the first request); where no worker starts (no `Worker`,
 * a failed start) or the worker fails, on the main thread, one request at a time and spread across frames: each
 * decode in a frame of its own, a turn copying at most `HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION` bytes of rows a frame
 * (its first slice a frame after a decode that ran before it, review F4). Meanwhile the lookup answers null and the
 * menus draw today's frame. The fall to the main thread is said once to `onFailure` (the page's `[hd] menus:` line).
 * Still on the main thread whichever way (review F5): the pack runtime's checks of each payload -- its sha256 (a copy
 * of the payload, `texturePack.ts` `sha256`) and its alpha rescale (`fullAlpha`) -- in `HdPackRuntime`, shared with
 * the match's pack.
 * - `png`: the bytes are copied to the worker, never transferred, so a decode waiting when the worker fails is done on
 *   the main thread instead.
 * - `turn`: the image's pixels are transferred to the worker (their buffer is detached: the caller hands the image
 *   over) and the turned pixels transferred back -- no copy of a 64 MiB image on the main thread. An image whose pixels
 *   are a view into a larger buffer is turned on the main thread. A turn waiting when the worker fails is refused (its
 *   pixels are gone with the worker): the lookup answers null for that bitmap.
 * - `close`: the worker ended, every request waiting refused; the next request starts a worker again.
 */
export class HdMenuDecoder {
  private worker:HdDecodeWorkerPort|null=null;
  private state:'idle'|'worker'|'main'='idle';
  private why:string|null=null;
  private next=1;
  private waiting=new Map<number,Waiting>();
  private generation=0;
  private queue:Promise<void>=Promise.resolve();
  /** The last main-thread work was a decode: the next turn's first slice waits a frame (review F4). */
  private afterDecode=false;
  /** `onFailure`: told why, once each time the requests fall to the main thread (a failed start, the worker's error). */
  constructor(private make:()=>HdDecodeWorkerPort|null=pageHdDecodeWorker,private nextFrame:()=>Promise<void>=pageNextFrame,
    readonly perFrame:number=HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION,private onFailure:(why:string)=>void=()=>undefined){ }
  /** Where the requests run: not started yet, the worker, or the main thread (`failure` says why). */
  get mode():'idle'|'worker'|'main'{return this.state;}
  /** Why the main thread decodes (no `Worker`, a failed start, the worker's error); null otherwise. */
  get failure():string|null{return this.why;}
  /** A PNG payload decoded (`decodePngAsync`); an arrow, so the menus' pack takes it as its decode (`HdPngDecode`). */
  readonly png=(bytes:Uint8Array,maxEdge:number):Promise<Rgba>=>{
    const w=this.start();
    return w?this.ask(w,{id:this.next++,op:'png',bytes,maxEdge},[]):this.onMain(()=>decodePngAsync(bytes,maxEdge),true);
  };
  /** `r` with its rows reversed (`reverseRows`); `r`'s pixels are handed over (transferred to the worker). */
  turn(r:Rgba):Promise<Rgba>{
    const data=r.data as Uint8ClampedArray,buffer=data.buffer;
    const whole=buffer instanceof ArrayBuffer&&data.byteOffset===0&&data.byteLength===buffer.byteLength;
    const w=whole?this.start():null;
    return w?this.ask(w,{id:this.next++,op:'turn',width:r.width,height:r.height,data},[buffer as ArrayBuffer]):this.onMain((g)=>this.turnSpread(r,g),false);
  }
  /** The worker ended and every request waiting refused; the next request starts again. */
  close():void{
    this.generation++;
    this.worker?.terminate();this.worker=null;this.state='idle';this.why=null;
    const left=[...this.waiting.values()];this.waiting.clear();
    for(const p of left)p.reject(closedError());
  }
  private start():HdDecodeWorkerPort|null{
    if(this.state==='worker')return this.worker;
    if(this.state==='main')return null;
    let w:HdDecodeWorkerPort|null=null;
    try{w=this.make();}catch(e){this.why=`the decode worker did not start: ${words(e)}`;}
    if(!w){this.state='main';this.why??='no Worker here';this.onFailure(this.why);return null;}
    const started=w;
    started.onmessage=this.reply;started.onerror=(e)=>this.fail(started,e);started.onmessageerror=(e)=>this.fail(started,e);
    this.worker=started;this.state='worker';return started;
  }
  private ask(w:HdDecodeWorkerPort,req:HdDecodeRequest,transfer:Transferable[]):Promise<Rgba>{
    return new Promise<Rgba>((resolve,reject)=>{
      this.waiting.set(req.id,{resolve,reject,req});
      try{w.postMessage(req,transfer);}catch(e){this.fail(w,e);}
    });
  }
  private reply=(e:{data:HdDecodeReply}):void=>{
    const m=e.data,p=this.waiting.get(m.id);if(!p)return;
    this.waiting.delete(m.id);
    if(m.ok)p.resolve({width:m.width,height:m.height,data:m.data});else p.reject(new Error(m.error));
  };
  /** The worker failed: the main thread from now on (until `close`); the requests waiting redone there where they can be. */
  private fail(w:HdDecodeWorkerPort,e:unknown):void{
    if(this.worker!==w)return;
    this.why=`the decode worker failed: ${words(e)}`;
    w.terminate();this.worker=null;this.state='main';this.onFailure(this.why);
    const left=[...this.waiting.values()];this.waiting.clear();
    for(const {req:q,resolve,reject} of left){
      if(q.op==='png')this.onMain(()=>decodePngAsync(q.bytes,q.maxEdge),true).then(resolve,reject);
      else if(q.data.byteLength)this.onMain((g)=>this.turnSpread({width:q.width,height:q.height,data:q.data},g),false).then(resolve,reject);
      else reject(new Error(`HdMenuDecoder: ${this.why}, holding the image to turn`));
    }
  }
  /**
   * Main-thread work, one at a time. `decode` (a PNG decode): a frame first, so a decode is never in the frame that asked
   * nor in the last decode's. A turn waits a frame first only after a decode (review F4): its first slice is never in a
   * decode's frame; a turn after a turn starts at once (the last slice of the one before was itself a frame's).
   */
  private onMain<T>(work:(generation:number)=>Promise<T>|T,decode:boolean):Promise<T>{
    const g=this.generation;
    const run=this.queue.then(async()=>{
      if(decode||this.afterDecode)await this.nextFrame();
      this.afterDecode=decode;
      if(g!==this.generation)throw closedError();
      const out=await work(g);
      if(g!==this.generation)throw closedError();
      return out;
    });
    this.queue=run.then(()=>undefined,()=>undefined);
    return run;
  }
  /** `reverseRows`' own copy, row for row, at most `perFrame` bytes of rows between frames. */
  private async turnSpread(r:Rgba,g:number):Promise<Rgba>{
    const row=r.width*4,out=new Uint8ClampedArray(r.data.length),per=Math.max(1,Math.floor(this.perFrame/row));
    for(let y=0;y<r.height;y+=per){
      if(y){await this.nextFrame();if(g!==this.generation)throw closedError();}
      for(let k=y,end=Math.min(r.height,y+per);k<end;k++)out.set(r.data.subarray(k*row,(k+1)*row),(r.height-1-k)*row);
    }
    return {width:r.width,height:r.height,data:out};
  }
}

let packs=0;

/**
 * The lookup the compositor takes (`RasterOptions.hd`). A bitmap is the page's top-row-first copy of a decode
 * (`./frontEndAssets`, `./armoryData`: `flipRows`); the pack is keyed by the decode as stored (HD.R3), so the bitmap's
 * rows are turned back to ask and the answer is turned top row first (`reverseRows`, as the registry does for a
 * `rowsReversed` texture). Keyed by the bytes, never by where the bitmap came from (a worker's copy keys alike). The
 * first ask starts the load and answers null (the original draws meanwhile). Each replacement is kept once, by the
 * pack's key, and counted once against the budget (review F2): a bank read again -- new objects, the same bytes --
 * takes the kept image, nothing fetched or counted again. The per-object memo only saves the hash.
 */
export class HdMenuTextures {
  private got=new WeakMap<Rgba,Rgba|null>();
  private kept=new Map<string,Rgba>();
  // GM-14a: by the kept image's pixel array -- the planner hands the GPU a copy of the image object over the same array
  // (`pickBitmap`, `uiRasterRules.ts`), so an object key would never match it there.
  private keys=new WeakMap<Rgba['data'],string>();
  /** GM-13: this lookup's pack, a new number for each lookup made (each time the pack is turned on): the GPU cache's. */
  readonly pack=++packs;
  private loading=new Map<string,Promise<Rgba|null>>();
  private pending=new Set<Promise<void>>();
  private bytes=0;
  private answers=0;
  /** GM-13 review F2: aborted by `close` -- the loads still waiting under the budget leave its queue unrun. */
  private ctl=new AbortController();
  /**
   * `changed`: a replacement kept (the status line's count). `decoder` (GM-13b): the replacement's turn runs there (the
   * worker, else the main thread spread); null turns it here at once, as before.
   */
  constructor(private source:HdReplacer,readonly budget=HD_MENU_BYTES,private changed:()=>void=()=>undefined,private loads:HdMenuLoads|null=null,
    private decoder:HdMenuDecoder|null=null){ }
  /** How many of the pack's entries the menus hold. */
  get replaced():number{return this.kept.size;}
  /** HD-4 review F1: moves each time a bitmap's answer changes (null to its HD image), so a drawer can tell a frame is stale. */
  get version():number{return this.answers;}
  /** GM-13 review F2: this lookup replaced (HD off, a new pack, a new generation): nothing new starts or is kept. */
  get closed():boolean{return this.ctl.signal.aborted;}
  /**
   * GM-13 review F2: let this lookup go. Its loads waiting under the budget are dropped unrun (no `replacement()`, no
   * decode memory held); one already running settles, and its answer is thrown away, never kept or counted.
   */
  close():void{this.ctl.abort();}
  /**
   * GM-13: a kept replacement's key for the GPU texture cache, `hd|<pack>|<the pack's key>` (`hdKeyOf`); null otherwise.
   * GM-14a: matched by the image's pixel array, so the planner's copy of a kept image (`pickBitmap`) keys alike.
   */
  gpuKeyOf(image:Rgba):string|null{const k=this.keys.get(image.data);return k===undefined?null:`hd|${this.pack}|${k}`;}
  readonly lookup:UiHdTextures=(bitmap)=>{
    const hit=this.got.get(bitmap);if(hit!==undefined)return hit;
    if(this.closed)return null;
    this.got.set(bitmap,null);
    const turned=reverseRows(bitmap);
    const p=hdKeyOf(turned).then(async(key)=>{
      let image=this.kept.get(key)??null;
      if(!image){
        let load=this.loading.get(key);
        if(!load){
          // GM-13b: the turn inside the load's budget slot (`hdLoadBytes` counts the turned copy). The bytes are counted
          // before the turn starts (a second load sees them) and given back if it is refused or the lookup closes meanwhile.
          const loads=this.loads,ask=async():Promise<Rgba|null>=>{
            const r=await this.source.replacement(turned);
            if(!r||this.closed||this.bytes+r.data.length>this.budget)return null;
            const n=r.data.length;this.bytes+=n;
            let t:Rgba;
            try{t=this.decoder?await this.decoder.turn(r):reverseRows(r);}catch{this.bytes-=n;return null;}
            if(this.closed){this.bytes-=n;return null;}
            this.kept.set(key,t);this.keys.set(t.data,key);this.changed();return t;
          };
          load=(loads?loads.budget.run(loads.cost(key),ask,this.ctl.signal):ask()).catch(()=>null).finally(()=>{this.loading.delete(key);});
          this.loading.set(key,load);
        }
        image=await load;
      }
      if(image&&!this.closed){this.got.set(bitmap,image);this.answers++;}
    }).catch(()=>undefined).finally(()=>{this.pending.delete(p);});
    this.pending.add(p);
    return null;
  };
  /** Every load asked so far has finished. */
  async settled():Promise<void>{while(this.pending.size)await Promise.all([...this.pending]);}
}

/**
 * The front end's switch: on, the pack (its own `HdServedPack`, over a registry that collects nothing -- the match's
 * DataTextures are the match's pack's) read, the scale taken from its manifest and the lookup made; off, the frame is
 * the original's (scale 1, no lookup) and nothing is fetched.
 */
export class HdMenus {
  private pack:HdServedPack|null=null;
  private textures:HdMenuTextures|null=null;
  private scale=1;
  private generation=0;
  private cache:UiQuadRasterCache|null=null;
  /**
   * `maxScale`: a lower cap than the pack's (the page's `?hdMenuScale=`, for a slower machine); a browser adaptation.
   * `decoder` (GM-13b): the menus' decode off the main thread, handed to `make` (the pack's PNG decode) and to each lookup
   * (the turn); ended when HD goes off. Null: today's main-thread decode.
   */
  constructor(private make:(decoder:HdMenuDecoder|null)=>HdServedPack,private maxScale=HD_MENU_SCALE_LIMIT,private decoder:HdMenuDecoder|null=null){ }
  options():{scale:number;hd?:UiHdTextures;quadCache?:UiQuadRasterCache;version?:number}{
    return this.textures&&this.cache?{scale:this.scale,hd:this.textures.lookup,quadCache:this.cache,version:this.textures.version}:{scale:1};
  }
  /**
   * GM-14a (GM-13 review F3): the lookup in use, for the GPU surface's texture cache -- its `pack`, `version` and
   * `gpuKeyOf` key a kept replacement by the pack's own key (`UiGpuHdKeys`), so the GPU never hashes an HD image; null
   * while HD is off (scale 1, no lookup).
   */
  keys():HdMenuTextures|null{return this.textures;}
  /** Every replacement asked so far has finished (a test's wait). */
  async settled():Promise<void>{await this.textures?.settled();}
  /** GM-13b review F2: where the menus' decode runs and why (the perf hook's `hd().decoder`); null without a decoder. */
  decoderMode():{mode:'idle'|'worker'|'main';failure:string|null}|null{
    return this.decoder?{mode:this.decoder.mode,failure:this.decoder.failure}:null;
  }
  /**
   * On or off. Scale 1 -- `?hdMenuScale=1`, or a pack with no whole ratio -- is the original menus: no lookup, nothing
   * fetched (review F3: a 4x image bilinear-shrunk to 1x by one sample is neither the original nor the pack's art).
   */
  async set(on:boolean):Promise<void>{
    const g=++this.generation;
    this.textures?.close();                          // GM-13 review F2: the replaced lookup's waiting loads dropped
    this.textures=null;this.scale=1;this.cache?.clear();this.cache=null;
    if(!on||Math.floor(this.maxScale)<2){
      this.pack?.setMenuCount(null);await this.pack?.setEnabled(false);
      this.decoder?.close();                         // GM-13b: after the pack's generation moved, so no refusal is a skip
      return;
    }
    this.pack??=this.make(this.decoder);
    await this.pack.setEnabled(true);
    const m=this.pack.manifest,pack=this.pack;
    if(g!==this.generation||!m)return;
    const scale=Math.min(hdMenuScale(m),Math.floor(this.maxScale));
    if(scale<2){await pack.setEnabled(false);return;}
    // GM-13: the loads under one byte budget (agent/hd-subrect review F3), each costed from the manifest (GM-13c: at
    // the placements' scale, the runtime's composite, whatever the menus' scale).
    const textures=new HdMenuTextures(pack.runtime,HD_MENU_BYTES,()=>{if(this.textures===textures)pack.setMenuCount(textures.replaced);},
      {budget:new UiGpuLoadBudget(),cost:(key)=>hdLoadBytes(m,key)},this.decoder);
    this.scale=scale;this.textures=textures;this.cache=new UiQuadRasterCache(HD_MENU_QUAD_CACHE_BYTES);
    pack.setMenuCount(0);
  }
}

/** A status line's state for the page's log: its numbers masked, but the menus' own count kept, so each change of it logs. */
export const menuStatusKey=(text:string):string=>text.replace(/\d+(?![\d ]*in the menus)/g,'#');

/**
 * The page's: the pack this browser imported, else the served one (as the match's, `./matchMount`); its status logged once
 * a state. GM-13b: its PNG payloads and its turns decoded off the main thread (`HdMenuDecoder`, its worker started at the
 * first request).
 */
export function pageHdMenus(maxScale=HD_MENU_SCALE_LIMIT,
  decoder:HdMenuDecoder|null=new HdMenuDecoder(pageHdDecodeWorker,undefined,undefined,(why)=>console.info(`[hd] menus: the decode runs on the main thread -- ${why}`))):HdMenus{
  let logged='';
  return new HdMenus((dec)=>new HdServedPack(undefined,(text)=>{const k=menuStatusKey(text);if(k!==logged){logged=k;console.info(`[hd] menus: ${text}`);}},
    new HdTextureRegistry(false),pageHdStore(),dec?.png),maxScale,decoder);
}

/** The page's `?hdMenuScale=1..4` (a browser adaptation for the test run): a lower cap on the menus' scale; absent, the pack's. */
export function parseHdMenuScale(search:string):number{
  const v=Number(new URLSearchParams(search).get('hdMenuScale'));
  return Number.isInteger(v)&&v>=1&&v<=HD_MENU_SCALE_LIMIT?v:HD_MENU_SCALE_LIMIT;
}
