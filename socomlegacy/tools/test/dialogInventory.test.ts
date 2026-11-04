import { describe, expect, it } from 'vitest';
import { parseRdr, type RdrNode } from '@s2u/archive';
import {
  bindingsOf, buildGraph, classify, dialogPairs, everyTypeValue, locSummary, memberTally, missingMovies, persistentValvesOf,
  resolveSets, screenRoot, setSlots, stringsOf, typeSites, valveNames, valveValues, type DialogFacts, type SetFacts,
} from '../dialogInventory';
import { ElfImage, findStrings, readBindingTable } from '../elfImage';
import { programHeaders, vaddrToOffset } from '../dump-medius-ids';
import { handGameSave, handLauncherSave, handValves, scrambleForTest } from './cardFileSupport';

/**
 * PLAT-06's pure pieces (web research 96), on input made up here -- no disc, so these run in CI. The disc itself is
 * `dialogInventoryDisc.test.ts`'s.
 */

// ---------------------------------------------------------------------------------------------------------------------
// The ELF mapper, on a tiny synthetic ELF32: two PT_LOAD segments, the second with a BSS tail.

/** An ELF32 LE with `segs` as PT_LOADs (file images laid out from 0x100) and one PT_NOTE that maps nothing. */
function tinyElf(segs: { vaddr: number; bytes: Uint8Array; memsz?: number }[]): Uint8Array {
  const PH = 0x34, PHSIZE = 0x20, phnum = segs.length + 1;
  let at = 0x100;
  const placed = segs.map((s) => { const o = at; at += s.bytes.length; return { ...s, offset: o }; });
  const out = new Uint8Array(at);
  const v = new DataView(out.buffer);
  out.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1], 0);
  v.setUint32(0x1c, PH, true);
  v.setUint16(0x2a, PHSIZE, true);
  v.setUint16(0x2c, phnum, true);
  placed.forEach((s, i) => {
    const o = PH + i * PHSIZE;
    v.setUint32(o, 1, true); v.setUint32(o + 4, s.offset, true); v.setUint32(o + 8, s.vaddr, true);
    v.setUint32(o + 16, s.bytes.length, true); v.setUint32(o + 20, s.memsz ?? s.bytes.length, true);
    out.set(s.bytes, s.offset);
  });
  v.setUint32(PH + segs.length * PHSIZE, 4, true);   // PT_NOTE: never mapped
  return out;
}
const words = (...w: number[]): Uint8Array => { const b = new Uint8Array(4 * w.length); const v = new DataView(b.buffer); w.forEach((x, i) => v.setUint32(4 * i, x, true)); return b; };
const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('ElfImage: virtual addresses through the PT_LOAD headers', () => {
  // .rodata at 0x2000: strings; .data at 0x5000: a three-row table, its terminator, then 0x40 bytes of BSS.
  const strings = ascii('\0Alpha\0dlgMenu.rdr\0Beta\0dlgHype\0\x01dlgX\0');
  const table = words(1, 0x2001, 0x1111, 0, 2, 0x2007, 0x2222, 0x3333, 7, 0x2013, 0x4444, 0, 0, 0, 0, 0, 9, 0x2001, 0, 0);
  const elf = new ElfImage(tinyElf([{ vaddr: 0x2000, bytes: strings }, { vaddr: 0x5000, bytes: table, memsz: table.length + 0x40 }]));

  it('reads the program headers, maps an address to its file offset, and none outside a file image', () => {
    expect(elf.segments.filter((s) => s.type === 1).map((s) => s.vaddr)).toEqual([0x2000, 0x5000]);
    expect(elf.offsetOf(0x2000)).toBe(0x100);
    expect(elf.offsetOf(0x5004)).toBe(0x100 + strings.length + 4);
    expect(elf.offsetOf(0x5000 + table.length)).toBeNull();          // the BSS: no bytes in the file
    expect(elf.offsetOf(0x1fff)).toBeNull();
    expect(() => elf.u32(0x5000 + table.length)).toThrow(/not in one PT_LOAD/);
    // A read that starts in segment 1 and runs past its file image, where the file holds segment 2's first bytes (the
    // retail ELF's 0x1d5600 / 0xd6600 boundary has this shape): the last-byte clause of `at` refuses it (close review #4).
    expect(elf.offsetOf(0x2000 + strings.length)).toBeNull();
    expect(() => elf.u32(0x2000 + strings.length - 2)).toThrow(/not in one PT_LOAD/);
    expect(elf.cstr(0x2001)).toBe('Alpha');
  });

  it('walks {id, name, fn, fn2} rows to the first null name: three rows, the fourth the terminator', () => {
    const t = readBindingTable(elf, 0x5000);
    expect(t.rows.map((r) => [r.id, r.name, r.fn, r.fn2])).toEqual([[1, 'Alpha', 0x1111, 0], [2, 'dlgMenu.rdr', 0x2222, 0x3333], [7, 'Beta', 0x4444, 0]]);
    expect(t.terminator).toEqual({ index: 3, id: 0, fn: 0, fn2: 0 });
  });

  it('finds the whole strings that match, at their addresses, and not a match inside a longer string', () => {
    expect(findStrings(elf, /^dlg\w*(\.rdr)?$/i)).toEqual([{ va: 0x2007, text: 'dlgMenu.rdr' }, { va: 0x2018, text: 'dlgHype' }]);
  });

  it('refuses what is not a little-endian ELF32', () => {
    expect(() => new ElfImage(new Uint8Array(64))).toThrow(/not an ELF/);
    const big = tinyElf([]); big[5] = 2;
    expect(() => new ElfImage(big)).toThrow(/little-endian/);
  });

  it('is the one mapper: dump-medius-ids\' programHeaders / vaddrToOffset answer as it does and refuse what it refuses', () => {
    const bytes = tinyElf([{ vaddr: 0x2000, bytes: strings }, { vaddr: 0x5000, bytes: table, memsz: table.length + 0x40 }]);
    const segs = programHeaders(bytes);
    expect(segs).toEqual(new ElfImage(bytes).segments);
    for (const va of [0x2000, 0x2001, 0x5004, 0x5000 + table.length, 0x1fff, 0x9000]) expect(vaddrToOffset(segs, va)).toBe(elf.offsetOf(va));
    // A header table running past the file, a header entry shorter than ELF32's 0x20, a PT_LOAD past the file.
    const short = bytes.slice(); new DataView(short.buffer).setUint16(0x2c, 0x7fff, true);
    expect(() => programHeaders(short)).toThrow(/outside the file/);
    const narrow = bytes.slice(); new DataView(narrow.buffer).setUint16(0x2a, 0x10, true);
    expect(() => programHeaders(narrow)).toThrow(/outside the file/);
    const long = bytes.slice(); new DataView(long.buffer).setUint32(0x34 + 16, 0x10000, true);
    expect(() => programHeaders(long)).toThrow(/runs past the file/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Members, sets, layouts.

describe('the member and set tallies', () => {
  it('counts dlg* and Common_* and names the rest', () => {
    expect(memberTally(['dlgA.rdr', 'Common_X.rdr', 'dlg_b.rdr', 'UiParams.rdr'])).toEqual({ total: 4, dialogs: 2, common: 1, other: ['UiParams.rdr'] });
  });
  it('counts an archive\'s slots and its named sets, and refuses an empty slot with animations', () => {
    expect(setSlots([{ name: 'dlgA.rdr', anims: [1] }, { name: 'Anim_Set', anims: [] }, { name: 'UIanim.rdr', anims: [] }]))
      .toEqual({ slots: 3, named: ['dlgA.rdr', 'UIanim.rdr'], empty: 1 });
    expect(() => setSlots([{ name: 'Anim_Set', anims: [1] }])).toThrow(/holds animations/);
  });
});

/** A made-up dialog in the disc's shape, with the quirks research 96 §2.3 met: loose tokens, a doubled TYPE. */
const LAYOUT: RdrNode = [
  ['SCREENS', [
    'BACKGROUND', ['TYPE', ['MPEG'], 'FILENAME', ['run/movies/x.pss']],
    'SCRIPT_LIBRARY', ['dlgA.rdr', 'uianim.rdr'],
    'OBJECTS', [
      ['NAME', ['t1'], 'TYPE', ['TEXT'], 'SPEC', ['UIVAR', ['NAME', ['V'], 'TYPE', ['PERMANENT']]]],
      ['NAME', ['m1'], 'TYPE', ['MAPCONTROL'], 'SPEC', ['ELEMENTS', [['TYPE', ['IMAGE']], ['TYPE', ['TEXT']]]]],
    ],
    ':end', 'objects',
    'ANIMATIONS', [['EVENT', ['ONSTART'], 'ANIMATION', ['go'], 'ARGUMENT', ['dlgB.rdr']]],
    'CONTROLS', [
      ['NAME', ['b1'], 'TYPE', ['BUTTON'], 'TYPE', ['BUTTON'], 'SPEC', ['ANIMATIONS', [['BUTTON', ['CROSS'], 'ANIMATION', ['press']]]]],
      ['NAME', ['r1'], 'TYPE', ['RADIOSTRIP'], 'SPEC', ['SUBORDINATES', [['NAME', ['c1'], 'TYPE', ['CHECKBOX']], ['NAME', ['c2'], 'TYPE', ['CHECKBOX']]]]],
    ],
  ], '0', '0'],
  ':end', 'of', 'file',
];

describe('one layout: bindings, strings, the TYPE values by where they stand', () => {
  it('finds the SCREENS record past the loose tokens', () => {
    expect(Array.isArray(screenRoot(LAYOUT))).toBe(true);
    expect(() => screenRoot([['NAME', ['x']]])).toThrow(/no SCREENS/);
  });
  it('lists every binding with its owner, its trigger and its argument', () => {
    expect(bindingsOf(LAYOUT)).toEqual([
      { owner: 'SCREEN', trigger: 'EVENT ONSTART', animation: 'go', argument: 'dlgB.rdr' },
      { owner: 'b1', trigger: 'BUTTON CROSS', animation: 'press', argument: null },
    ]);
  });
  it('gives each string the key it stands under, loose tokens their record\'s', () => {
    const s = stringsOf(LAYOUT);
    expect(s).toContainEqual({ key: 'FILENAME', value: 'run/movies/x.pss' });
    expect(s).toContainEqual({ key: 'SCRIPT_LIBRARY', value: 'uianim.rdr' });
    expect(s).toContainEqual({ key: 'ARGUMENT', value: 'dlgB.rdr' });
  });
  it('sorts the TYPE values into widgets, subordinates, elements, the background and a UIVAR\'s longevity', () => {
    expect(typeSites(LAYOUT)).toEqual({
      background: { MPEG: 1 }, widget: { TEXT: 1, MAPCONTROL: 1, BUTTON: 1, RADIOSTRIP: 1 }, uivar: { PERMANENT: 1 },
      element: { IMAGE: 1, TEXT: 1 }, subordinate: { CHECKBOX: 2 },
    });
    // The scratch's way, every TYPE key as it stands: the doubled key counts twice.
    expect(everyTypeValue(LAYOUT).BUTTON).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The graph and the classification, on a made-up dialog set.

const dialog = (name: string, scripts: string[], bindings: DialogFacts['bindings'], strings: DialogFacts['strings'] = []): DialogFacts =>
  ({ archive: 'RUN/UI/READERC.ZAR', name, scripts, bindings, strings });
const anim = (name: string, commands: [string, string][] = [], calls: string[] = []) =>
  ({ name, commands: commands.map(([fn, arg]) => ({ fn, arg })), calls, locs: [] });
const set = (name: string, anims: SetFacts['anims'], archive = 'RUN/UIZANIM.ZAR'): SetFacts => ({ archive, name, anims });

const DIALOGS: DialogFacts[] = [
  dialog('dlgBoot.rdr', ['dlgBoot.rdr'], [{ owner: 'SCREEN', trigger: 'EVENT ONSTART', animation: 'start', argument: null }]),
  dialog('dlgMovie.rdr', ['uianim.rdr'], [{ owner: 'SCREEN', trigger: 'EVENT ONMPEGEND', animation: 'switch_menu', argument: 'dlgMenu.rdr' }],
    [{ key: 'FILENAME', value: 'run/movies/a.pss' }]),
  dialog('dlgMenu.rdr', ['dlgMenu.rdr', 'uianim.rdr'], [
    { owner: 'online_button', trigger: 'BUTTON CROSS', animation: 'toOnline', argument: null },
    { owner: 'options_button', trigger: 'BUTTON CROSS', animation: 'toOptions', argument: null },
    { owner: 'options_button', trigger: 'BUTTON DOWN', animation: 'nothing', argument: null },
  ]),
  dialog('dlgNet.rdr', ['dlgNet.rdr', 'uianim.rdr'], [{ owner: 'SCREEN', trigger: 'BUTTON TRIANGLE', animation: 'back', argument: null }]),
  dialog('dlgLobby.rdr', ['uianim.rdr'], [{ owner: 'SCREEN', trigger: 'BUTTON CROSS', animation: 'shared_leave', argument: null }]),
  dialog('dlgOpts.rdr', ['dlgOpts.rdr', 'uianim.rdr'], [{ owner: 'SCREEN', trigger: 'BUTTON CROSS', animation: 'shared_leave', argument: null }]),
  dialog('dlgRoom.rdr', [], []),
  dialog('dlgCode.rdr', [], []),
  dialog('dlgAfterCode.rdr', [], []),
  dialog('dlgNobody.rdr', [], []),
];
const SETS: SetFacts[] = [
  set('dlgBoot.rdr', [anim('start', [['SWITCHMENU', 'dlgMovie.rdr']]), anim('unbound', [['SWITCHMENU', 'dlgGone.rdr']])]),
  set('dlgMenu.rdr', [anim('toOnline', [['SWITCHMENU', 'dlgNet.rdr']]), anim('toOptions', [], ['inner']), anim('inner', [['SwitchMenu', 'dlgopts']])]),
  set('dlgNet.rdr', [anim('back', [['SWITCHMENU', 'dlgMenu.rdr'], ['SWITCHMENU', 'REBOOT']]), anim('join', [['SWITCHMENU', 'dlgLobby.rdr']])]),
  set('dlgOpts.rdr', []),
  // The library: `switch_menu` takes the binding's argument; `shared_leave` returns to two places; `ReturnToRoom`
  // belongs to no dialog.
  set('UIanim.rdr', [
    anim('switch_menu', [['SWITCHMENU', 'INPUT_STRING']]),
    anim('shared_leave', [['SWITCHMENU', 'dlgOpts.rdr'], ['SWITCHMENU', 'dlgNet.rdr']]),
    anim('ReturnToRoom', [['SWITCHMENU', 'dlgRoom.rdr'], ['PlayMPEG', 'run/movies/b.pss']]),
  ]),
  // The same name in another archive is not looked at while UIZANIM has it.
  set('UIanim.rdr', [anim('switch_menu', [['SWITCHMENU', 'dlgNobody.rdr']])], 'RUN/MPZANIM.ZAR'),
];

describe('buildGraph', () => {
  const g = buildGraph(DIALOGS, SETS, ['dlgCode.rdr']);
  const edge = (from: string, to: string) => g.edges.filter((e) => e.from === from && e.to === to);

  it('follows a binding into its animation and the animations it calls, the set named first winning', () => {
    expect(edge('dlgBoot.rdr', 'dlgMovie.rdr')).toEqual([{ from: 'dlgBoot.rdr', to: 'dlgMovie.rdr', kind: 'dialog', via: 'binding SCREEN EVENT ONSTART start SWITCHMENU', own: true }]);
    expect(edge('dlgMenu.rdr', 'dlgopts')).toEqual([{ from: 'dlgMenu.rdr', to: 'dlgopts', kind: 'dialog', via: 'binding options_button BUTTON CROSS toOptions SwitchMenu', own: true }]);
    expect(g.edges.some((e) => e.to === 'dlgNobody.rdr')).toBe(false);
  });
  it('takes a library animation\'s INPUT_STRING from the binding\'s argument, and counts it as the dialog\'s own', () => {
    expect(edge('dlgMovie.rdr', 'dlgMenu.rdr')).toEqual([{ from: 'dlgMovie.rdr', to: 'dlgMenu.rdr', kind: 'dialog', via: 'binding SCREEN EVENT ONMPEGEND switch_menu SWITCHMENU', own: true }]);
  });
  it('marks a library animation\'s own targets as not the dialog\'s own', () => {
    expect(edge('dlgLobby.rdr', 'dlgOpts.rdr').map((e) => e.own)).toEqual([false]);
    expect(edge('dlgOpts.rdr', 'dlgNet.rdr').map((e) => e.own)).toEqual([false]);
  });
  it('keeps what the dialog\'s own set names outside a binding, a switch state, a movie of the layout', () => {
    expect(edge('dlgBoot.rdr', 'dlgGone.rdr').map((e) => e.via)).toEqual(['script dlgBoot.rdr/unbound SWITCHMENU']);
    expect(edge('dlgNet.rdr', 'dlgLobby.rdr').map((e) => e.via)).toEqual(['script dlgNet.rdr/join SWITCHMENU']);
    expect(edge('dlgNet.rdr', 'REBOOT').map((e) => e.kind)).toEqual(['state']);
    expect(edge('dlgMovie.rdr', 'run/movies/a.pss')).toEqual([{ from: 'dlgMovie.rdr', to: 'run/movies/a.pss', kind: 'movie', via: 'layout FILENAME', own: true }]);
  });
  it('lists a library set\'s targets apart, and the dangling and unreferenced names', () => {
    expect(g.library.map((e) => `${e.set}/${e.animation} ${e.fn} -> ${e.to}`)).toEqual([
      'UIanim.rdr/shared_leave SWITCHMENU -> dlgOpts.rdr', 'UIanim.rdr/shared_leave SWITCHMENU -> dlgNet.rdr',
      'UIanim.rdr/ReturnToRoom SWITCHMENU -> dlgRoom.rdr', 'UIanim.rdr/ReturnToRoom PlayMPEG -> run/movies/b.pss',
      'UIanim.rdr/switch_menu SWITCHMENU -> dlgNobody.rdr',
    ]);
    expect(g.dangling).toEqual(['dlgGone.rdr']);
    expect(g.unreferenced).toEqual(['dlgAfterCode.rdr', 'dlgBoot.rdr']);
    expect(missingMovies(g, ['RUN/MOVIES/A.PSS'])).toEqual(['run/movies/b.pss']);
    expect(dialogPairs(g, DIALOGS)).toContain('dlgMenu.rdr -> dlgOpts.rdr');
  });
});

describe('classify', () => {
  it('boot before the menu; the online branch first; the nearest branch; then library edges; then the code', () => {
    const extra: DialogFacts[] = [...DIALOGS.slice(0, 8), dialog('dlgAfterCode.rdr', [], []), dialog('dlgNobody.rdr', [], [])];
    const g = buildGraph(extra, SETS, ['dlgCode.rdr']);
    g.edges.push({ from: 'dlgCode.rdr', to: 'dlgAfterCode.rdr', kind: 'dialog', via: 'layout X', own: true });
    g.edges.push({ from: 'dlgNet.rdr', to: 'dlgRoom.rdr', kind: 'dialog', via: 'binding SCREEN EVENT X ReturnToRoom SWITCHMENU', own: false });
    const branches = [{ controls: ['online_button'], cls: 'online' }, { controls: ['options_button'], cls: 'options' }];
    const c = classify(g, extra, 'dlgBoot.rdr', 'dlgMenu.rdr', ['dlgCode.rdr'], branches);
    expect(Object.fromEntries(c)).toEqual({
      'dlgBoot.rdr': 'boot', 'dlgMovie.rdr': 'boot', 'dlgMenu.rdr': 'main menu',
      'dlgNet.rdr': 'online', 'dlgLobby.rdr': 'online', 'dlgOpts.rdr': 'options', 'dlgRoom.rdr': 'online',
      'dlgCode.rdr': 'code', 'dlgAfterCode.rdr': 'code', 'dlgNobody.rdr': 'unplaced',
    });
  });

  // The close review's note: the spread's tie rule (step 3) and resolveSets' own-archive-first order had no test that
  // could fail. With MENU_BRANCHES' four distinct classes the spread's frontier is already in rank order, so its first
  // finder is always the lowest rank; two branches sharing a class put a lower rank after a higher one.
  it('step 3: a dialog two classes reach in the same wave takes the lower rank, not the first to reach it', () => {
    const facts = ['dlgS.rdr', 'dlgM.rdr', 'dlgA.rdr', 'dlgB.rdr', 'dlgC.rdr', 'dlgT.rdr'].map((n) => dialog(n, [], []));
    const e = (from: string, to: string, via: string, own: boolean) => ({ from, to, kind: 'dialog' as const, via, own });
    const g = {
      edges: [
        e('dlgS.rdr', 'dlgM.rdr', 'layout X', true),
        ...['A', 'B', 'C'].map((x) => e('dlgM.rdr', `dlg${x}.rdr`, `binding ${x.toLowerCase()} BUTTON CROSS go SWITCHMENU`, true)),
        e('dlgB.rdr', 'dlgT.rdr', 'script lib/x SWITCHMENU', false), e('dlgC.rdr', 'dlgT.rdr', 'script lib/x SWITCHMENU', false),
      ],
      library: [], dangling: [], unreferenced: [],
    };
    const branches = [{ controls: ['a'], cls: 'x' }, { controls: ['b'], cls: 'y' }, { controls: ['c'], cls: 'x' }];
    const c = classify(g, facts, 'dlgS.rdr', 'dlgM.rdr', [], branches);
    expect([c.get('dlgB.rdr'), c.get('dlgC.rdr'), c.get('dlgT.rdr')]).toEqual(['y', 'x', 'x']);
  });
});

describe('resolveSets: the dialog\'s own archive first, then UIZANIM, EXTZANIM, MPZANIM (SET_RESOLUTION_READING)', () => {
  const sets = [
    set('UIanim.rdr', [anim('ui')]), set('UIanim.rdr', [anim('ext')], 'RUN/EXTZANIM.ZAR'),
    set('UIanim.rdr', [anim('mp')], 'RUN/MPZANIM.ZAR'), set('dlgExit.rdr', [], 'RUN/EXTZANIM.ZAR'),
    set('dlgRound.rdr', [], 'RUN/MPZANIM.ZAR'),
  ];
  const where = (d: DialogFacts) => resolveSets(d, sets).map((s) => `${s.archive} ${s.name}`);

  it('a set two archives hold resolves in the archive of the dialog\'s own set', () => {
    expect(where(dialog('dlgExit.rdr', ['dlgExit.rdr', 'UIanim.rdr'], []))).toEqual(['RUN/EXTZANIM.ZAR dlgExit.rdr', 'RUN/EXTZANIM.ZAR UIanim.rdr']);
    expect(where(dialog('dlgRound.rdr', ['dlgRound.rdr', 'UIanim.rdr'], []))).toEqual(['RUN/MPZANIM.ZAR dlgRound.rdr', 'RUN/MPZANIM.ZAR UIanim.rdr']);
  });
  it('with no own set, the first of UIZANIM, EXTZANIM, MPZANIM that holds it', () => {
    expect(where(dialog('dlgNone.rdr', ['UIanim.rdr'], []))).toEqual(['RUN/UIZANIM.ZAR UIanim.rdr']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The card's valves and the menu strings.

describe('the card\'s PersistentValves.rdr and the UIMnLOC table, by name and count', () => {
  it('lists the valve names in order and refuses a record without a NAME', () => {
    const root: RdrNode = [[['NAME', ['STEREO_CONTROLLER'], 'VAL', ['1']], ['NAME', ['AutoAim'], 'VAL', ['0']]]];
    expect(valveNames(root)).toEqual(['STEREO_CONTROLLER', 'AutoAim']);
    expect(() => valveNames([[['VAL', ['1']]]])).toThrow(/no NAME/);
  });
  it('reads each valve\'s VAL with its NAME, in order (OPT-02; research 229 §2), and refuses a record without a whole VAL', () => {
    const root: RdrNode = [[['NAME', ['STEREO_CONTROLLER'], 'VAL', ['1']], ['NAME', ['GameSpeedFilter'], 'VAL', ['65000']]]];
    expect(valveValues(root)).toEqual({ STEREO_CONTROLLER: 1, GameSpeedFilter: 65000 });
    expect(Object.keys(valveValues(root))).toEqual(valveNames(root));
    const first = ['NAME', ['STEREO_CONTROLLER'], 'VAL', ['1']];   // two records: a one-record list unwraps as valveNames' does
    expect(() => valveValues([[first, ['NAME', ['AutoAim']]]])).toThrow(/record 1: AutoAim has no VAL/);
    expect(() => valveValues([[first, ['NAME', ['AutoAim'], 'VAL', ['x']]]])).toThrow(/record 1: AutoAim has no VAL/);
  });
  it('takes PersistentValves.rdr out of a scrambled save file with the card file reader (tools/cardFile.ts), null without it', () => {
    // Hand-built saves (cardFileSupport.ts, test support): one with the valve module, one with no module list at all.
    expect([...persistentValvesOf(scrambleForTest(handGameSave()))!]).toEqual([...handValves()]);
    expect(valveNames(parseRdr(persistentValvesOf(scrambleForTest(handGameSave()))!))).toEqual(['AutoAim', 'Gamma']);
    expect(persistentValvesOf(scrambleForTest(handLauncherSave()))).toBeNull();
  });
  it('counts the strings, their id range, and the message names that spell their own id', () => {
    expect(locSummary([{ id: 1, msg: '_1_A_MSG' }, { id: 7, msg: '_7_B_C_MSG' }, { id: 9, msg: '_8_X_MSG' }]))
      .toEqual({ entries: 3, minId: 1, maxId: 9, msgSpellsId: 2 });
  });
  it('counts a name with a suffix past _MSG by MSG_NAME, the one shape (the close review, round 1, note 1)', () => {
    // UIMnLOC's `_1065_MEDIUS_HW_MSG_sVendor_sProduct` spells its own id; `_15_ARMORY_MSGX` and `_1_A` are not MSG_NAMEs.
    expect(locSummary([{ id: 1065, msg: '_1065_MEDIUS_HW_MSG_sVendor_sProduct' }, { id: 15, msg: '_15_ARMORY_MSGX' },
      { id: 1, msg: '_1_A' }, { id: 10, msg: '_1_B_MSG' }]).msgSpellsId).toBe(1);
  });
});
