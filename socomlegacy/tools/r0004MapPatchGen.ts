/**
 * R4B-09 (G1): generates `packages/scene/src/r0004MapPatchTable.ts`, r0004's per-map collision edits, from the r0004
 * investigation's transcription v2 (`transcription-v2.json`, G1b, 2026-11-05: an emulation of the r0004 block
 * r4 0x2d4c20-0x2eb710 from the dispatcher's own branch per map; reading, pending review, R4B.R3). The input path is the
 * first argument; the output path the second (default: the scene package's table). The table is committed; this is how
 * it was made, and re-running it on the same input reproduces it byte for byte.
 *
 *   npx tsx tools/r0004MapPatchGen.ts <transcription-v2.json> [out.ts]
 *
 * Every float is carried as its IEEE-754 single bits, never as a decimal. What each operation means is the scene
 * package's `r0004MapPatch.ts`; this file only turns the transcription's records into those operations, in the order the
 * code runs them (see `ordered`). Nothing here is the game's: a record the transcription does not give is not invented,
 * and a record of a kind this file does not know stops it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Json = Record<string, unknown>;

/** The dispatcher's own code (r4 0x2d4c20-0x2d5220): its inline edits run after the map's routines (r4 0x2d4eec / 0x2d4f44 jal first). */
const DISPATCH_FROM = 0x2d4c20, DISPATCH_TO = 0x2d5220;
const inline = (pc: number): boolean => pc >= DISPATCH_FROM && pc < DISPATCH_TO;

const AXES: Record<string, number> = { x: 0, y: 1, z: 2 };
const hex = (n: number): string => `0x${(n >>> 0).toString(16).padStart(8, '0')}`;

const pcOf = (s: string): number => {
  const n = Number.parseInt(s, 16);
  if (!Number.isFinite(n)) throw new Error(`bad pc ${s}`);
  return n;
};
/** The bits in a guard's or a value's `(0x........)`, or of a bare `0x........`. */
function bitsOf(s: string): number {
  const m = /\(0x([0-9a-f]{8})\)/i.exec(s) ?? /^0x([0-9a-f]{8})$/i.exec(s.trim());
  if (!m) throw new Error(`no float bits in "${s}"`);
  return Number.parseInt(m[1]!, 16) >>> 0;
}
/** `#di*.v*.x`, `#di*.v2.y`: the vertex (null = the loop's) and the axis. */
function vertexAxis(s: string): { v: number | null; axis: number } {
  const m = /v(\*|\d+)\.([xyz])\b/.exec(s);
  if (!m) throw new Error(`no vertex.axis in "${s}"`);
  return { v: m[1] === '*' ? null : Number(m[1]), axis: AXES[m[2]!]! };
}
/** A node path as the transcription writes it (`land43/climber1`, `wc06/sandbag_turret.matrix`). */
const pathOf = (s: string): string[] => s.replace(/\.matrix$/, '').split('/');

interface Term { v: number | null; axis: number; cmp: 'gt' | 'lt' | 'eq'; bits: number }
function termOf(s: string): Term {
  let m = /#di\*\.(v(?:\*|\d+)\.[xyz])\s*([<>])\s*[-0-9.e+]+\((0x[0-9a-f]{8})\)/i.exec(s);
  if (m) return { ...vertexAxis(m[1]!), cmp: m[2] === '>' ? 'gt' : 'lt', bits: bitsOf(`(${m[3]})`) };
  m = /^[-0-9.e+]+\((0x[0-9a-f]{8})\)\s*==\s*\S+#di\*\.(v(?:\*|\d+)\.[xyz])$/i.exec(s.trim());
  if (m) return { ...vertexAxis(m[2]!), cmp: 'eq', bits: bitsOf(`(${m[1]})`) };
  throw new Error(`guard term not understood: "${s}"`);
}

/** One operation of the table, in the shape `r0004MapPatch.ts` reads (see `R0004Op` there). */
type Op = Json & { op: string; pc: number };

function polyOf(p: Json): Json {
  const word = Number.parseInt(String(p['word'] ?? (p['flags'] as Json | undefined)?.['word']), 16) >>> 0;
  const ptcount = (word >>> 2) & 0xff;
  const pts = (p['pointsHex'] as string[][] | undefined);
  if (!pts) throw new Error('a polygon without its points as hex');
  if (pts.length !== ptcount) throw new Error(`ptcount ${ptcount} but ${pts.length} points`);
  return { word, points: pts.flat().map((h) => Number.parseInt(h, 16) >>> 0) };
}

function mapOps(name: string, m: Json): Op[] {
  const rules = (m['probeRules'] as Json[]).map((r, i) => ({ r, i, pc: pcOf(String(r['pc'])) }));
  const main: Op[] = [];
  const late: Op[] = [];
  const push = (op: Op): void => { (inline(op.pc) ? late : main).push(op); };

  // The rules, grouped: consecutive stores under one guard on one node are one operation.
  let last: Op | null = null;
  for (const { r, pc } of rules) {
    const kind = String(r['kind']);
    if (kind === 'vertexSnap' || kind === 'vertexRelativeSnap') {
      const node = pathOf(String(r['polygonOwner'] ?? r['node']));
      const guard = (r['if'] as string[]).filter((t) => !t.startsWith('NOT(')).map(termOf);
      const { v, axis } = vertexAxis(String(r['field']));
      const store = kind === 'vertexSnap' ? { v, axis, set: bitsOf(String(r['value'])) } : { v, axis, sub: bitsOf(String(r['operand'])) };
      const key = JSON.stringify([node, guard]);
      if (r['elseBranchOf'] !== undefined) {
        // m52 (r4 0x2e6950-0x2e69c0): the else-if of the box before it, in the same vertex loop.
        if (!last || last['op'] !== 'snap' || JSON.stringify(last['node']) !== JSON.stringify(node)) throw new Error(`${name} ${r['pc']}: an else branch with no snap before it`);
        (last['branches'] as Json[]).push({ guard, stores: [store] });
        (last['pcs'] as string[]).push(String(r['pc']));
        continue;
      }
      if (last && last['op'] === 'snap' && last['key'] === key) {
        const branches = last['branches'] as Json[];
        (branches[branches.length - 1]!['stores'] as Json[]).push(store);
        (last['pcs'] as string[]).push(String(r['pc']));
        continue;
      }
      last = { op: 'snap', pc, pcs: [String(r['pc'])], node, key, branches: [{ guard, stores: [store] }] };
      push(last);
      continue;
    }
    last = null;
    if (kind === 'directIndexStore') {
      const idx = r['diIndices'] as number[];
      if (!Array.isArray(idx) || idx.length !== 1) throw new Error(`${name} ${r['pc']}: a direct store on ${JSON.stringify(idx)}`);
      push({ op: 'point', pc, pcs: [String(r['pc'])], node: pathOf(String(r['polygonOwner'])), poly: idx[0], ...vertexAxis(String(r['field'])), set: bitsOf(String(r['value'])) });
    } else if (kind === 'surfaceWordRewrite') {
      if (r['diIndices'] !== 'all') throw new Error(`${name} ${r['pc']}: a word rewrite on some polygons only`);
      push({ op: 'word', pc, pcs: [String(r['pc'])], node: pathOf(String(r['polygonOwner'])), and: bitsOf(String(r['wordAnd'])), or: bitsOf(String(r['wordOr'])) });
    } else if (kind === 'stopFlagClear') {
      push({ op: 'stopFlag', pc, pcs: [String(r['pc'])], node: pathOf(String(r['node'])), clear: true });
    } else if (kind === 'stopFlagCopy') {
      const from = /copy\/derived from (\S+)\.byte80/.exec(String(r['value']));
      if (!from) throw new Error(`${name} ${r['pc']}: a stop-flag copy with no source`);
      push({ op: 'stopFlag', pc, pcs: [String(r['pc'])], node: pathOf(String(r['node'])), copyFrom: pathOf(from[1]!) });
    } else if (kind === 'stopFlagNoop') {
      // r4 0x2dac28: g14_5's byte copied onto itself (the self-assign before it); nothing to do, kept for the count.
      push({ op: 'noop', pc, pcs: [String(r['pc'])], node: pathOf(String(r['node'])), why: 'stop flag copied onto itself' });
    } else if (kind === 'propMove') {
      const index = { m12: 12, m13: 13, m14: 14 }[String(r['field'])];
      if (index === undefined) throw new Error(`${name} ${r['pc']}: a matrix store on ${r['field']}`);
      const node = pathOf(String(r['node']));
      const value = String(r['value']);
      if (r['operand'] !== undefined) {
        const sub = / - -?[0-9.]+$/.test(value);
        if (!sub && !/ \+ -?[0-9.]+$/.test(value)) throw new Error(`${name} ${r['pc']}: a move "${value}"`);
        push({ op: 'move', pc, pcs: [String(r['pc'])], node, index, [sub ? 'sub' : 'add']: bitsOf(String(r['operand'])) });
      } else {
        push({ op: 'move', pc, pcs: [String(r['pc'])], node, index, set: bitsOf(value) });
      }
    } else if (kind === 'regionShift') {
      // m73's render regions (LATER 415): not collision, not ported here. Counted, not applied.
      push({ op: 'render', pc, pcs: [String(r['pc'])], node: pathOf(String(r['node'])), why: 'region shift (render side, LATER 415)' });
    } else {
      throw new Error(`${name} ${r['pc']}: a rule of kind ${kind} this generator does not know`);
    }
  }

  // The rest, inserted where their pc falls among the rules of the same routine (see `ordered`).
  const extra: Op[] = [];
  for (const n of m['newNodes'] as Json[]) {
    const pc = pcOf(String(n['ctorPc']));
    if (n['attached'] === false) {
      if ((n['polys'] as Json[]).length !== 0) throw new Error(`${name} ${n['ctorPc']}: a stray node with polygons`);
      extra.push({ op: 'stray', pc, pcs: [String(n['ctorPc'])], why: 'constructed, never attached; no polygon' });
      continue;
    }
    if (!/^identity/.test(String(n['matrix']))) throw new Error(`${name} ${n['ctorPc']}: a new node that is not at the identity`);
    const parentText = String(n['parent']);
    const parent = /^each direct child of the world root .* named (\S+)$/.exec(parentText);
    extra.push({
      op: 'addNode', pc, pcs: [String(n['ctorPc'])],
      parent: parent ? { worldChildrenNamed: parent[1] } : { name: parentText },
      polys: (n['polys'] as Json[]).map(polyOf),
    });
  }
  for (const a of m['polysAddedToExistingNodes'] as Json[]) {
    // The transcription gives these no pc of their own: G1b section 3 reads them from the stores after r4 0x2de76c (the
    // last of the wall-top snaps), appended in `appendOrder` -- so they are placed after those snaps.
    if (name !== 'mp61' || a['node'] !== 'di_ext01') throw new Error(`${name}: polygons added to ${String(a['node'])}, with no pc to order them`);
    const pc = 0x2de770;
    extra.push({ op: 'addPolys', pc, pcs: ['0x2de76c+'], node: pathOf(String(a['node'])), order: Number(a['appendOrder']), polys: [polyOf(a)] });
  }
  for (const s of m['setActive'] as Json[]) {
    const pc = pcOf(String(s['pc']));
    if (Number(s['value']) !== 0) throw new Error(`${name} ${s['pc']}: a SetActive(${s['value']})`);
    const grid = /^each world-grid node .* named (\S+)$/.exec(String(s['node']));
    if (grid) {
      extra.push({ op: 'hideGridNamed', pc, pcs: [String(s['pc'])], name: grid[1], box: (s['if'] as string[]).map((t) => {
        const g = /\.matrix\.m1([234])\s*([<>])\s*[-0-9.e+]+\((0x[0-9a-f]{8})\)/.exec(t);
        if (!g) throw new Error(`${name} ${s['pc']}: a grid box term "${t}"`);
        return { index: 10 + Number(g[1]), cmp: g[2] === '>' ? 'gt' : 'lt', bits: bitsOf(`(${g[3]})`) };
      }) });
    } else {
      if ((s['if'] as string[]).length !== 0) throw new Error(`${name} ${s['pc']}: a guarded SetActive`);
      extra.push({ op: 'hide', pc, pcs: [String(s['pc'])], node: pathOf(String(s['node'])) });
    }
  }
  for (const a of m['vectorAssigns'] as Json[]) {
    const pc = pcOf(String(a['pc']));
    if (a['dst'] === a['src']) { extra.push({ op: 'noop', pc, pcs: [String(a['pc'])], node: pathOf(String(a['dst'])), why: 'm_di assigned onto itself' }); continue; }
    extra.push({ op: 'assignDi', pc, pcs: [String(a['pc'])], node: pathOf(String(a['dst'])), from: pathOf(String(a['src'])) });
  }
  for (const r of m['rotY'] as unknown[][]) {
    const pc = pcOf(String(r[1]));
    if (r[0] === 'identity') extra.push({ op: 'identity', pc, pcs: [String(r[1])], node: pathOf(String(r[2])) });
    else if (r[0] === 'rotY') {
      if (r[2] !== r[3]) throw new Error(`${name} ${r[1]}: rotY into another matrix`);
      extra.push({ op: 'rotY', pc, pcs: [String(r[1])], node: pathOf(String(r[2])), angle: Number(r[4]) });
    } else throw new Error(`${name}: a matrix call ${String(r[0])}`);
  }
  return ordered(main, late, extra);
}

/**
 * The order the code runs them. The transcription keeps the rules in the order the emulation stored them (their own
 * order, a shared helper's sites included); the other records -- new nodes, `SetActive`, the vector assigns, the matrix
 * calls -- carry only their pc. Each is placed before the first rule of a higher pc that follows a rule of a lower one
 * in the same stretch of straight code, i.e. by pc within the routine; the dispatcher's inline code runs last (r4
 * 0x2d4eec-0x2d4f1c, 0x2d4f44-0x2d4ff4: the routines' `jal` come first). Where it matters -- an edit and the assign
 * beside it on one node (mp51 r4 0x2d6394 < 0x2d63e4 < 0x2d63f0 < 0x2d658c; mp62 0x2db454 < 0x2db4b8 < 0x2db4c4 <
 * 0x2db50c) and the barrels (0x2d6d24 < 0x2d6d3c < 0x2d6d58) -- the pcs are in one routine and ascend.
 */
function ordered(main: Op[], late: Op[], extra: Op[]): Op[] {
  const out = [...main];
  for (const e of extra.filter((x) => !inline(x.pc)).sort((a, b) => a.pc - b.pc)) {
    let at = out.findIndex((o, i) => o.pc > e.pc && (i === 0 || out[i - 1]!.pc <= e.pc));
    if (at < 0) at = out.length;
    out.splice(at, 0, e);
  }
  return [...out, ...late, ...extra.filter((x) => inline(x.pc)).sort((a, b) => a.pc - b.pc)];
}

function emitValue(v: unknown, indent: string): string {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0xffff ? hex(v) : String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean' || v === null) return String(v);
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'number')) return `[${v.map((x) => emitValue(x, indent)).join(', ')}]`;
    if (v.every((x) => typeof x === 'string')) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
    return `[\n${v.map((x) => `${indent}  ${emitValue(x, `${indent}  `)},`).join('\n')}\n${indent}]`;
  }
  const o = v as Json;
  const keys = Object.keys(o).filter((k) => k !== 'key' && k !== 'pc');
  return `{ ${keys.map((k) => `${k}: ${emitValue(o[k], indent)}`).join(', ')} }`;
}

function main(): void {
  const input = process.argv[2];
  if (!input) throw new Error('usage: tsx tools/r0004MapPatchGen.ts <transcription-v2.json> [out.ts]');
  const out = process.argv[3] ?? resolve(import.meta.dirname, '../packages/scene/src/r0004MapPatchTable.ts');
  const t = JSON.parse(readFileSync(input, 'utf8')) as Json;
  const maps = t['maps'] as Record<string, Json>;
  const lines: string[] = [];
  lines.push('// GENERATED by socomlegacy/tools/r0004MapPatchGen.ts from the r0004 transcription v2 -- do not edit by hand.');
  lines.push('/**');
  lines.push(' * R4B-09 (G1): r0004\'s per-map collision edits, one list per map, in the order the code runs them (research 383).');
  lines.push(' *');
  lines.push(' * The source: r0004\'s level loader r4 0x2d4c20, which its two callers reach in place of r0001\'s `FUN_001ea720`');
  lines.push(' * (D:L49713-49741; the `jal` at r4 0x1ebc04 and 0x1ebdd8). After the level loads and before `CMission_Open` it runs');
  lines.push(' * a `strstr` chain over the level\'s name (r4 0x2d4c68-0x2d5214) and the first match\'s routines (`R0004_DISPATCH`).');
  lines.push(' * Every value is the transcription\'s (`transcription-v2.json`, G1b 2026-11-05, an emulation of the r0004 block');
  lines.push(' * r4 0x2d4c20-0x2eb710): reading, pending review (R4B.R3). Floats are IEEE-754 single bits.');
  lines.push(' */');
  lines.push("import type { R0004MapEdits } from './r0004MapPatch';");
  lines.push('');
  lines.push('export const R0004_MAP_EDITS: Readonly<Record<string, R0004MapEdits>> = {');
  for (const [name, m] of Object.entries(maps)) {
    const ops = mapOps(name, m);
    lines.push(`  ${name}: {`);
    lines.push(`    dispatchEntry: ${JSON.stringify(m['dispatchEntry'])},`);
    lines.push(`    routines: ${JSON.stringify(m['routines'])},`);
    lines.push('    ops: [');
    for (const op of ops) lines.push(`      ${emitValue(op, '      ')},`);
    lines.push('    ],');
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  writeFileSync(out, lines.join('\n'));
  process.stdout.write(`wrote ${out}\n`);
}

main();
