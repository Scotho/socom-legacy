import { describe, expect, it, vi } from 'vitest';
import { smoothRoute } from '../src/bots/routeSmoothing';
import type { Point } from '../src/bots/navigation';

describe('bounded authored route smoothing', () => {
  it.each([true, false])('checks one nearer candidate when the chosen point exceeds the budget (clear: %s)', (clear) => {
    const route: Point[] = [[0, 0, 0], [60, 0, 0], [120, 0, 0]];
    const original = structuredClone(route), canWalk = vi.fn(() => clear);
    smoothRoute({ canWalk }, [0, 0, 0], route, 2);
    expect(canWalk).toHaveBeenCalledExactlyOnceWith([0, 0, 0], [60, 0, 0]);
    expect(route).toEqual(clear ? [[60, 0, 0], [120, 0, 0]] : original);
  });
  it('defers a distant shortcut while the actor follows the existing route toward it', () => {
    const route: Point[] = [[100, 0, 0], [110, 0, 0], [120, 0, 0]];
    const canWalk = vi.fn(() => true);
    smoothRoute({ canWalk }, [0, 0, 0], route, 2);
    expect(canWalk).not.toHaveBeenCalled();
    expect(route).toHaveLength(3);
    smoothRoute({ canWalk }, [90, 0, 0], route, 2);
    expect(canWalk).toHaveBeenCalledTimes(1);
    expect(route).toEqual([[120, 0, 0]]);
  });
  it('checks only one candidate per decision and retains the route when the shortcut is blocked', () => {
    const route: Point[] = Array.from({ length: 8 }, (_, i) => [i * 10, 0, 0]);
    const original = structuredClone(route), canWalk = vi.fn(() => false);
    smoothRoute({ canWalk }, [0, 0, 0], route, 6);
    expect(canWalk).toHaveBeenCalledTimes(1);
    expect(route).toEqual(original);
  });
  it('advances only to the candidate whose whole leg was checked from actual feet', () => {
    const route: Point[] = Array.from({ length: 8 }, (_, i) => [i * 10, 0, 0]);
    const from: Point = [-7, 0, -9], canWalk = vi.fn((_a: Point, b: Point) => b[0] === 20);
    smoothRoute({ canWalk }, from, route, 6);
    expect(route[0]).toEqual([0, 0, 0]);
    smoothRoute({ canWalk }, from, route, 2);
    expect(canWalk).toHaveBeenLastCalledWith(from, [20, 0, 0]);
    expect(route[0]).toEqual([20, 0, 0]);
  });
});
