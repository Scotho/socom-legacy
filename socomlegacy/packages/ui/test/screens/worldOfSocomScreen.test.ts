import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { VALVE_TYPE } from '../../src/valves';
import { PARKED_ROWS } from '../../src/screens/worldOfSocomCommands';
import type { ClanInvitationReply } from '../../src/screens/clanInvitations';
import type { ChannelListEntry, RoomListService } from '../../src/screens/worldOfSocomCommands';
import type { ListboxWidget } from '../../src/widgets/listbox';
import { lobbyEventInto } from '../../src/screens/connectCommands';
import { CONNECT_FAILURE_LOC, LOBBY_STATE, LobbyClient } from '../../src/screens/lobbyClient';
import { LogoffCommands } from '../../src/screens/logoffCommands';
import { REBOOT_LAUNCH } from '../../src/screens/launch';
import { HAVE, WORLD, worldRig } from './worldOfSocomRig';

/**
 * ONL-09 over the machine (web research 158 §2): SOCOM II ONLINE (`dlgWorldOfSOCOM.rdr`) built from the disc's own
 * layout and set with the session's modules in PLAT-08's host (`worldOfSocomRig.ts`), its pad a test's snapshot. What
 * is pinned is the dialog's own ANIMATIONS replayed: the eight ONSTART animations, SERVER NEWS once a launch, the
 * focus on each arrival, the walk over the rows with each row's help line and pane, the two rows that work (BRIEFING
 * ROOMS, REFRESH LIST), the rows whose pages are parked (inert, OT.R8), NO INVITATIONS, the music's start, the logoff
 * popup. The files come from the disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`) or the committed fixtures: it
 * runs in CI. Decoded captions (RS.R8); the pad icons' bytes are the disc's glyph codes.
 */

const HORIZON = 'Horizon Medius Server\nSource available on GitHub\n';
const SETTLED = 60;
/** The pane's nodes a row's ONACTIVATE shows or hides. */
const PANE = ['motd', 'ROOMLIST', 'DescFieldTop2', 'which_map', 'game_type_desc', 'O_filters', 'BlueBack', 'LadderTop10', 'ClanLadderTop10', 'FriendList', 'IgnoreList', 'RosterList',
  'InvitedPlayers', 'DescFieldMid', 'DescFieldMid2', 'DescFieldMid3', 'DescFieldMid4', 'DescFieldMid5'] as const;
/** The periodic `TurnOnInvitations` (every second) left out of a dispatch list. */
const quiet = (calls: string[]): string[] => calls.filter((c) => !/^HasClanInvitations|^invitations\.op1|^DisableButton\(invitations\)|^EnableButton\(invitations\)/.test(c));

type Rig = ReturnType<typeof worldRig>;
const shown = (r: Rig): string[] => PANE.filter((n) => r.node(n)?.visible);
const help = (r: Rig): string => r.text('DescriptionText')[0] ?? '';
const scroll = (r: Rig, node: string): number => { const c = r.node(node)?.content; return c?.kind === 'wrapped' ? c.scroll : NaN; };
const popupText = (r: Rig): string => (r.parts.current?.popup()?.popup.text.lines ?? []).map((l) => new TextDecoder().decode(Uint8Array.from(l.bytes)).trim()).join(' ');
const typed = (r: Rig): string => { const c = r.node('O_filters')?.content; return c?.kind === 'teletype' ? String.fromCharCode(...c.state.typed) : '?'; };
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
/** SVC-06's answer with Horizon's four rooms (desktop@be557831 MLS.cs:3383-3384), a few players seated. */
const HORIZON_ROOMS = [room('Alpha', 1, { playerCount: 2 }), room('Bravo', 2), room('Charlie', 3, { playerCount: 1 }), room('Delta', 4, { endOfList: true })];
/** ROOMLIST's items as drawn: the text cells, then the IMAGE cells' textures. */
const items = (r: ReturnType<typeof worldRig>): string[] => (r.parts.current!.widgets.get('ROOMLIST') as ListboxWidget).items
  .map((i) => `${i.captions.filter((_, k) => i.images[k] == null).join(' ')} | ${i.images.filter((x) => x !== null).map((x) => x!.texture).join(' ')}`);
/** The menu past SERVER NEWS: settled, CROSS on the popup. */
async function menu(o: Parameters<typeof worldRig>[0] = {}): Promise<Rig> {
  const r = worldRig({ name: 'socomc', announcement: HORIZON, ...o });
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  expect(r.focused()).toBe('newsandmessages');
  return r;
}

describe.skipIf(!HAVE)(`SOCOM II ONLINE over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the captions are the disc\'s: the title #764, the eleven rows, NO INVITATIONS #794, SERVER NEWS #779-780, the help lines #781-791, AUTOPLAY\'s fields #770-772', () => {
    const r = worldRig();
    const t = (ids: number[]) => ids.map((id) => r.loc.byId.get(id));
    expect(t([764, 776, 777, 778, 521, 396, 148, 476, 407, 702, 315, 370, 794])).toEqual([
      'SOCOM II ONLINE', 'MESSAGES', 'BRIEFING ROOMS', 'AUTOPLAY', 'CLAN', 'PLAYER RANKING', 'CLAN RANKING', 'INVITATIONS', 'REFRESH LIST', 'OPTIONS', 'FRIENDS', 'IGNORE',
      'NO INVITATIONS',
    ]);
    expect(t([779, 780, 775])).toEqual(['SERVER NEWS', '± µ to scroll up/down.    ¦ CLOSE SERVER NEWS. ', 'Clan messages']);
    expect(t([781, 782, 784, 788, 789, 787, 790, 786, 785, 791])).toEqual([
      'News of the day. ¶ and ¼ buttons to scroll up/down', '¦ Select a Briefing Room.', 'Automatically join a game based on your filter settings.',
      '¦ View Player Ranking.', '¦ View Clan Ranking.', '¦ View current Clan invites.', '¦ Refresh the room list.', '¦ Change online options.',
      '¦ Manage your Friends list.', '¦ Manage your Ignore list.',
    ]);
    expect(t([770, 771, 772, 655, 661, 669])).toEqual(['Which maps', 'How many players', 'Connection speed', 'ANY MAP', 'ANY NUMBER OF PLAYERS', 'ANY SPEED ( 65000 )']);
    expect(t([793, 246, 253])).toEqual(['You will be logging off of SOCOM II Online. Are you sure you want to do this?', 'NO', 'YES']);
  });

  it('ONSTART: the eight animations\' dispatches, in the bindings\' order -- every row answered (the friends list ONL-24\'s, the ignore list ONL-25\'s, the ladder ONL-30a\'s)', async () => {
    const r = worldRig({ name: 'socomc', announcement: HORIZON });
    await r.settle(3);
    expect(r.calls()).toEqual([
      // TurnOnInvitations
      'HasClanInvitations(NA) table', 'invitations.op1(_794_NoInvitations_MSG)', 'DisableButton(invitations) table',
      // init_screen: the first arrival's branch, then the requests
      'ActivateButton(popup_motd_button) table', 'GetMediusAnnouncements(NA) table', 'CheckMyInvites(NA) table', 'ROOMLIST:RefreshRoomList(NA) table', 'GetClan(NA) table',
      // CallMusic
      'VagStreaming(ON) table',
      // OnBriefingRoomstart
      'DisableButton(LadderTop10) table', 'DisableButton(ClanLadderTop10) table', 'ActivateButton(newsandmessages) table', 'DisableButton(ROOMLIST) table',
      'DisableButton(motd) table', 'DisableButton(FriendList) table', 'DisableButton(IgnoreList) table', 'DisableButton(RosterList) table',
      // get_ladder_top_10, get_friend_list
      'GetLadderInfo(NA) table', 'GetLadderInfo(NA) table', 'GetFriendsList(NA) table',
      'GetIgnoreList(NA) table',
      // the next tick: GetClan asked again (answered), and the queue's ActivateButton(newsandmessages) runs OnNewsbtn
      'GetClan(NA) table', 'DescriptionText.op1(#781)', 'DisableButton(InvitedPlayers) table',
    ]);
    expect(r.queries).toEqual({ announcement: [{ applicationId: 0x28e8 }], invitations: [{ start: 0, pageSize: 999 }], rooms: [{ pageId: 1, pageSize: 999 }] });
  });

  it('the first arrival: the build activates LadderTop10, then the queue applies both ActivateButtons newest first -- two SELECTION sounds, the focus on popup_motd_button (research 116 §17)', async () => {
    const r = worldRig({ name: 'socomc', announcement: HORIZON });
    r.run(1);
    expect(r.focused()).toBe('LadderTop10');                          // the first control built enabled (MainWindow is an IMAGE)
    await r.settle(SETTLED);
    expect(r.focused()).toBe('popup_motd_button');
    expect(r.selections).toEqual([2, 2]);                             // newsandmessages, then popup_motd_button, on the tick after the build
  });

  it('SERVER NEWS at the first arrival: the popup over the menu with #779 and the server\'s announcement; the help bar hidden; PopupNewsOnce 0 -> 1 (init_screen)', async () => {
    const r = worldRig({ name: 'socomc', announcement: HORIZON });
    expect(r.valve('PopupNewsOnce')).toBe(0);                          // global_valves.rdr's, seeded at the launch
    await r.settle(SETTLED);
    expect(r.valve('PopupNewsOnce')).toBe(1);
    expect([r.node('popup_motd')!.visible, r.node('popup_motd_description')!.visible, r.text('popup_motd_description')]).toEqual([true, true, ['SERVER NEWS']]);
    expect(r.text('popup_motd_text')).toEqual(['Horizon Medius Server', 'Source available on GitHub']);
    expect([r.node('DescFieldTop')!.visible, r.node('DescriptionText')!.visible]).toEqual([false, false]);
  });

  it('SERVER NEWS and MESSAGES show one text: both read MEDIUS_MOTD (the block\'s unknown, settled by the layout)', async () => {
    const r = worldRig({ name: 'socomc', announcement: HORIZON });
    await r.settle(SETTLED);
    expect(r.uiVars.find('MEDIUS_MOTD')!.value).toEqual({ type: 'array', value: [{ type: 'string', value: HORIZON }, { type: 'string', value: '\n' }] });
    expect(r.text('motd')).toEqual(r.text('popup_motd_text'));
    expect([r.node('ClanMessageText')!.visible, r.text('ClanMessageText'), r.text('ClanMessages')]).toEqual([true, ['Clan messages'], []]);   // the band drawn, its text ONL-29's
  });

  it('a fresh server (no announcement: a success with an empty text) shows SERVER NEWS with no line; a server that never answers, the retrieving text', async () => {
    const fresh = worldRig({ name: 'socomc' });
    await fresh.settle(SETTLED);
    expect(fresh.text('popup_motd_text').join('').trim()).toBe('');
    const silent = worldRig({ name: 'socomc', announcement: { announcement: () => new Promise(() => {}) } });
    await silent.settle(SETTLED);
    expect(silent.text('popup_motd_text')).toEqual(['Retrieving messages from server...']);
  });

  it('on the popup: UP and DOWN scroll its text a SPACING (op 4 / op 5), LEFT, RIGHT, L1 and L2 do nothing, TRIANGLE is the screen\'s; CROSS closes it', async () => {
    const r = worldRig({ name: 'socomc', announcement: Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of the news.`).join('\n') });
    await r.settle(SETTLED);
    r.press('DOWN', 4); r.press('DOWN', 4);
    expect([scroll(r, 'popup_motd_text'), r.focused()]).toEqual([40, 'popup_motd_button']);
    r.press('UP', 4);
    expect(scroll(r, 'popup_motd_text')).toBe(20);
    for (const b of ['LEFT', 'RIGHT', 'TRIGGER_L1', 'TRIGGER_L2'] as const) r.press(b, 4);
    expect([scroll(r, 'popup_motd_text'), scroll(r, 'motd'), r.focused()]).toEqual([20, 0, 'popup_motd_button']);
    const from = r.outcomes.length;
    r.press('CROSS', 10);
    expect(quiet(r.calls(WORLD, from))).toEqual(['DisableButton(popup_motd_button) table', 'ActivateButton(newsandmessages) table', 'DescriptionText.op1(#781)', 'DisableButton(InvitedPlayers) table']);
    expect([r.node('popup_motd')!.visible, r.node('popup_motd_description')!.visible, r.node('DescFieldTop')!.visible, r.node('DescriptionText')!.visible]).toEqual([false, false, true, true]);
    expect(r.focused()).toBe('newsandmessages');
  });

  it('the second arrival in a launch: no SERVER NEWS (PopupNewsOnce 1), the settled focus newsandmessages, one SELECTION; the requests sent again', async () => {
    const r = await menu();
    const sel = r.selections.length;
    await r.switchTo(WORLD);
    expect(r.builds).toEqual([WORLD, WORLD]);
    expect(r.focused()).toBe('LadderTop10');                          // the build's own
    await r.settle(SETTLED);
    expect(r.focused()).toBe('newsandmessages');
    expect(r.selections.length - sel).toBe(1);
    expect([r.node('popup_motd')!.visible, r.node('popup_motd_description')!.visible, r.node('DescFieldTop')!.visible, r.node('DescriptionText')!.visible]).toEqual([false, false, true, true]);
    expect(help(r)).toBe('News of the day. ¶ and ¼ buttons to scroll up/down');
    expect(r.queries).toEqual({ announcement: [{ applicationId: 0x28e8 }, { applicationId: 0x28e8 }], invitations: [{ start: 0, pageSize: 999 }, { start: 0, pageSize: 999 }], rooms: [{ pageId: 1, pageSize: 999 }, { pageId: 1, pageSize: 999 }] });
    r.press('UP', 6);
    expect(r.focused()).toBe('Ignore');                               // the popup's button is disabled: off the ring
  });

  it('the music: ONSTART\'s CallMusic starts MUS_ONLINE_MENU once; an arrival with StartMusic 1 does not restart it, one with StartMusic 0 does (research 152 R152.2, R152.7)', async () => {
    const r = await menu();
    const starts = () => r.sound.log.filter((s) => s.startsWith('SOUND') && s.includes('MUS_ONLINE_MENU')).length;
    expect([starts(), r.sound.log.filter((s) => s === 'streaming true').length, r.valve('StartMusic')]).toEqual([1, 1, 0]);
    go(r, 'briefingrooms');
    r.press('CROSS', 6);                                              // PressBriefingRoombtn: StartMusic = 1, as every exit that keeps the stream
    expect(r.valve('StartMusic')).toBe(1);
    await r.switchTo(WORLD);
    await r.settle(SETTLED);
    expect([starts(), r.sound.log.filter((s) => s === 'streaming true').length]).toEqual([1, 1]);
    r.m.valves.set('StartMusic', 0, VALVE_TYPE.TEMP);                 // an exit that stopped it (Goto_Options: StopAllSounds, VagStreaming(OFF), no StartMusic)
    await r.switchTo(WORLD);
    await r.settle(SETTLED);
    expect([starts(), r.sound.log.filter((s) => s === 'streaming true').length]).toEqual([2, 2]);
  });

  it('the walk: DOWN from MESSAGES stops on ten rows -- NO INVITATIONS is disabled and passed -- and wraps; each row\'s ONACTIVATE sets its help line and its pane', async () => {
    const r = await menu();
    const walk: [string, string, string[]][] = [];
    for (let i = 0; i < 11; i++) { walk.push([r.focused(), help(r), shown(r)]); r.press('DOWN', 6); }
    expect(walk).toEqual([
      ['newsandmessages', 'News of the day. ¶ and ¼ buttons to scroll up/down', ['motd']],
      ['briefingrooms', '¦ Select a Briefing Room.', ['ROOMLIST', 'DescFieldTop2']],
      ['autoplay', 'Automatically join a game based on your filter settings.', ['which_map', 'game_type_desc', 'O_filters']],
      ['ClanManage', '¦ Create a clan.', ['RosterList', 'DescFieldMid']],
      ['ranking', '¦ View Player Ranking.', ['BlueBack', 'LadderTop10', 'DescFieldMid4']],
      ['Clanranking', '¦ View Clan Ranking.', ['BlueBack', 'ClanLadderTop10', 'DescFieldMid5']],
      ['refreshlist', '¦ Refresh the room list.', ['ROOMLIST', 'DescFieldTop2']],
      ['options', '¦ Change online options.', []],
      ['friends', '¦ Manage your Friends list.', ['FriendList', 'DescFieldMid2']],
      ['Ignore', '¦ Manage your Ignore list.', ['IgnoreList', 'DescFieldMid2']],
      ['newsandmessages', 'News of the day. ¶ and ¼ buttons to scroll up/down', ['motd']],
    ]);
    const up: string[] = [];
    for (let i = 0; i < 4; i++) { r.press('UP', 6); up.push(r.focused()); }
    expect(up).toEqual(['newsandmessages', 'Ignore', 'friends', 'options']);   // the loop left the focus on BRIEFING ROOMS
    expect(r.node('invitations')!.visible).toBe(true);                 // drawn, greyed: never a stop
  });

  it('PLAYER RANKING and CLAN RANKING show their podium headers over a list with no row; MESSAGES on L1 / L2 scrolls the news', async () => {
    const r = await menu({ announcement: Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of the news.`).join('\n') });
    r.press('TRIGGER_L2', 4); r.press('TRIGGER_L2', 4);
    expect(scroll(r, 'motd')).toBe(40);
    r.press('TRIGGER_L1', 4);
    expect(scroll(r, 'motd')).toBe(20);
    go(r, 'ranking');
    expect([r.node('TopTenText')!.visible, r.node('ClanTopTenText')!.visible, r.text('TopTenText'), r.text('CategoryText1b'), r.text('CategoryText3b')])
      .toEqual([true, false, ['TOP TEN SOCOM II ONLINE PLAYERS'], ['RANK'], ['PLAYER NAME']]);
    go(r, 'Clanranking');
    expect([r.node('TopTenText')!.visible, r.node('ClanTopTenText')!.visible, r.text('ClanTopTenText'), r.text('CategoryText1c')])
      .toEqual([false, true, ['TOP TEN SOCOM II ONLINE CLANS'], ['RANK']]);
  });

  it('AUTOPLAY\'s pane: the fields #770-772 with a fresh card\'s filters (#655 ANY MAP, #661 ANY NUMBER OF PLAYERS, #669 ANY SPEED) and #783 typed out by the TELETYPE', async () => {
    const r = await menu();
    go(r, 'autoplay');
    expect(['which_map', 'HManyPlayers', 'what_speed'].map((n) => [r.node(n)!.visible, r.text(n)[0]])).toEqual([[true, 'Which maps'], [true, 'How many players'], [true, 'Connection speed']]);
    expect(['game_type_desc', 'game_player_desc', 'game_speed_desc'].map((n) => r.text(n)[0])).toEqual(['ANY MAP', 'ANY NUMBER OF PLAYERS', 'ANY SPEED ( 65000 )']);
    const typing = typed(r);
    r.run(150);
    const whole = r.loc.byId.get(783)!;
    expect(typing.length).toBeLessThan(whole.length);                 // typed a character at a time
    expect(typed(r).replace(/\n/g, ' ').replace(/ +/g, ' ')).toBe(whole);
    expect(r.calls().some((c) => c.startsWith('GetMissionInformation'))).toBe(false);   // only for a map's index (ONL-15)
    r.press('DOWN', 6);
    expect([r.focused(), typed(r), r.node('O_filters')!.visible]).toEqual(['ClanManage', ' ', false]);   // the next row gives it " " and hides it
  });

  it('CLAN\'s help line is the no-clan one: IsLeaderOfClan and IsMemberOfClan both answer 0 (ONL-27\'s rows over the rig\'s no-clan GetMyClans)', async () => {
    const r = await menu();
    const from = r.outcomes.length;
    go(r, 'ClanManage');
    const calls = quiet(r.calls(WORLD, from));
    expect(calls.slice(calls.indexOf('IsLeaderOfClan(NA) table'))).toEqual(['IsLeaderOfClan(NA) table', 'IsMemberOfClan(NA) table', 'DescriptionText.op1(¦ Create a clan.)']);
    expect(help(r)).toBe('¦ Create a clan.');
  });

  it('the persona\'s name at the foot is PLAYER_NAME_AND_TAG, written by GetClan\'s reply; no medal: it shows only on ON_LADDER_REFRESH (the ladder is parked)', async () => {
    const r = worldRig({ name: 'socomc', announcement: HORIZON });
    await r.settle(SETTLED);
    expect(r.text('playername')).toEqual(['socomc']);
    expect(r.uiVars.find('PLAYER_NAME_AND_TAG')!.value).toEqual({ type: 'string', value: 'socomc' });
    const medals = ['Medal_Blue', 'Medal_Bronze', 'Medal_Silver', 'Medal_Gold', 'Medal_Black'];
    expect(medals.map((n) => r.node(n)!.visible)).toEqual([false, false, false, false, false]);
    expect(r.valve('LadderMedalOfMerit')).toBe(0);
    // The set's own DisplayMedalOfMerit, should a ladder answer set the valve and raise the event (ONL-34's): 5 shows Medal_Black.
    r.m.valves.set('LadderMedalOfMerit', 5, VALVE_TYPE.PERM);
    r.m.shell()!.event(DIALOG_EVENTS['ON_LADDER_REFRESH']!);
    r.run(3);
    expect(medals.map((n) => r.node(n)!.visible)).toEqual([false, false, false, false, true]);
  });

  it('NO INVITATIONS: the row reads #794 and is disabled; CheckMyInvites asked the service once; MY_CLAN_INVITES holds the none row; TurnOnInvitations asks again every second', async () => {
    const r = await menu();
    expect(r.queries.invitations).toEqual([{ start: 0, pageSize: 999 }]);
    expect(r.uiVars.find('MY_CLAN_INVITES')!.value).toEqual({ type: 'array', value: [{ type: 'array', value: [' ', 'No Invitations', ' '].map((value) => ({ type: 'string', value })) }] });
    const asked = () => r.calls().filter((c) => c === 'HasClanInvitations(NA) table').length;
    const before = asked();
    r.run(90);
    expect(asked() - before).toBe(3);
    expect(r.calls().filter((c) => c === 'invitations.op1(_794_NoInvitations_MSG)').length).toBeGreaterThan(3);
    expect(r.node('InvitedPlayers')!.visible).toBe(false);
  });

  it('with an invitation the row reads INVITATIONS, is a stop of the walk with its help line #787 and its list; its CROSS opens RESPOND TO INVITES (ONL-28, research 273 §4)', async () => {
    const invite: ClanInvitationReply = { status: 0, clanInvitationId: 7, clanId: 3, responseStatus: 0, message: 'Join us', leaderAccountId: 2, leaderAccountName: 'lead', endOfList: true };
    const r = worldRig({ name: 'socomc', announcement: HORIZON, invitations: [invite] });
    await r.settle(90);                                                // the reply, then TurnOnInvitations' next second
    r.press('CROSS', 10);
    expect(r.events).toContain(DIALOG_EVENTS['MP_MEDIUS_HAS_INVITES']);
    expect(r.calls()).toContain('invitations.op1(_476_INVITATIONS_MSG)');
    go(r, 'invitations');
    expect([help(r), shown(r)]).toEqual(['¦ View current Clan invites.', ['InvitedPlayers', 'DescFieldMid3']]);
    r.press('CROSS', 2);
    for (let i = 0; i < 120 && r.builds.at(-1) !== 'dlgRespondToInvites.rdr'; i++) await r.settle(1);
    expect([r.builds, r.valve('StartMusic')]).toEqual([[WORLD, 'dlgRespondToInvites.rdr'], 1]);
  });

  it('BRIEFING ROOMS, CROSS (PressBriefingRoombtn): .DINK, StartMusic 1, the focus on ROOMLIST -- with no room it takes no pad: CROSS does nothing, DOWN leaves it', async () => {
    const r = await menu();
    go(r, 'briefingrooms');
    const from = r.outcomes.length, sounds = r.sound.log.length;
    r.press('CROSS', 6);
    expect(quiet(r.calls(WORLD, from))).toEqual(['ActivateButton(ROOMLIST) table', 'EnableButton(ROOMLIST) table', 'DescriptionText.op1(#782)']);
    expect(r.sound.log.slice(sounds).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1])).toEqual(['.DINK']);
    expect([r.focused(), r.valve('StartMusic'), shown(r)]).toEqual(['ROOMLIST', 1, ['ROOMLIST', 'DescFieldTop2']]);
    expect(r.uiVars.find('ROOMLISTVAR')!.value).toEqual({ type: 'none' });           // a server that never answers the room list: no row
    const after = r.outcomes.length;
    r.press('CROSS', 6);
    expect(quiet(r.calls(WORLD, after))).toEqual([]);                  // no CanJoinRoom, no JoinMPRoom
    r.press('DOWN', 6);
    expect(r.focused()).toBe('newsandmessages');
  });

  it('REFRESH LIST, CROSS (refresh_roomlist): .DINK, RefreshRoomList at ROOMLIST, the row disabled and the focus on OPTIONS for five seconds, FiveCount 5..1, then back', async () => {
    const r = await menu();
    go(r, 'refreshlist');
    const from = r.outcomes.length, sounds = r.sound.log.length;
    r.press('CROSS', 4);
    expect(quiet(r.calls(WORLD, from))).toEqual([
      'ROOMLIST:RefreshRoomList(NA) table', 'DisableButton(refreshlist) table', 'ActivateButton(options) table', 'FiveCount.op1(5)', 'DescriptionText.op1(#786)',
    ]);
    expect(r.sound.log.slice(sounds).filter((s) => s.startsWith('SOUND')).map((s) => /"sound":"([^"]+)"/.exec(s)![1])).toEqual(['.DINK']);
    expect([r.focused(), r.valve('StartMusic'), r.text('FiveCount')]).toEqual(['options', 1, ['5']]);
    const count: [string, string][] = [];
    for (let s = 0; s < 6; s++) { r.run(30); count.push([r.focused(), r.text('FiveCount')[0]!]); }
    expect(count).toEqual([['options', '4'], ['options', '3'], ['options', '2'], ['options', '1'], ['refreshlist', ' '], ['refreshlist', ' ']]);
  });

  it('the room list is asked again every 30 s (init_screen\'s roomlist_autorefresh)', async () => {
    const r = await menu();
    const asked = () => r.calls().filter((c) => c === 'ROOMLIST:RefreshRoomList(NA) table').length;
    expect(asked()).toBe(1);
    r.run(31 * 30);
    expect(asked()).toBe(2);
  });

  it('ONL-11: the room list filled from the lobby service (SVC-06\'s channel-list) on the disc\'s ROOMLIST: Horizon\'s four in the original\'s order, name, players and the four medals of the IMAGE columns', async () => {
    const r = await menu({ rooms: HORIZON_ROOMS });
    expect(r.queries.rooms).toEqual([{ pageId: 1, pageSize: 999 }]);
    expect(items(r)).toEqual([
      'Alpha 2 | Medal_Blue.tif Medal_Bronze.tif Medal_Silver.tif Medal_Gold.tif', 'Bravo 0 | Medal_Blue.tif Medal_Bronze.tif Medal_Silver.tif Medal_Gold.tif',
      'Delta 0 | Medal_Blue.tif Medal_Bronze.tif Medal_Silver.tif Medal_Gold.tif', 'Charlie 1 | Medal_Blue.tif Medal_Bronze.tif Medal_Silver.tif Medal_Gold.tif',
    ]);
  });

  it('SVC-14a: a room\'s rank bits drawn as the original draws them -- one medal per bit, filled from the first image column; judged by the services, not the page (SVC-14)', async () => {
    const r = await menu({ rooms: [room('Alpha', 1, { genericField1: 0b0110 }), room('Bravo', 2, { genericField1: 0b1000, endOfList: true })] });
    expect(items(r)).toEqual(['Alpha 0 | Medal_Bronze.tif Medal_Silver.tif', 'Bravo 0 | Medal_Gold.tif']);
  });

  it('BRIEFING ROOMS with rooms: the focus on ROOMLIST takes the pad -- DOWN and UP step its rows; TRIANGLE back to MESSAGES', async () => {
    const r = await menu({ rooms: HORIZON_ROOMS });
    go(r, 'briefingrooms');
    r.press('CROSS', 6);
    const list = r.parts.current!.widgets.get('ROOMLIST') as ListboxWidget;
    expect([r.focused(), list.focus]).toEqual(['ROOMLIST', 0]);
    r.press('DOWN', 10);
    r.press('DOWN', 10);
    expect([r.focused(), list.focus]).toEqual(['ROOMLIST', 2]);
    r.press('UP', 10);
    expect(list.focus).toBe(1);
    r.press('TRIANGLE', 10);
    expect(r.focused()).toBe('newsandmessages');
  });

  it('CROSS on a room row runs join_room (ONL-12): without the join\'s rows and a lobby, the table\'s declared rows answer and the state is not 19 or 20 -- OnBadJoinState, #804, the list asked again', async () => {
    const r = await menu({ rooms: HORIZON_ROOMS });
    go(r, 'briefingrooms');
    r.press('CROSS', 6);
    const from = r.outcomes.length, built = r.builds.length, asked = r.queries.rooms.length;
    r.press('CROSS', 10);
    const calls = quiet(r.calls(WORLD, from));
    expect(calls.filter((c) => /CanJoinRoom|JoinMPRoom/.test(c))).toEqual(['CanJoinRoom(INPUT_STRING) not implemented: ONL-11', 'JoinMPRoom(INPUT_STRING) not implemented: ONL-11']);
    expect(calls).toEqual(expect.arrayContaining(['ROOMLIST:RefreshRoomList(NA) table', 'POPUPDIALOG(NA) table']));
    expect([r.builds.length, r.queries.rooms.length]).toEqual([built, asked + 1]);
  });

  it('the refresh redraws the counts: every 30 s and on REFRESH LIST the service is asked again and the rows follow its answer', async () => {
    let players = 0;
    const live: RoomListService = { channelList: () => Promise.resolve([room('Alpha', 1), room('Bravo', 2, { playerCount: players, endOfList: true })]) };
    const r = await menu({ rooms: live });
    expect(items(r)[1]).toBe('Bravo 0 | Medal_Blue.tif Medal_Bronze.tif Medal_Silver.tif Medal_Gold.tif');
    players = 5;
    await r.settle(31 * 30);
    expect(r.queries.rooms).toHaveLength(2);
    expect(items(r)[1]).toMatch(/^Bravo 5 /);
    players = 6;
    go(r, 'refreshlist');
    r.press('CROSS', 2);
    await r.settle(2);
    expect(r.queries.rooms).toHaveLength(3);
    expect(items(r)[1]).toMatch(/^Bravo 6 /);
  });

  it('empty and error: Horizon\'s NoResult page draws no row; a service that fails draws none and keeps what was drawn', async () => {
    const empty = await menu({ rooms: [room('', 0, { status: 1, maxPlayers: 0, endOfList: true })] });
    expect(items(empty)).toEqual([]);
    expect(empty.uiVars.find('ROOMLISTVAR')!.value).toEqual({ type: 'none' });
    let fail = false;
    const flaky: RoomListService = { channelList: () => (fail ? Promise.reject(new Error('503')) : Promise.resolve(HORIZON_ROOMS)) };
    const r = await menu({ rooms: flaky });
    fail = true;
    await r.settle(31 * 30);
    expect(r.queries.rooms).toHaveLength(2);
    expect(items(r)).toHaveLength(4);
  });

  it('the rows whose pages are parked are inert (OT.R8): CROSS dispatches nothing, plays nothing, builds nothing, moves nothing -- none since ONL-30 unparked CLAN RANKING', async () => {
    expect(PARKED_ROWS).toEqual([]);
    const r = await menu();
    for (const p of PARKED_ROWS) {
      go(r, p.control);
      r.run(40);                                                       // AUTOPLAY's typing done
      const from = r.outcomes.length, sounds = r.sound.log.length, music = r.valve('StartMusic');
      r.press('CROSS', 20);
      expect(quiet(r.calls(WORLD, from)), p.control).toEqual([]);
      expect(r.sound.log.slice(sounds).filter((s) => !s.includes('.TYPE')), p.control).toEqual([]);
      expect([r.focused(), r.shown(), r.valve('StartMusic'), r.builds], p.control).toEqual([p.control, false, music, [WORLD]]);
    }
  });

  it('CLAN RANKING (Goto_ClanLadder, unparked by ONL-30: research 311) runs the set\'s own script with the gate on: SwitchMenu(dlgClanLadderLobby.rdr), StartMusic 1 -- the page ONL-30 built (clanLadderLobbyScreen.test.ts)', async () => {
    const r = await menu();
    go(r, 'Clanranking');
    const from = r.outcomes.length;
    r.press('CROSS', 4);
    await r.settle(SETTLED);
    expect(quiet(r.calls(WORLD, from))).toEqual(['SwitchMenu(dlgClanLadderLobby.rdr) table']);
    expect([r.builds, r.valve('StartMusic')]).toEqual([[WORLD, 'dlgClanLadderLobby.rdr'], 1]);
  });

  it('OPTIONS (Goto_Options, unparked by TAUNTS: research 301 §6) runs the set script: StopAllSounds, VagStreaming(OFF), SwitchMenu(dlgOnlineOptions.rdr)', async () => {
    const r = await menu();
    go(r, 'options');
    const from = r.outcomes.length;
    r.press('CROSS', 4);
    await r.settle(SETTLED);
    expect(quiet(r.calls(WORLD, from)).map((c) => c.split('(')[0])).toEqual(['StopAllSounds', 'VagStreaming', 'SwitchMenu']);
    expect(r.builds).toEqual([WORLD, 'dlgOnlineOptions.rdr']);
  });

  it('TRIANGLE (exit_lobby, ONL-10\'s): the #793 popup with NO / YES; NO, its first button, closes it and the menu stays -- no LobbyLogout', async () => {
    const r = await menu();
    const from = r.outcomes.length;
    r.press('TRIANGLE', 8);
    expect(r.shown()).toBe(true);
    expect(quiet(r.calls(WORLD, from))).toEqual(['POPUPDIALOG(NA) table', 'POPUP.op24(NA)']);
    r.press('CROSS', 8);
    expect([r.shown(), r.current(), r.focused(), r.launches]).toEqual([false, WORLD, 'newsandmessages', []]);
    expect(r.calls().some((c) => c.startsWith('LobbyLogout'))).toBe(false);
    expect(r.valve('AreYouSure')).toBe(1);
  });

  it('before this task\'s mount the row lit and the foot was empty: the table\'s default answers (HasClanInvitations 1), no PLAYER_NAME_AND_TAG', async () => {
    const r = worldRig({ name: 'socomc', commands: false });
    await r.settle(SETTLED);
    expect(r.calls()).toContain('HasClanInvitations(NA) not implemented: ONL-28');
    expect(r.calls()).toContain('invitations.op1(_476_INVITATIONS_MSG)');
    expect(r.text('playername')).toEqual([]);
  });
});

/**
 * ONL-22 (research 315 §3.7, §6 E5, R315.7): the lobby connection lost on SOCOM II ONLINE. ONL-07's client (logged in
 * over a fake account service, stepped once a frame before the machine) with the logoff module mounted as the session
 * mounts it (`LogoffCommands`: `LobbyLogout`, `UnInitNetwork`, `LobbyBailout`); its events into the built dialog
 * (`lobbyEventInto`). A 401 (`SESSION_LOST_READING`) queues state 2, whose entry posts MP_MEDIUS_ERROR with #450's
 * text; the set binds it to `UIanim.rdr`'s `OnMultiplayerDisconnect` (P:L15659-15672).
 */
describe.skipIf(!HAVE)(`ONL-22: the lobby lost on SOCOM II ONLINE${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  async function lost() {
    let lobby!: LobbyClient;
    let deliver = false, resets = 0;
    const rows: string[] = [];
    let loc: ((id: number) => string | null) | null = null;
    const r = worldRig({
      name: 'socomc', announcement: HORIZON,
      tick: () => { lobby.step(); },
      register: (host, ctx) => {
        const into = lobbyEventInto(ctx.machine, ctx.parts);
        lobby = new LobbyClient({
          valves: () => ctx.machine().valves, event: (kind, text) => { if (deliver) into(kind, text); },
          service: { login: () => Promise.resolve({ status: 0, ticket: 'T1' }), register: () => Promise.resolve({ status: 0 }) },
          locText: (id) => loc?.(id) ?? null,
        });
        // The row's answer logged with the lobby's teardowns counted so far (`FUN_002dfdd0`'s resets, `onReset`).
        new LogoffCommands({ lobby, log: (name, _arg, answer) => { rows.push(`${name} ${answer ? 1 : 0} left ${resets}`); } }).register(host);
      },
    });
    loc = (id) => r.loc.byId.get(id) ?? null;
    lobby.connect('localhost', 10075);
    lobby.login('socomc', 'pw');
    for (let i = 0; i < 12 && lobby.state() !== LOBBY_STATE.LOGGED_IN; i++) await r.settle(1);
    expect(lobby.state()).toBe(LOBBY_STATE.LOGGED_IN);
    lobby.onReset(() => { resets++; });
    deliver = true;
    await r.settle(SETTLED);
    r.press('CROSS', 10);                                              // SERVER NEWS closed
    expect(r.focused()).toBe('newsandmessages');
    return { r, lobby, rows, resets: () => resets };
  }

  it('MP_MEDIUS_ERROR: the popup with #450\'s text and MAIN MENU; CROSS -> LobbyBailout leaves the lobby, UnInitNetwork finds it left (once, not twice), the NetCnf rows, REBOOT', async () => {
    const x = await lost();
    const { r } = x;
    const from = r.outcomes.length;
    x.lobby.sessionLost('T1');                                         // a 401: state 2 queued (SESSION_LOST_READING)
    await r.settle(20);
    expect([x.lobby.state(), x.lobby.up, r.shown()]).toEqual([LOBBY_STATE.CONNECT_FAILURE, true, true]);   // FUN_002ee610 leaves the flag +0x7d set
    expect(popupText(r)).toBe(r.loc.byId.get(CONNECT_FAILURE_LOC)!.trim());
    const popup = r.parts.current!.popup()!.popup;
    expect(popup.valve?.name).toBe('OKValve');
    expect(String.fromCharCode(...popup.buttons[0].captionCodes)).toBe(r.loc.byId.get(45));   // _45_MainMenu_MSG
    expect(x.rows).toEqual([]);
    await r.settle(6 * 30);
    r.press('CROSS', 10);                                              // MAIN MENU
    for (let i = 0; i < 600 && r.launches.length === 0; i++) await r.settle(1);
    const chain = r.calls(WORLD, from).filter((c) => /^(LobbyBailout|UnInitNetwork|NetCnfClose|NetCnfUnInit|SWITCHMENU)/.test(c));
    expect(chain).toEqual(['LobbyBailout(NA) table', 'UnInitNetwork(NA) table', 'NetCnfClose(NA) table', 'NetCnfUnInit(NA) table', 'SWITCHMENU(REBOOT) table']);
    expect(x.rows).toEqual(['LobbyBailout 1 left 1', 'UnInitNetwork 1 left 1']);   // the bailout left the lobby; UnInitNetwork's FUN_002dfdd0 found the flag clear
    expect([x.lobby.up, x.lobby.ticket(), x.lobby.loggedIn(), x.resets()]).toEqual([false, null, false, 1]);
    expect(r.launches[0]?.elf).toBe(REBOOT_LAUNCH.elf);
  }, 60_000);
});
