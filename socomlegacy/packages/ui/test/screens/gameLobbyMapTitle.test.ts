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

/**
 * LOBBY-MAP-STALE (Cobra89's report, relayed by the owner 2026-11-11: "name of last map played seems to still be showing
 * in the lobby, correct map shows in armory"). The real order at a rotation: the returned view's `nextMap` (the room's
 * `game.ts` sends it before it rotates) starts the next map's read -- the page's is asynchronous, the ARMORY's kept
 * `armoryFromDisc` -- then the rotation's 4021 drops the seat, then the new room welcomes it on that same map. The
 * original loads the mission it has just written, at once (`FUN_00279490` D:L123864-123881; `FUN_0027eb50` D:L126673-
 * 126674): the mission held and its `mission_title` never come apart. A stub read only; no socket, no page, no browser.
 */
describe('LOBBY-MAP-STALE: the next map\'s title is not lost to the rotation\'s drop (FUN_00279490 D:L123864-123881)', () => {
  function pendingLobby() {
    const uiVars = new UiVarManager(); const valves = new ValveStore(); const host = new UiCommandHost();
    const pending = new Map<string, { done: (e: readonly UiVarEntry[]) => void; fail: (e: unknown) => void }>();
    const asked: string[] = [];
    const missionVars = (m: string) => new Promise<readonly UiVarEntry[] | null>((done, fail) => { asked.push(m); pending.set(m, { done, fail }); });
    const c = new GameLobbyCommands({ uiVars, valves: () => valves, games: () => [], missionVars });
    c.register(host);
    const row = (fn: string): void => {
      host.dispatch({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x10) } as unknown as ZAnimUiCommand);
    };
    const title = (): unknown => { const v = uiVars.find('mission_title')?.value; return v?.type === 'string' ? v.value : v; };
    const entry = (m: string) => [{ name: 'mission_title', value: { type: 'string', value: TITLES[m]! } }] as const;
    const flush = () => new Promise((r) => setTimeout(r, 0));
    /** MP2 welcomed, entered, loaded and played; the match returned; the returned view names MP72; check_loop again. */
    const returnedToMp72 = async (): Promise<void> => {
      c.welcomed(2, 'MP2'); row('JoinGameServer'); row('AdvanceMPMission');
      pending.get('mp2')!.done(entry('mp2')); await flush();
      c.gameLobby(view({ launched: true })); c.matchReturned();
      c.gameLobby(view({ nextMap: 'MP72' }));                                     // the returned view (game.ts): MP72's read starts
      row('AdvanceMPMission');                                                     // check_loop on re-entry
    };
    return { c, title, asked, pending, entry, flush, row, returnedToMp72 };
  }

  it("the next map's read resolving while the rotation's 4021 has the seat down is not lost: the welcome on that map draws it", async () => {
    const l = pendingLobby();
    await l.returnedToMp72();
    expect(l.title()).toBe('FROSTFIRE');
    l.c.dropped();                                                                 // the rotation's 4021 before the read lands
    l.pending.get('mp72')!.done(l.entry('mp72')); await l.flush();
    l.c.welcomed(2, 'MP72');                                                       // the new room's welcome, the same map
    await l.flush();
    expect(l.title()).toBe('CROSSROADS');
  });

  it("a next map whose entries never landed is asked for again at the welcome on that same map", async () => {
    // The lobby's ask only: the stub makes a fresh read at each call. The page's kept read (`keepMissionRead`) hands back
    // the same failed promise for the same mission, so a failed read stays failed there until the mission moves (open).
    const l = pendingLobby();
    await l.returnedToMp72();
    l.pending.get('mp72')!.fail(new Error('read failed')); await l.flush();     // the read lost (refused, or the page's archive not held yet)
    expect(l.title()).toBe('FROSTFIRE');
    const n = l.asked.length;
    l.c.dropped();
    l.c.welcomed(2, 'MP72');
    expect(l.asked.slice(n)).toEqual(['mp72']);                                    // asked for again
    l.pending.get('mp72')!.done(l.entry('mp72')); await l.flush();
    expect(l.title()).toBe('CROSSROADS');
  });

  it("a read started in a game the lobby has left adds nothing in the next game, though its mission is the same: that game's own read draws it", async () => {
    const l = pendingLobby();
    const stats = (map: number): string => [0x44, 0, 0, 0, 0, 0, 0, 0, map].map((b) => b.toString(16).padStart(2, '0')).join('').padEnd(512, '0');
    const game = (id: number) => ({ mediusWorldId: id, gameName: 'g', maxPlayers: 8, rulesSet: 0, gameStats: stats(2) });
    l.c.enterGameLobby(game(7));
    l.c.welcomed(2, 'MP2'); l.row('JoinGameServer'); l.row('AdvanceMPMission');   // game 7's read of MP2, in flight
    l.row('DisconnectFromGameServer');                                             // the game left
    l.c.enterGameLobby(game(8));                                                   // another game on MP2
    l.c.welcomed(3, 'MP2'); l.row('JoinGameServer');
    const first = l.pending.get('mp2')!;
    l.row('AdvanceMPMission');                                                     // game 8's own read
    const second = l.pending.get('mp2')!;
    expect(second).not.toBe(first);
    first.done(l.entry('mp2')); await l.flush();
    expect(l.title()).toBeUndefined();                                             // the left game's read adds none
    second.done(l.entry('mp2')); await l.flush();
    expect(l.title()).toBe('FROSTFIRE');
  });
});
