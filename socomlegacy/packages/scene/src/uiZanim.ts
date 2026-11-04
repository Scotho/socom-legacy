import { CmdBytes, ZANIM_COMMAND_NAMES, ZCMD, type Quat4, type Vec3 } from './effects';
import type { ZAnimAnimation, ZAnimArchive, ZAnimCommand, ZAnimSet } from './zanim';

/**
 * The interface's zAnim scripts decoded command by command (web sprint 5, S1; socomlegacy/docs/research/95 §1): the
 * `RUN/UIZANIM.ZAR` sets that drive a menu screen -- for the pre-round ARMORY `dlg_equipment_mp.rdr` (43 animations,
 * 1,731 commands) and `ShowAndSpin.rdr` (23, 4,051) -- read by `parseAnimSets` (`./zanim`) and turned here into what
 * each command does. Almost all of the ARMORY's behaviour is script (R95.1): the C side is the `ui::UI_COMMAND` calls
 * the scripts make.
 *
 * The encodings, research 95 §1 (every offset into the command's own bytes, its 4-byte header first):
 * - **`ui::UI_COMMAND`** (set 1, cmd 1; tick `FUN_002745a0` L121344-121431): +4 u16 a node (an index into the
 *   animation's `Node_Ref_List`; 0 none); +6 u8, with a node the node's opcode (+ 0xE8, `FUN_00274870(0)`, L121434),
 *   without one the name of a bound function (the 16-byte table at 0x3dd4d0, matched case-insensitively by
 *   `FUN_00198b80`); +8 u16 the argument's name index; +0xc s16 a `UIMnLOC` string id (0: the literal at +8, the base
 *   handler `FUN_0036fcc0` L268005-268080); +0x10 on, extra words (a `CharacterProfile` mode, a popup's record).
 * - **`VALVE`** (61; `FUN_00353fd0` L252128-252345): +4 the valve, +8 the operand, +12 the operation, +13 the flags (2:
 *   the valve is a name; 1: from the context; 0x10: the operand is a valve, 0x08 by name, 0x04 from the context).
 * - **`IF`/`ELSEIF`** (`FUN_0025e7a0` L108201, `FUN_0025e6d0` L108159): +4 the nest depth, the condition tokens from +8
 *   to the command's end; `ELSE`/`ENDIF` the depth at +4 (`FUN_0025e6a0` L108149). A token is a command of its own:
 *   a `VALVE` test, a `UI_COMMAND` (its tick's return is the truth), or an `EXPRESSION` (+4: 1 NOT, 2 AND, 3 OR, 4 `(`,
 *   5 `)`; the evaluator `FUN_0025e960` L108286).
 * - **`WHILE`** (`FUN_0025e630` L108131): +4 bit 0 = no condition (forever), +6 the jump, the condition from +8;
 *   **`END_WHILE`** (`FUN_0025e600` L108121) jumps back by its +6.
 * - **`CALL_ANIMATION`** (`FUN_0025d5c0` L107485): the name at byte +7, flag 0x200 blocks until the callee ends
 *   (`FUN_0025d550` L107465); **`STOP_ANIMATION`** the name at byte +4 (`FUN_0025d490` L107435); **`CALL_SEQUENCE`**
 *   the name at byte +4 (`FUN_0025d270` L107342).
 * - **`OBJECT_ACTIVE_STATE`**: +4 u16 1 = show, else hide; +6 u16 the node.
 * - **`OBJECT_MOTION_FROM_TO`** (begin `FUN_0025fe70` L109034-109346): +4 the flags, +6 u8 the node, +0xc u16 the
 *   position block P (P+4 from, P+0x10 to, P+0x1c rate; flag 2: "from" stored, else the current value), +0x10/+0x20
 *   quaternions (flag 0x40; flag 1 relative: to x the current), +0x30 u16 the scale block (applied with flag 0x200;
 *   from, to at +12, rate at +24; flag 0x100: "from" stored), +0x34 f32 the time.
 * - **`OBJECT_OPACITY_FROM_TO`** (`FUN_0025f960` L108835): +4 u16 the node, +8 from, +0xc to, +0x10 rate, +0x14 time.
 * - **`SOUND`** (`FUN_002659c0` L112317): +4 the flags (0x80 a new play), +6 the sound's name, +0x10 byte the node.
 *   With flag 0x10 the volume f32 at +8, 0x20 the pan u16 at +0xc, 0x40 the pitch modifier s16 at +0xe (L112412-112422;
 *   `@s2u/ui` `decodeUiSoundCommand`), each absent from the op without its flag (the play's 1.0, -1, 0).
 */

/** A text an object shows: a `UIMnLOC` id, or the literal the script spells. */
export type UiText = { loc: number } | { text: string };

/** A condition token (research 95 §1.4). */
export type UiToken =
  | { t: 'valve'; valve: string; op: UiValveOp; operand: UiOperand }
  | { t: 'ui'; command: UiCommand }
  | { t: 'not' } | { t: 'and' } | { t: 'or' } | { t: 'open' } | { t: 'close' }
  | { t: 'other'; cmd: number; set: number };

/**
 * `FUN_00353fd0`'s operations (the strings at 0x3f81c0): 0-10 tests, 11-18 assignments. `-=` floors at 0; a change
 * fires the valve's watchers (`FUN_003519f0`).
 */
export const UI_VALVE_OPS = [
  'true', '!=', '==', '>', '<', '>=', '<=', '|', '&', '|~', '&~',
  '=', '+=', '-=', '*=', '|=', '&=', '|=~', '&=~',
] as const;
export type UiValveOp = (typeof UI_VALVE_OPS)[number] | `op${number}`;

/** A valve's operand: a number, or another valve (flag 0x10; by name with 0x08). */
export type UiOperand = number | { valve: string };

/** A `ui::UI_COMMAND`. */
export interface UiCommand {
  /** The node it is aimed at, through the animation's `Node_Ref_List`, or null for a bound function. */
  node: string | null;
  /** With a node: its opcode (the byte at +6 less 0xE8; a byte below 0xE8 as it stands -- the popup's 0). */
  op: number;
  /** Without a node: the bound function's name (`ChoosePrimary`, `SWITCHMENU`, `SuspendMenuInput` ...). */
  fn: string | null;
  /** The argument's name (a literal caption, a valve's name, an item's display name, a menu file). */
  arg: string;
  /** The `UIMnLOC` id at +0xc; 0 when the literal stands. */
  loc: number;
  /** The words past +0x10 (a `CharacterProfile` mode, a popup's record), as bytes. */
  extra: number[];
}

/** A popup's record (`POPUP` node, opcode 0; research 95 §1.2): the text id at +0x12. */
export interface UiPopup { text: number }

export type UiOp =
  | { op: 'if' | 'elseif'; depth: number; tokens: UiToken[] }
  | { op: 'else' | 'endif'; depth: number }
  | { op: 'while'; forever: boolean; jump: number; tokens: UiToken[] }
  | { op: 'endWhile'; jump: number }
  | { op: 'break' }
  | { op: 'loop'; count: number | null }
  | { op: 'wait'; seconds: number }
  | { op: 'call'; anim: string; block: boolean }
  | { op: 'stopAnimation'; anim: string }
  | { op: 'callSequence'; sequence: string }
  | { op: 'active'; node: string; on: boolean }
  | { op: 'move'; node: string; flags: number; seconds: number; position?: UiMotion; rotation?: UiRotation; scale?: UiMotion }
  | { op: 'opacity'; node: string; from: number; to: number; rate: number; seconds: number }
  | { op: 'sound'; sound: string; flags: number; newPlay: boolean; node: number; volume?: number; pan?: number; pitchMod?: number }
  | { op: 'valve'; valve: string; operation: UiValveOp; operand: UiOperand }
  | { op: 'ui'; command: UiCommand; popup?: UiPopup }
  | { op: 'other'; set: number; cmd: number; name: string };

/** A position or a scale going from `from` (null: the object's current value) to `to` at `rate` per second. */
export interface UiMotion { from: Vec3 | null; to: Vec3; rate: Vec3 }
/** A rotation: from `from` to `to`, or with `relative` from the current orientation to `to` x it. */
export interface UiRotation { from: Quat4; to: Quat4; relative: boolean }

export interface UiSequence {
  name: string;
  /** 1: runs when the animation starts (word 0x102); 2: started by `CALL_SEQUENCE` (0x104). */
  activation: number;
  ops: UiOp[];
}

export interface UiProgram { name: string; nodes: string[]; sequences: UiSequence[] }

/** Set 1's two registrations (L106923): 1 `ui::UI_COMMAND` (tick 0x2745a0), 2 `ui::UI_APP_COMMAND` (0x274590). */
export const UI_SET = 1;
export const UI_CMD = { UI_COMMAND: 1, UI_APP_COMMAND: 2 } as const;
/** `OBJECT_OPACITY_FROM_TO` (25), `EXPRESSION` (43) and `BREAK` (44), which the effects never use. */
const OPACITY = 25, EXPRESSION = 43, BREAK = 44;
/** `FUN_00274870(0)` (L121434): a node's opcode byte is its number + 0xE8. */
const NODE_OP_BASE = 0xe8;

const nameAt = (names: readonly string[], i: number): string => names[i] ?? `#${i}`;
const nodeAt = (nodes: readonly string[], i: number): string => nodes[i] ?? `#${i}`;
const opName = (n: number): UiValveOp => UI_VALVE_OPS[n] ?? `op${n}`;
const bytesFrom = (c: CmdBytes, o: number): number[] => Array.from(c.bytes.subarray(Math.min(o, c.length)));

function uiCommand(c: CmdBytes, names: readonly string[], nodes: readonly string[]): UiCommand {
  const node = c.u16(4), code = c.u8(6);
  return {
    node: node ? nodeAt(nodes, node) : null,
    op: node ? (code >= NODE_OP_BASE ? code - NODE_OP_BASE : code) : 0,
    fn: node ? null : nameAt(names, code),
    arg: nameAt(names, c.u16(8)),
    loc: c.i16(0xc),
    extra: bytesFrom(c, 0x10),
  };
}

function valve(c: CmdBytes, names: readonly string[]): { valve: string; op: UiValveOp; operand: UiOperand } {
  const flags = c.u8(13), ref = c.u32(4), operand = c.i32(8);
  return {
    valve: (flags & 2) !== 0 ? nameAt(names, ref) : `#${ref}`,
    op: opName(c.u8(12)),
    operand: (flags & 0x10) !== 0 ? { valve: (flags & 0x08) !== 0 ? nameAt(names, operand) : `#${operand}` } : operand,
  };
}

/** The tokens of a condition: sub-commands from `start` to the command's end, each with its own header. */
function tokens(c: CmdBytes, start: number, names: readonly string[], nodes: readonly string[]): UiToken[] {
  const out: UiToken[] = [];
  let o = start;
  while (o + 4 <= c.length) {
    const h = c.u32(o), size = h >>> 18;
    if (size < 4 || o + size > c.length) break;
    const sub = new CmdBytes(c.bytes.subarray(o, o + size));
    const set = (h >>> 8) & 0xff, cmd = h & 0xff;
    if (set === UI_SET && cmd === UI_CMD.UI_COMMAND) out.push({ t: 'ui', command: uiCommand(sub, names, nodes) });
    else if (set === 0 && cmd === ZCMD.VALVE) out.push({ t: 'valve', ...valve(sub, names) });
    else if (set === 0 && cmd === EXPRESSION) {
      const e = sub.u8(4);
      out.push(e === 1 ? { t: 'not' } : e === 2 ? { t: 'and' } : e === 3 ? { t: 'or' } : e === 4 ? { t: 'open' } : e === 5 ? { t: 'close' } : { t: 'other', cmd, set });
    } else out.push({ t: 'other', cmd, set });
    o += size;
  }
  return out;
}

/** One command of an interface script to what it does; `names` and `nodes` are its animation's tables. */
export function decodeUiOp(cmd: Pick<ZAnimCommand, 'set' | 'cmd' | 'bytes'>, names: readonly string[], nodes: readonly string[]): UiOp {
  const c = new CmdBytes(cmd.bytes);
  if (cmd.set === UI_SET && cmd.cmd === UI_CMD.UI_COMMAND) {
    const command = uiCommand(c, names, nodes);
    const popup = command.node === 'POPUP' && command.op === 0 ? { popup: { text: c.u16(0x12) } } : {};
    return { op: 'ui', command, ...popup };
  }
  if (cmd.set !== 0) return { op: 'other', set: cmd.set, cmd: cmd.cmd, name: cmd.set === UI_SET && cmd.cmd === UI_CMD.UI_APP_COMMAND ? 'ui::UI_APP_COMMAND' : `set ${cmd.set} cmd ${cmd.cmd}` };
  switch (cmd.cmd) {
    case ZCMD.IF: return { op: 'if', depth: c.u8(4), tokens: tokens(c, 8, names, nodes) };
    case ZCMD.ELSEIF: return { op: 'elseif', depth: c.u8(4), tokens: tokens(c, 8, names, nodes) };
    case ZCMD.ELSE: return { op: 'else', depth: c.u8(4) };
    case ZCMD.ENDIF: return { op: 'endif', depth: c.u8(4) };
    case ZCMD.WHILE: return { op: 'while', forever: (c.u8(4) & 1) !== 0, jump: c.u16(6), tokens: tokens(c, 8, names, nodes) };
    case ZCMD.END_WHILE: return { op: 'endWhile', jump: c.u16(6) };
    case BREAK: return { op: 'break' };
    case ZCMD.LOOP: return { op: 'loop', count: (c.u32(4) & 1) !== 0 && c.i32(8) >= 0 ? c.i32(8) : null };
    case ZCMD.WAIT: return { op: 'wait', seconds: c.f32(8) };
    case ZCMD.CALL_ANIMATION: return { op: 'call', anim: nameAt(names, c.u8(7)), block: (c.u16(4) & 0x200) !== 0 };
    case ZCMD.STOP_ANIMATION: return { op: 'stopAnimation', anim: nameAt(names, c.u8(4)) };
    case ZCMD.CALL_SEQUENCE: return { op: 'callSequence', sequence: nameAt(names, c.u8(4)) };
    case ZCMD.OBJECT_ACTIVE_STATE: return { op: 'active', node: nodeAt(nodes, c.u16(6)), on: c.u16(4) === 1 };
    case ZCMD.OBJECT_MOTION_FROM_TO: return move(c, nodes);
    case OPACITY: return { op: 'opacity', node: nodeAt(nodes, c.u16(4)), from: c.f32(8), to: c.f32(0xc), rate: c.f32(0x10), seconds: c.f32(0x14) };
    case ZCMD.SOUND: {
      const flags = c.u16(4);
      return {
        op: 'sound', sound: nameAt(names, c.u16(6)), flags, newPlay: (flags & 0x80) !== 0, node: c.u8(0x10),
        ...((flags & 0x10) !== 0 ? { volume: c.f32(8) } : {}), ...((flags & 0x20) !== 0 ? { pan: c.u16(0xc) } : {}),
        ...((flags & 0x40) !== 0 ? { pitchMod: c.i16(0xe) } : {}),
      };
    }
    case ZCMD.VALVE: {
      const v = valve(c, names);
      return { op: 'valve', valve: v.valve, operation: v.op, operand: v.operand };
    }
    default: return { op: 'other', set: 0, cmd: cmd.cmd, name: ZANIM_COMMAND_NAMES[cmd.cmd] ?? `cmd ${cmd.cmd}` };
  }
}

function move(c: CmdBytes, nodes: readonly string[]): UiOp {
  const flags = c.u16(4), p = c.u16(0xc), s = c.u16(0x30);
  const out: Extract<UiOp, { op: 'move' }> = { op: 'move', node: nodeAt(nodes, c.u8(6)), flags, seconds: c.f32(0x34) };
  if (p) out.position = { from: (flags & 2) !== 0 ? c.vec3(p + 4) : null, to: c.vec3(p + 0x10), rate: c.vec3(p + 0x1c) };
  if (flags & 0x40) out.rotation = { from: c.quat(0x10), to: c.quat(0x20), relative: (flags & 1) !== 0 };
  if ((flags & 0x200) !== 0 && s) out.scale = { from: (flags & 0x100) !== 0 ? c.vec3(s) : null, to: c.vec3(s + 12), rate: c.vec3(s + 24) };
  return out;
}

/** An animation to its program: every command decoded, the `QUAD_ALIGN` padding left out. */
export function decodeUiProgram(anim: ZAnimAnimation): UiProgram {
  const nodes = anim.nodeRefs.map((r) => r.name);
  return {
    name: anim.name, nodes,
    sequences: anim.sequences.map((s) => ({
      name: s.name, activation: (s.word >>> 1) & 0x7f,
      ops: s.commands.filter((c) => !(c.set === 0 && c.cmd === ZCMD.QUAD_ALIGN)).map((c) => decodeUiOp(c, anim.names, nodes)),
    })),
  };
}

/** A set's animations as programs, by name. */
export function decodeUiSet(set: ZAnimSet): Map<string, UiProgram> {
  return new Map(set.anims.map((a) => [a.name, decodeUiProgram(a)]));
}

/** The two script sets of the ARMORY (research 95 §2.2: the layout's `SCRIPT_LIBRARY`). */
export const ARMORY_SETS = { screen: 'dlg_equipment_mp.rdr', spin: 'ShowAndSpin.rdr' } as const;

/** A set of an archive by name (case as the archive spells it), or a throw naming what the archive holds. */
export function uiSet(archive: ZAnimArchive, name: string): ZAnimSet {
  const set = archive.sets.find((s) => s.name === name);
  if (!set) throw new Error(`UIZANIM.ZAR has no set ${name} (of ${archive.sets.length})`);
  return set;
}

// ---------------------------------------------------------------------------------------------------------------------
// The branches on one valve.

/** An op inside a valve branch, with its `IF` level inside the branch: 1 at the branch's own level, 2+ nested. */
export interface BranchOp { level: number; op: UiOp }

/** Whether a condition is exactly `valve == value`, and the value. */
function equalsTest(tokens: readonly UiToken[], valveName: string): number | null {
  if (tokens.length !== 1) return null;
  const t = tokens[0]!;
  return t.t === 'valve' && t.valve === valveName && t.op === '==' && typeof t.operand === 'number' ? t.operand : null;
}

/**
 * The top-level `IF valve == n` / `ELSEIF valve == n` chains of a sequence, the ops of each branch by `n` (the first
 * branch for a value wins). This is how `ShowAndSpin` and `CallWeaponTips` key everything on `UiWeapon` (research 95
 * §3.7): one branch a UI index.
 */
export function valveBranches(ops: readonly UiOp[], valveName: string): Map<number, BranchOp[]> {
  const out = new Map<number, BranchOp[]>();
  let level = 0;
  let current: BranchOp[] | null = null;
  for (const op of ops) {
    if (op.op === 'if') level++;
    if (level === 1 && (op.op === 'if' || op.op === 'elseif')) {
      const value = equalsTest(op.tokens, valveName);
      current = value === null || out.has(value) ? null : [];
      if (value !== null && current) out.set(value, current);
      continue;
    }
    if (level === 1 && op.op === 'else') { current = null; continue; }
    if (op.op === 'endif') {
      level--;
      if (level === 0) { current = null; continue; }
    }
    if (current && level >= 1) current.push({ level, op });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The ARMORY's item table, read off `ShowAndSpin` and `CallWeaponTips` (R95.8: never hand-typed).

/** The four stat bars (`eq_wep_comp_bar{,2,3,4}`: VOLUME, ACCURACY, RANGE, FIRE RATE; research 95 §2.4, §3.7). */
export const ARMORY_BARS = ['eq_wep_comp_bar', 'eq_wep_comp_bar2', 'eq_wep_comp_bar3', 'eq_wep_comp_bar4'] as const;

export type ArmorySlot = 'primary' | 'secondary' | 'equipment';

/** One `UiWeapon` value's branch of `ShowAndSpin` (research 95 §3.7) and its tip (`CallWeaponTips`). */
export interface ArmoryItemScript {
  /** The UI index (`UiWeapon`): 1-65 primaries, 75-85 secondaries, 35-57 equipment, 0 empty, 254/255 (§3.4). */
  ui: number;
  /** Which `Choose*` the branch calls, and its argument: the item's display name (`M16A2`, `Double Ammo Load`). */
  slot: ArmorySlot | null;
  name: string | null;
  /** `weapmodeltext`'s caption. */
  caption: UiText | null;
  /** `FireMode1`'s caption id (5 SINGLE-BURST-AUTO, 1026, 1032, 1036, 1038, 1053). */
  fireMode: number | null;
  /** The bars' x-scales of the 140-px `blue_fill` (VOLUME, ACCURACY, RANGE, FIRE RATE), or null when not set. */
  bars: [number, number, number, number] | null;
  /**
   * The last `eq_wep_comp_dummy` show or hide at the branch's level -- the bars drawn (guns) or not (equipment) -- or,
   * where only the nested branches set it (the launchers' two-slot checks), the first of those: a pick that succeeds.
   */
  showsBars: boolean | null;
  /** The `MODELS` entry shown and spun (`EquipM16`). */
  model: string | null;
  /** The spin: `MOVE` flags 0x61 inside `WHILE` forever -- its time and its relative rotation (§3.8). */
  spin: { seconds: number; to: Quat4 } | null;
  /** What `WepDescription` types at the branch's level (" " for the guns; the equipment's id), or the success path's. */
  description: UiText | null;
  /** The animations the branch calls at its level (`Enable203Equip`, `DisableGLEquip`, `TurnOnPadlocks1` ...). */
  calls: string[];
  /** The literal refusals typed into `WepDescription` in the nested branches (the two-slot texts, §4.3). */
  refusals: string[];
  /** `CallWeaponTips`' `WepInstText` id for this index, or null (items 53-57 have none, §3.10). */
  tip: number | null;
}

const CHOOSE: Record<string, ArmorySlot> = {
  ChoosePrimary: 'primary', ChooseSecondary: 'secondary', ChooseEquip1: 'equipment', ChooseEquip2: 'equipment', ChooseEquip3: 'equipment',
};

const textOf = (c: UiCommand): UiText => (c.loc !== 0 ? { loc: c.loc } : { text: c.arg });

/** Every `UiWeapon` branch of `ShowAndSpin` (its first sequence), with `CallWeaponTips`' tips, in `UiWeapon` order. */
export function armoryItemScripts(spin: ZAnimSet, screen: ZAnimSet): ArmoryItemScript[] {
  const program = (set: ZAnimSet, name: string): UiProgram => {
    const a = set.anims.find((x) => x.name === name);
    if (!a) throw new Error(`${set.name} has no animation ${name}`);
    return decodeUiProgram(a);
  };
  const show = program(spin, 'ShowAndSpin').sequences[0]?.ops ?? [];
  const tipsOps = program(screen, 'CallWeaponTips').sequences[0]?.ops ?? [];
  const tips = new Map<number, number>();
  for (const [ui, ops] of valveBranches(tipsOps, 'UiWeapon')) {
    for (const { level, op } of ops) {
      if (level === 1 && op.op === 'ui' && op.command.node === 'WepInstText' && op.command.loc) tips.set(ui, op.command.loc);
    }
  }
  const out: ArmoryItemScript[] = [];
  for (const [ui, ops] of valveBranches(show, 'UiWeapon')) {
    const item: ArmoryItemScript = {
      ui, slot: null, name: null, caption: null, fireMode: null, bars: null, showsBars: null, model: null, spin: null,
      description: null, calls: [], refusals: [], tip: tips.get(ui) ?? null,
    };
    const bars: (number | null)[] = [null, null, null, null];
    // The nested branches' first description and bars switch: the path a pick that succeeds takes (its `IF` first).
    let nestedDescription: UiText | null = null, nestedBars: boolean | null = null;
    let inWhile = 0;
    for (const { level, op } of ops) {
      if (op.op === 'while') inWhile++;
      else if (op.op === 'endWhile') inWhile = Math.max(0, inWhile - 1);
      // A `Choose*` is a command of its own or an `IF`'s condition (its tick's return is the truth): the first of either.
      const commands = op.op === 'ui' ? [op.command] : op.op === 'if' || op.op === 'elseif'
        ? op.tokens.flatMap((t) => (t.t === 'ui' ? [t.command] : [])) : [];
      for (const c of commands) {
        if (item.slot === null && c.fn && CHOOSE[c.fn]) { item.slot = CHOOSE[c.fn]!; item.name = c.arg; }
      }
      if (level > 1) {
        if (op.op === 'ui' && op.command.node === 'WepDescription' && op.command.op === 1) {
          const literal = op.command.loc === 0 && op.command.arg.trim() !== '';
          if (literal && !item.refusals.includes(op.command.arg)) item.refusals.push(op.command.arg);
          if (!literal && nestedDescription === null) nestedDescription = textOf(op.command);
        } else if (op.op === 'active' && op.node === 'eq_wep_comp_dummy' && nestedBars === null) nestedBars = op.on;
        continue;
      }
      if (op.op === 'ui' && op.command.node === 'weapmodeltext' && op.command.op === 1) item.caption = textOf(op.command);
      else if (op.op === 'ui' && op.command.node === 'FireMode1' && op.command.op === 1 && op.command.loc) item.fireMode = op.command.loc;
      else if (op.op === 'ui' && op.command.node === 'WepDescription' && op.command.op === 1) item.description = textOf(op.command);
      else if (op.op === 'active' && op.node === 'eq_wep_comp_dummy') item.showsBars = op.on;
      else if (op.op === 'call') item.calls.push(op.anim);
      else if (op.op === 'move') {
        const bar = (ARMORY_BARS as readonly string[]).indexOf(op.node);
        if (bar >= 0 && op.scale) bars[bar] = op.scale.to[0];
        if (inWhile > 0 && op.rotation?.relative) { item.model = op.node; item.spin = { seconds: op.seconds, to: op.rotation.to }; }
      }
    }
    if (bars.every((b) => b !== null)) item.bars = bars as [number, number, number, number];
    item.description ??= nestedDescription;
    item.showsBars ??= nestedBars;
    out.push(item);
  }
  return out.sort((a, b) => a.ui - b.ui);
}
