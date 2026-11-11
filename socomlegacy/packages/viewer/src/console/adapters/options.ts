import { connectedPads } from '../../controllerInput';
import { CONTROLLER_LAYOUTS, controllerLayoutDescription } from '../../controllerSettings';
import { stickTunersOfPreset, VIDEO_PICTURES, type ValveEntry } from '@s2u/ui';
import { MOBILE_LAYOUT_ROW } from '../../mobileLayout';
import { gameMicrophoneOn, MIC_DEVICE_KEY, MIC_ENABLED_KEY } from '../../gameMicrophone';
import { launcherState, type LauncherState } from '../../modern/launcherState';
import { CONTROLS, SLIDER_RANGE_PERCENT, SLIDER_STEP_PERCENT, STICK_PRESET_CUSTOM, tunerDefault, type Control } from '../../modern/settings/model';
import { cardOptionStore, TUNER_SAVE_SETTLE_MS_ADAPTATION, type OptionStore } from '../../modern/settings/store';
import { pageSettings } from '../../pageStore';
import { PAD_SELECTION_KEY } from '../../setupPad';
import { TOUCHPAD_CROUCH_TOAST } from '../../controllerInput';
import { STANCE_MODE_ABOUT, STANCE_MODE_WORDS, STANCE_SEPARATE_BINDS_TIP, controllerStanceMode, readPreference, savePreference, setControllerStanceMode } from '../../startupSettings';
import { pagePicture } from '../../picture';
import { NAME_TAGS_DEFAULT_ADAPTATION, NAME_TAGS_LOOKS, NAME_TAGS_WORDS, readNameTags, saveNameTags } from '../../nameTags';
import { RANGE_READOUT_DEFAULT_ADAPTATION, RANGE_READOUT_VALUES, RANGE_READOUT_WORDS, readRangeReadout, saveRangeReadout } from '../../rangeReadout';
import { isCustom, PRESET_VALUES, resolveAutomatic, VIDEO_SCHEMA, videoSettingsKeeperV2, type Preset, type Rows, type VideoRow, type VideoSettingsV2 } from '../../videoSettings';
import { asksForWebGPU, GRAPHICS_BACKEND_APPLY_NOTE, GRAPHICS_BACKEND_KEY, graphicsBackendOverride, type GraphicsBackendPreference } from '../../graphicsBackend';
import { pageDeviceClass, type DeviceClass } from '../../deviceClass';
import { presetOfRows } from '../../autoQuality';
import { clearGraphicsDemoted, readGraphicsDemoted } from '../../graphicsDemotion';
import type { IconName } from '../icons';
import { BACKEND_WORDS } from '../render/extract';
import { PAD_DEAD_ZONE_LABEL } from '../render/remap';
import { APPEARANCE, THEMES, hex } from '../render/theme';
import { BACKDROP_URL } from '../backdrop';
import { installAction, readInstallSurface, type InstallSurface } from '../../pwa/install';
import { UPDATE_NOTICE } from '../../pwa/update';
import { pageVersion } from '../pageVersion';
import { pagePerfLine } from '../../perfLine';
import { INSTALL_APP_ROW, KEPT_DISC_ROW, REMAP_ROW, SHARE_SEND_ROW, THEME_PANEL_ROW, type Adapters, type KeptDisc, type OptCat, type OptRow } from '../state';
import { SHARE_SEND_ROW_ABOUT, SHARE_SEND_ROW_ACTION, SHARE_SEND_ROW_LABEL, SHARE_SEND_ROW_NOTE } from '../../discShareWords';
import type { LivePad } from './pad';
import { SKIP_MENU_HINT, SKIP_MENU_LABEL, SKIP_MENU_ROW, setSkipMenu, skipMenuOn } from '../skipMenu';

/**
 * The console launcher's Options (slice 2, part i; CX-5): the options that really exist, and none of the prototype's
 * proposals the emulator and the server do not support (CX.R5: no internal resolution, aspect ratio, frame rate, picture
 * smoothing, ping display, connection test or master volume). The original five categories plus Mobile:
 *
 * - **The memory card's** (`../../modern/settings/model` `CONTROLS`, the original's OPTIONS pages' valves and tuners;
 *   read and written through `../../modern/settings/store` `cardOptionStore` -- the original's save path, inside the
 *   card-save boundary). A tuner's slider steps 2 % (`SLIDER_STEP_PERCENT`); a choice or a switch its values; a stepper
 *   one (SCREEN ADJUST). What the card holds is editable without the disc; what it lacks takes its default from the
 *   disc's `global_valves.rdr` (the store seeded with the table, MU-5b) and is locked "Needs disc" until then -- the
 *   rule the retired modern Settings section kept (CX-25); a tuner's default is the code's (`tunerDefault`), the three
 *   stick tuners have none ("Not saved yet") and work with the Custom preset only. VIDEO MODE and the hard disk are
 *   read-only in the original's flow and are not offered here (the card's `video_mode`; Display's "Video" row is the
 *   page's picture, `VIDEO_PICTURE_ROW`, HD-4).
 * - **This browser's** (the setup page's keys): the controller (`s2u.startup.v1.pad.selection`), its stick dead zone
 *   (0-40 %, under its own profile, `../../controllerInput`), the button mapping (CX-14: the console's own pushed
 *   screen, `../render/remap`, over `../../padBinding`; the grammar opens it), the microphone's use in game and its
 *   device (`../../gameMicrophone`).
 * - **The launcher's own** (`s2u.console.v1.*`, through `pageSettings`): Interface size, Scanline overlay (Appearance's since LR-13), Backdrop
 *   motion -- the prototype's, which apply at once.
 * - **App** (PWA-6): Install app. The row opens a dialog; the dialog's button is the click that may call `prompt()`.
 *   DSH-4: with a disc share adapter, "Send game files to another device" beside it (the sender's code entry, the grammar's).
 * - **App**, LR-5: the version (the header badge's, LP.R7) as a read-only row, and while a new build waits the update
 *   notice's own words as a row whose Restart is the notice's (CX.R18); no row claims the launcher is up to date.
 * - **Appearance** (LR-5, LR.R8; the launcher redesign's new tab): the artifact's seven themes and its background picture
 *   (None / Crossroads) as picks -- each an action that writes its index under `s2u.console.v1.theme` / `.backdrop` --,
 *   Backdrop motion (moved from App), the clock (24-hour, 12-hour) and Launcher sounds and their volume (moved from
 *   Audio), every one saved in this browser; `../render/theme` reads them at each draw.
 * - **Account**: Remember me (OT.R61: chosen on the sign-in, ticked by default; the row says so), Sign out, and (DX-3) "Delete the
 *   kept disc": the disc's read set kept in this browser's storage (`../../discExtract`), said as DA.R7 asks of a kept
 *   copy -- what is kept, where, how to delete it -- and deleted only after the console's confirm (the grammar's).
 *
 * Each row's aside says where it saves. A browser adaptation with no original (OT.R28).
 */
export const CONSOLE_KEYS = {
  uiscale: 's2u.console.v1.uiscale', scan: 's2u.console.v1.scan', drift: 's2u.console.v1.drift',
  /** CX-52 (CX.R19): the launcher's UI sounds, on or off, and their volume (`./sounds`). */
  sounds: 's2u.console.v1.sounds', soundVolume: 's2u.console.v1.soundVolume',
  /** LR-5 (LR.R8): Appearance's theme (an index into `../render/theme` `THEMES`), its picture and its clock. */
  theme: 's2u.console.v1.theme', backdrop: 's2u.console.v1.backdrop', clock: 's2u.console.v1.clock',
} as const;

/**
 * LR-5: a theme's third swatch when its gold trim runs (the artifact's `r.sw.gold ? '#f2b43a' : glow`): the artifact's
 * gold, the design system's `--s2u-lx-accent` (LR.R14), held equal by `test/console/appearance.test.ts`. A swatch is an
 * inline colour (`../render/rows` refuses anything but hex), so the token's value, not its name.
 */
export const THEME_TRIM = '#f2b43a';

/** The option ids `../render/theme` reads are this adapter's keys (a type check: a renamed key fails to compile). */
const APPEARANCE_IDS: readonly (keyof typeof CONSOLE_KEYS)[] = [APPEARANCE.theme, APPEARANCE.picture, APPEARANCE.clock];
void APPEARANCE_IDS;

/**
 * OVERLAY-CONSOLE (MU2-16, OT.R51: "not all controllers have it so allow a rebind on it"): Options > Controller's
 * "Overlay button" row, the overlay's opening button -- since the overlay draws the console, the retired shell's
 * Settings page that chose it is no longer reached, so the console's Options offer it. The binding itself is the
 * overlay's (`../../modern/overlay/binding`, kept with the pad's bindings in this browser), handed in by the overlay
 * (`OptionsDeps.overlayButton`): nothing under `src/console/` loads the overlay's modules but the START hand-over
 * (`test/pageOverlaySeam.test.ts`), so the launcher page has no such row. Its choices: the Home button first (the
 * default), every button of the standard mapping (a game button opens by a hold: `overlayOpensBy`), then the
 * touchpad's click (17).
 */
export const OVERLAY_BUTTON_ROW = 'overlay-button';

/**
 * PF.R60 (the owner, 2026-10-27: "please make this a slider, and for modern mode, double the default. ps2 mode keeps the
 * original."; `../../detailDistance`, a browser adaptation over PF-30's per-visual gate, PF.R50): Options > Display's
 * Detail distance, 1.0× (the original) to 4.0× by 0.1, 2.0× by default -- the page's one stored factor, the Forge's View
 * row's too, drawn by the front end's match under the MODERN and HD (GoE SouL) pictures. VIDEO MODE's picture strip is the
 * disc's own dialog (`@s2u/ui` `videoPicture`), so the slider sits here, beside the launcher's other Display rows. Under
 * the PS2 picture the row is locked: the original's distance is drawn.
 */
export const DETAIL_DISTANCE_ROW = 'detail-distance';

/**
 * HD-4 (the owner, 2026-11-01: "make sure home gets the video too"; OT.R79, HD.R8 -- a browser adaptation with no
 * original): Options > Display's "Video", the page's picture -- Modern or PS2 (B206 ML-6 removed HD (GoE SouL): the HD
 * pack is chosen in Experiments > Mods) -- read and written through the page's one keeper (`../../picture`
 * `pagePicture`), the keeper the disc's VIDEO strip sets and a match started from Home reads (`../../frontEnd` hands it
 * to `../../matchMount`): the two agree both ways, and a running match hears a change. Never the card's `video_mode`.
 */
export const VIDEO_PICTURE_ROW = 'video-picture';

/**
 * CPS-4a (CPS.R7, a browser adaptation with no original; the owner, Craig, 2026-11-02: "Start building out new video
 * settings with sensible defaults in the client itself"): Options > Display's Render scale, Shadows and Show FPS -- since
 * VS-2 three of the video schema's rows (`VIDEO_ROW_IDS`; Show FPS is the performance overlay, the START menu's SHOW FPS
 * key, `../../matchFps` `FPS_SHOWN_KEY`), their ids kept.
 */
export const RENDER_SCALE_ROW = 'render-scale';
export const SHADOWS_ROW = 'shadows';
export const SHOW_FPS_ROW = 'show-fps';

/**
 * **VS-2 (the video settings plan, product track; every row a browser adaptation with no original; VS.R4, VS.R8):
 * Options > Display's "This browser" rows drawn from `../../videoSettings` `VIDEO_SCHEMA`**, through the page's v2 keeper
 * (`videoSettingsKeeperV2`), in the schema's order under the spec §4.2's groups -- Quality (the Preset row, under the
 * "This browser" heading the card rows' slice 3 set), Display, Detail, Renderer, Picture (the page's picture and Name tags
 * beside the schema's colour filter), then Restore defaults and This device (Device memory, Detected, "Not right?" while
 * an Xbox pick is saved, Copy performance line):
 * - a `choice` row as its values, a `percent` row as the launcher's slider (50-100 % by 5; its steps staged and written
 *   through the keeper once, `TUNER_SAVE_SETTLE_MS_ADAPTATION` after the last -- #726's pattern -- or at once on another
 *   row's change, a reset, the adapter's dispose or `pagehide`), a `toggle` as Off / On;
 * - each row's help is its schema row's `effect`; a `customOnly` row is drawn only while the settings are Custom
 *   (`isCustom`); the Preset row offers Custom only then, and a preset chosen writes its values (the keeper's `set`);
 * - a `nextMatch` row's note says `GRAPHICS_BACKEND_APPLY_NOTE`, and it is marked `nextMatch` so the in-match overlay
 *   draws it locked (`../state` `optCategories`); no row asks for a reload.
 * The Graphics and Detail distance rows write through the keeper, so a prepared match (VS-6) and every keeper of the page
 * hear them.
 */
export const VIDEO_PRESET_ROW = 'video-preset';
export const VIDEO_ROW_IDS: Readonly<Record<VideoRow['key'], string>> = {
  preset: VIDEO_PRESET_ROW, renderScalePct: RENDER_SCALE_ROW, ceiling: 'video-ceiling', frameCap: 'video-frame-cap', overlay: SHOW_FPS_ROW,
  shadows: SHADOWS_ROW, detailDistance: DETAIL_DISTANCE_ROW, antialias: 'video-antialias', filtering: 'video-filtering',
  graphics: 'graphics-backend', power: 'video-power', colourFilter: 'video-colour-filter',
};
/** The rows' labels (the spec §4.2's words). */
export const VIDEO_ROW_LABELS: Readonly<Record<VideoRow['key'], string>> = {
  preset: 'Preset', renderScalePct: 'Render scale', ceiling: 'Resolution ceiling', frameCap: 'Frame cap', overlay: 'Performance overlay',
  shadows: 'Shadows', detailDistance: 'Detail distance', antialias: 'Antialias', filtering: 'Texture filtering',
  graphics: 'Graphics', power: 'Power preference', colourFilter: 'Colour filter',
};
/** The groups' headings; the first group's row carries the tab's "This browser" heading instead. */
export const VIDEO_GROUP_HEADINGS: Readonly<Record<VideoRow['group'], string>> = { quality: 'Quality', display: 'Display', detail: 'Detail', renderer: 'Renderer', picture: 'Picture' };
/** Restore defaults: Automatic, every row its values, the readout off (the keeper's `restoreDefaults`). */
export const VIDEO_RESTORE_ROW = 'video-restore';
/** This device (the spec §4.2): the readouts and the Xbox pick's way out. */
export const DEVICE_GROUP_HEADING = 'This device';
export const DEVICE_MEMORY_ROW = 'device-memory';
export const DEVICE_DETECTED_ROW = 'device-detected';
export const DEVICE_NOT_RIGHT_ROW = 'device-not-right';
/** The device classes as Detected names them (`../../deviceClass`). */
export const DEVICE_CLASS_WORDS: Readonly<Record<DeviceClass, string>> = {
  xbox: 'Xbox', software: 'Software renderer', touch: 'Touch', lowMemory: 'Low memory', standard: 'Standard', high: 'High',
};
/** Device memory under the Xbox class: the browser's own budget, whatever the console holds (`../../autoQuality`, §4.4 item 5). */
export const XBOX_MEMORY_WORDS = '1 GB (the browser\'s budget)';
const PRESET_WORDS_OF: Readonly<Record<'performance' | 'balanced' | 'quality', string>> = { performance: 'Performance', balanced: 'Balanced', quality: 'Quality' };
const ADDRESS_WORDS: Readonly<Record<GraphicsBackendPreference, string>> = { auto: 'Automatic', webgl2: 'WebGL2', xbox: 'Xbox', webgpu: 'WebGPU' };

/**
 * CPS-5 (product track, a browser adaptation with no original): Options > Display's "Copy performance line", last under
 * "This browser" -- the page's one line (`../../perfLine` `pagePerfLine`: the build, the browser, the renderer, the
 * screen, the video settings and the last frames' times) written to the clipboard on Cross or a click; the row's verb
 * reads "Copied" for `PERF_LINE_COPIED_MS_ADAPTATION`. Where the browser refuses the clipboard (a pad's Cross is no user
 * gesture to it), or has none, the line itself is the row's aside, to select and copy by hand. The overlay over a match
 * draws these same rows, so it works mid-match. It changes nothing the game does.
 */
export const PERF_LINE_ROW = 'perf-line';

/**
 * SS-2 (H422 answered (a), the owner, Craig, 2026-11-07; product track, a browser adaptation with no original): Options >
 * Display's "Name tags" under "This browser", Original / Modern (Modern by default, `../../nameTags`
 * `NAME_TAGS_DEFAULT_ADAPTATION`): the look of the teammates' over-head tags -- the original's, or LATER 671's smaller ones
 * fading with distance (OT.R101). The card's Teammate names (`DISPLAY_MP_TEAM_NAMES`, the original's 0 / 1) turns them on
 * and off; this row picks only the look. Read at a match's mount, as the valve is.
 */
export const NAME_TAGS_ROW = 'name-tags';

/**
 * HUD-ALIVE C (OT.R117, the owner, Craig, 2026-11-09; product track, a browser adaptation with no original): Options >
 * Display's "Range readout" under "This browser", Off / On (Off by default, `../../rangeReadout`
 * `RANGE_READOUT_DEFAULT_ADAPTATION`): the range finder's metres in the info box's spot, in the consoles' count's place
 * (`RANGE_READOUT_ADAPTATION`). Read at a match's mount, as Name tags is.
 */
export const RANGE_READOUT_ROW = 'range-readout';

/** SS-1's D2: Controller's browser dead zone row, named apart from the card's Dead zone (`../render/remap`'s, one name). */
export { PAD_DEAD_ZONE_LABEL };
/** How long the row says "Copied". A browser adaptation. */
export const PERF_LINE_COPIED_MS_ADAPTATION = 2000;

/** The overlay's opening button as the overlay hands it to the console's Options (`../../modern/overlay/binding`). */
export interface OverlayButtonBinding {
  /** The default (the standard mapping's Home button, 16). */
  home: number;
  read(): number;
  save(button: number): void;
  /** A button's name as the controller page names it. */
  name(button: number): string;
}

/** The row's choices: Home first, the standard mapping's sixteen, then the touchpad's click (17). */
export const overlayButtonChoices = (home: number): number[] => [home, ...Array.from({ length: 16 }, (_, i) => i), 17].filter((b, i, all) => all.indexOf(b) === i);

export type LiveOptions = Adapters['options'] & { dispose(): void };

export interface OptionsDeps {
  readDefaults?: () => Promise<readonly ValveEntry[]>;
  store?: OptionStore;
  launcher?: LauncherState;
  pad?: LivePad;
  signedIn: () => boolean;
  /** DX-3: the disc kept in this browser (`./disc` `kept` / `forgetKept`); absent, the row says nothing is kept. */
  kept?: { info(): KeptDisc | null; forget(): Promise<void> };
  /** OVERLAY-CONSOLE: the overlay's opening button, for Options > Controller's "Overlay button" row; absent, no row. */
  overlayButton?: OverlayButtonBinding;
  /** The connected pads as `index:id` keys and names; absent, `navigator`'s. */
  pads?: () => { key: string; name: string }[];
  media?: MediaDevices;
  /** B61 F3: whether touch exists here (Options > Mobile shown); absent, `touchHere`. */
  touch?: () => boolean;
  /** PWA-6: how this browser installs. Absent, read from the window. */
  install?: () => InstallSurface;
  /**
   * HD-4 review F2: whether this page's match follows the page's picture -- the console page (Home's START mounts the
   * front end) and the overlay over the front end's pages; not the test room, the forge or the launch settings, whose
   * matches have their own look. Absent, it does (the console page); false, Display has no "Video" row.
   */
  videoPicture?: boolean;
  /** DSH-4: the page has a disc share adapter: App's "Send game files to another device" row (the grammar opens its dialog). */
  share?: boolean;
  /**
   * LR-5 (CX.R18): whether a new build waits -- the update notice is on the page (`../../pwa/update` `showUpdateNotice`,
   * `[data-pwa-update]`) -- and its Restart (the notice's own button). Absent, the page's.
   */
  update?: { waiting(): boolean; restart(): void };
  /** CPS-5: the performance line; absent, the page's (`../../perfLine` `pagePerfLine`). */
  perfLine?: () => string;
  /** CPS-5: the clipboard the line is written to; absent, `navigator.clipboard`; null, none. */
  clipboard?: () => { writeText(text: string): Promise<void> } | null;
}

/** LR-5: App's version row (the badge's, LP.R7) and the update notice's row (CX.R18; shown only while a build waits). */
/**
 * LR-20 (the LR.R11 side-by-side's P12: "Button mapping / Remap" repeated the act): the mapping row's line says what the
 * screen it opens does; Install app's, where the browser installs, is the artifact's own (`A('Install app', 'install',
 * 'Adds the launcher to your desktop and app list')`). A browser adaptation: the launcher's words. LR-20's fold (3) (the
 * box at 8b88093ca, no install prompt ready): the line wherever the verb is Install (`chromium` and `other`); "Installed",
 * "Add to Home Screen" and "Not supported" keep their own words.
 */
export const REMAP_HINT = 'Choose what each button does';
export const INSTALL_HINT = 'Adds the launcher to your desktop and app list';
export const VERSION_ROW = 'version';
export const UPDATE_ROW = 'update-restart';

/**
 * B61's review F3, part 2 (the merge controller's ruling): touch exists here -- a coarse pointer
 * (`matchMedia('(pointer: coarse)')`) or any touch point (`navigator.maxTouchPoints > 0`). A browser adaptation.
 */
export function touchHere(): boolean {
  try {
    const coarse = globalThis.window?.matchMedia?.('(pointer: coarse)').matches ?? false;
    return coarse || (globalThis.navigator?.maxTouchPoints ?? 0) > 0;
  } catch { return false; }
}

/** One row's behaviour: its values, its value's index, its default's, why it is locked, and its write. */
interface Spec {
  row: Omit<OptRow, 'values' | 'def' | 'locked' | 'warn'>;
  /** SEP-ROWS: the row's warning now (`OptRow.warn`), read at each draw; absent or undefined, none. */
  warn?(): string | undefined;
  values(): readonly string[];
  get(): number | undefined;
  def(): number | undefined;
  lock(): string | undefined;
  set(i: number): boolean;
  /** CX-23: a tuner's Left / Right, from the value held; absent, the neighbouring index is set. */
  step?(d: -1 | 1): boolean;
  /** CX-23: a tuner's reset writes the default as the code holds it; absent, `set(def())`. */
  reset?(): boolean;
}

/**
 * CX-23 (MU2-6's review F1): a tuner's values are the whole percents 0-100, its index the held value's percent, so a value
 * the card holds off the 2 % grid (the headset's 0.75) reads as a whole percent (75 %, `Math.round(v * 100)`, as the
 * retired modern Settings section read it, CX-25). A press steps the held percent by SLIDER_STEP_PERCENT (research 302
 * §4: the original widget's two-percent track step), clamped into the tuner's range, and writes it as the card holds a
 * tuner -- a float32 real, `Math.fround(percent / 100)`, as the original's `SetValue n` stores n / 100 (research 302 §4)
 * and the modern settings write -- so 0.75 steps to 0.77 / 0.73 and never to 0.7700000000000001.
 */
const PERCENT_MAX = SLIDER_RANGE_PERCENT[1] - SLIDER_RANGE_PERCENT[0];
const PERCENT = Array.from({ length: PERCENT_MAX + 1 }, (_, i) => `${SLIDER_RANGE_PERCENT[0] + i}%`);
const percentOf = (v: number): number => Math.round(v * 100) - SLIDER_RANGE_PERCENT[0];
const tunerOf = (i: number): number => Math.fround((SLIDER_RANGE_PERCENT[0] + Math.max(0, Math.min(PERCENT_MAX, i))) / 100);
const OFF_ON = ['Off', 'On'] as const;

/** What a card row does, in one sentence (the aside's line). The labels are the model's. */
// Neutral by rule (the slice-2 review, CX.R5): each line says what the setting is, from the model's own label and
// values, and claims no behaviour the original's code or the server does not give.
const ABOUT: Readonly<Record<string, string>> = {
  MUSIC_VOLUME: 'Menu and match music. The opening movie soundtrack uses Dialog volume.',
  SOUND_VOLUME: 'The sound volume.',
  DIALOG_VOLUME: 'Dialogue and movie soundtracks, including the opening menu background.',
  HEADSET_CONTROLLER: 'The headset volume.',
  STEREO_CONTROLLER: 'Stereo, mono or Dolby.',
  BRIGHTNESS: 'The picture’s brightness.',
  BOBBING_1ST_PERSON: 'Head bob on or off.',
  DISPLAY_MP_TEAM_NAMES: 'Teammate names on or off. Their look is Name tags, under This browser.',
  VIBRATION_CONTROLLER: 'Vibration on or off, where your controller has it.',
  AutoAim: 'Aim assist on or off.',
  INVERT_PITCH_CONTROLLER: 'Pitch normal or inverted.',
  FIREMODESWAP_CONTROLLER: 'The fire rate on L3 or on Select.',
  stick_preset: 'The stick preset: Recruit, Sailor, Seal or Custom.',
  STICK_SENSITIVITY: 'The look speed, with the Custom preset.',
  STICK_INERTIA: 'The acceleration, with the Custom preset.',
  STICK_DEADZONE: 'The stick dead zone, with the Custom preset.',
  EnableExternalWhispers: 'External whispers on or off.',
  ScreenOriginX: 'The picture’s position across the screen (SCREEN ADJUST).',
  ScreenOriginY: 'The picture’s position down the screen (SCREEN ADJUST).',
};

export function liveOptions(notify: () => void, deps: OptionsDeps): LiveOptions {
  const store = deps.store ?? cardOptionStore();
  const launcher = deps.launcher ?? launcherState();
  const offSave = store.observeSaves?.(notify);
  let defaults = new Map<string, number>();
  let table: 'none' | 'reading' | 'read' = 'none';
  let mics: { id: string; name: string }[] = [];
  let micsAsked = false;
  /** SEP-SHOW: a toast a row's change has to say, taken once by the grammar (`takeToast`). */
  let toast: string | null = null;

  const readTable = (): void => {
    if (!launcher.isoInserted() && !deps.readDefaults) { table = 'none'; return; }
    const a = launcher.assets?.() ?? (deps.readDefaults ? { readValveDefaults: deps.readDefaults } : null);
    if (!a || table !== 'none') return;
    table = 'reading';
    a.readValveDefaults().then((rows: readonly ValveEntry[]) => {
      defaults = new Map(rows.map((r) => [r.name, r.value]));
      store.seed?.(rows);
      table = 'read';
      notify();
    }, () => { table = 'none'; notify(); });
  };
  readTable();
  // LR-5 (review-lr-5 F1): the update notice is the page's, not ours; when it mounts or is dismissed the rows are drawn again.
  let notified = !!globalThis.document?.querySelector('[data-pwa-update]');
  const watchNotice = (): void => { const now = !!globalThis.document?.querySelector('[data-pwa-update]'); if (now !== notified) { notified = now; notify(); } };
  const noticeObs = typeof MutationObserver !== 'undefined' && globalThis.document?.body ? new MutationObserver((recs) => {
    const dismissed = recs.some((r) => r.type === 'attributes' && r.attributeName === 'data-pwa-dismissed');
    if (dismissed) notify(); else watchNotice();
  }) : null;
  noticeObs?.observe(globalThis.document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pwa-dismissed'] });
  const offDisc = launcher.onChange(() => { if (!launcher.isoInserted() && !deps.readDefaults) { table = 'none'; defaults = new Map(); store.seed?.(null); } readTable(); notify(); });
  const onOffer = (): void => { notify(); };
  const offerWin = typeof globalThis.window === 'undefined' ? null : globalThis.window;
  offerWin?.addEventListener('s2u-install-offer', onOffer);

  const cardNote = (): string => store.pending?.() ? 'Applies now. Saving to your memory card...' : store.refusal?.() ? `Not saved: ${store.refusal()}` : `Saved to your memory card (slot ${store.slot?.() ?? 1}).`;
  const cardLock = (raw: number | undefined): string | undefined => {
    if (!store.usable()) return 'Card cannot be read';
    if (raw !== undefined) return undefined;
    return !launcher.isoInserted() && !deps.readDefaults ? 'Needs disc' : table === 'reading' ? 'Reading disc' : 'Not saved yet';
  };
  const valveRaw = (name: string): number | undefined => store.valve(name) ?? defaults.get(name);
  // SS-1's D5 (a browser adaptation): a slider's steps are heard live at once and written to the card once the row
  // settles (`../../modern/settings/store` `stageTuner`); a reset writes at once. A store without staging writes each step.
  const stage = (tuner: string, value: number): boolean => (store.stageTuner ? store.stageTuner(tuner, value) : store.setTuner(tuner, value));

  const cardSpec = (c: Control): Spec | null => {
    const row = { id: c.id, label: c.label, about: ABOUT[c.id] ?? '', note: cardNote() };
    if (c.kind === 'slider') {
      const raw = (): number | undefined => store.tuner(c.tuner) ?? tunerDefault(c.tuner) ?? undefined;
      const idx = (v: number | undefined): number | undefined => (v === undefined ? undefined : percentOf(v));
      return {
        row, values: () => PERCENT, get: () => idx(raw()),
        def: () => idx(tunerDefault(c.tuner) ?? undefined),
        lock: () => {
          if (!store.usable()) return 'Card cannot be read';
          if (c.customStickOnly && valveRaw('stick_preset') !== STICK_PRESET_CUSTOM) return 'Custom preset';
          return raw() === undefined ? 'Not saved yet' : undefined;
        },
        set: (i) => stage(c.tuner, tunerOf(i)),
        step: (d) => {
          const v = raw();
          if (v === undefined) return false;
          const to = tunerOf(percentOf(v) + d * SLIDER_STEP_PERCENT);
          return to === v ? false : stage(c.tuner, to);                // at a bound nothing is written
        },
        reset: () => { const d = tunerDefault(c.tuner); return d === null ? false : store.setTuner(c.tuner, d); },
      };
    }
    if (c.kind === 'readonly') return null;                    // VIDEO MODE, the hard disk: the original's own flow
    const values = c.kind === 'switch' ? [...OFF_ON] : c.kind === 'choice' ? c.options.map((o) => o.label)
      : Array.from({ length: Math.floor((c.max - c.min) / c.step) + 1 }, (_, i) => String(c.min + i * c.step));
    const toIndex = (v: number | undefined): number | undefined => {
      if (v === undefined) return undefined;
      if (c.kind === 'switch') return v === 0 ? 0 : 1;
      if (c.kind === 'choice') { const i = c.options.findIndex((o) => o.value === v); return i < 0 ? undefined : i; }
      return Math.round((v - c.min) / c.step);
    };
    const toValue = (i: number): number => (c.kind === 'switch' ? i : c.kind === 'choice' ? c.options[i]?.value ?? 0 : c.min + i * c.step);
    // OT.R72 (LATER 315): a stick preset chosen is `SetStickPreset`'s (`FUN_0027b790`) -- under CUSTOM it writes the
    // preset's three sliders too (`@s2u/ui` `stickTunersOfPreset`), which CUSTOM then keeps.
    const set = (i: number): boolean => {
      const v = toValue(i);
      if (c.valve === 'stick_preset' && store.setStickPreset) return store.setStickPreset(v);
      const stored = c.valve === 'stick_preset' ? valveRaw('stick_preset') ?? 0 : 0;   // read before the write
      if (!store.setValve(c.valve, v)) return false;
      if (c.valve === 'stick_preset') {
        // Review F1: a card with no stick variables holds, in the original's session, the STORED preset's three (the boot's
        // UIStoreOptions, FUN_0027b960 D:L125202-125230); Custom writes nothing (FUN_0027b790 D:L125077-125078) and keeps
        // them -- RECRUIT's only where the stored preset is RECRUIT or CUSTOM. Every value already held is kept.
        const t = stickTunersOfPreset(v < STICK_PRESET_CUSTOM ? v : stored > 0 && stored < STICK_PRESET_CUSTOM ? stored : 0);
        for (const [name, value] of [['STICK_SENSITIVITY', t.sensitivity], ['STICK_INERTIA', t.inertia], ['STICK_DEADZONE', t.deadZone]] as const) {
          if (v < STICK_PRESET_CUSTOM || store.tuner(name) === undefined) store.setTuner(name, value);
        }
      }
      return true;
    };
    return {
      row, values: () => values, get: () => toIndex(valveRaw(c.valve)), def: () => toIndex(defaults.get(c.valve)),
      lock: () => cardLock(valveRaw(c.valve)), set,
    };
  };
  const layout: Spec = {
    row: { id: 'SelectedControllerConfig', label: 'Controller layout',
      get about() { return controllerLayoutDescription(valveRaw('SelectedControllerConfig') ?? 1); },
      get note() { return cardNote(); } },
    values: () => CONTROLLER_LAYOUTS.map(l => l.label),
    get: () => Math.max(0, CONTROLLER_LAYOUTS.findIndex(l => l.value === (valveRaw('SelectedControllerConfig') ?? 1))),
    def: () => 0,
    lock: () => store.usable() && store.setControllerLayout ? undefined : 'Card cannot be read',
    set: i => { const selected = CONTROLLER_LAYOUTS[i]; return !!selected && !!store.setControllerLayout?.(selected.value); },
  };
  const cards = (group: Control['group']): Spec[] => CONTROLS.filter((c) => c.group === group).map(cardSpec).filter((s): s is Spec => s !== null);

  const own = (key: keyof typeof CONSOLE_KEYS, label: string, values: readonly string[], def: number, about: string): Spec => ({
    row: { id: key, label, about, note: 'Saved to this browser. Applies now.' },
    values: () => values,
    get: () => { const n = Number(pageSettings.get(CONSOLE_KEYS[key])); return Number.isInteger(n) && n >= 0 && n < values.length ? n : def; },
    def: () => def, lock: () => undefined,
    set: (i) => { pageSettings.set(CONSOLE_KEYS[key], String(i)); return true; },
  });

  /**
   * CX-52: a launcher row whose unset key reads as its default. `own` reads an unset key as 0 (`Number(null)`), so its
   * On-by-default rows read Off until first set; these two must read On and 70% from the start (the owner's "On").
   * `own`'s rows default to 0, so they read as their default from the start (LATER 197: Scanline overlay and Backdrop
   * motion declared On while reading Off; their default was made Off -- the merge controller's call for the owner,
   * 2026-10-21, product track). LR-37 (the owner, 2026-10-29: "Turn Backdrop motion on by default.") overturns it for
   * Backdrop motion: an `ownSet` row defaulting On (reduced motion still stills it, `../render/sheets`). Scanline stays Off.
   */
  const ownSet = (key: keyof typeof CONSOLE_KEYS, label: string, values: readonly string[], def: number, about: string): Spec => {
    const spec = own(key, label, values, def, about);
    return { ...spec, get: () => (pageSettings.get(CONSOLE_KEYS[key]) === null ? def : spec.get()) };
  };

  const pads = (): { key: string; name: string }[] => {
    if (deps.pads) return deps.pads();
    try {
      return connectedPads(globalThis.navigator ?? {}).map((p) => ({ key: `${p.index}:${p.id}`, name: p.id }));
    } catch { return []; }
  };
  const padDevice: Spec = {
    row: { id: 'pad-device', label: 'Controller', about: 'Which controller the game reads; Automatic takes the first standard one.', note: 'Saved to this browser.' },
    values: () => ['Automatic', ...pads().map((p) => p.name)],
    get: () => { const k = readPreference(PAD_SELECTION_KEY) ?? 'auto'; const i = pads().findIndex((p) => p.key === k); return i < 0 ? 0 : i + 1; },
    def: () => 0, lock: () => undefined,
    set: (i) => { const key = i === 0 ? 'auto' : pads()[i - 1]?.key ?? 'auto'; savePreference(PAD_SELECTION_KEY, key); deps.pad?.select(key); return true; },
  };
  const padDead: Spec = {
    // SS-1's D2 (a browser adaptation): named for what it is -- this browser's pad calibration, before the game's own curve
    // -- so it cannot be read as the card's Dead zone under "In the game" (CONTROLLER OPTIONS' DEAD ZONE). Id and key kept.
    row: { id: 'pad-dead', label: PAD_DEAD_ZONE_LABEL, about: 'How far the stick moves before this browser passes it to the game. Raise it if your aim drifts on its own. The game’s own Dead zone, with the Custom preset, is under Layout and aiming.', note: 'Saved to this browser, for this controller.' },
    values: () => Array.from({ length: 41 }, (_, i) => `${i}%`),
    get: () => (deps.pad ? Math.round(deps.pad.deadZone() * 100) : undefined), def: () => 15,
    lock: () => (deps.pad?.connected() ? undefined : 'Connect a controller'),
    set: (i) => { deps.pad?.setDeadZone(i / 100); return true; },
  };
  // PP-5 (OT.R67; PP.R1: the fallback "available as an option in controller settings and rebindings"): the browser's
  // Stance mode, COMBINED by default; the Crouch and Prone binds are the Button mapping's (`../render/remap`). STM.R1 (the
  // owner, 2026-10-30, reversing OBF-11): offered again, COMBINED / SEPARATE, its tooltip one line per mode
  // (`STANCE_MODE_ABOUT`, the Button mapping's row's too); SEPARATE chosen here gives the chosen pad's unbound Prone
  // Triangle's button as the Button mapping's row does (`LivePad.enterSeparate`; Crouch left unbound, STM.R1a, but
  // for a free touchpad, SEP-SHOW, said by `takeToast`).
  // SEP-ROWS (the owner, 2026-11-11: "that alias should now show a tooltip when viewing that setting and a warning icon
  // when separate is on and crouch and prone are not set"): the row's tip, in its aside (the focused or hovered row's
  // tooltip), and the warning mark while SEPARATE leaves either stance with no button on the chosen pad
  // (`LivePad.stanceBindsMissing`, read at each draw, so it follows Button mapping).
  const stanceMode: Spec = {
    row: { id: 'stance-mode', label: 'Stance mode', about: STANCE_MODE_ABOUT, note: 'Saved to this browser. Applies now.', tip: STANCE_SEPARATE_BINDS_TIP },
    warn: () => (controllerStanceMode() === 'separate' && deps.pad?.stanceBindsMissing?.() ? STANCE_SEPARATE_BINDS_TIP : undefined),
    values: () => [STANCE_MODE_WORDS.pop, STANCE_MODE_WORDS.separate],
    get: () => (controllerStanceMode() === 'separate' ? 1 : 0), def: () => 0, lock: () => undefined,
    set: (i) => {
      const to = i === 1 ? 'separate' : 'pop';
      // SEP-SHOW: a touchpad pad's Crouch bound to the touchpad on the way in is said (`TOUCHPAD_CROUCH_TOAST`).
      if (to === 'separate' && controllerStanceMode() !== 'separate' && deps.pad?.enterSeparate?.()) toast = TOUCHPAD_CROUCH_TOAST;
      setControllerStanceMode(to);
      return true;
    },
  };
  const remap: Spec = {
    // CX-14 (CX.R13, OT.R60): the console's own mapping screen (`../render/remap`), pushed by the grammar's `optAction`
    // (`REMAP_ROW`); this adapter's action has nothing to say. The prototype's word for the row's action, "Remap".
    row: { id: REMAP_ROW, label: 'Button mapping', action: 'Remap', hint: REMAP_HINT, about: 'Map your controller buttons to the buttons used by your selected layout.', note: 'Saved to this browser, for this controller.' },
    values: () => [], get: () => undefined, def: () => undefined, lock: () => undefined, set: () => false,
  };
  const ob = deps.overlayButton;
  const obChoices = ob ? overlayButtonChoices(ob.home) : [];
  const overlayButton: Spec[] = ob ? [{
    row: { id: OVERLAY_BUTTON_ROW, label: 'Overlay button', about: 'The button that opens this menu over a game. A button the game also uses opens it by a hold, so its tap stays the game\u2019s, and never in a round.', note: 'Saved to this browser.' },
    values: () => obChoices.map((b) => ob.name(b)),
    get: () => Math.max(0, obChoices.indexOf(ob.read())), def: () => 0, lock: () => undefined,
    set: (i) => { const b = obChoices[i]; if (b === undefined) return false; ob.save(b); return true; },
  }] : [];
  const micOn: Spec = {
    row: { id: 'mic-on', label: 'Use microphone in game', about: 'Your microphone for voice chat in the game.', note: 'Saved to this browser.' },
    values: () => OFF_ON, get: () => (gameMicrophoneOn() ? 1 : 0), def: () => 1, lock: () => undefined,
    set: (i) => { savePreference(MIC_ENABLED_KEY, i === 1 ? 'on' : 'off'); return true; },
  };
  const askMics = (): void => {
    if (micsAsked) return;
    micsAsked = true;
    const media = deps.media ?? globalThis.navigator?.mediaDevices;
    media?.enumerateDevices?.().then((list) => {
      mics = list.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== '').map((d, i) => ({ id: d.deviceId, name: d.label || `Microphone ${i + 1}` }));
      notify();
    }, () => { /* none listed: the default only */ });
  };
  const micDevice: Spec = {
    row: { id: 'mic-device', label: 'Microphone', about: 'Which microphone the game uses. Names show once the browser has allowed it.', note: 'Saved to this browser.' },
    values: () => ['System default', ...mics.map((m) => m.name)],
    get: () => { const k = readPreference(MIC_DEVICE_KEY) ?? ''; const i = mics.findIndex((m) => m.id === k); return i < 0 ? 0 : i + 1; },
    def: () => 0, lock: () => undefined,
    set: (i) => { savePreference(MIC_DEVICE_KEY, i === 0 ? '' : mics[i - 1]?.id ?? ''); return true; },
  };
  const picture = pagePicture();
  const offPicture = picture.observe(() => { notify(); });   // HD-4: VIDEO's strip (over a match) moves this row and the lock below
  const videoPicture: Spec = {
    row: {
      id: VIDEO_PICTURE_ROW, label: 'Video',
      about: 'The picture a match draws: Modern at your screen\u2019s size or PS2\u2019s 640 x 448 frame. The same choice as VIDEO MODE in the game\u2019s own Options.',
      note: 'Saved to this browser. Applies now, in a match too.',
    },
    values: () => ['Modern', 'PS2'],
    get: () => Math.max(0, VIDEO_PICTURES.indexOf(picture.get())), def: () => 0, lock: () => undefined,
    set: (i) => { const p = VIDEO_PICTURES[i]; if (!p) return false; picture.set(p); return true; },
  };
  // CPS-5 (a browser adaptation): Copy performance line -- "Copied" for two seconds, or the line in the aside if refused.
  let perfCopied = false;
  let perfRefused: string | null = null;
  let perfTimer: ReturnType<typeof setTimeout> | null = null;
  const perfLineSpec = (): Spec => ({
    row: {
      id: PERF_LINE_ROW, label: 'Copy performance line', action: perfCopied ? 'Copied' : 'Copy',
      about: perfRefused ?? 'One line about how this browser draws the game -- its renderer, screen, video settings and its latest frame times -- to paste into a report. It names no player and no address.',
      note: perfRefused !== null ? 'Select the line above and copy it: the browser refused the clipboard.' : 'Copied to your clipboard.',
    },
    ...none,
  });
  const copyPerfLine = async (): Promise<string> => {
    const line = (deps.perfLine ?? (() => pagePerfLine()))();
    const clip = deps.clipboard ? deps.clipboard() : (globalThis.navigator?.clipboard ?? null);
    try {
      if (!clip) throw new Error('no clipboard');
      await clip.writeText(line);
    } catch {
      perfCopied = false;
      perfRefused = line;
      notify();
      return "The browser refused the clipboard: the line is in this row's note";
    }
    perfRefused = null;
    perfCopied = true;
    if (perfTimer !== null) clearTimeout(perfTimer);
    perfTimer = setTimeout(() => { perfTimer = null; perfCopied = false; notify(); }, PERF_LINE_COPIED_MS_ADAPTATION);
    notify();
    return 'Performance line copied';
  };
  // SS-2 (H422 (a)): the tags' look, this browser's key; the card's Teammate names keeps on / off.
  const nameTags: Spec = {
    row: {
      id: NAME_TAGS_ROW, label: 'Name tags',
      about: 'How your teammates\u2019 names over their heads look: Original as the game drew them, or Modern, smaller and fading with distance. Teammate names, above, turns them on and off; this picks the look.',
      note: 'Saved to this browser. Applies from the next match.',
    },
    values: () => NAME_TAGS_LOOKS.map((l) => NAME_TAGS_WORDS[l]),
    get: () => NAME_TAGS_LOOKS.indexOf(readNameTags()), def: () => NAME_TAGS_LOOKS.indexOf(NAME_TAGS_DEFAULT_ADAPTATION), lock: () => undefined,
    set: (i) => { const l = NAME_TAGS_LOOKS[i]; if (!l) return false; saveNameTags(l); return true; },
  };
  // HUD-ALIVE C (OT.R117): the range readout, this browser's key; off draws the original's consoles' count.
  const rangeReadout: Spec = {
    row: {
      id: RANGE_READOUT_ROW, label: 'Range readout',
      about: 'Shows the distance in metres to what your reticle is on, in the box under your name, in place of the player count the game shows there. The scope\u2019s RANGE line is shown either way.',
      note: 'Saved to this browser. Applies from the next match.',
    },
    values: () => RANGE_READOUT_VALUES.map((v) => RANGE_READOUT_WORDS[v]),
    get: () => RANGE_READOUT_VALUES.indexOf(readRangeReadout()), def: () => RANGE_READOUT_VALUES.indexOf(RANGE_READOUT_DEFAULT_ADAPTATION), lock: () => undefined,
    set: (i) => { const v = RANGE_READOUT_VALUES[i]; if (!v) return false; saveRangeReadout(v); return true; },
  };
  // VS-2: the video rows from the schema, through the page's v2 keeper (a running match and a prepared one hear it).
  const v2 = videoSettingsKeeperV2();
  // A change from elsewhere (the native VIDEO rows, a match, another tab's keeper) redraws the rows; this adapter's own
  // writes are drawn by the caller's notify (`set`, `step`, `reset`, `action`), so they are not drawn twice.
  let ownWrite = false;
  const offV2 = v2.observe(() => { if (!ownWrite) notify(); });
  const quiet = (f: () => void): void => { ownWrite = true; try { f(); } finally { ownWrite = false; } };
  // The render scale slider's steps staged and written once the row settles (#726's pattern, `TUNER_SAVE_SETTLE_MS_ADAPTATION`).
  let stagedPct: number | null = null;
  let pctTimer: ReturnType<typeof setTimeout> | null = null;
  const pctWin = typeof globalThis.window === 'undefined' ? null : globalThis.window;
  const onPctHide = (): void => { flushPct(); };
  function flushPct(): void {
    if (pctTimer !== null) { clearTimeout(pctTimer); pctTimer = null; }
    pctWin?.removeEventListener('pagehide', onPctHide);
    if (stagedPct === null) return;
    const pct = stagedPct;
    stagedPct = null;
    v2.set({ renderScalePct: pct });
  }
  const stagePct = (pct: number): void => {
    stagedPct = pct;
    if (pctTimer !== null) clearTimeout(pctTimer);
    pctTimer = setTimeout(() => { pctTimer = null; flushPct(); }, TUNER_SAVE_SETTLE_MS_ADAPTATION);
    pctWin?.addEventListener('pagehide', onPctHide);
  };
  /** The values the shown preset stands for: a named preset's, else Automatic's resolved ones (a row's default). */
  const baseRows = (v: VideoSettingsV2): Rows => (v.preset === 'auto' || v.preset === 'custom' ? resolveAutomatic() : PRESET_VALUES[v.preset]);
  const videoLock = (key: VideoRow['key']): string | undefined => {
    if ((key === 'renderScalePct' || key === 'ceiling') && picture.get() === 'ps2') return 'PS2 picture: 640 x 448';
    if (key === 'detailDistance' && picture.get() === 'ps2') return 'PS2 picture: original';
    const address = key === 'graphics' ? graphicsBackendOverride() : null;
    return address === null ? undefined : `Selected by address: ${ADDRESS_WORDS[address]}`;
  };
  // WG-7, W5: after a WebGPU error demoted Automatic to WebGL2 (`../../graphicsDemotion`), the Graphics row's WebGL2 value
  // says so until the player chooses again (a browser adaptation).
  const DEMOTED_WORDS = '(set after a WebGPU error)';
  const videoSpec = (r: VideoRow): Spec => {
    const key = r.key;
    const values = r.values ?? [];
    const row = {
      id: VIDEO_ROW_IDS[key], label: VIDEO_ROW_LABELS[key], about: r.effect,
      note: r.apply === 'nextMatch' ? `Saved to this browser. ${GRAPHICS_BACKEND_APPLY_NOTE}` : 'Saved to this browser. Applies now, in a match too.',
      ...(r.apply === 'nextMatch' ? { nextMatch: true } : {}),
      ...(r.surfaces.includes('overlay') ? {} : { launcherOnly: true }),   // review F2: the schema's surfaces
    };
    if (key === 'preset') {
      const shown = (): typeof values => (isCustom(v2.get()) ? values : values.filter((x) => x.value !== 'custom'));
      return {
        row, values: () => shown().map((x) => x.word),
        get: () => { const v = v2.get(); const p = isCustom(v) ? 'custom' : v.preset; return Math.max(0, shown().findIndex((x) => x.value === p)); },
        def: () => 0, lock: () => undefined,
        set: (i) => {
          const p = shown()[i]?.value as Preset | undefined;
          if (p === undefined || p === 'custom') return false;           // Custom is reached by changing a row, never chosen
          quiet(() => { flushPct(); v2.set({ preset: p }); });
          return true;
        },
      };
    }
    const current = (): unknown => {
      if (key === 'renderScalePct' && stagedPct !== null) return stagedPct;
      const address = key === 'graphics' ? graphicsBackendOverride() : null;
      return address !== null ? (address === 'xbox' ? 'auto' : address) : v2.get()[key];
    };
    const indexOf = (x: unknown): number | undefined => { const i = values.findIndex((w) => w.value === x); return i < 0 ? undefined : i; };
    const def = (): number | undefined => indexOf(baseRows(v2.get())[key]);
    const write = (to: unknown): boolean => {
      if (to === undefined || to === current()) return false;           // a value held is not written again (a saved Xbox pick kept)
      if (key === 'renderScalePct') { stagePct(to as number); return true; }
      quiet(() => { flushPct(); v2.set({ [key]: to } as Partial<VideoSettingsV2>); });
      return true;
    };
    return {
      row, values: () => values.map((x) => (key === 'graphics' && x.value === 'webgl2' && readGraphicsDemoted() !== null ? `${x.word} ${DEMOTED_WORDS}` : x.word)),
      get: () => indexOf(current()), def, lock: () => videoLock(key),
      // WG-7, W5 (WEBGPU-DEFAULT, MEGA.R8; a browser adaptation): a Graphics value chosen here, even the one held, forgets a
      // WebGPU error's demotion (`../../graphicsDemotion`), so the WebGL2 value stops saying it was set after one.
      set: (i) => {
        const forgot = key === 'graphics' && values[i] !== undefined && readGraphicsDemoted() !== null;
        if (forgot) clearGraphicsDemoted();
        return write(values[i]?.value) || forgot;
      },
      ...(key === 'renderScalePct' ? {
        reset: (): boolean => {                                          // a reset writes at once (#726's pattern)
          const d = def();
          const to = d === undefined ? undefined : values[d]?.value;
          stagedPct = null;
          flushPct();
          if (to === undefined || to === v2.get().renderScalePct) return false;
          quiet(() => { v2.set({ renderScalePct: to as number }); });
          return true;
        },
      } : {}),
    };
  };
  /** Device memory, an estimate: the browser's rounded device memory and, where told, the page's heap of its budget. */
  const memoryWords = (): string => {
    if (pageDeviceClass() === 'xbox') return XBOX_MEMORY_WORDS;
    const gb = (globalThis.navigator as { deviceMemory?: unknown } | undefined)?.deviceMemory;
    const heap = (globalThis.performance as { memory?: { usedJSHeapSize?: unknown; jsHeapSizeLimit?: unknown } } | undefined)?.memory;
    const mb = (n: number): number => Math.round(n / 2 ** 20);
    const parts = [
      typeof gb === 'number' && gb > 0 ? `${gb} GB` : null,
      heap && typeof heap.usedJSHeapSize === 'number' && typeof heap.jsHeapSizeLimit === 'number' ? `about ${mb(heap.usedJSHeapSize)} MB of ${mb(heap.jsHeapSizeLimit)} MB` : null,
    ].filter((x): x is string => x !== null);
    return parts.length > 0 ? parts.join(' \u00b7 ') : 'Not told by this browser';
  };
  const detectedWords = (): string => {
    const rows = resolveAutomatic();
    const named = presetOfRows(rows);
    const chose = named ? PRESET_WORDS_OF[named] : `${rows.renderScalePct}% at ${rows.ceiling === 0 ? 'Native' : `${rows.ceiling}p`}`;
    // VS-10 F9a (the spec §4): and the backend Automatic asks for (`./graphicsBackend` `asksForWebGPU`; WebGPU still falls
    // back to WebGL2 past the adapter's wait), in the Graphics row's own words.
    const backend = VIDEO_SCHEMA.find((r) => r.key === 'graphics')?.values?.find((w) => w.value === (asksForWebGPU(rows.graphics) ? 'webgpu' : 'webgl2'))?.word;
    return `${DEVICE_CLASS_WORDS[pageDeviceClass()]} \u00b7 Automatic chose: ${chose}${backend ? ` \u00b7 ${backend}` : ''}`;
  };
  const xboxPicked = (): boolean => readPreference(GRAPHICS_BACKEND_KEY) === 'xbox';
  const sectioned = (specs: Spec[], section: string): Spec[] => specs.map((sp, i) => (i === 0 ? { ...sp, row: { ...sp.row, section } } : sp));
  /** Display's browser rows: the schema's groups (the first unheaded: `headed` gives it "This browser"), Restore defaults, This device. */
  const videoRows = (): Spec[] => {
    const custom = isCustom(v2.get());
    const shown = VIDEO_SCHEMA.filter((r) => r.surfaces.includes('launcher') && (!r.customOnly || custom));
    const group = (g: VideoRow['group']): Spec[] => shown.filter((r) => r.group === g).map(videoSpec);
    const groups: [VideoRow['group'], Spec[]][] = [
      ['quality', group('quality')], ['display', group('display')], ['detail', group('detail')], ['renderer', group('renderer')],
      ['picture', [...(deps.videoPicture === false ? [] : [videoPicture]), nameTags, rangeReadout, ...group('picture')]],   // the spec §4.2: Video, Name tags, (HUD-ALIVE C) Range readout, then the colour filter
    ];
    const none = { values: () => [], get: () => undefined, def: () => undefined, lock: () => undefined, set: () => false };
    const restore: Spec = {
      row: {
        id: VIDEO_RESTORE_ROW, label: 'Restore defaults', action: 'Restore', hint: 'Every row above back to Automatic', launcherOnly: true,
        about: 'Every video row above back to Automatic -- what this device was found to suit -- and the performance overlay off. The next match tries this device again.',
        note: `Saved to this browser. Applies now; Antialias, Graphics and Power preference: ${GRAPHICS_BACKEND_APPLY_NOTE.toLowerCase()}`,
      },
      ...none,
    };
    const device: Spec[] = [
      {
        row: {
          id: DEVICE_MEMORY_ROW, label: 'Device memory', info: { value: memoryWords() },
          about: 'An estimate: the memory the browser says this device has (it rounds it) and, where it tells it, how much of its own budget this page uses now. The Xbox browser has about 1 GB, whatever the console holds.',
          note: 'Read from the browser; nothing is sent.',
        },
        ...none,
      },
      {
        row: {
          id: DEVICE_DETECTED_ROW, label: 'Detected', info: { value: detectedWords() }, launcherOnly: true,
          about: 'The kind of device Automatic found -- Xbox, Touch, Low memory, Software renderer, Standard or High -- and the preset it chose for it.',
          note: 'Read on this browser; nothing is sent.',
        },
        ...none,
      },
      ...(xboxPicked() ? [{
        row: {
          id: DEVICE_NOT_RIGHT_ROW, label: 'Not right?', action: 'Detect again', hint: 'Forget the Xbox choice', launcherOnly: true,
          about: 'This browser was set up as an Xbox ("Request Game Files (XBOX)"). If it is not one, this forgets that choice: Automatic reads the device again and chooses for it.',
          note: `Saved to this browser. Applies now; the renderer: ${GRAPHICS_BACKEND_APPLY_NOTE.toLowerCase()}`,
        },
        ...none,
      }] : []),
      perfLineSpec(),
    ];
    return [
      ...groups.flatMap(([g, specs], i) => (i === 0 || specs.length === 0 ? specs : sectioned(specs, VIDEO_GROUP_HEADINGS[g]))),
      restore,
      ...sectioned(device, DEVICE_GROUP_HEADING),
    ];
  };
  const remember: Spec = {
    // PERSONA-PERSIST (a) (OT.R61 (b)): chosen at each sign-in (ticked by default); this row says where.
    row: { id: 'remember', label: 'Remember me on this browser', about: 'Keeps you signed in on this browser after a reload. It is chosen on the sign-in, ticked by default; Sign out offers to forget this device.', note: 'Chosen on the sign-in.' },
    values: () => ['On the sign-in'], get: () => 0, def: () => 0, lock: () => 'Chosen on the sign-in', set: () => false,
  };
  const signOut: Spec = {
    row: { id: 'signout', label: 'Sign out', action: 'Sign out', tone: 'danger', about: 'Signs you out of the server on this browser.', note: 'Your memory card is not changed.', needsSignIn: true },
    values: () => [], get: () => undefined, def: () => undefined, lock: () => undefined, set: () => false,
  };

  // DX-3: "Delete the kept disc" (its confirm is the grammar's: `KEPT_DISC_ROW`).
  const keptGb = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(1)} kB`);
  const keptSpec = (): Spec => {
    const k = deps.kept?.info() ?? null;
    return {
      row: {
        id: KEPT_DISC_ROW, label: 'Remove downloaded content', action: 'Remove', tone: 'danger',
        about: k
          ? `Your disc's files (${keptGb(k.bytes)}${k.whole ? '' : ', part of them'}) are kept in this browser's storage, ${BACKEND_WORDS[k.backend]}, so later starts need no disc. Remove them here; the next start asks for your disc again.`
          : 'Your disc\'s files are kept in this browser\'s storage once it is chosen, so later starts need no disc. Nothing is kept now.',
        note: 'Kept in this browser only, never uploaded. Your disc itself is not touched.',
      },
      values: () => [], get: () => undefined, def: () => undefined, lock: () => (k ? undefined : 'Nothing stored'), set: () => false,
    };
  };

  // SKIP-MENU (LR.R33; Finding 1, (a): "keep the toggle in Before you deploy AND add it to Settings > Launcher"): the launch
  // check's toggle, one key (`../skipMenu`), so the two places show one state. A browser adaptation.
  const skipMenuSpec: Spec = {
    row: { id: SKIP_MENU_ROW, label: SKIP_MENU_LABEL, hint: SKIP_MENU_HINT, about: 'Deploy opens the game at its own LOGIN TO SOCOM II ONLINE screen, past the intro and the main menu. The same switch as the one in Before you deploy.', note: 'Saved to this browser. Applies at your next Deploy.' },
    values: () => OFF_ON, get: () => (skipMenuOn() ? 1 : 0), def: () => 0, lock: () => undefined,
    set: (i) => { setSkipMenu(i === 1); return true; },
  };
  const surface = deps.install ?? ((): InstallSurface => readInstallSurface(globalThis.window));
  const doc = (): Document | undefined => globalThis.document;
  const update = deps.update ?? {
    waiting: () => !!doc()?.querySelector('[data-pwa-update]'),
    restart: () => { doc()?.querySelector<HTMLElement>('[data-pwa-update] [data-pwa-restart]')?.click(); },
  };
  const none = { values: () => [], get: () => undefined, def: () => undefined, lock: () => undefined, set: () => false };
  const shareSpec: Spec = { row: { id: SHARE_SEND_ROW, label: SHARE_SEND_ROW_LABEL, action: SHARE_SEND_ROW_ACTION, about: SHARE_SEND_ROW_ABOUT, note: SHARE_SEND_ROW_NOTE }, ...none };
  const versionSpec: Spec = { row: { id: VERSION_ROW, label: 'Version', info: { value: `v${pageVersion()}` }, about: 'The launcher\u2019s version, as the badge beside its name shows it.', note: 'This build of the launcher.' }, ...none };
  const updateSpecs = (): Spec[] => (update.waiting() ? [{
    row: { id: UPDATE_ROW, label: UPDATE_NOTICE.replace(/, restart$/, ''), action: 'Restart', tone: 'primary', about: 'A new build of the launcher is ready. Restart loads it; until then this one keeps running.', note: 'The same notice as the one over the page (Later there dismisses it).' }, ...none,
  }] : []);

  // LR-5 (LR.R8): Appearance. The theme and the picture are held by these two (`value('theme')`, `value('backdrop')`:
  // `../render/theme` reads them) and chosen by their picks, one action row each (the artifact's "Theme & background"
  // panel: a pick sets it and says so). Not drawn themselves.
  const PICKED_NOTE = 'Saved to this browser. Applies now.';
  const themeHeld = own('theme', 'Theme', THEMES.map((t) => t.label), 0, 'The launcher\u2019s colours and the sheets behind it. The game is not changed.');
  const pictureHeld = own('backdrop', 'Background picture', ['None', 'Crossroads'], 0, 'What sits behind the wave: nothing, or the Crossroads picture darkened.');
  const held: Spec[] = [themeHeld, pictureHeld];
  const PICTURES = [{ label: 'None', hint: 'Wave only' }, { label: 'Crossroads', hint: 'Darkened behind the wave', thumb: BACKDROP_URL }] as const;
  const pick = (h: Spec, i: number, label: string, about: string, extra: Partial<NonNullable<OptRow['pick']>>, section?: string): Spec => ({
    row: { id: `${h.row.id}:${i}`, label, action: 'Pick', about, note: PICKED_NOTE, pick: { group: h.row.id, picked: h.get() === i, ...extra }, ...(section !== undefined ? { section } : {}) },
    values: () => [], get: () => undefined, def: () => undefined, lock: () => undefined, set: () => false,
  });
  const drift = ownSet('drift', 'Backdrop motion', OFF_ON, 1, 'A slow drift across the backdrop picture. Always off when your system asks for reduced motion.');
  // LR-13 (LR.R16 (2)): the artifact's "Theme & background" panel (`app-theme`), pushed from Appearance's link row.
  const themePanel = (): Spec[] => [
    ...THEMES.map((t, i) => pick(themeHeld, i, t.label, themeHeld.row.about, { hint: t.note, swatch: [t.top, hex(t.sheet), t.gold ? THEME_TRIM : hex(t.glow)] as const }, i === 0 ? 'Theme' : undefined)),
    ...PICTURES.map((p, i) => pick(pictureHeld, i, p.label, pictureHeld.row.about, { hint: p.hint, ...('thumb' in p ? { thumb: p.thumb } : {}) }, i === 0 ? 'Background picture' : undefined)),
  ];
  // The link's words are the artifact's (`G('Theme & background', 'app-theme', v.theme + ' · ' + (v.bg === 'None' ? 'Wave only' : v.bg))`).
  const themeLink = (): Spec => ({
    row: {
      id: THEME_PANEL_ROW, label: 'Theme & background', link: true,
      action: `${themeHeld.values()[themeHeld.get() ?? 0] ?? ''} · ${(pictureHeld.get() ?? 0) === 0 ? PICTURES[0].hint : PICTURES[1].label}`,
      about: 'The launcher’s colours and what sits behind the wave: pick a theme and a background picture.', note: PICKED_NOTE,
    },
    values: () => [], get: () => undefined, def: () => undefined, lock: () => undefined, set: () => false,
  });
  const appearance = (): Spec[] => [
    themeLink(),
    drift,
    own('clock', 'Clock', ['24-hour', '12-hour'], 0, 'The clock in the launcher\u2019s header, 24-hour or 12-hour.'),
    // CX-52 (CX.R19, the owner: "On, with a toggle"): the launcher's own sounds, never the game's.
    ownSet('sounds', 'Launcher sounds', OFF_ON, 1, 'Short sounds as you move, choose and go back in the launcher. The game’s own sound is not changed.'),
    ownSet('soundVolume', 'Launcher sound volume', Array.from({ length: 11 }, (_, i) => `${i * 10}%`), 7, 'How loud the launcher’s sounds are.'),
    // LR-13 (LR.R16 (5)): Interface size and Scanline overlay, moved from App; their keys and defaults kept.
    own('uiscale', 'Interface size', ['100%', '115%', '130%'], 0, 'Makes every word and control in the launcher larger. Use it if you sit far from the screen.'),
    own('scan', 'Scanline overlay', OFF_ON, 0, 'Faint horizontal lines over the launcher, like the briefing room’s CRT.'),
  ];
  const pickOf = (id: string): { h: Spec; i: number; label: string } | null => {
    const m = /^(theme|backdrop):(\d+)$/.exec(id);
    if (!m) return null;
    const h = m[1] === 'theme' ? themeHeld : pictureHeld;
    const i = Number(m[2]);
    const label = h.values()[i];
    return label === undefined ? null : { h, i, label };
  };
  // LATER 294 slice 3 (product track, a browser adaptation): a heading above the first row of a tab's other owner, in the
  // spec's words (docs/specs/2026-10-28-settings-organisation.md, layouts A and B: "This browser" before Display's and
  // Communication's launcher rows, "In the game" before Controller's card rows). The row's own `section` (as Theme &
  // background's picks): drawn above it, never a stop of the pad or the pointer; the row, its id and its write unchanged.
  // Only when rows come before it: with none, the group leads the tab and carries no heading (the spec's slice 3).
  const headed = (before: Spec[], section: string, specs: Spec[]): Spec[] =>
    [...before, ...(before.length === 0 ? specs : specs.map((s, i) => (i === 0 ? { ...s, row: { ...s.row, section } } : s)))];
  const groups: { id: string; label: string; icon: IconName; family: 'game' | 'launcher'; specs: () => Spec[] }[] = [
    { id: 'display', label: 'Display', icon: 'display', family: 'game', specs: () => headed([...cards('display'), ...cards('console')], 'This browser', videoRows()) },   // VS-2: the video schema's rows (HD-4, PF.R60, CPS-4a, SS-2, CPS-5 among them)
    { id: 'app', label: 'App', icon: 'install', family: 'launcher', specs: () => [
      { row: { id: INSTALL_APP_ROW, label: 'Install app', action: installAction(surface()), ...(surface() === 'chromium' ? { tone: 'primary' as const } : {}), ...(installAction(surface()) === 'Install' ? { hint: INSTALL_HINT } : {}), about: 'Add SOCOM II Legacy to this device with its own icon and window.', note: 'On iPhone and iPad, installed apps keep storage separate from Safari.' }, values: () => [], get: () => undefined, def: () => undefined, lock: () => undefined, set: () => false },
      // DSH-4 (DSH.R12 leaves the sender's entry without the QR to us): beside Install app, where the launcher's own
      // device-level actions are; the grammar opens the sender's code entry.
      ...(deps.share ? [shareSpec] : []),
      keptSpec(),
      skipMenuSpec,                                               // SKIP-MENU (LR.R33; the owner's Finding 1 answer (a)): the panel's toggle, here too
      ...updateSpecs(),                                           // after the kept row: a notice mounting never moves a row above it (review-lr-5 F1)
      versionSpec] },
    // LR-5: Backdrop motion (from App) and the launcher's sounds (from Audio) moved to Appearance, their keys kept.
    { id: 'appearance', label: 'Appearance', icon: 'palette', family: 'launcher', specs: appearance },
    { id: 'audio', label: 'Audio', icon: 'volume', family: 'game', specs: () => cards('audio') },
    // LATER 294 slice 1: the browser's controller rows first (Stance, device, dead zone, Button mapping), then Overlay button, then the card's rows.
    // STANCE-TOP (the owner, 2026-11-02: "move stance mode to the top"; a browser adaptation): the Stance mode the tab's first row.
    { id: 'controller', label: 'Controller', icon: 'pad', family: 'launcher', specs: () => headed([stanceMode, padDevice, padDead, remap, ...overlayButton], 'Layout and aiming', [layout, ...cards('controls')]) },
    { id: 'mobile', label: 'Mobile', icon: 'phone', family: 'launcher', specs: () => [{
      row: { id: MOBILE_LAYOUT_ROW, label: 'Touch layout', action: 'Edit layout', about: 'Drag each button and stick to where your thumbs reach. Portrait and landscape have separate layouts.', note: 'Saved to this browser on this device.' },
      values: () => [], get: () => undefined, def: () => undefined, lock: () => undefined, set: () => false,
    }] },
    { id: 'communication', label: 'Communication', icon: 'mic', family: 'game', specs: () => { askMics(); return headed(cards('communication'), 'This browser', [micOn, micDevice]); } },
    { id: 'account', label: 'Account', icon: 'user', family: 'launcher', specs: () => [remember, signOut] },
  ];
  // B61 F3, part 2 (the merge controller's ruling): Options > Mobile only where touch exists, read at each build of the
  // rows (each draw: `categories`).
  const touch = deps.touch ?? touchHere;
  const shown = (): typeof groups => groups.filter((g) => g.id !== 'mobile' || touch());
  const all = (): Spec[] => [...shown().flatMap((g) => g.specs()), ...themePanel()];
  const find = (id: string): Spec | undefined => all().find((s) => s.row.id === id) ?? held.find((s) => s.row.id === id);
  const rowsOf = (specs: Spec[]): OptRow[] => specs.map((s): OptRow => {
    const lock = s.lock();
    const def = s.def();
    const warn = s.warn?.();
    return { ...s.row, ...(s.row.action || s.row.info ? {} : { values: s.values() }), ...(def !== undefined ? { def } : {}), ...(lock ? { locked: lock } : {}), ...(warn ? { warn } : {}) };
  });

  return {
    categories(): readonly OptCat[] {
      return shown().map((g) => ({ id: g.id, label: g.label, icon: g.icon, family: g.family, rows: rowsOf(g.specs()) }));
    },
    // LR-13 (LR.R16 (2)): the pushed "Theme & background" panel's rows.
    panel: (id) => (id === 'theme' ? { id: 'theme', label: 'Theme & background', icon: 'palette', rows: rowsOf(themePanel()) } : null),
    value: (id) => find(id)?.get() ?? 0,
    set(id, v): void { const s = find(id); if (s && !s.lock() && s.set(v)) notify(); },
    step(id, d): void {
      const s = find(id);
      if (!s || s.lock()) return;
      if (s.step) { if (s.step(d)) notify(); return; }
      const n = s.values().length;
      const at = s.get() ?? 0;
      if (s.set(Math.max(0, Math.min(n - 1, at + d)))) notify();     // as the grammar's own step: the ends kept
    },
    reset(id): void {
      const s = find(id);
      const d = s?.def();
      if (!s || d === undefined || s.lock()) return;
      if (s.reset ? s.reset() : s.set(d)) notify();
    },
    installSurface: () => surface(),
    takeToast(): string | null { const t = toast; toast = null; return t; },
    async action(id): Promise<string | null> {
      if (id === VIDEO_RESTORE_ROW) { stagedPct = null; flushPct(); quiet(() => { v2.restoreDefaults(); }); notify(); return 'Video settings back to Automatic'; }   // VS-2
      if (id === DEVICE_NOT_RIGHT_ROW) {                        // VS-7 F5: the saved Xbox pick forgotten, only while it is saved
        if (!xboxPicked()) return null;
        quiet(() => { v2.set({ graphics: 'auto' }); });
        notify();
        return 'Xbox choice forgotten: Automatic reads this device again';
      }
      if (id === UPDATE_ROW) { if (update.waiting()) update.restart(); return null; }   // LR-5: the notice's Restart
      if (id === PERF_LINE_ROW) return copyPerfLine();          // CPS-5: the line to the clipboard, or into the aside
      const p = pickOf(id);                                     // LR-5: a theme or a picture picked, said as the artifact says it
      if (p) {
        p.h.set(p.i);
        notify();
        return `${p.h === themeHeld ? 'Theme' : 'Background'}: ${p.label}`;
      }
      if (id === KEPT_DISC_ROW) {
        if (!deps.kept?.info()) return null;
        await deps.kept.forget();
        notify();
        return 'Downloaded content removed: the next start asks for your disc';
      }
      return null;                                              // CX-14: Button mapping is the grammar's pushed screen
    },
    // review F1: the keeper's observer is let go before the staged step is written, so nothing is drawn into a console torn down;
    // PR #765: the card store's save observer likewise, first.
    dispose(): void { offSave?.(); store.flush?.(); offV2(); flushPct(); if (perfTimer !== null) { clearTimeout(perfTimer); perfTimer = null; } noticeObs?.disconnect(); offDisc(); offPicture(); offerWin?.removeEventListener('s2u-install-offer', onOffer); },
  };
}
