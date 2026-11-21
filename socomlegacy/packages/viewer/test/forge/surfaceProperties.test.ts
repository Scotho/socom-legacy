import { describe, expect, it } from 'vitest';
import { packCollision, type Surface } from '../../src/forge/geometry/collision';
import { readByCamera, surfaceFieldsOf, withCollisionType, withSurfaceChange } from '../../src/forge/geometry/hullGeometry';
import { hullKeyOf, hullViewBuffers, materialName, reverbZoneNote } from '../../src/forge/hull';
import { groundPolygons } from '../../src/mover';

/**
 * The Collision layer's Surface properties (the owner, 2026-11-20; a browser adaptation, FG.R2): a face's material,
 * indoors (`m_inside`, the flags word's bit 3 as the hull carries it), reverb zone (bit 4), camera pass-through
 * (`m_cameratype` bit 1) and region read and set with every other word kept, the walk's hull carrying them, and the
 * collision view's Colour by modes.
 */
const floor: Surface = [3, 7, 0, 0x5, 0x4];        // ground, STONE, a climb flag 4 to keep

describe('a face\'s surface properties', () => {
  it('reads each field off the words', () => {
    expect(surfaceFieldsOf(floor)).toEqual({ material: 7, inside: false, reverbZone: 0, cameraThrough: false, region: 5 });
    expect(surfaceFieldsOf([3, 0, 2, 0xffffffff, 0x18])).toEqual({ material: 0, inside: true, reverbZone: 1, cameraThrough: true, region: 0xffffffff });
  });

  it('sets one field, every other word and bit kept', () => {
    expect(withSurfaceChange(floor, { inside: true })).toEqual([3, 7, 0, 5, 0xc]);
    expect(withSurfaceChange(floor, { reverbZone: 1 })).toEqual([3, 7, 0, 5, 0x14]);
    expect(withSurfaceChange([3, 7, 0, 5, 0x1c], { inside: false, reverbZone: 0 })).toEqual([3, 7, 0, 5, 0x4]);
    expect(withSurfaceChange(floor, { material: 23 })).toEqual([3, 23, 0, 5, 0x4]);
    expect(withSurfaceChange([2, 7, 1, 5, 0], { cameraThrough: true }), 'pass-through kept').toEqual([2, 7, 3, 5, 0]);
    expect(withSurfaceChange([2, 7, 3, 5, 0], { cameraThrough: false })).toEqual([2, 7, 1, 5, 0]);
    expect(withSurfaceChange(floor, { region: 0x80000001 })).toEqual([3, 7, 0, 0x80000001, 0x4]);
    expect(withSurfaceChange(floor, {})).toEqual(floor);
  });

  it('the collision type keeps them, as they keep the type', () => {
    const set = withSurfaceChange(floor, { inside: true, reverbZone: 1, material: 9, cameraThrough: true });
    const wall = withCollisionType(set, 'wall');
    expect(surfaceFieldsOf(wall)).toEqual(surfaceFieldsOf(set));
    expect(wall[0]).toBe(2);
  });

  it("the panel's Collision: the type (and a climbable's flag) as the tabs set it, the rest kept", () => {
    const set = withSurfaceChange(floor, { inside: true, material: 9 });
    expect(withSurfaceChange(set, { type: 'wall' })).toEqual(withCollisionType(set, 'wall'));
    expect(withSurfaceChange(set, { type: 'climbable', climb: 2 })).toEqual(withCollisionType(set, 'climbable', 2));
    expect(surfaceFieldsOf(withSurfaceChange(set, { type: 'passthrough' }))).toEqual(surfaceFieldsOf(set));
  });

  it('only a floor the camera stands over has its indoors, zone and region read', () => {
    expect(readByCamera([3, 0, 0, 0, 0])).toBe(true);
    expect(readByCamera([2, 0, 0, 0, 0]), 'a wall').toBe(false);
    expect(readByCamera([3, 0, 1, 0, 0]), 'a pass-through floor').toBe(false);
    expect(readByCamera([3, 0, 2, 0, 0]), 'the camera passing through it is still stood over').toBe(true);
  });

  it('the walk\'s hull carries indoors and the zone into its polygons', () => {
    const poly = (surface: Surface) => ({ points: [[0, 0, 0], [1, 0, 0], [1, 0, 1]] as [number, number, number][], surface, owner: -1 });
    const ground = packCollision({ grid: { originX: 0, originZ: 0, cellsX: 1, cellsZ: 1, cellSize: 100 } as never, owners: [], polys: [
      poly(withSurfaceChange(floor, { inside: true, reverbZone: 1 })), poly(floor),
    ] });
    const back = groundPolygons(ground);
    expect(back.map((p) => [p.inside, p.reverbZone, p.material, p.region])).toEqual([[1, 1, 7, 5], [0, 0, 7, 5]]);
  });
});

describe('the collision view\'s Colour by', () => {
  const p = (ditype: number, cameratype: number, more: object = {}) => ({ ditype, cameratype, ...more });
  it('Type: as before', () => {
    expect(hullKeyOf(p(3, 0)).key).toBe('floor');
    expect(hullKeyOf(p(2, 1)).key).toBe('skip');
    expect(hullKeyOf(p(2, 1)).faint).toBe(true);
  });
  it('Area and Reverb zone: floors by their bits (the zone one colour a zone), the rest not read (grey, faint)', () => {
    expect(hullKeyOf(p(3, 0, { inside: 1 }), 'indoors').key).toBe('in');
    expect(hullKeyOf(p(3, 0), 'indoors').key).toBe('out');
    const wall = hullKeyOf(p(2, 0, { inside: 1 }), 'indoors');
    expect([wall.key, wall.faint]).toEqual(['unread', true]);
    expect(hullKeyOf(p(3, 1), 'reverb').key).toBe('unread');
    expect(hullKeyOf(p(3, 0, { inside: 1, reverbZone: 1 }), 'reverb').key).toBe('z1');
    expect(hullKeyOf(p(3, 0, { reverbZone: 1 }), 'reverb').key).toBe('z1');
    expect(hullKeyOf(p(3, 0), 'reverb').key).toBe('z0');
  });
  it('Camera: side surfaces by the camera bit; a floor-only polygon not read', () => {
    expect(hullKeyOf(p(2, 0), 'camera').key).toBe('cam-block');
    expect(hullKeyOf(p(3, 2), 'camera').key).toBe('cam-through');
    expect(hullKeyOf(p(2, 1), 'camera').key, 'a pass-through still meets the camera').toBe('cam-block');
    expect(hullKeyOf(p(1, 0), 'camera').key).toBe('unread');
  });
  it('Material: each index its own colour, a pass-through not read', () => {
    const a = hullKeyOf(p(2, 0, { material: 7 }), 'material'), b = hullKeyOf(p(2, 0, { material: 8 }), 'material');
    expect([a.key, b.key]).toEqual(['m7', 'm8']);
    expect(a.colour === b.colour, 'two colours').toBe(false);
    expect(hullKeyOf(p(2, 1, { material: 7 }), 'material').key).toBe('unread');
  });
  it('the counts are the Colour by\'s keys', () => {
    const tri = [0, 0, 0, 1, 0, 0, 1, 0, 1];
    const b = hullViewBuffers([{ points: tri, ...p(3, 0, { inside: 1 }) }, { points: tri, ...p(3, 0) }, { points: tri, ...p(2, 0) }], 'indoors');
    expect(Object.fromEntries(b.counts)).toEqual({ in: 1, out: 1, unread: 1 });
    expect(b.faint.positions.length).toBe(9);
  });
  it('the names: material 0 the map\'s default, a zone its depth or no entry', () => {
    expect(materialName(0, 'SAND')).toBe('Map default (SAND)');
    expect(materialName(7)).toBe('STONE');
    expect(materialName(200)).toBe('UNKNOWN (200)');
    expect(reverbZoneNote({ indoor: [[0.45, 1]], outdoor: [] }, true, 0)).toBe('depth 0.45, eases in over 1 s');
    expect(reverbZoneNote({ indoor: [[0.45, 1]], outdoor: [] }, false, 0)).toMatch(/no entry/);
  });
});
