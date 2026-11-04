import type { EffectCondition, EffectOp, EffectProgram } from '@s2u/scene';
import { evaluateCondition } from './roundCues';

/**
 * The zAnim sequencer for the effect animations (socomlegacy/docs/research/89 §1), as `CZAnimMain` runs a sequence: each tick
 * a sequence steps its commands from its program counter -- a command's tick answers done (the next command runs in
 * the same tick) or not yet (the sequence resumes there next tick). The sequences of an animation run side by side;
 * the animation ends when every sequence has run off its end, or on `FAIL`.
 *
 * - **IF / ELSEIF / ELSE / ENDIF** nest (77 §9): a false condition skips to the next branch of its own level; the end
 *   of a taken branch skips to its `ENDIF`. An `IF`'s conditions are its sub-commands; the effects' are
 *   `RANDOM_WEIGHT` (`rand() / 2^31 <= p`), `RANGE_TEST` and `VALVE`, which `host.test` answers, folded through the
 *   `EXPRESSION` operators between them as the menus' `IF` does -- the same `FUN_0025e7a0` / `FUN_0025e960` (LATER 310;
 *   research 89 §18, 106 §3). Two operands with no operator between them: the first decides and the second is not
 *   asked; the original then runs the rest of the tokens as statements when it holds (D:L108375-108379), which is not
 *   modelled (ruling R1): the disc's one pair, MP64's `bugs_flying` (`set 0 cmd 66 set 0 cmd 72`, where M51's copy has
 *   an OR), is an unread operand's (`ZANIM_UNREAD_OPERAND_PLACEHOLDER`), so its IF reads false before and now
 *   (`tools/test/effectConditionSweepDisc.test.ts`).
 * - **WAIT** holds for its seconds, or its frames; **LOOP** returns to the sequence's start (forever at -1, as the
 *   flash's `fire_fix` does until `STOP_SEQUENCE` ends it); **STOP_SEQUENCE** ends a named sequence.
 * - **FOR_CHILDREN ... END_FOR_CHILDREN** (XR-04; research 213 s2.3): the block is skipped whole -- its body never runs,
 *   not even once on the unbound loop variable. Its one use on the sprint maps is the debris flight (Crossroads' bridges
 *   and bases: each part reparented, turned on and flown by `flyparts`), which no page draws yet (H99, ruling PF.R29).
 * - Everything else is the host's (`EffectHost.begin`): a node's state, a sound, a particle source, a call, which
 *   answer at once, and the timed ones -- `OBJECT_MOTION`, `OBJECT_MOTION_FROM_TO` and (PB-9b) `OBJECT_OPACITY_FROM_TO`
 *   (`opacityTick`) -- which return a tick that the sequence waits on.
 * - **The cleanup sequence** (PB-9b, research 284 s3; `EffectProgram.cleanup`, `Anim_Params`' fourth offset): never
 *   started with the others; run once, with a 1.0 s step, when the animation ends -- stopped (`STOP_ANIMATION`, its
 *   owner), failed, or every sequence run off its end (`FUN_0026ff20(5)` -> `FUN_0026d870` D:L117101-117127, D:L118599;
 *   from `FUN_002707c0` D:L118878 and `FUN_00270220`). The bases' pulses turn their outline off there.
 */

/**
 * A timed command's own tick: true when it is done, false while it runs; a number when it is done with that much of
 * the tick left over, which the sequence's next command takes in the same tick (`FUN_0025f880` writes the rest back
 * through its dt, D:L108819-108822).
 */
export type OpTick = (dt: number) => boolean | number;

/**
 * `OBJECT_OPACITY_FROM_TO`'s run (PB-9b; research 284 s3, research 141 R141.12): the begin (`FUN_0025f960`
 * D:L108835-108847) writes `from` through `set` now; the returned tick (`FUN_0025f880` D:L108804-108832) adds `rate` x
 * dt while the command's time lasts -- the elapsed time plus this tick not past `seconds` -- and once it is past, writes
 * `to` and answers the rest of the tick. A tick of 0 writes nothing (the value it would write is the one it holds).
 */
export function opacityTick(op: Extract<EffectOp, { op: 'opacity' }>, set: (opacity: number) => void): OpTick {
  let value = op.from, elapsed = 0;
  set(value);
  return (dt) => {
    if (op.seconds < dt + elapsed) {
      const rest = dt - (op.seconds - elapsed);
      set(op.to);
      return rest;
    }
    elapsed += dt;
    if (dt === 0) return false;
    value += op.rate * dt;
    set(value);
    return false;
  };
}

/**
 * ZANIM_UNREAD_OPERAND_PLACEHOLDER (LATER 310, ruling R2 as narrowed by the review's F1; research 89 §18): an IF /
 * ELSEIF operand the reader keeps as an undecoded command (`EffectCondition` `other`: on the disc, set 0 commands 66, 70
 * and 72 -- numbered past the base set's `FUN_0025bc20` registrations -- and set 1's and set 2's) has no host that
 * answers it from a source. A condition holding one is folded with every answer of its unread operands, true and false
 * (its sourced operands asked once each, in order): where every answer gives one result, the sourced operands decide it
 * and it stands (Corpse_Found's `set 2 cmd 33 OR valve_aware == 1` at valve_aware 1, D:L108398-108402); where the unread
 * answer turns it, the condition keeps the runner's result before the fold, false -- so the fold's `NOT` cannot turn
 * an unread answer into a taken branch (`shell_smoke_med`'s `NOT set 0 cmd 70`, the camera checks' `NOT set 0 cmd 72`).
 * An unread command's tick may also act (the original runs every operand, D:L108380, D:L108389): neither form models
 * that. Settled by reading those commands' registering modules and their ticks.
 */
export const ZANIM_UNREAD_OPERAND_PLACEHOLDER = 'decidedElseFalse' as const;

/**
 * Unread operands a condition is tried over (2^n answers); past it, the pre-fold false. A bound of the port's: the disc's
 * conditions stay under it (`tools/test/effectConditionSweepDisc.test.ts`).
 */
const UNREAD_TRIED_MAX = 8;

/** An operand no host answers from a source (`ZANIM_UNREAD_OPERAND_PLACEHOLDER`). */
const unreadOperand = (c: EffectCondition): boolean => c.kind === 'other';

/** `FUN_0026d870`'s step for a guard or a cleanup sequence: one 1.0 s tick (D:L117118). */
const CLEANUP_DT = 1.0;

export interface EffectHost {
  /** Starts a command; a function is its tick (the sequence waits until it answers true), anything else is done. */
  begin(op: EffectOp, run: EffectRun): OpTick | void;
  /** A condition of an `IF` other than a random weight. */
  test(c: EffectCondition, run: EffectRun): boolean;
  /** `FUN_0025dcf0`: a unit draw, `rand() / 2^31`, for this run (`RANDOM_WEIGHT`, a `WAIT`'s range). */
  random(run: EffectRun): number;
}

interface SeqState {
  pc: number;
  done: boolean;
  /** A running timed command's tick, or a wait's time left. */
  tick: OpTick | null;
  waitLeft: number;
  waitFrames: number | null;
  loops: number;
  loopTime: number;
}

/**
 * Where the ops of one sequence jump: an IF/ELSEIF/ELSE's next branch, every branch opener's ENDIF, and a WHILE's
 * END_WHILE (`end`) and back (`next` of the END_WHILE).
 */
function branchTable(ops: readonly EffectOp[]): { next: Int32Array; end: Int32Array } {
  const next = new Int32Array(ops.length).fill(-1), end = new Int32Array(ops.length).fill(-1);
  const stack: number[][] = [];
  const loops: number[] = [], children: number[] = [];
  ops.forEach((o, i) => {
    if (o.op === 'forChildren') children.push(i);
    else if (o.op === 'endForChildren') {
      const f = children.pop();
      if (f !== undefined) end[f] = i;
    } else if (o.op === 'while') loops.push(i);
    else if (o.op === 'endWhile') {
      const w = loops.pop();
      if (w !== undefined) { end[w] = i; next[i] = w; }
    } else if (o.op === 'if') stack.push([i]);
    else if (o.op === 'elseif' || o.op === 'else') {
      const top = stack[stack.length - 1];
      if (!top) return;
      next[top[top.length - 1]!] = i;
      top.push(i);
    } else if (o.op === 'endif') {
      const top = stack.pop();
      if (!top) return;
      next[top[top.length - 1]!] = i;
      for (const j of top) end[j] = i;
    }
  });
  return { next, end };
}

/** One playing effect animation. */
export class EffectRun {
  private readonly seqs: SeqState[];
  private readonly tables: { next: Int32Array; end: Int32Array }[];
  private failed = false;
  /** PB-9b: its end has run (the cleanup sequence once). */
  private ended = false;
  /** Seconds since it started. */
  time = 0;

  constructor(readonly program: EffectProgram, private readonly host: EffectHost, readonly context: unknown = null) {
    this.tables = program.sequences.map((s) => branchTable(s.ops));
    // A sequence of activation 2 that the animation's own `CALL_SEQUENCE` names waits for the call (Frostfire's
    // `firey_flames` turns its vent lights on and off so); one no call names runs from the start, as the activation
    // gate does (`shell_eject`'s range test, `Anim_Params`' second offset) [reading: research 89 §12].
    const called = new Set<string>();
    for (const s of program.sequences) for (const o of s.ops) if (o.op === 'callSequence') called.add(o.sequence);
    // PB-9b: the cleanup sequence waits for the end (`EffectProgram.cleanup`).
    this.seqs = program.sequences.map((s, i) => ({
      pc: 0, done: i === program.cleanup || (s.activation === 2 && called.has(s.name)), tick: null, waitLeft: 0, waitFrames: null, loops: 0, loopTime: 0,
    }));
  }

  /** `CALL_SEQUENCE`: the named sequence starts again from its top. */
  callSequence(name: string): void {
    this.program.sequences.forEach((s, i) => {
      if (s.name !== name || i === this.program.cleanup) return;
      Object.assign(this.seqs[i]!, { pc: 0, done: false, tick: null, waitLeft: 0, waitFrames: null, loops: 0, loopTime: 0 });
    });
  }

  /** Paused (`PAUSE_ANIMATION`): alive -- its sources emit, its nodes stay -- with nothing run. */
  paused = false;

  get finished(): boolean {
    return this.failed || (!this.paused && this.seqs.every((s) => s.done));
  }

  /** Stops the whole animation (`FAIL`, or its owner); PB-9b: its cleanup sequence runs, once (`end`). */
  stop(): void {
    this.failed = true;
    this.end();
  }

  /**
   * PB-9b: the animation's end (`FUN_0026ff20(5)`): its cleanup sequence (`EffectProgram.cleanup`) from its top, one
   * 1.0 s step (`FUN_0026d870` D:L117101-117127, called at D:L118599), once.
   */
  private end(): void {
    if (this.ended) return;
    this.ended = true;
    const i = this.program.cleanup;
    const seq = i === undefined ? undefined : this.program.sequences[i];
    if (i === undefined || !seq) return;
    Object.assign(this.seqs[i]!, { pc: 0, done: false, tick: null, waitLeft: 0, waitFrames: null, loops: 0, loopTime: 0 });
    const failed = this.failed;
    this.failed = false;                             // the cleanup's own commands run though the animation stopped
    this.step(i, seq.ops, CLEANUP_DT);
    this.failed = failed;
    this.seqs[i]!.done = true;
  }

  /** Ends the sequence named `name` (`STOP_SEQUENCE`). */
  stopSequence(name: string): void {
    this.program.sequences.forEach((s, i) => { if (s.name === name) this.seqs[i]!.done = true; });
  }

  /** One tick of `dt` seconds for every sequence (the first tick with `dt` 0 runs the timeless commands at once). */
  update(dt: number): void {
    if (this.finished || this.paused) return;
    this.time += dt;
    this.program.sequences.forEach((seq, i) => this.step(i, seq.ops, dt));
    if (this.finished) this.end();                   // PB-9b: run off its end (or failed): the cleanup
  }

  private step(index: number, ops: readonly EffectOp[], dt: number): void {
    const s = this.seqs[index]!, table = this.tables[index]!;
    let budget = 512;                               // a runaway guard: a sequence that loops without waiting
    while (!s.done && !this.failed && budget-- > 0) {
      if (s.tick) {
        const done = s.tick(dt);
        if (done === false) return;
        s.tick = null;
        dt = typeof done === 'number' ? done : 0;      // PB-9b: a tick's rest goes on (`FUN_0025f880`)
        s.pc++;
        continue;
      }
      if (s.waitFrames !== null || s.waitLeft > 0) {
        if (s.waitFrames !== null) {
          if (--s.waitFrames > 0) return;             // WAIT n frames resumes n ticks after it began
          s.waitFrames = null;
        } else {
          s.waitLeft -= dt;
          if (s.waitLeft > 1e-9) return;
          s.waitLeft = 0;
        }
        dt = 0;
        s.pc++;
        continue;
      }
      if (s.pc >= ops.length) { s.done = true; return; }
      const op = ops[s.pc]!;
      switch (op.op) {
        case 'if': case 'elseif': {
          // Reached in order an ELSEIF closes a taken branch: on to the ENDIF.
          if (op.op === 'elseif') { s.pc = table.end[s.pc]! >= 0 ? table.end[s.pc]! + 1 : s.pc + 1; continue; }
          s.pc = this.branch(ops, table, s.pc);
          continue;
        }
        case 'else': s.pc = table.end[s.pc]! >= 0 ? table.end[s.pc]! + 1 : s.pc + 1; continue;
        case 'endif': s.pc++; continue;
        case 'wait': {
          if (op.frames !== null) s.waitFrames = op.frames;
          else s.waitLeft = op.seconds + (op.range ? op.range * this.host.random(this) : 0);
          if (s.waitFrames === null && s.waitLeft <= 0) s.pc++;
          else if (s.waitFrames !== null && s.waitFrames <= 0) { s.waitFrames = null; s.pc++; }
          else return;
          continue;
        }
        case 'loop': {
          s.loops++;
          s.loopTime += dt;
          const doneLooping = (op.count !== null && op.count !== -1 && s.loops >= op.count) || (op.seconds !== null && s.loopTime >= op.seconds);
          if (doneLooping) { s.pc++; continue; }
          s.pc = 0;
          return;                                   // once a tick: the sequence runs again from its start next tick
        }
        case 'stopSequence': this.stopSequence(op.sequence); s.pc++; continue;
        case 'callSequence': this.callSequence(op.sequence); s.pc++; continue;
        case 'pauseAnimation':
          // Index 0 (`NA`) names the animation itself (the torches'): paused, it stays alive with its sources.
          if (op.anim === this.program.name || op.anim === 'NA') { this.paused = true; s.pc++; return; }
          this.host.begin(op, this);
          s.pc++;
          continue;
        case 'while': {
          // Only the endless form is on the effects' path (the ripples); a conditional one is taken as false.
          s.pc = op.forever || table.end[s.pc]! < 0 ? s.pc + 1 : table.end[s.pc]! + 1;
          continue;
        }
        case 'endWhile': {
          const back = table.next[s.pc]!;
          if (back < 0) { s.pc++; continue; }
          s.pc = back;
          return;                                   // once a tick
        }
        // XR-04: the loop over a node's children is not run (research 213 s2.3; H99): on past its END_FOR_CHILDREN.
        case 'forChildren': s.pc = table.end[s.pc]! >= 0 ? table.end[s.pc]! + 1 : ops.length; continue;   // unpaired: nothing after it runs
        case 'endForChildren': s.pc++; continue;
        case 'fail': this.stop(); return;
        default: {
          const tick = this.host.begin(op, this);
          if (typeof tick === 'function') { s.tick = tick; continue; }
          s.pc++;
          continue;
        }
      }
    }
  }

  /** From an IF at `at`: the first branch whose conditions hold, or the ELSE, or past the ENDIF. */
  private branch(ops: readonly EffectOp[], table: { next: Int32Array; end: Int32Array }, at: number): number {
    let i = at;
    for (;;) {
      const op = ops[i]!;
      if (op.op === 'else') return i + 1;
      if (op.op === 'endif') return i + 1;
      if ((op.op === 'if' || op.op === 'elseif') && this.holds(op.conditions)) return i + 1;
      const n = table.next[i]!;
      if (n < 0) return ops.length;
      i = n;
    }
  }

  private holds(conditions: readonly EffectCondition[]): boolean {
    const ask = (c: EffectCondition): boolean => (c.kind === 'random' ? this.host.random(this) <= c.p : this.host.test(c, this));
    // `FUN_0025e960` (research 106 §3, 179 s9.9): the operands folded left to right through the EXPRESSION operators
    // between them (2 AND, 3 OR, 1 NOT, 4/5 a group), the same evaluator as the round's cues. Was every token's truth,
    // which read an operator as false: Enowapi's `woodgate == 0 OR woodgate2 == 0` never held (MAP-07).
    const unread = conditions.filter(unreadOperand);
    if (!unread.length) return evaluateCondition(conditions, ask);
    // ZANIM_UNREAD_OPERAND_PLACEHOLDER (LATER 310, R2 as narrowed): each sourced operand asked once, in order, as the fold
    // reaches it; the fold tried with every answer of the unread ones. One result: the sourced operands decide it.
    // Two: the unread answer turns it, and the condition keeps the pre-fold result, false.
    if (unread.length > UNREAD_TRIED_MAX) return false;
    const bit = new Map(unread.map((c, i) => [c, i]));
    const known = new Map<EffectCondition, boolean>();
    const results = new Set<boolean>();
    for (let m = 0; m < 2 ** unread.length; m++) {
      results.add(evaluateCondition(conditions, (c) => {
        const b = bit.get(c);
        if (b !== undefined) return ((m >> b) & 1) === 1;
        if (!known.has(c)) known.set(c, ask(c));
        return known.get(c)!;
      }));
    }
    return results.size === 1 ? results.has(true) : false;
  }
}
