import { expect, it } from 'vitest';
import { throwLaunchAllowed } from '../src/room';
import { chooseTacticalThrow, solveBotThrow } from '../src/bots/throwPolicy';

it('solves the native throw curve for a distant target instead of scaling power linearly', () => {
  const shot = solveBotThrow(220);
  expect(shot).not.toBeNull();
  expect(shot!.power).toBeGreaterThan(0.6);
  expect(Math.abs(shot!.distance - 220)).toBeLessThan(12);
  expect(throwLaunchAllowed([0, 0, 0], 0, 'stand', shot!.from, shot!.velocity)).toBe(true);
  expect(solveBotThrow(120)).toBeNull();
  expect(solveBotThrow(450)).toBeNull();
});

const situation = { distance: 230, visibleTicks: 90, enemiesAtLanding: 1, underFire: false,
  gunBlocked: false, pursuing: true, allyNearLanding: false, allyInFlight: false,
  frag: true, smoke: true, flash: true, role: 'rusher' as const };

it('keeps the gun out for a single clear target or a close contact', () => {
  expect(chooseTacticalThrow(situation)).toBeNull();
  expect(chooseTacticalThrow({ ...situation, distance: 130, enemiesAtLanding: 3 })).toBeNull();
});

it('uses one carried type only for a specific advantage and protects teammates', () => {
  expect(chooseTacticalThrow({ ...situation, enemiesAtLanding: 2 })).toBe('frag');
  expect(chooseTacticalThrow({ ...situation, underFire: true })).toBe('smoke');
  expect(chooseTacticalThrow({ ...situation, gunBlocked: true })).toBe('flash');
  expect(chooseTacticalThrow({ ...situation, enemiesAtLanding: 2, allyNearLanding: true })).toBeNull();
  expect(chooseTacticalThrow({ ...situation, enemiesAtLanding: 2, allyInFlight: true })).toBeNull();
});
