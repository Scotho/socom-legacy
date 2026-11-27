import { describe, expect, it } from 'vitest';
import { KitTrigger, padHeld, padStep, type PadState } from '../src/padButton';

/**
 * PRESS PARITY (simulation track; reading, pending review): the fire button as the PS2 reads it.
 *
 * - The pad layer's per-button state, stepped once per console update with the physical button's state:
 *   `FUN_002d9ff0` D:L179137-179168 (called per button by `FUN_002da930` D:L179820-179862 on a read that succeeded).
 *   Down: 0 -> 1, 3 -> 1, 1 -> 2, 2 stays. Up: 1 -> 3, 2 -> 3, 3 -> 0.
 * - The fire query, "held", is state 2 only: `FUN_002c60c0` D:L166671-166686, read by the controller update into
 *   ctrl+0x118 (`FUN_00594cf0` D:L453542-453567).
 * - The kit, once per update after the controller (`FUN_005506a0` D:L417905-417907): the trigger held, the timer <= 0
 *   and the pull's count under the mode's limit (`FUN_005c0940` D:L476283-476310: automatic 10000) -- a round leaves and
 *   the timer is set to the wait (`FUN_005c09f0` D:L476313-476341: FireWait x 0.8 in automatic); then the timer is run
 *   down by that update's own dt and clamped at 0 (`FUN_005c0fd0` D:L476643-476647). A trigger reading 0 or 3 clears the
 *   pull's count (`FUN_005c0ae0` D:L476380-476382, D:L476399-476400).
 *
 * The module `../src/padButton` does not exist yet: this file is the RED for the build that adds it.
 */

/** The 9mm Sub's FireWait (`zweapon.rdr`, record 37: 0.075; scene test/golden/weapon-records.json) x 0.8, automatic. */
const WAIT = 0.075 * 0.8;
/** The automatic mode's pull limit (`FUN_005c0940` D:L476283-476310). */
const AUTO_LIMIT = 10000;
/** The nominal console update the online rows show on 93 % of their steps (33.4 ms; GAME_FRAME_DT 525/15734 s). */
const DT = 525 / 15734;

describe('the pad layer per button (FUN_002d9ff0 D:L179137-179168)', () => {
  it.each([
    [0, true, 1], [3, true, 1], [1, true, 2], [2, true, 2],
    [0, false, 0], [1, false, 3], [2, false, 3], [3, false, 0],
  ] as const)('state %i, the button down %s -> %i', (s, down, next) => {
    expect(padStep(s as PadState, down)).toBe(next);
  });

  it('held (FUN_002c60c0 D:L166671-166686) only at state 2', () => {
    expect([0, 1, 2, 3].map((s) => padHeld(s as PadState))).toEqual([false, false, true, false]);
  });

  it('a press is held on its second read, not its first; a re-press after one up read the same', () => {
    let s: PadState = 0;
    const seen: boolean[] = [];
    for (const down of [true, true, true, false, true, true]) { s = padStep(s, down); seen.push(padHeld(s)); }
    expect(seen).toEqual([false, true, true, false, false, true]);
  });
});

describe('the kit trigger (FUN_005c0ae0 / FUN_005c0fd0): the gate, then the run-down', () => {
  it('no round while the pad reads 1; the first round on the first state-2 update', () => {
    const k = new KitTrigger(WAIT, AUTO_LIMIT);
    expect(k.step(DT, 0)).toBe(false);
    expect(k.step(DT, 1)).toBe(false);
    expect(k.step(DT, 2)).toBe(true);
  });

  it('the timer after a round is the wait less that update\'s dt (0.0600 - 0.0334 = 0.0266; the online rows 0.02663)', () => {
    const k = new KitTrigger(WAIT, AUTO_LIMIT);
    k.step(DT, 1);
    expect(k.step(DT, 2)).toBe(true);
    expect(k.timer()).toBeCloseTo(WAIT - DT, 9);
    const short = new KitTrigger(WAIT, AUTO_LIMIT);
    expect(short.step(0.0167, 2)).toBe(true);
    expect(short.timer()).toBeCloseTo(WAIT - 0.0167, 9);    // the rows' 0.04328 on a 16.7 ms firing update
  });

  it('the run-down is clamped at 0 and a round waits until the timer is spent', () => {
    const k = new KitTrigger(WAIT, AUTO_LIMIT);
    expect(k.step(DT, 2)).toBe(true);                         // timer 0.0266
    expect(k.step(DT, 2)).toBe(false);                        // gate refuses (timer > 0), then run down to 0, clamped
    expect(k.timer()).toBe(0);
    expect(k.step(DT, 2)).toBe(true);                         // the second round: the third state-2 read at 33.4 ms
    expect(k.step(0.0167, 2)).toBe(false);                    // 0.0266 -> 0.0099
    expect(k.timer()).toBeCloseTo(WAIT - DT - 0.0167, 9);
    expect(k.step(0.0167, 2)).toBe(false);                    // still above 0 at the gate; 0.0099 -> 0
    expect(k.step(0.0167, 2)).toBe(true);                     // after short updates, one read later
  });

  it('the timer runs down on reads that are not held too (it is the kit\'s, not the trigger\'s)', () => {
    const k = new KitTrigger(WAIT, AUTO_LIMIT);
    expect(k.step(DT, 2)).toBe(true);
    expect(k.step(DT, 3)).toBe(false);
    expect(k.timer()).toBe(0);
  });

  it('the limit is honoured and the count cleared by a 0 read or a 3 read', () => {
    // A limit of 1 (the single mode's, FUN_005c0940): one round a pull until the trigger reads 0 or 3.
    for (const clear of [0, 3] as const) {
      const k = new KitTrigger(WAIT, 1);
      expect(k.step(DT, 2)).toBe(true);
      for (let i = 0; i < 5; i++) expect(k.step(DT, 2)).toBe(false);
      expect(k.step(DT, clear)).toBe(false);
      expect(k.step(DT, 1)).toBe(false);
      expect(k.step(DT, 2)).toBe(true);
    }
    // A limit of 3 (burst): three rounds, then none while held.
    const b = new KitTrigger(WAIT, 3);
    let n = 0;
    for (let i = 0; i < 20; i++) if (b.step(DT, 2)) n++;
    expect(n).toBe(3);
  });

  it('the review F1: a pad-1 read clears the count at the limit too -- ctrl+0x118 reads 0 or 3 whenever "held" is false (FUN_00594cf0 D:L453543-453565)', () => {
    // The table steps ctrl+0x118 from the held answer h alone: h false 0 -> 0, 1 -> 3, 2 -> 3, 3 -> 0, so every pad state
    // but 2 leaves it at 0 or 3, which clears the count (FUN_005c0ae0 D:L476380-476382, D:L476399-476400).
    const k = new KitTrigger(WAIT, 1);
    expect(k.step(DT, 2)).toBe(true);
    for (let i = 0; i < 5; i++) expect(k.step(DT, 2)).toBe(false);   // at the limit, the timer spent
    expect(k.step(DT, 1)).toBe(false);                                  // the re-press's first read: cleared, no round
    expect(k.step(DT, 2)).toBe(true);                                   // its second read fires
  });

  it('pad-1 reads fire nothing, however many', () => {
    const k = new KitTrigger(WAIT, AUTO_LIMIT);
    for (let i = 0; i < 10; i++) expect(k.step(DT, 1)).toBe(false);
  });
});
