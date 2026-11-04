import { describe, expect, it } from 'vitest';
import { victoryEligibility, VictoryActionInput } from '../src/victory';
import { chooseVictory } from '../src/victoryData';

describe('victory dances, ISO reading and explicit unsupported cases', () => {
  const actor = { alive: true, team: 'seal' as const, position: [0, 0, 0] as const, ready: true };
  const dead = { alive: false, team: 'terrorist' as const, position: [0, 0, 30] as const, present: true };
  it('uses full XYZ distance <=30 and opposing dead bodies, with no invented facing test', () => {
    expect(victoryEligibility(actor, [dead])).toBe('available');
    expect(victoryEligibility(actor, [{ ...dead, position: [0, 1, 30] }])).toBe('unavailable');
    expect(victoryEligibility(actor, [{ ...dead, alive: true }])).toBe('unavailable');
    expect(victoryEligibility(actor, [{ ...dead, team: 'seal' }])).toBe('unavailable');
    expect(victoryEligibility({ ...actor, team: 'terrorist' }, [{ ...dead, team: 'seal' }])).toBe('available');
    expect(victoryEligibility({ ...actor, alive: false }, [dead])).toBe('unavailable');
    expect(victoryEligibility({ ...actor, ready: false }, [dead])).toBe('unsupported-state');
    expect(victoryEligibility(actor, [{ ...dead, present: false }])).toBe('unavailable');
  });
  it('does not guess which corpse the original temporally sorted list picks in a mixed-team group', () => {
    expect(victoryEligibility(actor, [dead, { ...dead, team: 'seal' }])).toBe('unsupported-order');
    expect(victoryEligibility(actor, [dead, { ...dead, position: [1, 0, 0] }])).toBe('available');
  });
  it('picks by the original cumulative float weights, including boundary and final fallback', () => {
    const variants = [{ weight: .142 }, ...Array.from({ length: 6 }, () => ({ weight: .143 }))];
    expect(chooseVictory(variants, 0)).toBe(0);
    expect(chooseVictory(variants, Math.fround(.142))).toBe(0);
    expect(chooseVictory(variants, .143)).toBe(1);
    expect(chooseVictory(variants, 1)).toBe(6);
    expect(chooseVictory(variants, NaN)).toBe(-1);
  });
});

it('consumes Action pressed during playback through its release, then accepts a fresh press', () => {
  const input = new VictoryActionInput();
  expect(input.frame(true, true)).toBe(false);
  expect(input.frame(true, false)).toBe(false);
  expect(input.frame(false, false)).toBe(false);
  expect(input.frame(true, false)).toBe(true);
  expect(input.frame(false, false)).toBe(false);
});
