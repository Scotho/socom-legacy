// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, probeLiftOf, STEEP_FLOOR_CONTACT_READING, STEEP_FLOOR_CONTACT_PRONE_READING, Walker } from '../src/mover';

/**
 * R4P-107 (FEEL-M-PRONESLOPE; research 217 section 2.8; reading, pending review): r0004's near-vertical floor push
 * (`FUN_0054f330`'s twin, r4 0x554180-0x554354) has a PRONE block beside the standing / crouched one (r4 0x5542e0-
 * 0x554328): when the slide has not started (r0004 `+0x1344` 0; r0001 `+0x1340`) a prone body on a face steeper than `max_slope` takes the same
 * zeroes and the same contact record, with no `n_y` test and no facing test. The driver's push off the record
 * (`FUN_0054a6d0`, D:L414410-414469) then runs with the prone distance `max(7, |8 x the back axis . n|)` in place of the
 * standing 6 (D:L416578-416613). The port exempted prone (`slideOrMove`), so a prone body could lie on a face too steep
 * to stand on.
 *
 * Synthetic: a short steep band between two flat floors, along x -- the low floor y 0 for x <= -1, the face y = 4 (x + 1)
 * up to x 4 (y 20), the top floor y 20 beyond. The face's n = (-4, 1, 0) / sqrt(17) (n_y 0.2425): steeper than
 * `max_slope` (0.642788), so it slides, but over the standing block's `n_y` 0.1, so a standing body is NOT pushed (the
 * control). A body on the face at x 0 (y 4) pushed along -x lands on the low floor, as MP51-FLOOR-TRAP's body did.
 */
const K = 4;
const NX = -K / Math.hypot(K, 1);
function faceGround() {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const quad = (path: string, x0: number, y0: number, x1: number, y1: number): WorldPoly => ({
    modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x0, y0, -1000, x1, y1, -1000, x1, y1, 1000, x0, y0, 1000]),
  });
  const polys = [quad('worldmodel/low', -1000, 0, -1, 0), quad('worldmodel/face', -1, 0, 4, 4 * K + 4), quad('worldmodel/top', 4, 4 * K + 4, 1000, 4 * K + 4)];
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: polys.length }];
  return groundGrid(packGround(params, polys, owners));
}

function body(stance: 'stand' | 'prone', yaw: number): Walker {
  const w = new Walker(faceGround());
  expect(w.place(0, K + probeLiftOf(stance), 0)).toBe(true);
  w.stance = stance;
  w.state.yaw = yaw;
  return w;
}

/** One still tick from the face at x 0: the horizontal move along x (the face's normal is along -x). */
function oneTick(w: Walker): number {
  const x0 = w.state.x;
  w.tick({ forward: 0, right: 0, boost: false });
  expect(Math.abs(w.state.z)).toBeLessThan(1e-6);
  return w.state.x - x0;
}

describe('R4P-107: r0004 pushes a prone body off a face too steep to stand on', () => {
  it('re-review merge condition: mid-way up a tall face the prone body leaves the face within the game frame (held one frame, then pushed, takes off and falls)', () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const quad = (path: string, x0: number, y0: number, x1: number, y1: number): WorldPoly => ({
      modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([x0, y0, -1000, x1, y1, -1000, x1, y1, 1000, x0, y0, 1000]),
    });
    // a 200-tall face of the same slope (y = 4 (x + 25)), the body at y 100: 100 u of face below it
    const polys = [quad('worldmodel/low', -1000, 0, -25, 0), quad('worldmodel/tall', -25, 0, 25, 200), quad('worldmodel/top', 25, 200, 1000, 200)];
    const w = new Walker(groundGrid(packGround(params, polys, [{ modelName: 'worldmodel', path: 'worldmodel/tall0', first: 0, count: polys.length }])));
    expect(w.place(0, 100 + probeLiftOf('prone'), 0)).toBe(true);
    w.stance = 'prone';
    w.state.yaw = 0;                                                   // side on: the 7 floor
    const ys: number[] = [];
    for (let i = 0; i < 4; i++) { w.tick({ forward: 0, right: 0, boost: false }); ys.push(w.state.y); }
    // one push (7 x 0.7 along the normal), not two: the frame-end tick's move is the push alone
    expect(Math.abs(w.state.x - NX * STEEP_FLOOR_CONTACT_PRONE_READING.min * STEEP_FLOOR_CONTACT_READING.gain)).toBeLessThan(0.05);
    expect(w.airborne).toBe(true);                                        // off the face: taken off by the frame end's floor
    for (let i = 0; i < 12; i++) w.tick({ forward: 0, right: 0, boost: false });
    expect(w.state.y).toBeLessThan(ys[3]! - 1);                       // and falling
  });

  it('the prone distance is r0004\'s max(7, |8 x back . n|)', () => {
    expect(STEEP_FLOOR_CONTACT_PRONE_READING).toEqual({ min: 7, scale: 8 });
    expect(STEEP_FLOOR_CONTACT_READING.gain).toBe(0.7);
  });

  it('the control: standing on the face (n_y 0.24, over the standing block\'s 0.1) is not pushed', () => {
    expect(Math.abs(oneTick(body('stand', -90)))).toBeLessThan(1);
  });

  // back = (sin yaw, cos yaw); n_xz = (NX, 0): back . n = NX sin yaw.
  for (const [yaw, label] of [[90, 'facing down the face (|8 x back . n| 7.76 over the 7 floor)'], [-90, 'facing up it (the same 7.76)'], [0, 'side on (back . n 0: the 7 floor)']] as const) {
    it(`prone, ${label}: pushed downhill along the face's normal in one tick, with no n_y or facing test`, () => {
      const d = Math.max(STEEP_FLOOR_CONTACT_PRONE_READING.min, Math.abs(STEEP_FLOOR_CONTACT_PRONE_READING.scale * NX * Math.sin((yaw * Math.PI) / 180)));
      const expected = NX * d * STEEP_FLOOR_CONTACT_READING.gain;  // t ~ 0: the feet start on the plane
      const dx = oneTick(body('prone', yaw));
      expect(dx).toBeLessThan(-3);
      expect(Math.abs(dx - expected)).toBeLessThan(0.3);
    });
  }

  it('review F1: the distance takes |8 x back . n| (the fabs before the floor), so facing up and down the face push alike, side on less', () => {
    const up = oneTick(body('prone', 90)), down = oneTick(body('prone', -90)), side = oneTick(body('prone', 0));
    expect(Math.abs(up - down)).toBeLessThan(1e-6);
    expect(side).toBeGreaterThan(up + 0.3);                          // 7 x 0.7 along -x: less far than 7.76 x 0.7
  });
});
