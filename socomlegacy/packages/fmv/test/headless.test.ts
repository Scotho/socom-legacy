import { describe, expect, it } from 'vitest';

// The package's own run has a test to find (vitest fails a project with none), and the boundary's runtime half:
// the index loads under Node with no DOM. The source half is tools/test/packageBoundaries.test.ts (W6.R2).
describe('@s2u/fmv loads headless', () => {
  it('imports under Node, where no DOM exists', async () => {
    expect('document' in globalThis).toBe(false);
    await expect(import('../src/index')).resolves.toBeDefined();
  });
});
