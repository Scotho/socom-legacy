/**
 * The page's ARMORY glue (web sprint 5 S3, repair 2), kept out of `main.ts` so it is tested: the two ways a round ends
 * on the page, and the touch layer's capture while the screen is open.
 *
 * - A round's start (`roundStart`) closes the screen, and drops a change still in the send's debounce: the room has
 *   spawned the seat and would refuse it (ARMORY_ROUND_START_RACE_READING, `./armorySend`).
 * - An abandon (`abandoned`) is no round's start: the room goes back to waiting, where a seat gets the ARMORY
 *   (ARMORY_SEAT_READING) and a change is taken (the room's loadout gates pass outside a round). So the screen stays as
 *   it is and a pending change is sent at once, not dropped (ARMORY_ABANDON_READING, research 95's ledger) -- nothing
 *   chosen is lost, and the held seat's own `ready` (the screen's close) makes its one spawn.
 */

export interface RoundHookDeps {
  /** The decal pools emptied (CMPExitState L76084 -> `FUN_0031c880` -> `FUN_003bf050` x2, L219059-219060). */
  clearDecals(): void;
  /**
   * What is in the air or set down -- the page's own and the others' copies -- gone: a round's start is a fresh level,
   * and an abandon leaves it (ROUND_START_PROJECTILES_READING, research 95 §8; the room's `clearAir`).
   */
  clearAir(): void;
  /** The ARMORY's live send (`./armorySend`). */
  send: { drop(): void; flush(): void };
  /** The ARMORY closed (its `closed` hook flushes and sends `ready`). */
  closeArmory(): void;
}

export function armoryRoundHooks(d: RoundHookDeps): { newRound(): void; abandoned(): void } {
  return {
    newRound: () => { d.clearDecals(); d.clearAir(); d.send.drop(); d.closeArmory(); },
    abandoned: () => { d.clearDecals(); d.clearAir(); d.send.flush(); },
  };
}

/**
 * A touch control's callback that does nothing while the ARMORY is open (the S3 review's input capture, repair 2): the
 * touch layer's RELOAD (`Fire.reload`) acts on the body behind the screen otherwise.
 */
export function unlessArmory<A extends unknown[]>(open: () => boolean, fn: (...args: A) => void): (...args: A) => void {
  return (...args: A) => { if (!open()) fn(...args); };
}

/**
 * The touch stance's events gated as a press: a `down` does nothing while the ARMORY is open, an `up` or a `cancel`
 * always goes through, so a hold the screen's opening cut short (the layer hidden, its pointer lost) is let go and
 * never turns into a prone behind the screen (`WalkMode.stanceTouch`).
 */
export function pressUnlessArmory<E extends string>(open: () => boolean, fn: (event: E | 'down') => void): (event: E | 'down') => void {
  return (event) => { if (event !== 'down' || !open()) fn(event); };
}

/**
 * The touch layer hidden while the ARMORY is open (`body.armory-open`, `styles.css`): its buttons lie over the screen's
 * panes and would take the taps meant for it (the canvas's `armory.tap`); the site's chrome goes with it (its top bar
 * lay over the title rows: research 95 §8, resolved 2026-10-01) and both come back on the close. On the frame it
 * opens, the sticks and every held button are let go (`release`), so nothing held carries through the screen. Returns
 * the state for the next call.
 */
export function syncArmoryTouch(body: { classList: { toggle(name: string, on: boolean): unknown } } | null, open: boolean, was: boolean, release: () => void): boolean {
  if (open === was) return was;
  body?.classList.toggle('armory-open', open);
  if (open) release();
  return open;
}

// The Inventory button's ARMORY (`inventoryOpensArmory`: I, R2 and the touch INV opening it in the round-end interval
// and the waiting room) is retired by the owner's ruling of 2026-10-02 (INT.R3): in a match nothing opens the ARMORY --
// dead, I, R2 and the touch INV open WEAPON EXCHANGE (research 94 §B2); alive, only the pad's R2 steps the swap's next
// item (the keyboard's I does nothing alive, the touch INV is hidden; research 94 §4.1) -- and the ARMORY, the lobby's
// (research 95 §4.1; ONL-16/17), opens only on taking a seat (ARMORY_SEAT_READING) until the lobby exists.
