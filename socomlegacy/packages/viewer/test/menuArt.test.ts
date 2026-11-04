import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { UI_TICK_SECONDS, type DialogDesign } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc, type FrontEndDisc } from '../src/frontEnd';
import { FONT_LIBRARY, UI_MODEL_TEXTURES, libraryStem, readMenuArt, withMenuArt } from '../src/menuArt';

/**
 * The front end's art off the disc (MENU-02a; web research 140 §4): the dialog's libraries resolved as the engine
 * resolves them, the font library, the UI models and their textures, the strings. CI: the stem rule and a source that
 * has nothing (everything named missing, the front end still runs). Dev disc: the main menu's bitmaps, `mainmenu_roller`
 * and its twelve textures found, the captions resolved, the page's session drawing with them.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && ['RUN/UI/READERC.ZAR', 'RUN/UI/UI2D_TXR.ZED', 'RUN/UI/UI_GEO.ZED', 'RUN/COMMON/FONT_TXR.ZED'].every((f) => existsSync(join(DISC, f)));

const design = (over: Partial<DialogDesign> = {}): DialogDesign => ({
  libraries: [{ name: 'ui/assetlib/ui2d' }, { name: 'ui/assetlib/uibf' }], usesMemcard: true, font: 'font_text_01', fontLib: true, background: null,
  bindings: [], controls: [], objects: [], scripts: [], models: [{ name: 'Roller', model: 'mainmenu_roller', azimuth: 0, elev: -12.5, distance: 60, rot: 0, useModelUiVar: false }], dropped: [], ...over,
});
const nothing: AssetSource = { read: async (p: string) => { throw new Error(`no ${p}`); } } as unknown as AssetSource;

describe('readMenuArt (CI)', () => {
  it('resolves an asset library path to its file stem as FUN_003199c0 does: the last segment, four characters, upper-cased', () => {
    expect(libraryStem('ui/assetlib/ui2d')).toBe('UI2D');
    expect(libraryStem('ui/assetlib/uibf')).toBe('UIBF');
    expect(libraryStem('ui\\assetlib\\ld\\om02')).toBe('OM02');
    expect(libraryStem('common/assetlib/loading')).toBe('LOAD');
    expect(FONT_LIBRARY).toEqual({ txr: 'RUN/COMMON/FONT_TXR.ZED', pal: 'RUN/COMMON/FONT_PAL.ZED' });
    expect(UI_MODEL_TEXTURES).toEqual({ txr: 'RUN/UI/UI_TXR.ZED', pal: 'RUN/UI/UI_PAL.ZED' });
  });
  it('a source with nothing: every library and the models named missing, the textures null, the models null -- never a throw', async () => {
    const art = await readMenuArt(nothing, [design()]);
    expect(art.libraries).toEqual([]);
    expect(art.textures('SplashLogo.tif')).toBeNull();
    expect(art.model('mainmenu_roller')).toBeNull();
    expect(art.missing.filter((m) => /UI2D_TXR|UIBF_TXR|FONT_TXR|UI_GEO/.test(m)).length).toBe(4);
  });
  it('withMenuArt keeps the disc\'s fields and adds art; the session takes the art\'s textures and models', async () => {
    const disc: FrontEndDisc = { dialog: (n) => (n === 'dlgMenu.rdr' ? design() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] };
    const withArt = await withMenuArt(nothing, disc);
    expect(withArt.art).toBeDefined();
    expect(withArt.dialog).toBe(disc.dialog);
    const s = new FrontEndSession({ disc: withArt, startDialog: 'dlgMenu.rdr', loader: false });
    for (let i = 1; i <= 3; i++) s.advance(i * UI_TICK_SECONDS * 1000);
    expect(s.machine.shell()!.screen.models).toEqual([]);           // no geometry: no entry made (FUN_00317c20's null)
  });
});

describe.skipIf(!HAVE_DISC)(`the main menu's art over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('reads UI2D, UIBF, FONT and UI: the logo, the arrows, the font atlas, the roller\'s twelve quads and their textures', async () => {
    const src = new FsAssetSource(DISC);
    const art = await readMenuArt(src, [design()]);
    expect(art.libraries).toEqual(['UI2D', 'UIBF', 'FONT', 'UI']);
    expect(art.missing).toEqual([]);
    for (const n of ['SplashLogo.tif', 'arrow_top.tif', 'arrow_botm.tif', 'popup_bg.tif', 'font_text_01.tif', 'menu_newgame_on.tif']) expect(art.textures(n), n).not.toBeNull();
    expect(art.textures('SplashLogo.tif')!.width).toBe(512);
    expect(art.textures('menu_newgame_on.tif')!.height).toBe(32);
    expect(art.textures('nothing.tif')).toBeNull();
    const roller = art.model('mainmenu_roller')!;
    expect(roller.parts.map((p) => p.node)).toEqual(['new_on', 'new_off', 'load_on', 'load_off', 'online_on', 'online_off', 'lan_on', 'lan_off', 'options_on', 'options_off', 'extras_on', 'extras_off']);
    expect(roller.parts.every((p) => p.meshes.length === 1 && p.meshes[0]!.indices.length === 6 && p.meshes[0]!.cull)).toBe(true);
    expect(roller.parts.map((p) => p.meshes[0]!.texture)).toEqual(['menu_newgame_on.tif', 'menu_newgame_off.tif', 'menu_loadgame_on.tif', 'menu_loadgame_off.tif', 'menu_online_on.tif', 'menu_online_off.tif', 'menu_LAN_on.tif', 'menu_LAN_off.tif', 'menu_options_on.tif', 'menu_options_off.tif', 'menu_extras_on.tif', 'menu_extras_off.tif']);
    expect(art.model('absent')).toBeNull();
  }, 60_000);

  it('withMenuArt on the disc: the captions resolve the legalese, the session draws dlgMenu with no bitmap, glyph or model undrawn', async () => {
    const src = new FsAssetSource(DISC);
    const disc = await withMenuArt(src, await readFrontEndDisc(src));
    expect(disc.missing.filter((m) => !/UILd/i.test(m))).toEqual([]);
    expect(disc.captions?.caption('_507_DevelopedZipper_MSG')).toMatchObject({ kind: 'loc', text: 'Developed by Zipper Interactive, Inc.' });
    const s = new FrontEndSession({ disc, startDialog: 'dlgMenu.rdr', loader: false });
    let now = 0;
    for (let i = 0; i < 40; i++) { now += UI_TICK_SECONDS * 1000; s.advance(now); }
    const put: number[][] = [];
    const r = s.render({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img) => { put.push([img.width, img.height]); } });
    expect(r.undrawn).toEqual([]);
    expect(put).toEqual([[640, 448]]);
    expect(s.machine.shell()!.screen.models.map((m) => m.root.name)).toEqual(['Roller']);
    expect(s.uiVars.find('VERSION_STRING')?.value).toEqual({ type: 'string', value: 'SOCOM 2 r0001 17:22:21 Oct 11 2003' });
  }, 60_000);
});
