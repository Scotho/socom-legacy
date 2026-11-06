import { describe, expect, it } from 'vitest';
import { facingVector, type SpawnSlot } from '@s2u/scene';
import { mapDataGroups, type MapDataSource } from '../../src/forge/mapData';

/**
 * The Outliner's Map Data branches beyond the props and the spawn slots (a browser adaptation, FG.R2): each kind of the
 * map's own data a branch of rows, read only, in the file's order -- a row its name, its place (or a view to take).
 */
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const slot = (side: 0 | 1, index: number): SpawnSlot => ({
  side, index, position: [index, 0, side], onFloor: true, step: 0, facing: facingVector(0), loc: { map: 0, x: 0, z: 0 },
});

const source: MapDataSource = {
  respawns: [slot(1, 0), slot(0, 0)],
  escortees: [{ name: 'Hostage1', character: 'thai_wife', at: [1, 2, 3] }],
  bombStart: [10, 20, 30],
  turrets: [{ id: 0, name: 'mp72_turret01', origin: [4, 5, 6] }],
  doors: [
    { index: 0, node: 'bdoor_1', local: [...I.slice(0, 12), 7, 8, 9, 1], parent: [...I.slice(0, 12), 100, 0, 0, 1] },
    { index: 1, node: 'bdoor_2', local: I, parent: I },
  ],
  gates: [{ index: 0, node: 'gate_a', local: [...I.slice(0, 12), 1, 1, 1, 1], parent: I }],
  cranes: [{ index: 0, node: 'hook_1', control: { at: [3, 3, 3] } }],
  actions: [
    { node: 'bdoor_2', type: 'DOOR', at: [50, 0, 50] },
    { node: 'radio_1', type: 'RADIO', at: [9, 9, 9] },
    { node: 'ladder_3', type: '', at: [2, 0, 2] },
    { node: 'seal_tent', type: 'MPBOMB', at: [60, 0, 60] },
    { node: 'terrorist_tent', type: 'MPBOMB', at: [70, 0, 70] },
  ],
  tac: { points: [{ name: 'Alpha', kind: 0, x: 5, z: 6 }], zones: [{ name: 'Courtyard', kind: 1, minX: 0, minZ: 0, maxX: 100, maxZ: 40 }] },
  scenicViews: [{ name: 'Overlook', at: [1, 50, 2], pitch: -20, yaw: 90, roll: 0 }],
  flares: [{ name: 'flare01', at: [4, 40, 4] }],
  ladders: [{ path: 'worldmodel/ladder=ladder/di_ladder', x: 10, z: 20, bottom: 0, top: 60 }],
};

describe('mapDataGroups', () => {
  const groups = mapDataGroups(source, (x, z) => x + z);
  const group = (key: string) => groups.find((g) => g.key === key)!;

  it('names a branch for each kind the map has, in a fixed order', () => {
    expect(groups.map((g) => g.label)).toEqual([
      'Respawn Points', 'Hostages', 'Bomb Start', 'Turrets', 'Doors', 'Gates', 'Cranes', 'Ladders', 'Context Actions', 'Tactical Points', 'Tactical Zones', 'Spectator Views', 'Flares',
    ]);
  });

  it('a ladder (the hull\'s own, no object) at its foot, by its owner node\'s name, framed for its height', () => {
    expect(group('ladders').rows[0]).toMatchObject({ label: 'di_ladder', at: [10, 0, 20], reach: 60 });
    expect(group('ladders').rows[0]!.title).toMatch(/60 tall/);
  });

  it('a flare (the map\'s facing light glows, the sun and the sky\'s too) at its own place, by its node\'s name', () => {
    expect(group('flares').rows[0]).toMatchObject({ label: 'flare01', at: [4, 40, 4] });
  });

  it('respawns side A then B; hostages, the bomb start and the turrets at their own place', () => {
    expect(group('respawns').rows.map((r) => r.label)).toEqual(['Respawn A1', 'Respawn B1']);
    expect(group('respawns').rows.map((r) => r.kind)).toEqual(['respawnA', 'respawnB']);   // each its side's mark (Rs, Rt)
    expect(group('escortees').rows[0]).toMatchObject({ label: 'Hostage1', at: [1, 2, 3] });
    expect(group('bombStart').rows[0]).toMatchObject({ label: 'Bomb start', at: [10, 20, 30] });
    expect(group('turrets').rows[0]).toMatchObject({ label: 'mp72_turret01', at: [4, 5, 6] });
  });

  it('a door at its action\'s place, else its node\'s (its matrix through its parent\'s); a gate at its node\'s; a crane at its control', () => {
    expect(group('doors').rows.map((r) => r.at)).toEqual([[107, 8, 9], [50, 0, 50]]);
    expect(group('gates').rows[0]!.at).toEqual([1, 1, 1]);
    expect(group('cranes').rows[0]).toMatchObject({ label: 'hook_1', at: [3, 3, 3] });
  });

  it('context actions leave the doors to their own branch and name an untyped one by its node; a plant site is one (MPBOMB)', () => {
    expect(group('actions').rows.map((r) => r.label)).toEqual(['RADIO · radio_1', 'Action · ladder_3', 'MPBOMB · seal_tent', 'MPBOMB · terrorist_tent']);
    expect(group('actions').rows[2]!.title).toMatch(/the Terrorists plant there/);   // seal_tent (`plantingSideOfNode`)
    expect(group('bombStart').rows.map((r) => r.label)).toEqual(['Bomb start']);
  });

  it('a tactical point and zone take the floor under them; a zone its centre and its size to frame', () => {
    expect(group('tacPoints').rows[0]).toMatchObject({ label: 'Alpha', at: [5, 11, 6] });
    expect(group('tacZones').rows[0]).toMatchObject({ label: 'Courtyard', at: [50, 70, 20] });
    expect(group('tacZones').rows[0]!.reach).toBeGreaterThanOrEqual(100);
  });

  it('a spectator view is a view to take, not a place to look at', () => {
    expect(group('scenicViews').rows[0]).toMatchObject({ label: 'Overlook', view: { x: 1, y: 50, z: 2, yaw: 90, pitch: -20 } });
    expect(group('scenicViews').rows[0]!.at).toBeUndefined();
  });

  it('a map with none of it has no branches', () => {
    expect(mapDataGroups({}, () => 0)).toEqual([]);
  });
});
