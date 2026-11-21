import { describe, expect, it } from 'vitest';
import { billboardMaterialParams } from '../../src/forge/mapDataBillboards';
import { hullLineMaterial } from '../../src/forge/hull';

/**
 * The editor's marks and its collision hull (the owner, 2026-11-09; editor guides, FG.R2): never fogged -- the map's fog
 * is the world's, a guide is read through it -- and the hull drawn in the world's depth, not over it.
 */
describe("the editor's guides and fog", () => {
  it('a billboard is never fogged, on top or not', () => {
    for (const onTop of [true, false]) {
      expect(billboardMaterialParams(onTop)).toMatchObject({ fog: false, depthTest: !onTop, depthWrite: false, transparent: true, sizeAttenuation: true });
    }
  });

  it('the collision hull is never fogged and is hidden behind what stands in front of it', () => {
    const m = hullLineMaterial();
    expect(m.fog).toBe(false);
    expect(m.depthTest).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.vertexColors).toBe(true);
  });
});
