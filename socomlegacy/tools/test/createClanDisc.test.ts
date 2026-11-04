import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { CLAN_DESCRIPTION_VAR, CLAN_NAME_VAR, CREATE_CLAN, MANAGE_ROSTER_LEADER, UNAFFILIATED, decodeTextInput } from '@s2u/ui';
import { discRoot } from '../dump-dialogs';
import { readChapters } from '../dump-online-dialogs';
import { ElfImage } from '../elfImage';

/**
 * ONL-26's dev-disc check (web research 271 §1-§2): CREATE CLAN (`dlgCreateClan.rdr`) read off the disc with the
 * repository's readers (`tools/dump-online-dialogs.ts`'s chapter: the layout of `RUN/UI/READERC.ZAR`, the set of
 * `RUN/UIZANIM.ZAR`) -- names, captions' ids and the ops as decoded, no bytes (RS.R8):
 * - the layout's rows and texts, the screen's bindings (ONSTART `disable_create_button`, TRIANGLE back, the three
 *   events MP_CREATE_CLAN_SUCCESS / MP_CREATE_CLAN_FAILURE / MP_FILTER_FAILURE, ON_SKB_APPLY) and the two rows' CROSS;
 * - each animation's ops as the set holds them, and the one edge out, to the leader's roster;
 * - `SetVariable`'s `GetTextInput` block (the command's 0xAC bytes, `decodeTextInput`): `MPPLAYERNAME`, titled #224, 13
 *   characters of 31 bytes, no flags -- the cap the page's keyboard applies;
 * - the ELF's strings and data the transcription cites (`S:0x...`; 0x3df298's -1, 0x44f770 in the BSS).
 * The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither it skips.
 */
const DISC = discRoot();
const ELF_PATH = DISC ? resolve(DISC, 'socom2_game.elf') : '';
const HAVE_ELF = !!DISC && existsSync(ELF_PATH);

describe.skipIf(!DISC)('CREATE CLAN off the disc (dlgCreateClan.rdr)', () => {
  const chapter = () => readChapters(DISC!, [CREATE_CLAN])[0]!;

  it('the layout: the title #217, the description #218, the name\'s text on CLANNAMEVAR, the rows SET CLAN NAME #219 and CREATE CLAN #220', () => {
    const c = chapter();
    const lines = c.widgets.map((w) => `${w.type} ${w.name}${w.caption ? ` ${w.caption}` : ''}${w.uivar ? ` uivar ${w.uivar}` : ''}`);
    expect(lines).toEqual(expect.arrayContaining([
      'TEXT bar_title _217_CreateClan_MSG', 'WRAPPEDTEXT DescriptionText _218_CreatingClanDescr_MSG', `TEXT txtClanName uivar ${CLAN_NAME_VAR}`,
      'BUTTON claname _219_SetClanName_MSG', 'BUTTON createClan _220_CreateClan_MSG', 'WRAPPEDTEXT playername uivar PLAYER_NAME_AND_TAG',
    ]));
    expect(c.widgets.filter((w) => w.type === 'BUTTON').map((w) => w.name)).toEqual(['claname', 'createClan']);
    expect(c.locs).toEqual([149, 150, 217, 218, 219, 220, 221, 222, 223, 225]);
  });

  it('the bindings: ONSTART disables CREATE CLAN; the three answers\' events and ON_SKB_APPLY; each row\'s ONACTIVATE and CROSS', () => {
    const b = chapter().bindings.map((x) => `${x.owner} ${x.trigger} -> ${x.animation}${x.argument !== null ? `(${x.argument})` : ''}`);
    expect(b).toEqual([
      'SCREEN EVENT ONSTART -> net_monitor', 'SCREEN EVENT ONSTART -> disable_create_button', 'SCREEN EVENT ONSTART -> ActivateMedalOfMerit',
      'SCREEN BUTTON TRIANGLE -> goto_menu(PREVIOUS_SCREEN)', `SCREEN EVENT MP_CREATE_CLAN_SUCCESS -> goto_menu(${MANAGE_ROSTER_LEADER})`,
      'SCREEN EVENT MP_CREATE_CLAN_FAILURE -> create_clan_failure', 'SCREEN EVENT MP_FILTER_FAILURE -> OnFilterFailure', 'SCREEN EVENT MP_MEDIUS_ERROR -> OnMultiplayerDisconnect',
      'SCREEN EVENT ON_SKB_APPLY -> enable_create_button', 'SCREEN EVENT MP_SYSTEM_MESSAGE -> OnSystemMessage',
      'claname EVENT ONACTIVATE -> OnClanNameAct', `claname BUTTON CROSS -> SetVariable(${CLAN_NAME_VAR})`,
      'createClan EVENT ONACTIVATE -> OncreateClanAct', 'createClan BUTTON CROSS -> CreateClan',
    ]);
  });

  it('the animations\' ops as the set holds them; the one edge out is the success\'s, to the leader\'s roster', () => {
    const c = chapter();
    const ops = (a: string): string[] => c.animations[a]!.map((l) => l.trim());
    expect(ops('disable_create_button')).toEqual(['DisableButton(createClan)']);
    expect(ops('enable_create_button')).toEqual([
      'PruneUIVarSpaces(CLANNAMEVAR)', 'IF TestUIVar(CLANNAMEVAR)', 'EnableButton(createClan)', 'ELSE', 'DisableButton(createClan)', 'ENDIF',
    ]);
    expect(ops('SetVariable')).toEqual(['STOP menu_fade_up', 'SOUND .DINK', 'GetTextInput($1)']);
    expect(ops('CreateClan')).toEqual(['SOUND .DINK', 'PruneUIVarSpaces(CLANNAMEVAR)', 'CreateClan(NA)']);
    expect(ops('create_clan_failure')).toEqual(['POPUPDIALOG(NA)', 'POPUP #223 buttons none -> ConfirmPopup', 'WHILE ConfirmPopup == 0', 'END_WHILE', 'ActivateButton(claname)']);
    expect(ops('OnFilterFailure')).toEqual([
      'VALVE ConfirmPopup = 0', 'POPUPDIALOG(NA)', 'POPUP #225 buttons #226 -> ConfirmPopup', 'WHILE ConfirmPopup == 0', 'END_WHILE', 'ActivateButton(claname)',
    ]);
    expect([ops('OnClanNameAct'), ops('OncreateClanAct')]).toEqual([['DescriptionText.op1(#222)'], ['DescriptionText.op1(#221)']]);
    expect(ops('SetFromValve')).toEqual(['VALVE uiRosterReturnScreen = 1']);                // in the set, bound by no record
    expect(c.edges.filter((e) => !e.endsWith('(library)'))).toEqual([`SCREEN EVENT MP_CREATE_CLAN_SUCCESS goto_menu SWITCHMENU -> ${MANAGE_ROSTER_LEADER}`]);
    expect(c.commands.filter((x) => /^(CreateClan|GetTextInput|PruneUIVarSpaces|TestUIVar) /.test(x))).toEqual([
      'CreateClan FUN_0027a950', 'GetTextInput FUN_002808d0', 'PruneUIVarSpaces FUN_00278370', 'TestUIVar FUN_00278200',
    ]);
  });

  it('SetVariable\'s GetTextInput block: MPPLAYERNAME, titled _224_CreateClanName_MSG, 13 characters of 31 bytes, no recipient, no flags', () => {
    const sets = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UIZANIM.ZAR'))))).sets;
    const reqs = sets.filter((s) => s.name.toLowerCase() === CREATE_CLAN.toLowerCase()).flatMap((s) => s.anims.filter((a) => a.name === 'SetVariable').flatMap((a) =>
      a.sequences.flatMap((q) => q.commands.filter((c) => c.set !== 0 && a.names[c.bytes[6]!]?.toLowerCase() === 'gettextinput').map((c) => decodeTextInput(c.bytes, (i) => a.names[i] ?? null)))));
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toEqual({
      uiVar: '$1', purpose: '_224_CreateClanName_MSG', msgPlayerTitle: '', action2Title: '', skbName: 'MPPLAYERNAME', uiVar2: '',
      maxBytes: 31, maxChars: 13, maxBytes2: 0, maxChars2: 0, noDQuote: false, allowEmpty: false,
    });
  });
});

describe.skipIf(!HAVE_ELF)('the ELF\'s strings and data the create cites (socom2_game.elf)', () => {
  it('the names, texts and formats at their addresses; 0x3df298 -1 in the data; 0x44f770, 0x44f5c4 and 0x44f59c in the BSS', () => {
    const elf = new ElfImage(new Uint8Array(readFileSync(ELF_PATH)));
    expect([0x3eee68, 0x3f42f0, 0x3f4298, 0x3f3f18, 0x3f3f38, 0x3f42b0, 0x3f4280, 0x3f4340, 0x3f42d0, 0x3f4360, 0x3f4380, 0x3f43b8, 0x3f4310, 0x3f4328].map((va) => elf.cstr(va))).toEqual([
      CLAN_NAME_VAR, CLAN_DESCRIPTION_VAR, UNAFFILIATED, ' ', '', 'MediusCreateClan', 'MP_FILTER_FAILURE', 'MP_CREATE_CLAN_FAILURE', 'MP_CREATE_CLAN_SUCCESS',
      'MediusUpdateClanStats', 'PLAYER_NAME_AND_TAG', '%s', 'clan_icon_%.2d.tif', '%.3d%.12d%s',
    ]);
    expect(elf.cstr(0x3f43a0)).toBe('#C\x80\x40\x20[%s] #C\x80\x80\x80%s');
    expect(elf.u32(0x3df298) | 0).toBe(-1);
    for (const va of [0x44f770, 0x44f5c4, 0x44f59c]) expect(elf.offsetOf(va), va.toString(16)).toBeNull();
  });
});
