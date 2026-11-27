// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { TICK, Walker, type WalkInput } from '../src/mover';
import { moveStick } from '../src/moveStick';
import { INTERP_DELAY_MS } from '../src/net/protocol';
import type { OtherBody } from '../src/pushApart';

/**
 * LATER 711 step (1): where the page and the room disagree (research 426 s9; the main controller's term (d), 2026-11-15).
 * The room slides a seat against the other seats where they are now; the page slides its own predicted body against the
 * other players' copies drawn `INTERP_DELAY_MS` behind (`NetClient.bodies`). Against a still body the two agree exactly;
 * against a moving one the page's stop differs from the room's by about the other's travel over the delay, and the room's
 * correction of the page's own body is that size. This measures it on the one `Walker`: the same commands, two bodies'
 * views. A browser consequence of the room's authority, not a value of the original's (whose consoles each slide
 * against their own lagging copies: research 426 s6).
 */

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 2000, cellsX: 4, cellsZ: 4, originX: -4000, originZ: -4000 };
const floor: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-4000, 0, 4000, 4000, 0, 4000, 4000, 0, -4000, -4000, 0, -4000]),
};
const owners: CollisionOwner[] = [{ modelName: floor.modelName, path: floor.path, first: 0, count: 1 }];
const GRID = buildGrid(params, [], [], [floor], owners);
const RUN: WalkInput = { forward: 1, right: 0, boost: false };
const WALK: WalkInput = { forward: moveStick(0, 0.5, 0.3)[1], right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const DELAY_TICKS = Math.round(INTERP_DELAY_MS / 1000 / TICK);

/**
 * M runs at T, T `40` ahead facing M with `tInput`; the room's M sees T now, the page's M sees T `DELAY_TICKS` ago. The
 * largest gap between the two M's over `seconds`.
 */
function divergence(tInput: WalkInput, seconds: number): number {
  const mk = (): Walker => { const w = new Walker(GRID); w.place(0, 20, 0); w.state.yaw = 0; return w; };
  const roomM = mk(), pageM = mk();
  const probe = mk();
  for (let i = 0; i < 30; i++) probe.tick(RUN);
  const n = Math.hypot(probe.state.x, probe.state.z), ux = probe.state.x / n, uz = probe.state.z / n;
  const t = new Walker(GRID); t.place(ux * 40, 20, uz * 40); t.state.yaw = 180;
  const history: OtherBody[] = [];
  const now = (): OtherBody => ({ x: t.state.x, y: t.state.y, z: t.state.z, stance: t.stance });
  roomM.bodies = () => [now()];
  pageM.bodies = () => [history[Math.max(0, history.length - 1 - DELAY_TICKS)] ?? now()];
  let most = 0;
  for (let k = 0; k < Math.round(seconds / TICK); k++) {
    history.push(now());
    roomM.tick(RUN); pageM.tick(RUN);
    t.tick(tInput);
    most = Math.max(most, Math.hypot(roomM.state.x - pageM.state.x, roomM.state.z - pageM.state.z));
  }
  return most;
}

describe('LATER 711: the page\'s own body against lagging copies, the room\'s against the bodies now', () => {
  it('against a still body the page and the room stop at the same place (no correction)', () => {
    expect(divergence(STILL, 0.8)).toBe(0);
  });

  it(`against a body walking at it, the page's stop differs from the room's by at most the walker's travel over ${INTERP_DELAY_MS} ms plus a tick of the runner's`, () => {
    const gap = divergence(WALK, 0.8);                           // the approach and the stop, before the walker (unslid here) would reach M
    // The walker's own speed, measured (the walk band, not 65 x the stick: the fresh review's finding 6).
    const w = new Walker(GRID); w.place(0, 20, 0); w.state.yaw = 0;
    for (let i = 0; i < 60; i++) w.tick(WALK);
    const walkSpeed = Math.hypot(w.state.vx, w.state.vz);
    expect(gap, `the correction ${gap.toFixed(2)} u`).toBeGreaterThan(0);
    expect(gap, `the correction ${gap.toFixed(2)} u`).toBeLessThanOrEqual(walkSpeed * INTERP_DELAY_MS / 1000 + 65 * TICK);
  });
});
