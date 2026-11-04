/**
 * The decoder core (PLAT-19b; research 120 §2-§4): a movie's PSS packets (PLAT-18's `demuxPss`) in, pictures out in
 * display order, each with its coding index, coding type, temporal reference and PTS -- pulled one at a time, with a
 * bounded queue between the decoder and the caller, the end and any error reported as the last answer.
 *
 * The video elementary stream is cut at its picture start codes and fed one coded picture per feed, tagged with its
 * coding index (`mpeg2_tag_picture`): research 98 §7.8's way of proving count and order, kept in the page so that
 * every displayed picture names the coded picture it is. The PES PTS goes with the picture whose start code is the
 * first to begin in that packet (ISO/IEC 13818-1 clause 2.4.3, the PES semantics of PTS).
 *
 * Pure (W6.R2, W9.R6): no clock of its own, no worker, no browser global. The decoder enters as an `Mpeg2Engine`, the
 * packets as an `AsyncIterable`, the output buffers through an optional allocator (the worker's pool of returned
 * buffers), and -- for PLAT-19c's budget only -- a clock as an optional `now()` (research 120 §11).
 */
import { ipuCscRgba } from './ipuCsc';
import type { Mpeg2Engine, EnginePicture } from './decodeEngine';
import type { PssPacket } from './pss';

export type PictureType = 'I' | 'P' | 'B' | 'D' | '?';
export type PictureStructure = 'top' | 'bottom' | 'frame';

const TYPES: PictureType[] = ['?', 'I', 'P', 'B', 'D', '?', '?', '?'];
const STRUCTURES: (PictureStructure | undefined)[] = [undefined, 'top', 'bottom', 'frame'];

/** The video stream ids of a program stream (13818-1 Table 2-18): 0xE0-0xEF. The disc's movies use 0xE0 (research 109). */
const isVideo = (id: number): boolean => id >= 0xe0 && id <= 0xef;

/**
 * The picture coding extension that follows a picture header, if the next start code after `from` is one: `00 00 01
 * B5` with extension id 8 (13818-2 clause 6.2.3, picture_coding_extension), whose third byte ends in picture_structure (1 top field, 2 bottom field,
 * 3 frame). Undefined when the next start code is another (an MPEG-1 picture has no extension) or is not in `b`.
 */
export function pictureStructureAt(b: Uint8Array, from: number): PictureStructure | undefined {
  for (let i = from; i + 6 < b.length; i++) {
    if (b[i] !== 0 || b[i + 1] !== 0 || b[i + 2] !== 1) continue;
    if (b[i + 3] !== 0xb5 || b[i + 4]! >> 4 !== 8) return undefined;
    return STRUCTURES[b[i + 6]! & 3];
  }
  return undefined;
}

/**
 * The picture header at `at` (`00 00 01 00`, 13818-2 6.2.3): temporal_reference (10 bits), picture_coding_type
 * (3 bits), and the structure from the picture coding extension after it, when there is one.
 */
export function readPictureHeader(b: Uint8Array, at: number): { temporalReference: number; type: PictureType; structure?: PictureStructure } {
  const b4 = b[at + 4] ?? 0, b5 = b[at + 5] ?? 0;
  const out: { temporalReference: number; type: PictureType; structure?: PictureStructure } = {
    temporalReference: (b4 << 2) | (b5 >> 6), type: TYPES[(b5 >> 3) & 7]!,
  };
  const structure = pictureStructureAt(b, at + 4);
  if (structure) out.structure = structure;
  return out;
}

/** A piece of the elementary stream the core feeds at once: one coded picture, or the headers before the first. */
export interface CodedUnit {
  bytes: Uint8Array;
  /** The coded picture's index in coding order (0, 1, ...), or null for the bytes before the first picture start code. */
  codingIndex: number | null;
  header?: { temporalReference: number; type: PictureType; structure?: PictureStructure };
  /** The PTS (90 kHz) of the PES packet in which this picture's start code is the first to begin, if it carried one. */
  pts?: number;
}

/**
 * The elementary stream cut at its picture start codes (`00 00 01 00`; the standard keeps the prefix out of coded data,
 * so a match is a header). A unit is complete when the next picture's start code arrives, or at `end`. Holds the unit
 * in hand and the packet that completes it, no more.
 */
export class CodedPictureSplitter {
  /** The largest the buffer has been, in bytes. */
  highWater = 0;
  /** Coded pictures emitted so far. */
  coded = 0;
  private buf = new Uint8Array(4096);
  private len = 0;
  /** The stream offset of buf[0]. */
  private base = 0;
  /** Where the next scan for a start code begins, in the buffer. */
  private scan = 0;
  /** Whether buf[0] opens a picture start code (else it holds the headers before the first picture). */
  private opensPicture = false;
  /** The PTS of the packets still in the buffer, by their extent in the stream; `used` once a picture has taken it. */
  private stamps: { from: number; to: number; pts: number; used: boolean }[] = [];
  /** The PTS each unit in hand will carry (decided when its start code is found). */
  private unitPts: number | undefined;

  /** Append a video payload (`pts` from its PES header) and return the units it completes. */
  push(data: Uint8Array, pts?: number): CodedUnit[] {
    const from = this.base + this.len;
    if (pts !== undefined && data.length > 0) this.stamps.push({ from, to: from + data.length, pts, used: false });
    this.append(data);
    const out: CodedUnit[] = [];
    const b = this.buf;
    for (let i = this.scan; i + 3 < this.len; i++) {
      if (b[i + 2]! > 1) { i += 2; continue; }                       // no prefix can end here: skip ahead
      if (b[i] !== 0 || b[i + 1] !== 0 || b[i + 2] !== 1 || b[i + 3] !== 0) continue;
      if (i === 0 && !this.opensPicture && this.coded === 0 && this.base === 0) {
        // The stream opens on a picture start code: no header unit before it.
        this.opensPicture = true;
        this.unitPts = this.takeStamp(this.base);
        continue;
      }
      if (i === 0) continue;
      out.push(this.cut(i));
      this.opensPicture = true;
      this.unitPts = this.takeStamp(this.base);
      i = 3;   // the loop's i++ moves to 4: past this start code, in the compacted buffer
    }
    this.scan = Math.max(0, this.len - 3);
    if (this.opensPicture) this.scan = Math.max(this.scan, 4);
    return out;
  }

  /** The stream is over: the unit in hand, if any. */
  end(): CodedUnit | null {
    if (this.len === 0) return null;
    const u = this.cut(this.len);
    this.opensPicture = false;
    return u;
  }

  /** Emit buf[0, at) as a unit and keep the rest. */
  private cut(at: number): CodedUnit {
    const bytes = this.buf.slice(0, at);
    const unit: CodedUnit = { bytes, codingIndex: null };
    if (this.opensPicture) {
      unit.codingIndex = this.coded++;
      unit.header = readPictureHeader(bytes, 0);
      if (this.unitPts !== undefined) unit.pts = this.unitPts;
    }
    this.unitPts = undefined;
    this.buf.copyWithin(0, at, this.len);
    this.len -= at;
    this.base += at;
    this.scan = 0;
    // Stamps wholly before the new start are spent.
    this.stamps = this.stamps.filter((s) => s.to > this.base);
    return unit;
  }

  /** The PTS of the packet holding stream offset `at`, if no picture has taken it yet (13818-1 clause 2.4.3, PTS). */
  private takeStamp(at: number): number | undefined {
    const s = this.stamps.find((x) => x.from <= at && at < x.to);
    if (!s || s.used) return undefined;
    s.used = true;
    return s.pts;
  }

  private append(data: Uint8Array): void {
    if (this.len + data.length > this.buf.length) {
      const next = new Uint8Array(Math.max(this.len + data.length, this.buf.length * 2));
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    this.buf.set(data, this.len);
    this.len += data.length;
    this.highWater = Math.max(this.highWater, this.len);
  }
}

/**
 * How many decoded pictures the core keeps ahead of its caller: 3. Not a value of the game's -- the console decodes
 * a picture when its tick asks for one (`sceMpegGetPicture`, research 121 R121.9) -- but this port's bound on decoding
 * ahead across a worker: enough to cover the round trip and a late tick, small enough that a 640x448 movie holds
 * 3 x 1,146,880 B of RGBA (research 120 §4). The worker must not decode the whole movie ahead.
 */
export const MOVIE_QUEUE_PICTURES = 3;

/** A decoded picture, in display order. */
export interface MoviePicture {
  /** Display order, 0 for the movie's first picture. */
  index: number;
  /** The coded picture it is (its tag), in coding order; null if the decoder returned it untagged. */
  codingIndex: number | null;
  type: PictureType;
  temporalReference: number;
  /** Its PES PTS (90 kHz), or null when its packet carried none. */
  pts: number | null;
  width: number;
  height: number;
  /** `yuv420p`: Y, Cb, Cr end to end, each plane tightly packed. `rgba`: the IPU's conversion, rows top first. */
  format: 'yuv420p' | 'rgba';
  data: Uint8Array;
  /** What it cost, when the core was given a clock (`MovieDecoderOptions.now`; PLAT-19c, research 120 §11). */
  cost?: MoviePictureCost;
}

/**
 * A picture's cost on the core's clock, in milliseconds, since the picture before it (or the open): `decodeMs` the
 * decoder's own calls (feed, next, flush) and the conversion out of its planes, `readMs` the pulls of the packet stream
 * (the disc's range reads, the demuxer and the cut at the picture start codes). The time between the two -- the worker idle, its queue full -- is neither.
 */
export interface MoviePictureCost { decodeMs: number; readMs: number }

/** The movie's end: the pictures shown, the coded pictures fed, the invalid states, and why it ended early, if it did. */
export interface MovieEnd {
  kind: 'end';
  pictures: number;
  coded: number;
  invalid: number;
  error: string | null;
}

export type MovieResult = { kind: 'picture'; picture: MoviePicture } | MovieEnd;

export interface MovieDecoderOptions {
  /** The pictures kept ahead (`MOVIE_QUEUE_PICTURES`). */
  queue?: number;
  output?: 'yuv420p' | 'rgba';
  /** Where an output picture's bytes come from (a pool of buffers the page has handed back); a new array otherwise. */
  alloc?: (bytes: number) => Uint8Array;
  /** A clock in milliseconds (the worker's `performance.now`): each picture then carries its `cost`. None by default. */
  now?: () => number;
}

/**
 * The core: one movie at a time on one engine. `open` starts a movie (the engine reset, a second movie on the same
 * instance); `next` answers its pictures in display order, then the end, then the end again. Decoding runs only to
 * keep `queue` pictures ready: the packets are pulled as the decoder needs them, so the movie is never read ahead of
 * that.
 *
 * A stream that breaks (the demuxer throws: a truncated file, a unit cut short) ends cleanly: the coded picture the
 * break cut is not fed, the decoder is flushed, the pictures before the break are answered, then the end with the
 * error. An invalid stream state (a corrupt picture) is counted and decoding goes on (libmpeg2 resynchronises at the
 * next start code). A decoder that fails (no memory) ends the movie with its message.
 */
export class MovieDecoder {
  private readonly bound: number;
  private readonly output: 'yuv420p' | 'rgba';
  private readonly alloc: (bytes: number) => Uint8Array;
  private queue: MoviePicture[] = [];
  private iterator: AsyncIterator<PssPacket> | null = null;
  private splitter = new CodedPictureSplitter();
  private units: CodedUnit[] = [];
  /** Per coded picture, what the splitter read: its PTS. Entries go once displayed. */
  private pts = new Map<number, number>();
  private shown = 0;
  private inputDone = false;
  private flushed = false;
  private finished = true;
  private error: string | null = null;
  private generation = 0;
  private filling: Promise<void> | null = null;
  private readonly now: (() => number) | null;
  /** The cost run up since the last picture taken (with a clock). */
  private spentDecode = 0;
  private spentRead = 0;

  constructor(private readonly engine: Mpeg2Engine, options: MovieDecoderOptions = {}) {
    this.bound = Math.max(1, options.queue ?? MOVIE_QUEUE_PICTURES);
    this.output = options.output ?? 'yuv420p';
    this.alloc = options.alloc ?? ((n) => new Uint8Array(n));
    this.now = options.now ?? null;
  }

  /** Pictures decoded and waiting. */
  get queued(): number {
    return this.queue.length;
  }

  /** Start `packets` as the movie, ending any movie before it. */
  open(packets: AsyncIterable<PssPacket>): void {
    this.letGo();
    this.generation++;
    this.engine.reset();
    this.queue = [];
    this.splitter = new CodedPictureSplitter();
    this.units = [];
    this.pts.clear();
    this.shown = 0;
    this.inputDone = false;
    this.flushed = false;
    this.finished = false;
    this.error = null;
    this.spentDecode = 0;
    this.spentRead = 0;
    this.iterator = packets[Symbol.asyncIterator]();
    this.kick();
  }

  /** The next picture in display order, or the end. */
  async next(): Promise<MovieResult> {
    for (;;) {
      const picture = this.queue.shift();
      if (picture) {
        this.kick();
        return { kind: 'picture', picture };
      }
      if (this.finished && !this.filling) return this.endResult();
      this.kick();
      await this.filling;
    }
  }

  /** Resolves when the decoding in flight has stopped (the queue full, or the end): for the tests' look at the bound. */
  async settled(): Promise<void> {
    while (this.filling) await this.filling;
  }

  /** End the movie: the packet stream is let go (its reads stop) and `next` answers the end. */
  close(): void {
    this.letGo();
    this.generation++;
    this.finished = true;
    this.queue = [];
  }

  private endResult(): MovieEnd {
    return { kind: 'end', pictures: this.shown, coded: this.splitter.coded, invalid: this.engineInvalid(), error: this.error };
  }

  private engineInvalid(): number {
    try { return this.engine.invalid(); } catch { return 0; }
  }

  private letGo(): void {
    const it = this.iterator;
    this.iterator = null;
    if (it?.return) void Promise.resolve(it.return()).catch(() => undefined);
  }

  private kick(): void {
    if (this.filling || this.finished || this.queued >= this.bound) return;
    const gen = this.generation;
    // One fill at a time: a movie opened while one runs waits for it to see the new generation and stop.
    this.filling = this.fill(gen).finally(() => { this.filling = null; });
  }

  private async fill(gen: number): Promise<void> {
    try {
      const now = this.now;
      while (this.generation === gen && !this.finished && this.queued < this.bound) {
        const t0 = now?.() ?? 0;
        const st = this.engine.next();
        if (st === 1) { this.queue.push(this.take(this.engine.picture(), t0)); continue; }
        if (st === -1) { this.spend(t0); continue; }   // counted by the engine; libmpeg2 resynchronises at the next start code
        // 0: the decoder wants bytes.
        const unit = this.units.shift();
        if (unit) { this.engine.feed(unit.bytes, unit.codingIndex); this.note(unit); this.spend(t0); continue; }
        if (!this.inputDone) {
          this.spend(t0);
          const r0 = now?.() ?? 0;
          await this.pull(gen);
          if (now) this.spentRead += now() - r0;
          continue;
        }
        if (!this.flushed) { this.flushed = true; this.engine.flush(); this.spend(t0); continue; }
        this.spend(t0);
        this.finished = true;
      }
    } catch (e) {
      if (this.generation !== gen) return;
      this.error = (e as Error).message ?? String(e);
      this.finished = true;
      this.letGo();
    }
  }

  /** One packet from the stream into the splitter; at its end (or break) the last unit. */
  private async pull(gen: number): Promise<void> {
    const it = this.iterator;
    if (!it) { this.inputDone = true; return; }
    let r: IteratorResult<PssPacket>;
    try {
      r = await it.next();
    } catch (e) {
      if (this.generation !== gen) return;
      // A break in the stream: the unit in hand is cut short and is not fed.
      this.error = (e as Error).message ?? String(e);
      this.inputDone = true;
      this.iterator = null;
      return;
    }
    if (this.generation !== gen) return;
    if (r.done) {
      const last = this.splitter.end();
      if (last) this.units.push(last);
      this.inputDone = true;
      this.iterator = null;
      return;
    }
    if (isVideo(r.value.streamId)) this.units.push(...this.splitter.push(r.value.data, r.value.pts));
  }

  /** The decoder's time since `t0`, with a clock. */
  private spend(t0: number): void {
    if (this.now) this.spentDecode += this.now() - t0;
  }

  private note(unit: CodedUnit): void {
    if (unit.codingIndex !== null && unit.pts !== undefined) this.pts.set(unit.codingIndex, unit.pts);
  }

  /** The engine's picture copied out (its planes are valid only until the next `next`). */
  private take(p: EnginePicture, t0: number): MoviePicture {
    const { width: w, height: h } = p;
    let data: Uint8Array;
    if (this.output === 'rgba') {
      data = ipuCscRgba(p.y, p.cb, p.cr, w, h, this.alloc(w * h * 4), p.chromaWidth);
    } else {
      const cw = w >> 1, ch = h >> 1;
      data = this.alloc(w * h + 2 * cw * ch);
      data.set(p.y.subarray(0, w * h));
      const copy = (src: Uint8Array, at: number): void => {
        if (p.chromaWidth === cw) { data.set(src.subarray(0, cw * ch), at); return; }
        for (let j = 0; j < ch; j++) data.set(src.subarray(j * p.chromaWidth, j * p.chromaWidth + cw), at + j * cw);
      };
      copy(p.cb, w * h);
      copy(p.cr, w * h + cw * ch);
    }
    const codingIndex = p.tag;
    let pts: number | null = null;
    if (codingIndex !== null) {
      pts = this.pts.get(codingIndex) ?? null;
      this.pts.delete(codingIndex);
      // A field pair's second field never shows under its own tag: drop what is far behind.
      if (this.pts.size > 64) for (const k of this.pts.keys()) if (k < codingIndex - 64) this.pts.delete(k);
    }
    const picture: MoviePicture = {
      index: this.shown++, codingIndex, type: TYPES[p.type & 7]!, temporalReference: p.temporalReference, pts,
      width: w, height: h, format: this.output, data,
    };
    if (this.now) {
      this.spend(t0);
      picture.cost = { decodeMs: this.spentDecode, readMs: this.spentRead };
      this.spentDecode = 0;
      this.spentRead = 0;
    }
    return picture;
  }
}
