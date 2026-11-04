import { describe, expect, it } from 'vitest';
import { Timeline, runTimeline } from '../eph/timeline';
import { RunAborted } from '../eph/abort';
import { parseScript } from '../eph/script';

/**
 * The runner's timeline (EPH-2; the design note: an event at 300 ms fires when the clock -- PCSX2's guest clock over
 * PINE, or the page's tick -- has advanced 300 ms, however long the host took). Tested on a fake clock.
 */
const script = parseScript('0 triangle 1\n150 triangle 0\n150 cross 1\n400 cross 0');

describe('the timeline, polled', () => {
  it('fires every due event in script order and reports how late each fired', () => {
    const tl = new Timeline(script);
    expect(tl.poll(0).map((f) => [f.event.line, f.at, f.lateBy])).toEqual([[1, 0, 0]]);
    expect(tl.poll(149)).toEqual([]);
    expect(tl.poll(166).map((f) => [f.event.line, f.at, f.lateBy])).toEqual([[2, 166, 16], [3, 166, 16]]);
    expect(tl.done).toBe(false);
    expect(tl.poll(400).map((f) => f.event.line)).toEqual([4]);
    expect(tl.done).toBe(true);
    expect(tl.poll(1000)).toEqual([]);
  });

  it('refuses a clock that goes back', () => {
    const tl = new Timeline(script);
    tl.poll(100);
    expect(() => tl.poll(99)).toThrow(/clock went back from 100 to 99/);
  });
});

describe('the timeline, run on a clock', () => {
  it('fires each event once the clock reaches it, never out of order', async () => {
    const readings = [0, 50, 120, 151, 152, 380, 401];
    let i = 0;
    const clock = (): number => readings[Math.min(i++, readings.length - 1)]!;
    const fired: [number, number][] = [];
    let waits = 0;
    const log = await runTimeline(script, clock, (ev, at) => { fired.push([ev.line, at]); }, { wait: async () => { waits++; } });
    expect(fired).toEqual([[1, 0], [2, 151], [3, 151], [4, 401]]);
    expect(log.map((f) => f.lateBy)).toEqual([0, 1, 1, 1]);
    expect(waits).toBe(4);
  });

  it('accepts an async clock (the guest clock over PINE) and an async fire', async () => {
    let now = 0;
    const order: string[] = [];
    const log = await runTimeline(parseScript('10 cross 1\n20 cross 0'), async () => (now += 7),
      async (ev) => { order.push(`${ev.input}:${ev.pressure}`); }, { wait: async () => undefined });
    expect(order).toEqual(['cross:1', 'cross:0']);
    expect(log.map((f) => f.at)).toEqual([14, 21]);
  });

  it('stops with an error when the clock does not reach the next event before the deadline', async () => {
    await expect(runTimeline(script, () => 10, () => undefined, { wait: async () => undefined, maxPolls: 5 }))
      .rejects.toThrow(/the clock read 10 after 5 polls with nothing due, short of the next event at 150 \(script line 2\)/);
  });

  it('stops with an error when the clock stands still for stallMs of wall time, but not while it creeps forward', async () => {
    let wall = 0;
    const opts = { wait: async () => { wall += 100; }, stallMs: 1000, wallNow: () => wall };
    await expect(runTimeline(script, () => 10, () => undefined, opts))
      .rejects.toThrow(/EPH timeline: the clock stood at 10 for 1000 ms of wall time, short of the next event at 150 \(script line 2\)/);
    // A slow clock (one ms per poll, far under the events) is not a stall.
    let now = 0;
    wall = 0;
    const log = await runTimeline(script, () => now++, () => undefined, opts);
    expect(log).toHaveLength(4);
  });

  it('ends its wait when the run is aborted, with RunAborted, firing nothing more', async () => {
    const ctl = new AbortController();
    const fired: number[] = [];
    let polls = 0;
    const run = runTimeline(script, () => (++polls === 3 ? (ctl.abort(), 0) : 0), (ev) => { fired.push(ev.line); }, { signal: ctl.signal });
    await expect(run).rejects.toBeInstanceOf(RunAborted);
    expect(fired).toEqual([1]);
  });

  it('bounds a firing that never settles by stallMs of wall time, with a clear line', async () => {
    let wall = 0;
    let waits = 0;
    const run = runTimeline(script, () => 0, () => new Promise<void>(() => undefined), {
      wait: async () => { waits++; wall += 100; }, stallMs: 1000, wallNow: () => wall,
    });
    await expect(run).rejects.toThrow('EPH timeline: firing script line 1 did not settle in 1000 ms of wall time');
    expect(waits).toBe(10);
  });

  it('ends a firing that never settles at the abort, with the abort error', async () => {
    const ctl = new AbortController();
    const run = runTimeline(script, () => 0, () => new Promise<void>(() => undefined), { signal: ctl.signal });
    setTimeout(() => ctl.abort(new RunAborted('interrupted (Ctrl+C)')), 20);
    await expect(run).rejects.toBeInstanceOf(RunAborted);
  });

  it('still passes a firing failure on, and an async firing that settles goes on', async () => {
    let waits = 0;
    await expect(runTimeline(script, () => 0, async () => { throw new Error('setPad failed'); }, { wait: async () => { waits++; } }))
      .rejects.toThrow('setPad failed');
    const log = await runTimeline(parseScript('0 cross 1\n0 cross 0'), () => 0, async () => undefined, { wait: async () => { waits++; } });
    expect(log).toHaveLength(2);
  });

  it('ends a real wait (the default 1 ms sleep) at the abort, not after it', async () => {
    const ctl = new AbortController();
    const run = runTimeline(parseScript('0 cross 1\n600000 cross 0'), () => 0, () => undefined, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 20);
    await expect(run).rejects.toBeInstanceOf(RunAborted);
  });
});
