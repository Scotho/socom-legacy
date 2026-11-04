// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { CmdBytes, decodeEffectProgram, parseAnimSets, type EffectProgram, type Vec3, type ZAnimAnimation } from '../src/index';

/**
 * PARITY-2 PAR-43 (research 214 s9): the map zAnim program `BombPlace`, the Demolition tent record's anim 0, which the
 * original starts at a plant's commit (`FUN_002b44e0` D:L451513) on the tent's node (context tag 3), the record's valve
 * (tag 4) and the planter's self-select record (tag 1, actor +0x3b0: `FUN_00599f00` D:L455777-455778 ->
 * `FUN_005d29f0` D:L486826-486851). Decoded through the repository's readers (`parseAnimSets`, `decodeEffectProgram`)
 * from MP72's `MZANIM.ZAR` (the fixture); the set-2 commands, which `decodeEffectProgram` leaves as `other`, are read
 * here field by field after their parsers -- set 2 is the `ai` namespace (`FUN_0026a8e0` D:L115284-115295 splits
 * `ai::`, `FUN_0026ac20` D:L115421 puts `Reserved` at index 0 of a new namespace; `FUN_005de320` D:L493405-493471
 * registers COMM 1 ... MOVE 16, ANIMATE 20, SELECT 23, SETANIMSET 25 ... WAIT 34; research 189 s6 and s12).
 * The disc's half re-reads the other eight Demolition maps and MP52's stray template (SOCOM_DISC, else
 * `<SOCOM_PC_ROOT>/game/disc`). ANIMATE's type ids are named through the ELF's static type table and `animset.rdr` in
 * `tools/test/bombPlaceTypeIds.test.ts` (the ELF's reader is the tools package's).
 * A reading off the disc; nothing here is measured running (capture B items 7 and 8 would prove it).
 */

const MP72 = fixture('RUN/MP72.ZDB');
const READERC = fixture('RUN/READERC.ZAR');

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
/** The nine Demolition maps whose `actions.rdr` names `BombPlace` (research 214 s8), and MP52's record-less copy. */
const DEMOLITION = ['MP1', 'MP7', 'MP9', 'MP12', 'MP61', 'MP62', 'MP72', 'MP73', 'MP83'] as const;
const STRAY = 'MP52';
const HAVE_DISC = DISC !== '' && [...DEMOLITION, STRAY].every((m) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));

/** A map's `BombPlace`, through `parseAnimSets` on its `MZANIM.ZAR`. */
function bombPlace(zdb: Uint8Array): ZAnimAnimation {
  const toc = parseZdb(zdb);
  const archive = parseAnimSets(Zar.parse(zdbMember(zdb, toc, 'MZANIM.ZAR')));
  const found = archive.sets.flatMap((s) => s.anims).filter((a) => a.name === 'BombPlace');
  expect(found).toHaveLength(1);
  return found[0]!;
}

/** Everything the program is, the commands' bytes included, as one comparable value. */
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
const signature = (a: ZAnimAnimation): string => JSON.stringify({
  params: a.params, names: a.names, nodeRefs: a.nodeRefs.map((r) => [r.name, r.word, r.flags]), health: a.health,
  sequences: a.sequences.map((s) => [s.name, s.word, s.size, s.commands.map((c) => hex(c.bytes))]),
});

/** The `ai` namespace's set and the three ids `BombPlace` uses (`FUN_005de320` D:L493435, D:L493443, D:L493453). */
const AI_SET = 2;
const AI = { MOVE: 16, ANIMATE: 20, SETANIMSET: 25 } as const;
/** The type id of `Stand` in the ELF's static type table at 0x661060 (index 1; research 80). */
const STAND_TYPE = 1;

/**
 * An `ai::` command's fields, at the offsets its parser writes and its begin and tick read. `select` (+4, the `ai`
 * keyword) is which tag-1 select context the command acts on, 0 the first (every handler walks `FUN_002720e0`'s tag-1
 * contexts for one whose u16 is SELECT's id `DAT_0066b7e8`, D:L493449-493450, and takes its +0xc, the actor).
 */
type AiOp =
  /**
   * `ai::MOVE` (parser `FUN_005d64b0` D:L488996-489058; begin `FUN_005d5d00` D:L488725-488994): `pos` +8, `dir` +0x14,
   * `dist` +0x20, the node reference +0x24, the mode the low nibble of +0x28 (1 `node`, 2 `self`, 3 `relseal`, 4
   * `relseal` with `dir`), `blocking` bit 5 of +0x28.
   */
  | { ai: 'MOVE'; select: number; pos: Vec3; dir: Vec3; dist: number; node: number; mode: number; blocking: boolean }
  /**
   * `ai::SETANIMSET` (parser `FUN_005d2310` D:L486568-486613; tick `FUN_005d1e00` D:L486396-486566): flags +8 (2
   * `bored`, 4 `default`), the set's name +0xc (a name index); the `entity` keyword's kind, the u16 +0x10 (0 none, 1
   * named), its name index the u16 +0x12 (D:L486602-486610), and +0x14 a runtime id the parser sets to `DAT_003effb0`
   * (0xffffffff, D:L486604).
   */
  | { ai: 'SETANIMSET'; select: number; flags: number; set: string; entityKind: number; entity: string | null; runtimeId: number }
  /**
   * `ai::ANIMATE` (parser `FUN_005d3c80` D:L487461-487553 with `FUN_005d3f00`; begin `FUN_005d3740` D:L487286-487458;
   * tick `FUN_005d2f30` D:L487009-487284): `prewait` +8 and its random range +0xc, `postwait` +0x10 and its range
   * +0x14, the type count +0x20, the bytes +0x21 / +0x22, the flags +0x23 (bit 0 `skip_end`, bit 1 `blocking`); the
   * `entity` keyword's kind, the u16 +0x24 (0 none, 1 named), its name index the u16 +0x26 (D:L487540-487547), and
   * +0x28 a runtime id the parser sets to `DAT_003effb0` (0xffffffff, D:L487542); the type ids from +0x30. The tick
   * passes +0x21 as the push's stance, 0x0b meaning the actor's +0x174 (D:L487194-487196).
   */
  | {
    ai: 'ANIMATE'; select: number; prewait: [number, number]; postwait: [number, number]; count: number;
    byte21: number; byte22: number; flags: number; entityKind: number; entity: string | null; runtimeId: number; types: number[];
  };

const nameAt = (names: readonly string[], i: number): string => names[i] ?? `#${i}`;

function aiOp(cmd: { set: number; cmd: number; bytes: Uint8Array }, names: readonly string[]): AiOp {
  if (cmd.set !== AI_SET) throw new Error(`set ${cmd.set} is not the ai namespace`);
  const c = new CmdBytes(cmd.bytes);
  switch (cmd.cmd) {
    case AI.MOVE:
      return {
        ai: 'MOVE', select: c.u32(4), pos: c.vec3(8), dir: c.vec3(0x14), dist: c.f32(0x20), node: c.u32(0x24),
        mode: c.u8(0x28) & 0xf, blocking: (c.u8(0x28) & 0x20) !== 0,
      };
    case AI.SETANIMSET:
      return {
        ai: 'SETANIMSET', select: c.u32(4), flags: c.u32(8), set: nameAt(names, c.u16(0xc)),
        entityKind: c.u16(0x10), entity: c.u16(0x10) === 1 ? nameAt(names, c.u16(0x12)) : null, runtimeId: c.i32(0x14),
      };
    case AI.ANIMATE: {
      const count = c.u8(0x20);
      return {
        ai: 'ANIMATE', select: c.u32(4), prewait: [c.f32(8), c.f32(0xc)], postwait: [c.f32(0x10), c.f32(0x14)], count,
        byte21: c.u8(0x21), byte22: c.u8(0x22), flags: c.u8(0x23),
        entityKind: c.u16(0x24), entity: c.u16(0x24) === 1 ? nameAt(names, c.u16(0x26)) : null, runtimeId: c.i32(0x28),
        types: Array.from({ length: count }, (_, k) => c.i32(0x30 + 4 * k)),
      };
    }
    default: throw new Error(`ai command ${cmd.cmd} not read here`);
  }
}

/** The program `decodeEffectProgram` makes of it: the set-2 commands stay `other`, the QUAD_ALIGNs are dropped. */
const PROGRAM: EffectProgram = {
  name: 'BombPlace', root: 0, flags: 0xa2, nodes: [],
  sequences: [
    {
      name: 'seq_0', activation: 1,
      ops: [
        { op: 'if', conditions: [{ kind: 'valve', valve: 'mp_bomb', operation: 2, operand: 3 }] },
        { op: 'callSequence', sequence: 'deactivate' },
        { op: 'endif' },
      ],
    },
    {
      name: 'deactivate', activation: 2,
      ops: [
        // The decoder names the set-2 commands by the `ai` namespace and decodes the ANIMATEs (research 92 section 2;
        // `aiAnimate`): the types and post-waits are section 9's table, the pre-waits 0, none blocking.
        { op: 'other', cmd: AI.MOVE, name: 'ai::MOVE' },
        { op: 'other', cmd: AI.SETANIMSET, name: 'ai::SETANIMSET' },
        { op: 'aiAnimate', type: 0x111, prewait: 0, postwait: Math.fround(1.8), blocking: false, select: 0 },
        { op: 'aiAnimate', type: 1, prewait: 0, postwait: Math.fround(8.4), blocking: false, select: 0 },
        { op: 'aiAnimate', type: 0x115, prewait: 0, postwait: Math.fround(1.7), blocking: false, select: 0 },
        { op: 'other', cmd: AI.SETANIMSET, name: 'ai::SETANIMSET' },
        { op: 'valve', valve: 'mp_bomb', operation: 0x0b, operand: 4 },
      ],
    },
  ],
};

const f = Math.fround;
const animate = (type: number, postwait: number): AiOp => ({
  ai: 'ANIMATE', select: 0, prewait: [0, 0], postwait: [f(postwait), 0], count: 1, byte21: 0, byte22: 0x0b, flags: 0,
  entityKind: 0, entity: null, runtimeId: -1, types: [type],
});
/** `deactivate`'s set-2 commands, field by field. */
const AI_OPS: AiOp[] = [
  { ai: 'MOVE', select: 0, pos: [0, 0, 0], dir: [0, 0, -1], dist: 18, node: 0xfa, mode: 1, blocking: false },
  { ai: 'SETANIMSET', select: 0, flags: 0, set: 'defusebomb anim set', entityKind: 0, entity: null, runtimeId: -1 },
  animate(0x111, 1.8),
  animate(STAND_TYPE, 8.4),
  animate(0x115, 1.7),
  { ai: 'SETANIMSET', select: 0, flags: 0, set: 'Seal anim set', entityKind: 0, entity: null, runtimeId: -1 },
];

describe(`BombPlace off MP72's MZANIM.ZAR (PAR-43, research 214 s9)${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP72)('is one animation of two sequences: seq_0 at the start, deactivate only when called', () => {
    const a = bombPlace(MP72!);
    expect(a.params).toEqual({ nameIndex: 1, rootNodeIndex: 0, paused: 0, state: 1, flags: 0xa2, timer: 0, priority: 3, seqOffsets: [0, 0, 0, 0] });
    expect(a.names).toEqual(['NA', 'BombPlace', 'seq_0', 'mp_bomb', 'deactivate', 'defusebomb anim set', 'Seal anim set']);
    expect(a.nodeRefs).toEqual([]);
    expect(a.health).toBeNull();
    expect(a.sequences.map((s) => [s.name, s.offset, s.word, s.size, s.commands.length])).toEqual([
      ['seq_0', 0, 0x102, 68, 3],
      ['deactivate', 68, 0x104, 328, 10],
    ]);
    expect(decodeEffectProgram(a)).toEqual(PROGRAM);
  });

  it.skipIf(!MP72)("tests and sets the global valve mp_bomb by name, never the record's own valve (tag 4)", () => {
    const a = bombPlace(MP72!);
    const ifCmd = a.sequences[0]!.commands[0]!, valveCmd = a.sequences[1]!.commands.at(-1)!;
    // The VALVE payload's flag byte +13: bit 1 a name index, bit 0 the animation's context valve (`valveOf`, effects.ts).
    const ifValve = new CmdBytes(ifCmd.bytes.subarray(8));
    expect([ifValve.u8(0), ifValve.u8(13)]).toEqual([61, 2]);
    expect(new CmdBytes(valveCmd.bytes).u8(13)).toBe(2);
    expect(hex(ifCmd.bytes)).toBe('02 00 62 00 01 00 00 00 3d 00 40 00 03 00 00 00 03 00 00 00 02 02 00 00');
    expect(hex(valveCmd.bytes)).toBe('3d 00 40 00 03 00 00 00 04 00 00 00 0b 02 00 00');
  });

  it.skipIf(!MP72)("deactivate's set-2 commands act on the first tag-1 select (the actor that started it): MOVE, SETANIMSET, three ANIMATEs, SETANIMSET", () => {
    const a = bombPlace(MP72!);
    const set2 = a.sequences[1]!.commands.filter((c) => c.set === AI_SET);
    expect(set2.map((c) => aiOp(c, a.names))).toEqual(AI_OPS);
    // The three QUAD_ALIGNs (set 0, cmd 1) pad each ANIMATE to its quad (header bit 16 set on the ANIMATEs).
    expect(a.sequences[1]!.commands.map((c) => `${c.set}:${c.cmd}${c.quadAlign ? 'q' : ''}`))
      .toEqual(['2:16', '2:25', '0:1', '2:20q', '0:1', '2:20q', '0:1', '2:20q', '2:25', '0:61']);
  });
});

/** `animset.rdr`'s sets, unwrapped as `equipmentAnim.test.ts` reads them. */
function animSets(readerc: Uint8Array): RdrNode[] {
  const zar = Zar.parse(readerc);
  const root = parseRdr(zar.data(zar.find('animset.rdr')!));
  const flat = (n: RdrNode): RdrNode[] => (Array.isArray(n) && n.length === 1 && Array.isArray(n[0]) ? flat(n[0]) : n as RdrNode[]);
  return flat(root);
}

describe(`the defusebomb anim set (animset.rdr)${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!READERC)('maps Stand to the defuse loop and the begin and end types to their clips, with GLOBAL included', () => {
    const set = animSets(READERC!).find((s) => rdrGet(s, 'anim_set_name') === 'defusebomb anim set')!;
    expect(rdrGet(set, 'include')).toBe('GLOBAL');
    const pairs = (rdrGet(set, 'anim_set_anims') as RdrNode[]).map((e) => [rdrGet(e, 'type_name'), rdrGet(e, 'anim_name')]);
    expect(pairs).toEqual([
      ['Stand', 'seal_defusebomb_loop'], ['Pistol stand', 'seal_p_defusebomb_loop'],
      ['Defusebomb begin', 'seal_defusebomb_begin'], ['Pistol defusebomb begin', 'seal_p_defusebomb_begin'],
      ['Defusebomb end', 'seal_defusebomb_end'], ['Pistol defusebomb end', 'seal_p_defusebomb_end'],
    ]);
  });
});

describe.skipIf(!HAVE_DISC)(`BombPlace on the disc (SOCOM_DISC, else <SOCOM_PC_ROOT>/game/disc)${HAVE_DISC ? '' : ' -- skipped: no disc tree with RUN/MP1, MP7, MP9, MP12, MP52, MP61, MP62, MP72, MP73, MP83.ZDB'}`, () => {
  it('is the same program, byte for byte, on the nine Demolition maps and on MP52 (the stray template)', () => {
    const want = signature(bombPlace(MP72 ?? new Uint8Array(readFileSync(join(DISC, 'RUN', 'MP72.ZDB')))));
    for (const m of [...DEMOLITION, STRAY]) {
      const a = bombPlace(new Uint8Array(readFileSync(join(DISC, 'RUN', `${m}.ZDB`))));
      expect(signature(a), m).toBe(want);
      expect(decodeEffectProgram(a), m).toEqual(PROGRAM);
    }
  });
});
