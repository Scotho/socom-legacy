import {resolve} from 'node:path';
import {checkThunderstoreZip,hdThunderstoreFlags,ThunderstoreRefusal,writeHdThunderstoreZip} from './hdPackThunderstore';

/**
 * B206 ML-5 (plan 2026-11-06-mods-loader, ML.R16): the owner's Thunderstore upload zip from an HD pack already built by
 * `hd-pack-from-pcsx2.ts` (its `--out`, by default `public/experimental-packs/hd/`), and its check. Product track
 * (OT.R53), an adaptation: a tool's packaging, no game value. The zip is the owner's to upload (H413, H342); players
 * never build it. Write it outside the repository: the pack is third-party art (OT.R92), never in git.
 * Usage:
 *   tsx tools/thunderstore-wrap.ts <built pack dir> <out.zip> [--ts-name <name>] [--ts-version <x.y.z>]
 *     [--ts-description <text>] [--website <url>] [--icon <256x256 png>] [--credit <text>]
 *   tsx tools/thunderstore-wrap.ts --check <zip>
 * The same wrap runs at the end of a build with `hd-pack-from-pcsx2.ts ... --thunderstore <out.zip>`.
 */
const args=process.argv.slice(2);
const report=(c:Awaited<ReturnType<typeof checkThunderstoreZip>>)=>{
  for(const w of c.warnings)console.error(`warning: ${w}`);
  for(const p of c.problems)console.error(`refused: ${p}`);
  console.log(JSON.stringify({ok:c.ok,name:c.name,version:c.version,textures:c.textures,bytes:c.bytes}));
  process.exit(c.ok?0:1);
};
const at=args.indexOf('--check');
if(at>=0){
  const zip=args[at+1];
  if(!zip){console.error('usage: thunderstore-wrap.ts --check <zip>');process.exit(2);}
  report(await checkThunderstoreZip(resolve(zip)));
}else{
  const opts=hdThunderstoreFlags(args),[dir,out]=args;
  if(!dir||!out){console.error('usage: thunderstore-wrap.ts <built pack dir> <out.zip> [--ts-name n] [--ts-version x.y.z] [--ts-description t] [--website url] [--icon png] [--credit t] | --check <zip>');process.exit(2);}
  const w=await writeHdThunderstoreZip(resolve(out),resolve(dir),opts).catch((e:unknown)=>{
    if(!(e instanceof ThunderstoreRefusal))throw e;
    for(const p of e.problems)console.error(`refused: ${p}`);
    process.exit(1);
  });
  console.error(`wrote ${resolve(out)}: ${w.entries} entries, ${w.bytes} bytes`);
  report(await checkThunderstoreZip(resolve(out)));
}
