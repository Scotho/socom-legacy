import { BOMB_SITE_REACH, type BombObjectives, type BombSite, type ForgeGameType, type ForgeObjectives } from './layout';
import type { BombMarkerKind } from './pieces';

/**
 * FG-51's editor (a browser adaptation, no original): the bomb markers as the page keeps them, between a layout's bomb
 * (`page.ts` `placeAll` puts them in the scene) and the layout it saves (`layoutNow`). Pure -- no three, no DOM -- so the
 * round trip a player makes (lock, save, reload, unlock) is held by a unit test (`bombMarkers.test.ts`).
 *
 * A marker's lock is the marker's own (`forgeLock`, FG-49), never a kept key of the block: `bombRestOf` drops
 * `startLocked` with `start` and `sites`, so an unlock sticks (the review of b46b88328, its medium finding). A site read
 * from a file keeps the file's own `range`, `elevation` and unknown keys; a site placed in the editor takes the disc's
 * reach (`BOMB_SITE_REACH`, research 173 s2).
 */

/** One bomb marker as the page holds it. */
export interface BombMarkerState {
  kind: BombMarkerKind;
  at: [number, number, number];
  yaw: number;
  locked: boolean;
  /** A site's own reach, as its file named it. Absent on a marker placed in the editor: `BOMB_SITE_REACH`. */
  range?: number;
  elevation?: number;
  /** A site's keys this editor does not edit, kept so a save does not drop them. */
  rest?: Record<string, unknown>;
}

const SITE_KEYS = ['team', 'at', 'yaw', 'range', 'elevation', 'locked'];
const restOf = (o: object, drop: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!drop.includes(k)) out[k] = v;
  return out;
};

/** The markers a layout's bomb places: the start (if any), then each site in the file's order. */
export function markersOfBomb(bomb: BombObjectives | undefined): BombMarkerState[] {
  if (!bomb) return [];
  const out: BombMarkerState[] = [];
  if (bomb.start) out.push({ kind: 'start', at: [bomb.start[0], bomb.start[1], bomb.start[2]], yaw: 0, locked: bomb.startLocked === true });
  for (const site of bomb.sites) {
    const rest = restOf(site, SITE_KEYS);
    out.push({
      kind: site.team === 0 ? 'seal' : 'terrorist', at: [site.at[0], site.at[1], site.at[2]], yaw: site.yaw, locked: site.locked === true,
      range: site.range, elevation: site.elevation, ...(Object.keys(rest).length ? { rest } : {}),
    });
  }
  return out;
}

/** An opened bomb block's keys this editor does not edit (`bases`, ...): never the start, its lock or the sites. */
export function bombRestOf(bomb: BombObjectives | undefined): Record<string, unknown> {
  return bomb ? restOf(bomb, ['start', 'startLocked', 'sites']) : {};
}

/** The layout's bomb from the markers, the kept keys first, or undefined with no marker. */
export function bombOfMarkerStates(markers: readonly BombMarkerState[], rest: Record<string, unknown>): BombObjectives | undefined {
  if (!markers.length) return undefined;
  const start = markers.find((m) => m.kind === 'start');
  const sites = markers.filter((m) => m.kind !== 'start').map((m): BombSite => Object.assign(
    {}, m.rest ?? {},
    {
      team: (m.kind === 'seal' ? 0 : 1) as 0 | 1, at: [m.at[0], m.at[1], m.at[2]] as [number, number, number], yaw: m.yaw,
      range: m.range ?? BOMB_SITE_REACH, elevation: m.elevation ?? BOMB_SITE_REACH,
    },
    m.locked ? { locked: true as const } : {},
  ));
  return Object.assign(
    {}, rest,
    start ? { start: [start.at[0], start.at[1], start.at[2]] as [number, number, number], ...(start.locked ? { startLocked: true as const } : {}) } : {},
    { sites },
  ) as BombObjectives;
}

/**
 * The layout's objectives block: the kept keys whenever there are any (layout.ts: a save does not drop them), the type
 * when one is named (L1: "Map's own" writes none), the bomb when a marker is placed; undefined when all are absent.
 */
export function layoutObjectivesOf(type: ForgeGameType | null, bomb: BombObjectives | undefined, rest: Record<string, unknown>): ForgeObjectives | undefined {
  if (type === null && !bomb && !Object.keys(rest).length) return undefined;
  return Object.assign({}, rest, type !== null ? { gameType: type } : {}, bomb ? { bomb } : {}) as ForgeObjectives;
}
