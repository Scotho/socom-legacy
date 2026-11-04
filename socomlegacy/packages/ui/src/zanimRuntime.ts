import { VALVE_TYPE, type Valve, type ValveStore } from './valves';
import { dialogNodeNames, type DialogDesign, type DialogRecord, type DialogSubordinate } from './dialog';

/**
 * The generic zAnim UI script runtime (PLAT-07; web research 106). It runs a dialog's zAnim sets -- `RUN/UIZANIM.ZAR`,
 * `EXTZANIM.ZAR`, `MPZANIM.ZAR`, as `@s2u/scene`'s `parseAnimSets` reads them -- the way the game's zAnim player does,
 * over a node tree (PLAT-05's dialog, `dialogNodeTree`), with its valves in `ValveStore` (PLAT-09, research 104) and
 * every `ui::UI_COMMAND` sent to a host interface it declares (PLAT-08 fills it). The clock is the caller's: `tick(dt)`
 * (PLAT-12 owns the frame clock).
 *
 * Read from the retail decompilation (`D:L<line>` = a line of `socom2_game.elf.decomp.c`; three short command ticks the
 * decompiler folded into a neighbour are read from their disassembly, cited by address):
 * - **The player** (research 106 §2): the zAnim context 0x414bb0 keeps one scheduler list of running instances, ordered
 *   by priority (`FUN_0034e6b0` D:L248794-248846: a new one goes after every one of equal priority) and walked once a
 *   frame (`FUN_0034e070` D:L248531-248567), each instance ticked by `FUN_00270220` (D:L118623-118662): its sequences in
 *   file order, each stepped by `FUN_00269da0` (D:L114845-114910) with the whole frame's time.
 * - **A sequence** runs commands until one is not done or the frame's time is spent; a command is begun, then ticked,
 *   in the same call (`FUN_0026a6e0` D:L115182-115213). With no time left only a timeless command (header bit 17) runs
 *   (D:L114886-114892).
 * - **The commands** are the 58 of set 0 and the two `ui::` of set 1 registered in `FUN_0025bc20` (D:L106865-106924);
 *   this runtime implements every one the three archives use (research 106 §4) and throws on any other.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

// ---------------------------------------------------------------------------------------------------------------------
// The input: what the runtime reads of `@s2u/scene`'s `ZAnimSet` (structural, so this package needs no import of it).

/** One command: its byte offset in the animation's `Seq_Data`, its header's fields, its bytes (header included). */
export interface ZAnimRtCommand { offset: number; set: number; cmd: number; timeless: boolean; size: number; bytes: Uint8Array }
/** One sequence: its 28-byte head's offset in `Seq_Data`, its name, its second word, its size (head included). */
export interface ZAnimRtSequence { offset: number; name: string; word: number; size: number; commands: readonly ZAnimRtCommand[] }
/** The animation's `Anim_Params` the player reads: the flags word (+4), the priority (+0xc), the four sequence offsets (+0x10). */
export interface ZAnimRtParams { flags: number; priority: number; seqOffsets: readonly number[]; state?: number }
export interface ZAnimRtAnimation {
  name: string;
  params: ZAnimRtParams;
  /** The animation's name table (index 0 `NA`): the names its commands index. */
  names: readonly string[];
  /** The `Node_Ref_List`: the node a command's node index names. */
  nodeRefs: readonly { name: string }[];
  sequences: readonly ZAnimRtSequence[];
}
export interface ZAnimRtSet { name: string; anims: readonly ZAnimRtAnimation[] }

// ---------------------------------------------------------------------------------------------------------------------
// The node tree and the host.

/** A node as the commands see it: the local position (+0x30), orientation, scale, opacity (+0x9c) and active state. */
export interface ZAnimNode {
  position: [number, number, number];
  /** x, y, z, w. */
  rotation: [number, number, number, number];
  scale: [number, number, number];
  opacity: number;
  active: boolean;
}

/** The nodes a dialog's animations reach by the names in their `Node_Ref_List`s. */
export interface ZAnimNodeTree {
  /** The node of a name, or undefined (the command then does nothing: e.g. `FUN_0025f880` D:L108814-108817). */
  node(name: string): ZAnimNode | undefined;
  /** Node index 0xF9: the instance's own node (`FUN_0026f4e0` D:L118170-118180); undefined when the tree has none. */
  owner?(): ZAnimNode | undefined;
}

/** A `ui::UI_COMMAND` as `FUN_002745a0` (D:L121363-121430) reads it. */
export interface ZAnimUiCommand {
  /** The animation and the sequence running it. */
  anim: string;
  sequence: string;
  /** +4 u16: the node index, 0 for none; and its name through the `Node_Ref_List`. */
  nodeIndex: number;
  node: string | null;
  /** +6 u8: with a node, the node's opcode + 0xE8 (research 95 §1.2); without, the bound function's name index. */
  opcodeByte: number;
  /**
   * `names[+6]`, with or without a node, or null when +6 indexes past the name table: the key of the global function
   * table at 0x3dd4d0 that the command falls back to whenever no node takes it
   * (D:L121387-121429; see `ZAnimHost.uiCommand`).
   */
  fn: string | null;
  /** +8 u16: the argument's name (`names[+8]`). */
  arg: string;
  /** +0xc s16: a `UIMnLOC` string id, 0 for the literal at +8. */
  loc: number;
  /** The command's bytes, header included (the words past +0x10: a mode, a popup's record). */
  bytes: Uint8Array;
}

/** A `SOUND` command (30; `FUN_002659c0` D:L112317-112510, which is always done: its one `return 1`, D:L112510). */
export interface ZAnimSoundCommand { anim: string; flags: number; sound: string; nodeIndex: number; bytes: Uint8Array }

/**
 * What the scripts ask of the game: the runtime declares it, PLAT-08 fills it (`UiCommandHost` in `uiCommands.ts`,
 * web research 107). Nothing here implements a command.
 */
export interface ZAnimHost {
  /**
   * `ui::UI_COMMAND` (set 1, cmd 1; tick `FUN_002745a0` D:L121344-121431). The answer is the command's tick return:
   * its truth inside a condition and, as a statement, whether it is done -- false holds the sequence on it, ticked again
   * next frame (`FUN_00269da0` D:L114896-114899).
   *
   * The original's order, which the host must keep (PLAT-08): with a node (`nodeIndex` != 0), the command goes first to
   * the handler at the node's object's vtable +100 (D:L121370-121385), which answers through a pointer when it takes it;
   * when there is no such object, or the handler does not take it (returns 0), it falls back to the global table at
   * 0x3dd4d0 (D:L121387-121429): the entry keyed by the
   * name `fn` (`names[+6]`, compared with `FUN_00198b80`; 0xE8 when the name is absent, 0 when it is empty or matches
   * none), the key cached in the command's byte +10 after the first lookup (D:L121409), and that entry's function
   * answers. The runtime does no part of this: it hands the host `node`, `opcodeByte`, `fn` and the bytes (byte +10
   * included). Nothing taking it, the answer is 1 (D:L121428-121430).
   */
  uiCommand(cmd: ZAnimUiCommand, time?: ZAnimTime): boolean;
  /** `SOUND` (30): a new play, a stop ... (research 81 §6's layout). Optional: absent, the command does nothing. */
  sound?(cmd: ZAnimSoundCommand): void;
  /**
   * An alive instance of animation `anim` ended -- stopped (`STOP_ANIMATION`, a set's deactivation) or run out --:
   * `FUN_0026ff20` runs `FUN_0026fd20` over its name slots (D:L118572), which stops or fades the sounds marked 0x200
   * and lets the others play out (PF-32, research 233 §3; `UiSoundCues.stopInstance`). Optional.
   */
  instanceStop?(anim: string): void;
}

/** One line of the runtime's own trace (PLAT-32 compares it with the original's). */
export type ZAnimTraceEvent =
  | { kind: 'command'; frame: number; anim: string; sequence: string; offset: number; set: number; cmd: number; done: boolean }
  | { kind: 'start' | 'refused' | 'end' | 'stop'; frame: number; anim: string };

export interface ZAnimRuntimeOptions {
  sets: readonly ZAnimRtSet[];
  valves: ValveStore;
  host: ZAnimHost;
  nodes: ZAnimNodeTree;
  /**
   * `FUN_00197740`'s rand, 0..2^31-1: `RANDOM_WEIGHT` (seven condition tokens on the disc) and a `WAIT` with flag 0x20
   * (none) ask for it; the original's generator and seed are not modelled (research 106 §8). Absent, they throw.
   */
  random?: () => number;
  trace?: (e: ZAnimTraceEvent) => void;
}

/** A command id no tick in this runtime implements, or a flag of one it does not model. */
export class ZAnimUnsupportedError extends Error {}

// ---------------------------------------------------------------------------------------------------------------------
// Readings.

/**
 * CALL_SET_SEARCH_READING: an animation a script calls by name is looked up in the caller's own set first, then in the
 * others in load order (`FUN_0026a250` D:L115013-115072: the "current" set is `(ctx+0x34 - base) / 0x34`, which is not
 * traced; the caller's set is the reading), case-insensitively (`FUN_0026c8f0` D:L116531-116544, `strcasecmp`). [reading]
 */
export const CALL_SET_SEARCH_READING = 'caller-first' as const;

/**
 * QUAT_PRODUCT_READING: `FUN_003070c0` (D:L206148-206165), a relative rotation's target, is read as the Hamilton product
 * to x from: the vector part cross(to, from) + from.w to + to.w from as the decompilation shows, the w part
 * to.w from.w - to.from, where the decompilation subtracts an uninitialised stack word besides. [reading]
 */
export const QUAT_PRODUCT_READING = 'hamilton' as const;

/**
 * NODE_NAME_MATCH_READING: a `Node_Ref_List` name binds to the node spelled **exactly** -- the menu's find-by-name
 * (`FUN_0026f4e0` D:L118182-118230 -> `FUN_00269230` D:L114366-114413 -> the menu object's vtable +0x24, `FUN_00315d00`
 * D:L215255-215290) compares `strlen` (`FUN_00199288`), then `strcmp` (`FUN_00198f18` D:L15765-15861: byte for byte,
 * no folding), a level's children first, then each child's subtree -- so two nodes whose names differ only by case are
 * two (dlgLadderLobby.rdr's foot `Medal_Blue` .. `Medal_Black` and its legend's `medal_blue` .. `medal_black`, research
 * 269 §4.2); a name no node spells exactly reaches none of the dialog's. The resolve's later step for modes 0 and 2,
 * `FUN_0031fd10` (D:L221082-221088) -> `FUN_00320f10` (D:L221750-221773) -> `FUN_00312120` (D:L213012-213038), compares
 * with `strcasecmp` (`FUN_00198b80` D:L15551-15607), but over the global list at 0x45c3c0 (the one `FUN_00321390`
 * searches for textures by name, e.g. D:L57282), not the dialog's nodes, and is not traced: not modelled. On the disc
 * no reference reaches a node only by folding, models included (research 183 §18; `nodeNameCaseDisc.test.ts`). Also
 * not modelled: a reference's parent index (`FUN_0026f4e0`'s byte 0, a search within the parent's subtree) and the
 * menus at +0x6ba0. [reading, pending review]
 */
export const NODE_NAME_MATCH_READING = 'exact' as const;

/**
 * NODE_ACTIVE_FLAG_READING: `NODE_ACTIVE` (7) reads the node's +0x5c bit 0 (`FUN_0025e230` D:L107971-107980) and
 * `OBJECT_ACTIVE_STATE` (17) writes through the node's vtable +0x38 (`FUN_00263aa0` D:L111360-111369); both are taken
 * as the one `active` flag. The vtable's body was not read. [reading]
 */
export const NODE_ACTIVE_FLAG_READING = 'one-flag' as const;

/**
 * DIALOG_NODE_STATE_READING: what a dialog's node holds before any script: position (XPOS, YPOS, 0), its record's
 * OPACITY, active, scale 1, no rotation. Where `CGameMenu_LoadFromDesign` (D:L263400) stores XPOS/YPOS and OPACITY in
 * the node was not read for this task. [reading]
 */
export const DIALOG_NODE_STATE_READING = 'record' as const;

// ---------------------------------------------------------------------------------------------------------------------
// The command table (`FUN_0025bc20` D:L106865-106924: set 0 numbered from 1 in registration order; set 1 the `ui::`).

/** The command ids the runtime implements, set 0 by number (the names of `@s2u/scene`'s `ZANIM_COMMAND_NAMES`). */
export const ZCMD_RT = {
  QUAD_ALIGN: 1, IF: 2, ELSEIF: 3, ELSE: 4, ENDIF: 5, NODE_ACTIVE: 7, RANDOM_WEIGHT: 10, FAIL: 11, LOOP: 14, WAIT: 15, OBJECT_ACTIVE_STATE: 17,
  OBJECT_MOTION_FROM_TO: 22, OBJECT_OPACITY_FROM_TO: 25, SOUND: 30, WHILE: 39, END_WHILE: 40, EXPRESSION: 43, BREAK: 44,
  CALL_ANIMATION: 45, STOP_ANIMATION: 46, PAUSE_ANIMATION: 47, RESUME_ANIMATION: 48, CALL_SEQUENCE: 50,
  STOP_SEQUENCE: 51, DEBUG: 52, VALVE: 61,
} as const;
/** Set 1 (D:L106923-106924): 1 `ui::UI_COMMAND` (tick 0x2745a0), 2 `ui::UI_APP_COMMAND` (tick 0x274590). */
export const UI_SET_RT = 1;
const UI_COMMAND = 1, UI_APP_COMMAND = 2;

const id = (set: number, cmd: number): number => (set << 8) | cmd;
const ID_ELSEIF = id(0, ZCMD_RT.ELSEIF), ID_ELSE = id(0, ZCMD_RT.ELSE), ID_ENDIF = id(0, ZCMD_RT.ENDIF);
const ID_END_WHILE = id(0, ZCMD_RT.END_WHILE), ID_EXPRESSION = id(0, ZCMD_RT.EXPRESSION);

/** The sequence states (+5): `FUN_00269da0` D:L114848-114906, `FUN_0026a040`. */
export const SEQ_STATE = { IDLE: 1, START: 2, RESTART: 3, RUNNING: 4, DONE: 5 } as const;
/** The command phase (+6): 2 its begin is due, 4 it is ticking (`FUN_0026a6e0` D:L115193-115200). */
const PHASE_BEGIN = 2, PHASE_TICK = 4;
/** The 28-byte sequence head: the first command (`FUN_00269da0` D:L114873). */
const SEQ_HEAD = 0x1c;
/** The guards' frame (`FUN_0026d870` D:L117118: `FUN_00269da0(0x3f800000, ...)`, 1.0 s). */
const GUARD_DT = 1.0;
/** `FUN_00197740`'s scale (D:L108447, D:L107791): 4.656613e-10, which as an f32 is 2^-31 exactly. */
const RAND_SCALE = Math.fround(4.656613e-10);
/** `(float)rand * 4.656613e-10` in single precision, as the original computes it. */
const unitRand = (r: number): number => Math.fround(Math.fround(r) * RAND_SCALE);

/** The 2-, 3- and 4-float vectors the motion reads. */
type V3 = [number, number, number];
type Q = [number, number, number, number];

/** Little-endian reads and writes over a sequence image; a read past its end answers 0, as a header there ends a walk. */
class Img {
  readonly v: DataView;
  constructor(readonly b: Uint8Array) { this.v = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  get size(): number { return this.b.length; }
  private ok(o: number, n: number): boolean { return o >= 0 && o + n <= this.b.length; }
  u8(o: number): number { return this.ok(o, 1) ? this.b[o]! : 0; }
  i8(o: number): number { return this.ok(o, 1) ? this.v.getInt8(o) : 0; }
  u16(o: number): number { return this.ok(o, 2) ? this.v.getUint16(o, true) : 0; }
  i16(o: number): number { return this.ok(o, 2) ? this.v.getInt16(o, true) : 0; }
  u32(o: number): number { return this.ok(o, 4) ? this.v.getUint32(o, true) : 0; }
  i32(o: number): number { return this.ok(o, 4) ? this.v.getInt32(o, true) : 0; }
  f32(o: number): number { return this.ok(o, 4) ? this.v.getFloat32(o, true) : 0; }
  setU16(o: number, x: number): void { if (this.ok(o, 2)) this.v.setUint16(o, x & 0xffff, true); }
  setF32(o: number, x: number): void { if (this.ok(o, 4)) this.v.setFloat32(o, x, true); }
  vec(o: number): V3 { return [this.f32(o), this.f32(o + 4), this.f32(o + 8)]; }
  setVec(o: number, x: readonly number[]): void { this.setF32(o, x[0]!); this.setF32(o + 4, x[1]!); this.setF32(o + 8, x[2]!); }
  quat(o: number): Q { return [this.f32(o), this.f32(o + 4), this.f32(o + 8), this.f32(o + 12)]; }
  setQuat(o: number, q: readonly number[]): void { for (let i = 0; i < 4; i++) this.setF32(o + 4 * i, q[i]!); }
  /** The header at `o`: `type` (set << 8 | cmd), timeless (bit 17), size in bytes (bits 18-31; `FUN_0026a8b0` D:L115258-115260). */
  type(o: number): number { return this.u32(o) & 0xffff; }
  timeless(o: number): boolean { return (this.u32(o) & (1 << 17)) !== 0; }
  cmdSize(o: number): number { return this.u32(o) >>> 18; }
}

/** A sequence's bytes as the player walks them: the head's 28 bytes, then every command at its own offset. */
function sequenceImage(seq: ZAnimRtSequence): Img {
  const b = new Uint8Array(seq.size);
  for (const c of seq.commands) b.set(c.bytes.subarray(0, Math.max(0, Math.min(c.bytes.length, seq.size - (c.offset - seq.offset)))), c.offset - seq.offset);
  return new Img(b);
}

// ---------------------------------------------------------------------------------------------------------------------
// The running state.

/** A sequence's state (the reCOM `_zsequence` head, zanim.h 463-481; the fields `FUN_00269da0` reads). */
export interface ZAnimSequenceState {
  readonly name: string;
  /** The word's byte +4 >> 1: 1 starts with its animation (`FUN_0026ae20` D:L115467), any other waits for `CALL_SEQUENCE`. */
  readonly activation: number;
  /** +5 (`SEQ_STATE`). */
  state: number;
  /** +8: the program counter, a byte offset from the sequence's head. */
  pc: number;
  /** +6. */
  phase: number;
  /** +7: the IF depth (`FUN_002681c0` D:L113710-113721). */
  depth: number;
  /** +2 and +0x18: `LOOP`'s count and clock (`FUN_0025ede0` D:L108458-108460). */
  loopCount: number;
  loopTimer: number;
  /** +0x10: the time the sequence's commands consumed since it (re)started; +0x14: the current command's. */
  elapsed: number;
  cmdElapsed: number;
  readonly img: Img;
  readonly offset: number;
}

/** A call slot of an instance (`FUN_0026e650` D:L117597-117647, 12 bytes): the name index (+0), +6's byte (+1), the definition (+4), the instance it started (+8). */
interface CallSlot { name: number; channel: number; def: ZAnimInstance | null; instance: ZAnimInstance | null }

/** An animation's instance: the definition itself is the first one (`FUN_00270ef0` D:L119145-119216), copies chain off it. */
export class ZAnimInstance {
  /** +3: 1 idle, 2 started, 4 running, 5 done (`FUN_0026ff20`). */
  state: number;
  /** +2. */
  paused = false;
  /** +8: the time the instance has run (`FUN_00270220` D:L118649). */
  elapsed = 0;
  /** +0x34 bit 0, from the flags' bit 19 at the set's activation (`FUN_0026c600` D:L116340-116344): no start. */
  disabled: boolean;
  /** +6 bit 3 of the instance: an IF depth stepped out of 0..255 (`FUN_002681c0` D:L113712-113720). */
  depthError = false;
  readonly sequences: ZAnimSequenceState[];
  /** +100: the next copy. */
  next: ZAnimInstance | null = null;
  readonly slots: CallSlot[] = [];
  /** The per-instance valve table (`FUN_0026eb30` D:L117792-117841): a name index to its valve. */
  readonly valveCache = new Map<number, Valve>();
  /** First type-8 input record (+0x18), installed before a parameterized start's guard; research 363 §1. */
  inputString: string | null = null;

  constructor(readonly anim: ZAnimRtAnimation, readonly setIndex: number) {
    this.state = anim.params.state ?? SEQ_STATE.IDLE;
    this.disabled = ((anim.params.flags >>> 19) & 1) !== 0;
    this.sequences = anim.sequences.map((s) => ({
      name: s.name, activation: (s.word & 0xff) >> 1, state: (s.word >>> 8) & 0xff, pc: SEQ_HEAD, phase: PHASE_BEGIN, depth: 0,
      loopCount: 0, loopTimer: 0, elapsed: 0, cmdElapsed: 0, img: sequenceImage(s), offset: s.offset,
    }));
  }
  get name(): string { return this.anim.name; }
  /** `FUN_00269d10` (D:L114791-114797): started, restarting or running. The attached-sound half of `FUN_00270e40` is not modelled. */
  get alive(): boolean { return this.state === 2 || this.state === 3 || this.state === 4; }
}

/** The context a command's functions run in: the instance, its sequence, the command's offset. */
interface Ctx { inst: ZAnimInstance; seq: ZAnimSequenceState; at: number }
/** The frame's time left, passed by reference as `float *` is. */
interface Dt { v: number }

/**
 * The tick's time, by reference: the float `FUN_0026a6e0` hands every command's tick as its second argument
 * (D:L115202-115208); a command that consumes time lowers `v`. `ZAnimHost.uiCommand` receives it (PLAT-08).
 */
export type ZAnimTime = Dt;

interface CommandFns {
  begin?(rt: ZAnimRuntime, c: Ctx): void;
  tick?(rt: ZAnimRuntime, c: Ctx, dt: Dt): boolean;
}

/** A scheduler entry (`FUN_0034e6b0` D:L248823-248826: killed +4, priority +8, the instance +0x10). */
interface Entry { inst: ZAnimInstance; priority: number; killed: boolean }

// ---------------------------------------------------------------------------------------------------------------------
// Vector and quaternion helpers (`FUN_00309240` add, `FUN_00309200` subtract, `FUN_00309180` scale).

const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const scale = (k: number, a: readonly number[]): V3 => [k * a[0]!, k * a[1]!, k * a[2]!];
const mul = (a: readonly number[], b: readonly number[]): V3 => [a[0]! * b[0]!, a[1]! * b[1]!, a[2]! * b[2]!];

/** `FUN_003070c0` (D:L206148-206165): a x b (QUAT_PRODUCT_READING). */
export function quatProduct(a: readonly number[], b: readonly number[]): Q {
  const [ax, ay, az, aw] = a as Q, [bx, by, bz, bw] = b as Q;
  return [
    ay * bz - az * by + bw * ax + aw * bx,
    az * bx - ax * bz + bw * ay + aw * by,
    ax * by - ay * bx + bw * az + aw * bz,
    aw * bw - (ax * bx + ay * by + az * bz),
  ];
}

/**
 * `FUN_00306ae0` (D:L205927-205998): t <= 0 is `from`, t >= 1 is `to`; else the shorter arc (`to` negated when the
 * 4-dot is below 0), a normalised lerp above a dot of 0.95, the sine weights below it (not normalised).
 */
export function zanimSlerp(t: number, from: readonly number[], to: readonly number[]): Q {
  if (t <= 0) return [...from] as Q;
  if (t >= 1) return [...to] as Q;
  let d = from[0]! * to[0]! + from[1]! * to[1]! + from[2]! * to[2]! + from[3]! * to[3]!;
  let e = to;
  if (d < 0) { d = -d; e = [-to[0]!, -to[1]!, -to[2]!, -to[3]!]; }
  if (d > 0.95) {
    const q: Q = [0, 1, 2, 3].map((i) => (1 - t) * from[i]! + t * e[i]!) as Q;
    const n = 1 / Math.sqrt(q[3] * q[3] + q[0] * q[0] + q[1] * q[1] + q[2] * q[2]);
    return q.map((x) => x * n) as Q;
  }
  const th = Math.acos(d), k = 1 / Math.sin(th), k0 = k * Math.sin((1 - t) * th), k1 = k * Math.sin(t * th);
  return [0, 1, 2, 3].map((i) => k0 * from[i]! + k1 * e[i]!) as Q;
}

// ---------------------------------------------------------------------------------------------------------------------
// The runtime.

export class ZAnimRuntime {
  /** The frames `tick` has run (the trace's clock). */
  frame = 0;
  readonly valves: ValveStore;
  private readonly host: ZAnimHost;
  private readonly nodes: ZAnimNodeTree;
  private readonly sets: readonly ZAnimRtSet[];
  private readonly defs: ZAnimInstance[][];
  private readonly list: Entry[] = [];
  private readonly activeSets = new Set<number>();
  private readonly random?: () => number;
  private readonly traceFn?: (e: ZAnimTraceEvent) => void;
  /** DAT_00414be8, saved and restored around an instance's tick and guards; research 363 §2. */
  private current: ZAnimInstance | null = null;

  constructor(opts: ZAnimRuntimeOptions) {
    this.sets = opts.sets;
    this.valves = opts.valves;
    this.host = opts.host;
    this.nodes = opts.nodes;
    this.random = opts.random;
    this.traceFn = opts.trace;
    this.defs = opts.sets.map((s, i) => s.anims.map((a) => new ZAnimInstance(a, i)));
  }

  /** The instances the scheduler holds, in its order. */
  running(): ZAnimInstance[] { return this.list.filter((e) => !e.killed).map((e) => e.inst); }

  /**
   * The running command's first string input (`FUN_00272480` D:L119977-120010). A name is retained for the screen
   * host's existing interface; the current instance wins, so two copies with the same name cannot share inputs.
   * Outside a command, a named instance's retained record can be inspected while its set is active. No unrelated
   * binding supplies a fallback (research 363).
   */
  inputString(anim: string): string | null {
    const key = anim.toLowerCase();
    const inst = this.current?.name.toLowerCase() === key ? this.current
      : this.running().find((i) => i.alive && i.name.toLowerCase() === key) ?? this.find(anim);
    if (inst && inst !== this.current && !this.activeSets.has(inst.setIndex)) return null;
    return inst?.inputString ?? null;
  }

  /** Whether any instance of `name` is alive. */
  isRunning(name: string): boolean {
    const key = name.toLowerCase();
    return this.defs.some((d) => d.some((i) => {
      for (let x: ZAnimInstance | null = i; x; x = x.next) if (x.alive && x.name.toLowerCase() === key) return true;
      return false;
    }));
  }

  /**
   * An animation's definition by name (`FUN_0026a250` D:L115013-115072 with `FUN_0026c8f0` D:L116531-116544): `set::anim`
   * names its set; otherwise `fromSet` first (CALL_SET_SEARCH_READING), then every other set in order, each searched
   * case-insensitively, the first match.
   */
  find(name: string, fromSet?: number): ZAnimInstance | null {
    let anim = name, first = fromSet;
    const sep = name.indexOf('::');
    if (sep >= 0) {
      const setName = name.slice(0, sep).toLowerCase();
      anim = name.slice(sep + 2);
      first = this.sets.findIndex((s) => s.name.toLowerCase() === setName);
      if (first < 0) first = undefined;
    }
    const inSet = (i: number): ZAnimInstance | null => {
      const k = this.sets[i]!.anims.findIndex((a) => a.name.toLowerCase() === anim.toLowerCase());
      return k >= 0 ? this.defs[i]![k]! : null;
    };
    if (first !== undefined) { const hit = inSet(first); if (hit) return hit; }
    for (let i = 0; i < this.sets.length; i++) {
      if (i === first) continue;
      const hit = inSet(i);
      if (hit) return hit;
    }
    return null;
  }

  /** Whether a set is active: its byte +1, set by `FUN_0026c600` (D:L116324-116325), cleared by `FUN_0026c2e0` (D:L116179). */
  isActive(setName: string): boolean {
    const i = this.sets.findIndex((s) => s.name.toLowerCase() === setName.toLowerCase());
    return i >= 0 && this.activeSets.has(i);
  }

  /**
   * A set's activation (`FUN_0026c600` D:L116312-116387 -> `FUN_002713f0` D:L119314-119338): unless already active
   * (byte +1, D:L116324-116325, set before any start so the starts pass `FUN_002734b0`'s gate), every animation's
   * disabled bit is taken from its flags' bit 19; then every animation, in order, whose activation bits (flags & 7) are
   * 1 and which is idle or done, starts. With no name, every set in order.
   *
   * Not modelled, and refused rather than dropped (`zanimUnsupported` lists them; the disc has none, research 106 §8):
   * activation bits 3, which attach the animation to a node through `FUN_002740e0` (D:L121133); flags bit 11 (the
   * byte +5 bit 3 `FUN_0026c600` tests, D:L116360), which takes `FUN_00271250` / `FUN_00271390` instead; and flags
   * bit 12 (byte +5 bit 4), with which `FUN_0026f210` (D:L118066-118098) gives the instance a node of its own
   * (`FUN_00180e10(0xc0)`, `FUN_00316e30`, named through the format at 0x3ed460). The refusal is atomic: every set the
   * call reaches is checked before any is activated. Modelled as nothing: `FUN_00271650` (D:L119419-119457), which
   * clears the instance's resolved node references and re-resolves them through `FUN_0026f210` -> `FUN_0026f4e0`
   * (D:L118099-118112), and, on a set's first activation, `FUN_0026f120` (D:L118009, it registers them with the set):
   * this runtime resolves a node by name at each command (`ZAnimNodeTree`), so it keeps no reference to clear.
   */
  activate(setName?: string): void {
    const targets = this.sets.map((s, i) => i).filter((i) => {
      const s = this.sets[i]!;
      if (setName !== undefined && s.name.toLowerCase() !== setName.toLowerCase()) return false;
      return !this.activeSets.has(i);                                             // D:L116322-116325: once
    });
    for (const i of targets) {                                                    // every refusal before any activation
      const s = this.sets[i]!;
      for (const a of s.anims) {
        const why = activationUnsupported(a);
        if (why) throw new ZAnimUnsupportedError(`zAnim ${s.name}/${a.name}: ${why}`);
      }
    }
    for (const i of targets) {
      this.activeSets.add(i);
      for (const def of this.defs[i]!) {                                          // D:L116340-116344: byte +6 bit 3
        for (let x: ZAnimInstance | null = def; x; x = x.next) x.disabled = ((x.anim.params.flags >>> 19) & 1) !== 0;
      }
      for (const def of this.defs[i]!) {
        for (let x: ZAnimInstance | null = def; x; x = x.next) {
          if ((x.state === SEQ_STATE.IDLE || x.state === SEQ_STATE.DONE) && (x.anim.params.flags & 7) === 1) this.start(x);
        }
      }
    }
  }

  /**
   * A set's deactivation (`FUN_0026c2e0` D:L116142-116181): every instance of every animation, copies included, is
   * stopped (`FUN_002707c0(inst, 0)`), then the set's byte +1 is cleared, so a start in it is refused until it is
   * activated again. With no name, every set. Not modelled: the node and sound resets `FUN_0026fbf0(inst, 1)`
   * (D:L118390) and the releases `FUN_0026fe90` (D:L118481) it runs on each instance (research 106 §8).
   */
  deactivate(setName?: string): void {
    this.sets.forEach((s, i) => {
      if (setName !== undefined && s.name.toLowerCase() !== setName.toLowerCase()) return;
      for (const def of this.defs[i]!) for (let x: ZAnimInstance | null = def; x; x = x.next) this.stop(x);
      this.activeSets.delete(i);                                                  // D:L116179
    });
  }

  /**
   * Start an animation (`FUN_002734b0` D:L120717-120801): nothing unless its set is active (the set's byte +1,
   * D:L120734-120737; `activate`); then take the first instance of its chain that is not alive, or a
   * new copy where the flags allow (`FUN_00270ef0` D:L119142-119216; no animation on the disc allows one), else none --
   * so a call of a running animation starts nothing. Its activation guard (`Anim_Params` +0x12) must finish in one
   * 1.0-s step (`FUN_0026d870` D:L117101-117127), else the start is refused. The instance joins the scheduler after
   * every one of equal priority (`FUN_0034e6b0` D:L248827-248846) and first runs in the next walk that reaches it.
   * A supplied string is the parameterized start's type-8 input (`FUN_00272c30`); absent/null is a plain start,
   * which does not replace an existing input list. A refused live instance is never given the new input (research 363 §1).
   */
  start(target: string | ZAnimInstance, fromSet?: number, inputString?: string | null): ZAnimInstance | null {
    const def = typeof target === 'string' ? this.find(target, fromSet) : target;
    if (!def) return null;
    const hasInput = inputString !== undefined && inputString !== null;
    const active = this.activeSets.has(def.setIndex);
    if (!active && !hasInput) { this.trace({ kind: 'refused', frame: this.frame, anim: def.name }); return null; } // D:L120734-120737
    const inst = this.instanceOf(def);
    if (!inst) { this.trace({ kind: 'refused', frame: this.frame, anim: def.name }); return null; }
    // FUN_00272c30 D:L120405-120414, type 8 at D:L120544-120568: parameterized starts replace the input list before
    // FUN_002734b0's guard. A plain start has no replacement; an explicit empty string still is a string record.
    if (hasInput) inst.inputString = inputString;
    if (!active) { this.trace({ kind: 'refused', frame: this.frame, anim: def.name }); return null; }
    this.setInstanceState(inst, SEQ_STATE.START);                                 // D:L120741
    if (!this.guard(inst, inst.anim.params.seqOffsets[1] ?? 0)) {                 // D:L120743-120747
      this.end(inst);                                                             // FUN_0026ff20(lVar7, 5)
      this.trace({ kind: 'refused', frame: this.frame, anim: inst.name });
      return null;
    }
    const priority = inst.anim.params.priority;
    let at = this.list.findIndex((e) => priority < e.priority);
    if (at < 0) at = this.list.length;
    this.list.splice(at, 0, { inst, priority, killed: false });
    this.trace({ kind: 'start', frame: this.frame, anim: inst.name });
    return inst;
  }

  /** Stop an instance (`FUN_002707c0` D:L118829-118895): if alive, its scheduler entry is killed and it ends (`FUN_0026ff20(5)`). */
  stop(inst: ZAnimInstance): void {
    if (!inst.alive) return;
    const e = this.list.find((x) => x.inst === inst);   // FUN_0034e560 D:L248728-248742: the first match
    if (e) e.killed = true;
    this.end(inst);
    this.trace({ kind: 'stop', frame: this.frame, anim: inst.name });
  }

  /** `FUN_00270be0` (D:L119006-119084): an alive instance pauses. */
  pause(inst: ZAnimInstance): void { if (inst.alive) inst.paused = true; }
  /** `FUN_002709b0` (D:L118909-118979): unpaused. */
  resume(inst: ZAnimInstance): void { inst.paused = false; }

  /**
   * One frame (`FUN_0034e070` D:L248531-248567): the scheduler walked in order -- an instance started during the walk
   * joins its end and is reached in the same walk -- each instance ticked with the whole `dt`; a killed entry, or an
   * instance whose tick reports it finished, leaves the list.
   */
  tick(dt: number): void {
    let i = 0;
    while (i < this.list.length) {
      const e = this.list[i]!;
      const remove = e.killed || this.instanceTick(e.inst, dt);
      const k = this.list.indexOf(e);              // a start during the tick may have put an entry before it
      if (remove) { this.list.splice(k, 1); i = k; } else i = k + 1;
    }
    this.frame++;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // The player.

  private trace(e: ZAnimTraceEvent): void { this.traceFn?.(e); }

  private inInstance<T>(inst: ZAnimInstance, run: () => T): T {
    const previous = this.current;
    this.current = inst;
    try { return run(); } finally { this.current = previous; }
  }

  /** `FUN_00270ef0` (D:L119142-119216). */
  private instanceOf(def: ZAnimInstance): ZAnimInstance | null {
    if (def.disabled) return null;
    let x = def, count = 1;
    while (x.alive && x.next) { count++; x = x.next; }
    if (!x.alive) return x;
    const flags = def.anim.params.flags;
    if ((flags & 0x80) === 0) return null;                                        // D:L119201
    const max = (flags & 0x7ffff) >>> 13;                                         // D:L119202
    if (max !== 0 && count >= max) return null;
    x.next = new ZAnimInstance(def.anim, def.setIndex);
    return x.next;
  }

  /** `FUN_0026ff20` for 2 and 4 (D:L118592-118607): the state written, a start unpauses. */
  private setInstanceState(inst: ZAnimInstance, state: number): void {
    if (state === SEQ_STATE.START || state === SEQ_STATE.IDLE || state === SEQ_STATE.DONE) inst.paused = false;
    inst.state = state;
  }

  /**
   * An instance's end (`FUN_0026ff20(5)` D:L118525-118607): if it was alive, its cleanup sequence (`Anim_Params` +0x16)
   * runs once (`FUN_0026d870`, D:L118599); it is unpaused and done. Its name slots' sounds go to the host first
   * (`ZAnimHost.instanceStop`: `FUN_0026fd20`, D:L118572, before the cleanup at D:L118599, so a sound the cleanup plays
   * keeps playing; PF-32); its node resets (`FUN_0026fbf0`, `FUN_0026fa80`, D:L118573-118574) are not modelled
   * (research 106 §8).
   */
  private end(inst: ZAnimInstance): void {
    const wasAlive = inst.alive;
    inst.paused = false;
    if (wasAlive) this.host.instanceStop?.(inst.name);                           // FUN_0026fd20 (D:L118572)
    if (wasAlive) this.guard(inst, inst.anim.params.seqOffsets[3] ?? 0);         // FUN_0026d870 (D:L118599)
    inst.state = SEQ_STATE.DONE;
    if (wasAlive) this.trace({ kind: 'end', frame: this.frame, anim: inst.name });
  }

  /**
   * `FUN_0026d870` (D:L117101-117127): the sequence at `offset` set to start, stepped once with 1.0 s, then idle; true
   * when it finished (or `offset` is 0). The activation and execution guards (`IF cond FAIL ENDIF`) refuse with FAIL.
   */
  private guard(inst: ZAnimInstance, offset: number): boolean {
    if (!(offset > 0)) return true;
    const seq = inst.sequences.find((s) => s.offset === offset);
    if (!seq) return true;
    return this.inInstance(inst, () => {
      seq.state = SEQ_STATE.START;
      this.step(inst, seq, GUARD_DT);
      const running = seq.state === 2 || seq.state === 3 || seq.state === 4;
      seq.state = SEQ_STATE.IDLE;
      return !running;
    });
  }

  /** `FUN_0026ae20` (D:L115457-115509): the clock zeroed; activation-1 sequences start, the others idle (state 0 left). */
  private init(inst: ZAnimInstance): void {
    inst.state = SEQ_STATE.START;
    inst.paused = false;
    inst.elapsed = 0;
    for (const s of inst.sequences) {
      if (s.state === 0) continue;
      s.state = s.activation === 1 ? SEQ_STATE.START : SEQ_STATE.IDLE;
    }
    inst.state = SEQ_STATE.RUNNING;
  }

  /**
   * `FUN_00270220` (D:L118623-118662): unless paused -- the execution guard (+0x14) must pass; a just-started instance is
   * set up; its sequences are stepped in file order while it is neither done nor paused; its clock advances; when no
   * sequence is left running it ends. True: the scheduler drops it.
   */
  private instanceTick(inst: ZAnimInstance, dt: number): boolean {
    if (inst.paused) return false;
    return this.inInstance(inst, () => {
      let allDone = true;
      if (!this.guard(inst, inst.anim.params.seqOffsets[2] ?? 0)) return false;
      if (inst.state === SEQ_STATE.START) this.init(inst);
      for (const s of inst.sequences) {
        if (inst.state === SEQ_STATE.DONE || inst.paused) break;
        this.step(inst, s, dt);
        if (s.state === 2 || s.state === 3 || s.state === 4) allDone = false;
      }
      inst.elapsed += dt;
      if (allDone && !inst.paused) this.end(inst);
      return allDone;
    });
  }

  /**
   * `FUN_00269da0` (D:L114845-114910): a sequence's step. Start (2) zeroes the loop count, clock and IF depth; restart
   * (3) also the elapsed time and the pc; then commands run while the time lasts -- with none left only a timeless one
   * -- each advancing the pc when done; past the last the sequence is done.
   */
  private step(inst: ZAnimInstance, s: ZAnimSequenceState, frameDt: number): void {
    if (s.state === SEQ_STATE.DONE) return;
    if (s.state === SEQ_STATE.START) { s.loopTimer = 0; s.loopCount = 0; s.depth = 0; }
    if (s.state === SEQ_STATE.START || s.state === SEQ_STATE.RESTART) {
      s.elapsed = 0;
      s.state = SEQ_STATE.RUNNING;
      s.pc = SEQ_HEAD;
      s.phase = PHASE_BEGIN;
      if (s.pc + 0 >= s.img.size) { s.state = SEQ_STATE.DONE; return; }
    }
    if (s.state !== SEQ_STATE.RUNNING) return;
    const dt: Dt = { v: frameDt };
    for (;;) {
      if (dt.v <= 0 && !s.img.timeless(s.pc)) return;                            // D:L114886-114892
      if (inst.state === SEQ_STATE.DONE || inst.paused) return;                  // D:L114893-114895
      const before = dt.v;
      const done = this.run(inst, s, dt);                                        // D:L114896
      s.elapsed += before - dt.v;                                                // D:L114897-114898
      if (!done) return;
      s.pc += s.img.cmdSize(s.pc);                                               // D:L114900-114903
      s.phase = PHASE_BEGIN;
      if (!(s.pc < s.img.size)) { s.state = SEQ_STATE.DONE; return; }            // D:L114905-114906
    }
  }

  /** `FUN_0026a6e0` (D:L115182-115213): the command at the pc begun (when due), then ticked; its return is done / true. */
  run(inst: ZAnimInstance, s: ZAnimSequenceState, dt: Dt): boolean {
    const at = s.pc;
    const type = s.img.type(at);
    const fns = COMMANDS.get(type);
    if (!fns) throw new ZAnimUnsupportedError(`zAnim ${inst.name}/${s.name}: command set ${type >> 8} cmd ${type & 0xff} at +${at} is not implemented`);
    const c: Ctx = { inst, seq: s, at };
    let done = true;
    if (s.phase === PHASE_BEGIN) {
      s.cmdElapsed = 0;
      fns.begin?.(this, c);
      s.phase = PHASE_TICK;
    }
    if (s.phase === PHASE_TICK && fns.tick) {
      const before = dt.v;
      done = fns.tick(this, c, dt);
      if (s.state === SEQ_STATE.DONE) { this.traceCommand(c, type, false); return false; }
      s.cmdElapsed += before - dt.v;
    }
    this.traceCommand(c, type, done);
    return done;
  }

  private traceCommand(c: Ctx, type: number, done: boolean): void {
    if (this.traceFn) this.trace({ kind: 'command', frame: this.frame, anim: c.inst.name, sequence: c.seq.name, offset: c.at, set: type >> 8, cmd: type & 0xff, done });
  }

  /** `FUN_0026a8b0` (D:L115258-115261): the pc past the command at it; the begin due. */
  advance(s: ZAnimSequenceState): void { s.pc += s.img.cmdSize(s.pc); s.phase = PHASE_BEGIN; }

  /** `FUN_002681c0` (D:L113710-113721): the IF depth plus `delta`, unchanged (and an error flagged) outside 0..255. */
  depth(inst: ZAnimInstance, s: ZAnimSequenceState, delta: number): number {
    const d = s.depth + delta;
    if (d < 0 || d >= 0x100) inst.depthError = true;
    else s.depth = d;
    return s.depth;
  }

  /**
   * The condition evaluator `FUN_0025e960` (D:L108302-108424), from the pc at the condition's first token: strictly left
   * to right, no precedence -- each operand (a command run for its truth, or a parenthesised group, D:L108325-108327)
   * combines with the value so far through the operator before it: 3 OR, 2 AND (D:L108339-108351, D:L108398-108409),
   * 1 "not the operand" (unreachable: byte 1 is NOT), any other or none false (D:L108335-108337, D:L108394-108396). NOT
   * (byte 1) inverts the next operand. Every operand runs: nothing short-circuits. An operand that follows a value with
   * no operator ends the condition: the pc goes back to the last token and the value is returned (D:L108375-108379);
   * byte 5 `)` returns at once (D:L108366-108368).
   */
  evaluate(inst: ZAnimInstance, s: ZAnimSequenceState, dt: Dt): boolean {
    let saved = s.pc, not = false, have = false, op = 0, acc = false;
    for (;;) {
      const type = s.img.type(s.pc);
      let next = op;
      if (type === ID_EXPRESSION) {
        const e = s.img.i8(s.pc + 4);
        next = e;
        if (e === 4) {
          this.advance(s);
          let v = this.evaluate(inst, s, dt);
          if (not) { not = false; v = !v; }
          if (have) { acc = combine(op, acc, v); next = 0; } else { acc = v; next = op; }
          have = true;
        } else if (e === 5) return acc;
        else if (e === 1) { not = true; next = op; }
      } else if ((op & 0xff) === 0) {
        if (have) { s.pc = saved; return acc; }
        let v = this.run(inst, s, dt);
        if (not) { not = false; v = !v; }
        have = true; acc = v;
      } else {
        let v = this.run(inst, s, dt);
        if (not) { v = !v; not = false; }
        acc = combine(op, acc, v);
        have = true; next = 0;
      }
      saved = s.pc;
      this.advance(s);
      op = next;
    }
  }

  /** A node of this instance by its index (`FUN_0026f4e0` D:L118159-118180): 0 none, 0xF9 the owner, 0xFA the caller's argument (none modelled). */
  node(inst: ZAnimInstance, index: number): ZAnimNode | undefined {
    if (index === 0 || index === 0xfa) return undefined;
    if (index === 0xf9) return this.nodes.owner?.();
    const ref = inst.anim.nodeRefs[index];
    return ref ? this.nodes.node(ref.name) : undefined;
  }

  /** A name of the instance's table (`FUN_0026ed60`). */
  name(inst: ZAnimInstance, index: number): string { return inst.anim.names[index] ?? `#${index}`; }

  /**
   * A valve by name index (`FUN_0026eb30` D:L117792-117841): the instance's table first, else found or made at TEMP
   * (`FUN_00351ff0(name, 2)`, D:L117834) and kept.
   */
  valveByIndex(inst: ZAnimInstance, index: number): Valve {
    let v = inst.valveCache.get(index);
    if (!v) { v = this.valves.acquire(this.name(inst, index), VALVE_TYPE.TEMP); inst.valveCache.set(index, v); }
    return v;
  }

  /** The call slot (`FUN_0026e650` D:L117597-117647): the last whose name and channel match, else a new one resolved by name. */
  callSlot(inst: ZAnimInstance, nameIndex: number, channel: number): CallSlot | null {
    let hit: CallSlot | null = null;
    for (const sl of inst.slots) if (sl.name === nameIndex && sl.channel === channel) hit = sl;
    if (hit) return hit;
    const sl: CallSlot = { name: nameIndex, channel, def: this.find(this.name(inst, nameIndex), inst.setIndex), instance: null };
    inst.slots.push(sl);
    return sl.def ? sl : null;
  }

  /** The slot a STOP/PAUSE/RESUME names (`FUN_0026e4c0` D:L117548-117593): by channel first, then by name, the last match; else a new one. */
  slotByName(inst: ZAnimInstance, nameIndex: number): CallSlot | null {
    let hit: CallSlot | null = null;
    for (const sl of inst.slots) if (sl.channel === nameIndex) hit = sl;
    if (!hit) for (const sl of inst.slots) if (sl.name === nameIndex) hit = sl;
    if (hit) return hit;
    const sl: CallSlot = { name: nameIndex, channel: 0, def: this.find(this.name(inst, nameIndex), inst.setIndex), instance: null };
    inst.slots.push(sl);
    return sl.def ? sl : null;
  }

  /** `FUN_00269b00` (D:L114714-114760): the first sequence of that name not running starts. */
  callSequence(inst: ZAnimInstance, name: string): void {
    for (const s of inst.sequences) {
      if (s.name !== name) continue;
      if (s.state === 2 || s.state === 3 || s.state === 4) continue;
      s.state = SEQ_STATE.START;
      return;
    }
  }

  /** `FUN_00269930` (D:L114646-114696): the first running sequence of that name is done. */
  stopSequence(inst: ZAnimInstance, name: string): void {
    for (const s of inst.sequences) {
      if (s.name !== name) continue;
      if (s.state === 2 || s.state === 3 || s.state === 4) { s.state = SEQ_STATE.DONE; return; }
    }
  }

  /** The host, for the command table. */
  get hostOf(): ZAnimHost { return this.host; }
  rand(): number {
    if (!this.random) throw new ZAnimUnsupportedError('RANDOM_WEIGHT and a WAIT with flag 0x20 need a random source (FUN_00197740)');
    return this.random();
  }
}

/** The operator step `FUN_0025e960` shares (D:L108335-108355, D:L108394-108413). */
function combine(op: number, acc: boolean, v: boolean): boolean {
  if (op === 0) return false;
  const o = op & 0xff;
  if (o === 3) return acc || v;
  if (o === 2) return acc && v;
  if (o === 1) return !v;
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// The commands.

const MOTION_UNSUPPORTED = 0x4 | 0x10 | 0x800 | 0x1000;

const COMMANDS = new Map<number, CommandFns>([
  // QUAD_ALIGN (1): tick 0x2679e0, `return 1` (its disassembly).
  [id(0, ZCMD_RT.QUAD_ALIGN), { tick: () => true }],
  // IF (2): `FUN_0025e7a0` D:L108214-108282.
  [id(0, ZCMD_RT.IF), {
    tick(rt, c, dt) {
      const { inst, seq: s } = c;
      rt.depth(inst, s, 1);
      for (;;) {
        s.pc += 8; s.phase = PHASE_BEGIN;                                        // FUN_0026a890(ctx, 8)
        if (rt.evaluate(inst, s, dt)) return true;
        for (let stop = false; !stop;) {
          rt.advance(s);
          if (!(s.pc < s.img.size)) { stop = true; continue; }
          const t = s.img.type(s.pc);
          if ((t === ID_ELSE || t === ID_ELSEIF || t === ID_ENDIF) && s.img.u8(s.pc + 4) === rt.depth(inst, s, 0)) {
            stop = true;
            if (t === ID_ENDIF) rt.depth(inst, s, -1);
          }
        }
        if (s.img.type(s.pc) !== ID_ELSEIF) return true;
      }
    },
  }],
  // ELSEIF (3) and ELSE (4), reached from a branch that ran: `FUN_0025e6d0` D:L108171-108197, on to its ENDIF.
  ...[ZCMD_RT.ELSEIF, ZCMD_RT.ELSE].map((n): [number, CommandFns] => [id(0, n), {
    tick(rt, c) {
      const { inst, seq: s } = c;
      for (let stop = false; !stop;) {
        rt.advance(s);
        if (!(s.pc < s.img.size)) stop = true;
        else if (s.img.type(s.pc) === ID_ENDIF && s.img.u8(s.pc + 4) === rt.depth(inst, s, 0)) { stop = true; rt.depth(inst, s, -1); }
      }
      return true;
    },
  }]),
  // ENDIF (5): `FUN_0025e6a0` D:L108154-108155.
  [id(0, ZCMD_RT.ENDIF), { tick(rt, c) { rt.depth(c.inst, c.seq, -1); return true; } }],
  // NODE_ACTIVE (7), a condition token: `FUN_0025e230` D:L107965-107984 -- +6 the node; +4 1 "is active", 2 "is not",
  // read from the node's +0x5c bit 0 (NODE_ACTIVE_FLAG_READING: the flag OBJECT_ACTIVE_STATE writes); no node: false.
  [id(0, ZCMD_RT.NODE_ACTIVE), {
    tick(rt, c) {
      const n = rt.node(c.inst, c.seq.img.u16(c.at + 6)), k = c.seq.img.i16(c.at + 4);
      if (!n) return false;
      return (k === 1 && n.active) || (k === 2 && !n.active);
    },
  }],
  // RANDOM_WEIGHT (10), a condition token: `FUN_0025dcf0` D:L107783-107792 -- rand x 2^-31 <= the f32 at +4.
  [id(0, ZCMD_RT.RANDOM_WEIGHT), { tick: (rt, c) => unitRand(rt.rand()) <= c.seq.img.f32(c.at + 4) }],
  // FAIL (11): tick 0x25dce0, `return 0` (its disassembly): never done, false in a condition.
  [id(0, ZCMD_RT.FAIL), { tick: () => false }],
  // LOOP (14): `FUN_0025ede0` D:L108458-108472.
  [id(0, ZCMD_RT.LOOP), {
    tick(_rt, c, dt) {
      const { seq: s, at } = c, img = s.img;
      s.loopCount = (s.loopCount + 1) & 0xffff;
      s.loopTimer += dt.v + s.elapsed;
      const f = img.u32(at + 4);
      if ((f & 1) === 0) {
        if ((f & 2) !== 0 && img.f32(at + 8) >= 0 && img.f32(at + 8) <= s.loopTimer) return true;
      } else {
        const n = img.i32(at + 8);
        if (n !== -1 && n === ((s.loopCount << 16) >> 16)) return true;
      }
      s.state = SEQ_STATE.RESTART;                                               // FUN_0026a040(ctx, 3)
      return false;
    },
  }],
  // WAIT (15): begin `FUN_0025ed50` D:L108436-108448; tick `zAnimWaitTick` 0x25ec50-0x25ed4c (its disassembly).
  [id(0, ZCMD_RT.WAIT), {
    begin(rt, c) {
      const { seq: { img }, at } = c, f = img.u16(at + 4);
      if (f & 0x10) img.setU16(at + 6, 0);
      if (f & 0x20) {
        const k = 4 * ((f & 0x10) ? 2 : 1);
        img.setF32(at + 8, img.f32(at + 8 + k) + img.f32(at + 0xc + k) * unitRand(rt.rand()));
      }
    },
    tick(_rt, c, dt) {
      const { inst, seq: s, at } = c, img = s.img, f = img.u16(at + 4);
      let done = true;
      if (f & 8) {
        const base = (f & 4) ? inst.elapsed : (f & 2) ? s.elapsed : s.cmdElapsed;  // 0x25ec60-0x25ec98
        const time = img.f32(at + 8);
        if (dt.v + base <= time) { dt.v = 0; done = false; }                       // 0x25eca0-0x25ecb0, 0x25ecf0
        else { let used = time - base; if (used < 0) used = 0; dt.v -= used; }    // 0x25ecb8-0x25ece8
      }
      if (f & 0x10) {                                                             // 0x25ecf8-0x25ed44
        const count = (img.u16(at + 6) + 1) & 0xffff;
        img.setU16(at + 6, count);
        if (done && !(img.i32(at + ((f & 8) ? 0xc : 8)) < count)) done = false;
      }
      return done;
    },
  }],
  // OBJECT_ACTIVE_STATE (17): `FUN_00263aa0` D:L111360-111369: +6 the node, +4 == 1 on.
  [id(0, ZCMD_RT.OBJECT_ACTIVE_STATE), {
    tick(rt, c) {
      const n = rt.node(c.inst, c.seq.img.u16(c.at + 6));
      if (n) n.active = c.seq.img.i16(c.at + 4) === 1;
      return true;
    },
  }],
  // OBJECT_MOTION_FROM_TO (22): begin `FUN_0025fe70` D:L109092-109340, tick `FUN_0025f9b0` D:L108905-109030.
  [id(0, ZCMD_RT.OBJECT_MOTION_FROM_TO), { begin: motionBegin, tick: motionTick }],
  // OBJECT_OPACITY_FROM_TO (25): begin `FUN_0025f960` D:L108842-108845, tick `FUN_0025f880` D:L108814-108831.
  [id(0, ZCMD_RT.OBJECT_OPACITY_FROM_TO), {
    begin(rt, c) {
      const n = rt.node(c.inst, c.seq.img.u16(c.at + 4));
      if (n) n.opacity = c.seq.img.f32(c.at + 8);
    },
    tick(rt, c, dt) {
      const { seq: s, at } = c, img = s.img;
      const n = rt.node(c.inst, img.u16(at + 4));
      if (!n) return true;
      const d = dt.v, time = img.f32(at + 0x14);
      if (time < d + s.cmdElapsed) { dt.v -= time - s.cmdElapsed; n.opacity = img.f32(at + 0xc); return true; }
      dt.v = 0;
      n.opacity += img.f32(at + 0x10) * d;
      return false;
    },
  }],
  // SOUND (30): `FUN_002659c0` D:L112317-112510, always done; the play is the host's.
  [id(0, ZCMD_RT.SOUND), {
    tick(rt, c) {
      const img = c.seq.img;
      rt.hostOf.sound?.({ anim: c.inst.name, flags: img.u16(c.at + 4), sound: rt.name(c.inst, img.u16(c.at + 6)), nodeIndex: img.u8(c.at + 0x10), bytes: img.b.slice(c.at, c.at + img.cmdSize(c.at)) });
      return true;
    },
  }],
  // WHILE (39): `FUN_0025e630` D:L108138-108145: false -> the pc at +6 (its END_WHILE, research 106 §4), stepped past.
  [id(0, ZCMD_RT.WHILE), {
    tick(rt, c, dt) {
      const { inst, seq: s, at } = c;
      if ((s.img.u8(at + 4) & 1) === 0) {
        s.pc += 8; s.phase = PHASE_BEGIN;
        if (!rt.evaluate(inst, s, dt)) { s.pc = s.img.u16(at + 6); s.phase = PHASE_BEGIN; }
      }
      return true;
    },
  }],
  // END_WHILE (40): `FUN_0025e600` D:L108126-108127: the pc at +6 (its WHILE), and not done -- the frame ends there.
  [id(0, ZCMD_RT.END_WHILE), {
    tick(_rt, c) { c.seq.pc = c.seq.img.u16(c.at + 6); c.seq.phase = PHASE_BEGIN; return false; },
  }],
  // EXPRESSION (43): registered with no tick (D:L106907): a statement is done.
  [id(0, ZCMD_RT.EXPRESSION), {}],
  // BREAK (44): `FUN_0025e520` D:L108085-108117: on to the next END_WHILE (any), closing the IFs it passes.
  [id(0, ZCMD_RT.BREAK), {
    tick(rt, c) {
      const { inst, seq: s } = c;
      for (;;) {
        rt.advance(s);
        if (s.pc < s.img.size && s.img.type(s.pc) === ID_ENDIF && s.img.u8(s.pc + 4) === rt.depth(inst, s, 0)) rt.depth(inst, s, -1);
        if (!(s.pc < s.img.size)) break;
        if (s.img.type(s.pc) === ID_END_WHILE) return true;
      }
      return true;
    },
  }],
  // CALL_ANIMATION (45): begin `FUN_0025d5c0` D:L107571-107779, tick `FUN_0025d550` D:L107473-107481.
  [id(0, ZCMD_RT.CALL_ANIMATION), {
    begin(rt, c) {
      const img = c.seq.img, f = img.u16(c.at + 4);
      if ((f & ~(0x1 | 0x200)) || img.u16(c.at + 0x10)) throw new ZAnimUnsupportedError(`CALL_ANIMATION flags 0x${f.toString(16)} / +0x10 ${img.u16(c.at + 0x10)}: argument passing (flags 0x2..0x100, the +0x10 block) is not modelled`);
      const slot = rt.callSlot(c.inst, img.u8(c.at + 7), img.u8(c.at + 6));
      if (!slot || !slot.def) return;
      // Flag 1 copies the caller's inputs (D:L107577-107592), installed by FUN_00272c30 before the callee's guard.
      // This runtime models the binding's string record; other argument-producing flags remain refused above.
      slot.instance = rt.start(slot.def, undefined, (f & 1) !== 0 ? c.inst.inputString : null); // D:L107763-107770
    },
    tick(rt, c) {
      const img = c.seq.img, f = img.u16(c.at + 4);
      if ((f & 0x200) === 0) return true;
      const slot = rt.callSlot(c.inst, img.u8(c.at + 7), img.u8(c.at + 6));
      return !(slot && slot.instance && slot.instance.alive);
    },
  }],
  // STOP_ANIMATION (46): `FUN_0025d490` D:L107444-107461.
  [id(0, ZCMD_RT.STOP_ANIMATION), {
    tick(rt, c) {
      const slot = rt.slotByName(c.inst, c.seq.img.u8(c.at + 4));
      if (!slot) return true;
      if (!slot.instance) { if (slot.def && slot.def.alive) rt.stop(slot.def); }
      else { if (slot.instance.alive) rt.stop(slot.instance); slot.instance = null; }
      return true;
    },
  }],
  // PAUSE_ANIMATION (47): `FUN_0025d3d0` D:L107411-107431 (+4 0: this instance).
  [id(0, ZCMD_RT.PAUSE_ANIMATION), {
    tick(rt, c) {
      const n = c.seq.img.u8(c.at + 4);
      if (n === 0) { rt.pause(c.inst); return true; }
      const slot = rt.slotByName(c.inst, n);
      if (!slot) return true;
      if (!slot.instance) { if (slot.def && slot.def.alive) rt.pause(slot.def); }
      else if (slot.instance.alive) rt.pause(slot.instance);
      return true;
    },
  }],
  // RESUME_ANIMATION (48): `FUN_0025d330` D:L107384-107399.
  [id(0, ZCMD_RT.RESUME_ANIMATION), {
    tick(rt, c) {
      const slot = rt.slotByName(c.inst, c.seq.img.u8(c.at + 4));
      if (!slot) return true;
      if (!slot.instance) { if (slot.def && slot.def.alive) rt.resume(slot.def); }
      else if (slot.instance.alive) rt.resume(slot.instance);
      return true;
    },
  }],
  // CALL_SEQUENCE (50): `FUN_0025d270` D:L107349-107351.
  [id(0, ZCMD_RT.CALL_SEQUENCE), { tick(rt, c) { rt.callSequence(c.inst, rt.name(c.inst, c.seq.img.u8(c.at + 4))); return true; } }],
  // STOP_SEQUENCE (51): `FUN_0025d230` D:L107336-107338.
  [id(0, ZCMD_RT.STOP_SEQUENCE), { tick(rt, c) { rt.stopSequence(c.inst, rt.name(c.inst, c.seq.img.u8(c.at + 4))); return true; } }],
  // DEBUG (52): tick 0x25cc70, `return 1` (its disassembly).
  [id(0, ZCMD_RT.DEBUG), { tick: () => true }],
  // VALVE (61): `FUN_00353fd0` D:L252142-252340 through `ValveStore.apply` (research 104).
  [id(0, ZCMD_RT.VALVE), { tick: (rt, c) => valveTick(rt, c) }],
  // ui::UI_COMMAND (1:1): `FUN_002745a0` D:L121344-121431, the host's.
  [id(UI_SET_RT, UI_COMMAND), {
    tick(rt, c, dt) {
      const img = c.seq.img, at = c.at, nodeIndex = img.u16(at + 4), code = img.u8(at + 6);
      const ref = nodeIndex !== 0 ? c.inst.anim.nodeRefs[nodeIndex] : undefined;
      return rt.hostOf.uiCommand({
        anim: c.inst.name, sequence: c.seq.name, nodeIndex, node: nodeIndex === 0 ? null : ref ? ref.name : `#${nodeIndex}`,
        opcodeByte: code, fn: c.inst.anim.names[code] ?? null, arg: rt.name(c.inst, img.u16(at + 8)),
        loc: img.i16(at + 0xc), bytes: img.b.slice(at, at + img.cmdSize(at)),
      }, dt);                                                                     // param_2 (D:L121414)
    },
  }],
  // ui::UI_APP_COMMAND (1:2): tick 0x274590, `return 1` (its disassembly).
  [id(UI_SET_RT, UI_APP_COMMAND), { tick: () => true }],
]);

/** `FUN_00353fd0`'s reference and operand resolution (D:L252142-252179), then `ValveStore.apply`. */
function valveTick(rt: ZAnimRuntime, c: Ctx): boolean {
  const img = c.seq.img, at = c.at, flags = img.u8(at + 13);
  let valve: Valve | null = null;
  if (flags & 1) valve = null;                                    // the context's input valve: no context arguments here
  else if (flags & 2) valve = rt.valveByIndex(c.inst, img.u32(at + 4));
  if (!valve) return false;                                       // D:L252156-252157
  let operand: number | { valve: Valve } = img.u32(at + 8);
  if (flags & 0x10) {
    if (flags & 4) operand = 0;                                   // the context's: none
    else if (flags & 8) operand = { valve: rt.valveByIndex(c.inst, img.i32(at + 8)) };
    else operand = 0;
  }
  return rt.valves.apply({ valve, op: img.u8(at + 12), operand });
}

/** The motion's position block P (+0xc) and scale block S (+0x30), as offsets into the image (0: none). */
function blocks(img: Img, at: number): { P: number; S: number } {
  const p = img.u16(at + 0xc), s = img.u16(at + 0x30);
  return { P: p ? at + p : 0, S: s ? at + s : 0 };
}

/** `FUN_0025fe70` (D:L109092-109340). */
function motionBegin(rt: ZAnimRuntime, c: Ctx): void {
  const img = c.seq.img, at = c.at, f = img.u16(at + 4);
  if (f & MOTION_UNSUPPORTED) throw new ZAnimUnsupportedError(`OBJECT_MOTION_FROM_TO flags 0x${f.toString(16)}: arguments (0x4, 0x10) and curves (0x800, 0x1000) are not modelled`);
  const node = rt.node(c.inst, img.u8(at + 6));
  if (!node) return;
  const { P, S } = blocks(img, at);
  const p0 = P ? img.u8(P) : 0;
  if (p0 & 3) throw new ZAnimUnsupportedError(`OBJECT_MOTION_FROM_TO position block flags 0x${p0.toString(16)}: node world positions are not modelled`);
  if ((f & 0x418) !== 0) {                                                       // D:L109104-109105
    let set = false;
    if (!(f & 2) && P) { img.setVec(P + 4, node.position); set = true; }          // D:L109109-109115: "from" = where it is
    if (P) node.position = img.vec(P + 4);                                        // D:L109141-109143: placed at "from"
    if (f & 0x400) {                                                              // D:L109146-109183: "to" from three valves
      if (P) for (let i = 0; i < 3; i++) {
        const v = rt.valves.find(rt.name(c.inst, img.u8(at + 9 + i)));
        img.setF32(P + 0x10 + 4 * i, v ? v.value : 0);
      }
      set = true;
    }
    const target = (): V3 => ((f & 1) ? add(img.vec(P + 4), img.vec(P + 0x10)) : img.vec(P + 0x10));
    if (P && (p0 & 4)) img.setF32(at + 0x34, Math.hypot(...sub(target(), img.vec(P + 4))) / img.f32(P + 0x28));   // D:L109209-109229
    if ((!(f & 2) || (p0 & 4) || set) && P) img.setVec(P + 0x1c, scale(1 / img.f32(at + 0x34), sub(target(), img.vec(P + 4))));   // D:L109231-109256
  }
  if (f & 0x40) {                                                                 // D:L109291-109308
    if (!(f & 1) && (f & 0x20)) node.rotation = img.quat(at + 0x10);
    else img.setQuat(at + 0x10, node.rotation);
    if (f & 0x80) { const o = rt.node(c.inst, img.u8(at + 8)); if (o) img.setQuat(at + 0x20, o.rotation); }
  }
  if ((f & 0x200) && S) {                                                         // D:L109310-109339
    if (!(f & 0x100)) img.setVec(S, node.scale); else node.scale = img.vec(S);
    if (!(f & 0x100)) {
      const to = (f & 1) ? mul(img.vec(S), img.vec(S + 12)) : img.vec(S + 12);
      img.setVec(S + 0x18, scale(1 / img.f32(at + 0x34), sub(to, img.vec(S))));
    }
  }
}

/** `FUN_0025f9b0` (D:L108905-109030). */
function motionTick(rt: ZAnimRuntime, c: Ctx, dt: Dt): boolean {
  const { seq: s, at } = c, img = s.img, f = img.u16(at + 4);
  const node = rt.node(c.inst, img.u8(at + 6));
  if (!node) return true;
  const time = img.f32(at + 0x34);
  const done = time < dt.v + s.cmdElapsed;
  let used = dt.v;
  if (done) { used = time - s.cmdElapsed; dt.v -= used; } else dt.v = 0;
  const t = used + s.cmdElapsed;
  const { P, S } = blocks(img, at);
  const p0 = P ? img.u8(P) : 0;
  if (done) {
    if ((f & 0x200) && S) node.scale = (f & 1) ? mul(img.vec(S), img.vec(S + 12)) : img.vec(S + 12);     // D:L108925-108939
    if (f & 0x40) node.rotation = (f & 1) ? quatProduct(img.quat(at + 0x20), img.quat(at + 0x10)) : img.quat(at + 0x20);   // D:L108940-108956
    if ((((f & 0x418) !== 0) || (p0 & 2)) && !(f & 0x2000) && P) node.position = (f & 1) ? add(img.vec(P + 4), img.vec(P + 0x10)) : img.vec(P + 0x10);   // D:L108957-108978
  } else {
    if ((f & 0x18) || (p0 & 2)) { if (P) node.position = add(node.position, scale(used, img.vec(P + 0x1c))); }   // D:L108981-108999
    if (f & 0x40) {                                                               // D:L109001-109018
      const to = (f & 1) ? quatProduct(img.quat(at + 0x20), img.quat(at + 0x10)) : img.quat(at + 0x20);
      node.rotation = zanimSlerp(t / time, img.quat(at + 0x10), to);
    }
    if ((f & 0x200) && S) node.scale = add(node.scale, scale(used, img.vec(S + 0x18)));   // D:L109019-109027
  }
  return done;
}

// ---------------------------------------------------------------------------------------------------------------------
// The inventory: what a set asks of the runtime.

/** The commands an IF, ELSEIF or WHILE carries from +8 to its end: its condition's tokens, each a command of its own. */
export function conditionTokens(c: ZAnimRtCommand): ZAnimRtCommand[] {
  if (c.set !== 0 || (c.cmd !== ZCMD_RT.IF && c.cmd !== ZCMD_RT.ELSEIF && c.cmd !== ZCMD_RT.WHILE)) return [];
  const img = new Img(c.bytes), out: ZAnimRtCommand[] = [];
  for (let o = 8; o + 4 <= c.bytes.length;) {
    const size = img.cmdSize(o), h = img.u32(o);
    if (size < 4 || o + size > c.bytes.length) break;
    out.push({ offset: c.offset + o, set: (h >>> 8) & 0xff, cmd: h & 0xff, timeless: img.timeless(o), size, bytes: c.bytes.subarray(o, o + size) });
    o += size;
  }
  return out;
}

/**
 * Why `activate` would refuse an animation, or null: activation bits (flags & 7) 3, started through `FUN_002740e0`
 * (`FUN_002713f0` D:L119332-119333), or flags bit 11, which `FUN_0026c600` sends to `FUN_00271250` / `FUN_00271390`
 * (D:L116360-116366), or flags bit 12 (byte +5 bit 4), with which `FUN_0026f210` (D:L118066-118098, reached at every
 * activation through `FUN_00271650`) allocates and names the instance's own node. None is modelled.
 */
export function activationUnsupported(a: ZAnimRtAnimation): string | null {
  const f = a.params.flags;
  if ((f & 7) === 3) return 'activation bits 3 (FUN_002740e0) are not modelled';
  if (f & 0x800) return 'flags bit 11 (FUN_00271250 / FUN_00271390) is not modelled';
  if (f & 0x1000) return 'flags bit 12 (the instance\'s own node, FUN_0026f210 D:L118066-118098) is not modelled';
  return null;
}

/** Whether the runtime implements a command id (set, cmd). */
export function zanimImplements(set: number, cmd: number): boolean { return COMMANDS.has(id(set, cmd)); }

/**
 * Everything of a set the runtime would refuse: an animation whose activation it does not model (`activationUnsupported`;
 * `sequence` '', `set` and `cmd` -1), a command id it lacks, or a flag of a command it does not model.
 */
export function zanimUnsupported(set: ZAnimRtSet): { anim: string; sequence: string; set: number; cmd: number; why: string }[] {
  const out: { anim: string; sequence: string; set: number; cmd: number; why: string }[] = [];
  for (const a of set.anims) {
    const why = activationUnsupported(a);
    if (why) out.push({ anim: a.name, sequence: '', set: -1, cmd: -1, why });
  }
  for (const a of set.anims) for (const q of a.sequences) for (const c of [...q.commands, ...q.commands.flatMap(conditionTokens)]) {
    const push = (why: string): void => { out.push({ anim: a.name, sequence: q.name, set: c.set, cmd: c.cmd, why }); };
    if (!zanimImplements(c.set, c.cmd)) { push('command not implemented'); continue; }
    if (c.set !== 0) continue;
    const img = new Img(c.bytes);
    if (c.cmd === ZCMD_RT.OBJECT_MOTION_FROM_TO) {
      const f = img.u16(4), p = img.u16(0xc);
      if (f & MOTION_UNSUPPORTED) push(`motion flags 0x${f.toString(16)}`);
      if (p && (img.u8(p) & 3)) push(`motion position block 0x${img.u8(p).toString(16)}`);
    } else if (c.cmd === ZCMD_RT.CALL_ANIMATION && ((img.u16(4) & ~(0x1 | 0x200)) || img.u16(0x10))) push(`call flags 0x${img.u16(4).toString(16)}, +0x10 ${img.u16(0x10)}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The dialog's nodes.

/** A node tree over a dialog's design (PLAT-05): one node per name `dialogNodeNames` gives, in that order. */
export class DialogNodeTree implements ZAnimNodeTree {
  readonly nodes = new Map<string, ZAnimNode>();
  constructor(design: DialogDesign, private readonly ownerNode?: ZAnimNode) {
    const records = new Map<string, DialogRecord | DialogSubordinate>();
    for (const r of [...design.controls, ...design.objects]) {
      if (!records.has(r.name)) records.set(r.name, r);
      const w = r.widget;
      if (w.type === 'RADIOSTRIP') for (const sub of w.subordinates) if (!records.has(sub.name)) records.set(sub.name, sub);
      if (w.type === 'HANDLERBUTTON' && w.subordinate && !records.has(w.subordinate.name)) records.set(w.subordinate.name, w.subordinate);
    }
    for (const name of dialogNodeNames(design)) {
      if (this.nodes.has(name)) continue;                                       // NODE_NAME_MATCH_READING: by exact name
      const r = records.get(name);
      // DIALOG_NODE_STATE_READING.
      this.nodes.set(name, { position: [r?.x ?? 0, r?.y ?? 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], opacity: r?.opacity ?? 1, active: true });
    }
  }
  /** NODE_NAME_MATCH_READING: the node spelled exactly; none else. */
  node(name: string): ZAnimNode | undefined { return this.nodes.get(name); }
  owner(): ZAnimNode | undefined { return this.ownerNode; }
}

/** `new DialogNodeTree(design)`. */
export function dialogNodeTree(design: DialogDesign, owner?: ZAnimNode): DialogNodeTree { return new DialogNodeTree(design, owner); }
