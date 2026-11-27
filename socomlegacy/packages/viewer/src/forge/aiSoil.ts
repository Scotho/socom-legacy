import { aiCellIndex, type AiLoc, type AiMaps } from '@s2u/scene';
import { AI_SOIL_KINDS, AI_SOIL_NAMES, aiCellSoil, type AiSoilKind } from './aiMapOverlay';

/**
 * A layout's painted AI cells (`Layout.aiSoil`; the Forge's owner (crispy, OT.R112), 2026-11-16: "a similar workflow to the collision paint but for
 * ai navigation tiles"; a browser adaptation, FG.R2): each stored cell of the base's AI grid by its key (`aiCellKey`) to
 * the soil it takes -- bits 0-4 of the cell's first word (research 200 section 2), every other bit the disc's. The disc's
 * grid is never written: `withAiSoil` makes the layout's copy, which the editor's overlay, its routes, Check and Play read.
 */

/** A cell's key: the sub-map's index in the file, the cell's column and row (research 75 section 4), `map:x:z`. */
export const aiCellKey = (loc: AiLoc): string => `${loc.map}:${loc.x}:${loc.z}`;

/** A key's cell, or null for one that is not a key. */
export function parseAiCellKey(key: string): AiLoc | null {
  const m = /^(\d{1,2}):(\d{1,4}):(\d{1,4})$/.exec(key);
  return m ? { map: Number(m[1]), x: Number(m[2]), z: Number(m[3]) } : null;
}

/** The soil bits of a cell's word (research 200 section 2). */
const SOIL_MASK = 0x1f;

/**
 * `ai` with `painted`'s cells taking their soils: each sub-map a cell of which is painted copied with its cells (the rest
 * shared), a key of no stored cell left out. None painted: `ai` itself.
 */
export function withAiSoil(ai: AiMaps, painted: ReadonlyMap<string, number>): AiMaps {
  if (!painted.size) return ai;
  const copies = new Map<number, Uint32Array>();
  for (const [key, soil] of painted) {
    const loc = parseAiCellKey(key);
    const sub = loc ? ai.maps[loc.map] : undefined;
    if (!loc || !sub) continue;
    const i = aiCellIndex(sub, loc.x, loc.z);
    if (i < 0) continue;
    let cells = copies.get(loc.map);
    if (!cells) { cells = sub.cells.slice(); copies.set(loc.map, cells); }
    cells[i] = ((cells[i]! & ~SOIL_MASK) | (soil & SOIL_MASK)) >>> 0;
  }
  if (!copies.size) return ai;
  return { ...ai, maps: ai.maps.map((sub, m) => { const cells = copies.get(m); return cells ? { ...sub, cells } : sub; }) };
}

/** A stored cell's soil, or null off the grid. */
export function aiSoilAt(ai: AiMaps, loc: AiLoc): number | null {
  const sub = ai.maps[loc.map];
  const i = sub ? aiCellIndex(sub, loc.x, loc.z) : -1;
  const word = sub && i >= 0 ? sub.cells[i] : undefined;
  return word === undefined ? null : aiCellSoil(word);
}

/** The brush's cells: the stored ones of `loc`'s sub-map in the `size` by `size` square centred on it (1, 3, 5...). */
export function aiBrushCells(ai: AiMaps, loc: AiLoc, size: number): AiLoc[] {
  const sub = ai.maps[loc.map];
  if (!sub) return [];
  const r = Math.max(0, Math.floor(size / 2));
  const out: AiLoc[] = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = loc.x + dx, z = loc.z + dz;
    if (x >= 0 && z >= 0 && aiCellIndex(sub, x, z) >= 0) out.push({ map: loc.map, x, z });
  }
  return out;
}

/** The brush's sizes, in cells across (a browser adaptation's own: the paint's reach, not a value of the game's). */
export const AI_BRUSH_SIZES = [1, 3, 5, 9] as const;

/**
 * The paint's tabs: each kind of the overlay's legend (`AI_SOIL_KINDS`, its colour), and the original's soils it stands
 * for (research 200 section 2, `AI_SOIL_NAMES`), the first the one a click on the tab paints. A kind of several soils
 * (Walkable, Blocked) chooses among them from its menu, as the collision's Climbable chooses its flag.
 */
export interface AiPaintKind { kind: AiSoilKind; label: string; note: string; colour: number; soils: readonly number[] }
const SOILS_OF: Record<AiSoilKind, readonly number[]> = {
  walkable: [1, 3, 4, 5, 12], stairs: [7], climb: [6], steep: [11], water: [2], blocked: [0, 8, 9, 10], collision: [13],
};
export const AI_PAINT_KINDS: readonly AiPaintKind[] = AI_SOIL_KINDS.map((k) => ({ ...k, soils: SOILS_OF[k.kind] }));

/** A soil's word for the tip and the menus: its name in the original (`AI_SOIL_NAMES`), else its number. */
export const aiSoilName = (soil: number): string => AI_SOIL_NAMES[soil] ?? `soil ${soil}`;
