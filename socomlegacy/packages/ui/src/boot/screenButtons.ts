import type { DialogBinding } from '../dialog';
import type { DialogEventStarter } from '../movie/movieCommands';
import { padByte, type WidgetPad } from '../widgets/pad';

/**
 * The screen's BUTTON bindings, step 4 of the menu's input dispatch `FUN_00368650` (D:L263865-264123; web research
 * 116 §3, R116.4, R116.16): the shell's binding records walked in order; a BUTTON record (kind byte +0x6f8 is 0) whose
 * STATE (+0x704) equals the pad's byte for its button code (`pad + 1 + code`, +0x705; D:L264106) fires -- its animation
 * found (`FUN_0026a250`) and started with its ARGUMENT (`FUN_00272bb0`) or without (`FUN_002734b0`) -- and the walk
 * returns: one binding per frame, and a match whose animation no set defines returns too (consumed, nothing started).
 *
 * This was the one step of the dispatcher the boot's cinematic needed before PLAT-11 joined it (`dlgSecondCinematic`'s thirteen keys ->
 * `goto_menu dlgMenu.rdr`, research 96 §3.2; research 121 §6: the background player has no skip of its own). The
 * steps before it -- the stick's arming (D:L263828-263848), the POPUP's claim (D:L263850-263855), the soft keyboard's,
 * the focused control's (D:L263857-263863) -- and after it -- the default navigation, the USB keyboard -- are
 * PLAT-11's, and the two cinematic dialogs have no control and no popup for them to act on
 * (`SCREEN_BUTTONS_STEP_READING`). Since the merge of 2026-10-03 the `Opener` runs PLAT-11's whole dispatcher
 * (`../input/dispatch.ts`, its step 4 included) first on every dialog, the cinematics too, and calls this on a test's
 * `tap` alone: a real key on `dlgSecondCinematic` reaches `goto_menu` through the dispatcher, once. The stick's flick as
 * a press (`bVar3`, `bVar4`, `bVar13` at D:L264106) is not modelled: no stick reaches the boot.
 */

/**
 * SCREEN_BUTTONS_STEP_READING: `fireScreenButtons` is step 4 alone, run in the shell's A1 slot (`FUN_003654c0`
 * D:L262264-262269: only while no switch is in flight and no `SuspendMenuInput` runs). On a dialog with no control and
 * no shown popup the three steps before it consume nothing (the stick apart), so step 4 sees every frame's pad as the
 * original's does. In the page PLAT-11's whole dispatcher runs first on every dialog (the `Opener`, 2026-10-03) and this
 * call fires on a test's `tap` alone. [reading]
 */
export const SCREEN_BUTTONS_STEP_READING = 'step 4 alone' as const;

/**
 * The first BUTTON binding whose state the pad holds for its button fires; true when one matched (the frame's input is
 * consumed, whether or not the animation was found).
 */
export function fireScreenButtons(bindings: readonly DialogBinding[], pad: WidgetPad, start: DialogEventStarter): boolean {
  for (const b of bindings) {
    if (b.kind !== 'button') continue;
    if (padByte(pad, b.code) !== b.state) continue;                                 // D:L264106
    if (b.animation !== null) start(b.animation, b.argument);                        // D:L264107-264116
    return true;                                                                     // D:L264108, D:L264113, D:L264116
  }
  return false;
}
