import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import type { MapAction } from '../../src/mapActions';
import type { SwitchLook } from '../../src/forge/placedAccess';

/**
 * The layout's environment by base (FP-1b, narrowed by FC2.R2 (2), the owner's answer of 2026-11-13 under MISSION
 * OT.R112; a browser adaptation, FG.R2): in a match started from the Forge (Play, a Forge lobby) a layout's light rig,
 * fog colour, drop-shadow direction, fog (on, near, height band) and night play on a disc map as on a new empty map;
 * the sky dome (`skyFrom`) is a new empty map's only; another base (an authored map) takes only the fog distance every
 * layout has. A match started from the original's own menus never comes through this chain, so a disc map there keeps
 * its own. A layout on a disc map with none of the settings composes the same map as before the overhaul -- no outline
 * moved, no objective retargeted, its camera, rig, night and shadow its own.
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
/** The objects step's inputs with nothing to load (no template, look, lent body or piece owner). */
const objectsInput = (base: LoadedMap, layout: Layout): Parameters<typeof composeLayoutObjects>[0] => ({
  baseMap: base, layout, libs: new Map([[base.archive, base]]), ground: GROUND, playerSide: 'seal', resolveContent: null, npcs: [],
  lentLibs: new Map(), blank: false, libraryEscortee: undefined, blocked: null, pieceOwners: [],
  turretOf: () => null, doorOf: () => null, accessOf: () => null, switchLookOf: () => null, flareOf: () => null,
});
function throughChain(base: LoadedMap, layout: Layout): LoadedMap {
  const objects = composeLayoutObjects(objectsInput(base, layout));
  return composeLayoutFinish({
    flared: objects.flared, ownSites: layoutOwnSites(layout, objects.why), donor: null, own: settingsOf(layout), base: 'map',
    skyDome: () => null, rosterOf: () => null,
  }).map;
}

const SKY = { world: [{ textureName: 'MP6/sky01.tif', positions: Float32Array.from([0, 500, 0]) } as unknown as LoadedMesh], textures: { 'MP6/sky01.tif': 'SKY' }, textureFlags: {} } as unknown as Parameters<typeof withLayoutEnvironment>[3];

describe("the layout's environment by base (withLayoutEnvironment; FC2.R2 (2))", () => {
  it('an empty layout on a disc map, through the whole composeForMatch chain, is the disc map as the Forge has always played it: its slots, hull and look', () => {
    const played = throughChain(DISC_MATCH, emptyLayout({ kind: 'map', archive: 'MP2' }));
    expect(played).toEqual(AS_BEFORE);
    // The last steps alone leave it as it was too.
    expect(applyForgeObjectives(withSiteOutlines(DISC, []), undefined)).toBe(DISC);
    expect(withLayoutEnvironment(DISC, settingsOf(emptyLayout({ kind: 'map', archive: 'MP2' })), 'map', null)).toEqual(DISC);
  });

  it('on a disc map in a Forge-started match the five play -- rig, shadow, fog colour, fog band, night -- and the sky does not', () => {
    const played = withLayoutEnvironment(DISC, SIX, 'map', SKY);
    expect(played.lightRig).toEqual(SIX.lightRig);
    expect(played.world).toBe(DISC.world);
    expect(played.textures).toEqual({});
    expect(played.shadowVector).toEqual([1, -1, 0]);
    expect(played.camera).toMatchObject({ fogColor: [200, 100, 50], fogEnabled: true, fogNear: 50, fogAltitude: true, fogTop: 30, fogBottom: 5 });
    expect(played.night).toEqual({ mission: true, lens: [0.2, 0.898, 0.2, 0.24] });
    // With none of them held, a disc map plays its own.
    expect(withLayoutEnvironment(DISC, settingsOf(emptyLayout({ kind: 'map', archive: 'MP2' })), 'map', SKY)).toEqual(DISC);
  });

  it('another base (an authored map) takes none of the six, even held: only the fog distance every layout has (FG-24)', () => {
    expect(withLayoutEnvironment(DISC, SIX, 'content', SKY)).toBe(DISC);
    const far = { ...SIX, fogFar: 2000 };
    expect(withLayoutEnvironment(DISC, far, 'content', SKY)).toEqual(withSettings(DISC, far));
    const played = withLayoutEnvironment(DISC, far, 'content', SKY);
    expect(played.lightRig).toBe(DISC.lightRig);
    expect(played.world).toBe(DISC.world);
    expect(played.night).toBe(DISC.night);
    expect(played.shadowVector).toBe(DISC.shadowVector);
    expect(played.camera!.fogColor).toEqual([1, 2, 3]);
  });

  it('the fog distance plays on every base (FG-24)', () => {
    const far = { ...DEFAULT_SETTINGS, fogFar: 2000 };
    for (const base of ['blank', 'map', 'content'] as const) {
      expect(withLayoutEnvironment(DISC, far, base, null).camera!.fogFar, base).toBe(withSettings(DISC, far).camera!.fogFar);
    }
  });

  it('on a new empty map the six play: rig, sky, shadow, fog colour, fog band and night', () => {
    const played = withLayoutEnvironment(DISC, SIX, 'blank', SKY);
    expect(played.lightRig).toEqual(SIX.lightRig);
    expect(played.world.map((m) => m.textureName)).toEqual(['ground.tif', 'MP6/sky01.tif']);
    expect(played.textures).toEqual({ 'MP6/sky01.tif': 'SKY' });
    expect(played.shadowVector).toEqual([1, -1, 0]);
    expect(played.camera).toMatchObject({ fogColor: [200, 100, 50], fogEnabled: true, fogNear: 50, fogAltitude: true, fogTop: 30, fogBottom: 5 });
    expect(played.night).toEqual({ mission: true, lens: [0.2, 0.898, 0.2, 0.24] });
    // With none of them held, a new empty map plays its library's.
    expect(withLayoutEnvironment(DISC, settingsOf(emptyLayout({ kind: 'blank', library: 'MP2' })), 'blank', null)).toEqual(DISC);
  });
});

/**
 * FC2-2 (the contributor's Forge objects and switches, MISSION OT.R112; a browser adaptation, FG.R2): his steps are IN
 * the pure chain Play composes by, so this file runs them as Play does. A base carrying its metadata (the placed kinds
 * write there), a layout with one ambient Forge object and one switch running a script on a look (`switchLookOf`, the
 * page's loaded looks): the objects step composes both without throwing, and the map names them. A switch on a placed
 * gate needs a disc gate's template (its leaf, its lever program), which this file does not build: the gates' step's
 * arguments are pinned on the chain's source below instead.
 */
const META_MATCH = {
  ...DISC_MATCH, actions: [],
  meta: { stem: 'MP2', actions: [], instances: [], instanceByPath: new Map(), initial: [], diagnostics: [], scene: { destructibles: [], programs: [] } },
} as unknown as LoadedMap;
const PLATE_RECORD = {
  node: 'epanel_di1', type: 'SWITCH', typeCode: 2, valve: 'lever1', anims: [], team: null, range: 15, elevation: 15, points: 0, bitmap: 'use',
  path: 'worldmodel/epanel_di1', at: [0, 0, 0],
} as unknown as MapAction;
const PLATE: SwitchLook = { lib: META_MATCH, pieces: [], owners: [], instances: [], anchor: [0, 0, 0], prefixes: [], record: PLATE_RECORD };

describe("FC2-2: the contributor's steps run in the chain (composeLayoutObjects)", () => {
  it('a layout with one Forge object and one scripted switch composes without throwing, and the map names both', () => {
    const layout: Layout = {
      ...emptyLayout({ kind: 'map', archive: 'MP2' }),
      objects: [{ kind: 'ambient', source: 'MP2', name: 'flame_in_barrel', at: [10, 0, 20], yaw: 0 }],
      switches: [{ look: 'plate', script: { steps: [{ do: 'message', text: 'Pulled' }] }, at: [30, 0, 40], yaw: 0 }],
    };
    const objects = composeLayoutObjects({ ...objectsInput(META_MATCH, layout), switchLookOf: (id) => (id === 'plate' ? PLATE : null) });
    expect(objects.flared.meta!.forgePlaces).toEqual({ 'forge/object_1': [10, 0, 20] });
    expect(objects.flared.meta!.forgeAmbients).toMatchObject([{ path: 'forge/object_1', source: 'MP2', name: 'flame_in_barrel' }]);
    expect(objects.flared.meta!.actions.find((a) => a.path === 'worldmodel/forge_switch_1')).toMatchObject({ type: 'SWITCH', valve: 'forge_switch_1_valve' });
    expect(objects.flared.actions).toBe(objects.flared.meta!.actions);
  });

  it("the steps in his order (the page's inline chain at the import): his Forge objects after the views, his switches, looks, piece owners and triggers into the gates' step, his piece instances before the flares, then the finish's roster, arsenal and world settings", () => {
    const chain = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/composeLayout.ts'), 'utf8');
    const order = ['composeMatchMap(', 'withLentHostageBodies(', 'playObjectives(', 'withForgeObjects(withPlacedViews(withPlacedPoints(',   // one nested expression: the innermost runs first
      'withPlacedTurrets(', 'withPlacedDoors(', 'withPlacedAccess(', 'withPieceInstances(', 'withPlacedFlares(',
      'withSiteOutlines(', 'withRoster(withLayoutEnvironment(', 'mapWithArsenal(', 'withWorldSettings('];   // the roster's argument is the environment's result
    const at = order.map((name) => chain.indexOf(name));
    for (const [k, name] of order.entries()) expect(at[k], name).toBeGreaterThan(-1);
    for (let k = 1; k < order.length; k++) expect(at[k], `${order[k - 1]} before ${order[k]}`).toBeGreaterThan(at[k - 1]!);
    expect(chain).toMatch(/composeMatchMap\([^;]*, pieceOwner\)/);
    expect(chain).toMatch(/withForgeObjects\([^;]*, layout\.objects\)/);
    expect(chain).toMatch(/withPlacedAccess\([^;]*, layout\.switches \?\? \[\], i\.switchLookOf, pieceOwner, layout\.triggers \?\? \[\]\)/);
    // PR #5: the same step, its condition widened to his map script and scripted objects (`layout.mapScript`,
    // `layout.objects?.some((o) => o.script)`), the line wrapped in two; was the switches' and triggers' alone.
    expect(chain).toMatch(/if \(layout\.switches\?\.some\(\(sw\) => sw\.script \|\| sw\.piece !== undefined\) \|\| layout\.triggers\?\.length(?: \|\| layout\.mapScript\s+\|\| layout\.objects\?\.some\(\(o\) => o\.script\))?\) accessed\.map = withPieceInstances\(accessed\.map, i\.pieceOwners\)/);
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
