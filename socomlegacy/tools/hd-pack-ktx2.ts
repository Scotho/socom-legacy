import {copyFileSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {validateHdManifest} from '../packages/viewer/src/hdTexturePack';
import {hdPackFiles} from '../packages/viewer/src/hdPackLayout';
import {checkPackKtx2,ktx2PackManifest} from './hdPackKtx2Check';

/**
 * WM-PACK-2 (b), WM.R13 (product track: a tool): every DDS payload of a built HD pack converted to KTX2
 * (`./hdPackKtx2`) and checked exact -- its KTX2 decodes to the same RGBA as its DDS, and its level 0 is the DDS's own
 * blocks byte for byte. Exits 1 on any mismatch. With `--out`, writes `<n>.ktx2` there (third-party art: outside the
 * repository, never committed, HD.R5), with every unconverted payload copied and the pack's manifest
 * (`ktx2PackManifest`, WM-34), so the directory is a whole pack; without it, checks only.
 * Usage: tsx tools/hd-pack-ktx2.ts <pack dir> [--out <dir>] [--json <report.json>]
 */
const args=process.argv.slice(2),flag=(n:string)=>{const i=args.indexOf(n);if(i<0)return undefined;const v=args[i+1];args.splice(i,2);return v;};
const out=flag('--out'),jsonOut=flag('--json'),[dir]=args;
if(!dir||args.length!==1){console.error('usage: hd-pack-ktx2.ts <pack dir> [--out <dir>] [--json <report.json>]');process.exit(2);}
const manifest=validateHdManifest(JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8')));
if(out)mkdirSync(resolve(out),{recursive:true});
const t0=Date.now();
const converted=new Map<string,number>();
const r=checkPackKtx2(manifest,f=>new Uint8Array(readFileSync(join(dir,f))),out?(f,k)=>{writeFileSync(join(resolve(out),f.replace(/\.dds$/i,'.ktx2')),k);converted.set(f,k.length);}:undefined);
// WM-34: with `--out`, a whole pack -- every payload not converted (a PNG, a mismatch) copied as it is, and its
// manifest (`ktx2PackManifest`), so the directory loads as a pack.
if(out){
  for(const f of hdPackFiles(manifest).map(e=>e.file))if(!converted.has(f))copyFileSync(join(dir,f),join(resolve(out),f));
  writeFileSync(join(resolve(out),'manifest.json'),JSON.stringify(ktx2PackManifest(manifest,converted,f=>statSync(join(dir,f)).size),null,1));
}
const report={...r,seconds:Math.round((Date.now()-t0)/1000)};
if(jsonOut)writeFileSync(resolve(jsonOut),JSON.stringify(report,null,1));
console.log(JSON.stringify({...report,mismatches:report.mismatches.slice(0,20)}));
process.exit(r.mismatches.length?1:0);
