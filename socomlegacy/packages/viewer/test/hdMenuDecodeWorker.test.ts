// @vitest-environment node
import {describe,expect,it} from 'vitest';
import type {Rgba} from '@s2u/gs';
import {readFileSync} from 'node:fs';
import {fullAlpha,hdKeyOf,reverseRows} from '../src/hdTexturePack';
import {DdsError,decodeDds} from '../src/dds';
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

// GM-13d (plan 2026-11-01-gpu-menus, row GM-13d): the DDS decode, its key hash and the whole replacement's alpha rescale in
// the same worker. PRODUCT TRACK, a browser adaptation: `decodeDds`, `texturePack.ts` `sha256` and `fullAlpha` -- the same
// functions over the same bytes on another thread. The blocks are `test/dds.test.ts`'s fixtures (Pillow's decode of random
// blocks; no game data). Unit tests only.
const DDS_FIXTURE=JSON.parse(readFileSync(new URL('./dds.fixture.json',import.meta.url),'utf8')) as {kind:string;mode?:number;block:string;rgba:string}[];
const hexBytes=(s:string)=>Uint8Array.from(s.match(/../g)!.map(x=>parseInt(x,16)));
/** A DDS file of `blocks` in a row (as `test/dds.test.ts` builds it): legacy FourCC, or DX10 for BC7. */
function ddsFile(kind:string,blocks:Uint8Array[],w=4*blocks.length,h=4):Uint8Array{
  const head=new Uint8Array(kind==='bc7'?148:128),v=new DataView(head.buffer);
  head.set([0x44,0x44,0x53,0x20]);v.setUint32(4,124,true);v.setUint32(12,h,true);v.setUint32(16,w,true);v.setUint32(76,32,true);v.setUint32(80,4,true);
  const four=kind==='bc7'?'DX10':{bc1:'DXT1',bc2:'DXT3',bc3:'DXT5'}[kind]!;for(let i=0;i<4;i++)head[84+i]=four.charCodeAt(i);
  if(kind==='bc7')v.setUint32(128,98,true);
  const out=new Uint8Array(head.length+blocks.reduce((n,b)=>n+b.length,0));out.set(head);let at=head.length;for(const b of blocks){out.set(b,at);at+=b.length;}return out;
}
/** An uncompressed 32-bit RGBA DDS of `img`, alpha in the header. */
function rawDds(img:Rgba):Uint8Array{
  const b=new Uint8Array(128+img.data.length),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
  v.setUint32(4,124,true);v.setUint32(12,img.height,true);v.setUint32(16,img.width,true);v.setUint32(76,32,true);v.setUint32(80,0x41,true);v.setUint32(88,32,true);
  v.setUint32(92,0xff,true);v.setUint32(96,0xff00,true);v.setUint32(100,0xff0000,true);v.setUint32(104,0xff000000,true);b.set(img.data,128);return b;
}
const DDS_CASES:[string,Uint8Array][]=[
  ...['bc1','bc2','bc3','bc7'].map((k):[string,Uint8Array]=>[k,ddsFile(k,DDS_FIXTURE.filter(f=>f.kind===k).map(f=>hexBytes(f.block)))]),
  ['bc3 cropped 3x2',ddsFile('bc3',[hexBytes(DDS_FIXTURE.find(f=>f.kind==='bc3')!.block)],3,2)],
  ['rgba 13x9',rawDds(image(13,9,(i)=>(i*29)&255))],
];
const sizeOf=(b:Uint8Array)=>{const v=new DataView(b.buffer,b.byteOffset,b.byteLength);return {width:v.getUint32(16,true),height:v.getUint32(12,true)};};
/** The key of a copy of `r`'s pixels: hashed afresh, never a seeded memo. */
const freshKey=(r:Rgba)=>hdKeyOf({width:r.width,height:r.height,data:new Uint8ClampedArray(r.data)});

describe('GM-13d: the worker decodes DDS, byte for byte today\'s',()=>{
  it.each(DDS_CASES)('%s: answerHdDecode dds is decodeDds\'s bytes, its key the image\'s hdKeyOf',async(_n,file)=>{
    const size=sizeOf(file),main=decodeDds(file,size);
    const {reply,transfer}=await answerHdDecode({id:11,op:'dds',bytes:file.slice(),...size});
    expect(reply.ok).toBe(true);
    const got=reply as Extract<HdDecodeReply,{ok:true}>;
    expect(bytesOf(got)).toEqual(bytesOf(main));
    expect(transfer).toEqual([got.data.buffer]);
    expect(got.key).toBe(await freshKey(main));
  });
  it('a malformed DDS answers ok:false with the decoder\'s own DDS: message',async()=>{
    const bad=new Uint8Array(200);
    let main='ok';
    try{decodeDds(bad,{width:4,height:4});}catch(e){expect(e).toBeInstanceOf(DdsError);main=(e as Error).message;}
    expect(main).toMatch(/^DDS: /);
    const {reply,transfer}=await answerHdDecode({id:12,op:'dds',bytes:bad,width:4,height:4});
    expect(reply).toEqual({id:12,ok:false,error:main});expect(transfer).toEqual([]);
    const r2=await answerHdDecode({id:13,op:'dds',bytes:DDS_CASES[5]![1],width:4,height:4});
    expect(r2.reply).toEqual({id:13,ok:false,error:'DDS: size 13x9, the entry says 4x4'});
  });
  it.each(PAYLOADS)('%s: the alpha request is fullAlpha\'s bytes, its pixels transferred back',async(_n,w,h,alpha)=>{
    const r=image(w,h,alpha),want=fullAlpha(new Uint8ClampedArray(r.data));
    const {reply,transfer}=await answerHdDecode({id:14,op:'alpha',width:w,height:h,data:r.data});
    expect(reply.ok).toBe(true);
    expect(bytesOf(reply as Extract<HdDecodeReply,{ok:true}>)).toEqual(bytesOf({width:w,height:h,data:want}));
    expect(transfer).toEqual([(reply as {data:Uint8ClampedArray}).data.buffer]);
  });
  it('a PNG answer carries its key too',async()=>{
    const [,w,h,alpha]=PAYLOADS[2]!,png=encodePng(w,h,image(w,h,alpha).data),main=await decodePngAsync(png,8192);
    const {reply}=await answerHdDecode({id:15,op:'png',bytes:png,maxEdge:8192});
    expect((reply as {key?:string}).key).toBe(await freshKey(main));
  });
});

describe('GM-13d: HdMenuDecoder.dds and .alpha, the worker or the main thread',()=>{
  it.each(DDS_CASES)('%s: dds goes to the worker (bytes copied in), today\'s bytes',async(_n,file)=>{
    const size=sizeOf(file),main=decodeDds(file,size);
    const worker=fakeWorker(),d=new HdMenuDecoder(()=>worker,frames().next);
    const got=await d.dds(file,size);
    expect(d.mode).toBe('worker');expect(worker.requests).toEqual(['dds']);
    expect(bytesOf(got)).toEqual(bytesOf(main));
    expect(file.byteLength,'the payload\'s bytes are copied, never transferred').toBeGreaterThan(0);
    expect(await hdKeyOf(got)).toBe(await freshKey(main));
    d.close();
  });
  it('the key the answer carries is the one hdKeyOf reads (seeded: no hash on the main thread)',async()=>{
    // A tampered key in the answer shows the page reads the answer's key rather than hashing the pixels again.
    const inner=fakeWorker(),tampered='f'.repeat(64);
    const port:HdDecodeWorkerPort={onmessage:null,onerror:null,
      postMessage(m,t){inner.onmessage=(e)=>port.onmessage?.({data:e.data.ok?{...e.data,key:tampered}:e.data});inner.postMessage(m,t);},
      terminate(){inner.terminate();}};
    const d=new HdMenuDecoder(()=>port,frames().next),file=DDS_CASES[0]![1];
    const got=await d.dds(file,sizeOf(file));
    expect(await hdKeyOf(got)).toBe(tampered);
    d.close();
  });
  it('no worker: dds on the main thread, a frame of its own, the same bytes; its key hashed as today',async()=>{
    const f=frames(),d=new HdMenuDecoder(()=>null,f.next),file=DDS_CASES[3]![1],size=sizeOf(file);
    const got=await d.dds(file,size);
    expect(d.mode).toBe('main');expect(f.n).toBe(1);
    const main=decodeDds(file,size);
    expect(bytesOf(got)).toEqual(bytesOf(main));
    expect(await hdKeyOf(got)).toBe(await freshKey(main));
  });
  it('a worker that dies: its waiting dds decodes are redone on the main thread, the same bytes',async()=>{
    const worker=fakeWorker({failAfter:0}),d=new HdMenuDecoder(()=>worker,frames().next);
    const got=await Promise.all(DDS_CASES.map(([,file])=>d.dds(file,sizeOf(file))));
    expect(d.mode).toBe('main');expect(d.failure).toMatch(/the worker died/);
    for(const [i,[,file]] of DDS_CASES.entries())expect(bytesOf(got[i]!)).toEqual(bytesOf(decodeDds(file,sizeOf(file))));
  });
  it('a malformed DDS through the worker rejects with its DDS: message',async()=>{
    const d=new HdMenuDecoder(()=>fakeWorker(),frames().next);
    await expect(d.dds(new Uint8Array(200),{width:4,height:4})).rejects.toThrow(/^DDS: not a DDS file$/);
    d.close();
  });
  it('alpha: a whole image\'s pixels transferred to the worker and fullAlpha\'s bytes back',async()=>{
    const worker=fakeWorker(),d=new HdMenuDecoder(()=>worker,frames().next);
    const r=image(13,9,()=>128),want=fullAlpha(new Uint8ClampedArray(r.data));
    const got=await d.alpha(r);
    expect(worker.requests).toEqual(['alpha']);
    expect(bytesOf(got)).toEqual(bytesOf({width:13,height:9,data:want}));
    expect(r.data.byteLength,'handed over: transferred, never copied').toBe(0);
    d.close();
  });
  it('alpha: a view into a larger buffer, or no worker, rescales on the main thread with the same bytes',async()=>{
    const worker=fakeWorker(),d=new HdMenuDecoder(()=>worker,frames().next);
    const big=new Uint8ClampedArray(4*20),view=big.subarray(8,8+4*6);view.set(image(3,2,(i)=>i*60).data);
    const want=fullAlpha(new Uint8ClampedArray(view));
    const got=await d.alpha({width:3,height:2,data:view});
    expect(worker.requests).toEqual([]);expect(bytesOf(got)).toEqual(bytesOf({width:3,height:2,data:want}));
    expect(view.byteLength,'a view is left whole').toBe(24);
    const n=new HdMenuDecoder(()=>null,frames().next),r=image(5,4,(i)=>i*13);
    expect(bytesOf(await n.alpha(r))).toEqual(bytesOf({width:5,height:4,data:fullAlpha(new Uint8ClampedArray(image(5,4,(i)=>i*13).data))}));
    d.close();
  });
  it('an alpha waiting when the worker dies is refused (its pixels went with the worker)',async()=>{
    const d=new HdMenuDecoder(()=>fakeWorker({failAfter:0}),frames().next);
    await expect(d.alpha(image(4,4,()=>128))).rejects.toThrow(/the worker died/);
  });
});
