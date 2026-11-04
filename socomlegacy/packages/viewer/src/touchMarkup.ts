/** Shared browser-adaptation pad artwork for menus and matches. */
import { GLYPH } from './console/icons';
import { PAD_BUTTON } from './gamepad';
import './mobileControls.css';

/** A face button: an outlined circle wearing the PlayStation symbol in its colour (the system's glyph class, icons.ts's path). */
const face = (id: string, index: number, glyph: keyof typeof GLYPH, label: string): string =>
  `<button id="${id}" class="s2u-fab" type="button" data-pad="${index}" aria-label="${label}"><svg class="s2u-hint__glyph s2u-hint__glyph--${glyph}" viewBox="0 0 26 26" aria-hidden="true">${GLYPH[glyph]}</svg></button>`;
/** A D-pad direction: an outlined arrow, the cross's arm. */
const arrow = (id: string, index: number, path: string, label: string): string =>
  `<button id="${id}" class="s2u-fab" type="button" data-pad="${index}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></button>`;
/** A named button: a shoulder, SELECT, START (the pills) or a stick's click (round), wearing the pad button's own name. */
const named = (id: string, cls: 's2u-tab' | 's2u-fab', index: number, name: string, label: string): string =>
  `<button id="${id}" class="${cls}" type="button" data-pad="${index}" aria-label="${name}: ${label}">${name}</button>`;
/** The reference's SELECT rectangle and START triangle; their actions and accessible names stay the same. */
const menuSymbol = (id: string, index: number, name: string, label: string, path: string): string =>
  `<button id="${id}" class="s2u-tab" type="button" data-pad="${index}" aria-label="${name}: ${label}"><svg viewBox="0 0 32 24" aria-hidden="true"><path d="${path}"/></svg></button>`;

/**
 * `index.html`'s `#touch` and `#mobile-tip`, its comments left out: the layer a page with none in its markup is built
 * from (the menu match). The same elements, ids and classes as `/testroom`'s, so `styles.css` places and shows both
 * alike (`.touch`, `.pad-on`, `.is-walking` on the root); `test/matchTouch.test.ts` holds the two to each other.
 */
export const TOUCH_LAYER_MARKUP = `<div id="touch">
  <div id="stick-zone"><div id="stick-rest" class="touch-stick-rest" aria-hidden="true"><i></i></div></div>
  <div id="stick-base" hidden><div id="stick-knob"></div></div>
  <div id="aim-zone" data-play><div id="aim-rest" class="touch-stick-rest" aria-hidden="true"><i></i></div></div>
  <div id="aim-base" data-play hidden><div id="aim-knob"></div></div>
  <div id="touch-lift">
    <button id="touch-up" class="s2u-fab" type="button" aria-label="up">&#9650;</button>
    <button id="touch-down" class="s2u-fab" type="button" aria-label="down">&#9660;</button>
  </div>
  <button id="touch-stance" class="s2u-fab" type="button" data-play aria-label="stance: tap stands or crouches, hold goes prone" title="Tap: stand / crouch. Hold: prone.">C<span aria-hidden="true">hold: prone</span></button>
  <button id="touch-fire" class="s2u-fab" type="button" data-play aria-label="fire">&#9673;</button>
  <div id="touch-walk" data-play>
    ${named('tw-l1', 's2u-tab', PAD_BUTTON.L1, 'L1', 'weapon swap 1, the rifle')}
    ${named('tw-l2', 's2u-tab', PAD_BUTTON.L2, 'L2', 'weapon swap 2, the sidearm')}
    ${named('tw-r1', 's2u-tab', PAD_BUTTON.R1, 'R1', 'fire')}
    ${named('tw-r2', 's2u-tab', PAD_BUTTON.R2, 'R2', 'item menu')}
    <div id="tw-dpad">
      ${arrow('tw-up', PAD_BUTTON.Up, 'M6 21V10l6-6 6 6v11z', 'D-pad up: zoom in')}
      ${arrow('tw-left', PAD_BUTTON.Left, 'M21 6H10l-6 6 6 6h11z', 'D-pad left: peek left, held')}
      ${arrow('tw-right', PAD_BUTTON.Right, 'M3 6h11l6 6-6 6H3z', 'D-pad right: peek right, held')}
      ${arrow('tw-down', PAD_BUTTON.Down, 'M6 3v11l6 6 6-6V3z', 'D-pad down: zoom out')}
    </div>
    <div id="tw-face">
      ${face('tw-triangle', PAD_BUTTON.Triangle, 'triangle', 'Triangle: stance, tap crouches, hold goes prone')}
      ${face('tw-square', PAD_BUTTON.Square, 'square', 'Square: jump')}
      ${face('tw-circle', PAD_BUTTON.Circle, 'circle', 'Circle: nothing on foot')}
      ${face('tw-cross', PAD_BUTTON.Cross, 'cross', 'Cross: action, doors, climb, ladders')}
    </div>
    <div id="tw-mid">
      ${named('tw-l3', 's2u-fab', PAD_BUTTON.L3, 'L3', 'fire mode')}
    ${menuSymbol('tw-select', PAD_BUTTON.Select, 'SELECT', 'scoreboard, held', 'M4 5h24v14H4z')}
    ${menuSymbol('tw-start', PAD_BUTTON.Start, 'START', 'the START menu', 'M7 4l20 8-20 8z')}
      ${named('tw-r3', 's2u-fab', PAD_BUTTON.R3, 'R3', 'reload')}
    </div>
    <button id="tw-weapons" class="s2u-tab" type="button" hidden aria-label="select new weapons">INV</button>
  </div>
  <p id="rotate-hint" class="s2u-status s2u-status--pill" data-play aria-live="off">Turn your phone sideways to play</p>
</div>
<div id="mobile-tip" class="s2u-notice" role="status" aria-live="polite" hidden>
  <p id="mobile-tip-text"></p>
  <button id="mobile-tip-close" type="button" class="s2u-iconbtn" aria-label="dismiss" title="dismiss"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
</div>`;

