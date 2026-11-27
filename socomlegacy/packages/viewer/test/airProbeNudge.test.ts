// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { packGround, TICK, type Walker } from '../src/mover';
import { WalkMode } from '../src/walk';

/**
 * LATER 890 (V21-V). Product track, an adaptation: the room's correction of the page's prediction (`NetClient`'s
 * `reconcile` -> `WalkMode.nudge`; `SNAP_DISTANCE`, `CORRECTION_FLOOR`: a page policy with no original) is the port's
 * own netcode under OT.R27, not a rule of the original's mover. What it must not do is break the mover's own rule.
 *
 * AIR-PROBE (`AIR_FLOOR_PROBE_READING` 'frame-end', research 399): a frame-end floor probe with no candidate puts the
 * body's x/z back at the last hit (`airHit`, the original's `+0x400..+0x408`; `FUN_005b0420` D:L467091-467103). A
 * correction moves the whole body, so the last hit is moved with it: `nudge` shifted the state and the kept movers
 * (PAR-37) but left `airHit` where the uncorrected prediction had it, and a correction snapped in flight followed by a
 * frame-end miss put the page back at the pre-correction column -- one more snap at the next snapshot. Red on the base.
 */

const quad = (pts: number[], ditype: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
});

/** `airFloorProbe.test.ts`'s strip: a floor at y 0 to z 0, none over z (0, 0.8), the floor again from z 0.8. */
const GAP = 0.8;
const POLYS: WorldPoly[] = [
  quad([-200, 0, 0, 200, 0, 0, 200, 0, -200, -200, 0, -200], 3, 'worldmodel/near'),
  quad([-200, 0, GAP, 200, 0, GAP, 200, 0, 200, -200, 0, 200], 3, 'worldmodel/far'),
];
const OWNERS: CollisionOwner[] = POLYS.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };

const STILL = { forward: 0, right: 0, boost: false };
const CARRIED = 65;                                             // the standing run's top speed, units a second

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  return c;
};
const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

/** A match's page (a net tap set) over the strip, its walker airborne at (0, 0, `z0`), carried at 65 along +z, 60 up. */
function page(z0: number): { m: WalkMode; w: Walker } {
  const fly = new FlyCamera(canvas());
  fly.setScale(0.1);
  const m = new WalkMode(fly, () => undefined);
  made.push(m);
  m.setGround(packGround(PARAMS, POLYS, OWNERS), null);
  m.setNetTap(() => undefined);
  expect(m.respawn([0, 0, z0], 0)).toBe(true);
  const w = (m as unknown as { walker: Walker }).walker;
  Object.assign(w.state, { x: 0, y: 0, z: z0, vx: 0, vz: CARRIED });
  w.setAirborne(true, 60);
  return { m, w };
}

describe('LATER 890: a correction in flight moves the airborne probe\'s last hit with the body (synthetic, no game data)', () => {
  // As `airFloorProbe.test.ts`'s first-frame case: from z0 -2.85 the flight's first frame ends on its 3rd tick at
  // z0 + 3.25 = 0.4, in the strip, so that frame's end is put back at the last hit -- the take-off point.
  const z0 = -2.85;

  it('RED: a snapped correction on the first tick, then the frame-end miss: x/z go back to the corrected take-off, not the pre-correction column', () => {
    const { m, w } = page(z0);
    const dx = 30;                                               // past `SNAP_DISTANCE` (24): the client snaps it
    w.tick(STILL);
    m.nudge(dx, 0, 0);
    expect(w.state.x).toBe(dx);
    w.tick(STILL);
    w.tick(STILL);                                               // the frame's end: the probe at (dx, 0.4) misses
    expect(w.airborne).toBe(true);
    expect(w.state.z).toBe(z0);                                  // put back, as without the correction
    expect(w.state.x).toBe(dx);                                  // at the corrected column (the base: 0, the uncorrected)
  });

  it('RED: a correction along the flight that keeps the frame end in the strip: put back at the take-off moved by it', () => {
    const { m, w } = page(z0);
    const dz = 0.3;                                              // the frame's end at 0.4 + 0.3 = 0.7: still in the strip
    w.tick(STILL);
    m.nudge(0, 0, dz);
    w.tick(STILL);
    w.tick(STILL);
    expect(w.airborne).toBe(true);
    expect(w.state.x).toBe(0);
    expect(w.state.z).toBeCloseTo(z0 + dz, 9);                   // the base: z0, the uncorrected take-off
  });

  it('RED (review F1): a re-run from a command kept in flight lays the correction since on the last hit too, not on the body alone', () => {
    // `rerunFrom` lays the mover back to the state kept after command S -- its last hit as it stood then -- and adds the
    // corrections nudged since (`KeptCommand.shift`) to the body. A knock laid at S (`knock(k, S)`, the room's blast
    // heard late) is one such re-run; in the air it writes no last hit (`FUN_0057e770` D:L440990-441080, AIR-PROBE's
    // review F2), so the put-back after it must be at the kept last hit moved by the same correction.
    const z1 = -0.7;                                             // the 1st tick at z1 + 65/60 = 0.383: over the strip
    const { m, w } = page(z1);
    const dx = 30;
    m.frame(TICK);                                               // command 1, kept in flight over the strip
    const s = m.nextCommand() - 1;
    m.nudge(dx, 0, 0);                                           // the room's snapped correction, laid on kept command 1 too
    m.frame(TICK);                                               // command 2
    expect(w.airborne).toBe(true);
    expect(m.knock({ velocity: [0, 0, 0], fall: 'fallForward' }, s)).toBe(true);   // replayed from command 1
    expect(w.state.x).toBe(dx);
    let back: { x: number; z: number } | null = null;
    for (let i = 0; i < 8 && w.airborne && back === null; i++) {
      m.frame(TICK);
      if (w.state.z === z1) back = { x: w.state.x, z: w.state.z };   // the frame end over the strip: put back
    }
    expect(back).not.toBeNull();
    expect(back!.x).toBe(dx);                                    // the head before F1: 0, the uncorrected column
  });
});
