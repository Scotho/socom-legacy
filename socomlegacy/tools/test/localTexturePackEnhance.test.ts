// GX-22 (plan 2026-10-10-web-graphics-slice-4-packs): the generator's --enhance operations and --scale 2 --from 4x.
// A browser adaptation with no original (H135): fabricated images only -- no map decoded, no model run, no pack published.
import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,readdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import type {Rgba} from '@s2u/gs';
import {buildTexturePack,enhanceLevel,enhanceText,fromFourMethod,lanczos2x,lanczosHalf,parseEnhance} from '../localTexturePack';
import {exportTextures,generateLocalTexturePack,importTextures,takeGeneratorOptions} from '../writeLocalTexturePack';
import {decodePng,encodePng} from '../png';
import {mipChain} from '../../packages/viewer/src/materialSpec';
import type {PackSource} from '../../packages/viewer/src/texturePack';

const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0)){if(!resolve(r).startsWith(resolve(tmpdir())+sep)||!basename(r).startsWith('s2u-pack-'))throw Error('Unsafe cleanup');rmSync(r,{recursive:true,force:true});}});
const temporary=()=>{const r=mkdtempSync(join(tmpdir(),'s2u-pack-'));roots.push(r);return r;};
type Wrap='repeat'|'clamp';
const gs=(wrapS:Wrap,wrapT:Wrap,mipmaps=false,levels=0)=>({blend:'none' as const,alphaTest:null,depthTest:true,bilinear:true,mipmaps,levels,wrapS,wrapT});
const opaque=(g:ReturnType<typeof gs>)=>({bilinear:true,transparent:false,graded:false,opaque:true,gs:g});
const image=(width:number,height:number,seed:number):Rgba=>({width,height,data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>i%4===3?255:(i*seed+7)%251)});
const fabricated=():PackSource[]=>[
 {key:'rock_wall.tif',library:'MP51',record:'rock_wall.tif',flags:opaque(gs('repeat','repeat',true,1)),levels:[image(8,8,3),image(4,4,5)]},
 {key:'door.tif',library:'SHAR',record:'door.tif',flags:opaque(gs('clamp','repeat')),levels:[image(8,4,11)]},
];
const info={archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40)};
const provenance={...info,toolSha256:'c'.repeat(64)};
const nearest=(s:Rgba,n:number):Rgba=>{
 const width=s.width*n,height=s.height*n,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(Math.floor(y/n)*s.width+Math.floor(x/n))*4;data.set(s.data.subarray(i,i+4),(y*width+x)*4);}
 return {width,height,data};
};
/** The model's stand-in: every exported PNG upscaled by nearest n x into a copy of the export (sidecars beside). */
function upscaled(exported:string,n:number):string{
 const out=temporary();
 for(const f of readdirSync(exported)){
  if(f.endsWith('.png')){const u=nearest(decodePng(readFileSync(join(exported,f))),n);writeFileSync(join(out,f),encodePng(u.width,u.height,u.data));}
  else copyFileSync(join(exported,f),join(out,f));
 }
 return out;
}
/** A field of `width` x `height`, each column's RGB from `column(x)`, alpha 255. */
const field=(width:number,height:number,column:(x:number)=>[number,number,number]):Rgba=>{
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const [r,g,b]=column(x);data.set([r,g,b,255],(y*width+x)*4);}
 return {width,height,data};
};
const px=(l:Rgba,x:number,y:number)=>Array.from(l.data.subarray((y*l.width+x)*4,(y*l.width+x)*4+4));
const steepest=(l:Rgba,y:number)=>{let m=0;for(let x=1;x<l.width;x++)m=Math.max(m,Math.abs(l.data[(y*l.width+x)*4]!-l.data[(y*l.width+x-1)*4]!));return m;};
const alphaAll255=(l:Rgba)=>{for(let a=3;a<l.data.length;a+=4)if(l.data[a]!==255)return false;return true;};
const levelsOf=(bytes:Uint8Array,levels:{offset:number;bytes:number}[])=>levels.map(l=>Array.from(bytes.subarray(l.offset,l.offset+l.bytes)));

it('GX-22 unsharp: a step edge steepens (measured) and a flat field stays within one level',()=>{
 const step=field(16,4,x=>x<8?[64,64,64]:[192,192,192]),out=enhanceLevel(step,parseEnhance('unsharp=1,1'),'clamp','clamp');
 expect(steepest(step,2)).toBe(128);expect(steepest(out,2)).toBeGreaterThan(160);
 expect(px(out,7,2)[0]).toBeLessThan(64);expect(px(out,8,2)[0]).toBeGreaterThan(192);
 expect(px(out,0,2)).toEqual([64,64,64,255]);expect(px(out,15,2)).toEqual([192,192,192,255]);expect(alphaAll255(out)).toBe(true);
 const flat=field(8,8,()=>[117,40,201]);
 for(const ops of ['unsharp=4,2','unsharp=0.5,0.1,32','contrast=0.6,32','saturation=1'])for(const wraps of [['repeat','repeat'],['clamp','clamp']] as const){
  const f=enhanceLevel(flat,parseEnhance(ops),wraps[0],wraps[1]);for(let i=0;i<f.data.length;i++)expect(Math.abs(f.data[i]!-flat.data[i]!)).toBeLessThanOrEqual(1);
 }
 // A threshold above the edge's difference leaves the edge as it was.
 const soft=field(16,2,x=>x<8?[100,100,100]:[120,120,120]);
 expect(Array.from(enhanceLevel(soft,parseEnhance('unsharp=1,1,32'),'clamp','clamp').data)).toEqual(Array.from(soft.data));
});
it('GX-22 contrast and saturation move the expected pixels the expected way and leave alpha 255',()=>{
 const step=field(64,4,x=>x<32?[100,100,100]:[150,150,150]),lifted=enhanceLevel(step,parseEnhance('contrast=0.5,8'),'clamp','clamp');
 expect(px(lifted,31,1)[0]).toBeLessThan(100);expect(px(lifted,32,1)[0]).toBeGreaterThan(150);expect(alphaAll255(lifted)).toBe(true);
 // Wider than a small unsharp: four texels from the edge still moves.
 expect(px(lifted,28,1)[0]).toBeLessThan(100);expect(px(lifted,36,1)[0]).toBeGreaterThan(150);
 const colour=field(4,4,x=>x<2?[200,100,100]:[128,128,128]);
 const more=enhanceLevel(colour,parseEnhance('saturation=1.5'),'repeat','repeat'),less=enhanceLevel(colour,parseEnhance('saturation=0.5'),'repeat','repeat');
 const [r1,g1,b1]=px(more,0,0) as [number,number,number],[r0,g0,b0]=px(less,0,0) as [number,number,number];
 expect(r1).toBeGreaterThanOrEqual(200);expect(g1).toBeLessThan(100);expect(b1).toBeLessThan(100);
 expect(r0).toBeLessThan(200);expect(g0).toBeGreaterThan(100);expect(b0).toBeGreaterThan(100);
 expect(px(more,3,3)).toEqual([128,128,128,255]);expect(px(less,3,3)).toEqual([128,128,128,255]);
 expect(alphaAll255(more)&&alphaAll255(less)).toBe(true);
});
it('GX-22 the chain applies in the given order: two orders differ',()=>{
 const edge=field(16,4,x=>x<8?[180,60,60]:[60,60,180]);
 const a=enhanceLevel(edge,parseEnhance('saturation=1.5;unsharp=2,2'),'clamp','clamp'),b=enhanceLevel(edge,parseEnhance('unsharp=2,2;saturation=1.5'),'clamp','clamp');
 expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
 const first=enhanceLevel(enhanceLevel(edge,parseEnhance('saturation=1.5'),'clamp','clamp'),parseEnhance('unsharp=2,2'),'clamp','clamp');
 expect(Array.from(a.data)).toEqual(Array.from(first.data));
});
it('GX-22 the grammar: the canonical text, and every out-of-range or malformed op refused with its reason',()=>{
 expect(enhanceText(parseEnhance('unsharp=1.50,0.8;contrast=0.3;saturation=1.2;unsharp=0.5,2,4'))).toBe('unsharp=1.5,0.8,0;contrast=0.3,16;saturation=1.2;unsharp=0.5,2,4');
 expect(()=>parseEnhance('unsharp=5,1')).toThrow(/unsharp radius 5 is outside 0.5-4/);
 expect(()=>parseEnhance('saturation=1.6')).toThrow(/saturation factor 1.6 is outside 0.5-1.5/);
 expect(()=>parseEnhance('contrast=0.3,40')).toThrow(/contrast radius 40 is outside 8-32/);
 for(const bad of ['','unsharp=0.4,1','unsharp=1,2.5','unsharp=1,0.05','unsharp=1,1,33','unsharp=1','unsharp=1,1,1,1','unsharp=a,1','unsharp=-1,1','unsharp=1e0,1',
  'contrast=0.7','contrast=0.05','contrast=0.3,7','saturation=0.4','saturation=','blur=1','unsharp=1,1;','unsharp 1,1',Array(9).fill('saturation=1').join(';')])expect(()=>parseEnhance(bad)).toThrow(/--enhance/);
});
it('GX-22 the manifest\'s method carries the suffix exactly, on the Lanczos path and on an import',async()=>{
 const sources=fabricated(),ops=parseEnhance('unsharp=1,0.5;saturation=1.1');
 const lanczos=await buildTexturePack(sources,provenance,'MP51',ops);expect(lanczos.manifest.method).toBe('lanczos3 enhance:unsharp=1,0.5,0;saturation=1.1');
 expect((await buildTexturePack(sources,provenance,'MP51')).manifest.method).toBe('lanczos3');
 const dir=join(temporary(),'export');await exportTextures(sources,dir,info);
 const imported=await importTextures(sources,upscaled(dir,2),{method:'nearest-2x test stand-in',scale:2,enhance:ops},provenance);
 expect(imported.manifest.method).toBe('nearest-2x test stand-in enhance:unsharp=1,0.5,0;saturation=1.1');
 await expect(importTextures(sources,upscaled(dir,2),{method:'nearest-2x enhance: none',scale:2,enhance:ops},provenance)).rejects.toThrow(/already carries an enhance: suffix/);
 await expect(importTextures(sources,upscaled(dir,2),{method:'m'.repeat(500),scale:2,enhance:ops},provenance)).rejects.toThrow(/longer than 512/);
});
it('GX-22 the mips of an enhanced pack are built from the enhanced top level (import) and from each enhanced authored level (Lanczos)',async()=>{
 const sources=fabricated(),ops=parseEnhance('unsharp=1.5,1.2;contrast=0.4,8'),dir=join(temporary(),'export');await exportTextures(sources,dir,info);
 const plain=await importTextures(sources,upscaled(dir,2),{method:'nearest-2x',scale:2},provenance);
 const pack=await importTextures(sources,upscaled(dir,2),{method:'nearest-2x',scale:2,enhance:ops},provenance);
 const rock=pack.manifest.entries[0]!,levels=levelsOf(pack.payloads.get(rock.file)!,rock.levels);
 const top=enhanceLevel(nearest(sources[0]!.levels[0]!,2),ops,'repeat','repeat'),expected=mipChain(top,[lanczosHalf(top,'repeat','repeat')]);
 expect(levels).toEqual(expected.map(l=>Array.from(l.data)));
 expect(levels[0]).not.toEqual(levelsOf(plain.payloads.get(plain.manifest.entries[0]!.file)!,plain.manifest.entries[0]!.levels)[0]);
 const lanczos=await buildTexturePack(sources,provenance,'MP51',ops),lr=lanczos.manifest.entries[0]!;
 const authored=sources[0]!.levels.map(l=>enhanceLevel(lanczos2x(l,'repeat','repeat'),ops,'repeat','repeat'));
 expect(levelsOf(lanczos.payloads.get(lr.file)!,lr.levels)).toEqual(mipChain(authored[0]!,authored.slice(1)).map(l=>Array.from(l.data)));
});
it('GX-22 --scale 2 --from 4x: a scale-2 pack, the levels of a direct 2x, the top level lanczosHalf of the 4x crop',async()=>{
 const sources=fabricated(),dir=join(temporary(),'export');await exportTextures(sources,dir,info);
 const direct=await importTextures(sources,upscaled(dir,2),{method:'nearest-2x',scale:2},provenance);
 const from=await importTextures(sources,upscaled(dir,4),{method:'realesrgan-x4plus-4x weights-sha256:abc pad:3x3',scale:2,from:4},provenance);
 expect(from.leftOut).toEqual([]);expect(from.manifest.scale).toBe(2);expect(from.manifest.method).toBe('realesrgan-x4plus-2x-from-4x weights-sha256:abc pad:3x3');
 const dims=(p:typeof direct)=>p.manifest.entries.map(e=>e.levels.map(l=>[l.width,l.height,l.sourceLevel]));expect(dims(from)).toEqual(dims(direct));
 for(const [i,e] of from.manifest.entries.entries()){
  const s=sources[i]!,half=lanczosHalf(nearest(s.levels[0]!,4),s.flags.gs!.wrapS,s.flags.gs!.wrapT);
  expect(levelsOf(from.payloads.get(e.file)!,e.levels)[0]).toEqual(Array.from(half.data));
 }
 const both=await importTextures(sources,upscaled(dir,4),{method:'realesrgan-x4plus',scale:2,from:4,enhance:parseEnhance('unsharp=1,0.5')},provenance);
 expect(both.manifest.method).toBe('realesrgan-x4plus-2x-from-4x enhance:unsharp=1,0.5,0');
 const e=both.manifest.entries[1]!,half=lanczosHalf(nearest(sources[1]!.levels[0]!,4),'clamp','repeat');
 expect(levelsOf(both.payloads.get(e.file)!,e.levels)[0]).toEqual(Array.from(enhanceLevel(half,parseEnhance('unsharp=1,0.5'),'clamp','repeat').data));
 await expect(importTextures(sources,upscaled(dir,2),{method:'realesrgan-x4plus-4x',scale:2,from:4},provenance)).rejects.toThrow(/--from 4x: no imported PNG is 4x/);
 await expect(importTextures(sources,upscaled(dir,4),{method:'realesrgan-x4plus-4x',scale:4,from:4},provenance)).rejects.toThrow(/--from 4x needs --scale 2/);
});
it('GX-22 the method\'s first word under --from 4x, and the CLI options taken and refused before anything is read or written',async()=>{
 expect(fromFourMethod('realesrgan-x4plus-4x release:20220424')).toBe('realesrgan-x4plus-2x-from-4x release:20220424');
 expect(fromFourMethod('realesrgan-x4plus')).toBe('realesrgan-x4plus-2x-from-4x');
 expect(fromFourMethod('chainner-4x_foolhardy_remacri-4x')).toBe('chainner-4x_foolhardy_remacri-2x-from-4x');
 expect(fromFourMethod('realesrgan-x4plus-2x-from-4x')).toBe('realesrgan-x4plus-2x-from-4x');
 for(const bad of ['lanczos-lanczos3-2x','realesrgan-x4plus-4x-sharp'])expect(()=>fromFourMethod(bad)).toThrow(/--from 4x/);
 expect(takeGeneratorOptions(['MP51.ZDB','--import','d','--from','4x','--enhance','saturation=1.1','--method','m','--scale','2'])).toEqual({args:['MP51.ZDB','--import','d','--method','m','--scale','2'],enhance:[{op:'saturation',factor:1.1}],from:4});
 expect(takeGeneratorOptions(['MP51.ZDB','wall'])).toEqual({args:['MP51.ZDB','wall'],enhance:[]});
 for(const bad of [['--from','2x'],['--from'],['--enhance'],['--enhance','unsharp=9,1'],['--enhance','saturation=1','--enhance','saturation=1'],['--from','4x','--from','4x']])expect(()=>takeGeneratorOptions(['MP51.ZDB',...bad])).toThrow(/--enhance|--from/);
 const nowhere=join(temporary(),'RUN','MP51.ZDB');
 await expect(generateLocalTexturePack([nowhere,'--import',temporary(),'--method','m','--scale','2','--enhance','unsharp=9,1'])).rejects.toThrow(/unsharp radius 9 is outside/);
 await expect(generateLocalTexturePack([nowhere,'wall','--from','4x'])).rejects.toThrow(/--from 4x is an import's/);
 await expect(generateLocalTexturePack([nowhere,'--import',temporary(),'--method','m','--scale','4','--from','4x'])).rejects.toThrow(/--from 4x needs --scale 2/);
});
