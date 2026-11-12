// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGrid, GameFrameAccumulator, GAME_FRAME_DT, probeGround, type Grid, type WorldPoly } from '@s2u/scene';
import { simMapFromBytes } from '../src/simMap';
import { TICK, Walker } from '../src/mover';

/**
 * AIR-PROBE (`AIR_FLOOR_PROBE_READING` 'frame-end'; research 399). Simulation track, reading, pending review.
 *
 * The original probes the floor once a game frame, at the end of the frame's whole displacement (`FUN_005506a0`
 * D:L417822-417826: the solve `FUN_005483d0`, then `FUN_005b0840` queues the one probe at `+0xf54`; `FUN_00550570`
 * D:L417771 reads it in `FUN_005b0420`). A probe with no candidate, `DAT_003df1c8` set, puts the body's x/z back at the
 * last hit `+0x400..+0x408` (`FUN_005b0420` D:L467091-467103); the height is not restored (the next solve's y is the
 * altitude `+0x2e4`, `FUN_0059afd0`, D:L413943-413954). No sub-steps, no airborne exception.
 *
 * The port refused each airborne sub-step of at most 1 (`MAX_SUBSTEP`) whose column had no floor: a running jump's 1.08
 * a tick became two 0.54 steps, and a floorless strip wider than 0.54 at a parapet's foot (MP51 Vigilance's
 * `worldmodel/wc09/di_wall_wc09`, 0.3-0.8 wide; MP62, MP52) refused every crossing, so the body hung at the face (the
 * player report the owner confirmed in the browser, 2026-11-10). Red on the base: there no flight crosses a strip wider
 * than a sub-step, and no frame's end is put back.
 */

const quad = (pts: number[], ditype: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
});

function world(polys: WorldPoly[]): Grid {
  const owners = polys.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
  return buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys, owners);
}

/** The strip's width: MP51's widest (z 592.4-593.2 at x 470), wider than a sub-step's 0.54. */
const GAP = 0.8;
/** A floor at y 0 to z 0, no floor over z (0, GAP), the floor at y 0 again from z GAP: a floorless strip, nothing over it. */
const gapWorld = (): Grid => world([
  quad([-200, 0, -200, 200, 0, -200, 200, 0, 0, -200, 0, 0], 3, 'worldmodel/near'),
  quad([-200, 0, GAP, 200, 0, GAP, 200, 0, 200, -200, 0, 200], 3, 'worldmodel/far'),
]);

const STILL = { forward: 0, right: 0, boost: false };
const FWD = { forward: 1, right: 0, boost: false };
const CARRIED = 65;                                             // the standing run's top speed, units a second

interface Sample { x: number; y: number; z: number; vy: number; frame: boolean; airborne: boolean }

/**
 * Ticks `w` (already airborne) up to `n` times with `input`, beside a game-frame clock started with the flight -- the
 * walker's `airClock` is reset at the take-off (`takeOff`) and advanced by each airborne tick's dt -- so each sample
 * says whether its tick ended a game frame. `samples[0]` is the take-off point (a frame's end for the put-back's sake).
 */
function fly(w: Walker, n: number, input = STILL): Sample[] {
  const clock = new GameFrameAccumulator();
  const s = w.state;
  const out: Sample[] = [{ x: s.x, y: s.y, z: s.z, vy: s.vy, frame: true, airborne: true }];
  for (let i = 0; i < n; i++) {
    const wasAir = w.airborne;
    const frames = wasAir ? clock.advance(TICK) : 0;
    w.tick(input);
    out.push({ x: s.x, y: s.y, z: s.z, vy: s.vy, frame: frames > 0, airborne: w.airborne });
  }
  return out;
}

/**
 * The first put-back in a flight: a tick that ends a game frame with the body's x/z exactly where the previous frame's
 * end (or the take-off) left it, while the tick before it had moved the body away from there -- the move taken whole and
 * then put back at the last hit, which no refusal (the move never taken) and no jam (back to the tick's own start) gives.
 */
function putBack(samples: readonly Sample[]): { at: number; last: number } | null {
  let last = 0;
  for (let i = 1; i < samples.length; i++) {
    const t = samples[i]!, before = samples[i - 1]!, hit = samples[last]!;
    if (!before.airborne) break;
    if (!t.frame) continue;
    const moved = before.x !== hit.x || before.z !== hit.z;
    if (i - 1 > last && moved && t.x === hit.x && t.z === hit.z) return { at: i, last };
    last = i;
  }
  return null;
}

/** Airborne at (0, 0, `z0`), carried at 65 along +z, 60 up, the stick at rest (`setAirborne`, the take-off's path). */
function launch(grid: Grid, z0: number): Walker {
  const w = new Walker(grid);
  expect(w.place(0, 1, z0)).toBe(true);
  Object.assign(w.state, { x: 0, y: 0, z: z0, vx: 0, vz: CARRIED });
  w.setAirborne(true, 60);
  return w;
}

describe('AIR-PROBE: the airborne floor probe once a game frame at the move\'s end; a miss puts x/z back (synthetic, no game data)', () => {
  // The flight's game frames end on its 3rd, 5th, 7th, ... ticks (`GameFrameAccumulator` from 0: two 1/60 ticks fall
  // short of 525/15734 s), so the probes lie at z0 + 3.25, + 2.1667 k (65/60 a tick).

  it('a flight whose frame ends all miss the strip crosses it (on the base every flight hangs at its near edge)', () => {
    const w = launch(gapWorld(), -10);                           // probes at -6.75, -4.58, -2.42, -0.25, 1.92, ...
    const samples = fly(w, 120);
    expect(putBack(samples)).toBeNull();
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBe(0);
    expect(w.state.z).toBeGreaterThan(GAP + 5);
  });

  it('a frame whose end lands in the strip puts x/z back at the previous frame\'s probe point; the height goes on', () => {
    const w = launch(gapWorld(), -9.5);                          // probes at -6.25, -4.08, -1.92, then 0.25: in the strip
    const samples = fly(w, 120);
    const p = putBack(samples);
    expect(p).not.toBeNull();
    const { at, last } = p!;
    const t = samples[at]!, before = samples[at - 1]!, hit = samples[last]!;
    expect(hit.z).toBeCloseTo(-9.5 + 7 * CARRIED / 60, 9);       // the 7th tick's frame end, -1.917
    expect(t.x).toBe(hit.x);
    expect(t.z).toBe(hit.z);
    // The move the frame took ended in the strip: its tick-before was moved on, and one more tick reaches the strip.
    const end = before.z + CARRIED / 60;
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThan(GAP);
    expect(probeGround(gapWorld(), 0, end)).toHaveLength(0);
    // The height is not restored: the frame's own step (`FUN_0059b440`: g dt on the fall speed, then the height by it).
    expect(t.airborne).toBe(true);
    expect(t.y - before.y).toBeCloseTo(t.vy * GAME_FRAME_DT, 9);
    expect(t.y).not.toBe(hit.y);
    // Each later frame repeats the same move from the same point (the walls meet nothing here): the body comes down on
    // the near floor, as research 399 predicts the original does when a frame's end lands in the strip. The landing is
    // what is held -- after it the carried 65 runs out on the ground, which crosses the strip as any walk does (the
    // ground's own path, not this task's).
    const landed = samples.findIndex((s, i) => i > at && !s.airborne);
    expect(landed).toBeGreaterThan(at);
    expect(samples[landed]!.y).toBe(0);
    expect(samples[landed]!.z).toBeLessThan(0);                 // the near floor (headless: at the last hit, -1.917)
  });

  it('the flight\'s first frame put back goes to the take-off point (the last ground probe\'s hit)', () => {
    const z0 = -2.85;                                            // the first probe at z0 + 3.25 = 0.4: in the strip
    const samples = fly(launch(gapWorld(), z0), 3);
    expect(samples[3]!.frame).toBe(true);
    expect(samples[1]!.frame || samples[2]!.frame).toBe(false);
    expect(samples[2]!.z).toBeCloseTo(z0 + 2 * CARRIED / 60, 9); // the move taken, unprobed, on the frame's first tick
    expect(samples[3]!.z).toBe(z0);
    expect(samples[3]!.x).toBe(0);
    expect(samples[3]!.airborne).toBe(true);
  });

  it('over one frame\'s travel of starts, most cross and those whose frame end lands in the strip are put back', () => {
    let crossed = 0, held = 0;
    for (let k = 0; k <= 21; k++) {
      const w = launch(gapWorld(), -10 + 0.1 * k);
      const p = putBack(fly(w, 120));
      if (p) held++;
      else if (w.state.z > GAP + 5) crossed++;
    }
    // 0.8 of each 2.1667: about 8 of the 22 starts put back, the rest across (the base: none across).
    expect(crossed + held).toBe(22);
    expect(held).toBeGreaterThanOrEqual(6);
    expect(held).toBeLessThanOrEqual(10);
    expect(crossed).toBeGreaterThanOrEqual(12);
  });

  it('a knock in the air over the strip keeps the flight\'s last hit: the next frame end is put back there and the body lands (review F2)', () => {
    // The original's knock writes no `+0x400` (`FUN_0057e770` D:L440990-441080): a blast on the in-between tick of a
    // flight, over the floorless strip, must not make the strip the last hit -- else every later miss puts the body back
    // over it and it falls for good.
    const w = launch(gapWorld(), -8.2667);                       // frame ends at -5.02, -2.85, -0.68; the 8th tick at 0.40
    const clock = new GameFrameAccumulator();
    let lastHitZ = w.state.z, knocked = false;
    for (let i = 0; i < 12 && !knocked; i++) {
      const frame = clock.advance(TICK) > 0;
      w.tick(STILL);
      if (frame) lastHitZ = w.state.z;
      else if (w.state.z > 0 && w.state.z < GAP) {
        expect(probeGround(gapWorld(), 0, w.state.z)).toHaveLength(0);
        expect(w.knock([0, 0, 0], 'fallForward')).toBe(true);    // in the air, over the strip, no horizontal push
        knocked = true;
      }
    }
    expect(knocked).toBe(true);
    expect(lastHitZ).toBeLessThan(0);
    // The knock restarts the flight's frames (`airClock`): its first frame end is the knock's 3rd tick.
    const after = new GameFrameAccumulator();
    let putBackZ: number | null = null;
    for (let i = 0; i < 120 && w.airborne; i++) {
      const frame = after.advance(TICK) > 0;
      w.tick(STILL);
      if (frame && putBackZ === null) putBackZ = w.state.z;
    }
    expect(putBackZ).toBe(lastHitZ);
    expect(w.airborne).toBe(false);
    expect(w.state.y).toBe(0);
    expect(w.state.z).toBe(lastHitZ);
  });
});

/**
 * MP51 Vigilance, the parapet by the turret platform (`worldmodel/wc09/di_wall_wc09`): its inner face's line in x/z,
 * read off the wall polygon by the diagnosis (the face at z 586.6 at x 392.7 to 593.8 at x 486.9, then to 599.8 at
 * x 569.5); the platform's floor at y ~116.3, the parapet's top ~8.8 over it.
 */
const faceZ = (x: number): number => (x < 486.9 ? 586.6 + ((x - 392.7) / 94.2) * 7.2 : 593.8 + ((x - 486.9) / 82.6) * 6.0);
const FLOOR_Y = 116.3;

const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const haveDisc = (map: string) => !!DISC && existsSync(resolve(DISC, 'RUN', `${map}.ZDB`));

/**
 * The player's jump: standing `back` before the face, facing +z (yaw 179.42), 20 ticks at rest, the run up to 17 before
 * the face, the running jump, then the stick held forward. Returns the walker at the jump and the flight's samples.
 */
function parapetJump(grid: Grid, x: number, back = 31, ticks = 240): { w: Walker; samples: Sample[] } {
  const fz = faceZ(x);
  const w = new Walker(grid);
  expect(w.place(x, FLOOR_Y + 0.1 + 11.48, fz - back), `place at x ${x}`).toBe(true);
  expect(Math.abs(w.state.y - FLOOR_Y)).toBeLessThan(1);
  w.state.yaw = 179.42;
  for (let i = 0; i < 20; i++) w.tick(STILL);
  for (let g = 0; w.state.z < fz - 17 && g < 200; g++) w.tick(FWD);
  expect(w.state.z).toBeGreaterThanOrEqual(fz - 17);
  expect(w.jump()).toBe(true);
  expect(w.airborne).toBe(true);
  return { w, samples: fly(w, ticks, FWD) };
}

describe.skipIf(!haveDisc('MP51'))(`AIR-PROBE on MP51's parapet: running jumps clear it, a frame end in the strip is put back${haveDisc('MP51') ? '' : ' (SOCOM_DISC absent)'}`, () => {
  const grid = (): Grid => simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC, 'RUN', 'MP51.ZDB'))), 'RUN/MP51.ZDB').grid;

  it.each([470, 430, 517])('x %s: the running jump from 31 out clears the parapet and comes down beyond it (on the base x 470 and 517 hang at the face)', (x) => {
    const { w, samples } = parapetJump(grid(), x);
    const fz = faceZ(x);
    const furthest = Math.max(...samples.map((s) => s.z));
    expect(furthest, `x ${x}: past the face`).toBeGreaterThan(fz + 1);
    // Beyond the parapet the ground lies well under the platform: the feet end under it (on the base they drop back
    // onto the platform, 116.3). The brief's "under ~100" is taken as under 110 so a lower terrace still counts.
    expect(w.state.y, `x ${x}: feet at the end`).toBeLessThan(110);
    expect(w.state.z).toBeGreaterThan(fz);
  });

  it('x 470: a run-up whose game-frame end lands in the floorless strip is put back to the previous frame\'s probe point, its height following the fall', () => {
    const g = grid();
    let found: { back: number; samples: Sample[]; at: number; last: number } | null = null;
    for (let k = 0; k <= 22 && !found; k++) {
      const back = 31 - 0.1 * k;                                 // one 2.17 frame's travel of starts, by 0.1
      const { samples } = parapetJump(g, 470, back, 120);
      const p = putBack(samples);
      if (p && samples[p.at]!.airborne) found = { back, samples, ...p };
    }
    expect(found, 'a start whose frame end lands in the strip').not.toBeNull();
    const { samples, at, last } = found!;
    const t = samples[at]!, before = samples[at - 1]!, hit = samples[last]!;
    expect(t.x).toBe(hit.x);
    expect(t.z).toBe(hit.z);
    expect(before.z).toBeGreaterThan(hit.z);                     // the frame's first tick had moved it on
    // The put-back's column is the strip's neighbour on the platform side, within a frame's travel of the face.
    expect(hit.z).toBeLessThan(faceZ(470));
    expect(hit.z).toBeGreaterThan(faceZ(470) - 3);
    // The height is the frame's own step, not restored to the probe point's.
    expect(t.y - before.y).toBeCloseTo(t.vy * GAME_FRAME_DT, 6);
    expect(t.y).not.toBe(hit.y);
  });
});
