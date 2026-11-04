/**
 * LATER 310's sweep: every scene program on the disc whose `IF` / `ELSEIF` condition carries an `EXPRESSION` operator
 * (43: 1 NOT, 2 AND, 3 OR, 4 `(`, 5 `)`), read through the repository's own readers -- `@s2u/archive` (`parseZdb`,
 * `Zar`), `@s2u/scene` (`parseAnimSets`, `decodeEffectProgram`, the decoder the world, the doors and the effects run)
 * and the viewer's `readActionRecords` for who starts a program -- and run through the viewer's own `EffectRun`.
 *
 * Before LATER 310, `EffectRun.holds` asked every token's truth (the base's `effectRunner.ts`, `conditions.every`), so an
 * operator read false and every such condition took its else branch (`holdsBefore` here transcribes it); and two
 * operands with no operator between them were both required, where the fold stops at the first. Now the runner folds the
 * tokens as `FUN_0025e960` does (D:L108288-108425; research 106 §3, research 89 §18). For each condition the sweep lists
 * its tokens, what it ran before and what it runs now at the initial state (every valve 0:
 * the world and the doors clear their valves at the round's reset, `WorldState.reset`, `DoorSet.reset`) and at every
 * state of the valves it names (each test's operand and its neighbours, and the values the map's programs set), a
 * `RANDOM_WEIGHT` or `RANGE_TEST` operand as either answer.
 *
 * It also counts the evaluator's edges (research 89 §18): two operands with no operator between them (the original
 * stops at the first and runs the rest as statements, D:L108375-108379), a trailing or leading operator, an empty group,
 * an operator byte outside 1..5, an unbalanced group, and a condition whose next command is an `EXPRESSION` or none (the
 * original reads on into the next command to find the condition's end).
 *
 * Product of a tool: no game run, nothing of the disc written; the table is printed by `tools/sweep-effect-conditions.ts`
 * and held by `tools/test/effectConditionSweepDisc.test.ts`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseZdb, Zar } from '@s2u/archive';
import {
  decodeEffectOp, decodeEffectProgram, isDestructibleAnim, NODE_CALLER, NODE_ROOT, parseAnimSets, ZANIM_COMMAND_NAMES, ZCMD,
  type EffectCondition, type EffectOp, type EffectProgram, type ZAnimAnimation,
} from '@s2u/scene';
import { EffectRun, type EffectHost } from '../packages/viewer/src/effectRunner';
import { valveTest } from '../packages/viewer/src/doors';
import { readActionRecords, type ActionRecord } from '../packages/viewer/src/mapActions';

/** The disc's `RUN` directory: `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; null without either. */
export function discRun(): string | null {
  const pc = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
  const disc = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : pc ? join(pc, 'game', 'disc') : null;
  const run = disc ? join(disc, 'RUN') : null;
  return run && existsSync(run) ? run : null;
}

/** Every map archive (`*.ZDB`) of the disc's `RUN`, by stem, sorted. */
export function mapStems(run: string): string[] {
  return readdirSync(run).filter((f) => /\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '')).sort();
}

const TEST = ['', '!=', '==', '>', '<', '>=', '<='];
const OPERATOR = ['?0', 'NOT', 'AND', 'OR', '(', ')'];
const SET = { 0x0b: '=', 0x0c: '+=', 0x0d: '-=', 0x0e: '*=' } as Record<number, string>;
const r = (n: number): string => String(Math.round(n * 1e4) / 1e4);

/** A valve test's valve as the condition names it: its own name, or the context's (flag bit 0, research 92). */
const valveName = (c: { valve: string; context?: true }): string => (c.context ? '<context>' : c.valve);

/**
 * One token as our reader decodes it (not decompiled text). An operand the reader keeps as `other` carries only its
 * command byte; `setCmd` (its header's set and command, `conditionHeaders`) names it `set:cmd`, the base set's by name.
 */
export function tokenText(c: EffectCondition, setCmd?: { set: number; cmd: number }): string {
  switch (c.kind) {
    case 'operator': return OPERATOR[c.operator] ?? `op${c.operator}`;
    case 'valve': return `${valveName(c)} ${c.operation === 0 ? 'true' : TEST[c.operation] ?? `test${c.operation}`} ${c.operand}`;
    case 'random': return `RANDOM_WEIGHT <= ${r(c.p)}`;
    case 'range': return `RANGE_TEST(0x${c.flags.toString(16)}, r2 ${r(c.rangeSquared)})`;
    case 'other':
      if (!setCmd) return `cmd ${c.cmd}`;
      return setCmd.set === 0 && ZANIM_COMMAND_NAMES[setCmd.cmd] ? ZANIM_COMMAND_NAMES[setCmd.cmd]! : `set ${setCmd.set} cmd ${setCmd.cmd}`;
  }
}
export const tokensText = (cs: readonly EffectCondition[], heads?: readonly { set: number; cmd: number }[]): string =>
  cs.map((c, i) => tokenText(c, heads?.[i])).join(' ');

/**
 * Each condition token's header (set, command) in an IF / ELSEIF / WHILE's bytes, read as `@s2u/scene`'s `conditions`
 * walks them (from +8, each sub-command's size in its header's bits 18-31; the set the type's high byte, `zanim.ts`).
 */
export function conditionHeaders(bytes: Uint8Array): { set: number; cmd: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out: { set: number; cmd: number }[] = [];
  let o = 8;
  while (o + 4 <= bytes.length) {
    const h = view.getUint32(o, true), size = h >>> 18;
    if (size < 4 || o + size > bytes.length) break;
    out.push({ set: (h >>> 8) & 0xff, cmd: h & 0xff });
    o += size;
  }
  return out;
}

/** The edges of `FUN_0025e960` a condition reaches, by name (research 89 §18). */
export type Edge = 'adjacentOperands' | 'trailingOperator' | 'leadingOperator' | 'emptyGroup' | 'operatorByte' | 'unbalanced' | 'runOn' | 'lastCommand';

/** The structural edges of one token list (the run-on and last-command edges need the sequence: `sweepMap`). */
export function conditionEdges(cs: readonly EffectCondition[]): Edge[] {
  const out = new Set<Edge>();
  // Per nesting level: whether a value is there with no binary operator pending since (an operand or a closed group).
  const level: { value: boolean; start: boolean }[] = [{ value: false, start: true }];
  let prev: EffectCondition | null = null;
  for (const t of cs) {
    const top = level[level.length - 1]!;
    if (t.kind === 'operator') {
      const o = t.operator;
      if (o < 1 || o > 5) out.add('operatorByte');
      if (o === 4) { level.push({ value: false, start: true }); prev = t; continue; }
      if (o === 5) {
        if (prev?.kind === 'operator' && prev.operator === 4) out.add('emptyGroup');
        if (level.length === 1) out.add('unbalanced');
        else level.pop();
        level[level.length - 1]!.value = true;
        level[level.length - 1]!.start = false;
        prev = t;
        continue;
      }
      if (o !== 1) {
        if (top.start) out.add('leadingOperator');
        top.value = false;
      }
      top.start = false;
      prev = t;
      continue;
    }
    if (top.value) out.add('adjacentOperands');
    top.value = true;
    top.start = false;
    prev = t;
  }
  if (level.length > 1) out.add('unbalanced');
  const last = cs[cs.length - 1];
  if (last?.kind === 'operator' && last.operator !== 5) out.add('trailingOperator');
  return [...out];
}

/** The base's `EffectRun.holds` (before LATER 310): every token's truth, an operator answered false by every host. */
export function holdsBefore(cs: readonly EffectCondition[], valueOf: (c: EffectCondition) => boolean): boolean {
  return cs.every((c) => (c.kind === 'operator' ? false : valueOf(c)));
}

/** One answer per operand: a valve's value by name, a random draw's or a range test's truth by its token index. */
interface State { valves: Map<string, number>; flags: Map<number, boolean> }

/**
 * Which branch the viewer's `EffectRun` takes on this condition in `state`: a one-IF program run once, the host
 * answering a valve test through `valveTest` (`doors.ts`, `FUN_00353fd0`'s tests), a random draw by its token's flag
 * (drawn true: -Infinity <= p; false: +Infinity), a range test by its flag, any other operand false (every host's).
 */
export function branchNow(cs: readonly EffectCondition[], state: State): 'then' | 'else' {
  const draws = cs.map((c, i) => (c.kind === 'random' ? (state.flags.get(i) ? -Infinity : Infinity) : null)).filter((x): x is number => x !== null);
  const log: string[] = [];
  const host: EffectHost = {
    begin: (op) => { if (op.op === 'call') log.push(op.anim); },
    test: (c) => {
      if (c.kind === 'valve') return valveTest(state.valves.get(valveName(c)) ?? 0, c.operation, c.operand);
      if (c.kind === 'range') return state.flags.get(cs.indexOf(c)) ?? false;
      return false;
    },
    random: () => draws.shift() ?? Infinity,
  };
  const program: EffectProgram = {
    name: 'sweep', root: 0, flags: 0, nodes: ['NA'],
    sequences: [{ name: 'NA', activation: 1, ops: [
      { op: 'if', conditions: [...cs] }, { op: 'call', anim: 'then' }, { op: 'else' }, { op: 'call', anim: 'else' }, { op: 'endif' },
    ] }],
  };
  new EffectRun(program, host).update(0);
  return log[0] === 'then' ? 'then' : 'else';
}

/** The same state through `holdsBefore`. */
export function branchBefore(cs: readonly EffectCondition[], state: State): 'then' | 'else' {
  return holdsBefore(cs, (c) => {
    if (c.kind === 'valve') return valveTest(state.valves.get(valveName(c)) ?? 0, c.operation, c.operand);
    if (c.kind === 'random' || c.kind === 'range') return state.flags.get(cs.indexOf(c)) ?? false;
    return false;
  }) ? 'then' : 'else';
}

const STATE_CAP = 256;

/**
 * Every state of a condition's operands: each valve over 0, each test's operand and its neighbours (not below 0) and the
 * values `sets` holds for it; each random draw and range test true and false. Null when there are more than 256.
 */
export function statesOf(cs: readonly EffectCondition[], sets: ReadonlyMap<string, ReadonlySet<number>>): State[] | null {
  const values = new Map<string, Set<number>>();
  const flags: number[] = [];
  cs.forEach((c, i) => {
    if (c.kind === 'valve') {
      const name = valveName(c), v = values.get(name) ?? new Set([0]);
      for (const x of [c.operand - 1, c.operand, c.operand + 1]) if (x >= 0) v.add(x);
      for (const x of sets.get(name) ?? []) v.add(x);
      values.set(name, v);
    } else if (c.kind === 'random' || c.kind === 'range') flags.push(i);
  });
  const names = [...values.keys()];
  let count = 2 ** flags.length;
  for (const n of names) count *= values.get(n)!.size;
  if (count > STATE_CAP) return null;
  let states: State[] = [{ valves: new Map(), flags: new Map() }];
  for (const n of names) {
    states = states.flatMap((s) => [...values.get(n)!].sort((a, b) => a - b).map((v) => ({ valves: new Map([...s.valves, [n, v]]), flags: s.flags })));
  }
  for (const i of flags) {
    states = states.flatMap((s) => [false, true].map((b) => ({ valves: s.valves, flags: new Map([...s.flags, [i, b]]) })));
  }
  return states;
}

export function stateText(cs: readonly EffectCondition[], s: State): string {
  const parts = [...s.valves].map(([n, v]) => `${n}=${v}`);
  for (const [i, b] of s.flags) parts.push(`${cs[i]!.kind === 'random' ? 'draw' : 'range'}@${i}=${b ? 'T' : 'F'}`);
  return parts.join(' ') || '(no operand state)';
}

const VISIBLE = new Set(['active', 'fromTo', 'motion', 'opacity', 'rotate', 'translate', 'particles', 'light', 'sound', 'destruction', 'call', 'executeAction', 'message']);

function nodeName(p: EffectProgram, n: number): string {
  if (n === NODE_ROOT) return 'root';
  if (n === NODE_CALLER) return 'caller';
  return p.nodes[n] ?? `#${n}`;
}

/** A branch's commands, short: what each does and to what. */
export function summarise(p: EffectProgram, ops: readonly EffectOp[]): string {
  const out = ops.map((o): string => {
    switch (o.op) {
      case 'active': return `${o.on ? 'on' : 'off'} ${nodeName(p, o.node)}`;
      case 'fromTo': case 'opacity': case 'rotate': case 'translate': return `${o.op} ${nodeName(p, o.node)}`;
      case 'motion': return 'motion';
      case 'sound': return `sound ${o.sound}`;
      case 'call': return `call ${o.anim}`;
      case 'executeAction': return `execute ${o.anim}`;
      case 'valve': return SET[o.operation] ? `${valveName(o)} ${SET[o.operation]} ${o.operand}` : `valve-test ${valveName(o)}`;
      case 'wait': return o.frames !== null ? `wait ${o.frames}f` : `wait ${r(o.seconds)}s`;
      case 'if': case 'elseif': return `${o.op.toUpperCase()} ${tokensText(o.conditions)}`;
      case 'else': return 'ELSE';
      case 'endif': return 'ENDIF';
      case 'callSequence': case 'stopSequence': return `${o.op} ${o.sequence}`;
      case 'stopAnimation': case 'pauseAnimation': return `${o.op} ${o.anim}`;
      case 'other': return o.name;
      default: return o.op;
    }
  }).join(', ');
  return out.length > 200 ? `${out.slice(0, 197)}...` : out || '(nothing)';
}

/** From an IF or ELSEIF at `at`: its own branch's commands and what follows it at its level (the next opener on). */
export function branches(ops: readonly EffectOp[], at: number): { then: EffectOp[]; rest: EffectOp[] } {
  let depth = 0, end = ops.length, close = ops.length;
  for (let i = at + 1; i < ops.length; i++) {
    const o = ops[i]!;
    if (o.op === 'if') depth++;
    else if (o.op === 'endif') {
      if (depth === 0) { if (end === ops.length) end = i; close = i; break; }
      depth--;
    } else if ((o.op === 'elseif' || o.op === 'else') && depth === 0 && end === ops.length) end = i;
  }
  const then = ops.slice(at + 1, end);
  const restStart = end < close && ops[end]!.op === 'else' ? end + 1 : end;
  const rest = end < close ? (ops[end]!.op === 'elseif' ? [ops[end]!] : ops.slice(restStart, close)) : [];
  return { then, rest };
}

export interface ConditionRow {
  map: string;
  member: string;
  program: string;
  sequence: string;
  /** The decoded op's index in its sequence (`decodeEffectProgram`, QUAD_ALIGN dropped). */
  at: number;
  kind: 'if' | 'elseif';
  tokens: string;
  edges: Edge[];
  roles: string[];
  then: string;
  otherwise: string;
  visible: boolean;
  /** The branch before and now at the initial state (every valve 0); 'draw' where a random or range operand decides it. */
  initialBefore: 'then' | 'else' | 'draw';
  initial: 'then' | 'else' | 'draw';
  /** Every state's branch before and now; null over the cap. */
  states: { state: string; before: 'then' | 'else'; now: 'then' | 'else' }[] | null;
  /** 'initial': now runs its branch at the initial state; 'state': at another; 'never': at none; 'unenumerated': past the
   * state cap, not enumerated (likely changes: its tokens carry an operator or two operands). */
  change: 'initial' | 'state' | 'never' | 'unenumerated';
}

export interface MapSweep {
  map: string;
  rows: ConditionRow[];
  /** Every IF / ELSEIF / WHILE with an edge, run-on and last-command included: map, member, program, sequence, tokens. */
  edges: { edge: Edge; where: string; tokens: string }[];
  /** Conditional WHILEs that carry an operator (the runner takes a conditional WHILE as false; not LATER 310's). */
  whiles: string[];
  /** IF / ELSEIF conditions read, with and without an operator. */
  conditions: number;
  errors: string[];
}

function rolesOf(anim: ZAnimAnimation, member: string, records: readonly ActionRecord[], callers: ReadonlyMap<string, string[]>): string[] {
  const n = anim.name.toLowerCase(), out: string[] = [];
  for (const a of records) if (a.anims.some((x) => x.toLowerCase() === n)) out.push(`${a.type || 'action'} ${a.node}${a.valve ? ` (valve ${a.valve})` : ''}`);
  if (isDestructibleAnim(anim)) out.push('destructible');
  if ((anim.params.flags & 7) === 1) out.push('autostart');
  for (const c of callers.get(n) ?? []) out.push(`called by ${c}`);
  if (n === 'objectives') out.push('the round script (roundCues reads it; the effect runner does not run it)');
  if (!out.length) out.push(`${member}: named by no data (the C code's, by name, or none)`);
  return out;
}

/** One map's sweep, from its archive's bytes. */
export function sweepMap(map: string, bytes: Uint8Array): MapSweep {
  const toc = parseZdb(bytes);
  const out: MapSweep = { map, rows: [], edges: [], whiles: [], conditions: 0, errors: [] };
  const { records, error } = readActionRecords(bytes, toc);
  if (error) out.errors.push(`actions.rdr: ${error}`);
  // Every zAnim archive the map carries, its programs decoded.
  const archives: { member: string; anims: ZAnimAnimation[] }[] = [];
  for (const e of toc.filter((t) => /ZANIM\.ZAR$/i.test(t.name))) {
    try {
      archives.push({ member: e.name, anims: parseAnimSets(Zar.parse(bytes.subarray(e.offset, e.offset + e.size))).sets.flatMap((s) => s.anims) });
    } catch (err) {
      out.errors.push(`${e.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const programs = new Map<ZAnimAnimation, EffectProgram>();
  for (const { anims } of archives) {
    for (const a of anims) {
      try { programs.set(a, decodeEffectProgram(a)); } catch (err) { out.errors.push(`${a.name}: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }
  // Who calls whom (CALL_ANIMATION; EXECUTE_ACTION through the action whose valve it names), and every valve a program sets.
  const callers = new Map<string, string[]>();
  const sets = new Map<string, Set<number>>();
  const addCaller = (callee: string, by: string): void => {
    const k = callee.toLowerCase(), l = callers.get(k) ?? [];
    if (!l.includes(by)) l.push(by);
    callers.set(k, l);
  };
  for (const [a, p] of programs) {
    for (const s of p.sequences) {
      for (const o of s.ops) {
        if (o.op === 'call') addCaller(o.anim, a.name);
        if (o.op === 'executeAction') {
          for (const rec of records) if (rec.valve.toLowerCase() === o.anim.toLowerCase()) for (const x of rec.anims.slice(0, 1)) addCaller(x, `${a.name} (execute ${o.anim})`);
        }
        if (o.op === 'valve' && o.operation === 0x0b) {
          const v = sets.get(valveName(o)) ?? new Set<number>();
          v.add(o.operand);
          sets.set(valveName(o), v);
        }
      }
    }
  }
  for (const { member, anims } of archives) {
    for (const anim of anims) {
      const p = programs.get(anim);
      if (!p) continue;
      anim.sequences.forEach((seq, si) => {
        // The run-on and last-command edges, on the raw commands: the original reads on into the command after the IF.
        seq.commands.forEach((c, k) => {
          if (c.set !== 0 || (c.cmd !== ZCMD.IF && c.cmd !== ZCMD.ELSEIF && c.cmd !== ZCMD.WHILE)) return;
          const op = decodeEffectOp(c, anim.names);
          const cs = op.op === 'if' || op.op === 'elseif' ? op.conditions : op.op === 'while' ? op.conditions ?? [] : [];
          if (!cs.length) return;
          const where = `${map} ${member} ${anim.name} / ${seq.name}`;
          const next = seq.commands[k + 1];
          const edges = conditionEdges(cs);
          if (!next) edges.push('lastCommand');
          else if (next.set === 0 && next.cmd === ZCMD.EXPRESSION) edges.push('runOn');
          for (const edge of edges) out.edges.push({ edge, where: `${where} (${ZANIM_COMMAND_NAMES[c.cmd]})`, tokens: tokensText(cs, conditionHeaders(c.bytes)) });
          if (op.op === 'while' && cs.some((t) => t.kind === 'operator')) out.whiles.push(`${where}: ${tokensText(cs, conditionHeaders(c.bytes))}`);
        });
        const ops = p.sequences[si]!.ops;
        const raw = seq.commands.filter((c) => !(c.set === 0 && c.cmd === ZCMD.QUAD_ALIGN));   // as decodeEffectProgram drops them
        ops.forEach((o, at) => {
          if (o.op !== 'if' && o.op !== 'elseif') return;
          out.conditions++;
          const cs = o.conditions;
          // LATER 310 changes a condition with an operator, and one of two operands or more with none between them (the
          // base asked every one; the fold stops at the first): the rest read the same before and now.
          if (!cs.some((t) => t.kind === 'operator') && cs.length < 2) return;
          const { then, rest } = branches(ops, at);
          const states = statesOf(cs, sets);
          const isInitial = (s: State): boolean => [...s.valves.values()].every((v) => v === 0);
          const one = (bs: readonly ('then' | 'else')[]): 'then' | 'else' | 'draw' => (bs.length && bs.every((b) => b === bs[0]) ? bs[0]! : 'draw');
          const rows = states?.map((s) => ({ state: stateText(cs, s), initial: isInitial(s), before: branchBefore(cs, s), now: branchNow(cs, s) })) ?? null;
          const init = rows?.filter((x) => x.initial) ?? [];
          const change: ConditionRow['change'] = rows === null ? 'unenumerated' : init.some((x) => x.now !== x.before) ? 'initial' : rows?.some((x) => x.now !== x.before) ? 'state' : 'never';
          out.rows.push({
            map, member, program: anim.name, sequence: seq.name, at, kind: o.op, tokens: tokensText(cs, raw[at] ? conditionHeaders(raw[at]!.bytes) : undefined), edges: conditionEdges(cs),
            roles: rolesOf(anim, member, records, callers), then: summarise(p, then), otherwise: summarise(p, rest),
            visible: [...then, ...rest].some((x) => VISIBLE.has(x.op)),
            initialBefore: one(init.map((x) => x.before)), initial: one(init.map((x) => x.now)),
            states: rows?.map(({ state, before, now }) => ({ state, before, now })) ?? null, change,
          });
        });
      });
    }
  }
  return out;
}

/** Every map of the disc's `RUN`, one at a time. */
export function sweepDisc(run: string, stems = mapStems(run)): MapSweep[] {
  return stems.map((m) => sweepMap(m, new Uint8Array(readFileSync(join(run, `${m}.ZDB`)))));
}

/** The rows grouped across maps: one row per identical condition (a common archive's program repeats on every map). */
export interface GroupedRow extends Omit<ConditionRow, 'map' | 'roles'> { maps: string[]; roles: string[] }

export function groupRows(sweeps: readonly MapSweep[]): GroupedRow[] {
  const by = new Map<string, GroupedRow>();
  for (const row of sweeps.flatMap((s) => s.rows)) {
    const key = JSON.stringify([row.member, row.program, row.sequence, row.at, row.kind, row.tokens, row.then, row.otherwise, row.states, row.initial, row.initialBefore]);
    const g = by.get(key);
    if (g) {
      g.maps.push(row.map);
      for (const x of row.roles) if (!g.roles.includes(x)) g.roles.push(x);
    } else {
      const { map, roles, ...rest } = row;
      by.set(key, { ...rest, maps: [map], roles: [...roles] });
    }
  }
  const rank = { initial: 0, state: 1, unenumerated: 2, never: 3 } as const;
  return [...by.values()].sort((a, b) => rank[a.change] - rank[b.change] || Number(b.visible) - Number(a.visible)
    || a.maps[0]!.localeCompare(b.maps[0]!) || a.program.localeCompare(b.program) || a.at - b.at);
}

const cell = (s: string): string => s.replace(/\|/g, '\\|');

/** A row's states, short: the states where it runs its own branch, before or now. */
export function branchText(g: Pick<GroupedRow, 'states'>, when: 'before' | 'now'): string {
  if (!g.states) return 'over 256 states (not enumerated)';
  const then = g.states.filter((s) => s[when] === 'then').map((s) => s.state);
  if (!then.length) return 'else at every state';
  if (then.length === g.states.length) return 'its branch at every state';
  return `its branch at ${then.join('; ')}`;
}

/**
 * The table: what changes first (at the initial state, then at a state a player sets, then the conditions past the state
 * cap, then never), visible first.
 */
export function formatTable(rows: readonly GroupedRow[]): string {
  const lines = [
    '| # | change | maps | program (archive) | sequence, op | IF tokens | before: initial; states | now: initial; states | its branch / else | who runs it |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  rows.forEach((g, i) => {
    lines.push(`| ${i + 1} | ${g.change}${g.visible ? ', visible' : ''} | ${g.maps.join(' ')} | \`${g.program}\` (${g.member}) | ${g.sequence}, ${g.kind} @${g.at} | \`${cell(g.tokens)}\` | ${g.initialBefore}; ${cell(branchText(g, 'before'))} | ${g.initial}; ${cell(branchText(g, 'now'))} | ${cell(g.then)} / ${cell(g.otherwise)} | ${cell(g.roles.join('; '))} |`);
  });
  return lines.join('\n');
}

/** The edges, counted by kind, each with its places. */
export function formatEdges(sweeps: readonly MapSweep[]): string {
  const all = sweeps.flatMap((s) => s.edges);
  const kinds: Edge[] = ['adjacentOperands', 'trailingOperator', 'leadingOperator', 'emptyGroup', 'operatorByte', 'unbalanced', 'runOn', 'lastCommand'];
  return kinds.map((k) => {
    const hit = all.filter((e) => e.edge === k);
    return `${k}: ${hit.length}${hit.length ? `\n${hit.map((e) => `  ${e.where}: ${e.tokens}`).join('\n')}` : ''}`;
  }).join('\n');
}
