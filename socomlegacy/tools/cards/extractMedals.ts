/**
 * SOCOM_DISC=<RUN parent> | SOCOM_ISO=<image> node --import tsx tools/cards/extractMedals.ts <outDir>
 *
 * LCM-2 (`docs/plans/2026-11-09-live-cards-and-match-pages.md`): the medal of merit's five pictures written as
 * `medal-1.png` (ENSIGN, `Medal_Blue.tif`) .. `medal-5.png` (ADMIRAL, `Medal_Black.tif`) -- research 155 §2.3's table,
 * the viewer's `MEDAL_TEXTURES` order -- for central's cards (`CARD_ASSETS_DIR`, never git; RS.R8, the design §1).
 *
 * A product-track tool (OT.R53), a browser adaptation: it changes nothing the game does. No new decoding -- the
 * pictures come through the viewer's own reader, `readMedalPictures` (`packages/viewer/src/modern/discAssets.ts`,
 * MU2-7: `RUN/UI/UIMP_TXR.ZED` against its palettes by the front end's bank reader), at the disc's own size, alpha
 * kept, top row first; PNG by `tools/png.ts` `encodePng`.
 */
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IsoAssetSource, type AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import type { Rgba } from '@s2u/gs';
import { readMedalPictures } from '../../packages/viewer/src/modern/discAssets';
import { encodePng } from '../png';

/** A product adaptation: the cards carry the five medals 1-5 (medal 0, `null.tif`, draws nothing and has no file). */
export const MEDAL_COUNT_ADAPTATION = 5;

/** A product adaptation: the file name central's cards read for medal `n` (the design's `medal-<n>.png`). */
export const medalFileName = (medal: number): string => `medal-${medal}.png`;

/** A product adaptation (LCM-18b): the entry whose presence marks a git work tree's top (a directory, or a worktree's file). */
const GIT_MARKER_ADAPTATION = '.git';

/**
 * The git work tree holding `dir` (its top), or null: walks up from `dir` for a `.git` entry. The medals are disc art and
 * never go into a tree (RS.R8), so `extractMedals` refuses such an `outDir`.
 */
export function gitWorkTreeOf(dir: string): string | null {
  for (let at = resolve(dir); ; ) {
    if (existsSync(join(at, GIT_MARKER_ADAPTATION))) return at;
    const up = dirname(at);
    if (up === at) return null;
    at = up;
  }
}

/**
 * A Blob-shaped range reader over an image file. Not `fs.openAsBlob`: it reports a file above 4 GiB at its size mod
 * 2^32 (the retail image is 4,380,753,920 bytes); the same adapter as `tools/map-validation.ts`'s. The file stays open
 * until the process exits.
 */
function fileRangeBlob(path: string): Blob {
  const fd = openSync(path, 'r'), size = fstatSync(fd).size;
  process.once('exit', () => closeSync(fd));
  return { size, slice: (a = 0, b = size) => ({ arrayBuffer: async () => {
    const bytes = new Uint8Array(b - a);
    for (let off = 0; off < bytes.length;) {
      const n = readSync(fd, bytes, off, bytes.length - off, a + off);
      if (!n) throw new Error(`extractMedals: short read of ${path}`);
      off += n;
    }
    return bytes.buffer;
  } }) } as Blob;
}

/** The disc as the environment names it: `SOCOM_DISC` (the RUN parent directory) first, else the `SOCOM_ISO` image. */
export async function sourceFromEnv(env: Record<string, string | undefined>): Promise<AssetSource> {
  if (env.SOCOM_DISC) return new FsAssetSource(env.SOCOM_DISC);
  if (env.SOCOM_ISO) return new IsoAssetSource(fileRangeBlob(env.SOCOM_ISO));
  throw new Error('extractMedals: set SOCOM_DISC or SOCOM_ISO; no fallback disc');
}

/**
 * Reads the five pictures (`read`, the viewer's `readMedalPictures` unless a test hands its own) and writes them to
 * `outDir` as `medal-1.png` .. `medal-5.png`. Refuses, writing nothing, unless all five are there, and reading nothing when
 * `outDir` is inside a git work tree (LCM-18b). Answers the paths.
 */
export async function extractMedals(
  source: AssetSource,
  outDir: string,
  read: (source: AssetSource) => Promise<ReadonlyMap<number, Rgba>> = readMedalPictures,
): Promise<string[]> {
  const tree = gitWorkTreeOf(outDir);
  if (tree) throw new Error(`extractMedals: ${outDir} is inside the git work tree ${tree} -- the medals are disc art (RS.R8); write them outside it`);
  const pics = await read(source);
  const medals = Array.from({ length: MEDAL_COUNT_ADAPTATION }, (_, i) => i + 1);
  const missing = medals.filter((m) => !pics.has(m));
  if (missing.length) throw new Error(`extractMedals: the disc's reader answered no picture for medal ${missing.join(', ')}`);
  mkdirSync(outDir, { recursive: true });
  return medals.map((m) => {
    const p = pics.get(m)!;
    const path = join(outDir, medalFileName(m));
    writeFileSync(path, encodePng(p.width, p.height, p.data));
    return path;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = process.argv[2];
  if (!out) throw new Error('usage: extractMedals.ts <outDir>');
  for (const path of await extractMedals(await sourceFromEnv(process.env), out)) console.log(path);
}
