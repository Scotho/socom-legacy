import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateHdManifest} from '../packages/viewer/src/hdTexturePack';
import {coverageMarkdown,coverageReport,extraRootNames,parseUnboundTsv,readCoverageSources} from './hdPackCoverage';

/**
 * WM-50 (WM-PACK-1; product track, a tool): the HD pack's per-map coverage table from the disc and a built pack's
 * `manifest.json` (`./hd-pack-from-pcsx2.ts` writes it). Reads every texture source of the disc and of each extra root
 * (the downloadable maps, as the generator reads them; each root's rows named by its last directory), keys each image as the pack does (HD.R3) and counts, per map,
 * mission and other archive, what the manifest binds whole or by placement only (HD.R9); then totals, and the entries no
 * source uses. `--unbound <tsv>` folds in the builder's left-out list (name, bytes, why). Reads game data; writes only
 * where it is told (the counts, not the art: nothing of the pack is written).
 * Usage: tsx tools/hd-pack-coverage.ts <disc root> <manifest.json> [--extra-root <dir>]... [--unbound <tsv>]
 *   [--json <out.json>] [--md <out.md>] [--maps-only]
 * Without `--md` the markdown goes to stdout. `--maps-only` leaves the rows of non-map sources out of the table (the
 * totals and the unused entries still count every source).
 */
const args=process.argv.slice(2),flag=(n:string)=>{const i=args.indexOf(n);if(i<0)return undefined;const v=args[i+1];args.splice(i,2);return v;};
const has=(n:string)=>{const i=args.indexOf(n);if(i<0)return false;args.splice(i,1);return true;};
const extraRoots:string[]=[];for(let r=flag('--extra-root');r!==undefined;r=flag('--extra-root'))extraRoots.push(r);
const unboundFile=flag('--unbound'),jsonOut=flag('--json'),mdOut=flag('--md'),mapsOnly=has('--maps-only');
const [disc,manifestPath]=args;
if(!disc||!manifestPath||args.length!==2){
  console.error('usage: hd-pack-coverage.ts <disc root> <manifest.json> [--extra-root <dir>]... [--unbound <tsv>] [--json <out>] [--md <out>] [--maps-only]');
  process.exit(2);
}
const manifest=validateHdManifest(JSON.parse(readFileSync(manifestPath,'utf8')));
const warn=(m:string)=>console.error(m);
console.error(`manifest: ${manifest.entries.length} entries; reading ${disc}${extraRoots.length?` and ${extraRoots.length} extra root(s)`:''}...`);
const sources=[...readCoverageSources(disc,{warn}),...extraRoots.flatMap((r,i)=>readCoverageSources(r,{prefix:`extra:${extraRootNames(extraRoots)[i]}:`,warn}))];
console.error(`sources: ${sources.length}; images: ${sources.reduce((t,s)=>t+s.images.length,0)}`);
const report=coverageReport(sources,manifest,unboundFile?parseUnboundTsv(readFileSync(unboundFile,'utf8')):undefined);
const shown=mapsOnly?{...report,rows:report.rows.filter(r=>r.kind!=='other')}:report;
if(jsonOut)writeFileSync(resolve(jsonOut),JSON.stringify(report,null,1));
const md=coverageMarkdown(shown);
if(mdOut)writeFileSync(resolve(mdOut),md);else process.stdout.write(md);
const t=report.totals;
console.error(JSON.stringify({maps:t.maps,all:{...t.all},unusedEntries:report.unusedEntries.length,unbound:report.unbound?.files??null}));
