// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseMotionZar } from '@s2u/scene';
import { FALL_POSE_ROOT_READING } from '../src/mover';

/**
 * FLE-1's test 0 (the fall-leave-edge plan): the three roots the pose step reads, through the repository's readers, on
 * EVERY key of their clips -- the constancy the walker's "no ground clock" rests on (`FALL_POSE_ROOT_READING`).
 * `seal_run` 10.3047, `seal_crouchwalk` 9.3281, the fall clip `seal_runningjump_in_air` 10.5977 (research 151 s9.5's disc
 * reading, read there outside the repository's readers). The dev disc's `RUN/MOTION_P.ZAR`; skipped (and said) without it.
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const PACKS = [DISC && join(DISC, 'RUN', 'MOTION_P.ZAR'), resolve(__dirname, '../../../public/maps/RUN/MOTION_P.ZAR')].filter((p) => p && existsSync(p));
const PACK = PACKS[0] ?? '';

describe.skipIf(!PACK)(`FLE-1 test 0: the pose step's three roots, constant on every key${PACK ? '' : ' (no MOTION_P.ZAR: SOCOM_DISC -- skipped)'}`, () => {
  const R = FALL_POSE_ROOT_READING;
  for (const [name, want] of [['seal_run', R.run], ['seal_crouchwalk', R.crouchWalk], ['seal_runningjump_in_air', R.fall]] as const) {
    it(`${name}'s skel_root stands at ${want} over the feet on every key`, () => {
      const clips = parseMotionZar(Zar.parse(new Uint8Array(readFileSync(PACK))));
      const clip = clips.find((c) => c.name === name);
      expect(clip, name).toBeDefined();
      const root = clip!.parts.find((p) => p.name === 'skel_root')!;
      const ys: number[] = [];
      for (let i = 1; i < root.translations.length; i += 3) ys.push(root.translations[i]!);
      expect(ys.length).toBeGreaterThan(0);
      for (const [k, y] of ys.entries()) expect(y, `${name} key ${k}`).toBeCloseTo(want, 4);
    });
  }
});
