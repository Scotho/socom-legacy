// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { HELD_RIFLE } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { proneEyeTerms, scopeEye, toWorld } from '../src/cameraRig';
import { rootY } from '../src/mover';
import { headPoint, ShotCone, type AimMover } from '../src/net/shotCone';
import type { Command } from '../src/net/protocol';
import { packGround, TICK, WalkMode, type Walker } from '../src/walk';
import { GATE_PARAMS, gatePolys, type GateRow } from './helpers/gateTable';

/**
 * PRONE_EYE_LOOK (patches-contrib's reading; seat-kill's non-author re-read CONFIRMED WITH CORRECTIONS,
 * pilot/kill/keyjob-prone-eye-look-read.md; reading, pending review): `FUN_0029ae50`'s prone eye (r0001 D:L142591-142602,
 * r0004 0x29c4d0-0x29c594) rises over the root by `(max(6q, 0) + 1.8) x 2 / max(n_y, 0.5)`, q the camera's row 2 y --
 * minus the world forward's y, sin(look down) on a level actor: looking DOWN the eye rises, level or up the look's
 * share is 0 (the clamp is a branch on 6q). The port held q at 0 (`PRONE_EYE_LOOK_PLACEHOLDER`), right only level or up:
 * at the prone limit (-20 degrees, `tuning.ts` `proneAimPitch`) the eye stood 6 sin 20 x 2 = 4.10 too low. The original's
 * aim pick leaves from that eye (r0004 0x29b14c, r0001 D:L142025-142028), so the room's head (`headPoint`) takes it too.
 * The controller's ruling: page and room take the SAME command's pitch (the original's q is one camera update old --
 * LATER 1438, `PRONE_EYE_LOOK_READING`'s departure); the page's eye and the room's agree.
 */

const rad = (d: number): number => (d * Math.PI) / 180;
const DOWN = -20;                                                 // the prone pitch limit, looking down
const LOOK_RISE = 6 * Math.sin(rad(20)) * 2;                      // 4.1042 on flat ground

describe('PRONE_EYE_LOOK: the prone eye rises with a downward look', () => {
  it('flat: looking down 20 the eye is (6 sin 20 + 1.8) x 2 over the root; level and up, 3.6', () => {
    const root = 2.168;
    expect(scopeEye('prone', root, 0, proneEyeTerms(1, DOWN))[1]).toBeCloseTo(root + (6 * Math.sin(rad(20)) + 1.8) * 2, 9);
    expect(scopeEye('prone', root, 0, proneEyeTerms(1, 0))[1]).toBeCloseTo(root + 3.6, 9);
    expect(scopeEye('prone', root, 0, proneEyeTerms(1, 25))[1]).toBeCloseTo(root + 3.6, 9);   // up: the clamp
    expect(scopeEye('prone', root, 0, proneEyeTerms(1))).toEqual(scopeEye('prone', root));      // no pitch: level
  });

  it('on a 20-degree slope the look\'s share divides by n_y as the base does', () => {
    const n = Math.cos(rad(20)), root = 2.168;
    expect(scopeEye('prone', root, 0, proneEyeTerms(n, DOWN))[1]).toBeCloseTo(root + (6 * Math.sin(rad(20)) + 1.8) * 2 / n, 9);
  });

  it('standing reads no look term', () => {
    expect(scopeEye('stand', 11, 0, proneEyeTerms(1, DOWN))).toEqual(scopeEye('stand', 11));
  });

  it('the room\'s head (headPoint) takes the body\'s pitch: looking down, 4.10 higher than level', () => {
    const b = { feet: [10, 5, -3] as [number, number, number], yaw: 30, posture: 'prone' as const, moveRoot: null, peek: 0 };
    const level = headPoint({ ...b, pitch: 0 }), down = headPoint({ ...b, pitch: DOWN });
    expect(down[1] - level[1]).toBeCloseTo(LOOK_RISE, 6);
    expect(down).toEqual(toWorld(b.feet, b.yaw, scopeEye('prone', rootY('prone'), 0, proneEyeTerms(1, DOWN))));
  });

  it('the room\'s frame carries the command\'s pitch into its head', () => {
    const cmd = (seq: number, pitch: number): Command => ({ seq, forward: 0, right: 0, yaw: 0, pitch, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    const mover: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'prone', moveRoot: null, peek: 0, weapon: 0 };
    const cone = new ShotCone(HELD_RIFLE);
    cone.tick(cmd(1, DOWN), mover, 1);
    expect(headPoint(cone.latest()!)).toEqual(toWorld([0, 0, 0], 0, scopeEye('prone', rootY('prone'), 0, proneEyeTerms(1, DOWN))));
  });
});

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });
const STILL = { forward: 0, right: 0, boost: false };
const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
  return c;
};

describe('PRONE_EYE_LOOK: the page\'s eye and the room\'s agree, prone and looking down', () => {
  it('the page\'s head-view eye on the tick and the room\'s head over the page\'s start body are one point', () => {
    const { polys, owners } = gatePolys({ world: [] } as unknown as GateRow);
    const fly = new FlyCamera(canvas());
    const m = new WalkMode(fly, () => undefined);
    made.push(m);
    m.setGround(packGround(GATE_PARAMS, polys, owners), null);
    expect(m.respawn([0, 0, 0], 0)).toBe(true);
    m.setStance('prone');
    m.walkFor(3, STILL);
    m.setScoped(true);                                             // the view from the head (`follow`'s scopeEye branch)
    fly.setPose({ pitch: DOWN });
    m.walkFor(10 * TICK, STILL);
    m.frame(TICK);                                                 // `noteTick` lays the tick's eye
    const w = m['walker'] as Walker;
    expect(w.stance).toBe('prone');
    expect(w.state.pitch).toBeCloseTo(DOWN, 6);
    const body = m.startBody()!;
    expect(body.pitch).toBeCloseTo(DOWN, 6);
    const page = m.tickAim(1)!.eye, room = headPoint(body);
    expect(page[0]).toBeCloseTo(room[0], 6);
    expect(page[1]).toBeCloseTo(room[1], 6);
    expect(page[2]).toBeCloseTo(room[2], 6);
    // and it is the raised eye: 4.10 over the level eye the port placed before
    expect(room[1] - headPoint({ ...body, pitch: 0 })[1]).toBeCloseTo(LOOK_RISE / Math.max(w.floorNormal[1], 0.5), 5);
  });
});
