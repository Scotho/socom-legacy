import { describe, expect, it } from 'vitest';
import { buildGrid, type WorldPoly } from '@s2u/scene';
import { Walker } from '../src/mover';
import { Traversal } from '../src/traversal';

/** Regression investigation: FUN_00584c60 D:L444137-444174 chooses the crouch/run branch using
 * the saved input, normalizes a crouch walk, then calls FUN_005b56c0 (slope/water) before throttle.
 * Synthetic geometry isolates that order; it is not a capture of the original running. */
function climb(push: number, degrees: number, options: { right?: number; roof?: boolean; water?: number } = {}): Walker {
  const k = Math.tan(degrees * Math.PI / 180);
  const p: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/ramp', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 400 * k, -200, -200, 400 * k, -200]),
  };
  const polys = [p];
  if (options.roof) polys.push({ ...p, path: 'worldmodel/roof', ditype: 2,
    points: p.points.map((v, i) => i % 3 === 1 ? v + 15 : v) });
  if (options.water) polys.push({ ...p, path: 'worldmodel/water', material: 11,
    points: p.points.map((v, i) => i % 3 === 1 ? v + options.water! : v) });
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [], [], polys, polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1 })));
  const w = new Walker(grid);
  w.driver = new Traversal(grid, polys);
  expect(w.place(0, 180 * k, 20)).toBe(true);
  w.state.yaw = 0;
  w.stance = 'crouch';
  for (let i = 0; i < 120; i++) w.tick({ forward: push, right: options.right ?? 0, boost: false });
  expect(w.airborne).toBe(false);
  return w;
}

describe('crouch locomotion selects its branch before slope scaling', () => {
  it('full push on flat ground runs upright while keeping the selected crouch stance', () => {
    const w = climb(1, 0);
    expect(w.stance).toBe('crouch');
    expect(w.posture).toBe('stand');
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(65, 2);
  });
  it('full push up a 30-degree ramp stays upright and runs at the slope-adjusted speed', () => {
    const w = climb(1, 30);
    expect(w.headroom()).toBe(true);
    expect(w.stance).toBe('crouch');
    expect(w.posture).toBe('stand');
    expect(w.ground.state).toBe('stand');
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(65 * 0.75, 2);
  });
  it('partial push keeps crouch walk and applies the uphill factor after its normalization', () => {
    const w = climb(0.5, 30);
    expect(w.posture).toBe('crouch');
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(14 * 0.75, 2);
  });
  it('full push still crouches where a low ceiling prevents standing', () => {
    const w = climb(1, 30, { roof: true });
    expect(w.headroom()).toBe(false);
    expect(w.posture).toBe('crouch');
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(14 * 0.75, 2);
  });
  it('a small push above the raw deadzone still walks uphill', () => {
    const w = climb(0.035, 30);
    expect(w.ground.state).toBe('crouch');
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(14 * 0.75, 2);
  });
  it('an asymmetric diagonal keeps the raw forward class when uphill scaling changes the dominant axis', () => {
    const w = climb(0.4, 45, { right: 0.35 });
    expect(w.ground.cls).toBe(1);
    expect(w.state.vz).toBeLessThan(0);
    expect(w.state.vx).toBeCloseTo(0, 6);
  });
  it.each([[-0.5, 0], [0, 0.5]])('partial input (%s, %s) downhill or across the ramp retains flat crouch speed', (forward, right) => {
    const w = climb(forward, 30, { right });
    const flat = climb(forward, 0, { right });
    expect(w.posture).toBe('crouch');
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(Math.hypot(flat.state.vx, flat.state.vz), 2);
  });
  it.each([[1, 'stand', 52], [0.5, 'crouch', 11.2]] as const)('push %s in shallow water chooses %s before water scaling', (push, posture, speed) => {
    const w = climb(push, 0, { water: 4 });
    expect(w.stance).toBe('crouch');
    expect(w.posture).toBe(posture);
    expect(Math.hypot(w.state.vx, w.state.vz)).toBeCloseTo(speed, 2);
  });
  it('stopping returns to the selected crouch and an explicit stand still succeeds', () => {
    const w = climb(1, 30);
    const still = { forward: 0, right: 0, boost: false };
    for (let i = 0; i < 90; i++) w.tick(still);
    expect(w.stance).toBe('crouch');
    expect(w.posture).toBe('crouch');
    w.changeStance('stand');
    for (let i = 0; i < 90; i++) w.tick(still);
    expect(w.stance).toBe('stand');
    expect(w.posture).toBe('stand');
  });
});
