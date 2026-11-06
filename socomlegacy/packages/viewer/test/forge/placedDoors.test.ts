import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { copiedDoor, doorHinge, doorMove, doorTemplates, placedDoorName, withPlacedDoors } from '../../src/forge/placedDoors';

/**
 * The layout's placed doors (a browser adaptation, FG.R2): a copy of a disc map's own door moved to a new hinge and
 * turn -- its props, its leaf's polygons (packed into the hull after the map's own owners, its swing's footprint about
 * the new hinge), its DoorSpec and its DOOR action, its node, valve and paths renamed so each copy keeps its own state.
 * Disc-backed (`SOCOM_ISO`): Frostfire's own doors, copied onto themselves, are themselves; a copy elsewhere swings.
 */
const ISO = process.env['SOCOM_ISO'];

describe('placed doors', () => {
  it('names each copy forge_door_<n>, its node, valve and path alike', () => {
    expect(placedDoorName(0)).toBe('forge_door_1');
  });
});

describe.skipIf(!ISO || !existsSync(ISO))('placed doors on the disc (SOCOM_ISO)', () => {
  const load = async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    return loadMap(new IsoAssetSource(fsBlob(ISO!)), 'RUN/MP2.ZDB');
  };

  it("a copy of each of Frostfire's doors at its own hinge and turn is that door: its matrices, polygons and footprint", async () => {
    const map = await load();
    const templates = doorTemplates(map, 'MP2');
    expect(templates.map((t) => t.name)).toEqual(['bdoor_4', 'wdoor_1', 'wdoor_2']);
    for (const t of templates) {
      expect(t.owners.length, t.name).toBeGreaterThan(0);
      expect(t.pieces.length, t.name).toBeGreaterThan(0);
      expect(t.action?.bitmap, t.name).toBe('action_door_open.tif');
      const copy = copiedDoor(t, doorMove(t, doorHinge(t.spec), 0), 'forge_door_1', 9, 400);
      copy.spec.parent.forEach((v, i) => expect(v, t.name).toBeCloseTo(t.spec.parent[i]!, 4));
      const own = t.owners.flatMap((o) => o.polys.flatMap((p) => Array.from(p.points)));
      copy.polys.flatMap((p) => Array.from(p.points)).forEach((v, i) => expect(v, t.name).toBeCloseTo(own[i]!, 3));
      expect(copy.spec.sweep.minX).toBeCloseTo(t.spec.sweep.minX, 3);
      expect([copy.spec.index, copy.spec.owners[0], copy.spec.valve, copy.spec.path]).toEqual([9, 400, 'forge_door_1', 'worldmodel/forge_door_1']);
    }
  }, 120_000);

  it('a copy placed elsewhere joins the hull after its own owners and swings when used: its polygons turn, the map\'s stay', async () => {
    const map = await load();
    const [t] = doorTemplates(map, 'MP2');
    const { DoorSet } = await import('../../src/doors');
    const { map: placed, unplaced } = withPlacedDoors(map, [{ source: 'MP2', name: 'bdoor_4', at: [600, 142, 1300], yaw: Math.PI / 2 }], () => t!);
    expect(unplaced).toBe(0);
    const doors = placed.doors!;
    expect(doors.length).toBe(map.doors!.length + 1);
    const mine = doors[doors.length - 1]!;
    expect(mine.owners.every((o) => o >= map.ground!.owners.length)).toBe(true);
    expect(placed.ground!.owners[mine.owners[0]!]!.path.startsWith('worldmodel/forge_door_1/')).toBe(true);
    const set = new DoorSet(doors, placed.ground!, {});
    const before = Array.from(placed.ground!.points);
    expect(set.use(doors.length - 1, [600, 142, 1310], 1, 0)).toBe(true);
    for (let i = 0; i < 120; i++) set.step(1 / 30);
    const after = Array.from(placed.ground!.points);
    const changed = after.some((v, i) => Math.abs(v - before[i]!) > 0.5);
    expect(changed, 'the copy\'s leaf turned in the hull').toBe(true);
    expect(set.state(0).open).toBe(false);                     // the map's own door untouched
  }, 120_000);
});
