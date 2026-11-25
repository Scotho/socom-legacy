/**
 * The property grid's parts (the owner, 2026-11-25: Map Settings "make sure everything is two columns ... If they can fit
 * into one row, make it a section ... make it consistent"; a browser adaptation, the game has no editor). Every panel
 * of settings is built from these three, so every one reads alike:
 * - `subsection`: a foldable group with one heading style, its Preset and Reset (where it has them) at the heading's end;
 * - `propRow`: one row -- its name in the first column, its controls side by side in the second, 30 px high;
 * - `ownButton`: the one Reset (back to the map's own values), `presetButton` the one Preset (a disc map's copied in).
 * Every group but Map has a Reset, and a Preset where a disc map's values can be copied (the owner, 2026-11-25: "for
 * each group if possible and makes sense add a preset and reset button ... except for the map group"; "reset should
 * reset to the maps default values").
 * No line of explanation is drawn between rows (the owner: "just section title, row text and widgets").
 */
import { forgeEl } from '../shell/panel';

/** Each sub-section's fold kept across the panels' redraws (they rebuild on every change), by its title. */
const folds = new Map<string, boolean>();

export interface Subsection { fold: HTMLDetailsElement; table: HTMLDivElement }

/**
 * A foldable group: its heading (`title`, then `preset` and `reset` at its end), its rows' table under it. Open unless
 * `closed`.
 */
export function subsection(doc: Document, title: string, opts: { preset?: HTMLElement | null; reset?: HTMLElement | null; closed?: boolean } = {}): Subsection {
  const fold = forgeEl(doc, 'details', 'fx-subfold');
  fold.open = folds.get(title) ?? !opts.closed;
  fold.addEventListener('toggle', () => { folds.set(title, fold.open); });
  const summary = forgeEl(doc, 'summary', '');
  summary.append(forgeEl(doc, 'span', 'fx-subfold-title', title));
  const actions = [opts.preset, opts.reset].filter((b): b is HTMLElement => !!b);
  if (actions.length) {
    const end = forgeEl(doc, 'span', 'fx-subfold-actions');
    // A press on a button is the button's, never the fold's.
    for (const b of actions) b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    end.append(...actions);
    summary.append(end);
  }
  const table = forgeEl(doc, 'div', 'fx-prop-table');
  fold.append(summary, table);
  return { fold, table };
}

/** One row: `label` in the first column, `controls` side by side in the second (a null one left out). */
export function propRow(doc: Document, label: string, ...controls: (HTMLElement | null | undefined)[]): HTMLDivElement {
  const row = forgeEl(doc, 'div', 'fx-prop-row');
  const value = forgeEl(doc, 'div', 'fx-prop-value');
  value.append(...controls.filter((c): c is HTMLElement => !!c));
  row.append(forgeEl(doc, 'span', 'fx-prop-label', label), value);
  return row;
}

/** The Reset: on (pressable) while the group differs from the map's own values. Its click is the caller's. */
export function ownButton(doc: Document, title: string, on: boolean, locked: boolean): HTMLButtonElement {
  const b = forgeEl(doc, 'button', 'fx-chip fx-setting-reset fx-own', 'Reset');
  b.type = 'button';
  b.title = title;
  b.disabled = locked || !on;
  return b;
}

/** The Preset: a disc map's values for the group copied in (the page asks which map). Its click is the caller's. */
export function presetButton(doc: Document, title: string, locked: boolean): HTMLButtonElement {
  const b = forgeEl(doc, 'button', 'fx-chip fx-setting-reset fx-own fx-preset', 'Preset…');
  b.type = 'button';
  b.title = title;
  b.disabled = locked;
  return b;
}
