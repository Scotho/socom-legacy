import { describe, expect, it } from 'vitest';
import { countCandidates, kitWordColumns, parseKitWords, parseLegs, stackTopAddress } from '../eph/gr1';

/**
 * GR-1's capture tool (research 326 s7 "GR-1", s7.1 the kit's path; product track, an instrument): the legs file (timed
 * pad events per leg), the kit-block diff that finds the throwable's count (a word that falls by exactly 1 across one
 * throw, the live check of the inferred field), and the play stack's top (`FUN_00555170(actor+0x1c0)`, D:L419945-419956:
 * `*(*(s) + *(s+8) * 4)`, none when `*(s+8)` < 0).
 */
describe('GR-1: the legs file', () => {
  it('reads legs of timed events and refuses an unknown key or action', () => {
    const legs = parseLegs(JSON.stringify({ legs: [{ name: 'base', seconds: 8, events: [[0.5, 'down', 'r1'], [1.0, 'up', 'r1'], [2.0, 'tap', 'l1', 120]] }] }));
    expect(legs[0]!.events).toEqual([{ t: 0.5, action: 'down', key: 'r1', ms: 0 }, { t: 1.0, action: 'up', key: 'r1', ms: 0 }, { t: 2.0, action: 'tap', key: 'l1', ms: 120 }]);
    expect(() => parseLegs(JSON.stringify({ legs: [{ name: 'x', seconds: 5, events: [[0, 'down', 'nokey']] }] }))).toThrow(/key/);
    expect(() => parseLegs(JSON.stringify({ legs: [{ name: 'x', seconds: 5, events: [[0, 'hold', 'r1']] }] }))).toThrow(/action/);
  });

  it('refuses a leg over 95 s (a trial stays under ~100 s of guest clock) or events out of order', () => {
    expect(() => parseLegs(JSON.stringify({ legs: [{ name: 'x', seconds: 120, events: [] }] }))).toThrow(/95/);
    expect(() => parseLegs(JSON.stringify({ legs: [{ name: 'x', seconds: 10, events: [[2, 'down', 'r1'], [1, 'up', 'r1']] }] }))).toThrow(/order/);
  });
});

describe('GR-1: the throwable count candidates', () => {
  it('lists the word offsets that fell by exactly 1 between the two snapshots', () => {
    expect(countCandidates([5, 2, 9, 0, 3], [5, 1, 9, 0, 2], 0x800)).toEqual([0x804, 0x810]);
    expect(countCandidates([1, 1], [1, 1], 0)).toEqual([]);
    expect(() => countCandidates([1], [1, 2], 0)).toThrow(/length/);
  });
});

describe('GR-1: the play stack top', () => {
  it('is *(base + idx*4), none for a negative index', () => {
    expect(stackTopAddress(0x1000, 2, (a) => (a === 0x1008 ? 0xabc0 : 0))).toBe(0xabc0);
    expect(stackTopAddress(0x1000, -1, () => 0xdead)).toBeNull();
  });
});

describe('GR-1: extra kit words as columns (LAST-GRENADE: the selected slot kit+0x824, the remembered slot +0x828)', () => {
  it('reads a comma list of word-aligned offsets inside the kit block, in order, and names their columns', () => {
    expect(parseKitWords('0x824,0x828')).toEqual([0x824, 0x828]);
    expect(parseKitWords(' 0x274 ')).toEqual([0x274]);
    expect(parseKitWords(undefined)).toEqual([]);
    expect(kitWordColumns([0x824, 0x828])).toEqual(['kit824', 'kit828']);
  });
  it('refuses an offset that is not a word, lies outside the 0x380-word block, repeats, or is not a number', () => {
    expect(() => parseKitWords('0x825')).toThrow(/word-aligned/);
    expect(() => parseKitWords('0xe00')).toThrow(/inside the kit block/);
    expect(() => parseKitWords('0x824,0x824')).toThrow(/twice/);
    expect(() => parseKitWords('slot')).toThrow(/not a number/);
    expect(() => parseKitWords('0x818')).toThrow(/already a column/);
  });
  it('refuses an empty part (Number of "" is 0) and a word already read as --count-offset (the re-read: two gaps)', () => {
    expect(() => parseKitWords('0x824,')).toThrow(/empty/);
    expect(() => parseKitWords('0x824,,0x828')).toThrow(/empty/);
    expect(() => parseKitWords('0x274,0x824', 0x274)).toThrow(/already a column/);
    expect(parseKitWords('0x824,0x828', 0x274)).toEqual([0x824, 0x828]);
  });
});
