import {LinearFilter,LinearMipmapLinearFilter,LinearMipmapNearestFilter,NearestFilter,NearestMipmapLinearFilter,NearestMipmapNearestFilter,RepeatWrapping,type DataTexture} from 'three';
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
  totalBytes:8*1024*1024*1024,appliedBytes:1536*1024*1024,nameLength:64,methodLength:512,placements:64} as const;
/** HD.R2's evidence tiers: A..C exact hashes, D..F image matches accepted at their margins. */
export const HD_TIERS = ['A','A2','B','C','D','E','F'] as const;
export type HdTier = typeof HD_TIERS[number];
export const HD_FORMATS = ['png','dds'] as const;
export type HdFormat = typeof HD_FORMATS[number];
/** `[x, y, width, height]`, whole texels (or a pack image's pixels). */
export type HdRect=readonly [x:number,y:number,w:number,h:number];
/**
 * HD.R9: one rectangle of a placement -- `src` of the pack image drawn over `dst` of the target (its texels, the decode's
 * rows as stored), at a whole, square scale (`src` is `dst` times k on both axes).
 */
export interface HdPlacement {dst:HdRect;src:HdRect}
/**
 * How the pack file's PCSX2 name was reproduced from a part of the target (plan HD.R9, matching round 3): a window read at
 * an offset (`crop`), a clamped region (`region`), whole 16x16 blocks placed apart (`blocks`), a window of index 0
 * (`blockwindow`), a direct-colour patch (`ct`), the intact top half of an overlapped read (`vram-top`).
 */
export const HD_PLACEMENT_KINDS=['crop','region','blocks','blockwindow','ct','vram-top'] as const;
export type HdPlacementKind=typeof HD_PLACEMENT_KINDS[number];
/**
 * `width`/`height`: the decoded source; `outWidth`/`outHeight`/`bytes`/`sha256`: the decoded replacement's RGBA. An entry
 * with `placements` (HD.R9) replaces only those parts of its target; a key has at most one entry without (its whole
 * replacement) and any number with.
 */
export interface HdEntry {key:string;width:number;height:number;file:string;format:HdFormat;outWidth:number;outHeight:number;
  bytes:number;sha256:string;tier:HdTier;source:string;placements?:HdPlacement[];placementKind?:HdPlacementKind}
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
  const keys=new Set<string>(),sizes=new Map<string,string>(),files=new Map<string,string>(),entries:HdEntry[]=[];let total=0;
  for(const [i,x] of (m.entries as Record<string,unknown>[]).entries()){
    const at=`entry ${i+1}`;need(x&&typeof x==='object',`${at} is not an object`);
    need(hash(x.key),`${at}: key is not a sha256`);
    const placed=x.placements!==undefined||x.placementKind!==undefined;
    if(!placed){need(!keys.has(x.key),`${at}: duplicate key`);keys.add(x.key);}
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
    const size=`${x.width}x${x.height}`,known=sizes.get(x.key);
    need(known===undefined||known===size,`${at}: its key is declared at another source size`);sizes.set(x.key,size);
    const placements=placed?checkPlacements(x,at):undefined;
    if(prior===undefined){files.set(x.file,decl);total+=x.bytes as number;need(total<=HD_LIMITS.totalBytes,'over the total byte bound');}
    entries.push({key:x.key,width:x.width as number,height:x.height as number,file:x.file,format:x.format as HdFormat,outWidth:x.outWidth as number,
      outHeight:x.outHeight as number,bytes:x.bytes as number,sha256:x.sha256,tier:x.tier as HdTier,source:x.source as string,
      ...(placements?{placements,placementKind:x.placementKind as HdPlacementKind}:{})});
  }
  need(m.totalBytes===total,'totalBytes is not the sum over its files');
  return {format:'s2u-hd-texture-pack',version:1,localOnly:true,game:m.game,name:m.name,method:m.method,entries,totalBytes:total};
}
const rect=(v:unknown):v is HdRect=>Array.isArray(v)&&v.length===4&&v.every((n,i)=>int(n,i<2?0:1,HD_LIMITS.outputEdge));
/** HD.R9: each rectangle inside its target and its image, at a whole square scale whose composite fits the output bound. */
function checkPlacements(x:Record<string,unknown>,at:string):HdPlacement[]{
  need((HD_PLACEMENT_KINDS as readonly unknown[]).includes(x.placementKind),`${at}: placement kind is not one of ${HD_PLACEMENT_KINDS.join(', ')}`);
  const list=x.placements as unknown[];
  need(Array.isArray(list)&&list.length>0&&list.length<=HD_LIMITS.placements,`${at}: placements is not 1-${HD_LIMITS.placements} rectangles`);
  const w=x.width as number,h=x.height as number,ow=x.outWidth as number,oh=x.outHeight as number;
  return list.map((p,j)=>{
    const pa=`${at}: placement ${j+1}`,q=p as Record<string,unknown>|null;
    need(q&&typeof q==='object'&&rect(q.dst)&&rect(q.src),`${pa} is not two [x, y, width, height] rectangles`);
    const [dx,dy,dw,dh]=q.dst as HdRect,[sx,sy,sw,sh]=q.src as HdRect;
    need(dx+dw<=w&&dy+dh<=h,`${pa}: dst is outside its target`);need(sx+sw<=ow&&sy+sh<=oh,`${pa}: src is outside its image`);
    const k=sw/dw;
    need(Number.isInteger(k)&&sh===dh*k,`${pa}: src is not dst at a whole, square scale`);
    need(w*k<=HD_LIMITS.outputEdge&&h*k<=HD_LIMITS.outputEdge,`${pa}: its scale makes the target over the output bound`);
    return {dst:[dx,dy,dw,dh] as HdRect,src:[sx,sy,sw,sh] as HdRect};
  });
}

/**
 * HD.R9: the composite's size -- the whole replacement's when the key has one (placements are drawn into it), else the
 * target at the largest scale among its placements.
 */
export function hdCompositeSize(width:number,height:number,whole:Pick<HdEntry,'outWidth'|'outHeight'>|undefined,placed:readonly Pick<HdEntry,'placements'>[]):{width:number;height:number}{
  if(whole)return {width:whole.outWidth,height:whole.outHeight};
  let k=1;for(const e of placed)for(const p of e.placements??[])k=Math.max(k,p.src[2]/p.dst[2]);
  return {width:width*k,height:height*k};
}
/**
 * GM-13c (plan 2026-11-01-gpu-menus): one key's build at its peak, in decoded bytes -- `composite`, reserved at the
 * larger of the whole's size and the placements' scale (agent/hd-subrect review F2: a whole that fails its check leaves
 * the composite at the placements' scale), and `payload`, the largest single payload (the build decodes them one at a
 * time). A key with no placements: the whole's size (or the target's, if larger) and its payload.
 */
export function hdKeyPeak(width:number,height:number,whole:Pick<HdEntry,'outWidth'|'outHeight'|'bytes'>|undefined,
  placed:readonly Pick<HdEntry,'bytes'|'placements'>[]):{composite:number;payload:number}{
  const area=(s:{width:number;height:number})=>s.width*s.height;
  const composite=Math.max(area(hdCompositeSize(width,height,whole,placed)),area(hdCompositeSize(width,height,undefined,placed)))*4;
  let payload=whole?.bytes??0;for(const e of placed)payload=Math.max(payload,e.bytes);
  return {composite,payload};
}
/** How the target's own texels outside every placement are carried to the composite's size. */
export interface HdSampling {filter:'nearest'|'linear';repeatS:boolean;repeatT:boolean}
const wrapIndex=(i:number,n:number,repeat:boolean)=>repeat?((i%n)+n)%n:i<0?0:i>=n?n-1:i;
/**
 * The original texture at `width` x `height`, sampled as the GPU samples it (texel centres; nearest, or bilinear with its
 * wrap): a composite's texels outside every placement look as the original did, at the composite's resolution.
 */
export function upscaleRgba(src:Rgba,width:number,height:number,s:HdSampling):Uint8ClampedArray{
  const out=new Uint8ClampedArray(width*height*4),sw=src.width,sh=src.height,d=src.data;
  for(let y=0;y<height;y++){
    const v=(y+0.5)*sh/height;
    for(let x=0;x<width;x++){
      const u=(x+0.5)*sw/width,o=(y*width+x)*4;
      if(s.filter==='nearest'){const i=(wrapIndex(Math.floor(v),sh,s.repeatT)*sw+wrapIndex(Math.floor(u),sw,s.repeatS))*4;for(let c=0;c<4;c++)out[o+c]=d[i+c]!;continue;}
      const tu=u-0.5,tv=v-0.5,x0=Math.floor(tu),y0=Math.floor(tv),fx=tu-x0,fy=tv-y0;
      const xa=wrapIndex(x0,sw,s.repeatS),xb=wrapIndex(x0+1,sw,s.repeatS),ya=wrapIndex(y0,sh,s.repeatT),yb=wrapIndex(y0+1,sh,s.repeatT);
      const a=(ya*sw+xa)*4,b=(ya*sw+xb)*4,c0=(yb*sw+xa)*4,c1=(yb*sw+xb)*4;
      for(let c=0;c<4;c++)out[o+c]=(d[a+c]!*(1-fx)+d[b+c]!*fx)*(1-fy)+(d[c0+c]!*(1-fx)+d[c1+c]!*fx)*fy;
    }
  }
  return out;
}
/**
 * HD.R9: draws each placement's `src` (of `image`, its alpha already the runtime's) over its `dst` (target texels) in
 * `out` (the target at `out.width / width`): copied at the composite's scale, averaged over whole cells when the image is
 * finer, bilinear otherwise. A placement replaces what is under it, alpha included; later ones over earlier.
 * `rescaleAlpha` (GM-13c): `image`'s alpha is the pack's, each alpha sample read through `fullAlpha`'s rescale -- the
 * same bytes as drawing `fullAlpha`'s copy, without the copy (a payload drawn as decoded, never held twice).
 */
export function drawPlacements(out:Rgba,width:number,height:number,image:Rgba,placements:readonly HdPlacement[],rescaleAlpha=false):void{
  const sxs=out.width/width,sys=out.height/height,od=out.data,d=image.data,iw=image.width,lut=rescaleAlpha?FULL_ALPHA:SAME_ALPHA;
  // A sample's index is its pixel's times 4 plus its channel, so `i & 3` is the channel: alpha (3) through the table.
  const id=(i:number):number=>(i&3)===3?lut[d[i]!]!:d[i]!;
  for(const {dst:[dx,dy,dw,dh],src:[sx,sy,sw,sh]} of placements){
    const x0=Math.round(dx*sxs),y0=Math.round(dy*sys),x1=Math.round((dx+dw)*sxs),y1=Math.round((dy+dh)*sys),ow=x1-x0,oh=y1-y0;
    if(ow<=0||oh<=0)continue;
    const kx=sw/ow,ky=sh/oh,cells=Number.isInteger(kx)&&Number.isInteger(ky);
    for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
      const o=((y0+y)*out.width+x0+x)*4;
      if(cells){
        const n=kx*ky;
        for(let c=0;c<4;c++){let t=0;for(let j=0;j<ky;j++)for(let i=0;i<kx;i++)t+=id(((sy+y*ky+j)*iw+sx+x*kx+i)*4+c);od[o+c]=t/n;}
        continue;
      }
      const tu=Math.min(Math.max(sx+(x+0.5)*kx-0.5,sx),sx+sw-1),tv=Math.min(Math.max(sy+(y+0.5)*ky-0.5,sy),sy+sh-1);
      const xa=Math.floor(tu),ya=Math.floor(tv),xb=Math.min(xa+1,sx+sw-1),yb=Math.min(ya+1,sy+sh-1),fx=tu-xa,fy=tv-ya;
      for(let c=0;c<4;c++)od[o+c]=(id((ya*iw+xa)*4+c)*(1-fx)+id((ya*iw+xb)*4+c)*fx)*(1-fy)+(id((yb*iw+xa)*4+c)*(1-fx)+id((yb*iw+xb)*4+c)*fx)*fy;
    }
  }
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
/** `fullAlpha`'s rescale of an alpha byte, as a table (GM-13c: `drawPlacements`' `rescaleAlpha`), and no rescale. */
const FULL_ALPHA=Uint8ClampedArray.from({length:256},(_,a)=>Math.min(255,Math.round((a*255)/128)));
const SAME_ALPHA=Uint8ClampedArray.from({length:256},(_,a)=>a);

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

/** HD.R9: a key's entries -- its whole replacement, if any, and its placements in manifest order. */
interface HdGroup {whole?:HdEntry;placed:HdEntry[]}
/**
 * The menus' sampling (`uiCompositorView` UI_TEXTURE_FILTER_READING: bilinear, the texture repeating): a menu bitmap's
 * texels outside every placement are carried to the composite as the compositor samples them.
 */
export const HD_UI_SAMPLING:HdSampling={filter:'linear',repeatS:true,repeatT:true};
/** A texture's sampling as three.js draws it: its magnification filter and wrap. */
const samplingOf=(t:DataTexture):HdSampling=>({filter:t.magFilter===NearestFilter?'nearest':'linear',repeatS:t.wrapS===RepeatWrapping,repeatT:t.wrapT===RepeatWrapping});

/**
 * Applies one HD pack to the registry: each registered texture whose decoded image an entry names gets the entry's
 * replacement, checked against its declared size and sha256; a texture registered later is applied as it arrives.
 * A refused entry keeps its original and says why. `setPack(null)` restores every original at once. A key with
 * placements (HD.R9) gets one composite: its whole replacement, or else the original carried to the placements' scale
 * as it was sampled (`upscaleRgba`), with every placement whose payload passes drawn over it in manifest order.
 */
export class HdPackRuntime {
  private byKey=new Map<string,HdGroup>();
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
    for(const e of manifest.entries){
      let g=this.byKey.get(e.key);if(!g)this.byKey.set(e.key,g={placed:[]});
      if(e.placements)g.placed.push(e);else g.whole=e;
    }
    // A texture its world disposed is let go with its saved original; nothing is restored into it.
    const offRegister=this.registry.onRegister(t=>this.track(t)),offForget=this.registry.onForget(t=>{if(this.originals.delete(t))this.changed();});
    this.off=()=>{offRegister();offForget();};
    for(const t of this.registry.textures())this.track(t);
    return this.settled().then(()=>({applied:this.applied,skipped:this.skipped()}));
  }
  /**
   * HD-3: the replacement for one decoded image (the pack's key), for a drawer that has no DataTexture -- the menus' CPU
   * compositor. The same checks as a texture's (its source size, its payload's size and sha256, the alpha rescaled), the
   * same placements (HD.R9; the original's texels carried as `sampling`, the compositor's by default), the same shared
   * loads; null when the pack names it not, refused (a skip, with why) or the pack changed meanwhile. Not counted in the
   * applied cap: its caller keeps its own budget.
   */
  async replacement(src:Rgba,sampling:HdSampling=HD_UI_SAMPLING):Promise<Rgba|null>{
    const generation=this.generation;
    const key=await keyOf(src);if(generation!==this.generation)return null;
    const g=this.byKey.get(key);if(!g)return null;
    if(!this.sizeMatches(g,key,src))return null;
    return this.build(g,key,src,generation,sampling);
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
  /** Every entry of a key declares one source size (`validateHdManifest`); a decode of another size is refused. */
  private sizeMatches(g:HdGroup,key:string,src:Rgba):boolean{
    const e=g.whole??g.placed[0]!;
    if(e.width===src.width&&e.height===src.height)return true;
    this.skip(key,'source size does not match',e.source);return false;
  }
  /** One entry's payload, its size and sha256 checked; null (a skip, with why) when it is refused or the pack changed. */
  private async checked(e:HdEntry,key:string,generation:number):Promise<Rgba|null>{
    let r:Rgba;
    try{r=await this.payload(e);}catch(x){if(generation===this.generation)this.skip(key,`payload unavailable (${x instanceof Error?x.message:x})`,e.source);return null;}
    if(generation!==this.generation)return null;
    if(r.width!==e.outWidth||r.height!==e.outHeight||r.data.length!==e.bytes){this.skip(key,'payload size does not match its entry',e.source);return null;}
    if(await keyOf(r)!==e.sha256){if(generation===this.generation)this.skip(key,'payload hash does not match its entry',e.source);return null;}
    return generation===this.generation?r:null;
  }
  /**
   * The key's image, its alpha the runtime's (`fullAlpha`): the whole replacement alone, as before HD.R9; or the
   * composite of its placements over the whole replacement, or over the original carried as `sampling`. A refused
   * placement is left out (the others drawn); null when nothing passes.
   * GM-13c (plan 2026-11-01-gpu-menus; agent/hd-subrect review F3): the payloads in turn, never at once -- each loaded,
   * checked, drawn and let go before the next is asked for, so a key holds its composite and one payload (`hdKeyPeak`),
   * not the sum (font_titlebar_01: 8 regions and its whole). The same bytes as drawing them all at once: the whole's
   * alpha copy, or the original carried to the passing placements' scale, then each passing placement in manifest
   * order. Without a whole the composite is drawn at every placement's scale; when a refused one leaves the passing
   * ones at a smaller scale, it is drawn again from them at theirs (each loaded once more), as it was before.
   */
  private async build(g:HdGroup,key:string,src:Rgba,generation:number,sampling:HdSampling):Promise<Rgba|null>{
    let base:Rgba|null=null;
    if(g.whole){
      let whole=await this.checked(g.whole,key,generation);
      if(generation!==this.generation)return null;
      if(whole)base={width:whole.width,height:whole.height,data:fullAlpha(whole.data)};
      whole=null;                                     // the decoded whole let go: its alpha copy is the composite
    }
    let plan:readonly HdEntry[]=g.placed;
    for(;;){
      if(!plan.length)return base;
      const size=hdCompositeSize(src.width,src.height,base?g.whole:undefined,plan),drawn:HdEntry[]=[];
      let out:Rgba|null=null,image:Rgba|null=null;
      for(const e of plan){
        image=await this.checked(e,key,generation);
        if(generation!==this.generation)return null;
        if(!image)continue;
        out??={width:size.width,height:size.height,data:base?base.data:upscaleRgba(src,size.width,size.height,sampling)};
        drawPlacements(out,src.width,src.height,image,e.placements!,true);
        image=null;                                   // let go before the next payload is asked for
        drawn.push(e);
      }
      if(!out)return base;
      if(base||drawn.length===plan.length)return out;
      const fit=hdCompositeSize(src.width,src.height,undefined,drawn);
      if(fit.width===size.width&&fit.height===size.height)return out;
      plan=drawn;
    }
  }
  private async apply(t:DataTexture,generation:number):Promise<void>{
    const src=this.registry.source(t);if(!src||this.originals.has(t))return;
    const key=await keyOf(src);if(generation!==this.generation)return;
    const g=this.byKey.get(key);if(!g)return;
    if(!this.sizeMatches(g,key,src))return;
    // The cap counts what is applied and what is loading, so a payload past it is never fetched or decoded. The
    // composite is reserved at the larger of the whole's size and the placements' scale: a whole that fails its check
    // leaves build compositing over the original at the placements' scale. GM-13c: build holds one payload at a time,
    // so a key with placements reserves its composite and its largest payload twice -- the payload and its hash's copy
    // (`texturePack.ts` `sha256`), as `hdLoadBytes` counts it (review F3); was every placement's payload once. A whole
    // alone reserves its composite only, as before HD.R9: it under-counts the same way, but changing it would change
    // which of the match's textures the cap admits (every entry before HD.R9 is one).
    const peak=hdKeyPeak(src.width,src.height,g.whole,g.placed);
    const loading=peak.composite+(g.placed.length?2*peak.payload:0),first=g.whole??g.placed[0]!;
    if(this.appliedBytes+this.reserved+loading>HD_LIMITS.appliedBytes){this.skip(key,`over the ${HD_LIMITS.appliedBytes/1024/1024} MiB applied cap`,first.source);return;}
    this.reserved+=loading;
    let r:Rgba|null;
    try{r=await this.build(g,key,src,generation,samplingOf(t));}finally{this.reserved-=loading;}
    if(!r||generation!==this.generation||this.originals.has(t)||this.registry.source(t)!==src)return;
    if(!this.registry.claim(t,'hd')){this.skip(key,'held by the HUD sampling experiment',first.source);return;}
    // The pack keys the disc's bottom-row-first decode; a bitmap the 2D drawers turned top row first takes it turned.
    if(this.registry.isFlipped(t))r=reverseRows(r);
    const mipped=t.mipmaps.length>0||(t.generateMipmaps&&MIP_FILTERS.has(t.minFilter));
    // A 2D drawer's bitmap (the HUD's, the ARMORY's: the flipped ones) whose payload is larger than its unmipmapped
    // bilinear original (3-4x, drawn at the original's size) is minified by a single bilinear tap, aliasing its edges (the
    // nav marks' dark fringe, HD.R8 batch 3): it gets a chain and trilinear minification. Not the world's: a generated
    // chain averages alpha, thinning alpha-tested cut-outs (foliage, grates) with distance. A nearest original keeps its filter.
    const minify=!mipped&&this.registry.isFlipped(t)&&t.minFilter===LinearFilter&&(r.width>src.width||r.height>src.height);
    this.originals.set(t,{image:t.image,mipmaps:t.mipmaps,generate:t.generateMipmaps,min:t.minFilter,bytes:r.data.length});
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
