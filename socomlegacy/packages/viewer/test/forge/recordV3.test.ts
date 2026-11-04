import { describe, expect, it } from 'vitest';
import { History, recordEdit, decodeHistoryStep } from '../../src/forge/history';
import { parseLayout, serializeLayout, withIds, type ForgeObjectives, type Layout } from '../../src/forge/layout';
import { applyForgeObjectives, forgeBombActions, type ObjectiveMap } from '../../src/forge/objectives';
import { checkRecord, layoutOfRecord, readSaved, RECORD_POSITION_DENOMINATOR, RECORD_VERSION, recordOfLayout, type LayoutRecord } from '../../src/forge/record';
import type { MapAction } from '../../src/mapActions';

/**
 * FCW-07a: the viewer's record is the creator contracts' v3 (`@s2u/creator-contracts` `readCreatorRecord`). A product-track
 * adaptation (the forge has no original): the inert legacy members change nothing the room plays.
 */

const M = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

const file = {
  forge: 1,
  base: { kind: 'map', archive: 'MP2' },
  pieces: [{ asset: 'MP2:crate', m: M(1, 0, 1) }, { asset: 'MP2:crate', m: M(2, 0, 2) }, { asset: 'MP2:barrel', m: M(3, 0, 3) }],
  spawns: [{ team: 'A', p: [1, 0, 2], yaw: 0 }, { team: 'B', p: [3, 0, 4], yaw: 0 }],
  objectives: {
    gameType: 2,
    bomb: { start: [10, 1, 20], sites: [{ team: 0, at: [100, 0, 0] }, { team: 1, at: [-40, 2, 5] }] },
  },
};
/** The same file with unknown members at the three levels a later build or a hand edit may leave. */
const legacy = {
  ...file,
  objectives: {
    gameType: 2,
    zones: [{ r: 5 }],
    bomb: {
      start: [10, 1, 20], timer: { s: 45 },
      sites: [{ team: 0, at: [100, 0, 0], glow: 'red' }, { team: 1, at: [-40, 2, 5], notes: [1, 2] }],
    },
  },
};

function tent(node: string, at: [number, number, number]): MapAction {
  return { node, type: 'MPBOMB', typeCode: 4, valve: '', anims: ['BombPlace'], team: null, range: 15, elevation: 15, points: 0, bitmap: '', path: `worldmodel/${node}`, at };
}
const discMap = (): ObjectiveMap => ({ bombStart: [9, 8, 7], escortees: [], meta: { actions: [tent('terrorist_tent', [1, 0, 0]), tent('seal_tent', [2, 0, 0])] } });

describe('FCW-07a: the viewer reads v1, v2 and v3 into one v3 record', () => {
  it('readSaved gives v3 for a v1 file, a v2 record and a v3 record, and checkRecord admits v2 and v3', () => {
    expect(RECORD_VERSION).toBe(3);
    const fromFile = readSaved(JSON.stringify(file), 'Yard');
    expect(fromFile).toMatchObject({ schema: 'forge-layout', version: 3, name: 'Yard' });
    const v2 = { v: 2, name: 'Yard', base: 'MP2', assets: ['MP2:crate'], pieces: [[0, 1, 0, 1, 0]], spawns: [] };
    expect(checkRecord(v2)).toBeNull();
    const fromV2 = readSaved(JSON.stringify(v2), 'ignored');
    expect(fromV2.ids.pieces).toEqual(['p0']);
    expect(checkRecord(fromV2)).toBeNull();
    expect(readSaved(JSON.stringify(fromV2), 'ignored')).toEqual(fromV2);
    expect(() => readSaved(JSON.stringify({ ...fromV2, extra: 1 }), 'x')).toThrow(/not a forge layout: unknown field extra/);
  });

  it('carries legacy members inert: the file -> record -> layout -> file trip keeps each value, the record is admitted', () => {
    const layout = parseLayout(JSON.stringify(legacy));
    const record = recordOfLayout(layout, 'Yard');
    expect(checkRecord(record)).toBeNull();
    const back = layoutOfRecord(record);
    expect(back.objectives).toEqual(layout.objectives);
    const exported = JSON.parse(serializeLayout(back)) as typeof legacy;
    expect(JSON.stringify(exported.objectives.zones)).toBe(JSON.stringify(legacy.objectives.zones));
    expect(JSON.stringify(exported.objectives.bomb.timer)).toBe(JSON.stringify(legacy.objectives.bomb.timer));
    expect(JSON.stringify(exported.objectives.bomb.sites.map((s) => [(s as { glow?: string }).glow, (s as { notes?: number[] }).notes])))
      .toBe(JSON.stringify([['red', undefined], [undefined, [1, 2]]]));
    // a second trip through the v3 text changes nothing
    expect(JSON.stringify(recordOfLayout(layoutOfRecord(readSaved(JSON.stringify(record), 'x')), 'Yard'))).toBe(JSON.stringify(record));
  });

  it('pins applyForgeObjectives and forgeBombActions: the same outputs with and without the inert members', () => {
    const plain = layoutOfRecord(readSaved(JSON.stringify(file), 'Yard')).objectives as ForgeObjectives;
    const carried = layoutOfRecord(readSaved(JSON.stringify(legacy), 'Yard')).objectives as ForgeObjectives;
    const parsedCarried = parseLayout(JSON.stringify(legacy)).objectives as ForgeObjectives;
    const want = [
      { node: 'forge_site_0', type: 'MPBOMB', typeCode: 4, valve: 'forge_bomb_0', anims: ['BombPlace'], team: 0, range: 15, elevation: 15, points: 0, bitmap: '', path: 'forge/site_0', at: [100, 0, 0] },
      { node: 'forge_site_1', type: 'MPBOMB', typeCode: 4, valve: 'forge_bomb_1', anims: ['BombPlace'], team: 1, range: 15, elevation: 15, points: 0, bitmap: '', path: 'forge/site_1', at: [-40, 2, 5] },
    ];
    expect(forgeBombActions(plain.bomb!)).toEqual(want);
    expect(forgeBombActions(carried.bomb!)).toEqual(want);
    expect(forgeBombActions(parsedCarried.bomb!)).toEqual(want);
    const a = applyForgeObjectives(discMap(), plain);
    const b = applyForgeObjectives(discMap(), carried);
    const c = applyForgeObjectives(discMap(), parsedCarried);
    expect(a.gameType).toBe(2);
    expect(a.bombStart).toEqual([10, 1, 20]);
    expect(a.meta!.actions.map((x) => x.node)).toEqual(['forge_site_0', 'forge_site_1']);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('saved undo keeps the ids: a history over v3 texts and over layout texts', () => {
    const start = readSaved(JSON.stringify(file), 'Yard');
    const history = new History<string>(JSON.stringify(start));
    const layout = withIds(layoutOfRecord(start));                 // the editor's ids, explicit before an edit
    layout.pieces.splice(0, 1);                                    // delete p0
    const afterDelete = recordOfLayout(layout, 'Yard');
    expect(afterDelete.ids.pieces).toEqual(['p1', 'p2']);
    history.record(JSON.stringify(afterDelete));
    layout.pieces.push({ asset: 'MP2:crate', m: M(9, 0, 9) });     // a new piece
    history.record(JSON.stringify(recordOfLayout(layout, 'Yard')));
    expect((readSaved(history.current(), 'x') as LayoutRecord & { ids: { pieces: string[] } }).ids.pieces).toEqual(['p1', 'p2', 'p3']);
    expect(readSaved(history.undo()!, 'x').ids.pieces).toEqual(['p1', 'p2']);
    expect(readSaved(history.undo()!, 'x').ids.pieces).toEqual(['p0', 'p1', 'p2']);
    expect(readSaved(history.redo()!, 'x').ids.pieces).toEqual(['p1', 'p2']);

    // the page's own steps are layout texts: an id that is not its row's default rides the text
    const steps = new History<string>('');
    const opened: Layout = layoutOfRecord(afterDelete);
    recordEdit(steps, serializeLayout(opened), [], []);
    opened.pieces.reverse();
    recordEdit(steps, serializeLayout(opened), [], []);
    expect(recordOfLayout(parseLayout(decodeHistoryStep(steps.current()).text), 'Yard').ids.pieces).toEqual(['p2', 'p1']);
    expect(recordOfLayout(parseLayout(decodeHistoryStep(steps.undo()!).text), 'Yard').ids.pieces).toEqual(['p1', 'p2']);
  });
});

describe('FCW-07a fix-up: the position lattice re-exported for the catalogue', () => {
  it('a record coordinate is a multiple of one tenth', () => { expect(RECORD_POSITION_DENOMINATOR).toBe(10); });
});

describe('S3b item 1: a content base through the viewer\'s record (readSaved, checkRecord)', () => {
  it('a layout file on an authored map saves to a v3 record and opens on the same base; its pack is required', () => {
    const ref = { id: 'fcw10.maps', version: '1.0.0', hash: 'c'.repeat(64) };
    const onMap = { ...file, objectives: undefined, base: { kind: 'content', ref, mapId: 'yard', library: 'MP2' } };
    const record = readSaved(JSON.stringify(onMap), 'Yard');
    expect([record.base, record.contentBase, record.requires]).toEqual(['content:MP2', { ref, mapId: 'yard' }, [ref]]);
    expect(checkRecord(record)).toBeNull();
    expect(layoutOfRecord(record).base).toEqual(onMap.base);
    expect(readSaved(JSON.stringify(record), 'x')).toEqual(record);
  });
});
