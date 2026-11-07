import { describe, expect, it } from 'vitest';
import type { EffectCondition, EffectOp, EffectProgram } from '@s2u/scene';
import { EffectRun, type EffectHost } from '../src/effectRunner';

/** The zAnim sequencer the effects run on (socomlegacy/docs/research/89 §1): control flow, waits, loops, timed commands. */

const program = (...sequences: { name?: string; ops: EffectOp[] }[]): EffectProgram => ({
  name: 't', root: 0, flags: 0, nodes: ['NA'],
  sequences: sequences.map((s, i) => ({ name: s.name ?? `s${i}`, activation: 1, ops: s.ops })),
});
const mark = (n: number): EffectOp => ({ op: 'call', anim: `m${n}` });

function host(randoms: number[] = []): EffectHost & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    begin: (op) => { if (op.op === 'call') log.push(op.anim); },
    test: () => false,
    random: () => randoms.shift() ?? 0.5,
  };
}

describe('the effect sequencer', () => {
  it('takes the first branch whose random weight holds, as flash_fire_hider picks its turn', () => {
    const ops: EffectOp[] = [
      { op: 'if', conditions: [{ kind: 'random', p: 0.125 }] }, mark(1),
      { op: 'elseif', conditions: [{ kind: 'random', p: 0.25 }] }, mark(2),
      { op: 'else' }, mark(3),
      { op: 'endif' }, mark(9),
    ];
    for (const [rolls, want] of [[[0.1], ['m1', 'm9']], [[0.5, 0.2], ['m2', 'm9']], [[0.5, 0.9], ['m3', 'm9']]] as const) {
      const h = host([...rolls]);
      new EffectRun(program({ ops }), h).update(0);
      expect(h.log).toEqual(want);
    }
  });

  it("folds an IF's operands through its EXPRESSION operators, left to right (FUN_0025e960, research 106 §3)", () => {
    // Enowapi's gate_openclose2 opens on `woodgate == 0 OR woodgate2 == 0` (operator 3). An operator is not an operand:
    // the host never answers one, and the condition is not every token's truth.
    const valve = (v: string): { kind: 'valve'; valve: string; operation: number; operand: number } => ({ kind: 'valve', valve: v, operation: 2, operand: 0 });
    const ops = (op: number): EffectOp[] => [
      { op: 'if', conditions: [valve('a'), { kind: 'operator', operator: op }, valve('b')] }, mark(1),
      { op: 'else' }, mark(2), { op: 'endif' },
    ];
    const run = (op: number, a: number, b: number): string[] => {
      const h = host();
      h.test = (c) => {
        if (c.kind !== 'valve') throw new Error(`an operator reached the host: ${JSON.stringify(c)}`);
        return (c.valve === 'a' ? a : b) === 0;
      };
      new EffectRun(program({ ops: ops(op) }), h).update(0);
      return h.log;
    };
    expect(run(3, 0, 0)).toEqual(['m1']);
    expect(run(3, 1, 0)).toEqual(['m1']);
    expect(run(3, 1, 1)).toEqual(['m2']);
    expect(run(2, 0, 0)).toEqual(['m1']);
    expect(run(2, 1, 0)).toEqual(['m2']);
  });

  it('LATER 310: two operands with no operator between them -- the condition is the first; the second is never asked (FUN_0025e960 D:L108375-108379)', () => {
    // The original's evaluator meets the second operand with a value and no operator pending: it puts the pc back on the
    // first and returns its value before running the second (D:L108375-108379; the run is D:L108380). The base asked
    // every token and required them all. The second's run as a statement after a true condition is not modelled (ruling
    // R1): the disc's one pair, MP64's bugs_flying, is of unread operands (research 89 §18).
    const asked: string[] = [];
    const run = (a: boolean, b: boolean): string[] => {
      const h = host();
      h.test = (c) => {
        if (c.kind !== 'valve') throw new Error(`an operator reached the host: ${JSON.stringify(c)}`);
        asked.push(c.valve);
        return c.valve === 'a' ? a : b;
      };
      const v = (name: string) => ({ kind: 'valve' as const, valve: name, operation: 2, operand: 0 });
      new EffectRun(program({ ops: [{ op: 'if', conditions: [v('a'), v('b')] }, mark(1), { op: 'else' }, mark(2), { op: 'endif' }] }), h).update(0);
      return h.log;
    };
    expect(run(true, false)).toEqual(['m1']);
    expect(run(false, true)).toEqual(['m2']);
    expect(asked).toEqual(['a', 'a']);
  });

  it('LATER 310: no precedence -- `a OR b AND c` is `(a OR b) AND c`; NOT takes the next operand or group (FUN_0025e960, research 106 §3)', () => {
    const v = (name: string) => ({ kind: 'valve' as const, valve: name, operation: 2, operand: 1 });
    const op = (operator: number) => ({ kind: 'operator' as const, operator });
    const run = (conditions: EffectCondition[], on: Record<string, boolean>): string[] => {
      const h = host();
      h.test = (c) => {
        if (c.kind !== 'valve') throw new Error(`an operator reached the host: ${JSON.stringify(c)}`);
        return on[c.valve]!;
      };
      new EffectRun(program({ ops: [{ op: 'if', conditions }, mark(1), { op: 'else' }, mark(2), { op: 'endif' }] }), h).update(0);
      return h.log;
    };
    // a OR b AND c with a true, b and c false: left to right it is false (a precedence of AND would make it true).
    expect(run([v('a'), op(3), v('b'), op(2), v('c')], { a: true, b: false, c: false })).toEqual(['m2']);
    expect(run([v('a'), op(3), v('b'), op(2), v('c')], { a: true, b: false, c: true })).toEqual(['m1']);
    // NOT a AND b; NOT ( a OR b ).
    expect(run([op(1), v('a'), op(2), v('b')], { a: false, b: true })).toEqual(['m1']);
    expect(run([op(1), op(4), v('a'), op(3), v('b'), op(5)], { a: false, b: false })).toEqual(['m1']);
    expect(run([op(1), op(4), v('a'), op(3), v('b'), op(5)], { a: true, b: false })).toEqual(['m2']);
  });

  it('LATER 310 R2 (narrowed, review F1): the sourced operands decide where every answer of the unread ones agrees; else the pre-fold false (ZANIM_UNREAD_OPERAND_PLACEHOLDER)', () => {
    // Corpse_Found's `set 2 cmd 33 OR valve_aware == 1` with valve_aware 1 holds in the original whatever cmd 33 answers
    // (D:L108398-108402): the fold decides it. shell_smoke_med's `NOT set 0 cmd 70` turns on the unread answer: false.
    const unread = { kind: 'other' as const, cmd: 70, set: 0 };   // set 0's 72 is answered since INV-RAIN F3 (`indoorsOperand`)
    const unread2 = { kind: 'other' as const, cmd: 33, set: 2 };
    const run = (conditions: EffectCondition[], a: boolean, randoms: number[] = []): { log: string[]; draws: number; asked: number } => {
      const h = host([...randoms]);
      let draws = 0, asked = 0;
      const random = h.random;
      h.random = (r) => { draws++; return random(r); };
      h.test = (c) => { if (c.kind === 'valve') asked++; return c.kind === 'valve' ? a : false; };
      new EffectRun(program({ ops: [{ op: 'if', conditions }, mark(1), { op: 'else' }, mark(2), { op: 'endif' }] }), h).update(0);
      return { log: h.log, draws, asked };
    };
    const not = { kind: 'operator' as const, operator: 1 }, or = { kind: 'operator' as const, operator: 3 }, and = { kind: 'operator' as const, operator: 2 };
    const valve = { kind: 'valve' as const, valve: 'a', operation: 2, operand: 0 };
    // Decided by the sourced operand: either answer of the unread one gives the same result.
    expect(run([unread2, or, valve], true).log).toEqual(['m1']);
    expect(run([valve, or, unread], true).log).toEqual(['m1']);
    expect(run([valve, and, unread], false).log).toEqual(['m2']);
    // Each sourced operand asked once, in order, however many answers are tried.
    expect(run([unread2, or, valve, or, unread], true)).toMatchObject({ log: ['m1'], asked: 1 });
    expect(run([{ kind: 'random', p: 1 }, or, unread], false, [0.2])).toEqual({ log: ['m1'], draws: 1, asked: 0 });
    // Undecided -- the unread answer turns it: the pre-fold result, false.
    expect(run([not, unread], false).log).toEqual(['m2']);
    expect(run([valve, or, unread], false).log).toEqual(['m2']);
    expect(run([valve, and, not, unread], true).log).toEqual(['m2']);
    expect(run([{ kind: 'random', p: 0 }, or, unread], false, [0.2])).toEqual({ log: ['m2'], draws: 1, asked: 0 });
    // A condition with no unread operand folds.
    expect(run([not, valve], false).log).toEqual(['m1']);
  });

  it('LATER 310 R2 (first form, kept as written): NOT of an unread operand is not a taken branch', () => {
    // shell_smoke_med's `NOT set 0 cmd 70` (and the camera checks' `NOT set 0 cmd 72` until INV-RAIN F3 answered 72): no
    // host answers the command from a source, so the fold's NOT must not make the hosts' unread false a taken branch.
    const unread = { kind: 'other' as const, cmd: 70, set: 0 };
    const run = (conditions: EffectCondition[], a: boolean): { log: string[] } => {
      const h = host();
      h.test = (c) => (c.kind === 'valve' ? a : false);
      new EffectRun(program({ ops: [{ op: 'if', conditions }, mark(1), { op: 'else' }, mark(2), { op: 'endif' }] }), h).update(0);
      return { log: h.log };
    };
    const not = { kind: 'operator' as const, operator: 1 }, and = { kind: 'operator' as const, operator: 2 };
    const valve = { kind: 'valve' as const, valve: 'a', operation: 2, operand: 0 };
    expect(run([not, unread], false).log).toEqual(['m2']);
    expect(run([not, unread], true).log).toEqual(['m2']);
    expect(run([valve, and, not, unread], true).log).toEqual(['m2']);
  });

  it('INV-RAIN F3 per host: set 0\'s 66 / 72 are asked only of a host that answers them (`answersIndoors`); any other folds them as unread', () => {
    // The v0.4.12 shards' doors and footsteps reds: the world's display run (`./worldState`), whose host answers only
    // valves, was asked `NOT CAMERA_INDOORS`, answered false, and took the branch -- Frostfire's beds and gusts ~15 a second.
    const camera = { kind: 'other' as const, cmd: 66, set: 0 }, player = { kind: 'other' as const, cmd: 72, set: 0 };
    const not = { kind: 'operator' as const, operator: 1 };
    const run = (conditions: EffectCondition[], answers: boolean, inside: boolean): { log: string[]; asked: number } => {
      const h = host();
      let asked = 0;
      h.test = (c) => { if (c.kind === 'other') asked++; return c.kind === 'other' ? inside : false; };
      new EffectRun(program({ ops: [{ op: 'if', conditions }, mark(1), { op: 'else' }, mark(2), { op: 'endif' }] }), answers ? { ...h, answersIndoors: true } : h).update(0);
      return { log: h.log, asked };
    };
    for (const c of [camera, player]) {
      // A host that does not answer them: unread, never asked; NOT of one is not a taken branch.
      expect(run([not, c], false, false)).toEqual({ log: ['m2'], asked: 0 });
      expect(run([c], false, true)).toEqual({ log: ['m2'], asked: 0 });
      // The effect runner's host (`./effects`): asked, and its answer decides.
      expect(run([not, c], true, false)).toEqual({ log: ['m1'], asked: 1 });
      expect(run([c], true, true)).toEqual({ log: ['m1'], asked: 1 });
    }
  });

  it('nests: an inner IF inside a skipped branch is skipped whole', () => {
    const ops: EffectOp[] = [
      { op: 'if', conditions: [{ kind: 'random', p: 0 }] },
      { op: 'if', conditions: [{ kind: 'random', p: 1 }] }, mark(1), { op: 'endif' },
      { op: 'else' }, mark(2), { op: 'endif' },
    ];
    const h = host([0.5]);
    new EffectRun(program({ ops }), h).update(0);
    expect(h.log).toEqual(['m2']);
  });

  it('waits its seconds, then goes on; the run ends with its last sequence', () => {
    const h = host();
    const run = new EffectRun(program({ ops: [mark(1), { op: 'wait', seconds: 0.25, range: 0, frames: null }, mark(2)] }), h);
    run.update(0);
    expect(h.log).toEqual(['m1']);
    run.update(0.2);
    expect(h.log).toEqual(['m1']);
    run.update(0.1);
    expect(h.log).toEqual(['m1', 'm2']);
    expect(run.finished).toBe(true);
  });

  it('WAIT n frames resumes n ticks later', () => {
    const h = host();
    const run = new EffectRun(program({ ops: [{ op: 'wait', seconds: 0, range: 0, frames: 1 }, mark(1)] }), h);
    run.update(0);
    expect(h.log).toEqual([]);
    run.update(1 / 60);
    expect(h.log).toEqual(['m1']);
  });

  it('a LOOP forever repeats its sequence once a tick until another sequence stops it', () => {
    const h = host();
    const run = new EffectRun(program(
      { name: 'fix', ops: [mark(1), { op: 'loop', count: -1, seconds: null }] },
      { name: 'scale', ops: [{ op: 'wait', seconds: 0.05, range: 0, frames: null }, { op: 'stopSequence', sequence: 'fix' }] },
    ), h);
    run.update(0);
    run.update(0.02);
    run.update(0.02);
    expect(h.log).toEqual(['m1', 'm1', 'm1']);
    run.update(0.02);
    expect(run.finished).toBe(true);
    const before = h.log.length;
    run.update(0.02);
    expect(h.log.length).toBe(before);
  });

  it('holds a sequence on a timed command until its tick answers done', () => {
    let left = 0.1;
    const log: string[] = [];
    const h: EffectHost = {
      begin: (op) => (op.op === 'motion' ? (dt: number) => (left -= dt) <= 0 : void log.push(op.op)),
      test: () => false, random: () => 0,
    };
    const run = new EffectRun(program({ ops: [{ op: 'motion', motion: {} as never }, { op: 'active', node: 1, on: false }] }), h);
    run.update(0);
    run.update(0.05);
    expect(log).toEqual([]);
    run.update(0.06);
    expect(log).toEqual(['active']);
    expect(run.finished).toBe(true);
  });

  it('an endless WHILE runs its body once a tick until the run is stopped (the ripples)', () => {
    const h = host();
    const run = new EffectRun(program({ ops: [{ op: 'while', forever: true }, mark(1), { op: 'endWhile' }, mark(2)] }), h);
    run.update(0);
    run.update(0.1);
    run.update(0.1);
    expect(h.log).toEqual(['m1', 'm1', 'm1']);
    expect(run.finished).toBe(false);
    run.stop();
    run.update(0.1);
    expect(h.log).toEqual(['m1', 'm1', 'm1']);
    expect(run.finished).toBe(true);
  });

  it('a called sequence of activation 2 waits for its CALL_SEQUENCE; a self-pause keeps the run alive', () => {
    const h = host();
    const p: EffectProgram = {
      name: 'fire', root: 0, flags: 0, nodes: ['NA'],
      sequences: [
        { name: 'control', activation: 1, ops: [{ op: 'wait', seconds: 1, range: 0, frames: null }, { op: 'callSequence', sequence: 'lights' }] },
        { name: 'lights', activation: 2, ops: [mark(1)] },
        { name: 'gate', activation: 2, ops: [mark(2)] },
        { name: 'hold', activation: 1, ops: [{ op: 'pauseAnimation', anim: 'NA' }] },
      ],
    };
    const run = new EffectRun(p, h);
    run.update(0);
    expect(h.log).toEqual(['m2']);                     // the uncalled activation-2 sequence runs at once
    expect(run.paused).toBe(true);
    expect(run.finished).toBe(false);                  // paused: alive
    run.paused = false;
    run.update(1.1);
    expect(h.log).toEqual(['m2', 'm1']);
  });

  it('FAIL stops the whole animation', () => {
    const h = host();
    const run = new EffectRun(program({ ops: [{ op: 'fail' }, mark(1)] }, { ops: [{ op: 'wait', seconds: 1, range: 0, frames: null }, mark(2)] }), h);
    run.update(0);
    run.update(2);
    expect(h.log).toEqual([]);
    expect(run.finished).toBe(true);
  });
});
