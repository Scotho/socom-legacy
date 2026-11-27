import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker } from '../../viewer/src/mover';
import { MoverSim } from '../../viewer/src/net/moverSim';
import { Button, type Command } from '../../viewer/src/net/protocol';
import { applyFall, fallDamageFraction, freshHealth } from '../../viewer/src/net/damage';

/**
 * FLE-1's test 7 (the fall-leave-edge plan): the ROOM's loss on the three ledges of the rig's whole-step walk-offs (q29,
 * MP12; a capture of the original by walk-off, pending review; research 151 s9.3). The room runs the commands through
 * `MoverSim` (`apply`: `prepare`, then the walker's tick), takes the walker's landing and lays `applyFall` on a fresh
 * body, as `room.ts`'s fall damage does. The walk-off is the crouched full-stick run, 25 u back from the edge.
 * - 63.48 u: x 0.856 and 69.64 u: x 0.738 -- RED before FLE-1, green with it (the late landing; the pose step).
 * - 99.61 u: x 0.268 -- RED UNTIL FLE-2 (named; the plan's gate): the test's lower floor stands at the REST height, 0.8
 *   under the original's bare floor (43.375 against 42.575 measured: l-fle2-soil, -0.800 on grass), so the body crosses
 *   it a frame later (K 28 against the original's 27). Its green before FLE-1 was two errors cancelling.
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
function floorPoly(y: number, z0: number, z1: number, material = 25): WorldPoly {
  return { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, y, z1, 1000, y, z1, 1000, y, z0, -1000, y, z0]) };
}
/** FLE-2: the lower floor's soil, GRASS (-0.8), and its bare height over the rest height 0. */
const LOWER_SOIL = 4, LOWER_BARE = 0.8;
function facePoly(h: number): WorldPoly {
  return { modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([1000, 0, 0, -1000, 0, 0, -1000, h, 0, 1000, h, 0]) };
}

/** The room's walk-off: commands only, through MoverSim. Returns the landing's fraction lost and whether the body died. */
function roomWalkOff(h: number): { speed: number; factor: number; dead: boolean } {
  // FLE-2 (the plan's "ledge tests' geometry, stated"): the TOP at the captured root height on a no-offset soil (25:
  // the climb's lookup gives 0); the LOWER floor at its BARE height, the rest height 0 plus 0.8, on GRASS (hull material
  // 4, -0.8): the rig's +0x404 43.375 under the body that rests at 42.575 (research 151 s9.3; l-fle2-soil).
  const polys = [floorPoly(h, 0, 1000), floorPoly(LOWER_BARE, -1000, 0, LOWER_SOIL), facePoly(h)];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const w = new Walker(buildGrid(PARAMS, [], [], polys, owners));
  expect(w.place(0, h + 20, 25)).toBe(true);
  w.settle();
  const sim = new MoverSim(w, null);
  let seq = 0;
  const cmd = (forward: number, buttons = 0): Command => ({ seq: ++seq, forward, right: 0, yaw: 0, pitch: 0, turn: 0, buttons, stance: 1, weapon: 0 });
  sim.apply(cmd(0, Button.Stance));                              // the crouch press (`Button.Stance`, code 1)
  for (let i = 0; i < 3 * 60; i++) sim.apply(cmd(0));            // its clip run out
  expect(w.stance).toBe('crouch');
  for (let i = 0; i < 20 * 60 && !w.airborne; i++) sim.apply(cmd(1));
  expect(w.airborne, `${h} u: left the edge`).toBe(true);
  for (let i = 0; i < 20 * 60 && w.airborne; i++) sim.apply(cmd(1));
  expect(w.airborne, `${h} u: landed`).toBe(false);
  const speed = w.landing!.speed;
  const health = freshHealth();
  const dead = applyFall(health, speed);
  return { speed, factor: 1 - fallDamageFraction(speed), dead };
}

describe('FLE-1 test 7: the room\'s loss on the rig\'s three ledges (MoverSim + applyFall; q29 MP12 walk-offs, pending review)', () => {
  it.each([
    { h: 63.4758, factor: 0.856 },
    { h: 69.6398, factor: 0.738 },
  ])('$h u: every health x $factor', ({ h, factor }) => {
    const r = roomWalkOff(h);
    expect(Math.abs(r.factor - factor), `factor ${r.factor} at ${r.speed}`).toBeLessThanOrEqual(0.01);
    expect(r.dead).toBe(false);
  });
  // RED UNTIL FLE-2 (the plan's gate, named): the lower floor at the rest height, 0.8 under the original's bare floor.
  it('99.6125 u: every health x 0.268 (RED until FLE-2: the soil offset)', () => {
    const r = roomWalkOff(99.6125);
    expect(Math.abs(r.factor - 0.268), `factor ${r.factor} at ${r.speed}`).toBeLessThanOrEqual(0.01);
  });
});
