// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, GameFrameAccumulator, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { TICK, Walker } from '../src/mover';

/**
 * The stick throttle's snap and ramp (`FUN_00586c10`, D:L444957-445041) on the shipped `Walker`, against the capture rig's
 * Q17 legs B and B' (the original in PCSX2, r0004, MP2 (900,600), `seal_A_scuba` STANDING and lowered, RECRUIT; memory
 * reads at about 900-930 Hz scored BY GAME FRAME, change points under 8 ms merged; 2026-11-14 evening). Files in the
 * private bucket, `gate-runner/shadow/out/2026-11-14/q10-hitreg/q17-reversals/`: `B1p-hold0548|0666|0676|0696|0706-rows.csv`
 * and `-edges.csv`, `B2p-full-to0671|0661|0652-rows.csv` and `-edges.csv`, `B-prime-score.txt` (the per-frame `thr248`
 * after each edge, two runs a row), `calib-3-standing.txt` (each level's settled `thr248`), `B2p-0671-snap-dt.txt`.
 * Where each expected row comes from: B1' and B2' -- `B-prime-score.txt` run 1 and `calib-3-standing.txt` (read from the
 * bucket by seat 8a); C -- `C-score.txt` (read by seat 8a); A -- `A-score.txt`'s rows as the main controller relayed them
 * (the file is in the bucket since the rig's stop, not re-read here); leg B's 0.923 and 0.844 one-frame rows -- RELAYED only
 * (the main controller's message from `B-score.txt`), pending a read of that file. The fresh reviewer could not open the
 * bucket: these rows are the transcription, not the capture re-read by the test.
 *
 * What it proves, and what not: the snap's `at` lies between a held 0.7645 (ramps on a full reversal) and 0.7962 (snaps),
 * and its `rate` between 7.52 a second (a 0.251 drop over 33.37 ms ramps) and 8.48 (0.283 snaps) -- BRACKETED by capture.
 * The constants 0.78 and 7.8 themselves stay the code's reading inside those brackets (`throttleSnaps`). The ramp's 1/6
 * step a frame is Q12's. Tolerance: 0.003 a frame (the rig's three decimals, and the port's 2 x 5/60 = 0.16667 a frame
 * against the original's 5 x 0.03337 = 0.16685, which drifts 0.0002 a frame).
 *
 * The known difference (LATER 1052): the original divides the ramp and the rate test by the frame's MEASURED time
 * (`+0x2e0`, D:L444997-445028); the port by the constant `GAME_FRAME_DT`. On the original's short frames (+0x2e0 0.01672,
 * about 1.7 % of Q17's frames) its ramp steps half and its rate test fires on a jump over 0.130. B2' run 8 (0.7487) snapped
 * on such a frame, and B1p-hold0676 run 2 stepped half (0.236 -> 0.32); the port, with no short frame, gives the ordinary
 * run. Held below as an expected difference, not a failure.
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 2000, cellsX: 4, cellsZ: 4, originX: -4000, originZ: -4000 };
const floor: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-4000, 0, -4000, 4000, 0, -4000, 4000, 0, 4000, -4000, 0, 4000]),
};
const owners: CollisionOwner[] = [{ modelName: floor.modelName, path: floor.path, first: 0, count: 1 }];
const GRID = buildGrid(params, [], [], [floor], owners);
const TOLERANCE = 0.003;

/**
 * The lateral stick at each of the eight game frames' ends after an edge: `from` held 60 ticks (settled, then on to a frame's
 * end), then `to` from the first tick of the next frame -- the capture's edge read on the frame after it (its first value is
 * one frame's change, as here).
 */
function framesAfterEdge(from: number, to: number): number[] {
  const w = new Walker(GRID);
  w.place(0, 20, 0);
  w.state.yaw = 0;
  const clock = new GameFrameAccumulator();
  const tick = (right: number): boolean => { w.tick({ forward: 0, right, boost: false }); return clock.advance(TICK) > 0; };
  for (let n = 1; ; n++) if (tick(from) && n >= 60) break;
  expect(w.state.stickRight, 'the level settled before the edge').toBeCloseTo(from, 9);
  const out: number[] = [];
  while (out.length < 8) if (tick(to)) out.push(w.state.stickRight);
  return out;
}

const expectFrames = (got: number[], want: number[], label: string): void => {
  want.forEach((v, i) => expect(Math.abs(got[i]! - v), `${label}: frame ${i + 1} port ${got[i]!.toFixed(4)} against ${v}`).toBeLessThanOrEqual(TOLERANCE));
};

describe('THROTTLE (FUN_00586c10) against the capture rig\'s Q17 legs B and B\', 2026-11-14: the snap bracketed, the ramp a 1/6 step a frame', () => {
  // B1': held LEFT at the level (calib-3-standing.txt), then full RIGHT in one step; run 1 of B-prime-score.txt.
  const B1P: ReadonlyArray<readonly [string, number, number[]]> = [
    ['B1p-hold0548 (held -0.4952): RAMP 10/10', -0.4952, [-0.328, -0.162, 0.005, 0.172, 0.339, 0.506, 0.673, 0.84]],
    ['B1p-hold0666 (held -0.7329): RAMP 10/10', -0.7329, [-0.566, -0.399, -0.232, -0.066, 0.101, 0.268, 0.435, 0.602]],
    ['B1p-hold0676 (held -0.7645): RAMP 10/10', -0.7645, [-0.598, -0.431, -0.264, -0.097, 0.07, 0.236, 0.403, 0.57]],
    ['B1p-hold0696 (held -0.7962): SNAP 10/10', -0.7962, [1, 1, 1, 1, 1, 1, 1, 1]],
    ['B1p-hold0706 (held -0.8279): SNAP 10/10', -0.8279, [1, 1, 1, 1, 1, 1, 1, 1]],
  ];
  for (const [label, held, want] of B1P) {
    it(`${label} -- a full reversal from a held level: the port's frames within ${TOLERANCE}`, () => {
      expectFrames(framesAfterEdge(held, 1), want, label);
    });
  }

  // B2' and B: from full RIGHT, one step down on the same side; run 1 (or the relayed one-frame rows of leg B).
  const B2P: ReadonlyArray<readonly [string, number, number[]]> = [
    ['B 0.923 (a drop of 0.077): one frame, by the ramp', 0.923, [0.923, 0.923]],
    ['B 0.844 (a drop of 0.156): one frame, by the ramp', 0.8438, [0.8438, 0.8438]],
    ['B2p-full-to0671 (0.7487, a drop of 0.251): RAMP 9/10, two frames', 0.7487, [0.833, 0.749, 0.749, 0.749]],
    ['B2p-full-to0661 (0.7170, a drop of 0.283): SNAP 9/9', 0.717, [0.717, 0.717, 0.717]],
    ['B2p-full-to0652 (0.7012, a drop of 0.299): SNAP 10/10', 0.7012, [0.701, 0.701, 0.701]],
  ];
  for (const [label, to, want] of B2P) {
    it(`${label} -- the port's frames within ${TOLERANCE}`, () => {
      expectFrames(framesAfterEdge(1, to), want, label);
    });
  }

  it('the brackets: `at` between a held 0.7645 (ramps) and 0.7962 (snaps); `rate` between 7.52 a second (ramps) and 8.48 (snaps)', () => {
    expect(framesAfterEdge(-0.7645, 1)[0]).toBeLessThan(0);           // ramped: still on the old side a frame on
    expect(framesAfterEdge(-0.7962, 1)[0]).toBe(1);                   // snapped
    expect(framesAfterEdge(1, 0.7487)[0]).toBeGreaterThan(0.8);        // ramped: 0.251 over 33.37 ms is 7.52 a second
    expect(framesAfterEdge(1, 0.717)[0]).toBeCloseTo(0.717, 9);       // snapped: 0.283 is 8.48 a second
  });

  /**
   * Legs A and C (A-score.txt, C-score.txt): the shipped Walker driven with the rig's steps, each step from the first tick
   * of a game frame so a frame's end reads it (the capture's caught rows). Frame ends: the original's values within the
   * tolerance. Mid-frame ticks: MISSION R8's named deviation in SHAPE, a record and not a fix -- the original holds a frame's
   * whole 1/6 step, the port runs it a half step a tick, so a mid-frame tick sits half way between the original's two
   * frames (equal distance from the input edge over the frame's phase: research 208 s10, leg C).
   */
  function stepsFromFrame(start: { forward: number; right: number }, steps: ReadonlyArray<readonly [number, number, number]>, frames: number) {
    const w = new Walker(GRID);
    w.place(0, 20, 0);
    w.state.yaw = 0;
    const clock = new GameFrameAccumulator();
    const tick = (forward: number, right: number): boolean => { w.tick({ forward, right, boost: false }); return clock.advance(TICK) > 0; };
    for (let n = 1; ; n++) if (tick(start.forward, start.right) && n >= 60) break;
    const ends: { forward: number; right: number }[] = [], mids: number[] = [];
    let i = 0, left = steps[0]![2];
    while (ends.length < frames) {
      const [f, r] = i < steps.length ? [steps[i]![0], steps[i]![1]] : [steps[steps.length - 1]![0], steps[steps.length - 1]![1]];
      const end = tick(f, r);
      if (end) ends.push({ forward: w.state.stickForward, right: w.state.stickRight }); else mids.push(w.state.stickRight);
      if (i < steps.length - 1 && --left <= 0) { i++; left = steps[i]![2]; }
    }
    return { ends, mids };
  }
  const FOREVER = 1e9;
  it('leg A1, -0.495 caught by a frame then full RIGHT: the ramp through zero at the original\'s frame ends; mid-frame ticks half way (R8\'s shape)', () => {
    const want = [-0.495, -0.328, -0.162, 0.005, 0.172, 0.339, 0.506, 0.673, 0.84, 1.0];
    const { ends, mids } = stepsFromFrame({ forward: 0, right: -1 }, [[0, -0.495, 2], [0, 1, FOREVER]], want.length);
    expectFrames(ends.map((e) => e.right), want, 'A1 -0.495');
    for (let k = 1; k < 9; k++) expect(mids[k]!, `mid-frame ${k}: half way between the original's frames (R8's shape)`).toBeCloseTo((want[k - 1]! + want[k]!) / 2, 2);
  });
  it('leg A1, +0.495 caught, then full RIGHT: 0.495, 0.662, 0.829, 0.996, 1.0', () => {
    expectFrames(stepsFromFrame({ forward: 0, right: -1 }, [[0, 0.495, 2], [0, 1, FOREVER]], 5).ends.map((e) => e.right), [0.495, 0.662, 0.829, 0.996, 1.0], 'A1 +0.495');
  });
  it('leg A1, +0.844 caught, then full RIGHT: 0.844 -> 1.0 in one frame', () => {
    expectFrames(stepsFromFrame({ forward: 0, right: -1 }, [[0, 0.8438, 2], [0, 1, FOREVER]], 3).ends.map((e) => e.right), [0.844, 1.0, 1.0], 'A1 +0.844');
  });
  it('leg C1, forward -> right: forward 1 -> 0 in one frame, the lateral 0.167 ... 1.0; mid-frame ticks half way (R8\'s shape)', () => {
    const want = [0.167, 0.334, 0.5, 0.667, 0.834, 1.0];
    const { ends, mids } = stepsFromFrame({ forward: 1, right: 0 }, [[0, 1, FOREVER]], want.length);
    expect(ends[0]!.forward).toBe(0);                                // the released axis snaps (past 0.9, faster than 9 a second)
    expectFrames(ends.map((e) => e.right), want, 'C1 fwd -> right');
    for (let k = 1; k < 6; k++) expect(mids[k]!, `mid-frame ${k}: half way (R8's shape)`).toBeCloseTo((want[k - 1]! + want[k]!) / 2, 2);
  });
  it('leg C1, forward -> forward-right: forward stays 1, the lateral ramps 1/6 a frame, |stick| >= 1 throughout (65 every tick)', () => {
    const { ends } = stepsFromFrame({ forward: 1, right: 0 }, [[1, 1, FOREVER]], 6);
    expect(ends.every((e) => e.forward === 1)).toBe(true);
    expectFrames(ends.map((e) => e.right), [0.167, 0.334, 0.5, 0.667, 0.834, 1.0], 'C1 fwd -> fwd-right');
  });
  it('leg C2, W+D for one frame (33 ms) then right: the W+D frame 0.167 with forward 1, then forward 0 and the lateral on to 1.0', () => {
    const { ends } = stepsFromFrame({ forward: 1, right: 0 }, [[1, 1, 2], [0, 1, FOREVER]], 6);
    expect(ends[0]!.forward).toBe(1);
    expect(ends[1]!.forward).toBe(0);
    expectFrames(ends.map((e) => e.right), [0.167, 0.334, 0.5, 0.667, 0.834, 1.0], 'C2 T33');
  });

  it('EXPECTED DIFFERENCE (LATER 1052): the original\'s short frames -- B2p-full-to0671 run 8 snapped on a 0.01672 s frame, B1p-hold0676 run 2 stepped half; the port, with the constant GAME_FRAME_DT, runs the ordinary frames', () => {
    // B2p-0671-snap-dt.txt: the edge frame's +0x2e0 0.01672; the original went 1.0 -> 0.7487 in that one frame.
    expect(framesAfterEdge(1, 0.7487).slice(0, 2).map((v) => +v.toFixed(3))).toEqual([0.833, 0.749]);   // the original: [0.749, 0.749]
    // B-prime-score.txt, B1p-hold0676 run 2: ... 0.236, 0.32 (a half step, 5 x 0.01672), 0.487; the port steps whole.
    const frames = framesAfterEdge(-0.7645, 1);
    expect(frames[6]! - frames[5]!).toBeCloseTo(2 * 5 * TICK, 9);    // the original's run 2: 0.32 - 0.236 = 0.084
  });
});
