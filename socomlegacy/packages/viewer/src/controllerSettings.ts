import { CONTROLLER_CONFIGS_READING, PRESET_PAGE_CONFIG, type ControllerConfigName } from './controllerConfigs';

/** Browser adaptation, requested 2026-11-08 (UCS.R1, PR #765; `./modern/settings/model` `SETTINGS_ADAPTATION`): the
 * launcher's and Home overlay's Controller layout row. The four names and card values are the original preset pages
 * (research 344, R344.4/R344.6: `PressPreset<n>` writes `SelectedControllerConfig` n and `ChosePresetOnce` 1).
 * Their mappings remain controller.rdr's, read by controllerConfigs; this module changes only their presentation.
 * The original OPTIONS menu keeps its CONTROLLER OPTIONS and CONTROLLER PRESETS pages beside it (UCS.R2, the owner's
 * word, 2026-11-09: "approved to keep both"); both edit the same saved settings. UCS.R1's hiding of them is declined.
 */
export const CONTROLLER_LAYOUTS = [
  { value: 1, label: 'Precision Shooter' }, { value: 2, label: 'Lefty' },
  { value: 3, label: 'Scout' }, { value: 4, label: 'Sure Shot' },
] as const;

const CONTROL_WORDS: Record<string, string> = {
  LeftStickVert: 'Left stick vertical', LeftStickHoriz: 'Left stick horizontal', LeftStickTap: 'L3',
  RightStickVert: 'Right stick vertical', RightStickHoriz: 'Right stick horizontal', RightStickTap: 'R3', X: 'Cross',
};
const ACTION_WORDS: Record<string, string> = {
  MoveLong: 'move forward/back', Strafe: 'strafe', Pitch: 'look up/down', Rotate: 'turn',
  FireMode: 'fire rate', SwapWeapon1: 'weapon swap 1', SwapWeapon2: 'weapon swap 2', Inventory: 'item menu',
  AimMode: 'aim mode', StrafeLeft: 'strafe left', StrafeRight: 'strafe right', TeamCommand: 'team command', TACMAP: 'tactical map',
};
export function controllerLayoutDescription(value: number): string {
  const config: ControllerConfigName = PRESET_PAGE_CONFIG[value as 1 | 2 | 3 | 4] ?? 'Default';
  const lines = CONTROLLER_CONFIGS_READING[config].map(({ control, result, aimMode }) =>
    `${CONTROL_WORDS[control] ?? control}: ${ACTION_WORDS[result] ?? result.toLowerCase()}${aimMode === undefined ? '' : aimMode === 'Off' ? ' (aim mode released)' : ' (aim mode held)'}.`);
  return 'Base layout, before your Button mapping and Fire rate adjustments. ' + lines.join(' ');
}
