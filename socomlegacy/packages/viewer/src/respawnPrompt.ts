import { PAD_GLYPH } from '@s2u/scene';
import { controllerConfigs } from './controllerConfigs';
import { DEAD_PROMPT, HELP_BLANK, renderLine, type InputDevice } from './weaponSelect';

/**
 * RSP-6 (research 351 §1-2): the lower-centre Action line (`FUN_001f97b0`, D:L57008-57038; loaded r0004
 * 0x1f9b40-0x1f9c68). The pad's Action is Cross 166 or Goldeneye's Circle 183, from controller.rdr and fonts.rdr.
 * Keyboard/touch are browser adaptations: KeyX regardless of the controller preset; touch reads the active
 * config through its virtual pad. Key caps follow the existing prompt convention (`weaponSelect.renderLine`).
 */
export function respawnPrompt(device: InputDevice = 'pad'): string {
  const action = controllerConfigs.record().buttons.Action;
  const button = device === 'keyboard' ? '[X]' : device === 'touch' ? action
    : String.fromCharCode(action === 'Circle' ? PAD_GLYPH.CIRCLE : PAD_GLYPH.CROSS);
  return `Press the ${button} button to respawn.`;
}

/**
 * The respawn dead path's six widgets, rewritten each frame (`FUN_001f97b0` D:L56996-57046; research 351 §2).
 * The ready line's independent alpha belongs to the HUD; the remaining four are blank, with no teammate-cycle help.
 */
export function respawnHelpLines(device: InputDevice, ready: boolean): string[] {
  const inventory = controllerConfigs.record().buttons.Inventory === 'R1' ? 'R1' : 'R2';
  return [renderLine(DEAD_PROMPT[0], device, inventory).text, ready ? respawnPrompt(device) : HELP_BLANK,
    HELP_BLANK, HELP_BLANK, HELP_BLANK, HELP_BLANK];
}
