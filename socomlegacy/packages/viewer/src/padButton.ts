/**
 * LATER 1147, the press parity (research 443; reading, reviewed for the pad layer -- `reviews/T4-port-holds-review.md`
 * P3 -- and MEASURED online for the 9mm Sub, `bugs/padlag-rows-read.md`, reviewed): the fire button as the PS2 reads it.
 *
 * **The pad layer.** The console steps each button once per update (`FUN_002d9ff0` D:L179137-179168) with its physical
 * state: down 0 -> 1, 3 -> 1, 1 -> 2, 2 stays; up 1 -> 3, 2 -> 3, 3 -> 0. The fire button's query is "held", state 2 only
 * (`FUN_002c60c0` D:L166671-166686), which the human controller's update (`FUN_00594cf0` D:L453542-453567) puts in
 * ctrl+0x118. So a press is seen on the update after the one that first reads it: a round never leaves on a state-1 read
 * (31 of 31 rows, measured). The AI does not come this way: `FUN_00597810` steps the same ctrl+0x118 table from the AI's own
 * true / false, 0 -> 2 on its first call, with no pad layer (D:L428041, D:L454390-454420). This module is the human page's
 * trigger only, and the ordinary branch only (D:L453541-453566); the pressure branch (D:L453478-453540) is not modelled.
 *
 * **The kit** (`FUN_005c0fd0`, once per update after the controller, `FUN_005506a0` D:L417905-417907): the gate first --
 * a round when the trigger reads held, the timer is spent and the pull's count is under the mode's limit
 * (`FUN_005c0ae0` D:L476354-476448; `FUN_005c0940` D:L476283-476310); a round sets the timer to the wait (`FUN_005c09f0`
 * D:L476313-476341) -- then the timer run down by the update's own dt and clamped at 0 (D:L476643-476647). A trigger
 * whose ctrl+0x118 reads 0 or 3 clears the count (D:L476380-476382, D:L476399-476400); the table steps ctrl+0x118 from
 * the held answer alone (`FUN_00594cf0` D:L453543-453565: held 0 -> 2, 1 -> 1, 2 -> 1, 3 -> 2; not held 0 -> 0, 1 -> 3,
 * 2 -> 3, 3 -> 0), so it reads 0 or 3 exactly when the pad is not held -- every pad state but 2, a pad-1 read included
 * (the review F1, `press-parity-wiring-review-7b2c5eca7`). NOT the gate's whole condition, and not modelled
 * here: the readiness weight with kit+1 bit 0x4 (D:L476419-476428), `FUN_005a7de0` (D:L476442), the magazine and the
 * weapon-type list (D:L476449-476468), the end checks (D:L476470-476505), and the gate's run only when kit+0x820 is 0 and
 * `FUN_005c1970` answers (D:L476549-476566) -- the caller (`Fire`) keeps its own counterparts. Measured: the timer at a round is the wait less
 * that update's dt (0.0600 - 0.0334 = 0.02663), and the next round waits for the timer, not for a count of updates.
 */

/** The pad layer's state for one button: 0 up, 1 pressed this read, 2 held, 3 released this read. */
export type PadState = 0 | 1 | 2 | 3;

/** `FUN_002d9ff0`: one update's step of a button's state from its physical state. */
export function padStep(s: PadState, down: boolean): PadState {
  if (down) return s === 1 || s === 2 ? 2 : 1;
  return s === 1 || s === 2 ? 3 : 0;
}

/** `FUN_002c60c0`: the "held" query the fire button is read through -- state 2 only. */
export function padHeld(s: PadState): boolean {
  return s === 2;
}

/** The kit's trigger gate and timer, stepped once per update with that update's dt and the fire button's pad state. */
export class KitTrigger {
  private wait_: number;
  private limit: number;
  private left = 0;
  private count = 0;

  /** `wait`: the mode's wait (`FUN_005c09f0`); `limit`: the mode's rounds a pull (`FUN_005c0940`: 1, 3 or 10000; 0 in mode 0). */
  constructor(wait: number, limit: number) {
    this.wait_ = wait;
    this.limit = limit;
  }

  /** One update: the gate, then the run-down. True when a round leaves on this update. */
  step(dt: number, state: PadState): boolean {
    if (!padHeld(state)) this.count = 0;                       // ctrl+0x118 at 0 or 3 (D:L453543-453565, D:L476380-476382)
    let fired = false;
    if (padHeld(state) && this.left <= 0 && this.count < this.limit) {
      fired = true;
      this.count++;
      this.left = this.wait_;
    }
    this.left = Math.max(0, this.left - dt);
    return fired;
  }

  /** The timer after the last update's run-down (seconds). */
  timer(): number {
    return this.left;
  }

  /** The mode's wait or limit changed (a mode change; the timer carries over, as `kit+0x8b8` does). */
  setMode(wait: number, limit: number): void {
    this.wait_ = wait;
    this.limit = limit;
  }
}
