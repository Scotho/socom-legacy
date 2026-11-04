/**
 * The emulator parity harness's stop plumbing (EPH-2; the review fold of 2026-10-30, findings 1 and 6). Product track
 * (OT.R53): a validation instrument, an adaptation, never in a build and never changing the game's behaviour.
 *
 * A run holds one AbortController. Ctrl+C (./run installStop) or a clean stop (PINE failing, ./sampler Recorder) aborts
 * it; every wait of the run takes its signal, so the wait ends at once and the run's `finally` stops what it started
 * and writes the record. Each wait that could otherwise hang has a bound (waitUntil), and a clear line when it is hit.
 */

/** The run was interrupted (Ctrl+C, SIGTERM, a closed console). */
export class RunAborted extends Error {
  constructor(what = 'interrupted') {
    super(`EPH run: ${what}`);
    this.name = 'RunAborted';
  }
}

/** The run stopped itself cleanly for a reason it names (e.g. PINE failing read after read). */
export class RunStopped extends Error {
  constructor(what: string) {
    super(`EPH run: ${what}`);
    this.name = 'RunStopped';
  }
}

/**
 * The error an aborted signal stands for: its reason when the run gave one (an Error), a RunAborted otherwise -- an
 * `abort()` with no reason leaves the platform's own AbortError DOMException there.
 */
export function abortError(signal: AbortSignal): Error {
  const r: unknown = signal.reason;
  return r instanceof Error && r.name !== 'AbortError' ? r : new RunAborted();
}

/** A sleep that ends early, rejecting with the abort's error, when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise<void>((done, fail) => {
    const onAbort = (): void => { clearTimeout(timer); fail(abortError(signal!)); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); done(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * `p`, or the abort's error as soon as `signal` aborts. A value `p` gives after the abort goes to `late` (to close a
 * browser or a socket that arrived too late); a rejection after the abort is swallowed.
 */
export function raceAbort<T>(p: Promise<T>, signal: AbortSignal, late?: (v: T) => void): Promise<T> {
  if (signal.aborted) {
    p.then((v) => late?.(v), () => undefined);
    return Promise.reject(abortError(signal));
  }
  return new Promise<T>((done, fail) => {
    let over = false;
    const onAbort = (): void => { over = true; fail(abortError(signal)); };
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); if (over) late?.(v); else done(v); },
      (err) => { signal.removeEventListener('abort', onAbort); if (!over) fail(err); },
    );
  });
}

export interface WaitUntilOptions {
  readonly signal?: AbortSignal;
  /** The bound, ms of `now`; with `progress`, the bound on `progress` standing still. */
  readonly timeoutMs: number;
  /** The error at the bound: a clear line naming the likely cause. */
  readonly fail: () => Error;
  /** A value that, while it changes, restarts the bound (a guest clock creeping on a slow host). */
  readonly progress?: () => unknown;
  readonly pollMs?: number;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly now?: () => number;
}

/** Polls `cond` until it holds; ends at the abort; fails with `fail()` at the bound. */
export async function waitUntil(cond: () => boolean, o: WaitUntilOptions): Promise<void> {
  const wait = o.sleep ?? sleep;
  const now = o.now ?? Date.now;
  const poll = o.pollMs ?? 5;
  let since = now();
  let last = o.progress?.();
  for (;;) {
    if (o.signal?.aborted) throw abortError(o.signal);
    if (cond()) return;
    if (o.progress) {
      const v = o.progress();
      if (v !== last) { last = v; since = now(); }
    }
    if (now() - since >= o.timeoutMs) throw o.fail();
    await wait(poll, o.signal);
  }
}

/** `fn` run at most once; every call gets the first call's promise. */
export function once(fn: () => Promise<void>): () => Promise<void> {
  let p: Promise<void> | null = null;
  return () => (p ??= fn());
}
