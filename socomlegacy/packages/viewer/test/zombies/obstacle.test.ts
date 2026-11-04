import { expect, it } from 'vitest';
import { buildGrid, type WorldPoly } from '@s2u/scene';
import { Walker } from '../../src/mover';
import { botTraversal, planObstacle } from '../../src/zombies/obstacle';
import { Traversal } from '../../src/traversal';

function obstacle(height: number, app: number): Walker {
  const quad = (points: number[], ditype: number, appflags = 0): WorldPoly => ({
    modelName: 'worldmodel', path: 'worldmodel/test', region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags,
    points: Float32Array.from(points),
  });
  const polys = [
    quad([-100, 0, -100, 100, 0, -100, 100, 0, 100, -100, 0, 100], 3),
    quad([-30, 0, 0, 30, 0, 0, 30, height, 0, -30, height, 0], 2, app),
    quad([-30, height, 0, 30, height, 0, 30, height, -8, -30, height, -8], 3),
    quad([30, 0, -8, -30, 0, -8, -30, height, -8, 30, height, -8], 2, app),
  ];
  const grid = buildGrid(
    { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [], [], polys, polys.map((p, i) => ({ modelName: p.modelName, path: p.path + i, first: i, count: 1 })),
  );
  const w = new Walker(grid);
  w.place(0, 5, 20);
  w.driver = botTraversal(grid, null);
  return w;
}

for (const [name, height, app] of [['climb', 24, 4], ['jump', 10, 0]] as const) it(`executes a ${name} using the player mover without teleporting`, () => {
  const w = obstacle(height, app);
  const plan = planObstacle(w, [0, 0, -40], null);
  expect(plan).not.toBeNull();
  let raised = false;
  const moves = w.driver as Traversal;
  for (let i = 0; i < plan!.duration; i++) { w.tick(plan!.input(w, moves)); raised ||= w.state.y > 6; }
  expect(raised).toBe(true);
  expect(w.state.z).toBeLessThan(-10);
  expect(w.airborne).toBe(false);
});

it('rejects a wall too high for the player movement', () => {
  expect(planObstacle(obstacle(150, 0), [0, 0, -40], null)).toBeNull();
});
