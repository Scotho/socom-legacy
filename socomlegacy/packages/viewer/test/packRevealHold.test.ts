import {describe,expect,it} from 'vitest';
import {DataTexture} from 'three';
import {HdTextureRegistry,type HdManifest} from '../src/hdTexturePack';
import {HdServedPack,HD_ROOT} from '../src/hdTexturePackServed';
import {PackApplier,type HdSwitch,type TextureChoiceKeeper} from '../src/packs/pagePacks';
import {packRevealHold,PACK_REVEAL_HOLD_MAX_MS_ADAPTATION} from '../src/packRevealHold';
import {sha256} from '../src/texturePack';

/**
 * B-48 (tier 1 row 8; product track, a browser adaptation): the HD pack applies behind the loading screen. The match's
 * first world frame -- the frame that lets the loading screen go -- waits while the pack is still applying the world's
 * textures, up to `PACK_REVEAL_HOLD_MAX_MS_ADAPTATION`; after that play starts and the chip takes over as before.
 */
describe('packRevealHold: the first world frame waits for the HD pack, capped',()=>{
  it('lets the frame go at once when no pack is applying',()=>{
    const h=packRevealHold();
    expect(h.hold(0,false)).toBe(false);
  });
  it('holds while the pack is busy and lets go when it settles',()=>{
    const h=packRevealHold(10_000);
    expect(h.hold(100,true)).toBe(true);
    expect(h.hold(5_000,true)).toBe(true);
    expect(h.hold(6_000,false)).toBe(false);
  });
  it('lets go at the cap, counted from the first busy frame, and never holds again',()=>{
    const h=packRevealHold(10_000);
    expect(h.hold(1_000,true)).toBe(true);
    expect(h.hold(10_999,true)).toBe(true);
    expect(h.hold(11_000,true)).toBe(false);
    expect(h.hold(11_500,true)).toBe(false);
  });
  it("the owner's ruling (2026-11-22): the cap is 0 -- the loading screen ends without waiting for the pack",()=>{
    expect(PACK_REVEAL_HOLD_MAX_MS_ADAPTATION).toBe(0);
  });
  it('at the default cap a busy pack never holds the first world frame (the apply carries on under the chip)',()=>{
    const seen:[string,number][]=[];
    const h=packRevealHold(undefined,(w,ms)=>{seen.push([w,ms]);});
    expect(h.hold(1_000,true)).toBe(false);
    expect(h.hold(1_016,true)).toBe(false);
    expect(seen).toEqual([['start',0],['cap',0]]);
  });
});

const image=(w:number,h:number,px:number[])=>({width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h},()=>px).flat())});
const hashOf=(d:Uint8ClampedArray)=>sha256(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));
function dds(img:ReturnType<typeof image>):Uint8Array{
  const b=new Uint8Array(128+img.data.length),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
  v.setUint32(4,124,true);v.setUint32(12,img.height,true);v.setUint32(16,img.width,true);v.setUint32(76,32,true);v.setUint32(80,0x41,true);v.setUint32(88,32,true);
  v.setUint32(92,0xff,true);v.setUint32(96,0xff00,true);v.setUint32(100,0xff0000,true);v.setUint32(104,0xff000000,true);b.set(img.data,128);return b;
}
/** A served pack whose one payload is held until `release()`: the apply is in flight meanwhile. */
async function heldPack(){
  const leaf=image(2,2,[40,90,30,128]),hd=image(8,8,[45,100,35,120]);
  const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD test',method:'test',totalBytes:hd.data.length,
    entries:[{key:await hashOf(leaf.data),width:2,height:2,file:'0.dds',format:'dds',outWidth:8,outHeight:8,bytes:hd.data.length,sha256:await hashOf(hd.data),tier:'A',source:'x-y-00001113.dds'}]};
  const mbytes=new TextEncoder().encode(JSON.stringify(manifest)),id=await sha256(mbytes);
  const files=new Map<string,Uint8Array>([[HD_ROOT+'current.json',new TextEncoder().encode(JSON.stringify({version:1,packId:id}))],[`${HD_ROOT}${id}/manifest.json`,mbytes],[`${HD_ROOT}${id}/0.dds`,dds(hd)]]);
  let release:()=>void=()=>undefined;const gate=new Promise<void>(r=>{release=r;});
  const fetcher=async(url:string)=>{if(url.endsWith('0.dds'))await gate;const f=files.get(url);return f?new Response(f.slice().buffer as ArrayBuffer):new Response('',{status:404});};
  const registry=new HdTextureRegistry();registry.register(new DataTexture(leaf.data,2,2),leaf);
  return {pack:new HdServedPack(fetcher,()=>undefined,registry),release};
}
const tick=()=>new Promise(r=>setTimeout(r,0));

describe('packRevealHold notes its moments for a served run (an instrument): world-ready -> reveal, held ms',()=>{
  it('free when nothing applies at the first ask; start, then settled with the ms held',()=>{
    const seen:[string,number][]=[];const note=(w:string,ms:number)=>{seen.push([w,ms]);};
    const a=packRevealHold(10_000,note);a.hold(100,false);a.hold(200,false);
    expect(seen).toEqual([['free',0]]);
    seen.length=0;const b=packRevealHold(10_000,note);
    b.hold(1_000,true);b.hold(4_000,true);b.hold(4_500,false);b.hold(5_000,false);
    expect(seen).toEqual([['start',0],['settled',3_500]]);
  });
  it('cap: noted once with the cap',()=>{
    const seen:[string,number][]=[];const h=packRevealHold(10_000,(w,ms)=>{seen.push([w,ms]);});
    h.hold(0,true);h.hold(10_000,true);h.hold(12_000,true);
    expect(seen).toEqual([['start',0],['cap',10_000]]);
  });
});

describe('HdServedPack.busy: the manifest loading or an apply in flight',()=>{
  it('is not busy while off, busy while applying, not busy once applied',async()=>{
    const {pack,release}=await heldPack();
    expect(pack.busy()).toBe(false);
    const on=pack.setEnabled(true);
    expect(pack.busy()).toBe(true);
    for(let i=0;i<20;i++)await tick();
    expect(pack.busy()).toBe(true);           // the payload held: the world's texture not applied yet
    release();await on;
    expect(pack.busy()).toBe(false);
  });
  it('a refused pack is not busy (play starts; the chip says why)',async()=>{
    const pack=new HdServedPack(async()=>new Response('',{status:404}),()=>undefined,new HdTextureRegistry());
    await pack.setEnabled(true);
    expect(pack.busy()).toBe(false);
  });
});

function keeper(value:string|null):TextureChoiceKeeper{
  return {get:()=>value,set:()=>undefined,observe:()=>()=>undefined,ready:Promise.resolve()} as unknown as TextureChoiceKeeper;
}
const registryStub={collect:()=>undefined,isCollecting:true,register:()=>undefined,source:()=>undefined} as never;

describe('PackApplier.busy: only an HD choice whose switch is busy',()=>{
  it('no HD choice: not busy',async()=>{
    const a=new PackApplier({choice:keeper(null),registry:registryStub,hd:()=>({setEnabled:async()=>undefined})});
    await a.ready;expect(a.busy()).toBe(false);
  });
  it('an HD choice: the switch\'s own busy; a switch without one is not busy',async()=>{
    let busy=true;
    const sw:HdSwitch&{busy():boolean}={setEnabled:async()=>undefined,busy:()=>busy};
    const a=new PackApplier({choice:keeper('hd:'+'a'.repeat(64)),registry:registryStub,hd:()=>sw});
    await a.ready;expect(a.busy()).toBe(true);
    busy=false;expect(a.busy()).toBe(false);
    const b=new PackApplier({choice:keeper('hd:'+'a'.repeat(64)),registry:registryStub,hd:()=>({setEnabled:async()=>undefined})});
    await b.ready;expect(b.busy()).toBe(false);
  });
});

describe('matchMount: the first world frame (the loading screen\'s release) asks the hold with the applier\'s busy',()=>{
  it('firstWorldFrame waits on packRevealHold(now, packs.busy()); tellReady keeps its own gate',async()=>{
    const {readFileSync}=await import('node:fs');const {fileURLToPath}=await import('node:url');
    const mm=readFileSync(fileURLToPath(new URL('../src/matchMount.ts',import.meta.url)),'utf8');
    expect(mm).toMatch(/const packHold = packRevealHold\(undefined, \(what, ms\) => \{[^\n]*\[pack-hold\]/);
    expect(mm).toMatch(/const firstWorldFrame = !firstDrawn && worldDraws >= 2 && !packHold\.hold\(now, packs\.busy\(\)\);/);
    expect(mm).toMatch(/if \(readyDraws >= 2\) tellReady\(true\);/);   // the room's prepared report does not wait for the pack
  });
});
