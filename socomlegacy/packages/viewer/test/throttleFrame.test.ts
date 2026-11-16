// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, GameFrameAccumulator, GAME_FRAME_DT, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { throttleFrameEnds, TICK, Walker, type Stance, type WalkInput } from '../src/mover';
import { airBands } from '../src/locomotion';
import { MoverSim } from '../src/net/moverSim';
import type { Command } from '../src/net/protocol';

/**
 * THROTTLE-FRAME, option B (finding 17; MISSION R8.1, the owner in seat 8a, 2026-11-14; simulation track, reading,
 * pending review). `FUN_00586c10` (D:L444957-445041; the snap D:L445017-445031) snaps a stick axis to the pad's value when the axis was past
 * `at` (0.78 lateral, 0.9 forward) on the last evaluation and the pad's value moves faster than `rate` (7.8, 9 a second)
 * from it; the original evaluates it once a 30 Hz game frame (`GAME_FRAME_DT` = 525/15734 s, research 180 s0). The port
 * ran it every 60 Hz tick, so a fast flick (+1 to -1 in about 20 ms) was sampled mid-travel: the snap took part of it
 * and the rest ramped at 5 a second; and `FUN_00586f00`'s idle test (a stick within 0.03 kept raw) sampled at the
 * centre between frames handed the next tick a `prev` of 0, which never snaps. R8.1 keeps R8's continuous running and
 * judges the change over one game frame -- a browser adaptation of the rule's window: the snap is judged against the
 * ramped value at the last game-frame boundary (`Walker.snapRef`), over `GAME_FRAME_DT`, every tick; once it fires the
 * axis takes the pad's value until the boundary; the ramp still runs every tick. Unit tier: a flat synthetic floor,
 * no game data; the frame phase is mirrored here by a `GameFrameAccumulator` started at the placing, as the walker's.
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 2000, cellsX: 4, cellsZ: 4, originX: -4000, originZ: -4000 };
const floor: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-4000, 0, -4000, 4000, 0, -4000, 4000, 0, 4000, -4000, 0, 4000]),
};
const owners: CollisionOwner[] = [{ modelName: floor.modelName, path: floor.path, first: 0, count: 1 }];
const GRID = buildGrid(params, [], [], [floor], owners);

const keys = (forward: number, right: number): WalkInput => ({ forward, right, boost: false });
const STILL = keys(0, 0);
/** The crouch walk's axis for any push under 0.838 (`FUN_00584c60` D:L444158-444170): 14 / 14.8. */
const CROUCH_WALK = 14 / 14.8;

function placed(stance: Stance = 'stand'): Walker {
  const w = new Walker(GRID);
  w.place(0, 20, 0);
  w.state.yaw = 0;
  if (stance !== 'stand') w.stance = stance;
  return w;
}

/** The walker and its game-frame phase mirrored from the placing: `tick` answers whether the tick ended a game frame. */
function rig(stance: Stance = 'stand'): { w: Walker; tick: (input: WalkInput) => boolean; toBoundary: (input: WalkInput, min: number) => void } {
  const w = placed(stance);
  const clock = new GameFrameAccumulator();
  const tick = (input: WalkInput): boolean => { w.tick(input); return clock.advance(TICK) > 0; };
  /** At least `min` ticks of `input`, then on to the first tick that ends a game frame. */
  const toBoundary = (input: WalkInput, min: number): void => {
    for (let n = 1; ; n++) if (tick(input) && n >= min) return;
  };
  return { w, tick, toBoundary };
}

/** The ramp's law from literals (`lower/upper_x_accel` 2 and 5, the 8th power; research 88 s2): one tick toward `target`. */
function rampLaw(prev: number, target: number): number {
  const rest = (1 - Math.abs(target)) ** 2;
  const limit = 2 + 3 * (1 - (rest * rest) ** 2);
  if (Math.abs(target - prev) / TICK <= limit) return target;
  return target > prev ? prev + limit * TICK : prev - limit * TICK;
}

const speed = (w: Walker): number => Math.hypot(w.state.vx, w.state.vz);
/** The walker's velocity across its facing (`camera.ts`'s right). */
const across = (w: Walker): number => {
  const yaw = (w.state.yaw * Math.PI) / 180;
  return w.state.vx * Math.cos(yaw) - w.state.vz * Math.sin(yaw);
};

describe('THROTTLE-FRAME (R8.1): a flick inside one game frame snaps whole', () => {
  it('every game frame holds two or three 60 Hz ticks, so a flick of two ticks after a boundary is inside one frame', () => {
    expect(GAME_FRAME_DT).toBeGreaterThan(2 * TICK);
    expect(GAME_FRAME_DT).toBeLessThan(3 * TICK);
  });

  it('(a) STAND: +1, a mid-travel -0.6 on the tick after a boundary, then -1: -1 inside one game frame, one snap', () => {
    const r = rig('stand');
    r.toBoundary(keys(0, 1), 30);
    expect(r.w.state.stickRight).toBe(1);
    const before = r.w.stickSnaps;
    expect(r.tick(keys(0, -0.6))).toBe(false);                     // the frame's first tick: mid-travel
    expect(r.w.state.stickRight).toBe(-0.6);                       // the snap takes the sample
    r.tick(keys(0, -1));                                           // 2 ticks = 0.0333 s < GAME_FRAME_DT: the same frame
    expect(r.w.state.stickRight).toBe(-1);                         // was -0.683: the rest ramped at 5 a second
    expect(r.w.stickSnaps - before).toBe(1);                       // one snap event, one cross-fade
    expect(speed(r.w)).toBeCloseTo(65, 6);                         // seal_lstrafe's 65 at once
  });

  it('(b) CROUCH: a mid-travel sample is a crouch walk already at 0.946 (snaps whole as before); through the centre it now snaps too', () => {
    // The crouch walk normalises any push under 0.838 to 14 / 14.8 (FUN_00584c60), so a mid-travel -0.3 is already the
    // whole -0.946: the per-tick snap took it before B, and B keeps it (a control).
    const c = rig('crouch');
    c.toBoundary(keys(0, 0.5), 30);
    expect(c.w.state.stickRight).toBeCloseTo(CROUCH_WALK, 12);
    const was = c.w.stickSnaps;
    expect(c.tick(keys(0, -0.3))).toBe(false);
    expect(c.w.state.stickRight).toBeCloseTo(-CROUCH_WALK, 12);
    c.tick(keys(0, -0.5));
    expect(c.w.state.stickRight).toBeCloseTo(-CROUCH_WALK, 12);
    expect(c.w.stickSnaps - was).toBe(1);
    // Through the centre: +0.5, a tick inside the dead zone (FUN_00586f00: the raw stick kept, no locomotion), -0.5.
    const r = rig('crouch');
    r.toBoundary(keys(0, 0.5), 30);
    const before = r.w.stickSnaps;
    expect(r.tick(keys(0, 0.01))).toBe(false);
    expect(speed(r.w)).toBe(0);                                    // the idle tick stops the body at once, as before
    r.tick(keys(0, -0.5));
    expect(r.w.state.stickRight).toBeCloseTo(-CROUCH_WALK, 12);    // was 0.01 - 5/60: the ramp from the centre
    expect(r.w.stickSnaps - before).toBe(1);
  });

  it('(c) STANDING JUMP: the air control (FUN_0057a330 through FUN_00586c10) snaps the same flick whole', () => {
    const r = rig('stand');
    expect(r.w.jump()).toBe(true);
    expect(r.w.action?.name).toBe('jump');
    r.toBoundary(keys(0, 1), 14);                                  // the ramp's 12 ticks, then a boundary; under 0.7 s
    expect(r.w.state.stickRight).toBe(1);
    const before = r.w.stickSnaps;
    expect(r.tick(keys(0, -0.6))).toBe(false);
    r.tick(keys(0, -1));
    expect(r.w.action?.name).toBe('jump');                         // still the Jump action: its NoInterrupt is 0.7 s
    expect(r.w.state.stickRight).toBe(-1);
    expect(r.w.stickSnaps - before).toBe(1);
    expect(across(r.w)).toBeCloseTo(-airBands('stand', null).left, 6);
  });

  it('(d) IDLE mid-flick: +1, a tick at the centre, -1 -- the body stops on the idle tick, then -1 snaps whole; snapRef untouched', () => {
    const r = rig('stand');
    r.toBoundary(keys(0, 1), 30);
    const ref = (): number[] => Array.from(r.w.snapRef ?? []);     // (absent before B: read after the behaviour's pins)
    const refAtBoundary = ref();
    const before = r.w.stickSnaps;
    expect(r.tick(STILL)).toBe(false);                             // between boundaries
    const speedIdle = speed(r.w), stickIdle = r.w.state.stickRight, refAfterIdle = ref();
    r.tick(keys(0, -1));
    expect(r.w.state.stickRight).toBe(-1);                         // was -5/60: the ramp from the centre the idle tick left
    expect(r.w.stickSnaps - before).toBe(1);
    expect(speedIdle).toBe(0);                                     // FUN_00586f00: no locomotion on the idle tick
    expect(stickIdle).toBe(0);                                     // the raw stick kept (actor+0x248/+0x24c)
    expect(refAtBoundary).toEqual([0, 1]);
    expect(refAfterIdle).toEqual([0, 1]);                          // the idle tick leaves the frame's reference alone
  });

  it('(e) a slow sweep over several frames still ramps tick by tick (the no-snap branch unchanged)', () => {
    const r = rig('stand');
    r.toBoundary(keys(0, 1), 30);
    const before = r.w.stickSnaps;
    let law = 1;
    for (let i = 1; i <= 40; i++) {                                // +1 to -1 in 40 ticks: 3 a second, 0.1 a frame
      const target = 1 - (2 * i) / 40;
      r.tick(keys(0, target));
      // FUN_00586f00: a stick within 0.03 of rest is idle and keeps the raw value (the ramp restarts from it). Tick 20
      // (target 0) is that sample; the law missed it, and (e) was red on both sides of the fix (box ft1).
      law = Math.abs(target) <= 0.03 ? target : rampLaw(law, target);
      expect(r.w.state.stickRight, `tick ${i}`).toBeCloseTo(law, 12);
    }
    for (let i = 0; i < 20; i++) { r.tick(keys(0, -1)); law = rampLaw(law, -1); expect(r.w.state.stickRight).toBeCloseTo(law, 12); }
    expect(r.w.stickSnaps - before).toBe(0);
  });

  it('(e2) a press from rest ramps all the way: no snap at its tail (snapRef 0, then under 0.78: the original\'s 30 Hz ramp has none)', () => {
    // At 30 Hz the ramp climbs 5 x GAME_FRAME_DT = 0.167 a frame: 0.834 -> 1 is 4.97 a second, under both 5 and 7.8, so
    // the original never snaps a press from rest. At 60 Hz the port's step 0.833 -> 1 (10 a second, past 0.78) snapped.
    const r = rig('stand');
    for (let i = 1; i <= 11; i++) r.tick(keys(0, 1));
    expect(r.w.state.stickRight).toBeCloseTo(11 / 12, 12);         // was 1: the 60 Hz tail snap
    r.tick(keys(0, 1));
    expect(r.w.state.stickRight).toBe(1);
    expect(r.w.stickSnaps).toBe(0);
  });
});

/** A script of fast flicks, mid-travel samples and samples at the centre, at shifting frame phases (an odd period). */
function flicks(n: number): WalkInput[] {
  const out: WalkInput[] = [];
  for (let t = 0; t < n; t++) {
    const k = t % 47, odd = Math.floor(t / 47) % 2 === 1;
    const right = k < 20 ? 1 : k === 20 ? (odd ? 0 : -0.6) : k < 40 ? -1 : k === 40 ? (odd ? 0.01 : 0.5) : 1;
    out.push(keys(k < 10 ? 0.4 : 0, right));
  }
  return out;
}
const pose = (w: Walker): number[] => [w.state.x, w.state.y, w.state.z, w.state.stickForward, w.state.stickRight, w.stickSnaps];

describe('THROTTLE-FRAME (R8.1): the frame phase is part of the kept state -- deterministic across save, restore and re-run', () => {
  it('(f) a walker saved mid-frame and restored (on itself after other ticks, and on a fresh walker) resumes bit-identical', () => {
    const script = flicks(240);
    const live = placed(), saved = placed();
    const clock = new GameFrameAccumulator();
    let cut = -1;
    for (let t = 0; t < script.length; t++) {
      live.tick(script[t]!); saved.tick(script[t]!);
      const ended = clock.advance(TICK) > 0;
      if (t >= 60 && !ended && cut < 0) { cut = t; break; }         // mid-frame: this tick ended none
    }
    expect(cut).toBeGreaterThan(0);
    const kept = saved.saveState();
    for (let i = 0; i < 5; i++) saved.tick(keys(-1, -1));          // ticks the re-run undoes
    saved.restoreState(kept);
    const fresh = new Walker(GRID);
    fresh.restoreState(kept);
    for (let t = cut + 1; t < script.length; t++) {
      live.tick(script[t]!); saved.tick(script[t]!); fresh.tick(script[t]!);
      expect(pose(saved), `tick ${t}`).toEqual(pose(live));
      expect(pose(fresh), `tick ${t}`).toEqual(pose(live));
    }
    expect(live.stickSnaps).toBeGreaterThan(4);                    // the script did flick
  });

  it('(g) the page\'s re-run (WalkMode.rerunFrom: restoreState, then MoverSim.apply) reproduces a flick exactly', () => {
    // The re-run of kept commands after a correction or a dance (`../src/walk` `rerunFrom`) is the replay that runs through
    // `Walker`; the recorded .s2r replay draws snapshots and runs no mover (`../src/replay/fold`).
    const w = placed();
    const sim = new MoverSim(w, null);
    const script = flicks(200);
    const cmd = (seq: number, input: WalkInput): Command =>
      ({ seq, forward: input.forward, right: input.right, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    const kept: ReturnType<Walker['saveState']>[] = [];
    const after: number[][] = [];
    script.forEach((input, i) => { sim.apply(cmd(i + 1, input)); kept.push(w.saveState()); after.push(pose(w)); });
    for (const from of [61, 62, 63, 107, 108, 150]) {              // several phases, inside and across the flicks
      w.restoreState(kept[from - 1]!);
      for (let i = from; i < script.length; i++) {
        sim.apply(cmd(i + 1, script[i]!));
        expect(pose(w), `from ${from}, command ${i + 1}`).toEqual(after[i]);
      }
    }
  });

  it('(g2) a re-run cut between a snap and its frame end (the axis following the pad) reproduces the rest exactly', () => {
    // flicks()' snaps all fall on one tick parity (its period is odd, but its centre samples alternate with it), so a
    // second script led by one held tick shifts them across the frame ends; the box (ft3) found no cut with one script.
    let total = 0;
    for (const lead of [0, 1]) {
      const w = placed();
      const sim = new MoverSim(w, null);
      const script = [...Array.from({ length: lead }, () => keys(0, 1)), ...flicks(200)];
      const kept: ReturnType<Walker['saveState']>[] = [];
      const after: number[][] = [];
      script.forEach((input, i) => { sim.apply(command(i + 1, input)); kept.push(w.saveState()); after.push(pose(w)); });
      // the commands whose tick counted a snap and ended no game frame: the snap's frame still open after them
      const cuts = after.map((p, i) => ({ seq: i + 1, snapped: p[5]! > (after[i - 1]?.[5] ?? 0) }))
        .filter((c) => c.snapped && !throttleFrameEnds(c.seq)).map((c) => c.seq);
      total += cuts.length;
      for (const from of cuts) {
        w.restoreState(kept[from - 1]!);
        for (let i = from; i < script.length; i++) {
          sim.apply(command(i + 1, script[i]!));
          expect(pose(w), `lead ${lead}, cut after command ${from}, command ${i + 1}`).toEqual(after[i]);
        }
      }
    }
    expect(total, 'cuts between a snap and its frame end, over both leads').toBeGreaterThan(1);
  });
});

/** A command as the page sends it and the room runs it: the stick, the look still. */
function command(seq: number, input: WalkInput): Command {
  return { seq, forward: input.forward, right: input.right, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
}

describe('THROTTLE-FRAME (R8.1), review F1: the frame ends are the command number\'s, so the room and the page agree after any seam', () => {
  it('throttleFrameEnds is the game frames a GameFrameAccumulator counts from tick 0, tick by tick (2000 ticks)', () => {
    const clock = new GameFrameAccumulator();
    for (let n = 1; n <= 2000; n++) expect(throttleFrameEnds(n), `tick ${n}`).toBe(clock.advance(TICK) > 0);
  });

  /** The room's and the page's movers on one script, each through its own `MoverSim`, at rest before `seam`. */
  const pair = (): { room: Walker; page: Walker; roomSim: MoverSim; pageSim: MoverSim } => {
    const room = placed(), page = placed();
    return { room, page, roomSim: new MoverSim(room, null), pageSim: new MoverSim(page, null) };
  };
  const flicksAfter = (from: number, n: number): WalkInput[] => flicks(n + from).slice(from);

  it('(h) a resume: the page re-places (`walk.ts` resume) where the room\'s body stands, the room does not (`room.ts` handBack); its parked steps ran on -- then flicks agree exactly', () => {
    for (const parked of [0, 1, 2, 3, 7]) {                        // parked steps of either parity: the old clock's phase parted on odd ones
      const { room, page, roomSim, pageSim } = pair();
      let seq = 0;
      for (let i = 0; i < 60; i++) { seq++; const c = command(seq, i < 40 ? keys(0.4, 1) : STILL); roomSim.apply(c); pageSim.apply(c); }
      for (let i = 0; i < parked; i++) roomSim.apply(command(++seq, STILL));   // the room's neutral steps (PARKED_BODY_NEUTRAL)
      expect(page.place(room.state.x, 20, room.state.z)).toBe(true);   // the page's resume: placed afresh, its stick at rest
      page.state.yaw = room.state.yaw;
      expect([page.state.x, page.state.y, page.state.z]).toEqual([room.state.x, room.state.y, room.state.z]);
      const r0 = room.stickSnaps, p0 = page.stickSnaps;
      for (const input of flicksAfter(5, 200)) {
        seq++;
        roomSim.apply(command(seq, input)); pageSim.apply(command(seq, input));
        expect([page.state.x, page.state.z, page.state.stickForward, page.state.stickRight, page.stickSnaps - p0], `parked ${parked}, command ${seq}`)
          .toEqual([room.state.x, room.state.z, room.state.stickForward, room.state.stickRight, room.stickSnaps - r0]);
      }
      expect(room.stickSnaps - r0, 'the flicks after the seam snapped (4 in the script; the box, ft3)').toBeGreaterThanOrEqual(4);
    }
  });

  it('(i) a long drop: the page ran every command at rest, the room elapsed fewer (`room.ts` dropBacklog\'s budget) or none (a mounted drop) -- then flicks agree exactly', () => {
    for (const [dropped, elapsed] of [[9, 4], [9, 0], [12, 7], [5, 5]] as const) {
      const { room, page, roomSim, pageSim } = pair();
      let seq = 0;
      for (let i = 0; i < 60; i++) { seq++; const c = command(seq, i < 40 ? keys(0, -1) : STILL); roomSim.apply(c); pageSim.apply(c); }
      for (let i = 0; i < dropped; i++) pageSim.apply(command(++seq, STILL));   // the page ran them; the room never got them
      if (elapsed > 0) room.elapse(elapsed);
      const r0 = room.stickSnaps, p0 = page.stickSnaps;
      for (const input of flicksAfter(11, 200)) {
        seq++;
        roomSim.apply(command(seq, input)); pageSim.apply(command(seq, input));
        expect([page.state.x, page.state.z, page.state.stickRight, page.stickSnaps - p0], `dropped ${dropped}, elapsed ${elapsed}, command ${seq}`)
          .toEqual([room.state.x, room.state.z, room.state.stickRight, room.stickSnaps - r0]);
      }
      expect(room.stickSnaps - r0, 'the flicks after the seam snapped (4 in the script; the box, ft3)').toBeGreaterThanOrEqual(4);
    }
  });
});

/**
 * The capture rig's Q12, 2026-11-14, proven (seat 8a's score of the rig's files: agent-mail evidence
 * `deadzone-shark/q12/q12-score-8a-2026-11-14.md`; r0004 in PCSX2, keys mapped to the left stick, digital): key
 * reversals +1, a centre gap of g ms, -1. The original sees the centre -- the throttle then ramps 0 -> 1 in 1/6 steps,
 * one a frame (median 34 ms, about 4.9-5.0 a second) -- in about g / 33.37 ms of the runs: one read a game frame. A gap
 * no read caught is one whole snap. What the capture proves is the read interval and the ramp; the snap's thresholds stay
 * a reading (`FUN_00586c10`, D:L445017-445031).
 *
 *   g (ms)   the original (seen/runs)   the frame law min(1, g / 33.37)   option B here (expected, 240 phases)
 *   0        0/6     (0 %)              0 %                                0 %
 *   10       3/20    (15 %)             30 %                               30 %
 *   20       12/20   (60 %)             60 %                               60 %
 *   27       16/20   (80 %)             81 %                               81 %
 *   33       9/10    (90 %)             99 %                               99 %
 *   50+      all                        100 %                              100 %
 *
 * Asserted: B against the frame law within 0.06, not against each measured row. The rows are 6 to 20 runs each; the
 * 10 ms row sits low (3/20 against about 6 expected, a binomial chance of about 11 %), within sampling and PCSX2's
 * host-input polling, so it is recorded here and not asserted. The 60 Hz port before B saw every gap holding a tick, about
 * g / 16.7 -- every gap of 17 ms or more -- against the original's 60 % at 20 ms.
 */
describe('THROTTLE-FRAME (R8.1) against the capture rig\'s Q12, 2026-11-14, proven: the centre seen once a game frame', () => {
  const FRAME_MS = GAME_FRAME_DT * 1000;
  const WARM = 40;                                                 // ticks of the held key: the ramp's 12, then frames
  const AFTER = 30;                                                // ticks after the edge: a whole ramp (12) and more
  const PHASES = 240;

  /**
   * One reversal from `dir`: the key held, then the centre for `gMs` from the edge at WARM ticks + `u` seconds, then the
   * other key. Each 60 Hz tick reads the keys as they stand at its time (tick k at k x TICK from the placing). The
   * lateral stick after each tick from the edge's tick on, and the tick the other key is first read.
   */
  function reversal(gMs: number, u: number, dir: 1 | -1): { stick: number[]; times: number[]; back: number } {
    const w = placed();
    const edge = WARM * TICK + u, back = edge + gMs / 1000;
    const stick: number[] = [], times: number[] = [];
    for (let k = 1; k <= WARM + AFTER; k++) {
      const t = k * TICK;
      w.tick(keys(0, t < edge ? dir : t < back ? 0 : -dir));
      if (t >= edge - TICK) { stick.push(w.state.stickRight * dir + 0); times.push(t); }   // signed: +1 -> -1 (+ 0: no -0)
    }
    return { stick, times, back };
  }

  /** Seen: the stick inside (-0.9, -0.1) for a frame or more (two ticks); a snap reaches -1 with no such stretch. */
  const seen = (stick: number[]): boolean => {
    let run = 0, most = 0;
    for (const v of stick) { run = v > -0.9 && v < -0.1 ? run + 1 : 0; most = Math.max(most, run); }
    return most >= 2;
  };

  for (const g of [0, 10, 20, 27, 33, 50]) {
    it(`g ${g} ms: the centre seen in min(1, g / ${FRAME_MS.toFixed(2)}) of the phases within 0.06; a snap within a frame; a seen ramp at 5 a second`, () => {
      let hits = 0;
      for (let i = 0; i < PHASES; i++) {
        const u = ((i + 0.5) / PHASES) * GAME_FRAME_DT;            // the edge across one game frame of tick and frame phase
        const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
        const { stick, times, back } = reversal(g, u, dir);
        const full = stick.findIndex((v) => v <= -1 + 1e-9);    // the ramp's last step may land a rounding past -1
        expect(full, `g ${g}, phase ${i}: reaches the other side`).toBeGreaterThanOrEqual(0);
        if (seen(stick)) {
          hits++;
          // The ramp from the centre: the tick before the first negative value at 0, then -1 after 12 ticks of 5 a second.
          const first = stick.findIndex((v) => v < 0);
          expect(stick[first - 1], `g ${g}, phase ${i}: the ramp starts at the centre`).toBe(0);
          const seconds = (full - first + 1) * TICK, slope = 1 / seconds;
          expect(Math.abs(slope - 5), `g ${g}, phase ${i}: slope ${slope}`).toBeLessThanOrEqual(0.2);
          expect(seconds).toBeCloseTo(0.2, 2);
        } else {
          expect(times[full]! - back, `g ${g}, phase ${i}: the snap within one game frame of the key`).toBeLessThanOrEqual(GAME_FRAME_DT);
        }
      }
      const fraction = hits / PHASES, law = Math.min(1, g / FRAME_MS);
      expect(Math.abs(fraction - law), `g ${g}: seen ${hits}/${PHASES} against ${law.toFixed(3)}`).toBeLessThanOrEqual(0.06);
      if (g === 0) expect(hits).toBe(0);
      if (g === 50) expect(hits).toBe(PHASES);
    }, 60_000);
  }
});
