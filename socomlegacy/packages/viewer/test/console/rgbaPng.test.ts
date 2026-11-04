import { describe, expect, it } from 'vitest';
import { rgbaPngUrl } from '../../src/console/rgbaPng';

/**
 * CX-PERSONA's review F1: the medal picture's PNG (`../../src/console/rgbaPng`) refuses a size it cannot write -- a
 * non-integer, zero or negative width or height -- with null (the Service record then draws no picture), never a
 * RangeError while drawing and never a PNG whose header says width 0.
 */
describe('rgbaPngUrl: only a picture it can write (CX-PERSONA review F1)', () => {
  const pic = (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(Math.max(0, Math.floor(width * height * 4))) });
  it('a 2x2 picture becomes a PNG data URL', () => {
    expect(rgbaPngUrl(pic(2, 2))).toMatch(/^data:image\/png;base64,/);
  });
  it.each([[2.5, 2], [2, 2.5], [0, 2], [2, 0], [-1, 2], [2, -1], [Number.NaN, 2]])('a %s x %s size gives null', (w, h) => {
    expect(rgbaPngUrl(pic(w, h))).toBeNull();
  });
});
