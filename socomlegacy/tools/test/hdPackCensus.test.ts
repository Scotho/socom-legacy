import {describe,expect,it} from 'vitest';
import {decodeDds} from '../../packages/viewer/src/dds';
import {fullAlpha,validateHdManifest,type HdEntry} from '../../packages/viewer/src/hdTexturePack';
import {bc3AlphaPalette,bc3RescaleExact,censusMarkdown,packCensus,payloadCensus} from '../hdPackCensus';

/**
 * WM-PACK-2 (a), product track (a tool; nothing a player runs): the HD pack's census -- for every payload its format,
 * levels, alpha and whether the GPU could take its blocks as they are and draw exactly what today's decode draws
 * (`fullAlpha`, hdTexturePack.ts). Synthetic DDS files built here; no pack, no disc.
 */
function dds(w:number,h:number,four:string,blocks:Uint8Array,mips=1):Uint8Array{
  const b=new Uint8Array(128+blocks.length),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
  v.setUint32(4,124,true);v.setUint32(8,0x1007|(mips>1?0x20000:0),true);v.setUint32(12,h,true);v.setUint32(16,w,true);
  v.setUint32(28,mips,true);v.setUint32(76,32,true);v.setUint32(80,4,true);for(let i=0;i<4;i++)b[84+i]=four.charCodeAt(i);
  b.set(blocks,128);return b;
}
/** One BC1 colour block: two 565 colours and 2-bit indices; c0 > c1 is four-colour (opaque), else a transparent index 3. */
const bc1=(c0:number,c1:number,idx:number)=>Uint8Array.from([c0&255,c0>>8,c1&255,c1>>8,idx&255,(idx>>8)&255,(idx>>16)&255,idx>>>24]);
/** One BC3 block: the alpha endpoints, 16 3-bit indices, then an opaque BC1-style colour block. */
function bc3(a0:number,a1:number,ix:number[]):Uint8Array{
  let lo=0,hi=0;for(let i=0;i<8;i++){lo|=ix[i]!<<(3*i);hi|=ix[i+8]!<<(3*i);}
  return Uint8Array.from([a0,a1,lo&255,(lo>>8)&255,(lo>>16)&255,hi&255,(hi>>8)&255,(hi>>16)&255,...bc1(0xf800,0x001f,0x1b1b1b1b)]);
}
const bc2=(nibbles:number[])=>{const a=new Uint8Array(8);nibbles.forEach((n,i)=>{a[i>>1]!|=n<<((i&1)*4);});return Uint8Array.from([...a,...bc1(0xf800,0x001f,0)]);};
let seed=11;const rnd=()=>(seed=(seed*1103515245+12345)>>>0)>>>24;

describe('the HD pack census (WM-PACK-2 a)',()=>{
  it('reads BC3 alpha blocks exactly as dds.ts decodes them (2,000 random blocks, both modes)',()=>{
    for(let n=0;n<2000;n++){
      const a0=rnd(),a1=rnd(),ix=Array.from({length:16},()=>rnd()&7),blk=bc3(a0,a1,ix);
      const pal=bc3AlphaPalette(a0,a1),got=decodeDds(dds(4,4,'DXT5',blk)).data;
      for(let i=0;i<16;i++)expect(got[i*4+3]).toBe(pal[ix[i]!]);
    }
  });
  it('keeps a BC3 block only when its rescaled endpoints decode to fullAlpha of every texel',()=>{
    // 0 and 128 endpoints: the rescale maps them to 0 and 255; every index then checked against fullAlpha.
    for(const [a0,a1] of [[128,0],[0,128],[64,32],[255,200],[128,128],[129,128]] as const){
      const ix=Array.from({length:16},(_,i)=>i&7),blk=bc3(a0,a1,ix);
      const want=fullAlpha(decodeDds(dds(4,4,'DXT5',blk)).data),rescaled=bc3(Math.min(255,Math.round(a0*255/128)),Math.min(255,Math.round(a1*255/128)),ix);
      const after=decodeDds(dds(4,4,'DXT5',rescaled)).data;
      let same=true;for(let i=0;i<16;i++)if(after[i*4+3]!==want[i*4+3])same=false;
      expect(bc3RescaleExact(blk,0),`${a0},${a1}`).toBe(same);
    }
  });
  it('censuses one payload: format, size, levels, alpha range, opaque after the rescale, exact as blocks',()=>{
    const op=payloadCensus('0.dds',dds(8,4,'DXT1',Uint8Array.from([...bc1(0xf800,0x001f,0),...bc1(0xffff,0,0x55555555)]),1));
    expect(op).toMatchObject({file:'0.dds',kind:'bc1',width:8,height:4,levels:1,alphaMin:255,alphaMax:255,opaque:true,exact:true,gpuBytes:16,rgbaBytes:128});
    const cut=payloadCensus('1.dds',dds(4,4,'DXT1',bc1(0x001f,0xf800,0xffffffff),3));   // c0 <= c1: index 3 transparent
    expect(cut).toMatchObject({kind:'bc1',levels:3,alphaMin:0,alphaMax:0,opaque:false,exact:true});
    expect(payloadCensus('2.dds',dds(4,4,'DXT5',bc3(128,0,Array(16).fill(0))))).toMatchObject({kind:'bc3',alphaMax:128,opaque:true,exact:true});
    expect(payloadCensus('3.dds',dds(4,4,'DXT5',bc3(64,32,Array(16).fill(3))))).toMatchObject({kind:'bc3',opaque:false,exact:false});
    expect(payloadCensus('4.dds',dds(4,4,'DXT3',bc2(Array(16).fill(15))))).toMatchObject({kind:'bc2',alphaMin:255,exact:true,opaque:true});
    expect(payloadCensus('5.dds',dds(4,4,'DXT3',bc2(Array(16).fill(8))))).toMatchObject({kind:'bc2',alphaMax:136,exact:false,opaque:true});
  });
  it('censuses a pack: per format, the paths each entry would take, the GPU bytes either way',()=>{
    const files=new Map<string,Uint8Array>([
      ['0.dds',dds(4,4,'DXT1',bc1(0xf800,0x001f,0))],['1.dds',dds(4,4,'DXT5',bc3(64,32,Array(16).fill(3)))],['2.dds',dds(8,8,'DXT1',new Uint8Array(32))],
    ]);
    const k=(n:number)=>n.toString(16).padStart(64,'0');
    const e=(key:number,file:string,w:number,over:Partial<HdEntry>={}):HdEntry=>({key:k(key),width:4,height:4,file,format:'dds',outWidth:w,outHeight:w,bytes:w*w*4,sha256:k(100+parseInt(file)),tier:'A',source:`s${key}.dds`,...over});
    const m=validateHdManifest({format:'s2u-hd-texture-pack',version:1,localOnly:true,game:'SCUS-97275',name:'t',method:'t',entries:[
      e(1,'0.dds',4),e(2,'1.dds',4),
      e(3,'2.dds',8,{placements:[{dst:[0,0,2,2],src:[0,0,4,4]}],placementKind:'crop'}),            // over the original
      // Over a whole: drawn at the WHOLE's scale (drawPlacementsSteps, out.width/width), not the placement's own.
      e(4,'0.dds',4),e(4,'2.dds',8,{placements:[{dst:[0,0,4,4],src:[4,4,4,4]}],placementKind:'crop'}),  // scale 1, 4x4 into 4x4: aligned
      e(5,'0.dds',4),e(5,'2.dds',8,{placements:[{dst:[0,0,2,2],src:[4,4,4,4]}],placementKind:'crop'}),  // scale 1, 4x4 averaged into 2x2: not
      e(6,'2.dds',8),e(6,'2.dds',8,{placements:[{dst:[0,0,2,2],src:[0,0,4,4]}],placementKind:'crop'}),  // scale 2, 4x4 into 4x4: aligned
    ],totalBytes:4*4*4+4*4*4+8*8*4});
    const c=packCensus(m,f=>files.get(f)!);
    expect(c.payloads.length).toBe(3);
    expect(c.byKind).toEqual([{kind:'bc1',payloads:2,exact:2,opaque:2,gpuBytes:8+32,rgbaBytes:64+256},{kind:'bc3',payloads:1,exact:0,opaque:0,gpuBytes:16,rgbaBytes:64}]);
    expect(c.entries).toEqual({total:9,whole:5,wholeExact:4,placementOverOriginal:1,placementOverWhole:3,placementAligned:2});
    expect(c.gpu).toEqual({compressedWhereExact:8+64+32,allRgba:64+64+256});
    expect(censusMarkdown(c)).toContain('| bc1 | 2 | 2 | 2 |');
  });
});
