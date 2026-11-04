import { describe, expect, it } from 'vitest';
import { closeSync, existsSync, fstatSync, openAsBlob, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { isRanged, streamFile } from '../src/assetSource';
import { DirectoryAssetSource, DISC_ROOT_DIRECTORIES } from '../src/directoryAssetSource';
import { IsoAssetSource, ISO_READ_CHUNK } from '../src/isoAssetSource';

/**
 * DA-1 (plan `docs/plans/2026-10-11-disc-access.md`): a picked folder or drive as a ranged `AssetSource`. A browser
 * adaptation (DA.R2): the original reads its own disc in its own drive, so the only bar is that this source names the
 * files as the ISO source does and answers the same bytes for the same path.
 */

/** A file whose every byte says where it is, so a read from the wrong offset cannot pass by luck. */
const pattern = (length: number, seed: number): Uint8Array => {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed * 7 + (i >>> 8)) & 0xff;
  return out;
};

const blob = (bytes: Uint8Array): Blob => new Blob([bytes as Uint8Array<ArrayBuffer>]);

const collect = async (chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> => {
  const out: Uint8Array[] = [];
  for await (const c of chunks) out.push(c);
  return out;
};

const join2 = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

const BIG = pattern(ISO_READ_CHUNK * 2 + 1234, 9);

/** A drive-root pick: the disc's own top level, as a drive letter's `File`s name it (`webkitRelativePath` aside). */
const driveRoot = () => new DirectoryAssetSource([
  { path: 'SYSTEM.CNF', blob: blob(new TextEncoder().encode('BOOT2 = cdrom0:\\SCUS_972.75;1\r\n')) },
  { path: 'RUN/MP2.ZDB', blob: blob(pattern(5000, 1)) },
  { path: 'RUN/UI/READERC.ZAR', blob: blob(pattern(17, 2)) },
  { path: 'RUN/BIG.BIN', blob: blob(BIG) },
  { path: 'RUN/EMPTY.TXT', blob: blob(new Uint8Array(0)) },
  { path: 'ENDER', blob: blob(pattern(3, 3)) },
]);

describe('DirectoryAssetSource: path names', () => {
  it('names a drive-root pick as the ISO source does: upper case, forward slashes, sorted', async () => {
    const source = driveRoot();
    expect(await source.list()).toEqual(['ENDER', 'RUN/BIG.BIN', 'RUN/EMPTY.TXT', 'RUN/MP2.ZDB', 'RUN/UI/READERC.ZAR', 'SYSTEM.CNF']);
  });

  it('strips the picked folder\'s own name when every entry shares it and it is not one of the disc\'s', async () => {
    const source = new DirectoryAssetSource([
      { path: 'My Disc/SYSTEM.CNF', blob: blob(pattern(4, 1)) },
      { path: 'My Disc/RUN/MP2.ZDB', blob: blob(pattern(5, 2)) },
    ]);
    expect(await source.list()).toEqual(['RUN/MP2.ZDB', 'SYSTEM.CNF']);
    expect(await source.read('RUN/MP2.ZDB')).toEqual(pattern(5, 2));
  });

  it('keeps a shared first segment that is one of the disc\'s own top-level directories', async () => {
    expect(DISC_ROOT_DIRECTORIES).toContain('RUN');
    const source = new DirectoryAssetSource([
      { path: 'run/MP2.ZDB', blob: blob(pattern(5, 2)) },
      { path: 'run/UI/READERC.ZAR', blob: blob(pattern(6, 3)) },
    ]);
    expect(await source.list()).toEqual(['RUN/MP2.ZDB', 'RUN/UI/READERC.ZAR']);
  });

  it('does not strip a lone file at the top', async () => {
    const source = new DirectoryAssetSource([{ path: 'SYSTEM.CNF', blob: blob(pattern(4, 1)) }]);
    expect(await source.list()).toEqual(['SYSTEM.CNF']);
  });

  it('takes backslashes, any case and a doubled slash, in the entries and in a lookup', async () => {
    const source = new DirectoryAssetSource([
      { path: 'disc\\run\\ui\\readerc.zar', blob: blob(pattern(6, 3)) },
      { path: 'disc\\System.cnf', blob: blob(pattern(4, 1)) },
    ]);
    expect(await source.list()).toEqual(['RUN/UI/READERC.ZAR', 'SYSTEM.CNF']);
    for (const p of ['RUN/UI/READERC.ZAR', 'run/ui/readerc.zar', 'RUN\\UI\\READERC.ZAR', '/run//ui/ReaderC.zar']) {
      expect(await source.read(p), p).toEqual(pattern(6, 3));
      expect(await source.size(p), p).toBe(6);
    }
  });

  it('makes ISO9660\'s ENDER. and a mounted volume\'s ENDER the same path (research 306 §2)', async () => {
    const dotted = new DirectoryAssetSource([{ path: 'ENDER.', blob: blob(pattern(3, 3)) }, { path: 'RUN/X.BIN', blob: blob(pattern(1, 1)) }]);
    expect(await dotted.list()).toEqual(['ENDER', 'RUN/X.BIN']);
    const bare = driveRoot();
    expect(await bare.read('ENDER.')).toEqual(pattern(3, 3));
    expect(await bare.read('ender')).toEqual(pattern(3, 3));
  });

  it('refuses two entries that name the same path, naming both', () => {
    expect(() => new DirectoryAssetSource([
      { path: 'RUN/ENDER', blob: blob(pattern(1, 1)) },
      { path: 'run/Ender.', blob: blob(pattern(1, 2)) },
    ])).toThrow(/RUN\/ENDER.*run\/Ender\./);
  });

  it('builds an empty source from an empty pick, which lists nothing (discIdentity refuses it)', async () => {
    expect(await new DirectoryAssetSource([]).list()).toEqual([]);
  });

  it('refuses an entry whose path is empty', () => {
    expect(() => new DirectoryAssetSource([{ path: '', blob: blob(pattern(1, 1)) }])).toThrow(/"" names no file/);
  });

  it('strips a parent folder holding two discs only once, so neither disc is at the root', async () => {
    const source = new DirectoryAssetSource([
      { path: 'Discs/A/SYSTEM.CNF', blob: blob(pattern(1, 1)) },
      { path: 'Discs/B/SYSTEM.CNF', blob: blob(pattern(1, 2)) },
    ]);
    expect(await source.list()).toEqual(['A/SYSTEM.CNF', 'B/SYSTEM.CNF']);
  });

  it('throws on a missing path, naming it', async () => {
    const source = driveRoot();
    await expect(source.read('RUN/MP99.ZDB')).rejects.toThrow(/RUN\/MP99\.ZDB/);
    await expect(source.size('RUN/MP99.ZDB')).rejects.toThrow(/RUN\/MP99\.ZDB/);
    await expect(source.readRange('RUN/MP99.ZDB', 0, 1)).rejects.toThrow(/RUN\/MP99\.ZDB/);
    await expect(collect(source.stream('RUN/MP99.ZDB'))).rejects.toThrow(/RUN\/MP99\.ZDB/);
  });
});

describe('DirectoryAssetSource: reads', () => {
  it('is a ranged source (DA.R4) and streams on its own', () => {
    const source = driveRoot();
    expect(isRanged(source)).toBe(true);
    expect(typeof source.stream).toBe('function');
  });

  it('gives each file\'s size', async () => {
    const source = driveRoot();
    expect(await source.size('RUN/MP2.ZDB')).toBe(5000);
    expect(await source.size('RUN/EMPTY.TXT')).toBe(0);
    expect(await source.size('RUN/BIG.BIN')).toBe(BIG.length);
  });

  it('reads a file whole without progress', async () => {
    const source = driveRoot();
    expect(await source.read('RUN/MP2.ZDB')).toEqual(pattern(5000, 1));
    expect(await source.read('RUN/EMPTY.TXT')).toEqual(new Uint8Array(0));
  });

  it('reads with progress by ISO_READ_CHUNK, as IsoAssetSource.read reports it', async () => {
    const source = driveRoot();
    const calls: [number, number][] = [];
    expect(await source.read('RUN/BIG.BIN', (loaded, total) => calls.push([loaded, total]))).toEqual(BIG);
    expect(calls).toEqual([[ISO_READ_CHUNK, BIG.length], [ISO_READ_CHUNK * 2, BIG.length], [BIG.length, BIG.length]]);
    const empty: [number, number][] = [];
    await source.read('RUN/EMPTY.TXT', (loaded, total) => empty.push([loaded, total]));
    expect(empty).toEqual([[0, 0]]);
  });

  it('reads a range in bounds, and refuses one past the end in the ISO source\'s words', async () => {
    const source = driveRoot();
    expect(await source.readRange('RUN/MP2.ZDB', 100, 50)).toEqual(pattern(5000, 1).subarray(100, 150));
    expect(await source.readRange('RUN/MP2.ZDB', 5000, 0)).toEqual(new Uint8Array(0));
    expect(await source.readRange('RUN/MP2.ZDB', 4990, 10)).toEqual(pattern(5000, 1).subarray(4990));
    await expect(source.readRange('RUN/MP2.ZDB', 4990, 11)).rejects.toThrow('11 bytes at 4990 of RUN/MP2.ZDB run past its 5000 bytes');
    await expect(source.readRange('RUN/MP2.ZDB', -1, 2)).rejects.toThrow(/run past its 5000 bytes/);
  });

  it('streams the whole file by ISO_READ_CHUNK by default', async () => {
    const chunks = await collect(driveRoot().stream('RUN/BIG.BIN'));
    expect(chunks.map((c) => c.length)).toEqual([ISO_READ_CHUNK, ISO_READ_CHUNK, 1234]);
    expect(join2(chunks)).toEqual(BIG);
  });

  it('streams an extent by offset, length and chunk size, and through streamFile', async () => {
    const source = driveRoot();
    const chunks = await collect(source.stream('RUN/MP2.ZDB', { offset: 1000, length: 2500, chunkSize: 1024 }));
    expect(chunks.map((c) => c.length)).toEqual([1024, 1024, 452]);
    expect(join2(chunks)).toEqual(pattern(5000, 1).subarray(1000, 3500));
    expect(join2(await collect(streamFile(source, 'run/mp2.zdb', { offset: 10, length: 20 })))).toEqual(pattern(5000, 1).subarray(10, 30));
    await expect(collect(source.stream('RUN/MP2.ZDB', { offset: 4000, length: 1001 }))).rejects.toThrow(/run past its 5000 bytes/);
  });

  it('stops at an abort: before the first pull and between pulls', async () => {
    const source = driveRoot();
    const early = new AbortController();
    early.abort(new Error('gone before'));
    await expect(collect(source.stream('RUN/MP2.ZDB', { signal: early.signal }))).rejects.toThrow('gone before');

    const late = new AbortController();
    const pull = source.stream('RUN/MP2.ZDB', { chunkSize: 1000, signal: late.signal })[Symbol.asyncIterator]();
    const first = await pull.next();
    expect(first.value).toEqual(pattern(5000, 1).subarray(0, 1000));
    late.abort(new Error('gone between'));
    await expect(pull.next()).rejects.toThrow('gone between');
  });
});

/**
 * The retail disc, two ways (never in CI: no disc lives in the repository): the extracted tree `SOCOM_DISC`, each file
 * by `fs.openAsBlob` under the tree's own folder name as a picked folder's `webkitRelativePath` would carry it, and the
 * image `SOCOM_ISO`, read through an fs-backed Blob stand-in -- not `fs.openAsBlob`, whose size wraps modulo 2^32 above
 * 4 GiB on Windows (the workaround of `isoAssetSource.test.ts`'s retail test). No file in the tree is above 4 GiB (the
 * largest is VAGSTORE.ZAR, 576,593,920 bytes, research 306 §2), so `openAsBlob` is exact for each.
 *
 * The dev tree is the desktop project's, and beside the disc's 349 files it holds the desktop's own outputs: the
 * memory-card folders (`mc0*`, `mc1`), their `*.personas.json`, the dumped `socom2_game.elf` and the DNAS overlay's
 * decryption outputs (`OVERLAY/REL/DNAS.blocks.json`, `DNAS.dec.bin`). Those are no part of the disc; they are set apart
 * by name and every other path must equal the image's list.
 */
const DISC = process.env.SOCOM_DISC;
const ISO = process.env.SOCOM_ISO;
const HAVE_BOTH = !!DISC && existsSync(resolve(DISC, 'SYSTEM.CNF')) && !!ISO && existsSync(ISO);
const DESKTOP_OUTPUT = /^(MC[01][^/]*\/|MC0[^/]*\.PERSONAS\.JSON$|SOCOM2_GAME\.ELF$|OVERLAY\/REL\/DNAS\.(BLOCKS\.JSON|DEC\.BIN)$)/;

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

/** Every file under `root`, relative, forward slashes. */
const filesUnder = (root: string, rel = ''): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(join(root, rel))) {
    const path = rel ? `${rel}/${name}` : name;
    if (statSync(join(root, path)).isDirectory()) out.push(...filesUnder(root, path));
    else out.push(path);
  }
  return out;
};

if (!HAVE_BOTH) {
  console.warn('directoryAssetSource.test: the dev-disc tests are SKIPPED -- they need SOCOM_DISC (the extracted tree) and SOCOM_ISO (the image)');
}

describe.skipIf(!HAVE_BOTH)('DirectoryAssetSource over the retail disc tree against the image (SOCOM_DISC, SOCOM_ISO)', () => {
  const picked = async (): Promise<DirectoryAssetSource> => {
    const root = resolve(DISC!);
    const top = basename(root);
    return new DirectoryAssetSource(await Promise.all(filesUnder(root).map(async (rel) => ({
      path: `${top}/${rel}`, blob: await openAsBlob(join(root, rel)),
    }))));
  };

  it('lists what the image lists, and the disc\'s top-level directories are DISC_ROOT_DIRECTORIES', async () => {
    const image = fsBlob(ISO!);
    try {
      const dir = await picked();
      const want = await new IsoAssetSource(image).list();
      expect(want.length).toBe(349);
      const all = await dir.list();
      expect(all.filter((p) => !DESKTOP_OUTPUT.test(p))).toEqual(want);
      expect(want.filter((p) => DESKTOP_OUTPUT.test(p))).toEqual([]);
      const dirs = [...new Set(want.filter((p) => p.includes('/')).map((p) => p.slice(0, p.indexOf('/'))))].sort();
      expect(dirs).toEqual([...DISC_ROOT_DIRECTORIES].sort());
    } finally {
      image.close();
    }
  }, 120_000);

  it('answers the same bytes as the image: READERC.ZAR and a map whole, VAGSTORE and a movie by range', async () => {
    const image = fsBlob(ISO!);
    try {
      const dir = await picked();
      const iso = new IsoAssetSource(image);
      const map = (await iso.list()).find((p) => /^RUN\/MP\d+\.ZDB$/.test(p));
      expect(map).toBeDefined();
      for (const path of ['RUN/UI/READERC.ZAR', map!]) {
        const want = await iso.read(path);
        expect(await dir.size(path), path).toBe(want.length);
        expect(Buffer.from(await dir.read(path)).equals(Buffer.from(want)), path).toBe(true);
      }
      for (const [path, offset] of [['RUN/SOUNDS/VAGSTORE.ZAR', 1_000_000], ['RUN/MOVIES/COMMON/MENULOOP.PSS', 10_000_000]] as const) {
        const want = await iso.readRange(path, offset, 65_536);
        expect(Buffer.from(await dir.readRange(path, offset, 65_536)).equals(Buffer.from(want)), path).toBe(true);
        const streamed = join2(await collect(dir.stream(path, { offset, length: 65_536, chunkSize: 4096 })));
        expect(Buffer.from(streamed).equals(Buffer.from(want)), `${path} streamed`).toBe(true);
      }
    } finally {
      image.close();
    }
  }, 120_000);
});
