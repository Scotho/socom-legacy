import {describe,expect,it} from 'vitest';
import {boxResize,indicesOf,recolour,uniformTexels} from '../hdRecolour';
import type {DiscTextureRecord} from '../discTextureRecords';

/** Synthetic: one 8x8 T8 layout under two palettes (ours and the pack's), the pack's image upscaled 4x. No game data. */
const W=8,H=8,layout=Uint8Array.from({length:W*H},(_,i)=>((i%W)>>1)+4*((i/W|0)>>2));   // 8 indices in 2x4 blocks
const ours=(i:number)=>[20+i*25,200-i*20,40+i*10,i<4?255:128],theirs=(i:number)=>[100+i*10,100+i*10,100+i*10,255];
const img=(w:number,h:number,col:(i:number)=>number[],scale:number)=>({width:w*scale,height:h*scale,
  data:Uint8ClampedArray.from(Array.from({length:w*h*scale*scale},(_,p)=>{const x=(p%(w*scale))/scale|0,y=(p/(w*scale)|0)/scale|0;return col(layout[y*w+x]!);}).flat())});
const record=(over:Partial<DiscTextureRecord>={}):DiscTextureRecord=>({where:'T',name:'t.tif',width:W,height:H,psm:0x13,tw:3,th:3,tcc:1,csa:0,csm:0,tbw:1,tbp0:0,cbp:0,cpsm:0,
  pixels:layout,pal:new Uint8Array(1024),palFormat:0,rgbaSha256:'0'.repeat(64),rgba:img(W,H,ours,1).data,...over});

describe('palette transfer (HD tier C recolour)',()=>{
  it('box-resizes by area',()=>{
    const r=boxResize(img(W,H,theirs,4),W,H);expect(Array.from(r.data.slice(0,4))).toEqual([100,100,100,255]);
  });
  it('reads T8 and T4 indices in raster order',()=>{
    expect(Array.from(indicesOf(record()).slice(0,4))).toEqual([0,0,1,1]);
    expect(Array.from(indicesOf(record({psm:0x14,pixels:Uint8Array.from([0x21,0x43])}),4))).toEqual([1,2,3,4]);
  });
  it('turns the pack\'s colours and opacity into ours, keeping the HD size',()=>{
    const out=recolour(img(W,H,theirs,4),record());
    expect([out.width,out.height]).toEqual([32,32]);
    const back=boxResize(out,W,H);
    // The output keeps the pack's PS2 alpha scale (0x80 opaque); the runtime rescales every payload alike.
    const want=(i:number,c:number)=>c===3?ours(layout[i]!)[3]!*128/255:ours(layout[i]!)[c]!;
    for(let i=0;i<W*H;i++)for(let c=0;c<4;c++)expect(Math.abs(back.data[i*4+c]!-want(i,c)),`texel ${i} channel ${c}`).toBeLessThanOrEqual(1);
  });
  it('knows a single-value texture (its texel hash says nothing; the palette alone decides)',()=>{
    expect(uniformTexels(record({pixels:new Uint8Array(64).fill(7)}))).toBe(true);
    expect(uniformTexels(record())).toBe(false);
    expect(uniformTexels(record({psm:0x00,pixels:Uint8Array.from({length:256},(_,i)=>[1,2,3,4][i%4]!)}))).toBe(true);
  });
});
