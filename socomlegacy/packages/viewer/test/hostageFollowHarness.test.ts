import { describe, expect, it, vi } from 'vitest';
import { FollowLifecycle, observeRenderedFollow, finishFollowObservation, prepareAfterPageReady, followPageReady, startFollowRateWindows, type FollowSnapshot } from '../e2e/hostageFollowLifecycle';
function fixture() {
  const s: FollowSnapshot = { map: 'MP11', tick: 100, phase: 'play', round: 1, epoch: 1,
    startTick: 90, roundStarts: 1, leaderAlive: true, hostageId: 101, hostageLeader: null, ai: 23,
    players: 2, spectators: 0 };
  const life = new FollowLifecycle(() => s);
  let commands = 0;
  const command = () => { commands++; s.hostageLeader = 100; s.ai = 9; return { top: 9 }; };
  return { s, life, command, commands: () => commands };
}
describe('hostage browser fixture lifecycle adaptation', () => {
  it('rejects historical roundStart while waiting', () => {
    const { s, life } = fixture(); s.phase = 'waiting'; expect(life.ready()).toBe(false);
  });
  it.each(['waiting', 'decided', 'over'])('refuses phase %s between readiness and FOLLOW', phase => {
    const { s, life, command, commands } = fixture(); expect(life.ready()).toBe(true); s.phase = phase;
    expect(() => life.begin(1, command)).toThrow(/phase/); expect(commands()).toBe(0);
  });
  it('pins the ready epoch even when the round number repeats', () => {
    const { s, life, command, commands } = fixture(); s.epoch = 2;
    expect(() => life.begin(1, command)).toThrow(/epoch/); expect(commands()).toBe(0);
  });
  it('never issues FOLLOW for a dead leader', () => {
    const { s, life, command, commands } = fixture(); s.leaderAlive = false;
    expect(() => life.begin(1, command)).toThrow(/leader/); expect(commands()).toBe(0);
  });
  it('requires the command postcondition before activating', () => {
    const { life } = fixture(); expect(() => life.begin(1, () => ({ top: 17 }))).toThrow(/FOLLOW/);
    expect(life.active).toBe(false);
  });
  it('retains diagnostics when an active round resets before observation', () => {
    const { s, life, command } = fixture(); life.begin(1, command);
    s.epoch = 2; s.hostageLeader = null; s.phase = 'waiting'; life.check();
    expect(life.active).toBe(false); expect(life.error).toContain('MP11'); expect(life.error).toContain('"epoch":2');
    s.phase = 'play'; life.check(); expect(() => life.ready()).toThrow(/epoch/);
  });
  it('accepts current rounds and stops monitoring after HOLD', () => {
    const { s, life, command } = fixture(); life.begin(1, command); life.check(); expect(life.active).toBe(true);
    life.stop(); s.hostageLeader = null; life.check(); expect(life.error).toBeNull();
  });
  it('reports death or lost ownership during active follow', () => {
    for (const mutate of [(s: FollowSnapshot) => { s.leaderAlive = false; },
      (s: FollowSnapshot) => { s.hostageLeader = null; }]) {
      const { s, life, command } = fixture(); life.begin(1, command); mutate(s); life.check();
      expect(life.active).toBe(false); expect(life.error).toContain('lost leader');
    }
  });
  it('allows recovery substates while FOLLOW ownership remains', () => {
    const { s, life, command } = fixture(); life.begin(1, command); s.ai = 16; life.check();
    expect(life.active).toBe(true); expect(life.error).toBeNull();
  });
  it('rejects a command that reports FOLLOW without ownership', () => {
    const { life } = fixture(); expect(() => life.begin(1, () => ({ top: 9 }))).toThrow(/not accepted/);
  });

});

// The browser observation must read fresh authority, even while its rendered leader is absent.
describe('rendered FOLLOW lifecycle observation', () => {
  it('surfaces ownership loss immediately after the FOLLOW response', async () => {
    const { s, life, command } = fixture(); life.begin(1, command);
    s.hostageLeader = null; life.check();
    let renderedReads = 0;
    await expect(observeRenderedFollow(async () => life.ready(), async () => { renderedReads++; return null; }))
      .rejects.toThrow(/lost leader/);
    expect(renderedReads).toBe(0);
  });
  it('still returns the rendered leader rather than the authority leader', async () => {
    expect(await observeRenderedFollow(async () => ({ leader: 100 }), async () => null)).toBeNull();
    expect(await observeRenderedFollow(async () => ({ leader: 100 }), async () => 100)).toBe(100);
  });
  it('collects fresh failure diagnostics and attempts cleanup without replacing the failure', async () => {
    let finished = false;
    const result = await finishFollowObservation(async () => { throw new Error('active FOLLOW lost leader'); },
      async () => { finished = true; throw new Error('cleanup failed'); });
    expect(finished).toBe(true);
    expect(result).toEqual({ error: 'Error: active FOLLOW lost leader', cleanupError: 'Error: cleanup failed' });
  });
});

it('does not seat the second side until page warming and loading finish', async () => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let prepared = false;
  const task = prepareAfterPageReady(() => ready, async () => { prepared = true; return 'prepared'; });
  await Promise.resolve(); expect(prepared).toBe(false);
  release(); expect(await task).toBe('prepared'); expect(prepared).toBe(true);
});

describe('follow page readiness beyond loading completion', () => {
  const page = { visible: false, blocked: false, net: { state: 'open', role: 'player', id: 7 } };
  it('rejects a released loader whose current socket is reconnecting', () => {
    expect(followPageReady({ ...page, net: { ...page.net, state: 'closed' } }, true)).toBe(false);
  });
  it('rejects a stale welcome when the exact page seat is gone', () => {
    expect(followPageReady(page, false)).toBe(false);
  });
  it('requires a seated player and completed loading together', () => {
    expect(followPageReady(page, true)).toBe(true);
    expect(followPageReady({ ...page, visible: true }, true)).toBe(false);
    expect(followPageReady({ ...page, blocked: true }, true)).toBe(false);
    expect(followPageReady({ ...page, net: { ...page.net, role: 'spectator' } }, true)).toBe(false);
    expect(followPageReady({ ...page, net: null }, true)).toBe(false);
  });
});

it('renews server rate windows for a sustained honest client and stops at teardown', () => {
  vi.useFakeTimers();
  let frames = 0, closes = 0, resets = 0;
  const stop = startFollowRateWindows({ resetRates: () => { frames = 0; resets++; } });
  try {
    // A normal 60 Hz client stays under the production 120-frame window over multiple seconds.
    for (let second = 0; second < 8; second++) {
      for (let i = 0; i < 60; i++) if (++frames > 120) closes++;
      vi.advanceTimersByTime(1000);
    }
    expect(closes).toBe(0); expect(resets).toBe(8);
    stop(); vi.advanceTimersByTime(3000); expect(resets).toBe(8);
  } finally { stop(); vi.useRealTimers(); }
});
