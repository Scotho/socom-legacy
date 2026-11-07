import { aiCellIndex, aiCellOf, aiCellY, type AiMaps, type AiZone } from '@s2u/scene';
import type { ExtractionZone } from './layout';

/**
 * The layout's placed extraction zones (`Layout.extractionZones`; a browser adaptation, FG.R2, no original): the Forge's
 * own EXTRACT_ZONEs, beside the map's. A disc's are AI-map zones of kind 1 (`zonesOfKind(ai, 1)`, research 175 §5),
 * named Safety, Safety2 (Desert Glory's), which the tactical map draws (`../tacMap`) and the room's extraction tests a
 * hostage's cell against (`ExtractionAuthority`); a placed one is made the same: kind 1, on the cells it covers of the
 * sub-map under it.
 */

/** The kind of an extraction zone in the AI map (`AiZone.kind` 1, EXTRACT_ZONE). */
export const EXTRACT_ZONE_KIND = 1;
/**
 * An escort zone's kind until its promotion (`ai::MAP`'s `HUD_VISIBLE`, 5): the escort script's `reset` leaves Safety
 * and Safety2 so, and SEALcheck makes them kind 1 after its wait (research 175 §4 items 1 and 3).
 */
export const ESCORT_ZONE_KIND = 5;
/** A placed zone's width and depth when placed (world units). An editor's value (FG.R2), not the disc's. */
export const EXTRACTION_ZONE_SIZE = 100;

/** The first free name in the disc's own pattern -- Safety, Safety2, Safety3 -- against `taken` (case-blind). */
export function nextSafetyName(taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (!used.has('safety')) return 'Safety';
  for (let n = 2; ; n++) if (!used.has(`safety${n}`)) return `Safety${n}`;
}

type TacZone = { minX: number; minZ: number; maxX: number; maxZ: number; kind: number; name: string };

/**
 * `map` with the placed zones beside its own: each a kind-1 zone on the sub-map whose stored cell under its centre is
 * nearest its height, its corner the cell of its minimum corner and its size in whole cells (at least one), clamped to
 * the grid; and a zone on the tactical map (`tac`). The loaded map is not changed. One with no cell under its centre,
 * or every one on a map with no AI map, is left out and counted (`unplaced`). `centres`: each placed zone's cells' middle
 * at their floor, for its compass mark (`FORGE_ESCORT_ZONE_MARK_ADAPTATION`).
 */
export function withPlacedZones<T extends { ai?: AiMaps; tac?: { zones: TacZone[] } | null }>(
  map: T, placed: readonly ExtractionZone[], kind: number = EXTRACT_ZONE_KIND,
): { map: T; unplaced: number; centres: [number, number, number][] } {
  if (!placed.length) return { map, unplaced: 0, centres: [] };
  if (!map.ai) return { map, unplaced: placed.length, centres: [] };
  const centres: [number, number, number][] = [];
  const maps = map.ai.maps.map((s) => ({ ...s, zones: [...s.zones] }));
  const tacZones: TacZone[] = [];
  let unplaced = 0;
  for (const z of placed) {
    let best: { i: number; y: number } | null = null;
    for (const [i, sub] of maps.entries()) {
      const loc = aiCellOf(sub, z.at[0], z.at[2]);
      if (!loc) continue;
      const c = aiCellIndex(sub, loc.x, loc.z);
      if (c < 0) continue;
      const y = aiCellY(sub, sub.cells[c]!);
      if (!best || Math.abs(y - z.at[1]) < Math.abs(best.y - z.at[1])) best = { i, y };
    }
    if (!best) { unplaced++; continue; }
    const sub = maps[best.i]!;
    const minX = z.at[0] - z.size[0] / 2, minZ = z.at[2] - z.size[1] / 2;
    const cx = Math.min(sub.cellsX - 1, Math.max(0, Math.floor((minX - sub.min[0]) / sub.cellSize[0])));
    const cz = Math.min(sub.cellsZ - 1, Math.max(0, Math.floor((minZ - sub.min[2]) / sub.cellSize[1])));
    const width = Math.min(sub.cellsX - cx, Math.max(1, Math.round(z.size[0] / sub.cellSize[0])));
    const height = Math.min(sub.cellsZ - cz, Math.max(1, Math.round(z.size[1] / sub.cellSize[1])));
    const zone: AiZone = { name: z.name, corner: { map: sub.index, x: cx, z: cz }, width, height, kind };
    sub.zones.push(zone);
    const x0 = sub.min[0] + cx * sub.cellSize[0], z0 = sub.min[2] + cz * sub.cellSize[1];
    centres.push([x0 + (width * sub.cellSize[0]) / 2, best.y, z0 + (height * sub.cellSize[1]) / 2]);
    tacZones.push({ minX: x0, minZ: z0, maxX: x0 + width * sub.cellSize[0], maxZ: z0 + height * sub.cellSize[1], kind, name: z.name });
  }
  const tac = map.tac ? { ...map.tac, zones: [...map.tac.zones, ...tacZones] } : map.tac;
  return { map: { ...map, ai: { ...map.ai, maps }, ...(tac !== undefined ? { tac } : {}) }, unplaced, centres };
}
