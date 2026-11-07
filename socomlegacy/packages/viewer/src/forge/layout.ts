/**
 * FORGE (the owner, 2026-10-12): the layout file. A browser adaptation with no original -- the forge is the project's
 * own build-and-fly sandbox, and nothing here changes the game.
 *
 * A layout is a recipe, never the disc's bytes: a base (a map's world, or a blank floor beside an archive whose props
 * fill the palette), the pieces placed (an asset id, `<archive>:<prototype>`, and a column-major 4x4 in the game's
 * world frame) and the team spawn markers. Ids name their archive from the first version on, so a layout can mix
 * archives later without a new format. The players' own discs supply the geometry when a layout is opened.
 *
 * FCW-07a: the file's model and its parse live in the creator contracts (`@s2u/creator-contracts` `layout.ts`), the one
 * reader the page, the agent bridge and the registry's map adapter share; this module re-exports them, unchanged, beside
 * the page's own helpers (the type words, the placement key, the download name).
 */
import { DEFAULT_SETTINGS, LAYOUT_NAME_MAX, LAYOUT_VERSION, type ForgeGameType, type Layout, type LayoutBase, type LayoutSettings } from '@s2u/creator-contracts';

export {
  BOMB_SITE_REACH, BOMB_SITES_MAX, DEFAULT_SETTINGS, FORGE_GAME_TYPES, isContentLayout, LAYOUT_NAME_MAX, LAYOUT_VERSION, layoutIds, NPC_BEHAVIOURS, onlineCreatorLayoutRefusal,
  onlineLayoutRefusal, parseAssetId, parseCamera, parseLayout, parseSettings, SETTINGS_BOUNDS, withIds,
} from '@s2u/creator-contracts';
export type {
  BombObjectives, BombSite, ContentLayout, ContentLayoutBase, ForgeGameType, ForgeObjectives, Layout, LayoutBase, LayoutCamera, LayoutObjectiveIds,
  ExtractionZone, FlareMarker, HostageMarker, LayoutSettings, LightRigSetting, ScenicViewMarker, TacPointMarker, TurretMarker, DoorMarker, NpcBehaviour, NpcMarker, Piece, RetailLayoutBase, SpawnMarker,
} from '@s2u/creator-contracts';

/** The layout's settings whole: what it names over the disc's defaults. */
export const settingsOf = (l: Pick<Layout, 'settings'>): LayoutSettings => ({ ...DEFAULT_SETTINGS, ...(l.settings ?? {}) });

/**
 * A layout's game type (`FUN_002c9540`: 1 BREACH, 2 DEMOLITION, 3 ESCORT, 4 EXTRACTION, 5 SUPPRESSION). The words are
 * `mapOrder`'s mode names, which the HUD captions (`gameCaption`).
 */
export const FORGE_GAME_TYPE_NAME: Readonly<Record<ForgeGameType, string>> = Object.freeze({
  1: 'Breach', 2: 'Demolition', 3: 'Escort', 4: 'Extraction', 5: 'Suppression',
});
/** The mode name `gameCaption` turns into the HUD's type word. */
export const modeCaption = (type: ForgeGameType): string => FORGE_GAME_TYPE_NAME[type];

/** A base map's placement named by its model and its place (whole game units): `crate@100,0,-20`. */
export const placementKey = (model: string, x: number, y: number, z: number): string =>
  `${model}@${Math.round(x) + 0},${Math.round(y) + 0},${Math.round(z) + 0}`;

/** An archive named by its stem: `RUN/MP2.ZDB` and `MP2` are both `MP2`. */
export const archiveStem = (archive: string): string => (archive.split('/').pop() ?? archive).replace(/\.zdb$/i, '');

export const assetId = (archive: string, model: string): string => `${archiveStem(archive)}:${model}`;

export const emptyLayout = (base: LayoutBase): Layout => ({ forge: LAYOUT_VERSION, base, pieces: [], spawns: [] });
/**
 * The Night -> Day a base's Original lighting is: none (the map's own) on a map; full day on a blank floor (the owner,
 * 2026-11-06; a browser adaptation, FG.R2 -- a blank floor has no authored light of its own to keep).
 */
export const originalTimeOf = (base: LayoutBase | null | undefined): number | null => (base?.kind === 'blank' ? 1 : null);
/** A new layout on `base`: empty, at its Original lighting (`originalTimeOf`: a blank floor's full day). */
export const newLayout = (base: LayoutBase): Layout => {
  const time = originalTimeOf(base);
  return time === null ? emptyLayout(base) : { ...emptyLayout(base), settings: { timeOfDay: time } };
};

export const serializeLayout = (l: Layout): string => JSON.stringify(l, null, 1);

/**
 * The downloaded file's name: the layout's name, or `forge-<base>.json` when it has none. Characters a file name
 * cannot hold are dropped; a trailing `.json` is not doubled.
 */
export function layoutDownloadName(name: string | undefined, base: LayoutBase): string {
  const fallback = `forge-${base.kind === 'map' ? base.archive : base.kind === 'content' ? base.mapId : 'blank'}`;   // FCW-10: an authored map by its id
  const cleaned = (name ?? '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').slice(0, LAYOUT_NAME_MAX).trim();
  return `${(cleaned || fallback).replace(/\.json$/i, '')}.json`;
}
