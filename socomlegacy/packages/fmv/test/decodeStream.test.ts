import { describe, expect, it } from 'vitest';
import type { PssPacket } from '../src/pss';
import {
  CodedPictureSplitter, MOVIE_QUEUE_PICTURES, MovieDecoder, readPictureHeader, type CodedUnit, type MovieResult,
} from '../src/decodeStream';
import { ipuCscRgba } from '../src/ipuCsc';
import { FakeEngine, H, W, es, gop, type FakePicture } from './fakeEngine';

/**
 * PLAT-19b's decoder core (research 120 §2-§4): the elementary stream cut at its picture start codes and tagged, the
 * decoder driven through `Mpeg2Engine` (here the fake of `fakeEngine.ts`: libmpeg2's state machine over synthetic
 * streams, no wasm, no disc bytes), pictures in display order with their tags and PTS, a bounded queue, the end, a
 * second movie on one engine, a truncated or corrupt stream.
 */

const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/** The video packets of a stream cut every `size` bytes; `pts(i)` stamps packet i. */
function packets(stream: Uint8Array, size: number, pts: (i: number) => number | undefined = () => undefined): PssPacket[] {
  const out: PssPacket[] = [];
  for (let at = 0, i = 0; at < stream.length; at += size, i++) {
    const p: PssPacket = { streamId: 0xe0, offset: at, data: stream.slice(at, at + size) };
    const t = pts(i);
    if (t !== undefined) p.pts = t;
    out.push(p);
  }
  return out;
}

/** An async packet source that counts its pulls, can fail after `failAfter` packets, and records its return. */
function source(list: PssPacket[], o: { failAfter?: number; audio?: boolean } = {}) {
  const state = { pulled: 0, returned: false };
  const iterable: AsyncIterable<PssPacket> = {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (o.failAfter !== undefined && i >= o.failAfter) throw new Error('PSS: the stream ends 10 bytes inside the unit at 99');
          if (i >= list.length) return { done: true, value: undefined };
          state.pulled++;
          // An audio packet between every video packet: the core takes video (0xE0) only.
          return { done: false, value: list[i++]! };
        },
        async return() { state.returned = true; return { done: true, value: undefined }; },
      };
    },
  };
  return { iterable, state };
}

async function drain(d: MovieDecoder): Promise<{ pictures: Extract<MovieResult, { kind: 'picture' }>['picture'][]; end: Extract<MovieResult, { kind: 'end' }> }> {
  const pictures = [];
  for (;;) {
    const r = await d.next();
    if (r.kind === 'end') return { pictures, end: r };
    pictures.push(r.picture);
  }
}

/** Display order of coding types (13818-2 6.1.1), the expected tag sequence. */
function displayOrder(types: number[]): number[] {
  const out: number[] = [];
  let held = -1;
  types.forEach((t, k) => { if (t === 3) { out.push(k); return; } if (held >= 0) out.push(held); held = k; });
  if (held >= 0) out.push(held);
  return out;
}

describe('readPictureHeader', () => {
  it('reads temporal_reference (10 bits) and picture_coding_type (3 bits) after 00 00 01 00, and the structure from the picture coding extension', () => {
    const b = es([{ type: 2, tr: 1021, luma: 1 }]);
    const at = 16;   // after the sequence and GOP headers
    expect([...b.subarray(at, at + 4)]).toEqual([0, 0, 1, 0]);
    expect(readPictureHeader(b, at)).toEqual({ temporalReference: 1021, type: 'P', structure: 'frame' });
  });

  it('no picture coding extension (MPEG-1): no structure', () => {
    expect(readPictureHeader(Uint8Array.of(0, 0, 1, 0, 0, 0x08, 0xff, 0xf8, 0, 0, 1, 1, 5), 0)).toEqual({ temporalReference: 0, type: 'I' });
  });

  it('field pictures: picture_structure 1 top, 2 bottom', () => {
    const top = Uint8Array.of(0, 0, 1, 0, 0, 0x08, 0xff, 0xf8, 0, 0, 1, 0xb5, 0x8f, 0xff, 0xf1, 0x80);
    const bottom = Uint8Array.of(0, 0, 1, 0, 0, 0x08, 0xff, 0xf8, 0, 0, 1, 0xb5, 0x8f, 0xff, 0xf2, 0x80);
    expect(readPictureHeader(top, 0).structure).toBe('top');
    expect(readPictureHeader(bottom, 0).structure).toBe('bottom');
  });
});

describe('CodedPictureSplitter: the elementary stream cut at its picture start codes', () => {
  const pics = gop(10);
  const stream = es(pics);

  const units = (size: number): CodedUnit[] => {
    const s = new CodedPictureSplitter();
    const out: CodedUnit[] = [];
    for (const p of packets(stream, size)) out.push(...s.push(p.data, p.pts));
    const last = s.end();
    if (last) out.push(last);
    return out;
  };

  it('one unit per coded picture, from its start code to the next, numbered in coding order; the headers before the first untagged', () => {
    const u = units(stream.length);
    expect(u.map((x) => x.codingIndex)).toEqual([null, ...pics.map((_, k) => k)]);
    expect(cat(...u.map((x) => x.bytes))).toEqual(stream);
    for (const x of u.slice(1)) expect([...x.bytes.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(u.slice(1).map((x) => x.header!.temporalReference)).toEqual(pics.map((p) => p.tr));
    expect(u.slice(1).map((x) => x.header!.type)).toEqual(pics.map((p) => 'IPB'[p.type - 1]));
  });

  it('the same units whatever the packets: every size from 1 byte up', () => {
    const whole = units(stream.length);
    for (const size of [1, 2, 3, 4, 5, 7, 13, 64]) expect(units(size)).toEqual(whole);
  });

  it('a PES PTS goes to the first picture whose start code begins in that packet (13818-1 clause 2.4.3, the PES semantics of PTS); a start code split across packets belongs to the packet of its first byte', () => {
    const s = new CodedPictureSplitter();
    const starts: number[] = [];
    for (let i = 0; i + 3 < stream.length; i++) if (stream[i] === 0 && stream[i + 1] === 0 && stream[i + 2] === 1 && stream[i + 3] === 0) starts.push(i);
    expect(starts[0]).toBe(16);   // after the sequence and GOP headers
    // Packet A ends two bytes into picture 1's start code, stamped 1000: picture 0 starts first in it, so it takes 1000.
    // Packet B, stamped 2000: picture 1's start code began in A, so the first picture to begin in B is picture 2.
    const cut = starts[1]! + 2;
    const got = [...s.push(stream.subarray(0, cut), 1000), ...s.push(stream.subarray(cut), 2000)];
    const last = s.end();
    if (last) got.push(last);
    const pts = new Map(got.filter((u) => u.codingIndex !== null).map((u) => [u.codingIndex!, u.pts]));
    expect(pts.get(0)).toBe(1000);
    expect(pts.get(1)).toBeUndefined();
    expect(pts.get(2)).toBe(2000);
    expect(pts.get(3)).toBeUndefined();
  });

  it('a PTS on a packet in which no picture starts is attached to none', () => {
    const s = new CodedPictureSplitter();
    const got = [...s.push(stream.subarray(0, 10), 5), ...s.push(stream.subarray(10))];
    const last = s.end();
    if (last) got.push(last);
    expect(got.every((u) => u.pts === undefined)).toBe(true);
  });

  it('holds no more than the coded picture in hand and the packet that completes it', () => {
    const s = new CodedPictureSplitter();
    const long = es(gop(400));
    for (const p of packets(long, 37)) s.push(p.data, p.pts);
    expect(s.highWater).toBeLessThan(200);
  });
});

describe('MovieDecoder over the engine (a fake libmpeg2)', () => {
  const pics = gop(31);
  const stream = es(pics);
  const types = pics.map((p) => p.type);

  it('every coded picture once, in display order, tagged with its coding index; the end with the counts', async () => {
    const d = new MovieDecoder(new FakeEngine());
    d.open(source(packets(stream, 100)).iterable);
    const { pictures, end } = await drain(d);
    expect(pictures.map((p) => p.codingIndex)).toEqual(displayOrder(types));
    expect(pictures.map((p) => p.index)).toEqual(pictures.map((_, i) => i));
    expect(pictures.map((p) => p.temporalReference)).toEqual(pictures.map((_, i) => i));   // gop() numbers display order
    expect(pictures.map((p) => p.type)).toEqual(displayOrder(types).map((k) => 'IPB'[types[k]! - 1]));
    expect(end).toEqual({ kind: 'end', pictures: 31, coded: 31, invalid: 0, error: null });
    expect(await d.next()).toEqual(end);                                    // the end again, not a throw
  });

  it('yuv420p by default: Y, then Cb, then Cr, the size of the picture', async () => {
    const d = new MovieDecoder(new FakeEngine());
    d.open(source(packets(es([{ type: 1, tr: 0, luma: 77 }]), 64)).iterable);
    const r = await d.next();
    if (r.kind !== 'picture') throw new Error('no picture');
    expect(r.picture).toMatchObject({ width: W, height: H, format: 'yuv420p' });
    expect(r.picture.data.length).toBe(W * H * 3 / 2);
    expect(r.picture.data[0]).toBe(77);
    expect(r.picture.data[W * H]).toBe(100);
    expect(r.picture.data[W * H * 5 / 4]).toBe(150);
  });

  it("rgba: the IPU's conversion of the planes, opaque", async () => {
    const d = new MovieDecoder(new FakeEngine(), { output: 'rgba' });
    d.open(source(packets(es([{ type: 1, tr: 0, luma: 77 }]), 64)).iterable);
    const r = await d.next();
    if (r.kind !== 'picture') throw new Error('no picture');
    expect(r.picture.format).toBe('rgba');
    const want = ipuCscRgba(new Uint8Array(W * H).fill(77), new Uint8Array(W * H / 4).fill(100), new Uint8Array(W * H / 4).fill(150), W, H);
    expect(r.picture.data).toEqual(want);
  });

  it('the PTS of each picture rides with it in display order', async () => {
    // One packet per coded picture (the leading headers with picture 0), stamped 3000 * coding index.
    const s = new CodedPictureSplitter();
    const u = [...s.push(stream), s.end()!];
    const list: PssPacket[] = [];
    let at = 0;
    const merged = [cat(u[0]!.bytes, u[1]!.bytes), ...u.slice(2).map((x) => x.bytes)];
    merged.forEach((bytes, k) => { list.push({ streamId: 0xe0, offset: at, pts: 3000 * k, data: bytes }); at += bytes.length; });
    const d = new MovieDecoder(new FakeEngine());
    d.open(source(list).iterable);
    const { pictures } = await drain(d);
    expect(pictures.map((p) => p.pts)).toEqual(pictures.map((p) => 3000 * p.codingIndex!));
  });

  it('takes the video packets only (0xE0): audio and other streams are passed over', async () => {
    const list = packets(stream, 50).flatMap((p) => [p, { streamId: 0xbd, offset: p.offset, data: Uint8Array.of(0, 0, 1, 0, 9, 9) }]);
    const d = new MovieDecoder(new FakeEngine());
    d.open(source(list).iterable);
    const { end } = await drain(d);
    expect(end.pictures).toBe(31);
  });

  it(`back-pressure: the queue is bounded (${MOVIE_QUEUE_PICTURES} by default), so the movie is not decoded ahead of the caller`, async () => {
    const engine = new FakeEngine();
    const d = new MovieDecoder(engine, { queue: 2 });
    const src = source(packets(es(gop(200)), 40));
    d.open(src.iterable);
    await d.next();
    await d.settled();
    expect(d.queued).toBe(2);
    expect(engine.produced).toBeLessThanOrEqual(3);
    const pulledAfterOne = src.state.pulled;
    expect(pulledAfterOne).toBeLessThan(packets(es(gop(200)), 40).length / 10);
    await d.next();
    await d.settled();
    expect(engine.produced).toBeLessThanOrEqual(4);
    expect(MOVIE_QUEUE_PICTURES).toBeGreaterThan(0);
  });

  it('a second movie on the same engine: the first stream is let go, the engine reset, the pictures are the second\'s', async () => {
    const engine = new FakeEngine();
    const d = new MovieDecoder(engine);
    const a = source(packets(es(gop(40, 10)), 30));
    d.open(a.iterable);
    await d.next();
    await d.next();
    const b = source(packets(es(gop(7, 200)), 30));
    d.open(b.iterable);
    const { pictures, end } = await drain(d);
    expect(a.state.returned).toBe(true);
    expect(engine.resets).toBe(2);
    expect(pictures.map((p) => p.data[0])).toEqual([200, 201, 202, 203, 204, 205, 206]);
    expect(pictures[0]!.index).toBe(0);
    expect(end).toMatchObject({ pictures: 7, coded: 7, error: null });
    // And a third, the same movie again from its start (the restart of research 121 §5 as a clean reopen).
    d.open(source(packets(es(gop(7, 200)), 30)).iterable);
    expect((await drain(d)).pictures.length).toBe(7);
  });

  it('a stream without a sequence end code: the flush completes the last picture and releases the held reference', async () => {
    const d = new MovieDecoder(new FakeEngine());
    d.open(source(packets(es(pics, false), 64)).iterable);
    const { end } = await drain(d);
    expect(end.pictures).toBe(31);
  });

  it('a truncated stream ends cleanly: the pictures before the break, the unfinished one dropped, the error in the end', async () => {
    const list = packets(stream, 60);
    const d = new MovieDecoder(new FakeEngine());
    d.open(source(list, { failAfter: 8 }).iterable);
    const { pictures, end } = await drain(d);
    const fed = cat(...list.slice(0, 8).map((p) => p.data));
    // The coded pictures whose next start code arrived before the break are whole; the one cut by it is not fed.
    const s = new CodedPictureSplitter();
    const whole = s.push(fed).filter((u) => u.codingIndex !== null).length;
    expect(pictures.length).toBe(whole);
    expect(pictures.map((p) => p.codingIndex).sort((x, y) => x! - y!)).toEqual(Array.from({ length: whole }, (_, k) => k));
    expect(end.error).toMatch(/inside the unit/);
    expect(end.pictures).toBe(whole);
  });

  it('a corrupt picture is counted invalid and passed over; the rest decode', async () => {
    const bad: FakePicture[] = [{ type: 1, tr: 0, luma: 1 }, { type: 1, tr: 0, luma: 2 }, { type: 0, tr: 0, luma: 3 }, { type: 1, tr: 0, luma: 4 }];
    const d = new MovieDecoder(new FakeEngine());
    d.open(source(packets(es(bad), 9)).iterable);
    const { pictures, end } = await drain(d);
    expect(pictures.map((p) => p.data[0])).toEqual([1, 2, 4]);
    expect(end).toMatchObject({ pictures: 3, coded: 4, invalid: 1, error: null });
  });

  it('an engine that fails (out of memory) ends the movie with its message, it does not throw', async () => {
    const engine = new FakeEngine();
    let feeds = 0;
    const feed = engine.feed.bind(engine);
    engine.feed = (b, t) => { if (++feeds > 3) throw new Error('decoder: no memory for a 4096-byte feed'); feed(b, t); };
    const d = new MovieDecoder(engine);
    d.open(source(packets(stream, 64)).iterable);
    const { end } = await drain(d);
    expect(end.error).toMatch(/no memory/);
  });

  it('close: the stream is let go and next() answers the end', async () => {
    const d = new MovieDecoder(new FakeEngine());
    const src = source(packets(stream, 64));
    d.open(src.iterable);
    await d.next();
    d.close();
    expect(src.state.returned).toBe(true);
    expect((await d.next()).kind).toBe('end');
  });

  it('recycles output buffers through the caller\'s allocator', async () => {
    const sizes: number[] = [];
    const d = new MovieDecoder(new FakeEngine(), { output: 'rgba', alloc: (n) => { sizes.push(n); return new Uint8Array(n); } });
    d.open(source(packets(es(gop(5)), 64)).iterable);
    await drain(d);
    expect(sizes).toEqual([W * H * 4, W * H * 4, W * H * 4, W * H * 4, W * H * 4]);
  });
});
