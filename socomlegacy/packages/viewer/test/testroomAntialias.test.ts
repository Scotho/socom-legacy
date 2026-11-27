import { describe, expect, it } from 'vitest';
import { TESTROOM_ANTIALIAS_PARAM, testroomAntialias } from '../src/testroomAntialias';

/**
 * MAC-FLOOR (INTAKE I-3; B-64; a test-room instrument, a browser adaptation): the test room's renderer takes its antialias
 * from the address, `?antialias=off` or `?antialias=on`, so a tester can run WebGPU with no multisampling in the normal
 * picture (the check RESULTS.md could not run: the room made its renderer with antialiasing on and had no switch). Absent
 * or anything else: undefined, the renderer's own default (on, but the Xbox pick's off). Unit test.
 */
describe('MAC-FLOOR: the test room\'s antialias switch on the address', () => {
  it('is the `antialias` parameter', () => { expect(TESTROOM_ANTIALIAS_PARAM).toBe('antialias'); });
  it.each([
    ['?antialias=off', false], ['?antialias=0', false], ['?antialias=on', true], ['?antialias=1', true],
    ['?devmode&fly&map=mp11&renderer=webgpu&antialias=off', false],
    ['', undefined], ['?antialias', undefined], ['?antialias=maybe', undefined], ['?map=mp11', undefined],
  ] as const)('%s -> %s', (search, want) => {
    expect(testroomAntialias(search)).toBe(want);
  });
});
