import { expect, it } from 'vitest';
import { buildGrid, type WorldPoly } from '@s2u/scene';
import { EnemyNavigator, RouteSearch, collisionStep, type NavPoint } from '../../src/zombies/navigation';
import { meleeClear } from '../../src/zombies/melee';
import { spawnCovered } from '../../src/zombies/spawns';

const poly = (points: number[], floor = false): WorldPoly => ({
  modelName: 'worldmodel', path: 'test', region: 0, ditype: floor ? 3 : 2, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from(points),
});
const floor = (x0 = -100, x1 = 100, y = 0) => poly([x0, y, -100, x1, y, -100, x1, y, 100, x0, y, 100], true);
const wall = (x: number, z0: number, z1: number, y0 = 0, y1 = 40) => poly([x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0]);
const world = (polys: WorldPoly[]) => buildGrid(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [], [], polys, polys.map((p, i) => ({ modelName: p.modelName, path: `test${i}`, first: i, count: 1 })),
);

it('finds an off-grid narrow doorway without cutting the jamb', () => {
  const grid = world([floor(), wall(0, -100, 5), wall(0, 19, 100)]), step = collisionStep(grid);
  expect(step([-40, 0, 0], 40, 0)).toBeNull();
  expect(step([-10, 0, 12], 10, 12)).not.toBeNull();
  const search = new RouteSearch([-40, 0, 0], [40, 0, 0], step, [], 4);
  while (!search.done) search.advance(100);
  expect(search.path).not.toBeNull();
  let prev: NavPoint = [-40, 0, 0];
  for (const p of search.path!) { expect(step(prev, p[0], p[2])).not.toBeNull(); prev = p; }
});

it('walks up and down small stair treads but rejects a tall wall or a floor gap', () => {
  const stairs = world([floor(-100, 0), floor(0, 8, 4), floor(8, 16, 8), floor(16, 100, 12)]), step = collisionStep(stairs);
  expect(step([-10, 0, 0], 30, 0)).toEqual([30, 12, 0]);
  expect(step([30, 12, 0], -10, 0)).toEqual([-10, 0, 0]);
  expect(collisionStep(world([floor(-100, 0), floor(0, 100, 30)]))([-10, 0, 0], 30, 0)).toBeNull();
  expect(collisionStep(world([floor(-100, -6), floor(6, 100)]))([-10, 0, 0], 10, 0)).toBeNull();
});

it('blocks melee through thin walls, low cover and a door-frame edge', () => {
  const a = [-5, 0, 0], b = [5, 0, 0];
  expect(meleeClear(world([floor()]), a, b)).toBe(true);
  for (const w of [wall(0, -10, 10), wall(0, -10, 10, 0, 6), wall(0, 2, 10)]) expect(meleeClear(world([floor(), w]), a, b)).toBe(false);
});

it('requires full-body cover from the actual third-person camera as well as the eyes', () => {
  const grid = world([floor(), wall(0, -30, 30)]), spawn: NavPoint = [30, 0, 0];
  expect(spawnCovered(grid, spawn, [[-30, 17, 0]])).toBe(true);
  expect(spawnCovered(grid, spawn, [[-30, 17, 0], [10, 17, 0]])).toBe(false);
  expect(spawnCovered(world([floor(), wall(0, -30, 30, 5, 40)]), spawn, [[-30, 2, 0]])).toBe(false);
});

it('does not treat crowd waiting as stuck and uses a physical recovery step for a stalled mover', () => {
  const step = (from: NavPoint, x: number, z: number): NavPoint => [x, from[1], z];
  const nav = new EnemyNavigator({} as never, step);
  nav.seed([[30, 0, 0]], [40, 0, 0]);
  for (let i = 0; i < 40; i++) nav.steer([0, 0, 0], [40, 0, 0], .05, true);
  expect(nav.stats().recoveries).toBe(0);
  for (let i = 0; i < 30; i++) nav.steer([0, 0, 0], [40, 0, 0], .05);
  expect(nav.stats().recoveries).toBeGreaterThan(0);
  expect(nav.stats().blocked).toBe(0);
});
