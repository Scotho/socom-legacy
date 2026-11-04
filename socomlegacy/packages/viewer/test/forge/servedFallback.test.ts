import { describe, expect, it } from 'vitest';
import { servedTreeFallsBackToDisc } from '../../src/forge/servedFallback';

/**
 * FORGE (a browser adaptation, no original): a development build reads the served tree, but a fresh clone has none
 * (`npm run extract-maps` writes it from a disc), so the forge opened an empty floor with the player's disc loaded --
 * the owner's smoke test of the public repository, 2026-11-04. With nothing listed there, the forge reads the disc.
 */
describe('the served tree falls back to the disc', () => {
  it('when a development build lists no maps in the served tree', () => {
    expect(servedTreeFallsBackToDisc({ dev: true, readsDisc: false, listFailed: true, listed: 0 })).toBe(true);
    expect(servedTreeFallsBackToDisc({ dev: true, readsDisc: false, listFailed: false, listed: 0 })).toBe(true);
  });
  it('never when the served tree lists maps (a contributor who extracted them keeps today\'s start)', () => {
    expect(servedTreeFallsBackToDisc({ dev: true, readsDisc: false, listFailed: false, listed: 12 })).toBe(false);
  });
  it('never when the disc is already the source (a release, or ?disc)', () => {
    expect(servedTreeFallsBackToDisc({ dev: true, readsDisc: true, listFailed: true, listed: 0 })).toBe(false);
    expect(servedTreeFallsBackToDisc({ dev: false, readsDisc: true, listFailed: false, listed: 0 })).toBe(false);
  });
});
