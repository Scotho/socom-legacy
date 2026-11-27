import { describe, expect, it } from 'vitest';
import { followDoorAt, followDoorCells, HOSTAGE_DOOR_ACTION_READING, type DoorMarker } from '../src/hostageDoors';

/**
 * WM-HOSTAGE task 2 (research 428 s3, s5 item 2): which bound markers a follower may use as a door -- type 1 only
 * (`HOSTAGE_DOOR_ACTION_READING`: the walker's table sends type 1 to the push; types 4 and 7 elsewhere, the rest steer),
 * and only an action that is a door of the room's door set, matched by node case-insensitively (the first of a name).
 */
const marker = (x: number, type: number, node: string): [string, DoorMarker] =>
  [`0,${x},5`, { loc: { map: 0, x, z: 5 }, type, action: x, node }];

describe('followDoorCells: the type-1 markers bound to a door of the room', () => {
  it('maps a type-1 marker to its door index; other types and non-door actions are none', () => {
    expect(HOSTAGE_DOOR_ACTION_READING).toEqual({ type: 1, wanted: 1, pick: 0 });
    const markers = new Map([marker(1, 1, 'DOOR_RG_1'), marker(2, 2, 'door_a'), marker(3, 7, 'door_a'), marker(4, 1, 'switch_1'), marker(5, 1, 'door_a')]);
    const cells = followDoorCells(markers, ['door_b', 'door_rg_1', 'door_a', 'Door_A']);
    expect([...cells]).toEqual([['0,1,5', 1], ['0,5,5', 2]]);
    expect(followDoorAt(cells, { map: 0, x: 1, z: 5 })).toBe(1);
    expect(followDoorAt(cells, { map: 1, x: 1, z: 5 })).toBeNull();
    expect(followDoorAt(cells, { map: 0, x: 4, z: 5 })).toBeNull();
  });
});
