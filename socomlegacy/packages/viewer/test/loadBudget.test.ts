import { describe, expect, it } from 'vitest';
import { firstByteOf, pageMarks } from '../src/loadBudget';

// PLAT-29a (research 100): the viewer's half of the phase marks -- the page's clock and the first byte read off the
// navigation entry. The marks themselves are `@s2u/ui`'s `PhaseMarks`, tested there.
describe('the viewer\'s load marks', () => {
  it('reads the first byte off the navigation entry\'s responseStart', () => {
    expect(firstByteOf([{ responseStart: 37.25 }])).toBe(37.25);
  });

  it('has no first byte without a navigation entry, or with a zero responseStart (no response timing)', () => {
    expect(firstByteOf([])).toBeUndefined();
    expect(firstByteOf([{ responseStart: 0 }])).toBeUndefined();
  });

  it('marks the first byte and the page start on the clock it is given', () => {
    const marks = pageMarks(() => 123, [{ responseStart: 9 }]);
    expect(marks.marks()).toEqual({ firstByte: 9, pageStart: 123 });
  });

  it('marks the page start alone where no navigation timing is offered', () => {
    expect(pageMarks(() => 5, []).marks()).toEqual({ pageStart: 5 });
  });
});
