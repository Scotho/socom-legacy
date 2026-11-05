import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {PlacementRow,PlacementsFile} from './hdPlacements';

/**
 * OT.R92, plan 2026-10-31-hd-texture-pack-parity HD.R9: writes `tools/data/hd-placements.json` -- the HD pack files the
 * matching rounds placed on a part of a texture -- from the rounds' ledgers, which are scratch (never in git). A browser
 * adaptation's tool; no disc bytes and no pack bytes are written, only names, hashes of decodes and rectangles.
 *
 * Usage: tsx tools/hd-placements-from-ledgers.ts <final3.json> <s3_region.json> [--out <json>]
 *
 * Inputs (the matching rounds' shapes, 2026-11-01):
 * - `final3.json` -- round 3's synthesis: `{files: {<pack file stem>: row}}`, a row's `tier` its verdict. Taken:
 *   - `A-crop`: `where` (the target record), `target` (its decode's sha256), `tw`/`th` (the read), `rect` [x, y, w, h]
 *     (the window of the target the read is).
 *   - `A-region`: `where`, `target`, `region` {x: [x0, x1), y: [y0, y1)} (PCSX2's clamped region of the target).
 *   - `A-blockwindow`: as `A-crop`.
 *   - `A-blocks`: `where`, `target`, `blockMap` [{packBlock: [x, y, 16, 16] of the read, recordXY: [x, y] of the target}].
 *   - `A-ct`: `targetsIdentical` (decode sha256s) and `targetWhere` (records, the same order), `placement`
 *     {x, y, w, h} (the window of each).
 *   - `A-vram`: `target`, `tw`/`th` (the read), the pool named in its evidence ("one modelled pool [<pool>]") and the
 *     read's parts ("Read covers: <texture> <n> texels: read [x0, y0, x1, y1] <- its [x0, y0, x1, y1]; ..."), the first
 *     the target's own texels; a neighbour's decode from `placement.others[].shas` where the row has it. The owner's word (2026-11-01, matching round 3, "Top half only"): the pack's art is
 *     placed on the target's own part only; the overlapping neighbour's part proves the name and is not placed.
 *   Held out by the owner's word ("Hold them out for now"): `A-tbw1`, `A-dlc`. Not placed: every other tier.
 * - `s3_region.json` -- the region step's hashes: `{<pack file stem>: {psm, tw, th, rect: [x, y, w, h], hits: [{where,
 *   sha, texel, clut}]}}`. A region name whose texel and CLUT hashes both reproduced from one record and that round 3
 *   does not list (three of them were bound by image, tier D) is taken as a region placement: raised to exact.
 * Each row keeps a short cite of its evidence; the generator (`./hdPlacements`) re-derives every pack file's PCSX2 name
 * from the disc at its placement before it places it.
 */
type Rect=[number,number,number,number];
type Ledger=Record<string,unknown>&{tier?:string;where?:string;target?:string;tw:number;th:number;evidence?:string};
const args=process.argv.slice(2),flag=(n:string)=>{const i=args.indexOf(n);if(i<0)return undefined;const v=args[i+1];args.splice(i,2);return v;};
const out=flag('--out')??join(import.meta.dirname,'data','hd-placements.json');
const [finalPath,regionPath]=args;
if(!finalPath||!regionPath){console.error('usage: hd-placements-from-ledgers.ts <final3.json> <s3_region.json> [--out <json>]');process.exit(2);}
const final=JSON.parse(readFileSync(finalPath,'utf8')) as {files:Record<string,Ledger>};
const regions=JSON.parse(readFileSync(regionPath,'utf8')) as Record<string,{rect:Rect;hits:{where:string;sha:string;texel:boolean;clut:boolean}[]}>;
const corners=(r:number[]):Rect=>[r[0]!,r[1]!,r[2]!-r[0]!,r[3]!-r[1]!];
const cite=(l:Ledger)=>(l.evidence??'').replace(/\s+/g,' ').slice(0,240);
const rows:PlacementRow[]=[];
for(const [stem,l] of Object.entries(final.files).sort(([a],[b])=>a<b?-1:1)){
  const file=`${stem}.dds`,target={sha256:l.target!,where:l.where!};
  if(l.tier==='A-crop'||l.tier==='A-blockwindow'){
    const rect=l.rect as Rect;
    rows.push({file,kind:l.tier==='A-crop'?'crop':'blockwindow',targets:[target],read:[l.tw,l.th],
      proof:{kind:'name',parts:[{rect,at:[0,0]}]},placements:[{dst:rect,src:[0,0,l.tw,l.th]}],evidence:cite(l)});
  }else if(l.tier==='A-region'){
    const g=l.region as {x:[number,number];y:[number,number]},rect:Rect=[g.x[0],g.y[0],g.x[1]-g.x[0],g.y[1]-g.y[0]];
    rows.push({file,kind:'region',targets:[target],read:[rect[2],rect[3]],proof:{kind:'region',rect},
      placements:[{dst:rect,src:[0,0,rect[2],rect[3]]}],evidence:cite(l)});
  }else if(l.tier==='A-blocks'){
    const map=l.blockMap as {packBlock:Rect;recordXY:[number,number]}[];
    rows.push({file,kind:'blocks',targets:[target],read:[l.tw,l.th],
      proof:{kind:'name',parts:map.map(b=>({rect:[b.recordXY[0],b.recordXY[1],b.packBlock[2],b.packBlock[3]] as Rect,at:[b.packBlock[0],b.packBlock[1]] as [number,number]}))},
      placements:map.map(b=>({dst:[b.recordXY[0],b.recordXY[1],b.packBlock[2],b.packBlock[3]] as Rect,src:b.packBlock})),evidence:cite(l)});
  }else if(l.tier==='A-ct'){
    const p=l.placement as {x:number;y:number;w:number;h:number},rect:Rect=[p.x,p.y,p.w,p.h];
    const shas=l.targetsIdentical as string[],wheres=l.targetWhere as string[];
    rows.push({file,kind:'ct',targets:shas.map((sha256,i)=>({sha256,where:wheres[i]!})),read:[l.tw,l.th],
      proof:{kind:'name',parts:[{rect,at:[0,0]}]},placements:[{dst:rect,src:[0,0,l.tw,l.th]}],evidence:cite(l)});
  }else if(l.tier==='A-vram'){
    const ev=l.evidence??'',pool=/one modelled pool \[([^\]]+)\]/.exec(ev)?.[1];
    const covers=/Read covers: (.*?)\. (?:CLUT|Placement)/.exec(ev)?.[1];
    if(!pool||!covers)throw new Error(`${stem}: no pool or read parts in its evidence`);
    const parts=[...covers.matchAll(/(\S+\.tif) \d+ texels: read \[\[?([\d, ]+)\]\]? <- its \[\[?([\d, ]+)\]\]?/g)].map(m=>({
      where:`${pool}:${m[1]}`,read:corners(m[2]!.split(',').map(Number)),its:corners(m[3]!.split(',').map(Number))}));
    if(parts.length<2)throw new Error(`${stem}: fewer than two read parts`);
    const own=parts[0]!,others=((l.placement as {others?:{texture:string;shas:string[]}[]}|undefined)?.others)??[];
    const shaOf=(where:string)=>others.find(o=>where.endsWith(`:${o.texture}`))?.shas[0];
    rows.push({file,kind:'vram-top',targets:[{sha256:l.target!,where:own.where}],read:[l.tw,l.th],
      proof:{kind:'name',parts:parts.map((p,i)=>{const sha256=i?shaOf(p.where):undefined;
        return {...(i?{where:p.where}:{}),...(sha256?{sha256}:{}),rect:p.its,at:[p.read[0],p.read[1]] as [number,number]};})},
      placements:[{dst:own.its,src:own.read}],evidence:cite(l)});
  }
}
const listed=new Set(rows.map(r=>r.file));
for(const [stem,r] of Object.entries(regions).sort(([a],[b])=>a<b?-1:1)){
  const file=`${stem}.dds`,hit=r.hits.find(h=>h.texel&&h.clut);
  if(listed.has(file)||!hit||r.hits.length!==1)continue;
  rows.push({file,kind:'region',targets:[{sha256:hit.sha,where:hit.where}],read:[r.rect[2],r.rect[3]],proof:{kind:'region',rect:r.rect},
    placements:[{dst:r.rect,src:[0,0,r.rect[2],r.rect[3]]}],evidence:'region step: texel and CLUT hash of the region reproduced from the record (bound by image, tier D, before)'});
}
const doc:PlacementsFile={version:1,
  about:'HD.R9: pack files placed on a part of their target, from the HD matching rounds (2026-11-01); tools/hd-placements-from-ledgers.ts wrote it, tools/hdPlacements.ts reads it',
  rows};
writeFileSync(out,JSON.stringify(doc,null,1)+'\n');
const kinds:Record<string,number>={};for(const r of rows)kinds[r.kind]=(kinds[r.kind]??0)+1;
console.log(JSON.stringify({rows:rows.length,kinds,out}));
