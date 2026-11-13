import { ACTION_TYPE_CODES } from '../mapActions';

/**
 * A base map's own objectives taken out of a layout (`Layout.hiddenData`; the owner, 2026-11-06; a browser adaptation,
 * FG.R2 -- a custom version of an official map, its game mode changed): as a hidden prop (FG-17) the disc's map is
 * untouched, and this layout's editor (the Map Data rows, their billboards) and its match (the room's objective rules)
 * leave them out. Each is keyed by its kind and its name, stable across a reload:
 * - `hostage:<name>`: an escortee (`LoadedMap.escortees`, by its scene name)
 * - `bomb:start`: StartBomb (`LoadedMap.bombStart`)
 * - `site:<node>`: an MPBOMB plant site (`meta.actions`, by its node: `terrorist_tent`, `seal_tent`)
 * - `zone:<name>`: an extraction zone (the AI maps' kind-1 zones and the tactical map's, by name)
 * - `slot:<A|B><n>`: a spawn slot (`LoadedMap.slots`, by its side and number, as its billboard's key)
 * - `respawn:<A|B><n>`: a respawn point (`LoadedMap.respawns`, likewise)
 */

/** A spawn slot's or respawn point's name: its side's letter and its number from 1 (`A1`, `B12`). */
const slotName = (s: { side: number; index: number }): string => `${s.side === 0 ? 'A' : 'B'}${s.index + 1}`;

/** A Map Data row's taken-out key (`./mapData` keys: `hostage:<i>`, `bomb:start`, `action:<i>`, `taczone:<i>`), or null. */
export function hiddenDataKeyOf(row: { key: string; data?: unknown }): string | null {
  const data = (row.data ?? {}) as { name?: unknown; node?: unknown; type?: unknown; kind?: unknown };
  if (row.key === 'bomb:start') return 'bomb:start';
  if (/^(slot|respawn):[AB]\d{1,3}$/.test(row.key)) return row.key;
  if (row.key.startsWith('hostage:') && typeof data.name === 'string') return `hostage:${data.name}`;
  if (row.key.startsWith('action:') && typeof data.node === 'string' && typeof data.type === 'string' && data.type.toUpperCase() === 'MPBOMB') return `site:${data.node}`;
  if (row.key.startsWith('taczone:') && typeof data.name === 'string' && data.kind === 1) return `zone:${data.name}`;
  return null;
}

/** What `withoutHiddenData` reads and strips of a map: only these members, so the editor's and the match's maps both pass. */
interface HideableMap {
  slots?: readonly { side: number; index: number }[];
  respawns?: readonly { side: number; index: number }[];
  escortees?: readonly { name: string }[];
  bombStart?: readonly number[];
  meta?: { actions: readonly { node: string; typeCode: number }[] } | null;
  /** The editor's own list of the map's actions (`LoadedMap.actions`, its context actions with their places). */
  actions?: readonly { node: string; type: string }[];
  ai?: { maps: readonly { zones: readonly { name: string; kind: number }[] }[] } | null;
  tac?: { zones: readonly { name: string; kind: number }[] } | null;
}

/** `map` with the taken-out objectives (`keys`) left out; `map` itself where none are. */
export function withoutHiddenData<T extends HideableMap>(map: T, keys: ReadonlySet<string> | readonly string[]): T {
  const k = keys instanceof Set ? keys : new Set(keys);
  if (k.size === 0) return map;
  const out: Record<string, unknown> = { ...map };
  if (map.slots) out['slots'] = map.slots.filter((s) => !k.has(`slot:${slotName(s)}`));
  if (map.respawns) out['respawns'] = map.respawns.filter((s) => !k.has(`respawn:${slotName(s)}`));
  if (map.escortees) out['escortees'] = map.escortees.filter((e) => !k.has(`hostage:${e.name}`));
  if (k.has('bomb:start')) delete out['bombStart'];
  if (map.meta) {
    out['meta'] = { ...map.meta, actions: map.meta.actions.filter((a) => !(a.typeCode === ACTION_TYPE_CODES['MPBOMB'] && k.has(`site:${a.node}`))) };
  }
  if (map.actions) out['actions'] = map.actions.filter((a) => !(a.type.toUpperCase() === 'MPBOMB' && k.has(`site:${a.node}`)));
  const zoneKept = (z: { name: string; kind: number }): boolean => !(z.kind === 1 && k.has(`zone:${z.name}`));
  if (map.ai) out['ai'] = { ...map.ai, maps: map.ai.maps.map((m) => ({ ...m, zones: m.zones.filter(zoneKept) })) };
  if (map.tac) out['tac'] = { ...map.tac, zones: map.tac.zones.filter(zoneKept) };
  return out as T;
}
