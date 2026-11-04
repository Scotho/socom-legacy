import { closeSync, existsSync, fstatSync, openSync, readdirSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IsoAssetSource, type AssetSource, type RangedAssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { buildZar } from '../../scene/test/syntheticZar';
import { compileRdr } from '../../scene/test/syntheticRdr';
import { LOADING_SCREEN_WAIT_PLACEHOLDER, loadingFromDisc, loadingTransferables, loadWithScreen, type LoadingScreen } from '../src/loadingAssets';

/**
 * The loading screen's reader (INT-LOADING; socomlegacy/docs/research/125), ported from Chris's browser-beta-v5
 * `loadingAssets.ts` / `beta5LoadingAssets.test.ts` (chris/browser-beta-integration d578f347) and widened from his three
 * maps to every multiplayer map: `dlgLoad.rdr`'s layout, the map's picture through `mission.rdr`'s binding, the disc
 * and its spin, the font and the `UILd` strings. Hand-built sources first (never a throw: what will not read is named),
 * then the dev disc (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; the image `SOCOM_ISO`) -- skipped without it.
 */

/** A source over named in-memory files. */
function memory(files: Record<string, Uint8Array>): AssetSource {
  return {
    list: async () => Object.keys(files),
    read: async (path) => {
      const f = files[path];
      if (!f) throw new Error(`no file ${path}`);
      return f;
    },
  };
}

/** A ranged source over named in-memory files (the served tree, the image): each request logged, `inFlight` peaked. */
function ranged(files: Record<string, Uint8Array>): RangedAssetSource & { log: string[]; peak: () => number } {
  const log: string[] = [];
  let inFlight = 0, peak = 0;
  const file = (path: string): Uint8Array => {
    const f = files[path];
    if (!f) throw new Error(`no file ${path}`);
    return f;
  };
  const request = async <T>(what: string, f: () => T): Promise<T> => {
    log.push(what);
    inFlight++; peak = Math.max(peak, inFlight);
    try { await new Promise((r) => setTimeout(r, 1)); return f(); } finally { inFlight--; }
  };
  return {
    log, peak: () => peak,
    list: async () => Object.keys(files),
    read: (path) => request(`read ${path}`, () => file(path)),
    size: (path) => request(`size ${path}`, () => file(path).length),
    readRange: (path, offset, length) => request(`range ${path} ${offset}`, () => {
      const f = file(path);
      if (offset + length > f.length) throw new Error('past the end');
      return f.subarray(offset, offset + length);
    }),
  };
}

/** A map archive of named members (the ZDB's table of contents, `packages/archive/src/zdb.ts`). */
function zdbOf(members: { name: string; data: Uint8Array }[]): Uint8Array {
  const dataStart = 2048;
  const out = new Uint8Array(dataStart + members.reduce((n, m) => n + Math.ceil(Math.max(1, m.data.length) / 2048) * 2048, 0));
  const dv = new DataView(out.buffer);
  dv.setUint32(0x98, members.length, true);
  dv.setUint32(0x9c, 0x5c, true);
  let at = dataStart;
  members.forEach((m, i) => {
    const o = 0xa0 + i * 0x5c;
    dv.setUint32(o, 0x5c, true);
    for (let k = 0; k < m.name.length; k++) out[o + 4 + k] = m.name.charCodeAt(k);
    dv.setUint32(o + 68, at, true);
    dv.setUint32(o + 72, m.data.length, true);
    out.set(m.data, at);
    at += Math.ceil(Math.max(1, m.data.length) / 2048) * 2048;
  });
  return out;
}

/** A `dlgLoad.rdr`-shaped layout: the picture by UIVAR, the title, the disc under its parent (research 96 §7). */
const DLG = compileRdr([['SCREENS', [[
  'LIBRARY', ['common/assetlib/loading'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['LittleBlack.tif']], 'FONT', ['font_text_01'],
  'SCRIPT_LIBRARY', ['dlgLoad.rdr'], 'OBJECTS', [
    ['NAME', ['LoadingPicture'], 'TYPE', ['IMAGE'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['XSIZE', ['580'], 'YSIZE', ['210'], 'UIVAR', ['NAME', ['load_picture']]]],
    ['NAME', ['title'], 'TYPE', ['TEXT'], 'XPOS', ['30'], 'YPOS', ['120'], 'SPEC', ['COLOR', ['14', '57', '65'], 'SCALE', ['1.2'], 'UIVAR', ['NAME', ['mission_title']]]],
    ['NAME', ['load_CD_Parent'], 'TYPE', ['IMAGE'], 'XPOS', ['590'], 'YPOS', ['360'], 'SPEC', ['XSIZE', ['40'], 'YSIZE', ['40']]],
    ['NAME', ['load_CD_spinning'], 'TYPE', ['IMAGE'], 'XPOS', ['-15'], 'YPOS', ['-15'], 'SPEC', ['CHILDOF', ['load_CD_Parent'], 'FILENAME', ['loading_CD.tif'], 'XSIZE', ['30'], 'YSIZE', ['30']]],
  ],
]]]]);
const MISSION = compileRdr(['UiVars', [
  ['NAME', ['mission_title'], 'VALUE', ['FROSTFIRE']], ['NAME', ['load_picture'], 'VALUE', ['ld_mp2_prog.tif']],
], 'LoadingScreenAssets', ['ui/assetlib/ld/om02']]);

describe('loadingFromDisc over hand-built sources', () => {
  it('never throws on an empty source: the layout is left out and named', async () => {
    const d = await loadingFromDisc(memory({}), 'RUN/MP2.ZDB');
    expect([d.layout, d.binding, d.spin]).toEqual([null, null, null]);
    expect([d.fonts, d.strings, d.bitmaps]).toEqual([[], [], []]);
    expect(d.missing.some((m) => m.startsWith('RUN/UI/READERC.ZAR'))).toBe(true);
    expect(loadingTransferables(d)).toEqual([]);
  });

  it('without dlgLoad.rdr\'s layout reads nothing more: the page shows no screen without one, so the map waits on no read', async () => {
    const reads: string[] = [];
    const map = zdbOf([{ name: 'RUN\\READERM.ZAR', data: buildZar([{ name: 'mission.rdr', data: MISSION }]) }]);
    const files: Record<string, Uint8Array> = { 'RUN/MP2.ZDB': map, 'RUN/UI/READERC.ZAR': buildZar([{ name: 'other.rdr', data: MISSION }]) };
    const inner = memory(files);
    const source: AssetSource = { list: inner.list, read: async (path, ...rest) => { reads.push(path); return inner.read(path, ...rest); } };
    const d = await loadingFromDisc(source, 'RUN/MP2.ZDB');
    expect(d.layout).toBeNull();
    expect([d.binding, d.spin, d.fonts, d.strings, d.bitmaps]).toEqual([null, null, [], [], []]);
    expect([...new Set(reads)]).toEqual(['RUN/UI/READERC.ZAR']);
    expect(d.missing).toEqual(['RUN/UI/READERC.ZAR: no dlgLoad.rdr']);
  });

  it('reads the layout and the map\'s binding, and names the libraries it cannot open by the stems the records give', async () => {
    const map = zdbOf([{ name: 'RUN\\READERM.ZAR', data: buildZar([{ name: 'mission.rdr', data: MISSION }]) }]);
    const d = await loadingFromDisc(memory({ 'RUN/UI/READERC.ZAR': buildZar([{ name: 'dlgLoad.rdr', data: DLG }]), 'RUN/MP2.ZDB': map }), 'RUN/MP2.ZDB');
    expect(d.layout!.objects.map((o) => o.name)).toEqual(['LoadingPicture', 'title', 'load_CD_Parent', 'load_CD_spinning']);
    expect(d.libraries).toEqual(['common/assetlib/loading', 'common/assetlib/font']);
    expect(d.binding).toMatchObject({ title: 'FROSTFIRE', picture: 'ld_mp2_prog.tif', stem: 'OM02' });
    // The dialog's library is LOAD (its LIBRARY's stem), the font's FONT (no NOFONTLIB), the picture's OM02 (the binding).
    for (const bank of ['LOAD_TXR.ZED', 'FONT_TXR.ZED', 'OM02_TXR.ZED']) expect(d.missing.some((m) => m.includes(bank)), bank).toBe(true);
  });

  it('over a ranged source reads the map archive\'s table of contents once and its members together (review F2)', async () => {
    const ld = buildZar([{ name: 'x', data: new Uint8Array(4) }]);
    const map = zdbOf([
      { name: 'RUN\\READERM.ZAR', data: buildZar([{ name: 'mission.rdr', data: MISSION }]) },
      { name: 'RUN\\LDZANIM.ZAR', data: ld }, { name: 'RUN\\UILDLOC.ZAR', data: ld },
    ]);
    const source = ranged({ 'RUN/UI/READERC.ZAR': buildZar([{ name: 'dlgLoad.rdr', data: DLG }]), 'RUN/MP2.ZDB': map });
    const d = await loadingFromDisc(source, 'RUN/MP2.ZDB');
    expect(d.binding).toMatchObject({ title: 'FROSTFIRE', stem: 'OM02' });
    const onMap = source.log.filter((r) => r.includes('RUN/MP2.ZDB'));
    // One size, one head and one table of contents for the whole screen -- not three requests per member.
    expect(onMap.filter((r) => r.startsWith('size '))).toHaveLength(1);
    expect(onMap.filter((r) => r === 'range RUN/MP2.ZDB 0')).toHaveLength(2);
    // The members (READERM, LDZANIM, UILDLOC; the six banks are absent) are asked for at once, not one after another.
    expect(source.peak()).toBeGreaterThanOrEqual(3);
  });

  it('hands each bitmap buffer over once, however many names share it', () => {
    const buffer = new Uint8ClampedArray(16);
    const shared = { width: 2, height: 2, data: buffer };
    const d: LoadingScreen = {
      map: 'RUN/MP2.ZDB', layout: null, libraries: [], binding: null, spin: null, fade: null, fonts: [], strings: [], unheld: [], missing: [],
      bitmaps: [['a.tif', shared], ['b.tif', shared], ['c.tif', { width: 1, height: 1, data: new Uint8ClampedArray(4) }]],
    };
    const t = loadingTransferables(d);
    expect(t).toHaveLength(2);
    expect(new Set(t).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The dev disc.

const DISC = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game', 'disc') : undefined);
const RUN = DISC ? resolve(DISC, 'RUN') : undefined;
const MAPS = RUN && existsSync(RUN) ? readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$/i.test(f)).sort((a, b) => Number(a.slice(2, -4)) - Number(b.slice(2, -4))) : [];

const sizes = (d: LoadingScreen): Record<string, string> => Object.fromEntries(d.bitmaps.map(([n, r]) => [n, `${r.width}x${r.height}`]));

describe.skipIf(MAPS.length === 0)(`loadingFromDisc on every multiplayer map${MAPS.length ? '' : ' (no SOCOM_DISC)'}`, () => {
  it('resolves the picture the map binds, the disc, the background and the font on all 22, nothing missing', async () => {
    expect(MAPS).toHaveLength(22);
    const source = new FsAssetSource(DISC as string);
    for (const file of MAPS) {
      const n = Number(file.slice(2, -4));
      const d = await loadingFromDisc(source, `RUN/${file}`);
      expect(d.missing, file).toEqual([]);
      expect(d.binding?.picture, file).toBe(`ld_mp${n}_prog.tif`);
      expect(d.binding?.stem, file).toBe(`${n <= 12 ? 'OM' : 'LP'}${String(n).padStart(2, '0')}`);
      expect(d.binding?.title?.trim().length, file).toBeGreaterThan(0);
      expect(sizes(d), file).toEqual({
        [`ld_mp${n}_prog.tif`]: '512x256', 'loading_cd.tif': '64x64', 'littleblack.tif': '8x8', 'font_text_01.tif': '512x128', 'font_special_01.tif': '256x64',
      });
      // The progress bar's two bitmaps are on no texture bank of the disc (research 125 §4).
      expect(d.unheld, file).toEqual(['load_back.tif', 'load_line.tif']);
      expect(d.spin?.segments.map((s) => s.seconds), file).toEqual([0.75, 0.75]);
      expect(d.fade && [d.fade.node, d.fade.from, d.fade.to, Math.round(d.fade.seconds * 1000) / 1000], file).toEqual(['MENUFADER', 1, 0, 1.5]);
      expect(d.strings.map((s) => s.id), file).toEqual([2000, 2001, 2002, 2003, 2004, 2005, 2006]);
      expect(d.fonts.map((f) => f.name), file).toEqual(['font_text_01']);
      const buffers = loadingTransferables(d);
      expect(new Set(buffers).size, file).toBe(buffers.length);
    }
  }, 120_000);

  it('reads dlgLoad.rdr\'s nine objects at their file positions (research 96 §7)', async () => {
    const d = await loadingFromDisc(new FsAssetSource(DISC as string), 'RUN/MP72.ZDB');
    expect(d.layout!.background).toBe('LittleBlack.tif');
    expect(d.layout!.objects.map((o) => [o.name, o.type, o.x, o.y, ...(o.size ?? [])])).toEqual([
      ['LoadingPicture', 'IMAGE', 30, 120, 580, 210], ['LoadingBackground', 'IMAGE', 337, 108, 270, 6],
      ['load_progress_filling', 'PROGRESSBAR', 337, 110, 270, 2], ['title', 'TEXT', 30, 120], ['description', 'TEXT', 30, 357],
      ['ReturnToLobby', 'TEXT', 320, 420], ['RateLevel', 'TEXT', 30, 377], ['load_CD_Parent', 'IMAGE', 590, 360, 40, 40],
      ['load_CD_spinning', 'IMAGE', -15, -15, 30, 30],
    ]);
  });
});

const ISO = process.env.SOCOM_ISO;
const HAVE_ISO = !!ISO && existsSync(ISO);

/** The retail image through a readSync-per-slice Blob stand-in (`packages/archive/test/frontEndDisc.test.ts`'s). */
const fsBlob = (path: string): Blob & { close(): void } => {
  const fd = openSync(path, 'r');
  const size = fstatSync(fd).size;
  const slice = (start = 0, end = size): Blob => ({
    size: end - start,
    arrayBuffer: async () => {
      const out = new Uint8Array(end - start);
      let got = 0;
      while (got < out.length) {
        const n = readSync(fd, out, got, out.length - got, start + got);
        if (n === 0) break;
        got += n;
      }
      return out.buffer;
    },
  }) as unknown as Blob;
  return { size, slice, close: () => closeSync(fd) } as unknown as Blob & { close(): void };
};

describe.skipIf(!HAVE_ISO)('loadingFromDisc on the retail image (SOCOM_ISO): the disc page\'s path', () => {
  it('reads Frostfire\'s and Crossroads\' screens off the image as off the tree', async () => {
    const blob = fsBlob(ISO ?? '');
    try {
      const iso = new IsoAssetSource(blob);
      for (const [map, picture] of [['RUN/MP2.ZDB', 'ld_mp2_prog.tif'], ['RUN/MP72.ZDB', 'ld_mp72_prog.tif']] as const) {
        const d = await loadingFromDisc(iso, map);
        expect(d.missing, map).toEqual([]);
        expect(d.binding?.picture, map).toBe(picture);
        expect(sizes(d)[picture], map).toBe('512x256');
        expect(sizes(d)['loading_cd.tif'], map).toBe('64x64');
        expect(sizes(d)['font_text_01.tif'], map).toBe('512x128');
        expect(d.spin?.period, map).toBe(1.5);
        expect(d.layout?.objects.length, map).toBe(9);
        expect(d.binding?.stem, map).toBe(map === 'RUN/MP2.ZDB' ? 'OM02' : 'LP72');
      }
    } finally {
      blob.close();
    }
  }, 120_000);
});

describe('loadWithScreen: the worker\'s order of the screen and the map', () => {
  const blank: LoadingScreen = { map: 'RUN/MP2.ZDB', layout: null, libraries: [], binding: null, spin: null, fade: null, fonts: [], strings: [], bitmaps: [], unheld: [], missing: [] };

  it('posts the screen before the map\'s load begins (the load state builds dlgLoad, then loads: research 115 R115.10)', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const done = loadWithScreen(async () => { await gate; return blank; }, () => order.push('screen'), async () => { order.push('load'); return 'map'; });
    await Promise.resolve(); await Promise.resolve();
    expect(order).toEqual([]);
    release();
    expect(await done).toBe('map');
    expect(order).toEqual(['screen', 'load']);
  });

  it('a screen read that stalls holds the map no longer than LOADING_SCREEN_WAIT_PLACEHOLDER; a late screen is still posted', async () => {
    expect(LOADING_SCREEN_WAIT_PLACEHOLDER).toBe(3000);
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const map = await loadWithScreen(async () => { await gate; return blank; }, () => order.push('screen'), async () => { order.push('load'); return 'map'; }, 5);
    expect([map, order]).toEqual(['map', ['load']]);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['load', 'screen']);       // the page's watch drops it: its map has come (`./loadingPanel`)
  });

  it('a screen that fails to read never stops the map', async () => {
    const posted: LoadingScreen[] = [];
    expect(await loadWithScreen(async () => { throw new Error('no'); }, (s) => posted.push(s), async () => 7)).toBe(7);
    expect(posted).toEqual([]);
  });
});
