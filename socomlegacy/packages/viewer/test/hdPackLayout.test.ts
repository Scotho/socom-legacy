import {afterEach,describe,expect,it,vi} from 'vitest';
import {DataTexture} from 'three';
import {HdPackRuntime,HdTextureRegistry,HD_LIMITS,validateHdManifest,type HdEntry,type HdManifest} from '../src/hdTexturePack';
import {currentHdLayout,hdEntriesFor,hdPackFiles} from '../src/hdPackLayout';
import {sha256} from '../src/texturePack';

/**
 * WM-32 (product track, a browser adaptation, no original; mechanism only -- the pack author's permission pending): one
 * HD pack carrying a layout overlay -- the Xbox-button files beside the PlayStation ones. Every fixture here is
 * synthetic: no pack file, no art.
 */
const labels=vi.hoisted(()=>({value:'auto' as string}));
vi.mock('../src/controllerLabels',async orig=>({...(await orig<typeof import('../src/controllerLabels')>()),readControllerLabels:()=>labels.value}));
afterEach(()=>{labels.value='auto';vi.unstubAllGlobals();});

const h=(n:number)=>n.toString(16).padStart(64,'0');
const whole=(key:number,file:number,sha=1000+file,over:Partial<HdEntry>={}):HdEntry=>({key:h(key),width:2,height:2,file:`${file}.png`,format:'png',
 outWidth:4,outHeight:4,bytes:64,sha256:h(sha),tier:'A',source:'deadbeef-0000abcd',...over});
const placed=(key:number,file:number):HdEntry=>({...whole(key,file),placements:[{dst:[0,0,1,1],src:[0,0,2,2]}],placementKind:'crop'});
const fileBytes=(entries:readonly HdEntry[],skip:ReadonlySet<string>=new Set())=>
 [...new Map(entries.filter(e=>!skip.has(e.file)).map(e=>[e.file,e.bytes])).values()].reduce((n,b)=>n+b,0);
const base=(entries:HdEntry[]):HdManifest=>({format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD test',
 method:'pcsx2 replacements',entries,totalBytes:fileBytes(entries)});
const withXbox=(entries:HdEntry[],xbox:HdEntry[]):HdManifest=>({...base(entries),layouts:{xbox},layoutBytes:fileBytes(xbox,new Set(entries.map(e=>e.file)))});
const json=(m:unknown)=>JSON.parse(JSON.stringify(m)) as Record<string,unknown>;

describe('WM-32: the manifest\'s layout overlay',()=>{
 const entries=[whole(1,0),whole(2,1),placed(3,2),whole(3,3)];
 const xbox=[whole(1,4,2004),whole(2,5,2005,{outWidth:8,outHeight:8,bytes:256})];
 it('accepts an Xbox overlay of base whole keys, keeping it; totalBytes is the base files\' alone, layoutBytes the overlay\'s',()=>{
  const m=withXbox(entries,xbox),v=validateHdManifest(json(m));
  expect(v).toEqual(m);
  expect(v.totalBytes).toBe(64*4);
  expect(v.layoutBytes).toBe(64+256);
  expect(()=>validateHdManifest({...json(m),totalBytes:64*4+64+256})).toThrow(/totalBytes is not the sum over its files/);
 });
 it('a v0.4.24 reader (it keeps only the fields it knows) validates and loads the PlayStation pack: the pack with layouts stripped',()=>{
  const m=json(withXbox(entries,xbox));delete m.layouts;delete m.layoutBytes;
  const v=validateHdManifest(m);
  expect(v).toEqual(base(entries));expect('layouts' in v).toBe(false);expect('layoutBytes' in v).toBe(false);
 });
 it('runs every base per-entry check on a layout entry, in the same words',()=>{
  expect(()=>validateHdManifest(withXbox(entries,[{...xbox[0]!,key:'ABC'}]))).toThrow('layouts.xbox entry 1: key is not a sha256');
  expect(()=>validateHdManifest(withXbox(entries,[{...xbox[0]!,file:'../x.png'}]))).toThrow(/layouts\.xbox entry 1: file is not/);
  expect(()=>validateHdManifest(withXbox(entries,[{...xbox[0]!,tier:'Z' as HdEntry['tier']}]))).toThrow(/layouts\.xbox entry 1: tier is not/);
  expect(()=>validateHdManifest(withXbox(entries,[{...xbox[0]!,bytes:65}]))).toThrow('layouts.xbox entry 1: bytes is not its output size');
  expect(()=>validateHdManifest(withXbox(entries,[{...xbox[0]!,width:4,height:4}]))).toThrow('layouts.xbox entry 1: its key is declared at another source size');
 });
 it('refuses a layout entry with placements, one whose key is not a base whole entry\'s, and a key twice in a layout',()=>{
  expect(()=>validateHdManifest(withXbox(entries,[{...placed(1,4)}]))).toThrow('layouts.xbox entry 1: a layout entry is whole only (no placements)');
  expect(()=>validateHdManifest(withXbox(entries,[whole(9,4)]))).toThrow('layouts.xbox entry 1: its key is not a base whole entry\'s');
  expect(()=>validateHdManifest(withXbox([whole(1,0),placed(3,2)],[whole(3,4)]))).toThrow('layouts.xbox entry 1: its key is not a base whole entry\'s');
  expect(()=>validateHdManifest(withXbox(entries,[whole(1,4),whole(1,5)]))).toThrow('layouts.xbox entry 2: duplicate key');
 });
 it('bounds a layout at HD_LIMITS.layoutEntries (64) entries',()=>{
  expect(HD_LIMITS.layoutEntries).toBe(64);
  const many=Array.from({length:65},(_,i)=>whole(100+i,i));
  const over=many.map((e,i)=>whole(100+i,100+i,5000+i));
  expect(()=>validateHdManifest(withXbox(many,over))).toThrow('layouts.xbox is not at most 64 entries');
  expect(validateHdManifest(withXbox(many,over.slice(0,64))).layouts?.xbox?.length).toBe(64);
 });
 it('a layout file may be a base file only when declared alike; such a file is not the overlay\'s own bytes',()=>{
  expect(()=>validateHdManifest(withXbox(entries,[whole(1,1,2001)]))).toThrow('layouts.xbox entry 1: file 1.png declared differently by another entry');
  const alike=validateHdManifest(withXbox(entries,[whole(1,1)]));
  expect(alike.layoutBytes).toBe(0);expect(alike.totalBytes).toBe(64*4);
  const shared=validateHdManifest(withXbox(entries,[whole(1,4,2004),whole(2,4,2004)]));expect(shared.layoutBytes).toBe(64);
 });
 it('refuses an unknown layout, a layouts that is not an object, and a missing or wrong layoutBytes',()=>{
  const m=json(withXbox(entries,xbox));
  expect(()=>validateHdManifest({...m,layouts:{xbox,switch:[]}})).toThrow('layouts: unknown layout switch');
  expect(()=>validateHdManifest({...m,layouts:[]})).toThrow('layouts is not an object');
  expect(()=>validateHdManifest({...m,layouts:{xbox:'x'}})).toThrow('layouts.xbox is not at most 64 entries');
  const missing={...m};delete missing.layoutBytes;
  expect(()=>validateHdManifest(missing)).toThrow('layoutBytes is not the sum over its layouts\' own files');
  expect(()=>validateHdManifest({...m,layoutBytes:1})).toThrow('layoutBytes is not the sum over its layouts\' own files');
  expect(()=>validateHdManifest({...json(base(entries)),layoutBytes:5})).toThrow('layoutBytes is not the sum over its layouts\' own files');
 });
});

describe('WM-32: hdEntriesFor and hdPackFiles',()=>{
 const entries=[whole(1,0),placed(1,1),whole(2,2)];
 const m=validateHdManifest(withXbox(entries,[whole(1,3,2003),whole(2,4,2004)]));
 it('the Xbox layout gives the base entries with each overlaid key\'s whole entry replaced; PlayStation gives the base',()=>{
  const x=hdEntriesFor(m,'xbox');
  expect(x.map(e=>e.file)).toEqual(['3.png','1.png','4.png']);
  expect(x[1]).toEqual(placed(1,1));
  expect(hdEntriesFor(m,'playstation')).toBe(m.entries);
  const plain=validateHdManifest(base(entries));expect(hdEntriesFor(plain,'xbox')).toBe(plain.entries);
 });
 it('every file stored or zipped, once each: the base\'s and every layout\'s',()=>{
  expect(hdPackFiles(m).map(e=>e.file)).toEqual(['0.png','1.png','2.png','3.png','4.png']);
  const shared=validateHdManifest(withXbox(entries,[whole(1,2,1002),whole(2,3,2003)]));
  expect(hdPackFiles(shared).map(e=>e.file)).toEqual(['0.png','1.png','2.png','3.png']);
 });
});

describe('WM-32: currentHdLayout (the controller labels preference)',()=>{
 const pad=(id:string,connected=true)=>({id,connected});
 const XBOX='Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',DS='DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
 it('an Xbox label gives xbox; PlayStation, Steam and Steam Deck give playstation',()=>{
  vi.stubGlobal('navigator',{getGamepads:()=>[pad(XBOX)]});
  labels.value='xbox';expect(currentHdLayout()).toBe('xbox');
  for(const l of ['playstation','steam','steam-deck']){labels.value=l;expect(currentHdLayout(),l).toBe('playstation');}
 });
 it('automatic asks the first connected pad\'s family',()=>{
  labels.value='auto';
  vi.stubGlobal('navigator',{getGamepads:()=>[null,pad(DS,false),pad(XBOX),pad(DS)]});expect(currentHdLayout()).toBe('xbox');
  vi.stubGlobal('navigator',{getGamepads:()=>[pad(DS),pad(XBOX)]});expect(currentHdLayout()).toBe('playstation');
  vi.stubGlobal('navigator',{getGamepads:()=>[]});expect(currentHdLayout()).toBe('playstation');
  vi.stubGlobal('navigator',{});expect(currentHdLayout()).toBe('playstation');
  vi.stubGlobal('navigator',{getGamepads:()=>{throw new Error('refused');}});expect(currentHdLayout()).toBe('playstation');
  vi.stubGlobal('navigator',undefined);expect(currentHdLayout()).toBe('playstation');
 });
});

describe('WM-32: the runtime applies the layout\'s entries',()=>{
 const image=(w:number,hgt:number,px:number[])=>({width:w,height:hgt,data:new Uint8ClampedArray(Array.from({length:w*hgt},()=>px).flat())});
 const keyOf=(r:{data:Uint8ClampedArray})=>sha256(new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength));
 const entry=async(src:ReturnType<typeof image>,out:ReturnType<typeof image>,file:string):Promise<HdEntry>=>({key:await keyOf(src),width:src.width,
  height:src.height,file,format:'png',outWidth:out.width,outHeight:out.height,bytes:out.data.length,sha256:await keyOf(out),tier:'A',source:'deadbeef-0000abcd'});
 const glyph=image(2,2,[10,20,30,128]),other=image(2,2,[40,50,60,128]);
 const ps=image(4,4,[200,0,0,128]),xb=image(4,4,[0,200,0,128]),otherHd=image(4,4,[0,0,200,128]);
 const payloads=new Map([['0.png',ps],['1.png',otherHd],['2.png',xb]]);
 const pack=async()=>validateHdManifest(withXbox([await entry(glyph,ps,'0.png'),await entry(other,otherHd,'1.png')],[await entry(glyph,xb,'2.png')]));
 const run=async(layout?:'xbox'|'playstation')=>{
  const registry=new HdTextureRegistry();
  const runtime=new HdPackRuntime(registry,async e=>{const p=payloads.get(e.file);if(!p)throw new Error('missing');return p;},undefined,layout?{layout:()=>layout}:{});
  const a=new DataTexture(glyph.data.slice(),2,2),b=new DataTexture(other.data.slice(),2,2);registry.register(a,glyph);registry.register(b,other);
  const r=await runtime.setPack(await pack());
  return {r,a,b,runtime};
 };
 it('a texture whose key has an overlay gets the Xbox payload under the Xbox layout and the PlayStation one otherwise',async()=>{
  const x=await run('xbox');expect(x.r).toEqual({applied:2,skipped:[]});expect([...x.a.image.data!.slice(0,3)]).toEqual([0,200,0]);expect(x.b.image.data?.[2]).toBe(200);
  const p=await run('playstation');expect(p.r).toEqual({applied:2,skipped:[]});expect([...p.a.image.data!.slice(0,3)]).toEqual([200,0,0]);expect(p.b.image.data?.[2]).toBe(200);
 });
 it('without a layout option it asks currentHdLayout; the menus\' replacement() reads the same entries',async()=>{
  labels.value='xbox';
  const x=await run();expect([...x.a.image.data!.slice(0,3)]).toEqual([0,200,0]);
  expect([...(await x.runtime.replacement(glyph))!.data.slice(0,3)]).toEqual([0,200,0]);
  labels.value='playstation';
  const p=await run();expect([...p.a.image.data!.slice(0,3)]).toEqual([200,0,0]);
  expect([...(await p.runtime.replacement(glyph))!.data.slice(0,3)]).toEqual([200,0,0]);
 });
});
