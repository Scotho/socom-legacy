import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_ARCHIVES, COMMON_ARCHIVES, type MapInfo } from '@s2u/archive';
import { buildIso } from '../../packages/archive/test/isoImage';
import { extractMaps, REPO_ROOT, type ExtractProgress } from '../extractMaps';
import { copyFresh, type Fresh } from '../freshFiles';

/**
 * PK-1 (the parity pack, design section 8): the image-to-maps path as one callable, `extractMaps`, that
 * `tools/extract-maps.ts` and `tools/materialize-iso.ts` both call and the pack's GUI calls with progress. A product-track
 * tool refactor: no game data -- synthetic disc trees and a synthetic ISO under `node:os` temp dirs, a few bytes a file,
 * the disc's names. The map names the index takes from each archive's `mission.rdr` are injected (`fs.names`), except in
 * the case that proves an archive that will not name itself still stops the extract.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 's2u-extract-'));
  dirs.push(dir);
  return dir;
};
const MP2: MapInfo = { archive: 'MP2', path: 'RUN/MP2.ZDB', name: 'Test Map' };
const names = async (): Promise<MapInfo[]> => [MP2];
/** A disc tree: two multiplayer maps, the campaign's first archive, every common archive, one front-end file. */
const discTree = (without: string[] = []): string => {
  const disc = temp();
  const files = ['RUN/MP2.ZDB', 'RUN/MP6.ZDB', 'RUN/MP72.ZDB', 'RUN/M51.ZDB', ...COMMON_ARCHIVES, 'RUN/RAW/LOADING.RAW'];
  files.forEach((path, i) => {
    if (without.includes(path)) return;
    mkdirSync(dirname(join(disc, path)), { recursive: true });
    writeFileSync(join(disc, path), new Uint8Array([i + 1, i + 2]));
  });
  return disc;
};
const files = (root: string): string[] => (existsSync(root)
  ? (readdirSync(root, { recursive: true, withFileTypes: true }) as { isFile(): boolean; name: string; parentPath: string }[])
    .filter((e) => e.isFile()).map((e) => relative(root, join(e.parentPath, e.name)).replace(/\\/g, '/')).sort()
  : []);

describe('extractMaps: the disc tree to the served maps tree (PK-1)', () => {
  it('copies the plan into maps with the campaign in by default, and writes the index', async () => {
    const disc = discTree();
    const maps = join(temp(), 'maps');
    const result = await extractMaps({ disc, maps, fs: { names } });
    const out = files(maps);
    expect(out).toContain('RUN/MP2.ZDB');
    expect(out).toContain('RUN/MP6.ZDB');
    expect(out).toContain('RUN/M51.ZDB');
    for (const path of COMMON_ARCHIVES) expect(out).toContain(path);
    expect(out).toContain('RUN/RAW/LOADING.RAW');
    expect(out).toContain('index.json');
    const index = JSON.parse(readFileSync(join(maps, 'index.json'), 'utf-8')) as { maps: MapInfo[]; common: string[] };
    expect(index.maps).toEqual([MP2]);
    expect(index.common).toEqual([...COMMON_ARCHIVES]);
    expect(result.maps).toEqual([MP2]);
    expect(result.archives).toEqual({ maps: 3, campaign: 1 });
    expect(result.written).toBe(out.length);
    expect(result.kept).toBe(0);
    // The campaign's other eleven are not on this tree: reported, never invented.
    expect(result.missing).toEqual(expect.arrayContaining(CAMPAIGN_ARCHIVES.filter((p) => p !== 'RUN/M51.ZDB')));
    expect(result.missing).not.toContain('RUN/M51.ZDB');
    // A second run keeps every file (freshFiles: the hard links shared between worktrees are never rewritten).
    const again = await extractMaps({ disc, maps, fs: { names } });
    expect(again.written).toBe(0);
    expect(again.kept).toBe(out.length);
  });

  it('leaves the campaign out with campaign: false', async () => {
    const disc = discTree();
    const maps = join(temp(), 'maps');
    const result = await extractMaps({ disc, maps, campaign: false, fs: { names } });
    expect(files(maps)).not.toContain('RUN/M51.ZDB');
    expect(files(maps)).toContain('RUN/MP2.ZDB');
    expect(result.archives).toEqual({ maps: 3, campaign: 0 });
    expect(result.missing.filter((p) => CAMPAIGN_ARCHIVES.includes(p))).toEqual([]);
  });

  it('touches no fixture path with fixtures: null, and refreshes the four maps and the common archives with a root', async () => {
    const disc = discTree();
    writeFileSync(join(disc, 'RUN', 'MP71.ZDB'), new Uint8Array([71]));   // the fourth fixture map (DF.R5)
    const maps = join(temp(), 'maps');
    const fixtures = join(temp(), 'test-fixtures');
    const seen: string[] = [];
    const copy = (from: string, to: string): Fresh => { seen.push(to); return copyFresh(from, to); };
    await extractMaps({ disc, maps, fixtures: null, fs: { names, copy } });
    expect(seen.length).toBeGreaterThan(0);
    for (const to of seen) expect(relative(maps, to).startsWith('..'), to).toBe(false);
    expect(existsSync(fixtures)).toBe(false);
    seen.length = 0;
    await extractMaps({ disc, maps, fixtures, fs: { names, copy } });
    const inFixtures = seen.filter((to) => !relative(fixtures, to).startsWith('..'))
      .map((to) => relative(fixtures, to).replace(/\\/g, '/'));
    expect(inFixtures).toEqual(['RUN/MP2.ZDB', 'RUN/MP6.ZDB', 'RUN/MP71.ZDB', 'RUN/MP72.ZDB', ...COMMON_ARCHIVES]);
  });

  it('refuses a disc tree that lacks a common archive before it writes anything', async () => {
    const disc = discTree([COMMON_ARCHIVES[0]!]);
    const maps = join(temp(), 'maps');
    await expect(extractMaps({ disc, maps, fs: { names } })).rejects.toThrow(`has no ${COMMON_ARCHIVES[0]}`);
    expect(existsSync(maps)).toBe(false);
  });

  it('stops on an archive that will not name itself (PL-11), and writes no index', async () => {
    const disc = discTree();
    const maps = join(temp(), 'maps');
    await expect(extractMaps({ disc, maps, campaign: false })).rejects.toThrow(/^RUN\/MP2\.ZDB: /);
    expect(existsSync(join(maps, 'index.json'))).toBe(false);
  });

  it('refuses a disc path with no RUN tree', async () => {
    await expect(extractMaps({ disc: temp(), maps: join(temp(), 'maps'), fs: { names } })).rejects.toThrow(/no disc tree at/);
  });
});

describe('extractMaps from an image (PK-1: materialize, then copy, then index)', () => {
  const image = (members: { path: string; bytes: Uint8Array }[]): string => {
    const iso = join(temp(), 'disc.iso');
    writeFileSync(iso, buildIso(members));
    return iso;
  };
  const whole = (): { path: string; bytes: Uint8Array }[] => [
    { path: 'RUN/MP2.ZDB', bytes: new Uint8Array([9, 8, 7]) },
    ...COMMON_ARCHIVES.map((path, i) => ({ path, bytes: new Uint8Array([i + 1]) })),
  ];

  it('lays the image out into disc, then the maps tree, with progress in phase order and done reaching total', async () => {
    const iso = image(whole());
    const root = temp();
    const disc = join(root, 'disc');
    const maps = join(root, 'maps');
    const progress: ExtractProgress[] = [];
    const lines: string[] = [];
    const result = await extractMaps({ iso, disc, maps, onProgress: (p) => progress.push({ ...p }), log: (l) => lines.push(l), fs: { names } });
    expect(readFileSync(join(disc, 'RUN/MP2.ZDB'))).toEqual(Buffer.from([9, 8, 7]));
    expect(readFileSync(join(maps, 'RUN/MP2.ZDB'))).toEqual(Buffer.from([9, 8, 7]));
    expect(result.materialized).toEqual({ written: 1 + COMMON_ARCHIVES.length, kept: 0 });
    expect(lines).toContain(`materialize-iso: ${1 + COMMON_ARCHIVES.length} written, 0 kept, under ${disc}`);
    // The phases come in order, each counts up by one to its total, and each ends at its total.
    const order = progress.map((p) => p.phase).filter((p, i, a) => a.indexOf(p) === i);
    expect(order).toEqual(['materialize', 'copy', 'index']);
    for (const phase of order) {
      const of = progress.filter((p) => p.phase === phase);
      expect(of[0]!.done, phase).toBe(0);
      expect(of.map((p) => p.done), phase).toEqual(of.map((_, i) => i));
      expect(of.at(-1)!.done, phase).toBe(of.at(-1)!.total);
      expect(new Set(of.map((p) => p.total)).size, phase).toBe(1);
    }
    expect(progress.filter((p) => p.phase === 'materialize').at(-1)!.total).toBe(1 + COMMON_ARCHIVES.length);
    expect(progress.find((p) => p.phase === 'copy' && p.done === 1)!.file).toBe('RUN/MP2.ZDB');
  });

  // The coordinator's addition to PK-1 (the design's builder check): the pack lays the image's files straight into its
  // maps folder and serves them from there, so the tester's drive holds them once. `disc` and `maps` the same
  // directory: nothing is copied onto itself, those files count as kept, and the index is written in place.
  it('takes disc === maps: no copy, every planned file kept, the copy phase done at once, the index written in place', async () => {
    const iso = image(whole());
    const root = temp();
    const tree = join(root, 'maps');
    const laid = await extractMaps({ iso, disc: tree, maps: join(root, 'elsewhere'), fs: { names } });
    expect(laid.materialized!.written).toBe(1 + COMMON_ARCHIVES.length);
    const progress: ExtractProgress[] = [];
    const copied: string[] = [];
    const copy = (from: string, to: string): Fresh => { copied.push(to); return copyFresh(from, to); };
    // The same directory, named another way (a trailing separator; on win32 another case).
    const same = process.platform === 'win32' ? `${tree.toUpperCase()}\\` : `${tree}/`;
    const result = await extractMaps({ iso, disc: tree, maps: same, onProgress: (p) => progress.push({ ...p }), fs: { names, copy } });
    expect(copied).toEqual([]);
    expect(result.materialized).toEqual({ written: 0, kept: 1 + COMMON_ARCHIVES.length });
    expect(result.kept).toBe(1 + COMMON_ARCHIVES.length);   // the planned files in place; the index is new
    expect(result.written).toBe(1);
    const copyPhase = progress.filter((p) => p.phase === 'copy');
    expect(copyPhase).toHaveLength(1);
    expect(copyPhase[0]!.done).toBe(copyPhase[0]!.total);
    expect(copyPhase[0]!.total).toBe(1 + COMMON_ARCHIVES.length);
    expect(progress.map((p) => p.phase).filter((p, i, a) => a.indexOf(p) === i)).toEqual(['materialize', 'copy', 'index']);
    expect(JSON.parse(readFileSync(join(tree, 'index.json'), 'utf-8')).maps).toEqual([MP2]);
    expect(readFileSync(join(tree, 'RUN/MP2.ZDB'))).toEqual(Buffer.from([9, 8, 7]));
  });

  // The pack lays the streams out too (`streams: true`): each large file is its own progress step.
  it('reports each of the streams\' large files as its own materialize step with streams: true', async () => {
    const big = ['RUN/MOVIES/COMMON/MENULOOP.PSS', 'RUN/SOUNDS/VAGSTORE.ZAR'];
    const iso = image([...whole(), ...big.map((path) => ({ path, bytes: new Uint8Array(3 * 2048 + 5).fill(7) }))]);
    const root = temp();
    const progress: ExtractProgress[] = [];
    await extractMaps({ iso, disc: join(root, 'disc'), maps: join(root, 'maps'), streams: true, onProgress: (p) => progress.push({ ...p }), fs: { names } });
    const laid = progress.filter((p) => p.phase === 'materialize');
    for (const path of big) expect(laid.map((p) => p.file)).toContain(path);
    expect(laid.at(-1)!.total).toBe(1 + COMMON_ARCHIVES.length + big.length);
    expect(laid.at(-1)!.done).toBe(laid.at(-1)!.total);
    expect(readFileSync(join(root, 'maps', big[0]!)).length).toBe(3 * 2048 + 5);
  });

  it('refuses an image that lacks a common archive before any write, in materialize-iso\'s words', async () => {
    const iso = image([{ path: 'RUN/MP2.ZDB', bytes: new Uint8Array([1, 2, 3]) }]);
    const root = temp();
    const disc = join(root, 'disc');
    const maps = join(root, 'maps');
    await expect(extractMaps({ iso, disc, maps, fs: { names } })).rejects.toThrow(`materialize-iso: the image has no ${COMMON_ARCHIVES[0]}`);
    expect(existsSync(disc)).toBe(false);
    expect(existsSync(maps)).toBe(false);
  });

  it('keeps discDirRefusal: an image laid out inside the clone outside socomlegacy/.disc is refused before it is opened', async () => {
    const disc = join(REPO_ROOT, 'socomlegacy', 'test-fixtures');
    const maps = join(temp(), 'maps');
    await expect(extractMaps({ iso: join(temp(), 'absent.iso'), disc, maps, fs: { names } }))
      .rejects.toThrow(`materialize-iso: --disc ${disc} is inside the clone; there the layout goes only under socomlegacy/.disc`);
    expect(existsSync(maps)).toBe(false);
  });

  it('guards another clone root when told one (the pack: cloneRoot null, no clone to guard)', async () => {
    const root = temp();
    const disc = join(root, 'pack', 'disc');
    const iso = image(whole());
    await expect(extractMaps({ iso, disc, maps: join(root, 'pack', 'maps'), cloneRoot: root, fs: { names } }))
      .rejects.toThrow(/is inside the clone/);
    expect(existsSync(disc)).toBe(false);
    const result = await extractMaps({ iso, disc, maps: join(root, 'pack', 'maps'), cloneRoot: null, fs: { names } });
    expect(result.maps).toEqual([MP2]);
  });
});
