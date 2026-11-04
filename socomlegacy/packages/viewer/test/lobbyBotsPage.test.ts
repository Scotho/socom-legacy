import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * H314 / H315 on the page (the area (c) review's finding 2): the front end's GAME LOBBY offers the BOTS buttons only as
 * `GameLobbyCommands.botsOffered` says -- a respawn game on Frostfire, the room's own gate -- never in every game. The
 * rule itself is `@s2u/ui`'s (`test/screens/lobbyBots.test.ts`); this pins that the page asks it.
 */
describe('the page\'s GAME LOBBY bots: offered by the game held (H314/H315)', () => {
  it('frontEnd.ts wraps the dialog lookup with the lobby\'s own answer, not a constant', () => {
    const src = readFileSync(new URL('../src/frontEnd.ts', import.meta.url), 'utf8');
    const lines = src.split('\n').filter((l) => l.includes('withLobbyBots(') && !l.includes('import'));
    expect(lines).toHaveLength(1);
    // The lobby is made after the opener: a dialog built before it offers nothing.
    expect(lines[0]).toContain('() => this.gameLobby?.commands.botsOffered() ?? false)');
    expect(lines[0]).not.toMatch(/\(\) => true\)/);
  });
});
