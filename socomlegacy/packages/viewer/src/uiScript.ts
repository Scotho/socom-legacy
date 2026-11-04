import type { Quat4, UiCommand, UiOp, UiOperand, UiPopup, UiProgram, UiSequence, UiText, UiToken, UiValveOp, Vec3 } from '@s2u/scene';

/**
 * A menu screen's zAnim scripts run (web sprint 5, S3; socomlegacy/docs/research/95 §1, §3): the `RUN/UIZANIM.ZAR`
 * animations `@s2u/scene` `decodeUiSet` decodes, stepped over the screen's objects as the game's zAnim player steps them
 * -- which object shows (`OBJECT_ACTIVE_STATE`), where it is (`OBJECT_MOTION_FROM_TO`), how opaque
 * (`OBJECT_OPACITY_FROM_TO`), what it says (`ui::UI_COMMAND` op 1, the caption), and the valves the branches read. The
 * ARMORY's pixels are the dialog's objects placed by these scripts (`./armoryLayout`), never hand-placed; its logic is
 * `./armoryState`'s, which starts the scripts' animations for their looks (`./armory`).
 *
 * The player's rules, each from research 95 §1:
 * - **Sequences** (§1.4): an animation's activation-1 sequences all start with it and run concurrently, each with its own
 *   program counter (reCOM `zanim.h` 463-481); `CALL_SEQUENCE` starts one of its activation-2 sequences by name.
 * - **Branches**: `IF`/`ELSEIF`/`ELSE`/`ENDIF` carry their nest depth (`FUN_0025e7a0` L108201, `FUN_0025e6d0` L108159,
 *   `FUN_0025e6a0` L108149); a condition is its token stream (`FUN_0025e960` L108286): valve tests, a bound function's
 *   truth, NOT / AND / OR and parentheses (`CONDITION_PRECEDENCE_READING`).
 * - **Loops**: `WHILE` tests at its head, `END_WHILE` jumps back (`FUN_0025e630` L108131, `FUN_0025e600` L108121), `BREAK`
 *   leaves the innermost (`FUN_0025e520` L108074), `LOOP` starts the sequence over (research 89 §1); each pass back
 *   yields to the next frame (`LOOP_YIELD_READING`), so a script that polls (`UiBackToLobby`'s clock, the confirm's
 *   `AreYouSure`) never spins a frame away.
 * - **Waits and motions** hold their sequence until their time is up (`FUN_0025ed50` L108428; the motion's tick
 *   `FUN_0025f9b0` L108850-109034, the opacity's `FUN_0025f880` L108804): a position moves linearly at its rate and snaps
 *   to "to" at the end; flag 2 sets "from" first, else the motion starts from where the object is; a scale the same
 *   (flag 0x100 "from" stored); a rotation slerps from the current orientation (flag 1 relative) by t / time.
 * - **Calls**: `CALL_ANIMATION` starts an animation; flag 0x200 blocks the caller until it ends (`FUN_0025d550`
 *   L107465); a name no set defines is a no-op (`FUN_0025d5c0` L107485; `ARMORY_MISSING_ANIMS_READING`). A call to an
 *   animation that is running starts it over (`ZANIM_RECALL_READING`). `STOP_ANIMATION` ends one (`FUN_0025d490` L107435).
 * - **Valves** (`FUN_00353fd0` L252128-252345): u16 values; the tests 0-10 and the assignments 11-18, `-=` floored at 0.
 * - **UI commands** (`FUN_002745a0` L121344-121431): with a node, op 1 its caption (a `UIMnLOC` id, or the literal),
 *   op 2 the `"%d"` of a valve (`FUN_0036fcc0` L268005-268080), any other op the host's; without one, the bound
 *   function by name -- the host's (`UiHost.command`), whose answer is the truth inside an `IF`.
 *
 * Pure: time is what `step` is given; the host is called for what the scripts ask of the game.
 */

/**
 * CONDITION_PRECEDENCE_READING: the token stream read with NOT binding tightest, then AND, then OR, parentheses
 * grouping. The evaluator `FUN_0025e960` (L108286) was read for the token kinds, not the precedence; the ARMORY's mixed
 * conditions all parenthesise (`OnEquipWeaponBtnRight`'s `((a & 16) && team == 0) || ((a & 32) && team == 8)`), and the
 * unparenthesised ones are all-AND or all-OR, so any precedence gives them the same truth.
 */
export const CONDITION_PRECEDENCE_READING = 'not>and>or' as const;
/** LOOP_YIELD_READING: a `WHILE`'s pass back and a `LOOP`'s restart wait for the next frame (the player's own tick is per frame). */
export const LOOP_YIELD_READING = true;
/**
 * CALL_ANIMATION_AT_ONCE_READING: a called animation runs at once, inside its caller's tick, up to its first timed
 * command (a WAIT, a motion), blocking or not -- the zAnim player's call order within a frame was not traced; this is
 * the order that keeps the ONSTART scripts' columns hidden until their slide (research 95 §3.1).
 */
export const CALL_ANIMATION_AT_ONCE_READING = true;
/** ZANIM_RECALL_READING: `CALL_ANIMATION` of an animation already running starts it over (`CallShowAndSpin` stops it first either way). */
export const ZANIM_RECALL_READING = 'restart' as const;

/** One object of the screen as the scripts leave it. Positions are relative to the object's parent, as the layout's. */
export interface UiNode {
  name: string;
  x: number;
  y: number;
  visible: boolean;
  opacity: number;
  /** The caption a script set (op 1 / op 2); null: the layout's own. */
  caption: UiText | null;
  scale: Vec3;
  rotation: Quat4;
}

/** What the scripts ask of the game. */
export interface UiHost {
  /** A bound function (`ChoosePrimary`, `SuspendMenuInput`, `ActivateButton` ...): its truth inside an `IF`. */
  command(cmd: UiCommand, runner: UiRunner): boolean;
  /** A node command other than a caption (a `TELETYPE`'s continue, a list's scroll ...), or a popup's record. */
  nodeCommand?(cmd: UiCommand, popup: UiPopup | undefined, runner: UiRunner): void;
  /** A `SOUND` command's sample (`.DINK`, `.SLIDE`, `.NEG` ...), and the command (its flags, volume, pan, pitch). */
  sound?(name: string, op: Extract<UiOp, { op: 'sound' }>): void;
}

type Motion =
  | {
    kind: 'move'; node: UiNode; seconds: number; elapsed: number; op: Extract<UiOp, { op: 'move' }>; q0: Quat4; q1: Quat4 | null;
    /** Where the position and the scale start: "from" when stored (flags 2 / 0x100), else the node's at the start. */
    p0: readonly [number, number]; s0: Vec3;
  }
  | { kind: 'opacity'; node: UiNode; seconds: number; elapsed: number; from: number; to: number };

interface Thread {
  seq: UiSequence;
  pc: number;
  wait: number;
  motion: Motion | null;
  blockedOn: Instance | null;
  done: boolean;
  /** Set when the thread yielded on a loop this step: it resumes on the next. */
  yielded: boolean;
}

interface Instance { name: string; program: UiProgram; threads: Thread[]; done: boolean }

/** Per-sequence jump tables, computed once. */
interface Jumps { next: Map<number, number>; endif: Map<number, number>; whileEnd: Map<number, number>; whileHead: Map<number, number>; enclosing: Map<number, number> }

const OPS_BUDGET = 20000;
const U16 = 0xffff;

const qmul = (a: Quat4, b: Quat4): Quat4 => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

/** The slerp `FUN_00306ae0` (L205927): the shortest arc, a normalised lerp above a dot of 0.95. */
export function slerp(a: Quat4, b: Quat4, t: number): Quat4 {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let e: Quat4 = b;
  if (d < 0) { d = -d; e = [-b[0], -b[1], -b[2], -b[3]]; }
  let k0: number, k1: number;
  if (d > 0.95) { k0 = 1 - t; k1 = t; } else {
    const th = Math.acos(Math.min(1, d)), s = Math.sin(th);
    k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s;
  }
  const q: Quat4 = [a[0] * k0 + e[0] * k1, a[1] * k0 + e[1] * k1, a[2] * k0 + e[2] * k1, a[3] * k0 + e[3] * k1];
  const n = Math.hypot(...q) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

function jumps(ops: readonly UiOp[]): Jumps {
  const j: Jumps = { next: new Map(), endif: new Map(), whileEnd: new Map(), whileHead: new Map(), enclosing: new Map() };
  ops.forEach((op, i) => {
    if (op.op === 'if' || op.op === 'elseif' || op.op === 'else') {
      for (let k = i + 1; k < ops.length; k++) {
        const o = ops[k]!;
        if ((o.op === 'elseif' || o.op === 'else' || o.op === 'endif') && o.depth === op.depth) { j.next.set(i, k); break; }
      }
      for (let k = i + 1; k < ops.length; k++) {
        const o = ops[k]!;
        if (o.op === 'endif' && o.depth === op.depth) { j.endif.set(i, k); break; }
      }
    }
  });
  const stack: number[] = [];
  ops.forEach((op, i) => {
    if (stack.length) j.enclosing.set(i, stack[stack.length - 1]!);
    if (op.op === 'while') stack.push(i);
    else if (op.op === 'endWhile') {
      const head = stack.pop();
      if (head !== undefined) { j.whileEnd.set(head, i); j.whileHead.set(i, head); }
    }
  });
  return j;
}

/** A valve test (ops 0-10). */
export function valveTest(value: number, op: UiValveOp, operand: number): boolean {
  switch (op) {
    case 'true': return value !== 0;
    case '!=': return value !== operand;
    case '==': return value === operand;
    case '>': return value > operand;
    case '<': return value < operand;
    case '>=': return value >= operand;
    case '<=': return value <= operand;
    case '|': return ((value | operand) & U16) !== 0;
    case '&': return (value & operand) !== 0;
    case '|~': return ((value | ~operand) & U16) !== 0;
    case '&~': return (value & ~operand & U16) !== 0;
    default: return false;
  }
}

/** A valve assignment (ops 11-18): the new u16 value, or null for a test op. */
export function valveAssign(value: number, op: UiValveOp, operand: number): number | null {
  switch (op) {
    case '=': return operand & U16;
    case '+=': return (value + operand) & U16;
    case '-=': return Math.max(0, value - operand);
    case '*=': return (value * operand) & U16;
    case '|=': return (value | operand) & U16;
    case '&=': return value & operand & U16;
    case '|=~': return (value | ~operand) & U16;
    case '&=~': return value & ~operand & U16;
    default: return null;
  }
}

/** Runs a screen's animations over its nodes. */
export class UiRunner {
  readonly valves = new Map<string, number>();
  private readonly programs: Map<string, UiProgram>;
  private readonly nodeMap = new Map<string, UiNode>();
  private instances: Instance[] = [];
  private readonly jumpCache = new WeakMap<UiSequence, Jumps>();

  constructor(programs: Iterable<UiProgram>, nodes: Iterable<Pick<UiNode, 'name' | 'x' | 'y'> & Partial<UiNode>>, private readonly host: UiHost) {
    this.programs = new Map();
    for (const p of programs) if (!this.programs.has(p.name.toLowerCase())) this.programs.set(p.name.toLowerCase(), p);
    for (const n of nodes) this.nodeMap.set(n.name.toLowerCase(), { visible: true, opacity: 1, caption: null, scale: [1, 1, 1], rotation: [0, 0, 0, 1], ...n });
  }

  /**
   * The node of a name (case-insensitive, as the game matches names); a name the layout lacks is made, and its commands
   * change nothing drawn (`ARMORY_ABSENT_OBJECTS_READING`: `NoAvailRoom`, `ClayAvailText`, `arrow_up` ...).
   */
  node(name: string): UiNode {
    const key = name.toLowerCase();
    let n = this.nodeMap.get(key);
    if (!n) { n = { name, x: 0, y: 0, visible: true, opacity: 1, caption: null, scale: [1, 1, 1], rotation: [0, 0, 0, 1] }; this.nodeMap.set(key, n); }
    return n;
  }
  /** Whether the layout (or a script) named a node. */
  has(name: string): boolean { return this.nodeMap.has(name.toLowerCase()); }
  nodes(): IterableIterator<UiNode> { return this.nodeMap.values(); }
  valve(name: string): number { return this.valves.get(name) ?? 0; }
  setValve(name: string, value: number): void { this.valves.set(name, value & U16); }
  defines(anim: string): boolean { return this.programs.has(anim.toLowerCase()); }
  running(anim: string): boolean { return this.instances.some((i) => !i.done && i.name.toLowerCase() === anim.toLowerCase()); }

  /** Starts an animation (restarting it if it runs); false for a name no set defines. */
  start(anim: string): boolean {
    return this.spawn(anim) !== null;
  }

  /** Ends an animation's every running instance. */
  stop(anim: string): void {
    const key = anim.toLowerCase();
    for (const i of this.instances) if (i.name.toLowerCase() === key) i.done = true;
  }

  /** Ends everything. */
  stopAll(): void {
    for (const i of this.instances) i.done = true;
    this.instances = [];
  }

  /** Advances every running sequence by `dt` seconds. */
  step(dt: number): void {
    for (let n = 0; n < this.instances.length; n++) {
      const inst = this.instances[n]!;
      if (inst.done) continue;
      for (const th of inst.threads) this.run(inst, th, dt);
      if (inst.threads.every((t) => t.done)) inst.done = true;
    }
    this.instances = this.instances.filter((i) => !i.done);
    for (const i of this.instances) for (const t of i.threads) t.yielded = false;
  }

  private spawn(anim: string): Instance | null {
    const program = this.programs.get(anim.toLowerCase());
    if (!program) return null;
    this.stop(anim);
    const inst: Instance = { name: program.name, program, done: false, threads: [] };
    for (const seq of program.sequences) if (seq.activation === 1) inst.threads.push(this.thread(seq));
    if (!inst.threads.length) inst.done = true;
    this.instances.push(inst);
    return inst;
  }

  private thread(seq: UiSequence): Thread {
    return { seq, pc: 0, wait: 0, motion: null, blockedOn: null, done: false, yielded: false };
  }

  private jumps(seq: UiSequence): Jumps {
    let j = this.jumpCache.get(seq);
    if (!j) { j = jumps(seq.ops); this.jumpCache.set(seq, j); }
    return j;
  }

  private operand(o: UiOperand): number {
    return typeof o === 'number' ? o : this.valve(o.valve);
  }

  /** A condition's truth (`FUN_0025e960`), `CONDITION_PRECEDENCE_READING`. */
  truth(tokens: readonly UiToken[]): boolean {
    let at = 0;
    const atom = (): boolean => {
      const t = tokens[at++];
      if (!t) return false;
      if (t.t === 'not') return !atom();
      if (t.t === 'open') { const v = or(); if (tokens[at]?.t === 'close') at++; return v; }
      if (t.t === 'valve') return valveTest(this.valve(t.valve), t.op, this.operand(t.operand));
      if (t.t === 'ui') return this.host.command(t.command, this);
      return false;
    };
    const and = (): boolean => {
      let v = atom();
      while (tokens[at]?.t === 'and') { at++; const r = atom(); v = v && r; }
      return v;
    };
    const or = (): boolean => {
      let v = and();
      while (tokens[at]?.t === 'or') { at++; const r = and(); v = v || r; }
      return v;
    };
    return tokens.length === 0 ? true : or();
  }

  private uiCommand(op: Extract<UiOp, { op: 'ui' }>): void {
    const c = op.command;
    if (c.node === null) { this.host.command(c, this); return; }
    if (c.op === 1) { this.node(c.node).caption = c.loc !== 0 ? { loc: c.loc } : { text: c.arg }; return; }
    if (c.op === 2) { this.node(c.node).caption = { text: String(this.valve(c.arg)) }; return; }
    this.host.nodeCommand?.(c, op.popup, this);
  }

  /** Applies a motion `elapsed` into it; true when it has run its time. */
  private apply(m: Motion): boolean {
    const end = m.elapsed >= m.seconds;
    if (m.kind === 'opacity') {
      const k = m.seconds > 0 ? Math.min(1, m.elapsed / m.seconds) : 1;
      m.node.opacity = m.from + (m.to - m.from) * k;
      return end;
    }
    const op = m.op;
    if (op.position) {
      const p = op.position, t = Math.min(m.elapsed, m.seconds);
      const from = m.p0;
      if (end) { m.node.x = p.to[0]; m.node.y = p.to[1]; } else {
        // Linear at the rate, never past "to" (`FUN_0025f9b0`; the position written by `FUN_003157d0` L215063).
        const along = (a: number, b: number, r: number): number => { const v = a + r * t; return r >= 0 ? Math.min(v, Math.max(a, b)) : Math.max(v, Math.min(a, b)); };
        m.node.x = along(from[0], p.to[0], p.rate[0]); m.node.y = along(from[1], p.to[1], p.rate[1]);
      }
    }
    if (op.scale) {
      const s = op.scale, t = Math.min(m.elapsed, m.seconds);
      const from = m.s0;
      m.node.scale = end ? [...s.to] as Vec3 : [0, 1, 2].map((i) => from[i]! + s.rate[i]! * t) as Vec3;
    }
    if (op.rotation && m.q1) m.node.rotation = slerp(m.q0, m.q1, m.seconds > 0 ? Math.min(1, m.elapsed / m.seconds) : 1);
    return end;
  }

  private beginMotion(op: Extract<UiOp, { op: 'move' | 'opacity' }>): Motion {
    const node = this.node(op.node);
    if (op.op === 'opacity') return { kind: 'opacity', node, seconds: op.seconds, elapsed: 0, from: op.from, to: op.to };
    if (op.position?.from) { node.x = op.position.from[0]; node.y = op.position.from[1]; }
    if (op.scale?.from) node.scale = [...op.scale.from] as Vec3;
    let q0: Quat4 = node.rotation, q1: Quat4 | null = null;
    if (op.rotation) {
      q0 = op.rotation.relative ? node.rotation : op.rotation.from;
      q1 = op.rotation.relative ? qmul(op.rotation.to, node.rotation) : op.rotation.to;
    }
    // "From" taken once, here, at the command's start (`FUN_0025fe70` L109034-109346 keeps it in the running command,
    // P+4 stored or the current value), never read again from the node as it moves.
    return { kind: 'move', node, seconds: op.seconds, elapsed: 0, op, q0, q1, p0: [node.x, node.y], s0: [...node.scale] as Vec3 };
  }

  private run(inst: Instance, th: Thread, dt: number): void {
    if (th.done || th.yielded) return;
    let budget = dt;
    if (th.blockedOn) {
      if (!th.blockedOn.done) return;
      th.blockedOn = null;
    }
    if (th.wait > 0) {
      th.wait -= budget;
      if (th.wait > 0) return;
      budget = -th.wait; th.wait = 0;
    }
    if (th.motion) {
      th.motion.elapsed += budget;
      if (!this.apply(th.motion)) return;
      budget = Math.max(0, th.motion.elapsed - th.motion.seconds);
      th.motion = null;
    }
    const ops = th.seq.ops, j = this.jumps(th.seq);
    for (let guard = 0; guard < OPS_BUDGET; guard++) {
      if (inst.done) { th.done = true; return; }
      if (th.pc >= ops.length) { th.done = true; return; }
      const op = ops[th.pc]!;
      switch (op.op) {
        case 'if':
        case 'elseif': {
          if (op.op === 'elseif') { th.pc = (j.endif.get(th.pc) ?? ops.length - 1) + 1; break; }   // the end of a taken branch
          let at = th.pc;
          for (;;) {
            const cur = ops[at]!;
            if (cur.op === 'if' || cur.op === 'elseif') {
              if (this.truth(cur.tokens)) { th.pc = at + 1; break; }
              const nx = j.next.get(at);
              if (nx === undefined) { th.pc = ops.length; break; }
              at = nx;
            } else { th.pc = at + 1; break; }             // an ELSE or the ENDIF
          }
          break;
        }
        case 'else': th.pc = (j.endif.get(th.pc) ?? ops.length - 1) + 1; break;
        case 'endif': th.pc++; break;
        case 'while': {
          if (op.forever || this.truth(op.tokens)) th.pc++;
          else th.pc = (j.whileEnd.get(th.pc) ?? ops.length - 1) + 1;
          break;
        }
        case 'endWhile': {
          const head = j.whileHead.get(th.pc);
          th.pc = head ?? th.pc + 1;
          if (head !== undefined && LOOP_YIELD_READING) { th.yielded = true; return; }
          break;
        }
        case 'break': {
          const w = j.enclosing.get(th.pc);
          th.pc = w === undefined ? ops.length : (j.whileEnd.get(w) ?? ops.length - 1) + 1;
          break;
        }
        case 'loop': th.pc = 0; th.yielded = true; return;
        case 'wait': {
          th.pc++;
          if (op.seconds > budget) { th.wait = op.seconds - budget; return; }
          budget -= op.seconds;
          break;
        }
        case 'call': {
          th.pc++;
          const child = this.spawn(op.anim);
          if (child) {
            // The callee runs at once, inside its caller's tick (`CALL_ANIMATION_AT_ONCE_READING`), up to its first
            // timed command -- so what it shows is shown before the caller's next command, as `UiEquipSwitch`'s
            // `Ui_MP_*_EquipStart` is before `MPSealPlace` hides the columns for the slide.
            for (const t of child.threads) this.run(child, t, 0);
            if (child.threads.every((t) => t.done)) child.done = true;
            if (op.block && !child.done) { th.blockedOn = child; return; }
          }
          break;
        }
        case 'stopAnimation': th.pc++; this.stop(op.anim); if (inst.done) { th.done = true; return; } break;
        case 'callSequence': {
          th.pc++;
          const seq = inst.program.sequences.find((s) => s.name.toLowerCase() === op.sequence.toLowerCase());
          if (seq) { const t = this.thread(seq); inst.threads.push(t); this.run(inst, t, 0); }
          break;
        }
        case 'active': th.pc++; this.node(op.node).visible = op.on; break;
        case 'move':
        case 'opacity': {
          th.pc++;
          const m = this.beginMotion(op);
          m.elapsed = budget;
          if (!this.apply(m)) { th.motion = m; return; }
          budget = Math.max(0, m.elapsed - m.seconds);
          break;
        }
        case 'sound': th.pc++; if (op.newPlay) this.host.sound?.(op.sound, op); break;
        case 'valve': {
          th.pc++;
          const v = valveAssign(this.valve(op.valve), op.operation, this.operand(op.operand));
          if (v !== null) this.valves.set(op.valve, v);
          break;
        }
        case 'ui': th.pc++; this.uiCommand(op); break;
        default: th.pc++; break;
      }
    }
    th.yielded = true;   // the budget spent: resume next frame
  }
}
