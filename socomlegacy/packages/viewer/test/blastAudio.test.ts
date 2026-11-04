import { describe, expect, it } from 'vitest';
import { streamGroupModifier, voiceLevel } from '@s2u/sound';
import { BLAST_DUCK_GROUPS, blastDuckedMaster, blastGroupGain } from '../src/blastAudio';

describe('blast group master curve (research 202 §11)', () => {
  it('excludes ring, UI, headset and other unlisted groups', () => {
    expect([...BLAST_DUCK_GROUPS].sort()).toEqual([0, 1, 2, 3, 5, 6]);
  });
  it('recovers in integer master space before the square, including silence and non-default tuners', () => {
    // EE floats round these products up to integers; JS doubles alone truncate them one too low.
    expect(blastDuckedMaster(180, 0.35)).toBe(63);
    expect(blastDuckedMaster(720, 0.35)).toBe(252);
    expect(blastGroupGain(180, 63, 1 / 3)).toBe((102 / 180) ** 2);
    expect(blastGroupGain(1024, 358, 0)).toBe((358 / 1024) ** 2);
    expect(blastGroupGain(1024, 358, 0.5)).toBe((691 / 1024) ** 2);
    expect(blastGroupGain(757, 264, 0.5)).toBe((510 / 757) ** 2);
    expect(blastGroupGain(0, 0, 0.5)).toBe(0);
    expect(blastGroupGain(1024, 358, 1)).toBe(1);
  });
  it('bounds the PCM ratio error against the original integer voice stage over all voice levels', () => {
    // Absolute error normalized by full-scale voice output. Relative error near silence is not meaningful.
    let worst = 0;
    for (const saved of [0, 1, 64, 256, 512, 757, 1024]) {
      const ducked = Math.trunc(Math.fround(saved * Math.fround(0.35)));
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const master = Math.trunc(Math.fround(ducked + Math.fround((saved - ducked) * Math.fround(t))));
        const ratio = blastGroupGain(saved, ducked, t);
        for (let vol = 0; vol <= 0x7ffe; vol++) {
          const baseline = voiceLevel(vol, streamGroupModifier(saved));
          const exact = voiceLevel(vol, streamGroupModifier(master));
          worst = Math.max(worst, Math.abs(baseline * ratio - exact) / 0x3fff);
        }
      }
    }
    console.log('BLAST PCM MAX NORMALIZED VOICE ERROR', worst);
    expect(worst).toBeLessThan(0.0002);
  });
});
