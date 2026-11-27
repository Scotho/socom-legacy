// LATER 1249 on the dev disc (reading, pending review): FRAG_sparks' `spark_streak` -- the M67's white discs in PC 3's
// isolation renders (l1248-iso, run 2) -- carries the near pair [100, 0]. `FUN_00266830` squares it as written
// (D:L113213-113226) and `FUN_003286d0` (D:L225901-225919) is 0 at or inside the near start: no spark within 100 u of the
// camera. MP73's sources with a positive near start over an end of 0 (the six on every map is the weather seat's census of
// 2026-11-19, a run not recorded in the tree; only MP73's set is held here).
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { particleFade, type ParticleSource } from '@s2u/scene';
import { effectsFromDisc } from '../src/effectData';

const DISC = process.env.SOCOM_DISC ?? '';

describe.skipIf(DISC === '')('LATER 1249 on the dev disc: the near cut of the sparks (skipped without SOCOM_DISC)', () => {
  it('MP73: FRAG_sparks\u2019 spark_streak is [100, 0] and unseen within 100 u; the six cut sources hold their pairs', async () => {
    const d = await effectsFromDisc(new FsAssetSource(DISC), 'RUN/MP73.ZDB', 'MP73');
    const sources: ParticleSource[] = [];
    for (const p of d.programs) for (const q of p.sequences) for (const o of q.ops) if (o.op === 'particles') sources.push({ ...o.source, program: p.name } as ParticleSource & { program: string });
    const spark = sources.find((s) => (s as ParticleSource & { program: string }).program === 'FRAG_sparks' && s.name === 'spark_streak')!;
    expect(spark.nearFade).toEqual([100, 0]);
    expect(particleFade(spark, 99 ** 2)).toBe(0);
    expect(particleFade(spark, 100 ** 2)).toBe(0);
    expect(particleFade(spark, 101 ** 2)).toBe(1);
    const cut = new Set(sources.filter((s) => s.nearFade && s.nearFade[0] > 0 && s.nearFade[1] < s.nearFade[0]).map((s) => `${s.name} ${s.nearFade![0]}`));
    expect([...cut].sort()).toEqual(['BigRing 100', 'grenade_water_spray 100', 'spark_streak 100', 'spark_streak 30', 'spark_streak1 50', 'spark_streak2 100']);
    for (const s of sources) if (s.nearFade && s.nearFade[0] > 0 && s.nearFade[1] < s.nearFade[0]) expect(particleFade(s, (s.nearFade[0] - 1) ** 2)).toBe(0);
  }, 120_000);
});
