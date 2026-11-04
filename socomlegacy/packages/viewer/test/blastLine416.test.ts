import { describe, expect, it } from 'vitest';
import { buildGrid, type CollisionOwner, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { blastSeen } from '../src/net/blast';
import { blastLine } from '../src/sceneHealth';

/**
 * LATER 416 (LATER 413's review, finding 2; research 84 section 13): a blast's rays -- the line to a body's head
 * (`FUN_005ac070` D:L464853) and the line to a destructible (`FUN_003c80e0` via `FUN_003c7ee0` D:L319056) -- queue
 * through the same `FUN_0031dd90` as a round's segment, so the batch's query class (`FUN_002d3030` at class 0) admits
 * them as it admits the round (`../src/round` `roundAdmits`: the surface word's side bit, `SURFACE_SIDE`, and not the
 * camera-only bit 18): a camera-only pane is passed; a solid wall still stops the line.
 */

const quad = (pts: number[], ditype: number, cameratype: number, path: string): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: 4, cameratype, appflags: 0, points: Float32Array.from(pts),
});
/** A vertical pane across x at `z`, x -50..50, y 0..60. */
const pane = (z: number, ditype: number, cameratype: number, path: string): WorldPoly =>
  quad([-50, 0, z, 50, 0, z, 50, 60, z, -50, 60, z], ditype, cameratype, path);
function world(polys: WorldPoly[]): Grid {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return buildGrid(params, [], [], polys, owners);
}

const FROM: [number, number, number] = [0, 20, 40], TO: [number, number, number] = [0, 20, -40];

describe("LATER 416: a blast's rays take the round's query class", () => {
  it('the line to a head passes a camera-only pane (cameratype 1) and is stopped by a wall', () => {
    expect(blastSeen(world([pane(0, 2, 1, 'worldmodel/camcol')]), FROM, TO)).toBe(true);
    expect(blastSeen(world([pane(0, 2, 0, 'worldmodel/wall')]), FROM, TO)).toBe(false);
    expect(blastSeen(world([]), FROM, TO)).toBe(true);
  });

  it("a destructible's reach line (blastLine) passes a camera-only pane a solid one of the same material would stop", () => {
    const stop = (): number => 0;                                   // a material no blast passes
    expect(blastLine(world([pane(0, 2, 1, 'worldmodel/camcol')]), FROM, TO, 'worldmodel/target', 300, stop)).toBe(true);
    expect(blastLine(world([pane(0, 2, 0, 'worldmodel/wall')]), FROM, TO, 'worldmodel/target', 300, stop)).toBe(false);
  });

  it('a face with the side bit clear (ditype 0) is passed by both; a bit-19-alone face (cameratype 2) is kept', () => {
    const stop = (): number => 0;
    expect(blastSeen(world([pane(0, 0, 0, 'worldmodel/flat')]), FROM, TO)).toBe(true);
    expect(blastLine(world([pane(0, 0, 0, 'worldmodel/flat')]), FROM, TO, 'worldmodel/target', 300, stop)).toBe(true);
    expect(blastSeen(world([pane(0, 2, 2, 'worldmodel/eyeonly')]), FROM, TO)).toBe(false);
    expect(blastLine(world([pane(0, 2, 2, 'worldmodel/eyeonly')]), FROM, TO, 'worldmodel/target', 300, stop)).toBe(false);
  });
});
