import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { IsoAssetSource } from '@s2u/archive';
import { filesInPlan, listingPlan, parseExtractArgs } from './extractPlan';
import { fsBlob } from './fmv-spike';

/**
 * Lays the files `tools/extract-maps.ts` copies out of an ISO9660 image into a disc tree (`SOCOM_DISC`).
 * The reader is the repository's (`IsoAssetSource`, through `fsBlob`: Node's `openAsBlob` reports a file
 * above 4 GiB modulo 2^32 on Windows). This writes that tree and nothing else. `extract-maps` then copies
 * it to `public/maps` and writes `index.json`. A common archive the image lacks is refused before any write:
 * `extract-maps` would stop on the same gap.
 */
/** The clone's root (this file is `socomlegacy/tools/materialize-iso.ts`). */
export const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
/** The one directory inside the clone the layout may go to: git-ignored (`/socomlegacy/.disc/`, the root .gitignore). */
export const DISC_IN_CLONE = join('socomlegacy', '.disc');

/**
 * Why `disc` may not take the image's files, or null when it may (RS.R8: nothing of the disc enters git). Outside the
 * clone it is the player's own directory; inside it, only `socomlegacy/.disc` and below, which .gitignore holds. A typo
 * naming `public/`, `test-fixtures/` or the root is refused before the image is opened.
 */
export function discDirRefusal(disc: string, root: string = REPO_ROOT): string | null {
  const fold = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);
  const inClone = relative(fold(resolve(root)), fold(resolve(disc)));
  if (inClone.startsWith('..') || isAbsolute(inClone)) return null;
  const underDisc = relative(fold(DISC_IN_CLONE), inClone);
  if (underDisc === '' || !(underDisc.startsWith('..') || isAbsolute(underDisc))) return null;
  return `materialize-iso: --disc ${disc} is inside the clone; there the layout goes only under socomlegacy/.disc `
    + `(git-ignored), or to a directory outside the clone`;
}

export interface MaterializeResult {
  written: number;
  kept: number;
  missingCommon: string[];
  missing: string[];
}

async function sameAsImage(dest: string, source: IsoAssetSource, path: string, size: number): Promise<boolean> {
  const handle = await open(dest, 'r');
  try {
    let offset = 0;
    for await (const chunk of source.stream(path)) {
      const buf = Buffer.alloc(chunk.byteLength);
      const got = await handle.read(buf, 0, buf.length, offset);
      if (got.bytesRead !== chunk.byteLength || !buf.equals(chunk)) return false;
      offset += chunk.byteLength;
    }
    return offset === size;
  } finally {
    await handle.close();
  }
}

export async function materializeIso(isoPath: string, discDir: string, options: { streams: boolean; campaign: boolean }): Promise<MaterializeResult> {
  const blob = fsBlob(isoPath);
  try {
    const source = new IsoAssetSource(blob);
    const listing = await source.list();
    const present = new Set(listing);
    const plan = listingPlan(listing, options);
    const missingCommon = plan.common.filter((path) => !present.has(path));
    if (missingCommon.length) return { written: 0, kept: 0, missingCommon, missing: plan.missing };
    let written = 0;
    let kept = 0;
    for (const path of filesInPlan(plan, present)) {
      const dest = join(discDir, ...path.split('/'));
      const size = await source.size(path);
      // Same length is not the same file: a later image can replace an archive without changing its size.
      // The bytes are compared, and a match is left in place. The SHA-256 stamp is what skips the whole build.
      let same = false;
      try { same = (await stat(dest)).size === size; } catch { /* not there yet */ }
      if (same && await sameAsImage(dest, source, path, size)) { kept++; continue; }
      await mkdir(dirname(dest), { recursive: true });
      const partial = `${dest}.partial`;
      const handle = await open(partial, 'w');
      try {
        for await (const chunk of source.stream(path)) await handle.write(chunk);
      } finally {
        await handle.close();
      }
      const got = (await stat(partial)).size;
      if (got !== size) {
        await rm(partial, { force: true });
        throw new Error(`materialize-iso: ${path} wrote ${got} bytes, the image says ${size}`);
      }
      await rm(dest, { force: true });
      await rename(partial, dest);
      written++;
    }
    return { written, kept, missingCommon, missing: plan.missing };
  } finally {
    blob.close();
  }
}

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
