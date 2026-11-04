import { expect, it } from 'vitest';
import { HELD_RIFLE } from '@s2u/scene';
import { BotFirePolicy, chooseRole, ROLE_ADAPTATION, chooseBotStance, chooseBotWeapon } from '../src/bots/roles';

it('uses the native stand, crouch and prone codes only while stationary, with role variation', () => {
  expect(chooseBotStance('marksman', 'fire', 0, 300, 0, 1, false)).toBe(2);
  expect(chooseBotStance('marksman', 'fire', 1, 300, 0, 1, false)).toBe(0);
  expect(chooseBotStance('support', 'hold-cover', 0, 120, 0, 1, true)).toBe(1);
  expect(chooseBotStance('rusher', 'fire', 0, 80, 0, 1, false)).toBe(1);
});

it('switches to a loaded sidearm when a sniper is rushed, with range hysteresis and finite ammo', () => {
  expect(chooseBotWeapon('sniper', 0, 50, 20, 6)).toBe(1);
  expect(chooseBotWeapon('sniper', 1, 80, 20, 6)).toBe(1);
  expect(chooseBotWeapon('sniper', 1, 130, 20, 6)).toBe(0);
  expect(chooseBotWeapon('sniper', 0, 50, 20, 0)).toBe(0);
  expect(chooseBotWeapon('rifle', 0, 50, 0, 6)).toBe(1);
  expect(chooseBotWeapon('rifle', 0, 50, 0, 0)).toBe(1);
});

it('balances persistent roles and distinguishes their engagement ranges', () => {
  expect(chooseRole([])).toBe('support');
  expect(chooseRole(['support'])).toBe('rusher');
  expect(chooseRole(['support', 'rusher'])).toBe('marksman');
  expect(ROLE_ADAPTATION.rusher.range).toBeLessThan(ROLE_ADAPTATION.support.range);
  expect(ROLE_ADAPTATION.marksman.range).toBeGreaterThan(ROLE_ADAPTATION.support.range);
});
for (const [distance, mode, count] of [[400, 1, 1], [220, 2, 3], [70, 3, 6]] as const) it(`uses native mode ${mode} cadence and trigger release`, () => {
  const policy = new BotFirePolicy(), record = { ...HELD_RIFLE, fireModes: [1, 2, 3], fireWait: 0.2 };
  const shots: number[] = []; let released = false;
  for (let tick = 0; tick < 100; tick++) {
    const input = policy.update(record, 0, 'support', distance, 30 - shots.length, tick, true);
    if (input.due) { shots.push(tick); policy.fired(tick); }
    if (shots.length && !input.trigger) { released = true; break; }
  }
  expect(policy.mode).toBe(mode); expect(shots).toHaveLength(count); expect(released).toBe(true);
  const interval = Math.ceil(0.2 * (mode === 1 ? 1 : 0.8) * 60);
  expect(shots.slice(1).every((t, i) => t - shots[i]! >= interval)).toBe(true);
});
it('cancels unsafe pulls, resets swaps and never selects an unsupported mode', () => {
  const policy = new BotFirePolicy(), record = { ...HELD_RIFLE, fireModes: [3] };
  expect(policy.update(record, 0, 'rusher', 30, 30, 0, true).trigger).toBe(true);
  policy.fired(0);
  expect(policy.update(record, 0, 'rusher', 30, 29, 1, false).trigger).toBe(false);
  expect(policy.update({ ...record, id: 14, fireModes: [1] }, 1, 'rusher', 30, 10, 50, true).mode).toBe(1);
  policy.reset(); expect(policy.mode).toBe(0);
  expect(policy.update({ ...record, fireModes: [] }, 0, 'rusher', 30, 30, 100, true).trigger).toBe(false);
});

it('holds a mode through a pull and uses hysteresis between pulls', () => {
  const p = new BotFirePolicy(), record = { ...HELD_RIFLE, fireModes: [1, 2, 3] };
  expect(p.update(record, 0, 'support', 110, 30, 0, true).mode).toBe(3); p.fired(0);
  expect(p.update(record, 0, 'support', 350, 29, 1, true).mode).toBe(3);
  p.update(record, 0, 'support', 350, 29, 2, false);
  expect(p.update(record, 0, 'support', 130, 29, 3, true).mode).toBe(3);
  p.update(record, 0, 'support', 130, 29, 4, false);
  expect(p.update(record, 0, 'support', 200, 29, 5, true).mode).toBe(2);
});
