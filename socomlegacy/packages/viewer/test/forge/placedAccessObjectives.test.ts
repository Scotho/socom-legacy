import { describe, expect, it } from 'vitest';
import type { GridParams } from '@s2u/scene';
import { BombAuthority } from '../../../match/src/bomb';
import type { LoadedMap } from '../../src/loadMap';
import type { MapAction } from '../../src/mapActions';
import { packGround } from '../../src/mover';
import { plantSite } from '../../src/net/objective';
import type { ForgeObjectives } from '../../src/forge/layout';
import { withPlacedAccess, type AccessTemplate } from '../../src/forge/placedAccess';
import { withPlacedDoors, type DoorTemplate } from '../../src/forge/placedDoors';
import { playObjectives } from '../../src/forge/playObjectives';

/**
 * Codex on #728 (a browser adaptation, FG.R2; product track): Play composes the layout's objectives
 * (`../../src/forge/playObjectives` -> `../../src/forge/objectives` `applyForgeObjectives`, which writes the layout's
 * two sites into `map.meta.actions` in place of the base's MPBOMB records, `forgeBombActions`: paths `forge/site_<i>`)
 * BEFORE the placed doors and gates/barriers (`../../src/forge/page.ts` `composeForMatch`). The room's bomb reads its
 * sites from `map.meta.actions` alone (`match/src/bomb.ts` `BombAuthority.of`, `plantSite` over `map.meta?.actions`).
 * So a placed object's composition starts from the composed metadata's actions and appends its own: the layout's
 * sites survive, and `map.actions` is the same list.
 */
const grid: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };

const action = (node: string, type: string, typeCode: number, at: [number, number, number], team: number | null = null): MapAction => ({
  node, type, typeCode, valve: '', anims: ['BombPlace'], team, range: 15, elevation: 15, points: 0, bitmap: '', path: `worldmodel/${node}`, at,
});

/** A base with the map's own plant sites (the disc's tents) and a door, carried both as `actions` and `meta.actions`. */
function base(): LoadedMap {
  const own = [action('terrorist_tent', 'MPBOMB', 4, [1, 0, 0]), action('seal_tent', 'MPBOMB', 4, [2, 0, 0]), action('door_1', 'DOOR', 1, [0, 0, 0])];
  return {
    archive: 'MP2', path: 'RUN/MP2.ZDB', world: [], lines: null, props: [], doors: [], turrets: [], gates: [], textures: {}, textureFlags: {},
    actions: own, bombStart: [9, 8, 7], gameType: 2,
    ground: packGround(grid, [], []),
    meta: { actions: [...own], instances: [], instanceByPath: new Map(), initial: [], scene: { destructibles: [], programs: [] } },
  } as unknown as LoadedMap;
}

/** A C4 barrier's template as `accessTemplates` makes one, cut to its death's action (the parts the test reads). */
function barrier(lib: LoadedMap): AccessTemplate {
  return {
    kind: 'barrier', source: 'MP2', name: 'access1', root: 'worldmodel/access1', lib, anchor: [0, 0, 0],
    instances: [], initial: [], owners: [], pieces: [], destructibles: [],
    actions: [{ action: { ...action('access_action1', 'C4', 6, [0, 0, 0]), valve: 'set_access1', anims: ['destroy_access1'] }, program: null }],
    gate: null,
  };
}

const DEMOLITION: ForgeObjectives = {
  gameType: 2,
  bomb: {
    start: [10, 1, 20],
    sites: [
      { team: 0, at: [100, 0, 0], yaw: 0, range: 15, elevation: 15 },
      { team: 1, at: [-40, 2, 5], yaw: 0, range: 15, elevation: 15 },
    ],
  },
};

const host = { tick: () => 0, live: () => false, actors: () => [], actor: () => undefined, cast: () => null } as never;

describe("placed access objects keep the layout's composed objectives", () => {
  it("after playObjectives then withPlacedAccess, the bomb's sites are the layout's and the barrier's action follows them", () => {
    const played = playObjectives(base(), { objectives: DEMOLITION }, undefined);
    expect(played.why).toBeNull();
    const composed = played.map.meta!.actions;
    const { map, unplaced } = withPlacedAccess(played.map, [{ kind: 'barrier', source: 'MP2', name: 'access1', at: [50, 0, 50], yaw: 0 }], () => barrier(base()));
    expect(unplaced).toBe(0);
    const actions = map.meta!.actions;
    // What `BombAuthority.of` reads: `plantSite` over `map.meta.actions` -- the layout's sites, never the base's tents.
    expect(plantSite('seal', actions)?.path).toMatch(/^forge\/site_/);
    expect(plantSite('terrorist', actions)?.path).toMatch(/^forge\/site_/);
    expect(actions.some((a) => a.node === 'terrorist_tent' || a.node === 'seal_tent')).toBe(false);
    expect(BombAuthority.of(map as never, host)).not.toBeNull();
    // Every index the composed hold kept, the barrier's action after them; `map.actions` the same list.
    expect(actions.slice(0, composed.length)).toEqual(composed);
    expect(actions.length).toBe(composed.length + 1);
    expect(actions[composed.length]!.path).toBe('worldmodel/forge_barrier_1/forge_barrier_1_action');
    expect(map.actions).toEqual(actions);
  });

  it('withPlacedDoors keeps them too, and its map.actions is the same list as its meta.actions', () => {
    const played = playObjectives(base(), { objectives: DEMOLITION }, undefined);
    const composed = played.map.meta!.actions;
    const lib = base();
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const t = {
      source: 'MP2', name: 'bdoor_4', lib, pieces: [], owners: [],
      spec: { index: 0, node: 'bdoor_4', path: 'worldmodel/bdoor_4', valve: 'bdoor_4', local: identity, parent: identity, owners: [], sweep: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } },
      action: { ...action('bdoor_4', 'DOOR', 0, [0, 0, 0]) },
    } as unknown as DoorTemplate;
    const { map, unplaced } = withPlacedDoors(played.map, [{ source: 'MP2', name: 'bdoor_4', at: [50, 0, 50], yaw: 0 }], () => t);
    expect(unplaced).toBe(0);
    const actions = map.meta!.actions;
    expect(plantSite('seal', actions)?.path).toMatch(/^forge\/site_/);
    expect(actions.slice(0, composed.length)).toEqual(composed);
    expect(actions.length).toBe(composed.length + 1);
    expect(actions[composed.length]!.path).toBe('worldmodel/forge_door_1');
    expect(map.actions).toEqual(actions);
  });
});
