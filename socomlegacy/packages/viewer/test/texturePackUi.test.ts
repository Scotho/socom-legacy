// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DataTexture} from 'three';
import {mountExperimentalGraphics,EXPERIMENTAL_DEFAULTS,type ExperimentalSettings} from '../src/experimentalGraphics';
import {mountLocalTexturePacks,TexturePackTarget} from '../src/texturePackRuntime';
import {PACK_CHOICE_DEFAULT,type PackSource} from '../src/texturePack';
import {buildTexturePack,buildImportedPack} from '../../../tools/localTexturePack';
import {Ui} from '../src/ui';
import {UploadedPacks,memoryUploadBackend,idbUploadBackend} from '../src/texturePackStore';
import {makeZip} from './zipFixture';
import {readUpload,buildUploadPart} from '../src/texturePackUpload';
import {blobSource} from '../src/zipReader';
import {exportedFiles,baseZipItems} from '../../../tools/test/baseZip';
const page=()=>{document.body.innerHTML=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../setup/index.html'),'utf8');document.body.className='test-room';};
const chooser=()=>document.querySelector<HTMLSelectElement>('#exp-texturePack')!;
const status=()=>document.querySelector('#exp-pack-status')!.textContent;
const pick=(value:string)=>{chooser().value=value;chooser().dispatchEvent(new Event('change'));};

it('GX-21 (GX.R8 kept): the "Texture pack" select replaces the checkbox; the map\'s default pack is chosen with the Experimental view, Original sends null, Reset returns to the default',()=>{
 page();const states:ExperimentalSettings[]=[];const ui=new Ui();const preview=ui.onLook();
 mountExperimentalGraphics(document,s=>states.push(s),()=>preview('modern'));
 expect(document.querySelector('#exp-localTexturePack')).toBeNull();
 expect(chooser().closest('label')!.querySelector('span')!.textContent).toBe('Texture pack');
 expect(Array.from(chooser().options,o=>[o.value,o.textContent])).toEqual([['','Original'],[PACK_CHOICE_DEFAULT,"Map's default pack"]]);
 expect(chooser().value).toBe(PACK_CHOICE_DEFAULT);expect(EXPERIMENTAL_DEFAULTS.localTexturePack).toBe(PACK_CHOICE_DEFAULT);
 expect(states.at(-1)).toMatchObject({enabled:false});expect(status()).toBe('Original textures active.');
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();expect(states.at(-1)).toMatchObject({enabled:true,localTexturePack:PACK_CHOICE_DEFAULT});
 pick('');expect(states.at(-1)).toMatchObject({enabled:true,localTexturePack:null});
 document.querySelector<HTMLInputElement>('#exp-enabled')!.click();expect(states.at(-1)?.enabled).toBe(false);expect(chooser().disabled).toBe(true);
 document.querySelector<HTMLButtonElement>('#exp-reset')!.click();expect(chooser().value).toBe(PACK_CHOICE_DEFAULT);expect(states.at(-1)?.localTexturePack).toBe(PACK_CHOICE_DEFAULT);
});

it('GX-21: the options come from the library as "<name> (<scale>x, <method>)", the default is current.json\'s, the status names the pack and its count',async()=>{
 page();const ui=new Ui();const preview=ui.onLook();
 const flags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
 const rgba=(n:number,c=[30,80,140,255])=>({width:n,height:n,data:new Uint8ClampedArray(Array.from({length:n*n},()=>c).flat())});
 const s:PackSource={key:'wall',flags,levels:[rgba(2)],library:'MP51',record:'wall'};
 const provenance={archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)};
 const lanczos=await buildTexturePack([s],provenance),model=await buildImportedPack([{source:s,base:rgba(8)}],{method:'nearest-4x stand-in',scale:4},provenance);
 const entry=(b:typeof lanczos,name:string,extra={})=>({id:b.id,name,kind:'textures',method:b.manifest.method,scale:b.manifest.scale,roles:'world',generatedAt:'2026-10-10T03:00:00.000Z',textures:1,bytes:b.manifest.totalBytes,notes:'',...extra});
 const index={version:1,packs:[entry(lanczos,'Lanczos'),entry(model,'Model'),entry(lanczos,'Wrong scale',{id:'e'.repeat(64)})]};
 const requests:string[]=[];
 const packs=mountLocalTexturePacks(document,async url=>{requests.push(url);const tail=url.replace('/experimental-packs/mp51/','');
  if(tail==='packs.json')return new Response(JSON.stringify(index));if(tail==='current.json')return new Response(JSON.stringify({version:1,packId:model.id}));
  const [id,file]=tail.split('/'),b=[lanczos,model].find(p=>p.id===id);const bytes=b&&(file==='manifest.json'?b.manifestBytes:b.payloads.get(file!));
  return bytes?new Response(bytes.slice().buffer as ArrayBuffer):new Response('',{status:404});})!;
 mountExperimentalGraphics(document,settings=>{packs.choose(settings.localTexturePack);packs.setEnabled(settings.enabled);},()=>preview('modern'));
 const texture=new DataTexture(s.levels[0]!.data,2,2);packs.setTarget(new TexturePackTarget(()=>new Map([[s.key,s]]),new Map([[s.key,texture]]),'MP51'));
 await packs.ready;expect(requests).toEqual([]);
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();await packs.ready;
 expect(Array.from(chooser().options,o=>[o.value,o.textContent])).toEqual([['','Original'],[PACK_CHOICE_DEFAULT,"Map's default pack"],[lanczos.id,'Lanczos (2x, lanczos3)'],[model.id,'Model (4x, nearest-4x stand-in)'],['e'.repeat(64),'Wrong scale (2x, lanczos3)']]);
 expect(chooser().value).toBe(PACK_CHOICE_DEFAULT);expect(texture.image.width).toBe(8);expect(status()).toBe('Model: 1 of 1 texture applied.');
 pick(lanczos.id);await packs.ready;expect(texture.image.width).toBe(4);expect(status()).toBe('Lanczos: 1 of 1 texture applied.');
 pick('e'.repeat(64));await packs.ready;expect(texture.image.width).toBe(2);expect(status()).toBe('Wrong scale: refused -- manifest unavailable');
 pick('');await packs.ready;expect(texture.image.width).toBe(2);expect(status()).toBe('Original textures active.');
 document.querySelector<HTMLButtonElement>('#exp-reset')!.click();await packs.ready;expect(chooser().value).toBe(PACK_CHOICE_DEFAULT);expect(texture.image.width).toBe(8);
 document.querySelector<HTMLButtonElement>('[data-look="modern"]')!.click();await packs.ready;expect(texture.image.width).toBe(2);expect(status()).toBe('Original textures active.');
});

it('GX-21 review 2: the map default survives a map with no packs (MP51 -> MP3 -> MP2); a pack of another map moves to the default with a change',async()=>{
 page();const ui=new Ui();const preview=ui.onLook();const states:ExperimentalSettings[]=[];
 const flags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
 const rgba=(n:number)=>({width:n,height:n,data:new Uint8ClampedArray(Array.from({length:n*n},()=>[30,80,140,255]).flat())});
 const s:PackSource={key:'wall',flags,levels:[rgba(2)],library:'MP51',record:'wall'};
 const provenance={archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)};
 const mp51=[await buildTexturePack([s],provenance,'MP51'),await buildImportedPack([{source:s,base:rgba(8)}],{method:'nearest-4x',scale:4},provenance)];
 const mp2=[await buildTexturePack([s],provenance,'MP2')];
 const dir:Record<string,typeof mp51>={mp51,mp2};
 const entry=(b:typeof mp2[0],name:string)=>({id:b.id,name,kind:'textures',method:b.manifest.method,scale:b.manifest.scale,roles:'world',generatedAt:'2026-10-10T03:00:00.000Z',textures:1,bytes:b.manifest.totalBytes,notes:''});
 const packs=mountLocalTexturePacks(document,async url=>{const [,,map,a,b]=url.split('/');const list=dir[map!];if(!list)return new Response('',{status:404});
  if(a==='packs.json')return new Response(JSON.stringify({version:1,packs:list.map((p,i)=>entry(p,map+'-'+i))}));
  if(a==='current.json')return new Response(JSON.stringify({version:1,packId:list[0]!.id}));
  const p=list.find(x=>x.id===a);const bytes=p&&(b==='manifest.json'?p.manifestBytes:p.payloads.get(b!));
  return bytes?new Response(bytes.slice().buffer as ArrayBuffer):new Response('',{status:404});})!;
 mountExperimentalGraphics(document,settings=>{states.push(settings);packs.choose(settings.localTexturePack);packs.setEnabled(settings.enabled);},()=>preview('modern'));
 const textures=(map:string)=>{const t=new DataTexture(s.levels[0]!.data,2,2);return {t,target:new TexturePackTarget(()=>new Map([[s.key,s]]),new Map([[s.key,t]]),map)};};
 for(const pickB of [false,true]){
  if(pickB)pick(PACK_CHOICE_DEFAULT);
  const a=textures('MP51');packs.setTarget(a.target);
  if(!pickB)document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();
  await packs.ready;expect(chooser().value).toBe(PACK_CHOICE_DEFAULT);expect(a.t.image.width).toBe(4);
  if(pickB){pick(mp51[1]!.id);await packs.ready;expect(a.t.image.width).toBe(8);}
  const chosen=chooser().value,sent=states.length;
  const none=textures('MP3');packs.setTarget(none.target);await packs.ready;
  expect(chooser().value).toBe(chosen);expect(states.length).toBe(sent);expect(none.t.image.width).toBe(2);expect(status()).toBe('Original textures active.');
  expect(Array.from(chooser().options).filter(o=>o.disabled).map(o=>o.value)).toEqual(mp51.map(p=>p.id));expect(chooser().options[0]!.disabled||chooser().options[1]!.disabled).toBe(false);
  const b=textures('MP2');packs.setTarget(b.target);await packs.ready;
  expect(chooser().value).toBe(PACK_CHOICE_DEFAULT);expect(states.at(-1)?.localTexturePack).toBe(PACK_CHOICE_DEFAULT);expect(b.t.image.width).toBe(4);
  expect(Array.from(chooser().options).some(o=>o.disabled)).toBe(false);
  expect(states.length).toBe(sent+(pickB?1:0));expect(status()).toBe('mp2-0: 1 of 1 texture applied.');
 }
});

// GX-27 (plan 2026-10-10-web-graphics-slice-4-packs; product track, a test-room instrument under H135): the panel's
// "Import pack (.zip)" -- a base pack's zip with replaced PNGs, built in the page, kept in its store, listed and chosen.
const importButton=()=>document.querySelector<HTMLButtonElement>('#exp-pack-import')!;
const removeButton=()=>document.querySelector<HTMLButtonElement>('#exp-pack-remove')!;
const importStatus=()=>document.querySelector('#exp-pack-import-status')!.textContent;
const choose=(file:File)=>{const input=document.querySelector<HTMLInputElement>('#exp-pack-file')!;Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new Event('change'));};
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
 page();const ui=new Ui();const preview=ui.onLook();
 const packs=mountLocalTexturePacks(document,fetcher,store)!;
 mountExperimentalGraphics(document,settings=>{packs.choose(settings.localTexturePack);packs.setEnabled(settings.enabled);},()=>preview('modern'));
 return packs;
}
const zipOf=async(map:'MP51'|'MP2',replace=true,packJson:object={name:'Mine',method:'nearest-2x'})=>{
 const {files,stems}=await exportedFiles([wall(),floor()],{map});
 return makeZip(baseZipItems(files,{replace:replace?{[stems[0]!]:2}:{},packJson}));
};

it('GX-27: Import pack (.zip) builds the upload into the store, lists "<name> (2x, <method>, uploaded)", selects and applies it; Remove returns to Original',async()=>{
 const store=new UploadedPacks(memoryUploadBackend()),packs=mounted(store),here=room('MP51');packs.setTarget(here.target);
 expect(importButton().textContent).toBe('Import pack (.zip)');expect(importButton().disabled).toBe(true);expect(removeButton().disabled).toBe(true);
 expect(document.querySelector<HTMLInputElement>('#exp-pack-file')!.accept).toBe('.zip,application/zip');
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();await packs.ready;
 expect(importButton().disabled).toBe(false);expect(removeButton().disabled).toBe(true);
 let opened=0;document.querySelector('#exp-pack-file')!.addEventListener('click',e=>{opened++;e.preventDefault();});importButton().click();expect(opened).toBe(1);
 choose(new File([await zipOf('MP51')],'mine.zip'));expect(importStatus()).toBe('importing mine.zip...');expect(importButton().disabled).toBe(true);
 await packs.upload;
 expect(importStatus()).toBe('Mine: 1 texture imported, 1 kept original (1 untouched).');
 const [record]=await store.list('MP51');expect(record).toMatchObject({state:'pack',entry:{name:'Mine',method:'nearest-2x',scale:2,textures:1}});
 expect(Array.from(chooser().options,o=>[o.value,o.textContent])).toEqual([['','Original'],[PACK_CHOICE_DEFAULT,"Map's default pack"],[record!.id,'Mine (2x, nearest-2x, uploaded)']]);
 expect(chooser().value).toBe(record!.id);expect(here.textures.get('wall')!.image.width).toBe(4);expect(here.textures.get('floor')!.image.width).toBe(2);
 expect(status()).toBe('Mine: 1 of 1 texture applied.');expect(removeButton().disabled).toBe(false);
 pick('');await packs.ready;expect(removeButton().disabled).toBe(true);pick(record!.id);await packs.ready;expect(removeButton().disabled).toBe(false);
 removeButton().click();await packs.upload;await packs.ready;
 expect(importStatus()).toBe('Mine removed.');expect(await store.list('MP51')).toEqual([]);expect(chooser().value).toBe('');
 expect(Array.from(chooser().options,o=>o.value)).not.toContain(record!.id);expect(here.textures.get('wall')!.image.width).toBe(2);expect(removeButton().disabled).toBe(true);
});

it('GX-27: a zip of another map is staged and built when that map loads; an uploaded pack is listed on its own map only; refusals say why',async()=>{
 const store=new UploadedPacks(memoryUploadBackend()),packs=mounted(store),mp51=room('MP51');packs.setTarget(mp51.target);
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();await packs.ready;
 choose(new File([await zipOf('MP2')],'two.zip'));await packs.upload;
 expect(importStatus()).toBe('Mine: staged for MP2 (1 replaced PNG); it is built when that map is loaded with Experimental on.');
 expect((await store.list('MP2')).map(r=>r.state)).toEqual(['staged']);expect(Array.from(chooser().options).length).toBe(2);
 const mp2=room('MP2');packs.setTarget(mp2.target);await packs.ready;
 const [built]=await store.list('MP2');expect(built).toMatchObject({state:'pack',entry:{name:'Mine'}});
 expect(importStatus()).toBe('Mine: 1 texture imported, 1 kept original (1 untouched).');
 expect(Array.from(chooser().options,o=>o.value)).toContain(built!.id);
 pick(built!.id);await packs.ready;expect(mp2.textures.get('wall')!.image.width).toBe(4);
 const again=room('MP51');packs.setTarget(again.target);await packs.ready;
 expect(Array.from(chooser().options).filter(o=>!o.disabled).map(o=>o.value)).toEqual(['',PACK_CHOICE_DEFAULT]);expect(again.textures.get('wall')!.image.width).toBe(2);
 choose(new File([await zipOf('MP51',false)],'nothing.zip'));await packs.upload;expect(importStatus()).toBe('nothing.zip: refused -- no texture was replaced (a replaced PNG is exactly 2x or 4x its export\'s size)');
 choose(new File([new TextEncoder().encode('just text, long enough to look for a zip end record')],'x.zip'));await packs.upload;
 expect(importStatus()).toBe('x.zip: refused -- not a zip (no end of central directory)');expect(await store.list('MP51')).toEqual([]);
});

it('GX-27 review F3/F4: unchanged maps are skipped with one line; a staged upload outlives a world disposed before it builds, and replaces itself within the limit',async()=>{
 const backend=memoryUploadBackend(),roomy=new UploadedPacks(backend),packs=mounted(roomy),mp51=room('MP51');packs.setTarget(mp51.target);
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();await packs.ready;
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
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();await tight.ready;
 expect((await roomy.list('MP2')).map(r=>r.state)).toEqual(['pack']);expect(importStatus()).toBe('Mine: 1 texture imported, 1 kept original (1 untouched).');
});

it('GX-27: with IndexedDB missing the served library still lists and applies, and the panel says uploads are unavailable',async()=>{
 const s=wall(),provenance={archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),toolSha256:'c'.repeat(64)};
 const served=await buildTexturePack([s],provenance);
 const fetcher=async(url:string)=>{const tail=url.replace('/experimental-packs/mp51/','');
  if(tail==='current.json')return new Response(JSON.stringify({version:1,packId:served.id}));if(tail==='packs.json')return new Response('',{status:404});
  const [id,file]=tail.split('/');const bytes=id===served.id?(file==='manifest.json'?served.manifestBytes:served.payloads.get(file!)):undefined;
  return bytes?new Response(bytes.slice().buffer as ArrayBuffer):new Response('',{status:404});};
 const packs=mounted(new UploadedPacks(idbUploadBackend(()=>null)),fetcher),here=room('MP51');packs.setTarget(here.target);
 document.querySelector<HTMLButtonElement>('[data-experimental]')!.click();await packs.ready;
 expect(Array.from(chooser().options,o=>o.value)).toEqual(['',PACK_CHOICE_DEFAULT,served.id]);expect(here.textures.get('wall')!.image.width).toBe(4);
 expect(importStatus()).toBe('Uploads are unavailable: no IndexedDB in this browser.');expect(importButton().disabled).toBe(true);
});
