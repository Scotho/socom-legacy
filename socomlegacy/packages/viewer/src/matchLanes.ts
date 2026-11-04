import { fireModeInputFor, type FireModeSetting } from './fireModeInput';
import { pressedSince, type Input } from './gamepad';
import type { MatchFirearm } from './matchFirearm';
import { playActions } from './play';
import { PRONE_POP_ADAPTATION, type StanceButton } from './stanceButton';
import type { WalkMode } from './walk';

/**
 * ONE-WIRE (web research 222): the pad's game lanes, written once for both pages' matches -- `/testroom`'s `padFrame`
 * (`./main`) and the front end's (`./matchMount`). The lanes are read off the merged input's edges in the player
 * update's order (`FUN_00594cf0`): the jump (D:L453208-453217), the Action (D:L453218-453243), the shoulders
 * (D:L453288-453312), the zoom (D:L453313-453323), the fire mode and the reload, then the stance (D:L453331-453430) --
 * the room's order too (`MoverSim.prepare`). What comes before them stays each page's: the pad read (`./setupPad`), the
 * hold's flush (R116.13, `./padFlush`), the trigger (`MatchFirearm.triggerLane`), `/testroom`'s screens (WEAPON EXCHANGE,
 * the ARMORY, the R2 inventory) that take the lanes as `menu`, and the buttons such a screen took, held past its close
 * or a round's reset (`/testroom`'s `./exchangeInput`, research 300 §3, a browser safeguard): owned before the trigger
 * and these lanes, so none is a press here -- not the Action's, so never a pickup's or a plant's -- until it is let go.
 */

/** What the lanes drive. */
export interface LaneParts {
  /** OT.R67, OT.R76: the stance mode and the pop window's seams (`../stanceButton` `StanceTarget`, `WalkMode.jumpPress`). */
  walk: Pick<WalkMode, 'mode' | 'isDead' | 'jump' | 'crouch' | 'stance' | 'stanceIntent' | 'setStance'>
    & Partial<Pick<WalkMode, 'stanceMode' | 'popStance' | 'pronePress' | 'disarmPop' | 'jumpPress'>>;
  firearm: Pick<MatchFirearm, 'stepZoom' | 'switchFireMode' | 'viewLanes'> & { fire: Pick<MatchFirearm['fire'], 'reload'> };
  /**
   * The stance button's tap (crouch) and hold (prone), one step a frame -- OT.R67: in the walk's stance mode
   * (`StanceButton.lanes`: the prone-pop by default, `PRONE_POP_ADAPTATION`).
   */
  stanceButton: Pick<StanceButton, 'lanes' | 'reset'>;
  /**
   * A shoulder pressed (the game's L1 SwapWeapon1, L2 SwapWeapon2, research 85 §9): the slot it holds taken up
   * (`ctrl+0x224` / `+0x228`, FUN_00594cf0 0x595728 / 0x5957d4) -- the primary and the sidearm until `/testroom`'s R2
   * inventory puts another there.
   */
  shoulder(which: 'l1' | 'l2'): void;
  /** Cross's edges and the d-pad's sides (`/testroom`'s: the action lifecycle, the traversal); absent, none. */
  action?(before: Input, after: Input, dt: number): void;
  /**
   * PAR-22: the saved fire-mode setting (`DAT_0044d500`, `./fireModeInput` `fireModeSetting`; research 254 s3) -- the
   * menu match's off the session's OPTIONS; absent (`/testroom`, no OPTIONS), DEFAULT, the global never stored.
   */
  fireModeSetting?(): FireModeSetting;
}

/**
 * One frame of the game's lanes, off the edges from `before` to `after`. `walking`: on foot in the game (the page's
 * Play on, `/testroom`); `menu`: a screen over the game holds the pad -- nothing reaches the game.
 */
export function playerLanes(l: LaneParts, before: Input, after: Input, dt: number, o: { walking: boolean; menu: boolean; runAndTalk?: boolean }): void {
  const { walk, firearm } = l;
  // Research 373 §2 (Phil's, PR #625; browser adaptations, no original): a cancelled frame -- the WebHID reader's stall
  // (`./pressurePad`), the overlay's synthetic neutral (`./modern/overlay` `untouched`) -- releases no stance press, in
  // either Stance mode: Triangle's press under way is spent until let go (`StanceButton.reset(true)`) and the pop's window
  // closes, as a menu frame closes it; SEPARATE's pressure reader drops its light or firm press off Prone's button
  // (`./controllerInput` `StancePress`); and the Crouch bind's release is not taken on it (below, the review's F1). The
  // other lanes are not guarded here.
  if (after.stanceCancelled) { l.stanceButton.reset(true); walk.disarmPop?.(); }
  const pressed = o.menu ? [] : pressedSince(before, after);
  // OT.R76: the Jump lane's fresh press -- the pop inside a stance hold's drop or dive (`WalkMode.jumpPress`), else the
  // native jump; a menu frame closes the pop's window, and so does a fresh stance press, before the jump (the review's 2:
  // a fresh Triangle and Square on one frame is no pop, as Benny's core clears the window at the frame's start).
  if (o.menu || (after.stance && !before.stance)) walk.disarmPop?.();
  if (!o.menu && o.walking && playActions(before, after).jump) { if (walk.jumpPress) walk.jumpPress(); else walk.jump(); }
  if (!o.menu) l.action?.(before, after, dt);
  if (o.walking) {
    if (pressed.includes('swap1')) l.shoulder('l1');
    if (pressed.includes('swap2') && o.runAndTalk !== true) l.shoulder('l2');
  }
  // Research 84: d-pad Up and Down step the zoom in and out, L3 the fire mode (walking, the rifle up).
  if (pressed.includes('zoom')) firearm.stepZoom('in');
  if (pressed.includes('zoomOut')) firearm.stepZoom('out');
  // PAR-22 (research 254): the fire mode as the saved setting reads its button -- DEFAULT (`FUN_00594b70`): the double tap
  // and the held repeat; ALTERNATE: the first press -- taken only when the update reaches it (walking, no menu).
  const fireModeSwitch = fireModeInputFor(l).step(after.fireMode, dt, { setting: l.fireModeSetting?.() ?? 'default', consumer: !o.menu && walk.mode() === 'walk' });
  if (fireModeSwitch) firearm.switchFireMode();
  // R3 the reload, as R is (the owner's ruling, 2026-09-29; the game's controller.rdr Default binds R3 to Reload).
  if (pressed.includes('reload') && walk.mode() === 'walk' && !walk.isDead()) firearm.fire.reload();
  if (o.menu) return;
  // W2.6: the crouch on the release (docs/PLAYTEST.md step 8; `playActions`), the stance button's tap and hold, the view.
  const walking = walk.mode() === 'walk';
  if (walking && !after.stanceCancelled && playActions(before, after).crouch) walk.crouch();   // F1: a cancelled frame is no let-go
  // Fed a released button off foot, so a press begun in the fly camera is not a tap when the walk begins. PAR-19: each
  // press toggles from the request (`stanceIntent`; FUN_00594cf0 reads actor+0x374). OT.R67: the walk's stance mode.
  // STM.R1 (the owner, 2026-10-30: "The original triangle button (prone) gets disabled for this mode"): in SEPARATE the
  // pad's reader takes Triangle's button from the game while the profile's Prone is bound (`./controllerInput` `poll`;
  // the review's F1 moved the gate there from here, where the profile is not known), so `after.stance` is taken as given.
  l.stanceButton.lanes(walk.stanceMode?.() ?? PRONE_POP_ADAPTATION, { triangle: walking && after.stance, prone: walking && after.prone }, dt, walk);
  firearm.viewLanes(walking);                         // the view from the head past third person, the scope's walk, the binoculars
}
