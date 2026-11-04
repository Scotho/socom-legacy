import {LinearFilter,LinearMipmapLinearFilter,LinearMipmapNearestFilter,NearestMipmapLinearFilter,NearestMipmapNearestFilter,type DataTexture} from 'three';
import type {Rgba} from '@s2u/gs';
import {sha256} from './texturePack';

/**
 * OT.R92 (plan 2026-10-31-hd-texture-pack-parity, HD.R1-R5): the HD pack kind -- a pack made for PCSX2, applied in the
 * test room's Experimental view to every texture made from a disc decode, transparency allowed. A browser adaptation
 * inside H135's exception; nothing here runs until a pack is set. Entries are keyed by the sha256 of the RGBA
 * `decodeTexture` returns (HD.R3), so one entry serves every site that draws that image and no name can bind another.
 * Budgets are experiment limits, not console values.
 */
export const HD_LIMITS = {entries:8192,sourceEdge:1024,outputEdge:8192,manifestBytes:8*1024*1024,entryBytes:256*1024*1024,
  totalBytes:8*1024*1024*1024,appliedBytes:1536*1024*1024,nameLength:64,methodLength:512} as const;
/** HD.R2's evidence tiers: A..C exact hashes, D..F image matches accepted at their margins. */
export const HD_TIERS = ['A','A2','B','C','D','E','F'] as const;
export type HdTier = typeof HD_TIERS[number];
export const HD_FORMATS = ['png','dds'] as const;
export type HdFormat = typeof HD_FORMATS[number];
/** `width`/`height`: the decoded source; `outWidth`/`outHeight`/`bytes`/`sha256`: the decoded replacement's RGBA. */
export interface HdEntry {key:string;width:number;height:number;file:string;format:HdFormat;outWidth:number;outHeight:number;
  bytes:number;sha256:string;tier:HdTier;source:string}
export interface HdManifest {format:'s2u-hd-texture-pack';version:1;localOnly:true;game:string;name:string;method:string;
  entries:HdEntry[];totalBytes:number}
export class HdRefusal extends Error {constructor(readonly reason:string){super(reason);this.name='HdRefusal';}}
function need(ok:unknown,reason:string):asserts ok {if(!ok)throw new HdRefusal(reason);}
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const int=(v:unknown,min:number,max:number):v is number=>Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max;
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&/^[\x20-\x7e]+$/.test(v);

/** Every field checked; only the known fields kept. A file name is a fixed safe form, never a path. */
export function validateHdManifest(raw:unknown):HdManifest {
  const m=raw as Record<string,unknown>|null;
  need(m&&typeof m==='object'&&!Array.isArray(m),'not an object');
  need(m.format==='s2u-hd-texture-pack'&&m.version===1&&m.localOnly===true,'format is not s2u-hd-texture-pack version 1');
  need(typeof m.game==='string'&&/^[A-Z]{4}-\d{5}$/.test(m.game),'game is not a disc serial');
  need(text(m.name,HD_LIMITS.nameLength),'name is not printable');need(text(m.method,HD_LIMITS.methodLength),'method is not printable');
  need(Array.isArray(m.entries)&&m.entries.length>0&&m.entries.length<=HD_LIMITS.entries,`entries is not 1-${HD_LIMITS.entries}`);
  // One file may serve several keys (a pack file bound to more than one decoded image), declared alike each time.
  const keys=new Set<string>(),files=new Map<string,string>(),entries:HdEntry[]=[];let total=0;
  for(const [i,x] of (m.entries as Record<string,unknown>[]).entries()){
    const at=`entry ${i+1}`;need(x&&typeof x==='object',`${at} is not an object`);
    need(hash(x.key),`${at}: key is not a sha256`);need(!keys.has(x.key),`${at}: duplicate key`);keys.add(x.key);
    need(typeof x.file==='string'&&/^(0|[1-9]\d{0,4})\.(png|dds)$/.test(x.file),`${at}: file is not <n>.png or <n>.dds`);
    const decl=JSON.stringify([x.format,x.outWidth,x.outHeight,x.bytes,x.sha256]),prior=files.get(x.file);
    need(prior===undefined||prior===decl,`${at}: file ${x.file} declared differently by another entry`);
    need((HD_FORMATS as readonly unknown[]).includes(x.format)&&x.file.endsWith('.'+x.format),`${at}: format does not match its file`);
    need(int(x.width,1,HD_LIMITS.sourceEdge)&&int(x.height,1,HD_LIMITS.sourceEdge),`${at}: source size out of bounds`);
    need(int(x.outWidth,1,HD_LIMITS.outputEdge)&&int(x.outHeight,1,HD_LIMITS.outputEdge),`${at}: output size out of bounds`);
    need(x.bytes===(x.outWidth as number)*(x.outHeight as number)*4&&int(x.bytes,4,HD_LIMITS.entryBytes),`${at}: bytes is not its output size`);
    need(hash(x.sha256),`${at}: sha256 is not a sha256`);
    need((HD_TIERS as readonly unknown[]).includes(x.tier),`${at}: tier is not one of ${HD_TIERS.join(', ')}`);
    need(text(x.source,128),`${at}: source is not printable`);
    if(prior===undefined){files.set(x.file,decl);total+=x.bytes as number;need(total<=HD_LIMITS.totalBytes,'over the total byte bound');}
    entries.push({key:x.key,width:x.width as number,height:x.height as number,file:x.file,format:x.format as HdFormat,outWidth:x.outWidth as number,
      outHeight:x.outHeight as number,bytes:x.bytes as number,sha256:x.sha256,tier:x.tier as HdTier,source:x.source as string});
  }
  need(m.totalBytes===total,'totalBytes is not the sum over its files');
  return {format:'s2u-hd-texture-pack',version:1,localOnly:true,game:m.game,name:m.name,method:m.method,entries,totalBytes:total};
}

/**
 * Every live texture made from a disc decode, with the decoded image it was made from. Only a registry that collects
 * does anything: the page's (`hdTextures`) collects once the test room turns it on (`collect()`, main.ts), so every
 * other page registers nothing, keeps nothing and pays one boolean test a texture. No hash is taken until a pack is set.
 * A disposed texture is forgotten, except while a pack disposes it to reallocate (`reallocate`); one dropped without
 * disposal is held weakly, so never kept alive.
 */
export class HdTextureRegistry {
  private all=new Set<WeakRef<DataTexture>>();
  private refs=new WeakMap<DataTexture,WeakRef<DataTexture>>();
  private images=new WeakMap<DataTexture,Rgba>();
  /** A decode's derived image (the characters' addressable padding) keys by the decode it came from (HD.R3). */
  private derived=new WeakMap<object,Rgba>();
  /** Textures whose image is its decode turned top row first (`hudAssets.ts` `flipRows`): the replacement is turned too. */
  private flipped=new WeakSet<DataTexture>();
  private owners=new WeakMap<DataTexture,string>();
  private listeners=new Set<(t:DataTexture)=>void>();
  private forgotten=new Set<(t:DataTexture)=>void>();
  private swapping=new Set<DataTexture>();
  constructor(private collecting=true){ }
  get isCollecting():boolean{return this.collecting;}
  /** The test room's call: from now on, textures made from a decode are registered. */
  collect():void{this.collecting=true;}
  private forget=(e:{target:unknown})=>{
    const t=e.target as DataTexture;if(this.swapping.has(t))return;
    const r=this.refs.get(t);if(r)this.all.delete(r);this.refs.delete(t);
    this.images.delete(t);this.owners.delete(t);this.flipped.delete(t);t.removeEventListener('dispose',this.forget);
    for(const l of this.forgotten)l(t);
  };
  markDerived(out:Rgba,from:Rgba):Rgba{if(this.collecting&&out!==from)this.derived.set(out,this.derived.get(from)??from);return out;}
  isFlipped(texture:DataTexture):boolean{return this.flipped.has(texture);}
  /**
   * One owner a texture at a time for an experiment that swaps its image (the HD pack, the HUD sampling experiment), so
   * neither saves the other's image as the original. False when another owner holds it.
   */
  claim(texture:DataTexture,who:string):boolean{const o=this.owners.get(texture);if(o!==undefined&&o!==who)return false;this.owners.set(texture,who);return true;}
  release(texture:DataTexture,who:string):void{if(this.owners.get(texture)===who)this.owners.delete(texture);}
  /** `l` hears each texture disposed by its owner (a world torn down), so a runtime can let it go. */
  onForget(l:(t:DataTexture)=>void):()=>void{this.forgotten.add(l);return ()=>this.forgotten.delete(l);}
  get size():number{return this.textures().length;}
  /**
   * `rowsReversed`: `image` is a decode turned top row first (the HUD's and the ARMORY's bitmaps, `flipRows`, turned in the
   * map worker, so no object identity survives to here): it keys by the bytes turned back, the disc's decode the pack names.
   */
  register(texture:DataTexture,image:Rgba,rowsReversed=false):DataTexture{
    if(!this.collecting)return texture;
    if(!this.images.has(texture)){const r=new WeakRef(texture);texture.addEventListener('dispose',this.forget);this.all.add(r);this.refs.set(texture,r);}
    this.images.set(texture,rowsReversed?reverseRows(image):this.derived.get(image)??image);
    if(rowsReversed)this.flipped.add(texture);else this.flipped.delete(texture);for(const l of this.listeners)l(texture);return texture;
  }
  source(texture:DataTexture):Rgba|undefined{return this.images.get(texture);}
  textures():DataTexture[]{
    const out:DataTexture[]=[];
    for(const r of this.all){const t=r.deref();if(t&&this.images.has(t))out.push(t);else this.all.delete(r);}
    return out;
  }
  onRegister(l:(t:DataTexture)=>void):()=>void{this.listeners.add(l);return ()=>this.listeners.delete(l);}
  /** Dispose `texture` to drop its GPU allocation without forgetting it. */
  reallocate(texture:DataTexture):void{this.swapping.add(texture);try{texture.dispose();}finally{this.swapping.delete(texture);}}
}
/** The page's one registry: `world.ts`' `makeTexture` and the other creation sites register here (HD-2, HD-3). Inert until `collect()`. */
export const hdTextures=new HdTextureRegistry(false);
/** The characters' padding marks its source on the page's registry (inert until the test room collects). */
export const markDerived=(out:Rgba,from:Rgba):Rgba=>hdTextures.markDerived(out,from);
/** A bitmap with its rows reversed (a decode turned top row first, or back); HD-3's menus reuse it. */
export function reverseRows(r:Rgba):Rgba{
  const row=r.width*4,out=new Uint8ClampedArray(r.data.length);
  for(let y=0;y<r.height;y++)out.set(r.data.subarray(y*row,(y+1)*row),(r.height-1-y)*row);
  return {width:r.width,height:r.height,data:out};
}
/**
 * A pack's alpha is the PS2's, 0x80 opaque (a PCSX2 dump keeps the GS's own 0..0x80, values over it the console's
 * over-bright): measured on 300 exact pairs, the pack's alpha is 0.502 of the decode's at every percentile. The runtime
 * draws 255 as opaque, so a payload is rescaled as `@s2u/gs` rescales a decode (`decode.ts` direct32, `palette.ts`:
 * `min(255, round(a x 255 / 128))`) -- after its hash check (the entry's sha256 is the payload as the pack holds it).
 */
export function fullAlpha(data:Uint8ClampedArray):Uint8ClampedArray{
  const out=new Uint8ClampedArray(data);
  for(let i=3;i<out.length;i+=4)out[i]=Math.min(255,Math.round((data[i]!*255)/128));
  return out;
}

/** How many payloads load and decode at once: a scene matches hundreds, each up to 64 MiB decoded. */
export const HD_CONCURRENT_LOADS=4;

const MIP_FILTERS=new Set<number>([LinearMipmapLinearFilter,LinearMipmapNearestFilter,NearestMipmapLinearFilter,NearestMipmapNearestFilter]);
const KEYS=new WeakMap<Rgba,Promise<string>>();
const keyOf=(r:Rgba):Promise<string>=>{
  let k=KEYS.get(r);if(!k){k=sha256(new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength));KEYS.set(r,k);}return k;
};
/** HD.R3's key of an image (the sha256 of its RGBA), kept per object; HD-3's menus key their kept images by it. */
export const hdKeyOf=keyOf;
export interface HdSkip {key:string;source:string;reason:string}
export interface HdReport {applied:number;skipped:HdSkip[]}
interface Original {image:DataTexture['image'];mipmaps:DataTexture['mipmaps'];generate:boolean;min:DataTexture['minFilter'];bytes:number}
/** Decodes an entry's payload to RGBA (a fetch and `png.ts` / `dds.ts`; a test passes its own). */
export type HdLoad=(entry:HdEntry)=>Promise<Rgba>;

/**
 * Applies one HD pack to the registry: each registered texture whose decoded image an entry names gets the entry's
 * replacement, checked against its declared size and sha256; a texture registered later is applied as it arrives.
 * A refused entry keeps its original and says why. `setPack(null)` restores every original at once.
 */
export class HdPackRuntime {
  private byKey=new Map<string,HdEntry>();
  private originals=new Map<DataTexture,Original>();
  private skips:HdSkip[]=[];
  private generation=0;
  private pending=new Set<Promise<void>>();
  private payloads=new Map<string,Promise<Rgba>>();
  private off:(()=>void)|null=null;
  /** `changed` hears each texture applied, refused or let go (the status line). */
  constructor(private registry:HdTextureRegistry=hdTextures,private load:HdLoad,private changed:()=>void=()=>undefined){ }
  get applied():number{return this.originals.size;}
  get appliedBytes():number{let n=0;for(const o of this.originals.values())n+=o.bytes;return n;}
  skipped():HdSkip[]{return this.skips.slice();}
  /** Every apply started so far has finished. */
  async settled():Promise<void>{while(this.pending.size)await Promise.all([...this.pending]);}
  setPack(manifest:HdManifest|null):Promise<HdReport>{
    this.generation++;this.restore();this.off?.();this.off=null;this.byKey.clear();this.payloads.clear();this.skips=[];
    if(!manifest)return Promise.resolve({applied:0,skipped:[]});
    for(const e of manifest.entries)this.byKey.set(e.key,e);
    // A texture its world disposed is let go with its saved original; nothing is restored into it.
    const offRegister=this.registry.onRegister(t=>this.track(t)),offForget=this.registry.onForget(t=>{if(this.originals.delete(t))this.changed();});
    this.off=()=>{offRegister();offForget();};
    for(const t of this.registry.textures())this.track(t);
    return this.settled().then(()=>({applied:this.applied,skipped:this.skipped()}));
  }
  /**
   * HD-3: the replacement for one decoded image (the pack's key), for a drawer that has no DataTexture -- the menus' CPU
   * compositor. The same checks as a texture's (its source size, its payload's size and sha256, the alpha rescaled), the
   * same shared loads; null when the pack names it not, refused (a skip, with why) or the pack changed meanwhile. Not
   * counted in the applied cap: its caller keeps its own budget.
   */
  async replacement(src:Rgba):Promise<Rgba|null>{
    const generation=this.generation;
    const key=await keyOf(src);if(generation!==this.generation)return null;
    const e=this.byKey.get(key);if(!e)return null;
    if(e.width!==src.width||e.height!==src.height){this.skip(key,'source size does not match',e.source);return null;}
    let r:Rgba;
    try{r=await this.payload(e);}catch(x){if(generation===this.generation)this.skip(key,`payload unavailable (${x instanceof Error?x.message:x})`,e.source);return null;}
    if(generation!==this.generation)return null;
    if(r.width!==e.outWidth||r.height!==e.outHeight||r.data.length!==e.bytes){this.skip(key,'payload size does not match its entry',e.source);return null;}
    if(await keyOf(r)!==e.sha256){if(generation===this.generation)this.skip(key,'payload hash does not match its entry',e.source);return null;}
    if(generation!==this.generation)return null;
    return {width:r.width,height:r.height,data:fullAlpha(r.data)};
  }
  private track(t:DataTexture):void{
    const p=this.apply(t,this.generation).catch(e=>{this.skip('',String(e instanceof Error?e.message:e));})
      .finally(()=>{this.pending.delete(p);this.changed();});
    this.pending.add(p);
  }
  private skip(key:string,reason:string,source=''):void{this.skips.push({key,source,reason});}
  /** Loads in flight (at most `HD_CONCURRENT_LOADS`) and the decoded bytes they will add, reserved before they start. */
  private active=0;
  private reserved=0;
  private queue:(()=>void)[]=[];
  private async slot():Promise<void>{if(this.active<HD_CONCURRENT_LOADS){this.active++;return;}await new Promise<void>(r=>this.queue.push(r));}
  private free():void{const next=this.queue.shift();if(next)next();else this.active--;}
  /** A file's load is shared by the textures that ask for it while it loads; none is kept after (the pack is GBs decoded). */
  private payload(e:HdEntry):Promise<Rgba>{
    let p=this.payloads.get(e.file);
    if(!p){
      const q=(async()=>{await this.slot();try{return await this.load(e);}finally{this.free();}})();p=q;this.payloads.set(e.file,q);
      void q.finally(()=>{if(this.payloads.get(e.file)===q)this.payloads.delete(e.file);}).catch(()=>undefined);
    }
    return p;
  }
  private async apply(t:DataTexture,generation:number):Promise<void>{
    const src=this.registry.source(t);if(!src||this.originals.has(t))return;
    const key=await keyOf(src);if(generation!==this.generation)return;
    const e=this.byKey.get(key);if(!e)return;
    if(e.width!==src.width||e.height!==src.height){this.skip(key,'source size does not match',e.source);return;}
    // The cap counts what is applied and what is loading, so a payload past it is never fetched or decoded.
    if(this.appliedBytes+this.reserved+e.bytes>HD_LIMITS.appliedBytes){this.skip(key,`over the ${HD_LIMITS.appliedBytes/1024/1024} MiB applied cap`,e.source);return;}
    this.reserved+=e.bytes;
    let r:Rgba;
    try{
      try{r=await this.payload(e);}catch(x){if(generation===this.generation)this.skip(key,`payload unavailable (${x instanceof Error?x.message:x})`,e.source);return;}
      if(generation!==this.generation||this.originals.has(t)||this.registry.source(t)!==src)return;
      if(r.width!==e.outWidth||r.height!==e.outHeight||r.data.length!==e.bytes){this.skip(key,'payload size does not match its entry',e.source);return;}
      if(await keyOf(r)!==e.sha256){if(generation===this.generation)this.skip(key,'payload hash does not match its entry',e.source);return;}
      if(generation!==this.generation||this.originals.has(t))return;
    }finally{this.reserved-=e.bytes;}
    if(!this.registry.claim(t,'hd')){this.skip(key,'held by the HUD sampling experiment',e.source);return;}
    r={width:r.width,height:r.height,data:fullAlpha(r.data)};
    // The pack keys the disc's bottom-row-first decode; a bitmap the 2D drawers turned top row first takes it turned.
    if(this.registry.isFlipped(t))r=reverseRows(r);
    const mipped=t.mipmaps.length>0||(t.generateMipmaps&&MIP_FILTERS.has(t.minFilter));
    // A 2D drawer's bitmap (the HUD's, the ARMORY's: the flipped ones) whose payload is larger than its unmipmapped
    // bilinear original (3-4x, drawn at the original's size) is minified by a single bilinear tap, aliasing its edges (the
    // nav marks' dark fringe, HD.R8 batch 3): it gets a chain and trilinear minification. Not the world's: a generated
    // chain averages alpha, thinning alpha-tested cut-outs (foliage, grates) with distance. A nearest original keeps its filter.
    const minify=!mipped&&this.registry.isFlipped(t)&&t.minFilter===LinearFilter&&(r.width>src.width||r.height>src.height);
    this.originals.set(t,{image:t.image,mipmaps:t.mipmaps,generate:t.generateMipmaps,min:t.minFilter,bytes:e.bytes});
    // A larger DataTexture cannot be uploaded into the existing allocation (as `TexturePackTarget.apply`).
    this.registry.reallocate(t);
    t.image={width:r.width,height:r.height,data:r.data as unknown as Uint8Array};t.mipmaps=[];t.generateMipmaps=mipped||minify;
    if(minify)t.minFilter=LinearMipmapLinearFilter;
    t.needsUpdate=true;
  }
  private restore():void{
    for(const [t,o] of this.originals){this.registry.reallocate(t);t.image=o.image;t.mipmaps=o.mipmaps;t.generateMipmaps=o.generate;t.minFilter=o.min;t.needsUpdate=true;this.registry.release(t,'hd');}
    this.originals.clear();
  }
}
