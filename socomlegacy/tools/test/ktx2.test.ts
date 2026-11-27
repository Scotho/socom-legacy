import {describe,expect,it} from 'vitest';
import {decodeDds} from '../../packages/viewer/src/dds';
import {readKtx2,Ktx2Error,KTX2_VK} from '../../packages/viewer/src/ktx2';
import {ddsToKtx2,ktx2Rgba} from '../hdPackKtx2';

/**
 * WM-PACK-2 (b), WM.R13 (product track: a reader, a converter and their tests; nothing a player runs). The owner,
 * verbatim: "we do not need to maintian the dds. we can just have a reader and converter in repo". The converter
 * copies a DDS's blocks into a KTX2 byte for byte; this file holds that the KTX2 decodes to the very RGBA its DDS
 * decodes to (`dds.ts`), level by level, for every format the pack uses. Synthetic payloads; no pack.
 */
let seed=5;const rnd=()=>(seed=(seed*1103515245+12345)>>>0)>>>24;
const bytes=(n:number)=>Uint8Array.from({length:n},rnd);
const blk=(k:string)=>k==='DXT1'?8:16;
function levelBytes(w:number,h:number,four:string,levels:number){let t=0;for(let l=0;l<levels;l++){const lw=Math.max(1,w>>l),lh=Math.max(1,h>>l);t+=Math.ceil(lw/4)*Math.ceil(lh/4)*blk(four);}return t;}
/** A legacy DDS (FourCC) or, for BC7, a DX10 header (DXGI 98), with `levels` levels of random blocks. */
function dds(w:number,h:number,four:'DXT1'|'DXT3'|'DXT5'|'BC7',levels=1):Uint8Array{
  const dx10=four==='BC7',off=dx10?148:128,data=bytes(levelBytes(w,h,four==='BC7'?'BC7':four,levels));
  const b=new Uint8Array(off+data.length),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
  v.setUint32(4,124,true);v.setUint32(8,0x1007|(levels>1?0x20000:0),true);v.setUint32(12,h,true);v.setUint32(16,w,true);
  v.setUint32(28,levels,true);v.setUint32(76,32,true);v.setUint32(80,4,true);
  const fc=dx10?'DX10':four;for(let i=0;i<4;i++)b[84+i]=fc.charCodeAt(i);
  if(dx10){v.setUint32(128,98,true);v.setUint32(132,3,true);v.setUint32(140,1,true);}
  b.set(data,off);return b;
}
/** An uncompressed 32-bit DDS, RGBA or BGRA masks, with or without the alpha flag. */
function ddsRgb(w:number,h:number,order:'rgba'|'bgra',alpha:boolean):Uint8Array{
  const b=new Uint8Array(128+w*h*4),v=new DataView(b.buffer);b.set([0x44,0x44,0x53,0x20]);
  v.setUint32(4,124,true);v.setUint32(8,0x100f,true);v.setUint32(12,h,true);v.setUint32(16,w,true);v.setUint32(76,32,true);
  v.setUint32(80,0x40|(alpha?1:0),true);v.setUint32(88,32,true);
  const [r,bl]=order==='rgba'?[0xff,0xff0000]:[0xff0000,0xff];v.setUint32(92,r,true);v.setUint32(96,0xff00,true);v.setUint32(100,bl,true);v.setUint32(104,alpha?0xff000000:0,true);
  b.set(bytes(w*h*4),128);return b;
}

describe('the KTX2 reader and the DDS converter (WM-PACK-2 b)',()=>{
  for(const [four,kind] of [['DXT1','bc1'],['DXT3','bc2'],['DXT5','bc3'],['BC7','bc7']] as const){
    it(`${kind}: the blocks copied byte for byte, decoding to the DDS's RGBA (odd sizes, whole chains)`,()=>{
      for(const [w,h,levels] of [[4,4,1],[6,10,1],[64,32,7],[16,16,3]] as const){
        const src=dds(w,h,four,levels),k=ddsToKtx2(src),img=readKtx2(k);
        expect(img).toMatchObject({kind,vkFormat:KTX2_VK[kind],width:w,height:h});
        expect(img.levels.length).toBe(levels);
        let at=four==='BC7'?148:128;
        img.levels.forEach((lv,l)=>{
          expect([lv.width,lv.height]).toEqual([Math.max(1,w>>l),Math.max(1,h>>l)]);
          const n=Math.ceil(lv.width/4)*Math.ceil(lv.height/4)*blk(four==='BC7'?'BC7':four);
          expect(lv.data).toEqual(src.subarray(at,at+n));at+=n;
        });
        expect(ktx2Rgba(k)).toEqual(decodeDds(src).data);
      }
    });
  }
  it('rgba and bgra DDS: stored as R8G8B8A8, the very RGBA the decoder gives (the padding byte opaque without the alpha flag)',()=>{
    for(const order of ['rgba','bgra'] as const)for(const alpha of [true,false]){
      const src=ddsRgb(6,3,order,alpha),img=readKtx2(ddsToKtx2(src));
      expect(img).toMatchObject({kind:'rgba8',vkFormat:KTX2_VK.rgba8,width:6,height:3});
      expect(img.levels[0]!.data).toEqual(new Uint8Array(decodeDds(src).data.buffer));
      expect(ktx2Rgba(ddsToKtx2(src))).toEqual(decodeDds(src).data);
    }
  });
  it('drops no level and invents none: a chain cut short in the file keeps the levels it has',()=>{
    const full=dds(16,16,'DXT1',5),cut=full.subarray(0,128+levelBytes(16,16,'DXT1',3));
    expect(readKtx2(ddsToKtx2(cut)).levels.length).toBe(3);
  });
  it('refuses what it cannot read exactly',()=>{
    const k=ddsToKtx2(dds(8,8,'DXT5'));
    const bad=(f:(b:Uint8Array,v:DataView)=>void)=>{const b=k.slice(),v=new DataView(b.buffer);f(b,v);return ()=>readKtx2(b);};
    expect(bad(b=>{b[1]=0;})).toThrow(Ktx2Error);                                  // not the identifier
    expect(bad((_,v)=>v.setUint32(44,2,true))).toThrow(/supercompression/);          // zstd: not read here
    expect(bad((_,v)=>v.setUint32(12,999,true))).toThrow(/format/);                  // an unknown vkFormat
    expect(()=>readKtx2(k.subarray(0,k.length-1))).toThrow(/level/);                 // a level past the end
  });
  it('is read alike by an independent reader (three\'s ktx-parse): format, size, levels, the data descriptor',async()=>{
    const {read}=await import('three/examples/jsm/libs/ktx-parse.module.js' as string) as {read:(b:Uint8Array)=>{vkFormat:number;pixelWidth:number;pixelHeight:number;levels:{levelData:Uint8Array}[];dataFormatDescriptor:{colorModel:number;bytesPlane:number[];texelBlockDimension:number[];samples:{channelType:number}[]}[]}};
    // Channel ids (Khronos Data Format 1.3): BC1A's one sample is its alpha channel (1) -- vkFormat 133 is BC1 with alpha;
    // BC2/BC3 alpha (15) then colour (0); BC7 colour (0); RGBA8 R G B A (0 1 2 15).
    for(const [src,model,plane,block,channels] of [[dds(64,32,'DXT1',7),128,8,[3,3,0,0],[1]],[dds(8,8,'DXT5'),130,16,[3,3,0,0],[15,0]],[dds(8,8,'BC7'),134,16,[3,3,0,0],[0]],[ddsRgb(4,4,'bgra',true),1,4,[0,0,0,0],[0,1,2,15]]] as const){
      const k=ddsToKtx2(src),ours=readKtx2(k),theirs=read(k);
      expect([theirs.vkFormat,theirs.pixelWidth,theirs.pixelHeight,theirs.levels.length]).toEqual([ours.vkFormat,ours.width,ours.height,ours.levels.length]);
      theirs.levels.forEach((l,i)=>expect(new Uint8Array(l.levelData)).toEqual(ours.levels[i]!.data));
      const d=theirs.dataFormatDescriptor[0]!;
      expect([d.colorModel,d.bytesPlane[0],[...d.texelBlockDimension],d.samples.map(x=>x.channelType)]).toEqual([model,plane,[...block],[...channels]]);
    }
  });
});
