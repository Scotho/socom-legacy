// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { zanimEmitters, zanimSounds, type ZAnimPayload } from '@s2u/sound';

/**
 * Research 448 (reading, pending review) on the disc's own maps: the world's looping emitters come only from sequences
 * the original starts (activation 1, an `Anim_Params` offset, or one its own `CALL_SEQUENCE` reaches; `FUN_0026ae20`
 * D:L115457-115509, `FUN_00269b00` D:L114701-114760). The maps are no fixtures: this file reads `SOCOM_DISC` (else
 * `SOCOM_PC_ROOT`'s game/disc) and skips without it -- a skip is said, never counted.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT;
const DISC = [process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '', PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '']
  .find((d) => d && existsSync(join(d, 'RUN', 'MP51.ZDB'))) ?? '';
const SKIP = DISC ? '' : ' -- SKIPPED: SOCOM_DISC / SOCOM_PC_ROOT with RUN/MP51.ZDB absent (no fixtures)';

function emitters(map: string): string[] {
  const zdb = new Uint8Array(readFileSync(join(DISC, 'RUN', `${map}.ZDB`)));
  const toc = parseZdb(zdb);
  const zars = ['CZANIM.ZAR', 'MZANIM.ZAR'].map((m) => Zar.parse(zdbMember(zdb, toc, m)));
  const payload: ZAnimPayload = (set, anim, offset, length) => {
    for (const z of zars) {
      const key = z.find(`Anim_Sets/${set}/Animation_List/${anim}/Seq_Data`);
      if (key && offset + length <= key.size) return z.data(key).subarray(offset, offset + length);
    }
    return null;
  };
  return zanimEmitters(zanimSounds(zars.map((z) => parseAnimSets(z)), payload)).map((e) => `${e.anim} ${e.sound}`);
}

describe.skipIf(!DISC)(`research 448: the world emitters the original never starts are gone${SKIP}`, () => {
  it("MP51: water_drain's ~WATER_LEAK (an NA 0x104 sequence) is no emitter", () => {
    expect(emitters('MP51').filter((e) => e.startsWith('water_drain '))).toEqual([]);
  });

  it('MP73 and M61: the crickets (cricket_sound01-06: their only sequence is activation 2, uncalled) are no emitters', () => {
    for (const map of ['MP73', 'M61']) expect(emitters(map).filter((e) => e.startsWith('cricket_sound'))).toEqual([]);
  });

  it("M62's frogs and M51's chicken coops likewise", () => {
    expect(emitters('M62').filter((e) => e.startsWith('frog_sound'))).toEqual([]);
    expect(emitters('M51').filter((e) => e.startsWith('chicken_coop'))).toEqual([]);
  });

  it("an activation-1 loop stays: MP6's flame_in_barrel ~FIRE_SM, MP2's fanblade1_start ~FAN_ROTATE", () => {
    expect(emitters('MP6')).toContain('flame_in_barrel ~FIRE_SM');
    expect(emitters('MP2')).toContain('fanblade1_start ~FAN_ROTATE');
  });
});
