import {describe,expect,it} from 'vitest';
import {DataTexture,LinearFilter,LinearMipmapLinearFilter,NearestFilter} from 'three';
import {HdPackRuntime,HdTextureRegistry,HD_LIMITS,HD_CONCURRENT_LOADS,HD_UI_SAMPLING,drawPlacements,fullAlpha,hdCompositeSize,hdKeyOf,hdKeyPeak,hdTextures,markDerived,seedHdKey,upscaleRgba,validateHdManifest,
 type HdAlphaStep,type HdEntry,type HdManifest,type HdPlacement,type HdSampling} from '../src/hdTexturePack';
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
 it('LATER 742: an optional packedBytes (the payloads as served) is kept; a manifest without it (0.1.x packs) still loads',async()=>{
  const e=await entry(image(2,2,[1,2,3,255]),image(4,4,[4,5,6,255])),m=manifest([e]);
  const without=validateHdManifest(m);expect(without.packedBytes).toBeUndefined();expect('packedBytes' in without).toBe(false);
  const withIt=validateHdManifest({...m,packedBytes:41});expect(withIt.packedBytes).toBe(41);
  expect(validateHdManifest(JSON.parse(JSON.stringify(withIt)))).toEqual(withIt);
  for(const bad of [0,-1,1.5,'41',null,HD_LIMITS.totalBytes+1024*HD_LIMITS.entries+1])
   expect(()=>validateHdManifest({...m,packedBytes:bad}),String(bad)).toThrow(/packedBytes/);
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

// HD placements (OT.R92, plan 2026-10-31-hd-texture-pack-parity, HD.R9): a pack file PCSX2 named for a part of a texture
// (a window read, a region, a block patch, an overlapped half) is drawn on that part of its target only.
describe('HD placements: a pack image drawn into a sub-rectangle of its target',()=>{
 type Img={width:number;height:number;data:Uint8ClampedArray};
 const px=(img:{width:number;data:unknown},x:number,y:number)=>Array.from((img.data as Uint8ClampedArray).subarray((y*img.width+x)*4,(y*img.width+x)*4+4));
 const two=()=>({width:2,height:2,data:new Uint8ClampedArray([10,0,0,255, 20,0,0,255, 30,0,0,255, 40,0,0,255])});
 const placed=(src:Img,hd:Img,file:string,placements:HdPlacement[],over:Partial<HdEntry>={})=>
  entry(src as ReturnType<typeof image>,hd as ReturnType<typeof image>,file,{placements,placementKind:'crop',...over});
 it('accepts placement entries, several to a key, beside a whole entry; an old manifest is unchanged',async()=>{
  const src=two(),a=await placed(src,image(4,4,[1,2,3,128]),'0.png',[{dst:[1,0,1,1],src:[0,0,4,4]}]);
  const b=await placed(src,image(8,4,[4,5,6,128]),'1.png',[{dst:[0,1,1,1],src:[0,0,4,4]},{dst:[1,1,1,1],src:[4,0,4,4]}],{placementKind:'blocks'});
  const w=await entry(src,image(8,8,[7,8,9,128]),'2.png');
  const m=manifest([w,a,b]);
  expect(validateHdManifest(JSON.parse(JSON.stringify(m)))).toEqual(m);
  expect(Object.keys(validateHdManifest(manifest([w])).entries[0]!)).not.toContain('placements');
 });
 it('refuses a placement outside its target or its image, at an uneven scale, or without its kind',async()=>{
  const src=two(),ok=await placed(src,image(4,4,[1,2,3,128]),'0.png',[{dst:[1,0,1,1],src:[0,0,4,4]}]);
  const bad=(p:Partial<HdEntry>)=>()=>validateHdManifest(manifest([{...ok,...p}]));
  expect(bad({placements:[{dst:[2,0,1,1],src:[0,0,4,4]}]})).toThrow(/outside its target/);
  expect(bad({placements:[{dst:[0,0,1,1],src:[1,0,4,4]}]})).toThrow(/outside its image/);
  expect(bad({placements:[{dst:[0,0,1,1],src:[0,0,4,2]}]})).toThrow(/scale/);
  expect(bad({placements:[{dst:[0,0,2,2],src:[0,0,3,3]}]})).toThrow(/scale/);
  expect(bad({placements:[]})).toThrow(/placements/);
  expect(bad({placementKind:undefined})).toThrow(/kind/);
  expect(bad({placementKind:'nope' as HdEntry['placementKind']})).toThrow(/kind/);
  expect(()=>validateHdManifest(manifest([ok,{...ok,file:'1.png',width:4,height:1}]))).toThrow(/size/);
  const w=await entry(src,image(8,8,[7,8,9,128]),'2.png');
  expect(()=>validateHdManifest(manifest([w,{...w,file:'3.png'}]))).toThrow(/duplicate key/);   // two whole entries: still refused
 });
 it('composites a 1x1 placement at 4x into a 2x2 nearest target: 8x8, the placement\'s texels there, the original\'s elsewhere',async()=>{
  const src=two(),hd=image(4,4,[1,2,3,64]),registry=new HdTextureRegistry(),t=texture(src);t.magFilter=NearestFilter;registry.register(t,src);
  const runtime=new HdPackRuntime(registry,async()=>hd);
  const r=await runtime.setPack(manifest([await placed(src,hd,'0.png',[{dst:[1,0,1,1],src:[0,0,4,4]}])]));
  expect(r).toEqual({applied:1,skipped:[]});
  const out=t.image as Img,orig=[[10,20],[30,40]];
  expect([out.width,out.height]).toEqual([8,8]);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)
   expect(px(out,x,y),`${x},${y}`).toEqual(x>=4&&y<4?[1,2,3,128]:[orig[y>>2]![x>>2]!,0,0,255]);   // the pack's 64 of 0x80 rescaled
  expect(runtime.appliedBytes).toBe(8*8*4);
 });
 it('upscales a linear target\'s other texels bilinearly (as the GPU sampled the original), clamped where it clamps',async()=>{
  const src=two(),hd=image(4,4,[1,2,3,128]),registry=new HdTextureRegistry(),t=texture(src);t.magFilter=LinearFilter;registry.register(t,src);   // clamped (the default wrap)
  await new HdPackRuntime(registry,async()=>hd).setPack(manifest([await placed(src,hd,'0.png',[{dst:[1,1,1,1],src:[0,0,4,4]}])]));
  const out=t.image as Img;
  expect(px(out,0,0)).toEqual([10,0,0,255]);    // the clamped corner
  expect(px(out,3,0)).toEqual([14,0,0,255]);    // u = 3.5/4 - 0.5 = 0.375 of the way from 10 to 20
  expect(px(out,5,5)).toEqual([1,2,3,255]);     // the placement
 });
 it('combines several placements and entries on one target, over the whole replacement where there is one, and restores',async()=>{
  const src=two(),whole=image(8,8,[5,5,5,128]),a=image(4,4,[1,1,1,128]);
  const b:Img={width:8,height:4,data:new Uint8ClampedArray([...Array(32)].flatMap((_,i)=>(i%8)<4?[2,2,2,128]:[3,3,3,128]))};
  const payloads=new Map<string,Img>([['0.png',whole],['1.png',a],['2.png',b]]);
  const registry=new HdTextureRegistry(),t=texture(src);t.magFilter=NearestFilter;registry.register(t,src);const original=t.image;
  const runtime=new HdPackRuntime(registry,async e=>payloads.get(e.file)!);
  const r=await runtime.setPack(manifest([await entry(src,whole,'0.png'),await placed(src,a,'1.png',[{dst:[0,0,1,1],src:[0,0,4,4]}]),
   await placed(src,b,'2.png',[{dst:[0,1,1,1],src:[0,0,4,4]},{dst:[1,1,1,1],src:[4,0,4,4]}],{placementKind:'blocks'})]));
  expect(r).toEqual({applied:1,skipped:[]});
  const out=t.image as Img;
  expect([out.width,out.height]).toEqual([8,8]);
  expect(px(out,1,1)).toEqual([1,1,1,255]);expect(px(out,6,1)).toEqual([5,5,5,255]);expect(px(out,1,6)).toEqual([2,2,2,255]);expect(px(out,6,6)).toEqual([3,3,3,255]);
  await runtime.setPack(null);expect(t.image).toBe(original);expect(runtime.applied).toBe(0);
 });
 it('keeps the other placements when one payload fails its hash, and the original when every one fails',async()=>{
  const src=two(),a=image(4,4,[1,1,1,128]),c=image(4,4,[9,9,9,128]);
  const registry=new HdTextureRegistry(),t=texture(src);t.magFilter=NearestFilter;registry.register(t,src);
  const ea=await placed(src,a,'0.png',[{dst:[0,0,1,1],src:[0,0,4,4]}]),ec={...await placed(src,c,'1.png',[{dst:[1,1,1,1],src:[0,0,4,4]}]),sha256:'f'.repeat(64)};
  const r=await new HdPackRuntime(registry,async e=>e.file==='0.png'?a:c).setPack(manifest([ea,ec]));
  expect(r.applied).toBe(1);expect(r.skipped.map(s=>s.reason)).toEqual(['payload hash does not match its entry']);
  expect(px(t.image as Img,0,0)).toEqual([1,1,1,255]);expect(px(t.image as Img,7,7)).toEqual([40,0,0,255]);
  const r2=new HdTextureRegistry(),u=texture(src);r2.register(u,src);
  expect((await new HdPackRuntime(r2,async()=>c).setPack(manifest([ec]))).applied).toBe(0);expect(u.image.width).toBe(2);
 });
 it('reserves the composite at the larger of the whole\'s and every placement\'s scale (a whole 2x, a placement 4x; review F2)',async()=>{
  // The whole fails its hash, so build makes the composite from the original at the placement's 4x: 8x8, not the whole's 4x4.
  const src=two(),whole=image(4,4,[5,5,5,128]),a=image(4,4,[1,1,1,128]);
  const registry=new HdTextureRegistry(),t=texture(src);t.magFilter=NearestFilter;registry.register(t,src);
  let seen=-1;
  const runtime=new HdPackRuntime(registry,async e=>{seen=Math.max(seen,(runtime as unknown as {reserved:number}).reserved);return e.file==='0.png'?whole:a;});
  const ew={...await entry(src,whole,'0.png'),sha256:'f'.repeat(64)},ea=await placed(src,a,'1.png',[{dst:[0,0,1,1],src:[0,0,4,4]}]);
  const r=await runtime.setPack(manifest([ew,ea]));
  expect(r.applied).toBe(1);expect([t.image.width,t.image.height]).toEqual([8,8]);
  expect(seen).toBe(8*8*4+2*a.data.length);   // the 8x8 composite and the largest payload with its hash copy (GM-13c review F3)
 });
 it('a flipped bitmap takes the composite turned top row first',async()=>{
  const src=two(),hd=image(4,4,[1,2,3,128]),registry=new HdTextureRegistry(),t=texture(flipRows(src) as ReturnType<typeof image>);t.magFilter=NearestFilter;registry.register(t,flipRows(src),true);
  await new HdPackRuntime(registry,async()=>hd).setPack(manifest([await placed(src,hd,'0.png',[{dst:[1,0,1,1],src:[0,0,4,4]}])]));
  const out=t.image as Img;
  expect(px(out,5,7)).toEqual([1,2,3,255]);expect(px(out,5,0)).toEqual([40,0,0,255]);
 });
 it('replacement() (the menus\') composites the same placements, bilinear and repeating (the UI\'s reading)',async()=>{
  const src=two(),hd=image(4,4,[1,2,3,128]);
  const runtime=new HdPackRuntime(new HdTextureRegistry(false),async()=>hd);
  await runtime.setPack(manifest([await placed(src,hd,'0.png',[{dst:[1,0,1,1],src:[0,0,4,4]}])]));
  const got=(await runtime.replacement(src))!;
  expect([got.width,got.height]).toEqual([8,8]);expect(px(got,5,1)).toEqual([1,2,3,255]);
  expect(px(got,0,7)).toEqual([26,0,0,255]);   // (-0.375, 1.375) wraps: 33.75 (row 1) x 0.625 + 13.75 (row 0) x 0.375
 });
});

// GM-13c (plan 2026-11-01-gpu-menus, row GM-13c; agent/hd-subrect review F3, GM-13b review F6): a key's payloads are
// decoded and composited in turn -- each decoded, checked, drawn and let go before the next is asked for -- so one key's
// decoded bytes never pass its composite plus its largest payload (font_titlebar_01: 8 regions and its whole, ~120 MB
// decoded at once before). PRODUCT TRACK: the composite is byte for byte the one drawn all at once.
describe('GM-13c: a key\'s payloads decoded in turn',()=>{
 type Img={width:number;height:number;data:Uint8ClampedArray};
 /** Deterministic bytes, alpha over the whole 0..255 (over 0x80 too: `fullAlpha` clamps). */
 const noise=(w:number,h:number,seed:number):Img=>({width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h*4},(_,i)=>(i*37+seed*101+((i*i)>>3))%256))});
 const as=(r:Img)=>r as ReturnType<typeof image>;
 const placedEntry=(src:Img,hd:Img,file:string,placements:HdPlacement[],over:Partial<HdEntry>={})=>entry(as(src),as(hd),file,{placements,placementKind:'crop',...over});
 /**
  * The fake decoder. Each load hands out a fresh copy of its file's pixels. Retention (review F4): when the next load is
  * asked for, every copy handed out before it is overwritten with a sentinel, so a build that still reads an earlier
  * payload after asking for the next -- one holding several at once -- draws the sentinel or fails its hash, and the
  * byte-identity checks catch it. Overlap: a payload counts live from its load until a later load is asked for after it
  * arrived, so a build that asks for several before any arrives shows them all live at once (`peak`).
  */
 const SENTINEL=0x5a;
 const ledger=(files:Map<string,Img>)=>{
  const held:{bytes:number;arrived:boolean}[]=[],handed:Uint8ClampedArray[]=[];let peak=0,loads=0;
  const load=async(e:HdEntry):Promise<Img>=>{
   loads++;
   for(const d of handed.splice(0))d.fill(SENTINEL);
   for(let i=held.length-1;i>=0;i--)if(held[i]!.arrived)held.splice(i,1);
   const h={bytes:e.bytes,arrived:false};held.push(h);peak=Math.max(peak,held.reduce((n,x)=>n+x.bytes,0));
   await new Promise(r=>setTimeout(r,2));h.arrived=true;
   const f=files.get(e.file);if(!f)throw new Error(`no ${e.file}`);
   const copy={width:f.width,height:f.height,data:new Uint8ClampedArray(f.data)};handed.push(copy.data);return copy;
  };
  return {load,peak:()=>peak,loads:()=>loads};
 };
 /** Today's build, the ordering the composite is held to: the passing whole's alpha copy (or the original carried to the
  * passing placements' scale), then each passing placement drawn over it in manifest order from its alpha copy. */
 const reference=(src:Img,whole:{e:HdEntry;image:Img}|null,layers:{e:HdEntry;image:Img}[],s:HdSampling):Img|null=>{
  if(!layers.length)return whole?{width:whole.image.width,height:whole.image.height,data:fullAlpha(whole.image.data)}:null;
  const size=hdCompositeSize(src.width,src.height,whole?.e,layers.map(l=>l.e));
  const out={width:size.width,height:size.height,data:whole?fullAlpha(whole.image.data):upscaleRgba(src,size.width,size.height,s)};
  for(const l of layers)drawPlacements(out,src.width,src.height,{width:l.image.width,height:l.image.height,data:fullAlpha(l.image.data)},l.e.placements!);
  return out;
 };
 const same=(got:Img|null,want:Img|null)=>{
  expect(got&&[got.width,got.height]).toEqual(want&&[want.width,want.height]);
  if(got&&want)expect(Buffer.from(got.data.buffer,got.data.byteOffset,got.data.byteLength).equals(Buffer.from(want.data.buffer,want.data.byteOffset,want.data.byteLength))).toBe(true);
 };

 // font_titlebar_01's shape, small: a 4x2 target, its whole at 4x and eight regions at 4x, each region's image larger
 // than the whole (as the 512 x 512 regions are), overlapping one another.
 const titlebar=async()=>{
  const src=noise(4,2,1),whole=noise(16,8,2),files=new Map<string,Img>([['0.png',whole]]);
  const entries:HdEntry[]=[await entry(as(src),as(whole),'0.png')];
  for(let i=0;i<8;i++){
   const hd=noise(8,8,10+i);files.set(`${i+1}.png`,hd);
   entries.push(await placedEntry(src,hd,`${i+1}.png`,[{dst:[i%3,0,2,2],src:[0,0,8,8]}]));
  }
  return {src,whole,files,entries,largest:Math.max(...entries.map(e=>e.bytes)),composite:16*8*4};
 };
 it('replacement() holds one payload at a time: never more than the largest, 9 loads, the same composite',async()=>{
  const k=await titlebar(),l=ledger(k.files);
  const runtime=new HdPackRuntime(new HdTextureRegistry(false),l.load);
  await runtime.setPack(manifest(k.entries));
  const got=await runtime.replacement(as(k.src));
  expect(l.loads()).toBe(9);
  expect(l.peak()).toBeLessThanOrEqual(k.largest);           // with the composite: composite + max(payload), not the sum
  same(got,reference(k.src,{e:k.entries[0]!,image:k.whole},k.entries.slice(1).map(e=>({e,image:k.files.get(e.file)!})),HD_UI_SAMPLING));
 });
 it('a texture (the match\'s pack) the same: one payload at a time, and its reservation is the composite plus the largest payload',async()=>{
  const k=await titlebar(),l=ledger(k.files),registry=new HdTextureRegistry(),t=texture(as(k.src));t.magFilter=NearestFilter;registry.register(t,as(k.src));
  let seen=-1;
  const runtime=new HdPackRuntime(registry,async e=>{seen=Math.max(seen,(runtime as unknown as {reserved:number}).reserved);return l.load(e);});
  const r=await runtime.setPack(manifest(k.entries));
  expect(r).toEqual({applied:1,skipped:[]});
  expect(l.peak()).toBeLessThanOrEqual(k.largest);
  // the composite, the largest payload and its hash copy (`texturePack.ts` `sha256`, review F3: as `hdLoadBytes`
  // counts it); was the composite plus every placement's payload
  expect(seen).toBe(k.composite+2*k.largest);
  same(t.image as Img,reference(k.src,{e:k.entries[0]!,image:k.whole},k.entries.slice(1).map(e=>({e,image:k.files.get(e.file)!})),{filter:'nearest',repeatS:false,repeatT:false}));
 });
 it('a whole alone (every entry before HD.R9) reserves as before: its composite only, so the match admits it as before',async()=>{
  const src=noise(4,2,1),whole=noise(16,8,2),registry=new HdTextureRegistry(),t=texture(as(src));registry.register(t,as(src));
  let seen=-1;
  const runtime=new HdPackRuntime(registry,async()=>{seen=Math.max(seen,(runtime as unknown as {reserved:number}).reserved);return whole;});
  expect((await runtime.setPack(manifest([await entry(as(src),as(whole),'0.png')]))).applied).toBe(1);
  expect(seen).toBe(16*8*4);
 });

 // Odd sizes and overlaps: a 5x3 target; A at 3x over 3x3 texels, B at 2x in two 2x2 rectangles (one over A's), E at 4x
 // over one texel (the composite's largest scale), W the whole at 2x (so A and E draw finer than it: averaged cells or
 // bilinear). Each composite is held byte for byte to today's ordering.
 const odd=async()=>{
  const src=noise(5,3,3),W=noise(10,6,4),A=noise(9,9,5),B=noise(4,6,6),E=noise(4,4,7);
  const files=new Map<string,Img>([['0.png',W],['1.png',A],['2.png',B],['3.png',E]]);
  const w=await entry(as(src),as(W),'0.png');
  const a=await placedEntry(src,A,'1.png',[{dst:[1,0,3,3],src:[0,0,9,9]}]);
  const b=await placedEntry(src,B,'2.png',[{dst:[0,1,2,2],src:[0,0,4,4]},{dst:[3,1,2,2],src:[0,2,4,4]}],{placementKind:'blocks'});
  const e=await placedEntry(src,E,'3.png',[{dst:[4,2,1,1],src:[0,0,4,4]}]);
  return {src,files,w,a,b,e,img:(x:HdEntry)=>files.get(x.file)!};
 };
 const run=async(src:Img,files:Map<string,Img>,entries:HdEntry[])=>{
  const l=ledger(files),runtime=new HdPackRuntime(new HdTextureRegistry(false),l.load);
  await runtime.setPack(manifest(entries));
  return {got:await runtime.replacement(as(src)),l,runtime};
 };
 it('byte-identical over odd sizes and overlaps: the whole and every placement',async()=>{
  const o=await odd(),{got,l}=await run(o.src,o.files,[o.w,o.a,o.b,o.e]);
  expect(l.peak()).toBeLessThanOrEqual(Math.max(o.w.bytes,o.a.bytes,o.b.bytes,o.e.bytes));
  same(got,reference(o.src,{e:o.w,image:o.img(o.w)},[o.a,o.b,o.e].map(e=>({e,image:o.img(e)})),HD_UI_SAMPLING));
 });
 it('byte-identical without a whole: the original carried to the placements\' 4x',async()=>{
  const o=await odd(),{got}=await run(o.src,o.files,[o.a,o.b,o.e]);
  expect([got!.width,got!.height]).toEqual([20,12]);
  same(got,reference(o.src,null,[o.a,o.b,o.e].map(e=>({e,image:o.img(e)})),HD_UI_SAMPLING));
 });
 it('byte-identical when the largest-scale placement is refused: the composite at the passing ones\' 3x, as before',async()=>{
  const o=await odd(),bad={...o.e,sha256:'f'.repeat(64)},{got,runtime}=await run(o.src,o.files,[o.a,o.b,bad]);
  expect([got!.width,got!.height]).toEqual([15,9]);
  same(got,reference(o.src,null,[o.a,o.b].map(e=>({e,image:o.img(e)})),HD_UI_SAMPLING));
  expect(runtime.skipped().map(s=>s.reason)).toContain('payload hash does not match its entry');
 });
 it('byte-identical when the whole is refused, and when every placement is (the whole alone)',async()=>{
  const o=await odd(),badW={...o.w,sha256:'f'.repeat(64)};
  same((await run(o.src,o.files,[badW,o.a,o.b])).got,reference(o.src,null,[o.a,o.b].map(e=>({e,image:o.img(e)})),HD_UI_SAMPLING));
  const badA={...o.a,sha256:'f'.repeat(64)},badB={...o.b,sha256:'f'.repeat(64)};
  same((await run(o.src,o.files,[o.w,badA,badB])).got,reference(o.src,{e:o.w,image:o.img(o.w)},[],HD_UI_SAMPLING));
  expect((await run(o.src,o.files,[badA,badB])).got).toBeNull();
 });
 it('the key\'s peak: the composite (the larger of the whole\'s and the placements\' scale) and its largest payload',()=>{
  const p=(dst:HdPlacement['dst'],s:HdPlacement['src'])=>({bytes:s[2]*s[3]*4,placements:[{dst,src:s}]});
  // a whole at 2x (10x6) and placements at 3x and 4x: the composite at 4x, 20x12
  expect(hdKeyPeak(5,3,{outWidth:10,outHeight:6,bytes:10*6*4},[p([1,0,3,3],[0,0,9,9]),p([4,2,1,1],[0,0,4,4])])).toEqual({composite:20*12*4,payload:9*9*4});
  // a whole alone: its own size (or the target's, if larger), its payload
  expect(hdKeyPeak(5,3,{outWidth:20,outHeight:12,bytes:20*12*4},[])).toEqual({composite:20*12*4,payload:20*12*4});
 });
});

// GM-13d (plan 2026-11-01-gpu-menus, row GM-13d): the payload's key and the whole replacement's alpha rescale off the main
// thread for the menus' pack. PRODUCT TRACK, a browser adaptation: a key seeded by the decode worker (the same `sha256` over
// the same bytes) is the one the check reads, and the check itself stays; the alpha step is injected, `fullAlpha` by default.
describe('GM-13d: a seeded key, and the injected alpha step',()=>{
 const fresh=()=>image(4,4,[30,60,90,64]);
 it('a seeded key is what hdKeyOf answers; an image with none is hashed as before',async()=>{
  const r=fresh(),s=fresh();
  seedHdKey(r,'a'.repeat(64));
  expect(await hdKeyOf(r)).toBe('a'.repeat(64));
  expect(await hdKeyOf(s)).toBe(await keyOf(s));
 });
 it('a payload whose seeded key is its entry\'s is applied; one whose seeded key differs is refused with the same skip',async()=>{
  const src=image(2,2,[1,2,3,255]),e=await entry(src,fresh());
  const good=fresh();seedHdKey(good,e.sha256);
  const a=new HdPackRuntime(new HdTextureRegistry(false),async()=>good);await a.setPack(manifest([e]));
  expect((await a.replacement(src))?.width).toBe(4);
  const lied=fresh();seedHdKey(lied,'b'.repeat(64));
  const b=new HdPackRuntime(new HdTextureRegistry(false),async()=>lied);await b.setPack(manifest([e]));
  expect(await b.replacement(src)).toBeNull();
  expect(b.skipped()).toEqual([{key:e.key,source:e.source,reason:'payload hash does not match its entry'}]);
 });
 it('a payload with no seed whose computed key differs is refused with the same skip',async()=>{
  const src=image(2,2,[1,2,3,255]),e=await entry(src,fresh());
  const b=new HdPackRuntime(new HdTextureRegistry(false),async()=>image(4,4,[31,60,90,64]));await b.setPack(manifest([e]));
  expect(await b.replacement(src)).toBeNull();
  expect(b.skipped()[0]!.reason).toBe('payload hash does not match its entry');
 });
 it('the injected alpha step\'s output is what is applied, handed the checked whole once',async()=>{
  const src=image(2,2,[1,2,3,255]),hd=fresh(),e=await entry(src,hd),seen:number[]=[];
  const mark=image(4,4,[7,7,7,7]);
  const alpha:HdAlphaStep=async(r)=>{seen.push(r.data.length);return {width:r.width,height:r.height,data:new Uint8ClampedArray(mark.data)};};
  const runtime=new HdPackRuntime(new HdTextureRegistry(false),async()=>fresh(),undefined,alpha);await runtime.setPack(manifest([e]));
  const got=(await runtime.replacement(src))!;
  expect(seen).toEqual([hd.data.length]);
  expect(Array.from(got.data)).toEqual(Array.from(mark.data));
  const registry=new HdTextureRegistry(),t=texture(src);registry.register(t,src);
  await new HdPackRuntime(registry,async()=>fresh(),undefined,alpha).setPack(manifest([e]));
  expect(Array.from(t.image.data as unknown as Uint8ClampedArray)).toEqual(Array.from(mark.data));
 });
 it('the default is today\'s fullAlpha',async()=>{
  const src=image(2,2,[1,2,3,255]),hd=fresh(),e=await entry(src,hd);
  const runtime=new HdPackRuntime(new HdTextureRegistry(false),async()=>fresh());await runtime.setPack(manifest([e]));
  expect(Array.from((await runtime.replacement(src))!.data)).toEqual(Array.from(fullAlpha(fresh().data)));
 });
 // Review F1 (REVIEW-GM-13D): the match's path is exactly today's. A whole whose rescale throws (here a payload whose
 // pixels cannot be read, standing in for a copy that fails to allocate): with the default step `build` rejects as before
 // GM-13d -- the texture keeps its original, its placements not composited, the skip today's (no key, the error's
 // message); only an injected step's throw is the new skip, the build going on over the original.
 describe('review F1: a rescale that throws',()=>{
  const setup=async(alpha?:HdAlphaStep)=>{
   const src=image(2,2,[10,20,30,255]),hd=image(4,4,[1,2,3,128]),part=image(4,4,[4,5,6,128]);
   const whole=await entry(src,hd,'0.png'),place=await entry(src,part,'1.png',{placements:[{dst:[1,0,1,1],src:[0,0,4,4]}],placementKind:'crop'});
   const unreadable=new Proxy(new Uint8ClampedArray(0),{get(_t,k){if(k==='length')return hd.data.length;if(k===Symbol.iterator)return undefined;throw new RangeError('Array buffer allocation failed');}});
   const registry=new HdTextureRegistry(),t=texture(src);registry.register(t,src);
   const runtime=new HdPackRuntime(registry,async(e)=>{
    if(e.file==='1.png')return {width:4,height:4,data:new Uint8ClampedArray(part.data)};
    const r={width:4,height:4,data:unreadable as unknown as Uint8ClampedArray};seedHdKey(r,whole.sha256);return r;
   },undefined,alpha);
   return {t,whole,report:await runtime.setPack(manifest([whole,place]))};
  };
  it('the default step: build rejects as before -- the original kept, no placements, today\'s skip',async()=>{
   const {t,report}=await setup();
   expect(report.applied).toBe(0);expect(t.image.width).toBe(2);
   expect(report.skipped).toEqual([{key:'',source:'',reason:'Array buffer allocation failed'}]);
  });
  it('an injected step: the new skip, and the passing placements over the upscaled original',async()=>{
   const {t,whole,report}=await setup(async()=>{throw new Error('the worker died');});
   expect(report.skipped).toEqual([{key:whole.key,source:whole.source,reason:'alpha rescale unavailable (the worker died)'}]);
   expect(report.applied).toBe(1);expect(t.image.width).toBe(8);
  });
 });
 it('a payload another key also holds is never handed to the step: rescaled in place by fullAlpha, both keys right',async()=>{
  const a=image(2,2,[1,2,3,255]),b=image(2,2,[4,5,6,255]),hd=fresh(),calls:number[]=[];
  // The step hands the pixels over as a worker would (their buffer detached).
  const alpha:HdAlphaStep=async(r)=>{calls.push(1);const d=structuredClone(r.data,{transfer:[r.data.buffer as ArrayBuffer]});return {width:r.width,height:r.height,data:fullAlpha(d)};};
  const registry=new HdTextureRegistry(),ta=texture(a),tb=texture(b);registry.register(ta,a);registry.register(tb,b);
  let loads=0;
  const runtime=new HdPackRuntime(registry,async()=>{loads++;await new Promise(r=>setTimeout(r,5));return fresh();},undefined,alpha);
  const r=await runtime.setPack(manifest([await entry(a,hd),await entry(b,hd)]));
  expect(loads).toBe(1);expect(r).toEqual({applied:2,skipped:[]});expect(calls).toEqual([]);
  const want=Array.from(fullAlpha(fresh().data));
  expect(Array.from(ta.image.data as unknown as Uint8ClampedArray)).toEqual(want);expect(Array.from(tb.image.data as unknown as Uint8ClampedArray)).toEqual(want);
 });
});
