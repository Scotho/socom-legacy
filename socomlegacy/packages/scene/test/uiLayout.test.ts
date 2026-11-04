import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { ARMORY_LAYOUT, findKey, parseUiLayout, type UiLayout } from '../src/index';

/**
 * A dialog's layout (web sprint 5, S1; socomlegacy/docs/research/95 §2): a hand-built `SCREENS` record in the shape the
 * disc's dialogs take, then the ARMORY's own `RUN/UI/READERC.ZAR/dlg_equipment_mp.rdr` (fixture-backed).
 */

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const synthetic: RdrNode = [[
  'SCREENS', [
    'LIBRARIES', ['ui/assetlib/uimp', 'ui/assetlib/wsmp'],
    'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['multplay_back.tif']],
    'FONT', ['font_text_01'],
    'SCRIPT_LIBRARY', ['dlg_x.rdr', 'ShowAndSpin.rdr'],
    'OBJECTS', [
      obj('NAME', ['title'], 'TYPE', ['TEXT'], 'XPOS', ['30'], 'YPOS', ['65'], 'SPEC', ['FONT', ['font_titlebar_01'], 'COLOR', ['83', '72', '36'], 'SCALE', ['0.95'], 'CAPTION', ['_15_ARMORY_MSG']]),
      obj('NAME', ['pane'], 'TYPE', ['IMAGE'], 'XPOS', ['-5'], 'YPOS', ['20'], 'OPACITY', ['0.7'], 'SPEC', ['CHILDOF', ['title'], 'FILENAME', ['brown_back_real.tif'], 'SIZE', ['165', '21']]),
      // CHILDOF outside SPEC (the `SealNSecText` rows), XSIZE/YSIZE, a UIVAR, HCENTERED, a blank FILENAME.
      obj('NAME', ['text'], 'TYPE', ['TEXT'], 'XPOS', ['8'], 'YPOS', ['43'], 'CHILDOF', ['pane'], 'SPEC', ['UIVAR', ['NAME', ['Char1SecondaryWeaponDescr']], 'HCENTERED', [], 'FILENAME', [' '], 'XSIZE', ['15'], 'YSIZE', ['16']]),
    ],
    'ANIMATIONS', [obj('EVENT', ['ONSTART'], 'ANIMATION', ['UnlockMPChar']), obj('BUTTON', ['TRIANGLE'], 'ANIMATION', ['returnto_lobby'])],
    'CONTROLS', [
      obj('NAME', ['EquipWeaponBtn'], 'TYPE', ['BUTTON'], 'SPEC', ['ANIMATIONS', [obj('BUTTON', ['SQUARE'], 'ANIMATION', ['StoringLoadout'])]]),
    ],
    'MODELS', [obj('NAME', ['EquipM16'], 'MODEL', ['m16a2UI'], 'AZIMUTH', ['10.7'], 'ELEV', ['3'], 'DISTANCE', ['27']), obj('NAME', ['EquipX'], 'MODEL', ['xUI'])],
  ],
]];

describe('parseUiLayout on a hand-built dialog (research 95 §2.1)', () => {
  const l = parseUiLayout(synthetic);

  it('reads the header: libraries, background, font, script sets', () => {
    expect([l.libraries, l.background, l.font, l.scripts]).toEqual([['ui/assetlib/uimp', 'ui/assetlib/wsmp'], 'multplay_back.tif', 'font_text_01', ['dlg_x.rdr', 'ShowAndSpin.rdr']]);
  });

  it('types an object\'s fields, CHILDOF found in SPEC or at object level, sizes from SIZE or XSIZE/YSIZE', () => {
    const [title, pane, text] = l.objects as [UiLayout['objects'][0], UiLayout['objects'][0], UiLayout['objects'][0]];
    expect(title).toMatchObject({ name: 'title', type: 'TEXT', x: 30, y: 65, opacity: 1, parent: null, font: 'font_titlebar_01', color: [83, 72, 36], scale: 0.95, caption: '_15_ARMORY_MSG' });
    expect(pane).toMatchObject({ x: -5, y: 20, opacity: 0.7, parent: 'title', filename: 'brown_back_real.tif', size: [165, 21] });
    expect(text).toMatchObject({ parent: 'pane', uivar: 'Char1SecondaryWeaponDescr', hcentered: true, filename: null, size: [15, 16] });
  });

  it('reads the screen bindings, a control\'s bindings and the MODELS entries (DISTANCE defaults to 20)', () => {
    expect(l.animations).toEqual([{ event: 'ONSTART', button: null, animation: 'UnlockMPChar' }, { event: null, button: 'TRIANGLE', animation: 'returnto_lobby' }]);
    expect(l.controls[0]!.bindings).toEqual([{ event: null, button: 'SQUARE', animation: 'StoringLoadout' }]);
    expect(l.models).toEqual([
      { name: 'EquipM16', model: 'm16a2UI', azimuth: 10.7, elev: 3, distance: 27 },
      { name: 'EquipX', model: 'xUI', azimuth: 0, elev: 0, distance: 20 },
    ]);
  });

  it('finds a key depth-first, first match (FUN_0032f0e0), and refuses a file with no SCREENS', () => {
    expect(findKey(synthetic, 'CHILDOF')).toBe('title');
    expect(findKey(synthetic, 'NOPE')).toBeUndefined();
    expect(() => parseUiLayout([['OTHER', []]])).toThrow(/SCREENS/);
  });
});

const UI = fixture(ARMORY_LAYOUT.archive);

describe.skipIf(UI === null)(`the ARMORY's layout, dlg_equipment_mp.rdr${UI === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const layout = (): UiLayout => {
    const zar = Zar.parse(UI!);
    return parseUiLayout(parseRdr(zar.data(zar.find(ARMORY_LAYOUT.member)!)));
  };
  const find = (l: UiLayout, name: string) => [...l.objects, ...l.controls].find((o) => o.name === name)!;

  it('holds 226 objects, 12 screen bindings, 22 controls and 67 model entries (R95.2)', () => {
    const l = layout();
    expect([l.objects.length, l.animations.length, l.controls.length, l.models.length]).toEqual([226, 12, 22, 67]);
    expect(l.libraries).toEqual(['ui/assetlib/uimp', 'ui/assetlib/wsmp', 'ui/assetlib/wslc', 'UIVAR', 'EQUIPMENT_LIBRARY']);
    expect(l.background).toBe('multplay_back.tif');
    expect(l.scripts).toEqual(['dlg_equipment_mp.rdr', 'UICharacterProfile.rdr', 'ShowAndSpin.rdr', 'uianim.rdr', 'UIHardDiskAnim.rdr']);
    expect(l.animations.filter((a) => a.event === 'ONSTART').map((a) => a.animation)).toEqual(['UnlockMPChar', 'OnlyModes', 'UiEquipSwitch', 'MPSealPlace', 'MPTypeValveSet', 'net_monitor', 'UiBackToLobby']);
  });

  it('pins the chrome, the columns and the weapon area to research 95 §2.2-§2.5', () => {
    const l = layout();
    expect(find(l, 'bar_title')).toMatchObject({ x: 30, y: 65, font: 'font_titlebar_01', color: [83, 72, 36], scale: 0.95, caption: '_15_ARMORY_MSG' });
    expect(find(l, 'TriFieldText')).toMatchObject({ x: 500, y: 1, parent: 'CrossFieldText', caption: '¬ BACK' });
    expect(find(l, 'Seal1')).toMatchObject({ x: 0, y: -22, opacity: 0.65, parent: 'Seal1PrimDummy', size: [130, 255], uivar: 'Seal1' });
    expect(find(l, 'Seal1SecText')).toMatchObject({ x: 8, y: 43, parent: 'Seal1PaneDummy', uivar: 'Char1SecondaryWeaponDescr' });
    // The shipped padlock swap and the 4th Terrorist's lock hung on its pane dummy (§2.3, §3.6).
    expect(find(l, 'Bailey1Lock').parent).toBe('Seal3PaneDummy');
    expect(find(l, 'Dimone1Lock').parent).toBe('Seal4PaneDummy');
    expect(find(l, 'Terr4Dis')).toMatchObject({ x: -3, y: -175, parent: 'Merc4PaneDummy', filename: 'LittleBlack.tif', size: [158, 290], opacity: 0.5 });
    expect(find(l, 'eq_wep_comp_bar2')).toMatchObject({ x: 100, y: -15, parent: 'Accuracy', filename: 'blue_fill.tif', size: [140, 10] });
    expect(find(l, 'WepDescription')).toMatchObject({ type: 'TELETYPE', x: 380, y: 298, scale: 0.9 });
    expect(find(l, 'arrow_rt')).toMatchObject({ x: 251, y: 0, parent: 'arrow_lft', filename: 'arrow_right.tif', size: [35, 38] });
    expect(find(l, 'EquipWeaponBtn').bindings.map((b) => `${b.button}:${b.animation}`)).toEqual([
      'SQUARE:StoringLoadout', 'UP:ActivateMPEquipStackUp', 'DOWN:ActivateMPEquipStackDown', 'LEFT:OnEquipWeaponBtnLeft',
      'CIRCLE:returnto_Defaults', 'RIGHT:OnEquipWeaponBtnRight', 'TRIANGLE:OnEquipWeaponBtnDefault',
    ]);
  });

  it('gives each model its camera (§2.6): the M16A2 10.7/3/27, the Dragunov 13.5/3.5/35, 63 models cited', () => {
    const l = layout();
    expect(l.models.find((m) => m.name === 'EquipM16')).toEqual({ name: 'EquipM16', model: 'm16a2UI', azimuth: 10.7, elev: 3, distance: 27 });
    expect(l.models.find((m) => m.name === 'EquipDragunov')).toEqual({ name: 'EquipDragunov', model: 'DragunovUI', azimuth: 13.5, elev: 3.5, distance: 35 });
    expect(new Set(l.models.map((m) => m.model)).size).toBe(63);
  });
});
