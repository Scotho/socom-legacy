import { expect, test } from '@playwright/test';
import type { probeXboxParticles } from './xboxParticlesScene';

test('raw particles preserve existing shading and release their bounded graphics payload', async ({ page }, info) => {
  await page.route('/__xbox-particles', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__xbox-particles');
  const report = await page.evaluate(async () => {
    const path = '/e2e/xboxParticlesScene.ts';
    const probe = await import(/* @vite-ignore */ path) as { probeXboxParticles: typeof probeXboxParticles };
    return probe.probeXboxParticles();
  });
  await info.attach('particle-comparison', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(report.results).toHaveLength(60);
  for (const result of report.results) {
    // MP64-CREATURES (agent/next 3aa3c9bda1; research 89 section 22): the standard engine now applies the texture's GS
    // alpha test (`TEST.ATE`, AREF 64: 0.5) to a particle, as the original draws it (`FUN_003251b0`), so a CUTOUT particle's
    // alpha-below-0.5 texels are discarded there and no longer drawn. The frozen lightweight engine
    // (`src/xboxPrototype/rawParticles.ts`) still ignores the alpha test -- the named known gap on the owner's queue -- so on
    // the cutout case the two INTENDEDLY differ (the probe's textures carry alpha-64 texels, below the test); every other
    // particle type (untextured, source, additive, destination) must still match pixel for pixel.
    if (result.blend === 'cutout') expect(result.differences, `cutout: the standard engine's alpha test, the lightweight's known gap -- ${JSON.stringify(result)}`).toBeGreaterThan(0);
    else expect(result.differences, JSON.stringify(result)).toBe(0);
    expect(result.changed, JSON.stringify(result)).toBeGreaterThan(0);
    expect(result.stats.particles).toBeGreaterThan(0); expect(result.stats.buffers).toBe(2);
    expect(result.hiddenDraws).toBe(0); expect(result.transformed).toBe(true);
    expect(result.graphicsError).toBe(0);
    expect(result.releasedToBufferBytes).toBe(true); expect(result.texturesAfterClear).toBe(0);
  }
  expect(report.refused).toBe(true); expect(report.refusedBudget).toBe(0);
  expect(report.textureRefusal).toEqual({ refused: true, retainedBuffersOnly: true, released: 0 });
  expect(report.released).toBe(0); expect(report.remainingStaging).toBe(0);
});
