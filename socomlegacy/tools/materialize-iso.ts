import { parseExtractArgs } from './extractPlan';
import { discDirRefusal, materializeIso } from './extractMaps';

/**
 * Lays the files `tools/extract-maps.ts` copies out of an ISO9660 image into a disc tree (`SOCOM_DISC`).
 * The reader is the repository's (`IsoAssetSource`, through `fsBlob`: Node's `openAsBlob` reports a file
 * above 4 GiB modulo 2^32 on Windows). This writes that tree and nothing else. `extract-maps` then copies
 * it to `public/maps` and writes `index.json`. A common archive the image lacks is refused before any write:
 * `extract-maps` would stop on the same gap.
 *
 * The layout itself is `materializeIso` in `./extractMaps` (PK-1: one callable for the image-to-maps path, which the
 * parity pack calls with progress); this file is its command line, its messages and exit codes as they were.
 */
export { DISC_IN_CLONE, discDirRefusal, materializeIso, REPO_ROOT, type MaterializeOptions, type MaterializeResult } from './extractMaps';

function take(argv: string[], flag: string): { value: string | undefined; rest: string[] } {
  const rest: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) {
      value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`materialize-iso: ${flag} needs a path`);
    } else rest.push(argv[i]!);
  }
  return { value, rest };
}

export async function materializeMain(argv: readonly string[]): Promise<number> {
  let rest = [...argv];
  const isoArg = take(rest, '--iso');
  rest = isoArg.rest;
  const discArg = take(rest, '--disc');
  const iso = isoArg.value || process.env.SOCOM_ISO || '';
  // The destination is only ever --disc. SOCOM_DISC is not a fallback: it may name a tree outside the clone that is
  // not this command's to write (the desktop's read-only disc tree, on the owner's host).
  const disc = discArg.value || '';
  if (!disc) {
    console.error('materialize-iso: needs --disc <directory> (SOCOM_DISC is never written to; the destination is '
      + 'named on the command line, as workflow/test-disc.ps1 does with socomlegacy/.disc)');
    return 2;
  }
  if (!iso) {
    console.error('materialize-iso: needs --iso <image> (or SOCOM_ISO)');
    return 2;
  }
  const refusal = discDirRefusal(disc);
  if (refusal) {
    console.error(refusal);
    return 2;
  }
  const args = parseExtractArgs(discArg.rest);
  const result = await materializeIso(iso, disc, { streams: args.streams, campaign: args.campaign });
  for (const path of result.missing) console.warn(`extract list: ${path} is not on the image`);
  if (result.missingCommon.length) {
    for (const path of result.missingCommon) console.error(`materialize-iso: the image has no ${path}`);
    return 1;
  }
  console.log(`materialize-iso: ${result.written} written, ${result.kept} kept, under ${disc}`);
  return 0;
}

if (/materialize-iso\.ts$/.test((process.argv[1] ?? '').replace(/\\/g, '/'))) {
  materializeMain(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
