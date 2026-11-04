import { afterEach, describe, expect, it } from 'vitest';
import type { PssPacket } from '../src/pss';
import { MovieDecoder } from '../src/decodeStream';
import { MovieClient, serveMovies, type MovieEndMessage, type MovieFrame, type MovieHost } from '../src/decodeProtocol';
import { BackgroundMoviePlayer, MOVIE_END, MOVIE_PENDING } from '../src/player';
import { MovieBudget, MovieWorkerSource, type MovieStreamHandle } from '../src/realtime';
import { FakeEngine, W, H, es, gop } from './fakeEngine';

/**
 * PLAT-19c, real time and its budget (web research 120 §11): the decoder's cost per picture measured where it is spent
 * (the core, on a clock passed in), carried with each picture across the worker, and counted page-side per movie --
 * start-up, pictures, late ticks, dropped or repeated pictures, the worker's queue depth; the worker's stream as
 * PLAT-21's picture source; and the original's rule for a host that cannot keep up (`FUN_0030b1d0` retries
 * `sceMpegGetPicture` until it has a picture, D:L208692-208699: the movie slows, no picture is dropped), held on the
 * player over a stream that is late. No wasm, no disc: the fake engine and synthetic streams of `fakeEngine.ts`.
 */

/** A clock that moves `step` ms each time it is read. */
const ticking = (step = 1): (() => number) => { let t = 0; return () => (t += step); };

const packets = (bytes: Uint8Array, size = 50): AsyncIterable<PssPacket> => (async function* () {
  for (let at = 0; at < bytes.length; at += size) yield { streamId: 0xe0, offset: at, data: bytes.slice(at, at + size) } satisfies PssPacket;
})();

const frame = (index: number, extra: Partial<MovieFrame> = {}): MovieFrame => ({
  kind: 'picture', index, codingIndex: index, type: 'I', temporalReference: index, pts: null, width: W, height: H,
  rgba: new ArrayBuffer(W * H * 4), ...extra,
});
const end = (pictures: number, error: string | null = null): MovieEndMessage => ({ kind: 'end', pictures, coded: pictures, invalid: 0, error });

/** A stream handle answering a script: a frame, null (late) or the end, one per tick; records releases and closes. */
function scripted(script: (MovieFrame | MovieEndMessage | null)[]): MovieStreamHandle & { released: ArrayBuffer[]; closed: number } {
  let at = 0;
  const h = {
    released: [] as ArrayBuffer[],
    closed: 0,
    tick: () => (at < script.length ? script[at++]! : script[script.length - 1]!),
    release: (b: ArrayBuffer) => { h.released.push(b); },
    close: () => { h.closed++; },
  };
  return h;
}

describe('the decode cost, measured in the core on the clock it is given', () => {
  it('each picture carries the decoder\'s time and the read time spent since the picture before; no clock, no cost', async () => {
    const timed = new MovieDecoder(new FakeEngine(), { output: 'rgba', now: ticking(1) });
    timed.open(packets(es(gop(9, 10))));
    const costs = [];
    for (;;) {
      const r = await timed.next();
      if (r.kind === 'end') break;
      expect(r.picture.cost).toBeDefined();
      costs.push(r.picture.cost!);
    }
    expect(costs.length).toBe(9);
    for (const c of costs) {
      expect(c.decodeMs).toBeGreaterThan(0);          // at least one engine call and the conversion, each read by the clock
      expect(c.readMs).toBeGreaterThanOrEqual(0);
    }
    // The first picture pays for the reads before it (the headers and its own coded picture).
    expect(costs[0]!.readMs).toBeGreaterThan(0);

    const untimed = new MovieDecoder(new FakeEngine(), { output: 'rgba' });
    untimed.open(packets(es(gop(3, 10))));
    const r = await untimed.next();
    expect(r.kind === 'picture' && r.picture.cost).toBeUndefined();
  });
});

const ports: MessagePort[] = [];
afterEach(() => { for (const p of ports.splice(0)) p.close(); });

describe('the cost across the worker', () => {
  it('a picture message carries its decode and read time and the worker\'s decoded queue at the answer', async () => {
    const channel = new MessageChannel();
    ports.push(channel.port1, channel.port2);
    const host: MovieHost<null> = { engine: async () => new FakeEngine(), packets: () => packets(es(gop(12, 10))) };
    serveMovies(channel.port1, host, { queue: 3, now: ticking(1) });
    const movie = new MovieClient<null>(channel.port2).open('A.PSS', null, 'w');
    const got: MovieFrame[] = [];
    for (;;) {
      const r = await movie.next();
      if (r.kind === 'end') break;
      got.push(r);
      movie.release(r.rgba);
    }
    expect(got.length).toBe(12);
    for (const f of got) {
      expect(f.decodeMs).toBeGreaterThan(0);
      expect(f.readMs).toBeGreaterThanOrEqual(0);
      expect(f.queued).toBeGreaterThanOrEqual(0);
      expect(f.queued).toBeLessThanOrEqual(3);
    }
  });
});

describe('the worker\'s stream as the player\'s picture source', () => {
  it('maps the hand-off: a picture, MOVIE_PENDING while late, MOVIE_END at the end; the shown picture\'s buffer goes back once the next is handed out', () => {
    const f0 = frame(0), f1 = frame(1);
    const handle = scripted([null, f0, null, f1, end(2)]);
    const src = new MovieWorkerSource({ open: () => handle });
    expect(src.open('run/movies/common/sony448.pss', { audioStream: 0 })).toBe(true);
    expect(src.next()).toBe(MOVIE_PENDING);
    expect(src.next()).toBe(f0);
    expect(handle.released).toEqual([]);
    expect(src.next()).toBe(MOVIE_PENDING);
    expect(src.next()).toBe(f1);
    // By identity: the buffer of the picture before goes back, never the one just handed out (still on the sink, and
    // transferred and detached in the page). Content equality cannot tell two fresh buffers of one size apart.
    expect(handle.released).toHaveLength(1);
    expect(handle.released[0]).toBe(f0.rgba);
    expect(handle.released[0]).not.toBe(f1.rgba);
    expect(src.next()).toBe(MOVIE_END);
    expect(src.lastEnd).toMatchObject({ pictures: 2, error: null });
  });

  it('a file not on the disc does not open (FUN_003098e0 fails), so the build fires event 3 at once', () => {
    let opened = 0;
    const src = new MovieWorkerSource({ open: () => { opened++; return scripted([end(0)]); }, exists: (n) => n !== 'run/movies/tut_11.pss' });
    expect(src.open('run/movies/tut_11.pss', { audioStream: 0 })).toBe(false);
    expect(opened).toBe(0);
    const ended: number[] = [];
    const player = new BackgroundMoviePlayer({ source: src, sink: { present: () => {} }, onEnd: () => ended.push(1) });
    player.build({ type: 1, filename: 'run/movies/tut_11.pss' });
    expect(ended).toEqual([1]);
  });

  it('restart is a fresh open of the same file (the clean seek, research 121 §5); close lets the stream go', () => {
    const handles: ReturnType<typeof scripted>[] = [];
    const names: string[] = [];
    const src = new MovieWorkerSource({ open: (n) => { names.push(n); const h = scripted([frame(0), end(1)]); handles.push(h); return h; } });
    src.open('A.PSS', { audioStream: 0 });
    expect(src.next()).toMatchObject({ index: 0 });
    src.restart();
    expect(handles[0]!.closed).toBe(1);
    expect(src.next()).toMatchObject({ index: 0 });
    src.close();
    expect(handles[1]!.closed).toBe(1);
    expect(names).toEqual(['A.PSS', 'A.PSS']);
  });
});

describe('the budget, per movie', () => {
  it('counts start-up, late ticks after the first picture, the decode cost and the queue, and the presented rate', () => {
    const b = new MovieBudget('INTRO_2');
    b.open(1000);
    b.late(1010);                                    // before the first picture: start-up, not late
    b.late(1043);
    b.picture({ index: 0, decodeMs: 4, readMs: 1, queued: 0 }, 1077);
    b.picture({ index: 1, decodeMs: 2, readMs: 0, queued: 2 }, 1110);
    b.late(1143);
    b.picture({ index: 2, decodeMs: 6, readMs: 0, queued: 1 }, 1177);
    b.end(end(3), 1210);
    const r = b.report();
    expect(r).toMatchObject({ movie: 'INTRO_2', startupMs: 77, startupTicks: 2, pictures: 3, lateTicks: 1, dropped: 0, repeated: 0, ticks: 7 });
    expect(r.decodeMs).toMatchObject({ n: 3, mean: 4, max: 6, p50: 4 });
    expect(r.queue).toMatchObject({ min: 0, max: 2, mean: 1 });
    expect(r.presentedFps).toBeCloseTo(2 / 0.1, 6);
    expect(r.sustained).toBe(false);                 // one late tick
    expect(r.end).toMatchObject({ pictures: 3, error: null });
  });

  it('a gap in the pictures\' indices is a dropped picture, an index again a repeated one, a short end a dropped tail', () => {
    const b = new MovieBudget('X');
    b.open(0);
    for (const [i, t] of [[0, 1], [1, 2], [3, 3], [3, 4], [4, 5]] as const) b.picture({ index: i }, t);
    b.end(end(7), 6);
    const r = b.report();
    expect(r.dropped).toBe(1 + 2);                   // index 2, and 5-6 the decoder showed and the page never presented
    expect(r.repeated).toBe(1);
    expect(r.decodeMs).toBeNull();
    expect(r.sustained).toBe(false);
  });

  it('a movie presented every tick with every picture once is sustained', () => {
    const b = new MovieBudget('SONY448');
    b.open(0);
    for (let i = 0; i < 10; i++) b.picture({ index: i, decodeMs: 1 }, 100 + i * 33.3667);
    b.end(end(10), 500);
    expect(b.report()).toMatchObject({ sustained: true, lateTicks: 0, dropped: 0, repeated: 0 });
  });

  it('the source keeps one budget per open, on its clock', () => {
    let t = 0;
    const src = new MovieWorkerSource({ open: () => scripted([null, frame(0, { decodeMs: 3, queued: 1 }), end(1)]), now: () => (t += 10) });
    src.open('A.PSS', { audioStream: 0 });
    while (src.next() !== MOVIE_END) { /* tick */ }
    src.open('B.PSS', { audioStream: 0 });
    expect(src.budgets.map((m) => m.movie)).toEqual(['A.PSS', 'B.PSS']);
    expect(src.budgets[0]!.report()).toMatchObject({ pictures: 1, startupTicks: 1, startupMs: 20, lateTicks: 0, end: { pictures: 1 } });
  });
});

describe('a host that cannot keep up (FUN_0030b1d0: the original stalls the frame for its picture, D:L208692-208699)', () => {
  it('every picture is presented once and in order, the movie slowed by its late ticks, event 3 once after the last', () => {
    const N = 8;
    // Late on every third tick after the first picture, as a decoder that is slower than the tick a third of the time.
    const script: (MovieFrame | MovieEndMessage | null)[] = [null];
    for (let i = 0; i < N; i++) { script.push(frame(i)); if (i % 3 === 2) script.push(null); }
    script.push(end(N));
    let t = 0;
    const src = new MovieWorkerSource({ open: () => scripted(script), now: () => (t += 1001 / 30) });
    const shown: number[] = [];
    let events = 0;
    const player = new BackgroundMoviePlayer<MovieFrame>({ source: src, sink: { present: (f) => shown.push(f.index) }, onEnd: () => events++ });
    player.build({ type: 1, filename: 'run/movies/intro_2.pss' });
    let ticks = 0;
    while (player.state === 'PLAYING' || player.state === 'ENDED') { player.tick(); ticks++; if (ticks > 100) break; }
    expect(shown).toEqual(Array.from({ length: N }, (_, i) => i));
    expect(events).toBe(1);
    const late = script.filter((s) => s === null).length - 1;    // the first is start-up
    // N pictures + the late ticks + the start-up tick + the NODATA tick + the event's tick (research 121 rows 6, 8).
    expect(ticks).toBe(N + late + 1 + 2);
    expect(src.budgets[0]!.report()).toMatchObject({ pictures: N, lateTicks: late, dropped: 0, repeated: 0, sustained: false });
  });
});
