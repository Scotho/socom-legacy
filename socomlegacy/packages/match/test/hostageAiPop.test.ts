import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT } from '@s2u/scene';
import { HOSTAGE_TIMERS_READING, HostageAi, type HostageWorld } from '../src/hostageAi';
import { HOSTAGE_FLEE_END_PLACEHOLDER } from '../src/hostageDanger';

/**
 * LATER 1205 (research 447 s11; simulation track, reading, pending review): the AI driver `FUN_005f8030`
 * (D:L506872-506930) pops a state whose Tick finished it IN THE SAME CALL. Each hostage Tick returns `!(live bit +0x4a
 * bit 1)`, stored at `+0x28` (0x17 `FUN_00601910`, 9 `FUN_005fb1c0`, 0x11 `FUN_00559070`, 2 `FUN_006060c0`, 0x1b
 * `FUN_0055ac20`; 9's early paths return a literal 0 with the bit set, the same value); a non-zero return pops the top at once (`FUN_005f7c40`) and adds no time to the
 * stack or the state (D:L506919). The state below is not ticked until the next frame. A top whose live bit someone else
 * cleared (the leader's release) is popped at the next driver call without a tick. Before LATER 1205 the port popped a
 * self-finished top one frame late, and ticked it once more with its time counted.
 */

const W: HostageWorld = { feet: [0, 0, 0], bodies: [] };
const seq = (...v: number[]): (() => number) => { let i = 0; return () => v[i++ % v.length]!; };
const framesFor = (s: number): number => Math.ceil(s / GAME_FRAME_DT - 1e-9);
const steps = (ai: HostageAi, n: number): void => { for (let i = 0; i < n; i++) ai.step(GAME_FRAME_DT, W); };

/** A hostage in 0x17 sub-state 5 (spawned, its 2 s and 5 s run out), its flight's object already gone. */
function watching(): HostageAi {
  const ai = new HostageAi({ id: 240, random: seq(0.5), flee: () => ({ gone: true }) });
  steps(ai, 1 + framesFor(HOSTAGE_TIMERS_READING.restrained) + framesFor(HOSTAGE_TIMERS_READING.hold));
  expect([ai.state, ai.sub]).toEqual([0x17, 5]);
  return ai;
}

describe('LATER 1205: the driver pops a state its own Tick finished in the same frame (FUN_005f8030)', () => {
  it('0x1b: the frame its end timer runs out pops it at once, with no time added; 0x17 ticks again on the next frame', () => {
    const ai = watching();
    expect(ai.flee(7)).toBe(true);
    expect(ai.stack.ids).toEqual([0x1b, 0x17]);
    const k = framesFor(HOSTAGE_FLEE_END_PLACEHOLDER);   // frame 1 starts the end timer and spends its dt
    steps(ai, k - 1);
    expect(ai.stack.ids).toEqual([0x1b, 0x17]);
    expect(ai.stack.top!.live).toBe(true);
    const below = ai.stack.find(0x17)!;
    const [stackTime, belowTime] = [ai.stack.time, below.time];
    steps(ai, 1);                                          // the Tick clears live: popped in this call
    expect(ai.stack.ids).toEqual([0x17]);
    expect(ai.ticked).toBe(0x1b);                          // the room reads the state that ticked, not the top after
    expect(ai.stack.time).toBe(stackTime);                 // a done Tick: no dt to the stack (D:L506919)
    expect(below.time).toBe(belowTime);                    // the state below is not ticked this frame
    steps(ai, 1);                                          // the next frame: 0x17's Tick runs, its time counts
    expect(below.time).toBeCloseTo(belowTime + GAME_FRAME_DT, 9);
    expect(ai.stack.time).toBeCloseTo(stackTime + GAME_FRAME_DT, 9);
  });

  it('an external clear (the leader\'s release of 9) still pops at the next step, without a tick and with no time added', () => {
    const ai = watching();
    expect(ai.follow(3)).toBe(true);
    steps(ai, 5);
    expect(ai.stack.ids).toEqual([9, 0x17]);
    ai.releaseFollow();
    const below = ai.stack.find(0x17)!;
    const [stackTime, belowTime] = [ai.stack.time, below.time];
    steps(ai, 1);
    expect(ai.stack.ids).toEqual([0x17]);
    expect(ai.ticked).toBeNull();                          // popped without a tick
    expect([ai.stack.time, below.time]).toEqual([stackTime, belowTime]);
    steps(ai, 1);
    expect(below.time).toBeCloseTo(belowTime + GAME_FRAME_DT, 9);
  });

  it('a live top is ticked and timed every frame (0x17 and 9 never clear their own live bit in the port)', () => {
    const ai = watching();
    const t = ai.stack.time;
    steps(ai, 600);
    expect(ai.stack.ids).toEqual([0x17]);
    expect(ai.stack.time).toBeCloseTo(t + 600 * GAME_FRAME_DT, 6);
    expect(ai.follow(3)).toBe(true);
    steps(ai, 600);
    expect(ai.stack.ids).toEqual([9, 0x17]);
  });
});
