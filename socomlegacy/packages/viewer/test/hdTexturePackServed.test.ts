import {describe,expect,it} from 'vitest';
import {DataTexture} from 'three';
import {HdTextureRegistry,type HdManifest} from '../src/hdTexturePack';
import type {Rgba} from '@s2u/gs';
import {decodeDds} from '../src/dds';
import {HdServedPack,HD_ROOT,lazyHdPackDecoders} from '../src/hdTexturePackServed';
import {HdMenuDecoder,type HdDecodeWorkerPort} from '../src/hdMenuTextures';
import {PackApplier,type HdSwitch,type TextureChoiceKeeper} from '../src/packs/pagePacks';
import {sha256} from '../src/texturePack';

const image=(w:number,h:number,px:number[])=>({width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h},()=>px).flat())});
const hashOf=(d:Uint8ClampedArray)=>sha256(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));
/** An uncompressed 32-bit RGBA DDS of `img`. */
function dds(img:ReturnType<typeof image>):Uint8Array{
  const b=new Uint8Array(128+img.data.length),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
  v.setUint32(4,124,true);v.setUint32(12,img.height,true);v.setUint32(16,img.width,true);v.setUint32(76,32,true);v.setUint32(80,0x41,true);v.setUint32(88,32,true);
  v.setUint32(92,0xff,true);v.setUint32(96,0xff00,true);v.setUint32(100,0xff0000,true);v.setUint32(104,0xff000000,true);b.set(img.data,128);return b;
}
async function served(){
  const leaf=image(2,2,[40,90,30,128]),hd=image(8,8,[45,100,35,120]);
  const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD test',method:'test',totalBytes:hd.data.length,
    entries:[{key:await hashOf(leaf.data),width:2,height:2,file:'0.dds',format:'dds',outWidth:8,outHeight:8,bytes:hd.data.length,sha256:await hashOf(hd.data),tier:'A',source:'x-y-00001113.dds'}]};
  const mbytes=new TextEncoder().encode(JSON.stringify(manifest)),id=await sha256(mbytes),requests:string[]=[];
  const files=new Map<string,Uint8Array>([[HD_ROOT+'current.json',new TextEncoder().encode(JSON.stringify({version:1,packId:id}))],[`${HD_ROOT}${id}/manifest.json`,mbytes],[`${HD_ROOT}${id}/0.dds`,dds(hd)]]);
  const fetcher=async(url:string)=>{requests.push(url);const f=files.get(url);return f?new Response(f.slice().buffer as ArrayBuffer):new Response('',{status:404});};
  return {leaf,hd,id,requests,fetcher,files};
}

describe('the served HD pack (HD-6)',()=>{
  it('requests nothing until enabled, applies a translucent replacement, and restores when disabled',async()=>{
    const {leaf,requests,fetcher}=await served(),registry=new HdTextureRegistry(),lines:string[]=[];
    const t=new DataTexture(leaf.data,2,2);registry.register(t,leaf);
    const pack=new HdServedPack(fetcher,s=>lines.push(s),registry);
    expect(requests).toEqual([]);
    await pack.setEnabled(true);
    expect(t.image.width).toBe(8);expect(t.image.data?.[3]).toBe(239);   // PS2 alpha 120 rescaled
    expect(lines.at(-1)).toBe('HD test: 1 texture replaced in this scene.');
    await pack.setEnabled(false);expect(t.image.width).toBe(2);expect(lines.at(-1)).toBe('HD pack off.');
  });
  it('refuses a pack whose manifest does not match its id, with the reason',async()=>{
    const {fetcher,files,id}=await served();files.set(`${HD_ROOT}${id}/manifest.json`,new TextEncoder().encode('{}'));
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry());await pack.setEnabled(true);
    expect(pack.statusText()).toBe('HD pack: refused -- the manifest does not match its id');
  });
  it('says so when no pack is served',async()=>{
    const pack=new HdServedPack(async()=>new Response('',{status:404}),()=>undefined,new HdTextureRegistry());await pack.setEnabled(true);
    expect(pack.statusText()).toBe('HD pack: refused -- current.json is missing');
  });
});

describe('the browser cache (HD.R8: the served files are immutable a year)',()=>{
  it('fetches the pointer uncached and the content-addressed files from the cache',async()=>{
    const {leaf,fetcher}=await served(),registry=new HdTextureRegistry(),seen:[string,RequestCache|undefined][]=[];
    registry.register(new DataTexture(leaf.data,2,2),leaf);
    const pack=new HdServedPack(async(u,i)=>{seen.push([u.split('/').pop()!,i?.cache]);return fetcher(u);},()=>undefined,registry);
    await pack.setEnabled(true);
    expect(seen).toEqual([['current.json','no-store'],['manifest.json','default'],['0.dds','default']]);
  });
});

// GM-13d (plan 2026-11-01-gpu-menus): a DDS payload goes through the decode the pack is given (the menus' worker); a pack
// given none decodes it as today, `decodeDds` on the calling thread. PRODUCT TRACK, a browser adaptation.
describe('GM-13d: the DDS decode is injected',()=>{
  it('a DDS entry goes through the injected decode, with its entry\'s size; the bytes it answers are applied',async()=>{
    const {leaf,fetcher}=await served(),registry=new HdTextureRegistry(),calls:[number,{width:number;height:number}][]=[];
    const t=new DataTexture(leaf.data,2,2);registry.register(t,leaf);
    const dds=(b:Uint8Array,size:{width:number;height:number}):Promise<Rgba>=>{calls.push([b.length,size]);return Promise.resolve(decodeDds(b,size));};
    const pack=new HdServedPack(fetcher,()=>undefined,registry,null,{dds});
    await pack.setEnabled(true);
    expect(calls).toEqual([[128+8*8*4,{width:8,height:8}]]);
    expect(t.image.width).toBe(8);expect(t.image.data?.[3]).toBe(239);
  });
  it('a PNG decode alone (the fifth argument before GM-13d) still decodes DDS as today',async()=>{
    const {leaf,fetcher}=await served(),registry=new HdTextureRegistry(),pngs:number[]=[];
    const t=new DataTexture(leaf.data,2,2);registry.register(t,leaf);
    const pack=new HdServedPack(fetcher,()=>undefined,registry,null,async()=>{pngs.push(1);throw new Error('not a PNG pack');});
    await pack.setEnabled(true);
    expect(pngs).toEqual([]);expect(t.image.width).toBe(8);expect(t.image.data?.[3]).toBe(239);
  });
  it('a pack constructed without a decode decodes DDS as today',async()=>{
    const {leaf,fetcher}=await served(),registry=new HdTextureRegistry();
    const t=new DataTexture(leaf.data,2,2);registry.register(t,leaf);
    await new HdServedPack(fetcher,()=>undefined,registry).setEnabled(true);
    expect(t.image.width).toBe(8);expect(t.image.data?.[3]).toBe(239);
  });
  it('a refusal from the injected decode keeps the original, with the decoder\'s message',async()=>{
    const {leaf,fetcher}=await served(),registry=new HdTextureRegistry();
    const t=new DataTexture(leaf.data,2,2);registry.register(t,leaf);
    const pack=new HdServedPack(fetcher,()=>undefined,registry,null,{dds:async()=>{throw new Error('DDS: truncated image data');}});
    await pack.setEnabled(true);
    expect(t.image.width).toBe(2);
    expect(pack.runtime.skipped()[0]!.reason).toBe('payload unavailable (DDS: truncated image data)');
  });
});

describe('PR #729 Codex P2 (matchMount.ts:900): a disposed pack ends its lazy decoder\'s worker',()=>{
  // Each match makes its own `HdServedPack` over a lazy `HdMenuDecoder`, whose worker starts at the first payload; the
  // match's teardown disposes its pack (`PackApplier.dispose`), which now ends that worker, so none is left per match.
  const fakeWorker=()=>{
    const w={terminated:0,posted:0,onmessage:null as unknown,onerror:null as unknown,onmessageerror:null as unknown,
      postMessage(){w.posted++;},terminate(){w.terminated++;}};
    return w;
  };
  it('the worker started by a payload is terminated once by the pack\'s dispose; a decoder never made is not made',async()=>{
    const w=fakeWorker();
    const decoders=lazyHdPackDecoders(async()=>new HdMenuDecoder(()=>w as unknown as HdDecodeWorkerPort,async()=>undefined));
    const pack=new HdServedPack(undefined,undefined,new HdTextureRegistry(),null,decoders,{storeOnly:true});
    const asked=decoders.png!(new Uint8Array(8),64).catch(e=>String(e));          // the first payload: the worker starts
    await new Promise(r=>setTimeout(r,0));
    expect(w.posted).toBe(1);
    await pack.dispose();
    expect(w.terminated).toBe(1);
    expect(await asked).toMatch(/closed/);                                          // the waiting request refused
    let made=0;
    const idle=new HdServedPack(undefined,undefined,new HdTextureRegistry(),null,
      lazyHdPackDecoders(async()=>{made++;return new HdMenuDecoder(()=>fakeWorker() as unknown as HdDecodeWorkerPort,async()=>undefined);}),{storeOnly:true});
    await idle.dispose();
    expect(made).toBe(0);
  });
  it('the page\'s applier disposes its HD switch when it has a dispose (the match\'s teardown, `packs.dispose()`)',async()=>{
    const calls:string[]=[];
    const hd:HdSwitch={setEnabled:async(on)=>{calls.push(`enabled:${on}`);},dispose:async()=>{calls.push('dispose');}};
    let v:string|null='hd:'+'a'.repeat(64);
    const choice:TextureChoiceKeeper={get:()=>v,ready:Promise.resolve(),observe:()=>()=>undefined,refresh:async()=>undefined,dispose:()=>undefined};
    const packs=new PackApplier({choice,registry:new HdTextureRegistry(),hd:()=>hd});
    await packs.ready;
    await packs.dispose();
    expect(calls).toEqual(['enabled:true','dispose']);
    v=null;
  });
});
