import { describe, expect, it } from 'vitest';
import { parseZdb } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { actionAtPick, actionInReach, actionRecordsOf, readMapActions, type MapAction } from '../src/mapActions';

/** The map's own context actions (socomlegacy/docs/research/87-hud.md §5): `READERM.ZAR/actions.rdr` on placed nodes. */

/** A typed record as `readMapActions` makes it (research 209 §2): the defaults are `FUN_002b49f0`'s. */
const action = (node: string, at: [number, number, number], o: Partial<MapAction> = {}): MapAction => ({
  node, path: `worldmodel/${node}`, type: 'DOOR', typeCode: 0, valve: node, anims: ['singleDoor_right'], team: null,
  range: 30, elevation: -1, points: 0, bitmap: 'action_door_open.tif', at, ...o,
});

describe('actionInReach', () => {
  const door = (node: string, at: [number, number, number]): MapAction => action(node, at);
  it('picks the nearest action within its range, of the types asked for', () => {
    const actions = [door('a', [0, 0, 0]), door('b', [20, 0, 0]), { ...door('c', [5, 0, 0]), type: 'MPBOMB' }];
    expect(actionInReach(actions, [14, 0, 0])?.node).toBe('b');
    expect(actionInReach(actions, [4, 0, 0], ['DOOR'])?.node).toBe('a');
    expect(actionInReach(actions, [4, 0, 0])?.node).toBe('c');
    expect(actionInReach(actions, [100, 0, 0])).toBeNull();
    expect(actionInReach(actions, null)).toBeNull();
  });
});

describe('actionRecordsOf', () => {
  it("the loader's defaults (FUN_002b49f0): range 32, elevation -1, no team, points 0, type code 8 without a type; the name switch's codes (D:L157334-157362)", () => {
    const script = [['actions', [
      ['node', ['d'], 'valve', ['d'], 'anim', ['swing', 'kick'], 'type', ['DOOR'], 'range', ['30'], 'bitmap', ['Action_Door_Open.tif']],
      ['node', ['a'], 'valve', ['set_a'], 'anim', ['destroy_a'], 'points', ['2']],
      ['node', ['r'], 'type', ['SWITCH'], 'team', ['0'], 'elevation', ['15']],
      ['node', ['b'], 'type', ['ACT_BREACH']], ['node', ['w'], 'type', ['WINDOW']], ['node', ['x'], 'type', ['DEFUSE']],
      ['node', ['s'], 'type', ['SATCHEL']], ['node', ['i'], 'type', ['ITEM']], ['node', ['m'], 'type', ['MPBOMB']], ['node', ['q'], 'type', ['BREACH']],
    ]]];
    const records = actionRecordsOf(script);
    expect(records[0]).toEqual({ node: 'd', type: 'DOOR', typeCode: 0, valve: 'd', anims: ['swing', 'kick'], team: null, range: 30, elevation: -1, points: 0, bitmap: 'action_door_open.tif' });
    expect(records[1]).toEqual({ node: 'a', type: '', typeCode: 8, valve: 'set_a', anims: ['destroy_a'], team: null, range: 32, elevation: -1, points: 2, bitmap: '' });
    expect(records[2]).toMatchObject({ node: 'r', typeCode: 2, team: 0, elevation: 15, range: 32 });
    expect(records.slice(3).map((r) => [r.node, r.typeCode])).toEqual([['b', 5], ['w', 1], ['x', 3], ['s', 6], ['i', 7], ['m', 4], ['q', 8]]);
  });
});

describe('actionAtPick', () => {
  it('actionAtPick (FUN_005aa240): the hit node or any ancestor up to the root names the action; horizontal reach strictly inside range to the hit point, elevation strictly inside when not -1; valve 99 and type 8 refused', () => {
    const door = action('door', [0, 0, 0], { path: 'worldmodel/house/door' });
    const tent = action('tent', [0, 0, 0], { path: 'worldmodel/tent', type: 'MPBOMB', typeCode: 4, range: 15, elevation: 15, valve: 'mp_bombAA' });
    const access = action('access_action1', [0, 0, 0], { path: 'worldmodel/access_action1', type: '', typeCode: 8, range: 32 });
    const actions = [door, tent, access];
    // The hit node itself, and a node under it: its ancestors name it.
    expect(actionAtPick(actions, { path: 'worldmodel/house/door', point: [10, 50, 0] }, [10, 0, 25])).toBe(door);
    expect(actionAtPick(actions, { path: 'worldmodel/house/door/leaf=leaf/handle', point: [0, 0, 0] }, [0, 0, 0])).toBe(door);
    // Any depth names it: `FUN_005aa470` recurses past its sixth node to the root (D:L463945).
    expect(actionAtPick(actions, { path: 'worldmodel/house/door/a/b/c/d/e/f/g/h/i/j', point: [0, 0, 0] }, [0, 0, 0])).toBe(door);
    expect(actionAtPick(actions, { path: 'worldmodel/house/door/a=a/b/c/d/e/f/g', point: [0, 0, 0] }, [0, 0, 0])).toBe(door);
    // A parent of the node and a name that only starts like it name nothing.
    expect(actionAtPick(actions, { path: 'worldmodel/house', point: [0, 0, 0] }, [0, 0, 0])).toBeNull();
    expect(actionAtPick(actions, { path: 'worldmodel/house/doorframe', point: [0, 0, 0] }, [0, 0, 0])).toBeNull();
    // The reach is on the ground plane, to the reticle's point, strictly inside 30 (D:L463895: exactly 30 is refused),
    // any height while elevation is -1.
    expect(actionAtPick(actions, { path: 'worldmodel/house/door', point: [100, 0, 100] }, [118, 500, 123.9])).toBe(door);
    expect(actionAtPick(actions, { path: 'worldmodel/house/door', point: [100, 0, 100] }, [118, 0, 124])).toBeNull();
    // Elevation 15: the height difference counts too, strictly inside (D:L463898: `elev² <= dy²` refuses).
    expect(actionAtPick(actions, { path: 'worldmodel/tent', point: [0, 10, 0] }, [9, 24.9, 11.9])).toBe(tent);
    expect(actionAtPick(actions, { path: 'worldmodel/tent', point: [0, 10, 0] }, [9, 25, 11.9])).toBeNull();
    expect(actionAtPick(actions, { path: 'worldmodel/tent', point: [0, 10, 0] }, [9, -5, 11.9])).toBeNull();
    expect(actionAtPick(actions, { path: 'worldmodel/tent', point: [0, 10, 0] }, [9, 10, 12])).toBeNull();
    // A locked valve (99) and the type-less action (code 8) are refused.
    expect(actionAtPick(actions, { path: 'worldmodel/house/door', point: [0, 0, 0] }, [0, 0, 0], (v) => (v === 'door' ? 99 : 0))).toBeNull();
    expect(actionAtPick(actions, { path: 'worldmodel/house/door', point: [0, 0, 0] }, [0, 0, 0], (v) => (v === 'door' ? 1 : 0))).toBe(door);
    expect(actionAtPick(actions, { path: 'worldmodel/access_action1', point: [0, 0, 0] }, [0, 0, 0])).toBeNull();
  });
});

const bytes = fixture('RUN/MP2.ZDB');
describe.skipIf(bytes === null)(`Frostfire's actions${bytes === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('are its three doors, 30 units of reach, the door icon, where the scene graph places the nodes', () => {
    const { actions, diagnostics } = readMapActions(bytes!, parseZdb(bytes!), 'MP2');
    expect(diagnostics).toEqual([]);
    expect(actions.map((a) => [a.node, a.type, a.range, a.bitmap])).toEqual([
      ['bdoor_4', 'DOOR', 30, 'action_door_open.tif'],
      ['wdoor_1', 'DOOR', 30, 'action_door_open.tif'],
      ['wdoor_2', 'DOOR', 30, 'action_door_open.tif'],
    ]);
    const at = Object.fromEntries(actions.map((a) => [a.node, a.at.map((v) => Math.round(v * 10) / 10)]));
    expect(at).toEqual({ bdoor_4: [588.8, 142, 1117], wdoor_1: [765, 142, 991], wdoor_2: [897.5, 100, 995] });
  });

  it("keeps valve, anim list, team, elevation and points on every record: Frostfire's three doors carry their valve and singleDoor_right, elevation -1, points 0", () => {
    const { actions } = readMapActions(bytes!, parseZdb(bytes!), 'MP2');
    expect(actions.map((a) => [a.node, a.path, a.typeCode, a.valve, a.anims, a.team, a.elevation, a.points])).toEqual([
      ['bdoor_4', 'worldmodel/bdoor_4', 0, 'bdoor_4', ['singleDoor_right'], null, -1, 0],
      ['wdoor_1', 'worldmodel/wdoor_1', 0, 'wdoor_1', ['singleDoor_right'], null, -1, 0],
      ['wdoor_2', 'worldmodel/wdoor_2', 0, 'wdoor_2', ['singleDoor_right'], null, -1, 0],
    ]);
  });
});

const mp72 = fixture('RUN/MP72.ZDB');
describe.skipIf(mp72 === null)(`Crossroads' actions${mp72 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('Crossroads: seal_callstrike_1 / terrorist_callstrike_1 are SWITCH, valves seal_strike1 / terrorist_strike1, anims *_demo_site1, range 30, points 2; the tents MPBOMB, range 15, elevation 15', () => {
    const { actions, diagnostics } = readMapActions(mp72!, parseZdb(mp72!), 'MP72');
    expect(diagnostics).toEqual([]);
    expect(actions.map((a) => [a.node, a.type, a.typeCode, a.valve, a.anims, a.range, a.elevation, a.points, a.team, a.bitmap])).toEqual([
      ['terrorist_tent', 'MPBOMB', 4, 'mp_bombAA', ['BombPlace'], 15, 15, 0, null, 'action_mp_bomb.tif'],
      ['seal_tent', 'MPBOMB', 4, 'mp_bombBB', ['BombPlace'], 15, 15, 0, null, 'action_mp_bomb.tif'],
      ['seal_callstrike_1', 'SWITCH', 2, 'seal_strike1', ['seal_demo_site1'], 30, -1, 2, null, 'action_pull_lever.tif'],
      ['terrorist_callstrike_1', 'SWITCH', 2, 'terrorist_strike1', ['terrorist_demo_site1'], 30, -1, 2, null, 'action_pull_lever.tif'],
    ]);
  });
});

const mp6 = fixture('RUN/MP6.ZDB');
describe.skipIf(mp6 === null)(`Desert Glory's actions${mp6 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("a type-less record is type code 8 with the loader's default reach 32: Desert Glory's access_action1, valve set_access1, points 2", () => {
    const { actions } = readMapActions(mp6!, parseZdb(mp6!), 'MP6');
    const a = actions.find((x) => x.node === 'access_action1');
    expect(a && [a.type, a.typeCode, a.valve, a.anims, a.range, a.elevation, a.points, a.bitmap]).toEqual(['', 8, 'set_access1', ['destroy_access1'], 32, -1, 2, '']);
    expect(actions.find((x) => x.node === 'cdoor1')?.typeCode).toBe(0);
  });
});
