// @vitest-environment node
import {describe,expect,it} from 'vitest';
import type {Rgba} from '@s2u/gs';
import {reverseRows} from '../src/hdTexturePack';
import {decodePngAsync} from '../src/png';
import {answerHdDecode,serveHdDecode,type HdDecodeReply,type HdDecodeRequest,type HdDecodeServePort} from '../src/hdMenuDecodeWorker';
import {HdMenuDecoder,pageHdDecodeWorker,type HdDecodeWorkerPort} from '../src/hdMenuTextures';
import {encodePng} from '../../../tools/png';

/**
 * GM-13b (plan 2026-11-01-gpu-menus, row GM-13b): the menus' HD decode off the main thread -- `decodePngAsync` and
 * `reverseRows` in `../src/hdMenuDecodeWorker.ts`, and where no worker starts, on the main thread spread under
 * `HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION`. PRODUCT TRACK, a browser adaptation: the bytes are today's, byte for byte.
 * The worker here is an in-process fake that runs the worker module's own `answerHdDecode` behind `structuredClone` with
 * the transfer list (a transferred buffer is detached, as a browser's postMessage leaves it). Unit tests only.
 */

/** Payloads of odd and even sizes, every alpha (0, the PS2's 0x80, opaque, and a ramp). */
const PAYLOADS:[string,number,number,(i:number)=>number][]=[
  ['1x1 opaque',1,1,()=>255],
  ['3x5 alpha ramp',3,5,(i)=>(i*17)&255],
  ['7x2 transparent',7,2,()=>0],
  ['13x9 PS2 alpha 0x80',13,9,()=>128],
  ['64x33 mixed',64,33,(i)=>[0,64,128,200,255][i%5]!],
];
const image=(w:number,h:number,alpha:(i:number)=>number,seed=1):Rgba=>{
  const data=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++)data.set([(i*37+seed)&255,(i*91+seed*3)&255,(i*13+seed*7)&255,alpha(i)],i*4);
  return {width:w,height:h,data};
};
const bytesOf=(r:Rgba)=>[r.width,r.height,Buffer.from(r.data.buffer,r.data.byteOffset,r.data.byteLength).toString('hex')];

/** A worker running the module's own answer in this process, each message cloned with its transfer list. */
function fakeWorker(opts:{failAfter?:number}={}){
  let posted=0;
  const port:HdDecodeWorkerPort&{terminated:boolean;requests:HdDecodeRequest['op'][]}={
    onmessage:null,onerror:null,terminated:false,requests:[],
    postMessage(m:HdDecodeRequest,transfer:Transferable[]=[]){
      const msg=structuredClone(m,{transfer:transfer as Transferable[]}) as HdDecodeRequest;
      port.requests.push(msg.op);
      if(opts.failAfter!==undefined&&posted++>=opts.failAfter){setTimeout(()=>port.onerror?.(new Error('the worker died')),0);return;}
      setTimeout(()=>{void answerHdDecode(msg).then(({reply,transfer:t})=>{
        if(port.terminated)return;
        port.onmessage?.({data:structuredClone(reply,{transfer:t}) as HdDecodeReply});
      });},0);
    },
    terminate(){port.terminated=true;},
  };
  return port;
}
const frames=()=>{const f:{n:number;next:()=>Promise<void>}={n:0,next:async()=>{f.n++;await new Promise<void>(r=>setTimeout(r,0));}};return f;};

describe('GM-13b: the worker\'s answers are today\'s main-thread bytes',()=>{
  it.each(PAYLOADS)('%s: decode, then the rows turned, byte for byte',async(_n,w,h,alpha)=>{
    const png=encodePng(w,h,image(w,h,alpha).data);
    const main=await decodePngAsync(png,8192),mainTurned=reverseRows(main);
    const worker=fakeWorker(),d=new HdMenuDecoder(()=>worker,frames().next);
    const got=await d.png(png.slice(),8192);
    expect(d.mode).toBe('worker');
    expect(bytesOf(got)).toEqual(bytesOf(main));
    const input=new Uint8ClampedArray(got.data);
    const turned=await d.turn(got);
    expect(bytesOf(turned)).toEqual(bytesOf(mainTurned));
    expect(bytesOf(turned)).toEqual(bytesOf(reverseRows({width:w,height:h,data:input})));
    expect(got.data.byteLength,'the turn transfers its input to the worker, never copies it').toBe(0);
    expect(worker.requests).toEqual(['png','turn']);
    d.close();expect(worker.terminated).toBe(true);
  });
  it('a bad payload answers the decoder\'s own message',async()=>{
    const d=new HdMenuDecoder(()=>fakeWorker(),frames().next);
    const bad=encodePng(3,3,image(3,3,()=>255).data);bad[bad.length-20]=bad[bad.length-20]!^0xff;     // the IDAT's last bytes: a bad CRC
    const main=await decodePngAsync(bad,8192).then(()=>'ok',(e:Error)=>e.message);
    expect(main).toMatch(/^PNG: /);
    await expect(d.png(bad,8192)).rejects.toThrow(main);
  });
  it('review F3: an answer that will not post is answered ok:false for its id, so the page never waits on it',async()=>{
    const posted:HdDecodeReply[]=[];let first=true;
    const port:HdDecodeServePort={onmessage:null,postMessage(m){if(first){first=false;throw new DOMException('could not clone the answer','DataCloneError');}posted.push(m);}};
    serveHdDecode(port);
    port.onmessage!({data:{id:3,op:'turn',width:1,height:1,data:new Uint8ClampedArray(4)}});
    await expect.poll(()=>posted.length).toBe(1);
    expect(posted[0]).toMatchObject({id:3,ok:false});
    expect((posted[0] as {error:string}).error).toMatch(/could not clone the answer/);
  });
  it('the module answers nothing it does not know, and transfers each answer\'s pixels',async()=>{
    const r=image(3,2,()=>9);
    const {reply,transfer}=await answerHdDecode({id:7,op:'turn',width:3,height:2,data:r.data});
    expect(reply.ok).toBe(true);expect(reply.id).toBe(7);
    expect(transfer).toEqual([(reply as {data:Uint8ClampedArray}).data.buffer]);
    const odd=await answerHdDecode({id:8,op:'nope'} as unknown as HdDecodeRequest);
    expect(odd.reply).toMatchObject({id:8,ok:false});expect(odd.transfer).toEqual([]);
  });
});

describe('GM-13b: where no worker starts, the main thread decodes, spread across frames',()=>{
  it('no Worker in this environment (node): the page\'s factory answers null, and the decoder runs on the main thread',async()=>{
    expect(pageHdDecodeWorker()).toBeNull();
    const d=new HdMenuDecoder(pageHdDecodeWorker,frames().next);
    const [,w,h,alpha]=PAYLOADS[3]!,png=encodePng(w,h,image(w,h,alpha).data);
    const got=await d.png(png,8192);
    expect(d.mode).toBe('main');
    expect(bytesOf(got)).toEqual(bytesOf(await decodePngAsync(png,8192)));
  });
  it('a worker that throws as it starts: main, the failure named, the bytes today\'s',async()=>{
    const d=new HdMenuDecoder(()=>{throw new Error('blocked by the page\'s policy');},frames().next);
    const [,w,h,alpha]=PAYLOADS[1]!,png=encodePng(w,h,image(w,h,alpha).data);
    const got=await d.png(png,8192);
    expect(d.mode).toBe('main');expect(d.failure).toMatch(/blocked by the page's policy/);
    expect(bytesOf(got)).toEqual(bytesOf(await decodePngAsync(png,8192)));
    const t=await d.turn(got);
    expect(bytesOf(t)).toEqual(bytesOf(reverseRows(await decodePngAsync(png,8192))));
  });
  it('a worker that dies: its waiting decodes finish on the main thread (their bytes were copied in), later ones too',async()=>{
    const worker=fakeWorker({failAfter:0}),d=new HdMenuDecoder(()=>worker,frames().next);
    const pngs=PAYLOADS.map(([,w,h,a])=>encodePng(w,h,image(w,h,a).data));
    const got=await Promise.all(pngs.map(p=>d.png(p,8192)));
    expect(d.mode).toBe('main');expect(d.failure).toMatch(/the worker died/);
    for(const [i,p] of pngs.entries())expect(bytesOf(got[i]!)).toEqual(bytesOf(await decodePngAsync(p,8192)));
    expect(worker.terminated).toBe(true);
  });
  it('the main-thread turn copies at most HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION a frame (here 3 rows), byte for byte',async()=>{
    const f=frames(),r=image(5,11,(i)=>i&255),row=5*4;
    const d=new HdMenuDecoder(()=>null,f.next,3*row);
    const want=bytesOf(reverseRows(r));
    const t=await d.turn(r);
    expect(bytesOf(t)).toEqual(want);
    expect(f.n,'11 rows at 3 a frame: 4 slices, a frame between each').toBe(3);
    expect(bytesOf(r)[2],'the main-thread turn leaves its input whole').toBe(Buffer.from(image(5,11,(i)=>i&255).data).toString('hex'));
  });
  it('review F4: a turn queued after a main-thread decode waits a frame before its first slice; a turn alone does not',async()=>{
    const f=frames(),d=new HdMenuDecoder(()=>null,f.next);
    await d.turn(image(4,4,()=>1));
    expect(f.n,'a turn with no decode before it: its first slice at once').toBe(0);
    await Promise.all([d.png(encodePng(2,2,image(2,2,()=>255).data),8192),d.turn(image(4,4,()=>1))]);
    expect(f.n,'the decode\'s frame, then the turn\'s own').toBe(2);
  });
  it('review F2: the fall to the main thread is said once, with why (a worker that dies under five waiting decodes)',async()=>{
    const said:string[]=[],d=new HdMenuDecoder(()=>fakeWorker({failAfter:0}),frames().next,undefined,(why)=>said.push(why));
    await Promise.all(PAYLOADS.map(([,w,h,a])=>d.png(encodePng(w,h,image(w,h,a).data),8192)));
    expect(said).toEqual([d.failure]);expect(said[0]).toMatch(/the worker died/);
    const none:string[]=[],n=new HdMenuDecoder(()=>null,frames().next,undefined,(why)=>none.push(why));
    await n.png(encodePng(2,2,image(2,2,()=>255).data),8192);await n.png(encodePng(2,2,image(2,2,()=>255).data),8192);
    expect(none).toHaveLength(1);expect(none[0]).toMatch(/no Worker/);
  });
  it('main-thread decodes run one at a time, a frame apart',async()=>{
    const f=frames(),d=new HdMenuDecoder(()=>null,f.next);
    const pngs=PAYLOADS.map(([,w,h,a])=>encodePng(w,h,image(w,h,a).data));
    await Promise.all(pngs.map(p=>d.png(p,8192)));
    expect(f.n).toBeGreaterThanOrEqual(pngs.length);
  });
  it('a closed decoder starts again on its next request',async()=>{
    const made:ReturnType<typeof fakeWorker>[]=[],d=new HdMenuDecoder(()=>{const w=fakeWorker();made.push(w);return w;},frames().next);
    const png=encodePng(2,2,image(2,2,()=>255).data);
    await d.png(png,8192);d.close();
    expect(made[0]!.terminated).toBe(true);
    await d.png(png,8192);
    expect(made).toHaveLength(2);expect(d.mode).toBe('worker');
  });
  it('a request waiting when the decoder closes is refused, never answered late',async()=>{
    const d=new HdMenuDecoder(()=>fakeWorker(),frames().next);
    const p=d.png(encodePng(2,2,image(2,2,()=>255).data),8192);
    d.close();
    await expect(p).rejects.toThrow(/closed/);
  });
});
