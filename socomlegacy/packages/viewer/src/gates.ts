import { Zar, zdbMember, type ZdbEntry } from '@s2u/archive';
import {
  decodeEffectProgram, flattenScene, parseAnimSets,
  type CollisionOwner, type EffectCondition, type EffectOp, type EffectProgram, type Footprint, type SceneNode,
} from '@s2u/scene';
import { apply4, invertAffine, mul4 } from './doorMath';
import { PHASE_REST, valveApply, valveTest } from './doors';
import { EffectRun, type EffectHost, type OpTick } from './effectRunner';
import { ACTION_TYPE_CODES, readMapActions } from './mapActions';
import { under } from './mapMeta';
import { groundPolygons, type GroundData } from './mover';
import { TICK_HZ, type DoorWire } from './net/protocol';

/**
 * Death Trap's and Enowapi's lever gates (MAP-07; socomlegacy/docs/research/175 §5.3, 174 §5). They are SWITCH records in
 * `actions.rdr`, not DOOR records, and the leaf translates: `OBJECT_MOTION_FROM_TO` flags 9 (research 95 §1.5) moves
 * `gate_moveN` by the open sequence's target over 3 s. Death Trap's two levers are independent and the target is
 * (-20, 0, 0) in the parent's coordinates. A disc re-check measured that travel as exactly (-0.04, 0, -20), world -Z,
 * so the parent's X is world +Z and the sign stays the disc's delta. Enowapi's (0, +35, 0) uses the same translation
 * and rises. Enowapi's `epanel_di2` and `epanel_di3` share `access2/gate_move2`. The program waits 0.24 s,
 * then calls `gateopen` or `gateclose` only while `set_accessN` is 0, so a destroyed gate does not get a later pull's
 * slide. A pull while the lever's program still runs -- its 0.24 s lead-in and the 3 s slide it calls -- is refused,
 * as every action is while its animation runs (`FUN_002b44e0` D:L156787; the called sequence is part of the run,
 * research 89 §12); the other lever on a shared leaf is `GATE_SHARED_LEAF_OVERLAP_PLACEHOLDER`'s. The lever handle's
 * own turn and the program's sounds are not presented on the page (LATER 307).
 *
 * The room runs the program (`GateSet.use` from the action). The page does not: it has no `set_accessN`, so re-running
 * the program would open a gate the server had already destroyed. The snapshot's door tail carries the pose
 * (`applyWire`, `GATE_WIRE_FOLLOW_ADAPTATION`); the page's own pull is predicted as a pose (`predict`,
 * `GATE_PREDICT_ADAPTATION`). Chain Reaction's crane (`translate_hook`, #337) is not a gate.
 */

/**
 * MAP-07 (research 174 §5.1): Enowapi's `epanel_di2` and `epanel_di3` are two action records on one leaf
 * (`access2/gate_move2`), each with its own animation instance, so the original's busy test (`FUN_002b44e0`
 * D:L156787) does not stop di3 while di2's slide runs. What a second translation does to a node already carrying one
 * (`FUN_0025fe70` / `FUN_0025f9b0`: replace, add or queue) is not read; `gate_openclose2` writes both valves, so di3
 * mid-slide would run `gateclose`, -35 from wherever the leaf is. The port keeps one run per leaf and refuses the
 * other lever while it runs (true). Settled by those two functions read for a node with a motion already on it, or a
 * capture of MP62 with di2 and di3 pulled about a second apart.
 */
export const GATE_SHARED_LEAF_OVERLAP_PLACEHOLDER = true;

/**
 * MAP-07, a network adaptation (no original: each console runs the lever's program itself): the page draws the room's
 * pose from the snapshot's door tail (`DoorWire.phase`, the travel in 1/254ths) and, once a slide is showing, chases a
 * later pose at the slide's own speed (`|open| / seconds`) instead of jumping to it; a join and the first sample after
 * a settled end snap. The doors' catch-up is the precedent (`DoorSet.applyWire`).
 */
export const GATE_WIRE_FOLLOW_ADAPTATION = 'the page chases the room\'s pose at the slide\'s speed; a join and a rest snap';

/**
 * GATE_PREDICT_ADAPTATION (P8, the online-parity sweep's DMA-3; research 174 s5.1, 213 s4; a network adaptation beside
 * GATE_WIRE_FOLLOW_ADAPTATION): a lever is a SWITCH, and the original runs a switch's use on the pressing console
 * (`FUN_00592d50`'s 0x2000 branch -> `FUN_002b44e0`, `SWITCH_PREDICT_ADAPTATION`), so its presser's leaf moves at the
 * pull's own lead-in. The page still runs no program (no `set_accessN`); it predicts the pose (`GateSet.predict`, from
 * `GatePage.press`): from a leaf at rest at an end, the other end, chased at the slide's own speed once the lever's own
 * lead-in has passed -- that lead-in read off the lever's program by a dry run from the round's start (`leadIns`: the
 * time to its first slide of the leaf, then from where that run left the valves, to the next: the open's and the
 * close's). The room's word settles it: a slide on the wire toward that end is this pull's (the leaf keeps its chase,
 * never pulled back to the room's later pose), the leaf at rest at that end ends it; a slide the other way is another's,
 * followed; at rest on the old end once the room's tick (`NetClient.heardTick`, the snapshot's) is more than the lead-in
 * in ticks (`TICK_HZ`) past the tick of the first snapshot whose ack passed the press's command (the room decided the
 * press by then, and its own lead-in would have shown its slide since), or with no own body (a dead seat's), is a
 * refusal -- the leaf put back at once and silently (the page plays no gate sound, LATER 307). Measured on the room's
 * ticks, not its acks (the P8 review's F1): after a stall the room runs up to `CREDIT_MAX` (60) of a seat's commands in
 * one tick, so the ack can pass the press and its lead-in while the lever's program has run one tick. With no tick known
 * only a dead seat's word settles a refusal. No original: the original has no refusal to run back. Its costs: a pull
 * the room takes on a destroyed gate (`set_accessN` set: no slide there) is shown sliding until that word; a leaf
 * mid-slide on the wire (or chasing) is not predicted -- the press is sent and followed; and (the P8 review's F3) the
 * predicted leaf moves its polygons in the page's own walk hull ahead of the room's, so on a refusal the hull snaps shut
 * where the leaf stood -- onto a body that walked into the opening meanwhile, which the walk then resolves as DOOR-PIN's
 * disagreement does (research 92 s7, `DOOR_PREDICT_ADAPTATION`) -- for as long as the misprediction lasted.
 */
export const GATE_PREDICT_ADAPTATION = 'pose from rest, after the lever\'s lead-in, settled by the room\'s word';

/** One lever on a gate: its index in `MapMeta.actions`, the panel, the valve the program flips, and that program. */
export interface GateLeverSpec {
  action: number;
  node: string;
  path: string;
  valve: string;
  program: EffectProgram;
}

/** One translating leaf (`gate_moveN`) and every lever that drives it. */
export interface GateSpec {
  /** Its place among the map's gates: its number on the snapshot's door tail. */
  index: number;
  /** The scene node that slides, and its path (`WorldView.moveNode`). */
  node: string;
  path: string;
  /** The node's matrix at rest (row-major) and its parent's world matrix. */
  local: number[];
  parent: number[];
  /** Indices into the hull's owners: the polygons that slide with it. */
  owners: number[];
  /** The ground-plane box of the leaf at rest and at the open end. */
  sweep: Footprint;
  /** `gateopen`'s parent-space delta. `gateclose` is this negated (the program's relative target). */
  open: [number, number, number];
  /** The slide's seconds (`OBJECT_MOTION_FROM_TO` +0x34). */
  seconds: number;
  levers: GateLeverSpec[];
}

/** What the page lends a gate: the leaf drawn where it is now (a column-major delta). */
export interface GateHooks {
  sound?(name: string, at: [number, number, number], volume: number): void;
  moved?(gate: GateSpec, delta: Float32Array): void;
  /**
   * The leaf has begun to shut (`use`: a pull whose slide runs toward shut) or a round reset shut it (`reset`).
   * Nothing else moves a resting leaf (research 174 §5: no auto-close).
   */
  closing?(gate: GateSpec, why: 'use' | 'reset'): void;
}

/**
 * MAP-07: the translating gate leaf. Chain Reaction's `translate_hook` is not one (research 176, #337).
 */
export function isGateLeaf(name: string): boolean {
  return /^gate_move\d*$/i.test(name);
}

interface Swing {
  seconds: number;
  t: number;
  from: [number, number, number];
  to: [number, number, number];
}

/** The page chasing a snapshot pose. The target is that pose, not the end of the slide. */
interface Follow {
  to: [number, number, number];
}

/** P8 (`GATE_PREDICT_ADAPTATION`): the page's own pull, predicted as a pose until the room's word. */
interface GatePrediction {
  /** The command the press named (the `action` event's `seq`). */
  seq: number;
  /** The offset before the press, for the run back; the end chased; that end on the wire (1 open, 0 shut). */
  from: [number, number, number];
  to: [number, number, number];
  valve: 0 | 1;
  /** Seconds of the lever's lead-in still to wait before the chase; and the whole lead-in in room ticks. */
  wait: number;
  leadTicks: number;
  /** The room's tick of the first snapshot whose ack passed `seq` (the press decided by then); null before it. */
  ackTick: number | null;
  /** The room's slide toward `to` has shown: this pull's (or one the same way), never run back. */
  taken: boolean;
}

interface Gate {
  spec: GateSpec;
  /** The parent-space offset now. */
  offset: [number, number, number];
  world0: Float32Array;
  inv0: Float32Array;
  rest: { offset: number; points: Float32Array }[];
  /** The lever whose program is running (its valve is the animation's context). */
  lever: string;
  run: EffectRun | null;
  /** The lever whose program `run` is (its index in `MapMeta.actions`), -1 when none has run. */
  runAction: number;
  swing: Swing | null;
  /** The page's interpolation of a server wire. The room's set never sets it. */
  follow: Follow | null;
  seenPhase: number;
  seenValve: number;
  /** 1 toward the open end, -1 toward shut, 0 at rest or in the lead-in (the wire's `valve` while it slides). */
  heading: -1 | 0 | 1;
  /** P8: the page's own pull awaiting the room's word (`predict`). The room's set never sets it. */
  predicted: GatePrediction | null;
}

const v3 = (x: readonly number[]): [number, number, number] => [x[0]!, x[1]!, x[2]!];
const add3 = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const len3 = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const near = (a: readonly number[], b: readonly number[], e = 1e-3): boolean =>
  Math.abs(a[0]! - b[0]!) <= e && Math.abs(a[1]! - b[1]!) <= e && Math.abs(a[2]! - b[2]!) <= e;
const lerp3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
  [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
const sub3 = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot3 = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const scale3 = (a: readonly number[], k: number): [number, number, number] => [a[0]! * k, a[1]! * k, a[2]! * k];

/** 0 at shut, 1 at the open end, along `open` (Death Trap's open X is negative; the parameter is not the raw X). */
function alongOpen(offset: readonly number[], open: readonly number[]): number {
  const d = dot3(open, open);
  return d > 1e-8 ? dot3(offset, open) / d : 0;
}

/**
 * Where the leaf is, for the wire: 0 shut, `PHASE_REST - 1` fully along. `PHASE_REST` is a settled end, not a sample
 * of the slide — a close that starts at the open end must not be read as "snap shut".
 */
function phaseOf(along: number): number {
  const u = Math.min(1, Math.max(0, along));
  return Math.min(PHASE_REST - 1, Math.max(0, Math.round(u * (PHASE_REST - 1))));
}

/** The open slide in a gate program: the `gateopen` sequence's position target, else the only one. */
function gateSlideOf(program: EffectProgram): { node: string; open: [number, number, number]; seconds: number } | null {
  let fallback: { node: string; open: [number, number, number]; seconds: number } | null = null;
  for (const seq of program.sequences) {
    for (const op of seq.ops) {
      if (op.op !== 'fromTo' || !op.translation) continue;
      const name = program.nodes[op.node];
      if (!name || !isGateLeaf(name)) continue;
      // The position block (`@s2u/scene` `decodeEffectOp`): flag 1 relative (D:L109234-109244), `from` stored by flag 2.
      const tr = op.translation;
      const stored = tr.from;
      const open: [number, number, number] = (op.flags & 1) !== 0
        ? v3(tr.to)
        : [tr.to[0] - (stored ? stored[0] : 0), tr.to[1] - (stored ? stored[1] : 0), tr.to[2] - (stored ? stored[2] : 0)];
      const slide = { node: name, open, seconds: op.seconds };
      if (/open/i.test(seq.name)) return slide;
      fallback ??= slide;
    }
  }
  return fallback;
}

/**
 * P8 (`GATE_PREDICT_ADAPTATION`): a lever's lead-in before its program first slides the leaf -- from the round's start
 * (all valves 0, `set_accessN` read 0: the open), then from the valves that run left (the close) -- by a dry run of the
 * lever's program on a host that keeps only its valves and notes the leaf's first `OBJECT_MOTION_FROM_TO`, at the page's
 * frame (1/60 s). Null for a direction whose run never slides the leaf within 10 s. Cached per lever.
 */
const leadInCache = new WeakMap<GateLeverSpec, [number | null, number | null]>();
export function leadIns(spec: GateSpec, lever: GateLeverSpec): [number | null, number | null] {
  const cached = leadInCache.get(lever);
  if (cached) return cached;
  const valves = new Map<string, number>();
  const name = (v: { valve: string; context?: true }): string => (v.context ? lever.valve : v.valve);
  const once = (): number | null => {
    let t = 0, at: number | null = null;
    const host: EffectHost = {
      random: () => 0.5,
      test: (c: EffectCondition): boolean => (c.kind === 'valve' ? valveTest(valves.get(name(c)) ?? 0, c.operation, c.operand) : false),
      begin: (op: EffectOp, run: EffectRun): OpTick | void => {
        if (op.op === 'valve') { const n = name(op); valves.set(n, valveApply(valves.get(n) ?? 0, op.operation, op.operand)); return; }
        const node = op.op === 'fromTo' && op.translation ? run.program.nodes[op.node] : undefined;
        if (at === null && node !== undefined && node.toLowerCase() === spec.node.toLowerCase()) at = t;
      },
    };
    const run = new EffectRun(lever.program, host);
    run.update(0);
    for (let k = 0; k < 600 && !run.finished; k++) { t += 1 / 60; run.update(1 / 60); }
    return at;
  };
  const got: [number | null, number | null] = [once(), once()];
  leadInCache.set(lever, got);
  return got;
}

/** A parent-space delta as a world displacement (row-major, row vectors). */
function worldShift(parent: number[], delta: readonly [number, number, number]): [number, number, number] {
  const o = apply4(parent, 0, 0, 0);
  const m = apply4(parent, delta[0]!, delta[1]!, delta[2]!);
  return [m[0] - o[0], m[1] - o[1], m[2] - o[2]];
}

/**
 * The SWITCH actions whose program slides a `gate_move*` node, grouped by that node's path (Enowapi's two levers on
 * `gate_move2` are one gate). `owners` are the hull's; the gates mark theirs with `sweep` as they are found, so pack
 * the ground after this. Never throws. Action indices are `readMapActions`'s, which are `MapMeta.actions`.
 */
export function readGates(
  bytes: Uint8Array, toc: ZdbEntry[], stem: string, models: SceneNode[],
  owners: CollisionOwner[], polys: readonly { points: Float32Array }[],
): { gates: GateSpec[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const { actions } = readMapActions(bytes, toc, stem, models);
  if (actions.length === 0) return { gates: [], diagnostics };
  let programs = new Map<string, EffectProgram>();
  try {
    const archive = parseAnimSets(Zar.parse(zdbMember(bytes, toc, 'MZANIM.ZAR')));
    programs = new Map(archive.sets.flatMap((s) => s.anims).map((a) => [a.name.toLowerCase(), decodeEffectProgram(a)] as const));
  } catch (e) {
    diagnostics.push(`gates: MZANIM.ZAR: ${e instanceof Error ? e.message : String(e)}`);
  }
  const flat = flattenScene(models, 'worldmodel');
  const byPath = new Map<string, GateSpec>();
  const gates: GateSpec[] = [];
  actions.forEach((a, action) => {
    if (a.typeCode !== ACTION_TYPE_CODES.SWITCH) return;
    const animName = a.anims[0];
    const program = animName ? programs.get(animName.toLowerCase()) : undefined;
    if (!program) return;
    const slide = gateSlideOf(program);
    if (!slide) return;
    const at = flat.find((f) => f.node.name.toLowerCase() === slide.node.toLowerCase());
    if (!at) { diagnostics.push(`gates: node ${slide.node} is not placed`); return; }
    let spec = byPath.get(at.path);
    if (!spec) {
      const mine = owners.map((o, i) => (under(o.path, at.path) ? i : -1)).filter((i) => i >= 0);
      if (mine.length === 0) diagnostics.push(`gates: ${slide.node} has no collision under it`);
      const parent = Array.from(mul4(invertAffine(at.node.matrix), at.world));
      const shift = worldShift(parent, slide.open);
      const origin = apply4(at.world, 0, 0, 0);
      let minX = origin[0], maxX = origin[0], minZ = origin[2], maxZ = origin[2];
      const cover = (x: number, z: number): void => {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      };
      for (const i of mine) {
        const o = owners[i]!;
        for (const p of polys.slice(o.first, o.first + o.count)) {
          for (let k = 0; k < p.points.length; k += 3) {
            cover(p.points[k]!, p.points[k + 2]!);
            cover(p.points[k]! + shift[0], p.points[k + 2]! + shift[2]);
          }
        }
      }
      const sweep: Footprint = { minX, maxX, minZ, maxZ };
      // As a door (LATER 142): the frame is rebuilt live, so a moving owner keeps no stale one.
      for (const i of mine) { const o = owners[i]!; o.sweep = sweep; if (o.frame) o.restFrame = o.frame; delete o.frame; }
      spec = {
        index: gates.length, node: at.node.name, path: at.path, local: Array.from(at.node.matrix), parent,
        owners: mine, sweep, open: slide.open, seconds: slide.seconds, levers: [],
      };
      byPath.set(at.path, spec);
      gates.push(spec);
    } else if (!near(spec.open, slide.open)) {
      diagnostics.push(`gates: ${at.path}: open delta disagrees with the first lever`);
    }
    spec.levers.push({ action, node: a.node, path: a.path, valve: a.valve, program });
  });
  return { gates, diagnostics };
}

/**
 * The map's gates, headless. The room runs each lever's program and rewrites the hull. The page follows `applyWire`
 * and does not run the program. `external` is a valve this set has not written (`set_accessN` on the room's world).
 */
export class GateSet {
  private readonly gates: Gate[];
  private readonly byAction = new Map<number, number>();
  private readonly valves = new Map<string, number>();
  private readonly hull: Float32Array | null;

  constructor(
    readonly specs: readonly GateSpec[], ground: GroundData | null, private readonly hooks: GateHooks = {},
    private readonly external: (name: string) => number = () => 0,
  ) {
    const polys = ground ? groundPolygons(ground) : [];
    const base = ground ? ground.points.byteOffset : 0;
    this.gates = specs.map((spec, i) => {
      for (const lever of spec.levers) this.byAction.set(lever.action, i);
      const world0 = mul4(spec.local, spec.parent);
      const rest: Gate['rest'] = [];
      for (const o of spec.owners) {
        const owner = ground?.owners[o];
        if (!owner) continue;
        for (const p of polys.slice(owner.first, owner.first + owner.count)) {
          rest.push({ offset: (p.points.byteOffset - base) / 4, points: Float32Array.from(p.points) });
        }
      }
      return {
        spec, offset: [0, 0, 0], world0, inv0: invertAffine(world0), rest, lever: '',
        run: null, runAction: -1, swing: null, follow: null, seenPhase: -1, seenValve: 0, heading: 0, predicted: null,
      };
    });
    this.hull = ground?.points ?? null;
  }

  get count(): number {
    return this.gates.length;
  }

  /** Whether `action` (an index in `MapMeta.actions`) is one of this set's levers. */
  has(action: number): boolean {
    return this.byAction.has(action);
  }

  /** The gate a lever's action index drives, for a close log that names the press. */
  indexOf(action: number): number | undefined {
    return this.byAction.get(action);
  }

  /** A valve this set has written (a lever's). One it has not is `external`'s, for the program's own tests. */
  valve(name: string): number {
    return this.valves.has(name) ? this.valves.get(name)! : this.external(name);
  }

  /** The leaf's parent-space offset now. */
  offset(i: number): [number, number, number] {
    const g = this.gates[i];
    return g ? v3(g.offset) : [0, 0, 0];
  }

  /** True while that lever's gate still has a program running. */
  busy(action: number): boolean {
    const i = this.byAction.get(action);
    const g = i === undefined ? undefined : this.gates[i];
    return !!g?.run && !g.run.finished;
  }

  /**
   * The lever `action` (the room's `action` event, after its reach and line). False -- the room's `busy` -- while the
   * lever's own program still runs, its lead-in and the slide it calls (`FUN_002b44e0` D:L156787, the doors' and the
   * world's rule), and while the other lever's runs on a shared leaf (`GATE_SHARED_LEAF_OVERLAP_PLACEHOLDER`). Does not
   * mark the action used: a gate closes on the next pull (research 175 §5.3).
   */
  use(action: number): boolean {
    const i = this.byAction.get(action);
    if (i === undefined) return false;
    const g = this.gates[i]!;
    const lever = g.spec.levers.find((l) => l.action === action);
    if (!lever) return false;
    if (g.run && !g.run.finished && (g.runAction === action || GATE_SHARED_LEAF_OVERLAP_PLACEHOLDER)) return false;
    g.lever = lever.valve;
    g.runAction = action;
    g.heading = 0;
    g.follow = null;
    g.swing = null;
    g.run = new EffectRun(lever.program, this.host(g));
    g.run.update(0);
    if (g.run.finished) { g.run = null; g.swing = null; }
    return true;
  }

  /**
   * P8 (`GATE_PREDICT_ADAPTATION`): the page's own pull of lever `action`, sent to the room as an `action` event naming
   * command `seq`: the leaf, at rest at an end, chases the other end once the lever's lead-in has passed, until the
   * room's word (`applyWire`). False -- nothing predicted, the press followed off the wire -- for no lever of this set,
   * a pull of this gate still waiting, a program running here, a leaf chasing or sliding on the wire, or a program
   * whose dry run never slides the leaf.
   */
  predict(action: number, seq: number): boolean {
    const i = this.byAction.get(action);
    const g = i === undefined ? undefined : this.gates[i];
    const lever = g?.spec.levers.find((l) => l.action === action);
    if (!g || !lever || g.predicted || g.run || g.follow) return false;
    if (g.seenPhase >= 0 && g.seenPhase < PHASE_REST) return false;
    const open = g.spec.open;
    const atShut = near(g.offset, [0, 0, 0]), atOpen = near(g.offset, open);
    if (!atShut && !atOpen) return false;
    const opening = atShut;                                  // `open` is never zero: the two ends differ
    const lead = leadIns(g.spec, lever)[opening ? 0 : 1];
    if (lead === null) return false;
    g.predicted = {
      seq, from: v3(g.offset), to: opening ? v3(open) : [0, 0, 0], valve: opening ? 1 : 0,
      wait: lead, leadTicks: Math.ceil(lead * TICK_HZ), ackTick: null, taken: false,
    };
    return true;
  }

  /** One step of every running program, and of a page's interpolation, `dt` seconds. */
  step(dt: number): void {
    for (const g of this.gates) {
      if (g.run) {
        if (!g.run.finished) g.run.update(dt);
        if (g.run.finished) { g.run = null; g.swing = null; g.heading = 0; }
        continue;
      }
      let left = Math.max(dt, 0);
      const p = g.predicted;
      if (p && p.wait > 0) {
        // GATE_PREDICT_ADAPTATION: the lever's lead-in, then the chase toward the other end with what is left of the step.
        p.wait -= left;
        if (p.wait > 0) continue;
        left = -p.wait;
        p.wait = 0;
        g.follow = { to: v3(p.to) };
      }
      const m = g.follow;
      if (!m) continue;
      // GATE_WIRE_FOLLOW_ADAPTATION: the slide's own speed (`len(open) / seconds`), never a jump to the snapshot.
      const speed = len3(g.spec.open) / Math.max(g.spec.seconds, 1e-6);
      const delta = sub3(m.to, g.offset);
      const dist = len3(delta);
      const stepDist = speed * left;
      if (dist <= stepDist + 1e-4) { this.pose(g, m.to); g.follow = null; }
      else this.pose(g, add3(g.offset, scale3(delta, stepDist / dist)));
    }
  }

  /**
   * The round's start: shut, at rest, the lever valves cleared; `set_accessN` belongs to the world, which resets itself.
   * As the doors' (`DOOR_ROUND_RESET_READING`): the round's reset `FUN_002ac0e0` (D:L151976-151991) calls `FUN_002b5510`
   * (D:L157445-157456), which zeroes the action valves and stops the running animations, and the zAnim restore puts
   * back what the node references saved -- `action_reset` names the gate and lever transforms (research 174 §5).
   */
  reset(): void {
    this.valves.clear();
    for (const g of this.gates) {
      if (!near(g.offset, [0, 0, 0])) this.hooks.closing?.(g.spec, 'reset');
      g.run = null; g.runAction = -1; g.swing = null; g.follow = null; g.lever = ''; g.seenPhase = -1; g.seenValve = 0; g.heading = 0;
      g.predicted = null;
      this.pose(g, [0, 0, 0]);
    }
  }

  /**
   * Each gate for the snapshot's door tail (`DoorWire`). `phase` is where the leaf is along the shut-to-open segment:
   * 0 shut, `PHASE_REST - 1` open, `PHASE_REST` settled at the end the valve names. It is not the progress of the
   * current swing (a close from the open end is not "snap shut").
   * `valve` is the direction, 1 toward open and 0 toward shut, and only while the slide or a mid-pose lead-in runs.
   * At rest, and through the lead-in at an end, the phase is `PHASE_REST`.
   */
  wire(): DoorWire[] {
    return this.gates.map((g) => {
      const along = alongOpen(g.offset, g.spec.open);
      const sliding = g.swing !== null || (g.run !== null && g.heading !== 0);
      if (!sliding) return { valve: along >= 0.5 ? 1 : 0, phase: PHASE_REST };
      const valve = g.heading > 0 ? 1 : g.heading < 0 ? 0 : along >= 0.5 ? 1 : 0;
      return { valve, phase: phaseOf(along) };
    });
  }

  /**
   * The page's copy of the server's gates. `wire` is the snapshot's whole door array; `doorCount` is how many of its
   * head are doors. The pose is the phase itself.
   *
   * A join (`prev < 0`) and the first sample after a settled end (`prev >= PHASE_REST`) snap to that pose. While a
   * slide is already showing, a later phase and a `PHASE_REST` settle are chased at the slide's speed (`step`).
   * Snapping that settle jumped a plain close by however far the page had fallen behind a late snapshot. The same
   * phase again does not move — a held lead-in must not creep, and the chase already aimed at that pose keeps going.
   * The target is the phase's pose, not the end of the travel.
   */
  applyWire(wire: readonly DoorWire[] | undefined, doorCount = 0, acked?: number | null, tick?: number): void {
    const tail = wire?.slice(doorCount);
    if (!tail) return;
    tail.forEach((w, i) => {
      const g = this.gates[i];
      if (!g || g.run) return;
      const open = g.spec.open;
      const along = w.phase >= PHASE_REST ? (w.valve ? 1 : 0) : Math.min(1, w.phase / (PHASE_REST - 1));
      const pose: [number, number, number] = along <= 0 ? [0, 0, 0] : along >= 1 ? v3(open) : scale3(open, along);
      const p = g.predicted;
      if (p) {
        // P8 (`GATE_PREDICT_ADAPTATION`): the page's own pull settled by the room's word. `acked` is the last command the
        // room had run as of this snapshot (`NetClient.acked`), null with no own body in it, undefined when not known;
        // `tick` that snapshot's room tick (`NetClient.heardTick`), undefined when not known.
        if (p.ackTick === null && acked !== null && acked !== undefined && acked > p.seq && tick !== undefined) p.ackTick = tick;
        const sliding = w.phase < PHASE_REST;
        g.seenPhase = w.phase; g.seenValve = w.valve;
        if (!sliding && w.valve === p.valve) {
          // At rest at the end chased: the room's slide is over; the chase finishes it here (or has).
          g.predicted = null;
          g.follow = near(g.offset, p.to) ? null : { to: v3(p.to) };
          return;
        }
        if (sliding && w.valve === p.valve) { p.taken = true; return; }   // this pull's slide (or one the same way)
        if (sliding) {
          // The room slides the other way: another's pull, not this one. Followed from where the leaf is.
          g.predicted = null;
          g.follow = near(g.offset, pose) ? null : { to: pose };
          return;
        }
        if (!p.taken && (acked === null || (p.ackTick !== null && tick !== undefined && tick - p.ackTick > p.leadTicks))) {
          // At rest on the old end past the room's lead-in on its own ticks (the review's F1), or no own body: refused.
          // Put back at once, silently.
          g.predicted = null;
          g.follow = null;
          this.pose(g, p.from);
        }
        return;
      }
      const prev = g.seenPhase;
      const same = w.phase === g.seenPhase && w.valve === g.seenValve;
      g.seenPhase = w.phase; g.seenValve = w.valve;
      if (same) return;
      // A sliding phase is already on screen. Chase the new pose, including the settle. A join and the first
      // sample after a settled end still snap.
      const showing = prev >= 0 && prev < PHASE_REST;
      if (!showing) {
        this.pose(g, pose);
        g.follow = null;
        return;
      }
      if (near(g.offset, pose)) { g.follow = null; return; }
      g.follow = { to: pose };
    });
  }

  /** `inv(W0) W`: the leaf's move from rest to the offset, row-major. */
  private delta(g: Gate, offset: readonly [number, number, number]): Float32Array {
    const local = Float32Array.from(g.spec.local);
    local[12] = g.spec.local[12]! + offset[0];
    local[13] = g.spec.local[13]! + offset[1];
    local[14] = g.spec.local[14]! + offset[2];
    return mul4(g.inv0, mul4(local, g.spec.parent));
  }

  /** The node at `offset`: its polygons rewritten in the hull, and the page told. */
  private pose(g: Gate, offset: readonly [number, number, number]): void {
    g.offset = v3(offset);
    const m = this.delta(g, g.offset);
    if (this.hull) {
      for (const r of g.rest) {
        for (let k = 0; k < r.points.length; k += 3) this.hull.set(apply4(m, r.points[k]!, r.points[k + 1]!, r.points[k + 2]!), r.offset + k);
      }
    }
    this.hooks.moved?.(g.spec, m);
  }

  private host(g: Gate): EffectHost {
    const leaf = (node: number, run: EffectRun): boolean => {
      const name = run.program.nodes[node];
      return name !== undefined && name.toLowerCase() === g.spec.node.toLowerCase();
    };
    /** A context valve is the lever that was pulled (`FUN_00272bb0`'s type 4). `set_accessN` is named, and external. */
    const valveName = (v: { valve: string; context?: true }): string => (v.context ? g.lever : v.valve);
    const read = (name: string): number => (this.valves.has(name) ? this.valves.get(name)! : this.external(name));
    const where = (): [number, number, number] => apply4(mul4(g.spec.local, g.spec.parent), 0, 0, 0);
    return {
      random: () => 0.5,
      test: (c: EffectCondition): boolean => (c.kind === 'valve' ? valveTest(read(valveName(c)), c.operation, c.operand) : false),
      begin: (op: EffectOp, run: EffectRun): OpTick | void => {
        switch (op.op) {
          case 'valve': {
            const name = valveName(op);
            this.valves.set(name, valveApply(read(name), op.operation, op.operand));
            return;
          }
          case 'sound':
            if (op.newPlay !== false) this.hooks.sound?.(op.sound, where(), op.volume);
            return;
          case 'fromTo': {
            const tr = op.translation;
            // A rotate, a scale flash, or the lever handle's own motion: the leaf is the named `gate_move` only.
            if (!tr || !leaf(op.node, run)) return;
            const open = g.spec.open;
            // `FUN_0025fe70`'s begin (research 174 §5): from is the node's translation now, or the stored one with
            // flag 2 (D:L109101-109115); flag 1 adds the target onto from (D:L109234-109244), else the target is the
            // translation itself. Offsets here are from the node's rest translation. No clamp to the travel: a run
            // never starts mid-slide (`use`), and the disc's programs toggle their valves, so a lever never repeats
            // `gateopen` from the open end.
            const rest: [number, number, number] = [g.spec.local[12]!, g.spec.local[13]!, g.spec.local[14]!];
            const from = tr.from ? sub3(tr.from, rest) : v3(g.offset);
            // `x === 0 ? 0 : x` drops a -0 (`0 + -0`), which a pose compared with `[0, 0, 0]` would miss.
            const to = ((op.flags & 1) !== 0 ? add3(from, tr.to) : sub3(tr.to, rest)).map((x) => (x === 0 ? 0 : x)) as [number, number, number];
            const seconds = near(to, from) ? 0 : op.seconds;
            if (seconds <= 0) { this.pose(g, to); g.heading = 0; g.swing = null; return; }
            const toward = alongOpen(to, open) - alongOpen(from, open);
            g.heading = toward > 0 ? 1 : toward < 0 ? -1 : 0;
            // A close is this slide or a round reset. A resting open leaf is not on a timer (research 174 §5).
            if (g.heading < 0) this.hooks.closing?.(g.spec, 'use');
            g.swing = { seconds, t: 0, from, to };
            this.pose(g, from);
            return (dt: number): boolean => {
              const s = g.swing ?? { seconds, t: 0, from, to };
              s.t += dt;
              const done = s.t >= s.seconds;
              this.pose(g, done ? s.to : lerp3(s.from, s.to, s.t / Math.max(s.seconds, 1e-6)));
              if (done) g.heading = 0;
              return done;
            };
          }
          default: return;
        }
      },
    };
  }
}
