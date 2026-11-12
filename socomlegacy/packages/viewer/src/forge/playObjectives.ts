import type { AiMaps, EscorteeStart } from '@s2u/scene';
import { ESCORT_ZONE_KIND, EXTRACT_ZONE_KIND, withPlacedZones } from './extractionZones';
import { hostagesPlayIn, withPlacedHostages } from './hostages';
import type { Layout } from './layout';
import { applyForgeObjectives, forgeTypeUnplayable, type ObjectiveMap } from './objectives';

type TacZone = { minX: number; minZ: number; maxX: number; maxZ: number; kind: number; name: string };

/**
 * FORGE_ESCORT_ZONE_MARK_ADAPTATION (the owner, 2026-11-06; a browser adaptation, FG.R2): the original's extraction marks
 * are made at the map's load for its kind-1 zones (`EXTRACTION_MARK_READING`), so an escort map's Safety, kind 5 until
 * SEALcheck's promotion, has none; a layout's placed escort zone wears one from the round's start (`forgeZoneMarks`).
 * H424 (a): the owner's to answer; the default meanwhile (FP.R6) -- a Forge layout's own Play only, set only where the
 * layout places an escort zone in Escort, never on a disc map played unchanged (`test/forge/ownEnvironment.test.ts`).
 */
export const FORGE_ESCORT_ZONE_MARK_ADAPTATION = 'a placed escort zone marked from the start';

/**
 * Play's objectives on the match's map (a browser adaptation, FG.R2): the layout's placed hostages (Escort, Extraction)
 * and zones (Escort: HUD_VISIBLE until the script's promotion; Extraction: EXTRACT_ZONE) put on the map first, so the
 * game type's test (`forgeTypeUnplayable`) and its application (`applyForgeObjectives`) read what the room will hold --
 * the escort zones' names with them (`ObjectiveMap.forgeEscortZones`). `lent`: the character the placed hostages copy
 * (a blank floor's: its library's first escortee). `why`: what cannot play, with `blocked` (the page's blank-floor word)
 * before the type's own test; then the map keeps the base's type.
 */
export function playObjectives<T extends ObjectiveMap & { ai?: AiMaps; escortees?: EscorteeStart[]; tac?: { zones: TacZone[] } | null; forgeZoneMarks?: [number, number, number][] }>(
  map: T, layout: Pick<Layout, 'objectives' | 'hostages' | 'extractionZones'>, lent: EscorteeStart | undefined, blocked: string | null = null,
): { map: T; why: string | null; hostagesLeft: number; hostagesOffGrid: number; hostagesPastBound: number; zonesLeft: number } {
  const type = layout.objectives?.gameType;
  const hostaged = hostagesPlayIn(type) && layout.hostages?.length ? withPlacedHostages(map, layout.hostages, lent) : { map, unplaced: 0, offGrid: 0, pastBound: 0 };
  const zoned = (type === 3 || type === 4) && layout.extractionZones?.length
    ? withPlacedZones(hostaged.map, layout.extractionZones, type === 3 ? ESCORT_ZONE_KIND : EXTRACT_ZONE_KIND) : { map: hostaged.map, unplaced: 0, centres: [] };
  // FORGE_ESCORT_ZONE_MARK_ADAPTATION: in Escort a placed zone wears the compass's X from the start (Extraction's are
  // kind 1 and marked as the disc's are, `extractionPoints`).
  // The escort zones' names only where the layout places hostages or zones (FP-1b, REVIEW-B 13): they switch on the Forge
  // escort's fallback lines (`../matchMount` `forgeEscortLines`), so a layout placing neither plays its map's own escort.
  const placesEscort = !!(layout.extractionZones?.length || layout.hostages?.length);
  const named: T = { ...zoned.map, ...(placesEscort ? { forgeEscortZones: (layout.extractionZones ?? []).map((z) => z.name) } : {}),
    ...(type === 3 && zoned.centres.length ? { forgeZoneMarks: zoned.centres } : {}) };
  const why = type === undefined ? null : blocked ?? forgeTypeUnplayable(type, layout.objectives, named);
  return { map: why === null ? applyForgeObjectives(named, layout.objectives) : named, why, hostagesLeft: hostaged.unplaced,
    hostagesOffGrid: hostaged.offGrid, hostagesPastBound: hostaged.pastBound, zonesLeft: zoned.unplaced };
}
