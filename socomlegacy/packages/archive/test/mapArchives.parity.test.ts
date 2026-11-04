// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRdr, rdrGet } from '../src/rdr';
import { Zar } from '../src/zar';
import { parseZdb, zdbEntry, zdbTocLength, ZDB_HEAD, type ZdbEntry } from '../src/zdb';
import { fixture } from './fixtures';

/**
 * Parity pins for the map archives (TA.R3; the decoders registry, `docs/parity/registry/decoders.json`): what
 * research 72 sections 0-2 read off the disc, pinned in `golden/map-archives.json` so CI holds it with no game data.
 * The unit half drives `parseZdb` and `zdbEntry` from the pinned rows and checks the pin against the note's own
 * table; the data half re-derives the pin whole from the disc (`SOCOM_DISC`) or the extracted fixture.
 * `S2U_GOLDEN_WRITE=1` with the data present rewrites the pin from the disc (then the comparison runs again).
 */

interface ArchiveRow { stem: string; name: string; loading: string; bytes: number; members: number; scripts: number; sha256: string }
interface Golden {
  _source: string;
  archives: ArchiveRow[];
  frostfire: { toc: [string, number, number][]; scripts: [string, number][] };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(HERE, 'golden/map-archives.json');
const GOLDEN = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;

const DISC = process.env.SOCOM_DISC;
const RUN = DISC ? resolve(DISC, 'RUN') : '';
const HAVE_DISC = !!DISC && existsSync(resolve(RUN, 'MP2.ZDB'));
const MP2 = fixture('RUN/MP2.ZDB');

/** Research 72 section 0, the table as the note prints it: ZDB, name, loading assets, bytes. */
const NOTE_72_S0: [string, string, string, number][] = [
  ['MP1', 'BLIZZARD', 'ui/assetlib/ld/om01', 9_084_928], ['MP2', 'FROSTFIRE', 'ui/assetlib/ld/om02', 7_985_152],
  ['MP5', 'ABANDONED', 'ui/assetlib/ld/om05', 9_535_488], ['MP6', 'DESERT GLORY', 'ui/assetlib/ld/om06', 10_852_352],
  ['MP7', 'NIGHT STALKER', 'ui/assetlib/ld/om07', 9_512_960], ['MP8', "RAT'S NEST", 'ui/assetlib/ld/om08', 11_732_992],
  ['MP9', 'BITTER JUNGLE', 'ui/assetlib/ld/om09', 11_038_720], ['MP10', 'BLOOD LAKE', 'ui/assetlib/ld/om10', 10_676_224],
  ['MP11', 'DEATH TRAP', 'ui/assetlib/ld/om11', 9_822_208], ['MP12', 'THE RUINS', 'ui/assetlib/ld/om12', 9_826_304],
  ['MP51', 'VIGILANCE', 'ui/assetlib/ld/lp51', 10_074_112], ['MP52', 'THE MIXER', 'ui/assetlib/ld/lp52', 12_677_120],
  ['MP53', 'FOXHUNT', 'ui/assetlib/ld/lp53', 11_794_432], ['MP61', 'SUJO', 'ui/assetlib/ld/lp61', 10_735_616],
  ['MP62', 'ENOWAPI', 'ui/assetlib/ld/lp62', 10_362_880], ['MP64', 'SHADOW FALLS', 'ui/assetlib/ld/lp64', 10_391_552],
  ['MP71', 'FISH HOOK', 'ui/assetlib/ld/lp71', 11_046_912], ['MP72', 'CROSSROADS', 'ui/assetlib/ld/lp72', 11_612_160],
  ['MP73', 'SANDSTORM', 'ui/assetlib/ld/lp73', 12_093_440], ['MP81', 'CHAIN REACTION', 'ui/assetlib/ld/lp81', 9_381_888],
  ['MP82', 'GUIDANCE', 'ui/assetlib/ld/lp82', 12_201_984], ['MP83', 'REQUIEM', 'ui/assetlib/ld/lp83', 12_156_928],
];

/** Builds the bytes of a ZDB's table of contents from rows, as research 72 section 1 lays it out. */
function tocBytes(rows: readonly [string, number, number][]): Uint8Array {
  const out = new Uint8Array(0xa0 + 0x5c * rows.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0x98, rows.length, true);       // u32 count at 0x98
  dv.setUint32(0x9c, 0x5c, true);              // entrySize = 0x5C at 0x9C
  rows.forEach(([name, offset, size], i) => {
    const o = 0xa0 + 0x5c * i;                 // 92-byte entries from 0xA0
    dv.setUint32(o, 0x5c, true);
    for (let k = 0; k < name.length; k++) out[o + 4 + k] = name.charCodeAt(k);   // char name[64]
    dv.setUint32(o + 68, offset, true);
    dv.setUint32(o + 72, size, true);
  });
  return out;
}

const fileName = (path: string): string => path.slice(path.lastIndexOf('\\') + 1);

/** The pin's rows for one archive, re-derived through the repository's readers. */
function archiveRow(stem: string, bytes: Uint8Array): ArchiveRow {
  const toc = parseZdb(bytes);
  const reader = zdbEntry(toc, `${stem}\\READERM.ZAR`);
  const zar = Zar.parse(bytes.subarray(reader.offset, reader.offset + reader.size));
  const mission = parseRdr(zar.data(zar.child(zar.root, 'mission.rdr')!));
  return {
    stem, name: String(rdrGet(mission, 'description')), loading: String(rdrGet(mission, 'LoadingScreenAssets')),
    bytes: bytes.byteLength, members: toc.length, scripts: zar.root.children.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function frostfire(bytes: Uint8Array): Golden['frostfire'] {
  const toc = parseZdb(bytes);
  const reader = zdbEntry(toc, 'MP2\\READERM.ZAR');
  const zar = Zar.parse(bytes.subarray(reader.offset, reader.offset + reader.size));
  return {
    toc: toc.map((e) => [e.name, e.offset, e.size]),
    scripts: zar.root.children.map((k) => [k.name, k.size]),
  };
}

/** One row a line: a pin a reviewer can read and diff. */
function goldenText(v: unknown, indent = ''): string {
  const flat = JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (flat.length <= 200 || v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) return flat;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + goldenText(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${goldenText(x, inner)}`).join(',\n')}\n${indent}}`;
}

describe('the map archives against their pin (unit: no game data)', () => {
  it('pins the 22 MP archives of research 72 section 0: name, loading assets and size, MP3 and MP4 absent', () => {
    expect(GOLDEN.archives.map((a) => [a.stem, a.name, a.loading, a.bytes])).toEqual(NOTE_72_S0);
    expect(GOLDEN.archives.some((a) => a.stem === 'MP3' || a.stem === 'MP4')).toBe(false);
    for (const a of GOLDEN.archives) {
      expect(a.bytes % 2048, a.stem).toBe(0);
      expect(a.sha256, a.stem).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('pins the member counts research 72 section 1 gives: MP2 53, MP6 53, MP72 62, MP1 53, MP5 60', () => {
    const members = Object.fromEntries(GOLDEN.archives.map((a) => [a.stem, a.members]));
    expect([members.MP2, members.MP6, members.MP72, members.MP1, members.MP5]).toEqual([53, 53, 62, 53, 60]);
  });

  it("parseZdb reads Frostfire's table of contents rebuilt from the 53 pinned rows, 0xA0 + 53 x 0x5C bytes long", () => {
    const rows = GOLDEN.frostfire.toc;
    const toc = tocBytes(rows);
    expect(zdbTocLength(toc.subarray(0, ZDB_HEAD))).toBe(0xa0 + 53 * 0x5c);
    const parsed = parseZdb(toc, 7_985_152);
    expect(parsed.map((e) => [e.name, e.offset, e.size])).toEqual(rows);
    // The archive's real length is what bounds a member: one byte shorter and the last member runs past it.
    expect(() => parseZdb(toc, 7_985_152 - 2048 * 4)).toThrow(/runs past/);
  });

  it("zdbEntry finds each of Frostfire's members by its file name alone, but for the two DBUFFER.ZAR, which need their folder", () => {
    const entries: ZdbEntry[] = GOLDEN.frostfire.toc.map(([name, offset, size]) => ({ name, offset, size }));
    const twice = new Set(['DBUFFER.ZAR']);
    for (const e of entries) {
      const file = fileName(e.name);
      if (twice.has(file)) expect(() => zdbEntry(entries, file)).toThrow(/2 matches/);
      else expect(zdbEntry(entries, file.toLowerCase()), file).toBe(e);
    }
    expect(zdbEntry(entries, 'MP2\\DBUFFER.ZAR').name).toBe('RUN\\MP\\MP2\\DBUFFER.ZAR');
    expect(zdbEntry(entries, 'COMMON\\DBUFFER.ZAR').name).toBe('RUN\\COMMON\\DBUFFER.ZAR');
    // MP2.ZED, the world root, is not taken for a suffix of FLIB/CLIB names: research 72 section 2's MP2.ZED, 4,240 B.
    expect(zdbEntry(entries, 'MP2.ZED').size).toBe(4_240);
    expect(zdbEntry(entries, 'MP2_GEO.ZED').size).toBe(445_856);
    expect(zdbEntry(entries, 'WORL_MDL.ZED').size).toBe(490_800);
    expect(zdbEntry(entries, 'MP2_MDL.ZED').size).toBe(230_544);
    expect(zdbEntry(entries, 'AIMAPS.MPS').size).toBe(212_828);
  });

  it('every Frostfire member is 2048-aligned, in file order, and inside the 7,985,152-byte archive', () => {
    let end = 0xa0 + 53 * 0x5c;
    for (const [name, offset, size] of GOLDEN.frostfire.toc) {
      expect(offset % 2048, name).toBe(0);
      expect(offset, name).toBeGreaterThanOrEqual(end);
      end = offset + size;
    }
    expect(end).toBeLessThanOrEqual(7_985_152);
  });

  it("Frostfire's READERM.ZAR holds the twelve compiled scripts research 72 section 2 lists; the 22 maps hold 11 to 16", () => {
    expect(GOLDEN.frostfire.scripts.map(([n]) => n).sort()).toEqual([
      'actions.rdr', 'aimaps.rdr', 'chartype.rdr', 'dyntex.rdr', 'layers.rdr', 'lod.rdr', 'mission.rdr', 'mp2.rdr',
      'mp2_lib.rdr', 'sndjukeboxm.rdr', 'valves.rdr', 'vehicles.rdr',
    ]);
    // Research 72 section 2 says "13 or 14" keys but lists Frostfire's twelve: the pin is the disc's count.
    expect(GOLDEN.archives.find((a) => a.stem === 'MP2')!.scripts).toBe(12);
    expect([Math.min(...GOLDEN.archives.map((a) => a.scripts)), Math.max(...GOLDEN.archives.map((a) => a.scripts))]).toEqual([11, 16]);
  });
});

describe('the map archives re-derived from the data (fixture / disc)', () => {
  it.skipIf(!HAVE_DISC)('re-derives the 22 archive rows from SOCOM_DISC through parseZdb, Zar and parseRdr', () => {
    const stems = readdirSync(RUN).filter((n) => /^MP\d+\.ZDB$/.test(n)).map((n) => n.slice(0, -4))
      .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const archives = stems.map((s) => archiveRow(s, new Uint8Array(readFileSync(resolve(RUN, `${s}.ZDB`)))));
    if (process.env.S2U_GOLDEN_WRITE === '1') {
      const next: Golden = {
        _source: 'SOCOM_DISC RUN/MP*.ZDB: parseZdb (archive/src/zdb.ts), Zar.parse (zar.ts), parseRdr + rdrGet of READERM.ZAR/mission.rdr (rdr.ts); sha256 of each whole archive. Pinned 2026-10-02.',
        archives, frostfire: frostfire(new Uint8Array(readFileSync(resolve(RUN, 'MP2.ZDB')))),
      };
      writeFileSync(GOLDEN_PATH, `${goldenText(next)}\n`);
    }
    expect(archives).toEqual(GOLDEN.archives);
  }, 30_000);                                             // reads all 22 map archives: 1 s alone, over the 5 s default beside the whole suite

  it.skipIf(!MP2)("re-derives Frostfire's table of contents and script list from the fixture MP2.ZDB", () => {
    expect(frostfire(MP2!)).toEqual(GOLDEN.frostfire);
    expect(archiveRow('MP2', MP2!)).toEqual(GOLDEN.archives.find((a) => a.stem === 'MP2'));
  });
});
