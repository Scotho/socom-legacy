/**
 * The texture pack builder (GX-1, GX-22; moved here from `tools/localTexturePack.ts` by GX-27 so the generator and the
 * test room's upload build byte-identical packs from the same PNGs): resampling, padding, the enhance ops, the pack's
 * manifest and payloads, and the import core (`importExport`). No `node:` import -- it runs in the page and in the
 * generator alike. A browser adaptation with no original (H135): it makes replacement texels, never a game value.
 */
import type {Rgba} from '@s2u/gs';
import {mipChain} from './materialSpec';
import {PACK_LIMITS,refusePack,packMethod,packScale,requirePack,sha256,sourceDigest,validateManifest,validateSource,type PackSource,type PackManifest,type PackProvenance,type PackScale,type PackRoles,packRoles,type PackMap,mapArchiveOf} from './texturePack';

type Wrap='repeat'|'clamp';
const sinc=(x:number)=>x===0?1:Math.sin(Math.PI*x)/(Math.PI*x);
const kernel=(x:number)=>Math.abs(x)<3?sinc(x)*sinc(x/3):0;
const at=(x:number,n:number,wrap:Wrap)=>wrap==='repeat'?((x%n)+n)%n:Math.max(0,Math.min(n-1,x));
export const wrapsOf=(s:PackSource):[Wrap,Wrap]=>[s.flags.gs?.wrapS??'repeat',s.flags.gs?.wrapT??'repeat'];
/** Stored-value, premultiplied-alpha, separable Lanczos-3. No learned detail or model dependency. */
export function lanczos2x(source:Rgba,wrapS:Wrap,wrapT:Wrap):Rgba {
  const {width:w,height:h,data}=source;requirePack(w>0&&h>0&&w<=512&&h<=512&&data.length===w*h*4);
  const width=w*2,height=h*2,horizontal=new Float64Array(width*h*4),out=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<h;y++)for(let x=0;x<width;x++){
    const centre=(x+0.5)/2-0.5,first=Math.ceil(centre-3);let weight=0;const values=[0,0,0,0];
    for(let sx=first;sx<=Math.floor(centre+3);sx++){
      const k=kernel(centre-sx),i=(y*w+at(sx,w,wrapS))*4,a=data[i+3]!/255;weight+=k;
      for(let c=0;c<3;c++)values[c]!+=data[i+c]!*a*k;values[3]!+=a*k;
    }
    for(let c=0;c<4;c++)horizontal[(y*width+x)*4+c]=values[c]!/weight;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const centre=(y+0.5)/2-0.5,first=Math.ceil(centre-3);let weight=0;const values=[0,0,0,0];
    for(let sy=first;sy<=Math.floor(centre+3);sy++){
      const k=kernel(centre-sy),i=(at(sy,h,wrapT)*width+x)*4;weight+=k;
      for(let c=0;c<4;c++)values[c]!+=horizontal[i+c]!*k;
    }
    const a=Math.max(0,Math.min(1,values[3]!/weight)),i=(y*width+x)*4;out[i+3]=Math.round(a*255);
    for(let c=0;c<3;c++)out[i+c]=a>1e-8?Math.round(Math.max(0,Math.min(255*a,values[c]!/weight))/a):0;
  }
  return {width,height,data:out};
}
/**
 * The same Lanczos-3 kernel stretched to a 2x reduction (GX-1: an import's lower levels), separable and premultiplied
 * as `lanczos2x`; an axis already 1 texel long is copied. Wrap follows the source's flags.
 */
export function lanczosHalf(source:Rgba,wrapS:Wrap,wrapT:Wrap):Rgba {
  const {width:w,height:h,data}=source;requirePack(w>0&&h>0&&data.length===w*h*4);
  let plane=new Float64Array(w*h*4);
  for(let i=0;i<w*h;i++){const a=data[i*4+3]!/255;for(let c=0;c<3;c++)plane[i*4+c]=data[i*4+c]!*a;plane[i*4+3]=a;}
  let pw=w,ph=h;
  for(const horizontal of [true,false]){
    const n=horizontal?pw:ph,m=Math.max(1,n>>1),wrap=horizontal?wrapS:wrapT;if(m===n)continue;
    const ow=horizontal?m:pw,oh=horizontal?ph:m,next=new Float64Array(ow*oh*4);
    for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
      const centre=((horizontal?x:y)+0.5)*2-0.5;let weight=0;const values=[0,0,0,0];
      for(let s=Math.ceil(centre-6);s<=Math.floor(centre+6);s++){
        const k=kernel((centre-s)/2),t=at(s,n,wrap),i=(horizontal?y*pw+t:t*pw+x)*4;weight+=k;
        for(let c=0;c<4;c++)values[c]!+=plane[i+c]!*k;
      }
      for(let c=0;c<4;c++)next[(y*ow+x)*4+c]=values[c]!/weight;
    }
    plane=next;pw=ow;ph=oh;
  }
  const out=new Uint8ClampedArray(pw*ph*4);
  for(let i=0;i<pw*ph;i++){
    const a=Math.max(0,Math.min(1,plane[i*4+3]!));out[i*4+3]=Math.round(a*255);
    for(let c=0;c<3;c++)out[i*4+c]=a>1e-8?Math.round(Math.max(0,Math.min(255*a,plane[i*4+c]!))/a):0;
  }
  return {width:pw,height:ph,data:out};
}
/**
 * GX.R3's export padding: the source in the middle of a 3x3 field of itself, each axis by its own wrap -- a repeating
 * axis tiled (the model sees the seam's neighbours), a clamped axis its edge texels extended one source length.
 */
export function padForExport(source:Rgba,wrapS:Wrap,wrapT:Wrap):Rgba {
  const {width:w,height:h,data}=source;requirePack(w>0&&h>0&&data.length===w*h*4);
  const width=w*3,height=h*3,out=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(at(y-h,h,wrapT)*w+at(x-w,w,wrapS))*4;out.set(data.subarray(i,i+4),(y*width+x)*4);}
  return {width,height,data:out};
}
/** The import's inverse of `padForExport` at `scale`: the centre tile of an image exactly scale x the padded size. */
export function cropImport(image:Rgba,w:number,h:number,scale:number):Rgba|null {
  if(image.width!==w*3*scale||image.height!==h*3*scale||image.data.length!==image.width*image.height*4)return null;
  const width=w*scale,height=h*scale,out=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++){const row=((y+height)*image.width+width)*4;out.set(image.data.subarray(row,row+width*4),y*width*4);}
  return {width,height,data:out};
}

/**
 * GX-22 (plan 2026-10-10-web-graphics-slice-4-packs): the generator's named, deterministic image operations on a pack's
 * replacement texels -- a browser adaptation with no original (H135; the original's look stays the default). Each works
 * on the stored 8-bit values, RGB only, alpha copied (the sources are opaque: `validateSource`), reading past an edge by
 * the texture's own wrap, and rounds to the nearest level.
 * - `unsharp=<radius>,<amount>[,<threshold>]`: per channel `v' = v + amount * (v - G(v))` where `|v - G(v)| >= threshold`
 *   levels, else `v`; `G` a separable Gaussian of sigma = radius texels, truncated at ceil(3 sigma) taps and normalised.
 * - `contrast=<amount>[,<radius>]`: local contrast -- the same formula, threshold 0, at a wide radius.
 * - `saturation=<factor>`: in linear light (the stored values decoded by the sRGB transfer function, IEC 61966-2-1),
 *   each channel moved from the Rec. 709 luminance `Y = 0.2126 R + 0.7152 G + 0.0722 B` by `c' = Y + factor * (c - Y)`,
 *   clamped to 0..1 and re-encoded.
 * The bounds below are the adaptation's own, not console values.
 */
export type EnhanceOp={op:'unsharp';radius:number;amount:number;threshold:number}|{op:'contrast';amount:number;radius:number}|{op:'saturation';factor:number};
export const ENHANCE_MAX_OPS=8;
export const CONTRAST_RADIUS_DEFAULT=16;
interface EnhanceParam {name:string;min:number;max:number;fallback?:number}
const ENHANCE_OPS:Record<EnhanceOp['op'],EnhanceParam[]>={
  unsharp:[{name:'radius',min:0.5,max:4},{name:'amount',min:0.1,max:2},{name:'threshold',min:0,max:32,fallback:0}],
  contrast:[{name:'amount',min:0.1,max:0.6},{name:'radius',min:8,max:32,fallback:CONTRAST_RADIUS_DEFAULT}],
  saturation:[{name:'factor',min:0.5,max:1.5}],
};
const DECIMAL=/^(?:\d+(?:\.\d+)?|\.\d+)$/;
/** `--enhance`'s text: `<op>=<args>` joined by `;`, applied in order. Any malformed or out-of-range part refuses with its reason. */
export function parseEnhance(text:string):EnhanceOp[]{
  refusePack(typeof text==='string'&&text.length>0,'--enhance: no operation given');
  const parts=text.split(';');refusePack(parts.length<=ENHANCE_MAX_OPS,`--enhance: more than ${ENHANCE_MAX_OPS} operations`);
  return parts.map(part=>{
    const match=/^([a-z]+)=(.*)$/.exec(part);refusePack(match,`--enhance: "${part}" is not <op>=<args>`);
    const name=match[1]!;refusePack(Object.hasOwn(ENHANCE_OPS,name),`--enhance: unknown operation "${name}" (unsharp, contrast, saturation)`);
    const params=ENHANCE_OPS[name as EnhanceOp['op']],args=match[2]!.split(','),required=params.filter(p=>p.fallback===undefined).length;
    refusePack(args.length>=required&&args.length<=params.length,`--enhance: ${name} takes ${required===params.length?required:`${required}-${params.length}`} arguments, not ${args.length}`);
    const v=params.map((p,i)=>{
      if(i>=args.length)return p.fallback!;
      const a=args[i]!;refusePack(DECIMAL.test(a),`--enhance: ${name} ${p.name} "${a}" is not a plain decimal number`);
      const n=Number(a);refusePack(n>=p.min&&n<=p.max,`--enhance: ${name} ${p.name} ${a} is outside ${p.min}-${p.max}`);return n;
    });
    return name==='unsharp'?{op:'unsharp',radius:v[0]!,amount:v[1]!,threshold:v[2]!}:name==='contrast'?{op:'contrast',amount:v[0]!,radius:v[1]!}:{op:'saturation',factor:v[0]!};
  });
}
/** The canonical text recorded in a manifest: every argument, defaults included, as `String(number)`. */
export const enhanceText=(ops:readonly EnhanceOp[]):string=>ops.map(o=>o.op==='unsharp'?`unsharp=${o.radius},${o.amount},${o.threshold}`:o.op==='contrast'?`contrast=${o.amount},${o.radius}`:`saturation=${o.factor}`).join(';');
/** A method with the ops' ` enhance:` suffix (conventions §6); none leaves it as it was. */
export function withEnhance(method:string,ops:readonly EnhanceOp[]):string{
  if(ops.length===0)return method;
  refusePack(!method.includes(' enhance:'),'--enhance: the method already carries an enhance: suffix');
  const out=`${method} enhance:${enhanceText(ops)}`;
  refusePack(out.length<=PACK_LIMITS.methodLength,`--enhance: the method with its suffix is longer than ${PACK_LIMITS.methodLength} characters`);
  return out;
}
/**
 * GX-22 `--from 4x`: the method's first word made `<tool>-<model>-2x-from-4x` (conventions §6: scale 2, variant
 * `from-4x`): a trailing `-4x` is replaced, a word with no scale gains it; any other scale or variant refuses.
 */
export function fromFourMethod(method:string):string{
  const space=method.indexOf(' '),word=space<0?method:method.slice(0,space),rest=space<0?'':method.slice(space);
  if(word.endsWith('-2x-from-4x'))return method;
  const stem=word.endsWith('-4x')?word.slice(0,-3):word;
  refusePack(stem.length>0&&!/-\d+x(?:-|$)/.test(stem),`--from 4x: the method's first word "${word}" names another scale or a variant; give <tool>-<model>[-4x]`);
  return `${stem}-2x-from-4x${rest}`;
}
function gaussianRgb(l:Rgba,sigma:number,wrapS:Wrap,wrapT:Wrap):Float64Array{
  const {width:w,height:h,data}=l,reach=Math.ceil(3*sigma),weights=new Float64Array(2*reach+1);let sum=0;
  for(let k=-reach;k<=reach;k++){const v=Math.exp(-(k*k)/(2*sigma*sigma));weights[k+reach]=v;sum+=v;}
  for(let k=0;k<weights.length;k++)weights[k]=weights[k]!/sum;
  const across=new Float64Array(w*h*3),out=new Float64Array(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let r=0,g=0,b=0;
    for(let k=-reach;k<=reach;k++){const wt=weights[k+reach]!,i=(y*w+at(x+k,w,wrapS))*4;r+=wt*data[i]!;g+=wt*data[i+1]!;b+=wt*data[i+2]!;}
    const o=(y*w+x)*3;across[o]=r;across[o+1]=g;across[o+2]=b;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let r=0,g=0,b=0;
    for(let k=-reach;k<=reach;k++){const wt=weights[k+reach]!,i=(at(y+k,h,wrapT)*w+x)*3;r+=wt*across[i]!;g+=wt*across[i+1]!;b+=wt*across[i+2]!;}
    const o=(y*w+x)*3;out[o]=r;out[o+1]=g;out[o+2]=b;
  }
  return out;
}
const level8=(v:number)=>Math.max(0,Math.min(255,Math.round(v)));
function unsharpMask(l:Rgba,radius:number,amount:number,threshold:number,wrapS:Wrap,wrapT:Wrap):Rgba{
  const blur=gaussianRgb(l,radius,wrapS,wrapT),data=new Uint8ClampedArray(l.data);
  for(let p=0;p<l.width*l.height;p++)for(let c=0;c<3;c++){const v=l.data[p*4+c]!,d=v-blur[p*3+c]!;if(Math.abs(d)>=threshold)data[p*4+c]=level8(v+amount*d);}
  return {width:l.width,height:l.height,data};
}
const toLinear=(v:number)=>{const c=v/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;};
const toStored=(l:number)=>level8(255*(l<=0.0031308?12.92*l:1.055*l**(1/2.4)-0.055));
function saturate(l:Rgba,factor:number):Rgba{
  const data=new Uint8ClampedArray(l.data);
  for(let p=0;p<l.width*l.height;p++){
    const lin=[0,1,2].map(c=>toLinear(l.data[p*4+c]!)),y=0.2126*lin[0]!+0.7152*lin[1]!+0.0722*lin[2]!;
    for(let c=0;c<3;c++)data[p*4+c]=toStored(Math.max(0,Math.min(1,y+factor*(lin[c]!-y))));
  }
  return {width:l.width,height:l.height,data};
}
/** The ops applied to one level in the given order; none returns the level itself. */
export function enhanceLevel(level:Rgba,ops:readonly EnhanceOp[],wrapS:Wrap,wrapT:Wrap):Rgba{
  let out=level;
  for(const o of ops)out=o.op==='unsharp'?unsharpMask(out,o.radius,o.amount,o.threshold,wrapS,wrapT):o.op==='contrast'?unsharpMask(out,o.radius,o.amount,0,wrapS,wrapT):saturate(out,o.factor);
  return out;
}

/** A built pack: its id (the manifest's sha256), the manifest and its exact bytes, each payload by file name. */
export type BuiltPack={id:string;manifest:PackManifest;manifestBytes:Uint8Array;payloads:Map<string,Uint8Array>};
type Built=BuiltPack;
/**
 * Why an import left a texture original (GX.R5): counted and reported, never a failure of the whole pack. `untouched`
 * (GX-27, the upload only): its PNG is the export's own size, so the artist kept the original. `notEligible` (a plain
 * pack): the PNG's key is not an eligible source on the loaded map, so that texture keeps its original.
 */
export interface LeftOut {key:string;reason:'missing'|'changed'|'unreadable'|'size'|'alpha'|'layout'|'entryBytes'|'totalBytes'|'untouched'|'notEligible'}
const chainBytes=(chain:Rgba[])=>chain.reduce((n,l)=>n+l.data.byteLength,0);
/** One entry from its finished levels; the first `authored` carry their source level's index, the tail null. */
async function pushEntry(manifest:PackManifest,payloads:Map<string,Uint8Array>,s:PackSource,chain:Rgba[],authored:number,mipmaps:boolean):Promise<void>{
  const length=chainBytes(chain),bytes=new Uint8Array(length);let offset=0;
  const levels=chain.map((l,index)=>{const level={width:l.width,height:l.height,offset,bytes:l.data.byteLength,sourceLevel:index<authored?index:null};bytes.set(l.data,offset);offset+=l.data.byteLength;return level;});
  const file=`${manifest.entries.length}.rgba`;payloads.set(file,bytes);const sourceLevels=[];
  for(const l of s.levels)sourceLevels.push({width:l.width,height:l.height,sha256:await sha256(new Uint8Array(l.data.buffer,l.data.byteOffset,l.data.byteLength))});
  manifest.entries.push({key:s.key,file,bytes:length,sha256:await sha256(bytes),sourceDigest:await sourceDigest(s,manifest.mapArchive),sourceFlags:s.flags,sourceLevels,library:s.library??'',record:s.record??s.key,mipmaps,levels});
  manifest.totalBytes+=length;
}
async function finish(manifest:PackManifest,payloads:Map<string,Uint8Array>):Promise<Built>{
  validateManifest(manifest);const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n');requirePack(manifestBytes.length<=PACK_LIMITS.manifestBytes);
  return {id:await sha256(manifestBytes),manifest,manifestBytes,payloads};
}
const emptyManifest=(method:string,scale:PackScale,roles:PackRoles,provenance:PackProvenance,map:PackMap):PackManifest=>({format:'s2u-local-texture-pack',version:1,mapArchive:mapArchiveOf(map),localOnly:true,method,scale,roles,provenance,totalBytes:0,entries:[]});
const unique=(sources:PackSource[])=>sources.length<=PACK_LIMITS.entries&&new Set(sources.map(s=>s.key)).size===sources.length;

/**
 * `map`: the archive the sources were read from (GX-1c; the CLI reads it off the archive). `enhance` (GX-22): applied to
 * each authored level after its Lanczos resample -- every authored level is the disc's own level resampled, so each is
 * enhanced alike and the generated tail is built from the enhanced levels; the method gains its ` enhance:` suffix.
 */
export async function buildTexturePack(sources:PackSource[],provenance:PackProvenance,map:PackMap='MP51',enhance:readonly EnhanceOp[]=[]):Promise<Built> {
  requirePack(sources.length>0&&unique(sources));
  sources.forEach(validateSource);
  const manifest=emptyManifest(withEnhance('lanczos3',enhance),2,'world',provenance,map),payloads=new Map<string,Uint8Array>();
  for(const s of sources){
    const [wrapS,wrapT]=wrapsOf(s);
    const authored=s.levels.map(l=>enhanceLevel(lanczos2x(l,wrapS,wrapT),enhance,wrapS,wrapT)),mipmaps=s.flags.gs?.mipmaps===true;
    const chain=mipmaps?mipChain(authored[0]!,authored.slice(1)):authored;
    const length=chainBytes(chain);requirePack(length<=PACK_LIMITS.entryBytes&&manifest.totalBytes+length<=PACK_LIMITS.totalBytes);
    await pushEntry(manifest,payloads,s,chain,authored.length,mipmaps);
  }
  return finish(manifest,payloads);
}

/**
 * GX-1's import: each source's base level as an image tool returned it (already cropped to `scale` x the source), the
 * lower authored levels rebuilt by `lanczosHalf` from it at their own indices, the missing tail generated as
 * `buildTexturePack` does (`mipChain`). A wrong size, any alpha under 255, a level layout that does not halve to the
 * source's, or a cap leaves that texture original and is appended to `leftOut`; no entry left is a refusal.
 * `enhance` (GX-22) runs on the base before the lower levels are rebuilt from it, so the whole chain carries it; the
 * method gains its ` enhance:` suffix.
 */
export async function buildImportedPack(items:{source:PackSource;base:Rgba}[],options:{method:string;scale:PackScale;roles?:PackRoles;map?:PackMap;enhance?:readonly EnhanceOp[]},provenance:PackProvenance,leftOut:LeftOut[]=[]):Promise<Built&{leftOut:LeftOut[]}> {
  requirePack(packMethod(options.method)&&packScale(options.scale)&&(options.roles===undefined||packRoles(options.roles))&&unique(items.map(i=>i.source)));
  items.forEach(i=>validateSource(i.source));
  const enhance=options.enhance??[],method=withEnhance(options.method,enhance);
  const {scale}=options,manifest=emptyManifest(method,scale,options.roles??'world',provenance,options.map??'MP51'),payloads=new Map<string,Uint8Array>();
  for(const {source:s,base} of items){
    const out=(reason:LeftOut['reason'])=>{leftOut.push({key:s.key,reason});};
    if(base.width!==s.levels[0]!.width*scale||base.height!==s.levels[0]!.height*scale||base.data.length!==base.width*base.height*4){out('size');continue;}
    const [wrapS,wrapT]=wrapsOf(s),mipmaps=s.flags.gs?.mipmaps===true,authored=[enhanceLevel(base,enhance,wrapS,wrapT)];
    for(let i=1;i<s.levels.length;i++)authored.push(lanczosHalf(authored[i-1]!,wrapS,wrapT));
    if(authored.some((l,i)=>l.width!==s.levels[i]!.width*scale||l.height!==s.levels[i]!.height*scale)){out('layout');continue;}
    const chain=mipmaps?mipChain(authored[0]!,authored.slice(1)):authored;
    if(chain.some(l=>{for(let a=3;a<l.data.length;a+=4)if(l.data[a]!==255)return true;return false;})){out('alpha');continue;}
    const length=chainBytes(chain);
    if(length>PACK_LIMITS.entryBytes){out('entryBytes');continue;}
    if(manifest.totalBytes+length>PACK_LIMITS.totalBytes){out('totalBytes');continue;}
    await pushEntry(manifest,payloads,s,chain,authored.length,mipmaps);
  }
  requirePack(manifest.entries.length>0);
  return {...await finish(manifest,payloads),leftOut};
}

/** The export's formats (GX-1 `--export`): each texture's sidecar, and the directory's index `export.json`. */
export const EXPORT_FORMAT='s2u-texture-export',EXPORT_INDEX_FORMAT='s2u-texture-export-index';
/** A file stem an image tool keeps: the index, then the key with anything but [a-z0-9_-] as "_" (no second dot). */
export const EXPORT_STEM=/^[0-9]{3}_[a-z0-9_-]{1,128}$/;
export interface ExportSidecar {format:string;version:1;key:string;library:string;record:string;png:string;width:number;height:number;wrapS:string;wrapT:string;
  mipmaps:boolean;levels:number;sourceSha256:string;paddedWidth:number;paddedHeight:number;
  padding:{left:number;right:number;top:number;bottom:number;s:'tile'|'edge';t:'tile'|'edge'}}
/**
 * Where an import's files come from (GX-27: the generator's directories, or the upload's zip): `index` is `export.json`
 * parsed (null when absent); `sidecar` a stem's sidecar parsed (null when absent; a throw refuses the import); `image` a
 * stem's PNG -- null when absent, a reason to leave the texture out with, or its decode (a throw leaves it `unreadable`).
 */
export interface ExportReader {
  index():Promise<unknown>;
  sidecar(stem:string):Promise<unknown>;
  image(stem:string):Promise<null|LeftOut['reason']|(()=>Rgba|Promise<Rgba>)>;
}
export interface ImportOptions {method:string;scale:PackScale;roles?:PackRoles;map?:PackMap;enhance?:readonly EnhanceOp[];from?:4}
const BOUNDED_STRING=256;
/**
 * GX-1's import core (moved from `tools/writeLocalTexturePack.ts`, `importTextures`, by GX-27): the export's index and
 * sidecars checked against `sources` (the map's eligible set for the export's roles), each image cropped to its centre
 * tile at `scale` (`cropImport`; `from: 4` takes 4x images and reduces each crop by `lanczosHalf`) and handed to
 * `buildImportedPack`. A missing, changed, unreadable or mis-sized texture is left out with its reason; an index of
 * another archive or map, or nothing left, refuses. A source without a `library` (the page's, `packSourcesFor`) takes its
 * library and record from its sidecar, as the generator's sources carry them from the archive.
 */
export async function importExport(sources:readonly PackSource[],reader:ExportReader,options:ImportOptions,provenance:PackProvenance):Promise<BuiltPack&{leftOut:LeftOut[]}>{
  const map=options.map??'MP51',from=options.from;
  requirePack(packMethod(options.method)&&packScale(options.scale));
  refusePack(from===undefined||(from===4&&options.scale===2),'--from 4x needs --scale 2 (a 2x pack reduced from 4x PNGs)');
  const method=from?fromFourMethod(options.method):options.method;
  const index=await reader.index() as {format?:unknown;version?:unknown;mapArchive?:unknown;archiveSha256?:unknown;roles?:unknown;entries?:unknown}|null;
  requirePack(index&&index.format===EXPORT_INDEX_FORMAT&&index.version===1&&index.mapArchive===mapArchiveOf(map)&&index.archiveSha256===provenance.archiveSha256);
  // The manifest's roles are the export's: a --roles that disagrees refuses rather than relabelling the set.
  const roles=index.roles??'world';requirePack(packRoles(roles)&&(options.roles===undefined||options.roles===roles));
  requirePack(Array.isArray(index.entries)&&index.entries.length<=PACK_LIMITS.entries);
  const stems=new Map<string,string>();
  for(const e of index.entries as {key?:unknown;stem?:unknown}[]){requirePack(e&&typeof e.key==='string'&&typeof e.stem==='string'&&EXPORT_STEM.test(e.stem)&&!stems.has(e.key));stems.set(e.key,e.stem);}
  const leftOut:LeftOut[]=[],items:{source:PackSource;base:Rgba}[]=[],{scale}=options;
  const levelHash=(l:Rgba)=>sha256(new Uint8Array(l.data.buffer,l.data.byteOffset,l.data.byteLength));
  for(const s of sources){
    validateSource(s);const out=(reason:LeftOut['reason'])=>{leftOut.push({key:s.key,reason});};
    const stem=stems.get(s.key);if(!stem){out('missing');continue;}
    const side=await reader.sidecar(stem) as Partial<ExportSidecar>|null;if(!side){out('missing');continue;}
    const base=s.levels[0]!,[wrapS,wrapT]=wrapsOf(s);
    if(side.format!==EXPORT_FORMAT||side.key!==s.key||side.width!==base.width||side.height!==base.height||side.wrapS!==wrapS||side.wrapT!==wrapT||side.sourceSha256!==await levelHash(base)){out('changed');continue;}
    let source=s;
    if(s.library===undefined){
      const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=BOUNDED_STRING;
      if(!text(side.library)||!text(side.record)){out('changed');continue;}
      source={...s,library:side.library,record:side.record};
    }
    const found=await reader.image(stem);if(found===null){out('missing');continue;}
    if(typeof found==='string'){out(found);continue;}
    let image:Rgba;
    try{image=await found();}catch{out('unreadable');continue;}
    const cropped=cropImport(image,base.width,base.height,from??scale);if(!cropped){out('size');continue;}
    items.push({source,base:from?lanczosHalf(cropped,wrapS,wrapT):cropped});
  }
  refusePack(!(from&&items.length===0&&leftOut.some(l=>l.reason==='size')),'--from 4x: no imported PNG is 4x its padded export (12w x 12h)');
  return buildImportedPack(items,{method,scale,roles:roles as PackRoles,map,...(options.enhance?{enhance:options.enhance}:{})},provenance,leftOut);
}
