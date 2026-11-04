import { LobbyLoadError } from './data';

/**
 * The lobby browser's poll (MU-3 of `docs/plans/2026-10-09-modern-ui-parallel.md`). A browser adaptation (MU.R1): the
 * original's lists refresh by their own screens' requests; the modern browser asks the same routes over HTTP on a
 * timer, and never over a socket (the plan's MU-3: "a WebSocket feed only if the online seat agrees").
 *
 * MU_LOBBY_POLL_ADAPTATION: one load (the three signed-in reads, or the anonymous `/rooms`) every `MU_LOBBY_POLL_MS`
 * while it is active -- the Lobbies section shown and the browser tab visible, as the view decides -- and none while it
 * is not; made active again it polls at once if one fell due meanwhile, else when the period is out. Never two loads at
 * once; one given up at `MU_LOBBY_REQUEST_TIMEOUT_MS`. On a failure it retries after `MU_LOBBY_RETRY_MS` (the dialogue's
 * D6: "a retry in 5 s"), doubling per failure in a row up to `MU_LOBBY_BACKOFF_MAX_MS`, and an answer returns it to
 * the period. A new source (`reset`: signed in or out) drops the load that is out and its answer, forgets the backoff
 * and polls at once. The values are the browser's own (no original); the period is twice `/rooms`' cache life
 * (`ROOMS_MAX_AGE`, 10 s, `match/src/server.ts`), so a poll never lands inside one cached copy twice.
 */
export const MU_LOBBY_POLL_ADAPTATION = 'one load per period while shown and visible; backoff from 5 s on a failure; no socket' as const;
export const MU_LOBBY_POLL_MS = 20_000;
export const MU_LOBBY_RETRY_MS = 5_000;
export const MU_LOBBY_BACKOFF_MAX_MS = 120_000;
export const MU_LOBBY_REQUEST_TIMEOUT_MS = 10_000;

/** The delay before the retry after `failures` failures in a row (1 or more). */
export function retryDelayMs(failures: number, retryMs = MU_LOBBY_RETRY_MS, maxMs = MU_LOBBY_BACKOFF_MAX_MS): number {
  return Math.min(maxMs, retryMs * 2 ** Math.max(0, Math.min(failures - 1, 16)));
}

export type PollResult<T> = { ok: true; value: T } | { ok: false; error: LobbyLoadError };

export interface LobbyPollerOptions<T> {
  /**
   * The load; null polls nothing. `fresh` is true for the poll `pollNow` asked for (a Retry or Refresh press), so a
   * source that shares answers between callers (the retired Home's `shareLobbySource`, CX-25) makes a real request for it.
   */
  load: ((signal: AbortSignal, fresh?: boolean) => Promise<T>) | null;
  /** Each load's outcome (never one dropped by `reset`, `setActive(false)` or `stop`). */
  onResult: (r: PollResult<T>) => void;
  /** Read when a poll falls due: closed, nothing is sent and the poll goes idle until `setActive(true)` again. */
  gate?: () => boolean;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
}

export class LobbyPoller<T> {
  private load: ((signal: AbortSignal, fresh?: boolean) => Promise<T>) | null;
  /** The next poll is the one `pollNow` asked for. */
  private freshNext = false;
  private readonly onResult: (r: PollResult<T>) => void;
  private readonly gate: () => boolean;
  private readonly now: () => number;
  private readonly setT: (fn: () => void, ms: number) => unknown;
  private readonly clearT: (h: unknown) => void;
  private active = false;
  private stopped = false;
  private timer: unknown = null;
  private limit: unknown = null;
  private inFlight: AbortController | null = null;
  private dueAt = 0;
  private fails = 0;

  constructor(o: LobbyPollerOptions<T>) {
    this.load = o.load;
    this.onResult = o.onResult;
    this.gate = o.gate ?? (() => true);
    this.now = o.now ?? (() => Date.now());
    this.setT = o.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.clearT = o.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Failures in a row (the backoff's exponent). */
  failures(): number { return this.fails; }
  /** Whether a load is out. */
  busy(): boolean { return this.inFlight !== null; }

  setActive(on: boolean): void {
    if (this.stopped || on === this.active) return;
    this.active = on;
    if (on) this.arm();
    else { this.disarm(); this.drop(); }
  }

  /** A new source: the load that is out dropped, the backoff forgotten, a poll at once if active. */
  reset(load: ((signal: AbortSignal, fresh?: boolean) => Promise<T>) | null): void {
    if (this.stopped) return;
    this.load = load;
    this.freshNext = false;
    this.disarm();
    this.drop();
    this.fails = 0;
    this.dueAt = this.now();
    if (this.active) this.arm();
  }

  /** Polls now (a Retry press), unless a load is out or it is not active. */
  pollNow(): void {
    if (this.stopped || !this.active || this.inFlight) return;
    this.freshNext = true;
    this.dueAt = this.now();
    this.disarm();
    this.arm();
  }

  /** Stops for good. */
  stop(): void {
    this.setActive(false);
    this.stopped = true;
  }

  private arm(): void {
    if (this.timer !== null || this.inFlight || !this.load) return;
    const wait = Math.max(0, this.dueAt - this.now());
    this.timer = this.setT(() => { this.timer = null; this.fire(); }, wait);
  }

  private disarm(): void {
    if (this.timer !== null) this.clearT(this.timer);
    this.timer = null;
  }

  private drop(): void {
    if (this.limit !== null) this.clearT(this.limit);
    this.limit = null;
    const out = this.inFlight;
    this.inFlight = null;
    out?.abort();
  }

  private fire(): void {
    const load = this.load;
    if (!this.active || !load) return;
    if (!this.gate()) { this.active = false; return; }
    const ac = new AbortController();
    this.inFlight = ac;
    const mine = (): boolean => this.inFlight === ac;
    const settle = (r: PollResult<T>): void => {
      if (!mine()) return;                                // dropped: reset, made inactive, stopped
      if (this.limit !== null) this.clearT(this.limit);
      this.limit = null;
      this.inFlight = null;
      this.fails = r.ok ? 0 : this.fails + 1;
      this.dueAt = this.now() + (r.ok ? MU_LOBBY_POLL_MS : retryDelayMs(this.fails));
      this.onResult(r);
      if (this.active) this.arm();
    };
    // The time limit: the load aborted and told as unreachable, whether or not it heeds its signal.
    this.limit = this.setT(() => { this.limit = null; ac.abort(); settle({ ok: false, error: new LobbyLoadError('unreachable') }); }, MU_LOBBY_REQUEST_TIMEOUT_MS);
    let p: Promise<T>;
    const fresh = this.freshNext;
    this.freshNext = false;
    try { p = load(ac.signal, fresh); } catch (e) { p = Promise.reject(e); }
    p.then(
      (value) => settle({ ok: true, value }),
      (e: unknown) => settle({ ok: false, error: e instanceof LobbyLoadError ? e : new LobbyLoadError(ac.signal.aborted ? 'unreachable' : 'refused') }),
    );
  }
}
