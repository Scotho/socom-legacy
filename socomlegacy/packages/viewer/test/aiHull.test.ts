import { describe, expect, it } from 'vitest';
import { buildGrid, type GridParams, type WorldPoly } from '@s2u/scene';
import { Walker } from '../src/mover';
const poly = (path: string, points: number[]): WorldPoly => ({ modelName: 'worldmodel', path, region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0, appflags: 0, points: Float32Array.from(points) });
function world(left: number, duplicateMaterial?: number) {
  const polys = [poly('floor', [-100,0,-100,100,0,-100,100,0,100,-100,0,100]),
    poly('open-leaf', [left,0,0,10,0,0,10,20,0,left,20,0])];
  if (duplicateMaterial !== undefined) polys.push({ ...polys[1]!, path: 'coincident-material', material: duplicateMaterial });
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  return buildGrid(params, [], [], polys, polys.map((p,i) => ({ modelName: p.modelName, path:p.path, first:i, count:1 })));
}
describe('original AI centerline hull (research334)', () => {
  it('uses facing for a near-zero side command rather than normalizing that tiny displacement', () => {
    const ai = new Walker(world(-10)); ai.place(0,0,4.8); ai.state.yaw = 0;
    ai.glideAi(.0001,0);
    expect(ai.wallHits()).toHaveLength(1);
    expect(ai.state.x).toBeCloseTo(.0001);
  });
  it('takes the last equally near hit before rejecting volumetric material', () => {
    const ai = new Walker(world(-10, 1)); ai.place(0,0,5);
    ai.glideAi(0,-1);
    expect(ai.state.z).toBe(4); expect(ai.wallHits()).toHaveLength(0);
  });
  it('passes beside an open leaf endpoint that the player disc cannot pass', () => {
    const grid = world(.8), ai = new Walker(grid), player = new Walker(grid);
    ai.place(0,0,8); player.place(0,0,8);
    ai.glideAi(0,-10); player.glide(0,-10);
    expect(ai.state.z).toBe(-2); expect(ai.wallHits()).toHaveLength(0);
    expect(player.state.z).toBeGreaterThan(0);
  });
  it('projects movement off a wall intersecting the original 4.9-unit lookahead', () => {
    const ai = new Walker(world(-10)); ai.place(0,0,5);
    ai.glideAi(0,-1);
    expect(ai.state.z).toBe(5);
    expect(ai.wallHits()).toHaveLength(1);
    expect(ai.wallHits()[0]?.z).toBeCloseTo(0);
  });
});
