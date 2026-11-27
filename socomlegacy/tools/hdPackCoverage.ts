import type {HdManifest} from '../packages/viewer/src/hdTexturePack';
import {sourceRecords,textureSources} from './discTextureRecords';

/**
 * WM-50 (WM-PACK-1; product track -- a tool for the owner, nothing the game does): the HD pack's per-map coverage,
 * counted by key (HD.R3: the sha256 of the RGBA `decodeTexture` returns) as the 2026-10-31 HD plan's "Per-map coverage"
 * section counted it by hand. A source is one archive of texture banks: a `RUN/<map>.ZDB`, or a directory of loose
 * `*_TXR.ZED` (the disc's own, or an extra root's -- the downloadable maps). Its records are every named texture record
 * of its banks; its images those records de-duplicated by key within the archive, so a bank shared by many maps counts
 * in each (the plan's "images deduplicated within the archive"). A key is
 * bound "whole" when a manifest entry with no placements has it, "placement only" when only placement entries (HD.R9) do.
 */
export interface CoverageImage {bank:string;name:string;key:string}
export interface CoverageSource {where:string;images:CoverageImage[]}
export type SourceKind='map'|'mission'|'other';
export interface Counts {records:number;images:number;whole:number;placementOnly:number;none:number;percent:number;unbound:string[]}
export interface CoverageRow {where:string;label:string;kind:SourceKind;ownBank:string|null;own:Counts|null;archive:Counts;entriesUsed:number}
export interface Totals {images:number;whole:number;placementOnly:number;none:number;percent:number;entriesUsed:number}
export interface UnboundFile {name:string;bytes:number;why:string}
export interface CoverageReport {
  pack:{name:string;entries:number;keys:number;files:number};
  rows:CoverageRow[];
  totals:{maps:Totals;all:Totals};
  unusedEntries:{key:string;file:string;source:string;placement:boolean}[];
  unbound?:{files:number;bytes:number;byWhy:{why:string;files:number;bytes:number}[];list:UnboundFile[]};
}

/**
 * `RUN/MP6.ZDB` a map, `RUN/M51.ZDB` a mission, a directory named `MP<n>` (a downloadable map's files) a map; the rest
 * other. An extra root's source is `extra:<package>:<path>` (`extraRootNames`): its rows carry the package's name, a
 * map's as `MP54 (pkg00)`, the rest as `pkg00: RUN/UI` (box run 11: the three packages' RUN/COMMON and RUN/UI rows
 * could not be told apart). `extra:<path>`, with no package, is read as before.
 */
export function sourceKind(where:string):{label:string;kind:SourceKind;ownBank:string|null}{
  const x=/^extra:(?:([^:/\\]+):)?(.*)$/.exec(where),pkg=x?.[1],path=x?x[2]!:where;
  const last=path.split('/').at(-1)!;
  const m=/^(M|MP)(\d+)(\.ZDB)?$/i.exec(last);
  if(!m||(m[1]!.toUpperCase()==='M'&&!m[3]))return {label:pkg?`${pkg}: ${path}`:where,kind:'other',ownBank:null};
  const name=`${m[1]!.toUpperCase()}${m[2]}`;
  return {label:pkg?`${name} (${pkg})`:name,kind:m[1]!.toUpperCase()==='MP'?'map':'mission',ownBank:`${name}_TXR.ZED`};
}

/** Each extra root's package name: its last directory, `-2`, `-3` ... on a repeat; never a `:`. */
export function extraRootNames(roots:readonly string[]):string[]{
  const seen=new Map<string,number>();
  return roots.map(r=>{
    const base=(r.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1)||'extra').replace(/:/g,'_');
    const n=(seen.get(base)??0)+1;seen.set(base,n);return n>1?`${base}-${n}`:base;
  });
}

const pct=(bound:number,images:number)=>images?Math.round(bound/images*1000)/10:0;
const KIND_ORDER:SourceKind[]=['map','mission','other'];
const labelOrder=(a:string,b:string)=>{
  const na=/\d+/.exec(a)?.[0],nb=/\d+/.exec(b)?.[0],pa=a.replace(/\d+.*$/,''),pb=b.replace(/\d+.*$/,'');
  return pa!==pb||na===undefined||nb===undefined?(a<b?-1:a>b?1:0):Number(na)-Number(nb);
};

export function coverageReport(sources:readonly CoverageSource[],manifest:HdManifest,unbound?:readonly UnboundFile[]):CoverageReport{
  const wholeKeys=new Set<string>(),placedKeys=new Set<string>(),byKey=new Map<string,number>();
  for(const e of manifest.entries){(e.placements?placedKeys:wholeKeys).add(e.key);byKey.set(e.key,(byKey.get(e.key)??0)+1);}
  const state=(key:string)=>wholeKeys.has(key)?'whole':placedKeys.has(key)?'placement':'none';
  const counts=(images:readonly CoverageImage[]):Counts=>{
    const first=new Map<string,CoverageImage>();for(const i of images)if(!first.has(i.key))first.set(i.key,i);
    let whole=0,placementOnly=0;const unbound:string[]=[];
    for(const [key,i] of first){const s=state(key);if(s==='whole')whole++;else if(s==='placement')placementOnly++;else unbound.push(i.name);}
    return {records:images.length,images:first.size,whole,placementOnly,none:first.size-whole-placementOnly,percent:pct(whole+placementOnly,first.size),unbound:unbound.sort()};
  };
  const used=(keys:Iterable<string>)=>{let n=0;for(const k of new Set(keys))n+=byKey.get(k)??0;return n;};
  const rows:CoverageRow[]=sources.map(s=>{
    const {label,kind,ownBank}=sourceKind(s.where);
    const own=ownBank?s.images.filter(i=>i.bank.toUpperCase()===ownBank):[];
    return {where:s.where,label,kind,ownBank:own.length?ownBank:null,own:own.length?counts(own):null,archive:counts(s.images),entriesUsed:used(s.images.map(i=>i.key))};
  }).sort((a,b)=>KIND_ORDER.indexOf(a.kind)-KIND_ORDER.indexOf(b.kind)||labelOrder(a.label,b.label));
  const totals=(list:readonly CoverageSource[]):Totals=>{
    const keys=new Set(list.flatMap(s=>s.images.map(i=>i.key)));let whole=0,placementOnly=0;
    for(const k of keys){const s=state(k);if(s==='whole')whole++;else if(s==='placement')placementOnly++;}
    return {images:keys.size,whole,placementOnly,none:keys.size-whole-placementOnly,percent:pct(whole+placementOnly,keys.size),entriesUsed:used(keys)};
  };
  const all=new Set(sources.flatMap(s=>s.images.map(i=>i.key)));
  const report:CoverageReport={
    pack:{name:manifest.name,entries:manifest.entries.length,keys:byKey.size,files:new Set(manifest.entries.map(e=>e.file)).size},
    rows,
    totals:{maps:totals(sources.filter(s=>sourceKind(s.where).kind!=='other')),all:totals(sources)},
    unusedEntries:manifest.entries.filter(e=>!all.has(e.key)).map(e=>({key:e.key,file:e.file,source:e.source,placement:!!e.placements})),
  };
  if(unbound){
    const by=new Map<string,{why:string;files:number;bytes:number}>();
    for(const u of unbound){const w=by.get(u.why)??{why:u.why,files:0,bytes:0};w.files++;w.bytes+=u.bytes;by.set(u.why,w);}
    report.unbound={files:unbound.length,bytes:unbound.reduce((t,u)=>t+u.bytes,0),byWhy:[...by.values()].sort((a,b)=>b.files-a.files||(a.why<b.why?-1:1)),list:[...unbound]};
  }
  return report;
}

/** The builder's left-out list: `name<TAB>bytes<TAB>why` a line; a header line (bytes not a number on line 1) is skipped. */
export function parseUnboundTsv(text:string):UnboundFile[]{
  const out:UnboundFile[]=[];
  for(const [i,raw] of text.split('\n').entries()){
    const line=raw.replace(/\r$/,'');if(!line.trim())continue;
    const [name,bytes,...why]=line.split('\t');
    if(i===0&&bytes?.trim().toLowerCase()==='bytes')continue;
    if(!name||!bytes||!/^\d+$/.test(bytes.trim())||!why.length)throw new Error(`unbound list line ${i+1}: not name<TAB>bytes<TAB>why: ${JSON.stringify(line)}`);
    out.push({name,bytes:Number(bytes.trim()),why:why.join('\t')});
  }
  return out;
}

const p1=(n:number)=>`${n.toFixed(1)} %`;
/** The markdown names at most 12 of a bank's unbound images (the JSON has every one). */
const names=(c:Counts)=>c.none?`${c.none}: ${c.unbound.slice(0,12).join(', ')}${c.unbound.length>12?`, and ${c.unbound.length-12} more`:''}`:'0';
export function coverageMarkdown(r:CoverageReport):string{
  const L:string[]=[];
  L.push(`# HD pack coverage: ${r.pack.name}`,'',
    `Pack: ${r.pack.entries} entries, ${r.pack.keys} keys, ${r.pack.files} files. Counted by key (HD.R3), whole entries first, then placement-only (HD.R9).`,'',
    '| source | kind | own bank: records / images | own bank bound | own bank not bound | own bank % | archive: images / whole / placement only / none | archive % | pack entries used |',
    '|---|---|---|---|---|---|---|---|---|');
  for(const x of r.rows){
    const o=x.own,a=x.archive;
    L.push(`| ${x.label} | ${x.kind} | ${o?`${o.records} / ${o.images}`:'--'} | ${o?`${o.whole+o.placementOnly} (whole ${o.whole}, placement ${o.placementOnly})`:'--'} | ${o?names(o):'--'} | ${o?p1(o.percent):'--'} | ${a.images} / ${a.whole} / ${a.placementOnly} / ${a.none} | ${p1(a.percent)} | ${x.entriesUsed} |`);
  }
  L.push('','## Totals','','| over | images | whole | placement only | none | bound % | pack entries used |','|---|---|---|---|---|---|---|');
  for(const [n,t] of [['maps and missions',r.totals.maps],['every source',r.totals.all]] as const)
    L.push(`| ${n} | ${t.images} | ${t.whole} | ${t.placementOnly} | ${t.none} | ${p1(t.percent)} | ${t.entriesUsed} |`);
  L.push('',`## Pack entries no source uses (${r.unusedEntries.length})`,'');
  if(r.unusedEntries.length){L.push('| file | source | placement | key |','|---|---|---|---|');for(const e of r.unusedEntries)L.push(`| \`${e.file}\` | ${e.source} | ${e.placement?'yes':'no'} | ${e.key.slice(0,16)} |`);}
  else L.push('None.');
  if(r.unbound){
    L.push('',`## The archive's files left out (${r.unbound.files}, ${r.unbound.bytes} bytes)`,'','| why | files | bytes |','|---|---|---|');
    for(const w of r.unbound.byWhy)L.push(`| ${w.why} | ${w.files} | ${w.bytes} |`);
    L.push('','| file | bytes | why |','|---|---|---|');
    for(const u of r.unbound.list)L.push(`| \`${u.name}\` | ${u.bytes} | ${u.why} |`);
  }
  return L.join('\n')+'\n';
}

/** Every texture source under a root, read one at a time (each source's decoded images dropped as soon as it is keyed). */
export function readCoverageSources(root:string,opts:{prefix?:string;only?:(where:string)=>boolean;warn?:(m:string)=>void}={}):CoverageSource[]{
  const out:CoverageSource[]=[];
  for(const src of textureSources(root)){
    const where=`${opts.prefix??''}${src.where}`;
    if(opts.only&&!opts.only(where))continue;
    const images=sourceRecords(src,opts.warn,null).map(r=>({bank:r.where.slice(src.where.length+1).split(':')[0]!.toUpperCase(),name:r.name,key:r.rgbaSha256}));
    if(images.length)out.push({where,images});
  }
  return out;
}
