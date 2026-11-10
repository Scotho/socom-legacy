import { ESCORT_UNREAD_MAP_PLACEHOLDER, escortScriptOf } from '../../../match/src/extraction';
import { ACTION_TYPE_CODES, type MapAction } from '../mapActions';
import { plantSite } from '../net/objective';
import { stemOf } from '../simMap';
import { bareMeta } from '../worldState';
import { type BombObjectives, type ForgeObjectives } from './layout';

/**
 * FG-51: a layout's bomb on a room's map (a browser adaptation, no original). Headless -- the match server imports it
 * (no three.js). The page's Play composes through the same function, so the two cannot drift.
 *
 * A generated site is not a scene node. `atPlantSite` already hands `actionAtPick` a pick whose path is the site's own
 * path and whose point is the authored place, and `actionAtPick` then tests that point against the feet (range and
 * elevation, both strict). It does not raycast the world, so a hidden DI owner -- the disc's `seal_tent` /
 * `terrorist_tent`, which exist so a reticle pick can land on them -- would not be what the room's plant uses. It
 * would only be a solid the player can bump. The smaller correct record is a `MapAction` with its own path.
 */

/** The layout's sites as MPBOMB records. `team` is who plants (0 SEAL, 1 terrorist); `plantSite` reads it on `forge/site_` paths only. */
export function forgeBombActions(bomb: BombObjectives): MapAction[] {
  return bomb.sites.map((site, i) => ({
    node: `forge_site_${i}`, type: 'MPBOMB', typeCode: ACTION_TYPE_CODES['MPBOMB']!, valve: `forge_bomb_${site.team}`,
    anims: ['BombPlace'], team: site.team, range: site.range, elevation: site.elevation, points: 0, bitmap: '',
    path: `forge/site_${i}`, at: [site.at[0], site.at[1], site.at[2]],
  }));
}

/** A map `applyForgeObjectives` can retarget, and what the room's own tests read of it (`forgeTypeUnplayable`). */
export interface ObjectiveMap {
  gameType?: number;
  bombStart?: [number, number, number];
  meta?: { actions: MapAction[] };
  /** The room's map names its stem (`SimMap.stem`); the page's (`LoadedMap`) its `path`, as `simMapOfLoaded` reads it. */
  stem?: string;
  path?: string;
  /** Present on a map base. A blank floor arrives without them (`forgeSimMap` drops the library's). */
  escortees?: readonly unknown[];
  /**
   * The layout's placed escort zones' names (`Layout.extractionZones`; a browser adaptation, FG.R2), set by the page:
   * where no escort script is read, a layout placing Safety plays ESCORT by the room's placeholder script.
   */
  forgeEscortZones?: readonly string[];
}

const stemOfMap = (map: ObjectiveMap): string => (map.stem ?? (map.path ? stemOf(map.path) : '')).toUpperCase();

/** A demolition bomb the match can run: a start and at least one site for each planting team. */
/**
 * BREACH from the layout's own markers (the owner, 2026-11-06; a browser adaptation, FG.R2 -- untested against a run):
 * the room's BREACH reads StartBomb and the SEALs' site (`BombAuthority.of`, research 174 s2), so a layout's bomb start
 * and a SEALs' site (team 0) stand for them where the base has none (a blank floor). The Terrorists' site plays no part.
 */
export function breachReady(bomb: BombObjectives | undefined): boolean {
  return !!bomb?.start && bomb.sites.some((s) => s.team === 0);
}

/**
 * Whether a bomb marker of `kind` plays under `gameType` (the owner, 2026-11-05/06; a browser adaptation, FG.R2): all
 * three in Demolition (2); in Breach (1) the start and the SEALs' site (`breachReady`), never the Terrorists' site; under
 * any other type, or none, nothing. One predicate for the page's bomb tools and the agent's `bomb.place`.
 */
export function bombMarkerPlaysIn(kind: 'start' | 'seal' | 'terrorist', gameType: number | null | undefined): boolean {
  return gameType === 2 || (gameType === 1 && kind !== 'terrorist');
}

export function bombReady(bomb: BombObjectives | undefined): boolean {
  if (!bomb?.start) return false;
  let seal = false;
  let terrorist = false;
  for (const site of bomb.sites) {
    if (site.team === 0) seal = true;
    else if (site.team === 1) terrorist = true;
  }
  return seal && terrorist;
}

/**
 * Why the room would not run the named type's own rule on `map` (the composed map, before the layout's objectives),
 * or null when it would. One rule for the room's compose (`applyForgeObjectives`), the page's Play and its type picker
 * (FG-51; the merge controller's rulings, 2026-10-22). Each case is the room's own test, read, not a new one:
 * - 1 BREACH: `BombAuthority.of` (match `bomb.ts`; LATER 149, research 174 §2): StartBomb and the SEALs' site
 *   (`plantSite('seal')`, the `terrorist_tent`). A layout adds neither for BREACH (its bomb markers are Demolition's).
 * - 2 DEMOLITION: the layout's bomb ready (`bombReady`). `applyForgeObjectives` then puts its start and its two sites on
 *   the map, which `BombAuthority.of`'s type-2 test reads (`forgeBomb.test.ts` holds the two agreeing).
 * - 3 ESCORT: escortees (`ExtractionAuthority.of`) and the map's own escort script read -- the room's own choice,
 *   `escortScriptOf` (MP52, MP53, MP82: `ESCORT_ZONES_READING`, `ESCORT_COUNTDOWN_READING`). Anywhere else the room
 *   would play `ESCORT_UNREAD_MAP_PLACEHOLDER`, which is not a game value.
 * - 4 EXTRACTION: escortees (`ExtractionAuthority.of`), on any base; every map that has them has kind-1 zones
 *   (research 175 §5).
 * - 5 SUPPRESSION: no objective to test.
 * The words are the page's (a browser adaptation): its status line and the picker's tooltip show them.
 */
export function forgeTypeUnplayable(gameType: number, objectives: ForgeObjectives | undefined, map: ObjectiveMap): string | null {
  switch (gameType) {
    case 1: return (map.bombStart && plantSite('seal', map.meta?.actions ?? [])) || breachReady(objectives?.bomb) ? null
      : 'Breach needs a bomb start and the SEALs\' site: the base\'s, or placed (Bomb, Site SEAL)';
    case 2: return bombReady(objectives?.bomb) ? null : 'Demolition needs a start and one site for each team';
    case 3: {
      if (!map.escortees?.length) return 'Escort needs the base\'s escortees';
      const stem = stemOfMap(map);
      if (escortScriptOf(stem) !== ESCORT_UNREAD_MAP_PLACEHOLDER) return null;
      // The owner (2026-11-06; a browser adaptation): a layout placing its own escort zones plays the room's placeholder
      // script (`ESCORT_UNREAD_MAP_PLACEHOLDER`: the 30 s wait, Safety and Safety2 by name) -- with three VIPs, as
      // SEALcheck counts (`sealCheck`), and a Safety to stage in. A base alone, none of its own: M2's refusal. H424 (c):
      // the owner's to answer; the default meanwhile (FP.R6) -- only where the layout places its own zones, so a Forge
      // layout's own Play, never a disc map played unchanged.
      if (!map.forgeEscortZones?.length) return 'Escort plays only on an escort map';
      if (map.escortees.length !== 3) return `Escort needs three hostages (the VIPs): it has ${map.escortees.length}`;
      return map.forgeEscortZones.some((n) => n.toLowerCase() === 'safety') ? null : 'Escort needs a zone named Safety';
    }
    case 4: return map.escortees?.length ? null : 'Extraction needs the base\'s escortees';
    case 5: return null;
    default: return 'not a game type';
  }
}

/** `forgeTypeUnplayable` as a yes or no. */
export function forgeTypePlayable(gameType: number, objectives: ForgeObjectives | undefined, map: ObjectiveMap): boolean {
  return forgeTypeUnplayable(gameType, objectives, map) === null;
}

/**
 * A blank floor's map from its library's (a browser adaptation, FG.R2; the owner, 2026-11-05: "the blank map has no
 * predefined game mode or map data"): the library lends its archive (the palette, the characters, the kits, the light),
 * never its map -- so no game type, no StartBomb, no context action (doors, switches, plant sites), no AI map (its grid,
 * zones and named points), no tactical map, no spectator view, no slot, respawn, door, gate, crane, turret or escortee.
 * All of those stand at the library map's own places, off the floor.
 */
export function blankFloorOf<T extends ObjectiveMap>(map: T): T {
  const { gameType: _type, bombStart: _start, ai: _ai, ...rest } = map as T & { ai?: unknown };
  return {
    ...rest, ...(map.meta ? { meta: { ...map.meta, actions: [] } } : {}),
    escortees: [], scenicViews: [], gates: [], cranes: [], doors: [], turrets: [], slots: [], respawns: [], tac: null,
  } as unknown as T;
}

/**
 * `map` with no bomb of its own: no StartBomb and no MPBOMB site record, its other actions kept. A blank floor's map
 * (a browser adaptation, FG.R2): the library lends its archive, not its world, so its StartBomb and its plant sites --
 * at that map's own places, off the floor -- go with its spawn slots and escortees, and the layout's bomb is the only one.
 */
export function withoutBaseBomb<T extends ObjectiveMap>(map: T): T {
  const { bombStart: _dropped, ...rest } = map;
  const actions = (map.meta?.actions ?? []).filter((a) => a.typeCode !== ACTION_TYPE_CODES['MPBOMB']);
  return (map.meta ? { ...rest, meta: { ...map.meta, actions } } : rest) as T;
}

/**
 * The layout's objectives on `map`, when the map can play the named type (`forgeTypeUnplayable`). No block, a block
 * naming no type ("Map's own", L1: its bomb markers kept in the file, played by nothing), or a type the map cannot
 * play: `map` itself, so a disc map's type, MPBOMB records and StartBomb stay. Demolition that can play replaces those
 * records with the layout's sites and sets StartBomb to the layout's start. Any other playable type sets `gameType`
 * and leaves the bomb records alone.
 */
export function applyForgeObjectives<T extends ObjectiveMap>(map: T, objectives: ForgeObjectives | undefined): T {
  if (objectives?.gameType === undefined) return map;
  if (!forgeTypePlayable(objectives.gameType, objectives, map)) return map;
  const next: T = { ...map, gameType: objectives.gameType };
  const bomb = objectives.bomb;
  // DEMOLITION plays the layout's bomb; BREACH too where the layout places its start and the SEALs' site (`breachReady`),
  // else the base's own.
  const own = objectives.gameType === 2 ? !!bomb?.start : objectives.gameType === 1 && breachReady(bomb);
  if (!own || !bomb?.start) return next;
  const kept = (map.meta?.actions ?? []).filter((a) => a.typeCode !== ACTION_TYPE_CODES['MPBOMB']);
  const actions = [...kept, ...forgeBombActions(bomb)];
  const meta = map.meta ? { ...map.meta, actions } : { ...bareMeta(map.stem ?? ''), actions };
  return { ...next, meta, bombStart: [bomb.start[0], bomb.start[1], bomb.start[2]] };
}
