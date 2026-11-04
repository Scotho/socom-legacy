import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, readZarMembers, readZdbMember, Zar, type RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { arsenalOf, decodeUiOp, missionValves, parseAnimSets, parseUiLayout, uiSet, type Loadout, type UiOp, type UiProgram } from '@s2u/scene';
import { decodeUiSoundCommand } from '@s2u/ui';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { ARMORY_SERVER_NAME_READING } from '../src/net/protocol';
import { armoryFromDisc, type ArmoryData } from '../src/armoryData';
import { Armory, armoryCueOf, ARMORY_KEY_LABELS, armoryNames, ARMORY_MENU_KEYS_READING, ARMORY_PAD, ARMORY_PANE_TEXT, armoryTap, HOST_ONSTART, parseProfile, profileKey, type ArmoryDeps } from '../src/armory';
import { stepArmory, uiOf, type ArmoryExit } from '../src/armoryState';
import { modelFramePoint } from '../src/armoryView';

/**
 * The ARMORY in the page (web sprint 5 S3; W5.R1-R4): the controller over a hand-built dialog -- its scripts played for
 * the looks, the save behind a guard, the exit handed to the seam -- then the disc's own dialog (fixture-backed).
 */

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'LIBRARIES', ['ui/assetlib/uimp'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['multplay_back.tif']], 'FONT', ['font_text_01'],
    'SCRIPT_LIBRARY', ['dlg_equipment_mp.rdr'],
    'OBJECTS', [
      obj('NAME', ['InstructionText'], 'TYPE', ['TEXT'], 'XPOS', ['320'], 'YPOS', ['92'], 'SPEC', ['CAPTION', [' '], 'HCENTERED', []]),
      obj('NAME', ['Seal1PrimDummy'], 'TYPE', ['TEXT'], 'XPOS', ['25'], 'YPOS', ['150'], 'SPEC', ['CAPTION', [' ']]),
      obj('NAME', ['eq_Seal1_win'], 'TYPE', ['IMAGE'], 'XPOS', ['-10'], 'YPOS', ['-47'], 'SPEC', ['CHILDOF', ['Seal1PrimDummy'], 'FILENAME', ['backsolid.tif'], 'SIZE', ['150', '290']]),
      obj('NAME', ['Seal1PaneDummy'], 'TYPE', ['IMAGE'], 'XPOS', ['0'], 'YPOS', ['130'], 'SPEC', ['CHILDOF', ['Seal1PrimDummy'], 'SIZE', ['150', '17']]),
      obj('NAME', ['Seal1Primarypane'], 'TYPE', ['IMAGE'], 'XPOS', ['-5'], 'YPOS', ['0'], 'SPEC', ['CHILDOF', ['Seal1PaneDummy'], 'FILENAME', ['brown_back_real.tif'], 'SIZE', ['165', '21']]),
      obj('NAME', ['Seal1Secondarypane'], 'TYPE', ['IMAGE'], 'XPOS', ['-5'], 'YPOS', ['20'], 'SPEC', ['CHILDOF', ['Seal1PaneDummy'], 'FILENAME', ['brown_back_real.tif'], 'SIZE', ['165', '21']]),
      obj('NAME', ['Seal1Donepane'], 'TYPE', ['IMAGE'], 'XPOS', ['-5'], 'YPOS', ['113'], 'SPEC', ['CHILDOF', ['Seal1PaneDummy'], 'FILENAME', ['brown_back_real.tif'], 'SIZE', ['165', '21']]),
      obj('NAME', ['Seal2PrimDummy'], 'TYPE', ['TEXT'], 'XPOS', ['180'], 'YPOS', ['150'], 'SPEC', ['CAPTION', [' ']]),
      obj('NAME', ['eq_Seal2_win'], 'TYPE', ['IMAGE'], 'XPOS', ['-10'], 'YPOS', ['-47'], 'SPEC', ['CHILDOF', ['Seal2PrimDummy'], 'FILENAME', ['backsolid.tif'], 'SIZE', ['150', '290']]),
      obj('NAME', ['CrossFieldText'], 'TYPE', ['TEXT'], 'XPOS', ['25'], 'YPOS', ['427'], 'SPEC', ['CAPTION', [' ']]),
      obj('NAME', ['TriFieldText'], 'TYPE', ['TEXT'], 'XPOS', ['500'], 'YPOS', ['1'], 'SPEC', ['CHILDOF', ['CrossFieldText'], 'CAPTION', ['¬ BACK']]),
    ],
    'ANIMATIONS', [obj('EVENT', ['ONSTART'], 'ANIMATION', ['UiEquipSwitch']), obj('EVENT', ['ONSTART'], 'ANIMATION', ['UiBackToLobby'])],
    'CONTROLS', [
      obj('NAME', ['EquipMpSealBtn'], 'TYPE', ['BUTTON'], 'SPEC', ['ANIMATIONS', [obj('EVENT', ['ONACTIVATE'], 'ANIMATION', ['OnMpSealBtnAct'])]]),
    ],
  ],
]]);
const ui = (fn: string, arg: string): UiOp => ({ op: 'ui', command: { node: null, op: 0, fn, arg, loc: 0, extra: [] } });
const caption = (node: string, loc: number): UiOp => ({ op: 'ui', command: { node, op: 1, fn: null, arg: 'NA', loc, extra: [] } });
const program = (name: string, ops: UiOp[]): UiProgram => ({ name, nodes: [], sequences: [{ name: 'NA', activation: 1, ops }] });
const programs = [
  program('UiEquipSwitch', [ui('ActivateButton', 'EquipMpSealBtn')]),
  program('OnMpSealBtnAct', [
    { op: 'if', depth: 1, tokens: [{ t: 'valve', valve: 'MpCharSet', op: '==', operand: 1 }] }, caption('InstructionText', 34),
    { op: 'else', depth: 1 }, caption('InstructionText', 35), { op: 'endif', depth: 1 },
  ]),
  program('UiBackToLobby', [{ op: 'valve', valve: 'Pulled', operation: '=', operand: 1 }]),
];
const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const item = (name: string, id: number): RdrNode[] => rec(['InternalName', name], ['ID', String(id)], ['AMMO_TYPES', []]);
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [item('M4A1', 54), item('M16A2', 51), item('HK5', 31), item('Mark 23', 15), item('M67', 121), item('HE', 126), item('Double Ammo Load', 194)]] as RdrNode);
const valves = new Map([['Enable_m4Acarbine', 1], ['Enable_M16', 1], ['Enable_mp5', 9], ['Enable_Mark23', 1], ['Enable_frag', 9], ['Enable_HEgren', 9], ['Enable_2xammo', 9]]);
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const character = (column: string, index: number, loadout: Loadout) => ({
  column: column as 'Seal1', side: 'seal' as const, index, type: column, character: column, model: null, textures: [], loadout, portrait: `${column}.tif`,
});
const DATA: ArmoryData = {
  archive: 'MP2', layout, uiSounds: [], scripts: [{ set: 'dlg_equipment_mp.rdr', programs }], items: [], fonts: [], models: [], modelTextures: [],
  strings: [{ id: 34, msg: '_34_', text: 'Select SEAL 1' }, { id: 35, msg: '_35_', text: 'Select SEAL 2' }],
  bitmaps: [], light: null, missing: [],
  roster: { equipmentLibrary: null, equipmentStem: null, missionTitle: 'FROSTFIRE', characters: [character('Seal1', 0, kit(54, 15, 121, 126, 194)), character('Seal2', 1, kit(31, 15, 121, 126, 194))] },
};

function make(over: Partial<ArmoryDeps> = {}): { a: Armory; applied: ArmoryExit[]; store: Map<string, string>; t: { now: number }; sounds: string[] } {
  const applied: ArmoryExit[] = [], store = new Map<string, string>(), t = { now: 0 }, sounds: string[] = [];
  const a = new Armory({
    clock: () => t.now, change: (e) => applied.push(e), sound: (s) => sounds.push(s),
    store: { get: (k) => store.get(k) ?? null, set: (k, v) => { store.set(k, v); } }, ...over,
  });
  a.setData(DATA);
  a.setWorld({ arsenal, valves, side: 'seal', map: 'MP2', archive: 'MP2' });
  return { a, applied, store, t, sounds };
}
const press = (a: Armory, t: { now: number }, ...keys: string[]): void => { for (const k of keys) { t.now += 1; a.key(k); a.frame(0); } };

describe('the title bar names (ARMORY_SERVER_NAME_READING, ARMORY_GAME_NAME_READING; the controller ruling, 2026-10-01)', () => {
  it('online: the match server name over the room name (MEDIUS_LOBBY_NAME, GAMENAMEVAR); offline both blank', () => {
    // The owner's capture: "US East (Ohio)" (the lobby world, `roomname` at (200,46) x0.6) over "ssdsa" (the game).
    expect(armoryNames({ online: true, server: 'US East (Ohio)', room: 'CROSSROADS' })).toEqual({ room: 'US East (Ohio)', game: 'CROSSROADS' });
    expect(armoryNames({ online: true, server: null, room: 'CROSSROADS' })).toEqual({ room: ARMORY_SERVER_NAME_READING, game: 'CROSSROADS' });
    expect(ARMORY_SERVER_NAME_READING).toBe('LOCAL');
    expect(armoryNames({ online: false, server: 'LOCAL', room: 'CROSSROADS' })).toEqual({ room: '', game: '' });
    const { a } = make({ names: () => armoryNames({ online: true, server: 'US East (Ohio)', room: 'FROSTFIRE' }) });
    expect([a.uivar('MEDIUS_LOBBY_NAME'), a.uivar('GAMENAMEVAR')]).toEqual(['US East (Ohio)', 'FROSTFIRE']);
  });
});

describe('the ARMORY controller', () => {
  it('refreshes a mode-only world change and rewrites every logical column/valve without mutating map data', () => {
    const { a, applied, t } = make();
    a.open(null);
    a.setWorld({ arsenal, valves, side: 'seal', map: 'MP2', archive: 'MP2', eqLimit: 1 });
    expect(a.isOpen()).toBe(false);
    expect(a.context()!.kits).toEqual([[254, 16, 123, 122, 254], [254, 16, 123, 122, 254]]);
    expect(a.context()!.valves.get('Enable_m4Acarbine')).toBe(0);
    expect(valves.get('Enable_m4Acarbine')).toBe(1);
    expect(a.open({ type: 1, kit: kit(31, 15, 121, 126, 194) }, { chosen: true })).toBe(true);
    expect(a.state()!.column).toBe(0);
    expect(a.state()!.kits[1]).toEqual([254, 16, 123, 122, 254]);
    expect(applied.at(-1)).toEqual({ type: 1, kit: [254, 16, 123, 122, 254], picks: [] });
    press(a, t, 'Enter');
    expect(a.state()!.row).toBe(2);
  });

  it('opens only with its data and a world; its scripts play for the looks (ActivateButton runs the ONACTIVATE binding)', () => {
    const bare = new Armory({ clock: () => 0, change: () => {} });
    expect([bare.ready(), bare.open(null)]).toEqual([false, false]);
    const { a, sounds } = make();
    expect(a.open(null)).toBe(true);
    a.frame(0);
    expect(a.text(a.scripts()!.node('InstructionText').caption)).toBe('Select SEAL 1');
    expect(a.scripts()!.valve('Pulled')).toBe(0);                // UiBackToLobby is the page's (HOST_ONSTART)
    expect([...HOST_ONSTART]).toEqual(['UiBackToLobby']);         // net_monitor runs: its lights hang from the root
    // The entering .DINK, and `ActivateButton("EquipMpSealBtn")`'s SELECTION (.METAL; research 122 R122.13).
    expect([...sounds].sort()).toEqual(['.DINK', '.METAL']);
    expect(a.open(null)).toBe(false);                            // already open
  });

  it("the preview's model drops the parts its scripts switched off (ARMORY_MODEL_PART_REF): the 552's silencer, from the page's parts or the data's", () => {
    const spin = program('Spin552', [{ op: 'active', node: 'Equipsig_commando', on: true }, { op: 'active', node: 'silencer', on: false }]);
    const models = [{ name: 'Equipsig_commando', model: 'sig_commandoUI', azimuth: 10.5, elev: 2.75, distance: 27 }];
    const data: ArmoryData = {
      ...DATA, layout: { ...layout, models, animations: [...layout.animations, { event: 'ONSTART', button: null, animation: 'Spin552' }] },
      scripts: [{ set: 'dlg_equipment_mp.rdr', programs: [...programs, spin] }],
    };
    const parts = { commando_high: 1, silencer: 1 };
    const { a } = make({ modelParts: (m) => (m === 'sig_commandoUI' ? Object.keys(parts) : null) });
    a.setData(data);
    a.open(null);
    a.frame(0);
    expect(a.models().map((m) => [m.entry.name, m.hidden])).toEqual([['Equipsig_commando', ['silencer']]]);
    // Without the page's lookup the data's decoded models answer (the test room's worker decodes them).
    const decoded = { parts: Object.keys(parts).map((node) => ({ node, meshes: [] })), textures: [], diagnostics: [] } as unknown as ArmoryData['models'][number]['decoded'];
    const b = make().a;
    b.setData({ ...data, models: [{ model: 'sig_commandoUI', decoded }] });
    b.open(null);
    b.frame(0);
    expect(b.models().map((m) => m.hidden)).toEqual([['silencer']]);
  });

  it('plays every SOUND the scripts run, ActivateButton\'s and PopUpDialog\'s .METAL, and the pull-out\'s (research 182 §2.21, §3)', () => {
    const sound: UiOp = { op: 'sound', sound: '.SLIDE', flags: 0x80, newPlay: true, node: 0 };
    const extra = [
      program('OnMpSealBtnAct', [sound]),
      program('Popper', [ui('POPUPDIALOG', 'NA')]),
      program('Absent', [ui('ActivateButton', 'NoSuchBtn')]),
    ];
    const data: ArmoryData = { ...DATA, scripts: [{ set: 'dlg_equipment_mp.rdr', programs: [...programs.filter((p) => p.name !== 'OnMpSealBtnAct'), ...extra] }] };
    const { a, t, sounds } = make();
    a.setData(data);
    a.open(null);
    a.frame(0);
    // A script's SOUND other than .NEG reaches the page (the ONACTIVATE OnMpSealBtnAct's .SLIDE here).
    expect(sounds.filter((s) => s === '.SLIDE')).toHaveLength(1);
    expect(sounds.filter((s) => s === '.METAL')).toHaveLength(1);
    sounds.length = 0;
    a.scripts()!.start('Absent'); a.frame(0);                     // no such control: no SELECTION (FUN_00366b60)
    expect(sounds).toEqual([]);
    a.scripts()!.start('Popper'); a.frame(0);                     // FUN_0027eff0 D:L126897-126900
    expect(sounds).toEqual(['.METAL']);
    sounds.length = 0;
    t.now += 1; a.pullOut(); a.pullOut();                         // popup 47's PopUpDialog, once
    expect(sounds).toEqual(['.METAL']);
  });

  it('the panes read each item\'s Description (ARMORY_PANE_TEXT; FUN_002af190 D:L153580-153640)', () => {
    expect(ARMORY_PANE_TEXT).toBe('Description');
    const { a } = make();
    const desc = arsenalOf(['ZAMMO', [], 'ZWEAPON', [rec(['InternalName', 'M4A1'], ['ID', '54'], ['AMMO_TYPES', []], ['DisplayName', 'M4'], ['Description', 'M4A1 CARBINE']), item('Mark 23', 15)]] as RdrNode);
    a.setWorld({ arsenal: desc, valves, side: 'seal', map: 'MP2', archive: 'MP2' });
    expect(a.uivar('Char1PrimaryWeaponDescr')).toBe('M4A1 CARBINE');
  });

  it('takes every key but Esc while open, stepping by ARMORY_MENU_KEYS_READING; the pad by ARMORY_PAD', () => {
    const { a, t } = make();
    expect(a.key('KeyD')).toBe(false);                           // closed: not the screen's
    a.open(null);
    expect(a.key('Escape')).toBe(false);
    expect(a.key('KeyQ')).toBe(true);                            // taken, no input
    press(a, t, 'ArrowRight');
    expect([a.state()!.column, a.text(a.scripts()!.node('InstructionText').caption)]).toEqual([1, 'Select SEAL 2']);
    t.now += 1;
    a.pad(new Set(['Left']));
    expect(a.state()!.column).toBe(0);
    expect([ARMORY_MENU_KEYS_READING['Enter'], ARMORY_MENU_KEYS_READING['Backspace'], ARMORY_MENU_KEYS_READING['KeyR'], ARMORY_MENU_KEYS_READING['KeyV']])
      .toEqual(['cross', 'triangle', 'circle', 'square']);
    expect([ARMORY_PAD.Cross, ARMORY_PAD.Circle, ARMORY_PAD.Square, ARMORY_PAD.Triangle, ARMORY_PAD.Start]).toEqual(['cross', 'circle', 'square', 'triangle', undefined]);
    expect(ARMORY_KEY_LABELS[0xa6]).toBe('[ENTER]');
  });

  it('live: the commit and each item step go to the seam as they are made; DONE simply closes', () => {
    const { a, t, applied } = make();
    a.open(null);
    press(a, t, 'ArrowRight', 'Enter');                          // SEAL 2 committed: its type, at once
    expect(applied).toEqual([{ type: 1, kit: DATA.roster!.characters[1]!.loadout, picks: [] }]);
    press(a, t, 'ArrowRight');                                   // HK5 -> the next the SEAL takes, at once
    expect(applied).toHaveLength(2);
    expect(applied[1]!.type).toBe(1);
    expect(applied[1]!.kit[0]).not.toBe(31);
    expect(applied[1]!.picks).toEqual([{ slot: 0, id: applied[1]!.kit[0] }]);
    press(a, t, 'ArrowUp', 'Enter');                             // DONE, X
    expect([a.isOpen(), applied.length]).toEqual([false, 2]);    // nothing more to hand on
  });

  it('opens only on data read for the map shown (a map changed since the data was asked for: not ready)', () => {
    const { a } = make();
    a.setWorld({ arsenal, valves, side: 'seal', map: 'MP6', archive: 'MP6' });
    expect([a.ready(), a.open(null)]).toEqual([false, false]);
    a.setData({ ...DATA, archive: 'MP6' });
    expect(a.ready()).toBe(true);
    expect(a.open(null)).toBe(true);
    a.setData({ ...DATA, archive: 'MP6' });                     // new data under an open screen closes it
    expect(a.isOpen()).toBe(false);
  });

  it('Square stores the record per map and side (W5.R4 as amended); the next opening starts on it, CUSTOM', () => {
    const { a, t, store } = make();
    a.open(null);
    press(a, t, 'ArrowRight', 'Enter', 'KeyV');
    const key = profileKey('MP2', 'seal');
    expect(key).toBe('s2u.armory.v1.MP2.seal');
    expect(parseProfile(store.get(key)!)).toEqual({ charSet: 2, items: [3, 75, 36, 37, 35], valid: true });
    a.close();
    a.open(null);
    expect([a.state()!.column, a.state()!.committed, a.state()!.custom]).toEqual([1, 1, 1]);
    // Circle's mode 7: the record stays, marked invalid; the next opening ignores it.
    t.now += 1;
    a.close(); a.open(null);
    press(a, t, 'Enter', 'KeyR');
    expect(parseProfile(store.get(key)!)?.valid).toBe(false);
  });

  it('a store that throws or holds garbage reads as no profile, and a write that throws is dropped', () => {
    const throwing = { get: (): string | null => { throw new Error('blocked'); }, set: (): void => { throw new Error('blocked'); } };
    const { a, t } = make({ store: { get: (k) => { try { return throwing.get(); } catch { return k ? null : null; } }, set: () => { try { throwing.set(); } catch { /* dropped */ } } } });
    a.open(null);
    press(a, t, 'Enter', 'KeyV');
    expect(a.isOpen()).toBe(true);
    expect([parseProfile(null), parseProfile('{'), parseProfile('{"charSet":1,"items":[1,2]}')]).toEqual([null, null, null]);
  });

  it('the pull-out is a notice (the screen still the player\'s); the page\'s close and a change of world close, applying nothing more', () => {
    const { a, t, applied } = make();
    a.open(null);
    press(a, t, 'Enter');
    expect(applied.map((e) => e.type)).toEqual([0]);
    a.pullOut();
    t.now += 10; a.frame(0);
    expect([a.isOpen(), a.state()!.screen, a.state()!.pulledAt !== null]).toEqual([true, 'row', true]);
    a.close();                                                   // the round's start
    expect([a.isOpen(), applied.length]).toEqual([false, 1]);
    a.open(null);
    a.setWorld({ arsenal, valves, side: 'terrorist', map: 'MP2', archive: 'MP2' });
    expect([a.isOpen(), applied.length]).toEqual([false, 1]);
  });

  it('a tap is the presses that reach what is under it (ARMORY_TOUCH_READING)', () => {
    const { a, t } = make();
    a.open(null);
    a.frame(0);
    const ctx = a.context()!, st = a.state()!;
    const quads = a.quads({ 'backsolid.tif': { width: 16, height: 16 } });
    expect(armoryTap(ctx, st, layout, quads, 180, 150)).toEqual(['right']);   // SEAL 2's window: the cursor to it
    expect(armoryTap(ctx, st, layout, quads, 40, 150)).toEqual(['cross']);    // the cursor's own: commit
    expect(armoryTap(ctx, st, layout, quads, 620, 5)).toEqual([]);
    t.now += 1;
    expect(a.tap(40, 150)).toBe(true);
    expect(a.state()!.screen).toBe('row');
  });

  it('a pane is tapped where the scripts put it, not at a fixed origin; the DONE line is Cross left, Circle right', () => {
    const { a, t } = make();
    a.open(null);
    press(a, t, 'Enter');                                        // SEAL 1's rows
    const c = a.context()!, st = a.state()!;
    const at = { Seal1PaneDummy: { x: 300, y: 200, visible: true }, Seal1Primarypane: { x: 295, y: 200, visible: true },
      Seal1Secondarypane: { x: 295, y: 220, visible: true }, Seal1Donepane: { x: 295, y: 313, visible: true } } as Record<string, { x: number; y: number; visible: boolean }>;
    const place = (n: string) => at[n] ?? null;
    expect(armoryTap(c, st, layout, [], 300, 225, { place })).toEqual(['down']);            // the Secondary pane
    expect(armoryTap(c, st, layout, [], 300, 318, { place })).toEqual(['down', 'down', 'down', 'down', 'down', 'cross']);   // DONE: stepped to, then Cross
    expect(armoryTap(c, st, layout, [], 10, 225, { place })).toEqual([]);                    // the old fixed origin: nothing
    // The instruction line, split at its second glyph: a weapon row's Square | Circle, DONE's Cross | Circle.
    const line = [{ object: 'InstructionText', texture: 'x', x: 100, y: 80, w: 400, h: 16, u0: 0, v0: 0, u1: 1, v1: 1, rgb: [91, 72, 36] as const, alpha: 128 }];
    expect(armoryTap(c, st, layout, line, 150, 85, { lineSplit: 300 })).toEqual(['square']);
    expect(armoryTap(c, st, layout, line, 350, 85, { lineSplit: 300 })).toEqual(['circle']);
    const done = stepArmory(c, st, 'up', 99).state;
    expect(done.screen).toBe('done');
    expect(armoryTap(c, done, layout, line, 150, 85, { lineSplit: 300 })).toEqual(['cross']);
    expect(armoryTap(c, done, layout, line, 350, 85, { lineSplit: 300 })).toEqual(['circle']);
  });

  it('the lines draw the keys on a keyboard, the game\'s glyphs on a pad and on a touch screen', () => {
    for (const [device, labelled] of [['keyboard', true], ['pad', false], ['touch', false]] as const) {
      const { a } = make({ device: () => device });
      a.open(null);
      a.frame(0);
      a.scripts()!.node('InstructionText').caption = { text: '\u00b4 STORE LOADOUT \u00b7 SELECT DEFAULT WEAPONS' };
      const glyphFonts = [{ name: 'font_text_01', textures: ['font_text_01.tif', 'font_special_01.tif'], xspacing: 0, opacity: 1, scale: 1, topy: null, boty: null, dropShadow: null,
        glyphs: [...Array.from({ length: 95 }, (_, i) => ({ code: 32 + i, texture: 1, baseline: 0, color: null, ul: [0, 0] as [number, number], lr: [10, 25] as [number, number], disp: [0, 0] as [number, number], hscale: 1, vscale: 1 })),
          ...[0xb4, 0xb7].map((code) => ({ code, texture: 2, baseline: 0, color: [150, 150, 150] as [number, number, number], ul: [0, 6] as [number, number], lr: [25, 31] as [number, number], disp: [0, 0] as [number, number], hscale: 0.9, vscale: 0.9 }))] }];
      (a as unknown as { data: ArmoryData }).data = { ...DATA, fonts: glyphFonts };
      const q = a.quads({ 'font_text_01.tif': { width: 64, height: 32 }, 'font_special_01.tif': { width: 64, height: 32 } }).filter((x) => x.object === 'InstructionText');
      expect([device, q.some((x) => x.texture === 'font_special_01.tif')]).toEqual([device, !labelled]);
      const split = a.lineSplit()!;
      expect(split).toBeGreaterThan(q[0]!.x);
    }
  });
});

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const present = ['RUN/MP2.ZDB', 'RUN/UIZANIM.ZAR', 'RUN/UI/READERC.ZAR', 'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/ZWEAPON.ZAR', 'RUN/READERC.ZAR']
  .every((p) => existsSync(resolve(FIXTURES, p)));

describe.skipIf(!present)(`the ARMORY on Frostfire's own dialog and scripts${present ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  async function disc(side: 'seal' | 'terrorist'): Promise<{ a: Armory; t: { now: number }; applied: ArmoryExit[]; data: ArmoryData }> {
    const src = new FsAssetSource(FIXTURES);
    const data = await armoryFromDisc(src, 'RUN/MP2.ZDB', 'MP2');
    const zw = (await readZarMembers(src, 'RUN/ZWEAPON.ZAR', ['zweapon.rdr'])).get('zweapon.rdr')!;
    const rm = Zar.parse((await readZdbMember(src, 'RUN/MP2.ZDB', 'READERM.ZAR'))!);
    const mission = parseRdr(rm.data(rm.root.children.find((c) => c.name.toLowerCase() === 'mission.rdr')!));
    const t = { now: 0 }, applied: ArmoryExit[] = [];
    const a = new Armory({ clock: () => t.now, change: (e) => applied.push(e) });
    a.setData(data);
    a.setWorld({ arsenal: arsenalOf(parseRdr(zw)), valves: missionValves(mission), side, map: 'MP2', archive: 'MP2' });
    return { a, t, applied, data };
  }
  const run = (a: Armory, t: { now: number }, s: number): void => { for (let i = 0; i < s * 60; i++) { t.now += 1 / 60; a.frame(1 / 60); } };

  it('S0: MPSealPlace slides the SEALs in 4-3-2-1 to x 490/335/180/25, y 150; the Terrorists hidden; SEAL 4 open', async () => {
    const { a, t } = await disc('seal');
    expect(a.open(null)).toBe(true);
    run(a, t, 0.2);
    const r = a.scripts()!;
    expect(r.node('Seal1PrimDummy').visible).toBe(false);         // still hidden: the 4th went first, the 1st goes last
    expect([r.node('Seal4PrimDummy').x, r.node('Seal4PrimDummy').y]).toEqual([490, 150]);
    run(a, t, 0.4);
    expect([1, 2, 3, 4].map((n) => [r.node(`Seal${n}PrimDummy`).x, r.node(`Seal${n}PrimDummy`).y])).toEqual([[25, 150], [180, 150], [335, 150], [490, 150]]);
    expect([r.node('Seal1PaneDummy').x, r.node('Seal1PaneDummy').y]).toEqual([-8, 129]);
    expect(r.node('Merc1PrimDummy').visible).toBe(false);
    expect([r.node('Seal4Dis').visible, r.node('Seal4Lock').visible]).toEqual([false, false]);   // UnlockMPChar, InWhichAOP 0
    expect(a.text(r.node('Seal4Text').caption)).toBe('SEAL 4');
    expect(a.text(r.node('InstructionText').caption)).toMatch(/Select SEAL 1/);
    const quads = a.quads(Object.fromEntries(((await disc('seal')).data.bitmaps).map(([n, b]) => [n, { width: b.width, height: b.height }])));
    const objects = new Set(quads.map((q) => q.object));
    for (const o of ['BACKGROUND', 'eq_title_back', 'bar_title', 'Seal1', 'Seal4', 'EquipSeal1ActFrame', 'Seal1PrimText']) expect(objects.has(o), o).toBe(true);
    for (const o of ['Terr1', 'EquipWeapOpaque', 'Seal4Lock']) expect(objects.has(o), o).toBe(false);
    // The network lights hang from the dialog's root (ABSENT_PARENT_READING): the yellow ring at (577, 25).
    expect(quads.find((q) => q.object === 'net_conn_ind_Yel')).toMatchObject({ x: 577, y: 25 });
    // The weapon area's windows (controls) lie beneath the objects (UI_DRAW_ORDER_READING): EquipWeapOpaque shown on a row.
  });

  it('S1a: Cross on SEAL 2 drops the others to y 550 and slides it to x 220, its panes into the loadout window', async () => {
    const { a, t } = await disc('seal');
    a.open(null);
    run(a, t, 0.5);
    t.now += 1; a.input('right');
    t.now += 1; a.input('cross');
    run(a, t, 0.6);
    const r = a.scripts()!;
    expect([r.node('Seal2PrimDummy').x, r.node('Seal2PrimDummy').y]).toEqual([220, 150]);
    expect([r.node('Seal2PaneDummy').x, r.node('Seal2PaneDummy').y]).toEqual([-200, -40]);
    for (const n of [1, 3, 4]) expect(r.node(`Seal${n}PrimDummy`).y).toBe(550);
    expect([a.state()!.screen, a.state()!.row]).toEqual(['row', 1]);
    expect(r.node('EquipWeapOpaque').visible).toBe(true);
    expect(r.node('Seal2Primarypane').visible).toBe(true);
    expect(r.node('Seal2Secondarypane').visible).toBe(false);
    expect(a.text(r.node('CrossFieldText').caption)).toBe('SELECT DONE TO RETURN TO THE GAME LOBBY');
  });

  it('the Terrorist side: its four columns, the ONACTIVATE caption per column, DONE applying the type', async () => {
    const { a, t, applied } = await disc('terrorist');
    a.open(null);
    run(a, t, 0.5);
    expect(a.scripts()!.node('Seal1PrimDummy').visible).toBe(false);
    for (let i = 0; i < 3; i++) { t.now += 1; a.input('right'); a.frame(0); }
    expect(a.text(a.scripts()!.node('InstructionText').caption)).toMatch(/Terrorist 4/);
    t.now += 1; a.input('cross'); t.now += 1; a.input('up'); t.now += 1; a.input('cross');
    expect(applied.map((e) => e.type)).toEqual([3]);
  });
  it("every SOUND its scripts run plays at the command's own volume, pan and pitch (armoryCueOf = decodeUiSoundCommand)", async () => {
    const sets = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(FIXTURES, 'RUN/UIZANIM.ZAR')))));
    const { data } = await disc('seal');
    const cmds = data.scripts.flatMap((s) => uiSet(sets, s.set).anims.flatMap((a) => a.sequences.flatMap((q) => q.commands.filter((c) => c.set === 0 && c.cmd === 30)
      .map((c) => [armoryCueOf(decodeUiOp(c, a.names, []) as Extract<UiOp, { op: 'sound' }>), decodeUiSoundCommand(c)] as const))));
    expect(cmds.length).toBeGreaterThan(50);                                  // the screen's 14 .DINK, ShowAndSpin's .SLIDE and .NEG ...
    for (const [own, raw] of cmds) expect(own).toEqual({ volume: raw.volume, pan: raw.pan, pitchMod: raw.pitchMod });
  });
});

describe.skipIf(!present)(`the ARMORY's weapon view on Frostfire's own scripts${present ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  async function disc(): Promise<{ a: Armory; t: { now: number }; data: ArmoryData; sounds: string[] }> {
    const src = new FsAssetSource(FIXTURES);
    const data = await armoryFromDisc(src, 'RUN/MP2.ZDB', 'MP2');
    const zw = (await readZarMembers(src, 'RUN/ZWEAPON.ZAR', ['zweapon.rdr'])).get('zweapon.rdr')!;
    const rm = Zar.parse((await readZdbMember(src, 'RUN/MP2.ZDB', 'READERM.ZAR'))!);
    const mission = parseRdr(rm.data(rm.root.children.find((c) => c.name.toLowerCase() === 'mission.rdr')!));
    const t = { now: 0 }, sounds: string[] = [];
    const a = new Armory({ clock: () => t.now, change: () => {}, sound: (s) => sounds.push(s) });
    a.setData(data);
    a.setWorld({ arsenal: arsenalOf(parseRdr(zw)), valves: missionValves(mission), side: 'seal', map: 'MP2', archive: 'MP2' });
    return { a, t, data, sounds };
  }
  const run = (a: Armory, t: { now: number }, s: number): void => { for (let i = 0; i < Math.round(s * 60); i++) { t.now += 1 / 60; a.frame(1 / 60); } };
  const press = (a: Armory, t: { now: number }, input: Parameters<Armory['input']>[0]): void => { run(a, t, 3.5); a.input(input); a.frame(0); };

  it('the Primary row: the kit\'s rifle shown and spun 178.97 deg about -Y in 3 s, its bars, name, fire mode and tip as scripted', async () => {
    const { a, t, data, sounds } = await disc();
    a.open(null);
    run(a, t, 0.5);
    a.input('cross'); a.frame(0);                                                 // SEAL 1 committed: the Primary row
    run(a, t, 0.6);
    const ui = uiOf(a.state()!.kits[0]![0]!);
    const item = data.items.find((i) => i.ui === ui)!;
    const p = a.preview()!;
    expect(p.models).toEqual([item.model]);
    expect(p.bars!.map((b) => Math.round(b * 100))).toEqual(item.bars!.map((b) => Math.round(b * 100)));
    expect(p.name).toBe(a.text(item.caption));
    expect(p.fireMode).toBe(a.text({ loc: item.fireMode! }));
    expect(p.tips).toBe(a.text({ loc: item.tip! }));
    expect(p.description).toBe('');                                              // a gun types " ": nothing, no cursor
    // The spin: one 3-s slerp from where the model stood, relative, identity -> q(0, -1, 0, 0.0087) (research 95 §3.8).
    // A true slerp at a constant rate, so any 3 s turns it 178.97 deg (less the frame each pass of the WHILE yields).
    const node = a.scripts()!.node(item.model!);
    const q0 = [...node.rotation];
    run(a, t, 3);
    const q1 = node.rotation, dot = q0.reduce((s, v, i) => s + v * q1[i]!, 0);
    const turned = (2 * Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI;
    expect(turned).toBeGreaterThan(176);
    expect(turned).toBeLessThan(179.1);
    expect(Math.abs(q1[0]) + Math.abs(q1[2])).toBeLessThan(1e-6);               // about the y axis alone
    expect(a.models().map((m) => m.entry.name)).toEqual([item.model]);
    expect(sounds).not.toContain('.NEG');
    expect(sounds).not.toContain('.TYPE');
  });

  it('an equipment row: the bars hidden, the description typed out at 1197 px/s with its tick, the tips', async () => {
    const { a, t, data, sounds } = await disc();
    a.open(null);
    run(a, t, 0.5);
    a.input('cross'); a.frame(0);
    press(a, t, 'down');                                                         // Secondary
    press(a, t, 'down');                                                         // Equipment 1
    expect(a.state()!.row).toBe(3);
    run(a, t, 0.05);
    const ui = uiOf(a.state()!.kits[0]![2]!);
    const item = data.items.find((i) => i.ui === ui)!;
    let p = a.preview()!;
    expect(p.bars).toBeNull();                                                   // eq_wep_comp_dummy 0 on the equipment rows
    expect(p.models).toEqual([item.model]);
    expect(p.typed).toBe(false);
    const full = a.text(item.description).replace(/\s+/g, ' ').trim();
    expect(full.length).toBeGreaterThan(20);
    expect(p.description.length).toBeLessThan(full.length);
    run(a, t, 5);
    p = a.preview()!;
    expect(p.typed).toBe(true);
    expect(p.description.replace(/\s+/g, ' ').trim()).toBe(full.split(' ').slice(-p.description.split(/\s+/).filter(Boolean).length).join(' '));
    expect(sounds).toContain('.TYPE');
    if (item.tip !== null) expect(p.tips).toBe(a.text({ loc: item.tip }));
  });

  it('the confirm: PopUpDialog\'s .METAL, open on NO, Cross answers NO with SELECTION; YES gives the script\'s .DINK once', async () => {
    const { a, t, sounds } = await disc();
    a.open(null);
    run(a, t, 0.5);
    a.input('cross'); a.frame(0);
    run(a, t, 3.5);
    const cues = (): string[] => sounds.filter((s) => s !== '.TYPE');
    sounds.length = 0;
    a.input('triangle'); a.frame(0); run(a, t, 0.2);
    expect([a.state()!.screen, a.state()!.focus, cues()]).toEqual(['confirm', 'no', ['.METAL']]);
    sounds.length = 0;
    a.input('cross'); a.frame(0); run(a, t, 0.2);                                 // NO: back to the row, no .DINK
    expect([a.state()!.screen, cues()]).toEqual(['row', ['.METAL']]);
    run(a, t, 2);
    a.input('triangle'); a.frame(0); run(a, t, 0.2);
    sounds.length = 0;
    a.input('right'); a.frame(0);
    a.input('cross'); a.frame(0); run(a, t, 1);
    expect(a.state()!.screen).toBe('select');
    expect(cues().filter((s) => s === '.DINK')).toHaveLength(1);                 // OnMPWeaponBtnTriangle's, not twice
    expect(cues().slice(0, 2)).toEqual(['.METAL', '.METAL']);                    // the popup's Right and Cross
  });

  it('the DONE row hides the models and the typed text; the view draws a quad set with the bars only on the gun rows', async () => {
    const { a, t, data } = await disc();
    a.open(null);
    run(a, t, 0.5);
    a.input('cross'); a.frame(0);
    run(a, t, 0.6);
    const sizes = Object.fromEntries([...data.bitmaps.map(([n, b]) => [n, { width: b.width, height: b.height }] as const), ['armory.white', { width: 2, height: 2 }] as const]);
    const all = a.quads(sizes), bars = all.filter((q) => q.object.startsWith('eq_wep_comp_bar'));
    expect(bars.length).toBe(4);
    // The 0.35 windows beneath the bars and their labels, never over them (UI_DRAW_ORDER_READING).
    const first = (o: string): number => all.findIndex((q) => q.object === o);
    expect(first('EquipWeapWin')).toBeGreaterThanOrEqual(0);
    expect(first('EquipWeapWin')).toBeLessThan(first('eq_wep_comp_bar'));
    expect(first('WeapDataCapWin')).toBeLessThan(first('Wvolume'));
    for (const b of bars) expect(b.w).toBeLessThanOrEqual(140);
    press(a, t, 'up');                                                           // Primary -> DONE (up wraps)
    run(a, t, 0.2);
    expect(a.state()!.screen).toBe('done');
    expect(a.models()).toEqual([]);
    expect(a.quads(sizes).some((q) => q.object === 'WepDescription' || q.object.startsWith('eq_wep_comp_bar'))).toBe(false);
  });
});

describe.skipIf(!present)(`the preview's place for every MODELS entry of the disc's dialog${present ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('all 67 entries land inside EquipWeapWin (MODEL_CAMERA_READING), every one\'s model decoded', async () => {
    const data = await armoryFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2');
    const win = data.layout!.objects.find((o) => o.name === 'EquipWeapWin') ?? data.layout!.controls.find((o) => o.name === 'EquipWeapWin')!;
    expect(data.layout!.models.length).toBe(67);
    const held = new Set(data.models.map((m) => m.model));
    for (const e of data.layout!.models) {
      const [x, y] = modelFramePoint(e);
      expect(x, e.name).toBeGreaterThan(win.x); expect(x, e.name).toBeLessThan(win.x + win.size![0]);
      expect(y, e.name).toBeGreaterThan(win.y); expect(y, e.name).toBeLessThan(win.y + win.size![1]);
      expect(held.has(e.model), e.model).toBe(true);
    }
  });
});
