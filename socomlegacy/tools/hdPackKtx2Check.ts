import {ddsInfo,decodeDds} from '../packages/viewer/src/dds';
import type {HdEntry,HdManifest} from '../packages/viewer/src/hdTexturePack';
import {hdPackFiles} from '../packages/viewer/src/hdPackLayout';
import {readKtx2} from '../packages/viewer/src/ktx2';
import {ddsToKtx2,ktx2Rgba} from './hdPackKtx2';

/**
 * WM-PACK-2 (b): the exactness check over a whole pack, the box's test (`./test/hdPackKtx2Box.test.ts`) and CLI
 * (`./hd-pack-ktx2.ts`): for every DDS payload, its KTX2 decodes to the same RGBA as the DDS, and the KTX2's level 0
 * is the DDS's level-0 bytes (a compressed DDS). PNG payloads are not converted (no blocks) and are counted apart.
 */
export interface Ktx2PackCheck {payloads:number;converted:number;png:number;byKind:Record<string,number>;levels:Record<string,number>;
  ddsBytes:number;ktx2Bytes:number;mismatches:{file:string;why:string}[]}
const same=(a:ArrayLike<number>,b:ArrayLike<number>)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};

export function checkPackKtx2(manifest:HdManifest,read:(file:string)=>Uint8Array,keep?:(file:string,ktx2:Uint8Array)=>void):Ktx2PackCheck{
  // Review M1: every payload the pack carries -- its layout overlay's too (WM-32, `hdPackFiles`).
  const files=hdPackFiles(manifest).map(e=>e.file).sort((a,b)=>parseInt(a)-parseInt(b));
  const r:Ktx2PackCheck={payloads:files.length,converted:0,png:0,byKind:{},levels:{},ddsBytes:0,ktx2Bytes:0,mismatches:[]};
  for(const f of files){
    if(!/\.dds$/i.test(f)){r.png++;continue;}
    try{
      const dds=read(f),info=ddsInfo(dds),k=ddsToKtx2(dds),img=readKtx2(k);
      if(!same(ktx2Rgba(k),decodeDds(dds).data)){r.mismatches.push({file:f,why:'the KTX2 decodes to other RGBA than its DDS'});continue;}
      if(info.kind!=='rgba'&&info.kind!=='bgra'&&!same(img.levels[0]!.data,dds.subarray(info.offset,info.offset+img.levels[0]!.data.length))){
        r.mismatches.push({file:f,why:'level 0 is not the DDS\'s blocks'});continue;
      }
      r.converted++;r.byKind[img.kind]=(r.byKind[img.kind]??0)+1;r.levels[img.levels.length]=(r.levels[img.levels.length]??0)+1;
      r.ddsBytes+=dds.length;r.ktx2Bytes+=k.length;keep?.(f,k);
    }catch(x){r.mismatches.push({file:f,why:x instanceof Error?x.message:String(x)});}
  }
  return r;
}

/**
 * WM-34 (product track: a tool): the manifest of the pack converted to KTX2 -- each converted payload's entries renamed
 * `<n>.ktx2`, format `ktx2`, every other field kept (the decoded RGBA is the same, so its size and sha256 are), every
 * other payload as it was. `converted`: the old file name -> its KTX2's bytes; `sizeOf`: an unconverted file's bytes.
 * `packedBytes`: the new pack's payload files, once each. Throws, in words, on a converted name the pack has not got or
 * an unconverted payload with no size.
 */
export function ktx2PackManifest(manifest:HdManifest,converted:ReadonlyMap<string,number>,sizeOf:(file:string)=>number):HdManifest{
  // Review M1: the layout overlay's payloads (WM-32) are the pack's too -- renamed alike, counted in packedBytes.
  const files=new Set(hdPackFiles(manifest).map(e=>e.file));
  for(const f of converted.keys())if(!files.has(f))throw new Error(`${f} is not a payload of the pack`);
  let packed=0;
  for(const f of files){
    const n=converted.get(f)??sizeOf(f);
    if(!Number.isSafeInteger(n)||n<1)throw new Error(`${f} has no size in the converted pack`);
    packed+=n;
  }
  const rename=(e:HdEntry):HdEntry=>converted.has(e.file)?{...e,file:e.file.replace(/\.dds$/i,'.ktx2'),format:'ktx2' as const}:e;
  const entries=manifest.entries.map(rename);
  const tag=' (KTX2: tools/hd-pack-ktx2.ts)',method=(manifest.method.length+tag.length<=512?manifest.method:manifest.method.slice(0,512-tag.length))+tag;
  return {...manifest,method,entries,...(manifest.layouts?{layouts:{...manifest.layouts,...(manifest.layouts.xbox?{xbox:manifest.layouts.xbox.map(rename)}:{})}}:{}),packedBytes:packed};
}
