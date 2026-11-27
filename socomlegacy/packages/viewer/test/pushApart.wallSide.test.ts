// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, polygonNormal, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { TICK, Walker, type WalkInput } from '../src/mover';

/**
 * LATER 711 -- a WALL-SIDE body (research 426 s10.3; simulation track; reading, pending review, of a COMPOSITION).
 * `FUN_0054f7e0` has no wall term: it acts on the moving body's frame displacement before the world collision takes it
 * (online D:L416574-416576, before `FUN_00549f30` D:L416677-416687), and it never writes the other body (D:L417412-417668;
 * research 426 s0.3). So a body standing against a wall and walked into is the contact slide followed by the walls,
 * and the still body never moves (`PUSH_APART_WALL_SIDE_PLACEHOLDER`, note only, until the rig's Q22-WP legs W1-W3).
 * These pin what the composition must hold -- no body ends a move inside the other's cylinder by more than one move,
 * none passes the wall, the wall-side body never moves -- not a figure from the original. Unit tier: a flat synthetic
 * floor and wall (the plane x 50 facing -x, 40 tall, as `crouchRunRelease.test.ts`), no game data.
 */

const RUN: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const EAST = 270;                                                   // the yaw that faces +x
const WALL = 50;
const CONTACT = 6 + 6;                                              // standing radii (PUSH_APART_RADIUS_READING)
const RUN_TICK = 65 * TICK;                                         // one 60 Hz move of the run
/** The original's deepest separation in the rig's W3 runs: run 1's wedge into the corner, 7.75-7.80 u (Q22-WP W3). */
const W3_DEEPEST = 7.75;

function world(): ReturnType<typeof buildGrid> {
  const floor: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  };
  const wall: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([WALL, 0, -200, WALL, 0, 200, WALL, 40, 200, WALL, 40, -200]),
  };
  expect(Math.sign(polygonNormal(wall.points)![0])).toBe(-1);
  const polys = [floor, wall];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

/** The teammate run up against the wall at z, then still: where a standing body rests on the plane. */
function wallSideTeammate(grid: ReturnType<typeof buildGrid>, z: number): Walker {
  const t = new Walker(grid);
  expect(t.place(WALL - 20, 1, z)).toBe(true);
  t.state.yaw = EAST;
  for (let i = 0; i < 180; i++) t.tick(RUN);
  for (let i = 0; i < 60; i++) t.tick(STILL);
  return t;
}

const body = (w: Walker) => () => [{ x: w.state.x, y: w.state.y, z: w.state.z, stance: w.stance }];

function runInto(m: Walker, t: Walker, seconds: number): { minSep: number; maxX: number; tMoved: number } {
  m.bodies = body(t); t.bodies = body(m);
  const t0 = { x: t.state.x, z: t.state.z };
  let minSep = Infinity, maxX = -Infinity;
  for (let k = 0; k < Math.round(seconds / TICK); k++) {
    m.tick(RUN); t.tick(STILL);
    minSep = Math.min(minSep, Math.hypot(t.state.x - m.state.x, t.state.z - m.state.z));
    maxX = Math.max(maxX, m.state.x);
  }
  return { minSep, maxX, tMoved: Math.hypot(t.state.x - t0.x, t.state.z - t0.z) };
}

describe('LATER 711: a body standing against a wall, walked into (the composition, research 426 s10.3)', () => {
  it('head-on, square to the wall: the runner stops at the radii less a move; the wall-side body never moves', () => {
    const grid = world();
    const t = wallSideTeammate(grid, 0);
    const rest = WALL - t.state.x;
    expect(rest).toBeGreaterThan(0);
    const m = new Walker(grid);
    expect(m.place(WALL - 70, 1, 0)).toBe(true);
    m.state.yaw = EAST;
    const r = runInto(m, t, 3);
    expect(r.minSep, `min sep ${r.minSep}`).toBeGreaterThanOrEqual(CONTACT - RUN_TICK - 1e-6);
    expect(r.maxX, `the runner passed the teammate (max x ${r.maxX}, teammate at ${t.state.x})`).toBeLessThan(t.state.x);
    expect(r.tMoved).toBe(0);
  });

  it('at 45 degrees along the wall: the runner never passes the wall; the teammate never moves', () => {
    const grid = world();
    const t = wallSideTeammate(grid, 0);
    const m = new Walker(grid);
    expect(m.place(WALL - 50, 1, -40)).toBe(true);
    // Aim the runner at the teammate's spot: find the yaw by a probe on the same grid (no axis convention assumed).
    let best = EAST, bestErr = Infinity;
    for (let yaw = 180; yaw <= 360; yaw += 1) {
      const p = new Walker(grid); p.place(WALL - 50, 1, -40); p.state.yaw = yaw;
      for (let i = 0; i < 20; i++) p.tick(RUN);
      const ax = p.state.x - (WALL - 50), az = p.state.z + 40, bx = t.state.x - (WALL - 50), bz = t.state.z + 40;
      const err = Math.abs(Math.atan2(az, ax) - Math.atan2(bz, bx));
      if (err < bestErr) { bestErr = err; best = yaw; }
    }
    m.state.yaw = best;
    const r = runInto(m, t, 4);
    expect(r.maxX, `max x ${r.maxX}`).toBeLessThan(WALL);
    expect(r.tMoved).toBe(0);
  });

  // LATER 711 (research 426 s10.3; PUSH_APART_WALL_SIDE_PLACEHOLDER): THE ORIGINAL, the rig's Q22-WP W3 (r0004 online, MP2, 3 consoles;
  // a capture scored by hand, not proven; hub rig/Q22-WP/W3/ (sha256 ad0cb23b)): a RUN at 45 degrees into a teammate flat against a wall
  // makes contact at 12.9-14.2 u and stops at 10.6-11.8 u, then HOLDS (1 of 5, 11.68 u), SLIDES ROUND along the wall
  // and runs on (3 of 5), or WEDGES into the corner within about 1 s (1 of 5, 7.75-7.80 u): it never sinks gradually.
  // The port, with LATER 1164's stick, sinks steadily into him (each tick the contact slide leaves a move tangent to his
  // circle and the walls carry the rest along the wall into him; 5.83 u in 4 s) and never slides round: a real
  // divergence, shipped NAMED (the main controller's ruling, 2026-11-18). Inferred, not read: the missing piece is
  // step (2), the local human's muzzle push (FUN_0054f7e0's other site, D:L417544-417573), which keeps the predicted
  // firepoint at least the teammate's radius out every frame; its reach is unread (PUSH_APART_MUZZLE_REACH_READING,
  // Q22-T). The next patch, with LATER 1194's frame-granular walls checked first. No second slide is invented.
  // LATER 1194B (the walls trial, 2026-11-21; the fresh review of 1d3d40a26a, F1): with the walls met once a game frame the
  // committed start alone reached 11.07 u and slid round (the original's 3 of 5), but that is one phase: the review's
  // sweep of starts found 99 of 270 runs still sinking under 7.75 u, the worst 2.71. So the gap stands, and the case is
  // now held over a grid of starts (below), so one lucky phase cannot flip it. The frame-granular walls
  // do not fix W3; the muzzle push (step (2)) stays unbuilt and unread. (Was flipped to an asserted case at 058f2298dd.)
  it.fails('at 45 degrees along the wall: the runner never sinks below the original deepest stop, 7.75 u (LATER 711, W3)', () => {
    const grid = world();
    const t = wallSideTeammate(grid, 0);
    const m = new Walker(grid);
    expect(m.place(WALL - 50, 1, -40)).toBe(true);
    // Aim the runner at the teammate's spot: find the yaw by a probe on the same grid (no axis convention assumed).
    let best = EAST, bestErr = Infinity;
    for (let yaw = 180; yaw <= 360; yaw += 1) {
      const p = new Walker(grid); p.place(WALL - 50, 1, -40); p.state.yaw = yaw;
      for (let i = 0; i < 20; i++) p.tick(RUN);
      const ax = p.state.x - (WALL - 50), az = p.state.z + 40, bx = t.state.x - (WALL - 50), bz = t.state.z + 40;
      const err = Math.abs(Math.atan2(az, ax) - Math.atan2(bz, bx));
      if (err < bestErr) { bestErr = err; best = yaw; }
    }
    // Swept over the start: the same aim, the start moved 3 u either way in x and in z (a 3 x 3 grid), each pressed after
    // 0 or 1 still ticks. The fresh review's witness is in it (3 u back in z, one rest tick: min 3.54 u at the hub,
    // ending at (43.6, -3.5); 3 u along +x with none: 4.21), where the committed start alone reached 11.07.
    const sunk: string[] = [];
    for (const ox of [-3, 0, 3]) for (const oz of [-3, 0, 3]) for (const rest of [0, 1]) {
      const g2 = world();
      const mk = new Walker(g2);
      expect(mk.place(WALL - 50 + ox, 1, -40 + oz)).toBe(true);
      mk.state.yaw = best;
      for (let i = 0; i < rest; i++) mk.tick({ forward: 0, right: 0, boost: false });
      const r = runInto(mk, wallSideTeammate(g2, 0), 4);
      if (r.minSep < W3_DEEPEST) sunk.push(`(${ox}, ${oz}) rest ${rest}: ${r.minSep.toFixed(2)}`);
    }
    expect(sunk, `starts that sink under ${W3_DEEPEST}`).toEqual([]);
  });

  it('two bodies, the still one against the wall: whichever moves, the other is never displaced into the wall', () => {
    // The wall-side body is the mover this time: it runs along the wall into a still teammate standing off it.
    const grid = world();
    const m = wallSideTeammate(grid, -40);
    const t = new Walker(grid);
    expect(t.place(m.state.x, 1, 0)).toBe(true);
    for (let i = 0; i < 30; i++) t.tick(STILL);
    m.state.yaw = 180;                                              // facing along the wall; which way is found below
    const p = new Walker(grid); p.place(WALL - 30, 1, -40); p.state.yaw = 180;
    for (let i = 0; i < 20; i++) p.tick(RUN);
    if (p.state.z < -40) m.state.yaw = 0;                           // turn to face +z, toward the teammate
    const r = runInto(m, t, 3);
    expect(r.minSep, `min sep ${r.minSep}`).toBeGreaterThanOrEqual(CONTACT - RUN_TICK - 1e-6);
    expect(r.maxX).toBeLessThan(WALL);
    expect(r.tMoved).toBe(0);
  });
});
