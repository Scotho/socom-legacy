// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildGrid, DEFAULT_RIFLE, GAME_FRAME_DT, GameFrameAccumulator, type CollisionOwner, type Grid, type GridParams, type WorldPoly,
} from '@s2u/scene';
import { EE_FPU_ROUNDING_READING } from '@s2u/ui';
import { Fire } from '../src/fire';
import { Envelope, RAISE_ENVELOPE_STEP_READING, RAISE_REFUSAL_FRAMES, RAISE_TIMES, WeaponRaise, type RaiseInput } from '../src/weaponRaise';

/**
 * LATER 180 (research 215 s8.3, s8.4; reading, pending review): `FUN_005c0ae0` refuses a bullet-class round while the
 * raise envelope reads below 1 (D:L476423-476438). On the page: `FireSource.raiseRefused`, asked by the trigger's rounds
 * (`pull`, a held trigger's `update`), never by the hook's `shoot`; the page's source answers `WeaponRaise.weight() < 1`.
 * LATER 1147 (research 443): the raise hears the kit's held read (`Fire.padHeldRead`), not the physical button.
 * Frame order as the page runs it (`./main`, `./matchMount`): the pad's press (`pull`), then `Play.frame` (the raise's ask
 * and tick), then `fireFrame` (`update`) -- the original's: the controller's ask and the raise tick (`FUN_00551ec0`
 * D:L418526, D:L418611) before the kit's fire (`FUN_005506a0` D:L417907).
 */
const quad = (points: number[]): WorldPoly =>
  ({ modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(points) });
/** `fire.test.ts`'s world: a wall at z -30 before a shooter at (0, 20, 0). */
function grid(): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const polys = [quad([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30])];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/**
 * LATER 185: each raise's game frames as the test sees them -- a `GameFrameAccumulator` fed the same page steps, the
 * clock PF.R8 steps a per-frame rule by (`@s2u/scene` `gameFrame.ts`).
 */
const clocks = new WeakMap<WeaponRaise, GameFrameAccumulator>();
/** `Play.frame`'s raise: one page frame of `dt`; how many game frames ended on it. */
function step(raise: WeaponRaise, dt: number, input: RaiseInput): number {
  let clock = clocks.get(raise);
  if (!clock) clocks.set(raise, (clock = new GameFrameAccumulator()));
  raise.frame(dt, input);
  return clock.advance(dt);
}

/**
 * A page's frames: the trigger pressed on frame 0 and held; the frame each round left on, and (LATER 185) how many game
 * frames ended on each page frame. `led`: page frames of `dt` the Fire runs first with the trigger up -- the frames the
 * raise was led through, so the kit's game frames (`Fire.update`'s clock) fall where the raise's do.
 */
function pull(dt: number, frames: number, raise: WeaponRaise, led = 0): { rounds: number[]; ticks: number[] } {
  const g = grid();
  const fire = new Fire({
    grid: () => g, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), raiseRefused: () => raise.weight() < 1,
  }, { ...DEFAULT_RIFLE, magazine: 100, fireWait: 10 }, undefined, () => 0.5);
  for (let f = 0; f < led; f++) fire.update(dt);                               // the trigger up through the lead
  const out: number[] = [], ticks: number[] = [];
  for (let f = 0; f < frames; f++) {
    if (f === 0 && fire.pull()) out.push(f);                                   // the pad's press (`trigger` -> `pull`)
    ticks.push(step(raise, dt, { trigger: fire.padHeldRead(dt), aiming: false }));   // `Play.frame` (LATER 1147: the kit's held read)
    if (fire.update(dt) > 0) out.push(f);                                      // `fireFrame`
  }
  return { rounds: out, ticks };
}
const rounds = (dt: number, frames: number, raise: WeaponRaise): number[] => pull(dt, frames, raise).rounds;

/**
 * LATER 185: the page frame on which the game frame `n` after the press's ends -- the press's game frame the first to end
 * on or after the press's page frame (0) -- read from the game frames each page frame ended (`pull`'s `ticks`).
 */
function gameFrameEnd(ticks: readonly number[], n: number): number {
  let seen = 0;
  for (let f = 0; f < ticks.length; f++) if ((seen += ticks[f]!) > n) return f;
  return -1;
}

describe('LATER 180: the raise refusal (FUN_005c0ae0 D:L476423-476438)', () => {
  // LATER 1147 (research 443), restated: was [RAISE_REFUSAL_FRAMES]. The raise is asked up at the held answer, the press's
  // second read (`FUN_005dfe30(.., 1)`, D:L453633-453634; `FUN_002c60c0` D:L166671-166686), so the round waits one game
  // frame more: the first read + 1 + RAISE_REFUSAL_FRAMES.
  it('RED: from a lowered rifle (a spawn) the first round waits for the raise -- at the game frame, three frames after the press', () => {
    expect(rounds(GAME_FRAME_DT, 10, new WeaponRaise())).toEqual([1 + RAISE_REFUSAL_FRAMES]);   // was: [RAISE_REFUSAL_FRAMES], before that [0]
  });
  // LATER 185, restated: was "RED: at 60 Hz the port's envelope (doubles, the page's step) lets it go five frames after
  // the press (RAISE_ENVELOPE_STEP_READING)", [5] -- six page ticks of 1/60 s with the press's own, 0.1 s in doubles. The
  // raise now steps once a game frame, so the 60 Hz count is the game frames' (`RAISE_ENVELOPE_STEP_READING`).
  // LATER 1147, restated: was the press's game frame + RAISE_REFUSAL_FRAMES, [6] -- the raise asked at the press's second
  // read (D:L453633-453634; `FUN_002c60c0` D:L166671-166686), one game frame later.
  it('RED: at 60 Hz the round leaves on the page frame where the press\'s game frame + 1 + RAISE_REFUSAL_FRAMES ends (8: game frames end on 2, 4, 6, 8)', () => {
    const { rounds: r, ticks } = pull(1 / 60, 20, new WeaponRaise());
    expect(ticks.slice(0, 9)).toEqual([0, 0, 1, 0, 1, 0, 1, 0, 1]);           // two 60 Hz frames are 34 us short of a game frame
    expect(r).toEqual([gameFrameEnd(ticks, 1 + RAISE_REFUSAL_FRAMES)]);
    expect(r).toEqual([8]);                                                    // was: [6], before that [5]
  });
  // LATER 1147 (research 443), restated: was [0], the press's page frame. The trigger is read once a game frame through the
  // pad layer and its "held" query answers state 2 only (`FUN_002c60c0` D:L166671-166686), so a raised rifle's round
  // leaves at the press's second read -- the game frame after the press's -- with no raise wait.
  it('a raised rifle fires on the press\'s second read', () => {
    const raise = new WeaponRaise();
    for (let i = 0; i < 12; i++) raise.frame(1 / 60, { trigger: true, aiming: false });
    raise.frame(1 / 60, { trigger: false, aiming: false });
    expect(raise.weight()).toBe(1);
    const { rounds: r, ticks } = pull(1 / 60, 5, raise);
    expect(r).toEqual([gameFrameEnd(ticks, 1)]);
  });
  // LATER 185, restated: was [0] at 60 Hz, the press's page frame. The snap is the raise tick's (D:L494213-494216), run at
  // the press's game frame's end: the press's page frame at the game frame's step, at 60 Hz that one or the next.
  // LATER 1147, restated: was `gameFrameEnd(ticks, 0)`. The raise is asked up at the held answer's ctrl+0x118 state
  // (`FUN_005dfe30(.., 1)`, D:L453633-453634) and snaps at the press's game frame (D:L494213-494216), but the kit
  // (`FUN_005c0fd0`, after the controller, `FUN_005506a0` D:L417907) reads the trigger held only at its second read, one
  // game frame later. The Fire is led through the same frames as the raise (`pull`'s `led`), so both clocks share a phase.
  it('a partly lowered rifle fires on the press\'s second read (the raise snaps to the hold, D:L494213-494216)', () => {
    for (const dt of [GAME_FRAME_DT, 1 / 60]) {
      for (const lead of [0, 1]) {                                            // the press early and late in its game frame
        const raise = new WeaponRaise();
        let led = 0;
        for (let i = 0; i < 12; i++, led++) step(raise, dt, { trigger: true, aiming: false });
        for (let t = 0; t < 5.2 + lead * dt; t += dt, led++) step(raise, dt, { trigger: false, aiming: false });   // 5 s, then 0.2 s into the lower
        expect(raise.weight(), `${dt} ${lead}`).toBeGreaterThan(0);
        expect(raise.weight(), `${dt} ${lead}`).toBeLessThan(1);
        const { rounds: r, ticks } = pull(dt, 5, raise, led);
        expect(r, `${dt} ${lead}`).toEqual([gameFrameEnd(ticks, 1)]);
        if (dt === GAME_FRAME_DT) expect(r).toEqual([1]);
      }
    }
  });
  it('the hook\'s shoot is no trigger: not refused', () => {
    const g = grid(), raise = new WeaponRaise();
    const fire = new Fire({ grid: () => g, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }), raiseRefused: () => raise.weight() < 1 }, DEFAULT_RIFLE, undefined, () => 0.5);
    expect(fire.shoot()).not.toBeNull();
  });
});

/**
 * LATER 185 (research 215 s8.4; reading, pending review): the raise steps once a game frame, in float32. The controller's
 * tick (`FUN_00594cf0`, from `FUN_00551ec0` D:L418526) and the raise tick (`FUN_005dfc80` D:L418611, the frame's dt in
 * `$f12`) run once a game frame (`GAME_FRAME_DT`); the envelope's arithmetic is single precision (`FUN_00286d90`,
 * `FUN_00286d40`, `FUN_00286c90`, `FUN_00286b80`), each step rounded toward zero (`EE_FPU_ROUNDING_READING`). On the page a
 * `GameFrameAccumulator` (PF.R8) counts the game frames; a press on a page frame between two of them is the next one's.
 */
describe('LATER 185: the raise once a game frame, in float32 (FUN_005dfc80 D:L418611; EE_FPU_ROUNDING_READING)', () => {
  const FIRING = { trigger: true, aiming: false }, IDLE = { trigger: false, aiming: false };

  it('RED: names the step: once a game frame, in float32 toward zero', () => {
    expect(RAISE_ENVELOPE_STEP_READING).toBe('once a game frame, in float32 toward zero');   // today: "the page's step, in doubles"
    expect(EE_FPU_ROUNDING_READING).toBe('toward zero, each step');
  });

  it('RED: FUN_00286d90 starts the firearm\'s envelope at (out + in) + hold in float32 toward zero: 100000.59375 (0x47c3504c)', () => {
    const e = new Envelope();
    e.start(RAISE_TIMES.in, RAISE_TIMES.hold, RAISE_TIMES.out);
    expect(e.remaining).toBe(100000.59375);                                   // today: 100000.6 in doubles
    expect(e.in).toBe(Math.fround(0.1));                                      // `FUN_005dffc0`'s word 0x3dcccccd
  });

  it('RED: from a cleared envelope, one tick a game frame takes the frame\'s dt off in float32 -- the weight 1 RAISE_REFUSAL_FRAMES game frames after the press\'s', () => {
    const r = new WeaponRaise();
    const remaining: number[] = [], weights: number[] = [];
    for (let k = 0; k < 4; k++) { weights.push(r.frame(GAME_FRAME_DT, FIRING)); remaining.push(r.envelope.remaining); }
    // research 215 s8.4's count: 5/128 s a tick toward zero from 100000.59375; the fourth tick snaps it to out + hold
    expect(remaining).toEqual([100000.5546875, 100000.515625, 100000.4765625, 100000.5]);   // today: doubles
    expect(weights).toEqual([0.3051757216453552, 0.9042968153953552, 1, 1]);
    for (const w of weights) expect(Math.fround(w)).toBe(w);                  // single precision
    expect(weights.indexOf(1)).toBe(RAISE_REFUSAL_FRAMES);
    expect(RAISE_REFUSAL_FRAMES).toBe(2);
  });

  it('RED: at 60 Hz the weight steps only on the page frames a game frame ends on, constant within one', () => {
    const r = new WeaponRaise();
    let last = r.weight();
    for (let f = 0; f < 30; f++) {
      const ticks = step(r, 1 / 60, f < 20 ? FIRING : IDLE);
      if (ticks === 0) expect(r.weight(), `page frame ${f}`).toBe(last);     // today: it moves every page frame
      last = r.weight();
    }
    expect(last).toBe(1);
  });

  it('RED: the trigger is read once a game frame -- a tap on a page frame between two game frames is the next one\'s press', () => {
    const r = new WeaponRaise();
    expect(step(r, 1 / 60, FIRING)).toBe(0);                                  // the tap, no game frame ends
    expect(r.stats()).toMatchObject({ state: 'down', weight: 0 });            // today: 'up', the raise started
    expect(step(r, 1 / 60, IDLE)).toBe(0);                                    // 34 us short
    expect(r.stats().state).toBe('down');
    expect(step(r, 1 / 60, IDLE)).toBe(1);                                    // the tap's game frame: asked up, one tick
    expect(r.stats()).toMatchObject({ state: 'up', moving: true, weight: 0.3051757216453552 });
  });

  // LATER 1147 (research 443), restated: was RAISE_REFUSAL_FRAMES game frames after the press's, the raise led alone. The
  // raise is asked up only at ctrl+0x118 2 or 1 (`FUN_005dfe30(.., 1)`, D:L453633-453634, D:L453612-453613) -- the held
  // answer, the pad at state 2, the press's SECOND read (`FUN_002c60c0` D:L166671-166686); at 0 the default lower ask
  // (D:L453087-453092). In a game frame the controller (D:L418526), then the raise tick `FUN_005dfc80` (D:L418611), then
  // the kit `FUN_005c0fd0` (D:L417907), which refuses below 1 (`FUN_005c0ae0` D:L476423-476438). So the first round leaves
  // at the first read + 1 + RAISE_REFUSAL_FRAMES: 3 game frames after the press's. Both clocks led (`pull`'s `led`).
  it('RED: from a lowered rifle the first round leaves 1 + RAISE_REFUSAL_FRAMES game frames after the press\'s first read at 30 and 60 Hz, wherever the press falls in its game frame', () => {
    expect(1 + RAISE_REFUSAL_FRAMES).toBe(3);
    for (const dt of [GAME_FRAME_DT, 1 / 30, 1 / 60]) {
      for (let lead = 0; lead < 4; lead++) {
        const raise = new WeaponRaise();
        for (let i = 0; i < lead; i++) step(raise, dt, IDLE);
        const { rounds: r, ticks } = pull(dt, 20, raise, lead);
        expect(r, `${dt} lead ${lead}`).toEqual([gameFrameEnd(ticks, 1 + RAISE_REFUSAL_FRAMES)]);
      }
    }
    // LATER 1147: was [3] -- the raise asked at the second read (D:L453633-453634), one game frame later.
    expect(rounds(1 / 30, 10, new WeaponRaise())).toEqual([4]);              // 1/30 s is 34 us short too: the first game frame ends on 1
  });
});
