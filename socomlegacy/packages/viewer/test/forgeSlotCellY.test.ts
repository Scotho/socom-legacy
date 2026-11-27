import { describe, expect, it } from 'vitest';
import { withMovedData } from '../src/forge/mapDataMove';

/**
 * L208 (the second delta review's F3; LATER 1419): a spawn slot read from AIMAPS carries its cell's y (`SpawnSlot.cellY`)
 * and the room seeds at it + 1. A copy that takes a NEW position is no longer over that cell, so it drops `cellY` and seeds
 * at its own y + 1, as every Forge slot does -- else a slot moved up a storey would seed at the old cell's y + 1 under the
 * new x/z. A product-track adaptation (the Forge has no original).
 */
describe('L208: a moved Forge slot drops its source cell y', () => {
  it('withMovedData: the moved slot has no cellY; an unmoved one keeps it', () => {
    const slot = (index: number) => ({ side: 0, index, position: [10, 5, 10] as number[], cellY: 4 as number | null });
    const map = { slots: [slot(0), slot(1)] };
    const out = withMovedData(map, { 'slot:A1': { at: [50, 80, 50] } } as never);
    expect(out.slots![0]!.position).toEqual([50, 80, 50]);
    expect('cellY' in out.slots![0]! ? (out.slots![0] as { cellY?: unknown }).cellY : undefined, 'moved: dropped').toBeUndefined();
    expect((out.slots![1] as { cellY?: unknown }).cellY, 'unmoved: kept').toBe(4);
  });
});
