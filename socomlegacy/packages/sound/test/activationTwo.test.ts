import { describe, expect, it } from 'vitest';
import { zanimEmitters, zanimSounds } from '../src';

/**
 * Research 448 (reading, pending review): a sound in a sequence the original never starts is no world emitter. The
 * start runs an animation's activation-1 sequences only (`FUN_0026ae20` D:L115457-115509: word 0x102); another runs
 * when a start by name reaches it (`FUN_00269b00` D:L114701-114760: its `CALL_SEQUENCE`, an `OBJECT_MOTION` material,
 * the game's AI starts) or by an `Anim_Params` offset (damage +0x10, activation +0x12, execution +0x14). Shapes from the
 * disc: MP73's `cricket_sound01` (one sequence, 0x104, `~CRICKET_1`), MP51's `water_drain` (its `~WATER_LEAK` in an `NA`
 * 0x104 sequence behind two 0x102 ones). A hand-built sequence with no word (the older tests') keeps the old reading.
 */

const sound = (nameIndex: number, node = 1): Uint8Array => {
  const b = new Uint8Array(32); b[0] = 30; b[4] = 0x82; b[6] = nameIndex; b[16] = node;
  return b;
};
const callSeq = (nameIndex: number): Uint8Array => {
  const b = new Uint8Array(8); b[0] = 50; b[4] = nameIndex;
  return b;
};

function world(anims: { name: string; names: string[]; seqOffsets?: number[]; seqs: { word: number; name?: string; offset: number; cmds: [number, Uint8Array][] }[] }[]) {
  const bytes = new Map<string, Uint8Array>();
  const mission = { sets: [{ name: 'mission', anims: anims.map((a) => ({
    name: a.name, names: a.names, params: { flags: 33, rootNodeIndex: 1, seqOffsets: a.seqOffsets ?? [0, 0, 0, 0] },
    nodeRefs: [{ name: 'NA' }, { name: 'node1' }],
    sequences: a.seqs.map((s) => ({
      offset: s.offset, word: s.word, name: s.name ?? 'NA',
      commands: s.cmds.map(([at, b]) => { bytes.set(`${a.name}:${at}`, b); return { offset: at, set: 0, cmd: b[0]! }; }),
    })),
  })) }] };
  const payload = (_s: string, anim: string, offset: number, length: number): Uint8Array | null =>
    bytes.get(`${anim}:${offset}`)?.subarray(0, length) ?? null;
  return zanimEmitters(zanimSounds([mission], payload)).map((e) => `${e.anim} ${e.sound}`);
}

describe('research 448: a world emitter only from a sequence the original starts', () => {
  it("MP73's crickets: the only sequence is activation 2 and nothing names it -- no emitter", () => {
    expect(world([{ name: 'cricket_sound01', names: ['NA', 'dcrik01', 'cricket_sound01', 'cricket', '~CRICKET_1'],
      seqs: [{ word: 0x104, name: 'cricket', offset: 0, cmds: [[44, sound(4)]] }] }])).toEqual([]);
  });

  it("MP51's water_drain: ~WATER_LEAK sits in an NA 0x104 sequence -- no emitter", () => {
    expect(world([{ name: 'water_drain', names: ['NA', 'pipe', 'water_drain', 'water_a_spewing_out1', '~WATER_LEAK'],
      seqs: [
        { word: 0x102, offset: 0, cmds: [] },
        { word: 0x102, offset: 340, cmds: [] },
        { word: 0x104, offset: 376, cmds: [[404, sound(4)]] },
      ] }])).toEqual([]);
  });

  it('an activation-1 loop, one its own CALL_SEQUENCE reaches, and an Anim_Params guard still sound', () => {
    expect(world([
      { name: 'fire1', names: ['NA', 'coals', 'fire1', '~FIRE_SM'], seqs: [{ word: 0x102, offset: 0, cmds: [[28, sound(3)]] }] },
      { name: 'called1', names: ['NA', 'coals', 'called1', 'later', '~FAN_ROTATE'], seqs: [
        { word: 0x102, offset: 0, cmds: [[28, callSeq(3)]] },
        { word: 0x104, name: 'later', offset: 36, cmds: [[64, sound(4)]] },
      ] },
      { name: 'guarded1', names: ['NA', 'coals', 'guarded1', '~WIND'], seqOffsets: [0, 100, 0, 0], seqs: [
        { word: 0x102, offset: 0, cmds: [] },
        { word: 0x104, offset: 100, cmds: [[128, sound(3)]] },
      ] },
    ])).toEqual(['fire1 ~FIRE_SM', 'called1 ~FAN_ROTATE', 'guarded1 ~WIND']);
  });
});
