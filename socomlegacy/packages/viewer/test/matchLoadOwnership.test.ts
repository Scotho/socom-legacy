// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { matchLoader, type MatchWorker } from '../src/matchMount';
import type { ViewerRequest, ViewerResponse } from '../src/worker';

const source = { kind: 'http', baseUrl: '/maps' } as const;
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function workers() {
  const made: { asked: ViewerRequest[]; stopped: number; say(data: unknown): void; fail(): void }[] = [];
  const make = (): MatchWorker => {
    let message = (_event: MessageEvent<ViewerResponse>) => {}, error = () => {};
    const worker = { asked: [] as ViewerRequest[], stopped: 0,
      say: (data: unknown) => message({ data } as MessageEvent<ViewerResponse>), fail: () => error() };
    made.push(worker);
    return { postMessage: request => { worker.asked.push(request); }, terminate: () => { worker.stopped++; },
      addEventListener: ((kind: string, listener: typeof message | typeof error) => {
        if (kind === 'message') message = listener as typeof message; else error = listener as typeof error;
      }) as MatchWorker['addEventListener'] };
  };
  const current = () => made.at(-1)!;
  const reply = async () => {
    const w = current(), request = w.asked[0]!;
    switch (request.kind) {
      case 'load': w.say({ kind: 'map', id: request.id, map: { path: request.path, archive: request.path } }); break;
      case 'play': w.say({ kind: 'play', id: request.id, data: null }); break;
      case 'effects': w.say({ kind: 'effects', id: request.id, data: null }); break;
      case 'sound':
        w.say({ kind: 'sound', id: request.id, data: { banks: [] } });
        w.say({ kind: 'soundLoops', id: request.id, loops: [] }); break;
      default: throw new Error(`Unexpected ${request.kind}`);
    }
    await flush();
  };
  const finish = async () => { for (let i = 0; i < 4; i++) await reply(); };
  return { made, make, current, reply, finish };
}
afterEach(() => { window.history.replaceState(null, '', '/'); });

describe('Xbox mission asset ownership (browser adaptation)', () => {
  it('cancels an obsolete mission before starting the next and ignores its late replies', async () => {
    window.history.replaceState(null, '', '/?renderer=xbox');
    const rig = workers(), loader = matchLoader(source, rig.make);
    try {
      const a = loader.load('mp2'), old = rig.current();
      const b = loader.load('mp3');
      await flush();
      expect(old.stopped).toBe(1);
      expect(await a).toBeNull();
      expect(rig.current().asked[0]).toMatchObject({ kind: 'load', path: 'RUN/MP3.ZDB' });
      old.say({ kind: 'map', id: old.asked[0]!.id, map: { path: 'RUN/MP2.ZDB', archive: 'MP2' } });
      await rig.finish();
      expect((await b)?.map.path).toBe('RUN/MP3.ZDB');
      expect(rig.made.flatMap(w => w.asked).filter(r => r.kind === 'play')).toHaveLength(1);
      expect(rig.made.every(w => w.stopped === 1)).toBe(true);
    } finally { loader.dispose(); }
  });

  it('drops an already decoded obsolete map instead of scheduling its effects and audio', async () => {
    window.history.replaceState(null, '', '/?renderer=xbox');
    const rig = workers(), loader = matchLoader(source, rig.make);
    try {
      const a = loader.load('mp2'); await rig.reply();
      const oldPlay = rig.current(); expect(oldPlay.asked[0]!.kind).toBe('play');
      const b = loader.load('mp6'); await flush();
      expect(oldPlay.stopped).toBe(1); expect(await a).toBeNull();
      await rig.finish(); expect((await b)?.map.path).toBe('RUN/MP6.ZDB');
      expect(rig.made.flatMap(w => w.asked).filter(r => r.kind === 'effects' || r.kind === 'sound'))
        .toEqual(expect.arrayContaining([expect.objectContaining({ path: 'RUN/MP6.ZDB' })]));
      expect(rig.made.flatMap(w => w.asked).filter(r => (r.kind === 'effects' || r.kind === 'sound') && r.path === 'RUN/MP2.ZDB')).toEqual([]);
    } finally { loader.dispose(); }
  });

  it('a stale worker\'s crash and partial sound leave the replacement mission clean', async () => {
    window.history.replaceState(null, '', '/?renderer=xbox');
    const rig = workers(), loader = matchLoader(source, rig.make);
    try {
      const a = loader.load('mp2'); await rig.reply(); await rig.reply(); await rig.reply();
      const old = rig.current(); old.say({ kind: 'sound', id: old.asked[0]!.id, data: { banks: ['old'] } });
      const b = loader.load('mp3'); await flush(); expect(await a).toBeNull();
      old.fail(); old.say({ kind: 'error', id: rig.current().asked[0]!.id, message: 'late old crash' });
      await rig.finish(); expect((await b)?.sound?.data.banks).toEqual([]);
    } finally { loader.dispose(); }
  });

  it('a failed map starts no further decoders and can be retried on the same loader', async () => {
    window.history.replaceState(null, '', '/?renderer=xbox');
    const rig = workers(), loader = matchLoader(source, rig.make);
    try {
      const a = loader.load('mp2'), w = rig.current();
      w.say({ kind: 'error', id: w.asked[0]!.id, message: 'map allocation failed' });
      await flush(); expect(rig.made).toHaveLength(1); expect(await a).toBeNull();
      await loader.prepare('mp2');
      expect(rig.made).toHaveLength(1); // Internal preparation must not turn a failure into an automatic retry.
      const retry = loader.load('mp2'); await flush();
      expect(rig.made).toHaveLength(2); await rig.finish(); expect(await retry).not.toBeNull();
    } finally { loader.dispose(); }
  });

  it('disposal between a reply and its continuation cannot retain or restart the mission', async () => {
    window.history.replaceState(null, '', '/?renderer=xbox');
    const rig = workers(), loader = matchLoader(source, rig.make);
    const a = loader.load('mp2'), w = rig.current();
    w.say({ kind: 'map', id: w.asked[0]!.id, map: { path: 'RUN/MP2.ZDB', archive: 'MP2' } });
    loader.dispose();
    expect(await a).toBeNull(); expect(await loader.load('mp2')).toBeNull();
    await loader.prepare('mp2'); await flush();
    expect(rig.made).toHaveLength(1); expect(w.stopped).toBe(1);
  });

  it('reuses the same active or completed mission without cancelling it', async () => {
    window.history.replaceState(null, '', '/?renderer=xbox');
    const rig = workers(), loader = matchLoader(source, rig.make);
    try {
      const a = loader.load('mp2'); expect(loader.load('mp2')).toBe(a);
      await rig.finish(); expect(await loader.load('mp2')).toBe(await a); expect(rig.made).toHaveLength(4);
    } finally { loader.dispose(); }
  });

  it('worker construction failure settles the load and permits a fresh same-mission attempt', async () => {
    const rig = workers(); let fail = true;
    const loader = matchLoader(source, () => { if (fail) throw new Error('cannot create decoder'); return rig.make(); },
      { serialWorkerRequests: false });
    try {
      await expect(loader.load('mp2')).resolves.toBeNull();
      fail = false;
      const retry = loader.load('mp2'); await flush(); expect(rig.made).toHaveLength(1);
      loader.dispose(); expect(await retry).toBeNull();
    } finally { loader.dispose(); }
  });

  it('the native-worker identity guard rejects stale replies even when request serialization is disabled', async () => {
    const rig = workers(), loader = matchLoader(source, rig.make, { cancelSupersededLoads: true, serialWorkerRequests: false, releaseWorkerAfterLoad: true });
    try {
      const a = loader.load('mp2'), old = rig.current();
      const b = loader.load('mp3'), current = rig.current();
      expect(old.stopped).toBe(1); expect(await a).toBeNull();
      old.fail();
      old.say({ kind: 'error', id: current.asked[0]!.id, message: 'stale' });
      old.say({ kind: 'sound', id: current.asked[0]!.id, data: { banks: ['stale'] } });
      current.say({ kind: 'map', id: current.asked[0]!.id, map: { path: 'RUN/MP3.ZDB', archive: 'MP3' } });
      current.say({ kind: 'play', id: current.asked[1]!.id, data: null });
      await flush();
      const effects = current.asked.find(r => r.kind === 'effects')!, sound = current.asked.find(r => r.kind === 'sound')!;
      current.say({ kind: 'effects', id: effects.id, data: null });
      current.say({ kind: 'sound', id: sound.id, data: { banks: [] } });
      current.say({ kind: 'soundLoops', id: sound.id, loops: [] });
      expect((await b)?.map.path).toBe('RUN/MP3.ZDB');
      expect(current.stopped).toBe(1);
    } finally { loader.dispose(); }
  });
});
