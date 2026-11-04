import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  ARMORY_BARS, ARMORY_SETS, armoryItemScripts, decodeUiOp, decodeUiProgram, decodeUiSet, parseAnimSets, uiSet, valveBranches,
  type UiOp, type UiProgram, type ZAnimArchive,
} from '../src/index';
import { buildZar, cat, f32, u16, u32, type KeySpec } from './syntheticZar';

/**
 * The interface scripts' commands decoded (web sprint 5, S1; socomlegacy/docs/research/95 §1, §3): a hand-built
 * `UIZANIM`-shaped archive first -- one command of every kind the ARMORY uses, at the offsets research 95 §1 reads --
 * then the disc's `RUN/UIZANIM.ZAR` (fixture-backed), pinned to the note's tables (§3.1, §3.7, §3.8, §4.1).
 */

/** A command: its 4-byte header (`cmd | set << 8`, the size in bits 18-31) and `size - 4` bytes the caller fills. */
function command(set: number, cmd: number, size: number, fill: (dv: DataView, b: Uint8Array) => void = () => {}): Uint8Array {
  const b = new Uint8Array(size);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, (cmd | (set << 8) | (size << 18)) >>> 0, true);
  fill(dv, b);
  return b;
}
const W = true;
/** `ui::UI_COMMAND` (set 1, cmd 1; research 95 §1.2): +4 node, +6 opcode or function name, +8 argument, +0xc loc. */
const ui = (node: number, code: number, arg: number, loc = 0, extra: number[] = []): Uint8Array =>
  command(1, 1, 16 + extra.length, (dv, b) => { dv.setUint16(4, node, W); b[6] = code; dv.setUint16(8, arg, W); dv.setInt16(12, loc, W); b.set(extra, 16); });
/** `VALVE` (61): +4 the valve, +8 the operand, +12 the operation, +13 the flags. */
const valve = (ref: number, op: number, operand: number, flags = 2): Uint8Array =>
  command(0, 61, 16, (dv, b) => { dv.setUint32(4, ref, W); dv.setInt32(8, operand, W); b[12] = op; b[13] = flags; });
const cond = (cmd: number, depth: number, ...tokens: Uint8Array[]): Uint8Array => {
  const body = cat(...tokens);
  return command(0, cmd, 8 + body.length, (_dv, b) => { b[4] = depth; b.set(body, 8); });
};
const IF = (depth: number, ...t: Uint8Array[]) => cond(2, depth, ...t);
const ELSEIF = (depth: number, ...t: Uint8Array[]) => cond(3, depth, ...t);
const ELSE = (depth: number) => command(0, 4, 8, (_dv, b) => { b[4] = depth; });
const ENDIF = (depth: number) => command(0, 5, 8, (_dv, b) => { b[4] = depth; });
const expr = (e: number) => command(0, 43, 8, (_dv, b) => { b[4] = e; });
const active = (node: number, on: boolean) => command(0, 17, 8, (dv) => { dv.setUint16(4, on ? 1 : 0, W); dv.setUint16(6, node, W); });
const call = (name: number, block: boolean) => command(0, 45, 8, (dv, b) => { dv.setUint16(4, block ? 0x200 : 0, W); b[7] = name; });
const WHILE = (jump: number) => command(0, 39, 8, (dv, b) => { b[4] = 1; dv.setUint16(6, jump, W); });
const END_WHILE = (jump: number) => command(0, 40, 8, (dv) => { dv.setUint16(6, jump, W); });
/** `OBJECT_MOTION_FROM_TO` (22): the scale form of the bars (0x300: block at +0x38, from, to at +12, rate at +24). */
const scaleMove = (node: number, to: number) => command(0, 22, 0x5c, (dv, b) => {
  dv.setUint16(4, 0x300, W); b[6] = node; dv.setUint16(0x30, 0x38, W); dv.setFloat32(0x34, 0.001, W);
  dv.setFloat32(0x3c, 1, W); dv.setFloat32(0x44, to, W); dv.setFloat32(0x48, 1, W);
});
/** The spin (0x61: rotation, relative): q_from at +0x10, q_to at +0x20, 3 s. */
const spinMove = (node: number) => command(0, 22, 0x38, (dv, b) => {
  dv.setUint16(4, 0x61, W); b[6] = node; dv.setFloat32(0x1c, 1, W);
  dv.setFloat32(0x24, -0.9999619, W); dv.setFloat32(0x2c, 0.0087266, W); dv.setFloat32(0x34, 3, W);
});
/** The column slide (0x0a: a position block P at +0x38 with "from" stored). */
const slide = (node: number) => command(0, 22, 0x64, (dv, b) => {
  dv.setUint16(4, 0x0a, W); b[6] = node; dv.setUint16(0xc, 0x38, W); dv.setFloat32(0x34, 0.1, W);
  dv.setFloat32(0x3c, -225, W); dv.setFloat32(0x40, 145, W); dv.setFloat32(0x48, 490, W); dv.setFloat32(0x4c, 150, W);
  dv.setFloat32(0x54, 7150, W); dv.setFloat32(0x58, 50, W);
});
const opacity = (node: number) => command(0, 25, 0x18, (dv) => {
  dv.setUint16(4, node, W); dv.setFloat32(8, 0.2, W); dv.setFloat32(0xc, 0.99, W); dv.setFloat32(0x10, 1.58, W); dv.setFloat32(0x14, 0.5, W);
});
const sound = (name: number) => command(0, 30, 0x14, (dv, b) => { dv.setUint16(4, 0x80, W); dv.setUint16(6, name, W); b[0x10] = 0xf9; });
const wait = (s: number) => command(0, 15, 12, (dv) => { dv.setFloat32(8, s, W); });
const loop = () => command(0, 14, 12, (dv) => { dv.setUint32(4, 1, W); dv.setInt32(8, -1, W); });

/** A sequence: its 28-byte head (name, word, size) and its commands. */
const seq = (name: number, word: number, ...cmds: Uint8Array[]): Uint8Array => {
  const body = cat(...cmds);
  return cat(u16(name, 0), u32(word, 0, 28 + body.length), f32(0, 0, 0), body);
};
const leaf = (name: string, data?: Uint8Array): KeySpec => ({ name, data });
const list = (name: string, names: string[]): KeySpec => ({ name, children: names.map((n) => leaf(n)) });

/** One animation: its local name table (indices into the set's), node references, and one start sequence. */
function animation(name: string, localNames: number[], nodes: number[], nameIndex: number, body: Uint8Array): KeySpec {
  const params = cat(Uint8Array.from([nameIndex, 0, 0, 0]), u32(0x21), f32(0, 0), u16(0, 0, 0, 0));
  return {
    name, children: [
      leaf('Anim_Params', params),
      leaf('Name_Index_Table_Count', u32(localNames.length)), leaf('Name_Index_Table', u16(...localNames)),
      leaf('Node_Ref_Count', u32(nodes.length)), leaf('Node_Ref_List', u32(...nodes.flatMap((n) => [n << 8, 0]))),
      leaf('Seq_Data_Size', u32(body.length)), leaf('Seq_Data', body),
    ],
  };
}
function set(name: string, names: string[], anims: KeySpec[]): KeySpec {
  return {
    name, children: [
      leaf('Name_Table_Count', u32(names.length)), list('Name_Table', names),
      leaf('RdrPath_Count', u32(0)), list('RdrPath_List', []),
      leaf('SoftImage_Script_Count', u32(0)), { name: 'SoftImage_Script_List', children: [] },
      leaf('Animation_List_Count', u32(anims.length)), { name: 'Animation_List', children: anims },
    ],
  };
}

// The spin set's names: its animation's local table is the identity over these.
const SPIN_NAMES = [
  'NA', 'ShowAndSpin', 'UiWeapon', 'ChoosePrimary', 'M16A2', 'weapmodeltext', 'FireMode1', 'EquipM16', 'eq_wep_comp_dummy',
  ...ARMORY_BARS, 'TurnOnPadlocks1', 'WepDescription', 'ChooseEquip1', 'Double Ammo Load', 'EquipDoubleAmmo',
  'The launcher needs two slots.', '.NEG', ' ', 'Seal4PrimDummy', 'arrow_lft', 'MENUFADER', 'POPUP', 'POPUPDIALOG',
];
const n = (s: string): number => SPIN_NAMES.indexOf(s);
// Node references: index 0 is NA; the rest name the objects the commands aim at.
const NODES = ['NA', 'weapmodeltext', 'FireMode1', 'EquipM16', 'eq_wep_comp_dummy', ...ARMORY_BARS, 'WepDescription', 'EquipDoubleAmmo', 'Seal4PrimDummy', 'arrow_lft', 'POPUP'];
const node = (s: string): number => NODES.indexOf(s);

function syntheticArchive(): Uint8Array {
  const show = seq(1, 0x102,
    IF(1, valve(n('UiWeapon'), 2, 1)),
    ui(0, n('ChoosePrimary'), n('M16A2')),
    ui(node('weapmodeltext'), 0xe9, 0, 1025),
    ui(node('FireMode1'), 0xe9, 0, 1026),
    ui(node('WepDescription'), 0xe9, n(' ')),
    active(node('EquipM16'), true),
    ...ARMORY_BARS.map((b, i) => scaleMove(node(b), [0.15, 0.56, 0.75, 0.88][i]!)),
    active(node('eq_wep_comp_dummy'), true),
    call(n('TurnOnPadlocks1'), false),
    WHILE(0), spinMove(node('EquipM16')), END_WHILE(0),
    ELSEIF(1, valve(n('UiWeapon'), 2, 35)),
    // The Choose as an IF's condition (the launchers' form), a refusal typed in its failing branch.
    IF(2, ui(0, n('ChooseEquip1'), n('Double Ammo Load'))),
    ui(node('WepDescription'), 0xe9, 0, 1085),
    ELSE(2),
    sound(n('.NEG')),
    ui(node('WepDescription'), 0xe9, n('The launcher needs two slots.')),
    ENDIF(2),
    ui(node('weapmodeltext'), 0xe9, 0, 1084),
    active(node('eq_wep_comp_dummy'), false),
    WHILE(0), spinMove(node('EquipDoubleAmmo')), END_WHILE(0),
    ELSEIF(1, valve(n('UiWeapon'), 2, 1)),                // a second branch for 1 is ignored: the first wins
    ui(node('weapmodeltext'), 0xe9, 0, 9999),
    ELSE(1),
    ui(node('weapmodeltext'), 0xe9, n('NA')),
    ENDIF(1),
  );
  const extras = seq(0, 0x104,
    IF(1, expr(1), valve(n('UiWeapon'), 2, 0), expr(2), ui(0, n('ChoosePrimary'), n('M16A2'))),
    ENDIF(1),
    slide(node('Seal4PrimDummy')),
    opacity(node('arrow_lft')),
    loop(), wait(5),
    command(0, 44, 4),                                     // BREAK
    command(0, 46, 8, (_dv, b) => { b[4] = n('ShowAndSpin'); }),
    command(0, 50, 8, (_dv, b) => { b[4] = n('ShowAndSpin'); }),
    valve(n('UiWeapon'), 11, n('UiWeapon'), 0x1a),
    ui(0, n('POPUPDIALOG'), 0),
    ui(node('POPUP'), 0, 0, 0, [0x18, 0, 0xdd, 0x04, 6, 0, 0, 0]),
    command(2, 7, 4),                                      // a command of a set the decoder does not know
  );
  const spinAnim = animation('ShowAndSpin', SPIN_NAMES.map((_, i) => i), NODES.map((s) => SPIN_NAMES.indexOf(s)), 1, cat(show, extras));
  const screenNames = ['NA', 'CallWeaponTips', 'UiWeapon', 'WepInstText'];
  const tips = seq(1, 0x102,
    IF(1, valve(2, 2, 1)), ui(1, 0xe9, 0, 1179),
    ELSEIF(1, valve(2, 2, 35)), ui(1, 0xe9, 0, 1209),
    ENDIF(1));
  const tipsAnim = animation('CallWeaponTips', [0, 1, 2, 3], [0, 3], 1, tips);
  return buildZar([
    leaf('Anim_Main_Params', cat(u32(72), f32(-98), u32(0, 0))),
    leaf('Name_Table_Count', u32(0)), list('Name_Table', []),
    leaf('Anim_Set_Count', u32(2)),
    { name: 'Anim_Sets', children: [set('dlg_equipment_mp.rdr', screenNames, [tipsAnim]), set('ShowAndSpin.rdr', SPIN_NAMES, [spinAnim])] },
  ]);
}

describe('the interface commands on a hand-built archive (research 95 §1)', () => {
  const archive = parseAnimSets(Zar.parse(syntheticArchive()));
  const spin = decodeUiProgram(uiSet(archive, ARMORY_SETS.spin).anims[0]!);
  const [show, extras] = spin.sequences as [UiProgram['sequences'][0], UiProgram['sequences'][0]];

  it('reads the start and called sequences (0x102 activation 1, 0x104 activation 2)', () => {
    expect(spin.sequences.map((s) => [s.name, s.activation])).toEqual([['ShowAndSpin', 1], ['NA', 2]]);
  });

  it('decodes UI_COMMAND: a bound function (no node) and a node\'s caption by locale id or by literal', () => {
    expect(show.ops[1]).toEqual({ op: 'ui', command: { node: null, op: 0, fn: 'ChoosePrimary', arg: 'M16A2', loc: 0, extra: [] } });
    expect(show.ops[2]).toEqual({ op: 'ui', command: { node: 'weapmodeltext', op: 1, fn: null, arg: 'NA', loc: 1025, extra: [] } });
    expect(show.ops[4]).toMatchObject({ op: 'ui', command: { node: 'WepDescription', op: 1, arg: ' ', loc: 0 } });
  });

  it('decodes IF/ELSEIF with their depth and condition tokens: VALVE tests, EXPRESSION operators, UI calls', () => {
    expect(show.ops[0]).toEqual({ op: 'if', depth: 1, tokens: [{ t: 'valve', valve: 'UiWeapon', op: '==', operand: 1 }] });
    expect(extras.ops[0]).toEqual({
      op: 'if', depth: 1, tokens: [
        { t: 'not' }, { t: 'valve', valve: 'UiWeapon', op: '==', operand: 0 }, { t: 'and' },
        { t: 'ui', command: { node: null, op: 0, fn: 'ChoosePrimary', arg: 'M16A2', loc: 0, extra: [] } },
      ],
    });
    expect(extras.ops[1]).toEqual({ op: 'endif', depth: 1 });
  });

  it('decodes the motions: the bars\' x-scale, the spin\'s relative rotation, the slide\'s stored "from"', () => {
    const bar = show.ops[6] as Extract<UiOp, { op: 'move' }>;
    expect(bar).toMatchObject({ op: 'move', node: 'eq_wep_comp_bar', flags: 0x300 });
    expect(bar.seconds).toBeCloseTo(0.001, 9);
    expect(bar.scale!.from).toEqual([0, 1, 0]);
    expect(bar.scale!.to[0]).toBeCloseTo(0.15, 6);
    expect(bar.position).toBeUndefined();
    const turn = show.ops.find((o) => o.op === 'move' && o.rotation) as Extract<UiOp, { op: 'move' }>;
    expect(turn.rotation!.relative).toBe(true);
    expect(turn.rotation!.from).toEqual([0, 0, 0, 1]);
    expect(turn.seconds).toBe(3);
    const s = extras.ops[2] as Extract<UiOp, { op: 'move' }>;
    expect(s).toMatchObject({ op: 'move', node: 'Seal4PrimDummy', flags: 0x0a, position: { from: [-225, 145, 0], to: [490, 150, 0], rate: [7150, 50, 0] } });
    expect(s.seconds).toBeCloseTo(0.1, 6);
  });

  it('decodes the rest: opacity, loop, wait, break, stop, call-sequence, valve assignment, popup, an unknown set', () => {
    expect(extras.ops[3]).toMatchObject({ op: 'opacity', node: 'arrow_lft' });
    expect((extras.ops[3] as Extract<UiOp, { op: 'opacity' }>).to).toBeCloseTo(0.99, 6);
    expect(extras.ops[4]).toEqual({ op: 'loop', count: null });
    expect(extras.ops[5]).toEqual({ op: 'wait', seconds: 5 });
    expect(extras.ops[6]).toEqual({ op: 'break' });
    expect(extras.ops[7]).toEqual({ op: 'stopAnimation', anim: 'ShowAndSpin' });
    expect(extras.ops[8]).toEqual({ op: 'callSequence', sequence: 'ShowAndSpin' });
    expect(extras.ops[9]).toEqual({ op: 'valve', valve: 'UiWeapon', operation: '=', operand: { valve: 'UiWeapon' } });
    expect(extras.ops[10]).toMatchObject({ op: 'ui', command: { node: null, fn: 'POPUPDIALOG' } });
    expect(extras.ops[11]).toMatchObject({ op: 'ui', command: { node: 'POPUP', op: 0 }, popup: { text: 1245 } });
    expect(extras.ops[12]).toEqual({ op: 'other', set: 2, cmd: 7, name: 'set 2 cmd 7' });
    expect(show.ops.find((o) => o.op === 'sound')).toEqual({ op: 'sound', sound: '.NEG', flags: 0x80, newPlay: true, node: 0xf9 });
    expect(show.ops.find((o) => o.op === 'call')).toEqual({ op: 'call', anim: 'TurnOnPadlocks1', block: false });
    expect(show.ops.find((o) => o.op === 'while')).toEqual({ op: 'while', forever: true, jump: 0, tokens: [] });
  });

  it('splits a sequence into its valve branches, nested levels marked, the first branch for a value kept', () => {
    const branches = valveBranches(show.ops, 'UiWeapon');
    expect([...branches.keys()]).toEqual([1, 35]);
    // The nested IF, its op, ELSE, sound and refusal at level 2; its ENDIF closes back to the branch's level 1.
    expect(branches.get(35)!.map((b) => b.level)).toEqual([2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1]);
  });

  it('reads the item table off the branches (R95.8), with CallWeaponTips\' tips', () => {
    const items = armoryItemScripts(uiSet(archive, ARMORY_SETS.spin), uiSet(archive, ARMORY_SETS.screen));
    expect(items.map((i) => i.ui)).toEqual([1, 35]);
    const [m16, ammo] = items as [typeof items[0], typeof items[0]];
    expect(m16).toMatchObject({
      slot: 'primary', name: 'M16A2', caption: { loc: 1025 }, fireMode: 1026, showsBars: true, model: 'EquipM16',
      description: { text: ' ' }, calls: ['TurnOnPadlocks1'], refusals: [], tip: 1179,
    });
    m16.bars!.forEach((v, i) => expect(v).toBeCloseTo([0.15, 0.56, 0.75, 0.88][i]!, 6));
    expect(m16.spin!.seconds).toBe(3);
    expect(ammo).toMatchObject({
      slot: 'equipment', name: 'Double Ammo Load', caption: { loc: 1084 }, fireMode: null, bars: null, showsBars: false,
      model: 'EquipDoubleAmmo', description: { loc: 1085 }, refusals: ['The launcher needs two slots.'], tip: 1209,
    });
  });

  it('never throws on a short command: a read past the end is 0', () => {
    expect(decodeUiOp({ set: 0, cmd: 22, bytes: command(0, 22, 4) }, ['NA'], ['NA'])).toEqual({ op: 'move', node: 'NA', flags: 0, seconds: 0 });
    expect(decodeUiOp({ set: 1, cmd: 1, bytes: command(1, 1, 4) }, ['NA'], ['NA'])).toMatchObject({ op: 'ui', command: { node: null, fn: 'NA' } });
  });

  it("a SOUND's own volume (0x10, f32 +8), pan (0x20, u16 +0xc) and pitch (0x40, s16 +0xe); each absent without its flag", () => {
    const snd = (flags: number) => command(0, 30, 0x20, (dv) => { dv.setUint16(4, flags, W); dv.setUint16(6, 1, W); dv.setFloat32(8, 0.5, W); dv.setUint16(0xc, 64, W); dv.setInt16(0xe, -12, W); });
    expect(decodeUiOp({ set: 0, cmd: 30, bytes: snd(0x80 | 0x10 | 0x20 | 0x40) }, ['NA', '.DINK'], ['NA']))
      .toEqual({ op: 'sound', sound: '.DINK', flags: 0xf0, newPlay: true, node: 0, volume: 0.5, pan: 64, pitchMod: -12 });
    expect(decodeUiOp({ set: 0, cmd: 30, bytes: snd(0x80 | 0x20) }, ['NA', '.DINK'], ['NA']))
      .toEqual({ op: 'sound', sound: '.DINK', flags: 0xa0, newPlay: true, node: 0, pan: 64 });
    expect(decodeUiOp({ set: 0, cmd: 30, bytes: snd(0x80) }, ['NA', '.DINK'], ['NA'])).toEqual({ op: 'sound', sound: '.DINK', flags: 0x80, newPlay: true, node: 0 });
  });
});

const UIZANIM = fixture('RUN/UIZANIM.ZAR');

describe.skipIf(UIZANIM === null)(`RUN/UIZANIM.ZAR, the ARMORY's two sets${UIZANIM === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  let archive: ZAnimArchive;
  const sets = (): ZAnimArchive => (archive ??= parseAnimSets(Zar.parse(UIZANIM!)));
  const programs = (name: string): Map<string, UiProgram> => decodeUiSet(uiSet(sets(), name));
  const ops = (setName: string, anim: string, sequence = 0): UiOp[] => programs(setName).get(anim)!.sequences[sequence]!.ops;

  it('holds the two sets at research 95\'s counts, and every command decodes to a known op', () => {
    for (const [name, anims, commands, ui] of [[ARMORY_SETS.screen, 43, 1731, 275], [ARMORY_SETS.spin, 23, 4051, 541]] as const) {
      const set = uiSet(sets(), name);
      const all = set.anims.flatMap((a) => a.sequences.flatMap((s) => s.commands));
      expect([set.anims.length, all.length, all.filter((c) => c.set === 1).length]).toEqual([anims, commands, ui]);
      const decoded = [...programs(name).values()].flatMap((p) => p.sequences.flatMap((s) => s.ops));
      expect(decoded.filter((o) => o.op === 'other')).toEqual([]);
    }
  });

  it('reads the item table: 70 UiWeapon branches, 33 primaries, 11 secondaries, 23 equipment, 0, 254 and 255 (§3.4, §3.7)', () => {
    const items = armoryItemScripts(uiSet(sets(), ARMORY_SETS.spin), uiSet(sets(), ARMORY_SETS.screen));
    expect(items).toHaveLength(70);
    const of = (slot: string) => items.filter((i) => i.slot === slot).map((i) => i.ui);
    expect(of('primary')).toEqual([1, 2, 3, 4, 5, ...Array.from({ length: 9 }, (_, i) => i + 7), ...Array.from({ length: 18 }, (_, i) => i + 17), 65]);
    expect(of('secondary')).toEqual(Array.from({ length: 11 }, (_, i) => i + 75));
    expect(of('equipment')).toEqual([...Array.from({ length: 23 }, (_, i) => i + 35), 254, 255]);
    expect(items.filter((i) => i.slot === null).map((i) => i.ui)).toEqual([0]);
  });

  it('pins the rows research 95 §3.7 tabulates: caption, fire mode, bars, model, tip, description', () => {
    const items = new Map(armoryItemScripts(uiSet(sets(), ARMORY_SETS.spin), uiSet(sets(), ARMORY_SETS.screen)).map((i) => [i.ui, i]));
    const row = (ui: number, name: string, caption: number, fireMode: number | null, bars: number[] | null, model: string, tip: number | null) => {
      const i = items.get(ui)!;
      expect([i.name, i.caption, i.fireMode, i.model, i.tip], `UI ${ui}`).toEqual([name, { loc: caption }, fireMode, model, tip]);
      if (bars === null) expect(i.bars).toBeNull();
      else i.bars!.forEach((v, k) => expect(v, `UI ${ui} bar ${k}`).toBeCloseTo(bars[k]!, 6));
      expect(i.showsBars, `UI ${ui}`).toBe(bars !== null);
    };
    row(1, 'M16A2', 1025, 1026, [0.15, 0.56, 0.75, 0.88], 'EquipM16', 1179);
    row(2, 'HK5SD', 1027, 5, [0.04, 0.68, 0.44, 0.91], 'Equipmp5sd', 1180);
    row(15, 'M82A1A', 1042, 1036, [0.4, 0.65, 1, 0.09], 'Equipbarret_lightm82A1', 1192);
    row(17, 'M87ELR', 1043, 1036, [0.53, 0.65, 0.96, 0.15], 'EquipmcmillanM87', 1193);
    row(19, 'M4A1-M203', 1045, 5, [0.2, 0.63, 0.63, 0.85], 'Equipm4Acarbine_203', 1195);
    row(65, '552SD', 1071, 5, [0.14, 0.62, 0.5, 0.73], 'EquipSig552SD', 1185);
    row(85, 'SR-1 Gyurza', 1083, 1036, [0.2, 0.43, 0.21, 0.56], 'EquipGyurza', 1244);
    row(83, 'Designator', 1080, null, null, 'EquipLasDes', 1242);
    row(35, 'Double Ammo Load', 1084, null, null, 'EquipDoubleAmmo', 1209);
    row(38, 'PMN Mine', 1161, null, null, 'EquipPMN_mine', 1221);
    row(49, 'AN-M8', 1090, null, null, 'Equipsmoke', 1212);
    row(53, 'RED SMOKE GRENADE', 1169, null, null, 'EquipRedSmoke', null);
    row(57, 'F2000 FRAG', 1177, null, null, 'EquipF2000FRAG', null);
    expect(items.get(83)!.description).toEqual({ loc: 1081 });
    expect(items.get(35)!.description).toEqual({ loc: 1085 });
    expect(items.get(1)!.description).toEqual({ text: ' ' });
    expect(items.get(0)!.caption).toEqual({ text: 'NONE' });
    // The two-slot launchers type their refusals (§4.3); the M4A1-M203 its one.
    expect(items.get(50)!.refusals).toHaveLength(2);
    expect(items.get(19)!.refusals[0]).toMatch(/^The M4A1-M203 requires two open equipment slots/);
    expect(items.get(19)!.calls).toContain('Enable203Equip');
  });

  it('spins every shown model the same: relative, 3 s, about -Y, w = sin 0.5 deg -- 179.0 deg per 3 s (§3.8)', () => {
    const items = armoryItemScripts(uiSet(sets(), ARMORY_SETS.spin), uiSet(sets(), ARMORY_SETS.screen)).filter((i) => i.spin);
    expect(items).toHaveLength(67);
    for (const i of items) {
      expect(i.spin!.seconds).toBe(3);
      const [x, y, z, w] = i.spin!.to;
      expect([x, z]).toEqual([0, 0]);
      expect(y).toBeCloseTo(-0.9999619, 6);
      expect(w).toBeCloseTo(Math.sin((0.5 * Math.PI) / 180), 6);
    }
    const [, y, , w] = items[0]!.spin!.to;
    expect((2 * Math.atan2(-y, w) * 180) / Math.PI).toBeCloseTo(179.0, 3);
  });

  it('slides the SEAL columns in 4, 3, 2, 1 from (-225,145) to (490/335/180/25,150) in 0.1 s (MPSealPlace, §3.1)', () => {
    const moves = ops(ARMORY_SETS.screen, 'MPSealPlace').filter((o): o is Extract<UiOp, { op: 'move' }> => o.op === 'move' && /^Seal\dPrimDummy$/.test(o.node));
    expect(moves.map((m) => [m.node, m.position!.from, m.position!.to])).toEqual([
      ['Seal4PrimDummy', [-225, 145, 0], [490, 150, 0]], ['Seal3PrimDummy', [-225, 145, 0], [335, 150, 0]],
      ['Seal2PrimDummy', [-225, 145, 0], [180, 150, 0]], ['Seal1PrimDummy', [-225, 145, 0], [25, 150, 0]],
    ]);
    for (const m of moves) expect(m.seconds).toBeCloseTo(0.1, 6);
    const panes = ops(ARMORY_SETS.screen, 'MPSealPlace').filter((o): o is Extract<UiOp, { op: 'move' }> => o.op === 'move' && /^Seal\dPaneDummy$/.test(o.node));
    expect(panes.map((m) => m.position!.to)).toEqual(Array(4).fill([-8, 129, 0]));
  });

  it('pulls the player out on the launch count: popup 47, then 5 s, then the lobby (UiBackToLobby, §4.1)', () => {
    const o = ops(ARMORY_SETS.screen, 'UiBackToLobby');
    expect(o.find((x) => x.op === 'valve')).toEqual({ op: 'valve', valve: 'ArmoryClock', operation: '=', operand: { valve: 'mp_x_sec_clock' } });
    expect(o.find((x) => x.op === 'ui' && x.popup)).toMatchObject({ popup: { text: 47 } });
    expect(o.find((x) => x.op === 'wait')).toEqual({ op: 'wait', seconds: 5 });
    expect(o.at(-1)).toMatchObject({ op: 'ui', command: { fn: 'SWITCHMENU', arg: 'dlgGameLobby.rdr' } });
  });

  it('asks before going back: MENUFADER to 0.7 in 0.05 s and popup 1245 (OnEquipWeaponBtnDefault, §3.3)', () => {
    const o = ops(ARMORY_SETS.spin, 'OnEquipWeaponBtnDefault');
    expect(o[0]).toMatchObject({ op: 'opacity', node: 'MENUFADER', from: 0 });
    expect((o[0] as Extract<UiOp, { op: 'opacity' }>).to).toBeCloseTo(0.7, 6);
    expect(o.find((x) => x.op === 'ui' && x.popup)).toMatchObject({ popup: { text: 1245 } });
  });

  it('pulses the two arrows 0.2 -> 0.99 -> 0.2 in 0.5 s each way, forever (PulseArrows, §3.8)', () => {
    const p = programs(ARMORY_SETS.spin).get('PulseArrows')!;
    const fades = p.sequences.flatMap((s) => s.ops).filter((o): o is Extract<UiOp, { op: 'opacity' }> => o.op === 'opacity');
    expect(new Set(fades.map((f) => f.node))).toEqual(new Set(['arrow_lft', 'arrow_top']));
    for (const f of fades) expect(f.seconds).toBeCloseTo(0.5, 6);
    expect(p.sequences.flatMap((s) => s.ops).some((o) => o.op === 'loop' && o.count === null)).toBe(true);
  });
});
