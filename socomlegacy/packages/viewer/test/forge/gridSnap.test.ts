import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID_STEP, DEFAULT_TURN_STEP, GRID_STEP_LADDER, GRID_STEP_MAX, GRID_STEP_MIN, GRID_STEP_QUANTUM, onLadder, stepLabel, TURN_STEP_LADDER,
} from '../../src/forge/placement';
import { gridTiers, MAJOR_STEP, METRE_STEP } from '../../src/forge/mapGrid';

/**
 * The grid snap and the drawn grid (a browser adaptation, FG.R2): the step's ladder down to the disc's 1/16-unit
 * position step, a typed step held to that quantum, and the grid's tiers -- the step's lines, then the metric lines
 * (1 m, 10 m) only where they lie on the step's grid.
 */
describe('the grid step', () => {
  it('reaches down to the disc position step, 1/16 of a unit', () => {
    expect(GRID_STEP_QUANTUM).toBe(1 / 16);
    expect(GRID_STEP_MIN).toBe(GRID_STEP_QUANTUM);
    expect(GRID_STEP_LADDER[0]).toBe(GRID_STEP_MIN);
    expect(GRID_STEP_LADDER[GRID_STEP_LADDER.length - 1]).toBe(GRID_STEP_MAX);
    expect([...GRID_STEP_LADDER]).toEqual([...GRID_STEP_LADDER].sort((a, b) => a - b));
  });

  it('holds any step to its ladder (no step of 7)', () => {
    expect(onLadder(7, GRID_STEP_LADDER, DEFAULT_GRID_STEP)).toBe(5);
    expect(onLadder(0.3, GRID_STEP_LADDER, DEFAULT_GRID_STEP)).toBe(0.25);
    expect(onLadder(0, GRID_STEP_LADDER, DEFAULT_GRID_STEP)).toBe(GRID_STEP_MIN);
    expect(onLadder(900, GRID_STEP_LADDER, DEFAULT_GRID_STEP)).toBe(GRID_STEP_MAX);
    expect(onLadder(Number.NaN, GRID_STEP_LADDER, DEFAULT_GRID_STEP)).toBe(DEFAULT_GRID_STEP);
    expect(onLadder(20, TURN_STEP_LADDER, DEFAULT_TURN_STEP)).toBe(15);
    expect(GRID_STEP_LADDER).toContain(DEFAULT_GRID_STEP);
    expect(TURN_STEP_LADDER).toContain(DEFAULT_TURN_STEP);
  });

  it('labels a step under a unit as a fraction', () => {
    expect(stepLabel(1 / 16)).toBe('1/16');
    expect(stepLabel(0.5)).toBe('1/2');
    expect(stepLabel(25)).toBe('25');
    expect(stepLabel(0.3125)).toBe('0.3125');
  });
});

describe('the drawn grid', () => {
  it('draws the step, then each metric line that lies on it', () => {
    expect(gridTiers(1 / 16)).toEqual([1 / 16, METRE_STEP, MAJOR_STEP]);
    expect(gridTiers(5)).toEqual([5, METRE_STEP, MAJOR_STEP]);
    expect(gridTiers(10)).toEqual([10, null, MAJOR_STEP]);
    expect(gridTiers(25)).toEqual([25, null, MAJOR_STEP]);
    expect(gridTiers(100)).toEqual([100, null, null]);
    expect(gridTiers(250)).toEqual([250, null, null]);
  });
});
