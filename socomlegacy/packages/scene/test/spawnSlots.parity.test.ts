// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRdr, parseZdb, rdrGet, zdbMember, Zar } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import {
  accountsFor, aiMapsFromZdb, decodeAiLoc, fitSlot, placeSpawnSlots, spawnsFor, type AiMaps, type AiSpawnRecord, type AiSubMap,
} from '../src/index';

/**
 * Parity pins for `AIMAPS.MPS` and its spawn slots (TA.R3; research 75): the sub-map headers, the named points and
 * every slot (a spawn record with bit 4 clear) of the trailer's list, in its order, as `parseAiMaps` reads them on
 * the 22 maps, in `golden/aimaps-slots.json`. The unit half checks the pin against research 75's counts, then builds
 * an `AiMaps` from the pinned rows and drives `placeSpawnSlots`, `fitSlot` and `accountsFor` with `spawns.ts`'s 44
 * measured positions -- research 75 sections 7, 10 and 11, the W1.R9 oracle -- with no game data. The data half
 * re-derives the pin from the disc (22) or the fixtures (3). `S2U_GOLDEN_WRITE=1` with the disc present rewrites it.
 */

interface SubPin {
  name: string; id: number; flags: number; min: number[]; max: number[]; cellsX: number; cellsZ: number;
  cellSize: number[]; stored: number;
}
interface MapPin {
  stem: string;
  /** `mission.rdr`'s `description`: the key `spawns.ts` is read by. */
  name: string;
  subs: SubPin[];
  /** Named points: sub-map, name, x, z, kind (byte 1 of the word). */
  points: [number, string, number, number, number][];
  /** The trailer's spawn list: its length, and its slots (bit 4 clear) in order as [map, x, z, flags]. */
  records: number;
  slots: [number, number, number, number][];
}
interface Golden { _source: string; maps: MapPin[] }

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(HERE, 'golden/aimaps-slots.json');
const GOLDEN = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE_DISC = !!DISC && existsSync(resolve(RUN, 'MP2.ZDB'));
const FIXTURES = ['MP2', 'MP6', 'MP72'].map((stem) => [stem, fixture(`RUN/${stem}.ZDB`)] as const);
const HAVE_FIXTURES = FIXTURES.every(([, b]) => b !== null);

function mapPin(stem: string, zdb: Uint8Array): MapPin {
  const ai = aiMapsFromZdb(zdb);
  const reader = Zar.parse(zdbMember(zdb, parseZdb(zdb), 'READERM.ZAR'));
  const name = String(rdrGet(parseRdr(reader.data(reader.child(reader.root, 'mission.rdr')!)), 'description'));
  return JSON.parse(JSON.stringify({
    stem, name,
    subs: ai.maps.map((s) => ({ name: s.name, id: s.id, flags: s.flags, min: s.min, max: s.max, cellsX: s.cellsX, cellsZ: s.cellsZ,
      cellSize: s.cellSize, stored: s.cells.length })),
    points: ai.maps.flatMap((s) => s.points.map((p) => [s.index, p.name, p.loc.x, p.loc.z, p.kind])),
    records: ai.spawns.length,
    slots: ai.spawns.filter((r) => !r.twin).map((r) => [r.loc.map, r.loc.x, r.loc.z, r.flags]),
  })) as MapPin;
}

/** The `AiMaps` the engine code needs, from a pin: the sub-maps' boxes and cells, and the trailer's slots. */
function aiFromPin(m: MapPin): AiMaps {
  const maps = m.subs.map((s, index): AiSubMap => ({
    index, name: s.name, id: s.id, flags: s.flags, min: s.min as [number, number, number], max: s.max as [number, number, number],
    cellsX: s.cellsX, cellsZ: s.cellsZ, cellSize: s.cellSize as [number, number], param: 0, stamp: 0, rows: [],
    cells: new Uint32Array(0), cellsB: new Uint32Array(0), points: [], markers: [], links: [], zones: [], spawns: [], lines: [],
  }));
  const spawns = m.slots.map(([map, x, z, flags]): AiSpawnRecord => ({
    // The cell word as the file stores it (CAiMapLoc, 75 section 4), read back through the engine's decoder.
    loc: decodeAiLoc((map | (x << 6) | (z << 19)) >>> 0), flags, side: ((flags >>> 5) & 1) as 0 | 1, twin: (flags & 0x10) !== 0,
    facing: flags & 7, word: 0,
  }));
  return { version: 2, maps, links: { words: 0, records: 0 }, spawns };
}

function goldenText(v: unknown, indent = ''): string {
  const flat = JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (flat.length <= 200 || v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) return flat;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + goldenText(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${goldenText(x, inner)}`).join(',\n')}\n${indent}}`;
}

const pin = (stem: string): MapPin => GOLDEN.maps.find((m) => m.stem === stem)!;

/**
 * Research 75 section 7's table, as corrected in section 11: per map, the start point's cell, then for A (side 0)
 * and B (side 1) the slot that fits the measured position, its flags, and the position's `along` and `perp`.
 */
type Fit = [string, number, number, number];   // slot "m:(x,z)", flags, along, perp
const NOTE_75_S7: Record<string, [string, Fit, Fit]> = {
  MP1: ['0:(145,150)', ['0:(215,217)', 0x00, -24.2, 1.1], ['0:(138,49)', 0x24, -23.8, 1.9]],
  MP2: ['0:(44,35)', ['0:(74,31)', 0x04, 0.4, -0.3], ['0:(48,95)', 0x22, 0.3, 0.4]],
  MP5: ['0:(44,98)', ['0:(84,191)', 0x00, -23.9, 2.2], ['0:(60,32)', 0x24, -24.1, 2.8]],
  MP6: ['0:(69,75)', ['0:(15,77)', 0x02, -23.3, 1.3], ['0:(114,11)', 0x25, -23.7, 2.8]],
  MP7: ['0:(186,61)', ['0:(13,57)', 0x03, -23.3, 2.2], ['0:(175,34)', 0x26, -24.0, 2.0]],
  MP8: ['1:(48,123)', ['1:(158,86)', 0x05, -24.3, 2.9], ['1:(18,86)', 0x20, -23.8, 2.2]],
  MP9: ['0:(62,75)', ['0:(39,69)', 0x00, -23.3, 1.3], ['0:(206,39)', 0x25, -24.0, 2.4]],
  MP10: ['0:(109,121)', ['0:(113,68)', 0x04, -24.0, 3.2], ['0:(91,201)', 0x20, -24.0, 2.8]],
  MP11: ['0:(143,86)', ['0:(118,149)', 0x01, -23.8, 1.4], ['1:(58,18)', 0x22, -27.8, 2.8]],
  MP12: ['0:(172,82)', ['0:(185,88)', 0x06, -23.2, 2.1], ['0:(32,107)', 0x22, -23.8, 2.9]],
  MP51: ['0:(109,103)', ['0:(71,163)', 0x00, 0.1, 0.2], ['0:(130,27)', 0x25, -0.2, -0.1]],
  MP52: ['0:(305,205)', ['0:(227,269)', 0x01, -23.7, 1.3], ['8:(43,59)', 0x20, -23.7, 2.2]],
  MP53: ['0:(324,472)', ['0:(342,495)', 0x00, -23.9, 3.0], ['0:(323,191)', 0x24, -23.1, 2.0]],
  MP61: ['0:(83,54)', ['0:(89,50)', 0x04, -24.5, 3.0], ['0:(69,242)', 0x21, -28.0, 2.5]],
  MP62: ['0:(154,55)', ['0:(99,53)', 0x03, -24.0, 1.2], ['0:(163,142)', 0x23, -23.2, 1.9]],
  MP64: ['0:(120,96)', ['0:(162,223)', 0x00, -25.0, 1.0], ['0:(46,93)', 0x24, -24.0, 1.0]],
  MP71: ['0:(196,93)', ['0:(125,148)', 0x01, -23.9, 1.8], ['0:(193,83)', 0x24, -23.8, 2.6]],
  MP72: ['0:(87,107)', ['0:(164,180)', 0x00, -23.9, 2.2], ['0:(42,46)', 0x24, -20.1, 1.8]],
  MP73: ['0:(111,94)', ['0:(232,205)', 0x07, -23.8, 2.3], ['0:(91,137)', 0x23, -23.6, 1.3]],
  MP81: ['4:(30,12)', ['4:(28,30)', 0x00, -23.8, 1.4], ['1:(46,140)', 0x20, -23.8, 2.4]],
  MP82: ['0:(122,172)', ['0:(93,288)', 0x01, -24.1, 1.4], ['0:(201,149)', 0x25, -23.3, 2.1]],
  MP83: ['0:(120,70)', ['0:(188,245)', 0x07, -23.4, 2.4], ['0:(67,66)', 0x22, -23.8, 2.9]],
};
const cellText = (l: { map: number; x: number; z: number }): string => `${l.map}:(${l.x},${l.z})`;

describe('AIMAPS.MPS and its spawn slots against their pin (unit: no game data)', () => {
  it("pins research 75's counts: 22 files, 83 sub-maps, 946,155 stored cells, 206 named points, 4,591 spawn records", () => {
    expect(GOLDEN.maps).toHaveLength(22);
    const subs = GOLDEN.maps.flatMap((m) => m.subs);
    expect(subs).toHaveLength(83);
    expect(subs.reduce((n, s) => n + s.stored, 0)).toBe(946_155);
    expect(GOLDEN.maps.reduce((n, m) => n + m.points.length, 0)).toBe(206);
    expect(GOLDEN.maps.reduce((n, m) => n + m.records, 0)).toBe(4_591);
    // Section 2: sub-map counts 1 (2 maps), 2 (3), 3 (10), 4 (1), 5 (3), 7 (1), 9 (1), 10 (1).
    const counts: Record<number, number> = {};
    for (const m of GOLDEN.maps) counts[m.subs.length] = (counts[m.subs.length] ?? 0) + 1;
    expect(counts).toEqual({ 1: 2, 2: 3, 3: 10, 4: 1, 5: 3, 7: 1, 9: 1, 10: 1 });
    // Section 3: flags 0x17 and 10-unit cells on all 83; cells in x 12-729, in z 9-627; stored 45-105,152.
    for (const s of subs) expect([s.flags, s.cellSize], s.name).toEqual([0x17, [10, 10]]);
    expect([Math.min(...subs.map((s) => s.cellsX)), Math.max(...subs.map((s) => s.cellsX))]).toEqual([12, 729]);
    expect([Math.min(...subs.map((s) => s.cellsZ)), Math.max(...subs.map((s) => s.cellsZ))]).toEqual([9, 627]);
    expect([Math.min(...subs.map((s) => s.stored)), Math.max(...subs.map((s) => s.stored))]).toEqual([45, 105_152]);
  });

  it('pins 1,058 slots: 24 a side, 25 on side 0 of Blood Lake (MP10) and Vigilance (MP51) (research 75 section 5.5)', () => {
    expect(GOLDEN.maps.reduce((n, m) => n + m.slots.length, 0)).toBe(1_058);
    for (const m of GOLDEN.maps) {
      const side = (s: number) => m.slots.filter(([, , , f]) => ((f >>> 5) & 1) === s).length;
      expect([side(0), side(1)], m.stem).toEqual(m.stem === 'MP10' || m.stem === 'MP51' ? [25, 24] : [24, 24]);
      for (const [, , , f] of m.slots) expect(f, m.stem).toBeLessThanOrEqual(0x37);
    }
  });

  it("Frostfire: BaseMap 137 x 100 of 10,890 stored cells, Ramps 1,617, Tunnels 3,315; PlayerStart one cell at (44, 35), kind 2", () => {
    const ff = pin('MP2');
    expect(ff.subs.map((s) => [s.name, s.id, s.cellsX, s.cellsZ, s.stored])).toEqual([
      ['BaseMap', 0, 137, 100, 10_890], ['Ramps', 3, expect.any(Number), expect.any(Number), 1_617], ['Tunnels', 7, expect.any(Number), expect.any(Number), 3_315],
    ]);
    expect(ff.records).toBe(572);
    expect(ff.points.find((p) => p[1] === 'PlayerStart')).toEqual([0, 'PlayerStart', 44, 35, 2]);
  });

  it("the start point is a cell holding neither measured spawn, on all 22 maps: research 75 section 7's PlayerStart column", () => {
    for (const m of GOLDEN.maps) {
      const [startCell] = NOTE_75_S7[m.stem]!;
      const start = m.points.find((p) => /^(startplayer|playerstart)$/i.test(p[1]))!;
      expect(cellText({ map: start[0], x: start[2], z: start[3] }), m.stem).toBe(startCell);
      const sub = m.subs[start[0]]!;
      const spawns = spawnsFor(m.name)!;
      for (const [x, , z] of [spawns.a, spawns.b]) {
        const cell = [Math.floor((x - sub.min[0]!) / sub.cellSize[0]!), Math.floor((z - sub.min[2]!) / sub.cellSize[1]!)];
        expect(cell, m.stem).not.toEqual([start[2], start[3]]);
      }
    }
  });

  it("placeSpawnSlots and fitSlot: A on side 0's slot #0 and B on side 1's #1 on all 22 maps, each accounted for (75 sections 7, 10, 11)", () => {
    let other = Infinity;
    const frost: number[] = [];
    for (const m of GOLDEN.maps) {
      const spawns = spawnsFor(m.name)!;
      expect(spawns, m.name).toBeDefined();
      const slots = placeSpawnSlots(aiFromPin(m), spawns);
      const [, noteA, noteB] = NOTE_75_S7[m.stem]!;
      for (const [side, [x, , z], note, index] of [[0, spawns.a, noteA, 0], [1, spawns.b, noteB, 1]] as const) {
        const fit = fitSlot(slots, side, x, z)!;
        expect(accountsFor(fit), `${m.stem} side ${side}`).toBe(true);
        expect([fit.slot.index, cellText(fit.slot.loc)], `${m.stem} side ${side}`).toEqual([index, note[0]]);
        expect(m.slots.find(([mm, sx, sz]) => cellText({ map: mm, x: sx, z: sz }) === note[0])![3], `${m.stem} side ${side}`).toBe(note[1]);
        expect(Math.abs(fit.along - note[2]), `${m.stem} side ${side} along`).toBeLessThanOrEqual(0.051);
        expect(Math.abs(fit.perp - note[3]), `${m.stem} side ${side} perp`).toBeLessThanOrEqual(0.051);
        // Exactly one slot of the side accounts for the position (75 section 10).
        const qualifying = slots.filter((s) => s.side === side && accountsFor(fitSlot([s], side, x, z)));
        expect(qualifying, `${m.stem} side ${side}`).toHaveLength(1);
        const nearest = Math.min(...slots.filter((s) => s.side !== side).map((s) => Math.hypot(x - s.position[0], z - s.position[2])));
        if (m.stem === 'MP2') frost.push(nearest); else other = Math.min(other, nearest);
      }
    }
    // The other side's nearest slot: section 7's "other" column. Section 0 and the section 7 counts say 824.6 units or
    // more for every position, but the same table gives Frostfire's A and B 586.7 and 589.0: 824.6 holds for the
    // other 42 only. The pin follows the table, which the disc agrees with.
    expect(frost.map((d) => Number(d.toFixed(1)))).toEqual([586.7, 589.0]);
    expect(Number(other.toFixed(1))).toBe(824.6);
  });

  it('the 40 camera rows sit 20.1-28.0 units behind their slot and 1.0-3.2 to its right; the 4 actor rows within 0.51 of its centre', () => {
    const behind: number[] = [], across: number[] = [], centre: number[] = [];
    for (const m of GOLDEN.maps) {
      const spawns = spawnsFor(m.name)!;
      const slots = placeSpawnSlots(aiFromPin(m), spawns);
      for (const [side, [x, , z]] of [[0, spawns.a], [1, spawns.b]] as const) {
        const fit = fitSlot(slots, side, x, z)!;
        if (m.stem === 'MP2' || m.stem === 'MP51') centre.push(fit.distance);
        else { behind.push(fit.along); across.push(fit.perp); }
      }
    }
    expect([behind.length, centre.length]).toEqual([40, 4]);
    expect([Math.min(...behind), Math.max(...behind)].map((v) => Number(v.toFixed(1)))).toEqual([-28.0, -20.1]);
    expect([Math.min(...across), Math.max(...across)].map((v) => Number(v.toFixed(1)))).toEqual([1.0, 3.2]);
    expect(Math.max(...centre)).toBeLessThanOrEqual(0.51);
    expect(Math.min(...centre)).toBeGreaterThanOrEqual(0.26);
  });
});

describe('AIMAPS.MPS re-derived from the data (fixture / disc)', () => {
  it.skipIf(!HAVE_FIXTURES)('re-derives the MP2, MP6 and MP72 pins from the fixtures through parseAiMaps', () => {
    for (const [stem, bytes] of FIXTURES) expect(mapPin(stem, bytes!), stem).toEqual(pin(stem));
  });

  it.skipIf(!HAVE_DISC)('re-derives the 22 pins from SOCOM_DISC through parseAiMaps, each file read to its last byte', () => {
    const stems = readdirSync(RUN).filter((n) => /^MP\d+\.ZDB$/.test(n)).map((n) => n.slice(0, -4))
      .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const maps = stems.map((s) => mapPin(s, new Uint8Array(readFileSync(resolve(RUN, `${s}.ZDB`)))));
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN_PATH, `${goldenText({
        _source: 'SOCOM_DISC RUN/MP*.ZDB -> AIMAPS.MPS through parseAiMaps (scene/src/aimaps.ts: aiMapsFromZdb); the map name from READERM.ZAR/mission.rdr (parseRdr). Pinned 2026-10-02.',
        maps,
      })}\n`);
    }
    expect(maps).toEqual(GOLDEN.maps);
  });
});
