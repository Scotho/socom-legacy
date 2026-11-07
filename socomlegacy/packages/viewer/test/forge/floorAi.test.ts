import { describe, expect, it } from 'vitest';
import { aiCellIndex, aiCellOf, aiCellY, type EscorteeStart } from '@s2u/scene';
import { FLOOR_AI_CELL, FLOOR_AI_SOIL, floorAiMaps } from '../../src/forge/floorAi';
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
    expect(sub.cellsX).toBe(Math.ceil(8000 / FLOOR_AI_CELL));
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
    expect(withPlacedZones({ ai }, [{ name: 'Safety', at: [0, 0, 0], size: [100, 100] }]).unplaced).toBe(0);
  });
});
