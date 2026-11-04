import { describe, expect, it } from 'vitest';
import { DirectoryAssetSource } from '../src/directoryAssetSource';
import { IsoAssetSource } from '../src/isoAssetSource';
import { ARMORY_ARCHIVES, CAMPAIGN_ARCHIVES, COMMON_ARCHIVES } from '../src/mapIndex';
import { READ_SET_IDENTITY_FILE, READ_SET_MOVIES, READ_SET_VERSION, discReadSet, hasFileBlobs, readSetPaths } from '../src/readSet';
import { buildIso, type IsoMember } from './isoImage';

/**
 * DX-1's read set (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R6): the files the page reads,
 * composed of the lists the repository keeps (`FRONT_END_CLASSES`, `COMMON_ARCHIVES`, the multiplayer maps), each with
 * its size from the disc's own table. A browser adaptation (FI.R2): nothing of the game. The listing is the retail
 * disc's own names (the `SOCOM_DISC` directory listing, names only); every byte is synthetic.
 */

/** One or more files of every class in scope, the identity's file, the common archives and three maps. */
const READ = [
  'SYSTEM.CNF',
  'RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UI/UI.ZED', 'RUN/UI/UI_GEO.ZED', 'RUN/UI/UI_MDL.ZED', 'RUN/UI/UI_TXR.ZED',
  'RUN/UI/UI_PAL.ZED', 'RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED', 'RUN/UI/JUNK_TXR.ZED',
  'RUN/UIZANIM.ZAR', 'RUN/EXTZANIM.ZAR', 'RUN/MPZANIM.ZAR',
  'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/LOCALE/STATES/UIMPXLOC.ZAR', 'RUN/LOCALE/STATES/UIXLOC.ZAR', 'RUN/LOCALE/STATES/HUDCLOC.ZAR',
  'RUN/MOVIES/COMMON/MENULOOP.PSS', 'RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS',
  'RUN/COMMON/FONT_TXR.ZED', 'RUN/COMMON/FONT_PAL.ZED',
  'RUN/RAW/LOADING.RAW', 'RUN/RAW/PULOADGP.RAW',
  'RUN/SOUNDS/VAGSTORE.ZAR', 'RUN/SOUNDS/BNKSTORE.ZAR',
  'RUN/ICONS/LIST.ICO', 'RUN/ICONS/HDD/ICON.SYS',
  'RUN/READERC.ZAR', 'RUN/ZWEAPON.ZAR', 'RUN/MOTION_P.ZAR', 'RUN/SOUNDRDR.ZAR', 'RUN/IRX/LIBSD.IRX',
  'RUN/MP1.ZDB', 'RUN/MP2.ZDB', 'RUN/MP72.ZDB',
  ...CAMPAIGN_ARCHIVES,                                                     // the forge's single-player maps (FI.R6)
];
/** Neighbours the set must leave out: the campaign's movies and locale tables, the deferred classes, the per-map UI sets, the rest. */
const LEFT_OUT = [
  'SCUS_972.75', 'RUN/MOVIES/M51/M51_EXT.PSS', 'RUN/MOVIES/ALB_AOP.PSS',
  'RUN/LOCALE/STATES/ALBLOC.ZAR', 'RUN/UI/BF51_TXR.ZED', 'RUN/UI/EM01_PAL.ZED', 'RUN/UI/DBUFFER.ZAR', 'RUN/COMMON/SPLA_TXR.ZED',
  'RUN/IRX/CDVDSTM.IRX', 'RUN/RECO/ENU/ENU_RL0.CTX', 'NETGUI/BG.RGB',
  // FI.R6 as revised (the owner's "cut everything else"): the EXTRAS' content movies.
  'RUN/MOVIES/COMMON/ARTGALL2.PSS', 'RUN/MOVIES/COMMON/MUSVID.PSS', 'RUN/MOVIES/COMMON/CREDITS.PSS',
  'RUN/MOVIES/COMMON/TUT_01.PSS', 'RUN/MOVIES/COMMON/TUT_10.PSS',
];

/** Each member's bytes say which file it is, and their lengths differ, so a size from the wrong file cannot pass. */
const members = (paths: readonly string[]): IsoMember[] =>
  paths.map((path, i) => ({ path, bytes: new Uint8Array(100 + i * 37).fill(i & 0xff) }));

describe('readSetPaths: the read set in a listing', () => {
  it('takes the identity file, the front end (movies and VAGSTORE included), the common archives and every MP map', () => {
    const { paths, missing } = readSetPaths([...READ, ...LEFT_OUT].sort());
    expect(paths).toEqual([...READ].sort());
    expect(missing).toEqual([]);
    for (const p of COMMON_ARCHIVES) expect(paths, p).toContain(p);
    for (const p of ARMORY_ARCHIVES) expect(paths, p).toContain(p);
    expect(paths).toContain('RUN/SOUNDS/VAGSTORE.ZAR');
    expect(paths).toContain('RUN/MOVIES/INTRO_2.PSS');
    expect(paths[0]).toBe('RUN/COMMON/FONT_PAL.ZED');
    expect(READ_SET_IDENTITY_FILE).toBe('SYSTEM.CNF');
  });

  it("keeps the owner's movies only: the opener (SONY448, INTRO_2) and the menu's loop (MENULOOP); every other movie is cut (FI.R6)", () => {
    expect([...READ_SET_MOVIES].sort()).toEqual(['RUN/MOVIES/COMMON/MENULOOP.PSS', 'RUN/MOVIES/COMMON/SONY448.PSS', 'RUN/MOVIES/INTRO_2.PSS']);
    const { paths } = readSetPaths([...READ, ...LEFT_OUT].sort());
    expect(paths.filter((p) => p.endsWith('.PSS')).sort()).toEqual([...READ_SET_MOVIES].sort());
    expect(READ_SET_VERSION).toBe(3);                                      // an extraction under an earlier version is made again
  });

  it("takes the campaign's twelve map archives for the forge (the owner, 2026-10-16: \"we also need single player maps for forge\"), and names one the disc lacks", () => {
    const { paths, missing } = readSetPaths([...READ]);
    for (const p of CAMPAIGN_ARCHIVES) expect(paths).toContain(p);
    expect(missing).toEqual([]);
    const lacking = readSetPaths(READ.filter((p) => p !== 'RUN/M73.ZDB'));
    expect(lacking.missing).toEqual(['RUN/M73.ZDB']);
  });

  it('names what a listing lacks -- the identity file, a common archive, a front-end pattern -- never skips it silently', () => {
    const lacking = READ.filter((p) => p !== 'SYSTEM.CNF' && p !== 'RUN/ZWEAPON.ZAR' && !p.startsWith('RUN/RAW/'));
    const { paths, missing } = readSetPaths(lacking);
    expect(missing).toEqual(expect.arrayContaining(['SYSTEM.CNF', 'RUN/ZWEAPON.ZAR', 'RUN/RAW/*.RAW']));
    expect(missing.length).toBe(3);
    expect(paths).not.toContain('SYSTEM.CNF');
  });
});

describe('discReadSet: each size from the disc\'s own table', () => {
  const all = members([...READ, ...LEFT_OUT]);
  const sizes = new Map(all.map((m) => [m.path, m.bytes.length]));

  it('over an image: the ISO\'s extents, in the table\'s LBN order, and their total', async () => {
    const image = new IsoAssetSource(new Blob([buildIso(all)]));
    const set = await discReadSet(image);
    expect(set.version).toBe(READ_SET_VERSION);
    expect(set.missing).toEqual([]);
    expect(set.files.map((f) => f.path).sort()).toEqual([...READ].sort());
    for (const f of set.files) expect(f.size, f.path).toBe(sizes.get(f.path));
    const extents = await image.extents();
    const order = extents.map((e) => e.path).filter((p) => READ.includes(p));
    expect(set.files.map((f) => f.path)).toEqual(order);
    expect(set.total).toBe(READ.reduce((n, p) => n + sizes.get(p)!, 0));
  });

  it('over a folder: each file\'s own size, in path order, the same set and total as the image', async () => {
    const folder = new DirectoryAssetSource(all.map((m) => ({ path: `SOCOM2/${m.path}`, blob: new Blob([m.bytes as Uint8Array<ArrayBuffer>]) })));
    const set = await discReadSet(folder);
    expect(set.files.map((f) => f.path)).toEqual([...READ].sort());
    for (const f of set.files) expect(f.size, f.path).toBe(sizes.get(f.path));
    const image = await discReadSet(new IsoAssetSource(new Blob([buildIso(all)])));
    expect(set.total).toBe(image.total);
  });

  it('a disc lacking files: the files it has, and the names it lacks', async () => {
    const set = await discReadSet(new IsoAssetSource(new Blob([buildIso(members(READ.filter((p) => p !== 'RUN/MOTION_P.ZAR')))])));
    expect(set.missing).toEqual(['RUN/MOTION_P.ZAR']);
    expect(set.files.map((f) => f.path)).not.toContain('RUN/MOTION_P.ZAR');
  });

  it('a source with no table (it can neither give extents nor say a file\'s size): refused', async () => {
    const bare = { list: async () => [...READ], read: async () => new Uint8Array(0) };
    await expect(discReadSet(bare)).rejects.toThrow(/table/);
  });
});

describe('fileBlob: a file as a Blob, read nothing (BlobAssetSource)', () => {
  it('the image: a slice over the file\'s extent, equal to read(); the folder: the picked file', async () => {
    const all = members(READ);
    const image = new IsoAssetSource(new Blob([buildIso(all)]));
    const folder = new DirectoryAssetSource(all.map((m) => ({ path: m.path, blob: new Blob([m.bytes as Uint8Array<ArrayBuffer>]) })));
    expect(hasFileBlobs(image)).toBe(true);
    expect(hasFileBlobs(folder)).toBe(true);
    for (const path of ['SYSTEM.CNF', 'RUN/MP72.ZDB', 'RUN/UI/UI.ZED']) {
      const want = await image.read(path);
      expect(new Uint8Array(await (await image.fileBlob(path)).arrayBuffer()), path).toEqual(want);
      expect(new Uint8Array(await (await folder.fileBlob(path)).arrayBuffer()), path).toEqual(want);
    }
    await expect(image.fileBlob('RUN/NONE.ZAR')).rejects.toThrow(/no RUN\/NONE.ZAR/);
    await expect(folder.fileBlob('RUN/NONE.ZAR')).rejects.toThrow(/no RUN\/NONE.ZAR/);
  });
});
