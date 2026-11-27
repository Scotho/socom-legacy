// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { TICK, Walker } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import { Button, type Command } from '../src/net/protocol';
import { turnStepSpeed } from '../src/animator';
import { FootPlant, plantedFoot, setTurnStepClips, stepSpeedStanding, TURN_STEP_CLIP_NAMES } from '../src/footPlant';
import { clipsFromPack } from '../src/motionTable';
import { LookLaw } from '../src/look';

/**
 * R4P-301 (LATER 1416; ATLAS L176): the standing turn in place with the rifle lowered slides the feet -- the foot plant
 * (r0004 `FUN_00553870`, D4:L455508-455563; `../src/footPlant`). Reading, pending review; the capture score (IQ-178,
 * C8 / IQ-063 / C7 on the original: path ~4.9, net ~1.85 over a 1.5 s full look turn) is owed before the merge.
 *
 * The turn is driven as the room drives it: commands through `MoverSim` (the look gate, `Walker.raised`), on a flat
 * floor. The mechanics tests turn at the full look rate 2.0 x 1.118 rad/s from the first tick (D4:L363369, D4:L457044;
 * `+0x23c` 1.118 carried from C7B); the parity test turns a full push through the page's own look law (`LookLaw`, its
 * ramp: 2.90 rad over 1.5 s), as a player's turn is, against IQ-178 (A).
 */

/**
 * IQ-178 (A), the original (PC 3, r0004 x2, 13 trials, rifle down, a 1.5 s full look turn in place): net 1.743 sd 0.180,
 * path 4.688 sd 0.262; rifle up, crouched and prone exactly 0. The main controller's bar (2026-11-24): (A)'s mean +/- 2 sd.
 */
const IQ178_A = Object.freeze({ net: [1.38, 2.10] as const, path: [4.17, 5.21] as const });

/**
 * IQ-178 A2, the original's stick-LEFT turn (16 trials, bimodal): its low cluster (6) net 0.387 sd 0.061, path per
 * degree 0.03228 sd 0.00034; its high cluster (10) net 2.617 sd 0.105, path per degree 0.03044 sd 0.00069. The
 * controller's bar: each in its cluster's mean +/- 2 sd (path per degree under the confound rule: the page's turn
 * sweeps ~4-5 degrees more than the original's on the same push, a look-law finding of its own).
 */
const IQ178_A2 = Object.freeze({ lowNet: [0.27, 0.51] as const, lowPerDeg: [0.03160, 0.03296] as const, highNet: [2.41, 2.83] as const, highPerDeg: [0.02906, 0.03182] as const });

/** The clips the plant poses the leg from, as the page and the room load them (`setTurnStepClips`): the fixtures' pack. */
const PACK = resolve(__dirname, '../../../test-fixtures/RUN/MOTION_P.ZAR');
const HAVE_PACK = existsSync(PACK);

function floor(): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-400, 0, 400, 400, 0, 400, 400, 0, -400, -400, 0, -400]),
  };
}
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
const plain = buildGrid(PARAMS, [], [], [floor()], OWNERS);

const FULL_TURN = 2.0 * 1.118;
const BASE: Command = { seq: 0, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };

interface Run { path: number; net: number; steps: [number, number][]; yaws: number[]; at: [number, number][]; phase0: number; turns: number[] }

/** Stand `idle` seconds, then turn `turn` rad/s (left positive) for `secs`; `stance` 1 crouched, 2 prone (settled first). */
function run(opts: { raised?: boolean; idle?: number; secs?: number; turn?: number; stance?: 0 | 1 | 2; replayAt?: number } = {}): Run {
  const { raised = false, idle = 3, secs = 1.5, turn = FULL_TURN, stance = 0 } = opts;
  const w = new Walker(plain);
  w.place(0, 10, 0);
  let sim = new MoverSim(w, null);
  let seq = 0, yaw = 0;
  const apply = (c: Partial<Command>): void => { sim.apply({ ...BASE, seq: ++seq, yaw, raised, ...c }); };
  if (stance !== 0) {
    apply({ buttons: Button.Stance, stance });
    for (let i = 0; i < 180; i++) apply({});
  }
  for (let i = 0; i < Math.round(idle / TICK); i++) apply({});
  const steps: [number, number][] = [], yaws: number[] = [w.state.yaw], at: [number, number][] = [], turns: number[] = [];
  let path = 0;
  const x0 = w.state.x, z0 = w.state.z, phase0 = w.footPlant.phase;
  const n = Math.round(secs / TICK);
  for (let i = 0; i < n; i++) {
    if (opts.replayAt === i) { const gate = sim.gate; sim = new MoverSim(w, null); sim.gate = gate; sim.seq = seq; }
    yaw += (turn * TICK * 180) / Math.PI;
    const bx = w.state.x, bz = w.state.z;
    at.push([bx, bz]);
    apply({ yaw: ((yaw % 360) + 360) % 360, turn });
    const d: [number, number] = [w.state.x - bx, w.state.z - bz];
    steps.push(d);
    yaws.push(w.state.yaw);
    turns.push(w.turn);
    path += Math.hypot(d[0], d[1]);
  }
  return { path, net: Math.hypot(w.state.x - x0, w.state.z - z0), steps, yaws, at, phase0, turns };
}

/** Stand `idleTicks`, then a full look push for 1.5 s through the page's `LookLaw`, laid on commands: `sign` 1 the stick
 * pushed RIGHT (yaw decreasing, -166.4 degrees over the 1.5 s: IQ-178 (A)'s turn, dyaw -161..-166), -1 pushed left. */
function lawRun(idleTicks: number, sign: 1 | -1): { net: number; path: number; angle: number } {
  const w = new Walker(plain);
  w.place(0, 10, 0);
  const sim = new MoverSim(w, null), law = new LookLaw();
  let seq = 0, yaw = 0, path = 0, angle = 0;
  for (let i = 0; i < idleTicks; i++) sim.apply({ ...BASE, seq: ++seq, yaw, raised: false });
  const x0 = w.state.x, z0 = w.state.z;
  for (let k = 0; k < Math.round(1.5 / TICK); k++) {
    const turn = law.frame(TICK, sign, 0).yaw;
    yaw += (turn * TICK * 180) / Math.PI;
    angle += Math.abs(turn * TICK);
    const bx = w.state.x, bz = w.state.z;
    sim.apply({ ...BASE, seq: ++seq, yaw: ((yaw % 360) + 360) % 360, turn, raised: false });
    path += Math.hypot(w.state.x - bx, w.state.z - bz);
  }
  return { net: Math.hypot(w.state.x - x0, w.state.z - z0), path, angle };
}

describe.skipIf(!HAVE_PACK)(`R4P-301: the standing turn in place slides the feet with the rifle lowered (the foot plant)${HAVE_PACK ? '' : ' (no test-fixtures/RUN/MOTION_P.ZAR: skipped)'}`, () => {
  beforeAll(() => { setTurnStepClips(clipsFromPack(new Uint8Array(readFileSync(PACK)), [...TURN_STEP_CLIP_NAMES])); });
  afterAll(() => { setTurnStepClips(null); });

  it("the walker's standing step speed is the animator's (FUN_00588f60), every turn", () => {
    for (let t = -3; t <= 3; t += 0.05) expect(stepSpeedStanding(t)).toBeCloseTo(turnStepSpeed(t, 'stand'), 12);
  });

  it('the planted foot: inside 0.65 +/- 0.2499 the right, outside it the left, inclusive', () => {
    expect(plantedFoot(0.65)).toBe('right');
    expect(plantedFoot(0.401)).toBe('right');
    expect(plantedFoot(0.899)).toBe('right');
    expect(plantedFoot(0.4)).toBe('left');
    expect(plantedFoot(0.9)).toBe('left');
    expect(plantedFoot(0.1)).toBe('left');
  });

  it("rifle lowered, standing, the stick pushed right for 1.5 s through the look law: the feet's net and path inside IQ-178 (A)'s bar", () => {
    // 52 start phases across the lowered rifle's idle (5.5 s on; the trials' phases are not in the record), the stick
    // pushed RIGHT as in every (A) trial: the ensemble's mean inside (A)'s mean +/- 2 sd. The stick-left turn is scored
    // per direction against its own original leg (TURNSLIDE-SCORE-A2-PC3, the controller's ruling), not asserted here.
    const nets: number[] = [], paths: number[] = [];
    for (let idle = 330; idle < 330 + 360; idle += 7) {
      const r = lawRun(idle, 1);
      expect(r.angle).toBeCloseTo(2.90, 1);
      nets.push(r.net); paths.push(r.path);
    }
    const mean = (a: number[]): number => a.reduce((t, v) => t + v, 0) / a.length;
    expect(mean(nets)).toBeGreaterThanOrEqual(IQ178_A.net[0]);
    expect(mean(nets)).toBeLessThanOrEqual(IQ178_A.net[1]);
    expect(mean(paths)).toBeGreaterThanOrEqual(IQ178_A.path[0]);
    expect(mean(paths)).toBeLessThanOrEqual(IQ178_A.path[1]);
    expect(lawRun(400, -1).path).toBeGreaterThan(4);              // the stick-left turn slides too
  });

  it('the walker moves by exactly the plant: a FootPlant fed the same ticks gives the same steps', () => {
    const r = run();
    const p = new FootPlant();
    const dt = TICK;
    p.tick({ standingStill: true, turn: 0, raised: false, player: true, yaw: 0, prevYaw: 0, x: 0, z: 0, dt });
    p.phase = r.phase0;                                          // the idle's clock where the walker's stood
    for (let i = 0; i < r.steps.length; i++) {
      // The walker's own facing each tick (the command's yaw, quantised to 1/182 degree, through the look gate).
      const d = p.tick({ standingStill: true, turn: r.turns[i]!, raised: false, player: true, yaw: r.yaws[i + 1]!, prevYaw: r.yaws[i]!, x: r.at[i]![0], z: r.at[i]![1], dt })!;
      expect(d).not.toBeNull();
      expect(r.steps[i]![0]).toBeCloseTo(d[0], 4);
      expect(r.steps[i]![1]).toBeCloseTo(d[1], 4);
    }
  });

  it('rifle raised: the feet stay put (the raise gate, TURN_SLIDE_RIFLE_UP_READING)', () => {
    expect(run({ raised: true }).path).toBe(0);
  });

  it('crouched and prone: the feet stay put (posture 0 only)', () => {
    expect(run({ stance: 1 }).path).toBe(0);
    expect(run({ stance: 2 }).path).toBe(0);
  });

  it('page and room agree tick for tick: a replay that builds a new MoverSim mid-turn keeps the plant (its state is the walker\'s)', () => {
    const a = run(), b = run({ replayAt: 45 });
    expect(b.steps).toEqual(a.steps);
  });

  it("no turn, no slide: standing still with the rifle lowered doesn't move", () => {
    expect(run({ turn: 0 }).path).toBe(0);
  });
  it('a placing mid-turn starts no half-step: the plant forgets its anchor (every placement path runs `reset`)', () => {
    const w = new Walker(plain);
    w.place(0, 10, 0);
    const sim = new MoverSim(w, null);
    let seq = 0, yaw = 0;
    const apply = (c: Partial<Command>): void => { sim.apply({ ...BASE, seq: ++seq, yaw, raised: false, ...c }); };
    for (let i = 0; i < Math.round(3 / TICK); i++) apply({});
    const turnTick = (): void => { yaw += (FULL_TURN * TICK * 180) / Math.PI; apply({ yaw: ((yaw % 360) + 360) % 360, turn: FULL_TURN }); };
    for (let i = 0; i < 40; i++) turnTick();
    expect(w.place(100, 10, 100)).toBe(true);
    for (let i = 0; i < 3; i++) {
      const bx = w.state.x, bz = w.state.z;
      turnTick();
      expect(Math.hypot(w.state.x - bx, w.state.z - bz), `tick ${i} after the placing`).toBeLessThan(0.5);
    }
  });
  it("a slide's exit tick does not leave the plant's step to a later tick (the review's F1: 1.26 u back up the ramp)", () => {
    const poly = (path: string, pts: number[]): WorldPoly => ({ modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts) });
    const h = 200 * Math.tan((55 * Math.PI) / 180);
    const g = buildGrid(PARAMS, [], [], [
      poly('worldmodel/flat', [0, 0, 400, 400, 0, 400, 400, 0, -400, 0, 0, -400]),
      poly('worldmodel/ramp', [-200, h, -400, 0, 0, -400, 0, 0, 400, -200, h, 400]),
    ], [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 2 }]);
    const w = new Walker(g);
    expect(w.place(-60, 60 * Math.tan((55 * Math.PI) / 180) + 5, 0)).toBe(true);
    const sim = new MoverSim(w, null);
    let yaw = 0, seq = 0, landingBack = 0, landed = false;
    for (let i = 0; i < 400; i++) {
      yaw += (FULL_TURN * TICK * 180) / Math.PI;
      const bx = w.state.x;
      sim.apply({ ...BASE, seq: ++seq, yaw: ((yaw % 360) + 360) % 360, turn: FULL_TURN, raised: false });
      if (w.action?.name.startsWith('land')) { landed = true; landingBack = Math.max(landingBack, bx - w.state.x); }
    }
    expect(landed).toBe(true);
    expect(landingBack).toBeLessThan(0.5);
  });
  it("stick LEFT from a start the push snaps to phase 0.5: IQ-178 A2's low cluster, net and path per degree (the bones' cross-fade)", () => {
    const r = lawRun(600, -1);                                    // 10 s of idle: phase 0.67, trunc(x 60) = 40, snapped
    const perDeg = r.path / ((r.angle * 180) / Math.PI);
    expect(r.net).toBeGreaterThanOrEqual(IQ178_A2.lowNet[0]);
    expect(r.net).toBeLessThanOrEqual(IQ178_A2.lowNet[1]);
    expect(perDeg).toBeGreaterThanOrEqual(IQ178_A2.lowPerDeg[0]);
    expect(perDeg).toBeLessThanOrEqual(IQ178_A2.lowPerDeg[1]);
  });
  it("the idle's clock runs at seal_stand's rate raised or lowered: the Fire idle is an overlay on the same play (AddOverlay FUN_0028d160)", () => {
    // atlas-waves (r0004): Tick_0 FUN_0057f580 attaches the clip's Fire version as an overlay on the play's node, copying
    // its speed (D4:L479363, D4:L479393, D4:L141720-141731) -- the raise re-pushes no play. 3 s at 1/6 a second: 0.5.
    for (const raised of [true, false]) {
      const p = new FootPlant();
      for (let i = 0; i < Math.round(3 / TICK); i++) p.tick({ standingStill: true, turn: 0, raised, player: true, yaw: 0, prevYaw: 0, x: 0, z: 0, dt: TICK });
      expect(p.phase, `raised ${raised}`).toBeCloseTo(0.5, 3);
    }
  });
});
