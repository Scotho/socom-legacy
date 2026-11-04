import {describe,expect,it} from 'vitest';
import {DataTexture,LinearFilter,LinearMipmapLinearFilter,NearestFilter} from 'three';
import {HdPackRuntime,HdTextureRegistry,HD_LIMITS,HD_CONCURRENT_LOADS,hdTextures,markDerived,validateHdManifest,type HdEntry,type HdManifest} from '../src/hdTexturePack';
import {sha256} from '../src/texturePack';
import {flipRows} from '../src/hudAssets';

const image=(w:number,h:number,px:number[])=>({width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h},()=>px).flat())});
const keyOf=(r:{data:Uint8ClampedArray})=>sha256(new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength));
async function entry(src:ReturnType<typeof image>,out:ReturnType<typeof image>,file='0.png',over:Partial<HdEntry>={}):Promise<HdEntry>{
 return {key:await keyOf(src),width:src.width,height:src.height,file,format:'png',outWidth:out.width,outHeight:out.height,
  bytes:out.data.length,sha256:await keyOf(out),tier:'A',source:'deadbeef-0000abcd',...over};
}
const manifest=(entries:HdEntry[]):HdManifest=>({format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD test',
 method:'pcsx2 replacements',entries,totalBytes:[...new Map(entries.map(e=>[e.file,e.bytes])).values()].reduce((n,b)=>n+b,0)});
const texture=(r:ReturnType<typeof image>)=>new DataTexture(r.data,r.width,r.height);

describe('HD texture pack manifest (HD-1)',()=>{
 it('accepts entries keyed by decoded image, any output size, with alpha',async()=>{
  const glass=image(2,2,[90,120,140,64]),hd=image(6,6,[95,125,150,60]);
  const m=manifest([await entry(glass,hd)]);
  expect(validateHdManifest(JSON.parse(JSON.stringify(m)))).toEqual(m);
 });
 it('refuses a malformed manifest with the reason',async()=>{
  const e=await entry(image(2,2,[1,2,3,255]),image(4,4,[1,2,3,255]));
  expect(()=>validateHdManifest({...manifest([e]),format:'s2u-local-texture-pack'})).toThrow(/format/);
  expect(()=>validateHdManifest(manifest([{...e,key:'ABC'}]))).toThrow(/key/);
  expect(()=>validateHdManifest(manifest([{...e,file:'../x.png'}]))).toThrow(/file/);
  expect(()=>validateHdManifest(manifest([e,{...e,file:'1.png'}]))).toThrow(/duplicate key/);
  expect(()=>validateHdManifest({...manifest([e]),totalBytes:1})).toThrow(/totalBytes/);
  expect(()=>validateHdManifest(manifest([{...e,outWidth:HD_LIMITS.outputEdge+1}]))).toThrow(/size/);
  expect(()=>validateHdManifest(manifest([{...e,tier:'Z' as HdEntry['tier']}]))).toThrow(/tier/);
  const other=await entry(image(2,2,[4,5,6,255]),image(4,4,[1,2,3,255]));
  expect(()=>validateHdManifest(manifest([e,{...other,sha256:'f'.repeat(64)}]))).toThrow(/declared differently/);
 });
 it('lets one file serve several decoded images, counting its bytes once',async()=>{
  const hd=image(4,4,[1,2,3,255]),a=await entry(image(2,2,[1,2,3,255]),hd),b=await entry(image(2,2,[7,8,9,255]),hd);
  const m=validateHdManifest(manifest([a,b]));expect(m.totalBytes).toBe(hd.data.length);expect(m.entries.length).toBe(2);
 });
});

describe('HD texture pack runtime (HD-2)',()=>{
 const setup=async(payloads:Map<string,ReturnType<typeof image>>)=>{
  const registry=new HdTextureRegistry();
  const runtime=new HdPackRuntime(registry,async e=>{const p=payloads.get(e.file);if(!p)throw new Error('missing');return p;});
  return {registry,runtime};
 };
 it('swaps every registered texture whose decoded image the pack names, keeping alpha, and restores',async()=>{
  const glass=image(2,2,[90,120,140,64]),wall=image(2,2,[10,10,10,255]),hd=image(8,8,[95,125,150,60]);
  const {registry,runtime}=await setup(new Map([['0.png',hd]]));
  const a=texture(glass),b=texture(wall);registry.register(a,glass);registry.register(b,wall);
  const original=a.image;
  const r=await runtime.setPack(manifest([await entry(glass,hd)]));
  expect(r).toEqual({applied:1,skipped:[]});
  expect(a.image.width).toBe(8);expect(a.image.data?.[3]).toBe(120);expect(b.image.width).toBe(2);   // the pack's PS2 alpha 60 (of 0x80) rescaled as the decoder does
  runtime.setPack(null);expect(a.image).toBe(original);expect(runtime.applied).toBe(0);
 });
 it('applies to a texture registered while the pack is on, and keys a derived image by its source',async()=>{
  const body=image(2,2,[200,150,120,255]),hd=image(4,4,[210,160,130,255]);
  const {registry,runtime}=await setup(new Map([['0.png',hd]]));
  await runtime.setPack(manifest([await entry(body,hd)]));
  const padded=image(2,4,[200,150,120,255]);registry.markDerived(padded,body);
  const t=texture(padded);registry.register(t,padded);await runtime.settled();
  expect(t.image.width).toBe(4);expect(runtime.applied).toBe(1);
 });
 it('keeps the original, with a reason, when the payload does not match its entry',async()=>{
  const src=image(2,2,[1,2,3,255]),hd=image(4,4,[1,2,3,255]),other=image(4,4,[9,9,9,255]);
  const {registry,runtime}=await setup(new Map([['0.png',other],['1.png',image(8,8,[1,2,3,255])]]));
  const t=texture(src);registry.register(t,src);
  const r=await runtime.setPack(manifest([await entry(src,hd)]));
  expect(r.applied).toBe(0);expect(r.skipped[0]!.reason).toMatch(/hash/);expect(t.image.width).toBe(2);
  const r2=await runtime.setPack(manifest([await entry(src,hd,'1.png',{sha256:await keyOf(image(8,8,[1,2,3,255]))})]));
  expect(r2.skipped[0]!.reason).toMatch(/size/);
 });
 it('gives a replacement a generated chain where the original was mipmapped, none where it was not',async()=>{
  const ground=image(2,2,[60,50,40,255]),hd=image(8,8,[61,51,41,255]);
  const {registry,runtime}=await setup(new Map([['0.png',hd]]));
  const t=texture(ground);t.mipmaps=[ground,image(1,1,[60,50,40,255])];t.minFilter=LinearMipmapLinearFilter;t.generateMipmaps=false;
  registry.register(t,ground);await runtime.setPack(manifest([await entry(ground,hd)]));
  expect(t.mipmaps).toEqual([]);expect(t.generateMipmaps).toBe(true);
  runtime.setPack(null);expect(t.mipmaps.length).toBe(2);expect(t.generateMipmaps).toBe(false);
 });
 it('forgets a disposed texture but not one it is swapping',async()=>{
  const src=image(2,2,[1,1,1,255]),hd=image(4,4,[2,2,2,255]);
  const {registry,runtime}=await setup(new Map([['0.png',hd]]));
  const t=texture(src),u=texture(src);registry.register(t,src);registry.register(u,src);
  u.dispose();expect(registry.size).toBe(1);
  await runtime.setPack(manifest([await entry(src,hd)]));expect(registry.size).toBe(1);expect(runtime.applied).toBe(1);
 });
});

describe('HD pack review folds (B192)',()=>{
 it('the page registry is inert until the test room collects: nothing registered, no source kept (finding 6)',()=>{
  const fresh=new HdTextureRegistry(false),src=image(2,2,[1,2,3,255]),t=texture(src);
  fresh.register(t,src);expect(fresh.size).toBe(0);expect(fresh.source(t)).toBeUndefined();
  const padded=image(2,4,[1,2,3,255]);fresh.markDerived(padded,src);fresh.collect();fresh.register(texture(padded),padded);
  expect(fresh.source(fresh.textures()[0]!)).toBe(padded);   // the mark made before collecting was not kept
  expect(hdTextures.isCollecting).toBe(false);markDerived(padded,src);   // the page's: a no-op outside the test room
 });
 it('loads at most HD_CONCURRENT_LOADS payloads at once (finding 3)',async()=>{
  const srcs=Array.from({length:10},(_,i)=>image(2,2,[i,i,i,255])),hds=srcs.map((_,i)=>image(4,4,[i,i,i,255]));
  let live=0,peak=0;const registry=new HdTextureRegistry();
  const runtime=new HdPackRuntime(registry,async e=>{live++;peak=Math.max(peak,live);await new Promise(r=>setTimeout(r,5));live--;return hds[parseInt(e.file,10)]!;});
  srcs.forEach(s=>registry.register(texture(s),s));
  const r=await runtime.setPack(manifest(await Promise.all(srcs.map((s,i)=>entry(s,hds[i]!,`${i}.png`)))));
  expect(r.applied).toBe(10);expect(peak).toBe(HD_CONCURRENT_LOADS);
 });
 it('a texture the HUD sampling experiment holds keeps its image (finding 4)',async()=>{
  const src=image(2,2,[5,5,5,255]),hd=image(4,4,[6,6,6,255]),registry=new HdTextureRegistry(),t=texture(src);
  registry.register(t,src);expect(registry.claim(t,'ui-sampling')).toBe(true);
  const runtime=new HdPackRuntime(registry,async()=>hd);
  const r=await runtime.setPack(manifest([await entry(src,hd)]));
  expect(r.applied).toBe(0);expect(r.skipped[0]!.reason).toMatch(/HUD sampling/);expect(t.image.width).toBe(2);
  registry.release(t,'ui-sampling');await runtime.setPack(manifest([await entry(src,hd)]));
  expect(t.image.width).toBe(4);expect(registry.claim(t,'ui-sampling')).toBe(false);   // now the pack's
  await runtime.setPack(null);expect(registry.claim(t,'ui-sampling')).toBe(true);
 });
});

describe('the pack\'s alpha is the PS2\'s (0x80 opaque), rescaled as the decoder does', ()=>{
 it('maps 0 -> 0, 64 -> 128, 128 -> 255 and clamps an over-bright 200 to 255, after the payload\'s hash check',async()=>{
  const src=image(2,2,[10,20,30,255]),hd={width:4,height:1,data:new Uint8ClampedArray([1,1,1,0, 2,2,2,64, 3,3,3,128, 4,4,4,200])};
  const registry=new HdTextureRegistry(),t=texture(src);registry.register(t,src);
  const runtime=new HdPackRuntime(registry,async()=>hd);
  const r=await runtime.setPack(manifest([await entry(src,hd as ReturnType<typeof image>)]));
  expect(r.applied).toBe(1);
  expect([3,7,11,15].map(i=>t.image.data?.[i])).toEqual([0,128,255,255]);
  expect(Array.from(hd.data.slice(0,3))).toEqual([1,1,1]);   // colour untouched
 });
});

describe('a bitmap flipped top row first keys by its decode and takes its replacement flipped (HUD, ARMORY)', ()=>{
 const decode=()=>({width:1,height:2,data:new Uint8ClampedArray([10,10,10,255, 20,20,20,255])});
 const hd={width:1,height:2,data:new Uint8ClampedArray([1,1,1,128, 2,2,2,128])};
 it('keys by the bytes turned back, so a bitmap flipped in the map worker (a structured clone) still matches', async()=>{
  const d=decode(),flipped=structuredClone(flipRows(d)),registry=new HdTextureRegistry();
  const t=new DataTexture(flipped.data,flipped.width,flipped.height);registry.register(t,flipped,true);
  expect(Array.from(registry.source(t)!.data)).toEqual(Array.from(d.data));
  const r=await new HdPackRuntime(registry,async()=>hd).setPack(manifest([await entry(d,hd)]));
  expect(r.applied).toBe(1);
  expect(Array.from(t.image.data as unknown as Uint8ClampedArray)).toEqual([2,2,2,255, 1,1,1,255]);
 });
 it("leaves an unflipped texture's replacement as it is, and a re-registration unflipped clears the flag", async()=>{
  const d=decode(),registry=new HdTextureRegistry(),t=texture(d);
  registry.register(t,flipRows(d),true);registry.register(t,d);
  expect(registry.isFlipped(t)).toBe(false);
  await new HdPackRuntime(registry,async()=>hd).setPack(manifest([await entry(d,hd)]));
  expect(Array.from(t.image.data as unknown as Uint8ClampedArray)).toEqual([1,1,1,255, 2,2,2,255]);
 });
});

describe('a 2D drawer\'s replacement larger than its unmipmapped bilinear original gets a mip chain (the HUD\'s 3-4x payloads drawn at the original size)', ()=>{
 it('generates a chain and trilinear minification for the replacement, and restores the original\'s filter', async()=>{
  const src=image(2,2,[9,9,9,255]),hd=image(8,8,[1,1,1,128]),registry=new HdTextureRegistry(),t=texture(src);
  t.minFilter=LinearFilter;t.generateMipmaps=false;registry.register(t,flipRows(src),true);
  const runtime=new HdPackRuntime(registry,async()=>hd);await runtime.setPack(manifest([await entry(src,hd)]));
  expect(t.generateMipmaps).toBe(true);expect(t.minFilter).toBe(LinearMipmapLinearFilter);
  await runtime.setPack(null);expect(t.generateMipmaps).toBe(false);expect(t.minFilter).toBe(LinearFilter);
 });
 it('leaves a nearest-filtered original (the reticle\'s) and a same-size replacement unmipmapped', async()=>{
  const src=image(2,2,[9,9,9,255]),hd=image(8,8,[1,1,1,128]),same=image(2,2,[2,2,2,128]);
  const registry=new HdTextureRegistry(),t=texture(src);t.minFilter=NearestFilter;t.generateMipmaps=false;registry.register(t,flipRows(src),true);
  await new HdPackRuntime(registry,async()=>hd).setPack(manifest([await entry(src,hd)]));
  expect(t.generateMipmaps).toBe(false);expect(t.minFilter).toBe(NearestFilter);
  const r2=new HdTextureRegistry(),u=texture(src);u.minFilter=LinearFilter;u.generateMipmaps=false;r2.register(u,flipRows(src),true);
  await new HdPackRuntime(r2,async()=>same).setPack(manifest([await entry(src,same)]));
  expect(u.generateMipmaps).toBe(false);expect(u.minFilter).toBe(LinearFilter);
 });
 it('leaves a world texture (unflipped: alpha-tested cut-outs) unmipmapped, as the pack drew it before', async()=>{
  const src=image(2,2,[9,9,9,255]),hd=image(8,8,[1,1,1,128]),registry=new HdTextureRegistry(),t=texture(src);
  t.minFilter=LinearFilter;t.generateMipmaps=false;registry.register(t,src);
  await new HdPackRuntime(registry,async()=>hd).setPack(manifest([await entry(src,hd)]));
  expect(t.generateMipmaps).toBe(false);expect(t.minFilter).toBe(LinearFilter);
 });
});
