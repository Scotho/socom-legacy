import { afterEach, describe, expect, it } from 'vitest';
import { BOT_PROFILE_PHASES, BotProfiler, instrumentNavigation, setBotProfiler } from '../src/bots/botProfile';

afterEach(() => setBotProfiler(null));

/** Product-track clock fixture: work advances time explicitly; the scheduler's waits advance it outside next(). */
function fixture() {
  let ns = 0n;
  const work = (n: number) => { ns += BigInt(n); };
  const prof = new BotProfiler(() => ns);
  setBotProfiler(prof);
  const drain = <T>(steps: Generator<number, T, unknown>): T => {
    let s = steps.next(); while (!s.done) s = steps.next(); return s.value;
  };
  const nav = {
    cleaned: 0,
    neighbours() { work(3); return [1]; },
    *canWalkSteps(from: number, to: number): Generator<number, boolean, unknown> {
      work(2); yield from; work(5); return to > from;
    },
    canWalk(from: number, to: number) { return drain(this.canWalkSteps(from, to)); },
    *routeSteps(from: number, to: number): Generator<number, number[], unknown> {
      try {
        const clear = yield* this.canWalkSteps(from, to);
        this.neighbours(); yield to; work(7);
        return clear ? [from, to] : [];
      } finally { this.cleaned++; work(11); }
    },
    route(from: number, to: number) { return drain(this.routeSteps(from, to)); },
  };
  instrumentNavigation(nav);
  const routeTime = () => prof.sum[BOT_PROFILE_PHASES.indexOf('route')];
  return { prof, nav, work, routeTime };
}

describe('resumable navigation profiling (product-track instrument)', () => {
  it('counts jobs and nested walk/expansion work, excluding time waiting between resumptions', () => {
    const { prof, nav, work, routeTime } = fixture();
    const job = nav.routeSteps(4, 9);
    expect(prof.routeCalls).toBe(0);
    expect(job.next()).toEqual({ value: 4, done: false });
    expect(prof.caller).toBe('other');
    work(1000);
    expect(job.next()).toEqual({ value: 9, done: false });
    work(2000);
    expect(job.next()).toEqual({ value: [4, 9], done: true });
    expect(prof.routeCalls).toBe(1);
    expect(prof.canWalk).toEqual({ route: 1, other: 0, steer: 0, smooth: 0, space: 0 });
    expect(prof.routeExpanded).toBe(1);
    expect(routeTime()).toBe(28);
    expect(nav.cleaned).toBe(1);
    const phaseCount = prof.count[BOT_PROFILE_PHASES.indexOf('route')];
    expect(job.next()).toEqual({ value: undefined, done: true });
    expect(prof.count[BOT_PROFILE_PHASES.indexOf('route')]).toBe(phaseCount);
  });

  it('does not double-count synchronous methods which drain their instrumented generators', () => {
    const { prof, nav, routeTime } = fixture();
    expect(nav.route(4, 9)).toEqual([4, 9]);
    expect(prof.routeCalls).toBe(1);
    expect(routeTime()).toBe(28);
    expect(prof.count[BOT_PROFILE_PHASES.indexOf('route')]).toBe(1);
    expect(prof.canWalk.route).toBe(1);
    prof.caller = 'steer';
    expect(nav.canWalk(9, 4)).toBe(false);
    expect(prof.canWalk.steer).toBe(1);
    expect(prof.caller).toBe('steer');
  });

  it('scopes routing to each active resume and forwards cancellation and its cleanup', () => {
    const { prof, nav, work, routeTime } = fixture();
    const a = nav.routeSteps(1, 2), b = nav.routeSteps(3, 4);
    a.next(); b.next();
    work(1000);
    expect(nav.canWalk(0, 1)).toBe(true);
    nav.neighbours(); // unrelated work between the jobs must not be attributed to a route
    expect(a.return([99])).toEqual({ value: [99], done: true });
    expect(b.next()).toEqual({ value: 4, done: false });
    expect(b.next()).toEqual({ value: [3, 4], done: true });
    expect(nav.cleaned).toBe(2);
    expect(prof.routeCalls).toBe(2);
    expect(prof.routeExpanded).toBe(1);
    expect(prof.canWalk.route).toBe(2);
    expect(prof.canWalk.other).toBe(1);
    expect(prof.caller).toBe('other');
    expect(routeTime()).toBe(41); // cancelled job 2 + 11; completed job 28
  });

  it('forwards thrown errors through a suspended job and restores the caller after cleanup', () => {
    const { prof, nav, work, routeTime } = fixture();
    const job = nav.routeSteps(1, 2), error = new Error('stop this route');
    job.next(); work(1000); prof.caller = 'space';
    expect(() => job.throw(error)).toThrow(error);
    expect(nav.cleaned).toBe(1);
    expect(prof.caller).toBe('space');
    expect(routeTime()).toBe(13);
    expect(prof.routeCalls).toBe(1);
  });

  it('does not record jobs cancelled before they start or change results with profiling switched off', () => {
    const { prof, nav } = fixture();
    expect(nav.routeSteps(1, 2).return([8])).toEqual({ value: [8], done: true });
    expect(prof.routeCalls).toBe(0);
    expect(nav.cleaned).toBe(0);
    setBotProfiler(null);
    expect(nav.route(1, 2)).toEqual([1, 2]);
    expect(prof.routeCalls).toBe(0);
  });
});
