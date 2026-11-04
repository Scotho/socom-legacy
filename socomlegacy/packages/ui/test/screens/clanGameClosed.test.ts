import { describe, expect, it } from 'vitest';
import type { GameListEntry } from '../../src/screens/briefingRoomCommands';
import { clanField, type CreatedGame } from '../../src/screens/createGameCommands';
import { GameLobbyCommands, LOBBY_STATE_JOIN_GAME, type GameLobbyLobby, type WorldReportQuery } from '../../src/screens/gameLobbyCommands';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';

/**
 * CLAN-ID-WIRE (web research 165 §6, 272 §3): `ClanGameClosed` (`FUN_0027d4c0` -> `FUN_002f8c60` D:L197433-197455)
 * answers 1 when the game is found and `FUN_002e9940` (D:L188215-188244) refuses its GenericField3 -- a clan game
 * (affiliation 3, the top nibble 0xC) whose low 28 bits are not the client's clan id `DAT_0044f59c`, which GetMyClans'
 * success writes (`FUN_002e8bd0` D:L187810-187812) and its no-clan reply sets to -1 (D:L187790). Synthetic games off
 * the machine.
 */
const cmd = (arg: string): ZAnimUiCommand => ({ anim: 'aux_join_game', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'ClanGameClosed', arg, loc: 0, bytes: new Uint8Array(16) });
const game = (gameName: string, genericField3: number): GameListEntry => ({
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 16, gameLevel: 2, playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 300,
  genericField3: genericField3 | 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: `${gameName}$~Alpha`, gameStats: '44'.padEnd(512, '0'), endOfList: false,
});
const GAMES = [
  game('open', 0), game('own', 0xc000000c), game('other', 0xc000000d),
  game('seals12', 0xa000000c), game('seals13', 0xa000000d), game('b13', 0xb000000d), game('d13', 0xd000000d),
];
const NAMES = ['open', 'own', 'other', 'seals12', 'seals13', 'b13', 'd13', 'missing'];

function closed(clanId?: number): boolean[] {
  const c = new GameLobbyCommands({ uiVars: new UiVarManager(), valves: () => new ValveStore(), games: () => GAMES, ...(clanId === undefined ? {} : { clanId: () => clanId }) });
  return NAMES.map((n) => c.ClanGameClosed(cmd(n), null as never, undefined) as boolean);
}

describe('ClanGameClosed against the client\'s clan id (FUN_002f8c60 with FUN_002e9940)', () => {
  it('a member of clan 12: his own clan\'s clan game is open, another clan\'s closed; affiliations 1, 2 and 4 never closed', () => {
    expect(closed(12)).toEqual([false, false, true, false, false, false, false, false]);
  });

  it('a member of clan 13: the other way round', () => {
    expect(closed(13)).toEqual([false, true, false, false, false, false, false, false]);
  });

  it('in no clan (-1, and no clan reader): every clan game closed, nothing else', () => {
    expect(closed(-1)).toEqual([false, true, true, false, false, false, false, false]);
    expect(closed()).toEqual([false, true, true, false, false, false, false, false]);
  });
});

/**
 * The host's world report (`FUN_002ef590` D:L191321-191411) sends GF3 as `FUN_002e99f0()` (D:L191396) -- the field
 * CREATE's CreateGame1 sends (D:L190577) from the same globals: the affiliation (`DAT_0044f780`) and the clan id copied
 * from `DAT_0044f59c` (`DAT_0044f778`), both written by `FUN_002e9840(CreateClanAffiliation)` at the create
 * (D:L190556); the host makes no listed join between, the other writer (`FUN_002e9ab0`, D:L197301, D:L197694).
 */
describe("the host's world report carries the created game's clan field (FUN_002ef590 -> FUN_002e99f0)", () => {
  async function reportGf3(affiliation: number, clanId?: number, atReply?: number): Promise<{ sent: number; reported: number[] }> {
    let held = clanId;                                                            // the client's clan id, as the reader answers it now
    let state = 0;
    const phases = new Map<number, (phase: number) => void>();
    const lobby: GameLobbyLobby = {
      up: true, state: () => state,
      queueState: (s: number) => { state = s; phases.get(s)?.(1); },
      setHandler: ((s: number, h: (phase: number) => void) => { phases.set(s, h); }) as GameLobbyLobby['setHandler'],
    };
    const reported: number[] = [];
    const c = new GameLobbyCommands({
      uiVars: new UiVarManager(), valves: () => new ValveStore(), lobby, games: () => [], roomWorldId: () => 1,
      service: {
        joinGame: (q) => Promise.resolve({ status: 0, mediusWorldId: q.mediusWorldId }), leaveGame: () => Promise.resolve({ status: 0 }),
        worldReport: (q: WorldReportQuery) => { reported.push(q.genericField3); return Promise.resolve({ status: 0 }); },
      },
      ...(clanId === undefined ? {} : { clanId: () => held! }),
    });
    c.register({ setHandler: () => {} } as never);
    const sent = clanField(affiliation, clanId ?? -1);                            // CREATE's GF3 (createGameCommands' request)
    const game: CreatedGame = {
      mediusWorldId: 9, gameName: 'mine$~Alpha', playList: [2],
      request: {
        applicationId: 0x28e8, minPlayers: 2, maxPlayers: 24, gameLevel: 0, gameName: 'mine$~Alpha', gamePassword: '', spectatorPassword: '',
        playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 65000, genericField3: sent, gameHostType: 0,
      },
      valves: { MaxPlayersValve: 16, MaxSpectatorsValve: 8, CreateClanAffiliation: affiliation },
    };
    if (atReply !== undefined) held = atReply;                                   // the clan id changed between the send and the reply
    expect(c.created(game)).toBe(true);
    expect(state).toBe(LOBBY_STATE_JOIN_GAME);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    return { sent, reported };
  }

  it("a member of clan 12: the report's GF3 is CREATE's for each affiliation (0xA000000C..0xD000000C; none, 0)", async () => {
    for (const a of [1, 2, 3, 4]) {
      const r = await reportGf3(a, 12);
      expect([r.reported, r.sent >>> 0]).toEqual([[r.sent], (0xa0000000 + (a - 1) * 0x10000000 + 12) >>> 0]);
    }
    expect((await reportGf3(0, 12)).reported).toEqual([0]);
  });

  it('in no clan: -1 under an affiliation, 0 with none -- as clanField gives', async () => {
    expect((await reportGf3(3, -1)).reported).toEqual([-1]);
    expect((await reportGf3(3)).reported).toEqual([-1]);
    expect((await reportGf3(0)).reported).toEqual([0]);
  });

  it("the clan id changing between the send and the reply: the report carries the request's field, latched at D:L190556", async () => {
    const left = await reportGf3(3, 12, -1);                                      // a no-clan GetMyClans reply landed in between
    expect([left.reported, left.sent >>> 0]).toEqual([[left.sent], 0xc000000c]);
    const moved = await reportGf3(3, 12, 13);
    expect(moved.reported).toEqual([moved.sent]);
  });
});
