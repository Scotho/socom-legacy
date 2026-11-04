import {describe,expect,it} from 'vitest';
import type {Rgba} from '@s2u/gs';
import {HdTextureRegistry,type HdManifest,type HdEntry} from '../src/hdTexturePack';
import {HdServedPack,HD_ROOT} from '../src/hdTexturePackServed';
import {HdMenuTextures,HdMenus,hdMenuScale,parseHdMenuScale,menuStatusKey} from '../src/hdMenuTextures';
import {flipRows} from '../src/hudAssets';
import {sha256} from '../src/texturePack';

// HD-3 (OT.R92, HD.R8): the menus' bitmaps take the pack's replacement -- a browser adaptation under HD (GoE Soul).
// The pack is keyed by the decode as stored (HD.R3); the menus hold their bitmaps top row first (`flipRows`).

const pattern=(w:number,h:number,seed:number,alpha=128):Rgba=>{
  const data=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++)data.set([(i*37+seed)&255,(i*91+seed*3)&255,(i*13+seed*7)&255,alpha],i*4);
  return {width:w,height:h,data};
};
const hashOf=(d:Uint8ClampedArray)=>sha256(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));
function dds(img:Rgba):Uint8Array{
  const b=new Uint8Array(128+img.data.length),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
  v.setUint32(4,124,true);v.setUint32(12,img.height,true);v.setUint32(16,img.width,true);v.setUint32(76,32,true);v.setUint32(80,0x41,true);v.setUint32(88,32,true);
  v.setUint32(92,0xff,true);v.setUint32(96,0xff00,true);v.setUint32(100,0xff0000,true);v.setUint32(104,0xff000000,true);b.set(img.data,128);return b;
}
/** A served pack replacing `decode` (as stored, bottom row first) with `hd` (the same rows' order). */
async function served(decode:Rgba,hd:Rgba){
  const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD test',method:'test',totalBytes:hd.data.length,
    entries:[{key:await hashOf(decode.data),width:decode.width,height:decode.height,file:'0.dds',format:'dds',outWidth:hd.width,outHeight:hd.height,bytes:hd.data.length,sha256:await hashOf(hd.data),tier:'A',source:'x-y-00001113.dds'}]};
  const mbytes=new TextEncoder().encode(JSON.stringify(manifest)),id=await sha256(mbytes),requests:string[]=[];
  const files=new Map<string,Uint8Array>([[HD_ROOT+'current.json',new TextEncoder().encode(JSON.stringify({version:1,packId:id}))],[`${HD_ROOT}${id}/manifest.json`,mbytes],[`${HD_ROOT}${id}/0.dds`,dds(hd)]]);
  const fetcher=async(url:string)=>{requests.push(url);const f=files.get(url);return f?new Response(f.slice().buffer as ArrayBuffer):new Response('',{status:404});};
  return {fetcher,requests};
}
const entry=(w:number,h:number,ow:number,oh:number):HdEntry=>({key:'0'.repeat(64),width:w,height:h,file:'0.png',format:'png',outWidth:ow,outHeight:oh,bytes:ow*oh*4,sha256:'0'.repeat(64),tier:'A',source:'s'});

describe('HD-3: the menus\' scale from the pack',()=>{
  it('is the commonest whole ratio of a replacement to its source, capped at 4 (a 2560-wide frame)',()=>{
    expect(hdMenuScale({entries:[entry(64,64,256,256),entry(32,32,128,128),entry(8,8,128,128)]})).toBe(4);
    expect(hdMenuScale({entries:[entry(64,64,128,128),entry(32,32,64,64),entry(8,8,32,32)]})).toBe(2);
    expect(hdMenuScale({entries:[entry(8,8,128,128),entry(8,8,128,128)]})).toBe(4);   // 16x, capped
    expect(hdMenuScale({entries:[entry(10,10,15,15),entry(8,8,8,16)]})).toBe(1);      // no whole, square ratio
  });
});

describe('HD-3: a menu bitmap\'s replacement',()=>{
  it('is found by its rows turned back (the decode), handed back top row first with its alpha rescaled; none until loaded',async()=>{
    const decode=pattern(4,4,3),hd=pattern(16,16,9,120),bitmap=flipRows(decode);
    const {fetcher}=await served(decode,hd);
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false));await pack.setEnabled(true);
    const menus=new HdMenuTextures(pack.runtime);
    expect(menus.lookup(bitmap)).toBeNull();                               // asked: loading
    await menus.settled();
    const got=menus.lookup(bitmap)!;
    expect([got.width,got.height]).toEqual([16,16]);
    const want=flipRows(hd);
    expect([...got.data.subarray(0,3)]).toEqual([...want.data.subarray(0,3)]);
    expect(got.data[3]).toBe(239);                                          // the PS2's 120 rescaled (fullAlpha)
    expect(menus.lookup(bitmap)).toBe(got);                                 // kept
  });
  it('a bitmap the pack does not name stays null, asked once',async()=>{
    const decode=pattern(4,4,3),{fetcher,requests}=await served(decode,pattern(16,16,9));
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false));await pack.setEnabled(true);
    const menus=new HdMenuTextures(pack.runtime),other=flipRows(pattern(4,4,50));
    expect(menus.lookup(other)).toBeNull();await menus.settled();
    expect(menus.lookup(other)).toBeNull();
    expect(requests.filter(u=>u.endsWith('.dds'))).toEqual([]);
  });
});

describe('HD-3: keyed by the bytes, not the object',()=>{
  it('a copy of a bitmap (a worker\'s, say) is replaced alike; the decode itself, unturned, is not the key',async()=>{
    const decode=pattern(4,4,3),hd=pattern(16,16,9),{fetcher}=await served(decode,hd);
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false));await pack.setEnabled(true);
    const menus=new HdMenuTextures(pack.runtime);
    const copy={width:4,height:4,data:new Uint8ClampedArray(flipRows(decode).data)};
    menus.lookup(copy);menus.lookup(decode);await menus.settled();
    expect(menus.lookup(copy)?.width).toBe(16);
    expect(menus.lookup(decode)).toBeNull();                                 // its rows turned back are another image
  });
});

describe('HD-3: the front end\'s switch',()=>{
  it('off: scale 1 and no lookup, nothing fetched; on: the pack\'s scale and its lookup; off again: back to 1',async()=>{
    const decode=pattern(4,4,3),{fetcher,requests}=await served(decode,pattern(16,16,9));
    const hd=new HdMenus(()=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false)));
    expect(hd.options()).toEqual({scale:1});
    await hd.set(false);expect(requests).toEqual([]);
    await hd.set(true);
    const on=hd.options();expect(on.scale).toBe(4);expect(typeof on.hd).toBe('function');
    await hd.set(false);expect(hd.options()).toEqual({scale:1});
  });
  it('?hdMenuScale= caps the scale lower (1..4), never above the pack\'s',async()=>{
    expect([parseHdMenuScale('?hdMenuScale=2'),parseHdMenuScale(''),parseHdMenuScale('?hdMenuScale=9'),parseHdMenuScale('?hdMenuScale=1.5')]).toEqual([2,4,4,4]);
    const {fetcher}=await served(pattern(4,4,3),pattern(16,16,9));
    const hd=new HdMenus(()=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false)),2);
    await hd.set(true);expect(hd.options().scale).toBe(2);expect(hd.options().quadCache).toBeDefined();
  });
});

describe('HD-3 review F2: the menus\' budget counts each pack entry once',()=>{
  it('a bank read again (new objects, the same bytes) reuses the kept image: not counted twice, not fetched again',async()=>{
    const decode=pattern(4,4,3),hd=pattern(16,16,9),{fetcher,requests}=await served(decode,hd);
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false));await pack.setEnabled(true);
    const menus=new HdMenuTextures(pack.runtime,hd.data.length);              // room for exactly one image
    const first=flipRows(decode);menus.lookup(first);await menus.settled();
    const again=flipRows(decode);menus.lookup(again);await menus.settled();   // the bank decoded anew
    expect(menus.lookup(first)?.width).toBe(16);
    expect(menus.lookup(again)?.width).toBe(16);
    expect(menus.lookup(again)).toBe(menus.lookup(first));
    expect(requests.filter(u=>u.endsWith('.dds'))).toHaveLength(1);
    expect(menus.replaced).toBe(1);
  });
});

describe('HD-3 review F3: ?hdMenuScale=1 is the original menus',()=>{
  it('scale 1 makes no lookup and fetches nothing',async()=>{
    const {fetcher,requests}=await served(pattern(4,4,3),pattern(16,16,9));
    const hd=new HdMenus(()=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false)),1);
    await hd.set(true);
    expect(hd.options()).toEqual({scale:1});
    expect(requests).toEqual([]);
  });
});

describe('HD-3 review F4 (the owner, 2026-11-01): the status line counts the menus too',()=>{
  it('"N textures replaced in this scene, M in the menus."',async()=>{
    const decode=pattern(4,4,3),{fetcher}=await served(decode,pattern(16,16,9)),lines:string[]=[];
    const hd=new HdMenus(()=>new HdServedPack(fetcher,(t)=>lines.push(t),new HdTextureRegistry(false)));
    await hd.set(true);
    hd.options().hd!(flipRows(decode));await hd.settled();
    expect(lines.at(-1)).toBe('HD test: 0 textures replaced in this scene, 1 in the menus.');
    await hd.set(false);expect(lines.at(-1)).toBe('HD pack off.');
  });
  it('a pack without menus says what it said before',async()=>{
    const pack=new HdServedPack(async()=>new Response('',{status:404}),()=>undefined,new HdTextureRegistry(false));
    expect(pack.statusText()).toBe('HD pack off.');
  });
});

describe('HD-3 re-review: the menus\' status logs each change of the menus\' count', ()=>{
  it('keys a line by its state and the menus\' count, not the scene\'s', ()=>{
    const a='SOCOM II HD Textures: 0 textures replaced in this scene, 0 in the menus.';
    expect(menuStatusKey(a)).not.toBe(menuStatusKey(a.replace('0 in the menus','3 in the menus')));
    expect(menuStatusKey(a)).toBe(menuStatusKey(a.replace('0 textures','5 textures')));
    expect(menuStatusKey(a.replace('0 in the menus','12 in the menus'))).not.toBe(menuStatusKey(a.replace('0 in the menus','22 in the menus')));
    expect(menuStatusKey('HD pack: loading its manifest...')).toBe('HD pack: loading its manifest...');
  });
});

// HD-4 review F1: the overlay redraws its 4x frame only on a change; a replacement landing is one, said by `version`.
describe('HD-4: the lookup\'s version',()=>{
  it('moves when a bitmap\'s answer changes (its replacement landed, a copy took the kept image), not on a miss or a repeat',async()=>{
    const decode=pattern(4,4,3),hd=pattern(16,16,9),{fetcher}=await served(decode,hd);
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false));await pack.setEnabled(true);
    const menus=new HdMenuTextures(pack.runtime),bitmap=flipRows(decode),other=flipRows(pattern(4,4,50));
    expect(menus.version).toBe(0);
    menus.lookup(bitmap);menus.lookup(other);expect(menus.version).toBe(0);  // asked: null for now
    await menus.settled();expect(menus.version).toBe(1);                     // the one replacement landed; the miss moved nothing
    menus.lookup(bitmap);expect(menus.version).toBe(1);
    menus.lookup({width:4,height:4,data:new Uint8ClampedArray(bitmap.data)});await menus.settled();
    expect(menus.version).toBe(2);                                           // a copy's answer changed too
  });
  it('the front end\'s options carry it while on',async()=>{
    const decode=pattern(4,4,3),{fetcher}=await served(decode,pattern(16,16,9));
    const hd=new HdMenus(()=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false)));
    await hd.set(true);
    expect(hd.options().version).toBe(0);
    hd.options().hd!(flipRows(decode));await hd.settled();
    expect(hd.options().version).toBe(1);
    await hd.set(false);expect(hd.options()).toEqual({scale:1});
  });
});
