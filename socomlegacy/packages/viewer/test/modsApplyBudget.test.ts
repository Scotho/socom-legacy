import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {DataTexture} from 'three';
import {ApplyFrames,HD_DRAW_TEXELS_PER_SLICE_ADAPTATION,HD_LIMITS,HdPackRuntime,HdTextureRegistry,MODS_APPLY_FRAME_BUDGET_MS_ADAPTATION,drawPlacements,drawPlacementsSteps,type HdEntry,type HdManifest,type HdPlacement} from '../src/hdTexturePack';
import {PACK_APPLY_FRAME_LIMIT_MS} from '../src/packApplyOverlay';
import {sha256} from '../src/texturePack';

/**
 * B206, after ML-9 (plan 2026-11-06-mods-loader, ML.R10; product track, ML.R2 -- a browser adaptation, no original):
 * the apply's swaps and GPU uploads paced by measured time. Each texture's swap and upload (`ApplyFrames.upload`) is
 * timed with the page's clock; a frame gives them `MODS_APPLY_FRAME_BUDGET_MS_ADAPTATION` and the rest wait for the
 * next frame; one over the budget alone is its own frame, counted, the largest said. A fake clock and a fake frame
 * loop; synthetic images and made-up keys, no game data.
 */
function fakeFrames(budgetMs=8){
  let clock=0;const frames:string[][]=[[]];
  const nextFrame=async():Promise<void>=>{frames.push([]);clock+=16;};
  const f=new ApplyFrames(nextFrame,Number.MAX_SAFE_INTEGER,1_000_000,()=>clock,budgetMs);
  const logs:string[]=[];f.log=(t)=>logs.push(t);
  const tex=new DataTexture(new Uint8Array(4),1,1);
  /** An upload named `name` that costs `ms` on the fake clock. */
  const up=(name:string,ms:number,bytes=1000)=>f.upload(bytes,()=>{clock+=ms;frames[frames.length-1]!.push(name);return tex;});
  return {f,frames,logs,up,tex};
}

describe('B206 after ML-9: the apply\'s uploads paced by measured time (ML.R10)',()=>{
  it('starts at 8 ms a frame, under ML.R10\'s 50 ms limit',()=>{
    expect(MODS_APPLY_FRAME_BUDGET_MS_ADAPTATION).toBe(8);
    expect(MODS_APPLY_FRAME_BUDGET_MS_ADAPTATION).toBeLessThan(PACK_APPLY_FRAME_LIMIT_MS);
    expect(new ApplyFrames().uploadMsPerFrame).toBe(MODS_APPLY_FRAME_BUDGET_MS_ADAPTATION);
  });
  it('stops a frame at the budget, resumes the next frame, and finishes every upload in order',async()=>{
    const {frames,up}=fakeFrames(8);
    await Promise.all(Array.from({length:10},(_,i)=>up(`t${i}`,3)));
    // 3 ms each: two fit in 8 ms (3 + 3, the third's estimate 3 more would pass it), the third waits for the next frame.
    expect(frames.filter(f=>f.length)).toEqual([['t0','t1'],['t2','t3'],['t4','t5'],['t6','t7'],['t8','t9']]);
  });
  it('gives an upload over the budget alone a frame of its own, counts it and says the largest',async()=>{
    const {f,frames,logs,up}=fakeFrames(8);
    await Promise.all([up('a',2,1000),up('b',2,1000),up('big',30,15_000),up('c',2,1000),up('huge',40,20_000),up('d',2,1000)]);
    // big's estimate at the measured rate (2 ms a 1000 bytes: 30 ms) keeps it out of a's and b's frame; nothing follows it.
    expect(frames.filter(x=>x.length)).toEqual([['a','b'],['big'],['c'],['huge'],['d']]);
    expect(f.uploadStats).toEqual({uploads:6,overBudget:2,largestMs:40,largestBytes:20_000});
    expect(logs.length).toBe(2);
    expect(logs[1]).toMatch(/40\.0 ms \(20000 bytes\), over the 8 ms frame budget/);
  });
  it('calls the page\'s uploader on the swapped texture inside the timed step; a failing uploader leaves it to the render',async()=>{
    let clock=0;const f=new ApplyFrames(async()=>{clock+=16;},Number.MAX_SAFE_INTEGER,1_000_000,()=>clock);
    const seen:DataTexture[]=[];const t=new DataTexture(new Uint8Array(4),1,1);
    f.setUploader((x)=>{clock+=5;seen.push(x);});
    await f.upload(4,()=>t);
    expect(seen).toEqual([t]);expect(f.uploadStats.largestMs).toBe(5);
    f.setUploader(()=>{throw new Error('backend not ready');});
    await expect(f.upload(4,()=>t)).resolves.toBeUndefined();
    await f.upload(4,()=>null);                                 // nothing swapped: nothing uploaded, nothing counted
    expect(f.uploadStats.uploads).toBe(2);
  });
  it('the HD runtime swaps each texture through the timed upload, the uploader seeing its replacement',async()=>{
    const registry=new HdTextureRegistry(true),entries:HdEntry[]=[],payloads=new Map<string,{width:number;height:number;data:Uint8ClampedArray}>();
    const keyOf=(d:Uint8ClampedArray)=>sha256(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));
    const textures:DataTexture[]=[];
    for(let i=0;i<6;i++){
      const s=new Uint8ClampedArray(4*4*4).fill(i+1);const t=new DataTexture(s,4,4);registry.register(t,{width:4,height:4,data:s});textures.push(t);
      const p=new Uint8ClampedArray(8*8*4).fill(255-i);payloads.set(`${i}.png`,{width:8,height:8,data:p});
      entries.push({key:await keyOf(s),width:4,height:4,file:`${i}.png`,format:'png',outWidth:8,outHeight:8,bytes:p.length,sha256:await keyOf(p),tier:'A',source:'x'});
    }
    const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'Synthetic',method:'test',entries,totalBytes:entries.reduce((a,e)=>a+e.bytes,0)};
    let clock=0;const frames=new ApplyFrames(async()=>{clock+=16;},Number.MAX_SAFE_INTEGER,1_000_000,()=>clock);
    const uploaded:{t:DataTexture;width:number}[]=[];
    frames.setUploader((t)=>{clock+=1;uploaded.push({t,width:t.image.width});});
    const runtime=new HdPackRuntime(registry,async e=>payloads.get(e.file)!,()=>undefined,{frames});
    const report=await runtime.setPack(manifest);
    expect(report.applied).toBe(6);
    expect(new Set(uploaded.map(u=>u.t))).toEqual(new Set(textures));
    expect(uploaded.every(u=>u.width===8)).toBe(true);           // uploaded after the swap, the replacement's size
    expect(frames.uploadStats.uploads).toBe(6);
  });
  it('every page\'s HD pack decodes its DDS payloads in the decode worker, never on the main thread (the test room\'s 300 ms frames)',()=>{
    // ML-9b's profile (the test room, MP2): decodeDds and bc7Block were the long frames' self time; the match already
    // passed the worker's decode (`matchMount.ts`), the test room and the Forge did not.
    for(const file of ['../src/main.ts','../src/forge/page.ts','../src/matchMount.ts']){
      const src=readFileSync(new URL(file,import.meta.url),'utf8');
      const at=src.indexOf('new HdServedPack(');expect(at,file).toBeGreaterThan(0);
      // After the v0.4.12 merge: the page's `HdMenuDecoder` is the pack's `HdPackDecoders` (GM-13d), made lazily.
      expect(src.slice(at,at+900),file).toMatch(/lazyHdPackDecoders\(\(\) => import\('\.{1,2}\/hdMenuTextures'\)\.then\(\(m\) => new m\.HdMenuDecoder\(\)\)\)/);
      expect(src.slice(at,at+900),file).not.toMatch(/decodeDds:/);
    }
  });
  it('a composite drawn in slices is the same bytes as drawn at once, and yields between slices',()=>{
    const img={width:512,height:256,data:new Uint8ClampedArray(512*256*4).map((_,i)=>(i*37+(i>>9))&255)};
    const placements:HdPlacement[]=[{dst:[0,0,64,64],src:[0,0,256,256]},{dst:[64,0,64,64],src:[256,0,256,256]},{dst:[16,16,40,30],src:[100,10,90,77]}];
    const at=()=>({width:512,height:256,data:new Uint8ClampedArray(512*256*4).fill(7)});
    const once=at();drawPlacements(once,128,64,img,placements,true);
    const sliced=at();let slices=0;for(const _ of drawPlacementsSteps(sliced,128,64,img,placements,true,4096))slices++;
    expect(Buffer.from(sliced.data).equals(Buffer.from(once.data))).toBe(true);
    expect(slices).toBeGreaterThanOrEqual(Math.floor((256*256*2)/4096)-2);     // two 256x256 regions at the composite's scale
    expect(HD_DRAW_TEXELS_PER_SLICE_ADAPTATION).toBeGreaterThan(0);
  });
  it('a slice waits for the next frame once the frame\'s time is spent, and an upload after slices is not the frame\'s first',async()=>{
    let clock=0,frames=0;const f=new ApplyFrames(async()=>{frames++;clock+=16;},Number.MAX_SAFE_INTEGER,8,()=>clock);
    for(let i=0;i<10;i++){await f.slice();clock+=3;}                       // 3 ms of drawing a slice: three a frame (0, 3, 6)
    expect(frames).toBe(3);
    const t=new DataTexture(new Uint8Array(4),1,1);let ran=-1;
    await f.upload(4,()=>{ran=frames;return t;});                           // the frame holds 1 slice (3 ms) + the estimate 0
    expect(ran).toBe(3);
    clock+=20;await f.upload(4,()=>{ran=frames;return t;});                 // the frame's time spent: the next frame
    expect(ran).toBe(4);
  });
  it('the HD runtime draws a large placement composite over several frames, its result the same',async()=>{
    const registry=new HdTextureRegistry(true);
    const keyOf=(d:Uint8ClampedArray)=>sha256(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));
    const s=new Uint8ClampedArray(64*64*4).fill(9);const t=new DataTexture(s,64,64);registry.register(t,{width:64,height:64,data:s});
    const p=new Uint8ClampedArray(256*256*4).map((_,i)=>(i*13)&255);
    const placements:HdPlacement[]=[{dst:[0,0,64,64],src:[0,0,256,256]}];
    const e:HdEntry={key:await keyOf(s),width:64,height:64,file:'0.png',format:'png',outWidth:256,outHeight:256,bytes:p.length,sha256:await keyOf(p),tier:'A',source:'x',placementKind:'crop',placements} as HdEntry;
    const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'Synthetic',method:'test',entries:[e],totalBytes:p.length};
    let clock=0,count=0;const frames=new ApplyFrames(async()=>{count++;clock+=16;},Number.MAX_SAFE_INTEGER,8,()=>clock);
    const slice=frames.slice.bind(frames);let slices=0;frames.slice=()=>{slices++;clock+=5;return slice();};
    const runtime=new HdPackRuntime(registry,async()=>({width:256,height:256,data:p}),()=>undefined,{frames});
    const report=await runtime.setPack(manifest);
    expect(report.applied).toBe(1);
    const want={width:256,height:256,data:new Uint8ClampedArray(256*256*4)};drawPlacements(want,64,64,{width:256,height:256,data:p},placements,true);
    expect(Buffer.from(t.image.data as Uint8Array).equals(Buffer.from(want.data))).toBe(true);
    expect({slices,count}).toEqual({slices:4,count:2});                    // the hash, then 65,536 texels in 16,384s; 5 ms each
  });
  it('each payload\'s hash waits for a frame with time left (one 16 MiB hash and copy a frame at most past the budget)',async()=>{
    const registry=new HdTextureRegistry(true),entries:HdEntry[]=[],payloads=new Map<string,{width:number;height:number;data:Uint8ClampedArray}>();
    const keyOf=(d:Uint8ClampedArray)=>sha256(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));
    for(let i=0;i<5;i++){
      const s=new Uint8ClampedArray(4*4*4).fill(i+1);registry.register(new DataTexture(s,4,4),{width:4,height:4,data:s});
      const p=new Uint8ClampedArray(8*8*4).fill(200-i);payloads.set(`${i}.png`,{width:8,height:8,data:p});
      entries.push({key:await keyOf(s),width:4,height:4,file:`${i}.png`,format:'png',outWidth:8,outHeight:8,bytes:p.length,sha256:await keyOf(p),tier:'A',source:'x'});
    }
    const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'Synthetic',method:'test',entries,totalBytes:entries.reduce((a,e)=>a+e.bytes,0)};
    const frames=new ApplyFrames(async()=>undefined,Number.MAX_SAFE_INTEGER,8,()=>0);
    const slice=frames.slice.bind(frames);let slices=0;frames.slice=()=>{slices++;return slice();};
    const runtime=new HdPackRuntime(registry,async e=>payloads.get(e.file)!,()=>undefined,{frames});
    expect((await runtime.setPack(manifest)).applied).toBe(5);
    expect(slices).toBe(5);                                                 // whole replacements: one slice each, its hash
  });
});


describe('PR #729 Codex P2: a budgeted apply keeps its composite reserved until the upload swaps it in',()=>{
  // `apply` used to give its reservation back when `build` finished, then await the queued upload before `swap` counted the
  // replacement in `appliedBytes`: between the two the RGBA was in neither, so a texture registered meanwhile passed the
  // applied cap on understated usage. A cap of one and a half composites: two never fit at once.
  it('a second texture\'s cap check sees the first\'s composite while its upload waits',async()=>{
    const limits=HD_LIMITS as unknown as {appliedBytes:number},cap=limits.appliedBytes;
    limits.appliedBytes=384;
    try{
      const registry=new HdTextureRegistry(true),entries:HdEntry[]=[],payloads=new Map<string,{width:number;height:number;data:Uint8ClampedArray}>();
      const keyOf=(d:Uint8ClampedArray)=>sha256(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));
      const sources:{width:number;height:number;data:Uint8ClampedArray}[]=[];
      for(let i=0;i<2;i++){
        const s=new Uint8ClampedArray(4*4*4).fill(i+1);sources.push({width:4,height:4,data:s});
        const p=new Uint8ClampedArray(8*8*4).fill(200-i);payloads.set(`${i}.png`,{width:8,height:8,data:p});
        entries.push({key:await keyOf(s),width:4,height:4,file:`${i}.png`,format:'png',outWidth:8,outHeight:8,bytes:p.length,sha256:await keyOf(p),tier:'A',source:`s${i}`});
      }
      const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'Synthetic',method:'test',entries,totalBytes:entries.reduce((a,e)=>a+e.bytes,0)};
      // A slow upload: each waits until the test lets it through.
      const waiting:(()=>void)[]=[];
      const frames={turn:async()=>undefined,slice:async()=>undefined,
        upload:async(_bytes:number,swap:()=>DataTexture|null)=>{await new Promise<void>(r=>waiting.push(r));swap();}} as unknown as ApplyFrames;
      const a=new DataTexture(sources[0]!.data,4,4);registry.register(a,sources[0]!);
      const runtime=new HdPackRuntime(registry,async e=>payloads.get(e.file)!,()=>undefined,{frames});
      const done=runtime.setPack(manifest);
      for(let i=0;i<50&&!waiting.length;i++)await new Promise(r=>setTimeout(r,0));
      expect(waiting.length).toBe(1);                                      // a's composite built, its upload queued
      const b=new DataTexture(sources[1]!.data,4,4);registry.register(b,sources[1]!);
      for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,0));while(waiting.length)waiting.shift()!();}
      const report=await done;
      expect(runtime.appliedBytes).toBeLessThanOrEqual(384);
      expect(report.applied).toBe(1);
      expect(runtime.skipped().map(s=>s.reason)).toEqual(['over the 0.0003662109375 MiB applied cap']);
      expect(a.image.width).toBe(8);expect(b.image.width).toBe(4);
    }finally{limits.appliedBytes=cap;}
  });
});
