import {describe,expect,it} from 'vitest';
import {DataTexture} from 'three';
import {validatePackIndex,PACK_INDEX_LIMITS,PACK_CHOICE_DEFAULT,PackRefusal,sha256,type PackSource} from '../src/texturePack';
import {TexturePackTarget,LocalTexturePacks,packStatusText,type PackReport} from '../src/texturePackRuntime';
import {buildTexturePack,buildImportedPack} from '../../../tools/localTexturePack';

// GX-21 (plan 2026-10-10-web-graphics-slice-4-packs, GX.R10/R11): the library index and the chooser. Fabricated packs only.
const hash=(c:string)=>c.repeat(64);
const flags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
const rgba=(n:number,colour=[30,80,140,255])=>({width:n,height:n,data:new Uint8ClampedArray(Array.from({length:n*n},()=>colour).flat())});
const source=():PackSource=>({key:'wall',flags,levels:[rgba(2)],library:'MP51',record:'wall'});
const provenance={archiveSha256:hash('a'),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:hash('c')};
type Built=Awaited<ReturnType<typeof buildTexturePack>>;
const entryOf=(b:Built,name:string,extra:Record<string,unknown>={})=>({id:b.id,name,kind:'textures',method:b.manifest.method,scale:b.manifest.scale,roles:b.manifest.roles??'world',
 generatedAt:'2026-10-10T03:00:00.000Z',textures:b.manifest.entries.length,bytes:b.manifest.totalBytes,notes:'',...extra});
async function packs(){
 const s=source(),lanczos=await buildTexturePack([s],provenance),model=await buildImportedPack([{source:s,base:rgba(8,[200,10,10,255])}],{method:'nearest-4x stand-in',scale:4},provenance);
 return {s,lanczos,model};
}
/** A served map directory: `current.json`, an optional `packs.json`, and each pack under its id. */
function served(list:Built[],{index,current}:{index?:unknown;current?:string|null}={}){
 const requests:string[]=[];
 const fetcher=async(url:string)=>{requests.push(url);
  const tail=url.replace('/experimental-packs/mp51/','');
  if(tail==='current.json')return current===null?new Response('',{status:404}):new Response(JSON.stringify({version:1,packId:current??list[0]!.id}));
  if(tail==='packs.json')return index===undefined?new Response('',{status:404}):new Response(typeof index==='string'?index:JSON.stringify(index));
  const [id,file]=tail.split('/');const pack=list.find(p=>p.id===id);
  if(!pack)return new Response('',{status:404});
  const bytes=file==='manifest.json'?pack.manifestBytes:pack.payloads.get(file!);
  return bytes?new Response(bytes.slice().buffer as ArrayBuffer):new Response('',{status:404});
 };return {requests,fetcher};
}
const world=(s:PackSource)=>{const texture=new DataTexture(s.levels[0]!.data,2,2);return {texture,target:new TexturePackTarget(()=>new Map([[s.key,s]]),new Map([[s.key,texture]]),'MP51')};};

describe('GX-21 the library index (validatePackIndex)',()=>{
 const good=()=>({version:1,packs:[{id:hash('1'),name:'x4plus-4x',kind:'textures',method:'realesrgan x4plus',scale:4,roles:'wide',generatedAt:'2026-10-10T03:00:00.000Z',textures:37,bytes:4096,notes:'the first model pack'}]});
 it('accepts a well-formed index and copies only the known fields',()=>{
  const raw=good();(raw.packs[0] as Record<string,unknown>)['extra']=1;
  expect(validatePackIndex(raw)).toEqual(good());expect(PACK_INDEX_LIMITS).toMatchObject({packs:32,indexBytes:64*1024,nameLength:48,notesLength:240});
 });
 it('bounds every field: name 1-48 printable, notes 0-240, ISO time, scale, roles, counts, a sha256 id',()=>{
  const bad=(patch:Record<string,unknown>)=>{const raw=good();Object.assign(raw.packs[0]!,patch);return ()=>validatePackIndex(raw);};
  for(const name of ['x'.repeat(48),'A b-c (2)'])expect(bad({name})).not.toThrow();
  for(const notes of ['','n'.repeat(240)])expect(bad({notes})).not.toThrow();
  // GX-21 review: absent notes are ''.
  const bare=good();delete (bare.packs[0] as Partial<typeof bare.packs[0]>).notes;expect(validatePackIndex(bare).packs[0]!.notes).toBe('');
  for(const patch of [{name:''},{name:'x'.repeat(49)},{name:'tab\there'},{name:'café'},{name:7},{notes:'n'.repeat(241)},{notes:7},
   {generatedAt:'2026-10-10'},{generatedAt:'2026-02-30T00:00:00.000Z'},{generatedAt:'yesterday'},{scale:3},{scale:'4'},{roles:'all'},
   {textures:0},{textures:257},{bytes:0},{bytes:1.5},{id:'1'.repeat(63)},{id:'X'.repeat(64)},{method:''},{method:'a\nb'}])expect(bad(patch),JSON.stringify(patch)).toThrow(PackRefusal);
 });
 it('refuses another version, a missing list, more than 32 packs and a duplicate id, with the reason',()=>{
  expect(()=>validatePackIndex({...good(),version:2})).toThrow(/version 1/);
  expect(()=>validatePackIndex({version:1})).toThrow(PackRefusal);expect(()=>validatePackIndex(null)).toThrow(PackRefusal);
  const many=(n:number)=>({version:1,packs:Array.from({length:n},(_,i)=>({...good().packs[0]!,id:i.toString(16).padStart(64,'0')}))});
  expect(validatePackIndex(many(32)).packs).toHaveLength(32);expect(()=>validatePackIndex(many(33))).toThrow(/more than 32 packs/);
  const dup=good();dup.packs.push({...dup.packs[0]!,name:'again'});expect(()=>validatePackIndex(dup)).toThrow(/duplicate id/);
 });
 it('GX.R11: a kind with no loader is listed refused -- "no loader for kind <k>" -- and a kind that is not a name refuses the index',()=>{
  const raw=good();raw.packs.push({id:hash('2'),name:'night sky',kind:'skybox',generatedAt:'2026-10-10T03:00:00.000Z',notes:''} as never);
  const index=validatePackIndex(raw);expect(index.packs[1]).toEqual({id:hash('2'),name:'night sky',kind:'skybox',generatedAt:'2026-10-10T03:00:00.000Z',notes:'',refused:'no loader for kind skybox'});
  expect('refused' in index.packs[0]!).toBe(false);
  for(const kind of [undefined,'','Sky Box',3])expect(()=>validatePackIndex({version:1,packs:[{...good().packs[0]!,kind}]})).toThrow(PackRefusal);
 });
});

describe('GX-21 the loader: library(), choose(), the default and the refusals',()=>{
 it('without an index the library is current.json\'s pack alone, named by its method, and it is the default',async()=>{
  const {s,lanczos}=await packs(),io=served([lanczos]),w=world(s),p=new LocalTexturePacks(io.fetcher);
  p.setTarget(w.target);p.setEnabled(true);await p.ready;
  expect(p.library()).toEqual([{id:lanczos.id,name:'lanczos3',kind:'textures',method:'lanczos3',scale:2,roles:'world',generatedAt:'',textures:1,bytes:lanczos.manifest.totalBytes,notes:''}]);
  expect(p.applied).toBe(1);expect(w.texture.image.width).toBe(4);
  expect(io.requests.filter(u=>u.endsWith('manifest.json'))).toHaveLength(1);
 });
 it('with an index the library is the index in its order; the default is current.json\'s; a choice restores first, then applies',async()=>{
  const {s,lanczos,model}=await packs(),io=served([lanczos,model],{index:{version:1,packs:[entryOf(model,'Model 4x'),entryOf(lanczos,'Lanczos')]},current:lanczos.id});
  const w=world(s),original=w.texture.image,reports:PackReport[]=[],p=new LocalTexturePacks(io.fetcher,undefined,undefined,r=>reports.push(r));
  p.setTarget(w.target);p.setEnabled(true);await p.ready;
  expect(p.library().map(e=>e.name)).toEqual(['Model 4x','Lanczos']);expect(w.texture.image.width).toBe(4);
  expect(packStatusText(reports.at(-1)!)).toBe('Lanczos: 1 of 1 texture applied.');
  let restoredFirst=false;w.texture.addEventListener('dispose',()=>{if(w.texture.image===original)restoredFirst=true;});
  p.choose(model.id);await p.ready;expect(restoredFirst).toBe(true);expect(w.texture.image.width).toBe(8);expect(p.applied).toBe(1);
  expect(packStatusText(reports.at(-1)!)).toBe('Model 4x: 1 of 1 texture applied.');
  const before=io.requests.length;p.choose(null);await p.ready;
  expect(w.texture.image).toBe(original);expect(p.applied).toBe(0);expect(io.requests.length).toBe(before);
  expect(packStatusText(reports.at(-1)!)).toBe('Original textures active.');
  p.choose(PACK_CHOICE_DEFAULT);await p.ready;expect(w.texture.image.width).toBe(4);
  expect(io.requests.filter(u=>u.endsWith('packs.json'))).toHaveLength(1);
 });
 it('a pack on disk but absent from the index is not listed, and current.json naming it leaves Original as the default',async()=>{
  const {s,lanczos,model}=await packs(),io=served([lanczos,model],{index:{version:1,packs:[entryOf(model,'Model 4x')]},current:lanczos.id});
  const w=world(s),p=new LocalTexturePacks(io.fetcher);p.setTarget(w.target);p.setEnabled(true);await p.ready;
  expect(p.library().map(e=>e.id)).toEqual([model.id]);expect(p.applied).toBe(0);expect(io.requests.some(u=>u.includes(lanczos.id))).toBe(false);
  p.choose(lanczos.id);await p.ready;expect(p.applied).toBe(0);
 });
 it('a refused pack shows "<name>: refused -- <reason>" and applies nothing',async()=>{
  const {s,lanczos,model}=await packs();
  const cases:[string,unknown,string][]=[
   ['an index entry its manifest disagrees with',{version:1,packs:[entryOf(lanczos,'Lanczos',{scale:4})]},'Lanczos: refused -- the index entry does not match its manifest'],
   ['a kind with no loader',{version:1,packs:[{id:hash('2'),name:'night sky',kind:'skybox',generatedAt:'2026-10-10T03:00:00.000Z',notes:''},entryOf(lanczos,'Lanczos')]},'night sky: refused -- no loader for kind skybox'],
   ['a listed pack with no files',{version:1,packs:[entryOf(model,'Gone')]},'Gone: refused -- manifest unavailable'],
  ];
  for(const [what,index,status] of cases){
   const io=served([lanczos],{index,current:(index as {packs:{id:string}[]}).packs[0]!.id}),w=world(s),reports:PackReport[]=[];
   const p=new LocalTexturePacks(io.fetcher,undefined,undefined,r=>reports.push(r));p.setTarget(w.target);p.setEnabled(true);await p.ready;
   expect(packStatusText(reports.at(-1)!),what).toBe(status);expect(p.applied,what).toBe(0);expect(w.texture.image.width,what).toBe(2);
   expect(io.requests.some(u=>u.endsWith('.rgba')),what).toBe(false);
  }
 });
 it('a malformed or overlarge index refuses the library with its reason; nothing applies',async()=>{
  const {s,lanczos}=await packs();
  for(const [index,reason] of [['{',/not JSON/],[{version:2,packs:[]},/not a version 1 pack index/],['x'.repeat(64*1024+1),/unreadable or over 64 KiB/]] as const){
   const io=served([lanczos],{index}),w=world(s),reports:PackReport[]=[];
   const p=new LocalTexturePacks(io.fetcher,undefined,undefined,r=>reports.push(r));p.setTarget(w.target);p.setEnabled(true);await p.ready;
   expect(packStatusText(reports.at(-1)!)).toMatch(new RegExp('^packs\\.json: refused -- '+reason.source));
   expect(p.library()).toEqual([]);expect(p.applied).toBe(0);
  }
 });
 it('GX.R1 unchanged: a choice made while off fetches nothing; turning on applies that choice',async()=>{
  const {s,lanczos,model}=await packs(),io=served([lanczos,model],{index:{version:1,packs:[entryOf(lanczos,'Lanczos'),entryOf(model,'Model 4x')]},current:lanczos.id});
  const w=world(s),p=new LocalTexturePacks(io.fetcher);p.setTarget(w.target);p.choose(model.id);p.choose(null);p.choose(model.id);await p.ready;
  expect(io.requests).toEqual([]);expect(p.library()).toEqual([]);
  p.setEnabled(true);await p.ready;expect(w.texture.image.width).toBe(8);
  p.setEnabled(false);expect(w.texture.image.width).toBe(2);const n=io.requests.length;p.choose(lanczos.id);await p.ready;expect(io.requests.length).toBe(n);
 });

 it('GX-21 review: an SPA fallback (200, text/html) for packs.json or current.json is absent, and every read asks for JSON',async()=>{
  const {s,lanczos,model}=await packs(),html=()=>new Response('<!doctype html><html></html>',{headers:{'content-type':'text/html; charset=utf-8'}});
  const accepts:(string|null)[]=[];
  const spa=(io:ReturnType<typeof served>,htmlFor:string)=>async(url:string,init?:RequestInit)=>{accepts.push(new Headers(init?.headers).get('accept'));return url.endsWith(htmlFor)?html():io.fetcher(url);};
  const one=served([lanczos]),w=world(s),p=new LocalTexturePacks(spa(one,'packs.json'));p.setTarget(w.target);p.setEnabled(true);await p.ready;
  expect(p.library().map(e=>e.id)).toEqual([lanczos.id]);expect(p.applied).toBe(1);expect(w.texture.image.width).toBe(4);
  expect(accepts.slice(0,3)).toEqual(['application/json','application/json','application/json']);
  const two=served([lanczos,model],{index:{version:1,packs:[entryOf(lanczos,'Lanczos'),entryOf(model,'Model')]}}),v=world(s),q=new LocalTexturePacks(spa(two,'current.json'));
  q.setTarget(v.target);q.setEnabled(true);await q.ready;expect(q.library()).toHaveLength(2);expect(q.applied).toBe(0);
 });
 it('GX-21 review: a current.json over 1 KiB refuses the library; packs.json is not read',async()=>{
  const {s,lanczos}=await packs(),io=served([lanczos],{index:{version:1,packs:[entryOf(lanczos,'Lanczos')]}}),w=world(s),reports:PackReport[]=[];
  const p=new LocalTexturePacks(async u=>u.endsWith('current.json')?new Response(JSON.stringify({version:1,packId:lanczos.id,pad:'x'.repeat(1100)})):io.fetcher(u),undefined,undefined,r=>reports.push(r));
  p.setTarget(w.target);p.setEnabled(true);await p.ready;
  expect(packStatusText(reports.at(-1)!)).toBe('current.json: refused -- unreadable or over 1 KiB');expect(p.applied).toBe(0);expect(p.library()).toEqual([]);
  expect(io.requests).toEqual([]);
 });
});

describe('GX-25 review: a refused entry keeps its original and says why',()=>{
 const run=async(alter:(b:Built,s:PackSource)=>Promise<{fetcher?:(u:string,r:Response)=>Response;sources?:PackSource[]}>|{fetcher?:(u:string,r:Response)=>Response;sources?:PackSource[]})=>{
  const {s,lanczos}=await packs(),change=await alter(lanczos,s),io=served([lanczos]);
  const fetcher=async(u:string)=>{const r=await io.fetcher(u);return change.fetcher?.(u,r)??r;};
  const list=change.sources??[s],texture=new DataTexture(s.levels[0]!.data,2,2),reports:PackReport[]=[];
  const target=new TexturePackTarget(()=>new Map(list.map(x=>[x.key,x])),new Map([[s.key,texture]]),'MP51');
  const p=new LocalTexturePacks(fetcher,undefined,undefined,r=>reports.push(r));p.setTarget(target);p.setEnabled(true);await p.ready;
  expect(p.applied).toBe(0);expect(texture.image.width).toBe(2);return {p,status:packStatusText(reports.at(-1)!),report:reports.at(-1)!};
 };
 it.each([
  ['eligibility',()=>({sources:[]}),'not eligible on this map'],
  ['digest',(_b:Built,s:PackSource)=>{const c=structuredClone(s);c.levels[0]!.data[0]=1;return {sources:[c]};},'source digest mismatch'],
  ['hash',()=>({fetcher:(u:string,r:Response)=>u.endsWith('.rgba')?new Response(new Uint8Array(64)):r}),'payload hash mismatch'],
  ['size',()=>({fetcher:(u:string,r:Response)=>u.endsWith('.rgba')?new Response(new Uint8Array(65)):r}),'payload missing or over its declared size'],
  ['alpha',async(b:Built)=>{const data=b.payloads.get('0.rgba')!;data[3]=0;b.manifest.entries[0]!.sha256=await sha256(data);
   b.manifestBytes=new TextEncoder().encode(JSON.stringify(b.manifest));b.id=await sha256(b.manifestBytes);return {};},'payload alpha is not 255'],
 ] as const)('%s',async(_kind,alter,reason)=>{
  const {p,status,report}=await run(alter as never);
  expect(report.skipped).toEqual([{key:'wall',reason}]);expect(p.skipped()).toEqual([{key:'wall',reason}]);
  expect(status).toBe(`lanczos3: 0 of 1 texture applied. Kept original: wall (${reason}).`);
 });
 it('the first two reasons in full, then "and N more"; a new choice clears them',async()=>{
  const keys=['a','b','c'],sources=keys.map(key=>({...source(),key,record:key})),built=await buildTexturePack(sources,provenance);
  const io=served([built]),texture=new DataTexture(sources[0]!.levels[0]!.data,2,2),reports:PackReport[]=[];
  const p=new LocalTexturePacks(io.fetcher,undefined,undefined,r=>reports.push(r));
  p.setTarget(new TexturePackTarget(()=>new Map(),new Map([['a',texture]]),'MP51'));p.setEnabled(true);await p.ready;
  expect(packStatusText(reports.at(-1)!)).toBe('lanczos3: 0 of 3 textures applied. Kept original: a (not eligible on this map), b (not eligible on this map) and 1 more.');
  p.choose(null);await p.ready;expect(p.skipped()).toEqual([]);expect(reports.at(-1)!.skipped).toEqual([]);
 });
});

describe('GX-25 round 5: a present but malformed current.json is refused with its reason; an absent one is silent',()=>{
 const run=async(pointer:Response|null)=>{
  const {s,lanczos,model}=await packs(),io=served([lanczos,model],{index:{version:1,packs:[entryOf(lanczos,'Lanczos'),entryOf(model,'Model')]}});
  const w=world(s),reports:PackReport[]=[];
  const p=new LocalTexturePacks(async u=>u.endsWith('current.json')?pointer??new Response('',{status:404}):io.fetcher(u),undefined,undefined,r=>reports.push(r));
  p.setTarget(w.target);p.setEnabled(true);await p.ready;return {p,w,model,last:()=>reports.at(-1)!};
 };
 it.each([
  ['a "{" body','{','not JSON'],
  ['version 2',JSON.stringify({version:2,packId:'1'.repeat(64)}),'not version 1'],
  ['a null body','null','not version 1'],
  ['a bad packId',JSON.stringify({version:1,packId:'XYZ'}),'packId is not a sha256'],
 ])('%s: "current.json: refused -- <reason>", the index still listed and selectable, no default',async(_what,body,reason)=>{
  const {p,w,model,last}=await run(new Response(body));
  expect(last().library?.pointerRefused).toBe(reason);expect(packStatusText(last())).toBe(`current.json: refused -- ${reason}`);
  expect(p.library().map(e=>e.name)).toEqual(['Lanczos','Model']);expect(last().library?.defaultId).toBeNull();expect(p.applied).toBe(0);
  p.choose(model.id);await p.ready;expect(w.texture.image.width).toBe(8);expect(packStatusText(last())).toBe('Model: 1 of 1 texture applied.');
 });
 it('an absent pointer (404, or an SPA\'s text/html) is the silent no-default case',async()=>{
  for(const pointer of [null,new Response('<!doctype html>',{headers:{'content-type':'text/html'}})]){
   const {p,last}=await run(pointer);
   expect(last().library?.pointerRefused).toBeUndefined();expect(packStatusText(last())).toBe('Original textures active.');expect(p.library()).toHaveLength(2);
  }
 });
});
