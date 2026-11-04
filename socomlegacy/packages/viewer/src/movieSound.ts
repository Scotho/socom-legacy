import type { AssetSource } from '@s2u/archive';
import {
  MOVIE_AUDIO_GAIN_PLACEHOLDER, MOVIE_AUDIO_START_LATENCY_READING, SShdSplitter, demuxPssFile, movieAudioTimeline,
  primeMovieAudio, type MovieAudioPriming, type MovieAudioTimeline, type MoviePrimePacket, type SShdHeader,
} from '@s2u/fmv';
import { MoviePcmDecoder, moviePcmFloat, type MoviePcmPiece } from '@s2u/sound';

/**
 * PLAT-20 in the page (web research 137 §4-§5): a movie's sound, played as the original holds it against the
 * pictures -- started with the frame that shows picture 0 and free-running at 48000 Hz from then on, the pictures'
 * pace and PTS never consulted; the ring's last 24 KB looped after the track's end (the 989snd ring keeps playing what
 * it holds); stopped at the movie's end or close. The track is read by `readMovieSound` (PLAT-18's demuxer, the header
 * cut, `@s2u/sound`'s decoder: R3) and handed to a `MovieSound`, which schedules it on an output's clock.
 *
 * What connects it: the movie's picture sink calls `picture(index)` for each picture it presents and `stop()` at the
 * end or close (`movieRealtime.ts`'s `sound` option). The output is a `MovieSoundOut`; `webAudioMovieOut` makes one over
 * an `AudioContext` and a destination node.
 */

/**
 * **A browser adaptation, labelled** (the original has none; web research 137 §5): a browser starts no audio before a
 * user gesture, so until the output runs the movie's pictures play without their sound; when it starts running (the
 * first gesture the page's audio unlock counts), the sound joins at the frame it would be on had it started with
 * picture 0 -- in sync, never from its start. The owner's ear and this choice: HUMAN_TASKS H74.
 */
export const MOVIE_SOUND_GESTURE_ADAPTATION = 'join-in-sync-at-gesture' as const;

/**
 * **A browser adaptation, labelled** (web research 137 §5): the pictures are presented on the page's clock
 * (`performance.now`, the rAF ticks) and the sound on the output's (`AudioContext.currentTime`), which is heard its
 * output latency later (base plus output latency; tens of ms wired, over 150 ms on Bluetooth). The sound's frame 0 is
 * put at the output time *heard* when picture 0 was presented (`MovieSoundOut.heardAt`), so its first latency's worth
 * cannot be played and is counted as muted, as the gesture's silence is. The two clocks' drift is measured
 * (`MovieSoundStats.drift`) and not corrected: the original's ring runs free of the pictures and corrects none.
 */
export const MOVIE_SOUND_LATENCY_ADAPTATION = 'lead-by-output-latency' as const;

/** One voice the output plays, stoppable. */
export interface MovieSoundVoice { stop(): void }

/**
 * Where the movie's sound goes: an output with a clock in seconds that may not run until a gesture -- and, like an
 * `AudioContext`'s, stands still while it does not run -- beside the page's clock, which always runs.
 */
export interface MovieSoundOut {
  readonly running: boolean;
  /** The output's clock, seconds; it does not advance while the output is not running. */
  readonly currentTime: number;
  /** The page's clock, seconds (the pictures' clock: `performance.now`); it runs before the gesture. */
  readonly pageTime: number;
  /** The output time whose sample is heard at page time `pageTime` (latency included). Valid while running. */
  heardAt(pageTime: number): number;
  /** Calls `run` each time the output starts running. */
  onRunning(run: () => void): void;
  /** Plays `piece` from `offset` seconds into it at the output's time `when`; `loop` plays it round and round. */
  play(piece: { left: Float32Array; right: Float32Array; rate: number }, when: number, offset: number, loop: boolean): MovieSoundVoice;
}

export interface MovieSoundStats {
  /** The sound's frame 0 on the output's clock (heard when picture 0 was shown), or null before the output ran or after the stop. */
  startTime: number | null;
  /** The output's time when the sound first joined after picture 0 (the start itself when it already ran), or null. */
  joinedAt: number | null;
  /** The sound's seconds not heard at the start: before the output ran, and its latency (the browser adaptations). */
  mutedSeconds: number;
  /** Seconds the sound's clock has run ahead of the pictures' since frame 0 was placed (measured, not corrected), or null. */
  drift: number | null;
  /** Pieces that came after their time with the output running, and the seconds of sound lost to them. */
  underruns: number;
  lateSeconds: number;
  /** Frames received, and whether the track is whole. */
  frames: number;
  whole: boolean;
  /** Voices started since the start. */
  voices: number;
}

const RATE_DEFAULT = 48000;

/** A movie's sound on an output (research 137 §4): see the file's header. */
export class MovieSound {
  private readonly pieces: MoviePcmPiece[] = [];
  /** Each piece scheduled since the start, and its voice (null when nothing of it was left to play). */
  private readonly scheduled = new Map<MoviePcmPiece, MovieSoundVoice | null>();
  private voices: MovieSoundVoice[] = [];
  private tl: MovieAudioTimeline | null = null;
  private tailPlaying = false;
  /** Picture 0's time on the page's clock. */
  private p0: number | null = null;
  private t0: number | null = null;
  private joined: number | null = null;
  /** The output's time when frame 0 was last placed: what is past then is not an underrun. */
  private since = 0;
  private muted = 0;
  private underruns = 0;
  private late = 0;
  private started = 0;
  private frames = 0;

  constructor(private readonly out: MovieSoundOut, private readonly rate = RATE_DEFAULT) {
    out.onRunning(() => this.join());
  }

  /** A decoded piece of the track (in order). */
  add(piece: MoviePcmPiece): void {
    this.pieces.push(piece);
    this.frames = Math.max(this.frames, piece.frame + piece.left.length);
    this.schedule(piece);
  }

  /** The track is whole: its timeline (`movieAudioTimeline`) -- what the ring receives, and its tail. */
  finish(tl: MovieAudioTimeline): void {
    this.tl = tl;
    // A piece scheduled before the timeline came is cut to it: past the moved frames nothing plays (and nothing at all
    // for a track that never fills the ring).
    for (const [p, v] of [...this.scheduled]) {
      if (p.frame + p.left.length <= tl.frames) continue;
      v?.stop();
      this.scheduled.delete(p);
      this.schedule(p, false);
    }
    this.tail();
  }

  /** A picture presented: picture 0 starts the sound (again, on a restart), on the same frame (`FUN_0030b1d0`). */
  picture(index: number): void {
    if (index !== 0) return;
    this.halt();
    this.p0 = this.out.pageTime;
    this.t0 = null;
    this.joined = null;
    this.muted = 0;
    this.underruns = 0;
    this.late = 0;
    this.started = 0;
    if (this.out.running) this.place();
  }

  /** The movie's end (the NODATA tick) or its close: the sound stops (`FUN_0030a6e0`). */
  stop(): void {
    this.halt();
    this.p0 = null;
    this.t0 = null;
  }

  stats(): MovieSoundStats {
    return {
      startTime: this.t0, joinedAt: this.joined, mutedSeconds: this.muted, underruns: this.underruns,
      lateSeconds: this.late, frames: this.frames, whole: this.tl !== null, voices: this.started, drift: this.drift(),
    };
  }

  private drift(): number | null {
    if (this.t0 === null || this.p0 === null || !this.out.running) return null;
    const page = this.out.pageTime;
    return this.out.heardAt(page) - this.t0 + MOVIE_AUDIO_START_LATENCY_READING - (page - this.p0);
  }

  private halt(): void {
    for (const v of this.voices) v.stop();
    this.voices = [];
    this.scheduled.clear();
    this.tailPlaying = false;
  }

  /**
   * Frame 0 placed on the output's clock: the output time heard when picture 0 was shown, from the page's clock (the
   * output's stood still while it did not run). Each time the output starts running again it is placed afresh, as its
   * clock may have stood still in between.
   */
  private place(): void {
    if (this.p0 === null) return;
    this.halt();
    this.since = this.out.currentTime;
    this.t0 = this.out.heardAt(this.p0) + MOVIE_AUDIO_START_LATENCY_READING;
    if (this.joined === null) {
      this.joined = this.since;
      this.muted = Math.max(0, this.since - this.t0);
    }
    this.scheduleAll();
  }

  /** The output ran: the browser adaptation's join, in sync. */
  private join(): void {
    this.place();
  }

  private scheduleAll(): void {
    for (const p of this.pieces) this.schedule(p);
    this.tail();
  }

  /** A piece at picture 0's time plus its frame; a part already past is skipped, and counted late if the output ran then. */
  private schedule(p: MoviePcmPiece, count = true): void {
    if (this.t0 === null || !this.out.running || this.scheduled.has(p)) return;
    this.scheduled.set(p, null);
    let n = p.left.length;
    if (this.tl) n = Math.min(n, this.tl.frames - p.frame);
    if (n <= 0) return;
    const now = this.out.currentTime;
    const due = this.t0 + p.frame / this.rate, end = due + n / this.rate;
    const lost = Math.min(now, end) - Math.max(due, this.since);
    if (count && lost > 0) { this.underruns++; this.late += lost; }
    if (end <= now) return;
    const offset = Math.max(0, now - due);
    this.scheduled.set(p, this.play(p.left.subarray(0, n), p.right.subarray(0, n), Math.max(now, due), offset, false));
  }

  /** After the track's last moved frame, the ring's last `loopFrames` frames round and round, at their phase. */
  private tail(): void {
    const tl = this.tl;
    if (!tl || tl.frames === 0 || this.t0 === null || !this.out.running || this.tailPlaying) return;
    const from = tl.frames - tl.loopFrames;
    const left = new Int16Array(tl.loopFrames), right = new Int16Array(tl.loopFrames);
    for (const p of this.pieces) {
      const a = Math.max(from, p.frame), b = Math.min(tl.frames, p.frame + p.left.length);
      if (b <= a) continue;
      left.set(p.left.subarray(a - p.frame, b - p.frame), a - from);
      right.set(p.right.subarray(a - p.frame, b - p.frame), a - from);
    }
    this.tailPlaying = true;
    const start = this.t0 + tl.frames / this.rate, lap = tl.loopFrames / this.rate, now = this.out.currentTime;
    const offset = now > start ? (now - start) % lap : 0;
    this.play(left, right, Math.max(now, start), offset, true);
  }

  private play(left: Int16Array, right: Int16Array, when: number, offset: number, loop: boolean): MovieSoundVoice {
    const v = this.out.play({ left: moviePcmFloat(left), right: moviePcmFloat(right), rate: this.rate }, when, offset, loop);
    this.voices.push(v);
    this.started++;
    return v;
  }
}

/**
 * A `MovieSoundOut` over Web Audio: a gain (`MOVIE_AUDIO_GAIN_PLACEHOLDER`) into `destination`, a buffer source a
 * piece. The page's clock is `pageNow` (seconds; `performance.now`, the pictures' clock); `heardAt` maps it to the
 * context's through `getOutputTimestamp` (the sample being heard and the `performance.now` it was heard at), or, before
 * the context has rendered one (both 0) or without it, through `currentTime` less `baseLatency` and `outputLatency`.
 */
export function webAudioMovieOut(
  ctx: AudioContext, destination: AudioNode = ctx.destination, gain = MOVIE_AUDIO_GAIN_PLACEHOLDER,
  pageNow: () => number = () => performance.now() / 1000,
): MovieSoundOut {
  const level = ctx.createGain();
  level.gain.value = gain;
  level.connect(destination);
  const runs: (() => void)[] = [];
  ctx.addEventListener('statechange', () => { if (ctx.state === 'running') for (const r of runs) r(); });
  return {
    get running() { return ctx.state === 'running'; },
    get currentTime() { return ctx.currentTime; },
    get pageTime() { return pageNow(); },
    heardAt(page) {
      const stamp = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
      if (stamp?.contextTime && stamp.performanceTime) return stamp.contextTime + page - stamp.performanceTime / 1000;
      return ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0) + page - pageNow();
    },
    onRunning: (run) => { runs.push(run); },
    play(piece, when, offset, loop) {
      const buffer = ctx.createBuffer(2, piece.left.length, piece.rate);
      buffer.copyToChannel(piece.left as Float32Array<ArrayBuffer>, 0);
      buffer.copyToChannel(piece.right as Float32Array<ArrayBuffer>, 1);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = loop;
      node.connect(level);
      node.onended = () => node.disconnect();
      node.start(when, offset);
      return { stop: () => { try { node.stop(); } catch { /* ended */ } node.disconnect(); } };
    },
  };
}

export interface MovieSoundRead {
  header: SShdHeader | null;
  /** Frames handed to the sound. */
  frames: number;
  /** The create's priming over the stream's first packets (`primeMovieAudio`): whether the sound starts with picture 0. */
  priming: MovieAudioPriming | null;
}

/** The packets the priming is judged on: it stops within the first 60 on every disc movie (research 137 R137.3). */
const PRIME_PACKETS = 256;

/**
 * Reads `path`'s sound track from `source` (a second read of the file beside the picture worker's) and hands it to
 * `sound` in pieces of about `pieceFrames` frames as it comes, then its timeline. The page plays from picture 0 on
 * whatever has come; a piece that comes after its time is an underrun (`MovieSound.stats`).
 */
export async function readMovieSound(source: AssetSource, path: string, sound: MovieSound, o: { signal?: AbortSignal; pieceFrames?: number } = {}): Promise<MovieSoundRead> {
  const split = new SShdSplitter();
  const pieceFrames = o.pieceFrames ?? RATE_DEFAULT;
  const early: MoviePrimePacket[] = [];
  let priming: MovieAudioPriming | null = null;
  let dec: MoviePcmDecoder | null = null;
  let batch: MoviePcmPiece[] = [], batchFrames = 0, frames = 0, pcmBytes = 0;
  const flush = (): void => {
    if (batchFrames === 0) return;
    const left = new Int16Array(batchFrames), right = new Int16Array(batchFrames);
    let at = 0;
    for (const p of batch) { left.set(p.left, at); right.set(p.right, at); at += p.left.length; }
    sound.add({ frame: batch[0]!.frame, left, right });
    frames += batchFrames;
    batch = [];
    batchFrames = 0;
  };
  for await (const p of demuxPssFile(source, path, o.signal ? { signal: o.signal } : {})) {
    if (!priming) {
      early.push({ streamId: p.streamId, length: p.data.length, ...(p.subStream ? { subStream: p.subStream.slice() } : {}) });
      if (early.length >= PRIME_PACKETS) priming = primeMovieAudio(early);
    }
    if (p.streamId !== 0xbd) continue;
    const pcm = split.push(p.data);
    if (!split.header) continue;
    dec ??= new MoviePcmDecoder(split.header);
    pcmBytes += pcm.length;
    const piece = dec.push(pcm);
    if (!piece) continue;
    batch.push(piece);
    batchFrames += piece.left.length;
    if (batchFrames >= pieceFrames) flush();
  }
  flush();
  priming ??= primeMovieAudio(early);
  if (split.header) sound.finish(movieAudioTimeline(pcmBytes, split.header));
  return { header: split.header, frames, priming };
}
