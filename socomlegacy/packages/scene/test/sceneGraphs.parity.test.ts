// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import {
  facadeOf, NODE_INSTANCE, parseClutter, parseSceneGraph, placeInstances, visualNodes, worldCollision, type SceneNode,
} from '../src/index';
import { buildZar, cat, f32, u32, type KeySpec } from './syntheticZar';

/**
 * Parity pins for the scene graphs (TA.R3; research 72 sections 2 and 6, `sceneGraph.ts`): what `parseSceneGraph`,
 * `placeInstances`, `worldCollision` and `parseClutter` make of every map's `<stem>_GEO.ZED` and `CLUTTER.ZAR` --
 * the counts of research 72's tables, the polygon shapes, the facade and lit nodes -- for all 22 MP maps, in
 * `golden/scene-graphs.json`. The unit half reads a GEO archive built by hand from the documented layout and checks
 * the pin against research 72's tables; the data half re-derives the pin from the disc (22) or the fixtures (3).
 * `S2U_GOLDEN_WRITE=1` with the disc present rewrites the pin.
 */

interface GraphRow {
  stem: string;
  /** Keys in `<stem>_GEO.ZED`. */
  keys: number;
  prototypes: number;
  /** Nodes that name a model (`model_name`), at any depth. */
  instances: number;
  /** `visuals/vis` children, at any depth. */
  visuals: number;
  /** `di` polygons, at any depth. */
  polys: number;
  /** Polygons by `ditype,ptcount`. */
  shapes: Record<string, number>;
  maxPoints: number;
  /** Distinct `m_refcount` values over the polygons. */
  refcounts: number;
  /** Nodes whose `m_facade` (flags bits 8-9) is set. */
  facadeNodes: number;
  /** Placements (`placeInstances`), and of them those facing the camera and those lit on VU1. */
  placed: number;
  facades: number;
  lit: number;
  /** Polygons realised in the world frame (`worldCollision`). */
  worldPolys: number;
  /** `CLUTTER.ZAR`: its bytes, its models and instances. */
  clutter: { bytes: number; models: number; instances: number };
}
interface Golden { _source: string; maps: GraphRow[] }

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(HERE, 'golden/scene-graphs.json');
const GOLDEN = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE_DISC = !!DISC && existsSync(resolve(RUN, 'MP2.ZDB'));
const FIXTURES = ['MP2', 'MP6', 'MP72'].map((stem) => [stem, fixture(`RUN/${stem}.ZDB`)] as const);
const HAVE_FIXTURES = FIXTURES.every(([, b]) => b !== null);

function graphRow(stem: string, zdb: Uint8Array): GraphRow {
  const toc = parseZdb(zdb);
  const geo = Zar.parse(zdbMember(zdb, toc, `${stem}_GEO.ZED`));
  const models = parseSceneGraph(geo);
  const all: SceneNode[] = [];
  const walk = (n: SceneNode): void => { all.push(n); n.children.forEach(walk); };
  models.forEach(walk);
  const polys = all.flatMap((n) => n.collision);
  const shapes: Record<string, number> = {};
  for (const p of polys) shapes[`${p.ditype},${p.ptcount}`] = (shapes[`${p.ditype},${p.ptcount}`] ?? 0) + 1;
  const placed = placeInstances(models);
  const clutterEntry = toc.find((e) => /\\CLUTTER\.ZAR$/i.test(e.name));
  const clutterZar = clutterEntry ? Zar.parse(zdb.subarray(clutterEntry.offset, clutterEntry.offset + clutterEntry.size)) : null;
  const clutter = clutterZar?.find('Clutter') ? parseClutter(clutterZar) : [];
  return {
    stem, keys: geo.keyCount, prototypes: models.length, instances: all.filter((n) => n.modelName !== null).length,
    visuals: all.reduce((s, n) => s + n.visuals, 0), polys: polys.length,
    shapes: Object.fromEntries(Object.entries(shapes).sort(([a], [b]) => a.localeCompare(b))),
    maxPoints: Math.max(...polys.map((p) => p.ptcount)), refcounts: new Set(polys.map((p) => p.refcount)).size,
    facadeNodes: all.filter((n) => facadeOf(n.flags) !== 0).length, placed: placed.length, facades: placed.filter((p) => p.facade !== 0).length, lit: placed.filter((p) => p.lit).length,
    worldPolys: worldCollision(models).length,
    clutter: { bytes: clutterEntry?.size ?? 0, models: new Set(clutter.map((c) => c.modelName)).size, instances: clutter.length },
  };
}

function goldenText(v: unknown, indent = ''): string {
  const flat = JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (flat.length <= 200 || v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) return flat;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + goldenText(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${goldenText(x, inner)}`).join(',\n')}\n${indent}}`;
}

const row = (stem: string): GraphRow => GOLDEN.maps.find((r) => r.stem === stem)!;
const text = (s: string): Uint8Array => Uint8Array.from([...s, '\0'].map((c) => c.charCodeAt(0)));

/** `tag_NODE_PARAMS` as research 72 section 2 (superseded 2026-09-21) lays it out: matrix 64, bbox 24, m_type, flags. */
const nparams = (matrix: number[], bbox: number[], type: number, flags: number): Uint8Array => cat(f32(...matrix), f32(...bbox), u32(type, flags));
/** A `di` polygon (research 72 section 6): 12-byte params -- region, refcount, the packed word -- then 16 bytes a point. */
const di = (region: number, refcount: number, packed: number, points: number[][]): KeySpec => ({
  name: 'di', children: [{ name: 'params', data: u32(region, refcount, packed) }, { name: 'points', data: f32(...points.flatMap((p) => [...p, 0])) }],
});
const packed = (f: { ditype: number; ptcount: number; material: number; cameratype: number; appflags: number; inside: number; shadow: number }): number =>
  (f.ditype | (f.ptcount << 2) | (f.material << 10) | (f.cameratype << 18) | (f.appflags << 20) | (f.inside << 23) | (f.shadow << 24)) >>> 0;
const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('the scene graphs against their pin (unit: no game data)', () => {
  it('parseSceneGraph reads a GEO archive built by the documented layout: nparams 64 + 24 + type + flags, visuals, di, children', () => {
    const word = { ditype: 3, ptcount: 3, material: 11, cameratype: 1, appflags: 5, inside: 1, shadow: 2 };
    const geo = Zar.parse(buildZar([{
      name: 'models', children: [{
        name: 'crate',
        children: [
          { name: 'nparams', data: nparams([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 6, 7, 1], [-1, -2, -3, 1, 2, 3], 7, 0x1003) },
          { name: 'regionmask', data: u32(0x40) },
          { name: 'visuals', children: [{ name: 'vis', children: [{ name: 'vparams', data: u32(0x08, 0x03000000, 0, 0, 0, 0) }] }] },
          { name: 'di', children: [di(9, 0x2d, packed(word), [[0, 0, 0], [1, 0, 0], [0, 0, 1]])] },
          { name: 'children', children: [{ name: 'inst', children: [
            { name: 'nparams', data: nparams(ID, [0, 0, 0, 0, 0, 0], NODE_INSTANCE, 0x200) },
            { name: 'model_name', data: text('crate') },
          ] }] },
        ],
      }],
    }]));
    const [crate] = parseSceneGraph(geo);
    expect(crate!.name).toBe('crate');
    expect([crate!.type, crate!.flags, crate!.regionmask, crate!.modelName]).toEqual([7, 0x1003, 0x40, null]);
    expect(Array.from(crate!.matrix)).toEqual([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 6, 7, 1]);
    expect(Array.from(crate!.bbox)).toEqual([-1, -2, -3, 1, 2, 3]);
    expect([crate!.visuals, crate!.visualParams, crate!.visualMaterials]).toEqual([1, [0x08], [3]]);
    expect(crate!.collision).toHaveLength(1);
    const poly = crate!.collision[0]!;
    expect({ ...poly, points: Array.from(poly.points) }).toEqual({
      region: 9, refcount: 0x2d, ...word, reverbZone: 0, points: [0, 0, 0, 1, 0, 0, 0, 0, 1],   // the stored w dropped
    });
    const inst = crate!.children[0]!;
    expect([inst.type, inst.modelName, facadeOf(inst.flags)]).toEqual([NODE_INSTANCE, 'crate', 2]);
    expect(visualNodes(crate!).map((n) => n.name)).toEqual(['crate']);   // never down through an instance
  });

  it('parseSceneGraph refuses an nparams that is not 96 bytes and a di whose ptcount disagrees with its points', () => {
    const one = (np: Uint8Array, d: KeySpec[] = []): Zar => Zar.parse(buildZar([{ name: 'models', children: [{ name: 'm', children: [
      { name: 'nparams', data: np }, ...(d.length ? [{ name: 'di', children: d }] : []),
    ] }] }]));
    expect(() => parseSceneGraph(one(nparams(ID, [0, 0, 0, 0, 0, 0, 0, 0], 1, 0)))).toThrow(/nparams is 104 bytes, expected 96/);
    const four = packed({ ditype: 2, ptcount: 4, material: 0, cameratype: 0, appflags: 0, inside: 0, shadow: 0 });
    expect(() => parseSceneGraph(one(nparams(ID, [0, 0, 0, 0, 0, 0], 1, 0), [di(0, 0, four, [[0, 0, 0], [1, 0, 0], [0, 0, 1]])])))
      .toThrow(/ptcount 4 but 48 bytes of points/);
  });

  it("pins research 72 section 2's table: prototypes, instance nodes, visuals, collision polygons and keys of five maps", () => {
    const table = (stem: string) => { const r = row(stem); return [r.prototypes, r.instances, r.visuals, r.polys, r.keys]; };
    expect(table('MP2')).toEqual([46, 206, 177, 2756, 10_433]);
    expect(table('MP6')).toEqual([87, 167, 604, 5442, 21_114]);
    expect(table('MP72')).toEqual([70, 196, 263, 8168, 27_497]);
    expect(table('MP1')).toEqual([47, 160, 218, 7773, 25_945]);
    expect(table('MP5')).toEqual([29, 23, 205, 7319, 23_580]);
    expect(GOLDEN.maps).toHaveLength(22);
  });

  it("pins research 72 section 6's commonest polygon shapes (ditype, points) for MP2, MP6 and MP72, and Frostfire's largest of 12 points", () => {
    const top = (stem: string, n: number) => Object.entries(row(stem).shapes).sort(([, a], [, b]) => b - a).slice(0, n);
    expect(top('MP2', 6)).toEqual([['2,4', 1743], ['3,4', 736], ['2,3', 184], ['3,3', 43], ['3,6', 22], ['3,5', 15]]);
    expect(top('MP6', 5)).toEqual([['3,3', 2621], ['2,4', 1587], ['3,4', 664], ['2,3', 468], ['2,5', 54]]);
    expect(top('MP72', 5)).toEqual([['2,4', 4528], ['2,3', 1383], ['3,4', 1111], ['3,3', 901], ['2,5', 66]]);
    // Research 72 section 6: "Largest polygon seen: 12 points". Frostfire's largest has 12; but Blizzard (MP1, one of
    // the note's five maps) has one of 14, and over all 22 the largest is The Mixer's 16 -- the note's figure is wrong.
    expect([row('MP2').maxPoints, row('MP1').maxPoints, row('MP52').maxPoints]).toEqual([12, 14, 16]);
    expect(Math.max(...GOLDEN.maps.map((r) => r.maxPoints))).toBe(16);
    // Only ditype 2 and 3 occur, on every map (collision.ts, `WorldPoly.ditype`).
    for (const r of GOLDEN.maps) for (const k of Object.keys(r.shapes)) expect(['2', '3'], r.stem).toContain(k.split(',')[0]);
    for (const r of GOLDEN.maps) expect(Object.values(r.shapes).reduce((a, b) => a + b, 0), r.stem).toBe(r.polys);
  });

  it('m_refcount is not one value: research 72 section 6 superseded its "0x2d in every polygon"', () => {
    expect(row('MP2').refcounts).toBeGreaterThan(1);
  });

  it('41 facade nodes over the 22 maps (sceneGraph.ts m_facade); no Frostfire placement is lit (research 82 D2)', () => {
    expect(GOLDEN.maps.reduce((n, r) => n + r.facadeNodes, 0)).toBe(41);
    expect(row('MP2').lit).toBe(0);
    expect(row('MP2').worldPolys).toBe(3318);    // the 2,756 graph polygons realised as 3,318 placements
  });

  it('CLUTTER.ZAR: Frostfire and Crossroads a 192-byte stub; Desert Glory 6 models, 110 instances; Blizzard 12, 211', () => {
    expect(row('MP2').clutter).toEqual({ bytes: 192, models: 0, instances: 0 });
    expect(row('MP72').clutter).toEqual({ bytes: 192, models: 0, instances: 0 });
    expect(row('MP6').clutter).toMatchObject({ models: 6, instances: 110 });
    expect(row('MP1').clutter).toMatchObject({ models: 12, instances: 211 });
  });
});

describe('the scene graphs re-derived from the data (fixture / disc)', () => {
  it.skipIf(!HAVE_FIXTURES)('re-derives the MP2, MP6 and MP72 rows from the fixtures', () => {
    for (const [stem, bytes] of FIXTURES) expect(graphRow(stem, bytes!), stem).toEqual(row(stem));
  });

  it.skipIf(!HAVE_DISC)('re-derives the 22 rows from SOCOM_DISC', () => {
    const stems = readdirSync(RUN).filter((n) => /^MP\d+\.ZDB$/.test(n)).map((n) => n.slice(0, -4))
      .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const maps = stems.map((s) => graphRow(s, new Uint8Array(readFileSync(resolve(RUN, `${s}.ZDB`)))));
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN_PATH, `${goldenText({
        _source: 'SOCOM_DISC RUN/MP*.ZDB: <stem>_GEO.ZED through Zar.parse and parseSceneGraph, placeInstances, worldCollision (scene/src/sceneGraph.ts, buildScene.ts, collision.ts); CLUTTER.ZAR through parseClutter (clutter.ts). Pinned 2026-10-02.',
        maps,
      })}\n`);
    }
    expect(maps).toEqual(GOLDEN.maps);
  });
});
