import { flattenScene, worldDi, type PlacedModel, type SceneInstance } from './buildScene';
import type { WorldPoly } from './collision';
import { multiply, transformPoint, type SceneNode } from './sceneGraph';
import type { GridParams } from './worldRoot';

/**
 * The engine's grid, `zdb::CGrid`: the map cut into square cells on the ground plane, every object linked into
 * each cell its bounds cover, and a walk over the cells outward from the camera. The draw walks it
 * (`CPipe::RenderWorld`, `research/recom/src/gamez/zRender/zrndr_pipe.cpp:207`) and so does the ground probe
 * (research 23 section 1.1, 24 section 1.1). Nothing of it is on the disc but `grid_params` (`worldRoot.ts`):
 * the cells are generated at load (`CGrid::Create`, `zGrid/grid_main.cpp:35-147`; `socomlegacy/docs/research/72`
 * section 6).
 *
 * What the viewer links, and what it does not copy from the engine:
 *
 * - **Placements** (`placeInstances`): one object per drawn placement, filed by its node's bbox carried into the
 *   world by two corners (`worldFootprint`). The engine links nodes -- a world child (type 1) or a top-level
 *   instance (type 2), each with its whole subtree -- not each visual-bearing node (research 23 section 2.1).
 * - **Clutter** (`placeClutter`'s placements): one cell each, by position. The engine's clutter reader hands
 *   back the record's position and its caller takes `.x`/`.z` for the cell (`FUN_002d9490`, `sub_002D55C0`;
 *   `clutter.ts`), into the cell node's own clutter list (`CCell::m_clutterList`, `zGrid/zgrid.h:37`), drawn when
 *   the walk reaches the cell node (`zrndr_pipe.cpp:209-248`, `RenderClutter` at `:248`) -- so here it heads each
 *   cell's list.
 * - **Collision**: one object per *node that owns polygons*, its polygons in surface order, filed by their
 *   world-space extent. The engine reaches a polygon only through its model's atom and takes the first hit per
 *   model in surface order (research 23 section 1.1), so that is the unit; one atom per polygon would also spend
 *   more than the pool's 8,192 on 16 of the 22 maps, up to 24,514 on MP82 (counted 2026-09-28).
 *
 * The pool is not emulated: a grid never runs out, and `atomsSpent` says what it would have taken.
 */

/** A world-space rectangle on the ground plane: what the grid files an object by. */
export interface Footprint { minX: number; minZ: number; maxX: number; maxZ: number }

/** An inclusive range of cell coordinates, already clamped into the grid. */
export interface CellRange { x0: number; x1: number; z0: number; z1: number }

/**
 * The polygons of one realised node: `count` consecutive entries of the collision list from `first`. The
 * probe's unit (first hit per model, research 23 section 1.1) and the grid's collision object.
 */
export interface CollisionOwner {
  modelName: string; path: string; first: number; count: number;
  /**
   * The node's `tag_NODE_PARAMS` flag word, for the probe's per-model gate (`m_active`, `m_hasDI`,
   * `m_region_shift`; research 23 section 1.1, `probe.ts`). Absent where the owners were inferred without the
   * graph (`collisionRuns`), which the gate lets through.
   */
  flags?: number;
  /**
   * R4B-09 (research 383; fresh review 1's F1): the node was switched off when the graph was built -- r0004's
   * switch-off (node vtable +0x38, r4 0x1ec450) or one above it (`flattenScene`'s `flags`). The world's opening state and
   * its changes (`viewer/src/worldState.ts`) keep it off. Absent on every owner of the disc as read.
   */
  switchedOff?: true;
  /**
   * DOORS (`socomlegacy/docs/research/92-doors.md`): the ground-plane box a moving node's polygons can reach -- a door leaf's
   * whole swing. The grid links the owner into every cell it covers and keeps it as the object's footprint, so the
   * polygons can be turned in place (their points rewritten) without relinking; the mover re-reads such an owner's
   * walls every step rather than caching them. Absent on every static node.
   */
  sweep?: Footprint;
  /**
   * LATER 142 (web research 313 section 8.10; reading, pending review): the collider's frame -- the node's matrix and its
   * ancestors' up to, not including, the world root (`FUN_003109f0` D:L212151: the walk up the parent link `+0x64` stops
   * at the first node of runtime type 6, which only the world's constructor stores, `FUN_00320310` D:L221318), row-major
   * as `flattenScene`'s `world` (the world model's own root is identity on all 34 maps). The climb takes a face's column
   * and cut in it (`FUN_002dbfb0` D:L180187-180212, `FUN_002dc090` D:L180218-180248; `viewer/src/climb.ts`). **Absent
   * when the frame is upright** -- its local y along the world's and its local x and z level (`m[1]`, `m[4]`, `m[6]`,
   * `m[9]` zero, `m[5]` over 0) -- where the column and the cut come out the same in either frame (a turn about y, a
   * uniform scale and a shift move neither), so every upright node's polygons keep the world-frame path unchanged.
   * Shared by reference, never written: `forkGround`'s copies and the forge's repacks carry it as they find it.
   */
  frame?: Float32Array;
  /**
   * LATER 146 (web research 313 section 8.10): a door owner's frame at rest, kept where `viewer/src/doors.ts` drops
   * `frame` (LATER 142: the swing's frame is the world's, the door's points turned in place). Read only by the forge,
   * whose pieces of a door prototype stand still (`viewer/src/forge/ground.ts` `modelFrame`); never by the walk or the
   * climb (`groundPolygons` copies `frame` alone).
   */
  restFrame?: Float32Array;
  /**
   * LATER 1094 (research 430 s8; reading, pending review): the nodes the original's per-object walk `FUN_002d3030` passes
   * through to reach this owner's polygons, from the node the grid FILES (a world child or a top-level instance, research
   * 23 section 2.1; a clutter instance's master model root, research 422 s3) down to the owner's own node, in that order.
   * At each the walk puts the line into the node's own frame (D:L175103-175108, D:L175248) and refuses it, with the node's
   * whole subtree, when both ends lie beyond one face of the node's `nparams` box (`FUN_003124f0` D:L213172-213241, called
   * at D:L175249; the refusal marks the record done until that node's walk ends, D:L175396-175402). The blast modes read
   * it (`segment.ts` `blastHits`). Absent where the owners were made without the graph (`collisionRuns`, a test's): no box
   * is then asked. A Forge copy carries its template's chain moved by its own matrix (`movedWalk`). An instance node and
   * the prototype root realised under it (`flattenScene`'s `X=model`) are ONE node in the engine and one entry here, the
   * instance node's (`walkChain`; `INSTANCE_NODE_BOX_READING`). Shared by reference, never written.
   */
  nodes?: readonly NodeBox[];
  /**
   * LATER 1094 (research 430 s8): the ground-plane box the original files this owner's walk by -- the filed node's
   * `nparams` box carried into the world by two corners (`worldFootprint`, the placements' reading), or a clutter
   * instance's master box scaled and moved but not turned (`FUN_002d55c0` D:L176288-176344, research 422 s3). The blast
   * modes find the owner in the cells it covers; absent, they use the object's own footprint.
   */
  filed?: Footprint;
  /**
   * LATER 1094 (the review of fc0cb0622b, N2): `filed` is turned into cells by `FUN_002d6c40`'s rule (`(p - origin + 0.0001)`
   * x invCellDim; `FUN_002d55c0` -> `FUN_002d6ab0`, D:L176344) -- a clutter instance's -- not by the grid insert's
   * (`cellRange`, a world node's).
   */
  filedByCover?: true;
  /**
   * LATER 1094 (the second review's F1; the main controller's yes of 2026-11-18): a Forge copy (`movedWalk`) is found in
   * its own polygons' cells as well as its filed node's (`FORGE_COPY_POLY_CELLS_ADAPTATION`, `segment.ts` `blastFiling`).
   */
  filedWithPolys?: true;
}

/**
 * LATER 1094: one node of `CollisionOwner.nodes` -- its `nparams` box in its own frame (min xyz, max xyz: the node's
 * `+0x40..+0x54`, the reader's `bbox`), its frame (row-major, row-vector, as `flattenScene`'s `world`: the node's own matrix
 * times its parents'), and `free` when its flag word's bit 30 is set (`+0x5f` bit 6), for which `FUN_003124f0` refuses
 * nothing (D:L213184).
 */
export interface NodeBox { bbox: Float32Array; world: Float32Array; free?: true }

/** LATER 1094: the flag word's bit 30, for which the node box refuses nothing (`FUN_003124f0` D:L213184). */
export const NODE_BOX_FREE = 1 << 30;

/**
 * LATER 1094 (the review of fc0cb0622b, S2) [reading]: the engine reads a world instance node by copying its model into
 * it (`CNode::CreateInstance`, then the node's own `ReadDataBegin`: reCOM `zNode/node_io.cpp:46-51`,
 * `node_saveload.cpp:49-74`; `buildScene.ts` `worldDi`), so the instance node and its model's root are ONE node, with the
 * instance node's own `nparams` box and frame. `flattenScene` realises them as two (`X` and `X=model`); the chain keeps
 * `X` and drops `X=model`. That the engine's copy keeps the instance node's box, not the model root's, is read from
 * reCOM's order, not from the decompilation.
 */
export const INSTANCE_NODE_BOX_READING = 'the instance node\'s own box and frame; the realised model root not a node of its own' as const;

/** Whether `child`'s path lies under `parent`'s: below it (`/`) or its realised model (`=`, the same engine node). */
export function walksUnder(child: string, parent: string): boolean {
  return child.startsWith(`${parent}/`) || child.startsWith(`${parent}=`);
}
/** A realised model root under an instance node (`X=model`, no `/` after the `=`): not a node of its own on the walk. */
const realisedRoot = (path: string): boolean => /=[^/]*$/.test(path);
/** The node boxes of a pre-order stack of flattened nodes (`INSTANCE_NODE_BOX_READING`). */
export function walkChain(above: readonly { node: SceneNode; world: Float32Array; path: string }[]): NodeBox[] {
  return above.filter((f) => !realisedRoot(f.path)).map(nodeBox);
}

/**
 * LATER 1094 (the review of fc0cb0622b, B1): a Forge copy's walk -- its template's chain with every frame moved by the copy's
 * matrix `m` (row-major, row-vector: a three.js `Matrix4`'s `elements` as they are), and filed by its first node's box
 * carried into the world (`worldFootprint`, a world node's rule: a placed copy stands as a world node). Nothing when the
 * template has no chain.
 */
export function movedWalk(owner: CollisionOwner, m: Float32Array): Pick<CollisionOwner, 'nodes' | 'filed' | 'filedWithPolys'> {
  if (!owner.nodes || owner.nodes.length === 0) return {};
  const nodes = owner.nodes.map((n): NodeBox => ({ ...n, world: multiply(n.world, m) }));
  return { nodes, filed: worldFootprint(nodes[0]!.bbox, nodes[0]!.world), filedWithPolys: true };
}

/** LATER 142: whether a row-major node matrix is upright -- its column and cut the same in its frame as in the world's. */
export function uprightFrame(m: ArrayLike<number>): boolean {
  return m[1] === 0 && m[4] === 0 && m[6] === 0 && m[9] === 0 && m[5]! > 0;
}

interface ObjectBase {
  /** Its index in the list it came from: `placed`, `clutter`, or the collision owners. */
  index: number;
  footprint: Footprint;
  /** The cells it is linked into: one atom each. */
  cells: CellRange;
}
/** A drawn placement of the scene graph. */
export interface ModelObject extends ObjectBase { kind: 'model'; placed: PlacedModel }
/** A drawn clutter placement. */
export interface ClutterObject extends ObjectBase { kind: 'clutter'; placed: PlacedModel }
/** One node's collision polygons, in surface order (the same objects as the collision list's). */
export interface CollisionObject extends ObjectBase { kind: 'collision'; owner: CollisionOwner; polys: readonly WorldPoly[] }
/** What an atom points at: `CGridAtom::Ent` (`zGrid/zgrid.h:18`). */
export type GridObject = ModelObject | ClutterObject | CollisionObject;

/** One link of an object into one cell (`CGridAtom`, `zgrid.h:13-21`). */
export interface GridAtom {
  object: GridObject;
  /** The cell's index, `x + z * cellsX`. */
  cell: number;
}

/** One cell (`CCell`, `zgrid.h:23-39`). */
export interface GridCell {
  /** `x + z * cellsX`: `Create`'s `m_Atoms[cx + cy * m_CellCount.cx]` (`grid_main.cpp:136`). */
  index: number;
  x: number;
  z: number;
  /** `cell%06d`, numbered x fastest as `Create` names them (`grid_main.cpp:139`; research 23 section 2.3). */
  name: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** The atoms linked into it, in the order they were linked; clutter first (see the file's comment). */
  atoms: GridAtom[];
}

export interface Grid {
  params: GridParams;
  /**
   * The map's default soil (`READERM.ZAR/<map>.rdr` `world_params` `DefaultMaterial`, as a hull material byte): the soil
   * a floor of material byte 0 takes (`FUN_002ddc30` D:L181208; research 151 s9.1). Absent: byte 0 is soil 0, no offset.
   * Set by the map loaders (`simMap.ts`, `loadMap.ts`); FLE-2.
   */
  defaultMaterial?: number;
  /**
   * `m_InvCellDim`, `1 / m_CellDim` as the f32 `Create` stores (`grid_main.cpp:69`), the quotient rounded to
   * nearest: chopped instead, Frostfire's type-1 world nodes other than the three oceans spend 393 atoms, not
   * the 414 of research 24 section 1.1 (2026-09-28).
   */
  invCellDim: number;
  /** `cellsX * cellsZ` of them; `cells[i].index === i`. */
  cells: GridCell[];
  /** Every object linked, in link order: clutter, then placements, then collision owners. */
  objects: GridObject[];
  /** How many atoms the links took: one per (object, covered cell). The cells' own heads are not counted. */
  atomsSpent: number;
  /** `atomsSpent` by kind of object. */
  spent: Record<GridObject['kind'], number>;
  /**
   * MAP-02 (`viewer/src/worldState.ts`, research 209 s8): the world's revision -- 0 as built, one more at every change
   * of an owner's active bit (`CollisionOwner.flags` bit 0) the world makes. The one counter every reader that caches
   * what it found in the grid compares against (the mover's walls, the climb's polygons): a port rule, not a reading
   * of the game, which reads the node's `m_active` at every query (`FUN_002d3030`, research 23 s1.1).
   */
  revision: number;
}

const I32_MAX = 0x7fffffff, I32_MIN = -0x80000000;

/**
 * `cvt.w.s` as the EE does it: toward zero, saturating, and NaN to `0x7fffffff` -- research 23 section 2.1's
 * "NaN bounds are safe: cvt_w gives 0x7fffffff, which clamps to one cell".
 */
export function cvtW(v: number): number {
  if (Number.isNaN(v) || v >= 2 ** 31) return I32_MAX;
  if (v <= -(2 ** 31)) return I32_MIN;
  return Math.trunc(v);
}

/**
 * A number to single precision the way the EE rounds its arithmetic: by chopping, toward zero ("PS2 chop never
 * rounds up", research 25's rounding-mode row) -- where `Math.fround` rounds to nearest. Overflow chops to
 * +-FLT_MAX, as the EE has no infinity.
 */
export function chopF32(v: number): number {
  if (Number.isNaN(v)) return v;
  const r = Math.fround(v);
  if (Math.abs(r) <= Math.abs(v)) return r;
  const one = new Float32Array([r]);
  new Uint32Array(one.buffer)[0]! -= 1;               // one unit in the last place toward zero, either sign
  return one[0]!;
}

/** `0 <= i <= n - 1`, the clamp of `addOrderedCellAtom` and `gridGetAtomBasePtr` (`grid_main.cpp:317-334`, `:474-489`). */
const clampIndex = (i: number, n: number): number => (i < 0 ? 0 : i > n - 1 ? n - 1 : i);

/**
 * A world coordinate's cell along one axis, clamped: the coordinate chopped to single precision, times
 * `m_InvCellDim`, through `cvt.w`. Two f32s multiply exactly in a double, and chopping that product to f32
 * before `cvt.w` truncates it cannot change the integer, so the product is left exact. The chop shows: one
 * Frostfire prop's bound sits at 799.9999981 (`relieftower`), which rounding to nearest lifts to 800 and a cell
 * further; chopped, the world's 65 instance children spend 117 atoms, the type-2 count research 24 section 1.1
 * walked in the image (rounded to nearest, 115). That the two 117s are the same nodes is not shown.
 */
function axisCell(v: number, origin: number, inv: number, n: number): number {
  return clampIndex(cvtW(chopF32(v - origin) * inv), n);
}

/** The clamped cell range a footprint covers. Never empty: a range read backwards is taken both ways round. */
export function cellRange(grid: Grid, f: Footprint): CellRange {
  const { originX, originZ, cellsX, cellsZ } = grid.params;
  const ax = axisCell(f.minX, originX, grid.invCellDim, cellsX), bx = axisCell(f.maxX, originX, grid.invCellDim, cellsX);
  const az = axisCell(f.minZ, originZ, grid.invCellDim, cellsZ), bz = axisCell(f.maxZ, originZ, grid.invCellDim, cellsZ);
  return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
}

/**
 * A node's bbox (model space, min xyz then max xyz) carried into the world by `rowMajor`, the way
 * `gridAddNodeToGrids` does it: the two corners transformed, then ordered axis by axis
 * (`grid_main.cpp:408-431`, reCOM's "translates two points"). Not the eight: a turned node's footprint is the
 * box its min and max corners span, narrower than the node at 45 degrees -- on the three fixtures 45 of 448,
 * 74 of 680 and 40 of 363 placements draw more than a unit outside it, up to 31 (measured 2026-09-28). That is the
 * engine's rule as reCOM reads it; the eight-corner box holds every drawn vertex on all three.
 */
export function worldFootprint(bbox: Float32Array, rowMajor: Float32Array): Footprint {
  const a = transformPoint(rowMajor, bbox[0]!, bbox[1]!, bbox[2]!);
  const b = transformPoint(rowMajor, bbox[3]!, bbox[4]!, bbox[5]!);
  return { minX: Math.min(a[0], b[0]), minZ: Math.min(a[2], b[2]), maxX: Math.max(a[0], b[0]), maxZ: Math.max(a[2], b[2]) };
}

/** LATER 1094: a flattened node as `CollisionOwner.nodes` holds it (its bbox and frame by reference). */
export function nodeBox(f: { node: SceneNode; world: Float32Array }): NodeBox {
  return { bbox: f.node.bbox, world: f.world, ...((f.node.flags & NODE_BOX_FREE) !== 0 ? { free: true as const } : {}) };
}

/** A placement's footprint: its node's bbox, or the point it is translated to when it has none. */
function placedFootprint(p: PlacedModel): Footprint {
  if (p.bbox) return worldFootprint(p.bbox, p.rowMajor);
  return pointFootprint(p.rowMajor);
}

/** The translation row of a row-major matrix, as a footprint of no size. */
function pointFootprint(m: Float32Array): Footprint {
  return { minX: m[12]!, minZ: m[14]!, maxX: m[12]!, maxZ: m[14]! };
}

/** The ground-plane extent of some polygons' world points. */
function polysFootprint(polys: readonly WorldPoly[]): Footprint {
  const f: Footprint = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const p of polys) {
    for (let i = 0; i < p.points.length; i += 3) {
      const x = p.points[i]!, z = p.points[i + 2]!;
      if (x < f.minX) f.minX = x;
      if (x > f.maxX) f.maxX = x;
      if (z < f.minZ) f.minZ = z;
      if (z > f.maxZ) f.maxZ = z;
    }
  }
  return f;
}

/**
 * The owners of a collision list: one per realised node, exactly, walked the way `worldCollision(models,
 * rootName)` walks them (`placeCollision` emits each node's polygons together, in `flattenScene` order), so
 * `first`/`count` index that list.
 */
export function collisionOwners(models: SceneNode[], rootName = 'worldmodel'): CollisionOwner[] {
  const out: CollisionOwner[] = [];
  let first = 0;
  // LATER 1094: the nodes above each owner, by `flattenScene`'s pre-order (a node's descendants follow it, their paths
  // below its own). The world's own children are the filed nodes (research 23 section 2.1; `flattenScene`'s `atoms`), so
  // the worldmodel root is not on the walk; any other root (a model walked whole) is.
  const above: SceneInstance[] = [];
  const skipRoot = rootName === 'worldmodel';
  for (const f of flattenScene(models, rootName)) {
    while (above.length > 0 && !walksUnder(f.path, above[above.length - 1]!.path)) above.pop();
    above.push(f);
    const count = worldDi(f).length;
    if (count === 0) continue;
    const nodes = walkChain(skipRoot && above.length > 1 ? above.slice(1) : above);
    out.push({
      modelName: f.modelName, path: f.path, first, count, flags: f.flags, ...((f.flags & 1) === 0 ? { switchedOff: true as const } : {}), ...(uprightFrame(f.world) ? {} : { frame: f.world }),
      ...(nodes.length > 0 ? { nodes, filed: worldFootprint(nodes[0]!.bbox, nodes[0]!.world) } : {}),
    });
    first += count;
  }
  return out;
}

/**
 * The owners a collision list implies without the scene graph: runs of one model name and path. Exact but for
 * sibling nodes of one name that follow each other with polygons, which a run merges -- Frostfire has 330 runs
 * for 348 nodes. Pass `collisionOwners(models)` where the graph is to hand.
 */
export function collisionRuns(polys: readonly WorldPoly[]): CollisionOwner[] {
  const out: CollisionOwner[] = [];
  polys.forEach((p, i) => {
    const last = out[out.length - 1];
    if (last && last.path === p.path && last.modelName === p.modelName) last.count++;
    else out.push({ modelName: p.modelName, path: p.path, first: i, count: 1 });
  });
  return out;
}

/**
 * `CGrid::Create` and the loads' inserts (`FUN_002d7580`, one atom per covered cell; research 23 section 2.1):
 * the cells from `params`, then clutter, placements and collision linked into every cell their footprints
 * cover, clamped into the grid as the engine clamps. `owners` split `collision` into its nodes; without them,
 * `collisionRuns` does.
 */
export function buildGrid(
  params: GridParams,
  placed: readonly PlacedModel[],
  clutter: readonly PlacedModel[],
  collision: readonly WorldPoly[],
  owners: readonly CollisionOwner[] = collisionRuns(collision),
): Grid {
  const cells: GridCell[] = [];
  for (let z = 0; z < params.cellsZ; z++) {
    for (let x = 0; x < params.cellsX; x++) {
      const index = cells.length;
      const minX = params.originX + x * params.cellDim, minZ = params.originZ + z * params.cellDim;
      cells.push({
        index, x, z, name: `cell${String(index).padStart(6, '0')}`,
        minX, minZ, maxX: minX + params.cellDim, maxZ: minZ + params.cellDim, atoms: [],
      });
    }
  }
  const grid: Grid = {
    params, invCellDim: Math.fround(1 / params.cellDim), cells, objects: [], atomsSpent: 0,
    spent: { model: 0, clutter: 0, collision: 0 }, revision: 0,
  };
  const link = (object: GridObject): void => {
    grid.objects.push(object);
    const { x0, x1, z0, z1 } = object.cells;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const cell = x + z * params.cellsX;
        cells[cell]!.atoms.push({ object, cell });
        grid.atomsSpent++;
        grid.spent[object.kind]++;
      }
    }
  };
  clutter.forEach((p, index) => {
    const footprint = pointFootprint(p.rowMajor);
    link({ kind: 'clutter', index, placed: p, footprint, cells: cellRange(grid, footprint) });
  });
  placed.forEach((p, index) => {
    const footprint = placedFootprint(p);
    link({ kind: 'model', index, placed: p, footprint, cells: cellRange(grid, footprint) });
  });
  owners.forEach((owner, index) => {
    if (owner.count <= 0) return;
    const polys = collision.slice(owner.first, owner.first + owner.count);
    const footprint = polysFootprint(polys);
    if (!(footprint.minX <= footprint.maxX)) return;               // no points: nothing to find it by
    if (owner.sweep) {                                             // a door: every cell its swing reaches
      footprint.minX = Math.min(footprint.minX, owner.sweep.minX); footprint.maxX = Math.max(footprint.maxX, owner.sweep.maxX);
      footprint.minZ = Math.min(footprint.minZ, owner.sweep.minZ); footprint.maxZ = Math.max(footprint.maxZ, owner.sweep.maxZ);
    }
    link({ kind: 'collision', index, owner, polys, footprint, cells: cellRange(grid, footprint) });
  });
  return grid;
}

/** The cell at cell coordinates (x, z), clamped into the grid (`gridGetAtomBasePtr`, `grid_main.cpp:468-492`). */
export function cellByCoord(grid: Grid, x: number, z: number): GridCell {
  const cx = clampIndex(cvtW(x), grid.params.cellsX), cz = clampIndex(cvtW(z), grid.params.cellsZ);
  return grid.cells[cx + cz * grid.params.cellsX]!;
}

/** The cell holding world (x, z); a point off the grid gets the edge cell it clamps to. */
export function cellAt(grid: Grid, x: number, z: number): GridCell {
  const { originX, originZ, cellsX, cellsZ } = grid.params;
  return cellByCoord(grid, axisCell(x, originX, grid.invCellDim, cellsX), axisCell(z, originZ, grid.invCellDim, cellsZ));
}

/** Every cell a footprint covers, clamped, x fastest. */
export function cellsCovering(grid: Grid, f: Footprint): GridCell[] {
  const { x0, x1, z0, z1 } = cellRange(grid, f);
  const out: GridCell[] = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push(grid.cells[x + z * grid.params.cellsX]!);
  return out;
}

/**
 * The cells `buildGrid` links a placement into, without linking it: a placement of the scene graph by its
 * node's bbox (`worldFootprint`, or its translation when it has none), a clutter instance by its position
 * alone. What a draw made of placements is filed under when the grid is walked (the viewer's engine order).
 */
export function placementCells(grid: Grid, p: PlacedModel, kind: 'model' | 'clutter' = 'model'): GridCell[] {
  return cellsCovering(grid, kind === 'clutter' ? pointFootprint(p.rowMajor) : placedFootprint(p));
}

/**
 * How a cell's ring is numbered from the camera's cell.
 *
 * - `diamond` (the default, W1.R8): `|dx| + |dz|`, the label reCOM's `addOrderedCellAtom` writes into each
 *   ordered atom (`grid_main.cpp:351`) -- the camera's cell, then the four that share an edge with it, then
 *   the eight at two steps. The function is `zdb_CGrid_addOrderedCellAtom` at `0x002d7030` (384 bytes,
 *   `recomp/socom2_names.csv`, named by the call graph at 0.80); its body is not in this tree, so the label
 *   is reCOM's reading, unchecked against the instruction (2026-09-28).
 * - `square`: `max(|dx|, |dz|)` -- the 3 x 3 around the camera, the 5 x 5. Not the engine's ring; what a
 *   neighbourhood query wants (a wall in the diagonal cell is a neighbour).
 *
 * reCOM's `buildOrderedCellAtomList`, which would enumerate the cells, is empty (`:357-360`), so neither the
 * order the cells are listed in nor `RenderWorld`'s bound `m_ring < 2` (`zrndr_pipe.cpp:207`, five cells
 * under the diamond) is settled by it.
 */
export type RingMetric = 'square' | 'diamond';

const ringOf = (dx: number, dz: number, metric: RingMetric): number =>
  (metric === 'square' ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.abs(dx) + Math.abs(dz));

/**
 * The cells in walk order from world (x, z) out to `maxRing` (to the grid's edge by default): ring by ring,
 * and within a ring by cell index. The camera's cell is `cellAt`'s, clamped, so a ring is only the part of
 * its diamond (or square) that lies on the grid -- the cells `addOrderedCellAtom` would clamp onto one it has
 * already stamped this tick (`grid_main.cpp:341`, `:349`) are the ones that are not there.
 */
export function ringCells(grid: Grid, x: number, z: number, maxRing = Infinity, metric: RingMetric = 'diamond'): { cell: GridCell; ring: number }[] {
  const view = cellAt(grid, x, z);
  const out: { cell: GridCell; ring: number }[] = [];
  if (Number.isFinite(maxRing)) {
    // PERFORMANCE (web sprint 3): a bounded ring visits only the cells in its square, not the whole grid; the list and
    // its order are the same.
    const { cellsX, cellsZ } = grid.params, r = Math.max(0, Math.floor(maxRing));
    for (let cz = Math.max(0, view.z - r); cz <= Math.min(cellsZ - 1, view.z + r); cz++) {
      for (let cx = Math.max(0, view.x - r); cx <= Math.min(cellsX - 1, view.x + r); cx++) {
        const ring = ringOf(cx - view.x, cz - view.z, metric);
        if (ring <= maxRing) out.push({ cell: grid.cells[cx + cz * cellsX]!, ring });
      }
    }
  } else {
    for (const cell of grid.cells) out.push({ cell, ring: ringOf(cell.x - view.x, cell.z - view.z, metric) });
  }
  return out.sort((a, b) => a.ring - b.ring || a.cell.index - b.cell.index);
}

/**
 * The ordered traversal (`StartTraversalOrdered` / `GetNextAtomOrdered`, `grid_main.cpp:264-310`): every atom of
 * every cell in `ringCells` order, each cell's atoms in the order they were linked, with the cell's ring. An
 * object covering several cells comes once per cell; the first time is its nearest ring. The engine also skips
 * a node that is not `m_active` (`:303`); `placeInstances` leaves a placement whose node, or one above it, is off at
 * load out of the grid (`FUN_003389c0` D:L236069; LATER 707), and the world's state switches the rest by path.
 */
export function* traverse(grid: Grid, x: number, z: number, maxRing = Infinity, metric: RingMetric = 'diamond'): Generator<{ atom: GridAtom; ring: number }> {
  for (const { cell, ring } of ringCells(grid, x, z, maxRing, metric)) {
    for (const atom of cell.atoms) yield { atom, ring };
  }
}
