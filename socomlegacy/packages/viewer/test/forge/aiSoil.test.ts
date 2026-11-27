import { describe, expect, it } from 'vitest';
import { aiCellIndex } from '@s2u/scene';
import { AI_PAINT_KINDS, aiBrushCells, aiCellKey, aiSoilAt, parseAiCellKey, withAiSoil } from '../../src/forge/aiSoil';
import { aiSoilKind } from '../../src/forge/aiMapOverlay';
import { FLOOR_AI_SOIL, floorAiMaps } from '../../src/forge/floorAi';

/** A layout's painted AI cells (`../../src/forge/aiSoil`; the Forge's owner (crispy, OT.R112), 2026-11-16): the soil bits alone, the disc's grid kept. */
describe('painted AI cells', () => {
  const ai = floorAiMaps(100);                                 // 10 x 10 cells of 10 units, soil 3 (road)

  it('a key names a cell and reads back', () => {
    expect(aiCellKey({ map: 3, x: 12, z: 40 })).toBe('3:12:40');
    expect(parseAiCellKey('3:12:40')).toEqual({ map: 3, x: 12, z: 40 });
    expect(parseAiCellKey('x:1:2')).toBeNull();
  });

  it('a painted cell takes its soil in bits 0-4 only; the other bits and the other cells are the disc\'s', () => {
    const sub = ai.maps[0]!;
    const i = aiCellIndex(sub, 4, 5);
    const before = sub.cells[i]!;
    const painted = withAiSoil(ai, new Map([[aiCellKey({ map: 0, x: 4, z: 5 }), 0]]));
    expect(aiSoilAt(painted, { map: 0, x: 4, z: 5 })).toBe(0);
    expect(painted.maps[0]!.cells[i]! & ~0x1f).toBe(before & ~0x1f);
    expect(aiSoilAt(painted, { map: 0, x: 5, z: 5 })).toBe(FLOOR_AI_SOIL);
    // The disc's grid untouched.
    expect(sub.cells[i]).toBe(before);
    expect(aiSoilAt(ai, { map: 0, x: 4, z: 5 })).toBe(FLOOR_AI_SOIL);
  });

  it('none painted, or a key of no stored cell: the grid itself', () => {
    expect(withAiSoil(ai, new Map())).toBe(ai);
    expect(withAiSoil(ai, new Map([['5:0:0', 1], ['0:99:99', 1]]))).toBe(ai);
  });

  it('the brush: the stored cells of the square about the cell, clipped at the grid\'s edge', () => {
    expect(aiBrushCells(ai, { map: 0, x: 5, z: 5 }, 1)).toEqual([{ map: 0, x: 5, z: 5 }]);
    expect(aiBrushCells(ai, { map: 0, x: 5, z: 5 }, 3)).toHaveLength(9);
    expect(aiBrushCells(ai, { map: 0, x: 0, z: 0 }, 3)).toHaveLength(4);
  });

  it('each tab paints soils of its own kind, the first its click\'s', () => {
    for (const k of AI_PAINT_KINDS) {
      expect(k.soils.length).toBeGreaterThan(0);
      for (const s of k.soils) expect(aiSoilKind(s)).toBe(k.kind);
    }
  });
});
