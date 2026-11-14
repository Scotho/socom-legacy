import type { EscorteeStart } from '@s2u/scene';
import type { GroundData } from '../mover';
import type { LoadedMap } from '../loadMap';
import type { ContentResolver } from '../packs/content/collision';
import { mapWithArsenal } from './arsenalSetting';
import { withForgeObjects } from './forgeObjects';
import { hostageCharactersOf, withLentHostageBodies } from './hostages';
import type { BombSite, Layout, LayoutBase, LayoutSettings, NpcMarker } from './layout';
import { composeMatchMap } from './matchMap';
import { breachReady } from './objectives';
import { withLayoutEnvironment } from './ownEnvironment';
import { withPieceInstances, withPlacedAccess, type AccessTemplate, type SwitchLook, type SwitchLookId } from './placedAccess';
import { withPlacedDoors, type DoorTemplate } from './placedDoors';
import { withPlacedFlares, type FlareTemplate } from './placedFlares';
import { withPlacedPoints, withPlacedViews } from './placedPoints';
import { playObjectives } from './playObjectives';
import { withRoster, type RosterMap } from './rosterSetting';
import { withSiteOutlines } from './siteOutlines';
import type { skyDomeFor } from './skyDome';
import { withPlacedTurrets, type TurretTemplate } from './turrets';
import { withWorldSettings } from './worldSettings';

/**
 * The pure chain Play and a Forge lobby compose a layout's match map by (`./page` `composeForMatch`; a browser
 * adaptation, FG.R2 -- the game has no editor), moved out of the page (FP-1b, the review's F1) so one test runs the SAME
 * steps in the SAME order; the contributor's steps (MISSION OT.R112: his Forge objects, switches, damage triggers and
 * placed pieces, his Map Settings) put back in it at his import (FC2-2), in his order. `composeLayoutObjects` (the
 * pieces, then the placed hostages' bodies, the objectives, the points and views, the Forge objects, the turrets, the
 * doors, the gates and barriers with the switches and triggers, the pieces as placed nodes, the flares),
 * `layoutOwnSites`, then `composeLayoutFinish` (the site outlines, the environment, the roster, the arsenal, the world
 * settings). The page does only the loading between them (templates, looks, lent bodies, the outline donor, the sky, the
 * roster's donors) and what the match lends from other maps (`./scriptAssets`, which needs its loaders).
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
  /** Each placed piece's name in the hull by its place among the pieces (`./page` `composeGround`'s `forge/piece_<n>`). */
  pieceOwners: readonly string[];
  turretOf: (source: string, name: string) => TurretTemplate | null;
  doorOf: (source: string, name: string) => DoorTemplate | null;
  accessOf: (m: { kind: 'gate' | 'barrier'; source: string; name: string }) => AccessTemplate | null;
  /** Each look the layout's switches wear (`./placedAccess` `SwitchLook`), loaded by the page before the chain. */
  switchLookOf: (id: SwitchLookId) => SwitchLook | null;
  flareOf: (source: string, name: string) => FlareTemplate | null;
}

export function composeLayoutObjects(i: LayoutObjectsInput) {
  const { layout } = i;
  // Each piece's name in the hull: its drawn placements take it too, so a switch's script hides or shows both
  // (`./matchMap`, `./placedAccess` `scriptPrograms`).
  const pieceOwner = (n: number): string => i.pieceOwners[n] ?? `forge/piece_${n}`;
  // R6 (3): the same resolver as the ground's, so a pack piece is solid in the match exactly when it is drawn here.
  const composed = composeMatchMap(i.baseMap, { ...layout, npcs: i.npcs }, i.libs, i.ground, i.playerSide, i.resolveContent, pieceOwner);
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
  // The layout's placed tactical points and spectator views beside the map's own (`./placedPoints`), in any type; then
  // its Forge objects (`./forgeObjects`): each one's place by its path, the ambient effects to play.
  const pointed = withForgeObjects(withPlacedViews(withPlacedPoints(played.map, layout.tacPoints), layout.scenicViews), layout.objects);
  // The layout's placed turrets, doors, gates and C4 barriers, and flares beside the map's own: each its disc copy.
  const turreted = withPlacedTurrets(pointed, layout.turrets, i.turretOf);
  const doored = withPlacedDoors(turreted.map, layout.doors, i.doorOf);
  // The gates and barriers with the switches (each in its look: a gate's lever panel asks for its gate's own) and the
  // props made damage triggers (`./placedAccess`).
  const accessed = withPlacedAccess(doored.map, [
    ...(layout.gates ?? []).map((t) => ({ kind: 'gate' as const, ...t })), ...(layout.barriers ?? []).map((t) => ({ kind: 'barrier' as const, ...t })),
  ], i.accessOf, layout.switches ?? [], i.switchLookOf, pieceOwner, layout.triggers ?? []);
  // Each piece a placed node (`./placedAccess` `withPieceInstances`): a script's hide reaches every page on the wire.
  if (layout.switches?.some((sw) => sw.script || sw.piece !== undefined) || layout.triggers?.length) accessed.map = withPieceInstances(accessed.map, i.pieceOwners);
  const flared = withPlacedFlares(accessed.map, layout.flares, i.flareOf).map;
  return { composed, played, why: played.why, turreted, doored, accessed, flared };
}

/** The layout's own Demolition (or placed Breach) sites when its type plays, which wear the bases' outlines; else none. */
export function layoutOwnSites(layout: Pick<Layout, 'objectives'>, why: string | null): readonly BombSite[] {
  const type = layout.objectives?.gameType;
  return (type === 2 || (type === 1 && breachReady(layout.objectives?.bomb))) && why === null ? layout.objectives?.bomb?.sites ?? [] : [];
}

/** What the finish reads: the objects step's map, the sites, and what the page loaded for the outlines, sky and roster. */
export interface LayoutFinishInput {
  /** The objects step's map (`composeLayoutObjects`' `flared`). */
  flared: LoadedMap;
  /** The layout's own sites (`layoutOwnSites`). */
  ownSites: readonly BombSite[];
  /** The map a base with no outline of its own borrows the site outlines from (`./page` `SITE_OUTLINE_DONOR`), or null. */
  donor: LoadedMap | null;
  /** The layout's settings as this match plays them (`./page`: a Forge lobby's without the held ones, FC2.R8). */
  own: LayoutSettings;
  /** The base's kind (`LayoutBase.kind`): which of the environment's settings play (`./ownEnvironment`). */
  base: LayoutBase['kind'];
  /** The sky dome over the map so far (`./skyDome`), or null; a new empty map's only. */
  skyDome: (map: LoadedMap) => ReturnType<typeof skyDomeFor> | null;
  /** The disc maps the roster lends its types from, by stem (`./rosterSetting`), loaded by the page; null, not here. */
  rosterOf: (stem: string) => RosterMap | null;
}

/**
 * The site outlines (`./siteOutlines`), the environment (`./ownEnvironment`), then the layout's roster
 * (`./rosterSetting`: each side's types, bodies lent from their disc maps, with their kits), its arsenal over that
 * (`./arsenalSetting`: the room's kits, its pick replay and the bots' kits read both) and the world values it writes over
 * (`./worldSettings`: the default surface, the field of view). `refused`: what the last three left out, in that order.
 */
export function composeLayoutFinish(i: LayoutFinishInput): { map: LoadedMap; refused: string[] } {
  const aimed = withSiteOutlines(i.flared, i.ownSites, i.donor);
  const rostered = withRoster(withLayoutEnvironment(aimed, i.own, i.base, i.skyDome(aimed)), i.own.characters, i.rosterOf);
  const armed = mapWithArsenal(rostered.map, i.own.arsenal);
  const world = withWorldSettings(armed.map, i.own);
  return { map: world.map, refused: [...rostered.refused, ...armed.refused, ...world.refused] };
}
