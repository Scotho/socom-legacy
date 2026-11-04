/**
 * Issue #307 (a browser adaptation, OT.R28; no original): a touch release that acts at once (`pointerup`) and takes its
 * target away -- or covers it -- is followed by the browser's compatibility click at the same spot, which then lands on
 * whatever is under that spot now. (A `preventDefault` on `pointerup` does not stop that click; only one on `pointerdown`
 * would, and that also stops the press's scroll and focus.) Calling `swallowNextClick` right after such a release takes
 * that one click at the capture phase of `target` (a window, or a frame's window) and stops it there; a click later than
 * `ms` is a click again, so a browser that sent none holds nothing over; and the next `pointerdown` at `target` disarms
 * it too (the review's F2): a new tap always begins with one, and the release's own compatibility click never has one, so
 * a browser that sent no click never costs the player's next tap.
 */

/** ms within which the release's compatibility click is taken: the browsers send it within a frame or two of the release. */
export const TOUCH_CLICK_SWALLOW_MS_ADAPTATION = 600;

export function swallowNextClick(target: EventTarget | null | undefined, ms = TOUCH_CLICK_SWALLOW_MS_ADAPTATION): void {
  if (!target) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const off = (): void => {
    target.removeEventListener('click', stop, true);
    target.removeEventListener('pointerdown', off, true);
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
  function stop(e: Event): void {
    e.preventDefault();
    e.stopImmediatePropagation();
    off();
  }
  target.addEventListener('click', stop, true);
  target.addEventListener('pointerdown', off, true);
  timer = setTimeout(off, ms);
}
