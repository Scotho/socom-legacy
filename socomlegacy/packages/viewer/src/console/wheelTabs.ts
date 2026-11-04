import type { ConsoleState } from './state';

/**
 * LATER 335 (Craig's ask, 2026-10-22: "scroll wheel anywhere on the core launcher ui should go between tabs at a graceful
 * pace (slightly debounced tick i suppose unless there are better conventions) - except for when scrolling scrollable
 * regions that have overflowed content ..., and for areas like settings or any submenus like replays etc."): the wheel
 * on the console launcher's Home moves between its categories, one notch one tab. A browser adaptation with no original
 * (the original has no mouse; OT.R28): it changes nothing the game does, and every figure here is the page's own.
 *
 * Pure, so it is tested without a DOM: `console/input.ts` hands it each wheel event and enters a tab as an L1 / R1 press
 * (the forge seat 02's guidance), so the grammar's shoulders do the rest -- the wrap at the ends, the move cue, the
 * announcement (CX-20, CX.R12) -- with no second tab-switch path. Never a held repeat: a notch is one press.
 *
 * - **The accumulator** (`WheelTabs`): the larger axis's delta in pixels (lines and pages normalised, `wheelPixels`),
 *   down / right positive; at `WHEEL_NOTCH_PX_ADAPTATION` a tab, after which the rest of the gesture -- a fast spin, a
 *   trackpad's inertia -- is swallowed until it ends (no event for `WHEEL_GESTURE_IDLE_MS_ADAPTATION`), and no tab comes
 *   within `WHEEL_COOLDOWN_MS_ADAPTATION` of the last. A wheel with any modifier is never ours (Ctrl is the zoom).
 * - **The exclusions**: a gesture that begins over something that can still scroll that way (`scrollsToward`) or over a
 *   field (`isField`) is the page's for its whole length -- reaching the list's end mid-gesture does not switch a tab;
 *   and only Home's crossbar with nothing open over it takes the wheel (`wheelTabsOpen`): Settings, every pushed screen
 *   (the replays, the rooms, the profile ...), every dialog or layer (the replay viewer, the disc's popover, a field) never.
 */

/**
 * One notch's worth: half a Chromium notch (100 px, 3 lines of 33 px), so a mouse's notch in Chromium (100 px) and in
 * Firefox (3 lines, `WHEEL_LINE_PX_ADAPTATION` each: 120 px) is one tab at once, and a trackpad moves a tab per 50 px of
 * travel -- a short deliberate swipe, not a brush.
 */
export const WHEEL_NOTCH_PX_ADAPTATION = 50;
/** A line (`deltaMode` 1, Firefox's notch is 3) in pixels: Chromium's own line step (40 px). */
export const WHEEL_LINE_PX_ADAPTATION = 40;
/** A page (`deltaMode` 2) in pixels: about a launcher's height; any page is past a notch, so it is one tab. */
export const WHEEL_PAGE_PX_ADAPTATION = 800;
/**
 * No tab within this of the last (ms): the brief's 250-350 ms "graceful pace" -- about the shoulders' held repeat once it
 * starts (`./input` `REPEAT_DELAY` 400 ms) and three times its rate (`REPEAT_EVERY` 100 ms), so a wheel never races.
 */
export const WHEEL_COOLDOWN_MS_ADAPTATION = 300;
/**
 * A gesture ends after this long with no wheel event (ms): longer than the gap between a spin's notches (about 15-60 ms)
 * and an inertial scroll's frames (16 ms), shorter than a deliberate second notch.
 */
export const WHEEL_GESTURE_IDLE_MS_ADAPTATION = 150;

/** A wheel delta in pixels: `deltaMode` 0 pixels, 1 lines, 2 pages. */
export function wheelPixels(delta: number, mode: number): number {
  return mode === 1 ? delta * WHEEL_LINE_PX_ADAPTATION : mode === 2 ? delta * WHEEL_PAGE_PX_ADAPTATION : delta;
}

/** What `console/input.ts` does with a wheel event: a tab (an L1 / R1 press), swallow it (ours, nothing to do), or pass. */
export type WheelAnswer = 'next' | 'prev' | 'swallow' | 'pass';

/** One wheel event as the accumulator reads it. */
export interface WheelInput {
  dx: number;
  dy: number;
  /** `WheelEvent.deltaMode`. */
  mode: number;
  /** The event's time (ms). */
  t: number;
  /** Any of Ctrl, Meta, Alt, Shift held. */
  modified: boolean;
  /** Whether what is under the wheel takes it natively that way (`scrollsToward`, `isField`); asked at a gesture's start. */
  native(axis: 'x' | 'y', sign: 1 | -1): boolean;
}

/** The wheel's state across events: one per attached page. */
export class WheelTabs {
  private acc = 0;
  private last: number | null = null;
  /** Who has the gesture: nobody yet, the page (`native`), the tabs (counting), or the tabs with a tab moved (`spent`). */
  private owner: 'native' | 'tabs' | 'spent' | null = null;
  private switchedAt = Number.NEGATIVE_INFINITY;

  step(e: WheelInput): WheelAnswer {
    if (e.modified) return 'pass';
    if (this.last !== null && e.t - this.last > WHEEL_GESTURE_IDLE_MS_ADAPTATION) { this.owner = null; this.acc = 0; }
    this.last = e.t;
    const x = wheelPixels(e.dx, e.mode), y = wheelPixels(e.dy, e.mode);
    const axis = Math.abs(y) >= Math.abs(x) ? 'y' : 'x';
    const d = axis === 'y' ? y : x;
    if (d === 0) return this.owner === null || this.owner === 'native' ? 'pass' : 'swallow';
    if (this.owner === 'native') return 'pass';
    if (this.owner === null) {
      if (e.native(axis, d > 0 ? 1 : -1)) { this.owner = 'native'; return 'pass'; }
      this.owner = 'tabs';
    }
    if (this.owner === 'spent' || e.t - this.switchedAt < WHEEL_COOLDOWN_MS_ADAPTATION) return 'swallow';
    this.acc += d;
    if (Math.abs(this.acc) < WHEEL_NOTCH_PX_ADAPTATION) return 'swallow';
    const out: WheelAnswer = this.acc > 0 ? 'next' : 'prev';
    this.acc = 0;
    this.owner = 'spent';
    this.switchedAt = e.t;
    return out;
  }

  /**
   * The event `step` last read was handled by `t` (the events' own clock). The idle gap that ends a gesture runs from
   * here, not from when the event was made: a wheel event waits for the page's frame before it is delivered, and a spin's
   * further notches are made only once the page has handled the last (Playwright's wheel; a person's spin is coalesced
   * into the frame's one event), so on a page drawing slowly -- a frame every 350 ms -- their making times are a frame
   * apart, past the idle gap and the cooldown, and each moved a tab (the box's B193 e2e, wheelTabs.spec.ts:54 at
   * a8089b5ef: a six-notch spin walked Experiments to Profile). Counted from the handled time, a spin is one gesture on a
   * slow page as on a fast one; a notch made after a real pause is still the next.
   */
  handled(t: number): void {
    if (this.last !== null && t > this.last) this.last = t;
  }

  /** Forgets the gesture (the wheel left the launcher's tabs: a screen pushed, a dialog opened). */
  reset(): void {
    this.acc = 0;
    this.last = null;
    this.owner = null;
  }
}

/** What `scrollsToward` reads of an element (an `HTMLElement`'s shape). */
export interface ScrollBox {
  parentElement: ScrollBox | null;
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}

const SCROLLS = new Set(['auto', 'scroll', 'overlay']);

/**
 * Whether the wheel's target or a box above it can still scroll on `axis` toward `sign`: its overflow scrolls on that
 * axis, its content is taller (wider) than it by more than a pixel, and it is not at that end. `style` is the window's
 * `getComputedStyle` (a test's stand-in), asked only of an element (a box with its scroll fields).
 */
export function scrollsToward(
  target: ScrollBox | null, axis: 'x' | 'y', sign: 1 | -1, style: (el: ScrollBox) => { overflowX: string; overflowY: string },
): boolean {
  for (let el = target; el; el = el.parentElement) {
    // A target that is no element -- a wheel dispatched at the document -- has no scroll box and no computed style.
    if (typeof el.scrollHeight !== 'number') continue;
    const s = style(el);
    if (axis === 'y') {
      if (!SCROLLS.has(s.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
      if (sign > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    } else {
      if (!SCROLLS.has(s.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
      if (sign > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0) return true;
    }
  }
  return false;
}

/** The controls that keep their own wheel: a text field, a select, an editable region. */
export const FIELD_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Whether the wheel's target is (in) a field (`FIELD_SELECTOR`); a target with no `closest` (a text node) is not. */
export function isField(target: unknown): boolean {
  const t = target as { closest?: (sel: string) => unknown } | null;
  return !!t && typeof t.closest === 'function' && t.closest(FIELD_SELECTOR) !== null;
}

/**
 * Whether the launcher's tabs take the wheel now: the launcher's page (not the console over a game page), Home's
 * crossbar, no dialog or layer (`overlay`), the disc source dropdown shut, no binding listened for, the Report shut.
 * Read from the console's own state (`ConsoleState`, the controller's `capturing`), never the DOM.
 */
export function wheelTabsOpen(
  S: Pick<ConsoleState, 'mode' | 'screen' | 'overlay'> & { src: Pick<ConsoleState['src'], 'open'> },
  ctl: { capturing(): boolean; A: { report?: { isOpen(): boolean } } },
): boolean {
  return S.mode === 'page' && S.screen === 'home' && S.overlay === null && !S.src.open && !ctl.capturing() && !(ctl.A.report?.isOpen() ?? false);
}
