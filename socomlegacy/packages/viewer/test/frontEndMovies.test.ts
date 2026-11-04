// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import {
  BlackPictureSource, MOVIE_END, MOVIE_PENDING, MovieWorkerSource,
  type MovieEndMessage, type MovieFrame, type MovieNext, type MovieOpenOptions, type MoviePictureSource, type MovieStreamHandle,
} from '@s2u/fmv';
import { UI_TICK_SECONDS, type DialogDesign } from '@s2u/ui';
import { GameAudio, type AudioOut } from '../src/audio';
import { FrontEndSession, mountFrontEnd, type FrontEndDisc } from '../src/frontEnd';
import { MovieSoundFeed, SoundedMovieSource, discPath, movieFramePicture, type MovieWorkerHandle } from '../src/frontEndMovies';
import type { MovieSoundOut } from '../src/movieSound';

/**
 * MOVIE-WIRE (2026-10-03): the page's front end plays its movies from the disc -- PLAT-19c's worker source handed to
 * the session (`FrontEndSessionOptions.source`), each presented `MovieFrame` drawn by PLAT-14's drawer through
 * `movieFramePicture`, and PLAT-20's sound fed per opened movie (`MovieSoundFeed`). Scripted sources and streams; no
 * worker, no decoder, nothing measured on the original running.
 */

const W = 640, H = 448;
/** A 640 x 448 picture of one colour, as the worker's picture message carries it. */
const frame = (index: number, rgb: [number, number, number]): MovieFrame => {
  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255; }
  return { kind: 'picture', index, codingIndex: index, type: 'I', temporalReference: 0, pts: null, width: W, height: H, rgba: px.buffer };
};
const colour = (i: number): [number, number, number] => [40 + (i % 50), 90, 160];

/** A source of `n` coloured pictures, then the end; records its calls. */
class FakeSource implements MoviePictureSource<MovieFrame> {
  calls: string[] = [];
  private at = 0;
  constructor(private readonly n = 1000) {}
  open(name: string, _o: MovieOpenOptions): boolean { this.calls.push(`open ${name}`); this.at = 0; return true; }
  next(): MovieNext<MovieFrame> { return this.at < this.n ? frame(this.at, colour(this.at++)) : MOVIE_END; }
  restart(): void { this.calls.push('restart'); this.at = 0; }
  close(): void { this.calls.push('close'); }
}

const mpegDialog = (filename: string, type = 1): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: { type, typeName: type === 2 ? 'MPEG_LOOPING' : 'MPEG', filename },
  bindings: [], controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const disc = (d: (n: string) => DialogDesign | null): FrontEndDisc => ({ dialog: d, sets: [], faces: [], captions: null, loader: {}, missing: [] });

/** A canvas target that keeps the last frame put. */
const target = () => {
  const t = {
    last: null as Uint8ClampedArray | null,
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: (img: { data: Uint8ClampedArray }) => { t.last = img.data.slice(); },
  };
  return t;
};
const pixel = (d: Uint8ClampedArray, x: number, y: number): number[] => [...d.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)];

function run(s: FrontEndSession<MovieFrame>, ticks: number, clock = { t: 0 }): void {
  if (clock.t === 0) s.advance(0);
  for (let i = 0; i < ticks; i++) { clock.t += 1000 * UI_TICK_SECONDS + 0.01; s.advance(clock.t); }
}

describe('movieFramePicture: a presented MovieFrame as the Rgba PLAT-14\'s drawer copies (the 640 x 448 picture, top row first)', () => {
  it('is the frame\'s own pixels, no copy; a picture with no pixels (a black stand-in, a buffer handed back) draws black', () => {
    const f = frame(3, [10, 20, 30]);
    const rgba = movieFramePicture({ width: W, height: H, image: f })!;
    expect(rgba.width).toBe(W);
    expect(rgba.height).toBe(H);
    expect(rgba.data.buffer).toBe(f.rgba);
    expect([...rgba.data.subarray(0, 4)]).toEqual([10, 20, 30, 255]);
    expect(movieFramePicture({ width: W, height: H, image: { index: 0, black: true } })).toBeNull();
    expect(movieFramePicture({ width: W, height: H, image: { ...f, rgba: new ArrayBuffer(0) } })).toBeNull();
  });
});

describe('the session draws the presented picture: a MovieFrame source and the adapter (not the black stand-in)', () => {
  it('a BACKGROUND TYPE MPEG dialog shows the source\'s pictures, each tick\'s, under the dialog', () => {
    const source = new FakeSource();
    const s = new FrontEndSession<MovieFrame>({
      disc: disc((n) => (n === 'dlgIntroCinematic.rdr' ? mpegDialog('run/movies/common/sony448.pss') : null)),
      startDialog: 'dlgIntroCinematic.rdr', source, moviePicture: movieFramePicture,
    });
    const clock = { t: 0 };
    run(s, 4, clock);
    expect(source.calls[0]).toBe('open run/movies/common/sony448.pss');
    expect(s.source).toBe(source);
    const t = target();
    s.render(t);
    const a = pixel(t.last!, 320, 224);
    expect(a).not.toEqual([0, 0, 0]);
    expect(a[2]).toBe(160);
    run(s, 1, clock);
    s.render(t);
    const b = pixel(t.last!, 320, 224);
    expect(b).not.toEqual(a);                                       // the next tick's picture
  });

  it('without a source the session keeps the black source (a session with no decoder: the tests\'); its pictures draw black', () => {
    const s = new FrontEndSession({ disc: disc((n) => (n === 'dlgMenu.rdr' ? mpegDialog('run/movies/common/menuloop.pss', 2) : null)), startDialog: 'dlgMenu.rdr' });
    expect(s.source).toBeInstanceOf(BlackPictureSource);
  });
});

describe('SoundedMovieSource: the movie\'s sound follows its pictures (PLAT-20, research 137 §5)', () => {
  const feed = () => {
    const calls: string[] = [];
    return { calls, open: (n: string) => { calls.push(`open ${n}`); }, picture: (i: number) => { calls.push(`picture ${i}`); }, stop: () => { calls.push('stop'); }, close: () => { calls.push('close'); } };
  };

  it('opens the sound with the movie, hands it each picture presented, stops it at the end and lets it go at the close', () => {
    const inner = new FakeSource(2);
    const f = feed();
    const src = new SoundedMovieSource(inner, f);
    expect(src.open('run/movies/common/menuloop.pss', { audioStream: 0 })).toBe(true);
    expect((src.next() as MovieFrame).index).toBe(0);
    expect((src.next() as MovieFrame).index).toBe(1);
    expect(src.next()).toBe(MOVIE_END);
    src.restart();                                                  // MPEG_LOOPING: the last picture -> 0 (PLAT-21)
    expect((src.next() as MovieFrame).index).toBe(0);
    src.close();
    expect(f.calls).toEqual(['open run/movies/common/menuloop.pss', 'picture 0', 'picture 1', 'stop', 'picture 0', 'close']);
    expect(inner.calls).toEqual(['open run/movies/common/menuloop.pss', 'restart', 'close']);
  });

  it('a tick with no picture yet hands nothing to the sound; a failed open opens no sound', () => {
    const f = feed();
    const pending: MoviePictureSource<MovieFrame> = { open: () => false, next: () => MOVIE_PENDING, restart: () => {}, close: () => {} };
    const src = new SoundedMovieSource(pending, f);
    expect(src.open('INVALID', { audioStream: 0 })).toBe(false);
    expect(src.next()).toBe(MOVIE_PENDING);
    expect(f.calls).toEqual([]);
  });
});

/** An output whose clock stands still (never running): what `MovieSound` needs to be built. */
const stillOut = (): MovieSoundOut => ({
  running: false, currentTime: 0, pageTime: 0, heardAt: (p) => p, onRunning: () => {},
  play: () => ({ stop: () => {} }),
});

describe('MovieSoundFeed: readMovieSound for each movie the host opens, one at a time', () => {
  it('discPath: the dialog\'s name as the disc\'s path (forward slashes, no leading slash, upper case)', () => {
    expect(discPath('run/movies/common/sony448.pss')).toBe('RUN/MOVIES/COMMON/SONY448.PSS');
    expect(discPath('\\run\\movies\\Intro_2.pss')).toBe('RUN/MOVIES/INTRO_2.PSS');
  });


  it('reads the opened movie\'s track from the source; a new open or the close aborts the read before it', async () => {
    const reads: string[] = [];
    const signals: AbortSignal[] = [];
    const assets: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const fd = new MovieSoundFeed({
      assets, out: stillOut,
      read: async (_src, path, _sound, o) => { reads.push(path); signals.push(o!.signal!); return { header: null, frames: 0, priming: null }; },
    });
    fd.open('run/movies/common/sony448.pss');
    expect(fd.current).not.toBeNull();
    fd.picture(0);
    fd.open('run/movies/intro_2.pss');
    expect(signals[0]!.aborted).toBe(true);
    fd.close();
    expect(signals[1]!.aborted).toBe(true);
    expect(fd.current).toBeNull();
    expect(reads).toEqual(['run/movies/common/sony448.pss', 'run/movies/intro_2.pss']);
  });

  it('with no output (the front end\'s audio not made: no sound files) the movies play silent', () => {
    const read = vi.fn();
    const fd = new MovieSoundFeed({ assets: { list: async () => [], read: async () => new Uint8Array(0) }, out: () => null, read });
    fd.open('run/movies/common/sony448.pss');
    fd.picture(0);
    expect(read).not.toHaveBeenCalled();
    expect(fd.current).toBeNull();
  });
});

/** A `MovieClient` stand-in: records each open, answers a stream of coloured pictures. */
function fakeWorker(): { handle: MovieWorkerHandle; opens: unknown[][]; terminated: () => boolean } {
  const opens: unknown[][] = [];
  let terminated = false;
  const handle: MovieWorkerHandle = {
    wasm: '/fmv/libmpeg2.wasm',
    client: {
      open: (path, source, wasm): MovieStreamHandle => {
        opens.push([path, source, wasm]);
        let i = 0;
        return { tick: (): MovieFrame | MovieEndMessage | null => frame(i, colour(i++)), release: () => {}, close: () => {} };
      },
    },
    terminate: () => { terminated = true; },
  };
  return { handle, opens, terminated: () => terminated };
}

class SilentOut implements AudioOut {
  unlocked = false;
  state = 'locked';
  unlock(): void { this.unlocked = true; }
  setGain(): void {}
  play(): void {}
  setReverb(): void {}
  rampReverb(): void {}
  loop(): null { return null; }
}

describe('mountFrontEnd hands the session PLAT-19c\'s worker source over the served tree (the seam: FrontEndMountOptions.movies)', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const served = { kind: 'http' as const, baseUrl: '/maps' };
  const nothing: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };

  it('the session\'s source is the worker\'s (not the black stand-in): a movie opens on the worker with the served tree and the wasm', async () => {
    const w = fakeWorker();
    const m = mountFrontEnd('?menuflow', served, document, { assets: nothing, audio: new GameAudio(new SilentOut()), movies: () => w.handle })!;
    const s = (await m.session)!;
    expect(s.source).not.toBeInstanceOf(BlackPictureSource);
    expect(m.movies?.pictures).toBeInstanceOf(MovieWorkerSource);
    expect(w.opens).toEqual([]);                                    // the worker starts with the first movie, not before
    expect(s.source.open('run/movies/common/sony448.pss', { audioStream: 0 })).toBe(true);
    // The disc's path, upper case: the served tree keeps the disc's names and HTTP does not ignore case.
    expect(w.opens).toEqual([['RUN/MOVIES/COMMON/SONY448.PSS', served, '/fmv/libmpeg2.wasm']]);
    expect((s.source.next() as MovieFrame).index).toBe(0);
    m.stop();
    expect(w.terminated()).toBe(true);
  });

  it('a page with no worker (movies: null) keeps the black source: the opener\'s sequence and timing stand, its pictures black', async () => {
    const m = mountFrontEnd('?menuflow', served, document, { assets: nothing, audio: new GameAudio(new SilentOut()), movies: null })!;
    const s = (await m.session)!;
    expect(s.source).toBeInstanceOf(BlackPictureSource);
    expect(m.movies).toBeNull();
    m.stop();
  });
});
