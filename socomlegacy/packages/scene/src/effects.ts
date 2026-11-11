import { rdrGet, type RdrNode } from '@s2u/archive';
import { rdrReal } from './tuning';
import type { DecalEntry } from './weapons';
import type { ZAnimAnimation, ZAnimCommand } from './zanim';
import { decodeObjectMotion, type ObjectMotion } from './effectMotion';
import { decodeParticleSource, type ParticleSource } from './effectParticles';

/**
 * The zAnim effect commands, decoded (socomlegacy/docs/research/89). A zAnim animation of `CZANIM.ZAR` (the `common` set) is
 * sequences of commands (77 §9); this file turns a command's bytes into what it does, for the ones the game's gunplay
 * runs -- the muzzle effects (`FireAnimName`: `muzzle_m4SD` calls `shell_eject` and `shell_smoke_med`), the shell's
 * flight, the smoke, the flash -- and the control flow around them.
 *
 * **The numbering is the registration order.** `FUN_0025bc20` (decomp 106863-106924) registers the base set's commands
 * with `FUN_0026a8e0(0x414bb0, name, parser, begin, tick, end)` one after another, and a command's number in the data
 * is its place in that list, from 1: `QUAD_ALIGN` 1, `IF` 2 ... `OBJECT_MOTION` 21, `PARTICLE_SOURCE` 27, `SOUND` 30
 * (the play-sound command research 81 §6 read as 30), `LIGHT` 32, `CALL_ANIMATION` 45. SOCOM 1's numbers in reCOM's
 * `zanim.h` are not these. Commands other modules register later follow from 61 (`VALVE`, a valve id, an operator
 * and a value, by its use).
 */

/** The base set's command names by number (`FUN_0025bc20`'s order, strings at 0x3eccc0-0x3ed0d0). */
export const ZANIM_COMMAND_NAMES: readonly string[] = [
  '', 'QUAD_ALIGN', 'IF', 'ELSEIF', 'ELSE', 'ENDIF', 'OBJECT_MAKE_WORLDCHILD', 'NODE_ACTIVE', 'NODE_RENDERED',
  'RANGE_TEST', 'RANDOM_WEIGHT', 'FAIL', 'ANIM_HEALTH', 'ANIM_LOD', 'LOOP', 'WAIT', 'OBJECT_BLENDMODE',
  'OBJECT_ACTIVE_STATE', 'OBJECT_TRANSLATE_STATE', 'OBJECT_ROTATE_STATE', 'OBJECT_AIM', 'OBJECT_MOTION',
  'OBJECT_MOTION_FROM_TO', 'WHEEL_MOTION', 'SCROLL_MOTION', 'OBJECT_OPACITY_FROM_TO', 'OBJECT_MOTION_SI_SCRIPT',
  'PARTICLE_SOURCE', 'CAMERA', 'DESTRUCTION_SOURCE', 'SOUND', 'UPDATE_SHADOW_MAP_LIGHTING', 'LIGHT', 'BLUR3D',
  'IRIS_EFFECT', 'SCALE_COLOR', 'TRUE_COLOR_SCALE', 'RIPPLE', 'RIPPLE_NODE_GROUP', 'WHILE', 'END_WHILE',
  'FOR_CHILDREN', 'END_FOR_CHILDREN', 'EXPRESSION', 'BREAK', 'CALL_ANIMATION', 'STOP_ANIMATION', 'PAUSE_ANIMATION',
  'RESUME_ANIMATION', 'INVALIDATE_ANIMATION', 'CALL_SEQUENCE', 'STOP_SEQUENCE', 'DEBUG', 'OBJECT_ADD_CHILD',
  'OBJECT_DELETE_CHILD', 'MESSAGE', 'TIMER', 'FIRE_WEAPON', 'REMOVE_SATCHELS', 'ui::UI_COMMAND', 'ui::UI_APP_COMMAND',
  'VALVE',
];

/** The numbers the effects use (see `ZANIM_COMMAND_NAMES`). */
export const ZCMD = {
  QUAD_ALIGN: 1, IF: 2, ELSEIF: 3, ELSE: 4, ENDIF: 5, RANGE_TEST: 9, RANDOM_WEIGHT: 10, FAIL: 11, LOOP: 14, WAIT: 15,
  OBJECT_ACTIVE_STATE: 17, OBJECT_TRANSLATE_STATE: 18, OBJECT_ROTATE_STATE: 19, OBJECT_MOTION: 21,
  OBJECT_MOTION_FROM_TO: 22, SCROLL_MOTION: 24, OBJECT_OPACITY_FROM_TO: 25, PARTICLE_SOURCE: 27, SOUND: 30, LIGHT: 32, EXPRESSION: 43, CALL_ANIMATION: 45,
  STOP_SEQUENCE: 51, VALVE: 61, WHILE: 39, END_WHILE: 40, CALL_SEQUENCE: 50, STOP_ANIMATION: 46, PAUSE_ANIMATION: 47,
  INVALIDATE_ANIMATION: 49,
  MESSAGE: 55, DESTRUCTION_SOURCE: 29, FIRE_WEAPON: 57, OBJECT_MAKE_WORLDCHILD: 6, FOR_CHILDREN: 41, END_FOR_CHILDREN: 42,
  /**
   * `EXECUTE_ACTION` (MAP-06; research 174 s3, 209 s13): registered by the action module after `VALVE`, numbered on in
   * the base set -- read off the disc, set 0 command 87, 8 bytes (Desert Glory's `access1`: `57 00 20 00 03 00 00 00`);
   * past `ZANIM_COMMAND_NAMES`' end, whose list stops at 61.
   */
  EXECUTE_ACTION: 87,
} as const;

/**
 * The `ai` namespace's command names by number (set 2; research 214 section 8, research 92 section 2): `FUN_0026a8e0`
 * splits a registered name at `::` (D:L115284-115295), so a command's high byte is its namespace -- 0 the base set, 1
 * `ui`, 2 `ai` -- and its low byte its place in that namespace's registrations, from 1 after its `Reserved` 0
 * (`FUN_0026ac20`, D:L115421). The `ai` set is `FUN_005de320`'s (D:L493405-493471; the strings at 0x660178-0x660380).
 */
export const AI_COMMAND_NAMES: readonly string[] = [
  'Reserved', 'ai::COMM', 'ai::CREATE', 'ai::DEBUG', 'ai::DRAIN', 'ai::EVENT', 'ai::FIREMODE', 'ai::FIREWEAPON', 'ai::GOTO',
  'ai::GROUP', 'ai::HOLD', 'ai::INSTATE', 'ai::INVIEW', 'ai::LOOKAT', 'ai::MACRO', 'ai::MAP', 'ai::MOVE', 'ai::PAINT',
  'ai::PARAM', 'ai::PURSUE', 'ai::ANIMATE', 'ai::INRANGE', 'ai::INREGION', 'ai::SELECT', 'ai::SETMODE', 'ai::SETANIMSET',
  'ai::SIGNAL', 'ai::SOUND', 'ai::STANCE', 'ai::STATE', 'ai::STOPALL', 'ai::TEAM', 'ai::TURRET', 'ai::VALVE', 'ai::WAIT',
];

/** The `ai` commands the decoders and the runners name (`AI_COMMAND_NAMES`). */
export const AI_CMD = { EVENT: 5, MOVE: 16, ANIMATE: 20, SETANIMSET: 25 } as const;

export type Vec3 = [number, number, number];
/** A quaternion as the engine stores one: x, y, z, then w. */
export type Quat4 = [number, number, number, number];

/** A little-endian view over one command's bytes; reads past the end answer 0. */
export class CmdBytes {
  private readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get length(): number { return this.bytes.length; }
  private has(o: number, n: number): boolean { return o >= 0 && o + n <= this.bytes.length; }
  u8(o: number): number { return this.has(o, 1) ? this.bytes[o]! : 0; }
  i8(o: number): number { return this.has(o, 1) ? this.view.getInt8(o) : 0; }
  u16(o: number): number { return this.has(o, 2) ? this.view.getUint16(o, true) : 0; }
  i16(o: number): number { return this.has(o, 2) ? this.view.getInt16(o, true) : 0; }
  u32(o: number): number { return this.has(o, 4) ? this.view.getUint32(o, true) : 0; }
  i32(o: number): number { return this.has(o, 4) ? this.view.getInt32(o, true) : 0; }
  f32(o: number): number { return this.has(o, 4) ? this.view.getFloat32(o, true) : 0; }
  vec3(o: number): Vec3 { return [this.f32(o), this.f32(o + 4), this.f32(o + 8)]; }
  quat(o: number): Quat4 { return [this.f32(o), this.f32(o + 4), this.f32(o + 8), this.f32(o + 12)]; }
}

/**
 * `LIGHT` (32; tick `FUN_00264cb0`, decomp 111906-112214; research 89 §10): a dynamic light the engine draws as a second
 * pass of every lit visual it reaches -- `light_map.tif` projected on the surface, its colour times the falloff.
 */
export interface ZAnimLight {
  flags: number;
  /** +8 with flag 0x2: the node it sits at (`NODE_CALLER`: the muzzle's weapon), or null. */
  node: number | null;
  /** Flag 0x8: at the context's position (an explosion's point). */
  atContext: boolean;
  /** +0x14 with flag 0x4, added. */
  offset: Vec3;
  /** 0..255 (+0x20, flag 0x40). */
  rgb: Vec3;
  /** The pass's vertex alpha, 128 = 1 (+0x2c, flag 0x80; the default 64, `FUN_00315110`). */
  opacity: number;
  /** The GS ALPHA selector (+9 with flag 0x100, else 0x44): 0x44 source alpha, 0x48 additive. */
  blend: number;
  /** The ranges `(t, min, max)` (s16 count +0x34, offset +0x36, flag 0x20), linear, the last held; or the static pair (flag 0x10). */
  ranges: [number, number, number][];
  /** Seconds (+0x3c): the command's length. */
  duration: number;
}

export function decodeLight(c: CmdBytes): ZAnimLight {
  const flags = c.u16(4);
  const ranges: [number, number, number][] = [];
  if (flags & 0x20) {
    const n = c.i16(0x34), o = c.i16(0x36);
    for (let i = 0; i < n && o > 0; i++) ranges.push([c.f32(o + 12 * i), c.f32(o + 12 * i + 4), c.f32(o + 12 * i + 8)]);
  } else if (flags & 0x10) ranges.push([0, c.f32(0x0c), c.f32(0x10)]);
  return {
    flags, node: flags & 0x2 ? c.i8(8) : null, atContext: (flags & 0x8) !== 0,
    offset: flags & 0x4 ? c.vec3(0x14) : [0, 0, 0],
    rgb: flags & 0x40 ? c.vec3(0x20) : [255, 255, 255],
    opacity: flags & 0x80 ? c.f32(0x2c) : 64,
    blend: flags & 0x100 ? c.u8(9) : 0x44,
    ranges, duration: c.f32(0x3c),
  };
}

/** A light's `(min, max)` range at `t` seconds: the keys linear, the last held (decomp 112110-112181). */
export function lightRange(light: Pick<ZAnimLight, 'ranges'>, t: number): [number, number] {
  const k = light.ranges;
  if (k.length === 0) return [0, 0];
  if (t <= k[0]![0]) return [k[0]![1], k[0]![2]];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i]![0]) {
      const a = k[i - 1]!, b = k[i]!, span = b[0] - a[0], f = span > 0 ? (t - a[0]) / span : 1;
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  const last = k[k.length - 1]!;
  return [last[1], last[2]];
}

/**
 * The light pass at one point (the VU1 handler at 0x23d8, research 89 §10): `L` the light minus the point, `n` the
 * surface normal; `h = max(L.n, 0)`, the falloff `f = 0.5 clamp((max - h) / (max - min))`, the gate `min(h, 1)`. The
 * pass's colour is `rgb f` and its alpha `opacity f gate`, over the spot's texel at `0.5 + (L.t, L.b) / max`.
 */
export function lightAt(L: Vec3, n: Vec3, range: [number, number]): { f: number; gate: number } {
  const h = Math.max(L[0] * n[0] + L[1] * n[1] + L[2] * n[2], 0);
  const [min, max] = range;
  const f = max > min ? 0.5 * Math.min(1, Math.max(0, (max - h) / (max - min))) : 0;
  return { f, gate: Math.min(h, 1) };
}

/** A sub-command of an `IF`/`ELSEIF`'s condition list, as far as the effects need one. */
export type EffectCondition =
  /** `RANDOM_WEIGHT` (tick `FUN_0025dcf0`, decomp 107783): true when `rand() / 2^31 <= p`, the f32 at +4. */
  | { kind: 'random'; p: number }
  /**
   * `RANGE_TEST` (tick `FUN_0025de90`, decomp 107820): the squared distance between two points -- a node's (+8 with flag
   * 1, +9 with flag 8), an offset, the camera's -- against the f32 at +0x24 (`rangeSquared`); flags 0x40-0x800 pick
   * the comparison.
   */
  | { kind: 'range'; flags: number; node: number; other: number; rangeSquared: number }
  /**
   * `VALVE` (61) as a test: the valve against the operand (`operation` 1 !=, 2 ==, 3 >, 4 <, 5 >=, 6 <=); `context`, the
   * animation's own valve (flag bit 0: a door's, research 92) rather than the one named.
   */
  | { kind: 'valve'; valve: string; operation: number; operand: number; context?: true }
  /**
   * `EXPRESSION` (43) inside a condition list: an operator, the byte at +4 -- 1 NOT, 2 AND, 3 OR, 4 `(`, 5 `)` (research
   * 95 s1.4, 179 s9.9; `FUN_0025e960` D:L108288-108425 evaluates the list, `viewer/src/roundCues.ts` `evaluateCondition`).
   */
  | { kind: 'operator'; operator: number }
  /**
   * Any other sub-command: its command and its set (the header's second byte, `zanim.ts`) -- the set 0 commands past
   * the base set's registrations (66 `CAMERA_INDOORS`, 70, 72 `PLAYER_INDOORS`: `@s2u/sound` `catalog.ts`, research 81)
   * and set 1's and set 2's. The viewer's effect runner answers set 0's 66 and 72 (`effectRunner.ts`
   * `indoorsOperand`); the rest are its unread operands (`ZANIM_UNREAD_OPERAND_PLACEHOLDER`).
   */
  | { kind: 'other'; cmd: number; set: number };

/** The node numbers the engine resolves itself (`FUN_0026f4e0`, decomp 118145): the animation's instance, the caller's node. */
export const NODE_ROOT = -7, NODE_CALLER = -6;

/** One decoded command of an effect animation. Node indices are into the animation's `nodeRefs`, or `NODE_ROOT` / `NODE_CALLER`. */
export type EffectOp =
  | { op: 'if' | 'elseif'; conditions: EffectCondition[] }
  | { op: 'else' | 'endif' }
  /**
   * `WAIT` (15; begin `FUN_0025ed50` D:L108436-108447): `frames` when flag 0x10 (the i32 at +8), else `seconds` (the f32
   * at +8). Flag 0x20 is the random form: the begin writes base + range x U[0,1) over +8, the base the f32 at +12 and the
   * range at +16 -- a word on, +16 / +20, with 0x10 -- so `seconds` is that base and `range` that range (the disc's +8
   * repeats the base: MP71's `seagull_squak` +8 4, +12 4, +16 9, a 4-13 s wait).
   */
  | { op: 'wait'; seconds: number; range: number; frames: number | null }
  /** `LOOP` (14; tick `FUN_0025ede0`): back to the sequence's start until `count` passes (flag 1; -1 forever) or `seconds` (flag 2). */
  | { op: 'loop'; count: number | null; seconds: number | null }
  /** `OBJECT_ACTIVE_STATE` (17; tick `FUN_00263aa0`): node (u16 +6) shown (the u16 at +4 is 1) or hidden. */
  | { op: 'active'; node: number; on: boolean }
  /**
   * `OBJECT_ROTATE_STATE` (19; tick `FUN_00263730`, decomp 111211) / `OBJECT_TRANSLATE_STATE` (18; `FUN_00263890`,
   * 111263): the node (+6) takes the reference node's (+7) world rotation / position when there is one; then flag 1
   * sets the euler angles / offset at +8, flag 2 adds them, flag 4 keeps the node's own.
   */
  | { op: 'rotate' | 'translate'; node: number; ref: number; flags: number; xyz: Vec3 }
  /**
   * `OBJECT_MOTION_FROM_TO` (22) as the flashes use it: a node's scale from `from` to `to` over `seconds` (research 89
   * §4). DOORS (socomlegacy/docs/research/92-doors.md): with flag 0x40 the node's rotation, the quaternions (x, y, z, w) at +0x10
   * and +0x20 -- begin `FUN_0025fe70` (decomp 109034) takes the node's own rotation as the start unless flag 0x20 sets
   * +0x10; flag 1 makes +0x20 a turn after the start (`FUN_003070c0`); tick `FUN_0025f9b0` (108850) slerps by the time
   * over +0x34 (`FUN_00306ae0`) and sets the end when it is up.
   *
   * Translation (research 174 §5, 175, 176 §9.2; the same begin `FUN_0025fe70` and tick `FUN_0025f9b0`): the u16 at +0x0c,
   * when not 0, is the position block P (D:L109101-109103) -- P+4 the start when flag 2 is set, else the node's current
   * place (`from` null); P+0x10 the target; P+0x1c the rate. Flag 0x1 adds that target to the current translation
   * (D:L109234-109244; Enowapi's gates, Chain Reaction's hooks). Death Trap's gate open is flags 9 over 3 s, target
   * (-20, 0, 0); Enowapi's is (0, 35, 0). The scale fields at +0x38/+0x44 stay `from`/`to`: a translation block often
   * sits there, and reading them as the motion is what made the hooks decode as a zero scale (research 176 §9.2). The
   * viewer's general `fromTo` host still applies that scale; `viewer/src/cranes.ts` and `viewer/src/gates.ts` (MAP-07)
   * are what consume `translation`.
   *
   * The speed profile (DF-9, research 387 §12; flags 0x800 or 0x1000): the begin takes the block at the u16 +0x0e
   * (`FUN_0025fe70` D:L109097-109098), starts its phase at the first of its three times above 0 and its speed at the
   * start speed, and keeps the unit direction from the start to the target (D:L109263-109289); the tick then moves the
   * node by `FUN_002606f0` (D:L108997, D:L109348-109434) in place of the rate -- phase 1 adds `accel` x dt to the
   * speed for `times[0]`, phase 2 holds the cruise speed for `times[1]`, phase 3 adds `decel` x dt until the command's
   * time is up, the node moved by the speed along the direction -- and sets the target at the end unless flag 0x2000
   * (D:L108958-108972). The begin recomputes the times from the distance (`FUN_00260910` D:L109438-109505, called at D:L109259) only when it
   * also took the start or the target from a node; MP71's washups take neither (flag 2, P+0's bits clear), so the disc's
   * times stand. The world runs it from a given start (LATER 782: viewer `sceneScroll.ts`, `SCENE_PROFILE_MOTION_READING`).
   */
  | {
    op: 'fromTo'; node: number; flags: number; seconds: number; from: Vec3; to: Vec3;
    rotation?: { from: Quat4; to: Quat4 };
    translation?: { from: Vec3 | null; to: Vec3; rate: Vec3 };
    profile?: { speeds: Vec3; accel: number; decel: number; times: Vec3 };
  }
  /**
   * `SCROLL_MOTION` (24; DF-9, research 387 §12; `FUN_0025bc20`'s 24th registration, D:L106888): begin `FUN_00260fb0`
   * (D:L109681-109703) keeps the world place of the node at +7 (`mover`) and registers every visual at and under the
   * node at +6 (`node`) in the texture-scroll table (`FUN_003134c0` D:L213767ff, 0x4b50d0), its offset 0; the tick
   * `FUN_00260b40` (D:L109507-109676) measures how far `mover` travelled since the last tick -- signed by the axis at
   * +0x14 carried through `mover`'s matrix (its x and z, D:L109635-109655) -- and moves those visuals' texture
   * coordinates by `uv` times it (`FUN_003c0280` -> `FUN_003bfee0` D:L313770ff: each vertex's u and v, in 1/4096ths).
   * Flag 8 measures the travel projected through `node`'s matrix instead (`projected`: the point at +0x20, the axis at
   * +0x2c with flag 0x10, else up; D:L109576-109631); flags 2 and 4 pick the scroll table's walk (`FUN_003bfee0`'s
   * last two arguments, D:L109627-109629, unread); flag 1 ends it after `seconds` (+0x44, D:L109663-109674), else it runs until its
   * animation stops. Was decoded as `other`. The world runs the travel form (LATER 782: viewer `sceneScroll.ts`;
   * what is not drawn is `SCROLL_MOTION_PLACEHOLDER`, viewer `worldState.ts`).
   */
  | {
    op: 'scroll'; node: number; mover: number; flags: number; axis: Vec3; uv: [number, number]; seconds: number | null;
    projected?: { point: Vec3; axis: Vec3 };
  }
  | { op: 'motion'; motion: ObjectMotion }
  /**
   * `OBJECT_OPACITY_FROM_TO` (25; 24 bytes; PB-9b, research 284 s3): a node's opacity (+0x9c) from `from` to `to` --
   * the begin `FUN_0025f960` (D:L108835-108847) writes `from` (+8); the tick `FUN_0025f880` (D:L108804-108832) adds
   * `rate` (+0x10, a second) x dt until `seconds` (+0x14) are spent, then writes `to` (+0xc) and hands the rest of the
   * tick on. The node is the half-word at +4 (both read it so, `FUN_0026f4e0` resolving 0xf9 / 0xfa as the root and the
   * caller, D:L118164-118170), read as the other commands read theirs. The bases' pulses (`pulse_terrorist`, `pulse_seal`).
   */
  | { op: 'opacity'; node: number; from: number; to: number; rate: number; seconds: number }
  | { op: 'particles'; source: ParticleSource }
  /**
   * `SOUND` (30): the sound name (u16 +6, through the name table) at the node +16 (research 81 §6), at the command's own
   * volume: the f32 at +8 when flag 0x10 (u16 +4) is set, else 1.0 (`FUN_002659c0`, decomp 112363-112416, passed as the
   * play's volume 112460-112461; research 81 §12) -- `@s2u/sound`'s `ZANIM_SOUND_VOLUME`, the same command.
   * `newPlay`: whether it starts a placed voice -- flag 0x80 set and neither 0x400 nor 0x800 (`SOUND_NEW_PLAY`). With
   * 0x80 clear it only retunes the voice already playing and starts none (112365-112390). With 0x400 / 0x800 it hands
   * the sound to `FUN_00348dc0` at priority 1 / 3 (112480-112486): the game's one-voice priority slot, which plays it
   * unplaced through the bank's +0x1c play (decomp 245406, 245416), a higher priority fading the voice there first
   * (245386-245398), a taken slot keeping it pending (245424-245444); the viewer does not model the slot and its runners drop those (`SOUND_PRIORITY_SLOT_READING`).
   * `flags` is the command's u16 at +4. Both absent on a hand-built op: a new play.
   * `offset`: flag 4's vector at +0x14, added to the place before the node's matrices carry it to the world
   * (`FUN_00309240`, D:L112423-112426; `mp6_battlesounds`' distant guns at (300, 0, 1000) from the skydome).
   */
  | { op: 'sound'; sound: string; node: number; volume: number; flags?: number; newPlay?: boolean; offset?: Vec3 }
  /** `LIGHT` (32): a dynamic light (`ZAnimLight`). */
  | { op: 'light'; light: ZAnimLight }
  /**
   * `CALL_ANIMATION` (45; begin `FUN_0025d5c0`): the animation named at +7, run at this one's place. Flag 4 (the u16 at
   * +4): `caller`, the node at +9, handed to the callee as a type-3 context entry -- its `NODE_CALLER` (D:L107605-107613;
   * `FUN_0026f4e0` D:L118164-118168); flag 8: `place`, the node at +10, whose world position the call takes
   * (`FUN_00310980`, D:L107620-107629). Research 386 §3.3: the death debris' `*_flypart*` calls, one per part.
   */
  | { op: 'call'; anim: string; caller?: number; place?: number }
  /** `STOP_SEQUENCE` (51): this animation's sequence named at +4 (a name index). */
  | { op: 'stopSequence'; sequence: string }
  /** `FAIL` (11): the animation stops. */
  | { op: 'fail' }
  /**
   * `WHILE` (39; tick `FUN_0025e630`, decomp 108131): with flag 1 (the byte at +4) it always goes on -- the ripples'
   * endless loop; `END_WHILE` (40; `FUN_0025e600`) jumps back to its `WHILE` and yields the tick. Otherwise its
   * condition, the tokens from +8 as an `IF`'s (`conditions`, present when there are any).
   */
  | { op: 'while'; forever: boolean; conditions?: EffectCondition[] }
  /**
   * `MESSAGE` (55; tick `FUN_00267760`, D:L113362-113378; research 179 s9.10, 192 s3.1): a line posted to the main
   * message window -- the u16 at +4 a raw text (a name index), the i16 at +6 a locale id that, when not 0, is read
   * instead (`FUN_00361b40`; the map's `MPnnLOC`), the f32 at +0xc the scale. Always colour index 0 and centred on the
   * multiplayer maps (byte +0xb is 1 on all of them); the bytes +8..+0xa (`c8 c8 c8`) are never read.
   */
  | { op: 'message'; text: string | null; locId: number | null; scale: number }
  /** `CALL_SEQUENCE` (50): starts this animation's sequence named at +4 (a name index) over from its top. */
  | { op: 'callSequence'; sequence: string }
  /** `STOP_ANIMATION` (46): stops the running animation named at +4 (a name index). */
  | { op: 'stopAnimation'; anim: string }
  /**
   * `PAUSE_ANIMATION` (47): pauses the animation named at +4 -- the torches' `loop_torch*` pause themselves, which
   * keeps them (and their particle sources) alive with nothing left to run.
   */
  | { op: 'pauseAnimation'; anim: string }
  /**
   * `INVALIDATE_ANIMATION` (49; tick `FUN_0025d2b0` D:L107355-107373, the 49th registration of `FUN_0025bc20`,
   * D:L106913): the animation the name byte +4 names -- found as `STOP_ANIMATION` finds its own (`FUN_0026e4c0`
   * D:L117534ff: the call slot of that name, made on first use with the definition looked up by `set::name`) -- or, for
   * 0, the running one (`anim` null), has its instance's `+0x34` bit 0 set: every later start of it is refused
   * (`FUN_00270ef0` D:L119142) until its set starts again (`FUN_0026c600` D:L116340-116344). Done at once; what runs
   * goes on. Desert Glory's ten (research 175 §5.1.1) each name their own animation.
   */
  | { op: 'invalidate'; anim: string | null }
  | { op: 'endWhile' }
  /** `VALVE` (61; `FUN_00353fd0`, decomp 252128): the valve (a name index when flag 2) and an operation on it: 0x0b set, 0x0c add, 0x0d subtract; 1-6 the tests. */
  | { op: 'valve'; valve: string; operation: number; operand: number; context?: true }
  /**
   * `EXECUTE_ACTION` (87; tick 0x2b41c0, research 174 s3): the name at +4 (a u16 name index) is an action's valve --
   * `FUN_002b4e80` finds the `actions.rdr` action by it and `FUN_002b44e0` runs that action's animation, refused while it
   * runs (Desert Glory's and Vigilance's `access1` -> `set_access1` -> `destroy_access1`). `anim` keeps the brief's name.
   */
  | { op: 'executeAction'; anim: string }
  /**
   * `DESTRUCTION_SOURCE` (29; 80 bytes; tick `FUN_002678f0`, D:L113383-113421, the 29th registration of `FUN_0025bc20`
   * D:L106893): the node the debris leaves from, the byte at +4 (Frostfire's and Fish Hook's `breakapane`: 0xf9,
   * `NODE_ROOT`), and -- on a command of the full 80 bytes -- what its fragments are made of (`debris`; LATER 850).
   */
  | { op: 'destruction'; node: number; debris?: DestructionDebris }
  /**
   * `FIRE_WEAPON` (57; 44 bytes; begin `FUN_0025ccb0`, D:L107197-107316, the 57th registration of `FUN_0025bc20`):
   * a weapon's round made at a node -- the u8 at +6 the weapon's name (a name index, looked up in the weapon table
   * 0x4b5210), +5 its ammunition's (0x4b5310), the i8 at +8 the node it starts at (an index into `nodeRefs`, or
   * `NODE_CALLER`: `base_explosion1`'s, the planted bomb's node `FUN_002c1c30` hands in); `f1` / `f2` the f32s at
   * +0xc / +0x10, written over the round's +0x8c / +0x90 unless -1. `offset` is flag +4 bit 0's vector +0x14; `atContext` is bit 1's context position (type 5).
   * Not decoded: the direction node +9 and vector +0x20, the flag +10. Crossroads' bridges
   * and bases (research 213 s2.2). The two floats are kept as read, uninterpreted, and nothing here is damage: the
   * world runner and room ignore it (PF.R32); the effects runner presents stationary model-less rounds
   * (research 332 section 7); its fuse is +0x8c, the removal timer +0x90.
   */
  | { op: 'fireWeapon'; weapon: string; ammo: string; node: number; f1: number; f2: number; offset?: [number, number, number]; atContext?: boolean }
  /**
   * `FOR_CHILDREN` (41; 12 bytes; `FUN_0025e360` D:L108011, its step `FUN_0025e3f0` D:L108029-108072): a loop over the
   * children of the node at the i8 +4 (`parent`), each bound to the reference at the i8 +5 (`variable`) in turn, to its
   * `END_FOR_CHILDREN` (42; 8 bytes; `FUN_0025e2d0` D:L107987), which jumps back. The runtime fields (+6 the index, +7
   * the restart bit, +8 the END's offset) are not kept: the runners pair the two by nesting. XR-04 (research 213 s2.3):
   * the runners skip the block whole (`effectRunner.ts`; H99, ruling PF.R29) -- the bridges' debris flight.
   */
  | { op: 'forChildren'; parent: number; variable: number }
  | { op: 'endForChildren' }
  /**
   * `OBJECT_MAKE_WORLDCHILD` (6; 8 bytes; `FUN_00263b30` D:L111373-111398): the node at the i8 +4 reparented to the
   * world root, its world transform kept. Decoded so the runners can name it; nothing runs it (research 213 s2.3).
   */
  | { op: 'makeWorldChild'; node: number }
  /**
   * `ai::ANIMATE` (set 2 command 20; 52 bytes; parser `FUN_005d3c80` D:L487461-487553, begin `FUN_005d3740`
   * D:L487286-487458, tick `FUN_005d2f30` D:L487009-487284; research 214 section 8, research 92 section 2): an anim type
   * pushed on the actor that started the program -- the `select`-th tag-1 context (+4; `FUN_002b44e0` hands the actor's
   * `+0x3b0` in, research 214) -- through `FUN_00588bc0(actor, type, stance, 0, 0)` (D:L487256-487260; the 5th argument 0
   * lets that call send the motion to every console itself, D:L446413-446414), unless the actor's top motion is already
   * that type. `type` is the one type at +0x30 (the u16 count at +0x20 is 1 on every disc program read; a list is not
   * decoded); `prewait` the seconds at +8 before the push (its random range at +0xc, drawn by the begin into +0x18, not
   * decoded: 0 on the disc) and `postwait` the seconds at +0x10 after it (its range +0x14 likewise; the begin's +0x1c);
   * `blocking` bit 1 of the flags byte +0x23 (the parser's `blocking`; bit 0 is `skip_end`, which the begin overwrites).
   * The tick spends one tick on the pre-wait (phase 0), one on the push (phase 1), then counts the post-wait down
   * (phase 3; `left -= dt`, done at or under 0), each phase taking the whole tick (`*dt = 0`), and ends -- not blocking
   * -- without waiting for the clip. The stance the push takes is the byte at +0x21 (0x0b would mean "the actor's own",
   * +0x174, D:L487195-487196), 0 on every disc program read -- a literal 0; the parser's 0x0b default and its `stance`
   * keyword land at +0x22 instead (D:L487519-487530; research 214 section 9, research 92 section 2). Not decoded.
   */
  | { op: 'aiAnimate'; type: number; prewait: number; postwait: number; blocking: boolean; select: number }
  | { op: 'other'; cmd: number; name: string };

export interface EffectSequence {
  name: string;
  /** The `_zsequence` word: bits 1-7 `activation` (1 at the start; 2 the activation checks), bits 8-15 `state`. */
  activation: number;
  ops: EffectOp[];
}

/** An effect animation of `CZANIM`, decoded: what `play(name)` runs. */
export interface EffectProgram {
  name: string;
  /** `Anim_Params` byte 1: the node the animation is rooted at (index into `nodes`), 0 for none. */
  root: number;
  /** `Anim_Params` flags (`_zanim_anim_params`: activation 2 bits, network, scope, copy/instance bits). */
  flags: number;
  /** The node references' names (`nodeRefs`), 0 `NA`. */
  nodes: string[];
  sequences: EffectSequence[];
  /**
   * PB-9b (research 284 s3): the cleanup sequence's index in `sequences` -- the one `Anim_Params`' fourth offset (+0x16)
   * starts at, when that offset is not 0 -- run once when the animation ends (`FUN_0026ff20(5)` -> `FUN_0026d870`,
   * D:L118599), never with the others at its start. Absent with none (the bases' pulses carry one: their outline off).
   */
  cleanup?: number;
}

const NAME = (names: readonly string[], i: number): string => names[i] ?? `#${i}`;

/** The shortest decimal that reads back as this f32 (0.9, not 0.8999999761581421), as `@s2u/archive`'s rdr reader spells one. */
function f32Short(v: number): number {
  for (let digits = 1; digits <= 9; digits++) {
    const short = Number(v.toPrecision(digits));
    if (Math.fround(short) === v) return short;
  }
  return v;
}

/** `SOUND`'s flag 0x10: the command carries its own volume at +8 (`FUN_002659c0` 112363-112416). */
const SOUND_VOLUME = 0x10;
/** `SOUND`'s flag 4: the command carries an offset at +0x14, the place's start (`FUN_002659c0` D:L112423-112426). */
const SOUND_OFFSET = 0x4;

/**
 * `SOUND`'s flags 0x400 / 0x800: the sound goes to the game's one-voice priority slot (`FUN_002659c0` 112460,
 * 112480-112486: 0x400 at priority 1, 0x800 at priority 3; the other callers, 78447 and 81108, at 3). `FUN_00348dc0`
 * (decomp 245376-245446) plays it unplaced through the bank's +0x1c play when the slot is free (245406 at 3; 245416 at
 * 1 while the slot's priority is under 1); a higher priority first fades the voice there (245386-245398), and while
 * the slot is taken the sound waits as its pending one, the highest priority kept (245424-245444).
 * The mask is the source's; the drop is the viewer's: it does not model the slot, and a command with either flag
 * starts no voice here [reading: the slot's MP cues, the MUS_* names, are streamed music the viewer's banks do not
 * hold, research 91's data table].
 */
export const SOUND_PRIORITY_SLOT_READING = 0x400 | 0x800;

/**
 * Whether a `SOUND` command's flags start a placed voice (`FUN_002659c0`): 0x80 (112365; clear, the command retunes
 * the voice playing, if any, and starts none -- the one source-backed "starts none"), and neither priority-slot flag
 * (112460; `SOUND_PRIORITY_SLOT_READING`: the game plays those in its slot, the viewer drops them).
 */
export const SOUND_NEW_PLAY = (flags: number): boolean => (flags & 0x80) !== 0 && (flags & SOUND_PRIORITY_SLOT_READING) === 0;

/**
 * A `VALVE` command's fields (61; registered by `FUN_00354470`, decomp 252347; tick 0x353d00 evaluates
 * `FUN_00353fd0`, decomp 252128, on the payload): the valve reference (+4; flag bit 1: a name index -- `shell_eject`'s
 * is `bullet_ejecting`), the operand (+8), the operation (+12) and the flags (+13).
 */
function valveOf(c: CmdBytes, names: readonly string[]): { valve: string; operation: number; operand: number; context?: true } {
  const ref = c.u32(4), flags = c.u8(13);
  // DOORS (socomlegacy/docs/research/92-doors.md): flag bit 0 takes the valve from the animation's context
  // (`FUN_002721c0(context, ref)`, decomp 252144-252150) -- the door's own, handed in by `FUN_002b44e0`.
  const context = (flags & 1) !== 0 ? { context: true as const } : {};
  return { valve: (flags & 2) !== 0 ? NAME(names, ref) : `#${ref}`, operation: c.u8(12), operand: c.i32(8), ...context };
}

function condition(c: CmdBytes, names: readonly string[]): EffectCondition {
  const cmd = c.u8(0);
  if (cmd === ZCMD.EXPRESSION && c.u8(1) === 0) return { kind: 'operator', operator: c.u8(4) };
  if (cmd === ZCMD.RANDOM_WEIGHT) return { kind: 'random', p: c.f32(4) };
  if (cmd === ZCMD.RANGE_TEST) return { kind: 'range', flags: c.u32(4), node: c.i8(8), other: c.i8(9), rangeSquared: c.f32(0x24) };
  if (cmd === ZCMD.VALVE) return { kind: 'valve', ...valveOf(c, names) };
  return { kind: 'other', cmd, set: c.u8(1) };
}

/**
 * An `IF`'s (or a `WHILE`'s) condition tokens: the sub-commands from +8 to the command's end, each with its own header --
 * the tests and the `EXPRESSION` operators between them, in order (research 95 s1.4).
 */
function conditions(c: CmdBytes, names: readonly string[]): EffectCondition[] {
  const out: EffectCondition[] = [];
  let o = 8;
  while (o + 4 <= c.length) {
    const h = c.u32(o), size = h >>> 18;
    if (size < 4 || o + size > c.length) break;
    out.push(condition(new CmdBytes(c.bytes.subarray(o, o + size)), names));
    o += size;
  }
  return out;
}

/**
 * `DESTRUCTION_SOURCE`'s payload past its node (LATER 850; research 210 §6.1). `FUN_002678f0` reads the command in place
 * and calls `FUN_00322580` with every field below (its registers at 0x2678f0-0x2679c4: f12 +0x18, f13 +0x4c, a1 the name,
 * a2 cmd+8, a3/t0 the velocity's two ends, t1 +0x34, t2 +0x40, t3 +6); `FUN_00322580` (D:L222612-222678) keeps +0x3c and
 * +0x40..+0x48 on the fragments' shared descriptor (D:L222654-222658; made by `FUN_00328e90` D:L226243-226277) and,
 * for mode 0, hands the rest to `FUN_00322800` (D:L222681-222831), which throws the node's triangles (`./glassFragments`).
 */
export interface DestructionDebris {
  /**
   * The name at +5 (a name index), formatted `%s` (0x3ed110) and looked up as a texture (`FUN_001ec940`), else
   * `null_xmas.bmp` (0x3f6ec8); neither found, nothing is thrown (D:L222634-222641).
   */
  texture: string;
  /** +6: 0 the triangles are thrown (`FUN_00322800`); 1 the descriptor alone is made; any other, nothing (D:L222660-222672). */
  mode: number;
  /**
   * +8..+0x14, four f32: each fragment's vertex colour, each rounded to a byte (+0.5; `FUN_00322df0` D:L223268-223298).
   * The fourth is never read as stored: `FUN_00322800` writes 100.0 over +0x14 before each triangle (D:L222777; 0x322a40).
   */
  colour: [number, number, number, number];
  /**
   * +0x18 (f12): the measure a triangle is split by -- `0.6 x size / |2 x area|` against 0.3 and a draw (`FUN_00322df0`
   * D:L223084-223101).
   */
  size: number;
  /** +0x1c, +0x24, +0x2c: one end of each axis's velocity draw (`lo + (hi - lo) x r`, `FUN_00322800` D:L222784-222792). */
  velocityFrom: Vec3;
  /** +0x20, +0x28, +0x30: the other end. */
  velocityTo: Vec3;
  /** +0x34, +0x38: the life's draw, seconds (D:L222799-222801, the lerp at D:L222821). */
  life: [number, number];
  /** +0x3c: the descriptor's +0x2c, the drag toward the world's wind (`FUN_003271d0` D:L225243-225279); 0, none. */
  drag: number;
  /** +0x40..+0x48: the descriptor's +0x30, added to the velocity times the step each tick (D:L225219-225224). */
  acceleration: Vec3;
  /** +0x4c (f13): each fragment's +0x54, written to its visual's +0x9c each tick (D:L225240); its meaning is not read. */
  visual9c: number;
}

/** `DESTRUCTION_SOURCE`'s payload (`DestructionDebris`), or null for a command shorter than the 80 bytes `FUN_002678f0` reads. */
function destructionDebris(c: CmdBytes, names: readonly string[]): DestructionDebris | null {
  if (c.length < 0x50) return null;
  return {
    texture: NAME(names, c.u8(5)), mode: c.u8(6),
    colour: [c.f32(8), c.f32(0xc), c.f32(0x10), c.f32(0x14)], size: c.f32(0x18),
    velocityFrom: [c.f32(0x1c), c.f32(0x24), c.f32(0x2c)], velocityTo: [c.f32(0x20), c.f32(0x28), c.f32(0x30)],
    life: [c.f32(0x34), c.f32(0x38)], drag: c.f32(0x3c), acceleration: c.vec3(0x40), visual9c: c.f32(0x4c),
  };
}

/** One command's bytes to what it does; `names` is the animation's name table. */
export function decodeEffectOp(cmd: Pick<ZAnimCommand, 'set' | 'cmd' | 'bytes'>, names: readonly string[]): EffectOp {
  const c = new CmdBytes(cmd.bytes);
  if (cmd.set === 2 && cmd.cmd === AI_CMD.ANIMATE) {
    return { op: 'aiAnimate', type: c.i32(0x30), prewait: c.f32(8), postwait: c.f32(0x10), blocking: (c.u8(0x23) & 2) !== 0, select: c.i32(4) };
  }
  const n = cmd.set === 0 ? cmd.cmd : -1;
  switch (n) {
    case ZCMD.IF: return { op: 'if', conditions: conditions(c, names) };
    case ZCMD.ELSEIF: return { op: 'elseif', conditions: conditions(c, names) };
    case ZCMD.ELSE: return { op: 'else' };
    case ZCMD.ENDIF: return { op: 'endif' };
    case ZCMD.WAIT: {
      const flags = c.u16(4);
      const frames = (flags & 0x10) !== 0 ? c.i32(8) : null;
      if ((flags & 0x20) !== 0) {
        const at = 8 + 4 * ((flags & 0x10) !== 0 ? 2 : 1);           // FUN_0025ed50: iVar2 = 2 with 0x10, else 1
        return { op: 'wait', seconds: c.f32(at), range: c.f32(at + 4), frames };
      }
      return { op: 'wait', seconds: frames === null ? c.f32(8) : 0, range: 0, frames };
    }
    case ZCMD.LOOP: {
      const flags = c.u32(4);
      return { op: 'loop', count: (flags & 1) !== 0 ? c.i32(8) : null, seconds: (flags & 1) === 0 && (flags & 2) !== 0 ? c.f32(8) : null };
    }
    case ZCMD.OBJECT_ACTIVE_STATE: return { op: 'active', node: c.i8(6), on: c.i16(4) === 1 };
    case ZCMD.OBJECT_ROTATE_STATE: return { op: 'rotate', node: c.i8(6), ref: c.i8(7), flags: c.u16(4), xyz: c.vec3(8) };
    case ZCMD.OBJECT_TRANSLATE_STATE: return { op: 'translate', node: c.i8(6), ref: c.i8(7), flags: c.u16(4), xyz: c.vec3(8) };
    case ZCMD.OBJECT_MOTION_FROM_TO: {
      // The flashes' form (flags 0x300): +0x34 the time, +0x38 from, +0x44 to, +0x50 the rate -- which is (to - from) /
      // time on every one of them (research 89 §4), the check that the reading is right. Those two vectors stay the
      // scale reading. A position block (u16 +0x0c, research 174 §5 / 176 §9.2, `uiZanim` `move`) is separate.
      const flags = c.u16(4), p = c.u16(0x0c), q = c.u16(0x0e);
      return {
        op: 'fromTo', node: c.i8(6), flags, seconds: c.f32(0x34), from: c.vec3(0x38), to: c.vec3(0x44),
        ...((flags & 0x40) !== 0 ? { rotation: { from: c.quat(0x10), to: c.quat(0x20) } } : {}),
        ...(p !== 0 ? { translation: { from: (flags & 2) !== 0 ? c.vec3(p + 4) : null, to: c.vec3(p + 0x10), rate: c.vec3(p + 0x1c) } } : {}),
        // DF-9: the speed profile's block (`FUN_0025fe70` D:L109097-109098; `FUN_002606f0`'s +0x00..+0x1c).
        // Taken at param_1 + u16(+0x0e) unconditionally under either flag, as the original does.
        ...((flags & 0x1800) !== 0
          ? { profile: { speeds: c.vec3(q), accel: c.f32(q + 0xc), decel: c.f32(q + 0x10), times: c.vec3(q + 0x14) } } : {}),
      };
    }
    case ZCMD.SCROLL_MOTION: {
      const flags = c.u8(4);
      return {
        op: 'scroll', node: c.i8(6), mover: c.i8(7), flags, axis: c.vec3(0x14), uv: [c.f32(0x38), c.f32(0x3c)],
        seconds: (flags & 1) !== 0 ? c.f32(0x44) : null,
        ...((flags & 8) !== 0 ? { projected: { point: c.vec3(0x20), axis: (flags & 0x10) !== 0 ? c.vec3(0x2c) : [0, 1, 0] as Vec3 } } : {}),
      };
    }
    case ZCMD.OBJECT_OPACITY_FROM_TO:
      return { op: 'opacity', node: c.i8(4), from: f32Short(c.f32(8)), to: f32Short(c.f32(0xc)), rate: f32Short(c.f32(0x10)), seconds: f32Short(c.f32(0x14)) };
    case ZCMD.OBJECT_MOTION: return { op: 'motion', motion: decodeObjectMotion(c, names) };
    case ZCMD.PARTICLE_SOURCE: return { op: 'particles', source: decodeParticleSource(c, names) };
    case ZCMD.SOUND: {
      const flags = c.u16(4);
      return {
        op: 'sound', sound: NAME(names, c.u16(6)), node: c.i8(16), volume: (flags & SOUND_VOLUME) !== 0 ? c.f32(8) : 1, flags, newPlay: SOUND_NEW_PLAY(flags),
        ...((flags & SOUND_OFFSET) !== 0 ? { offset: c.vec3(0x14) } : {}),
      };
    }
    case ZCMD.LIGHT: return { op: 'light', light: decodeLight(c) };
    case ZCMD.CALL_ANIMATION: {
      const flags = c.u16(4);
      return { op: 'call', anim: NAME(names, c.u8(7)), ...(flags & 4 ? { caller: c.i8(9) } : {}), ...(flags & 8 ? { place: c.i8(10) } : {}) };
    }
    case ZCMD.STOP_SEQUENCE: return { op: 'stopSequence', sequence: NAME(names, c.u16(4)) };
    case ZCMD.WHILE: {
      const forever = (c.u8(4) & 1) !== 0, list = forever ? [] : conditions(c, names);
      return { op: 'while', forever, ...(list.length ? { conditions: list } : {}) };
    }
    case ZCMD.MESSAGE: {
      const loc = c.i16(6);
      return { op: 'message', text: loc !== 0 ? null : NAME(names, c.u16(4)), locId: loc !== 0 ? loc : null, scale: f32Short(c.f32(0xc)) };
    }
    case ZCMD.CALL_SEQUENCE: return { op: 'callSequence', sequence: NAME(names, c.u16(4)) };
    case ZCMD.STOP_ANIMATION: return { op: 'stopAnimation', anim: NAME(names, c.u16(4)) };
    case ZCMD.PAUSE_ANIMATION: return { op: 'pauseAnimation', anim: NAME(names, c.u16(4)) };
    // `FUN_0025d2b0` tests the byte +4 alone (D:L107363); a name index otherwise (`FUN_0026e4c0`'s `param_2`).
    case ZCMD.INVALIDATE_ANIMATION: return { op: 'invalidate', anim: c.u8(4) === 0 ? null : NAME(names, c.u8(4)) };
    case ZCMD.END_WHILE: return { op: 'endWhile' };
    case ZCMD.FAIL: return { op: 'fail' };
    case ZCMD.VALVE: return { op: 'valve', ...valveOf(c, names) };
    case ZCMD.EXECUTE_ACTION: return { op: 'executeAction', anim: NAME(names, c.u16(4)) };
    case ZCMD.DESTRUCTION_SOURCE: {
      const debris = destructionDebris(c, names);
      return { op: 'destruction', node: c.i8(4), ...(debris ? { debris } : {}) };
    }
    case ZCMD.FIRE_WEAPON:
      return { op: 'fireWeapon', weapon: NAME(names, c.u8(6)), ammo: NAME(names, c.u8(5)), node: c.i8(8), f1: f32Short(c.f32(0xc)), f2: f32Short(c.f32(0x10)),
        ...(c.u8(4) & 1 ? { offset: [c.f32(0x14), c.f32(0x18), c.f32(0x1c)] as [number, number, number] } : {}),
        ...(c.u8(4) & 2 ? { atContext: true } : {}) };
    case ZCMD.FOR_CHILDREN: return { op: 'forChildren', parent: c.i8(4), variable: c.i8(5) };
    case ZCMD.END_FOR_CHILDREN: return { op: 'endForChildren' };
    case ZCMD.OBJECT_MAKE_WORLDCHILD: return { op: 'makeWorldChild', node: c.i8(4) };
    default: {
      const name = cmd.set === 0 ? ZANIM_COMMAND_NAMES[cmd.cmd] ?? `cmd ${cmd.cmd}` : cmd.set === 2 ? AI_COMMAND_NAMES[cmd.cmd] ?? `ai cmd ${cmd.cmd}` : `set ${cmd.set} cmd ${cmd.cmd}`;
      return { op: 'other', cmd: cmd.cmd, name };
    }
  }
}

/** A zAnim animation to its effect program. */
export function decodeEffectProgram(anim: ZAnimAnimation): EffectProgram {
  const offset = anim.params.seqOffsets?.[3] ?? 0;   // a hand-built animation (a test's) may carry none
  const cleanup = offset > 0 ? anim.sequences.findIndex((s) => s.offset === offset) : -1;
  return {
    name: anim.name, root: anim.params.rootNodeIndex, flags: anim.params.flags,
    nodes: anim.nodeRefs.map((r) => r.name),
    sequences: anim.sequences.map((s) => ({
      name: s.name, activation: (s.word >>> 1) & 0x7f,
      ops: s.commands.filter((c) => !(c.set === 0 && c.cmd === ZCMD.QUAD_ALIGN)).map((c) => decodeEffectOp(c, anim.names)),
    })),
    ...(cleanup >= 0 ? { cleanup } : {}),
  };
}

/** The animations a program calls, directly and through what those call (for loading what a muzzle effect needs). */
export function calledPrograms(programs: ReadonlyMap<string, EffectProgram>, name: string, seen = new Set<string>()): Set<string> {
  if (seen.has(name)) return seen;
  seen.add(name);
  const p = programs.get(name);
  for (const s of p?.sequences ?? []) for (const o of s.ops) if (o.op === 'call') calledPrograms(programs, o.anim, seen);
  return seen;
}

/**
 * `decals.rdr`'s `DECAL_SETS` set `set`, every row: one material's bitmap and size range each (`BULLET_MARK_SMALL`:
 * 24 rows, `bullet_mark_stone.tif` on STONE, `bullet_mark_metal.tif` on METAL_THICK ...; research 89 §5). A row
 * without a texture or sizes is left out.
 */
export function decalSetRows(decals: RdrNode, set: string): DecalEntry[] {
  const sets = rdrGet(decals, 'DECAL_SETS');
  if (!Array.isArray(sets)) throw new Error('decals.rdr has no DECAL_SETS');
  const rows = sets.find((s): s is RdrNode[] => Array.isArray(s) && s.some((r) => rdrGet(r, 'SETNAME') === set));
  if (!rows) throw new Error(`decals.rdr has no decal set ${set}`);
  const out: DecalEntry[] = [];
  for (const row of rows) {
    const material = rdrGet(row, 'MATERIALNAME'), texture = rdrGet(row, 'TEXTURENAME');
    if (typeof material !== 'string' || typeof texture !== 'string') continue;
    const where = `decals.rdr ${set} ${material}`;
    out.push({ set, material, texture, minSize: rdrReal(row, 'MIN_SIZE', 1, where), maxSize: rdrReal(row, 'MAX_SIZE', 1, where) });
  }
  return out;
}

/**
 * Whether a weapon's round draws a tracer (research 89 §6): the tracer weapons are the SMGs (weapon ids 31-50), the
 * assault rifles (51-80), the machine guns (91-100), the heavy weapons (141-144) and the turrets (205-229)
 * (`FUN_003cb1a0`, decomp 320657), less the suppressed ones -- 16 Mark 23 SD, 33 HK5SD, 62 M4A1 SD, 67 552SD, 105 SR-25
 * SD (`FUN_003c5ac0`, 317147); and of those, every fourth round (`FUN_003cabe0`, 320545: the shooter's count, taken
 * before the round, `% 4 == 0`). `round` counts from 1, the first round fired.
 */
export function tracerRound(weaponId: number, round: number): boolean {
  const eligible = (weaponId >= 31 && weaponId <= 50) || (weaponId >= 51 && weaponId <= 80) || (weaponId >= 91 && weaponId <= 100)
    || (weaponId >= 141 && weaponId <= 144) || (weaponId >= 205 && weaponId <= 229);
  if (!eligible || TRACERLESS.has(weaponId)) return false;
  return round % 4 === 0;
}

/** The suppressed weapons `FUN_003c5ac0` excludes from the tracers. */
export const TRACERLESS: ReadonlySet<number> = new Set([16, 33, 62, 67, 105]);
