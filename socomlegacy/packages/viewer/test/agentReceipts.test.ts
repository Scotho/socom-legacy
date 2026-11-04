import { describe, expect, it } from 'vitest';
import { createReceiptStore } from '../src/agent/receipts';
import type { AgentResult } from '@s2u/forge-agent-protocol';

/**
 * LATER 420: one mutation-receipt store for both page targets (the Forge editor's and the solo test room's): a replay of
 * the same request answers the first result; the same id with other arguments is refused; a duplicate sent while the
 * first runs waits for it; in-flight requests count against the limit; a revoke forgets everything, and a result that
 * lands after it is not kept.
 */
const ok = (requestId: string, data: unknown = null): AgentResult => ({ requestId, revision: 1, outcome: 'ok', data });

describe('LATER 420: the shared receipt store', () => {
  it('replays a receipt, refuses a reused id with other arguments, and serves request.receipt', async () => {
    const s = createReceiptStore(4);
    let runs = 0;
    const run = () => s.run('s:a', 'f1', async () => { runs++; return ok('a', runs); });
    expect(await run()).toEqual(ok('a', 1));
    expect(await run()).toEqual(ok('a', 1));
    expect(runs).toBe(1);
    expect(await s.run('s:a', 'f2', async () => ok('a'))).toEqual({ refused: 'REQUEST_ID_REUSED' });
    expect(s.get('s:a')).toEqual(ok('a', 1));
    expect(s.get('s:none')).toBeNull();
  });

  it('a duplicate in flight waits for the first and runs nothing itself', async () => {
    const s = createReceiptStore(4);
    let finish!: (r: AgentResult) => void, runs = 0;
    const work = () => { runs++; return new Promise<AgentResult>((ok2) => { finish = ok2; }); };
    const a = s.run('s:x', 'f', work), b = s.run('s:x', 'f', work);
    finish(ok('x', 'done'));
    expect(await a).toEqual(ok('x', 'done'));
    expect(await b).toEqual(ok('x', 'done'));
    expect(runs).toBe(1);
  });

  it('counts in-flight requests against the limit', async () => {
    const s = createReceiptStore(1);
    let finish!: (r: AgentResult) => void;
    const a = s.run('s:1', 'f', () => new Promise<AgentResult>((ok2) => { finish = ok2; }));
    expect(await s.run('s:2', 'f', async () => ok('2'))).toEqual({ refused: 'RECEIPT_LIMIT' });
    finish(ok('1')); await a;
  });

  it('a revoke forgets every receipt, and a result landing after it is not kept', async () => {
    const s = createReceiptStore(4);
    let finish!: (r: AgentResult) => void;
    const late = s.run('s:l', 'f', () => new Promise<AgentResult>((ok2) => { finish = ok2; }));
    await s.run('s:k', 'f', async () => ok('k'));
    s.clear();
    expect(s.get('s:k')).toBeNull();
    finish(ok('l')); await late;
    expect(s.get('s:l')).toBeNull();
  });

  it('an aborted request is answered but not kept', async () => {
    const s = createReceiptStore(4);
    const ac = new AbortController(); ac.abort();
    expect(await s.run('s:c', 'f', async () => ok('c'), ac.signal)).toEqual(ok('c'));
    expect(s.get('s:c')).toBeNull();
  });
});
