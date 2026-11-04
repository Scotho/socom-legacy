import {describe,expect,it} from 'vitest';
import {crc32 as zlibCrc32,deflateRawSync,deflateSync} from 'node:zlib';
import {decodePngAsync,pngSize,crc32,inflateBounded,INFLATE_SLICE_BYTES} from '../src/png';
import {decodePng,encodePng} from '../../../tools/png';

// GX-27: the browser's PNG decoder for an uploaded pack -- the subset tools/png.ts reads (8-bit RGB/RGBA, not
// interlaced, every filter), the same bounds and `PNG:` messages, inflated by DecompressionStream. Images made here.
const chunk=(type:string,body:Uint8Array)=>{const out=new Uint8Array(12+body.length),v=new DataView(out.buffer);v.setUint32(0,body.length);
 for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);out.set(body,8);v.setUint32(8+body.length,zlibCrc32(out.subarray(4,8+body.length)));return out;};
const join=(parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
const SIG=Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const ihdr=(w:number,h:number,{depth=8,colour=6,interlace=0}={})=>{const b=new Uint8Array(13),v=new DataView(b.buffer);v.setUint32(0,w);v.setUint32(4,h);b.set([depth,colour,0,0,interlace],8);return chunk('IHDR',b);};
const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
/** Scanlines filtered by the given filter per row (cycled), as an encoder would. */
function filtered(w:number,h:number,channels:number,pixels:Uint8Array,filters:number[]):Uint8Array{
 const stride=w*channels,raw=new Uint8Array(h*(stride+1));
 for(let y=0;y<h;y++){
  const f=filters[y%filters.length]!;raw[y*(stride+1)]=f;
  for(let i=0;i<stride;i++){
   const x=pixels[y*stride+i]!,a=i>=channels?pixels[y*stride+i-channels]!:0,b=y?pixels[(y-1)*stride+i]!:0,c=y&&i>=channels?pixels[(y-1)*stride+i-channels]!:0;
   const p=f===0?0:f===1?a:f===2?b:f===3?(a+b)>>1:paeth(a,b,c);raw[y*(stride+1)+1+i]=(x-p)&0xff;
  }
 }
 return raw;
}
const image=(w:number,h:number,channels:number,seed:number)=>Uint8Array.from({length:w*h*channels},(_,i)=>(i*seed+(i>>3)*17)&0xff);
function png(w:number,h:number,channels:3|4,filters:number[],options:{split?:number;extra?:Uint8Array[]}={}):Uint8Array{
 const z=new Uint8Array(deflateSync(filtered(w,h,channels,image(w,h,channels,channels===4?7:13),filters))),n=options.split??1,parts:Uint8Array[]=[];
 for(let i=0;i<n;i++)parts.push(chunk('IDAT',z.subarray(Math.floor(i*z.length/n),Math.floor((i+1)*z.length/n))));
 return join([SIG,ihdr(w,h,{colour:channels===4?6:2}),...(options.extra??[]),...parts,chunk('IEND',new Uint8Array(0))]);
}
const both=async(bytes:Uint8Array,maxEdge?:number)=>{
 const sync=(()=>{try{return decodePng(bytes,maxEdge);}catch(e){return (e as Error).message;}})();
 const async=await decodePngAsync(bytes,maxEdge).catch((e:unknown)=>(e as Error).message);return {sync,async};
};

describe('GX-27 the browser PNG decoder (decodePngAsync) against tools/png.ts on the same bytes',()=>{
 it('every filter, RGB and RGBA, split IDAT and a skipped ancillary chunk decode to the same pixels',async()=>{
  for(const channels of [3,4] as const)for(const filters of [[0],[1],[2],[3],[4],[0,1,2,3,4]]){
   const bytes=png(7,5,channels,filters,{split:3,extra:[chunk('tEXt',new TextEncoder().encode('k\0v'))]});
   const {sync,async}=await both(bytes);expect(typeof sync,`${channels} ${filters}`).toBe('object');expect(async).toEqual(sync);
   const d=(async as {data:Uint8ClampedArray}).data;if(channels===3)for(let a=3;a<d.length;a+=4)expect(d[a]).toBe(255);
  }
  const rgba=Uint8ClampedArray.from({length:6*3*4},(_,i)=>(i*29)&0xff),encoded=encodePng(6,3,rgba);
  expect(await decodePngAsync(encoded)).toEqual({width:6,height:3,data:rgba});expect(pngSize(encoded)).toEqual({width:6,height:3});
  expect(crc32(new TextEncoder().encode('IEND'))).toBe(zlibCrc32('IEND'));
 });
 it('refuses with the same PNG: message as the tool',async()=>{
  const good=png(4,4,4,[0]);
  const badCrc=good.slice();badCrc[29]=badCrc[29]!^1;
  const noEnd=good.subarray(0,good.length-12);
  const zShort=new Uint8Array(deflateSync(new Uint8Array(10)));
  const cases:[Uint8Array,RegExp,number?][]=[
   [new TextEncoder().encode('GIF89a......'),/^PNG: not a PNG$/],
   [badCrc,/^PNG: bad CRC in IHDR$/],
   [join([SIG,ihdr(4,4,{interlace:1}),chunk('IDAT',zShort),chunk('IEND',new Uint8Array(0))]),/only 8-bit RGBA\/RGB, not interlaced/],
   [join([SIG,ihdr(4,4,{depth:16}),chunk('IDAT',zShort),chunk('IEND',new Uint8Array(0))]),/only 8-bit RGBA\/RGB/],
   [join([SIG,ihdr(4,4,{colour:3}),chunk('IDAT',zShort),chunk('IEND',new Uint8Array(0))]),/only 8-bit RGBA\/RGB/],
   [good,/^PNG: size 4x4 outside 1\.\.3$/,3],
   [join([SIG,chunk('IDAT',zShort),ihdr(4,4),chunk('IEND',new Uint8Array(0))]),/^PNG: IDAT before IHDR$/],
   [join([SIG,ihdr(4,4),chunk('ABCD',new Uint8Array(1)),chunk('IDAT',zShort),chunk('IEND',new Uint8Array(0))]),/^PNG: unknown critical chunk ABCD$/],
   [noEnd,/^PNG: incomplete$/],
   [join([SIG,ihdr(4,4),chunk('IDAT',zShort),chunk('IEND',new Uint8Array(0))]),/^PNG: image data is the wrong length$/],
   [join([SIG,ihdr(1,1),chunk('IDAT',new Uint8Array(deflateSync(Uint8Array.from([5,1,2,3,4])))),chunk('IEND',new Uint8Array(0))]),/^PNG: filter 5$/],
  ];
  for(const [bytes,pattern,max] of cases){const {sync,async}=await both(bytes,max);expect(sync,String(pattern)).toMatch(pattern);expect(async,String(pattern)).toBe(sync);}
  expect(pngSize(new Uint8Array(4))).toBeNull();
 });
 it('an IDAT that does not inflate, or inflates past the image, is refused (the tool throws too)',async()=>{
  const junk=join([SIG,ihdr(2,2),chunk('IDAT',Uint8Array.from([1,2,3,4,5,6])),chunk('IEND',new Uint8Array(0))]);
  const long=join([SIG,ihdr(2,2),chunk('IDAT',new Uint8Array(deflateSync(new Uint8Array(4000)))),chunk('IEND',new Uint8Array(0))]);
  for(const bytes of [junk,long]){const {sync,async}=await both(bytes);expect(typeof sync).toBe('string');expect(async).toMatch(/^PNG: image data (does not inflate|is the wrong length)$/);}
 });
 // GX-27 review F1: the bound holds while streaming -- the input is fed a slice at a time, never whole, and the run stops
 // once the output passes the limit. The bytes fed are counted at the source, not read off node's adapter.
 it('a deflate bomb declaring a small size is refused with bounded output: input fed in slices, stopped past the limit',async()=>{
  expect(INFLATE_SLICE_BYTES).toBeLessThanOrEqual(64*1024);
  // 64 MiB of zeros compresses to about 64 KiB, and Node 22.23's DecompressionStream accepts that whole stream
  // before this pull loop observes 1 MiB of output (measured: fed 65232, the entire bomb). A 256 MiB bomb is about
  // 261 KiB compressed; the same loop stops at 64 KiB fed once the output passes the limit. The ceiling is that
  // platform buffer plus one extra slice, and it stays under half the bomb, so feeding the whole stream still fails.
  const bomb=new Uint8Array(deflateRawSync(new Uint8Array(256*1024*1024))),stats={fed:0,out:0};
  expect(await inflateBounded(bomb,'deflate-raw',1024*1024,{slice:1024,stats})).toBe('over');
  expect(stats.fed).toBeGreaterThan(0);expect(stats.fed).toBeLessThanOrEqual(96*1024);expect(stats.fed).toBeLessThan(bomb.length/2);
  expect(stats.out).toBeGreaterThan(1024*1024);expect(stats.out).toBeLessThan(16*1024*1024);
  const small=new Uint8Array(deflateRawSync(Uint8Array.from({length:300_000},(_,i)=>(i*7)&0xff))),whole={fed:0,out:0};
  expect(await inflateBounded(small,'deflate-raw',300_000,{slice:1000,stats:whole})).toEqual(Uint8Array.from({length:300_000},(_,i)=>(i*7)&0xff));
  expect(whole).toEqual({fed:small.length,out:300_000});
 });
 // GX-27 re-review: bytes after the zlib stream's end -- a named difference (conventions §10): the generator's
 // inflateSync ignores them, the browser's decoder refuses the PNG (the upload leaves it out as `unreadable`).
 it('bytes trailing the IDAT\'s zlib stream: the tool accepts them, the browser decoder refuses the PNG',async()=>{
  const raw=filtered(3,2,4,image(3,2,4,7),[0]),z=new Uint8Array(deflateSync(raw));
  const trailing=join([SIG,ihdr(3,2),chunk('IDAT',join([z,Uint8Array.from([0,1,2,3])])),chunk('IEND',new Uint8Array(0))]);
  const {sync,async}=await both(trailing);
  expect(typeof sync).toBe('object');expect(async).toBe('PNG: image data does not inflate');
 });
});
