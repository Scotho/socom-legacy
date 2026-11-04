import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, parseAnimSets, parseSceneGraph, type EffectProgram } from '@s2u/scene';
import { isGateLeaf, readGates } from '../src/gates';
import { readMapActions } from '../src/mapActions';

/**
 * MAP-07's census (PR #427, the review's A11; research 174 §5.1 "What is a gate"): the port finds a gate by name -- a
 * SWITCH program whose position block (`OBJECT_MOTION_FROM_TO`'s u16 +0xc when non-zero, `decodeEffectOp`; every one
 * the census catches is flags 9, and the lists held when B135's decode replaced #427's flag-0x8 read) moves a node named
 * `gate_move\d*` (`isGateLeaf`, `readGates`). The original has no "gate": any program's translation moves its node.
 * This walks every map archive on the dev disc (`SOCOM_DISC` `RUN/*.ZDB`, the 22 multiplayer maps and the campaign's;
 * skipped, and said so, without it; every archive is read, about 2 s in all, the action records, programs and scene
 * graph only) and lists, for every action record of every type, each node a program it reaches (its `anim`s and what
 * they `call`, transitively) moves with a position block or an instant `OBJECT_TRANSLATE_STATE`. It pins:
 * - the SWITCH records whose programs slide a node with a position block (`CENSUS_SWITCH_SLIDES`, each read against
 *   the disc): Death Trap's two and Enowapi's three levers, nothing else -- the name rule misses none;
 * - that the name rule finds gates on MP11 and MP62 only (`readGates` over every archive);
 * - that no record but a SWITCH reaches a program moving a `gate_move*` node, and no program anywhere -- an
 *   auto-start's included -- slides one but the levers' own;
 * - the instant translates a record reaches (`CENSUS_INSTANT`): the airstrike radios', not gates.
 */

const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const STEMS = RUN && existsSync(RUN) ? readdirSync(RUN).filter((f) => /\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '')).sort() : [];

interface Moved { map: string; record: string; type: string; program: string; sequence: string; node: string; op: 'fromTo' | 'translate'; flags: number }

function census(stem: string): { moved: Moved[]; anywhere: string[]; gates: string[]; diagnostics: string[] } {
  const bytes = new Uint8Array(readFileSync(resolve(RUN, `${stem}.ZDB`)));
  const toc = parseZdb(bytes);
  const diagnostics: string[] = [];
  let models: ReturnType<typeof parseSceneGraph> = [];
  try { models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`))); } catch (e) { diagnostics.push(`geo: ${String(e)}`); }
  const { actions, diagnostics: d1 } = readMapActions(bytes, toc, stem, models);
  diagnostics.push(...d1);
  let programs = new Map<string, EffectProgram>();
  try {
    const archive = parseAnimSets(Zar.parse(zdbMember(bytes, toc, 'MZANIM.ZAR')));
    programs = new Map(archive.sets.flatMap((s) => s.anims).map((a) => [a.name.toLowerCase(), decodeEffectProgram(a)] as const));
  } catch (e) { diagnostics.push(`mzanim: ${String(e)}`); }
  const reach = (name: string, seen = new Set<string>()): Set<string> => {
    const key = name.toLowerCase();
    if (seen.has(key)) return seen;
    seen.add(key);
    for (const s of programs.get(key)?.sequences ?? []) for (const o of s.ops) if (o.op === 'call') reach(o.anim, seen);
    return seen;
  };
  const moved: Moved[] = [];
  for (const a of actions) {
    const reached = new Set<string>();
    for (const anim of a.anims) reach(anim, reached);
    for (const name of reached) {
      const p = programs.get(name);
      for (const s of p?.sequences ?? []) {
        for (const o of s.ops) {
          if (o.op === 'fromTo' && o.translation) moved.push({ map: stem, record: a.node, type: a.type, program: name, sequence: s.name, node: p!.nodes[o.node] ?? `#${o.node}`, op: 'fromTo', flags: o.flags });
          if (o.op === 'translate') moved.push({ map: stem, record: a.node, type: a.type, program: name, sequence: s.name, node: p!.nodes[o.node] ?? `#${o.node}`, op: 'translate', flags: o.flags });
        }
      }
    }
  }
  // Every program in the archive, reached from a record or not (an auto-start's), that slides a node by a position block.
  const anywhere = [...programs].flatMap(([name, p]) => p.sequences.flatMap((s) => s.ops.flatMap((o) =>
    (o.op === 'fromTo' && o.translation ? [`${stem} ${name} ${p.nodes[o.node] ?? `#${o.node}`}`] : []))));
  const { gates, diagnostics: d2 } = readGates(bytes, toc, stem, models, [], []);
  diagnostics.push(...d2.filter((l) => !/has no collision under it/.test(l)));   // no hull here: owners not read
  return { moved, anywhere: [...new Set(anywhere)], gates: gates.map((g) => `${g.node}:${g.levers.map((l) => l.node).join('+')}`), diagnostics };
}

describe.skipIf(STEMS.length === 0)(`MAP-07's census over every map on the disc${STEMS.length ? ` (${STEMS.length} archives)` : ' (SOCOM_DISC with RUN/*.ZDB absent: skipped)'}`, () => {
  it('the translating SWITCHes, the name rule\'s gates, and no gate leaf moved by another record type', () => {
    const all = STEMS.map((stem) => ({ stem, ...census(stem) }));
    const moved = all.flatMap((m) => m.moved);
    // The census's own record, printed whole for the research note.
    console.info(JSON.stringify({
      archives: STEMS,
      slides: moved.filter((m) => m.op === 'fromTo').map((m) => `${m.map} ${m.type || '-'} ${m.record} ${m.program}/${m.sequence} ${m.node} flags ${m.flags}`),
      instant: moved.filter((m) => m.op === 'translate').map((m) => `${m.map} ${m.type || '-'} ${m.record} ${m.program}/${m.sequence} ${m.node}`),
      anywhere: all.flatMap((m) => m.anywhere),
      gates: all.filter((m) => m.gates.length).map((m) => `${m.stem}: ${m.gates.join(', ')}`),
      diagnostics: all.filter((m) => m.diagnostics.length).map((m) => `${m.stem}: ${m.diagnostics.join(' | ')}`),
    }, null, 1));
    const switchSlides = [...new Set(moved.filter((m) => m.op === 'fromTo' && m.type.toUpperCase() === 'SWITCH').map((m) => `${m.map} ${m.record} ${m.node}`))].sort();
    expect(switchSlides).toEqual(CENSUS_SWITCH_SLIDES);
    expect(all.filter((m) => m.gates.length).map((m) => `${m.stem}: ${m.gates.join(', ')}`)).toEqual([
      'MP11: gate_move1:epanel_di1, gate_move2:epanel_di2',
      'MP62: gate_move1:epanel_di1, gate_move2:epanel_di2+epanel_di3',
    ]);
    expect(moved.filter((m) => isGateLeaf(m.node) && m.type.toUpperCase() !== 'SWITCH')).toEqual([]);
    // The instant translates a record reaches: the airstrike radios' (MAP-09), not gates (see `CENSUS_INSTANT`).
    expect([...new Set(moved.filter((m) => m.op === 'translate').map((m) => `${m.map} ${m.record} ${m.program} ${m.node}`))].sort()).toEqual(CENSUS_INSTANT);
    // No program anywhere, reached from a record or not, slides a gate leaf but the levers' own.
    expect(all.flatMap((m) => m.anywhere).filter((line) => isGateLeaf(line.split(' ')[2]!)).sort()).toEqual([
      'MP11 gate_openclose1 gate_move1', 'MP11 gate_openclose2 gate_move2', 'MP62 gate_openclose1 gate_move1', 'MP62 gate_openclose2 gate_move2',
    ]);
  }, 600_000);
});

/**
 * The SWITCH records that slide a node with a position block, `map record node`, as the census's first run
 * (2026-10-23, 34 archives) read them, each read against the disc:
 * - MP11 `epanel_di1`, `epanel_di2`: `gate_openclose1/2`'s `gateopen` / `gateclose` sequences slide `gate_move1/2`
 *   (flags 9) -- Death Trap's two gates (research 175 §5.3).
 * - MP62 `epanel_di1` (`gate_openclose1`, `gate_move1`); `epanel_di2` and `epanel_di3` (both `gate_openclose2`,
 *   `gate_move2`) -- Enowapi's two gates, the second shared (research 174 §5).
 * Nothing else. Chain Reaction's crane is not among them, and is not a gate: its SWITCHes (`crane_onoff_N`) only pause
 * or resume; the hook's flags-9 slide is `translate_hook_N`, which the auto-start `swing_hook_N` calls, no record
 * (research 176 §9) -- so the plan's expectation of the crane here was wrong, and the name rule has nothing to leave
 * out on MP81. These are exactly the levers `readGates` finds: the name rule misses no translating SWITCH on the disc.
 */
const CENSUS_SWITCH_SLIDES: string[] = [
  'MP11 epanel_di1 gate_move1',
  'MP11 epanel_di2 gate_move2',
  'MP62 epanel_di1 gate_move1',
  'MP62 epanel_di2 gate_move2',
  'MP62 epanel_di3 gate_move2',
];

/**
 * The instant translates (`OBJECT_TRANSLATE_STATE`) a record reaches, `map record program node`, from the first run,
 * each read against the disc: the airstrike radios of MP61 Sujo and MP62 Enowapi (SWITCH, team-gated; MAP-09). Their
 * strike calls `knockdown_everything`, which translates its context root (node -7) before `exploding_fuel` (research
 * 174 §4), and Sujo's Foxtrot strike calls `coop_part_fly` on its caller (node -6), the pigeon coop's debris. Not
 * gates: an instant move of the program's own context, no position block, no `gate_move*` node.
 */
const CENSUS_INSTANT: string[] = [
  'MP61 radio_call_1 knockdown_everything #-7',
  'MP61 radio_call_2 coop_part_fly #-6',
  'MP61 radio_call_2 knockdown_everything #-7',
  'MP62 radio_call_1 knockdown_everything #-7',
  'MP62 radio_call_2 knockdown_everything #-7',
];
