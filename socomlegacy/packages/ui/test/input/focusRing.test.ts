import { describe, expect, it } from 'vitest';
import { FocusRing, SINGLE_CONTROL_FOCUS_READING, type RingControl } from '../../src/input/index';

// Web research 116 §4: the ring of `FUN_003670d0` (D:L263102-263176, next) and `FUN_00366d70` (D:L263021-263097,
// previous), the build's focus (D:L263735-263745) and `ActivateButton`'s `FUN_00366b60` (D:L262962-263016).

function ring(spec: string) {
  // One letter a control; lower case is disabled.
  const log: string[] = [];
  const controls: RingControl[] = [...spec].map((ch) => {
    const name = ch.toUpperCase(), on = ch === name;
    return { name, enabled: () => on, activate: () => { log.push(`+${name}`); }, deactivate: () => { log.push(`-${name}`); } };
  });
  const r = new FocusRing(controls, () => { log.push('SELECTION'); });
  return { r, take: () => log.splice(0) };
}

describe('the focus ring (R116.5)', () => {
  it('at load: index 0, the first control activated; a disabled first steps forward without the sound', () => {
    const a = ring('ABC');
    a.r.start();
    expect([a.r.index, a.take()]).toEqual([0, ['+A']]);
    const b = ring('aBC');
    b.r.start();
    expect([b.r.index, b.take()]).toEqual([1, ['-A', '+B']]);
  });

  it('DOWN: the next in file order with the sound, wrapping; UP: the previous, wrapping', () => {
    const { r, take } = ring('ABC');
    r.start(); take();
    r.next(true);
    expect(take()).toEqual(['-A', '+B', 'SELECTION']);
    r.next(true); r.next(true);
    expect(r.index).toBe(0);
    take();
    r.previous(true);
    expect([r.index, take()]).toEqual([2, ['-A', '+C', 'SELECTION']]);
  });

  it('a disabled control is skipped; the sound plays once, for the whole step', () => {
    const { r, take } = ring('AbC');
    r.start(); take();
    r.next(true);
    // -A; index 1 is disabled: the step again from it without the sound -- its deactivate (a disabled control's to
    // ignore), index 2 enabled and changed: +C; back in the first step the index moved: SELECTION.
    expect([r.index, take()]).toEqual([2, ['-A', '-B', '+C', 'SELECTION']]);
  });

  it('walking back to where it began: the control re-activated, no sound', () => {
    const { r, take } = ring('Ab');
    r.start(); take();
    r.next(true);
    expect([r.index, take()]).toEqual([0, ['-A', '-B', '+A']]);
  });

  it('all disabled: the index rests on a disabled control and nothing is active', () => {
    const { r, take } = ring('ab');
    r.start();
    expect([r.index, take()]).toEqual([1, ['-A']]);
    r.next(true);
    expect([r.index, take()]).toEqual([0, ['-B']]);
  });

  it('SINGLE_CONTROL_FOCUS_READING: a ring of one is deactivated by a step and not activated again', () => {
    expect(SINGLE_CONTROL_FOCUS_READING).toBe('deactivated, not re-activated');
    const { r, take } = ring('A');
    r.start(); take();
    r.next(true);
    expect([r.index, take()]).toEqual([0, ['-A']]);
  });

  it('an empty ring does nothing', () => {
    const { r, take } = ring('');
    r.start(); r.next(true); r.previous(true);
    expect([r.index, take()]).toEqual([0, []]);
  });

  it('ActivateButton: the focused deactivated, the named activated with SELECTION, the index moved to it', () => {
    const { r, take } = ring('ABC');
    r.start(); take();
    r.activateNamed('C', r.controls[2]!);
    expect([r.index, take()]).toEqual([2, ['-A', '+C', 'SELECTION']]);
    // Found in the dialog but not on the ring: activated with the sound, the index left where it was.
    const other: RingControl = { name: 'X', enabled: () => true, activate: () => {}, deactivate: () => {} };
    r.activateNamed('X', other);
    expect([r.index, take()]).toEqual([2, ['-C', 'SELECTION']]);
    // Not found: the focused deactivated, nothing else.
    r.activateNamed('nowhere', null);
    expect(take()).toEqual(['-C']);
  });
});
