import { expect, it, vi } from 'vitest';
import { ZombieSpawnMap } from '../../src/zombies/spawns';
import type { NavPoint } from '../../src/zombies/navigation';

const cover = vi.hoisted(() => ({ blocked: true }));
vi.mock('@s2u/scene', async (original) => ({ ...(await original<typeof import('@s2u/scene')>()), segmentHit: () => cover.blocked ? { point: [0, 0, 0] } : null }));

const step = (from: NavPoint, x: number, z: number): NavPoint | null => Math.abs(x) > 600 || Math.abs(z) > 600 ? null : [x, from[1], z];

it('only chooses distant covered spawns, keeps them separated, and preserves a return path', () => {
  cover.blocked = true;
  const map = new ZombieSpawnMap({} as never, [0, 0, 0], step);
  while (!map.stats().complete) map.advance(10);
  const first = map.choose([0, 0, 0], [], () => 0)!;
  expect(first).not.toBeNull();
  expect(Math.hypot(first.point[0], first.point[2])).toBeGreaterThanOrEqual(300);
  expect(first.path.at(-1)).toEqual([0, 0, 0]);
  const second = map.choose([0, 0, 0], [first.point], () => 0)!;
  expect(Math.hypot(second.point[0] - first.point[0], second.point[2] - first.point[2])).toBeGreaterThanOrEqual(160);
  cover.blocked = false;
  expect(map.choose([0, 0, 0], [], () => 0)).toBeNull();
});

it('does not use an isolated floor or fall back to a point beside the player', () => {
  const map = new ZombieSpawnMap({} as never, [0, 0, 0], (from, x, z) => Math.abs(x) > 96 || Math.abs(z) > 96 ? null : [x, from[1], z]);
  while (!map.stats().complete) map.advance(10);
  expect(map.choose([0, 0, 0], [])).toBeNull();
});
