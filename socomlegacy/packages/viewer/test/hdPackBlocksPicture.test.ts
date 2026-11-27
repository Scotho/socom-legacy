import {describe,expect,it} from 'vitest';
import {HD_BLOCK_DECODE_TOLERANCE_ADAPTATION,ktx2Level0Rgba} from '../src/hdPackBlocks';
import * as picture from '../e2e/hdPackBlocksPicture';

/**
 * WM-PACK-2 RUNTIME (a test instrument, product track; no original): the browser check's bound, and its picture mode's
 * pure parts -- a SYNTHETIC strong-gradient texture hand-encoded as BC1 and BC3 blocks (no HD pack on the box), the
 * amplified difference image and the side-by-side composite the owner's board reads.
 */
const p=picture as unknown as {
  gradientBlocks:(kind:'bc1'|'bc3',w:number,h:number)=>Uint8Array;
  amplifiedDiff:(a:ArrayLike<number>,b:ArrayLike<number>,gain?:number)=>Uint8ClampedArray;
  sideBySide:(w:number,h:number,images:readonly ArrayLike<number>[])=>{width:number;height:number;data:Uint8ClampedArray};
  maxChannelDiff:(a:ArrayLike<number>,b:ArrayLike<number>)=>number;
  flipRows:(w:number,h:number,data:ArrayLike<number>)=>Uint8ClampedArray;
  PICTURE_DIFF_GAIN_ADAPTATION:number;
};
const decode=(kind:'bc1'|'bc3',w:number,h:number)=>ktx2Level0Rgba({kind,vkFormat:0,width:w,height:h,levels:[{width:w,height:h,data:p.gradientBlocks(kind,w,h)}]});

describe('WM-PACK-2 runtime: the browser bound (the main controller\'s ruling, Shadow PC 2 measured)',()=>{
  it('HD_BLOCK_DECODE_TOLERANCE_ADAPTATION is 8 per channel: a measured allowance for vendor BC1-3 decoders, not a specification',()=>{
    expect(HD_BLOCK_DECODE_TOLERANCE_ADAPTATION).toBe(8);
  });
});

describe('WM-PACK-2 runtime: the picture mode\'s synthetic gradient and images',()=>{
  for(const kind of ['bc1','bc3'] as const){
    it(`${kind}: the hand-encoded gradient decodes opaque, ramping red across and green down, with interpolated texels`,()=>{
      const w=64,h=64,d=decode(kind,w,h);
      expect(p.gradientBlocks(kind,w,h).length).toBe((w/4)*(h/4)*(kind==='bc1'?8:16));
      for(let i=3;i<d.length;i+=4)expect(d[i]).toBe(255);                         // opaque: the block path's (c) holds
      const at=(x:number,y:number,c:number)=>d[(y*w+x)*4+c]!;
      expect(at(w-1,0,0)-at(0,0,0)).toBeGreaterThan(200);expect(at(0,h-1,1)-at(0,0,1)).toBeGreaterThan(200);
      for(let x=1;x<w;x++)expect(at(x,9,0)).toBeGreaterThanOrEqual(at(x-1,9,0));    // a smooth ramp, never back
      const reds=new Set<number>();for(let x=0;x<w;x++)reds.add(at(x,9,0));expect(reds.size).toBeGreaterThan(40);
    });
  }
  it('amplifiedDiff: |a - b| times the gain per channel, clamped, opaque',()=>{
    expect(p.PICTURE_DIFF_GAIN_ADAPTATION).toBe(32);
    expect(Array.from(p.amplifiedDiff([10,20,30,255, 0,0,0,255],[11,20,25,0, 200,0,9,255]))).toEqual([32,0,160,255, 255,0,255,255]);
    expect(p.maxChannelDiff([10,20,30,255],[11,20,25,0])).toBe(5);                // colour only: alpha is not a channel drawn
  });
  it('sideBySide: the images in a row, each its own width; flipRows turns a bottom-first read-back',()=>{
    const a=[1,1,1,255,2,2,2,255],b=[3,3,3,255,4,4,4,255],s=p.sideBySide(1,2,[a,b]);
    expect(s.width).toBe(2);expect(s.height).toBe(2);expect(Array.from(s.data)).toEqual([1,1,1,255,3,3,3,255, 2,2,2,255,4,4,4,255]);
    expect(Array.from(p.flipRows(1,2,a))).toEqual([2,2,2,255,1,1,1,255]);
  });
});

/** The owner's board, round 2 (the PC 2 picture showed max diff 1 on the smooth gradient): the worst-case panel, 4x, captions. */
const q=picture as unknown as {
  patternBlocks:(kind:'bc1'|'bc2'|'bc3'|'bc7')=>Uint8Array;
  worstCaseBlocks:(kind:'bc1'|'bc2'|'bc3',w:number,h:number)=>Uint8Array;
  upscaleNearest:(w:number,h:number,data:ArrayLike<number>,k:number)=>Uint8ClampedArray;
  panelName:(panel:'gradient'|'worst-case',kind:string,what:string)=>string;
  sideBySideName:(panel:'gradient'|'worst-case',kind:string,max:number,scale:number)=>string;
  PICTURE_UPSCALE_ADAPTATION:number;
};
describe('WM-PACK-2 runtime: the picture mode\'s worst-case panel, its 4x copies and captions',()=>{
  for(const kind of ['bc1','bc2','bc3'] as const){
    it(`${kind}: the worst case tiles the first test's own 2x2 block pattern (the one PC 2 measured) over the panel`,()=>{
      const pat=q.patternBlocks(kind),one=ktx2Level0Rgba({kind,vkFormat:0,width:8,height:8,levels:[{width:8,height:8,data:pat}]});
      const w=64,h=64,t=q.worstCaseBlocks(kind,w,h),all=ktx2Level0Rgba({kind,vkFormat:0,width:w,height:h,levels:[{width:w,height:h,data:t}]});
      expect(t.length).toBe((w/4)*(h/4)*(kind==='bc1'?8:16));
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++)expect(all[(y*w+x)*4+c]).toBe(one[((y%8)*8+x%8)*4+c]);
    });
  }
  it('upscaleNearest: each texel a k x k square',()=>{
    expect(q.PICTURE_UPSCALE_ADAPTATION).toBe(4);
    expect(Array.from(q.upscaleNearest(1,2,[1,2,3,255,4,5,6,255],2))).toEqual([1,2,3,255,1,2,3,255, 1,2,3,255,1,2,3,255, 4,5,6,255,4,5,6,255, 4,5,6,255,4,5,6,255]);
  });
  it('names: SYNTHETIC, the panel, the kind; the side-by-side captioned with its columns and its max diff',()=>{
    expect(q.panelName('worst-case','bc2','block-path-4x')).toBe('synthetic-worst-case-bc2-block-path-4x.png');
    expect(q.sideBySideName('worst-case','bc2',6,4)).toBe('synthetic-worst-case-bc2-side-by-side-4x--rgba-path--block-path--absdiff-x32--max-diff-6.png');
    expect(q.sideBySideName('gradient','bc1',1,1)).toBe('synthetic-gradient-bc1-side-by-side--rgba-path--block-path--absdiff-x32--max-diff-1.png');
  });
});

/**
 * PC 3's WebGPU run (199074d1c1): three r186's WebGPU read-back (`WebGPUTextureUtils.copyTextureToBuffer`) returns rows
 * at 256-byte strides -- an 8-texel-wide target's rows are 32 bytes each with 224 of padding after all but the last --
 * while WebGL's are tight. The scene unpacks them before any comparison.
 */
const u=picture as unknown as {tightRows:(data:ArrayLike<number>,w:number,h:number)=>Uint8ClampedArray};
describe('WM-PACK-2 runtime: the read-back unpacked to tight rows',()=>{
  it('256-byte-padded rows (WebGPU) to tight rows; tight rows (WebGL) as they are; anything else refused',()=>{
    const w=8,h=3,tight=Uint8ClampedArray.from({length:w*h*4},(_,i)=>(i*7+1)&255);
    const padded=new Uint8ClampedArray(2*256+w*4);for(let y=0;y<h;y++)padded.set(tight.subarray(y*w*4,(y+1)*w*4),y*256);
    padded.fill(99,32,256);                                           // padding never read
    expect(Array.from(u.tightRows(padded,w,h))).toEqual(Array.from(tight));
    expect(Array.from(u.tightRows(tight,w,h))).toEqual(Array.from(tight));
    const wide=Uint8ClampedArray.from({length:64*2*4},(_,i)=>i&255);   // 64 texels = 256 bytes: no padding either way
    expect(Array.from(u.tightRows(wide,64,2))).toEqual(Array.from(wide));
    expect(()=>u.tightRows(new Uint8ClampedArray(100),w,h)).toThrow(/read-back of 100 bytes/);
  });
});
