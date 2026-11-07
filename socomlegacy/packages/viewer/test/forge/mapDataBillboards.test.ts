import { describe, expect, it } from 'vitest';
import { facingVector, type SpawnSlot } from '@s2u/scene';
import { billboardSpecs, MAP_DATA_KIND_TOGGLES, MAP_DATA_MARKS, MAP_DATA_SELECTED_BORDER, placementOfMark, userMarkKind } from '../../src/forge/mapDataBillboards';
import type { MapDataGroup } from '../../src/forge/mapData';

/**
 * The viewport's billboards for the map's own data (a browser adaptation, FG.R2): one camera-facing mark at each spawn
 * slot and each row of the Map Data branches with a place -- never the props, which draw themselves.
 */
const slot = (side: 0 | 1, index: number): SpawnSlot => ({
  side, index, position: [index * 10, 5, side * 10], onFloor: true, step: 0, facing: facingVector(0), loc: { map: 0, x: 0, z: 0 },
});

describe('billboardSpecs', () => {
  const groups: MapDataGroup[] = [
    { key: 'doors', label: 'Doors', rows: [{ key: 'door:0', label: 'bdoor_1', title: '', at: [1, 2, 3] }] },
    { key: 'scenicViews', label: 'Spectator Views', rows: [{ key: 'view:0', label: 'Overlook', title: '', view: { x: 7, y: 8, z: 9, yaw: 0, pitch: 0 } }] },
  ];

  it('marks each spawn slot by its side, and each map data row at its place -- a view at its camera', () => {
    const specs = billboardSpecs(groups, [slot(0, 0), slot(1, 2)]);
    expect(specs.map((s) => [s.key, s.kind, s.at])).toEqual([
      ['slot:A1', 'slotA', [0, 5, 0]],
      ['slot:B3', 'slotB', [20, 5, 10]],
      ['door:0', 'doors', [1, 2, 3]],
      ['view:0', 'scenicViews', [7, 8, 9]],
    ]);
    expect(specs.find((s) => s.key === 'door:0')!.label).toBe('bdoor_1');
  });

  it('every kind a mark of its own: a glyph, a colour and the word the Inspector names it by', () => {
    for (const kind of ['slotA', 'slotB', 'respawnA', 'respawnB', 'escortees', 'bombStart', 'turrets', 'doors', 'gates', 'cranes', 'actions', 'tacPoints', 'tacZones', 'scenicViews']) {
      expect(MAP_DATA_MARKS[kind], kind).toMatchObject({ glyph: expect.stringMatching(/^.{1,2}$/), colour: expect.stringMatching(/^#[0-9a-f]{6}$/), word: expect.any(String) });
    }
  });

  it('a spec keeps what framing it needs: a view its pose, a zone its reach', () => {
    const specs = billboardSpecs([
      ...groups,
      { key: 'tacZones', label: 'Tactical Zones', rows: [{ key: 'taczone:0', label: 'Yard', title: '', at: [0, 0, 0], reach: 120 }] },
    ], []);
    expect(specs.find((s) => s.key === 'view:0')!.view).toEqual({ x: 7, y: 8, z: 9, yaw: 0, pitch: 0 });
    expect(specs.find((s) => s.key === 'taczone:0')!.reach).toBe(120);
  });

  it('the selected mark\'s border is the editor\'s selection colour (the selection box\'s gold), not any kind\'s own', () => {
    expect(MAP_DATA_SELECTED_BORDER).toBe('#d8a640');
    expect(Object.values(MAP_DATA_MARKS).map((m) => m.colour)).not.toContain(MAP_DATA_SELECTED_BORDER);
  });

  it('a switch a kind of map data, each mark kind under exactly one (a spawn slot\'s two sides under one)', () => {
    const covered = MAP_DATA_KIND_TOGGLES.flatMap((t) => t.kinds);
    expect(new Set(covered).size).toBe(covered.length);
    expect(new Set(covered)).toEqual(new Set(Object.keys(MAP_DATA_MARKS)));
    expect(MAP_DATA_KIND_TOGGLES.find((t) => t.id === 'slots')!.kinds).toEqual(['slotA', 'slotB']);
  });

  it('the map\'s props: an M mark each, first, keyed by their placement (and back)', () => {
    const specs = billboardSpecs(groups, [slot(0, 0)], [{ key: 'crate@1,2,3', model: 'crate', at: [1, 2, 3] }]);
    expect(specs[0]).toEqual({ key: 'prop:crate@1,2,3', kind: 'mapProps', label: 'crate', at: [1, 2, 3] });
    expect(MAP_DATA_MARKS['mapProps']!.glyph).toBe('M');
    expect(placementOfMark(specs[0]!.key)).toBe('crate@1,2,3');
    expect(placementOfMark('door:0')).toBeNull();
  });

  it('the user\'s own placements are kinds of their own, under User data, each drawn square (the map\'s are round)', () => {
    const user = MAP_DATA_KIND_TOGGLES.filter((t) => t.group === 'user');
    expect(user.map((t) => t.id)).toEqual(['userProps', 'userSpawns', 'userNpcs', 'userEscortees', 'userTacZones', 'userTacPoints', 'userScenicViews', 'userTurrets', 'userDoors', 'userLadders', 'userGates', 'userObjectives', 'userActions']);
    expect(userMarkKind({ hostage: true })).toBe('userEscortees');
    expect(userMarkKind({ zone: true })).toBe('userTacZones');
    expect([userMarkKind({ point: true }), userMarkKind({ view: true }), userMarkKind({ turret: true }), userMarkKind({ door: true })]).toEqual(['userTacPoints', 'userScenicViews', 'userTurrets', 'userDoors']);
    expect(userMarkKind({ piece: true, ladder: true })).toBe('userLadders');           // a placed ladder: a piece, marked as a ladder
    expect(user.find((t) => t.id === 'userSpawns')!.kinds).toEqual(['userSpawnA', 'userSpawnB']);
    for (const k of user.flatMap((t) => t.kinds)) expect(MAP_DATA_MARKS[k]!.shape, k).toBe('square');
    for (const t of MAP_DATA_KIND_TOGGLES.filter((x) => x.group === 'map')) for (const k of t.kinds) expect(MAP_DATA_MARKS[k]!.shape ?? 'disc', k).toBe('disc');
    expect(userMarkKind({ piece: true })).toBe('userProps');
    expect(userMarkKind({ team: 'B' })).toBe('userSpawnB');
    expect(userMarkKind({ npc: true })).toBe('userNpcs');
    expect(user.find((t) => t.id === 'userObjectives')!.kinds).toEqual(['userBombStart']);
    expect(userMarkKind({ bomb: 'start' })).toBe('userBombStart');
    expect(userMarkKind({ bomb: 'terrorist' })).toBe('userSiteTerrorist');
    // A placed spawn wears the disc spawn slot's colours (`../overlays` SPAWN_COLOURS): only its shape tells it apart.
    expect([MAP_DATA_MARKS['userSpawnA']!.colour, MAP_DATA_MARKS['userSpawnB']!.colour]).toEqual([MAP_DATA_MARKS['slotA']!.colour, MAP_DATA_MARKS['slotB']!.colour]);
    expect([MAP_DATA_MARKS['slotA']!.colour, MAP_DATA_MARKS['slotB']!.colour]).toEqual(['#4d9bff', '#ff6a3d']);
    // A spawn by its side: Ss the SEALs' (side A, 0), St the Terrorists' (side B, 1), the map's slots and the user's alike.
    expect([MAP_DATA_MARKS['slotA']!.glyph, MAP_DATA_MARKS['slotB']!.glyph]).toEqual(['Ss', 'St']);
    expect([MAP_DATA_MARKS['respawnA']!.glyph, MAP_DATA_MARKS['respawnB']!.glyph]).toEqual(['Rs', 'Rt']);
    expect(billboardSpecs([{ key: 'respawns', label: 'Respawn Points', rows: [{ key: 'respawn:B1', label: 'Respawn B1', title: '', at: [0, 0, 0], kind: 'respawnB' }] }], [])[0]!.kind)
      .toBe('respawnB');                                                                     // a row's own kind over its branch's
    // A user kind with a map counterpart is that kind's letter and colour; only its shape (square) differs.
    for (const [user, map] of [['userProps', 'mapProps'], ['userSpawnA', 'slotA'], ['userSpawnB', 'slotB'], ['userBombStart', 'bombStart'], ['userEscortees', 'escortees'], ['userTacZones', 'tacZones'], ['userTacPoints', 'tacPoints'], ['userScenicViews', 'scenicViews'], ['userTurrets', 'turrets'], ['userDoors', 'doors'], ['userLadders', 'ladders'], ['userGates', 'gates'], ['userBarriers', 'actions'], ['userSiteSeal', 'actions'], ['userSiteTerrorist', 'actions']] as const) {
      expect([MAP_DATA_MARKS[user]!.glyph, MAP_DATA_MARKS[user]!.colour], user).toEqual([MAP_DATA_MARKS[map]!.glyph, MAP_DATA_MARKS[map]!.colour]);
    }
    // The bomb as the disc keeps it, the map's and the user's alike: its start (StartBomb) a switch, its plant sites
    // context actions (MPBOMB), under Context actions.
    expect(MAP_DATA_KIND_TOGGLES.find((t) => t.id === 'bombStart')!.kinds).toEqual(['bombStart']);
    expect(user.find((t) => t.id === 'userActions')!.kinds).toEqual(['userSiteSeal', 'userSiteTerrorist', 'userBarriers']);   // a placed C4 barrier a context action too
    expect(userMarkKind({})).toBeNull();
  });

  it('nothing on the map: no billboards', () => {
    expect(billboardSpecs([], [])).toEqual([]);
  });

  it('the dropdown pairs each user kind with its map kind on one row; one with no counterpart has an empty cell', async () => {
    const { billboardRows } = await import('../../src/forge/mapDataBillboards');
    const rows = billboardRows().map((r) => [r.user?.id ?? null, r.map?.id ?? null]);
    expect(rows).toContainEqual(['userTurrets', 'turrets']);
    expect(rows).toContainEqual(['userDoors', 'doors']);
    expect(rows).toContainEqual(['userGates', 'gates']);
    expect(rows).toContainEqual(['userObjectives', 'bombStart']);
    expect(rows).toContainEqual(['userActions', 'actions']);
    expect(rows).toContainEqual(['userNpcs', null]);                     // no map NPCs
    expect(rows).toContainEqual([null, 'respawns']);                     // no user respawn points
    expect(rows).toContainEqual([null, 'flares']);
    // Every switch once, the map's in its own order.
    expect(rows.flatMap(([u, m]) => [u, m]).filter(Boolean).sort()).toEqual(MAP_DATA_KIND_TOGGLES.map((t) => t.id).sort());
    expect(rows.flatMap(([, m]) => (m ? [m] : []))).toEqual(MAP_DATA_KIND_TOGGLES.filter((t) => t.group === 'map').map((t) => t.id));
    expect(rows.findIndex(([u]) => u === 'userNpcs')).toBe(rows.findIndex(([u]) => u === 'userSpawns') + 1);   // beside its user neighbour
  });
});
