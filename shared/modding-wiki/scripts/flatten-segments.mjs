// A post-build step over out/ (product track: an adaptation of the build output, no page changes).
// With `output: 'export'`, Next 16.4.2's client prefetcher asks for one flat file per route segment,
// `<route>/__next<segment path, '/' written as '.'>.txt` (convertSegmentPathToStaticExportFilename,
// next/dist/shared/lib/segment-cache/segment-value-encoding.js). The export builds that name from a path.relative()
// result (next/dist/export/index.js, collectSegmentPaths), so on Windows the separator is '\', the replace of '/'
// misses it, and the file lands nested -- `<route>/__next.$oc$slug/__PAGE__.txt` -- where a plain static host
// (Cloudflare Pages) answers the client's `<route>/__next.$oc$slug.__PAGE__.txt` with a 404.
// This moves every nested segment file to the flat name the client requests and removes the emptied folder. Where
// the build already writes flat names it finds nothing and changes nothing.
// Usage: node scripts/flatten-segments.mjs [outDir]
import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEGMENT_DIR = /^__next\./;

/** Every nested segment folder under out/ (a `__next.*` directory), outside out/_next. */
export function nestedSegmentDirs(out) {
  const dirs = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (!statSync(p).isDirectory()) continue;
      if (dir === out && name === '_next') continue;
      if (SEGMENT_DIR.test(name)) dirs.push(p);
      else visit(p);
    }
  };
  visit(out);
  return dirs;
}

/** The files of one nested folder, each with the flat name beside the folder: `__next.a/b/c.txt` -> `__next.a.b.c.txt`. */
export function flatNames(segDir) {
  const files = [];
  const collect = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) collect(p, `${prefix}.${name}`);
      else files.push({ from: p, to: join(dirname(segDir), `${prefix}.${name}`) });
    }
  };
  collect(segDir, basename(segDir));
  return files;
}

/** Moves every nested segment file to its flat name and removes each emptied folder; returns the moves made. */
export function flattenSegments(out) {
  const moves = [];
  for (const segDir of nestedSegmentDirs(out)) {
    const files = flatNames(segDir);
    for (const { from, to } of files) {
      if (existsSync(to)) throw new Error(`flatten-segments: ${to} exists already; not overwriting it`);
      renameSync(from, to);
      moves.push({ from, to });
    }
    rmSync(segDir, { recursive: true }); // holds only folders now: every file was moved out above
  }
  return moves;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const wiki = join(dirname(fileURLToPath(import.meta.url)), '..');
  const out = process.argv[2] ?? join(wiki, 'out');
  if (!existsSync(out)) {
    console.error('flatten-segments: out/ is missing -- run `npm run build` first');
    process.exit(1);
  }
  const moves = flattenSegments(out);
  console.log(`flatten-segments: ${moves.length} nested prefetch segment file(s) moved to their flat names`);
}
