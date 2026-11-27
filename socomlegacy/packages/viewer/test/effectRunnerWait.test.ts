import { describe, expect, it } from 'vitest';
import type { EffectOp, EffectProgram } from '@s2u/scene';
import { EffectRun, WAIT_EQUALITY_HOLD_READING, COUNTED_WAIT_FRAME_READING, type EffectHost } from '../src/effectRunner';

/**
 * LATER 1426 (research 89 s1, "The WAIT's tick"; reading, pending review): the shared runner's WAIT in the original's form.
 * r0004: the dispatcher 0x26b2b0 begins a command and calls its tick in the same call (0x26b32c-0x26b388); the WAIT's tick
 * 0x25f7c0-0x25f8bc holds while dt + elapsed <= seconds (equality holds) and, once past, hands dt - max(0, seconds -
 * elapsed) on; the counted form adds one a tick from its begin and never touches dt. r0001: `FUN_0026a6e0`
 * D:L115199-115211, `FUN_0025ed50` D:L108436-108447, the tick 0x25ec50-0x25ed4c by address; the menus' runtime holds the
 * same form (`@s2u/ui` zanimRuntime, research 106). The hold's margin is WAIT_EQUALITY_HOLD_READING over a compensated sum:
 * each end lands strictly after the seconds, as the original's does.
 */

const program = (...sequences: { name?: string; ops: EffectOp[] }[]): EffectProgram => ({
  name: 't', root: 0, flags: 0, nodes: ['NA'],
  sequences: sequences.map((s, i) => ({ name: s.name ?? `s${i}`, activation: 1, ops: s.ops })),
});
const mark = (n: number): EffectOp => ({ op: 'call', anim: `m${n}` });
const wait = (seconds: number, range = 0): EffectOp => ({ op: 'wait', seconds: Math.fround(seconds), range: Math.fround(range), frames: null });
const frames = (n: number): EffectOp => ({ op: 'wait', seconds: 0, range: 0, frames: n });
const timed: EffectOp = { op: 'motion', motion: {} as never };
const F = 1 / 60;

/** Runs `update(0)` (every caller's start) then `ticks` updates of `dt`; the tick each mark fired on, and the timed command's first dt. */
function run(ops: EffectOp[], ticks: number, dt: number | ((k: number) => number) = F, randoms: number[] = []) {
  const fired: [string, number][] = [];
  const firstDt: number[] = [];
  let k = 0, asked = 0;
  const host: EffectHost = {
    begin: (op) => {
      if (op.op === 'call') { fired.push([op.anim, k]); return; }
      if (op.op === 'motion') {
        let first = true;
        return (d: number) => { if (first) { firstDt.push(d); first = false; } return true; };
      }
    },
    test: () => false,
    random: () => { asked++; return randoms.shift() ?? 0.5; },
  };
  const r = new EffectRun(program({ ops }), host);
  r.update(0);
  for (k = 1; k <= ticks; k++) r.update(typeof dt === 'number' ? dt : dt(k));
  return { fired, firstDt, asked: () => asked, at: (n: number) => fired.filter(([a]) => a === `m${n}`).map(([, t]) => t) };
}

describe('LATER 1426: the shared runner WAIT, in the original form (research 89 s1)', () => {
  it('names its two readings', () => {
    expect(WAIT_EQUALITY_HOLD_READING).toBe(1e-9);
    expect(COUNTED_WAIT_FRAME_READING).toMatch(/tick/);
  });

  it("D1: a WAIT reached with dt > 0 (after a LOOP's restart) accrues from the tick it begins in", () => {
    // 0.11 s is 6.6 ticks: the first pass ends on tick 7; the restart (tick 8, a whole dt) accrues at once, so the period
    // is 7 ticks (floor(f x s) + 1), not 8 (the begin accruing nothing).
    const r = run([wait(0.11), mark(1), { op: 'loop', count: -1, seconds: null }], 22);
    expect(r.at(1)).toEqual([7, 14, 21]);
  });

  it('D2a: the leftover is handed on -- WAIT 0.17 then a timed command that begins with the rest of the tick', () => {
    const r = run([wait(0.17), timed, mark(1)], 12);
    expect(r.at(1)).toEqual([11]);
    expect(r.firstDt).toHaveLength(1);
    // tick 11: 11/60 - 0.17 s (the stored f32 seconds) left over, to the double's rounding.
    expect(Math.abs(r.firstDt[0]! - (11 / 60 - Math.fround(0.17)))).toBeLessThan(1e-12);
  });

  it('D2b: 0.5, 0.24, 1.5 and 0.17 s waits end at 60 Hz on floor(60 s) + 1 (equality holds)', () => {
    // The original's rule in exact arithmetic on the stored seconds: 0.5 s -- 30 ticks meet it, held, tick 31; 0.24 s --
    // 14.4 ticks, tick 15; 1.5 s -- 90 meet it, held, tick 91; 0.17 s -- 10.2 ticks, tick 11.
    for (const [s, want] of [[0.5, 31], [0.24, 15], [1.5, 91], [0.17, 11]] as const) {
      expect(run([wait(s), mark(1)], 100).at(1), `${s} s`).toEqual([want]);
    }
  });

  it("D2b: a wait the ticks meet exactly holds on that tick and ends on the next, whatever the sum's rounding", () => {
    // 12/60 s and 600/60 s: met on ticks 12 and 600 (a plain double sum of 1/60 overshoots or falls short by rounding;
    // the compensated sum stays within WAIT_EQUALITY_HOLD_READING of the exact time).
    expect(run([{ op: 'wait', seconds: 12 / 60, range: 0, frames: null }, mark(1)], 20).at(1)).toEqual([13]);
    expect(run([{ op: 'wait', seconds: 10, range: 0, frames: null }, mark(1)], 610).at(1)).toEqual([601]);
  });

  it('D3: a counted wait leaves dt whole for the next timed command', () => {
    const r = run([frames(2), timed, mark(1)], 5);
    expect(r.at(1)).toEqual([2]);                     // N ticks after its begin tick (the begin tick is count 1)
    expect(r.firstDt).toEqual([F]);
  });

  it('a counted wait of 0 is done on its begin tick', () => {
    expect(run([frames(0), mark(1)], 2).at(1)).toEqual([0]);
  });

  it('a chain of k waits ends at floor(f x sum s) + 1, not at the sum of each ceiling', () => {
    // 3 x 0.11 s: 19.8 ticks, so tick 20 (each wait's ceiling summed would be 21).
    expect(run([wait(0.11), wait(0.11), wait(0.11), mark(1)], 30).at(1)).toEqual([20]);
  });

  it("a LOOP's period over whole-sixtieth waits is kept: 0.25 s ends every 16 ticks", () => {
    const r = run([wait(0.25), mark(1), { op: 'loop', count: -1, seconds: null }], 50);
    expect(r.at(1)).toEqual([16, 32, 48]);
  });

  it('the random form is unchanged: base + range x one draw at the begin', () => {
    // 0.1 + 0.1 x 0.55 = 0.155 s: 9.3 ticks, tick 10; one draw.
    const r = run([wait(0.1, 0.1), mark(1)], 15, F, [0.55]);
    expect(r.at(1)).toEqual([10]);
    expect(r.asked()).toBe(1);
  });

  it('F3: a WAIT under one CLEANUP_DT in a cleanup sequence passes within the single cleanup step', () => {
    // The cleanup runs in one 1.0 s step (FUN_0026d870, D:L117118): WAIT 0.5 is passed in it, and the timeless command
    // after it runs in the same step (the dispatcher's rule). No disc cleanup sequence holds a WAIT.
    const fired: string[] = [];
    const host: EffectHost = {
      begin: (op) => { if (op.op === 'call') fired.push(op.anim); },
      test: () => false,
      random: () => 0.5,
    };
    const p: EffectProgram = {
      name: 't', root: 0, flags: 0, nodes: ['NA'], cleanup: 1,
      sequences: [
        { name: 'main', activation: 1, ops: [] },
        { name: 'cleanup', activation: 1, ops: [wait(0.5), mark(9)] },
      ],
    };
    const r = new EffectRun(p, host);
    r.update(0);
    expect(fired).toEqual(['m9']);
  });

  it('a jittered display rate: each end lands strictly after the seconds, within one frame', () => {
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const dts: number[] = [0];
    for (let i = 1; i <= 400; i++) dts.push(1 / 144 + (rnd() - 0.5) * 0.004);
    for (const s of [0.5, 0.24, 1.5, 0.17]) {
      const r = run([wait(s), mark(1)], 400, (k) => dts[k]!);
      const [end] = r.at(1);
      expect(end, `${s} s`).toBeDefined();
      const before = dts.slice(0, end!).reduce((a, b) => a + b, 0), at = before + dts[end!]!;
      expect(at, `${s} s`).toBeGreaterThan(Math.fround(s));
      expect(before, `${s} s`).toBeLessThanOrEqual(Math.fround(s));
    }
  });
});
