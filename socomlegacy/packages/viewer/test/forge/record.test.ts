import { describe, expect, it } from 'vitest';
import type { Layout } from '../../src/forge/layout';
import {
  autosaveUnreadable, checkRecord, layoutOfRecord, readSaved, RECORD_LIMITS, recordOfLayout, savedLayoutHasWork, type LayoutRecord,
} from '../../src/forge/record';
import { readSaves, saveNamed, writeSaves, type Store } from '../../src/forge/saves';
import { decodeShare, encodeShare } from '../../src/forge/share';

/**
 * FORGE (FG.R10): the saved record, v2 -- compact, data-driven, yaw-only: an asset table and rows of numbers, the same
 * record kept in this browser and on the account. A browser adaptation with no original.
 */
const yawM = (deg: number, x: number, y: number, z: number): number[] => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1];
};
const layout: Layout = {
  forge: 1,
  base: { kind: 'map', archive: 'MP2' },
  pieces: [
    { asset: 'MP2:crate', m: yawM(90, 100.4, 5.6, -20.2) },
    { asset: 'M51:oaktree_near', m: yawM(-45, 0, 0, 0) },
    { asset: 'MP2:crate', m: yawM(0, 7, 8, 9) },
  ],
  spawns: [{ team: 'B', p: [1.2, 2.6, 3], yaw: Math.PI }],
};

describe('FORGE: the v2 record', () => {
  it('is an asset table and rows: one decimal place, whole degrees in 0..359, assets once each in first-use order', () => {
    const r = recordOfLayout(layout, 'Crate yard');
    // FCW-07a: written as v3 -- the v2 rows as they were, and each row's id (its default from its position)
    expect(r).toEqual({
      schema: 'forge-layout', version: 3, name: 'Crate yard', base: 'MP2',
      assets: ['MP2:crate', 'M51:oaktree_near'],
      pieces: [[0, 100.4, 5.6, -20.2, 90], [1, 0, 0, 0, 315], [0, 7, 8, 9, 0]],
      spawns: [['B', 1.2, 2.6, 3, 180]],
      ids: { pieces: ['p0', 'p1', 'p2'], spawns: ['s0'] },
    } satisfies LayoutRecord);
  });

  it('round-trips back to a layout, a blank base by its library', () => {
    const blank = recordOfLayout({ ...layout, base: { kind: 'blank', library: 'M51' } }, 'x');
    expect(blank.base).toBe('blank:M51');
    const floor = recordOfLayout({ ...layout, base: { kind: 'blank', library: 'floor' } }, 'Floor');
    expect(floor.base).toBe('blank:floor');
    expect(checkRecord(floor)).toBeNull();
    expect(layoutOfRecord(floor).base).toEqual({ kind: 'blank', library: 'floor' });
    const back = layoutOfRecord(blank);
    expect(back.base).toEqual({ kind: 'blank', library: 'M51' });
    expect(back.pieces.map((p) => p.asset)).toEqual(['MP2:crate', 'M51:oaktree_near', 'MP2:crate']);
    expect(back.pieces[0]!.m[12]).toBe(100.4);
    expect(back.pieces[0]!.m[13]).toBe(5.6);
    expect(back.pieces[0]!.m[0]).toBeCloseTo(0);                  // cos 90
    expect(back.spawns[0]).toMatchObject({ team: 'B', p: [1.2, 2.6, 3] });
    expect(back.spawns[0]!.yaw).toBeCloseTo(Math.PI);
    expect(recordOfLayout(back, 'x')).toEqual(blank);              // a second trip changes nothing
  });

  it('refuses what is not a record, saying why (the same check the server makes)', () => {
    const ok = recordOfLayout(layout, 'n');
    expect(checkRecord(ok)).toBeNull();
    expect(checkRecord({ ...ok, version: 1 })).toMatch(/version/);
    const { schema: _schema, version: _version, ids: _ids, ...rows } = ok;
    expect(checkRecord({ v: 2, ...rows })).toBeNull();                       // a v2 record is still read
    expect(checkRecord({ v: 1, ...rows })).toMatch(/version/);
    expect(checkRecord({ ...ok, name: '' })).toMatch(/name/);
    expect(checkRecord({ ...ok, name: 'x'.repeat(RECORD_LIMITS.name + 1) })).toMatch(/name/);
    expect(checkRecord({ ...ok, base: 'MP2:x' })).toMatch(/base/);
    expect(checkRecord({ ...ok, assets: ['nope'] })).toMatch(/asset 0/);
    expect(checkRecord({ ...ok, pieces: [[5, 0, 0, 0, 0]] })).toMatch(/piece 0/);
    expect(checkRecord({ ...ok, pieces: [[0, 0, 0, 1e9, 0]] })).toMatch(/piece 0/);
    expect(checkRecord({ ...ok, pieces: [[0, 0.25, 0, 0, 0]] })).toMatch(/piece 0/);
    expect(checkRecord({ ...ok, pieces: [[0, 0, 0, 0, 360]] })).toMatch(/piece 0/);
    expect(checkRecord({ ...ok, spawns: [['C', 0, 0, 0, 0]] })).toMatch(/spawn 0/);
    expect(checkRecord({ ...ok, pieces: Array.from({ length: RECORD_LIMITS.pieces + 1 }, () => [0, 0, 0, 0, 0]) })).toMatch(/pieces/);
    expect(checkRecord({ ...ok, extra: 1 })).toMatch(/field/);
    expect(checkRecord('nope')).toMatch(/object/);
  });

  it('reads a saved text of either version: a v2 record, or a v1 layout file converted', () => {
    const v2 = recordOfLayout(layout, 'Crate yard');
    expect(readSaved(JSON.stringify(v2), 'ignored')).toEqual(v2);
    expect(readSaved(JSON.stringify(layout), 'From a file')).toEqual({ ...v2, name: 'From a file' });
    expect(readSaved(JSON.stringify({ ...layout, name: 'Kept' }), 'From a file').name).toBe('Kept');
    expect(() => readSaved('{', 'x')).toThrow(/JSON/);
    expect(() => readSaved('{"v":2}', 'x')).toThrow(/name/);
  });

  it('round-trips a v1 layout through v2 and back to the same layout, optional fields included', () => {
    // Whole units and a pure yaw, so FG.R10's compact rows lose nothing. hidden, npcs, settings, the layout's own
    // camera (exact, pitch included) and missing-piece indices come back on the layout.
    const v1: Layout & { missing: number[] } = {
      forge: 1,
      name: 'Yard',
      base: { kind: 'blank', library: 'M51' },
      pieces: [
        { asset: 'MP2:crate', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, -5, 1] },
        { asset: 'M51:oaktree_near', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 2, 1] },
      ],
      spawns: [{ team: 'A', p: [25, 0, 40], yaw: 0 }],
      hidden: ['crate@100,0,-20'],
      npcs: [{ side: 'terrorist', type: 1, p: [3, 0, 4], yaw: 0 }],
      settings: { light: 0.4, fogFar: null, players: 8 },
      camera: { x: 1.25, y: 250, z: 600.5, yaw: 180.25, pitch: -12.5 },
      missing: [1],
    };
    const asV2 = readSaved(JSON.stringify(v1), 'Yard');
    const back = layoutOfRecord(asV2);
    expect(back).toEqual(v1);
    const again = readSaved(JSON.stringify(back), 'Yard');
    expect(again).toEqual(asV2);
    expect(layoutOfRecord(readSaved(JSON.stringify(asV2), 'ignored'))).toEqual(v1);
    expect(checkRecord({ ...asV2, camera: { x: 0, y: 0, z: 0, yaw: 180 } })).toMatch(/pitch/);
  });

  it('keeps a per-piece lock and omits it when the piece is unlocked', () => {
    // FG-49: `locked` is the v1 piece's own name. The v2 row appends true only then, so an unlocked piece stays five
    // numbers. false is the same as absent. A v1 file round-trips through readSaved, which is where parseLayout drops
    // the field.
    const open = { asset: 'MP2:crate', m: yawM(0, 1, 2, 3) };
    const held = { asset: 'MP2:crate', m: yawM(90, 4, 5, 6), locked: true as const };
    const loose = { asset: 'M51:oaktree_near', m: yawM(0, 7, 8, 9), locked: false as const };
    const src: Layout = { forge: 1, base: { kind: 'map', archive: 'MP2' }, pieces: [open, held, loose], spawns: [] };
    const r = recordOfLayout(src, 'Locks');
    expect(r.pieces).toEqual([[0, 1, 2, 3, 0], [0, 4, 5, 6, 90, true], [1, 7, 8, 9, 0]]);
    expect(r.pieces[0]).toHaveLength(5);
    expect(r.pieces[2]).toHaveLength(5);
    const back = layoutOfRecord(r);
    expect(back.pieces[0]).not.toHaveProperty('locked');
    expect(back.pieces[1]).toMatchObject({ asset: 'MP2:crate', locked: true });
    expect(back.pieces[2]).not.toHaveProperty('locked');
    expect(recordOfLayout(back, 'Locks').pieces).toEqual(r.pieces);

    const v1 = {
      forge: 1,
      base: { kind: 'map', archive: 'MP2' },
      pieces: [
        { asset: 'MP2:crate', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1] },
        { asset: 'MP2:crate', m: [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 4, 5, 6, 1], locked: true },
        { asset: 'M51:oaktree_near', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1], locked: false },
      ],
      spawns: [],
    };
    const fromFile = readSaved(JSON.stringify(v1), 'Locks');
    expect(fromFile.pieces).toEqual(r.pieces);
    const fromBack = layoutOfRecord(fromFile);
    expect(fromBack.pieces.map((p) => ('locked' in p ? p.locked : false))).toEqual([false, true, false]);
    expect(readSaved(JSON.stringify(fromBack), 'Locks').pieces).toEqual(fromFile.pieces);
    expect(layoutOfRecord(fromFile).pieces[1]!.locked).toBe(true);

    expect(checkRecord({ ...r, pieces: [[0, 1, 2, 3, 0, false]] })).toMatch(/piece 0 lock/);
    expect(checkRecord({ ...r, pieces: [[0, 1, 2, 3, 0, 1]] })).toMatch(/piece 0 lock/);
    expect(() => readSaved(JSON.stringify({
      ...v1,
      pieces: [{ asset: 'MP2:crate', m: v1.pieces[0]!.m, locked: 'yes' }],
    }), 'x')).toThrow(/piece 0 lock is not a boolean/);
  });

  it('keeps a locked spawn and a locked NPC through the autosave, a named save, a share code and a downloaded file', async () => {
    // FG-49: the same trailing true a piece uses. A spawn's is the 6th element, an NPC's the 7th. Unlocked omits it.
    const src: Layout = {
      forge: 1,
      base: { kind: 'blank', library: 'floor' },
      pieces: [],
      spawns: [
        { team: 'A', p: [100, 0, 200], yaw: 0, locked: true },
        { team: 'B', p: [1, 0, 2], yaw: Math.PI / 2, locked: false },
      ],
      npcs: [
        { side: 'seal', type: 0, p: [4, 5, 6], yaw: 0, locked: true },
        { side: 'terrorist', type: 1, p: [7, 0, 8], yaw: 0 },
      ],
    };
    const record = recordOfLayout(src, 'Autosave');
    expect(record.spawns).toEqual([['A', 100, 0, 200, 0, true], ['B', 1, 0, 2, 90]]);
    expect(record.spawns[1]).toHaveLength(5);
    expect(record.npcs).toEqual([['seal', 0, 4, 5, 6, 0, true], ['terrorist', 1, 7, 0, 8, 0]]);
    expect(record.npcs![1]).toHaveLength(6);
    expect(checkRecord(record)).toBeNull();
    expect(checkRecord({ ...record, spawns: [['A', 100, 0, 200, 0, false]] })).toMatch(/spawn 0 lock/);
    expect(checkRecord({ ...record, npcs: [['seal', 0, 4, 5, 6, 0, 1]] })).toMatch(/npc 0 lock/);

    const autosave = JSON.stringify(record);
    const fromAutosave = layoutOfRecord(readSaved(autosave, 'Autosave'));
    expect(fromAutosave.spawns[0]).toMatchObject({ team: 'A', locked: true });
    expect(fromAutosave.spawns[1]).not.toHaveProperty('locked');
    expect(fromAutosave.npcs?.[0]).toMatchObject({ side: 'seal', locked: true });
    expect(fromAutosave.npcs?.[1]).not.toHaveProperty('locked');

    const data = new Map<string, string>();
    const store: Store = { get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
    const named = saveNamed([], 'Yard', recordOfLayout(src, 'Yard'), 1_000, 'id-lock');
    expect(named.error).toBeNull();
    expect(writeSaves(named.saves, store)).toBe(true);
    const opened = layoutOfRecord(readSaves(store)[0]!.record);
    expect(opened.spawns[0]!.locked).toBe(true);
    expect(opened.npcs?.[0]!.locked).toBe(true);

    const code = await encodeShare(record);
    const shared = layoutOfRecord(await decodeShare(code));
    expect(shared.spawns[0]).toMatchObject({ team: 'A', p: [100, 0, 200], locked: true });
    expect(shared.npcs?.[0]).toMatchObject({ side: 'seal', type: 0, locked: true });

    const file = JSON.stringify(record, null, 1);
    const downloaded = layoutOfRecord(readSaved(file, 'Layout'));
    expect(downloaded.spawns.map((s) => s.locked === true)).toEqual([true, false]);
    expect(downloaded.npcs?.map((n) => n.locked === true)).toEqual([true, false]);
    expect(recordOfLayout(downloaded, 'Autosave').spawns).toEqual(record.spawns);
    expect(recordOfLayout(downloaded, 'Autosave').npcs).toEqual(record.npcs);

    const v1 = {
      forge: 1,
      base: { kind: 'blank', library: 'floor' },
      pieces: [],
      spawns: [
        { team: 'A', p: [100, 0, 200], yaw: 0, locked: true },
        { team: 'B', p: [1, 0, 2], yaw: Math.PI / 2, locked: false },
      ],
      npcs: [
        { side: 'seal', type: 0, p: [4, 5, 6], yaw: 0, locked: true },
        { side: 'terrorist', type: 1, p: [7, 0, 8], yaw: 0 },
      ],
    };
    expect(readSaved(JSON.stringify(v1), 'Autosave').spawns).toEqual(record.spawns);
    expect(readSaved(JSON.stringify(v1), 'Autosave').npcs).toEqual(record.npcs);
  });

  // FG-51 (the merge controller's ruling R, 2026-10-22): the layout's objectives ride the v2 record as an optional field,
  // written only when the layout has them, so a record without them is byte-identical to before.
  it('keeps the layout\'s objectives through the autosave, a named save, a share code and a downloaded file', async () => {
    const src: Layout = {
      forge: 1,
      base: { kind: 'map', archive: 'MP72' },
      pieces: [],
      spawns: [],
      objectives: {
        gameType: 2,
        bomb: {
          start: [10.04, 1, 20],
          startLocked: true,
          sites: [
            { team: 0, at: [100, 0, 0], yaw: 0.5, range: 15, elevation: 15, locked: true },
            { team: 1, at: [-40, 2.26, 5], yaw: 0, range: 15, elevation: 15 },
          ],
        },
      },
    };
    const want = {
      gameType: 2,
      bomb: {
        start: [10, 1, 20], startLocked: true,
        sites: [
          { team: 0, at: [100, 0, 0], yaw: 0.5, range: 15, elevation: 15, locked: true },
          { team: 1, at: [-40, 2.3, 5], yaw: 0, range: 15, elevation: 15 },
        ],
      },
    };
    const record = recordOfLayout(src, 'Autosave');
    expect(record.objectives).toEqual(want);                         // coordinates at one decimal, as a piece's
    expect(checkRecord(record)).toBeNull();

    const fromAutosave = layoutOfRecord(readSaved(JSON.stringify(record), 'Autosave'));
    expect(fromAutosave.objectives).toEqual(want);

    const data = new Map<string, string>();
    const store: Store = { get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
    const named = saveNamed([], 'Yard', recordOfLayout(src, 'Yard'), 1_000, 'id-objectives');
    expect(named.error).toBeNull();
    expect(writeSaves(named.saves, store)).toBe(true);
    expect(layoutOfRecord(readSaves(store)[0]!.record).objectives).toEqual(want);

    const shared = layoutOfRecord(await decodeShare(await encodeShare(record)));
    expect(shared.objectives).toEqual(want);

    const downloaded = layoutOfRecord(readSaved(JSON.stringify(record, null, 1), 'Layout'));
    expect(downloaded.objectives).toEqual(want);
    expect(recordOfLayout(downloaded, 'Autosave')).toEqual(record);   // a second trip changes nothing

    // A v1 file carrying them converts with them; "Map's own" (no game type) keeps its markers.
    expect(readSaved(JSON.stringify(src), 'Autosave').objectives).toEqual(want);
    const untyped = recordOfLayout({ ...src, objectives: { bomb: { sites: [{ team: 1, at: [1, 0, 1], yaw: 0, range: 15, elevation: 15 }] } } }, 'x');
    expect(layoutOfRecord(untyped).objectives).toEqual({ bomb: { sites: [{ team: 1, at: [1, 0, 1], yaw: 0, range: 15, elevation: 15 }] } });

    // Without objectives: no field at all, the same bytes as before the field existed.
    const plain = recordOfLayout({ ...src, objectives: undefined }, 'Autosave');
    expect(plain).not.toHaveProperty('objectives');
    expect(JSON.stringify(plain)).toBe('{"schema":"forge-layout","version":3,"name":"Autosave","base":"MP72","assets":[],"pieces":[],"spawns":[],"ids":{"pieces":[],"spawns":[]}}');

    // A bad block is refused, saying why, as the server's PUT would.
    expect(checkRecord({ ...record, objectives: { gameType: 9 } })).toMatch(/gameType/);
    expect(checkRecord({ ...record, objectives: { gameType: 2, bomb: { sites: [{ team: 0, at: [0.25, 0, 0] }] } } })).toMatch(/objectives/);
    expect(checkRecord({ ...record, objectives: { gameType: 2, bomb: { sites: [{ team: 0, at: [1e9, 0, 0] }] } } })).toMatch(/objectives/);
    expect(checkRecord({ ...record, objectives: [] })).toMatch(/objectives/);
  });

  it('reads a record\'s objectives with the layout file\'s defaults filled (the forge seat\'s low 1: no NaN turn)', () => {
    // A hand-written or later record may leave a site's yaw, range and elevation out, as a layout file may.
    const record = {
      v: 2, name: 'Bare', base: 'MP72', assets: [], pieces: [], spawns: [],
      objectives: { gameType: 2, bomb: { start: [1, 0, 1], sites: [{ team: 0, at: [4, 0, 6] }] } },
    };
    expect(checkRecord(record)).toBeNull();
    const site = layoutOfRecord(readSaved(JSON.stringify(record), 'x')).objectives!.bomb!.sites[0]!;
    expect(site).toEqual({ team: 0, at: [4, 0, 6], yaw: 0, range: 15, elevation: 15 });
    expect(Number.isNaN(site.yaw)).toBe(false);
  });

  it('counts a layout holding only objectives as work, so it is not replaced without a word', () => {
    const onlyBomb: Layout = {
      forge: 1, base: { kind: 'map', archive: 'MP72' }, pieces: [], spawns: [],
      objectives: { gameType: 2, bomb: { start: [0, 0, 0], sites: [] } },
    };
    expect(savedLayoutHasWork(JSON.stringify(recordOfLayout(onlyBomb, 'Autosave')))).toBe(true);
    expect(savedLayoutHasWork(JSON.stringify(recordOfLayout({ ...onlyBomb, objectives: undefined }, 'Autosave')))).toBe(false);
  });

  it('keeps a half-unit height: 42.5 comes back as 42.5', () => {
    const src: Layout = {
      forge: 1,
      base: { kind: 'map', archive: 'MP72' },
      pieces: [{ asset: 'MP72:crate', m: yawM(0, 10, 42.5, -3) }],
      spawns: [],
    };
    const r = recordOfLayout(src, 'Half');
    expect(r.pieces).toEqual([[0, 10, 42.5, -3, 0]]);
    expect(checkRecord(r)).toBeNull();
    expect(layoutOfRecord(r).pieces[0]!.m[13]).toBe(42.5);
    expect(recordOfLayout(layoutOfRecord(r), 'Half').pieces).toEqual(r.pieces);
    const v1 = { ...src, pieces: [{ asset: 'MP72:crate', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 42.5, -3, 1] }] };
    expect(readSaved(JSON.stringify(v1), 'Half').pieces).toEqual(r.pieces);
    expect(checkRecord({ ...r, pieces: [[0, 10, 42.55, -3, 0]] })).toMatch(/piece 0/);
  });

  it('calls a saved layout non-empty only when it holds a placement', () => {
    const placed = recordOfLayout(layout, 'Yard');
    expect(savedLayoutHasWork(JSON.stringify(placed))).toBe(true);
    const empty = recordOfLayout({ ...layout, pieces: [], spawns: [] }, 'Empty');
    expect(savedLayoutHasWork(JSON.stringify(empty))).toBe(false);
    expect(savedLayoutHasWork('not json')).toBe(false);
    // LATER 193: a kept text this build cannot read is no work to replace, but it is not nothing either.
    expect(autosaveUnreadable('not json')).toBe(true);
    expect(autosaveUnreadable(JSON.stringify({ v: 99 }))).toBe(true);
    expect(autosaveUnreadable(JSON.stringify(empty))).toBe(false);
    expect(autosaveUnreadable('')).toBe(false);
    expect(autosaveUnreadable(null)).toBe(false);
  });
});
