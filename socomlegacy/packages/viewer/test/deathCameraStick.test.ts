// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import type { DeathCamera } from '../src/deathCamera';
import { FULL_AXIS, MAX_YAW_RATE, type LookState } from '../src/look';
import { packGround, type GroundData, type Walker } from '../src/mover';
import { PlayerCamera } from '../src/playerCamera';
import { WalkMode } from '../src/walk';

/**
 * DEATHCAM-MANUAL through the walk (`WalkMode`): while dead, the look's stick (`WalkCamera.lookState`, the camera's own)
 * feeds the death camera's state 7 (`./deathCamera`, `FUN_002980d0` D:L141595-141627, `FUN_00297a30` D:L141219-141221),
 * the body never turning (DEAD_LOOK_READING); the respawn's facing is the spawn's; a dead player's cycle back to his own
 * body is state 7 (`FUN_002980d0` D:L141378-141389). A spectator's follow and the benched dead player's teammate view
 * (`matchNet.ts`'s own `PlayerCamera`) carry no death camera and never orbit.
 */

const floor = (minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
});
const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [floor(-200, -200, 200, 200, 0)],
  [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }],
);
const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

/** A walk on a floor, spawned at (150, 0, 150) facing 20, with the look's state under the test's hand. */
function rig() {
  const fly = new FlyCamera(canvas());
  let look: Pick<LookState, 'turnRate' | 'axis'> = { turnRate: 0, axis: [0, 0] };
  const real = fly.lookState.bind(fly);
  fly.lookState = (): LookState => ({ ...real(), ...look });
  const mode = new WalkMode(fly, () => undefined);
  mode.setGround(GROUND, null);
  expect(mode.respawn([150, 0, 150], 20)).toBe(true);
  return {
    mode,
    setLook: (l: Pick<LookState, 'turnRate' | 'axis'>) => { look = l; },
    death: (): DeathCamera | null => (mode as unknown as { player: { death: DeathCamera | null } | null }).player?.death ?? null,
    walker: (): Walker => (mode as unknown as { walker: Walker }).walker,
  };
}

describe('DEATHCAM-MANUAL: the walk hands the look\'s stick to the death camera', () => {
  it('dead with the stick at rest: the death camera holds still and stays automatic (OT.R116)', () => {
    const r = rig();
    r.mode.setDead(true);
    for (let i = 0; i < 60; i++) r.mode.frame(1 / 60);
    expect(r.death()!.manual).toBe(false);
    expect(r.death()!.yaw).toBe(0);
  });

  it('dead with a full right push: state 7, the orbit turns at the living look\'s rate, the body\'s facing unchanged', () => {
    const r = rig();
    r.mode.setDead(true);
    const facing = r.walker().state.yaw;
    r.setLook({ turnRate: -MAX_YAW_RATE, axis: [FULL_AXIS, 0] });   // right: the look's turn is left positive
    for (let i = 0; i < 30; i++) r.mode.frame(1 / 60);
    const d = r.death()!;
    expect(d.manual).toBe(true);
    expect(d.yaw).toBeLessThan(0);
    expect(Math.abs(d.yaw)).toBeGreaterThan(0.5 * MAX_YAW_RATE * 0.8);
    expect(Math.abs(d.yaw)).toBeLessThan(0.5 * MAX_YAW_RATE * 1.2 + 1e-9);
    expect(r.walker().state.yaw).toBe(facing);                      // DEAD_LOOK_READING: the corpse does not turn
    r.setLook({ turnRate: 0, axis: [0, 0] });
    const held = d.yaw;
    for (let i = 0; i < 30; i++) r.mode.frame(1 / 60);
    expect(d.yaw).toBe(held);
  });

  it('the respawn: the death camera gone and the facing the spawn\'s, whatever the dead stick did', () => {
    const r = rig();
    r.mode.setDead(true);
    r.setLook({ turnRate: MAX_YAW_RATE, axis: [-FULL_AXIS, 0] });
    for (let i = 0; i < 60; i++) r.mode.frame(1 / 60);
    expect(r.death()!.manual).toBe(true);
    r.mode.setDead(false);
    r.setLook({ turnRate: 0, axis: [0, 0] });
    expect(r.mode.respawn([150, 0, 150], 90)).toBe(true);
    expect(r.death()).toBeNull();
    expect(r.walker().state.yaw).toBe(90);
    r.mode.setDead(true);
    expect(r.death()!.manual).toBe(false);                          // a new death: `FUN_00299150`'s reset, automatic again
  });

  it('a killer the page names after the stick took over leaves state 7 standing (only the reset leaves 7, D:L141657)', () => {
    const r = rig();
    r.mode.setDead(true);
    r.setLook({ turnRate: MAX_YAW_RATE, axis: [-FULL_AXIS, 0] });
    r.mode.frame(1 / 60);
    const cam = r.death()!;
    expect(cam.manual).toBe(true);
    r.mode.setDeathKiller(() => [0, 0, 0]);
    expect(r.death()).toBe(cam);
    expect(cam.killer).toBeNull();
  });

  it('a dead player\'s cycle back to his own body is state 7 (`FUN_002980d0` D:L141378-141389), the killer dropped', () => {
    const r = rig();
    r.mode.setDead(true);
    r.mode.setDeathKiller(() => [0, 0, 0]);
    expect(r.death()!.manual).toBe(false);
    r.mode.setMode('fly');                                          // the page's `leaveSelf`: a teammate's view
    expect(r.mode.resumeBody()).toBe(true);                         // the page's `returnSelf`
    expect(r.death()!.manual).toBe(true);
    expect(r.death()!.killer).toBeNull();
  });
});

describe('spectating, the benched teammate view and the replay viewer never orbit', () => {
  it('a followed body\'s camera (`matchNet.ts`\'s own `PlayerCamera`) has no death camera and stands behind the body every tick', () => {
    for (const ease of [false, true]) {
      const cam = new PlayerCamera(null);
      cam.ease = ease;
      expect(cam.death).toBeNull();
      cam.tick([0, 0, 0], 30, 0, 10, 1 / 60);
      const first = cam.view(1).eye;
      for (let i = 0; i < 180; i++) cam.tick([0, 0, 0], 30, 0, 10, 1 / 60);
      cam.view(1).eye.forEach((x, k) => expect(x).toBeCloseTo(first[k]!, 9));
      expect(cam.death).toBeNull();
    }
  });

  it('the follow camera\'s source never makes a death camera nor hands it a stick', () => {
    const src = readFileSync(resolve(import.meta.dirname, '../src/matchNet.ts'), 'utf8');
    expect(src).toMatch(/new PlayerCamera\(grid\)/);
    expect(src).not.toMatch(/\.death\s*=|newDeathCamera|deathStick/);
  });
});
