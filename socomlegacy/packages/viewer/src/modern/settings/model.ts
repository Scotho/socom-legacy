import { OPTION_VALVES, stickTunersOfPreset, SYSTEM_TUNERS, TUNER_RANGE } from '@s2u/ui';
import type { IconName } from '../icons';

/**
 * The settings page's table (MU-5 of `docs/plans/2026-10-09-modern-ui-parallel.md`): which option valves and system
 * tuners the page offers, the control each one has in the original's OPTIONS screen, the values each control writes
 * and its range. A browser adaptation (MU.R1): the screen is new, the values are the original's.
 *
 * Sources (web research 229 §3's table of what each strip's ONCHECK animation writes, `docs/research/229-the-options-and-personas-json.md`;
 * research 302 §4's inventory of the four OPTIONS pages and their ranges, `302-original-options-and-communications.md`;
 * the option names `OPTION_VALVES`, `@s2u/ui` `optionsCommands.ts`; the tuners `SYSTEM_TUNERS`, `FUN_0038a7a0`
 * D:L282238-282472). Every value below is cited there as a reading, none is new.
 *
 * **Labels.** The original's words for a row are on the disc's text tables, which this page does not read; the code
 * holds them only as the capitalised names in `OPTIONS_PARKED_ROWS`' `why` lines (MUSIC, SOUND and DIALOG volume,
 * HEADSET VOLUME, TEAMMATE NAMES, VIDEO MODE, HELP WINDOWS, HEAD BOB, PITCH, FIRE RATE, VIBRATION, AIM ASSIST,
 * PRESETS, LOOK SPEED, ACCELERATION, DEAD ZONE, SOUND MONO/STEREO/DOLBY, SCREEN POSITION; BRIGHTNESS was one until its row
 * was unparked, 2026-10-23, research 358). Those are used, in sentence
 * case; where the code holds none (the whispers, the groups' names), a plain modern word is used.
 */

export const SETTINGS_ADAPTATION = 'a browser settings page over the card\'s option valves, not part of the original' as const;

/**
 * A slider's track step, in percent: research 302 §4 ("Sliders use the original widget's two-percent track step and
 * held repeat"; `CSliderBar`'s step is `NUM_INTERVALS` x `SLIDER_STEP_UNIT` 0.01, `FUN_00371d00`).
 */
export const SLIDER_STEP_PERCENT = 2;

/** The slider's range in percent: the tuners' range [0, 1] (`TUNER_RANGE`; `FUN_00371d00`'s clamps), as the scripts' 0..100. */
export const SLIDER_RANGE_PERCENT: readonly [number, number] = [TUNER_RANGE[0] * 100, TUNER_RANGE[1] * 100];

/** SCREEN ADJUST's bounds (research 229 §3, OPT-12: `ScreenOriginX` inside 0..250, `ScreenOriginY` inside 80..250, one a step). */
export const SCREEN_ORIGIN_X = { min: 0, max: 250, step: 1 } as const;
export const SCREEN_ORIGIN_Y = { min: 80, max: 250, step: 1 } as const;

/** The `stick_preset` value of the Custom box: the only one whose three sliders are enabled (research 229 §3, OPT-13). */
export const STICK_PRESET_CUSTOM = 3;

export type GroupId = 'audio' | 'display' | 'controls' | 'communication' | 'console';
export interface Group { id: GroupId; label: string; icon: IconName }

/** The groups, by what the valve is: sound, the picture, the pad, talking to others, the PS2 console's own. */
export const GROUPS: readonly Group[] = [
  { id: 'audio', label: 'Audio', icon: 'volume' },
  { id: 'display', label: 'Display', icon: 'display' },
  { id: 'controls', label: 'Controls', icon: 'pad' },
  { id: 'communication', label: 'Communication', icon: 'players' },
  { id: 'console', label: 'Console', icon: 'disc' },
];

interface Base { id: string; group: GroupId; label: string }
export interface SwitchControl extends Base { kind: 'switch'; valve: string }
export interface ChoiceControl extends Base { kind: 'choice'; valve: string; options: readonly { value: number; label: string }[] }
export interface StepperControl extends Base { kind: 'stepper'; valve: string; min: number; max: number; step: number }
export interface ReadonlyControl extends Base { kind: 'readonly'; valve: string; words: Readonly<Record<number, string>>; why: string }
export interface SliderControl extends Base {
  kind: 'slider'; tuner: string;
  /** The sliders `dlgControllerSelection` enables for the Custom stick preset only (research 229 §3). */
  customStickOnly?: boolean;
}
export type Control = SwitchControl | ChoiceControl | StepperControl | ReadonlyControl | SliderControl;

const onOff = (id: string, group: GroupId, label: string): SwitchControl => ({ id, group, label, kind: 'switch', valve: id });

/** Every control, in the page's order. The valve's values are research 229 §3's table; a range is 302 §4's. */
export const CONTROLS: readonly Control[] = [
  // Audio (dlgOptions_Audio: OPT-10; the four volume sliders and the mono / stereo / Dolby strip)
  { id: 'MUSIC_VOLUME', group: 'audio', label: 'Music volume', kind: 'slider', tuner: 'MUSIC_VOLUME' },
  { id: 'SOUND_VOLUME', group: 'audio', label: 'Sound volume', kind: 'slider', tuner: 'SOUND_VOLUME' },
  { id: 'DIALOG_VOLUME', group: 'audio', label: 'Dialog volume', kind: 'slider', tuner: 'DIALOG_VOLUME' },
  { id: 'HEADSET_CONTROLLER', group: 'audio', label: 'Headset volume', kind: 'slider', tuner: 'HEADSET_CONTROLLER' },
  { id: 'STEREO_CONTROLLER', group: 'audio', label: 'Sound mode', kind: 'choice', valve: 'STEREO_CONTROLLER',
    options: [{ value: 0, label: 'Mono' }, { value: 1, label: 'Stereo' }, { value: 2, label: 'Dolby' }] },   // disable_stereo 0 / enable_stereo 1 / enable_dolby 2
  // Display (dlgOptions_Video: OPT-11)
  { id: 'BRIGHTNESS', group: 'display', label: 'Brightness', kind: 'slider', tuner: 'BRIGHTNESS' },
  onOff('BOBBING_1ST_PERSON', 'display', 'Head bob'),
  onOff('DISPLAY_MP_TEAM_NAMES', 'display', 'Teammate names'),
  onOff('HelpWindowsEnabled', 'display', 'Help windows'),
  // Controls (dlgControllerSelection: OPT-13)
  onOff('VIBRATION_CONTROLLER', 'controls', 'Vibration'),
  onOff('AutoAim', 'controls', 'Aim assist'),
  { id: 'INVERT_PITCH_CONTROLLER', group: 'controls', label: 'Pitch', kind: 'choice', valve: 'INVERT_PITCH_CONTROLLER',
    options: [{ value: 0, label: 'Normal' }, { value: 1, label: 'Inverted' }] },   // disable_inverted_pitch 0 / enable_inverted_pitch 1
  { id: 'FIREMODESWAP_CONTROLLER', group: 'controls', label: 'Fire rate', kind: 'choice', valve: 'FIREMODESWAP_CONTROLLER',
    options: [{ value: 0, label: 'L3' }, { value: 1, label: 'Select' }] },   // L3_fire_rate 0 / select_fire_rate 1
  // The preset boxes' words (Trainee, Soldier, Seal, Custom) are research 229 §3's; research 302's table says Recruit, Sailor, SEAL, Custom -- the two notes disagree, 229's (the later review) is followed.
  { id: 'stick_preset', group: 'controls', label: 'Stick preset', kind: 'choice', valve: 'stick_preset',
    options: [{ value: 0, label: 'Trainee' }, { value: 1, label: 'Soldier' }, { value: 2, label: 'Seal' }, { value: STICK_PRESET_CUSTOM, label: 'Custom' }] },
  // The control names StickSensitivity / StickAcceleration / StickDeadZone (OPTIONS_PARKED_ROWS) bind these three; the pairing of STICK_INERTIA with ACCELERATION is by name only.
  { id: 'STICK_SENSITIVITY', group: 'controls', label: 'Look speed', kind: 'slider', tuner: 'STICK_SENSITIVITY', customStickOnly: true },
  { id: 'STICK_INERTIA', group: 'controls', label: 'Acceleration', kind: 'slider', tuner: 'STICK_INERTIA', customStickOnly: true },
  { id: 'STICK_DEADZONE', group: 'controls', label: 'Dead zone', kind: 'slider', tuner: 'STICK_DEADZONE', customStickOnly: true },
  // Communication (dlgOnlineOptions: OPT-15; TEAMMATE NAMES is on that page too, one valve, shown once under Display)
  onOff('EnableExternalWhispers', 'communication', 'External whispers'),
  // Console (the PS2's own: SCREEN ADJUST OPT-12; VIDEO MODE and HDD behind the original's popups)
  { id: 'ScreenOriginX', group: 'console', label: 'Screen position, across', kind: 'stepper', valve: 'ScreenOriginX', ...SCREEN_ORIGIN_X },
  { id: 'ScreenOriginY', group: 'console', label: 'Screen position, down', kind: 'stepper', valve: 'ScreenOriginY', ...SCREEN_ORIGIN_Y },
  { id: 'video_mode', group: 'console', label: 'Video mode', kind: 'readonly', valve: 'video_mode', words: { 0: 'Interlaced', 1: 'Progressive' },
    why: 'The original asks a question before it changes the PS2 output mode' },
  { id: 'HDD_ENABLE', group: 'console', label: 'Hard disk', kind: 'readonly', valve: 'HDD_ENABLE', words: { 0: 'Off', 1: 'On' },
    why: 'The original sets it by probing the PS2 hard disk' },
];

/**
 * The option valves no control here edits, each with why (research 229 §3: "Not toggles, not tabled" and the strips that
 * bind them; the rows below are in `OPTION_VALVES` and in no OPTIONS strip). A test holds `CONTROLS` and this list to
 * `OPTION_VALVES`, so an option valve cannot be dropped silently.
 */
export const NOT_OFFERED: readonly { valve: string; why: string }[] = [
  { valve: 'SUBTITLE_CONTROLLER', why: 'No strip of the four OPTIONS pages binds it (research 229 §3)' },
  { valve: 'DIALOG_CONTROLLER', why: 'No strip of the four OPTIONS pages binds it (research 229 §3)' },
  { valve: 'ORDER_RESPONSE_CONTROLLER', why: 'No strip of the four OPTIONS pages binds it (research 229 §3)' },
  { valve: 'STICK_SWAP_CONTROLLER', why: 'enable_stickswap and disable_stickswap exist in the script and no strip binds them (research 229 §3)' },
  { valve: 'NoAutoAim', why: 'A prohibition the original aim assist reads; no strip binds it (research 302 §4)' },
  { valve: 'SelectedControllerConfig', why: 'Written by CONTROLLER PRESETS, whose remapping is not built (research 302 §4, OPT-14)' },
  { valve: 'ChosePresetOnce', why: 'Written by CONTROLLER PRESETS, whose remapping is not built (research 302 §4, OPT-14)' },
  { valve: 'VoiceMask', why: 'The START menu voice modulation, not an OPTIONS page (research 226)' },
];

/**
 * The default a tuner has before any save (`InitSystemTuners`, `SYSTEM_TUNERS`): a real, or null where the code gives none.
 * The three stick sliders have none there; the boot's `UIStoreOptions` (`FUN_0027b960`) runs `SetStickPreset` at
 * `stick_preset`'s default 0, which writes RECRUIT's three (`@s2u/ui` `stickTunersOfPreset`; OT.R72, LATER 315-318).
 */
export function tunerDefault(name: string): number | null {
  const boot = stickTunersOfPreset(0);
  if (name === 'STICK_SENSITIVITY') return boot.sensitivity;
  if (name === 'STICK_INERTIA') return boot.inertia;
  if (name === 'STICK_DEADZONE') return boot.deadZone;
  return SYSTEM_TUNERS.find((t) => t.name === name)?.default ?? null;
}

/** Whether a valve name is one the original's OPTIONS screen leaves to the card (`OPTION_VALVES`). */
export const isOptionValve = (name: string): boolean => OPTION_VALVES.includes(name);
