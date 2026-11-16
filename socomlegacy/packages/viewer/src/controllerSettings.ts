import { COD_MODERN_DESCRIPTION, COD_MODERN_LABEL, COD_MODERN_VALUE } from './controllerModern';
import { CONTROLLER_CONFIGS_READING, PRESET_PAGE_CONFIG, type ControllerConfigName } from './controllerConfigs';

/** Browser adaptation, requested 2026-11-08: one controller editor in the launcher and Home overlay.
 * The four names and card values are the original preset pages (research 344, R344.4/R344.6).
 * Their mappings remain controller.rdr's. COD Modern is an additional browser mapping, requested 2026-11-09,
 * kept in controllerModern rather than presented as original disc data.
 * Native CONTROLLER OPTIONS and CONTROLLER PRESETS remain alongside the shared editor (UCS.R2).
 */
export const CONTROLLER_LAYOUTS = [
  { value: 1, label: 'Precision Shooter' }, { value: 2, label: 'Lefty' },
  { value: 3, label: 'Scout' }, { value: 4, label: 'Sure Shot' },
  { value: COD_MODERN_VALUE, label: COD_MODERN_LABEL },                 // V20.R4: the page's choice, not a card value
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
  if (value === COD_MODERN_VALUE) return COD_MODERN_DESCRIPTION;
  const config: ControllerConfigName = PRESET_PAGE_CONFIG[value as 1 | 2 | 3 | 4] ?? 'Default';
  const lines = CONTROLLER_CONFIGS_READING[config].map(({ control, result, aimMode }) =>
    `${CONTROL_WORDS[control] ?? control}: ${ACTION_WORDS[result] ?? result.toLowerCase()}${aimMode === undefined ? '' : aimMode === 'Off' ? ' (aim mode released)' : ' (aim mode held)'}.`);
  return 'Base layout, before your Button mapping and Fire rate adjustments. ' + lines.join(' ');
}
