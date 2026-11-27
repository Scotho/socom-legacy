import { describe, expect, it } from 'vitest';
import { UiCommandHost } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import {
  GameLobbyCommands, LOBBY_NAME_CUT_14_ADAPTATION, SEAL_LIST_VAR, SPECTATOR_LIST_VAR, TERRORIST_LIST_VAR,
  type GameLobbySeat, type GameLobbyView,
} from '../../src/screens/gameLobbyCommands';

/**
 * LOBBY-NAME-CUT-14 (the owner, INTAKE 92: "Cut at 14"; LATER 1093; a browser adaptation, product track): the game lobby's
 * three lists draw at most 14 characters of a seat's name -- the PS2's own name keyboard's limit (`CREATEPLAYERNAME`, 14
 * characters, research 119 R119.4), past which the original never drew a name (research 269 §4.4: its list cuts a cell
 * only at the frame, so a longer name runs into the other side's list). Display only: the seat's name in the view, the
 * talker bar and the account stay whole. The clan tag keeps its own "[tag]" cell (FUN_002c5010 builds it apart), a BOT
 * cell is untouched, the cut falls on code points (never inside a character), and a space the cut leaves last is drawn.
 * Unit tests over the lobby's commands; no socket, no browser.
 */

const seat = (id: number, name: string, team: GameLobbySeat['team'], extra: Partial<GameLobbySeat> = {}): GameLobbySeat => ({ id, name, team, ready: false, host: id === 1, readyIn: 30, ...extra });
const view = (seats: GameLobbySeat[]): GameLobbyView => ({ seats, countdown: null, launched: false });

function lobby() {
  const uiVars = new UiVarManager();
  const valves = new ValveStore();
  const host = new UiCommandHost();
  const c = new GameLobbyCommands({ uiVars, valves: () => valves, games: () => [], voice: { button: () => undefined, recording: () => false, holder: () => null } });
  c.register(host);
  const rows = (name: string): UiVarValue[][] => {
    const v = uiVars.find(name)?.value;
    return v?.type === 'array' ? v.value.map((x) => (x.type === 'array' ? [...x.value] : [x])) : [];
  };
  const names = (list: string): string[] => rows(list).map((r) => (r[0]?.type === 'string' ? r[0].value : '?'));
  const fourth = (list: string): UiVarValue[] => rows(list).map((r) => r[3]!);
  return { c, rows, names, fourth };
}

const LONG31 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ01234';   // 31 characters, the account name's longest (research 132 R132.4)

describe('LOBBY-NAME-CUT-14: the game lobby\'s lists draw at most 14 characters of a seat\'s name (the owner, INTAKE 92)', () => {
  it('the adaptation is labelled and its length is the PS2 keyboard\'s 14', () => {
    expect(LOBBY_NAME_CUT_14_ADAPTATION).toBe(14);
  });

  it('a 31-character name is drawn as its first 14 in the SEALS, TERRORISTS and SPECTATORS lists; 14 and under are drawn whole', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view([seat(1, LONG31, 'seal'), seat(2, 'socomc', 'terrorist'), seat(3, LONG31, 'terrorist'), seat(4, LONG31, null), seat(5, 'EXACTLY14CHARS', 'seal')]));
    expect(l.names(SEAL_LIST_VAR)).toEqual(['ABCDEFGHIJKLMN', 'EXACTLY14CHARS']);
    expect(l.names(TERRORIST_LIST_VAR)).toEqual(['socomc', 'ABCDEFGHIJKLMN']);
    expect(l.names(SPECTATOR_LIST_VAR)).toEqual(['ABCDEFGHIJKLMN']);
  });

  it('the clan tag stays its own cell, whole; a bot\'s BOT cell is untouched; the 14 are the name\'s own characters', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view([seat(1, LONG31, 'seal'), seat(2, `${LONG31}x`, 'seal', { bot: true })]));
    l.c.seatClans(new Map([[1, 'NSW']]));
    expect(l.names(SEAL_LIST_VAR)).toEqual(['ABCDEFGHIJKLMN', 'ABCDEFGHIJKLMN']);
    const cells = l.fourth(SEAL_LIST_VAR).map((v) => (v.type === 'array' ? v.value[1] : v));
    expect(cells).toEqual([{ type: 'string', value: '[NSW]' }, { type: 'string', value: 'BOT' }]);
  });

  it('the cut falls on code points, never inside a character: an astral character at the 14th place is kept whole', () => {
    const l = lobby();
    l.c.welcomed(2);
    const name = `ABCDEFGHIJKLM\u{1F600}NOPQ`;                     // 18 code points, the 14th a surrogate pair
    l.c.gameLobby(view([seat(1, name, 'seal')]));
    const drawn = l.names(SEAL_LIST_VAR)[0]!;
    expect(Array.from(drawn)).toHaveLength(14);
    expect(drawn).toBe('ABCDEFGHIJKLM\u{1F600}');
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(drawn)).toBe(false);   // no lone surrogate
  });

  it('a space the cut leaves last is drawn as it is (no trim)', () => {
    const l = lobby();
    l.c.welcomed(2);
    l.c.gameLobby(view([seat(1, 'ABCDEFGHIJKLM OVERFLOW', 'seal')]));
    expect(l.names(SEAL_LIST_VAR)).toEqual(['ABCDEFGHIJKLM ']);
  });

  it('display only: the view the lobby holds keeps the whole name', () => {
    const l = lobby();
    l.c.welcomed(2);
    const seats = [seat(1, LONG31, 'seal')];
    l.c.gameLobby(view(seats));
    expect(seats[0]!.name).toBe(LONG31);
  });
});
