import { STICK } from '../widgets/pad';

/**
 * The left stick in the menus (PLAT-11; web research 116 §7): edge-triggered with hysteresis. At the top of every
 * dispatch (`FUN_00368650` D:L263829-263849) the arming flag `DAT_003e0368` (1 in the ELF) is recomputed from the
 * **last** dispatch's values (`DAT_0049ea78` / `DAT_0049ea80`): set when both are within 0.6 if it was set, within 0.2
 * if it was clear; then the last values become the stick now. The direction (the inline copies at D:L263870-264089 and
 * D:L264124-264241, and `FUN_0036a060` D:L264743-264799): flag clear and both axes within 0.2 -> 5 (centred); flag set
 * and both within 0.6 -> 0; flag set and an axis past 0.6 -> by the signs (x positive left, y positive up): x < y and
 * x < -y RIGHT, x < y and x >= -y UP, x >= y and x < -y DOWN, x >= y and x >= -y LEFT; else 0.
 *
 * So a flick fires on the one dispatch where the stick has passed 0.6 from a centred last value, and fires again only
 * after the stick has come back within 0.2. The arming is not updated while the input is suspended (it runs only in the
 * dispatch, R116.9).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The threshold that fires a direction and keeps the flag set: the float literal 0.6 (D:L263833), the compiler's rounding. */
export const STICK_FIRE = Math.fround(0.6);
/** The threshold the stick must come back within to re-arm (the float literal 0.2, D:L263830). */
export const STICK_REARM = Math.fround(0.2);

export class MenuStick {
  /** `DAT_003e0368`: 1 in the ELF (research 116 §7). */
  armed = true;
  /** `DAT_0049ea78` / `DAT_0049ea80`: the stick at the last dispatch. */
  lastX = 0;
  lastY = 0;

  /** Step 0 of the dispatch: the flag from the last values, then the last values the stick now. */
  arm(x: number, y: number): void {
    const t = this.armed ? STICK_FIRE : STICK_REARM;
    this.armed = Math.abs(this.lastX) <= t && Math.abs(this.lastY) <= t;
    this.lastX = x;
    this.lastY = y;
  }

  /** `FUN_0036a060`'s answer on the stick now (`lastX`, `lastY` after `arm`): a `STICK` code. */
  direction(): number {
    const x = this.lastX, y = this.lastY;
    if (!this.armed) return Math.abs(x) <= STICK_REARM && Math.abs(y) <= STICK_REARM ? STICK.CENTRED : STICK.NONE;
    if (Math.abs(x) <= STICK_FIRE && Math.abs(y) <= STICK_FIRE) return STICK.NONE;
    if (x < y) return x < -y ? STICK.RIGHT : STICK.UP;
    return x < -y ? STICK.DOWN : STICK.LEFT;
  }
}
