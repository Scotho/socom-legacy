import { describe, expect, it } from 'vitest';
import { RunAborted, RunStopped, abortError, once, raceAbort, sleep, waitUntil } from '../eph/abort';

/**
 * The harness's stop plumbing (EPH-2 fold, finding 1 and 6): every wait of a run observes one AbortSignal, so a
 * Ctrl+C ends the wait at once and the run's finally stops what it started. Pure, on fake clocks; nothing started.
 */
describe('the abort helpers', () => {
  it('sleep resolves after its time and rejects with the abort reason at the abort', async () => {
    await expect(sleep(1)).resolves.toBeUndefined();
    const ctl = new AbortController();
    const t0 = Date.now();
    const s = sleep(60_000, ctl.signal);
    setTimeout(() => ctl.abort(), 10);
    await expect(s).rejects.toBeInstanceOf(RunAborted);
    expect(Date.now() - t0).toBeLessThan(5000);
    const stopped = new AbortController();
    stopped.abort(new RunStopped('PINE failed'));
    await expect(sleep(1, stopped.signal)).rejects.toThrow(/PINE failed/);
  });

  it('abortError gives the reason when it is an Error, a RunAborted otherwise', () => {
    const a = new AbortController();
    a.abort();
    expect(abortError(a.signal)).toBeInstanceOf(RunAborted);
    const b = new AbortController();
    b.abort(new RunStopped('why'));
    expect(abortError(b.signal)).toBeInstanceOf(RunStopped);
  });

  it('raceAbort ends a promise that never settles, and hands a late value to its cleanup', async () => {
    const ctl = new AbortController();
    let settle: (v: string) => void = () => undefined;
    const never = new Promise<string>((done) => { settle = done; });
    const late: string[] = [];
    const r = raceAbort(never, ctl.signal, (v) => { late.push(v); });
    ctl.abort();
    await expect(r).rejects.toBeInstanceOf(RunAborted);
    settle('browser');
    await sleep(1);
    expect(late).toEqual(['browser']);
    await expect(raceAbort(Promise.resolve(3), new AbortController().signal)).resolves.toBe(3);
  });

  it('waitUntil polls a condition, fails with its own message at the bound, and resets the bound on progress', async () => {
    let wall = 0;
    const fake = { sleep: async (ms: number) => { wall += ms; }, now: () => wall };
    let n = 0;
    await waitUntil(() => ++n >= 3, { ...fake, timeoutMs: 1000, fail: () => new Error('never') });
    expect(n).toBe(3);
    await expect(waitUntil(() => false, { ...fake, timeoutMs: 1000, fail: () => new Error('no player actor: is --state set?') }))
      .rejects.toThrow('no player actor: is --state set?');
    // A creeping value keeps it waiting past the bound; it stops once the value stands still for the bound.
    wall = 0;
    let v = 0;
    const p = waitUntil(() => false, { ...fake, pollMs: 100, timeoutMs: 1000, progress: () => (wall < 5000 ? ++v : v), fail: () => new Error('stalled') });
    await expect(p).rejects.toThrow('stalled');
    expect(wall).toBeGreaterThanOrEqual(5000);
  });

  it('waitUntil ends at the abort', async () => {
    const ctl = new AbortController();
    const p = waitUntil(() => false, { signal: ctl.signal, timeoutMs: 60_000, fail: () => new Error('timeout') });
    setTimeout(() => ctl.abort(), 10);
    await expect(p).rejects.toBeInstanceOf(RunAborted);
  });

  it('once runs its function once and hands every caller the same promise', async () => {
    let calls = 0;
    const stop = once(async () => { calls++; });
    await Promise.all([stop(), stop(), stop()]);
    expect(calls).toBe(1);
  });
});
