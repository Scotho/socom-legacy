import { describe, expect, it } from 'vitest';
import { IsoAssetSource } from '../src/isoAssetSource';
import { buildDualLayerIso, buildIso, SECTOR, type IsoMember } from './isoImage';

const pattern = (length: number, seed: number): Uint8Array => {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed * 7 + (i >>> 8)) & 0xff;
  return out;
};

const MEMBERS: IsoMember[] = [
  { path: 'SYSTEM.CNF', bytes: pattern(60, 1) },
  { path: 'RUN/SOUNDS/VAGSTORE.ZAR', bytes: pattern(5 * SECTOR + 300, 2) },
  { path: 'RUN/MOVIES/COMMON/MENULOOP.PSS', bytes: pattern(3 * SECTOR, 3) },
  { path: 'RUN/UI/UI.ZED', bytes: pattern(1136, 4) },
];

/**
 * The LBN lookup `tools_py/iso_lbn.py` does (its `lookup`): which file a sector belongs to and how far into it, from
 * the ISO's directory records -- the way the engine's `sceCdStStart(lbn)` and the 989snd streams'
 * `{sector, offset}` (PC research 09, 32 §6) address the disc -- and the reverse, a file's first LBN.
 */
describe('IsoAssetSource LBN lookup', () => {
  it('lists every file\'s extent, ordered by LBN as iso_lbn.py sorts them', async () => {
    const source = new IsoAssetSource(new Blob([buildIso(MEMBERS)]));
    const extents = await source.extents();
    expect(extents.map((e) => e.path).sort()).toEqual(MEMBERS.map((m) => m.path).sort());
    for (const e of extents) expect(await source.extent(e.path)).toEqual({ lbn: e.lbn, size: e.size });
    const lbns = extents.map((e) => e.lbn);
    expect(lbns).toEqual([...lbns].sort((a, b) => a - b));
  });

  it('names the file and the offset of a sector, and of a sector plus a byte offset', async () => {
    const iso = buildIso(MEMBERS);
    const source = new IsoAssetSource(new Blob([iso]));
    const vag = await source.extent('RUN/SOUNDS/VAGSTORE.ZAR');
    expect(await source.fileAt(vag.lbn)).toEqual({ path: 'RUN/SOUNDS/VAGSTORE.ZAR', lbn: vag.lbn, sectors: 0, offset: 0 });
    expect(await source.fileAt(vag.lbn + 2, 100)).toEqual({ path: 'RUN/SOUNDS/VAGSTORE.ZAR', lbn: vag.lbn, sectors: 2, offset: 2 * SECTOR + 100 });
    // A byte offset past a sector carries into the sectors, as `sector * 2048 + offset` reads the image.
    expect(await source.fileAt(vag.lbn, 2 * SECTOR + 100)).toEqual(await source.fileAt(vag.lbn + 2, 100));
    // The last, part-filled sector is the file's (iso_lbn.py: ceil(size / 2048) sectors).
    expect((await source.fileAt(vag.lbn + 5))?.path).toBe('RUN/SOUNDS/VAGSTORE.ZAR');
    // The bytes the answer points at are the file's.
    const at = await source.fileAt(vag.lbn + 3, 7);
    expect(iso.subarray((vag.lbn + 3) * SECTOR + 7, (vag.lbn + 3) * SECTOR + 17))
      .toEqual(MEMBERS[1]!.bytes.subarray(at!.offset, at!.offset + 10));
  });

  it('answers null for a sector no file holds: the descriptors, a directory, past the end', async () => {
    const iso = buildIso(MEMBERS);
    const source = new IsoAssetSource(new Blob([iso]));
    expect(await source.fileAt(16)).toBeNull();
    expect(await source.fileAt(0)).toBeNull();
    expect(await source.fileAt(iso.length / SECTOR + 10)).toBeNull();
    await expect(source.fileAt(-1)).rejects.toThrow(/sector/);
  });

  it('gives an empty file its one sector first, as iso_lbn.py does (its sort puts the zero size ahead)', async () => {
    // buildIso lays an empty file at the LBN the next file starts at, as mastering tools often do.
    const source = new IsoAssetSource(new Blob([buildIso([{ path: 'A.BIN', bytes: new Uint8Array(0) }, { path: 'B.BIN', bytes: pattern(10, 5) }])]));
    const a = await source.extent('A.BIN');
    const b = await source.extent('B.BIN');
    expect(a.lbn).toBe(b.lbn);
    expect((await source.fileAt(a.lbn))?.path).toBe('A.BIN');
  });

  it('finds a layer 1 file by its absolute sector on a dual-layer dump', async () => {
    const { iso, layer1Start } = buildDualLayerIso(MEMBERS.slice(0, 2), [{ path: 'RUN/MOVIES/L1.PSS', bytes: pattern(4 * SECTOR, 9) }]);
    const source = new IsoAssetSource(new Blob([iso]));
    const l1 = await source.extent('RUN/MOVIES/L1.PSS');
    expect(l1.lbn).toBeGreaterThan(layer1Start);
    expect(await source.fileAt(l1.lbn + 1)).toEqual({ path: 'RUN/MOVIES/L1.PSS', lbn: l1.lbn, sectors: 1, offset: SECTOR });
    expect((await source.extents()).map((e) => e.path)).toContain('RUN/MOVIES/L1.PSS');
  });
});
