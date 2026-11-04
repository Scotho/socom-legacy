import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MovieEndMessage, MovieFrame, MovieStreamHandle } from '@s2u/fmv';
import { frontEndMovies, type MovieWorkerHandle } from '../src/frontEndMovies';
import { menuRasterWanted, movieWorkerSleeps } from '../src/frontEndSleep';

/**
 * Browser adaptation (no original; product track, PR #631's Xbox memory work), scoped to the Xbox preset: while a
 * lobby-mounted match is up, the menus under it still tick (the lobby and the match through the session's `advance`)
 * but are not rasterized, and the movie worker is ended when no movie is open. Fakes for the worker; nothing measured.
 */

describe('menuRasterWanted (the menus\' raster under a match, Xbox preset only)', () => {
  it('skips the raster only while a match is up under the Xbox preset', () => {
    expect(menuRasterWanted(true, 'xbox')).toBe(false);
  });

  it('draws under every other preset, match or not -- today\'s behaviour', () => {
    for (const g of ['auto', 'webgl2', 'webgpu', '']) {
      expect(menuRasterWanted(true, g)).toBe(true);
      expect(menuRasterWanted(false, g)).toBe(true);
    }
  });

  it('draws again on the first tick after the return', () => {
    expect(menuRasterWanted(false, 'xbox')).toBe(true);
  });
});

describe('movieWorkerSleeps (Xbox preset only)', () => {
  it('is the Xbox preset alone', () => {
    expect(movieWorkerSleeps('xbox')).toBe(true);
    for (const g of ['auto', 'webgl2', '']) expect(movieWorkerSleeps(g)).toBe(false);
  });
});

/** A fake worker factory: each make is a fresh handle; its streams answer `pending` until told otherwise. */
function workers() {
  const log = { made: 0, terminated: [] as number[], opened: [] as { worker: number; path: string }[], end: false };
  const make = (): MovieWorkerHandle => {
    const id = ++log.made;
    return {
      wasm: '/fmv/libmpeg2.wasm',
      terminate: () => { log.terminated.push(id); },
      client: {
        open: (path): MovieStreamHandle => {
          log.opened.push({ worker: id, path });
          return {
            tick: (): MovieFrame | MovieEndMessage | null => (log.end ? ({ kind: 'end', pictures: 0, error: null } as unknown as MovieEndMessage) : null),
            release: () => {},
            close: () => {},
          };
        },
      },
    };
  };
  return { log, make };
}

function movies() {
  const w = workers();
  const m = frontEndMovies({
    source: { kind: 'http', baseUrl: '/maps/' }, assets: { list: async () => [], read: async () => new Uint8Array(0) },
    worker: w.make, out: () => null, now: () => 0,
  });
  return { ...w, m };
}

describe('FrontEndMovies.sleep (the movie worker ended under a match when no movie is open)', () => {
  it('with no worker made, makes none and ends none', () => {
    const { log, m } = movies();
    expect(m.sleep()).toBe(true);
    expect(log.made).toBe(0);
    expect(log.terminated).toEqual([]);
  });

  it('leaves a worker whose movie is open (playing or pending) as it is', () => {
    const { log, m } = movies();
    expect(m.source.open('run/movies/common/menuloop.pss', { audioStream: 0 })).toBe(true);
    m.source.next();
    expect(m.sleep()).toBe(false);
    expect(log.terminated).toEqual([]);
    m.source.next();                                           // the movie still ticks on the same worker
    expect(log.made).toBe(1);
  });

  it('leaves a worker whose movie reached its end but is still open (a loop restarts it)', () => {
    const { log, m } = movies();
    m.source.open('run/movies/common/menuloop.pss', { audioStream: 0 });
    log.end = true;
    m.source.next();
    expect(m.sleep()).toBe(false);
    expect(log.terminated).toEqual([]);
  });

  it('ends the worker once its movie is closed, and the next open makes a fresh one', () => {
    const { log, m } = movies();
    m.source.open('run/movies/common/sony448.pss', { audioStream: 0 });
    m.source.close();
    expect(m.sleep()).toBe(true);
    expect(log.terminated).toEqual([1]);
    expect(m.sleep()).toBe(true);                              // a second sleep ends nothing more
    expect(log.terminated).toEqual([1]);
    m.source.open('run/movies/common/menuloop.pss', { audioStream: 0 });
    expect(log.made).toBe(2);
    expect(log.opened.at(-1)).toEqual({ worker: 2, path: 'RUN/MOVIES/COMMON/MENULOOP.PSS' });
    m.stop();
    expect(log.terminated).toEqual([1, 2]);
  });

  it('a restart of a closed movie after the sleep opens on a fresh worker', () => {
    const { log, m } = movies();
    m.source.open('run/movies/common/menuloop.pss', { audioStream: 0 });
    m.source.close();
    m.sleep();
    m.source.restart();
    expect(log.made).toBe(2);
    expect(log.opened.at(-1)?.worker).toBe(2);
  });

  it('a movie opened and superseded by another stays open', () => {
    const { log, m } = movies();
    m.source.open('run/movies/common/sony448.pss', { audioStream: 0 });
    m.source.open('run/movies/common/intro_2.pss', { audioStream: 0 });
    expect(m.sleep()).toBe(false);
    expect(log.terminated).toEqual([]);
  });
});

describe('the page\'s wiring (frontEnd.ts)', () => {
  const src = readFileSync(new URL('../src/frontEnd.ts', import.meta.url), 'utf8');

  it('the loop keeps advancing and asks menuRasterWanted before the render', () => {
    const loop = src.slice(src.indexOf('const loop = (now: number): void => {'));
    const body = loop.slice(0, loop.indexOf('frameId = win.requestAnimationFrame(loop);'));
    expect(body).toMatch(/s\.advance\(now\) > 0 && drawsMenuFrame\(s, hd\.scale\) && menuRasterWanted\(matchUp, matchGraphics\)/);
  });

  it('leave raises the flag and sleeps the movie worker under the Xbox preset; returned lowers the flag', () => {
    const leave = src.split('\n').filter((l) => /^\s*leave: \(\) => \{ matchSound\.leave\(\);/.test(l));
    expect(leave).toHaveLength(1);
    expect(leave[0]).toContain('matchUp = true;');
    expect(leave[0]).toContain('matchGraphics = readGraphicsBackend(); if (movieWorkerSleeps(matchGraphics)) movies?.sleep();');
    const returned = src.split('\n').filter((l) => /^\s*returned: \(\) => \{ roundLine = null;/.test(l));
    expect(returned).toHaveLength(1);
    expect(returned[0]).toContain('matchUp = false;');
  });
});
