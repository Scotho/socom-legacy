import { afterEach, describe, expect, it } from 'vitest';
import type { PssPacket } from '../src/pss';
import { MovieClient, MovieStream, serveMovies,type MovieHost, type MoviePort } from '../src/decodeProtocol';
import { FakeEngine, H, W, es, gop } from './fakeEngine';

/**
 * The worker's interface (research 120 §3), over a real `MessageChannel` -- the page's end and the worker's end of a
 * Worker are message ports; here both live in this thread. The worker side is fed a synthetic stream and the fake
 * libmpeg2 of `fakeEngine.ts` (no wasm, no disc bytes). What is held: open, next picture, end; the pictures' buffers
 * moved (in the transfer list), not copied, and handed back for reuse; one engine for a second movie; a failed open
 * reported as the end with its error; the per-tick hand-off that never waits.
 */

const ports: MessagePort[] = [];
afterEach(() => { for (const p of ports.splice(0)) p.close(); });

/** A port that records the transfer list of every message it posts. */
function spy(port: MessagePort): { port: MoviePort; transfers: unknown[][] } {
  const transfers: unknown[][] = [];
  return {
    transfers,
    port: {
      postMessage: (m: unknown, t?: Transferable[]) => { transfers.push(t ?? []); port.postMessage(m, t ?? []); },
      addEventListener: (type: 'message', f: (e: MessageEvent) => void) => port.addEventListener(type, f),
      start: () => port.start(),
    },
  };
}

const MOVIES: Record<string, Uint8Array> = { 'A.PSS': es(gop(12, 10)), 'B.PSS': es(gop(5, 200)) };

function setup(o: { failEngine?: boolean; failEngineOnce?: boolean } = {}) {
  const channel = new MessageChannel();
  ports.push(channel.port1, channel.port2);
  const engines: FakeEngine[] = [];
  const opened: string[] = [];
  const asked: string[] = [];
  const host: MovieHost<{ disc: string }> = {
    engine: async (wasm) => {
      asked.push(wasm);
      if (o.failEngineOnce && asked.length === 1) throw new Error(`${wasm}: fetch failed (the dev server was not ready)`);
      if (o.failEngine) throw new Error(`${wasm}: 404 (the decoder is not built: packages/fmv/wasm/build.sh)`);
      const e = new FakeEngine();
      engines.push(e);
      return e;
    },
    packets: (source, path, signal) => {
      opened.push(`${source.disc}:${path}`);
      const bytes = MOVIES[path];
      return (async function* () {
        if (!bytes) throw new Error(`${path}: not on the disc`);
        for (let at = 0; at < bytes.length; at += 50) {
          signal.throwIfAborted();
          yield { streamId: 0xe0, offset: at, data: bytes.slice(at, at + 50) } satisfies PssPacket;
        }
      })();
    },
  };
  const worker = spy(channel.port1);
  const served = serveMovies(worker.port, host, { queue: 2 });
  const client = new MovieClient<{ disc: string }>(channel.port2);
  return { client, served, worker, engines, opened, asked };
}

describe('the movie worker\'s interface (MessageChannel, fake decoder)', () => {
  it('open, then next picture until the end: every picture in display order, RGBA, then the end with its counts', async () => {
    const { client, opened } = setup();
    const movie = client.open('A.PSS', { disc: 'iso' }, '/fmv/libmpeg2.wasm');
    const got = [];
    for (;;) {
      const r = await movie.next();
      if (r.kind === 'end') { expect(r).toMatchObject({ pictures: 12, coded: 12, invalid: 0, error: null }); break; }
      got.push(r);
      expect(r.width).toBe(W);
      expect(r.height).toBe(H);
      expect(r.rgba.byteLength).toBe(W * H * 4);
    }
    expect(got.map((p) => p.index)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(got.map((p) => p.temporalReference)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(opened).toEqual(['iso:A.PSS']);
    expect((await movie.next()).kind).toBe('end');
  });

  it('moves each picture\'s buffer in the transfer list, and reuses the buffers the page hands back', async () => {
    const { client, served, worker } = setup();
    const movie = client.open('A.PSS', { disc: 'iso' }, 'w');
    for (;;) {
      const r = await movie.next();
      if (r.kind === 'end') break;
      movie.release(r.rgba);
    }
    const pictureMessages = worker.transfers.filter((t) => t.length > 0);
    expect(pictureMessages.length).toBe(12);
    for (const t of pictureMessages) expect(t[0]).toBeInstanceOf(ArrayBuffer);
    // With every buffer handed back, the worker holds a few, not one per picture.
    expect(served.stats.allocated).toBeLessThanOrEqual(2 + 3);
    expect(served.stats.allocated).toBeLessThan(12);
  });

  it('a second movie on the same engine: the first is let go, the second starts at its picture 0', async () => {
    const { client, engines } = setup();
    const a = client.open('A.PSS', { disc: 'iso' }, 'w');
    await a.next();
    const b = client.open('B.PSS', { disc: 'iso' }, 'w');
    const lumas: number[] = [];
    for (;;) {
      const r = await b.next();
      if (r.kind === 'end') break;
      // The IPU's conversion of luma 200 + i at Cb 100, Cr 150: the R channel rises with the luma.
      lumas.push(new Uint8Array(r.rgba)[0]!);
      expect(r.index).toBe(lumas.length - 1);
    }
    expect(lumas.length).toBe(5);
    expect(engines.length).toBe(1);
    expect(engines[0]!.resets).toBe(2);
    // The superseded movie answers the end, not a picture of B.
    expect((await a.next()).kind).toBe('end');
  });

  it('a movie that will not open (a path not on the disc) ends at once with the reason', async () => {
    const { client } = setup();
    const r = await client.open('NOPE.PSS', { disc: 'iso' }, 'w').next();
    expect(r).toMatchObject({ kind: 'end', pictures: 0, error: expect.stringMatching(/not on the disc/) });
  });

  it('a decoder that will not load ends every movie with the reason', async () => {
    const { client } = setup({ failEngine: true });
    const r = await client.open('A.PSS', { disc: 'iso' }, '/fmv/libmpeg2.wasm').next();
    expect(r).toMatchObject({ kind: 'end', pictures: 0, error: expect.stringMatching(/not built/) });
  });

  it('a decoder that failed to load once is asked again by the next open, at that open\'s wasm URL', async () => {
    const { client, asked, engines } = setup({ failEngineOnce: true });
    const first = await client.open('A.PSS', { disc: 'iso' }, '/fmv/early.wasm').next();
    expect(first).toMatchObject({ kind: 'end', pictures: 0, error: expect.stringMatching(/fetch failed/) });
    const second = await client.open('B.PSS', { disc: 'iso' }, '/fmv/libmpeg2.wasm').next();
    expect(second.kind).toBe('picture');
    expect(asked).toEqual(['/fmv/early.wasm', '/fmv/libmpeg2.wasm']);
    expect(engines.length).toBe(1);
  });

  it('the per-tick hand-off never waits: null until a picture has arrived, then one per call, then the end', async () => {
    const { client } = setup();
    const movie = client.open('B.PSS', { disc: 'iso' }, 'w');
    expect(movie.tick()).toBeNull();                 // asked; nothing has come back yet
    const seen: number[] = [];
    let end = null;
    for (let spins = 0; spins < 1000 && !end; spins++) {
      const r = movie.tick();
      if (r === null) { await new Promise((f) => setTimeout(f, 0)); continue; }
      if (r.kind === 'end') end = r;
      else { seen.push(r.index); movie.release(r.rgba); }
    }
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(end).toMatchObject({ kind: 'end', pictures: 5 });
    expect(movie.tick()).toMatchObject({ kind: 'end' });
  });

  it('close lets the stream go; the worker answers that movie\'s requests with the end', async () => {
    const { client } = setup();
    const movie = client.open('A.PSS', { disc: 'iso' }, 'w');
    await movie.next();
    movie.close();
    expect((await movie.next()).kind).toBe('end');
  });

  it('close drops a picture that arrived before it: the next tick is the end, not one more frame', async () => {
    const { client } = setup();
    const movie = client.open('A.PSS', { disc: 'iso' }, 'w');
    expect(movie.tick()).toBeNull();                 // the prefetch is asked
    for (let spins = 0; spins < 1000 && movie.idle === false; spins++) await new Promise((f) => setTimeout(f, 0));
    await new Promise((f) => setTimeout(f, 0));      // the prefetched picture is now held, unshown
    movie.close();
    expect(movie.tick()).toMatchObject({ kind: 'end', pictures: 0, error: null }); // the dropped one is not counted
  });

  it('a superseded stream\'s held picture is dropped too: its next tick is the end', async () => {
    const { client } = setup();
    const a = client.open('A.PSS', { disc: 'iso' }, 'w');
    expect(a.tick()).toBeNull();
    for (let spins = 0; spins < 1000 && a.idle === false; spins++) await new Promise((f) => setTimeout(f, 0));
    await new Promise((f) => setTimeout(f, 0));
    client.open('B.PSS', { disc: 'iso' }, 'w');
    expect(a.tick()).toMatchObject({ kind: 'end', error: expect.stringMatching(/superseded/) });
  });

  it('a picture that arrives after close (the prefetch still in flight) is not held: no buffer kept, the tick is the end', async () => {
    // The stream alone, over a client that records its requests: the late answer is delivered by hand, after close,
    // which a real channel cannot order deterministically. White-box on `ready`: the held picture is the claim.
    const sent: string[] = [];
    const s = new MovieStream({ send: (r) => sent.push(r.type) }, 1);
    expect(s.tick()).toBeNull();                     // the prefetch is asked
    s.close();
    const rgba = new ArrayBuffer(W * H * 4);
    s.receive({ kind: 'picture', index: 0, codingIndex: 0, type: 'I', temporalReference: 0, pts: null, width: W, height: H, rgba });
    await Promise.resolve();                         // the prefetch's continuation runs
    expect(sent).toEqual(['next', 'close']);
    expect((s as unknown as { ready: unknown }).ready).toBeNull();
    expect(s.tick()).toMatchObject({ kind: 'end', pictures: 0, error: null });
  });
});
