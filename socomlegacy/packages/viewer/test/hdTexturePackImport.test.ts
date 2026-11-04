import {describe,expect,it} from 'vitest';
import {DataTexture} from 'three';
import {HdTextureRegistry,type HdManifest} from '../src/hdTexturePack';
import {HdServedPack} from '../src/hdTexturePackServed';
import {importHdZip,memoryHdStore} from '../src/hdTexturePackStore';
import {sha256} from '../src/texturePack';
import {LocalTexturePacks} from '../src/texturePackRuntime';
import type {UploadedPacks} from '../src/texturePackStore';
import {zipSync} from 'fflate';

/** Synthetic images and a synthetic pack zip in the served layout (`hdsubset.py`'s), no game data. */
const image=(w:number,h:number,px:number[])=>({width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h},()=>px).flat())});
const hashOf=(d:Uint8ClampedArray)=>sha256(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));
function dds(img:ReturnType<typeof image>):Uint8Array{
  const b=new Uint8Array(128+img.data.length),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
  v.setUint32(4,124,true);v.setUint32(12,img.height,true);v.setUint32(16,img.width,true);v.setUint32(76,32,true);v.setUint32(80,0x41,true);v.setUint32(88,32,true);
  v.setUint32(92,0xff,true);v.setUint32(96,0xff00,true);v.setUint32(100,0xff0000,true);v.setUint32(104,0xff000000,true);b.set(img.data,128);return b;
}
async function packZip(over:{dropPayload?:boolean;badId?:boolean;prefix?:string}={}){
  const leaf=image(2,2,[40,90,30,128]),hd=image(8,8,[45,100,35,120]);
  const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD four maps',method:'test',totalBytes:hd.data.length,
    entries:[{key:await hashOf(leaf.data),width:2,height:2,file:'0.dds',format:'dds',outWidth:8,outHeight:8,bytes:hd.data.length,sha256:await hashOf(hd.data),tier:'A',source:'x-y-00001113.dds'}]};
  const mb=new TextEncoder().encode(JSON.stringify(manifest)),id=over.badId?'f'.repeat(64):await sha256(mb),p=(over.prefix??'')+'experimental-packs/hd/';
  const files:Record<string,Uint8Array>={'README.txt':new TextEncoder().encode('readme'),[p+'current.json']:new TextEncoder().encode(JSON.stringify({version:1,packId:id})),[`${p}${id}/manifest.json`]:mb};
  if(!over.dropPayload)files[`${p}${id}/0.dds`]=dds(hd);
  return {leaf,hd,blob:new Blob([zipSync(files).slice().buffer as ArrayBuffer])};
}

describe('the test room\'s one import button (HD-6)',()=>{
  it('gives an HD pack zip to the HD pack and says its line; other zips go on to the per-map import',async()=>{
    const lines:string[]=[],seen:string[]=[];
    const packs=new LocalTexturePacks(async()=>new Response('',{status:404}),undefined,undefined,undefined,
      {store:{} as UploadedPacks,status:s=>lines.push(s),hd:async(_f,name)=>{seen.push(name);return name==='hd.zip'?'HD four maps: imported (1 textures), kept in this browser.':null;}});
    packs.setEnabled(true);
    await packs.importZip(new Blob([]),'hd.zip');
    expect(lines.at(-1)).toBe('HD four maps: imported (1 textures), kept in this browser.');
    await packs.importZip(new Blob([]),'mp72.zip');
    expect(seen).toEqual(['hd.zip','mp72.zip']);expect(lines.at(-1)).toMatch(/^mp72\.zip: refused/);   // the per-map reader's refusal, as before
  });
});

describe('importing an HD pack zip in the page (HD-6)',()=>{
  it('stores a valid pack, and the HD switch applies it with no pack served',async()=>{
    const {leaf,blob}=await packZip(),store=memoryHdStore();
    const r=await importHdZip(blob,store);
    expect(r).toMatchObject({name:'HD four maps',textures:1});
    expect((await store.current())?.name).toBe('HD four maps');
    const registry=new HdTextureRegistry(),t=new DataTexture(leaf.data,2,2);registry.register(t,leaf);
    const pack=new HdServedPack(async()=>new Response('',{status:404}),()=>undefined,registry,store);
    await pack.setEnabled(true);
    expect(t.image.width).toBe(8);expect(pack.statusText()).toBe('HD four maps (imported): 1 texture replaced in this scene.');
  });
  it('accepts the layout under a top folder too',async()=>{
    const {blob}=await packZip({prefix:'SOCOM2-HD/'});expect(await importHdZip(blob,memoryHdStore())).toMatchObject({textures:1});
  });
  it('answers null for a zip that is not an HD pack, so the per-map import reads it',async()=>{
    const blob=new Blob([zipSync({'MP72/export.json':new Uint8Array([123,125])}).slice().buffer as ArrayBuffer]);
    expect(await importHdZip(blob,memoryHdStore())).toBeNull();
  });
  it('refuses a pack whose manifest is not its id, or that lacks a payload, and keeps the stored one',async()=>{
    const store=memoryHdStore();await importHdZip((await packZip()).blob,store);
    await expect(importHdZip((await packZip({badId:true})).blob,store)).rejects.toThrow(/does not match its id/);
    await expect(importHdZip((await packZip({dropPayload:true})).blob,store)).rejects.toThrow(/0\.dds is missing/);
    expect((await store.current())?.name).toBe('HD four maps');
  });
});

describe('the IndexedDB store (review finding 2)',()=>{
  it('keeps the pack in use and leaves nothing behind when an import fails part-way; a whole import leaves only itself',async()=>{
    const {IDBFactory,IDBKeyRange}=await import('fake-indexeddb');const {idbHdStore}=await import('../src/hdTexturePackStore');
    const idb=new IDBFactory(),store=idbHdStore(()=>idb,IDBKeyRange);
    const meta=(id:string)=>({id,name:id,textures:1,bytes:4,importedAt:'2026-10-31T00:00:00.000Z'});
    const names=Array.from({length:70},(_,i)=>`${i}.dds`);
    await store.replace(meta('a'.repeat(64)),['manifest.json',...names],async()=>new Uint8Array([1]));
    await expect(store.replace(meta('b'.repeat(64)),['manifest.json',...names],async n=>{if(n==='50.dds')throw new Error('no space');return new Uint8Array([2]);})).rejects.toThrow('no space');
    expect((await store.current())?.id).toBe('a'.repeat(64));expect(await store.file('3.dds')).toEqual(new Uint8Array([1]));
    const keys=async()=>new Promise<string[]>((ok)=>{const r=idb.open('s2u.hdTexturePack',1);r.onsuccess=()=>{const q=r.result.transaction('files').objectStore('files').getAllKeys();q.onsuccess=()=>{ok(q.result as string[]);r.result.close();};};});
    expect((await keys()).every(k=>k.startsWith('a'))).toBe(true);
    await store.replace(meta('c'.repeat(64)),['manifest.json','0.dds'],async()=>new Uint8Array([3]));
    expect((await keys()).sort()).toEqual([`${'c'.repeat(64)}/0.dds`,`${'c'.repeat(64)}/manifest.json`]);
  });
});

describe('the map texture pack and the HD registry (review finding 1)',()=>{
  it('a texture the map pack replaces and restores stays known to the HD registry',async()=>{
    const {hdTextures}=await import('../src/hdTexturePack');const {TexturePackTarget}=await import('../src/texturePackRuntime');
    hdTextures.collect();
    const src=image(2,2,[9,9,9,255]),t=new DataTexture(src.data,2,2);hdTextures.register(t,src);
    const target=new TexturePackTarget(()=>new Map(),new Map([['wall',t]]),'MP72');
    const bytes=new Uint8Array(4*4*4).fill(200);
    expect(target.apply({key:'wall',bytes:bytes.length,mipmaps:false,levels:[{width:4,height:4,offset:0,bytes:bytes.length,sourceLevel:0}]} as never,bytes)).toBe(true);
    target.restore();
    expect(hdTextures.textures()).toContain(t);expect(hdTextures.source(t)).toBe(src);
  });
});

describe('two tabs importing at once (PR #628 review, P2)',()=>{
  it('the second import waits for the first under the store\'s lock, and ends whole and current',async()=>{
    const {IDBFactory,IDBKeyRange}=await import('fake-indexeddb');const {idbHdStore}=await import('../src/hdTexturePackStore');
    // One lock manager shared by the two "tabs", as navigator.locks is across an origin's tabs.
    let held:Promise<void>=Promise.resolve();
    const locks={request:<T>(_name:string,fn:()=>Promise<T>):Promise<T>=>{const run=held.then(fn);held=run.then(()=>undefined,()=>undefined);return run;}};
    const idb=new IDBFactory(),tabA=idbHdStore(()=>idb,IDBKeyRange,locks),tabB=idbHdStore(()=>idb,IDBKeyRange,locks);
    const meta=(id:string)=>({id,name:id,textures:1,bytes:4,importedAt:'2026-10-31T00:00:00.000Z'});
    const names=Array.from({length:40},(_,i)=>`${i}.dds`);
    let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
    const a=tabA.replace(meta('a'.repeat(64)),['manifest.json',...names],async n=>{if(n==='20.dds')await gate;return new Uint8Array([1]);});
    const b=tabB.replace(meta('b'.repeat(64)),['manifest.json',...names],async()=>new Uint8Array([2]));
    await new Promise(r=>setTimeout(r,20));release();await Promise.all([a,b]);
    expect((await tabA.current())?.id).toBe('b'.repeat(64));
    for(const n of names)expect(await tabA.file(n),n).toEqual(new Uint8Array([2]));
  });
});
