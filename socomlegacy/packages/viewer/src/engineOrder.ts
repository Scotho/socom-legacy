import { ringCells, type Grid } from '@s2u/scene';

/**
 * What the engine order needs to know of one draw. `world.ts` holds one such record per drawn object --
 * a world part merged across placements, an instanced prop, one LOD copy or one flare per placement, a
 * line group -- which is why the order is computed over these rather than over `LoadedMesh`: a mesh and a
 * draw are not one-to-one.
 */
export interface EngineDraw {
  /**
   * The grid cells (`x + z * cellsX`) of the placements the draw is made of, each filed as the grid files it
   * (`placementCells` in `@s2u/scene`). Empty when there is no placement to file it by.
   */
  readonly cells: readonly number[];
  /** Its place in the scene walk (`LoadedMesh.order`): the tie-break within a ring and in the shadow pass. */
  readonly order: number;
  /** A drop shadow (a `shadow*.tif` draw): held back into the pass after the last ring. */
  readonly shadow: boolean;
  /**
   * A visual the engine defers to its alpha pass (`LoadedMesh.alphaPass`, the visual's `vparams` bit 0: the shadows,
   * the flares and glows, the windows, the puddles, the cloud layers), drawn after the walk far to near (`alphaPassOrder`).
   */
  readonly alphaPass?: boolean;
  /** The draw's centre in the group's frame, for the alpha pass's far-to-near sort; absent, the walk order stands in. */
  readonly centre?: readonly [number, number, number];
}

/**
 * The draws in the order the engine issues them from a camera at world (x, z), `RenderWorld`'s shape:
 *
 * 1. **The grid walked outward from the camera's cell** (`CPipe::RenderWorld`, `grid->StartTraversalOrdered`
 *    / `GetNextAtomOrdered`, reCOM `zRender/zrndr_pipe.cpp:207-248`; SOCOM II's `FUN_00339de0` D:L236851-236945):
 *    ring 0 is the camera's cell, ring *n* the cells `|dx| + |dz| = n` from it, as `addOrderedCellAtom` labels
 *    them (`zGrid/grid_main.cpp:351`, W1.R8; `ringCells`). The engine links a node into every cell its bounds
 *    cover and draws it once, when the walk first reaches it (`m_TickNum`, `grid_main.cpp:341-346`), so a draw
 *    goes out at the **first ring that holds one of its cells**: a merged draw is as near as its nearest piece.
 *    The walk goes to the grid's edge -- reCOM's loop bound `m_ring < 2` would stop at five cells, and no draw
 *    is dropped.
 * 2. **What has no cell** -- a draw with no placement to file it by -- after the last ring.
 * 3. **The alpha pass** (RENDER-VIG, research 82 round 5): every visual whose `vparams` bit 0 is set (and bit 8
 *    clear) is not drawn where the walk reaches it; `CPipe::RenderVisual` (`FUN_003374c0` D:L235422-235438) puts
 *    it on the pipe's alpha list keyed by the squared range from the camera to its centroid (`FUN_003371b0`
 *    D:L235314-235322; a `vparams` bit 18 would force the far end), the list is kept sorted (`FUN_00336f60`
 *    D:L235220-235255) and drawn after the walk, the landmarks and the deferred layers, far to near
 *    (`FUN_00339de0` D:L237235 -> `FUN_00336cb0`), each visual with its own packets' GS state. The drop shadows
 *    are flagged so on every map surveyed, which is the decal pass the viewer drew after the last ring from the
 *    start (reCOM `zrndr_pipe.cpp:176-196`); a `shadow*.tif` draw without the flag keeps that place.
 *
 * Within a ring, draws go in scene-walk order (`order`), then as given. The engine orders a ring by cell and each
 * cell's atoms by link order; a draw merged across cells has no one place in that, so the walk order stands in
 * for it. Within the alpha pass, far to near by `centre` (`alphaPassOrder`); a draw with no centre goes by the walk.
 *
 * reCOM's `buildOrderedCellAtomList`, which fills the list the walk reads, is empty (`grid_main.cpp:357-360`):
 * that the list runs near to far is the reading of the ring label and of the sprint's spec (§4, W1.2), not
 * something reCOM shows.
 */
export function engineOrder<T extends EngineDraw>(draws: readonly T[], grid: Grid, x: number, z: number, y = 0): T[] {
  const ring = new Float64Array(grid.cells.length).fill(Infinity);
  for (const r of ringCells(grid, x, z)) ring[r.cell.index] = r.ring;
  const walk: { draw: T; index: number; ring: number }[] = [];
  const pass: T[] = [];
  draws.forEach((draw, index) => {
    if (inAlphaPass(draw)) { pass.push(draw); return; }
    let first = Infinity;
    for (const c of draw.cells) {
      const at = ring[c];
      if (at !== undefined && at < first) first = at;
    }
    walk.push({ draw, index, ring: first });
  });
  // Two draws with no cell compare Infinity - Infinity, NaN, which falls through to the walk order.
  walk.sort((a, b) => a.ring - b.ring || a.draw.order - b.draw.order || a.index - b.index);
  return [...walk.map((k) => k.draw), ...alphaPassOrder(pass, x, y, z)];
}

/** Whether a draw is held back into the alpha pass: the visual's flag, or a drop shadow by its texture's name. */
export function inAlphaPass(draw: EngineDraw): boolean {
  return draw.shadow || draw.alphaPass === true;
}

/**
 * The alpha pass's own order from a camera at (x, y, z): far to near by the squared range to each draw's centre, the
 * console's sort (`FUN_003371b0`, `FUN_00336f60`); a draw without a centre, or two at one range, go by the scene walk,
 * then as given. Pure, and cheap enough to run every frame: the console re-sorts its list every frame, where the
 * ring walk is recomputed only when the camera changes cell.
 */
export function alphaPassOrder<T extends EngineDraw>(draws: readonly T[], x: number, y: number, z: number): T[] {
  const range = (d: T): number => (d.centre ? (d.centre[0] - x) ** 2 + (d.centre[1] - y) ** 2 + (d.centre[2] - z) ** 2 : NaN);
  const keyed = draws.map((draw, index) => ({ draw, index, range: range(draw) }));
  // NaN (no centre) compares as neither greater nor smaller: the walk order decides, as the ring sort's tie does.
  keyed.sort((a, b) => b.range - a.range || a.draw.order - b.draw.order || a.index - b.index);
  return keyed.map((k) => k.draw);
}
