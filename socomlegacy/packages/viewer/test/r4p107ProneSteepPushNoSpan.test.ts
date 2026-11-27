// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';

/**
 * R4P-107 review F2 (re-review N3): r0004 returns before BOTH push blocks when the extent read fails (r4 0x554204), so a
 * prone body whose floor has no extent (`slideSpanOf` null) is NOT pushed. The extent is forced to fail here (a mock:
 * a real face whose column misses its edges is degenerate geometry); its own file, since the mock is file-wide.
 */
vi.mock('../src/steepSlide', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/steepSlide')>();
  return { ...real, slideSpanOf: () => null };
});
const { groundGrid, packGround, probeLiftOf, Walker } = await import('../src/mover');

describe('R4P-107 F2: no push when the extent read fails', () => {
  it('a prone body on a steep band with no extent is not pushed (only the slide\'s own step)', () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const quad = (path: string, x0: number, y0: number, x1: number, y1: number): WorldPoly => ({
      modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([x0, y0, -1000, x1, y1, -1000, x1, y1, 1000, x0, y0, 1000]),
    });
    const polys = [quad('worldmodel/low', -1000, 0, -1, 0), quad('worldmodel/face', -1, 0, 4, 20), quad('worldmodel/top', 4, 20, 1000, 20)];
    const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: polys.length }];
    const w = new Walker(groundGrid(packGround(params, polys, owners)));
    expect(w.place(0, 4 + probeLiftOf('prone'), 0)).toBe(true);
    w.stance = 'prone';
    w.state.yaw = 90;
    w.tick({ forward: 0, right: 0, boost: false });
    expect(Math.abs(w.state.x)).toBeLessThan(1);                       // with an extent this tick pushes 5.27
  });
});
