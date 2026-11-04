import { describe, expect, it } from 'vitest';
import { BUTTONS, STICK_HALVES, parseScript } from '../eph/script';

/**
 * EPH-2's shared input script (docs/specs/2026-10-30-emulator-parity-harness-design.md, "How one input reaches both
 * clients"): `<t_ms> <input> <pressure>` lines, in the original's pad terms. A validation instrument (product track).
 */
describe('the EPH script parser', () => {
  it('reads the design note example, with comments and blank lines', () => {
    const text = [
      '# a full Triangle, then a light one',
      '0 triangle 1.0',
      '',
      '150 triangle 0   # released',
      '250 triangle 0.2',
      '400 triangle 0',
    ].join('\n');
    expect(parseScript(text)).toEqual([
      { t: 0, input: 'triangle', pressure: 1, line: 2 },
      { t: 150, input: 'triangle', pressure: 0, line: 4 },
      { t: 250, input: 'triangle', pressure: 0.2, line: 5 },
      { t: 400, input: 'triangle', pressure: 0, line: 6 },
    ]);
  });

  it('knows every pad button and every stick half', () => {
    expect([...BUTTONS]).toEqual(['cross', 'circle', 'square', 'triangle', 'l1', 'l2', 'r1', 'r2', 'l3', 'r3',
      'select', 'start', 'up', 'down', 'left', 'right']);
    expect([...STICK_HALVES]).toEqual(['lup', 'ldown', 'lleft', 'lright', 'rup', 'rdown', 'rleft', 'rright']);
    const text = [...BUTTONS, ...STICK_HALVES].map((n, i) => `${i * 10} ${n} 1`).join('\n');
    expect(parseScript(text).map((e) => e.input)).toEqual([...BUTTONS, ...STICK_HALVES]);
  });

  it('accepts CRLF line ends and an upper-case input name', () => {
    expect(parseScript('0 Triangle 1\r\n16 TRIANGLE 0\r\n')).toEqual([
      { t: 0, input: 'triangle', pressure: 1, line: 1 },
      { t: 16, input: 'triangle', pressure: 0, line: 2 },
    ]);
  });

  it('refuses an unknown input, with its line number', () => {
    expect(() => parseScript('0 cross 1\n10 dpad 1')).toThrow(/line 2: unknown input "dpad"/);
  });

  it('refuses a pressure outside 0..1 or not a number', () => {
    expect(() => parseScript('0 cross 1.5')).toThrow(/line 1: pressure "1.5" is not in 0..1/);
    expect(() => parseScript('0 cross -0.1')).toThrow(/line 1: pressure "-0.1" is not in 0..1/);
    expect(() => parseScript('0 cross half')).toThrow(/line 1: pressure "half" is not in 0..1/);
  });

  it('refuses a bad time and a time that goes back', () => {
    expect(() => parseScript('x cross 1')).toThrow(/line 1: time "x" is not a non-negative number of ms/);
    expect(() => parseScript('-5 cross 1')).toThrow(/line 1: time "-5"/);
    expect(() => parseScript('100 cross 1\n\n50 cross 0')).toThrow(/line 3: time 50 is before the previous event's 100/);
  });

  it('refuses a line without exactly three fields', () => {
    expect(() => parseScript('0 cross')).toThrow(/line 1: expected "<t_ms> <input> <pressure>"/);
    expect(() => parseScript('0 cross 1 extra')).toThrow(/line 1: expected/);
  });

  it('allows equal times (a chord) and keeps their order', () => {
    expect(parseScript('0 square 1\n0 cross 1').map((e) => e.input)).toEqual(['square', 'cross']);
  });
});
