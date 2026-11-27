import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {validateHdManifest} from '../packages/viewer/src/hdTexturePack';
import {censusMarkdown,packCensus} from './hdPackCensus';

/**
 * WM-PACK-2 (a), WM.R13 (product track: a tool): the census of a built HD pack (`./hd-pack-from-pcsx2.ts`'s output
 * folder: `manifest.json` and its payloads). Reads the pack; writes only counts (no art). See `./hdPackCensus`.
 * Usage: tsx tools/hd-pack-census.ts <pack dir> [--json <out.json>] [--md <out.md>]   (without --md, markdown to stdout)
 */
const args=process.argv.slice(2),flag=(n:string)=>{const i=args.indexOf(n);if(i<0)return undefined;const v=args[i+1];args.splice(i,2);return v;};
const jsonOut=flag('--json'),mdOut=flag('--md'),[dir]=args;
if(!dir||args.length!==1){console.error('usage: hd-pack-census.ts <pack dir> [--json <out.json>] [--md <out.md>]');process.exit(2);}
const manifest=validateHdManifest(JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8')));
console.error(`manifest: ${manifest.entries.length} entries; reading payloads...`);
const t0=Date.now(),c=packCensus(manifest,f=>new Uint8Array(readFileSync(join(dir,f))));
if(jsonOut)writeFileSync(resolve(jsonOut),JSON.stringify(c,null,1));
const md=censusMarkdown(c);
if(mdOut)writeFileSync(resolve(mdOut),md);else process.stdout.write(md);
console.error(JSON.stringify({payloads:c.payloads.length,refused:c.refused.length,byKind:c.byKind,entries:c.entries,gpu:c.gpu,seconds:Math.round((Date.now()-t0)/1000)}));
