import { describe, expect, it } from 'vitest';
import type { ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { BRIEFING_ROOM, type GameListEntry } from '../../src/screens/briefingRoomCommands';
import { GAME_LOBBY, GAME_SEAT_PASS_ADAPTATION, HOST_REPORT_BEFORE_JOIN_ADAPTATION, type GameLobbyView } from '../../src/screens/gameLobbyCommands';
import { CREATE_GAME } from '../../src/screens/createGameCommands';
import { HAVE } from './worldOfSocomRig';
import { gameLobbyRig, seat, type GameLobbyRigOptions } from './gameLobbyRig';

/**
 * SA-6b (the server split, SA.R22 (1)-(2), (4); product track, `GAME_SEAT_PASS_ADAPTATION`): a **placed** game's join
 * and the creator's world report answer the game's door and its game token, and the GAME LOBBY hands that pair to the
 * game socket's `open` (`ConnectToGameServer`); a **local** game's answers carry neither and the socket opens as before;
 * **one without the other** is refused on the page's existing paths -- the join's MP_MEDIUS_JOIN_GAME_FAILURE (state 11,
 * no leave posted, as a status refusal), the report's create_game failure (#295) -- and no socket is opened. Over the
 * disc's own dialogs (`gameLobbyRig.ts`), the join service and the socket fakes speaking for central and the door.
 * Doors and tokens invented.
 */

const SETTLED = 60;
const SECOND = 30;
const DOOR = 'wss://firehuge.play.socom2legacy.com/g/7';
const DOOR9 = 'wss://firehuge.play.socom2legacy.com/g/9';
/** A game token's form (three base64url parts), invented; joined so no literal reads as a credential. */
const TOKEN = ['aGVhZGVy', 'Y2xhaW1z', 'c2ln'].join('.');
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const ROOMS = [room('Alpha', 1, { playerCount: 2 }), room('Bravo', 2, { endOfList: true })];
const statsHex = (o: Record<number, number>): string => { const b = new Uint8Array(256); b[0] = 0x44; for (const [k, v] of Object.entries(o)) b[Number(k)] = v; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const GAME: GameListEntry = {
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 24, gameLevel: 2, playerSkillLevel: 0, rulesSet: 1, genericField1: 1, genericField2: 65000,
  genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'test$~Alpha', gameStats: statsHex({ 1: 5, 2: 6, 4: 8, 8: 2 }), endOfList: true,
};
type Rig = Awaited<ReturnType<typeof gameLobbyRig>>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const view = (seats: GameLobbyView['seats'], o: Partial<GameLobbyView> = {}): GameLobbyView => ({ seats, countdown: null, launched: false, ...o });
const cmd = { arg: '' } as never;

async function briefing(o: GameLobbyRigOptions = {}): Promise<Rig> {
  const r = await gameLobbyRig({ name: 'socomc', announcement: '', rooms: ROOMS, games: [GAME], ...o });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  go(r, 'briefingrooms');
  r.press('CROSS', 6);
  r.press('CROSS', 2);
  for (let i = 0; i < 200 && r.current() !== BRIEFING_ROOM; i++) await r.settle(1);
  await r.settle(SETTLED);
  return r;
}
function joinListed(r: Rig, row = 'JoinGame'): void {
  go(r, row);
  r.press('CROSS', 6);
  expect(r.focused()).toBe('GAMELIST');
  r.press('CROSS', 2);
}
async function until(r: Rig, done: () => boolean, frames = 60 * SECOND): Promise<void> { for (let i = 0; i < frames && !done(); i++) await r.settle(1); }
/** CREATE GAME from the briefing room: the name and the play list typed, SQUARE. */
async function create(r: Rig): Promise<void> {
  go(r, 'CRgame');
  r.press('CROSS', 4);
  await until(r, () => r.current() === CREATE_GAME, 10 * SECOND);
  await r.settle(SETTLED);
  r.uiVars.set(r.uiVars.add('GAMENAMEVAR', null, 2), { type: 'string', value: 'mine' });
  r.uiVars.set(r.uiVars.add('PLAYLISTVAR', null, 2), { type: 'array', value: [{ type: 'array', value: [{ type: 'int', value: 2 }] }] });
}

describe('SA-6b: the labels', () => {
  it('GAME_SEAT_PASS_ADAPTATION names the pair rule; HOST_REPORT_BEFORE_JOIN_ADAPTATION names the report\'s door', () => {
    expect(GAME_SEAT_PASS_ADAPTATION).toMatch(/both or neither/);
    expect(HOST_REPORT_BEFORE_JOIN_ADAPTATION).toMatch(/door/);
  });
});

describe.skipIf(!HAVE)(`SA-6b: the door and the game token through the GAME LOBBY${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('a placed game\'s join answer { status 0, door, token }: ConnectToGameServer opens the socket with that pair; the lobby is reached', async () => {
    const r = await briefing({ joinGame: (q) => Promise.resolve({ status: 0, mediusWorldId: q.mediusWorldId, door: DOOR, token: TOKEN }) });
    joinListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    expect([r.joins.map((j) => j.joinType), r.socketLog, r.current()]).toEqual([[0], [`open 7 ${DOOR} ${TOKEN}`], GAME_LOBBY]);
  });

  it('a spectator\'s join (WatchGame, joinType 1): the same door and token handed to the socket', async () => {
    const r = await briefing({ joinGame: (q) => Promise.resolve({ status: 0, mediusWorldId: q.mediusWorldId, door: DOOR, token: TOKEN }) });
    joinListed(r, 'WatchGame');
    await until(r, () => r.socketLog.length > 0, 10 * SECOND);
    expect([r.joins.map((j) => j.joinType), r.socketLog]).toEqual([[1], [`open 7 ${DOOR} ${TOKEN}`]]);
  });

  it('a local game (neither): the socket opens with no pair, as before', async () => {
    const r = await briefing();
    joinListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    expect([r.socketLog, r.current()]).toEqual([['open 7'], GAME_LOBBY]);
  });

  it('the creator: the join answers neither, the world report the pair -- the socket opens on the report\'s door (HOST_REPORT_BEFORE_JOIN_ADAPTATION)', async () => {
    const r = await briefing({
      lobbyView: (id) => view([seat(id, 'socomc', 'seal', { host: true, readyIn: 30 })]),
      worldReport: () => Promise.resolve({ status: 0, door: DOOR9, token: TOKEN }),
    });
    await create(r);
    r.press('SQUARE', 4);
    await until(r, () => r.current() === GAME_LOBBY, 20 * SECOND);
    expect([r.joins.length, r.reports.length, r.socketLog, r.current()]).toEqual([1, 1, [`open 9 ${DOOR9} ${TOKEN}`], GAME_LOBBY]);
  });

  it('a join answer with one without the other: state 11 and MP_MEDIUS_JOIN_GAME_FAILURE at once (the -966 refusal\'s line), no socket, no leave posted', async () => {
    const refused = await briefing({ joinGame: () => Promise.resolve({ status: -966, mediusWorldId: 0 }) });
    joinListed(refused);
    await refused.settle(2 * SECOND);
    const failure = refused.text('JoiningAnim');
    for (const half of [{ door: DOOR }, { token: TOKEN }]) {
      const r = await briefing({ joinGame: (q) => Promise.resolve({ status: 0, mediusWorldId: q.mediusWorldId, ...half }) });
      joinListed(r);
      await r.settle(2 * SECOND);
      const why = JSON.stringify(half);
      expect([r.joins.length, r.socketLog, r.lobby.state(), r.current(), r.leaves.length], why).toEqual([1, [], 11, BRIEFING_ROOM, 0]);
      expect(r.text('JoiningAnim'), why).toEqual(failure);
    }
  });

  it('the report answer with one without the other: create_game\'s failure (JoinGameServer 0, DisconnectFromGameServer, #295); no socket, no lobby', async () => {
    for (const half of [{ door: DOOR9 }, { token: TOKEN }]) {
      const r = await briefing({ worldReport: () => Promise.resolve({ status: 0, ...half }) });
      await create(r);
      const from = r.outcomes.length;
      r.press('SQUARE', 4);
      const seen = new Set<string>();
      for (let i = 0; i < 3 * SECOND; i++) { await r.settle(1); if (popupText(r) !== '') seen.add(popupText(r)); }
      const why = JSON.stringify(half);
      expect(r.calls(CREATE_GAME, from).filter((c) => /JoinGameServer|DisconnectFromGameServer|SWITCHMENU\(dlgGameLobby/.test(c)), why).toEqual(['JoinGameServer(NA) table', 'DisconnectFromGameServer(NA) table']);
      expect([r.builds.includes(GAME_LOBBY), r.socketLog.filter((l) => l.startsWith('open')), [...seen].some((t) => t.includes(loc(r, 295)))], why).toEqual([false, [], true]);
    }
  });

  it('the pair is the held game\'s only: another game held after a placed join opens with no pair', async () => {
    const r = await briefing({ joinGame: (q) => Promise.resolve({ status: 0, mediusWorldId: q.mediusWorldId, door: DOOR, token: TOKEN }) });
    joinListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    expect(r.socketLog).toEqual([`open 7 ${DOOR} ${TOKEN}`]);
    r.commands.randomGameFound({ ...GAME, mediusWorldId: 8 });
    r.commands.ConnectToGameServer(cmd, 0 as never, 0 as never);
    expect(r.socketLog.at(-1)).toBe('open 8');
  });
});
