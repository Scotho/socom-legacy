// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, parseAnimSets, type EffectOp, type EffectProgram } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { EffectRun, type EffectHost } from '../src/effectRunner';

/**
 * Research 448 (reading, pending review), on the disc's own programs (Desert Glory, MP6, the fixture): the original
 * starts an animation's activation-1 sequences only (FUN_0026ae20, D:L115457-115509); an activation-2 sequence runs
 * when a start by name reaches it (FUN_00269b00, D:L114701-114760) -- CALL_SEQUENCE, OBJECT_MOTION's material sequence,
 * or the game's own start (AI names only). The owner's report (bugs intake v0423 s5): the port's burn barrel glows; his
 * capture of the original shows no glow.
 */

const MP6 = fixture('RUN/MP6.ZDB');

function programs(zdb: Uint8Array, member: 'CZANIM.ZAR' | 'MZANIM.ZAR'): Map<string, EffectProgram> {
  const archive = parseAnimSets(Zar.parse(zdbMember(zdb, parseZdb(zdb), member)));
  return new Map(archive.sets.flatMap((s) => s.anims).map((a) => [a.name, decodeEffectProgram(a)]));
}

/** Runs a program for `seconds` at 30 ticks a second; every command a host would begin, by its op (and its name). */
function begun(p: EffectProgram, seconds: number, draw = 0.5): string[] {
  const log: string[] = [];
  const host: EffectHost = {
    begin: (op: EffectOp) => {
      if (op.op === 'call') log.push(`call ${op.anim}`);
      else if (op.op === 'sound') log.push(`sound ${op.sound}`);
      else log.push(op.op);
    },
    test: () => false,
    random: () => draw,
  };
  const run = new EffectRun(p, host);
  run.update(0);
  for (let t = 0; t < seconds * 30 && !run.finished; t++) run.update(1 / 30);
  return log;
}

describe.skipIf(!MP6)(`research 448 on Desert Glory's programs ${MP6 ? '' : FIXTURES_ABSENT}`, () => {
  it('flame_in_barrel: its sound and four particle sources start; its LIGHT (sequence 6, word 0x104) never does', () => {
    const log = begun(programs(MP6!, 'MZANIM.ZAR').get('flame_in_barrel')!, 10);
    expect(log).toEqual(['sound ~FIRE_SM', 'particles', 'particles', 'particles', 'particles']);
    expect(log).not.toContain('light');
  });

  it("the C4 blast (common c4): he_grenade's effect and its sound only -- c4_smoke2, c4fire_explode5's light, c4fire_explode and c4fire_explode2 never start", () => {
    const log = begun(programs(MP6!, 'CZANIM.ZAR').get('c4')!, 10);
    expect(log).toEqual(['call he_grenade', 'sound .C4_EXP_1']);
  });

  it("mp6_battlesounds: the uncalled 'test' sequence (its random CALL_ANIMATION testexplode) never runs", () => {
    // A draw of 0 takes every RANDOM_WEIGHT branch, so the 'test' sequence's first CALL_ANIMATION would begin at once.
    const log = begun(programs(MP6!, 'MZANIM.ZAR').get('mp6_battlesounds')!, 30, 0);
    expect(log.some((l) => l === 'call testexplode')).toBe(false);
  });
});
