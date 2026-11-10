import { describe, expect, it } from 'vitest';
import { customMapDetail, readinessCaption, readinessSentence, readinessWords } from '../../src/packs/readiness';

/**
 * FP-6 item 2 (FP.R4; product track, a browser adaptation with no original): the one readiness sentence -- "Ready", or
 * "Needs <n> pack(s) not here: <id> <version>, ..." -- that MODS' row, the Forge's base-list caption (its short form)
 * and its switch toast all say (fp-6-notes 7: one fact, one form).
 */
const A = { id: 'example.sample-yard', version: '0.1.1' }, B = { id: 'example.other', version: '2.0.0' };

describe('FP-6 2: the readiness sentence', () => {
  it('Ready, or Needs n packs not here with each by id and version', () => {
    expect(readinessSentence([])).toBe('Ready');
    expect(readinessSentence([A])).toBe('Needs 1 pack not here: example.sample-yard 0.1.1');
    expect(readinessSentence([A, B])).toBe('Needs 2 packs not here: example.sample-yard 0.1.1, example.other 2.0.0');
  });
  it('the short caption for a select row: Ready, or needs n pack(s)', () => {
    expect(readinessCaption([])).toBe('Ready');
    expect(readinessCaption([A])).toBe('needs 1 pack');
    expect(readinessCaption([A, B])).toBe('needs 2 packs');
  });
  it('MODS\' detail ends in the sentence', () => {
    expect(customMapDetail('Sample Yard', 1, [])).toBe('Sample Yard · 1 pack · Ready');
    expect(customMapDetail('Sample Yard', 1, [A])).toBe('Sample Yard · 1 pack · Needs 1 pack not here: example.sample-yard 0.1.1');
    expect(readinessWords([A])).toEqual(['example.sample-yard 0.1.1']);
  });
});
