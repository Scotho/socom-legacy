import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { locTable, parseAnimSets, readLocArchive } from '@s2u/scene';
import {
  CLAN_LEADER_MESSAGES_VAR, CLAN_MESSAGES_RETRIEVING, CLAN_MESSAGE_SEPARATOR, MANAGE_ROSTER_LEADER, MEDIUS_CLAN_MESSAGES_VAR, NO_CLAN_MESSAGES, SEND_CLAN_MESSAGE_VAR, WORLD_OF_SOCOM,
  decodeTextInput, loadDialog, type DialogDesign,
} from '@s2u/ui';
import { discRoot } from '../dump-dialogs';
import { readChapters } from '../dump-online-dialogs';
import { ElfImage } from '../elfImage';
import { ONLINE_DIALOGS } from '../onlineDialogs';

/**
 * ONL-29's dev-disc check (web research 274 §1-§3): the MESSAGES band of SOCOM II ONLINE (`dlgWorldOfSOCOM.rdr`), the
 * leader's EDIT NEWS (`dlgManageRosterLeader.rdr`) and the member's roster's request (`dlgManageRoster.rdr`) read off the
 * disc with the repository's readers (`tools/dump-online-dialogs.ts`'s chapter: the layouts of `RUN/UI/READERC.ZAR`, the
 * sets of `RUN/UIZANIM.ZAR`), the captions through `UIMNLOC` -- names, ids and the ops as decoded, no bytes (RS.R8):
 * - the band's three widgets under `motd`, MESSAGES' ONACTIVATE showing it; no row of the chapter asks the band;
 * - the leader's page: EDIT NEWS and the list on ClanLeaderMessages, their bindings, the animations' ops, the events'
 *   popups #503 / #504; the member's roster's ONSTART asking GetClanMessages;
 * - `SendClanMessage`'s `GetTextInput` block (`decodeTextInput`): `ChatSkb` on SEND_CLAN_MESSAGE, titled #497, 199
 *   characters of 199 bytes -- the keyboard's cap the roadmap left unknown;
 * - the command `SendClanMessage` (`FUN_002797f0`) bound by no dialog of the online chapter;
 * - the ELF's strings and data the transcription cites (`S:0x...`; the leader's kept list 0x44f760 in the BSS).
 * The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither it skips.
 */
const DISC = discRoot();
const ELF_PATH = DISC ? resolve(DISC, 'socom2_game.elf') : '';
const HAVE_ELF = !!DISC && existsSync(ELF_PATH);
const MANAGE_ROSTER = 'dlgManageRoster.rdr';

/** A dialog of `RUN/UI/READERC.ZAR` through the repository's readers (`parseRdr`, `loadDialog`). */
const readDesign = (disc: string, name: string): DialogDesign => {
  const z = Zar.parse(new Uint8Array(readFileSync(resolve(disc, 'RUN/UI/READERC.ZAR'))));
  const key = z.root.children.find((k) => k.name.toLowerCase() === name.toLowerCase());
  if (!key) throw new Error(`READERC.ZAR has no ${name}`);
  return loadDialog(parseRdr(z.data(key)));
};
const line = (w: { type: string; name: string; parent?: string; caption?: string; uivar?: string }): string =>
  `${w.type} ${w.name}${w.parent ? ` childof ${w.parent}` : ''}${w.caption ? ` ${w.caption}` : ''}${w.uivar ? ` uivar ${w.uivar}` : ''}`;
const binding = (x: { owner: string; trigger: string; animation: string; argument: string | null }): string =>
  `${x.owner} ${x.trigger} -> ${x.animation}${x.argument !== null ? `(${x.argument})` : ''}`;

describe.skipIf(!DISC)('the MESSAGES band off the disc (dlgWorldOfSOCOM.rdr)', () => {
  const chapter = () => readChapters(DISC!, [WORLD_OF_SOCOM])[0]!;

  it('the band: under motd, ClanMessages on MEDIUS_CLAN_MESSAGES, DescFieldMid and ClanMessageText #775; MESSAGES #776 shows motd (OnNewsbtn)', () => {
    const c = chapter();
    expect(c.widgets.map(line)).toEqual(expect.arrayContaining([
      'WRAPPEDTEXT motd uivar MEDIUS_MOTD', `WRAPPEDTEXT ClanMessages childof motd uivar ${MEDIUS_CLAN_MESSAGES_VAR}`, 'IMAGE DescFieldMid childof motd',
      'TEXT ClanMessageText childof motd _775_ClanMessages_MSG', 'BUTTON newsandmessages _776_MESSAGES_MSG',
    ]));
    expect(c.bindings.map(binding)).toContain('newsandmessages EVENT ONACTIVATE -> OnNewsbtn');
    expect(c.animations['OnNewsbtn']!.map((l) => l.trim())).toEqual(expect.arrayContaining(['DescriptionText.op1(#781)', 'SHOW motd']));
    expect(c.uivars).toContain(MEDIUS_CLAN_MESSAGES_VAR);
    expect(c.locs).toEqual(expect.arrayContaining([775, 776, 781]));
  });

  it('no row of SOCOM II ONLINE asks the band: init_screen ends on GetClan (the GetMyClans that sends GetMyClanMessages)', () => {
    const c = chapter();
    expect(c.commands.filter((x) => /ClanMessage|LeaderMessages/.test(x))).toEqual([]);
    expect(c.animations['init_screen']!.map((l) => l.trim()).filter((l) => /\(NA\)$/.test(l) && !l.startsWith('ROOMLIST'))).toEqual([
      'GetMediusAnnouncements(NA)', 'CheckMyInvites(NA)', 'GetClan(NA)',
    ]);
  });
});

describe.skipIf(!DISC)('the leader\'s EDIT NEWS off the disc (dlgManageRosterLeader.rdr) and the member\'s roster (dlgManageRoster.rdr)', () => {
  const leader = () => readChapters(DISC!, [MANAGE_ROSTER_LEADER])[0]!;
  const ops = (a: string): string[] => leader().animations[a]!.map((l) => l.trim());

  it('the layout: EDIT NEWS #475, the list ClanMessageList on ClanLeaderMessages, motd on MEDIUS_MOTD; the captions #485, #498, #503, #504 (not #497: the keyboard\'s block names it)', () => {
    const c = leader();
    expect(c.widgets.map(line)).toEqual(expect.arrayContaining([
      'BUTTON EditNews _475_EditNews_MSG', `LISTBOX ClanMessageList uivar ${CLAN_LEADER_MESSAGES_VAR}`, 'WRAPPEDTEXT motd uivar MEDIUS_MOTD',
    ]));
    expect(c.locs).toEqual(expect.arrayContaining([475, 485, 498, 503, 504]));
    expect(c.locs).not.toContain(497);
    expect(c.uivars).toEqual(expect.arrayContaining([CLAN_LEADER_MESSAGES_VAR, SEND_CLAN_MESSAGE_VAR]));
  });

  it('the bindings: EDIT NEWS\' ONACTIVATE and CROSS; the list\'s CROSS, TRIANGLE and CIRCLE; the two events\' popups', () => {
    expect(leader().bindings.map(binding)).toEqual(expect.arrayContaining([
      'EditNews EVENT ONACTIVATE -> OnEditNewsBtn', 'EditNews BUTTON CROSS -> OnEditNewsPress', 'ClanMessageList BUTTON CROSS -> SendClanMessage',
      'ClanMessageList BUTTON TRIANGLE -> OnMRosterLeaderStart', 'ClanMessageList BUTTON CIRCLE -> DeleteClanMessage',
      'SCREEN EVENT CLAN_MESSAGE_ID_ERR -> ClanMessageIDErr', 'SCREEN EVENT CLAN_MESSAGE_EMPTY -> ClanMessageEmpty', 'SCREEN EVENT ONSTART -> MRosterLeaderStartData',
    ]));
  });

  it('the animations\' ops as the set holds them', () => {
    expect(ops('MRosterLeaderStartData')).toEqual(['GetClanRoster(NA)', 'GetLeaderMessages(NA)', 'GetMediusAnnouncements(NA)', 'GetClanRanking(NA)']);
    expect(ops('OnEditNewsBtn')).toEqual(expect.arrayContaining(['DescriptionText.op1(#485)', 'SHOW motd', 'SHOW ClanMessageList', 'DisableButton(ClanMessageList)']));
    expect(ops('OnEditNewsPress')).toEqual(['EnableButton(ClanMessageList)', 'ActivateButton(ClanMessageList)', 'DescriptionText.op1(#498)']);
    expect(ops('SendClanMessage')).toEqual([
      'STOP menu_fade_up', `ClearUIVar(${SEND_CLAN_MESSAGE_VAR})`, `GetTextInput(${SEND_CLAN_MESSAGE_VAR})`, 'WHILE skb_done != 1', 'END_WHILE', 'ModifyClanMessage(INPUT_STRING)',
    ]);
    expect(ops('DeleteClanMessage')).toEqual(['DeleteClanMessage(INPUT_STRING)']);
    expect([ops('ClanMessageIDErr'), ops('ClanMessageEmpty')].map((a) => a.find((l) => l.startsWith('POPUP ')))).toEqual(['POPUP #503', 'POPUP #504']);
    expect(leader().commands.filter((x) => /ClanMessage|LeaderMessages/.test(x))).toEqual([
      'DeleteClanMessage FUN_0027a1c0', 'GetLeaderMessages FUN_0027a0b0', 'ModifyClanMessage FUN_0027a0e0',
    ]);
  });

  it('NU-13: ClanMessageList as laid out -- (180, 183), 447 x 270, SPACING 17, SCALE 0.8, TOP_MARGIN 25, LEFT_MARGIN 10, HIGHLIGHT_OFFSET -6; the id (-300), the message (WRAPPED_TEXT 90, TOP_OFFSET 3, MAXWIDTH 330), "Message n:" (0); no OPTIONS', () => {
    const list = readDesign(DISC!, MANAGE_ROSTER_LEADER).controls.find((c) => c.name === 'ClanMessageList')!;
    const w = list.widget;
    if (w.type !== 'LISTBOX') throw new Error(`ClanMessageList is ${w.type}`);
    expect([list.x, list.y, w.image.size, w.spacing, w.scale, w.topMargin, w.leftMargin, w.highlightOffset, w.options.length]).toEqual([
      180, 183, [447, 270], 17, Math.fround(0.8), 25, 10, -6, 0,
    ]);
    expect(w.columns.map((c) => [c.kind, c.position, c.topOffset, c.maxWidth, c.rightJustified, c.scale])).toEqual([
      [1, -300, 0, 1000, false, 0], [3, 90, 3, 330, false, 0], [1, 0, 0, 1000, false, 0],
    ]);
  });

  it('NU-13: the news band above the list -- motd, a WRAPPEDTEXT on MEDIUS_MOTD at (195, 153), WIDTH 370, SPACING 18, HEIGHT 54, SCALE 0.8 (OnEditNewsBtn SHOWs it)', () => {
    const motd = readDesign(DISC!, MANAGE_ROSTER_LEADER).controls.find((c) => c.name === 'motd')!;
    const w = motd.widget;
    if (w.type !== 'WRAPPEDTEXT') throw new Error(`motd is ${w.type}`);
    expect([motd.x, motd.y, motd.childOf, w.uivar?.name, w.width, w.spacing, w.height, w.text.scale]).toEqual([195, 153, null, 'MEDIUS_MOTD', 370, 18, 54, Math.fround(0.8)]);
    expect(ops('OnEditNewsBtn')).toContain('SHOW motd');
  });

  it('NU-13: ClanMessageList is the one LISTBOX of both dialog archives with a WRAPPED_TEXT column (the shared draw reaches EDIT NEWS alone)', () => {
    const found: string[] = [];
    for (const archive of ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR']) {
      const z = Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, archive))));
      for (const k of z.root.children.filter((c) => /\.rdr$/i.test(c.name))) {
        let d: DialogDesign;
        try { d = loadDialog(parseRdr(z.data(k))); } catch { continue; }   // a table (mp_rooms.rdr), not a layout
        for (const rec of [...d.controls, ...d.objects]) {
          if (rec.widget.type === 'LISTBOX' && rec.widget.columns.some((c) => c.kind === 3)) found.push(`${archive} ${k.name} ${rec.name}`);
        }
      }
    }
    expect(found).toEqual([`RUN/UI/READERC.ZAR ${MANAGE_ROSTER_LEADER} ClanMessageList`]);
  });

  it('the member\'s roster asks the pane at its ONSTART (OnMRosterStart: GetClanMessages) and draws no widget on it', () => {
    const c = readChapters(DISC!, [MANAGE_ROSTER])[0]!;
    expect(c.animations['OnMRosterStart']!.map((l) => l.trim())).toContain('GetClanMessages(NA)');
    expect(c.commands).toContain('GetClanMessages FUN_00279790');
    expect(c.widgets.filter((w) => w.uivar === MEDIUS_CLAN_MESSAGES_VAR)).toEqual([]);
  });

  it('no dialog of the online chapter binds the command SendClanMessage (FUN_002797f0): the post is ModifyClanMessage on the "-1" row', () => {
    const all = readChapters(DISC!, ONLINE_DIALOGS.filter((d) => d !== 'mp_rooms.rdr'));
    expect(all.filter((c) => c.commands.some((x) => x.startsWith('SendClanMessage '))).map((c) => c.name)).toEqual([]);
  });

  it('SendClanMessage\'s GetTextInput block: ChatSkb on SEND_CLAN_MESSAGE, titled _497_EnterMessageClan_MSG, 199 characters of 199 bytes (the recipient edit 14 / 31)', () => {
    const sets = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UIZANIM.ZAR'))))).sets;
    const reqs = sets.filter((s) => s.name.toLowerCase() === MANAGE_ROSTER_LEADER.toLowerCase()).flatMap((s) => s.anims.filter((a) => a.name === 'SendClanMessage').flatMap((a) =>
      a.sequences.flatMap((q) => q.commands.filter((c) => c.set !== 0 && a.names[c.bytes[6]!]?.toLowerCase() === 'gettextinput').map((c) => decodeTextInput(c.bytes, (i) => a.names[i] ?? null)))));
    expect(reqs).toEqual([{
      uiVar: SEND_CLAN_MESSAGE_VAR, purpose: '_497_EnterMessageClan_MSG', msgPlayerTitle: '_331_EnterName_MSG', action2Title: '_332_EnterIgnore_MSG', skbName: 'ChatSkb', uiVar2: '',
      maxBytes: 199, maxChars: 199, maxBytes2: 31, maxChars2: 14, noDQuote: false, allowEmpty: false,
    }]);
  });

  it('the captions\' texts (UIMNLOC)', () => {
    const loc = locTable(readLocArchive(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/LOCALE/STATES/UIMNLOC.ZAR'))), 'UIMn').entries);
    expect([475, 485, 497, 498, 503, 504, 775, 776].map((id) => loc.byId.get(id)!.trim())).toEqual([
      'EDIT NEWS', '¦ Edit your Clan news.', 'Enter a Message to Send to Clan.', '¦ Edit. · Delete. ¬ Cancel.', 'That message could not be deleted. ¦ CONTINUE.',
      'You cannot post blank messages. ¦ CONTINUE.', 'Clan messages', 'MESSAGES',
    ]);
  });
});

describe.skipIf(!HAVE_ELF)('the ELF\'s strings and data the clan messages cite (socom2_game.elf)', () => {
  it('the names, texts and formats at their addresses; the leader\'s kept list (0x44f764, 0x44f768) in the BSS', () => {
    const elf = new ElfImage(new Uint8Array(readFileSync(ELF_PATH)));
    expect([0x3f3900, 0x3f3f20, 0x3eedb0, 0x3f4460, 0x3f3f60, 0x3f44a8, 0x3f3f10, 0x3f3f18, 0x3f3ef8, 0x3f3f00, 0x3f3e80, 0x3f3ea0, 0x3ee898].map((va) => elf.cstr(va))).toEqual([
      MEDIUS_CLAN_MESSAGES_VAR, CLAN_LEADER_MESSAGES_VAR, SEND_CLAN_MESSAGE_VAR, CLAN_MESSAGES_RETRIEVING, NO_CLAN_MESSAGES, CLAN_MESSAGE_SEPARATOR, '-1', ' ', '%d', 'Message %d:',
      'CLAN_MESSAGE_EMPTY', 'CLAN_MESSAGE_ID_ERR', 'INPUT_STRING',
    ]);
    expect([0x3f3e60, 0x3f3ec0, 0x3f3ee0, 0x3f4420, 0x3f4430, 0x3f4490].map((va) => elf.cstr(va))).toEqual([
      'DeleteClanMessage', 'ModifyClanMessage', 'GetLeaderMessages', 'SendClanMessage', 'Failed To Send Message. Error -> %s', 'GetMyClanMessages',
    ]);
    for (const va of [0x44f764, 0x44f768]) expect(elf.offsetOf(va), va.toString(16)).toBeNull();
  });

  it('NU-13: the wrapped cell\'s classes as the draw reads them -- the item 0x407240, CListItemWrappedTextTypeImpl 0x407140, CWrappedText 0x4079e0', () => {
    const elf = new ElfImage(new Uint8Array(readFileSync(ELF_PATH)));
    const vt = (base: number, offs: number[]): number[] => offs.map((o) => elf.u32(base + o));
    // the item: +0xc its rows (FUN_0036ba30), +0x10 / +0x14 to the content's +0x48 / +0x4c (FUN_0036b9e0, FUN_0036b990)
    expect(vt(0x407240, [0xc, 0x10, 0x14])).toEqual([0x36ba30, 0x36b9e0, 0x36b990]);
    // the wrapped content: +0x24 its place (the text's pen), +0x38 its draw FUN_0037be90, +0x44 its rows, +0x48 SPACING, +0x4c MAXWIDTH
    expect(vt(0x407140, [0x24, 0x38, 0x44, 0x48, 0x4c])).toEqual([0x37bd50, 0x37be90, 0x37be30, 0x37be50, 0x37be70]);
    // the text content and the image content's rows: 1 (0x36ba60); the array content's: FUN_0037cdc0
    expect([elf.u32(0x407b40 + 0x44), elf.u32(0x407050 + 0x44), elf.u32(0x407b90 + 0x44)]).toEqual([0x36ba60, 0x36ba60, 0x37cdc0]);
    // CWrappedText: +0x10 its draw FUN_003794b0, +0x70 the wrapping setter, +0x88 its pitch (+0xbc), +0xa0 the colour's apply
    expect(vt(0x4079e0, [0x10, 0x70, 0x88, 0xa0])).toEqual([0x3794b0, 0x379f70, 0x36afb0, 0x37a630]);
    expect([
      elf.u32(0x37be30),   // lw v0, 0x114(a0): the text's +0x44 (the content's +0xd0 + 0x44)
      elf.u32(0x37be60),   // swc1 f0, 0x18c(a0): SPACING into the text's +0xbc
      elf.u32(0x37be80),   // swc1 f0, 0x190(a0): MAXWIDTH into the text's +0xc0
      elf.u32(0x36ba64),   // addiu v0, zero, 1: one row
      elf.u32(0x36afb4),   // lwc1 f0, 0xbc(a0): the pitch
      elf.u32(0x37a630),   // jr ra: the colour never reaches the lines
    ]).toEqual([0x8c820114, 0xe480018c, 0xe4800190, 0x24020001, 0xc48000bc, 0x03e00008]);
  });
});
