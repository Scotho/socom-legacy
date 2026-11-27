import { cellAt, isGroundSurface, planeHeightAt, polygonNormal, type AiMaps, type AiSubMap, type Grid } from '@s2u/scene';
import { groundGrid, type GroundData } from '../mover';

/**
 * The blank floor's AI map (a browser adaptation, FG.R2; no original -- the floor is the Forge's own, and the disc's AI
 * maps belong to its maps): one sub-map over the whole floor, every cell stored, flat and open, so placed hostages have
 * cells to start on and walk, and placed extraction zones cells to cover (`./hostages`, `./extractionZones`). A cell's
 * word is the disc's encoding as the port reads it: bit 31 set (on every stored cell, research 75 §4), height bits
 * 9-18 zero (`aiCellY`: the sub-map's min y, the floor's 0), and soil bits 0-4 `FLOOR_AI_SOIL` -- a soil the hostage
 * planner walks (`HostagePathPlanner.traversable`: not 0, 8, 9 or 10) at its plain cost (`basicStepCost` adds nothing
 * for soil 3). No links, markers, points or zones of its own.
 */

/** The floor's soil: 3, the one `basicStepCost` (`match/src/hostagePath.ts`) adds no surcharge for. */
export const FLOOR_AI_SOIL = 3;
/**
 * The floor's AI cell size (world units): the disc's -- a reading, 10 by 10 on every one of the 83 sub-maps of the
 * disc's `AIMAPS.MPS` (research 75 section 3, the sub-map header's +0x24; read by `@s2u/scene` `parseAiMaps`, pinned over
 * every map by `scene/test/spawnSlots.parity.test.ts`). FP-1a: the grid itself is the Forge's (FG.R2), its cell the
 * disc's one value, so the hostage machinery's cell-count rules and its literals (`match/src/hostageFollow.ts`
 * `FOLLOW_RULES_READING.cell` 10, `hostageSteering.ts` `cellInverse` 0.1) read the floor as they read a disc map; it was
 * 32 (Crispy's editor value), on which those literals were wrong. 8000 units square is 800 x 800 cells (5.12 MB once a
 * composition). `param` 0.5 and the 1024 ceiling stay the floor's own (no reader of either).
 */
export const FLOOR_AI_CELL = 10;

/** The AI map for a blank floor `size` units square about the origin, at height 0. */
export function floorAiMaps(size: number, cell = FLOOR_AI_CELL): AiMaps {
  const n = Math.ceil(size / cell);
  const half = (n * cell) / 2;
  const word = (0x80000000 | FLOOR_AI_SOIL) >>> 0;
  const sub = {
    index: 0, name: 'forge_floor', id: -1, flags: 0, min: [-half, 0, -half], max: [half, 1024, half], cellsX: n, cellsZ: n,
    cellSize: [cell, cell], param: 0.5, stamp: 0,
    rows: Array.from({ length: n }, (_, z) => ({ x0: 0, x1: n, first: z * n })),
    cells: new Uint32Array(n * n).fill(word), cellsB: new Uint32Array(n * n),
    points: [], markers: [], links: [], zones: [], spawns: [], lines: [],
  } as unknown as AiSubMap;
  return { version: 2, maps: [sub], links: { words: 0, records: 0 }, spawns: [] };
}

/**
 * The room a hostage stands in, game units (a browser adaptation, no original: the disc's AI maps are its tool's, which
 * the port does not have): 1.8 m at 10 units a metre. A floor with a surface less than this above it is no cell's floor.
 */
export const FLOOR_AI_HEADROOM_ADAPTATION = 18;

/**
 * The blank floor's AI map standing on what is built on it (the Forge's owner (crispy, OT.R112), 2026-11-17: "placed hostages don't seem to spawn
 * in correctly when placed on moved/custom geometry in our custom maps"): each of its cells over or near anything off
 * the flat floor takes as its height the lowest open floor under its centre (`openFloorAt`: a room's floor, not its
 * roof; a solid box's top, not the floor under it) on `ground`, the layout's hull; the rest of the floor stays at 0. Its soil kept (a painted one too). A cell's height is the disc's encoding (bits 9-18,
 * `aiCellY`): whole units from the sub-map's 0 to 1023. Another map's sub-maps (a disc AI map's) are left as they are.
 */
export function withGroundHeights(ai: AiMaps, ground: GroundData): AiMaps {
  const at = ai.maps.findIndex((m) => m.name === 'forge_floor');
  const sub = ai.maps[at];
  if (!sub) return ai;
  // Where the hull leaves the flat floor: the box of every point off it (a cell's margin round it).
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const p = ground.points;
  for (let i = 0; i + 2 < p.length; i += 3) {
    if (Math.abs(p[i + 1]!) < 1e-3) continue;
    x0 = Math.min(x0, p[i]!); x1 = Math.max(x1, p[i]!); z0 = Math.min(z0, p[i + 2]!); z1 = Math.max(z1, p[i + 2]!);
  }
  if (!Number.isFinite(x0)) return ai;
  const [cx, cz] = sub.cellSize;
  const ix0 = Math.max(0, Math.floor((x0 - sub.min[0]) / cx) - 1), ix1 = Math.min(sub.cellsX - 1, Math.ceil((x1 - sub.min[0]) / cx) + 1);
  const iz0 = Math.max(0, Math.floor((z0 - sub.min[2]) / cz) - 1), iz1 = Math.min(sub.cellsZ - 1, Math.ceil((z1 - sub.min[2]) / cz) + 1);
  const grid = groundGrid(ground);
  const span = sub.max[1] - sub.min[1];
  const cells = sub.cells.slice();
  let changed = false;
  for (let z = iz0; z <= iz1; z++) {
    const row = sub.rows[z];
    if (!row) continue;
    for (let x = Math.max(ix0, row.x0); x <= Math.min(ix1, row.x1 - 1); x++) {
      const i = row.first + (x - row.x0);
      const floor = openFloorAt(grid, sub.min[0] + (x + 0.5) * cx, sub.min[2] + (z + 0.5) * cz);
      if (floor === null) continue;
      const q = Math.max(0, Math.min(1023, Math.round(((floor - sub.min[1]) * 1024) / span)));
      const w = ((cells[i]! & ~(0x3ff << 9)) | (q << 9)) >>> 0;
      if (w !== cells[i]) { cells[i] = w; changed = true; }
    }
  }
  if (!changed) return ai;
  const maps = ai.maps.slice();
  maps[at] = { ...sub, cells };
  return { ...ai, maps };
}

/**
 * The lowest open floor over (x, z) on `grid`: an up-facing ground polygon (`isGroundSurface`) whose next surface above
 * faces down -- open air under a ceiling -- at least `FLOOR_AI_HEADROOM_ADAPTATION` over it, or with nothing above it.
 * One whose next surface above faces up, or touches it, is inside a solid (a box's floor under its own bottom). Every
 * polygon of each collision object is read, by its own winding's facing -- not the engine's ground probe
 * (`probeGround`), which takes one hit an object (`FUN_005b5d40`'s candidates), so a box's hull would give one face.
 */
export function openFloorAt(grid: Grid, x: number, z: number): number | null {
  const hits: { y: number; up: boolean; ground: boolean }[] = [];
  for (const atom of cellAt(grid, x, z).atoms) {
    const o = atom.object;
    if (o.kind !== 'collision') continue;
    const f = o.footprint;
    if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
    for (const poly of o.polys) {
      const n = polygonNormal(poly.points);
      if (!n || Math.abs(n[1]) < 1e-6 || !insideXZ(poly.points, x, z)) continue;   // a wall has no one height under a line
      const y = planeHeightAt(poly.points, x, z);
      if (y !== null) hits.push({ y, up: n[1] > 0, ground: isGroundSurface(poly) });
    }
  }
  // Lowest first; at one height a face down before a face up (a box's bottom on the floor closes the floor under it).
  hits.sort((a, b) => a.y - b.y || Number(a.up) - Number(b.up));
  for (const h of hits) {
    if (!h.up || !h.ground) continue;
    const above = hits.filter((k) => k !== h && k.y >= h.y - 1e-3);
    const next = above.reduce<typeof h | null>((m, k) => (!m || k.y < m.y || (k.y === m.y && !k.up) ? k : m), null);
    if (!next || (!next.up && next.y - h.y >= FLOOR_AI_HEADROOM_ADAPTATION)) return h.y;
  }
  return null;
}

/** Whether (x, z) is inside the polygon's outline seen from above (its points x, y, z), either winding. */
function insideXZ(p: Float32Array, x: number, z: number): boolean {
  const n = p.length / 3;
  let left = false, right = false;
  for (let i = 0; i < n; i++) {
    const a = i * 3, b = ((i + 1) % n) * 3;
    const c = (p[b]! - p[a]!) * (z - p[a + 2]!) - (p[b + 2]! - p[a + 2]!) * (x - p[a]!);
    if (c > 1e-7) left = true; else if (c < -1e-7) right = true;
    if (left && right) return false;
  }
  return true;
}
