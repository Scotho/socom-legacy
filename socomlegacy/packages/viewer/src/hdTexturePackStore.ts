import {HdRefusal,HD_LIMITS,validateHdManifest} from './hdTexturePack';
import {hashString,sha256} from './texturePack';
import {pageIndexedDb} from './pageStore';
import {blobSource,openZip,type ZipMember} from './zipReader';

/**
 * OT.R92 (HD-6): an HD pack imported in the page (the test room's "Import pack (.zip)"), kept in this browser only --
 * the served layout's zip (`experimental-packs/hd/current.json`, `<id>/manifest.json` and its payloads, under any top
 * folder). One pack at a time: an import replaces the one kept. Checked as a served pack is (the manifest is its id,
 * every payload present and within its entry's size); the runtime then checks each payload's hash as it applies it.
 * A browser adaptation, H135; nothing leaves the browser.
 */
export interface HdStoredMeta {id:string;name:string;textures:number;bytes:number;importedAt:string}
export interface HdStore {
  current():Promise<HdStoredMeta|null>;
  /** A file of the kept pack: `manifest.json` or a payload's name. */
  file(name:string):Promise<Uint8Array|null>;
  /** Replaces the kept pack with `meta` and the files `read` yields, in order; the old pack is gone only once the new one is whole. */
  replace(meta:HdStoredMeta,names:string[],read:(name:string)=>Promise<Uint8Array>):Promise<void>;
}
export const HD_STORE_DB='s2u.hdTexturePack';
const FILES='files',META='meta';

/** For tests and a browser without IndexedDB in a test: the same contract in memory. */
export function memoryHdStore():HdStore{
  let meta:HdStoredMeta|null=null,files=new Map<string,Uint8Array>();
  return {
    current:async()=>meta,
    file:async(name)=>meta?files.get(`${meta.id}/${name}`)??null:null,
    async replace(m,names,read){const next=new Map<string,Uint8Array>();for(const n of names)next.set(`${m.id}/${n}`,await read(n));files=next;meta=m;},
  };
}

const req=<T>(r:IDBRequest<T>):Promise<T>=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
const done=(tx:IDBTransaction):Promise<void>=>new Promise((ok,no)=>{tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error??new Error('the pack store refused the write'));tx.onerror=()=>no(tx.error);});
let shared:HdStore|null=null;
/** The page's one HD store (one database connection a page, shared by the test room and every match). */
export const pageHdStore=():HdStore=>shared??=idbHdStore();

/** The part of the Web Locks API the store uses (`navigator.locks`): one exclusive lock an origin, across its tabs. */
export interface HdStoreLocks {request<T>(name:string,fn:()=>Promise<T>):Promise<T>}
export const HD_STORE_LOCK='s2u.hdTexturePack.replace';
/**
 * `Keys`: the key-range constructor beside the factory (a test passes fake-indexeddb's; a browser has the global).
 * `locks`: the cross-tab lock a replacement holds whole (PR #628's review: two tabs importing at once, one's cleanup took
 * the other's files). Without one (a browser with no Web Locks), a replacement removes only the old pack's files and its
 * own on failure, never another import's. That fallback (a browser with no Web Locks, which every current one has) can
 * leave the losing tab's files until a later locked replacement, and two tabs importing the same pack id where one
 * fails can lose the other's files: rare, and the pack is imported again.
 */
export function idbHdStore(factory:()=>IDBFactory|null|undefined=pageIndexedDb,Keys:typeof IDBKeyRange=globalThis.IDBKeyRange,
  locks:HdStoreLocks|null=(globalThis.navigator as {locks?:HdStoreLocks}|undefined)?.locks??null):HdStore{
  let opened:Promise<IDBDatabase>|null=null;
  const db=()=>opened??=new Promise<IDBDatabase>((ok,no)=>{
    const idb=factory();if(!idb){no(new HdRefusal('this browser has no IndexedDB'));return;}
    const r=idb.open(HD_STORE_DB,1);
    r.onupgradeneeded=()=>{r.result.createObjectStore(FILES);r.result.createObjectStore(META);};
    r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);r.onblocked=()=>no(new HdRefusal('another tab holds the pack store'));
  }).catch(e=>{opened=null;throw e;});
  const get=async<T>(store:string,key:string):Promise<T|null>=>{const t=(await db()).transaction(store,'readonly');return (await req(t.objectStore(store).get(key)) as T|undefined)??null;};
  return {
    current:()=>get<HdStoredMeta>(META,'current'),
    async file(name){const m=await get<HdStoredMeta>(META,'current');return m?get<Uint8Array>(FILES,`${m.id}/${name}`):null;},
    replace(m,names,read){return locks?locks.request(HD_STORE_LOCK,()=>replaceNow(m,names,read,true)):replaceNow(m,names,read,false);},
  };
  async function replaceNow(m:HdStoredMeta,names:string[],read:(name:string)=>Promise<Uint8Array>,alone:boolean):Promise<void>{
      const d=await db(),old=await get<HdStoredMeta>(META,'current');
      const range=(id:string)=>Keys.bound(`${id}/`,`${id}/\uffff`);
      // Payloads go in batches (a 145 MB pack is never one transaction), the pointer last. A failure part-way (a quota,
      // a member that does not read) removes what this import wrote and keeps the pack in use.
      try{
        for(let i=0;i<names.length;i+=32){
          const batch:[string,Uint8Array][]=[];for(const n of names.slice(i,i+32))batch.push([n,await read(n)]);
          const t=d.transaction(FILES,'readwrite');for(const [n,b] of batch)t.objectStore(FILES).put(b,`${m.id}/${n}`);await done(t);
        }
        const t=d.transaction(META,'readwrite');t.objectStore(META).put(m,'current');await done(t);
      }catch(e){
        if(old?.id!==m.id){const c=d.transaction(FILES,'readwrite');c.objectStore(FILES).delete(range(m.id));await done(c).catch(()=>undefined);}
        throw e;
      }
      // Whole. Under the lock no other import runs, so every file outside the new pack goes (the old pack's, and any
      // earlier failure's); without it only the old pack's, so another tab's import in progress is never touched.
      const c=d.transaction(FILES,'readwrite');
      if(alone){c.objectStore(FILES).delete(Keys.upperBound(`${m.id}/`,true));c.objectStore(FILES).delete(Keys.lowerBound(`${m.id}/\uffff`,true));}
      else if(old&&old.id!==m.id)c.objectStore(FILES).delete(range(old.id));
      await done(c);
  }
}

/**
 * Imports `file` when it is an HD pack zip: null when it is not one (no `experimental-packs/hd/current.json`), so the
 * per-map import reads it instead; a refusal (`HdRefusal`) with the reason when it is one that does not check out --
 * the kept pack is then untouched.
 */
export async function importHdZip(file:Blob,store:HdStore):Promise<{name:string;textures:number;bytes:number}|null>{
  const zip=await openZip(blobSource(file));
  const pointer=zip.members.find(m=>/(^|\/)experimental-packs\/hd\/current\.json$/.test(m.name));
  if(!pointer)return null;
  if(pointer.size>1024)throw new HdRefusal('current.json is over 1 KiB');
  const root=pointer.name.slice(0,-'current.json'.length);
  const p=JSON.parse(new TextDecoder().decode(await zip.read(pointer))) as {version?:unknown;packId?:unknown};
  if(p?.version!==1||!hashString(p.packId))throw new HdRefusal('current.json does not name a pack');
  const byName=new Map(zip.members.map(m=>[m.name,m] as [string,ZipMember]));
  const mm=byName.get(`${root}${p.packId}/manifest.json`);if(!mm)throw new HdRefusal('the manifest is missing');
  if(mm.size>HD_LIMITS.manifestBytes)throw new HdRefusal('the manifest is over its bound');
  const mb=await zip.read(mm);
  if(await sha256(mb)!==p.packId)throw new HdRefusal('the manifest does not match its id');
  const manifest=validateHdManifest(JSON.parse(new TextDecoder().decode(mb)));
  const sizes=new Map(manifest.entries.map(e=>[e.file,e.bytes]));
  for(const [f,bytes] of sizes){
    const m=byName.get(`${root}${p.packId}/${f}`);
    if(!m)throw new HdRefusal(`${f} is missing`);
    if(m.size>bytes+1024)throw new HdRefusal(`${f} is over its entry's size`);
  }
  const names=['manifest.json',...sizes.keys()];
  const meta:HdStoredMeta={id:p.packId,name:manifest.name,textures:manifest.entries.length,bytes:manifest.totalBytes,importedAt:new Date().toISOString()};
  await store.replace(meta,names,async n=>n==='manifest.json'?mb:zip.read(byName.get(`${root}${p.packId}/${n}`)!));
  return {name:manifest.name,textures:manifest.entries.length,bytes:manifest.totalBytes};
}
