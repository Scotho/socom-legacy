import {RGBA_BPTC_Format,RGBA_S3TC_DXT1_Format,RGBA_S3TC_DXT3_Format,RGBA_S3TC_DXT5_Format} from 'three';
import type {Rgba} from '@s2u/gs';
import {decodeDds} from './dds';
import {ktx2LevelBytes,readKtx2,type Ktx2Image,type Ktx2Kind} from './ktx2';

/**
 * WM-PACK-2 RUNTIME (plan 2026-11-14-weekend-mega, WM.R13; PRODUCT TRACK, a browser adaptation with no original): an
 * HD pack's KTX2 payload uploaded to the GPU as its own BC blocks instead of the RGBA its decode gives -- the same blocks;
 * the hardware's decode, within the format's tolerance (BC7 exact; `HD_BLOCK_DECODE_TOLERANCE_ADAPTATION`) -- a quarter to
 * an eighth of the memory. Only where nothing the runtime
 * does to a payload would change its bytes: the decision (`blockEligible`) is pure, so every condition is a test, and a
 * payload that fails any of them takes the RGBA path exactly as before. Nothing the game does changes here.
 */
export type BcKind=Exclude<Ktx2Kind,'rgba8'>;
/** The four block kinds the pack's converter writes (`tools/hdPackKtx2.ts`). A browser adaptation. */
export const BC_KINDS:readonly BcKind[]=['bc1','bc2','bc3','bc7'];
/**
 * A MEASURED ALLOWANCE for vendor BC1-3 decoders, NOT a specification: the largest per-channel difference (in 255) the
 * browser test (`e2e/hdPackBlocks.spec.ts`) accepts between a BC1/BC2/BC3 block upload and the RGBA path; BC7's bound
 * stays 0 (bit-exact by spec). `dds.ts` interpolates by truncation, and hardware decoders round and weight their
 * interpolated texels their own way. Measured on Shadow PC 2's GPU through ANGLE/D3D11, 2026-11-15: bc1 5, bc2 6, bc3 5,
 * bc7 0 (the main controller's ruling, replacing 1). A texture pack's drawing, an adaptation; the test prints the measured
 * maximum per kind on every device it runs on and fails above this.
 */
export const HD_BLOCK_DECODE_TOLERANCE_ADAPTATION=8;
/**
 * Each kind's three.js format constant, UNORM (three r186 maps them to WebGPU's `bc1-rgba-unorm` ... `bc7-rgba-unorm`
 * and WebGL's S3TC / BPTC internal formats). BC1 is the four-colour-or-punch-through RGBA form the decoder reads
 * (`dds.ts` colorBlock with `bc1` true). A browser adaptation.
 */
export const BC_THREE_FORMAT_ADAPTATION:Readonly<Record<BcKind,number>>={bc1:RGBA_S3TC_DXT1_Format,bc2:RGBA_S3TC_DXT3_Format,
  bc3:RGBA_S3TC_DXT5_Format,bc7:RGBA_BPTC_Format};
/** The WebGPU feature that carries all four kinds. A browser adaptation. */
export const BC_WEBGPU_FEATURE_ADAPTATION='texture-compression-bc';
/** The WebGL2 extension each kind needs. A browser adaptation. */
export const BC_WEBGL_EXTENSION_ADAPTATION:Readonly<Record<BcKind,string>>={bc1:'WEBGL_compressed_texture_s3tc',
  bc2:'WEBGL_compressed_texture_s3tc',bc3:'WEBGL_compressed_texture_s3tc',bc7:'EXT_texture_compression_bptc'};
/**
 * WebGPU refuses a BC texture whose level 0 is not whole 4x4 blocks (its texture-creation validation), and WebGL2's
 * S3TC/BPTC sub-image uploads ask the same of the whole level: an image that is not keeps the RGBA path. A browser
 * adaptation.
 */
export const BC_BLOCK_EDGE_ADAPTATION=4;

/** What the page's renderer can sample: its backend, and the feature (WebGPU) or extension (WebGL2) it has. */
export type BlockProbe={backend:'webgpu';hasFeature:(name:string)=>boolean}|{backend:'webgl';hasExtension:(name:string)=>boolean};
/** The block kinds `probe`'s device samples; none without a probe (a page that gives none keeps the RGBA path). */
export function blockSupport(probe:BlockProbe|null|undefined):ReadonlySet<BcKind>{
  if(!probe)return new Set();
  if(probe.backend==='webgpu')return new Set(probe.hasFeature(BC_WEBGPU_FEATURE_ADAPTATION)?BC_KINDS:[]);
  return new Set(BC_KINDS.filter(k=>probe.hasExtension(BC_WEBGL_EXTENSION_ADAPTATION[k])));
}

/**
 * The page's renderer's probe (`renderer.ts` `createRenderer`, after its init: the backend three settled on). A page
 * draws with one renderer at a time; until one is made there is none, and every texture keeps the RGBA path.
 */
let pageProbe:BlockProbe|null=null;
/** Review F3: the renderer whose probe `pageProbe` is (`holdPageBlockProbe`); only its dispose clears it. */
let pageHolder:object|null=null;
/**
 * What `renderer`'s backend (three's, after its init) can sample as BC blocks -- WebGPU's device features (three requests
 * every feature the adapter has), or WebGL2's extensions, each enabled as it is asked (`getExtension`, through three's own
 * cache). Null for neither. Review F2: here, not in `renderer.ts`, so a test reads it without the renderer's graph.
 */
export function rendererBlockProbe(renderer:{backend:unknown}):BlockProbe|null{
  const b=renderer.backend as {isWebGPUBackend?:boolean;device?:{features?:{has(name:string):boolean}};extensions?:{get(name:string):unknown}}|null|undefined;
  if(!b)return null;
  if(b.isWebGPUBackend){const f=b.device?.features;return f?{backend:'webgpu',hasFeature:(n)=>f.has(n)}:null;}
  const e=b.extensions;
  return e&&typeof e.get==='function'?{backend:'webgl',hasExtension:(n)=>e.get(n)!=null}:null;
}
/**
 * Review F3 (the holder pattern of `matchMount.ts` `anisotropyHolder`): `renderer`'s probe becomes the page's, and its
 * `dispose` clears it -- only while it is still the holder -- so a page that made another renderer since is never judged
 * by a disposed one's backend, nor a later one by an earlier one's.
 */
export function holdPageBlockProbe(renderer:{backend:unknown;dispose():unknown}):void{
  pageProbe=rendererBlockProbe(renderer);pageHolder=renderer;
  const dispose=renderer.dispose.bind(renderer);
  renderer.dispose=():unknown=>{if(pageHolder===renderer){pageProbe=null;pageHolder=null;}return dispose();};   // three r186 dispose is async: its promise kept
}
export function setPageBlockProbe(probe:BlockProbe|null):void{pageProbe=probe;pageHolder=null;}
/** `HdRuntimeOptions.blocks`' default: the kinds the page's renderer samples. */
export function pageBlockSupport():ReadonlySet<BcKind>{return blockSupport(pageProbe);}

/** A payload's KTX2, held beside its decode (the runtime checks the decode, uploads the blocks). */
const BLOCKS=new WeakMap<Rgba,Ktx2Image>();
/** `r`, the decode of `img`'s level 0, marked as carrying `img`'s blocks. */
export function withBlocks<R extends Rgba>(r:R,img:Ktx2Image):R{BLOCKS.set(r,img);return r;}
/** The KTX2 a decoded payload came from (`withBlocks`), if any. */
export function blocksOf(r:Rgba):Ktx2Image|undefined{return BLOCKS.get(r);}

const FOURCC:Record<Exclude<BcKind,'bc7'>,string>={bc1:'DXT1',bc2:'DXT3',bc3:'DXT5'};
/**
 * A KTX2's level 0 as RGBA, through `dds.ts`' own block decoders (its blocks wrapped in a DDS header, as
 * `tools/hdPackKtx2.ts` `ktx2Rgba` does), so a KTX2 payload's decode is its DDS's byte for byte.
 */
export function ktx2Level0Rgba(img:Ktx2Image):Uint8ClampedArray{
  const l0=img.levels[0]!;
  if(img.kind==='rgba8')return new Uint8ClampedArray(l0.data);
  return decodeDds(ktx2Level0Dds(img)).data;
}
/**
 * A BC KTX2's level 0 as a DDS (legacy FourCC, or DX10 for BC7) holding the same blocks: what `decodeDds` -- here, or
 * the menus' decode worker (`hdMenuTextures.ts` `HdMenuDecoder.ktx2`) -- decodes to the KTX2's RGBA.
 */
export function ktx2Level0Dds(img:Ktx2Image):Uint8Array{
  if(img.kind==='rgba8')throw new Error('KTX2: an RGBA payload has no blocks');
  const l0=img.levels[0]!;
  const dx10=img.kind==='bc7',off=dx10?148:128,b=new Uint8Array(off+l0.data.length),v=new DataView(b.buffer);
  b.set([0x44,0x44,0x53,0x20]);v.setUint32(4,124,true);v.setUint32(8,0x1007,true);v.setUint32(12,img.height,true);v.setUint32(16,img.width,true);
  v.setUint32(76,32,true);v.setUint32(80,4,true);
  const fc=dx10?'DX10':FOURCC[img.kind as keyof typeof FOURCC];for(let i=0;i<4;i++)b[84+i]=fc.charCodeAt(i);
  if(dx10){v.setUint32(128,98,true);v.setUint32(132,3,true);v.setUint32(140,1,true);}
  b.set(l0.data,off);
  return b;
}
/**
 * A KTX2 payload's decode at its entry's size (`expect`; another size refused before anything is decoded), its blocks
 * held beside it (`blocksOf`).
 */
export function decodeKtx2(bytes:Uint8Array,expect?:{width:number;height:number}):Rgba{
  const img=readKtx2(bytes);
  if(expect&&(expect.width!==img.width||expect.height!==img.height))throw new Error(`KTX2: size ${img.width}x${img.height}, the entry says ${expect.width}x${expect.height}`);
  return withBlocks({width:img.width,height:img.height,data:ktx2Level0Rgba(img)},img);
}

/** Why an entry keeps the RGBA path; each is one of the design's conditions (a)-(f). */
export type BlockRefusal='not-ktx2'|'not-blocks'|'placed'|'not-exact'|'flipped'|'mipped'|'minified'|'no-chain'|'guarded'|'unsupported'|'not-block-aligned'|'flip-y'|'srgb';
export interface BlockCase {
  /** The entry: its format, and its placements (a whole entry has none). */
  entry:{format:string;placements?:readonly unknown[]};
  /** (b) the key has entries with placements (drawn into a composite). */
  keyPlaced:boolean;
  /** The payload's KTX2 (`blocksOf` the decoded payload), if it has one. */
  blocks:Ktx2Image|undefined;
  /** (c) the payload as decoded (the bytes the check hashed), and the replacement after the alpha rescale. */
  decoded:Rgba;
  rescaled:Rgba;
  /** (d) the original texture: drawn top row first (`HdTextureRegistry.isFlipped`), mipped, or given the minify chain. */
  flipped:boolean;
  mipped:boolean;
  minify:boolean;
  /**
   * LATER 1137: the replacement needs a chain (opaque, larger than its unmipped bilinear world original); the block path
   * then holds only with the file's own full chain (`ktx2FullChain`), else 'no-chain' (the RGBA path generates one).
   */
  chain?:boolean;
  /** (e) the online opaque guard would draw this replacement opaque (guard on, original opaque, replacement not). */
  guarded:boolean;
  /**
   * Review F4: the original is drawn flipped on upload (`flipY`: a compressed upload never flips), or its colour space has
   * an sRGB transfer (WebGL2 would need WEBGL_compressed_texture_s3tc_srgb, which the probe never asks for).
   */
  flipY?:boolean;
  srgb?:boolean;
  /** (f) the kinds the page's device samples (`blockSupport`). */
  supported:ReadonlySet<BcKind>;
}
export type BlockDecision={ok:true;kind:BcKind}|{ok:false;reason:BlockRefusal};
const same=(a:Rgba,b:Rgba):boolean=>{
  if(a===b)return true;
  if(a.width!==b.width||a.height!==b.height||a.data.length!==b.data.length)return false;
  const x=a.data,y=b.data;for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;return true;
};
/**
 * Review F5: every alpha byte is 0 or 255 -- the only values `fullAlpha` leaves unchanged, so a payload's rescale is the
 * payload itself (condition (c) holds) exactly then.
 */
export function alphaUnscaled(r:Rgba):boolean{const d=r.data;for(let i=3;i<d.length;i+=4){const a=d[i];if(a!==0&&a!==255)return false;}return true;}
/** Whether a replacement may be uploaded as its blocks: every condition holds, or the first that does not. */
export function blockEligible(c:BlockCase):BlockDecision{
  if(c.entry.format!=='ktx2'||!c.blocks)return {ok:false,reason:'not-ktx2'};
  if(c.blocks.kind==='rgba8')return {ok:false,reason:'not-blocks'};
  const kind=c.blocks.kind;
  if(c.entry.placements!==undefined||c.keyPlaced)return {ok:false,reason:'placed'};
  const l0=c.blocks.levels[0];
  if(!l0||l0.width!==c.decoded.width||l0.height!==c.decoded.height||!same(c.decoded,c.rescaled))return {ok:false,reason:'not-exact'};
  if(c.flipped)return {ok:false,reason:'flipped'};
  if(c.mipped)return {ok:false,reason:'mipped'};
  if(c.minify)return {ok:false,reason:'minified'};
  if(c.chain&&!ktx2FullChain(c.blocks))return {ok:false,reason:'no-chain'};
  if(c.flipY)return {ok:false,reason:'flip-y'};
  if(c.srgb)return {ok:false,reason:'srgb'};
  if(c.guarded)return {ok:false,reason:'guarded'};
  if(!c.supported.has(kind))return {ok:false,reason:'unsupported'};
  if(l0.width%BC_BLOCK_EDGE_ADAPTATION||l0.height%BC_BLOCK_EDGE_ADAPTATION)return {ok:false,reason:'not-block-aligned'};
  return {ok:true,kind};
}

/**
 * What a texture takes on the block path: three's format constant and its levels -- level 0 alone (the original had no
 * chain), or, with `chain` (LATER 1137 (B)), every level the file carries (a full chain: `ktx2FullChain`).
 */
export interface BlockLevel {data:Uint8Array;width:number;height:number}
export interface BlockImage {kind:BcKind;format:number;width:number;height:number;mipmap:BlockLevel;levels:BlockLevel[]}
export function blockImage(img:Ktx2Image,chain=false):BlockImage{
  if(img.kind==='rgba8')throw new Error('KTX2: an RGBA payload has no blocks');
  const l0=img.levels[0]!;
  const levels=(chain?img.levels:[l0]).map((l)=>({data:l.data,width:l.width,height:l.height}));
  return {kind:img.kind,format:BC_THREE_FORMAT_ADAPTATION[img.kind],width:l0.width,height:l0.height,mipmap:levels[0]!,levels};
}

/**
 * LATER 1137 (B; product track, the main controller's pick under the owner's word, 2026-11-18): whether a KTX2 carries its
 * whole chain -- floor(log2(max edge)) + 1 levels, each the one above halved (floored, at least 1), each of its block size.
 */
export function ktx2FullChain(img:Ktx2Image):boolean{
  const n=Math.floor(Math.log2(Math.max(img.width,img.height)))+1;
  if(img.levels.length!==n)return false;
  return img.levels.every((l,i)=>l.width===Math.max(1,img.width>>i)&&l.height===Math.max(1,img.height>>i)&&l.data.length===ktx2LevelBytes(img.kind,l.width,l.height));
}
/** LATER 1137: the bytes a block-path texture holds with every level the file carries (the applied cap's count). */
export function blockChainGpuBytes(img:Ktx2Image):number{
  if(img.kind==='rgba8')throw new Error('KTX2: an RGBA payload has no blocks');
  let n=0;for(const l of img.levels)n+=ktx2LevelBytes(img.kind,l.width,l.height);return n;
}
/** The bytes a block-path texture holds on the GPU (level 0 only): what the applied cap counts for it. */
export function blockGpuBytes(kind:BcKind,width:number,height:number):number{return ktx2LevelBytes(kind,width,height);}
