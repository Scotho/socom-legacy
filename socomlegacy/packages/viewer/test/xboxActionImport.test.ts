import { expect, it, vi } from 'vitest';

// The raw backend must be able to mount shared switch rules without loading the
// production GPU HUD. Its prompt function is the same hudLayout export.
vi.mock('../src/hud', () => { throw new Error('production GPU HUD reached from the raw switch adapter'); });

it('loads the shared switch page without constructing or importing the production HUD graph', async () => {
  const { ActionPage } = await import('../src/actionPage');
  const page = new ActionPage({ world: () => null, feet: () => null, aim: () => null, net: () => null });
  expect(page.prompt()).toBeNull(); expect(page.action()).toBe(false);
});
