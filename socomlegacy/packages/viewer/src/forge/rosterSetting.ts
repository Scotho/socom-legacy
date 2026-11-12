import type { CharacterKit, Side } from '@s2u/scene';
import type { LoadedBody } from '../body';
import type { LoadedMap } from '../loadMap';
import type { CharacterRoster, RosterPick } from './layout';

/**
 * The layout's character roster (`settings.characters`, `@s2u/creator-contracts` `CharacterRoster`; the owner,
 * 2026-11-10: "allow which characters the map can pick. Some maps use different player models"). A browser adaptation
 * (FG.R2, as a placed hostage's lent body, `./hostages` `withLentHostageBodies`): the original fixes each map's ARMORY
 * columns -- `READERM.ZAR/chartype.rdr`'s `navyseals` and `terrorists` (research 95 §6) -- and here a layout names them
 * from any disc MP map's, on the same side. Nothing of a type is invented: each column is that map's `types[side][i]`
 * body (`../loadMap` `typeBodies`) and its `arsenal.map.kits[side][i]` kit (`character.rdr` `default_weapons`,
 * `@s2u/scene` `mapKits`, one table every map shares, research 94 §A4).
 *
 * What reads the result: the page's room (its kits, `armoryTypeAllowed`'s columns, the bots' kits) and the match's bodies
 * (`../teamBody` `bodyForTeam`, `hitBodiesOfPage`, both by `types[side][i]`). The layout's arsenal applies after it
 * (`./arsenalSetting`), so its kit picks reach a lent type's kit too.
 *
 * Not carried: the lobby's ARMORY columns' portraits and captions (the base map's `EMnn` library and `UiVars`), and the
 * match server's rooms (its `forgeSimMap.ts`, outside this repository) -- both keep the map's own roster.
 */
export type RosterMap = Pick<LoadedMap, 'archive' | 'textures' | 'textureFlags'> & Partial<Pick<LoadedMap, 'textureMips' | 'types' | 'arsenal'>>;

export const EMPTY_ROSTER: CharacterRoster = Object.freeze({ seal: [], terrorist: [] }) as unknown as CharacterRoster;
export const ROSTER_SIDES: readonly Side[] = ['seal', 'terrorist'];
const SIDE_WORD: Readonly<Record<Side, string>> = { seal: 'SEAL', terrorist: 'Terrorist' };

export const rosterIsEmpty = (r: CharacterRoster | null | undefined): boolean => !r || (r.seal.length === 0 && r.terrorist.length === 0);

/** The disc maps a roster lends from, each once, in the order first named. */
export const rosterStems = (r: CharacterRoster | null | undefined): string[] =>
  [...new Set(r ? [...r.seal, ...r.terrorist].map((p) => p.map) : [])];

/** A body from `lib`, its textures (and fittings') named `<archive>/<name>` and copied into `into` (`./hostages`' way). */
function lentBody(body: LoadedBody, lib: RosterMap, into: { textures: Record<string, unknown>; textureFlags: Record<string, unknown>; textureMips?: Record<string, unknown> }): LoadedBody {
  const named = (name: string | null): string | null => {
    if (name === null) return null;
    const key = `${lib.archive}/${name}`;
    if (lib.textures[name]) into.textures[key] = lib.textures[name];
    if (lib.textureFlags[name] !== undefined) into.textureFlags[key] = lib.textureFlags[name];
    if (into.textureMips && lib.textureMips?.[name]) into.textureMips[key] = lib.textureMips[name];
    return key;
  };
  return {
    ...body,
    subMeshes: body.subMeshes.map((s) => ({ ...s, textureName: named(s.textureName) })),
    fittings: body.fittings.map((f) => ({ ...f, meshes: f.meshes.map((m) => ({ ...m, textureName: named(m.textureName) })) })),
  };
}

/**
 * `map` with the roster's columns for its types and kits: each side named, its columns in order, each body lent from its
 * map (the map's own as it is) and its kit that map's. A column whose map is not there (`libOf` null) or has no such
 * type is left out and named; a side left with no column keeps the map's own.
 */
export function withRoster<T extends RosterMap>(map: T, roster: CharacterRoster | null | undefined, libOf: (stem: string) => RosterMap | null): { map: T; refused: string[] } {
  if (rosterIsEmpty(roster)) return { map, refused: [] };
  const refused: string[] = [];
  const into = { textures: { ...map.textures } as Record<string, unknown>, textureFlags: { ...map.textureFlags } as Record<string, unknown>,
    ...(map.textureMips ? { textureMips: { ...map.textureMips } as Record<string, unknown> } : {}) };
  const types = { seal: map.types?.seal ?? [], terrorist: map.types?.terrorist ?? [], ...(map.types?.escortees ? { escortees: map.types.escortees } : {}) };
  const ownKits = map.arsenal?.map?.kits;
  const kits: Record<Side, readonly CharacterKit[]> | null = ownKits ? { seal: ownKits.seal, terrorist: ownKits.terrorist } : null;
  let lent = false;
  for (const side of ROSTER_SIDES) {
    const picks = roster![side];
    if (picks.length === 0) continue;
    const bodies: (LoadedBody | null)[] = [], sideKits: CharacterKit[] = [];
    picks.forEach((p, column) => {
      const at = `${SIDE_WORD[side]} ${column + 1}`;
      const lib = p.map === map.archive ? map : libOf(p.map);
      if (!lib) { refused.push(`${at}: ${p.map} would not load`); return; }
      const body = lib.types?.[side][p.index] ?? null;
      const kit = lib.arsenal?.map?.kits[side][p.index] ?? null;
      if (!body && !kit) { refused.push(`${at}: ${p.map} has no ${SIDE_WORD[side]} type ${p.index + 1}`); return; }
      bodies.push(body && lib !== map ? lentBody(body, lib, into) : body);
      if (kit) sideKits.push(kit);
    });
    if (bodies.length === 0) continue;
    lent = true;
    types[side] = bodies;
    if (kits && sideKits.length === bodies.length) kits[side] = sideKits;
    else if (kits) refused.push(`${SIDE_WORD[side]}: a column's map has no kits, so the side keeps the map's own kits`);
  }
  if (!lent) return { map, refused };
  const arsenal = map.arsenal && kits && map.arsenal.map ? { ...map.arsenal, map: { ...map.arsenal.map, kits } } : map.arsenal;
  return { map: { ...map, ...into, types, ...(arsenal ? { arsenal } : {}) } as T, refused };
}

/** A side's columns as played: the roster's, else the map's own (`home`'s first `homeCount` types). */
export function rosterColumns(r: CharacterRoster | null | undefined, side: Side, home: string, homeCount: number): RosterPick[] {
  const own = r?.[side] ?? [];
  return own.length ? own : Array.from({ length: Math.min(4, homeCount) }, (_, index) => ({ map: home, index }));
}

/**
 * A side's column `column` set (or dropped: null; the first column is never dropped), the side then written whole --
 * from the map's own when it named none. A roster that comes back to the map's own on both sides is no setting (null).
 */
export function setRosterColumn(r: CharacterRoster | null | undefined, side: Side, column: number, pick: RosterPick | null, home: string, homeCount: number): CharacterRoster | null {
  const cols = [...rosterColumns(r, side, home, homeCount)];
  if (pick === null) {
    if (column === 0) return r ?? null;
    cols.splice(column, 1);
  } else if (column >= cols.length) cols.push(pick);
  else cols[column] = pick;
  const own = rosterColumns(null, side, home, homeCount);
  const same = cols.length === own.length && cols.every((c, i) => c.map === own[i]!.map && c.index === own[i]!.index);
  const next: CharacterRoster = { ...(r ?? EMPTY_ROSTER), [side]: same ? [] : cols.slice(0, 4) };
  return rosterIsEmpty(next) ? null : next;
}

/** The types a map offers a side, for the panel: each index and its words (`SEAL 2 · <character>`). */
export function rosterChoices(lib: RosterMap, side: Side): { index: number; label: string }[] {
  const n = Math.max(lib.types?.[side].length ?? 0, lib.arsenal?.map?.kits[side].length ?? 0);
  return Array.from({ length: Math.min(4, n) }, (_, index) => {
    const character = lib.types?.[side][index]?.character ?? lib.arsenal?.map?.kits[side][index]?.character ?? null;
    return { index, label: `${SIDE_WORD[side]} ${index + 1}${character ? ` · ${character}` : ''}` };
  });
}
