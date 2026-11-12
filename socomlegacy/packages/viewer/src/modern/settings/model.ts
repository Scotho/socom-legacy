import { TUNER_RANGE } from '@s2u/ui';
import type { OptionsChoiceControl, OptionsControl, OptionsGroupId, OptionsReadonlyControl, OptionsSliderControl, OptionsStepperControl, OptionsSwitchControl } from '@s2u/ui';
import type { IconName } from '../icons';

/**
 * The settings page's table (MU-5 of `docs/plans/2026-10-09-modern-ui-parallel.md`): which option valves and system
 * tuners the launcher's Options offer. A browser adaptation (MU.R1): the screen is new, the values are the original's.
 *
 * SS-1 (2026-11-07): the table itself -- the controls, the valves not offered, the tuners' defaults, each control's
 * dialog, strip and boxes -- is `@s2u/ui` `optionsSchema.ts`, the one description the in-game OPTIONS screens are held
 * to (viewer `test/optionsSchema.test.ts`); this module re-exports it under the names its readers use and keeps what is
 * the launcher's alone (the groups' icons, the slider's percent).
 */
export {
  OPTIONS_CONTROLS as CONTROLS, OPTIONS_NOT_OFFERED as NOT_OFFERED, optionsTunerDefault as tunerDefault,
  OPTIONS_SCREEN_ORIGIN_X as SCREEN_ORIGIN_X, OPTIONS_SCREEN_ORIGIN_Y as SCREEN_ORIGIN_Y, STICK_PRESET_CUSTOM, isOptionValve,
} from '@s2u/ui';
export type GroupId = OptionsGroupId;
export type Control = OptionsControl;
export type SwitchControl = OptionsSwitchControl;
export type ChoiceControl = OptionsChoiceControl;
export type StepperControl = OptionsStepperControl;
export type ReadonlyControl = OptionsReadonlyControl;
export type SliderControl = OptionsSliderControl;

export const SETTINGS_ADAPTATION = 'a browser settings page over the card\'s option valves, not part of the original' as const;

/**
 * A slider's track step, in percent: research 302 §4 ("Sliders use the original widget's two-percent track step and
 * held repeat"; `CSliderBar`'s step is `NUM_INTERVALS` x `SLIDER_STEP_UNIT` 0.01, `FUN_00371d00`).
 */
export const SLIDER_STEP_PERCENT = 2;

/** The slider's range in percent: the tuners' range [0, 1] (`TUNER_RANGE`; `FUN_00371d00`'s clamps), as the scripts' 0..100. */
export const SLIDER_RANGE_PERCENT: readonly [number, number] = [TUNER_RANGE[0] * 100, TUNER_RANGE[1] * 100];

export interface Group { id: GroupId; label: string; icon: IconName }

/** The groups, by what the valve is: sound, the picture, the pad, talking to others, the PS2 console's own. */
export const GROUPS: readonly Group[] = [
  { id: 'audio', label: 'Audio', icon: 'volume' },
  { id: 'display', label: 'Display', icon: 'display' },
  { id: 'controls', label: 'Controls', icon: 'pad' },
  { id: 'communication', label: 'Communication', icon: 'players' },
  { id: 'console', label: 'Console', icon: 'disc' },
];
