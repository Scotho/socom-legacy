import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {Rgba} from '@s2u/gs';
import {HdTextureRegistry,HD_UI_SAMPLING,fullAlpha,upscaleRgba,type HdManifest,type HdEntry} from '../src/hdTexturePack';
import {decodeDds} from '../src/dds';
import {HdServedPack,HD_ROOT} from '../src/hdTexturePackServed';
import {HdMenuDecoder,HdMenuTextures,HdMenus,hdMenuScale,pageHdMenus,parseHdMenuScale,menuStatusKey} from '../src/hdMenuTextures';
import {UiGpuLoadBudget} from '../src/uiGpuLoadBudget';
import {encodePng} from '../../../tools/png';
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

describe('HD.R9: placements in the menus',()=>{
  it('a placement entry counts at its placement\'s scale, not its image\'s ratio to the target',()=>{
    const placed=(w:number,ow:number,k:number):HdEntry=>({...entry(w,w,ow,ow),placementKind:'crop',placements:[{dst:[0,0,1,1],src:[0,0,k,k]}]});
    expect(hdMenuScale({entries:[entry(64,64,128,128),placed(8,32,2),placed(8,32,2),placed(16,64,2)]})).toBe(2);   // 4 by size, 2 by placement
  });
  it('a bitmap with a placement takes the composite: the pack\'s art on its part, the bitmap\'s own texels elsewhere, top row first',async()=>{
    const decode=pattern(4,4,3,128),hd=pattern(8,8,9,128),bitmap=flipRows(decode);
    const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD test',method:'test',totalBytes:hd.data.length,
      entries:[{key:await hashOf(decode.data),width:4,height:4,file:'0.dds',format:'dds',outWidth:8,outHeight:8,bytes:hd.data.length,sha256:await hashOf(hd.data),
        tier:'A',source:'x-y-00001113.dds',placementKind:'crop',placements:[{dst:[2,0,2,2],src:[0,0,8,8]}]}]};
    const mbytes=new TextEncoder().encode(JSON.stringify(manifest)),id=await sha256(mbytes);
    const files=new Map<string,Uint8Array>([[HD_ROOT+'current.json',new TextEncoder().encode(JSON.stringify({version:1,packId:id}))],[`${HD_ROOT}${id}/manifest.json`,mbytes],[`${HD_ROOT}${id}/0.dds`,dds(hd)]]);
    const fetcher=async(url:string)=>{const f=files.get(url);return f?new Response(f.slice().buffer as ArrayBuffer):new Response('',{status:404});};
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false));await pack.setEnabled(true);
    const menus=new HdMenuTextures(pack.runtime);menus.lookup(bitmap);await menus.settled();
    const got=menus.lookup(bitmap)!;
    expect([got.width,got.height]).toEqual([16,16]);
    const at=(img:Rgba,x:number,y:number)=>[...img.data.subarray((y*img.width+x)*4,(y*img.width+x)*4+4)];
    // the decode's rows 0-1, columns 2-3 (the composite's 8..15 x 0..7, turned: rows 8..15) are the pack's art
    expect(at(got,8,15)).toEqual([...at(hd,0,0).slice(0,3),255]);expect(at(got,15,8)).toEqual([...at(hd,7,7).slice(0,3),255]);
    // elsewhere the bitmap as the compositor samples it (bilinear, repeating), turned alike
    const own=flipRows({width:16,height:16,data:upscaleRgba(decode,16,16,HD_UI_SAMPLING)});
    for(const [x,y] of [[0,0],[7,7],[3,12],[12,3]] as const)expect(at(got,x,y),`${x},${y}`).toEqual(at(own,x,y));
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

describe('GM-14a (GM-13 review F3): the menus\' HD keys for the GPU surface',()=>{
  it('keys(): null while off, the lookup itself while on (its pack, version and gpuKeyOf), null again when off',async()=>{
    const {fetcher}=await served(pattern(4,4,3),pattern(16,16,9));
    const hd=new HdMenus(()=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false)));
    expect(hd.keys()).toBeNull();
    await hd.set(true);
    const k=hd.keys();
    expect(k).toBeInstanceOf(HdMenuTextures);
    expect(typeof k!.pack).toBe('number');expect(k!.version).toBe(0);expect(k!.gpuKeyOf(pattern(1,1,1))).toBeNull();
    expect(hd.options().hd).toBe(k!.lookup);
    await hd.set(true);
    expect(hd.keys()).not.toBe(k);expect(hd.keys()!.pack).not.toBe(k!.pack);   // a new lookup, a new pack number
    await hd.set(false);
    expect(hd.keys()).toBeNull();
  });
});

describe('GM-13 review F2: a lookup replaced is closed (its queued loads dropped)',()=>{
  it('HD off, and HD on again, close the lookup they replace',async()=>{
    const {fetcher}=await served(pattern(4,4,3),pattern(16,16,9));
    const hd=new HdMenus(()=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false)));
    const current=()=>(hd as unknown as {textures:HdMenuTextures|null}).textures;
    await hd.set(true);const first=current()!;expect(first.closed).toBe(false);
    await hd.set(true);const second=current()!;expect(first.closed).toBe(true);expect(second.closed).toBe(false);
    await hd.set(false);expect(second.closed).toBe(true);
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

// GM-13b (plan 2026-11-01-gpu-menus, row GM-13b): the menus' decode off the main thread. The lookup's turn of a
// replacement (`reverseRows`) goes through the menus' decoder (`HdMenuDecoder`: the worker, else the main thread spread),
// inside the load's budget slot (`hdLoadBytes` counts the turned copy), and the menus' pack decodes its PNG payloads
// through the same decoder. PRODUCT TRACK, a browser adaptation: the bytes kept are today's. Unit tests only.
describe('GM-13b: the menus\' HD decode through their decoder',()=>{
  /** A served pack whose one entry is a PNG payload (`encodePng`, the rows as stored). */
  async function servedPng(decode:Rgba,hd:Rgba){
    const png=encodePng(hd.width,hd.height,hd.data);
    const manifest:HdManifest={format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD test',method:'test',totalBytes:hd.data.length,
      entries:[{key:await hashOf(decode.data),width:decode.width,height:decode.height,file:'0.png',format:'png',outWidth:hd.width,outHeight:hd.height,bytes:hd.data.length,sha256:await hashOf(hd.data),tier:'A',source:'x-y-00001113.png'}]};
    const mbytes=new TextEncoder().encode(JSON.stringify(manifest)),id=await sha256(mbytes);
    const files=new Map<string,Uint8Array>([[HD_ROOT+'current.json',new TextEncoder().encode(JSON.stringify({version:1,packId:id}))],[`${HD_ROOT}${id}/manifest.json`,mbytes],[`${HD_ROOT}${id}/0.png`,png]]);
    return async(url:string)=>{const f=files.get(url);return f?new Response(f.slice().buffer as ArrayBuffer):new Response('',{status:404});};
  }
  /** A decoder whose requests are recorded and whose turn can be held (`gate`) or refused (`refuse`). */
  function recordingDecoder(opts:{gate?:Promise<void>;refuse?:boolean;during?:()=>void}={}){
    const calls:string[]=[];
    const d=new HdMenuDecoder(()=>null,async()=>undefined);
    const png=d.png,turn=d.turn.bind(d),dds=d.dds,alpha=d.alpha;
    Object.assign(d,{
      png:(b:Uint8Array,e:number)=>{calls.push('png');return png(b,e);},
      dds:(b:Uint8Array,s:{width:number;height:number})=>{calls.push('dds');return dds(b,s);},
      alpha:(r:Rgba)=>{calls.push('alpha');return alpha(r);},
      turn:async(r:Rgba)=>{calls.push('turn');opts.during?.();if(opts.gate)await opts.gate;if(opts.refuse)throw new Error('the worker died');return turn(r);},
    });
    return {d,calls};
  }
  const imageOf=(img:Rgba)=>[img.width,img.height,Buffer.from(img.data.buffer,img.data.byteOffset,img.data.byteLength).toString('hex')];

  it('the kept image is today\'s bytes: the replacement turned top row first, through the decoder',async()=>{
    const decode=pattern(4,4,3),hd=pattern(16,16,9,120),{fetcher}=await served(decode,hd);
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false));await pack.setEnabled(true);
    const today=new HdMenuTextures(pack.runtime),{d,calls}=recordingDecoder();
    const viaDecoder=new HdMenuTextures(pack.runtime,undefined,undefined,null,d);
    const bitmap=flipRows(decode);
    today.lookup(bitmap);viaDecoder.lookup(bitmap);await today.settled();await viaDecoder.settled();
    expect(calls).toEqual(['turn']);
    const got=viaDecoder.lookup(bitmap)!;
    expect(imageOf(got)).toEqual(imageOf(today.lookup(bitmap)!));
    expect(viaDecoder.version).toBe(1);expect(viaDecoder.replaced).toBe(1);
    expect(viaDecoder.gpuKeyOf(got)).toMatch(/^hd\|\d+\|[0-9a-f]{64}$/);
  });
  it('the turn runs inside the load\'s budget slot (its bytes still in flight while it turns)',async()=>{
    const decode=pattern(4,4,3),hd=pattern(16,16,9),{fetcher}=await served(decode,hd);
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false));await pack.setEnabled(true);
    const budget=new UiGpuLoadBudget(1000);let inFlight=-1;
    const {d}=recordingDecoder({during:()=>{inFlight=budget.bytesInFlight;}});
    const menus=new HdMenuTextures(pack.runtime,undefined,undefined,{budget,cost:()=>777},d);
    menus.lookup(flipRows(decode));await menus.settled();
    expect(inFlight).toBe(777);
    expect(budget.bytesInFlight).toBe(0);
    expect(menus.replaced).toBe(1);
  });
  it('a refused turn keeps nothing and gives its bytes back: the next key fits the budget it left',async()=>{
    const a=pattern(4,4,3),b=pattern(4,4,50),hd=pattern(16,16,9);
    const replacer={calls:0,async replacement(){this.calls++;return {width:16,height:16,data:new Uint8ClampedArray(hd.data)};}};
    let refuse=true;
    const d=new HdMenuDecoder(()=>null,async()=>undefined),turn=d.turn.bind(d);
    Object.assign(d,{turn:async(r:Rgba)=>{if(refuse){refuse=false;throw new Error('the worker died');}return turn(r);}});
    const menus=new HdMenuTextures(replacer,hd.data.length,undefined,null,d);           // room for exactly one image
    const first=flipRows(a);menus.lookup(first);await menus.settled();
    expect(menus.lookup(first)).toBeNull();expect(menus.replaced).toBe(0);expect(menus.version).toBe(0);
    // The same object asked again: a new object's first ask answers null while its key hashes (box run, 7fdcb143d).
    const second=flipRows(b);menus.lookup(second);await menus.settled();
    expect(menus.lookup(second)?.width).toBe(16);expect(menus.replaced).toBe(1);
  });
  it('closed while the turn runs: nothing kept, nothing counted',async()=>{
    const decode=pattern(4,4,3),{fetcher}=await served(decode,pattern(16,16,9));
    const pack=new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false));await pack.setEnabled(true);
    let open!:()=>void;const gate=new Promise<void>(r=>{open=r;});
    const {d,calls}=recordingDecoder({gate});
    const menus=new HdMenuTextures(pack.runtime,undefined,undefined,null,d);
    menus.lookup(flipRows(decode));
    await expect.poll(()=>calls.length).toBe(1);
    menus.close();open();await menus.settled();
    expect(menus.replaced).toBe(0);expect(menus.version).toBe(0);expect(menus.lookup(flipRows(decode))).toBeNull();
  });
  it('the menus\' pack decodes a PNG payload through the decoder; the image is today\'s; off closes the decoder',async()=>{
    const decode=pattern(4,4,3),hd=pattern(16,16,9,100),fetcher=await servedPng(decode,hd);
    const today=new HdMenus(()=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false)));
    const {d,calls}=recordingDecoder();let closed=0;const close=d.close.bind(d);d.close=()=>{closed++;close();};
    const made:unknown[]=[];
    const via=new HdMenus((dec)=>{made.push(dec);return new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false),null,dec?.png);},4,d);
    await today.set(true);await via.set(true);
    expect(made).toEqual([d]);
    const bitmap=flipRows(decode);
    today.options().hd!(bitmap);via.options().hd!(bitmap);await today.settled();await via.settled();
    expect(calls).toEqual(['png','turn']);
    expect(imageOf(via.options().hd!(bitmap)!)).toEqual(imageOf(today.options().hd!(bitmap)!));
    await via.set(false);expect(closed).toBe(1);
  });
  // GM-13d (plan 2026-11-01-gpu-menus, row GM-13d): the DDS decode and the whole's alpha rescale through the same decoder.
  it('GM-13d: the menus\' pack decodes a DDS payload and rescales its alpha through the decoder; the image is today\'s',async()=>{
    const decode=pattern(4,4,3),hd=pattern(16,16,9,100),{fetcher}=await served(decode,hd);
    const today=new HdMenus(()=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false)));
    const {d,calls}=recordingDecoder();
    const via=new HdMenus((dec)=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false),null,dec??undefined),4,d);
    await today.set(true);await via.set(true);
    const bitmap=flipRows(decode);
    today.options().hd!(bitmap);via.options().hd!(bitmap);await today.settled();await via.settled();
    expect(calls).toEqual(['dds','alpha','turn']);
    expect(imageOf(via.options().hd!(bitmap)!)).toEqual(imageOf(today.options().hd!(bitmap)!));
    await via.set(false);
  });
  it('GM-13d: no worker -- the decoder\'s dds and alpha run on the main thread, the same bytes as decodeDds and fullAlpha',async()=>{
    const hd=pattern(16,16,9,100),file=dds(hd);
    const d=new HdMenuDecoder(()=>null,async()=>undefined);
    const got=await d.dds(file,{width:16,height:16});
    expect(d.mode).toBe('main');
    expect(imageOf(got)).toEqual(imageOf(decodeDds(file,{width:16,height:16})));
    const a=await d.alpha({width:16,height:16,data:new Uint8ClampedArray(hd.data)});
    expect(imageOf(a)).toEqual(imageOf({width:16,height:16,data:fullAlpha(hd.data as Uint8ClampedArray)}));
  });
  it('GM-13d: the page\'s menus hand their pack the decoder (its dds, and its alpha to the runtime); the match\'s pack none',()=>{
    const d=new HdMenuDecoder(()=>null,async()=>undefined);
    const hd=pageHdMenus(4,d),pack=(hd as unknown as {make:(dec:HdMenuDecoder|null)=>HdServedPack}).make(d);
    expect((pack as unknown as {decodeDds:unknown}).decodeDds).toBe(d.dds);
    expect((pack as unknown as {decodePng:unknown}).decodePng).toBe(d.png);
    expect((pack.runtime as unknown as {alpha:unknown}).alpha).toBe(d.alpha);
    const plain=new HdServedPack();
    expect((plain as unknown as {decodeDds:unknown}).decodeDds).toBe(decodeDds);
    expect((plain.runtime as unknown as {alpha:unknown}).alpha).not.toBe(d.alpha);
  });
});

// GM-13b review F2: where the menus' decode ran is said -- once on the page's `[hd] menus:` line when it falls to the main
// thread, and on the perf hook (`__uiGpuPerf.hd().decoder`), so a perf run records whether the worker ran.
describe('GM-13b review F2: the decoder\'s mode surfaced',()=>{
  it('HdMenus.decoderMode(): null without a decoder; the decoder\'s mode and failure with one',async()=>{
    const {fetcher}=await served(pattern(4,4,3),pattern(16,16,9));
    expect(new HdMenus(()=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false))).decoderMode()).toBeNull();
    const d=new HdMenuDecoder(()=>null,async()=>undefined);
    const hd=new HdMenus((dec)=>new HdServedPack(fetcher,()=>undefined,new HdTextureRegistry(false),null,dec?.png),4,d);
    expect(hd.decoderMode()).toEqual({mode:'idle',failure:null});
    await d.png(encodePng(2,2,pattern(2,2,1).data),8192);
    expect(hd.decoderMode()).toEqual({mode:'main',failure:d.failure});
  });
  it('the page\'s menus say the fall to the main thread once on their [hd] menus: line',async()=>{
    const info=vi.spyOn(console,'info').mockImplementation(()=>undefined);
    try{
      const hd=pageHdMenus(4),d=(hd as unknown as {decoder:HdMenuDecoder}).decoder;
      await d.png(encodePng(2,2,pattern(2,2,1).data),8192);await d.png(encodePng(2,2,pattern(2,2,2).data),8192);
      const lines=info.mock.calls.map(c=>String(c[0])).filter(l=>l.startsWith('[hd] menus:'));
      expect(lines).toHaveLength(1);expect(lines[0]).toMatch(/main thread/);expect(lines[0]).toContain(d.failure!);
    }finally{info.mockRestore();}
  });
  it('the perf hook\'s hd() carries it (frontEnd.ts)',()=>{
    const src=readFileSync(new URL('../src/frontEnd.ts',import.meta.url),'utf8');
    expect(src).toMatch(/forced: uiPerf\.hd, decoder: hdMenus\?\.decoderMode\(\) \?\? null/);
  });
});
