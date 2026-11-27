// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker, type WalkInput } from '../src/mover';

/**
 * LATER 873 (simulation track): a crouched SEAL's jump with the stick held, against the original. The capture (relay-2,
 * PC 2, r0004, M51 slot 5, read only, Mode C, 7 trials, every frame; `agent-mail/evidence/...l873-crouchjump`, sha
 * c5cb12bc; a capture of the original, unscored) -- crouched by a light Triangle (posture 1, action 18), the stick held
 * from 1 s before Square to +3.5 s:
 * - FULL stick (x3): the stance word +0x174 stays 1 (crouch) in every frame; the body plays the STANDING run (action 2)
 *   from the stick's first frame (the crouch run, `FUN_00584c60`: a stick of 0.838 or more stands and runs the standing
 *   blend), so the jump is the RUNNING jump (action 8, airborne), landing back into the run while the stick is held;
 *   let go, `Stand -> Crouch` (17) and the crouch (18). No get-up, no stance pop.
 * - HALF stick (x3): the crouch walk (20), the in-place `Jump` (178, never airborne), the crouch walk again; let go,
 *   the crouch (18) with no 17.
 * Asserted here on the port's walker (a unit test against the capture's sequence, not a scored capture).
 */

function flat(): Walker {
  const p: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-3000, 0, 3000, 3000, 0, 3000, 3000, 0, -3000, -3000, 0, -3000]) };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 2000, cellsX: 4, cellsZ: 4, originX: -4000, originZ: -4000 };
  const owners: CollisionOwner[] = [{ modelName: p.modelName, path: 'floor0', first: 0, count: 1 }];
  const w = new Walker(buildGrid(params, [], [], [p], owners));
  w.place(0, 1, 0);
  w.state.yaw = -90;
  w.stanceSeparate = true;
  w.changeStance('crouch');
  for (let i = 0; i < 90; i++) w.tick({ forward: 0, right: 0, boost: false });
  return w;
}

interface Seen { stances: Set<string>; airborne: boolean; actions: string[]; landedRun: boolean }

function crouchJump(push: number): { w: Walker; seen: Seen; release: string[] } {
  const w = flat();
  expect(w.stance).toBe('crouch');
  const held: WalkInput = { forward: push, right: 0, boost: false };
  const seen: Seen = { stances: new Set(), airborne: false, actions: [], landedRun: false };
  const note = (): void => {
    seen.stances.add(w.stance);
    if (w.airborne) seen.airborne = true;
    const a = w.action?.name ?? '';
    if (a && seen.actions.at(-1) !== a) seen.actions.push(a);
  };
  for (let i = 0; i < 60; i++) { w.tick(held); note(); }          // 1 s of stick before the jump
  w.jump();
  for (let i = 0; i < 210; i++) { w.tick(held); note(); }         // to +3.5 s
  seen.landedRun = !w.airborne && w.action === null;
  const release: string[] = [];
  for (let i = 0; i < 90; i++) {
    w.tick({ forward: 0, right: 0, boost: false });
    const a = w.action?.name ?? '';
    if (a && release.at(-1) !== a) release.push(a);
  }
  return { w, seen, release };
}

describe('LATER 873: a crouched jump with the stick held keeps the crouch (the original, 7 of 7 trials)', () => {
  it('full stick: the stance stays crouch, the running jump flies and lands into the run; let go, Stand -> Crouch', () => {
    const { w, seen, release } = crouchJump(1);
    expect([...seen.stances]).toEqual(['crouch']);                  // +0x174 = 1 in every frame
    expect(seen.airborne).toBe(true);                               // the running jump (action 8)
    expect(seen.actions).toContain('launch');
    expect(seen.landedRun).toBe(true);                              // back in the run while held: no clip on the body
    expect(release).toContain('standToCrouch');                     // 17 at the release
    expect(w.stance).toBe('crouch');
    expect(w.posture).toBe('crouch');                               // 18 at the end
  });
  it('half stick: the crouch walk, the in-place jump (never airborne), the crouch; let go, no Stand -> Crouch', () => {
    const { w, seen, release } = crouchJump(0.5);
    expect([...seen.stances]).toEqual(['crouch']);
    expect(seen.airborne).toBe(false);                              // 178, never airborne
    expect(seen.actions).toContain('jump');
    expect(release).not.toContain('standToCrouch');
    expect(w.posture).toBe('crouch');
  });
});
