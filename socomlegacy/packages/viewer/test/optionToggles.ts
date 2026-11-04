import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * OPT-02's transcriptions the page's valve-module tests share (web research 229 §2, §3): the persistent valves the
 * saved cards hold, and what each option's handler writes. Not a test file (vitest takes `*.test.ts` only): the unit
 * tests (`originalOptions.test.ts`) run on these with no game data, and the dev-host test
 * (`tools/test/valveModuleDisc.test.ts`) holds them to the disc and the cards.
 */

/** The pin PLAT-06 keeps of the f0 card's `PersistentValves.rdr` (`tools/test/dialogInventory.pinned.json`). */
export const PIN_PATH = resolve(import.meta.dirname, '../../../tools/test/dialogInventory.pinned.json');

/** The 65 names in the card's order, and the f0 card's value of each (read with the dev tool; research 229 §2). */
export function pinnedValves(): { names: string[]; values: Record<string, number> } {
  const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as { persistentValves: string[]; persistentValveValues: Record<string, number> };
  return { names: pin.persistentValves, values: pin.persistentValveValues };
}

/**
 * The two of the 65 whose f0 value is not `global_valves.rdr`'s (research 229 §2): a playthrough's state, written by
 * a script the player ran, not a default. `s16_l1b_step0` and `s16_l1b_step0b` hold the table's value of both. The
 * values are test-held (the dev-host test); each `why` -- which scripts write the valve -- is read, not tested.
 */
export const PLAYTHROUGH_STATE: Readonly<Record<string, { table: number; f0: number; why: string }>> = {
  ChosePresetOnce: { table: 0, f0: 1, why: 'set to 1 by CONTROLLER PRESETS\' PressPreset1-4 (dlgControllerPresets.rdr): the player chose a preset' },
  ForGameCompleteScreen: { table: 1, f0: 2, why: 'written by the campaign\'s scripts only: SELECT RANK\'s ProceedAsLieutenant (dlgSelectRank.rdr) sets 2' },
};

/** `global_valves.rdr`'s values of the 65 (the registry's defaults, `CValve_Open`): the pin's, the playthrough's two put back. */
export function tableDefaults(): Record<string, number> {
  const { values } = pinnedValves();
  const out = { ...values };
  for (const [name, s] of Object.entries(PLAYTHROUGH_STATE)) out[name] = s.table;
  return out;
}

/** Where the original binds a handler: a RADIOSTRIP's box (its ONCHECK), a button's pad binding, the dialog's own. */
export type ToggleBinding = { strip: string; box: string } | { button: string; pad: string } | { pad: string };

/** A VALVE command as the animation holds it: the valve, the op's word (`UI_VALVE_OPS`), the operand. */
export type ToggleOp = readonly [valve: string, op: '=' | '+=' | '-=', operand: number];

export interface OptionToggle {
  /** The roadmap task that owns the row (`04-options-memory-card.md`). */
  task: string;
  dialog: string;
  bound: ToggleBinding;
  /** The animation the binding names, in the dialog's set of `RUN/UIZANIM.ZAR`. */
  animation: string;
  /** Its VALVE commands, in order (each run by `FUN_00353fd0`'s ops 11-13). */
  ops: readonly ToggleOp[];
  /** The persistent valves it leaves, by name: what the next save's module shows changed (research 229 §3). */
  saved: Readonly<Record<string, number>>;
  /** A condition the animation tests before its writes, true at the table's defaults (one tested after them gates none). */
  when?: string;
}

const strip = (task: string, dialog: string, s: string, box: string, animation: string, ops: readonly ToggleOp[], saved: Record<string, number>): OptionToggle =>
  ({ task, dialog, bound: { strip: s, box }, animation, ops, saved });

const AUDIO = 'dlgOptions_Audio.rdr', VIDEO = 'dlgOptions_Video.rdr', CONTROLLER = 'dlgControllerSelection.rdr';
const PRESETS = 'dlgControllerPresets.rdr', ONLINE = 'dlgOnlineOptions.rdr', SCREEN = 'dlgScreenAdjust.rdr';
const CHANGED = 'OptionsMenuChanged';

/**
 * Every option handler of OPT-10..OPT-15 whose writes run straight through (research 229 §3): the RADIOSTRIP boxes'
 * ONCHECK animations (`FUN_00370db0` D:L268618-268666 checks the selected box; its ONCHECK binding is the box's slot,
 * `packages/ui/src/dialog.ts`), CONTROLLER PRESETS' CROSS and SCREEN ADJUST's pad. Left out, said in §3: the HDD row
 * (OPT-16; its writes follow the HDD probe's result) and VIDEO MODE's progressive box (behind its AreYouSure popup).
 * The stick presets' ONCHECK names `StickPreset<n>` and the set holds `stickPreset<n>`: the animation lookup is
 * case-blind (`FUN_00370db0` -> `FUN_0026a250` D:L268634, D:L268653 -> `FUN_0026c8f0` D:L115048, D:L115062, comparing
 * with `FUN_00198b80` D:L116537; research 106 §5, 107 R107.2), so the box runs the set's animation.
 */
export const OPTION_TOGGLES: readonly OptionToggle[] = [
  strip('OPT-10', AUDIO, 'mono_stereo', 'Stereo', 'enable_stereo', [[CHANGED, '=', 1], ['STEREO_CHANGED', '=', 1], ['STEREO_CONTROLLER', '=', 1]], { STEREO_CONTROLLER: 1 }),
  strip('OPT-10', AUDIO, 'mono_stereo', 'Mono', 'disable_stereo', [[CHANGED, '=', 1], ['STEREO_CHANGED', '=', 1], ['STEREO_CONTROLLER', '=', 0]], { STEREO_CONTROLLER: 0 }),
  strip('OPT-10', AUDIO, 'mono_stereo', 'Dolby', 'enable_dolby', [[CHANGED, '=', 1], ['STEREO_CHANGED', '=', 1], ['STEREO_CONTROLLER', '=', 2]], { STEREO_CONTROLLER: 2 }),
  strip('OPT-11', VIDEO, 'TeamMateNames', 'TeamMateNameOn', 'Enable_TeamNames', [['DISPLAY_MP_TEAM_NAMES', '=', 1], ['DISPTEAM_NAMES', '=', 1], [CHANGED, '=', 1]], { DISPLAY_MP_TEAM_NAMES: 1 }),
  strip('OPT-11', VIDEO, 'TeamMateNames', 'TeamMateNameOff', 'Disable_TeamNames', [['DISPLAY_MP_TEAM_NAMES', '=', 0], ['DISPTEAM_NAMES', '=', 1], [CHANGED, '=', 1]], { DISPLAY_MP_TEAM_NAMES: 0 }),
  strip('OPT-11', VIDEO, 'video_mode', 'VideoNTSC', 'video_ntsc', [[CHANGED, '=', 1], ['VideoChanged', '=', 1], ['video_mode', '=', 0]], { video_mode: 0 }),
  strip('OPT-11', VIDEO, 'helpwindows', 'Helpon', 'enable_Help', [['HelpWindowsEnabled', '=', 1], ['HelpChanged', '=', 1], [CHANGED, '=', 1]], { HelpWindowsEnabled: 1 }),
  strip('OPT-11', VIDEO, 'helpwindows', 'Helpoff', 'disable_Help', [['HelpWindowsEnabled', '=', 0], ['HelpChanged', '=', 1], [CHANGED, '=', 1]], { HelpWindowsEnabled: 0 }),
  strip('OPT-11', VIDEO, 'headbobbing', 'headbobon', 'enable_headbob', [[CHANGED, '=', 1], ['BobChanged', '=', 1], ['BOBBING_1ST_PERSON', '=', 1]], { BOBBING_1ST_PERSON: 1 }),
  strip('OPT-11', VIDEO, 'headbobbing', 'headboboff', 'disable_headbob', [[CHANGED, '=', 1], ['BobChanged', '=', 1], ['BOBBING_1ST_PERSON', '=', 0]], { BOBBING_1ST_PERSON: 0 }),
  strip('OPT-13', CONTROLLER, 'Vibration', 'Vibon', 'enable_vibration', [[CHANGED, '=', 1], ['VibrationChanged', '=', 1], ['VIBRATION_CONTROLLER', '=', 1]], { VIBRATION_CONTROLLER: 1 }),
  strip('OPT-13', CONTROLLER, 'Vibration', 'Viboff', 'disable_vibration', [[CHANGED, '=', 1], ['VIBRATION_CONTROLLER', '=', 0]], { VIBRATION_CONTROLLER: 0 }),
  strip('OPT-13', CONTROLLER, 'AutoAim', 'AAon', 'AutoAimOn', [[CHANGED, '=', 1], ['AutoAimChanged', '=', 1], ['AutoAim', '=', 1]], { AutoAim: 1 }),
  strip('OPT-13', CONTROLLER, 'AutoAim', 'AAoff', 'AutoAimOff', [[CHANGED, '=', 1], ['AutoAimChanged', '=', 1], ['AutoAim', '=', 0]], { AutoAim: 0 }),
  strip('OPT-13', CONTROLLER, 'invert_pitch', 'Invert_On', 'enable_inverted_pitch', [[CHANGED, '=', 1], ['PitchChanged', '=', 1], ['INVERT_PITCH_CONTROLLER', '=', 1]], { INVERT_PITCH_CONTROLLER: 1 }),
  strip('OPT-13', CONTROLLER, 'invert_pitch', 'Invert_Off', 'disable_inverted_pitch', [[CHANGED, '=', 1], ['PitchChanged', '=', 1], ['INVERT_PITCH_CONTROLLER', '=', 0]], { INVERT_PITCH_CONTROLLER: 0 }),
  strip('OPT-13', CONTROLLER, 'firerate', 'Select_button', 'select_fire_rate', [[CHANGED, '=', 1], ['FireRateChanged', '=', 1], ['FIREMODESWAP_CONTROLLER', '=', 1]], { FIREMODESWAP_CONTROLLER: 1 }),
  strip('OPT-13', CONTROLLER, 'firerate', 'L3_analog', 'L3_fire_rate', [[CHANGED, '=', 1], ['FireRateChanged', '=', 1], ['FIREMODESWAP_CONTROLLER', '=', 0]], { FIREMODESWAP_CONTROLLER: 0 }),
  ...([['Custom', 3], ['Trainee', 0], ['Soldier', 1], ['Seal', 2]] as const).map(([box, n]) => strip('OPT-13', CONTROLLER, 'stick_presets', box, `StickPreset${box}`,
    [[CHANGED, '=', 1], ['stick_presetChanged', '=', 1], ['stick_preset', '=', n], ['ResettingPreset', '=', 1], ['ResettingPreset', '=', 0]], { stick_preset: n })),
  ...[1, 2, 3, 4].map((n): OptionToggle => ({
    task: 'OPT-14', dialog: PRESETS, bound: { button: `Preset${n}Btn`, pad: 'CROSS' }, animation: `PressPreset${n}`,
    ops: [['ChosePresetOnce', '=', 1], [CHANGED, '=', 1], ['SelectedControllerConfig', '=', n]], saved: { ChosePresetOnce: 1, SelectedControllerConfig: n },
  })),
  strip('OPT-15', ONLINE, 'TeamMateNames', 'TeamMateNameOn', 'Enable_TeamNames', [['DISPLAY_MP_TEAM_NAMES', '=', 1], ['DISPTEAM_NAMES', '=', 1], [CHANGED, '=', 1]], { DISPLAY_MP_TEAM_NAMES: 1 }),
  strip('OPT-15', ONLINE, 'TeamMateNames', 'TeamMateNameOff', 'Disable_TeamNames', [['DISPLAY_MP_TEAM_NAMES', '=', 0], ['DISPTEAM_NAMES', '=', 1], [CHANGED, '=', 1]], { DISPLAY_MP_TEAM_NAMES: 0 }),
  strip('OPT-15', ONLINE, 'ExternalWhispers', 'WhispersOn', 'Enable_Whispers', [['EnableExternalWhispers', '=', 1], [CHANGED, '=', 1]], { EnableExternalWhispers: 1 }),
  strip('OPT-15', ONLINE, 'ExternalWhispers', 'WhispersOff', 'Disable_Whispers', [['EnableExternalWhispers', '=', 0], [CHANGED, '=', 1]], { EnableExternalWhispers: 0 }),
  { task: 'OPT-12', dialog: SCREEN, bound: { pad: 'LEFT' }, animation: 'screen_left', when: 'ScreenOriginX > 0', ops: [[CHANGED, '=', 1], ['ScreenWasChanged', '=', 1], ['ScreenOriginX', '-=', 1]], saved: { ScreenOriginX: 127 } },
  { task: 'OPT-12', dialog: SCREEN, bound: { pad: 'RIGHT' }, animation: 'screen_right', when: 'ScreenOriginX < 250', ops: [[CHANGED, '=', 1], ['ScreenWasChanged', '=', 1], ['ScreenOriginX', '+=', 1]], saved: { ScreenOriginX: 129 } },
  { task: 'OPT-12', dialog: SCREEN, bound: { pad: 'UP' }, animation: 'screen_up', when: 'ScreenOriginY > 80', ops: [[CHANGED, '=', 1], ['ScreenWasChanged', '=', 1], ['ScreenOriginY', '-=', 1]], saved: { ScreenOriginY: 127 } },
  { task: 'OPT-12', dialog: SCREEN, bound: { pad: 'DOWN' }, animation: 'screen_down', when: 'ScreenOriginY < 250', ops: [[CHANGED, '=', 1], ['ScreenWasChanged', '=', 1], ['ScreenOriginY', '+=', 1]], saved: { ScreenOriginY: 129 } },
];

/**
 * The RADIOSTRIP boxes of OPTIONS' pages and ONLINE OPTIONS that `OPTION_TOGGLES` leaves out, with why (research 229
 * §3). The dev-host test holds the two lists to every box the five dialogs build.
 */
export const OPTION_TOGGLES_LEFT_OUT: readonly { dialog: string; strip: string; box: string; why: string }[] = [
  { dialog: 'dlgOptions_Menu.rdr', strip: 'HDDOnOff', box: 'HDD_On', why: 'OPT-16: behind HDD_Operations and its confirm popup (CheckHDDEnable 2): HDD_ENABLE 1, then 0 again when GET_MISSION_DATA fails' },
  { dialog: 'dlgOptions_Menu.rdr', strip: 'HDDOnOff', box: 'HDD_Off', why: 'OPT-16: behind HDD_Operations and its confirm popup: HDD_ENABLE 0 on CheckHDDEnable 2, else 1 again' },
  { dialog: VIDEO, strip: 'video_mode', box: 'VideoDTV', why: 'OPT-11: video_mode 1 only once its AreYouSure popup answers YES' },
];
