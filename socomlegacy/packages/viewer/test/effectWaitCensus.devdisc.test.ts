// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, parseAnimSets, ZANIM_COMMAND_NAMES, type EffectOp, type EffectProgram } from '@s2u/scene';
import { EffectRun, type EffectHost } from '../src/effectRunner';

/**
 * LATER 1426 (research 89 s1; reading, pending review): the shared runner's WAIT over the disc's plain WAIT sequences --
 * the census of pilot/kill/keyjob-later1426-wait-read.md s4: every map file's `CZANIM` and `MZANIM` members, one row per
 * distinct sequence (the archive kind, the animation, the sequence, its commands and the WAITs' bytes), "plain" when it
 * holds only timed WAITs (flags 0x9) and commands that take no time (the timeless ones but a branch, VALVE, QUAD_ALIGN).
 * Each is run by the runner at 60 Hz from its start (`update(0)`, then 1/60 a call) with a mark after its last WAIT, and
 * its end tick is held, sequence by sequence, against the original's rule in EXACT rational arithmetic on the STORED f32
 * seconds (r0004 0x25f7c0-0x25f8bc: begun and ticked in one call, held while dt + elapsed <= seconds, the leftover handed
 * on -- so a chain ends on floor(60 x the sum) + 1): 256 of 256 (WAIT_EQUALITY_HOLD_READING). A loop that repeats is held
 * to the same rule's period from a whole tick. Information, not pinned: against the port before LATER 1426 the 256 end
 * 168 later, 70 the same and 18 earlier (the leftover carried between WAITs); the refused options measured 98 / 130 / 28
 * (the f32 sum) and 243 of 256 (a plain double sum with a 1e-6 margin: 173 / 70 / 13, its 13 near-boundary ends a tick late). Of the 80 looping sequences 63 never repeat in the
 * port: a conditional WHILE taken as false (LATER 1435, out of this row).
 * Off the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`), skipped -- and said so.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const RUN = DISC ? join(DISC, 'RUN') : '';
const HAVE_DISC = RUN !== '' && existsSync(RUN) && readdirSync(RUN).some((f) => /\.ZDB$/i.test(f));

const F = 1 / 60;
const BRANCH = new Set(['IF', 'ELSEIF', 'ELSE', 'ENDIF', 'FOR_CHILDREN', 'END_FOR_CHILDREN', 'BREAK', 'FAIL']);

/** A double (an f32 widened) as an exact fraction: [numerator, a power-of-two denominator]. */
function exact(x: number): [bigint, bigint] {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0), lo = dv.getUint32(4), e = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (e) m |= 1n << 52n;
  const p = (e ? e : 1) - 1075;
  return p >= 0 ? [m << BigInt(p), 1n] : [m, 1n << BigInt(-p)];
}

/** The original's rule on the 1/60 grid, exactly: the chain's last WAIT ends on tick floor(60 x sum) + 1 of its first. */
function originalEnd(seconds: readonly number[]): number {
  let n = 0n, d = 1n;
  for (const s of seconds) { const [a, b] = exact(s); n = n * b + a * d; d *= b; }
  return Number((60n * n) / d) + 1;
}

/** The port's rule before LATER 1426, from a program's start: each WAIT begins without accruing, ends at a 1e-9 slack. */
function portBefore(seconds: readonly number[]): number {
  let tick = 0;
  for (const s of seconds) {
    let left = s;
    do { tick++; left -= F; } while (left > 1e-9);
  }
  return tick;
}

interface Plain { key: string; label: string; seconds: number[]; looping: boolean; ops: EffectOp[] }

function plainSequences(): Plain[] {
  const out = new Map<string, Plain>();
  for (const file of readdirSync(RUN).filter((x) => /\.ZDB$/i.test(x)).sort()) {
    const bytes = new Uint8Array(readFileSync(join(RUN, file)));
    const toc = parseZdb(bytes);
    for (const member of ['CZANIM.ZAR', 'MZANIM.ZAR']) {
      const arc = parseAnimSets(Zar.parse(zdbMember(bytes, toc, member)));
      for (const set of arc.sets) for (const anim of set.anims) {
        const program = decodeEffectProgram(anim);
        anim.sequences.forEach((seq, si) => {
          const names = seq.commands.map((c) => (c.set === 0 ? ZANIM_COMMAND_NAMES[c.cmd] ?? `s0c${c.cmd}` : `s${c.set}c${c.cmd}`));
          const waits = seq.commands.filter((_, i) => names[i] === 'WAIT');
          if (!waits.length) return;
          const plain = seq.commands.every((c, i) => names[i] === 'WAIT' || names[i] === 'VALVE' || names[i] === 'QUAD_ALIGN' || (c.timeless && !BRANCH.has(names[i]!)));
          const views = waits.map((c) => new DataView(c.bytes.buffer, c.bytes.byteOffset, c.bytes.byteLength));
          if (!plain || views.some((v) => v.getUint16(4, true) !== 0x9)) return;
          const hex = waits.map((c) => [...c.bytes].map((b) => b.toString(16).padStart(2, '0')).join('')).join(',');
          const key = `${member[0]}|${anim.name}|${si}|${names.map((n, i) => n + (seq.commands[i]!.timeless ? '*' : '')).join(' ')}|${hex}`;
          if (out.has(key)) return;
          const ops = program.sequences[si]!.ops;
          const seconds = views.map((v) => v.getFloat32(8, true));           // the stored f32, exactly
          const decoded = ops.filter((o): o is Extract<EffectOp, { op: 'wait' }> => o.op === 'wait').map((o) => o.seconds);
          expect(decoded, key).toEqual(seconds);
          out.set(key, {
            key, label: `${file.replace(/\.ZDB$/i, '')} ${anim.name}#${si}`, seconds,
            looping: names.some((n) => n === 'LOOP' || n === 'WHILE' || n === 'END_WHILE'), ops,
          });
        });
      }
    }
  }
  return [...out.values()];
}

/** The runner's ticks (from `update(0)` as 0) on which the mark after the sequence's last WAIT fires. */
function runnerMarks(p: Plain, ticks: number): number[] {
  let last = -1;
  p.ops.forEach((o, i) => { if (o.op === 'wait') last = i; });
  const ops: EffectOp[] = [...p.ops.slice(0, last + 1), { op: 'call', anim: '__mark' }, ...p.ops.slice(last + 1)];
  const program: EffectProgram = { name: 'census', root: 0, flags: 0, nodes: ['NA'], sequences: [{ name: 's', activation: 1, ops }] };
  const marks: number[] = [];
  let k = 0;
  const host: EffectHost = {
    begin: (op) => { if (op.op === 'call' && op.anim === '__mark') marks.push(k); },
    test: () => false,
    random: () => 0.5,
  };
  const run = new EffectRun(program, host);
  run.update(0);
  for (k = 1; k <= ticks && !run.finished; k++) run.update(F);
  return marks;
}

/**
 * The 13 near the boundary: a stored f32 just below a k/60 (0.35 s is 6.0e-9 under 21/60), which a plain double sum with
 * a 1e-6 margin held as equality, ending a tick late. Each by the first map that holds it, with its exact end tick.
 */
const NEAR_BOUNDARY: readonly [string, number][] = [
  ['M51 cigarette_flame#3', 21],
  ['M51 vomits#0', 27], ['M51 vomits#1', 27],
  ['M51 bullet_hit_gravel#5', 126], ['M51 bullet_hit_stone#5', 126],
  ['M51 bullet_hit_gravel#6', 132], ['M51 bullet_hit_stone#6', 132],
  ['M51 bullet_hit_grass#3', 192], ['M51 bullet_hit_leaves#3', 192], ['M51 bullet_hit_snow#3', 192],
  ['M51 Wsmoke_explode_Xlarge#0', 105],
  ['MP1 destroy_terrorist_base#4', 153], ['MP1 destroy_seal_base#4', 153],
];

describe.skipIf(!HAVE_DISC)(`LATER 1426: the disc's plain WAIT sequences under the shared runner${HAVE_DISC ? '' : ' (SOCOM_DISC with RUN/*.ZDB absent)'}`, () => {
  const plain = HAVE_DISC ? plainSequences() : [];

  it("every non-looping one ends on the original's rule, exactly on the stored seconds (256 of 256)", () => {
    const shift = { later: 0, same: 0, earlier: 0 };
    let n = 0;
    for (const p of plain.filter((q) => !q.looping)) {
      n++;
      const want = originalEnd(p.seconds);
      const [end] = runnerMarks(p, want + 2);
      expect(end, `${p.label} [${p.seconds.join(', ')}]`).toBe(want);
      const before = portBefore(p.seconds);
      if (want > before) shift.later++; else if (want === before) shift.same++; else shift.earlier++;
    }
    console.log(`LATER 1426 census (information): against the port before, ${JSON.stringify(shift)}`);
    expect(plain.length).toBe(336);
    expect(n).toBe(256);
  });

  it('the 13 near the boundary end on their exact ticks, by name', () => {
    const byLabel = new Map<string, Plain>();
    for (const p of plain) if (!byLabel.has(p.label)) byLabel.set(p.label, p);
    for (const [label, want] of NEAR_BOUNDARY) {
      const p = byLabel.get(label);
      expect(p, label).toBeDefined();
      expect(originalEnd(p!.seconds), label).toBe(want);
      expect(runnerMarks(p!, want + 2)[0], label).toBe(want);
    }
  });

  it("a looping one that repeats keeps the rule's period; 63 never repeat (LATER 1435: a conditional WHILE)", () => {
    let repeat = 0, never = 0;
    for (const p of plain.filter((q) => q.looping)) {
      const period = originalEnd(p.seconds);                      // from a whole tick after the restart
      const marks = runnerMarks(p, 3 * period + 4);
      if (marks.length < 3) { never++; continue; }
      repeat++;
      expect(marks[2]! - marks[1]!, p.label).toBe(period);
    }
    expect([repeat, never]).toEqual([17, 63]);
  });
});
