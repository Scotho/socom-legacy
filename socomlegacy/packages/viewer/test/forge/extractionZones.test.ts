import { describe, expect, it } from 'vitest';
import { aiCellOf, zoneContains, type AiMaps, type AiSubMap } from '@s2u/scene';
import { FORGE_ZONE_GRID_CLIP_ADAPTATION, nextSafetyName, withPlacedZones } from '../../src/forge/extractionZones';

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
  // Codex P2 on PR #742: a zone over the grid's edge is clipped to the grid, never shifted into it. Both Plays compose it
  // through the one call, `playObjectives` (src/forge/playObjectives.ts:30, `withPlacedZones`), the page's local Play and
  // the room's (FP-1a).
  it("one over the grid's minimum edge is clipped to the grid, not shifted into it", () => {
    // Authored X [-15, 25] on a grid from 0 (10-unit cells): cells 0-2 (X [0, 30]), not 0-3 (the old shifted [0, 40]).
    const { map, unplaced, centres } = withPlacedZones({ ai, tac: { zones: [] } }, [{ name: 'Safety2', at: [5, 198, 50], size: [40, 20] }]);
    expect(unplaced).toBe(0);
    expect(map.ai!.maps[1]!.zones[1]).toEqual({ name: 'Safety2', corner: { map: 1, x: 0, z: 4 }, width: 3, height: 2, kind: 1 });
    expect(map.tac!.zones[0]).toEqual({ minX: 0, minZ: 40, maxX: 30, maxZ: 60, kind: 1, name: 'Safety2' });
    expect(centres).toEqual([[15, 200, 50]]);
    // The same on Z.
    expect(withPlacedZones({ ai }, [{ name: 'Safety2', at: [50, 198, 5], size: [20, 40] }]).map.ai!.maps[1]!.zones[1])
      .toEqual({ name: 'Safety2', corner: { map: 1, x: 4, z: 0 }, width: 2, height: 3, kind: 1 });
  });

  it("one over the grid's maximum edge is clipped there; one wholly inside is unchanged", () => {
    // Authored X [75, 115] on a grid to 100: cells 7-9.
    expect(withPlacedZones({ ai }, [{ name: 'Safety2', at: [95, 198, 95], size: [40, 40] }]).map.ai!.maps[1]!.zones[1])
      .toEqual({ name: 'Safety2', corner: { map: 1, x: 7, z: 7 }, width: 3, height: 3, kind: 1 });
    expect(withPlacedZones({ ai }, [{ name: 'Safety2', at: [50, 198, 50], size: [40, 20] }]).map.ai!.maps[1]!.zones[1])
      .toEqual({ name: 'Safety2', corner: { map: 1, x: 3, z: 4 }, width: 4, height: 2, kind: 1 });
  });

  it("one wholly outside the grid places nothing and is counted (playObjectives' zonesLeft)", () => {
    const { map, unplaced } = withPlacedZones({ ai }, [{ name: 'Safety2', at: [-100, 198, 50], size: [40, 20] }]);
    expect(unplaced).toBe(1);
    expect(map.ai!.maps[1]!.zones).toHaveLength(1);
  });

  it("the room's extraction test does not take a hostage outside the authored zone (ExtractionAuthority.inZone)", () => {
    // `inZone` -> `cellIn` (match/src/extraction.ts:776, :791-794) tests the hostage's cell with `zoneContains`
    // (FUN_0052a200 D:L395058-395098, scene/src/aimaps.ts:273) against the map's kind-1 zones; the cell here is
    // `aiCellOf`'s, the planner's `locate` stand-in. X = 30 is outside the authored [-15, 25], inside the old [0, 40].
    const zone = withPlacedZones({ ai }, [{ name: 'Safety2', at: [5, 198, 50], size: [40, 20] }]).map.ai!.maps[1]!.zones[1]!;
    const cell = (x: number) => aiCellOf(ai.maps[1]!, x, 50)!;
    expect(zoneContains(zone, cell(30))).toBe(false);
    expect(zoneContains(zone, cell(35))).toBe(false);
    expect(zoneContains(zone, cell(20))).toBe(true);
    expect(zoneContains(zone, cell(0))).toBe(true);
  });
  it("one not clipped on an axis keeps its authored size's cells there, as before the clip (the review of 494b3104a)", () => {
    // A wide grid (X from -5000, 1000 cells of 10): at X = -3999.9 a 255-wide zone is 26 cells, round(255 / 10); the
    // span (at + s/2) - (at - s/2) is 254.99999999999955 in doubles and would round to 25.
    const wide = { ...sub(0, 0), min: [-5000, 0, 0], max: [5000, 1024, 100], cellsX: 1000,
      rows: Array.from({ length: 10 }, (_, z) => ({ x0: 0, x1: 1000, first: z * 1000 })), cells: Array.from({ length: 10000 }, () => 0) } as unknown as AiSubMap;
    const wideAi = { ...ai, maps: [wide] } as AiMaps;
    expect(withPlacedZones({ ai: wideAi }, [{ name: 'Safety2', at: [-3999.9, 0, 50], size: [255, 20] }]).map.ai!.maps[0]!.zones[1])
      .toMatchObject({ corner: { map: 0, x: 87, z: 4 }, width: 26, height: 2 });
    // Clipped on X only: X from the clipped span [0, 25] (3 cells), Z from its authored 20 (2 cells).
    expect(withPlacedZones({ ai }, [{ name: 'Safety2', at: [5, 198, 50], size: [40, 20] }]).map.ai!.maps[1]!.zones[1])
      .toMatchObject({ corner: { map: 1, x: 0, z: 4 }, width: 3, height: 2 });
    expect(FORGE_ZONE_GRID_CLIP_ADAPTATION).toBeTypeOf('string');
  });
});
