import {describe,expect,it} from 'vitest';
import {DataTexture,NoColorSpace,RepeatWrapping,LinearFilter} from 'three';
import {sha256,sourceDigest,validateManifest,PACK_LIMITS,type PackManifest,type PackSource} from '../src/texturePack';
import {TexturePackTarget,LocalTexturePacks,packTargetFor} from '../src/texturePackRuntime';
import {packSourcesFor} from '../src/texturePackSources';
import type {LoadedMap} from '../src/loadMap';
import {buildTexturePack,buildImportedPack,lanczos2x} from '../../../tools/localTexturePack';

const rgba=(n=2,colour=[30,80,140,255])=>({width:n,height:n,data:new Uint8ClampedArray(Array.from({length:n*n},()=>colour).flat())});
const flags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
const source=(key='wall'):PackSource=>({key,flags,levels:[rgba()],library:'MP51',record:key});
async function fixture(keys=['wall']) {
 const sources=keys.map(k=>source(k));
 return {sources,...await buildTexturePack(sources,{archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)})};
}
const target=(sources:PackSource[])=>{
 const textures=new Map(sources.map(s=>[s.key,new DataTexture(s.levels[0]!.data,s.levels[0]!.width,s.levels[0]!.height)]));
 return {textures,world:new TexturePackTarget(()=>new Map(sources.map(s=>[s.key,s])),textures,'MP51')};
};
const transport=(f:Awaited<ReturnType<typeof fixture>>,alter?:(url:string,r:Response)=>Response)=>{
 const requests:string[]=[];
 const fetcher=async(url:string)=>{requests.push(url);let response:Response;
  if(url.endsWith('current.json'))response=new Response(JSON.stringify({version:1,packId:f.id}));
  else if(url.endsWith('manifest.json'))response=new Response(f.manifestBytes.slice().buffer as ArrayBuffer);
  else {const data=f.payloads.get(url.split('/').at(-1)!);response=data?new Response(data.slice().buffer as ArrayBuffer):new Response('',{status:404});}
  return alter?.(url,response)??response;
 };return {requests,fetcher};
};

describe('local texture pack boundaries',()=>{
 it('binds provenance to decoded bytes, authored levels and flags',async()=>{
  const a=source(),b=source();expect(await sourceDigest(a)).toBe(await sourceDigest(b));
  b.levels[0]!.data[0]=31;expect(await sourceDigest(a)).not.toBe(await sourceDigest(b));
  b.levels=[...a.levels,rgba(1)];expect(await sourceDigest(a)).not.toBe(await sourceDigest(b));
  b.levels=a.levels;b.flags={...flags,bilinear:false};expect(await sourceDigest(a)).not.toBe(await sourceDigest(b));
 });
 it('generates deterministic payloads without modifying originals, preserving authored level indices',async()=>{
  const s=source();s.flags={...flags,gs:{blend:'none',alphaTest:null,depthTest:true,bilinear:true,mipmaps:true,levels:1,wrapS:'repeat',wrapT:'clamp'}};
  s.levels=[rgba(2),rgba(1,[200,20,5,255])];const before=s.levels.map(x=>Array.from(x.data));
  const provenance={archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)};
  const a=await buildTexturePack([s],provenance),b=await buildTexturePack([s],provenance);
  expect(a.id).toBe(b.id);expect(a.manifest.entries[0]!.levels.map(l=>[l.width,l.height,l.sourceLevel])).toEqual([[4,4,0],[2,2,1],[1,1,null]]);
  const bytes=a.payloads.get('0.rgba')!;expect(Array.from(bytes.slice(64,68))).toEqual([200,20,5,255]);
  expect(s.levels.map(x=>Array.from(x.data))).toEqual(before);expect(await sha256(a.manifestBytes)).toBe(a.id);
 });
 it('refuses nonopaque, oversized and too many inputs before generation',async()=>{
  const s=source();s.levels[0]!.data[3]=254;await expect(buildTexturePack([s],{} as never)).rejects.toThrow();
  const huge=source();huge.levels=[{width:1024,height:1024,data:new Uint8ClampedArray(0)}];await expect(buildTexturePack([huge],{} as never)).rejects.toThrow();
  await expect(buildTexturePack(Array.from({length:PACK_LIMITS.entries+1},(_,i)=>source(String(i))),{} as never)).rejects.toThrow();
 });
 it.each(['../outside.rgba','/root.rgba','https://remote/a.rgba','0.rgba?x','%2e%2e/a.rgba','0\\a.rgba'])('rejects unsafe payload %s',async(file)=>{
  const f=await fixture();f.manifest.entries[0]!.file=file;expect(()=>validateManifest(f.manifest)).toThrow();
 });
 it('rejects resource overflow, invalid source scale, duplicate entries and broken mip layouts',async()=>{
  const f=await fixture();
  const mutate=(fn:(m:PackManifest)=>void)=>{const m=structuredClone(f.manifest);fn(m);expect(()=>validateManifest(m)).toThrow();};
  mutate(m=>{m.entries[0]!.bytes=PACK_LIMITS.totalBytes+1;});
  mutate(m=>{m.entries[0]!.levels[0]!.width=1025;});
  mutate(m=>{m.entries[0]!.levels[0]!.offset=1;});
  mutate(m=>{m.entries.push(m.entries[0]!);});
  mutate(m=>{m.entries[0]!.sourceLevels[0]!.width=3;});
  mutate(m=>{m.version=2 as 1;});
 });
 it('does no requests when off; applies one complete entry and restores image identity and sampler state',async()=>{
  const f=await fixture(),t=target(f.sources),io=transport(f),p=new LocalTexturePacks(io.fetcher);
  const texture=t.textures.get('wall')!;texture.wrapS=RepeatWrapping;texture.magFilter=LinearFilter;texture.colorSpace=NoColorSpace;
  const image=texture.image,mips=texture.mipmaps;let disposed=0;texture.addEventListener('dispose',()=>disposed++);
  p.setTarget(t.world);await p.ready;expect(io.requests).toEqual([]);
  p.setEnabled(true);await p.ready;expect(texture.image.width).toBe(4);expect(p.applied).toBe(1);expect(disposed).toBe(1);
  expect([texture.wrapS,texture.magFilter,texture.colorSpace]).toEqual([RepeatWrapping,LinearFilter,NoColorSpace]);
  p.setEnabled(false);expect(texture.image).toBe(image);expect(texture.mipmaps).toBe(mips);expect(disposed).toBe(2);
  expect(p.applied).toBe(0);expect(t.world.retainedBytes).toBe(0);
 });
 it.each(['missing','corrupt','incompatible'])('%s entry retains its exact original',async(mode)=>{
  const f=await fixture(),t=target(f.sources);if(mode==='incompatible')f.sources[0]!.levels[0]!.data[0]=0;
  const io=transport(f,(url,r)=>url.endsWith('.rgba')?mode==='missing'?new Response('',{status:404}):mode==='corrupt'?new Response(new Uint8Array(64)):r:r);
  const p=new LocalTexturePacks(io.fetcher),original=t.textures.get('wall')!.image;
  p.setTarget(t.world);p.setEnabled(true);await p.ready;expect(p.applied).toBe(0);expect(t.textures.get('wall')!.image).toBe(original);
  if(mode==='incompatible')expect(io.requests.some(u=>u.endsWith('.rgba'))).toBe(false);
 });
 it('a bad entry does not prevent the next compatible texture',async()=>{
  const f=await fixture(['a','b']),t=target(f.sources),io=transport(f,(u,r)=>u.endsWith('/0.rgba')?new Response('',{status:404}):r);
  const p=new LocalTexturePacks(io.fetcher);p.setTarget(t.world);p.setEnabled(true);await p.ready;
  expect(t.textures.get('a')!.image.width).toBe(2);expect(t.textures.get('b')!.image.width).toBe(4);expect(p.applied).toBe(1);
 });
 it('missing manifest and overlarge streaming response fail silently',async()=>{
  const f=await fixture(),t=target(f.sources),p=new LocalTexturePacks(async()=>new Response('',{status:404}));
  p.setTarget(t.world);p.setEnabled(true);await p.ready;expect(p.applied).toBe(0);
  let cancelled=false;const q=new LocalTexturePacks(async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(2048));},cancel(){cancelled=true;}})));
  q.setTarget(t.world);q.setEnabled(true);await q.ready;expect(q.applied).toBe(0);expect(cancelled).toBe(true);
 });
 it('late payload cannot change a new map, disabled view or disposed target',async()=>{
  for(const action of ['off','map','dispose']){
   const f=await fixture(),t=target(f.sources),io=transport(f);let release!:()=>void;const gate=new Promise<void>(r=>release=r);let started!:()=>void;const arrived=new Promise<void>(r=>started=r);
   const p=new LocalTexturePacks(async(u)=>{if(u.endsWith('.rgba')){started();await gate;}return io.fetcher(u);});
   const original=t.textures.get('wall')!.image;p.setTarget(t.world);p.setEnabled(true);const pending=p.ready;await arrived;
   if(action==='off')p.setEnabled(false);else if(action==='map')p.setTarget(null);else t.world.dispose();
   release();await pending;expect(t.textures.get('wall')!.image).toBe(original);expect(p.applied).toBe(0);expect(t.world.retainedBytes).toBe(0);
  }
 });
 it('rejects manifest whose bytes do not match its selected pack ID',async()=>{
  const f=await fixture(),t=target(f.sources),io=transport(f,(u,r)=>u.endsWith('manifest.json')?new Response(JSON.stringify({...f.manifest,method:'other'})):r);
  const p=new LocalTexturePacks(io.fetcher);p.setTarget(t.world);p.setEnabled(true);await p.ready;
  // GX-21: current.json, packs.json (absent here), the manifest -- and no payload.
  expect(p.applied).toBe(0);expect(io.requests).toHaveLength(3);expect(io.requests.some(u=>u.endsWith(".rgba"))).toBe(false);
 });
 it.each(['alpha','flags'])('rejects a self-hashed pack which changes opaque %s semantics',async(mode)=>{
  const f=await fixture(),t=target(f.sources);
  if(mode==='alpha'){const data=f.payloads.get('0.rgba')!;data[3]=0;f.manifest.entries[0]!.sha256=await sha256(data);}
  else f.manifest.entries[0]!.sourceFlags={...flags,bilinear:false};
  f.manifestBytes=new TextEncoder().encode(JSON.stringify(f.manifest));f.id=await sha256(f.manifestBytes);
  const io=transport(f),p=new LocalTexturePacks(io.fetcher);p.setTarget(t.world);p.setEnabled(true);await p.ready;
  expect(p.applied).toBe(0);expect(t.textures.get('wall')!.image.width).toBe(2);
 });
});

describe('local 2x resampling',()=>{
 it('preserves a constant and avoids hidden RGB fringes at alpha zero',()=>{
  expect(Array.from(lanczos2x(rgba(1),'clamp','clamp').data)).toEqual(Array(4).fill([30,80,140,255]).flat());
  const transparent=rgba(1,[255,0,0,0]);expect(Array.from(lanczos2x(transparent,'repeat','repeat').data)).toEqual(Array(16).fill(0));
 });
 it('honors periodic boundaries rather than clamping a tiling seam',()=>{
  const s={width:2,height:1,data:new Uint8ClampedArray([0,0,0,255,200,200,200,255])};
  const repeat=lanczos2x(s,'repeat','clamp'),clamp=lanczos2x(s,'clamp','clamp');
  expect(repeat.data[0]).toBeGreaterThan(0);expect(clamp.data[0]).toBe(0);expect(repeat.data[0]).toBe(repeat.data[4]);
  expect(repeat.data[8]).toBe(repeat.data[12]);expect(s.data[0]).toBe(0);
 });
});

describe('GX.R4 caps and the 4x swap (plan 2026-10-09-web-graphics-upscale-pack)',()=>{
 const hash=(c:string)=>c.repeat(64);
 /** A synthetic manifest entry: a source edge/scale, one level or a whole chain; only the validator reads it. */
 const entry=(i:number,edge:number,{scale=4,mipmaps=false,height=edge}:{scale?:number;mipmaps?:boolean;height?:number}={})=>{
  const levels:{width:number;height:number;offset:number;bytes:number;sourceLevel:number|null}[]=[];let offset=0;
  for(let w=edge,h=height;;w=Math.max(1,w>>1),h=Math.max(1,h>>1)){levels.push({width:w,height:h,offset,bytes:w*h*4,sourceLevel:levels.length?null:0});offset+=w*h*4;if(!mipmaps||(w===1&&h===1))break;}
  return {key:`k${i}`,file:`${i}.rgba`,bytes:offset,sha256:hash('d'),sourceDigest:hash('e'),sourceFlags:flags,sourceLevels:[{width:Math.max(1,edge/scale),height:Math.max(1,height/scale),sha256:hash('f')}],library:'MP51',record:`k${i}`,mipmaps,levels};
 };
 const manifest=(entries:ReturnType<typeof entry>[],extra:Partial<PackManifest>={})=>({format:'s2u-local-texture-pack',version:1,mapArchive:'RUN/MP51.ZDB',localOnly:true,method:'realesrgan-ncnn-vulkan 20220424 x4plus weights sha256 '+hash('9'),scale:4,
  provenance:{archiveSha256:hash('a'),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:hash('c')},totalBytes:entries.reduce((n,e)=>n+e.bytes,0),entries,...extra}) as unknown as PackManifest;
 it('accepts a 2048 edge and refuses 2049 and 4096; the per-entry 16 MiB and a full 2048 chain of twelve levels',()=>{
  expect(PACK_LIMITS).toMatchObject({entries:256,sourceEdge:512,outputEdge:2048,entryBytes:16*1024*1024,totalBytes:192*1024*1024});
  expect(()=>validateManifest(manifest([entry(0,2048)]))).not.toThrow();
  const odd=entry(0,2048);odd.levels[0]!.width=2049;odd.bytes=odd.levels[0]!.bytes=2049*2048*4;expect(()=>validateManifest(manifest([odd]))).toThrow();
  const big=entry(0,4096,{scale:8});expect(()=>validateManifest(manifest([big]))).toThrow();
  expect(()=>validateManifest(manifest([entry(0,2048,{height:1024,mipmaps:true})]))).not.toThrow();
  expect(entry(0,2048,{height:1024,mipmaps:true}).levels).toHaveLength(12);
  expect(()=>validateManifest(manifest([entry(0,2048,{mipmaps:true})]))).toThrow();
 });
 it('GX-25 round 7: a chain ends at its first 1x1 -- exactly one accepted, a second refused as "levels past the first 1x1"',()=>{
  const one=entry(0,8,{mipmaps:true});expect(one.levels.map(l=>l.width)).toEqual([8,4,2,1]);
  expect(()=>validateManifest(manifest([one]))).not.toThrow();
  const two=entry(0,8,{mipmaps:true});two.levels.push({width:1,height:1,offset:two.bytes,bytes:4,sourceLevel:null});two.bytes+=4;
  expect(()=>validateManifest(manifest([two]))).toThrow('levels past the first 1x1');
  const flat=entry(0,8,{mipmaps:true,height:2,scale:2});expect(flat.levels.map(l=>[l.width,l.height])).toEqual([[8,2],[4,1],[2,1],[1,1]]);
  expect(()=>validateManifest(manifest([flat],{scale:2}))).not.toThrow();
 });
 it('accepts a 192 MiB pack and refuses one entry more; 256 entries at most',()=>{
  const full=Array.from({length:12},(_,i)=>entry(i,2048));expect(()=>validateManifest(manifest(full))).not.toThrow();
  expect(()=>validateManifest(manifest([...full,entry(12,8)]))).toThrow();
  expect(()=>validateManifest(manifest(Array.from({length:256},(_,i)=>entry(i,8))))).not.toThrow();
  expect(()=>validateManifest(manifest(Array.from({length:257},(_,i)=>entry(i,8))))).toThrow();
 });
 it('method is any bounded printable text; scale is 2 or 4 and binds every authored level',()=>{
  const one=[entry(0,8)];
  for(const method of ['lanczos3','x'.repeat(512)])expect(()=>validateManifest(manifest(one,{method}))).not.toThrow();
  for(const method of ['','x'.repeat(513),'a\nb','tab\there','caf\u00e9',7])expect(()=>validateManifest(manifest(one,{method} as never))).toThrow();
  expect(()=>validateManifest(manifest([entry(0,8,{scale:2})],{scale:2}))).not.toThrow();
  for(const scale of [1,3,8,'4'])expect(()=>validateManifest(manifest([entry(0,8,{scale:Number(scale)})],{scale} as never))).toThrow();
  expect(()=>validateManifest(manifest([entry(0,8,{scale:2})],{scale:4}))).toThrow();
 });
 it('a 4x imported pack takes the same size-changing swap as 2x and restores exactly',async()=>{
  const s=source(),f={sources:[s],...await buildImportedPack([{source:s,base:rgba(8)}],{method:'nearest-4x test stand-in',scale:4},{archiveSha256:hash('a'),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:hash('c')})};
  expect(f.manifest).toMatchObject({method:'nearest-4x test stand-in',scale:4});expect(f.leftOut).toEqual([]);
  const t=target(f.sources),texture=t.textures.get('wall')!,image=texture.image;let disposed=0;texture.addEventListener('dispose',()=>disposed++);
  const p=new LocalTexturePacks(transport(f).fetcher);p.setTarget(t.world);p.setEnabled(true);await p.ready;
  expect([texture.image.width,texture.image.height,p.applied,disposed]).toEqual([8,8,1,1]);
  p.setEnabled(false);expect(texture.image).toBe(image);expect(disposed).toBe(2);
 });
});

describe('GX-1b roles: the manifest names its source set and the runtime honours it',()=>{
 it('accepts world, wide or none (world); refuses anything else',async()=>{
  const f=await fixture();expect(f.manifest.roles).toBe('world');
  for(const roles of ['world','wide',undefined])expect(()=>validateManifest({...structuredClone(f.manifest),roles} as PackManifest)).not.toThrow();
  for(const roles of ['all','WIDE',1,null])expect(()=>validateManifest({...structuredClone(f.manifest),roles} as never)).toThrow();
 });
 it('a wide pack reaches a texture only the wide set holds; a world pack does not',async()=>{
  for(const roles of ['world','wide'] as const){
   const s=source('crate'),built=await buildImportedPack([{source:s,base:rgba(4)}],{method:'nearest-2x',scale:2,roles},{archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)});
   expect(built.manifest.roles).toBe(roles);
   const textures=new Map([[s.key,new DataTexture(s.levels[0]!.data,2,2)]]),asked:string[]=[];
   const world=new TexturePackTarget(r=>{asked.push(r);return new Map(r==='wide'?[[s.key,s]]:[]);},textures,'MP51');
   const p=new LocalTexturePacks(transport({sources:[s],...built}).fetcher);p.setTarget(world);p.setEnabled(true);await p.ready;
   expect(asked).toEqual([roles]);expect(p.applied).toBe(roles==='wide'?1:0);expect(textures.get('crate')!.image.width).toBe(roles==='wide'?4:2);
  }
 });
});

describe('GX-1e: any map archive (GX.R9; was GX-1c, the three lobby maps)',()=>{
 it('a pack is fetched from its own map directory and applied only to that map',async()=>{
  const s=source(),built=await buildTexturePack([s],{archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)},'MP13');
  expect(built.manifest.mapArchive).toBe('RUN/MP13.ZDB');
  for(const map of ['MP13','MP81','UI']){
   const textures=new Map([[s.key,new DataTexture(s.levels[0]!.data,2,2)]]),io=transport({sources:[s],...built}),p=new LocalTexturePacks(io.fetcher);
   p.setTarget(new TexturePackTarget(()=>new Map([[s.key,s]]),textures,map));p.setEnabled(true);await p.ready;
   expect(io.requests[0]).toBe(map==='UI'?undefined:`/experimental-packs/${map.toLowerCase()}/current.json`);
   expect([p.applied,textures.get(s.key)!.image.width]).toEqual(map==='MP13'?[1,4]:[0,2]);
  }
 });
});

describe('GX-1d: a second map end to end (the owner: "assets only seemed to work in MP51")',()=>{
 it('an MP2 world gets a pack target, fetches /experimental-packs/mp2/ and applies an MP2 wide 4x pack; an off-list map gets none',async()=>{
  const solid=()=>({width:2,height:2,data:new Uint8ClampedArray(Array(4).fill([30,80,140,255]).flat())});
  const map={archive:'MP2',lines:null,detail:{},world:[{textureName:'deck',fog:true,scroll:null,vertexAlpha:true}],props:[{parts:[{textureName:'vent',fog:true,scroll:null}]}],
   textures:{deck:solid(),vent:solid()},textureFlags:{deck:flags,vent:flags}} as unknown as LoadedMap;
  const sources=packSourcesFor(map,'wide');expect([...sources.keys()]).toEqual(['deck','vent']);
  const built=await buildImportedPack([...sources.values()].map(source=>({source,base:rgba(8)})),{method:'nearest-4x',scale:4,roles:'wide',map:'MP2'},{archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)});
  const textures=new Map([...sources.values()].map(s=>[s.key,new DataTexture(s.levels[0]!.data,2,2)]));
  const world={texturePack:new TexturePackTarget(r=>packSourcesFor(map,r),textures,map.archive)};
  const io=transport({sources:[...sources.values()],...built}),scales:(number|null)[]=[];
  const p=new LocalTexturePacks(io.fetcher,undefined,scale=>scales.push(scale));p.setTarget(packTargetFor(world));p.setEnabled(true);await p.ready;
  expect(io.requests[0]).toBe('/experimental-packs/mp2/current.json');expect(p.applied).toBe(2);expect(textures.get('vent')!.image.width).toBe(8);expect(scales.at(-1)).toBe(4);
  expect(packTargetFor({texturePack:new TexturePackTarget(()=>new Map(),new Map(),'UI')})).toBeNull();
  expect(packTargetFor({texturePack:new TexturePackTarget(()=>new Map(),new Map(),'MP81')})).not.toBeNull();expect(packTargetFor({})).toBeNull();
 });
});
