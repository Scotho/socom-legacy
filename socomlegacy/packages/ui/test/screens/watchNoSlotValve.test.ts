import { describe, expect, it } from 'vitest';
import type { ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { BRIEFING_ROOM, type GameListEntry } from '../../src/screens/briefingRoomCommands';
import { GAME_LOBBY } from '../../src/screens/gameLobbyCommands';
import { CREATE_GAME } from '../../src/screens/createGameCommands';
import { HAVE } from './worldOfSocomRig';
import { gameLobbyRig, type GameLobbyRigOptions } from './gameLobbyRig';

/**
 * WATCH-DOCS (web sprint 19's second half; research 314 §3.1, §7 item 7, §8 `WATCH_NO_SLOT_STALE_VALVE_READING`): a
 * pin, not a fix -- the port already transcribes the order. WATCH GAME on a listed game with no spectator slot
 * (GameStats byte 4 = 0): `JoinMPGame` (`FUN_002f83b0`) answers 1 at once, queuing nothing, for a watch of such a game
 * (D:L197175-197178) -- before its copy of byte 4 into the global `MaxSpectatorsValve` (D:L197206-197218). So
 * `aux_join_game`'s test `MaxSpectatorsValve == 0 AND JoinAsSpectator == 1` (P:L4619) reads whatever the last write
 * left: 0 -> #424 for 3 s and `abort_join` (P:L4620-4627); else the wait for state 17, `JoinMPGame` asked again each
 * second while the state is 11 (P:L4629-4632) and answering 1 again with nothing queued, until `monitor_timeout`'s
 * `WAIT 30` writes #440 and aborts (P:L4614, P:L4708-4714). The valve is 8 after a join of a game with 8 slots (the
 * join's copy) and after merely opening CREATE GAME online and leaving it by TRIANGLE (`init_cg_screen`'s default
 * branch with `CreateGameSettingsChanged` 0, P:L5797, P:L5812, P:L5821-5825; `aux_join_game` writes it 0 at every
 * join, P:L4617; `create_game_exit` keeps the value, P:L6325-6335). Unit and dev-disc test over the disc's own
 * scripts (the committed fixtures without a disc); the original's run is ONL-32's to measure.
 */

const SETTLED = 60;
const SECOND = 30;
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const ROOMS = [room('Alpha', 1, { playerCount: 2 }), room('Bravo', 2, { endOfList: true })];
const statsHex = (o: Record<number, number>): string => { const b = new Uint8Array(256); b[0] = 0x44; for (const [k, v] of Object.entries(o)) b[Number(k)] = v; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
/** A game of the room Alpha with 8 spectator slots (GameStats byte 4). */
const WITH_SLOTS: GameListEntry = {
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 24, gameLevel: 2, playerSkillLevel: 0, rulesSet: 1, genericField1: 1, genericField2: 65000,
  genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'test$~Alpha', gameStats: statsHex({ 1: 5, 2: 6, 4: 8, 8: 2 }), endOfList: true,
};
/** The same room's game with no spectator slot (byte 4 = 0): the game WATCH GAME is pinned against. */
const NO_SLOT: GameListEntry = { ...WITH_SLOTS, mediusWorldId: 8, maxPlayers: 16, gameName: 'nospec$~Alpha', gameStats: statsHex({ 1: 5, 2: 6, 4: 0, 8: 2 }) };
type Rig = Awaited<ReturnType<typeof gameLobbyRig>>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const joinMPGameCalls = (r: Rig, from: number): number => r.calls(BRIEFING_ROOM, from).filter((c) => /^JoinMPGame\(/.test(c)).length;
async function until(r: Rig, done: () => boolean, frames = 60 * SECOND): Promise<void> { for (let i = 0; i < frames && !done(); i++) await r.settle(1); }

/** The menu, BRIEFING ROOMS, Alpha: the briefing room built with the game list `list()` answers at each request. */
async function briefing(list: () => readonly GameListEntry[], o: GameLobbyRigOptions = {}): Promise<Rig> {
  const r = await gameLobbyRig({ name: 'socomc', announcement: '', rooms: ROOMS, games: () => Promise.resolve(list()), ...o });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  go(r, 'briefingrooms');
  r.press('CROSS', 6);
  r.press('CROSS', 2);
  await until(r, () => r.current() === BRIEFING_ROOM, 200);
  await r.settle(SETTLED);
  return r;
}
/** `button` (JoinGame or WatchGame), then CROSS on the listed game: `join_game`. */
function listed(r: Rig, button: 'JoinGame' | 'WatchGame'): void {
  go(r, button);
  r.press('CROSS', 6);
  expect(r.focused()).toBe('GAMELIST');
  r.press('CROSS', 2);
}

/**
 * WATCH GAME on `NO_SLOT` with `MaxSpectatorsValve` already not 0: no JoinGame, no socket; `JoinMPGame` re-asked each
 * second; #440 on JoiningAnim at 30 s from the CROSS; the briefing room, the lobby still in state 11.
 */
async function quietTimeout(r: Rig): Promise<void> {
  const joins = r.joins.length, sockets = r.socketLog.length, from = r.outcomes.length;
  expect(r.valve('MaxSpectatorsValve')).toBe(8);
  const start = r.frames();
  listed(r, 'WatchGame');
  const timedOut = (): boolean => r.text('JoiningAnim').join('') === r.loc.byId.get(440)!;
  await until(r, () => r.shown() || timedOut(), 29 * SECOND);
  expect([r.shown(), timedOut()]).toEqual([false, false]);            // 29 s: no #424, no #440 yet, still waiting
  expect(joinMPGameCalls(r, from)).toBeGreaterThanOrEqual(20);         // asked again each second, answering 1 (P:L4629-4632)
  await until(r, timedOut, 3 * SECOND);
  expect(timedOut()).toBe(true);
  expect(Math.round((r.frames() - start) / SECOND)).toBe(30);           // monitor_timeout's WAIT 30 (P:L4708-4710)
  expect([r.joins.length - joins, r.socketLog.length - sockets, r.lobby.state(), r.current(), r.valve('MaxSpectatorsValve')]).toEqual([0, 0, 11, BRIEFING_ROOM, 8]);
}

describe.skipIf(!HAVE)(`WATCH_NO_SLOT_STALE_VALVE_READING: WATCH GAME of a game with no spectator slot${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the valve 0 (a fresh session): #424 for 3 s, abort_join -- no JoinGame, no socket, the briefing room', async () => {
    const r = await briefing(() => [NO_SLOT]);
    expect(r.valve('MaxSpectatorsValve') ?? 0).toBe(0);
    const from = r.outcomes.length;
    listed(r, 'WatchGame');
    await until(r, () => popupText(r) !== '', 2 * SECOND);
    expect(popupText(r)).toBe(r.loc.byId.get(424)!.trim());
    expect(joinMPGameCalls(r, from)).toBe(1);
    const up = r.frames();
    await until(r, () => !r.shown(), 6 * SECOND);
    expect(Math.round((r.frames() - up) / SECOND)).toBe(3);              // WAIT 3, KillPopup (P:L4622-4623)
    await r.settle(3 * SECOND);
    expect([r.shown(), r.joins, r.socketLog, r.lobby.state(), r.current(), joinMPGameCalls(r, from)]).toEqual([false, [], [], 11, BRIEFING_ROOM, 1]);
  });

  it('the valve 8 from an earlier join of a game with 8 slots (JoinMPGame\'s copy): no request, #440 at 30 s', async () => {
    let list: readonly GameListEntry[] = [WITH_SLOTS];
    const r = await briefing(() => list);
    listed(r, 'JoinGame');
    await until(r, () => r.current() === GAME_LOBBY);
    expect([r.current(), r.valve('MaxSpectatorsValve')]).toEqual([GAME_LOBBY, 8]);
    await r.settle(SETTLED);
    list = [NO_SLOT];
    r.press('TRIANGLE', 6);                                              // exit_lobby: #362, YES, the briefing room
    r.press('LEFT', 4);
    r.press('CROSS', 6);
    await until(r, () => r.current() === BRIEFING_ROOM, 10 * SECOND);
    // the game list's refresh (`auto_refresh_gamelist`, 30 s): the left game dropped once stale (`FUN_002e4630`)
    await until(r, () => r.briefing.gamesHeld().map((g) => g.mediusWorldId).join() === '8', 90 * SECOND);
    await r.settle(SETTLED);
    expect([r.current(), r.joins.map((j) => j.mediusWorldId), r.briefing.gamesHeld().map((g) => g.mediusWorldId)]).toEqual([BRIEFING_ROOM, [7], [8]]);
    await quietTimeout(r);
  });

  it('the valve 8 from opening CREATE GAME and leaving it by TRIANGLE (init_cg_screen\'s default branch): no request, #440 at 30 s', async () => {
    const r = await briefing(() => [NO_SLOT]);
    expect(r.valve('MaxSpectatorsValve') ?? 0).toBe(0);
    go(r, 'CRgame');
    r.press('CROSS', 4);
    await until(r, () => r.current() === CREATE_GAME, 10 * SECOND);
    await r.settle(SETTLED);
    expect([r.current(), r.valve('MaxSpectatorsValve')]).toEqual([CREATE_GAME, 8]);
    r.press('TRIANGLE', 6);                                              // create_game_exit: the valves saved, the briefing room
    await until(r, () => r.current() === BRIEFING_ROOM, 10 * SECOND);
    await r.settle(SETTLED);
    expect([r.current(), r.creates.length, r.joins.length]).toEqual([BRIEFING_ROOM, 0, 0]);
    await quietTimeout(r);
  });
});
