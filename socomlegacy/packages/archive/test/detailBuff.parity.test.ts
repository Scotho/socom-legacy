// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseRdr } from '../src/rdr';
import { readTexManifest } from '../src/texManifest';
import { parseZdb, zdbMember } from '../src/zdb';
import { Zar, type ZarKey } from '../src/zar';
import { Reader } from '../src/bytes';
import { fixture, FIXTURES_ABSENT } from './fixtures';

/**
 * Frostfire's `detail_buff` records (web research 72; the decoders registry's `decoders.archive.texmanifest.detail-buff`),
 * pinned in `golden/mp2-detail-buff.json` (TA.R3): each record of `RUN/MP2.ZDB`'s `MP2_GEO.ZED` -- 28 bytes, the range
 * at +0, the ALPHA_1 selector byte at +20, the scale at +24 (`texManifest.test.ts`, SEMANTICS 11.6) -- by its key path,
 * with its 28 bytes in hex and `mp2_lib.rdr`'s `floor_oilgrime.tif` detail record (`flooroil_detail.tif`) beside them. The unit half holds the
 * pin's count and values with no game data; the fixture half re-derives it. `S2U_GOLDEN_WRITE=1` with the fixture
 * present rewrites the pin from it.
 */

interface Row { path: string; range: number; alpha: number; scale: number; hex: string }
interface Golden { _source: string; oilgrime: { name: string; uv: number; range: number; bmode: string }; records: Row[] }

const GOLDEN_URL = new URL('./golden/mp2-detail-buff.json', import.meta.url);
const GOLDEN = JSON.parse(readFileSync(GOLDEN_URL, 'utf8')) as Golden;
const MP2 = fixture('RUN/MP2.ZDB');

function goldenText(g: Golden): string {
  return `{\n "_source": ${JSON.stringify(g._source)},\n "oilgrime": ${JSON.stringify(g.oilgrime)},\n "records": [\n${g.records.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}\n ]\n}\n`;
}

/** Every `detail_buff` key of the archive, depth first, with its key path. */
function detailBuffs(zar: Zar): { key: ZarKey; path: string }[] {
  const out: { key: ZarKey; path: string }[] = [];
  const walk = (k: ZarKey, path: string): void => {
    for (const c of k.children) {
      const p = path ? `${path}/${c.name}` : c.name;
      if (c.name === 'detail_buff') out.push({ key: c, path: p });
      walk(c, p);
    }
  };
  walk(zar.root, '');
  return out;
}

describe("Frostfire's detail_buff records against their pin (unit: no game data)", () => {
  it("pins 61 records of 28 bytes, each floor_oilgrime's: range 250000, ALPHA 0x48, scale 8 -- the manifest's uv, not 4.0", () => {
    expect(GOLDEN.oilgrime).toEqual({ name: 'flooroil_detail.tif', uv: 8, range: 250000, bmode: 'ADDITIVE' });
    expect(GOLDEN.records.length).toBe(61);
    expect(new Set(GOLDEN.records.map((r) => r.path)).size).toBe(61);
    for (const r of GOLDEN.records) {
      expect([r.range, r.alpha, r.scale], r.path).toEqual([250000, 0x48, 8]);
      expect(r.hex, r.path).toMatch(/^[0-9a-f]{56}$/);
      const b = Uint8Array.from(r.hex.match(/../g)!.map((h) => parseInt(h, 16)));
      const dv = new DataView(b.buffer);
      expect([dv.getFloat32(0, true), b[20], dv.getFloat32(24, true)], r.path).toEqual([r.range, r.alpha, r.scale]);
    }
  });
});

describe(`Frostfire's detail_buff records re-derived from the data (fixture)${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)("MP2_GEO.ZED's detail_buff records and mp2_lib.rdr's floor_oilgrime detail read as the pin holds them", () => {
    const toc = parseZdb(MP2!);
    const readerm = Zar.parse(zdbMember(MP2!, toc, 'READERM.ZAR'));
    const oil = readTexManifest(parseRdr(readerm.data(readerm.find('mp2_lib.rdr')!))).get('floor_oilgrime.tif')!.detail!;
    const geo = Zar.parse(zdbMember(MP2!, toc, 'MP2_GEO.ZED'));
    const records: Row[] = detailBuffs(geo).map(({ key, path }) => {
      const bytes = geo.data(key), r = new Reader(bytes);
      return { path, range: r.f32(0), alpha: r.u8(20), scale: r.f32(24), hex: Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('') };
    });
    const oilgrime = { name: oil.name, uv: oil.uv, range: oil.range, bmode: oil.bmode };
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      writeFileSync(GOLDEN_URL, goldenText({
        _source: 'disc RUN/MP2.ZDB: MP2_GEO.ZED every detail_buff key (Zar.parse, Reader: f32 +0, u8 +20, f32 +24, the 28 bytes in hex) and READERM.ZAR mp2_lib.rdr floor_oilgrime.tif detail (parseRdr, readTexManifest); decoded from the MP2 test fixture 2026-10-10',
        oilgrime, records,
      }));
    }
    expect(oilgrime).toEqual(GOLDEN.oilgrime);
    expect(records).toEqual(GOLDEN.records);
  });
});
