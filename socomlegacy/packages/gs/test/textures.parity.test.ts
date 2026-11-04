// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { parsePaletteRecord, parseTextureRecord, PSM, type GsState, type Tex0 } from '../src';
import { fixture } from '../../archive/test/fixtures';

/**
 * Parity pins for the texture and palette records (TA.R3; research 72 section 5): what `parseTextureRecord` and
 * `parsePaletteRecord` read off Frostfire's `MP2_TXR.ZED` / `MP2_PAL.ZED`, and the section 5 table over all 22 maps,
 * pinned in `golden/map-textures.json`. The unit half rebuilds every Frostfire record from its pinned fields by the
 * documented layout (`TEXTURE_PARAMS`, the 16-byte prefix, the pixels, a bind packet holding its TEX0) and reads it
 * back; the data half re-derives the pin from the fixture (Frostfire) and the disc (the 22-map table).
 * `S2U_GOLDEN_WRITE=1` with both present rewrites the pin.
 */

interface TexturePin {
  name: string;
  /** `TEXTURE_PARAMS` as stored: u16 w, u16 h, u32 size, u32 gsaddr, u32 packed flags. */
  header: [number, number, number, number, number];
  tex0: Tex0 | null;
  gs: GsState | null;
}
interface MapRow {
  stem: string; textures: number; bpp: Record<string, number>; palettes: number; ids: [number, number];
  ct16: number; ct32: number; texdatBytes: number; prefixed: number;
}
interface Golden {
  _source: string;
  frostfire: { textures: TexturePin[]; palettes: [string, number, number, number][] };
  maps: MapRow[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(HERE, 'golden/map-textures.json');
const GOLDEN = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE_DISC = !!DISC && existsSync(resolve(RUN, 'MP2.ZDB'));
const MP2 = fixture('RUN/MP2.ZDB');

/** Research 72 section 5: the 16 bytes between `TEXTURE_PARAMS` and the texels, the same in every texture. */
const PREFIX = [0x08, 0, 0, 0, 0, 0, 0, 0, 0xaf, 0xaf, 0xaf, 0xaf, 0xaf, 0xaf, 0xaf, 0xaf];

/** TEX0 by the bit layout research 72 section 5 / the GS manual give: TBP0 0-13 ... CLD 61-63. */
function encodeTex0(t: Tex0): bigint {
  const f = (v: number, lo: number): bigint => BigInt(v) << BigInt(lo);
  return f(t.tbp0, 0) | f(t.tbw, 14) | f(t.psm, 20) | f(t.tw, 26) | f(t.th, 30) | f(t.tcc, 34) | f(t.tfx, 35)
    | f(t.cbp, 37) | f(t.cpsm, 51) | f(t.csm, 55) | f(t.csa, 56) | f(t.cld, 61);
}

/** A `texdat` key by the documented layout, its pixels zero, its 9-quadword bind packet holding only `tex0`. */
function texdat(header: TexturePin['header'], tex0: Tex0 | null): Uint8Array {
  const [w, h, size, gsaddr, flags] = header;
  const out = new Uint8Array(16 + 16 + size + 9 * 16);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, w, true); dv.setUint16(2, h, true);
  dv.setUint32(4, size, true); dv.setUint32(8, gsaddr, true); dv.setUint32(12, flags, true);
  out.set(PREFIX, 16);
  // A VU1-parameter lookalike first (`0x...0001` reads as PSMCT32 at TBP0 1), then the record's own word.
  dv.setBigUint64(32 + size, 1n, true);
  if (tex0) dv.setBigUint64(32 + size + 8, encodeTex0(tex0), true);
  return out;
}

function frostfire(zdb: Uint8Array): Golden['frostfire'] {
  const toc = parseZdb(zdb);
  const txr = Zar.parse(zdbMember(zdb, toc, 'MP2_TXR.ZED'));
  const pal = Zar.parse(zdbMember(zdb, toc, 'MP2_PAL.ZED'));
  const textures = txr.find('textures')!.children.map((k): TexturePin => {
    const bytes = txr.data(txr.child(k, 'texdat')!);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, 16);
    const rec = parseTextureRecord(k.name, bytes);
    return {
      name: k.name,
      header: [dv.getUint16(0, true), dv.getUint16(2, true), dv.getUint32(4, true), dv.getUint32(8, true), dv.getUint32(12, true)],
      tex0: rec.tex0, gs: rec.gs,
    };
  });
  const palettes = pal.find('palettes')!.children.map((k): [string, number, number, number] => {
    const par = pal.data(pal.child(k, 'par')!);
    const dv = new DataView(par.buffer, par.byteOffset, 8);
    return [k.name, dv.getUint32(0, true), dv.getUint32(4, true), pal.child(k, 'buf')!.size];
  });
  return { textures, palettes };
}

function mapRow(stem: string, zdb: Uint8Array): MapRow {
  const toc = parseZdb(zdb);
  const txr = Zar.parse(zdbMember(zdb, toc, `${stem}_TXR.ZED`));
  const pal = Zar.parse(zdbMember(zdb, toc, `${stem}_PAL.ZED`));
  const bpp: Record<string, number> = {};
  let texdatBytes = 0, prefixed = 0;
  const keys = txr.find('textures')!.children;
  for (const k of keys) {
    const bytes = txr.data(txr.child(k, 'texdat')!);
    const rec = parseTextureRecord(k.name, bytes);
    bpp[rec.bpp] = (bpp[rec.bpp] ?? 0) + 1;
    texdatBytes += bytes.byteLength;
    if (PREFIX.every((b, i) => bytes[16 + i] === b)) prefixed++;
  }
  const pals = pal.find('palettes')!.children.map((k) => parsePaletteRecord(pal.data(pal.child(k, 'par')!), pal.data(pal.child(k, 'buf')!)));
  const ids = pals.map((p) => p.gsaddr);
  return {
    stem, textures: keys.length, bpp, palettes: pals.length, ids: [Math.min(...ids), Math.max(...ids)],
    ct16: pals.filter((p) => p.format === 2).length, ct32: pals.filter((p) => p.format === 0).length, texdatBytes, prefixed,
  };
}

function goldenText(v: unknown, indent = ''): string {
  const flat = JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (flat.length <= 200 || v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) return flat;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + goldenText(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${goldenText(x, inner)}`).join(',\n')}\n${indent}}`;
}

const pin = (name: string): TexturePin => GOLDEN.frostfire.textures.find((t) => t.name === name)!;

describe('the texture records against their pin (unit: no game data)', () => {
  it("pins research 72 section 5's table: textures, bpp mix, palettes and their ids, CT16 / CT32, for the five maps it lists", () => {
    const row = (stem: string) => {
      const m = GOLDEN.maps.find((r) => r.stem === stem)!;
      return [m.textures, m.bpp, m.palettes, m.ids, m.ct16, m.ct32];
    };
    expect(row('MP2')).toEqual([65, { 8: 53, 16: 5, 32: 7 }, 53, [94, 318], 48, 5]);
    expect(row('MP6')).toEqual([69, { 8: 65, 32: 4 }, 65, [94, 330], 56, 9]);
    expect(row('MP72')).toEqual([106, { 8: 106 }, 105, [103, 383], 78, 27]);
    expect(row('MP1')).toEqual([90, { 8: 83, 16: 2, 32: 5 }, 81, [94, 346], 68, 13]);
    expect(row('MP5')).toEqual([45, { 8: 37, 16: 2, 32: 6 }, 38, [98, 307], 22, 16]);
    expect(Math.round(GOLDEN.maps.find((r) => r.stem === 'MP2')!.texdatBytes / 1024)).toBe(651);
    expect(GOLDEN.maps).toHaveLength(22);
  });

  it('every texture of the 22 maps carries the same 16-byte quadword before its texels (research 72 section 5)', () => {
    for (const m of GOLDEN.maps) expect(m.prefixed, m.stem).toBe(m.textures);
    expect(GOLDEN.maps.reduce((n, m) => n + (m.bpp[32] ?? 0), 0)).toBe(83);   // the 83 direct 32bpp textures
  });

  it("reads a_floor.tif's header as research 72 section 5 prints it, 00400040 00001000 00000001 12000608, texels from byte 32", () => {
    const head = new Uint8Array(16);
    new DataView(head.buffer).setUint32(0, 0x00400040, true);
    new DataView(head.buffer).setUint32(4, 0x00001000, true);
    new DataView(head.buffer).setUint32(8, 0x00000001, true);
    new DataView(head.buffer).setUint32(12, 0x12000608, true);
    const bytes = new Uint8Array(32 + 4096 + 144);
    bytes.set(head, 0); bytes.set(PREFIX, 16);
    bytes[32] = 0x5a; bytes[32 + 4095] = 0xa5;
    new DataView(bytes.buffer).setBigUint64(32 + 4096, 0x201026e599304001n, true);
    const rec = parseTextureRecord('a_floor.tif', bytes);
    expect(rec).toMatchObject({ width: 64, height: 64, size: 4096, gsaddr: 1, bpp: 8, selectQwc: 6, palettized: true, bilinear: true,
      transparent: false, isMipChild: false });
    expect([rec.pixels.byteLength, rec.pixels[0], rec.pixels[4095]]).toEqual([4096, 0x5a, 0xa5]);
    expect(rec.tex0).toMatchObject({ tbp0: 1, psm: PSM.T8, tw: 6, th: 6, tbw: 1, cbp: 311, cpsm: 2 });
    // The pinned a_floor.tif is this record.
    expect(pin('a_floor.tif').header).toEqual([64, 64, 4096, 1, 0x12000608]);
  });

  it('parseTextureRecord reads every pinned Frostfire header and TEX0 back from a record built by the documented layout', () => {
    expect(GOLDEN.frostfire.textures).toHaveLength(65);
    for (const t of GOLDEN.frostfire.textures) {
      const rec = parseTextureRecord(t.name, texdat(t.header, t.tex0));
      const [w, h, size, gsaddr, flags] = t.header;
      expect([rec.width, rec.height, rec.size, rec.gsaddr], t.name).toEqual([w, h, size, gsaddr]);
      expect([rec.bpp, rec.selectQwc, rec.palOffset], t.name).toEqual([flags & 0xff, (flags >>> 8) & 0xff, (flags >>> 16) & 0xff]);
      expect([rec.transparent, rec.palettized, rec.isMipChild, rec.bumpmap, rec.bilinear, rec.transp1bit, rec.dynamic, rec.context], t.name)
        .toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((b) => ((flags >>> (24 + b)) & 1) === 1));
      expect(rec.tex0, t.name).toEqual(t.tex0);
      expect(rec.pixels.byteLength, t.name).toBe(size);
    }
  });

  it('size is w x h x bpp / 8 on every Frostfire texture, each side a power of two from 16 to 256, and each carries a TEX0', () => {
    for (const { name, header: [w, h, size, , flags], tex0 } of GOLDEN.frostfire.textures) {
      expect(size, name).toBe((w * h * (flags & 0xff)) / 8);
      for (const side of [w, h]) expect([16, 32, 64, 128, 256], name).toContain(side);
      expect(tex0, name).not.toBeNull();
      expect([1 << tex0!.tw, 1 << tex0!.th], name).toEqual([w, h]);
    }
  });

  it('every palettised texture cites a pinned palette by TEX0.CBP: a_dumpster.tif 106, crane1.tif 97, a_steel20.tif 98', () => {
    const ids = new Set(GOLDEN.frostfire.palettes.map(([, gsaddr]) => gsaddr));
    const cited = GOLDEN.frostfire.textures.filter((t) => ((t.header[4] >>> 25) & 1) === 1);
    expect(cited).toHaveLength(53);
    for (const t of cited) expect(ids.has(t.tex0!.cbp), t.name).toBe(true);
    expect(['a_dumpster.tif', 'crane1.tif', 'a_steel20.tif'].map((n) => pin(n).tex0!.cbp)).toEqual([106, 97, 98]);
  });

  it('parsePaletteRecord reads each pinned PALETTE_PARAMS: gsaddr = the key, CT16 a 512-byte buf, CT32 a 1,024-byte one', () => {
    expect(GOLDEN.frostfire.palettes).toHaveLength(53);
    for (const [key, gsaddr, packed, bufBytes] of GOLDEN.frostfire.palettes) {
      const par = new Uint8Array(8);
      new DataView(par.buffer).setUint32(0, gsaddr, true);
      new DataView(par.buffer).setUint32(4, packed, true);
      const rec = parsePaletteRecord(par, new Uint8Array(bufBytes));
      expect(key).toBe(`texpal_${rec.gsaddr}`);
      expect(rec.size, key).toBe(bufBytes);
      expect(bufBytes, key).toBe(rec.format === 2 ? 512 : 1024);
      expect([0, 2], key).toContain(rec.format);
    }
  });

  it('the bind packets: lightrays.tif blends source alpha, untested, bilinear, repeat; only one-bit textures alpha-test', () => {
    expect(pin('lightrays.tif').gs).toEqual({
      blend: 'source', alphaTest: null, depthTest: true, bilinear: true, mipmaps: false, levels: 0, lodK: 0, lodL: 0, wrapS: 'repeat', wrapT: 'repeat',
    });
    const tested = GOLDEN.frostfire.textures.filter((t) => t.gs!.alphaTest !== null);
    expect(tested.length).toBeGreaterThan(0);
    for (const t of tested) expect((t.header[4] >>> 29) & 1, t.name).toBe(1);   // m_transp_1bit
    for (const t of tested) expect(t.gs!.alphaTest, t.name).toBe(0.5);           // GREATER 64 of the 128 unity
  });
});

describe('the texture records re-derived from the data (fixture / disc)', () => {
  it.skipIf(!MP2)("re-derives Frostfire's 65 texture and 53 palette pins from the fixture through parseTextureRecord / parsePaletteRecord", () => {
    expect(JSON.parse(JSON.stringify(frostfire(MP2!)))).toEqual(GOLDEN.frostfire);
  });

  it.skipIf(!HAVE_DISC)("re-derives research 72 section 5's table for all 22 maps from SOCOM_DISC", () => {
    const stems = readdirSync(RUN).filter((n) => /^MP\d+\.ZDB$/.test(n)).map((n) => n.slice(0, -4))
      .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const maps = stems.map((s) => mapRow(s, new Uint8Array(readFileSync(resolve(RUN, `${s}.ZDB`)))));
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      const ff = frostfire(new Uint8Array(readFileSync(resolve(RUN, 'MP2.ZDB'))));
      writeFileSync(GOLDEN_PATH, `${goldenText(JSON.parse(JSON.stringify({
        _source: "SOCOM_DISC RUN/MP*.ZDB: each map's own <stem>_TXR.ZED / <stem>_PAL.ZED through Zar.parse, parseTextureRecord (gs/src/texture.ts) and parsePaletteRecord (palette.ts); header and PALETTE_PARAMS words as stored. Pinned 2026-10-02.",
        frostfire: ff, maps,
      })))}\n`);
    }
    expect(maps).toEqual(GOLDEN.maps);
  });
});
