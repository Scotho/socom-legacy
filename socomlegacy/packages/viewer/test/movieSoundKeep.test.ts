import { describe, expect, it } from 'vitest';
import { movieAudioTimeline, type MovieAudioTimeline, type SShdHeader } from '@s2u/fmv';
import type { MoviePcmPiece } from '@s2u/sound';
import type { AssetSource } from '@s2u/archive';
import { MovieSoundFeed } from '../src/frontEndMovies';
import * as movieSound from '../src/movieSound';
import type { MovieSoundOut } from '../src/movieSound';

// GM-32 (plan 2026-11-01-gpu-menus, row GM-32; product track, a browser adaptation, `MOVIE_SOUND_KEEP_ADAPTATION`): a
// dialog's background movie is opened again at every return to its dialog (MENULOOP behind dlgMenu: OPTIONS -> dlgMenu,
// the warm return at 116.7 ms on the T4), and each open read the whole file again and decoded its PCM on the main thread.
// The keep holds the last track read WHOLE and hands its pieces to the next open of the same file, paced, then its
// timeline: the new sound is scheduled exactly as a re-read's (from picture 0, frame 0, the same samples). Unit tests over
// a recording output (no browser, no disc). New exports read through the module object, so a missing one fails its own
// test (the RED's counts).

const RATE = 48000;
const HEADER = { type: 1, sampleRate: RATE, channels: 2, interleave: 512, word24: 0, word28: 0, bodySize: 0 } as unknown as SShdHeader;
const piece = (frame: number, n: number): MoviePcmPiece => {
  const left = new Int16Array(n), right = new Int16Array(n);
  for (let i = 0; i < n; i++) { left[i] = (frame + i) % 32768; right[i] = -((frame + i) % 32768); }
  return { frame, left, right };
};
/** A reader that hands `pieces` then `timeline` as `readMovieSound` does, counting its calls; `gate` holds it before the end. */
function fakeRead(pieces: MoviePcmPiece[], timeline: MovieAudioTimeline, o: { header?: SShdHeader | null; gate?: Promise<void> } = {}) {
  const calls: string[] = [];
  const read: typeof movieSound.readMovieSound = async (_src, path, sound, opts) => {
    calls.push(path);
    for (const p of pieces) { await Promise.resolve(); if (opts?.signal?.aborted) throw new Error('aborted'); sound.add(p); }
    await (o.gate ?? Promise.resolve());
    if (opts?.signal?.aborted) throw new Error('aborted');
    sound.finish(timeline);
    return { header: o.header === undefined ? HEADER : o.header, frames: pieces.reduce((n, p) => n + p.left.length, 0), priming: null };
  };
  return { read, calls };
}
/** What a sink is handed, in order. */
function sink() {
  const log: string[] = [];
  const added: MoviePcmPiece[] = [];
  return { log, added, s: { add: (p: MoviePcmPiece) => { added.push(p); log.push(`add ${p.frame}`); }, finish: (tl: MovieAudioTimeline) => { log.push(`finish ${tl.frames}`); } } };
}
const assets: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
const KeepOf = (): typeof movieSound.MovieSoundKeep => (movieSound as Record<string, unknown>).MovieSoundKeep as typeof movieSound.MovieSoundKeep;
const noWait = async (): Promise<void> => {};

const PIECES = [piece(0, 48000), piece(48000, 48000), piece(96000, 20000)];
const TIMELINE = movieAudioTimeline(116000 * 4, HEADER);

describe('GM-32: the movie sound keep (MOVIE_SOUND_KEEP_ADAPTATION)', () => {
  it('states its cap and pace (an adaptation, no original): 32 MiB of PCM, a piece every 250 ms', () => {
    expect((movieSound as Record<string, unknown>).MOVIE_SOUND_KEEP_ADAPTATION).toEqual({ maxBytes: 32 * 1024 * 1024, replayPieceMs: 250 });
  });

  it('a track read whole is kept; the next read of its file hands the same pieces in order, then its timeline, and reads nothing', async () => {
    const keep = new (KeepOf())({ wait: noWait });
    const f = fakeRead(PIECES, TIMELINE);
    const read = keep.reader(f.read);
    const one = sink(), two = sink();
    const r1 = await read(assets, 'RUN/MOVIES/COMMON/MENULOOP.PSS', one.s, {});
    expect(keep.kept).toEqual({ path: 'RUN/MOVIES/COMMON/MENULOOP.PSS', bytes: 116000 * 4, pieces: 3 });
    const r2 = await read(assets, 'RUN/MOVIES/COMMON/MENULOOP.PSS', two.s, {});
    expect(f.calls).toEqual(['RUN/MOVIES/COMMON/MENULOOP.PSS']);              // the second open read nothing
    expect(two.log).toEqual(one.log);                                        // the same pieces, the same order, the timeline last
    two.added.forEach((p, i) => expect(p).toBe(one.added[i]));               // the very pieces (no copy)
    expect(r2).toEqual(r1);
  });

  it('the replay is paced: one piece at once, then one every replayPieceMs; a close (abort) during it hands nothing more', async () => {
    const waits: number[] = [];
    let release = (): void => {};
    const keep = new (KeepOf())({ replayPieceMs: 250, wait: (ms) => { waits.push(ms); return new Promise<void>((ok) => { release = ok; }); } });
    const read = keep.reader(fakeRead(PIECES, TIMELINE).read);
    await keep.reader(fakeRead(PIECES, TIMELINE).read)(assets, 'A', sink().s, {});
    const two = sink(), abort = new AbortController();
    const done = read(assets, 'A', two.s, { signal: abort.signal });
    expect(two.log).toEqual(['add 0']);                                      // the first piece at the open, synchronously
    expect(waits).toEqual([250]);
    release();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(two.log).toEqual(['add 0', 'add 48000']);
    abort.abort();
    release();
    await done;
    expect(two.log).toEqual(['add 0', 'add 48000']);                         // no piece and no timeline after the close
  });

  it('a read cut short (aborted), one with no header, one over the cap is not kept; another file read whole replaces the kept one', async () => {
    const K = KeepOf();
    const abort = new AbortController();
    let open = (): void => {};
    const gated = new K({ wait: noWait });
    const g = gated.reader(fakeRead(PIECES, TIMELINE, { gate: new Promise<void>((ok) => { open = ok; }) }).read);
    const cut = g(assets, 'A', sink().s, { signal: abort.signal }).catch(() => null);
    abort.abort(); open();
    await cut;
    expect(gated.kept).toBeNull();
    const noHeader = new K({ wait: noWait });
    await noHeader.reader(fakeRead(PIECES, TIMELINE, { header: null }).read)(assets, 'A', sink().s, {});
    expect(noHeader.kept).toBeNull();
    const small = new K({ wait: noWait, maxBytes: 100000 * 4 });
    await small.reader(fakeRead(PIECES, TIMELINE).read)(assets, 'A', sink().s, {});
    expect(small.kept).toBeNull();
    const k = new K({ wait: noWait });
    const f = fakeRead(PIECES, TIMELINE);
    await k.reader(f.read)(assets, 'A', sink().s, {});
    await k.reader(f.read)(assets, 'B', sink().s, {});
    expect(k.kept?.path).toBe('B');
    await k.reader(f.read)(assets, 'A', sink().s, {});
    expect(f.calls).toEqual(['A', 'B', 'A']);                                // A was let go for B: read again
  });

  it('MovieSoundFeed: across a dialog round trip (MENULOOP, another movie or none, MENULOOP) the sound restarts at picture 0 from frame 0 with the same voices', async () => {
    const voices: { frames: number; when: number; offset: number; loop: boolean; first: number }[][] = [[], []];
    let pass = 0, page = 0;
    const out: MovieSoundOut = {
      running: true, get currentTime() { return page; }, get pageTime() { return page; }, heardAt: (p) => p, onRunning: () => {},
      play: (pc, when, offset, loop) => { voices[pass]!.push({ frames: pc.left.length, when, offset, loop, first: Math.round(pc.left[0]! * 32768) }); return { stop: () => {} }; },
    };
    const f = fakeRead(PIECES, TIMELINE);
    const keep = new (KeepOf())({ wait: noWait });
    const feed = new MovieSoundFeed({ assets, out: () => out, read: f.read, keep });
    const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((ok) => setTimeout(ok, 0)); };
    feed.open('MENULOOP');
    await settle();
    page = 5; feed.picture(0);
    feed.close();                                                            // OPTIONS: the movie closed
    pass = 1;
    feed.open('MENULOOP');                                                   // the return
    await settle();
    page = 5; feed.picture(0);
    expect(f.calls).toEqual(['MENULOOP']);                                   // read and decoded once
    expect(voices[1]).toEqual(voices[0]);                                    // the same voices at the same times and offsets
    expect(voices[1]!.length).toBeGreaterThan(0);
    expect(voices[1]![0]).toMatchObject({ offset: 0, first: 0 });               // frame 0's sample, from its start
    expect(feed.keep).toBe(keep);
  });
});

describe('GM-32 review F1: the kept track let go at the front end\'s stop and at its sleep (the hand-off to a match)', () => {
  const movies = async () => {
    const { frontEndMovies } = await import('../src/frontEndMovies');
    const out: MovieSoundOut = { running: false, currentTime: 0, pageTime: 0, heardAt: (p) => p, onRunning: () => {}, play: () => ({ stop: () => {} }) };
    return frontEndMovies({ source: { kind: 'none' } as never, assets, worker: () => ({ wasm: '', client: { open: () => { throw new Error('no worker'); } }, terminate: () => {} }) as never, out: () => out, now: () => 0 });
  };
  const prime = async (keep: movieSound.MovieSoundKeep): Promise<void> => {
    await keep.reader(fakeRead(PIECES, TIMELINE).read)(assets, 'RUN/MOVIES/COMMON/MENULOOP.PSS', sink().s, {});
    expect(keep.kept?.bytes).toBe(116000 * 4);
  };

  it('after sleep() and after stop() the keep holds nothing', async () => {
    const m = await movies();
    await prime(m.sound.keep);
    m.sleep();
    expect(m.sound.keep.kept).toBeNull();
    await prime(m.sound.keep);
    m.stop();
    expect(m.sound.keep.kept).toBeNull();
  });

  it('a return after a match (the sleep between) reads and decodes the track afresh', async () => {
    const f = fakeRead(PIECES, TIMELINE);
    const keep = new (KeepOf())({ wait: noWait });
    const out: MovieSoundOut = { running: false, currentTime: 0, pageTime: 0, heardAt: (p) => p, onRunning: () => {}, play: () => ({ stop: () => {} }) };
    const feed = new MovieSoundFeed({ assets, out: () => out, read: f.read, keep });
    const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((ok) => setTimeout(ok, 0)); };
    feed.open('MENULOOP'); await settle(); feed.close();
    expect(keep.kept).not.toBeNull();
    keep.clear();                                                            // what the front end's sleep does (above)
    feed.open('MENULOOP'); await settle();
    expect(f.calls).toEqual(['MENULOOP', 'MENULOOP']);
  });
});
