import { describe, expect, it } from 'vitest';
import { buildGrid, SEAL_TUNING, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import {
  PRONE_FAN_READING, PRONE_PROBE_TILT_READING, WALL_HEAD_LINE_READING, WALL_PROBE_READING, Walker, wallProbeHeights,
  type Stance,
} from '../src/mover';

/**
 * PF-16 (ruling PF.R44, research 217 s2): the body meets walls with the original's per-class horizontal probes
 * (`FUN_0054aa30` D:L414515-416190), not a column -- the low probe at the feet + step_height 6.5 (r 3.5) standing and
 * crouched, at the feet + 3.0 (r 8.0) prone, cast along the travel; and the head line at the head + 2 (D:L415442-415443),
 * which the controlled body casts in every class.
 */

/** A flat ground polygon (`m_ditype` 3), world space. */
function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}
/** Ground rising along +x at `deg` degrees through y 0 at x 0 (`m_ditype` 3). */
function slope(minX: number, maxX: number, deg: number): WorldPoly {
  const k = Math.tan(deg * Math.PI / 180);
  return {
    modelName: 'worldmodel', path: 'worldmodel/slope', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, minX * k, -200, maxX, maxX * k, -200, maxX, maxX * k, 200, minX, minX * k, 200]),
  };
}
/** A vertical wall across z at `x`, from y0 to y1 (`m_ditype` 2). */
function wallX(x: number, z0: number, z1: number, y0: number, y1: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0]),
  };
}
function world(polys: WorldPoly[], cellDim = 100): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim, cellsX: 4, cellsZ: 4, originX: -2 * cellDim, originZ: -2 * cellDim };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
/** The camera's yaw facing from (x, z) toward (tx, tz) (it looks down its own -z). */
const facing = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z)) * 180 / Math.PI;

/** A body in `stance` at (x0, 0) driven toward +x for `ticks`; where it ends. */
function drive(grid: Grid, stance: Stance, x0 = 0, ticks = 600, z0 = 0): Walker {
  const w = new Walker(grid);
  w.place(x0, 40, z0);
  w.stance = stance;
  w.state.yaw = facing(x0, z0, x0 + 100, z0);
  // The crouch at full stick stands to run (FUN_00583030): half a push keeps it crouched.
  const push = stance === 'crouch' ? 0.5 : 1;
  for (let i = 0; i < ticks; i++) w.tick({ forward: push, right: 0, boost: false });
  return w;
}

describe('the wall probes per stance (PF-16, FUN_0054aa30)', () => {
  it('standing and crouched the body meets a wall at the feet + 6.5 (step_height) and keeps 3.5 off it (FUN_0054aa30 D:L415110-415133, 415231-415233, 415418-415419; WALL_PROBE_READING)', () => {
    expect(WALL_PROBE_READING).toEqual({ stand: { h: 6.5, r: 3.5 }, crouch: { h: 6.5, r: 3.5 }, prone: { h: 3, r: 8 } });
    expect(WALL_PROBE_READING.stand.h).toBe(SEAL_TUNING.stepHeight);            // DAT_0044c26c, not a copy
    // A bar from 6 to 7 over the floor: only the low probe (6.5) is in it.
    const bar = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 6, 7)]);
    expect(drive(bar, 'stand').state.x).toBeCloseTo(50 - 3.5, 6);
    expect(drive(bar, 'crouch').state.x).toBeCloseTo(50 - 3.5, 6);
    // A bar from 6.6 to 9 (over the low probe, under the head line) stops no one.
    expect(drive(world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 6.6, 9)]), 'stand').state.x).toBeGreaterThan(60);
  });

  it('a 10-high slot (a bar from 7 to 10 over the floor) stops nothing: a standing SEAL walks under it (H92: the owner\'s yes; WALL_PROBE_READING)', () => {
    const slot = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 7, 10)]);
    expect(drive(slot, 'stand').state.x).toBeGreaterThan(60);                    // 6.5 under it, the head line 19.394 over it
    expect(drive(slot, 'crouch').state.x).toBeGreaterThan(60);                   // 6.5 under, 12.138 over
    expect(drive(slot, 'prone').state.x).toBeGreaterThan(60);                    // 3.0 and 5.637 under
  });

  it('a bar from 5 to 7 stops a standing and a crouched SEAL 3.5 short of it; prone its low probe at 3.0 passes under and its head line at 5.637 meets it (D:L415442-415443; WALL_HEAD_LINE_READING)', () => {
    const bar = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 5, 7)]);
    expect(drive(bar, 'stand').state.x).toBeCloseTo(50 - 3.5, 6);
    expect(drive(bar, 'crouch').state.x).toBeCloseTo(50 - 3.5, 6);
    expect(WALL_HEAD_LINE_READING).toBe('idle');
    expect(wallProbeHeights('prone')).toEqual([3, 3.637 + 2]);
    expect(drive(bar, 'prone').state.x).toBeCloseTo(50 - 8, 6);
    // A bar from 3.2 to 5.5 lies between the prone lines (3.0 under it, 5.637 over it): it crawls through.
    expect(drive(world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 3.2, 5.5)]), 'prone').state.x).toBeGreaterThan(60);
    // The head line lowers with the stance: 19.394 standing, 12.138 crouched (the idle heads + 2).
    expect(wallProbeHeights('stand')).toEqual([6.5, 17.394 + 2]);
    expect(wallProbeHeights('crouch')).toEqual([6.5, 10.138 + 2]);
  });

  it('prone meets a wall at 8.0 along the travel and no nearer; the 13-wide doorway and the 7.5-wide corridor of walk.test.ts still pass (the fan is cast along the travel, PRONE_FAN_READING)', () => {
    expect(PRONE_FAN_READING).toEqual({ count: 3, ahead: 1.4, centre: 1.1, across: 0.39 });
    // Head on: 8.0 short of the wall.
    const wall = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, 0, 30)]);
    expect(drive(wall, 'prone').state.x).toBeCloseTo(50 - 8, 6);
    // Across the travel the fan's side lines stand 0.39 r = 3.12 off the axis: a wall beside it 3.5 off is passed.
    const beside = world([floor(-200, -200, 200, 200, 0), wallX(3.5, -150, 150, 0, 30)]);
    const b = new Walker(beside);
    b.place(0, 40, 50);
    b.stance = 'prone';
    b.state.yaw = facing(0, 50, 0, -100);
    for (let i = 0; i < 300; i++) b.tick({ forward: 1, right: 0, boost: false });
    expect(b.state.x).toBeCloseTo(0, 6);
    expect(b.state.z).toBeLessThan(0);
    // A wall across x = 50 with a doorway z -6.5..6.5: prone crawls through it.
    const door = world([floor(-200, -200, 200, 200, 0), wallX(50, -150, -6.5, 0, 30), wallX(50, 6.5, 150, 0, 30)]);
    expect(drive(door, 'prone', 20).state.x).toBeGreaterThan(60);
    // A corridor 7.5 wide (x 42.5..50) along z: prone crawls down it.
    const corridor = world([floor(-200, -200, 200, 200, 0), wallX(42.5, -150, 0, 0, 30), wallX(50, -150, 0, 0, 30)]);
    const c = new Walker(corridor);
    c.place(46.25, 40, 20);
    c.stance = 'prone';
    c.state.yaw = facing(46.25, 20, 46.25, -100);
    for (let i = 0; i < 600; i++) c.tick({ forward: 1, right: 0, boost: false });
    expect(c.state.z).toBeLessThan(-40);
    expect(c.state.x).toBeGreaterThan(42.5);
    expect(c.state.x).toBeLessThan(50);
    // Into the wall at 45 degrees it slides along it, never nearer than 8 x cos 45 across.
    const d = new Walker(wall);
    d.place(20, 40, 0);
    d.stance = 'prone';
    d.state.yaw = facing(20, 0, 120, 100);
    for (let i = 0; i < 600; i++) d.tick({ forward: 1, right: 0, boost: false });
    expect(d.state.x).toBeLessThanOrEqual(50 - 8 * Math.SQRT1_2 + 1e-6);
    expect(d.state.z).toBeGreaterThan(20);
  });

  it('prone at stairs: the level probe at 3.0 stops a crawl whose next riser stands over it within 8.0 ahead (2/4, 3/6, 4/8 rise/run) and passes 1/4, 2/8 and a 2.9 kerb; a 3.1 kerb stops it (PRONE_PROBE_TILT_READING; research 217 s2.5)', () => {
    // Stairs from x 30 rising along +x: each tread `run` deep and `rise` higher, each riser a wall from tread to tread.
    // The old column's foot was 6 and let a prone body step every one of these; the original's probe is the feet + 3.0,
    // tilted only by the body's matrix (FUN_0054ecd0), and a body on a level tread is level.
    const stairs = (rise: number, run: number, steps: number): Grid => {
      const polys = [floor(-200, -200, 30, 200, 0)];
      for (let k = 0; k < steps; k++) {
        const x0 = 30 + k * run, x1 = k === steps - 1 ? 200 : x0 + run;
        polys.push(floor(x0, -200, x1, 200, (k + 1) * rise), wallX(x0, -200, 200, k * rise, (k + 1) * rise));
      }
      return world(polys);
    };
    const crawl = (g: Grid): Walker => drive(g, 'prone', 0, 900);
    for (const [rise, run] of [[2, 4], [3, 6], [4, 8]] as const) {
      const w = crawl(stairs(rise, run, 6));
      expect(w.state.x, `${rise}/${run}`).toBeLessThan(30 + run);                  // stopped at the foot or the first tread
    }
    for (const [rise, run] of [[1, 4], [2, 8]] as const) {
      const w = crawl(stairs(rise, run, 6));
      expect(w.state.y, `${rise}/${run}`).toBeCloseTo(6 * rise, 6);              // up the whole flight
    }
    expect(crawl(stairs(2.9, 50, 1)).state.y).toBeCloseTo(2.9, 6);
    expect(crawl(stairs(3.1, 50, 1)).state.x).toBeCloseTo(30 - 8, 6);
  });

  it('the prone head line stays level on a slope (WALL_HEAD_LINE_READING: the idle head, not lifted by FUN_0054ecd0)', () => {
    // Down a 20-degree slope (rising along +x: the crawl runs toward -x) to a bar from 6 to 30 over the ground under it.
    // The head line (D:L415441-415459) is cast level from the head's height over the feet and FUN_0054ecd0 lifts only
    // the low line's segments, so the head line, 5.637 over the feet, is 8 x tan 20 = 2.91 higher over the ground 8
    // ahead and meets the bar there; the low line, tilted down with the body, passes under it.
    const k = Math.tan(20 * Math.PI / 180);
    const at = -50, under = at * k;
    const hill = world([slope(-200, 200, 20), wallX(at, -150, 150, under + 6, under + 30)]);
    const w = new Walker(hill);
    w.place(0, 40, 0);
    w.stance = 'prone';
    w.state.yaw = facing(0, 0, -100, 0);
    for (let i = 0; i < 600; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.state.x).toBeCloseTo(at + 8, 4);
  });

  it('the prone low line follows the root tilt (PRONE_PROBE_TILT_READING "root", FUN_0054ecd0 D:L416972-417027): up a 20-degree slope a fin 1.5 over the ground is crawled over, one 2.9 over it stops the crawl 8 short', () => {
    expect(PRONE_PROBE_TILT_READING).toBe('root');
    // Up a 20-degree slope rising along +x, a thin fin across it at x 50 standing `h` over the ground there. The low line
    // leaves the feet + 3.0 and rises sin 20 = 0.342 a unit along the travel (the travel turned by the root's tilt, its
    // y times the segment's length, added to the end); the ground rises tan 20 = 0.364, so 8 ahead the line is
    // 3 - 8 x 0.022 = 2.82 over the ground. Level, the line would be 3 - 8 x 0.364 = 0.09 over it and meet any fin
    // taller than that within 8.
    const k = Math.tan(20 * Math.PI / 180), fin = (h: number): Grid => world([slope(-200, 200, 20), wallX(50, -150, 150, 50 * k - 1, 50 * k + h)]);
    const crawl = (g: Grid, level = false): Walker => {
      const w = new Walker(g);
      if (level) (w as unknown as { tiltTick: () => void }).tiltTick = () => {};   // the rule off: the root level
      w.place(0, 40, 0);
      w.stance = 'prone';
      w.state.yaw = facing(0, 0, 100, 0);
      for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false });   // laid on the slope first
      for (let i = 0; i < 900; i++) w.tick({ forward: 1, right: 0, boost: false });
      return w;
    };
    expect(crawl(fin(1.5)).state.x).toBeGreaterThan(60);                           // tilted: over it
    expect(crawl(fin(1.5), true).state.x).toBeCloseTo(50 - 8, 4);                  // level: stopped 8 short
    expect(crawl(fin(2.9)).state.x).toBeCloseTo(50 - 8, 4);                        // 2.82 over the ground at 8: met
    // On flat ground the tilt is none and the probe as before (the stairs above).
    expect(crawl(world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, -1, 2.9)])).state.x).toBeGreaterThan(60);
    expect(crawl(world([floor(-200, -200, 200, 200, 0), wallX(50, -150, 150, -1, 3.1)])).state.x).toBeCloseTo(50 - 8, 4);
  });
});
