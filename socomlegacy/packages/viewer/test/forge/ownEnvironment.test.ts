import { describe, expect, it } from 'vitest';
import type { LoadedMap, LoadedMesh } from '../../src/loadMap';
import { DEFAULT_SETTINGS, emptyLayout, settingsOf, type LayoutSettings } from '../../src/forge/layout';
import { withLayoutEnvironment } from '../../src/forge/ownEnvironment';
import { withSettings } from '../../src/forge/matchMap';
import { withSiteOutlines } from '../../src/forge/siteOutlines';
import { applyForgeObjectives } from '../../src/forge/objectives';
import { composeLayoutFinish, composeLayoutObjects, layoutOwnSites } from '../../src/forge/composeLayout';
import { DEFAULT_GRID_PARAMS, type SpawnSlot } from '@s2u/scene';
import { packGround } from '../../src/mover';
import type { Layout } from '../../src/forge/layout';

/**
 * "A disc map plays as before" (FP-1b; the Overhaul's review, MISSING-TESTS B3; a browser adaptation's bound, FG.R2):
 * the six settings a new empty map may hold (`lightRig`, `fogColor`, `shadowVector`, `skyFrom`, `fog`, `night`) never
 * reach a disc map's match, and a layout on a disc map with none of the new settings composes the same map as before
 * the overhaul -- no outline moved, no objective retargeted, its camera, rig, night and shadow its own.
 */
const camera = { fogColor: [1, 2, 3], fogNear: 200, fogFar: 4000, fogTop: 10, fogBottom: 0, fogEnabled: false, fogAltitude: false };
const DISC = {
  archive: 'MP2', path: 'maps/MP2', world: [{ textureName: 'ground.tif', positions: Float32Array.from([0, 0, 0]) } as unknown as LoadedMesh],
  props: [], textures: {}, textureFlags: {}, camera,
  lightRig: { directions: [[0, 1, 0], [0, 1, 0], [0, 1, 0]], colours: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], ambient: [0.2, 0.2, 0.2] },
  night: { mission: false, lens: null }, shadowVector: [0, -1, 0],
} as unknown as LoadedMap;
const SIX: LayoutSettings = {
  ...DEFAULT_SETTINGS,
  lightRig: { directions: [[1, 0, 0], [1, 0, 0], [1, 0, 0]], colours: [[0, 0, 1], [0, 0, 1], [0, 0, 1]], ambient: [0, 0, 0] },
  fogColor: [200, 100, 50], shadowVector: [1, -1, 0], skyFrom: 'MP6',
  fog: { on: true, near: 50, height: { top: 30, bottom: 5 } }, night: { mission: true, lens: [0.2, 0.898, 0.2, 0.24] },
};
/**
 * The whole chain Play composes a layout's match map by (`../../src/forge/composeLayout`: the SAME steps in the SAME order
 * as `./page` `composeForMatch`, the page calling it -- FP-1b, the review's F1), with no template, donor or sky to load:
 * a change to any step that alters a disc map goes red here.
 */
const slot = (side: 0 | 1, x: number): SpawnSlot => ({ side, index: 0, at: [x, 0, 0], yaw: 0 } as unknown as SpawnSlot);
const GROUND = packGround(DEFAULT_GRID_PARAMS, [], []);
/** The disc map as the Forge loads it: its hull, its start slots and its own respawn records (research 91 s4.2). */
const DISC_MATCH = { ...DISC, ground: GROUND, slots: [slot(0, 10), slot(1, -10)], respawns: [slot(0, 50), slot(1, -50)] } as unknown as LoadedMap;
/**
 * What the Forge's Play has made of it since FG's compose (32896d087, 2026-10-13, before the Overhaul): the same map, its
 * respawns its start slots (`./matchMap` `composeMatchMap`: `respawns: slots`, kept by the Overhaul for a layout placing
 * none). Pinned as it is; whether a disc map's Forge Play should respawn at the disc's own records is the report's
 * question, not this task's change.
 */
const AS_BEFORE = { ...DISC_MATCH, respawns: DISC_MATCH.slots } as LoadedMap;
function throughChain(base: LoadedMap, layout: Layout): LoadedMap {
  const objects = composeLayoutObjects({
    baseMap: base, layout, libs: new Map([[base.archive, base]]), ground: GROUND, playerSide: 'seal', resolveContent: null, npcs: [],
    lentLibs: new Map(), blank: false, libraryEscortee: undefined, blocked: null,
    turretOf: () => null, doorOf: () => null, accessOf: () => null, flareOf: () => null,
  });
  return composeLayoutFinish(objects.flared, layoutOwnSites(layout, objects.why), null, settingsOf(layout), false, () => null);
}

const SKY = { world: [{ textureName: 'MP6/sky01.tif', positions: Float32Array.from([0, 500, 0]) } as unknown as LoadedMesh], textures: { 'MP6/sky01.tif': 'SKY' }, textureFlags: {} } as unknown as Parameters<typeof withLayoutEnvironment>[3];

describe('a disc map plays as before (withLayoutEnvironment)', () => {
  it('an empty layout on a disc map, through the whole composeForMatch chain, is the disc map as the Forge has always played it: its slots, hull and look', () => {
    const played = throughChain(DISC_MATCH, emptyLayout({ kind: 'map', archive: 'MP2' }));
    expect(played).toEqual(AS_BEFORE);
    // The last steps alone are the identity on it too.
    expect(applyForgeObjectives(withSiteOutlines(DISC, []), undefined)).toBe(DISC);
    expect(withLayoutEnvironment(DISC, settingsOf(emptyLayout({ kind: 'map', archive: 'MP2' })), false, null)).toBe(DISC);
  });

  it('none of the six reaches a disc map, even held: only the fog distance every layout has (FG-24)', () => {
    expect(withLayoutEnvironment(DISC, SIX, false, SKY)).toBe(DISC);
    const far = { ...SIX, fogFar: 2000 };
    expect(withLayoutEnvironment(DISC, far, false, SKY)).toEqual(withSettings(DISC, far));
    const played = withLayoutEnvironment(DISC, far, false, SKY);
    expect(played.lightRig).toBe(DISC.lightRig);
    expect(played.world).toBe(DISC.world);
    expect(played.night).toBe(DISC.night);
    expect(played.shadowVector).toBe(DISC.shadowVector);
    expect(played.camera!.fogColor).toEqual([1, 2, 3]);
  });

  it('on a new empty map the six play: rig, sky, shadow, fog colour, fog band and night', () => {
    const played = withLayoutEnvironment(DISC, SIX, true, SKY);
    expect(played.lightRig).toEqual(SIX.lightRig);
    expect(played.world.map((m) => m.textureName)).toEqual(['ground.tif', 'MP6/sky01.tif']);
    expect(played.textures).toEqual({ 'MP6/sky01.tif': 'SKY' });
    expect(played.shadowVector).toEqual([1, -1, 0]);
    expect(played.camera).toMatchObject({ fogColor: [200, 100, 50], fogEnabled: true, fogNear: 50, fogAltitude: true, fogTop: 30, fogBottom: 5 });
    expect(played.night).toEqual({ mission: true, lens: [0.2, 0.898, 0.2, 0.24] });
    // With none of them held, a new empty map plays its library's.
    expect(withLayoutEnvironment(DISC, settingsOf(emptyLayout({ kind: 'blank', library: 'MP2' })), true, null)).toEqual(DISC);
  });
});

/**
 * FP.R6's default (H424, the owner's to answer; meanwhile a Forge layout's own Play only): the three Play-changing items
 * -- the escort zone marked on the compass from the round's start (`FORGE_ESCORT_ZONE_MARK_ADAPTATION`), the lever on a
 * placed gate, Escort on a non-escort map -- never reach a disc map played unchanged. A layout with no pieces, no placed
 * objects and no settings on a disc map composes the disc's map: no zone mark, no escort zones (so no Forge escort lines
 * and no placeholder Escort), no placed gate or its lever.
 */
describe("FP.R6's default: a disc map played unchanged carries none of H424's three items", () => {
  it('the whole composeForMatch chain leaves the disc map itself: no zone marks, no escort zones, no gate, its own type', () => {
    const played = throughChain(DISC_MATCH, emptyLayout({ kind: 'map', archive: 'MP2' }));
    expect(played).toEqual(AS_BEFORE);
    expect('forgeZoneMarks' in played).toBe(false);
    expect('forgeEscortZones' in played).toBe(false);
    expect('forgeSiteOutlines' in played).toBe(false);
    expect(played.gates).toBeUndefined();
  });
});
