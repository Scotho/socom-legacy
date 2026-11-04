import { describe, expect, it } from 'vitest';
import { UiCommandHost } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  GAME_LOBBY_CLAN_TAG_COLOR, GameLobbyCommands, SEAL_LIST_VAR, SPECTATOR_LIST_VAR, TALKER_BAR_VAR, talkerBarText, TERRORIST_LIST_VAR,
  type GameLobbySeat, type GameLobbyView,
} from '../../src/screens/gameLobbyCommands';

/**
 * AD-13 (the clans' finish, wave 6b; web sprint 40's row, folded; research 275 §5, 227 §3): the game lobby's clan tag
 * from the room's `seatClans` (each seat's tag as the room told it, `GameLobbyCommands.seatClans`) -- the SEALS and
 * TERRORISTS lists' fourth column, a keyed cell `"[%s]"` (S:0x3f2a70; the ELF's 0x2c50ec passes the state's +0x2e as its
 * argument to the sprintf at 0x2c510c, D:L166111) in (128, 64, 32) (D:L166093-166096, D:L166128-166129), "" (S:0x3f2a30)
 * for a state with no tag (D:L166107-166108); the SPECTATORS list the name alone (D:L166153-166157); and the talker
 * bar's "[tag] name" (`FUN_0027cbf0` D:L125668-125677, S:0x3ef310). Three seats each way: tagged, untagged (the room told
 * '' or nothing), and no holder at all (a seat the room's board never names -- a guest's, a bot's). Unit tests over the
 * lobby's commands; no socket, no browser.
 */

const seat = (id: number, name: string, team: GameLobbySeat['team']): GameLobbySeat => ({ id, name, team, ready: false, host: id === 1, readyIn: 30 });
const view = (seats: GameLobbySeat[]): GameLobbyView => ({ seats, countdown: null, launched: false });
const statsHex = (o: Record<number, number>): string => { const b = new Uint8Array(256); b[0] = 0x44; for (const [k, v] of Object.entries(o)) b[Number(k)] = v; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const GAME = { mediusWorldId: 7, gameName: 'test$~Alpha', maxPlayers: 16, rulesSet: 1, gameStats: statsHex({ 1: 5, 2: 6, 8: 2 }) };
/** host (1, SEAL, tagged NSW), socomc (2, Terrorist, this page; untagged), rook (3, SEAL; no holder), papa (4, spectator, tagged SEA), quinn (5, spectator). */
const SEATS = [seat(1, 'host', 'seal'), seat(2, 'socomc', 'terrorist'), seat(3, 'rook', 'seal'), seat(4, 'papa', null), seat(5, 'quinn', null)];
const CLANS = new Map([[1, 'NSW'], [4, 'SEA']]);

const str = (value: string): UiVarValue => ({ type: 'string', value });
/** The keyed cell the original builds (`FUN_003333f0` VALUE, `FUN_00333490` COLOR), flat as `LADDER_KEYED_CELL_READING` builds it. */
const clanCell = (text: string): UiVarValue => ({
  type: 'array', value: [str('VALUE'), str(text), str('COLOR'), { type: 'array', value: [128, 64, 32].map((value) => ({ type: 'real' as const, value })) }],
});

function lobby(holder: () => number | null = () => null) {
  const uiVars = new UiVarManager();
  const valves = new ValveStore();
  const host = new UiCommandHost();
  const c = new GameLobbyCommands({ uiVars, valves: () => valves, games: () => [], voice: { button: () => undefined, recording: () => false, holder } });
  c.register(host);
  const rows = (name: string): UiVarValue[][] => {
    const v = uiVars.find(name)?.value;
    return v?.type === 'array' ? v.value.map((x) => (x.type === 'array' ? [...x.value] : [x])) : [];
  };
  /** Each row's name and its fourth cell (the clan column). */
  const clans = (name: string): [string, UiVarValue | undefined][] => rows(name).map((r) => [r[0]?.type === 'string' ? r[0].value : '?', r[3]]);
  const row = (fn: string, arg = 'NA'): void => {
    host.dispatch({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) } as unknown as ZAnimUiCommand);
  };
  const bar = (): unknown => { const v = uiVars.find(TALKER_BAR_VAR)?.value; return v?.type === 'string' ? v.value : v; };
  return { c, uiVars, rows, clans, row, bar };
}

describe('AD-13 C49: the game lobby\'s side lists\' clan column (FUN_002c5010 D:L166107-166151)', () => {
  it('the colour is the original\'s three floats (D:L166093-166096: 128.0, 64.0, 32.0)', () => {
    expect(GAME_LOBBY_CLAN_TAG_COLOR).toEqual([128, 64, 32]);
  });

  it('tagged: "[NSW]"; untagged and no holder: "" -- each a keyed cell in (128, 64, 32); the SPECTATORS list the name alone', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    l.c.seatClans(CLANS);
    expect(l.clans(SEAL_LIST_VAR)).toEqual([['host', clanCell('[NSW]')], ['rook', clanCell('')]]);
    expect(l.clans(TERRORIST_LIST_VAR)).toEqual([['socomc', clanCell('')]]);
    expect(l.rows(SPECTATOR_LIST_VAR)).toEqual([[str('papa')], [str('quinn')]]);   // a tagged watcher: his name only (D:L166153-166157)
    expect(l.rows(SEAL_LIST_VAR)[0]!.map((x) => x.type)).toEqual(['string', 'int', 'int', 'array']);   // [name, medal, dot, the keyed clan]
  });

  it('before any seatClans every clan cell is ""; the next one replaces the board whole; a gameLobby keeps the told tags', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    expect(l.clans(SEAL_LIST_VAR)).toEqual([['host', clanCell('')], ['rook', clanCell('')]]);
    l.c.seatClans(CLANS);
    l.c.seatClans(new Map([[3, 'RKS']]));                                   // the room's next whole set: host's tag no longer in it
    expect(l.clans(SEAL_LIST_VAR)).toEqual([['host', clanCell('')], ['rook', clanCell('[RKS]')]]);
    l.c.gameLobby(view([seat(1, 'host', 'terrorist'), seat(2, 'socomc', 'terrorist'), seat(3, 'rook', 'terrorist')]));   // a swap: the tags go with the seats
    expect(l.clans(TERRORIST_LIST_VAR)).toEqual([['host', clanCell('')], ['socomc', clanCell('')], ['rook', clanCell('[RKS]')]]);
  });

  it('a new game held forgets the last game\'s tags (its seats\' ids are another room\'s)', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    l.c.seatClans(CLANS);
    l.c.enterGameLobby(GAME);
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    expect(l.clans(SEAL_LIST_VAR)).toEqual([['host', clanCell('')], ['rook', clanCell('')]]);
  });
});

describe('AD-13 C94: the talker bar\'s tag (FUN_0027cbf0 D:L125668-125677; TALKER_CLAN_PARKED_READING retired)', () => {
  it('a tagged holder: "#C<80 40 20>[tag] #C<80 80 80>name" (S:0x3ef310) -- a player\'s and a spectator\'s alike; untagged and no holder: the name alone (S:0x3eebc8)', () => {
    let holder: number | null = null;
    const l = lobby(() => holder);
    l.c.enterGameLobby(GAME);
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    l.c.seatClans(CLANS);
    const said = (h: number): unknown => { holder = h; l.row('CheckForcedLaunch'); return l.bar(); };
    expect(said(1)).toBe(talkerBarText('host', 'NSW'));
    expect(said(1)).toBe('#C\x80@ [NSW] #C\x80\x80\x80host');
    expect(said(4)).toBe('#C\x80@ [SEA] #C\x80\x80\x80papa');            // a watcher's to the other spectators (channel 10, research 275 §5)
    expect(said(3)).toBe('rook');                                        // no holder of a tag: the name alone
    expect(said(5)).toBe('quinn');
    expect(said(2)).toBe(' ');                                           // the listener's own: never his name (D:L125663-125665)
  });

  it('the bar reads the board as it stands: a tag told after the floor was taken shows at the next pass', () => {
    const l = lobby(() => 1);
    l.c.enterGameLobby(GAME);
    l.c.welcomed(2);
    l.c.gameLobby(view(SEATS));
    l.row('CheckForcedLaunch');
    expect(l.bar()).toBe('host');
    l.c.seatClans(CLANS);
    l.row('CheckForcedLaunch');
    expect(l.bar()).toBe('#C\x80@ [NSW] #C\x80\x80\x80host');
  });
});
