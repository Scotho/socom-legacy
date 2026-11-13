import { ambientProgramsOf } from './forgeObjects';
import type { LoadedMap } from '../loadMap';
import { findLadders, type EffectProgram } from '@s2u/scene';
import { groundPolygons } from '../mover';
import { under } from '../mapMeta';
import { hostageCharactersOf } from './hostages';
import { accessTemplates, accessTriggerOf } from './placedAccess';
import { doorTemplates } from './placedDoors';
import { turretTemplates } from './turrets';
import { flareTemplates } from './placedFlares';
import { scriptEffectsOf, scriptSoundsOf } from './scriptAssets';

/**
 * Which disc maps hold doors, turrets and hostages (a browser adaptation, FG.R2, no original): the Inspector's Map choice
 * for a copied door, turret or hostage lists only the maps with one to copy. Counted off each map as the port reads it
 * (`LoadedMap.doors`, `.turrets`, `.types.escortees`: `../doors` `readDoors`, `../simMap` `mapTurrets`, `chartype.rdr`'s
 * `escortees`), the forge worker reading each once and keeping only the counts (`./archives` `census`).
 */
export type CopyKind = 'door' | 'turret' | 'hostage' | 'ladder' | 'gate' | 'barrier' | 'flare' | 'sound' | 'effect' | 'ambient';
export type MapCensus = Record<CopyKind, number>;

/** A map's doors, turrets and hostage characters (each character once). */

/**
 * A map's ladder props (the owner, 2026-11-06; a browser adaptation, FG.R2): a ladder is no object of the game's -- the
 * hull's `m_appflags` 2 polygons (`@s2u/scene` `findLadders`, research 86 section 2) -- but on some maps those polygons
 * are a prop's own (Sandstorm's `ladder35`), and a placed copy of that prop is then a ladder the match climbs. Each prop
 * once, by its model, with its ladder's height; a ladder that is part of a building (Frostfire's) is none.
 */
export function ladderPropsOf(map: Pick<LoadedMap, 'ground' | 'props'>): { model: string; height: number; front: [number, number] }[] {
  if (!map.ground) return [];
  const out: { model: string; height: number; front: [number, number] }[] = [];
  for (const l of findLadders(groundPolygons(map.ground))) {
    const prop = map.props.find((p) => (p.paths ?? []).some((q) => under(l.path, q) || under(q, l.path)));
    if (!prop || out.some((o) => o.model === prop.modelName)) continue;
    // Its climbing side in the prop's own frame (`front`, x and z): the ladder's normal (`Ladder.nx`/`nz`, the side the
    // climber stands on) through its placement's turn -- Sandstorm's ladder35 and ladder50 +Z, ladder42 a quarter off.
    const i = (prop.paths ?? []).findIndex((q) => under(l.path, q) || under(q, l.path));
    const m = prop.matrices.subarray(i * 16, i * 16 + 16);
    const sx = Math.hypot(m[0]!, m[2]!) || 1, sz = Math.hypot(m[8]!, m[10]!) || 1;
    const fx = (l.nx * m[0]! + l.nz * m[2]!) / sx, fz = (l.nx * m[8]! + l.nz * m[10]!) / sz, f = Math.hypot(fx, fz);
    out.push({ model: prop.modelName, height: Math.round(l.top - l.bottom), front: f > 1e-6 ? [fx / f, fz / f] : [0, 1] });
  }
  return out;
}

export function censusOf(map: Pick<LoadedMap, 'doors' | 'turrets' | 'types'>): MapCensus {
  const access = 'meta' in map ? accessTemplates(map as LoadedMap, (map as LoadedMap).archive) : [];
  return { door: map.doors?.length ?? 0, turret: map.turrets?.length ?? 0, hostage: hostageCharactersOf(map).length, ladder: 'ground' in map ? ladderPropsOf(map as LoadedMap).length : 0,
    gate: access.filter((t) => t.kind === 'gate').length, barrier: access.filter((t) => t.kind === 'barrier').length,
    flare: 'props' in map ? flareTemplates(map as LoadedMap, (map as LoadedMap).archive).length : 0,
    sound: scriptSoundsOf(programsOf(map)).length, effect: scriptEffectsOf(programsOf(map)).length,
    ambient: 'meta' in map ? ambientProgramsOf(map as LoadedMap).length : 0 };
}

/** A map's mission programs (`MapMeta.scene.programs`), none on a map built by hand. */
const programsOf = (map: object): EffectProgram[] => ('meta' in map ? ((map as LoadedMap).meta?.scene?.programs ?? []).map((p) => p.program) : []);

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
    // A damage trigger by what sets it off (`./placedAccess` `accessTriggerOf`): a C4 barrier, or a hit trigger (a plank).
    barrier: access.filter((t) => t.kind === 'barrier').map((t) => [t.name, `${t.name} \u00b7 ${accessTriggerOf(t) === 'c4' ? 'C4 barrier' : 'hit trigger'} \u00b7 ${t.pieces.length} parts`] as const),
    // A map's flares (`./placedFlares`): its facade nodes alone, by node name, each with the model it hangs on.
    flare: flareTemplates(map, stem).map((t) => [t.name, `${t.name} \u00b7 ${t.prop.modelName}`] as const),
    // The sounds and effects a switch's script may play from it (`./scriptAssets`), by name.
    sound: scriptSoundsOf(programsOf(map)).map((n) => [n, n] as const),
    effect: scriptEffectsOf(programsOf(map)).map((n) => [n, n] as const),
    // Its ambient effects (`./forgeObjects`): each by name, its label what it does and where it sits on its own map.
    ambient: ambientProgramsOf(map).map((a) => [a.name, `${a.name} · ${[a.particles ? 'particles' : '', a.sound ? 'sound' : '', a.light ? 'light' : ''].filter(Boolean).join(' + ')} · ${a.root ?? 'whole map'}`] as const),
  };
}

/** The census of a map's copies: how many of each. */
export function censusOfCopies(c: MapCopies): MapCensus {
  return { door: c.door.length, turret: c.turret.length, hostage: c.hostage.length, ladder: c.ladder.length, gate: c.gate.length, barrier: c.barrier.length, flare: c.flare.length, sound: c.sound.length, effect: c.effect.length, ambient: c.ambient.length };
}

/** Each kind's word, one and many, as a Map choice counts it. */
const COPY_WORDS: Readonly<Record<CopyKind, readonly [string, string]>> = {
  door: ['door', 'doors'], turret: ['turret', 'turrets'], hostage: ['hostage character', 'hostage characters'], ladder: ['ladder', 'ladders'],
  gate: ['gate', 'gates'], barrier: ['damage trigger', 'damage triggers'], flare: ['flare', 'flares'],
  sound: ['sound', 'sounds'], effect: ['effect', 'effects'], ambient: ['ambient effect', 'ambient effects'],
};

/**
 * The Map choice's options (the owner, 2026-11-10: "I want every asset from every map available at all times"): every
 * map, always, in the order given, each labelled with what it has of `kind` -- its count once read, "counting…" until
 * then (a choice still: its list is read when chosen) -- and one counted with none greyed (the Inspector's third
 * element), unless it is the current choice, which is never greyed so the select shows it.
 */
export function censusOptions(maps: readonly (readonly [string, string])[], known: (stem: string) => MapCensus | null,
  kind: CopyKind, current: string): (readonly [string, string, boolean])[] {
  const [one, many] = COPY_WORDS[kind];
  return maps.map(([stem, label]) => {
    const c = known(stem);
    if (!c) return [stem, `${label} · counting…`, false] as const;
    const n = c[kind] ?? 0;
    return [stem, `${label} · ${n === 0 ? 'none' : `${n} ${n === 1 ? one : many}`}`, n === 0 && stem !== current] as const;
  });
}

/**
 * The ladder a new placement is where the palette's archive has none (a browser adaptation, FG.R2, as `DEFAULT_DOOR`):
 * Sandstorm's `ladder35`, its own hull a ladder's (`test/forge/mapCensus.test.ts` reads it off the disc).
 */
export const DEFAULT_LADDER = { source: 'MP73', name: 'ladder35' } as const;
