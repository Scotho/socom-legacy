import type {Rgba} from '@s2u/gs';
import {decodeDds} from './dds';
import {fullAlpha,reverseRows} from './hdTexturePack';
import {decodePngAsync} from './png';
import {sha256} from './texturePack';

/**
 * GM-13b (plan `docs/plans/2026-11-01-gpu-menus.md`, row GM-13b): the menus' HD decode off the page's main thread. A
 * module worker the page starts with `new Worker(new URL('./hdMenuDecodeWorker.ts', import.meta.url), { type: 'module'
 * })` (`./hdMenuTextures` `pageHdDecodeWorker`), as `./discExtractWorker.ts` is, so a build bundles it. PRODUCT TRACK, a
 * browser adaptation: it runs the page's own `decodePngAsync`, `decodeDds`, `sha256`, `reverseRows` and `fullAlpha` -- the
 * same functions, so the same bytes -- on another thread; it decides nothing about what is decoded or drawn.
 *
 * Four requests (GM-13d added `dds` and `alpha`, plan row GM-13d; the same functions, `decodeDds` and `fullAlpha`):
 * - `png` and `dds` (a payload's bytes, copied in: the page keeps them for its main-thread fallback) answer the decode
 *   (`decodePngAsync`; `decodeDds` at the entry's declared size) with the decoded RGBA's key -- `texturePack.ts`
 *   `sha256` over the same bytes, HD.R3's key -- which the page seeds as `hdKeyOf`'s memo (`seedHdKey`), so the pack's
 *   check of the payload hashes nothing on the main thread;
 * - `turn` (a replacement's pixels, transferred in) answers them with their rows reversed;
 * - `alpha` (a whole replacement's pixels, transferred in) answers `fullAlpha`'s rescaled copy.
 * Every answer's pixels are transferred back, never copied. A failure answers `ok: false` with the error's own message
 * (`PNG: ...`, `DDS: ...`).
 */
export type HdDecodeRequest =
  | {id:number;op:'png';bytes:Uint8Array;maxEdge:number}
  | {id:number;op:'dds';bytes:Uint8Array;width:number;height:number}
  | {id:number;op:'turn';width:number;height:number;data:Uint8ClampedArray}
  | {id:number;op:'alpha';width:number;height:number;data:Uint8ClampedArray};
export type HdDecodeReply =
  | {id:number;ok:true;width:number;height:number;data:Uint8ClampedArray;key?:string}
  | {id:number;ok:false;error:string};

/** One request's answer, and what to transfer with it (the answer's pixel buffer). */
export async function answerHdDecode(req:HdDecodeRequest):Promise<{reply:HdDecodeReply;transfer:ArrayBuffer[]}>{
  try{
    let r:Rgba,keyed=false;
    if(req.op==='png'){r=await decodePngAsync(req.bytes,req.maxEdge);keyed=true;}
    else if(req.op==='dds'){r=decodeDds(req.bytes,{width:req.width,height:req.height});keyed=true;}
    else if(req.op==='turn')r=reverseRows({width:req.width,height:req.height,data:req.data});
    else if(req.op==='alpha')r={width:req.width,height:req.height,data:fullAlpha(req.data)};
    else throw new Error(`hdMenuDecodeWorker: unknown request ${String((req as {op?:unknown}).op)}`);
    const data=r.data as Uint8ClampedArray;
    const key=keyed?await sha256(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)):undefined;
    return {reply:{id:req.id,ok:true,width:r.width,height:r.height,data,...(key?{key}:{})},transfer:[data.buffer as ArrayBuffer]};
  }catch(e){
    return {reply:{id:req.id,ok:false,error:e instanceof Error?e.message:String(e)},transfer:[]};
  }
}

/** The worker's side of the channel: each request answered in its turn. */
export interface HdDecodeServePort {
  onmessage:((e:{data:HdDecodeRequest})=>void)|null;
  postMessage(m:HdDecodeReply,transfer:Transferable[]):void;
}
export function serveHdDecode(port:HdDecodeServePort):void{
  port.onmessage=(e)=>{void answerHdDecode(e.data).then(({reply,transfer})=>{
    // Review F3: an answer that will not post still answers its id, so the page's request (and its budget slot) never waits.
    try{port.postMessage(reply,transfer);}
    catch(x){
      try{port.postMessage({id:reply.id,ok:false,error:`hdMenuDecodeWorker: the answer would not post (${x instanceof Error?x.message:String(x)})`},[]);}
      catch{/* the channel itself is gone: the page's worker error moves its requests to the main thread */}
    }
  });};
}

// Served only when this module is the worker (a page or a test importing it for its types and functions starts nothing).
const scope=globalThis as unknown as {WorkerGlobalScope?:abstract new()=>unknown};
if(typeof scope.WorkerGlobalScope==='function'&&globalThis instanceof scope.WorkerGlobalScope)serveHdDecode(globalThis as unknown as HdDecodeServePort);
