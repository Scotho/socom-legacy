/**
 * Research 448: every activation-2 zAnim sequence on the disc, by what can start it in the original. The start runs the
 * activation-1 sequences only (`FUN_0026ae20` D:L115457-115509); any other runs when a start by name reaches it
 * (`FUN_00269b00` D:L114701-114760: the animation's `CALL_SEQUENCE`, an `OBJECT_MOTION`'s material sequence, the game's
 * own start -- AI names only), or by an `Anim_Params` offset (damage +0x10, activation +0x12, execution +0x14, cleanup
 * +0x16; research 106 §1). A sequence nothing names is `UNCALLED`: the original never runs it; before research 448 the
 * port's effect runner ran it from the start. `shadowed` marks a named one an earlier sequence of the same name stands
 * in front of (a start by name takes the first of the name not running).
 *
 *   npx tsx tools/activation-census.ts                 # every map: SOCOM_DISC/RUN, else public/maps/RUN, else the fixtures
 *   npx tsx tools/activation-census.ts --dir <RUN dir> # that directory's *.ZDB (+ MPZANIM.ZAR / EXTZANIM.ZAR beside them)
 *   npx tsx tools/activation-census.ts --effects       # only the CZANIM / MZANIM programs (no front-end archives)
 *
 * Read-only: it opens the disc's files through the repository's readers and prints; nothing is written.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { decodeEffectProgram, parseAnimSets, type EffectProgram } from '@s2u/scene';

const web = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const at = args.indexOf('--dir');
const candidates = [
  at >= 0 ? args[at + 1] : undefined,
  process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC, 'RUN') : undefined,
  resolve(web, 'public/maps/RUN'),
  resolve(web, 'test-fixtures/RUN'),
].filter((d): d is string => !!d);
const dir = candidates.find((d) => existsSync(d) && readdirSync(d).some((f) => /\.ZDB$/i.test(f)));
if (!dir) throw new Error(`no *.ZDB in ${candidates.join(', ')}`);
const effectsOnly = args.includes('--effects');

interface Row { where: string; anim: string; seq: number; name: string; kind: string; ops: string; selfStart: boolean; loops: string[] }
const rows: Row[] = [];

function scan(where: string, zar: Zar): void {
  for (const set of parseAnimSets(zar).sets) for (const a of set.anims) {
    let p: EffectProgram;
    try { p = decodeEffectProgram(a); } catch { continue; }
    const offsets = (a.params.seqOffsets ?? []).filter((o) => o > 0);
    const named = new Set<string>();
    for (const s of p.sequences) for (const o of s.ops) {
      if (o.op === 'callSequence') named.add(o.sequence);
      if (o.op === 'motion') for (const m of o.motion.materials) if (m.sequence) named.add(m.sequence);
    }
    p.sequences.forEach((s, i) => {
      if (s.activation === 1) return;
      let kind: string;
      if (offsets.includes(a.sequences[i]!.offset)) kind = 'params-offset';
      else if (named.has(s.name)) kind = p.sequences.slice(0, i).some((t) => t.name === s.name) ? 'named-shadowed' : 'named';
      else kind = 'UNCALLED';
      const loops = s.ops.filter((o) => o.op === 'sound' && o.sound.startsWith('~')).map((o) => (o as { sound: string }).sound);
      rows.push({ where, anim: `${set.name}/${a.name}`, seq: i, name: s.name, kind, ops: [...new Set(s.ops.map((o) => o.op))].join(','), selfStart: (p.flags & 3) === 1, loops });
    });
  }
}

const maps = readdirSync(dir).filter((f) => /\.ZDB$/i.test(f)).sort();
for (const f of maps) {
  const bytes = new Uint8Array(readFileSync(resolve(dir, f)));
  const toc = parseZdb(bytes);
  for (const m of ['CZANIM.ZAR', 'MZANIM.ZAR']) {
    try { scan(`${f.replace(/\.ZDB$/i, '')}:${m[0]}`, Zar.parse(zdbMember(bytes, toc, m))); } catch { /* the member is absent */ }
  }
}
if (!effectsOnly) for (const z of ['MPZANIM.ZAR', 'EXTZANIM.ZAR']) {
  if (existsSync(resolve(dir, z))) scan(z, Zar.parse(new Uint8Array(readFileSync(resolve(dir, z)))));
}

const counts = new Map<string, number>();
for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
console.log(`dir ${dir}: ${maps.length} maps; activation-2 sequences ${rows.length}: ${[...counts].map(([k, n]) => `${k} ${n}`).join(', ')}`);
const grouped = new Map<string, string[]>();
for (const r of rows) {
  if (r.kind !== 'UNCALLED' && r.kind !== 'named-shadowed') continue;
  const k = `${r.anim} seq${r.seq} '${r.name}' ${r.kind} selfStart=${r.selfStart} ops=${r.ops}${r.loops.length ? ` loops=${r.loops.join('+')}` : ''}`;
  grouped.set(k, [...(grouped.get(k) ?? []), r.where]);
}
for (const [k, where] of [...grouped].sort()) console.log(`${k} | ${where.length} | ${where.join(' ')}`);
