import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  isDestructibleAnim, nodeRefInit, parseAnimSets, ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER, ZANIM_PARENT_SENTINEL_READING, type ZAnimArchive,
} from '../src/index';
import { buildZar, cat, f32, u16, u32, type KeySpec } from './syntheticZar';

/**
 * The zAnim command archives -- `RUN/CZANIM.ZAR`, the map's `MZANIM.ZAR`, `RUN/LDZANIM.ZAR` -- read to their name
 * tables, sets, animations and command streams (socomlegacy/docs/research/77 §9): a hand-built archive first, then the
 * fixture's three, then every map's.
 */

const leaf = (name: string, data?: Uint8Array): KeySpec => ({ name, data });
const list = (name: string, names: string[]): KeySpec => ({ name, children: names.map((n) => leaf(n)) });

/** `_zanim_cmd_hdr` (reCOM zAnim/zanim.h:342-348): type in 16 bits, quad_align, timeless, then the size in bytes. */
const cmd = (type: number, timeless: boolean, ...payload: number[]): Uint8Array =>
  cat(u32((type | (timeless ? 1 << 17 : 0) | ((4 + 4 * payload.length) << 18)) >>> 0), u32(...payload));
/** A 28-byte `_zsequence` head (zanim.h:463-481) and its commands; the size covers both. */
const seq = (nameIndex: number, word: number, ...cmds: Uint8Array[]): Uint8Array => {
  const body = cat(...cmds);
  return cat(u16(nameIndex, 0), u32(word, 0, 28 + body.length), f32(0, 0, 0), body);
};

/** `refs`: each node reference's first word (the second is 0); the two of `muzzle_m4` when absent. */
interface Opts { nameCount?: number; animNameIndex?: number; seqB?: Uint8Array; siDataSize?: number; health?: Uint8Array; refs?: number[] }

/** A CZANIM-shaped archive: one set `common`, one SI script, one animation with two sequences. */
function synthetic(o: Opts = {}): Uint8Array {
  const names = ['NA', 'muzzle_m4', 'flash_fire', 'muzzle_node', 'data/common/zanim/rot.anm'];
  const seqA = seq(1, 0x102, cmd(0x2d, false, 0x03000000, 0, 0, 0), cmd(0x27, true, 0x00b40001));
  const seqB = o.seqB ?? seq(0, 0x104, cmd(0x1e, false, 0x00020280, 0, 0, 0, 0, 0, 0));
  const data = cat(seqA, seqB);
  const params = cat(Uint8Array.from([o.animNameIndex ?? 1, 1, 0, 1]), u32(0x21), f32(0, 3), u16(0, 0, seqA.length, 0));
  const anim: KeySpec = {
    name: 'muzzle_m4', children: [
      leaf('Anim_Params', params),
      leaf('Name_Index_Table_Count', u32(4)), leaf('Name_Index_Table', u16(0, 1, 2, 3)),
      leaf('Node_Ref_Count', u32((o.refs ?? [0, 0x00080300]).length)),
      leaf('Node_Ref_List', u32(...(o.refs ?? [0, 0x00080300]).flatMap((w) => [w, 0]))),
      leaf('Seq_Data_Size', u32(data.length)), leaf('Seq_Data', data),
      ...(o.health ? [leaf('Anim_Health', o.health)] : []),
    ],
  };
  const si: KeySpec = {
    name: 'SoftImage_Script', children: [
      leaf('Script_Params', cat(u16(4, 3), u32(0x19), f32(1 / 30), u32(40, o.siDataSize ?? 8, 0x133ada50))),
      leaf('Script_Data', new Uint8Array(8)),
    ],
  };
  const set: KeySpec = {
    name: 'common', children: [
      leaf('Name_Table_Count', u32(o.nameCount ?? names.length)), list('Name_Table', names),
      leaf('RdrPath_Count', u32(1)), list('RdrPath_List', ['data/common/zrdr']),
      leaf('SoftImage_Script_Count', u32(1)), { name: 'SoftImage_Script_List', children: [si] },
      leaf('Animation_List_Count', u32(1)), { name: 'Animation_List', children: [anim] },
    ],
  };
  return buildZar([
    leaf('Anim_Main_Params', cat(u32(72), f32(-98), u32(0, 0))),
    leaf('Name_Table_Count', u32(0)), list('Name_Table', []),
    leaf('Anim_Set_Count', u32(1)), { name: 'Anim_Sets', children: [set] },
  ]);
}

describe('parseAnimSets on a hand-built archive (77 §9)', () => {
  const zanim = parseAnimSets(Zar.parse(synthetic()));
  const set = zanim.sets[0]!, anim = set.anims[0]!;

  it('reads the main params (_zanim_main_params, zanim.h:357-364) and the sets', () => {
    expect(zanim.main).toEqual({ version: 72, gravity: -98, flags: 0, userActionAnimIndex: 0 });
    expect(zanim.names).toEqual([]);
    expect(zanim.sets.map((s) => s.name)).toEqual(['common']);
    expect(set.names).toEqual(['NA', 'muzzle_m4', 'flash_fire', 'muzzle_node', 'data/common/zanim/rot.anm']);
    expect(set.rdrPaths).toEqual(['data/common/zrdr']);
  });

  it('resolves a SoftImage script\'s path and object through the set\'s name table', () => {
    expect(set.siScripts).toEqual([{ path: 'data/common/zanim/rot.anm', object: 'muzzle_node', word: 0x19, frameTime: Math.fround(1 / 30), frameCount: 40, dataSize: 8 }]);
  });

  it('reads an animation: its params, its local name table, its node references', () => {
    expect(anim.name).toBe('muzzle_m4');
    expect(anim.names).toEqual(['NA', 'muzzle_m4', 'flash_fire', 'muzzle_node']);
    expect(anim.params).toEqual({ nameIndex: 1, rootNodeIndex: 1, paused: 0, state: 1, flags: 0x21, timer: 0, priority: 3, seqOffsets: [0, 0, 56, 0] });
    const none = { deactivate: false, saveActive: false, saveTranslation: false, saveRotation: false, saveParent: false };
    expect(anim.nodeRefs).toEqual([
      { parent: 0, name: 'NA', search: 0, word: 0, flags: 0, init: none },
      { parent: 0, name: 'muzzle_node', search: 1, word: 0x00080300, flags: 0, init: none },
    ]);
    expect(anim.health).toBeNull();
  });

  it("Anim_Health decodes: u8 node ref at +0, f32 health +4 and reset +8, armour +0xc and reset +0x10, shield +0x14; absent is null", () => {
    // research 174 s3, 173 s4, 203 s7: FUN_002740e0 D:L121150-121151 (the ref), D:L121195-121208 (the shield);
    // FUN_00273960 D:L120884-120888 (the reset pairs). Bytes +1..+3 are padding.
    const block = cat(Uint8Array.from([1, 0xaa, 0xbb, 0xcc]), f32(1, 1.5, 0.25, 0.5, 17));
    const a = parseAnimSets(Zar.parse(synthetic({ health: block }))).sets[0]!.anims[0]!;
    expect(a.health).toEqual({ nodeRef: 1, health: 1, healthReset: 1.5, armor: 0.25, armorReset: 0.5, shield: 17 });
    expect(anim.health).toBeNull();
    // A block of another length is refused (24 bytes on every block of the 22 maps, research 203 s7).
    expect(() => parseAnimSets(Zar.parse(synthetic({ health: block.subarray(0, 20) })))).toThrow(/Anim_Health/);
    // FUN_002713f0 D:L119312-119335: built only when the state is 1 or 5 and flags & 7 == 3, and a block is there.
    expect(isDestructibleAnim(a)).toBe(false);                                    // flags 0x21: kind 1
    const kind3 = { ...a, params: { ...a.params, flags: 0x823 } };
    expect(isDestructibleAnim(kind3)).toBe(true);
    expect(isDestructibleAnim({ ...kind3, params: { ...kind3.params, state: 5 } })).toBe(true);
    expect(isDestructibleAnim({ ...kind3, params: { ...kind3.params, state: 2 } })).toBe(false);
    expect(isDestructibleAnim({ ...kind3, health: null })).toBe(false);
  });

  it("a node reference's init word: bit 31 deactivate, bit 28 save active, bits 26/27/29 save translation, rotation, parent", () => {
    const only = (k: keyof ReturnType<typeof nodeRefInit>): ReturnType<typeof nodeRefInit> =>
      ({ deactivate: false, saveActive: false, saveTranslation: false, saveRotation: false, saveParent: false, [k]: true });
    expect(nodeRefInit(0x80000000)).toEqual(only('deactivate'));
    expect(nodeRefInit(0x10000000)).toEqual(only('saveActive'));
    expect(nodeRefInit(0x04000000)).toEqual(only('saveTranslation'));
    expect(nodeRefInit(0x08000000)).toEqual(only('saveRotation'));
    expect(nodeRefInit(0x20000000)).toEqual(only('saveParent'));
    // The bits below (parent, name, search; is_light .. on_world_lightlist at 22-25) and bit 30 (is_local_light) are not init bits.
    expect(nodeRefInit(0x43ffffff)).toEqual({ deactivate: false, saveActive: false, saveTranslation: false, saveRotation: false, saveParent: false });
    expect(nodeRefInit(0xbc081000)).toEqual({ deactivate: true, saveActive: true, saveTranslation: true, saveRotation: true, saveParent: true });
  });

  it('splits the command stream into sequences and each sequence into its commands, to the byte', () => {
    expect(anim.sequences.map((s) => [s.offset, s.name, s.word, s.size])).toEqual([[0, 'muzzle_m4', 0x102, 56], [56, 'NA', 0x104, 60]]);
    expect(anim.sequences[0]!.commands.map(({ bytes: _, ...c }) => c)).toEqual([
      { offset: 28, type: 0x2d, set: 0, cmd: 0x2d, quadAlign: false, timeless: false, size: 20 },
      { offset: 48, type: 0x27, set: 0, cmd: 0x27, quadAlign: false, timeless: true, size: 8 },
    ]);
    // Each command carries its own bytes, header first, as a view of the stream.
    for (const c of anim.sequences.flatMap((s) => s.commands)) {
      expect(c.bytes.length).toBe(c.size);
      expect(new DataView(c.bytes.buffer, c.bytes.byteOffset).getUint32(0, true) & 0xffff).toBe(c.type);
    }
    expect(anim.sequences[1]!.commands.map((c) => [c.offset, c.type, c.size])).toEqual([[84, 0x1e, 32]]);
  });

  it('refuses a count that disagrees with its list, a name that is not the key\'s, and a stream that does not tile', () => {
    expect(() => parseAnimSets(Zar.parse(synthetic({ nameCount: 6 })))).toThrow(/Name_Table_Count 6/);
    expect(() => parseAnimSets(Zar.parse(synthetic({ animNameIndex: 2 })))).toThrow(/names itself flash_fire/);
    expect(() => parseAnimSets(Zar.parse(synthetic({ siDataSize: 9 })))).toThrow(/Script_Data/);
    const long = seq(0, 0x104, cmd(0x1e, false, 0));
    new DataView(long.buffer).setUint32(12, 400, true);
    expect(() => parseAnimSets(Zar.parse(synthetic({ seqB: long })))).toThrow(/sequence at 56/);
    const zero = seq(0, 0x104, cmd(0x1e, false, 0));
    new DataView(zero.buffer).setUint32(28, 0x1e, true);          // a command of size 0
    expect(() => parseAnimSets(Zar.parse(synthetic({ seqB: zero })))).toThrow(/command at 84/);
  });
});

describe("PAR-92 B1: a node reference's parent byte, read as the original's resolver reads it (research 319 §1.2-§1.3, §2.2)", () => {
  // 27 references, as `otc_posechar` carries on the twelve campaign maps (research 318 §3.2): reference 2 names
  // `muzzle_node` with search 1 and the parent byte under test; the others name `flash_fire` with parent 0.
  const refs27 = (parent: number): number[] => Array.from({ length: 27 }, (_, i) => (i === 0 ? 0 : i === 2 ? (0x00080300 | parent) >>> 0 : 0x00000200));
  const read = (parent: number) => parseAnimSets(Zar.parse(synthetic({ refs: refs27(parent) }))).sets[0]!.anims[0]!;

  it('the sentinels are the command operands\' (FUN_0026f4e0 D:L118164-118179): 0xf9 the root, 0xfa the caller', () => {
    expect(ZANIM_PARENT_SENTINEL_READING).toEqual({ root: 0xf9, caller: 0xfa });
    expect(ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER).toBe('unresolvable');
  });

  it('parent 0xf9 of 27 reads `root` and the archive is kept, every reference and sequence with it', () => {
    const a = read(0xf9);
    expect(a.nodeRefs.length).toBe(27);
    expect(a.nodeRefs[2]).toMatchObject({ parent: 'root', name: 'muzzle_node', search: 1, word: 0x000803f9 });
    expect(a.nodeRefs[2]!.unresolved).toBeUndefined();
    expect(a.nodeRefs.filter((_, i) => i !== 2).every((r) => r.parent === 0)).toBe(true);
    expect(a.sequences.map((s) => s.size)).toEqual([56, 60]);
  });

  it('parent 0xfa reads `caller`', () => {
    expect(read(0xfa).nodeRefs[2]).toMatchObject({ parent: 'caller', name: 'muzzle_node' });
  });

  it('a parent past the table that is no sentinel (30 of 27, 255) keeps the archive: the reference is unresolvable, with a line', () => {
    for (const byte of [30, 27, 248, 251, 255]) {
      const a = read(byte);
      expect(a.nodeRefs[2], `parent ${byte}`).toMatchObject({ parent: ZANIM_PARENT_OUT_OF_TABLE_PLACEHOLDER, name: 'muzzle_node', search: 1 });
      expect(a.nodeRefs[2]!.unresolved, `parent ${byte}`).toMatch(new RegExp(`node reference 2's parent ${byte} of 27`));
      expect(a.nodeRefs.length).toBe(27);
      expect(a.sequences.length).toBe(2);
    }
  });

  it('an index inside the table stays the index; 0 is none', () => {
    expect(read(1).nodeRefs[2]!.parent).toBe(1);
    expect(read(26).nodeRefs[2]!.parent).toBe(26);
    expect(read(0).nodeRefs[2]!.parent).toBe(0);
    expect(read(1).nodeRefs[2]!.unresolved).toBeUndefined();
  });
});

const MP2 = fixture('RUN/MP2.ZDB');
const absent = !MP2;
const open = (bytes: Uint8Array, member: string): ZAnimArchive => parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), member)));

describe(`the zAnim archives on Frostfire${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it.skipIf(absent)('CZANIM.ZAR: one set, common -- 624 names, 10 script paths, no SoftImage script, 288 animations', () => {
    const cz = open(MP2!, 'CZANIM.ZAR');
    expect(cz.main).toEqual({ version: 72, gravity: -98, flags: 0, userActionAnimIndex: 0 });
    expect(cz.names).toEqual([]);
    expect(cz.sets.map((s) => s.name)).toEqual(['common']);
    const common = cz.sets[0]!;
    expect(common.names.length).toBe(624);
    expect(common.names.slice(0, 4)).toEqual(['NA', 'check_camera_inside_state1', 'outside_noise', 'inside_noise']);
    for (const n of ['jump_whoosh', 'seal_thud', 'dive_prone', 'ladder_rung', 'land_sound', 'big_ripple_anim_walk',
      'small_ripple_anim_run', 'seal_fall_in_water', 'muzzle_m4SD', 'muzzle_Beretta_M9', 'shell_eject', 'tracer']) {
      expect(common.names, n).toContain(n);
    }
    expect(common.rdrPaths.length).toBe(10);
    expect(common.rdrPaths).toContain('data/common/zanim/footfalls');
    expect(common.siScripts).toEqual([]);
    expect(common.anims.length).toBe(288);
    const first = common.anims[0]!;
    expect(first.name).toBe('check_camera_inside_state1');
    expect(first.names).toEqual(['NA', 'check_camera_inside_state1', 'outside_noise', 'inside_noise']);
    expect(first.params).toMatchObject({ nameIndex: 1, rootNodeIndex: 0, state: 1, priority: 3 });
    expect(first.sequences.map((s) => s.size)).toEqual([188]);
  });

  it.skipIf(absent)('MZANIM.ZAR holds the map\'s set, mission; LDZANIM.ZAR the loading screen\'s 95', () => {
    const mz = open(MP2!, 'MZANIM.ZAR'), ld = open(MP2!, 'LDZANIM.ZAR');
    expect(mz.sets.map((s) => [s.name, s.names.length, s.rdrPaths.length, s.siScripts.length, s.anims.length])).toEqual([['mission', 281, 6, 0, 76]]);
    expect(ld.sets.length).toBe(95);
    expect([ld.sets[0]!.name, ld.sets[0]!.names.length, ld.sets[0]!.anims.length]).toEqual(['dlgLoad.rdr', 32, 6]);
    expect(ld.main).toEqual(mz.main);
  });

  it.skipIf(absent)('names no body motion: no set carries a MOTION_S clip or a SoftImage script on Frostfire (77 §9)', () => {
    const clips = Zar.parse(zdbMember(MP2!, parseZdb(MP2!), 'MOTION_S.ZAR')).root.children.map((k) => k.name);
    expect(clips.length).toBe(7);
    for (const member of ['CZANIM.ZAR', 'MZANIM.ZAR', 'LDZANIM.ZAR']) {
      for (const set of open(MP2!, member).sets) {
        expect(set.siScripts, `${member} ${set.name}`).toEqual([]);
        for (const c of clips) expect(set.names, `${member} ${set.name}`).not.toContain(c);
      }
    }
  });
});

const MAPS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/maps/RUN');
const noMaps = !existsSync(MAPS);

describe.skipIf(noMaps)(`the zAnim archives on every map${noMaps ? ' (public/maps absent: run npm run extract-maps)' : ''}`, () => {
  it.skipIf(noMaps)('reads all 66 to the byte: 9,912 animations, 18,642 sequences, 73,634 commands, 30 SoftImage scripts, no motion clip named', () => {
    const files = readdirSync(MAPS).filter((f) => /^MP\d+\.ZDB$/i.test(f)).sort((a, b) => Number(a.slice(2, -4)) - Number(b.slice(2, -4)));
    expect(files.length).toBe(22);
    // The player's 334 clip names too, where the owner's MOTION_P.ZAR sits beside the maps.
    const pack = resolve(MAPS, 'MOTION_P.ZAR');
    const packNames = existsSync(pack) ? Zar.parse(new Uint8Array(readFileSync(pack))).root.children.map((k) => k.name) : [];
    const total = { anims: 0, sequences: 0, commands: 0, si: 0 };
    const rows = ['map    CZANIM sets/names/anims   MZANIM sets/names/anims/si   LDZANIM sets/anims'];
    for (const file of files) {
      const bytes = new Uint8Array(readFileSync(resolve(MAPS, file)));
      const [cz, mz, ld] = ['CZANIM.ZAR', 'MZANIM.ZAR', 'LDZANIM.ZAR'].map((m) => open(bytes, m)) as [ZAnimArchive, ZAnimArchive, ZAnimArchive];
      const clips = new Set([...Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MOTION_S.ZAR')).root.children.map((k) => k.name), ...packNames]);
      for (const a of [cz, mz, ld]) {
        expect(a.main, file).toEqual({ version: 72, gravity: -98, flags: 0, userActionAnimIndex: 0 });
        for (const s of a.sets) {
          expect(s.names.filter((n) => clips.has(n)), `${file} ${s.name}: a motion clip in a zAnim name table`).toEqual([]);
          total.si += s.siScripts.length;
          for (const anim of s.anims) {
            total.anims++;
            total.sequences += anim.sequences.length;
            for (const q of anim.sequences) total.commands += q.commands.length;
          }
        }
      }
      const sum = (a: ZAnimArchive, f: (s: ZAnimArchive['sets'][number]) => number): number => a.sets.reduce((t, s) => t + f(s), 0);
      rows.push(`${file.replace('.ZDB', '').padEnd(6)} ${`${cz.sets.length}/${sum(cz, (s) => s.names.length)}/${sum(cz, (s) => s.anims.length)}`.padEnd(26)}`
        + `${`${mz.sets.length}/${sum(mz, (s) => s.names.length)}/${sum(mz, (s) => s.anims.length)}/${sum(mz, (s) => s.siScripts.length)}`.padEnd(29)}`
        + `${ld.sets.length}/${sum(ld, (s) => s.anims.length)}`);
    }
    console.log(`zAnim archives, 22 maps:\n${rows.join('\n')}`);
    expect(total).toEqual({ anims: 9912, sequences: 18642, commands: 73634, si: 30 });
  }, 60_000);
});
