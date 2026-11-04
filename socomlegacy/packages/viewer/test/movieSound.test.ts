import { describe, expect, it } from 'vitest';
import { MOVIE_PCM_RING_BYTES, movieAudioTimeline } from '@s2u/fmv';
import type { AssetSource } from '@s2u/archive';
import {
  MOVIE_SOUND_GESTURE_ADAPTATION, MOVIE_SOUND_LATENCY_ADAPTATION, MovieSound, readMovieSound, webAudioMovieOut, type MovieSoundOut,
} from '../src/movieSound';

/**
 * PLAT-20 in the page (web research 137 §4-§5): the movie's sound scheduled on the output's clock from the frame that
 * shows picture 0, free of the pictures; the ring's tail looped after the track; the stop at the movie's end; and the
 * browser adaptation before the first gesture -- the picture plays, the sound joins in sync when the output runs.
 * Over a recording output; the page's is `webAudioMovieOut`.
 */

const RATE = 48000;

/**
 * An output that records each voice: its first frame in the track, when it starts, its offset, whether it loops. Two
 * clocks, as in a page: the page's (`at` sets it), which always runs, and the output's, which -- like an
 * `AudioContext`'s `currentTime` -- stands still while the output is suspended and runs `rate` times the page's while
 * it runs; `latency` is the output's (the seconds between a sample's time and its being heard).
 */
function recorder(running = true, o: { latency?: number; rate?: number } = {}) {
  let page = 0, now = 0;
  const latency = o.latency ?? 0, rate = o.rate ?? 1;
  let run: (() => void)[] = [];
  const voices: { frame: number; frames: number; when: number; offset: number; loop: boolean; stopped: boolean; first: number }[] = [];
  const out: MovieSoundOut = {
    get running() { return running; },
    get currentTime() { return now; },
    get pageTime() { return page; },
    heardAt(p) { return now - latency + (p - page); },
    onRunning(r) { run.push(r); },
    play(piece, when, offset, loop) {
      const v = { frame: -1, frames: piece.left.length, when, offset, loop, stopped: false, first: Math.round(piece.left[0]! * 32768) };
      voices.push(v);
      return { stop: () => { v.stopped = true; } };
    },
  };
  return {
    out, voices,
    at(t: number) { if (running) now += (t - page) * rate; page = t; },
    gesture() { running = true; for (const r of run) r(); },
  };
}

/** A piece of `n` frames from `frame`, its samples the frame numbers mod 32768 (a voice's first sample names where it starts). */
const piece = (frame: number, n: number) => {
  const left = new Int16Array(n), right = new Int16Array(n);
  for (let i = 0; i < n; i++) left[i] = right[i] = (frame + i) % 32768;
  return { frame, left, right };
};

describe('MovieSound: the sound from picture 0, free of the pictures (research 137 §4)', () => {
  it('names its browser adaptation: the sound joins in sync at the first gesture', () => {
    expect(MOVIE_SOUND_GESTURE_ADAPTATION).toBe('join-in-sync-at-gesture');
    expect(MOVIE_SOUND_LATENCY_ADAPTATION).toBe('lead-by-output-latency');
  });

  it('starts every piece at picture 0\'s time plus its frame over 48000, whatever the later pictures do', () => {
    const r = recorder();
    const s = new MovieSound(r.out);
    s.add(piece(0, 48000));
    r.at(10);
    s.picture(0);
    expect(r.voices).toHaveLength(1);
    expect(r.voices[0]).toMatchObject({ when: 10, offset: 0, loop: false });
    s.picture(1);
    s.picture(5);                                  // a late tick skipped pictures 2-4: nothing moves
    r.at(10.5);
    s.add(piece(48000, 48000));
    expect(r.voices[1]).toMatchObject({ when: 11, offset: 0 });
    expect(s.stats().underruns).toBe(0);
  });

  it('counts a piece that comes after its time, with the output running, as an underrun, and joins it in sync', () => {
    const r = recorder();
    const s = new MovieSound(r.out);
    s.add(piece(0, 24000));
    r.at(0);
    s.picture(0);
    r.at(0.75);
    s.add(piece(24000, 48000));                    // due at 0.5 s, here at 0.75 s
    expect(r.voices[1]!.when).toBe(0.75);
    expect(r.voices[1]!.offset).toBeCloseTo(0.25, 9);
    expect(s.stats()).toMatchObject({ underruns: 1 });
    expect(s.stats().lateSeconds).toBeCloseTo(0.25, 9);
  });

  it('before the first gesture plays nothing; at it, the sound joins at the frame it would be on (not an underrun)', () => {
    const r = recorder(false);
    const s = new MovieSound(r.out);
    s.add(piece(0, 48000));
    s.add(piece(48000, 48000));
    r.at(2);
    s.picture(0);
    expect(r.voices).toHaveLength(0);
    r.at(3.25);
    // The output's clock stood still at 0 the whole time (a suspended AudioContext renders nothing): the 1.25 s since
    // picture 0 come from the page's clock. Piece 0 (frames 0-47999) is past; piece 1 joins 0.25 s in, now.
    r.gesture();
    expect(r.voices).toHaveLength(1);
    expect(r.voices[0]).toMatchObject({ when: 0, first: 48000 % 32768 });
    expect(r.voices[0]!.offset).toBeCloseTo(0.25, 9);
    expect(s.stats()).toMatchObject({ underruns: 0, joinedAt: 0 });
    expect(s.stats().startTime).toBeCloseTo(-1.25, 9);
    expect(s.stats().mutedSeconds).toBeCloseTo(1.25, 9);
  });

  it('leads the sound by the output\'s latency, so the sample heard is the one picture 0\'s time calls for', () => {
    const r = recorder(true, { latency: 0.05 });
    const s = new MovieSound(r.out);
    s.add(piece(0, 48000));
    r.at(10);
    s.picture(0);
    // Frame 0 belongs at 9.95 on the output's clock (heard at 10.0): the first 0.05 s cannot be played any more.
    expect(r.voices[0]!.when).toBe(10);
    expect(r.voices[0]!.offset).toBeCloseTo(0.05, 9);
    expect(s.stats()).toMatchObject({ underruns: 0 });
    expect(s.stats().mutedSeconds).toBeCloseTo(0.05, 9);
  });

  it('measures the drift between the pictures\' clock and the sound\'s, and corrects none (the original corrects none)', () => {
    const r = recorder(true, { rate: 1.001 });
    const s = new MovieSound(r.out);
    s.add(piece(0, 48000));
    r.at(0);
    s.picture(0);
    expect(s.stats().drift).toBe(0);
    r.at(100);
    expect(s.stats().drift).toBeCloseTo(0.1, 9);
    expect(r.voices).toHaveLength(1);
    expect(new MovieSound(r.out).stats().drift).toBeNull();
  });

  it('after the track loops the ring\'s last 6144 frames until the stop, in step with the track\'s end', () => {
    const r = recorder();
    const s = new MovieSound(r.out);
    const frames = 4 * 6144;
    s.add(piece(0, frames));
    s.finish(movieAudioTimeline(frames * 4, { sampleRate: RATE, channels: 2 }));
    r.at(1);
    s.picture(0);
    const loop = r.voices.find((v) => v.loop)!;
    expect(loop).toMatchObject({ when: 1 + frames / RATE, offset: 0, frames: MOVIE_PCM_RING_BYTES / 4, first: frames - 6144 });
    s.stop();
    expect(r.voices.every((v) => v.stopped)).toBe(true);
  });

  it('a gesture inside the tail joins the loop at its phase', () => {
    const r = recorder(false);
    const s = new MovieSound(r.out);
    const frames = 2 * 6144;
    s.add(piece(0, frames));
    s.finish(movieAudioTimeline(frames * 4, { sampleRate: RATE, channels: 2 }));
    r.at(0);
    s.picture(0);
    const t = frames / RATE + (6144 + 100) / RATE;   // one lap and 100 frames into the loop
    r.at(t);
    r.gesture();                                       // the output's clock still at 0
    expect(r.voices).toHaveLength(1);
    expect(r.voices[0]!.loop).toBe(true);
    expect(r.voices[0]!.when).toBe(0);
    expect(r.voices[0]!.offset * RATE).toBeCloseTo(100, 6);
  });

  it('a track still reading at picture 0: its timeline cuts what was scheduled, and a track that never fills the ring falls silent', () => {
    const r = recorder();
    const s = new MovieSound(r.out);
    s.add(piece(0, 0x5c00 / 4));
    r.at(0);
    s.picture(0);
    expect(r.voices).toHaveLength(1);
    s.finish(movieAudioTimeline(0x5c00, { sampleRate: RATE, channels: 2 }));
    expect(r.voices.filter((v) => !v.stopped)).toHaveLength(0);

    const q = recorder();
    const t = new MovieSound(q.out);
    t.add(piece(0, 0x6200 / 4));                      // 0x6200 bytes: 0x6000 moved, the last 0x200 never
    q.at(0);
    t.picture(0);
    q.at(0.01);
    t.finish(movieAudioTimeline(0x6200, { sampleRate: RATE, channels: 2 }));
    const live = q.voices.filter((v) => !v.stopped && !v.loop);
    expect(q.voices[0]!.stopped).toBe(true);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ when: 0.01, frames: 0x6000 / 4, first: 0 });
    expect(live[0]!.offset).toBeCloseTo(0.01, 9);
    expect(t.stats().underruns).toBe(0);
  });

  it('a second picture 0 (a restart) stops the sound and starts it again from frame 0', () => {
    const r = recorder();
    const s = new MovieSound(r.out);
    s.add(piece(0, 4800));
    r.at(0);
    s.picture(0);
    r.at(5);
    s.picture(0);
    expect(r.voices[0]!.stopped).toBe(true);
    expect(r.voices[1]).toMatchObject({ when: 5, offset: 0, first: 0 });
  });

  it('plays nothing after the stop, and nothing for a track that never fills the ring', () => {
    const r = recorder();
    const s = new MovieSound(r.out);
    s.finish(movieAudioTimeline(0x5c00, { sampleRate: RATE, channels: 2 }));
    s.add(piece(0, 0x5c00 / 4));
    r.at(0);
    s.picture(0);
    expect(r.voices).toHaveLength(0);
    const t = new MovieSound(r.out);
    t.add(piece(0, 4800));
    t.picture(0);
    t.stop();
    t.add(piece(4800, 4800));
    expect(r.voices.filter((v) => !v.stopped)).toHaveLength(0);
  });
});

/**
 * A stand-in `AudioContext` as the Web Audio spec has it: `currentTime` stands still while `suspended`;
 * `getOutputTimestamp` maps the sample being heard to `performance.now()`'s milliseconds (0, 0 before any rendering).
 */
function fakeContext() {
  const listeners: (() => void)[] = [];
  const starts: { when: number; offset: number; loop: boolean }[] = [];
  const ctx = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    baseLatency: 0.01,
    outputLatency: 0.03,
    stamp: { contextTime: 0, performanceTime: 0 } as AudioTimestamp,
    destination: {},
    getOutputTimestamp() { return this.stamp; },
    addEventListener(_: string, f: () => void) { listeners.push(f); },
    createGain() { return { gain: { value: 1 }, connect() {} }; },
    createBuffer(_c: number, n: number) { return { length: n, copyToChannel() {} }; },
    createBufferSource() {
      const node = { buffer: null as unknown, loop: false, onended: null as unknown, connect() {}, disconnect() {}, stop() {},
        start(when: number, offset: number) { starts.push({ when, offset, loop: node.loop }); } };
      return node;
    },
  };
  return { ctx, starts, resume(t: number) { ctx.state = 'running'; ctx.currentTime = t; for (const f of listeners) f(); } };
}

describe('webAudioMovieOut: the page clock against a real context\'s', () => {
  it('maps a page time to the output time heard then: through getOutputTimestamp, else the latencies', () => {
    const f = fakeContext();
    let page = 7;
    const out = webAudioMovieOut(f.ctx as unknown as AudioContext, undefined, 1, () => page);
    expect(out.pageTime).toBe(7);
    f.ctx.state = 'running';
    f.ctx.currentTime = 2;
    // No stamp yet: currentTime less base and output latency, shifted by the page's difference.
    expect(out.heardAt(6)).toBeCloseTo(2 - 0.04 - 1, 9);
    f.ctx.stamp = { contextTime: 1.9, performanceTime: 6500 };
    page = 7;
    expect(out.heardAt(6)).toBeCloseTo(1.9 - 0.5, 9);
  });

  it('with a context suspended until a gesture 5 s after picture 0, the sound joins 5 s in, not at its start', () => {
    const f = fakeContext();
    let page = 100;
    const out = webAudioMovieOut(f.ctx as unknown as AudioContext, undefined, 1, () => page);
    const s = new MovieSound(out);
    s.add(piece(0, 10 * RATE));
    s.picture(0);                                     // suspended: currentTime 0, frozen
    page = 105;
    f.resume(0);                                      // the gesture; the clock carries on from where it stood
    expect(f.starts).toHaveLength(1);
    expect(f.starts[0]!.when).toBe(0);
    expect(f.starts[0]!.offset).toBeCloseTo(5 + 0.04, 9);
    expect(s.stats().mutedSeconds).toBeCloseTo(5.04, 9);
  });
});

/** A program stream: MPEG-2 packs of one PES each -- 0xBD with the substream header `FF A0 00 00`, or 0xE0. */
function pss(units: { id: number; data: Uint8Array }[]): Uint8Array {
  const parts: number[] = [];
  for (const u of units) {
    parts.push(0, 0, 1, 0xba, 0x44, 0, 4, 0, 4, 1, 0, 0, 3, 0xf8);            // a pack header, no stuffing
    const body = u.id === 0xbd ? [0xff, 0xa0, 0, 0, ...u.data] : [...u.data];
    const len = 3 + body.length;
    parts.push(0, 0, 1, u.id, len >> 8, len & 0xff, 0x80, 0, 0, ...body);   // a PES with no PTS
  }
  parts.push(0, 0, 1, 0xb9);
  return Uint8Array.from(parts);
}

/** The 40-byte SShd / SSbd header of a track of `body` PCM bytes (research 109 §2). */
function sshd(body: number): Uint8Array {
  const b = new Uint8Array(40), v = new DataView(b.buffer);
  b.set([0x53, 0x53, 0x68, 0x64]); v.setUint32(4, 24, true); v.setUint32(8, 1, true); v.setUint32(12, RATE, true);
  v.setUint32(16, 2, true); v.setUint32(20, 0x200, true); v.setUint32(24, 0xffffffff, true); v.setUint32(28, 0xffffffff, true);
  b.set([0x53, 0x53, 0x62, 0x64], 32); v.setUint32(36, body, true);
  return b;
}

describe('readMovieSound: the track read off the movie file and handed to the sound', () => {
  it('cuts the header, decodes the blocks, gives the pieces in order, then the timeline', async () => {
    // 32 KB of PCM (32 groups of 256 frames), its frame numbers as samples, in packets of 4073 bytes like the disc's.
    const groups = 32, pcm = new Uint8Array(groups * 1024), v = new DataView(pcm.buffer);
    for (let g = 0; g < groups; g++) for (let k = 0; k < 256; k++) { v.setInt16(g * 1024 + k * 2, g * 256 + k, true); v.setInt16(g * 1024 + 512 + k * 2, -(g * 256 + k), true); }
    const track = new Uint8Array(40 + pcm.length);
    track.set(sshd(pcm.length)); track.set(pcm, 40);
    const units: { id: number; data: Uint8Array }[] = [{ id: 0xe0, data: Uint8Array.of(0, 0, 1, 0xb3) }];
    for (let at = 0; at < track.length; at += 4073) units.push({ id: 0xbd, data: track.subarray(at, at + 4073) });
    const file = pss(units);
    const source: AssetSource = {
      list: async () => ['M.PSS'],
      read: async () => file,
      async *stream() { for (let at = 0; at < file.length; at += 16384) yield file.subarray(at, at + 16384); },
    };
    const r = recorder();
    const s = new MovieSound(r.out);
    const got = await readMovieSound(source, 'M.PSS', s, { pieceFrames: 2048 });
    expect(got.header?.bodySize).toBe(pcm.length);
    expect(got.frames).toBe(groups * 256);
    expect(got.priming).toMatchObject({ stoppedBy: 'end', staged: pcm.length, startsOnFirstPicture: true });
    expect(s.stats()).toMatchObject({ frames: groups * 256, whole: true });
    r.at(0);
    s.picture(0);
    const plain = r.voices.filter((x) => !x.loop);
    expect(plain.map((x) => x.first)).toEqual(plain.map((x) => Math.round(x.when * RATE)));
    expect(plain.reduce((n, x) => n + x.frames, 0)).toBe(groups * 256);
    expect(r.voices.filter((x) => x.loop)).toHaveLength(1);
  });
});
