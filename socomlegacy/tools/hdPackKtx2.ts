import {ddsInfo,decodeDds} from '../packages/viewer/src/dds';
import {KTX2_IDENTIFIER,KTX2_VK,ktx2LevelBytes,readKtx2,type Ktx2Kind} from '../packages/viewer/src/ktx2';

/**
 * WM-PACK-2 (b), WM.R13 (product track: a tool). The owner, verbatim: "we do not need to maintian the dds. we can just
 * have a reader and converter in repo". A DDS payload of the HD pack to a KTX2 (`../packages/viewer/src/ktx2.ts`):
 * its BC1 / BC2 / BC3 / BC7 blocks copied byte for byte, every level the file holds (a chain cut short keeps the levels
 * it has; none is made); an uncompressed DDS (RGBA or BGRA masks) stored as the R8G8B8A8 its decode gives, level 0.
 * Nothing is re-encoded, so nothing is lost: `ktx2Rgba` decodes the KTX2 with the same `dds.ts` block decoders, and the
 * tests and the box check (`./hd-pack-ktx2.ts`) hold it equal to the DDS's decode.
 * The data format descriptor (Khronos Data Format 1.3, basic block): BC1A 128, BC2 129, BC3 130, BC7 134, RGBSDA 1;
 * BT.709 primaries, linear transfer, straight alpha. Read alike by three's `ktx-parse` (the test); `ktx validate` not run.
 */
const MODEL:Record<Ktx2Kind,number>={bc1:128,bc2:129,bc3:130,bc7:134,rgba8:1};
/** Each sample: bit offset, bit length, channel id (BC2/BC3/RGBA 15 = alpha; BC1A 1 = alpha), upper value. */
const SAMPLES:Record<Ktx2Kind,[number,number,number,number][]>={
  bc1:[[0,64,1,0xffffffff]],                        // BC1A: its one sample is the alpha channel (1), vkFormat 133
  bc2:[[0,64,15,0xffffffff],[64,64,0,0xffffffff]],
  bc3:[[0,64,15,0xffffffff],[64,64,0,0xffffffff]],
  bc7:[[0,128,0,0xffffffff]],
  rgba8:[[0,8,0,255],[8,8,1,255],[16,8,2,255],[24,8,15,255]],
};
function dfd(kind:Ktx2Kind):Uint8Array{
  const s=SAMPLES[kind],size=24+16*s.length,b=new Uint8Array(4+size),v=new DataView(b.buffer);
  v.setUint32(0,b.length,true);v.setUint32(4,0,true);v.setUint16(8,2,true);v.setUint16(10,size,true);
  b[12]=MODEL[kind];b[13]=1;b[14]=1;b[15]=0;
  if(kind!=='rgba8'){b[16]=3;b[17]=3;}
  b[20]=kind==='rgba8'?4:kind==='bc1'?8:16;
  s.forEach(([off,len,ch,upper],i)=>{const o=28+16*i;v.setUint16(o,off,true);b[o+2]=len-1;b[o+3]=ch;v.setUint32(o+8,0,true);v.setUint32(o+12,upper,true);});
  return b;
}
const align=(n:number,a:number)=>Math.ceil(n/a)*a;

export function writeKtx2(kind:Ktx2Kind,width:number,height:number,levels:readonly Uint8Array[]):Uint8Array{
  const d=dfd(kind),dfdAt=80+levels.length*24,dataAt=align(dfdAt+d.length,16);
  // Level data smallest first (the KTX2 layout), each at a 16-byte boundary; the index lists level 0 first.
  const at:number[]=new Array(levels.length);let end=dataAt;
  for(let l=levels.length-1;l>=0;l--){end=align(end,16);at[l]=end;end+=levels[l]!.length;}
  const b=new Uint8Array(end),v=new DataView(b.buffer);b.set(KTX2_IDENTIFIER);
  [KTX2_VK[kind],1,width,height,0,0,1,levels.length,0].forEach((x,i)=>v.setUint32(12+4*i,x,true));
  v.setUint32(48,dfdAt,true);v.setUint32(52,d.length,true);
  levels.forEach((lv,l)=>{const o=80+l*24;v.setUint32(o,at[l]!,true);v.setUint32(o+8,lv.length,true);v.setUint32(o+16,lv.length,true);b.set(lv,at[l]!);});
  b.set(d,dfdAt);
  return b;
}

/** The DDS's levels as KTX2: the blocks as they are; an uncompressed DDS as its decoded RGBA (level 0). */
export function ddsToKtx2(dds:Uint8Array):Uint8Array{
  const info=ddsInfo(dds);
  if(info.kind==='rgba'||info.kind==='bgra'){const r=decodeDds(dds);return writeKtx2('rgba8',r.width,r.height,[new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength)]);}
  const kind=info.kind as Ktx2Kind,v=new DataView(dds.buffer,dds.byteOffset,dds.byteLength);
  const claimed=(v.getUint32(8,true)&0x20000)?Math.max(1,v.getUint32(28,true)):1,levels:Uint8Array[]=[];
  let at=info.offset;
  for(let l=0;l<claimed;l++){
    const w=Math.max(1,info.width>>l),h=Math.max(1,info.height>>l),n=ktx2LevelBytes(kind,w,h);
    if(at+n>dds.length)break;
    levels.push(dds.slice(at,at+n));at+=n;
    if(w===1&&h===1)break;
  }
  if(!levels.length)throw new Error('DDS: truncated image data');
  return writeKtx2(kind,info.width,info.height,levels);
}

const FOURCC:Record<Exclude<Ktx2Kind,'rgba8'|'bc7'>,string>={bc1:'DXT1',bc2:'DXT3',bc3:'DXT5'};
/** A KTX2's level 0 as RGBA, through the same `dds.ts` decoders (its blocks wrapped in a DDS header). */
export function ktx2Rgba(k:Uint8Array):Uint8ClampedArray{
  const img=readKtx2(k),l0=img.levels[0]!;
  if(img.kind==='rgba8')return new Uint8ClampedArray(l0.data);
  const dx10=img.kind==='bc7',off=dx10?148:128,b=new Uint8Array(off+l0.data.length),v=new DataView(b.buffer);
  b.set([0x44,0x44,0x53,0x20]);v.setUint32(4,124,true);v.setUint32(8,0x1007,true);v.setUint32(12,img.height,true);v.setUint32(16,img.width,true);
  v.setUint32(76,32,true);v.setUint32(80,4,true);
  const fc=dx10?'DX10':FOURCC[img.kind as keyof typeof FOURCC];for(let i=0;i<4;i++)b[84+i]=fc.charCodeAt(i);
  if(dx10){v.setUint32(128,98,true);v.setUint32(132,3,true);v.setUint32(140,1,true);}
  b.set(l0.data,off);
  return decodeDds(b).data;
}
