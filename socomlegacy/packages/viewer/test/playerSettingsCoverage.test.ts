// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CardSlots } from '@s2u/card';
import { liveOptions, OVERLAY_BUTTON_ROW } from '../src/console/adapters/options';
import { cardOptionStore } from '../src/modern/settings/store';

/**
 * RB-3 (PS-0; the replay batch, product track -- a census of the port's own wiring, no behaviour of the game): every
 * player setting the launcher's Settings offers for a match, and whether each surface that plays one honours it --
 *
 * - **main**: the front end's match (`../src/frontEnd.ts` mounting `../src/matchMount.ts` with its session), the
 *   reference: "the main game".
 * - **testRoom**: `/testroom` (`../src/main.ts`), which runs no front end and reads the page card.
 * - **forgePlay**: the Forge's Play and lobby match (`../src/forge/match.ts` `startForgeMatch` / `startForgeLobbyMatch`),
 *   the front end's own `mountMatch` with none of the session's deps today.
 *
 * Each cell is one of: `reads` -- a source pin on the line that honours it (file and text, read here); `todo` -- a gap,
 * owned by the replay batch's task that closes it (RB-10 the Forge's Play, RB-15 the mouse rows, RB-16 the test room's
 * gaps, RB-23 the VS lane's V2 rows), drawn as an `it.todo` so the census reads red on each gap until its task flips it
 * to `reads`; `none` -- the main game honours it nowhere either, so no surface owes it. A launcher row added without a
 * census row fails the completeness case below.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

type Owner = 'RB-10' | 'RB-15' | 'RB-16' | 'RB-23';
type Cell = { reads: [file: string, text: string] } | { todo: Owner; why: string } | { none: string };
interface Row { id: string; label: string; main: Cell; testRoom: Cell; forgePlay: Cell }

const MM = 'matchMount.ts', TR = 'main.ts', FE = 'frontEnd.ts', PS = 'playerSettings.ts';
/** The Forge's Play mounts the front end's match; a `reads` there is `matchMount.ts`'s own read, with no session dep. */
const viaMount = (text: string): Cell => ({ reads: [MM, text] });

const VOLUMES: Cell = { reads: [TR, 'audio.setTunerVars(() => pageOptions?.uiVars ?? cardReads.tuners());'] };
const FG = 'forge/match.ts';
/** RB-10 (PS-2, PS-3; the cells flipped by RB-16, RB-10's review finding): the Forge's match takes the player's settings from `pageMatchDeps`. */
const FORGE_AUDIO: Cell = { reads: [FG, 'player.applyAudio(out, game);'] };
const FORGE_DEPS: Cell = { reads: [FG, '...player.mountDeps(o.map.name, cueSource, () => cues.audio() ?? game),'] };
const PLAY_OPTIONS: Cell = { reads: [TR, 'const playOptions = matchOptions(() => ({ ...playOptionsOf(startMenuOptions), stick: (pageOptions ? playOptionsOf(pageOptions.globals, pageOptions.uiVars) : cardReads.options()).stick }));'] };
const MAIN_PLAY_OPTIONS: Cell = { reads: [FE, 'taunts, messages, options, picture,'] };
const FORGE_OPTIONS: Cell = FORGE_DEPS;
const MOUSE_MAIN: Cell = { none: 'the front end\'s match is controller-only (OT.R29; RB.R4: no KB/M in an online room)' };
const VS_MAIN: Cell = { none: 'not built yet: the VS lane\'s V2 rows (VS-9) land on the front end\'s match first' };

const PLAYER_SETTINGS_CENSUS: readonly Row[] = [
  // Audio (the card's CUIVarManager tuners and the SOUND strip)
  ...(['MUSIC_VOLUME', 'SOUND_VOLUME', 'DIALOG_VOLUME', 'HEADSET_CONTROLLER'] as const).map((id): Row => ({
    id, label: id, main: { reads: [FE, 'setTunerVars'] }, testRoom: VOLUMES, forgePlay: FORGE_AUDIO,
  })),
  { id: 'STEREO_CONTROLLER', label: 'Sound mode', main: { reads: [FE, "out?.setSoundMode(s.options.value('STEREO_CONTROLLER') ?? 1)"] },
    testRoom: { reads: [PS, 'sound.setSoundMode?.(soundModeOf(valves));'] },   // RB-48: `GameAudio` forwards it (`audio.ts`)
    forgePlay: FORGE_AUDIO },
  // Display (the card's VIDEO page, SCREEN ADJUST, and this browser's rows)
  { id: 'BRIGHTNESS', label: 'Brightness', main: { reads: [FE, 'setBrightness(brightnessOfVars(session_?.uiVars))'] },
    testRoom: { reads: [PS, 'setBrightness(brightnessOfVars(tuners));'] }, forgePlay: { reads: [FG, 'player.applyBrightness();'] } },
  { id: 'BOBBING_1ST_PERSON', label: 'Head bob', main: MAIN_PLAY_OPTIONS, testRoom: PLAY_OPTIONS, forgePlay: FORGE_OPTIONS },
  { id: 'DISPLAY_MP_TEAM_NAMES', label: 'Teammate names', main: { reads: [MM, "const teamNames = o.gameVars?.valve('DISPLAY_MP_TEAM_NAMES') ?? 1;"] },
    testRoom: { reads: [TR, 'const teamNames = teammateNamesValue(pageOptions?.valves ?? cardReads.valves());'] },
    forgePlay: FORGE_DEPS },
  ...(['ScreenOriginX', 'ScreenOriginY'] as const).map((id): Row => ({
    id, label: id, main: { reads: [FE, '...(o.screenOrigin ? { screenOrigin: o.screenOrigin } : {})'] },
    testRoom: { reads: [TR, 'const { x, y } = screenOriginOf(pageOptions?.valves ?? cardReads.valves());'] },
    forgePlay: { todo: 'RB-10', why: 'RB-10 landed without it: `PageMatchMountDeps` carries no SCREEN POSITION and the Forge lays no origin on its match\'s canvas (`forge/match.ts`)' },
  })),
  { id: 'video-picture', label: 'Video (Modern / PS2)', main: { reads: [MM, 'let picture: VideoPicture = o.picture?.get() ?? VIDEO_PICTURE_DEFAULT;'] },
    testRoom: { reads: [TR, 'ui.onLook(SHARE.view, (view) => updateAddress({ view }), pagePicture())'] },
    forgePlay: FORGE_DEPS },
  { id: 'render-scale', label: 'Render scale', main: { reads: [MM, 'renderCapForV2(renderPct, renderCeiling,'] },
    testRoom: { reads: [TR, 'renderCapFor(videoSettings.get().renderScale,'] }, forgePlay: viaMount('renderCapForV2(renderPct, renderCeiling,') },
  { id: 'detail-distance', label: 'Detail distance', main: { reads: [MM, 'detailDistanceFor(picture, detailDistance.get())'] },
    testRoom: { reads: [TR, 'readDetailDistance()'] }, forgePlay: viaMount('detailDistanceFor(picture, detailDistance.get())') },
  { id: 'shadows', label: 'Shadows', main: { reads: [MM, 'if (v.shadows !== shadowsOn)'] },
    testRoom: { reads: [TR, "ui.setToggle('shadows', v.shadows)"] }, forgePlay: viaMount('if (v.shadows !== shadowsOn)') },
  { id: 'show-fps', label: 'Show FPS', main: { reads: [MM, 'v.showFps !== fpsReadout.shown()'] },
    testRoom: { reads: [TR, 'ui.setFpsShown(v.showFps || DEV.tools)'] }, forgePlay: viaMount('v.showFps !== fpsReadout.shown()') },
  { id: 'name-tags', label: 'Name tags', main: { reads: [MM, "hud.setTeammateNames(teamNames !== 0, readNameTags() === 'original');"] },
    testRoom: { reads: [TR, "hud.setTeammateNames(teamNames !== 0, readNameTags() === 'original');"] }, forgePlay: viaMount("hud.setTeammateNames(teamNames !== 0, readNameTags() === 'original');") },
  // HUD-ALIVE C (OT.R117, a browser adaptation): this browser's key `s2u.viewer.rangeReadout`, read beside Name tags --
  // at the mount (the main game and the Forge's Play) and each frame in the test room
  { id: 'range-readout', label: 'Range readout', main: { reads: [MM, "hud.setRangeReadout(readRangeReadout() === 'on');"] },
    testRoom: { reads: [TR, "hud.setRangeReadout(readRangeReadout() === 'on');"] }, forgePlay: viaMount("hud.setRangeReadout(readRangeReadout() === 'on');") },
  { id: 'graphics-backend', label: 'Graphics mode', main: { reads: [MM, "import('./renderer').then((r) => r.createRenderer("] },
    testRoom: { reads: [TR, 'await createRenderer(canvas!)'] }, forgePlay: viaMount("import('./renderer').then((r) => r.createRenderer(") },
  // The VS page's V2 rows (RB-23): the main game and the Forge's Play read them through `matchMount.ts`; the test room's adoption is the VS lane's
  { id: 'video-preset', label: 'Preset', main: { reads: [MM, "autoAdaptiveOptions(videoV2.get().preset)"] },
    testRoom: { todo: 'RB-23', why: "the test room has no Automatic floor or first-match probe (`autoAdaptiveOptions`, `firstMatchProbe`)" }, forgePlay: viaMount("autoAdaptiveOptions(videoV2.get().preset)") },
  { id: 'video-ceiling', label: 'Resolution ceiling', main: { reads: [MM, "renderCapForV2(renderPct, renderCeiling,"] },
    testRoom: { todo: 'RB-23', why: "the test room sizes through the v1 render scale (`renderCapFor`); the ceiling needs its v1-to-v2 render-scale source swap" }, forgePlay: viaMount("renderCapForV2(renderPct, renderCeiling,") },
  { id: 'video-frame-cap', label: 'Frame cap', main: { reads: [MM, "frameCapGate(videoV2.get().frameCap)"] },
    testRoom: { todo: 'RB-23', why: "the test room's frame loop has no draw skip (`frameCapGate`'s `shouldDraw`)" }, forgePlay: viaMount("frameCapGate(videoV2.get().frameCap)") },
  { id: 'video-antialias', label: 'Antialias', main: { reads: [MM, "antialias: graphics !== 'xbox' && v.antialias"] },
    testRoom: { todo: 'RB-23', why: "applies at the next match (VS.R4, at `createRenderer`); the test room's renderer reads no V2 row" }, forgePlay: viaMount("antialias: graphics !== 'xbox' && v.antialias") },
  // Controller (this browser's rows, then the card's CONTROLLER OPTIONS)
  { id: 'stance-mode', label: 'Stance mode', main: { reads: [MM, 'walk.setStanceMode(controllerStanceMode());'] },
    testRoom: { reads: [TR, 'walk.setStanceMode(controllerStanceMode());'] }, forgePlay: viaMount('walk.setStanceMode(controllerStanceMode());') },
  ...(['pad-device', 'pad-dead', 'remap'] as const).map((id): Row => ({
    id, label: id, main: { reads: [MM, "import { GamePad } from './setupPad';"] },
    testRoom: { reads: [TR, "import { GamePad } from './setupPad';"] }, forgePlay: viaMount("import { GamePad } from './setupPad';"),
  })),
  { id: OVERLAY_BUTTON_ROW, label: 'Overlay button', main: { reads: ['modern/overlay/binding.ts', 'readOverlayButton'] },
    testRoom: { reads: ['modern/overlay/binding.ts', 'readOverlayButton'] }, forgePlay: { reads: ['modern/overlay/binding.ts', 'readOverlayButton'] } },
  // PR #765 (Chris's unified controller settings): the launcher's Controller layout row writes the original's
  // `SelectedControllerConfig` (with `ChosePresetOnce`); each surface stores it as its `StoreOptions` does (OPT-14,
  // `ControllerConfigs.store`) -- the session's globals, the test room's card read (live once native Options is up:
  // `nativeOptionsState.ts`), the Forge's valves read again at each valve's write
  { id: 'SelectedControllerConfig', label: 'Controller layout',
    main: { reads: [FE, 'if (configs) this.options.observe(() => { configs.store((name) => this.options.value(name)); });'] },
    testRoom: { reads: ['matchOptions.ts', 'storeCardControllerConfig(part);'] },
    forgePlay: { reads: [PS, 'storeCardControllerConfig(parts?.valves);'] } },
  { id: 'VIBRATION_CONTROLLER', label: 'Vibration', main: { reads: [MM, 'vibration: () => attached && startMenu.values().vibration'] },
    testRoom: { reads: [TR, 'vibration: () => startMenu.values().vibration'] },
    forgePlay: FORGE_DEPS },
  { id: 'AutoAim', label: 'Aim assist', main: { none: 'the START menu\'s offline row only (`startMenu.ts` `aimAssist`); no match applies it' },
    testRoom: { none: 'as the main game' }, forgePlay: { none: 'as the main game' } },
  { id: 'INVERT_PITCH_CONTROLLER', label: 'Pitch', main: MAIN_PLAY_OPTIONS, testRoom: PLAY_OPTIONS, forgePlay: FORGE_OPTIONS },
  { id: 'FIREMODESWAP_CONTROLLER', label: 'Fire rate', main: MAIN_PLAY_OPTIONS, testRoom: PLAY_OPTIONS, forgePlay: FORGE_OPTIONS },
  ...(['stick_preset', 'STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE'] as const).map((id): Row => ({
    id, label: id, main: MAIN_PLAY_OPTIONS, testRoom: PLAY_OPTIONS, forgePlay: FORGE_OPTIONS,
  })),
  // Mobile (the touch layout)
  { id: 'mobile-layout', label: 'Touch layout', main: { reads: [MM, 'const touch = mountTouch('] },
    testRoom: { reads: [TR, 'const touch = mountTouch(document.body, {'] }, forgePlay: viaMount('const touch = mountTouch(') },
  // Communication (the card's ONLINE OPTIONS, this browser's microphone)
  { id: 'EnableExternalWhispers', label: 'External whispers', main: { reads: [FE, 'externalWhispers: whispers'] },
    testRoom: { todo: 'RB-16', why: 'the test room mounts no round chat at all (`mountRoundChat` is `matchMount.ts`\'s and `briefingRoomHost.ts`\'s only), so nothing there takes the setting: a round chat on the test room is its own task' },
    forgePlay: FORGE_DEPS },
  ...(['mic-on', 'mic-device'] as const).map((id): Row => ({
    id, label: id, main: { reads: [MM, 'mountVoice('] }, testRoom: { reads: [TR, 'mountVoice({'] }, forgePlay: viaMount('mountVoice('),
  })),
  // The card's fives (MPTAUNTMSG1-5, MPLOCALSOP1-5): ONLINE > OPTIONS' editors, not a Settings row
  { id: 'taunts', label: 'TAUNTS', main: { reads: [MM, 'custom: () => o.taunts?.() ?? []'] },
    testRoom: { reads: [TR, 'custom: () => cardTaunts'] }, forgePlay: FORGE_DEPS },
  { id: 'messages', label: 'MESSAGES', main: { reads: [MM, 'messages: () => o.messages?.() ?? []'] },
    testRoom: { reads: [TR, 'messages: () => cardMessages'] }, forgePlay: FORGE_DEPS },
  // Planned rows: not in the launcher yet
  ...(['mouse-sensitivity', 'mouse-uniform-pitch', 'mouse-invert'] as const).map((id): Row => ({
    id, label: id, main: MOUSE_MAIN,
    testRoom: { todo: 'RB-15', why: 'the Controller tab\'s "Mouse & keyboard" rows (KBM-4, Q7) do not exist yet' },
    forgePlay: { todo: 'RB-15', why: 'the Forge Walk and FlyCamera take no stored mouse settings yet' },
  })),
  ...(['frame-cap', 'colour-filter', 'shadow-tiers'] as const).map((id): Row => ({
    id, label: id, main: VS_MAIN,
    testRoom: { todo: 'RB-23', why: 'the test room\'s frame loop reads no VS V2 row (PS-8)' },
    forgePlay: { todo: 'RB-23', why: 'the Forge reads no VS V2 row (PS-8)' },
  })),
];

/** Rows the census holds that the launcher does not offer today: the card's fives and the planned rows. */
const NOT_LAUNCHER_ROWS = new Set(['taunts', 'messages', 'mouse-sensitivity', 'mouse-uniform-pitch', 'mouse-invert', 'frame-cap', 'colour-filter', 'shadow-tiers']);
/** Launcher rows that are not a match's settings: the launcher's own, the account, and one action. */
const NOT_PLAYER_CATEGORIES = new Set(['app', 'appearance', 'account']);
const NOT_SETTINGS = new Set([
  'perf-line',         // Copy performance line: an action, nothing stored
  'video-restore',     // Restore defaults (the VS page): an action, nothing stored
  'device-memory',     // This device's memory (the VS page): a read-only diagnostic
  'device-detected',   // This device's detected class (the VS page): a read-only diagnostic
]);

function launcherRows(): string[] {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  const slots = new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
  const options = liveOptions(() => {}, { store: cardOptionStore(slots), signedIn: () => false, pads: () => [], touch: () => true });
  try {
    return options.categories().filter((c) => !NOT_PLAYER_CATEGORIES.has(c.id)).flatMap((c) => c.rows.map((r) => r.id)).filter((id) => !NOT_SETTINGS.has(id));
  } finally { options.dispose(); }
}

describe('RB-3 PS-0: the player-settings census', () => {
  it('covers every match setting the launcher offers, and names no row it does not (bar the fives and the planned rows)', () => {
    const offered = new Set([...launcherRows(), OVERLAY_BUTTON_ROW]);   // Overlay button: drawn only where the page binds one
    const census = new Set(PLAYER_SETTINGS_CENSUS.map((r) => r.id));
    expect(census.size).toBe(PLAYER_SETTINGS_CENSUS.length);
    expect([...offered].filter((id) => !census.has(id))).toEqual([]);
    expect([...census].filter((id) => !offered.has(id) && !NOT_LAUNCHER_ROWS.has(id))).toEqual([]);
  });

  it('a surface owes nothing the main game does not honour: a `none` row is `none` or a planned todo everywhere', () => {
    for (const r of PLAYER_SETTINGS_CENSUS) {
      if ('none' in r.main) continue;
      expect('none' in r.testRoom, `${r.id} testRoom`).toBe(false);
      expect('none' in r.forgePlay, `${r.id} forgePlay`).toBe(false);
    }
  });

  it("the test room's settings wiring is `playerSettings.ts`'s (PS-1)", () => {
    const main = src(TR);
    expect(main).toMatch(/import \{ adoptPageOptions, liveStartMenuOptions, pageCardReads, pageEarlyCommits, screenOriginOf, teammateNamesValue, withPageHooks \} from '\.\/playerSettings';/);
    expect(main).toContain('const stopEarlyHome = pageEarlyCommits(pageCard, {');
    expect(main).toContain('const startMenuOptions: StartMenuOptions = liveStartMenuOptions(liveMenuOptions);');
    expect(main).toContain('adoptPageOptions(withPageHooks(pageNativeOptionsState(assets.disc), pageHooks), localMenuOptions,');
    expect(main).toContain('const teamNames = teammateNamesValue(pageOptions?.valves ?? cardReads.valves());');
    expect(main).not.toMatch(/observeOptionCommits|applyCommittedTuner/);   // moved whole
    // RB-16 (RB-3's inline `main.ts:1239-1245, 2423`): the card's reads are `pageCardReads`'s, no loose `cardOptions` / `cardTuners`
    expect(main).toContain('const cardReads = pageCardReads(undefined, undefined, { valvesChanged: () => { if (!pageOptions) layCardOrigin(); } });');
    expect(main).toContain('cardReads.reread(pageOptions);');
    expect(main).not.toMatch(/\bcard(Options|Tuners)\b/);
    // RB-16 (PS-4): native Options over the test room lays SCREEN POSITION and VIDEO MODE's picture, as the front end's does
    expect(main).toContain('const pageHooks = { screenOrigin: (x: number, y: number) => { screenOrigin.set(x, y); }, picture: pagePicture() };');
    // RB-16 (PS-7): the panel's shadows toggle writes the shared video key and gates the characters' shadow; the key's change reaches the toggle and the counter
    expect(main).toContain('pageVideo.set({ shadows: on });');
    expect(main).toContain('if (shadowsOn) charShadow.frame(created.renderer, scene, body?.group ?? null);');
  });

  it("RB-48: the test room's SOUND MODE goes to its audio, the page's `gameAudio` -- `playerSettings.ts`'s default target", () => {
    const main = src(TR), ps = src(PS);
    expect(main).toContain('const audio = gameAudio;');
    expect(main).toMatch(/pageCardReads\(undefined, undefined, \{ valvesChanged: [^\n]*\}\);/);   // no `sound` given: the default
    expect(main).toContain('adoptPageOptions(withPageHooks(pageNativeOptionsState(assets.disc), pageHooks), localMenuOptions, (state) => { pageOptions = state; }, stopEarlyHome)');   // four arguments: the default
    expect(ps).toContain('const sound = o.sound ?? gameAudio;');
    expect(ps).toMatch(/sound: \{ setSoundMode\?\(mode: number\): void \} = gameAudio\): NativeOptionsState \{/);
    expect(src('audio.ts')).toContain('setSoundMode(mode: number): void { this.out.setSoundMode?.(mode); }');
  });

  it("the Forge's Play mounts the front end's match, so a `viaMount` read is the Forge's too", () => {
    expect(src('forge/match.ts').match(/mounted = mountMatch\(target, \{/g)).toHaveLength(2);
  });

  for (const r of PLAYER_SETTINGS_CENSUS) {
    for (const surface of ['main', 'testRoom', 'forgePlay'] as const) {
      const cell = r[surface];
      if ('reads' in cell) {
        const [file, text] = cell.reads;
        it(`${r.id} (${r.label}) -- ${surface} reads it: ${file}`, () => { expect(src(file)).toContain(text); });
      } else if ('todo' in cell) {
        it.todo(`${r.id} (${r.label}) -- ${surface}: ${cell.todo} -- ${cell.why}`);
      }
    }
  }
});
