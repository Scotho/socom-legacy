// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { type WorldPoly } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { groundGrid, packGround, Walker } from '../src/mover';
import { WalkMode } from '../src/walk';

function ground(edited: boolean) {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'floor', region: 0, ditype: 3, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-190, 0, -190, 190, 0, -190, 190, 0, 190, -190, 0, 190]) };
  const wall: WorldPoly = { ...floor, path: 'wall', ditype: 2, points: Float32Array.from(edited
    ? [-100, 0, 80, 100, 0, 80, 100, 80, 80, -100, 80, 80]
    : [50, 0, -100, 50, 0, 100, 50, 80, 100, 50, 80, -100]) };
  return packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [floor, wall], [floor, wall].map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 })));
}

describe('edited ground replaces the walking collision caches', () => {
  it('re-entering Play with a translated/rotated wall discards the old walker and its warmed geometry', () => {
    // Forge startPlay composes a new hull and calls setGround with a new grid (forge/page.ts).
    // This tests that handoff, not the editor's UI or an unsupported mutation of a cached polygon normal.
    const camera = new FlyCamera(document.createElement('canvas'));
    const mode = new WalkMode(camera);
    const before = ground(false);
    camera.setPose({ x: 0, y: 20, z: 0 });
    mode.setGround(before, [0, 0, 0], groundGrid(before));
    expect(mode.setMode('walk')).toBe(true);
    const current = () => (mode as unknown as { walker: Walker }).walker;
    const crosses = (w: Walker, x: number, z: number) =>
      (w as unknown as { crosses(x0: number, z0: number, x1: number, z1: number): boolean }).crosses(0, 0, x, z);
    const original = current();
    expect(crosses(original, 60, 0)).toBe(true);
    expect(crosses(original, 0, 90)).toBe(false);
    mode.setMode('fly');
    const after = ground(true);
    camera.setPose({ x: 0, y: 20, z: 0 });
    mode.setGround(after, [0, 0, 0], groundGrid(after));
    expect(mode.setMode('walk')).toBe(true);
    expect(current()).not.toBe(original);
    expect(crosses(current(), 60, 0)).toBe(false);
    expect(crosses(current(), 0, 90)).toBe(true);
    mode.setMode('fly');
  });
});
