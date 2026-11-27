// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { lodBands, parseSceneGraph, type LodBand, type SceneNode } from '@s2u/scene';
import { loadMap, type LoadedMap } from '../src/loadMap';

/**
 * Research 439 (the bugs intake after v0.4.23, item 4: Blizzard's fog plug), on the disc: every visual's band is
 * `vparams` byte 5 into the world root's `LOD_Object` (`FUN_003c3570` D:L315511; `FUN_003374c0` D:L235459-235469;
 * `FUN_003bb6b0` D:L311135-311150), on every map -- not `READERM.ZAR/lod.rdr` by model name, a file the game never
 * reads and 26 of the 34 maps lack. The maps are no fixtures: this file reads `SOCOM_DISC` (else
 * `<SOCOM_PC_ROOT>/game/disc`) and SKIPS without it -- a skip is said, never a pass.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = [process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '', PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '']
  .find((d) => d !== '' && existsSync(join(d, 'RUN/MP1.ZDB'))) ?? '';
const SKIP = DISC ? '' : ' -- SKIPPED: SOCOM_DISC / SOCOM_PC_ROOT with RUN/MP1.ZDB absent (no fixtures)';

/** The census of research 439 s3: banded visuals per map in the scene graph's `models` tree. */
const BANDED: Record<string, number> = {
  M51: 13, M52: 17, M53: 9, M61: 7, M62: 19, M63: 16, M71: 0, M72: 0, M73: 0, M81: 36, M82: 46, M83: 59,
  MP1: 26, MP10: 16, MP11: 15, MP12: 0, MP2: 17, MP5: 2, MP51: 3, MP52: 0, MP53: 0, MP6: 48, MP61: 18, MP62: 7,
  MP64: 2, MP7: 19, MP71: 20, MP72: 3, MP73: 36, MP8: 1, MP81: 0, MP82: 4, MP83: 5, MP9: 22,
};

const bytesOf = (stem: string) => new Uint8Array(readFileSync(join(DISC, 'RUN', `${stem}.ZDB`)));

/** The table read raw, apart from the code under test: five squares per 32-byte record, rooted. */
function rawTable(bytes: Uint8Array, stem: string): LodBand[] {
  const toc = parseZdb(bytes);
  const zed = Zar.parse(zdbMember(bytes, toc, `${stem}.ZED`));
  const key = zed.find('LOD_Object');
  if (!key) return [];
  const b = zed.data(key);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: LodBand[] = [];
  for (let o = 0; o + 32 <= b.byteLength; o += 32) {
    const f = (k: number) => Math.sqrt(v.getFloat32(o + k * 4, true));
    out.push({ nearFade: [f(0), f(1)], farFade: [f(3), f(4)] });
  }
  return out;
}

/** Every visual's byte 5 as the scene graph reads it (`SceneNode.visualBands`), with its node's path; `all` keeps zeros. */
function bandsOf(bytes: Uint8Array, stem: string, all = false): { path: string; band: number }[] {
  const geo = Zar.parse(zdbMember(bytes, parseZdb(bytes), `${stem}_GEO.ZED`));
  const out: { path: string; band: number }[] = [];
  const walk = (n: SceneNode, path: string) => {
    const p = path ? `${path}/${n.name}` : n.name;
    const bands = (n as SceneNode & { visualBands?: number[] }).visualBands ?? [];
    for (const band of bands) if (all || band !== 0) out.push({ path: p, band });
    n.children.forEach((c) => walk(c, p));
  };
  parseSceneGraph(geo).forEach((n) => walk(n, ''));
  return out;
}

/** A placement path ends at `tail` after a step (`/`) or an instance's model (`=`): `.../woodpile1_2=woodpile1/lowwood`. */
const endsAt = (path: string, tail: string): boolean => path === tail || path.endsWith(`/${tail}`) || path.endsWith(`=${tail}`);
/** The parts of every prop entry one of whose placements is at a path ending `tail`. */
function partsAt(map: LoadedMap, tail: string) {
  return map.props.filter((q) => (q.paths ?? []).some((p) => endsAt(p, tail))).flatMap((q) => q.parts);
}
const bandOfPart = (part: object): LodBand | undefined => (part as { lod?: LodBand }).lod;

describe.skipIf(!DISC)(`research 439: a band on every visual, on the disc${SKIP}`, () => {
  it('reads byte 5 on every map: the census per map, every index inside its map\'s LOD_Object', () => {
    const stems = readdirSync(join(DISC, 'RUN')).filter((f) => /^M(P)?\d+\.ZDB$/i.test(f)).map((f) => f.replace(/\.ZDB$/i, '')).sort();
    const counts: Record<string, number> = {};
    for (const stem of stems) {
      const bytes = bytesOf(stem);
      const rows = bandsOf(bytes, stem);
      counts[stem] = rows.length;
      const table = rawTable(bytes, stem);
      for (const r of rows) expect(r.band, `${stem} ${r.path}`).toBeLessThanOrEqual(table.length);
    }
    expect(counts).toEqual(BANDED);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(486);
  });

  it('on the multiplayer maps with lod.rdr, where both name a band they agree; the file also names 13 MP73 visuals byte 5 leaves unbanded', () => {
    for (const stem of ['MP2', 'MP64', 'MP73']) {
      const bytes = bytesOf(stem);
      const toc = parseZdb(bytes);
      const readerm = Zar.parse(zdbMember(bytes, toc, 'READERM.ZAR'));
      const named = lodBands(parseRdr(readerm.data(readerm.root.children.find((k) => k.name.toLowerCase() === 'lod.rdr')!)) as RdrNode);
      const table = rawTable(bytes, stem);
      let covered = 0, unbanded = 0;
      for (const r of bandsOf(bytes, stem, true)) {
        const name = r.path.split('/').find((s) => named.has(s));
        if (!name) continue;
        // One way only (the fresh review's F2): a visual under a named model with byte 5 = 0 the game draws untested
        // (D:L235400-235401); the old name rule banded it, the port no longer does.
        if (r.band === 0) { unbanded++; continue; }
        covered++;
        const want = named.get(name)!, got = table[r.band - 1]!;
        for (const [g, w] of [[got.nearFade[0], want.nearFade[0]], [got.nearFade[1], want.nearFade[1]], [got.farFade[0], want.farFade[0]], [got.farFade[1], want.farFade[1]]]) {
          expect(g, `${stem} ${r.path}`).toBeCloseTo(w!, 3);
        }
      }
      expect(covered, stem).toBe({ MP2: 13, MP64: 0, MP73: 35 }[stem]);
      expect(unbanded, stem).toBe({ MP2: 0, MP64: 0, MP73: 13 }[stem]);
    }
  });

  it('Blizzard (MP1): the fog plug, the interior copy and the woodpile reach the loaded map with their bands', async () => {
    const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP1.ZDB');
    const plug = partsAt(map, 'shack_good/fogplug');
    expect(plug.length).toBeGreaterThan(0);
    for (const part of plug) expect(bandOfPart(part)).toEqual({ nearFade: [325, 450], farFade: [1000, 1001] });
    const inlod = partsAt(map, 'shack_good/inlod');
    expect(inlod.length).toBeGreaterThan(0);
    for (const part of inlod) expect(bandOfPart(part)).toEqual({ nearFade: [0, 0], farFade: [350, 450] });
    for (const [tail, band] of [['woodpile1/lowwood', { nearFade: [170, 170], farFade: [700, 700] }],
      ['woodpile1/highwood', { nearFade: [0, 0], farFade: [170, 170] }], ['woodpile1/addhilod', { nearFade: [0, 0], farFade: [145, 145] }]] as const) {
      const parts = partsAt(map, tail);
      expect(parts.length, tail).toBeGreaterThan(0);
      for (const part of parts) expect(bandOfPart(part), tail).toEqual(band);
    }
    // The shack's own walls carry no band: drawn at every range.
    const walls = map.props.filter((q) => (q.paths ?? []).some((p) => endsAt(p, 'shack_good'))).flatMap((q) => q.parts);
    expect(walls.length).toBeGreaterThan(0);
    for (const part of walls) expect(bandOfPart(part)).toBeUndefined();
  });

  it('Desert Glory (MP6): a banded world-model node is drawn apart with its band, and only its banded visual is banded', async () => {
    const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP6.ZDB');
    const wall = partsAt(map, 'worldmodel/building_wc2/topwall2');
    expect(wall.length).toBeGreaterThan(0);
    for (const part of wall) expect(bandOfPart(part)).toEqual({ nearFade: [0, 0], farFade: [790, 790] });
    // `shelf_outdoors`: three visuals, only vis2 banded (band 17: out 380).
    const shelf = partsAt(map, 'worldmodel/shelf_outdoors');
    expect(shelf.some((p) => bandOfPart(p) === undefined)).toBe(true);
    expect(shelf.filter((p) => bandOfPart(p) !== undefined).every((p) => {
      const b = bandOfPart(p)!;
      return b.nearFade[0] === 0 && b.farFade[0] === 380 && b.farFade[1] === 380;
    })).toBe(true);
    expect(shelf.some((p) => bandOfPart(p) !== undefined)).toBe(true);
  });

  it('Frostfire (MP2): the named copies keep their bands, and the four wire flares lod.rdr misses take theirs', async () => {
    const map = await loadMap(new FsAssetSource(DISC), 'RUN/MP2.ZDB');
    const low = map.props.filter((q) => q.modelName === 'railstraitlo1').flatMap((q) => q.parts);
    expect(low.length).toBeGreaterThan(0);
    for (const part of low) expect(bandOfPart(part)).toEqual({ nearFade: [100, 120], farFade: [420, 440] });
    const flares = partsAt(map, 'wireflare1_1');
    expect(flares.length).toBeGreaterThan(0);
    for (const part of flares) expect(bandOfPart(part)).toEqual({ nearFade: [0, 0], farFade: [300, 300] });
  });
});
