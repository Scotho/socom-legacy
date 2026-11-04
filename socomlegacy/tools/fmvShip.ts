/**
 * What the viewer's build ships for the movies (PLAT-19b; W9.R9; OT.R66; research 120 §6), used by `packages/viewer/
 * vite.config.ts`'s `s2u:fmv` plugin and held by `tools/test/fmvShip.test.ts`:
 *
 * - **The decoder, its licence, the source offer and its source.** When the dev host has built
 *   `packages/fmv/wasm/out/libmpeg2.wasm` (`build.sh`; never committed), the build copies it to `<outDir>/fmv/` with
 *   upstream's `COPYING` (GPL-2.0), `SOURCE-OFFER.txt`, `glue.c`, `config.h` and `build.sh`, and upstream's pinned
 *   tarball `mpeg2dec_0.5.1.orig.tar.gz` (which `build.sh` keeps in `out/` once checked; never committed) beside it --
 *   libmpeg2 is GPL-2.0-or-later and the wasm is a binary of it, so its whole corresponding source goes with it, on the
 *   same server as the binary (OT.R66: this repository is private, so a pointer into it reaches no one; the owner's
 *   "ship the 0.5 MB tarball beside the wasm"). The offer names the shipped tarball first and Debian's archive second.
 *   A wasm whose source files or tarball are missing, or whose tarball's sha256 or size is not `build.sh`'s pin, is
 *   refused. Without a built wasm (CI, a fresh clone) nothing is shipped and the page reports the decoder absent.
 * - **Never a movie.** `movieFiles` walks the build output for a movie by name (`.pss`, `.m2v`, the transcode
 *   containers) or by its first bytes (a program stream's pack, an elementary stream's sequence header, MP4, Matroska
 *   / WebM, AVI, Ogg, a transport stream), and the plugin fails the build on any: the movies are decoded from the
 *   player's own disc, never shipped (MISSION R3) -- save the one the owner names, the setup page's background video
 *   at `startup/menuloop.mp4` (`OWNER_MOVIE_EXCEPTION`, OT.R34).
 */
import { copyFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The directory under the build output that holds the decoder and its notices; the page asks for `<base>fmv/libmpeg2.wasm`. */
export const FMV_DIR = 'fmv';
export const WASM_NAME = 'libmpeg2.wasm';
/** Our part of the wasm's corresponding source (`packages/fmv/wasm/`), shipped beside it (OT.R66). */
export const FMV_SOURCE_FILES = ['glue.c', 'config.h', 'build.sh'] as const;

/** Upstream's tarball, as `build.sh` keeps it in `out/` and the build ships it in `fmv/` (OT.R66). */
export const TARBALL_NAME = 'mpeg2dec_0.5.1.orig.tar.gz';

/**
 * The tarball's pin, read from its one place: `build.sh`'s `SHA256=` and `BYTES=` lines in `wasmDir` -- the script that
 * checks the tarball before it builds, and the one shipped beside it. Throws when either line is missing.
 */
export function libmpeg2Pin(wasmDir: string): { sha256: string; bytes: number } {
  const sh = existsSync(join(wasmDir, 'build.sh')) ? readFileSync(join(wasmDir, 'build.sh'), 'utf8') : '';
  const sha256 = /^SHA256=([0-9a-f]{64})\r?$/m.exec(sh)?.[1];
  const bytes = /^BYTES=(\d+)\r?$/m.exec(sh)?.[1];
  if (!sha256 || !bytes) throw new Error(`s2u:fmv: ${join(wasmDir, 'build.sh')} holds no SHA256= or BYTES= line, the pin of ${TARBALL_NAME} (OT.R66)`);
  return { sha256, bytes: Number(bytes) };
}

/** The repository's `packages/fmv/wasm`, the directory `build.sh` and its `out/` are in. */
const REPO_WASM_DIR = fileURLToPath(new URL('../packages/fmv/wasm', import.meta.url));

/** The source `build.sh` pins (research 98 §7.1): its sha256 and size read from `build.sh` itself. */
export const LIBMPEG2_PIN: { release: string; url: string; bytes: number; sha256: string } = {
  release: 'libmpeg2 0.5.1',
  url: `https://deb.debian.org/debian/pool/main/m/mpeg2dec/${TARBALL_NAME}`,
  ...libmpeg2Pin(REPO_WASM_DIR),
};

/** The written offer that goes beside the wasm; `pin` is the shipped `build.sh`'s, the one the tarball was checked against. */
export function sourceOffer(pin: { sha256: string; bytes: number } = LIBMPEG2_PIN): string {
  return [
    `${WASM_NAME} -- the MPEG-2 video decoder of this page`,
    '',
    `It is ${LIBMPEG2_PIN.release} (https://libmpeg2.sourceforge.io/), compiled to WebAssembly with Emscripten, and is`,
    'free software under the GNU General Public License, version 2 or (at your option) any later version. The licence',
    'text is COPYING, beside this file.',
    '',
    'Its corresponding source is in two parts, both beside this file on this server:',
    `- ${TARBALL_NAME}: ${LIBMPEG2_PIN.release} as released upstream (${pin.bytes} bytes, sha256`,
    `  ${pin.sha256}),`,
    "  compiled as it is, without Debian's patches, by the build script below. The same file is in Debian's archive:",
    `  ${LIBMPEG2_PIN.url}`,
    `- ${FMV_SOURCE_FILES.join(', ')}: the glue compiled into the wasm with libmpeg2, the configuration header it`,
    '  is compiled against, and the build script, which holds every flag of the build.',
    '',
    "The page decodes the game's movies from the player's own disc image. The one movie a build may hold is the setup",
    "page's background video (startup/menuloop.mp4), the owner's exception (OT.R34).",
    '',
  ].join('\n');
}

/**
 * Copy the built wasm, `COPYING`, the source offer, `FMV_SOURCE_FILES` and the tarball into `<outDir>/fmv/`. `wasmDir`
 * is `packages/fmv/wasm` (its `out/` holds the build and the tarball). Ships nothing, and says so, when the wasm has not
 * been built; throws, before copying anything, when a source file or the tarball is missing, or the tarball's size or
 * sha256 is not `build.sh`'s pin (the binary never ships without its source).
 */
export function shipMovieDecoder(wasmDir: string, outDir: string): { shipped: boolean; files: string[] } {
  const wasm = join(wasmDir, 'out', WASM_NAME);
  if (!existsSync(wasm)) return { shipped: false, files: [] };
  const missing = FMV_SOURCE_FILES.filter((name) => !existsSync(join(wasmDir, name)));
  if (missing.length) throw new Error(`s2u:fmv: ${WASM_NAME} is built but its source is missing (${missing.join(', ')} in ${wasmDir}); the decoder never ships without it (OT.R66)`);
  const tarball = join(wasmDir, 'out', TARBALL_NAME);
  if (!existsSync(tarball)) {
    throw new Error(`s2u:fmv: ${WASM_NAME} is built but upstream's tarball is missing (${TARBALL_NAME} in ${join(wasmDir, 'out')}: `
      + `build.sh keeps it there, or put the pinned one there, ${LIBMPEG2_PIN.url}); the decoder never ships without it (OT.R66)`);
  }
  const pin = libmpeg2Pin(wasmDir);
  const bytes = readFileSync(tarball);
  if (bytes.length !== pin.bytes) throw new Error(`s2u:fmv: ${tarball} is ${bytes.length} bytes, build.sh pins ${pin.bytes} bytes; not shipped (OT.R66)`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== pin.sha256) throw new Error(`s2u:fmv: ${tarball} has sha256 ${sha256}, build.sh pins sha256 ${pin.sha256}; not shipped (OT.R66)`);
  const dst = join(outDir, FMV_DIR);
  mkdirSync(dst, { recursive: true });
  copyFileSync(wasm, join(dst, WASM_NAME));
  copyFileSync(join(wasmDir, 'COPYING'), join(dst, 'COPYING'));
  for (const name of FMV_SOURCE_FILES) copyFileSync(join(wasmDir, name), join(dst, name));
  copyFileSync(tarball, join(dst, TARBALL_NAME));
  writeFileSync(join(dst, 'SOURCE-OFFER.txt'), sourceOffer(pin));
  return { shipped: true, files: ['COPYING', 'SOURCE-OFFER.txt', ...FMV_SOURCE_FILES, WASM_NAME, TARBALL_NAME].sort() };
}

/** Extensions of a movie, its streams or a transcode of one. (`.ts` is left out: it names the build's TypeScript too; a transport stream is caught by its bytes.) */
const MOVIE_EXT = /\.(pss|m2v|m1v|mpv|m2p|mpg|mpeg|vob|ipu|mp4|m4v|mov|webm|mkv|avi|ogv|wmv|flv|3gp|y4m|yuv|ivf|h264|264|hevc)$/i;

/** What a file's first bytes say it is, if a movie. */
function movieMagic(b: Uint8Array): string | null {
  const at = (i: number, ...v: number[]): boolean => v.every((x, k) => b[i + k] === x);
  const ascii = (i: number, s: string): boolean => at(i, ...[...s].map((c) => c.charCodeAt(0)));
  if (at(0, 0, 0, 1, 0xba)) return 'an MPEG program stream (pack header 00 00 01 BA)';
  if (at(0, 0, 0, 1, 0xb3)) return 'an MPEG video elementary stream (sequence header 00 00 01 B3)';
  if (ascii(4, 'ftyp') || ascii(4, 'moov') || ascii(4, 'mdat')) return 'an MP4 / QuickTime file';
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return 'a Matroska / WebM file';
  if (ascii(0, 'RIFF') && ascii(8, 'AVI ')) return 'an AVI file';
  if (ascii(0, 'OggS')) return 'an Ogg file';
  if (b.length >= 377 && b[0] === 0x47 && b[188] === 0x47 && b[376] === 0x47) return 'an MPEG transport stream';
  return null;
}

/**
 * The one movie a build may hold: the setup page's background video, the owner's named exception to MISSION R3 (OT.R34,
 * "add an exception for the bg video"). Exactly this path under the output; any other movie, or this name elsewhere, still fails.
 */
export const OWNER_MOVIE_EXCEPTION = 'startup/menuloop.mp4';

/** The movies under `dir` (save `OWNER_MOVIE_EXCEPTION`), by name or by their first bytes, with the reason; paths relative to `dir`, forward slashes. */
export function movieFiles(dir: string): { path: string; why: string }[] {
  const out: { path: string; why: string }[] = [];
  const head = new Uint8Array(377);
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      const rel = relative(dir, p).replace(/\\/g, '/');
      if (rel === OWNER_MOVIE_EXCEPTION) continue;
      if (MOVIE_EXT.test(name)) { out.push({ path: rel, why: `a movie's extension (${name.slice(name.lastIndexOf('.'))})` }); continue; }
      head.fill(0);
      const fd = openSync(p, 'r');
      let n = 0;
      try { n = readSync(fd, head, 0, head.length, 0); } finally { closeSync(fd); }
      const why = movieMagic(head.subarray(0, n));
      if (why) out.push({ path: rel, why });
    }
  };
  walk(dir);
  return out;
}

/** Structural, as `shared/vite.ts`'s: the plugin type-checks without importing vite. */
interface MiddlewareServer {
  middlewares: { use(handler: (req: { url?: string }, res: { setHeader(k: string, v: string): void; end(b?: Uint8Array | string): void }, next: () => void) => void): void };
}

/**
 * The viewer's plugin: in dev, `/fmv/libmpeg2.wasm`, `COPYING`, `SOURCE-OFFER.txt`, the source files and the tarball
 * served from the wasm build; at the end of a build, the same shipped into the output, then the output refused if it
 * holds a movie.
 */
export function fmvPlugin(wasmDir: string): {
  name: string;
  configResolved(config: { root?: string; build: { outDir: string } }): void;
  configureServer(server: MiddlewareServer): void;
  closeBundle(): void;
} {
  let outDir = '';
  return {
    name: 's2u:fmv',
    // Vite keeps `build.outDir` as given and resolves a relative one against `config.root` when it writes the bundle; read
    // bare, a relative outDir would ship the decoder beside this process's cwd -- and skip the movie check, the output
    // not found there (the nightly plan's NB-6 review, B-1). Resolved as Vite does; an absolute one is unchanged.
    configResolved(config) { outDir = resolve(config.root ?? '', config.build.outDir); },
    configureServer(server) {
      // `<base>fmv/<name>`, whatever the base (`VIEWER_BASE`).
      server.middlewares.use((req, res, next) => {
        const name = new RegExp(`/${FMV_DIR}/([^/?#]+)(?:[?#]|$)`).exec(req.url ?? '')?.[1];
        if (!name) { next(); return; }
        const file = name === WASM_NAME || name === TARBALL_NAME ? join(wasmDir, 'out', name)
          : name === 'COPYING' || (FMV_SOURCE_FILES as readonly string[]).includes(name) ? join(wasmDir, name) : null;
        if (name === 'SOURCE-OFFER.txt') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(sourceOffer(libmpeg2Pin(wasmDir))); return; }
        if (!file || !existsSync(file)) { next(); return; }
        const size = statSync(file).size;
        const bytes = new Uint8Array(size);
        const fd = openSync(file, 'r');
        try { readSync(fd, bytes, 0, size, 0); } finally { closeSync(fd); }
        // The tarball goes as the gzip file it is: its type, and no Content-Encoding (a browser would unpack it).
        res.setHeader('Content-Type', name === WASM_NAME ? 'application/wasm' : name === TARBALL_NAME ? 'application/gzip' : 'text/plain; charset=utf-8');
        res.end(bytes);
      });
    },
    closeBundle() {
      if (!outDir || !existsSync(outDir)) return;
      const shipped = shipMovieDecoder(wasmDir, outDir);
      console.log(shipped.shipped ? `s2u:fmv: shipped ${FMV_DIR}/${WASM_NAME} with COPYING, SOURCE-OFFER.txt and its source (${[TARBALL_NAME, ...FMV_SOURCE_FILES].join(', ')})`
        : `s2u:fmv: no ${WASM_NAME} built (packages/fmv/wasm/build.sh), so none shipped; the page reports the decoder absent`);
      const movies = movieFiles(outDir);
      if (movies.length) {
        throw new Error(`s2u:fmv: the build output holds ${movies.length} movie file(s), which never ship (MISSION R3): `
          + movies.map((m) => `${m.path} (${m.why})`).join('; '));
      }
    },
  };
}
