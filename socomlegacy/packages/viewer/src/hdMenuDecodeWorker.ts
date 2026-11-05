import type {Rgba} from '@s2u/gs';
import {reverseRows} from './hdTexturePack';
import {decodePngAsync} from './png';

/**
 * GM-13b (plan `docs/plans/2026-11-01-gpu-menus.md`, row GM-13b): the menus' HD decode off the page's main thread. A
 * module worker the page starts with `new Worker(new URL('./hdMenuDecodeWorker.ts', import.meta.url), { type: 'module'
 * })` (`./hdMenuTextures` `pageHdDecodeWorker`), as `./discExtractWorker.ts` is, so a build bundles it. PRODUCT TRACK, a
 * browser adaptation: it runs the page's own `decodePngAsync` and `reverseRows` -- the same functions, so the same
 * bytes -- on another thread; it decides nothing about what is decoded or drawn.
 *
 * Two requests: `png` (a payload's bytes, copied in: the page keeps them for its main-thread fallback) answers the
 * decode; `turn` (a replacement's pixels, transferred in) answers them with their rows reversed. Every answer's pixels
 * are transferred back, never copied. A failure answers `ok: false` with the error's own message (`PNG: ...`).
 */
export type HdDecodeRequest =
  | {id:number;op:'png';bytes:Uint8Array;maxEdge:number}
  | {id:number;op:'turn';width:number;height:number;data:Uint8ClampedArray};
export type HdDecodeReply =
  | {id:number;ok:true;width:number;height:number;data:Uint8ClampedArray}
  | {id:number;ok:false;error:string};

/** One request's answer, and what to transfer with it (the answer's pixel buffer). */
export async function answerHdDecode(req:HdDecodeRequest):Promise<{reply:HdDecodeReply;transfer:ArrayBuffer[]}>{
  try{
    let r:Rgba;
    if(req.op==='png')r=await decodePngAsync(req.bytes,req.maxEdge);
    else if(req.op==='turn')r=reverseRows({width:req.width,height:req.height,data:req.data});
    else throw new Error(`hdMenuDecodeWorker: unknown request ${String((req as {op?:unknown}).op)}`);
    const data=r.data as Uint8ClampedArray;
    return {reply:{id:req.id,ok:true,width:r.width,height:r.height,data},transfer:[data.buffer as ArrayBuffer]};
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
