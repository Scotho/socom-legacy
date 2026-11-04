// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZdb, Zar } from '@s2u/archive';
import { interpretChainParts, modelNodes, unpackVif, vifHistogram, walkModel } from '../src';
import { fixture } from '../../archive/test/fixtures';

/**
 * Parity pins for the map geometry's DMA chains (TA.R3; research 72 section 3, `packages/mesh/SEMANTICS.md`): for every
 * model archive a map carries of its own (`WORL_MDL.ZED`, `<stem>_MDL.ZED`, `FLIB_MDL.ZED` and the rest under
 * `RUN/MP/<stem>/`, but `CLIB_MDL.ZED`, whose character chains are another form), what `walkModel`, `vifHistogram`,
 * `unpackVif` and `interpretChainParts` make of it -- chains, tags by relocation type, the VIF command histogram, the
 * unpack formats, the MSCAL entries, the decoded meshes and line strips -- on all 22 maps, in
 * `golden/map-chains.json`. The unit half holds the pin against research 72 section 3's table and the invariants it
 * states; the data half re-derives the pin from the disc (22) or the fixtures (3). `S2U_GOLDEN_WRITE=1` rewrites it.
 * The chains need the model buffers, so no unit test here drives the walker from the pin: `dma.test.ts`,
 * `vif.test.ts` and `interpret.test.ts` hold the readers on hand-built chains.
 */

interface MemberRow {
  member: string;
  models: number; modelsWithChains: number; chains: number; tags: number;
  reloc: Record<string, number>; vif: Record<string, number>; formats: Record<string, number>; unflagged: number;
  mscalEntries: number[]; packets: { mscal: number; mscnt: number };
  citations: number; textures: number;
  meshes: number; vertices: number; triangles: number; unfogged: number; lines: number; linePoints: number;
}
interface MapRow { stem: string; members: MemberRow[] }
interface Golden { _source: string; maps: MapRow[] }

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(HERE, 'golden/map-chains.json');
const GOLDEN = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE_DISC = !!DISC && existsSync(resolve(RUN, 'MP2.ZDB'));
const FIXTURES = ['MP2', 'MP6', 'MP72'].map((stem) => [stem, fixture(`RUN/${stem}.ZDB`)] as const);
const HAVE_FIXTURES = FIXTURES.every(([, b]) => b !== null);

const sorted = (o: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

function memberRow(member: string, zar: Zar): MemberRow {
  const perModel = zar.root.children.map((m) => walkModel(zar.data(m), modelNodes(zar, m)));
  const chains = perModel.flat();
  const reloc: Record<string, number> = {}, vif: Record<string, number> = {}, formats: Record<string, number> = {};
  const entries = new Set<number>();
  let mscal = 0, mscnt = 0, unflagged = 0, meshes = 0, vertices = 0, triangles = 0, unfogged = 0, lines = 0, linePoints = 0;
  for (const c of chains) {
    for (const t of c.tags) reloc[t.reloc] = (reloc[t.reloc] ?? 0) + 1;
    for (const [k, v] of Object.entries(vifHistogram(c.vif))) vif[k] = (vif[k] ?? 0) + v;
    for (const p of unpackVif(c)) {
      if (p.kind === 'mscnt') mscnt++; else { mscal++; entries.add(p.entry!); }
      for (const u of p.unpacks) {
        const key = `V${u.vn + 1}-${[32, 16, 8][u.vl]}${u.usn ? ' USN' : ''}`;
        formats[key] = (formats[key] ?? 0) + 1;
        if (!u.flg) unflagged++;
      }
    }
    const parts = interpretChainParts(c);
    for (const m of parts.meshes) {
      meshes++; vertices += m.positions.length / 3; triangles += m.indices.length / 3;
      if (!m.fog) unfogged++;
    }
    for (const s of parts.lines) { lines++; linePoints += s.positions.length / 3; }
  }
  return {
    member, models: zar.root.children.length, modelsWithChains: perModel.filter((c) => c.length > 0).length,
    chains: chains.length, tags: chains.reduce((n, c) => n + c.tags.length, 0),
    reloc: sorted(reloc), vif: sorted(vif), formats: sorted(formats), unflagged, mscalEntries: [...entries].sort((a, b) => a - b),
    packets: { mscal, mscnt }, citations: chains.reduce((n, c) => n + c.textureNames.length, 0),
    textures: new Set(chains.flatMap((c) => c.textureNames)).size,
    meshes, vertices, triangles, unfogged, lines, linePoints,
  };
}

function mapRow(stem: string, zdb: Uint8Array): MapRow {
  const own = new RegExp(`^RUN\\\\MP\\\\${stem}\\\\(\\w+_MDL)\\.ZED$`, 'i');
  const members = parseZdb(zdb).filter((e) => own.test(e.name) && !/\\CLIB_MDL\.ZED$/i.test(e.name))
    .map((e) => memberRow(e.name.slice(e.name.lastIndexOf('\\') + 1), Zar.parse(zdb.subarray(e.offset, e.offset + e.size))));
  return { stem, members };
}

function goldenText(v: unknown, indent = ''): string {
  const flat = JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (flat.length <= 200 || v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) return flat;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + goldenText(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${goldenText(x, inner)}`).join(',\n')}\n${indent}}`;
}

const member = (stem: string, name: string): MemberRow => GOLDEN.maps.find((m) => m.stem === stem)!.members.find((r) => r.member === name)!;
const allMembers = (): MemberRow[] => GOLDEN.maps.flatMap((m) => m.members);

describe('the map chains against their pin (unit: no game data)', () => {
  it("pins research 72 section 3's table: chains, DMA tags and the VIF histogram of nine model sets", () => {
    const row = (stem: string, name: string) => {
      const r = member(stem, name);
      return [r.chains, r.tags, r.vif.NOP, r.vif.STCYCL, r.vif.UNPACK, r.vif.MSCNT, r.vif.MSCAL];
    };
    expect(row('MP2', 'WORL_MDL.ZED')).toEqual([123, 1450, 2953, 2389, 2389, 416, 309]);
    expect(row('MP2', 'MP2_MDL.ZED')).toEqual([433, 2532, 4644, 3810, 3810, 636, 630]);
    expect(row('MP2', 'FLIB_MDL.ZED')).toEqual([12, 82, 175, 137, 137, 24, 17]);
    expect(row('MP6', 'WORL_MDL.ZED')).toEqual([318, 1952, 3987, 3300, 3300, 581, 395]);
    expect(row('MP6', 'MP6_MDL.ZED')).toEqual([555, 3164, 5849, 4852, 4852, 833, 749]);
    expect(row('MP72', 'WORL_MDL.ZED')).toEqual([116, 3618, 7602, 6509, 6509, 1175, 634]);
    expect(row('MP72', 'MP72_MDL.ZED')).toEqual([373, 2976, 6231, 4902, 4902, 935, 553]);
    expect(row('MP1', 'WORL_MDL.ZED')).toEqual([80, 948, 2053, 1722, 1722, 312, 162]);
    expect(row('MP5', 'WORL_MDL.ZED')).toEqual([141, 1344, 2878, 2424, 2424, 438, 234]);
    // "(35 models)", "(67 models)", "(62 models)", "(7 models)": the models that carry a chain.
    expect([member('MP2', 'MP2_MDL.ZED'), member('MP6', 'MP6_MDL.ZED'), member('MP72', 'MP72_MDL.ZED'), member('MP2', 'FLIB_MDL.ZED')]
      .map((r) => r.modelsWithChains)).toEqual([35, 67, 62, 7]);
  });

  it('only NOP, STCYCL, UNPACK, MSCAL and MSCNT occur; every MSCAL is entry 0; every unpack is FLG=1 (research 72 section 3)', () => {
    expect(GOLDEN.maps).toHaveLength(22);
    for (const r of allMembers()) {
      expect(Object.keys(r.vif).filter((k) => !['NOP', 'STCYCL', 'UNPACK', 'MSCAL', 'MSCNT'].includes(k)), r.member).toEqual([]);
      expect(r.vif.STCYCL, r.member).toBe(r.vif.UNPACK);
      expect(r.mscalEntries.filter((e) => e !== 0), r.member).toEqual([]);
      expect(r.unflagged, r.member).toBe(0);
      expect([r.packets.mscal, r.packets.mscnt], r.member).toEqual([r.vif.MSCAL ?? 0, r.vif.MSCNT ?? 0]);
    }
  });

  it('the unpack formats are V4-32, V4-16, V4-8 unsigned and V3-16, and nothing else, on every map', () => {
    for (const r of allMembers()) {
      for (const k of Object.keys(r.formats)) expect(['V4-32', 'V4-16', 'V4-8 USN', 'V3-16'], r.member).toContain(k);
    }
    // Research 72 section 3 counts the RGBA unpacks of Frostfire's world as "416 + 309"; the reader finds two per drawn
    // packet (the V4-8 num=36 colours and the V4-8 num=12 tail, vif.test.ts), 832, and 725 V4-32 (309 + 416).
    expect(member('MP2', 'WORL_MDL.ZED').formats).toEqual({ 'V3-16': 416, 'V4-16': 416, 'V4-32': 725, 'V4-8 USN': 832 });
  });

  it('relocation types 2, 3, 4 and 6 everywhere; type 1 on Desert Glory (31 tags) and Crossroads (163) among the five', () => {
    const types = (stem: string) => [...new Set(GOLDEN.maps.find((m) => m.stem === stem)!.members.flatMap((r) => Object.keys(r.reloc)))].sort();
    const ones = (stem: string) => GOLDEN.maps.find((m) => m.stem === stem)!.members.reduce((n, r) => n + (r.reloc[1] ?? 0), 0);
    for (const stem of ['MP1', 'MP2', 'MP5']) expect(types(stem), stem).toEqual(['2', '3', '4', '6']);
    expect([types('MP6'), types('MP72')]).toEqual([['1', '2', '3', '4', '6'], ['1', '2', '3', '4', '6']]);
    expect([ones('MP6'), ones('MP72')]).toEqual([31, 163]);
  });

  it("Frostfire's world: 416 drawn packets, 15,071 vertices, 8,764 triangles, 33 unfogged, 37 textures over 309 citations, no line", () => {
    const w = member('MP2', 'WORL_MDL.ZED');
    expect([w.meshes, w.vertices, w.triangles, w.unfogged, w.textures, w.citations, w.lines]).toEqual([416, 15_071, 8_764, 33, 37, 309, 0]);
  });

  it('the line strips of relocation type 1: Desert Glory 31 strips of 221 points, Crossroads 163 of 850', () => {
    expect([member('MP6', 'MP6_MDL.ZED').lines, member('MP6', 'MP6_MDL.ZED').linePoints]).toEqual([31, 221]);
    expect([member('MP72', 'MP72_MDL.ZED').lines, member('MP72', 'MP72_MDL.ZED').linePoints]).toEqual([163, 850]);
    for (const r of allMembers()) expect(r.lines, r.member).toBe(r.reloc[1] ?? 0);   // one strip per type-1 tag
  });
});

describe('the map chains re-derived from the data (fixture / disc)', () => {
  it.skipIf(!HAVE_FIXTURES)('re-derives the MP2, MP6 and MP72 rows from the fixtures', () => {
    for (const [stem, bytes] of FIXTURES) expect(mapRow(stem, bytes!), stem).toEqual(GOLDEN.maps.find((m) => m.stem === stem));
  });

  it.skipIf(!HAVE_DISC)('re-derives the 22 rows from SOCOM_DISC', () => {
    const stems = readdirSync(RUN).filter((n) => /^MP\d+\.ZDB$/.test(n)).map((n) => n.slice(0, -4))
      .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const maps = stems.map((s) => mapRow(s, new Uint8Array(readFileSync(resolve(RUN, `${s}.ZDB`)))));
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN_PATH, `${goldenText({
        _source: "SOCOM_DISC RUN/MP*.ZDB: each map's own RUN/MP/<stem>/*_MDL.ZED but CLIB_MDL.ZED, through Zar.parse, walkModel + modelNodes (mesh/src/dma.ts), vifHistogram + unpackVif (vif.ts), interpretChainParts (interpret.ts). Pinned 2026-10-02.",
        maps,
      })}\n`);
    }
    expect(maps).toEqual(GOLDEN.maps);
  }, 120_000);
});
