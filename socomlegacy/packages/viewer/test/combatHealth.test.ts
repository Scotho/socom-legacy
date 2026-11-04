import { describe, expect, it } from 'vitest';
import { combatHealthSummary, HIT_LOCATION_NAMES } from '../src/net/combatHealth';
import { PART, PARTS } from '../src/net/damage';

/**
 * The combat report's summary arithmetic (INT.R5, research 127 §3; ported from Chris's browser-beta-v5,
 * chris/browser-beta-integration d578f347: his `combatHealth.test.ts`, adapted): a report's numbers, never the game's
 * damage. Null is "not known", never zero.
 */
describe('combatHealthSummary (the combat report, a playtest instrument with no original)', () => {
  it('names the six parts in the damage model\'s order (PART, FUN_005a4840\'s death lists)', () => {
    expect(HIT_LOCATION_NAMES).toHaveLength(PARTS);
    expect(HIT_LOCATION_NAMES[PART.HEAD]).toBe('head');
    expect(HIT_LOCATION_NAMES[PART.RARM]).toBe('right arm');
    expect(HIT_LOCATION_NAMES[PART.LARM]).toBe('left arm');
    expect(HIT_LOCATION_NAMES[PART.BODY]).toBe('body');
    expect(HIT_LOCATION_NAMES[PART.RLEG]).toBe('right leg');
    expect(HIT_LOCATION_NAMES[PART.LLEG]).toBe('left leg');
  });

  it('separates the struck part\'s loss from the summed reduction over the six parts (a body hit caps the limbs)', () => {
    const x = combatHealthSummary({
      part: 3, healthBefore: [8, 30, 30, 50, 30, 30], healthAfter: [8, 20, 20, 20, 20, 20], hitLocations: [{ part: 3, rawDamage: 30 }],
    });
    expect(x.hitLocation).toBe('body');
    expect(x.struckPartHealthChange).toBe(30);
    expect(x.totalBodyPartHealthChange).toBe(70);
    expect(x.hitLocationNames).toEqual(['body']);
  });

  it('null for what is not known, never zero: no part, no health', () => {
    const none = combatHealthSummary({ part: null, healthBefore: null, healthAfter: null });
    expect(none.hitLocation).toBeNull();
    expect(none.struckPartHealthChange).toBeNull();
    expect(none.totalBodyPartHealthChange).toBeNull();
    expect(none.hitLocationNames).toEqual([]);
  });

  it('a blast of many parts names each once and has no struck part (null by design)', () => {
    const x = combatHealthSummary({
      part: null, healthBefore: [8, 30, 30, 50, 30, 30], healthAfter: [0, 20, 30, 20, 30, 30],
      hitLocations: [{ part: 0, rawDamage: 9 }, { part: 1, rawDamage: 10 }, { part: 0, rawDamage: 9 }],
    });
    expect(x.hitLocationNames).toEqual(['head', 'right arm']);
    expect(x.struckPartHealthChange).toBeNull();
    expect(x.totalBodyPartHealthChange).toBe(48);
  });

  it('ignores a part out of range and health arrays of the wrong length', () => {
    const x = combatHealthSummary({ part: 9, healthBefore: [1, 2, 3], healthAfter: [1, 2, 3] });
    expect(x.hitLocation).toBeNull();
    expect(x.hitLocationNames).toEqual([]);
    expect(x.struckPartHealthChange).toBeNull();
    expect(x.totalBodyPartHealthChange).toBeNull();
  });
});
