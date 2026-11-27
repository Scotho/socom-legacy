// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BodyFlag } from '../src/net/protocol';
import { bodiesOfStates, PAGE_HOSTAGE_ID_BASE } from '../src/pushApartPage';

/**
 * LATER 711 (research 426 s9): the page's other bodies from the client's snapshot bodies -- seats only (the room sends its
 * hostages among the bodies, from `PAGE_HOSTAGE_ID_BASE`; `PUSH_APART_HOSTAGE_PLACEHOLDER`), the living only, the stance
 * code as the posture (`STANCE_CODES`: 0 stand, 1 crouch, 2 prone). The fresh review's finding 1 on 328db89954.
 */
describe('LATER 711: the page offers the living seats, never a hostage', () => {
  const body = (id: number, alive: boolean, stance = 0) => ({ id, feet: [id, 0, 0] as [number, number, number], stance, flags: alive ? BodyFlag.Alive : 0 });
  it('drops a hostage body (id 240 and up) and a dead seat; keeps the living seats with their posture', () => {
    const out = bodiesOfStates([body(1, true, 0), body(2, true, 1), body(3, false), body(PAGE_HOSTAGE_ID_BASE, true), body(PAGE_HOSTAGE_ID_BASE + 3, true), body(4, true, 2)]);
    expect(out).toEqual([
      { x: 1, y: 0, z: 0, stance: 'stand' },
      { x: 2, y: 0, z: 0, stance: 'crouch' },
      { x: 4, y: 0, z: 0, stance: 'prone' },
    ]);
  });
  it('no client yet: no bodies', () => {
    expect(bodiesOfStates(undefined)).toEqual([]);
  });
});
