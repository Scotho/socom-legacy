// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { resolveConfig } from 'vite';

it('keeps the experiment out of the release build and in its own test output', async () => {
  const normal = await resolveConfig({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)), logLevel: 'silent' }, 'build');
  expect(Object.values(normal.build.rollupOptions.input ?? {})).not.toContainEqual(expect.stringContaining('xbox-renderer'));
  const experiment = await resolveConfig({ configFile: fileURLToPath(new URL('../vite.xbox.config.ts', import.meta.url)), logLevel: 'silent' }, 'build');
  expect(Object.values(experiment.build.rollupOptions.input ?? {})).toEqual([expect.stringMatching(/xbox-renderer[/\\]index.html$/)]);
  expect(experiment.build.outDir).not.toBe(normal.build.outDir);
  expect(experiment.build.copyPublicDir).toBe(false);
});
