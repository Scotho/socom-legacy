import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT } from '@s2u/scene';
import {
  AI_STACK_MASKS_READING, CUE_HELPME, CUE_PANIC, CUE_RESTRAINED, ESCORTEE_UNIT,
  HOSTAGE_FADE_READING, HOSTAGE_TEAM_MASK, HOSTAGE_TIMERS_READING, HOSTAGE_WATCH_READING, HostageAi, SEAL_TEAM_MASK,
  STANCE_DELAY_READING, TERRORIST_TEAM_MASK, type AiSignal, type HostageWorld, type HostageWorldBody,
} from '../src/hostageAi';

/**
 * HX-3 (web sprint 31; research 238 s2; rulings HX.R2, HX.R4): the hostage's AI on the room, pure. `CAiSHostage` (0x17)
 * as its Tick runs online (`FUN_00601910` D:L511764-511910), the AI stack's four moves, its gate and the allowed-next
 * masks (`FUN_005f5cd0`, `FUN_005f7470`; research 199 s1, s12.2), state 9 standing in place (sprint 32 moves it), state
 * 0x11's fade clock. The frame is stepped by hand at `GAME_FRAME_DT`, the random injected. No room, no wire.
 */

type V3 = [number, number, number];
const HOME: V3 = [0, 0, 0];

/** A seeded random returning `values` in turn (the room's `opts.random` stands in). */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function body(id: number, x: number, team: number, alive = true, z = 0): HostageWorldBody {
  return { id, feet: [x, 0, z], alive, team };
}

function world(bodies: HostageWorldBody[] = []): HostageWorld {
  return { feet: HOME, bodies };
}

/** Frames until a timer of `s` seconds set on one frame has run out (the next frames subtract dt each). */
function framesFor(s: number): number {
  return Math.ceil(s / GAME_FRAME_DT - 1e-9);
}

function steps(ai: HostageAi, n: number, w: HostageWorld = world()): void {
  for (let i = 0; i < n; i++) ai.step(GAME_FRAME_DT, w);
}

/** A hostage stepped to sub-state 5 (its first frame, the 2 s, the 5 s). */
function watching(random = seq(0.5), w: HostageWorld = world()): HostageAi {
  const ai = new HostageAi({ id: 240, random });
  steps(ai, 1 + framesFor(HOSTAGE_TIMERS_READING.restrained) + framesFor(HOSTAGE_TIMERS_READING.hold), w);
  expect(ai.state).toBe(0x17);
  expect(ai.sub).toBe(5);
  return ai;
}

describe('the hostage AI on the server (HX-3)', () => {
  it("spawned online a hostage enters 0x17 sub-state 3 standing (FUN_00573130 D:L434903-434915), after 2 s sub-state 2 crouching after 0.25 + U(0, 0.95) s (STANCE_DELAY_READING, FUN_00563100 D:L427285), after 5 more sub-state 5 (HOSTAGE_TIMERS_READING; FUN_00601910 D:L511764-511910)", () => {
    expect(HOSTAGE_TIMERS_READING).toMatchObject({ restrained: 2, hold: 5, getDown: 10, crouch: 10, rest: 0.5 });
    expect(STANCE_DELAY_READING).toEqual({ base: 0.25, spread: 0.95 });
    for (const r of [0, 0.5, 0.999]) {
      const ai = new HostageAi({ id: 240, random: seq(r) });
      expect(ai.stack.ids).toEqual([0x17]);
      expect([ai.state, ai.sub, ai.stance, ai.unit]).toEqual([0x17, 3, 0, ESCORTEE_UNIT]);
      expect(ai.anchored).toBe(true);
      // The first frame: case 3 asks RESTRAINED (silent on the disc, research 199 s8), stands now, 2 s -> 2.
      steps(ai, 1);
      expect([ai.sub, ai.stance, ai.timer]).toEqual([3, 0, HOSTAGE_TIMERS_READING.restrained]);
      expect(ai.cues).toEqual([CUE_RESTRAINED]);
      const two = framesFor(HOSTAGE_TIMERS_READING.restrained);
      steps(ai, two - 1);
      expect(ai.sub).toBe(3);
      steps(ai, 1);
      expect(ai.sub).toBe(2);                                    // the frame the 2 s run out runs case 2 at once
      const delay = STANCE_DELAY_READING.base + r * STANCE_DELAY_READING.spread;
      expect(ai.stanceDelay).toBeCloseTo(delay - GAME_FRAME_DT, 6);  // the same frame's post-tick took one dt
      expect(ai.stance).toBe(0);
      // Crouched on the first frame whose post-tick takes the delay below 0 (FUN_0056f970 D:L432948-432953).
      let frames = 1;
      while (ai.stance === 0 && frames < 100) { steps(ai, 1); frames++; }
      expect(ai.stance).toBe(1);
      expect(frames * GAME_FRAME_DT).toBeGreaterThan(delay);
      expect((frames - 1) * GAME_FRAME_DT).toBeLessThanOrEqual(delay);
      steps(ai, framesFor(HOSTAGE_TIMERS_READING.hold) - frames);   // `frames` counted the entry frame
      expect(ai.sub).toBe(2);
      steps(ai, 1);
      expect(ai.sub).toBe(5);
      expect(ai.stance).toBe(1);
    }
  });

  it("in sub-state 5 the watch runs every 5 s for a 0.1 s window (FUN_005f6270; HOSTAGE_WATCH_READING) and records the nearest living body within 250 u beyond 10 (DAT_00650da0) as the look; nothing within 250 records nothing; no PANIC and no HELPME online (HOSTAGE_CRIES_READING, V2 #16)", () => {
    expect(HOSTAGE_WATCH_READING).toEqual({ range: 250, period: 5, window: 0.1, minDist2: 100 });
    // The window: the stack's running time t, (int)(t x 10) % 50 == 0 -- every frame of [5k, 5k + 0.1).
    const bodies = [body(1, 50, SEAL_TEAM_MASK, false), body(2, 120, TERRORIST_TEAM_MASK), body(3, 200, SEAL_TEAM_MASK),
      body(241, 30, HOSTAGE_TEAM_MASK, false)];
    const w = world(bodies);
    const ai = watching(seq(0.5), w);
    const runs: number[] = [];
    for (let i = 0; i < framesFor(20); i++) {
      const before = ai.watchRuns;
      const t = ai.stack.time;
      ai.step(GAME_FRAME_DT, w);
      if (ai.watchRuns > before) runs.push(t);
    }
    expect(runs.length).toBeGreaterThanOrEqual(6);
    for (const t of runs) expect(t - 5 * Math.floor(t / 5 + 1e-9)).toBeLessThan(HOSTAGE_WATCH_READING.window + 1e-6);
    const periods = new Map<number, number>();
    for (const t of runs) periods.set(Math.round(t / 5), (periods.get(Math.round(t / 5)) ?? 0) + 1);
    expect([...periods.keys()].every((k, i, ks) => i === 0 || k === ks[i - 1]! + 1)).toBe(true);
    for (const n of periods.values()) expect(n).toBeGreaterThanOrEqual(2);        // a window, not a one-shot
    for (const n of periods.values()) expect(n).toBeLessThanOrEqual(3);           // about 3 frames at 30 Hz
    expect(ai.look).toBe(2);                                // the dead SEAL and the dead hostage are no candidates
    expect(ai.lookAt).toEqual([120, 0, 0]);
    // Both sides share a team bit with 0xC0020000: no PANIC; bit 1 is never set online: no HELPME.
    expect(ai.cues).not.toContain(CUE_PANIC);
    expect(ai.cues).not.toContain(CUE_HELPME);
    expect((HOSTAGE_TEAM_MASK & SEAL_TEAM_MASK) !== 0 && (HOSTAGE_TEAM_MASK & TERRORIST_TEAM_MASK) !== 0).toBe(true);

    // The nearest is chosen first: one within 10 u (horizontally) records no look, though another stands at 120.
    const near = world([body(4, 6, SEAL_TEAM_MASK, true, 6), body(2, 120, TERRORIST_TEAM_MASK)]);
    const close = watching(seq(0.5), near);
    steps(close, framesFor(10), near);
    expect(close.watchRuns).toBeGreaterThan(0);
    expect(close.look).toBeNull();

    // Nothing within 250: the watch runs and records nothing.
    const far = world([body(5, 251, SEAL_TEAM_MASK)]);
    const alone = watching(seq(0.5), far);
    steps(alone, framesFor(10), far);
    expect(alone.watchRuns).toBeGreaterThan(0);
    expect(alone.look).toBeNull();
  });

  it("the stack moves as the original's (199 §1): push 9 over 0x17 suspends it; replace 0x11 over 9 ends 9; unwindTo 0x17 pops 0x11; a push equal to the top is refused (FUN_005f5cd0 D:L505625-505626); a dead body refuses every push; clear(force = 0) on a living hostage pops nothing", () => {
    const signals: [number, AiSignal][] = [];
    const ai = new HostageAi({ id: 240, random: seq(0.5), signal: (s, sig) => signals.push([s.id, sig]) });
    expect(ai.stack.ids).toEqual([0x17]);
    signals.length = 0;
    expect(ai.stack.push(9)).toBe(true);
    expect(ai.stack.ids).toEqual([9, 0x17]);
    expect(signals).toEqual([[0x17, 2], [9, 0]]);
    signals.length = 0;
    expect(ai.stack.replace(0x11)).toBe(true);
    expect(ai.stack.ids).toEqual([0x11, 0x17]);
    expect(signals).toEqual([[9, 1], [0x11, 0]]);
    signals.length = 0;
    expect(ai.stack.unwindTo(0x17)).toBe(true);
    expect(ai.stack.ids).toEqual([0x17]);
    expect(signals).toEqual([[0x11, 1], [0x17, 3]]);
    expect(ai.stack.unwindTo(9)).toBe(false);                 // only if it is in the stack: nothing popped
    expect(ai.stack.ids).toEqual([0x17]);
    // The top-equal test (the mask skipped, flag 2): 0x17 over 0x17 refused, 9 admitted.
    expect(ai.stack.canPush(0x17, 2)).toBe(false);
    expect(ai.stack.canPush(9, 2)).toBe(true);
    expect(ai.stack.push(0x17)).toBe(false);
    expect(ai.stack.ids).toEqual([0x17]);
    // Pop: signal 1 to the top, signal 3 to the next.
    ai.stack.push(9);
    signals.length = 0;
    expect(ai.stack.pop()).toBe(0x17);
    expect(signals).toEqual([[9, 1], [0x17, 3]]);
    // clear(0) on a living hostage recomputes the masks and pops nothing (FUN_005f5f20 D:L505663-505679).
    ai.stack.push(9);
    expect(ai.stack.clear(false)).toBe(false);
    expect(ai.stack.ids).toEqual([9, 0x17]);
    // A dead body: every push refused (D:L505611); clear(0) now clears the whole stack.
    ai.alive = false;
    expect(ai.stack.canPush(0x11)).toBe(false);
    expect(ai.stack.push(0x11)).toBe(false);
    expect(ai.stack.replace(0x11)).toBe(false);
    expect(ai.stack.clear(false)).toBe(true);
    expect(ai.stack.ids).toEqual([]);
  });

  it("the masks (AI_STACK_MASKS_READING; V5 §12.2): [0x17] admits 0x11 and 9; [0x11] admits 2 and refuses 9 and 0x17; CAiSHostage refuses 0x10 always and 0x13 outside sub-states 5 and 6", () => {
    expect(AI_STACK_MASKS_READING).toEqual({ [0x17]: 0x190f4bc0, [9]: 0x1ffffdfe, [0x11]: 0x190c48c6, [2]: 0x3ffffffa });
    const bits = (m: number) => [...Array(32).keys()].filter((b) => ((m >>> b) & 1) === 1);
    expect(bits(AI_STACK_MASKS_READING[0x11])).toEqual([1, 2, 6, 7, 11, 14, 18, 19, 24, 27, 28]);
    const ai = new HostageAi({ id: 240, random: seq(0.5) });
    expect(ai.stack.allowedMask).toBe(0x190f4bc0);
    expect(ai.stack.presentMask).toBe(1 << 0x17);
    expect(ai.stack.canPush(0x11)).toBe(true);
    expect(ai.stack.canPush(9)).toBe(true);
    expect(ai.stack.canPush(2)).toBe(false);
    // [0x11] alone (199 s1's replay: the re-rescue replaced 0x17).
    expect(ai.stack.replace(0x11)).toBe(true);
    expect(ai.stack.ids).toEqual([0x11]);
    expect(ai.stack.canPush(2)).toBe(true);
    expect(ai.stack.canPush(9)).toBe(false);
    expect(ai.stack.canPush(0x17)).toBe(false);
    // So HOLD there cannot enter 0x17 and replaces 0x11 by CAiSHold (OnCommand case 5, D:L450478-450482).
    expect(ai.enterHostage(2)).toBe(false);
    expect(ai.hold(7)).toBe(2);
    expect(ai.stack.ids).toEqual([2]);
    // CAiSHostage's CanPushAiState (0x601ec0): 0x10 never; 0x13 only in sub-states 5 and 6.
    const h = new HostageAi({ id: 241, random: seq(0.5) });
    for (const sub of [0, 1, 2, 3, 4, 5, 6]) {
      h.stack.top!.sub = sub;
      expect(h.stack.canPush(0x10)).toBe(false);
      expect(h.stack.canPush(0x13)).toBe(sub === 5 || sub === 6);
    }
  });

  it("state 9 stands without a navigation binding (FUN_005fc590 D:L509203-509205); state 0x11 online jumps to sub-state 2 and fades 0.75/s to 0, hidden at 0, 1.33 s at most (HOSTAGE_FADE_READING; D:L422191-422212)", () => {
    expect(HOSTAGE_FADE_READING).toEqual({ rate: 0.75 });
    const ai = watching(seq(0.5));
    expect(ai.stance).toBe(1);
    expect(ai.follow(3)).toBe(true);                          // OnCommand case 4's moves: clear(0), push 9
    expect(ai.stack.ids).toEqual([9, 0x17]);
    expect(ai.follow(3)).toBe(true);                          // already following: 9 kept, nothing pushed
    expect(ai.stack.ids).toEqual([9, 0x17]);
    const delay = STANCE_DELAY_READING.base + 0.5 * STANCE_DELAY_READING.spread;
    steps(ai, framesFor(delay) + 1);
    expect(ai.stance).toBe(0);                                // an escortee always stands
    steps(ai, framesFor(10));
    expect([ai.state, ai.stance, ai.goal]).toEqual([9, 0, null]);   // no motion: the point is held
    // The leader's release (ControlHostageAction(ai, 0)): the driver pops 9 on the next frame; 0x17 resumes.
    ai.releaseFollow();
    steps(ai, 1);
    expect(ai.stack.ids).toEqual([0x17]);
    // HOLD unwinds to 0x17 sub-state 2 and records the issuer (D:L450478, D:L450521).
    expect(ai.follow(3)).toBe(true);
    expect(ai.hold(3)).toBe(0x17);
    expect([ai.stack.ids, ai.sub, ai.owner]).toEqual([[0x17], 2, 3]);
    // The rescue: Replace 0x11 (refused while on top); online straight to sub-state 2, the compass anchor freed.
    expect(ai.follow(3)).toBe(true);
    expect(ai.rescue(3)).toBe(true);
    expect(ai.rescue(3)).toBe(false);
    expect([ai.stack.ids, ai.state, ai.sub, ai.anchored, ai.rescued]).toEqual([[0x11, 0x17], 0x11, 2, false, true]);
    expect([ai.opacity, ai.hidden]).toEqual([1, false]);
    const n = framesFor(1 / HOSTAGE_FADE_READING.rate);
    steps(ai, n - 1);
    expect(ai.opacity).toBeCloseTo(1 - (n - 1) * GAME_FRAME_DT * 0.75, 6);
    expect(ai.hidden).toBe(false);
    steps(ai, 1);
    expect([ai.opacity, ai.hidden]).toEqual([0, true]);
    expect(n * GAME_FRAME_DT).toBeLessThan(4 / 3 + GAME_FRAME_DT);
    steps(ai, 30);
    expect([ai.state, ai.sub, ai.opacity, ai.hidden]).toEqual([0x11, 2, 0, true]);
  });

  it("the AI reacts to no event online (HOSTAGE_EVENTS_READING, FUN_00572d70): a shot, a blast and a death nearby change no state", () => {
    const ai = watching(seq(0.5));
    const before = JSON.stringify([ai.stack.ids, ai.sub, ai.timer, ai.stance, ai.look, ai.cues]);
    expect(ai.onEvent('shot', [10, 0, 0])).toBe(false);
    expect(ai.onEvent('blast', [20, 0, 0])).toBe(false);
    expect(ai.onEvent('death', [30, 0, 0])).toBe(false);
    expect(JSON.stringify([ai.stack.ids, ai.sub, ai.timer, ai.stance, ai.look, ai.cues])).toBe(before);
    expect(ai.stack.canPush(0x13)).toBe(true);                // ShotAt would be admitted in sub-state 5: no event pushes it
  });
});
