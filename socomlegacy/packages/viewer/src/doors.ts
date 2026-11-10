import { Zar, zdbMember, type ZdbEntry } from '@s2u/archive';
import {
  decodeEffectProgram, flattenScene, GAME_FRAME_DT, NODE_CALLER, NODE_ROOT, parseAnimSets, segmentHits, SURFACE_SKIP, surfaceWord,
  THROW_POWER_FALL, THROW_POWER_RISE,
  type CollisionOwner, type EffectCondition, type EffectOp, type EffectProgram, type Footprint, type Grid, type SceneNode,
} from '@s2u/scene';
import { EffectRun, type EffectHost, type OpTick } from './effectRunner';
import { apply4, invertAffine, matrixOfQuat, mul4, quatMul, quatOfMatrix, quatSlerp, type Quat } from './doorMath';
import { groundPolygons, type GroundData } from './mover';
import { ACTION_TYPE_CODES, readActionRecords, VALVE_LOCKED } from './mapActions';
import { under } from './mapMeta';
import type { DoorWire } from './net/protocol';

/**
 * The map's doors (socomlegacy/docs/research/92-doors.md): what the action button does to one, headless -- the page and the
 * multiplayer server run this same code (`./sim`).
 *
 * **The game's door** is a `DOOR` record of `READERM.ZAR/actions.rdr` (`node`, `valve`, `anim`, `range`, `elevation`;
 * the loader is `FUN_002b4230`, registered as `EXECUTE_ACTION`): the scene node that swings, the `CValve` that holds
 * its state (the short at `+4`: 0 shut, 1 open, 99 locked -- `FUN_002b46f0`), the `MZANIM.ZAR` animations that swing
 * it, and the reach. The action button (`FUN_00592d50`'s `0x2000` branch, decomp 452002-452022) takes the action on
 * the node under the reticle (`FUN_005aa240`, 463830: that node or one of its parents names an action, and the SEAL is
 * within `range` of the reticle's point on the ground plane and inside `elevation` in height); `FUN_002b44e0` (156787)
 * refuses it while the door's last animation still runs, else starts the animation `FUN_005ec4e0` picks (the second
 * of two only under its side test) with the node and the valve as its context (`FUN_00272bb0(anim, 1, 3, node, 4,
 * valve, ...)`) and logs the use to the net (`FUN_002bb5b0`). The animation does the rest: reads the valve, orders the
 * presser toward the door (`ai::MOVE`, not run here: `DOOR_MOVE_ORDER_READING`), pushes `Open door` on the presser's
 * body (`ai::ANIMATE` 63, `DoorHooks.animate`; `OPEN_DOOR_TYPE`) and holds 0.25 s, swings the node's rotation to the
 * other stop (`OBJECT_MOTION_FROM_TO` with its rotation flag, a quaternion slerp: `FUN_0025fe70` / `FUN_0025f9b0`),
 * plays the door's sound and sets the valve (its `ai::EVENT` is an AI noise no round has an AI to hear). Nothing shuts
 * a door by itself within a round; the round's start shuts them all (`DoorSet.reset`, ruling PF.R10).
 *
 * **Here** a door is its node's matrices, the collision owners under the node -- the leaf's polygons, turned in place
 * in the hull (`CollisionOwner.sweep` readies the grid and the mover for that) -- and its animations decoded
 * (`decodeEffectProgram`), run by the effects' sequencer (`./effectRunner`) with a host that knows the door's node and
 * valves. The page draws the leaf where the hooks say (`WorldView.moveNode`); the server sends `wire` in its snapshots.
 */

/** One door of a map, as the worker hands it to the page and the server reads it: plain data. */
export interface DoorSpec {
  /** Its place among the map's doors (the `DOOR` records of `actions.rdr`, in order): its number on the wire. */
  index: number;
  /** The scene node that swings (`bdoor_4`), and its path in the scene walk (`WorldView.moveNode`). */
  node: string;
  path: string;
  /** The `CValve` that holds its state. */
  valve: string;
  /** `range`: how far from the reticle's point on the leaf the SEAL may stand, on the ground plane; `elevation` in height, -1 for any. */
  range: number;
  elevation: number;
  /** The animations `anim` names that the map holds, decoded, in its order: the first is the swing, a second the kick. */
  programs: EffectProgram[];
  /** The node's own matrix as the disc holds it (row-major, row vectors), and its parent's world matrix. */
  local: number[];
  parent: number[];
  /** Indices into the hull's owners (`GroundData.owners`): the polygons that swing with it. */
  owners: number[];
  /** The ground-plane box the leaf can reach: the square round the hinge through the leaf's farthest point. */
  sweep: Footprint;
}

/** The valve value that locks a door (`FUN_002b46f0`, `FUN_005aa240`: `*(short *)(valve + 4) != 99`): `./mapActions`'. */
export { VALVE_LOCKED };

/**
 * The `DOOR` actions of a map archive, each on its scene node with its polygons and animations; none on a map without
 * `actions.rdr`. `owners` are the hull's (`collisionOwners(models)`, indexing `polys`); the doors mark theirs with
 * `sweep` as they are found, so pack the ground after this. Never throws: what does not read is a diagnostic.
 */
export function readDoors(
  bytes: Uint8Array, toc: ZdbEntry[], models: SceneNode[], owners: CollisionOwner[], polys: readonly { points: Float32Array }[],
): { doors: DoorSpec[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  // The records through the one parser (`./mapActions`): the page's actions, the room's and the doors' agree.
  const { records, error } = readActionRecords(bytes, toc);
  if (error !== undefined) return { doors: [], diagnostics: [`doors: actions.rdr: ${error}`] };
  const doorRecords = records.filter((r) => r.typeCode === ACTION_TYPE_CODES.DOOR);
  if (doorRecords.length === 0) return { doors: [], diagnostics };
  let programs = new Map<string, EffectProgram>();
  try {
    const archive = parseAnimSets(Zar.parse(zdbMember(bytes, toc, 'MZANIM.ZAR')));
    programs = new Map(archive.sets.flatMap((s) => s.anims).map((a) => [a.name.toLowerCase(), decodeEffectProgram(a)]));
  } catch (e) {
    diagnostics.push(`doors: MZANIM.ZAR: ${e instanceof Error ? e.message : String(e)}`);
  }
  const flat = flattenScene(models, 'worldmodel');
  const doors: DoorSpec[] = [];
  for (const r of doorRecords) {
    const node = r.node;
    const at = flat.find((f) => f.node.name.toLowerCase() === node.toLowerCase());
    if (!at) { diagnostics.push(`doors: node ${node} is not placed`); continue; }
    const names = r.anims;
    const anims = names.map((a) => programs.get(a.toLowerCase()));
    // The first swings it; a second is the kick (`kick_door`, `FUN_005ec4e0`; LATER 362b, `doorPick`).
    if (!anims[0]) { diagnostics.push(`doors: ${node}: animation ${names[0] ?? '(none)'} not in MZANIM.ZAR`); continue; }
    // A missing second one is left out, as the game's loader leaves it (it appends an animation only when `FUN_0026a250`
    // finds it, D:L157381-157400; the first, D:L157053-157056): the record holds one, `FUN_005ec4e0` answers 0 (+8 < 2),
    // so the door is opened however the button is held -- Chain Reaction's (LATER 362b's review F1).
    names.forEach((a, k) => {
      if (k > 0 && !anims[k]) {
        diagnostics.push(`doors: ${node}: kick animation ${a} not in MZANIM.ZAR; the swing ${names[0]} is read (the record holds one animation, as the game loads it: research 92 section 6)`);
      }
    });
    const mine = owners.map((o, i) => (under(o.path, at.path) ? i : -1)).filter((i) => i >= 0);
    if (mine.length === 0) diagnostics.push(`doors: ${node} has no collision under it`);
    const hinge = apply4(at.world, 0, 0, 0);
    let reach = 0;
    for (const i of mine) {
      const o = owners[i]!;
      for (const p of polys.slice(o.first, o.first + o.count)) {
        for (let k = 0; k < p.points.length; k += 3) reach = Math.max(reach, Math.hypot(p.points[k]! - hinge[0], p.points[k + 2]! - hinge[2]));
      }
    }
    const sweep: Footprint = { minX: hinge[0] - reach, maxX: hinge[0] + reach, minZ: hinge[2] - reach, maxZ: hinge[2] + reach };
    // LATER 142: a door's owner carries no frame (`CollisionOwner.frame`): the original builds the collider's frame live
    // each call (`FUN_003109f0` D:L212151 walks the current matrices), and the port turns the door's points in place in
    // the world, so the world frame is the live one for the walk and the climb; a frame kept from the load would go stale
    // as the door moves. LATER 146: it is kept as `restFrame` for the forge's pieces of a door prototype, which stand
    // still (`forge/ground.ts` `modelFrame`), and never reaches the walk (`groundPolygons` copies `frame` alone).
    for (const i of mine) { const o = owners[i]!; o.sweep = sweep; if (o.frame) o.restFrame = o.frame; delete o.frame; }
    doors.push({
      index: doors.length, node: at.node.name, path: at.path, valve: r.valve,
      range: r.range, elevation: r.elevation,
      programs: anims.filter((p): p is EffectProgram => p !== undefined),
      local: Array.from(at.node.matrix), parent: Array.from(mul4(invertAffine(at.node.matrix), at.world)),
      owners: mine, sweep,
    });
  }
  return { doors, diagnostics };
}

/** `FUN_00353fd0`'s tests (the `VALVE` condition). */
export function valveTest(value: number, operation: number, operand: number): boolean {
  switch (operation) {
    case 0: return true;
    case 1: return value !== operand;
    case 2: return value === operand;
    case 3: return value > operand;
    case 4: return value < operand;
    case 5: return value >= operand;
    case 6: return value <= operand;
    default: return false;
  }
}

/** `FUN_00353fd0`'s operations: 0x0b set, 0x0c add, 0x0d subtract (not below 0), 0x0e multiply; the tests leave it. */
export function valveApply(value: number, operation: number, operand: number): number {
  switch (operation) {
    case 0x0b: return operand;
    case 0x0c: return value + operand;
    case 0x0d: return Math.max(0, value - operand);
    case 0x0e: return value * operand;
    default: return value;
  }
}

/**
 * What the page lends the doors: a sound at a place and its volume, and the leaf drawn where it is now (a column-major
 * delta). The volume is the SOUND command's own (flag 0x10's f32 at +8, else 1.0: `FUN_002659c0` 112363-112416).
 */
/**
 * Who pressed a door (`DoorSet.use`): a player's id on the server; `'self'` the page's own press with no room (the page
 * plays the pushed clip on its own body); `'wire'` a swing the page follows off the server's snapshot (`applyWire`: the
 * room's `motion` event carries the clip, so the page plays none for it).
 */
export type DoorActor = number | 'self' | 'wire';

export interface DoorHooks {
  sound?(name: string, at: [number, number, number], volume: number): void;
  /** The door's leaf moved: `delta` (16 floats, three's column-major order) after the disc's placement. */
  moved?(door: DoorSpec, delta: Float32Array): void;
  /**
   * The door program's `ai::ANIMATE` pushed anim type `type` on the actor who pressed (`FUN_005d2f30` phase 1 ->
   * `FUN_00588bc0(actor, type, stance, 0, 0)`, D:L487256-487260; research 92 section 2): the doors' is 63, `Open door`
   * (`OPEN_DOOR_TYPE`, the clip `openDoorClip`). Once a use, one tick after it (the ANIMATE's pre-wait tick).
   */
  animate?(door: DoorSpec, type: number, actor: DoorActor): void;
  /**
   * DF-4 (`DOOR_CALL_READING`): the door program's `CALL_ANIMATION` of `anim` -- MP6's `singleDoor_right` calls
   * `okforhostages` after the open's swing under `IF cdoor1 == 1` and `not_okforhostages` after the close's (Seq_Data
   * +404 / +724, research 175 s5.1). The door runs nothing of it: the holder of the map's world runs it there
   * (`WorldState.doorCall`; the room's `Room` construction). Heard on a quiet run-out too: what it changes is state.
   */
  call?(door: DoorSpec, anim: string): void;
}

interface Door {
  spec: DoorSpec;
  /** The node's rotation now. */
  q: Quat;
  /** The node's world matrix at rest (as on the disc) and its inverse. */
  world0: Float32Array;
  inv0: Float32Array;
  /** The leaf's polygons at rest, world space, and where they live in the hull's points. */
  rest: { offset: number; points: Float32Array }[];
  run: EffectRun | null;
  /** The rotation now running: its seconds and how far it is. */
  swing: { seconds: number; t: number } | null;
  /** Muted: a swing replayed to catch up with the server makes no sound. */
  quiet: boolean;
  /** The server's last word on it (`applyWire`), for telling a new swing from one already followed. */
  seen: DoorWire | null;
  /** LATER 362: the room's pick for the next swing followed off the wire (`followPick`), or undefined: the first. */
  pick?: 0 | 1;
  /**
   * BOT-DOOR: a swing the server began while this side still ran the last one (`applyWire`), held for that run's end;
   * dropped once the server is at rest (the run-out at rest follows it then).
   */
  queued?: boolean;
  /** Who pressed it last (`use`): the ANIMATE's actor (`DoorHooks.animate`). */
  actor: DoorActor;
  /** P7 (`DOOR_PREDICT_ADAPTATION`): the page's own press run ahead of the room's word, until the room's snapshot settles it. */
  predicted?: DoorPrediction;
}

/** P7: what a predicted press (`DoorSet.predict`) needs to be settled by the room's snapshot, or run back. */
interface DoorPrediction {
  /** The command the press named (the `door` event's `seq`): the room has decided it once its snapshot acks a later one. */
  seq: number;
  /** The door's valve, and its node's rotation, before the press. */
  valve: number;
  q: Quat;
  /** The animation the press picked (`doorPick`): the room's swing is this press's only on the same pick (F2). */
  pick: 0 | 1;
  /** Each valve the predicted run set, at its value before the press (for the run back). */
  valves: Map<string, number>;
}

/**
 * DOOR_PREDICT_ADAPTATION (P7, the online-parity sweep's DMA-2; research 92 sections 6 and 7; a network adaptation): the
 * original runs a door's use on the pressing console -- the button (`FUN_00592d50`'s 0x2000 branch, D:L452002-452022)
 * calls `FUN_002b44e0` (D:L156787-156865), which starts the animation there and only logs the use to the net
 * (`FUN_002bb5b0`) -- so its presser's door swings at the press. The port's room is the authority, a round trip away, so
 * the page predicts its own press (`DoorSet.predict`, from `DoorPage.action`): the program runs here at once -- the
 * valve, the sound, the leaf drawn and its polygons turned in the page's hull -- in the order the room runs it (the use
 * between the press's command and the next, the door's step after the walker's tick: `main.ts`'s frame, `Room.step`).
 * The room's snapshot settles it (`DoorSet.applyWire`): a swing begun there (or its valve changed at rest) is this run,
 * never run again; a snapshot acking a command past the press's with the door at rest on its old valve is a refusal,
 * and the door is put back silently -- the valves the run set and the leaf's rotation as before the press, no sound.
 * No original: the original has no refusal to run back. Its cost: a refused press was heard opening. Not predicted:
 * the presser's clip (`Open door`), still played from the room's `motion` event a round trip late (the swing's actor is
 * `'wire'`) until the room sends the presser's own as an echo (the online lane's half of P7).
 */
export const DOOR_PREDICT_ADAPTATION = 'predicted' as const;

/** The wire's phase of a door at rest (`DoorWire.phase`). */
export const PHASE_REST = 255;

/**
 * DOOR_ROUND_RESET_READING (ruling PF.R10, 2026-10-04): at the round's start every door is shut and at rest -- its valve
 * 0 and its leaf at the disc's rotation, set at once, silently (`DoorSet.reset`). The round's reset `FUN_002ac0e0`
 * (D:L151976-151991) calls `FUN_002b5510` (D:L157445-157456), which zeroes the action valves and stops the running
 * animations, and the zAnim restore (`FUN_0026b430` D:L115690-115721) puts back what the node references saved:
 * Frostfire's `action_reset` names `bdoor_4`, `wdoor_1` and `wdoor_2` with save-rotation (bit 27) and Desert Glory's the
 * same for `cdoor1` (research 209 s4), so on those maps the restored rotation is sourced. The swing is relative to the
 * rotation it starts from (research 92 s2), so a valve zeroed without the rotation restored would open a door the wrong
 * way [reading: that every map's doors are named by such a reference, and the order of the two restores, are not
 * traced; research 209 s10].
 */
export const DOOR_ROUND_RESET_READING = true;

/**
 * The anim type the doors' programs push on the presser (`ai::ANIMATE` +0x30 on every `singleDoor_*` `open` and `close`
 * of Frostfire's `MZANIM.ZAR`, research 92 section 2): 63, `Open door` in the ELF's static anim-type table at 0x661060
 * (`FUN_005e3ff0`; 1 is `Stand`, 132 `Pistol open door`).
 */
export const OPEN_DOOR_TYPE = 63;

/**
 * LATER 362 (research 92 section 6, "Read 2026-10-27"; reading, pending review): the anim type the kick's programs push
 * (`ai::ANIMATE` +0x30 of every `kick_door` / `kick_Door*` on Sandstorm, Guidance and Requiem): 284, `Kick open door`
 * (-> `seal_kickopendoor`). Past the ELF's 137 static names (0x661060) the types are `animset.rdr`'s `type_name`s numbered
 * from 137 in first appearance -- read off the data's consistency (284 exact, `Pistol kick open door` 285), the
 * registration in `FUN_005e3ff0` (D:L495984) not traced. Settles it: that lookup's numbering, read.
 */
export const KICK_DOOR_TYPE_READING = 284;

/**
 * LATER 362: the action button's chased pressure at its release at or past which a two-animation door is kicked
 * (`FUN_005ec4e0` D:L500537: `DAT_00650ae8`, 0.5 off the ELF's data).
 */
export const KICK_PRESS = 0.5;

/**
 * LATER 362 (research 92 section 6): `FUN_005ec4e0` kicks only from the side its navigation record faces -- the door's
 * record in the graph at 0x66a1b0 (`FUN_0052daa0` D:L397139) of kind 1, the actor within an octant of its direction
 * (`FUN_00518ae0` D:L386202, `FUN_00519080` D:L386449 > 0). The port reads no navigation graph off the disc yet, so the
 * side is allowed from anywhere: a kick from the wrong side is the divergence until LATER 362c reads those records.
 */
export const KICK_SIDE_PLACEHOLDER = 'allow' as const;

/**
 * LATER 362 (research 92 section 6; the original's rule, its input an adaptation): the action button's pressure chased
 * one frame of `dt` -- `FUN_00594cf0` (D:L453194-453203) moves the controller's `+0x120` toward the pad's pressure at
 * `THROW_POWER_RISE` (3) a second rising and `THROW_POWER_FALL` (1.5) falling (`DAT_006505e0`, `DAT_006505d8`: the
 * grenade power's rates, research 85 section 2). A browser's button is on or off: `held` stands in for the full press
 * (pressure 1), as Triangle's hold does (`./gamepad` 'stance'). `dt` is one game frame (`GAME_FRAME_DT`: the
 * update runs once a game frame; ACT.R8, a timed hold takes the original's real time, never less) --
 * `./traversalPage` `chaseAction` steps it so: 8 frames held (0.267 s) and the release's frame kick, 7 do not.
 */
export function chaseActionPress(v: number, held: boolean, dt: number): number {
  const p = held ? 1 : 0;
  const f = dt * (p <= v ? THROW_POWER_FALL : THROW_POWER_RISE);
  return v * (1 - f) + p * f;
}

/**
 * LATER 362: the animation `FUN_002b44e0` runs for a use with the chased `press` -- `FUN_005ec4e0` (D:L500521-500567):
 * 1, the record's second (the kick), when it holds two (+8 >= 2), it is a door (+0x24 == 0: every `DoorSpec`), the
 * press is at least `KICK_PRESS` and the side allows it (`KICK_SIDE_PLACEHOLDER`); else 0, the first. (The controller's
 * own gate, its `vtbl+0x2c`, is the prompt's: a player's answers.)
 */
// (LATER 362b's review F1: `spec.programs` is the record's +8 -- the loader appends only the animations the map's
// `MZANIM.ZAR` holds, D:L157381-157400 -- so Chain Reaction's doors, whose kicks are missing, count one.)
export function doorPick(spec: DoorSpec, press: number): 0 | 1 {
  return spec.programs.length >= 2 && press >= KICK_PRESS && KICK_SIDE_PLACEHOLDER === 'allow' ? 1 : 0;
}

/**
 * The clip a pushed door type plays, or null for a type that is not a door's. `animset.rdr` maps `Open door` to
 * `seal_open_door` in `GLOBAL`, which the Seal anim set includes (`READERC.ZAR`; `motion.rdr` playback 0.8 s,
 * `NoInterrupt` 0.5; 14 keys in `MOTION_P.ZAR`), and no set names a `Pistol open door`, so the pistol in the hand plays
 * the same clip (`FUN_0058c820`'s pair swap finds no pistol type in the set, as the crouched throws' do: research 85
 * section 8.1); the type is no registered pair anyway (`FUN_005e1cf0`).
 */
export function openDoorClip(type: number, pistol: boolean): string | null {
  if (type === OPEN_DOOR_TYPE) return 'seal_open_door';
  // LATER 362: the kick -- `Kick open door` -> `seal_kickopendoor`; the set holds `Pistol kick open door`
  // (-> `seal_p_kickopendoor`), so with the pistol in the hand the pair swap plays it (`FUN_0058c820`, research 85 s8.1).
  if (type === KICK_DOOR_TYPE_READING) return pistol ? 'seal_p_kickopendoor' : 'seal_kickopendoor';
  return null;
}

/**
 * The door's clips, for the clip lists that load them where they play (#485's browser check, 2026-10-24: without them the
 * own body drew nothing and no window was sized): the room's (`./simMap` `SIM_CLIPS`: the window from the clip's keys and
 * `motion.rdr` row, `Room.doorMotion`) and both pages' (`./main`'s and `./matchMount`'s asks of the worker: the pose's keys,
 * `./remotePlayers` `flinchPose`).
 */
export const DOOR_CLIPS: readonly string[] = [
  openDoorClip(OPEN_DOOR_TYPE, false)!, openDoorClip(KICK_DOOR_TYPE_READING, false)!, openDoorClip(KICK_DOOR_TYPE_READING, true)!,
];

/**
 * DOOR_MOVE_ORDER_READING (research 92 section 7): the door program's `ai::MOVE` (set 2 command 16; research 214 section
 * 9's handler read) orders the presser to the point 18 units from the door's node toward it, facing the node, through the
 * actor's navigation goal (`FUN_0056daa0` / `FUN_0056d920` on the object at actor `+0xc0`, D:L488972-488977). Whether a
 * pad-controlled SEAL obeys that goal -- or only an AI's controller reads it -- is not read; the port moves no body for it.
 * Nor its timing: the MOVE's begin sets its `blocking` bit from whether that `+0xc0` object answers (D:L488983-488989),
 * and a blocking MOVE's tick waits while the object's `+0x3f4` is 5 (D:L488702-488714) -- so where a pad-controlled SEAL
 * has such an object, the MOVE holds the ANIMATE and the swing until it has walked there; the port's MOVE takes no time.
 * Settles both: a capture of the original's SEAL pressed at a door from off its axis.
 */
export const DOOR_MOVE_ORDER_READING = 'not run' as const;

/**
 * A use's run on `spec`'s door, in seconds, from its own program (research 92 section 2): the `ai::ANIMATE` head -- its
 * pre-wait, the push's game frame and its post-wait, each counted in whole game frames (`GAME_FRAME_DT`, as `DoorSet`'s
 * runner steps it) -- then the swing (`OBJECT_MOTION_FROM_TO`'s seconds). Frostfire's: 9 frames (0.300 s) and 0.7 s. A
 * close's sound follows its swing on the next step. Null for a program with no swing; a program with no ANIMATE (one
 * read before #485) is its swing alone.
 */
export function useSeconds(spec: DoorSpec): number | null {
  const ops = spec.programs[0]?.sequences.flatMap((s) => s.ops) ?? [];
  const swing = ops.find((o) => o.op === 'fromTo'), head = ops.find((o) => o.op === 'aiAnimate');
  if (swing?.op !== 'fromTo') return null;
  const frames = (s: number): number => Math.ceil(s / GAME_FRAME_DT - 1e-9);
  const lead = head?.op === 'aiAnimate' ? (frames(head.prewait) + 1 + frames(head.postwait)) * GAME_FRAME_DT : 0;
  return lead + swing.seconds;
}

export class DoorSet {
  private readonly doors: Door[];
  private readonly valves = new Map<string, number>();

  /**
   * `ground` is the hull the doors' polygons live in (the one the movers' grids read: its `points` are rewritten in
   * place), or null for a set that only draws (a page following a server keeps its own hull, so it passes it too).
   */
  constructor(readonly specs: readonly DoorSpec[], ground: GroundData | null, private readonly hooks: DoorHooks = {}) {
    // Each polygon's points are a view on the packed hull (`groundPolygons`): where it starts is its offset there.
    const polys = ground ? groundPolygons(ground) : [];
    const base = ground ? ground.points.byteOffset : 0;
    this.doors = specs.map((spec) => {
      const world0 = mul4(spec.local, spec.parent);
      const rest: Door['rest'] = [];
      for (const o of spec.owners) {
        const owner = ground?.owners[o];
        if (!owner) continue;
        for (const p of polys.slice(owner.first, owner.first + owner.count)) {
          rest.push({ offset: (p.points.byteOffset - base) / 4, points: Float32Array.from(p.points) });
        }
      }
      return { spec, q: quatOfMatrix(spec.local), world0, inv0: invertAffine(world0), rest, run: null, swing: null, quiet: false, seen: null, actor: 'self' };
    });
    this.hull = ground?.points ?? null;
  }

  private readonly hull: Float32Array | null;

  get count(): number {
    return this.doors.length;
  }

  /** A door's valve now. */
  valve(i: number): number {
    const d = this.doors[i];
    return d ? this.valves.get(d.spec.valve) ?? 0 : 0;
  }

  /** Open (its valve set and not locked), and whether an animation of it is still running. */
  state(i: number): { open: boolean; busy: boolean; valve: number } {
    const v = this.valve(i), d = this.doors[i];
    return { open: v !== 0 && v !== VALVE_LOCKED, busy: !!d?.run && !d.run.finished, valve: v };
  }

  /**
   * The action on door `i` (`FUN_002b44e0`): refused while its last animation runs, or when locked; else the animation
   * `pick` names starts -- 0 the first, 1 the second, the kick (`doorPick`, `FUN_005ec4e0`; LATER 362), the first when
   * the record holds no second. True when it started. `from` (the SEAL's feet) is kept for the kick's side (LATER 362c).
   * `actor` is who pressed (`DoorActor`): the program's `ai::ANIMATE` names it to `DoorHooks.animate`.
   */
  use(i: number, from: readonly number[] | null = null, actor: DoorActor = 'self', pick: 0 | 1 = 0): boolean {
    void from;
    const d = this.doors[i];
    if (!d || this.state(i).busy || this.valve(i) === VALVE_LOCKED) return false;
    const program = d.spec.programs[pick] ?? d.spec.programs[0];
    if (!program) return false;
    d.actor = actor;
    d.run = new EffectRun(program, this.host(d), d);
    d.run.update(0);                                              // the timeless head runs now, as the game's first tick
    return true;
  }

  /**
   * LATER 362: the room's pick for door `i`'s use (`doorUse`, the network's bookkeeping: the snapshot's door carries no
   * pick), for the swing this page next follows off the wire (`applyWire`).
   */
  followPick(i: number, pick: 0 | 1): void {
    const d = this.doors[i];
    if (d) d.pick = pick;
  }

  /**
   * P7 (`DOOR_PREDICT_ADAPTATION`): the page's own press on door `i`, sent to the room as a `door` event naming command
   * `seq`, run here at once as `use` runs it -- its actor `'wire'`, the room's `motion` event carrying the presser's clip
   * -- and held until the room's snapshot settles it (`applyWire`). False when `use` refuses it, or a press of this door
   * is still waiting for the room's word (that one is sent and followed off the wire, unpredicted).
   */
  predict(i: number, from: readonly number[] | null, pick: 0 | 1, seq: number): boolean {
    const d = this.doors[i];
    if (!d || d.predicted) return false;
    d.predicted = { seq, valve: this.valve(i), q: d.q, pick, valves: new Map() };
    if (this.use(i, from, 'wire', pick)) return true;
    d.predicted = undefined;
    return false;
  }

  /** Whether door `i` holds a press of the page's own the room has not settled yet (`predict`). */
  pending(i: number): boolean {
    return !!this.doors[i]?.predicted;
  }

  /** P7: a predicted press the room refused, put back as it stood before it -- at once and silently. */
  private unpredict(d: Door): void {
    const p = d.predicted;
    if (!p) return;
    d.predicted = undefined;
    d.run = null; d.swing = null; d.quiet = false;
    for (const [name, v] of p.valves) this.valves.set(name, v);
    this.pose(d, p.q);
  }

  /** One step of every running door animation, `dt` seconds. */
  step(dt: number): void {
    for (const d of this.doors) {
      if (!d.run || d.run.finished) { d.run = null; continue; }
      d.run.update(dt);
      if (d.run.finished) { d.run = null; d.swing = null; d.quiet = false; }
    }
  }

  /**
   * The round's start (ruling PF.R10; DOOR_ROUND_RESET_READING): every valve 0, every running animation cut off, each
   * leaf back at its disc rotation and at rest -- at once and silently (no swing, no sound), the leaf's polygons and its
   * drawing with it (`moved`) -- and the server's last word forgotten (`seen`).
   */
  reset(): void {
    this.valves.clear();
    for (const d of this.doors) {
      d.run = null; d.swing = null; d.quiet = false; d.seen = null; d.queued = false; d.predicted = undefined;
      this.pose(d, quatOfMatrix(d.spec.local));
    }
  }

  /** Every door for the snapshot (`DoorWire`): its valve and its swing's phase. */
  wire(): DoorWire[] {
    return this.doors.map((d, i) => {
      const s = d.swing;
      // Running, before its swing (a wait, a sound first) it reads 0; at rest, `PHASE_REST`.
      const phase = !d.run ? PHASE_REST : s ? Math.min(PHASE_REST - 1, Math.floor((s.t / Math.max(s.seconds, 1e-6)) * PHASE_REST)) : 0;
      return { valve: Math.min(255, Math.max(0, this.valve(i))), phase };
    });
  }

  /**
   * A server's doors (`Snapshot.doors`): a door whose valve the server has changed swings here too -- its animation run
   * from this side's state, caught up to the server's phase (silently when the server's swing is already over).
   * `acked` is the last command of this page's the room had run as of that snapshot (`NetClient.acked`), null when the
   * snapshot holds no own body (a dead seat's), undefined when not known: with it, a press predicted here (`predict`) is
   * settled -- the room's swing taken as this run, or a refusal put back.
   */
  applyWire(wire: readonly DoorWire[] | undefined, acked?: number | null): void {
    if (!wire) return;
    wire.forEach((w, i) => {
      const d = this.doors[i];
      if (!d) return;
      const seen = d.seen;
      d.seen = { ...w };
      // A swing the server began since the last snapshot (its phase left rest, or started over): run it here too,
      // caught up to the server's phase, heard.
      const began = w.phase < PHASE_REST && (!seen || seen.phase === PHASE_REST || w.phase < seen.phase);
      const p = d.predicted;
      if (p) {
        // P7 (`DOOR_PREDICT_ADAPTATION`): the room took the press -- its swing begun, or already over on another valve:
        // that swing is the one running here (or run), never run again; its pick (`doorUse`) is this run's.
        // The review's F2: a swing the room told with another pick than this press's is another's press (this one
        // refused busy): run back, and that swing followed below with the room's pick -- an open and a kick turn a
        // leaf different ways (MP83's hq_door1, research 92 section 6).
        const taken = began || (w.phase === PHASE_REST && w.valve !== p.valve);
        if (taken && d.pick !== undefined && d.pick !== p.pick) {
          this.unpredict(d);
        } else if (taken) {
          d.predicted = undefined; d.pick = undefined; d.queued = false;
          if (d.run || w.phase < PHASE_REST) return;
          // Over on both sides: a valve still unlike the room's is run out at rest below, as any.
        } else if (w.phase === PHASE_REST && (acked === null || (acked !== undefined && acked > p.seq))) {
          // The room has run a command past the press's -- it had the `door` event, sent after that command and before
          // the next -- and the door is at rest on its old valve: refused (out of reach, mid-swing there, an action
          // gate). Or (the review's F1) the snapshot holds no own body: the seat is dead in the room, which refuses a
          // dead presser's door (`Room.useDoor`) and acks nothing until the next life. Put back silently.
          this.unpredict(d);
          return;
        } else {
          return;                                                  // not decided yet: the prediction stands
        }
      }
      if (w.phase === PHASE_REST) d.queued = false;
      if (d.run) {
        // BOT-DOOR (game 2755): one begun while this side still runs the last -- a CPU's press the tick a player's close
        // ended, this side a few ticks behind -- waits for that run's end. Taken as followed, it was lost until the
        // server's rest: the page's leaf shut where the room's had swung open (`doorWireFollow.test.ts`).
        if (began) d.queued = true;
        return;
      }
      if (began || (d.queued && w.phase < PHASE_REST)) {
        d.queued = false;
        const pick = d.pick ?? 0;                                  // LATER 362: the room's pick, when told (`followPick`)
        d.pick = undefined;
        if (!this.use(i, null, 'wire', pick)) return;
        if (w.phase > 0) {
          // The server's swing is under way: through the program's head -- the ANIMATE's push and 0.25 s wait, the
          // valve, the open's sound -- to the swing, heard, then to the server's phase.
          const run = this.doors[i]!.run;                         // the run `use` just made (`d.run` reads as null above)
          for (let k = 0; k < 600 && run && !run.finished && !d.swing; k++) run.update(1 / 60);
          const seconds = d.swing?.seconds ?? 0;
          if (seconds > 0) { const s = d.swing!; s.t += (w.phase / PHASE_REST) * seconds - 1 / 60; }
        }
        return;
      }
      // At rest on the server with another valve (a join mid-round, a lost swing): run it out now, silently.
      if (w.phase === PHASE_REST && this.valve(i) !== w.valve) {
        d.quiet = true;                                            // before the use: its head plays the sound at once
        const pick = d.pick ?? 0;                                  // P7's F2: the room's pick, when told (`followPick`)
        d.pick = undefined;
        if (!this.use(i, null, 'wire', pick)) { d.quiet = false; return; }
        for (let k = 0; k < 1200 && d.run; k++) this.step(1 / 60);
        d.quiet = false;
      }
    });
  }

  /** The door whose polygons `owner` is among, or -1 (`pickDoor`). */
  doorOf(ownerPath: string): number {
    return this.doors.findIndex((d) => under(ownerPath, d.spec.path));
  }

  /** The leaf's polygons as they stand now, world space (for a reach test with no grid). */
  leaf(i: number): Float32Array[] {
    const d = this.doors[i];
    if (!d) return [];
    const m = this.delta(d);
    return d.rest.map((r) => {
      const out = new Float32Array(r.points.length);
      for (let k = 0; k < r.points.length; k += 3) out.set(apply4(m, r.points[k]!, r.points[k + 1]!, r.points[k + 2]!), k);
      return out;
    });
  }

  /** `inv(W0) W`: the leaf's move from rest to now, row-major. */
  private delta(d: Door): Float32Array {
    return mul4(d.inv0, mul4(matrixOfQuat(d.q, d.spec.local), d.spec.parent));
  }

  /** The node at rotation `q`: its polygons rewritten in the hull, and the page told. */
  private pose(d: Door, q: Quat): void {
    d.q = q;
    const m = this.delta(d);
    if (this.hull) {
      for (const r of d.rest) {
        for (let k = 0; k < r.points.length; k += 3) this.hull.set(apply4(m, r.points[k]!, r.points[k + 1]!, r.points[k + 2]!), r.offset + k);
      }
    }
    // A row-major row-vector matrix is, float for float, three's column-major column-vector one (`toColumnMajor`).
    this.hooks.moved?.(d.spec, m);
  }

  private host(d: Door): EffectHost {
    const nodeIs = (run: EffectRun, node: number): boolean => {
      if (node === NODE_CALLER || node === NODE_ROOT) return true;
      const name = run.program.nodes[node];
      return name !== undefined && name.toLowerCase() === d.spec.node.toLowerCase();
    };
    /** A `VALVE` command's valve: the context's (flag bit 0: the door's own, `FUN_00272bb0`'s type 4), or the one named. */
    const valveName = (v: { valve: string; context?: true }): string => (v.context ? d.spec.valve : v.valve);
    const where = (): [number, number, number] => apply4(mul4(matrixOfQuat(d.q, d.spec.local), d.spec.parent), 0, 0, 0);
    return {
      random: () => 0.5,
      test: (c: EffectCondition): boolean => (c.kind === 'valve' ? valveTest(this.valves.get(valveName(c)) ?? 0, c.operation, c.operand) : false),
      begin: (op: EffectOp, run: EffectRun): OpTick | void => {
        switch (op.op) {
          case 'valve': {
            const name = valveName(op);
            if (d.predicted && !d.predicted.valves.has(name)) d.predicted.valves.set(name, this.valves.get(name) ?? 0);   // P7: for the run back
            this.valves.set(name, valveApply(this.valves.get(name) ?? 0, op.operation, op.operand));
            return;
          }
          case 'sound':
            // Only a new play starts a voice (flag 0x80, no 0x400/0x800: FUN_002659c0 112365, 112460-112486).
            if (!d.quiet && op.newPlay !== false) this.hooks.sound?.(op.sound, where(), op.volume);
            return;
          case 'rotate': {
            if (!nodeIs(run, op.node)) return;
            // `FUN_00263730`: the euler angles (radians, applied y, x, z) set (flag 1) or added (flag 2) [reading].
            const e = eulerQuat(op.xyz);
            if (op.flags & 1) this.pose(d, e);
            else if (op.flags & 2) this.pose(d, quatMul(d.q, e));
            return;
          }
          case 'fromTo': {
            const rot = op.rotation;
            if (!rot || !nodeIs(run, op.node)) return;
            // `FUN_0025fe70`: from the node's rotation now (the command's own with 0x20, unless flag 1); to the command's
            // or, with flag 1, the command's turn after the start (`FUN_003070c0(+0x20, +0x10)`); `FUN_0025f9b0`: slerp
            // by the time over +0x34, the end set exactly. Frostfire's doors: flags 0x61, 100 degrees about y in 0.7 s.
            const from: Quat = (op.flags & 1) === 0 && (op.flags & 0x20) !== 0 ? rot.from : d.q;
            const to: Quat = op.flags & 1 ? quatMul(rot.to, from) : rot.to;
            const seconds = op.seconds;
            d.swing = { seconds, t: 0 };
            this.pose(d, from);
            return (dt: number): boolean => {
              const s = d.swing ?? { seconds, t: 0 };
              s.t += dt;
              const done = seconds <= 0 || s.t >= seconds;
              this.pose(d, done ? to : quatSlerp(from, to, s.t / seconds));
              return done;                                        // `d.swing` stays, at its end, until the run is over
            };
          }
          case 'aiAnimate': {
            // `FUN_005d2f30` (D:L487009-487284): phase 0 counts the pre-wait, phase 1 pushes the type on the actor
            // (`FUN_00588bc0`, D:L487256-487260) -- unless the actor's top motion is already it, which a door's presser
            // never has (the use is refused mid-swing) -- then phase 3 counts the post-wait; each phase takes the whole
            // game frame (`*dt = 0`, D:L487280), and the command ends when the post-wait is at or under 0 (not blocking:
            // the clip's length is not waited for). The sequence's VALVE, SOUND and swing follow. `blocking` (phase 4,
            // the clip's end) is on no disc program read (research 214 section 9, research 92 section 2) and is taken
            // as the post-wait's end here. The frame is the game's (`GAME_FRAME_DT`, ruling PF.R8: a per-frame
            // discretisation steps at the game frame), whatever `dt` the page or the room steps the door with: the
            // head's timeless tick spends phase 0 on a 0 pre-wait (the game's first tick, `use`), the push comes at
            // the first whole frame after it and the valve at the ninth (0.25 s is 7.5 frames: 8 counted), 0.300 s.
            let phase = 0, left = op.prewait, acc = 0;
            const EPS = 1e-9;                                        // the runner's own slack on a wait (`waitLeft`)
            return (dt: number): boolean => {
              if (phase === 0 && left <= EPS) { phase = 1; return false; }
              acc += dt;
              while (acc >= GAME_FRAME_DT - EPS) {
                acc -= GAME_FRAME_DT;
                if (phase === 0) { left -= GAME_FRAME_DT; if (left <= EPS) phase = 1; continue; }
                if (phase === 1) { this.hooks.animate?.(d.spec, op.type, d.actor); left = op.postwait; phase = 3; continue; }
                left -= GAME_FRAME_DT;
                if (left <= EPS) return true;
              }
              return false;
            };
          }
          // DF-4 (`DOOR_CALL_READING`): the call into the map set, handed to the world's holder.
          case 'call': this.hooks.call?.(d.spec, op.anim); return;
          default: return;
        }
      },
    };
  }
}

/**
 * DOOR_CALL_READING (DF-4; research 175 s5.1, 239 s1.2; research 92): a door program's `CALL_ANIMATION` runs the map
 * set's animation of the name on the map's world, as any program's call does -- the original has one handler for command
 * 45 whoever runs it (`FUN_0025bc20` D:L106909 registers `FUN_0025d5c0` in the one table, 0x414bb0), and the door's
 * program is an animation of the map set started with the door's node and valve as its context (`FUN_002b44e0` ->
 * `FUN_00272bb0`, research 92 s2). The handler names the callee in the running animation's own names (`FUN_0026e650`,
 * D:L107575) and, with no context flag set (MP6's two calls carry flags 0: Seq_Data +404 / +724 bytes 4-5), starts it
 * with no context (`FUN_002734b0(anim, 0)`, D:L107763-107765), so its references resolve on their own (search 3:
 * `nohostagerescue` / `okhostagerescue`). The port's door host hands the call to its `call` hook and the holder of the
 * world runs it (`WorldState.doorCall`): the room's world, authoritative, its flags on the `EnvWire`; the page's world
 * follows the wire. MP6's opening state is both bar sets active: neither reference carries bit 31 and `cdoor1`'s
 * autostart (flags 0x21) sets only its valve -- read off MP6's `MZANIM.ZAR`. [reading: the original's own network path
 * for the called animation (each console running the door's program from the logged use, `FUN_002bb5b0`) is not traced;
 * the room's state on the wire stands in for it, as for every world node (MAP-03).]
 */
export const DOOR_CALL_READING = 'mapSetOnWorld' as const;

/** Euler angles (radians) as the engine's node rotation takes them, y then x then z [reading, as `./effects` reads it]. */
function eulerQuat([x, y, z]: readonly [number, number, number]): Quat {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  // YXZ: q = qy qx qz (three's `Euler` order 'YXZ').
  return quatMul(quatMul([0, sy, 0, cy], [sx, 0, 0, cx]), [0, 0, sz, cz]);
}

/**
 * Units along the view within which a door's polygon ties with the nearest hit (`pickDoor`) [reading: a leaf flush with
 * its frame's wall meets the view at the same point as the wall's edge -- Frostfire's `wdoor_2` and `warehouse/wintdi`
 * both at 20.0 along -- so the tie goes to the door; the reticle pick's own tie rule is not traced (research 92 section 7)].
 */
export const PICK_TIE_READING = 0.05;

/**
 * The door the reticle is on (`FUN_005aa240`, and `FUN_002b46f0`'s gate: none while it swings or when locked): the
 * first polygon along the view from `eye` to `far` -- the movement's
 * skip surfaces (bit 18) passed over [reading: the reticle pick's own surface test is not traced] -- belongs to a door,
 * and `feet` is within the door's `range` of that point on the ground plane (`dx^2 + dz^2 < range^2`) and, when the
 * door has one, inside its `elevation` in height. The door's index, or null.
 */
export function pickDoor(doors: DoorSet, grid: Grid, eye: readonly number[], far: readonly number[], feet: readonly number[]): number | null {
  if (doors.count === 0) return null;
  // No door's swing within its range of the feet: no pick can take one, and the view's segment is not cast.
  const near = doors.specs.some((d) => {
    const s = d.sweep, r = d.range;
    return feet[0]! >= s.minX - r && feet[0]! <= s.maxX + r && feet[2]! >= s.minZ - r && feet[2]! <= s.maxZ + r;
  });
  if (!near) return null;
  const hits = segmentHits(grid, [eye[0]!, eye[1]!, eye[2]!], [far[0]!, far[1]!, far[2]!], (p) => (surfaceWord(p) & SURFACE_SKIP) === 0);
  const first = hits[0];
  if (!first) return null;
  // A leaf flush with its frame's wall meets the view at the same point as the wall's edge (Frostfire's wdoor_2 and
  // `warehouse/wintdi`, both at 20.0 along): a tie within `PICK_TIE_READING` units goes to the door.
  const length = Math.hypot(far[0]! - eye[0]!, far[1]! - eye[1]!, far[2]! - eye[2]!);
  const hit = hits.find((h) => (h.t - first.t) * length <= PICK_TIE_READING && doors.doorOf(h.owner.path) >= 0);
  if (!hit) return null;
  const i = doors.doorOf(hit.owner.path);
  // `FUN_002b46f0`: offered only with no animation of it running and the valve not locked.
  if (doors.state(i).busy || doors.valve(i) === VALVE_LOCKED) return null;
  const spec = doors.specs[i]!;
  const dx = hit.point[0] - feet[0]!, dy = hit.point[1] - feet[1]!, dz = hit.point[2] - feet[2]!;
  if (dx * dx + dz * dz >= spec.range * spec.range) return null;
  if (spec.elevation !== -1 && spec.elevation * spec.elevation <= dy * dy) return null;
  return i;
}

/**
 * The server's reach check on a client's `door` event: the player's feet within the door's range (and elevation) of
 * the nearest point of its leaf as it stands, with `slack` for the pick's point and the view the server does not see.
 */
export function doorInReach(doors: DoorSet, i: number, feet: readonly number[], slack = 8): boolean {
  const spec = doors.specs[i];
  if (!spec) return false;
  let best = Infinity, bestDy = Infinity;
  for (const pts of doors.leaf(i)) {
    for (let k = 0; k < pts.length; k += 3) {
      const d = Math.hypot(pts[k]! - feet[0]!, pts[k + 2]! - feet[2]!);
      if (d < best) { best = d; bestDy = Math.abs(pts[k + 1]! - feet[1]!); }
    }
  }
  if (!Number.isFinite(best)) {                                   // no hull on this side: the node's origin
    const o = apply4(mul4(spec.local, spec.parent), 0, 0, 0);
    best = Math.hypot(o[0] - feet[0]!, o[2] - feet[2]!);
    bestDy = Math.abs(o[1] - feet[1]!);
  }
  return best <= spec.range + slack && (spec.elevation === -1 || bestDy <= spec.elevation + slack);
}
