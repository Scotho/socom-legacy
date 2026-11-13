import { describe, expect, it } from 'vitest';
import { facingVector, type SpawnSlot } from '@s2u/scene';
import type { EffectProgram } from '@s2u/scene';
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

describe('mapDataGroups: what a context action does, and what damage sets off (research 171, 174, 175, 209)', () => {
  const prog = (name: string, nodes: string[], ops: EffectProgram['sequences'][number]['ops']): EffectProgram =>
    ({ name, root: 0, flags: 0, nodes, sequences: [{ name: 's', activation: 1, ops }] });
  const record = { valve: '', anims: [] as string[], team: null, range: 32, elevation: -1, points: 0, bitmap: '' };
  const source: MapDataSource = {
    actions: [
      { ...record, node: 'seal_callstrike_1', type: 'SWITCH', typeCode: 2, valve: 'seal_strike1', anims: ['seal_demo_site1'], range: 30, points: 2,
        bitmap: 'action_pull_lever.tif', at: [0, 0, 0], aim: [25, 5, 0] },
      { ...record, node: 'radio_call_1', type: 'SWITCH', typeCode: 2, team: 0, bitmap: 'action_helo.tif', at: [9, 9, 9] },
      { ...record, node: 'access_action1', type: '', typeCode: 8, valve: 'set_access1', anims: ['destroy_access1'], at: [1, 1, 1] },
    ],
    programs: [
      prog('seal_demo_site1', ['NA', 'destroyed', 'healthy'], [{ op: 'active', node: 1, on: true }, { op: 'active', node: 2, on: false },
        { op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: 0, f1: 0, f2: 0 }]),
      prog('destroy_access1', ['NA', 'good_parts', 'whats_left'], [{ op: 'active', node: 1, on: false }, { op: 'active', node: 2, on: true }]),
    ],
    destructibles: [
      { anim: 'access1', targetPath: 'worldmodel/access1=access1/good_parts', health: 1, shield: 17,
        program: prog('access1', ['NA'], [{ op: 'executeAction', anim: 'set_access1' }]), at: [40, 0, 40] },
      { anim: 'plank1', targetPath: 'worldmodel/plankaccess1', health: 0, shield: 0, program: prog('plank1', ['NA'], []), at: [50, 0, 50] },
      { anim: 'nowhere', targetPath: 'worldmodel/nowhere', health: 1, shield: 0, program: prog('nowhere', ['NA'], []) },
    ],
  };
  const groups = mapDataGroups(source, () => 0);
  const group = (key: string) => groups.find((g) => g.key === key)!;

  it('a switch is marked where its collision is (what the player aims at), and says what it turns on and off and fires', () => {
    const row = group('actions').rows[0]!;
    expect(row.at).toEqual([25, 5, 0]);
    expect(row.title).toMatch(/Action button \(SWITCH\)/);
    expect(row.title).toMatch(/turns on destroyed/);
    expect(row.title).toMatch(/turns off healthy/);
    expect(row.title).toMatch(/fires MPBOMB/);
    expect(row.data).toMatchObject({ node: 'seal_callstrike_1', summary: { trigger: 'Action button (SWITCH)', prompt: 'pull lever', team: 'anyone', reach: 30, points: 2,
      shows: ['destroyed'], hides: ['healthy'], weapons: ['MPBOMB'] } });
  });

  it('a radio says its team; a type-less record has no prompt', () => {
    expect(group('actions').rows[1]!.data).toMatchObject({ summary: { team: 'SEALs (team 0)', prompt: 'helo' } });
    expect(group('actions').rows[2]!.title).toMatch(/no prompt/);
  });

  it('a Damage Triggers branch after the context actions: a barrier\'s death runs its action\'s program; a 0-health plank is set off by any hit', () => {
    expect(groups.map((g) => g.key)).toEqual(['actions', 'damage']);
    const [barrier, plank] = group('damage').rows;
    expect(group('damage').label).toBe('Damage Triggers');
    expect(group('damage').rows).toHaveLength(2);                  // one with no place is left out, not put at 0
    expect(barrier).toMatchObject({ label: 'access1 · good_parts', at: [40, 0, 40], kind: 'damage' });
    expect(barrier!.data).toMatchObject({ summary: { actions: ['set_access1'], hides: ['good_parts'], shows: ['whats_left'] } });
    expect(barrier!.title).toMatch(/C4/);
    expect(plank!.title).toMatch(/any hit/);
  });
});
