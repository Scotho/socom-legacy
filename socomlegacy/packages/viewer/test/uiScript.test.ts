import { describe, expect, it } from 'vitest';
import type { UiCommand, UiOp, UiProgram, UiToken } from '@s2u/scene';
import { slerp, UiRunner, valveAssign, valveTest, type UiHost } from '../src/uiScript';

/**
 * The menu scripts' player (web sprint 5 S3; research 95 §1): hand-built programs in `decodeUiSet`'s shape, stepped
 * frame by frame over named nodes.
 */

const prog = (name: string, ...seqs: (UiOp[] | { name: string; activation: number; ops: UiOp[] })[]): UiProgram => ({
  name, nodes: [], sequences: seqs.map((s, i) => (Array.isArray(s) ? { name: `s${i}`, activation: 1, ops: s } : s)),
});
const cmd = (c: Partial<UiCommand>): UiCommand => ({ node: null, op: 0, fn: null, arg: 'NA', loc: 0, extra: [], ...c });
const v = (valve: string, op: '==' | '!=' | '>' | '&', operand: number): UiToken => ({ t: 'valve', valve, op, operand });
const set = (valve: string, operand: number): UiOp => ({ op: 'valve', valve, operation: '=', operand });
const show = (node: string, on = true): UiOp => ({ op: 'active', node, on });
const host = (calls: string[] = [], truth: (fn: string) => boolean = () => true): UiHost => ({
  command: (c) => { calls.push(`${c.fn}:${c.arg}`); return truth(c.fn ?? ''); },
  sound: (s) => calls.push(`sound:${s}`),
});
const runner = (programs: UiProgram[], h: UiHost = host()): UiRunner =>
  new UiRunner(programs, [{ name: 'A', x: 10, y: 20 }, { name: 'B', x: 0, y: 0, visible: false }], h);

describe('the valve operations (FUN_00353fd0 L252128-252345)', () => {
  it('tests 0-10', () => {
    expect([valveTest(0, 'true', 0), valveTest(3, 'true', 0)]).toEqual([false, true]);
    expect([valveTest(4, '==', 4), valveTest(4, '!=', 4), valveTest(5, '>', 4), valveTest(3, '<', 4), valveTest(4, '>=', 4), valveTest(4, '<=', 3)]).toEqual([true, false, true, true, true, false]);
    expect([valveTest(17, '&', 16), valveTest(1, '&', 16), valveTest(0, '|', 0), valveTest(0xffff, '&~', 0xffff), valveTest(0, '|~', 0)]).toEqual([true, false, false, false, true]);
  });
  it('assignments 11-18, u16, -= floored at 0', () => {
    expect([valveAssign(7, '=', 3), valveAssign(7, '+=', 3), valveAssign(2, '-=', 5), valveAssign(3, '*=', 4)]).toEqual([3, 10, 0, 12]);
    expect([valveAssign(1, '|=', 4), valveAssign(7, '&=', 5), valveAssign(0xff, '&=~', 0x0f), valveAssign(0, '|=~', 0xfff0)]).toEqual([5, 5, 0xf0, 0x000f]);
    expect(valveAssign(0xffff, '+=', 1)).toBe(0);
    expect(valveAssign(1, '==', 1)).toBeNull();
  });
});

describe('the script player', () => {
  it('shows and hides nodes, writes valves, and leaves a finished animation', () => {
    const r = runner([prog('P', [show('A', false), show('B'), set('X', 5)])]);
    expect(r.start('P')).toBe(true);
    r.step(0);
    expect([r.node('A').visible, r.node('B').visible, r.valve('X'), r.running('P')]).toEqual([false, true, 5, false]);
    expect(r.start('Nope')).toBe(false);                        // ARMORY_MISSING_ANIMS_READING
  });

  it('moves linearly at the rate and snaps to "to" at the end, "from" stored when given (MPSealPlace)', () => {
    const move: UiOp = { op: 'move', node: 'A', flags: 10, seconds: 0.1, position: { from: [-225, 145, 0], to: [490, 150, 0], rate: [7150, 50, 0] } };
    const r = runner([prog('P', [move, set('Done', 1)])]);
    r.start('P');
    r.step(0.05);
    expect([r.node('A').x, r.node('A').y]).toEqual([-225 + 357.5, 147.5]);
    expect(r.valve('Done')).toBe(0);                            // the motion holds its sequence
    r.step(0.06);
    expect([r.node('A').x, r.node('A').y, r.valve('Done')]).toEqual([490, 150, 1]);
    // No "from": from where the node is.
    const r2 = runner([prog('P', [{ op: 'move', node: 'A', flags: 8, seconds: 1, position: { from: null, to: [20, 20, 0], rate: [10, 0, 0] } }])]);
    r2.start('P'); r2.step(0.5);
    expect(r2.node('A').x).toBe(15);
  });

  it('a move without a stored "from" takes it once, at the command\'s start, not afresh each frame (FUN_0025fe70 L109034-109346)', () => {
    const r = runner([prog('P', [{ op: 'move', node: 'A', flags: 8, seconds: 1, position: { from: null, to: [110, 20, 0], rate: [100, 0, 0] }, scale: { from: null, to: [3, 1, 1], rate: [2, 0, 0] } }])]);
    r.start('P');
    r.step(0.25); r.step(0.25);
    expect(r.node('A').x).toBe(10 + 100 * 0.5);                  // not 10 + 25 + 50 (the position re-read)
    expect(r.node('A').scale[0]).toBe(1 + 2 * 0.5);
    r.step(0.25);
    expect(r.node('A').x).toBe(10 + 100 * 0.75);
  });

  it('fades opacity over its time (PulseArrows) and LOOPs forever, a pass a frame', () => {
    const r = runner([prog('Pulse', [
      { op: 'opacity', node: 'A', from: 0.2, to: 0.99, rate: 1.58, seconds: 0.5 },
      { op: 'opacity', node: 'A', from: 0.99, to: 0.2, rate: -1.58, seconds: 0.5 },
      { op: 'loop', count: null },
    ])]);
    r.start('Pulse');
    r.step(0.25);
    expect(r.node('A').opacity).toBeCloseTo(0.595, 3);
    r.step(0.5);
    expect(r.node('A').opacity).toBeCloseTo(0.595, 3);          // half-way back down
    for (let i = 0; i < 10; i++) r.step(0.1);
    expect(r.running('Pulse')).toBe(true);
  });

  it('runs sequences concurrently, CALL_SEQUENCE starts an activation-2 one, WAIT holds', () => {
    const r = runner([prog('P',
      [{ op: 'wait', seconds: 0.2 }, set('A1', 1)],
      [set('B1', 1), { op: 'callSequence', sequence: 'Late' }],
      { name: 'Late', activation: 2, ops: [{ op: 'wait', seconds: 0.1 }, set('C1', 1)] })]);
    r.start('P');
    r.step(0);
    expect([r.valve('A1'), r.valve('B1'), r.valve('C1')]).toEqual([0, 1, 0]);
    r.step(0.15);
    expect([r.valve('A1'), r.valve('C1')]).toEqual([0, 1]);
    r.step(0.1);
    expect(r.valve('A1')).toBe(1);
  });

  it('IF / ELSEIF / ELSE by depth; NOT, AND, OR and parentheses; a bound function\'s truth', () => {
    const branch = (x: number): number => {
      const r = runner([prog('P', [
        { op: 'if', depth: 1, tokens: [v('X', '==', 1)] }, set('R', 10),
        { op: 'if', depth: 2, tokens: [v('Y', '==', 1)] }, set('R', 11), { op: 'endif', depth: 2 },
        { op: 'elseif', depth: 1, tokens: [v('X', '==', 2)] }, set('R', 20),
        { op: 'else', depth: 1 }, set('R', 30),
        { op: 'endif', depth: 1 },
      ])]);
      r.setValve('X', x); r.setValve('Y', 1);
      r.start('P'); r.step(0);
      return r.valve('R');
    };
    expect([branch(1), branch(2), branch(3)]).toEqual([11, 20, 30]);
    const r = runner([], host([], (fn) => fn === 'Yes'));
    r.setValve('T', 8); r.setValve('E', 32);
    // ((E & 16) && T == 0) || ((E & 32) && T == 8)
    const t: UiToken[] = [{ t: 'open' }, { t: 'open' }, v('E', '&', 16), { t: 'close' }, { t: 'and' }, v('T', '==', 0), { t: 'close' }, { t: 'or' },
      { t: 'open' }, { t: 'open' }, v('E', '&', 32), { t: 'close' }, { t: 'and' }, v('T', '==', 8), { t: 'close' }];
    expect(r.truth(t)).toBe(true);
    expect(r.truth([{ t: 'not' }, v('T', '==', 8)])).toBe(false);
    expect(r.truth([v('T', '==', 0), { t: 'or' }, v('T', '==', 8), { t: 'and' }, v('E', '==', 32)])).toBe(true);
    expect(r.truth([{ t: 'ui', command: cmd({ fn: 'Yes' }) }, { t: 'and' }, { t: 'ui', command: cmd({ fn: 'No' }) }])).toBe(false);
  });

  it('WHILE tests at its head and yields a frame a pass; BREAK leaves it', () => {
    const r = runner([prog('P', [
      { op: 'while', forever: false, jump: 0, tokens: [v('Go', '==', 0)] },
      { op: 'valve', valve: 'N', operation: '+=', operand: 1 },
      { op: 'endWhile', jump: 0 },
      set('Out', 1),
    ])]);
    r.start('P');
    r.step(0); r.step(0); r.step(0);
    expect([r.valve('N'), r.valve('Out')]).toEqual([3, 0]);     // the confirm's wait on AreYouSure, a frame a pass
    r.setValve('Go', 1);
    r.step(0);
    expect(r.valve('Out')).toBe(1);
    const b = runner([prog('P', [
      { op: 'while', forever: true, jump: 0, tokens: [] }, { op: 'break' }, { op: 'endWhile', jump: 0 }, set('Out', 2),
    ])]);
    b.start('P'); b.step(0);
    expect(b.valve('Out')).toBe(2);
  });

  it('CALL_ANIMATION blocks its caller only with the flag; STOP_ANIMATION ends one; a running one called again starts over', () => {
    const r = runner([
      prog('Caller', [{ op: 'call', anim: 'Slow', block: true }, set('After', 1)]),
      prog('Slow', [{ op: 'wait', seconds: 1 }, set('SlowDone', 1)]),
      prog('Free', [{ op: 'call', anim: 'Slow', block: false }, set('FreeAfter', 1)]),
    ]);
    r.start('Caller'); r.step(0.5);
    expect(r.valve('After')).toBe(0);
    r.step(0.6); r.step(0);
    expect([r.valve('SlowDone'), r.valve('After')]).toEqual([1, 1]);
    r.start('Free'); r.step(0);
    expect([r.valve('FreeAfter'), r.running('Slow')]).toEqual([1, true]);
    r.stop('Slow');
    expect(r.running('Slow')).toBe(false);
    r.setValve('SlowDone', 0);
    r.start('Slow'); r.step(0.9); r.start('Slow'); r.step(0.9);
    expect(r.valve('SlowDone')).toBe(0);                        // restarted (ZANIM_RECALL_READING)
  });

  it('a UI command on a node sets its caption (a UIMnLOC id, a literal, a valve\'s number); one without calls the host', () => {
    const calls: string[] = [];
    const r = runner([prog('P', [
      { op: 'ui', command: cmd({ node: 'A', op: 1, loc: 34 }) },
      { op: 'ui', command: cmd({ node: 'B', op: 1, arg: 'SEAL 4' }) },
      { op: 'ui', command: cmd({ node: 'C', op: 2, arg: 'V' }) },
      { op: 'ui', command: cmd({ fn: 'SuspendMenuInput', arg: '0.5' }) },
      { op: 'sound', sound: '.DINK', flags: 128, newPlay: true, node: 0 },
    ])], host(calls));
    r.setValve('V', 7);
    r.start('P'); r.step(0);
    expect([r.node('A').caption, r.node('B').caption, r.node('C').caption]).toEqual([{ loc: 34 }, { text: 'SEAL 4' }, { text: '7' }]);
    expect(calls).toEqual(['SuspendMenuInput:0.5', 'sound:.DINK']);
  });

  it('a relative rotation slerps from the current orientation (the preview\'s spin, research 95 §3.8)', () => {
    const q: [number, number, number, number] = [0, -0.9999619, 0, 0.0087266];
    const r = runner([prog('Spin', [{ op: 'move', node: 'A', flags: 0x61, seconds: 3, rotation: { from: [0, 0, 0, 1], to: q, relative: true } }])]);
    r.start('Spin'); r.step(1.5);
    const half = slerp([0, 0, 0, 1], q, 0.5);
    expect(r.node('A').rotation.map((x) => +x.toFixed(5))).toEqual(half.map((x) => +x.toFixed(5)));
    r.step(1.5);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(r.node('A').rotation[3])));
    expect(angle * 180 / Math.PI).toBeCloseTo(178.97, 1);
  });
});
