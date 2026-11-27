import { describe, expect, it } from 'vitest';
import type { EffectOp, EffectProgram } from '@s2u/scene';
import { ambientProgramsOf, programRepeatOf, programWorkOf, scriptOfProgram } from '../../src/forge/forgeObjects';

/**
 * Research 448 (reading, pending review): the forge's disc ambients read only the sequences the original starts --
 * activation 1, an `Anim_Params` guard, or one its own `CALL_SEQUENCE` names (`FUN_0026ae20` D:L115457-115509,
 * `FUN_00269b00` D:L114701-114760). Shapes from the disc: MP6's `flame_in_barrel` (its light in an `NA` 0x104 sequence),
 * MP73's `cricket_sound01` (its only sequence 0x104, `~CRICKET_1`).
 */

const snd = (sound: string): EffectOp => ({ op: 'sound', sound, volume: 1 } as EffectOp);
const barrel: EffectProgram = {
  name: 'flame_in_barrel', root: 1, flags: 33, nodes: ['NA', 'barrel_fire1'],
  sequences: [
    { name: 'NA', activation: 1, ops: [snd('~FIRE_SM')] },
    { name: 'NA', activation: 1, ops: [{ op: 'particles' } as unknown as EffectOp] },
    { name: 'NA', activation: 2, ops: [{ op: 'light' } as unknown as EffectOp] },
  ],
};
const cricket: EffectProgram = {
  name: 'cricket_sound01', root: 1, flags: 33, nodes: ['NA', 'dcrik01'],
  sequences: [{ name: 'cricket', activation: 2, ops: [snd('~CRICKET_1')] }],
};
const called: EffectProgram = {
  name: 'called1', root: 1, flags: 33, nodes: ['NA', 'n1'],
  sequences: [
    { name: 'NA', activation: 1, ops: [{ op: 'callSequence', sequence: 'later' }] },
    { name: 'later', activation: 2, ops: [snd('~FAN_ROTATE')] },
  ],
};
const map = { meta: { scene: { programs: [barrel, cricket, called].map((program) => ({ program })) } } } as unknown as Parameters<typeof ambientProgramsOf>[0];

describe('research 448: the forge lists and sounds only what the original starts', () => {
  it("flame_in_barrel is offered with its particles and ~FIRE_SM, without the light it never starts", () => {
    const b = ambientProgramsOf(map).find((p) => p.name === 'flame_in_barrel')!;
    expect(b).toMatchObject({ particles: true, light: false, loops: [{ sound: '~FIRE_SM', volume: 1 }] });
  });

  it('a cricket whose only sequence is never started is no ambient; its audio script plays nothing', () => {
    expect(ambientProgramsOf(map).some((p) => p.name === 'cricket_sound01')).toBe(false);
    expect(scriptOfProgram(cricket, 'MP73').steps).toEqual([]);
  });

  it('a sequence its own CALL_SEQUENCE names still sounds', () => {
    expect(ambientProgramsOf(map).find((p) => p.name === 'called1')?.loops).toEqual([{ sound: '~FAN_ROTATE', volume: 1 }]);
  });

  // PR #5's import (0ed80a521b) added the Inspector's two label helpers (`programRepeatOf`: a native emitter's Repeat row,
  // page.ts `nativeRepeatRow`; `programWorkOf`: an emitter's Does row): they read the same sequences as the rest of the
  // file (`playedSequences`), so a never-started sequence neither says its sounds loop nor lists its light.
  it("programRepeatOf: a never-started sequence's ~ sound does not make the program's sounds loop", () => {
    expect(programRepeatOf(map, 'cricket_sound01')).toEqual({ again: false, loops: false });
    expect(programRepeatOf(map, 'flame_in_barrel')).toEqual({ again: false, loops: true });     // ~FIRE_SM, activation 1
    expect(programRepeatOf(map, 'called1')).toEqual({ again: false, loops: true });             // its CALL_SEQUENCE's
    expect(programRepeatOf(map, 'no_such_program')).toBeNull();
  });

  it("programWorkOf: a never-started sequence's light or sound is not what the program does", () => {
    expect(programWorkOf(map, 'flame_in_barrel')).toEqual({ particles: true, sound: true, light: false });
    expect(programWorkOf(map, 'cricket_sound01')).toEqual({ particles: false, sound: false, light: false });
    expect(programWorkOf(map, 'called1')).toEqual({ particles: false, sound: true, light: false });
    expect(programWorkOf(map, 'no_such_program')).toBeNull();
  });
});
