import { expect, it, vi } from 'vitest';

vi.mock('three/webgpu', () => { throw new Error('HUD layout must not load a GPU backend'); });
vi.mock('three/tsl', () => { throw new Error('HUD layout must not load node materials'); });

it('lays out the original compass and health without importing a graphics backend', async () => {
  const { hudPass, DEFAULT_MODEL, AT_REST } = await import('../src/hudLayout');
  expect((await import('../src/hudState')).HudState).toBeTypeOf('function');
  const sizes = { 'compass_lo.tif': { width: 64, height: 64 }, 'white': { width: 1, height: 1 } };
  const result = hudPass({ width: 640, height: 448 }, { ...DEFAULT_MODEL, yaw: 90, health: 0.5 }, sizes, AT_REST, false, null);
  expect(result.quads.some(q => q.texture === 'compass_lo.tif')).toBe(true);
  expect(result.quads.every(q => [q.x, q.y, q.w, q.h, ...q.rgba].every(Number.isFinite))).toBe(true);
});
