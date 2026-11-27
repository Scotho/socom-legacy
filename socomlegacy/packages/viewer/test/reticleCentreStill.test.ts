import { describe, expect, it } from 'vitest';
import { aimTerm, pipCentre, reticleLayout } from '../src/reticle';

/**
 * Craig's playtest (2026-11-22, agent/next 45e1576b28, a release blocker): "my reticle centerpoint is never still
 * anymore. it's constantly rapidly shifting multiple pixels and never resets properly in the center", and "jitters
 * completely still". The aim the page hands the reticle is a fresh projection each frame (`matchFirearm`
 * `aimPoint(camera, target)` less the screen's shift), so it carries a frame-to-frame wobble far under a pixel. B-77's
 * corner truncation (RETICLE_CORNER_TRUNCATION_READING; held, re-applied where the drawn camera is the game's and the aim the exact centre) turned that wobble into
 * a one-PS2-pixel flip of the pip (2.41 frame pixels at 1080p). Standing still, the drawn centre mark and ring must not
 * move (the root: `reticleAimAtRest.test.ts`).
 */
const FRAME = { width: 1920, height: 1080 };
const PIP: [number, number] = [16, 16];
const RING = { fixed: 65, arm: 32 };

// The pip as the reticle's render lays it (AIM-AT-REST): the original's centre (320, 224) truncated, the aim's term after.
const pipAt = (aim: [number, number]): [number, number] => pipCentre(FRAME, [320, 224], [0, 0], PIP, aimTerm(FRAME, aim));
const ringAt = (aim: [number, number]): [number, number] => {
  const q = reticleLayout(FRAME, aim, 0, [0, 0], RING).quads[0]!;
  return [q.x, q.y];
};
const spread = (vs: number[]): number => Math.max(...vs) - Math.min(...vs);

describe('the reticle\'s centre mark and ring stand still (the playtest red)', () => {
  it('at rest (the aim exactly the centre) over 300 frames: the pip and the ring do not move at all', () => {
    const pips: [number, number][] = [], rings: [number, number][] = [];
    for (let k = 0; k < 300; k++) { pips.push(pipAt([0.5, 0.5])); rings.push(ringAt([0.5, 0.5])); }
    for (const axis of [0, 1]) {
      expect(spread(pips.map((p) => p[axis]!))).toBe(0);
      expect(spread(rings.map((r) => r[axis]!))).toBe(0);
    }
  });

  it('under an aim wobble within 1e-6 of the centre over 300 frames: the pip and the ring move far under a frame pixel', () => {
    const pips: [number, number][] = [], rings: [number, number][] = [];
    for (let k = 0; k < 300; k++) {
      const w = 1e-6 * Math.sin(k * 0.7);
      pips.push(pipAt([0.5 + w, 0.5 - w]));
      rings.push(ringAt([0.5 + w, 0.5 - w]));
    }
    for (const axis of [0, 1]) {
      expect(spread(pips.map((p) => p[axis]!))).toBeLessThan(0.01);
      expect(spread(rings.map((r) => r[axis]!))).toBeLessThan(0.01);
    }
  });
});
