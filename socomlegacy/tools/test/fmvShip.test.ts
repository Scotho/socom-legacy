import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { FMV_DIR, FMV_SOURCE_FILES, LIBMPEG2_PIN, TARBALL_NAME, fmvPlugin, libmpeg2Pin, movieFiles, shipMovieDecoder, sourceOffer } from '../fmvShip';

/**
 * What the viewer's build ships for the movies (PLAT-19b, W9.R9, OT.R66; research 120 §6): the decoder's `.wasm` with
 * upstream's `COPYING`, the source offer, our part of its source (`glue.c`, `config.h`, `build.sh`) and upstream's
 * pinned tarball (`mpeg2dec_0.5.1.orig.tar.gz`, checked against `build.sh`'s `SHA256=` and `BYTES=`) beside it, when
 * the dev host has built it; and never a movie -- no `.pss`,
 * `.m2v` or transcoded movie anywhere in the build output, by name or by its first bytes. The build runs the same check
 * (`vite.config.ts`'s `s2u:fmv` plugin fails the build), which is how CI sees it: `npm run build` follows the tests.
 */

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = (): string => { const d = mkdtempSync(join(tmpdir(), 'fmvship-')); dirs.push(d); return d; };

describe('movieFiles: a movie in the build output, by name or by its first bytes', () => {
  it('finds the disc\'s container and stream by extension, and a movie renamed by its magic; passes the site\'s own files', () => {
    const d = tmp();
    mkdirSync(join(d, 'assets'));
    const put = (name: string, bytes: number[] | string): void => writeFileSync(join(d, name), typeof bytes === 'string' ? bytes : Uint8Array.from(bytes));
    put('index.html', '<!doctype html>');
    put('assets/main-abc.js', 'export const x = 1;');
    put('assets/libmpeg2.wasm', [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
    put('assets/font.woff2', [0x77, 0x4f, 0x46, 0x32]);
    put('MENULOOP.PSS', [1, 2, 3]);                                       // by name, whatever it holds
    put('assets/intro.m2v', [1, 2, 3]);
    put('assets/a.bin', [0, 0, 1, 0xba, 0x44, 0, 4]);                    // a program stream's pack header
    put('assets/b.dat', [0, 0, 1, 0xb3, 0x28, 1, 0xc0]);                 // an elementary stream's sequence header
    put('assets/c.dat', [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69]);  // MP4 'ftyp'
    put('assets/d.dat', [0x1a, 0x45, 0xdf, 0xa3, 0x9f]);                 // Matroska / WebM
    put('assets/menuloop.mp4', 'x');
    put('assets/e.yuv', [0]);
    expect(movieFiles(d).map((f) => f.path).sort()).toEqual([
      'MENULOOP.PSS', 'assets/a.bin', 'assets/b.dat', 'assets/c.dat', 'assets/d.dat', 'assets/e.yuv', 'assets/intro.m2v', 'assets/menuloop.mp4',
    ]);
    expect(movieFiles(d).find((f) => f.path === 'assets/a.bin')!.why).toMatch(/program stream/);
  });

  it('an empty or movie-free output finds nothing', () => {
    const d = tmp();
    writeFileSync(join(d, 'a.js'), 'x');
    expect(movieFiles(d)).toEqual([]);
  });
});

describe('shipMovieDecoder: the wasm, COPYING, the source offer, our part of the source and the tarball, beside each other', () => {
  /** A stand-in for upstream's tarball (gzip's magic, then filler), and the pin a build script holds for it. */
  const fakeTarball = Uint8Array.from([0x1f, 0x8b, 8, 0, ...Array.from({ length: 60 }, (_, i) => i)]);
  const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
  const pinLines = (b: Uint8Array): string => `SHA256=${sha(b)}\nBYTES=${b.length}\n`;
  /** A wasm directory as the repository holds it, with a built wasm and the tarball `build.sh` keeps in `out/`. */
  const wasmTree = (): string => {
    const wasmDir = tmp();
    mkdirSync(join(wasmDir, 'out'));
    writeFileSync(join(wasmDir, 'out', 'libmpeg2.wasm'), Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0));
    writeFileSync(join(wasmDir, 'out', TARBALL_NAME), fakeTarball);
    writeFileSync(join(wasmDir, 'COPYING'), 'GNU GENERAL PUBLIC LICENSE Version 2');
    for (const name of FMV_SOURCE_FILES) writeFileSync(join(wasmDir, name), `the ${name} of this tree\n${name === 'build.sh' ? pinLines(fakeTarball) : ''}`);
    return wasmDir;
  };
  const all = ['COPYING', 'SOURCE-OFFER.txt', 'build.sh', 'config.h', 'glue.c', 'libmpeg2.wasm', 'mpeg2dec_0.5.1.orig.tar.gz'];

  it('copies the built wasm, the notices, the glue, config header and build script, and the tarball into <outDir>/fmv/', () => {
    const wasmDir = wasmTree();
    const out = tmp();
    const r = shipMovieDecoder(wasmDir, out);
    expect(TARBALL_NAME).toBe('mpeg2dec_0.5.1.orig.tar.gz');
    expect(r).toEqual({ shipped: true, files: all });
    expect(readdirSync(join(out, FMV_DIR)).sort()).toEqual(all);
    expect(readFileSync(join(out, FMV_DIR, 'COPYING'), 'utf8')).toMatch(/GENERAL PUBLIC LICENSE/);
    for (const name of FMV_SOURCE_FILES) expect(readFileSync(join(out, FMV_DIR, name), 'utf8').startsWith(`the ${name} of this tree`)).toBe(true);
    expect(Uint8Array.from(readFileSync(join(out, FMV_DIR, TARBALL_NAME)))).toEqual(fakeTarball);
    // The offer it writes names the pin of the build script it ships, the one the tarball was checked against.
    expect(readFileSync(join(out, FMV_DIR, 'SOURCE-OFFER.txt'), 'utf8')).toContain(sha(fakeTarball));
  });

  it('refuses to ship the wasm without the tarball: a missing one fails the build, before anything is copied', () => {
    const wasmDir = wasmTree();
    rmSync(join(wasmDir, 'out', TARBALL_NAME));
    const out = tmp();
    expect(() => shipMovieDecoder(wasmDir, out)).toThrow(TARBALL_NAME);
    expect(existsSync(join(out, FMV_DIR))).toBe(false);
  });

  it('refuses a tarball whose sha256 differs from build.sh\'s pin, or whose size does, before anything is copied', () => {
    const wrongHash = wasmTree();
    const flipped = Uint8Array.from(fakeTarball);
    flipped[10] = flipped[10]! ^ 0xff;                                       // the same size, other bytes
    writeFileSync(join(wrongHash, 'out', TARBALL_NAME), flipped);
    const out = tmp();
    expect(() => shipMovieDecoder(wrongHash, out)).toThrow(/sha256/);
    expect(existsSync(join(out, FMV_DIR))).toBe(false);
    const wrongSize = wasmTree();
    writeFileSync(join(wrongSize, 'out', TARBALL_NAME), Uint8Array.from([...fakeTarball, 0]));
    expect(() => shipMovieDecoder(wrongSize, tmp())).toThrow(/bytes/);
  });

  it('refuses a build script without its pin (no SHA256= or BYTES= line)', () => {
    const wasmDir = wasmTree();
    writeFileSync(join(wasmDir, 'build.sh'), 'the build.sh of this tree\n');
    expect(() => shipMovieDecoder(wasmDir, tmp())).toThrow(/SHA256=/);
  });

  it('the dev server serves the tarball under its own name, as gzip bytes, not re-encoded', () => {
    const wasmDir = wasmTree();
    type Handler = (req: { url?: string }, res: { setHeader(k: string, v: string): void; end(b?: Uint8Array | string): void }, next: () => void) => void;
    let handler: Handler | undefined;
    fmvPlugin(wasmDir).configureServer({ middlewares: { use(h: Handler) { handler = h; } } });
    const headers: Record<string, string> = {};
    let body: Uint8Array | string | undefined;
    let passed = false;
    handler!({ url: `/s2u/fmv/${TARBALL_NAME}` }, { setHeader: (k, v) => { headers[k] = v; }, end: (b) => { body = b; } }, () => { passed = true; });
    expect(passed).toBe(false);
    expect(headers['Content-Type']).toBe('application/gzip');
    expect(headers['Content-Encoding']).toBeUndefined();
    expect(Uint8Array.from(body as Uint8Array)).toEqual(fakeTarball);
    // Another .tar.gz name is not the tarball, and falls through.
    passed = false;
    handler!({ url: '/fmv/other.tar.gz' }, { setHeader: () => {}, end: () => {} }, () => { passed = true; });
    expect(passed).toBe(true);
  });

  it('refuses to ship the wasm without its source: a missing glue, config header or build script fails the build', () => {
    for (const missing of FMV_SOURCE_FILES) {
      const wasmDir = wasmTree();
      rmSync(join(wasmDir, missing));
      expect(() => shipMovieDecoder(wasmDir, tmp())).toThrow(missing);
    }
  });

  it('without a built wasm (CI, a fresh clone) ships nothing and says so', () => {
    const wasmDir = tmp();
    writeFileSync(join(wasmDir, 'COPYING'), 'GPL');
    const out = tmp();
    expect(shipMovieDecoder(wasmDir, out)).toEqual({ shipped: false, files: [] });
    expect(existsSync(join(out, FMV_DIR))).toBe(false);
  });

  it('the source offer names the release, the shipped tarball first and Debian\'s archive second, and the glue and build script beside it', () => {
    const t = sourceOffer();
    expect(LIBMPEG2_PIN.sha256).toBe('dee22e893cb5fc2b2b6ebd60b88478ab8556cb3b93f9a0d7ce8f3b61851871d4');
    expect(LIBMPEG2_PIN.bytes).toBe(524_776);
    expect(t).toContain('libmpeg2 0.5.1');
    expect(t).toContain(LIBMPEG2_PIN.sha256);
    expect(t).toContain(LIBMPEG2_PIN.url);
    expect(t).toContain(TARBALL_NAME);
    expect(t.indexOf(TARBALL_NAME)).toBeLessThan(t.indexOf(LIBMPEG2_PIN.url));
    for (const name of FMV_SOURCE_FILES) expect(t).toContain(name);
    expect(t).toMatch(/beside this file/);
    // Not a repository: the one it named did not hold the files, and this one is private (OT.R66).
    expect(t).not.toMatch(/github\.com|socom-unzipped/);
    expect(t).toMatch(/GNU General Public License/);
  });

  it('the pin is read from one place, build.sh\'s SHA256= and BYTES= lines, and build.sh keeps the tarball it checked in out/', () => {
    const wasmDir = resolve(import.meta.dirname, '../../packages/fmv/wasm');
    expect(libmpeg2Pin(wasmDir)).toEqual({ sha256: LIBMPEG2_PIN.sha256, bytes: LIBMPEG2_PIN.bytes });
    const sh = readFileSync(join(wasmDir, 'build.sh'), 'utf8');
    const check = sh.indexOf('[ "$got" = "$SHA256" ]');
    const size = sh.indexOf('[ "$size" = "$BYTES" ]');
    const copy = sh.indexOf(`cp "$TARBALL" "$OUT/${TARBALL_NAME}"`);
    expect(check, 'the sha256 check').toBeGreaterThan(0);
    expect(size, 'the size check').toBeGreaterThan(0);
    expect(copy, 'the copy into out/, after both checks').toBeGreaterThan(Math.max(check, size));
  });

  it('the repository holds every source file the build ships', () => {
    const wasmDir = resolve(import.meta.dirname, '../../packages/fmv/wasm');
    expect(FMV_SOURCE_FILES).toEqual(['glue.c', 'config.h', 'build.sh']);
    for (const name of FMV_SOURCE_FILES) expect(existsSync(join(wasmDir, name))).toBe(true);
  });

  it('the repository\'s own COPYING is upstream\'s GPL v2 text', () => {
    const copying = readFileSync(resolve(import.meta.dirname, '../../packages/fmv/wasm/COPYING'), 'utf8');
    expect(copying).toMatch(/GNU GENERAL PUBLIC LICENSE\s+Version 2/);
  });
});

const dist = resolve(import.meta.dirname, '../../dist/viewer');
describe.skipIf(!existsSync(resolve(dist, 'index.html')))('the built viewer (dist/viewer)', () => {
  it("holds no movie but the owner's OT.R34 background video", () => {
    expect(movieFiles(dist)).toEqual([]);
  });
  it('ships COPYING, the source offer, the source and the tarball wherever it ships the wasm', () => {
    if (!existsSync(join(dist, FMV_DIR, 'libmpeg2.wasm'))) return;
    for (const name of ['COPYING', 'SOURCE-OFFER.txt', ...FMV_SOURCE_FILES, TARBALL_NAME]) expect(existsSync(join(dist, FMV_DIR, name))).toBe(true);
  });
});
