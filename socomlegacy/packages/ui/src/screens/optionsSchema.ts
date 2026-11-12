import { stickTunersOfPreset, STICK_PRESET_CUSTOM } from '../stickTuners';
import { SYSTEM_TUNERS } from '../uiVars';
import { OPTION_VALVES, OPTIONS_AUDIO, OPTIONS_CONTROLLER, OPTIONS_MENU, OPTIONS_VIDEO } from './optionsCommands';
import { ONLINE_OPTIONS } from './worldOfSocomCommands';

/**
 * **The one description of the original's settings** (SS-1; the owner, Craig, 2026-11-07: "our in game video settings
 * and game settings added to the launcher have drifted, we need to bring them back in sync"). Which option valves and
 * system tuners a settings surface offers, the control each one is on the original's OPTIONS pages (the dialog and the
 * strip's or the slider's name in its design), the values each control writes, the box that writes each, and its
 * range. The in-game screens keep running the disc's own dialogs and scripts; this table only *describes* them, the
 * launcher's Options (viewer `console/adapters/options.ts`, through `modern/settings/model.ts`) draw from it, and
 * viewer `test/optionsSchema.test.ts` holds it to the disc's design on the fixtures -- each strip stepped through every
 * box, each slider's variable, each box's caption, each row drawn -- so the two surfaces cannot drift apart unseen.
 * A description, product track: it changes nothing the game does.
 *
 * Sources (moved from viewer `modern/settings/model.ts`, MU-5, where they were written): web research 229 §3's table of
 * what each strip's ONCHECK animation writes (`docs/research/229-the-options-and-personas-json.md`); research 302 §4's
 * inventory of the four OPTIONS pages and their ranges (`302-original-options-and-communications.md`); the option names
 * `OPTION_VALVES` (`./optionsCommands`); the tuners `SYSTEM_TUNERS` (`FUN_0038a7a0` D:L282238-282472). The dialogs' and
 * the controls' names and each box's name and caption are the disc's (`tools/dump-dialogs.ts --dialog <rdr>`, the fixture
 * `test-fixtures/RUN/UI/READERC.ZAR`). Every value below is cited there as a reading, none is new.
 *
 * **Labels.** A box's caption is the disc's string id (`_195_RECRUIT_MSG`) or a literal (`OFF`, `Dolby Pro Logic II`);
 * the launcher shows it in sentence case. Where the code holds no caption (the whispers, the groups' names), a plain
 * modern word is used. A label that is not its box's caption is declared in the pinning test's caption map.
 */

/** The PS2's SCREEN ADJUST page (OPT-12): its d-pad steps the origin; no strip, no slider. */
export const OPTIONS_SCREEN_ADJUST = 'dlgScreenAdjust.rdr';

/** SCREEN ADJUST's bounds (research 229 §3, OPT-12: `ScreenOriginX` inside 0..250, `ScreenOriginY` inside 80..250, one a step). */
export const OPTIONS_SCREEN_ORIGIN_X = { min: 0, max: 250, step: 1 } as const;
export const OPTIONS_SCREEN_ORIGIN_Y = { min: 80, max: 250, step: 1 } as const;

/** The groups a surface sorts the rows into, by what the valve is: sound, the picture, the pad, talking to others, the PS2's own. */
export type OptionsGroupId = 'audio' | 'display' | 'controls' | 'communication' | 'console';

interface OptionsBase {
  id: string; group: OptionsGroupId; label: string;
  /** The OPTIONS page whose design draws the row (`OPTIONS_AUDIO`, ...). */
  dialog: string;
  /** The strip's or the slider's name in that design; null where the page's own pad is the control (SCREEN ADJUST). */
  control: string | null;
  /** The same valve's strip on another page of the original (TEAMMATE NAMES on ONLINE OPTIONS too, research 229 §3). */
  alsoOn?: readonly { dialog: string; control: string }[];
  /**
   * Why a row the launcher shows is kept though the game's page does not draw its control (`DialogRecord.hidden`); absent,
   * the game draws it (the pinning test refuses a shown row the game hides without one). None today: HELP WINDOWS, the
   * one control the game hides (CPS-4b), is not offered (`OPTIONS_NOT_OFFERED`).
   */
  storeOnly?: string;
}
/** An on/off strip: each value's box (the box whose ONCHECK writes it, research 229 §3). */
export interface OptionsSwitchControl extends OptionsBase { kind: 'switch'; valve: string; boxes: { off: string; on: string } }
/** A strip of named values: each option's box (SS-2: every value has one -- the card holds only what a box of the original writes). */
export interface OptionsChoiceControl extends OptionsBase { kind: 'choice'; valve: string; options: readonly { value: number; label: string; box: string }[] }
export interface OptionsStepperControl extends OptionsBase { kind: 'stepper'; valve: string; min: number; max: number; step: number }
export interface OptionsReadonlyControl extends OptionsBase { kind: 'readonly'; valve: string; words: Readonly<Record<number, string>>; why: string }
export interface OptionsSliderControl extends OptionsBase {
  kind: 'slider'; tuner: string;
  /** The sliders `dlgControllerSelection` enables for the Custom stick preset only (research 229 §3). */
  customStickOnly?: boolean;
}
export type OptionsControl = OptionsSwitchControl | OptionsChoiceControl | OptionsStepperControl | OptionsReadonlyControl | OptionsSliderControl;

const onOff = (id: string, group: OptionsGroupId, label: string, dialog: string, control: string, off: string, on: string): OptionsSwitchControl =>
  ({ id, group, label, kind: 'switch', valve: id, dialog, control, boxes: { off, on } });

/** Every control, in the launcher's order. The valve's values are research 229 §3's table; a range is 302 §4's. */
export const OPTIONS_CONTROLS: readonly OptionsControl[] = [
  // Audio (dlgOptions_Audio: OPT-10; the four volume sliders and the mono / stereo / Dolby strip)
  { id: 'MUSIC_VOLUME', group: 'audio', label: 'Music volume', kind: 'slider', tuner: 'MUSIC_VOLUME', dialog: OPTIONS_AUDIO, control: 'music_bar' },
  { id: 'SOUND_VOLUME', group: 'audio', label: 'Sound volume', kind: 'slider', tuner: 'SOUND_VOLUME', dialog: OPTIONS_AUDIO, control: 'sound_bar' },
  { id: 'DIALOG_VOLUME', group: 'audio', label: 'Dialog volume', kind: 'slider', tuner: 'DIALOG_VOLUME', dialog: OPTIONS_AUDIO, control: 'dialog_bar' },
  { id: 'HEADSET_CONTROLLER', group: 'audio', label: 'Headset volume', kind: 'slider', tuner: 'HEADSET_CONTROLLER', dialog: OPTIONS_AUDIO, control: 'headset_bar' },
  // D7 (SS-1): the order the game draws, left to right, STEREO, MONO, Dolby Pro Logic II (x 192, 292, 392; the list agrees; the third a literal caption, "Dolby" here).
  { id: 'STEREO_CONTROLLER', group: 'audio', label: 'Sound mode', kind: 'choice', valve: 'STEREO_CONTROLLER', dialog: OPTIONS_AUDIO, control: 'mono_stereo',
    options: [{ value: 1, label: 'Stereo', box: 'Stereo' }, { value: 0, label: 'Mono', box: 'Mono' }, { value: 2, label: 'Dolby', box: 'Dolby' }] },   // enable_stereo 1 / disable_stereo 0 / enable_dolby 2
  // Display (dlgOptions_Video: OPT-11)
  { id: 'BRIGHTNESS', group: 'display', label: 'Brightness', kind: 'slider', tuner: 'BRIGHTNESS', dialog: OPTIONS_VIDEO, control: 'brightnessbar' },
  onOff('BOBBING_1ST_PERSON', 'display', 'Head bob', OPTIONS_VIDEO, 'headbobbing', 'headboboff', 'headbobon'),
  // SS-2 (H422 answered (a), the owner, Craig, 2026-11-07): the original's two values, Disable_ / Enable_TeamNames' 0 / 1,
  // on VIDEO and ONLINE OPTIONS alike. The look of the tags (the original's or LATER 671's adapted ones, OT.R101) is a
  // browser setting, viewer `nameTags` `s2u.viewer.nameTags`; a card holding v0.4.11-v0.4.12's launcher-only 2 is read as 1.
  { ...onOff('DISPLAY_MP_TEAM_NAMES', 'display', 'Teammate names', OPTIONS_VIDEO, 'TeamMateNames', 'TeamMateNameOff', 'TeamMateNameOn'),
    alsoOn: [{ dialog: ONLINE_OPTIONS, control: 'TeamMateNames' }] },
  // HELP WINDOWS (`helpwindows`, boxes Helpoff / Helpon): not offered since SS-1 (D4) -- `OPTIONS_NOT_OFFERED`.
  // Controls (dlgControllerSelection: OPT-13)
  onOff('VIBRATION_CONTROLLER', 'controls', 'Vibration', OPTIONS_CONTROLLER, 'Vibration', 'Viboff', 'Vibon'),
  onOff('AutoAim', 'controls', 'Aim assist', OPTIONS_CONTROLLER, 'AutoAim', 'AAoff', 'AAon'),
  { id: 'INVERT_PITCH_CONTROLLER', group: 'controls', label: 'Pitch', kind: 'choice', valve: 'INVERT_PITCH_CONTROLLER', dialog: OPTIONS_CONTROLLER, control: 'invert_pitch',
    options: [{ value: 0, label: 'Normal', box: 'Invert_Off' }, { value: 1, label: 'Inverted', box: 'Invert_On' }] },   // disable_inverted_pitch 0 / enable_inverted_pitch 1
  // D7 (SS-1; REVIEW-1 F1): the order the game draws, left to right -- L3 (x 180) then SELECT (x 350); the design lists SELECT first.
  { id: 'FIREMODESWAP_CONTROLLER', group: 'controls', label: 'Fire rate', kind: 'choice', valve: 'FIREMODESWAP_CONTROLLER', dialog: OPTIONS_CONTROLLER, control: 'firerate',
    options: [{ value: 0, label: 'L3', box: 'L3_analog' }, { value: 1, label: 'Select', box: 'Select_button' }] },   // L3_fire_rate 0 / select_fire_rate 1
  // D3 (SS-1): the words are the boxes' captions on the disc -- `_195_RECRUIT_MSG`, `_196_SAILOR_MSG`, `_197_SEAL_MSG`,
  // `_194_CUSTOM_MSG` (`tools/dump-dialogs.ts --dialog dlgControllerSelection.rdr`) -- as research 302 has them. Trainee,
  // Soldier and Seal are the boxes' *names* (research 229 §3 tabulated the names; its correction line says so).
  { id: 'stick_preset', group: 'controls', label: 'Stick preset', kind: 'choice', valve: 'stick_preset', dialog: OPTIONS_CONTROLLER, control: 'stick_presets',
    options: [{ value: 0, label: 'Recruit', box: 'Trainee' }, { value: 1, label: 'Sailor', box: 'Soldier' }, { value: 2, label: 'Seal', box: 'Seal' }, { value: STICK_PRESET_CUSTOM, label: 'Custom', box: 'Custom' }] },
  // The control names StickSensitivity / StickAcceleration / StickDeadZone bind these three (each SLIDERBAR's UIVAR, the pinning test).
  { id: 'STICK_SENSITIVITY', group: 'controls', label: 'Look speed', kind: 'slider', tuner: 'STICK_SENSITIVITY', customStickOnly: true, dialog: OPTIONS_CONTROLLER, control: 'StickSensitivity' },
  { id: 'STICK_INERTIA', group: 'controls', label: 'Acceleration', kind: 'slider', tuner: 'STICK_INERTIA', customStickOnly: true, dialog: OPTIONS_CONTROLLER, control: 'StickAcceleration' },
  { id: 'STICK_DEADZONE', group: 'controls', label: 'Dead zone', kind: 'slider', tuner: 'STICK_DEADZONE', customStickOnly: true, dialog: OPTIONS_CONTROLLER, control: 'StickDeadZone' },
  // Communication (dlgOnlineOptions: OPT-15; TEAMMATE NAMES is on that page too, one valve, shown once under Display)
  onOff('EnableExternalWhispers', 'communication', 'External whispers', ONLINE_OPTIONS, 'ExternalWhispers', 'WhispersOff', 'WhispersOn'),
  // Console (the PS2's own: SCREEN ADJUST OPT-12; VIDEO MODE and HDD behind the original's popups)
  { id: 'ScreenOriginX', group: 'console', label: 'Screen position, across', kind: 'stepper', valve: 'ScreenOriginX', dialog: OPTIONS_SCREEN_ADJUST, control: null, ...OPTIONS_SCREEN_ORIGIN_X },
  { id: 'ScreenOriginY', group: 'console', label: 'Screen position, down', kind: 'stepper', valve: 'ScreenOriginY', dialog: OPTIONS_SCREEN_ADJUST, control: null, ...OPTIONS_SCREEN_ORIGIN_Y },
  { id: 'video_mode', group: 'console', label: 'Video mode', kind: 'readonly', valve: 'video_mode', words: { 0: 'Interlaced', 1: 'Progressive' }, dialog: OPTIONS_VIDEO, control: 'video_mode',
    why: 'The original asks a question before it changes the PS2 output mode' },
  { id: 'HDD_ENABLE', group: 'console', label: 'Hard disk', kind: 'readonly', valve: 'HDD_ENABLE', words: { 0: 'Off', 1: 'On' }, dialog: OPTIONS_MENU, control: 'HDDOnOff',
    why: 'The original sets it by probing the PS2 hard disk' },
];

/**
 * The option valves no control here edits, each with why (research 229 §3: "Not toggles, not tabled" and the strips that
 * bind them; the rows below are in `OPTION_VALVES` and in no OPTIONS strip). A test holds `OPTIONS_CONTROLS` and this
 * list to `OPTION_VALVES`, so an option valve cannot be dropped silently.
 */
export const OPTIONS_NOT_OFFERED: readonly { valve: string; why: string }[] = [
  { valve: 'SUBTITLE_CONTROLLER', why: 'No strip of the four OPTIONS pages binds it (research 229 §3)' },
  { valve: 'DIALOG_CONTROLLER', why: 'No strip of the four OPTIONS pages binds it (research 229 §3)' },
  { valve: 'ORDER_RESPONSE_CONTROLLER', why: 'No strip of the four OPTIONS pages binds it (research 229 §3)' },
  { valve: 'STICK_SWAP_CONTROLLER', why: 'enable_stickswap and disable_stickswap exist in the script and no strip binds them (research 229 §3)' },
  { valve: 'NoAutoAim', why: 'A prohibition the original aim assist reads; no strip binds it (research 302 §4)' },
  // D6 (SS-1): OPT-14's page is built in the game (2026-10-18, research 344); the launcher's Button mapping is the browser's own.
  { valve: 'SelectedControllerConfig', why: 'Written by the game\'s CONTROLLER PRESETS page (OPT-14, research 344), adopted by the shared Controller layout selector; Button mapping is the separate browser hardware mapping' },
  { valve: 'ChosePresetOnce', why: 'Written by the game\'s CONTROLLER PRESETS page (OPT-14, research 344) when a preset is chosen; saved with SelectedControllerConfig by the shared Controller layout selector' },
  // D4 (SS-1): HELP WINDOWS left the launcher, following the game's page.
  { valve: 'HelpWindowsEnabled', why: 'Inert in the port -- its one reader, the campaign\'s help pop-up (FUN_001fdeb0), is not in it -- and hidden on the game\'s VIDEO page since CPS-4b (40e037620); the card keeps its value' },
  { valve: 'VoiceMask', why: 'The START menu voice modulation, not an OPTIONS page (research 226)' },
];

/**
 * The default a tuner has before any save (`InitSystemTuners`, `SYSTEM_TUNERS`): a real, or null where the code gives none.
 * The three stick sliders have none there; the boot's `UIStoreOptions` (`FUN_0027b960`) runs `SetStickPreset` at
 * `stick_preset`'s default 0, which writes RECRUIT's three (`stickTunersOfPreset`; OT.R72, LATER 315-318).
 */
export function optionsTunerDefault(name: string): number | null {
  const boot = stickTunersOfPreset(0);
  if (name === 'STICK_SENSITIVITY') return boot.sensitivity;
  if (name === 'STICK_INERTIA') return boot.inertia;
  if (name === 'STICK_DEADZONE') return boot.deadZone;
  return SYSTEM_TUNERS.find((t) => t.name === name)?.default ?? null;
}

/** A switch's or a choice's boxes, each with the value its ONCHECK writes and the row's label for it. */
export function optionsBoxesOf(c: OptionsSwitchControl | OptionsChoiceControl): { box: string; value: number; label: string }[] {
  if (c.kind === 'switch') return [{ box: c.boxes.off, value: 0, label: 'Off' }, { box: c.boxes.on, value: 1, label: 'On' }];
  return c.options.map((o) => ({ box: o.box, value: o.value, label: o.label }));
}

/** Whether a valve name is one the original's OPTIONS screen leaves to the card (`OPTION_VALVES`). */
export const isOptionValve = (name: string): boolean => OPTION_VALVES.includes(name);
