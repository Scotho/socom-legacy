import { describe, expect, it } from 'vitest';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import { GameLobbyCommands } from '../../src/screens/gameLobbyCommands';
import type { GameListEntry } from '../../src/screens/briefingRoomCommands';

/**
 * P537-L2 (product track, an adaptation: a developer's test server; nothing a public room does changes): GAME LOBBY's
 * BOTS buttons follow the server. With no word from it -- every public server, whose `/maps` answer carries no
 * `allCreateGameMaps` -- they are offered as on main: a respawn game on Frostfire or Vigilance (H314 extended
 * 2026-10-29, H315). Only a server that runs with `CREATE_GAME_ALL_MAPS=1` and says so (`allBotGames`, read from its
 * `/maps` answer by the viewer) has them offered on any disc map ("mp<n>") and in a classic game. There is no player
 * setting and no lobby option: the client never decides this itself.
 */

const statsOf = (mission: number): string => {
  const s = new Uint8Array(256);
  s[0] = 0x44; s[1] = 5; s[2] = 6; s[4] = 8; s[8] = mission;
  return [...s].map((x) => x.toString(16).padStart(2, '0')).join('');
};
const GAME: GameListEntry = {
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 24, gameLevel: 2, playerSkillLevel: 0, rulesSet: 1,
  genericField1: 1, genericField2: 65000, genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0,
  gameName: 'bots$~Alpha', gameStats: statsOf(2), endOfList: true,
};
const CASES = [[0, 2], [2, 2], [0, 51], [2, 51], [0, 7], [2, 7], [2, 83], [0, 0]] as const;
const offered = (commands: GameLobbyCommands) => CASES.flatMap(([rulesSet, mission]) => {
  commands.enterGameLobby({ ...GAME, rulesSet, gameStats: statsOf(mission) });
  return commands.botsOffered() ? [`${rulesSet & 2 ? 'respawn' : 'classic'} MP${mission}`] : [];
});

describe('P537-L2: the BOTS buttons widen only on the server\'s word', () => {
  it('default-off pin: no word, or the server saying false, offers main\'s two respawn maps alone', () => {
    expect(offered(new GameLobbyCommands({ uiVars: new UiVarManager(), valves: () => new ValveStore(), games: () => [] })))
      .toEqual(['respawn MP2', 'respawn MP51']);
    expect(offered(new GameLobbyCommands({ uiVars: new UiVarManager(), valves: () => new ValveStore(), games: () => [], allBotGames: () => false })))
      .toEqual(['respawn MP2', 'respawn MP51']);
  });

  it('a server running the switch: every disc map, either rules set; a game with no mission still none', () => {
    const commands = new GameLobbyCommands({ uiVars: new UiVarManager(), valves: () => new ValveStore(), games: () => [], allBotGames: () => true });
    expect(offered(commands)).toEqual(['classic MP2', 'respawn MP2', 'classic MP51', 'respawn MP51', 'classic MP7', 'respawn MP7', 'respawn MP83']);
  });
});
