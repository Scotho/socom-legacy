import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join,resolve,sep} from 'node:path';
import type {PackSource,PackRoles,PackMap} from '../../packages/viewer/src/texturePack';
import {exportTextures} from '../writeLocalTexturePack';
import {decodePng,encodePng} from '../png';
import type {ZipItem} from '../../packages/viewer/test/zipFixture';

/**
 * GX-27 (a test helper, not a test): a base pack as the controller made them -- `--export` of fabricated sources, the
 * directory's files read back -- and the artist's edit of it: chosen PNGs replaced by a nearest upscale, zipped flat or
 * under a folder. Synthetic sources only; the temporary export directory is removed before returning.
 */
export async function exportedFiles(sources:PackSource[],options:{map?:PackMap;roles?:PackRoles}={}):Promise<{files:Map<string,Uint8Array>;stems:string[]}>{
 const root=mkdtempSync(join(tmpdir(),'s2u-pack-')),dir=join(root,'export');
 try{
  await exportTextures(sources,dir,{archiveSha256:'a'.repeat(64),archiveBytes:123,toolCommit:'b'.repeat(40),...options});
  const files=new Map(readdirSync(dir).sort().map(f=>[f,new Uint8Array(readFileSync(join(dir,f)))] as const));
  const index=JSON.parse(new TextDecoder().decode(files.get('export.json')!)) as {entries:{stem:string}[]};
  return {files,stems:index.entries.map(e=>e.stem)};
 }finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep)||!basename(root).startsWith('s2u-pack-'))throw Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true});}
}
/** A nearest-neighbour upscale of a PNG by `n` (the model's stand-in); `n` need not be 2 or 4 (a wrong size). */
export function upscalePng(bytes:Uint8Array,n:number):Uint8Array{
 const s=decodePng(bytes),width=s.width*n,height=s.height*n,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(Math.floor(y/n)*s.width+Math.floor(x/n))*4;data.set(s.data.subarray(i,i+4),(y*width+x)*4);}
 return encodePng(width,height,data);
}
/** The zip's items: every exported file under `folder`, the stems in `replace` upscaled by their factor, `extra` added. */
export function baseZipItems(files:Map<string,Uint8Array>,options:{folder?:string;replace?:Record<string,number>;packJson?:string|object}={}):ZipItem[]{
 const folder=options.folder??'',items:ZipItem[]=[];
 for(const [name,data] of files){
  const stem=name.replace(/\.png$/,''),n=name.endsWith('.png')?options.replace?.[stem]:undefined;
  items.push({name:folder+name,data:n===undefined?data:upscalePng(data,n)});
 }
 if(options.packJson!==undefined)items.push({name:folder+'pack.json',data:typeof options.packJson==='string'?options.packJson:JSON.stringify(options.packJson)});
 return items;
}
