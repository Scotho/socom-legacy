import { describe, expect, it } from 'vitest';
import { aiCellIndex, aiCellOf, aiCellY, type EscorteeStart } from '@s2u/scene';
import { FLOOR_AI_SOIL, floorAiMaps } from '../../src/forge/floorAi';
import { withPlacedHostages } from '../../src/forge/hostages';
import { withPlacedZones } from '../../src/forge/extractionZones';

/**
 * The blank floor's AI map (a browser adaptation, FG.R2): one open, flat sub-map over the floor, so placed hostages and
 * extraction zones have cells there as on a disc map.
 */
describe('the blank floor\'s AI map', () => {
  const ai = floorAiMaps(8000);
  const sub = ai.maps[0]!;

  it('covers the floor about the origin, every cell stored, at height 0, on the open soil', () => {
    // FP-1a: the disc's cell, 10 by 10 on every one of the 83 sub-maps (research 75 section 3, header +0x24; pinned over
    // every map by `scene/test/spawnSlots.parity.test.ts`), so the hostage rules' cell literals hold on the floor too.
    expect(sub.cellSize).toEqual([10, 10]);
    expect([sub.cellsX, sub.cellsZ]).toEqual([800, 800]);
    expect([sub.min[0], sub.min[2], sub.max[0], sub.max[2]]).toEqual([-4000, -4000, 4000, 4000]);
    for (const [x, z] of [[-3999, -3999], [0, 0], [3999, 3999]] as const) {
      const loc = aiCellOf(sub, x, z)!;
      const i = aiCellIndex(sub, loc.x, loc.z);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(aiCellY(sub, sub.cells[i]!)).toBe(0);
      expect(sub.cells[i]! & 31).toBe(FLOOR_AI_SOIL);
    }
    expect(aiCellOf(sub, 5000, 0)).toBeNull();
  });

  it('takes placed hostages (with a character lent) and extraction zones', () => {
    const model = { name: 'Hostage1', character: 'thai_wife', loc: { map: 0, x: 0, z: 0 }, at: [0, 0, 0] as [number, number, number], yaw: 0, team: 3 };
    const h = withPlacedHostages({ ai, escortees: [] as EscorteeStart[] }, [{ p: [100, 0, 100], yaw: 0 }], model);
    expect([h.unplaced, h.map.escortees!.map((e) => e.character)]).toEqual([0, ['thai_wife']]);
    const z = withPlacedZones({ ai }, [{ name: 'Safety', at: [0, 0, 0], size: [100, 100] }]);
    expect(z.unplaced).toBe(0);
    // A 100-unit zone is 10 by 10 cells, its corner on the drawn corner (the disc's cell; at 32 it was 3 cells, 96 units).
    expect(z.map.ai!.maps[0]!.zones.map((q) => [q.width, q.height, q.corner.x, q.corner.z])).toEqual([[10, 10, 395, 395]]);
  });
});
