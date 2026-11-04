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
}

const stemOfMap = (map: ObjectiveMap): string => (map.stem ?? (map.path ? stemOf(map.path) : '')).toUpperCase();

/** A demolition bomb the match can run: a start and at least one site for each planting team. */
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
    case 1: return map.bombStart && plantSite('seal', map.meta?.actions ?? []) ? null : 'Breach needs the base\'s bomb start and the SEALs\' site';
    case 2: return bombReady(objectives?.bomb) ? null : 'Demolition needs a start and one site for each team';
    case 3: {
      if (!map.escortees?.length) return 'Escort needs the base\'s escortees';
      const stem = stemOfMap(map);
      return escortScriptOf(stem) !== ESCORT_UNREAD_MAP_PLACEHOLDER ? null : 'Escort plays only on an escort map';
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
  if (objectives.gameType !== 2 || !bomb?.start) return next;
  const kept = (map.meta?.actions ?? []).filter((a) => a.typeCode !== ACTION_TYPE_CODES['MPBOMB']);
  const actions = [...kept, ...forgeBombActions(bomb)];
  const meta = map.meta ? { ...map.meta, actions } : { ...bareMeta(map.stem ?? ''), actions };
  return { ...next, meta, bombStart: [bomb.start[0], bomb.start[1], bomb.start[2]] };
}
