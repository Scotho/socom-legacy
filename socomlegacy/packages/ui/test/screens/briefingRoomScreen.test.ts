import { describe, expect, it } from 'vitest';
import type { ListboxWidget } from '../../src/widgets/listbox';
import type { ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { BRIEFING_ROOM, JOIN_ROOM_FAILURE_TEXT, ROOM_PLAYER_LIST_VAR, type GameListEntry, type RoomPlayerEntry } from '../../src/screens/briefingRoomCommands';
import { PLAYER_INFO_VAR1, type LadderService } from '../../src/screens/ladderLobbyCommands';
import type { UiVarValue } from '../../src/uiVars';
import { HAVE, WORLD } from './worldOfSocomRig';
import type { ChatFwdLine } from '../../src/screens/briefingRoomChat';
import { USB_ENTER } from './personaRig';
import { TICKET, briefingRig, type BriefingRigOptions } from './briefingRoomRig';

/**
 * ONL-12 and ONL-23a over the machine (web research 162): from SOCOM II ONLINE (`dlgWorldOfSOCOM.rdr`) through a room
 * of the list into the BRIEFING ROOM (`dlgMPBriefingRoom.rdr`) and back out, every dialog built from the disc's own
 * layout and set (`briefingRoomRig.ts` over `worldOfSocomRig.ts`), the lobby client stepped as the page steps it, the
 * services fakes. What is pinned is the dialogs' own ANIMATIONS replayed: `join_room` and the lobby's state 19, the
 * event MP_JOIN_ROOM and the switch, the room's ONSTART with its game list, the chat panel (ONL-23a's, and ONL-23's text
 * chat: the keyboard on R1 and a USB ENTER, the line sent and drawn, the lines received, L1 / L2),
 * the way back (`exit_triage`), a refused join (`OnJoinRoomFailure`) and a lost session. CI on the fixtures.
 */

const SETTLED = 60;
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const HORIZON_ROOMS = [room('Alpha', 1, { playerCount: 2 }), room('Bravo', 2), room('Charlie', 3, { playerCount: 1 }), room('Delta', 4, { endOfList: true })];
const statsHex = (slots: number): string => { const b = new Uint8Array(256); b[0] = 0x44; b[4] = slots; b[8] = 51; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
/** The s4 game B_43 shows (research 154 R154.8). */
const S4_GAME: GameListEntry = {
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 24, gameLevel: 51, playerSkillLevel: 0, rulesSet: 0, genericField1: 1, genericField2: 65000,
  genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'test$~Channel 1', gameStats: statsHex(8), endOfList: true,
};
type Rig = Awaited<ReturnType<typeof briefingRig>>;
/** The periodic `TurnOnInvitations` left out of a dispatch list. */
const quiet = (calls: string[]): string[] => calls.filter((c) => !/^HasClanInvitations|^invitations\.op1|^DisableButton\(invitations\)|^EnableButton\(invitations\)/.test(c));
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const items = (r: Rig, list: string): string[] => (r.parts.current!.widgets.get(list) as ListboxWidget).items
  .map((i) => `${i.captions.filter((_, k) => i.images[k] == null).join(' ')} | ${i.images.filter((x) => x !== null).map((x) => x!.texture).join(' ')}`);
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const sounds = (r: Rig, from: number): string[] => r.sound.log.slice(from).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1]!);

/** The menu past SERVER NEWS, BRIEFING ROOMS pressed: the focus on ROOMLIST's first row (Alpha). */
async function rooms(o: BriefingRigOptions = {}): Promise<Rig> {
  const r = await briefingRig({ name: 'socomc', announcement: '', rooms: HORIZON_ROOMS, ...o });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  go(r, 'briefingrooms');
  r.press('CROSS', 6);
  expect(r.focused()).toBe('ROOMLIST');
  return r;
}
/** CROSS on the focused room row and the switch run to the briefing room's build. */
async function enter(r: Rig): Promise<void> {
  r.press('CROSS', 2);
  for (let i = 0; i < 200 && r.current() !== BRIEFING_ROOM; i++) await r.settle(1);
  await r.settle(SETTLED);
}

describe.skipIf(!HAVE)(`the BRIEFING ROOM over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('CROSS on a room row runs join_room: CanJoinRoom and JoinMPRoom on the list\'s row, .DINK, JoinChannel with the room\'s id; MP_JOIN_ROOM switches to dlgMPBriefingRoom.rdr', async () => {
    const r = await rooms();
    const from = r.outcomes.length, sound = r.sound.log.length;
    await enter(r);
    const world = quiet(r.calls(WORLD, from));
    expect(world[0]).toMatch(/^SuspendMenuInput\(5(\.0)?\) table$/);
    expect(world.filter((c) => /CanJoinRoom|JoinMPRoom/.test(c))).toEqual(['CanJoinRoom(INPUT_STRING) table', 'JoinMPRoom(INPUT_STRING) table']);
    expect(world).toContain('SWITCHMENU(dlgMPBriefingRoom.rdr) table');
    expect(world.filter((c) => /OnBadJoinState|POPUPDIALOG/.test(c))).toEqual([]);
    expect(sounds(r, sound)[0]).toBe('.DINK');
    expect(r.requests.slice(0, 2)).toEqual([
      { op: 'join-channel', body: { mediusWorldId: 1, lobbyChannelPassword: '' } },
      { op: 'set-filter', body: { filterField: 10, comparisonOperator: 0, baselineValue: 0 } },
    ]);
    expect([r.builds.at(-1), r.lobby.state(), r.valve('socom_online_state'), r.valve('room_rank_bits')]).toEqual([BRIEFING_ROOM, 11, 11, 0]);
  });

  it('the room\'s ONSTART: its name in the title band (MEDIUS_LOBBY_NAME), #522, JOIN GAME focused with #411; the game list asked (page 1 of 256) and drawn as B_43\'s row', async () => {
    const r = await rooms({ games: [S4_GAME] });
    await enter(r);
    expect(r.text('roomname')).toEqual(['Alpha']);
    expect(r.text('bar_title')).toEqual([r.loc.byId.get(522)!]);
    expect([r.focused(), r.text('DescriptionText')]).toEqual(['JoinGame', [r.loc.byId.get(411)!]]);
    expect(quiet(r.calls(BRIEFING_ROOM))).toContain('GAMELIST:RefreshGameList(NA) table');
    expect(r.requests.filter((q) => q.op === 'game-list')).toEqual([{ op: 'game-list', body: { pageId: 1, pageSize: 256 } }]);
    expect(items(r, 'GAMELIST')).toEqual([
      'test 1 16 0 8 | ping_dot_red.tif Icon_UnChecked_Box.tif Icon_UnChecked_Box.tif Medal_Blue.tif Medal_Bronze.tif Medal_Silver.tif Medal_Gold.tif',
    ]);
  });

  it('the list\'s headers are the disc\'s (#401-404, #520, #521) and its rows follow the service: every 30 s (autorefresh) and on REFRESH LIST', async () => {
    let games: GameListEntry[] = [];
    const r = await rooms({ games: () => Promise.resolve(games.length ? games : [{ ...S4_GAME, status: 1, gameName: '', playerCount: 0 }]) });
    await enter(r);
    expect(['CategoryText', 'Category2Text', 'Category4Text', 'Category5Text'].map((n) => r.text(n)[0])).toEqual([401, 402, 404, 521].map((id) => r.loc.byId.get(id)));
    expect(items(r, 'GAMELIST')).toEqual([]);
    games = [S4_GAME];
    await r.settle(31 * 30);
    expect(r.requests.filter((q) => q.op === 'game-list')).toHaveLength(2);
    expect(items(r, 'GAMELIST')).toHaveLength(1);
    go(r, 'refreshlist');
    const from = r.outcomes.length;
    r.press('CROSS', 4);
    await r.settle(2);
    expect(quiet(r.calls(BRIEFING_ROOM, from)).slice(0, 2)).toEqual(['GAMELIST:RefreshGameList(NA) table', 'PLAYERLIST:REFRESHROOMPLAYERLIST(NA) table']);   // SVC-15: the row's body
    expect(r.requests.filter((q) => q.op === 'game-list')).toHaveLength(3);
  });

  it('SVC-15: PLAYER LIST -- its ONACTIVATE (OnPlayerListAct) asks the room\'s players with an empty list (PLAYERLIST.op5, RefreshRoomPlayerList) and draws them sorted by name; CROSS on a row opens PLAYER INFO by the id, the BRIEFING origin\'s presence lines', async () => {
    const ALPHA = { lobbyWorldId: 1, lobbyName: 'Alpha' };
    const players: RoomPlayerEntry[] = [
      { status: 0, accountId: 41, accountName: 'Zulu', onlineState: { connectStatus: 3, gameWorldId: 9, gameName: 'Night Raid', ...ALPHA }, endOfList: false },
      { status: 0, accountId: 42, accountName: 'Echo', onlineState: { connectStatus: 2, gameWorldId: -1, gameName: '', ...ALPHA }, endOfList: true },
    ];
    const asked: unknown[] = [];
    const ladder: LadderService = {
      position: () => Promise.resolve({ status: 1, ladderPosition: 0, totalRankings: 0 }),
      list: () => Promise.resolve([{ status: 1, ladderPosition: 0, accountId: 0, accountName: '', stats: '', onlineState: { connectStatus: 0, lobbyWorldId: 0, gameWorldId: 0, lobbyName: '', gameName: '' }, endOfList: true }]),
      playerInfo: (q) => { asked.push(q); return Promise.resolve({ status: 0, accountName: 'Echo', playerStatus: 0, stats: '' }); },
    };
    const r = await rooms({ players, ladder });
    await enter(r);
    const from = r.outcomes.length;
    go(r, 'Player_list_button');
    await r.settle(4);
    expect(quiet(r.calls(BRIEFING_ROOM, from))).toContain('PLAYERLIST:REFRESHROOMPLAYERLIST(NA) table');
    expect(r.requests.filter((q) => q.op === 'room-player-list')).toEqual([{ op: 'room-player-list', body: { mediusWorldId: 1 } }]);
    const v: UiVarValue = r.uiVars.find(ROOM_PLAYER_LIST_VAR)!.value;
    expect(v.type === 'array' ? v.value.length : 0).toBe(2);
    expect(r.node('PLAYERLIST')!.visible).toBe(true);
    const list = r.parts.current!.widgets.get('PLAYERLIST') as ListboxWidget;
    expect(list.items.map((i) => i.captions)).toEqual([['42', 'Echo', 'In Lobby', ''], ['41', 'Zulu', 'Night Raid', '']]);   // sorted by name (FUN_002f1950)
    expect(list.items.map((i) => i.colors)).toEqual([[null, null, [91, 72, 36], [128, 64, 32]], [null, null, null, [128, 64, 32]]]);
    r.press('CROSS', 6);                                                     // ShowPlayerList: the list focused
    expect(r.focused()).toBe('PLAYERLIST');
    r.press('CROSS', 6);                                                     // playerinfo_activate: GetPlayerInfo(INPUT_STRING), origin 0 BRIEFING
    await r.settle(10);
    expect(asked).toEqual([{ accountId: 42 }]);
    const l1 = r.uiVars.find(PLAYER_INFO_VAR1)!.value;
    const tail = l1.type === 'array' ? l1.value.slice(13).map((row) => (row.type === 'array' ? row.value.map((c) => (c.type === 'string' ? c.value : c.type === 'array' ? (c.value[1] as { value: string }).value : '')) : [])) : [];
    expect(tail).toEqual([['ONLINE:', '0 min.'], ['BRIEFING ROOM:', 'Alpha'], ['GAME:', 'In Lobby']]);
  });

  it('ONL-23a: the chat panel drawn as the disc draws it -- #519 over CHATLIST on MEDIUS_CHAT_RECV_VAR, empty before a line; the help bar\'s TEXT CHAT', async () => {
    const r = await rooms();
    await enter(r);
    expect(r.text('ChatWindowTxt')).toEqual([r.loc.byId.get(519)!]);
    expect([r.node('CHATLIST')!.visible, r.text('CHATLIST'), r.uiVars.find('MEDIUS_CHAT_RECV_VAR')!.value]).toEqual([true, [], { type: 'array', value: [] }]);
    expect(r.text('InfoTextC')[0]).toMatch(/TEXT CHAT$/);
  });

  it('ONL-23: R1 runs do_chat -- the chat keyboard (ChatSkb on CHATMESSAGE, 100 / 99, the recipient edit MsgPlayer_Recipient); typed and applied, send_chat\'s SendMediusChat posts the room\'s line and the own line is drawn', async () => {
    const r = await rooms({ keyboard: true });
    await enter(r);
    const from = r.outcomes.length;
    r.press('TRIGGER_R1' as never, 6);
    expect(quiet(r.calls(BRIEFING_ROOM, from))).toEqual(['ClearUIVar(MsgPlayer_Recipient) table', 'ClearUIVar(CHATMESSAGE) table', 'GetTextInput(CHATMESSAGE) table']);
    expect([r.skb!.keyboard.isOpen, r.valve('KeyboardPurpose')]).toEqual([true, 1]);
    expect(r.skb!.keyboard.request).toMatchObject({ uiVar: 'CHATMESSAGE', skbName: 'ChatSkb', uiVar2: 'MsgPlayer_Recipient', maxChars: 100, maxBytes: 99 });
    r.type('hello room');
    await r.settle(4);
    expect(r.skb!.keyboard.isOpen).toBe(false);
    expect(quiet(r.calls(BRIEFING_ROOM, from))).toContain('SendMediusChat(CHATMESSAGE) table');
    expect(r.chatRequests.filter((q) => q.op === 'chat')).toEqual([{ op: 'chat', body: { messageType: 0, targetId: -1, message: 'hello room' } }]);
    expect(r.uiVars.find('MEDIUS_CHAT_RECV_VAR')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: '#C\x80\x80\x80 socomc: hello room' }] });
    expect(r.text('CHATLIST').join('|')).toContain('socomc: hello room');            // the colour code read by the wrap
  });

  it('ONL-23: a USB keyboard\'s ENTER runs the same do_chat; a line of 70 goes out as its first 63 (the whisper path: briefingRoomChat.test.ts, the rig types no "/")', async () => {
    const r = await rooms({ keyboard: true });
    await enter(r);
    const from = r.outcomes.length;
    // The menu's own USB queue (`MenuInputSource.usbKey`, the dispatch's step 6): one Enter with no keyboard up.
    const pad = r.input.source;
    let pending = true;
    r.input.source = { read: () => pad.read(), usbKey: () => { const k = pending ? USB_ENTER.hid : null; pending = false; return k; } };
    r.run(6);
    expect(quiet(r.calls(BRIEFING_ROOM, from))).toContain('GetTextInput(CHATMESSAGE) table');
    r.type('y'.repeat(70));
    await r.settle(4);
    expect(r.chatRequests.filter((q) => q.op === 'chat').map((q) => q.body)).toEqual([{ messageType: 0, targetId: -1, message: 'y'.repeat(63) }]);
  });

  it('ONL-23: the lines received (the poll, CHAT_POLL_MS_ADAPTATION) are drawn as "#C\\x80\\x80\\x80name: text", the room\'s last 11 kept; L1 and L2 scroll CHATLIST (scroll_chat_down / up: CHATLIST.op5 / op4)', async () => {
    let waiting: ChatFwdLine[] = [];
    const r = await rooms({ chatLines: () => { const out = waiting; waiting = []; return out; } });
    await enter(r);
    waiting = Array.from({ length: 12 }, (_, i) => ({ originatorAccountId: 7, originatorAccountName: 'bob', messageType: 0, message: `line ${i + 1}` }));
    await r.settle(2 * 30);
    const v = r.uiVars.find('MEDIUS_CHAT_RECV_VAR')!.value;
    const lines = v.type === 'array' ? v.value.map((e) => (e.type === 'string' ? e.value : '')).filter((s) => s !== '\n') : [];
    expect([lines.length, lines[0], lines[10]]).toEqual([11, '#C\x80\x80\x80bob: line 2', '#C\x80\x80\x80bob: line 12']);
    const scroll = (): number => { const c = r.node('CHATLIST')!.content; return c?.kind === 'wrapped' ? c.scroll : NaN; };
    expect(scroll()).toBe(0);
    const from = r.outcomes.length;
    r.press('TRIGGER_L1' as never, 4);
    expect([quiet(r.calls(BRIEFING_ROOM, from)), scroll()]).toEqual([['CHATLIST.op5(NA)'], 20]);
    r.press('TRIGGER_L1' as never, 4);
    r.press('TRIGGER_L2' as never, 4);
    expect([quiet(r.calls(BRIEFING_ROOM, from)).slice(2), scroll()]).toEqual([['CHATLIST.op4(NA)'], 20]);
  });

  it('CREATE GAME (ONL-13): the CRgame CROSS runs OnCreateGamePress, SWITCHMENU(dlgCreateGame.rdr); the JOIN GAME CROSS takes the list (a listed game join: gameLobbyScreen.test.ts)', async () => {
    let r = await rooms({ games: [S4_GAME] });
    await enter(r);
    go(r, 'JoinGame');
    r.press('CROSS', 6);
    expect(r.focused()).toBe('GAMELIST');
    r = await rooms({ games: [S4_GAME] });
    await enter(r);
    go(r, 'CRgame');
    const from = r.outcomes.length;
    r.press('CROSS', 20);
    for (let i = 0; i < 200 && r.current() !== 'dlgCreateGame.rdr'; i++) await r.settle(1);
    expect([quiet(r.calls(BRIEFING_ROOM, from)).filter((c) => /SWITCHMENU/.test(c)), r.current()]).toEqual([['SWITCHMENU(dlgCreateGame.rdr) table'], 'dlgCreateGame.rdr']);
  });

  it('the way back: TRIANGLE (exit_triage) -- .DINK, JoinMPRoom(NONE), /lobby/leave-channel, SWITCHMENU to SOCOM II ONLINE, whose ONSTART asks the rooms again', async () => {
    const r = await rooms();
    await enter(r);
    const from = r.outcomes.length, sound = r.sound.log.length, asked = r.queries.rooms.length;
    r.press('TRIANGLE', 4);
    for (let i = 0; i < 200 && r.current() !== WORLD; i++) await r.settle(1);
    await r.settle(SETTLED);
    expect(quiet(r.calls(BRIEFING_ROOM, from))).toEqual(['DisableButton(CRgame) table', 'DisableButton(join_game) table', 'JoinMPRoom(NONE) table', 'SWITCHMENU(dlgWorldOfSOCOM.rdr) table']);
    expect(sounds(r, sound)[0]).toBe('.DINK');
    expect(r.requests.at(-1)).toEqual({ op: 'leave-channel', body: {} });
    expect([r.builds.at(-1), r.valve('StartMusic'), r.queries.rooms.length]).toEqual([WORLD, 1, asked + 1]);
  });

  it('left, the room asks no more: no game list request across three 30 s cycles after TRIANGLE (autorefresh stops with the dialog)', async () => {
    const r = await rooms();
    await enter(r);
    r.press('TRIANGLE', 4);
    for (let i = 0; i < 200 && r.current() !== WORLD; i++) await r.settle(1);
    const asked = r.requests.filter((q) => q.op === 'game-list').length;
    expect(asked).toBeGreaterThan(0);
    await r.settle(3 * 31 * 30);
    expect([r.builds.at(-1), r.requests.filter((q) => q.op === 'game-list').length]).toEqual([WORLD, asked]);
  });

  it('a refused join: MP_MEDIUS_JOIN_ROOM_FAILURE runs OnJoinRoomFailure -- the room list asked again, the client\'s text in a popup for 2 s, #805; the menu stays', async () => {
    const r = await rooms({ joinChannel: () => Promise.resolve({ status: -948, mediusWorldId: -1 }) });
    const from = r.outcomes.length, asked = r.queries.rooms.length;
    r.press('CROSS', 2);
    await r.settle(10);
    expect(quiet(r.calls(WORLD, from))).toEqual(expect.arrayContaining(['ROOMLIST:RefreshRoomList(NA) table', 'POPUPDIALOG(NA) table']));
    expect(quiet(r.calls(WORLD, from)).filter((c) => /OnBadJoinState|#804/.test(c))).toEqual([]);
    expect(r.shown()).toBe(true);
    expect(popupText(r)).toBe(JOIN_ROOM_FAILURE_TEXT);
    await r.settle(3 * 30);
    expect([r.shown(), r.builds.at(-1), r.focused()]).toEqual([false, WORLD, 'ROOMLIST']);
    expect(quiet(r.calls(WORLD, from))).toContain('DescriptionText.op1(#805)');
    expect(r.queries.rooms.length).toBe(asked + 1);
  });

  it('a lost session: JoinChannel answered 401 hands the ticket to the lobby, state 2 posts MP_MEDIUS_ERROR, and the menu runs OnMultiplayerDisconnect', async () => {
    let lost: (() => void) | null = null;
    const r = await rooms({ joinChannel: () => { lost?.(); return Promise.reject(new Error('session lost')); } });
    lost = () => { r.lobby.sessionLost(TICKET); };
    const from = r.outcomes.length;
    r.press('CROSS', 2);
    await r.settle(20);
    expect([r.lobby.ticket(), r.lobby.state(), r.shown()]).toEqual([null, 2, true]);
    expect(quiet(r.calls(WORLD, from))).toEqual(expect.arrayContaining(['StopAllSounds(NA) table', 'VagStreaming(OFF) table', 'POPUPDIALOG(NA) table']));
    await r.settle(6 * 30);                                              // join_room's SuspendMenuInput(5.0) lapses
    r.press('CROSS', 10);                                                // the popup's OK (#45)
    await r.settle(10);
    expect(quiet(r.calls(WORLD, from))).toEqual(expect.arrayContaining(['LobbyBailout(NA) not implemented: ONL-22', 'SWITCHMENU(REBOOT) table']));
  });
});
