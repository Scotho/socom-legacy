// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { HELD_RIFLE } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { scopeEye, SCOPE_EYE_READING, toWorld } from '../src/cameraRig';
import { rootY } from '../src/mover';
import { headPoint, ShotCone, type AimMover } from '../src/net/shotCone';
import type { Command } from '../src/net/protocol';
import { groundPolygons, packGround, TICK, WalkMode, type Walker } from '../src/walk';
import { Traversal } from '../src/traversal';
import { GATE_PARAMS, gatePolys, type GateRow } from './helpers/gateTable';

/**
 * LATER 597, the eye's half (research 86 s6.1; reading, pending review, read at r0004 by a seat-kill key job): through
 * the dive the posture word `+0x174` is 6 (r0001 `FUN_0057e540` D:L440898), and `FUN_0029ae50`'s eye takes its prone
 * branch only for 2 (D:L142591) -- so through the dive the eye is the standing branch's: the root + 4.4
 * (`SCOPE_EYE_READING.lift`), 2.5 ahead -- not the prone one's 4.9 ahead. The port's walker is `prone` through the dive;
 * `Walker.aimProne` is the word 2 (`../src/net/lookGate` `aimPostureOf`). Held on the page's two eyes -- the placed
 * one (`WalkMode.fireAim`, `follow`) and the tick's (`WalkMode.tickAim`, `noteTick`, laid by `WalkMode.frame`), with the scope's head view on --
 * and on the room's (`headPoint` over an `AimFrame` whose optional `aimProne` the room sets from the walker; absent,
 * the posture alone, as before). Control: prone and still, the prone eye. No game data. Simulation track.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

const STILL = { forward: 0, right: 0, boost: false };
const FORWARD = { forward: 1, right: 0, boost: false };

function flatPage(): { m: WalkMode; w: Walker; t: Traversal } {
  const { polys, owners } = gatePolys({ world: [] } as unknown as GateRow);
  const m = new WalkMode(new FlyCamera(canvas()), () => undefined);
  made.push(m);
  m.setGround(packGround(GATE_PARAMS, polys, owners), null);
  m.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
  expect(m.respawn([0, 0, 0], 0)).toBe(true);
  m.walkFor(30 * TICK, STILL);
  m.setScoped(true);                                     // the view from the head: `follow`'s scopeEye branch
  return { m, w: m['walker'] as Walker, t: m.traversal() as unknown as Traversal };
}

/**
 * How far ahead of the feet (flat, along the facing) and how high over them an eye stands: the placed eye on the
 * interpolated feet `follow` stands it on (`Walker.tickFeet`), the tick's on the tick's own (`Walker.state`, `noteTick`).
 */
function eyeTerms(w: Walker, eye: readonly number[], at: 'placed' | 'tick' = 'placed'): { ahead: number; up: number } {
  const f = at === 'placed' ? w.tickFeet() : [w.state.x, w.state.y, w.state.z];
  return { ahead: Math.hypot(eye[0]! - f[0]!, eye[2]! - f[2]!), up: eye[1]! - f[1]! };
}

const STAND_AHEAD = Math.abs(SCOPE_EYE_READING.ahead);          // 2.5
const PRONE_AHEAD = Math.abs(SCOPE_EYE_READING.proneAhead);     // 4.9 on flat ground

describe('LATER 597: through the dive the page\'s eye is the standing branch (FUN_0029ae50 D:L142591)', () => {
  it('prone and still, not in a dive: the prone eye, 4.9 ahead (control)', () => {
    const { m, w } = flatPage();
    m.setStance('prone');
    m.walkFor(3, STILL);
    m.frame(TICK);                                                 // a frame's tick: `noteTick` lays the tick's eye
    expect(w.stance).toBe('prone');
    expect(w.aimProne).toBe(true);
    expect(eyeTerms(w, m.fireAim()!.eye).ahead).toBeCloseTo(PRONE_AHEAD, 3);
    expect(eyeTerms(w, m.tickAim(1)!.eye, 'tick').ahead).toBeCloseTo(PRONE_AHEAD, 3);
  });

  it('every tick of a dive: the placed eye and the tick\'s eye stand 2.5 ahead, the root + 4.4 high', () => {
    const { m, w, t } = flatPage();
    m.walkFor(1, FORWARD);                                         // up to speed
    m.setStance('prone');                                          // the dive (`setStance`'s TRAVERSAL SEAM)
    expect(t.inDive()).toBe(true);
    const off: string[] = [];
    let ticks = 0;
    for (let i = 0; i < 600 && t.inDive(); i++) {
      m.frame(TICK);                                               // the page's frame: its ticks' eyes (`noteTick`), then `follow`
      if (!t.inDive()) break;
      ticks++;
      expect(w.posture).toBe('prone');
      const root = (m['posedRoot'] as number | null) ?? t.rootY() ?? rootY(w.posture);
      const placed = eyeTerms(w, m.fireAim()!.eye), tick = eyeTerms(w, m.tickAim(1)!.eye, 'tick');
      if (Math.abs(placed.ahead - STAND_AHEAD) > 1e-3 || Math.abs(placed.up - (root + SCOPE_EYE_READING.lift)) > 1e-3) off.push(`placed ${i}: ${JSON.stringify(placed)} root ${root}`);
      if (Math.abs(tick.ahead - STAND_AHEAD) > 1e-3) off.push(`tick ${i}: ${JSON.stringify(tick)}`);
    }
    expect(ticks).toBeGreaterThan(5);
    expect(off).toEqual([]);
  });
});

describe('LATER 597: the room\'s eye (headPoint) through the dive', () => {
  const body = { feet: [10, 0, -3] as [number, number, number], yaw: 30, posture: 'prone' as const, moveRoot: 3, peek: 0 };

  it('posture prone with aimProne false (the dive): the standing branch on the same root', () => {
    expect(headPoint({ ...body, aimProne: false })).toEqual(toWorld(body.feet, body.yaw, scopeEye('stand', 3)));
  });

  it('aimProne true or absent: the prone branch, as before', () => {
    const prone = toWorld(body.feet, body.yaw, scopeEye('prone', 3));
    expect(headPoint({ ...body, aimProne: true })).toEqual(prone);
    expect(headPoint(body)).toEqual(prone);
  });

  it('the cone\'s frame carries the mover\'s aimProne; absent, absent', () => {
    const cmd = (seq: number): Command => ({ seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 });
    const mover: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'prone', moveRoot: null, peek: 0, weapon: 0 };
    const cone = new ShotCone(HELD_RIFLE);
    cone.tick(cmd(1), { ...mover, aimProne: false }, 1);
    expect(cone.latest()!.aimProne).toBe(false);
    expect(headPoint(cone.latest()!)).toEqual(toWorld([0, 0, 0], 0, scopeEye('stand', rootY('prone'))));
    cone.tick(cmd(2), mover, 2);
    expect(cone.latest()!.aimProne).toBeUndefined();
    expect(headPoint(cone.latest()!)).toEqual(toWorld([0, 0, 0], 0, scopeEye('prone', rootY('prone'))));
  });
});
