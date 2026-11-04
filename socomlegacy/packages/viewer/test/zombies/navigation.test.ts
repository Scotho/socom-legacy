import { expect, it } from 'vitest';
import { EnemyNavigator, RouteSearch, type NavStep } from '../../src/zombies/navigation';

const around: NavStep = (from, x, z) => {
  for (let i = 1; i <= 20; i++) {
    const px = from[0] + (x - from[0]) * i / 20, pz = from[2] + (z - from[2]) * i / 20;
    if (px > 20 && px < 60 && Math.abs(pz) < 35) return null;
  }
  return [x, 0, z];
};

it('routes around a building instead of cutting through it', () => {
  const s = new RouteSearch([0, 0, 0], [80, 0, 0], around);
  while (!s.done) s.advance(20);
  expect(s.path).not.toBeNull();
  expect(s.path!.some((p) => Math.abs(p[2]) >= 35)).toBe(true);
  let prev: [number, number, number] = [0, 0, 0];
  for (const p of s.path!) { expect(around(prev, p[0], p[2])).not.toBeNull(); prev = p; }
});

it('finishes safely when no exit is traversable', () => {
  const s = new RouteSearch([0, 0, 0], [80, 0, 0], () => null);
  s.advance();
  expect(s.done).toBe(true);
  expect(s.path).toBeNull();
});

it('does not join a destination on a different floor', () => {
  const s = new RouteSearch([0, 0, 0], [0, 30, 0], () => null);
  s.advance();
  expect(s.path).toBeNull();
});

it('follows seeded waypoints without expensive planning work and resumes planning when budget returns', () => {
  let calls = 0;
  const nav = new EnemyNavigator({} as never, (_from, x, z) => { calls++; return [x, 0, z]; });
  nav.seed([[8, 0, 0], [16, 0, 0]], [16, 0, 0]);
  expect(nav.steer([0, 0, 0], [16, 0, 0], .016, false, 0)).toEqual([8, 0, 0]);
  expect(nav.steer([8, 0, 0], [16, 0, 0], .016, false, 0)).toEqual([16, 0, 0]);
  expect(calls).toBe(0);
  nav.steer([8, 0, 0], [80, 0, 0], .016, false, .25);
  expect(calls).toBeGreaterThan(0);
});

it('does not request obstacle trials just because a valid route goes around a building', () => {
  const nav = new EnemyNavigator({} as never, around);
  nav.seed([[0, 0, 40], [80, 0, 40], [80, 0, 0]], [80, 0, 0]);
  expect(nav.obstacleNeeded()).toBe(false);
  for (let i = 0; i < 8; i++) nav.steer([0, 0, 0], [80, 0, 0], .1, false, 0);
  expect(nav.obstacleNeeded()).toBe(true);
  nav.wait([0, 0, 0]);
  expect(nav.obstacleNeeded()).toBe(false);
});
