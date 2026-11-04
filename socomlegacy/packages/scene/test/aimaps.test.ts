import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  aiCellCentre, aiCellIndex, aiCellMarker, aiCellY, aiMapsFromZdb, aiZoneRect, decodeAiLoc, dosDateTime, facingVector,
  accountsFor, aiCellOf, buildGrid, fitSlot, fitSpawn, namedPoint, parseAiMaps, placeSpawnSlots, spawnSlots, SPAWNS, zoneCentre,
  zoneContains, zonesOfKind, ZONE_CONTAINS_READING, type AiMaps, type AiZone,
  type AiSpawnRecord, type CollisionOwner, type Grid, type GridParams, type SpawnSlot, type WorldPoly,
} from '../src/index';
import { loc, syntheticAiMaps as synthetic } from './syntheticAiMaps';

/**
 * `AIMAPS.MPS` read to its last byte (socomlegacy/docs/research/75): a hand-built file first, which is what CI runs,
 * then the three fixture maps, whose numbers the note's tables were read off.
 */

describe('decodeAiLoc (CAiMapLoc, reCOM zAI/zai.h:302-307; 75 §4)', () => {
  it('takes the map from the low 6 bits, then x, then the grid\'s second axis', () => {
    expect(decodeAiLoc(0x01180b00)).toEqual({ map: 0, x: 44, z: 35 });   // Frostfire's PlayerStart
    expect(decodeAiLoc(0x01300282)).toEqual({ map: 2, x: 10, z: 38 });   // a point of Frostfire's Tunnels
    expect(decodeAiLoc(loc(5, 8191, 8191))).toEqual({ map: 5, x: 8191, z: 8191 });
  });
});

describe('parseAiMaps on a hand-built file', () => {
  const ai = parseAiMaps(synthetic());
  const base = ai.maps[0]!, ramps = ai.maps[1]!;

  it('reads the head and each sub-map header (75 §2, §3)', () => {
    expect(ai.version).toBe(2);
    expect(ai.maps.map((m) => m.name)).toEqual(['BaseMap', 'Ramps']);
    expect(base).toMatchObject({ index: 0, id: 0, flags: 0x17, cellsX: 4, cellsZ: 3, cellSize: [10, 10] });
    expect(base.min).toEqual([100, 0, 200]);
    expect(base.max).toEqual([140, 50, 230]);
    expect(ramps).toMatchObject({ index: 1, id: 3, cellsX: 2, cellsZ: 1 });
    expect(dosDateTime(base.stamp)).toBe('2003-09-13 16:41:46');
  });

  it('indexes the stored cells through the row spans, and nothing outside them (75 §4)', () => {
    expect(base.cells.length).toBe(6);
    expect(base.cellsB.length).toBe(6);
    expect(base.rows.map((r) => [r.x0, r.x1, r.first])).toEqual([[1, 3, 0], [0, 4, 2], [4, 4, 6]]);
    expect(aiCellIndex(base, 1, 0)).toBe(0);
    expect(aiCellIndex(base, 2, 1)).toBe(4);
    expect(aiCellIndex(base, 0, 0)).toBe(-1);   // before row 0's span
    expect(aiCellIndex(base, 1, 2)).toBe(-1);   // an empty row
    expect(aiCellIndex(base, 9, 9)).toBe(-1);   // off the grid
    expect(aiCellMarker(base.cells[aiCellIndex(base, 2, 1)]!)).toBe(3);
    expect(aiCellCentre(base, 2, 1)).toEqual([125, 215]);
  });

  it('reads a named point as one cell -- a place, not an extent (75 §5.1)', () => {
    expect(base.points).toEqual([{ name: 'PlayerStart', loc: { map: 0, x: 2, z: 1 }, kind: 2, word: 0x00990208 }]);
    const found = namedPoint(ai, 'startplayer', 'playerstart');
    expect(found?.sub.name).toBe('BaseMap');
    expect(found?.point.name).toBe('PlayerStart');
    expect(namedPoint(ai, 'nowhere')).toBeUndefined();
  });

  it('reads the marker, the link, the zone rectangle and the polyline (75 §5.2-5.4, §5.6)', () => {
    expect(base.markers).toEqual([{ loc: { map: 0, x: 1, z: 0 }, word: 0x608ffff0, flags: 0x74617328 }]); // synthetic '(sat' bytes
    expect(base.links).toEqual([{ from: { map: 0, x: 3, z: 1 }, to: { map: 1, x: 0, z: 0 }, word: 8 }]);
    expect(base.zones).toEqual([{ name: 'Safety', corner: { map: 0, x: 0, z: 1 }, width: 2, height: 1, kind: 1 }]);
    expect(aiZoneRect(base, base.zones[0]!)).toEqual({ minX: 100, minZ: 210, maxX: 120, maxZ: 220 });
    expect(base.lines).toEqual([{ locs: [{ map: 0, x: 0, z: 0 }, { map: 0, x: 3, z: 2 }], value: 0 }]);
    expect(ramps.points.length + ramps.markers.length + ramps.links.length + ramps.zones.length).toBe(0);
  });

  it('reads the spawn records -- side bit 5, twin bit 4, facing bits 0-2 -- and the trailer\'s copy (75 §5.5, §6)', () => {
    expect(base.spawns.map((s) => [s.side, s.twin, s.facing])).toEqual([[0, false, 0], [0, true, 0], [1, false, 4]]);
    expect(ai.links).toEqual({ words: 1, records: 0 });
    expect(ai.spawns.length).toBe(3);
    expect(new Set(ai.spawns.map((s) => s.flags))).toEqual(new Set(base.spawns.map((s) => s.flags)));
    const slots = spawnSlots(ai, 1);
    expect(slots.length).toBe(1);
    expect(slots[0]).toMatchObject({ x: 135, z: 215, facing: 4, side: 1 });
    expect(spawnSlots(ai).length).toBe(2);        // the twin is not a slot
  });

  it('turns facing k by 45 degrees per step from -z toward +x (75 §11: the sweep rows are the camera behind)', () => {
    const r = (v: [number, number]) => v.map((c) => Math.round(c * 1000) / 1000 + 0);
    expect(r(facingVector(0))).toEqual([0, -1]);
    expect(r(facingVector(2))).toEqual([1, 0]);
    expect(r(facingVector(4))).toEqual([0, 1]);
    expect(r(facingVector(6))).toEqual([-1, 0]);
    expect(r(facingVector(1))).toEqual([0.707, -0.707]);
  });

  it('fits a position behind a slot along its facing -- the orbit camera behind an actor on it -- on the side asked for (75 §7, §11)', () => {
    const fit = fitSpawn(ai, 1, 135, 191)!;              // side 1's slot at (135, 215) faces +z
    expect(fit.slot).toMatchObject({ x: 135, z: 215 });
    expect(fit.along).toBeCloseTo(-24, 6);
    expect(fit.perp).toBeCloseTo(0, 6);
    expect(fit.distance).toBeCloseTo(24, 6);
    expect(fitSpawn(ai, 1, 135, 239)).toBeUndefined();   // 24 ahead of it: not where a camera behind would be
    expect(fitSpawn(ai, 0, 135, 191)).toBeUndefined();   // side 0's slot faces -z; this is ahead of it
    expect(fitSpawn(ai, 0, 115, 205.5)!.distance).toBeCloseTo(0.5, 6);
  });

  it('refuses a wrong version, a short file and a long one', () => {
    const good = synthetic();
    const bad = good.slice();
    bad[0] = 3;
    expect(() => parseAiMaps(bad)).toThrow(/version 3/);
    expect(() => parseAiMaps(good.subarray(0, good.length - 4))).toThrow();
    const long = new Uint8Array(good.length + 4);
    long.set(good);
    expect(() => parseAiMaps(long)).toThrow(/4 bytes past/);
  });
});

describe('placeSpawnSlots: the slots as the viewer draws them (W1.5b, the spec\'s W1.R9)', () => {
  const ai = parseAiMaps(synthetic());
  /** The synthetic file plus records the hand-built one lacks: a second side-0 slot on Ramps, a Ramps twin. */
  const more = (): AiMaps => {
    const base = ai.spawns.find((s) => s.side === 0 && !s.twin)!;
    const extra: AiSpawnRecord[] = [
      { ...base, loc: { map: 1, x: 0, z: 0 }, flags: 0x02, facing: 2 },
      { ...base, loc: { map: 1, x: 1, z: 0 }, flags: 0x12, facing: 2, twin: true },
    ];
    return { ...ai, spawns: [...ai.spawns, ...extra] };
  };
  const round = (v: number[]): number[] => v.map((c) => Math.round(c * 1000) / 1000 + 0);

  it('puts each slot at its cell\'s centre with its side, its facing and its cell; twins are not slots (75 §4, §5.5, §7)', () => {
    const slots = placeSpawnSlots(ai);
    expect(slots.map((s) => [s.side, s.index, s.step, s.loc])).toEqual([
      [1, 0, 4, { map: 0, x: 3, z: 1 }], [0, 0, 0, { map: 0, x: 1, z: 0 }],
    ]);
    expect(slots[0]!.position[0]).toBe(135);
    expect(slots[0]!.position[2]).toBe(215);
    expect(round(slots[0]!.facing)).toEqual([0, 1]);    // step 4 is +z
    expect(slots[1]!.position[0]).toBe(115);
    expect(slots[1]!.position[2]).toBe(205);
    expect(round(slots[1]!.facing)).toEqual([0, -1]);   // step 0 is -z
  });

  it('numbers a side\'s slots from 0 in the trailer\'s order, the other side\'s apart (75 §6)', () => {
    const slots = placeSpawnSlots(more());
    expect(slots.map((s) => [s.side, s.index, s.loc.map])).toEqual([[1, 0, 0], [0, 0, 0], [0, 1, 1]]);
    expect(slots[2]!.position[0]).toBe(115);            // Ramps' cell (0, 0) from (110, 200)
    expect(slots[2]!.position[2]).toBe(205);
    expect(round(slots[2]!.facing)).toEqual([1, 0]);    // step 2 is +x
  });

  it('aiCellY: the sub-map\'s min y plus bits 9-18 of the cell\'s word in 1024ths of its y range (FUN_00516940, FUN_0051afe0; research 179 §9.14)', () => {
    const base = ai.maps[0]!;                            // y 0..50
    expect(aiCellY(base, base.cells[aiCellIndex(base, 1, 0)]!)).toBe(25);
    expect(aiCellY(base, base.cells[aiCellIndex(base, 3, 1)]!)).toBe(37.5);
    expect(aiCellY(base, 0x80000000 | (1023 << 9))).toBeCloseTo(50 * 1023 / 1024, 9);
    // The marker (bits 5-7), the low bits and bit 19 up are not the height.
    expect(aiCellY(base, 0xfff801ff)).toBe(0);
    expect(aiCellY(ai.maps[1]!, 0x80000001 | (700 << 9))).toBe(20);   // Ramps: one height, 20
  });

  it('takes y from the slot\'s own cell in the file (research 179 §9.14, 190 G3), not from the measured spawns', () => {
    // BaseMap spans y 0..50: side 1's cell holds 768/1024 of it, side 0's 512; Ramps spans 20..20.
    expect(placeSpawnSlots(more(), { a: [0, 30, 0], b: [0, 80, 0] }).map((s) => s.position[1])).toEqual([37.5, 25, 20]);
    expect(placeSpawnSlots(more()).map((s) => s.position[1])).toEqual([37.5, 25, 20]);
    expect(placeSpawnSlots(more()).map((s) => s.onFloor)).toEqual([false, false, false]);   // no ground given
  });

  it('a record whose cell the grid does not store (a map built by hand) keeps the estimate: the measured y, held in range', () => {
    const side0 = ai.spawns.find((s) => s.side === 0 && !s.twin)!;
    const off: AiMaps = { ...ai, spawns: [{ ...side0, loc: { map: 0, x: 0, z: 0 } }] };   // row 0 stores x 1-2 only
    expect(placeSpawnSlots(off, { a: [0, 30, 0], b: [0, 80, 0] }).map((s) => s.position[1])).toEqual([30]);
    expect(placeSpawnSlots(off, { a: [0, 80, 0], b: [0, 80, 0] }).map((s) => s.position[1])).toEqual([50]);
    expect(placeSpawnSlots(off).map((s) => s.position[1])).toEqual([0]);
  });

  /** A flat ground polygon over x0-x1, z0-z1 at `y`, one owner each, on a 2 x 3 grid of 100-unit cells. */
  const ground = (...slabs: [number, number, number, number, number][]): Grid => {
    const polys: WorldPoly[] = slabs.map(([x0, z0, x1, z1, y]) => ({
      modelName: 'worldmodel', path: 'worldmodel/slab', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]),
    }));
    const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 2, cellsZ: 3, originX: 0, originZ: 0 };
    return buildGrid(params, [], [], polys, owners);
  };
  // The synthetic slots: side 1 at (135, 215), cell y 37.5, and side 0 at (115, 205), cell y 25, both on BaseMap
  // (y 0..50); with `more`, side 0's #1 on Ramps (y 20..20) at (115, 205) too.

  it('W1.4b: with the ground, the y is the probe\'s floor at the slot\'s centre, picked from its cell lifted a unit, and says so', () => {
    const flat = ground([100, 200, 140, 230, 10]);
    const slots = placeSpawnSlots(ai, { a: [0, 30, 0], b: [0, 40, 0] }, flat);
    expect(slots.map((s) => [s.side, s.position])).toEqual([[1, [135, 10, 215]], [0, [115, 10, 205]]]);
    expect(slots.map((s) => s.onFloor)).toEqual([true, true]);
    // The record lifted a unit (FUN_002b8100 D:L158793), then the selection's pick (research 24 section 2): the
    // highest floor at or under the cell y + 1 + 5 + 1 -- for side 0's cell at 25, a deck at 32 or under.
    const decked = (y: number): Grid => ground([100, 200, 140, 230, 10], [110, 200, 120, 210, y]);
    expect(placeSpawnSlots(ai, undefined, decked(32)).map((s) => s.position[1])).toEqual([10, 32]);
    expect(placeSpawnSlots(ai, undefined, decked(32.5)).map((s) => s.position[1])).toEqual([10, 10]);
    // The measured spawns move nothing where the cell is stored.
    expect(placeSpawnSlots(ai, { a: [0, 0, 0], b: [0, 0, 0] }, decked(32)).map((s) => s.position[1])).toEqual([10, 32]);
  });

  it('W1.4b: a floor over the pick\'s origin is still the slot\'s when it is the only one: a slot has no feet for the 20-unit window to bound', () => {
    // The only floor under side 1's slot is 45, over its cell's 37.5 + 7. An actor's pick would reject it; a slot takes it.
    const slots = placeSpawnSlots(ai, undefined, ground([130, 210, 140, 220, 45], [110, 200, 120, 210, 5]));
    expect(slots.map((s) => [s.position[1], s.onFloor])).toEqual([[45, true], [5, true]]);
  });

  it('W1.4b: a floor outside the slot\'s sub-map\'s height range gives way to one inside it (75 §3)', () => {
    // Under side 0's slot, a floor at -20 (under BaseMap's 0..50) and one at 15.
    const slots = placeSpawnSlots(ai, undefined, ground([110, 200, 120, 210, -20], [110, 200, 120, 210, 15]));
    expect(slots.map((s) => [s.side, s.position[1], s.onFloor])).toEqual([[1, 37.5, false], [0, 15, true]]);
    // With nothing inside the range, the candidates outside it are still the probe's: Ramps (20..20) over a floor at 10.
    const ramps = placeSpawnSlots(more(), undefined, ground([110, 200, 120, 210, 10]));
    expect(ramps.map((s) => [s.side, s.index, s.position[1], s.onFloor])).toEqual([[1, 0, 37.5, false], [0, 0, 10, true], [0, 1, 10, true]]);
  });

  it('W1.4b: where the probe finds nothing under the slot, the cell\'s y stays and the slot says so', () => {
    const slots = placeSpawnSlots(ai, { a: [0, 30, 0], b: [0, 40, 0] }, ground([0, 0, 50, 50, 0]));
    expect(slots.map((s) => [s.position[1], s.onFloor])).toEqual([[37.5, false], [25, false]]);
  });

  it('refuses a slot whose cell names a sub-map the file does not hold', () => {
    const bad = more();
    bad.spawns.push({ ...bad.spawns[0]!, loc: { map: 5, x: 0, z: 0 } });
    expect(() => placeSpawnSlots(bad)).toThrow(/sub-map 5 of 2/);
  });

  it('fitSlot and accountsFor: W1.R9\'s oracle -- at a slot\'s centre (the actor), or up to 30 behind it (the orbit camera)', () => {
    const slots: SpawnSlot[] = placeSpawnSlots(ai);
    const behind = fitSlot(slots, 1, 135, 191)!;      // side 1 faces +z from (135, 215): 24 behind
    expect(behind.slot.loc).toEqual({ map: 0, x: 3, z: 1 });
    expect(behind.along).toBeCloseTo(-24, 6);
    expect(behind.perp).toBeCloseTo(0, 6);
    expect(accountsFor(behind)).toBe(true);
    expect(accountsFor(fitSlot(slots, 0, 115.3, 205.4))).toBe(true);        // at the centre, 0.5 off
    expect(fitSlot(slots, 0, 135, 191)).toBeUndefined();                    // ahead of side 0's slot (it faces -z)
    expect(accountsFor(fitSlot(slots, 1, 135, 239))).toBe(false);           // 24 ahead of side 1's: the wrong way
    expect(accountsFor(fitSlot(slots, 1, 135, 180))).toBe(false);           // 35 behind: past 30
    expect(accountsFor(fitSlot(slots, 1, 142, 195))).toBe(false);           // 20 behind, 7 across: off the lane
    expect(accountsFor(undefined)).toBe(false);
  });
});

const MP2 = fixture('RUN/MP2.ZDB');
const MP6 = fixture('RUN/MP6.ZDB');
const MP72 = fixture('RUN/MP72.ZDB');

const opened = new Map<string, AiMaps>();
/** Opens a map's AIMAPS.MPS once. Only called from inside a test (vitest collects skipped bodies). */
function open(stem: string): AiMaps {
  const known = opened.get(stem);
  if (known) return known;
  const bytes = fixture(`RUN/${stem}.ZDB`);
  if (!bytes) throw new Error(`${FIXTURES_ABSENT} (RUN/${stem}.ZDB)`);
  const made = aiMapsFromZdb(bytes);
  opened.set(stem, made);
  return made;
}

/** Every loc of every table names a stored cell of the sub-map its map field names (75 §4). */
function everyLocStored(ai: AiMaps): void {
  const stored = (l: { map: number; x: number; z: number }): boolean => {
    const sub = ai.maps[l.map];
    return sub !== undefined && aiCellIndex(sub, l.x, l.z) >= 0;
  };
  for (const s of ai.spawns) expect(stored(s.loc)).toBe(true);
  for (const sub of ai.maps) {
    for (const p of sub.points) expect(stored(p.loc) && p.loc.map === sub.index).toBe(true);
    for (const k of sub.links) {
      expect(stored(k.from) && stored(k.to)).toBe(true);
      // every link is stored twice, once from each end
      const back = ai.maps[k.to.map]!.links.some((b) => b.to.map === k.from.map && b.to.x === k.from.x && b.to.z === k.from.z);
      expect(back).toBe(true);
    }
  }
}

describe('AIMAPS.MPS on the fixture maps (75 §2-§7)', () => {
  it.skipIf(!MP2)('Frostfire: BaseMap, Ramps and Tunnels, 10,890 + 1,617 + 3,315 cells, 572 spawn records', () => {
    const ai = open('MP2');
    expect(ai.maps.map((m) => [m.name, m.cellsX, m.cellsZ, m.cells.length])).toEqual([
      ['BaseMap', 137, 100, 10890], ['Ramps', 110, 99, 1617], ['Tunnels', 110, 99, 3315],
    ]);
    expect(ai.maps.map((m) => m.spawns.length)).toEqual([400, 0, 172]);
    expect(ai.spawns.length).toBe(572);
    expect(ai.maps[0]!.points.map((p) => p.name)).toEqual(['PlayerStart', 'spectator', 'Charlie', 'Delta', 'Echo', 'Foxtrot']);
    expect(spawnSlots(ai, 0).length).toBe(24);
    expect(spawnSlots(ai, 1).length).toBe(24);
    everyLocStored(ai);
  });

  it.skipIf(!MP2)('Frostfire: PlayerStart is one cell, and neither measured spawn is in it (W1.R4, 75 §7)', () => {
    const ai = open('MP2');
    const { sub, point } = namedPoint(ai, 'playerstart', 'startplayer')!;
    expect(point.loc).toEqual({ map: 0, x: 44, z: 35 });
    expect(aiCellMarker(sub.cells[aiCellIndex(sub, 44, 35)]!)).toBe(3);
    const [cx, cz] = aiCellCentre(sub, 44, 35);
    expect(cx).toBeCloseTo(495.73, 2);
    expect(cz).toBeCloseTo(653.57, 2);
    const { a, b } = SPAWNS.FROSTFIRE!;
    for (const [x, , z] of [a, b]) expect(Math.abs(x - cx) > 5 || Math.abs(z - cz) > 5).toBe(true);
  });

  it.skipIf(!MP2)('Frostfire: A and B stand at the centre of a spawn slot of sides 0 and 1 (KNOWN section 1 rows, 75 §7)', () => {
    const ai = open('MP2');
    const { a, b } = SPAWNS.FROSTFIRE!;
    const fa = fitSpawn(ai, 0, a[0], a[2])!, fb = fitSpawn(ai, 1, b[0], b[2])!;
    expect(fa.distance).toBeLessThan(0.6);
    expect(fa.slot.record.loc).toEqual({ map: 0, x: 74, z: 31 });
    expect(fa.slot.record.flags).toBe(0x04);
    expect(fb.distance).toBeLessThan(0.6);
    expect(fb.slot.record.loc).toEqual({ map: 0, x: 48, z: 95 });
    expect(fb.slot.record.flags).toBe(0x22);
    // and each is far from the other side's slots
    expect(Math.min(...spawnSlots(ai, 1).map((s) => Math.hypot(s.x - a[0], s.z - a[2])))).toBeGreaterThan(500);
    expect(Math.min(...spawnSlots(ai, 0).map((s) => Math.hypot(s.x - b[0], s.z - b[2])))).toBeGreaterThan(500);
  });

  it.skipIf(!MP2)('Frostfire: 24 slots a side placed, y from their cells, A and B each accounted for (W1.R9)', () => {
    const measured = SPAWNS.FROSTFIRE!;
    const slots = placeSpawnSlots(open('MP2'), measured);
    for (const side of [0, 1] as const) {
      expect(slots.filter((s) => s.side === side).map((s) => s.index)).toEqual([...Array(24).keys()]);
    }
    // Research 179 section 9.14: A's cell (74, 31) y 100.00 (feet measured at 100), B's (48, 95) 141.93 (feet at 143:
    // the record's unit of lift and the floor pick over it).
    const at = (x: number, z: number): number => slots.find((s) => s.loc.map === 0 && s.loc.x === x && s.loc.z === z)!.position[1];
    expect(Math.abs(at(74, 31) - 100.00)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(at(48, 95) - 141.93)).toBeLessThanOrEqual(0.01);
    const fa = fitSlot(slots, 0, measured.a[0], measured.a[2]), fb = fitSlot(slots, 1, measured.b[0], measured.b[2]);
    expect(accountsFor(fa) && accountsFor(fb)).toBe(true);
    expect(fa!.slot.loc).toEqual({ map: 0, x: 74, z: 31 });
    expect(fb!.slot.loc).toEqual({ map: 0, x: 48, z: 95 });
  });

  it.skipIf(!MP6)('Desert Glory: nine sub-maps, 16 links, a Safety zone 8 x 15 cells, 96 records, A and B 23-24 units behind a slot', () => {
    const ai = open('MP6');
    expect(ai.maps.length).toBe(9);
    expect(ai.maps[0]!.name).toBe('Base Map');
    expect(ai.maps.reduce((n, m) => n + m.links.length, 0)).toBe(16);
    expect(ai.links).toEqual({ words: 16, records: 31 });
    expect(ai.maps[0]!.zones).toEqual([{ name: 'Safety', corner: { map: 0, x: 6, z: 76 }, width: 8, height: 15, kind: 1 }]);
    expect(ai.spawns.length).toBe(96);
    const { a, b } = SPAWNS['DESERT GLORY']!;
    const fa = fitSpawn(ai, 0, a[0], a[2])!, fb = fitSpawn(ai, 1, b[0], b[2])!;
    expect(fa.along).toBeCloseTo(-23.26, 1);
    expect(Math.abs(fa.perp)).toBeLessThan(3.5);
    expect(fb.along).toBeCloseTo(-23.66, 1);
    expect(Math.abs(fb.perp)).toBeLessThan(3.5);
    everyLocStored(ai);
  });

  it.skipIf(!MP72)('Crossroads: ground and floor1, eight named points, 96 records, A and B behind a slot', () => {
    const ai = open('MP72');
    expect(ai.maps.map((m) => [m.name, m.cellsX, m.cellsZ])).toEqual([['ground', 212, 212], ['floor1', 729, 627]]);
    expect(ai.maps[0]!.points.length).toBe(8);
    expect(namedPoint(ai, 'startplayer')?.point.loc).toEqual({ map: 0, x: 87, z: 107 });
    expect(ai.spawns.length).toBe(96);
    const { a, b } = SPAWNS.CROSSROADS!;
    const fa = fitSpawn(ai, 0, a[0], a[2])!, fb = fitSpawn(ai, 1, b[0], b[2])!;
    expect(fa.along).toBeCloseTo(-23.89, 1);
    expect(fb.along).toBeCloseTo(-20.11, 1);
    expect(Math.max(Math.abs(fa.perp), Math.abs(fb.perp))).toBeLessThan(3.5);
    everyLocStored(ai);
  });
});

/**
 * HX-0b (web sprint 31; research 237 s1, 190 s3.2 B2 and V2 claim 4): the kind-1 zone test as the original makes it on an
 * actor's AI-map cell, the cell an x,z falls in, and the zone's centre cell the HUD marks.
 */
describe('the zone test and the zone centre (HX-0b; research 237 s1)', () => {
  const safety: AiZone = { name: 'Safety', corner: { map: 0, x: 6, z: 76 }, width: 8, height: 15, kind: 1 };

  it("zoneContains is the original's test (FUN_0052a200 D:L395058-395098): the same sub-map and 0 <= cell - corner < size on both axes -- on Safety 0:(6,76) 8x15, (6,76) in, (14,76) out, (13,90) in, (13,91) out, 1:(6,76) out (ZONE_CONTAINS_READING)", () => {
    expect(ZONE_CONTAINS_READING).toBe('same sub-map, half-open rectangle, on the cell');
    expect(zoneContains(safety, { map: 0, x: 6, z: 76 })).toBe(true);
    expect(zoneContains(safety, { map: 0, x: 14, z: 76 })).toBe(false);    // x - corner = w: half-open
    expect(zoneContains(safety, { map: 0, x: 13, z: 90 })).toBe(true);
    expect(zoneContains(safety, { map: 0, x: 13, z: 91 })).toBe(false);    // z - corner = h
    expect(zoneContains(safety, { map: 1, x: 6, z: 76 })).toBe(false);     // another sub-map
    expect(zoneContains(safety, { map: 0, x: 5, z: 80 })).toBe(false);     // before the corner
    expect(zoneContains(safety, { map: 0, x: 8, z: 75 })).toBe(false);
    // zonesOfKind walks every sub-map's table for the kind (the original's per-kind list, FUN_0052bb70)
    const ai = parseAiMaps(synthetic());
    expect(zonesOfKind(ai, 1).map(({ sub, zone }) => [sub.name, zone.name])).toEqual([['BaseMap', 'Safety']]);
    expect(zonesOfKind(ai, 2)).toEqual([]);
  });

  it.skipIf(!MP6)("aiCellOf maps a world x,z to its cell by the sub-map's min and 10-unit cells and null off the grid; zoneCentre is corner + (w >> 1, h >> 1) at the cell's height: Safety's (10,83) = (810.26, -30.08, 1959.72) (FUN_002a42b0 D:L147723)", () => {
    const ai = parseAiMaps(synthetic());
    const base = ai.maps[0]!;                                   // min (100, 0, 200), 4 x 3 cells of 10
    expect(aiCellOf(base, 125, 215)).toEqual({ map: 0, x: 2, z: 1 });
    expect(aiCellOf(base, 100, 200)).toEqual({ map: 0, x: 0, z: 0 });
    expect(aiCellOf(base, 139.99, 229.99)).toEqual({ map: 0, x: 3, z: 2 });
    expect(aiCellOf(base, 99.99, 215)).toBeNull();
    expect(aiCellOf(base, 140, 215)).toBeNull();                // x = cellsX: off the grid
    expect(aiCellOf(base, 125, 230)).toBeNull();
    expect(aiCellOf(ai.maps[1]!, 115, 205)).toEqual({ map: 1, x: 0, z: 0 });   // the loc names the sub-map's index
    // the synthetic zone 0:(0,1) 2 x 1: centre cell (1,1), stored, height 0
    expect(zoneCentre(base, base.zones[0]!)).toEqual([115, 0, 215]);

    const mp6 = open('MP6');
    const { sub, zone } = zonesOfKind(mp6, 1)[0]!;
    expect(zone).toEqual(safety);
    const at = zoneCentre(sub!, zone!)!;
    expect(at[0]).toBeCloseTo(810.26, 2);
    expect(at[1]).toBeCloseTo(-30.08, 2);
    expect(at[2]).toBeCloseTo(1959.72, 2);
    expect(aiCellOf(sub!, at[0], at[2])).toEqual({ map: 0, x: 10, z: 83 });
    expect(zoneContains(zone!, aiCellOf(sub!, 765.27, 1884.73)!)).toBe(true);   // the rectangle's first cell
    expect(zoneContains(zone!, aiCellOf(sub!, 845.27, 1959.72)!)).toBe(false);  // one cell past x [765.26, 845.26)
  });
});
