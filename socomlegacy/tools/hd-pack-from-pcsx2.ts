import {existsSync,linkSync,copyFileSync,mkdirSync,readFileSync,readdirSync,renameSync,statSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {discTextureRecords} from './discTextureRecords';
import {buildHdManifest,resolveFiles,type ImageTier,type PackFile} from './hdPack';

/**
 * OT.R92 (HD-5): builds the test room's HD pack from a PCSX2 replacement folder and the disc. The pack is third-party
 * art (HD.R5): written to the ignored `public/experimental-packs/hd/` only, payloads hard-linked (copied across
 * volumes), never committed. Prints the tier counts; `below-bar.json` beside the manifest lists every file left out.
 * Usage: tsx tools/hd-pack-from-pcsx2.ts <disc root> <replacements dir> [--image-tiers <mapping.json>] [--name <name>]
 *   [--game SCUS-97275] [--out <dir>] [--extra-root <dir>]...
 * An extra root is read as the disc is: the downloadable maps' files (RUN/MP/MP54, MP63, MP74, unpacked from the online
 * service's HDD image), so their textures bind too.
 */
const args=process.argv.slice(2),flag=(n:string)=>{const i=args.indexOf(n);if(i<0)return undefined;const v=args[i+1];args.splice(i,2);return v;};
const imageTiersFile=flag('--image-tiers'),name=flag('--name')??'SOCOM II HD Textures',game=flag('--game')??'SCUS-97275';
const extraRoots:string[]=[];for(let r=flag('--extra-root');r!==undefined;r=flag('--extra-root'))extraRoots.push(r);
const out=resolve(flag('--out')??join(import.meta.dirname,'..','public','experimental-packs','hd'));
const [disc,rep]=args;
if(!disc||!rep){console.error('usage: hd-pack-from-pcsx2.ts <disc root> <replacements dir> [--image-tiers <json>] [--name <n>] [--game <serial>] [--out <dir>]');process.exit(2);}

const walk=(d:string):string[]=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p];});
const paths=new Map(walk(rep).map(p=>[relative(rep,p).replace(/\\/g,'/').split('/').at(-1)!,p]));
const files:PackFile[]=[...paths].map(([n,p])=>({name:n,read:()=>new Uint8Array(readFileSync(p))}));
console.error(`pack files: ${files.length}; reading the disc...`);
const records=[...discTextureRecords(disc,m=>console.error(m)),
  ...extraRoots.flatMap(r=>discTextureRecords(r,m=>console.error(m)).map(x=>({...x,where:`extra:${x.where}`})))];
console.error(`disc texture records: ${records.length}; resolving...`);
const imageTiers=imageTiersFile?JSON.parse(readFileSync(imageTiersFile,'utf8')) as Record<string,ImageTier>:{};
const {bound,below}=await resolveFiles(records,files,imageTiers);
console.error(`bound ${bound.size}; decoding payloads...`);
const built=buildHdManifest(records,files,bound,below,{name,method:`pcsx2 replacements (${files.length} files); tiers A-C exact${imageTiersFile?', D-F image':''}`,game});
const dir=join(out,built.id),tmp=dir+'.partial';
mkdirSync(tmp,{recursive:true});
for(const [outName,src] of built.payloads){
  const to=join(tmp,outName);if(existsSync(to))continue;
  if(typeof src!=='string'){writeFileSync(to,src);continue;}   // a recoloured tier C payload, made here
  try{linkSync(paths.get(src)!,to);}catch{copyFileSync(paths.get(src)!,to);}
}
writeFileSync(join(tmp,'manifest.json'),built.manifestBytes);
writeFileSync(join(tmp,'below-bar.json'),JSON.stringify(built.below,null,1));
if(!existsSync(dir))renameSync(tmp,dir);
writeFileSync(join(out,'current.json'),JSON.stringify({version:1,packId:built.id}));
const tiers:Record<string,number>={};for(const r of bound.values())tiers[r.tier]=(tiers[r.tier]??0)+1;
console.log(JSON.stringify({id:built.id,files:files.length,bound:bound.size,tiers,belowBar:below.length,entries:built.manifest.entries.length,
  payloads:built.payloads.size,payloadBytesDecoded:built.manifest.totalBytes,dir}));
