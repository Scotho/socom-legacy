import { describe, expect, it } from 'vitest';
import { buildGrid, type WorldPoly } from '@s2u/scene';
import { Walker } from '../src/mover';

// Regression values read from the unchanged full-scan solver at 826148b21. This pins implementation equivalence,
// not original-console parity. The two faces are closer than the body diameter: wall order is observable.
function run(order: number[]) {
  const polys: WorldPoly[] = order.map(x => ({ modelName: 'worldmodel', path: `wall-${x}`,
    region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([x, 0, -50, x, 0, 50, x, 80, 50, x, 80, -50]) }));
  const owners = polys.map((p, first) => ({ modelName: p.modelName, path: p.path, first, count: 1 }));
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], polys, owners);
  const walker = new Walker(grid);
  walker.state.y = 0; walker.state.vx = 2;
  const probe = walker as unknown as { slide(x: number, z: number, fromX: number, fromZ: number): [number, number] };
  const result = probe.slide(0.1, 0, -0.1, 0);
  return { result, vx: walker.state.vx, contacts: walker.wallHits().map(h => [h.poly.path, h.line, h.x, h.z]) };
}

describe('slide candidates after a wall changes the remaining path bounds', () => {
  it('visits a newly intersected later wall during the same pass', () => {
    // x=-5 lies outside the initial [-3.6,3.6] bounds. The x=0 push to -3.5 brings it into range.
    const r = run([0, -5]);
    expect(r.result).toEqual([-1.5, 0]);
    expect(r.vx).toBe(0);
    expect(r.contacts).toEqual(Array.from({ length: 4 }, () => [['wall-0', 0, 0, 0], ['wall--5', 0, -5, 0]]).flat());
  });

  it('defers a newly intersected earlier wall until the next pass', () => {
    const r = run([-5, 0]);
    expect(r.result).toEqual([-3.5, 0]);
    expect(r.vx).toBe(0);
    expect(r.contacts).toEqual([
      ['wall-0', 0, 0, 0],
      ...Array.from({ length: 3 }, () => [['wall--5', 0, -5, 0], ['wall-0', 0, 0, 0]]).flat(),
    ]);
  });
});
