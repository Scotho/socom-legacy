import { aiCellIndex, aiCellOf, aiCellY, HOSTAGE_FACING_READING, HOSTAGE_START_LIFT_READING, type AiMaps, type EscorteeStart } from '@s2u/scene';
import type { LoadedBody } from '../body';
import type { LoadedMap } from '../loadMap';
import type { HostageMarker } from './layout';
import { HOSTAGE_SLOTS } from '../../../match/src/extraction';

/**
 * The layout's placed hostages (`Layout.hostages`; a browser adaptation, FG.R2, no original): the Forge's own escortees,
 * added to the base map's for an Escort or Extraction match. The most basic form for now (the owner, 2026-11-05): each
 * takes the map's first escortee's character and team mask, and stands on the AI grid's cell under it -- a hostage's
 * start is a cell in the original (`placeEscortees`: a named point's cell, its height plus the start lift), the cell the
 * extraction zones test (`ExtractionAuthority`). Its facing is the reading's (`HOSTAGE_FACING_READING`), as every disc
 * escortee's: the marker's own yaw is not read yet.
 */

/** The first free name in the disc's own pattern -- Hostage1, Hostage2 (Desert Glory's) -- against `taken` (case-blind). */
export function nextHostageName(taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++) if (!used.has(`hostage${n}`)) return `Hostage${n}`;
}

/** The game types a placed hostage plays in: ESCORT (3) and EXTRACTION (4), the room's escortee types (`ExtractionAuthority.of`). */
export function hostagesPlayIn(gameType: number | undefined): boolean {
  return gameType === 3 || gameType === 4;
}

type HostageCell = { loc: { map: number; x: number; z: number }; y: number };

/**
 * Where the placed hostages stand on `ai` beside `own` escortees of the map's (a browser adaptation, FG.R2): each on the
 * stored cell under its (x, z) whose floor is nearest its height, across the AI map's sub-maps. One with no cell under it
 * (or every one, with no AI map) is off the grid (`offGrid`); one past the room's `HOSTAGE_SLOTS` (16), the map's own
 * counted first, is past the bound (`pastBound`) -- a hostage's body id is `HOSTAGE_ID_BASE` + its index, a u8. One
 * reading for Play (`withPlacedHostages`) and Check (`./validate` `checkMap`), so the two agree.
 */
export function placedHostageFit(ai: AiMaps | undefined, own: number, placed: readonly HostageMarker[]):
  { fit: { h: HostageMarker; cell: HostageCell }[]; offGrid: number; pastBound: number } {
  const fit: { h: HostageMarker; cell: HostageCell }[] = [];
  let offGrid = 0, pastBound = 0;
  const room = HOSTAGE_SLOTS - own;
  for (const h of placed) {
    let best: HostageCell | null = null;
    for (const sub of ai?.maps ?? []) {
      const loc = aiCellOf(sub, h.p[0], h.p[2]);
      if (!loc) continue;
      const i = aiCellIndex(sub, loc.x, loc.z);
      if (i < 0) continue;
      const y = aiCellY(sub, sub.cells[i]!);
      if (!best || Math.abs(y - h.p[1]) < Math.abs(best.y - h.p[1])) best = { loc, y };
    }
    if (!best) offGrid++;
    else if (fit.length >= room) pastBound++;
    else fit.push({ h, cell: best });
  }
  return { fit, offGrid, pastBound };
}

/**
 * `map` with the placed hostages after its own escortees (the character `lent`, the map's first by default), where
 * `placedHostageFit` stands them. Each left out is counted (`unplaced`), and apart: off the AI grid (`offGrid`; every one
 * on a map with no escortee to copy counts there, as the page has always said it) and past the room's 16 (`pastBound`).
 */
export function withPlacedHostages<T extends { ai?: AiMaps; escortees?: EscorteeStart[] }>(
  map: T, placed: readonly HostageMarker[], lent: EscorteeStart | undefined = map.escortees?.[0],
): { map: T; unplaced: number; offGrid: number; pastBound: number } {
  // The character copied: the map's first escortee's, or one lent (a blank floor: its library's, `blankFloorOf` drops them).
  const model = lent;
  if (!placed.length) return { map, unplaced: 0, offGrid: 0, pastBound: 0 };
  if (!model || !map.ai) return { map, unplaced: placed.length, offGrid: placed.length, pastBound: 0 };
  const { fit, offGrid, pastBound } = placedHostageFit(map.ai, map.escortees?.length ?? 0, placed);
  const added = fit.map(({ h, cell }, i): EscorteeStart => ({
    // Its own name and character where it names them (`HostageMarker`); else the match's name and the lent character.
    name: h.name ?? `forge_hostage_${i + 1}`, character: h.character ?? model.character, loc: cell.loc,
    at: [h.p[0], cell.y + HOSTAGE_START_LIFT_READING, h.p[2]], yaw: HOSTAGE_FACING_READING, team: model.team,
  }));
  return { map: { ...map, escortees: [...(map.escortees ?? []), ...added] }, unplaced: offGrid + pastBound, offGrid, pastBound };
}

/**
 * FP-1a fold F5: the placed hostages as a match wears them -- one that names a body from another map (`source`) whose
 * character is not among `worn` (the characters the match holds a body for: the base's own and those lent,
 * `withLentHostageBodies`) drops its source and character, so it wears the lent default as one naming none does
 * (`withPlacedHostages`). One rule for the page's Play (`./page` `composeForMatch`, which strips so after its lending,
 * written inline there) and the lobby's room (`match/src/forgeSimMap.ts`), so the character the room tells the pages
 * (`HostageWire.character`) is one their composed map draws. Absent: absent.
 */
export function drawableHostages(placed: readonly HostageMarker[] | undefined, worn: ReadonlySet<string>): HostageMarker[] | undefined {
  return placed?.map((h) => (h.source && !worn.has(h.character ?? '') ? (({ source: _s, character: _c, ...rest }) => rest)(h) : h));
}

/** Play's notice for the placed hostages left out (a browser adaptation, FG.R2): each case in its own words. */
export function hostagesLeftNotes(offGrid: number, pastBound: number): string[] {
  const n = (k: number): string => `${k} hostage${k === 1 ? '' : 's'}`;
  return [
    ...(offGrid ? [`${n(offGrid)} off the AI grid, left out`] : []),
    ...(pastBound ? [`${n(pastBound)} past the room's ${HOSTAGE_SLOTS}, left out`] : []),
  ];
}

/** What lending a hostage body reads and writes: a map's archive, its textures and its escortee bodies. */
type BodyMap = Pick<LoadedMap, 'archive' | 'textures' | 'textureFlags' | 'textureMips' | 'types'>;

/** A map's hostage characters: its escortee bodies' (`types.escortees`, `chartype.rdr`'s `escortees` in order), each once. */
export function hostageCharactersOf(map: Pick<LoadedMap, 'types'> | null | undefined): string[] {
  return [...new Set((map?.types?.escortees ?? []).flatMap((b) => (b?.character ? [b.character] : [])))];
}

/**
 * `map` with the bodies its placed hostages borrow from other disc maps (`HostageMarker.source`; a browser adaptation,
 * FG.R2, no original): each named character's escortee body off its map, added to `types.escortees` -- where a hostage's
 * body is found by its character (`../teamBody` `escorteeBody`, the room's hit volumes alike) -- once, unless the map
 * already has it. A body from another archive draws its textures under `<archive>/<name>`, copied beside the map's, so
 * one is never taken for the map's own of the same name. One whose map or character is not there is counted (`missing`).
 */
export function withLentHostageBodies<T extends BodyMap>(map: T, placed: readonly HostageMarker[] | undefined,
  libOf: (stem: string) => BodyMap | null): { map: T; missing: number } {
  let missing = 0;
  const added: LoadedBody[] = [];
  const has = new Set(hostageCharactersOf(map));
  const textures = { ...map.textures }, textureFlags = { ...map.textureFlags };
  const textureMips = map.textureMips ? { ...map.textureMips } : undefined;
  for (const h of placed ?? []) {
    if (!h.source || !h.character || has.has(h.character)) continue;
    const lib = libOf(h.source);
    const body = lib?.types?.escortees?.find((b) => b?.character === h.character);
    if (!lib || !body) { missing++; continue; }
    has.add(h.character);
    if (lib.archive === map.archive) { added.push(body); continue; }
    const named = (name: string | null): string | null => {
      if (name === null) return null;
      const key = `${lib.archive}/${name}`;
      if (lib.textures[name]) textures[key] = lib.textures[name]!;
      if (lib.textureFlags[name] !== undefined) textureFlags[key] = lib.textureFlags[name]!;
      if (textureMips && lib.textureMips?.[name]) textureMips[key] = lib.textureMips[name]!;
      return key;
    };
    added.push({
      ...body,
      subMeshes: body.subMeshes.map((s) => ({ ...s, textureName: named(s.textureName) })),
      fittings: body.fittings.map((f) => ({ ...f, meshes: f.meshes.map((m) => ({ ...m, textureName: named(m.textureName) })) })),
    });
  }
  if (!added.length) return { map, missing };
  const types = { seal: map.types?.seal ?? [], terrorist: map.types?.terrorist ?? [], escortees: [...(map.types?.escortees ?? []), ...added] };
  return { map: { ...map, types, textures, textureFlags, ...(textureMips ? { textureMips } : {}) }, missing };
}

/**
 * The hostage character a new placement wears where the base has none of its own (a browser adaptation, FG.R2, as
 * `../agent/commands` `DEFAULT_DOOR`): Desert Glory's first escortee, `mp_fem1` (MP6's `chartype.rdr` `escortees`, read
 * off the disc in `test/forge/hostages.test.ts`), lent with its body.
 */
export const DEFAULT_HOSTAGE = { source: 'MP6', character: 'mp_fem1' } as const;

/** A new hostage's character: none named where the base has hostages (it wears their first); else the default, lent. */
export function hostageDefault(homeCharacters: readonly string[], absent: (stem: string) => boolean): { source?: string; character?: string } {
  return homeCharacters.length || absent(DEFAULT_HOSTAGE.source) ? {} : { ...DEFAULT_HOSTAGE };
}
