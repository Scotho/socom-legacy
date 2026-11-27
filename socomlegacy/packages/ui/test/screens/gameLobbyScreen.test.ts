import { describe, expect, it } from 'vitest';
import { chatHiddenWords, setChatFilter } from '../../src/text/chatFilter';
import { setOwnNameDisplay } from '../../src/text/ownNameDisplay';
import type { ListboxWidget } from '../../src/widgets/listbox';
import type { ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { BRIEFING_ROOM, GAME_DETAILS_TYPE_WORDS, GAME_INFO_DETAILS_VAR, gameDetails, type GameListEntry } from '../../src/screens/briefingRoomCommands';
import { discMissions } from './createGameRig';
import {
  CLOSED_CLAN_GAME_TEXT, GAME_LOBBY, isVersionRefusal, MATCH_ENDING_READY_LINE, NET_ABANDONED, PLAYER_GAME_PASSWORD_VAR, SPECTATOR_GAME_PASSWORD_VAR, TOO_MANY_PLAYERS_TEXT, TOO_MANY_SPECTATORS_TEXT, VERSION_REFUSAL_ABORT_READING, versionRefusalText,
  type GameLobbyView,
} from '../../src/screens/gameLobbyCommands';
import { GameLobbyCommands, TEAM_SWITCH_ERROR_DIALOG, TEAM_SWITCH_ERROR_TEXT, type LobbyControlRecovery } from '../../src/screens/gameLobbyCommands';
import { SWAP_MARK_ARROW_SIZE_ADAPTATION, SWAP_MARK_ARROW_TEXELS, SWAP_MARK_DOT_SHIFT, SWAP_MARK_TEXTURE_SIZE, withSwapMark } from '../../src/screens/swapMark';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiVarManager } from '../../src/uiVars';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import { CREATE_GAME, clanField } from '../../src/screens/createGameCommands';
import { VALVE_TYPE, ValveStore } from '../../src/valves';
import { HAVE } from './worldOfSocomRig';
import { discMissionVars, gameLobbyRig, seat, type GameLobbyRigOptions } from './gameLobbyRig';

/**
 * ONL-16a over the machine (web research 165): from the BRIEFING ROOM through a listed game's join into the GAME LOBBY
 * (`dlgGameLobby.rdr`) and out -- every dialog built from the disc's own layout and set (`gameLobbyRig.ts` over
 * `briefingRoomRig.ts`), the lobby client stepped as the page steps it, the join service and the game socket fakes
 * speaking for SVC-07a's bridge. What is pinned is the dialogs' own ANIMATIONS replayed: `aux_join_game` and the lobby's
 * states 15 and 17, the password's keyboard, the join's refusals, the lobby's ONSTART, READY and its 5 s, SWITCH TEAMS,
 * the countdown and the launch's hand-off, the host's launch and a host handed on, the bridge's closes and the way back.
 * CI on the fixtures.
 */

const SETTLED = 60;
const ARMORY = 'dlg_equipment_mp.rdr';
const SECOND = 30;
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const ROOMS = [room('Alpha', 1, { playerCount: 2 }), room('Bravo', 2, { endOfList: true })];
const statsHex = (o: Record<number, number>): string => { const b = new Uint8Array(256); b[0] = 0x44; for (const [k, v] of Object.entries(o)) b[Number(k)] = v; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
/** A game of the room Alpha on Frostfire (MP2): 5 rounds of 6 minutes, 8 spectator slots, friendly fire. */
const GAME: GameListEntry = {
  status: 0, mediusWorldId: 7, playerCount: 1, minPlayers: 2, maxPlayers: 24, gameLevel: 2, playerSkillLevel: 0, rulesSet: 1, genericField1: 1, genericField2: 65000,
  genericField3: 0, securityLevel: 0, worldStatus: 1, gameHostType: 0, gameName: 'test$~Alpha', gameStats: statsHex({ 1: 5, 2: 6, 4: 8, 8: 2 }), endOfList: true,
};
type Rig = Awaited<ReturnType<typeof gameLobbyRig>>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const items = (r: Rig, list: string): string[] => (r.parts.current!.widgets.get(list) as ListboxWidget).items
  .map((i) => `${i.captions.filter((_, k) => i.images[k] == null).join(' ').trim()} | ${i.images.filter((x) => x !== null).map((x) => x!.texture).join(' ')}`);
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const loc = (r: Rig, id: number): string => r.loc.byId.get(id)!.trim();
const rowCalls = (r: Rig, dialog: string, from: number, names: RegExp): string[] => r.calls(dialog, from).filter((c) => names.test(c));
const view = (seats: GameLobbyView['seats'], o: Partial<GameLobbyView> = {}): GameLobbyView => ({ seats, countdown: null, launched: false, ...o });
/** The host on the SEALs and this page's seat (id 2) on the terrorists. */
const TWO = [seat(1, 'host', 'seal', { host: true }), seat(2, 'socomc', 'terrorist')];

/** The menu, BRIEFING ROOMS, Alpha: the briefing room built with its game list. */
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
/** JOIN GAME, then CROSS on the listed game: `join_game`. */
function joinListed(r: Rig): void {
  go(r, 'JoinGame');
  r.press('CROSS', 6);
  expect(r.focused()).toBe('GAMELIST');
  r.press('CROSS', 2);
}
async function until(r: Rig, done: () => boolean, frames = 60 * SECOND): Promise<void> { for (let i = 0; i < frames && !done(); i++) await r.settle(1); }
/** Into the GAME LOBBY through a listed game's join; settled past its ONSTART. */
async function lobby(o: GameLobbyRigOptions = {}): Promise<Rig> {
  const r = await briefing(o);
  joinListed(r);
  await until(r, () => r.current() === GAME_LOBBY);
  expect(r.current()).toBe(GAME_LOBBY);
  await r.settle(SETTLED);
  return r;
}

describe.skipIf(!HAVE)(`the GAME LOBBY over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('a rotated welcome selects the new mission for the armory and the next match', async () => {
    const r = await lobby();
    expect(r.commands.missionName()).toBe('mp2');
    r.commands.welcomed(2, 'MP72');
    expect(r.commands.missionName()).toBe('mp72');
    r.commands.gameLobby(view(TWO, { launched: true }));
    r.commands.roundStart();
    await r.settle(60);
    expect(r.starts.at(-1)?.mission).toBe('mp72');
  });

  it("LOBBY-ONE-BEHIND, the review's F2: a launched view carrying nextMap moves no mission -- the match starts on the current map", async () => {
    const r = await lobby();
    r.commands.gameLobby(view(TWO, { launched: true, nextMap: 'MP72' }));
    await r.settle(SECOND);
    expect([r.starts.length, r.starts.at(-1)?.mission, r.commands.missionName()]).toEqual([1, 'mp2', 'mp2']);
  });

  it('GetGameInfo: GAMELIST\'s focus runs UpdateGameListInfo -- GetGameInfo(INPUT_STRING), the listed record\'s GAME DETAILS (FUN_002e1f20) in GAME_INFO_DETAILS', async () => {
    const r = await briefing({ missions: discMissions });
    const from = r.outcomes.length;
    go(r, 'JoinGame');
    r.press('CROSS', 6);
    expect(r.focused()).toBe('GAMELIST');
    expect(rowCalls(r, BRIEFING_ROOM, from, /GetGameInfo/)).toContain('GetGameInfo(INPUT_STRING) table');
    const text = gameDetails(GAME, discMissions()).mission!.text;
    expect(text).toMatch(/\nROUND COUNT:5\nROUND TIME:6\nFRIENDLY FIRE\n$/);
    expect(r.uiVars.find(GAME_INFO_DETAILS_VAR)!.value).toEqual({ type: 'string', value: text });
    expect(r.valve('MISSION_AVAILABLE')).toBe(1);
  });

  it('GetGameInfo: SELECT in the GAME LOBBY runs show_game_details -- GetGameInfo(CurrentGame), the own game from the valves (FUN_002e24d0) in GAME_INFO_DETAILS', async () => {
    const r = await lobby({ missions: discMissions });
    const from = r.outcomes.length;
    r.press('SELECT', 6);
    expect(rowCalls(r, GAME_LOBBY, from, /GetGameInfo/)).toEqual(['GetGameInfo(CurrentGame) table']);
    const word = GAME_DETAILS_TYPE_WORDS[discMissions().find((m) => m.multiplayer && m.number === 2)!.type]!;   // Frostfire's type: one map, no MEDLEY
    expect(r.uiVars.find(GAME_INFO_DETAILS_VAR)!.value).toEqual({ type: 'string', value: `${word}\nROUND COUNT:5\nROUND TIME:6 min.\nFRIENDLY FIRE\n` });
  });

  it('a listed game\'s CROSS runs aux_join_game: the checks, JoinMPGame, JoinGame (state 15 -> 17), the game socket, CheckJoinMP, JoinGameServer, SWITCHMENU(dlgGameLobby.rdr)', async () => {
    const r = await briefing();
    const from = r.outcomes.length;
    joinListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    expect(rowCalls(r, BRIEFING_ROOM, from, /ClanGameClosed|GameRejectsRank|GameHasPassword|JoinMPGame|ConnectToGameServer|JoinGameServer|SWITCHMENU/).filter((c, i, a) => a.indexOf(c) === i)).toEqual([
      'ClanGameClosed(INPUT_STRING) table', 'GameRejectsRank(INPUT_STRING) table', 'GameHasPassword(INPUT_STRING) table', 'JoinMPGame(INPUT_STRING) table',
      'ConnectToGameServer(NA) table', 'JoinGameServer(NA) table', 'SWITCHMENU(dlgGameLobby.rdr) table',
    ]);
    expect(r.joins).toEqual([{ mediusWorldId: 7, joinType: 0, gamePassword: '' }]);
    expect([r.socketLog, r.lobby.state(), r.valve('mp_join_game')]).toEqual([['open 7'], 17, 10]);
    expect(['mp_max_rounds', 'mp_max_round_time', 'MaxSpectatorsValve', 'MaxPlayersValve', 'mp_friendly_fire', 'mp_allow_respawn'].map((v) => r.valve(v))).toEqual([5, 360, 8, 16, 1, 0]);   // AS-17 / L72: r0004's MaxPlayers, the total 24 less 8 spectator slots
    expect(r.uiVars.find('GAMENAMEVAR')!.value).toEqual({ type: 'string', value: 'test' });
  });

  it('a private game: GameHasPassword, the keyboard on PlayerGamePassword, JoinGame with what was typed; cancelled, nothing is asked', async () => {
    const priv = { ...GAME, securityLevel: 1 };
    let r = await briefing({ games: [priv], typed: 'ab' });
    let from = r.outcomes.length;
    joinListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    expect(rowCalls(r, BRIEFING_ROOM, from, /GetTextInput/)).toEqual(['GetTextInput(PlayerGamePassword) table']);
    expect(r.joins).toEqual([{ mediusWorldId: 7, joinType: 0, gamePassword: 'ab' }]);
    r = await briefing({ games: [priv], typed: null });
    from = r.outcomes.length;
    joinListed(r);
    await r.settle(10 * SECOND);
    expect([r.joins, r.socketLog, r.current(), r.valve('KeyboardCameBack')]).toEqual([[], [], BRIEFING_ROOM, 2]);
    expect(rowCalls(r, BRIEFING_ROOM, from, /JoinMPGame/)).toEqual([]);
  });

  it.each(['JoinGame', 'WatchGame'])('MLS-PASS: %s can retry wrong/empty passwords and cancel before a successful join on the same screen', async (button) => {
    const typed: (string | null)[] = ['wrong', '', null, 'right'];
    const watching = button === 'WatchGame';
    const r = await briefing({
      games: [{ ...GAME, securityLevel: 5 }], typed: () => typed.shift()!,
      joinGame: (q) => Promise.resolve({ status: q.gamePassword === 'right' ? 0 : -978, mediusWorldId: q.gamePassword === 'right' ? q.mediusWorldId : -1 }),
    });
    const select = () => {
      if (r.focused() !== 'GAMELIST') { go(r, button); r.press('CROSS', 6); }
      expect(r.focused()).toBe('GAMELIST');
      r.press('CROSS', 2);
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      select();
      await r.settle(5 * SECOND);
      expect([r.current(), r.lobby.state(), r.socketLog, r.leaves]).toEqual([BRIEFING_ROOM, 11, [], []]);
      expect(r.joins.length).toBe(Math.min(attempt + 1, 2));
      if (attempt < 2) expect(r.text('JoiningAnim')).toEqual(['Password incorrect. ']);
    }
    select();
    await until(r, () => r.current() === GAME_LOBBY);
    expect(r.current()).toBe(GAME_LOBBY);
    expect(r.keyboards.map((q) => q.uiVar)).toEqual(Array(4).fill(watching ? SPECTATOR_GAME_PASSWORD_VAR : PLAYER_GAME_PASSWORD_VAR));
    expect(r.joins).toEqual(['wrong', '', 'right'].map((gamePassword) => ({ mediusWorldId: 7, joinType: watching ? 1 : 0, gamePassword })));
    expect(r.socketLog).toEqual(['open 7']);
  });

  /**
   * WATCH-JOIN W1 (research 314 §2.2 step 3, §7 item 1): a listed game whose security level carries SpectatorPassword (4,
   * the services' `SPECTATOR_PASSWORD_SECURITY_BIT_READING`) -- WATCH GAME asks `GameHasSpectatorPassword` (`FUN_002f8d50`
   * D:L197495, & 4; P:L4594) and opens the keyboard on SpectatorGamePassword (P:L4599); JoinGame carries join type 1 and
   * what was typed (`FUN_002eda60` D:L190376-190395). JOIN GAME asks `GameHasPassword` (& 1, D:L197521) only: no keyboard
   * for a game with no game password. The keyboard's title is the command's own bytes (`decodeTextInput`'s +0x10): the
   * briefing room's `GetTextInput(SpectatorGamePassword)` carries `_423_EnterPassword_MSG` ("Enter a Password to
   * Connect.", the same as its PlayerGamePassword keyboard), not #252 "Enter Spectator Password" as research 314 §2.1 and
   * the brief read it (the finding recorded in 314 §2.1).
   */
  it('W1: a game with a spectator password -- WATCH GAME opens the keyboard on SpectatorGamePassword (its title #423, the disc\'s), the right password seats, a wrong one "Password incorrect."; JOIN GAME asks none', async () => {
    const watched = { ...GAME, securityLevel: 4 };
    const answer = (q: { gamePassword: string; mediusWorldId: number }) => Promise.resolve(q.gamePassword === 'watch' ? { status: 0, mediusWorldId: q.mediusWorldId } : { status: -978, mediusWorldId: -1 });
    const watch = async (typed: string): Promise<Rig> => {
      const r = await briefing({ games: [watched], typed, joinGame: answer });
      go(r, 'WatchGame');
      r.press('CROSS', 6);
      expect(r.focused()).toBe('GAMELIST');
      r.press('CROSS', 2);
      await r.settle(2 * SECOND);
      return r;
    };
    let r = await watch('watch');
    await until(r, () => r.current() === GAME_LOBBY);
    expect(r.keyboards).toEqual([{ uiVar: 'SpectatorGamePassword', purpose: '_423_EnterPassword_MSG' }]);
    expect([loc(r, 423), loc(r, 252)]).toEqual(['Enter a Password to Connect.', 'Enter Spectator Password']);
    expect([r.joins, r.socketLog, r.current()]).toEqual([[{ mediusWorldId: 7, joinType: 1, gamePassword: 'watch' }], ['open 7'], GAME_LOBBY]);
    r = await watch('wrong');
    expect([r.joins, r.socketLog, r.lobby.state(), r.current()]).toEqual([[{ mediusWorldId: 7, joinType: 1, gamePassword: 'wrong' }], [], 11, BRIEFING_ROOM]);
    expect(r.text('JoiningAnim')).toEqual(['Password incorrect. ']);
    r = await briefing({ games: [watched], typed: 'never', joinGame: answer });
    const from = r.outcomes.length;
    joinListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    expect(rowCalls(r, BRIEFING_ROOM, from, /GameHasPassword|GameHasSpectatorPassword|GetTextInput/).filter((c, i, a) => a.indexOf(c) === i)).toEqual(['GameHasPassword(INPUT_STRING) table']);
    expect([r.keyboards, r.joins]).toEqual([[], [{ mediusWorldId: 7, joinType: 0, gamePassword: '' }]]);
  });

  it('the join\'s refusals as the room shows them: a wrong password "Password incorrect.", banned #443 and #444, full #441 -- state 11, no socket, the room again', async () => {
    const cases: [number, (r: Rig) => void][] = [
      [-978, (r) => { expect(r.text('JoiningAnim')).toEqual(['Password incorrect. ']); }],
      [-972, (r) => { expect(popupText(r)).toBe(loc(r, 443)); expect(r.text('JoiningAnim')).toEqual([r.loc.byId.get(444)!]); }],
      [-948, (r) => { expect(r.text('JoiningAnim')).toEqual([r.loc.byId.get(441)!]); }],
    ];
    for (const [status, shown] of cases) {
      const r = await briefing({ joinGame: () => Promise.resolve({ status, mediusWorldId: -1 }) });
      joinListed(r);
      await r.settle(2 * SECOND);
      expect([r.joins.length, r.socketLog, r.lobby.state(), r.current()], String(status)).toEqual([1, [], 11, BRIEFING_ROOM]);
      shown(r);
    }
  });

  // WATCH-JOIN W2 (research 314 §7 item 2): the same refusal is the host's past the spectator slots (the room's
  // `maxSpectators`, server room.test.ts / bridge.test.ts); the page cannot tell the two apart -- one text, one path.
  it('SVC-23f: a watcher\'s hello refused "Too many spectators" after VOTE ALL\'s eject or past the slots (W2) -- MP_EJECT_SPECTATOR, the briefing room\'s spectator_rejected: the socket closed, #527, the room again', async () => {
    const r = await briefing({ welcome: null });
    go(r, 'WatchGame');
    r.press('CROSS', 6);
    expect(r.focused()).toBe('GAMELIST');
    r.press('CROSS', 2);
    await until(r, () => r.socketLog.length > 0, 10 * SECOND);
    expect([r.joins.map((j) => j.joinType), r.socketLog]).toEqual([[1], ['open 7']]);
    const from = r.outcomes.length;
    r.commands.seatEnded(4000, TOO_MANY_SPECTATORS_TEXT);
    await r.settle(2 * SECOND);
    const calls = (): string[] => rowCalls(r, BRIEFING_ROOM, from, /DisconnectFromGameServer|POPUPDIALOG|SWITCHMENU/).filter((c, k, a) => a.indexOf(c) === k);
    // DisconnectFromGameServer (the socket closed, state 11); the popup shows the event's text (FUN_002b9150's "%s" of
    // reason 2) and JoiningAnim #527; the popup holds the animation until CONTINUE.
    expect([calls(), popupText(r), r.socketLog, r.lobby.state()]).toEqual([['DisconnectFromGameServer(NA) table', 'POPUPDIALOG(NA) table'], TOO_MANY_SPECTATORS_TEXT, ['open 7', 'close'], 11]);
    expect(r.text('JoiningAnim')).toEqual([r.loc.byId.get(527)!]);
    r.press('CROSS', 6);                                          // the popup closed: SWITCHMENU(dlgMPBriefingRoom.rdr), the room again
    await r.settle(SETTLED);
    expect([calls().at(-1), r.current()]).toEqual([`SWITCHMENU(${BRIEFING_ROOM}) table`, BRIEFING_ROOM]);
  });

  it('CLAN-JOIN (research 308 §3.2-§3.3): a player\'s hello refused "Closed clan game" or "Too many players" -- MP_EJECT_SPECTATOR, the briefing room\'s spectator_rejected: the socket closed, #527, the room again', async () => {
    for (const text of [CLOSED_CLAN_GAME_TEXT, TOO_MANY_PLAYERS_TEXT]) {
      const r = await briefing({ welcome: null });
      joinListed(r);
      await until(r, () => r.socketLog.length > 0, 10 * SECOND);
      expect([r.joins.map((j) => j.joinType), r.socketLog], text).toEqual([[0], ['open 7']]);
      const from = r.outcomes.length;
      r.commands.seatEnded(4000, text);
      await r.settle(2 * SECOND);
      const calls = (): string[] => rowCalls(r, BRIEFING_ROOM, from, /DisconnectFromGameServer|POPUPDIALOG|SWITCHMENU/).filter((c, k, a) => a.indexOf(c) === k);
      // FUN_002b9150's "%s" of reason 4 / 3 (D:L159209, D:L159212) in the popup, #527 on JoiningAnim, as reason 2's.
      expect([calls(), popupText(r), r.socketLog, r.lobby.state()], text).toEqual([['DisconnectFromGameServer(NA) table', 'POPUPDIALOG(NA) table'], text, ['open 7', 'close'], 11]);
      expect(r.text('JoiningAnim'), text).toEqual([r.loc.byId.get(527)!]);
      r.press('CROSS', 6);
      await r.settle(SETTLED);
      expect([calls().at(-1), r.current()], text).toEqual([`SWITCHMENU(${BRIEFING_ROOM}) table`, BRIEFING_ROOM]);
    }
  });

  it('NET-DRAIN: the drain\'s refusal as the transport passes it on ({ status: -966 }): MP_MEDIUS_JOIN_GAME_FAILURE in 2 s, not the 30 s monitor', async () => {
    const r = await briefing({ joinGame: () => Promise.resolve({ status: -966, mediusWorldId: 0 }) });
    joinListed(r);
    await r.settle(2 * SECOND);
    expect([r.joins.length, r.socketLog, r.lobby.state(), r.current()]).toEqual([1, [], 11, BRIEFING_ROOM]);
  });

  it('the lobby\'s ONSTART: #339 and the game\'s name, the sides\' lists from gameLobby (name, ready dot), player_team and the READY gate counted down', async () => {
    const r = await lobby();
    expect([r.text('bar_title'), r.text('gamename_val'), r.text('roomname')]).toEqual([[r.loc.byId.get(339)!], ['test'], ['Alpha']]);
    expect([items(r, 'B_SEALLIST'), items(r, 'B_REDLIST'), items(r, 'B_SPECLIST')]).toEqual([
      ['host | null.tif ping_dot_red.tif'], ['socomc | null.tif ping_dot_red.tif'], [],
    ]);
    expect([r.valve('player_team'), r.valve('mp_minor_game_state'), r.valve('mp_major_game_state'), r.valve('mp_team_unbalance'), r.valve('late_joiner')]).toEqual([8, 1, 1, 0, 0]);
    const clock = r.valve('mp_45_sec_clock')!;
    expect(clock).toBeGreaterThan(15);                                               // the gate's 30 s from the seat's hello, the join's own seconds gone
    await r.settle(3 * SECOND);
    expect(r.valve('mp_45_sec_clock')).toBe(clock - 3);
  });

  /**
   * LOBBY-MAPNAME (the player report "the lobby does not display the map name"): `check_loop`'s `AdvanceMPMission`
   * (`FUN_00279490`) ends by loading the current mission (`FUN_002acc10(0x4364e0, 0x414e00)`, D:L123881), whose UiVars half
   * (D:L152356-152381) adds every `mission.rdr` `UiVars` entry to the UI variables (`FUN_003857c0(0x437e80, ..)`) at the
   * spec's longevity -- TEMPORARY, the default of `FUN_00386ff0` (D:L280328) with no LONGEVITY in any MP map's entries.
   * The title bar's `MPgamename` (UIVAR `mission_title`) then draws MP2's own title.
   */
  it('LOBBY-MAPNAME: AdvanceMPMission loads the mission\'s UiVars -- MPgamename draws MP2\'s mission_title FROSTFIRE (TEMPORARY), as the ARMORY\'s does', async () => {
    const r = await lobby({ missionVars: discMissionVars });
    expect(r.text('MPgamename')).toEqual(['FROSTFIRE']);
    const title = r.uiVars.find('mission_title')!;
    expect([title.value, title.longevity]).toEqual([{ type: 'string', value: 'FROSTFIRE' }, 1]);
    expect(r.uiVars.find('EQUIPMENT_LIBRARY')!.value).toEqual({ type: 'string', value: 'ui/assetlib/eq/em02' });
  });

  it('LOBBY-MAPNAME (MISSION_VARS_ASYNC_ADAPTATION): the page\'s read resolving later adds the same entries; a read for a mission the lobby has left adds none', async () => {
    const asked: string[] = [];
    let r = await lobby({ missionVars: (m) => { asked.push(m); return Promise.resolve(discMissionVars(m)); } });
    expect(asked[0]).toBe('mp2');
    expect(r.text('MPgamename')).toEqual(['FROSTFIRE']);
    let release!: () => void, releaseNext!: () => void;
    const held = new Promise<void>((done) => { release = done; });
    const heldNext = new Promise<void>((done) => { releaseNext = done; });
    r = await lobby({ missionVars: (m) => (m === 'mp2' ? held : heldNext).then(() => discMissionVars(m)) });
    const frostfire = { type: 'string', value: 'FROSTFIRE' };
    expect(r.text('MPgamename')).toEqual(['']);                                               // not yet read: the dialog's own empty var
    expect(r.uiVars.find('mission_title')?.value).not.toEqual(frostfire);
    r.commands.welcomed(2, 'MP72');                                                           // the lobby moved on before the read came
    release();
    await r.settle(2);
    expect(r.uiVars.find('mission_title')?.value).not.toEqual(frostfire);                     // the left mission's read adds none
    expect(r.text('MPgamename')).toEqual(['']);
    releaseNext();                                                                            // LOBBY-ONE-BEHIND: the move loads MP72's
    await r.settle(2);
    expect(r.text('MPgamename')).toEqual(['CROSSROADS']);
  });

  /**
   * LOBBY-ONE-BEHIND (Craig, live v0.4.14: "the in game game lobby shows one match behind when matches change over"): the
   * room sends the returned view, then rotates (its seats closed, 4021) and welcomes the seat again on the next map. The
   * original's host writes the play list's next map into 0x414e00 before its load (`FUN_00279490` D:L123863-123877, the
   * load D:L123881; research 309 §2.2), so the lobby draws the next map; the returned lobby's `check_loop` here ran on the
   * map just played, and the new welcome (or the returned view's `nextMap`) loads the new map again. Reading, pending review.
   */
  it("LOBBY-ONE-BEHIND: after a match, the rotation's new welcome in the returned lobby draws the new map -- MPgamename CROSSROADS, not FROSTFIRE", async () => {
    const r = await lobby({ missionVars: discMissionVars });
    expect(r.text('MPgamename')).toEqual(['FROSTFIRE']);
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    r.commands.matchReturned();
    const built = r.builds.length;
    r.m.menu.startDialog = GAME_LOBBY;                                                        // the page's way back (frontEnd's `back`)
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view(TWO));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    await r.settle(2 * SECOND);
    expect(r.text('MPgamename')).toEqual(['FROSTFIRE']);                                      // check_loop, the room not rotated yet
    r.commands.dropped();                                                                     // the rotation's close (4021), the socket again
    r.commands.welcomed(2, 'MP72');                                                           // the new room's welcome
    await r.settle(2);
    expect(r.text('MPgamename')).toEqual(['CROSSROADS']);
    expect(r.uiVars.find('mission_title')!.value).toEqual({ type: 'string', value: 'CROSSROADS' });
  });

  it("LOBBY-ONE-BEHIND: the returned view's nextMap, heard while the returned lobby stands, draws the next map", async () => {
    const r = await lobby({ missionVars: discMissionVars });
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    r.commands.matchReturned();
    const built = r.builds.length;
    r.m.menu.startDialog = GAME_LOBBY;
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view(TWO));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    await r.settle(2 * SECOND);
    expect(r.text('MPgamename')).toEqual(['FROSTFIRE']);
    r.commands.gameLobby(view(TWO, { nextMap: 'MP72' }));
    await r.settle(2);
    expect(r.text('MPgamename')).toEqual(['CROSSROADS']);
  });

  /**
   * LOBBY-MAPNAME, the review's F1: the creator is let into the lobby as the session master before any welcome
   * (`JoinGameServer`, `CREATOR_MASTER_READING`), and `check_loop` runs `AdvanceMPMission` once -- the master byte stands
   * there for D:L123856's network test as `IsSessionMaster` reads it, so the creator's title bar is drawn too.
   */
  it('LOBBY-MAPNAME: the creator\'s lobby, its welcome only after check_loop -- MPgamename draws FROSTFIRE', async () => {
    const r = await briefing({ welcome: null, missionVars: discMissionVars });
    go(r, 'CRgame');
    r.press('CROSS', 4);
    await until(r, () => r.current() === CREATE_GAME, 10 * SECOND);
    await r.settle(SETTLED);
    r.uiVars.set(r.uiVars.add('GAMENAMEVAR', null, 2), { type: 'string', value: 'mine' });
    r.uiVars.set(r.uiVars.add('PLAYLISTVAR', null, 2), { type: 'array', value: [{ type: 'array', value: [{ type: 'int', value: 2 }] }] });
    r.press('SQUARE', 4);
    await until(r, () => r.current() === GAME_LOBBY, 20 * SECOND);
    expect([r.current(), r.socketLog]).toEqual([GAME_LOBBY, ['open 9']]);
    await r.settle(SETTLED);
    expect(r.text('MPgamename')).toEqual(['FROSTFIRE']);
    r.commands.welcomed(1, 'MP2');                                                            // the welcome, late
    r.commands.gameLobby(view([seat(1, 'socomc', 'seal', { host: true })]));
    await r.settle(2);
    expect(r.text('MPgamename')).toEqual(['FROSTFIRE']);
  });

  it('LOBBY-MAPNAME, the review\'s F2: LOAD_PROGRESS, a FLOAT node on the maps that carry it, is added as a real, not as its text', async () => {
    const r = await lobby({ missionVars: (m) => discMissionVars(m === 'mp2' ? 'mp72' : m) });
    expect(r.uiVars.find('LOAD_PROGRESS')!.value).toEqual({ type: 'real', value: 28 });
    expect(r.uiVars.find('mission_title')!.value).toEqual({ type: 'string', value: 'CROSSROADS' });
  });

  it('ONL-34 (W18.R7): the lists\' second column is each seat\'s medal from SEAT-TOLD -- the star for all on a ladder under 12, the next round\'s medals after it', async () => {
    const r = await lobby();
    const told = (pairs: [number, number][]): Map<number, { rating: number; medal: number }> => new Map(pairs.map(([id, medal]) => [id, { rating: 1000, medal }]));
    r.commands.seatTold(told([[1, 5], [2, 5]]));
    await r.settle(2);
    expect([items(r, 'B_SEALLIST'), items(r, 'B_REDLIST')]).toEqual([['host | Medal_Black.tif ping_dot_red.tif'], ['socomc | Medal_Black.tif ping_dot_red.tif']]);
    r.commands.seatTold(told([[1, 2], [2, 4]]));
    await r.settle(2);
    expect([items(r, 'B_SEALLIST'), items(r, 'B_REDLIST')]).toEqual([['host | Medal_Bronze.tif ping_dot_red.tif'], ['socomc | Medal_Gold.tif ping_dot_red.tif']]);
  });

  it('READY: ready_anim sends lobbyReady and toggles the seat (CycleReadyButton\'s NOT READY); within 5 s nothing more goes; the bridge\'s answer is the seat\'s READY', async () => {
    const r = await lobby();
    await r.settle(11 * SECOND);                                                   // ClientDAReadyButton's 10..1
    go(r, 'PlayerReady');
    r.press('CROSS', 4);
    expect([r.sent, r.valve('mp_minor_game_state')]).toEqual([['lobbyReady'], 2]);
    r.press('CROSS', 4);
    await r.settle(SECOND);
    r.press('CROSS', 4);
    expect(r.sent).toEqual(['lobbyReady']);                                        // CycleReadyButton holds it 5 s; ReadyToLoad's own 5 s too
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, ready: true, readyIn: 0 }]));
    expect(items(r, 'B_REDLIST')).toEqual(['socomc | null.tif ping_dot_green.tif']);
    await r.settle(6 * SECOND);
    go(r, 'PlayerReady');
    r.press('CROSS', 4);
    expect([r.sent, r.valve('mp_minor_game_state')]).toEqual([['lobbyReady', 'lobbyReady'], 1]);
    r.commands.gameLobby(view(TWO));                                               // refused or toggled back: the server's word stands
    expect(r.valve('mp_minor_game_state')).toBe(1);
  });

  it('SWITCH TEAMS: switch_teams_anim sends switchTeams; the side comes back in gameLobby; a second press inside 5 s sends nothing', async () => {
    const r = await lobby();
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams']);
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, team: 'seal' }]));
    expect([r.valve('player_team'), items(r, 'B_SEALLIST').length, items(r, 'B_REDLIST'), r.valve('mp_team_unbalance')]).toEqual([0, 2, [], 1]);
    r.press('CROSS', 4);
    await r.settle(2 * SECOND);
    r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams']);
  });

  it.each([undefined, 'sides'] as const)('SWITCH-RECOVERY: a switch or refusal (%s) permits another request after the native five-second lock', async (refused) => {
    const r = await lobby();
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view(refused ? TWO : [TWO[0]!, { ...TWO[1]!, team: 'seal' }], refused ? { refused } : {}));
    await r.settle(7 * SECOND);
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams', 'switchTeams']);
  });

  /**
   * LOBBY-START (research 159 §10.1 item 4; reading, pending review): MP_EIGHTY_READY is raised by the host's
   * `FUN_002c40c0` (D:L165503-165506) into its own dialog, whose `launch_10sec_anim` (P:L7631-7648) runs .DINK, then
   * `NoTriangle` 1, `mp_locked_game` 1, `ForceMPLaunch` and the three `DisableButton`s -- at once, before `CountDown`'s
   * own (clock under 11). The server raises it here (EIGHTY_READY_SERVER_ADAPTATION), so the host's page is
   * given the event when the room's view brings a new countdown; its `ForceMPLaunch` is that countdown, sent nothing.
   */
  it('LOBBY-START: the host\'s page runs launch_10sec_anim at a new countdown -- .DINK, NoTriangle and mp_locked_game 1, the three buttons disabled at once, no `launch` sent', async () => {
    const r = await lobby();
    const hostSeats = [{ ...TWO[0]!, host: false }, { ...TWO[1]!, host: true, readyIn: 0 }];
    r.commands.gameLobby(view(hostSeats));
    await r.settle(4 * SECOND);
    const enabled = () => ['Glswitchteams', 'weaponselect', 'PlayerReady'].map(name => r.input.ring()!.controls.find(c => c.name === name)!.enabled());
    const sounds = r.sound.log.length;
    r.commands.gameLobby(view(hostSeats, { countdown: 11 }));
    await r.settle(6);                                                   // a fifth of a second
    expect(r.sound.log.slice(sounds).some((l) => l.includes('.DINK'))).toBe(true);
    expect([r.valve('NoTriangle'), r.valve('mp_locked_game')]).toEqual([1, 1]);
    expect(enabled()).toEqual([false, false, false]);
    expect(r.sent.filter((s) => s === 'launch')).toEqual([]);
    r.commands.gameLobby(view(hostSeats, { countdown: 10 }));            // the same countdown's next view: no second run
    await r.settle(6);
    expect(r.sent.filter((s) => s === 'launch')).toEqual([]);
  });

  it("LOBBY-STEPS: the room calls the host's countdown off, then starts another -- the animation runs once each time, no `launch` sent; BACK reopened by LSR.R1's recovery, mp_locked_game left 1 (no script or page code reads it)", async () => {
    const r = await lobby();
    const hostSeats = [{ ...TWO[0]!, host: false }, { ...TWO[1]!, host: true, readyIn: 0 }];
    r.commands.gameLobby(view(hostSeats));
    await r.settle(4 * SECOND);
    const dinks = (from: number) => r.sound.log.slice(from).filter((l) => l.includes('.DINK')).length;
    let mark = r.sound.log.length;
    r.commands.gameLobby(view(hostSeats, { countdown: 11 }));
    await r.settle(6);
    expect(dinks(mark)).toBe(1);
    r.commands.gameLobby(view(hostSeats));                               // the room's call-off (a side emptied, the port's rule)
    await r.settle(12 * SECOND);
    expect([r.valve('NoTriangle'), r.valve('mp_x_sec_clock'), r.valve('mp_locked_game')]).toEqual([0, 11, 1]);
    mark = r.sound.log.length;
    r.commands.gameLobby(view(hostSeats, { countdown: 11 }));            // a new countdown: the animation again
    await r.settle(6);
    expect(dinks(mark)).toBe(1);
    expect(r.valve('NoTriangle')).toBe(1);
    expect(r.sent.filter((s) => s === 'launch')).toEqual([]);
  });

  it("LOBBY-STEPS F1: the countdown and the room's call-off in one frame -- the queued animation never runs: BACK and the three buttons open, no .DINK, no `launch`", async () => {
    const r = await lobby();
    const hostSeats = [{ ...TWO[0]!, host: false }, { ...TWO[1]!, host: true, readyIn: 0 }];
    r.commands.gameLobby(view(hostSeats));
    await r.settle(12 * SECOND);
    const mark = r.sound.log.length;
    r.commands.gameLobby(view(hostSeats, { countdown: 11 }));
    r.commands.gameLobby(view(hostSeats));                               // no settle between: the animation only queued
    await r.settle(12 * SECOND);
    const enabled = () => ['Glswitchteams', 'weaponselect', 'PlayerReady'].map(name => r.input.ring()!.controls.find(c => c.name === name)!.enabled());
    expect(r.valve('NoTriangle')).toBe(0);
    expect(enabled()).toEqual([true, true, true]);
    expect(r.sound.log.slice(mark).filter((l) => l.includes('.DINK'))).toEqual([]);
    expect(r.sent.filter((s) => s === 'launch')).toEqual([]);
  });

  it("LOBBY-STEPS F1: after a call-off that stopped the queued animation, a new countdown runs it once, its ForceMPLaunch still sending nothing", async () => {
    const r = await lobby();
    const hostSeats = [{ ...TWO[0]!, host: false }, { ...TWO[1]!, host: true, readyIn: 0 }];
    r.commands.gameLobby(view(hostSeats));
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(hostSeats, { countdown: 11 }));
    r.commands.gameLobby(view(hostSeats));
    await r.settle(12 * SECOND);
    const mark = r.sound.log.length;
    r.commands.gameLobby(view(hostSeats, { countdown: 11 }));
    await r.settle(6);
    expect(r.sound.log.slice(mark).filter((l) => l.includes('.DINK')).length).toBe(1);
    expect([r.valve('NoTriangle'), r.valve('mp_locked_game')]).toEqual([1, 1]);
    expect(r.sent.filter((s) => s === 'launch')).toEqual([]);
  });

  it('LOBBY-START: a joiner\'s page is given no MP_EIGHTY_READY -- no .DINK and no lock at the countdown\'s first view; CountDown closes BACK and the buttons under 11, as the disc has it', async () => {
    const r = await lobby();
    await r.settle(12 * SECOND);
    const sounds = r.sound.log.length;
    r.commands.gameLobby(view(TWO, { countdown: 11 }));
    await r.settle(6);
    expect(r.sound.log.slice(sounds).some((l) => l.includes('.DINK'))).toBe(false);
    expect(r.valve('mp_locked_game') ?? 0).toBe(0);
    await r.settle(2 * SECOND);
    expect(r.valve('NoTriangle')).toBe(1);
    expect(r.input.ring()!.controls.find(c => c.name === 'PlayerReady')!.enabled()).toBe(false);
  });

  it('SWITCH-RECOVERY: cancellation restores the waiting lobby and its switch command', async () => {
    const r = await lobby();
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(TWO, { countdown: 11 }));
    await r.settle(2 * SECOND);
    expect(r.input.ring()!.controls.find(c => c.name === 'Glswitchteams')!.enabled()).toBe(false);
    r.commands.gameLobby(view(TWO));
    await r.settle(12 * SECOND);
    expect(r.valve('mp_x_sec_clock')).toBe(11);
    expect(r.node('CountDownFrame')!.visible).toBe(false);
    expect(['LaunchText', 'SecondText', 'CountDown'].map(name => r.text(name).join('').trim())).toEqual(['', '', '']);
    expect(r.valve('NoTriangle')).toBe(0);
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams']);
    expect(r.socketLog).toEqual(['open 7']);
  });

  it('SWITCH-RECOVERY: a late player still waiting when the match ends regains the switch command', async () => {
    const r = await lobby({ lobbyView: () => view(TWO, { launched: true }) });
    r.press('CROSS', 10);
    await r.settle(6 * SECOND);
    expect([r.shown(), r.current(), r.valve('late_joiner'), r.starts]).toEqual([false, GAME_LOBBY, 1, []]);
    expect(r.input.ring()!.controls.find(c => c.name === 'Glswitchteams')!.enabled()).toBe(false);
    r.commands.gameLobby(view(TWO));
    await r.settle(12 * SECOND);
    expect(r.valve('late_joiner')).toBe(0);
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams']);
    expect(r.socketLog).toEqual(['open 7']);
  });

  it.each([1, 2, 4])('SWITCH-RECOVERY: cancellation preserves clan affiliation %s restrictions', async (affiliation) => {
    const r = await lobby({ games: [{ ...GAME, genericField3: clanField(affiliation, 5) }], clanId: 5 });
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(TWO, { countdown: 11 }));
    await r.settle(2 * SECOND);
    r.commands.gameLobby(view(TWO));
    await r.settle(12 * SECOND);
    expect(r.input.ring()!.controls.find(c => c.name === 'Glswitchteams')!.enabled()).toBe(false);
    expect(r.input.ring()!.controls.find(c => c.name === 'weaponselect')!.enabled()).toBe(true);
  });

  it('SWITCH-RECOVERY: a ready player stays locked until unready after cancellation', async () => {
    const r = await lobby();
    await r.settle(12 * SECOND);
    go(r, 'PlayerReady'); r.press('CROSS', 4);
    const readySeats = [TWO[0]!, { ...TWO[1]!, ready: true }];
    r.commands.gameLobby(view(readySeats));
    await r.settle(6 * SECOND);
    r.commands.gameLobby(view(readySeats, { countdown: 11 }));
    await r.settle(2 * SECOND);
    r.commands.gameLobby(view(readySeats));
    await r.settle(SECOND);
    const enabled = (name: string) => r.input.ring()!.controls.find(c => c.name === name)!.enabled();
    expect([enabled('Glswitchteams'), enabled('weaponselect'), enabled('PlayerReady')]).toEqual([false, false, true]);
    go(r, 'PlayerReady'); r.press('CROSS', 4);
    r.commands.gameLobby(view(TWO));
    await r.settle(6 * SECOND);
    go(r, 'Glswitchteams'); r.press('CROSS', 4);
    expect(r.sent).toEqual(['lobbyReady', 'lobbyReady', 'switchTeams']);
  });

  it.each([false, true])('SWITCH-RECOVERY: preserves a switch cooldown; a new countdown supersedes recovery (%s)', async (countAgain) => {
    const r = await lobby();
    await r.settle(12 * SECOND);
    const seats = TWO.map(s => ({ ...s, readyIn: 0 }));
    r.commands.gameLobby(view(seats));
    go(r, 'Glswitchteams'); r.press('CROSS', 4);
    r.commands.gameLobby(view(seats, { countdown: 11 }));
    await r.settle(SECOND);
    r.commands.gameLobby(view(seats));
    await r.settle(SECOND);
    const enabled = () => ['Glswitchteams', 'weaponselect', 'PlayerReady'].map(name => r.input.ring()!.controls.find(c => c.name === name)!.enabled());
    expect(enabled()).toEqual([false, false, false]);
    if (countAgain) r.commands.gameLobby(view(seats, { countdown: 11 }));
    await r.settle(6 * SECOND);
    expect(enabled()).toEqual([!countAgain, !countAgain, !countAgain]);
    expect(r.sent).toEqual(['switchTeams']);
  });

  it('SWITCH-RECOVERY: a late wait ending during the leave prompt recovers after choosing No', async () => {
    const r = await lobby({ lobbyView: () => view(TWO, { launched: true }) });
    r.press('CROSS', 10);
    await r.settle(6 * SECOND);
    r.press('TRIANGLE', 6);
    expect(r.valve('MayBeExiting')).toBe(1);
    r.commands.gameLobby(view(TWO));
    await r.settle(SECOND);
    expect(r.shown()).toBe(true);
    r.press('CROSS', 6); // NO is the native default (#246/#253).
    await r.settle(12 * SECOND);
    expect(r.valve('MayBeExiting')).toBe(0);
    go(r, 'Glswitchteams'); r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams']);
    expect(r.socketLog).toEqual(['open 7']);
  });

  it('SWITCH-RECOVERY: repeated waiting views do not restart interrupted native entry timers', async () => {
    const r = await lobby();
    expect(r.valve('NoReadyButton')).toBe(1);
    r.commands.gameLobby(view(TWO, { countdown: 11 }));
    await r.settle(SECOND);
    r.commands.gameLobby(view(TWO));
    for (let i = 0; i < 12; i++) { await r.settle(SECOND); r.commands.gameLobby(view(TWO)); }
    expect(r.valve('NoReadyButton')).toBe(0);
    expect(r.input.ring()!.controls.find(c => c.name === 'weaponselect')!.enabled()).toBe(true);
    expect(r.input.ring()!.controls.find(c => c.name === 'PlayerReady')!.enabled()).toBe(true);
    go(r, 'Glswitchteams'); r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams']);
  });

  it('SWITCH-RECOVERY: cancellation while in the armory is applied only on return to the lobby', async () => {
    const r = await lobby();
    await r.settle(12 * SECOND);
    go(r, 'weaponselect'); r.press('CROSS', 4);
    await until(r, () => r.current() === ARMORY);
    r.commands.gameLobby(view(TWO, { countdown: 11 }));
    r.commands.gameLobby(view(TWO));
    await r.settle(SECOND);
    expect(r.current()).toBe(ARMORY);
    r.press('TRIANGLE', 4);
    await until(r, () => r.current() === GAME_LOBBY);
    await r.settle(12 * SECOND);
    go(r, 'Glswitchteams'); r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams']);
  });

  it('the countdown as CountDown shows it -- #354, n, #355, a number a second, the frame up -- and the launch: SWITCHMENU(LOAD_SCREEN) and the hand-off with the socket kept', async () => {
    const r = await lobby();
    const from = r.outcomes.length;
    r.commands.gameLobby(view(TWO, { countdown: 11 }));
    await r.settle(5);
    expect([r.text('LaunchText'), r.text('SecondText'), r.node('CountDownFrame')!.visible]).toEqual([[r.loc.byId.get(354)!], [r.loc.byId.get(355)!], true]);
    expect(r.text('CountDown')).toEqual(['10']);
    await r.settle(4 * SECOND);
    expect(r.text('CountDown')).toEqual(['6']);
    expect(r.starts).toEqual([]);
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    expect(r.valve('mp_major_game_state')).toBe(2);
    expect(r.starts).toEqual([{ mediusWorldId: 7, gameName: 'test$~Alpha', mission: 'mp2', lateJoiner: false }]);
    expect(rowCalls(r, GAME_LOBBY, from, /SWITCHMENU/)).toEqual(['SWITCHMENU(LOAD_SCREEN) table']);
    expect(r.socketLog).toEqual(['open 7']);                                       // never closed: the match's socket
  });

  it('the room countdown closes READY and SWITCH TEAMS on the page, as launch_10sec_anim and CountDown do (no page raises MP_EIGHTY_READY here)', async () => {
    const r = await lobby();
    const bit = (name: string): boolean => r.input.ring()!.controls.find((c) => c.name === name)!.enabled();
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(TWO, { countdown: null }));
    await r.settle(SECOND);
    const before = [bit('PlayerReady'), bit('Glswitchteams')];
    r.commands.gameLobby(view(TWO, { countdown: 11 }));
    await r.settle(2 * SECOND);
    expect([before, [bit('PlayerReady'), bit('Glswitchteams')]]).toEqual([[true, true], [false, false]]);
  });

  it('the match end back into the lobby (return_to_gamelobby): the launch undone, the lobby state again, a second launch starts', async () => {
    const r = await lobby();
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    r.commands.matchReturned();
    expect([r.valve('mp_major_game_state'), r.valve('late_joiner')]).toEqual([1, 0]);
    // The room's view still says launched (its PreMatch resets only on an abandon): no second hand-off without a new launch.
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    r.commands.gameLobby(view(TWO, { launched: false }));
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(2);
  });

  it('ONL-20b (research 309 R309.1-R309.2): the lobby a match returned to runs the first entry\'s branch -- FromBriefing re-arms the kit for the side held (IDFromBriefing 0), ComeFromBriefing 0; OT.R129: ArmButtonClock and the joiner\'s 10 s READY lock laid aside at once; ClanSwapSidesIndex 1 after one game', async () => {
    const r = await lobby();
    const bit = (name: string): boolean => r.input.ring()!.controls.find((c) => c.name === name)!.enabled();
    await r.settle(12 * SECOND);                                                    // the first entry's ArmButtonClock ran out (P:L7044)
    expect(['ComeFromBriefing', 'ClanSwapSidesIndex', 'MpCharSet', 'player_team'].map((n) => r.valve(n))).toEqual([1, 0, 5, 8]);
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    // Over the match: a kit of another type, IDFromBriefing as another path might leave it -- GAME COMPLETE's to undo.
    const set = (n: string, v: number): void => { r.m.valves.set(n, v, r.m.valves.find(n)?.type ?? VALVE_TYPE.TEMP); };
    set('MpCharSet', 6); set('IDFromBriefing', 1);
    r.commands.matchReturned();
    expect(['IDFromBriefing', 'ClanSwapSidesIndex', 'ComeFromBriefing'].map((n) => r.valve(n))).toEqual([0, 1, 0]);
    // The page's way back (its `back`: the start dialog written, the menu state left and entered again, FUN_001f5e70).
    const built = r.builds.length;
    r.m.menu.startDialog = GAME_LOBBY;
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view([seat(1, 'host', 'seal', { host: true, readyIn: 45 }), seat(2, 'socomc', 'terrorist', { readyIn: 0 })]));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    await r.settle(2 * SECOND);
    expect(r.current()).toBe(GAME_LOBBY);
    // FromBriefing (P:L7561-7586): the default type for the side held (no stored record). OT.R129 (the owner's ruling,
    // 2026-11-14; `LOBBY_AFTER_MATCH_FREE_OWNER`): was "ArmButtonClock counting (NoReadyButton 1), SetupNormalJoiner's
    // ClientDAReadyButton holding READY, ComeFromBriefing 1 at ArmButtonClock's end" -- both stopped at once, NoReadyButton
    // 0 as ArmButtonClock's end leaves it, READY open; ComeFromBriefing kept 0 (its end's 1 not written: SwapClanSides).
    expect(['MpCharSet', 'NoReadyButton', 'ComeFromBriefing', 'ClanSwapSidesIndex'].map((n) => r.valve(n))).toEqual([5, 0, 0, 1]);
    expect(bit('PlayerReady')).toBe(true);
    await r.settle(10 * SECOND);
    expect(['NoReadyButton', 'ComeFromBriefing', 'ClanSwapSidesIndex'].map((n) => r.valve(n))).toEqual([0, 0, 1]);   // a joiner never resets it (R309.8)
    expect(bit('PlayerReady')).toBe(true);
  });

  it('ONL-20b: a HOST returning after a non-clan game reaches SwapClanSides with index 1 -- START answers 0 (FUN_0027d540 D:L125975-125988): mp_locked_game stays 0, no FINISH, the kit armed once (FromBriefing)', async () => {
    const hosted = [seat(2, 'socomc', 'seal', { host: true }), seat(3, 'other', 'terrorist')];
    const r = await lobby({ lobbyView: () => view(hosted) });
    expect(popupText(r)).toBe(loc(r, 350));
    r.press('CROSS', 6);                                                            // #350 seen (SeenPopup 1)
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(hosted, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    r.commands.matchReturned();
    const built = r.builds.length, enter = r.outcomes.length;
    r.m.menu.startDialog = GAME_LOBBY;
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view([seat(2, 'socomc', 'seal', { host: true, readyIn: 45 }), seat(3, 'other', 'terrorist', { readyIn: 0 })]));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    const from = r.outcomes.length;
    await r.settle(2 * SECOND);
    expect(rowCalls(r, GAME_LOBBY, from, /ClanGameSwapSides/)).toEqual(['ClanGameSwapSides(START) table']);
    expect([r.valve('ClanSwapSidesIndex'), r.valve('mp_locked_game') ?? 0]).toEqual([0, 0]);   // the master's attempt resets the index
    await r.settle(16 * SECOND);                                                    // past SwapClanSides' WAIT 5 and WAIT 10, were START 1
    expect(rowCalls(r, GAME_LOBBY, from, /ClanGameSwapSides/)).toEqual(['ClanGameSwapSides(START) table']);
    expect(r.valve('mp_locked_game') ?? 0).toBe(0);
    expect(rowCalls(r, GAME_LOBBY, enter, /ChangeCharacterType\(/)).toHaveLength(1);   // FromBriefing's (a SEAL, no stored record), no second
  });

  it('ONL-20b: ClanGameSwapSides (FUN_0027d540 D:L125956-125999) -- START answers 1 in an affiliation-4 game with mp_locked_game 1, 0 in any other; FINISH 1, the page\'s own side flipped and clanSwap sent (CLAN-SWAP: FUN_002bada0 -> FUN_002c0040); any other argument 1', async () => {
    const swap = (r: Rig, arg: string): boolean => r.host.dispatch({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'ClanGameSwapSides', arg, loc: 0, bytes: new Uint8Array(0x10) }).answer;
    for (const genericField3 of [0, 0xa0000005, 0xb0000005, 0xc0000005]) {
      const r = await lobby({ games: [{ ...GAME, genericField3 }], clanId: 5 });   // a member: affiliation 3 admits it (ClanGameClosed)
      expect([genericField3, swap(r, 'START'), r.valve('mp_locked_game') ?? 0]).toEqual([genericField3, false, 0]);
      const sent = r.sent.length;
      expect([swap(r, 'FINISH'), swap(r, 'NA'), r.valve('player_team'), r.sent.slice(sent)]).toEqual([true, true, 0, ['clanSwap']]);   // the script never reaches it here (START 0)
    }
    const r = await lobby({ games: [{ ...GAME, genericField3: 0xd0000005 }] });
    expect(r.valve('player_team')).toBe(8);
    expect([swap(r, 'START'), swap(r, 'start'), r.valve('mp_locked_game')]).toEqual([true, true, 1]);   // FUN_00198b80: case-insensitive
    expect([swap(r, 'FINISH'), r.valve('player_team'), r.valve('mp_locked_game')]).toEqual([true, 0, 1]);
    expect(swap(r, 'ELSE')).toBe(true);
  });

  it('CLAN-SWAP (research 309 §7.2 item 2): a HOST returning after an affiliation-4 game runs SwapClanSides over the machine -- START (mp_locked_game 1), WAIT 5, FINISH (its own side flipped at once, one clanSwap sent), the kit re-armed for the new side (the default TERRORIST type), mp_locked_game 0 after the WAIT 10', async () => {
    const hosted = [seat(2, 'socomc', 'seal', { host: true }), seat(3, 'other', 'terrorist')];
    const r = await lobby({ games: [{ ...GAME, genericField3: 0xd0000005 }], lobbyView: () => view(hosted) });
    expect(popupText(r)).toBe(loc(r, 350));
    r.press('CROSS', 6);                                                            // #350 seen (SeenPopup 1)
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(hosted, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    r.commands.matchReturned();
    const built = r.builds.length;
    r.m.menu.startDialog = GAME_LOBBY;
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view([seat(2, 'socomc', 'seal', { host: true, readyIn: 45 }), seat(3, 'other', 'terrorist', { readyIn: 0 })]));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    const from = r.outcomes.length, sent = r.sent.length;
    await r.settle(2 * SECOND);
    expect(rowCalls(r, GAME_LOBBY, from, /ClanGameSwapSides/)).toEqual(['ClanGameSwapSides(START) table']);
    expect(['ClanSwapSidesIndex', 'mp_locked_game', 'player_team'].map((n) => r.valve(n))).toEqual([0, 1, 0]);
    await r.settle(5 * SECOND);                                                     // past the WAIT 5
    expect(rowCalls(r, GAME_LOBBY, from, /ClanGameSwapSides/)).toEqual(['ClanGameSwapSides(START) table', 'ClanGameSwapSides(FINISH) table']);
    expect(r.sent.slice(sent)).toEqual(['clanSwap']);
    // The re-arm (P:L7170-7192): no restriction, no stored profile -- player_team 8: UiCharSet 240, ChangeCharacterType(5), MpCharSet 5.
    expect(['player_team', 'MpCharSet', 'mp_locked_game'].map((n) => r.valve(n))).toEqual([8, 5, 1]);
    expect(rowCalls(r, GAME_LOBBY, from, /ChangeCharacterType\(/).at(-1)).toMatch(/^ChangeCharacterType\(5\) /);   // the TERRORIST branch (the row is not this rig's)
    await r.settle(11 * SECOND);                                                    // the WAIT 10, then mp_teams_too_big 0
    expect(r.valve('mp_locked_game')).toBe(0);
    expect(r.sent.slice(sent)).toEqual(['clanSwap']);
  });

  /**
   * OT.R129 (the owner's ruling, 2026-11-14, seat redotcom-8f; `LOBBY_AFTER_MATCH_FREE_OWNER`, a departure from the
   * original on his word): the lobby a match returned to keeps none of its waits on the page -- the joiner's 10 s
   * `ClientDAReadyButton`, the 10 s `ArmButtonClock`, the 5 s after SWITCH TEAMS (`CountButtonFiveST`), READY's and SWITCH
   * TEAMS' own 5 s -- while `ComeFromBriefing` stays 0 (`SwapClanSides` keeps its branch). The countdown's lock and the
   * clan games' team lock stay; a fresh lobby keeps every wait.
   */
  const RETURNED = TWO.map((s) => ({ ...s, readyIn: 0 }));
  const bits = (r: Rig): boolean[] => ['PlayerReady', 'Glswitchteams', 'weaponselect'].map((name) => r.input.ring()!.controls.find((c) => c.name === name)!.enabled());
  /** Into the lobby, its first entry's waits run out, a match launched and returned, the lobby built again and settled 1 s. */
  async function returnedLobby(o: GameLobbyRigOptions = {}, seats: GameLobbyView['seats'] = RETURNED): Promise<Rig> {
    const r = await lobby(o);
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(seats, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    r.commands.matchReturned();
    const built = r.builds.length;
    r.m.menu.startDialog = GAME_LOBBY;                                                        // the page's way back (frontEnd's `back`)
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view(seats));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    await r.settle(SECOND);
    return r;
  }

  it('OT.R129: a joiner back from a match -- READY, SWITCH TEAMS and the ARMORY open within a second (ClientDAReadyButton and ArmButtonClock laid aside); ComeFromBriefing kept 0', async () => {
    const r = await returnedLobby();
    expect(r.current()).toBe(GAME_LOBBY);
    expect(bits(r)).toEqual([true, true, true]);
    expect(['NoReadyButton', 'WsCount', 'ComeFromBriefing', 'ClanSwapSidesIndex'].map((n) => r.valve(n))).toEqual([0, 0, 0, 1]);
  });

  it('OT.R129: back from a match, a second READY inside 5 s goes (CycleReadyButton\'s and ReadyToLoad\'s 5 s laid aside)', async () => {
    const r = await returnedLobby();
    const sent = r.sent.length;
    go(r, 'PlayerReady');
    r.press('CROSS', 4);
    expect([r.sent.slice(sent), r.valve('mp_minor_game_state')]).toEqual([['lobbyReady'], 2]);
    r.commands.gameLobby(view([RETURNED[0]!, { ...RETURNED[1]!, ready: true }]));
    await r.settle(SECOND);
    expect(bits(r)[0]).toBe(true);
    go(r, 'PlayerReady');
    r.press('CROSS', 4);
    expect([r.sent.slice(sent), r.valve('mp_minor_game_state')]).toEqual([['lobbyReady', 'lobbyReady'], 1]);
  });

  it('OT.R129: back from a match, SWITCH TEAMS leaves READY, the ARMORY and SWITCH TEAMS open (CountButtonFiveST and the switch\'s 5 s laid aside), the kit re-armed for the new side', async () => {
    const r = await returnedLobby();
    const sent = r.sent.length;
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    expect(r.sent.slice(sent)).toEqual(['switchTeams']);
    r.commands.gameLobby(view([RETURNED[0]!, { ...RETURNED[1]!, team: 'seal' }]));
    await r.settle(SECOND);
    expect(bits(r)).toEqual([true, true, true]);
    expect([r.valve('player_team'), r.valve('MpCharSet')]).toEqual([0, 1]);                // switch_teams_anim's tail: the SEAL default type
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    expect(r.sent.slice(sent)).toEqual(['switchTeams', 'switchTeams']);
  });

  /**
   * B-21 / I-1 (the lobby lane, 2026-11-21; INTAKE.md I-1: "i get randomly from seal to terrorist side when coming back in
   * lobby from map"): the side changes only by SWITCH TEAMS pressed on a lobby that is shown. The disc's scripts focus
   * SWITCH TEAMS on every arrival (P:L7226, P:L7280), and OT.R129 lays its 5 s aside after a return, so a stray press there
   * is a move: a click or a tap off every control is lost (B-21, `MENU_TOUCH_READING`), and a pad's CROSS held through the
   * return is the flush's (`MenuPad.flush`, `FUN_002d9e00`), never a press. The room's half (a queued swap, the balance)
   * is central's (`central/test/bridge.test.ts`, the two I-1 cases).
   */
  it('B-21: a first-entry lobby, SWITCH TEAMS focused -- a click off every control sends no switchTeams', async () => {
    const r = await lobby();
    expect([r.focused(), bits(r)[1]]).toEqual(['Glswitchteams', true]);         // focused and open: a press would move
    expect(r.input.tap(330, 40)).toBeNull();
    await r.settle(SECOND);
    expect(r.sent).not.toContain('switchTeams');
  });

  it('I-1: back from a match, SWITCH TEAMS focused and open -- two clicks off every control 150 ms apart send no switchTeams (B-62)', async () => {
    const r = await returnedLobby();
    const sent = r.sent.length;
    go(r, 'Glswitchteams');
    expect(bits(r)[1]).toBe(true);
    r.input.tap(330, 40);
    await r.settle(5);
    r.input.tap(600, 30);
    await r.settle(SECOND);
    expect(r.sent.slice(sent)).toEqual([]);
    expect(r.valve('player_team')).toBe(8);
  });

  it('I-1: a CROSS held as the match ends and through the return is the pad flush, not a press -- no switchTeams; let go, still none', async () => {
    const r = await lobby();
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(RETURNED, { launched: true }));
    await r.settle(SECOND);
    r.commands.matchReturned();
    const sent = r.sent.length, built = r.builds.length;
    r.hold('CROSS');                                                                           // jump held as GAME COMPLETE ends
    r.m.menu.startDialog = GAME_LOBBY;
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view(RETURNED));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    await r.settle(2 * SECOND);
    expect([r.focused(), bits(r)[1]]).toEqual(['Glswitchteams', true]);                       // focused and open: a press would move
    r.hold(null);
    await r.settle(SECOND);
    expect(r.sent.slice(sent)).toEqual([]);
    r.press('CROSS', 4);                                                                       // a press on the shown lobby is SWITCH TEAMS
    expect(r.sent.slice(sent)).toEqual(['switchTeams']);
  });

  it('OT.R129: back from a match, the launch countdown still closes READY, SWITCH TEAMS and the ARMORY (CountDown)', async () => {
    const r = await returnedLobby();
    r.commands.gameLobby(view(RETURNED, { countdown: 11 }));
    await r.settle(2 * SECOND);
    expect(bits(r)).toEqual([false, false, false]);
  });

  it('OT.R129: back from a match in a clan game of affiliation 1, SWITCH TEAMS stays closed (IsSwitchTeamsOK); READY and the ARMORY open', async () => {
    const r = await returnedLobby({ games: [{ ...GAME, genericField3: 0xa0000005 }], clanId: 5 });
    expect(bits(r)).toEqual([true, false, true]);
  });

  it('OT.R129: a fresh lobby keeps its waits -- the joiner\'s READY and the ARMORY held at its entry (ClientDAReadyButton, ArmButtonClock)', async () => {
    const r = await lobby();
    await r.settle(2 * SECOND);
    expect([bits(r)[0], bits(r)[2], r.valve('NoReadyButton')]).toEqual([false, false, 1]);
  });

  /**
   * LOBBY-READY-DELAY (the brief's item 2; the owner's words, extending OT.R129): a page that enters a RETURNED lobby
   * fresh -- a reload, a rejoin, every page after a rotation's 4021 close -- was held by the first entry's waits (`hold`
   * sets `afterMatch` false, and the view said nothing of the return): the joiner's 10 s `ClientDAReadyButton`, the 10 s
   * `ArmButtonClock`. The room's view now says so (`returned: true`, our match server's own wire), and the page lays the
   * waits aside on the first such view. The first entry from the briefing room keeps the original's gates.
   *
   * `freshInto`: the menu, BRIEFING ROOMS, Alpha, the listed game's join -- its first `gameLobby` the one given -- and the
   * lobby shown; NOT settled further, so the test reads the controls at its own second.
   */
  const withReturned = (v: GameLobbyView): GameLobbyView => Object.assign(v, { returned: true as const });
  async function freshInto(first: GameLobbyView, o: GameLobbyRigOptions = {}): Promise<Rig> {
    const r = await briefing({ ...o, lobbyView: () => first });
    joinListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    expect(r.current()).toBe(GAME_LOBBY);
    return r;
  }

  it('LOBBY-READY-DELAY (2): a FRESH joiner page into a returned lobby -- READY, SWITCH TEAMS and the ARMORY open within a second', async () => {
    const r = await freshInto(withReturned(view(RETURNED)));
    await r.settle(SECOND);
    // RED until the change: the view's `returned` is not read, so ClientDAReadyButton holds READY and ArmButtonClock the
    // ARMORY for their 10 s (bits [false, true, false] today; SWITCH TEAMS is open on a first entry too).
    expect(bits(r)).toEqual([true, true, true]);
    expect(r.valve('NoReadyButton')).toBe(0);
    go(r, 'PlayerReady');
    const sent = r.sent.length;
    r.press('CROSS', 4);
    expect(r.sent.slice(sent)).toEqual(['lobbyReady']);
  });

  /**
   * OT.R129's #350 (the owner's ruling of 2026-11-23 in the controller's seat, "Hide it there"): a FRESH host page in the
   * RETURNED lobby shows no "The READY button will be available in 30 seconds." -- as a host page that played the match
   * shows none on its return (its `SeenPopup` stands at 1 from the first entry's dismissal, and `Enable_SM_Launch` tests
   * it under `ComeFromBriefing` 0, tools/test/onlineDialogs.pinned.json:7145-7160). The first entry from the briefing
   * room keeps #350 as the original shows it (the guard below, and the host case at "the host: IsSessionMaster ...").
   */
  const HOSTED = [seat(2, 'socomc', 'seal', { host: true, readyIn: 0 }), seat(3, 'other', 'terrorist', { readyIn: 0 })];

  it('LOBBY-READY-DELAY (2), OT.R129 "Hide it there": a FRESH host page into a returned lobby -- no #350; READY, SWITCH TEAMS and the ARMORY open at 2 s, nothing dismissed', async () => {
    const r = await freshInto(withReturned(view(HOSTED)));
    // RED at 07e24a163b: the fresh page's `SeenPopup` is 0 (the briefing room's join_game_main writes it 0 before
    // ConnectToGameServer, pinned :4563 and :4644), so `Enable_SM_Launch` raises #350 over the lobby and waits on HostValve.
    let seen = popupText(r) !== '';
    // 2 s, not 1: `SetupSessionMaster` enables READY after its own WAIT 1 once `mp_45_sec_clock` is 0 -- the disc's
    // script, kept; the release writes the controls when it stops ArmButtonClock. No press: nothing is dismissed.
    for (let i = 0; i < 2 * SECOND; i++) { await r.settle(1); seen ||= popupText(r) !== ''; }
    expect(seen).toBe(false);
    expect(r.valve('SeenPopup')).toBe(1);
    expect(bits(r)).toEqual([true, true, true]);
  });

  it('LOBBY-READY-DELAY (2), the guard: a FRESH host page on a FIRST entry (no `returned`) still shows #350 (Enable_SM_Launch, SeenPopup 0)', async () => {
    // Green before and after the change: the ruling hides #350 in the returned lobby only.
    const r = await freshInto(view(HOSTED));
    await until(r, () => popupText(r) === loc(r, 350), 2 * SECOND);
    expect(popupText(r)).toBe(loc(r, 350));
    await r.settle(2 * SECOND);
    expect(popupText(r)).toBe(loc(r, 350));                               // it stands until dismissed (HostValve)
    expect(r.valve('SeenPopup') ?? 0).toBe(0);
  });

  it('LOBBY-READY-DELAY (2), OT.R129 "Hide it there": the room\'s `returned` heard AFTER Enable_SM_Launch raised #350 -- the popup ends through its own valve (HostValve), then the controls open', async () => {
    // The other order: the first returned view later than the screen's ONSTART. Simulated by a first view without
    // `returned` (#350 up, the script waiting `WHILE HostValve == 0`), then the returned view. RED at 07e24a163b: nothing
    // writes HostValve, so #350 stands.
    // Read the POPUP node's visibility, not the text: KillPopup only hides the node (menuShell `killPopUp`, popupSlot
    // `hide`, FUN_0027d190) and leaves the popup's text lines as they were (Popup.setText ignores ''), so the text of
    // #350 reads on after its close.
    const r = await freshInto(view(HOSTED));
    const shown = (): boolean => r.parts.current?.popup()?.node?.visible === true;
    await until(r, () => popupText(r) === loc(r, 350), 2 * SECOND);
    expect([popupText(r), shown()]).toEqual([loc(r, 350), true]);
    r.commands.gameLobby(withReturned(view(HOSTED)));
    await r.settle(SECOND);
    expect(shown()).toBe(false);                                          // the script's own tail: SeenPopup 1, KillPopup
    expect(r.valve('SeenPopup')).toBe(1);
    await r.settle(2 * SECOND);                                           // SetupSessionMaster's WAIT 1, as above
    expect(bits(r)).toEqual([true, true, true]);
  });

  it('LOBBY-READY-DELAY (2), OT.R129 "Hide it there", keyed on the return (the controller\'s ruling of 2026-11-23): a FIRST-entry joiner that played the match and is the host in the returned lobby (a migration) shows no #350', async () => {
    // The joiner never saw #350 (Enable_SM_Launch raises it only under IsSessionMaster), so its SeenPopup is 0; the return
    // (`matchReturned`) now writes it 1, as every page that played a match back to the lobby. RED at e6cf06e50f: only a
    // FRESH returned page wrote it, so the migrated host's rebuilt lobby raised #350.
    const r = await lobby();
    r.commands.gameLobby(view(TWO));
    await r.settle(SECOND);
    expect(r.valve('SeenPopup') ?? 0).toBe(0);
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    r.commands.matchReturned();
    const built = r.builds.length;
    r.m.menu.startDialog = GAME_LOBBY;                                    // the page's way back (frontEnd's `back`)
    r.m.states.switchTo(r.m.menu);
    const MIGRATED = [seat(2, 'socomc', 'terrorist', { host: true, readyIn: 0 }), seat(3, 'other', 'seal', { readyIn: 0 })];
    r.commands.gameLobby(withReturned(view(MIGRATED)));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    let seen = popupText(r) !== '';
    for (let i = 0; i < 2 * SECOND; i++) { await r.settle(1); seen ||= popupText(r) !== ''; }
    expect(seen).toBe(false);
    expect(r.valve('SeenPopup')).toBe(1);
  });

  it('LOBBY-READY-DELAY (2), the control: the same fresh joiner page WITHOUT `returned` still runs the first entry\'s waits (ClientDAReadyButton, ArmButtonClock)', async () => {
    // A guard, green today and after the change: readyIn 0 alone is no return.
    // It also shows the rig's first second already held by the scripts, so the two cases above are red for the waits.
    const r = await freshInto(view(RETURNED));
    await r.settle(SECOND);
    expect([bits(r)[0], bits(r)[2]]).toEqual([false, false]);
    await r.settle(3 * SECOND);
    expect([bits(r)[0], bits(r)[2], r.valve('NoReadyButton')]).toEqual([false, false, 1]);
  });

  it('LOBBY-READY-DELAY (2): the fresh returned page keeps the launch countdown\'s lock (CountDown) -- READY, SWITCH TEAMS and the ARMORY closed under it', async () => {
    // A guard: OT.R129 keeps the countdown lock; a fresh page told `returned` keeps it too.
    const r = await freshInto(withReturned(view(RETURNED)));
    await r.settle(SECOND);
    r.commands.gameLobby(withReturned(view(RETURNED, { countdown: 11 })));
    await r.settle(2 * SECOND);
    expect(bits(r)).toEqual([false, false, false]);
  });

  /**
   * LOBBY-READY-DELAY (the brief's item 3; reading, pending review): `return_to_gamelobby` sets `mp_x_sec_clock` 11
   * (P:L14644-14649; research 179 :565 and :2070), which `matchReturned`'s doc cites and did not write. On the console
   * that script is the session master's (`watch_for_switch_to_client` -> `call_gamelobby`); a joiner's `check_loop`
   * writes 11 itself at the launch (`IF NOT ( IsSessionMaster(NA) )`, tools/test/onlineDialogs.pinned.json:7122-7124), so
   * the hole was the HOST page's: after a launch by the 80% countdown its clock stood where `CountDown` left it, under
   * 11, and `CountDown`'s "under 11" lock could close the returned lobby's controls again. The review's F2: on a host
   * rig, so only `matchReturned`'s write makes the 11 -- red at c4afde8981 (no write; the host's check_loop skips its
   * own), where a joiner's rig was green there (its check_loop's 11 at the launch).
   */
  it('LOBBY-READY-DELAY (3): a HOST lobby launched by the 80% countdown, then the match\'s return -- mp_x_sec_clock 11 again, READY and the ARMORY open past CountDown\'s next tick', async () => {
    const hosted = [seat(2, 'socomc', 'seal', { host: true, readyIn: 0 }), seat(3, 'other', 'terrorist', { readyIn: 0 })];
    const r = await lobby({ lobbyView: () => view(hosted) });
    r.press('CROSS', 6);                                                 // #350 seen (SeenPopup 1)
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(hosted, { countdown: 11 }));               // the room's 80% countdown
    await r.settle(5 * SECOND);
    expect(r.valve('mp_x_sec_clock')).toBeLessThan(11);                  // CountDown's clock driven down (the page's `clocks`)
    r.commands.gameLobby(view(hosted, { launched: true }));              // the countdown's end: the launch
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    expect(r.valve('mp_x_sec_clock')).toBeLessThan(11);                  // the host's check_loop writes no 11 at the launch
    r.commands.matchReturned();
    // RED at c4afde8981: matchReturned writes no mp_x_sec_clock, so the host's still holds the countdown's last value.
    expect(r.valve('mp_x_sec_clock')).toBe(11);
    const built = r.builds.length;
    r.m.menu.startDialog = GAME_LOBBY;                                   // the page's way back (frontEnd's `back`)
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view(hosted));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    await r.settle(2 * SECOND);                                          // SetupSessionMaster's WAIT 1, as the host cases above
    expect(r.valve('mp_x_sec_clock')).toBe(11);
    expect([bits(r)[0], bits(r)[2]]).toEqual([true, true]);
    await r.settle(2 * SECOND);                                          // past CountDown's next tick
    expect(r.valve('mp_x_sec_clock')).toBe(11);
    expect([bits(r)[0], bits(r)[2]]).toEqual([true, true]);
  });

  /** A valve written in its own type (or TEMP, as the script parse makes an unknown name). */
  const setValve = (r: Rig, n: string, v: number): void => { r.m.valves.set(n, v, r.m.valves.find(n)?.type ?? VALVE_TYPE.TEMP); };

  it("OT.R129 fold (a): back from a match, a character committed in the ARMORY (IDFromBriefing 1), then SWITCH TEAMS -- the kit re-armed for the new side as switch_teams_anim's end does (P:L7603-7621), not FromBriefing alone", async () => {
    const r = await returnedLobby();
    setValve(r, 'IDFromBriefing', 1);                                                       // as the ARMORY's commit leaves it
    expect([r.valve('player_team'), r.valve('MpCharSet'), r.valve('UiCharSet')]).toEqual([8, 5, 240]);
    const from = r.outcomes.length;
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view([RETURNED[0]!, { ...RETURNED[1]!, team: 'seal' }]));
    await r.settle(SECOND);
    expect([r.valve('player_team'), r.valve('MpCharSet'), r.valve('UiCharSet')]).toEqual([0, 1, 15]);   // the SEAL default type
    expect(rowCalls(r, GAME_LOBBY, from, /ChangeCharacterType\(/).at(-1)).toMatch(/^ChangeCharacterType\(1\) /);
    expect(bits(r)).toEqual([true, true, true]);
  });

  it("OT.R129 fold (b): back from a match, the room's launch heard right after its answer to SWITCH TEAMS -- the new side's kit re-armed (switch_teams_anim's end) as the match starts", async () => {
    const r = await returnedLobby();
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    const moved = [{ ...RETURNED[0]!, ready: true }, { ...RETURNED[1]!, team: 'seal' as const, ready: true }];
    r.commands.gameLobby(view(moved));
    r.commands.gameLobby(view(moved, { launched: true }));
    expect(r.starts).toHaveLength(2);
    await r.settle(2);
    expect([r.valve('player_team'), r.valve('MpCharSet'), r.valve('UiCharSet')]).toEqual([0, 1, 15]);
  });

  it("OT.R129 fold: a seat in the lobby when the room abandons its match (a late seat waiting) has the waits laid aside too -- the ARMORY open within a second", async () => {
    const r = await lobby({ lobbyView: () => view(TWO, { launched: true }) });
    r.press('CROSS', 10);                                                                   // #353: YES, wait in the lobby
    expect(r.valve('NoReadyButton')).toBe(1);                                               // ArmButtonClock counting
    r.commands.abandoned();                                                                 // the room's abandon, then its lobby again
    r.commands.gameLobby(view(RETURNED));
    await r.settle(SECOND);
    expect([bits(r)[2], r.valve('NoReadyButton')]).toEqual([true, 0]);
  });

  it("OT.R129 fold: a host's mp_locked_game left at 1 by an earlier swap (an ARMORY trip in SwapClanSides' WAIT 10) holds nothing at a return with no swap due (ClanSwapSidesIndex 2)", async () => {
    const hosted = [seat(2, 'socomc', 'seal', { host: true, readyIn: 0 }), seat(3, 'other', 'terrorist', { readyIn: 0 })];
    const r = await lobby({ games: [{ ...GAME, genericField3: 0xd0000005 }], lobbyView: () => view(hosted) });
    r.press('CROSS', 6);                                                                    // #350 seen (SeenPopup 1)
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(hosted, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    setValve(r, 'mp_locked_game', 1);                                                       // the earlier swap's lock, never let go
    setValve(r, 'ClanSwapSidesIndex', 1);                                                   // a game since this host's last attempt
    r.commands.matchReturned();                                                             // GAME COMPLETE's +1: 2, no swap due
    const built = r.builds.length;
    r.m.menu.startDialog = GAME_LOBBY;
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view(hosted));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    await r.settle(2 * SECOND);
    expect([r.valve('ClanSwapSidesIndex'), r.valve('mp_locked_game'), bits(r)[2]]).toEqual([2, 1, true]);
  });

  it('OT.R129, the swap guard on the host\'s page: in "Alternate teams" its waits stand through SwapClanSides\' window, then open at its FINISH', async () => {
    const hosted = [seat(2, 'socomc', 'seal', { host: true, readyIn: 0 }), seat(3, 'other', 'terrorist', { readyIn: 0 })];
    const r = await lobby({ games: [{ ...GAME, genericField3: 0xd0000005 }], lobbyView: () => view(hosted) });
    r.press('CROSS', 6);                                                            // #350 seen (SeenPopup 1)
    await r.settle(12 * SECOND);
    r.commands.gameLobby(view(hosted, { launched: true }));
    await r.settle(SECOND);
    expect(r.starts).toHaveLength(1);
    r.commands.matchReturned();
    const built = r.builds.length;
    r.m.menu.startDialog = GAME_LOBBY;
    r.m.states.switchTo(r.m.menu);
    r.commands.gameLobby(view(hosted));
    await until(r, () => r.builds.length > built && r.current() === GAME_LOBBY);
    const sent = r.sent.length;
    await r.settle(2 * SECOND);
    expect([bits(r)[2], r.valve('mp_locked_game')]).toEqual([false, 1]);              // the swap's window: ArmButtonClock stands
    await r.settle(5 * SECOND);
    expect(r.sent.slice(sent)).toEqual(['clanSwap']);
    await r.settle(SECOND);
    expect(bits(r)[2]).toBe(true);                                                   // FINISH sent: the ARMORY open before ArmButtonClock's 10 s
  });

  it('the host: IsSessionMaster from the star, #350 at the entry; MP_EIGHTY_READY runs launch_10sec_anim -- ForceMPLaunch sends launch, or #356 with a side empty', async () => {
    const hosted = [seat(2, 'socomc', 'seal', { host: true }), seat(3, 'other', 'terrorist')];
    let r = await lobby({ lobbyView: () => view(hosted) });
    expect(popupText(r)).toBe(loc(r, 350));
    r.press('CROSS', 6);
    await r.settle(SECOND);
    expect(r.shown()).toBe(false);
    r.post('MP_EIGHTY_READY');
    await r.settle(SECOND);
    expect(r.sent).toEqual(['launch']);
    r = await lobby({ lobbyView: () => view([hosted[0]!]) });
    r.press('CROSS', 6);
    await r.settle(SECOND);
    r.post('MP_EIGHTY_READY');
    await r.settle(SECOND);
    expect([r.sent, popupText(r)]).toEqual([[], loc(r, 356)]);
  });

  it('a host handed on (SVC-07b): the star on this seat makes IsSessionMaster true, and Session_master_migration gives it the host\'s buttons', async () => {
    const r = await lobby();
    const from = r.outcomes.length;
    r.commands.gameLobby(view([seat(2, 'socomc', 'terrorist', { host: true })]));
    await r.settle(2 * SECOND);
    expect(rowCalls(r, GAME_LOBBY, from, /IsSessionMaster|EnableButton\(Lock\)/)).toEqual(expect.arrayContaining(['IsSessionMaster(NA) table', 'EnableButton(Lock) table']));
    expect(r.commands.IsSessionMaster({ anim: 't', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'IsSessionMaster', arg: '', loc: 0, bytes: new Uint8Array(0x10) }, null as never, undefined)).toBe(true);
  });

  it('the bridge\'s closes: 4007 the game ended -- dlgNetAbandoned.rdr, #528; any other -- mp_net_errno 32 and MP_MEDIUS_ERROR, OnNetError\'s #365', async () => {
    let r = await lobby();
    r.commands.seatEnded(4007);
    const seen = new Set<string>();
    await until(r, () => { if (popupText(r) !== '') seen.add(`${r.current()}: ${popupText(r)}`); return r.current() === 'dlgWorldOfSOCOM.rdr'; }, 10 * SECOND);
    await r.settle(SETTLED);
    expect([r.switches, r.builds.slice(-2), [...seen].some((t) => t.endsWith(loc(r, 528)))]).toEqual([[NET_ABANDONED], [NET_ABANDONED, 'dlgWorldOfSOCOM.rdr'], true]);
    expect(r.calls(NET_ABANDONED)).toEqual(['POPUPDIALOG(NA) table', 'POPUP.op24(NA)', 'DisconnectFromGameServer(NA) table', 'SWITCHMENU(dlgWorldOfSOCOM.rdr) table']);
    for (const code of [4008, 4006, 1011]) {
      r = await lobby();
      r.commands.seatEnded(code);
      await r.settle(10);
      expect([r.valve('mp_net_errno'), popupText(r)], String(code)).toEqual([32, loc(r, 365)]);
    }
  });

  /**
   * VERSION-ABORT (research 315 §3.6, §6 E3; `VERSION_REFUSAL_ABORT_READING`): the original's console compares a peer's
   * version field with its own and posts MP_VERSION_NUMBER_ERROR to the current dialog on a difference (`FUN_002c0850`
   * D:L163320-163326, S:0x3f28c0); the GAME LOBBY's `version_failure_2` (P:L6622, P:L7699-7700) and the BRIEFING ROOM's
   * `version_failure_1` (P:L4097, P:L4418-4419) each SWITCHMENU(dlgNetAbort.rdr), whose ONSTART leaves the game, waits
   * 3 s and returns to SOCOM II ONLINE (P:L12342-12372). The port's hello refused for its protocol version is that
   * mismatch; no errno is written, so a 32 an earlier close left would not REBOOT it either. Every other refusal as
   * before: an unknown text in the lobby is errno 32 and #365.
   */
  it('VERSION-ABORT: a hello refused for its protocol version posts MP_VERSION_NUMBER_ERROR -- version_failure_2, dlgNetAbort.rdr, 3 s, SOCOM II ONLINE; mp_net_errno untouched', async () => {
    expect(VERSION_REFUSAL_ABORT_READING).toBe('a game hello refused for its protocol version posts MP_VERSION_NUMBER_ERROR');
    expect(versionRefusalText(10, 11)).toBe('protocol 10, this server speaks 11');
    expect([10, 0, -1, 1.5].map((v) => isVersionRefusal(versionRefusalText(v, 11)))).toEqual([true, true, true, true]);
    expect([TOO_MANY_SPECTATORS_TEXT, TOO_MANY_PLAYERS_TEXT, CLOSED_CLAN_GAME_TEXT, 'The game is full.', 'protocol 10', 'protocol 10, this server speaks', '', null]
      .map((t) => isVersionRefusal(t))).toEqual([false, false, false, false, false, false, false, false]);
    for (const leftover of [undefined, 32]) {
      const r = await lobby();
      if (leftover !== undefined) { r.m.valves.acquire('mp_net_errno', VALVE_TYPE.PERM); r.m.valves.set('mp_net_errno', leftover, VALVE_TYPE.PERM); }   // an earlier close's 32 (315 §3.5)
      expect(r.valve('mp_net_errno'), 'the starting value').toBe(leftover);
      const from = r.outcomes.length;
      r.commands.seatEnded(4000, versionRefusalText(10, 11));
      // From dlgNetAbort's ONSTART (its DisconnectFromGameServer, the line before WAIT 3) to the switch.
      const left = (): boolean => r.calls('dlgNetAbort.rdr').includes('DisconnectFromGameServer(NA) table');
      await until(r, left, 3 * SECOND);
      const at = r.frames();
      expect([r.current(), left(), rowCalls(r, GAME_LOBBY, from, /SWITCHMENU|POPUPDIALOG/)], String(leftover)).toEqual(['dlgNetAbort.rdr', true, ['SWITCHMENU(dlgNetAbort.rdr) table']]);
      await r.settle(Math.floor(2.9 / UI_TICK_SECONDS));
      expect(r.current(), `${leftover}: 2.9 s`).toBe('dlgNetAbort.rdr');
      await until(r, () => r.current() === 'dlgWorldOfSOCOM.rdr', 3 * SECOND);
      const waited = (r.frames() - at + 1) * UI_TICK_SECONDS;                 // the ONSTART's own frame counted
      expect([r.current(), waited >= 3 && waited < 3.1], `${leftover}: ${waited} s`).toEqual(['dlgWorldOfSOCOM.rdr', true]);
      await r.settle(SETTLED);
      expect(r.builds.slice(-2), String(leftover)).toEqual(['dlgNetAbort.rdr', 'dlgWorldOfSOCOM.rdr']);
      expect(r.calls('dlgNetAbort.rdr').filter((c) => /DisconnectFromGameServer|SWITCHMENU/.test(c)), String(leftover))
        .toEqual(['DisconnectFromGameServer(NA) table', 'SWITCHMENU(dlgWorldOfSOCOM.rdr) table']);
      // The game left as dlgNetAbort's ONSTART leaves it; no errno written, no #365, no REBOOT.
      expect([r.valve('mp_net_errno'), r.socketLog, r.leaves.length, r.lobby.state(), r.switches], String(leftover)).toEqual([leftover, ['open 7', 'close'], 1, 11, []]);
    }
    const r = await lobby();                                     // every other refusal as before: errno 32, #365
    r.commands.seatEnded(4000, 'The game is full.');
    await r.settle(10);
    expect([r.valve('mp_net_errno'), popupText(r)]).toEqual([32, loc(r, 365)]);
  });

  it('VERSION-ABORT: the same refusal during the BRIEFING ROOM\'s join -- version_failure_1, dlgNetAbort.rdr, then SOCOM II ONLINE; no errno', async () => {
    const r = await briefing({ welcome: null });
    joinListed(r);
    await until(r, () => r.socketLog.length > 0, 10 * SECOND);
    expect(r.valve('mp_net_errno'), 'the starting value').toBeUndefined();
    const from = r.outcomes.length;
    r.commands.seatEnded(4000, versionRefusalText(10, 11));
    await until(r, () => r.current() === 'dlgWorldOfSOCOM.rdr', 10 * SECOND);
    await r.settle(SETTLED);
    expect(rowCalls(r, BRIEFING_ROOM, from, /SWITCHMENU|POPUPDIALOG/)).toEqual(['SWITCHMENU(dlgNetAbort.rdr) table']);
    expect(r.calls('dlgNetAbort.rdr').filter((c) => /DisconnectFromGameServer|SWITCHMENU/.test(c))).toEqual(['DisconnectFromGameServer(NA) table', 'SWITCHMENU(dlgWorldOfSOCOM.rdr) table']);
    expect(r.builds.slice(-2)).toEqual(['dlgNetAbort.rdr', 'dlgWorldOfSOCOM.rdr']);
    expect([r.valve('mp_net_errno'), r.socketLog, r.lobby.state()]).toEqual([undefined, ['open 7', 'close'], 11]);
  });

  /**
   * VERSION-ABORT, the players-view rehearsal's stage A (i)/(ii) (2026-11-14, b0's local stacks): the room refuses a
   * creator's hello some 5 ms after the socket opens, while CREATE GAME is still the built dialog -- it binds no
   * MP_VERSION_NUMBER_ERROR, so the post was lost and the page sat in an empty GAME LOBBY (connected false, inLobby true,
   * no seat). In the original the mismatch is met where a dialog answers it (`FUN_002c0850` posts to the current
   * dialog, the GAME LOBBY's `version_failure_2`, the BRIEFING ROOM's `version_failure_1`): the post is held until one
   * of the two is built (`VERSION_ABORT_HELD_ADAPTATION`), then the lobby's own abort runs as above.
   */
  it('VERSION-ABORT: a creator\'s hello refused before the GAME LOBBY is built -- the post held for the lobby, then version_failure_2, dlgNetAbort.rdr, SOCOM II ONLINE; no errno', async () => {
    const r = await briefing({ refuse: versionRefusalText(15, 16), lobbyView: (id) => view([seat(id, 'socomc', 'seal', { host: true })]) });
    go(r, 'CRgame');
    r.press('CROSS', 4);
    await until(r, () => r.current() === CREATE_GAME, 10 * SECOND);
    await r.settle(SETTLED);
    r.uiVars.set(r.uiVars.add('GAMENAMEVAR', null, 2), { type: 'string', value: 'mine' });
    r.uiVars.set(r.uiVars.add('PLAYLISTVAR', null, 2), { type: 'array', value: [{ type: 'array', value: [{ type: 'int', value: 2 }] }] });
    r.press('SQUARE', 4);
    await until(r, () => r.socketLog.length > 0, 20 * SECOND);
    await until(r, () => r.current() === 'dlgWorldOfSOCOM.rdr' && r.builds.at(-1) === 'dlgWorldOfSOCOM.rdr', 30 * SECOND);
    await r.settle(SETTLED);
    expect(r.builds.slice(-3)).toEqual([GAME_LOBBY, 'dlgNetAbort.rdr', 'dlgWorldOfSOCOM.rdr']);
    expect(r.calls('dlgNetAbort.rdr').filter((c) => /DisconnectFromGameServer|SWITCHMENU/.test(c))).toEqual(['DisconnectFromGameServer(NA) table', 'SWITCHMENU(dlgWorldOfSOCOM.rdr) table']);
    expect([r.valve('mp_net_errno'), r.socketLog]).toEqual([undefined, ['open 9', 'close']]);
  });

  it('leaving: TRIANGLE asks #362; yes -- #363, DisconnectFromGameServer (the socket closed, /lobby/leave-game, state 11), back to the briefing room', async () => {
    const r = await lobby();
    const from = r.outcomes.length;
    r.press('TRIANGLE', 6);
    expect(popupText(r)).toBe(loc(r, 362));
    r.press('LEFT', 4);
    r.press('CROSS', 6);
    await until(r, () => r.current() === BRIEFING_ROOM, 10 * SECOND);
    expect(rowCalls(r, GAME_LOBBY, from, /DisconnectFromGameServer|SWITCHMENU/)).toEqual(['DisconnectFromGameServer(NA) table', 'SWITCHMENU(dlgMPBriefingRoom.rdr) table']);
    expect([r.socketLog, r.leaves.length, r.lobby.state(), r.current()]).toEqual([['open 7', 'close'], 1, 11, BRIEFING_ROOM]);
  });

  // R4P-232 / L379 (reading, pending review): r0004 0x0027f660 D4:L133648-133654 clears GoneToArmory on leaving and,
  // when it was non-zero, runs its watchers; r0001's FUN_0027e420 goes straight to the teardown.
  for (const [armory, runs] of [[1, 1], [0, 0]] as const) {
    it(`leaving with GoneToArmory ${armory}: the valve is 0 and its watchers ran ${runs} time(s) (R4P-232)`, async () => {
      const r = await lobby();
      r.m.valves.acquire('GoneToArmory', VALVE_TYPE.TEMP);                    // the script's valve (TEMP)
      r.m.valves.set('GoneToArmory', armory, VALVE_TYPE.TEMP);
      let ran = 0;
      r.m.valves.watch('GoneToArmory', 0xff, () => { ran++; });
      r.press('TRIANGLE', 6);
      r.press('LEFT', 4);
      r.press('CROSS', 6);
      await until(r, () => r.current() === BRIEFING_ROOM, 10 * SECOND);
      expect([r.valve('GoneToArmory'), ran, r.leaves.length]).toEqual([0, runs, 1]);
      // r0004 acquires it as type 2 (TEMP): the leave never promotes it, so the relaunch's TEMP drop still clears it.
      expect(r.m.valves.acquire('GoneToArmory', VALVE_TYPE.TEMP).type).toBe(VALVE_TYPE.TEMP);
    });
  }

  /**
   * LATE-WATCH (W19.R12; research 314 §4.2, §7 item 3): a seat whose first view is launched is a late joiner. YES to
   * `SetupLateJoiner`'s popup only waits -- the list redrawn every 5 s while `late_joiner` is 1 (P:L7268-7271) -- and its
   * READY, lit at once (P:L7250-7251), loads it: `ready_anim` -> `ReadyToLoad` (P:L6644, P:L7433), whose late branch
   * writes the major state 2 and the minor 1 (`FUN_0027caf0` D:L125606-125608; the 2 in the delay slot at 0x0027cb24),
   * so `check_loop`'s wait ends (P:L7116) on `SWITCHMENU(LOAD_SCREEN)` (P:L7126) -- with no room `roundStart`, and
   * nothing sent (`READY_LOADS_LATE_JOINER_READING`). No team test: the watcher (#352) and the ghost (#353) alike.
   */
  const watchListed = (r: Rig): void => { go(r, 'WatchGame'); r.press('CROSS', 6); expect(r.focused()).toBe('GAMELIST'); r.press('CROSS', 2); };
  const WATCHING = [seat(1, 'host', 'seal', { host: true }), seat(2, 'socomc', null)];
  async function lateWatcher(): Promise<Rig> {
    const r = await briefing({ lobbyView: () => view(WATCHING, { launched: true }) });
    watchListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    await r.settle(SETTLED);
    return r;
  }
  /** The popup's YES (#253, the default) answered, the lobby then left to run for a while: the wait, not the load. */
  async function yesWaits(r: Rig): Promise<void> {
    r.press('CROSS', 10);
    await r.settle(6 * SECOND);
    expect([r.shown(), r.current(), r.valve('late_joiner'), r.valve('mp_major_game_state'), r.starts]).toEqual([false, GAME_LOBBY, 1, 1, []]);
  }
  /** READY: the late branch -- the hand-off and LOAD_SCREEN, no `lobbyReady`, no `roundStart` given. */
  async function readyLoads(r: Rig): Promise<void> {
    const from = r.outcomes.length;
    go(r, 'PlayerReady');
    r.press('CROSS', 4);
    await r.settle(SECOND);
    expect([r.valve('mp_major_game_state'), r.valve('mp_minor_game_state'), r.starts.map((s) => s.lateJoiner), r.sent]).toEqual([2, 1, [true], []]);
    expect(rowCalls(r, GAME_LOBBY, from, /ReadyToLoad|SWITCHMENU/).filter((c, k, a) => a.indexOf(c) === k)).toEqual(['ReadyToLoad(NA) table', 'SWITCHMENU(LOAD_SCREEN) table']);
    expect(r.socketLog).toEqual(['open 7']);                                       // the match's socket, kept
  }

  it('LATE-WATCH: a watcher into a launched game -- #352; YES only waits; READY goes to LOAD_SCREEN and the hand-off with no roundStart (ReadyToLoad\'s late branch)', async () => {
    const r = await lateWatcher();
    expect([r.joins.map((j) => j.joinType), r.valve('player_team'), r.valve('late_joiner'), r.valve('mp_major_game_state'), popupText(r), r.starts]).toEqual([[1], 16, 1, 1, loc(r, 352), []]);
    await yesWaits(r);
    await readyLoads(r);
  });

  it('LATE-WATCH: a watcher into a launched game answering NO -- exit_lobby with no prompt (P:L7272-7276): the socket closed, the briefing room', async () => {
    const r = await lateWatcher();
    expect(popupText(r)).toBe(loc(r, 352));
    r.press('RIGHT', 4);
    r.press('CROSS', 6);
    await until(r, () => r.current() === BRIEFING_ROOM, 10 * SECOND);
    expect([r.current(), r.socketLog, r.leaves.length, r.starts]).toEqual([BRIEFING_ROOM, ['open 7', 'close'], 1, []]);
  });

  it('LATE-WATCH: a player into a launched game -- #353; YES waits, the room\'s roundStart starts nothing; READY loads it (the ghost, seated by the room from the next round)', async () => {
    const r = await lobby({ lobbyView: () => view(TWO, { launched: true }) });
    expect([r.valve('player_team'), r.valve('late_joiner'), r.valve('mp_major_game_state'), popupText(r), r.starts]).toEqual([8, 1, 1, loc(r, 353), []]);
    await yesWaits(r);
    r.commands.roundStart();
    await r.settle(SECOND);
    expect([r.valve('mp_major_game_state'), r.starts]).toEqual([1, []]);
    await readyLoads(r);
  });

  // LATE-WATCH's review F2 (`LATE_SEAT_NEVER_READY_PLACEHOLDER`): a late seat still waiting when the room's view says
  // the game is no longer launched (its lobby again) is a late joiner no more -- the late state cleared, so READY is the
  // normal ready and the next launch takes it with the others.
  it('LATE-WATCH F2: late, YES, the room back in its lobby -- late_joiner 0; READY the normal ready (lobbyReady), and the next launch hands it off as no late joiner', async () => {
    const r = await lobby({ lobbyView: () => view(TWO, { launched: true }) });
    await yesWaits(r);
    r.commands.gameLobby(view(TWO, { launched: false }));
    await r.settle(SECOND);
    expect([r.valve('late_joiner'), r.valve('mp_major_game_state')]).toEqual([0, 1]);
    go(r, 'PlayerReady');
    r.press('CROSS', 4);
    await r.settle(SECOND);
    expect([r.sent, r.valve('mp_minor_game_state'), r.valve('mp_major_game_state'), r.starts]).toEqual([['lobbyReady'], 2, 1, []]);
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    expect([r.valve('mp_major_game_state'), r.starts.map((s) => s.lateJoiner)]).toEqual([2, [false]]);
  });

  // OT.R122 (the owner's ruling, 2026-11-11; `LATE_SEAT_MATCH_ENDING_OWNER`, an adaptation): a late seat that hears the
  // game end (the room's last roundOver, `matchOver`) while the game is launched has its READY held -- the native READY
  // drawn disabled (`./lobbyRecovery`, as the recovery draws it) with one line in the help line's place -- and READY's late
  // branch starts no load; the room's lobby again lets it go, and READY is then the normal ready.
  it('OT.R122: late, the game\'s end heard -- READY drawn disabled with the line, its late branch starts no load; the room back in its lobby -- READY open, the normal ready (lobbyReady)', async () => {
    const r = await lobby({ lobbyView: () => view(TWO, { launched: true }) });
    await yesWaits(r);
    r.commands.roundOver(true);
    await r.settle(SECOND);
    const parts = r.parts.current!;
    const ready = parts.widgets.specOf('PlayerReady')!;
    expect([r.commands.readyHeld(), parts.widgets.enabled(ready), r.text('DescriptionText')]).toEqual([true, false, [MATCH_ENDING_READY_LINE]]);
    r.commands.ReadyToLoad({ arg: 'NA' } as never, 0 as never, 0 as never);
    await r.settle(SECOND);
    expect([r.valve('mp_major_game_state'), r.starts, r.sent, r.current()]).toEqual([1, [], [], GAME_LOBBY]);
    r.commands.gameLobby(view(TWO, { launched: false }));
    await r.settle(SECOND);
    expect([r.commands.readyHeld(), r.valve('late_joiner'), r.parts.current!.widgets.enabled(r.parts.current!.widgets.specOf('PlayerReady')!)]).toEqual([false, 0, true]);
    go(r, 'PlayerReady');
    r.press('CROSS', 4);
    await r.settle(SECOND);
    expect([r.sent, r.valve('mp_minor_game_state'), r.starts]).toEqual([['lobbyReady'], 2, []]);
  });

  // The review's F3 (OT.R122): the hold's release while another dialog stands (the ARMORY) draws nothing there -- READY is
  // drawn open when the lobby is next shown, with no line.
  it('OT.R122 (the review\'s F3): the ARMORY open during the hold, the room back in its lobby meanwhile -- back in the lobby, READY open with no line', async () => {
    const r = await lobby({ lobbyView: () => view(TWO, { launched: true }) });
    await yesWaits(r);
    r.commands.roundOver(true);
    await r.settle(SECOND);
    expect(r.text('DescriptionText')).toEqual([MATCH_ENDING_READY_LINE]);
    await r.settle(11 * SECOND);                                                   // ArmButtonClock's 10..1
    go(r, 'weaponselect');
    r.press('CROSS', 10);
    await until(r, () => r.current() === ARMORY, 10 * SECOND);
    await r.settle(SETTLED);
    r.commands.gameLobby(view(TWO, { launched: false }));                          // the room's return, the ARMORY up
    await r.settle(SECOND);
    expect([r.commands.readyHeld(), r.current()]).toEqual([false, ARMORY]);
    r.press('TRIANGLE', 6);
    await until(r, () => r.current() === GAME_LOBBY, 10 * SECOND);
    await r.settle(SETTLED);
    const parts = r.parts.current!;
    expect([parts.widgets.enabled(parts.widgets.specOf('PlayerReady')!), r.text('DescriptionText').includes(MATCH_ENDING_READY_LINE)]).toEqual([true, false]);
  });

  it('CREATE GAME (ONL-13) is the entry second caller: CRgame opens dlgCreateGame.rdr; its success (JoinGame, the host world report, the socket) lands in the lobby as its host', async () => {
    const r = await briefing({ lobbyView: (id) => view([seat(id, 'socomc', 'seal', { host: true, readyIn: 30 })]) });
    go(r, 'CRgame');
    r.press('CROSS', 4);
    await until(r, () => r.current() === CREATE_GAME, 10 * SECOND);
    await r.settle(SETTLED);
    expect(r.current()).toBe(CREATE_GAME);
    r.uiVars.set(r.uiVars.add('GAMENAMEVAR', null, 2), { type: 'string', value: 'mine' });
    r.uiVars.set(r.uiVars.add('PLAYLISTVAR', null, 2), { type: 'array', value: [{ type: 'array', value: [{ type: 'int', value: 2 }] }] });
    r.press('SQUARE', 4);
    await until(r, () => r.current() === GAME_LOBBY, 20 * SECOND);
    expect(r.current()).toBe(GAME_LOBBY);
    expect(r.creates.map((q) => q.gameName)).toEqual(['mine$~Alpha']);
    expect(r.joins).toEqual([{ mediusWorldId: 9, joinType: 0, gamePassword: '' }]);
    expect(r.reports.map((q) => [q.mediusWorldId, q.gameName, q.gameLevel, q.genericField1, q.minPlayers])).toEqual([[9, 'mine$~Alpha', 2, 1, 2]]);
    expect(r.socketLog).toEqual(['open 9']);
    await r.settle(SETTLED);
    expect(popupText(r)).toBe(loc(r, 350));                                        // the host's entry: "The READY button will be available in 30 seconds."
  });

  it('the host\'s world report not accepted -- refused, rejected, never answered (HOST_REPORT_WAIT_READING) -- takes create_game\'s failure: JoinGameServer 0, DisconnectFromGameServer, #295; no socket, no lobby', async () => {
    const answers: [string, () => Promise<{ status: number }>, number][] = [
      ['refused', () => Promise.resolve({ status: -966 }), 3 * SECOND],
      ['rejected', () => Promise.reject(new Error('never answered')), 3 * SECOND],
      ['silent', () => new Promise(() => {}), 33 * SECOND],
    ];
    for (const [why, answer, wait] of answers) {
      const r = await briefing({ worldReport: answer });
      go(r, 'CRgame');
      r.press('CROSS', 4);
      await until(r, () => r.current() === CREATE_GAME, 10 * SECOND);
      await r.settle(SETTLED);
      r.uiVars.set(r.uiVars.add('GAMENAMEVAR', null, 2), { type: 'string', value: 'mine' });
      r.uiVars.set(r.uiVars.add('PLAYLISTVAR', null, 2), { type: 'array', value: [{ type: 'array', value: [{ type: 'int', value: 2 }] }] });
      const from = r.outcomes.length;
      r.press('SQUARE', 4);
      const seen = new Set<string>();
      for (let i = 0; i < wait; i++) { await r.settle(1); if (popupText(r) !== '') seen.add(popupText(r)); }
      expect(r.reports.length, why).toBe(1);
      expect(r.calls(CREATE_GAME, from).filter((c) => /JoinGameServer|DisconnectFromGameServer|SWITCHMENU\(dlgGameLobby/.test(c)), why).toEqual(['JoinGameServer(NA) table', 'DisconnectFromGameServer(NA) table']);
      expect([r.builds.includes(GAME_LOBBY), r.socketLog.filter((l) => l.startsWith('open')), r.leaves.length, [...seen].some((t) => t.includes(loc(r, 295)))], why).toEqual([false, [], 1, true]);
    }
  });

  it('ONL-23: R1 runs do_chat -- GetTextInput(CHATTEXT); applied, send_chat\'s SendChatText sends the line on the game socket and draws the seat\'s own at once, "#C\\x80\\x80\\x80name (All): text\\n" (D:L160111)', async () => {
    const r = await lobby({ typed: 'gg all' });
    await r.settle(11 * SECOND);
    const from = r.outcomes.length;
    r.press('TRIGGER_R1' as never, 10);
    await r.settle(4);
    expect(rowCalls(r, GAME_LOBBY, from, /GetTextInput|SendChatText/)).toEqual(['GetTextInput(CHATTEXT) table', 'SendChatText(CHATTEXT) table']);
    expect(r.sent.filter((s) => s.startsWith('chat'))).toEqual(['chat gg all']);
    expect(r.uiVars.find('BCHATLISTVAR')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: '#C\x80\x80\x80socomc (All): gg all\n' }] });
  });

  /**
   * R4P-324 (web research 263 §3a; `CENSOR_HASH_C_READING`): r0004's game line (0x002bc460 -> `Censor` 0x00311fc0, the
   * tail jump at 0x2bc474) has its callback 0x002bc480 build the packet from the FILTERED text (0x2bc544), send it
   * (0x2bc57c) and hand the same packet to the local handler 0x002bc5e0 (0x2bc59c): the wire and the seat's own line
   * both carry `#` + 0xb2 where `#C` was typed. The panel's own colour prefix is the receiver's format, not the text's.
   */
  it('R4P-324: a typed #C on the game line goes out and is echoed rewritten, "#" + 0xb2 (0x2bc544-0x2bc59c); the panel\'s own #C prefix kept', async () => {
    const r = await lobby({ typed: '#Cabc gg #c #B' });
    await r.settle(11 * SECOND);
    r.press('TRIGGER_R1' as never, 10);
    await r.settle(4);
    expect(r.sent.filter((s) => s.startsWith('chat'))).toEqual(['chat #\u00b2abc gg #c #B']);
    expect(r.uiVars.find('BCHATLISTVAR')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: '#C\x80\x80\x80socomc (All): #\u00b2abc gg #c #B\n' }] });
  });

  it('R4P-324: the team form keeps its scope and its own colour prefix; the text in it rewritten', async () => {
    const r = await lobby({ typed: '#Cxyz go' });
    await r.settle(11 * SECOND);
    r.m.valves.set('ChatRecipient', 1, VALVE_TYPE.PERM);
    r.press('TRIGGER_R1' as never, 10);
    await r.settle(4);
    expect(r.sent.filter((s) => s.startsWith('chat'))).toEqual(['chat #\u00b2xyz go (team)']);
    expect(r.uiVars.find('BCHATLISTVAR')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: '#C@\x80@socomc (Team): #\u00b2xyz go\n' }] });
  });

  /**
   * SVC-19 (web research 266 §3.1-§3.2): the keyboard's TEAM/ALL key (`Recip`, `ChatRecipient` S:0x3f26e8) sets the
   * line's scope -- `FUN_002ba870` (D:L160079-160102) reads the valve -- so with it 1 the line goes as the team's and the
   * seat's own line, drawn through the receiver (D:L160111), is the team's form `"#C@\x80@%s (Team): %s\n"`
   * (S:0x3f2700, `FUN_002ba9d0` D:L160184); a relayed team line the same; with it 0, the ALL form as before.
   */
  it('SVC-19: ChatRecipient 1 (TEAM) sends the line as the team\'s and draws it in the (Team) form; a relayed team line the same; 0 keeps ALL', async () => {
    const r = await lobby({ typed: 'flank left' });
    await r.settle(11 * SECOND);
    r.m.valves.set('ChatRecipient', 1, VALVE_TYPE.PERM);
    r.press('TRIGGER_R1' as never, 10);
    await r.settle(4);
    expect(r.sent.filter((s) => s.startsWith('chat'))).toEqual(['chat flank left (team)']);
    r.commands.chatLine({ sender: 1, name: 'host', text: 'on it', team: true });
    r.m.valves.set('ChatRecipient', 0, VALVE_TYPE.PERM);
    r.commands.chatLine({ sender: 1, name: 'host', text: 'gg all' });
    const v = r.uiVars.find('BCHATLISTVAR')!.value;
    expect(v.type === 'array' ? v.value.map((e) => (e.type === 'string' ? e.value : '')) : []).toEqual([
      '#C@\x80@socomc (Team): flank left\n', '#C@\x80@host (Team): on it\n', '#C\x80\x80\x80host (All): gg all\n',
    ]);
  });

  it('ONL-23: the relay\'s lines (the bridge\'s chat, sender and name) drawn as the console\'s receiver draws them; the last 21 kept; an empty one not drawn (D:L160146); L1 / L2 scroll B_CHATLIST', async () => {
    const r = await lobby();
    await r.settle(11 * SECOND);
    for (let i = 1; i <= 22; i++) r.commands.chatLine({ sender: 1, name: 'host', text: `line ${i}` });
    r.commands.chatLine({ sender: 1, name: 'host', text: '' });
    const v = r.uiVars.find('BCHATLISTVAR')!.value;
    const lines = v.type === 'array' ? v.value.map((e) => (e.type === 'string' ? e.value : '')) : [];
    expect([lines.length, lines[0], lines[20]]).toEqual([21, '#C\x80\x80\x80host (All): line 2\n', '#C\x80\x80\x80host (All): line 22\n']);
    await r.settle(2);
    const scroll = (): number => { const c = r.node('B_CHATLIST')!.content; return c?.kind === 'wrapped' ? c.scroll : NaN; };
    const from = r.outcomes.length;
    r.press('TRIGGER_L1' as never, 6);
    const down = scroll();
    r.press('TRIGGER_L2' as never, 6);
    expect([r.calls(GAME_LOBBY, from).filter((c) => /B_CHATLIST/.test(c)), down > 0, scroll()]).toEqual([['B_CHATLIST.op5(NA)', 'B_CHATLIST.op4(NA)'], true, down - 20]);
  });

  it('ONL-23: ConnectToGameServer empties the panel (FUN_0027e4c0 D:L126462 -> FUN_002a76d0 D:L149534-149538: BCHATLISTVAR an empty array)', async () => {
    const r = await briefing();
    r.uiVars.set(r.uiVars.add('BCHATLISTVAR', null, 2), { type: 'array', value: [{ type: 'string', value: 'old\n' }] });
    joinListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    expect(r.uiVars.find('BCHATLISTVAR')!.value).toEqual({ type: 'array', value: [] });
  });

  // ONL-16, the chat half (web research 266 §2): the game lobby's own rules over ONL-23's keyboard and panel.
  const panel = (r: Rig): string[] => { const v = r.uiVars.find('BCHATLISTVAR')?.value; return v?.type === 'array' ? v.value.map((e) => (e.type === 'string' ? e.value : '?')) : []; };
  const line = (name: string, text: string): string => `#C\x80\x80\x80${name} (All): ${text}\n`;

  it('ONL-16: a late joiner cannot chat -- SetupLateJoiner writes #351 over the panel\'s caption; R1 runs do_chat\'s late_joiner branch, #360 for 5 s, no keyboard, nothing sent; the relay\'s lines still drawn (FUN_002ba9d0)', async () => {
    const r = await lobby({ lobbyView: () => view(TWO, { launched: true }), typed: 'let me play' });
    expect([r.valve('late_joiner'), r.text('ChatText')]).toEqual([1, [loc(r, 351)]]);   // "Chat disabled for late joiners"
    if (r.shown()) r.press('CROSS', 10);                                             // #353 answered: the ghost's wait
    await r.settle(SECOND);
    const from = r.outcomes.length;
    r.press('TRIGGER_R1' as never, 10);
    await r.settle(5);
    expect(popupText(r)).toBe(loc(r, 360));                                          // "Sorry, no chat for late joiners."
    await r.settle(4 * SECOND);
    expect(popupText(r)).toBe(loc(r, 360));                                          // WAIT 5: still up at 4 s
    await r.settle(2 * SECOND);
    expect([r.shown(), rowCalls(r, GAME_LOBBY, from, /GetTextInput|SendChatText|POPUPDIALOG|KILLPOPUP/)]).toEqual([false, ['POPUPDIALOG(NA) table', 'KILLPOPUP(NA) table']]);
    expect([r.sent.filter((s) => s.startsWith('chat')), panel(r)]).toEqual([[], []]);
    r.commands.chatLine({ sender: 1, name: 'host', text: 'hi ghost' });               // the receiver has no late joiner test
    expect(panel(r)).toEqual([line('host', 'hi ghost')]);
  });

  it('ONL-16: the panel keeps its lines across SWITCH TEAMS and the ARMORY\'s open and close (BCHATLISTVAR PERMANENT, D:L149534; emptied only by FUN_002a9f00\'s callers), a line received in the ARMORY among them', async () => {
    const r = await lobby();
    await r.settle(11 * SECOND);
    r.commands.chatLine({ sender: 1, name: 'host', text: 'before' });
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams']);
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, team: 'seal' }]));
    await r.settle(6 * SECOND);
    expect([r.valve('player_team'), panel(r)]).toEqual([0, [line('host', 'before')]]);
    go(r, 'weaponselect');
    r.press('CROSS', 10);
    await until(r, () => r.current() === ARMORY, 10 * SECOND);
    expect(r.current()).toBe(ARMORY);
    await r.settle(SETTLED);
    r.commands.chatLine({ sender: 1, name: 'host', text: 'while armed' });
    r.press('TRIANGLE', 6);
    await until(r, () => r.current() === GAME_LOBBY, 10 * SECOND);
    await r.settle(SETTLED);
    expect([r.current(), panel(r)]).toEqual([GAME_LOBBY, [line('host', 'before'), line('host', 'while armed')]]);
  });

  it('ONL-16: the panel at the launch is carried, not cleared -- SWITCHMENU(LOAD_SCREEN), the state change\'s clear of temporary vars and the match\'s return keep BCHATLISTVAR (PERMANENT)', async () => {
    const r = await lobby();
    r.commands.chatLine({ sender: 1, name: 'host', text: 'gl hf' });
    const from = r.outcomes.length;
    r.commands.gameLobby(view(TWO, { launched: true }));
    await r.settle(SECOND);
    expect([r.starts.length, rowCalls(r, GAME_LOBBY, from, /SWITCHMENU/), panel(r)]).toEqual([1, ['SWITCHMENU(LOAD_SCREEN) table'], [line('host', 'gl hf')]]);
    r.uiVars.clearTemporary();                                                       // the load state's FUN_00385c30: longevity 1 freed, BCHATLISTVAR (2) kept
    expect(panel(r)).toEqual([line('host', 'gl hf')]);
    r.commands.matchReturned();
    expect(panel(r)).toEqual([line('host', 'gl hf')]);                              // the next game's ConnectToGameServer empties it (ONL-23's test)
  });

  it('ONL-16b: CIRCLE\'s three animations run as the disc binds them -- FALLING VCButton(1T), DOWN the icon from can_talk, RISING VCButton(0T) and ChatIconReset; the bar from CheckForcedLaunch', async () => {
    const port = { on: [] as boolean[], rec: false, floor: null as number | null };
    const r = await lobby({ voice: { button: (on) => { port.on.push(on); }, recording: () => port.rec, holder: () => port.floor } });
    await r.settle(11 * SECOND);
    const icon = (): boolean[] => [r.node('talk')!.visible, r.node('notalk')!.visible];
    const bar = (): unknown => r.uiVars.find('PLAYERTACOVAR')?.value;
    // Idle: A_54's box (the no-talk icon) and its empty bar -- a single space, which TalkerName draws as no line.
    expect([icon(), r.node('InfoTextCT')!.visible, bar(), r.text('TalkerName'), r.valve('can_talk')]).toEqual([[false, true], true, { type: 'string', value: ' ' }, [], 0]);
    port.floor = 1;                                                                  // the host talks
    await r.settle(2 * SECOND);
    expect(r.text('TalkerName')).toEqual(['host']);
    const from = r.outcomes.length;
    r.hold('CIRCLE');
    await r.settle(2 * SECOND);                                                      // pressed on a busy floor: no talk
    expect([port.on, icon()]).toEqual([[true], [false, true]]);
    port.rec = true; port.floor = 2;                                                 // the floor is this page's: recording
    await r.settle(2 * SECOND);
    expect([icon(), r.text('TalkerName'), r.valve('can_talk')]).toEqual([[true, false], [], 1]);
    r.hold(null);
    await r.settle(1);
    expect([port.on, icon()]).toEqual([[true, false], [false, true]]);               // ChatIconReset on the release
    expect(rowCalls(r, GAME_LOBBY, from, /VCButton/)).toEqual(['VCButton(1T) table', 'VCButton(0T) table']);
  });

  it('VOICE-LATE: the port\'s notice (the page\'s suspended mark, a browser adaptation) takes the bar in the talker\'s place; the holder back once it clears', async () => {
    const port = { floor: 1 as number | null, notice: null as string | null };
    const r = await lobby({ voice: { button: () => undefined, recording: () => false, holder: () => port.floor, notice: () => port.notice } });
    await r.settle(11 * SECOND);
    expect(r.text('TalkerName')).toEqual(['host']);
    port.notice = 'VOICE PAUSED';
    await r.settle(2 * SECOND);
    expect(r.uiVars.find('PLAYERTACOVAR')?.value).toEqual({ type: 'string', value: 'VOICE PAUSED' });
    port.notice = null;
    await r.settle(2 * SECOND);
    expect(r.text('TalkerName')).toEqual(['host']);
  });

  it('ONL-16b: a late joiner -- SetupLateJoiner hides InfoTextCT ("CIRCLE VOICE CHAT ALL"); VCButton is inert and the bar is not written', async () => {
    const port = { on: [] as boolean[] };
    const r = await lobby({ lobbyView: () => view(TWO, { launched: true }), voice: { button: (on) => { port.on.push(on); }, recording: () => false, holder: () => 1 } });
    await r.settle(11 * SECOND);
    expect([r.valve('late_joiner'), r.node('InfoTextCT')!.visible]).toEqual([1, false]);
    if (r.shown()) r.press('CROSS', 10);                                             // #353 put away
    const from = r.outcomes.length;
    r.hold('CIRCLE');
    await r.settle(SECOND);
    r.hold(null);
    await r.settle(1);
    expect(rowCalls(r, GAME_LOBBY, from, /VCButton/)).toEqual(['VCButton(1T) table', 'VCButton(0T) table']);   // the scripts ran
    expect([port.on, r.uiVars.find('PLAYERTACOVAR')?.value, r.valve('can_talk')]).toEqual([[], { type: 'none' }, 0]);   // never written
  });

  it('the ARMORY (ONL-17): weaponselect\'s CROSS runs goto_eq_mp_set_return_valve -- InitializeOnlineArmory (the records asked), SWITCHMENU(dlg_equipment_mp.rdr); TRIANGLE (returnto_lobby) comes back to the same seat, not READY, the button live', async () => {
    const loads: number[] = [];
    const r = await lobby({ loadouts: { load: () => { loads.push(1); return Promise.resolve([]); }, save: () => Promise.resolve() } });
    await r.settle(11 * SECOND);                                                   // ArmButtonClock's 10..1
    go(r, 'weaponselect');
    const from = r.outcomes.length;
    r.press('CROSS', 10);
    await until(r, () => r.current() === ARMORY, 10 * SECOND);
    expect(r.current()).toBe(ARMORY);
    expect(rowCalls(r, GAME_LOBBY, from, /InitializeOnlineArmory|SWITCHMENU/)).toEqual(['InitializeOnlineArmory(NA) table', 'SWITCHMENU(INPUT_STRING) table']);
    expect([r.valve('GoneToArmory'), r.valve('ComeFromBriefing'), loads.length]).toEqual([1, 1, 1]);
    await r.settle(SETTLED);
    const back = r.outcomes.length;
    r.press('TRIANGLE', 6);
    await until(r, () => r.current() === GAME_LOBBY, 10 * SECOND);
    expect(r.current()).toBe(GAME_LOBBY);
    expect(rowCalls(r, ARMORY, back, /SWITCHMENU/)).toEqual(['SWITCHMENU(dlgGameLobby.rdr) table']);
    await r.settle(SETTLED);
    // The seat as it was: the socket open, no leave, not READY; check_loop skipped AdvanceMPMission once (GoneToArmory)
    // and Enable_SM_Launch gave the button back with no second ArmButtonClock (ComeFromBriefing 1, TakenBack 0).
    expect([r.socketLog, r.leaves, r.valve('mp_minor_game_state'), r.valve('GoneToArmory')]).toEqual([['open 7'], [], 1, 0]);
    expect(rowCalls(r, GAME_LOBBY, back, /AdvanceMPMission|DisconnectFromGameServer/)).toEqual([]);
    expect(r.focused()).toBe('weaponselect');
  });

  it('the ARMORY is forbidden while READY: goto_eq_mp_set_return_valve\'s second sequence FAILs on mp_minor_game_state 2 (and outside the lobby\'s major state 1)', async () => {
    const r = await lobby();
    await r.settle(11 * SECOND);
    go(r, 'weaponselect');
    for (const [name, value] of [['mp_minor_game_state', 2], ['mp_major_game_state', 0]] as const) {
      const was = r.valve(name)!;
      r.m.valves.acquire(name, VALVE_TYPE.PERM);
      r.m.valves.set(name, value, VALVE_TYPE.PERM);
      const from = r.outcomes.length;
      r.press('CROSS', 10);
      await r.settle(SECOND);
      expect([name, rowCalls(r, GAME_LOBBY, from, /InitializeOnlineArmory|SWITCHMENU/), r.current()]).toEqual([name, [], GAME_LOBBY]);
      r.m.valves.set(name, was, VALVE_TYPE.PERM);
    }
  });

  it('the pull-out (R95.7): in the ARMORY a launch count\'s first tick opens #47, and 5 s later the lobby', async () => {
    const r = await lobby();
    await r.settle(11 * SECOND);
    go(r, 'weaponselect');
    r.press('CROSS', 10);
    await until(r, () => r.current() === ARMORY, 10 * SECOND);
    await r.settle(SETTLED);
    r.commands.gameLobby(view(TWO, { countdown: 10 }));
    await r.settle(2 * SECOND);
    expect(popupText(r)).toBe(loc(r, 47));
    await until(r, () => r.current() === GAME_LOBBY, 10 * SECOND);
    expect([r.current(), r.socketLog]).toEqual([GAME_LOBBY, ['open 7']]);
  });

  it('the lobby\'s FromBriefing reads the stored record (CharacterProfile 2 then 0): MpCharSet and the five indices from the account\'s records for the game\'s mission and side', async () => {
    const r = await briefing({ loadouts: { load: () => Promise.resolve([{ mission: 'MP2', seal: null, terrorist: { charSet: 6, items: [8, 81, 36, 37, 0], valid: true } }]), save: () => Promise.resolve() } });
    r.profiles().load();
    await r.settle(2);
    joinListed(r);
    await until(r, () => r.current() === GAME_LOBBY);
    await r.settle(SETTLED);
    expect(r.valve('player_team')).toBe(8);
    expect(['MpCharSet', 'primsel', 'secsel', 'equip1sel', 'equip2sel', 'equip3sel'].map((n) => r.valve(n))).toEqual([6, 8, 81, 36, 37, 0]);
  });

  /**
   * WM-51 task 3 (WM.R21, the owner's team swap queue -- a DEPARTURE from the original on his word; research 432): the
   * mark (`SWAP_MARK_ADAPTATION`, `../../src/screens/swapMark`) drawn only from the server's `queued` seat field, and the
   * SWITCH TEAMS button's page behaviour. The original has no queue and no mark (research 432 §1): its rows are the disc's
   * [name, medal, ready dot, clan tag] (`FUN_002f7020` D:L196331-196496) -- a row with no ask keeps exactly those four
   * cells; `MARK` the mark (`arrow_top.tif` over `arrow_botm.tif`, the ladder screens' `arrow_up` / `arrow_dwn`, P:L11897-11898).
   */
  const MARK = 'arrow_top.tif arrow_botm.tif';
  const marked = (o: GameLobbyRigOptions = {}): Promise<Rig> => lobby({ ...o, dialogs: (lookup) => withSwapMark(lookup) });

  it('WM.R21 (SWAP_MARK_ADAPTATION): the mark from the server\'s `queued` -- own and others\', both sides -- in the ready dot\'s cell, the dot not drawn; a 30-character name and a clan tag clear of it', async () => {
    const r = await marked();
    const long = 'A'.repeat(30);
    r.commands.gameLobby(view([
      seat(1, 'host', 'seal', { host: true }), seat(3, long, 'seal', { queued: true }),
      seat(2, 'socomc', 'terrorist', { queued: true }), seat(4, 'bravo', 'terrorist', { ready: true }), seat(-5, 'CPU 1', 'terrorist', { bot: true }),
    ]));
    r.commands.seatClans(new Map([[3, 'TAG']]));
    await r.settle(2);
    expect([items(r, 'B_SEALLIST'), items(r, 'B_REDLIST')]).toEqual([
      [`host | null.tif ping_dot_red.tif`, `${long.slice(0, 14)} [TAG] | null.tif null.tif ${MARK}`]   /* LOBBY_NAME_CUT_14_ADAPTATION: the list draws 14 */,
      [`socomc | null.tif null.tif ${MARK}`, `bravo | null.tif ping_dot_green.tif`, `CPU 1 BOT | null.tif ping_dot_red.tif`],
    ]);
    // Where it is drawn: each arrow's OWN texels (SWAP_MARK_ARROW_TEXELS, not the 16 x 16's transparent margin) on
    // the ruled w x h, centred on the dot's cell, the two stacked about the dot's middle, clear of the clan tag and the name:
    // the quad is the texture scaled so its arrow spans w x h (16 x 12 / 10, 16 x 8 / 6 -> 19 x 21), moved up and left by
    // the margin before the arrow (3 x 19 / 16, 5 x 21 / 16 -> 4, 7).
    const [w, h] = SWAP_MARK_ARROW_SIZE_ADAPTATION;
    const [tw, th] = SWAP_MARK_TEXTURE_SIZE;
    const [ax, ay, aw, ah] = SWAP_MARK_ARROW_TEXELS;
    const qw = Math.round(tw * w / aw), qh = Math.round(th * h / ah);
    const dx = Math.round(ax * qw / tw), dy = Math.round(ay * qh / th);
    expect([qw, qh, dx, dy]).toEqual([19, 21, 4, 7]);
    for (const [list, row] of [['B_SEALLIST', 1], ['B_REDLIST', 0]] as const) {
      const l = r.parts.current!.widgets.get(list) as ListboxWidget;
      const dot = l.spec.columns[2]!;
      const cell = (c: number) => l.placed.cells.find((x) => x.item === row && x.column === c)!;
      expect([l.spec.columns.length, l.spec.columns[4]!.size, l.spec.columns[5]!.size]).toEqual([6, [qw, qh], [qw, qh]]);
      const x = cell(2).x - Math.trunc((w - dot.size[0]) / 2);                // the arrow's own left edge
      expect([cell(4).kind, cell(5).kind, cell(4).x + dx, cell(5).x + dx]).toEqual(['image', 'image', x, x]);
      const middle = cell(2).y + Math.trunc(dot.size[1] / 2);
      expect([cell(4).y + dy + h, cell(5).y + dy]).toEqual([middle, middle]);
      expect(x + w).toBeLessThan(cell(3).x);
      expect(x + w).toBeLessThan(cell(0).x);
    }
  });

  it('WM.R21: no mark from a view without the field (an older server); a dialog without the mark\'s columns draws a queued seat\'s dot as today', async () => {
    const r = await marked();
    r.commands.gameLobby(view(TWO, { refused: 'sides' }));
    await r.settle(2);
    expect([items(r, 'B_SEALLIST'), items(r, 'B_REDLIST')]).toEqual([[`host | null.tif ping_dot_red.tif`], [`socomc | null.tif ping_dot_red.tif`]]);
    const plain = await lobby();
    plain.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, queued: true }]));
    await plain.settle(2);
    expect(items(plain, 'B_REDLIST')).toEqual(['socomc | null.tif ping_dot_red.tif']);
  });

  it('WM.R21: the queuing and the cancelling answers (`queued`, `unqueued`) end the switch\'s wait as any refusal -- a fresh lobby after its 5 s', async () => {
    const r = await marked();
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, queued: true }], { refused: 'queued' }));
    await r.settle(2);
    expect(items(r, 'B_REDLIST')).toEqual([`socomc | null.tif null.tif ${MARK}`]);
    await r.settle(7 * SECOND);
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view(TWO, { refused: 'unqueued' }));
    await r.settle(2);
    expect(items(r, 'B_REDLIST')).toEqual([`socomc | null.tif ping_dot_red.tif`]);
    await r.settle(7 * SECOND);
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    expect(r.sent).toEqual(['switchTeams', 'switchTeams', 'switchTeams']);
    expect([r.valve('player_team'), r.valve('MpCharSet')]).toEqual([8, 5]);
  });

  it('WM.R21: back from a match (OT.R129) the queuing and the cancelling answers each pass switch_teams_anim\'s WAIT at once -- READY, SWITCH TEAMS and the ARMORY open', async () => {
    const r = await returnedLobby();
    const sent = r.sent.length;
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view([RETURNED[0]!, { ...RETURNED[1]!, queued: true }], { refused: 'queued' }));
    await r.settle(SECOND);
    expect(bits(r)).toEqual([true, true, true]);
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view(RETURNED, { refused: 'unqueued' }));
    await r.settle(SECOND);
    expect(bits(r)).toEqual([true, true, true]);
    expect(r.sent.slice(sent)).toEqual(['switchTeams', 'switchTeams']);
    expect([r.valve('player_team'), r.valve('MpCharSet')]).toEqual([8, 5]);
  });

  it('WM.R21: a queued move that lands later (switch_teams_anim long ended) runs its end -- the kit re-armed for the new side (P:L7603-7628) -- with no second switchTeams and no SwitchSides; a fresh lobby', async () => {
    const r = await marked();
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, queued: true }], { refused: 'queued' }));
    await r.settle(7 * SECOND);                                                    // its WAIT 5 run out: the end armed the TERRORIST kit
    expect([r.valve('player_team'), r.valve('MpCharSet')]).toEqual([8, 5]);
    const from = r.outcomes.length;
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, team: 'seal' }]));           // a Terrorist left: the queued move lands, the ask ended
    await r.settle(SECOND);
    expect([r.valve('player_team'), r.valve('MpCharSet'), r.valve('UiCharSet')]).toEqual([0, 1, 15]);   // the SEAL default type
    expect(rowCalls(r, GAME_LOBBY, from, /ChangeCharacterType\(/).at(-1)).toMatch(/^ChangeCharacterType\(1\) /);
    expect(rowCalls(r, GAME_LOBBY, from, /SwitchSides/)).toEqual([]);
    expect(r.sent).toEqual(['switchTeams']);
    expect(items(r, 'B_SEALLIST')).toEqual([`host | null.tif ping_dot_red.tif`, `socomc | null.tif ping_dot_red.tif`]);
  });

  it('WM.R21: back from a match, a queued move that lands later re-arms the new side\'s kit with no second switchTeams; the controls stay open', async () => {
    const r = await returnedLobby();
    const sent = r.sent.length;
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view([RETURNED[0]!, { ...RETURNED[1]!, queued: true }], { refused: 'queued' }));
    await r.settle(SECOND);
    expect([r.valve('player_team'), r.valve('MpCharSet')]).toEqual([8, 5]);
    r.commands.gameLobby(view([RETURNED[0]!, { ...RETURNED[1]!, team: 'seal' }]));
    await r.settle(SECOND);
    expect([r.valve('player_team'), r.valve('MpCharSet'), r.valve('UiCharSet')]).toEqual([0, 1, 15]);
    expect(r.sent.slice(sent)).toEqual(['switchTeams']);
    expect(bits(r)).toEqual([true, true, true]);
  });

  it('WM.R21: a trade inside the queuing press\'s own 5 s -- switch_teams_anim\'s own end arms the new side once, nothing more started', async () => {
    const r = await marked();
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    const from = r.outcomes.length;
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, queued: true }], { refused: 'queued' }));
    await r.settle(SECOND);
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, team: 'seal' }]));           // a queued SEAL pressed: the trade
    await r.settle(6 * SECOND);
    expect([r.valve('player_team'), r.valve('MpCharSet')]).toEqual([0, 1]);
    // ONE switch end: its own ChangeCharacterType(1) (P:L7613) and its CALL FromBriefing's (P:L7576: no record, IDFromBriefing 0) -- a second end would make four
    expect(rowCalls(r, GAME_LOBBY, from, /ChangeCharacterType\(/)).toEqual(['ChangeCharacterType(1) not implemented: PLAT-34', 'ChangeCharacterType(1) not implemented: PLAT-34']);
    expect(r.sent).toEqual(['switchTeams']);
  });

  it("the fold's finding 1: a queued move landing with the countdown's first view -- SWITCH TEAMS stays closed, the old kit kept; the countdown called off, the switch's end runs", async () => {
    const r = await marked();
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, queued: true }], { refused: 'queued' }));
    await r.settle(7 * SECOND);
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, team: 'seal' }], { countdown: 11 }));
    await r.settle(2 * SECOND);
    expect([bits(r)[1], r.valve('MpCharSet')]).toEqual([false, 5]);
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, team: 'seal' }]));           // the call-off
    await r.settle(SECOND);
    expect([r.valve('player_team'), r.valve('MpCharSet'), r.valve('UiCharSet')]).toEqual([0, 1, 15]);
    expect(r.sent).toEqual(['switchTeams']);
  });

  it('WM.R21: an older server (`sides`, no field) -- no mark, no queued belief: a later side change runs no switch end', async () => {
    const r = await marked();
    go(r, 'Glswitchteams');
    r.press('CROSS', 4);
    r.commands.gameLobby(view(TWO, { refused: 'sides' }));
    await r.settle(7 * SECOND);
    expect(items(r, 'B_REDLIST')).toEqual([`socomc | null.tif ping_dot_red.tif`]);
    const from = r.outcomes.length;
    r.commands.gameLobby(view([TWO[0]!, { ...TWO[1]!, team: 'seal' }]));
    await r.settle(SECOND);
    expect(rowCalls(r, GAME_LOBBY, from, /ChangeCharacterType\(|CharacterProfile\(/)).toEqual([]);
    expect([r.valve('player_team'), r.valve('MpCharSet')]).toEqual([0, 5]);
  });
});

/**
 * WM-51 task 3 (WM.R21) off the machine (no disc): the page's own choices on a `gameLobby` view, with the seat's
 * `queued` field. R4B-08's "Team Switch Error!" (research 379 §3; `TEAM_SWITCH_ERROR_DIALOG`) is r0004's for a SWITCH
 * TEAMS move landing on the in-lobby ARMORY; under WM.R21 a queued player's OWN queued move landing there later is not
 * shown it, every other case as research 379 §3 has it. Synthetic seats; names invented.
 */
describe('WM.R21: the page on a queued seat\'s views (no disc)', () => {
  const listed: GameListEntry = { ...GAME, gameStats: statsHex({ 8: 2 }) };
  function page(recover?: (s: LobbyControlRecovery) => boolean) {
    const valves = new ValveStore();
    valves.acquire('player_team', VALVE_TYPE.PERM);
    const events: [number, string | null][] = [];
    const sent: string[] = [];
    let dialog: string | null = GAME_LOBBY;
    const uiVars = new UiVarManager();
    const c = new GameLobbyCommands({
      uiVars, valves: () => valves, games: () => [], dialog: () => dialog,
      socket: { open: () => true, send: (t) => { sent.push(t); }, close: () => undefined },
      event: (kind, text) => { events.push([kind, text]); },
      ...(recover ? { recoverLobby: recover } : {}),
    });
    c.enterGameLobby(listed);
    c.welcomed(2);
    const at = (team: 'seal' | 'terrorist', queued = false): GameLobbyView => ({
      seats: [{ id: 2, name: 'Me', team, ready: false, host: false, readyIn: 0, ...(queued ? { queued: true } : {}) }, { id: 3, name: 'Other', team: 'seal', ready: false, host: true, readyIn: 0 }],
      countdown: null, launched: false,
    });
    return { c, uiVars, valves, events, sent, at, on: (d: string | null) => { dialog = d; } };
  }
  const ERROR = DIALOG_EVENTS.MP_MEDIUS_ERROR!;

  it('the fold\'s finding 1: a late re-arm is not asked while the launch countdown runs (CountDown\'s lock); the countdown called off, it is', () => {
    const asked: LobbyControlRecovery[] = [];
    const p = page((s) => { asked.push(s); return true; });
    p.c.gameLobby(p.at('terrorist', true));
    p.c.gameLobby({ ...p.at('seal'), countdown: 11 });                            // the move and the 80% countdown together
    p.c.gameLobby({ ...p.at('seal'), countdown: 10 });
    expect(asked.filter((s) => s.late)).toEqual([]);
    p.c.gameLobby(p.at('seal'));                                                   // called off: the view schedules the reset
    expect(asked.filter((s) => s.late)).toEqual([]);                              // not before the reset (the re-check's A)
    p.c.CheckForcedLaunch({ arg: '' } as never, undefined as never, undefined);                                   // the lobby's frame: the reset, then the end
    const late = asked.findIndex((s) => s.late), reset = asked.findIndex((s) => s.reset);
    expect([asked.filter((s) => s.late).length, reset >= 0 && reset < late]).toEqual([1, true]);
  });

  it('the fold\'s finding 2: at the launch a late re-arm that cannot run (another dialog built) writes the new side\'s default type, as the end\'s no-record branch does (P:L7610-7618)', () => {
    const p = page(() => false);
    for (const [n, v] of [['MpCharSet', 5], ['UiCharSet', 240]] as const) { p.valves.acquire(n, VALVE_TYPE.PERM); p.valves.set(n, v, VALVE_TYPE.PERM); }
    p.c.gameLobby(p.at('terrorist', true));
    p.c.gameLobby(p.at('seal'));                                                   // moved; the end owed, the recovery refusing
    expect([p.valves.find('MpCharSet')!.value, p.valves.find('UiCharSet')!.value]).toEqual([5, 240]);
    p.c.gameLobby({ ...p.at('seal'), launched: true });
    expect([p.valves.find('player_team')!.value, p.valves.find('MpCharSet')!.value, p.valves.find('UiCharSet')!.value]).toEqual([0, 1, 15]);
  });

  it('the fold\'s finding 2: with no late re-arm owed the launch writes no character type', () => {
    const p = page(() => false);
    for (const [n, v] of [['MpCharSet', 6], ['UiCharSet', 32]] as const) { p.valves.acquire(n, VALVE_TYPE.PERM); p.valves.set(n, v, VALVE_TYPE.PERM); }
    p.c.gameLobby(p.at('terrorist'));
    p.c.gameLobby({ ...p.at('terrorist'), launched: true });
    expect([p.valves.find('MpCharSet')!.value, p.valves.find('UiCharSet')!.value]).toEqual([6, 32]);
  });

  it('note 6: an old page traded cleanly -- views without the field, the own side changed with no press: today\'s behaviour (no error on the lobby, no switch end asked, nothing sent)', () => {
    const asked: LobbyControlRecovery[] = [];
    const p = page((s) => { asked.push(s); return true; });
    p.c.gameLobby(p.at('terrorist'));
    p.c.gameLobby(p.at('seal'));
    expect([p.events, asked.filter((s) => s.late), p.sent, p.valves.find('player_team')!.value]).toEqual([[], [], [], 0]);
  });

  it('on the ARMORY: its OWN queued move landing is not shown "Team Switch Error!"; a move with no ask in the last view still is', () => {
    const p = page();
    p.c.gameLobby(p.at('terrorist', true));
    p.on(TEAM_SWITCH_ERROR_DIALOG);
    p.c.gameLobby(p.at('seal'));
    expect(p.events).toEqual([]);
    p.c.gameLobby(p.at('terrorist'));                                              // no ask standing: the original's case
    expect(p.events).toEqual([[ERROR, TEAM_SWITCH_ERROR_TEXT]]);
  });

  it('on the ARMORY: an ask cancelled (the last view without the field) and then a move -- the error as research 379 §3 has it', () => {
    const p = page();
    p.c.gameLobby(p.at('terrorist', true));
    p.c.gameLobby(p.at('terrorist'));
    p.on(TEAM_SWITCH_ERROR_DIALOG);
    p.c.gameLobby(p.at('seal'));
    expect(p.events).toEqual([[ERROR, TEAM_SWITCH_ERROR_TEXT]]);
  });

  it('a queued move landing asks the page\'s recovery for the switch\'s end (`rearm` with `late`) and sends nothing; no ask, no move or the first view asks none', () => {
    const asked: LobbyControlRecovery[] = [];
    const p = page((s) => { asked.push(s); return true; });
    p.c.gameLobby(p.at('terrorist', true));                                        // the first view: no move
    p.c.gameLobby(p.at('terrorist', true));                                        // no move
    expect(asked.filter((s) => s.late)).toEqual([]);
    p.c.gameLobby(p.at('seal'));
    expect(asked.filter((s) => s.late)).toEqual([{ reset: false, restartEntryTimers: false, host: false, rearm: true, late: true }]);
    p.c.gameLobby(p.at('terrorist'));                                              // a move with no ask: none asked
    expect(asked.filter((s) => s.late)).toHaveLength(1);
    expect(p.sent).toEqual([]);
  });

  it('the switch\'s end owed is asked again while the recovery cannot run it (another dialog built), then once', () => {
    let can = false;
    const asked: LobbyControlRecovery[] = [];
    const p = page((s) => { asked.push(s); return can; });
    p.c.gameLobby(p.at('terrorist', true));
    p.c.gameLobby(p.at('seal'));
    p.c.gameLobby(p.at('seal'));
    can = true;
    p.c.gameLobby(p.at('seal'));
    p.c.gameLobby(p.at('seal'));
    expect(asked.filter((s) => s.late)).toHaveLength(3);
  });

  it('the mark\'s cells: drawn from the field only -- the dot column shifted past the disc\'s three textures, the two arrow cells 1; a row with no ask keeps the disc\'s four', () => {
    const p = page();
    p.c.gameLobby({ ...p.at('terrorist', true), refused: 'queued' });
    const rows = (name: string) => p.uiVars.find(name)!.value;
    expect(rows('BTERRLISTVAR')).toEqual({ type: 'array', value: [{ type: 'array', value: [
      { type: 'string', value: 'Me' }, { type: 'int', value: 0 }, { type: 'int', value: 1 + SWAP_MARK_DOT_SHIFT },
      { type: 'array', value: [{ type: 'string', value: 'VALUE' }, { type: 'string', value: '' }, { type: 'string', value: 'COLOR' }, expect.anything()] },
      { type: 'int', value: 1 }, { type: 'int', value: 1 },
    ] }] });
    p.c.gameLobby({ ...p.at('terrorist'), refused: 'queued' });                     // `refused` alone is no mark: the field decides
    expect((rows('BTERRLISTVAR') as unknown as { value: { value: unknown[] }[] }).value[0]!.value.slice(2)).toEqual([
      { type: 'int', value: 1 }, expect.anything(),                                // the disc's four cells, no more
    ]);
  });
});

/** STREAMER-P1 slice 2 (a browser adaptation, `../../src/text/chatFilter`): the game lobby's relayed lines under the page's filter. */
describe.skipIf(!HAVE)(`STREAMER-P1: the game lobby's relayed lines under the page's chat filter${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  const lines = (r: { uiVars: { find(n: string): { value: { type: string; value?: unknown } } | undefined } }): string[] => {
    const v = r.uiVars.find('BCHATLISTVAR')?.value as { type: string; value: { type: string; value: string }[] } | undefined;
    return v?.type === 'array' ? v.value.map((e) => (e.type === 'string' ? e.value : '')) : [];
  };
  it('a refused sender not drawn, one count line rewritten in place; a friend drawn; unset as before', async () => {
    setChatFilter((place, s) => place === 'lobby' && s.name === 'pal');
    try {
      const r = await lobby();
      await r.settle(11 * SECOND);
      r.commands.chatLine({ sender: 1, name: 'host', text: 'slur' });
      r.commands.chatLine({ sender: 2, name: 'pal', text: 'hi' });
      r.commands.chatLine({ sender: 1, name: 'host', text: 'more' });
      expect(lines(r as never)).toEqual([`#C\x80\x80\x80${chatHiddenWords(2)}\n`, '#C\x80\x80\x80pal (All): hi\n']);
      r.commands.welcomed(7);
      r.commands.chatLine({ sender: 7, name: 'socomc', text: 'mine' });                // the seat's own: never asked
      expect(lines(r as never).at(-1)).toBe('#C\x80\x80\x80socomc (All): mine\n');
      r.commands.seatEnded(null);                                                     // no seat (the review's F4): the own line is sent as -1
      r.commands.chatLine({ sender: -1, name: '', text: 'early' });
      expect(lines(r as never).at(-1)).toBe('#C\x80\x80\x80Unknown (All): early\n');
      setChatFilter(null);
      r.commands.chatLine({ sender: 1, name: 'host', text: 'back' });
      expect(lines(r as never).at(-1)).toBe('#C\x80\x80\x80host (All): back\n');
    } finally { setChatFilter(null); }
  });
});

/** IQ-183 (a browser adaptation, `../../src/text/ownNameDisplay`): the own seat's name in the lists and the own chat line. */
describe.skipIf(!HAVE)(`IQ-183: the game lobby draws the own seat’s name by the page’s own-name rule${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  const lines = (r: { uiVars: { find(n: string): { value: { type: string; value?: unknown } } | undefined } }): string[] => {
    const v = r.uiVars.find('BCHATLISTVAR')?.value as { type: string; value: { type: string; value: string }[] } | undefined;
    return v?.type === 'array' ? v.value.map((e) => (e.type === 'string' ? e.value : '')) : [];
  };
  const names = (r: { uiVars: { find(n: string): { value: { type: string; value?: unknown } } | undefined } }, list: string): string[] => {
    const v = r.uiVars.find(list)?.value as { type: string; value: { type: string; value: { type: string; value: unknown }[] }[] } | undefined;
    return v?.type === 'array' ? v.value.map((row) => String(row.value[0]!.value)) : [];
  };
  it('set: the own seat reads the rule’s text in its side’s list and on its own chat line; others unchanged; unset as before', async () => {
    setOwnNameDisplay(() => 'YOU');
    try {
      const r = await lobby();
      await r.settle(11 * SECOND);
      r.commands.gameLobby({ seats: [seat(1, 'host', 'seal', { host: true }), seat(2, 'socomc', 'terrorist')], countdown: null, launched: false });
      expect([names(r as never, 'BSEALLISTVAR'), names(r as never, 'BTERRLISTVAR')]).toEqual([['host'], ['YOU']]);
      r.commands.chatLine({ sender: 2, name: 'socomc', text: 'mine' });
      r.commands.chatLine({ sender: 1, name: 'host', text: 'hi' });
      expect(lines(r as never).slice(-2)).toEqual(['#C\x80\x80\x80YOU (All): mine\n', '#C\x80\x80\x80host (All): hi\n']);
      setOwnNameDisplay(null);
      r.commands.gameLobby({ seats: [seat(1, 'host', 'seal', { host: true }), seat(2, 'socomc', 'terrorist')], countdown: null, launched: false });
      expect(names(r as never, 'BTERRLISTVAR')).toEqual(['socomc']);
      r.commands.chatLine({ sender: 2, name: 'socomc', text: 'back' });
      expect(lines(r as never).at(-1)).toBe('#C\x80\x80\x80socomc (All): back\n');
    } finally { setOwnNameDisplay(null); }
  });
  it('the review’s F3: the 14-character cut is after the rule; before a seat the own line (sender -1, no name) still reads Unknown', async () => {
    setOwnNameDisplay(() => 'ABCDEFGHIJKLMNOPQ');
    try {
      const r = await lobby();
      await r.settle(11 * SECOND);
      r.commands.gameLobby({ seats: [seat(1, 'host', 'seal', { host: true }), seat(2, 'socomc', 'terrorist')], countdown: null, launched: false });
      expect(names(r as never, 'BTERRLISTVAR')).toEqual(['ABCDEFGHIJKLMN']);
      r.commands.seatEnded(null);
      r.commands.chatLine({ sender: -1, name: '', text: 'early' });
      expect(lines(r as never).at(-1)).toBe('#C\x80\x80\x80Unknown (All): early\n');
    } finally { setOwnNameDisplay(null); }
  });
});
