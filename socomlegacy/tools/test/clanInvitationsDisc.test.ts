import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import {
  INVITED_PLAYERS, INVITED_PLAYERS_VAR, LEADER_CANNOT_JOIN_TEXT, MANAGE_ROSTER_LEADER, MY_CLAN_INVITES_VAR, NO_INVITATIONS_SENT, NO_INVITATIONS_TEXT, PLAYER_INVITE_NAME_VAR,
  RESPOND_TO_INVITES, WORLD_OF_SOCOM, clanInviteText, clanWelcomeText, decodeTextInput,
} from '@s2u/ui';
import { discRoot } from '../dump-dialogs';
import { readChapters } from '../dump-online-dialogs';
import { ElfImage } from '../elfImage';

/**
 * ONL-28's dev-disc check (web research 273 §1, §3): INVITE PLAYERS (`dlgInvitedPlayers.rdr`) and RESPOND TO INVITES
 * (`dlgRespondToInvites.rdr`) read off the disc with the repository's readers (`tools/dump-online-dialogs.ts`'s chapter:
 * the layouts of `RUN/UI/READERC.ZAR`, the sets of `RUN/UIZANIM.ZAR`) -- names, captions' ids and the ops as decoded,
 * no bytes (RS.R8); the one literal the respond set spells (the leader's refusal) held to the module's text:
 * - each page's layout, its bindings, its animations' ops and its edges;
 * - `invite_player`'s `GetTextInput` block (the command's 0xAC bytes, `decodeTextInput`): `MPPLAYERNAME`, titled #394,
 *   14 characters of 31 bytes;
 * - the ELF's strings and data the transcription cites (`S:0x...`), and the two rows with no decompiled block read as
 *   instructions: `ClanHasInvitations` (0x277960 -> 0x2e7290) and `CanInviteMorePlayersToClan` (0x27a830 -> 0x2e5fe0).
 * The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither it skips.
 */
const DISC = discRoot();
const ELF_PATH = DISC ? resolve(DISC, 'socom2_game.elf') : '';
const HAVE_ELF = !!DISC && existsSync(ELF_PATH);

const sets = () => parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UIZANIM.ZAR'))))).sets;

describe.skipIf(!DISC)('INVITE PLAYERS off the disc (dlgInvitedPlayers.rdr)', () => {
  const chapter = () => readChapters(DISC!, [INVITED_PLAYERS])[0]!;
  const ops = (a: string): string[] => chapter().animations[a]!.map((l) => l.trim());

  it('the layout: the title #377, the three column heads #378-#380, the help #381, the rows INVITE PLAYER #382, REVOKE INVITE #383, RETURN #314; the two lists on CLAN_ROSTER and INVITED_PLAYERS', () => {
    const c = chapter();
    const lines = c.widgets.map((w) => `${w.type} ${w.name}${w.caption ? ` ${w.caption}` : ''}${w.uivar ? ` uivar ${w.uivar}` : ''}`);
    expect(lines).toEqual(expect.arrayContaining([
      'TEXT bar_title _377_InvitePlayers_MSG', 'TEXT DescriptionTextCR _378_ClanRoster_MSG', 'TEXT DescriptionTextIP _379_InvitedPlayers_MSG', 'TEXT Category2Text _380_Status_MSG',
      'TEXT DescriptionTextLow _381_SelectRemove_MSG', 'BUTTON invite _382_InvitePlayer_MSG', 'BUTTON RevokeInv _383_RevokeInvite_MSG', 'BUTTON return _314_RETURN_MSG',
      'LISTBOX RosterList uivar CLAN_ROSTER', `LISTBOX Invited Players uivar ${INVITED_PLAYERS_VAR}`, 'TEXT txtClanName uivar CLANNAMEVAR',
    ]));
    expect(c.locs).toEqual([54, 149, 150, 314, 322, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393]);
  });

  it('the bindings: ONSTART OnInvitePlaystart and find_invited_players; the five events\' popups; ON_SKB_APPLY do_invite; MP_CLAN_FULL ClanFullError; the rows\' CROSS', () => {
    const b = chapter().bindings.map((x) => `${x.owner} ${x.trigger} -> ${x.animation}${x.argument !== null ? `(${x.argument})` : ''}`);
    expect(b).toEqual([
      'SCREEN EVENT ONSTART -> net_monitor', 'SCREEN EVENT ONSTART -> OnInvitePlaystart', 'SCREEN EVENT ONSTART -> find_invited_players', 'SCREEN EVENT ONSTART -> ActivateMedalOfMerit',
      'SCREEN BUTTON TRIANGLE -> goto_menu(PREVIOUS_SCREEN)', 'SCREEN EVENT MP_PLAYER_NOT_FOUND -> player_not_found', 'SCREEN EVENT MP_MEDIUS_ERROR -> OnMultiplayerDisconnect',
      'SCREEN EVENT MP_PLAYER_ALREADY_MEMBER -> player_already_member', 'SCREEN EVENT MP_PLAYER_ALREADY_INVITED -> player_already_invited', 'SCREEN EVENT MP_PLAYER_IS_LEADER -> player_is_leader',
      'SCREEN EVENT ON_SKB_APPLY -> do_invite', 'SCREEN EVENT MP_CLAN_FULL -> ClanFullError', 'SCREEN EVENT MP_SYSTEM_MESSAGE -> OnSystemMessage',
      'invite EVENT ONACTIVATE -> OnInvitePlayAct', 'invite BUTTON CROSS -> invite_player', 'RevokeInv EVENT ONACTIVATE -> OnRevokeInvAct', 'RevokeInv BUTTON CROSS -> OnRevokeInvPress',
      'Invited Players BUTTON TRIANGLE -> BackToButtons', 'Invited Players BUTTON CROSS -> revoke_invite', 'return EVENT ONACTIVATE -> ReturnAct', 'return BUTTON CROSS -> goto_menu(PREVIOUS_SCREEN)',
    ]);
  });

  it('the animations\' ops as the set holds them; no edge out but the library\'s (the way back is PREVIOUS_SCREEN)', () => {
    expect(ops('OnInvitePlaystart')).toEqual(['DisableButton(RosterList)', 'DisableButton(<text 15>)', 'IF CanInviteMorePlayersToClan(NA)', 'ELSE', 'CALL ClanFullError', 'ENDIF']);
    expect(ops('find_invited_players')).toEqual(['WHILE forever', 'GetInvitedPlayers(NA)', 'WAIT 2', 'IF CanInviteMorePlayersToClan(NA)', 'EnableButton(invite)', 'ENDIF', 'WAIT 20', 'END_WHILE']);
    expect(ops('invite_player')).toEqual(['IF CanInviteMorePlayersToClan(NA)', `GetTextInput(${PLAYER_INVITE_NAME_VAR})`, 'ELSE', 'CALL ClanFullError', 'ENDIF', 'EnableButton(invite)', 'ActivateButton(invite)']);
    expect(ops('do_invite')).toEqual(['IF CanInviteMorePlayersToClan(NA)', 'InvitePlayerToClan(NA)', 'ELSE', 'CALL ClanFullError', 'ENDIF']);
    expect(ops('ClanFullError')).toEqual([
      'DisableButton(invite)', 'Activatebutton(RevokeInv)', 'STOP menu_fade_up', 'OPACITY MENUFADER 0->0.7 0.05', 'VALVE AreYouReallySure = 0', 'POPUPDIALOG(NA)',
      'POPUP #384 buttons #226 -> AreYouReallySure', 'WHILE AreYouReallySure == 0', 'END_WHILE', 'OPACITY MENUFADER 0.7->0 0.05',
    ]);
    expect(ops('OnRevokeInvPress')).toEqual(['IF ClanHasInvitations(NA)', 'DescriptionTextLow.op1(#386)', 'EnableButton(<text 15>)', 'ActivateButton(<text 15>)', 'ELSE', 'DescriptionTextLow.op1(#387)', 'ENDIF']);
    expect(ops('revoke_invite')).toEqual([
      'IF ClanHasInvitations(NA)', 'STOP menu_fade_up', 'OPACITY MENUFADER 0->0.7 0.05', 'VALVE AreYouReallySure = 0', 'POPUPDIALOG(NA)', 'POPUP #388 buttons #246/#253 -> AreYouReallySure',
      'WHILE AreYouReallySure == 0', 'END_WHILE', 'IF AreYouReallySure == 2', 'RevokeInvite(INPUT_STRING)', 'KillPopUp(NA)', 'EnableButton(invite)', 'ActivateButton(invite)', 'GetInvitedPlayers(NA)',
      'ELSE', 'POPUPDIALOG(NA)', 'POPUP #389', 'ENDIF', 'OPACITY MENUFADER 0.7->0 0.05', 'ENDIF', 'EnableButton(invite)', 'ActivateButton(invite)', 'DisableButton(<text 15>)',
    ]);
    expect(['player_not_found', 'player_already_invited', 'player_already_member', 'player_is_leader'].map((a) => ops(a).find((l) => l.startsWith('POPUP '))))
      .toEqual(['POPUP #390', 'POPUP #391', 'POPUP #392', 'POPUP #393']);
    expect([ops('OnInvitePlayAct'), ops('OnRevokeInvAct'), ops('ReturnAct')]).toEqual([['DescriptionTextLow.op1(#385)'], ['DescriptionTextLow.op1(#386)'], ['DescriptionTextLow.op1(#322)']]);
    const c = chapter();
    expect(c.edges.filter((e) => !e.endsWith('(library)'))).toEqual([]);
    expect(c.commands.filter((x) => /^(CanInviteMorePlayersToClan|ClanHasInvitations|GetInvitedPlayers|InvitePlayerToClan|RevokeInvite) /.test(x))).toEqual([
      'CanInviteMorePlayersToClan FUN_0027a830', 'ClanHasInvitations FUN_00277960', 'GetInvitedPlayers FUN_0027a3f0', 'InvitePlayerToClan FUN_0027a740', 'RevokeInvite FUN_0027a310',
    ]);
  });

  it('the list the scripts name "Invited Players" (<text 15>, a name with a space) is the LISTBOX of that name', () => {
    const own = sets().filter((s) => s.name.toLowerCase() === INVITED_PLAYERS.toLowerCase());
    expect(own.flatMap((s) => s.anims.flatMap((a) => a.names.filter((n) => n.includes(' ')))).filter((n, i, all) => all.indexOf(n) === i)).toEqual(['Invited Players']);
  });

  it('invite_player\'s GetTextInput block: MPPLAYERNAME on PLAYER_INVITE_NAME, titled _394_EnterInvite_MSG, 14 characters of 31 bytes, no flags', () => {
    const reqs = sets().filter((s) => s.name.toLowerCase() === INVITED_PLAYERS.toLowerCase()).flatMap((s) => s.anims.filter((a) => a.name === 'invite_player').flatMap((a) =>
      a.sequences.flatMap((q) => q.commands.filter((c) => c.set !== 0 && a.names[c.bytes[6]!]?.toLowerCase() === 'gettextinput').map((c) => decodeTextInput(c.bytes, (i) => a.names[i] ?? null)))));
    expect(reqs).toEqual([{
      uiVar: PLAYER_INVITE_NAME_VAR, purpose: '_394_EnterInvite_MSG', msgPlayerTitle: '', action2Title: '', skbName: 'MPPLAYERNAME', uiVar2: '',
      maxBytes: 31, maxChars: 14, maxBytes2: 0, maxChars2: 0, noDQuote: false, allowEmpty: false,
    }]);
  });

  it('the leader\'s roster reaches it: dlgManageRosterLeader\'s INVITATIONS row (#476) is goto_menu(dlgInvitedPlayers.rdr)', () => {
    const roster = readChapters(DISC!, [MANAGE_ROSTER_LEADER])[0]!;
    expect(roster.bindings.map((x) => `${x.owner} ${x.trigger} -> ${x.animation}${x.argument !== null ? `(${x.argument})` : ''}`)).toContain(`invitedplayers BUTTON CROSS -> goto_menu(${INVITED_PLAYERS})`);
    expect(roster.widgets.find((w) => w.name === 'invitedplayers')?.caption).toBe('_476_INVITATIONS_MSG');
  });
});

describe.skipIf(!DISC)('RESPOND TO INVITES off the disc (dlgRespondToInvites.rdr)', () => {
  const chapter = () => readChapters(DISC!, [RESPOND_TO_INVITES])[0]!;
  const ops = (a: string): string[] => chapter().animations[a]!.map((l) => l.trim());

  it('the layout: the title #724, the column heads #380 and #725, the rows ACCEPT #726, DECLINE #727, LEAVE CLAN #459, RETURN #67; the list on MY_CLAN_INVITES', () => {
    const c = chapter();
    const lines = c.widgets.map((w) => `${w.type} ${w.name}${w.caption ? ` ${w.caption}` : ''}${w.uivar ? ` uivar ${w.uivar}` : ''}`);
    expect(lines).toEqual(expect.arrayContaining([
      'TEXT bar_title _724_RespondToInvites_MSG', 'TEXT CategoryText2 _380_Status_MSG', 'TEXT CategoryText3 _725_ClanInvitation_MSG', 'BUTTON Accept _726_ACCEPT_MSG',
      'BUTTON Decline _727_DECLINE_MSG', 'BUTTON LeaveClan _459_LeaveClan_MSG', 'BUTTON return _67_RETURN_MSG', `LISTBOX Invitations uivar ${MY_CLAN_INVITES_VAR}`,
    ]));
    expect(c.widgets.filter((w) => w.type === 'BUTTON').map((w) => w.name)).toEqual(['Accept', 'Decline', 'LeaveClan', 'return']);
    expect(c.locs).toEqual([54, 67, 149, 150, 322, 380, 459, 468, 474, 724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 736]);
  });

  it('the bindings: ONSTART OnRespondStart and find_invited_players; each row\'s ONACTIVATE and CROSS; the list\'s CROSS Accept_invite and TRIANGLE OnRespondStart', () => {
    const b = chapter().bindings.map((x) => `${x.owner} ${x.trigger} -> ${x.animation}${x.argument !== null ? `(${x.argument})` : ''}`);
    expect(b).toEqual([
      'SCREEN EVENT ONSTART -> net_monitor', 'SCREEN EVENT ONSTART -> OnRespondStart', 'SCREEN EVENT ONSTART -> ActivateMedalOfMerit', 'SCREEN BUTTON TRIANGLE -> goto_menu(PREVIOUS_SCREEN)',
      'SCREEN EVENT ONSTART -> find_invited_players', 'SCREEN EVENT MP_MEDIUS_ERROR -> OnMultiplayerDisconnect', 'SCREEN EVENT MP_SYSTEM_MESSAGE -> OnSystemMessage',
      'Accept EVENT ONACTIVATE -> OnAcceptAct', 'Accept BUTTON CROSS -> OnAcceptPress', 'Decline EVENT ONACTIVATE -> OnDeclineAct', 'Decline BUTTON CROSS -> OnDeclinePress',
      'LeaveClan EVENT ONACTIVATE -> OnLeaveClanAct', 'LeaveClan BUTTON CROSS -> leave_clan', 'return EVENT ONACTIVATE -> ReturnAct', 'return BUTTON CROSS -> check_then_save_and_leave',
      'Invitations BUTTON TRIANGLE -> OnRespondStart', 'Invitations BUTTON CROSS -> Accept_invite',
    ]);
  });

  it('the animations\' ops: OnRespondStart by IsLeaderOfClan / IsMemberOfClan; Accept_invite\'s three cases and the decline; the two edges to SOCOM II ONLINE', () => {
    expect(ops('OnRespondStart')).toEqual([
      'IF IsLeaderOfClan(NA)', 'HIDE LeaveClan', 'DisableButton(LeaveClan)', 'ELSEIF IsMemberOfClan(NA)', 'EnableButton(LeaveClan)', 'ActivateButton(LeaveClan)', 'ELSE', 'DisableButton(LeaveClan)', 'ENDIF',
      'ActivateButton(Accept)', 'DisableButton(Invitations)',
    ]);
    expect(ops('Accept_invite')).toEqual([
      'IF AcceptOrDecline == 0', 'IF IsLeaderOfClan(NA)', 'VALVE AlreadyOnAClan = 0', 'POPUPDIALOG(NA)', 'POPUP <text 149> buttons none -> AlreadyOnAclan', 'WHILE AlreadyOnAclan == 0', 'END_WHILE',
      'ELSEIF IsMemberOfClan(NA)', 'VALVE AlreadyOnAclan = 0', 'POPUPDIALOG(NA)', 'POPUP #732 buttons none -> AlreadyOnAclan', 'WHILE AlreadyOnAclan == 0', 'END_WHILE', 'ActivateButton(LeaveClan)',
      'EnableButton(LeaveClan)', 'DisableButton(Invitations)', 'CALL OnRespondStart', 'ELSE', 'VALVE ContinueValve = 0', 'AcceptInvitation(INPUT_STRING)', 'DescriptionText.op1(#733)', 'WAIT 1',
      'POPUPDIALOG(NA)', 'POPUP #734 buttons none -> ContinueValve', 'WHILE ContinueValve == 0', 'END_WHILE', 'VALVE ContinueValve = 0', 'KillPopup(NA)', 'STOP menu_fade_up',
      `SWITCHMENU(${WORLD_OF_SOCOM})`, 'ENDIF', 'ELSE', 'DescriptionText.op1(#735)', 'DeclineInvitation(INPUT_STRING)', 'WAIT 1', 'ActivateButton(Decline)', 'DisableButton(Invitations)', 'ENDIF',
    ]);
    expect(ops('find_invited_players')).toEqual(['WHILE forever', 'CheckMyInvites(NA)', 'WAIT 30', 'END_WHILE']);
    expect([ops('OnAcceptAct'), ops('OnDeclineAct')]).toEqual([['VALVE AcceptOrDecline = 0', 'DescriptionText.op1(#728)'], ['VALVE AcceptOrDecline = 1', 'DescriptionText.op1(#729)']]);
    expect([ops('OnAcceptPress'), ops('OnDeclinePress')]).toEqual([
      ['IF HasClanInvitations(NA)', 'ActivateButton(Invitations)', 'EnableButton(Invitations)', 'DescriptionText.op1(#730)', 'ENDIF'],
      ['IF HasClanInvitations(NA)', 'ActivateButton(Invitations)', 'EnableButton(Invitations)', 'DescriptionText.op1(#731)', 'ENDIF'],
    ]);
    expect(ops('check_then_save_and_leave')).toEqual([`SWITCHMENU(${WORLD_OF_SOCOM})`]);
    expect(ops('leave_clan')).toContain('QuitClan(NA)');
    const c = chapter();
    expect(c.edges.filter((e) => !e.endsWith('(library)'))).toEqual([
      `Invitations BUTTON CROSS Accept_invite SWITCHMENU -> ${WORLD_OF_SOCOM}`, `return BUTTON CROSS check_then_save_and_leave SWITCHMENU -> ${WORLD_OF_SOCOM}`,
    ]);
    expect(c.commands.filter((x) => /^(AcceptInvitation|DeclineInvitation|QuitClan) /.test(x))).toEqual(['AcceptInvitation FUN_00277550', 'DeclineInvitation FUN_002774c0', 'QuitClan FUN_00278d00']);
  });

  it('the leader\'s refusal is the set\'s own literal (149 bytes), the module\'s LEADER_CANNOT_JOIN_TEXT', () => {
    const own = sets().filter((s) => s.name.toLowerCase() === RESPOND_TO_INVITES.toLowerCase());
    const texts = own.flatMap((s) => s.anims.filter((a) => a.name === 'Accept_invite').flatMap((a) => a.names.filter((n) => n.length === 149)));
    expect(texts).toEqual([LEADER_CANNOT_JOIN_TEXT]);
  });

  it('SOCOM II ONLINE reaches it: the INVITATIONS row\'s CROSS is Goto_Invites -- StartMusic 1, SwitchMenu(dlgRespondToInvites.rdr)', () => {
    const world = readChapters(DISC!, [WORLD_OF_SOCOM])[0]!;
    expect(world.animations['Goto_Invites']!.map((l) => l.trim())).toEqual(['VALVE StartMusic = 1', `SwitchMenu(${RESPOND_TO_INVITES})`]);
    expect(world.bindings.map((x) => `${x.owner} ${x.trigger} -> ${x.animation}`)).toContain('invitations BUTTON CROSS -> Goto_Invites');
  });
});

describe.skipIf(!HAVE_ELF)('the ELF\'s strings, data and instructions the invitations cite (socom2_game.elf)', () => {
  const elf = () => new ElfImage(new Uint8Array(readFileSync(ELF_PATH)));

  it('the names, events, texts and formats at their addresses', () => {
    const e = elf();
    expect([0x3eee50, 0x3f3920, 0x3f3940, 0x3f40d0, 0x3f44e8, 0x3ee898, 0x3f4220, 0x3f4070, 0x3f4090, 0x3f40b0, 0x3f40a0, 0x3f40c0].map((va) => e.cstr(va))).toEqual([
      PLAYER_INVITE_NAME_VAR, INVITED_PLAYERS_VAR, MY_CLAN_INVITES_VAR, NO_INVITATIONS_SENT, NO_INVITATIONS_TEXT, 'INPUT_STRING', 'Clan %s invites you to join.', 'Everyon Welcome %s to the clan',
      'Undecided', 'Accepted', 'Declined', 'Unknown',
    ]);
    expect([clanInviteText('%s'), clanWelcomeText('%s')]).toEqual([e.cstr(0x3f4220), e.cstr(0x3f4070)]);
    expect([0x3f4130, 0x3f4170, 0x3f41c0, 0x3f41e0, 0x3f4268].map((va) => e.cstr(va))).toEqual([
      'MP_PLAYER_NOT_FOUND', 'MP_PLAYER_IS_LEADER', 'MP_PLAYER_ALREADY_MEMBER', 'MP_PLAYER_ALREADY_INVITED', 'MP_CLAN_FULL',
    ]);
    expect([0x3f4200, 0x3f4240, 0x3f4150, 0x3f4050, 0x3f4110, 0x3f40f0, 0x3f4500].map((va) => e.cstr(va))).toEqual([
      'MediusGetPlayerForInvitation', 'MediusInvitePlayerToClanInvitation', 'MediusRevokePlayerInvitation', 'MediusGetClanInvitationsSent', 'MediusAddPlayerToClan',
      'ClanInviteRevokeHack', 'RespondToClanInvitation',
    ]);
  });

  it('ClanHasInvitations (0x277960 -> 0x2e7290): the sent count 0x44f724 not 0; CanInviteMorePlayersToClan (0x27a830 -> 0x2e5fe0): 0x44f744 + 0x44f724 < 16; the lists and the invite\'s state in the BSS', () => {
    const e = elf();
    const words = (va: number, n: number): number[] => Array.from({ length: n }, (_, i) => e.u32(va + 4 * i) >>> 0);
    expect(words(0x277960, 3)).toEqual([0x3c040045, 0x080b9ca4, 0x2484f370]);                          // lui a0, 0x45; j 0x2e7290; addiu a0, a0, -0xc90
    expect(words(0x2e7290, 4)).toEqual([0x3c010045, 0x8c22f724, 0x03e00008, 0x0002102b]);              // lui at; lw v0, -0x8dc(at); jr ra; sltu v0, zero, v0
    expect(words(0x27a830, 3)).toEqual([0x3c040045, 0x080b97f8, 0x2484f370]);                          // lui a0, 0x45; j 0x2e5fe0; addiu a0, a0, -0xc90
    expect(words(0x2e5fe0, 7)).toEqual([0x3c010045, 0x8c23f744, 0x3c010045, 0x8c22f724, 0x00621021, 0x03e00008, 0x28420010]);   // ...; addu v0, v1, v0; jr ra; slti v0, v0, 16
    for (const va of [0x44f724, 0x44f744, 0x44f798, 0x44f444]) expect(e.offsetOf(va), va.toString(16)).toBeNull();
  });
});
