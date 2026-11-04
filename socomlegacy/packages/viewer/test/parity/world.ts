import { expect } from 'vitest';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker } from '../../src/mover';
import { Traversal } from '../../src/traversal';
import { MoverSim } from '../../src/net/moverSim';
// Synthetic geometry for research 230's source-contract probes; no original-runtime measurements.
export const still = { forward: 0, right: 0, boost: false };
export function poly(name: string, points: number[], ditype = 3): WorldPoly {
    return { modelName: name, path: name, region: 0, ditype, material: 25, ptcount: points.length / 3,
        cameratype: 0, points: Float32Array.from(points) };
}
export function floor(y = 0): WorldPoly {
    return poly('floor', [-500, y, -500, 500, y, -500, 500, y, 500, -500, y, 500]);
}
export function scene(polys: WorldPoly[]) {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 4, cellsZ: 4, originX: -1000, originZ: -1000 };
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: p.path, first: i, count: 1, flags: 0x1001 }));
    const grid = buildGrid(params, [], [], polys, owners);
    const walker = new Walker(grid), moves = new Traversal(grid, polys), sim = new MoverSim(walker, moves);
    return { grid, owners, walker, moves, sim };
}
export function flat(extra: WorldPoly[] = []) {
    const s = scene([floor(), ...extra]);
    expect(s.walker.place(0, 0, 0)).toBe(true);
    s.walker.state.yaw = -90;
    return s;
}
