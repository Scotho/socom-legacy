import {createHash} from 'node:crypto';
import {decodeDds} from '../packages/viewer/src/dds';
import {validateHdManifest,type HdEntry,type HdManifest,type HdTier} from '../packages/viewer/src/hdTexturePack';
import {pcsx2Names,PSM,TEXA_TRIES,texBytes,clutBytes,xxh3,type Texa} from './pcsx2Names';
import type {DiscTextureRecord} from './discTextureRecords';
import {decodePng,encodePng} from './png';
import {recolour,uniformTexels} from './hdRecolour';

/**
 * OT.R92 (HD-5): a PCSX2 replacement pack's files bound to the disc's decoded images by HD.R2's tiers, and the HD
 * manifest built from what binds. A -- the file's name is a record's PCSX2 name; A2 -- both hashes match, TCC differs;
 * B -- byte-identical to an A/A2 file; C -- the texel hash matches (the palette differs), never on a single-value
 * texture (its texel hash names any flat texture of that size), and a paletted target gets the file recoloured into
 * its own colours and opacity (`./hdRecolour`); D/E/F -- image matches made
 * offline and accepted at their margins (`imageTiers`, the evidence folder's `mapping3.json` shape). Every file that
 * does not bind is reported with why.
 */
export interface PackFile {name:string;read:()=>Uint8Array}
export interface ParsedName {stem:string;tex:string;clut:string|null;psm:number;tw:number;th:number;tcc:number}
export interface Resolution {tier:HdTier;targets:number[]}
export interface ImageTier {tier:'D'|'E'|'F';accept?:boolean;rgba:string[]}
export interface BelowBar {file:string;why:string}
const TIER_ORDER:HdTier[]=['A','A2','B','C','D','E','F'];

/** `<tex>-<clut>-<bits>` or `<tex>-<bits>` (a region part `r...` is ignored), or null for any other file name. */
export function parseName(file:string):ParsedName|null{
  const m=/^(.*)\.(dds|png)$/i.exec(file);if(!m)return null;
  const p=m[1]!.split('-').filter(x=>!x.startsWith('r'));
  if((p.length!==2&&p.length!==3)||!p.every(x=>/^[0-9a-f]{1,16}$/.test(x)))return null;
  const b=parseInt(p.at(-1)!,16);
  return {stem:m[1]!,tex:p[0]!,clut:p.length===3?p[1]!:null,psm:b&0x3f,tw:(b>>6)&15,th:(b>>10)&15,tcc:(b>>14)&1};
}

export async function resolveFiles(records:readonly DiscTextureRecord[],files:readonly PackFile[],
  imageTiers:Record<string,ImageTier>={}):Promise<{bound:Map<string,Resolution>;below:BelowBar[]}>{
  const texOf=new Map<string,Set<number>>(),clutOf=new Map<string,Set<number>>();
  const add=(m:Map<string,Set<number>>,k:string,i:number)=>{let s=m.get(k);if(!s)m.set(k,s=new Set());s.add(i);};
  for(const [i,r] of records.entries()){
    const direct16=r.psm===PSM.CT16||r.psm===PSM.CT16S;
    for(const texa of direct16?TEXA_TRIES:[[0,0,0] as Texa]){const tb=texBytes(r,texa);if(tb)add(texOf,await xxh3(tb),i);}
    if(r.psm===PSM.T8||r.psm===PSM.T4)for(const ct of r.palFormat===0?[[0,0,0x80] as Texa]:TEXA_TRIES){const cb=clutBytes(r,ct);if(cb)add(clutOf,await xxh3(cb),i);}
  }
  const bound=new Map<string,Resolution>(),below:BelowBar[]=[],parsed=new Map<string,ParsedName>(),digest=new Map<string,string>();
  for(const f of files){
    const p=parseName(f.name);if(!p){below.push({file:f.name,why:'not a PCSX2 replacement name'});continue;}
    parsed.set(f.name,p);digest.set(f.name,createHash('sha256').update(f.read()).digest('hex'));
  }
  const compatible=(i:number,p:ParsedName)=>{const r=records[i]!;return r.psm===p.psm&&r.tw===p.tw&&r.th===p.th;};
  for(const [name,p] of parsed){
    let t=[...texOf.get(p.tex)??[]].filter(i=>compatible(i,p));
    if(p.clut!==null){const c=clutOf.get(p.clut);t=t.filter(i=>c?.has(i));}
    if(t.length)bound.set(name,{tier:t.every(i=>records[i]!.tcc===p.tcc)?'A':'A2',targets:t.sort((a,b)=>a-b)});
  }
  const exact=new Map<string,string>();for(const n of bound.keys())if(!exact.has(digest.get(n)!))exact.set(digest.get(n)!,n);
  for(const name of parsed.keys()){
    if(bound.has(name))continue;const peer=exact.get(digest.get(name)!);
    if(peer)bound.set(name,{tier:'B',targets:bound.get(peer)!.targets});
  }
  for(const [name,p] of parsed){
    if(bound.has(name))continue;const t=[...texOf.get(p.tex)??[]].filter(i=>compatible(i,p)&&!uniformTexels(records[i]!));
    if(t.length)bound.set(name,{tier:'C',targets:t.sort((a,b)=>a-b)});
  }
  const bySha=new Map<string,number[]>();for(const [i,r] of records.entries()){const l=bySha.get(r.rgbaSha256);if(l)l.push(i);else bySha.set(r.rgbaSha256,[i]);}
  for(const [name,p] of parsed){
    if(bound.has(name))continue;const it=imageTiers[p.stem];
    if(it&&it.accept!==false&&['D','E','F'].includes(it.tier)){
      const t=it.rgba.flatMap(s=>bySha.get(s)??[]);
      if(t.length){bound.set(name,{tier:it.tier,targets:t.sort((a,b)=>a-b)});continue;}
    }
    below.push({file:name,why:it?`image match below the bar (${it.tier})`:'no exact hash match and no accepted image match'});
  }
  return {bound,below};
}

/** A payload: a pack file linked as it is (its name), or bytes made here (a recoloured PNG). */
export interface BuiltHdPack {manifest:HdManifest;manifestBytes:Uint8Array;id:string;payloads:Map<string,string|Uint8Array>;below:BelowBar[]}
/**
 * The manifest from the bound files: one entry per decoded image, its best-tier file (ties by name); payloads named
 * `<n>.<ext>`. A tier C entry of a paletted record is its file recoloured for that record, one PNG per entry.
 */
export function buildHdManifest(records:readonly DiscTextureRecord[],files:readonly PackFile[],bound:Map<string,Resolution>,below:BelowBar[],
  meta:{name:string;method:string;game:string}):BuiltHdPack{
  const best=new Map<string,{file:string;tier:HdTier;rec:DiscTextureRecord}>();
  for(const [file,r] of [...bound].sort(([a],[b])=>a<b?-1:a>b?1:0))for(const i of r.targets){
    const rec=records[i]!,cur=best.get(rec.rgbaSha256);
    if(!cur||TIER_ORDER.indexOf(r.tier)<TIER_ORDER.indexOf(cur.tier))best.set(rec.rgbaSha256,{file,tier:r.tier,rec});
  }
  const byName=new Map(files.map(f=>[f.name,f]));
  const recoloured=(b:{tier:HdTier;rec:DiscTextureRecord})=>b.tier==='C'&&b.rec.pal!==null&&(b.rec.psm===PSM.T8||b.rec.psm===PSM.T4);
  const used=[...new Set([...best.values()].filter(b=>!recoloured(b)).map(b=>b.file))].sort();
  type Decl=Omit<HdEntry,'key'|'width'|'height'|'tier'|'source'>;
  const payloads=new Map<string,string|Uint8Array>(),decl=new Map<string,Decl>(),own=new Map<string,Decl>();
  const sha=(d:Uint8ClampedArray)=>createHash('sha256').update(d).digest('hex');
  const decode=(file:string)=>{const bytes=byName.get(file)!.read();return file.toLowerCase().endsWith('.png')?decodePng(bytes):decodeDds(bytes);};
  let n=0;
  for(const file of used){
    const ext=file.toLowerCase().endsWith('.png')?'png':'dds',img=decode(file),out=`${n++}.${ext}`;payloads.set(out,file);
    decl.set(file,{file:out,format:ext,outWidth:img.width,outHeight:img.height,bytes:img.data.length,sha256:sha(img.data)});
  }
  for(const [key,b] of [...best].sort(([a],[c])=>a<c?-1:1)){
    if(!recoloured(b))continue;
    const img=recolour(decode(b.file),b.rec),out=`${n++}.png`;payloads.set(out,encodePng(img.width,img.height,img.data));
    own.set(key,{file:out,format:'png',outWidth:img.width,outHeight:img.height,bytes:img.data.length,sha256:sha(img.data)});
  }
  const entries:HdEntry[]=[...best].sort(([a],[b])=>a<b?-1:1).map(([key,b])=>({key,width:b.rec.width,height:b.rec.height,...(own.get(key)??decl.get(b.file)!),tier:b.tier,source:b.file}));
  const totalBytes=[...decl.values(),...own.values()].reduce((t,d)=>t+d.bytes,0);
  const manifest=validateHdManifest({format:'s2u-hd-texture-pack',version:1,localOnly:true,game:meta.game,name:meta.name,method:meta.method,entries,totalBytes});
  const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest));
  return {manifest,manifestBytes,id:createHash('sha256').update(manifestBytes).digest('hex'),payloads,below};
}
export {pcsx2Names};
