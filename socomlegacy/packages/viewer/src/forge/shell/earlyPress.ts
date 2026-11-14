/**
 * The early press (product track, a browser adaptation with no original -- the game has no editor): the Forge's shell is
 * on the page before its listeners are, while the page awaits its renderer (`../page` `mountForgePage`: WebGPU's start
 * is slow on a real GPU). A press on a toolbar button in that gap would land on a button with nothing listening and be
 * lost (shadow's GPU trace at 1da70bdac: the menu button tapped, the menu never opened). `holdEarlyPresses` holds each
 * such press, in order, and `release` presses them once the page has wired its listeners, so an early press works as a
 * later one does. Nothing changes after the release: the hold's listener is gone. `press` is the page's own press of a
 * button whose listener is not wired yet and that the hold cannot catch (FC2-6: the help card's "Forge menu (M)" presses
 * the forge menu's button, never on the page, EDITOR-MAP T1): held in the same order, pressed at the release.
 */

export interface EarlyPresses {
  /** The presses held, in their order (a test's read). */
  pending(): readonly HTMLButtonElement[];
  /**
   * Stop holding, and press each held button whose press can still be taken (not disabled, not inert; a caught press
   * also still on the page), in order. A second call does nothing.
   */
  release(): void;
  /**
   * The page's own press of `b` (FC2-6): while holding, held in order with the presses caught; after the release, pressed
   * at once. At the release it is pressed unless disabled or inert -- on the page or not (a button the page names, not a
   * press caught on the page).
   */
  press(b: HTMLButtonElement): void;
}

/**
 * Holds the presses on `root`'s buttons until `release`. `wired`: buttons whose own listener is already attached (their
 * press answered at once, never held, so never pressed twice). A button disabled or inert at its press is not held.
 */
export function holdEarlyPresses(root: HTMLElement, wired: Iterable<Element> = []): EarlyPresses {
  const skip = new Set<Element>(wired);
  /** The presses held, in order; `named`: the page's own press (`press`, FC2-6), pressed at the release on the page or not. */
  const held: { b: HTMLButtonElement; named: boolean }[] = [];
  let holding = true;
  const onClick = (e: Event): void => {
    const target = e.target as Element | null;
    const b = target && typeof target.closest === 'function' ? target.closest('button') : null;
    // Inert at its press (a control the page holds until wired): never held, so never pressed when the page lifts it.
    if (!b || !root.contains(b) || skip.has(b) || b.disabled || b.closest('[inert]')) return;
    held.push({ b, named: false });
  };
  root.addEventListener('click', onClick, true);
  return {
    pending: () => held.map((h) => h.b),
    press: (b) => {
      if (!holding) { b.click(); return; }
      held.push({ b, named: true });
    },
    release: () => {
      if (!holding) return;
      holding = false;
      root.removeEventListener('click', onClick, true);
      const presses = held.splice(0);
      for (const { b, named } of presses) if ((named || b.isConnected) && !b.disabled && !b.closest('[inert]')) b.click();
    },
  };
}
