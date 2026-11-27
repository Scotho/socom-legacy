import { afterEach, describe, expect, it } from 'vitest';
import { ownNameDrawn, setOwnNameDisplay } from '../../src/text/ownNameDisplay';
import * as ui from '../../src/index';

/**
 * IQ-183 (STREAMER-P1's own name; product track, a browser adaptation): the page's rule for how this player's own account
 * name is drawn on the front end's own screens. Unset, the name as the original draws it.
 */
describe('IQ-183: ownNameDisplay, the page\'s own-name rule', () => {
  afterEach(() => { setOwnNameDisplay(null); });
  it('unset: the name unchanged', () => {
    expect(ownNameDrawn('socomc')).toBe('socomc');
  });
  it('set: the rule\'s text; null clears it; a rule that throws draws the name', () => {
    setOwnNameDisplay(() => 'YOU');
    expect(ownNameDrawn('socomc')).toBe('YOU');
    setOwnNameDisplay(null);
    expect(ownNameDrawn('socomc')).toBe('socomc');
    setOwnNameDisplay(() => { throw new Error('x'); });
    expect(ownNameDrawn('socomc')).toBe('socomc');
  });
  it('exported from the package', () => {
    expect([typeof ui.setOwnNameDisplay, typeof ui.ownNameDrawn]).toEqual(['function', 'function']);
  });
});
