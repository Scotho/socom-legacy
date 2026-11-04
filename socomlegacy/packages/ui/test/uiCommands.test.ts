import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UI_COMMAND_KEY_ABSENT, UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER, UI_COMMAND_TABLE, UiCommandHost,
  uiCommandCitation, uiCommandFold, uiCommandKey, uiCommandRowByKey, uiCommandRowByName, type UiCommandOutcome,
} from '../src/uiCommands';
import type { ZAnimUiCommand } from '../src/zanimRuntime';

// Web research 107. Every expectation is transcribed from the retail decompilation (`D:L<line>` = a line of
// game/analysis/socom2_game.elf.decomp.c) or, for the four bodies the decompiler folds away, from their disassembly
// (research 107 §5); the table's rows are research 96 §4's, held to the ELF by tools/test/uiCommandTableDisc.test.ts.

/** A `ui::UI_COMMAND` as the runtime hands it to the host (`ZAnimUiCommand`): no node unless given. */
function uiCmd(fn: string | null, over: Partial<ZAnimUiCommand> = {}): ZAnimUiCommand {
  return { anim: 'a', sequence: 's', nodeIndex: 0, node: null, opcodeByte: 1, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x10), ...over };
}

describe('the table at 0x3dd4d0 (research 96 §4, research 107 §1)', () => {
  it('207 rows; ids 1..208 without 30, each once; 11 rows with an fn2', () => {
    expect(UI_COMMAND_TABLE).toHaveLength(207);
    const ids = UI_COMMAND_TABLE.map((r) => r.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 208 }, (_, i) => i + 1).filter((i) => i !== 30));
    expect(UI_COMMAND_TABLE.map((r) => r.index)).toEqual(UI_COMMAND_TABLE.map((_, i) => i));
    expect(UI_COMMAND_TABLE.filter((r) => r.fn2 !== 0).map((r) => r.name)).toEqual([
      'GetTextInput', 'PlayMPEG', 'SendChatText', 'SendMediusChat', 'GetLadderInfo', 'GetPlayerInfo',
      'GetMUISPersonaInfo', 'CompareValues', 'CharacterProfile', 'GetMissionInformation', 'CopyUIVar',
    ]);
    expect(UI_COMMAND_TABLE[0]).toMatchObject({ id: 1, name: 'SetMission' });
    expect(UI_COMMAND_TABLE[206]).toMatchObject({ id: 208, name: 'InitializeOnlineArmory' });
    expect(UI_COMMAND_TABLE.find((r) => r.name === 'DNASAuthenticate')).toMatchObject({ index: 197, fn: 0x2cc670 });
  });

  it('every row is classified: implemented here, declared for a roadmap task that exists, or unknown', () => {
    const roadmap = resolve(import.meta.dirname, '../../../docs/roadmap');
    const ids = new Set<string>();
    for (const f of readdirSync(roadmap).filter((n) => /^0\d-.*\.md$/.test(n))) {
      for (const m of readFileSync(join(roadmap, f), 'utf8').matchAll(/^### ([A-Z]+-\d+[a-z]?) /gm)) ids.add(m[1]!);
    }
    for (const r of UI_COMMAND_TABLE) {
      if (r.status === 'declared') expect(ids, `${r.name} -> ${r.task}`).toContain(r.task);
      else expect(r.task, r.name).toBeNull();
    }
    const by = (s: string): string[] => UI_COMMAND_TABLE.filter((r) => r.status === s).map((r) => r.name);
    expect(by('here')).toEqual(['ClearGameState', 'GetAcctInfo', 'IsClanChallengeGame', 'DeletePatch']);
    expect(by('unknown')).toEqual(['MediusEnabled', 'IsNetwork', 'SysLoadIRX', 'CheckTeamStatus']);
    expect(by('declared')).toHaveLength(199);
    // MENU-01's block lists its offline commands by name (the MC_* family and Load/SaveConfig are OPT-05a's O17).
    for (const n of ['SwitchMenu', 'PopUpDialog', 'KillPopUp', 'SuspendMenuInput', 'VagStreaming', 'RebootIOP', 'CopyUIVar']) {
      expect(uiCommandRowByName(n)!.task, n).toBe('MENU-01');
    }
    for (const n of ['MC_ChPort', 'LoadConfig', 'SaveConfig', 'IsMemCardInserted', 'MC_Changed']) expect(uiCommandRowByName(n)!.task, n).toBe('OPT-05a');
    expect(UI_COMMAND_TABLE.filter((r) => r.task === 'OPT-05a')).toHaveLength(16);
  });

  it('a constant answer is cited: 1 at every exit of 121 bodies, 0 of three; the rest state or unread (null)', () => {
    const n = (a: boolean | null): number => UI_COMMAND_TABLE.filter((r) => r.answer === a).length;
    expect([n(true), n(false), n(null)]).toEqual([121, 3, 83]);
    // SwitchMenu `FUN_0027e720`: its body D:L126554-126639 returns 1 (PLAT-10 reads its switch records).
    expect(uiCommandRowByName('SwitchMenu')).toMatchObject({ fn: 0x27e720, answer: true, lines: [126554, 126639] });
    // AbortLoad `FUN_00278060` D:L123260-123270: `return 0`.
    expect(uiCommandRowByName('AbortLoad')).toMatchObject({ answer: false, lines: [123260, 123270] });
    // A row the decompiler folds into a neighbour has no lines; its answer is its disassembly's or null.
    expect(uiCommandRowByName('IsMemCardInserted')).toMatchObject({ answer: null, lines: null });
    for (const r of UI_COMMAND_TABLE) if (r.lines) expect(r.lines[0]).toBeLessThan(r.lines[1]);
  });

  it('a row with no decompiled block cites what its instructions show (`folded`, research 107 §5)', () => {
    for (const r of UI_COMMAND_TABLE) expect(r.folded === null, r.name).toBe(r.lines !== null);
    const kinds: Record<string, number> = {};
    for (const r of UI_COMMAND_TABLE) if (r.folded) kinds[r.folded.kind] = (kinds[r.folded.kind] ?? 0) + 1;
    expect(kinds).toEqual({ leaf: 4, tail: 18, state: 5, return: 7, unread: 6 });
    // 0x27e1b0: `lui a0` / `j 0x3a1650` at 0x27e1b4 -- the answer is FUN_003a1650's (D:L295921-295953).
    expect(uiCommandRowByName('IsMemCardInserted')!.folded).toEqual({ kind: 'tail', at: 0x27e1b4, target: 0x3a1650, lines: [295921, 295953] });
    // 0x2808d0: `j 0x38d770`, whose block's one exit is `return 1` (D:L284045): a constant 1.
    expect(uiCommandRowByName('GetTextInput')).toMatchObject({ answer: true, folded: { kind: 'tail', at: 0x2808d0, target: 0x38d770, lines: [283988, 284046] } });
    // 0x280770: the byte at 0x4364f8 == 2 (`lbu` / `xori 2` / `sltiu 1`), the `jr ra` at 0x28077c.
    expect(uiCommandRowByName('IsMissionSuccessful')!.folded).toEqual({ kind: 'state', reads: [0x4364f8], ret: 0x28077c });
    // 0x27a920: a call of 0x2e6850, then `addiu v0, zero, 1` at 0x27a938 before `jr ra`.
    expect(uiCommandRowByName('DisbandClan')).toMatchObject({ answer: true, folded: { kind: 'return', ret: 0x27a938 } });
    // The same shape, one `jr ra` that every branch reaches through `addiu v0, zero, 1`: 0x27a840 calls 0x2e7450, 1 at
    // 0x27a878; 0x277430 calls 0x2e81b0, 1 at 0x2774a4 (an `lq s0` between it and the `jr ra` at 0x2774ac); 0x27e1c0
    // (branches to 0x27e290 at most), 1 at 0x27e298; 0x27f820 (to 0x27fa28), 1 at 0x27fa30; 0x277970 (to 0x277a68), 1
    // at 0x277a8c (the `jr ra` at 0x277aa0); 0x278eb0 (to 0x2791c0), 1 at 0x2791c8 (the `jr ra` at 0x2791d8).
    for (const [n, ret] of [['RemovePlayerFromClan', 0x27a878], ['TransferLeadership', 0x2774a4], ['VCButton', 0x27e298], ['SaveSavedGame', 0x27fa30], ['NetGetInterfaceList', 0x277a8c], ['SetMPMissionSeq', 0x2791c8]] as const) {
      expect(uiCommandRowByName(n), n).toMatchObject({ answer: true, folded: { kind: 'return', ret } });
    }
    expect(uiCommandRowByName('ClearGameState')!.folded).toEqual({ kind: 'leaf', ret: 0x27c7e4 });
    expect(uiCommandRowByName('ChooseEquip3')!.folded).toEqual({ kind: 'unread' });
    // Every row's citation names where its answer comes from.
    expect(uiCommandCitation(uiCommandRowByName('SwitchMenu')!)).toBe('FUN_0027e720 D:L126554-126639');
    expect(uiCommandCitation(uiCommandRowByName('IsMemCardInserted')!)).toBe('0x27e1b0: j FUN_003a1650 at 0x27e1b4, D:L295921-295953');
    expect(uiCommandCitation(uiCommandRowByName('UpdateSelItemValves')!)).toBe('0x282410: j FUN_00282140 at 0x282410, D:L128327-128419');
    expect(uiCommandCitation(uiCommandRowByName('ClanHasInvitations')!)).toBe('0x277960: j FUN_002e7290 at 0x277964, no block');
    expect(uiCommandCitation(uiCommandRowByName('IsMissionSuccessful')!)).toBe('0x280770: reads 0x4364f8, jr ra at 0x28077c');
    expect(uiCommandCitation(uiCommandRowByName('DisbandClan')!)).toBe('0x27a920: v0 = 1 at 0x27a938');
    expect(uiCommandCitation(uiCommandRowByName('DeletePatch')!)).toBe('0x2ca330: jr ra, v0 = 1 at 0x2ca334');
    expect(uiCommandCitation(uiCommandRowByName('VCButton')!)).toBe('0x27e1c0: v0 = 1 at 0x27e298');
    expect(uiCommandCitation(uiCommandRowByName('ChooseEquip3')!)).toBe('0x282420: body not read');
  });

  it("every row has the Gap's category: UI, valve/state, card, movie, music/stream, net/Medius, mission or system", () => {
    const by: Record<string, number> = {};
    for (const r of UI_COMMAND_TABLE) by[r.category] = (by[r.category] ?? 0) + 1;
    expect(by).toEqual({ ui: 11, valve: 33, card: 19, movie: 3, music: 3, net: 117, mission: 5, system: 16 });
    const cat = (n: string): string => uiCommandRowByName(n)!.category;
    // The Gap's own examples: system (RebootIOP, NetCnf*); REBOOT is no row (it keys 0, research 107 §6).
    for (const n of ['RebootIOP', 'NetCnfInit', 'NetCnfUninit', 'NetCnfOpen', 'NetCnfClose', 'NetCnfCurrCombo', 'NetCnfSelectCombo']) expect(cat(n), n).toBe('system');
    expect(uiCommandRowByName('REBOOT')).toBeUndefined();
    expect([cat('SwitchMenu'), cat('ChoosePrimary'), cat('MC_ChDir'), cat('PlayMPEG'), cat('VagStreaming'), cat('LobbyLogin'), cat('IsMissionSuccessful')])
      .toEqual(['ui', 'valve', 'card', 'movie', 'music', 'net', 'mission']);
    // Every online owner's row is net/Medius but the NetCnf layer (ONL-01's network configuration: system).
    for (const r of UI_COMMAND_TABLE) if (r.task && /^(ONL|SVC)-/.test(r.task) && !/^NetCnf|^NetGetInterfaceList$/.test(r.name)) expect(r.category, r.name).toBe('net');
  });
});

describe('the lookup (`FUN_00274870` D:L121436-121458; inline in `FUN_002745a0` D:L121391-121409)', () => {
  it('`FUN_00198b80` folds A-Z to a-z only (the ctype bit at 0x1d08d1 is set for A-Z alone, research 107 §2)', () => {
    expect(uiCommandFold('SWITCHMENU')).toBe(uiCommandFold('switchmenu'));
    expect(uiCommandFold('NetCnfUnInit')).toBe(uiCommandFold('NetCnfUninit'));
    expect(uiCommandFold('[x]_@')).toBe('[x]_@');
  });

  it('a name matches its row case-insensitively: the key is the row id, not its index', () => {
    expect(uiCommandKey('SWITCHMENU')).toBe(13);
    expect(uiCommandKey('KillPopup')).toBe(15);
    expect(uiCommandKey('CopyUiVar')).toBe(189);
    expect(uiCommandKey('SendChatText')).toBe(31);                                // row 25
    expect(uiCommandKey('VCButton')).toBe(75);                                    // row 26
  });

  it('no name is 0xE8; an empty name, a name no row has (NA, MENUFADER, REBOOT) is 0', () => {
    expect(uiCommandKey(null)).toBe(UI_COMMAND_KEY_ABSENT);
    expect(UI_COMMAND_KEY_ABSENT).toBe(0xe8);
    expect(uiCommandKey('')).toBe(0);
    for (const n of ['NA', 'MENUFADER', 'REBOOT', 'PREVIOUS_SCREEN', 'SwitchMenu ']) expect(uiCommandKey(n), n).toBe(0);
  });

  it('the call picks the row whose id is the key (D:L121411-121427); 0 and 0xE8 pick none', () => {
    expect(uiCommandRowByKey(13)!.name).toBe('SwitchMenu');
    expect(uiCommandRowByKey(91)!.name).toBe('QuitClan');                         // row 91, id 91: the direct test
    expect(uiCommandRowByKey(26)!.name).toBe('ToggleAutoMessages');              // id 26 is row 27
    expect(uiCommandRowByKey(0)).toBeNull();
    expect(uiCommandRowByKey(30)).toBeNull();
    expect(uiCommandRowByKey(UI_COMMAND_KEY_ABSENT)).toBeNull();
  });
});

describe('UiCommandHost: `FUN_002745a0` (D:L121344-121431) filled', () => {
  it('a name no row has, or none: nothing is called, the answer is 1 (D:L121428-121430)', () => {
    const seen: UiCommandOutcome[] = [];
    const host = new UiCommandHost({ log: (o) => seen.push(o) });
    expect(host.uiCommand(uiCmd('NA'))).toBe(true);
    expect(host.uiCommand(uiCmd(null))).toBe(true);
    expect(host.dispatch(uiCmd('MENUFADER'))).toEqual({ kind: 'none', key: 0, answer: true });
    expect(seen).toEqual([]);
  });

  it('the four bodies implemented here answer their disassembly: ClearGameState, DeletePatch 1; GetAcctInfo, IsClanChallengeGame 0', () => {
    const host = new UiCommandHost();
    // 0x27c7e0 and 0x2ca330: `jr ra` / `addiu v0, zero, 1`; 0x27dc80 and 0x2795d0: `jr ra` / `move v0, zero`.
    expect(host.uiCommand(uiCmd('CLEARGAMESTATE'))).toBe(true);
    expect(host.uiCommand(uiCmd('DeletePatch'))).toBe(true);
    expect(host.uiCommand(uiCmd('GetAcctInfo'))).toBe(false);
    expect(host.uiCommand(uiCmd('IsClanChallengeGame'))).toBe(false);
    expect(host.dispatch(uiCmd('ClearGameState'))).toMatchObject({ kind: 'table', row: { id: 17 }, answer: true });
  });

  it("a row this task does not own returns a typed 'not implemented: <task>', logged, answering its cited return", () => {
    const seen: UiCommandOutcome[] = [];
    const host = new UiCommandHost({ log: (o) => seen.push(o) });
    const o = host.dispatch(uiCmd('SWITCHMENU'));
    expect(o).toMatchObject({ kind: 'not-implemented', message: 'not implemented: MENU-01', task: 'MENU-01', answer: true, answerFrom: 'D:L126554-126639' });
    expect(seen).toEqual([o]);
    expect(host.uiCommand(uiCmd('AbortLoad'))).toBe(false);                       // D:L123260-123270
    expect(seen[1]).toMatchObject({ message: 'not implemented: ONL-18' });
    // An unread answer is the placeholder: the dispatcher's own "nothing took it" 1.
    expect(UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER).toBe(true);
    expect(host.dispatch(uiCmd('IsMemCardInserted'))).toMatchObject({
      message: 'not implemented: OPT-05a', answer: true, answerFrom: 'placeholder',
      cite: '0x27e1b0: j FUN_003a1650 at 0x27e1b4, D:L295921-295953',
    });
    // A constant reached through a tail jump cites the target's block.
    expect(host.dispatch(uiCmd('GetTextInput'))).toMatchObject({ answer: true, answerFrom: 'D:L283988-284046 (FUN_0038d770)' });
    expect(host.dispatch(uiCmd('DisbandClan'))).toMatchObject({ answer: true, answerFrom: 'asm 0x27a938' });
    expect(host.dispatch(uiCmd('RemovePlayerFromClan'))).toMatchObject({ answer: true, answerFrom: 'asm 0x27a878', cite: '0x27a840: v0 = 1 at 0x27a878' });
    expect(host.dispatch(uiCmd('TransferLeadership'))).toMatchObject({ answer: true, answerFrom: 'asm 0x2774a4', cite: '0x277430: v0 = 1 at 0x2774a4' });
    expect(host.dispatch(uiCmd('SysLoadIRX'))).toMatchObject({ message: 'not implemented: unknown', task: null });
  });

  it('a later task fills a row with a handler, keyed by the table name; a name no row has is refused', () => {
    const calls: string[] = [];
    const host = new UiCommandHost({ handlers: { SwitchMenu: (c, r) => { calls.push(`${r.id}:${c.arg}`); return false; } } });
    expect(host.uiCommand(uiCmd('switchmenu', { arg: 'dlgMenu.rdr' }))).toBe(false);
    expect(calls).toEqual(['13:dlgMenu.rdr']);
    expect(() => new UiCommandHost({ handlers: { SWITCHMENU: () => true } })).toThrow(/no row/);
  });

  it("the dispatcher's second argument is the tick's time, by reference (FUN_0026a6e0 D:L115202-115208); a body may be set late", () => {
    const host = new UiCommandHost();
    const seen: Array<number | undefined> = [];
    host.setHandler('PlayMPEG', (_c, r, time) => { seen.push(time?.v); if (time) time.v = 0; return r.id === 23; });
    const time = { v: 0.25 };
    expect(host.uiCommand(uiCmd('PlayMPEG'), time)).toBe(true);
    expect(time.v).toBe(0);                                                        // the body consumed the tick's time
    expect(host.uiCommand(uiCmd('PLAYMPEG'))).toBe(true);
    expect(seen).toEqual([0.25, undefined]);
    expect(() => host.setHandler('PlayMpeg', () => true)).toThrow(/no row/);
    // The node's handler receives the same pointer (D:L121384).
    const nodeSeen: number[] = [];
    const h2 = new UiCommandHost({ node: (_c, t) => { nodeSeen.push(t?.v ?? -1); return { answer: true }; } });
    h2.uiCommand(uiCmd('EnableButton', { nodeIndex: 2, node: 'B' }), { v: 0.5 });
    expect(nodeSeen).toEqual([0.5]);
  });

  it('a key already in byte +10 is used without a lookup (D:L121389-121391); the lookup leaves it 0 on the disc', () => {
    const host = new UiCommandHost();
    const bytes = new Uint8Array(0x10);
    bytes[10] = 17;                                                                // ClearGameState's id
    expect(host.dispatch(uiCmd('SwitchMenu', { bytes }))).toMatchObject({ kind: 'table', row: { name: 'ClearGameState' } });
  });

  it('with a node, the node goes first (D:L121370-121385): taken, its answer stands; declined or absent, the table answers', () => {
    const order: string[] = [];
    const host = new UiCommandHost({
      node: (c) => { order.push(`node ${c.node}`); return c.node === 'Btn' ? { answer: false } : null; },
      handlers: { EnableButton: () => { order.push('table'); return true; } },
    });
    expect(host.uiCommand(uiCmd('EnableButton', { nodeIndex: 3, node: 'Btn' }))).toBe(false);
    expect(host.uiCommand(uiCmd('EnableButton', { nodeIndex: 4, node: 'Other' }))).toBe(true);
    expect(host.uiCommand(uiCmd('EnableButton'))).toBe(true);                     // no node: the handler is not asked
    expect(order).toEqual(['node Btn', 'node Other', 'table', 'table']);
    expect(host.dispatch(uiCmd('EnableButton', { nodeIndex: 3, node: 'Btn' }))).toEqual({ kind: 'node', answer: false });
  });

  it('is the runtime\'s ZAnimHost: sound passes through', () => {
    let n = 0;
    const host = new UiCommandHost({ sound: () => { n++; } });
    host.sound?.({ anim: 'a', flags: 0, sound: 'x', nodeIndex: 0, bytes: new Uint8Array(0) });
    expect(n).toBe(1);
  });
});
