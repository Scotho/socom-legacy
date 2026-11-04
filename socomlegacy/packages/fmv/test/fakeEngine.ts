import type { Mpeg2Engine, EnginePicture } from '../src/decodeEngine';

/**
 * A stand-in for libmpeg2 behind `glue.c`, for the CI tests (no wasm, no disc bytes). It reads the synthetic
 * elementary streams `es()` below builds with libmpeg2's own state machine as `glue.c` exposes it (research 98 §7.1):
 *
 * - a coded picture is complete when the next start code that is not a slice arrives (a picture, a sequence or GOP
 *   header, the sequence end) -- so the picture fed last waits for the next feed or the flush;
 * - display order is the standard's frame reordering (13818-2 6.1.1): a B picture at once, an I or P picture held
 *   until the next I or P, or the sequence end;
 * - a tag given with a feed goes to the next picture whose start code is in those bytes (`mpeg2_tag_picture`);
 * - `flush` feeds `00 00 01 B7` unless the stream ended with one; `next` returns 1 (a picture), 0 (bytes needed) or
 *   -1 (an invalid picture: coding type 0 in its header, which the stream builder writes for a corrupt one; dropped).
 *
 * Each picture is `W` x `H`; its Y plane is filled with the slice's first byte, Cb with 100 and Cr with 150.
 */
export const W = 32;
export const H = 16;

/** One synthetic coded picture: its coding type (1 I, 2 P, 3 B; 0 makes it invalid), temporal reference and luma value. */
export interface FakePicture { type: number; tr: number; luma: number }

const SEQ = [0, 0, 1, 0xb3, 0x02, 0x00, 0x10, 0x15];
const GOP = [0, 0, 1, 0xb8, 0, 0, 0, 0];
const picHeader = (tr: number, type: number): number[] => [0, 0, 1, 0, (tr >> 2) & 0xff, ((tr & 3) << 6) | ((type & 7) << 3), 0xff, 0xf8];
/** The picture coding extension (`00 00 01 B5`, id 8), picture_structure 3 (a frame). */
const PCE = [0, 0, 1, 0xb5, 0x8f, 0xff, 0xf3, 0x80];
const slice = (luma: number, n = 20): number[] => [0, 0, 1, 1, luma, ...Array.from({ length: n }, (_, i) => (i * 7 + 3) & 0x7f | 0x80)];

/** A synthetic elementary stream: a sequence header, a GOP header, then each picture; `end` adds `00 00 01 B7`. */
export function es(pictures: readonly FakePicture[], end = true): Uint8Array {
  const out: number[] = [...SEQ, ...GOP];
  for (const p of pictures) out.push(...picHeader(p.tr, p.type), ...PCE, ...slice(p.luma));
  if (end) out.push(0, 0, 1, 0xb7);
  return Uint8Array.from(out);
}

/** The pictures of a GOP in coding order, display-ordered by temporal reference: I0 P3 B1 B2 P6 B4 B5 ... */
export function gop(n: number, lumaBase = 10): FakePicture[] {
  // Display order 0..n-1; coding order: I0, then for each P at d, the Bs before it.
  const out: FakePicture[] = [{ type: 1, tr: 0, luma: lumaBase }];
  for (let p = 3; p - 2 < n; p += 3) {
    const at = Math.min(p, n - 1);
    out.push({ type: 2, tr: at, luma: lumaBase + at });
    for (let b = p - 2; b < at; b++) out.push({ type: 3, tr: b, luma: lumaBase + b });
    if (at === n - 1) break;
  }
  return out;
}

interface Pending { type: number; tr: number; luma: number; tag: number | null }

export class FakeEngine implements Mpeg2Engine {
  /** Pictures handed out by `next` so far, and bytes fed: what the back-pressure tests read. */
  produced = 0;
  fedBytes = 0;
  resets = 0;
  closed = false;
  private buf: number[] = [];
  private tags: { at: number; tag: number }[] = [];
  private scanned = 0;
  /** The picture whose start code was seen and whose end was not. */
  private open: { at: number; tag: number | null } | null = null;
  private held: Pending | null = null;
  private out: Pending[] = [];
  private shown: Pending | null = null;
  private ended = false;
  private invalidCount = 0;

  reset(): void {
    this.resets++;
    this.buf = []; this.tags = []; this.scanned = 0; this.open = null; this.held = null; this.out = [];
    this.shown = null; this.ended = false; this.invalidCount = 0;
  }

  feed(bytes: Uint8Array, tag?: number | null): void {
    if (this.closed) throw new Error('fake: closed');
    if (tag !== undefined && tag !== null) this.tags.push({ at: this.buf.length, tag });
    for (const b of bytes) this.buf.push(b);
    this.fedBytes += bytes.length;
    this.ended = false;
  }

  flush(): void {
    if (this.ended) return;
    this.feed(Uint8Array.of(0, 0, 1, 0xb7));
  }

  next(): 1 | 0 | -1 {
    for (;;) {
      if (this.out.length) {
        this.shown = this.out.shift()!;
        this.produced++;
        return 1;
      }
      // Find the next start code past `scanned`.
      const b = this.buf;
      let i = this.scanned;
      while (i + 3 < b.length && !(b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1)) i++;
      if (i + 3 >= b.length) { this.scanned = Math.max(this.scanned, b.length - 3, 0); return 0; }
      const code = b[i + 3]!;
      this.scanned = i + 4;
      if (code >= 0x01 && code <= 0xaf) continue;            // a slice: part of the open picture
      if (code === 0xb5) continue;                            // an extension
      // Any other start code completes the open picture.
      const r = this.complete(i);
      if (code === 0x00) {
        // The header's fields are read when the picture completes, by which time its bytes have all been fed.
        const tagIdx = this.tags.findIndex((t) => t.at <= i);
        const tag = tagIdx >= 0 ? this.tags.splice(tagIdx, 1)[0]!.tag : null;
        this.open = { at: i, tag };
      }
      if (code === 0xb7) {
        this.ended = true;
        if (this.held) { this.out.push(this.held); this.held = null; }
      }
      if (r === -1) return -1;
    }
  }

  /** Close the open picture at `end`: reorder it into `out`, or return -1 when its header says coding type 0. */
  private complete(end: number): -1 | null {
    const o = this.open;
    this.open = null;
    if (!o) return null;
    const b = this.buf;
    const tr = (b[o.at + 4]! << 2) | (b[o.at + 5]! >> 6);
    const type = (b[o.at + 5]! >> 3) & 7;
    // The slice's first byte after `00 00 01 01`.
    let s = o.at + 4;
    while (s + 4 < end && !(b[s] === 0 && b[s + 1] === 0 && b[s + 2] === 1 && b[s + 3] === 1)) s++;
    const luma = s + 4 < end ? b[s + 4]! : 0;
    if (type === 0) { this.invalidCount++; return -1; }
    const p: Pending = { type, tr, luma, tag: o.tag };
    if (type === 3) this.out.push(p);
    else {
      if (this.held) this.out.push(this.held);
      this.held = p;
    }
    return null;
  }

  picture(): EnginePicture {
    const p = this.shown;
    if (!p) throw new Error('fake: no picture');
    const y = new Uint8Array(W * H).fill(p.luma);
    const cb = new Uint8Array((W / 2) * (H / 2)).fill(100);
    const cr = new Uint8Array((W / 2) * (H / 2)).fill(150);
    return { width: W, height: H, chromaWidth: W / 2, chromaHeight: H / 2, y, cb, cr, type: p.type, temporalReference: p.tr, tag: p.tag };
  }

  invalid(): number { return this.invalidCount; }

  close(): void { this.closed = true; }
}
