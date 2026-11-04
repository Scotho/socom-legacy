import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS, type DialogDesign } from '../../src/dialog';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { LobbyClient } from '../../src/screens/lobbyClient';
import { lobbySessionStart, seedWorldOfSocomValves, type ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import {
  BRIEFING_ROOM, BRIEFING_ROOM_COMMAND_ROWS, BRIEFING_ROOM_GLOBAL_VALVES, BriefingRoomCommands,
  GAME_LIST_QUERY, GAME_LIST_VAR, JOIN_ROOM_FAILURE_TEXT, LOBBY_STATE_CREATE_CHANNEL, LOBBY_STATE_JOIN_CHANNEL, LOBBY_WORLD_FILTER,
  MEDIUS_LOBBY_NAME_VAR, ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER, ROOM_PLAYER_IN_LOBBY_COLOR, ROOM_PLAYER_LIST_PERIOD_S, ROOM_PLAYER_LIST_RETRIEVING,
  ROOM_PLAYER_LIST_SESSION_ADAPTATION, ROOM_PLAYER_LIST_VAR, ROOM_PLAYER_TAG_COLOR, ROOM_RANK_BITS_VALVE, gameListRow, gameStatsD, seedBriefingRoomValves,
  type BriefingRoomService, type GameListEntry, type RoomPlayerEntry,
} from '../../src/screens/briefingRoomCommands';

/**
 * ONL-12's rows (web research 162): the join's half of the rooms list -- `CanJoinRoom` (`FUN_0027d690` D:L126002-126020
 * -> `FUN_002e34e0` D:L184681-184712), `JoinMPRoom` (0x27d270 -> `FUN_002e3790` D:L184759-184849) and the lobby's
 * state 19 (`FUN_002ee290` D:L190668-190701, its reply `FUN_002ee3a0` D:L190704-190776) -- and the briefing room's game
 * list (`RefreshGameList` `FUN_0027db40` D:L126173-126210 -> `FUN_002e28d0` -> `FUN_002e2920` D:L184255-184315, the
 * reply `FUN_002e2b00` D:L184318-184388, the draw `FUN_002e2ce0` D:L184391-184506), over fake services. Synthetic
 * replies; nothing measured on the original running.
 */

const cmd = (fn: string, arg = 'NA', anim = 'join_room'): ZAnimUiCommand =>
  ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const call = (c: ZAnimUiCommand) => [c, uiCommandRowByName(c.fn!)!, undefined] as const;
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const ROOMS = [room('Alpha', 1), room('Bravo', 2, { genericField1: 0b0110 }), room('Delta', 4), room('Charlie', 3, { endOfList: true })];
/** A GameStats 'D' record as hex (512 digits): bytes 3 (spectators in), 4 (spectator slots), 6 (the sort order), 7 (the rank bits), 8 (the map). */
const stats = (o: { spec?: number; slots?: number; order?: number; ranks?: number; map?: number } = {}): string => {
  const b = new Uint8Array(256);
  b[0] = 0x44; b[3] = o.spec ?? 0; b[4] = o.slots ?? 0; b[6] = o.order ?? 0; b[7] = o.ranks ?? 0; b[8] = o.map ?? 0;
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};
const game = (gameName: string, mediusWorldId: number, o: Partial<GameListEntry> = {}): GameListEntry => ({
  status: 0, mediusWorldId, playerCount: 1, minPlayers: 2, maxPlayers: 24, gameLevel: 51, playerSkillLevel: 0, rulesSet: 0, genericField1: 1,
  genericField2: 65000, genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName, gameStats: stats({ slots: 8 }), endOfList: false, ...o,
});
/** The s4 game (research 154 R154.8): `test$~Channel 1`, one player, MaxPlayers 24, eight spectator slots, GenericField2 65000. */
const S4_GAME = game('test$~Channel 1', 7, { endOfList: true });
/** Horizon's answer to one in no channel (desktop@be557831 MLS.cs:2963-2970): one NoResult row ending the list. */
const NO_PLAYERS: RoomPlayerEntry = {
  status: 1, accountId: 0, accountName: '', onlineState: { connectStatus: 0, lobbyWorldId: 0, gameWorldId: 0, lobbyName: '', gameName: '' }, endOfList: true,
};
const cells = (v: UiVarValue | undefined): unknown[][] => (v?.type === 'array' ? v.value.map((r) => (r.type === 'array' ? r.value.map((c) => ('value' in c ? c.value : null)) : [])) : []);

function rig(o: { service?: Partial<BriefingRoomService>; rooms?: ChannelListEntry[]; up?: boolean; random?: () => number; chat?: { drawRoom(): void }; now?: () => number; gamePing?: (room: string, e: GameListEntry) => number | undefined } = {}) {
  const uiVars = new UiVarManager();
  lobbySessionStart(uiVars);
  const valves = new ValveStore();
  seedWorldOfSocomValves(valves);                    // the launch's seed, as the page's (GameSpeedFilter 65000, FF_FILTER 2)
  seedBriefingRoomValves(valves);
  const requests: { op: string; body: unknown }[] = [];
  const events: [string, string | null][] = [];
  const names = Object.fromEntries(Object.entries(DIALOG_EVENTS).map(([k, v]) => [v, k]));
  const service: BriefingRoomService = {
    joinChannel: (q) => { requests.push({ op: 'join-channel', body: q }); return o.service?.joinChannel?.(q) ?? Promise.resolve({ status: 0, mediusWorldId: q.mediusWorldId }); },
    setGameListFilter: (q) => { requests.push({ op: 'set-filter', body: q }); return o.service?.setGameListFilter?.(q) ?? Promise.resolve({ status: 0, filterId: q.filterField }); },
    leaveChannel: () => { requests.push({ op: 'leave-channel', body: {} }); return o.service?.leaveChannel?.() ?? Promise.resolve({ status: 0 }); },
    gameList: (q) => { requests.push({ op: 'game-list', body: q }); return o.service?.gameList?.(q) ?? Promise.resolve([S4_GAME]); },
    roomPlayerList: (q) => { requests.push({ op: 'room-player-list', body: q }); return o.service?.roomPlayerList?.(q) ?? Promise.resolve([NO_PLAYERS]); },
  };
  let logins = 0;
  const lobby = new LobbyClient({ valves: () => valves, service: { login: () => Promise.resolve({ status: 0, ticket: `T${++logins}` }), register: () => Promise.resolve({ status: 0 }) }, event: () => {} });
  const rooms = o.rooms ?? ROOMS;
  let input: string | null = 'Alpha';
  const c = new BriefingRoomCommands({
    uiVars, valves: () => valves, lobby, service, rooms: () => rooms, inputString: () => input, random: o.random, ticket: () => lobby.ticket(),
    event: (kind, text) => { events.push([names[kind]!, text]); }, ...(o.chat ? { chat: o.chat } : {}), ...(o.now ? { now: o.now } : {}),
    ...(o.gamePing ? { gamePing: o.gamePing } : {}),
  });
  const host = new UiCommandHost({});
  c.register(host);
  /** The lobby logged in and standing in state 11, as the menu is reached (research 157 R157.5). */
  const online = async (): Promise<void> => {
    lobby.connect('localhost', 10075);
    lobby.login('socomc', 'pw');
    for (let i = 0; i < 12 && lobby.state() !== 11; i++) { lobby.step(); await flush(); }
  };
  const step = async (n = 1): Promise<void> => { for (let i = 0; i < n; i++) { lobby.step(); await flush(); } };
  return { uiVars, valves, lobby, c, host, requests, events, online, step, setInput: (s: string | null) => { input = s; }, value: (n: string) => uiVars.find(n)?.value };
}

describe('the rows (W9.R4: PLAT-08\'s host is a registry; no table edit)', () => {
  it('are the table\'s rows 49 JoinMPRoom, 183 CanJoinRoom (ONL-11\'s, the join\'s half) and 40 RefreshGameList (ONL-12)', () => {
    expect(BRIEFING_ROOM_COMMAND_ROWS.map((r) => `${r.row} ${r.id} ${r.name} ${r.task}`)).toEqual([
      '49 47 JoinMPRoom ONL-11', '183 185 CanJoinRoom ONL-11', '40 41 RefreshGameList ONL-12', '42 43 RefreshRoomPlayerList ONL-12',
      '170 172 GetGameInfo ONL-12',
    ]);
    for (const r of BRIEFING_ROOM_COMMAND_ROWS) {
      const row = uiCommandRowByName(r.name)!;
      expect([row.index, row.id, row.fn, row.task], r.name).toEqual([r.row, r.id, r.fn, r.task]);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
    }
  });

  it('register sets each body in the host: a dispatch reaches it, not the declared row', () => {
    const r = rig();
    expect(r.host.dispatch(cmd('CanJoinRoom', 'INPUT_STRING'))).toMatchObject({ kind: 'table', answer: true });
  });
});

describe('CanJoinRoom (FUN_0027d690 -> FUN_002e34e0)', () => {
  it('the room of the list\'s input string found: 1 -- also for a room with rank bits (the page holds no tier: PLAYER_TIER_PARKED_READING; the services judge it, SVC-14); not found: 0', () => {
    const r = rig();
    expect(r.c.CanJoinRoom(...call(cmd('CanJoinRoom', 'INPUT_STRING')))).toBe(true);
    r.setInput('Bravo');
    expect(r.c.CanJoinRoom(...call(cmd('CanJoinRoom', 'INPUT_STRING')))).toBe(true);
    r.setInput('Echo');
    expect(r.c.CanJoinRoom(...call(cmd('CanJoinRoom', 'INPUT_STRING')))).toBe(false);
    expect(r.c.CanJoinRoom(...call(cmd('CanJoinRoom', 'Delta')))).toBe(true);           // a literal argument is the name itself
  });
});

describe('JoinMPRoom (0x27d270 -> FUN_002e3790) and the lobby\'s state 19 (FUN_002ee290, FUN_002ee3a0)', () => {
  it('offline (the session down, or not in state 11): 0, nothing queued, nothing sent', async () => {
    const r = rig();
    expect(r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')))).toBe(false);
    await r.step(3);
    expect(r.requests).toEqual([]);
  });

  it('a room of the list: room_rank_bits its four bits, MEDIUS_LOBBY_NAME its name, state 19; GAMELISTVAR emptied and JoinChannel sent with its world id and the empty password', async () => {
    const r = rig();
    await r.online();
    r.uiVars.set(GAME_LIST_VAR, { type: 'array', value: [{ type: 'string', value: 'stale' }] });
    r.setInput('Bravo');
    expect(r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')))).toBe(true);
    expect([r.valves.find(ROOM_RANK_BITS_VALVE)!.value, r.value(MEDIUS_LOBBY_NAME_VAR)]).toEqual([0b0110, { type: 'string', value: 'Bravo' }]);
    await r.step(1);
    expect(r.lobby.state()).toBe(LOBBY_STATE_JOIN_CHANNEL);
    expect(r.valves.find('socom_online_state')!.value).toBe(19);
    expect(r.value(GAME_LIST_VAR)).toEqual({ type: 'array', value: [] });
    expect(r.requests[0]).toEqual({ op: 'join-channel', body: { mediusWorldId: 2, lobbyChannelPassword: '' } });
  });

  it('success: state 11 and MP_JOIN_ROOM (ROOM_JOIN_NO_SECOND_SERVER_ADAPTATION), then the lobby world\'s filter (FUN_002efc80: field 10, operator 0, baseline 0)', async () => {
    const r = rig();
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    expect(r.lobby.state()).toBe(11);
    expect(r.events).toEqual([['MP_JOIN_ROOM', null]]);
    expect(r.requests.map((q) => q.op)).toEqual(['join-channel', 'set-filter']);
    expect(r.requests[1]!.body).toEqual(LOBBY_WORLD_FILTER);
    expect(LOBBY_WORLD_FILTER).toEqual({ filterField: 10, comparisonOperator: 0, baselineValue: 0 });
  });

  it('ONL-23: the success draws the room\'s chat lines last (FUN_002efc80 D:L191662-191664: FUN_002f5020 with MEDIUS_CHAT_RECV_VAR held)', async () => {
    const drawn: string[] = [];
    const r = rig({ chat: { drawRoom: () => { drawn.push(r.requests.map((q) => q.op).join(',')); } } });
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    expect(drawn).toEqual(['join-channel,set-filter']);
  });

  it('NET-DRAIN: the drain\'s refusal as the transport passes it on ({ status: -966 }): the join-room failure at once, no wait', async () => {
    const r = rig({ service: { joinChannel: () => Promise.resolve({ status: -966, mediusWorldId: 0 }) } });
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    expect(r.lobby.state()).toBe(11);
    expect(r.events).toEqual([['MP_MEDIUS_JOIN_ROOM_FAILURE', JOIN_ROOM_FAILURE_TEXT]]);
  });

  it('a refusal (any status but success): state 11 and MP_MEDIUS_JOIN_ROOM_FAILURE with the client\'s text (S:0x3f49a0); no filter', async () => {
    const r = rig({ service: { joinChannel: () => Promise.resolve({ status: -948, mediusWorldId: -1 }) } });
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    expect(r.lobby.state()).toBe(11);
    expect(r.events).toEqual([['MP_MEDIUS_JOIN_ROOM_FAILURE', JOIN_ROOM_FAILURE_TEXT]]);
    expect(JOIN_ROOM_FAILURE_TEXT).toBe('Cannot join room. It may be full. Please try another.');
    expect(r.requests.map((q) => q.op)).toEqual(['join-channel']);
  });

  it('a request never answered: state 19 stands, nothing posted', async () => {
    const r = rig({ service: { joinChannel: () => Promise.reject(new Error('503')) } });
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    expect([r.lobby.state(), r.events]).toEqual([19, []]);
  });

  it('a JoinChannel success that arrives after the session was lost (state 2) is dropped: no state 11, no MP_JOIN_ROOM (the state-19 guard)', async () => {
    let answer!: (r: { status: number; mediusWorldId: number }) => void;
    const r = rig({ service: { joinChannel: () => new Promise((res) => { answer = res; }) } });
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(2);
    r.lobby.sessionLost(r.lobby.ticket()!);
    await r.step(2);
    answer({ status: 0, mediusWorldId: 1 });
    await r.step(2);
    expect([r.lobby.state(), r.events.map((e) => e[0])]).toEqual([2, []]);
    expect(r.requests.map((q) => q.op)).toEqual(['join-channel']);
  });

  it('a JoinChannel success from before a logoff and a fresh login is dropped while the new join waits (the join sequence guard)', async () => {
    const answers: ((r: { status: number; mediusWorldId: number }) => void)[] = [];
    const r = rig({ service: { joinChannel: () => new Promise((res) => { answers.push(res); }) } });
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(2);
    r.lobby.disconnect();                                                // ONL-10's logoff
    await r.online();
    expect(r.lobby.ticket()).toBe('T2');
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(2);
    expect(r.lobby.state()).toBe(19);
    answers[0]!({ status: 0, mediusWorldId: 1 });
    await r.step(2);
    expect([r.lobby.state(), r.events]).toEqual([19, []]);
    answers[1]!({ status: 0, mediusWorldId: 1 });
    await r.step(2);
    expect([r.lobby.state(), r.events]).toEqual([11, [['MP_JOIN_ROOM', null]]]);
  });

  it('a join waits for a leave still in flight: JoinChannel is sent only once /lobby/leave-channel is answered (ROOM_LEAVE_ADAPTATION)', async () => {
    let left!: () => void;
    const r = rig({ service: { leaveChannel: () => new Promise((res) => { left = () => res({ status: 0 }); }) } });
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'NONE', 'exit_lobby')));
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    expect(r.requests.map((q) => q.op)).toEqual(['leave-channel']);
    left();
    await r.step(3);
    expect(r.requests.map((q) => q.op)).toEqual(['leave-channel', 'join-channel', 'set-filter']);
    expect(r.events).toEqual([['MP_JOIN_ROOM', null]]);
  });

  it('NONE answers 1 at once and writes nothing; the page tells the server the room is left (ROOM_LEAVE_ADAPTATION)', async () => {
    const r = rig();
    await r.online();
    r.uiVars.set(r.uiVars.add(MEDIUS_LOBBY_NAME_VAR, null, 2), { type: 'string', value: 'Alpha' });
    expect(r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'NONE', 'exit_lobby')))).toBe(true);
    await r.step(2);
    expect([r.lobby.state(), r.value(MEDIUS_LOBBY_NAME_VAR)]).toEqual([11, { type: 'string', value: 'Alpha' }]);
    expect(r.requests).toEqual([{ op: 'leave-channel', body: {} }]);
  });

  it('RANDOM picks a record by the random draw, (count - 1) x r; a name no record holds queues state 20, which finds no record and sends nothing', async () => {
    const r = rig({ random: () => 0.7 });
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'RANDOM')));
    expect(r.value(MEDIUS_LOBBY_NAME_VAR)).toEqual({ type: 'string', value: 'Delta' });   // floor(3 x 0.7) = 2: the third record
    const s = rig();
    await s.online();
    s.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'Echo')));
    await s.step(2);
    expect([s.lobby.state(), s.requests]).toEqual([LOBBY_STATE_CREATE_CHANNEL, []]);
  });
});

describe('the game list (RefreshGameList -> FUN_002e28d0 -> FUN_002e2920; FUN_002e2b00; FUN_002e2ce0)', () => {
  async function joined(o: Parameters<typeof rig>[0] = {}) {
    const r = rig(o);
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    r.requests.length = 0;
    return r;
  }

  it('asks page 1 of 256 (D:L184292) and draws B_43\'s row: the name cut at $~, IN 1 MAX 16, SPEC 0 MAX 8, the red dot, two empty boxes, the four medals', async () => {
    const r = await joined();
    expect(r.c.RefreshGameList(...call(cmd('RefreshGameList', 'NA', 'auto_refresh_gamelist')))).toBe(true);
    await flush();
    expect(r.requests).toEqual([{ op: 'game-list', body: GAME_LIST_QUERY }]);
    expect(GAME_LIST_QUERY).toEqual({ pageId: 1, pageSize: 256 });
    expect(cells(r.value(GAME_LIST_VAR))).toEqual([['test', 1, 16, 0, 8, 3, 1, 1, 1, 2, 3, 4]]);
  });

  it('the session down: 0 and nothing sent', () => {
    const r = rig();
    expect(r.c.RefreshGameList(...call(cmd('RefreshGameList')))).toBe(false);
    expect(r.requests).toEqual([]);
  });

  it('the rows sorted by GameStats byte 6, then the name without case (FUN_002e4a90, FUN_002e5d90)', async () => {
    const r = await joined({ service: { gameList: () => Promise.resolve([game('zulu', 3, { gameStats: stats({ order: 1 }) }), game('bravo', 4, { gameStats: stats({ order: 2 }) }), game('Alpha', 5, { gameStats: stats({ order: 2 }), endOfList: true })]) } });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(cells(r.value(GAME_LIST_VAR)).map((row) => row[0])).toEqual(['zulu', 'Alpha', 'bravo']);
  });

  it('an empty page (NoResult) draws what is held: nothing in a room just joined', async () => {
    const r = await joined({ service: { gameList: () => Promise.resolve([game('', 0, { status: 1, playerCount: 0, endOfList: true })]) } });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(r.value(GAME_LIST_VAR)).toEqual({ type: 'array', value: [] });
  });

  it('a game gone from the answer is drawn once more and dropped at the next request (FUN_002e4630: the records not refreshed since the last request)', async () => {
    let answer = [game('one', 3), game('two', 4, { endOfList: true })];
    const r = await joined({ service: { gameList: () => Promise.resolve(answer) } });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    answer = [game('two', 4, { endOfList: true })];
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(cells(r.value(GAME_LIST_VAR)).map((row) => row[0])).toEqual(['one', 'two']);
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(cells(r.value(GAME_LIST_VAR)).map((row) => row[0])).toEqual(['two']);
  });

  it('the client\'s filters at a fresh card\'s values pass every game; GamePasswordFilter 0 hides a game with a password (FUN_002e3080)', async () => {
    const r = await joined({ service: { gameList: () => Promise.resolve([game('open', 3), game('locked', 4, { securityLevel: 1, endOfList: true })]) } });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(cells(r.value(GAME_LIST_VAR)).map((row) => [row[0], row[6]])).toEqual([['locked', 0], ['open', 1]]);
    r.valves.set('GamePasswordFilter', 0, VALVE_TYPE.PERSIST);
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(cells(r.value(GAME_LIST_VAR)).map((row) => row[0])).toEqual(['open']);
  });

  it('a request never answered changes nothing; only the latest request\'s reply is drawn (GAME_LIST_LATEST_REPLY_ADAPTATION)', async () => {
    const pending: ((e: readonly GameListEntry[]) => void)[] = [];
    const r = await joined({ service: { gameList: () => new Promise((res) => { pending.push(res); }) } });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    pending[1]!([game('new', 4, { endOfList: true })]);
    await flush();
    pending[0]!([game('old', 3, { endOfList: true })]);
    await flush();
    expect(cells(r.value(GAME_LIST_VAR)).map((row) => row[0])).toEqual(['new']);
  });

  it('a game list reply whose ticket is gone or replaced is dropped: in flight across a logoff, a re-login and the same room joined again (GAME_LIST_LATEST_REPLY_ADAPTATION)', async () => {
    const pending: ((e: readonly GameListEntry[]) => void)[] = [];
    const r = await joined({ service: { gameList: () => new Promise((res) => { pending.push(res); }) } });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    r.lobby.disconnect();                                                // ONL-10's logoff
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    expect([r.lobby.state(), r.lobby.ticket(), r.value(GAME_LIST_VAR)]).toEqual([11, 'T2', { type: 'array', value: [] }]);
    pending[0]!([game('old', 3, { endOfList: true })]);
    await flush();
    expect(r.value(GAME_LIST_VAR)).toEqual({ type: 'array', value: [] });
    expect(r.c.gamesHeld()).toEqual([]);
  });

  it('the row of FUN_002e2ce0: a game with no player draws no ping; a clan game a full box; rank bits 0b0101 two medals; IN capped by MAX', () => {
    expect(gameListRow(game('x', 1, { playerCount: 0 }))).toEqual(['x', 0, 16, 0, 8, 0, 1, 1, 1, 2, 3, 4]);
    expect(gameListRow(game('x', 1, { playerCount: 20, genericField2: 450, genericField3: 9, gameStats: stats({ spec: 2, slots: 4, ranks: 0b0101 }) }))).toEqual(['x', 16, 16, 2, 4, 2, 1, 0, 1, 3]);
    expect(gameListRow(game('x', 1, { gameStats: stats({ ranks: 0x10 }) })).slice(8)).toEqual([]);   // byte 7 tested whole: high bits alone draw none
  });

  it('gameStatsD brings an older record up to the D record (FUN_002f7d90): C gains a zero byte 7', () => {
    const c = new Uint8Array(256); c[0] = 0x43; c[3] = 1; c[4] = 2; c[7] = 51;
    const d = gameStatsD([...c].map((x) => x.toString(16).padStart(2, '0')).join(''));
    expect([d[0], d[3], d[4], d[7], d[8]]).toEqual([0x44, 1, 2, 0, 51]);
  });
});

describe('SVC-15: the room\'s PLAYER LIST (RefreshRoomPlayerList FUN_0027d900 -> FUN_002f11f0 -> FUN_002f1240; FUN_002f13f0; FUN_002f1670)', () => {
  const str = (value: string): UiVarValue => ({ type: 'string', value });
  const arr = (...value: UiVarValue[]): UiVarValue => ({ type: 'array', value });
  const keyed = (text: string, rgb: readonly number[]): UiVarValue => arr(str('VALUE'), str(text), str('COLOR'), arr(...rgb.map((value) => ({ type: 'real' as const, value }))));
  const NO_TAG = keyed('', ROOM_PLAYER_TAG_COLOR);
  const ALPHA = { lobbyWorldId: 1, lobbyName: 'Alpha' };
  const member = (accountId: number, accountName: string, connectStatus: number, o: { gameWorldId?: number; gameName?: string; endOfList?: boolean } = {}): RoomPlayerEntry => ({
    status: 0, accountId, accountName, onlineState: { connectStatus, gameWorldId: o.gameWorldId ?? -1, gameName: o.gameName ?? '', ...ALPHA }, endOfList: o.endOfList ?? false,
  });
  /** The room's four as the server lists them, in join order: Zulu in a game, mike in the room, Kilo logging in, Lima disconnecting. */
  const FOUR = [member(41, 'Zulu', 3, { gameWorldId: 9, gameName: 'Night Raid' }), member(42, 'mike', 2), member(43, 'Kilo', 1), member(44, 'Lima', 0, { endOfList: true })];
  async function joined(o: Parameters<typeof rig>[0] = {}) {
    const r = rig(o);
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    r.requests.length = 0;
    return r;
  }
  const list = (arg = 'NA', anim = 'refresh_gamelist') => cmd('RefreshRoomPlayerList', arg, anim);

  it('asks GetLobbyPlayerNames_ExtraInfo for the room joined (+0x18 DAT_0066a538, D:L192337), and says "Retrieving player list from server..." while the list holds no row (D:L192324-192335)', async () => {
    let answer!: (rows: readonly RoomPlayerEntry[]) => void;
    const r = await joined({ service: { roomPlayerList: () => new Promise((res) => { answer = res; }) } });
    expect(r.c.RefreshRoomPlayerList(...call(list()))).toBe(true);
    expect(r.requests).toEqual([{ op: 'room-player-list', body: { mediusWorldId: 1 } }]);
    expect(r.value(ROOM_PLAYER_LIST_VAR)).toEqual(arr(str(ROOM_PLAYER_LIST_RETRIEVING)));
    expect(ROOM_PLAYER_LIST_RETRIEVING).toBe('Retrieving player list from server...');
    answer(FOUR);
    await flush();
    expect(r.value(ROOM_PLAYER_LIST_VAR)).not.toEqual(arr(str(ROOM_PLAYER_LIST_RETRIEVING)));
  });

  it('draws the rows sorted by name (FUN_002f1980 with FUN_002f1950, strcmp): ["%d" of the id, the name, the game / "In Lobby" / "Logging In" / "Disconnecting", the tag cell]', async () => {
    const r = await joined({ service: { roomPlayerList: () => Promise.resolve(FOUR) } });
    r.c.RefreshRoomPlayerList(...call(list()));
    await flush();
    // Lima, answered 0 (Disconnected), is dropped at the end of the list with the rows the reply did not name: the test is
    // the row's +0x40 being 0 (D:L192415-192416), so "Disconnecting" is drawn only for a held row when a reply fails (below).
    expect(r.value(ROOM_PLAYER_LIST_VAR)).toEqual(arr(
      arr(str('43'), str('Kilo'), str('Logging In'), NO_TAG),
      arr(str('41'), str('Zulu'), str('Night Raid'), NO_TAG),
      arr(str('42'), str('mike'), keyed('In Lobby', ROOM_PLAYER_IN_LOBBY_COLOR), NO_TAG),   // strcmp: lower case after upper
    ));
    expect([ROOM_PLAYER_IN_LOBBY_COLOR, ROOM_PLAYER_TAG_COLOR]).toEqual([[91, 72, 36], [128, 64, 32]]);
  });

  it('at most once every ROOM_PLAYER_LIST_PERIOD_S (10 s on the page\'s clock, D:L192307-192308) and one at a time (DAT_0044f9f0, D:L192315 / D:L192424)', async () => {
    let now = 0;
    const answers: ((rows: readonly RoomPlayerEntry[]) => void)[] = [];
    const r = await joined({ now: () => now, service: { roomPlayerList: () => new Promise((res) => { answers.push(res); }) } });
    const asked = (): number => r.requests.filter((q) => q.op === 'room-player-list').length;
    r.c.RefreshRoomPlayerList(...call(list()));
    now = 20_000;
    r.c.RefreshRoomPlayerList(...call(list()));               // one out: nothing, however late
    expect(asked()).toBe(1);
    answers[0]!(FOUR);
    await flush();
    r.c.RefreshRoomPlayerList(...call(list()));               // answered, 20 s on: the next
    expect(asked()).toBe(2);
    answers[1]!(FOUR);
    await flush();
    now = 29_999;
    r.c.RefreshRoomPlayerList(...call(list()));               // 9.999 s after the last: nothing
    expect(asked()).toBe(2);
    now = 30_000;
    r.c.RefreshRoomPlayerList(...call(list()));
    expect(asked()).toBe(3);
    expect(ROOM_PLAYER_LIST_PERIOD_S).toBe(10);
  });

  it('the reply updates a held row in place, adds a new one, and at the end of the list drops each row the reply did not name (its +0x40 cleared at the request, D:L192318-192322, D:L192411-192422)', async () => {
    let now = 0;
    let rows: readonly RoomPlayerEntry[] = FOUR;
    const r = await joined({ now: () => now, service: { roomPlayerList: () => Promise.resolve(rows) } });
    r.c.RefreshRoomPlayerList(...call(list()));
    await flush();
    rows = [member(42, 'mike', 3, { gameWorldId: 9, gameName: 'Night Raid' }), member(45, 'Echo', 2, { endOfList: true })];
    now = 10_000;
    r.c.RefreshRoomPlayerList(...call(list()));
    await flush();
    expect(cells(r.value(ROOM_PLAYER_LIST_VAR)).map((row) => row.slice(0, 3))).toEqual([['45', 'Echo', expect.anything()], ['42', 'mike', 'Night Raid']]);
    expect(r.c.roomPlayerState('mike')).toEqual({ connectStatus: 3, gameWorldId: 9, gameName: 'Night Raid', ...ALPHA });
  });

  it('a status not Success draws what is held and frees the request (D:L192428-192431): every held row then drawn as its cleared state, "Disconnecting"', async () => {
    let now = 0;
    let rows: readonly RoomPlayerEntry[] = FOUR;
    const r = await joined({ now: () => now, service: { roomPlayerList: () => Promise.resolve(rows) } });
    r.c.RefreshRoomPlayerList(...call(list()));
    await flush();
    rows = [NO_PLAYERS];
    now = 10_000;
    r.c.RefreshRoomPlayerList(...call(list()));
    await flush();
    expect(cells(r.value(ROOM_PLAYER_LIST_VAR)).map((row) => [row[1], row[2]])).toEqual([['Kilo', 'Disconnecting'], ['Zulu', 'Disconnecting'], ['mike', 'Disconnecting']]);
    now = 20_000;
    r.c.RefreshRoomPlayerList(...call(list()));
    expect(r.requests.filter((q) => q.op === 'room-player-list')).toHaveLength(3);   // freed
  });

  it('0 with the session down; no room record held: the clock moves, nothing is sent (D:L192308, D:L192313-192314)', async () => {
    const down = rig();
    expect(down.c.RefreshRoomPlayerList(...call(list()))).toBe(false);
    expect(down.requests).toEqual([]);
    const r = rig();
    await r.online();
    expect(r.c.RefreshRoomPlayerList(...call(list()))).toBe(true);
    expect(r.requests).toEqual([]);
  });

  it('CLAN_TAGS (S:0x3ef370) is the other arm, FUN_002f0ea0 (PlayerInfo for each visible row\'s tag): 1 while up, nothing sent (ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER)', async () => {
    const r = await joined();
    expect(r.c.RefreshRoomPlayerList(...call(list('CLAN_TAGS', 'OnPlayerListScrollEnd')))).toBe(true);
    expect(r.requests).toEqual([]);
    expect(ROOM_PLAYER_CLAN_TAGS_PLACEHOLDER).toMatch(/CLAN_TAGS/);
  });

  it('ROOM_PLAYER_LIST_SESSION_ADAPTATION: a reply that lands after the ticket changed is dropped; the lobby\'s reset frees the request', async () => {
    let now = 0;
    const answers: ((rows: readonly RoomPlayerEntry[]) => void)[] = [];
    const r = await joined({ now: () => now, service: { roomPlayerList: () => new Promise((res) => { answers.push(res); }) } });
    r.c.RefreshRoomPlayerList(...call(list()));
    r.lobby.sessionLost(r.lobby.ticket()!);
    await r.step(2);
    answers[0]!(FOUR);
    await flush();
    expect(r.c.roomPlayerState('Kilo')).toBeNull();
    expect(ROOM_PLAYER_LIST_SESSION_ADAPTATION).toMatch(/ticket/);
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    now = 10_000;
    r.c.RefreshRoomPlayerList(...call(list()));
    expect(r.requests.filter((q) => q.op === 'room-player-list')).toHaveLength(2);   // the reset freed the one out
  });

  it('PLAYER INFO\'s BRIEFING origin reads the room\'s rows by the reply\'s name (FUN_002e3610, strcmp: case kept) -- its online state whole', async () => {
    const r = await joined({ service: { roomPlayerList: () => Promise.resolve(FOUR) } });
    expect(r.c.roomPlayerState('Zulu')).toBeNull();                          // nothing held before the list
    r.c.RefreshRoomPlayerList(...call(list()));
    await flush();
    expect(r.c.roomPlayerState('Zulu')).toEqual({ connectStatus: 3, gameWorldId: 9, gameName: 'Night Raid', ...ALPHA });
    expect(r.c.roomPlayerState('zulu')).toBeNull();
    expect(r.c.roomPlayerState('Papa')).toBeNull();
  });
});

describe('the briefing room\'s rows: no gate stands (ONL-23 retired the text chat\'s, research 266 §1)', () => {
  const design = {} as DialogDesign;
  const start = (animation: string, dialog = BRIEFING_ROOM) => ({ dialog, design, animation, argument: null });

  it('every animation of the dialog starts as the disc binds it: do_chat, playerinfo_send_message, send_chat, the scrolls', () => {
    const r = rig();
    for (const a of ['do_chat', 'playerinfo_send_message', 'send_chat', 'scroll_chat_up', 'scroll_chat_down', 'join_game', 'OnCreateGamePress']) {
      expect(r.host.bindingStart(start(a)), a).toBe(false);
    }
  });

  it('the filters the list reads that the dialog\'s chapter does not name: global_valves.rdr\'s GamePasswordFilter and LockedFilter, 2 PERSIST', () => {
    expect(BRIEFING_ROOM_GLOBAL_VALVES).toEqual([{ name: 'GamePasswordFilter', value: 2, type: 'PERSIST' }, { name: 'LockedFilter', value: 2, type: 'PERSIST' }]);
  });
});

describe("GAME-PING (product track, a browser adaptation): the page's measured PING cell, the wire unchanged", () => {
  async function joined(o: Parameters<typeof rig>[0] = {}) {
    const r = rig(o);
    await r.online();
    r.c.JoinMPRoom(...call(cmd('JoinMPRoom', 'INPUT_STRING')));
    await r.step(3);
    r.requests.length = 0;
    return r;
  }

  it("the PING cell is the hook's for a game with players, asked by the room's name; the original's 0 for an empty game, never asked", async () => {
    const asked: [string, string][] = [];
    const r = await joined({
      gamePing: (room, e) => { asked.push([room, e.gameName]); return 1; },
      service: { gameList: () => Promise.resolve([game('busy', 3), game('empty', 4, { playerCount: 0, endOfList: true })]) },
    });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(cells(r.value(GAME_LIST_VAR)).map((row) => [row[0], row[5]])).toEqual([['busy', 1], ['empty', 0]]);
    expect(asked).toEqual([['Alpha', 'busy']]);
  });

  it("no hook: the original's band of GenericField2 (65000: the red dot, D:L184438-184452); the hook's undefined keeps it too", async () => {
    const r = await joined({ gamePing: () => undefined });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(cells(r.value(GAME_LIST_VAR))[0]![5]).toBe(3);
    expect(gameListRow(S4_GAME)[5]).toBe(3);
  });

  it("redrawGameList draws the held games again with the hook's new answer, sending nothing", async () => {
    let band = 0;
    const r = await joined({ gamePing: () => band });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(cells(r.value(GAME_LIST_VAR))[0]![5]).toBe(0);
    r.requests.length = 0;
    band = 2;
    r.c.redrawGameList();
    expect(cells(r.value(GAME_LIST_VAR))[0]![5]).toBe(2);
    expect(r.requests).toEqual([]);
  });

  it("redrawGameList onto a list drawn empty sets nothing (no second OnGameListUpdateUIVar the original never runs; review F2)", async () => {
    const r = await joined({ gamePing: () => 1, service: { gameList: () => Promise.resolve([game('', 0, { status: 1, playerCount: 0, endOfList: true })]) } });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(r.value(GAME_LIST_VAR)).toEqual({ type: 'array', value: [] });
    const held = r.uiVars.find(GAME_LIST_VAR)!.value;
    r.c.redrawGameList();
    expect(r.uiVars.find(GAME_LIST_VAR)!.value).toBe(held);         // the same value: never set again
  });

  it("the entries the client keeps are the original's: GenericField2 stays 65000 (the speed filter reads it)", async () => {
    const r = await joined({ gamePing: () => 1 });
    r.c.RefreshGameList(...call(cmd('RefreshGameList')));
    await flush();
    expect(r.c.gamesHeld().map((e) => e.genericField2)).toEqual([65000]);
  });
});
