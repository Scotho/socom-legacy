import { describe, expect, expectTypeOf, it } from 'vitest';
import { existsSync, openAsBlob, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DirectoryAssetSource, HttpAssetSource, IsoAssetSource, SOCOM2_US_BOOT } from '@s2u/archive';
import { buildIso } from '../../archive/test/isoImage';
import { listDiscMaps } from '../src/discIndex';
import { dirRequest, discName, isDiscRequest, openDisc, requestLabel, sourceCache, sourceKey, type DiscEntry } from '../src/discSource';
import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { streamFile } from '@s2u/archive';
import { extractDisc, type ExtractEnv } from '../src/discExtract';
import { ExtractedMissError } from '../src/discExtractSource';
import { openPageRecords, type RecordStore } from '../src/pageStore';
import { FakeOpfs, FakeStorage, READ_PATHS, discMembers, fakeWorker, systemCnf as systemCnfOf } from './discExtractFakes';
import { openedDiscImage, openFrontEndDisc, openFrontEndImage } from '../src/discPrompt';
import type { SourceRequest } from '../src/worker';

/**
 * DA-3 (plan `docs/plans/2026-10-11-disc-access.md`, "DA-3's contract"): one disc-source module shared by the map worker
 * and the movie worker, a picked folder (`{ kind: 'dir' }`, DA-1's `DirectoryAssetSource`) beside the image
 * (`{ kind: 'iso' }`, `IsoAssetSource` exactly as before), cached per thread, validated once on the page (DA.R8). A
 * browser adaptation (DA.R2): nothing of the game changes; the bar is that a folder answers what the image answers.
 */

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
/** The committed fixtures (`test-fixtures/MANIFEST.json`, the disc's own files): FROSTFIRE's archive and the front end's first dialogs. */
const FIXTURE_FILES = ['RUN/MP2.ZDB', 'RUN/UI/READERC.ZAR'] as const;
const HAVE_FIXTURES = FIXTURE_FILES.every((p) => existsSync(resolve(FIXTURES, p)));
if (!HAVE_FIXTURES) console.warn('discSource.test: the fixture cases are SKIPPED -- test-fixtures/RUN/MP2.ZDB or RUN/UI/READERC.ZAR is missing');

const text = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
/** A `SYSTEM.CNF` booting `boot`, in the retail line's form (`docs/roadmap/02-boot.md` B1). */
const systemCnf = (boot: string): Uint8Array<ArrayBuffer> => text(`BOOT2 = cdrom0:\\${boot};1\r\nVER = 1.00\r\nVMODE = NTSC\r\n`);
const file = (bytes: Uint8Array<ArrayBuffer>, name: string, lastModified = 1_000): File => new File([bytes], name, { lastModified });

/** The fixture folder as a picked folder's entries (the folder's own name first, as `webkitRelativePath` carries it). */
const fixtureMembers = (): { path: string; bytes: Uint8Array<ArrayBuffer> }[] => [
  { path: 'SYSTEM.CNF', bytes: systemCnf(SOCOM2_US_BOOT) },
  ...FIXTURE_FILES.map((path) => ({ path, bytes: new Uint8Array(readFileSync(resolve(FIXTURES, path))) })),
];
type DirRequest = Extract<SourceRequest, { kind: 'dir' }>;
const dirOf = (members: { path: string; bytes: Uint8Array<ArrayBuffer> }[], top = 'SOCOM2'): DirRequest =>
  ({ kind: 'dir', entries: members.map((m) => ({ path: `${top}/${m.path}`, file: file(m.bytes, basename(m.path)) })) });
const isoOf = (members: { path: string; bytes: Uint8Array<ArrayBuffer> }[], name = 'SOCOM II.iso'): Extract<SourceRequest, { kind: 'iso' }> =>
  ({ kind: 'iso', file: file(buildIso(members, 'SCUS_97275'), name) });

describe('SourceRequest: additive (every present importer of `./worker` compiles unchanged)', () => {
  it('the iso and http kinds are still SourceRequests imported from ./worker, and dir is one', () => {
    const iso = { kind: 'iso' as const, file: new File([], 'a.iso') };
    const http = { kind: 'http' as const, baseUrl: '/maps/' };
    const dir = { kind: 'dir' as const, entries: [{ path: 'D/SYSTEM.CNF', file: new File([], 'SYSTEM.CNF') }] as readonly DiscEntry[] };
    expectTypeOf(iso).toMatchTypeOf<SourceRequest>();
    expectTypeOf(http).toMatchTypeOf<SourceRequest>();
    expectTypeOf(dir).toMatchTypeOf<SourceRequest>();
    expect([iso, http, dir].map((r) => r.kind)).toEqual(['iso', 'http', 'dir']);
  });

  it('dirRequest reads each picked file\'s path once, at the pick (a posted File may not keep webkitRelativePath)', () => {
    const a = new File([], 'SYSTEM.CNF');
    Object.defineProperty(a, 'webkitRelativePath', { value: 'Disc/SYSTEM.CNF' });
    const b = new File([], 'LOOSE.TXT');                    // no relative path (a dropped file): its name
    expect(dirRequest([a, b])).toEqual({ kind: 'dir', entries: [{ path: 'Disc/SYSTEM.CNF', file: a }, { path: 'LOOSE.TXT', file: b }] });
  });

  it('isDiscRequest: an image and a folder are the disc; the served tree is not (DA-4, main.ts\'s three tests)', () => {
    expect((['iso', 'dir', 'http'] as const).map((k) => isDiscRequest(k))).toEqual([true, true, false]);
  });

  it('a disc is named by its image file, or by the picked folder', () => {
    expect(discName({ kind: 'iso', file: new File([], 'SOCOM II.iso') })).toBe('SOCOM II.iso');
    expect(discName(dirOf([{ path: 'SYSTEM.CNF', bytes: text('') }], 'E:'))).toBe('E:');
    expect(discName({ kind: 'dir', entries: [{ path: 'SYSTEM.CNF', file: new File([], 'SYSTEM.CNF') }] })).toBe('the picked folder');
  });
});

describe('sourceKey and sourceCache: one source per disc, per thread', () => {
  it('iso, dir and http never share a key', () => {
    const f = new File([text('x')], 'X');
    const keys = [
      sourceKey({ kind: 'iso', file: f }),
      sourceKey({ kind: 'dir', entries: [{ path: 'X', file: f }] }),
      sourceKey({ kind: 'http', baseUrl: 'X' }),
    ];
    expect(new Set(keys).size).toBe(3);
  });

  it('returns the same source for the same File posted twice (a fresh clone each time), and replaces it for another', () => {
    const forRequest = sourceCache();
    const bytes = buildIso([{ path: 'SYSTEM.CNF', bytes: systemCnf(SOCOM2_US_BOOT) }]);
    const first = forRequest({ kind: 'iso', file: file(bytes, 'a.iso', 5) });
    expect(first).toBeInstanceOf(IsoAssetSource);
    expect(forRequest({ kind: 'iso', file: file(bytes, 'a.iso', 5) })).toBe(first);
    const other = forRequest({ kind: 'iso', file: file(bytes, 'a.iso', 6) });
    expect(other).not.toBe(first);
    expect(forRequest({ kind: 'iso', file: file(bytes, 'a.iso', 6) })).toBe(other);
  });

  it('a folder posted twice is one source, a changed folder another, and a disc of either kind replaces the last', () => {
    const forRequest = sourceCache();
    const members = [{ path: 'SYSTEM.CNF', bytes: systemCnf(SOCOM2_US_BOOT) }, { path: 'RUN/A.BIN', bytes: text('abc') }];
    const first = forRequest(dirOf(members));
    expect(first).toBeInstanceOf(DirectoryAssetSource);
    expect(forRequest(dirOf(members))).toBe(first);
    expect(forRequest(dirOf([...members, { path: 'RUN/B.BIN', bytes: text('d') }]))).not.toBe(first);
    const iso = forRequest(isoOf(members));
    expect(forRequest(dirOf(members))).not.toBe(first);      // one disc slot: the image replaced the folder
    expect(iso).toBeInstanceOf(IsoAssetSource);
  });

  it('the served tree is one source per base URL, beside the disc', () => {
    const forRequest = sourceCache();
    const a = forRequest({ kind: 'http', baseUrl: '/maps/' });
    expect(a).toBeInstanceOf(HttpAssetSource);
    expect(forRequest({ kind: 'http', baseUrl: '/maps/' })).toBe(a);
    expect(forRequest({ kind: 'http', baseUrl: '/other/' })).not.toBe(a);
  });

  it('each thread has its own cache', () => {
    const f = file(buildIso([{ path: 'SYSTEM.CNF', bytes: systemCnf(SOCOM2_US_BOOT) }]), 'a.iso');
    expect(sourceCache()({ kind: 'iso', file: f })).not.toBe(sourceCache()({ kind: 'iso', file: f }));
  });
});

describe.skipIf(!HAVE_FIXTURES)('a dir request reads the disc as an iso request does (the fixture folder)', () => {
  it('loads the map index the worker sends -- the same maps, the same problems, the same files', async () => {
    const members = fixtureMembers();
    const forRequest = sourceCache();
    const fromDir = forRequest(dirOf(members));
    const fromIso = sourceCache()(isoOf(members));
    const dirIndex = await listDiscMaps(fromDir);
    const isoIndex = await listDiscMaps(fromIso);
    expect(dirIndex).toEqual(isoIndex);
    expect(dirIndex.maps).toEqual([{ archive: 'MP2', path: 'RUN/MP2.ZDB', name: 'FROSTFIRE' }]);
    expect(dirIndex.problems).toEqual([]);
    expect(await fromDir.list()).toEqual(await fromIso.list());
    expect((await fromDir.list()).length).toBe(3);
    for (const path of FIXTURE_FILES) {
      expect(Buffer.from(await fromDir.read(path)).equals(Buffer.from(await fromIso.read(path))), path).toBe(true);
    }
  });
});

describe('openDisc: validated once, on the page, before any request reaches a worker (DA.R8)', () => {
  const good = [{ path: 'SYSTEM.CNF', bytes: systemCnf(SOCOM2_US_BOOT) }, { path: 'RUN/UI/READERC.ZAR', bytes: text('four') }];

  it('a folder whose SYSTEM.CNF boots another game is refused in discIdentity\'s words, before the probe', async () => {
    const wrong = dirOf([{ path: 'SYSTEM.CNF', bytes: systemCnf('SLUS_123.45') }, { path: 'RUN/UI/READERC.ZAR', bytes: text('four') }]);
    await expect(openDisc(wrong, 'RUN/UI/READERC.ZAR')).rejects.toThrow(/this disc boots SLUS_123\.45; this game needs a SOCOM U\.S\. Navy SEALs II disc/);
    await expect(openDisc(dirOf([{ path: 'RUN/UI/READERC.ZAR', bytes: text('four') }]), 'RUN/UI/READERC.ZAR')).rejects.toThrow(/no SYSTEM\.CNF here/);
  });

  it('a folder of the US disc without the probed file is refused by the folder reader', async () => {
    await expect(openDisc(dirOf([good[0]!]), 'RUN/UI/READERC.ZAR')).rejects.toThrow(/disc folder: no RUN\/UI\/READERC\.ZAR/);
  });

  it('a good folder resolves with its source and identity; an image keeps today\'s check, its identity not read', async () => {
    const d = await openDisc(dirOf(good), 'RUN/UI/READERC.ZAR');
    expect(d.source).toBeInstanceOf(DirectoryAssetSource);
    expect(d.identity).toEqual({ boot: SOCOM2_US_BOOT, ver: '1.00', vmode: 'NTSC' });
    const i = await openDisc(isoOf(good), 'RUN/UI/READERC.ZAR');
    expect(i.source).toBeInstanceOf(IsoAssetSource);
    expect(i.identity).toBeNull();
    await expect(openDisc({ kind: 'iso', file: new File([new Uint8Array(40 * 2048)], 'x.iso') }, 'RUN/UI/READERC.ZAR')).rejects.toThrow(/not an ISO9660 image/);
  });

  it('a folder of another release of SOCOM II (the European SCES_519.04) resolves the same (DA.R8 as amended)', async () => {
    const pal = [{ path: 'SYSTEM.CNF', bytes: systemCnf('SCES_519.04') }, good[1]!];
    expect((await openDisc(dirOf(pal), 'RUN/UI/READERC.ZAR')).identity).toEqual({ boot: 'SCES_519.04', ver: '1.00', vmode: 'NTSC' });
  });
});

describe('openFrontEndDisc: the front end opens either kind; openFrontEndImage is its iso case', () => {
  const good = [{ path: 'SYSTEM.CNF', bytes: systemCnf(SOCOM2_US_BOOT) }, { path: 'RUN/UI/READERC.ZAR', bytes: text('four') }];

  it('a folder opens, and the replay viewer\'s handed image is none (MU-11 hands an image only)', async () => {
    await openFrontEndImage(file(buildIso(good), 'a.iso'));
    expect(openedDiscImage()?.name).toBe('a.iso');
    const source = await openFrontEndDisc(dirOf(good));
    expect(source).toBeInstanceOf(DirectoryAssetSource);
    expect(openedDiscImage()).toBeNull();
  });

  it('a folder of another game is refused in discIdentity\'s words; an image without the dialogs as before', async () => {
    const wrong = dirOf([{ path: 'SYSTEM.CNF', bytes: systemCnf('SLES_999.99') }, { path: 'RUN/UI/READERC.ZAR', bytes: text('four') }]);
    await expect(openFrontEndDisc(wrong)).rejects.toThrow(/this disc boots SLES_999\.99/);
    await expect(openFrontEndDisc({ kind: 'iso', file: new Blob([buildIso([good[0]!])]) })).rejects.toThrow(/ISO: no RUN\/UI\/READERC\.ZAR/);
  });
});

describe('the two workers share the module (no second copy of the ISO path)', () => {
  const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf-8');
  it('worker.ts and movieWorker.ts take their sources from ./discSource\'s sourceCache', () => {
    for (const f of ['worker.ts', 'movieWorker.ts']) {
      expect(src(f), f).toMatch(/import \{[^}]*\bsourceCache\b[^}]*\} from '\.\/discSource'/);
      expect(src(f), f).toMatch(/const sourceFor = sourceCache\(\);/);
      expect(src(f), f).not.toMatch(/new IsoAssetSource\(/);
    }
    expect(src('worker.ts')).toMatch(/export type \{ DiscEntry, SourceRequest \} from '\.\/discSource';/);
  });
});

/**
 * The retail disc's extracted tree (`SOCOM_DISC`; never in CI, no disc lives in the repository), picked as a folder:
 * every file by `fs.openAsBlob`, under the tree's own folder name as `webkitRelativePath` would carry it.
 */
const DISC = process.env.SOCOM_DISC;
const HAVE_DISC = !!DISC && existsSync(join(DISC, 'SYSTEM.CNF'));
if (!HAVE_DISC) console.warn('discSource.test: the dev-disc case is SKIPPED -- it needs SOCOM_DISC (the extracted tree)');
const filesUnder = (root: string, at = ''): string[] =>
  readdirSync(join(root, at), { withFileTypes: true }).flatMap((d) => {
    const rel = at ? `${at}/${d.name}` : d.name;
    return d.isDirectory() ? filesUnder(root, rel) : [rel];
  });

describe.skipIf(!HAVE_DISC)('a dir request over the retail tree (SOCOM_DISC)', () => {
  it('is the US disc, and the worker\'s cache opens the first map\'s index from it', async () => {
    const root = resolve(DISC!);
    const top = basename(root);
    const entries: DiscEntry[] = await Promise.all(filesUnder(root).map(async (rel) => {
      const path = join(root, rel);
      return { path: `${top}/${rel}`, file: new File([await openAsBlob(path)], basename(rel), { lastModified: statSync(path).mtimeMs }) };
    }));
    const request: SourceRequest = { kind: 'dir', entries };
    const opened = await openDisc(request, 'RUN/UI/READERC.ZAR');
    expect(opened.identity?.boot).toBe(SOCOM2_US_BOOT);
    const { maps } = await listDiscMaps(sourceCache()(request));
    expect(maps.length).toBeGreaterThan(0);
    expect(maps[0]!.path).toMatch(/^RUN\/MP\d+\.ZDB$/);
    expect(maps[0]!.name.length).toBeGreaterThan(0);
  }, 120_000);
});

/**
 * DX-3 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6): `{ kind: 'stored' }`, the disc's read set
 * kept in this browser, in both workers' source function (`sourceCache`, which `worker.ts` and `movieWorker.ts` each make,
 * above): opened from the identity alone -- OPFS through the fake origin storage, IndexedDB through fake-indexeddb, each
 * read in the thread -- keyed by the identity, so another extraction replaces the thread's source.
 */
describe('SourceRequest stored: the kept extraction, in both workers\' source function', () => {
  const ID = { boot: SOCOM2_US_BOOT, ver: '1.02', vmode: 'NTSC' };
  const OTHER = { ...ID, ver: '1.03' };
  const env = (): { e: ExtractEnv; records: RecordStore } => {
    const fs = new FakeOpfs();
    const idb = new FakeFactory() as unknown as IDBFactory;
    const records = openPageRecords(() => idb, () => undefined);
    const log = { count: 0, terminated: 0, files: 0 };
    return { e: { storage: new FakeStorage(fs), idb: () => idb, records, worker: () => fakeWorker(log, fs), chunk: 1024, now: () => 5 }, records };
  };
  const image = (): DiscRequestOf => ({ kind: 'iso', file: new File([buildIso(discMembers(), 'SCUS_97275')], 'SOCOM II.iso', { lastModified: 5 }) });
  type DiscRequestOf = Extract<SourceRequest, { kind: 'iso' }>;

  it('is a SourceRequest and not a DiscRequest; isDiscRequest counts it as the visitor\'s disc', () => {
    expectTypeOf<{ kind: 'stored'; identity: typeof ID }>().toMatchTypeOf<SourceRequest>();
    expect(isDiscRequest('stored')).toBe(true);
    expect(requestLabel({ kind: 'stored', identity: ID })).toBe('the disc kept in this browser');
    expect(requestLabel({ kind: 'http', baseUrl: '/maps' })).toBe('the served tree');
  });

  it('sourceKey: by the identity, its fallback and its disc; never another kind\'s', () => {
    const a = sourceKey({ kind: 'stored', identity: ID });
    expect(sourceKey({ kind: 'stored', identity: { ...ID } })).toBe(a);
    expect(sourceKey({ kind: 'stored', identity: OTHER })).not.toBe(a);
    expect(sourceKey({ kind: 'stored', identity: ID, fallback: 'outside' })).not.toBe(a);
    const disc = image();
    expect(sourceKey({ kind: 'stored', identity: ID, disc })).not.toBe(a);
    expect(sourceKey({ kind: 'stored', identity: ID, disc })).toBe(sourceKey({ kind: 'stored', identity: ID, disc: { kind: 'iso', file: disc.file } }));
    for (const k of [sourceKey(disc), sourceKey({ kind: 'http', baseUrl: '/maps' })]) expect(k).not.toBe(a);
  });

  for (const backend of ['opfs', 'indexeddb'] as const) {
    it(`${backend}: the thread opens the extraction from the identity and reads the disc's bytes back, by range and streamed`, async () => {
      const { e } = env();
      const disc = image();
      await extractDisc(disc, {}, { ...e, backend });
      const sourceFor = sourceCache(e);
      const s = sourceFor({ kind: 'stored', identity: ID });
      expect(s).toBe(sourceFor({ kind: 'stored', identity: { ...ID } }));            // posted twice: one source
      const iso = new IsoAssetSource(disc.file);
      for (const p of ['SYSTEM.CNF', 'RUN/UI/READERC.ZAR', 'RUN/MP2.ZDB', 'RUN/MOVIES/COMMON/SONY448.PSS']) {
        expect(await s.read(p), p).toEqual(await iso.read(p));
      }
      expect([...(await s.list())].sort()).toEqual([...READ_PATHS].sort());
      const ranged = s as unknown as { readRange(p: string, o: number, n: number): Promise<Uint8Array>; size(p: string): Promise<number> };
      expect(await ranged.size('RUN/MP2.ZDB')).toBe(await iso.size('RUN/MP2.ZDB'));
      expect(await ranged.readRange('RUN/MP2.ZDB', 7, 40)).toEqual(await iso.readRange('RUN/MP2.ZDB', 7, 40));
      const chunks: Uint8Array[] = [];
      for await (const c of streamFile(s, 'RUN/MOVIES/COMMON/SONY448.PSS', { chunkSize: 1000 })) chunks.push(c);
      expect(chunks.length).toBe(5);
      expect(Buffer.concat(chunks)).toEqual(Buffer.from(await iso.read('RUN/MOVIES/COMMON/SONY448.PSS')));
    });
  }

  it('another identity replaces the thread\'s source; its read refuses the kept disc that is not it, in words', async () => {
    const { e } = env();
    await extractDisc(image(), {}, e);
    const sourceFor = sourceCache(e);
    const kept = sourceFor({ kind: 'stored', identity: ID });
    const other = sourceFor({ kind: 'stored', identity: OTHER });
    expect(other).not.toBe(kept);
    await expect(other.read('SYSTEM.CNF')).rejects.toThrow(/is not the one this start was made from/);
    expect(sourceFor({ kind: 'stored', identity: ID })).not.toBe(kept);           // the last asked is kept, as for a disc
  });

  it('no extraction kept (cleared, deleted in another tab): a read says so, and is tried again at the next read', async () => {
    const { e } = env();
    const s = sourceCache(e)({ kind: 'stored', identity: ID });
    await expect(s.read('SYSTEM.CNF')).rejects.toThrow(/the disc kept in this browser is gone/);
    await extractDisc(image(), {}, e);
    expect(await s.read('SYSTEM.CNF')).toEqual(systemCnfOf());
  });

  it('a path outside the read set, with no disc: ExtractedMissError in its words, never a wrong byte', async () => {
    const { e } = env();
    await extractDisc(image(), {}, e);
    const s = sourceCache(e)({ kind: 'stored', identity: ID });
    await expect(s.read('RUN/UI/BF51_TXR.ZED')).rejects.toBeInstanceOf(ExtractedMissError);
    await expect(s.read('RUN/UI/BF51_TXR.ZED')).rejects.toThrow(/RUN\/UI\/BF51_TXR\.ZED is not among the disc's files kept in this browser/);
  });
});
