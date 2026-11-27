import { describe, expect, it } from 'vitest';
import { SEAL_TUNING } from '@s2u/scene';
import { LookGate, LOOK_SLACK_TICKS_PLACEHOLDER } from '../src/net/lookGate';
import { reloadCutOf } from '../src/reloadLock';
import { INTERRUPT_STICK, TICK } from '../src/mover';
import { wrapYaw } from '../src/yaw';

/**
 * R4P-208 fold 3 (seat-shots' question; re-review 2 of fix 2; reading, pending review): the original's reload interrupt
 * reads the RAW per-tick turn word `actor+0x23c` against 0.1 (r0001 `FUN_00550ef0` D:L418182-418185; r0004
 * 0x556580-0x55658c) -- no mean over ticks. The room (`room.ts` `watchCut`: `reloadCutOf(p.sim.walker.cutStick,
 * p.sim.turn, ...)`, `MoverSim.prepare` laying the gate's `Looked.turn` on `turn`) reads the gate's derived turn, so a
 * reload's cut is the gate's per-tick word through `reloadCutOf`: one tick past the threshold cuts on that tick, and a
 * steady turn under it never does. A guard on fix 2 (`TURN_BAND_TURN_SOURCE_READING`): under the old 4-tick mean
 * (`LOOK_SLACK_TICKS_PLACEHOLDER`), the single tick below read a quarter of its word and did not cut.
 */

const DEG = 180 / Math.PI;
const STILL = { forward: 0, right: 0 };
/** One tick's yaw move, degrees, for a turn word (the word x `turn_maxrate` a second, over a tick). */
const moveOf = (word: number): number => word * SEAL_TUNING.turnMaxRate * TICK * DEG;
const q = (yaw: number): number => Math.round(wrapYaw(yaw) * 65536 / 360) * 360 / 65536;

/** An armed gate at rest; then each tick's word in turn, the cut asked after each (a reload's life, the stick still). */
function cuts(words: readonly number[]): boolean[] {
  const g = new LookGate();
  let ref = { yaw: 0, pitch: 0 };
  g.step(ref, { yaw: 0, pitch: 0, buttons: 0 });
  for (let i = 0; i < LOOK_SLACK_TICKS_PLACEHOLDER; i++) g.step(ref, { yaw: 0, pitch: 0, buttons: 0 });
  let yaw = 0;
  return words.map((w) => {
    yaw += moveOf(w);
    const out = g.step(ref, { yaw: q(yaw), pitch: 0, buttons: 0 });
    ref = { yaw: out.yaw, pitch: out.pitch };
    return reloadCutOf(STILL, out.turn, false);
  });
}

describe('a reload is cut by one tick\'s turn word past 0.1, never by a mean (FUN_00550ef0 D:L418182-418185)', () => {
  it('a single tick of word 0.3 among still ticks cuts on that tick (a 4-tick mean would read 0.075)', () => {
    const words = [0, 0, 0, 0.3, 0, 0, 0];
    expect(0.3 / LOOK_SLACK_TICKS_PLACEHOLDER).toBeLessThan(INTERRUPT_STICK);   // the old mean would not have cut
    expect(cuts(words)).toEqual([false, false, false, true, false, false, false]);
  });

  it('a steady turn of word 0.09 (under the threshold) never cuts, tick after tick', () => {
    const words = Array.from({ length: 120 }, () => 0.09);
    expect(cuts(words).some((c) => c)).toBe(false);
  });

  it('a steady turn of word 0.12 (past the threshold) cuts on its first tick', () => {
    expect(cuts([0, 0.12, 0.12])).toEqual([false, true, true]);
  });
});
