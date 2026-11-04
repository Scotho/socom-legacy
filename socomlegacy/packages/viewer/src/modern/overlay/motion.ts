/**
 * The overlay's open and close (OVERLAY-CONSOLE; MISSION's OT.R60 (e), the owner, 2026-10-16: "a nice, highly polished
 * transition between the states inspired by the PS3 but adjusted to your best judgement"): every duration and easing in
 * one place, each a named **product-track constant** -- a browser adaptation with no original (OT.R28), the controller's
 * taste, logged for the owner; the frames and the frame rate through it are the seat's to measure.
 *
 * The shape (the merge controller's, in the OVERLAY-CONSOLE row): on the open the frame's blur and dim ramp in from 0
 * (`./overlay.css`'s custom properties) while the console's panels rise and fade in a short stagger -- the crossbar
 * (and the header) first, then the list, then the summary and the legend; on the close the reverse, a little faster,
 * the panels first and the blur out last, so the game is clear when its pad returns (`./index`). Under
 * `prefers-reduced-motion` an opacity fade only (no rise, no stagger) and a shorter ramp. The no-blur scrim keeps the
 * panels' motion and ramps its opacity. Since the seat's frames' F-C the frame's whole document body (the header, the
 * legend, a dialog open, the toast) fades with the close too, gone before the blur has ramped out, so nothing of the
 * console is left whole when the frame hides; on the open it is whole at once (the panels' stagger is the open's fade).
 * Only `opacity` and `transform` move on the panels and the body, and `backdrop-filter` and `background-color` on the
 * one frame: no layout. Driven by CSS transitions; their completion is a timer at these
 * constants, so a test drives it with fake timers.
 */

/** The open's blur and dim ramp, ms (eased out). */
export const OVERLAY_OPEN_MS_ADAPTATION = 220;
/** One panel's rise and fade in on the open, ms (each, from its stagger; eased out). */
export const OVERLAY_PANEL_IN_MS_ADAPTATION = 220;
/** The stagger between the panels (the crossbar, the list, the summary and the legend), ms. */
export const OVERLAY_STAGGER_MS_ADAPTATION = 25;
/** How far a panel rises into place, CSS px (from below). */
export const OVERLAY_RISE_PX_ADAPTATION = 12;
/** The close's whole length, ms: the panels out first, the blur and dim out last, ending with it. */
export const OVERLAY_CLOSE_MS_ADAPTATION = 170;
/** One panel's fade out on the close, ms (the summary first, the crossbar last, at the stagger; eased in). */
export const OVERLAY_PANEL_OUT_MS_ADAPTATION = 100;
/** On the close, when the blur and dim begin to ramp out, ms after the close began (the panels go first). */
export const OVERLAY_BLUR_OUT_DELAY_MS_ADAPTATION = 60;
/** Under `prefers-reduced-motion`: the open's and the close's length, ms (an opacity fade and the blur's ramp, no rise). */
export const OVERLAY_REDUCED_MS_ADAPTATION = 120;
/** The open's easing: decelerating into place (the panels and the blur's ramp in). */
export const OVERLAY_EASE_OUT_ADAPTATION = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** The close's easing: accelerating away. */
export const OVERLAY_EASE_IN_ADAPTATION = 'cubic-bezier(0.4, 0, 1, 1)';
/**
 * The open's cue in a running round (OT.R60 (e): "quick and light ... masking no round's cue"): `.METAL` at this share of
 * its 1.0. The close's `.BACK` plays as the menus play it: it is already the lighter of the two one-shots (Vol 83 against
 * `.METAL`'s 115, research 122 §3). Both are one-shots -- nothing held, nothing of the round's stopped or faded.
 */
export const OVERLAY_ROUND_CUE_VOLUME_ADAPTATION = 0.5;

/** The panels, in the open's order (`./overlay.css` gives each its `--mu-ovp-i`). */
export const OVERLAY_PANELS = ['crossbar', 'list', 'summary'] as const;

/** One ramp: its whole length (its completion, ms) and the custom properties written for it. */
export interface OverlayRamp { ms: number; vars: Record<string, string> }

/**
 * The ramp toward `to` from `from`, the share of the way already open (0 closed, 1 open; a reversal starts from where
 * the last ramp had come), reduced or not. Every length is the full ramp's in proportion to the way left, so a reversal
 * neither jumps nor lags. `ms` is when the last of it -- the blur, or the last panel -- has ended.
 */
export function overlayRamp(to: 'open' | 'closed', from: number, reduced: boolean): OverlayRamp {
  const left = Math.max(0, Math.min(1, to === 'open' ? 1 - from : from));
  const open = to === 'open';
  const scale = (n: number): number => Math.round(n * left);
  const ease = open ? OVERLAY_EASE_OUT_ADAPTATION : OVERLAY_EASE_IN_ADAPTATION;
  const lastPanel = OVERLAY_PANELS.length - 1;
  let blur: number, blurDelay: number, panel: number, stagger: number;
  if (reduced) {
    blur = scale(OVERLAY_REDUCED_MS_ADAPTATION); blurDelay = 0; panel = blur; stagger = 0;
  } else if (open) {
    blur = scale(OVERLAY_OPEN_MS_ADAPTATION); blurDelay = 0; panel = scale(OVERLAY_PANEL_IN_MS_ADAPTATION); stagger = scale(OVERLAY_STAGGER_MS_ADAPTATION);
  } else {
    blurDelay = scale(OVERLAY_BLUR_OUT_DELAY_MS_ADAPTATION); blur = scale(OVERLAY_CLOSE_MS_ADAPTATION) - blurDelay;
    panel = scale(OVERLAY_PANEL_OUT_MS_ADAPTATION); stagger = scale(OVERLAY_STAGGER_MS_ADAPTATION);
  }
  const ms = Math.max(blurDelay + blur, panel + lastPanel * stagger);
  return {
    ms,
    vars: {
      '--mu-overlay-ramp-ms': `${blur}ms`,
      '--mu-overlay-ramp-delay': `${blurDelay}ms`,
      '--mu-overlay-ease': ease,
      '--mu-ovp-ms': `${panel}ms`,
      '--mu-ovp-stagger': `${stagger}ms`,
      '--mu-ovp-ease': ease,
      '--mu-ovp-rise': reduced ? '0px' : `${OVERLAY_RISE_PX_ADAPTATION}px`,
      // F-C: the whole layer's fade -- on the close the panels' whole span (their last one's end), before the blur's; on
      // the open (a reversal mid-close: the body back from where it was) the open's ramp.
      '--mu-ovl-ms': `${reduced ? blur : open ? scale(OVERLAY_OPEN_MS_ADAPTATION) : panel + lastPanel * stagger}ms`,
      '--mu-ovl-ease': ease,
    },
  };
}
