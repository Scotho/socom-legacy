import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { FsAssetSource } from '../src/fsAssetSource';
import { FRONT_END_CLASSES, frontEndFiles, missingFrontEndNames } from '../src/frontEndFiles';
import { IsoAssetSource, ISO_READ_CHUNK } from '../src/isoAssetSource';
import { Zar, ZAR_HEAD, zarIndexLength, type ZarKey } from '../src/zar';

/**
 * PLAT-03's dev-disc checks (W6.R8): the front-end file list against the retail disc, the chunked read of
 * `MENULOOP.PSS`, and the LBN lookup against `tools_py/iso_lbn.py`. Each resolves its file through `SOCOM_DISC` (the
 * extracted tree) or `SOCOM_ISO` (the image) and skips itself when it is absent, as on CI. The pins are disc facts in
 * the form the other dev-disc tests keep them -- counts and sizes; no hash is pinned: the chunked hash is compared
 * with the whole-file hash computed here.
 */
const DISC = process.env.SOCOM_DISC;
const HAVE_DISC = !!DISC && existsSync(resolve(DISC, 'RUN'));
const ISO = process.env.SOCOM_ISO;
const HAVE_ISO = !!ISO && existsSync(ISO);

/** How many files each class holds on the US disc (the `SOCOM_DISC` directory listing, 2026-10-01). */
const CLASS_COUNTS: Record<string, number> = {
  'ui-readers': 2, 'ui-zed': 19, zanim: 3, locale: 4, 'locale-campaign': 4, movies: 16, font: 2, raw: 6, vagstore: 1, icons: 13, 'mission-movies': 49,
  'aop-movies': 4,
};

const countByClass = (paths: string[]): Record<string, number> => {
  const out: Record<string, number> = Object.fromEntries(FRONT_END_CLASSES.map((c) => [c.id, 0]));
  for (const f of frontEndFiles(paths, { deferred: true })) out[f.class.id]! += 1;
  return out;
};

describe.skipIf(!HAVE_DISC)('the front-end file list against the retail disc tree (SOCOM_DISC)', () => {
  it('finds every name the list gives, and the classes hold what the disc does', async () => {
    const paths = await new FsAssetSource(resolve(DISC ?? '')).list();
    expect(missingFrontEndNames(paths)).toEqual([]);
    expect(countByClass(paths)).toEqual(CLASS_COUNTS);
    // Every movie on the disc is in a class, the deferred ones counted: none is left in no class (PLAT-35).
    const movies = paths.filter((p) => /^RUN\/MOVIES\//i.test(p));
    expect(movies.length).toBe(16 + 49 + 4);
    expect(frontEndFiles(movies, { deferred: true }).length).toBe(movies.length);
  }, 60_000);
});

/** The retail image through a readSync-per-slice Blob stand-in (not fs.openAsBlob: its size wraps above 4 GiB on Windows). */
const fsBlob = (path: string): Blob & { close(): void } => {
  const fd = openSync(path, 'r');
  const size = fstatSync(fd).size;
  const slice = (start = 0, end = size): Blob => ({
    size: end - start,
    arrayBuffer: async () => {
      const out = new Uint8Array(end - start);
      let got = 0;
      while (got < out.length) {
        const n = readSync(fd, out, got, out.length - got, start + got);
        if (n === 0) break;
        got += n;
      }
      return out.buffer;
    },
  }) as unknown as Blob;
  return { size, slice, close: () => closeSync(fd) } as unknown as Blob & { close(): void };
};

/** The repository's root: the first directory above this file holding `.git` (a directory, or a worktree's file). */
const repoRoot = (from: string): string =>
  (existsSync(join(from, '.git')) || dirname(from) === from ? from : repoRoot(dirname(from)));
/**
 * The desktop checkout, where `scripts/python_env.sh` and `tools_py/iso_lbn.py` live -- no longer this tree:
 * `SOCOM_PC_ROOT`, else the `ref/desktop` submodule; the comparison skips with neither.
 */
const REPO = [process.env.SOCOM_PC_ROOT, join(repoRoot(import.meta.dirname), 'ref', 'desktop')]
  .filter((r): r is string => !!r).map((r) => resolve(r)).find((r) => existsSync(join(r, 'tools_py/iso_lbn.py'))) ?? '';

/**
 * `iso_lbn.py` run through the repository's own Python resolution (`scripts/python_env.sh`: PYTHON, else `python`,
 * else `python3`, each proved to run), with the image and its arguments. Null when no interpreter or no bash is there:
 * the comparison then skips rather than fails, as a missing disc does.
 */
const python = (args: string[]): string | null => {
  const run = spawnSync('bash', ['-c', '. scripts/python_env.sh && [ -n "$PYTHON" ] && "$PYTHON" "$@"', 'python', ...args], {
    cwd: REPO, encoding: 'utf8', maxBuffer: 16 << 20,
  });
  return run.status === 0 ? run.stdout : null;
};
const isoLbn = (args: string[]): string | null => python(['tools_py/iso_lbn.py', ...args]);
const HAVE_PYTHON = HAVE_ISO && REPO !== '' && python(['-c', '']) !== null;

describe.skipIf(!HAVE_ISO)('the front-end classes on the retail image (SOCOM_ISO)', () => {
  it('lists every class on the image as on the tree, and names nothing the image lacks', async () => {
    const blob = fsBlob(ISO ?? '');
    try {
      const paths = await new IsoAssetSource(blob).list();
      expect(missingFrontEndNames(paths)).toEqual([]);
      expect(countByClass(paths)).toEqual(CLASS_COUNTS);
    } finally {
      blob.close();
    }
  }, 60_000);

  it('reads MENULOOP.PSS in chunks whose concatenated hash is the whole file\'s', async () => {
    const blob = fsBlob(ISO ?? '');
    try {
      const source = new IsoAssetSource(blob);
      const path = 'RUN/MOVIES/COMMON/MENULOOP.PSS';
      const size = await source.size(path);
      expect(size).toBe(115_458_052);
      const chunked = createHash('sha256');
      let chunks = 0;
      let largest = 0;
      for await (const chunk of source.stream(path)) {
        chunked.update(chunk);
        chunks++;
        largest = Math.max(largest, chunk.length);
      }
      expect(chunks).toBe(Math.ceil(size / ISO_READ_CHUNK));
      expect(largest).toBe(ISO_READ_CHUNK);
      const whole = createHash('sha256').update(await source.read(path)).digest('hex');
      expect(chunked.digest('hex')).toBe(whole);
    } finally {
      blob.close();
    }
  }, 300_000);
});

describe.skipIf(!HAVE_PYTHON)('the LBN lookup agrees with tools_py/iso_lbn.py (SOCOM_ISO, Python)', () => {
  it('for 20 VAGSTORE members, sampled across the archive, and for the archive\'s own extent', async () => {
    const blob = fsBlob(ISO ?? '');
    try {
      const source = new IsoAssetSource(blob);
      const path = 'RUN/SOUNDS/VAGSTORE.ZAR';
      const extent = await source.extent(path);
      // The archive's index by range (its head, its string table and key tree), never its 577 MB.
      const head = await source.readRange(path, 0, ZAR_HEAD);
      const zar = Zar.parse(await source.readRange(path, 0, zarIndexLength(head)));
      const members: ZarKey[] = [];
      zar.walk((key) => { if (key.children.length === 0 && key.size > 0) members.push(key); });
      expect(members.length).toBeGreaterThanOrEqual(20);
      const sample = Array.from({ length: 20 }, (_, i) => members[Math.floor((i * (members.length - 1)) / 19)]);
      const wanted = sample.map((key) => {
        const at = zar.dataOffset + key!.offset;
        return { name: key!.name, at, sector: extent.lbn + Math.floor(at / 2048), byte: at % 2048 };
      });
      const ours = await Promise.all(wanted.map((w) => source.fileAt(w.sector, w.byte)));
      ours.forEach((o, i) => expect(o, wanted[i]!.name).toEqual({ path, lbn: extent.lbn, sectors: wanted[i]!.sector - extent.lbn, offset: wanted[i]!.at }));

      const out = isoLbn([ISO ?? '', 'lookup', ...wanted.map((w) => `0x${w.sector.toString(16)}`)]);
      expect(out).not.toBeNull();
      const theirs = out!.trim().split(/\r?\n/).map((line) => {
        const m = /^0x([0-9a-f]+): (\S+) \+(\d+) sectors$/.exec(line.trim());
        expect(m, line).not.toBeNull();
        return { sector: parseInt(m![1]!, 16), path: m![2]!.replace(/^\//, ''), sectors: Number(m![3]) };
      });
      expect(theirs).toEqual(ours.map((o, i) => ({ sector: wanted[i]!.sector, path: o!.path, sectors: o!.sectors })));

      // And the reverse: the archive's first LBN and length as `iso_lbn.py list` prints them.
      const list = isoLbn([ISO ?? '', 'list']);
      const row = list?.split(/\r?\n/).find((line) => line.trim().endsWith(`/${path}`));
      expect(row).toBeDefined();
      const [lbn, size] = row!.trim().split(/\s+/);
      expect({ lbn: parseInt(lbn!, 16), size: Number(size) }).toEqual(extent);
    } finally {
      blob.close();
    }
  }, 300_000);
});
