import type { LoadedMap } from '../loadMap';
import { findLadders } from '@s2u/scene';
import { groundPolygons } from '../mover';
import { hostageCharactersOf } from './hostages';
import { accessTemplates } from './placedAccess';
import { doorTemplates } from './placedDoors';
import { turretTemplates } from './turrets';
import { flareTemplates } from './placedFlares';

/**
 * Which disc maps hold doors, turrets and hostages (a browser adaptation, FG.R2, no original): the Inspector's Map choice
 * for a copied door, turret or hostage lists only the maps with one to copy. Counted off each map as the port reads it
 * (`LoadedMap.doors`, `.turrets`, `.types.escortees`: `../doors` `readDoors`, `../simMap` `mapTurrets`, `chartype.rdr`'s
 * `escortees`), the forge worker reading each once and keeping only the counts (`./archives` `census`).
 */
export type CopyKind = 'door' | 'turret' | 'hostage' | 'ladder' | 'gate' | 'barrier' | 'flare';
export type MapCensus = Record<CopyKind, number>;

/** A map's doors, turrets and hostage characters (each character once). */
const beneath = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}=`);

/**
 * A map's ladder props (the owner, 2026-11-06; a browser adaptation, FG.R2): a ladder is no object of the game's -- the
 * hull's `m_appflags` 2 polygons (`@s2u/scene` `findLadders`, research 86 section 2) -- but on some maps those polygons
 * are a prop's own (Sandstorm's `ladder35`), and a placed copy of that prop is then a ladder the match climbs. Each prop
 * once, by its model, with its ladder's height; a ladder that is part of a building (Frostfire's) is none.
 */
export function ladderPropsOf(map: Pick<LoadedMap, 'ground' | 'props'>): { model: string; height: number }[] {
  if (!map.ground) return [];
  const out: { model: string; height: number }[] = [];
  for (const l of findLadders(groundPolygons(map.ground))) {
    const prop = map.props.find((p) => (p.paths ?? []).some((q) => beneath(l.path, q) || beneath(q, l.path)));
    if (prop && !out.some((o) => o.model === prop.modelName)) out.push({ model: prop.modelName, height: Math.round(l.top - l.bottom) });
  }
  return out;
}

export function censusOf(map: Pick<LoadedMap, 'doors' | 'turrets' | 'types'>): MapCensus {
  const access = 'meta' in map ? accessTemplates(map as LoadedMap, (map as LoadedMap).archive) : [];
  return { door: map.doors?.length ?? 0, turret: map.turrets?.length ?? 0, hostage: hostageCharactersOf(map).length, ladder: 'ground' in map ? ladderPropsOf(map as LoadedMap).length : 0,
    gate: access.filter((t) => t.kind === 'gate').length, barrier: access.filter((t) => t.kind === 'barrier').length,
    flare: 'props' in map ? flareTemplates(map as LoadedMap, (map as LoadedMap).archive).length : 0 };
}

/** Each kind's copies on a map, `[name, label]`: what its Door, Turret or Character choice lists. */
export type MapCopies = Record<CopyKind, (readonly [string, string])[]>;

/**
 * A map's doors (labelled with their model and swing), turrets (with their weapon) and hostage characters, each by the
 * name a placement keeps -- read once by the worker (`./archives` `census`), so a Map choice switches to that map's first
 * at once, its archive not loaded for it.
 */
export function copiesOf(map: LoadedMap): MapCopies {
  const stem = map.archive;
  const access = accessTemplates(map, stem);
  return {
    door: (map.doors?.length ? doorTemplates(map, stem) : []).map((t) => [t.name, `${t.name.trim()} · ${t.pieces[0]?.prop.modelName ?? '?'} · ${t.spec.programs.map((p) => p.name).join(' + ')}`] as const),
    turret: (map.turrets?.length ? turretTemplates(map, stem) : []).map((t) => [t.name, `${t.name.trim()} · ${t.placement.weapon ?? 'no weapon'}`] as const),
    hostage: hostageCharactersOf(map).map((c) => [c, c] as const),
    ladder: ladderPropsOf(map).map((l) => [l.model, `${l.model} \u00b7 ${l.height} tall`] as const),
    // A map's gates and C4 barriers (`./placedAccess`): its access objects, by their root node.
    gate: access.filter((t) => t.kind === 'gate').map((t) => [t.name, `${t.name} \u00b7 slides ${Math.round(Math.hypot(...t.gate!.spec.open))}`] as const),
    barrier: access.filter((t) => t.kind === 'barrier').map((t) => [t.name, `${t.name} \u00b7 ${t.pieces.length} parts`] as const),
    // A map's flares (`./placedFlares`): its facade nodes alone, by node name, each with the model it hangs on.
    flare: flareTemplates(map, stem).map((t) => [t.name, `${t.name} \u00b7 ${t.prop.modelName}`] as const),
  };
}

/** The census of a map's copies: how many of each. */
export function censusOfCopies(c: MapCopies): MapCensus {
  return { door: c.door.length, turret: c.turret.length, hostage: c.hostage.length, ladder: c.ladder.length, gate: c.gate.length, barrier: c.barrier.length, flare: c.flare.length };
}

/**
 * The Map choice's options: only the maps with one of `kind` to copy -- one with none, or not yet counted, left out until
 * its count comes in -- and the current choice (`current`) always, so the select shows it.
 */
export function censusOptions(maps: readonly (readonly [string, string])[], known: (stem: string) => MapCensus | null,
  kind: CopyKind, current: string): (readonly [string, string])[] {
  return maps.filter(([stem]) => stem === current || (known(stem)?.[kind] ?? 0) > 0);
}

/**
 * The ladder a new placement is where the palette's archive has none (a browser adaptation, FG.R2, as `DEFAULT_DOOR`):
 * Sandstorm's `ladder35`, its own hull a ladder's (`test/forge/mapCensus.test.ts` reads it off the disc).
 */
export const DEFAULT_LADDER = { source: 'MP73', name: 'ladder35' } as const;
