// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { ZombieDeath } from '../../src/zombies/death';

beforeEach(() => { document.body.innerHTML = ''; });

it('leaves the body-following camera alone when the walk camera stays in charge', () => {
  const c = new PerspectiveCamera(60, 1, 4, 1000);
  c.position.set(10, 20, 30);
  c.rotation.set(.1, .2, .3);
  const q = c.quaternion.clone();
  const d = new ZombieDeath(c);
  d.start([0, 0, 0], { wave: 1, kills: 0, survived: 0, seconds: 0 }, true);
  for (let i = 0; i < 120; i++) d.frame(1 / 60);
  expect(c.position.toArray()).toEqual([10, 20, 30]);
  expect(c.quaternion.equals(q)).toBe(true);
  expect(c.near).toBe(4);
  d.reset();
  expect(d.active).toBe(false);
});

it('collapses to the floor, holds the final view and restores clipping on reset', () => {
  const c = new PerspectiveCamera(60, 1, 4, 1000);
  const d = new ZombieDeath(c);
  d.start([12, 50, 20], { wave: 3, kills: 12, survived: 2, seconds: 0 });
  expect(c.position.y).toBe(67);
  for (let i = 0; i < 120; i++) d.frame(1 / 60);
  expect(c.position.y).toBeCloseTo(52.8);
  expect(d.stats().settled).toBe(true);
  const q = c.quaternion.clone();
  d.frame(.1);
  expect(c.quaternion.equals(q)).toBe(true);
  expect(c.near).toBe(.45);
  expect(document.querySelector('#zombies-death')?.textContent).toContain('round 3');
  d.reset();
  expect(c.near).toBe(4);
  expect(d.active).toBe(false);
  d.start([0, 0, 0], { wave: 1, kills: 0, survived: 0, seconds: 0 });
  expect(d.stats().elapsed).toBe(0);
});

it('shows the round, the kills and the time, and enables restart after the collapse', () => {
  const d = new ZombieDeath(new PerspectiveCamera());
  let restarts = 0;
  d.onRestart = () => { restarts++; };
  d.start([0, 0, 0], { wave: 4, kills: 12, survived: 3, seconds: 125 }, true);
  const button = document.querySelector('button')!;
  button.click();
  expect(restarts).toBe(0);
  for (let i = 0; i < 220; i++) d.frame(1 / 60);
  const text = document.querySelector('#zombies-death')!.textContent!;
  expect(text).toContain('2:05');
  expect(text).toContain('12');
  expect(text).toContain('F6 to restart');
  button.click();
  expect(restarts).toBe(1);
});
