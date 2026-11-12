import type { AssetSource } from '@s2u/archive';
import {
  MOVIE_END, MOVIE_PENDING, MovieWorkerSource,
  type MovieFrame, type MovieNext, type MovieOpenOptions, type MoviePictureSource, type MovieStreamHandle,
} from '@s2u/fmv';
import type { Rgba } from '@s2u/gs';
import type { MoviePicture } from '@s2u/ui';
import type { WebAudioOut } from './audio';
import { EXTRACTED_GONE_WORDS, ExtractedMissError } from './discExtractSource';
import { movieOpens, STORED_GONE } from './discStored';
import { startMovieWorker } from './movieTexture';
import { MovieSound, MovieSoundKeep, readMovieSound, webAudioMovieOut, type MovieSoundOut, type MovieSoundStats } from './movieSound';
import type { SourceRequest } from './worker';

/**
 * The front end's movies from the disc (MOVIE-WIRE, 2026-10-03; research 120 §11, research 137 §5): what
 * `mountFrontEnd` hands its `FrontEndSession` so the opener's movies -- SONY448 behind `dlgIntroCinematic`, INTRO_2
 * behind `dlgSecondCinematic`, MENULOOP behind `dlgMenu` -- play as decoded pictures with their sound, not as the black
 * stand-in. Nothing here is new behaviour: the pictures are PLAT-19c's `MovieWorkerSource` over PLAT-19b's worker (one
 * picture a tick of PLAT-12's 29.97 Hz clock, a late tick held: research 121 §15), the sound is PLAT-20's
 * `MovieSound` (started with picture 0, free-running; `MOVIE_SOUND_GESTURE_ADAPTATION`,
 * `MOVIE_SOUND_LATENCY_ADAPTATION`), and the loop of a `MPEG_LOOPING` background is PLAT-21's player's. This file
 * connects them:
 *
 * - `movieFramePicture`: a presented picture (`MovieLayer`'s `MoviePicture`, its `image` the worker's `MovieFrame`) as
 *   the `Rgba` PLAT-14's drawer copies (`rasterizeUiDrawList`'s `movie` option) -- a view on the frame's own buffer.
 * - `SoundedMovieSource`: the picture source the session's movie host is given, which tells the sound each picture
 *   presented and the end and close (the same calls `movieRealtime.ts`'s `sound` option makes).
 * - `MovieSoundFeed`: `readMovieSound` for each movie the host opens, into a fresh `MovieSound`, one movie at a time.
 * - `frontEndMovies`: the three over the served tree, the worker started with the first movie.
 */

/** A presented movie picture as the drawer's `Rgba`: the `MovieFrame`'s RGBA, no copy; null (black) when it has none. */
export function movieFramePicture(picture: MoviePicture): Rgba | null {
  const f = picture.image as Partial<MovieFrame> | null;
  const buf = f?.rgba;
  if (!f || !buf || typeof f.width !== 'number' || typeof f.height !== 'number') return null;
  const bytes = f.width * f.height * 4;
  // A buffer handed back to the worker is detached (0 bytes): never drawn after its successor is out, but held black.
  if (buf.byteLength < bytes) return null;
  return { width: f.width, height: f.height, data: new Uint8ClampedArray(buf, 0, bytes) };
}

/**
 * A movie's name as the dialogs write it (`run/movies/common/sony448.pss`) as the disc's path: forward slashes, no
 * leading slash, upper case. The disc's ISO 9660 names are upper case and its lookups ignore case (the ISO source's
 * `clean`, `@s2u/archive`); the served tree keeps the disc's names and an HTTP server's paths do not ignore case.
 */
export function discPath(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\/+/, '').toUpperCase();
}

/** What a movie's sound is told by its picture source. */
export interface MovieSoundTrack {
  /** The movie `name` opened: its sound read and readied. */
  open(name: string): void;
  /** A picture presented (picture 0 starts the sound, again on a restart: `MovieSound.picture`). */
  picture(index: number): void;
  /** The movie's end (the NODATA tick): the sound stops (`FUN_0030a6e0`, research 137 §4). */
  stop(): void;
  /** The movie closed: its sound stopped and its read let go. */
  close(): void;
}

/**
 * PLAT-21's picture source with PLAT-20's sound beside it: every call goes to `pictures`; the sound hears of the open,
 * each picture handed out (the player presents every one it gets, on the same tick), the end and the close.
 */
export class SoundedMovieSource implements MoviePictureSource<MovieFrame> {
  private live = false;
  private name: string | null = null;
  /** `onEnd`: the movie's end, with the open's name (the page logs a worker's error there). */
  constructor(readonly pictures: MoviePictureSource<MovieFrame>, private readonly sound: MovieSoundTrack, private readonly onEnd?: (name: string) => void) {}

  open(name: string, options: MovieOpenOptions): boolean {
    const ok = this.pictures.open(name, options);
    if (ok) this.sound.open(name);
    else if (this.live) this.sound.close();                      // the open closed the movie before it
    this.live = ok;
    this.name = ok ? name : null;
    return ok;
  }

  next(): MovieNext<MovieFrame> {
    const n = this.pictures.next();
    if (n === MOVIE_END) {
      if (this.live) this.sound.stop();
      if (this.name !== null) this.onEnd?.(this.name);
    }
    else if (n !== MOVIE_PENDING) this.sound.picture(n.index);
    return n;
  }

  restart(): void { this.pictures.restart(); }

  close(): void {
    this.pictures.close();
    if (this.live) this.sound.close();
    this.live = false;
  }
}

export interface MovieSoundFeedOptions {
  /** Where the movies are read from: the served tree (the same files the worker decodes). */
  assets: AssetSource;
  /** The output, or null while there is none (the front end's audio not made: it then runs silent). Asked at each open until one comes. */
  out: () => MovieSoundOut | null;
  /** The live Dialog tuner (PCM group 2), read before playback and each front-end frame. */
  volume?: () => number;
  /** The file a movie's name reads (`discPath` on the page); absent, the name itself. */
  path?: (name: string) => string;
  /** The track's reader; `readMovieSound` by default (a test passes its own). */
  read?: typeof readMovieSound;
  /**
   * GM-32: the decoded track kept across opens (`MOVIE_SOUND_KEEP_ADAPTATION`), in front of `read`: an open of the file
   * read whole last hands its pieces again instead of reading and decoding it anew. Absent, the feed's own.
   */
  keep?: MovieSoundKeep;
  /** A read that failed (not one aborted by a close). */
  onError?: (path: string, e: unknown) => void;
}

/**
 * PLAT-20's sound for the movie the host has open: at each open a fresh `MovieSound` on the output, fed by
 * `readMovieSound` (a second read of the file beside the worker's, research 137 §5); the open before it aborted and
 * stopped. The output's "now running" (the first gesture) is passed to the open movie's sound only, which joins in
 * sync then (`MOVIE_SOUND_GESTURE_ADAPTATION`).
 */
export class MovieSoundFeed implements MovieSoundTrack {
  /** The open movie's sound and its read, or null. */
  current: { name: string; sound: MovieSound; abort: AbortController } | null = null;
  private base: MovieSoundOut | null = null;
  private relay: (() => void) | null = null;
  /** GM-32: the keep (`MOVIE_SOUND_KEEP_ADAPTATION`) and the reader behind it. */
  readonly keep: MovieSoundKeep;
  private readonly read: typeof readMovieSound;

  constructor(private readonly o: MovieSoundFeedOptions) {
    this.keep = o.keep ?? new MovieSoundKeep();
    this.read = this.keep.reader(o.read ?? readMovieSound);
  }

  open(name: string): void {
    this.close();
    const base = this.output();
    if (!base) return;
    const abort = new AbortController();
    const sound = new MovieSound(this.view(base));
    this.current = { name, sound, abort };
    this.read(this.o.assets, this.o.path?.(name) ?? name, sound, { signal: abort.signal })
      .catch((e: unknown) => { if (!abort.signal.aborted) this.o.onError?.(name, e); });
  }

  refreshVolume(): void { this.base?.setVolume?.(this.o.volume?.() ?? 1); }

  picture(index: number): void { this.current?.sound.picture(index); }

  stop(): void { this.current?.sound.stop(); }

  close(): void {
    const c = this.current;
    if (!c) return;
    this.current = null;
    this.relay = null;
    c.abort.abort();
    c.sound.stop();
  }

  /** The open movie's sound's counts (`MovieSound.stats`), or null. */
  stats(): (MovieSoundStats & { movie: string }) | null {
    return this.current ? { movie: this.current.name, ...this.current.sound.stats() } : null;
  }

  private output(): MovieSoundOut | null {
    if (!this.base) {
      this.base = this.o.out();
      this.base?.onRunning(() => this.relay?.());
    }
    this.refreshVolume();
    return this.base;
  }

  /** The output as one movie's sound sees it: its "now running" is the open movie's alone. */
  private view(base: MovieSoundOut): MovieSoundOut {
    return {
      get running() { return base.running; },
      get currentTime() { return base.currentTime; },
      get pageTime() { return base.pageTime; },
      heardAt: (page) => base.heardAt(page),
      onRunning: (run) => { this.relay = run; },
      play: (piece, when, offset, loop) => base.play(piece, when, offset, loop),
    };
  }
}

/** PLAT-19b's worker as the front end uses it: its client's open, the decoder's address, its end. */
export interface MovieWorkerHandle {
  client: { open(path: string, source: SourceRequest, wasm: string): MovieStreamHandle };
  wasm: string;
  terminate(): void;
}

/** The page's worker (`movieTexture.ts`'s `startMovieWorker`). */
export function pageMovieWorker(): MovieWorkerHandle {
  const { worker, client, wasm } = startMovieWorker();
  return { client, wasm, terminate: () => { worker.terminate(); } };
}

/**
 * The `AudioContext` and the master gain of the front end's own `GameAudio` output, once it has made them (the first
 * `prepare`, `unlockOn`'s), so the movie's sound shares the page's unlock and master volume (research 137 §5).
 * `WebAudioOut` keeps both private and `audio.ts` is a hot file this task did not claim: they are read here by name, a
 * stand-in for the getter research 137 §7 asks of `audio.ts` (owed).
 */
export function webAudioOutContext(out: WebAudioOut): { ctx: AudioContext; destination: AudioNode } | null {
  const o = out as unknown as { ctx?: AudioContext | null; master?: GainNode | null };
  if (!o.ctx) return null;
  return { ctx: o.ctx, destination: o.master ?? o.ctx.destination };
}

/** What `frontEndMovies` gives the session, the page's hook and the mount's stop. */
export interface FrontEndMovies {
  /** The session's source (`FrontEndSessionOptions.source`). */
  source: SoundedMovieSource;
  /** PLAT-19c's source under it: its `budgets` are the movies' meters. */
  pictures: MovieWorkerSource;
  /** PLAT-20's feed. */
  sound: MovieSoundFeed;
  /** The worker stopped, the sound closed. */
  stop(): void;
  /**
   * PR #631 (a browser adaptation, scoped to the Xbox preset by the page, `./frontEndSleep`): the worker ended if no
   * movie's stream is open on it -- its WASM heap and frame pool let go under a match -- and nothing else (the source,
   * the sound, the last picture a dialog holds, kept). The next open or restart makes a fresh worker. Answers whether no
   * worker is left; false, a movie is open (playing, pending or at its end) and everything is left as it is.
   */
  sleep(): boolean;
}

export interface FrontEndMoviesOptions {
  /** The served tree (the worker reads the movies from it by range). */
  source: SourceRequest;
  /** The same tree as an `AssetSource` (the sound's second read). */
  assets: AssetSource;
  /** The worker, made at the first movie's open. */
  worker: () => MovieWorkerHandle;
  /** The sound's output (`MovieSoundFeedOptions.out`). */
  out: () => MovieSoundOut | null;
  /** The live Dialog tuner (PCM group 2), read before playback and each front-end frame. */
  volume?: () => number;
  /** The page's clock, ms (`performance.now`): the budget's. */
  now: () => number;
  onError?: (path: string, e: unknown) => void;
}

/**
 * The front end's movie source over the served tree: PLAT-19c's pictures with PLAT-20's sound.
 *
 * DX-3 (FI.R6, the merge controller's ruling): over the disc's read set kept in this browser (`{ kind: 'stored' }`) with
 * no disc opened on this visit, a movie the set cuts (the EXTRAS' content, the AOP intros) does not open
 * (`./discStored` `movieOpens`, PLAT-19c's `exists`): the open fails at once, as the original's does for a file not on
 * the disc (`FUN_003098e0`), so the session's movie host ends it on its own path -- the movie state closes and pops on
 * its first tick (the close and pop a Cross skip ends in), a dialog's background gets its event 3 -- with no worker read,
 * no black picture and no error. With the disc there, it plays from the disc (the stored source's fallback).
 */
export function frontEndMovies(o: FrontEndMoviesOptions): FrontEndMovies {
  let worker: MovieWorkerHandle | null = null;
  // PR #631 (`sleep`): the stream open on the worker, until the picture source closes it (one at a time: its open and
  // restart close the one before).
  let open: MovieStreamHandle | null = null;
  const exists = movieOpens(o.source);
  const pictures = new MovieWorkerSource({
    open: (name) => {
      worker ??= o.worker();
      const stream = worker.client.open(discPath(name), o.source, worker.wasm);
      open = stream;
      return { tick: () => stream.tick(), release: (b) => { stream.release(b); }, close: () => { if (open === stream) open = null; stream.close(); } };
    },
    now: o.now,
    ...(exists ? { exists } : {}),
  });
  const sound = new MovieSoundFeed({ assets: o.assets, out: o.out, ...(o.volume ? { volume: o.volume } : {}), path: discPath, ...(o.onError ? { onError: o.onError } : {}) });
  // A worker's error (no decoder served, a file that would not read) ends the movie at once, as a failed open ends the
  // original's (event 3); the page says why.
  const source = new SoundedMovieSource(pictures, sound, (name) => {
    const error = pictures.lastEnd?.error ?? null;
    if (error) o.onError?.(name, error);
  });
  return {
    source, pictures, sound,
    // GM-32 review F1: the stop and the sleep (the hand-off to a match) let the kept track go (`MOVIE_SOUND_KEEP_ADAPTATION`):
    // its PCM is not held through a match or past the page; the return after decodes the file afresh.
    stop: () => { source.close(); worker?.terminate(); worker = null; open = null; sound.keep.clear(); },
    sleep: () => {
      sound.keep.clear();
      if (open) return false;
      worker?.terminate();
      worker = null;
      return true;
    },
  };
}

/**
 * LATER 67 (a browser adaptation; the merge controller's call, product track): the page's line when a kept movie is
 * gone from this browser's storage mid-session -- the launcher's CHECK DISC chip and its evicted words
 * (`./discStart` `EVICTED_LINE`), and where the disc is chosen again.
 */
export const MOVIE_GONE_LINE = 'CHECK DISC: this browser cleared the disc it kept -- choose it again in the launcher.';

/**
 * The line for a movie's failure, or null: only a kept file gone from storage (`ExtractedMissError` `gone`, or its words
 * as the movie's worker hands them back -- a string, `@s2u/fmv`'s decode stream posting the error's message, the
 * pictures' `lastEnd.error`: the review's F1) or the whole kept extraction gone (`./discStored` `STORED_GONE`, which the
 * worker's own stored source meets at its first movie). A movie outside the kept set is cut by design (`outside`) and
 * says nothing, as any other failure.
 */
export function movieMissLine(e: unknown): string | null {
  if (e instanceof ExtractedMissError) return e.reason === 'gone' ? MOVIE_GONE_LINE : null;
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : null;
  if (message === null) return null;
  return message.includes(EXTRACTED_GONE_WORDS) || message.includes(STORED_GONE) ? MOVIE_GONE_LINE : null;
}

/** The movies' error hook's half that tells the page (`show`), once a session, at the first failure with a line. */
export function movieMissTeller(show: (line: string) => void): (e: unknown) => void {
  let told = false;
  return (e) => {
    if (told) return;
    const line = movieMissLine(e);
    if (line === null) return;
    told = true;
    show(line);
  };
}

/** A `MovieSoundOut` over the front end's `WebAudioOut`, once its context exists (`webAudioMovieOut`). */
export function frontEndMovieOut(out: WebAudioOut): () => MovieSoundOut | null {
  return () => {
    const c = webAudioOutContext(out);
    return c ? webAudioMovieOut(c.ctx, c.destination) : null;
  };
}
