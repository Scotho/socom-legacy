import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LobbyPoller, MU_LOBBY_BACKOFF_MAX_MS, MU_LOBBY_POLL_MS, MU_LOBBY_REQUEST_TIMEOUT_MS, MU_LOBBY_RETRY_MS, retryDelayMs,
} from '../../../src/modern/lobbies/poller';
import { LobbyLoadError } from '../../../src/modern/lobbies/data';

/** MU-3's poll (`src/modern/lobbies/poller.ts`): modest, only while active, backing off on errors, never two at once. */
describe('the lobby poll', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const make = (load: (s: AbortSignal) => Promise<number>) => {
    const results: unknown[] = [];
    const p = new LobbyPoller<number>({ load, onResult: (r) => results.push(r) });
    return { p, results };
  };

  it('polls at once when made active, then every period, and not at all while inactive', async () => {
    const load = vi.fn(async () => 1);
    const { p, results } = make(load);
    expect(load).not.toHaveBeenCalled();
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ ok: true, value: 1 }]);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS);
    expect(load).toHaveBeenCalledTimes(2);
    p.setActive(false);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 5);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('made active again before the period is out, it waits for the rest; after it, it polls at once', async () => {
    const load = vi.fn(async () => 1);
    const { p } = make(load);
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(1000);
    p.setActive(false);
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS - 1000);
    expect(load).toHaveBeenCalledTimes(2);
    p.setActive(false);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 3);
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('backs off on errors -- the retry delay doubling to the ceiling -- and returns to the period on an answer', async () => {
    expect(retryDelayMs(1)).toBe(MU_LOBBY_RETRY_MS);
    expect(retryDelayMs(2)).toBe(MU_LOBBY_RETRY_MS * 2);
    expect(retryDelayMs(30)).toBe(MU_LOBBY_BACKOFF_MAX_MS);
    let fail = true;
    const load = vi.fn(async () => { if (fail) throw new LobbyLoadError('unreachable'); return 1; });
    const { p, results } = make(load);
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.failures()).toBe(1);
    expect(results.at(-1)).toMatchObject({ ok: false, error: { kind: 'unreachable' } });
    await vi.advanceTimersByTimeAsync(MU_LOBBY_RETRY_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(p.failures()).toBe(2);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_RETRY_MS * 2);
    expect(load).toHaveBeenCalledTimes(3);
    fail = false;
    await vi.advanceTimersByTimeAsync(MU_LOBBY_RETRY_MS * 4);
    expect(load).toHaveBeenCalledTimes(4);
    expect(p.failures()).toBe(0);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS - 1);
    expect(load).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(5);
  });
  it('a request that never answers is given up at the time limit (a failure), and the next is not stacked on it', async () => {
    const load = vi.fn((s: AbortSignal) => new Promise<number>((_, fail) => { s.addEventListener('abort', () => fail(new LobbyLoadError('unreachable'))); }));
    const { p, results } = make(load);
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    p.pollNow();
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_REQUEST_TIMEOUT_MS);
    expect(results.at(-1)).toMatchObject({ ok: false, error: { kind: 'unreachable' } });
    expect(p.failures()).toBe(1);
  });
  it('made inactive mid-request: the request is aborted and its answer never told', async () => {
    let resolve!: (n: number) => void;
    const signals: AbortSignal[] = [];
    const load = vi.fn((s: AbortSignal) => { signals.push(s); return new Promise<number>((r) => { resolve = r; }); });
    const { p, results } = make(load);
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    p.setActive(false);
    expect(signals[0]!.aborted).toBe(true);
    resolve(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual([]);
  });
  it('a new source (reset) drops the old answer and polls the new one at once, the backoff forgotten', async () => {
    let resolve!: (n: number) => void;
    const { p, results } = make(() => new Promise<number>((r) => { resolve = r; }));
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    const old = resolve;
    p.reset(async () => 2);
    await vi.advanceTimersByTimeAsync(0);
    old(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual([{ ok: true, value: 2 }]);
  });
  it('a null source polls nothing; stop ends it for good', async () => {
    const load = vi.fn(async () => 1);
    const { p } = make(load);
    p.reset(null);
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 3);
    expect(load).not.toHaveBeenCalled();
    p.reset(load);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    p.stop();
    p.setActive(true);
    p.pollNow();
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 3);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('a gate read at each poll: closed when the timer fires, nothing is sent and the poll goes idle', async () => {
    let open = true;
    const load = vi.fn(async () => 1);
    const p = new LobbyPoller<number>({ load, onResult: () => {}, gate: () => open });
    p.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    open = false;
    await vi.advanceTimersByTimeAsync(MU_LOBBY_POLL_MS * 3);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
