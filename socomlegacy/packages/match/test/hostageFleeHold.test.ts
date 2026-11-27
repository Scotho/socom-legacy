import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT } from '@s2u/scene';
import { HOSTAGE_TIMERS_READING, HostageAi, type HostageWorld } from '../src/hostageAi';

/**
 * LATER 1224 (research 445 s5; simulation track, reading, pending review; Q24c M1 and M2, PC 1, r0004, MP71: a
 * memory-read capture of the original, hand-scored, n = 1 each). `CAiSGrenade`'s (0x1b) Tick `FUN_0055ac20`:
 * - its first tick runs in the push frame (the scan, then the driver: D:L432502, D:L432513): sub 0 asks a prone hostage
 *   to stand (`+0x279` = 0 after 0.25 + U(0, 0.95) s, D:L423103-423107), then sub 3 sets sub 6 UNCONDITIONALLY and runs
 *   only by pushing a move child 0x18 (D:L423219-423335); with no cell, callout 0x35 and no child;
 * - while the child runs, the driver does not tick 0x1b (D:L506892-506913): sub 6 holds (M2: 2.63 s, 125 u);
 * - with no child -- no cell, or the run ended -- sub 6 picks 7 inside the flee radius R, 8 outside (`R <= distance`,
 *   D:L423488-423494), and 7 asks prone (2), 8 crouch (1), each with 0.25 + U(0, 0.95) s, whenever the ask is not
 *   already that (D:L423504-423517). M1 (no cell): 6 at the push, 7 every frame after, `+0x279` 2; M2 (a run): 6 for
 *   the run, then 7 with `+0x279` 2 from its end. The port's room reports the move (`moving`) and the side (`inside`).
 */

const W: HostageWorld = { feet: [0, 0, 0], bodies: [] };
const framesFor = (s: number): number => Math.ceil(s / GAME_FRAME_DT - 1e-9);

/** A watching hostage (sub 5, crouched), then fleeing with the room's answers scripted frame by frame. */
function fleeing(moves: (frame: number) => { moving: boolean; inside: boolean }) {
  let frame = 0;
  const ai = new HostageAi({ id: 240, random: () => 0.5, flee: () => ({ gone: false, ...moves(frame) }) });
  for (let i = 0; i < 1 + framesFor(HOSTAGE_TIMERS_READING.restrained) + framesFor(HOSTAGE_TIMERS_READING.hold); i++) ai.step(GAME_FRAME_DT, W);
  expect([ai.state, ai.sub]).toEqual([0x17, 5]);
  const step = (): void => { frame++; ai.step(GAME_FRAME_DT, W); };
  return { ai, step };
}

const ASK = 0.25 + 0.5 * 0.95;                                     // 0.25 + U * 0.95 at U = 0.5

describe('LATER 1224: a hostage whose flight has no move holds, asking prone inside R and crouch outside (0x1b subs 6/7/8)', () => {
  it('no cell (M1): sub 6 at the push frame, 7 the next, then the prone ask with 0.25-1.2 s, held in 7', () => {
    const { ai, step } = fleeing(() => ({ moving: false, inside: true }));
    expect(ai.flee(7)).toBe(true);
    step();
    expect([ai.state, ai.sub]).toEqual([0x1b, 6]);
    step();
    expect(ai.sub).toBe(7);
    step();                                                        // case 7: the ask
    expect(ai.requestedStance).toBe(2);
    expect(ai.stanceDelay).toBeCloseTo(ASK - GAME_FRAME_DT, 6);    // asked in the tick, counted down after it
    for (let i = 0; i < framesFor(ASK) + 1; i++) step();
    // Held in 7 with the ask standing. Whether the body then STAYS prone is not pinned: M1's `+0x279` cycles 255 -> 2 under
    // 7 (the post-tick re-derives `+0x278` from the body, `FUN_005fc910`, and `FUN_00562c80` may refuse prone), a stance
    // model the port does not build (the 1224 review's F3; LATER 1227).
    expect([ai.sub, ai.requestedStance]).toEqual([7, 2]);
  });

  it('a run (M2): sub 6 held with no stance ask while it moves; the frame it ends, 7; then the prone ask', () => {
    const RUN = 40;
    const { ai, step } = fleeing((f) => ({ moving: f <= RUN, inside: true }));
    expect(ai.flee(7)).toBe(true);
    const asked = ai.requestedStance;
    for (let i = 0; i < RUN; i++) {
      step();
      expect(ai.sub).toBe(6);
      expect(ai.requestedStance).toBe(asked);
    }
    step();                                                        // the move ends: 0x1b ticks, case 6 -> 7
    expect(ai.sub).toBe(7);
    step();
    expect(ai.requestedStance).toBe(2);
  });

  it('outside R: 8, the crouch ask (1)', () => {
    const { ai, step } = fleeing(() => ({ moving: false, inside: false }));
    ai.flee(7);
    step(); step();
    expect(ai.sub).toBe(8);
    step();
    expect(ai.requestedStance).toBe(1);
  });

  it('entry: a prone hostage is asked to stand at the push frame -- sub 0, then case 3 again (D:L423103-423107, D:L423221-423225)', () => {
    const { ai, step } = fleeing(() => ({ moving: true, inside: true }));
    (ai as unknown as { stance: number; requestedStance: number }).stance = 2;
    (ai as unknown as { requestedStance: number }).requestedStance = 2;
    let draws = 0;
    const random = (ai as unknown as { random: () => number }).random;
    (ai as unknown as { random: () => number }).random = () => { draws++; return random(); };
    ai.flee(7);
    step();
    expect(ai.requestedStance).toBe(0);
    expect(draws, 'two draws: the body still prone at case 3').toBe(2);
    expect(ai.stanceDelay).toBeCloseTo(ASK - GAME_FRAME_DT, 6);
  });
});
