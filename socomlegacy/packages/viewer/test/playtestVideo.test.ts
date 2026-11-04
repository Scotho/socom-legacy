import { describe, expect, it } from 'vitest';
import { VIDEO_PIN_AFTER_S, VIDEO_PIN_BEFORE_S, VIDEO_RING_SECONDS_PLACEHOLDER, VideoRing, type Chunk, type RecorderLike } from '../src/playtestVideo';

/**
 * A synthetic WebM byte stream, chunk by chunk (k counts from the recorder's start), shaped as Chromium's was measured
 * (research 241 §4, PT-09's run): the first chunk is the one byte `1a`; the header runs on through chunks 1 and 2
 * (`45 df a3 ...`, a Segment's ID) and the first Cluster (`1f 43 b6 75`) starts inside chunk 2; then a Cluster starts
 * every fourth chunk, except that the one due at chunk 12 straddles chunks 11 and 12 (its ID starts in chunk 11). Every
 * other chunk is a cluster's continuation (`ee k`). Clusters therefore start in chunks 2, 4, 8, 11, 16, 20, 24, ...
 */
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
const INIT = [0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x18, 0x53, 0x80, 0x67];
function streamChunk(k: number): Uint8Array {
  if (k === 0) return new Uint8Array([0x1a]);
  if (k === 1) return new Uint8Array([0x45, 0xdf, 0xa3, 0x42, 0x86]);
  if (k === 2) return new Uint8Array([0x18, 0x53, 0x80, 0x67, ...CLUSTER, 0x02]);
  if (k === 11) return new Uint8Array([0xee, 11, 0x1f, 0x43]);
  if (k === 12) return new Uint8Array([0xb6, 0x75, 12, 0xee]);
  if (k % 4 === 0) return new Uint8Array([...CLUSTER, k & 0xff, 0xee]);
  return new Uint8Array([0xee, k & 0xff]);
}
/** The stream's bytes of chunks `a`..`b` (inclusive), concatenated. */
function streamBytes(a: number, b: number): number[] {
  const out: number[] = [];
  for (let k = a; k <= b; k++) out.push(...streamChunk(k));
  return out;
}

/**
 * The video ring's arithmetic (PT-06; research 241 §4) with a fake recorder: each `tick()` advances the clock a second
 * and the live recorder emits the 1 s chunk that just ended, as a MediaRecorder timeslice does, its bytes the synthetic
 * stream's (`streamChunk`, counted from the recorder's start).
 */
function rig(keepSeconds?: number) {
  let t = 0;
  const made: (RecorderLike & { live: boolean; first: boolean; k: number })[] = [];
  const make = (): RecorderLike => {
    const r = { mime: 'video/webm;codecs=vp9', ondata: null as ((c: Chunk) => void) | null, live: false, first: true, k: 0,
      start() { r.live = true; r.first = true; r.k = 0; }, stop() { r.live = false; } };
    made.push(r);
    return r;
  };
  const ring = keepSeconds === undefined ? new VideoRing(make, () => t) : new VideoRing(make, () => t, keepSeconds);
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      t += 1;
      const r = made.at(-1);
      if (r?.live) { r.ondata?.({ at: t - 1, seconds: 1, bytes: streamChunk(r.k++), keyframe: r.first }); r.first = false; }
    }
  };
  return { ring, tick, made, now: () => t };
}

/** A promise's state without waiting on it: settled (with its value) or still open. */
async function peek<T>(p: Promise<T>): Promise<{ done: boolean; value?: T }> {
  const open = Symbol('open');
  const v = await Promise.race([p, new Promise<typeof open>((r) => setTimeout(() => r(open), 0))]);
  return v === open ? { done: false } : { done: true, value: v as T };
}

describe('the video ring (PT-06)', () => {
  it('names its chosen values: 90 s held, 20 s before a mark, 10 s after', () => {
    expect([VIDEO_RING_SECONDS_PLACEHOLDER, VIDEO_PIN_BEFORE_S, VIDEO_PIN_AFTER_S]).toEqual([90, 20, 10]);
  });

  it('(a) holds at most keepSeconds: 100 chunks of 1 s in a 90 s ring keep the last 90, the oldest at 10', () => {
    const { ring, tick } = rig(90);
    ring.start();
    tick(100);
    expect(ring.held()).toBe(90);
    const p = ring.pin(100, 100, 0);  // [0, 100], the whole ring, already elapsed: resolves with what is held
    return p.then((clip) => { expect(clip.chunks[0]!.at).toBe(10); expect(clip.chunks).toHaveLength(90); });   // the ring from 10, nothing else
  });

  it('(b) a pin at t=100 resolves after the after-window with the chunks covering [80, 110]', async () => {
    const { ring, tick } = rig();
    ring.start();
    tick(100);
    const p = ring.pin(100);
    tick(9);
    expect((await peek(p)).done).toBe(false);          // the chunk ending at 110 has not arrived
    tick(1);
    const s = await peek(p);
    expect(s.done).toBe(true);
    const clip = s.value!;
    expect(clip.cut).toBe(false);
    expect([clip.from, clip.to]).toEqual([80, 110]);
    expect(clip.chunks.at(-1)!.at + clip.chunks.at(-1)!.seconds).toBe(110);
    expect(clip.chunks).toHaveLength(30);                // the window's chunks only: 80..109
    expect(clip.chunks[0]!.at).toBe(80);
  });

  it('(c) overlapping pins share chunks: marks at 100 and 100.5 hold the same Chunk objects, with their own from/to', async () => {
    const { ring, tick } = rig();
    ring.start();
    tick(100);
    const p1 = ring.pin(100);
    const p2 = ring.pin(100.5);
    tick(11);
    const [a, b] = await Promise.all([p1, p2]);
    expect([a.from, a.to]).toEqual([80, 110]);
    expect([b.from, b.to]).toEqual([84, 110]);           // the clip's cut: the first cluster at/after 80.5, the last chunk ending by 110.5
    expect(b.chunks).toHaveLength(31);                  // 80..110: the chunk at 110 covers 110.5
    for (const c of a.chunks) expect(b.chunks).toContain(c);   // reference equality: one chunk, two clips
    expect(a.chunks.every((c, i) => c === b.chunks[i])).toBe(true);
  });

  it('(d) a restart closes the open pin: 5 s after the mark it resolves cut, with the chunks up to the restart', async () => {
    const { ring, tick, made } = rig();
    ring.start();
    tick(100);
    const p = ring.pin(100);
    tick(5);
    ring.restart();
    const s = await peek(p);
    expect(s.done).toBe(true);
    const clip = s.value!;
    expect(clip.cut).toBe(true);
    expect([clip.from, clip.to]).toEqual([80, 105]);
    expect(clip.chunks.at(-1)!.at + clip.chunks.at(-1)!.seconds).toBe(105);
    expect(clip.chunks).toHaveLength(25);                // 80..104
    // the new segment's recorder is a fresh one: its first chunk is a keyframe, and no old chunk is in the ring
    expect(made).toHaveLength(2);
    expect(made[0]!.live).toBe(false);
    expect(ring.held()).toBe(0);
    const q = ring.pin(105, 20, 2);
    tick(2);
    const next = await q;
    expect(next.chunks[0]!.keyframe).toBe(true);
    expect(next.chunks.map((c) => c.at)).toEqual([105, 106]);   // never spliced onto the old segment's frames
  });

  it('(e) stop() resolves an open pin with cut true', async () => {
    const { ring, tick, made } = rig();
    ring.start();
    tick(30);
    const p = ring.pin(30);
    tick(3);
    ring.stop();
    const clip = await p;
    expect(clip.cut).toBe(true);
    expect(clip.chunks.at(-1)!.at).toBe(32);
    expect(made[0]!.live).toBe(false);
    expect(made[0]!.ondata).toBeNull();
  });

  it('(f) a clip\'s chunks are the window\'s only: the evicted first chunk is not kept; its bytes open with the init segment', async () => {
    const { ring, tick } = rig(90);
    ring.start();
    tick(100);
    expect(ring.held()).toBe(90);
    const p = ring.pin(95);
    tick(5);
    const clip = await p;
    expect(clip.chunks.map((c) => c.at)).toEqual(Array.from({ length: 30 }, (_, i) => 75 + i));
    expect(clip.chunks.some((c) => c.keyframe)).toBe(false);   // the recording's first chunk is gone with the eviction
    expect([clip.from, clip.to]).toEqual([76, 105]);   // the clip's cut: the first cluster at or after 75
    expect([...clip.bytes!.subarray(0, INIT.length)]).toEqual(INIT);   // the init segment (the bytes before the first Cluster) stays
  });

  it('(g) a window from the recording\'s start holds its first chunk once', async () => {
    const { ring, tick } = rig();
    ring.start();
    tick(5);
    const p = ring.pin(5, 5, 2);
    tick(2);
    const clip = await p;
    expect(clip.chunks.map((c) => c.at)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(clip.chunks.filter((c) => c.keyframe)).toHaveLength(1);
  });

  it('(h) after a restart a later clip holds the new stream\'s chunks only, nothing from before', async () => {
    const { ring, tick } = rig();
    ring.start();
    tick(50);
    ring.restart();
    tick(10);
    const p = ring.pin(58);
    tick(10);
    const clip = await p;
    expect(clip.chunks[0]!.at).toBe(50);
    expect(clip.chunks[0]!.keyframe).toBe(true);
    expect(clip.chunks.every((c) => c.at >= 50)).toBe(true);
    expect(clip.chunks.map((c) => c.at)).toEqual(Array.from({ length: 18 }, (_, i) => 50 + i));   // 50..67
  });

  it('(i) a window that begins before the oldest chunk held (evicted) is cut, though its after-window was recorded', async () => {
    const { ring, tick } = rig(90);
    ring.start();
    tick(100);                                           // the ring holds 10..99; 1..9 are gone
    const a = await ring.pin(3);                          // [-17, 13]
    expect(a.cut).toBe(true);
    expect(a.chunks.map((c) => c.at)).toEqual([10, 11, 12]);   // what survives of the window
    const b = await ring.pin(3, 20, 5);                   // [-17, 8]: nothing of the window survives
    expect(b.cut).toBe(true);
    expect(b.chunks).toEqual([]);
    // a window that starts before the recording did, with nothing evicted, is not cut (a mark in a segment's first 20 s)
    const r2 = rig(90);
    r2.ring.start();
    r2.tick(5);
    const early = r2.ring.pin(5);
    r2.tick(10);
    expect((await early).cut).toBe(false);
  });

  it('(j) the init segment is exactly the stream\'s bytes before its first Cluster, though split over three chunks', async () => {
    const { ring, tick } = rig();
    ring.start();
    tick(40);
    const clip = await ring.pin(25);                    // [5, 35]
    expect(clip.cut).toBe(false);
    expect([clip.from, clip.to]).toEqual([8, 35]);      // the first cluster at or after 5 starts in chunk 8; chunk 34 ends at 35
    expect([...clip.bytes!.subarray(0, INIT.length)]).toEqual(INIT);
    expect([...clip.bytes!]).toEqual([...INIT, ...streamBytes(8, 34)]);
  });

  it('(k) a Cluster ID straddling two chunks is found, and a clip may start on it', async () => {
    const { ring, tick } = rig();
    ring.start();
    tick(30);
    const clip = await ring.pin(20.5, 10, 2);           // [10.5, 22.5]: the first cluster at or after 10.5 starts in chunk 11
    expect(clip.from).toBe(11);
    expect(clip.to).toBe(22);
    expect([...clip.bytes!]).toEqual([...INIT, ...CLUSTER, ...streamBytes(12, 21).slice(2)]);
  });

  it('(l) a window holding no cluster starts at the last cluster before it, so the window is covered', async () => {
    const { ring, tick } = rig();
    ring.start();
    tick(10);
    const clip = await ring.pin(6, 1, 1);               // [5, 7]: clusters start in chunks 4 and 8
    expect([clip.from, clip.to]).toEqual([4, 7]);
    expect([...clip.bytes!]).toEqual([...INIT, ...streamBytes(4, 6)]);
  });

  it('(m) a pin before any cluster resolves cut, with no bytes, and says why', async () => {
    const { ring, tick } = rig();
    ring.start();
    tick(2);                                            // chunks 0 and 1: the header only
    const clip = await ring.pin(2, 2, 0);
    expect(clip.cut).toBe(true);
    expect(clip.bytes).toBeNull();
    expect(clip.why).toMatch(/cluster/i);
  });

  it('(n) a restart resets the cluster index and the init segment: a clip holds the new stream only', async () => {
    const { ring, tick } = rig();
    ring.start();
    tick(30);
    ring.restart();
    tick(1);                                            // the new stream's first byte only
    const early = await ring.pin(31, 1, 0);
    expect(early.bytes).toBeNull();                     // the old init segment and clusters are gone
    expect(early.cut).toBe(true);
    tick(19);
    const clip = await ring.pin(45, 20, 5);             // [25, 50]: the old stream's clusters at 26, 28 are not held
    expect(clip.from).toBe(32);                         // the new stream's first cluster: chunk 2 after the restart at 30
    expect([...clip.bytes!]).toEqual([...INIT, ...CLUSTER, 0x02, ...streamBytes(3, 19)]);
  });
});
