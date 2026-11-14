// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { matchLoader, type MatchWorker } from '../src/matchMount';
import { pageMatchDiag, resetPageMatchDiagForTest } from '../src/matchDiagPage';
import { markLoad } from '../src/loadMarks';
import type { ViewerRequest, ViewerResponse } from '../src/worker';

/**
 * Browser adaptation (no original; product track, PR #631's Xbox memory work): under the Xbox preset the match
 * loader's worker -- the map's archive, its decode garbage, the sound banks and the loops' samples alive in it -- is
 * let go once a load's assets are in and nothing is asked of it; the next request makes a fresh one. Every other
 * player keeps the worker as before.
 */

/** A fake `./worker`: what it was asked, and its answers by hand. */
function fakeWorkers() {
  const made: { asked: ViewerRequest[]; terminated: number; say: (m: unknown) => void; fail: () => void }[] = [];
  const make = (): MatchWorker => {
    let hear: ((e: MessageEvent<ViewerResponse>) => void) | null = null;
    let broke: (() => void) | null = null;
    const w = { asked: [] as ViewerRequest[], terminated: 0, say: (m: unknown) => { hear!({ data: m } as MessageEvent<ViewerResponse>); }, fail: () => { broke!(); } };
    made.push(w);
    return {
      postMessage: (r) => { w.asked.push(r); },
      addEventListener: ((type: string, fn: (e: MessageEvent<ViewerResponse>) => void) => { if (type === 'message') hear = fn; else if (type === 'error') broke = fn as unknown as () => void; }) as MatchWorker['addEventListener'],
      terminate: () => { w.terminated++; },
    };
  };
  return { made, make };
}

const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

/** Answers a load's four requests on `w` (map, play, then effects and the sound's two answers), from `from` on. */
async function answer(w: { asked: ViewerRequest[]; say: (m: unknown) => void }, from = 0): Promise<void> {
  const mine = w.asked.slice(from);
  const load = mine.find((r) => r.kind === 'load')!;
  const play = mine.find((r) => r.kind === 'play')!;
  const before = w.asked.length;             // the effects and sound this map's answer asks come after
  w.say({ kind: 'map', id: load.id, map: { path: 'RUN/MP2.ZDB', archive: 'MP2' } });
  w.say({ kind: 'play', id: play.id, data: null });
  await flush();
  const later = w.asked.slice(before);
  const effects = later.find((r) => r.kind === 'effects')!;
  const sound = later.find((r) => r.kind === 'sound')!;
  w.say({ kind: 'effects', id: effects.id, data: null });
  w.say({ kind: 'sound', id: sound.id, data: { banks: [] } });
  w.say({ kind: 'soundLoops', id: sound.id, loops: [] });
  await flush();
}

const SOURCE = { kind: 'http', baseUrl: '/maps' } as never;

afterEach(() => { window.history.replaceState(null, '', '/'); });

describe('matchLoader under the Xbox preset lets its worker go once a load is in (browser adaptation, PR #631)', () => {
  it('Xbox decoding releases each asset decoder before the next one, retaining both sound replies', async () => {
    window.history.replaceState(null, '', '/?renderer=xbox');
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make);
    const loaded = loader.load('mp2');
    expect(made[0]!.asked.map((r) => r.kind)).toEqual(['load']);
    made[0]!.say({ kind: 'map', id: made[0]!.asked[0]!.id, map: { path: 'RUN/MP2.ZDB', archive: 'MP2' } });
    await flush();
    expect(made[0]!.terminated).toBe(1);
    expect(made[1]!.asked[0]!.kind).toBe('play');
    made[1]!.say({ kind: 'play', id: made[1]!.asked[0]!.id, data: null });
    await flush();
    expect(made[1]!.terminated).toBe(1);
    expect(made[2]!.asked[0]!.kind).toBe('effects');
    made[2]!.say({ kind: 'effects', id: made[2]!.asked[0]!.id, data: null });
    await flush();
    const w = made[3]!, id = w.asked[0]!.id;
    expect(w.asked[0]!.kind).toBe('sound');
    w.say({ kind: 'sound', id, data: { banks: [] } });
    expect(w.terminated).toBe(0);
    w.say({ kind: 'soundLoops', id, loops: [] });
    expect((await loaded)?.sound).toEqual({ data: { banks: [] }, loops: [] });
    expect(made.map((w) => w.terminated)).toEqual([1, 1, 1, 1]);
    loader.dispose();
  });

  it('disposal during a staged load cannot launch another decoder', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, { serialWorkerRequests: true });
    const loaded = loader.load('mp2');
    made[0]!.say({ kind: 'map', id: made[0]!.asked[0]!.id, map: { path: 'RUN/MP2.ZDB', archive: 'MP2' } });
    loader.dispose();
    await loaded;
    await flush();
    expect(made).toHaveLength(1);
    expect(made[0]!.terminated).toBe(1);
  });

  it('the worker is terminated after the load settles, and a later load makes a fresh one', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, { releaseWorkerAfterLoad: true });
    const a = loader.load('mp2');
    expect(made).toHaveLength(1);
    await answer(made[0]!);
    expect(await a).not.toBeNull();
    expect(made[0]!.terminated).toBe(1);
    const b = loader.load('mp3');
    expect(made).toHaveLength(2);
    await answer(made[1]!);
    expect(await b).not.toBeNull();
    expect(made[1]!.terminated).toBe(1);
    loader.dispose();
    expect(made[0]!.terminated).toBe(1);   // never terminated twice
  });

  it('the kept mission is answered without a worker once it is let go', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, { releaseWorkerAfterLoad: true });
    const a = loader.load('mp2');
    await answer(made[0]!);
    const assets = await a;
    expect(await loader.load('mp2')).toBe(assets);
    expect(made).toHaveLength(1);
  });

  it('a request in flight is never cut: a second load asked before the first settles keeps the worker until it is in', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, { releaseWorkerAfterLoad: true });
    const a = loader.load('mp2');
    const b = loader.load('mp3');
    expect(made).toHaveLength(1);
    const w = made[0]!;
    await answer(w, 0);                       // mp2's four (the first load and play asked)
    expect(await a).not.toBeNull();
    expect(w.terminated).toBe(0);             // mp3's still waiting
    await answer(w, w.asked.findIndex((r, i) => i > 1 && r.kind === 'load'));
    expect(await b).not.toBeNull();
    expect(w.terminated).toBe(1);
  });

  it('a load asked from the settle itself goes to a fresh worker, never the one let go', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, { releaseWorkerAfterLoad: true });
    let next: Promise<unknown> | null = null;
    const a = loader.load('mp2').then((r) => { next = loader.load('mp3'); return r; });
    await answer(made[0]!);
    await a;
    expect(made[0]!.terminated).toBe(1);
    expect(made[0]!.asked.filter((r) => r.kind === 'load')).toHaveLength(1);
    expect(made).toHaveLength(2);
    await answer(made[1]!);
    expect(await next).not.toBeNull();
  });

  it('the preset is read off ./graphicsBackend: ?renderer=xbox lets the worker go', async () => {
    window.history.replaceState(null, '', '/?renderer=xbox');
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, { serialWorkerRequests: false });
    const a = loader.load('mp2');
    await answer(made[0]!);
    await a;
    expect(made[0]!.terminated).toBe(1);
  });
});

describe('matchLoader on every other preset keeps its worker for the match, as before', () => {
  it("'auto' (no preference): never terminated after a load; a later load asks the same worker", async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make);
    const a = loader.load('mp2');
    await answer(made[0]!);
    await a;
    expect(made[0]!.terminated).toBe(0);
    const b = loader.load('mp3');
    expect(made).toHaveLength(1);
    await answer(made[0]!, 4);
    await b;
    expect(made[0]!.terminated).toBe(0);
    loader.dispose();
    expect(made[0]!.terminated).toBe(1);
  });

  it("'webgl2' by the address: kept too", async () => {
    window.history.replaceState(null, '', '/?renderer=webgl2');
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make);
    const a = loader.load('mp2');
    await answer(made[0]!);
    await a;
    expect(made[0]!.terminated).toBe(0);
  });

  it('a load answered with an error, or a worker error event, still lets the broken worker go (S4 review F1)', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, { releaseWorkerAfterLoad: true });
    const a = loader.load('mp2');
    const load = made[0]!.asked.find((r) => r.kind === 'load')!;
    made[0]!.say({ kind: 'error', id: load.id, message: 'no map' });
    made[0]!.say({ kind: 'play', id: made[0]!.asked.find((r) => r.kind === 'play')!.id, data: null });
    expect(await a).toBeNull();
    await flush();
    expect(made[0]!.terminated).toBe(1);
    const b = loader.load('mp6');
    expect(made).toHaveLength(2);
    made[1]!.fail();
    expect(await b).toBeNull();
    await flush();
    expect(made[1]!.terminated).toBe(1);
  });

  it('PR #790 piece 2 (review F3): with the worker kept after loads, a worker error event terminates it and the next request makes a fresh one', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, { releaseWorkerAfterLoad: false, serialWorkerRequests: false, cancelSupersededLoads: false });
    const a = loader.load('mp2');
    expect(made).toHaveLength(1);
    made[0]!.fail();
    expect(await a).toBeNull();
    await flush();
    expect(made[0]!.terminated).toBe(1);      // by the error itself: no idle release runs with the worker kept
    const b = loader.load('mp3');
    expect(made).toHaveLength(2);             // the broken worker is never asked again
    expect(made[0]!.asked.filter((r) => r.kind === 'load')).toHaveLength(1);
    await answer(made[1]!);
    expect(await b).not.toBeNull();
    expect(made[1]!.terminated).toBe(0);      // the fresh one kept, as every other preset keeps it
    loader.dispose();
    expect(made[1]!.terminated).toBe(1);
  });
});

/**
 * XBOX-790-LOADDIAG review M1 (product track, an instrument): the page's diagnostic keeps a load's stage lane until the
 * match's end -- so a load that settles with no mount closes it, or a later loss in the menus would report stale stages
 * and a stuck `lt`. A load that goes on (another mission's `load` after a drop) keeps it.
 */
describe('XBOX-790-LOADDIAG review M1: the loader closes the diagnostic\'s load lane when it settles with no mount', () => {
  beforeEach(() => { resetPageMatchDiagForTest(); });
  afterEach(() => { resetPageMatchDiagForTest(); });
  const KEPT = { releaseWorkerAfterLoad: false, serialWorkerRequests: false, cancelSupersededLoads: false } as const;

  it('(a) a lobby prepare that decodes and is let go (dropPrepared: the lobby left, or a load ended with no match): the lane closed', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, KEPT);
    void loader.prepare('mp2');
    expect(made[0]!.asked.map((r) => r.kind)).toEqual(['load', 'play']);
    expect(pageMatchDiag().loadOpen).toBe(true);                // the decode opened it (no load-start before a lobby prepare)
    loader.dropPrepared();
    expect(pageMatchDiag().loadOpen).toBe(false);
    loader.dispose();
    await flush();
  });

  it("LATER 987: a lobby prepare let go, then its worker's late replies -- the lane stays closed (a later loss reports no load)", async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, KEPT);
    void loader.prepare('mp2');
    expect(pageMatchDiag().loadOpen).toBe(true);
    loader.dropPrepared();                                       // the lobby left while the prepare still decoded
    expect(pageMatchDiag().loadOpen).toBe(false);
    await answer(made[0]!);                                      // the pending requests answer late, and succeed
    expect(pageMatchDiag().loadOpen).toBe(false);
    loader.dispose();
    await flush();
  });

  it('(b) a load that fails (its map answered with an error): the lane closed once it settles', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, KEPT);
    const a = loader.load('mp2');
    expect(pageMatchDiag().loadOpen).toBe(true);
    for (const r of made[0]!.asked) made[0]!.say({ kind: 'error', id: r.id, message: 'no map' });
    expect(await a).toBeNull();
    await flush();
    expect(pageMatchDiag().loadOpen).toBe(false);
    loader.dispose();
  });

  it('(c) the loader disposed mid-load: the lane closed; before that, a hand-off\'s load of another mission (a drop with a load after it) and the older load\'s failure keep it', async () => {
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, KEPT);
    void loader.prepare('mp2');
    const mp2 = [...made[0]!.asked];
    markLoad('load-start', null);                                // the hand-off's, as the front end marks it
    void loader.load('mp3');                                     // lets mp2's prepare go; mp3's decode follows
    expect(pageMatchDiag().loadOpen).toBe(true);
    for (const r of mp2) made[0]!.say({ kind: 'error', id: r.id, message: 'no map' });
    await flush();
    expect(pageMatchDiag().loadOpen).toBe(true);                // mp2's failure is no longer the kept load's
    loader.dispose();
    expect(pageMatchDiag().loadOpen).toBe(false);
    await flush();
  });
});
