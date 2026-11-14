import type { ControllerMapping } from './controllerConfigs';
import type { PadButton, PadFlag } from './gamepad';
import { readPreference, savePreference, SETUP_KEY } from './startupSettings';

/** Browser adaptation requested 2026-11-09: COD-style positions for existing SOCOM actions.
 * Reference: Activision's Modern Warfare controls guide (2019-10), linked in the controller settings plan.
 * This is not a fifth disc config: sprint, melee, hold-to-ADS and quick grenades are not invented.
 */
export const COD_MODERN_NAME = 'CODModern';
/** The Controller layout row's index for it (`./controllerSettings` `CONTROLLER_LAYOUTS`) -- never a card value (V20.R4). */
export const COD_MODERN_VALUE = 5;
/** V20.R4 (the owner, 2026-11-11: "allowed as suggested"): labelled as not one of the original's layouts. */
export const COD_MODERN_LABEL = "COD Modern (not the original's)";

/**
 * V20.R4 (the owner, 2026-11-11, to "opt-in, labelled as not the original's, the choice kept in the page's own store":
 * "allowed as suggested, this is our ruling"): the choice of COD Modern is this browser's own preference, never the card's
 * `SelectedControllerConfig` -- which keeps the original layout last chosen, as the original's CONTROLLER PRESETS pages
 * and its `UIStoreOptions` (1-4, any other value Default) read it. Off unless chosen; choosing an original layout --
 * the launcher's or Home's Controller layout row, or the original's preset pages (`SetControllerConfig`) -- ends it.
 */
export const COD_MODERN_CHOSEN_KEY = `${SETUP_KEY}.controller.codModern`;
export function codModernChosen(): boolean { return readPreference(COD_MODERN_CHOSEN_KEY) === '1'; }
export function setCodModernChosen(on: boolean): void { savePreference(COD_MODERN_CHOSEN_KEY, on ? '1' : '0'); }
export const COD_MODERN_MAPPINGS: readonly ControllerMapping[] = [
  { control: 'LeftStickVert', result: 'MoveLong' }, { control: 'LeftStickHoriz', result: 'Strafe' },
  { control: 'RightStickVert', result: 'Pitch' }, { control: 'RightStickHoriz', result: 'Rotate' },
  { control: 'X', result: 'Jump' }, { control: 'Square', result: 'Action' }, { control: 'Square', result: 'Reload' },
  { control: 'R2', result: 'Fire' }, { control: 'Triangle', result: 'SwapWeapon1' },
  { control: 'L1', result: 'SwapWeapon2' }, { control: 'R1', result: 'Inventory' },
  { control: 'LeftStickTap', result: 'FireMode' }, { control: 'RightStickTap', result: 'TeamCommand' },
  { control: 'Select', result: 'TACMAP' },
];
export const COD_MODERN_FIXED: readonly (readonly [PadButton, PadFlag])[] = [
  ['Circle', 'stance'], ['L2', 'zoom'], ['Up', 'zoom'], ['Down', 'zoomOut'],
  ['Left', 'leanLeft'], ['Right', 'leanRight'], ['Start', 'mode'], ['Circle', 'boost'],
];
export const COD_MODERN_TALK = { teamCommand: 'R3', swapWeapon2: 'L1' } as const;
export const COD_MODERN_DESCRIPTION = 'A browser adaptation, not one of SOCOM II\'s layouts: COD-style buttons for SOCOM actions. RT/R2: fire. LT/L2 or D-pad Up: zoom in one step; Down: zoom out. A/Cross: jump. B/Circle: stance. X/Square: reload/use. Y/Triangle: primary assigned weapon. LB/L1: secondary assigned weapon. RB/R1: item menu. LS/L3: fire rate. RS/R3: team chat/talk. View/Share: scoreboard. D-pad Left/Right: lean. Left stick: move; right stick: look. SOCOM retains its zoom steps, assigned weapon slots and stance rules; no sprint or melee. Button mapping and Fire rate adjustments still apply.';
