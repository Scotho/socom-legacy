// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { Scene } from 'three';
import { ZombieCombatFeedback, damageBearing, zombieShotHit } from '../../src/zombies/combat';

beforeEach(() => { document.body.innerHTML = ''; });

it('distinguishes head and body and rejects shots clipped by cover', () => {
  expect(zombieShotHit([0, 18, 0], [0, 18, -30], [0, 0, -20], [0, 18, -20])?.headshot).toBe(true);
  expect(zombieShotHit([0, 10, 0], [0, 10, -30], [0, 0, -20], [0, 18, -20])?.headshot).toBe(false);
  expect(zombieShotHit([0, 18, 0], [0, 18, -10], [0, 0, -20], [0, 18, -20])).toBeNull();
  expect(zombieShotHit([0, 25, 0], [0, 25, -30], [0, 0, -20], [0, 18, -20])).toBeNull();
});

it('places damage correctly in front, right, behind and left and follows camera yaw', () => {
  expect(damageBearing([0, 0, 0], [0, 0, -10], 0)).toBe(0);
  expect(damageBearing([0, 0, 0], [10, 0, 0], 0)).toBe(90);
  expect(Math.abs(damageBearing([0, 0, 0], [0, 0, 10], 0))).toBe(180);
  expect(damageBearing([0, 0, 0], [-10, 0, 0], 0)).toBe(-90);
  expect(damageBearing([0, 0, 0], [-10, 0, 0], 90)).toBe(0);
});

it('bounds blood and simultaneous damage markers, fades them and clears on restart', () => {
  const scene = new Scene(), f = new ZombieCombatFeedback(scene);
  for (let i = 0; i < 100; i++) { f.impact([0, 18, 0], [0, 0, -1], true, false); f.hurt([10, 0, 0]); }
  expect(f.stats()).toMatchObject({ hits: 100, headshots: 100, hitKind: 'HEADSHOT', blood: 192 });
  expect(f.stats().damage).toHaveLength(4);
  expect(scene.children).toHaveLength(1);
  f.frame(.1, [0, 0, 0], 0);
  expect(document.querySelector<HTMLElement>('.z-damage')!.style.transform).toBe('rotate(90deg)');
  f.frame(2, [0, 0, 0], 0);
  expect(f.stats()).toMatchObject({ hitVisible: false, blood: 0, damage: [] });
  f.impact([0, 10, 0], [1, 0, 0], false, true);
  f.reset();
  expect(f.stats()).toMatchObject({ hits: 0, headshots: 0, hitVisible: false, blood: 0, damage: [] });
});
