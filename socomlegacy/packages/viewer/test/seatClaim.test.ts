import { describe, expect, it } from 'vitest';
import { SEAT_CLAIM_HOLD_S_ADAPTATION, SeatClaimHold, seatClaimDeviceOf, seatClaimHeld, seatClaimLine, seatClaimOffer, seatClaimPulse } from '../src/seatClaim';

/** SEAT_CLAIM_ADAPTATION (no original; the owner's word, 2026-11-24): the spectator view's offer and its hold. */
describe('seatClaimOffer', () => {
  const seats = (open: number, claim = true) => ({ open, claim });
  it('a watcher told a free seat: open; a full room: full; queued: its place', () => {
    expect(seatClaimOffer({ role: 'spectator', queue: 0, seats: seats(2) })).toEqual({ kind: 'open', open: 2 });
    expect(seatClaimOffer({ role: 'spectator', queue: 0, seats: seats(0) })).toEqual({ kind: 'full' });
    expect(seatClaimOffer({ role: 'spectator', queue: 3, seats: seats(0) })).toEqual({ kind: 'queued', position: 3 });
  });
  it('nothing for a player, for a page the room told no `seats` (an older room, a playing joiner), or with claims closed', () => {
    expect(seatClaimOffer({ role: 'player', queue: 0, seats: seats(1) })).toBeNull();
    expect(seatClaimOffer({ role: 'spectator', queue: 0, seats: null })).toBeNull();
    expect(seatClaimOffer({ role: 'spectator', queue: 2, seats: null })).toBeNull();
    expect(seatClaimOffer({ role: 'spectator', queue: 0, seats: seats(1, false) })).toBeNull();
  });
});

describe('seatClaimLine', () => {
  it('the state, then the control in the hint\'s form: the device\'s button (R1\'s glyph, or J), HOLD, what it does', () => {
    expect(seatClaimLine({ kind: 'open', open: 1 }, 'pad')).toEqual({ line: '1 SLOT OPEN   \ue0bd HOLD: JOIN', at: 14 });
    expect(seatClaimLine({ kind: 'open', open: 3 }, 'pad').line).toBe('3 SLOTS OPEN   \ue0bd HOLD: JOIN');
    expect(seatClaimLine({ kind: 'full' }, 'keyboard')).toEqual({ line: 'GAME FULL   J HOLD: JOIN QUEUE', at: 12 });
    expect(seatClaimLine({ kind: 'queued', position: 2 }, 'pad').line).toBe('IN QUEUE: 2   \ue0bd HOLD: LEAVE');
  });
  it('`at` is the button\'s own character, for every offer and device', () => {
    for (const offer of [{ kind: 'open', open: 2 }, { kind: 'full' }, { kind: 'queued', position: 11 }] as const) {
      expect(seatClaimLine(offer, 'pad').line[seatClaimLine(offer, 'pad').at]).toBe('\ue0bd');
      expect(seatClaimLine(offer, 'keyboard').line[seatClaimLine(offer, 'keyboard').at]).toBe('J');
    }
  });
});

describe('LATER 1604: the claim line on a page with no pad (SEAT_CLAIM_NO_PAD_ADAPTATION)', () => {
  it('the device the line is for: a pad or the touch layer R1\'s; a development build\'s keyboard J; else none', () => {
    expect(seatClaimDeviceOf(1, 'pad', false)).toBe('pad');                  // a release build's pad
    expect(seatClaimDeviceOf(1, 'pad', true)).toBe('pad');
    expect(seatClaimDeviceOf(0, 'touch', false)).toBe('pad');                // the touch layer's R1 (`./matchTouch`)
    expect(seatClaimDeviceOf(0, 'keyboard', true)).toBe('keyboard');         // the test room's development keyboard
    expect(seatClaimDeviceOf(0, 'pad', true)).toBe('keyboard');              // a development front-end match: J is read
    expect(seatClaimDeviceOf(0, 'pad', false)).toBe('none');                 // a release build with no pad: neither R1 nor J
  });
  it('the controller ruling (2026-11-26): CONTROLLER NEEDED only with neither a pad nor touch -- the touch layer shown counts as a pad', () => {
    // a touch laptop with a fine pointer: the prompt device is not 'touch', but its first touch shows the layer and its R1
    expect(seatClaimDeviceOf(0, 'pad', false, true)).toBe('pad');
    expect(seatClaimDeviceOf(0, 'keyboard', true, true)).toBe('pad');
    expect(seatClaimDeviceOf(0, 'pad', false, false)).toBe('none');
    const full = { kind: 'full' } as const;
    const R1 = 'GAME FULL   \ue0bd HOLD: JOIN QUEUE';
    expect(seatClaimLine(full, seatClaimDeviceOf(1, 'pad', false)).line).toBe(R1);                 // pad -> R1
    expect(seatClaimLine(full, seatClaimDeviceOf(0, 'touch', false)).line).toBe(R1);               // touch (coarse pointer) -> R1
    expect(seatClaimLine(full, seatClaimDeviceOf(0, 'pad', false, true)).line).toBe(R1);           // touch layer shown -> R1
    expect(seatClaimLine(full, seatClaimDeviceOf(0, 'pad', false)).line).toBe('GAME FULL   CONTROLLER NEEDED TO JOIN QUEUE');   // neither
    expect(seatClaimLine(full, seatClaimDeviceOf(0, 'keyboard', true)).line).toBe('GAME FULL   J HOLD: JOIN QUEUE');           // a development build's keyboard -> J
  });
  it('no pad: the state, then that a controller is needed for the act -- no button to hold or ring', () => {
    expect(seatClaimLine({ kind: 'open', open: 1 }, 'none')).toEqual({ line: '1 SLOT OPEN   CONTROLLER NEEDED TO JOIN', at: -1 });
    expect(seatClaimLine({ kind: 'full' }, 'none')).toEqual({ line: 'GAME FULL   CONTROLLER NEEDED TO JOIN QUEUE', at: -1 });
    expect(seatClaimLine({ kind: 'queued', position: 2 }, 'none')).toEqual({ line: 'IN QUEUE: 2   CONTROLLER NEEDED TO LEAVE', at: -1 });
    expect(seatClaimLine({ kind: 'coming' }, 'none')).toEqual({ line: 'JOINING THE GAME...', at: -1 });
  });
  it('the pad\'s and the keyboard\'s lines are unchanged', () => {
    expect(seatClaimLine({ kind: 'full' }, 'pad')).toEqual({ line: 'GAME FULL   \ue0bd HOLD: JOIN QUEUE', at: 12 });
    expect(seatClaimLine({ kind: 'full' }, 'keyboard')).toEqual({ line: 'GAME FULL   J HOLD: JOIN QUEUE', at: 12 });
  });
});

describe('seatClaimPulse', () => {
  it('an open slot breathes between the low share and full; the others stand at full', () => {
    expect(seatClaimPulse({ kind: 'open', open: 1 }, 0)).toBeCloseTo(1);
    expect(seatClaimPulse({ kind: 'open', open: 1 }, 0.8)).toBeCloseTo(0.55);
    expect(seatClaimPulse({ kind: 'full' }, 0.8)).toBe(1);
  });
});

describe('seatClaimHeld: the button the line names', () => {
  it('R1 itself when the page knows it, whatever the layout\'s fire lane; J alike; the fire lane only for a caller that does not know R1', () => {
    // Goldeneye / COD Modern: R1 holds Inventory and fire is on Cross and R2 -- R1 claims, Cross (fire) does not
    expect(seatClaimHeld({ r1: true, fire: false, key: false })).toBe(true);
    expect(seatClaimHeld({ r1: false, fire: true, key: false })).toBe(false);
    expect(seatClaimHeld({ r1: false, fire: false, key: true })).toBe(true);
    expect(seatClaimHeld({ r1: undefined, fire: true, key: false })).toBe(true);    // no R1 known: the Default layout's fire lane
    expect(seatClaimHeld({ r1: undefined, fire: false, key: false })).toBe(false);
  });
});

describe('SeatClaimHold', () => {
  const H = SEAT_CLAIM_HOLD_S_ADAPTATION * 1000;
  it('acts once at the hold, not before; the release re-arms it', () => {
    const h = new SeatClaimHold();
    expect(h.take(true, true, 0)).toBe(false);
    expect(h.progress(H / 2)).toBeCloseTo(0.5);
    expect(h.take(true, true, H - 1)).toBe(false);
    expect(h.take(true, true, H)).toBe(true);
    expect(h.take(true, true, H + 500)).toBe(false);            // held on: once
    expect(h.progress(H + 500)).toBeUndefined();
    expect(h.take(false, true, H + 600)).toBe(false);
    expect(h.take(true, true, H + 700)).toBe(false);
    expect(h.take(true, true, 2 * H + 700)).toBe(true);
  });
  it('a tap does nothing', () => {
    const h = new SeatClaimHold();
    h.take(true, true, 0);
    expect(h.take(false, true, 100)).toBe(false);
    expect(h.take(true, true, 200)).toBe(false);
    expect(h.take(true, true, 200 + H - 1)).toBe(false);
  });
  it('a hold begun or carried with no offer is void until released (a player\'s trigger, the seated page\'s hold)', () => {
    const h = new SeatClaimHold();
    expect(h.take(true, false, 0)).toBe(false);
    expect(h.take(true, true, 10)).toBe(false);
    expect(h.take(true, true, 10 + 2 * H)).toBe(false);
    const g = new SeatClaimHold();
    g.take(true, true, 0);
    g.take(true, false, H / 2);                                  // the offer went mid-hold
    expect(g.take(true, true, 2 * H)).toBe(false);
  });
});
