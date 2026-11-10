import type { EscorteeStart } from '@s2u/scene';
import type { GroundData } from '../mover';
import type { LoadedMap } from '../loadMap';
import type { ContentResolver } from '../packs/content/collision';
import { hostageCharactersOf, withLentHostageBodies } from './hostages';
import type { BombSite, Layout, LayoutSettings, NpcMarker } from './layout';
import { composeMatchMap } from './matchMap';
import { breachReady } from './objectives';
import { withLayoutEnvironment } from './ownEnvironment';
import { withPlacedAccess, type AccessTemplate } from './placedAccess';
import { withPlacedDoors, type DoorTemplate } from './placedDoors';
import { withPlacedFlares, type FlareTemplate } from './placedFlares';
import { withPlacedPoints, withPlacedViews } from './placedPoints';
import { playObjectives } from './playObjectives';
import { withSiteOutlines } from './siteOutlines';
import type { skyDomeFor } from './skyDome';
import { withPlacedTurrets, type TurretTemplate } from './turrets';

/**
 * The pure chain Play composes a layout's match map by (`./page` `composeForMatch`; a browser adaptation, FG.R2 -- the
 * game has no editor), moved out of the page unchanged (FP-1b, the review's F1) so one test runs the SAME steps in the
 * SAME order: `composeLayoutObjects` (the pieces, then the placed hostages' bodies, the objectives, the points and views,
 * the turrets, the doors, the gates and barriers, the flares), `layoutOwnSites`, then `composeLayoutFinish` (the site
 * outlines and the environment). The page does only the loading between them (templates, the outline donor, the sky).
 */
export interface LayoutObjectsInput {
  /** The map the layout stands on: the disc map less its hidden props, or the blank floor (`./page`). */
  baseMap: LoadedMap;
  layout: Layout;
  libs: ReadonlyMap<string, LoadedMap>;
  ground: GroundData;
  playerSide: 'seal' | 'terrorist';
  resolveContent: ContentResolver | null;
  /** The NPCs that fit (`./npcs` `npcsThatFit`): the layout's NPCs in the match. */
  npcs: NpcMarker[];
  /** The disc maps the placed hostages borrow bodies from, by stem (loaded by the page). */
  lentLibs: ReadonlyMap<string, LoadedMap>;
  /** A blank floor: its library's first escortee lends the team and default character, not the composed map's. */
  blank: boolean;
  libraryEscortee: EscorteeStart | undefined;
  /** The page's blank-floor word for the type, before its own test (`./page` `blankWhy`), or null. */
  blocked: string | null;
  turretOf: (source: string, name: string) => TurretTemplate | null;
  doorOf: (source: string, name: string) => DoorTemplate | null;
  accessOf: (m: { kind: 'gate' | 'barrier'; source: string; name: string }) => AccessTemplate | null;
  flareOf: (source: string, name: string) => FlareTemplate | null;
}

export function composeLayoutObjects(i: LayoutObjectsInput) {
  const { layout } = i;
  // R6 (3): the same resolver as the ground's, so a pack piece is solid in the match exactly when it is drawn here.
  const composed = composeMatchMap(i.baseMap, { ...layout, npcs: i.npcs }, i.libs, i.ground, i.playerSide, i.resolveContent);
  const type = layout.objectives?.gameType;
  // The bodies placed hostages borrow from other disc maps (`./hostages` `withLentHostageBodies`); one whose map or
  // character is not here wears the default instead, as it would with none named.
  const bodied = withLentHostageBodies(composed.map, layout.hostages, (s) => i.lentLibs.get(s) ?? null);
  const worn = new Set(hostageCharactersOf(bodied.map));
  const hostages = layout.hostages?.map((h) => (h.source && !worn.has(h.character ?? '') ? (({ source: _s, character: _c, ...rest }) => rest)(h) : h));
  // The team and default character: the base's first hostage's (a blank floor's library's), else a lending map's.
  const lent = (i.blank ? i.libraryEscortee : composed.map.escortees?.[0])
    ?? [...i.lentLibs.values()].map((l) => l.escortees?.[0]).find((e) => !!e);
  // The placed hostages and zones on the map, then the game type, its test reading them (`./playObjectives`).
  const played = playObjectives(bodied.map, { ...layout, ...(hostages ? { hostages } : {}) }, lent, type === undefined ? null : i.blocked);
  // The layout's placed tactical points and spectator views beside the map's own (`./placedPoints`), in any type.
  const pointed = withPlacedViews(withPlacedPoints(played.map, layout.tacPoints), layout.scenicViews);
  // The layout's placed turrets, doors, gates and C4 barriers, and flares beside the map's own: each its disc copy.
  const turreted = withPlacedTurrets(pointed, layout.turrets, i.turretOf);
  const doored = withPlacedDoors(turreted.map, layout.doors, i.doorOf);
  const accessed = withPlacedAccess(doored.map, [
    ...(layout.gates ?? []).map((t) => ({ kind: 'gate' as const, ...t })), ...(layout.barriers ?? []).map((t) => ({ kind: 'barrier' as const, ...t })),
  ], i.accessOf);
  const flared = withPlacedFlares(accessed.map, layout.flares, i.flareOf).map;
  return { composed, played, why: played.why, turreted, doored, flared };
}

/** The layout's own Demolition (or placed Breach) sites when its type plays, which wear the bases' outlines; else none. */
export function layoutOwnSites(layout: Pick<Layout, 'objectives'>, why: string | null): readonly BombSite[] {
  const type = layout.objectives?.gameType;
  return (type === 2 || (type === 1 && breachReady(layout.objectives?.bomb))) && why === null ? layout.objectives?.bomb?.sites ?? [] : [];
}

/** The site outlines (`./siteOutlines`; `donor` a base with none of its own borrows), then the environment (`./ownEnvironment`). */
export function composeLayoutFinish(flared: LoadedMap, ownSites: readonly BombSite[], donor: LoadedMap | null, own: LayoutSettings,
  blank: boolean, skyDome: (map: LoadedMap) => ReturnType<typeof skyDomeFor> | null): LoadedMap {
  const aimed = withSiteOutlines(flared, ownSites, donor);
  return withLayoutEnvironment(aimed, own, blank, skyDome(aimed));
}
