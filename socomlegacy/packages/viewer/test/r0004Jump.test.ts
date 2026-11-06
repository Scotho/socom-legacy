import { describe, expect, it } from 'vitest';
import { buildGrid, SEAL_TUNING, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker, type Stance, type WalkInput } from '../src/walk';
import { JUMP_CONTACT_PROVEN, RUNNING_JUMP_SPEED } from '../src/mover';
import { airBands } from '../src/locomotion';

/**
 * R4B-12 (segment-body-2 G3; research 385; r0004 the specification, OT.R97): r0004's jump and wall slide, each item read
 * at its r4 address in the PINE dump and the served decrypt (R4B.R4), reading, pending review. No disc: synthetic
 * floors. P2 (the standing jump's forward-only air control) is rejected by the owner's OT.R108 and not built. The room's half (no SEAL as the stored contact) is central `roomR0004Jump.test.ts`.
 */

function floor(minX: number, minZ: number, maxX: number, maxZ: number, y: number): WorldPoly {
  return {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ]),
  };
}
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}
const plain = (): Grid => world([floor(-200, -200, 200, 200, 0)]);
const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const stick = (forward: number, right: number): WalkInput => ({ forward, right, boost: false });

/** A walker at rest at the origin facing -z, the standing jump started, then `n` ticks of `input`. */
function standingJump(input: WalkInput, stance: Stance = 'stand', n = 30): Walker {
  const w = new Walker(plain());
  w.place(0, 0, 0);
  w.state.yaw = 0;
  w.stance = stance;
  expect(w.jump()).toBe(true);
  expect(w.action?.name).toBe('jump');
  for (let i = 0; i < n; i++) w.tick(input);
  return w;
}

/** The walker's velocity in its own frame: forward along the facing, right across it (`camera.ts`'s axes). */
function local(w: Walker): { forward: number; right: number } {
  const yaw = (w.state.yaw * Math.PI) / 180;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return { forward: w.state.vx * fx + w.state.vz * fz, right: w.state.vx * rx + w.state.vz * rz };
}

/**
 * OT.R108 (the owner, 2026-11-06, verbatim: "EXECUTIVE RULING: we are LEAVING the in air movement in, this is a known
 * rejection of that r0004 segment."): R4B-12 P2 (r4 0x57fcb8-0x57fd54: r0004's standing jump tests the forward axis
 * alone and writes no lateral; research 385 s2) stands as the reading, and the port does not apply it. The standing
 * jump keeps the air control it had before G3, r0001's (`FUN_0057a330` D:L438955-438985): each axis at its set's top
 * (`FUN_0058bb50` / `FUN_0058bc00`, `airBands`), both ramped by `FUN_00586c10`.
 */
describe('OT.R108: the standing jump keeps its sideways air control (R4B-12 P2 rejected; r0001 FUN_0057a330 D:L438955-438985)', () => {
  it('a sideways stick alone drives the SEAL at the side sets\' top', () => {
    const b = airBands('stand', null), c = airBands('crouch', null);
    for (const right of [1, -1]) {
      const w = standingJump(stick(0, right));
      expect(local(w).forward, `right ${right}`).toBeCloseTo(0, 9);
      expect(local(w).right, `right ${right}`).toBeCloseTo(right > 0 ? b.right : -b.left, 6);
    }
    expect(local(standingJump(stick(0, 1), 'crouch')).right).toBeCloseTo(c.right, 6);
  });

  it('a diagonal stick drives both axes, each at its set\'s top, no renormalisation', () => {
    const b = airBands('stand', null);
    const fwd = standingJump(stick(Math.SQRT1_2, Math.SQRT1_2));
    expect(local(fwd).right).toBeCloseTo(Math.SQRT1_2 * b.right, 6);
    expect(local(fwd).forward).toBeCloseTo(Math.SQRT1_2 * b.forward, 6);
    const back = standingJump(stick(-1, -1));
    expect(local(back).right).toBeCloseTo(-b.left, 6);
    expect(local(back).forward).toBeCloseTo(-b.back, 6);
  });

  it('the lateral stick is ramped there, as the forward is (FUN_00586c10)', () => {
    // At 0.5 the stick sits under the right axis' snap (0.78), so the ramp is still climbing after one tick.
    const w = standingJump(stick(1, 0.5), 'stand', 1);
    expect(w.state.stickRight).toBeGreaterThan(0);
    expect(w.state.stickRight).toBeLessThan(0.5);
  });
});

describe('R4B-12 P1, P4: the jump\'s speed test (r4 0x583634-0x583694), cited here', () => {
  it('P1: no wall-contact test -- 15 a second or more is always the running jump (JUMP_CONTACT_PROVEN, r4 0x583694)', () => {
    expect(JUMP_CONTACT_PROVEN).toBe('none');
    expect(RUNNING_JUMP_SPEED).toBe(15);
  });

  it('P4: a jump pressed while turning in place is the standing jump, its height the actor\'s (no root-delta velocity in the port)', () => {
    const w = new Walker(plain());
    w.place(0, 0, 0);
    w.turn = SEAL_TUNING.turnMaxRate;                              // a full turn: the turn step's play (`+0x105f` bit 0x4)
    for (let i = 0; i < 20; i++) w.tick(STILL);
    expect(Math.hypot(w.state.vx, w.state.vz, w.state.vy)).toBe(0);
    expect(w.jump()).toBe(true);
    expect(w.action?.name).toBe('jump');
    for (let i = 0; i < 20; i++) {
      w.tick(STILL);
      expect(w.airborne).toBe(false);
      expect(w.state.y).toBe(0);
    }
  });
});
