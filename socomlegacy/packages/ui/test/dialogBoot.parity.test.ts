// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { DialogLoader, dialogNodeNames, unreadKeys, type DialogDesign, type DialogRecord } from '../src/dialog';
import { buildDialogScreen, type UiNode } from '../src/compositor/index';

/**
 * TA-FRONTEND's golden pin of the boot path's dialogs (web research 105 §2-§5, 121 §6, 111 §4, 112 §2, 125 §1; TA.R3).
 * `golden/bootDialogs.json` holds the parsed trees (`parseRdr`, numbers as spelled) of the six `RUN/UI/READERC.ZAR`
 * members the boot reaches first: `dlgIntroScreen` -> `dlgIntroCinematic` (SONY448) -> `dlgSecondCinematic` (INTRO_2)
 * -> `dlgMenu`, then `dlgOptions_Menu` and the loading screen `dlgLoad`. The unit half runs the dialog loader and the
 * compositor's build on the pinned trees with no game data (CI); the disc half re-reads the six members and compares
 * each tree whole (it skips without `SOCOM_DISC` / `SOCOM_PC_ROOT`). `tools/test/dialogLoaderDisc.test.ts` and
 * `compositor/compositorDisc.test.ts` hold the same claims on the disc only.
 */
interface Pin { _source: string; archive: string; dialogs: Record<string, RdrNode> }
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'golden/bootDialogs.json'), 'utf8')) as Pin;
const NAMES = ['dlgIntroScreen.rdr', 'dlgIntroCinematic.rdr', 'dlgSecondCinematic.rdr', 'dlgMenu.rdr', 'dlgOptions_Menu.rdr', 'dlgLoad.rdr'];

const load = (name: string): { loader: DialogLoader; design: DialogDesign } => {
  const loader = new DialogLoader();
  return { loader, design: loader.load(PIN.dialogs[name]!) };
};
const record = (d: DialogDesign, name: string): DialogRecord => [...d.controls, ...d.objects].find((r) => r.name === name)!;
const tree = (n: UiNode): string => (n.children.length ? `${n.name}(${n.children.map(tree).join(' ')})` : n.name);

describe('the boot path\'s dialogs from their golden pin (no game data)', () => {
  it('pins the six READERC members the boot reaches first', () => {
    expect(PIN._source).toMatch(/^disc RUN\/UI\/READERC\.ZAR/);
    expect(Object.keys(PIN.dialogs)).toEqual(NAMES);
    for (const n of NAMES) expect(load(n).design.dropped, n).toEqual([]);
  });

  it('dlgIntroCinematic: SONY448 as an MPEG background (type 1, not looping); no BUTTON binding, so nothing skips it; ONMPEGEND (3) switches to dlgSecondCinematic', () => {
    const { design } = load('dlgIntroCinematic.rdr');
    expect(design.background).toEqual({ type: 1, typeName: 'MPEG', filename: 'run/movies/common/sony448.pss' });
    expect(design.bindings.filter((b) => b.kind === 'button')).toEqual([]);
    expect(design.bindings.filter((b) => b.kind === 'event' && b.code === 3)).toEqual([
      { kind: 'event', name: 'ONMPEGEND', code: 3, state: 1, animation: 'switch_menu', argument: 'dlgSecondCinematic.rdr' },
    ]);
  });

  it('dlgSecondCinematic: INTRO_2, nine BUTTON keys to goto_menu; the four TRIGGER keys are empty slots (ParseButtonAnim reads BUTTON or EVENT, D:L262477-262479)', () => {
    const { loader, design } = load('dlgSecondCinematic.rdr');
    expect(design.background).toEqual({ type: 1, typeName: 'MPEG', filename: 'run/movies/Intro_2.pss' });
    const keys = design.bindings.filter((b) => b.kind === 'button' && b.animation === 'goto_menu');
    expect(keys.map((b) => [b.name, b.code])).toEqual([
      ['START', 0], ['CIRCLE', 7], ['SQUARE', 8], ['TRIANGLE', 6], ['CROSS', 9], ['UP', 4], ['DOWN', 5], ['RIGHT', 2], ['LEFT', 3],
    ]);
    expect(keys.every((b) => b.argument === 'dlgMenu.rdr' && b.state === 1)).toBe(true);
    // FUN_003838b0's slot: a button, code 0x10, state 1, no animation (D:L278453-278457).
    expect(design.bindings.filter((b) => b.animation === null)).toEqual(Array.from({ length: 4 }, () => ({
      kind: 'button', name: null, code: 0x10, state: 1, animation: null, argument: null,
    })));
    expect(unreadKeys(PIN.dialogs['dlgSecondCinematic.rdr']!, loader).unread.map((k) => k.path)).toEqual(Array(4).fill('SCREENS/ANIMATIONS/TRIGGER'));
    expect(design.bindings.find((b) => b.kind === 'event')).toMatchObject({ code: 3, animation: 'goto_menu_silent', argument: 'dlgMenu.rdr' });
  });

  it('dlgIntroScreen: its screen-level BUTTONS () is read by nothing; ONSTART runs do_onstart', () => {
    const { loader, design } = load('dlgIntroScreen.rdr');
    expect(unreadKeys(PIN.dialogs['dlgIntroScreen.rdr']!, loader).unread.map((k) => k.path)).toEqual(['SCREENS/BUTTONS']);
    expect(design.bindings[0]).toEqual({ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'do_onstart', argument: null });
    expect(dialogNodeNames(design)).toEqual([]);
  });

  it('dlgMenu: the 17 records in the engine\'s node order, new_game_button at (256, 330) and SplashLogo at (70, 45); MENULOOP not looping', () => {
    const { design } = load('dlgMenu.rdr');
    expect(dialogNodeNames(design)).toEqual([
      'new_game_button', 'load_game_button', 'multiplayer_button', 'options_button', 'Extras_button', 'LAN_button',
      'LoadGameBack', 'SplashLogo', 'LEGALEZE', 'LEGALEZE1', 'VERSION', 'arrow_up', 'arrow_dwn', 'SavedGames',
      'SavedGameWarning', 'InfoTextT', 'InfoTextX',
    ]);
    expect([design.objects.length, design.controls.length]).toEqual([0, 17]);
    const at = (n: string): [number, number] => [record(design, n).x, record(design, n).y];
    expect([at('new_game_button'), at('SplashLogo')]).toEqual([[256, 330], [70, 45]]);
    expect(design.background).toEqual({ type: 1, typeName: 'MPEG', filename: 'run/movies/common/menuloop.pss' });
  });

  it('dlgMenu: the six row buttons carry CAPTION " " (the labels are the roller\'s textures) and glow ACTIVE 0.3-1 over 0.8 s', () => {
    const { design } = load('dlgMenu.rdr');
    const buttons = design.controls.filter((r) => r.widget.type === 'BUTTON');
    expect(buttons.map((b) => b.name)).toEqual(['new_game_button', 'load_game_button', 'multiplayer_button', 'options_button', 'Extras_button', 'LAN_button']);
    for (const b of buttons) {
      if (b.widget.type !== 'BUTTON') throw new Error(b.name);
      expect(b.widget.button.caption, b.name).toBe(' ');
      expect(b.widget.button.active.glow, b.name).toEqual({ range: [Math.fround(0.3), 1], time: Math.fround(0.8) });
      for (const s of ['normal', 'pressed', 'disabled'] as const) expect(b.widget.button[s].glow, `${b.name} ${s}`).toBeNull();
    }
  });

  it('dlgMenu builds into two planes: the controls with their CHILDOF children on the backplane, MENUFADER and POPUP on the foreplane', () => {
    const s = buildDialogScreen(load('dlgMenu.rdr').design);
    expect(tree(s.backplane)).toBe(
      'CGameMenu backplane(new_game_button load_game_button multiplayer_button options_button Extras_button LAN_button LoadGameBack ' +
      'SplashLogo LEGALEZE(LEGALEZE1 VERSION) arrow_up(arrow_dwn) SavedGames(SavedGameWarning InfoTextT InfoTextX))',
    );
    expect(tree(s.foreplane)).toBe('CGameMenu foreplane(MENUFADER POPUP)');
    expect(s.movie).not.toBeNull();
    expect(s.background).toBeNull();
  });

  it('dlgOptions_Menu: 15 nodes; HDDOnOff takes its first subordinate\'s CHILDOF -- itself; its VALVE key is read by no widget reader', () => {
    const { loader, design } = load('dlgOptions_Menu.rdr');
    expect(dialogNodeNames(design)).toEqual([
      'AudioOpBtn', 'VideoOpBtn', 'ControlOpBtn', 'ControlPresetBtn', 'HDDOnOff', 'HDD_On', 'HDD_Off', 'SaveAndLeaveBtn',
      'eq_title_back', 'eq_Lower_back', 'bar_title', 'InfoTextT', 'InfoTextX', 'InfoWin', 'instText',
    ]);
    expect(record(design, 'HDDOnOff').childOf).toBe('HDDOnOff');
    expect(unreadKeys(PIN.dialogs['dlgOptions_Menu.rdr']!, loader).unread.map((k) => k.path)).toEqual(['SCREENS/CONTROLS/SPEC/VALVE']);
    expect(tree(buildDialogScreen(design).backplane)).toBe(
      'CGameMenu backplane(background AudioOpBtn VideoOpBtn ControlOpBtn ControlPresetBtn HDDOnOff(HDD_On HDD_Off) SaveAndLeaveBtn ' +
      'eq_title_back eq_Lower_back bar_title InfoTextT InfoTextX InfoWin instText)',
    );
  });

  it('dlgLoad: nine objects, background LittleBlack.tif, LIBRARY common/assetlib/loading, FONT font_text_01 (research 125 R125.1)', () => {
    const { loader, design } = load('dlgLoad.rdr');
    expect(design.objects.map((o) => o.name)).toEqual([
      'LoadingPicture', 'LoadingBackground', 'load_progress_filling', 'title', 'description', 'ReturnToLobby', 'RateLevel', 'load_CD_Parent', 'load_CD_spinning',
    ]);
    expect(design.background).toEqual({ type: 0, typeName: 'IMAGE', filename: 'LittleBlack.tif' });
    expect([design.libraries, design.font]).toEqual([[{ name: 'common/assetlib/loading' }], 'font_text_01']);
    expect(design.bindings.slice(0, 2).map((b) => b.animation)).toEqual(['SpinLoadingCD', 'OnMenuStart']);
    // The TEXT's SPACING and WIDTH (research 105 §4.2): a TEXT reads neither.
    expect(unreadKeys(PIN.dialogs['dlgLoad.rdr']!, loader).unread.map((k) => k.path).sort()).toEqual(['SCREENS/OBJECTS/SPEC/SPACING', 'SCREENS/OBJECTS/SPEC/WIDTH']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The disc half: the pin re-derived.

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, PIN.archive));

describe.skipIf(!HAVE_DISC)('the boot dialogs\' pin re-derived from the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('each pinned tree is parseRdr of its READERC member, whole', () => {
    const z = Zar.parse(new Uint8Array(readFileSync(join(DISC, PIN.archive))));
    for (const n of NAMES) expect(parseRdr(z.data(z.root.children.find((k) => k.name === n)!)), n).toEqual(PIN.dialogs[n]);
  });
});
