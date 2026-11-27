import {ddsInfo,decodeDds} from '../packages/viewer/src/dds';
import type {HdManifest} from '../packages/viewer/src/hdTexturePack';

/**
 * WM-PACK-2 (a), WM.R13 (product track: a tool, nothing a player runs): the HD pack's census, the evidence the
 * format work waits on (8f, 2026-11-15). For every payload: its format, size, DDS levels, alpha range, whether it is
 * opaque once the runtime's alpha rescale has run (`fullAlpha`, hdTexturePack.ts: `min(255, round(a*255/128))`), and
 * whether its BLOCKS could go to the GPU as they are and sample exactly what today's decode draws ("exact"):
 * - bc1: always (its alpha is 0 or 255, the rescale's fixed points);
 * - bc2, bc7: only when every alpha is 0 or 255 (a 4-bit or BC7 alpha cannot hold the rescaled values);
 * - bc3: when every block, its alpha endpoints rescaled, decodes each texel it uses to the rescale of the original
 *   (`bc3RescaleExact`); its colour block is untouched;
 * - rgba/bgra DDS and PNG: no blocks, uploaded as RGBA either way.
 * Then per entry what the runtime rules would do (placements over the original need its disc pixels: RGBA; over a
 * whole, only block-aligned ones could stay blocks), and the GPU bytes either way (level 0; a chain adds a third).
 */
export type PayloadKind='bc1'|'bc2'|'bc3'|'bc7'|'rgba'|'bgra'|'png';
export interface PayloadCensus {file:string;kind:PayloadKind;width:number;height:number;levels:number;
  alphaMin:number;alphaMax:number;opaque:boolean;exact:boolean;gpuBytes:number;rgbaBytes:number}
export interface KindRow {kind:PayloadKind;payloads:number;exact:number;opaque:number;gpuBytes:number;rgbaBytes:number}
export interface PackCensus {
  pack:{name:string;entries:number;payloads:number};
  payloads:PayloadCensus[];
  byKind:KindRow[];
  levels:{levels:number;payloads:number}[];
  entries:{total:number;whole:number;wholeExact:number;placementOverOriginal:number;placementOverWhole:number;placementAligned:number};
  gpu:{compressedWhereExact:number;allRgba:number};
  refused:{file:string;why:string}[];
}

const rescale=(a:number)=>Math.min(255,Math.round((a*255)/128));
/** A BC3 alpha block's eight values, as `dds.ts` `alphaBlock` computes them (the test holds the two equal). */
export function bc3AlphaPalette(a0:number,a1:number):number[]{
  const a=[a0,a1,0,0,0,0,0,0];
  if(a0>a1)for(let k=1;k<7;k++)a[k+1]=(((7-k)*a0+k*a1)/7)|0;
  else{for(let k=1;k<5;k++)a[k+1]=(((5-k)*a0+k*a1)/5)|0;a[6]=0;a[7]=255;}
  return a;
}
/** The block at `at` (16 bytes) stays exact with its alpha endpoints rescaled: the mode kept, each used index's value the rescale of the original's. */
export function bc3RescaleExact(b:Uint8Array,at:number):boolean{
  const a0=b[at]!,a1=b[at+1]!,r0=rescale(a0),r1=rescale(a1);
  if((a0>a1)!==(r0>r1))return false;
  const p=bc3AlphaPalette(a0,a1),q=bc3AlphaPalette(r0,r1);
  const lo=b[at+2]!|(b[at+3]!<<8)|(b[at+4]!<<16),hi=b[at+5]!|(b[at+6]!<<8)|(b[at+7]!<<16);
  for(let i=0;i<16;i++){const ix=i<8?(lo>>(3*i))&7:(hi>>(3*(i-8)))&7;if(q[ix]!==rescale(p[ix]!))return false;}
  return true;
}
function ddsLevels(b:Uint8Array):number{
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  return (v.getUint32(8,true)&0x20000)?Math.max(1,v.getUint32(28,true)):1;
}

/** One payload's census; a PNG is counted by its header only (no blocks: RGBA either way). */
export function payloadCensus(file:string,bytes:Uint8Array):PayloadCensus{
  if(file.toLowerCase().endsWith('.png')){
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),w=v.getUint32(16),h=v.getUint32(20);
    return {file,kind:'png',width:w,height:h,levels:1,alphaMin:-1,alphaMax:-1,opaque:false,exact:false,gpuBytes:w*h*4,rgbaBytes:w*h*4};
  }
  const info=ddsInfo(bytes),img=decodeDds(bytes),d=img.data;
  let lo=255,hi=0,binary=true;
  for(let i=3;i<d.length;i+=4){const a=d[i]!;if(a<lo)lo=a;if(a>hi)hi=a;if(a!==0&&a!==255)binary=false;}
  const opaque=lo>=128;                                             // rescale(a) === 255 exactly when a >= 128
  const blocks=Math.ceil(info.width/4)*Math.ceil(info.height/4),rgbaBytes=info.width*info.height*4;
  let exact=false,gpuBytes=rgbaBytes;
  if(info.kind==='bc1'){exact=true;gpuBytes=blocks*8;}
  else if(info.kind==='bc2'||info.kind==='bc7'){exact=binary;gpuBytes=blocks*16;}
  else if(info.kind==='bc3'){exact=true;gpuBytes=blocks*16;for(let n=0;n<blocks&&exact;n++)exact=bc3RescaleExact(bytes,info.offset+n*16);}
  return {file,kind:info.kind,width:info.width,height:info.height,levels:ddsLevels(bytes),alphaMin:lo,alphaMax:hi,opaque,exact,gpuBytes,rgbaBytes};
}

/** The whole pack: every payload the manifest names (read through `read`), then the entries' paths. */
export function packCensus(manifest:HdManifest,read:(file:string)=>Uint8Array):PackCensus{
  const files=[...new Set(manifest.entries.map(e=>e.file))].sort((a,b)=>parseInt(a)-parseInt(b));
  const payloads:PayloadCensus[]=[],refused:{file:string;why:string}[]=[];
  for(const f of files){try{payloads.push(payloadCensus(f,read(f)));}catch(x){refused.push({file:f,why:x instanceof Error?x.message:String(x)});}}
  const byFile=new Map(payloads.map(p=>[p.file,p]));
  const kinds=new Map<PayloadKind,KindRow>();
  for(const p of payloads){
    const r=kinds.get(p.kind)??{kind:p.kind,payloads:0,exact:0,opaque:0,gpuBytes:0,rgbaBytes:0};
    r.payloads++;if(p.exact)r.exact++;if(p.opaque)r.opaque++;r.gpuBytes+=p.gpuBytes;r.rgbaBytes+=p.rgbaBytes;kinds.set(p.kind,r);
  }
  const lv=new Map<number,number>();for(const p of payloads)lv.set(p.levels,(lv.get(p.levels)??0)+1);
  const wholes=new Map(manifest.entries.filter(e=>!e.placements).map(e=>[e.key,e]));
  const ent={total:manifest.entries.length,whole:0,wholeExact:0,placementOverOriginal:0,placementOverWhole:0,placementAligned:0};
  for(const e of manifest.entries){
    if(!e.placements){ent.whole++;if(byFile.get(e.file)?.exact)ent.wholeExact++;continue;}
    const w=wholes.get(e.key);
    if(!w){ent.placementOverOriginal++;continue;}
    ent.placementOverWhole++;
    // drawPlacementsSteps (hdTexturePack.ts) draws over the whole at ITS scale (out.width/width), rounding each edge; the
    // blocks survive only where the source lands 1:1 on 4-aligned texels: no averaging, no filtering.
    const sx=w.outWidth/e.width,sy=w.outHeight/e.height;
    if(e.placements.every(({dst:[dx,dy,dw,dh],src})=>{
      const x0=Math.round(dx*sx),y0=Math.round(dy*sy),ow=Math.round((dx+dw)*sx)-x0,oh=Math.round((dy+dh)*sy)-y0;
      return src.every(n=>n%4===0)&&ow===src[2]&&oh===src[3]&&[x0,y0,ow,oh].every(n=>n%4===0);
    }))ent.placementAligned++;
  }
  return {
    pack:{name:manifest.name,entries:manifest.entries.length,payloads:files.length},
    payloads,
    byKind:[...kinds.values()].sort((a,b)=>a.kind<b.kind?-1:1),
    levels:[...lv].map(([levels,n])=>({levels,payloads:n})).sort((a,b)=>a.levels-b.levels),
    entries:ent,
    gpu:{compressedWhereExact:payloads.reduce((t,p)=>t+(p.exact?p.gpuBytes:p.rgbaBytes),0),allRgba:payloads.reduce((t,p)=>t+p.rgbaBytes,0)},
    refused,
  };
}

const mib=(n:number)=>`${(n/1048576).toFixed(1)} MiB`;
export function censusMarkdown(c:PackCensus):string{
  const L=[`# HD pack census: ${c.pack.name}`,'',`${c.pack.entries} entries, ${c.pack.payloads} payloads${c.refused.length?`, ${c.refused.length} refused`:''}. GPU bytes at level 0 (a chain adds a third).`,'',
    '| kind | payloads | exact as blocks | opaque after the rescale | GPU bytes as blocks | GPU bytes as RGBA |','|---|---|---|---|---|---|'];
  for(const r of c.byKind)L.push(`| ${r.kind} | ${r.payloads} | ${r.exact} | ${r.opaque} | ${mib(r.gpuBytes)} | ${mib(r.rgbaBytes)} |`);
  L.push('','| DDS levels | payloads |','|---|---|',...c.levels.map(l=>`| ${l.levels} | ${l.payloads} |`));
  const e=c.entries;
  L.push('','| entries | count |','|---|---|',`| total | ${e.total} |`,`| whole | ${e.whole} |`,`| whole, payload exact as blocks | ${e.wholeExact} |`,
    `| placement over the original (RGBA: needs the disc's pixels) | ${e.placementOverOriginal} |`,`| placement over a whole | ${e.placementOverWhole} |`,`| of those, block-aligned | ${e.placementAligned} |`);
  L.push('',`GPU bytes, every payload: ${mib(c.gpu.allRgba)} as RGBA (today); ${mib(c.gpu.compressedWhereExact)} with the exact ones as blocks and the rest RGBA.`);
  L.push('','Not counted here (known only at run time): textures drawn flipped by the 2D drawers, the CPU menus compositor\'s bitmaps, and which originals carry a mip chain.');
  if(c.refused.length)L.push('','| refused | why |','|---|---|',...c.refused.map(r=>`| \`${r.file}\` | ${r.why} |`));
  return L.join('\n')+'\n';
}
