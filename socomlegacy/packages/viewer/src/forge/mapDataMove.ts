import type { AiMaps } from '@s2u/scene';
import { locateAiCell } from '../../../match/src/hostagePath';

/**
 * A base map's own data objects moved by a layout (`Layout.movedData`; the owner, 2026-11-12: "allow all map objects to
 * be moveable ... from spawns to views"; a browser adaptation, FG.R2 -- the game has no editor). As a taken-out
 * objective (`./mapDataHide`), the disc's map is untouched: this layout's editor (the Map Data rows, their billboards)
 * and its match read each moved object at its new place. Each is keyed by its kind and a name stable across a reload:
 * - `slot:<A|B><n>`, `respawn:<A|B><n>`: a spawn slot, a respawn point (`LoadedMap.slots`, `.respawns`)
 * - `hostage:<name>`: an escortee (`LoadedMap.escortees`), its start cell found again under its new place
 * - `bomb:start`: StartBomb (`LoadedMap.bombStart`)
 * - `tacpoint:<i>`: a tactical map point, by its place in the map's list (the file places it on the ground plane)
 * - `taczone:<name>`: a tactical zone, its rectangle carried whole; an extraction zone (kind 1) carries the AI map's
 *   zone of its name with it, by whole cells
 * - `view:<i>`: a spectator view, by its place in the map's list (its turn kept)
 * The scene's own objects (doors, turrets, ladders, flares...) are not moved here: they are the map's model.
 */

export interface MovedMapData { at: [number, number, number] }

/** A spawn slot's or respawn point's name: its side's letter and its number from 1 (`A1`, `B12`). */
const slotName = (s: { side: number; index: number }): string => `${s.side === 0 ? 'A' : 'B'}${s.index + 1}`;

/**
 * A Map Data row's moved key (`./mapData` keys: `slot:A1`, `respawn:A1`, `hostage:<i>`, `bomb:start`, `tacpoint:<i>`,
 * `taczone:<i>`, `view:<i>`), or null for one that does not move (the scene's own objects, a nameless zone).
 */
export function movedDataKeyOf(row: { key: string; data?: unknown }): string | null {
  const data = (row.data ?? {}) as { name?: unknown };
  if (row.key === 'bomb:start') return 'bomb:start';
  if (/^(slot|respawn):[AB]\d{1,3}$/.test(row.key)) return row.key;
  if (/^(tacpoint|view):\d{1,4}$/.test(row.key)) return row.key;
  if (row.key.startsWith('hostage:') && typeof data.name === 'string' && data.name) return `hostage:${data.name}`;
  if (row.key.startsWith('taczone:') && typeof data.name === 'string' && data.name) return `taczone:${data.name}`;
  return null;
}

/** What `withMovedData` reads and moves of a map: only these members, so the editor's and the match's maps both pass. */
interface MovableMap {
  slots?: readonly { side: number; index: number; position: readonly number[] }[];
  respawns?: readonly { side: number; index: number; position: readonly number[] }[];
  escortees?: readonly { name: string; at: readonly number[] }[];
  bombStart?: readonly number[];
  tac?: { points: readonly { x: number; z: number }[]; zones: readonly { name: string; kind: number; minX: number; maxX: number; minZ: number; maxZ: number }[] } | null;
  ai?: AiMaps | null;
  scenicViews?: readonly { at: readonly number[] }[];
}

/** `map` with the moved objects (`moved`) at their new places; `map` itself where none are. */
export function withMovedData<T extends MovableMap>(map: T, moved: ReadonlyMap<string, MovedMapData> | Readonly<Record<string, MovedMapData>>): T {
  const m = moved instanceof Map ? moved : new Map(Object.entries(moved));
  if (m.size === 0) return map;
  const at = (key: string): [number, number, number] | null => { const v = m.get(key); return v ? [v.at[0], v.at[1], v.at[2]] : null; };
  const out = { ...map } as Record<string, unknown>;
  const ai = map.ai ?? null;
  const placeSlot = <S extends { side: number; index: number; position: readonly number[] }>(kind: string, s: S): S => {
    const p = at(`${kind}:${slotName(s)}`);
    return p ? { ...s, position: p } : s;
  };
  if (map.slots) out['slots'] = map.slots.map((s) => placeSlot('slot', s));
  if (map.respawns) out['respawns'] = map.respawns.map((s) => placeSlot('respawn', s));
  if (map.escortees) out['escortees'] = map.escortees.map((e) => {
    const p = at(`hostage:${e.name}`);
    if (!p) return e;
    // Its start cell is the one under its new place (`locateAiCell`, the planner's own lookup); off the grid, the old.
    const loc = ai ? locateAiCell(ai, [p[0], p[1] + 1, p[2]]) : null;
    return { ...e, at: p, ...(loc ? { loc } : {}) };
  });
  const bomb = at('bomb:start');
  if (bomb && map.bombStart) out['bombStart'] = bomb;
  // The extraction zones carried, by name: the tactical map's rectangle by its centre's offset, the AI map's by whole cells.
  const zoneShift = new Map<string, [number, number]>();
  if (map.tac) {
    const points = map.tac.points.map((p, i) => { const q = at(`tacpoint:${i}`); return q ? { ...p, x: q[0], z: q[2] } : p; });
    const zones = map.tac.zones.map((z) => {
      const q = z.name ? at(`taczone:${z.name}`) : null;
      if (!q) return z;
      const dx = q[0] - (z.minX + z.maxX) / 2, dz = q[2] - (z.minZ + z.maxZ) / 2;
      if (z.kind === 1) zoneShift.set(z.name, [dx, dz]);
      return { ...z, minX: z.minX + dx, maxX: z.maxX + dx, minZ: z.minZ + dz, maxZ: z.maxZ + dz };
    });
    out['tac'] = { ...map.tac, points, zones };
  }
  if (ai && zoneShift.size) {
    out['ai'] = {
      ...ai, maps: ai.maps.map((sub) => (sub.zones.some((z) => z.kind === 1 && zoneShift.has(z.name)) ? {
        ...sub, zones: sub.zones.map((z) => {
          const d = z.kind === 1 ? zoneShift.get(z.name) : undefined;
          if (!d) return z;
          const cx = Math.round(d[0] / sub.cellSize[0]), cz = Math.round(d[1] / sub.cellSize[1]);
          const x = Math.max(0, Math.min(sub.cellsX - z.width, z.corner.x + cx)), zz = Math.max(0, Math.min(sub.cellsZ - z.height, z.corner.z + cz));
          return { ...z, corner: { ...z.corner, x, z: zz } };
        }),
      } : sub)),
    };
  }
  if (map.scenicViews) out['scenicViews'] = map.scenicViews.map((v, i) => { const p = at(`view:${i}`); return p ? { ...v, at: p } : v; });
  return out as T;
}
