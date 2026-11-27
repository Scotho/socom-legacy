import {describe,expect,it} from 'vitest';
import type {HdManifest} from '../src/hdTexturePack';
import {HdRefusal} from '../src/hdTexturePack';
import {HD_ROOT,servedHdSource,HD_FETCH_ATTEMPTS_ADAPTATION} from '../src/hdTexturePackServed';
import {HdDownloadFailed,idbHdStore,installHdFromSource,memoryHdStore,type HdPackSource,type HdStore} from '../src/hdTexturePackStore';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {sha256} from '../src/texturePack';

/**
 * LATER 1135 (tier 1 row 9; product track, a browser adaptation: the PS2 has no texture pack): the 1.5 GB HD install
 * survives a failed request. A payload's request that fails (the network, a status) is tried again with a backoff; a
 * missing file (404) or one over its entry's size is refused at once (a bad file, not a failed request); a request that
 * fails every time says "could not be downloaded", keeps the files already stored and the next install resumes from them.
 */
const noSleep=async()=>undefined;
const ok=(b:Uint8Array)=>new Response(b.slice().buffer as ArrayBuffer);

describe('servedHdSource: a failed payload request is tried again; a bad file is not',()=>{
  const entry={file:'0.dds',bytes:16};
  const url=`${HD_ROOT}${'a'.repeat(64)}/0.dds`;
  it('a network failure once, then the bytes: installed, with one backoff',async()=>{
    let n=0;const slept:number[]=[];
    const src=servedHdSource(async()=>{if(n++===0)throw new TypeError('Failed to fetch');return ok(new Uint8Array(16));},undefined,{sleep:async(ms)=>{slept.push(ms);}});
    expect((await src.payload('a'.repeat(64),entry)).length).toBe(16);
    expect(n).toBe(2);expect(slept.length).toBe(1);
  });
  it('a body that stops arriving times out and is tried again (served run, PC 2: an install stalled at 1325.6 MB)',async()=>{
    let n=0;
    const hung=(signal:AbortSignal|undefined)=>new Response(new ReadableStream<Uint8Array>({start(c){signal?.addEventListener('abort',()=>c.error(signal.reason),{once:true});}}));
    const src=servedHdSource(async(_u,i)=>n++===0?hung(i?.signal??undefined):ok(new Uint8Array(16)),undefined,{sleep:noSleep,attemptMs:30});
    expect((await src.payload('a'.repeat(64),entry)).length).toBe(16);expect(n).toBe(2);
  });
  it("a body that never arrives on every try: could not be downloaded; the caller's own abort still ends it at once",async()=>{
    const hung=(signal:AbortSignal|undefined)=>new Response(new ReadableStream<Uint8Array>({start(c){signal?.addEventListener('abort',()=>c.error(signal.reason),{once:true});}}));
    const e=await servedHdSource(async(_u,i)=>hung(i?.signal??undefined),undefined,{sleep:noSleep,attemptMs:20,attempts:2}).payload('a'.repeat(64),entry).catch(x=>x);
    expect(e).toBeInstanceOf(HdDownloadFailed);
    const stop=new AbortController();let calls=0;
    const p=servedHdSource(async(_u,i)=>{calls++;return hung(i?.signal??undefined);},stop.signal,{sleep:noSleep,attemptMs:10_000}).payload('a'.repeat(64),entry).catch(x=>x);
    setTimeout(()=>stop.abort(new DOMException('stopped','AbortError')),20);
    const s=await p;expect(s).not.toBeInstanceOf(HdDownloadFailed);expect(calls).toBe(1);
  });
  it('a 503 once, then the bytes',async()=>{
    let n=0;
    const src=servedHdSource(async()=>n++===0?new Response('busy',{status:503}):ok(new Uint8Array(16)),undefined,{sleep:noSleep});
    expect((await src.payload('a'.repeat(64),entry)).length).toBe(16);expect(n).toBe(2);
  });
  it('failing every time: "could not be downloaded", after the named attempts, with growing waits',async()=>{
    const seen:string[]=[];const slept:number[]=[];
    const src=servedHdSource(async(u)=>{seen.push(u);throw new TypeError('Failed to fetch');},undefined,{sleep:async(ms)=>{slept.push(ms);}});
    const e=await src.payload('a'.repeat(64),entry).catch(x=>x);
    expect(e).toBeInstanceOf(HdDownloadFailed);expect(e).toBeInstanceOf(HdRefusal);
    expect((e as HdRefusal).reason).toBe('0.dds could not be downloaded');
    expect(seen).toEqual(Array(HD_FETCH_ATTEMPTS_ADAPTATION).fill(url));
    expect(slept.length).toBe(HD_FETCH_ATTEMPTS_ADAPTATION-1);
    for(let i=1;i<slept.length;i++)expect(slept[i]!).toBeGreaterThan(slept[i-1]!);
  });
  it('a missing file is refused at once, not tried again',async()=>{
    let n=0;
    const src=servedHdSource(async()=>{n++;return new Response('',{status:404});},undefined,{sleep:noSleep});
    expect(((await src.payload('a'.repeat(64),entry).catch(x=>x)) as HdRefusal).reason).toBe(`${'a'.repeat(64)}/0.dds is missing`);expect(n).toBe(1);
  });
  it('a file over its entry\'s size is refused at once, not tried again',async()=>{
    let n=0;
    const src=servedHdSource(async()=>{n++;return ok(new Uint8Array(4096));},undefined,{sleep:noSleep});
    const e=await src.payload('a'.repeat(64),entry).catch(x=>x);
    expect(e).not.toBeInstanceOf(HdDownloadFailed);expect((e as HdRefusal).reason).toBe('0.dds is over its entry\'s size');expect(n).toBe(1);
  });
});

/** A three-payload pack as a source; `fail(file, attempt)` true makes that request throw (a failed download). */
async function threePack(packedBytes?:number){
  const payloads=['0.dds','1.dds','2.dds'].map((file,i)=>({file,data:new Uint8Array(16).fill(i+1)}));
  const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD three',method:'test',totalBytes:48,...(packedBytes!==undefined?{packedBytes}:{}),
    entries:await Promise.all(payloads.map(async(p,i)=>({key:'0'.repeat(63)+String(i),width:2,height:2,file:p.file,format:'dds' as const,outWidth:2,outHeight:2,bytes:16,sha256:await sha256(p.data),tier:'A' as const,source:`s${i}.dds`}))) as HdManifest['entries']};
  const mb=new TextEncoder().encode(JSON.stringify(manifest)),id=await sha256(mb);
  const asked:string[]=[];
  const source=(fail:(file:string)=>boolean):HdPackSource=>({
    pointer:async()=>new TextEncoder().encode(JSON.stringify({version:1,packId:id})),
    manifest:async()=>mb,
    payload:async(_id,e)=>{asked.push(e.file);if(fail(e.file))throw new HdDownloadFailed(e.file);return payloads.find(p=>p.file===e.file)!.data;},
  });
  return {id,source,asked};
}

describe('installHdFromSource: a failed download keeps what it stored and the next install resumes',()=>{
  it('the third payload failing: refused as a download, nothing in use, the first two kept for the next try',async()=>{
    const {id,source,asked}=await threePack(),store=memoryHdStore();
    const e=await installHdFromSource(source(f=>f==='2.dds'),store).catch(x=>x);
    expect(e).toBeInstanceOf(HdDownloadFailed);
    expect(await store.current()).toBeNull();
    expect([...(await store.partial!(id))].sort()).toEqual(['0.dds','1.dds','manifest.json']);
    asked.length=0;
    const r=await installHdFromSource(source(()=>false),store);
    expect(asked).toEqual(['2.dds']);                     // resumed: only the missing payload fetched
    expect(r.fetched).toBe(true);expect((await store.current())?.id).toBe(id);
    expect(await store.file('0.dds')).toEqual(new Uint8Array(16).fill(1));
    expect(await store.file('2.dds')).toEqual(new Uint8Array(16).fill(3));
  });
  it('the progress counts the kept files first on a resume',async()=>{
    const {source}=await threePack(),store=memoryHdStore();
    await installHdFromSource(source(f=>f==='2.dds'),store).catch(()=>undefined);
    const files:number[]=[];
    await installHdFromSource(source(()=>false),store,(f)=>{files.push(f);});
    expect(files).toEqual([3,4]);
  });
  it('a bad file (a refusal that is not a download) keeps the old rule: nothing kept',async()=>{
    const {id,source}=await threePack(),store=memoryHdStore();
    const bad:HdPackSource={...source(()=>false),payload:async(_i,e)=>{if(e.file==='2.dds')throw new HdRefusal('2.dds is over its entry\'s size');return new Uint8Array(16);}};
    await installHdFromSource(bad,store).catch(()=>undefined);
    expect([...(await store.partial!(id))]).toEqual([]);
  });
});

describe("the same resume on the IndexedDB store (the page's)",()=>{
  it('a failed download keeps its files under the id; the next install fetches only the missing one; a whole install leaves no partial',async()=>{
    const {id,source,asked}=await threePack();
    const idb=new IDBFactory(),store:HdStore=idbHdStore(()=>idb,IDBKeyRange,null);
    await installHdFromSource(source(f=>f==='2.dds'),store).catch(()=>undefined);
    expect(await store.current()).toBeNull();
    expect([...(await store.partial!(id))].sort()).toEqual(['0.dds','1.dds','manifest.json']);
    asked.length=0;
    await installHdFromSource(source(()=>false),store);
    expect(asked).toEqual(['2.dds']);
    expect((await store.current())?.id).toBe(id);
    expect(await store.file('1.dds')).toEqual(new Uint8Array(16).fill(2));
    expect([...(await store.partial!(id))].sort()).toEqual(['0.dds','1.dds','2.dds','manifest.json']);
  });
  it('a bad file removes what the try wrote, as before',async()=>{
    const {id,source}=await threePack();
    const idb=new IDBFactory(),store:HdStore=idbHdStore(()=>idb,IDBKeyRange,null);
    const bad:HdPackSource={...source(()=>false),payload:async(_i,e)=>{if(e.file==='2.dds')throw new HdRefusal("2.dds is over its entry's size");return new Uint8Array(16);}};
    await installHdFromSource(bad,store).catch(()=>undefined);
    expect([...(await store.partial!(id))]).toEqual([]);
  });
});

describe('a cancelled install keeps what it stored, as a failed download does (review F2)',()=>{
  it('an abort mid-way: nothing in use, the stored files kept for the next try',async()=>{
    const {id,source}=await threePack(),store=memoryHdStore();
    const aborting:HdPackSource={...source(()=>false),payload:async(_i,e)=>{if(e.file==='2.dds')throw new DOMException('The operation was aborted.','AbortError');return new Uint8Array(16).fill(1);}};
    await installHdFromSource(aborting,store).catch(()=>undefined);
    expect(await store.current()).toBeNull();
    expect([...(await store.partial!(id))].sort()).toEqual(['0.dds','1.dds','manifest.json']);
  });
});

describe("the resume's bytes: the kept files counted at their share of the download, never past it (served run, PC 2)",()=>{
  it('kept payloads count at packedBytes/totalBytes of their decoded size; the shown bytes end at the download total',async()=>{
    const {source}=await threePack(24),store=memoryHdStore();      // the payloads download at half their decoded size
    await installHdFromSource(source(f=>f==='2.dds'),store).catch(()=>undefined);
    const seen:[number,number|null][]=[];
    await installHdFromSource(source(()=>false),store,(_f,bytes,_t,_of,ofBytes)=>{seen.push([bytes,ofBytes]);});
    const of=seen[0]![1]!;
    const mbLength=of-24;
    expect(seen[0]![0]).toBe(mbLength+16);                        // the manifest, and two kept payloads at 8 each
    for(const [b] of seen)expect(b).toBeLessThanOrEqual(of);
  });
});
