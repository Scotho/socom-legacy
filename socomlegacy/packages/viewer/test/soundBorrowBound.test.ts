import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { borrowBanksMax } from '../src/soundData';

/**
 * PR #5's import (seat-forge, item B3; simulation track): the PR raised the most other maps' banks `borrowMissing` reads
 * from 6 to 16 for EVERY map, so a disc map's sounds could come from more borrowed banks than before. 16 is for a Forge
 * layout (`soundFromDisc` `surfacesIn`, which only the Forge passes and which names every material of its hull: the
 * Forge's owner's broken glass on Desert Glory); a disc map keeps six, as before the PR. A browser adaptation bounding
 * the reads (no original value either way).
 */
describe('PR #5 B3: sixteen borrowed banks only for a layout\'s own surfaces', () => {
  it('a disc map (no surfacesIn) reads at most six other banks; a layout with surfaces sixteen', () => {
    expect(borrowBanksMax(undefined)).toBe(6);
    expect(borrowBanksMax({ floors: ['GLASS'], all: ['GLASS'] })).toBe(16);
  });
  it('a layout with no surfaces of its own is a disc map\'s case', () => {
    expect(borrowBanksMax({ floors: [], all: [] })).toBe(6);
  });
  it('soundFromDisc hands borrowMissing the bound its surfacesIn gives (source text: no test reaches the disc read)', () => {
    const src = readFileSync(new URL('../src/soundData.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/borrowMissing\(source, banks, sets, new Set\(\[\.\.\.wanted, \.\.\.grenadeWanted\]\), archive, missing, borrowBanksMax\(surfacesIn\)\)/);
  });
});
