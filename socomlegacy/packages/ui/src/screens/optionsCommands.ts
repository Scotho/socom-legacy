import type { UiBindingStart, UiCommandHandler, UiCommandHost } from '../uiCommands';
import { uiCommandRowByName, UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER } from '../uiCommands';
import { UIVAR_LONGEVITY, type UiVarManager } from '../uiVars';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';
import { INPUT_STRING } from './screenCommands';
import { STICK_PRESET_CUSTOM, STICK_PRESETS, stickTunersOfPreset } from '../stickTuners';
import { checkVideoMode, videoPictureGate, type VideoPicture } from './videoPicture';
import { VIDEO_ROW_HELP_GATE, videoRowHelpGate } from './videoSettingsRows';

/**
 * The main menu's OPTIONS (OPT-09..OPT-14, web research 302; Chris's original settings, 2026-10-07): the three rows
 * of the original's command table its pages call -- `InitOptions` (`FUN_0027b420`), `StoreOptions` (`FUN_0027b960`)
 * and `CopyUIVar` (`FUN_00281090`) -- the game's option globals they read and write (`OptionGlobals`), and the gates
 * that keep the rows whose effect is not built inert (OT.R8, as ONLINE OPTIONS' are: `./worldOfSocomCommands`).
 *
 * **The globals.** `StoreOptions` copies the option valves (02-boot O15's options, `OPTION_VALVES`) into the game's
 * globals -- the pitch sign `DAT_003df198`, the fire-mode swap `DAT_0044d500` with `FUN_00592050`, the head bob
 * `DAT_003df190` and the others of O11 -- and `InitOptions` reads them back into the valves, so a page's draft is the
 * last stored set (research 302 §4). Here the globals are the valves' values as last stored, by name; the page's match
 * reads the three it applies (`INVERT_PITCH_CONTROLLER`, `BOBBING_1ST_PERSON`, `FIREMODESWAP_CONTROLLER`).
 *
 * **SetControllerConfig** (`FUN_0027fb40` D:L127194-127206; OPT-14, web research 344 R344.2): the command's argument name
 * (`INPUT_STRING` replaced by the context's input string, D:L127200-127202) handed to `FUN_002c5d60`, which makes the
 * `controller.rdr` config of that name the active one; answers 1. The page owns the configs (`controllerConfig`).
 *
 * **CopyUIVar** (`FUN_00281090`, its record built by `FUN_0027fd70`: research 302 §4): the source variable named at
 * the record's +0x10, the destination at +0x14; the destination is added at temporary longevity and takes the source's
 * value through the setter. A source the manager does not hold copies nothing. Answered on the dialogs whose discard
 * and reset scripts are on the settings' and the taunts' paths, and on the chat dialogs' IGNORE key (ONL-25, ONL-24)
 * (`COPY_UI_VAR_DIALOGS`); elsewhere the table's unimplemented answer, as before.
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The OPTIONS screen and its three pages that are built (SCREEN ADJUST and the HDD's are parked; CONTROLLER PRESETS is `OPTIONS_PRESETS`). */
export const OPTIONS_MENU = 'dlgOptions_Menu.rdr';
export const OPTIONS_AUDIO = 'dlgOptions_Audio.rdr';
export const OPTIONS_VIDEO = 'dlgOptions_Video.rdr';
export const OPTIONS_CONTROLLER = 'dlgControllerSelection.rdr';
export const OPTIONS_DIALOGS: readonly string[] = [OPTIONS_MENU, OPTIONS_AUDIO, OPTIONS_VIDEO, OPTIONS_CONTROLLER];
/** CONTROLLER PRESETS (OPT-14, web research 344 §2): OPTIONS' `GoToPresets` opens it; it runs no `CopyUIVar`. */
export const OPTIONS_PRESETS = 'dlgControllerPresets.rdr';

/**
 * The option valves of `PersistentValves.rdr` (02-boot O15, 04 O15): the ones `StoreOptions` applies and the
 * save file's `CValveSaveManager` module carries among the persistent valves, with their defaults from
 * `global_valves.rdr` (research 302 §4).
 */
export const OPTION_VALVES: readonly string[] = [
  'STEREO_CONTROLLER', 'INVERT_PITCH_CONTROLLER', 'VIBRATION_CONTROLLER', 'SUBTITLE_CONTROLLER', 'DIALOG_CONTROLLER',
  'ORDER_RESPONSE_CONTROLLER', 'BOBBING_1ST_PERSON', 'STICK_SWAP_CONTROLLER', 'AutoAim', 'FIREMODESWAP_CONTROLLER',
  'NoAutoAim', 'SelectedControllerConfig', 'ChosePresetOnce', 'HelpWindowsEnabled', 'stick_preset', 'video_mode',
  'DISPLAY_MP_TEAM_NAMES', 'EnableExternalWhispers', 'VoiceMask', 'ScreenOriginX', 'ScreenOriginY', 'HDD_ENABLE',
];

/**
 * The dialogs whose scripts' `CopyUiVar` this module answers: OPTIONS' pages, SETUP MESSAGING, SETUP TAUNTS, ONLINE
 * OPTIONS; and, since ONL-25 (web research 269 §1), the BRIEFING ROOM and the GAME LOBBY, whose `on_skb_apply_2` (the
 * chat keyboard's Action2, the IGNORE key) copies CHATMESSAGE into PLAYER_IGNORE_NAME before `AddToIgnore` (the
 * record's +0x10 and +0x14 name the animation's names 2 and 3 on the disc); and, since ONL-24 (web research 269 §3),
 * FRIENDS, whose `on_skb_apply_2` is the same two statements over the same names 2 and 3 (CHATMESSAGE ->
 * PLAYER_IGNORE_NAME, read off `dlgFriendList.rdr`'s set): PLAYER INFO's chat keyboard's IGNORE key there.
 * CREATE GAME's `set_respawn_valve` saves and restores PLAYLISTVAR through the same command (RSP-1, research 357 §2).
 */
export const COPY_UI_VAR_DIALOGS: readonly string[] = [...OPTIONS_DIALOGS, 'dlgSetSOP.rdr', 'dlgSetTaunts.rdr', 'dlgOnlineOptions.rdr', 'dlgMPBriefingRoom.rdr', 'dlgGameLobby.rdr', 'dlgFriendList.rdr', 'dlgCreateGame.rdr'];

const sameName = (a: string | null | undefined, b: string | null | undefined): boolean => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

/** The game's option globals as `StoreOptions` leaves them: each option valve's value, by name. */
export class OptionGlobals {
  private readonly values = new Map<string, number>();
  private readonly listeners = new Set<() => void>();

  /** A global's value, or undefined before any store set it. */
  value(name: string): number | undefined { return this.values.get(name); }

  /** Every global set, by name (a spec's view). */
  all(): Record<string, number> { return Object.fromEntries(this.values); }

  /** `StoreOptions` (`FUN_0027b960`): each option valve the store holds copied into its global. */
  store(valves: Pick<ValveStore, 'find'>): void {
    for (const name of OPTION_VALVES) {
      const v = valves.find(name);
      if (v) this.values.set(name, v.value);
    }
    for (const fn of this.listeners) fn();
  }

  /**
   * One global written by the game itself, not by a store (no listener is told): the in-round START menu's rows
   * (`FUN_002041e0`, web research 266 §8.4) flip the pitch sign `DAT_003df198`, the fire-mode swap `DAT_0044d500` and
   * EXTERNAL WHISPERS `DAT_003de620` in place; the next `store` copies the valves over them again.
   */
  set(name: string, value: number): void { this.values.set(name, value); }

  /** `InitOptions` (`FUN_0027b420`): each global read back into its valve, at PERSIST. */
  init(valves: Pick<ValveStore, 'set'>): void {
    for (const [name, value] of this.values) valves.set(name, value, VALVE_TYPE.PERSIST);
  }

  /** Told after each store; answers the listener's removal. */
  observe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
}

/**
 * A parked row of OPTIONS' pages (OT.R8): a button's CROSS animation, or a control taken whole (`strip`: a
 * RADIOSTRIP or a SLIDERBAR moves and sounds before any binding, so the control itself is parked, `UiControlGate`).
 * Each names the dependency it waits on (research 302 §4).
 */
export interface OptionsParkedRow { dialog: string; control: string; animation?: string; strip?: boolean; task: string; why: string }

/**
 * The rows of OPTIONS' pages parked (OT.R8) -- every row but those Chris's settings made work (2026-10-07: MUSIC,
 * SOUND and DIALOG volume, HEAD BOB, PITCH, FIRE RATE, the DEFAULT SETTINGS, the discard, RETURN and the save),
 * CONTROLLER PRESETS (OPT-14, 2026-10-18: unparked, web research 344 -- the button layouts' page,
 * `dlgControllerPresets.rdr`), and CONTROLLER OPTIONS' stick PRESETS strip and its three sliders (OT.R72, LATER 315-318:
 * the stick presets of `dlgControllerSelection.rdr`, a different thing; `OPTIONS_BUILT_ROWS`). The parked rows are drawn
 * and inert: their ONACTIVATE help line runs, their pad does nothing, no sound.
 */
export const OPTIONS_PARKED_ROWS: readonly OptionsParkedRow[] = [
  { dialog: OPTIONS_MENU, control: 'HDDOnOff', strip: true, task: 'OPT-16', why: 'HDD: the PS2 hard disk (MENU-OC-6)' },
  // BRIGHTNESS (`brightnessbar`) unparked 2026-10-23 (OT.R8's park lifted by the reading, research 358): its slider sets
  // `BRIGHTNESS`, and the viewer's `./brightness` draws the original's full-screen pass on the picture.
];

/** VIDEO MODE's gate's name in the host (OT.R79): a picture box's check, taken. */
export const VIDEO_PICTURE_GATE = 'OT.R79 video picture';

/** The gates' name in the host (`UiCommandHost.setBindingGate`, `setControlGate`). */
export const OPTIONS_PARKED_GATE = 'OPT-09 parked rows';

/** The binding gate (`UiBindingGate`): true takes the start of a parked button's CROSS animation on its page. */
export function optionsRowGate(b: Pick<UiBindingStart, 'dialog' | 'animation'>): boolean {
  return OPTIONS_PARKED_ROWS.some((p) => !p.strip && sameName(p.dialog, b.dialog) && p.animation === b.animation);
}

/**
 * The rows built since their park (OT.R72; the merge controller's CTL.R4): each left `OPTIONS_PARKED_ROWS` only with its
 * behaviour built -- a test holds that no parked row is one of these, so an unpark cannot leave an inert row behind nor a
 * working one parked. CONTROLLER OPTIONS' stick PRESETS (`SetStickPreset`, `../stickTuners`) and the three sliders (their
 * watchers on the look stick's words, `viewer/src/look.ts`).
 */
export const OPTIONS_BUILT_ROWS: readonly { dialog: string; control: string; task: string }[] = [
  { dialog: OPTIONS_CONTROLLER, control: 'stick_presets', task: 'LATER 315' },
  { dialog: OPTIONS_CONTROLLER, control: 'StickSensitivity', task: 'LATER 316' },
  { dialog: OPTIONS_CONTROLLER, control: 'StickAcceleration', task: 'LATER 317' },
  { dialog: OPTIONS_CONTROLLER, control: 'StickDeadZone', task: 'LATER 318' },
  { dialog: OPTIONS_CONTROLLER, control: 'Vibration', task: 'LATER 319' },     // CTL-2: the motors (viewer `./rumble`)
  { dialog: OPTIONS_VIDEO, control: 'TeamMateNames', task: 'OPT-11' },         // the HUD's team labels (`DISPLAY_MP_TEAM_NAMES`, the match's set-up)
  // HELP WINDOWS, store-only (the merge controller's call): `HelpWindowsEnabled` is one of the card's persistent valves,
  // so the port keeps and changes the card's value; its only reader, the campaign's help pop-up (`FUN_001fdeb0` at
  // D:L79390), is not in the port. CPS-4b (CPS.R7 (c), an adaptation): hidden -- not drawn, off the focus ring -- but kept,
  // built and run for the disc's scripts that name it (`./videoSettingsRows` `VIDEO_ROWS_HIDDEN`).
  { dialog: OPTIONS_VIDEO, control: 'helpwindows', task: 'OPT-11' },
  { dialog: OPTIONS_AUDIO, control: 'headset_bar', task: 'OPT-10' },           // HEADSET VOLUME: the voice chat's playback (viewer `./voice/voicePlayback`, W20.R10)
  { dialog: OPTIONS_AUDIO, control: 'mono_stereo', task: 'OPT-10' },           // SOUND MODE: the page's output (viewer `./audio` SOUND_MODE_ADAPTATION)
  // AIM ASSIST, store-only (the merge controller's call, the card rule): `AutoAim` is one of the card's persistent valves;
  // its one consumer, the aim-assist pull in the eye's pick (`FUN_005aa6e0` D:L464202-464203), runs only off the network
  // (`DAT_0045a0c1`, `theNetwork.m_bNetwork`) -- and every match in the port is a room's (`/testroom`'s solo too: its
  // `LoopbackMatch`), so nothing in the port reads it.
  { dialog: OPTIONS_CONTROLLER, control: 'AutoAim', task: 'OPT-13' },
  { dialog: OPTIONS_VIDEO, control: 'ScreenAdjustBtn', task: 'OPT-12' },
  // VIDEO MODE (OT.R79, LATER 378): the page's MODERN / PS2 / EXPERIMENTAL (`./videoPicture`), the card's `video_mode`
  // untouched; the PS2's INTERLACED / PROGRESSIVE SCAN and its boot switch superseded.
  { dialog: OPTIONS_VIDEO, control: 'video_mode', task: 'LATER 378' },     // SCREEN POSITION: dlgScreenAdjust, the origin drawn (viewer `./screenOrigin`)
];

/** The control gate (`UiControlGate`): a parked strip or slider on its page takes no pad. */
export function optionsControlGate(c: { dialog: string; control: string }): boolean {
  return OPTIONS_PARKED_ROWS.some((p) => p.strip && sameName(p.dialog, c.dialog) && p.control === c.control);
}

export interface OptionsCommandsOptions {
  valves: () => ValveStore;
  uiVars: UiVarManager;
  globals: OptionGlobals;
  /** The dialog built now (`CopyUIVar`'s scope). */
  dialog: () => string | null;
  /** `FUN_0026ed60`: a name of the command's running animation by index. */
  name: (cmd: ZAnimUiCommand, index: number) => string | null;
  /** `FUN_002c5d60`: the page's controller config of that name made active (`SetControllerConfig`); absent, nothing. */
  controllerConfig?: (name: string) => void;
  /** The context's input string (`FUN_00272480(ctx + 0x18, 0)`), which an `INPUT_STRING` argument stands for. */
  inputString?: (cmd: ZAnimUiCommand) => string | null;
  /**
   * SCREEN POSITION (the parked rows, b): the origin `SetScreenOrigin` and every `StoreOptions` lay -- `ScreenOriginX` and
   * `ScreenOriginY` less 128 (`FUN_0027bf10` D:L125261-125278, D:L125255-125256), the GS DISPLAY register's DX and DY
   * (D:L304788-304791); the page's to draw (`viewer/src/screenOrigin.ts`, an adaptation). Absent, nothing.
   */
  screenOrigin?: (x: number, y: number) => void;
  /** VIDEO MODE (OT.R79, `./videoPicture`): the page's picture, read when VIDEO is built and set by its strip. Absent, the strip moves nothing. */
  picture?: { get(): VideoPicture; set(picture: VideoPicture): void };
}

/** `ScreenOriginX` / `ScreenOriginY`'s default (`global_valves.rdr`, research 104): the origin 0. */
export const SCREEN_ORIGIN_VALVE_DEFAULT = 128;

/** The record's two name indices (`FUN_0027fd70`): the source's word at +0x10, the destination's at +0x14 (research 302 §4). */
export function copyUiVarNames(cmd: ZAnimUiCommand): [number, number] | null {
  const b = cmd.bytes;
  if (b.length < 0x18) return null;
  const words = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [words.getInt32(0x10, true), words.getInt32(0x14, true)];
}

export class OptionsCommands {
  constructor(private readonly o: OptionsCommandsOptions) {}

  InitOptions: UiCommandHandler = () => { this.o.globals.init(this.o.valves()); return true; };

  StoreOptions: UiCommandHandler = () => { this.store(); return true; };

  /**
   * `UIStoreOptions` (`FUN_0027b960`): the globals stored, then the stick apply inline (D:L125202-125230) -- the same as
   * `SetStickPreset`'s, under CUSTOM the stored preset's three vars -- so a card with no stick vars has them after the
   * boot's store, and a store after a discard sets them back to the stored preset's. The boot's store is this one
   * (`viewer/src/frontEnd.ts`).
   */
  store(): void {
    this.o.globals.store(this.o.valves());
    this.applyStickPreset();
    this.layOrigin();                                          // D:L125255-125256: the store lays the origin too
  }

  /**
   * `SetScreenOrigin` (UI command 200, `FUN_0027bf10` D:L125261-125278): the origin from `ScreenOriginX` / `ScreenOriginY`,
   * each less 128 (`+0x12` on Y in progressive scan, `DAT_004a44f4` 2 -- never in the port: VIDEO MODE stays parked).
   * dlgScreenAdjust's d-pad scripts step the valves, then run it. Answers 1.
   */
  SetScreenOrigin: UiCommandHandler = () => { this.layOrigin(); return true; };

  private layOrigin(): void {
    const v = this.o.valves();
    const x = v.find('ScreenOriginX')?.value ?? SCREEN_ORIGIN_VALVE_DEFAULT;
    const y = v.find('ScreenOriginY')?.value ?? SCREEN_ORIGIN_VALVE_DEFAULT;
    this.o.screenOrigin?.(x - SCREEN_ORIGIN_VALVE_DEFAULT, y - SCREEN_ORIGIN_VALVE_DEFAULT);
  }

  SetControllerConfig: UiCommandHandler = (cmd) => {
    const name = cmd.arg === INPUT_STRING ? this.o.inputString?.(cmd) ?? null : cmd.arg;
    if (name) this.o.controllerConfig?.(name);
    return true;
  };

  /**
   * `SetStickPreset` (UI command 120, `FUN_0027b790` D:L125063-125108): with the valve `stick_preset` under CUSTOM (3), the
   * preset's words go to the look stick (`FUN_002da6c0(pad, 1)`) and the three sliders' vars are written from them as
   * reals -- `STICK_SENSITIVITY` the gain's getter, `STICK_INERTIA` 1 - the ramp, `STICK_DEADZONE` the dead zone's getter
   * less 0.02 (`../stickTuners`) -- each only where it differs, which tells its watchers (`UiVarManager.set`). The pad's
   * words are the watchers' to write (`viewer/src/look.ts`). CUSTOM writes nothing. Answers 1.
   */
  SetStickPreset: UiCommandHandler = () => { this.applyStickPreset(); return true; };

  /** The apply `SetStickPreset` and `UIStoreOptions` share (D:L125077-125104, D:L125202-125230). */
  private applyStickPreset(): void {
    const n = this.o.valves().find('stick_preset')?.value ?? 0;
    if (n >= STICK_PRESET_CUSTOM || n < 0 || !STICK_PRESETS[n]) return;
    const t = stickTunersOfPreset(n);
    for (const [name, value] of [['STICK_SENSITIVITY', t.sensitivity], ['STICK_INERTIA', t.inertia], ['STICK_DEADZONE', t.deadZone]] as const) {
      const v = this.o.uiVars.find(name) ?? this.o.uiVars.add(name, null, UIVAR_LONGEVITY.TEMPORARY);
      if (v.value.type !== 'real' || v.value.value !== value) this.o.uiVars.set(v, { type: 'real', value });
    }
  }

  CopyUIVar: UiCommandHandler = (cmd) => {
    if (!COPY_UI_VAR_DIALOGS.some((d) => sameName(d, this.o.dialog()))) {
      return uiCommandRowByName('CopyUIVar')?.answer ?? UI_COMMAND_NOT_IMPLEMENTED_ANSWER_PLACEHOLDER;
    }
    const at = copyUiVarNames(cmd);
    const from = at ? this.o.name(cmd, at[0]) : null, to = at ? this.o.name(cmd, at[1]) : null;
    const source = from ? this.o.uiVars.find(from) : undefined;
    if (source && to) this.o.uiVars.set(this.o.uiVars.add(to, null, UIVAR_LONGEVITY.TEMPORARY), source.value);
    return true;
  };

  /** The five rows and the parked rows' gates registered in `host`. */
  register(host: UiCommandHost): void {
    host.setHandler('InitOptions', this.InitOptions);
    host.setHandler('StoreOptions', this.StoreOptions);
    host.setHandler('SetControllerConfig', this.SetControllerConfig);
    host.setHandler('CopyUIVar', this.CopyUIVar);
    host.setHandler('SetStickPreset', this.SetStickPreset);
    host.setHandler('SetScreenOrigin', this.SetScreenOrigin);
    host.setHandler('CheckVideoMode', checkVideoMode(this.o.dialog));          // OT.R79: the page's mode 0; VIDEO's strip left alone
    host.setBindingGate(VIDEO_PICTURE_GATE, videoPictureGate((p) => { this.o.picture?.set(p); }));
    host.setBindingGate(VIDEO_ROW_HELP_GATE, videoRowHelpGate((cmd) => host.dispatch(cmd)));   // CPS-4b's rows' help lines (an adaptation)
    host.setBindingGate(OPTIONS_PARKED_GATE, optionsRowGate);
    host.setControlGate(OPTIONS_PARKED_GATE, optionsControlGate);
  }
}
