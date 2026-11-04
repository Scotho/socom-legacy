import {IDBFactory as FakeFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {PackRefusal,type TexturePackIndexEntry} from '../src/texturePack';
import {UploadedPacks,UploadStoreUnavailable,idbUploadBackend,memoryUploadBackend,UPLOADED_PACKS_BYTES_LIMIT,UPLOADED_PACKS_PER_MAP_LIMIT,type UploadBackend} from '../src/texturePackStore';

// GX-27 (plan 2026-10-10-web-graphics-slice-4-packs; product track, a test-room instrument under H135): uploaded packs
// kept in the page's own IndexedDB, per map and pack id, bounded; a missing or blocked store is said, never fatal.
const entry=(id:string,bytes=16,name='p'):TexturePackIndexEntry=>({id,name,kind:'textures',method:'uploaded',scale:2,roles:'wide',generatedAt:'2026-10-15T19:00:00.000Z',textures:1,bytes,notes:''});
const hex=(n:number)=>n.toString(16).padStart(64,'0');
const files=(n:number)=>new Map([['manifest.json',new Uint8Array(8).fill(1)],['0.rgba',new Uint8Array(n).fill(2)]]);
const fake=()=>{const f=new FakeFactory() as unknown as IDBFactory;return ()=>f;};

describe('GX-27 the uploaded packs store',()=>{
 for(const [label,backend] of [['in memory',()=>memoryUploadBackend()],['in IndexedDB (fake-indexeddb)',()=>idbUploadBackend(fake())]] as [string,()=>UploadBackend][])
  it(`${label}: packs per map with their files; another map's are not listed; remove deletes the record and its files`,async()=>{
   const store=new UploadedPacks(backend());
   expect(await store.add('MP51','pack',entry(hex(1),16,'one'),files(16))).toBe('added');
   expect(await store.add('MP51','staged',entry(hex(2),4,'two'),new Map([['export.json',new Uint8Array([123])]]))).toBe('added');
   expect(await store.add('MP2','pack',entry(hex(3)),files(16))).toBe('added');
   expect((await store.list('MP51')).map(r=>[r.id,r.state,r.entry.name,r.bytes])).toEqual([[hex(1),'pack','one',24],[hex(2),'staged','two',1]]);
   expect((await store.list('MP2')).map(r=>r.id)).toEqual([hex(3)]);expect(await store.list('MP7')).toEqual([]);
   expect(await store.file('MP51',hex(1),'0.rgba')).toEqual(new Uint8Array(16).fill(2));expect(await store.file('MP51',hex(1),'9.rgba')).toBeNull();
   expect(await store.file('MP2',hex(1),'0.rgba')).toBeNull();
   expect(await store.add('MP51','pack',entry(hex(1),16,'again'),files(16))).toBe('exists');expect((await store.list('MP51'))[0]!.entry.name).toBe('one');
   await store.remove('MP51',hex(1));expect((await store.list('MP51')).map(r=>r.id)).toEqual([hex(2)]);expect(await store.file('MP51',hex(1),'manifest.json')).toBeNull();
   await store.remove('MP51',hex(9));expect(await store.usage()).toEqual({bytes:25,records:2});
  });
 it('the limits: at most 32 a map and 512 MiB in all, each refused with its reason before anything is written',async()=>{
  expect([UPLOADED_PACKS_PER_MAP_LIMIT,UPLOADED_PACKS_BYTES_LIMIT]).toEqual([32,512*1024*1024]);
  const store=new UploadedPacks(memoryUploadBackend(),{perMap:2,bytes:100});
  await store.add('MP51','pack',entry(hex(1)),files(16));await store.add('MP51','pack',entry(hex(2)),files(16));
  await expect(store.add('MP51','pack',entry(hex(3)),files(16))).rejects.toThrow(new PackRefusal('MP51 already holds 2 uploaded packs; remove one first'));
  await store.add('MP2','pack',entry(hex(4)),files(16));
  await expect(store.add('MP7','pack',entry(hex(5)),files(40))).rejects.toThrow(/the browser's pack store would pass its limit of 100 bytes \(72 \+ 48 bytes in use and new\)/);
  expect((await store.list('MP7'))).toEqual([]);expect(await store.usage()).toEqual({bytes:72,records:3});
 });
 // GX-27 review F2/F3: the room a new upload has, and a staged upload replaced by its pack without being counted twice.
 it('room(map) is what a new upload may take; replace() swaps a staged upload for its pack, the staged one left out of the limits',async()=>{
  const store=new UploadedPacks(memoryUploadBackend(),{perMap:2,bytes:60});
  expect(await store.room('MP51')).toBe(60);
  await store.add('MP51','staged',entry(hex(1),4,'staged'),files(26));expect(await store.room('MP51')).toBe(26);
  await expect(store.add('MP51','pack',entry(hex(2)),files(32))).rejects.toThrow(PackRefusal);
  expect(await store.replace('MP51',hex(1),'pack',entry(hex(2),40,'built'),files(32))).toBe('added');
  expect((await store.list('MP51')).map(r=>[r.id,r.state,r.bytes])).toEqual([[hex(2),'pack',40]]);expect(await store.file('MP51',hex(1),'0.rgba')).toBeNull();
  await store.add('MP51','pack',entry(hex(3)),files(4));
  await expect(store.room('MP51')).rejects.toThrow('MP51 already holds 2 uploaded packs; remove one first');
  await expect(store.replace('MP51',hex(9),'pack',entry(hex(4)),files(4))).rejects.toThrow(/already holds 2/);
 });
 it('the IndexedDB store outlives its connection: a second page load reads what the first stored',async()=>{
  const factory=fake();await new UploadedPacks(idbUploadBackend(factory)).add('MP51','pack',entry(hex(7)),files(16));
  const again=new UploadedPacks(idbUploadBackend(factory));
  expect((await again.list('MP51')).map(r=>r.id)).toEqual([hex(7)]);expect(await again.file('MP51',hex(7),'manifest.json')).toEqual(new Uint8Array(8).fill(1));
 });
 it('no IndexedDB, one whose opening throws, is blocked or never ends: every call rejects as unavailable, with its reason',async()=>{
  const blocked={open(){const r:{onblocked?:()=>void}={};setTimeout(()=>r.onblocked?.());return r;}} as unknown as IDBFactory;
  const silent={open(){return {};}} as unknown as IDBFactory;
  const throwing={open(){throw new DOMException('denied','SecurityError');}} as unknown as IDBFactory;
  for(const [factory,reason] of [[null,/no IndexedDB in this browser/],[throwing,/denied/],[blocked,/another tab holds/],[silent,/did not open in time/]] as [IDBFactory|null,RegExp][]){
   const store=new UploadedPacks(idbUploadBackend(()=>factory,{openTimeoutMs:20}));
   for(const call of [store.list('MP51'),store.add('MP51','pack',entry(hex(1)),files(4)),store.remove('MP51',hex(1)),store.file('MP51',hex(1),'0.rgba')]){
    const e=await call.then(()=>null,(x:unknown)=>x);expect(e,String(reason)).toBeInstanceOf(UploadStoreUnavailable);expect((e as Error).message).toMatch(reason);
   }
  }
 });
});
