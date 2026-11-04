import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { DialogLoader, dialogNodeNames, unreadKeys, type DialogDesign } from '@s2u/ui';
import { DIALOG_ARCHIVES } from '../dialogInventory';
import { discRoot } from '../dump-dialogs';

/**
 * PLAT-05's dev-disc check (web research 105 §3-§5): the generic dialog loader (`@s2u/ui` `DialogLoader`, the engine's
 * design reader `FUN_00381550` and its widget factories) over every member of `RUN/UI/READERC.ZAR` (110) and
 * `RUN/UI/READERX.ZAR` (4). Every record is built (no `TYPE` unknown, none without a `SPEC`); the 103 `dlg*` layouts'
 * per-dialog counts equal PLAT-06's pin (`dialogInventory.pinned.json`, research 96 §2); and every key of every dialog
 * is read by a reader, or is listed below with why the engine does not read it. Names and counts only.
 *
 * The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither (CI) every test skips. The PCSX2
 * title image (`SOCOM_PC_ROOT/logs/parity/title_pcsx2.rdram`) is read only by the last test, which skips without it.
 */
const DISC = discRoot();
const PIN = resolve(import.meta.dirname, 'dialogInventory.pinned.json');

interface Loaded { archive: string; name: string; root: RdrNode; loader: DialogLoader; design: DialogDesign }
let cached: Loaded[] | null = null;
const loaded = (): Loaded[] => {
  if (cached) return cached;
  cached = [];
  for (const archive of DIALOG_ARCHIVES) {
    const z = Zar.parse(new Uint8Array(readFileSync(resolve(DISC ?? '', archive))));
    for (const k of z.root.children) {
      const root = parseRdr(z.data(k));
      const loader = new DialogLoader();
      cached.push({ archive, name: k.name, root, loader, design: loader.load(root) });
    }
  }
  return cached;
};
const readerc = (): Loaded[] => loaded().filter((d) => d.archive === DIALOG_ARCHIVES[0]);
const dialogs = (): Loaded[] => loaded().filter((d) => /^dlg/.test(d.name));

const count = (into: Record<string, number>, key: string): void => { into[key] = (into[key] ?? 0) + 1; };
const sorted = (c: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(c).sort((a, b) => (a[0] < b[0] ? -1 : 1)));

/** One dialog's tallies by site, as research 96 §2.1 counts them. */
function sites(d: DialogDesign): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of [...d.controls, ...d.objects]) {
    count(out.widget ??= {}, r.widget.type);
    const w = r.widget;
    if (w.type === 'RADIOSTRIP') for (const s of w.subordinates) count(out.subordinate ??= {}, s.widget.type);
    if (w.type === 'HANDLERBUTTON' && w.subordinate) count(out.subordinate ??= {}, w.subordinate.widget.type);
    if (w.type === 'MAPCONTROL') for (const e of w.elements) count(out.element ??= {}, e.widget.type);
  }
  if (d.background?.typeName) count(out.background ??= {}, d.background.typeName);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, sorted(v)]));
}

/**
 * The keys the dialogs carry that no reader of the engine's looks up (research 105 §4), `<member> <path>` with their
 * number. The tree is freed as soon as the design is read (`FUN_0032d6e0`, D:L263224), so nothing reads them later.
 */
const ENGINE_UNREAD: Record<string, number> = {
  // A screen-level `BUTTONS ()`: no reader names the word.
  'dlgAfterErrorReboot.rdr BUTTONS': 1, 'dlgIntroScreen.rdr BUTTONS': 1,
  'dlgReturnFromNTGUI2.rdr BUTTONS': 1, 'dlgReturnFromNTGUI2LAN.rdr BUTTONS': 1,
  // `TRIGGER` R1/R2/L1/L2: ParseButtonAnim reads BUTTON or EVENT only (D:L262477-262479); the slot keeps no animation.
  'dlgAttractCinematic.rdr ANIMATIONS/TRIGGER': 4, 'dlgPlayTutMovies.rdr ANIMATIONS/TRIGGER': 4, 'dlgSecondCinematic.rdr ANIMATIONS/TRIGGER': 4,
  // A UIVAR's `TYPE` (PERMANENT): CUIVariableSpec reads LONGEVITY (D:L280329), so these vars are temporary.
  'dlgClanLadderLobby.rdr OBJECTS/SPEC/UIVAR/TYPE': 1, 'dlgInvitedPlayers.rdr OBJECTS/SPEC/UIVAR/TYPE': 1,
  'dlgRespondToInvites.rdr OBJECTS/SPEC/UIVAR/TYPE': 1, 'dlgManageRoster.rdr CONTROLS/SPEC/UIVAR/TYPE': 2,
  'dlgManageRosterLeader.rdr CONTROLS/SPEC/UIVAR/TYPE': 2,
  // Misspelt: `LONGETIVY` (the default, TEMPORARY, is what it says), `APTION`.
  'dlgFriendList.rdr CONTROLS/SPEC/UIVAR/LONGETIVY': 3, 'dlgGameLobby.rdr CONTROLS/SPEC/APTION': 1,
  // A LISTBOX's NORMAL_COLOR is read as a colour only (D:L276044-276052); its DISABLED_COLOR by no LISTBOX reader.
  'dlgCreateGame.rdr CONTROLS/SPEC/NORMAL_COLOR/RANGE': 1, 'dlgCreateGame.rdr CONTROLS/SPEC/DISABLED_COLOR': 1,
  // A RADIOSTRIP's `VALVE`: no widget reader names it (its scripts set the valve).
  'dlgLAN_Options.rdr CONTROLS/SPEC/VALVE': 1, 'dlgOnlineOptions.rdr CONTROLS/SPEC/VALVE': 2, 'dlgOptions_Menu.rdr CONTROLS/SPEC/VALVE': 1,
  // Keys a type's reader does not read (a TEXT's SPACING and WIDTH, a TELETYPE's AUTOSCROLL), and a SCALE outside SPEC.
  'dlgLoad.rdr OBJECTS/SPEC/WIDTH': 1, 'dlgLoad.rdr OBJECTS/SPEC/SPACING': 1,
  'dlg_equipment_main.rdr OBJECTS/SPEC/AUTOSCROLL': 1, 'dlg_equipment_main.rdr OBJECTS/SPEC/SPACING': 6,
  'dlg_equipment_mp.rdr OBJECTS/SPEC/AUTOSCROLL': 1, 'dlg_equipment_mp.rdr OBJECTS/SPEC/SPACING': 6,
  'dlg_WeapUnlock.rdr OBJECTS/SPEC/AUTOSCROLL': 1, 'dlg_WeapUnlock.rdr OBJECTS/SPEC/SPACING': 6, 'dlg_WeapUnlock.rdr CONTROLS/SCALE': 1,
  // READERX's copies carry their animations' source beside the layout (research 96 §1.1).
  'X:dlgExitState.rdr ANIMATION_DEFINITIONS': 1, 'X:dlgMultiplayerFinal.rdr ANIMATION_DEFINITIONS': 1,
  'X:dlgMultiplayerFinalReally.rdr ANIMATION_DEFINITIONS': 1, 'X:dlgMultiplayerRound.rdr ANIMATION_DEFINITIONS': 1,
};

describe.skipIf(!DISC)('the dialog loader over the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('loads all 110 READERC members and READERX\'s 4: every record built, no TYPE unknown, none without a SPEC', () => {
    expect([readerc().length, loaded().length - readerc().length]).toEqual([110, 4]);
    expect(loaded().flatMap((d) => d.design.dropped.map((x) => `${d.name} ${x.list} ${x.name} ${x.why}`))).toEqual([]);
  }, 120_000);

  it('the 103 dlg* layouts hold research 96 §2\'s tallies, by site', () => {
    const total: Record<string, Record<string, number>> = {};
    for (const d of readerc().filter((x) => /^dlg/.test(x.name))) {
      for (const [site, c] of Object.entries(sites(d.design))) for (const [t, n] of Object.entries(c)) (total[site] ??= {})[t] = ((total[site] ??= {})[t] ?? 0) + n;
    }
    expect(Object.fromEntries(Object.entries(total).map(([k, v]) => [k, sorted(v)]))).toEqual({
      widget: sorted({ IMAGE: 2057, TEXT: 1291, BUTTON: 298, TELETYPE: 106, LISTBOX: 58, WRAPPEDTEXT: 49, MAPCONTROL: 36, RADIOSTRIP: 18, SLIDERBAR: 8, COUNTER: 4, SECURETEXT: 3, PROGRESSBAR: 1 }),
      subordinate: { CHECKBOX: 42 }, element: { IMAGE: 72, TEXT: 72 }, background: { IMAGE: 90, MPEG: 9 },
    });
  }, 120_000);

  it('each dlg* layout\'s counts equal PLAT-06\'s pin; dlgDebriefing has one object more (its three-token NAME)', () => {
    const pin = JSON.parse(readFileSync(PIN, 'utf8')).perDialog as Record<string, { objects: number; controls: number; models: number; sites: Record<string, Record<string, number>> }>;
    const names = readerc().filter((x) => /^dlg/.test(x.name)).map((x) => x.name);
    expect(names.sort()).toEqual(Object.keys(pin).sort());
    for (const d of readerc().filter((x) => /^dlg/.test(x.name))) {
      const p = pin[d.name]!;
      // parseUiLayout drops a record whose NAME is not one string; the engine takes the first token (FUN_0032ee10).
      const extra = d.name === 'dlgDebriefing.rdr' ? 1 : 0;
      expect([d.design.objects.length, d.design.controls.length, d.design.models.length], d.name).toEqual([p.objects + extra, p.controls, p.models]);
      const want = Object.fromEntries(Object.entries(p.sites).filter(([k]) => k !== 'uivar').map(([k, v]) => [k, sorted(v)]));
      expect(sites(d.design), d.name).toEqual(want);
    }
    const debrief = readerc().find((x) => x.name === 'dlgDebriefing.rdr')!;
    expect(debrief.design.objects.filter((o) => o.name === 'Extras').length).toBe(1);
  }, 120_000);

  it('every key of every dialog is read, a doubled key\'s shadow, SCREENS, or listed in ENGINE_UNREAD', () => {
    const unread: Record<string, number> = {};
    const shadowed: Record<string, number> = {};
    for (const d of dialogs()) {
      const u = unreadKeys(d.root, d.loader);
      const tag = `${d.archive === DIALOG_ARCHIVES[1] ? 'X:' : ''}${d.name}`;
      for (const k of u.unread) count(unread, `${tag} ${k.path.replace(/^SCREENS\//, '')}`);
      for (const k of u.shadowed) count(shadowed, k.key);
      expect(u.containers.map((k) => k.path), tag).toEqual(['SCREENS']);
    }
    expect(sorted(unread)).toEqual(sorted(ENGINE_UNREAD));
    // The doubled keys (research 96 §2.3's five TYPEs among them): the first copy is read, the second never.
    expect(sorted(shadowed)).toEqual(sorted({ CAPTION: 12, FILENAME: 2, HCENTERED: 1, NOSELECT: 2, SCALE: 6, TYPE: 5, YOFFSET: 1 }));
  }, 120_000);

  it('the seven non-dialog members load to empty designs: no CONTROLS, OBJECTS or MODELS key in them', () => {
    const others = readerc().filter((x) => !/^dlg/.test(x.name));
    expect(others.map((x) => x.name)).toEqual(['Common_AOP_Obj.rdr', 'Common_AOP_Stars.rdr', 'Common_Brief_Btn.rdr', 'Common_Brief_Obj.rdr', 'mp_rooms.rdr', 'UiParams.rdr', 'uisounds.rdr']);
    for (const o of others) expect([o.design.controls.length, o.design.objects.length, o.design.models.length], o.name).toEqual([0, 0, 0]);
  }, 120_000);

  it('dlgMenu: 17 records, the STATUS 2026-09-06 RAM read\'s positions; dlgOptions_Menu: its 15 nodes', () => {
    const menu = readerc().find((x) => x.name === 'dlgMenu.rdr')!.design;
    expect(dialogNodeNames(menu)).toEqual([
      'new_game_button', 'load_game_button', 'multiplayer_button', 'options_button', 'Extras_button', 'LAN_button',
      'LoadGameBack', 'SplashLogo', 'LEGALEZE', 'LEGALEZE1', 'VERSION', 'arrow_up', 'arrow_dwn', 'SavedGames',
      'SavedGameWarning', 'InfoTextT', 'InfoTextX',
    ]);
    const at = (n: string) => [...menu.controls, ...menu.objects].find((r) => r.name === n)!;
    expect([at('new_game_button').x, at('new_game_button').y, at('SplashLogo').x, at('SplashLogo').y]).toEqual([256, 330, 70, 45]);
    expect(menu.background).toEqual({ type: 1, typeName: 'MPEG', filename: 'run/movies/common/menuloop.pss' });
    const options = readerc().find((x) => x.name === 'dlgOptions_Menu.rdr')!.design;
    expect(dialogNodeNames(options)).toEqual([
      'AudioOpBtn', 'VideoOpBtn', 'ControlOpBtn', 'ControlPresetBtn', 'HDDOnOff', 'HDD_On', 'HDD_Off', 'SaveAndLeaveBtn',
      'eq_title_back', 'eq_Lower_back', 'bar_title', 'InfoTextT', 'InfoTextX', 'InfoWin', 'instText',
    ]);
  }, 120_000);
});

const TITLE = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'logs/parity/title_pcsx2.rdram') : null;

describe.skipIf(!DISC || !TITLE || !existsSync(TITLE))('the PCSX2 title image (SOCOM_PC_ROOT/logs/parity/title_pcsx2.rdram)', () => {
  it('holds dlgMenu.rdr and dlgOptions_Menu.rdr resident, byte-equal to READERC\'s members', () => {
    const image = readFileSync(TITLE ?? '');
    const z = Zar.parse(new Uint8Array(readFileSync(resolve(DISC ?? '', DIALOG_ARCHIVES[0]))));
    for (const name of ['dlgMenu.rdr', 'dlgOptions_Menu.rdr']) {
      const member = z.data(z.root.children.find((k) => k.name === name)!);
      expect(image.indexOf(Buffer.from(member)), name).toBeGreaterThan(0);
    }
  }, 120_000);
});
