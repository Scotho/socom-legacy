import type { SpawnSlot } from '@s2u/scene';
import { plantingSideOfNode } from '../net/objective';

/**
 * The Outliner's Map Data branches beyond the props and the spawn slots (a browser adaptation, FG.R2: the game has no
 * editor): each kind of the base map's own data -- read off the disc as `LoadedMap` holds it -- a branch of rows, read
 * only, in the file's order. A row is its name, a place to look at (`at`, `reach` how far back to stand) or a view to
 * take (`view`, a spectator camera's own pose), and a tooltip.
 */

type V3 = readonly [number, number, number];

/** What the branches read of a loaded map: each field `LoadedMap`'s own, only the members used (so a test passes literals). */
export interface MapDataSource {
  /** `LoadedMap.respawns`: the slots' twin records, where a SEAL respawns (research 91 section 4.2). */
  respawns?: readonly SpawnSlot[];
  /** `LoadedMap.escortees`: the hostages at their named points. */
  escortees?: readonly { name: string; character: string; at: V3 }[];
  /** `LoadedMap.bombStart`: DEMOLITION's StartBomb. */
  bombStart?: V3;
  /** `LoadedMap.turrets`: the placed manual turrets. */
  turrets?: readonly { id: number; name: string; origin: V3 }[];
  /** `LoadedMap.doors`: a door's node and its matrix (row-major) under its parent's world matrix. */
  doors?: readonly { index: number; node: string; local: readonly number[]; parent: readonly number[] }[];
  /** `LoadedMap.gates`: as a door. */
  gates?: readonly { index: number; node: string; local: readonly number[]; parent: readonly number[] }[];
  /** `LoadedMap.cranes`: a hook and the switch that pauses it. */
  cranes?: readonly { index: number; node: string; control: { at: V3 } }[];
  /** `LoadedMap.actions`: `actions.rdr`'s context actions on placed nodes, each at its node's origin. */
  actions?: readonly { node: string; type: string; at: V3 }[];
  /** `LoadedMap.tac`: the tactical map's named points and zones (ground plane only). */
  tac?: { points: readonly { name: string; kind: number; x: number; z: number }[]; zones: readonly { name: string; kind: number; minX: number; minZ: number; maxX: number; maxZ: number }[] } | null;
  /** `LoadedMap.scenicViews`: the spectator camera's fixed views (`mission.rdr`'s `Scenic_Views`). */
  scenicViews?: readonly { name: string; at: V3; pitch: number; yaw: number; roll: number }[];
  /**
   * The map's flares, from its drawn world (`../world` `WorldView.flares`), not the loaded map: every facade placement
   * -- the lamp glows, and the sun, the moon and the stars (`facadeOf`, research 36) -- by its node's name, world space.
   */
  flares?: readonly { name: string; at: V3 }[];
  /**
   * The map's ladders (`@s2u/scene` `findLadders`): no object of their own -- each is two hull polygons marked
   * `m_appflags` 2 (research 86 §2) -- read off the base's hull, at the span's foot and its owner node's path.
   */
  ladders?: readonly { path: string; x: number; z: number; bottom: number; top: number }[];
}

export interface MapDataRow {
  key: string;
  label: string;
  title: string;
  /** Where it is, to look at; absent for a view (`view`). */
  at?: [number, number, number];
  /** How far back to stand to see it whole (a zone's size); absent, a near look. */
  reach?: number;
  /** Its mark's kind where it is not its branch's (`./mapDataBillboards` `MAP_DATA_MARKS`: a respawn by its side). */
  kind?: string;
  /** Its record as the map gives it, every field, for the Inspector's Data (read only). */
  data?: unknown;
  /** A spectator view: the camera set to its pose (degrees, the port's yaw). */
  view?: { x: number; y: number; z: number; yaw: number; pitch: number };
}

export interface MapDataGroup { key: string; label: string; rows: MapDataRow[] }

/**
 * An AI-map zone's kind by its name: `ai::MAP`'s parser `FUN_005d69f0` (D489137-489258; research 175) names 1
 * EXTRACT_ZONE and 5 HUD_VISIBLE, and 0 default, 2 safe house, 3 worm hole, 4 router, 6 guard.
 */
export const AI_ZONE_KIND_NAMES: Readonly<Record<number, string>> = {
  0: 'default', 1: 'EXTRACT_ZONE', 2: 'safe house', 3: 'worm hole', 4: 'router', 5: 'HUD_VISIBLE', 6: 'guard',
};

const where = (p: V3): string => `${Math.round(p[0])}, ${Math.round(p[1])}, ${Math.round(p[2])}`;

/** A row-major node's origin in the world: its matrix's translation row carried by its parent's world matrix (row vectors). */
function nodeOrigin(local: readonly number[], parent: readonly number[]): [number, number, number] {
  const v = [local[12] ?? 0, local[13] ?? 0, local[14] ?? 0, 1];
  const out: [number, number, number] = [0, 0, 0];
  for (let j = 0; j < 3; j++) out[j] = v[0]! * parent[j]! + v[1]! * parent[4 + j]! + v[2]! * parent[8 + j]! + v[3]! * parent[12 + j]! + 0;
  return out;
}

/**
 * The map's data as the Outliner's branches, only those the map has, in this order: respawn points, hostages, the bomb
 * start, turrets, doors, gates, cranes, context actions (the doors left to their own branch), tactical points, tactical
 * zones, spectator views. `floorAt(x, z)`: the height to look at for a point the file places on the ground plane only.
 */
export function mapDataGroups(map: MapDataSource, floorAt: (x: number, z: number) => number): MapDataGroup[] {
  const groups: MapDataGroup[] = [];
  const add = (key: string, label: string, rows: MapDataRow[]): void => { if (rows.length) groups.push({ key, label, rows }); };
  const at = (key: string, label: string, p: V3, what: string, data?: unknown): MapDataRow =>
    ({ key, label, at: [p[0], p[1], p[2]], title: `${what} at ${where(p)} · read only · click to look at it`, ...(data !== undefined ? { data } : {}) });

  add('respawns', 'Respawn Points', [...(map.respawns ?? [])].sort((a, b) => a.side - b.side || a.index - b.index).map((s) => {
    const name = `${s.side === 0 ? 'A' : 'B'}${s.index + 1}`;
    // Its side's mark: Rs the SEALs' (side A, 0), Rt the Terrorists' (side B, 1), as the spawn slots' Ss and St.
    const side = s.side === 0 ? 'A (SEALs)' : 'B (Terrorists)';
    return { ...at(`respawn:${name}`, `Respawn ${name}`, s.position, `Respawn point ${name}, side ${side}`, s), kind: s.side === 0 ? 'respawnA' : 'respawnB' };
  }));
  add('escortees', 'Hostages', (map.escortees ?? []).map((e, i) => at(`hostage:${i}`, e.name, e.at, `Hostage ${e.name} (${e.character})`, e)));
  add('bombStart', 'Bomb Start', map.bombStart ? [at('bomb:start', 'Bomb start', map.bombStart, "Demolition's bomb start", { start: map.bombStart })] : []);
  add('turrets', 'Turrets', (map.turrets ?? []).map((t) => at(`turret:${t.id}`, t.name, t.origin, `Mounted turret ${t.name}`, t)));
  // A door at its action's place (what a player stands by), else at its node's own origin.
  const actionAt = new Map((map.actions ?? []).map((a) => [a.node, a.at] as const));
  // A record with neither an action's place nor its node's matrices has no place to mark: it is left out, not put at 0.
  add('doors', 'Doors', (map.doors ?? []).flatMap((d) => {
    const p = actionAt.get(d.node) ?? (d.local && d.parent ? nodeOrigin(d.local, d.parent) : null);
    return p ? [at(`door:${d.index}`, d.node, p, `Door ${d.node}`, d)] : [];
  }));
  add('gates', 'Gates', (map.gates ?? []).flatMap((g) =>
    g.local && g.parent ? [at(`gate:${g.index}`, g.node, nodeOrigin(g.local, g.parent), `Lever gate ${g.node}`, g)] : []));
  add('cranes', 'Cranes', (map.cranes ?? []).map((c) => at(`crane:${c.index}`, c.node, c.control.at, `Crane hook ${c.node}, its switch`, c)));
  // A ladder by its owner node's own name (the path's last step), at its foot, framed far enough back for its height.
  add('ladders', 'Ladders', (map.ladders ?? []).map((l, i) => {
    const name = l.path.split(/[/=]/).filter(Boolean).pop() || `Ladder ${i + 1}`;
    const tall = Math.round(l.top - l.bottom);
    return { ...at(`ladder:${i}`, name, [l.x, l.bottom, l.z], `Ladder ${name} (part of the hull, ${tall} tall)`, l), reach: l.top - l.bottom };
  }));
  // A plant site is a context action as the disc keeps it (MPBOMB), who plants there by its node's name
  // (`../net/objective` `plantingSideOfNode`: the SEALs at terrorist_tent); the user's sites share this branch's mark.
  const planter = (a: { node: string; type: string }): string => {
    if (a.type.toUpperCase() !== 'MPBOMB') return '';
    const side = plantingSideOfNode(a.node);
    return side === 'seal' ? ', the SEALs plant there' : side === 'terrorist' ? ', the Terrorists plant there' : '';
  };
  add('actions', 'Context Actions', (map.actions ?? []).filter((a) => a.type.toUpperCase() !== 'DOOR').map((a, i) =>
    at(`action:${i}`, `${a.type || 'Action'} · ${a.node}`, a.at, `Context action ${a.type || '(untyped)'} on ${a.node}${planter(a)}`, a)));
  add('tacPoints', 'Tactical Points', (map.tac?.points ?? []).map((p, i) =>
    at(`tacpoint:${i}`, p.name || `Point ${i + 1}`, [p.x, floorAt(p.x, p.z), p.z], `Tactical map point ${p.name || i + 1}`, p)));
  add('tacZones', 'Tactical Zones', (map.tac?.zones ?? []).map((z, i) => {
    const x = (z.minX + z.maxX) / 2, zz = (z.minZ + z.maxZ) / 2;
    const row = at(`taczone:${i}`, z.name || `Zone ${i + 1}`, [x, floorAt(x, zz), zz], `Tactical map zone ${z.name || i + 1}, ${Math.round(z.maxX - z.minX)} × ${Math.round(z.maxZ - z.minZ)}`,
      { ...z, ...(AI_ZONE_KIND_NAMES[z.kind] ? { kindName: AI_ZONE_KIND_NAMES[z.kind] } : {}) });
    return { ...row, reach: Math.max(z.maxX - z.minX, z.maxZ - z.minZ) };
  }));
  add('scenicViews', 'Spectator Views', (map.scenicViews ?? []).map((v, i) => ({
    key: `view:${i}`, label: v.name || `View ${i + 1}`,
    view: { x: v.at[0], y: v.at[1], z: v.at[2], yaw: v.yaw, pitch: v.pitch },
    title: `Spectator view ${v.name || i + 1} at ${where(v.at)} · read only · click to look through it`, data: v,
  })));
  add('flares', 'Flares', (map.flares ?? []).map((f, i) => at(`flare:${i}`, f.name || `Flare ${i + 1}`, f.at, `Flare ${f.name || i + 1} (a light's glow, turned to the camera)`, f)));
  return groups;
}
