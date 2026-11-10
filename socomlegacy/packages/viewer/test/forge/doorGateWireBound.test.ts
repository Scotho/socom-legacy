import { describe, expect, it } from 'vitest';
import type { GridParams } from '@s2u/scene';
import type { LoadedMap } from '../../src/loadMap';
import type { MapAction } from '../../src/mapActions';
import { packGround } from '../../src/mover';
import { DOOR_GATE_WIRE_SLOTS, decodeSnapshot, encodeSnapshot } from '../../src/net/codec';
import { emptyLayout, type DoorMarker, type Layout } from '../../src/forge/layout';
import { floorGround } from '../../src/forge/ground';
import { withPlacedAccess, type AccessMarker, type AccessTemplate } from '../../src/forge/placedAccess';
import { withPlacedDoors, type DoorTemplate } from '../../src/forge/placedDoors';
import { checkMap } from '../../src/forge/validate';

/**
 * FP-1a, Codex on #745 (`match/src/forgeSimMap.ts`, a browser/server adaptation, FG.R2): the snapshot writes the doors
 * and gates as ONE tail behind a u8 count (`../../src/net/codec.ts` `encodeSnapshot`; the room's `[...doorWire,
 * ...gateWire]`, `match/src/room.ts` MAP-07), so a room holding more than `DOOR_GATE_WIRE_SLOTS` (2^8 - 1 = 255) would
 * send the first 255 and leave the rest without the room's state. The bound lives in the shared compose
 * (`withPlacedDoors`, `withPlacedAccess`: the page's Play and the room both run them), the base's own first: a placed
 * door or gate past it is left out and counted (`pastBound`), never truncated on the wire; the room refuses a layout
 * with any (`forgeSimMap.ts` `ForgeDoorsPastWire`, central `test/forgeDoorGateWireBound.test.ts`), and the page's Check
 * says it before Play. The codec's own door cases are `../netCodec.test.ts` ("carries the doors, two bytes each").
 */
const grid: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const sweep = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const action = (node: string, type: string, typeCode: number): MapAction => ({
  node, type, typeCode, valve: node, anims: [], team: null, range: 15, elevation: 15, points: 0, bitmap: '', path: `worldmodel/${node}`, at: [0, 0, 0],
});
const doorSpec = (i: number) => ({ index: i, node: `d${i}`, path: `worldmodel/d${i}`, valve: `d${i}`, local: identity, parent: identity, owners: [], sweep });
const gateSpec = (i: number) => ({ index: i, node: `g${i}`, path: `worldmodel/g${i}`, local: identity, parent: identity, owners: [], sweep, open: [0, 0, 10] as [number, number, number], seconds: 1, levers: [] });

/** A base holding `doors` doors and `gates` gates of its own (only their count matters here). */
function base(doors: number, gates: number): LoadedMap {
  return {
    archive: 'MP2', path: 'RUN/MP2.ZDB', world: [], lines: null, props: [], turrets: [], textures: {}, textureFlags: {}, actions: [],
    doors: Array.from({ length: doors }, (_, i) => doorSpec(i)), gates: Array.from({ length: gates }, (_, i) => gateSpec(i)),
    ground: packGround(grid, [], []),
    meta: { actions: [], instances: [], instanceByPath: new Map(), initial: [], scene: { destructibles: [], programs: [] } },
  } as unknown as LoadedMap;
}
const door = { source: 'MP2', name: 'bdoor_4', lib: base(0, 0), pieces: [], owners: [], spec: doorSpec(0), action: action('bdoor_4', 'DOOR', 0) } as unknown as DoorTemplate;
const access = (kind: 'gate' | 'barrier'): AccessTemplate => ({
  kind, source: 'MP11', name: 'access1', root: 'worldmodel/access1', lib: base(0, 0), anchor: [0, 0, 0],
  instances: [], initial: [], owners: [], pieces: [], destructibles: [], actions: [],
  gate: kind === 'gate' ? { spec: { ...gateSpec(0), path: 'worldmodel/access1/leaf' }, levers: [] } : null,
});
const doors = (n: number): DoorMarker[] => Array.from({ length: n }, (_, i) => ({ source: 'MP2', name: 'bdoor_4', at: [i, 0, 0], yaw: 0 }));
const markers = (kind: 'gate' | 'barrier', n: number): (AccessMarker & { at: [number, number, number] })[] =>
  Array.from({ length: n }, (_, i) => ({ kind, source: 'MP11', name: 'access1', at: [i, 0, 0], yaw: 0 }));

describe("placed doors and gates: the snapshot's one u8-counted tail", () => {
  it('the bound is the u8 count the codec writes, and the codec sends no more than it', () => {
    expect(DOOR_GATE_WIRE_SLOTS).toBe(2 ** 8 - 1);
    const many = Array.from({ length: DOOR_GATE_WIRE_SLOTS + 1 }, (_, i) => ({ valve: i % 2, phase: i % 255 }));
    expect(decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [], doors: many })).doors).toHaveLength(DOOR_GATE_WIRE_SLOTS);
  });

  it('withPlacedDoors places up to the bound, the base\'s doors and gates first, and counts the rest past it', () => {
    const own = base(3, 2);
    const at = withPlacedDoors(own, doors(DOOR_GATE_WIRE_SLOTS - 5), () => door);
    expect([at.map.doors!.length + at.map.gates!.length, at.unplaced, at.pastBound]).toEqual([DOOR_GATE_WIRE_SLOTS, 0, 0]);
    const over = withPlacedDoors(own, doors(DOOR_GATE_WIRE_SLOTS - 5 + 2), () => door);
    expect([over.map.doors!.length, over.unplaced, over.pastBound]).toEqual([DOOR_GATE_WIRE_SLOTS - 2, 0, 2]);
    // A door whose template is not found takes no slot: unplaced, not past the bound.
    const lost = withPlacedDoors(own, doors(DOOR_GATE_WIRE_SLOTS - 5 + 1), (_s, _n) => null);
    expect([lost.unplaced, lost.pastBound]).toEqual([DOOR_GATE_WIRE_SLOTS - 5 + 1, 0]);
  });

  it('withPlacedAccess counts a gate past the bound (after the doors); a barrier takes no slot', () => {
    const full = withPlacedDoors(base(1, 0), doors(DOOR_GATE_WIRE_SLOTS - 2), () => door).map;   // one slot left
    const out = withPlacedAccess(full, [...markers('gate', 3), ...markers('barrier', 2)], (m) => access(m.kind));
    expect([out.map.doors!.length + out.map.gates!.length, out.unplaced, out.pastBound]).toEqual([DOOR_GATE_WIRE_SLOTS, 0, 2]);
    expect(out.map.meta!.instances.length).toBe(0);   // nothing of a left-out gate is copied (these templates hold none)
    const room = withPlacedAccess(base(0, 0), markers('gate', 2), (m) => access(m.kind));
    expect([room.map.gates!.length, room.pastBound]).toEqual([2, 0]);
  });

  it("Check names the doors and gates past the snapshot's 255, the base's own counted first", () => {
    const at = (baseDoors: number, placedDoors: number, placedGates: number): string[] => {
      const l: Layout = { ...emptyLayout({ kind: 'blank', library: 'floor' }), doors: doors(placedDoors), gates: markers('gate', placedGates).map(({ kind: _k, ...g }) => g) };
      return checkMap(l, floorGround(2000), [], undefined, undefined, { hostages: 0, zones: 0, doors: baseDoors }).issues
        .filter((i) => i.kind === 'door-bound').map((i) => i.text);
    };
    expect(at(5, DOOR_GATE_WIRE_SLOTS - 5, 0)).toEqual([]);
    expect(at(5, DOOR_GATE_WIRE_SLOTS - 5, 1)).toEqual(["1 door or gate past the room's 255: a lobby refuses the layout, and Play leaves it out."]);
    expect(at(0, 256, 1)).toEqual(["2 doors or gates past the room's 255: a lobby refuses the layout, and Play leaves them out."]);
    expect(at(0, 3, 2)).toEqual([]);
  });
});
