// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { decodeEffectProgram, parseAnimSets, type EffectProgram } from '../src/index';

/**
 * Research 448 (reading, pending review): an `Anim_Params` sequence offset -- damage +0x10, activation +0x12, execution
 * +0x14 (research 106 §1, §2) -- names a sequence the runtime runs by its offset, not by its activation word. The
 * decoded program carries those sequences' indices as `guards`, so the effect runner can tell them from the ordinary
 * activation-2 sequences, which only a start by name runs (FUN_00269b00, D:L114701-114760). The cleanup (+0x16) is
 * `cleanup`, as before. Decoded through the repository's readers from the fixtures; nothing here runs the game.
 */

const MP2 = fixture('RUN/MP2.ZDB');
const MP6 = fixture('RUN/MP6.ZDB');

function programs(zdb: Uint8Array, member: 'CZANIM.ZAR' | 'MZANIM.ZAR'): Map<string, EffectProgram> {
  const archive = parseAnimSets(Zar.parse(zdbMember(zdb, parseZdb(zdb), member)));
  return new Map(archive.sets.flatMap((s) => s.anims).map((a) => [a.name, decodeEffectProgram(a)]));
}

describe('research 448: the decoded program names its Anim_Params guard sequences', () => {
  it.skipIf(!MP2)(`shell_eject's 0x104 sequence is its activation guard (seqOffsets [0, 648, 0, 0]) ${MP2 ? '' : FIXTURES_ABSENT}`, () => {
    const p = programs(MP2!, 'CZANIM.ZAR').get('shell_eject')!;
    expect(p.sequences.map((s) => s.activation)).toEqual([1, 2]);
    expect(p.guards).toEqual([1]);
    expect(p.cleanup).toBeUndefined();
  });

  it.skipIf(!MP6)(`MP6's flame_in_barrel has no guard: its light is an ordinary activation-2 sequence nothing names ${MP6 ? '' : FIXTURES_ABSENT}`, () => {
    const p = programs(MP6!, 'MZANIM.ZAR').get('flame_in_barrel')!;
    expect(p.flags & 3).toBe(1);                                   // self-starting (an ambient)
    expect(p.sequences.map((s) => s.name)).toEqual(Array(7).fill('NA'));
    expect(p.sequences.map((s) => s.activation)).toEqual([1, 1, 1, 1, 1, 1, 2]);
    expect(p.sequences[6]!.ops[0]!.op).toBe('light');
    expect(p.guards).toBeUndefined();
    expect(p.sequences.some((s) => s.ops.some((o) => o.op === 'callSequence'))).toBe(false);
  });

  it('a hand-built animation with no offsets carries no guards', () => {
    const p = decodeEffectProgram({
      name: 'x', nameIndex: 0, params: { rootNodeIndex: 0, flags: 0 }, nodeRefs: [], names: ['NA'],
      sequences: [{ name: 'NA', word: 0x104, offset: 0, commands: [] }],
    } as unknown as Parameters<typeof decodeEffectProgram>[0]);
    expect(p.guards).toBeUndefined();
  });
});
