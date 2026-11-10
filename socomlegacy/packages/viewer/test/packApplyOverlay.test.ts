// @vitest-environment jsdom
import {afterEach,describe,expect,it} from 'vitest';
import {DataTexture} from 'three';
import {ApplyFrames,HD_CONCURRENT_LOADS,HdPackRuntime,HdTextureRegistry,PACK_APPLY_BYTES_PER_FRAME_ADAPTATION,PACK_APPLY_MS_PER_FRAME_ADAPTATION,type HdEntry,type HdManifest} from '../src/hdTexturePack';
import {PACK_APPLY_FRAME_LIMIT_MS,PACK_APPLY_OVERLAY_ADAPTATION,PackApplyOverlay,packApplyWords} from '../src/packApplyOverlay';
import {answerHdDecode} from '../src/hdMenuDecodeWorker';
import {decodeDds} from '../src/dds';
import {sha256} from '../src/texturePack';

/**
 * B206 ML-4 (plan 2026-11-06-mods-loader, ML.R10; product track, ML.R2): the page-level overlay
 * (`PACK_APPLY_OVERLAY_ADAPTATION`) -- "Applying pack... n/N", the pack's name and a bar; full-screen out of live play, a
 * corner strip in live play; gone at N/N, or after its words on a refusal -- and the spread apply behind it: a synthetic
 * 3,000-texture pack applied through the HD runtime with the frame budget (`ApplyFrames`), the longest frame measured
 * against ML.R10's limit (50.0 ms), the uploads a frame within the byte budget, and a fake room ticking every frame
 * through it. Synthetic images and made-up keys only, no game data.
 */
afterEach(()=>{document.body.replaceChildren();});

describe('ML-4: the overlay\'s words and bar (ML.R10)',()=>{
  it('is labelled as an adaptation',()=>{expect(PACK_APPLY_OVERLAY_ADAPTATION).toMatch(/adaptation/i);});
  it('says "Applying pack... n/N" with the pack\'s name, its bar at n/N, full-screen out of live play',()=>{
    const o=new PackApplyOverlay(document,()=>false);
    o.update({name:'SOCOM II HD',applied:120,total:480,done:false,refused:null});
    const el=document.getElementById('s2u-pack-apply')!;
    expect(el).not.toBeNull();
    expect(el.getAttribute('role')).toBe('status');
    expect(el.querySelector('[data-part=words]')!.textContent).toBe('Applying pack... 120/480');
    expect(el.querySelector('[data-part=name]')!.textContent).toBe('SOCOM II HD');
    expect((el.querySelector('[data-part=fill]') as HTMLElement).style.width).toBe('25%');
    expect(el.classList.contains('is-full')).toBe(true);
    expect(el.classList.contains('is-strip')).toBe(false);
    o.dispose();expect(document.getElementById('s2u-pack-apply')).toBeNull();
  });
  it('is a corner strip in live play, and follows the live state at each refresh',()=>{
    let live=true;const o=new PackApplyOverlay(document,()=>live);
    o.update({name:'P',applied:1,total:2,done:false,refused:null});
    const el=document.getElementById('s2u-pack-apply')!;
    expect(el.classList.contains('is-strip')).toBe(true);
    live=false;o.refresh();
    expect(el.classList.contains('is-full')).toBe(true);
    o.dispose();
  });
  it('draws nothing over the menus while its match is hidden (a prepared match), and shows once it is shown',()=>{
    let shown=false;const o=new PackApplyOverlay(document,()=>false,undefined,undefined,()=>shown);
    o.update({name:'P',applied:1,total:2,done:false,refused:null});
    const el=document.getElementById('s2u-pack-apply')!;
    expect(el.style.display).toBe('none');
    shown=true;o.refresh();expect(el.style.display).toBe('');
    o.dispose();
  });
  it('is gone at N/N, and with nothing to apply',()=>{
    const o=new PackApplyOverlay(document,()=>false);
    o.update({name:'P',applied:2,total:3,done:false,refused:null});
    o.update({name:'P',applied:3,total:3,done:true,refused:null});
    expect(document.getElementById('s2u-pack-apply')).toBeNull();
    o.update(null);expect(document.getElementById('s2u-pack-apply')).toBeNull();
  });
  it('says a refusal in its words, then goes',()=>{
    const timers:(()=>void)[]=[];
    const o=new PackApplyOverlay(document,()=>false,(f)=>{timers.push(f);});
    o.update({name:'P',applied:0,total:0,done:true,refused:'the HD pack is not installed'});
    expect(document.querySelector('[data-part=words]')!.textContent).toBe('P: not applied -- the HD pack is not installed');
    expect(timers.length).toBe(1);timers[0]!();
    expect(document.getElementById('s2u-pack-apply')).toBeNull();
  });
  it('words with no total yet: "Applying pack... 0/0" never; the count waits for the first texture',()=>{
    expect(packApplyWords({name:'P',applied:0,total:0,done:false,refused:null})).toBe('Applying pack...');
  });
});

describe('ML-4: a DDS payload decoded in the worker (ML.R10)',()=>{
  it('is byte-identical to decodeDds on the main thread',async()=>{
    const w=5,h=3,b=new Uint8Array(128+w*h*4),v=new DataView(b.buffer);
    b.set([0x44,0x44,0x53,0x20]);v.setUint32(4,124,true);v.setUint32(12,h,true);v.setUint32(16,w,true);
    v.setUint32(80,0x41,true);v.setUint32(88,32,true);v.setUint32(92,0xff,true);v.setUint32(96,0xff00,true);v.setUint32(100,0xff0000,true);v.setUint32(104,0xff000000,true);
    for(let i=0;i<w*h*4;i++)b[128+i]=(i*29+7)&255;
    const main=decodeDds(b,{width:w,height:h});
    const {reply}=await answerHdDecode({id:1,op:'dds',bytes:b,width:w,height:h});
    expect(reply.ok).toBe(true);
    if(!reply.ok)return;
    expect([reply.width,reply.height,Array.from(reply.data)]).toEqual([main.width,main.height,Array.from(main.data)]);
  });
});

/**
 * A frame loop of macrotasks: each frame resolves the turns waiting on it and ticks a fake room. `clock`: the time each
 * frame starts at (`starts`) -- the ML-10 review's F4: the apply test passes its modelled clock, never the wall clock.
 */
function frameLoop(clock:()=>number=()=>performance.now()){
  const waiting:(()=>void)[]=[];const starts:number[]=[];let ticks=0,running=true;
  const uploads:number[]=[];let pendingUpload=0;
  const step=()=>{
    if(!running)return;
    starts.push(clock());ticks++;
    uploads.push(pendingUpload);pendingUpload=0;
    for(const r of waiting.splice(0))r();
    setTimeout(step,0);
  };
  setTimeout(step,0);
  return {next:()=>new Promise<void>(r=>{waiting.push(r);}),starts,uploads,ticks:()=>ticks,stop:()=>{running=false;},uploaded:(n:number)=>{pendingUpload+=n;}};
}
const keyOf=(d:Uint8ClampedArray)=>sha256(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));

async function syntheticPack(n:number,src=16,out=64){
  const registry=new HdTextureRegistry(true),textures:DataTexture[]=[],payloads=new Map<string,{width:number;height:number;data:Uint8ClampedArray}>(),entries:HdEntry[]=[];
  for(let i=0;i<n;i++){
    const s=new Uint8ClampedArray(src*src*4);for(let j=0;j<s.length;j+=4){s[j]=i&255;s[j+1]=(i>>8)&255;s[j+2]=j&255;s[j+3]=255;}
    const t=new DataTexture(s,src,src);registry.register(t,{width:src,height:src,data:s});textures.push(t);
    const p=new Uint8ClampedArray(out*out*4);for(let j=0;j<p.length;j+=4){p[j]=(i*7)&255;p[j+1]=(i>>3)&255;p[j+2]=(j>>2)&255;p[j+3]=128;}
    const file=`${i}.png`;payloads.set(file,{width:out,height:out,data:p});
    entries.push({key:await keyOf(s),width:src,height:src,file,format:'png',outWidth:out,outHeight:out,bytes:p.length,sha256:await keyOf(p),tier:'A',source:'x'});
  }
  const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'Synthetic 3000',method:'test',entries,totalBytes:entries.reduce((a,e)=>a+e.bytes,0)};
  return {registry,textures,payloads,manifest};
}

describe('ML-4: the spread apply never stalls the page (ML.R10)',()=>{
  // The ML-10 review's F4: the frame's work is measured on a modelled clock (`now`, injected into `ApplyFrames`), each
  // step costing a fixed time -- a payload's load LOAD_MS, a texture's upload UPLOAD_MS -- so the frame budget's meaning
  // (no frame's work over PACK_APPLY_FRAME_LIMIT_MS) is asserted as a step budget, whatever else the host runs.
  it(`3,000 textures applied behind the overlay: the longest frame's steps under ${PACK_APPLY_FRAME_LIMIT_MS} ms, the room ticking every frame`,async()=>{
    const {registry,textures,payloads,manifest}=await syntheticPack(3000);
    const LOAD_MS=1,UPLOAD_MS=0.5;let clock=0;
    const loop=frameLoop(()=>clock);
    const versions=new Map(textures.map(t=>[t,t.version]));
    const frames=new ApplyFrames(()=>loop.next().then(()=>{for(const t of textures){if(t.version!==versions.get(t)){versions.set(t,t.version);loop.uploaded((t.image.data as Uint8Array).length);}}}),
      PACK_APPLY_BYTES_PER_FRAME_ADAPTATION,PACK_APPLY_MS_PER_FRAME_ADAPTATION,()=>clock);
    frames.setUploader(()=>{clock+=UPLOAD_MS;});
    const overlay=new PackApplyOverlay(document,()=>true,undefined,(f)=>{void loop.next().then(f);});
    const runtime=new HdPackRuntime(registry,async e=>{clock+=LOAD_MS;return payloads.get(e.file)!;},()=>overlay.update({name:manifest.name,applied:runtime.applied,total:runtime.matched,done:false,refused:null}),{frames});
    const startTicks=loop.ticks(),startFrame=loop.starts.length;
    const report=await runtime.setPack(manifest);
    overlay.update({name:manifest.name,applied:runtime.applied,total:runtime.matched,done:true,refused:null});
    await new Promise(r=>setTimeout(r,5));loop.stop();
    expect(report.applied).toBe(3000);expect(report.skipped).toEqual([]);
    expect(document.getElementById('s2u-pack-apply')).toBeNull();
    const starts=loop.starts.slice(startFrame);
    const lengths=starts.slice(1).map((t,i)=>t-starts[i]!);
    const longest=Math.max(...lengths);
    console.info(`[ML-4] 3000 textures over ${lengths.length} frames; longest frame's steps ${longest.toFixed(1)} modelled ms (limit ${PACK_APPLY_FRAME_LIMIT_MS}, budget ${PACK_APPLY_MS_PER_FRAME_ADAPTATION} ms / ${PACK_APPLY_BYTES_PER_FRAME_ADAPTATION} bytes)`);
    expect(lengths.length).toBeGreaterThan(1);                             // spread: never one frame
    // A frame gives steps until its time is spent: at most the budget, then the loads already in flight and one upload.
    expect(longest).toBeLessThanOrEqual(PACK_APPLY_MS_PER_FRAME_ADAPTATION+HD_CONCURRENT_LOADS*LOAD_MS+UPLOAD_MS);
    expect(longest).toBeLessThan(PACK_APPLY_FRAME_LIMIT_MS);
    expect(loop.ticks()-startTicks).toBeGreaterThanOrEqual(lengths.length); // the fake room ticked every frame
  },60_000);

  it('uploads no more than the frame\'s byte budget in one frame',async()=>{
    const {registry,textures,payloads,manifest}=await syntheticPack(200);
    const loop=frameLoop(),budget=256*1024;
    const versions=new Map(textures.map(t=>[t,t.version]));
    const frames=new ApplyFrames(()=>loop.next().then(()=>{for(const t of textures){if(t.version!==versions.get(t)){versions.set(t,t.version);loop.uploaded((t.image.data as Uint8Array).length);}}}),budget,1000);
    const runtime=new HdPackRuntime(registry,async e=>payloads.get(e.file)!,()=>undefined,{frames});
    await runtime.setPack(manifest);
    await new Promise(r=>setTimeout(r,5));loop.stop();
    expect(runtime.applied).toBe(200);
    expect(Math.max(...loop.uploads)).toBeLessThanOrEqual(budget);
  },60_000);
});
