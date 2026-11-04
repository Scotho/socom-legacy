import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { groundGrid, packGround } from '../../src/mover';
import type { MapMeta } from '../../src/mapMeta';
import { WorldState } from '../../src/worldState';

/**
 * MAP-03's page-side tests: a synthetic hull with no game data -- a floor, a wall across x 10 (`worldmodel/wall`,
 * instance 1) and a crate beside it (`worldmodel/crate`, instance 2, made inactive at the map's opening by a bit-31
 * reference, as Crossroads' `destroyed` is: research 171 s4) -- and the page's `WorldState` on it, `applyInitial` run.
 * The owners carry the disc's flag word for a node with polygons (`m_active` and `m_hasDI`, research 23 s1.1).
 */

export const WALL = 'worldmodel/wall', CRATE = 'worldmodel/crate';
/** The instance ids (`flattenScene` order, ruling PF.R15). */
export const WALL_ID = 1, CRATE_ID = 2;

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const poly = (path: string, ditype: number, points: number[]): WorldPoly => ({
  modelName: 'worldmodel', path, region: 0, ditype, material: 25, ptcount: points.length / 3, cameratype: 0, points: Float32Array.from(points),
});

export function wallWorld(): { world: WorldState; visible: [string, boolean][] } {
  const polys = [
    poly('worldmodel/floor', 3, [-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
    poly(WALL, 2, [10, 0, -100, 10, 0, 100, 10, 50, 100, 10, 50, -100]),
    poly(CRATE, 2, [-40, 0, -100, -40, 0, 100, -40, 50, 100, -40, 50, -100]),
  ];
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: 'worldmodel', path: p.path, first: i, count: 1, flags: 0x1001 }));
  const ground = packGround(params, polys, owners);
  const paths = ['worldmodel/floor', WALL, CRATE];
  const instances = paths.map((path, id) => ({ id, path, node: path.split('/').pop()!, modelName: 'worldmodel', root: path }));
  const meta: MapMeta = {
    stem: 'SYN', actions: [], instances, instanceByPath: new Map(instances.map((i) => [i.path, i.id])), diagnostics: [],
    initial: [{ path: CRATE, deactivate: true, saveActive: true, saveTransform: false, saveParent: false }],
  };
  const visible: [string, boolean][] = [];
  const world = new WorldState(meta, ground, groundGrid(ground), { visible: (path, on) => { visible.push([path, on]); } });
  world.applyInitial();
  visible.length = 0;
  return { world, visible };
}
