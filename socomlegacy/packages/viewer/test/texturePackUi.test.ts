// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DataTexture} from 'three';
import {mountExperimentalGraphics} from '../src/experimentalGraphics';
import {LocalTexturePacks,mountLocalTexturePacks,packStatusText,TexturePackTarget,type PackReport} from '../src/texturePackRuntime';
import {PACK_CHOICE_DEFAULT,type PackSource} from '../src/texturePack';
import {buildTexturePack,buildImportedPack} from '../../../tools/localTexturePack';
import {Ui} from '../src/ui';
import {UploadedPacks,memoryUploadBackend,idbUploadBackend} from '../src/texturePackStore';
import {makeZip} from './zipFixture';
import {readUpload,buildUploadPart} from '../src/texturePackUpload';
import {blobSource} from '../src/zipReader';
import {exportedFiles,baseZipItems} from '../../../tools/test/baseZip';
const page=()=>{document.body.innerHTML=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../setup/index.html'),'utf8');document.body.className='test-room';};

/**
 * B206 ML-6 (plan 2026-11-06-mods-loader, ML.R11, R16; OT.R110): the test room's texture-pack group -- the chooser,
 * "Import pack (.zip)", Remove and their notes -- is removed from the Experimental panel; a pack is dropped and chosen in
 * Home > Experiments > Mods, and the test room applies the MODS choice (`./packs/pagePacks`). `mountLocalTexturePacks`
 * keeps the test-room runtime (its route check and its teardown) and wires nothing of the document. The runtime's own
 * behaviour -- the map's library, an uploaded pack built, staged, chosen and removed -- is pinned below on the runtime.
 */
it('ML-6: the panel has no texture-pack control, and the runtime answers none put in the document',async()=>{
 page();const ui=new Ui();const preview=ui.onLook();
 const store=new UploadedPacks(memoryUploadBackend());
 const packs=mountLocalTexturePacks(document,none,store)!;
 mountExperimentalGraphics(document,()=>{},()=>preview('modern'));
 for(const id of ['exp-texturePack','exp-pack-import','exp-pack-remove','exp-pack-file','exp-pack-status','exp-pack-import-status'])expect(document.getElementById(id),id).toBeNull();
 packs.setTarget(room('MP51').target);packs.setEnabled(true);await packs.ready;
 // A stray control with a removed id (an old page's markup): a chosen file imports nothing, a click opens nothing.
 const input=document.createElement('input');input.type='file';input.id='exp-pack-file';document.body.append(input);
 Object.defineProperty(input,'files',{value:[new File([await zipOf('MP51')],'mine.zip')],configurable:true});
 input.dispatchEvent(new Event('change',{bubbles:true}));
 const button=document.createElement('button');button.id='exp-pack-import';document.body.append(button);
 let opened=0;input.addEventListener('click',e=>{opened++;e.preventDefault();});button.click();
 await packs.upload;expect(opened).toBe(0);expect(await store.list('MP51')).toEqual([]);
 expect(mountLocalTexturePacks.length).toBeLessThanOrEqual(4);   // (doc, fetcher, store, extra): no HD import hook
});

it('GX-21 review 2 (the runtime): the map default survives a map with no packs (MP51 -> MP3 -> MP2)',async()=>{
 const flags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
 const rgba=(n:number)=>({width:n,height:n,data:new Uint8ClampedArray(Array.from({length:n*n},()=>[30,80,140,255]).flat())});
 const s:PackSource={key:'wall',flags,levels:[rgba(2)],library:'MP51',record:'wall'};
 const provenance={archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)};
 const mp51=[await buildTexturePack([s],provenance,'MP51'),await buildImportedPack([{source:s,base:rgba(8)}],{method:'nearest-4x',scale:4},provenance)];
 const mp2=[await buildTexturePack([s],provenance,'MP2')];
 const dir:Record<string,typeof mp51>={mp51,mp2};
 const entry=(b:typeof mp2[0],name:string)=>({id:b.id,name,kind:'textures',method:b.manifest.method,scale:b.manifest.scale,roles:'world',generatedAt:'2026-10-10T03:00:00.000Z',textures:1,bytes:b.manifest.totalBytes,notes:''});
 const reports:PackReport[]=[];
 const packs=new LocalTexturePacks(async url=>{const [,,map,a,b]=url.split('/');const list=dir[map!];if(!list)return new Response('',{status:404});
  if(a==='packs.json')return new Response(JSON.stringify({version:1,packs:list.map((p,i)=>entry(p,map+'-'+i))}));
  if(a==='current.json')return new Response(JSON.stringify({version:1,packId:list[0]!.id}));
  const p=list.find(x=>x.id===a);const bytes=p&&(b==='manifest.json'?p.manifestBytes:p.payloads.get(b!));
  return bytes?new Response(bytes.slice().buffer as ArrayBuffer):new Response('',{status:404});},undefined,undefined,r=>reports.push(r));
 const textures=(map:string)=>{const t=new DataTexture(s.levels[0]!.data,2,2);return {t,target:new TexturePackTarget(()=>new Map([[s.key,s]]),new Map([[s.key,t]]),map)};};
 packs.choose(PACK_CHOICE_DEFAULT);packs.setEnabled(true);
 const a=textures('MP51');packs.setTarget(a.target);await packs.ready;expect(a.t.image.width).toBe(4);
 const nothing=textures('MP3');packs.setTarget(nothing.target);await packs.ready;
 expect(nothing.t.image.width).toBe(2);expect(packStatusText(reports.at(-1)!)).toBe('Original textures active.');
 const b=textures('MP2');packs.setTarget(b.target);await packs.ready;
 expect(b.t.image.width).toBe(4);expect(packStatusText(reports.at(-1)!)).toBe('mp2-0: 1 of 1 texture applied.');
});

// GX-27 (plan 2026-10-10-web-graphics-slice-4-packs; product track, a test-room instrument under H135): the panel's
// "Import pack (.zip)" -- a base pack's zip with replaced PNGs, built in the page, kept in its store, listed and chosen.
// B206 ML-6: the panel's buttons are gone (the import is MODS's); the runtime's import and removal are pinned here by
// their own calls and their status lines.
let said:string[]=[],chosenIds:string[]=[],reports:PackReport[]=[];
const importStatus=()=>said.at(-1)!;
let current:LocalTexturePacks|null=null;
const choose=(file:File)=>{void current!.importZip(file,file.name);};
const uploadFlags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
const square=(n:number,c:number[])=>({width:n,height:n,data:new Uint8ClampedArray(Array.from({length:n*n},()=>c).flat())});
const wall=():PackSource=>({key:'wall',flags:uploadFlags,levels:[square(2,[30,80,140,255])],library:'MP51',record:'wall'});
const floor=():PackSource=>({key:'floor',flags:uploadFlags,levels:[square(2,[90,90,90,255])],library:'MP51',record:'floor'});
function room(map:string){
 const sources=[wall(),floor()],textures=new Map(sources.map(s=>[s.key,new DataTexture(s.levels[0]!.data,2,2)]));
 return {textures,target:new TexturePackTarget(()=>new Map(sources.map(s=>[s.key,s])),textures,map)};
}
const none=async()=>new Response('',{status:404});
function mounted(store:UploadedPacks|null,fetcher:(url:string)=>Promise<Response>=none){
 said=[];chosenIds=[];reports=[];
 const packs=new LocalTexturePacks(fetcher,undefined,undefined,r=>reports.push(r),{store,status:t=>said.push(t),selected:v=>{chosenIds.push(v);packs.choose(v||null);}});
 current=packs;return packs;
}
const zipOf=async(map:'MP51'|'MP2',replace=true,packJson:object={name:'Mine',method:'nearest-2x'})=>{
 const {files,stems}=await exportedFiles([wall(),floor()],{map});
 return makeZip(baseZipItems(files,{replace:replace?{[stems[0]!]:2}:{},packJson}));
};

const status=()=>packStatusText(reports.at(-1)!);
const listed=(packs:LocalTexturePacks)=>packs.library().map(e=>[e.id,e.name,packs.isUploaded(e.id)]);

it('GX-27 (the runtime): an import builds the upload into the store, lists it as uploaded, chooses and applies it; a removal returns to Original',async()=>{
 const store=new UploadedPacks(memoryUploadBackend()),packs=mounted(store),here=room('MP51');packs.setTarget(here.target);
 choose(new File([await zipOf('MP51')],'mine.zip'));await packs.upload;expect(said).toEqual([]);   // the import's prerequisite: the runtime on
 expect(await store.list('MP51')).toEqual([]);
 packs.setEnabled(true);await packs.ready;expect(packs.uploadsAvailable).toBe(true);
 choose(new File([await zipOf('MP51')],'mine.zip'));expect(importStatus()).toBe('importing mine.zip...');expect(packs.busy).toBe(true);
 await packs.upload;
 expect(importStatus()).toBe('Mine: 1 texture imported, 1 kept original (1 untouched).');
 const [record]=await store.list('MP51');expect(record).toMatchObject({state:'pack',entry:{name:'Mine',method:'nearest-2x',scale:2,textures:1}});
 expect(listed(packs)).toEqual([[record!.id,'Mine',true]]);expect(chosenIds.at(-1)).toBe(record!.id);
 expect(here.textures.get('wall')!.image.width).toBe(4);expect(here.textures.get('floor')!.image.width).toBe(2);
 expect(status()).toBe('Mine: 1 of 1 texture applied.');
 packs.choose(null);await packs.ready;expect(here.textures.get('wall')!.image.width).toBe(2);packs.choose(record!.id);await packs.ready;expect(here.textures.get('wall')!.image.width).toBe(4);
 await packs.removeUploaded(record!.id);await packs.ready;
 expect(importStatus()).toBe('Mine removed.');expect(await store.list('MP51')).toEqual([]);expect(chosenIds.at(-1)).toBe('');
 expect(listed(packs).map(([id])=>id)).not.toContain(record!.id);expect(here.textures.get('wall')!.image.width).toBe(2);
});

it('GX-27 (the runtime): a zip of another map is staged and built when that map loads; an uploaded pack is listed on its own map only; refusals say why',async()=>{
 const store=new UploadedPacks(memoryUploadBackend()),packs=mounted(store),mp51=room('MP51');packs.setTarget(mp51.target);
 packs.setEnabled(true);await packs.ready;
 choose(new File([await zipOf('MP2')],'two.zip'));await packs.upload;
 expect(importStatus()).toBe('Mine: staged for MP2 (1 replaced PNG); it is built when that map is loaded with Experimental on.');
 expect((await store.list('MP2')).map(r=>r.state)).toEqual(['staged']);expect(listed(packs)).toEqual([]);
 const mp2=room('MP2');packs.setTarget(mp2.target);await packs.ready;
 const [built]=await store.list('MP2');expect(built).toMatchObject({state:'pack',entry:{name:'Mine'}});
 expect(importStatus()).toBe('Mine: 1 texture imported, 1 kept original (1 untouched).');
 expect(listed(packs).map(([id])=>id)).toContain(built!.id);
 packs.choose(built!.id);await packs.ready;expect(mp2.textures.get('wall')!.image.width).toBe(4);
 const again=room('MP51');packs.setTarget(again.target);await packs.ready;
 expect(listed(packs)).toEqual([]);expect(again.textures.get('wall')!.image.width).toBe(2);
 choose(new File([await zipOf('MP51',false)],'nothing.zip'));await packs.upload;expect(importStatus()).toBe('nothing.zip: refused -- no texture was replaced (a replaced PNG is exactly 2x or 4x its export\'s size)');
 choose(new File([new TextEncoder().encode('just text, long enough to look for a zip end record')],'x.zip'));await packs.upload;
 expect(importStatus()).toBe('x.zip: refused -- not a zip (no end of central directory)');expect(await store.list('MP51')).toEqual([]);
});

it('GX-27 review F3/F4: unchanged maps are skipped with one line; a staged upload outlives a world disposed before it builds, and replaces itself within the limit',async()=>{
 const backend=memoryUploadBackend(),roomy=new UploadedPacks(backend),packs=mounted(roomy),mp51=room('MP51');packs.setTarget(mp51.target);
 packs.setEnabled(true);await packs.ready;
 const two=await exportedFiles([wall(),floor()],{map:'MP2'}),seven=await exportedFiles([wall(),floor()],{map:'MP7'});
 const zip=makeZip([...baseZipItems(two.files,{folder:'frostfire-mp2/',replace:{[two.stems[0]!]:2},packJson:{name:'Mine'}}),...baseZipItems(seven.files,{folder:'ratsnest-mp7/'})]);
 choose(new File([zip],'all.zip'));await packs.upload;
 expect(importStatus()).toBe('Mine: staged for MP2 (1 replaced PNG); it is built when that map is loaded with Experimental on. 1 map unchanged, skipped.');
 expect(await roomy.list('MP7')).toEqual([]);
 const gone=room('MP2');packs.setTarget(gone.target);gone.target.dispose();await packs.ready;
 expect((await roomy.list('MP2')).map(r=>r.state)).toEqual(['staged']);
 // The pack's own size, and a store with room for one of the two but not both: the staged one is not counted twice.
 const staged=(await roomy.usage()).bytes,read=await readUpload(blobSource(new File([zip],'all.zip')),'all.zip');
 const built=await buildUploadPart(read.parts[0]!,[wall(),floor()].map(({library:_l,record:_r,...s})=>s as PackSource));
 const packBytes=built.pack.manifestBytes.length+[...built.pack.payloads.values()].reduce((n,b)=>n+b.length,0);
 const tight=mounted(new UploadedPacks(backend,{perMap:32,bytes:Math.max(staged,packBytes)+1})),mp2=room('MP2');tight.setTarget(mp2.target);
 tight.setEnabled(true);await tight.ready;
 expect((await roomy.list('MP2')).map(r=>r.state)).toEqual(['pack']);expect(importStatus()).toBe('Mine: 1 texture imported, 1 kept original (1 untouched).');
});

it('GX-27 (the runtime): with IndexedDB missing the served library still lists and applies, and the runtime says uploads are unavailable',async()=>{
 const s=wall(),provenance={archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)};
 const served=await buildTexturePack([s],provenance);
 const fetcher=async(url:string)=>{const tail=url.replace('/experimental-packs/mp51/','');
  if(tail==='current.json')return new Response(JSON.stringify({version:1,packId:served.id}));if(tail==='packs.json')return new Response('',{status:404});
  const [id,file]=tail.split('/');const bytes=id===served.id?(file==='manifest.json'?served.manifestBytes:served.payloads.get(file!)):undefined;
  return bytes?new Response(bytes.slice().buffer as ArrayBuffer):new Response('',{status:404});};
 const packs=mounted(new UploadedPacks(idbUploadBackend(()=>null)),fetcher),here=room('MP51');packs.setTarget(here.target);
 packs.setEnabled(true);await packs.ready;
 expect(listed(packs).map(([id])=>id)).toEqual([served.id]);expect(here.textures.get('wall')!.image.width).toBe(4);
 expect(importStatus()).toBe('Uploads are unavailable: no IndexedDB in this browser.');expect(packs.uploadsAvailable).toBe(false);
});
