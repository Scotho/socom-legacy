import { describe, expect, it } from 'vitest';
import { serialMatchWorker } from '../src/serialMatchWorker';
import type { MatchWorker } from '../src/matchMount';
import type { ViewerRequest, ViewerResponse } from '../src/worker';

function rig() {
  const made: { requests: ViewerRequest[]; dead: boolean; message(m: unknown): void; error(): void }[] = [];
  const make = (): MatchWorker => {
    let message = (_e: MessageEvent<ViewerResponse>) => {};
    let error = () => {};
    const w = { requests: [] as ViewerRequest[], dead: false,
      message: (m: unknown) => message({ data: m } as MessageEvent<ViewerResponse>), error: () => error() };
    made.push(w);
    return { postMessage: (r) => w.requests.push(r), terminate: () => { w.dead = true; },
      addEventListener: ((type: string, fn: typeof message | typeof error) => {
        if (type === 'message') message = fn as typeof message;
        else error = fn as typeof error;
      }) as MatchWorker['addEventListener'] };
  };
  const worker = serialMatchWorker(make);
  const received: unknown[] = [];
  worker.addEventListener('message', (e) => received.push(e.data));
  return { worker, made, received };
}
const source = { kind: 'http', baseUrl: '/maps' } as const;
const load = (id: number): ViewerRequest => ({ kind: 'load', id, source, path: 'RUN/MP2.ZDB' });
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('Xbox match decoder lifetime (browser adaptation)', () => {
  it('runs one request at a time and releases the decoder before handing assets to the page', async () => {
    const { worker, made } = rig();
    const released: boolean[] = [];
    worker.addEventListener('message', () => released.push(made[0]!.dead));
    worker.postMessage(load(1)); worker.postMessage(load(2));
    expect(made).toHaveLength(1);
    made[0]!.message({ kind: 'map', id: 1, map: {} });
    expect(released).toEqual([true]);
    await flush();
    expect(made).toHaveLength(2);
    expect(made[1]!.requests).toEqual([load(2)]);
    worker.terminate();
  });

  it('keeps the sound decoder through both data and loops, then releases it', async () => {
    const { worker, made, received } = rig();
    worker.postMessage({ kind: 'sound', id: 1, source, path: 'RUN/MP2.ZDB', archive: 'MP2' });
    worker.postMessage(load(2));
    made[0]!.message({ kind: 'sound', id: 1, data: {} });
    await flush();
    expect(made[0]!.dead).toBe(false); expect(made).toHaveLength(1);
    made[0]!.message({ kind: 'soundLoops', id: 1, loops: [] });
    await flush();
    expect(made[0]!.dead).toBe(true); expect(made).toHaveLength(2);
    expect(received).toHaveLength(2);
    worker.terminate();
  });

  it('keeps progress on the active request and ignores late replies from a terminated worker', async () => {
    const { worker, made, received } = rig();
    worker.postMessage(load(1)); worker.postMessage(load(2));
    made[0]!.message({ kind: 'progress', id: 1, stage: 'textures', done: 1, total: 2 });
    expect(made[0]!.dead).toBe(false);
    made[0]!.message({ kind: 'error', id: 1, doing: 'loading', message: 'out of memory' });
    await flush();
    made[0]!.message({ kind: 'map', id: 1, map: {} });
    expect(received).toHaveLength(2); expect(made).toHaveLength(2);
    worker.terminate();
  });

  it('reports an abrupt worker crash for its request and can finish queued work', async () => {
    const { worker, made, received } = rig();
    worker.postMessage(load(1)); worker.postMessage(load(2));
    made[0]!.error();
    await flush();
    expect(received[0]).toMatchObject({ kind: 'error', id: 1 });
    expect(made[0]!.dead).toBe(true); expect(made).toHaveLength(2);
    worker.terminate();
  });

  it('disposal drops queued work, including disposal from the terminal reply', async () => {
    const { worker, made } = rig();
    worker.addEventListener('message', () => worker.terminate());
    worker.postMessage(load(1)); worker.postMessage(load(2));
    made[0]!.message({ kind: 'map', id: 1, map: {} });
    await flush();
    worker.postMessage(load(3));
    expect(made).toHaveLength(1); expect(made[0]!.dead).toBe(true);
  });
});
