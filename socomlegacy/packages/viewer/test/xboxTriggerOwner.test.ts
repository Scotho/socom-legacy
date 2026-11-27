/**
 * SWAP-FIRE (PLAN-2 s4; SWAPFIRE-XBOX-TRIGGER-TESTS, review F2 of SWAPFIRE-XBOX-HELD-TRIGGER): `TriggerOwner` alone, with
 * stub hands and a stub firearm (`TriggerHands`, `TriggerFirearm`), for the paths `xboxHeldTrigger.test.ts` does not reach:
 * the rocket count, the launcher's wait, an item over a held firearm trigger, a hand-over not live, and a let-go. The rule
 * held is TRIGGER-SWAP's (`../src/matchFirearm` `triggerOwed`, `../src/matchThrow` `heldPulls`; research 211 s10,
 * reading, pending review there). Characterization tests of merged code: each asserts the exact `pull(carried)` calls.
 */
import { describe, expect, it } from 'vitest';
import { TriggerOwner, type TriggerFirearm, type TriggerHands } from '../src/xboxPrototype/combatInput';

function rig() {
  const state = { equipped: false, waits: false, rockets: 0, held: false, pulls: 0 };
  const pulled: number[] = [];
  const handsTrigger: boolean[] = [];
  const hands: TriggerHands = {
    equipped: () => state.equipped, firearmWaits: () => state.waits,
    trigger: (on) => { handsTrigger.push(on); }, cancelHold: () => {}, rocketsLaunched: () => state.rockets,
  };
  const firearm: TriggerFirearm = {
    trigger: (on) => { state.held = on; }, held: () => state.held, pulls: () => state.pulls,
    pull: (carried) => { pulled.push(carried); state.held = true; },
  };
  return { state, pulled, handsTrigger, owner: new TriggerOwner(hands, firearm) };
}

describe('TriggerOwner alone (stub hands and firearm)', () => {
  it('(a) a rocket launched during the hold adds one carried pull at the hand-over', () => {
    const { state, pulled, owner } = rig();
    state.equipped = true;
    owner.trigger(true, true);                  // the launcher's hands take the press: owed, 0 rockets at the owe
    state.rockets = 1;                          // a rocket leaves in the hold
    state.equipped = false; owner.suspendFirearm();
    owner.handOver(true);
    expect(pulled).toEqual([1]);
  });

  it('(b) a press while the firearm waits after a launcher is owed, handed over once it no longer waits', () => {
    const { state, pulled, owner } = rig();
    state.waits = true;
    owner.trigger(true, true);
    expect(state.held).toBe(false);             // not given to the firearm while it waits
    owner.handOver(true);
    expect(pulled).toEqual([]);                 // still waiting: nothing handed
    state.waits = false;
    owner.handOver(true);
    expect(pulled).toEqual([0]);
  });

  it('(c) an item taken up over a held firearm trigger owes the firearm\'s pulls at the hand-over', () => {
    const { state, pulled, owner } = rig();
    owner.trigger(true, true);                  // the firearm's own press
    expect(state.held).toBe(true);
    state.pulls = 3;
    state.equipped = true; owner.suspendFirearm();   // an item up over the held trigger
    expect(state.held).toBe(false);
    owner.handOver(true);
    expect(pulled).toEqual([]);                 // the item still up
    state.equipped = false; owner.suspendFirearm();  // put away; the firearm is not held, nothing re-owed
    owner.handOver(true);
    expect(pulled).toEqual([3]);
  });

  it('(d) handOver(false) clears what is owed: no pull later', () => {
    const { state, pulled, owner } = rig();
    state.equipped = true;
    owner.trigger(true, true);
    state.equipped = false; owner.suspendFirearm();
    owner.handOver(false);
    owner.handOver(true);
    expect(pulled).toEqual([]);
  });

  it('(e) a let-go clears what is owed: no pull at the hand-over', () => {
    const { state, pulled, handsTrigger, owner } = rig();
    state.equipped = true;
    owner.trigger(true, true);
    owner.trigger(false, true);                 // let go while the item is up
    expect(handsTrigger).toEqual([true, false]);
    state.equipped = false; owner.suspendFirearm();
    owner.handOver(true);
    expect(pulled).toEqual([]);
  });
});
