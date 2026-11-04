import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { IsoAssetSource, Zar, type AssetSource } from '@s2u/archive';
import {decodeTexture,parseTextureRecord,PaletteTable} from '@s2u/gs';
import { FsAssetSource } from '@s2u/archive/node';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { buildIso } from '../../archive/test/isoImage';
import { buildZar } from '../../scene/test/syntheticZar';
import { compileRdr } from '../../scene/test/syntheticRdr';
import { armoryFromDisc, armoryTransferables, type ArmoryData } from '../src/armoryData';

/**
 * The ARMORY's loader (web sprint 5, S1; W5.R3; socomlegacy/docs/research/95 §5.6): whatever source the page reads --
 * the player's ISO or the served development tree -- through the one `AssetSource` interface. Hand-built archives first
 * (what reads, reads; the rest is named in `missing`, never thrown), then the fixture tree `extract-maps` writes.
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

describe('armoryFromDisc over hand-built sources', () => {
  it('never throws on an empty source: every part is left out and named', async () => {
    const d = await armoryFromDisc(memory({}), 'RUN/MP2.ZDB', 'MP2');
    expect([d.layout, d.roster, d.light]).toEqual([null, null, null]);
    expect([d.scripts, d.items, d.strings, d.fonts, d.models, d.bitmaps]).toEqual([[], [], [], [], [], []]);
    for (const path of ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR', 'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/READERC.ZAR', 'RUN/UI/UI_GEO.ZED', 'RUN/UI/UI.ZED', 'RUN/MP2.ZDB READERM.ZAR']) {
      expect(d.missing.some((m) => m.startsWith(path)), path).toBe(true);
    }
    expect(armoryTransferables(d)).toEqual([]);
  });

  it('leaves the UI models out when the page holds them (`models: false`): never read, never named missing', async () => {
    const read: string[] = [];
    const src = memory({});
    const spy: AssetSource = { list: src.list, read: async (path) => { read.push(path); return src.read(path); } };
    const d = await armoryFromDisc(spy, 'RUN/MP2.ZDB', 'MP2', { models: false });
    for (const path of ['RUN/UI/UI_GEO.ZED', 'RUN/UI/UI_MDL.ZED', 'RUN/UI/UI_TXR.ZED', 'RUN/UI/UI_PAL.ZED']) {
      expect(read, path).not.toContain(path);
      expect(d.missing.some((m) => m.startsWith(path)), path).toBe(false);
    }
    expect([d.models, d.modelTextures]).toEqual([[], []]);
  });

  it('reads the parts a source holds: the strings (UTF-8 decoded) and the fonts, the rest named missing', async () => {
    const loc = buildZar([{ name: 'UIMnLOC.rdr', data: compileRdr([[['ID', ['15'], 'MSG_ID', ['_15_ARMORY_MSG'], 'LOCALIZED', ['Â¦ ARMORY']]]]) }]);
    const fonts = compileRdr([['faces', ['font_titlebar_01', ['textures', ['font_titlebar_01.tif'], 'opacity', ['0.7'], 'charoffsets', [[
      'Code', ['65'], 'texture', ['1'], 'baseline', ['0'], 'Elems', [['UL', ['2', '0'], 'LR', ['23', '51'], 'DispPos', ['-3', '0'], 'HorScale', ['1'], 'VertScale', ['1']]],
    ]]]]]]);
    const readerc = buildZar([{ name: 'fonts.rdr', data: fonts }]);
    const d = await armoryFromDisc(memory({ 'RUN/LOCALE/STATES/UIMNLOC.ZAR': loc, 'RUN/READERC.ZAR': readerc }), 'RUN/MP2.ZDB', 'MP2');
    expect(d.strings).toEqual([{ id: 15, msg: '_15_ARMORY_MSG', text: '¦ ARMORY' }]);
    expect(d.fonts.map((f) => [f.name, f.glyphs.length, f.opacity])).toEqual([['font_titlebar_01', 1, 0.7]]);
    expect(d.missing).toContain('RUN/READERC.ZAR: no character.rdr');
    expect(d.layout).toBeNull();
  });
});

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const present = ['RUN/UI/JUNK_TXR.ZED', 'RUN/MP2.ZDB', 'RUN/UIZANIM.ZAR', 'RUN/UI/READERC.ZAR', 'RUN/UI/UI_MDL.ZED', 'RUN/LOCALE/STATES/UIMNLOC.ZAR', 'RUN/ZWEAPON.ZAR']
  .every((p) => existsSync(resolve(FIXTURES, p)));

describe.skipIf(!present)(`armoryFromDisc on Frostfire's fixture tree${present ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let loaded: Promise<ArmoryData> | null = null;
  const data = (): Promise<ArmoryData> => (loaded ??= armoryFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2'));

  it('reads the SR-25 texture from the UI world\'s original JUNK library, byte-exact after decoding',async()=>{
    const source=new FsAssetSource(FIXTURES);
    const world=Zar.parse(await source.read('RUN/UI/UI.ZED'));
    expect(world.find('assetlibs')!.children.map(k=>k.name)).toEqual(['//ui/junkyard','//ui/assetlib/ui']);
    const junk=Zar.parse(await source.read('RUN/UI/JUNK_TXR.ZED'));
    const key=junk.find('textures')!.children.find(k=>k.name==='null_xmas.bmp')!;
    const expected=decodeTexture(parseTextureRecord(key.name,junk.data(junk.child(key,'texdat')!)),PaletteTable.fromZars([]));
    expect(expected.diagnostics).toEqual([]);
    const got=(await data()).modelTextures.find(([name])=>name===key.name)?.[1];
    expect(got).toBeDefined();expect(got).toEqual(expected.rgba);
  });

  it('reads every part, only the SR-25s\' null_xmas.bmp missing (research 95 §2.6)', async () => {
    const d = await data();
    expect(d.missing).toEqual([]);
    expect(d.layout!.objects).toHaveLength(226);
    expect(d.uiSounds).toEqual([['TELETYPE', '.TYPE'], ['BACK', '.BACK'], ['SELECTION', '.METAL']]);
    expect(d.scripts.map((s) => [s.set, s.programs.length])).toEqual([
      ['dlg_equipment_mp.rdr', 43], ['UICharacterProfile.rdr', 6], ['ShowAndSpin.rdr', 23], ['UIanim.rdr', 19], ['UIHardDiskAnim.rdr', 1],
    ]);
    expect([d.items.length, d.strings.length, d.fonts.map((f) => f.glyphs.length)]).toEqual([70, 1411, [166, 185]]);
    expect(d.roster!.characters.map((c) => c.portrait)).toEqual([
      'Seal1_scuba.tif', 'Seal2_scuba.tif', 'Seal3_scuba.tif', 'Seal4_scuba.tif', 'terr1_mp2.tif', 'terr2_mp2.tif', 'terr3_mp2.tif', 'terr4_mp2.tif',
    ]);
  });

  it('decodes the 63 cited preview models and their textures (not flipped), and the preview light (UI.ZED)', async () => {
    const d = await data();
    expect(d.models).toHaveLength(63);
    expect(d.models.find((m) => m.model === 'm16a2UI')!.decoded.vertices).toBe(422);
    expect(d.modelTextures).toHaveLength(55);
    expect(d.modelTextures.map(([n]) => n)).toContain('m16.tif');
    expect(d.light!.ambient.map((v) => Number(v.toFixed(4)))).toEqual([0.5569, 0.5569, 0.5569]);
    expect(d.light!.colours[0]!.map((v) => Number(v.toFixed(2)))).toEqual([0.8, 0.8, 0.8]);
  });

  it('decodes every bitmap the layout names from the first library that holds it, the portraits and the atlases', async () => {
    const d = await data();
    const size = new Map(d.bitmaps.map(([n, r]) => [n, `${r.width}x${r.height}`]));
    // The layout's 16 names, the 8 portraits, the 3 atlases, the popups' panel (`ARMORY_POPUP_BITMAP`, UIMP) and its buttons' two (`ARMORY_POPUP_BUTTON_BITMAPS`).
    expect(d.bitmaps).toHaveLength(30);
    expect(size.has('popupop.tif')).toBe(true);
    for (const b of ['active_back.tif', 'pop_butt.tif']) expect(size.has(b), b).toBe(true);
    expect([size.get('multplay_back.tif'), size.get('padlock.tif'), size.get('blue_fill.tif'), size.get('locked.tif')]).toEqual(['512x512', '32x32', '8x8', '128x256']);
    expect([size.get('seal1_scuba.tif'), size.get('terr4_mp2.tif')]).toEqual(['128x256', '128x256']);
    expect([size.get('font_titlebar_01.tif'), size.get('font_text_01.tif'), size.get('font_special_01.tif')]).toEqual(['512x512', '512x128', '256x64']);
  });

  it("reads the match's world when asked (the game lobby's page has no map loaded): zweapon.rdr's arsenal and mission.rdr's valves", async () => {
    expect((await data()).world).toBeUndefined();                                  // the test room's: its match has them
    const d = await armoryFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2', { models: false, world: true });
    expect(d.models).toEqual([]);
    expect(d.world!.arsenal.items.get(57)?.model).toBe('sig_commando');
    expect(d.world!.valves.get('Enable_m4Acarbine')).toBeGreaterThan(0);
    expect(armoryTransferables(d).length).toBeGreaterThan(0);
  });

  it('hands over each mesh and bitmap buffer once', async () => {
    const d = await data();
    const buffers = armoryTransferables(d);
    expect(new Set(buffers).size).toBe(buffers.length);
    expect(buffers.length).toBeGreaterThan(d.bitmaps.length + d.modelTextures.length);
  });
});

/**
 * The disc page's reader (W5.R3): the same files packed into an ISO in memory -- never onto disk -- and read through
 * `IsoAssetSource` give the same data, the map archive and `READERC.ZAR` read by range, never whole.
 */
const ISO_PATHS = [
  'RUN/UI/JUNK_TXR.ZED',
  'RUN/MP2.ZDB', 'RUN/READERC.ZAR', 'RUN/ZWEAPON.ZAR', 'RUN/UIZANIM.ZAR', 'RUN/UI/READERC.ZAR', 'RUN/UI/UI.ZED', 'RUN/UI/UI_GEO.ZED',
  'RUN/UI/UI_MDL.ZED', 'RUN/UI/UI_TXR.ZED', 'RUN/UI/UI_PAL.ZED', 'RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED', 'RUN/LOCALE/STATES/UIMNLOC.ZAR',
];
const isoPresent = ISO_PATHS.every((p) => existsSync(resolve(FIXTURES, p)));

describe.skipIf(!isoPresent)(`armoryFromDisc over a disc image${isoPresent ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('reads what the served tree gives, the map archive and READERC.ZAR by range only', async () => {
    const fs = new FsAssetSource(FIXTURES);
    const iso = new IsoAssetSource(new Blob([buildIso(await Promise.all(ISO_PATHS.map(async (path) => ({ path, bytes: await fs.read(path) }))))]));
    const whole = vi.spyOn(iso, 'read');
    const d = await armoryFromDisc(iso, 'RUN/MP2.ZDB', 'MP2');
    expect(d.missing).toEqual([]);
    expect([d.layout!.objects.length, d.items.length, d.strings.length, d.models.length, d.bitmaps.length, d.roster!.characters.length]).toEqual([226, 70, 1411, 63, 30, 8]);
    const wholeReads = whole.mock.calls.map((c) => c[0]);
    expect(wholeReads).not.toContain('RUN/MP2.ZDB');
    expect(wholeReads).not.toContain('RUN/READERC.ZAR');
    expect(wholeReads).not.toContain('RUN/UI/READERC.ZAR');
  }, 60_000);
});
