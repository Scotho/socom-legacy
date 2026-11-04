/**
 * The playtest room's video ring (web sprint 33 PT-06; spec 2026-10-06-playtest-and-replay-design 4.3; research 241 §4).
 * **PLAYTEST_INSTRUMENT_ADAPTATION -- a browser adaptation with no original**: the canvas is captured
 * (`canvas.captureStream(30)`) into a `MediaRecorder` with 1 s timeslices; the last `VIDEO_RING_SECONDS_PLACEHOLDER`
 * seconds of chunks are kept, and a mark pins the chunks around it for upload. It reads the canvas only and changes no
 * game value or behaviour (PT.R3). Mounted only by `./playtestSession` (`?devmode&playtest=` on a development build).
 *
 * The ring's clock is in seconds. A chunk covers `[at, at + seconds)`; a pin's window is `[at - before, at + after]`
 * and takes every chunk that overlaps it. The ring is pure: the recorder is behind `RecorderLike`, so the arithmetic is
 * tested without a browser (`test/playtestVideo.test.ts`).
 */

/** Seconds of video the ring keeps. A chosen value, an owner call (HUMAN_TASKS): the spec's 90 s; no original. */
export const VIDEO_RING_SECONDS_PLACEHOLDER = 90;
/** Seconds a mark's clip reaches back. A chosen value, an owner call: the spec's 20 s; no original. Listed in note 241 §3. */
export const VIDEO_PIN_BEFORE_S = 20;
/** Seconds a mark's clip runs on after the mark. A chosen value, an owner call: the spec's 10 s; no original. Listed in note 241 §3. */
export const VIDEO_PIN_AFTER_S = 10;
/** The recorder's timeslice: one chunk a second (the spec's 1 s). */
const TIMESLICE_MS = 1000;
/** The capture's frame rate asked of `captureStream` (the spec's 30). */
const CAPTURE_FPS = 30;

export interface Chunk { at: number; seconds: number; bytes: Blob | Uint8Array; keyframe: boolean }
export interface RecorderLike { start(timesliceMs: number): void; stop(): void; ondata: ((c: Chunk) => void) | null; mime: string }
/**
 * A pinned clip. `bytes` is the playable file: the stream's init segment, then the stream from a Cluster boundary to
 * the end of the last chunk at or before the window's end (null, with `why`, when no such file can be cut).
 * `from`/`to` are the clip's actual cut times when it has bytes, else the window's. `chunks` are the ring's own Chunk
 * objects the window overlaps, and only those (shared between overlapping pins): the accounting, not a file --
 * concatenated, they do not play (research 241 §4).
 */
export interface Clip { from: number; to: number; chunks: Chunk[]; cut: boolean; bytes: Uint8Array | null; why?: string }

interface Pin { from: number; to: number; chunks: Chunk[]; evicted: boolean; floor: number; resolve(c: Clip): void }

const overlaps = (c: Chunk, from: number, to: number): boolean => c.at < to && c.at + c.seconds > from;
/** The WebM (Matroska) Cluster element's 4-byte EBML ID. */
const CLUSTER_ID = [0x1f, 0x43, 0xb6, 0x75] as const;
const EPS = 1e-9;

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}

const byteLength = (c: Chunk): number => (c.bytes instanceof Uint8Array ? c.bytes.length : 0);

export class VideoRing {
  private readonly chunks: Chunk[] = [];
  /** Each held chunk's byte offset in its recording's stream (parallel to `chunks`). */
  private readonly offsets: number[] = [];
  private readonly pins: Pin[] = [];
  private recorder: RecorderLike | null = null;
  /** The ring has evicted a chunk of the running recording (until a restart or stop): a window reaching back past it lacks bytes. */
  private dropped = false;
  /** The recording's byte count so far; its last three bytes (a Cluster ID may straddle two chunks); the clusters held. */
  private total = 0;
  private tail = new Uint8Array(0);
  private clusters: { offset: number; at: number }[] = [];
  /** The stream's bytes before its first Cluster: the EBML header, Segment, Info and Tracks. Null until a Cluster is seen. */
  private initSegment: Uint8Array | null = null;
  private head: Uint8Array[] = [];
  /** A chunk's bytes came as a Blob: the ring cannot scan them, so this recording yields no playable bytes. */
  private opaque = false;

  constructor(
    private readonly make: () => RecorderLike,
    private readonly now: () => number,
    private readonly keepSeconds = VIDEO_RING_SECONDS_PLACEHOLDER,
  ) {}

  /** Starts a recorder (a no-op while one runs). */
  start(): void {
    if (this.recorder) return;
    const rec = this.make();
    this.recorder = rec;
    rec.ondata = (c) => { if (this.recorder === rec) this.take(c); };
    rec.start(TIMESLICE_MS);
  }

  /**
   * A new segment: the open pins close at the boundary (`cut`), the old stream's chunks, cluster index and init segment
   * leave the ring (a later clip never splices two segments), and a fresh recorder starts its own stream.
   */
  restart(): void {
    this.stop();
    this.start();
  }

  /** Stops the recorder; the open pins resolve `cut` with what was recorded; the ring and its byte index empty. */
  stop(): void {
    const rec = this.recorder;
    this.recorder = null;
    if (rec) { rec.ondata = null; try { rec.stop(); } catch { /* already stopped */ } }
    const end = this.now();
    for (const p of this.pins.splice(0)) p.resolve(this.clip(p.from, Math.min(p.to, end), p.chunks, true));
    this.chunks.length = 0;
    this.offsets.length = 0;
    this.dropped = false;
    this.total = 0;
    this.tail = new Uint8Array(0);
    this.clusters = [];
    this.initSegment = null;
    this.head = [];
    this.opaque = false;
  }

  /**
   * Pins the window `[at - before, at + after]`: the chunks held that overlap it now, and those that arrive until one
   * ends at or after `at + after` -- then it resolves with the clip (`Clip`). A restart or stop first resolves it `cut`.
   * A window reaching back past what the ring has already dropped resolves `cut` too, and so does one for which no
   * file can be cut (no Cluster seen yet). While a pin is open the ring keeps the bytes from the last Cluster at or
   * before its window's start.
   */
  pin(at: number, before = VIDEO_PIN_BEFORE_S, after = VIDEO_PIN_AFTER_S): Promise<Clip> {
    const from = at - before, to = at + after;
    const chunks = this.chunks.filter((c) => overlaps(c, from, to));
    // Evicted: the ring has dropped chunks of this recording, and the window reaches back before the oldest it holds.
    // A window reaching back before the recording began, with nothing dropped, lacks nothing.
    const oldest = this.chunks[0];
    const evicted = !!oldest && this.dropped && from < oldest.at;
    const floor = [...this.clusters].reverse().find((k) => k.at <= from + EPS)?.offset ?? this.offsets[0] ?? this.total;
    return new Promise<Clip>((resolve) => {
      if (!this.recorder) { resolve(this.clip(from, Math.min(to, this.now()), chunks, true)); return; }
      const last = this.chunks.at(-1);
      if (last && last.at + last.seconds >= to) { resolve(this.clip(from, to, chunks, evicted)); return; }
      this.pins.push({ from, to, chunks, evicted, floor, resolve });
    });
  }

  /** The seconds of video in the ring. */
  held(): number {
    return this.chunks.reduce((s, c) => s + c.seconds, 0);
  }

  /**
   * The clip of `[from, to]`: the init segment, then the stream from the first Cluster starting in `[from, to]` -- or,
   * when none does, the last one starting before `from`, so the window is covered -- to the end of the last chunk
   * ending at or before `to`. A Cluster's time is its chunk's `at` (chunk-level: within a timeslice, a second).
   */
  private clip(from: number, to: number, chunks: Chunk[], cut: boolean): Clip {
    const none = (why: string): Clip => ({ from, to, chunks, cut: true, bytes: null, why });
    if (this.opaque) return none('the recorder gave Blob chunks: the ring cannot find their Cluster boundaries');
    if (!this.initSegment) return none('no Cluster seen yet in this recording: its init segment is not known');
    let e = -1;
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i]!;
      if (c.at + c.seconds <= to + EPS) { e = i; break; }
    }
    if (e < 0) return none("no chunk held ends at or before the window's end");
    const last = this.chunks[e]!;
    const endOffset = this.offsets[e]! + byteLength(last);
    const inside = this.clusters.find((k) => k.at >= from - EPS && k.at <= to + EPS && k.offset < endOffset);
    const first = inside ?? [...this.clusters].reverse().find((k) => k.at < from && k.offset < endOffset);
    if (!first || first.offset < (this.offsets[0] ?? 0)) return none('no Cluster held in or before the window');
    const parts: Uint8Array[] = [this.initSegment];
    for (let i = 0; i <= e; i++) {
      const b = this.chunks[i]!.bytes as Uint8Array, o = this.offsets[i]!;
      if (o + b.length <= first.offset) continue;
      parts.push(b.subarray(Math.max(0, first.offset - o)));
    }
    return { from: first.at, to: last.at + last.seconds, chunks, cut, bytes: concat(parts) };
  }

  /** Indexes a chunk's bytes: Cluster IDs (one may straddle the previous chunk) and, until the first, the init segment. */
  private scan(c: Chunk): void {
    if (!(c.bytes instanceof Uint8Array)) { this.opaque = true; return; }
    const b = c.bytes, offset = this.total, prevAt = this.chunks.at(-2)?.at ?? c.at;
    const buf = concat([this.tail, b]), base = offset - this.tail.length;
    for (let i = 0; i + CLUSTER_ID.length <= buf.length; i++) {
      if (CLUSTER_ID.every((v, j) => buf[i + j] === v)) {
        this.clusters.push({ offset: base + i, at: base + i >= offset ? c.at : prevAt });
        if (!this.initSegment) { this.initSegment = concat([...this.head, b]).slice(0, base + i); this.head = []; }
      }
    }
    if (!this.initSegment) this.head.push(b);
    this.tail = buf.slice(Math.max(0, buf.length - (CLUSTER_ID.length - 1)));
    this.total += b.length;
  }

  private take(c: Chunk): void {
    this.chunks.push(c);
    this.offsets.push(this.total);
    this.scan(c);
    // Evict the oldest whole chunks past keepSeconds -- never bytes an open pin's clip may start from.
    const floor = Math.min(Infinity, ...this.pins.map((p) => p.floor));
    let held = this.held();
    while (this.chunks.length > 1 && held > this.keepSeconds + EPS && this.offsets[0]! + byteLength(this.chunks[0]!) <= floor) {
      held -= this.chunks.shift()!.seconds;
      this.offsets.shift();
      this.dropped = true;
    }
    const kept = this.offsets[0] ?? this.total;
    while (this.clusters.length && this.clusters[0]!.offset < kept) this.clusters.shift();
    const end = c.at + c.seconds;
    for (let i = 0; i < this.pins.length; i++) {
      const p = this.pins[i]!;
      if (overlaps(c, p.from, p.to)) p.chunks.push(c);
      if (end >= p.to) { this.pins.splice(i--, 1); p.resolve(this.clip(p.from, p.to, p.chunks, p.evicted)); }
    }
  }
}

/** A Blob's bytes: `arrayBuffer()` where the Blob has it, else a `FileReader`. */
function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** The best WebM the browser records: vp9, else vp8, else plain `video/webm`. */
function pickMime(MR: typeof MediaRecorder): string {
  const ok = (m: string): boolean => { try { return typeof MR.isTypeSupported === 'function' && MR.isTypeSupported(m); } catch { return false; } };
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8']) if (ok(m)) return m;
  return 'video/webm';
}

/**
 * The canvas's recorder: `captureStream(30)` (with `audio`'s tracks added when one is given -- null this sprint) into a
 * `MediaRecorder`. Each `dataavailable` is a Chunk ending now and starting where the last one ended, its Blob read to
 * bytes (in order) so the ring can find the Cluster boundaries; the first after a `start` is flagged `keyframe`, though
 * Chromium's first chunk was measured as one byte of the header (research 241 §4). `now` is in seconds and must be the ring's clock (the third
 * argument is this module's addition to the brief's signature: the session's clock is the host's, not `performance`).
 */
export function makeCanvasRecorder(
  canvas: HTMLCanvasElement, audio: MediaStream | null,
  now: () => number = () => performance.now() / 1000,
): RecorderLike {
  const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR) throw new Error('no MediaRecorder in this browser');
  let rec: MediaRecorder | null = null, stream: MediaStream | null = null, generation = 0;
  const out: RecorderLike = {
    mime: pickMime(MR),
    ondata: null,
    start(timesliceMs) {
      stream = canvas.captureStream(CAPTURE_FPS);
      for (const t of audio?.getAudioTracks?.() ?? []) stream.addTrack?.(t);
      rec = out.mime === 'video/webm' ? new MR(stream) : new MR(stream, { mimeType: out.mime });
      let last = now(), first = true, queue: Promise<void> = Promise.resolve();
      const run = ++generation;
      rec.ondataavailable = (e: BlobEvent) => {
        const t = now(), seconds = t - last;
        last = t;
        if (!e.data || e.data.size === 0) return;
        const keyframe = first;
        first = false;
        // The ring scans bytes for Cluster boundaries, so each Blob is read to bytes -- in order: a chain, one at a time.
        const data = e.data;
        queue = queue.then(() => blobBytes(data)).then((bytes) => {
          if (run === generation) out.ondata?.({ at: t - seconds, seconds, bytes, keyframe });
        }, (err: unknown) => { console.warn('playtest: a video chunk could not be read', err); });
      };
      rec.start(timesliceMs);
    },
    stop() {
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch { /* gone */ }
      for (const t of stream?.getTracks?.() ?? []) t.stop();
      rec = null; stream = null; generation++;
    },
  };
  return out;
}
