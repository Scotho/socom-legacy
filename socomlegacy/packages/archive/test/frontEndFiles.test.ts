import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { streamFile } from '../src/assetSource';
import { FsAssetSource } from '../src/fsAssetSource';
import { FRONT_END_CLASSES, frontEndFiles, matchesDiscPattern, missingFrontEndNames } from '../src/frontEndFiles';
import { HttpAssetSource } from '../src/httpAssetSource';
import { IsoAssetSource } from '../src/isoAssetSource';
import { buildIso, type IsoMember } from './isoImage';

/** A member whose every byte says where it is and which file it is, so a read of the wrong file cannot pass. */
const pattern = (length: number, seed: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 13 + seed * 29 + (i >>> 9)) & 0xff;
  return out;
};

/**
 * A disc tree shaped as the retail one is (the names are the disc's own directory listing, `SOCOM_DISC`, names only;
 * the bytes are synthetic): one or more members of each class, and neighbours each class must NOT take -- the per-map
 * `BF*`/`EM*` ZEDs beside `UI*.ZED`, `RUN/READERC.ZAR` beside `RUN/UI/READERC.ZAR`, `APACHE00.ZDB` in `RUN/RAW/`, a
 * campaign movie and an AOP movie outside `RUN/MOVIES/COMMON/`.
 */
const PATHS = [
  'RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UI/UI.ZED', 'RUN/UI/UI_GEO.ZED', 'RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UI2D_PAL.ZED',
  'RUN/UI/BF51_TXR.ZED', 'RUN/UI/EM01_PAL.ZED', 'RUN/UI/DBUFFER.ZAR',
  'RUN/UIZANIM.ZAR', 'RUN/EXTZANIM.ZAR', 'RUN/MPZANIM.ZAR', 'RUN/READERC.ZAR',
  'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/LOCALE/STATES/HUDCLOC.ZAR', 'RUN/LOCALE/STATES/UIXLOC.ZAR', 'RUN/LOCALE/STATES/UIMPXLOC.ZAR',
  'RUN/LOCALE/STATES/ALBLOC.ZAR',
  'RUN/MOVIES/COMMON/MENULOOP.PSS', 'RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS',
  'RUN/MOVIES/ALB_AOP.PSS', 'RUN/MOVIES/M51/M51_EXT.PSS',
  'RUN/RAW/LOADING.RAW', 'RUN/RAW/PULOADGP.RAW', 'RUN/RAW/APACHE00.ZDB',
  'RUN/COMMON/FONT_TXR.ZED', 'RUN/COMMON/FONT_PAL.ZED', 'RUN/COMMON/SPLA_TXR.ZED',
  'RUN/SOUNDS/VAGSTORE.ZAR', 'RUN/SOUNDS/BNKSTORE.ZAR',
  'RUN/ICONS/LIST.ICO', 'RUN/ICONS/ICON.SYS', 'RUN/ICONS/HDD/ICON.SYS', 'RUN/ICONS/NETCNF/SYS_NET.ICO',
  'RUN/MP2.ZDB',
];

describe('the front-end file list (PLAT-03)', () => {
  it('declares each class the block names, with how it is read and where that is said', () => {
    expect(FRONT_END_CLASSES.map((c) => c.id)).toEqual([
      'ui-readers', 'ui-zed', 'zanim', 'locale', 'locale-campaign', 'movies', 'font', 'raw', 'vagstore', 'icons', 'mission-movies',
      'aop-movies',
    ]);
    for (const c of FRONT_END_CLASSES) {
      expect(c.patterns.length, c.id).toBeGreaterThan(0);
      expect(['whole', 'ranged', 'streamed'], c.id).toContain(c.read);
      expect(c.source.length, c.id).toBeGreaterThan(20);
    }
    const byId = new Map(FRONT_END_CLASSES.map((c) => [c.id, c]));
    // The movies and the VAGSTORE streams are read as they play, by LBN (PC research 09, 32 §6); the rest whole by path.
    expect(byId.get('movies')).toMatchObject({ read: 'streamed', addressed: 'lbn', bulk: true });
    expect(byId.get('vagstore')).toMatchObject({ read: 'streamed', addressed: 'lbn', bulk: true });
    expect(byId.get('ui-zed')).toMatchObject({ read: 'whole', addressed: 'path', bulk: false });
    expect(byId.get('mission-movies')?.deferred).toBe('campaign');
    expect(FRONT_END_CLASSES.filter((c) => c.deferred).map((c) => c.id)).toEqual(['locale-campaign', 'mission-movies', 'aop-movies']);
    // The four AOP movies wait on MENU-05's owner call (front end through EXTRAS, or campaign under the skip): in a
    // class of their own, deferred until it is made, not dropped and not counted as missing.
    expect(byId.get('aop-movies')).toMatchObject({
      patterns: ['RUN/MOVIES/*_AOP.PSS'], read: 'streamed', addressed: 'lbn', bulk: true, deferred: 'owner-call', waitsOn: 'MENU-05',
    });
    for (const c of FRONT_END_CLASSES) expect(c.deferred === 'owner-call', c.id).toBe(c.waitsOn !== undefined);
  });

  it('matches a pattern a segment at a time: * stays inside one directory', () => {
    expect(matchesDiscPattern('RUN/UI/UI*.ZED', 'RUN/UI/UI.ZED')).toBe(true);
    expect(matchesDiscPattern('RUN/UI/UI*.ZED', 'RUN/UI/UIMP_TXR.ZED')).toBe(true);
    expect(matchesDiscPattern('RUN/UI/UI*.ZED', 'RUN/UI/BF51_TXR.ZED')).toBe(false);
    expect(matchesDiscPattern('RUN/ICONS/*', 'RUN/ICONS/HDD/ICON.SYS')).toBe(false);
    expect(matchesDiscPattern('RUN/ICONS/*/*', 'RUN/ICONS/HDD/ICON.SYS')).toBe(true);
    expect(matchesDiscPattern('RUN/LOCALE/STATES/*LOC.ZAR', 'run/locale/states/uimnloc.zar')).toBe(true);
    expect(matchesDiscPattern('RUN/RAW/*.RAW', 'RUN/RAW/APACHE00.ZDB')).toBe(false);
  });

  it('picks each class out of a disc listing, the campaign and the bulk streams only when asked', () => {
    const all = frontEndFiles(PATHS);
    const of = (id: string) => all.filter((f) => f.class.id === id).map((f) => f.path);
    expect(of('ui-readers')).toEqual(['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR']);
    expect(of('ui-zed')).toEqual(['RUN/UI/UI.ZED', 'RUN/UI/UI2D_PAL.ZED', 'RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UI_GEO.ZED']);
    expect(of('zanim')).toEqual(['RUN/EXTZANIM.ZAR', 'RUN/MPZANIM.ZAR', 'RUN/UIZANIM.ZAR']);
    expect(of('locale')).toEqual([
      'RUN/LOCALE/STATES/HUDCLOC.ZAR', 'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/LOCALE/STATES/UIMPXLOC.ZAR', 'RUN/LOCALE/STATES/UIXLOC.ZAR',
    ]);
    expect(of('locale-campaign')).toEqual([]);
    expect(of('movies')).toEqual(['RUN/MOVIES/COMMON/MENULOOP.PSS', 'RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS']);
    expect(of('raw')).toEqual(['RUN/RAW/LOADING.RAW', 'RUN/RAW/PULOADGP.RAW']);
    expect(of('font')).toEqual(['RUN/COMMON/FONT_PAL.ZED', 'RUN/COMMON/FONT_TXR.ZED']);   // not the splash library beside it
    expect(of('vagstore')).toEqual(['RUN/SOUNDS/VAGSTORE.ZAR']);
    expect(of('icons')).toEqual(['RUN/ICONS/HDD/ICON.SYS', 'RUN/ICONS/ICON.SYS', 'RUN/ICONS/LIST.ICO', 'RUN/ICONS/NETCNF/SYS_NET.ICO']);
    expect(of('mission-movies')).toEqual([]);
    expect(of('aop-movies')).toEqual([]);
    // Nothing outside the classes, and no file in two.
    const paths = all.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of ['RUN/LOCALE/STATES/ALBLOC.ZAR', 'RUN/UI/BF51_TXR.ZED', 'RUN/UI/DBUFFER.ZAR', 'RUN/READERC.ZAR', 'RUN/RAW/APACHE00.ZDB', 'RUN/MOVIES/ALB_AOP.PSS', 'RUN/MP2.ZDB']) {
      expect(paths).not.toContain(p);
    }
    expect(frontEndFiles(PATHS, { deferred: true }).filter((f) => f.class.deferred).map((f) => f.path))
      .toEqual(['RUN/LOCALE/STATES/ALBLOC.ZAR', 'RUN/MOVIES/ALB_AOP.PSS', 'RUN/MOVIES/M51/M51_EXT.PSS']);
    // No disc file the listing holds under RUN/MOVIES is outside every class once the deferred ones are asked for.
    const movies = PATHS.filter((p) => p.startsWith('RUN/MOVIES/'));
    expect(frontEndFiles(movies, { deferred: true }).map((f) => f.path)).toEqual([...movies].sort());
    const small = frontEndFiles(PATHS, { bulk: false });
    expect(small.some((f) => f.class.bulk)).toBe(false);
    expect(small.length).toBe(all.length - 4);
  });

  it('reports a name the list gives that the listing does not have, rather than inventing it', () => {
    expect(missingFrontEndNames(PATHS)).toEqual([]);
    const without = PATHS.filter((p) => p !== 'RUN/MOVIES/INTRO_2.PSS' && !p.startsWith('RUN/RAW/'));
    expect(missingFrontEndNames(without)).toEqual(['RUN/MOVIES/INTRO_2.PSS', 'RUN/RAW/*.RAW']);
  });
});

/**
 * The acceptance's first bar: every class read from the visitor's ISO is byte-equal to the served copy -- the same
 * members written as a dev tree on disk (`FsAssetSource`) and served over HTTP (`HttpAssetSource`, ranged, the
 * index naming the front-end files) -- whole for the classes read whole, in chunks for the streamed ones.
 */
describe('every front-end class reads byte-equal from the ISO and from the served tree', () => {
  const members: IsoMember[] = PATHS.map((path, i) => ({ path, bytes: pattern(path.endsWith('.PSS') ? 70_000 + i : 3000 + 17 * i, i) }));
  const byPath = new Map(members.map((m) => [m.path, m.bytes]));
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 's2u-frontend-'));
    for (const m of members) {
      mkdirSync(dirname(join(dir, m.path)), { recursive: true });
      writeFileSync(join(dir, m.path), m.bytes);
    }
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  /** A server over the members: `index.json` names the front-end files, a `Range` is answered 206. */
  const serve = () => vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^\/maps\//, '');
    if (path === 'index.json') return new Response(JSON.stringify({ maps: [], common: [], frontEnd: frontEndFiles(PATHS).map((f) => f.path) }));
    const bytes = byPath.get(path);
    if (!bytes) return new Response(null, { status: 404 });
    if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': String(bytes.length) } });
    const range = /bytes=(\d+)-(\d+)/.exec(String((init?.headers as Record<string, string> | undefined)?.Range ?? ''));
    if (!range) return new Response(bytes.slice());
    return new Response(bytes.slice(Number(range[1]), Number(range[2]) + 1), { status: 206 });
  });

  const join_ = (chunks: Uint8Array[]): Uint8Array => {
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  };

  it('whole, or streamed in chunks, each class from the ISO equals the tree and the server', async () => {
    vi.stubGlobal('fetch', serve());
    const iso = new IsoAssetSource(new Blob([buildIso(members)]));
    const fs = new FsAssetSource(dir);
    const http = new HttpAssetSource('/maps');
    const files = frontEndFiles(await iso.list());
    expect(files.map((f) => f.path)).toEqual(frontEndFiles(await fs.list()).map((f) => f.path));
    expect(files.map((f) => f.path)).toEqual(frontEndFiles(await http.list()).map((f) => f.path));
    const classes = new Set<string>();
    for (const { path, class: c } of files) {
      classes.add(c.id);
      const want = byPath.get(path)!;
      if (c.read === 'streamed') {
        for (const source of [iso, fs, http]) {
          const chunks: Uint8Array[] = [];
          for await (const chunk of streamFile(source, path, { chunkSize: 4096 })) chunks.push(chunk);
          expect(chunks.length, path).toBe(Math.ceil(want.length / 4096));
          expect(Buffer.from(join_(chunks)).equals(Buffer.from(want)), path).toBe(true);
        }
      } else {
        for (const source of [iso, fs, http]) expect(Buffer.from(await source.read(path)).equals(Buffer.from(want)), path).toBe(true);
      }
    }
    expect([...classes].sort()).toEqual(['font', 'icons', 'locale', 'movies', 'raw', 'ui-readers', 'ui-zed', 'vagstore', 'zanim']);
  });
});
