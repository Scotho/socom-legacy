import type {HdPlacementKind} from '../packages/viewer/src/hdTexturePack';
import type {DiscTextureRecord} from './discTextureRecords';
import {parseName,type BelowBar} from './hdPack';
import {clutBytes,pcsx2Names,PSM,TEXA_TRIES,xxh3,type HashRecord,type Texa} from './pcsx2Names';

/**
 * OT.R92, plan 2026-10-31-hd-texture-pack-parity HD.R9: the pack files PCSX2 named for a part of a texture -- a window
 * the game read at an offset, a clamped region, 16x16 blocks, the intact half of an overlapped read -- each placed on
 * that part of its target (the viewer's `HdEntry.placements`). The rows (`tools/data/hd-placements.json`, written by
 * `./hd-placements-from-ledgers`) come from the matching rounds; none is placed on their word alone: each file's PCSX2
 * name is re-derived here from the disc's texels at its placement (`proof`), or the row is refused with why. A browser
 * adaptation's tool.
 */
export type Rect=[x:number,y:number,w:number,h:number];
/**
 * One pack file and where it goes. `read`: the size of the texture PCSX2 named (the read, or the region), in texels;
 * `placements[].dst`: the target's texels; `placements[].src`: the read's texels (scaled to the pack image's pixels when
 * the manifest is built). `proof`: `name` -- the read assembled from `parts` (each `rect` of the target, or of the record
 * decoding to `sha256` or else read from `where`, put at `at`) under the target's CLUT carries the file's name; `region` -- the texel hash of the target's
 * indices over `rect` (one byte a texel, row by row: PCSX2's clamped-region hash) and the target's CLUT hash are the name's.
 */
export interface PlacementRow {
  file:string;kind:HdPlacementKind;targets:{sha256:string;where:string}[];read:[number,number];
  proof:{kind:'name';parts:{where?:string;sha256?:string;rect:Rect;at:[number,number]}[]}|{kind:'region';rect:Rect};
  placements:{dst:Rect;src:Rect}[];evidence:string;
}
export interface PlacementsFile {version:1;about:string;rows:PlacementRow[]}
/** A row whose name was re-derived: its targets (by decode, with their sizes) and its rectangles. */
export interface PlacedFile {file:string;kind:HdPlacementKind;targets:{sha256:string;width:number;height:number}[];read:[number,number];placements:{dst:Rect;src:Rect}[]}

const BYTES:Record<number,number>={[PSM.T8]:1,[PSM.CT16]:2,[PSM.CT16S]:2,[PSM.CT32]:4};
const inside=([x,y,w,h]:Rect,width:number,height:number)=>x>=0&&y>=0&&w>0&&h>0&&x+w<=width&&y+h<=height;
const log2=(n:number)=>{const l=Math.log2(n);return Number.isInteger(l)?l:-1;};

/** The read a `name` proof describes, as a record PCSX2 would hash: the target's format and CLUT, the parts' texels. */
export function assembleRead(target:DiscTextureRecord,read:[number,number],parts:{rect:Rect;at:[number,number];from:DiscTextureRecord}[],tcc:number):HashRecord|null{
  const b=BYTES[target.psm],[w,h]=read,tw=log2(w),th=log2(h);
  if(!b||tw<0||th<0)return null;
  const px=new Uint8Array(w*h*b);
  for(const {rect,at,from} of parts){
    const [rx,ry,rw,rh]=rect;
    if(from.psm!==target.psm||!inside(rect,from.width,from.height)||!inside([at[0],at[1],rw,rh],w,h))return null;
    for(let y=0;y<rh;y++){const s=((ry+y)*from.width+rx)*b;px.set(from.pixels.subarray(s,s+rw*b),((at[1]+y)*w+at[0])*b);}
  }
  return {psm:target.psm,tw,th,tcc,csa:target.csa,csm:target.csm,width:w,height:h,pixels:px,pal:target.pal,palFormat:target.palFormat};
}
/** PCSX2's texel hash of a clamped region: the indices over `rect`, one byte a texel, row by row (T4 and T8). */
export async function regionTexHash(r:DiscTextureRecord,[x,y,w,h]:Rect):Promise<string|null>{
  if(r.psm!==PSM.T4&&r.psm!==PSM.T8)return null;
  const out=new Uint8Array(w*h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const at=(y+j)*r.width+x+i;out[j*w+i]=r.psm===PSM.T8?r.pixels[at]!:(r.pixels[at>>1]!>>((at&1)*4))&15;
  }
  return xxh3(out);
}

/** Every row checked against the records and the pack's file names: the placed, and the refused with why. */
export async function resolvePlacements(rows:readonly PlacementRow[],records:readonly DiscTextureRecord[],files:ReadonlySet<string>):Promise<{placed:PlacedFile[];refused:BelowBar[]}>{
  const bySha=new Map<string,DiscTextureRecord[]>(),byWhere=new Map<string,DiscTextureRecord>();
  for(const r of records){
    const l=bySha.get(r.rgbaSha256);if(l)l.push(r);else bySha.set(r.rgbaSha256,[r]);
    const w=r.where.replace(/^extra:/,'');if(!byWhere.has(w))byWhere.set(w,r);
  }
  const placed:PlacedFile[]=[],refused:BelowBar[]=[];
  for(const row of rows){
    const why=await check(row);
    if(typeof why==='string')refused.push({file:row.file,why:`placement refused: ${why}`});else placed.push(why);
  }
  return {placed,refused};

  async function check(row:PlacementRow):Promise<string|PlacedFile>{
    if(!files.has(row.file))return 'not in the pack';
    const name=parseName(row.file);if(!name)return 'not a PCSX2 replacement name';
    const stem=row.file.replace(/\.(dds|png)$/i,'');
    const targets:PlacedFile['targets']=[];
    for(const t of row.targets){
      const cands=bySha.get(t.sha256)??[];
      if(!cands.length)return `no record decodes to ${t.sha256.slice(0,16)} (${t.where}) -- its disc or extra root not read?`;
      const c=cands[0]!;
      if(!row.placements.every(p=>inside(p.dst,c.width,c.height)&&inside(p.src,row.read[0],row.read[1])))return `a rectangle is outside ${t.where} or its read`;
      let ok=false;
      for(const r of cands){
        if(row.proof.kind==='region'){
          if(!inside(row.proof.rect,r.width,r.height)||await regionTexHash(r,row.proof.rect)!==name.tex)continue;
          for(const texa of r.palFormat===0?[[0,0,0x80] as Texa]:TEXA_TRIES){const cb=clutBytes(r,texa);if(cb&&await xxh3(cb)===name.clut){ok=true;break;}}
        }else{
          // A record read twice (one library's texture in another) is kept once, under the first library read: a
          // neighbour is found by its decode where the rounds named it, else by where it was read.
          const other=(p:{where?:string;sha256?:string})=>(p.sha256&&bySha.get(p.sha256)?.[0])||(p.where&&byWhere.get(p.where))||undefined;
          const parts=row.proof.parts.map(p=>({rect:p.rect,at:p.at,from:p.where===undefined&&p.sha256===undefined?r:other(p)}));
          const lost=row.proof.parts.find((p,i)=>!parts[i]!.from);
          if(lost)return `a part's record (${lost.where??lost.sha256}) is not among the records`;
          const sub=assembleRead(r,row.read,parts as {rect:Rect;at:[number,number];from:DiscTextureRecord}[],name.tcc);
          ok=!!sub&&(await pcsx2Names(sub)).some(n=>n.name===stem);
        }
        if(ok)break;
      }
      if(!ok)return `its name is not re-derived from ${t.where} at its placement (${row.proof.kind})`;
      targets.push({sha256:t.sha256,width:c.width,height:c.height});
    }
    return {file:row.file,kind:row.kind,targets,read:row.read,placements:row.placements};
  }
}
