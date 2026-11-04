import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import type { GameListEntry } from '../../src/screens/briefingRoomCommands';
import { clanField, type CreatedGame } from '../../src/screens/createGameCommands';
import {
  CLOSED_CLAN_GAME_TEXT, clanAffiliationOf, GameLobbyCommands, TOO_MANY_PLAYERS_TEXT, TOO_MANY_SPECTATORS_TEXT,
} from '../../src/screens/gameLobbyCommands';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';

/**
 * CLAN-JOIN (web sprint 19; research 308 §4.3, §3.2-§3.3, §9 items 3-4), the page's half:
 *
 * - `IsSwitchTeamsOK` (row 104, 0x277420 -> `FUN_002f8ce0` D:L197459-197476) answers 0 for affiliations 1, 2 and 4 of
 *   `DAT_0044f780` -- the creator's (`FUN_002e9840(CreateClanAffiliation)` D:L188172-188200) on the host, the joined
 *   game's GF3 decoded (`FUN_002e9ab0` D:L188285-188307, from `JoinMPGame`'s `FUN_002f83b0` D:L197301 and AUTOPLAY's
 *   `FUN_002f9220` D:L197694) on a joiner -- and 1 otherwise.
 * - The host's two clan refusals as the joiner shows them: the Game Signal's side 4, reason 3 "Too many players"
 *   (S:0x3f24d0) and reason 4 "Closed clan game" (S:0x3f24f0), formatted "%s" (S:0x3f2478) and posted with
 *   MP_EJECT_SPECTATOR (S:0x3f2530; `FUN_002b9150` D:L159206-159227), as SVC-23f's "Too many spectators" (reason 2).
 *
 * Synthetic games off the machine; clan ids invented.
 */
const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'Enable_SM_Launch', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: '', loc: 0, bytes: new Uint8Array(16) });
const listed = (genericField3: number): GameListEntry => ({
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 16, gameLevel: 2, playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 300,
  genericField3: genericField3 | 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'clan$~Alpha', gameStats: '44'.padEnd(512, '0'), endOfList: false,
});
const commands = (events: [number, string | null][] = []): GameLobbyCommands =>
  new GameLobbyCommands({ uiVars: new UiVarManager(), valves: () => new ValveStore(), games: () => [], clanId: () => 12, event: (k, t) => { events.push([k, t]); } });
const switchOk = (c: GameLobbyCommands): boolean => c.IsSwitchTeamsOK(cmd('IsSwitchTeamsOK'), null as never, undefined) as boolean;

describe('the affiliation a GF3 carries (FUN_002e9ab0 D:L188285-188307)', () => {
  it('0xA..0xD -> 1..4, anything else 0', () => {
    expect([0, 1, 2, 3, 4].map((a) => clanAffiliationOf(clanField(a, 12)))).toEqual([0, 1, 2, 3, 4]);
    expect(clanAffiliationOf(0x7000000c)).toBe(0);
    expect(clanAffiliationOf(-1)).toBe(0);
  });
});

describe('IsSwitchTeamsOK over the held game\'s affiliation (FUN_002f8ce0 D:L197459-197476)', () => {
  it('a joiner of a listed game: 1 for GF3 0 and affiliation 3, 0 for 1, 2 and 4', () => {
    const answers = [0, 1, 2, 3, 4].map((a) => {
      const c = commands();
      c.enterGameLobby(listed(clanField(a, 13)));
      return switchOk(c);
    });
    expect(answers).toEqual([true, false, false, true, false]);
  });

  it('AUTOPLAY\'s game found decodes its GF3 the same way (FUN_002f9220 D:L197694)', () => {
    const answers = [0, 1, 2, 3, 4].map((a) => {
      const c = commands();
      c.randomGameFound(listed(clanField(a, 12)));
      return switchOk(c);
    });
    expect(answers).toEqual([true, false, false, true, false]);
  });

  it('the host: its create\'s affiliation (FUN_002e9840), whatever game it last joined', () => {
    const answers = [0, 1, 2, 3, 4].map((a) => {
      const c = commands();
      c.enterGameLobby(listed(clanField(1, 13)));               // an earlier listed join left affiliation 1 behind
      const game: CreatedGame = {
        mediusWorldId: 9, gameName: 'mine$~Alpha', playList: [2],
        request: {
          applicationId: 0x28e8, minPlayers: 2, maxPlayers: 24, gameLevel: 0, gameName: 'mine$~Alpha', gamePassword: '', spectatorPassword: '',
          playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 65000, genericField3: clanField(a, 12), gameHostType: 0,
        },
        valves: { MaxPlayersValve: 16, MaxSpectatorsValve: 8, CreateClanAffiliation: a },
      };
      c.created(game);
      return switchOk(c);
    });
    expect(answers).toEqual([true, false, false, true, false]);
  });

  it('no game held: 1 (the affiliation cleared, FUN_002e9920 D:L188204-188211)', () => {
    expect(switchOk(commands())).toBe(true);
  });
});

describe('the host\'s clan refusals posted as the joiner\'s reader posts them (FUN_002b9150 D:L159206-159227)', () => {
  it('"Too many players" (reason 3) and "Closed clan game" (reason 4) post MP_EJECT_SPECTATOR with their text, as "Too many spectators" (reason 2)', () => {
    expect([TOO_MANY_PLAYERS_TEXT, CLOSED_CLAN_GAME_TEXT]).toEqual(['Too many players', 'Closed clan game']);
    for (const text of [TOO_MANY_SPECTATORS_TEXT, TOO_MANY_PLAYERS_TEXT, CLOSED_CLAN_GAME_TEXT]) {
      const events: [number, string | null][] = [];
      commands(events).seatEnded(4000, text);
      expect(events).toEqual([[DIALOG_EVENTS['MP_EJECT_SPECTATOR'], text]]);
    }
  });

  it('any other refusal posts no MP_EJECT_SPECTATOR', () => {
    const events: [number, string | null][] = [];
    commands(events).seatEnded(4000, 'The game is full.');
    expect(events.filter(([k]) => k === DIALOG_EVENTS['MP_EJECT_SPECTATOR'])).toEqual([]);
  });
});
