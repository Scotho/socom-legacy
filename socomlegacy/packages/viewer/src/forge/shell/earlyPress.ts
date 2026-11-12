/**
 * The early press (product track, a browser adaptation with no original -- the game has no editor): the Forge's shell is
 * on the page before its listeners are, while the page awaits its renderer (`../page` `mountForgePage`: WebGPU's start
 * is slow on a real GPU). A press on a toolbar button in that gap would land on a button with nothing listening and be
 * lost (shadow's GPU trace at 1da70bdac: the menu button tapped, the menu never opened). `holdEarlyPresses` holds each
 * such press, in order, and `release` presses them once the page has wired its listeners, so an early press works as a
 * later one does. Nothing changes after the release: the hold's listener is gone.
 */

export interface EarlyPresses {
  /** The presses held, in their order (a test's read). */
  pending(): readonly HTMLButtonElement[];
  /**
   * Stop holding, and press each held button whose press can still be taken (on the page, not disabled, not inert),
   * in order. A second call does nothing.
   */
  release(): void;
}

/**
 * Holds the presses on `root`'s buttons until `release`. `wired`: buttons whose own listener is already attached (their
 * press answered at once, never held, so never pressed twice). A button disabled or inert at its press is not held.
 */
export function holdEarlyPresses(root: HTMLElement, wired: Iterable<Element> = []): EarlyPresses {
  const skip = new Set<Element>(wired);
  const held: HTMLButtonElement[] = [];
  let holding = true;
  const onClick = (e: Event): void => {
    const target = e.target as Element | null;
    const b = target && typeof target.closest === 'function' ? target.closest('button') : null;
    // Inert at its press (a control the page holds until wired): never held, so never pressed when the page lifts it.
    if (!b || !root.contains(b) || skip.has(b) || b.disabled || b.closest('[inert]')) return;
    held.push(b);
  };
  root.addEventListener('click', onClick, true);
  return {
    pending: () => [...held],
    release: () => {
      if (!holding) return;
      holding = false;
      root.removeEventListener('click', onClick, true);
      const presses = held.splice(0);
      for (const b of presses) if (b.isConnected && !b.disabled && !b.closest('[inert]')) b.click();
    },
  };
}
