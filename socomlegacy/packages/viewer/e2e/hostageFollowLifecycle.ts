/** Test adaptation: inspect the fixture lifecycle without altering production rounds. */
export interface FollowSnapshot {
  map: string; tick: number; phase: string; round: number; epoch: number; startTick: number | null;
  roundStarts: number; leaderAlive: boolean; hostageId: number; hostageLeader: number | null; ai: number | null;
  players: number; spectators: number;
}
export class FollowLifecycle {
  active = false;
  error: string | null = null;
  private epoch: number | null = null;
  constructor(private readonly read: () => FollowSnapshot) {}
  private fail(reason: string): never {
    this.active = false;
    this.error ??= `${reason}: ${JSON.stringify(this.read())}`;
    throw new Error(this.error);
  }
  ready(): boolean {
    if (this.error) throw new Error(this.error);
    const s = this.read();
    return s.phase === 'play' && s.startTick !== null && s.roundStarts > 0 && s.leaderAlive;
  }
  begin(expectedEpoch: number, command: () => { top: number | null }): void {
    if (this.error) throw new Error(this.error);
    const s = this.read();
    if (s.epoch !== expectedEpoch) this.fail('ready epoch changed before FOLLOW');
    if (s.phase !== 'play' || s.startTick === null || !s.roundStarts) this.fail('phase is not ready for FOLLOW');
    if (!s.leaderAlive) this.fail('leader is not alive');
    const outcome = command();
    if (outcome.top !== 9 || this.read().hostageLeader !== 100) this.fail('FOLLOW command was not accepted');
    this.epoch = expectedEpoch;
    this.active = true;
  }
  check(): void {
    if (!this.active) return;
    const s = this.read();
    try {
      if (s.epoch !== this.epoch || s.phase !== 'play') this.fail('active FOLLOW epoch or phase changed');
      if (!s.leaderAlive || s.hostageLeader !== 100) this.fail('active FOLLOW lost leader');
    } catch { /* Keep the first diagnostic until the next harness request reports it. */ }
  }
  stop(): void { this.active = false; }
}

/** Read fresh harness health on every rendered poll, without substituting authority for rendering. */
export async function observeRenderedFollow<T>(current: () => Promise<unknown>, rendered: () => Promise<T>): Promise<T> {
  await current();
  return rendered();
}

/** Best-effort failure evidence/cleanup must not replace the assertion that caused the failure. */
export async function finishFollowObservation<T>(current: () => Promise<T>, finish: () => Promise<unknown>):
Promise<{ current?: T; error?: string; cleanupError?: string }> {
  const result: { current?: T; error?: string; cleanupError?: string } = {};
  try { result.current = await current(); } catch (error) { result.error = String(error); }
  try { await finish(); } catch (error) { result.cleanupError = String(error); }
  return result;
}

/** The test's second seat starts a round: keep it out while the observing page is warming. */
export async function prepareAfterPageReady<T>(ready: () => Promise<unknown>, prepare: () => Promise<T>): Promise<T> {
  await ready();
  return prepare();
}

/** Loader completion can mean a failed/retrying connection. Require the current live seat too. */
export function followPageReady(page: { visible: boolean; blocked: boolean;
  net: { state: string; role: string | null; id: number | null } | null }, seated: boolean): boolean {
  return !page.visible && !page.blocked && page.net?.state === 'open' && page.net.role === 'player'
    && page.net.id !== null && page.net.id !== 100 && seated;
}

/** Test adaptation: central/src/main.ts:199 calls resetRates every 1000 ms;
 * match/src/server.ts:1442 resets the per-second budgets and decays strikes. Without this entrypoint
 * maintenance, an honest long-lived fixture connection eventually hits the cumulative rate close. */
export function startFollowRateWindows(server: { resetRates(): void }): () => void {
  const timer = setInterval(() => server.resetRates(), 1000);
  timer.unref();
  return () => clearInterval(timer);
}
