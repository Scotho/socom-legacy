import { describe, expect, it } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import { atmosphereTarget, calibrate, previewRgb, previewTarget } from '../../src/forge/lightingBaseline';

describe('shared Forge lighting baseline (browser adaptation)', () => {
  it('gives outdoor night a dark cool atmosphere even on a map with bright yellow authored fog', () => {
    const night = atmosphereTarget(0), day = atmosphereTarget(1), middle = atmosphereTarget(0.5);
    expect(Math.max(...night)).toBeLessThan(0.06);
    expect(night[2]).toBeGreaterThan(night[0]);
    for (let c=0;c<3;c++) {
      expect(day[c]!).toBeGreaterThan(night[c]!*8);
      expect(middle[c]!).toBeGreaterThan(night[c]!);
      expect(middle[c]!).toBeLessThan(day[c]!);
    }
  });
  it('gives dark and bright maps the same middle surface brightness at either endpoint', () => {
    for (const baseline of [0.035, 0.28]) for (const time of [0, 1]) {
      const out = previewRgb([baseline, baseline, baseline], baseline, time);
      expect(out[0]).toBeCloseTo(previewTarget(time), 7);
    }
  });

  it('keeps black black, retains shade ordering, and avoids clipping bright surfaces', () => {
    expect(previewRgb([0, 0, 0], 0.04, 1)).toEqual([0, 0, 0]);
    const samples = [0.001, 0.01, 0.04, 0.4, 0.95].map(v => previewRgb([v, v, v], 0.04, 1)[0]);
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
    expect(samples[4]).toBeLessThan(1);
    expect(samples[1]).toBeGreaterThan(0.01);
  });

  it('calibrates from opaque fogged surfaces, excludes sky, and never edits source colours', () => {
    const part = (v: number, fog: boolean) => ({ fog, lit: false, textureName: null,
      colors: new Float32Array([v,v,v,1, v,v,v,1, v,v,v,1]),
      positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]), indices: new Uint32Array([0,1,2]) });
    const ground = part(0.1, true), sky = part(0.95, false);
    const map = { world: [ground, sky], props: [], textures: {}, textureFlags: {} } as unknown as LoadedMap;
    const saved = ground.colors.slice();
    expect(calibrate(map).median).toBeCloseTo(0.1, 2);
    expect(ground.colors).toEqual(saved);
    expect(calibrate({ ...map, world: [ground] } as unknown as LoadedMap).median).toBe(calibrate(map).median);
  });
});
