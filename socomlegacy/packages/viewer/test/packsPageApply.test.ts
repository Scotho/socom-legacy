import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DataTexture} from 'three';
import {FORGE_MATCH_TEXTURE_SCOPE,HdPackRuntime,HdTextureRegistry,type HdEntry,type HdManifest} from '../src/hdTexturePack';
import {HdServedPack} from '../src/hdTexturePackServed';
import {memoryHdStore} from '../src/hdTexturePackStore';
import {sha256} from '../src/texturePack';
import {PACKS_ENABLED_KEY,type ChannelFactory,type ModsChannel,type PackFlags} from '../src/packs/modsState';
import {PackApplier,collectOnHint,parseTextureChoice,registerDecodes,textureChoiceKeeper,type GxSwitch,type HdSwitch,type TextureChoiceKeeper} from '../src/packs/pagePacks';
import {frontGpuMayDraw,menusHdOn} from '../src/frontEnd';
import {UI_GPU_SURFACES_ADAPTATION,UiGpuSwitch} from '../src/uiGpuSwitch';

/**
 * B206 ML-3 (ML.R5, R8, R9, R11, R13; product track, ML.R2): packs applied on every page from the MODS state -- the
 * page's choice keeper (the hint, the record, the notice), the applier that turns the HD runtime and the GX runtime on and
 * off from it (never from the picture), the late registration from a live map's decodes, and the online opacity guard.
 * Synthetic images and made-up keys only, no game data.
 */
const H='a'.repeat(64),G='b'.repeat(64);
const flagsOf=(on:boolean):PackFlags=>{const m=new Map<string,string>();if(on)m.set(PACKS_ENABLED_KEY,'1');return {get:k=>m.get(k)??null,set:(k,v)=>{m.set(k,v);},remove:k=>{m.delete(k);}};};
function busOf():{factory:ChannelFactory;post:()=>void}{
  const open=new Set<ModsChannel>();
  const factory:ChannelFactory=()=>{const ch:ModsChannel={onmessage:null,close:()=>{open.delete(ch);},postMessage:()=>undefined};open.add(ch);return ch;};
  return {factory,post:()=>{for(const ch of open)ch.onmessage?.({data:{type:'packs-changed'}});}};
}
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setTimeout(r,0));};
const fixedKeeper=(id:string|null):TextureChoiceKeeper&{set(v:string|null):void}=>{
  let v=id;const heard=new Set<(x:string|null)=>void>();
  return {get:()=>v,ready:Promise.resolve(),observe:f=>{heard.add(f);return()=>{heard.delete(f);};},refresh:async()=>undefined,dispose:()=>undefined,
    set(x){v=x;for(const f of [...heard])f(x);}};
};
const hdFake=()=>{const calls:boolean[]=[];const s:HdSwitch={setEnabled:async(on)=>{calls.push(on);}};return {s,calls};};
const gxFake=()=>{const calls:string[]=[];const s:GxSwitch<{map:string;textures:ReadonlyMap<string,unknown>}>={
  setTarget:(t)=>{calls.push(`target:${t?.map??'none'}`);},choose:(id)=>{calls.push(`choose:${id}`);},setEnabled:(on)=>{calls.push(`enabled:${on}`);}};return {s,calls};};

describe('ML-3: the texture choice (ML.R8)',()=>{
  it('reads an HD pack id or a GX per-map pack id, anything else Original',()=>{
    expect(parseTextureChoice(`hd:${H}`)).toEqual({kind:'hd',id:H});
    expect(parseTextureChoice(`texture:MP51:${G}`)).toEqual({kind:'texture',map:'MP51',id:G});
    expect(parseTextureChoice(null)).toBeNull();
    expect(parseTextureChoice('texture:MP51:xyz')).toBeNull();
  });
});

describe('ML-3: the page\'s choice keeper (ML.R7, R9)',()=>{
  it('with no hint it reads nothing and answers Original',async()=>{
    const read=vi.fn(async()=>`hd:${H}`);
    const k=textureChoiceKeeper({flags:flagsOf(false),read,channel:busOf().factory});
    await k.ready;
    expect(k.get()).toBeNull();expect(read).not.toHaveBeenCalled();
    k.dispose();
  });
  it('with the hint it reads the state at once, and again on the notice, telling its observers',async()=>{
    let stored:string|null=`hd:${H}`;const bus=busOf();
    const k=textureChoiceKeeper({flags:flagsOf(true),read:async()=>stored,channel:bus.factory});
    await k.ready;expect(k.get()).toBe(`hd:${H}`);
    const heard:(string|null)[]=[];k.observe(v=>heard.push(v));
    stored=`texture:MP51:${G}`;bus.post();await flush();
    expect(k.get()).toBe(`texture:MP51:${G}`);expect(heard).toEqual([`texture:MP51:${G}`]);
    k.dispose();
  });
});

describe('ML-3: the applier, the same on every page (ML.R5, R8, R9)',()=>{
  const world=(map:string)=>({texturePack:{map,textures:new Map<string,unknown>()}});
  it('the HD pack chosen turns the HD runtime on, the GX runtime off; Original turns it off again',async()=>{
    const keeper=fixedKeeper(`hd:${H}`),hd=hdFake(),gx=gxFake(),registry=new HdTextureRegistry(false);
    const a=new PackApplier({choice:keeper,registry,hd:()=>hd.s,gx:()=>gx.s});
    await a.ready;
    expect(hd.calls).toEqual([true]);expect(gx.calls.filter(c=>c.startsWith('enabled:true'))).toEqual([]);
    expect(registry.isCollecting).toBe(true);
    keeper.set(null);await flush();
    expect(hd.calls).toEqual([true,false]);
    a.dispose();
  });
  it('a GX pack applies on its own map only: chosen and on with MP51 loaded, off with MP2',async()=>{
    const keeper=fixedKeeper(`texture:MP51:${G}`),hd=hdFake(),gx=gxFake();
    const a=new PackApplier({choice:keeper,registry:new HdTextureRegistry(true),hd:()=>hd.s,gx:()=>gx.s});
    await a.ready;
    a.setWorld(world('MP51'),null);await flush();
    expect(gx.calls).toEqual(['target:MP51',`choose:${G}`,'enabled:true']);
    a.setWorld(world('MP2'),null);await flush();
    expect(gx.calls.slice(3)).toEqual(['target:MP2','enabled:false']);
    expect(hd.calls).toEqual([]);
    a.dispose();
  });
  it('a pack first chosen on a page that did not collect registers the live map from its decodes, once',async()=>{
    const keeper=fixedKeeper(null),hd=hdFake(),registry=new HdTextureRegistry(false);
    const decode={width:2,height:2,data:new Uint8ClampedArray(16).fill(9)};
    const t=new DataTexture(decode.data,2,2);
    const a=new PackApplier({choice:keeper,registry,hd:()=>hd.s});
    a.setWorld({texturePack:{map:'MP51',textures:new Map([['wall',t]])}},{wall:decode});
    await a.ready;expect(registry.size).toBe(0);
    keeper.set(`hd:${H}`);await flush();
    expect(registry.isCollecting).toBe(true);expect(registry.source(t)).toBe(decode);
    keeper.set(null);keeper.set(`hd:${H}`);await flush();
    expect(registry.size).toBe(1);
    a.dispose();
  });
  it('the page boot collects only on the hint',()=>{
    const off=new HdTextureRegistry(false),on=new HdTextureRegistry(false);
    collectOnHint(flagsOf(false),off);collectOnHint(flagsOf(true),on);
    expect(off.isCollecting).toBe(false);expect(on.isCollecting).toBe(true);
  });
  it('the menus\' HD follows the HD pack chosen, under MODERN as under PS2 (ML.R11), while the GPU draws the front end',()=>{
    expect(menusHdOn({uiPerfHd:false,choice:`hd:${H}`,gpu:true})).toBe(true);
    expect(menusHdOn({uiPerfHd:false,choice:`texture:MP51:${G}`,gpu:true})).toBe(false);
    expect(menusHdOn({uiPerfHd:false,choice:null,gpu:true})).toBe(false);
    expect(menusHdOn({uiPerfHd:true,choice:null,gpu:false})).toBe(true);
  });
  it('GM-HDCAP: the HD pack chosen but the front end\'s GPU drawer off -- the menus stay at scale 1 (the software path at 4x froze them)',()=>{
    expect(menusHdOn({uiPerfHd:false,choice:`hd:${H}`,gpu:false})).toBe(false);
  });
  it('GM-HDCAP: the front end\'s drawer read from the switch -- since the flip (GM.R18) every built page\'s cell on, so the HD pack draws HD menus on the GPU',()=>{
    const sw=(search:string,table?:typeof UI_GPU_SURFACES_ADAPTATION)=>new UiGpuSwitch({search,storage:()=>null,devTools:false,table});
    const OFF={...UI_GPU_SURFACES_ADAPTATION,front:{hd:'off',sd:'off'}} as const;   // the flip: a cell off is a table the test builds
    expect(frontGpuMayDraw(sw(''),false)).toBe(true);                               // the flip (GM.R18; was false)
    expect(frontGpuMayDraw(sw('',OFF),false)).toBe(false);
    expect(frontGpuMayDraw(sw('?uiGpu=off'),false)).toBe(false);                    // the rollback
    expect(frontGpuMayDraw(sw('?uiGpu=on'),false)).toBe(true);
    expect(frontGpuMayDraw(sw('?uiGpu=on&uiGpuSurface=armory',OFF),false)).toBe(false);
    expect(frontGpuMayDraw(sw('',{...UI_GPU_SURFACES_ADAPTATION,front:{hd:'on',sd:'off'}}),false)).toBe(true);
    // GM-28: `shadow` keeps the menus' HD on the dev server only (its guard compares HD frames); a built page never.
    expect(frontGpuMayDraw(sw('',{...UI_GPU_SURFACES_ADAPTATION,front:{hd:'shadow',sd:'off'}}),false)).toBe(false);
    expect(frontGpuMayDraw(sw('',{...UI_GPU_SURFACES_ADAPTATION,front:{hd:'shadow',sd:'off'}}),true)).toBe(true);
    const killed=sw('?uiGpu=on');killed.kill('loss-limit','front');
    expect(frontGpuMayDraw(killed,false)).toBe(false);
  });
});

const image=(w:number,h:number,px:number[])=>({width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h},()=>px).flat())});
const keyOf=(r:{data:Uint8ClampedArray})=>sha256(new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength));
async function entry(src:ReturnType<typeof image>,out:ReturnType<typeof image>,file='0.png'):Promise<HdEntry>{
  return {key:await keyOf(src),width:src.width,height:src.height,file,format:'png',outWidth:out.width,outHeight:out.height,bytes:out.data.length,sha256:await keyOf(out),tier:'A',source:'x'};
}
const manifest=(entries:HdEntry[]):HdManifest=>({format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'HD test',method:'test',entries,
  totalBytes:[...new Map(entries.map(e=>[e.file,e.bytes])).values()].reduce((n,b)=>n+b,0)});

describe('ML-3: a texture made before the pack (ML.R9)',()=>{
  it('is registered from the map\'s decodes and then applied',async()=>{
    const registry=new HdTextureRegistry(false),wall=image(2,2,[10,20,30,255]),hd=image(4,4,[11,21,31,128]);
    const t=new DataTexture(wall.data,2,2);registry.register(t,wall);   // inert: nothing kept
    expect(registry.size).toBe(0);
    registry.collect();registerDecodes(registry,new Map([['wall',t]]),{wall});
    const runtime=new HdPackRuntime(registry,async()=>hd);
    expect(await runtime.setPack(manifest([await entry(wall,hd)]))).toEqual({applied:1,skipped:[]});
    expect(t.image.width).toBe(4);
  });
});

describe('ML-3: the online fairness guard (ML.R13)',()=>{
  // The pack's alpha 64 of 0x80 is drawn at 128 (`fullAlpha`); an opaque original's replacement is drawn at 255 online.
  const run=async(online:boolean,orig:number[])=>{
    const registry=new HdTextureRegistry(),src=image(2,2,orig),hd=image(4,4,[50,60,70,64]);
    const t=new DataTexture(src.data,2,2);registry.register(t,src);
    const runtime=new HdPackRuntime(registry,async()=>hd,()=>undefined,{opaqueGuard:()=>online});
    await runtime.setPack(manifest([await entry(src,hd)]));
    return {alpha:(t.image.data as Uint8Array)[3],guarded:runtime.guarded};
  };
  it('online, an opaque original\'s see-through replacement is drawn opaque, and counted',async()=>{
    expect(await run(true,[10,20,30,255])).toEqual({alpha:255,guarded:1});
  });
  it('offline it is drawn as made',async()=>{
    expect(await run(false,[10,20,30,255])).toEqual({alpha:128,guarded:0});
  });
  it('online, an original that is itself see-through keeps the replacement\'s alpha',async()=>{
    expect(await run(true,[10,20,30,200])).toEqual({alpha:128,guarded:0});
  });
});

describe('ML-3: the HD switch reads the MODS store only (ML.R4, R16)',()=>{
  it('with no pack in the store it is refused and fetches nothing',async()=>{
    const fetcher=vi.fn(async()=>new Response('{}'));
    const lines:string[]=[];
    const pack=new HdServedPack(fetcher,s=>lines.push(s),new HdTextureRegistry(),memoryHdStore(),undefined,{storeOnly:true});
    await pack.setEnabled(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(lines.at(-1)).toMatch(/refused -- the HD pack is not installed/);
  });
});

describe('ML-3: the Forge and the test room read the same state (source pins)',()=>{
  const src=(path:string)=>readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../src',path),'utf8');
  it("each mounts one applier over the page's choice keeper and hands it every new world with its decodes",()=>{
    const forge=src('forge/page.ts'),room=src('main.ts'),match=src('matchMount.ts');
    for(const [name,text] of [['forge',forge],['test room',room],['match',match]] as const)expect(text,name).toMatch(/pageTextureChoice\(\)/);
    expect(forge).toMatch(/forgePacks\.setWorld\(world, opened\.textures\)/);
    expect(room).toMatch(/testRoomPacks\.setWorld\(built, map\.textures\)/);
    expect(match).toMatch(/packs\.setWorld\(built, m\.textures\)/);
  });
});

describe('PR #729 Codex P1: the Forge\'s HD runtime keeps off its match\'s textures',()=>{
  // The Forge's editor runtime and its Play's (or lobby match's) guarded runtime share the page's registry. A texture the
  // match registers is the match's: the editor's runtime never claims it, so the guard's opaque replacement is the one
  // drawn; once the match is over the editor's runtime takes its own world's new textures again.
  it('a match texture registered while the Forge runtime is live: the match runtime claims it, guarded; the Forge resumes after',async()=>{
    const registry=new HdTextureRegistry(true);
    const wall=image(2,2,[10,20,30,255]),hd=image(4,4,[50,60,70,64]),m=manifest([await entry(wall,hd)]);
    const editor=new DataTexture(wall.data.slice(),2,2);registry.register(editor,{...wall,data:wall.data.slice()});
    const forge=new HdPackRuntime(registry,async()=>hd,()=>undefined,{owner:'hd:forge',scope:null});
    expect((await forge.setPack(m)).applied).toBe(1);
    expect((editor.image.data as Uint8Array)[3]).toBe(128);                // offline: drawn as made
    const leave=registry.enterScope(FORGE_MATCH_TEXTURE_SCOPE);
    const match=new HdPackRuntime(registry,async()=>hd,()=>undefined,{opaqueGuard:()=>true});   // matchMount's, unscoped
    await match.setPack(m);
    const wallOfMatch=new DataTexture(wall.data.slice(),2,2);registry.register(wallOfMatch,{...wall,data:wall.data.slice()});
    await Promise.all([forge.settled(),match.settled()]);
    expect(forge.applied).toBe(1);                                         // the editor's own only
    expect(match.applied).toBe(1);expect(match.guarded).toBe(1);
    expect((wallOfMatch.image.data as Uint8Array)[3]).toBe(255);           // the guard's opaque replacement, not the editor's
    expect(registry.scopeOf(wallOfMatch)).toBe(FORGE_MATCH_TEXTURE_SCOPE);
    expect(match.skipped().map(x=>x.reason)).toEqual([expect.stringMatching(/held by another drawer/)]);   // the editor's, the Forge's
    leave();await match.setPack(null);wallOfMatch.dispose();                // the match closed
    const editorLater=new DataTexture(wall.data.slice(),2,2);registry.register(editorLater,{...wall,data:wall.data.slice()});
    await forge.settled();
    expect(forge.applied).toBe(2);expect(registry.scopeOf(editorLater)).toBeNull();
    expect((editorLater.image.data as Uint8Array)[3]).toBe(128);
  });
  it('the Forge passes its runtime the editor\'s scope and opens the match\'s scope around both match starts (source pins)',()=>{
    const forge=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../src/forge/page.ts'),'utf8');
    expect(forge).toMatch(/runtime: \{ frames: packFrames, owner: 'hd:forge', scope: null \}/);
    expect(forge.match(/enterMatchScope\(\);\s*\n\s*(const started = await startForgeMatch|match = startForgeLobbyMatch)\(/g)?.length).toBe(2);
    expect(forge).toMatch(/const endMatch = \(\): void => \{\n\s*leaveMatchScope\(\);/);
  });
});

describe('PR #729 Codex P1 (re-read): the guard follows the room going online and offline (ML.R13)',()=>{
  // The test room applies a pack offline (no guard), then its Online setting turns on: the replacements already swapped in
  // were built without the guard, so an opaque wall's see-through replacement would stay in the online match. `reguard`
  // (called as the page's room changes) draws them opaque at once; back offline, they are applied again as made.
  it('a pack applied offline: online makes the opaque original\'s replacement opaque, offline gives it back as made',async()=>{
    const registry=new HdTextureRegistry(),wall=image(2,2,[10,20,30,255]),glass=image(2,2,[10,20,30,200]),hd=image(4,4,[50,60,70,64]);
    const hdGlass=image(4,4,[90,60,70,64]);
    const t=new DataTexture(wall.data.slice(),2,2);registry.register(t,wall);
    const g=new DataTexture(glass.data.slice(),2,2);registry.register(g,glass);
    let online=false;
    const runtime=new HdPackRuntime(registry,async e=>e.file==='0.png'?hd:hdGlass,()=>undefined,{opaqueGuard:()=>online});
    await runtime.setPack(manifest([await entry(wall,hd,'0.png'),await entry(glass,hdGlass,'1.png')]));
    expect([(t.image.data as Uint8Array)[3],(g.image.data as Uint8Array)[3],runtime.guarded]).toEqual([128,128,0]);
    online=true;runtime.reguard();                                       // synchronous: before the room's first frame
    expect([(t.image.data as Uint8Array)[3],(g.image.data as Uint8Array)[3],runtime.guarded]).toEqual([255,128,1]);
    expect(t.needsUpdate||t.version>0).toBe(true);
    online=false;runtime.reguard();await runtime.settled();
    expect([(t.image.data as Uint8Array)[3],(g.image.data as Uint8Array)[3],runtime.guarded,runtime.applied]).toEqual([128,128,0,2]);
  });
  // PR #729's Codex P1 (hdTexturePack.ts:692): an offline apply waiting on its frame-budgeted upload when Online turns
  // on -- `reguard` sees only what is swapped in, so the queued swap asks the guard itself, at the swap.
  it('online turned on while an offline apply\'s upload is queued: the queued swap draws it opaque, and back again',async()=>{
    const queued:(()=>void)[]=[];
    const frames={turn:async()=>undefined,slice:async()=>undefined,upload:(_bytes:number,swap:()=>DataTexture|null)=>new Promise<void>(r=>queued.push(()=>{swap();r();}))};
    const registry=new HdTextureRegistry(),wall=image(2,2,[10,20,30,255]),hd=image(4,4,[50,60,70,64]);
    const t=new DataTexture(wall.data.slice(),2,2);registry.register(t,wall);
    let online=false;
    const runtime=new HdPackRuntime(registry,async()=>hd,()=>undefined,{opaqueGuard:()=>online,frames:frames as never});
    const done=runtime.setPack(manifest([await entry(wall,hd)]));
    for(let i=0;i<50&&!queued.length;i++)await new Promise(r=>setTimeout(r,0));
    expect(queued.length).toBe(1);expect(runtime.applied).toBe(0);         // built offline, its upload waiting its frame
    online=true;runtime.reguard();
    queued.shift()!();await done;
    expect([(t.image.data as Uint8Array)[3],runtime.guarded,runtime.applied]).toEqual([255,1,1]);
    online=false;runtime.reguard();
    for(let i=0;i<50&&!queued.length;i++)await new Promise(r=>setTimeout(r,0));
    queued.shift()!();await runtime.settled();
    expect([(t.image.data as Uint8Array)[3],runtime.guarded,runtime.applied]).toEqual([128,0,1]);
  });
  it('the test room reguards its HD pack whenever its room is made or left (source pin)',()=>{
    const room=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../src/main.ts'),'utf8');
    expect(room).toMatch(/reguardPacks = \(\) => \{ hdPack\?\.runtime\.reguard\(\); \};/);
    expect(room).toMatch(/acts\.follow\(net\.client\);[^\n]*\n\s*reguardPacks\(\);/);
    expect(room).toMatch(/net = null;\n\s*reguardPacks\(\);/);
  });
});
