/**
 * WM-PACK-2 (b), WM.R13 (plan 2026-11-14-weekend-mega; product track, a browser adaptation with no original): the HD
 * pack's KTX2 payloads read -- the subset its converter (`tools/hdPackKtx2.ts`) writes: one 2D image, one layer, one
 * face, no supercompression, its levels in BC1 / BC2 / BC3 / BC7 blocks or 8-bit RGBA, all UNORM (the runtime reads
 * every texture with no colour space, `world.ts` `makeTexture`). Anything else is refused, with why. Nothing at run
 * time imports this yet: the runtime paths wait on the census and the main controller's word (8f, 2026-11-15).
 * KTX 2.0 (Khronos): a 12-byte identifier, nine u32 header fields, the index (DFD, KVD, SGD), then one
 * (offset, length, uncompressed length) u64 triple per level, level 0 first.
 */
export const KTX2_VK={bc1:133,bc2:135,bc3:137,bc7:145,rgba8:37} as const;
export type Ktx2Kind=keyof typeof KTX2_VK;
export interface Ktx2Level {width:number;height:number;data:Uint8Array}
export interface Ktx2Image {kind:Ktx2Kind;vkFormat:number;width:number;height:number;levels:Ktx2Level[]}
export class Ktx2Error extends Error {constructor(m:string){super(`KTX2: ${m}`);this.name='Ktx2Error';}}
export const KTX2_IDENTIFIER=Uint8Array.from([0xab,0x4b,0x54,0x58,0x20,0x32,0x30,0xbb,0x0d,0x0a,0x1a,0x0a]);
const KIND_OF=new Map<number,Ktx2Kind>(Object.entries(KTX2_VK).map(([k,v])=>[v,k as Ktx2Kind]));

/** A level's byte size: 4x4 blocks of 8 (BC1) or 16 bytes, or 4 bytes a texel. */
export function ktx2LevelBytes(kind:Ktx2Kind,width:number,height:number):number{
  return kind==='rgba8'?width*height*4:Math.ceil(width/4)*Math.ceil(height/4)*(kind==='bc1'?8:16);
}

export function readKtx2(b:Uint8Array):Ktx2Image{
  if(b.length<80||KTX2_IDENTIFIER.some((x,i)=>b[i]!==x))throw new Ktx2Error('not a KTX2 file');
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength),u32=(o:number)=>v.getUint32(o,true);
  const u64=(o:number)=>{const hi=u32(o+4);if(hi)throw new Ktx2Error('an offset past 4 GiB');return u32(o);};
  const vkFormat=u32(12),width=u32(20),height=u32(24),depth=u32(28),layers=u32(32),faces=u32(36),levelCount=u32(40),sc=u32(44);
  const kind=KIND_OF.get(vkFormat);
  if(!kind)throw new Ktx2Error(`vkFormat ${vkFormat} is not a format the pack uses`);
  if(sc!==0)throw new Ktx2Error(`supercompression ${sc} is not read here`);
  if(!width||!height||width>16384||height>16384)throw new Ktx2Error(`size ${width}x${height} out of bounds`);
  if(depth!==0||layers!==0||faces!==1)throw new Ktx2Error('not one 2D image');
  if(levelCount<1||levelCount>15||(Math.max(width,height)>>(levelCount-1))<1)throw new Ktx2Error(`level count ${levelCount} not 1 to a full chain`);
  if(b.length<80+levelCount*24)throw new Ktx2Error('truncated level index');
  const levels:Ktx2Level[]=[];
  for(let l=0;l<levelCount;l++){
    const at=80+l*24,offset=u64(at),length=u64(at+8),w=Math.max(1,width>>l),h=Math.max(1,height>>l),want=ktx2LevelBytes(kind,w,h);
    if(length!==want||u64(at+16)!==want)throw new Ktx2Error(`level ${l} is ${length} bytes, its size says ${want}`);
    if(offset+length>b.length)throw new Ktx2Error(`level ${l} runs past the end of the file`);
    levels.push({width:w,height:h,data:b.subarray(offset,offset+length)});
  }
  return {kind,vkFormat,width,height,levels};
}
