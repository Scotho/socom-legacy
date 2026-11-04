import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { loadDialog } from '../src/dialog';
import { VALVE_TYPE, ValveStore } from '../src/valves';
import {
  NODE_NAME_MATCH_READING, dialogNodeTree, ZAnimRuntime, ZAnimUnsupportedError, quatProduct, zanimSlerp, zanimUnsupported,
  type ZAnimNode, type ZAnimNodeTree, type ZAnimRtAnimation, type ZAnimRtCommand, type ZAnimRtSequence, type ZAnimRtSet,
  type ZAnimTraceEvent, type ZAnimUiCommand,
} from '../src/zanimRuntime';

// Web research 106. Every expectation is transcribed from the retail decompilation (`D:L<line>` = a line of
// game/analysis/socom2_game.elf.decomp.c) or, for the three ticks it folds away, from their disassembly; the animations
// are synthetic, laid out as `@s2u/scene`'s `parseAnimSets` returns the disc's (the command sizes are the disc's,
// research 106 §4). No expected value was produced by running the runtime.

// ---------------------------------------------------------------------------------------------------------------------
// An assembler for synthetic sets.

/** The commands with no timeless bit on the disc (research 106 §4): QUAD_ALIGN, WAIT, the two motions, DEBUG, VALVE. */
const TIMED = new Set([1, 15, 22, 25, 52, 61]);

/** A command's bytes: the header (cmd, set << 8, bit 17 timeless, size << 18), then `fill` writes the payload. */
function cmd(set: number, n: number, size: number, fill?: (v: DataView, b: Uint8Array) => void): Uint8Array {
  const b = new Uint8Array(size), v = new DataView(b.buffer);
  const timeless = set === 0 ? !TIMED.has(n) : true;
  v.setUint32(0, (n | (set << 8) | (timeless ? 1 << 17 : 0) | (size << 18)) >>> 0, true);
  fill?.(v, b);
  return b;
}
const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** The names every synthetic animation shares: a command indexes them. */
const NAMES = ['NA', 'A', 'B', 'C', 'R', 'N', 'X', 'Y', 'Go', 'Order', 'Block', 'Ready', 'later', 'earlier', 'main', 'L', 'E', 'arg', 'Child', 'Other', 'guard'];
const ix = (name: string): number => { const i = NAMES.indexOf(name); if (i < 0) throw new Error(name); return i; };
/** The ops of `FUN_00353fd0` (research 104 §1). */
const OP = { TRUE: 0, NE: 1, EQ: 2, GT: 3, LT: 4, ORNOT: 9, SET: 11, ADD: 12, SUB: 13 } as const;

const valve = (name: string, op: number, operand: number): Uint8Array => cmd(0, 61, 16, (v) => {
  v.setUint32(4, ix(name), true); v.setUint32(8, operand >>> 0, true); v.setUint8(12, op); v.setUint8(13, 2);
});
const expr = (code: number): Uint8Array => cmd(0, 43, 8, (v) => v.setUint8(4, code));
const NOT = (): Uint8Array => expr(1), AND = (): Uint8Array => expr(2), OR = (): Uint8Array => expr(3);
const OPEN = (): Uint8Array => expr(4), CLOSE = (): Uint8Array => expr(5);
const withTokens = (n: number, depth: number, tokens: Uint8Array[]): Uint8Array => {
  const t = cat(...tokens);
  return cmd(0, n, 8 + t.length, (v, b) => { v.setUint8(4, depth); b.set(t, 8); });
};
const IF = (depth: number, ...t: Uint8Array[]): Uint8Array => withTokens(2, depth, t);
const ELSEIF = (depth: number, ...t: Uint8Array[]): Uint8Array => withTokens(3, depth, t);
const ELSE = (depth: number): Uint8Array => cmd(0, 4, 8, (v) => v.setUint8(4, depth));
const ENDIF = (depth: number): Uint8Array => cmd(0, 5, 8, (v) => v.setUint8(4, depth));
const WHILE = (forever: boolean, ...t: Uint8Array[]): Uint8Array => {
  const c = withTokens(39, 0, t);
  c[4] = forever ? 1 : 0;
  return c;
};
const END_WHILE = (): Uint8Array => cmd(0, 40, 8);
const BREAK = (): Uint8Array => cmd(0, 44, 4);
const FAIL = (): Uint8Array => cmd(0, 11, 4);
const WAIT = (s: number): Uint8Array => cmd(0, 15, 12, (v) => { v.setUint16(4, 9, true); v.setFloat32(8, s, true); });
const LOOP = (count: number): Uint8Array => cmd(0, 14, 12, (v) => { v.setUint32(4, 1, true); v.setInt32(8, count, true); });
const ACTIVE = (node: number, on: boolean): Uint8Array => cmd(0, 17, 8, (v) => { v.setUint16(4, on ? 1 : 0, true); v.setUint16(6, node, true); });
const OPACITY = (node: number, from: number, to: number, rate: number, time: number): Uint8Array => cmd(0, 25, 0x18, (v) => {
  v.setUint16(4, node, true); v.setFloat32(8, from, true); v.setFloat32(0xc, to, true); v.setFloat32(0x10, rate, true); v.setFloat32(0x14, time, true);
});
const CALL = (name: string, block: boolean, inherit = false): Uint8Array => cmd(0, 45, 20, (v) => { v.setUint16(4, (block ? 0x200 : 0) | (inherit ? 1 : 0), true); v.setUint8(7, ix(name)); });
const STOP_ANIMATION = (name: string): Uint8Array => cmd(0, 46, 8, (v) => v.setUint8(4, ix(name)));
const PAUSE_SELF = (): Uint8Array => cmd(0, 47, 8);
const CALL_SEQUENCE = (name: string): Uint8Array => cmd(0, 50, 8, (v) => v.setUint8(4, ix(name)));
const NODE_ACTIVE = (node: number, k: number): Uint8Array => cmd(0, 7, 8, (v) => { v.setUint16(4, k, true); v.setUint16(6, node, true); });
const RANDOM_WEIGHT = (w: number): Uint8Array => cmd(0, 10, 8, (v) => v.setFloat32(4, w, true));
const UI = (fn: string): Uint8Array => cmd(1, 1, 16, (v) => { v.setUint16(4, 0, true); v.setUint8(6, ix(fn)); v.setUint16(8, ix('arg'), true); });
/** OBJECT_MOTION_FROM_TO with a position block at 0x38 (size 100) or a scale block at 0x38 (size 92), as on the disc. */
const MOVE = (node: number, flags: number, time: number, pos?: { from: number[]; to: number[]; rate: number[] }, scl?: { from: number[]; to: number[]; rate: number[] }): Uint8Array =>
  cmd(0, 22, pos ? 100 : scl ? 92 : 56, (v) => {
    v.setUint16(4, flags, true); v.setUint8(6, node); v.setFloat32(0x34, time, true);
    const vec = (o: number, x: number[]): void => { x.forEach((k, i) => v.setFloat32(o + 4 * i, k, true)); };
    if (pos) { v.setUint16(0xc, 0x38, true); vec(0x38 + 4, pos.from); vec(0x38 + 0x10, pos.to); vec(0x38 + 0x1c, pos.rate); }
    if (scl) { v.setUint16(0x30, 0x38, true); vec(0x38, scl.from); vec(0x38 + 12, scl.to); vec(0x38 + 24, scl.rate); }
  });

interface SeqSpec { name: string; word?: number; commands: Uint8Array[] }

/** An animation laid out as `parseAnimSets` returns one: sequences one after another, each a 28-byte head, then its commands. */
function anim(name: string, seqs: SeqSpec[], opts: { flags?: number; guard?: string; nodes?: string[] } = {}): ZAnimRtAnimation {
  let at = 0;
  const sequences: ZAnimRtSequence[] = seqs.map((s) => {
    const offset = at;
    let o = offset + 0x1c;
    const commands: ZAnimRtCommand[] = s.commands.map((b) => {
      const h = new DataView(b.buffer, b.byteOffset).getUint32(0, true);
      const c = { offset: o, set: (h >>> 8) & 0xff, cmd: h & 0xff, timeless: (h & (1 << 17)) !== 0, size: h >>> 18, bytes: b };
      o += b.length;
      return c;
    });
    at = o;
    return { offset, name: s.name, word: s.word ?? 0x102, size: o - offset, commands };
  });
  const guard = opts.guard === undefined ? 0 : sequences.find((s) => s.name === opts.guard)!.offset;
  return {
    name, names: NAMES, nodeRefs: ['NA', ...(opts.nodes ?? ['n1', 'n2'])].map((n) => ({ name: n })),
    params: { flags: opts.flags ?? 0x22, priority: 3, seqOffsets: [0, guard, 0, 0], state: 1 }, sequences,
  };
}

/** WHILE ... END_WHILE with their +6 jumps patched: the WHILE's to its END_WHILE, the END_WHILE's to its WHILE (research 106 §4). */
function loopSeq(name: string, before: Uint8Array[], whileCmd: Uint8Array, body: Uint8Array[], after: Uint8Array[]): SeqSpec {
  const endWhile = END_WHILE();
  const commands = [...before, whileCmd, ...body, endWhile, ...after];
  let o = 0x1c;
  const offs = commands.map((c) => { const at = o; o += c.length; return at; });
  const w = commands.indexOf(whileCmd), e = commands.indexOf(endWhile);
  new DataView(whileCmd.buffer).setUint16(6, offs[e]!, true);
  new DataView(endWhile.buffer).setUint16(6, offs[w]!, true);
  return { name, commands };
}

/** A node tree that makes a node for any name it is asked for. */
function tree(): ZAnimNodeTree & { nodes: Map<string, ZAnimNode> } {
  const nodes = new Map<string, ZAnimNode>();
  return {
    nodes,
    node(name: string): ZAnimNode {
      let n = nodes.get(name);
      if (!n) { n = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], opacity: 1, active: true }; nodes.set(name, n); }
      return n;
    },
  };
}

interface Rig { tree: ZAnimNodeTree; rt: ZAnimRuntime; valves: ValveStore; calls: ZAnimUiCommand[]; answers: Map<string, boolean>; nodes: Map<string, ZAnimNode>; events: ZAnimTraceEvent[]; v(name: string): number }
function rig(anims: ZAnimRtAnimation[], seed: Record<string, number> = {}, random?: () => number): Rig {
  const valves = new ValveStore();
  for (const [k, x] of Object.entries(seed)) valves.set(k, x, VALVE_TYPE.PERM);
  const calls: ZAnimUiCommand[] = [], answers = new Map<string, boolean>(), events: ZAnimTraceEvent[] = [];
  const t = tree();
  const sets: ZAnimRtSet[] = [{ name: 'test.rdr', anims }];
  const rt = new ZAnimRuntime({
    sets, valves, nodes: t, trace: (e) => events.push(e), random,
    host: { uiCommand: (c) => { calls.push(c); return answers.get(c.fn ?? '') ?? true; } },
  });
  rt.activate();   // a start needs its set active (FUN_002734b0 D:L120734-120737)
  return { tree: t, rt, valves, calls, answers, nodes: t.nodes, events, v: (name) => valves.find(name)?.value ?? 0 };
}
const F = 1 / 60;

// ---------------------------------------------------------------------------------------------------------------------

describe('the condition evaluator (FUN_0025e960, D:L108302-108424)', () => {
  const branch = (...tokens: Uint8Array[]): ZAnimRtAnimation => anim('a', [{ name: 'NA', commands: [IF(1, ...tokens), valve('R', OP.SET, 1), ENDIF(1)] }]);

  it('reads left to right with no precedence: A OR B AND C is (A OR B) AND C (D:L108398-108409)', () => {
    // A=1, B=0, C=0: left to right (1 || 0) && 0 = false; NOT > AND > OR (sprint 5's reading) would give 1 || (0 && 0) = true.
    const r = rig([branch(valve('A', OP.NE, 0), OR(), valve('B', OP.NE, 0), AND(), valve('C', OP.NE, 0))], { A: 1, B: 0, C: 0 });
    r.rt.start('a'); r.rt.tick(F);
    expect(r.v('R')).toBe(0);
  });

  it('NOT inverts the next operand, a bracketed group included (D:L108329-108332, D:L108369-108372, D:L108383-108386)', () => {
    const notGroup = rig([branch(NOT(), OPEN(), valve('A', OP.NE, 0), OR(), valve('B', OP.NE, 0), CLOSE())], { A: 1, B: 0 });
    notGroup.rt.start('a'); notGroup.rt.tick(F);
    expect(notGroup.v('R')).toBe(0);                                  // !(1 || 0)
    const notFirst = rig([branch(NOT(), valve('A', OP.NE, 0), OR(), valve('B', OP.NE, 0))], { A: 1, B: 1 });
    notFirst.rt.start('a'); notFirst.rt.tick(F);
    expect(notFirst.v('R')).toBe(1);                                  // (!1) || 1
  });

  it('runs every operand: nothing short-circuits (D:L108380, D:L108389)', () => {
    const r = rig([branch(UI('A'), OR(), UI('B'))]);
    r.answers.set('A', true);
    r.rt.start('a'); r.rt.tick(F);
    expect(r.calls.map((c) => c.fn)).toEqual(['A', 'B']);
    expect(r.v('R')).toBe(1);
  });

  it('runs every operand of an AND whose left operand is false (D:L108398-108409: the operand is run before the combine)', () => {
    const r = rig([branch(UI('A'), AND(), UI('B'))]);
    r.answers.set('A', false);
    r.rt.start('a'); r.rt.tick(F);
    expect(r.calls.map((c) => c.fn)).toEqual(['A', 'B']);
    expect(r.v('R')).toBe(0);
  });

  it('an operand after a value with no operator ends the condition: the pc goes back to the last token (D:L108375-108379)', () => {
    // IF (A != 0) (Y = 5): true -> the step resumes after the first token and runs the second as a statement; false -> skipped.
    const make = (): ZAnimRtAnimation => anim('a', [{ name: 'NA', commands: [IF(1, valve('A', OP.NE, 0), valve('Y', OP.SET, 5)), ENDIF(1)] }]);
    const on = rig([make()], { A: 1 });
    on.rt.start('a'); on.rt.tick(F);
    expect(on.v('Y')).toBe(5);
    const off = rig([make()], { A: 0 });
    off.rt.start('a'); off.rt.tick(F);
    expect(off.v('Y')).toBe(0);
  });
});

describe('IF / ELSEIF / ELSE / ENDIF (FUN_0025e7a0 D:L108214-108282, FUN_0025e6d0 D:L108171-108197, FUN_0025e6a0 D:L108154-108155)', () => {
  const chain = (): ZAnimRtAnimation => anim('a', [{
    name: 'NA', commands: [
      IF(1, valve('N', OP.EQ, 1)), valve('R', OP.SET, 1),
      ELSEIF(1, valve('N', OP.EQ, 2)), valve('R', OP.SET, 2),
      ELSE(1), valve('R', OP.SET, 3), ENDIF(1),
    ],
  }]);
  it.each([[1, 1], [2, 2], [5, 3]])('N = %i takes branch %i, and the depth is back to 0', (n, branch) => {
    const r = rig([chain()], { N: n });
    const inst = r.rt.start('a')!;
    r.rt.tick(F);
    expect(r.v('R')).toBe(branch);
    expect(inst.sequences[0]!.depth).toBe(0);
  });

  it('a false IF skips to the ELSE of its own depth, past a nested IF and ENDIF (D:L108232-108262)', () => {
    const r = rig([anim('a', [{
      name: 'NA', commands: [
        IF(1, valve('A', OP.NE, 0)), IF(2, valve('B', OP.EQ, 0)), valve('X', OP.SET, 1), ELSE(2), valve('X', OP.SET, 2), ENDIF(2),
        ELSE(1), valve('R', OP.SET, 7), ENDIF(1),
      ],
    }])], { A: 0 });
    const inst = r.rt.start('a')!;
    r.rt.tick(F);
    expect([r.v('X'), r.v('R'), inst.sequences[0]!.depth]).toEqual([0, 7, 0]);
  });
});

describe('WHILE, END_WHILE, BREAK (FUN_0025e630 D:L108138-108145, FUN_0025e600 D:L108126-108127, FUN_0025e520 D:L108085-108117)', () => {
  it('END_WHILE jumps to its WHILE and ends the frame: one pass a frame; a false WHILE steps past its END_WHILE', () => {
    const r = rig([anim('a', [loopSeq('NA', [], WHILE(false, valve('N', OP.LT, 3)), [valve('N', OP.ADD, 1)], [valve('R', OP.SET, 1)])])]);
    r.rt.start('a');
    const seen: number[][] = [];
    for (let i = 0; i < 4; i++) { r.rt.tick(F); seen.push([r.v('N'), r.v('R')]); }
    expect(seen).toEqual([[1, 0], [2, 0], [3, 0], [3, 1]]);
  });

  it('BREAK walks on to the next END_WHILE, closing the IF it leaves, and the step goes past it', () => {
    const r = rig([anim('a', [loopSeq('NA', [], WHILE(true), [IF(1, valve('N', OP.EQ, 2)), BREAK(), ENDIF(1), valve('N', OP.ADD, 1)], [valve('R', OP.SET, 1)])])]);
    const inst = r.rt.start('a')!;
    const seen: number[][] = [];
    for (let i = 0; i < 3; i++) { r.rt.tick(F); seen.push([r.v('N'), r.v('R')]); }
    expect(seen).toEqual([[1, 0], [2, 0], [2, 1]]);
    expect(inst.sequences[0]!.depth).toBe(0);
  });
});

describe('WAIT (begin FUN_0025ed50 D:L108436-108448; tick zAnimWaitTick 0x25ec50-0x25ed4c, its disassembly)', () => {
  it('holds while elapsed + dt <= time (0x25ecac c.le.s), then passes the rest of the frame on (0x25ecb8-0x25ece8)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [WAIT(0.5), WAIT(0.05), valve('R', OP.SET, 1)] }])]);
    r.rt.start('a');
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) { r.rt.tick(0.2); seen.push(r.v('R')); }
    expect(seen).toEqual([0, 0, 1]);   // frame 3: 0.6 > 0.5 leaves 0.1, the second WAIT takes 0.05 of it
  });
  it('an exact fit is not enough: 0.25 + 0.25 <= 0.5 holds one more frame', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [WAIT(0.5), valve('R', OP.SET, 1)] }])]);
    r.rt.start('a');
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) { r.rt.tick(0.25); seen.push(r.v('R')); }
    expect(seen).toEqual([0, 0, 1]);
  });
  it('the exact fit holds the WAIT itself: a timeless command after it does not run in that frame (<=, not <)', () => {
    // With < the WAIT would be done in frame 2 with no time left, and the timeless ACTIVE after it would still run.
    const r = rig([anim('a', [{ name: 'NA', commands: [WAIT(0.5), ACTIVE(1, false)] }])]);
    r.rt.start('a');
    const seen: boolean[] = [];
    for (let i = 0; i < 3; i++) { r.rt.tick(0.25); seen.push(r.tree.node('n1')!.active); }
    expect(seen).toEqual([true, true, false]);
  });
});

describe('the step (FUN_00269da0 D:L114845-114910) and the command call (FUN_0026a6e0 D:L115182-115213)', () => {
  it('with no time left only a timeless command runs (D:L114886-114892)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [ACTIVE(1, false), valve('R', OP.SET, 1)] }])]);
    r.rt.start('a');
    r.rt.tick(0);
    expect([r.nodes.get('n1')?.active, r.v('R')]).toEqual([false, 0]);
    r.rt.tick(F);
    expect(r.v('R')).toBe(1);
  });
  it('a VALVE test as a statement is not done until true: the sequence waits on it (D:L114896-114899)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [valve('Go', OP.EQ, 1), valve('R', OP.SET, 1)] }])]);
    r.rt.start('a');
    r.rt.tick(F);
    expect(r.v('R')).toBe(0);
    r.valves.set('Go', 1, VALVE_TYPE.PERM);
    r.rt.tick(F);
    expect(r.v('R')).toBe(1);
  });
  it('a ui::UI_COMMAND answered false is ticked again next frame (FUN_002745a0 D:L121413-121415)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [UI('Ready'), valve('R', OP.SET, 1)] }])]);
    r.answers.set('Ready', false);
    r.rt.start('a');
    r.rt.tick(F);
    expect(r.v('R')).toBe(0);
    r.answers.set('Ready', true);
    r.rt.tick(F);
    expect([r.v('R'), r.calls.length, r.calls[0]!.fn, r.calls[0]!.arg, r.calls[0]!.node]).toEqual([1, 2, 'Ready', 'arg', null]);
  });
  it('a ui::UI_COMMAND naming a node still carries names[+6], the global table\'s key when the node does not take it (FUN_002745a0 D:L121387-121429)', () => {
    const c = cmd(1, 1, 16, (v) => { v.setUint16(4, 1, true); v.setUint8(6, ix('Go')); v.setUint16(8, ix('arg'), true); });
    const r = rig([anim('a', [{ name: 'NA', commands: [c] }])]);
    r.rt.start('a'); r.rt.tick(F);
    expect([r.calls[0]!.node, r.calls[0]!.opcodeByte, r.calls[0]!.fn]).toEqual(['n1', ix('Go'), 'Go']);
  });
  it("a ui::UI_COMMAND's host gets the tick's time by reference, the dispatcher's param_2 (FUN_0026a6e0 D:L115202-115208)", () => {
    const seen: Array<number | undefined> = [];
    const valves = new ValveStore();
    const rt = new ZAnimRuntime({
      sets: [{ name: 's', anims: [anim('a', [{ name: 'NA', commands: [UI('Go')] }])] }], valves, nodes: tree(),
      host: { uiCommand: (_c, time) => { seen.push(time?.v); return true; } },
    });
    rt.activate(); rt.start('a'); rt.tick(F);
    expect(seen).toEqual([F]);
  });
  it('FAIL is never done (tick 0x25dce0: return 0): the animation never ends', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [FAIL(), valve('R', OP.SET, 1)] }])]);
    r.rt.start('a');
    for (let i = 0; i < 3; i++) r.rt.tick(F);
    expect([r.v('R'), r.rt.isRunning('a')]).toEqual([0, true]);
  });
  it('throws on a command it does not implement (FUN_0025bc20 registers 58; OBJECT_MOTION, 21, is not one the disc uses)', () => {
    const a = anim('a', [{ name: 'NA', commands: [cmd(0, 21, 8)] }]);
    expect(zanimUnsupported({ name: 's', anims: [a] }).map((u) => u.cmd)).toEqual([21]);
    const r = rig([a]);
    r.rt.start('a');
    expect(() => r.rt.tick(F)).toThrow(ZAnimUnsupportedError);
  });
});

describe('LOOP (FUN_0025ede0 D:L108458-108472)', () => {
  it('restarts its sequence next frame; with flag 1 it is done when the count, never reset by a restart, reaches +8', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [valve('N', OP.ADD, 1), LOOP(3)] }])]);
    r.rt.start('a');
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) { r.rt.tick(F); seen.push(r.v('N')); }
    expect(seen).toEqual([1, 2, 3, 3, 3]);
    expect(r.rt.isRunning('a')).toBe(false);
  });
  it('a count of -1 never ends', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [valve('N', OP.ADD, 1), LOOP(-1)] }])]);
    r.rt.start('a');
    for (let i = 0; i < 6; i++) r.rt.tick(F);
    expect([r.v('N'), r.rt.isRunning('a')]).toEqual([6, true]);
  });
});

describe('VALVE through the store (FUN_00353fd0 D:L252142-252340; FUN_0026eb30 D:L117792-117841)', () => {
  it('makes a valve it names at TEMP on first use (FUN_00351ff0(name, 2), D:L117834)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [valve('X', OP.ADD, 2)] }])]);
    r.rt.start('a'); r.rt.tick(F);
    expect([r.valves.find('X')?.value, r.valves.find('X')?.type]).toEqual([2, VALVE_TYPE.TEMP]);
  });
  it('op 9 |~ is true whatever the value (D:L252209-252211); -= floors at 0 (D:L252244-252263)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [IF(1, valve('A', OP.ORNOT, 0xffff)), valve('R', OP.SET, 1), ENDIF(1), valve('B', OP.SUB, 5)] }])], { A: 0, B: 1 });
    r.rt.start('a'); r.rt.tick(F);
    expect([r.v('R'), r.v('B')]).toEqual([1, 0]);
  });
});

describe('the scheduler (FUN_0034e070 D:L248531-248567, FUN_0034e6b0 D:L248794-248846) and CALL_ANIMATION (FUN_0025d5c0, FUN_0025d550)', () => {
  // Research 363: CALL flag 1 copies instance inputs, 0x200 waits for the callee; a keyboard APPLY is an independent
  // event animation with its own explicit text. INPUT_STRING reads the currently executing instance, including guards.
  const inputRig = (anims: ZAnimRtAnimation[]) => {
    const inputs: { anim: string; text: string | null }[] = [];
    const rt: ZAnimRuntime = new ZAnimRuntime({
      sets: [{ name: 'test.rdr', anims }], valves: new ValveStore(), nodes: tree(),
      host: { uiCommand: (c) => { inputs.push({ anim: c.anim, text: rt.inputString(c.anim) }); return true; } },
    });
    rt.activate();
    return { rt, inputs };
  };

  it('CALL 0x201 preserves nested caller inputs while an independent event supplies different text', () => {
    const { rt, inputs } = inputRig([
      anim('A', [{ name: 'main', commands: [CALL('B', true, true), UI('Ready')] }]),
      anim('B', [{ name: 'main', commands: [CALL('C', true, true), UI('Ready')] }]),
      anim('C', [{ name: 'main', commands: [UI('Child'), WAIT(0.05), UI('Child')] }]),
      anim('Other', [{ name: 'main', commands: [UI('Other')] }]),
    ]);
    rt.start('A', undefined, 'selected game');
    rt.tick(F);
    expect(inputs).toEqual([{ anim: 'C', text: 'selected game' }]);
    expect([rt.isRunning('A'), rt.isRunning('B'), rt.isRunning('C')]).toEqual([true, true, true]);
    rt.start('Other', undefined, 'keyboard text');
    rt.tick(F);
    rt.tick(0.1);
    rt.tick(F);
    rt.tick(F);
    expect(inputs).toEqual([
      { anim: 'C', text: 'selected game' }, { anim: 'Other', text: 'keyboard text' },
      { anim: 'C', text: 'selected game' }, { anim: 'B', text: 'selected game' }, { anim: 'A', text: 'selected game' },
    ]);
  });

  it('CALL flag 0 passes no caller input to a fresh callee, while flag 1 can pass an explicit empty string', () => {
    const { rt, inputs } = inputRig([
      anim('A', [{ name: 'main', commands: [CALL('B', true), CALL('C', true, true)] }]),
      anim('B', [{ name: 'main', commands: [UI('Child')] }]),
      anim('C', [{ name: 'main', commands: [UI('Child')] }]),
    ]);
    rt.start('A', undefined, '');
    rt.tick(F); rt.tick(F); rt.tick(F);
    expect(inputs).toEqual([{ anim: 'B', text: null }, { anim: 'C', text: '' }]);
  });

  it('a refused start keeps the live input, and a later explicit restart replaces it', () => {
    const { rt, inputs } = inputRig([anim('A', [{ name: 'main', commands: [UI('Ready'), WAIT(0.05), UI('Ready')] }])]);
    rt.start('A', undefined, 'first'); rt.tick(F);
    expect(rt.start('A', undefined, 'refused')).toBeNull();
    expect(rt.inputString('A')).toBe('first');
    rt.tick(0.1);
    rt.start('A', undefined, 'second'); rt.tick(F);
    expect(inputs).toEqual([{ anim: 'A', text: 'first' }, { anim: 'A', text: 'first' }, { anim: 'A', text: 'second' }]);
  });

  it('a plain start does not replace a reused callee\'s previous input list with the caller\'s', () => {
    const { rt, inputs } = inputRig([
      anim('A', [{ name: 'main', commands: [CALL('B', true)] }]),
      anim('B', [{ name: 'main', commands: [UI('Ready')] }]),
    ]);
    rt.start('B', undefined, 'previous callee input'); rt.tick(F);
    rt.start('A', undefined, 'caller input'); rt.tick(F);
    expect(inputs).toEqual([{ anim: 'B', text: 'previous callee input' }, { anim: 'B', text: 'previous callee input' }]);
  });

  it('a parameterized start installs inputs before the active-set gate; a later plain start retains them', () => {
    // FUN_00272c30 D:L120405-120414 installs records before FUN_002734b0 checks the active set (D:L120734-120737).
    const { rt, inputs } = inputRig([anim('A', [{ name: 'main', commands: [UI('Ready')] }])]);
    rt.deactivate();
    expect(rt.start('A', undefined, 'installed while inactive')).toBeNull();
    rt.activate(); rt.start('A'); rt.tick(F);
    expect(inputs).toEqual([{ anim: 'A', text: 'installed while inactive' }]);
  });

  it.each([{ flags: 2, block: 0 }, { flags: 0x100, block: 0 }, { flags: 1, block: 4 }])('unsupported CALL arguments remain refused: %o', ({ flags, block }) => {
    const call = CALL('B', false);
    const v = new DataView(call.buffer);
    v.setUint16(4, flags, true); v.setUint16(0x10, block, true);
    const r = rig([anim('A', [{ name: 'main', commands: [call] }]), anim('B', [{ name: 'main', commands: [UI('Ready')] }])]);
    r.rt.start('A');
    expect(() => r.rt.tick(F)).toThrow(ZAnimUnsupportedError);
    expect(r.calls).toEqual([]);
  });

  it('INPUT_STRING resolves the current copy when several instances have the same animation name', () => {
    const { rt, inputs } = inputRig([anim('A', [{ name: 'main', commands: [UI('Ready'), WAIT(1)] }], { flags: 0xa2 })]);
    rt.start('A', undefined, 'first'); rt.start('A', undefined, 'second'); rt.tick(F);
    expect(inputs).toEqual([{ anim: 'A', text: 'first' }, { anim: 'A', text: 'second' }]);
  });

  it('a start installs its input before its guard and restores the caller context after a nested guard', () => {
    const inputs: { anim: string; text: string | null }[] = [];
    const rt: ZAnimRuntime = new ZAnimRuntime({
      sets: [{ name: 'test.rdr', anims: ['A', 'B'].map((name) => anim(name, [
        { name: 'main', commands: [WAIT(1)] }, { name: 'guard', word: 0x104, commands: [UI('Ready')] },
      ], { guard: 'guard' })) }], valves: new ValveStore(), nodes: tree(),
      host: { uiCommand: (c) => {
        inputs.push({ anim: c.anim, text: rt.inputString(c.anim) });
        if (c.anim === 'A') {
          rt.start('B', undefined, 'inner');
          inputs.push({ anim: c.anim, text: rt.inputString(c.anim) });
        }
        return true;
      } },
    });
    rt.activate(); rt.start('A', undefined, 'outer');
    expect(inputs).toEqual([{ anim: 'A', text: 'outer' }, { anim: 'B', text: 'inner' }, { anim: 'A', text: 'outer' }]);
  });

  it('a called animation joins the end of the list: it runs later in the same frame, after its caller\'s commands', () => {
    const caller = anim('a', [{ name: 'NA', commands: [CALL('B', false), valve('X', OP.SET, 1)] }]);
    const callee = anim('B', [{ name: 'NA', commands: [IF(1, valve('X', OP.EQ, 1)), valve('Y', OP.SET, 1), ELSE(1), valve('Y', OP.SET, 2), ENDIF(1)] }]);
    const r = rig([caller, callee]);
    r.rt.start('a'); r.rt.tick(F);
    expect(r.v('Y')).toBe(1);
  });
  it('flag 0x200 holds the caller while the callee is alive; it sees the end on the frame after (D:L107473-107481)', () => {
    const caller = anim('a', [{ name: 'NA', commands: [CALL('B', true), valve('X', OP.SET, 1)] }]);
    const callee = anim('B', [{ name: 'NA', commands: [WAIT(0.5), valve('Y', OP.SET, 1)] }]);
    const r = rig([caller, callee]);
    r.rt.start('a');
    const seen: number[][] = [];
    for (let i = 0; i < 4; i++) { r.rt.tick(0.2); seen.push([r.v('X'), r.v('Y')]); }
    expect(seen).toEqual([[0, 0], [0, 0], [0, 1], [1, 1]]);
  });
  it('a start of a running animation starts nothing: no copies are allowed (FUN_00270ef0 D:L119142-119216, flag 0x80 clear)', () => {
    const r = rig([anim('B', [{ name: 'NA', commands: [WAIT(1), valve('Y', OP.ADD, 1)] }])]);
    expect(r.rt.start('B')).not.toBeNull();
    r.rt.tick(0.6);
    expect(r.rt.start('B')).toBeNull();
    r.rt.tick(0.6);
    expect(r.v('Y')).toBe(1);
  });
  it('STOP_ANIMATION of a name this instance never called stops the definition (FUN_0025d490 D:L107448-107452)', () => {
    const r = rig([anim('A', [{ name: 'NA', commands: [WAIT(10)] }]), anim('C', [{ name: 'NA', commands: [STOP_ANIMATION('A')] }])]);
    r.rt.start('A'); r.rt.start('C');
    r.rt.tick(F);
    expect(r.rt.isRunning('A')).toBe(false);
  });
  it('an activation guard that does not finish in one 1.0-s step refuses the start (FUN_002734b0 D:L120743-120747, FUN_0026d870)', () => {
    const make = (): ZAnimRtAnimation => anim('a', [
      { name: 'main', commands: [valve('R', OP.SET, 1)] },
      { name: 'guard', word: 0x104, commands: [IF(1, valve('Block', OP.EQ, 1)), FAIL(), ENDIF(1)] },
    ], { guard: 'guard' });
    const blocked = rig([make()], { Block: 1 });
    expect(blocked.rt.start('a')).toBeNull();
    const open = rig([make()], { Block: 0 });
    expect(open.rt.start('a')).not.toBeNull();
    open.rt.tick(F);
    expect(open.v('R')).toBe(1);
  });
  it('a set\'s activation starts the animations whose flags & 7 are 1 (FUN_0026c600 D:L116340-116380, FUN_002713f0 D:L119327-119331)', () => {
    const r = rig([anim('auto', [{ name: 'NA', commands: [valve('A', OP.SET, 1)] }], { flags: 0x21 }), anim('manual', [{ name: 'NA', commands: [valve('B', OP.SET, 1)] }], { flags: 0x22 })]);
    r.rt.activate();
    r.rt.tick(F);
    expect([r.v('A'), r.v('B')]).toEqual([1, 0]);
  });
  it('a start in a set not yet activated starts nothing (FUN_002734b0 D:L120734-120737: the set\'s byte +1, set by FUN_0026c600 D:L116324-116325)', () => {
    const sets: ZAnimRtSet[] = [{ name: 'test.rdr', anims: [anim('a', [{ name: 'NA', commands: [valve('R', OP.SET, 1)] }])] }];
    const valves = new ValveStore();
    const rt = new ZAnimRuntime({ sets, valves, nodes: tree(), host: { uiCommand: () => true } });
    expect(rt.start('a')).toBeNull();
    rt.tick(F);
    expect(valves.find('R')?.value ?? 0).toBe(0);
    rt.activate('TEST.RDR');
    expect(rt.isActive('test.rdr')).toBe(true);
    expect(rt.start('a')).not.toBeNull();
    rt.tick(F);
    expect(valves.find('R')?.value).toBe(1);
  });
  it('a CALL_ANIMATION that resolves into a set not activated starts nothing, and a blocking call is not held (FUN_0025d550 D:L107473-107481)', () => {
    const sets: ZAnimRtSet[] = [
      { name: 'one.rdr', anims: [anim('a', [{ name: 'NA', commands: [CALL('B', true), valve('X', OP.SET, 1)] }])] },
      { name: 'two.rdr', anims: [anim('B', [{ name: 'NA', commands: [valve('Y', OP.SET, 1)] }])] },
    ];
    const valves = new ValveStore();
    const rt = new ZAnimRuntime({ sets, valves, nodes: tree(), host: { uiCommand: () => true } });
    rt.activate('one.rdr');
    rt.start('a'); rt.tick(F);
    expect([valves.find('X')?.value ?? 0, valves.find('Y')?.value ?? 0]).toEqual([1, 0]);
  });
  it('a set\'s deactivation stops every instance and clears the flag: starts are refused until it is activated again (FUN_0026c2e0 D:L116142-116181)', () => {
    const r = rig([anim('auto', [{ name: 'NA', commands: [valve('N', OP.ADD, 1), WAIT(10)] }], { flags: 0x21 }), anim('m', [{ name: 'NA', commands: [WAIT(10)] }])]);
    r.rt.start('m');
    r.rt.tick(F);
    expect([r.v('N'), r.rt.isRunning('auto'), r.rt.isRunning('m')]).toEqual([1, true, true]);
    r.rt.deactivate();
    expect([r.rt.isActive('test.rdr'), r.rt.isRunning('auto'), r.rt.isRunning('m'), r.rt.running().length]).toEqual([false, false, false, 0]);
    expect(r.rt.start('m')).toBeNull();
    r.rt.activate();                                                   // byte +1 is 0 again: FUN_0026c600 runs once more
    r.rt.tick(F);
    expect([r.v('N'), r.rt.isRunning('auto')]).toEqual([2, true]);
  });
  it('a set\'s deactivation stops every copy of an animation, not only its definition (FUN_0026c2e0 D:L116162-116172: the +100 chain)', () => {
    const r = rig([anim('c', [{ name: 'NA', commands: [WAIT(10)] }], { flags: 0xa2 })]);   // 0x80: copies allowed, no cap
    const a = r.rt.start('c')!, b = r.rt.start('c')!;
    expect([a !== b, a.next === b]).toEqual([true, true]);
    r.rt.tick(F);
    r.rt.deactivate();
    expect([a.alive, b.alive, r.rt.running().length]).toEqual([false, false, 0]);
  });
  it('a set\'s activation takes the disabled bit for every copy, not only the definition (FUN_0026c600 D:L116340-116344: the +100 chain)', () => {
    const c = anim('c', [{ name: 'NA', commands: [WAIT(10)] }], { flags: 0xa2 });
    const r = rig([c]);
    const a = r.rt.start('c')!, b = r.rt.start('c')!;
    r.rt.deactivate();
    c.params.flags |= 1 << 19;                                         // bit 19 is byte +6 bit 3 (D:L116342)
    r.rt.activate();
    expect([a.disabled, b.disabled]).toEqual([true, true]);
    r.rt.deactivate();
    c.params.flags &= ~(1 << 19);
    r.rt.activate();
    expect([a.disabled, b.disabled]).toEqual([false, false]);
  });
  it('a refused animation in a later set refuses the whole activation: no set is left active, nothing started', () => {
    const sets: ZAnimRtSet[] = [
      { name: 'one.rdr', anims: [anim('auto', [{ name: 'NA', commands: [valve('A', OP.SET, 1)] }], { flags: 0x21 })] },
      { name: 'two.rdr', anims: [anim('t', [{ name: 'NA', commands: [] }], { flags: 0x23 })] },
    ];
    const rt = new ZAnimRuntime({ sets, valves: new ValveStore(), nodes: tree(), host: { uiCommand: () => true } });
    expect(() => rt.activate()).toThrow(ZAnimUnsupportedError);
    expect([rt.isActive('one.rdr'), rt.isActive('two.rdr'), rt.running().length]).toEqual([false, false, 0]);
  });
  it('an animation whose activation bits are 3 (FUN_002740e0), or whose flags carry bit 11 (FUN_00271250 / FUN_00271390) or bit 12 (its own node, FUN_0026f210 D:L118066-118098), is refused, not dropped', () => {
    const three = anim('t', [{ name: 'NA', commands: [] }], { flags: 0x23 });
    const b11 = anim('b', [{ name: 'NA', commands: [] }], { flags: 0x822 });
    const b12 = anim('o', [{ name: 'NA', commands: [] }], { flags: 0x1022 });
    expect(zanimUnsupported({ name: 's', anims: [three, b11, b12] }).map((u) => u.anim)).toEqual(['t', 'b', 'o']);
    for (const a of [three, b11, b12]) {
      const rt = new ZAnimRuntime({ sets: [{ name: 's', anims: [a] }], valves: new ValveStore(), nodes: tree(), host: { uiCommand: () => true } });
      expect(() => rt.activate()).toThrow(ZAnimUnsupportedError);
    }
  });
  it('PAUSE_ANIMATION 0 pauses its own instance: the step stops at once, the tick skips it until resumed (FUN_0025d3d0 D:L107411-107413, D:L118626)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [PAUSE_SELF(), valve('R', OP.SET, 1)] }])]);
    const inst = r.rt.start('a')!;
    r.rt.tick(F); r.rt.tick(F);
    expect(r.v('R')).toBe(0);
    r.rt.resume(inst);
    r.rt.tick(F);
    expect(r.v('R')).toBe(1);
  });
});

describe("an instance's end and its sounds (FUN_0026ff20 -> FUN_0026fd20 D:L118572; PF-32, research 233 §3)", () => {
  it("an instance's end tells the host which animation stopped, a STOP_ANIMATION's and a natural end alike, once (FUN_0026ff20 D:L118572)", () => {
    const stopped: string[] = [];
    const sets: ZAnimRtSet[] = [{ name: 'test.rdr', anims: [
      anim('A', [{ name: 'NA', commands: [WAIT(10)] }]), anim('C', [{ name: 'NA', commands: [STOP_ANIMATION('A')] }]),
      anim('B', [{ name: 'NA', commands: [valve('Y', OP.ADD, 1)] }]),
    ] }];
    const rt = new ZAnimRuntime({
      sets, valves: new ValveStore(), nodes: tree(),
      host: { uiCommand: () => true, instanceStop: (name) => { stopped.push(name); } },
    });
    rt.activate();
    rt.start('A'); rt.start('B');
    rt.tick(F);                                                  // B runs to its end
    expect(stopped).toEqual(['B']);
    rt.start('C');
    rt.tick(F);                                                  // C stops A, then ends itself
    expect(stopped).toEqual(['B', 'A', 'C']);
    rt.stop(rt.find('A')!);                                      // a dead instance: nothing more
    rt.tick(F);
    expect(stopped).toEqual(['B', 'A', 'C']);
  });

  it("an instance's slot sounds are stopped before its cleanup sequence runs (FUN_0026fd20 D:L118572, then FUN_0026d870 D:L118599): a SOUND in the cleanup keeps playing", () => {
    // Latent on the disc: none of the menus' 399 SOUND commands sits in a cleanup sequence (research 233 s3.2).
    const log: string[] = [];
    const SOUND = cmd(0, 30, 0x18, (v) => { v.setUint16(4, 0x280, true); v.setUint16(6, ix('X'), true); });
    const a = anim('A', [{ name: 'main', commands: [WAIT(10)] }, { name: 'cleanup', word: 0x104, commands: [SOUND] }]);
    const cleanup = a.sequences.find((q) => q.name === 'cleanup')!.offset;
    const withCleanup: ZAnimRtAnimation = { ...a, params: { ...a.params, seqOffsets: [0, 0, 0, cleanup] } };
    const rt = new ZAnimRuntime({
      sets: [{ name: 'test.rdr', anims: [withCleanup] }], valves: new ValveStore(), nodes: tree(),
      host: { uiCommand: () => true, sound: (c) => { log.push(`sound ${c.sound}`); }, instanceStop: (name) => { log.push(`stop ${name}`); } },
    });
    rt.activate();
    rt.start('A');
    rt.tick(F);
    rt.stop(rt.find('A')!);
    expect(log).toEqual(['stop A', 'sound X']);
  });
});

describe('sequences (FUN_0026ae20 D:L115457-115509, FUN_00270220 D:L118640-118648, CALL_SEQUENCE FUN_00269b00 D:L114714-114760)', () => {
  const seqs = (tail: Uint8Array[]): ZAnimRtAnimation => anim('a', [
    { name: 'earlier', word: 0x104, commands: [valve('E', OP.SET, 1)] },
    { name: 'main', commands: [CALL_SEQUENCE('later'), CALL_SEQUENCE('earlier'), ...tail] },
    { name: 'later', word: 0x104, commands: [valve('L', OP.SET, 1)] },
  ]);
  it('activation 1 starts with the animation, 2 waits; a sequence started later in the list runs this frame, earlier ones next frame', () => {
    const r = rig([seqs([WAIT(1)])]);
    r.rt.start('a');
    r.rt.tick(F);
    expect([r.v('L'), r.v('E')]).toEqual([1, 0]);
    r.rt.tick(F);
    expect(r.v('E')).toBe(1);
  });
  it('each sequence is judged right after its own step: one started behind the walk does not keep the instance alive (D:L118642-118654)', () => {
    const r = rig([seqs([])]);
    r.rt.start('a');
    r.rt.tick(F);
    expect(r.rt.isRunning('a')).toBe(false);
    r.rt.tick(F);
    expect([r.v('L'), r.v('E')]).toEqual([1, 0]);
  });
});

describe('OBJECT_OPACITY_FROM_TO (begin FUN_0025f960 D:L108842-108845, tick FUN_0025f880 D:L108814-108831)', () => {
  it('starts at "from", adds rate x dt a frame, snaps to "to" when time < dt + elapsed and passes the rest on', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [OPACITY(1, 1, 0, -2 / 3, 1.5), valve('R', OP.SET, 1)] }])]);
    r.rt.start('a');
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) { r.rt.tick(0.5); seen.push(r.nodes.get('n1')!.opacity); }
    expect(seen[0]).toBeCloseTo(1 - 1 / 3, 6);
    expect(seen[1]).toBeCloseTo(1 / 3, 6);
    expect(seen[2]).toBeCloseTo(0, 6);   // 1.5 < 0.5 + 1.0 is false: still running
    expect(seen[3]).toBe(0);             // done: "to" exactly
    expect(r.v('R')).toBe(1);
  });
  it('steps by the stored rate, not by (to - from) / time: a rate of -0.5 over 1.5 s leaves 0.25 before the snap (note 106 §7)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [OPACITY(1, 1, 0, -0.5, 1.5)] }])]);
    r.rt.start('a');
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) { r.rt.tick(0.5); seen.push(r.nodes.get('n1')!.opacity); }
    expect(seen.slice(0, 3).map((x) => Math.round(x * 1e6) / 1e6)).toEqual([0.75, 0.5, 0.25]);   // interpolation: 2/3, 1/3, 0
    expect(seen[3]).toBe(0);
  });
});

describe('OBJECT_MOTION_FROM_TO (begin FUN_0025fe70 D:L109092-109340, tick FUN_0025f9b0 D:L108905-109030)', () => {
  it('flag 8 without 2: "from" is where the node is, the rate (to - from) / time, then "to" exactly', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [MOVE(1, 0x8, 1, { from: [0, 0, 0], to: [110, 20, 0], rate: [0, 0, 0] })] }])]);
    const n = r.tree.node('n1')!;
    n.position = [10, 20, 0];
    r.rt.start('a');
    r.rt.tick(0.25);
    expect(n.position[0]).toBeCloseTo(35, 4);
    for (let i = 0; i < 4; i++) r.rt.tick(0.25);
    expect(n.position).toEqual([110, 20, 0]);
  });
  it('flags 0xa: "from" stored -- the node is put there and the stored rate is used, not recomputed (D:L109231-109256)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [MOVE(1, 0xa, 1, { from: [0, 0, 0], to: [100, 0, 0], rate: [50, 0, 0] })] }])]);
    r.rt.start('a');
    r.rt.tick(0.5);
    expect(r.nodes.get('n1')!.position[0]).toBeCloseTo(25, 4);
  });
  it('flags 0x300: scale from the stored "from" at the stored rate, then "to" (D:L109310-109317, D:L108925-108939, D:L109019-109027)', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [MOVE(1, 0x300, 1, undefined, { from: [1, 1, 1], to: [2, 2, 2], rate: [1, 1, 1] })] }])]);
    r.rt.start('a');
    r.rt.tick(0.5);
    expect(r.nodes.get('n1')!.scale[0]).toBeCloseTo(1.5, 5);
    r.rt.tick(0.75);
    expect(r.nodes.get('n1')!.scale).toEqual([2, 2, 2]);
  });
  it('the slerp FUN_00306ae0 (D:L205945-205996): its ends, the shorter arc, a normalised lerp above a dot of 0.95', () => {
    const a = [0, 0, 0, 1], b = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    expect(zanimSlerp(0, a, b)).toEqual(a);
    expect(zanimSlerp(1, a, b)).toEqual(b);
    const mid = zanimSlerp(0.5, a, b);
    expect(mid[2]).toBeCloseTo(Math.sin(Math.PI / 8), 6);
    expect(zanimSlerp(0.5, a, [-0, -0, -b[2]!, -b[3]!])[3]).toBeGreaterThan(0);   // to negated onto the shorter arc
    const near = zanimSlerp(0.5, a, [0, 0, 0.1, Math.sqrt(1 - 0.01)]);
    expect(Math.hypot(...near)).toBeCloseTo(1, 6);
    expect(quatProduct([0, 0, 0, 1], b)).toEqual(b);
  });
});

describe('the condition tokens NODE_ACTIVE (FUN_0025e230 D:L107965-107984) and RANDOM_WEIGHT (FUN_0025dcf0 D:L107783-107792)', () => {
  it('NODE_ACTIVE: +4 1 "is active", 2 "is not"; a missing node is false', () => {
    const r = rig([anim('a', [{ name: 'NA', commands: [
      ACTIVE(1, false),
      IF(1, NODE_ACTIVE(1, 2)), valve('A', OP.SET, 1), ENDIF(1),
      IF(1, NODE_ACTIVE(1, 1)), valve('B', OP.SET, 1), ENDIF(1),
      IF(1, NODE_ACTIVE(0, 2)), valve('C', OP.SET, 1), ENDIF(1),
    ] }])]);
    r.rt.start('a'); r.rt.tick(F);
    expect([r.v('A'), r.v('B'), r.v('C')]).toEqual([1, 0, 0]);
  });
  it('RANDOM_WEIGHT: rand x 2^-31 <= the weight at +4', () => {
    const make = (): ZAnimRtAnimation => anim('a', [{ name: 'NA', commands: [IF(1, RANDOM_WEIGHT(0.5)), valve('R', OP.SET, 1), ENDIF(1)] }]);
    const low = rig([make()], {}, () => 0x3fffff00);      // (float) 0x3fffff00 x 2^-31 = 0.49999988
    low.rt.start('a'); low.rt.tick(F);
    const high = rig([make()], {}, () => 0x40000100);     // = 0.50000012 (the scale 4.656613e-10 is 2^-31 as an f32)
    high.rt.start('a'); high.rt.tick(F);
    expect([low.v('R'), high.v('R')]).toEqual([1, 0]);
  });
});

describe("the dialog's nodes (dialogNodeTree over PLAT-05's design)", () => {
  it("one node per dialogNodeNames name, at its record's XPOS, YPOS and OPACITY (DIALOG_NODE_STATE_READING), found by its exact name (NODE_NAME_MATCH_READING)", () => {
    const r = (...kv: (string | RdrNode)[]): RdrNode[] => {
      const out: RdrNode[] = [];
      for (let i = 0; i < kv.length; i += 2) { const v = kv[i + 1]!; out.push(kv[i] as string, Array.isArray(v) ? v : [v]); }
      return out;
    };
    const design = loadDialog([['SCREENS', r('OBJECTS', [r('NAME', 'MENUFADER', 'TYPE', 'IMAGE', 'XPOS', '12', 'YPOS', '34', 'OPACITY', '0.5', 'SPEC', r('FILENAME', 'x'))]), '0', '0']]);
    const t = dialogNodeTree(design);
    expect(t.node('menufader')).toBeUndefined();
    expect(t.node('MENUFADER')).toEqual({ position: [12, 34, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], opacity: 0.5, active: true });
    expect(t.node('nothing')).toBeUndefined();
  });
  it('two nodes whose names differ only by case stay two, each found by its exact name (FUN_00315d00 D:L215255-215290: strlen, then strcmp)', () => {
    const r = (...kv: (string | RdrNode)[]): RdrNode[] => {
      const out: RdrNode[] = [];
      for (let i = 0; i < kv.length; i += 2) { const v = kv[i + 1]!; out.push(kv[i] as string, Array.isArray(v) ? v : [v]); }
      return out;
    };
    const img = (name: string, x: string): RdrNode => r('NAME', name, 'TYPE', 'IMAGE', 'XPOS', x, 'YPOS', '0', 'SPEC', r('FILENAME', 'x'));
    // dlgLadderLobby.rdr's shape: the legend's `medal_blue` and the foot's `Medal_Blue` (research 269 §2.1, §4.2).
    const design = loadDialog([['SCREENS', r('OBJECTS', [img('medal_blue', '10'), img('Medal_Blue', '20')]), '0', '0']]);
    const t = dialogNodeTree(design);
    expect([t.node('medal_blue')?.position[0], t.node('Medal_Blue')?.position[0]]).toEqual([10, 20]);
    expect(t.node('medal_blue')).not.toBe(t.node('Medal_Blue'));
    // A name no node spells exactly finds none: no folding step (NODE_NAME_MATCH_READING).
    expect(t.node('MEDAL_BLUE')).toBeUndefined();
    expect(NODE_NAME_MATCH_READING).toBe('exact');
  });
});
