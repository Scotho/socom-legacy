import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type WorldPoly } from '@s2u/scene';
import { Walker } from '../src/mover';

// Performance regression on the existing collision rules, not a different collision shape.
function fixture(moving = false) {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-190, 0, -190, 190, 0, -190, 190, 0, 190, -190, 0, 190]) };
  const points = Float32Array.from([50, 0, -100, 50, 0, 100, 90, 80, 100, 90, 80, -100]);
  let reads = 0;
  const wall: WorldPoly = { ...floor, path: 'wall', ditype: 2, get points() { reads++; return points; } };
  const owners: CollisionOwner[] = [floor, wall].map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
  if (moving) owners[1]!.sweep = { minX: 40, maxX: 100, minZ: -100, maxZ: 100 };
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [floor, wall], owners);
  const walker = new Walker(grid);
  walker.place(0, 0, 0);
  const probe = walker as unknown as { crosses(x0: number, z0: number, x1: number, z1: number): boolean };
  return { walker, probe, grid, points, reads: () => reads };
}

describe('exact wall footprints reused by the collision probes', () => {
  it('does not reread an unchanged static polygon for repeated checks at the same height', () => {
    const f = fixture();
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(true);
    const warmed = f.reads();
    for (let i = 0; i < 100; i++) expect(f.probe.crosses(0, 0, 55, 0)).toBe(true);
    expect(f.reads()).toBe(warmed);
  });

  it('uses the exact new height and rebuilds after a geometry revision', () => {
    const f = fixture();
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(true);
    f.walker.state.y = 10;
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(false);
    f.walker.state.y = 0;
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(true);
    for (let i = 0; i < f.points.length; i += 3) f.points[i]! += 30;
    f.grid.revision++;
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(false);
  });

  it('reads moving door geometry again even without a static-grid revision', () => {
    const f = fixture(true);
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(true);
    for (let i = 0; i < f.points.length; i += 3) f.points[i]! += 30;
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(false);
    for (let i = 0; i < f.points.length; i += 3) f.points[i]! -= 30;
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(true);
  });

  it('restores a human movement state after probes have warmed other heights and cells', () => {
    const f = fixture();
    f.walker.state.yaw = -90;
    const input = { forward: 1, right: 0, boost: false };
    const saved = f.walker.saveState();
    const states = Array.from({ length: 120 }, () => { f.walker.tick(input); return f.walker.saveState(); });
    expect(f.walker.state.x).toBeGreaterThan(10);
    expect(f.walker.state.x).toBeLessThan(60);
    f.walker.state.y = 10;
    for (const x of [-100, 0, 100]) for (const z of [-100, 0, 100]) f.probe.crosses(x, z, x + 55, z);
    f.walker.restoreState(saved);
    expect(f.walker.saveState()).toEqual(saved);
    for (const state of states) { f.walker.tick(input); expect(f.walker.saveState()).toEqual(state); }
    expect(Object.keys(saved)).not.toContain('nearByCell');
  });

  it('keeps crossing answers at a cell boundary, in both directions and on a revisit', () => {
    const f = fixture();
    for (const z of [-0.001, 0, 0.001, 99.999, 0]) {
      expect(f.probe.crosses(0, z, 99.999, z)).toBe(true);
      expect(f.probe.crosses(100, z, 0, z)).toBe(true);
      expect(f.probe.crosses(0, z, 30, z)).toBe(false);
    }
  });

  it('discards static footprints when navigation explicitly invalidates geometry', () => {
    const f = fixture();
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(true);
    for (let i = 0; i < f.points.length; i += 3) f.points[i]! += 30;
    f.walker.invalidateWallCache();
    expect(f.probe.crosses(0, 0, 55, 0)).toBe(false);
  });
});
