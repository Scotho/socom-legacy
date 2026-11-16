import { padFamily, type PadFamily } from './padFamily';
import { readPreference, savePreference, SETUP_KEY } from './startupSettings';

/** Browser presentation preference: Steam Input can expose any device as Xbox.
 * https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices
 * Does not change device selection, hardware capabilities, bindings or action layouts.
 */
export const CONTROLLER_LABELS_KEY = `${SETUP_KEY}.controllerLabels`;
export const CONTROLLER_LABEL_CHOICES = [
  { id: 'auto', label: 'Automatic' }, { id: 'playstation', label: 'PlayStation' },
  { id: 'xbox', label: 'Xbox' }, { id: 'steam', label: 'Steam Controller' },
  { id: 'steam-deck', label: 'Steam Deck' },
] as const;
export type ControllerLabels = typeof CONTROLLER_LABEL_CHOICES[number]['id'];
export function readControllerLabels(): ControllerLabels {
  const saved = readPreference(CONTROLLER_LABELS_KEY);
  return CONTROLLER_LABEL_CHOICES.find(choice => choice.id === saved)?.id ?? 'auto';
}
export function saveControllerLabels(value: ControllerLabels): void {
  if (CONTROLLER_LABEL_CHOICES.some(choice => choice.id === value)) savePreference(CONTROLLER_LABELS_KEY, value);
}
export function controllerLabelFamily(id: string): PadFamily {
  const selected = readControllerLabels();
  return selected === 'auto' ? padFamily(id) : selected;
}
export const isSteamFamily = (family: PadFamily): boolean => family === 'steam' || family === 'steam-deck';
/** Standard Gamepad positions after Steam Input translation. Extra raw buttons have no assumed grip order. */
const STEAM_BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'View', 'Menu', 'L3', 'R3', 'D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right', 'Steam'];
export const steamButtonName = (button: number): string | undefined => STEAM_BUTTON_NAMES[button];
export const STEAM_CONTROLLER_HELP = 'Automatic uses the detected controller. Choose Steam Controller or Steam Deck if Steam Input reports an Xbox controller. Use a Gamepad layout in Steam Input and launch the browser through Steam. For stick aiming on a trackpad, assign it to Right Joystick; assign grips and gyro in Steam Input. Steam and Quick Access may open Steam itself: use the on-screen Home control or choose another Overlay button in Home settings. This choice changes button labels only.';
