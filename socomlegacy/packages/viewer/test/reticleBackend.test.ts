import { expect, it, vi } from 'vitest';

vi.mock('three/webgpu', () => { throw new Error('Reticle layout must not load the old GPU backend'); });
vi.mock('three/tsl', () => { throw new Error('Reticle layout must not load node materials'); });

it('shares the original reticle layout without loading TSL or WebGPU', async () => {
  const { reticleLayout } = await import('../src/reticle');
  expect(reticleLayout({ width: 640, height: 448 }, [0.5, 0.5], 12).quads).toHaveLength(5);
});

it('retains the preceding drawn set when the requested firearm textures are missing', async () => {
  const { Reticle, RETICLE_SETS } = await import('../src/reticle');
  const { reticleDrawSet, reticleTextures } = await import('../src/xboxPrototype/reticleFrame');
  const bitmap = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  const shotgun = RETICLE_SETS[2]!;
  const bitmaps = { fixed: bitmap, floating: bitmap, accuracy: null,
    sets: { [shotgun.fixed]: bitmap, [shotgun.floating!]: bitmap } };
  const current = new Reticle();
  try {
    current.setBitmaps(bitmaps); current.setSet(2);
    const sizes = reticleTextures(bitmaps), drawn = reticleDrawSet(2, 1, sizes);
    expect(drawn).toBe(current.currentSet());
    expect(current.setSet(0)).toBe(false);
    expect(reticleDrawSet(0, drawn, sizes)).toBe(current.currentSet());
    expect(current.currentSet()).toBe(2);
  } finally { current.setBitmaps(null); }
});
