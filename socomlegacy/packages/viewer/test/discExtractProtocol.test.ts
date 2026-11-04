import { describe, expect, it } from 'vitest';
import { serveDiscExtract, type ExtractCommand, type ExtractPort, type ExtractReply } from '../src/discExtractProtocol';
import { EXTRACT_ROOT, opfsExtractStore } from '../src/discExtractStore';
import { anyOpen, FakeOpfs } from './discExtractFakes';

/** Browser adaptation: worker-local destination opening, including failures and cancellation while opening. */
describe('extraction destination names across the worker boundary', () => {
  function channel(target: Parameters<typeof serveDiscExtract>[1]) {
    let done!: (reply: ExtractReply) => void;
    const result = new Promise<ExtractReply>((resolve) => { done = resolve; });
    const port: ExtractPort = { onmessage: null, postMessage: (reply) => {
      if (reply.kind === 'file' || reply.kind === 'error') done(reply);
    } };
    serveDiscExtract(port, target, () => true);
    return { result, send: (command: ExtractCommand) => port.onmessage!({ data: command } as MessageEvent<ExtractCommand>) };
  }
  const file = (path = 'RUN/IRX/LIBSD.IRX'): ExtractCommand =>
    ({ kind: 'file', dir: 'disc-test', path, blob: new Blob(['test bytes']), chunk: 4 });

  it('opens nested destination paths in the worker and closes the handle after writing', async () => {
    const fs = new FakeOpfs();
    const c = channel((dir, path) => opfsExtractStore(async () => fs.root, dir).target(path));
    c.send(file());
    expect(await c.result).toMatchObject({ kind: 'file', bytes: 10 });
    expect(new TextDecoder().decode(fs.files().get(`${EXTRACT_ROOT}/disc-test/RUN/IRX/LIBSD.IRX`))).toBe('test bytes');
    expect(anyOpen(fs.root)).toBe(false);
  });

  it('rejects traversal before writing anything', async () => {
    const fs = new FakeOpfs();
    const c = channel((dir, path) => opfsExtractStore(async () => fs.root, dir).target(path));
    c.send(file('../outside'));
    expect(await c.result).toMatchObject({ kind: 'error' });
    expect(fs.files().size).toBe(0);
  });

  it('reports a worker-side directory permission refusal to the page', async () => {
    const c = channel((dir, path) => opfsExtractStore(async () => {
      throw new DOMException('denied', 'SecurityError');
    }, dir).target(path));
    c.send(file());
    expect(await c.result).toMatchObject({ kind: 'error', reason: 'denied' });
  });

  it('honors cancellation received while the destination is still opening', async () => {
    const fs = new FakeOpfs();
    let release!: () => void;
    const opening = new Promise<void>((resolve) => { release = resolve; });
    const c = channel(async (dir, path) => { await opening; return opfsExtractStore(async () => fs.root, dir).target(path); });
    c.send(file());
    c.send({ kind: 'cancel' });
    release();
    expect(await c.result).toMatchObject({ kind: 'error', name: 'AbortError' });
    expect(fs.written).toBe(0);
    expect(anyOpen(fs.root)).toBe(false);
  });
});
