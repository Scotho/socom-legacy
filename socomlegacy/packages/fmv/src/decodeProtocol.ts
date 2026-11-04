/**
 * The movie worker's protocol (PLAT-19b; research 120 §3): the page asks for "the next picture" of an open movie and is
 * answered with a picture -- its RGBA moved, not copied -- or the end. Both halves are here, pure: `serveMovies` is the
 * worker's side over the decoder core, `MovieClient` the page's; each takes its end of the channel as a parameter
 * (W9.R6): the viewer passes the worker's global scope to one and the `Worker` to the other. The tests join them with a
 * `MessageChannel`.
 *
 * - One movie at a time on one decoder, as the console has one (`DAT_00451cf8`, research 121 R121.1): an `open`
 *   supersedes the movie before it (its stream is aborted, the engine reset, never re-instantiated).
 * - `next` answers one picture or the end; the worker keeps `MOVIE_QUEUE_PICTURES` decoded ahead, no more.
 * - A picture's buffer travels in the transfer list. The page hands it back (`release`) once the texture holds the
 *   next one, and the worker converts later pictures into it: a few buffers circulate, none is copied.
 * - The pace is the caller's (W9.R10): `tick()` is the hand-off for a caller that presents one picture per tick of its
 *   own clock (the game's way: one picture per menu frame, research 121 R121.9); it never waits -- it answers the
 *   picture that has arrived, or null (late: the caller keeps its last picture), or the end.
 */
import { MOVIE_QUEUE_PICTURES, MovieDecoder, type MovieEnd, type PictureType } from './decodeStream';
import type { Mpeg2Engine } from './decodeEngine';
import type { PssPacket } from './pss';

/** One end of a message channel: a `Worker`, the worker's global scope, or a `MessagePort`. */
export interface MoviePort {
  postMessage(message: unknown, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  /** A `MessagePort` delivers nothing until started; a `Worker` has no `start`. */
  start?(): void;
}

/** A picture as the page receives it: the IPU's RGBA, `width * height * 4` bytes, rows top first. */
export interface MovieFrame {
  kind: 'picture';
  index: number;
  codingIndex: number | null;
  type: PictureType;
  temporalReference: number;
  pts: number | null;
  width: number;
  height: number;
  rgba: ArrayBuffer;
  /** The decoder's time for it in the worker, ms (`MoviePictureCost.decodeMs`), when the worker was given a clock (PLAT-19c). */
  decodeMs?: number;
  /** The worker's pulls of the packet stream for it (reads, demux, cut), ms (`MoviePictureCost.readMs`), with a clock. */
  readMs?: number;
  /** Pictures decoded and waiting in the worker when this one was answered (0 .. `MOVIE_QUEUE_PICTURES`), with a clock. */
  queued?: number;
}

/** The end of a movie, as the core reports it (`MovieEnd`). */
export type MovieEndMessage = MovieEnd;

/** What the page asks. `S` is the viewer's description of the disc source (its `SourceRequest`): opaque here. */
export type MovieRequest<S> =
  | { type: 'open'; movie: number; path: string; source: S; wasm: string }
  | { type: 'next'; movie: number; recycle: ArrayBuffer[] }
  | { type: 'close'; movie: number };

/** What the worker answers, one per `next`, in order. */
export type MovieReply =
  | { type: 'picture'; movie: number; frame: MovieFrame }
  | { type: 'end'; movie: number; end: MovieEndMessage };

/** What the worker's side needs from the viewer: the decoder, and a movie's packets read by range from the disc. */
export interface MovieHost<S> {
  /** The engine over `libmpeg2.wasm` at `wasm` (compiled and instantiated by the viewer). Asked once per worker, again after a failed load. */
  engine(wasm: string): Promise<Mpeg2Engine>;
  /** The PSS at `path` on the source `source` names, demuxed (`demuxPssFile`), stopping when `signal` aborts. */
  packets(source: S, path: string, signal: AbortSignal): AsyncIterable<PssPacket>;
}

const ended = (error: string | null, pictures = 0): MovieEndMessage => ({ kind: 'end', pictures, coded: 0, invalid: 0, error });

/**
 * The worker's side: answers `port`'s requests from one decoder. Returns its buffer count (`allocated`: RGBA buffers
 * made, not reused) for the tests' look at the recycling.
 */
export function serveMovies<S>(
  port: MoviePort, host: MovieHost<S>, options: { queue?: number; now?: () => number } = {},
): { stats: { allocated: number } } {
  const queue = options.queue ?? MOVIE_QUEUE_PICTURES;
  const now = options.now;
  const stats = { allocated: 0 };
  /** Returned buffers, kept up to what can be in use at once: the queue, the one in flight, the one shown. */
  const pool: ArrayBuffer[] = [];
  const alloc = (n: number): Uint8Array => {
    const k = pool.findIndex((b) => b.byteLength === n);
    if (k >= 0) return new Uint8Array(pool.splice(k, 1)[0]!);
    stats.allocated++;
    return new Uint8Array(n);
  };
  let engine: Promise<Mpeg2Engine> | null = null;
  let decoder: MovieDecoder | null = null;
  let current = -1;
  let openError: string | null = null;
  let abort: AbortController | null = null;
  let chain: Promise<void> = Promise.resolve();
  const reply = (r: MovieReply): void => {
    if (r.type === 'picture') port.postMessage(r, [r.frame.rgba]);
    else port.postMessage(r, []);
  };
  const later = (task: () => Promise<void>): void => { chain = chain.then(task).catch(() => undefined); };

  port.addEventListener('message', (event: MessageEvent) => {
    const request = event.data as MovieRequest<S>;
    if (request.type === 'open') {
      current = request.movie;
      abort?.abort(new Error('the movie was superseded'));
      const signal = (abort = new AbortController()).signal;
      later(async () => {
        if (current !== request.movie) return;
        try {
          engine ??= host.engine(request.wasm);
          const e = await engine;
          decoder ??= new MovieDecoder(e, { queue, output: 'rgba', alloc, ...(now ? { now } : {}) });
          if (current !== request.movie) return;
          openError = null;
          decoder.open(host.packets(request.source, request.path, signal));
        } catch (err) {
          openError = (err as Error).message ?? String(err);
          // A load that failed (a fetch before the wasm was served, a 404) is not cached: the next open asks again, at
          // its own URL. A loaded engine is kept (one decoder per worker).
          if (!decoder) engine = null;
          decoder?.close();
        }
      });
    } else if (request.type === 'next') {
      for (const b of request.recycle ?? []) if (pool.length < queue + 2) pool.push(b);
      later(async () => {
        if (request.movie !== current) { reply({ type: 'end', movie: request.movie, end: ended('the movie was superseded') }); return; }
        if (openError !== null || !decoder) { reply({ type: 'end', movie: request.movie, end: ended(openError ?? 'no decoder') }); return; }
        const r = await decoder.next();
        if (r.kind === 'end') { reply({ type: 'end', movie: request.movie, end: r }); return; }
        const p = r.picture;
        const rgba = p.data.byteOffset === 0 && p.data.byteLength === p.data.buffer.byteLength ? p.data.buffer as ArrayBuffer : p.data.slice().buffer;
        const frame: MovieFrame = {
          kind: 'picture', index: p.index, codingIndex: p.codingIndex, type: p.type, temporalReference: p.temporalReference, pts: p.pts, width: p.width, height: p.height, rgba,
        };
        if (p.cost) { frame.decodeMs = p.cost.decodeMs; frame.readMs = p.cost.readMs; frame.queued = decoder.queued; }
        reply({ type: 'picture', movie: request.movie, frame });
      });
    } else if (request.type === 'close') {
      if (request.movie !== current) return;
      current = -1;
      abort?.abort(new Error('the movie was closed'));
      abort = null;
      decoder?.close();
    }
  });
  port.start?.();
  return { stats };
}

/** One open movie, as the page sees it. */
export class MovieStream {
  /** Set once the movie has ended (or was closed or superseded); every later answer is this. */
  private finalEnd: MovieEndMessage | null = null;
  private recycle: ArrayBuffer[] = [];
  private readonly waiting: ((r: MovieFrame | MovieEndMessage) => void)[] = [];
  private ready: MovieFrame | MovieEndMessage | null = null;
  private pending = false;
  private stopped = false;
  /** Pictures received and not dropped by `stop`: the count a close or a supersede reports. */
  private shown = 0;

  constructor(private readonly client: { send(r: MovieRequest<unknown>, transfer: Transferable[]): void }, readonly movie: number) {}

  /** The next picture, or the end. One request, one answer, in order. */
  next(): Promise<MovieFrame | MovieEndMessage> {
    if (this.finalEnd) return Promise.resolve(this.finalEnd);
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      const recycle = this.recycle;
      this.recycle = [];
      this.client.send({ type: 'next', movie: this.movie, recycle }, recycle);
    });
  }

  /**
   * The per-tick hand-off (W9.R10): the picture that has arrived (and the next is asked for at once), null when it has
   * not yet (the caller holds its last picture and counts the tick late), or the end. Never waits.
   */
  tick(): MovieFrame | MovieEndMessage | null {
    if (this.stopped) return this.finalEnd;
    const r = this.ready;
    if (r) {
      if (r.kind === 'picture') { this.ready = null; this.prefetch(); }
      return r;
    }
    if (!this.pending) this.prefetch();
    return null;
  }

  /** A buffer the page is done with (the texture holds a newer picture): it goes back to the worker with the next request. */
  release(buffer: ArrayBuffer): void {
    if (buffer.byteLength > 0 && !this.finalEnd) this.recycle.push(buffer);
  }

  /** Stop: the worker lets the stream go; every later answer is the end. */
  close(): void {
    if (this.finalEnd) return;
    this.stop();
    this.finalEnd = ended(null, this.shown);
    this.recycle = [];
    this.client.send({ type: 'close', movie: this.movie }, []);
  }

  /** Superseded by another `open`: answered locally from now on. */
  supersede(): void {
    if (this.finalEnd) return;
    this.stop();
    this.finalEnd = ended('the movie was superseded', this.shown);
  }

  /**
   * Closed or superseded: a picture that has arrived but was not handed out (`tick`'s prefetch) is dropped, and one
   * that arrives later is not held, so the next tick is the end, never one more frame of the stopped movie.
   */
  private stop(): void {
    this.stopped = true;
    if (this.ready?.kind === 'picture') this.shown--;
    this.ready = null;
  }

  /** Whether no request of this stream waits on the worker. */
  get idle(): boolean {
    return this.waiting.length === 0;
  }

  /** @internal The worker's answer to the oldest request. */
  receive(r: MovieFrame | MovieEndMessage): void {
    if (r.kind === 'picture') this.shown++;
    else if (!this.finalEnd) this.finalEnd = r;
    this.waiting.shift()?.(r);
  }

  private prefetch(): void {
    this.pending = true;
    void this.next().then((r) => {
      this.pending = false;
      if (this.stopped) { if (r.kind === 'picture') this.shown--; return; }
      this.ready = r;
    });
  }
}

/** The page's side: opens movies on the worker at `port`, one at a time. */
export class MovieClient<S> {
  private seq = 0;
  private current: MovieStream | null = null;
  private readonly streams = new Map<number, MovieStream>();

  constructor(private readonly port: MoviePort) {
    port.addEventListener('message', (event: MessageEvent) => this.receive(event.data as MovieReply));
    port.start?.();
  }

  /** Open the PSS at `path` on `source` (the viewer's disc source), decoded by the wasm at `wasm`. Supersedes the open movie. */
  open(path: string, source: S, wasm: string): MovieStream {
    const old = this.current;
    if (old) {
      old.supersede();
      if (old.idle) this.streams.delete(old.movie);
    }
    const movie = ++this.seq;
    const stream = new MovieStream({ send: (r, t) => this.port.postMessage(r, t) }, movie);
    this.streams.set(movie, stream);
    this.current = stream;
    this.port.postMessage({ type: 'open', movie, path, source, wasm } satisfies MovieRequest<S>, []);
    return stream;
  }

  private receive(r: MovieReply): void {
    const stream = this.streams.get(r.movie);
    if (!stream) return;
    stream.receive(r.type === 'picture' ? r.frame : r.end);
    if (r.type === 'end' && stream !== this.current) this.streams.delete(r.movie);
  }
}
