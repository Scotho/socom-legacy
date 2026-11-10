import { describe, expect, it } from 'vitest';
import { zonesOfKind, type AiMaps, type EscorteeStart } from '@s2u/scene';
import type { ObjectiveMap } from '../../src/forge/objectives';
import { floorAiMaps } from '../../src/forge/floorAi';
import { playObjectives } from '../../src/forge/playObjectives';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { extractionPoints } from '../../src/hostageMarks';

/**
 * Play's objectives on the match's map (a browser adaptation, FG.R2): the placed hostages and zones put on the map
 * before the game type's test, then the type applied -- the whole chain the page runs, so Escort and Extraction on a
 * blank floor reach the room with their hostages, their zones and their type.
 */
const lent: EscorteeStart = { name: 'Hostage1', character: 'thai_wife', loc: { map: 0, x: 0, z: 0 }, at: [0, 0, 0], yaw: 0, team: 3 };
type FloorMap = ObjectiveMap & { ai: AiMaps; escortees: EscorteeStart[]; tac: null; forgeZoneMarks?: [number, number, number][] };
const floor = (): FloorMap => ({ ai: floorAiMaps(8000), escortees: [], meta: { actions: [] }, path: 'RUN/MP6.ZDB', tac: null });
const h = { p: [100, 0, 100] as [number, number, number], yaw: 0 };
const layoutOf = (gameType: 3 | 4, extra: Partial<Layout>): Layout =>
  ({ ...emptyLayout({ kind: 'blank', library: 'MP6' }), objectives: { gameType }, ...extra });

describe('playObjectives', () => {
  it('Extraction on the blank floor: the hostages and a kind-1 zone on the map, the type set, the compass marking the zone', () => {
    const r = playObjectives(floor(), layoutOf(4, { hostages: [h], extractionZones: [{ name: 'Safety', at: [300, 0, 300], size: [100, 100] }] }), lent);
    expect([r.why, r.map.gameType, r.map.escortees!.length, r.hostagesLeft, r.zonesLeft]).toEqual([null, 4, 1, 0, 0]);
    expect(zonesOfKind(r.map.ai!, 1).map((z) => z.zone.name)).toEqual(['Safety']);
    expect(extractionPoints(r.map.ai)).toHaveLength(1);
  });

  it("the hostages left out, each case counted apart: off the AI grid, past the room's 16", () => {
    const full = { ...floor(), escortees: Array.from({ length: 16 }, () => lent) };
    const r = playObjectives(full, layoutOf(4, { hostages: [h, { p: [6000, 0, 0], yaw: 0 }] }), lent);
    expect([r.hostagesLeft, r.hostagesOffGrid, r.hostagesPastBound]).toEqual([2, 1, 1]);
  });

  it('Escort on the blank floor: three VIPs and Safety (kind 5 until promoted) make it play -- the type reaches the map', () => {
    const r = playObjectives(floor(), layoutOf(3, { hostages: [h, h, h], extractionZones: [{ name: 'Safety', at: [300, 0, 300], size: [100, 100] }] }), lent);
    expect([r.why, r.map.gameType, r.map.escortees!.length]).toEqual([null, 3, 3]);
    expect(zonesOfKind(r.map.ai!, 5).map((z) => z.zone.name)).toEqual(['Safety']);
    // The owner (2026-11-06; FORGE_ESCORT_ZONE_MARK_ADAPTATION): a placed escort zone wears the compass's X from the start.
    expect(r.map.forgeZoneMarks).toEqual([[300, 0, 300]]);           // its whole cells' middle (10-unit cells from -4000: 250 + 10 x 10 / 2)
    expect(extractionPoints(r.map.ai)).toEqual([]);                    // the original's marks: kind 1 at load, none here
  });

  it('what cannot play is said, and the map keeps no type of the layout\'s', () => {
    const r = playObjectives(floor(), layoutOf(3, { hostages: [h], extractionZones: [{ name: 'Safety', at: [0, 0, 0], size: [10, 10] }] }), lent);
    expect(r.why).toMatch(/three/);
    expect(r.map.gameType).toBeUndefined();
  });
});

describe("FP-1b (REVIEW-B 13): the Forge escort's fallback lines switch on only for a layout that places escort objects", () => {
  it('a layout with no placed hostages or zones names no escort zones on the map: forgeEscortLines stays off (matchMount)', () => {
    const disc = floor();
    const r = playObjectives(disc, emptyLayout({ kind: 'map', archive: 'MP6' }), lent);
    expect(r.why).toBeNull();
    expect(r.map).toEqual(disc);
    expect('forgeEscortZones' in r.map).toBe(false);
    expect('forgeZoneMarks' in r.map).toBe(false);
    // A type alone, nothing placed, likewise.
    expect('forgeEscortZones' in playObjectives(floor(), layoutOf(4, {}), lent).map).toBe(false);
  });
  it('placed hostages or placed zones name the escort zones (an empty list with hostages alone), so the lines switch on', () => {
    expect(playObjectives(floor(), layoutOf(4, { hostages: [h] }), lent).map.forgeEscortZones).toEqual([]);
    expect(playObjectives(floor(), layoutOf(3, { extractionZones: [{ name: 'Safety', at: [0, 0, 0], size: [10, 10] }] }), lent).map.forgeEscortZones).toEqual(['Safety']);
  });
});
