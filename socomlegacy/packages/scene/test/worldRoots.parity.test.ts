// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZdb, zdbMember, Zar, type ZarKey } from '@s2u/archive';
import { fixture } from '../../archive/test/fixtures';
import {
  buildGrid, DEFAULT_ENV_TEXTURE, GRID_CELLS_MAX, parseMaterialPalette, parseWorldRoot, type EnvMaterial, type WorldRoot,
} from '../src/index';
import { buildZar, cat, f32, u32, type KeySpec } from './syntheticZar';

/**
 * Parity pins for the world roots (TA.R3; research 72 section 2, research 93 section 2, `worldRoot.ts`): the keys of
 * every archive's own `<stem>.ZED` that `parseWorldRoot` and `parseMaterialPalette` read -- `MetersPerUnit`,
 * `ShadowVector`, `NightMission`, `DefaultMaterial`, `GlobalLighting`, `TextureScroll_Object`, `grid_params`,
 * `Material_Palette` -- as stored (raw), with a sha256 of what the readers give (decoded), for the 22 MP and 12 campaign archives,
 * in `golden/world-roots.json`. The unit half packs each pinned raw root into a ZAR and drives the two readers from
 * it, then checks what the notes say of the 34; the data half re-derives the pin from the disc (all 34) or the
 * fixtures (MP2, MP6, MP72). `S2U_GOLDEN_WRITE=1` with the disc present rewrites the pin.
 */

interface RawRoot {
  MetersPerUnit: number | null;
  ShadowVector: number[] | null;
  NightMission: number | null;
  DefaultMaterial: string | null;
  /** The 28 stored floats: dir[3], col[3], ambient, each a CPnt4D (`zNode/znode.h:66`). */
  GlobalLighting: number[] | null;
  /** `tag_GRID_PARAMS`: i32 atoms, i32 posts, f32 cell dimension, i32 cells x, i32 cells z. */
  grid_params: number[] | null;
  /** Each band: model name, node name, du, dv (`CScrollingTexture_band`, 520 bytes). */
  TextureScroll: [string, string, number, number][] | null;
  /** Each entry: its key, its 15 `dat` words as u32, its `tex_name` or null. */
  Material_Palette: [string, number[], string | null][];
}
/** `decoded`: the sha256 of what `parseWorldRoot` and `parseMaterialPalette` give, as JSON (-0 written as 0). */
interface RootPin { stem: string; raw: RawRoot; decoded: string }
interface Decoded { world: WorldRoot; palette: EnvMaterial[] }
interface Golden { _source: string; roots: RootPin[] }

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(HERE, 'golden/world-roots.json');
const GOLDEN = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE_DISC = !!DISC && existsSync(resolve(RUN, 'MP2.ZDB'));
const FIXTURES = ['MP2', 'MP6', 'MP72'].map((stem) => [stem, fixture(`RUN/${stem}.ZDB`)] as const);
const HAVE_FIXTURES = FIXTURES.every(([, b]) => b !== null);

const text = (s: string, n?: number): Uint8Array => {
  const out = new Uint8Array(n ?? s.length + 1);
  for (let i = 0; i < s.length && i < out.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
const i32 = (...v: number[]): Uint8Array => u32(...v.map((x) => x >>> 0));

/** The pinned raw root as a v2 ZAR, each key laid out as `CSaveLoad::Load` fetches it (research 72 section 2). */
function rootZar(raw: RawRoot): Zar {
  const keys: KeySpec[] = [];
  if (raw.DefaultMaterial !== null) keys.push({ name: 'DefaultMaterial', data: text(raw.DefaultMaterial) });
  if (raw.MetersPerUnit !== null) keys.push({ name: 'MetersPerUnit', data: f32(raw.MetersPerUnit) });
  if (raw.ShadowVector) keys.push({ name: 'ShadowVector', data: f32(...raw.ShadowVector) });
  if (raw.GlobalLighting) keys.push({ name: 'GlobalLighting', data: f32(...raw.GlobalLighting) });
  if (raw.NightMission !== null) keys.push({ name: 'NightMission', data: u32(raw.NightMission) });
  if (raw.grid_params) {
    const [atoms, posts, dim, cx, cz] = raw.grid_params as [number, number, number, number, number];
    keys.push({ name: 'grid_params', data: cat(i32(atoms, posts), f32(dim), i32(cx, cz)) });
  }
  keys.push({
    name: 'Material_Palette',
    children: raw.Material_Palette.map(([name, dat, tex]) => ({
      name, children: [{ name: 'dat', data: u32(...dat) }, ...(tex === null ? [] : [{ name: 'tex_name', data: text(tex) }])],
    })),
  });
  if (raw.TextureScroll) {
    keys.push({ name: 'TextureScroll_Object', data: cat(...raw.TextureScroll.map(([m, n, du, dv]) => cat(text(m, 256), text(n, 256), f32(du, dv)))) });
  }
  return Zar.parse(buildZar(keys));
}

function rawRoot(zar: Zar): RawRoot {
  const bytes = (name: string): Uint8Array | null => { const k = zar.find(name); return k ? zar.data(k) : null; };
  const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const floats = (b: Uint8Array | null): number[] | null => b && Array.from({ length: b.byteLength >> 2 }, (_, i) => dv(b).getFloat32(4 * i, true));
  const cstr = (b: Uint8Array, at = 0, max = b.byteLength - at): string => {
    let end = at; while (end < at + max && b[end] !== 0) end++;
    return String.fromCharCode(...b.subarray(at, end));
  };
  const grid = bytes('grid_params'), night = bytes('NightMission'), material = bytes('DefaultMaterial'), scroll = bytes('TextureScroll_Object');
  const mpu = floats(bytes('MetersPerUnit'));
  return {
    MetersPerUnit: mpu ? mpu[0]! : null,
    ShadowVector: floats(bytes('ShadowVector')),
    NightMission: night ? dv(night).getUint32(0, true) : null,
    DefaultMaterial: material ? cstr(material) : null,
    GlobalLighting: floats(bytes('GlobalLighting')),
    grid_params: grid ? [dv(grid).getInt32(0, true), dv(grid).getInt32(4, true), dv(grid).getFloat32(8, true), dv(grid).getInt32(12, true), dv(grid).getInt32(16, true)] : null,
    TextureScroll: scroll ? Array.from({ length: Math.floor(scroll.byteLength / 520) }, (_, i): [string, string, number, number] =>
      [cstr(scroll, 520 * i, 256), cstr(scroll, 520 * i + 256, 256), dv(scroll).getFloat32(520 * i + 512, true), dv(scroll).getFloat32(520 * i + 516, true)]) : null,
    Material_Palette: (zar.find('Material_Palette')?.children ?? []).map((e: ZarKey): [string, number[], string | null] => {
      const dat = zar.data(zar.child(e, 'dat')!), tex = zar.child(e, 'tex_name');
      return [e.name, Array.from({ length: dat.byteLength >> 2 }, (_, i) => dv(dat).getUint32(4 * i, true)), tex ? cstr(zar.data(tex)) : null];
    }),
  };
}

function decode(zar: Zar): Decoded { return { world: parseWorldRoot(zar), palette: parseMaterialPalette(zar) }; }
const digest = (d: Decoded): string => createHash('sha256').update(JSON.stringify(d)).digest('hex');

function rootPin(stem: string, zdb: Uint8Array): RootPin {
  const zar = Zar.parse(zdbMember(zdb, parseZdb(zdb), `\\${stem}.ZED`));
  return JSON.parse(JSON.stringify({ stem, raw: rawRoot(zar), decoded: digest(decode(zar)) })) as RootPin;
}

const archives = (): string[] => readdirSync(RUN).filter((n) => /^MP?\d+\.ZDB$/.test(n)).map((n) => n.slice(0, -4))
  .sort((a, b) => (a.startsWith('MP') === b.startsWith('MP') ? Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')) : a.startsWith('MP') ? -1 : 1));

function goldenText(v: unknown, indent = ''): string {
  const flat = JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (flat.length <= 200 || v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) return flat;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + goldenText(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${goldenText(x, inner)}`).join(',\n')}\n${indent}}`;
}

const root = (stem: string): RootPin => GOLDEN.roots.find((r) => r.stem === stem)!;
/** What the readers give for a pinned root, packed as a ZAR: the engine's reading, from the pin alone. */
const decoded = (stem: string): Decoded => decode(rootZar(root(stem).raw));
const mp = (): RootPin[] => GOLDEN.roots.filter((r) => r.stem.startsWith('MP'));

describe('the world roots against their pin (unit: no game data)', () => {
  it('parseWorldRoot and parseMaterialPalette read each of the 34 pinned roots, packed as a ZAR, to the pinned values', () => {
    expect(GOLDEN.roots).toHaveLength(34);
    for (const r of GOLDEN.roots) {
      const zar = rootZar(r.raw);
      expect(digest(decode(zar)), r.stem).toBe(r.decoded);
    }
  });

  it('MetersPerUnit is 0.1 on all 22 MP maps (research 72 section 2)', () => {
    expect(mp()).toHaveLength(22);
    for (const r of mp()) expect(r.raw.MetersPerUnit, r.stem).toBe(Math.fround(0.1));
  });

  it('every grid_params holds the 8,192-atom pool and 16 posts; Frostfire is 160 a cell, 8 x 9; the largest is M52, 35 x 35', () => {
    for (const r of GOLDEN.roots) {
      expect(r.raw.grid_params, r.stem).not.toBeNull();
      expect(r.raw.grid_params!.slice(0, 2), r.stem).toEqual([8192, 16]);
      expect(decoded(r.stem).world.grid, r.stem).toEqual({ atomCount: 8192, posts: 16, cellDim: r.raw.grid_params![2], cellsX: r.raw.grid_params![3],
        cellsZ: r.raw.grid_params![4], originX: 0, originZ: 0 });
    }
    expect(root('MP2').raw.grid_params).toEqual([8192, 16, 160, 8, 9]);
    // Research 93 section 2 (and GRID_CELLS_MAX's comment) say every disc map is at most 36 x 25 = 900 cells, the M51
    // grid of research 23 section 2.1. The disc says otherwise: M51 is 36 x 25, but M52 is 35 x 35 = 1,225 cells. The
    // largest MP grid is Foxhunt's 24 x 28 = 672. All sit far below the hardening ceiling, so nothing the reader does
    // changes; the note's bound is what is wrong (reported, not fixed here).
    const cells = GOLDEN.roots.map((r) => r.raw.grid_params![3]! * r.raw.grid_params![4]!);
    expect(root('M51').raw.grid_params!.slice(3)).toEqual([36, 25]);
    expect(root('M52').raw.grid_params!.slice(3)).toEqual([35, 35]);
    expect(Math.max(...cells)).toBe(1225);
    expect(Math.max(...mp().map((r) => r.raw.grid_params![3]! * r.raw.grid_params![4]!))).toBe(672);
    expect(Math.max(...cells)).toBeLessThan(GRID_CELLS_MAX);
    // buildGrid makes Frostfire's 72 cells from the pinned grid, named cell000000..cell000071, x fastest.
    const grid = buildGrid(decoded('MP2').world.grid, [], [], []);
    expect([grid.cells.length, grid.cells[8]!.x, grid.cells[8]!.z, grid.cells.at(-1)!.name]).toEqual([72, 0, 1, 'cell000071']);
  });

  it('all 34 roots carry GlobalLighting, 112 bytes; eleven store dir[2] and col[2] as zero and run on two lights', () => {
    for (const r of GOLDEN.roots) expect(r.raw.GlobalLighting, r.stem).toHaveLength(28);
    const twoLights = GOLDEN.roots.filter((r) => r.raw.GlobalLighting!.slice(8, 12).every((v) => v === 0) && r.raw.GlobalLighting!.slice(20, 24).every((v) => v === 0));
    expect(twoLights).toHaveLength(11);
    for (const r of twoLights) expect(decoded(r.stem).world.lighting!.directions[2], r.stem).toEqual([0, 0, 0]);
    // The directions the VU sees are the stored ones negated and normalised (`sub_0031EE00`); the colours are verbatim.
    const ff = root('MP2');
    const d0 = ff.raw.GlobalLighting!.slice(0, 3), len = Math.hypot(...d0);
    expect(decoded('MP2').world.lighting!.directions[0]!.map((v, i) => v + d0[i]! / len).every((v) => Math.abs(v) < 1e-12)).toBe(true);
    expect(decoded('MP2').world.lighting!.colours[0]).toEqual(ff.raw.GlobalLighting!.slice(12, 15));
  });

  it("Frostfire's root: METAL_THICK, day, shadow vector (-0.811, -0.2, 0.55), ocean_1..3 and skyhorizon scrolling", () => {
    const w = decoded('MP2').world;
    expect(w.defaultMaterial).toBe('METAL_THICK');
    expect(w.nightMission).toBe(false);
    expect(w.shadowVector.map((v) => Number(v.toFixed(3)))).toEqual([-0.811, -0.2, 0.55]);
    expect(w.textureScroll.map((b) => `${b.modelName} ${b.nodeName} ${b.du.toFixed(2)},${b.dv.toFixed(2)}`).sort()).toEqual([
      'alaska1a_sky ocean_1 -0.04,-0.04', 'alaska1a_sky ocean_2 0.04,0.04', 'alaska1a_sky ocean_3 0.00,0.02', 'alaska1a_sky skyhorizon 0.00,0.02',
    ]);
  });

  it("Material_Palette: Frostfire's two untextured entries draw specular_map.tif; Blood Lake's palEntry_3 reflects m19_skycap01.tif", () => {
    expect(decoded('MP2').palette.map((e) => [e.index, e.texture])).toEqual([[0, DEFAULT_ENV_TEXTURE], [1, DEFAULT_ENV_TEXTURE]]);
    expect(decoded('MP2').palette[1]!.rgba).toEqual([123, 123, 123, 10]);
    const water = decoded('MP10').palette.find((e) => e.index === 3)!;
    expect([water.rgba, water.rimOffset, water.texture]).toEqual([[80, 80, 80, 20], 130, 'm19_skycap01.tif']);
    // Every entry on the disc is kind 2 (FUN_003bb2c0; research 82 round 4): none is dropped by the reader.
    for (const r of GOLDEN.roots) expect(decoded(r.stem).palette, r.stem).toHaveLength(r.raw.Material_Palette.length);
  });
});

describe('the world roots re-derived from the data (fixture / disc)', () => {
  it.skipIf(!HAVE_FIXTURES)('re-derives the MP2, MP6 and MP72 roots from the fixtures', () => {
    for (const [stem, bytes] of FIXTURES) expect(rootPin(stem, bytes!), stem).toEqual(root(stem));
  });

  it.skipIf(!HAVE_DISC)('re-derives all 34 roots, 22 MP and 12 campaign, from SOCOM_DISC', () => {
    const roots = archives().map((s) => rootPin(s, new Uint8Array(readFileSync(resolve(RUN, `${s}.ZDB`)))));
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN_PATH, `${goldenText({
        _source: "SOCOM_DISC RUN/MP*.ZDB and RUN/M*.ZDB: each archive's own <stem>.ZED through Zar.parse, the keys read raw, parseWorldRoot and parseMaterialPalette (scene/src/worldRoot.ts). Pinned 2026-10-02.",
        roots,
      })}\n`);
    }
    expect(roots).toEqual(GOLDEN.roots);
  });
});
