import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORGE_MATCHING_CLASS } from '../../src/forge/matchState';

/**
 * The modern UI lane's MU2-17 (MU2.R9, 2026-10-14): the overlay over the forge reads the forge page's body class
 * `is-matching` as "a forge match is running" and locks what the game's pages lock in a round. The class is a contract
 * between the lanes: one exported constant, and the page sets and clears it through that constant only.
 */
const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/page.ts'), 'utf8');

describe('FORGE: the body class a forge match sets (the overlay\'s contract)', () => {
  it('is is-matching, exported once', () => {
    expect(FORGE_MATCHING_CLASS).toBe('is-matching');
  });
  it('the page names it only through the constant', () => {
    expect(page).not.toMatch(/['"]is-matching['"]/);
    expect(page.match(/classList\.(add|remove)\(FORGE_MATCHING_CLASS\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
  // LATER 92: both matches -- the Play match and the lobby's -- set the class the overlay reads, and the one frame both
  // run reads the exit chord through its constant (`../../src/forge/pad` `FORGE_MATCH_EXIT_CHORD`), which the overlay's
  // rule reads too (a hold, never a press, on the chord's buttons in the match).
  it('LATER 92: the Play match and the lobby\'s both set it; the frame reads the exit chord through its constant', () => {
    expect(page).toMatch(/const startMatch = async[\s\S]*?classList\.add\(FORGE_MATCHING_CLASS\)[\s\S]*?const launchLobbyMatch = async/);
    expect(page).toMatch(/const launchLobbyMatch = async[\s\S]*?classList\.add\(FORGE_MATCHING_CLASS\)/);
    expect(page).toMatch(/FORGE_MATCH_EXIT_CHORD\.every\(/);
    expect(page).not.toMatch(/buttons\[8\]\?\.pressed && !!p\?\.buttons\[9\]/);
  });
});
