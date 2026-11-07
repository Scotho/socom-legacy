import { describe, expect, it } from 'vitest';
import type { AiLoc } from '@s2u/scene';
import { planFixtureLeaderRoute, type LeaderRouteMap } from './helpers/hostageLeaderRoute';

describe('hostage traversal fixture leader itinerary (test adaptation)', () => {
  const start = { map: 0, x: 0, z: 0 }, goal = { map: 0, x: 40, z: 0 };
  const traversable = (p: AiLoc) => p.map === 0 && p.x >= 0 && p.x <= 40 && p.z >= 0 && p.z <= 4
    && (p.x !== 20 || p.z === 4);
  const map: LeaderRouteMap = { traversable,
    canTravel: (a, b) => {
      const steps = Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
      for (let i = 0; i <= steps; i++) if (!traversable({ map: a.map,
        x: Math.round(a.x + (b.x - a.x) * i / (steps || 1)), z: Math.round(a.z + (b.z - a.z) * i / (steps || 1)) })) return false;
      return true;
    },
  };

  it('builds a bounded route around an obstruction, with every returned leg navigable', () => {
    const route = planFixtureLeaderRoute(map, start, goal, 1000);
    expect(route).not.toBeNull();
    expect(route![0]).toEqual(start);
    expect(route!.at(-1)).toEqual(goal);
    for (let i = 1; i < route!.length; i++) expect(map.canTravel(route![i - 1]!, route![i]!)).toBe(true);
    expect(route!.some(p => p.z === 4)).toBe(true);
  });

  it('refuses exhausted work budget, blocked endpoints and unsupported cross-submap fallback', () => {
    expect(planFixtureLeaderRoute(map, start, goal, 3)).toBeNull();
    expect(planFixtureLeaderRoute(map, start, { map: 0, x: 20, z: 0 }, 1000)).toBeNull();
    expect(planFixtureLeaderRoute(map, start, { ...goal, map: 1 }, 1000)).toBeNull();
  });
});
