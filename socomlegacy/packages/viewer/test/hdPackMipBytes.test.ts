import {describe,expect,it} from 'vitest';
import {DataTexture,LinearFilter,LinearMipmapLinearFilter,NearestFilter} from 'three';
import {HdPackRuntime,HdTextureRegistry,HD_LIMITS,hdLoadReserve,rgbaChainBytes,type ApplyFrames,type HdEntry,type HdManifest} from '../src/hdTexturePack';
import {sha256} from '../src/texturePack';

/**
 * LATER 1228 (product track, the HD pack's GPU memory cap; from LATER 1137's review): a replacement whose texture GENERATES
 * a mip chain (its original's own chain, a flipped 2D bitmap's `minify`, LATER 1137's larger opaque world texture) holds the
 * whole chain on the GPU -- up to a third more than its level 0 for a square, nearly twice for a thin strip -- but the
 * applied cap (`HD_LIMITS.appliedBytes`) counted level 0 alone, and the Xbox class is the one whose browser budget the cap
 * guards. The cap now counts the chain three generates (down to 1 x 1), and a load that may end in one reserves its bound.
 */
const image=(w:number,h:number,px:number[])=>({width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h},()=>px).flat())});
const keyOf=(r:{data:Uint8ClampedArray})=>sha256(new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength));
async function entry(src:ReturnType<typeof image>,out:ReturnType<typeof image>,file='0.png',over:Partial<HdEntry>={}):Promise<HdEntry>{
 return {key:await keyOf(src),width:src.width,height:src.height,file,format:'png',outWidth:out.width,outHeight:out.height,
  bytes:out.data.length,sha256:await keyOf(out),tier:'A',source:'deadbeef-0000abcd',...over};
}
const manifest=(entries:HdEntry[]):HdManifest=>({format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD test',
 method:'pcsx2 replacements',entries,totalBytes:[...new Map(entries.map(e=>[e.file,e.bytes])).values()].reduce((n,b)=>n+b,0)});
const world=(src:ReturnType<typeof image>,min:typeof LinearFilter|typeof NearestFilter=LinearFilter)=>{
 const registry=new HdTextureRegistry(),t=new DataTexture(src.data,src.width,src.height);t.minFilter=min;t.generateMipmaps=false;registry.register(t,src);return {registry,t};
};

describe('LATER 1228: the HD pack’s cap counts a generated mip chain',()=>{
 it('rgbaChainBytes: every level three generates, to 1 x 1 (a square ~4/3, a strip nearly 2x)',()=>{
  expect(rgbaChainBytes(1,1)).toBe(4);
  expect(rgbaChainBytes(8,8)).toBe((64+16+4+1)*4);                // 340
  expect(rgbaChainBytes(4,2)).toBe((8+2+1)*4);                     // 4x2, 2x1, 1x1
  expect(rgbaChainBytes(4,1)).toBe((4+2+1)*4);                     // a strip: 1.75x its level 0
 });

 it('a larger opaque world replacement that generates its chain (LATER 1137) counts the chain, not level 0',async()=>{
  const src=image(2,2,[9,9,9,255]),hd=image(8,8,[120,80,40,255]),{registry,t}=world(src);
  const runtime=new HdPackRuntime(registry,async()=>hd);await runtime.setPack(manifest([await entry(src,hd)]));
  expect(t.generateMipmaps).toBe(true);expect(t.minFilter).toBe(LinearMipmapLinearFilter);
  expect(runtime.appliedBytes).toBe(rgbaChainBytes(8,8));
 });

 it('one that generates none (a nearest original) counts its level 0, as before',async()=>{
  const src=image(2,2,[9,9,9,255]),hd=image(8,8,[120,80,40,255]),{registry,t}=world(src,NearestFilter);
  const runtime=new HdPackRuntime(registry,async()=>hd);await runtime.setPack(manifest([await entry(src,hd)]));
  expect(t.generateMipmaps).toBe(false);
  expect(runtime.appliedBytes).toBe(8*8*4);
 });

 it('an original with its own chain (it generates on the replacement) counts the chain too',async()=>{
  const src=image(2,2,[9,9,9,255]),hd=image(8,8,[120,80,40,255]),registry=new HdTextureRegistry(),t=new DataTexture(src.data,2,2);
  t.mipmaps=[src,image(1,1,[9,9,9,255])] as never;t.minFilter=LinearMipmapLinearFilter;t.generateMipmaps=false;registry.register(t,src);
  const runtime=new HdPackRuntime(registry,async()=>hd);await runtime.setPack(manifest([await entry(src,hd)]));
  expect(t.generateMipmaps).toBe(true);
  expect(runtime.appliedBytes).toBe(rgbaChainBytes(8,8));
 });

 it('the load’s reservation bounds a chain it cannot size yet: twice the composite when one may come, else as before',()=>{
  expect(hdLoadReserve(256,false)).toBe(256);
  expect(hdLoadReserve(256,true)).toBe(512);
  expect(hdLoadReserve(16,true)).toBeGreaterThanOrEqual(rgbaChainBytes(4,1));   // a strip's chain, 28, inside the bound
 });

 // Its review's F1 (reproduced there): after the build only level 0 stayed reserved while the upload waited, so a texture
 // checked meanwhile was admitted on understated usage and the total passed the cap (596 against 512).
 it('review F1: a chained replacement keeps its chain reserved while its upload waits; the cap holds',async()=>{
  const limits=HD_LIMITS as unknown as {appliedBytes:number},cap=limits.appliedBytes;
  limits.appliedBytes=512;
  try{
   const srcA=image(4,4,[1,1,1,255]),srcB=image(4,4,[2,2,2,255]),hdA=image(8,8,[200,10,10,255]),hdB=image(8,8,[10,200,10,255]);
   const registry=new HdTextureRegistry(true);
   const waiting:(()=>void)[]=[];
   const frames={turn:async()=>undefined,slice:async()=>undefined,
    upload:async(_bytes:number,swap:()=>DataTexture|null)=>{await new Promise<void>(r=>waiting.push(r));swap();}} as unknown as ApplyFrames;
   const a=new DataTexture(srcA.data,4,4);a.minFilter=LinearFilter;a.generateMipmaps=false;registry.register(a,srcA);   // chains (LATER 1137)
   const runtime=new HdPackRuntime(registry,async e=>e.file==='a.png'?hdA:hdB,()=>undefined,{frames});
   const done=runtime.setPack(manifest([await entry(srcA,hdA,'a.png'),await entry(srcB,hdB,'b.png')]));
   for(let i=0;i<50&&!waiting.length;i++)await new Promise(r=>setTimeout(r,0));
   expect(waiting.length).toBe(1);                                   // a built, its upload waiting
   const b=new DataTexture(srcB.data,4,4);b.minFilter=NearestFilter;registry.register(b,srcB);   // no chain: 256
   for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,0));while(waiting.length)waiting.shift()!();}
   await done;
   expect(runtime.appliedBytes).toBeLessThanOrEqual(512);
   expect(a.generateMipmaps).toBe(true);
  }finally{limits.appliedBytes=cap;}
 });

 it('review F2: a linear original whose replacement is NOT larger reserves as before (it can never chain) -- admitted under a tight cap',async()=>{
  const limits=HD_LIMITS as unknown as {appliedBytes:number},cap=limits.appliedBytes;
  limits.appliedBytes=100;                                          // one 4x4 RGBA (64), not twice it (128)
  try{
   const src=image(4,4,[9,9,9,255]),same=image(4,4,[120,80,40,255]),{registry,t}=world(src);
   const runtime=new HdPackRuntime(registry,async()=>same);await runtime.setPack(manifest([await entry(src,same)]));
   expect(runtime.applied).toBe(1);
   expect(t.generateMipmaps).toBe(false);
   expect(runtime.appliedBytes).toBe(64);
  }finally{limits.appliedBytes=cap;}
 });
});
