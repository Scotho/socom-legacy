// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { decodeEffectOp, decodeEffectProgram, parseAnimSets, type EffectProgram } from '../src/index';

/**
 * PB-9b (PARITY-2; research 284 s3, s8 RED 1; ruling PB2.R5): the bases' pulse outlines are run by the map's own
 * `pulse_terrorist` / `pulse_seal` (`MZANIM.ZAR`, set `mission`). Each turns its outline node on, then pulses its opacity
 * for ever with two `OBJECT_OPACITY_FROM_TO` commands (set 0, cmd 25), and its cleanup sequence -- `Anim_Params`' fourth
 * offset, byte 100 -- turns the node off when the animation ends (`FUN_0026ff20(5)` -> `FUN_0026d870`, D:L118599).
 * The opacity command's fields are where its begin `FUN_0025f960` (D:L108835-108847) and its tick `FUN_0025f880`
 * (D:L108804-108832) read them: the node the half-word at +4, `from` +8, `to` +0xc, the rate a second +0x10, the time
 * +0x14. Decoded through the repository's readers from MP72's `MZANIM.ZAR` (the fixture); nothing here runs the game.
 */

const MP72 = fixture('RUN/MP72.ZDB');

function programs(zdb: Uint8Array): Map<string, EffectProgram> {
  const toc = parseZdb(zdb);
  const archive = parseAnimSets(Zar.parse(zdbMember(zdb, toc, 'MZANIM.ZAR')));
  return new Map(archive.sets.flatMap((s) => s.anims).map((a) => [a.name, decodeEffectProgram(a)]));
}

/** The pulse program research 284 s3 reads, for one base: its root and its outline node. */
const pulse = (name: string, base: string, node: string): EffectProgram => ({
  name, root: 1, flags: 0x32, nodes: ['NA', base, node], cleanup: 1,
  sequences: [
    { name: 'NA', activation: 1, ops: [
      { op: 'active', node: 2, on: true },
      { op: 'while', forever: true },
      { op: 'opacity', node: 2, from: 0.2, to: 0.05, rate: -0.15, seconds: 1 },
      { op: 'opacity', node: 2, from: 0.05, to: 0.2, rate: 0.75, seconds: 0.2 },
      { op: 'endWhile' },
    ] },
    { name: 'NA', activation: 2, ops: [{ op: 'active', node: 2, on: false }] },
  ],
});

describe('OBJECT_OPACITY_FROM_TO (set 0, cmd 25): FUN_0025f960 / FUN_0025f880\'s fields', () => {
  it('decodes the node (+4), from (+8), to (+0xc), the rate (+0x10) and the time (+0x14) off research 284 s3\'s bytes', () => {
    const hex = '19 00 60 00 02 00 00 00 cd cc 4c 3e cd cc 4c 3d 9a 99 19 be 00 00 80 3f';
    const bytes = Uint8Array.from(hex.split(' ').map((b) => parseInt(b, 16)));
    expect(decodeEffectOp({ set: 0, cmd: 25, bytes }, ['NA'])).toEqual({ op: 'opacity', node: 2, from: 0.2, to: 0.05, rate: -0.15, seconds: 1 });
  });
});

describe.skipIf(MP72 === null)(`MP72's pulse programs, decoded${MP72 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const all = MP72 ? programs(MP72) : new Map<string, EffectProgram>();

  it('pulse_terrorist: the outline on, then 0.2 -> 0.05 over 1 s and 0.05 -> 0.2 over 0.2 s for ever; its cleanup (byte 100) turns it off', () => {
    expect(all.get('pulse_terrorist')).toEqual(pulse('pulse_terrorist', 'terrorist_base', 'terrorist_pulse'));
  });

  it('pulse_seal: the same program on seal_base and seal_pulse', () => {
    expect(all.get('pulse_seal')).toEqual(pulse('pulse_seal', 'seal_base', 'seal_pulse'));
  });

  it('a program with no cleanup offset carries none (objectives: Anim_Params\' fourth offset 0)', () => {
    expect(all.get('objectives')).toBeDefined();
    expect('cleanup' in all.get('objectives')!).toBe(false);
  });
});
