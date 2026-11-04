/**
 * PAR-22 (web research 254; research 230 §4, reading, pending review): the fire-mode button as the original reads it --
 * the DEFAULT setting's double tap and held repeat, the ALTERNATE setting's first press -- for the game's lanes
 * (`./matchLanes`; the lane's call is the wave-4 integrator's, PAR.R3, research 254 §4).
 *
 * - **The sampled button** (`SampledButton`, `FUN_002d9ff0` D:L179137-179169): each pad poll moves a button's state --
 *   0 at rest, 1 its first frame down, 2 held on, 3 its first frame up -- the pad polled before the simulation
 *   (`FUN_002da930` sets the frame's time `DAT_0044f240` at D:L179512, then samples every button, D:L179820ff).
 * - **The tap marker** (D:L179172-179184, a float at the button's `+0x74`): a first press sets it to .25 s
 *   (`FIRE_MODE_DOUBLE_TAP_S_READING`) or, while it is still live (> 0), to -2: the double tap. Every other poll takes
 *   the frame's time off a live marker, and one taken below zero is -1. `FUN_002da1c0` (D:L179222-179227) answers
 *   whether it is -2 and, if so, takes it (-3, the reset value `FUN_002da160` also writes, D:L179195).
 * - **DEFAULT** (`FUN_00594b70` D:L452972-452993, run by the player update when `DAT_0044d500` is 0, D:L453465-453466):
 *   the double tap taken switches; else the held time (`+0x240`) grows by the frame's time while the button reads 2
 *   and is zeroed when it does not, and past .4 s (`FIRE_MODE_HOLD_REPEAT_S_READING`) is zeroed and switches. So a short
 *   tap switches nothing, a double tap once, a hold every .4 s.
 * - **ALTERNATE** (`DAT_0044d500` 1, D:L453468-453472): the switch at the button's first frame down, as the port's lane
 *   always switched; the setting also swaps FireMode's and TACMAP's buttons (`FUN_00592050` D:L451464-451467), which the
 *   menu match applies to the pad before the lanes (`./matchMount` `applyOptions`), so the button here is FireMode's.
 * - **What consumes the tap.** The take and the held time belong to the consumer: when the player update does not run
 *   it (its gate shut -- in the port, off the walk or a menu over the game), nothing is taken and the held time is kept
 *   as it was; the marker still ages with every poll. Once the consumer has taken a double tap or a hold, the switch is
 *   the weapon's (`FUN_005c4600` D:L478570-478577: no firearm, a ratio past 1.01; `./matchFirearm` `switchFireMode`'s
 *   own refusals) -- a switch it refuses has still consumed the tap and zeroed the held time.
 * - **The flush** (`flush`, `FUN_002dba60` D:L179891-179936, research 116 R116.13): at a game state's start the button's
 *   state is read afresh off the pad and its tap marker cleared, so a button held through the change is held, not
 *   pressed, and no double tap spans it.
 *
 * The floats are the original's single precision (`Math.fround`), so the comparisons fall where the console's do.
 */

/**
 * The double tap's window, seconds: the marker a first press sets (`FUN_002d9ff0` D:L179177, the literal 0x3e800000).
 * [reading]
 */
export const FIRE_MODE_DOUBLE_TAP_S_READING = 0.25;

/**
 * The held repeat, seconds: `FUN_00594b70`'s bound on the held time (D:L452983, `DAT_00650670`; the ELF's word at
 * 0x650670 is 0x3ecccccd, .4000000059604645). [reading]
 */
export const FIRE_MODE_HOLD_REPEAT_S_READING = 0.4000000059604645;

/** The marker's values that are no window (`FUN_002d9ff0` D:L179174, D:L179183; `FUN_002da1c0` D:L179225). */
const MARKER_DOUBLE_TAP = -2, MARKER_SPENT = -1, MARKER_TAKEN = -3;

/** A sampled button's state (`FUN_002d9ff0`): 0 at rest, 1 first down, 2 held on, 3 first up. */
export type ButtonState = 0 | 1 | 2 | 3;

/** The saved setting (`DAT_0044d500`): 'default' at 0, 'alternate' at 1. */
export type FireModeSetting = 'default' | 'alternate';

/**
 * The setting off the options the match applies (`./originalOptions` `playOptionsOf`): `StoreOptions` sets `DAT_0044d500`
 * from `FIREMODESWAP_CONTROLLER` (D:L125173-125183) and OPTIONS' row toggles it (D:L61823-61843); never stored, it is the
 * global's zero (it lies in the ELF's uninitialised data) -- DEFAULT. Absent options are that default.
 */
export function fireModeSetting(options: { fireModeSwap: boolean } | null | undefined): FireModeSetting {
  return options?.fireModeSwap ? 'alternate' : 'default';
}

/** One button as the pad poll samples it (`FUN_002d9ff0`): its state and its tap marker. */
export class SampledButton {
  state: ButtonState = 0;
  /** The tap marker, seconds while live (> 0); `MARKER_TAKEN` at the start, as `FUN_002da160` resets it. */
  marker = MARKER_TAKEN;

  /** One poll: the button `down` or not, `dt` the frame's seconds (`DAT_0044f240`). */
  sample(down: boolean, dt: number): void {
    const s = this.state;
    this.state = down ? (s === 0 || s === 3 ? 1 : 2) : (s === 1 || s === 2 ? 3 : 0);
    if (this.state === 1) {
      this.marker = this.marker > 0 ? MARKER_DOUBLE_TAP : FIRE_MODE_DOUBLE_TAP_S_READING;
    } else if (this.marker > 0) {
      this.marker = Math.fround(this.marker - Math.fround(dt));
      if (this.marker < 0) this.marker = MARKER_SPENT;
    }
  }

  /** `FUN_002dba60`'s part for one button: the state zeroed, the pad read once, the marker -3 (no tap pending). */
  flush(down: boolean): void {
    this.state = 0;
    this.sample(down, 0);
    this.marker = MARKER_TAKEN;
  }

  /** `FUN_002da1c0`: the double tap, taken once. */
  takeDoubleTap(): boolean {
    if (this.marker !== MARKER_DOUBLE_TAP) return false;
    this.marker = MARKER_TAKEN;
    return true;
  }
}

/** The fire-mode button and DEFAULT's held time: one a player's lanes. */
export class FireModeInput {
  readonly button = new SampledButton();
  /** `FUN_00594b70`'s held time (`+0x240`), seconds. */
  private heldFor = 0;

  /**
   * The flush at a game state's start (`FUN_002dba60` D:L179891-179936, research 116 R116.13): the page flushes its
   * game lanes' read to the pad as it is (`./padFlush`), and here the button with it -- every state zeroed
   * (D:L179911), the pad read once (D:L179921: a button down is a first press, 1, so the next frame reads it held, 2,
   * never a fresh press) and every tap marker set to -3 (D:L179923-179934). The held time is the player controller's
   * (`+0x240`), which the flush does not touch.
   */
  flush(down: boolean): void {
    this.button.flush(down);
  }

  /**
   * One frame: the button sampled, then -- when `consumer` (the player update reaches the fire mode this frame) -- the
   * setting's reading of it. True when the fire mode is to be switched (the weapon may still refuse).
   */
  step(down: boolean, dt: number, o: { setting: FireModeSetting; consumer: boolean }): boolean {
    this.button.sample(down, dt);
    if (!o.consumer) return false;
    if (o.setting === 'alternate') return this.button.state === 1;
    if (this.button.takeDoubleTap()) return true;
    this.heldFor = this.button.state === 2 ? Math.fround(this.heldFor + Math.fround(dt)) : 0;
    if (this.heldFor > FIRE_MODE_HOLD_REPEAT_S_READING) {
      this.heldFor = 0;
      return true;
    }
    return false;
  }
}

const perLanes = new WeakMap<object, FireModeInput>();

/** The fire-mode input of one set of lanes (a page's `LaneParts`), made at its first frame. */
export function fireModeInputFor(owner: object): FireModeInput {
  let f = perLanes.get(owner);
  if (!f) perLanes.set(owner, f = new FireModeInput());
  return f;
}
