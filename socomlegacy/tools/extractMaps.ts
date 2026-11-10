import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { COMMON_ARCHIVES, IsoAssetSource, listMaps, servedIndex, type MapInfo } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { copyMapArchives, filesInPlan, listingPlan, planExtract, type ExtractPlan } from './extractPlan';
import { copyFresh, writeFresh, type Fresh } from './freshFiles';
import { fsBlob } from './fmv-spike';

/**
 * The image-to-maps path as one callable (PK-1, the parity pack's design section 8; product track, a tool refactor):
 * an ISO9660 image laid out into a disc tree (`materializeIso`, what `tools/materialize-iso.ts` does), then the disc
 * tree copied into the served maps tree with its `index.json` (`extractMaps`, what `tools/extract-maps.ts` does). Both
 * scripts call this and keep their own arguments, messages and exit codes; the parity pack's GUI calls `extractMaps`
 * with an image and a progress callback. What is copied, and why, is the two scripts' doc comments and `./extractPlan`;
 * the trees are written by `./freshFiles`, so a file the hard links share between worktrees is never rewritten in place.
 *
 * The refusals stand as thrown Errors in the scripts' words: a disc directory inside the clone outside `socomlegacy/.disc`
 * (`discDirRefusal`, when an image is laid out), a common archive the image lacks (before any write), an archive that
 * will not name itself (PL-11: the extract stops, no index is written). One more, before any write: a disc tree that
 * lacks a common archive, where the copy used to stop on the missing file part-way through the served tree.
 */

/** The clone's root (this file is `socomlegacy/tools/extractMaps.ts`). */
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

export interface MaterializeOptions {
  streams: boolean;
  campaign: boolean;
  /** Called with 0 of the plan's file count before the first file, then after each file laid out or kept. */
  onProgress?: (done: number, total: number, file?: string) => void;
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

/**
 * The files `extractMaps` copies, laid out of the image `isoPath` into `discDir`. The reader is the repository's
 * (`IsoAssetSource`, through `fsBlob`: Node's `openAsBlob` reports a file above 4 GiB modulo 2^32 on Windows). A common
 * archive the image lacks is returned in `missingCommon` before any write (the extract would stop on the same gap).
 */
export async function materializeIso(isoPath: string, discDir: string, options: MaterializeOptions): Promise<MaterializeResult> {
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
    const files = filesInPlan(plan, present);
    options.onProgress?.(0, files.length);
    for (const path of files) {
      const dest = join(discDir, ...path.split('/'));
      const size = await source.size(path);
      // Same length is not the same file: a later image can replace an archive without changing its size.
      // The bytes are compared, and a match is left in place. The SHA-256 stamp is what skips the whole build.
      let same = false;
      try { same = (await stat(dest)).size === size; } catch { /* not there yet */ }
      if (same && await sameAsImage(dest, source, path, size)) {
        kept++;
        options.onProgress?.(written + kept, files.length, path);
        continue;
      }
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
      options.onProgress?.(written + kept, files.length, path);
    }
    return { written, kept, missingCommon, missing: plan.missing };
  } finally {
    blob.close();
  }
}

export interface ExtractProgress { phase: 'materialize' | 'copy' | 'index'; done: number; total: number; file?: string }

/** The file-system pieces `extractMaps` uses, each replaceable for a test (as `filesInPlan` takes `present`). */
export interface ExtractFs {
  /** A file copied as a new file unless the destination holds the same bytes (`copyFresh`). */
  copy(from: string, to: string): Fresh;
  /** The index written as a new file unless it holds the same text (`writeFresh`). */
  write(path: string, text: string): Fresh;
  exists(path: string): boolean;
  mkdir(dir: string): void;
  /** The extract's plan from the disc tree (`planExtract`: the tree's listing, by `readdir`). */
  plan(disc: string, options: { streams: boolean; campaign: boolean }): ExtractPlan;
  /** The served tree's maps, named by each archive's own `mission.rdr` (`listMaps`); a problem throws (PL-11). */
  names(maps: string): Promise<MapInfo[]>;
}

const NODE_FS: ExtractFs = {
  copy: copyFresh,
  write: writeFresh,
  exists: existsSync,
  mkdir: (dir) => { mkdirSync(dir, { recursive: true }); },
  plan: planExtract,
  // A served index must name every map: an archive that will not name itself stops the extract (PL-11).
  names: (maps) => listMaps(new FsAssetSource(maps), (path, message) => { throw new Error(`${path}: ${message}`); }),
};

export interface ExtractMapsOptions {
  /** When given, the image is laid out into `disc` first (`materializeIso`). */
  iso?: string;
  /** The disc tree (`RUN/` and below). */
  disc: string;
  /**
   * The served tree to write (`socomlegacy/public/maps` for the scripts), with its `index.json`. It may be `disc` itself
   * (resolved, case-folded on win32): then nothing is copied and the index is written in place.
   */
  maps: string;
  /** The test-fixtures root to refresh (three maps and the common archives), or null/undefined to leave fixtures alone. */
  fixtures?: string | null;
  /** The movies and `SOUNDS/VAGSTORE.ZAR` too (`--with-streams`). */
  streams?: boolean;
  /** The campaign's twelve archives beside the maps, unindexed (FG.R25: true unless false, `--without-campaign`). */
  campaign?: boolean;
  /**
   * The clone `discDirRefusal` guards when an image is laid out: this file's clone by default. Null when the caller
   * runs from no clone (the parity pack's bundled harness, whose builder refuses an output inside a clone).
   */
  cloneRoot?: string | null;
  onProgress?: (p: ExtractProgress) => void;
  /** Information lines (the layout's summary). */
  log?: (line: string) => void;
  /** Warning lines (a name the lists give that the image or the tree lacks); `log` when not given. */
  warn?: (line: string) => void;
  fs?: Partial<ExtractFs>;
}

export interface ExtractMapsResult {
  /** The index's maps. */
  maps: MapInfo[];
  /** Files written and kept in the served tree, the index and the fixtures (not the layout's: `materialized`). */
  written: number;
  kept: number;
  /** Names the lists give that the disc tree lacks: reported, never invented. */
  missing: string[];
  /** The map archives copied: the multiplayer maps and the campaign's (no index names those, FG-22). */
  archives: { maps: number; campaign: number };
  /** The front-end files in the plan (PLAT-03). */
  frontEnd: number;
  /** The layout's counts, when an image was given. */
  materialized?: { written: number; kept: number };
}

/** Whether two paths name one directory: resolved, case-folded on win32 (as `discDirRefusal` compares). */
export function sameDir(a: string, b: string): boolean {
  const fold = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
  return fold(a) === fold(b);
}

/** The four maps the fixture-backed tests read, beside the common archives (MP71 by DF.R5, the Fish Hook plan). */
const FIXTURE_MAPS = ['MP2.ZDB', 'MP6.ZDB', 'MP71.ZDB', 'MP72.ZDB'];

export async function extractMaps(o: ExtractMapsOptions): Promise<ExtractMapsResult> {
  const fs: ExtractFs = { ...NODE_FS, ...o.fs };
  const log = o.log ?? ((): void => {});
  const warn = o.warn ?? log;
  const streams = o.streams ?? false;
  const campaign = o.campaign ?? true;
  let materialized: ExtractMapsResult['materialized'];
  if (o.iso !== undefined) {
    const root = o.cloneRoot === undefined ? REPO_ROOT : o.cloneRoot;
    const refusal = root === null ? null : discDirRefusal(o.disc, root);
    if (refusal) throw new Error(refusal);
    const laid = await materializeIso(o.iso, o.disc, {
      streams, campaign,
      onProgress: (done, total, file) => o.onProgress?.({ phase: 'materialize', done, total, file }),
    });
    for (const path of laid.missing) warn(`extract list: ${path} is not on the image`);
    if (laid.missingCommon.length) throw new Error(laid.missingCommon.map((path) => `materialize-iso: the image has no ${path}`).join('\n'));
    log(`materialize-iso: ${laid.written} written, ${laid.kept} kept, under ${o.disc}`);
    materialized = { written: laid.written, kept: laid.kept };
  }

  const { disc, maps } = o;
  if (!fs.exists(join(disc, 'RUN'))) throw new Error(`no disc tree at ${disc}`);
  const plan = fs.plan(disc, { streams, campaign });
  for (const name of plan.missing) warn(`extract list: ${name} is not on the disc tree at ${disc}`);
  const lacking = COMMON_ARCHIVES.filter((path) => !fs.exists(join(disc, path)));
  if (lacking.length) throw new Error(lacking.map((path) => `extract-maps: the disc tree at ${disc} has no ${path}`).join('\n'));

  // Every copy, decided before the first: the multiplayer maps, and unless `campaign: false` the campaign's archives
  // beside them (FG-22: no index names those).
  const jobs: [from: string, to: string, file: string][] = [];
  const archives = copyMapArchives(plan, disc, maps, (from, to) => { jobs.push([from, to, relative(maps, to).replace(/\\/g, '/')]); });
  // A common archive may sit in a directory of its own (`RUN/SOUNDS/BNKSTORE.ZAR`, `RUN/UI/`; the extract-maps script's notes).
  for (const path of COMMON_ARCHIVES) jobs.push([join(disc, path), join(maps, path), path]);
  // The front-end files (PLAT-03) the common list does not already hold.
  const common = new Set(COMMON_ARCHIVES);
  for (const { path } of plan.frontEnd) if (!common.has(path)) jobs.push([join(disc, path), join(maps, path), path]);
  // The fixtures, only when a root is named (the extract-maps script's default, unless `--public-only`).
  if (o.fixtures) {
    for (const f of FIXTURE_MAPS) jobs.push([join(disc, 'RUN', f), join(o.fixtures, 'RUN', f), `RUN/${f}`]);
    // The common archives in the fixtures too, which the fixture-backed tests read beside the four maps (why: the
    // extract-maps script's comment at its `fixtures` root).
    for (const path of COMMON_ARCHIVES) jobs.push([join(disc, path), join(o.fixtures, path), path]);
  }

  const tally: Record<Fresh, number> = { kept: 0, written: 0 };
  fs.mkdir(join(maps, 'RUN'));
  if (o.fixtures) fs.mkdir(join(o.fixtures, 'RUN'));
  // `disc` and `maps` one directory (the parity pack lays the image's files straight into the folder it serves, so the
  // tester's drive holds them once): the served tree's files are in place already, nothing is copied onto itself, and
  // they count as kept -- the copy phase is done at once; only the fixtures, when named, are still copied.
  const inPlace = sameDir(disc, maps) ? (o.fixtures ? jobs.length - FIXTURE_MAPS.length - COMMON_ARCHIVES.length : jobs.length) : 0;
  tally.kept += inPlace;
  o.onProgress?.({ phase: 'copy', done: inPlace, total: jobs.length });
  jobs.slice(inPlace).forEach(([from, to, file], i) => {
    tally[fs.copy(from, to)]++;
    o.onProgress?.({ phase: 'copy', done: inPlace + i + 1, total: jobs.length, file });
  });

  o.onProgress?.({ phase: 'index', done: 0, total: 1 });
  const named = await fs.names(maps);
  tally[fs.write(join(maps, 'index.json'), JSON.stringify(servedIndex(named, COMMON_ARCHIVES, plan.frontEnd.map((f) => f.path)), null, 2))]++;
  o.onProgress?.({ phase: 'index', done: 1, total: 1, file: 'index.json' });
  return { maps: named, written: tally.written, kept: tally.kept, missing: plan.missing, archives, frontEnd: plan.frontEnd.length, materialized };
}
