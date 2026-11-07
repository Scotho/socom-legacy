import type { AiMaps, AiSubMap } from '@s2u/scene';

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
/** The floor's AI cell size (world units). An editor's value (FG.R2): the disc's sub-maps carry their own. */
export const FLOOR_AI_CELL = 32;

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
