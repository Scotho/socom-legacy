import { describe, expect, it } from 'vitest';
import type { SpawnSlot } from '@s2u/scene';
import { freeWalkSpawn } from '../src/matchCore';

/**
 * FP.R13 item 5 (a browser adaptation, product track): the test room's free walk (`&nomatch`) on an authored content map
 * stands the player at the map's first side-0 on-floor slot, where the measured spawn table (`standOf`) has no row. A
 * disc map's walk spawn is `standOf`'s feet, unchanged.
 */

const slot = (side: 0 | 1, index: number, position: [number, number, number], onFloor = true): SpawnSlot =>
  ({ side, index, position, onFloor, step: 0, facing: [0, -1], loc: { map: 0, x: 0, z: 0 } });

const yard: SpawnSlot[] = [slot(1, 0, [90, 0, 60]), slot(0, 0, [-90, 0, 60])];

describe('freeWalkSpawn: where the free walk stands the player on a map', () => {
  it('an authored map with no measured stand: its first side-0 on-floor slot (the Sample Yard: (-90, 0, 60))', () => {
    expect(freeWalkSpawn(null, yard, true)).toEqual([-90, 0, 60]);
  });
  it('skips a side-0 slot off the floor for the next side-0 slot on it', () => {
    expect(freeWalkSpawn(null, [slot(0, 0, [1, 2, 3], false), slot(0, 1, [4, 0, 6])], true)).toEqual([4, 0, 6]);
  });
  it('no side-0 slot on the floor: the first slot of any side on the floor', () => {
    expect(freeWalkSpawn(null, [slot(0, 0, [1, 2, 3], false), slot(1, 0, [90, 0, 60])], true)).toEqual([90, 0, 60]);
  });
  it('no slot on the floor, or none at all: null (the walk stays as it is today)', () => {
    expect(freeWalkSpawn(null, [slot(0, 0, [1, 2, 3], false)], true)).toBeNull();
    expect(freeWalkSpawn(null, [], true)).toBeNull();
    expect(freeWalkSpawn(null, undefined, true)).toBeNull();
  });
  it('returns a copy, never the slot\'s own array', () => {
    const s = freeWalkSpawn(null, yard, true);
    expect(s).not.toBe(yard[1]!.position);
  });
  it('a disc map: exactly today\'s value -- the stand\'s feet (the same array) or null, the slots never read', () => {
    const feet: [number, number, number] = [796, 101, 614];
    expect(freeWalkSpawn(feet, yard, false)).toBe(feet);
    expect(freeWalkSpawn(null, yard, false)).toBeNull();
  });
  it('an authored map that has a measured stand keeps it (the slots are read only where the feet are null)', () => {
    const feet: [number, number, number] = [1, 2, 3];
    expect(freeWalkSpawn(feet, yard, true)).toBe(feet);
  });
});
