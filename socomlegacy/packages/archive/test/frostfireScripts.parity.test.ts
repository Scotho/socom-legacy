// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRdr, rdrGet, type RdrNode } from '../src/rdr';
import { readTexManifest } from '../src/texManifest';
import { Zar } from '../src/zar';
import { parseZdb, zdbMember } from '../src/zdb';
import { fixture } from './fixtures';

/**
 * Parity pins for Frostfire's compiled scripts (TA.R3; research 72 sections 2 and 6, "Spawns"): the twelve `.rdr`
 * keys of `RUN/MP/MP2/READERM.ZAR`, each decoded by `parseRdr` and pinned whole in `golden/mp2-scripts.json`.
 * The unit half compiles every pinned tree back to bytes by the documented layout and reads it with `parseRdr`, then
 * drives `rdrGet` and `readTexManifest` -- the map name, the world parameters, the player start, the AI map list, the
 * texture manifest -- from the pin; the data half re-derives the twelve trees from the fixture's archive.
 * `S2U_GOLDEN_WRITE=1` with the fixture present rewrites the pin.
 */

interface Golden { _source: string; scripts: Record<string, RdrNode> }

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(HERE, 'golden/mp2-scripts.json');
const GOLDEN = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
const MP2 = fixture('RUN/MP2.ZDB');

/**
 * A compiled script by research 72 "Spawns": `{u32 version=1; u32 string_table_size; u32 node_array_offset}`, the
 * string table at 12, then 8-byte nodes `{u32 (type:8, isclone:1, packed:1, unused:6, length:16); u32 value}` --
 * type 1 an i32, 2 an f32, 3 a string (`value` a byte offset from 12), 4 a list (`value` the node-array byte offset
 * of its first child; the children lie together). A pinned token spelled as an integer is written as an i32, one
 * spelled as another decimal number as an f32, the rest (`" "` among them) as strings: `parseRdr` gives each back
 * in its source spelling.
 */
function compile(root: RdrNode): Uint8Array {
  const table: number[] = [];
  const strings = new Map<string, number>();
  const str = (s: string): number => {
    let at = strings.get(s);
    if (at === undefined) {
      at = table.length; strings.set(s, at);
      for (const c of s) table.push(c.charCodeAt(0) & 0xff);
      table.push(0);
    }
    return at;
  };
  const nodes: [number, number, number][] = [[0, 0, 0]];   // type, length, value word
  const f32Word = (v: number): number => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, v, true); return b.getUint32(0, true); };
  const place = (n: RdrNode, slot: number): void => {
    if (Array.isArray(n)) {
      const first = nodes.length;
      for (let k = 0; k < n.length; k++) nodes.push([0, 0, 0]);
      nodes[slot] = [4, n.length, first * 8];
      n.forEach((c, k) => place(c, first + k));
    } else if (/^-?\d+$/.test(n) && Number(n) >= -0x80000000 && Number(n) <= 0x7fffffff) nodes[slot] = [1, 0, Number(n) >>> 0];
    else if (/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(n)) nodes[slot] = [2, 0, f32Word(Number(n))];
    else nodes[slot] = [3, 0, str(n)];
  };
  place(root, 0);
  const nodesAt = 12 + table.length;
  const out = new Uint8Array(nodesAt + 8 * nodes.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 1, true); dv.setUint32(4, table.length, true); dv.setUint32(8, nodesAt, true);
  out.set(table, 12);
  nodes.forEach(([type, length, value], k) => {
    dv.setUint32(nodesAt + 8 * k, (type | (length << 16)) >>> 0, true);
    dv.setUint32(nodesAt + 8 * k + 4, value, true);
  });
  return out;
}

function scripts(zdb: Uint8Array): Record<string, RdrNode> {
  const zar = Zar.parse(zdbMember(zdb, parseZdb(zdb), 'READERM.ZAR'));
  return Object.fromEntries(zar.root.children.map((k) => [k.name, parseRdr(zar.data(k))]));
}

const tree = (name: string): RdrNode => GOLDEN.scripts[name]!;

function goldenText(v: unknown, indent = ''): string {
  const flat = JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (flat.length <= 200 || v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) return flat;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + goldenText(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${goldenText(x, inner)}`).join(',\n')}\n${indent}}`;
}

describe("Frostfire's compiled scripts against their pin (unit: no game data)", () => {
  it('parseRdr reads each of the twelve pinned trees back from bytes written by the documented layout', () => {
    expect(Object.keys(GOLDEN.scripts)).toHaveLength(12);
    for (const [name, root] of Object.entries(GOLDEN.scripts)) expect(parseRdr(compile(root)), name).toEqual(root);
    // f32 tokens keep their source spelling, as the uncompiled text had them (`f32Text`): not 0.10000000149011612.
    const mp2 = JSON.stringify(tree('mp2.rdr'));
    expect(mp2).toContain('"MetersPerUnit",["0.1"]');
    expect(mp2).toContain('"ShadowVector",["-0.8106","-0.2001","0.5504"]');
  });

  it('mission.rdr names the map FROSTFIRE, its loading screen ui/assetlib/ld/om02, elevation max 100 and min 142', () => {
    const m = tree('mission.rdr');
    expect(rdrGet(m, 'description')).toBe('FROSTFIRE');
    expect(rdrGet(m, 'LoadingScreenAssets')).toBe('ui/assetlib/ld/om02');
    expect(rdrGet(m, 'elevation')).toEqual(['max', ['100'], 'min', ['142']]);
  });

  it('mp2.rdr world_params: MetersPerUnit 0.1, DefaultMaterial METAL_THICK, NightMission 0, the NVG and starlight tints', () => {
    const params = rdrGet(tree('mp2.rdr'), 'world_params')!;
    expect(rdrGet(params, 'MetersPerUnit')).toBe('0.1');
    expect(rdrGet(params, 'DefaultMaterial')).toBe('METAL_THICK');
    expect(rdrGet(params, 'NightMission')).toBe('0');
    expect(rdrGet(params, 'LensFX_NVG_4D')).toEqual(['51', '229', '51', '61']);
    expect(rdrGet(params, 'LensFX_StarlightScope_4D')).toEqual(['76', '127', '242', '61']);
  });

  it('vehicles.rdr gives the player start as a named reference, playerstart 3, teams 1 and 2 -- not coordinates', () => {
    const v = tree('vehicles.rdr');
    expect(rdrGet(v, 'name')).toBe('player');
    expect(rdrGet(v, 'character')).toBe('mp2_seal1');
    expect(rdrGet(rdrGet(v, 'setup')!, 'playerstart')).toBe('3');
    expect(rdrGet(v, 'team')).toEqual(['1', '2']);
  });

  it('aimaps.rdr lists the three AI maps of AIMAPS.MPS in file order: aimap.map, Ramps.map, Tunnels.map', () => {
    const list = rdrGet(tree('aimaps.rdr'), 'map_list') as RdrNode[];
    expect(list.map((e) => rdrGet(e, 'filename'))).toEqual(['aimap.map', 'Ramps.map', 'Tunnels.map']);
  });

  it('readTexManifest over the pinned mp2_lib.rdr: 65 textures, two detail records, the oil grime at uv 8 and range 250000', () => {
    const manifest = readTexManifest(tree('mp2_lib.rdr'));
    expect(manifest.size).toBe(65);
    expect(manifest.get('floor_oilgrime.tif')).toMatchObject({
      dim2: { width: 256, height: 256, bpp: 8 }, typeU: 1, typeV: 1, pal: true,
      detail: { name: 'flooroil_detail.tif', uv: 8, range: 250000, bmode: 'ADDITIVE' },
    });
    expect(manifest.get('a_floor.tif')?.detail).toEqual({ name: 'a_floordetail.tif', uv: 8, range: 90000, bmode: 'ADDITIVE' });
    expect([...manifest.values()].filter((e) => e.detail).map((e) => e.name).sort()).toEqual(['a_floor.tif', 'floor_oilgrime.tif']);
    expect([...manifest.values()].filter((e) => e.pal)).toHaveLength(53);
  });
});

describe("Frostfire's compiled scripts re-derived from the data (fixture)", () => {
  it.skipIf(!MP2)("re-derives the twelve decoded trees from the fixture's READERM.ZAR through parseRdr", () => {
    const got = scripts(MP2!);
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN_PATH, `${goldenText({
        _source: 'test-fixtures RUN/MP2.ZDB (the disc file) -> RUN\\MP\\MP2\\READERM.ZAR: Zar.parse (archive/src/zar.ts), parseRdr of every key (rdr.ts). Pinned 2026-10-02.',
        scripts: got,
      })}\n`);
    }
    expect(got).toEqual(GOLDEN.scripts);
  });
});
