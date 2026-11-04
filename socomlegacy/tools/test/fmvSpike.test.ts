import { describe, expect, it } from 'vitest';
import { orderProblems } from '../fmv-spike';
import type { PictureHeader } from '../fmvStream';

/**
 * `fmv-spike.ts decode --check`'s verdict (research 98 §7.8, research 120 §8): every coded frame displayed once, in the
 * standard's order, by the decoder's tags. A stream coded as field pictures has two picture headers per frame; the
 * check counts frames (PLAT-18's last review: it reported FAIL on such a stream).
 */

const h = (type: 'I' | 'P' | 'B', temporalReference: number, structure?: 'top' | 'bottom' | 'frame'): PictureHeader =>
  ({ offset: 0, type, temporalReference, ...(structure ? { structure } : {}) });

describe('orderProblems', () => {
  it('frame pictures in the standard\'s order: none', () => {
    const headers = [h('I', 0), h('P', 3), h('B', 1), h('B', 2)];
    const shown = [0, 2, 3, 1].map((k) => ({ codingIndex: k, type: headers[k]!.type, temporalReference: headers[k]!.temporalReference }));
    expect(orderProblems(headers, shown)).toEqual([]);
  });

  it('field pairs count as one frame each, shown under the first field\'s tag: none', () => {
    const headers = [h('I', 0, 'top'), h('P', 0, 'bottom'), h('P', 2, 'top'), h('P', 2, 'bottom'), h('B', 1, 'top'), h('B', 1, 'bottom')];
    const shown = [0, 4, 2].map((k) => ({ codingIndex: k, type: headers[k]!.type, temporalReference: headers[k]!.temporalReference }));
    expect(orderProblems(headers, shown)).toEqual([]);
  });

  it('a dropped frame of a field-coded stream is named in frames, and says how many start codes were second fields', () => {
    const headers = [h('I', 0, 'top'), h('I', 0, 'bottom'), h('I', 1, 'top'), h('I', 1, 'bottom')];
    const problems = orderProblems(headers, [{ codingIndex: 0, type: 'I', temporalReference: 0 }]);
    expect(problems[0]).toBe('1 pictures displayed, 2 coded frames in the stream (4 picture start codes, 2 of them second fields of a field pair)');
  });

  it('a repeat, a swap or a wrong header is reported', () => {
    const headers = [h('I', 0), h('I', 1), h('I', 2)];
    expect(orderProblems(headers, [0, 2, 1].map((k) => ({ codingIndex: k, type: 'I', temporalReference: k })))[0]).toMatch(/position 1/);
    expect(orderProblems(headers, [0, 1, 2].map((k) => ({ codingIndex: k, type: 'I', temporalReference: 0 })))).toEqual([
      "2 displayed pictures whose type or temporal reference is not their tag's header's",
    ]);
  });
});
