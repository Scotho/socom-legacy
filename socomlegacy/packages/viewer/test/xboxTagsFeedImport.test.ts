import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

// XBOX-TAGS-FEED (OT.R148; product track): the fork's tags reuse the standard `../src/hudTags`, so that module must load
// without the production GPU HUD (`../src/hud`), as `xboxActionImport.test.ts` holds for the switch rules.
vi.mock('../src/hud', () => { throw new Error('production GPU HUD reached from the shared tag builder'); });

it('the shared tag builder loads without importing the production HUD graph', async () => {
  const { teamTags } = await import('../src/hudTags');
  expect(typeof teamTags).toBe('function');
}, 30_000);                                                      // the import graph takes ~4 s cold; 5 s flaked under load

it("the lightweight loader hands the session's game variables to the walking runtime (TEAMMATE NAMES reaches the fork)", () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/xboxPrototype/matchLoader.ts'), 'utf8');
  const mount = src.slice(src.indexOf('runtime = mountWalking('), src.indexOf('sound = walkingSound('));
  expect(mount).toContain('gameVars: o.gameVars');
});
