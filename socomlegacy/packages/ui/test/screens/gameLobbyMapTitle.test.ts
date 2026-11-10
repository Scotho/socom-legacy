import { describe, expect, it } from 'vitest';
import { UiCommandHost } from '../../src/uiCommands';
import { UiVarManager, type UiVarEntry } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { GameLobbyCommands, type GameLobbyView } from '../../src/screens/gameLobbyCommands';

/**
 * LOBBY-ONE-BEHIND (Craig, live v0.4.14: "the in game game lobby shows one match behind when matches change over"), with
 * no disc: a stub `missionVars` naming each map's `mission_title`. The original's host writes the play list's next map
 * into 0x414e00 before loading it (`FUN_00279490` D:L123863-123877, the load `FUN_002acc10` at D:L123881; research 309
 * §2.2); the port's `AdvanceMPMission` at the returned lobby's entry loads the map just played, so a move of the map while
 * the lobby stands -- the rotation's welcome or the returned view's `nextMap` -- loads the new map's variables. Reading,
 * pending review. Unit tests over the lobby's commands; no socket, no browser.
 */

const TITLES: Record<string, string> = { mp2: 'FROSTFIRE', mp72: 'CROSSROADS', mp5: 'BLIZZARD' };
const view = (o: Partial<GameLobbyView> = {}): GameLobbyView => ({
  seats: [{ id: 2, name: 'socomc', team: 'seal', ready: false, host: false, readyIn: 30 }], countdown: null, launched: false, ...o,
});

function lobby() {
  const uiVars = new UiVarManager();
  const valves = new ValveStore();
  const host = new UiCommandHost();
  const asked: string[] = [];
  const missionVars = (m: string): readonly UiVarEntry[] | null => {
    asked.push(m);
    const t = TITLES[m];
    return t ? [{ name: 'mission_title', value: { type: 'string', value: t } }] : null;
  };
  const c = new GameLobbyCommands({ uiVars, valves: () => valves, games: () => [], missionVars });
  c.register(host);
  const row = (fn: string, arg = 'NA'): void => {
    host.dispatch({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) } as unknown as ZAnimUiCommand);
  };
  const title = (): unknown => {
    const v = uiVars.find('mission_title')?.value;
    return v?.type === 'string' ? v.value : v;
  };
  /** The welcome on MP2, the lobby entered (`JoinGameServer`), `check_loop`'s `AdvanceMPMission`, a match played and returned. */
  const returned = (): void => {
    c.welcomed(2, 'MP2');
    row('JoinGameServer');
    row('AdvanceMPMission');
    c.gameLobby(view({ launched: true }));
    c.matchReturned();
    row('AdvanceMPMission');                                                       // the returned lobby's check_loop: the map just played
  };
  return { c, title, asked, returned, row };
}

describe('LOBBY-ONE-BEHIND: a map moved under the standing lobby loads its variables (FUN_00279490 D:L123863-123881)', () => {
  it("the rotation's new welcome after a return: mission_title the new map's", () => {
    const l = lobby();
    l.returned();
    expect(l.title()).toBe('FROSTFIRE');
    l.c.dropped();                                                                 // the rotation's 4021
    l.c.welcomed(2, 'MP72');
    expect([l.title(), l.asked.at(-1)]).toEqual(['CROSSROADS', 'mp72']);
  });

  it("the returned view's nextMap: mission_title the next map's; the welcome on that same map loads nothing again", () => {
    const l = lobby();
    l.returned();
    l.c.gameLobby(view({ nextMap: 'MP5' }));
    expect(l.title()).toBe('BLIZZARD');
    const n = l.asked.length;
    l.c.dropped();
    l.c.welcomed(2, 'MP5');
    expect([l.title(), l.asked.length]).toEqual(['BLIZZARD', n]);
  });

  it("the review's F2: a launched view's nextMap moves nothing -- no load, mission_title the current map's", () => {
    const l = lobby();
    l.returned();
    const n = l.asked.length;
    l.c.gameLobby(view({ launched: true, nextMap: 'MP5' }));
    expect([l.title(), l.asked.length]).toEqual(['FROSTFIRE', n]);
  });

  it('no load before the lobby is entered (the first welcome): check_loop loads the welcomed map once', () => {
    const l = lobby();
    l.c.welcomed(2, 'MP2');
    l.c.welcomed(2, 'MP72');
    expect(l.asked).toEqual([]);
    l.row('JoinGameServer');
    l.row('AdvanceMPMission');
    expect([l.asked, l.title()]).toEqual([['mp72'], 'CROSSROADS']);
  });
});
