import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { shipFontLicences } from '../../../shared/vite';
import { FMV_SOURCE_FILES, TARBALL_NAME, fmvPlugin } from '../fmvShip';

/**
 * The NB-6 review's B-1 (2026-10-12): Vite keeps `build.outDir` in the resolved config as it was given and resolves a
 * relative one against `config.root` when it writes the bundle -- so a plugin that copies into `config.build.outDir`
 * as a bare string writes beside its own cwd instead. The nightly's `--outDir ../../dist/nightly/site` put the fonts and
 * the movie decoder outside the clone and left the release without them. Both plugins resolve the outDir against the
 * root, as Vite does.
 *
 * Nothing here may write under a repository, whatever the plugins do: the relative outDir is built so that read from
 * this process's cwd (the old, wrong reading) and read from the test's root (the right one) both land inside the temp
 * directory, in two different places.
 */
let tmp = '';
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 's2u-outdir-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

/** A root and a relative outDir: `cwdSide` is where the cwd's reading lands, `rootSide` the root's; both under `tmp`. */
function layout(): { root: string; outDir: string; cwdSide: string; rootSide: string } | null {
  const cwdSide = join(tmp, 'cwd-side');
  const outDir = relative(process.cwd(), cwdSide);
  if (isAbsolute(outDir)) return null;                                     // another drive: the two readings cannot differ
  const ups = outDir.split(sep).filter((s) => s === '..').length;
  const root = join(tmp, ...Array.from({ length: ups }, (_, i) => `d${i}`));
  const rootSide = resolve(root, outDir);
  if (!rootSide.startsWith(tmp) || rootSide === cwdSide) return null;
  mkdirSync(rootSide, { recursive: true });
  mkdirSync(cwdSide, { recursive: true });
  return { root, outDir, cwdSide, rootSide };
}

/**
 * The two relative-outDir cases need the clone and the temp directory on one drive: across drives `relative()` answers
 * an absolute path, and the cwd's reading and the root's cannot differ (the delta review's L-a). They skip, saying so.
 */
const SAME_DRIVE = !isAbsolute(relative(process.cwd(), tmpdir()));
const ACROSS = SAME_DRIVE ? '' : ' -- skipped: the clone and TEMP are on different drives';

describe('the build plugins write where Vite writes: build.outDir resolved against config.root', () => {
  it.skipIf(!SAME_DRIVE)(`shipFontLicences: a relative outDir lands under the root, not the cwd (the OFL texts and the fonts)${ACROSS}`, () => {
    const l = layout();
    expect(l, 'a layout inside the temp directory').not.toBeNull();
    const p = shipFontLicences();
    p.configResolved({ root: l!.root, build: { outDir: l!.outDir } });
    p.closeBundle();
    expect(existsSync(join(l!.cwdSide, 'fonts')), 'written beside the cwd').toBe(false);
    const shipped = readdirSync(join(l!.rootSide, 'fonts'));
    expect(shipped.filter((f) => f.endsWith('.txt')).length).toBeGreaterThanOrEqual(3);
    expect(shipped.filter((f) => f.endsWith('.woff2')).length).toBeGreaterThanOrEqual(3);
  });

  it.skipIf(!SAME_DRIVE)(`fmvPlugin: the decoder, COPYING, the source offer, the source and the tarball land under the root's outDir${ACROSS}`, () => {
    const l = layout();
    expect(l, 'a layout inside the temp directory').not.toBeNull();
    const wasmDir = join(tmp, 'wasm');
    mkdirSync(join(wasmDir, 'out'), { recursive: true });
    writeFileSync(join(wasmDir, 'out', 'libmpeg2.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
    writeFileSync(join(wasmDir, 'COPYING'), 'GNU GENERAL PUBLIC LICENSE\n');
    const tarball = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00]);
    writeFileSync(join(wasmDir, 'out', TARBALL_NAME), tarball);
    for (const name of FMV_SOURCE_FILES) writeFileSync(join(wasmDir, name), name);
    writeFileSync(join(wasmDir, 'build.sh'), `SHA256=${createHash('sha256').update(tarball).digest('hex')}\nBYTES=${tarball.length}\n`);
    const p = fmvPlugin(wasmDir);
    p.configResolved({ root: l!.root, build: { outDir: l!.outDir } });
    p.closeBundle();
    expect(existsSync(join(l!.cwdSide, 'fmv')), 'written beside the cwd').toBe(false);
    expect(readdirSync(join(l!.rootSide, 'fmv')).sort()).toEqual(['COPYING', 'SOURCE-OFFER.txt', 'build.sh', 'config.h', 'glue.c', 'libmpeg2.wasm', 'mpeg2dec_0.5.1.orig.tar.gz']);
  });

  it('an absolute outDir stays as it is', () => {
    const out = join(tmp, 'abs');
    mkdirSync(out, { recursive: true });
    const p = shipFontLicences();
    p.configResolved({ root: join(tmp, 'elsewhere'), build: { outDir: out } });
    p.closeBundle();
    expect(existsSync(join(out, 'fonts'))).toBe(true);
  });
});
