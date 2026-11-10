import { CROUCH_BIND, EXTRA_COMBO_LISTEN, EXTRA_DOUBLE_LISTEN, PRONE_BIND, TEACH_IDLE_MS_ADAPTATION, type ExtraRow, type PadBinding } from '../../padBinding';
import type { ExtraAction } from '../../padExtras';
import { TEACH_STEPS } from '../../padLayout';
import { STANCE_MODE_ABOUT, STANCE_MODE_WORDS, controllerStanceMode, defaultController } from '../../startupSettings';
import { GLYPH, P, btn, dpad, esc, ico, shoulder, type FaceButton } from '../icons';
import { REMAP_ACTION_ROW, REMAP_CROUCH_ROW, REMAP_DEAD_ROW, REMAP_PRONE_ROW, REMAP_STANCE_ROW, remapActionOfRow, remapExtraAt, remapExtras, remapOwnRows, type Adapters, type ConsoleState, type RemapExtra } from '../state';
import { screenHead } from './head';
import { PAD_ART } from './padArt';

/**
 * SS-1's D2 and REVIEW-1's F3 (a browser adaptation, product track): the browser's dead zone -- this browser's pad
 * calibration before the game's own curve -- by one name on Options > Controller and on Button mapping, apart from the
 * card's Dead zone (CONTROLLER OPTIONS' DEAD ZONE, "In the game"). The controller's taste call, 2026-11-07.
 */
export const PAD_DEAD_ZONE_LABEL = 'Pad dead zone (this browser)';

/**
 * The button mapping screen (CX-14 of the console launcher plan; CX.R13, OT.R60: the overlay is this console, and its
 * mapping view is the console's own): a pushed screen, as Browse rooms and the replays list are, opened from Settings >
 * Controller's Button mapping row. It draws `../../padBinding` `PadBinding` -- the machine lifted out of the setup page's
 * Controller view (retired with CX-26) -- in the console's own parts only: the ScreenHead (with the pad's line,
 * the Readout's check), an ActionList item per logical button with its bound button's glyph on the right (`../icons`
 * `btn` for the face buttons, the shoulder key for L1 / R1 / L2 / R2, the d-pad's glyph, the button's name otherwise),
 * the OptionRows' rollers for the Stance mode and the stick dead zone (the first two rows: STANCE-TOP, DEAD-UP), the
 * Crouch and Prone binds' rows in SEPARATE (STM.R1), and the aside. A listened row says what it
 * waits for and the seconds left; the conflict's question and Restore defaults are the console's Confirm (`./overlay`);
 * the legend's prompts are `./legend`'s. The rows sit in their own scroll container (`data-scroll`, CX-11).
 *
 * LATER 380 (the owner's word, 2026-10-23: "more visual and cohesive ... the ps4 controller the socom2legacy-teaser had
 * and hold button style remapping with as many button icons reused as possile and a clean and pleasing ui"): the screen
 * is drawn round the controller (`./padArt`, one swappable drawing, H313). The focused row's button glows on it, the
 * buttons held light up on it and on the rows they drive, a button clicked on it focuses its row; a binding is a hold
 * (`../../padLayout` `HOLD_TO_BIND_MS_ADAPTATION`), its ring filling round the button held. A pad of another layout is taught on
 * the same screen ("teach me your pad", `teachHtml`): the step's button or stick glows on the drawing with the hold's
 * ring. A browser adaptation with no original (OT.R28): nothing of the game's behaviour.
 */

/** The rows round the sixteen actions (`../state`'s, by mode: STM.R1; the Stance mode first, STANCE-TOP, the dead zone under it, DEAD-UP). */
export { REMAP_ACTION_ROW, REMAP_CROUCH_ROW, REMAP_DEAD_ROW, REMAP_PRONE_ROW, REMAP_STANCE_ROW, remapActionOfRow, remapOwnRows } from '../state';
/** The bind rows and what each listens for (PP-5), shown in SEPARATE only (STM.R1). */
const BIND_ROWS: readonly (readonly [row: number, bind: number])[] = [[REMAP_CROUCH_ROW, CROUCH_BIND], [REMAP_PRONE_ROW, PRONE_BIND]];
/**
 * The bind `row` listens for in `mode` (the saved one by default): Crouch's or Prone's in SEPARATE, none in COMBINED,
 * where those rows are not drawn and the row numbers past the last action are the extras' (STM.R1; was the fixed
 * `REMAP_BIND_OF_ROW`).
 */
export function remapBindOfRow(row: number, mode = controllerStanceMode()): number | undefined {
  return mode === 'separate' ? BIND_ROWS.find(([r]) => r === row)?.[1] : undefined;
}

/**
 * OBF-10b's review (1; players use a controller only): the rows after the screen's own, each an action a pad reaches
 * with the d-pad and Cross (and a click): Teach again, for a pad of another layout read through a layout (taught, or
 * built in -- a wrong built-in entry is undone by it). A browser adaptation (OT.R28).
 */
export { remapExtraAt, remapExtras, remapRowCount, type RemapExtra } from '../state';
/** OBF-13: Finish's confirmation, on the toast once the screen has closed. */
export const REMAP_FINISH_TOAST = 'Button mapping saved.';
type FixedExtra = 'teach' | 'pressureConnect' | 'finish';
const EXTRA_WORDS: Readonly<Record<FixedExtra, { title: string; sub: string; about: string; note: string }>> = {
  pressureConnect: { title: 'Connect USB pressure controller', sub: 'PlayStation USB through WebHID', about: 'Connect a supported PlayStation USB interface to read real button pressure. Choose the device in the browser, then press Triangle lightly a few times: once its pressure is seen, SEPARATE puts Crouch (light) and Prone (firm) on Triangle. Adapters with other report formats need a verified reader.', note: 'USB interface 054c:0268, Chromium browsers. Connection lasts for this page; reconnect after reload.' },
  finish: { title: 'Finish', sub: 'Done: every change is already saved', about: 'Close the button mapping and go back. Each binding was saved as you made it.', note: 'Saved to this browser, for this controller.' },
  teach: { title: 'Teach again', sub: 'Learn this controller’s buttons again', about: 'This controller uses another layout. Teach it again if a button does the wrong thing: hold each button the screen asks for until its ring fills.', note: 'Saved to this browser, for this controller.' },
};

/**
 * h59U9CLb (a browser adaptation, off by default): the extra binds' words -- each action an extra can add (`../../padExtras`
 * `PAD_EXTRA_ACTIONS`, in its order), the one-line warning a same-thumb combo carries (Q3: allowed), and each row's.
 */
export const EXTRA_ACTION_WORDS: Readonly<Record<ExtraAction, string>> = {
  jump: 'Jump', fire: 'Fire', fireMode: 'Fire mode', reload: 'Reload', swap1: 'Weapon swap 1', swap2: 'Weapon swap 2',
  inventory: 'Item menu', scoreboard: 'Scoreboard', stance: 'Stance (a press)', crouch: 'Crouch', prone: 'Prone',
};
export const REMAP_SAME_THUMB_WARNING = 'One thumb presses both: allowed, but hard to reach.';
const EXTRAS_NOTE = 'Browser adaptation. Saved to this browser, for this controller.';
/** An extra's name on its row: "Square adds Fire", "L1 + Square: Reload". */
export function extraName(b: PadBinding, x: ExtraRow): string {
  const words = EXTRA_ACTION_WORDS[x.action];
  return x.kind === 'double' ? `${b.label(x.button)} adds ${words}` : `${b.label(x.modifier)} + ${b.label(x.button)}: ${words}`;
}
/** The toast once an extra is added. */
export function extraAddedWords(b: PadBinding, x: ExtraRow): string {
  const words = EXTRA_ACTION_WORDS[x.action];
  return x.kind === 'double' ? `${b.label(x.button)} now also does ${words}.` : `${b.label(x.modifier)} + ${b.label(x.button)} now also does ${words}.`;
}
const extraIndex = (k: RemapExtra): number => (k.startsWith('bind:') ? Number(k.slice(5)) : -1);
/** An Add row's value: the action it offers, or -- listened for -- what the listen waits for. */
function addValue(b: PadBinding, kind: 'addDouble' | 'addCombo'): string {
  const id = kind === 'addDouble' ? EXTRA_DOUBLE_LISTEN : EXTRA_COMBO_LISTEN;
  if (b.listening() !== id) return EXTRA_ACTION_WORDS[b.addAction[kind === 'addDouble' ? 'double' : 'combo']];
  if (!b.released()) return `Release all buttons… ${secondsLeft(b)} s`;
  const mod = b.extraModifier();
  if (kind === 'addCombo') return mod >= 0 ? `${b.label(mod)} held: now the second button… ${secondsLeft(b)} s` : `Hold the first button… ${secondsLeft(b)} s`;
  return `${REMAP_HOLD_WORDS} ${secondsLeft(b)} s`;
}

/** LATER 380: the lock of a pad of another layout not yet taught, and the teach panel's words. */
export const TEACH_LOCK_WORD = 'Teach this controller';
export const TEACH_LOCK_LINE = 'This controller uses another layout. Teach it its buttons first: press any button on it to begin.';

/** Why the rows cannot change: no pad chosen, or one of another layout not yet taught (LATER 380). */
export function remapLock(b: PadBinding): { word: string; line: string } | null {
  if (!b.raw) return { word: 'Connect a controller', line: 'Connect a controller, then press a button.' };
  if (!b.usable()) return { word: TEACH_LOCK_WORD, line: TEACH_LOCK_LINE };
  return null;
}

const FACE: readonly FaceButton[] = ['cross', 'circle', 'square', 'triangle'];

/** A standard button as the console draws it: a face glyph, a shoulder key, the d-pad's glyph, or its name. */
export function buttonGlyph(b: PadBinding, physical: number): string {
  const face = FACE[physical];
  if (face) return btn(face);
  if (physical >= 4 && physical <= 7) return shoulder(['L1', 'R1', 'L2', 'R2'][physical - 4]!);
  if (physical === 12 || physical === 13) return `<span class="cx-remap__dpad" title="${esc(b.label(physical))}">${dpad('v')}<span class="cx-remap__dir">${physical === 12 ? 'Up' : 'Down'}</span></span>`;
  if (physical === 14 || physical === 15) return `<span class="cx-remap__dpad" title="${esc(b.label(physical))}">${dpad('h')}<span class="cx-remap__dir">${physical === 14 ? 'Left' : 'Right'}</span></span>`;
  return esc(b.label(physical));
}

/** The listened row's line while the conflict's Confirm asks (no countdown behind the dialog). */
export const REMAP_ASKING_WORDS = 'Answer the question';
/** LATER 380: a listened row's line once its button is released: hold the new one. */
export const REMAP_HOLD_WORDS = 'Hold a button…';

/** The seconds a listen has left, whole and rounded up (12 at its start). */
export const secondsLeft = (b: PadBinding): number => Math.ceil(b.remaining() / 1000);

/** The dead zone's roller: 0-40 % in steps of 1 %, as Options' Pad dead zone (this browser) (`../adapters/options` `padDead`). */
export const DEAD_VALUES = Array.from({ length: 41 }, (_, i) => `${i}%`);

/** A bind's button (`CROUCH_BIND`, `PRONE_BIND`; -1 unbound). */
export const bindButton = (b: PadBinding, bind: number): number => (bind === CROUCH_BIND ? b.crouch() : b.prone());

/** The physical button a row drives (-1 for none, or a tuner's row). */
export function rowPhysical(b: PadBinding, row: number): number {
  const action = remapActionOfRow(row);
  if (action >= 0) return b.actions()[action]?.physical ?? -1;
  const bind = remapBindOfRow(row);
  return bind === undefined ? -1 : bindButton(b, bind);
}

/** LATER 380, the drawing's way back: the first row a physical button drives (an action's, then a bind's shown: STM.R1), or -1. */
export function rowOfPhysical(b: PadBinding, physical: number): number {
  const action = b.actions().findIndex((x) => x.physical === physical);
  if (action >= 0) return REMAP_ACTION_ROW + action;
  if (controllerStanceMode() !== 'separate') return -1;
  for (const [row, bind] of BIND_ROWS) if (bindButton(b, bind) === physical) return row;
  return -1;
}

/** A bind's aside line: unbound, or the action its button replaces in the match, and when it acts. */
function bindNote(b: PadBinding, bind: number): string {
  const c = bindButton(b, bind);
  if (c < 0) return 'Unbound by default. Press Cross, then hold the button; Square unbinds it.';
  const replaced = b.actions().filter((x) => x.physical === c).map((x) => x.name);
  const when = bind === CROUCH_BIND ? 'Release to toggle crouch.' : 'Press to go prone, or to stand up from prone.';
  return `Replaces ${replaced.join(', ') || 'the original action'}. ${when}`;
}

/** A listened row's line: let go, then hold; the question; or the lock's line. */
function listenLine(b: PadBinding, lock: { line: string } | null, listening: boolean): string {
  if (listening && b.question()) return REMAP_ASKING_WORDS;
  if (listening) return `${b.released() ? REMAP_HOLD_WORDS : 'Release all buttons…'} ${secondsLeft(b)} s`;
  return lock ? lock.line : '';
}

/** A bind's row (Crouch, Prone): listened for as an action's (`PadBinding.listen`). */
function bindRow(s: ConsoleState, b: PadBinding, i: number, lock: { line: string } | null, live: ReadonlySet<number>): string {
  const bind = remapBindOfRow(i, 'separate')!;
  const name = b.bindName(bind);
  const focused = s.rm.row === i;
  const listening = b.listening() === bind;
  const physical = bindButton(b, bind);
  // PS2P: Crouch and Prone on one pressure button -- its light and its firm press (`PadBinding.pressureSplit`).
  const sub = listenLine(b, lock, listening) || (b.pressureSplit() ? (bind === CROUCH_BIND ? 'Light press' : 'Firm press') : '');
  // PS2P fold (seat 5d, 2026-11-01): Crouch unbound while pressure is active is still crouched by the light press of
  // Prone's button -- the row says so instead of Unbound, so the screen tells the truth.
  const light = bind === CROUCH_BIND && physical < 0 ? b.pressureLight() : -1;
  const shown = light >= 0 ? `Light press (${b.label(light)})` : b.label(physical);
  const label = `${name}: ${shown}${listening ? ', listening' : ''}`;
  return `<li><button type="button" class="cx-item ${focused ? 'is-focused' : ''} ${lock ? 'is-disabled' : ''} ${physical >= 0 && live.has(physical) ? 'is-live' : ''}" data-act="remaprow" data-i="${i}" data-fk="remap-${i}" aria-label="${esc(label)}">
          <span class="cx-item__text"><span class="cx-item__title">${esc(name)}</span>${sub ? `<span class="cx-item__sub">${esc(sub)}</span>` : ''}</span>
          <span class="cx-item__state" data-glyph="${physical}">${light >= 0 ? esc(shown) : buttonGlyph(b, physical)}</span>
        </button></li>`;
}

/** Action `i`'s row (`REMAP_ACTION_ROW + i`: STANCE-TOP). */
function actionRow(s: ConsoleState, b: PadBinding, i: number, lock: { line: string } | null, live: ReadonlySet<number>): string {
  const x = b.actions()[i]!;
  const row = REMAP_ACTION_ROW + i;
  const focused = s.rm.row === row;
  const listening = b.listening() === i;
  // The seat's fold (OVERLAY-CONSOLE): while the conflict's Confirm asks, the listen is held (`PadBinding.step` waits for
  // the answer), so the row asks for the answer instead of counting seconds down behind the dialog.
  const sub = listenLine(b, lock, listening) || (x.custom ? 'Changed from the default' : '');
  const label = `${x.name}: ${b.label(x.physical)}${listening ? ', listening' : ''}`;
  return `<li><button type="button" class="cx-item ${focused ? 'is-focused' : ''} ${lock ? 'is-disabled' : ''} ${x.physical >= 0 && live.has(x.physical) ? 'is-live' : ''}" data-act="remaprow" data-i="${row}" data-fk="remap-${row}" aria-label="${esc(label)}">
          <span class="cx-item__text"><span class="cx-item__title">${esc(x.name)}</span>${sub ? `<span class="cx-item__sub">${esc(sub)}</span>` : ''}</span>
          <span class="cx-item__state ${x.physical < 0 ? 'is-alert' : ''}" data-glyph="${x.physical}">${buttonGlyph(b, x.physical)}</span>
        </button></li>`;
}

function rollerRow(s: ConsoleState, i: number, label: string, value: string, changed: boolean, lock: { word: string } | null): string {
  const focused = s.rm.row === i;
  return `<li><div class="cx-roller ${focused ? 'is-focused' : ''} ${lock ? 'is-locked' : ''}" data-act="remaprow" data-i="${i}" data-fk="remap-${i}" role="group" aria-label="${esc(label)}: ${esc(lock?.word ?? value)}" tabindex="-1">
            <span class="cx-roller__label">${esc(label)}</span>
            <span class="cx-roller__ctl"><button type="button" data-act="remapstep" data-i="${i}" data-d="-1" aria-label="Previous value">${ico('left')}</button><span class="cx-roller__value ${changed && !lock ? 'is-changed' : ''}">${esc(lock?.word ?? value)}</span><button type="button" data-act="remapstep" data-i="${i}" data-d="1" aria-label="Next value">${ico('right')}</button></span>
          </div></li>`;
}

/** An extra row (OBF-10b's review): a plain action item, its Cross (or click) its act. h59U9CLb: the extra binds' rows too. */
function extraRow(s: ConsoleState, b: PadBinding, i: number, kind: RemapExtra): string {
  if (kind === 'addDouble' || kind === 'addCombo') return rollerRow(s, i, kind === 'addDouble' ? 'Add double bind' : 'Add combo bind', addValue(b, kind), false, null);
  const x = extraIndex(kind) >= 0 ? b.extraList()[extraIndex(kind)] : undefined;
  const n = b.extraList().length;
  const w = kind === 'extras' ? { title: 'Extra binds', sub: `Browser adaptation · ${n ? `${n} set` : 'none set'}` }
    : x ? { title: extraName(b, x), sub: x.warning === 'same-thumb' ? REMAP_SAME_THUMB_WARNING : x.kind === 'double' ? 'Double bind · Cross removes it' : 'Combo bind · Cross removes it' }
      : EXTRA_WORDS[kind as FixedExtra];
  return `<li><button type="button" class="cx-item ${s.rm.row === i ? 'is-focused' : ''}" data-act="remaprow" data-i="${i}" data-fk="remap-${i}" data-extra="${kind}" aria-label="${esc(w.title)}">
          <span class="cx-item__text"><span class="cx-item__title">${esc(w.title)}</span><span class="cx-item__sub">${esc(w.sub)}</span></span>
        </button></li>`;
}

/** The aside: what the focused row does, and where it is saved (or why it is locked). */
function asideHtml(s: ConsoleState, b: PadBinding, lock: { line: string } | null): string {
  const r = s.rm.row;
  const extra = remapExtraAt(b, r);
  const bind = remapBindOfRow(r);
  // STM.R1: the Stance mode's tooltip is `STANCE_MODE_ABOUT`, one line per mode (the console has no hover: the aside is
  // the focused row's tooltip); Crouch and Prone are SEPARATE's, where Triangle does no stance while Prone is bound (the
  // review's F1: not "it starts on Triangle's button", false for a SEPARATE read from storage).
  const x = extra && extraIndex(extra) >= 0 ? b.extraList()[extraIndex(extra)] : undefined;
  const [head, about, note] = extra === 'extras'
    ? ['Extra binds', 'Off until you add one: a button that also does a second action (a double bind), or a button pressed while another is held that adds one (a combo). Every button keeps its own action. Square clears them all.', EXTRAS_NOTE]
    : extra === 'addDouble'
      ? ['Add double bind', 'Choose the action with Left and Right, press Cross, then hold the button that should also do it until its ring fills. It keeps its own action.', EXTRAS_NOTE]
      : extra === 'addCombo'
        ? ['Add combo bind', 'Choose the action, press Cross, then hold the first button and, still holding it, the second until its ring fills. Both keep their own actions.', EXTRAS_NOTE]
        : x
          ? [extraName(b, x), x.warning === 'same-thumb' ? `${REMAP_SAME_THUMB_WARNING} Cross removes it.` : 'Cross removes it.', EXTRAS_NOTE]
          : extra ? [EXTRA_WORDS[extra as FixedExtra].title, EXTRA_WORDS[extra as FixedExtra].about, EXTRA_WORDS[extra as FixedExtra].note]
    : r === REMAP_DEAD_ROW
    ? [PAD_DEAD_ZONE_LABEL, 'How far the stick moves before anything happens. Raise it if your aim drifts on its own.', 'Saved to this browser, for this controller.']
    : r === REMAP_STANCE_ROW
      ? ['Stance mode', STANCE_MODE_ABOUT, 'Saved to this browser, for every controller.']
      : bind === CROUCH_BIND
        ? ['Crouch', 'A button of its own for crouch, as emulator players bind it.', bindNote(b, CROUCH_BIND)]
        : bind === PRONE_BIND
          ? ['Prone', 'A button of its own for prone, as emulator players bind it. Choosing SEPARATE gives it Triangle\'s button if it has none; while it is bound, Triangle changes no stance.', bindNote(b, PRONE_BIND)]
          : [b.actions()[remapActionOfRow(r)]?.name ?? '', 'Press Cross, then hold the controller button that should do this until its ring fills. L1 and R1 together cancel.', 'Saved to this browser, for this controller.'];
  return `<aside class="cx-aside" aria-label="About this binding">
        <div class="cx-readout__head">${esc(head)}</div>
        <p>${esc(about)}</p>
        <p class="cx-aside__note">${esc(lock ? lock.line : note)}</p>
      </aside>`;
}

/** The ring's circumference factor: a hold's progress drawn as the stroke's dash (`pathLength` 100). */
const RING = 100;

/** What a button on the drawing shows: the action it drives (-1: none, drawn free), and a bind it carries. */
export interface PadMark { readonly action: number; readonly bind: '' | 'C' | 'P' }
/** A button's part in the teach pass: the one asked now, taught, still to teach, or none. */
export type PadTeachMark = 'now' | 'taught' | 'todo' | '';

/** The chip's radius on each button, in the drawing's units: the face and d-pad wide, the sticks' caps, the shoulders'. */
const chipR = (i: number): number => (i <= 3 ? 8.5 : i <= 7 ? 5.6 : i <= 9 ? 4.6 : i <= 11 ? 8 : 7.5);
const SHOULDER = ['L1', 'R1', 'L2', 'R2'] as const;
/** The d-pad's arrows: the console's chevron (`P.right`) turned to each direction, up, down, left, right. */
const DIR_TURN = [-90, 90, 180, 0] as const;
/** SELECT's and START's chips are pills, wide enough for the whole word (half their width, half their height). */
const PILL = { w: 11.5, h: 4.4 } as const;

/** Action `a`'s glyph inside a chip of radius `r` at (`x`, `y`): the console's own marks (`../icons`), drawn small. */
function chipGlyph(a: number, x: number, y: number, r: number): string {
  const box = (vb: number, inner: string, cls: string): string => `<svg class="cx-pad__glyph ${cls}" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" viewBox="0 0 ${vb} ${vb}">${inner}</svg>`;
  const face = FACE[a];
  if (face) return box(26, GLYPH[face], `cx-btn--${face}`);
  if (a >= 12 && a <= 15) return box(24, P.right.replace('<path ', `<path transform="rotate(${DIR_TURN[a - 12]} 12 12)" `), 'is-dpad');
  const word = a >= 4 && a <= 7 ? SHOULDER[a - 4]! : a === 8 ? 'SELECT' : a === 9 ? 'START' : a === 10 ? 'L3' : 'R3';
  return `<text class="cx-pad__word" x="${x}" y="${y}" font-size="${word.length > 2 ? 4.2 : r}">${word}</text>`;
}

/**
 * The controller drawing (`./padArt`), the screen's hero. The body's silhouette a step lighter than the panel, Sony's line
 * art over it (white line work for a dark ground, masking a rect so its lines take the console's text token,
 * `.cx-pad__art`), and on each standard button a chip with the glyph of the action it drives -- the console's own marks
 * (`../icons`; the shoulders', SELECT's and START's only where the drawing's own print does not say it: moved, free,
 * lit or held); `is-moved` where that action is not the button's own, `is-free` where it drives none -- `is-lit` the
 * button the focused row drives (or the pass's step), `is-down` the buttons held now, its ring filled by the hold's
 * progress. In the teach pass the chips say the pass instead: the button asked now (`is-now`, its halo pulsing), taught
 * (a tick), still to teach (outlined). Each button is a click that focuses the row it drives (`remappad`); the rows stay
 * the accessible list, so the drawing is one image to a screen reader.
 */
export function padDiagram(o: { lit: number; down: ReadonlySet<number>; ring: { at: number; progress: number } | null; stickArrow?: { at: number; dir: 'right' | 'down' } | null; label: string; marks?: readonly PadMark[] | null; teach?: readonly PadTeachMark[] | null }): string {
  const keys = PAD_ART.keys.map((k, i) => {
    const r = chipR(i);
    const m = o.marks?.[i];
    const t = o.teach?.[i] ?? '';
    const state = o.teach ? `is-teach${t ? ` is-${t}` : ''}` : m ? (m.action < 0 ? 'is-free' : m.action !== i ? 'is-moved' : '') : '';
    const cls = ['cx-pad__key', i === o.lit ? 'is-lit' : '', o.down.has(i) ? 'is-down' : '', state].filter(Boolean).join(' ');
    const halo = t === 'now' ? `<circle class="cx-pad__halo" cx="${k.x}" cy="${k.y}" r="${r + 4}"/>` : '';
    const inner = o.teach
      ? (t === 'taught' ? `<svg class="cx-pad__glyph is-tick" x="${k.x - r}" y="${k.y - r}" width="${2 * r}" height="${2 * r}" viewBox="0 0 24 24">${P.check}</svg>` : '')
      : m && m.action >= 0 ? chipGlyph(m.action, k.x, k.y, r) : '';
    const bind = !o.teach && m?.bind ? `<g class="cx-pad__bind"><circle cx="${k.x + r * 0.8}" cy="${k.y - r * 0.8}" r="3.2"/><text x="${k.x + r * 0.8}" y="${k.y - r * 0.8}" font-size="4">${m.bind}</text></g>` : '';
    const ring = o.ring && o.ring.at === i ? `<circle class="cx-pad__ring" cx="${k.x}" cy="${k.y}" r="${Math.max(k.r, r) + 3.5}" pathLength="${RING}" stroke-dasharray="${Math.round(o.ring.progress * RING)} ${RING}" transform="rotate(-90 ${k.x} ${k.y})"/>` : '';
    const chip = i === 8 || i === 9
      ? `<rect class="cx-pad__chip" x="${k.x - PILL.w}" y="${k.y - PILL.h}" width="${2 * PILL.w}" height="${2 * PILL.h}" rx="${PILL.h}"/>`
      : `<circle class="cx-pad__chip" cx="${k.x}" cy="${k.y}" r="${r}"/>`;
    return `<g class="${cls}" data-act="remappad" data-p="${i}" data-pad-key="${i}"><circle class="cx-pad__hit" cx="${k.x}" cy="${k.y}" r="${Math.max(k.r, r) + 1}"/>${halo}${chip}${inner}${bind}${ring}</g>`;
  }).join('');
  const arrow = o.stickArrow ? (() => {
    const k = PAD_ART.keys[o.stickArrow.at]!;
    const [dx, dy] = o.stickArrow.dir === 'right' ? [1, 0] : [0, 1];
    return `<path class="cx-pad__arrow" d="M${k.x + dx * 9} ${k.y + dy * 9} l${dx * (k.r + 4)} ${dy * (k.r + 4)}" />`;
  })() : '';
  return `<svg class="cx-pad" viewBox="-6 -6 ${PAD_ART.width + 12} ${PAD_ART.height + 12}" role="img" aria-label="${esc(o.label)}">
          <title>${esc(PAD_ART.title)}</title>
          <mask id="cx-pad-art" maskUnits="userSpaceOnUse" x="0" y="0" width="${PAD_ART.width}" height="${PAD_ART.height}"><image href="${esc(PAD_ART.href)}" width="${PAD_ART.width}" height="${PAD_ART.height}"/></mask>
          <path class="cx-pad__body" transform="${PAD_ART.body.transform}" d="${PAD_ART.body.d}"/>
          <rect class="cx-pad__art" width="${PAD_ART.width}" height="${PAD_ART.height}" mask="url(#cx-pad-art)"/>
          ${keys}${arrow}
        </svg>`;
}

/** What each button on the drawing shows (`padDiagram`'s `marks`): the action driving it, its own first, and a bind (SEPARATE's: STM.R1a). */
export function padMarks(b: PadBinding): PadMark[] {
  const acts = b.actions();
  const binds = controllerStanceMode() === 'separate';
  return PAD_ART.keys.map((_, p) => ({
    action: acts[p]?.physical === p ? p : acts.findIndex((x) => x.physical === p),
    bind: !binds ? '' : b.crouch() === p ? 'C' : b.prone() === p ? 'P' : '',
  }));
}

/** Each button's part in the pass (`padDiagram`'s `teach`): a stick's steps are its cap's; now, then to teach, then taught. */
export function padTeachMarks(t: { step: number; taught: readonly boolean[] } | null): PadTeachMark[] {
  const rank: Record<PadTeachMark, number> = { now: 3, todo: 2, taught: 1, '': 0 };
  const out: PadTeachMark[] = PAD_ART.keys.map(() => '');
  TEACH_STEPS.forEach((x, i) => {
    const k = x.kind === 'button' ? x.target : x.target < 2 ? 10 : 11;
    const m: PadTeachMark = !t ? 'todo' : i === t.step ? 'now' : t.taught[i] ? 'taught' : i > t.step ? 'todo' : '';
    if (k < out.length && rank[m] > rank[out[k]!]) out[k] = m;
  });
  return out;
}

/** The face, shoulder and d-pad glyph of a standard button, without a pad's own words (the pass's step). */
function stepGlyph(target: number, kind: 'button' | 'axis'): string {
  if (kind === 'axis') return `<span class="cx-remap__stick">${target < 2 ? 'L' : 'R'}</span>`;
  const face = FACE[target];
  if (face) return btn(face);
  if (target >= 4 && target <= 7) return shoulder(['L1', 'R1', 'L2', 'R2'][target - 4]!);
  if (target >= 12) return dpad(target <= 13 ? 'v' : 'h');
  return `<span class="cx-remap__word">${esc(['', '', '', '', '', '', '', '', 'SELECT', 'START', 'L3', 'R3'][target] ?? '')}</span>`;
}

/**
 * LATER 380, "teach me your pad": a pad of another layout taught on this screen. Before the pass (the pad not taught),
 * what it is and how to begin -- any press on the pad begins it, as does Start; during it, the step (its glyph, its
 * name), what to do, the hold's bar, the steps as dots, and Skip (a step that may be skipped) and Not now.
 */
export function teachHtml(b: PadBinding, declined = false, now?: number): string {
  const t = b.teachState(now);
  if (!t) {
    return `<div class="cx-teach" data-key="teach" aria-live="polite">
        <div class="cx-teach__count">${ico('pad')}Another layout</div>
        <p class="cx-teach__ask">${esc(TEACH_LOCK_WORD)}</p>
        <p class="cx-teach__line">It does not use the standard layout, so its buttons are learnt here: hold each one the screen asks for until its ring fills. The menus need Cross, Circle, START, the d-pad and both sticks; the rest you may skip.</p>
        <p class="cx-teach__line cx-teach__go">${declined ? 'Choose Start to begin.' : 'Press any button on the controller to begin.'}</p>
        <div class="cx-teach__acts"><button type="button" class="cx-toggle" data-act="teachstart">Start</button></div>
      </div>`;
  }
  const s = TEACH_STEPS[t.step]!;
  const stop = `To stop, choose Not now, or leave the controller for ${TEACH_IDLE_MS_ADAPTATION / 1000} seconds.`;
  const line = t.waiting ? 'Let go of every button and stick…'
    : s.kind === 'axis' ? `Push the stick ${s.target % 2 === 0 ? 'right' : 'down'} and hold it until the ring fills. ${stop}`
      : t.required ? `Hold it until the ring fills. The menus need it. ${stop}`
        : 'Hold it until the ring fills, or tap Circle to skip it.';
  return `<div class="cx-teach" data-key="teach" aria-live="polite">
        <div class="cx-teach__count">Step ${t.step + 1} of ${t.total}</div>
        <p class="cx-teach__ask"><span class="cx-teach__glyph">${stepGlyph(s.target, s.kind)}</span>${esc(s.kind === 'axis' ? s.name : `Hold ${s.name}`)}</p>
        <p class="cx-teach__line">${esc(line)}</p>
        <div class="cx-teach__bar" role="progressbar" aria-label="Hold" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(t.progress * 100)}"><span style="width:${Math.round(t.progress * 100)}%"></span></div>
        <ol class="cx-teach__dots" aria-hidden="true">${TEACH_STEPS.map((x, i) => `<li class="${i < t.step ? 'is-done' : i === t.step ? 'is-current' : ''} ${x.required ? 'is-required' : ''}"></li>`).join('')}</ol>
        <div class="cx-teach__acts">${t.required ? '' : '<button type="button" class="cx-toggle" data-act="teachskip">Skip</button>'}<button type="button" class="cx-toggle" data-act="teachcancel">Not now</button></div>
      </div>`;
}

export function remapHtml(s: ConsoleState, a: Adapters): string {
  const b = a.remap?.current() ?? null;
  if (!b) return '<section class="cx-screen" aria-label="Button mapping" data-key="remap"></section>';
  const lock = remapLock(b);
  const raw = b.raw;
  const teach = b.teachState();
  // The pad's line (the Readout's check): the pad chosen, or the Home Controller item's ask while none is.
  const padLine = raw
    ? `<li class="cx-check ${lock ? 'is-wait' : ''}" data-remap-pad>${ico(lock ? 'alert' : 'check')}${esc(raw.id)}</li>`
    : `<li class="cx-check is-wait" data-remap-pad>${ico('pad')}Press any button on your controller</li>`;
  const live = new Set(b.down());
  const step = teach ? TEACH_STEPS[teach.step]! : null;
  const stickAt = step?.kind === 'axis' ? (step.target < 2 ? 10 : 11) : -1;
  const lit = step ? (step.kind === 'button' ? step.target : stickAt) : rowPhysical(b, s.rm.row);
  const held = b.holding();
  const ring = step && !teach!.waiting ? { at: lit, progress: teach!.progress } : held >= 0 ? { at: held, progress: b.holdProgress() } : null;
  const teaching = !!teach || (!!raw && b.teachable() && !b.usable());
  const diagram = padDiagram({
    lit, down: live, ring,
    marks: teaching || lock ? null : padMarks(b),
    teach: teaching ? padTeachMarks(teach) : null,
    stickArrow: step?.kind === 'axis' ? { at: stickAt, dir: step.target % 2 === 0 ? 'right' : 'down' } : null,
    label: step ? `${PAD_ART.title}: ${step.name}` : `${PAD_ART.title}: ${b.actions()[remapActionOfRow(s.rm.row)]?.name ?? ''}`,
  });
  const dz = Math.round(b.deadZone() * 100);
  const def = defaultController();
  // STM.R1: the Stance mode (the browser's, never locked) -- the first row since STANCE-TOP (the owner, 2026-11-02: "move
  // stance mode to the top") -- then the dead zone directly under it (DEAD-UP, the owner, 2026-11-03: "can we move stick
  // dead zone up below stance mode"), then the actions, Crouch and Prone after them in SEPARATE only (STM.R1a: kept in
  // the profile, hidden, in COMBINED), then the extras from the mode's last own row.
  const mode = controllerStanceMode();
  const body = teaching
    ? teachHtml(b, s.rm.teachDeclined === true)
    : `<ul class="cx-list" role="list" aria-label="Bindings" data-scroll data-key="remap-rows">
        ${rollerRow(s, REMAP_STANCE_ROW, 'Stance mode', STANCE_MODE_WORDS[mode], mode !== 'pop', null)}
        ${rollerRow(s, REMAP_DEAD_ROW, PAD_DEAD_ZONE_LABEL, DEAD_VALUES[dz] ?? `${dz}%`, dz !== Math.round(def.deadZone * 100), lock)}
        ${b.actions().map((_, i) => actionRow(s, b, i, lock, live)).join('')}
        ${mode === 'separate' ? `${bindRow(s, b, REMAP_CROUCH_ROW, lock, live)}${bindRow(s, b, REMAP_PRONE_ROW, lock, live)}` : ''}
        ${remapExtras(b).map((k, j) => extraRow(s, b, remapOwnRows(mode) + j, k)).join('')}
      </ul>`;
  return `<section class="cx-screen cx-remap" aria-label="Button mapping" data-key="remap">
    ${screenHead(`${ico('pad')}Settings · Controller`, 'Button mapping', 'Controller', `<ul class="cx-checks" aria-label="Controller">${padLine}</ul>`)}
    <div class="cx-screen__body cx-remap__body">
      <div class="cx-remap__side">
        <div class="cx-remap__pad">${diagram}</div>
        ${teaching ? '' : asideHtml(s, b, lock)}
      </div>
      ${body}
    </div>
  </section>`;
}
