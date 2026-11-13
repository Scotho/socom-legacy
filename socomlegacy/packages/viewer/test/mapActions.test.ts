import { describe, expect, it } from 'vitest';
import { parseZdb } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  actionAtPick, actionInReach, actionRecordsOf, MAP_ACTION_CAPTION_OTHER_TYPES_READING, MAP_ACTION_TCM_CAPTION_READING, MAP_ACTION_TYPE_CAPTIONS,
  mapActionCaption, readActionRecords,
  readMapActions, type MapAction,
} from '../src/mapActions';

/** The map's own context actions (socomlegacy/docs/research/87-hud.md §5): `READERM.ZAR/actions.rdr` on placed nodes. */

/** A typed record as `readMapActions` makes it (research 209 §2): the defaults are `FUN_002b49f0`'s. */
const action = (node: string, at: [number, number, number], o: Partial<MapAction> = {}): MapAction => ({
  node, path: `worldmodel/${node}`, type: 'DOOR', typeCode: 0, valve: node, anims: ['singleDoor_right'], team: null,
  range: 30, elevation: -1, points: 0, bitmap: 'action_door_open.tif', descriptor: '', at, ...o,
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
      ['node', ['r'], 'type', ['SWITCH'], 'team', ['0'], 'elevation', ['15'], 'descriptor', ['GATE SWITCH'], 'tcm', ['1']],
      ['node', ['b'], 'type', ['ACT_BREACH']], ['node', ['w'], 'type', ['WINDOW']], ['node', ['x'], 'type', ['DEFUSE']],
      ['node', ['s'], 'type', ['SATCHEL']], ['node', ['i'], 'type', ['ITEM']], ['node', ['m'], 'type', ['MPBOMB']], ['node', ['q'], 'type', ['BREACH']],
    ]]];
    const records = actionRecordsOf(script);
    expect(records[0]).toEqual({ node: 'd', type: 'DOOR', typeCode: 0, valve: 'd', anims: ['swing', 'kick'], team: null, range: 30, elevation: -1, points: 0, bitmap: 'action_door_open.tif', descriptor: '', tcm: false });
    expect(records[1]).toEqual({ node: 'a', type: '', typeCode: 8, valve: 'set_a', anims: ['destroy_a'], team: null, range: 32, elevation: -1, points: 2, bitmap: '', descriptor: '', tcm: false });
    // G1 (action-labels review): the `descriptor` key (the loader's `FUN_0032ee10(.., 0x3f2118 "descriptor")`
    // D:L157285, kept at the action's +0x2c D:L157318-157321) as written, '' when absent.
    expect(records[2]).toMatchObject({ node: 'r', typeCode: 2, team: 0, elevation: 15, range: 32, descriptor: 'GATE SWITCH', tcm: true });
    // Review S2: `tcm` is the key's presence (`FUN_0032f0d0(.., 0x3f21c8 "tcm")` sets `+0x3f` bit 2, D:L157420-157422).
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

/**
 * G1 of the action-labels review (`agent-mail/evidence/v0420/action-labels-review/REPORT.md` s3; reading, pending review):
 * a map action's caption. `FUN_002209c0` sets the record's text from the action's +0x2c (`descriptor`) when set, else
 * from `FUN_002b48e0` by its type (D:L74567-74582); `FUN_002b48e0` gives OPEN DOOR, or CLOSE DOOR when the valve's short
 * (+0x18's +4) is non-zero, for type 0 and FLIP SWITCH for type 2 (D:L156975-156984). Other types: not ported yet.
 */
describe('mapActionCaption (G1)', () => {
  it('the descriptor when set; else OPEN DOOR / CLOSE DOOR by the valve for a DOOR, FLIP SWITCH for a SWITCH; other types none yet', () => {
    expect(MAP_ACTION_TYPE_CAPTIONS).toEqual({
      open: { at: 0x3de62c, text: 'OPEN DOOR' }, close: { at: 0x3de628, text: 'CLOSE DOOR' }, flip: { at: 0x3de630, text: 'FLIP SWITCH' },
    });
    const door = action('d', [0, 0, 0]);
    expect(mapActionCaption(door, 0)).toBe('OPEN DOOR');
    expect(mapActionCaption(door, 1)).toBe('CLOSE DOOR');
    expect(mapActionCaption(door, -1)).toBe('CLOSE DOOR');                    // any non-zero short
    const lever = action('l', [0, 0, 0], { type: 'SWITCH', typeCode: 2 });
    expect(mapActionCaption(lever, 0)).toBe('FLIP SWITCH');
    expect(mapActionCaption(lever, 1)).toBe('FLIP SWITCH');                   // the valve is read for type 0 only
    expect(mapActionCaption({ ...lever, descriptor: 'GATE SWITCH' }, 0)).toBe('GATE SWITCH');
    expect(mapActionCaption({ ...door, descriptor: 'BACK DOOR' }, 1)).toBe('BACK DOOR');
    // Any type with a descriptor shows it (D:L74574-74580 asks no type); without one, the other types are unported.
    expect(mapActionCaption(action('x', [0, 0, 0], { type: 'DEFUSE', typeCode: 3, descriptor: 'CUT WIRE' }), 0)).toBe('CUT WIRE');
    for (const typeCode of [1, 3, 4, 5, 6, 7, 8]) expect(mapActionCaption(action('x', [0, 0, 0], { typeCode }), 0)).toBeNull();
    expect(MAP_ACTION_CAPTION_OTHER_TYPES_READING).toMatch(/^none/);
    // Review S2: a `tcm` action is drawn the text at 0x436500 or PLEASE ADD TO MISSION.RDR, never its descriptor or type
    // text (`FUN_00220350` D:L74405-74416): unported, so none; one without `tcm` unchanged.
    expect(mapActionCaption({ ...lever, descriptor: 'CALL AIRSTRIKE', tcm: true }, 0)).toBeNull();
    expect(mapActionCaption({ ...door, tcm: true }, 0)).toBeNull();
    expect(mapActionCaption({ ...lever, descriptor: 'CALL AIRSTRIKE', tcm: false }, 0)).toBe('CALL AIRSTRIKE');
    expect(MAP_ACTION_TCM_CAPTION_READING).toMatch(/^none/);
  });
});

/** G1: every fixture map that holds action records, through the repository's reader: what each record's descriptor is. */
describe("the fixture maps' descriptors (G1)", () => {
  for (const stem of ['MP2', 'MP6', 'MP71', 'MP72']) {
    const b = fixture(`RUN/${stem}.ZDB`);
    it.skipIf(b === null)(`${stem}: its records read, and none carries a descriptor${b === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
      const { records, error } = readActionRecords(b!, parseZdb(b!));
      expect(error).toBeUndefined();
      expect(records.length).toBeGreaterThan(0);
      expect(records.filter((r) => r.descriptor !== '').map((r) => [r.node, r.descriptor])).toEqual([]);
    });
  }
  it.skipIf(mp72 === null)("Crossroads' two levers (the Red Room's among them) caption FLIP SWITCH from their real records", () => {
    const { actions } = readMapActions(mp72!, parseZdb(mp72!), 'MP72');
    for (const node of ['seal_callstrike_1', 'terrorist_callstrike_1']) {
      const a = actions.find((x) => x.node === node)!;
      expect([a.typeCode, a.descriptor, mapActionCaption(a, 0)]).toEqual([2, '', 'FLIP SWITCH']);
    }
  });
  it.skipIf(bytes === null)("Frostfire's doors caption OPEN DOOR shut and CLOSE DOOR open from their real records", () => {
    const { actions } = readMapActions(bytes!, parseZdb(bytes!), 'MP2');
    expect(actions.map((a) => [a.node, mapActionCaption(a, 0), mapActionCaption(a, 1)])).toEqual([
      ['bdoor_4', 'OPEN DOOR', 'CLOSE DOOR'], ['wdoor_1', 'OPEN DOOR', 'CLOSE DOOR'], ['wdoor_2', 'OPEN DOOR', 'CLOSE DOOR'],
    ]);
  });
});

/** G1 on the disc (SOCOM_DISC, or SOCOM_PC_ROOT's game/disc; skips without it): each type text is the ELF's at its pointer. */
const G1_DISC = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game', 'disc') : undefined);
const G1_ELF = G1_DISC ? resolve(G1_DISC, 'socom2_game.elf') : null;
describe.skipIf(!G1_ELF || !existsSync(G1_ELF))("G1 on the disc: FUN_002b48e0's three texts and the loader's descriptor key", () => {
  it('the pointers at 0x3de62c, 0x3de628 and 0x3de630 name OPEN DOOR, CLOSE DOOR and FLIP SWITCH; 0x3f2118 is "descriptor"', async () => {
    const { ElfImage } = await import('../../../tools/elfImage');
    const elf = new ElfImage(new Uint8Array(readFileSync(G1_ELF!)));
    for (const c of Object.values(MAP_ACTION_TYPE_CAPTIONS)) expect(elf.cstr(elf.u32(c.at)), c.text).toBe(c.text);
    expect(elf.cstr(0x3f2118)).toBe('descriptor');
    expect([elf.cstr(0x3f21c8), elf.cstr(0x3e4f30)]).toEqual(['tcm', 'PLEASE ADD TO MISSION.RDR']);   // review S2
  });
});
