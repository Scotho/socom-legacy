import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Zar, type AssetSource } from '@s2u/archive';
import type { Rgba } from '@s2u/gs';
import * as assets from '../src/frontEndAssets';
import * as gpuTextures from '../src/uiGpuTextures';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';

// GM-29 (plan 2026-11-01-gpu-menus, row GM-29; product track, a browser adaptation): the front end's texture banks
// decoded ahead of the dialogs that draw them, off the page's main thread, into the lookup's cache -- and the lookup
// never waiting on it: a name asked before its answer is decoded synchronously, as without the prefetch, and keeps its
// object. A bank's arrival keeps every decode made so far (no cache clear: the cold OPTIONS switch's long frame on the
// T4, `agent-mail/evidence/gpu-menus/gm-f1-t4p/PROFILE.md`). Unit tests on the committed UIMP bank fixture (disc-derived);
// the decoder here is the worker's own answer run in this thread (`answerUiTextureDecode`), so the bytes are the worker's.
// The new exports are read through the module objects so a missing one fails its own test (the RED's counts).

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const ROOT = resolve(FIXTURES, 'RUN/UI');
const UIMP_PRESENT = ['UIMP_TXR.ZED', 'UIMP_PAL.ZED'].every((p) => existsSync(resolve(ROOT, p)));
const SKIP = UIMP_PRESENT ? '' : ` (${FIXTURES_ABSENT})`;

/** UIMP as itself and as a lazy `UIXX` (the same bytes again), counting reads. */
function source(reads: string[] = []): AssetSource {
  const files: Record<string, string> = {
    'RUN/UI/UIMP_TXR.ZED': 'UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED': 'UIMP_PAL.ZED',
    'RUN/UI/UIXX_TXR.ZED': 'UIMP_TXR.ZED', 'RUN/UI/UIXX_PAL.ZED': 'UIMP_PAL.ZED',
  };
  return { list: async () => [], read: async (p) => { reads.push(p); const n = files[p]; if (!n) throw new Error(`no ${p}`); return new Uint8Array(readFileSync(resolve(ROOT, n))); } };
}
const uimpNames = (): string[] =>
  (Zar.parse(new Uint8Array(readFileSync(resolve(ROOT, 'UIMP_TXR.ZED')))).find('textures')?.children ?? []).map((k) => k.name.toLowerCase());

type Decoder = (job: { txr: Uint8Array; pal: Uint8Array; names: string[]; hash: boolean }) => Promise<{ name: string; rgba: Rgba | null; fnv1a64?: string }[]>;
type Prefetch = { decoded: number; bytes: number; raced: number; capped: boolean; finished: Promise<string | null>; stop(): void };
type Page = ReturnType<typeof assets.pageUiTextures> & { prefetch(o: { decoder: Decoder; seedKey?: (image: Rgba, h: string) => void; maxBytes?: number }): Prefetch };

/** The worker's answer, in this thread (the bank's files copied, as a worker's structured clone copies them). */
async function inThread(): Promise<{ decoder: Decoder; jobs: string[][] }> {
  const w = await import('../src/frontEndTextureBank');
  const jobs: string[][] = [];
  const decoder: Decoder = async (job) => {
    jobs.push(job.names.slice());
    const { reply } = w.answerUiTextureDecode({ id: 0, ...job, txr: job.txr.slice(), pal: job.pal.slice() });
    if (!reply.ok) throw new Error(reply.error);
    return reply.decoded;
  };
  return { decoder, jobs };
}
const page = (src: AssetSource, lazy: readonly string[] = []): Page => assets.pageUiTextures(src, ['UIMP'], null, lazy) as Page;
const same = (a: Rgba | null, b: Rgba | null): boolean => !!a && !!b && a.width === b.width && a.height === b.height && Buffer.from(a.data).equals(Buffer.from(b.data));

describe('GM-29: the front end\'s textures prefetched off the main thread', () => {
  it('states its byte cap (an adaptation, no original): 32 MiB, above the 26,159,104 bytes of every bank the page loads', () => {
    expect((assets as Record<string, unknown>).UI_TEXTURE_PREFETCH_ADAPTATION).toEqual({ maxBytes: 32 * 1024 * 1024 });
  });

  it.skipIf(!UIMP_PRESENT)(`decodes every name of the loaded banks into the lookup's cache; a later ask is that object, its bytes the lookup's own${SKIP}`, async () => {
    const names = uimpNames();
    const p = page(source());
    await p.ready;
    const { decoder, jobs } = await inThread();
    const got = new Map<string, Rgba | null>();
    const pf = p.prefetch({ decoder: async (j) => { const r = await decoder(j); for (const g of r) got.set(g.name, g.rgba); return r; } });
    expect(await pf.finished).toBeNull();
    expect(jobs).toEqual([names]);                                            // one job: the bank's names, in its order
    expect(pf.decoded).toBe(names.length);
    expect(pf.raced).toBe(0);
    expect(pf.capped).toBe(false);
    expect(pf.bytes).toBe([...got.values()].reduce((n, r) => n + (r?.data.length ?? 0), 0));
    const plain = page(source());
    await plain.ready;
    for (const n of names) {
      const hit = p.textures(n.toUpperCase());                                // any case: the cache is by lower-cased name
      expect(hit, n).toBe(got.get(n));                                         // the prefetched object: no decode on the ask
      const own = plain.textures(n);
      expect(hit === null ? own === null : same(hit, own), `${n}: the lookup's bytes`).toBe(true);
    }
  });

  it.skipIf(!UIMP_PRESENT)(`a name asked before its answer is decoded synchronously, as today, and keeps its object when the answer comes${SKIP}`, async () => {
    const names = uimpNames();
    const p = page(source());
    await p.ready;
    const { decoder } = await inThread();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const pf = p.prefetch({ decoder: async (j) => { await gate; return decoder(j); } });
    await new Promise((r) => setTimeout(r, 0));
    const early = p.textures(names[0]!);                                      // the prefetch's answer is not in: decoded now
    const plain = page(source());
    await plain.ready;
    expect(same(early, plain.textures(names[0]!))).toBe(true);
    release();
    expect(await pf.finished).toBeNull();
    expect(pf.raced).toBe(1);
    expect(pf.decoded).toBe(names.length - 1);
    expect(p.textures(names[0]!)).toBe(early);                                // its object stays
  });

  it.skipIf(!UIMP_PRESENT)(`a bank loaded later keeps every decoded object (no decode cache clear)${SKIP}`, async () => {
    const names = uimpNames().slice(0, 4);
    const p = page(source(), ['UIXX']);
    await p.ready;
    const first = names.map((n) => p.textures(n));
    expect(first.every((x) => x !== null)).toBe(true);
    expect(await p.need({ libraries: [{ name: 'ui/assetlib/uixx' }] })).toEqual([]);
    expect(names.map((n) => p.textures(n))).toEqual(first);
    names.forEach((n, i) => expect(p.textures(n), n).toBe(first[i]));       // the same objects, not copies
  });

  it.skipIf(!UIMP_PRESENT)(`reads the lazy banks after the start's are in, as a build would; a build after reads nothing${SKIP}`, async () => {
    const reads: string[] = [];
    const p = page(source(reads), ['UIXX']);
    await p.ready;
    expect(reads).toEqual(['RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED']);
    reads.length = 0;
    const { decoder, jobs } = await inThread();
    const pf = p.prefetch({ decoder });
    expect(await pf.finished).toBeNull();
    expect(reads).toEqual(['RUN/UI/UIXX_TXR.ZED', 'RUN/UI/UIXX_PAL.ZED']);
    expect(jobs.length).toBe(1);                                              // UIXX's names are UIMP's: the first bank answers them
    reads.length = 0;
    expect(await p.need({ libraries: [{ name: 'ui/assetlib/uixx' }] })).toEqual([]);
    expect(reads).toEqual([]);
  });

  it.skipIf(!UIMP_PRESENT)(`the byte cap: past it nothing more is asked (capped), and the lookup decodes the rest as today${SKIP}`, async () => {
    const names = uimpNames();
    const p = page(source());
    await p.ready;
    const { decoder, jobs } = await inThread();
    const pf = p.prefetch({ decoder, maxBytes: 1 });
    expect(await pf.finished).toBeNull();
    expect(pf.capped).toBe(true);
    expect(jobs).toEqual([]);
    expect(pf.decoded).toBe(0);
    expect(p.textures(names[0]!)).not.toBeNull();
  });

  it.skipIf(!UIMP_PRESENT)(`stop(): nothing the decoder answers after it is cached${SKIP}`, async () => {
    const names = uimpNames();
    const p = page(source());
    await p.ready;
    const { decoder } = await inThread();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const got: Rgba[] = [];
    const pf = p.prefetch({ decoder: async (j) => { await gate; const r = await decoder(j); for (const g of r) if (g.rgba) got.push(g.rgba); return r; } });
    await new Promise((r) => setTimeout(r, 0));
    pf.stop();
    release();
    expect(await pf.finished).toBeNull();
    expect(pf.decoded).toBe(0);
    expect(p.textures(names[0]!)).not.toBe(got[0]);
  });

  it.skipIf(!UIMP_PRESENT)(`seeds the GPU texture cache's memo with the worker's fnv1a64 of the same bytes: the first key hashes nothing${SKIP}`, async () => {
    const seed = (gpuTextures as Record<string, unknown>).seedUiGpuTextureKey as ((image: Rgba, hash: string) => void) | undefined;
    expect(typeof seed).toBe('function');
    const names = uimpNames();
    const p = page(source());
    await p.ready;
    const { decoder } = await inThread();
    const seeded: [Rgba, string][] = [];
    const pf = p.prefetch({ decoder, seedKey: (im, h) => { seeded.push([im, h]); seed!(im, h); } });
    expect(await pf.finished).toBeNull();
    expect(seeded.length).toBe(names.length);
    for (const [im, h] of seeded) expect(h).toBe(gpuTextures.fnv1a64(im.data));
    const before = gpuTextures.uiGpuKeyCounts.hashed;
    for (const n of names) gpuTextures.uiGpuTextureKey(n, p.textures(n)!);
    expect(gpuTextures.uiGpuKeyCounts.hashed).toBe(before);
    // Without a seed the decoder is not asked to hash.
    const q = page(source());
    await q.ready;
    const asked: boolean[] = [];
    await q.prefetch({ decoder: async (j) => { asked.push(j.hash); return decoder(j); } }).finished;
    expect(asked).toEqual([false]);
  });

  it('a seeded memo is checked like a hashed one: a rewrite its probes see keys the image anew', () => {
    const seed = (gpuTextures as Record<string, unknown>).seedUiGpuTextureKey as ((image: Rgba, hash: string) => void) | undefined;
    expect(typeof seed).toBe('function');
    const im: Rgba = { width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]) };
    seed!(im, gpuTextures.fnv1a64(im.data));
    seed!(im, 'ffffffffffffffff');                                           // an image already memoised keeps its memo
    expect(gpuTextures.uiGpuTextureKey('a.tif', im)).toBe(`a.tif|2x1|${gpuTextures.fnv1a64(im.data)}`);
    im.data[0] = 9;
    const rewritten = gpuTextures.uiGpuKeyCounts.rewritten;
    expect(gpuTextures.uiGpuTextureKey('a.tif', im)).toBe(`a.tif|2x1|${gpuTextures.fnv1a64(im.data)}`);
    expect(gpuTextures.uiGpuKeyCounts.rewritten).toBe(rewritten + 1);
  });
});

/**
 * GM-29: the page's start of the prefetch (`frontEnd.ts` calls `startPageUiTexturePrefetch` once its frame loop is
 * running): after the next animation frame, at the page's idle (`requestIdleCallback`, else a timeout), with the page's
 * decode worker; nothing without a worker; the worker closed when the prefetch ends; `stop` before the start starts
 * nothing. The page's frame loop never waits on it.
 */
describe('GM-29: the page starts the prefetch after a frame, at idle', () => {
  type Start = (win: unknown, page: unknown, seedKey: unknown, decoderOf: unknown) => () => void;
  const start = (): Start => {
    const f = (assets as Record<string, unknown>).startPageUiTexturePrefetch;
    expect(typeof f).toBe('function');
    return f as Start;
  };
  const fakeWin = (idle: boolean) => {
    const frames: (() => void)[] = [], idles: (() => void)[] = [], timers: (() => void)[] = [];
    const win = {
      requestAnimationFrame: (f: () => void) => { frames.push(f); return 1; },
      setTimeout: (f: () => void) => { timers.push(f); return 1; },
      ...(idle ? { requestIdleCallback: (f: () => void) => { idles.push(f); return 1; } } : {}),
    };
    return { win, frames, idles, timers };
  };
  const fakePage = () => {
    const calls: unknown[] = [];
    let end!: (v: string | null) => void;
    const finished = new Promise<string | null>((r) => { end = r; });
    let stopped = false;
    return { page: { prefetch: (o: unknown) => { calls.push(o); return { finished, stop: () => { stopped = true; } }; } }, calls, end: (v: string | null) => end(v), stopped: () => stopped };
  };

  it('waits for a frame, then the idle callback; then prefetches with the worker\'s decoder and closes it at the end', async () => {
    const s = start(), w = fakeWin(true), p = fakePage();
    let closed = 0;
    const decoder = async () => [];
    s(w.win, p.page, undefined, () => ({ decoder, close: () => { closed++; } }));
    expect(p.calls.length).toBe(0);
    expect(w.idles.length).toBe(0);
    w.frames.shift()!();
    expect(p.calls.length).toBe(0);
    w.idles.shift()!();
    expect(p.calls).toEqual([{ decoder }]);
    p.end(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(closed).toBe(1);
  });

  it('passes the seed when given; a page without requestIdleCallback starts it from a timeout', () => {
    const s = start(), w = fakeWin(false), p = fakePage();
    const seed = (): void => undefined, decoder = async () => [];
    s(w.win, p.page, seed, () => ({ decoder, close: () => undefined }));
    w.frames.shift()!();
    w.timers.shift()!();
    expect(p.calls).toEqual([{ decoder, seedKey: seed }]);
  });

  it('no worker: nothing; stop before the start: nothing; stop after: the prefetch stopped and the worker closed', async () => {
    const s = start();
    const a = fakeWin(true), pa = fakePage();
    s(a.win, pa.page, undefined, () => null);
    a.frames.shift()!(); a.idles.shift()?.();
    expect(pa.calls.length).toBe(0);
    const b = fakeWin(true), pb = fakePage();
    let made = 0;
    const stopB = s(b.win, pb.page, undefined, () => { made++; return { decoder: async () => [], close: () => undefined }; });
    stopB();
    b.frames.shift()?.(); b.idles.shift()?.();
    expect([made, pb.calls.length]).toEqual([0, 0]);
    const c = fakeWin(true), pc = fakePage();
    let closed = 0;
    const stopC = s(c.win, pc.page, undefined, () => ({ decoder: async () => [], close: () => { closed++; } }));
    c.frames.shift()!(); c.idles.shift()!();
    stopC();
    expect(pc.stopped()).toBe(true);
    expect(closed).toBe(1);
  });
});

/**
 * GM-29 review folds (PASS WITH FINDINGS): 1, a stop mid-prefetch is not a failure (the closed worker's rejection says
 * nothing); 2, a stop before the start's banks are in reads nothing more from that page's source; 3, the worker's entry
 * is the only module that wires `onmessage` -- the bank decode the page imports is side-effect free.
 */
describe('GM-29 review folds: the prefetch stopped, and the worker entry kept apart', () => {
  it.skipIf(!UIMP_PRESENT)(`1: a stop while a decode is out ends it quietly -- finished null, no warning from the page's start${SKIP}`, async () => {
    const p = page(source());
    await p.ready;
    let reject!: (e: Error) => void;
    const pf = p.prefetch({ decoder: () => new Promise((_ok, no) => { reject = no; }) });
    await new Promise((r) => setTimeout(r, 0));
    pf.stop();
    reject(new Error('frontEndTextureWorker: closed'));                     // what `close()` does to the request out
    expect(await pf.finished).toBeNull();
    // The page's start: its stop closes the worker, and the closed request's rejection logs nothing.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const frames: (() => void)[] = [], idles: (() => void)[] = [];
      const win = { requestAnimationFrame: (f: () => void) => { frames.push(f); }, setTimeout: () => undefined, requestIdleCallback: (f: () => void) => { idles.push(f); } };
      const q = page(source());
      await q.ready;
      const waiting: ((e: Error) => void)[] = [];
      const stop = (assets as unknown as { startPageUiTexturePrefetch: (...a: unknown[]) => () => void }).startPageUiTexturePrefetch(win, q, undefined, () => ({
        decoder: () => new Promise((_ok, no) => { waiting.push(no); }),
        close: () => { for (const no of waiting.splice(0)) no(new Error('frontEndTextureWorker: closed')); },
      }));
      frames.shift()!(); idles.shift()!();
      await new Promise((r) => setTimeout(r, 0));
      expect(waiting.length).toBe(1);
      stop();
      await new Promise((r) => setTimeout(r, 0));
      expect(warn).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it.skipIf(!UIMP_PRESENT)(`1: a decode that fails without a stop is still said (finished names it)${SKIP}`, async () => {
    const p = page(source());
    await p.ready;
    const pf = p.prefetch({ decoder: async () => { throw new Error('frontEndTextureWorker: the worker failed'); } });
    expect(await pf.finished).toBe('frontEndTextureWorker: the worker failed');
  });

  it.skipIf(!UIMP_PRESENT)(`2: a stop before the start's banks are in reads no lazy bank from that source, and asks no decode${SKIP}`, async () => {
    const reads: string[] = [];
    const p = page(source(reads), ['UIXX']);
    const jobs: string[][] = [];
    const pf = p.prefetch({ decoder: async (j) => { jobs.push(j.names); return []; } });
    pf.stop();                                                                // during `await ready`
    await p.ready;
    expect(await pf.finished).toBeNull();
    expect(reads).toEqual(['RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED']);
    expect(jobs).toEqual([]);
  });

  it.skipIf(!UIMP_PRESENT)(`2: a stop while the lazy banks are read asks no decode after them${SKIP}`, async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const base = source();
    const slow: AssetSource = { list: base.list, read: async (path) => { if (path.includes('UIXX')) await gate; return base.read(path); } };
    const p = page(slow, ['UIXX']);
    await p.ready;
    const jobs: string[][] = [];
    const pf = p.prefetch({ decoder: async (j) => { jobs.push(j.names); return []; } });
    await new Promise((r) => setTimeout(r, 0));
    pf.stop();
    release();
    expect(await pf.finished).toBeNull();
    expect(jobs).toEqual([]);
  });

  it('3: the page imports the bank decode from a side-effect-free module; only the worker entry wires onmessage', async () => {
    const { readFileSync } = await import('node:fs');
    const src = (f: string): string => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    const assetsSrc = src('frontEndAssets.ts'), bank = src('frontEndTextureBank.ts'), entry = src('frontEndTextureWorker.ts');
    expect(assetsSrc).not.toMatch(/from '\.\/frontEndTextureWorker'/);              // the worker entry: by URL only
    expect(assetsSrc).toMatch(/new URL\('\.\/frontEndTextureWorker\.ts', import\.meta\.url\)/);
    expect(assetsSrc).toMatch(/from '\.\/frontEndTextureBank'/);
    expect(bank).not.toMatch(/WorkerGlobalScope|onmessage\s*=|^serveUiTextureDecode\(|^if \(/m);   // no statement at import but declarations
    for (const line of bank.split(/\r?\n/)) if (/^[a-z]/.test(line)) expect(line, line).toMatch(/^(import|export|const|function|interface|type) /);
    expect(entry).toMatch(/WorkerGlobalScope/);
    expect(entry).toMatch(/from '\.\/frontEndTextureBank'/);
    expect(entry.match(/^export /m)).toBeNull();                                   // the entry exports nothing for a page to import
  });
});
