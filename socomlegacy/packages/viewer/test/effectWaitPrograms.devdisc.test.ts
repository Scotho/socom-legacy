// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, parseAnimSets, type EffectProgram } from '@s2u/scene';
import { EffectRun, type EffectHost } from '../src/effectRunner';

/**
 * LATER 1426 (research 89 s1.1; reading, pending review): two map programs that are not the levers, run by the shared
 * runner at 60 Hz from their start (`update(0)`, then 1/60 a call), off the dev disc (`SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`; skipped -- and said so -- without it).
 *
 * - MP62 `on_lablights` (activation 1, no WHILE: reached): `WAIT 0.17`, then a 0.5 s `OBJECT_MOTION_FROM_TO` on
 *   `gatehand`, then its `.SWITCH_BIG`. The WAIT's leftover (11/60 - 0.17 s) is handed to the from-to in the same tick,
 *   so the sound comes on tick floor(60 x 0.67) + 1 = 41. The from-to's tick here is the original's form (`FUN_0025f9b0`:
 *   held while dt + elapsed <= seconds, the rest carried on; `gates.ts` `leverHold`).
 * - MP73 `radiolight_blink` (a forever WHILE: it repeats in the port): the light on, off, `WAIT 1.5`, END_WHILE. END_WHILE
 *   ends its tick (r0004 0x25f170), so the next pass begins on a whole tick: the light comes every
 *   floor(60 x 1.5) + 1 = 91 ticks -- the same period as before LATER 1426, the first pass a tick later (equality holds:
 *   tick 91, where the port's 1e-9 slack ended it on 90).
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && ['MP62', 'MP73'].every((m) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));
const F = 1 / 60;

function program(stem: string, name: string): EffectProgram {
  const bytes = new Uint8Array(readFileSync(join(DISC, 'RUN', `${stem}.ZDB`)));
  for (const set of parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR'))).sets) {
    for (const a of set.anims) if (a.name === name) return decodeEffectProgram(a);
  }
  throw new Error(`${stem} ${name}: not on the disc`);
}

describe.skipIf(!HAVE_DISC)(`LATER 1426: two map programs' waits${HAVE_DISC ? '' : ' (SOCOM_DISC with RUN/MP62.ZDB and RUN/MP73.ZDB absent)'}`, () => {
  it("MP62 on_lablights: the WAIT's leftover starts the from-to, whose end brings .SWITCH_BIG on tick 41", () => {
    const p = program('MP62', 'on_lablights');
    const ops = p.sequences[0]!.ops;
    expect(ops.slice(0, 3).map((o) => o.op)).toEqual(['wait', 'fromTo', 'sound']);
    let k = 0, sound = -1, firstDt = -1;
    const host: EffectHost = {
      begin: (op) => {
        if (op.op === 'sound' && sound < 0) sound = k;
        if (op.op !== 'fromTo') return;
        let elapsed = 0;
        return (dt: number) => {
          if (firstDt < 0) firstDt = dt;
          if (dt + elapsed <= op.seconds) { elapsed += dt; return false; }
          return dt - (op.seconds - elapsed);
        };
      },
      test: () => false,
      random: () => 0.5,
    };
    const run = new EffectRun(p, host);
    run.update(0);
    for (k = 1; k <= 60 && sound < 0; k++) run.update(F);
    expect(Math.abs(firstDt - (11 / 60 - Math.fround(0.17)))).toBeLessThan(1e-12);
    expect(sound).toBe(41);
  });

  it('MP73 radiolight_blink: the light comes every 91 ticks', () => {
    const p = program('MP73', 'radiolight_blink');
    const seq = p.sequences.findIndex((s) => s.ops.some((o) => o.op === 'wait'));
    expect(p.sequences[seq]!.ops.map((o) => o.op)).toEqual(['while', 'active', 'light', 'active', 'wait', 'endWhile']);
    let k = 0;
    const lights: number[] = [];
    const host: EffectHost = { begin: (op) => { if (op.op === 'light') lights.push(k); }, test: () => false, random: () => 0.5 };
    const run = new EffectRun(p, host);
    run.update(0);
    for (k = 1; k <= 300; k++) run.update(F);
    expect(lights).toEqual([0, 92, 183, 274]);
  });
});
