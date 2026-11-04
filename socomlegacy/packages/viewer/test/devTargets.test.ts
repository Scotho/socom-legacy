import { describe, expect, it } from 'vitest';
import { boundsOf, devPlaces, heightNear, minimapFrame, minimapHit, nearestFloor, planPointPlace, slotYaw } from '../src/devTargets';

const dev = { toggle: true };

describe('places the panel can stand at', () => {
  it('lists the measured spawns, slots, hostages, extraction and the bomb, and no other objective', () => {
    const places = devPlaces({
      spawns: { a: [1, 2, 3], b: [4, 5, 6] },
      slots: [{ side: 0, index: 0, position: [10, 11, 12], facing: [0, -1] }, { side: 1, index: 2, position: [20, 21, 22], facing: [1, 0] }],
      escortees: [{ name: 'mp_fem1', at: [30, 31, 32], yaw: 45 }],
      extraction: [[40, 41, 42]],
      bomb: [50, 51, 52],
    });
    expect(places.map((p) => p.label)).toEqual(['Spawn A', 'Spawn B', 'A slot 1', 'B slot 3', 'Hostage mp_fem1', 'Extraction 1', 'Bomb']);
    expect(places[2]!.yaw).toBeCloseTo(0);
    expect(places[3]!.yaw).toBeCloseTo(90);
    expect(places[0]!.yaw).toBeNull();
    expect(places[4]!.yaw).toBe(45);
  });

  it('a slot facing is the step angle, and a bad point is left out', () => {
    expect(slotYaw([0, -1])).toBeCloseTo(0);
    expect(slotYaw([1, 0])).toBeCloseTo(90);
    expect(devPlaces({ spawns: null, slots: [], escortees: [], extraction: [], bomb: null })).toEqual([]);
    expect(devPlaces({ spawns: { a: [1, Number.NaN, 3], b: [4, 5, 6] }, slots: [], escortees: [], extraction: [], bomb: null })).toHaveLength(1);
  });

  it('stands in the walk when that is allowed, and moves the camera in Explore', () => {
    expect(planPointPlace('walk', true, dev)).toBe('walk');
    expect(planPointPlace('fly', true, dev)).toBe('walk');
    expect(planPointPlace('fly', false, dev)).toBe('camera');
  });
});

describe('the minimap', () => {
  const bounds = { minX: 0, maxX: 100, minZ: 0, maxZ: 50 };
  it('maps a click with the top of the frame at max z, and keeps one scale', () => {
    expect(minimapHit(bounds, 0, 0, 200, 100)).toEqual({ x: 0, z: 50 });
    expect(minimapHit(bounds, 200, 100, 200, 100)).toEqual({ x: 100, z: 0 });
    expect(minimapHit(bounds, 100, 50, 200, 100)).toEqual({ x: 50, z: 25 });
    expect(minimapHit(bounds, -1, 0, 200, 100)).toBeNull();
    expect(minimapHit(bounds, Number.NaN, 0, 200, 100)).toBeNull();
    const frame = minimapFrame(bounds, 100, 100)!;
    expect(frame.w / (bounds.maxX - bounds.minX)).toBeCloseTo(frame.h / (bounds.maxZ - bounds.minZ));
    expect(minimapHit(bounds, 0, 0, 100, 100)).toBeNull();
    expect(minimapHit(bounds, frame.x, frame.y, 100, 100)).toEqual({ x: 0, z: 50 });
    expect(minimapHit(bounds, frame.x + frame.w, frame.y + frame.h, 100, 100)).toEqual({ x: 100, z: 0 });
    const tall = { minX: 0, maxX: 50, minZ: 0, maxZ: 200 };
    const side = minimapFrame(tall, 288, 140)!;
    expect(side.x).toBeGreaterThan(0);
    expect(side.h).toBeCloseTo(140);
    expect(side.w / 50).toBeCloseTo(side.h / 200);
    expect(minimapHit(tall, 0, 0, 288, 140)).toBeNull();
    expect(minimapHit(tall, side.x, 0, 288, 140)).toEqual({ x: 0, z: 200 });
  });

  it('stands on the floor nearest the player, and on the highest when the height is not a number', () => {
    expect(nearestFloor([], -46)).toBeNull();
    expect(nearestFloor([Number.NaN], -46)).toBeNull();
    expect(nearestFloor([48, 178], -46)).toBe(48);
    expect(nearestFloor([48, 178], 160)).toBe(178);
    expect(nearestFloor([48, 178], 113)).toBe(178);
    expect(nearestFloor([48, 178], Number.NaN)).toBe(178);
  });

  it('pads the extent, and takes the nearest place\'s height', () => {
    const box = boundsOf([[0, 5, 0], [100, 9, 50]]);
    expect(box!.minX).toBeLessThan(0);
    expect(box!.maxZ).toBeGreaterThan(50);
    expect(boundsOf([])).toBeNull();
    expect(heightNear([[0, 5, 0], [10, 9, 0]], 9, 0, 1)).toBe(9);
    expect(heightNear([], 0, 0, 4)).toBe(4);
  });
});
