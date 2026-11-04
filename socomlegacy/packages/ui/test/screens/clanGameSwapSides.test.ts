import { describe, expect, it } from 'vitest';
import type { GameListEntry } from '../../src/screens/briefingRoomCommands';
import { clanField } from '../../src/screens/createGameCommands';
import { GameLobbyCommands, PLAYER_TEAM, type GameSocketPort } from '../../src/screens/gameLobbyCommands';
import { UiVarManager } from '../../src/uiVars';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';

/**
 * CLAN-SWAP (web sprint 19; research 309 R309.4, R309.6, §7.2 item 2), the page's half: row 184 `ClanGameSwapSides`
 * (`FUN_0027d540` D:L125956-125999), which the disc's `SwapClanSides` (`dlgGameLobby.rdr`, P:L7161-7201) runs on the
 * session master in the lobby a match returned to.
 *
 * - START (S:0x3ef350): 1 only for the held game's affiliation 4 (`FUN_002e99e0`), `mp_locked_game` set 1
 *   (D:L125973-125988); 0 otherwise (ONL-20b's, kept).
 * - FINISH (S:0x3ef368): `FUN_002bada0` -> `FUN_002c0040(!DAT_004412d8)` (D:L125990-125995, D:L162973-162982): the flag
 *   flipped and the console's own `player_team` rewritten for its word under the new flag at once (`FUN_002c3330`
 *   D:L164814-: SEAL 0 <-> TERRORIST 8, a spectator's 16 kept) -- the master's re-arm reads it right after -- and the
 *   game object sent, which the room stands for: the page sends `clanSwap` (an open socket only). 1.
 * - Any other argument, or none: 1, nothing done.
 *
 * Synthetic games off the machine (the sequence over the machine is `gameLobbyScreen.test.ts`'s); clan ids invented.
 */
const cmd = (arg: string): ZAnimUiCommand => ({ anim: 'SwapClanSides', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'ClanGameSwapSides', arg, loc: 0, bytes: new Uint8Array(16) });
const listed = (genericField3: number): GameListEntry => ({
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 16, gameLevel: 2, playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 300,
  genericField3: genericField3 | 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'clan$~Alpha', gameStats: '44'.padEnd(512, '0'), endOfList: false,
});

/** A page holding a listed game of `genericField3`, its socket open (welcomed) unless `open` is false, `player_team` set. */
function page(genericField3: number, team: number, open = true) {
  const valves = new ValveStore();
  const sent: string[] = [];
  const socket: GameSocketPort = { open: () => true, send: (type) => { sent.push(type); }, close: () => undefined };
  const c = new GameLobbyCommands({ uiVars: new UiVarManager(), valves: () => valves, games: () => [], clanId: () => 12, socket });
  c.enterGameLobby(listed(genericField3));
  if (open) c.welcomed(2);
  valves.acquire('player_team', VALVE_TYPE.PERM);
  valves.set('player_team', team, VALVE_TYPE.PERM);
  const swap = (arg: string): boolean => c.ClanGameSwapSides(cmd(arg), null as never, undefined) as boolean;
  const valve = (name: string): number => valves.acquire(name, VALVE_TYPE.PERM).value;
  return { c, sent, swap, valve };
}

describe('ClanGameSwapSides(START) over the held game\'s affiliation (FUN_0027d540 D:L125973-125988)', () => {
  it('GF3 0, 0xA.., 0xB.., 0xC.. answer 0 and write nothing; 0xD.. (affiliation 4) answers 1 with mp_locked_game 1', () => {
    const answers = [0, 1, 2, 3, 4].map((a) => {
      const p = page(clanField(a, 12), PLAYER_TEAM.seal);
      return [p.swap('START'), p.valve('mp_locked_game'), p.sent.length];
    });
    expect(answers).toEqual([[false, 0, 0], [false, 0, 0], [false, 0, 0], [false, 0, 0], [true, 1, 0]]);
  });
});

describe('ClanGameSwapSides(FINISH): the page\'s own side flipped at once and the room asked (FUN_002bada0 -> FUN_002c0040)', () => {
  it('a SEAL becomes a TERRORIST and a TERRORIST a SEAL; one clanSwap sent each time; 1', () => {
    const p = page(clanField(4, 12), PLAYER_TEAM.seal);
    expect(p.swap('START')).toBe(true);
    expect([p.swap('FINISH'), p.valve('player_team'), p.sent]).toEqual([true, PLAYER_TEAM.terrorist, ['clanSwap']]);
    expect([p.swap('finish'), p.valve('player_team'), p.sent]).toEqual([true, PLAYER_TEAM.seal, ['clanSwap', 'clanSwap']]);   // FUN_00198b80: case-insensitive
    expect(p.valve('mp_locked_game')).toBe(1);                                    // the script's to clear, after its WAIT 10
  });

  it('a spectator\'s player_team stays 16 (FUN_002c3330: word bit 0x10000); the request still sent', () => {
    const p = page(clanField(4, 12), PLAYER_TEAM.spectator);
    expect([p.swap('FINISH'), p.valve('player_team'), p.sent]).toEqual([true, PLAYER_TEAM.spectator, ['clanSwap']]);
  });

  it('no open socket: the side flipped, nothing sent', () => {
    const p = page(clanField(4, 12), PLAYER_TEAM.terrorist, false);
    expect([p.swap('FINISH'), p.valve('player_team'), p.sent]).toEqual([true, PLAYER_TEAM.seal, []]);
  });

  it('any other argument, or none: 1, nothing done', () => {
    const p = page(clanField(4, 12), PLAYER_TEAM.seal);
    expect([p.swap('NA'), p.swap(''), p.swap('ELSE'), p.valve('player_team'), p.valve('mp_locked_game'), p.sent]).toEqual([true, true, true, PLAYER_TEAM.seal, 0, []]);
  });
});
