import {describe,expect,it} from 'vitest';
import {RGBA_BPTC_Format,RGBA_S3TC_DXT1_Format,RGBA_S3TC_DXT3_Format,RGBA_S3TC_DXT5_Format} from 'three';
import {BC_KINDS,BC_THREE_FORMAT_ADAPTATION,blockChainGpuBytes,blockEligible,ktx2FullChain,pageBlockSupport,setPageBlockProbe,blockGpuBytes,blockImage,blockSupport,blocksOf,decodeKtx2,ktx2Level0Rgba,
  type BcKind,type BlockCase} from '../src/hdPackBlocks';
import {readKtx2,type Ktx2Image,type Ktx2Kind} from '../src/ktx2';
import * as blocksModule from '../src/hdPackBlocks';
/** Review F2/F3: the probe and its holder, read off the module (absent before the fold: those tests alone go red). */
const mod=blocksModule as unknown as {rendererBlockProbe:(r:{backend:unknown})=>blocksModule.BlockProbe|null;holdPageBlockProbe:(r:{backend:unknown;dispose():void})=>void};
import {ktx2Rgba,writeKtx2} from '../../../tools/hdPackKtx2';

/**
 * WM-PACK-2 RUNTIME (WM.R13; PRODUCT TRACK, a browser adaptation with no original): the pure half of the block path --
 * which entries may upload their KTX2's BC blocks, what the device samples, what the texture takes and what the cap
 * counts. The runtime's half is test/hdTexturePack.test.ts ("WM-PACK-2 runtime").
 */
/** One 8x8 BC1 image (four opaque four-colour blocks): its decode's alpha is 255 everywhere, so the rescale is identity. */
const bc1=():Uint8Array=>{
  const b=new Uint8Array(32);
  for(let i=0;i<4;i++){const o=i*8;b[o]=0x00;b[o+1]=0xf8-i;b[o+2]=0x1f+i;b[o+3]=0x00;b[o+4]=0x1b*(i+1);b[o+5]=0xe4;b[o+6]=0x55;b[o+7]=0xaa^i;}
  return b;
};
const image=(kind:Ktx2Kind,w=8,h=8,levels=1):Ktx2Image=>({kind,vkFormat:0,width:w,height:h,
  levels:Array.from({length:levels},(_,l)=>({width:Math.max(1,w>>l),height:Math.max(1,h>>l),data:new Uint8Array(kind==='bc1'?Math.max(1,(w>>l)/4)*Math.max(1,(h>>l)/4)*8:Math.max(1,(w>>l)/4)*Math.max(1,(h>>l)/4)*16)}))});
const rgba=(w:number,h:number,a=255)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4).map((_,i)=>(i&3)===3?a:i&0xff)});
const ALL:ReadonlySet<BcKind>=new Set(BC_KINDS);
/** Every condition holding: the block path. */
const base=():BlockCase=>{const d=rgba(8,8);return {entry:{format:'ktx2'},keyPlaced:false,blocks:image('bc1'),decoded:d,rescaled:{...d,data:new Uint8ClampedArray(d.data)},
  flipped:false,mipped:false,minify:false,guarded:false,supported:ALL};};

describe('WM-PACK-2 runtime: blockEligible, one condition at a time',()=>{
  it('takes the block path when every condition holds',()=>{
    expect(blockEligible(base())).toEqual({ok:true,kind:'bc1'});
    for(const k of BC_KINDS)expect(blockEligible({...base(),blocks:image(k)})).toEqual({ok:true,kind:k});
  });
  it('(a) an entry that is not ktx2, or a ktx2 with no blocks (rgba8): the RGBA path',()=>{
    expect(blockEligible({...base(),entry:{format:'png'}})).toEqual({ok:false,reason:'not-ktx2'});
    expect(blockEligible({...base(),entry:{format:'dds'}})).toEqual({ok:false,reason:'not-ktx2'});
    expect(blockEligible({...base(),blocks:undefined})).toEqual({ok:false,reason:'not-ktx2'});
    expect(blockEligible({...base(),blocks:image('rgba8')})).toEqual({ok:false,reason:'not-blocks'});
  });
  it('(b) an entry with placements, or a whole entry whose key has placements: the RGBA path',()=>{
    expect(blockEligible({...base(),entry:{format:'ktx2',placements:[{}]}})).toEqual({ok:false,reason:'placed'});
    expect(blockEligible({...base(),keyPlaced:true})).toEqual({ok:false,reason:'placed'});
  });
  it('(c) a decode the alpha rescale changes (or of another size than its blocks): the RGBA path',()=>{
    const c=base();c.rescaled.data[3]=254;
    expect(blockEligible(c)).toEqual({ok:false,reason:'not-exact'});
    expect(blockEligible({...base(),blocks:image('bc1',16,8)})).toEqual({ok:false,reason:'not-exact'});
  });
  it('(d) a flipped, mipped or minified original: the RGBA path',()=>{
    expect(blockEligible({...base(),flipped:true})).toEqual({ok:false,reason:'flipped'});
    expect(blockEligible({...base(),mipped:true})).toEqual({ok:false,reason:'mipped'});
    expect(blockEligible({...base(),minify:true})).toEqual({ok:false,reason:'minified'});
  });
  it('review F4: an original drawn flipY, or with an sRGB transfer: the RGBA path',()=>{
    expect(blockEligible({...base(),flipY:true} as BlockCase)).toEqual({ok:false,reason:'flip-y'});
    expect(blockEligible({...base(),srgb:true} as BlockCase)).toEqual({ok:false,reason:'srgb'});
  });
  it('(e) a replacement the online guard draws opaque: the RGBA path',()=>{
    expect(blockEligible({...base(),guarded:true})).toEqual({ok:false,reason:'guarded'});
  });
  it('(f) a kind the device does not sample, or an image not whole 4x4 blocks: the RGBA path',()=>{
    expect(blockEligible({...base(),supported:new Set()})).toEqual({ok:false,reason:'unsupported'});
    expect(blockEligible({...base(),blocks:image('bc7'),supported:new Set<BcKind>(['bc1','bc2','bc3'])})).toEqual({ok:false,reason:'unsupported'});
    const d=rgba(6,6);
    expect(blockEligible({...base(),blocks:image('bc1',6,6),decoded:d,rescaled:d})).toEqual({ok:false,reason:'not-block-aligned'});
  });
});

describe('WM-PACK-2 runtime: blockSupport',()=>{
  it('no probe: nothing (the RGBA path)',()=>{expect([...blockSupport(null)]).toEqual([]);expect([...blockSupport(undefined)]).toEqual([]);});
  it('WebGPU: all four kinds with texture-compression-bc, none without',()=>{
    expect([...blockSupport({backend:'webgpu',hasFeature:n=>n==='texture-compression-bc'})]).toEqual(['bc1','bc2','bc3','bc7']);
    expect([...blockSupport({backend:'webgpu',hasFeature:()=>false})]).toEqual([]);
  });
  it('WebGL2: BC1-3 with WEBGL_compressed_texture_s3tc, BC7 with EXT_texture_compression_bptc',()=>{
    expect([...blockSupport({backend:'webgl',hasExtension:n=>n==='WEBGL_compressed_texture_s3tc'})]).toEqual(['bc1','bc2','bc3']);
    expect([...blockSupport({backend:'webgl',hasExtension:n=>n==='EXT_texture_compression_bptc'})]).toEqual(['bc7']);
    expect([...blockSupport({backend:'webgl',hasExtension:()=>true})]).toEqual(['bc1','bc2','bc3','bc7']);
  });
});

describe('WM-PACK-2 runtime: what the texture takes, and what the cap counts',()=>{
  it('blockImage: three\'s format constant per kind and level 0 alone',()=>{
    expect(BC_THREE_FORMAT_ADAPTATION).toEqual({bc1:RGBA_S3TC_DXT1_Format,bc2:RGBA_S3TC_DXT3_Format,bc3:RGBA_S3TC_DXT5_Format,bc7:RGBA_BPTC_Format});
    const k=readKtx2(writeKtx2('bc1',8,8,[bc1(),new Uint8Array(8),new Uint8Array(8),new Uint8Array(8)])),b=blockImage(k);
    expect(b).toMatchObject({kind:'bc1',format:RGBA_S3TC_DXT1_Format,width:8,height:8,mipmap:{width:8,height:8}});
    expect(Array.from(b.mipmap.data)).toEqual(Array.from(bc1()));
    expect(()=>blockImage(image('rgba8'))).toThrow(/no blocks/);
  });
  it('blockGpuBytes: 8 bytes a 4x4 block for BC1, 16 for BC2/BC3/BC7 -- not 4 a texel',()=>{
    expect(blockGpuBytes('bc1',8,8)).toBe(32);
    for(const k of ['bc2','bc3','bc7'] as const)expect(blockGpuBytes(k,8,8)).toBe(64);
    expect(blockGpuBytes('bc7',1024,512)).toBe(1024*512);expect(blockGpuBytes('bc1',1024,512)).toBe(1024*512/2);
  });
  it('decodeKtx2: level 0 decoded by dds.ts as the converter\'s check decodes it, the blocks held beside it',()=>{
    const bytes=writeKtx2('bc1',8,8,[bc1()]),r=decodeKtx2(bytes,{width:8,height:8});
    expect(Array.from(r.data)).toEqual(Array.from(ktx2Rgba(bytes)));
    expect(blocksOf(r)?.kind).toBe('bc1');expect(Array.from(blocksOf(r)!.levels[0]!.data)).toEqual(Array.from(bc1()));
    expect(Array.from(ktx2Level0Rgba(readKtx2(bytes)))).toEqual(Array.from(r.data));
    expect(()=>decodeKtx2(bytes,{width:16,height:8})).toThrow(/the entry says 16x8/);
    expect(blocksOf({width:1,height:1,data:new Uint8ClampedArray(4)})).toBeUndefined();
  });
});

describe("WM-PACK-2 runtime: the page renderer's probe",()=>{
  type R=Parameters<typeof mod.rendererBlockProbe>[0];
  it("reads WebGPU's device features or enables WebGL2's extensions (review F2: a light module, not renderer.ts)",()=>{
    const gpu={backend:{isWebGPUBackend:true,device:{features:new Set(['texture-compression-bc'])}}} as unknown as R;
    expect([...blockSupport(mod.rendererBlockProbe(gpu))]).toEqual(['bc1','bc2','bc3','bc7']);
    const asked:string[]=[],gl={backend:{extensions:{get:(n:string)=>{asked.push(n);return n==='WEBGL_compressed_texture_s3tc'?{}:null;}}}} as unknown as R;
    expect([...blockSupport(mod.rendererBlockProbe(gl))]).toEqual(['bc1','bc2','bc3']);expect(asked).toContain('EXT_texture_compression_bptc');
    expect(mod.rendererBlockProbe({backend:{}} as unknown as R)).toBeNull();
    expect([...pageBlockSupport()]).toEqual([]);
    setPageBlockProbe(mod.rendererBlockProbe(gl));expect([...pageBlockSupport()]).toEqual(['bc1','bc2','bc3']);
    setPageBlockProbe(null);expect([...pageBlockSupport()]).toEqual([]);
  });
  it("review F3: the page's probe is the renderer holding it; its dispose clears it only while it still holds it",()=>{
    const made=(backend:object)=>{let disposed=0;const r={backend,dispose:()=>{disposed++;}};return {r:r as unknown as R&{dispose():void},disposed:()=>disposed};};
    const gl=made({extensions:{get:(n:string)=>n==='WEBGL_compressed_texture_s3tc'?{}:null}}),gpu=made({isWebGPUBackend:true,device:{features:new Set(['texture-compression-bc'])}});
    mod.holdPageBlockProbe(gl.r);expect([...pageBlockSupport()]).toEqual(['bc1','bc2','bc3']);
    mod.holdPageBlockProbe(gpu.r);expect([...pageBlockSupport()]).toEqual(['bc1','bc2','bc3','bc7']);
    gl.r.dispose();expect(gl.disposed()).toBe(1);expect([...pageBlockSupport()]).toEqual(['bc1','bc2','bc3','bc7']);   // not the holder: kept
    gpu.r.dispose();expect(gpu.disposed()).toBe(1);expect([...pageBlockSupport()]).toEqual([]);                      // the holder: cleared
  });
  it('re-review: the wrapped dispose returns three\'s own (async) dispose, resolving and rejecting with it',async()=>{
    const done=Promise.resolve('torn down'),failed=Promise.reject(new Error('backend failed'));failed.catch(()=>undefined);
    const ok={backend:{},dispose:()=>done},bad={backend:{},dispose:()=>failed};
    mod.holdPageBlockProbe(ok as unknown as Parameters<typeof mod.holdPageBlockProbe>[0]);
    mod.holdPageBlockProbe(bad as unknown as Parameters<typeof mod.holdPageBlockProbe>[0]);
    const r=(ok as {dispose():unknown}).dispose();expect(r).toBe(done);await expect(r).resolves.toBe('torn down');
    const s=(bad as {dispose():unknown}).dispose();expect(s).toBe(failed);await expect(s).rejects.toThrow('backend failed');
  });
});

/**
 * LATER 1137 (B; product track: the main controller's pick under the owner's word, 2026-11-18): a replacement that needs a
 * chain (opaque, larger than its unmipped bilinear world original) keeps the block path only when its KTX2 carries every
 * level down to 1x1 -- those levels go up as they are (no BC encoder here to generate them); else the RGBA path generates.
 */
describe('LATER 1137: a full BC chain in the file',()=>{
  it('ktx2FullChain: every level from level 0 down to 1x1, each halved (floored, at least 1), each of its block size',()=>{
    expect(ktx2FullChain(image('bc1',8,8,4))).toBe(true);
    expect(ktx2FullChain(image('bc7',16,8,5))).toBe(true);
    expect(ktx2FullChain(image('bc1',8,8,1))).toBe(false);
    expect(ktx2FullChain(image('bc1',8,8,3))).toBe(false);
    const bad=image('bc1',8,8,4);bad.levels[2]={...bad.levels[2]!,width:3};expect(ktx2FullChain(bad)).toBe(false);
    const short=image('bc1',8,8,4);short.levels[1]={...short.levels[1]!,data:new Uint8Array(4)};expect(ktx2FullChain(short)).toBe(false);
  });
  it("blockEligible: a chain needed and the file's full: blocks; needed and not full: the RGBA path ('no-chain'); not needed: as before",()=>{
    expect(blockEligible({...base(),blocks:image('bc1',8,8,4),chain:true})).toEqual({ok:true,kind:'bc1'});
    expect(blockEligible({...base(),blocks:image('bc1',8,8,1),chain:true})).toEqual({ok:false,reason:'no-chain'});
    expect(blockEligible({...base(),blocks:image('bc1',8,8,1),chain:false})).toEqual({ok:true,kind:'bc1'});
  });
  it('blockImage with the chain: every level; the cap counts every level',()=>{
    const img=image('bc1',8,8,4);
    expect(blockImage(img,true).levels.map((l)=>[l.width,l.height])).toEqual([[8,8],[4,4],[2,2],[1,1]]);
    expect(blockImage(img).levels.length).toBe(1);
    expect(blockChainGpuBytes(img)).toBe(32+8+8+8);
    expect(blockChainGpuBytes(image('bc1',8,8,1))).toBe(blockGpuBytes('bc1',8,8));
  });
});
