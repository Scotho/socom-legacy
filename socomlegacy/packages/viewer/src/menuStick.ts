import { PAD_DEAD_ZONE, padRaw, type Input } from './gamepad';
import { ExchangeStick } from './weaponExchange';

/**
 * OT.R130 (the owner, Craig, 2026-11-14, seat redotcom-8f; MISSION OT.R130, the weekend plan's WM.R5 / WM-10): the left
 * stick moves the selection wherever the d-pad does -- here the round's START menu (`./startMenu`), the Circle pop-up
 * (chat, taunts, votes, mute: `./matchTaunts` over `./tauntMenu`) and the quick select (`./inventoryMenu`) -- with a
 * movement guard on the last two. A BROWSER ADAPTATION: the original's three read the d-pad only (the START menu:
 * research 340 R340.1; H228's "Keep D-pad only, as original" is what OT.R130 reverses).
 *
 * The guard (OT.R130 (2), the Circle pop-up and the quick select only): a player moving when he opens one keeps moving
 * on the stick, and the menu takes the d-pad alone until he has stood still for `MENU_STICK_STILL_SECONDS`; standing
 * still when he opens one, the stick is the menu's at once. Once the menu's, the stick stays the menu's until it closes.
 * An owner-ruled DEPARTURE from the original for the Circle pop-up: a capture of the original (r0004, n = 1; the bucket
 * gate-runner/shadow/out/2026-11-15/q10-hitreg/circle-popup-walk/) measured that with the Circle pop-up open the
 * ORIGINAL DOES NOT WALK (forward held 3 s moved 0.00 u, against 62.7 u in 1 s with it closed); the port stopped the
 * soldier there too until OT.R130. Confirmed by the rig's 3-of-3 read (r0004, 2026-11-15, bucket .../q25-hostage-mine/): with the
 * Circle pop-up open neither stick reaches the soldier. The original's quick select is NOT measured.
 *
 * "Moving" is the frame's move pair before the menus run (`Input.moveX` / `moveY`: the pad's left stick past its
 * browser dead zone, the touch stick merged in -- the pair the walk is fed from), not the soldier's speed
 * (`./walk` `speed()`), which lags the stick by the walk's deceleration and moves with what is no stick (a slide, a
 * fall): the guard decides whose the stick is, so it reads the stick.
 *
 * The stick's feel is borrowed, not invented: the stick is read as EXCHANGE-STICK reads it (`./weaponExchange`
 * `ExchangeStick`, the owner's ruling 2026-11-12): the pad's dead zone and rescale, then the front-end menus' push /
 * rest hysteresis (`@s2u/ui` `STICK_FIRE` 0.6 / `STICK_REARM` 0.2, research 116 §7) -- one step a flick, no held
 * repeat (research 340 R340.5), starting spent so a stick already pushed waits for the rest.
 *
 * Nothing is stored: no setting, no key; the whole adaptation is `MENU_STICK_ADAPTATION`.
 */

/**
 * MENU_STICK_ADAPTATION (OT.R130; a browser adaptation, not a stored setting): on, the stick moves the three menus'
 * selections and the guard runs. Off, today's behaviour exactly: the three read the d-pad only, and the soldier stops
 * while the Circle pop-up is open (`./exchangeInput`'s `noInput()`).
 */
export const MENU_STICK_ADAPTATION: boolean = true;

/** MENU_STICK_STILL_SECONDS (OT.R130, the owner's value: "until they come to a full stop for 100ms"): the guard's stand. */
export const MENU_STICK_STILL_SECONDS = 0.1;

/** A d-pad press the stick stands for. */
export type MenuStickPress = 'Up' | 'Down' | 'Left' | 'Right';

/** Whether the frame's move pair is pushed (the guard's "moving"). */
export function stickMoving(input: Input): boolean {
  return input.moveX !== 0 || input.moveY !== 0;
}

/** The move pair alone, for `Object.assign` onto an input a menu emptied (the guard's soldier keeps walking). */
export function stickMove(input: Input): Pick<Input, 'moveX' | 'moveY' | 'moveZone'> {
  return input.moveZone === undefined ? { moveX: input.moveX, moveY: input.moveY } : { moveX: input.moveX, moveY: input.moveY, moveZone: input.moveZone };
}

/**
 * The guard's walk handed on past a menu that emptied the input: the move pair (`stickMove`) and the look pair -- the
 * controller's ruling under OT.R130 (2026-11-15), the owner's to overturn: while the guard lets a player walk under the
 * Circle pop-up, right-stick look works as with no pop-up open (walking without turning is worse than either the
 * original's full stop or full control). A DEPARTURE: the original blocks both sticks while the pop-up is open (rig read,
 * r0004, 3 of 3: the look stick turned the view 0.00 degrees open vs -103.5 closed; 2026-11-15, bucket .../q25-hostage-mine/).
 * Standing still, the pop-up blocks the look stick as the original does. Axes only: no button passes.
 */
export function stickWalk(input: Input): Pick<Input, 'moveX' | 'moveY' | 'moveZone' | 'lookX' | 'lookY' | 'lookZone'> {
  const look = input.lookZone === undefined ? { lookX: input.lookX, lookY: input.lookY } : { lookX: input.lookX, lookY: input.lookY, lookZone: input.lookZone };
  return { ...stickMove(input), ...look };
}

/** The input with the move pair let go (the stick the menu's: the soldier takes none of it). */
export function withoutStick(input: Input): Input {
  return { ...input, moveX: 0, moveY: 0 };
}

/**
 * The stick's flicks off the frame's move pair: the shaped pair undone to the pad's own push (`./gamepad` `padRaw`, the
 * zone it was shaped with) and read as EXCHANGE-STICK reads the W3C axes (x right, y down). Read it every frame, the
 * menu open or not, so its arming follows the stick.
 */
export class MenuStickReader {
  private readonly stick = new ExchangeStick();

  read(input: Input): MenuStickPress | null {
    const [x, y] = padRaw(input.moveX, input.moveY, input.moveZone ?? PAD_DEAD_ZONE);
    return this.stick.read(x, -y);
  }
}

/**
 * The guard (OT.R130 (2)): whose the stick is while a menu is open. The stand is timed from the first still frame, so the
 * stick passes to the menu on the first frame at or past `MENU_STICK_STILL_SECONDS` after the first still frame: between
 * 100 ms + one frame and just under 100 ms + two frames after the last moving frame (at 60 Hz, last moving frame at T:
 * T + 116.7 ms) -- on the safe side of OT.R130's 100 ms. Its owner steps it every frame and `reset`s it on every close it makes outside that frame,
 * so a reopening is always a fresh open.
 */
export class MenuStickGuard {
  private open = false;
  private soldier = false;
  private stillSince: number | null = null;

  /**
   * One frame, after the menu's own step: `open` whether it is open now, `moving` this frame's stick, `now` seconds.
   * Whether the stick is the soldier's this frame (false closed).
   */
  frame(open: boolean, moving: boolean, now: number): boolean {
    if (!open) { this.reset(); return false; }
    if (!this.open) {
      this.open = true;
      this.soldier = moving;
      this.stillSince = null;
      return this.soldier;
    }
    if (!this.soldier) return false;
    if (moving) { this.stillSince = null; return true; }
    this.stillSince ??= now;
    if (now - this.stillSince >= MENU_STICK_STILL_SECONDS) this.soldier = false;
    return this.soldier;
  }

  /** The menu closed outside a `frame` (a reset, new data, another screen's close): the next open is a fresh one. */
  reset(): void { this.open = false; this.soldier = false; this.stillSince = null; }

  /** The stick the open menu's (as the last `frame` left it). */
  menuHas(): boolean { return this.open && !this.soldier; }

  /** The stick the soldier's under an open menu (as the last `frame` left it). */
  soldierHas(): boolean { return this.open && this.soldier; }
}
