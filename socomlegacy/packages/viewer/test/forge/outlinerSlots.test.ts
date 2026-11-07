import { describe, expect, it } from 'vitest';
import { facingVector, type SpawnSlot } from '@s2u/scene';
import { spawnSlotRows } from '../../src/forge/panels/outlinerPanel';

/**
 * The Outliner's Spawn Slots branch (a browser adaptation, FG.R2): the disc's spawn slots (`AIMAPS.MPS`, research 75 §5.5;
 * `LoadedMap.slots`), read only -- a row each, side A's then side B's in the file's order, named by side and place.
 */
const slot = (side: 0 | 1, index: number, x: number, y: number, z: number, step: number, onFloor = true): SpawnSlot => ({
  side, index, position: [x, y, z], onFloor, step, facing: facingVector(step), loc: { map: 0, x: 0, z: 0 },
});

describe('spawnSlotRows', () => {
  it('lists side A then side B, each by its place from 1, with its place in the world and its facing', () => {
    const rows = spawnSlotRows([slot(1, 0, 10, 2, 30, 4), slot(0, 1, -5.6, 0, 7.25, 2), slot(0, 0, 1, 100, 2, 0, false)]);
    expect(rows.map((r) => r.label)).toEqual(['Slot A1', 'Slot A2', 'Slot B1']);
    expect(rows.map((r) => r.key)).toEqual(['A1', 'A2', 'B1']);
    expect(rows[0]!.at).toEqual([1, 100, 2]);
    expect(rows[1]!.detail).toBe('-6, 0, 7 · 90°');
    expect(rows[2]!.detail).toBe('10, 2, 30 · 180°');
    expect(rows[0]!.title).toMatch(/cell's own height/);
    expect(rows[1]!.title).toMatch(/on the floor/);
  });

  it('none: no rows', () => {
    expect(spawnSlotRows([])).toEqual([]);
  });
});
