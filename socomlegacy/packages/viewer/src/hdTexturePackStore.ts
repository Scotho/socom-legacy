import {HdRefusal,HD_LIMITS,validateHdManifest} from './hdTexturePack';
import {hdPackFiles} from './hdPackLayout';
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
  /**
   * Replaces the kept pack with `meta` and the files `read` yields, in order; the old pack is gone only once the new one is
   * whole. LATER 1135: with `resume`, a file already stored under `meta.id` (an earlier try's) is not read again, and a
   * failure part-way keeps what was written for the next try (without it, removed as before).
   */
  replace(meta:HdStoredMeta,names:string[],read:(name:string)=>Promise<Uint8Array>,options?:{resume?:boolean}):Promise<void>;
  /** LATER 1135: the files already stored under `id` -- the kept pack's, or an unfinished try's. Optional: a fake may omit it. */
  partial?(id:string):Promise<Set<string>>;
  /** B206 ML-1 (ML.R7): drops the kept pack, its pointer first, then its files (MODS' Remove). Optional: a fake may omit it. */
  remove?():Promise<void>;
}
export const HD_STORE_DB='s2u.hdTexturePack';
const FILES='files',META='meta';

/** For tests and a browser without IndexedDB in a test: the same contract in memory. */
export function memoryHdStore():HdStore{
  let meta:HdStoredMeta|null=null,files=new Map<string,Uint8Array>();
  /** LATER 1135: an unfinished try's files, by `<id>/<name>`, kept for a resume. */
  const staged=new Map<string,Uint8Array>();
  const under=(id:string)=>[...new Set([...staged.keys(),...files.keys()])].filter(k=>k.startsWith(`${id}/`));
  return {
    current:async()=>meta,
    file:async(name)=>meta?files.get(`${meta.id}/${name}`)??null:null,
    async replace(m,names,read,options){
      try{
        for(const n of names){
          const k=`${m.id}/${n}`;
          if(options?.resume&&(staged.has(k)||files.has(k))){if(!staged.has(k))staged.set(k,files.get(k)!);continue;}
          staged.set(k,await read(n));
        }
      }catch(e){if(!options?.resume)for(const k of [...staged.keys()])if(k.startsWith(`${m.id}/`))staged.delete(k);throw e;}   // as the IndexedDB store's range delete
      const next=new Map<string,Uint8Array>();for(const n of names){const k=`${m.id}/${n}`;next.set(k,staged.get(k)!);}
      for(const k of [...staged.keys()])if(k.startsWith(`${m.id}/`))staged.delete(k);
      files=next;meta=m;
    },
    partial:async(id)=>new Set(under(id).map(k=>k.slice(id.length+1))),
    async remove(){meta=null;files=new Map();staged.clear();},
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
    replace(m,names,read,options){const resume=options?.resume===true;return locks?locks.request(HD_STORE_LOCK,()=>replaceNow(m,names,read,true,resume)):replaceNow(m,names,read,false,resume);},
    // LATER 1135: the names stored under `id` (keys only), the kept pack's or an unfinished try's.
    async partial(id){const t=(await db()).transaction(FILES,'readonly');return new Set((await req(t.objectStore(FILES).getAllKeys(Keys.bound(`${id}/`,`${id}/\uffff`)))).map(k=>String(k).slice(id.length+1)));},
    // B206 ML-1: the pointer goes first (the pack is gone for every reader at once), then every file, under the same
    // lock a replacement holds, so a removal never takes another tab's import in progress.
    remove(){return locks?locks.request(HD_STORE_LOCK,()=>removeNow(true)):removeNow(false);},
  };
  async function removeNow(alone:boolean):Promise<void>{
    const d=await db(),old=await get<HdStoredMeta>(META,'current');
    const t=d.transaction(META,'readwrite');t.objectStore(META).delete('current');await done(t);
    const c=d.transaction(FILES,'readwrite');
    if(alone)c.objectStore(FILES).clear();else if(old)c.objectStore(FILES).delete(Keys.bound(`${old.id}/`,`${old.id}/\uffff`));
    await done(c);
  }
  async function replaceNow(m:HdStoredMeta,names:string[],read:(name:string)=>Promise<Uint8Array>,alone:boolean,resume=false):Promise<void>{
      const d=await db(),old=await get<HdStoredMeta>(META,'current');
      const range=(id:string)=>Keys.bound(`${id}/`,`${id}/\uffff`);
      // LATER 1135: on a resume, the files an earlier try stored under this id are not read again.
      let toRead=names;
      if(resume){const t=d.transaction(FILES,'readonly');const have=new Set((await req(t.objectStore(FILES).getAllKeys(range(m.id)))).map(String));toRead=names.filter(n=>!have.has(`${m.id}/${n}`));}
      // Payloads go in batches (a 145 MB pack is never one transaction), the pointer last. A failure part-way (a quota,
      // a member that does not read) removes what this import wrote and keeps the pack in use.
      try{
        const put=async(batch:[string,Uint8Array][]):Promise<void>=>{const t=d.transaction(FILES,'readwrite');for(const [n,b] of batch)t.objectStore(FILES).put(b,`${m.id}/${n}`);await done(t);};
        for(let i=0;i<toRead.length;i+=32){
          const batch:[string,Uint8Array][]=[];
          // LATER 1135: on a resume, what the batch already read is written before the failure goes on (a batch read in
          // full is one transaction; without this a failed file lost up to 31 read beside it).
          try{for(const n of toRead.slice(i,i+32))batch.push([n,await read(n)]);}
          catch(e){if(resume&&batch.length)await put(batch).catch(()=>undefined);throw e;}
          await put(batch);
        }
        const t=d.transaction(META,'readwrite');t.objectStore(META).put(m,'current');await done(t);
      }catch(e){
        // LATER 1135: a resumable try keeps what it wrote for the next one; the next whole import clears what is left.
        if(!resume&&old?.id!==m.id){const c=d.transaction(FILES,'readwrite');c.objectStore(FILES).delete(range(m.id));await done(c).catch(()=>undefined);}
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
export async function importHdZip(file:Pick<Blob,'size'|'slice'>,store:HdStore,
  /** B206 ML-1: the import's progress, files and bytes read into the store (MODS' one progress stream). */
  onProgress?:(files:number,bytes:number)=>void):Promise<{name:string;textures:number;bytes:number}|null>{
  const zip=await openZip(blobSource(file as Blob));
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
  const sizes=new Map(hdPackFiles(manifest).map(e=>[e.file,e.bytes]));   // WM-32: the layouts' files kept beside the base's
  for(const [f,bytes] of sizes){
    const m=byName.get(`${root}${p.packId}/${f}`);
    if(!m)throw new HdRefusal(`${f} is missing`);
    if(m.size>bytes+1024)throw new HdRefusal(`${f} is over its entry's size`);
  }
  const names=['manifest.json',...sizes.keys()];
  const meta:HdStoredMeta={id:p.packId,name:manifest.name,textures:manifest.entries.length,bytes:manifest.totalBytes,importedAt:new Date().toISOString()};
  let files=0,bytes=0;
  await store.replace(meta,names,async n=>{
    const b=n==='manifest.json'?mb:await zip.read(byName.get(`${root}${p.packId}/${n}`)!);
    files++;bytes+=b.length;onProgress?.(files,bytes);return b;
  });
  return {name:manifest.name,textures:manifest.entries.length,bytes:manifest.totalBytes};
}

/**
 * B206 ML-12 (plan 2026-11-06-mods-loader, ML.R16; `TEST_HD_PACK_BUTTON_ADAPTATION`, removed with it by ML-13): an HD pack
 * read from a source that is not a zip -- the served layout fetched (`./hdTexturePackServed` `servedHdSource`) -- for the
 * MODS screen's temporary "Add test HD texture pack". `pointer` is `current.json`; `manifest` the pack's manifest by its
 * id; `payload` one entry's file, bounded by the source.
 */
export interface HdPackSource {
  pointer():Promise<Uint8Array>;
  manifest(packId:string):Promise<Uint8Array>;
  payload(packId:string,entry:{file:string;bytes:number}):Promise<Uint8Array>;
}
/**
 * ML-12: the pack is not served here -- `current.json` is missing (a 404, or the static host's HTML).
 * `TEST_HD_PACK_BUTTON_ADAPTATION` says it in words ("The test HD pack is not available yet").
 */
export class HdNotServed extends HdRefusal {constructor(){super('the HD pack is not served here');this.name='HdNotServed';}}
/**
 * LATER 1135: a file's request failed every time it was tried (the network, a status) -- a failed download, not a bad
 * file. `installHdFromSource` keeps what it stored and the next install resumes from it.
 */
export class HdDownloadFailed extends HdRefusal {constructor(readonly file:string){super(`${file} could not be downloaded`);this.name='HdDownloadFailed';}}
/**
 * The source's pack checked as `importHdZip` checks a zip's -- the pointer under 1 KiB naming a pack, the manifest its id
 * and valid, each payload present and within its entry's size -- and kept whole in `store` (a failure part-way keeps
 * the pack in use, `HdStore.replace`'s rule); each payload's decoded hash is checked by the runtime as it applies it, as
 * for an imported zip. A pack already kept under the same id is not fetched again (`fetched` false). `onProgress`: the
 * files and bytes kept, the manifest's `totalBytes` (the decoded size, not the download's) and the files to fetch
 * (`ofFiles`, the manifest and each payload: ML-9's F3, the count a download's words reach the end of); `ofBytes`
 * (LATER 742) the bytes to fetch -- the manifest's and its `packedBytes` -- or null for a pack that names none.
 */
export async function installHdFromSource(source:HdPackSource,store:HdStore,onProgress?:(files:number,bytes:number,total:number,ofFiles:number,ofBytes:number|null)=>void)
  :Promise<{id:string;name:string;textures:number;bytes:number;fetched:boolean}>{
  const raw=await source.pointer();
  if(raw.length>1024)throw new HdRefusal('current.json is over 1 KiB');
  const p=JSON.parse(new TextDecoder().decode(raw)) as {version?:unknown;packId?:unknown};
  if(p?.version!==1||!hashString(p.packId))throw new HdRefusal('current.json does not name a pack');
  const packId=p.packId;
  const kept=await store.current().catch(()=>null);
  if(kept?.id===packId)return {id:packId,name:kept.name,textures:kept.textures,bytes:kept.bytes,fetched:false};
  const mb=await source.manifest(packId);
  if(mb.length>HD_LIMITS.manifestBytes)throw new HdRefusal('the manifest is over its bound');
  if(await sha256(mb)!==packId)throw new HdRefusal('the manifest does not match its id');
  const manifest=validateHdManifest(JSON.parse(new TextDecoder().decode(mb)));
  const sizes=new Map(hdPackFiles(manifest).map(e=>[e.file,e.bytes]));   // WM-32: the layouts' files kept beside the base's
  const names=['manifest.json',...sizes.keys()],ofBytes=manifest.packedBytes===undefined?null:mb.length+manifest.packedBytes;
  const meta:HdStoredMeta={id:packId,name:manifest.name,textures:manifest.entries.length,bytes:manifest.totalBytes,importedAt:new Date().toISOString()};
  // LATER 1135: an earlier try's files under this id are kept and not fetched again (`HdStore.replace`'s `resume`); a
  // failed download keeps what was stored, a bad file (any other refusal) removes it as before.
  const have=await (store.partial?.(packId).catch(()=>new Set<string>()))??new Set<string>();
  let files=0,bytes=0;
  // The served run (PC 2): a kept payload counts at its share of the download -- its decoded size times packedBytes over
  // totalBytes (the manifest names no per-file download size) -- not its decoded size, which ran the readout ~650 MB high
  // at a resume's start and past the total at its end; the shown bytes never pass the download's total.
  const share=manifest.packedBytes!==undefined&&manifest.totalBytes>0?manifest.packedBytes/manifest.totalBytes:1;
  const shown=(b:number)=>ofBytes===null?b:Math.min(b,ofBytes);
  for(const n of names)if(have.has(n)){files++;bytes+=n==='manifest.json'?mb.length:Math.round(sizes.get(n)!*share);}
  if(files)onProgress?.(files,shown(bytes),manifest.totalBytes,names.length,ofBytes);
  const read=async(n:string):Promise<Uint8Array>=>{
    let b=mb;
    if(n!=='manifest.json'){
      const size=sizes.get(n)!;b=await source.payload(packId,{file:n,bytes:size});
      if(b.length>size+1024)throw new HdRefusal(`${n} is over its entry's size`);
    }
    files++;bytes+=b.length;onProgress?.(files,shown(bytes),manifest.totalBytes,names.length,ofBytes);return b;
  };
  try{await store.replace(meta,names,read,{resume:true});}
  // review F2: a cancelled install (an AbortError) keeps what it stored too -- only a bad file drops it.
  catch(e){if(!(e instanceof HdDownloadFailed)&&!isAbort(e))await dropPartial(store,meta,names);throw e;}
  return {id:packId,name:manifest.name,textures:manifest.entries.length,bytes:manifest.totalBytes,fetched:true};
}

/** LATER 1135: a try that failed on a bad file leaves nothing behind (the rule before the resume): its partial files go. */
async function dropPartial(store:HdStore,meta:HdStoredMeta,names:string[]):Promise<void>{
  if((await store.current().catch(()=>null))?.id===meta.id)return;
  await store.replace(meta,names,()=>Promise.reject(new Error('dropped'))).catch(()=>undefined);
}

/** An abort (`AbortSignal`'s reason, a DOMException named AbortError): a stopped try, not a bad file. */
const isAbort=(e:unknown):boolean=>typeof e==='object'&&e!==null&&(e as {name?:unknown}).name==='AbortError';
