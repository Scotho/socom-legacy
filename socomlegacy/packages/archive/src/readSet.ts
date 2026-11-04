import { isRanged, type AssetSource } from './assetSource';
import { frontEndFiles, missingFrontEndNames } from './frontEndFiles';
import type { IsoFileExtent } from './isoAssetSource';
import { CAMPAIGN_ARCHIVES, COMMON_ARCHIVES, mapArchiveId } from './mapIndex';

/**
 * **The read set** (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-1, FI.R6): the disc files the
 * page reads, which the extraction (`@s2u/viewer` `discExtract.ts`) keeps in the browser's storage so that a later visit
 * starts from storage, not from the disc. A **browser adaptation** (FI.R2, OT.R53, the product track): the original reads
 * its own disc; nothing here changes what the game reads or how -- the extracted files are the disc's own bytes, read
 * back by the same readers by the same paths.
 *
 * It is composed of the lists the repository already keeps -- no second manifest (H200): the identity's own
 * `SYSTEM.CNF` (`discIdentity`, DA.R8: the start path reads it first), the front end's classes (`FRONT_END_CLASSES` in
 * scope, `SOUNDS/VAGSTORE.ZAR` included, the deferred ones not -- the campaign's are the forge's, FG.R4 -- and of its movies
 * only `READ_SET_MOVIES`, the owner's word),
 * the archives every map shares (`COMMON_ARCHIVES`, `ARMORY_ARCHIVES` with them) and every multiplayer map the disc
 * lists (`mapArchiveId`, the selection `listMaps` makes). `tools/extractPlan.ts` composes the same lists for the served
 * tree. The campaign's twelve map archives (`CAMPAIGN_ARCHIVES`, M51..M83) are in it since FI.R6's second revision (the
 * owner, 2026-10-16: "we also need single player maps for forge"): the forge lists and opens them from storage. The
 * campaign's movies stay cut, and its four locale tables with them (the forge's served tree never held them either).
 */

/**
 * The read set's version, kept in the extraction's record: a later change of what the set holds bumps it, and an
 * extraction made under another version is made again. Ours.
 */
export const READ_SET_VERSION = 3;

/**
 * The movies the read set keeps (FI.R6 as revised, the owner's word of 2026-10-16 through the merge controller: "include
 * all menu related movies and the opener movie and zipper text. cut everything else"): the opener -- the Sony card
 * (`SONY448`, behind `dlgIntroCinematic`) and the intro FMV (`INTRO_2`, behind `dlgSecondCinematic`) -- and the one movie
 * the menus play as their own, the main menu's loop (`MENULOOP`, behind `dlgMenu`; `@s2u/viewer` `movieRealtime.ts`).
 * The Zipper Interactive text is a dialog's caption (`_507_DevelopedZipper_MSG`, research 105) in the UI archives the set
 * keeps anyway. Every other movie is cut: the EXTRAS' content (ARTGALL2, MUSVID, CREDITS, TUT_01..10), the AOP intros
 * and the campaign's -- a cut movie plays from the disc when it is present and is skipped when it is not (DX-3).
 */
export const READ_SET_MOVIES: readonly string[] = [
  'RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS', 'RUN/MOVIES/COMMON/MENULOOP.PSS',
];
const isMovie = (path: string): boolean => /^RUN\/MOVIES\/.*\.PSS$/.test(path);

/** The file the disc's identity is read from (`discIdentity`, DA-2, DA.R8): the first file the start path reads. */
export const READ_SET_IDENTITY_FILE = 'SYSTEM.CNF';

/** One file of the read set and its size from the disc's own table. */
export interface ReadSetFile {
  readonly path: string;
  readonly size: number;
}

/** The read set on one disc: its files (with sizes), the names it lacks, and the bytes it holds. */
export interface DiscReadSet {
  readonly version: number;
  readonly files: readonly ReadSetFile[];
  /** Names the lists give that the disc does not hold: reported, never skipped silently. Empty on a whole disc. */
  readonly missing: readonly string[];
  /** The sum of the files' sizes. */
  readonly total: number;
}

/**
 * The read set's paths in a listing (`AssetSource.list()`: the image's, a folder's), sorted, and the names the lists give
 * that the listing lacks: `SYSTEM.CNF`, a common archive, a front-end pattern that matches nothing.
 */
export function readSetPaths(listing: readonly string[]): { paths: string[]; missing: string[] } {
  const have = new Set(listing);
  const want = new Set<string>();
  const missing: string[] = [];
  const take = (path: string): void => {
    if (have.has(path)) want.add(path);
    else if (!missing.includes(path)) missing.push(path);
  };
  take(READ_SET_IDENTITY_FILE);
  for (const f of frontEndFiles(listing)) if (!isMovie(f.path)) want.add(f.path);
  missing.push(...missingFrontEndNames(listing).filter((name) => !isMovie(name) && !missing.includes(name)));
  for (const path of READ_SET_MOVIES) take(path);
  for (const path of COMMON_ARCHIVES) take(path);
  for (const path of CAMPAIGN_ARCHIVES) take(path);          // the forge's single-player maps (FI.R6, the owner's word)
  for (const path of listing) if (mapArchiveId(path) !== null) want.add(path);
  return { paths: [...want].sort(), missing };
}

/** A source that can say its files' extents from the disc's table (`IsoAssetSource`). */
type WithExtents = { extents(): Promise<IsoFileExtent[]> };
const hasExtents = (source: AssetSource): source is AssetSource & WithExtents =>
  typeof (source as Partial<WithExtents>).extents === 'function';

/**
 * The read set on `source`, each size from the disc's own table: an image's extents (`IsoAssetSource.extents()`, the
 * ISO9660 directory records), a folder's `size(path)` (`DirectoryAssetSource`: each file's own length). Over an image
 * the files are in the table's LBN order -- the order the disc holds them, so an optical drive reads forwards -- and over
 * a folder in path order. A source that can give neither is refused. The extraction calls it over a disc request only
 * (an image or a folder, `@s2u/viewer` `DiscRequest`), never over the served tree.
 */
export async function discReadSet(source: AssetSource): Promise<DiscReadSet> {
  const listing = await source.list();
  const { paths, missing } = readSetPaths(listing);
  let files: ReadSetFile[];
  if (hasExtents(source)) {
    const wanted = new Set(paths);
    files = (await source.extents()).filter((e) => wanted.has(e.path)).map((e) => ({ path: e.path, size: e.size }));
  } else if (isRanged(source)) {
    files = [];
    for (const path of paths) files.push({ path, size: await source.size(path) });
  } else {
    throw new Error('the read set needs a disc -- an image or a folder -- whose table gives each file\'s size, and this source has no table');
  }
  return { version: READ_SET_VERSION, files, missing, total: files.reduce((n, f) => n + f.size, 0) };
}

/**
 * A source that hands out a file as a `Blob` without reading it (`IsoAssetSource`: a `slice` of the image over the file's
 * extent; `DirectoryAssetSource`: the picked file itself), so a writer can copy it chunk by chunk, or post it to a worker,
 * and nothing is held in memory.
 */
export interface BlobAssetSource extends AssetSource {
  fileBlob(path: string): Promise<Blob>;
}

/** Whether `source` hands out its files as `Blob`s. */
export function hasFileBlobs(source: AssetSource): source is BlobAssetSource {
  return typeof (source as Partial<BlobAssetSource>).fileBlob === 'function';
}
