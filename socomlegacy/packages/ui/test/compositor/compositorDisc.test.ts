import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { buildDialogScreen, composeScreen, loadDialog, readTextFaces, type UiNode } from '../../src/index';

/**
 * PLAT-14's dev-disc checks (web research 112 §7): every dialog of `RUN/UI/READERC.ZAR` (110) and `RUN/UI/READERX.ZAR`
 * (4) builds into the screen's tree and composes a draw list, its captions through PLAT-04's `LocService` and its
 * faces from `fonts.rdr`; the main menu and the options menu stand as the build makes them. Names and counts only.
 *
 * The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither (CI) every test skips.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, FONTS_RDR.archive))) ?? null;
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(DISC ?? '', p)));
const tree = (n: UiNode): string => (n.children.length ? `${n.name}(${n.children.map(tree).join(' ')})` : n.name);

describe.skipIf(DISC === null)(`the compositor over the disc's dialogs${DISC === null ? ' (no SOCOM_DISC / SOCOM_PC_ROOT)' : ''}`, () => {
  const setup = async () => {
    const fz = Zar.parse(read(FONTS_RDR.archive));
    const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
    const { service } = await loadLocService(new FsAssetSource(DISC ?? ''), 'RUN/MP2.ZDB');
    return { face: (n: string) => faces.find((f) => f.name === n) ?? null, captions: service };
  };

  it('builds and composes all 114, nothing thrown; nine movie layers, 94 background images', async () => {
    const o = await setup();
    let dialogs = 0, nodes = 0, movies = 0, backgrounds = 0;
    const kinds: Record<string, number> = {}, widgets: Record<string, number> = {};
    for (const archive of ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR']) {
      const z = Zar.parse(read(archive));
      for (const k of z.root.children) {
        dialogs++;
        const s = buildDialogScreen(loadDialog(parseRdr(z.data(k))), o);
        const count = (n: UiNode): number => n.children.reduce((a, c) => a + 1 + count(c), 0);
        nodes += count(s.backplane);
        if (s.movie) movies++;
        if (s.background) backgrounds++;
        const items = composeScreen(s);
        expect(items[0]!.kind).toBe('clear');
        expect(items.filter((i) => i.kind === 'models')).toHaveLength(1);
        for (const it of items) kinds[it.kind] = (kinds[it.kind] ?? 0) + 1;
        for (const it of items) if (it.kind === 'widget') widgets[it.record.widget.type] = (widgets[it.record.widget.type] ?? 0) + 1;
      }
    }
    expect([dialogs, nodes, movies, backgrounds]).toEqual([114, 4368, 9, 94]);
    expect(kinds).toEqual({ clear: 114, models: 114, movie: 9, sprite: 2320, glyphs: 947, widget: 477 });
    // The undrawn `widget` items by type (PLAT-15's set, research 112 §6): eight types, not only BUTTON and LISTBOX.
    expect(widgets).toEqual({ BUTTON: 298, LISTBOX: 66, CHECKBOX: 42, MAPCONTROL: 36, RADIOSTRIP: 18, SLIDERBAR: 8, COUNTER: 8, PROGRESSBAR: 1 });
  });

  it('dlgMenu: the movie under the controls, the objects after them, CHILDOF children under their parents', async () => {
    const z = Zar.parse(read('RUN/UI/READERC.ZAR'));
    const s = buildDialogScreen(loadDialog(parseRdr(z.data(z.find('dlgMenu.rdr')!))), await setup());
    expect(tree(s.backplane)).toBe(
      'CGameMenu backplane(new_game_button load_game_button multiplayer_button options_button Extras_button LAN_button LoadGameBack ' +
      'SplashLogo LEGALEZE(LEGALEZE1 VERSION) arrow_up(arrow_dwn) SavedGames(SavedGameWarning InfoTextT InfoTextX))',
    );
    expect(tree(s.foreplane)).toBe('CGameMenu foreplane(MENUFADER POPUP)');
    expect(composeScreen(s).map((i) => ('node' in i ? `${i.kind}:${i.node}` : i.kind)).join(' ')).toBe(
      'clear movie widget:new_game_button widget:load_game_button widget:multiplayer_button widget:options_button widget:Extras_button ' +
      'widget:LAN_button sprite:LoadGameBack sprite:SplashLogo glyphs:LEGALEZE glyphs:LEGALEZE1 sprite:arrow_up sprite:arrow_dwn ' +
      'widget:SavedGames glyphs:SavedGameWarning glyphs:InfoTextT glyphs:InfoTextX models sprite:MENUFADER',
    );
  });

  it('dlgOptions_Menu: its background first; HDDOnOff\'s own CHILDOF finds nothing yet (backplane), its checkboxes under it', async () => {
    const z = Zar.parse(read('RUN/UI/READERC.ZAR'));
    const s = buildDialogScreen(loadDialog(parseRdr(z.data(z.find('dlgOptions_Menu.rdr')!))), await setup());
    expect(tree(s.backplane)).toBe(
      'CGameMenu backplane(background AudioOpBtn VideoOpBtn ControlOpBtn ControlPresetBtn HDDOnOff(HDD_On HDD_Off) SaveAndLeaveBtn ' +
      'eq_title_back eq_Lower_back bar_title InfoTextT InfoTextX InfoWin instText)',
    );
  });
});
