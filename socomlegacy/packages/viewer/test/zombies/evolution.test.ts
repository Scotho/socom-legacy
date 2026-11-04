import { expect, it, vi } from 'vitest';
import { ZombiePursuit, zombieKind } from '../../src/zombies/evolution';
import type { NavStep } from '../../src/zombies/navigation';

const open: NavStep = (_from, x, z) => [x, 0, z];

it('introduces runners gradually and includes one brute every fifth round', () => {
  expect(Array.from({ length: 10 }, (_, i) => zombieKind(1, i))).toEqual(Array(10).fill('shambler'));
  expect(zombieKind(3, 2)).toBe('runner');
  expect(zombieKind(4, 4)).toBe('shambler');
  expect(zombieKind(5, 4)).toBe('armored');
  expect(Array.from({ length: 40 }, (_, i) => zombieKind(10, i)).filter((k) => k === 'brute')).toHaveLength(1);
});

it('investigates recent gunfire, remembers last sight and rejects blocked flanks', () => {
  const p = new ZombiePursuit();
  expect(p.goal([0, 0, 0], [200, 0, 0], false, { point: [100, 0, 10], age: 1 }, .1, 0, open)).toEqual([100, 0, 10]);
  expect(p.stats().mode).toBe('sound');
  expect(p.goal([0, 0, 0], [300, 0, 0], false, null, 1, 0, open)).toEqual([100, 0, 10]);
  expect(p.stats().mode).toBe('memory');
  expect(p.goal([0, 0, 0], [80, 0, 0], true, null, .1, 0, () => null)).toEqual([80, 0, 0]);
});

it('uses distinct reachable approach points and bounds collision-probe frequency', () => {
  const a = new ZombiePursuit(), b = new ZombiePursuit(), step = vi.fn(open);
  const first = a.goal([0, 0, 0], [80, 0, 0], true, null, .016, 0, step);
  const second = b.goal([0, 0, 0], [80, 0, 0], true, null, .016, 4, step);
  expect(first).not.toEqual(second);
  step.mockClear();
  for (let i = 0; i < 20; i++) a.goal([1, 0, 0], [80, 0, 0], true, null, .016, 0, step);
  expect(step).not.toHaveBeenCalled();
});
