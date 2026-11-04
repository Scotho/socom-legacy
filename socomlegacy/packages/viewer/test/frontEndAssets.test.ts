import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { dialogLookup, loadDialog, type DialogDesign } from '@s2u/ui';
import { libraryStem } from '../src/menuArt';
import {
  FRONT_END_BANKS_ABSENT, FRONT_END_BANKS_ELSEWHERE, FRONT_END_BANKS_NOT_LOADED, FRONT_END_FONT_MAP, FRONT_END_LAZY_TEXTURE_STEMS, FRONT_END_TEXTURE_STEMS, MISSING_UI_LIBRARY_READING, UI_TEXTURE_BANKS_READING,
  captionTextOf, dialogTextureStems, pageCaptions, pageUiTextures,
} from '../src/frontEndAssets';

/**
 * ONL-01 (web research 144 §5): the page's bitmaps and captions for the front end -- the loose `RUN/UI/<STEM>_TXR.ZED`
 * banks the dialogs' `LIBRARIES` name and a map's `FONT_TXR`, loaded from the served tree, and PLAT-04's caption
 * tables. The CI half uses a source with nothing; the dev-disc half reads the disc (`SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`) and skips without it.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && ['RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UICG_TXR.ZED', 'RUN/UI/UIOP_TXR.ZED', 'RUN/UI/READERC.ZAR', 'RUN/MP2.ZDB', 'RUN/LOCALE/STATES/UIMNLOC.ZAR'].every((f) => existsSync(join(DISC, f)));

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
/** The dialogs' layouts: the disc's, else the committed fixture's (`RUN/UI/READERC.ZAR`, a byte copy). */
const READERC = [DISC, FIXTURES].map((root) => (root === '' ? '' : join(root, 'RUN/UI/READERC.ZAR'))).find((p) => p !== '' && existsSync(p)) ?? null;
/** The default maps (OT.R16's three and OT.R45's fourth): MP2 Frostfire, MP7 Night Stalker, MP51 Vigilance, MP72 Crossroads. */
const FIRST_RELEASE_PICTURES = ['mp2MissPic.tif', 'mp7MissPic.tif', 'mp51MissPic.tif', 'mp72MissPic.tif'];

const none: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };

describe('pageUiTextures and pageCaptions without a tree', () => {
  it('names the banks the path\'s dialogs use and the font map', () => {
    expect(UI_TEXTURE_BANKS_READING).toBe('the LIBRARIES stem\'s loose bank, then a map\'s FONT_TXR');
    expect(FRONT_END_TEXTURE_STEMS).toEqual(['UIMP', 'UI2D', 'UIBF', 'UISK', 'UICG']);   // UISK: the soft keyboard's, loaded by the menu state itself (ONL-06, research 153 §4); UICG: CREATE GAME's map pictures (research 164 R164.6)
    expect(FRONT_END_FONT_MAP).toBe('RUN/MP2.ZDB');
  });

  it.skipIf(READERC === null)("every bank CREATE GAME's LIBRARIES name is one the page loads (dlgCreateGame.rdr: uimp, uicg -- the PLAY LIST's map pictures)", () => {
    const design = dialogLookup([Zar.parse(new Uint8Array(readFileSync(READERC!)))])('dlgCreateGame.rdr')!;
    const stems = design.libraries.flatMap((l) => ('name' in l ? [libraryStem(l.name)] : []));
    expect(stems).toEqual(['UIMP', 'UICG']);
    for (const stem of stems) expect(FRONT_END_TEXTURE_STEMS, stem).toContain(stem);
  });

  it("captionTextOf: a `_NNN_..._MSG` name through the tables, for the soft keyboard" + "'s title (ONL-06); null for a literal, an unknown name or no tables", () => {
    const captions = { caption: (c: string) => (c === '_455_EnterPlayerName_MSG' ? { kind: 'loc' as const, id: 455, table: 'UIMn', text: 'Enter Player Name' } : { kind: 'literal' as const, text: c }) };
    expect(captionTextOf(captions)('_455_EnterPlayerName_MSG')).toBe('Enter Player Name');
    expect(captionTextOf(captions)('Enter')).toBeNull();
    expect(captionTextOf(null)('_455_EnterPlayerName_MSG')).toBeNull();
  });

  it('a bank that will not read is named, and every lookup answers null; nothing throws', async () => {
    const t = pageUiTextures(none);
    expect(t.textures('multplay_back.tif')).toBeNull();
    const missing = await t.ready;
    expect(missing).toHaveLength(FRONT_END_TEXTURE_STEMS.length + 1);
    expect(missing[0]).toMatch(/^RUN\/UI\/UIMP_TXR\.ZED: no /);
    expect(missing.at(-1)).toMatch(/^RUN\/MP2\.ZDB:FONT_TXR\.ZED: /);
    expect(t.textures('multplay_back.tif')).toBeNull();
  });

  it('FE-SWEEP: a lazy bank is read when a dialog naming it is built (need), once; an eager or unlisted stem is never read by need', async () => {
    expect(FRONT_END_LAZY_TEXTURE_STEMS).toEqual(['UIOP']);             // the OPTIONS pages' bank: a deep link today, OPT-09's menu later
    const reads: string[] = [];
    const counting: AssetSource = { list: async () => [], read: async (p) => { reads.push(p); throw new Error(`no ${p}`); } };
    const t = pageUiTextures(counting, ['UIMP'], null);
    await t.ready;
    expect(reads).toEqual(['RUN/UI/UIMP_TXR.ZED', 'RUN/UI/UIMP_PAL.ZED']);    // nothing lazy at the start
    reads.length = 0;
    const lib = (...names: string[]): Pick<DialogDesign, 'libraries'> => ({ libraries: names.map((name) => ({ name })) });
    expect(await t.need(lib('ui/assetlib/ui2d', 'ui/assetlib/uiop'))).toEqual(['RUN/UI/UIOP_TXR.ZED: no RUN/UI/UIOP_TXR.ZED']);
    expect(reads).toEqual(['RUN/UI/UIOP_TXR.ZED', 'RUN/UI/UIOP_PAL.ZED']);    // UIOP alone: UI2D is not the lazy set
    reads.length = 0;
    await t.need(lib('ui/assetlib/uimp', 'ui/assetlib/uigc', 'ui/assetlib/uici'));
    expect(reads).toEqual([]);                                           // an eager, a later or an absent stem: never
    expect(dialogTextureStems({ libraries: [{ name: 'ui/assetlib/mm/uimm' }, { uivar: 'EQUIPMENT_LIBRARY' }, { name: 'common/assetlib/spmp' }] })).toEqual(['UIMM', 'SPMP']);
  });

  it('FE-SWEEP review: a lazy bank whose read failed is read again at the next build that needs it; never twice while one read is in flight', async () => {
    const reads: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const failing: AssetSource = { list: async () => [], read: async (p) => { reads.push(p); await gate; throw new Error(`no ${p}`); } };
    const t = pageUiTextures(failing, [], null);
    const lib = { libraries: [{ name: 'ui/assetlib/uiop' }] };
    const first = t.need(lib), second = t.need(lib);                     // two builds while the read is out
    release();
    expect(await first).toHaveLength(1);
    expect(await second).toEqual([]);
    expect(reads).toEqual(['RUN/UI/UIOP_TXR.ZED', 'RUN/UI/UIOP_PAL.ZED']);    // one read in flight, not two
    expect(await t.need(lib)).toHaveLength(1);                           // failed: asked again
    expect(reads).toHaveLength(4);
  });

  it.skipIf(READERC === null)("FE-SWEEP: every bank every dialog's LIBRARIES name is loaded by the page (eagerly or lazily) or listed with why not", () => {
    expect(MISSING_UI_LIBRARY_READING).toMatch(/nothing/);
    const archives = [READERC!, ...(DISC ? [join(DISC, 'RUN/UI/READERX.ZAR')] : [])].filter((p) => existsSync(p));
    const loaded = new Set([...FRONT_END_TEXTURE_STEMS, ...FRONT_END_LAZY_TEXTURE_STEMS]);
    const named = new Map<string, Set<string>>();
    for (const path of archives) {
      const z = Zar.parse(new Uint8Array(readFileSync(path)));
      for (const k of z.root.children) {
        for (const stem of dialogTextureStems(loadDialog(parseRdr(z.data(k))))) {
          if (!named.has(stem)) named.set(stem, new Set());
          named.get(stem)!.add(k.name);
        }
      }
    }
    const unlisted = [...named.keys()].filter((s) => !loaded.has(s) && !(s in FRONT_END_BANKS_NOT_LOADED));
    expect(unlisted, 'a dialog names a bank the page neither loads nor lists (frontEndAssets.ts FRONT_END_BANKS_NOT_LOADED)').toEqual([]);
    for (const s of loaded) expect(FRONT_END_BANKS_NOT_LOADED[s], s).toBeUndefined();
    // Every bank a reachable dialog names is loaded at the start, loaded lazily, read by a named module that names it, or on
    // no file of the disc. Reachable: every dialog the page's sources name (packages/ui and packages/viewer), but research
    // 114's three that no flow reaches, plus the OPTIONS pages (a deep link today; OPT-09's menu). Hand-derived: the
    // dialogs' own switch references are not followed (from dlgMenu they lead to the campaign, behind MENU-03's hooks).
    const lower = new Map([...archives.flatMap((path) => Zar.parse(new Uint8Array(readFileSync(path))).root.children.map((k) => k.name))].map((n) => [n.toLowerCase(), n]));
    const UNPLACED = new Set(['dlgexitstate.rdr', 'dlghype.rdr', 'dlgsticksetup.rdr']);   // research 114
    const OPTIONS = ['dlgOptions_Menu.rdr', 'dlgOptions_Audio.rdr', 'dlgOptions_Video.rdr', 'dlgControllerPresets.rdr', 'dlgControllerPresetsCS.rdr', 'dlgControllerPresetsRG.rdr', 'dlgControllerPresetsNewGame.rdr', 'dlgControllerSelection.rdr'];
    const mentioned = new Set<string>();
    for (const dir of ['../ui/src', 'src'].map((d) => resolve(import.meta.dirname, '..', d))) {
      for (const f of readdirSync(dir, { recursive: true }) as string[]) {
        if (!f.endsWith('.ts')) continue;
        for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/dlg[A-Za-z0-9_]+\.rdr/g)) mentioned.add(m[0].toLowerCase());
      }
    }
    const reachable = [...mentioned].filter((n) => !UNPLACED.has(n) && lower.has(n)).map((n) => lower.get(n)!);
    if (archives.length === 2) expect(reachable.length).toBeGreaterThanOrEqual(40);
    reachable.push(...OPTIONS.filter((n) => lower.has(n.toLowerCase())));
    const served = new Set([...loaded, ...Object.keys(FRONT_END_BANKS_ELSEWHERE), ...FRONT_END_BANKS_ABSENT]);
    for (const d of reachable) for (const [s, ds] of named) if (ds.has(d)) expect(served.has(s), `${d} names ${s}, which nothing loads`).toBe(true);
    const root = resolve(import.meta.dirname, '../../..');
    for (const [s, module] of Object.entries(FRONT_END_BANKS_ELSEWHERE)) {
      expect(FRONT_END_BANKS_NOT_LOADED[s], s).toMatch(/^elsewhere/);
      expect(existsSync(join(root, module)), module).toBe(true);
      expect(readFileSync(join(root, module), 'utf8'), `${module} names ${s}`).toContain(s);
    }
    for (const s of FRONT_END_BANKS_ABSENT) expect(FRONT_END_BANKS_NOT_LOADED[s], s).toMatch(/^absent/);
    for (const [s, why] of Object.entries(FRONT_END_BANKS_NOT_LOADED)) {
      if (why.startsWith('elsewhere')) expect(FRONT_END_BANKS_ELSEWHERE[s], s).toBeDefined();
      if (why.startsWith('absent')) expect(FRONT_END_BANKS_ABSENT, s).toContain(s);
    }
    expect([...named.get('WSLC')!].sort()).toEqual(['dlg_CharUnlock.rdr', 'dlg_equipment_mp.rdr']);
    expect(FRONT_END_BANKS_NOT_LOADED.WSLC).toContain('dlg_CharUnlock');
    expect([...named.get('UIOP')!].sort()).toEqual(['dlgControllerPresets.rdr', 'dlgControllerPresetsCS.rdr', 'dlgControllerPresetsNewGame.rdr', 'dlgControllerPresetsRG.rdr', 'dlgControllerSelection.rdr', 'dlgOptions_Audio.rdr', 'dlgOptions_Menu.rdr', 'dlgOptions_Video.rdr']);
    expect([...named.get('UICI')!]).toEqual(['dlgCreateClan.rdr']);
  });

  it('no caption tables: null, with the reasons', async () => {
    const missing: string[] = [];
    expect(await pageCaptions(none, missing)).toBeNull();
    expect(missing.length).toBeGreaterThanOrEqual(4);
  });
});

describe.skipIf(!HAVE_DISC)(`over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('LOGIN\'s bitmaps come from UIMP and the text face\'s atlas from the map\'s FONT_TXR; a name no bank holds is null', async () => {
    const t = pageUiTextures(new FsAssetSource(DISC), ['UIMP']);
    expect(await t.ready).toEqual([]);
    const back = t.textures('multplay_back.tif');
    expect(back && [back.width, back.height]).toEqual([512, 512]);
    expect(t.textures('brown_back.tif')).not.toBeNull();
    expect(t.textures('font_text_01.tif')).not.toBeNull();
    expect(t.textures('FONT_TEXT_01.TIF')).toBe(t.textures('font_text_01.tif'));          // case-folded, cached
    expect(t.textures('no_such.tif')).toBeNull();
  });

  it("the page's default banks hold CREATE GAME's pictures of the four default maps (UICG: mp2, mp7, mp51, mp72MissPic.tif); no other bank does", async () => {
    const t = pageUiTextures(new FsAssetSource(DISC));
    expect(await t.ready).toEqual([]);
    for (const name of FIRST_RELEASE_PICTURES) {
      const got = t.textures(name);
      expect(got, name).not.toBeNull();
      expect(got!.width * got!.height, name).toBeGreaterThan(0);
    }
    const others = pageUiTextures(new FsAssetSource(DISC), FRONT_END_TEXTURE_STEMS.filter((s) => s !== 'UICG'), null);
    await others.ready;
    expect(FIRST_RELEASE_PICTURES.map((n) => others.textures(n))).toEqual([null, null, null, null]);
  });

  it("FE-SWEEP: the loaded and lazy banks are loose files; the two listed absent are not, and dlgCreateClan's bitmaps all resolve without its uici", async () => {
    for (const s of [...FRONT_END_TEXTURE_STEMS, ...FRONT_END_LAZY_TEXTURE_STEMS]) expect(existsSync(join(DISC, `RUN/UI/${s}_TXR.ZED`)), s).toBe(true);
    const absent = [...FRONT_END_BANKS_ABSENT];
    expect(absent.sort()).toEqual(['HYPE', 'UICI']);
    for (const s of absent) for (const dir of ['RUN/UI', 'RUN/COMMON']) expect(existsSync(join(DISC, `${dir}/${s}_TXR.ZED`)), `${dir}/${s}`).toBe(false);
    const t = pageUiTextures(new FsAssetSource(DISC));
    expect(await t.ready).toEqual([]);
    const z = Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN/UI/READERC.ZAR'))));
    const tifs = (n: unknown, out = new Set<string>()): Set<string> => { if (typeof n === 'string') { if (/\.tif$/i.test(n)) out.add(n); } else if (Array.isArray(n)) for (const c of n) tifs(c, out); return out; };
    const clan = [...tifs(parseRdr(z.data(z.find('dlgCreateClan.rdr')!)))];
    expect(clan).toHaveLength(11);
    expect(clan.filter((n) => t.textures(n) === null)).toEqual([]);                    // all in UIMP (the medals, NetMonY/B, the backs)
  });

  it("FE-SWEEP: OPTIONS' bitmaps come with UIOP once its dialog is built (need), and only then", async () => {
    const t = pageUiTextures(new FsAssetSource(DISC));
    await t.ready;
    expect(t.textures('op_slider.tif')).toBeNull();
    const audio = dialogLookup([Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN/UI/READERC.ZAR'))))])('dlgOptions_Audio.rdr')!;
    expect(await t.need(audio)).toEqual([]);
    for (const n of ['op_slider.tif', 'op_knob.tif']) expect(t.textures(n), n).not.toBeNull();
  });

  it('the captions resolve LOGIN\'s ids to the tables\' text', async () => {
    const missing: string[] = [];
    const c = (await pageCaptions(new FsAssetSource(DISC), missing))!;
    expect(missing).toEqual([]);
    expect(c.caption('_561_LOGIN_MSG')).toMatchObject({ kind: 'loc', id: 561, text: 'LOGIN' });
    expect(c.caption('_560_Hardware_MSG')).toMatchObject({ kind: 'loc', id: 560 });
  });
});
