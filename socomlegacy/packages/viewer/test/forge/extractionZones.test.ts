import { describe, expect, it } from 'vitest';
import type { AiMaps, AiSubMap } from '@s2u/scene';
import { nextSafetyName, withPlacedZones } from '../../src/forge/extractionZones';

/**
 * The layout's placed extraction zones in the match (a browser adaptation, FG.R2): each an EXTRACT_ZONE (kind 1) on the
 * AI map's sub-map under it, as the disc's Safety zones are -- the zones the room's extraction tests a hostage's cell
 * against (`ExtractionAuthority`) -- and a zone on the tactical map; named as the disc names them, Safety, Safety2, ...
 */
const sub = (index: number, y: number): AiSubMap => ({
  index, name: `s${index}`, id: index, flags: 0, min: [0, y, 0], max: [100, y + 1024, 100], cellsX: 10, cellsZ: 10, cellSize: [10, 10],
  param: 0.5, stamp: 0, rows: Array.from({ length: 10 }, (_, z) => ({ x0: 0, x1: 10, first: z * 10 })),
  cells: Array.from({ length: 100 }, () => 0), cellsB: [], zones: [{ name: 'Safety', corner: { map: index, x: 0, z: 0 }, width: 1, height: 1, kind: 1 }], points: [],
} as unknown as AiSubMap);
const ai = { version: 2, maps: [sub(0, 0), sub(1, 200)], links: { words: 0, records: 0 }, spawns: [] } as AiMaps;

describe('placed extraction zones', () => {
  it('are named as the disc names them: Safety, then Safety2, Safety3, the first free', () => {
    expect(nextSafetyName([])).toBe('Safety');
    expect(nextSafetyName(['Safety', 'Safety2'])).toBe('Safety3');
    expect(nextSafetyName(['safety', 'Safety3'])).toBe('Safety2');
  });

  it('each a kind-1 zone in the cells it covers, on the floor nearest it, the map\'s own kept; on the tactical map too', () => {
    const tac = { lines: [], points: [], zones: [{ minX: 0, minZ: 0, maxX: 10, maxZ: 10, kind: 1, name: 'Safety' }], bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 100 } };
    const { map, unplaced } = withPlacedZones({ ai, tac }, [{ name: 'Safety2', at: [50, 198, 50], size: [40, 20] }]);
    expect(unplaced).toBe(0);
    expect(map.ai!.maps[0]!.zones).toHaveLength(1);                                           // the other floor's untouched
    expect(map.ai!.maps[1]!.zones[1]).toEqual({ name: 'Safety2', corner: { map: 1, x: 3, z: 4 }, width: 4, height: 2, kind: 1 });
    expect(ai.maps[1]!.zones).toHaveLength(1);                                                 // the loaded map's not changed
    expect(map.tac!.zones[1]).toEqual({ minX: 30, minZ: 40, maxX: 70, maxZ: 60, kind: 1, name: 'Safety2' });
    expect(withPlacedZones({ ai, tac }, [{ name: 'Safety2', at: [50, 198, 50], size: [40, 20] }]).centres).toEqual([[50, 200, 50]]);   // its cells' middle, their floor
  });

  it('in Escort a placed zone starts HUD_VISIBLE (kind 5), as the script\'s reset leaves Safety until its promotion', () => {
    const { map } = withPlacedZones({ ai }, [{ name: 'Safety2', at: [50, 198, 50], size: [40, 20] }], 5);
    expect(map.ai!.maps[1]!.zones[1]!.kind).toBe(5);
  });

  it('one off the grid, or a map with no AI map, is left out and counted', () => {
    expect(withPlacedZones({ ai }, [{ name: 'Safety2', at: [900, 0, 900], size: [10, 10] }]).unplaced).toBe(1);
    expect(withPlacedZones({}, [{ name: 'Safety', at: [0, 0, 0], size: [10, 10] }]).unplaced).toBe(1);
  });
});
