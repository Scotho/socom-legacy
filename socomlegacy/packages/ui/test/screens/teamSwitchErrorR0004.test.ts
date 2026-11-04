import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import type { GameListEntry } from '../../src/screens/briefingRoomCommands';
import { clanField } from '../../src/screens/createGameCommands';
import {
  GameLobbyCommands, PLAYER_TEAM, TEAM_SWITCH_ERROR_DIALOG, TEAM_SWITCH_ERROR_TEXT, type GameLobbyView, type GameSocketPort, type LobbySide,
} from '../../src/screens/gameLobbyCommands';
import { UiVarManager } from '../../src/uiVars';
import { VALVE_TYPE, ValveStore } from '../../src/valves';

/**
 * R4B-08 (OT.R97; research 379 §3): r0004's "Team Switch Error!". The E3 Index handler (r0001 `FUN_002baf30`
 * D:L160324-160370, r4 0x2bcb40) applies a team assignment -- the side, the index, the status report (r4 0x2bcc98-0x2bcca8,
 * as r0001's D:L160364-160366) -- and r0004 then takes the current dialog (r4 0x3884e0) and its name (+0x8e1, or the
 * pointer at +0x8e8, 0x2bccc0-0x2bccd0): `dlg_equipment_mp.rdr` (0x41dbc0, compared at 0x2bccd8) fires MP_MEDIUS_ERROR
 * (0x41d9a0) with "Team Switch Error! | Continue" (0x41dbe0) through the event callback (0x2bcce8-0x2bccfc). r0001 took
 * the side silently. The only kind-not-4 sender is the host's SWITCH TEAMS move (`FUN_002c4290` D:L165546, D:L165563;
 * the kind-4 sends at D:L166384, D:L166390 are refusals); "Alternate teams"' swap flips sides through the game object
 * (research 309 R309.6), never this message. So, here: the room's game lobby view moving this page's own seat between
 * the sides in a game whose SWITCH TEAMS is open (`IsSwitchTeamsOK`, not affiliation 1, 2 or 4) while the built dialog
 * is the in-lobby ARMORY posts that event with that text; the armory's own `OnNetError` (the disc's script) takes it.
 * Synthetic games off the machine; clan ids invented.
 */
const listed = (genericField3: number): GameListEntry => ({
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 16, gameLevel: 2, playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 300,
  genericField3: genericField3 | 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'game$~Alpha', gameStats: '44'.padEnd(512, '0'), endOfList: false,
});

function page(genericField3 = 0) {
  const valves = new ValveStore();
  valves.acquire('player_team', VALVE_TYPE.PERM);
  const events: [number, string | null, number][] = [];
  let dialog: string | null = 'dlgGameLobby.rdr';
  const socket: GameSocketPort = { open: () => true, send: () => undefined, close: () => undefined };
  const c = new GameLobbyCommands({
    uiVars: new UiVarManager(), valves: () => valves, games: () => [], socket, dialog: () => dialog,
    event: (kind, text) => { events.push([kind, text, valves.acquire('player_team', VALVE_TYPE.PERM).value]); },
  });
  c.enterGameLobby(listed(genericField3));
  c.welcomed(2);
  const view = (team: LobbySide | null, host = false): GameLobbyView => ({
    seats: [{ id: 2, name: 'Me', team, ready: false, host, readyIn: 0 }, { id: 3, name: 'Other', team: 'seal', ready: false, host: !host, readyIn: 0 }],
    countdown: null, launched: false,
  });
  return { c, events, view, on: (d: string | null) => { dialog = d; } };
}

const ERROR = DIALOG_EVENTS.MP_MEDIUS_ERROR!;

describe('R4B-08 (r0004): "Team Switch Error!" when the seat changes side on the in-lobby ARMORY (r4 0x2bccb0-0x2bcd04)', () => {
  it('the constants are r0004\'s strings (r4 0x41dbc0, 0x41dbe0)', () => {
    expect([TEAM_SWITCH_ERROR_DIALOG, TEAM_SWITCH_ERROR_TEXT]).toEqual(['dlg_equipment_mp.rdr', 'Team Switch Error! | Continue']);
  });

  it('a SWITCH TEAMS move landing on the ARMORY posts MP_MEDIUS_ERROR with the text, after the new side is taken', () => {
    const p = page();
    p.c.gameLobby(p.view('seal'));
    p.on('dlg_equipment_mp.rdr');
    p.c.gameLobby(p.view('terrorist'));
    expect(p.events).toEqual([[ERROR, 'Team Switch Error! | Continue', PLAYER_TEAM.terrorist]]);
    p.c.gameLobby(p.view('terrorist'));                           // the same side again: nothing
    expect(p.events).toHaveLength(1);
  });

  it('the same move on the GAME LOBBY itself: the side taken silently, as r0001 did everywhere', () => {
    const p = page();
    p.c.gameLobby(p.view('seal'));
    p.c.gameLobby(p.view('terrorist'));
    expect(p.events).toEqual([]);
  });

  it('no move: the first view, a watcher seated, or no side change -- nothing on the ARMORY', () => {
    const p = page();
    p.on('dlg_equipment_mp.rdr');
    p.c.gameLobby(p.view('seal'));                                // the first view: no earlier side
    p.c.gameLobby(p.view(null));                                  // a watcher: not a side
    p.c.gameLobby(p.view('terrorist'));
    p.c.gameLobby(p.view('terrorist'));
    expect(p.events).toEqual([]);
  });

  it('"Alternate teams"\' swap (affiliation 4: SWITCH TEAMS closed) flips the side by the game object, not this message: nothing', () => {
    const p = page(clanField(4, 12));
    p.c.gameLobby(p.view('seal'));
    p.on('dlg_equipment_mp.rdr');
    p.c.gameLobby(p.view('terrorist'));
    expect(p.events).toEqual([]);
  });

  it('R4B-08 review P3-1: the host\'s own SWITCH TEAMS lands at once in the original, never on the ARMORY -- the session master\'s page posts nothing', () => {
    // The host's SwitchSides runs FUN_002c4290 -> FUN_002baea0(self) -> the handler in the same call (D:L160270-160281,
    // D:L160302-160320): the side lands while dlgGameLobby.rdr is current. Here the room's answer is a round trip and
    // switch_teams_anim focuses weaponselect, so a fast CROSS would put the host on the ARMORY first.
    const p = page();
    p.c.gameLobby(p.view('seal', true));
    p.on('dlg_equipment_mp.rdr');
    p.c.gameLobby(p.view('terrorist', true));
    expect(p.events).toEqual([]);
  });

  it('a new welcome (a reconnect\'s seat) starts afresh: its first view is no move', () => {
    const p = page();
    p.c.gameLobby(p.view('seal'));
    p.on('dlg_equipment_mp.rdr');
    p.c.welcomed(2);
    p.c.gameLobby(p.view('terrorist'));
    expect(p.events).toEqual([]);
  });
});
