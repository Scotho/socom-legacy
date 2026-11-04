import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoAssetSource, READ_SET_MOVIES, SOCOM2_US_BOOT, streamFile } from '@s2u/archive';
import { MOVIE_END, MOVIE_SKIP_TIMER, PAD_STATE, type MovieFrame, type MovieStreamHandle } from '@s2u/fmv';
import type { MoviePlayRequest } from '@s2u/ui';
import { buildIso } from '../../archive/test/isoImage';
import { extractDisc, type ExtractEnv } from '../src/discExtract';
import { ExtractedMissError } from '../src/discExtractSource';
import { sourceCache, type DiscRequest, type StoredRequest } from '../src/discSource';
import { StoredDiscSource, isMoviePath, movieOpens, sourceWhere } from '../src/discStored';
import { frontEndMovies, type MovieWorkerHandle } from '../src/frontEndMovies';
import { MoviePlayerHost } from '../src/moviePlayerHost';
import { openPageRecords } from '../src/pageStore';
import { FakeOpfs, FakeStorage, discMembers, fakeWorker, filler, type Member } from './discExtractFakes';

/**
 * DX-3 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6 and the merge controller's ruling): the
 * stored source's fallback and the cut movies' skip. A movie outside the read set plays from the disc when a disc was
 * opened on this visit (the stored source reads it from there, for movies only on the front end; for any path outside
 * the set in the forge), and is otherwise skipped by the session's own path: its open fails, as the original's does for a
 * file not on the disc, and the movie state closes and pops on its first tick -- the close and pop a Cross skip ends in --
 * with no stream opened, no picture shown, no error. A non-movie path outside the set is a real error in words. A
 * browser adaptation (FI.R2): nothing the game does changes. The disc is a synthetic image in the retail names (no game
 * data); the storage is DX-1's fakes.
 */

const ID = { boot: SOCOM2_US_BOOT, ver: '1.02', vmode: 'NTSC' };
/** A cut movie (the EXTRAS' credits) beside the read set's three; a per-map UI set (`BF51_TXR.ZED`) is outside the set. */
const CUT = 'RUN/MOVIES/CREDITS.PSS';
const members = (): Member[] => [...discMembers(), { path: CUT, bytes: filler(4_500, 77) }];
const image = (): Extract<DiscRequest, { kind: 'iso' }> =>
  ({ kind: 'iso', file: new File([buildIso(members(), 'SCUS_97275')], 'SOCOM II.iso', { lastModified: 5 }) });

let env: ExtractEnv;
beforeEach(() => {
  const idb = new FakeFactory() as unknown as IDBFactory;
  const log = { count: 0, terminated: 0, files: 0 };
  const fs = new FakeOpfs();
  env = { storage: new FakeStorage(fs), idb: () => idb, records: openPageRecords(() => idb, () => undefined), worker: () => fakeWorker(log, fs), chunk: 1024, now: () => 5 };
});

/** The read set extracted from `disc`, and a stored request over it. */
async function kept(disc: DiscRequest, extra: Partial<StoredRequest> = {}): Promise<StoredRequest> {
  const record = await extractDisc(disc, {}, env);
  expect(record.files.some((f) => f.path === CUT)).toBe(false);             // the cut movie is not kept
  return { kind: 'stored', identity: { ...ID }, ...extra };
}

describe('the stored source with the disc of this visit (the front end: movies only)', () => {
  it('a cut movie is read, by range and streamed, from the disc; a kept one from storage', async () => {
    const disc = image();
    const req = await kept(disc, { disc });
    const s = sourceCache(env)(req) as StoredDiscSource;
    const iso = new IsoAssetSource(disc.file);
    expect(await s.read(CUT)).toEqual(await iso.read(CUT));
    expect(await s.size(CUT)).toBe(4_500);
    expect(await s.readRange(CUT, 100, 64)).toEqual(await iso.readRange(CUT, 100, 64));
    const chunks: Uint8Array[] = [];
    for await (const c of streamFile(s, CUT, { chunkSize: 2048 })) chunks.push(c);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(await iso.read(CUT)));
    // A kept file never touches the disc: the image is replaced by an empty one, and the kept bytes still read.
    const blind = new StoredDiscSource(req, { list: async () => [], read: async () => { throw new Error('the disc was read'); } }, { env });
    for (const p of READ_SET_MOVIES) expect((await blind.read(p)).length, p).toBe(5_000);
  });

  it('a non-movie path outside the set is a real error in words, never read from the disc', async () => {
    const disc = image();
    const s = sourceCache(env)(await kept(disc, { disc }));
    await expect(s.read('RUN/UI/BF51_TXR.ZED')).rejects.toBeInstanceOf(ExtractedMissError);
    await expect(s.read('RUN/UI/BF51_TXR.ZED')).rejects.toThrow(/RUN\/UI\/BF51_TXR\.ZED is not among the disc's files kept in this browser/);
  });

  it('the listing: the read set and the disc\'s movies, not its other files', async () => {
    const disc = image();
    const list = await sourceCache(env)(await kept(disc, { disc })).list();
    expect(list).toContain(CUT);
    expect(list).toContain('RUN/MP2.ZDB');
    expect(list).not.toContain('RUN/UI/BF51_TXR.ZED');
    expect(list).toEqual([...list].sort());
  });

  it('with no disc: the cut movie is the named miss (outside), which the movie host never asks for (movieOpens)', async () => {
    const s = sourceCache(env)(await kept(image()));
    await expect(s.read(CUT)).rejects.toMatchObject({ name: 'ExtractedMissError', reason: 'outside' });
  });
});

describe('the forge\'s stored source (fallback outside): any path outside the set from the disc', () => {
  it('an archive outside the set (a per-map UI set; the campaign maps are in it since FI.R6) from the disc, listed; the read set from storage', async () => {
    const disc = image();
    const s = sourceCache(env)(await kept(disc, { disc, fallback: 'outside' }));
    const iso = new IsoAssetSource(disc.file);
    expect(await s.read('RUN/UI/BF51_TXR.ZED')).toEqual(await iso.read('RUN/UI/BF51_TXR.ZED'));
    expect(await s.list()).toContain('RUN/UI/BF51_TXR.ZED');
  });

  it('with no disc, the forge says where in FG.R12\'s words: "not on the disc kept in this browser"', () => {
    expect(sourceWhere({ kind: 'stored', identity: ID } as StoredRequest)).toBe('the disc kept in this browser');
    expect(sourceWhere({ kind: 'stored', identity: ID, disc: image() } as StoredRequest)).toBe('your disc');
    expect(sourceWhere({ kind: 'iso' })).toBe('your disc');
    expect(sourceWhere({ kind: 'http' })).toBe('the served tree');
  });
});

describe('movieOpens: the movie host\'s open check', () => {
  it('stored with no disc: the read set\'s three movies open, every other movie does not (the dialogs\' lower-case names)', () => {
    const opens = movieOpens({ kind: 'stored' })!;
    for (const p of ['run/movies/common/sony448.pss', 'run/movies/intro_2.pss', '/run/movies/common/menuloop.pss', 'RUN\\MOVIES\\INTRO_2.PSS']) expect(opens(p), p).toBe(true);
    for (const p of ['run/movies/credits.pss', 'run/movies/artgall2.pss', 'run/movies/tut_01.pss', 'run/movies/m51_aop.pss']) expect(opens(p), p).toBe(false);
  });
  it('stored with the disc, an image, a folder, the served tree: no check (every name opens, as before)', () => {
    expect(movieOpens({ kind: 'stored', disc: image() })).toBeUndefined();
    for (const kind of ['iso', 'dir', 'http']) expect(movieOpens({ kind })).toBeUndefined();
    expect(isMoviePath('run/movies/credits.pss')).toBe(true);
    expect(isMoviePath('RUN/MP2.ZDB')).toBe(false);
  });
});

/** A worker handle whose opens are recorded, its stream one black picture then the end. */
function worker(): { make: () => MovieWorkerHandle; opened: string[]; made: number } {
  const log = { make: (): MovieWorkerHandle => make(), opened: [] as string[], made: 0 };
  const make = (): MovieWorkerHandle => {
    log.made++;
    return {
      wasm: '/fmv/libmpeg2.wasm', terminate: () => {},
      client: {
        open: (path): MovieStreamHandle => {
          log.opened.push(path);
          let n = 0;
          return {
            tick: () => (n++ === 0 ? ({ kind: 'frame', index: 0, width: 1, height: 1, rgba: new ArrayBuffer(4) } as unknown as MovieFrame) : ({ kind: 'end', pictures: 1, error: null } as never)),
            release: () => {}, close: () => {},
          };
        },
      },
    };
  };
  return log;
}

const play = (file: string, fade = true): MoviePlayRequest =>
  ({ file, fade, ingame: false, interlace: false, subtitleIndex: false, audioStream: 0, destRect: false, bilinear: false, rectWords: [] });

describe('the cut movie with no disc is skipped as a Cross press skips it: the movie state\'s close and pop', () => {
  /** The host over `frontEndMovies`' source for `source`, and what it did. */
  function host(source: StoredRequest | { kind: 'http'; baseUrl: string }) {
    const w = worker();
    const movies = frontEndMovies({ source, assets: { list: async () => [], read: async () => new Uint8Array(0) }, worker: w.make, out: () => null, now: () => 0 });
    const seen: string[] = [];
    const h = new MoviePlayerHost<MovieFrame>({
      source: movies.source,
      layer: { present: () => { seen.push('picture'); } },
      setAlpha: (a) => { seen.push(`alpha ${a}`); },
      onMpegEnd: () => { seen.push('event 3'); },
      onStatePop: () => { seen.push('state pop'); },
      onCover: () => { seen.push('cover'); },
    });
    return { h, w, seen };
  }
  const NONE = { cross: PAD_STATE.UP };

  it('no worker started, no stream opened, no picture, no error: pushed, its first tick pops, the menu returns', () => {
    const errors = vi.spyOn(console, 'warn');
    const { h, w, seen } = host({ kind: 'stored', identity: ID });
    h.play(play('run/movies/credits.pss'));
    expect(h.frame(1 / 30, NONE)).toBe('movie');                      // the push: cover, init (its open fails)
    expect(h.movieState.active).toBe(true);
    h.frame(1 / 30, NONE);                                             // its first tick: closed, the pop asked
    expect(h.movieState.active).toBe(false);
    h.frame(1 / 30, NONE);                                             // the pop: exit (alpha 1), the menu's OnPop
    expect(h.moviePlaying).toBe(false);
    expect(h.frame(1 / 30, NONE)).toBe('menu');
    expect(seen).toEqual(['cover', 'alpha 1', 'state pop']);
    expect(w.made).toBe(0);
    expect(w.opened).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('the same end a Cross press reaches over a movie that plays: cover, the close, exit, the menu\'s OnPop', () => {
    const { h, w, seen } = host({ kind: 'stored', identity: ID });
    h.play(play('run/movies/common/sony448.pss', false));             // a kept movie, NoFade: Cross stops it at once
    h.frame(1 / 30, NONE);
    h.frame(1 / 30, { cross: PAD_STATE.PRESSED });                    // a picture shown
    h.frame(1 / 30, { cross: PAD_STATE.RELEASED });                   // the skip (MOVIE_SKIP_TIMER, no fade: stops now)
    expect(MOVIE_SKIP_TIMER).toBeGreaterThan(0);
    h.frame(1 / 30, NONE);
    expect(h.frame(1 / 30, NONE)).toBe('menu');
    expect(w.opened).toEqual(['RUN/MOVIES/COMMON/SONY448.PSS']);
    // The skip's own frames (the picture, the fade's alpha 0) and then the same end as the cut movie's.
    expect(seen.filter((x) => x !== 'picture' && x !== 'alpha 0')).toEqual(['cover', 'alpha 1', 'state pop']);
  });

  it('with the disc of this visit, the cut movie opens and plays from the disc (the stored source\'s fallback)', () => {
    const { h, w, seen } = host({ kind: 'stored', identity: ID, disc: image() });
    h.play(play('run/movies/credits.pss'));
    h.frame(1 / 30, NONE);
    h.frame(1 / 30, NONE);
    expect(w.opened).toEqual(['RUN/MOVIES/CREDITS.PSS']);
    expect(seen).toContain('picture');
  });

  it('a dialog\'s background movie that is cut: its event 3 at once, as for a file not on the disc', () => {
    const { h, w, seen } = host({ kind: 'stored', identity: ID });
    h.background.build({ type: 1, filename: 'run/movies/artgall2.pss' });
    expect(seen).toEqual(['event 3']);
    expect(h.background.state).toBe('STOPPED');
    expect(w.made).toBe(0);
    expect(MOVIE_END).toBeTypeOf('symbol');
  });
});
