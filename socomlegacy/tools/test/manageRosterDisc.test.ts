import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import {
  CLAN_DESCRIPTION_VAR, CLAN_RATING_VAR, CLAN_ROSTER_VAR, LEADER_CANNOT_REMOVE_SELF_TEXT, MANAGE_ROSTER, MANAGE_ROSTER_LEADER, MEDIUS_STATUS_TEXT_UNKNOWN, ROSTER_LEADER_MARK,
  ROSTER_MAIN_MENU, ROSTER_ONLINE_GLYPH, decodeTextInput, loadDialog, mediusStatusText,
} from '@s2u/ui';
import { discRoot } from '../dump-dialogs';
import { readChapters } from '../dump-online-dialogs';
import { ElfImage } from '../elfImage';

/**
 * ONL-27's dev-disc check (web research 272 §1-§2): the member's roster (`dlgManageRoster.rdr`) and the leader's
 * (`dlgManageRosterLeader.rdr`) read off the disc with the repository's readers (`tools/dump-online-dialogs.ts`'s
 * chapter: the layouts of `RUN/UI/READERC.ZAR`, the sets of `RUN/UIZANIM.ZAR`; `loadDialog` for the list's columns and the
 * titles' literals) -- names, captions' ids and the ops as decoded, no bytes (RS.R8); the sets' two literals (the
 * leader's refusal and its button) held to the module's text:
 * - each page's layout, its bindings, its animations' ops and its edges; the roster's seven columns;
 * - `clan_tag`'s `GetTextInput` block (the command's 0xAC bytes, `decodeTextInput`): `MPPLAYERNAME` on Clan_Description,
 *   titled #499, 3 characters of 15 bytes;
 * - the ELF's strings the transcription cites (`S:0x...`), `FUN_002f4300`'s status names, and the four rows with no
 *   decompiled block read as instructions: `GetClan` (0x27aa60), `RemovePlayerFromClan` (0x27a840), `TransferLeadership`
 *   (0x277430), `DisbandClan` (0x27a920).
 * The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither it skips.
 */
const DISC = discRoot();
const ELF_PATH = DISC ? resolve(DISC, 'socom2_game.elf') : '';
const HAVE_ELF = !!DISC && existsSync(ELF_PATH);

const sets = () => parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UIZANIM.ZAR'))))).sets;
const design = (name: string) => {
  const z = Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UI/READERC.ZAR'))));
  return loadDialog(parseRdr(z.data(z.find(name)!)));
};
const bound = (c: ReturnType<typeof readChapters>[number]): string[] => c.bindings.map((x) => `${x.owner} ${x.trigger} -> ${x.animation}${x.argument !== null ? `(${x.argument})` : ''}`);
const lines = (c: ReturnType<typeof readChapters>[number]): string[] => c.widgets.map((w) => `${w.type} ${w.name}${w.caption ? ` ${w.caption}` : ''}${w.uivar ? ` uivar ${w.uivar}` : ''}`);
/** A control's widget record (`DialogRecord.widget`), by name, from the layout's controls and objects. */
const control = (d: ReturnType<typeof design>, name: string): Record<string, unknown> => {
  const r = [...d.controls, ...d.objects].find((x) => x.name === name) as unknown as { widget: Record<string, unknown> };
  return r.widget;
};

describe.skipIf(!DISC)('the member\'s roster off the disc (dlgManageRoster.rdr)', () => {
  const chapter = () => readChapters(DISC!, [MANAGE_ROSTER])[0]!;
  const ops = (a: string): string[] => chapter().animations[a]!.map((l) => l.trim());

  it('the layout: the list on CLAN_ROSTER, LEAVE CLAN #459, VIEW INFO #460, RETURN #314; the clan rating #462 on ClanRating; the heads RANK / ONLINE / MEDAL / MEMBER / POSITION; the title\'s literal "CLAN ROSTER:"', () => {
    const c = chapter();
    expect(lines(c)).toEqual(expect.arrayContaining([
      `LISTBOX RosterList uivar ${CLAN_ROSTER_VAR}`, 'BUTTON LeaveClan _459_LeaveClan_MSG', 'BUTTON ViewInfo _460_ViewInfo_MSG', 'BUTTON return _314_RETURN_MSG',
      'TEXT txtClanName uivar CLANNAMEVAR', 'TEXT clanrating _462_YourClanRating_MSG', `TEXT txtClanRating uivar ${CLAN_RATING_VAR}`, 'TEXT Category0Text _464_RANK_MSG',
      'TEXT Category1Text _316_ONLINE_MSG', 'TEXT Category2Text _465_MEDAL_MSG', 'TEXT Category3Text _466_MEMBER_MSG', 'TEXT Category4Text _467_POSITION_MSG',
    ]));
    expect(c.widgets.filter((w) => w.type === 'BUTTON').map((w) => w.name)).toEqual(['LeaveClan', 'ViewInfo', 'return', 'playerinfo_ctl_desc']);
    expect(c.locs).toEqual([54, 149, 150, 314, 316, 322, 389, 459, 460, 462, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 863, 864]);
    expect((control(design(MANAGE_ROSTER), 'bar_title')['text'] as { caption: string }).caption).toBe('CLAN ROSTER:');
  });

  it('the bindings: ONSTART OnMRosterStart; TRIANGLE back to SOCOM II ONLINE; MP_MEDIUS_BECAME_LEADER, MP_CLAN_DISBANDED; the rows\' ONACTIVATE and CROSS; the list\'s CROSS PLAYER INFO', () => {
    expect(bound(chapter())).toEqual([
      'SCREEN EVENT ONSTART -> net_monitor', 'SCREEN EVENT ONSTART -> OnMRosterStart', 'SCREEN EVENT ONSTART -> ActivateMedalOfMerit', 'SCREEN BUTTON TRIANGLE -> goto_menu(dlgWorldOfSOCOM.rdr)',
      'SCREEN EVENT MP_MEDIUS_ERROR -> OnMultiplayerDisconnect', 'SCREEN EVENT MP_MEDIUS_BECAME_LEADER -> have_become_leader', 'SCREEN EVENT MP_CLAN_DISBANDED -> clan_disbanded',
      'SCREEN EVENT MP_SYSTEM_MESSAGE -> OnSystemMessage', 'RosterList BUTTON CROSS -> playerinfo_activate', 'RosterList BUTTON TRIANGLE -> OnRosterListReturn(NONE)',
      'LeaveClan EVENT ONACTIVATE -> OnLeaveClanBtn', 'LeaveClan BUTTON CROSS -> leave_clan', 'ViewInfo EVENT ONACTIVATE -> OnViewInfoBtn', 'ViewInfo BUTTON CROSS -> view_info',
      'return EVENT ONACTIVATE -> ReturnAct', 'return BUTTON CROSS -> check_then_save_and_leave', 'playerinfo_ctl_desc BUTTON TRIGGER_R1 -> playerinfo_send_message',
      'playerinfo_ctl_desc BUTTON SQUARE -> playerinfo_ignore_player', 'playerinfo_ctl_desc BUTTON TRIANGLE -> playerinfo_deactivate',
    ]);
  });

  it('the animations\' ops and the edges: OnMRosterStart\'s three requests; leave_clan\'s #473, QuitClan, #474 and the switch; the two events\' popups and switches', () => {
    expect(ops('OnMRosterStart')).toEqual(['DisableButton(RosterList)', 'EnableButton(LeaveClan)', 'ActivateButton(LeaveClan)', 'GetClanRoster(NA)', 'GetClanMessages(NA)', 'GetClan(NA)']);
    expect(ops('leave_clan')).toEqual([
      'OPACITY MENUFADER 0->0.7 0.05', 'VALVE AreYouSure = 0', 'POPUPDIALOG(NA)', 'POPUP #473 buttons #246/#253 -> AreYouSure', 'WHILE AreYouSure == 0', 'END_WHILE', 'IF AreYouSure == 2',
      'QuitClan(NA)', 'POPUPDIALOG(NA)', 'POPUP #474', 'SWITCHMENU(dlgWorldOfSOCOM.rdr)', 'ELSE', 'POPUPDIALOG(NA)', 'POPUP #389', 'ENDIF', 'OPACITY MENUFADER 0.7->0 0.05',
    ]);
    expect(ops('have_become_leader').filter((l) => /^POPUP |^SWITCHMENU/.test(l))).toEqual(['POPUP #469 buttons #226 -> AreYouReallySure', `SWITCHMENU(${MANAGE_ROSTER_LEADER})`]);
    expect(ops('clan_disbanded').filter((l) => /^POPUP |^SWITCHMENU/.test(l))).toEqual(['POPUP #470 buttons #226 -> AreYouReallySure', 'SWITCHMENU(dlgWorldOfSOCOM.rdr)']);
    expect([ops('view_info'), ops('OnRosterListReturn'), ops('OnLeaveClanBtn'), ops('OnViewInfoBtn'), ops('ReturnAct')]).toEqual([
      ['EnableButton(RosterList)', 'ActivateButton(RosterList)', 'DescriptionText.op1(#472)'], ['DisableButton(RosterList)', 'ActivateButton(ViewInfo)'],
      ['DescriptionText.op1(#468)'], ['DescriptionText.op1(#471)'], ['DescriptionText.op1(#322)'],
    ]);
    expect(ops('playerinfo_activate')).toContain('GetPlayerInfo(INPUT_STRING)');
    expect(chapter().edges.filter((e) => !e.endsWith('(library)'))).toEqual([
      'LeaveClan BUTTON CROSS leave_clan SWITCHMENU -> dlgWorldOfSOCOM.rdr', 'SCREEN BUTTON TRIANGLE goto_menu SWITCHMENU -> dlgWorldOfSOCOM.rdr',
      'SCREEN EVENT MP_CLAN_DISBANDED clan_disbanded SWITCHMENU -> dlgWorldOfSOCOM.rdr', `SCREEN EVENT MP_MEDIUS_BECAME_LEADER have_become_leader SWITCHMENU -> ${MANAGE_ROSTER_LEADER}`,
      'return BUTTON CROSS check_then_save_and_leave SWITCHMENU -> dlgWorldOfSOCOM.rdr',
    ]);
    expect(chapter().commands.filter((x) => /^(GetClan|GetClanMessages|GetClanRoster|GetPlayerInfo|QuitClan) /.test(x))).toEqual([
      'GetClan FUN_0027aa60', 'GetClanMessages FUN_00279790', 'GetClanRoster FUN_0027a390', 'GetPlayerInfo FUN_00279b50', 'QuitClan FUN_00278d00',
    ]);
  });

  it('PLAYER INFO from the roster is the CLAN origin: GetPlayerInfo\'s +0x10 word 1', () => {
    const own = sets().filter((s) => s.name.toLowerCase() === MANAGE_ROSTER.toLowerCase());
    const words = own.flatMap((s) => s.anims.filter((a) => a.name === 'playerinfo_activate').flatMap((a) =>
      a.sequences.flatMap((q) => q.commands.filter((c) => c.set !== 0 && a.names[c.bytes[6]!]?.toLowerCase() === 'getplayerinfo').map((c) => c.bytes[0x10]))));
    expect(words).toEqual([1]);
  });

  it('the roster\'s seven columns (the member\'s and the leader\'s): the key off the page at -270, the name 163 / 162, the glyph 57 / 51, the description off the page at 875, the position -10, the mark 352 / 350, the medal image', () => {
    const cols = (d: string) => (control(design(d), 'RosterList')['columns'] as { kind: number; position: number; textures: unknown }[]).map((c) => [c.kind, c.position]);
    expect(cols(MANAGE_ROSTER)).toEqual([[1, -270], [1, 163], [1, 57], [1, 875], [1, -10], [1, 352], [0, 112]]);
    expect(cols(MANAGE_ROSTER_LEADER)).toEqual([[1, -270], [1, 162], [1, 51], [1, 875], [1, -10], [1, 350], [0, 110]]);
    const medal = (control(design(MANAGE_ROSTER), 'RosterList')['columns'] as { textures: unknown }[])[6]!.textures;
    expect(medal).toEqual(['null.tif', 'Medal_Blue.tif', 'Medal_Bronze.tif', 'Medal_Silver.tif', 'Medal_Gold.tif', 'Medal_Black.tif']);
  });
});

describe.skipIf(!DISC)('the leader\'s roster off the disc (dlgManageRosterLeader.rdr)', () => {
  const chapter = () => readChapters(DISC!, [MANAGE_ROSTER_LEADER])[0]!;
  const ops = (a: string): string[] => chapter().animations[a]!.map((l) => l.trim());

  it('the layout: the eight rows #475-#480, #460, #314; the lists on CLAN_ROSTER, INVITED_PLAYERS and ClanLeaderMessages; the title\'s literal "MANAGE CLAN:"', () => {
    const c = chapter();
    expect(c.widgets.filter((w) => w.type === 'BUTTON').map((w) => `${w.name} ${w.caption}`)).toEqual([
      'EditNews _475_EditNews_MSG', 'invitedplayers _476_INVITATIONS_MSG', 'removeplayers _477_RemovePlayers_MSG', 'ViewInfo _460_ViewInfo_MSG', 'appointleader _478_AppointLeader_MSG',
      'disbandclan _479_DisbandClan_MSG', 'SetTag _480_ClanTag_MSG', 'return _314_RETURN_MSG', 'playerinfo_ctl_desc _864_TextChatBack_MSG',
    ]);
    expect(lines(c)).toEqual(expect.arrayContaining([`LISTBOX RosterList uivar ${CLAN_ROSTER_VAR}`, 'LISTBOX ClanMessageList uivar ClanLeaderMessages', `TEXT txtClanRating uivar ${CLAN_RATING_VAR}`]));
    expect(c.locs).toEqual([54, 149, 150, 314, 316, 322, 380, 389, 460, 462, 464, 465, 466, 467, 471, 472, 475, 476, 477, 478, 479, 480, 483, 485, 486, 487, 488, 489, 490, 491, 492, 493, 495, 496, 498, 500, 501, 502, 503, 504, 505, 506, 863, 864]);
    expect((control(design(MANAGE_ROSTER_LEADER), 'bar_title')['text'] as { caption: string }).caption).toBe('MANAGE CLAN:');
  });

  it('the bindings: the four ONSTARTs; the events MP_DISBAND_CLAN_SUCCESS / _FAILURE, MP_PLAYER_IS_LEADER, MP_LEADERSHIP_TRANSFER_SUCCESS; the rows\' CROSS; the list\'s DoSomething', () => {
    const b = bound(chapter());
    expect(b.slice(0, 5)).toEqual([
      'SCREEN EVENT ONSTART -> find_invited_players', 'SCREEN EVENT ONSTART -> net_monitor', 'SCREEN EVENT ONSTART -> OnMRosterLeaderStart', 'SCREEN EVENT ONSTART -> MRosterLeaderStartData',
      'SCREEN EVENT ONSTART -> ActivateMedalOfMerit',
    ]);
    expect(b).toEqual(expect.arrayContaining([
      'SCREEN BUTTON TRIANGLE -> goto_menu(dlgWorldOfSOCOM.rdr)', 'SCREEN EVENT MP_DISBAND_CLAN_SUCCESS -> disband_success', 'SCREEN EVENT MP_DISBAND_CLAN_FAILURE -> disband_failure',
      'SCREEN EVENT MP_PLAYER_IS_LEADER -> OnPlayerLeaderError', `SCREEN EVENT MP_LEADERSHIP_TRANSFER_SUCCESS -> goto_menu(${MANAGE_ROSTER})`, 'RosterList BUTTON CROSS -> DoSomething',
      'RosterList EVENT ONFOCUS -> OnRosterListScroll', 'invitedplayers BUTTON CROSS -> goto_menu(dlgInvitedPlayers.rdr)', 'removeplayers BUTTON CROSS -> OnRemoveAppointPress',
      'ViewInfo BUTTON CROSS -> OnRemoveAppointPress', 'appointleader BUTTON CROSS -> OnRemoveAppointPress', 'disbandclan BUTTON CROSS -> clan_disband', 'SetTag BUTTON CROSS -> clan_tag',
      'return BUTTON CROSS -> check_then_save_and_leave',
    ]));
    expect(b.some((x) => x.startsWith('SCREEN EVENT MP_PLAYER_NOT_FOUND') || x.startsWith('SCREEN EVENT MP_SUCCESS'))).toBe(false);   // #505 and #506 bound by no event
  });

  it('the animations\' ops: MRosterLeaderStartData; DoSomething\'s three modes; OnRemoveAppointPress; clan_disband; clan_tag; the events\' animations', () => {
    expect(ops('MRosterLeaderStartData')).toEqual(['GetClanRoster(NA)', 'GetLeaderMessages(NA)', 'GetMediusAnnouncements(NA)', 'GetClanRanking(NA)']);
    expect(ops('DoSomething')).toEqual([
      '== NA (1)', 'IF ActivateRosterFrom == 0', 'IF NOT IsLeaderOfClan(INPUT_STRING)', 'CALL_SEQUENCE remove_player', 'DescriptionText.op1(<text 1>)', 'ELSE', 'STOP menu_fade_up',
      'OPACITY MENUFADER 0->0.7 0.05', 'VALVE AreYouReallySure = 0', 'POPUPDIALOG(NA)', 'POPUP <text 60> buttons Continue -> AreYouReallySure', 'WHILE AreYouReallySure == 0', 'END_WHILE',
      'OPACITY MENUFADER 0.7->0 0.05', 'ENDIF', 'ELSEIF ActivateRosterFrom == 1', 'CALL_SEQUENCE appoint_leader', 'DescriptionText.op1(<text 1>)', 'ELSEIF ActivateRosterFrom == 2',
      'CALL playerinfo_activate', 'ENDIF', '== appoint_leader (2)', 'IF NOT IsLeaderOfClan(INPUT_STRING)', 'STOP menu_fade_up', 'OPACITY MENUFADER 0->0.7 0.05', 'VALVE AreYouReallySure = 0',
      'POPUPDIALOG(NA)', 'POPUP #491 buttons #246/#253 -> AreYouReallySure', 'WHILE AreYouReallySure == 0', 'END_WHILE', 'IF AreYouReallySure == 2', 'TransferLeadership(INPUT_STRING)',
      'KillPopUp(NA)', 'OPACITY MENUFADER 0.7->0 0.05', 'ELSE', 'POPUPDIALOG(NA)', 'POPUP #389', 'ENDIF', 'OPACITY MENUFADER 0.7->0 0.05', 'ENDIF', '== remove_player (2)', 'STOP menu_fade_up',
      'OPACITY MENUFADER 0->0.7 0.05', 'VALVE AreYouReallySure = 0', 'POPUPDIALOG(NA)', 'POPUP #492 buttons #246/#253 -> AreYouReallySure', 'WHILE AreYouReallySure == 0', 'END_WHILE',
      'IF AreYouReallySure == 2', 'RemovePlayerFromClan(NA)', 'KillPopUp(NA)', 'DescriptionText.op1(#493)', 'OPACITY MENUFADER 0.7->0 0.05', 'ELSE', 'POPUPDIALOG(NA)', 'POPUP #389',
      'OPACITY MENUFADER 0.7->0 0.05', 'ENDIF',
    ]);
    expect(ops('OnRemoveAppointPress')).toEqual([
      'ActivateButton(RosterList)', 'EnableButton(RosterList)', 'IF ActivateRosterFrom == 0', 'DescriptionText.op1(#495)', 'ELSEIF ActivateRosterFrom == 1', 'DescriptionText.op1(#496)',
      'ELSEIF ActivateRosterFrom == 2', 'DescriptionText.op1(#472)', 'ENDIF',
    ]);
    expect(ops('clan_disband')).toEqual([
      'STOP menu_fade_up', 'OPACITY MENUFADER 0->0.7 0.05', 'VALVE AreYouReallySure = 0', 'POPUPDIALOG(NA)', 'POPUP #500 buttons #246/#253 -> AreYouReallySure', 'WHILE AreYouReallySure == 0',
      'END_WHILE', 'IF AreYouReallySure == 2', 'DisbandClan(NA)', 'ELSE', 'POPUPDIALOG(NA)', 'POPUP #501', 'ENDIF', 'OPACITY MENUFADER 0.7->0 0.05',
    ]);
    expect(ops('clan_tag')).toEqual([`GetTextInput(${CLAN_DESCRIPTION_VAR})`, 'WHILE skb_done != 1', 'END_WHILE', `NetCensorText(${CLAN_DESCRIPTION_VAR})`, 'WAIT 0.5', 'UpdateClanStats(NA)']);
    expect([ops('disband_success'), ops('disband_failure').slice(-1), ops('OnPlayerLeaderError').slice(-1), ops('OnRosterListScroll')]).toEqual([
      ['STOP menu_fade_up', 'SWITCHMENU(dlgWorldOfSOCOM.rdr)'], ['POPUP INPUT_STRING'], ['POPUP #502'], ['GetClanMemberInfo(INPUT_STRING)'],
    ]);
    expect([ops('OnremoveplayersBtn'), ops('OnappointleaderBtn'), ops('OnViewInfoBtn')].map((a) => a.find((l) => l.startsWith('VALVE ActivateRosterFrom')))).toEqual([
      'VALVE ActivateRosterFrom = 0', 'VALVE ActivateRosterFrom = 1', 'VALVE ActivateRosterFrom = 2',
    ]);
    expect(chapter().edges.filter((e) => !e.endsWith('(library)'))).toEqual([
      'SCREEN BUTTON TRIANGLE goto_menu SWITCHMENU -> dlgWorldOfSOCOM.rdr', 'SCREEN EVENT MP_DISBAND_CLAN_SUCCESS disband_success SWITCHMENU -> dlgWorldOfSOCOM.rdr',
      `SCREEN EVENT MP_LEADERSHIP_TRANSFER_SUCCESS goto_menu SWITCHMENU -> ${MANAGE_ROSTER}`, 'invitedplayers BUTTON CROSS goto_menu SWITCHMENU -> dlgInvitedPlayers.rdr',
      'return BUTTON CROSS check_then_save_and_leave SWITCHMENU -> dlgWorldOfSOCOM.rdr',
    ]);
    expect(chapter().commands.filter((x) => /^(DisbandClan|GetClanMemberInfo|GetClanRanking|GetClanRoster|IsLeaderOfClan|RemovePlayerFromClan|TransferLeadership|UpdateClanStats) /.test(x))).toEqual([
      'DisbandClan FUN_0027a920', 'GetClanMemberInfo FUN_00279a20', 'GetClanRanking FUN_0027a250', 'GetClanRoster FUN_0027a390', 'IsLeaderOfClan FUN_0027a890',
      'RemovePlayerFromClan FUN_0027a840', 'TransferLeadership FUN_00277430', 'UpdateClanStats FUN_00277610',
    ]);
  });

  it('DoSomething\'s two literals: the leader\'s refusal (60 bytes) and its button "Continue", the module\'s text; the help line " "', () => {
    const own = sets().filter((s) => s.name.toLowerCase() === MANAGE_ROSTER_LEADER.toLowerCase());
    const names = own.flatMap((s) => s.anims.filter((a) => a.name === 'DoSomething').flatMap((a) => a.names));
    expect(names.filter((n) => n.length === 60)).toEqual([LEADER_CANNOT_REMOVE_SELF_TEXT]);
    expect(names).toEqual(expect.arrayContaining(['Continue', ' ']));
  });

  it('clan_tag\'s GetTextInput block: MPPLAYERNAME on Clan_Description, titled _499_EnterTextTag_MSG, 3 characters of 15 bytes, no flags', () => {
    const reqs = sets().filter((s) => s.name.toLowerCase() === MANAGE_ROSTER_LEADER.toLowerCase()).flatMap((s) => s.anims.filter((a) => a.name === 'clan_tag').flatMap((a) =>
      a.sequences.flatMap((q) => q.commands.filter((c) => c.set !== 0 && a.names[c.bytes[6]!]?.toLowerCase() === 'gettextinput').map((c) => decodeTextInput(c.bytes, (i) => a.names[i] ?? null)))));
    expect(reqs).toEqual([{
      uiVar: CLAN_DESCRIPTION_VAR, purpose: '_499_EnterTextTag_MSG', msgPlayerTitle: '', action2Title: '', skbName: 'MPPLAYERNAME', uiVar2: '',
      maxBytes: 15, maxChars: 3, maxBytes2: 0, maxChars2: 0, noDQuote: false, allowEmpty: false,
    }]);
  });
});

describe.skipIf(!HAVE_ELF)('the ELF\'s strings and instructions the roster cites (socom2_game.elf)', () => {
  const elf = () => new ElfImage(new Uint8Array(readFileSync(ELF_PATH)));

  it('the names, events, texts and formats at their addresses', () => {
    const e = elf();
    expect([0x3f3930, 0x3f4038, 0x3f3ff8, 0x3f4000, 0x3f4008, 0x3f4010, 0x3f4020, 0x3f4028, 0x3f3ef8].map((va) => e.cstr(va))).toEqual([
      CLAN_ROSTER_VAR, CLAN_RATING_VAR, 'VALUE', ROSTER_ONLINE_GLYPH.offline, ROSTER_ONLINE_GLYPH.online, ROSTER_LEADER_MARK, 'Medius', ROSTER_MAIN_MENU, '%d',
    ]);
    expect([0x3f4518, 0x3f4550, 0x3f4530, 0x3f4568, 0x3f3fe0, 0x3f4190, 0x3f41b0, 0x3f43e0, 0x3f4400, 0x3f3f40, 0x3f3fa0, 0x3f3fc0, 0x3f3f80].map((va) => e.cstr(va))).toEqual([
      'GetMyClans', 'MP_CLAN_DISBANDED', 'MP_MEDIUS_BECAME_LEADER', 'QuitClan', 'MemberListRequest', 'MediusRemovePlayerFromClan', 'MP_SUCCESS', 'TransferClanLeadership',
      'MP_LEADERSHIP_TRANSFER_SUCCESS', 'MediusDisbandClan', 'Clan Disband Error: %s', 'MP_DISBAND_CLAN_FAILURE', 'MP_DISBAND_CLAN_SUCCESS',
    ]);
    expect([0x3f4310, 0x3f4328, 0x3f43a0, 0x3f43b8, 0x3f4460, 0x3f3f60].map((va) => e.cstr(va))).toEqual([
      'clan_icon_%.2d.tif', '%.3d%.12d%s', '#C\x80@ [%s] #C\x80\x80\x80%s', '%s', 'Retrieving messages from server...', 'No clan messages.',
    ]);
  });

  it('FUN_002f4300\'s names: 4 down to 0 at S:0x3f55c0-0x3f5558, -954 down to -1000 at S:0x3f5540-0x3f4fd0, the default at S:0x3f55d0 -- the module\'s table', () => {
    const e = elf();
    const at = [0x3f55c0, 0x3f55a0, 0x3f5580, 0x3f5568, 0x3f5558];
    expect([4, 3, 2, 1, 0].map((s) => mediusStatusText(s))).toEqual(at.map((va) => e.cstr(va)));
    const low = [0x3f5540, 0x3f5528, 0x3f5510, 0x3f54f0, 0x3f54d0, 0x3f54b0, 0x3f5490, 0x3f5470, 0x3f5450, 0x3f5430, 0x3f5410, 0x3f53f0, 0x3f53d8, 0x3f53c0, 0x3f53a0, 0x3f5380,
      0x3f5360, 0x3f5340, 0x3f5320, 0x3f5300, 0x3f52e0, 0x3f52c0, 0x3f52a0, 0x3f5280, 0x3f5260, 0x3f5240, 0x3f5220, 0x3f5200, 0x3f51e0, 0x3f51c0, 0x3f51a0, 0x3f5180, 0x3f5160,
      0x3f5150, 0x3f5140, 0x3f5120, 0x3f5100, 0x3f50f0, 0x3f50d0, 0x3f50b0, 0x3f5090, 0x3f5070, 0x3f5050, 0x3f5030, 0x3f5010, 0x3f4ff0, 0x3f4fd0];
    expect(low.map((_, i) => mediusStatusText(-954 - i))).toEqual(low.map((va) => e.cstr(va)));
    expect(MEDIUS_STATUS_TEXT_UNKNOWN).toBe(e.cstr(0x3f55d0));
  });

  it('the folded rows\' instructions: GetClan a tail jump to 0x2e8a90; RemovePlayerFromClan the input string to 0x2e7450, then 1; TransferLeadership the argument to 0x2e81b0, then 1; DisbandClan 0x2e6850, then 1', () => {
    const e = elf();
    const w = (va: number): number => e.u32(va) >>> 0;
    expect([w(0x27aa60), w(0x27aa64), w(0x27aa68)]).toEqual([0x3c040045, 0x080ba2a4, 0x2484f370]);              // lui a0, 0x45; j 0x2e8a90; addiu a0, a0, -0xc90
    expect([w(0x27a85c), w(0x27a86c), w(0x27a878), w(0x27a87c)]).toEqual([0x0c09c920, 0x0c0b9d14, 0x24020001, 0x03e00008]);   // jal 0x272480; jal 0x2e7450; addiu v0, zero, 1; jr ra
    expect([w(0x277444), w(0x27747c), w(0x277498), w(0x2774a4)]).toEqual([0x0c09bb58, 0x0c09c920, 0x0c0ba06c, 0x24020001]);   // jal 0x26ed60; jal 0x272480; jal 0x2e81b0; addiu v0, zero, 1
    expect([w(0x27a92c), w(0x27a938), w(0x27a93c)]).toEqual([0x0c0b9a14, 0x24020001, 0x03e00008]);              // jal 0x2e6850; addiu v0, zero, 1; jr ra
    expect(e.u32(0x3df298) | 0).toBe(-1);
  });
});
