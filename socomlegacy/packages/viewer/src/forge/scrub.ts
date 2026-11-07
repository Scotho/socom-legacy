/**
 * The dock's number scrub (a browser adaptation, FG.R2 -- the game has no editor; the gesture an engine editor's number
 * fields take): press a number field and drag left or right to change it, live; a press that does not drag past
 * `SCRUB_THRESHOLD_PX` is a click and opens the field to type, its text selected. Shift drags ten times finer, Ctrl (or
 * Cmd) ten times coarser. Escape mid-drag puts the value back.
 *
 * Its events, on the input: `fx-scrub` (a `CustomEvent<ScrubDetail>`) and `input` for each value while dragging -- a
 * live preview, no edit, as typing a digit is -- and one `change` at the release, so a whole drag is one edit to whoever
 * listens for `change` (as a typed value is). A field being typed in, or a disabled one, is left to the browser.
 *
 * Every number field of the page scrubs (the owner, 2026-11-06: one interaction everywhere): `scrubAllNumbers` hears a
 * press on any `input[type=number]` under its root; a field given its own rate (`scrubNumber`) keeps it, any other takes
 * its `step` a pixel at the step's decimals (`scrubOptionsOf`).
 */

/** How far a press must travel, in CSS pixels, before it is a drag and not a click. */
export const SCRUB_THRESHOLD_PX = 3;
/** Shift's and Ctrl's factors on the rate. */
const FINE = 0.1;
const COARSE = 10;

export interface ScrubOptions {
  /** The value's change a pixel dragged. */
  rate: number;
  /** The decimals a scrubbed value keeps (default 0). */
  digits?: number;
}
/**
 * A scrub event's value; `cancelled` on the last of a drag Escape (or the pointer's cancel) ended -- its value the
 * field's at the press, which a listener that previewed may restore more exactly (a field shows a rounded value).
 */
export interface ScrubDetail { value: number; cancelled?: true }

/** The fields given their own options (`scrubNumber`): the page-wide scrub (`scrubAllNumbers`) leaves them to it. */
const own = new WeakSet<HTMLInputElement>();

/** The decimals a step or a value is written with (`0.25` 2, `5` 0), at most 4. */
const decimalsOf = (text: string): number => Math.min(4, text.includes('.') ? text.split('.')[1]!.replace(/e.*$/i, '').length : 0);

/**
 * A field's scrub with no options of its own: its `step` a pixel at the step's decimals; with no step (or `any`), the
 * value's own decimals' unit (1 for a whole number). A browser adaptation, as the scrub (FG.R2).
 */
export function scrubOptionsOf(input: HTMLInputElement): ScrubOptions {
  const step = input.step.trim();
  const n = Number(step);
  if (step !== '' && step.toLowerCase() !== 'any' && Number.isFinite(n) && n > 0) return { rate: n, digits: decimalsOf(step) };
  const digits = decimalsOf(input.value.trim());
  return { rate: 10 ** -digits, digits };
}

/** The input made a scrub with its own options; the returned function takes it back. */
export function scrubNumber(input: HTMLInputElement, options: ScrubOptions): () => void {
  input.classList.add('fx-scrub');
  own.add(input);
  const onDown = (e: Event): void => { beginScrub(input, e, options); };
  input.addEventListener('pointerdown', onDown);
  return () => {
    input.removeEventListener('pointerdown', onDown);
    input.classList.remove('fx-scrub');
    own.delete(input);
  };
}

/**
 * Every number field under `root` scrubs (the owner, 2026-11-06): a press on an `input[type=number]` not given its own
 * options (`scrubNumber`) begins a scrub at `scrubOptionsOf`. One listener, so a field drawn later (a panel's redraw,
 * the Inspector's Data rows) scrubs too. The returned function takes it back.
 */
export function scrubAllNumbers(root: Document | HTMLElement): () => void {
  const onDown = (e: Event): void => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'number' || own.has(t)) return;
    t.classList.add('fx-scrub');
    beginScrub(t, e, scrubOptionsOf(t));
  };
  root.addEventListener('pointerdown', onDown, true);
  return () => root.removeEventListener('pointerdown', onDown, true);
}

/** A press on `input`: a scrub at `options` if it drags, a click to type if it does not. */
function beginScrub(input: HTMLInputElement, e: Event, options: ScrubOptions): void {
  const doc = input.ownerDocument;
  const digits = options.digits ?? 0;
  let press: { x: number; start: number; dragging: boolean; pointerId: number | undefined } | null = null;

  const bounded = (v: number): number => {
    const min = input.min === '' ? -Infinity : Number(input.min), max = input.max === '' ? Infinity : Number(input.max);
    return Math.min(max, Math.max(min, v));
  };
  const show = (v: number, cancelled = false): void => {
    input.value = String(Number(v.toFixed(digits)));
    const detail: ScrubDetail = cancelled ? { value: Number(input.value), cancelled: true } : { value: Number(input.value) };
    input.dispatchEvent(new CustomEvent<ScrubDetail>('fx-scrub', { detail }));
    input.dispatchEvent(new Event('input', { bubbles: true }));   // as a typed digit: a field that keeps its text hears it
  };
  const end = (): void => {
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onUp);
    doc.removeEventListener('pointercancel', onCancel);
    doc.removeEventListener('keydown', onKey, true);
    doc.documentElement.classList.remove('fx-scrubbing');
    if (press?.pointerId !== undefined) { try { input.releasePointerCapture(press.pointerId); } catch { /* not captured */ } }
    press = null;
  };
  const onMove = (e: Event): void => {
    const p = press;
    if (!p) return;
    const m = e as MouseEvent;
    const dx = m.clientX - p.x;
    if (!p.dragging) {
      if (Math.abs(dx) < SCRUB_THRESHOLD_PX) return;
      p.dragging = true;
      doc.documentElement.classList.add('fx-scrubbing');
    }
    const factor = m.shiftKey ? FINE : m.ctrlKey || m.metaKey ? COARSE : 1;
    show(bounded(p.start + dx * options.rate * factor));
  };
  const onUp = (): void => {
    const p = press;
    end();
    if (!p) return;
    if (p.dragging) { input.dispatchEvent(new Event('change', { bubbles: true })); return; }
    // A click: the field opens to type.
    input.focus();
    try { input.select(); } catch { /* a field that cannot select its text */ }
  };
  const onCancel = (): void => {
    const p = press;
    end();
    if (p?.dragging) show(p.start, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !press) return;
    e.preventDefault();
    e.stopPropagation();                                      // the editor's Escape (deselect) is not this one
    onCancel();
  };
  const m = e as MouseEvent;
  if (m.button !== 0 || input.disabled || input.readOnly || doc.activeElement === input) return;
  const start = Number(input.value);
  if (input.value.trim() === '' || !Number.isFinite(start)) return;
  m.preventDefault();                                         // no focus, no caret: a press is a scrub until it is a click
  const pointerId = (e as Partial<PointerEvent>).pointerId;
  press = { x: m.clientX, start, dragging: false, pointerId };
  if (pointerId !== undefined) { try { input.setPointerCapture(pointerId); } catch { /* the document still hears it */ } }
  doc.addEventListener('pointermove', onMove);
  doc.addEventListener('pointerup', onUp);
  doc.addEventListener('pointercancel', onCancel);
  doc.addEventListener('keydown', onKey, true);
}
