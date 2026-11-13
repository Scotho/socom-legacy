import type { MenuItem } from '../padMenu';
import { scrubNumber, type ScrubDetail } from '../scrub';
import { builtPanel, forgeEl, revealRow, type ForgePanel } from '../shell/panel';

/**
 * FUI-1 (a browser adaptation, FG.R2): the Inspector, below the Outliner in the right dock. Its markup is the page's as
 * it was (`.fx-inspector`, `.fx-fields`, `.fx-field`, `.fx-num`, `.fx-lock`); the page's closure keeps wiring the fields.
 * FUI-22 (D2, a browser adaptation): the dock's one section style (`.fx-section`), the selection's sticky head (its name
 * and kind) and the dock's one stepper control (`.fx-stepper`) for its numbers.
 * The transform rows (a browser adaptation, FG.R2): position, rotation and scale, each three fields in the axis order
 * X, Y, Z -- so the axis chip's colour is the axis (pitch turns about X, yaw about Y, roll about Z) -- and a reset at the
 * row's end, hidden until the page finds the row off its default. Every field scrubs (`../scrub`): drag left or right to
 * change it, click to type. Pitch, roll and scale are drawn here but the page wires them to a stub: record v3 keeps a
 * piece's yaw alone (`creator-contracts` `recordOfLayout`), so an edit to them could not survive a save yet.
 */
export interface InspectorDom {
  body: HTMLDivElement;
  /** FUI-22 (D2): the selection's head, sticky at the top of the dock's scroll -- its name and its kind. */
  head: HTMLDivElement;
  name: HTMLDivElement;
  kind: HTMLSpanElement;
  fields: HTMLDivElement;
  x: HTMLInputElement;
  y: HTMLInputElement;
  z: HTMLInputElement;
  pitch: HTMLInputElement;
  yaw: HTMLInputElement;
  roll: HTMLInputElement;
  sx: HTMLInputElement;
  sy: HTMLInputElement;
  sz: HTMLInputElement;
  /** Each row's reset to its default (position 0, rotation 0, scale 1): hidden until the page shows it. */
  resetPosition: HTMLButtonElement;
  resetRotation: HTMLButtonElement;
  resetScale: HTMLButtonElement;
  lock: HTMLButtonElement;
  /** The selection's own record, read only, under the transform (`showInspectorData`); hidden with none. */
  data: HTMLDListElement;
}

/** `resetIcon`: the reset button's SVG markup (the page's icon set); none, the button reads "↺". */
export function buildInspector(doc: Document, resetIcon = ''): InspectorDom {
  const body = forgeEl(doc, 'div', 'fx-inspector fx-section');
  const head = forgeEl(doc, 'div', 'fx-inspect-head');
  const name = forgeEl(doc, 'div', 'fx-inspect-name', 'Nothing selected');
  const kind = forgeEl(doc, 'span', 'fx-inspect-kind');
  head.append(name, kind);
  /**
   * A field: `label` its name (kept on `data-label`), `chip` the short word beside it, `aria` what a reader hears,
   * `rate` its scrub's change a pixel and `digits` the decimals a scrubbed value keeps.
   */
  const field = (label: string, chip: string, aria: string, step = '1', rate = 1, digits = 0): HTMLInputElement => {
    const i = forgeEl(doc, 'input', 'fx-num fx-stepper');
    i.type = 'number';
    i.step = step;
    i.dataset['label'] = label;
    i.dataset['chip'] = chip;
    i.setAttribute('aria-label', aria);
    i.title = `${aria} · drag to change, click to type`;
    scrubNumber(i, { rate, digits });
    return i;
  };
  const x = field('X', 'X', 'Position X'), y = field('Y', 'Y', 'Position Y'), z = field('Z', 'Z', 'Position Z');
  const pitch = field('Pitch', 'P', 'Pitch (°, about X)'), yaw = field('Yaw', 'Y', 'Yaw (°, about Y)'), roll = field('Roll', 'R', 'Roll (°, about Z)');
  const sx = field('Scale X', 'X', 'Scale X', '0.1', 0.01, 3), sy = field('Scale Y', 'Y', 'Scale Y', '0.1', 0.01, 3), sz = field('Scale Z', 'Z', 'Scale Z', '0.1', 0.01, 3);
  const fields = forgeEl(doc, 'div', 'fx-fields');
  /** A row's field by its axis (its place in the row: X, Y, Z), named so the sheet colours it by name, never by position. */
  const fieldLabel = (input: HTMLInputElement, i: number): HTMLLabelElement => {
    const label = forgeEl(doc, 'label', `fx-field fx-field--${'xyz'[i] ?? 'x'}`);
    label.append(forgeEl(doc, 'span', '', input.dataset['chip'] ?? ''), input);
    return label;
  };
  const resetButton = (what: string): HTMLButtonElement => {
    const b = forgeEl(doc, 'button', 'fx-field-reset');
    b.type = 'button';
    if (resetIcon) b.innerHTML = resetIcon; else b.textContent = '↺';
    b.setAttribute('aria-label', `Reset ${what}`);
    b.title = `Reset ${what}`;
    b.hidden = true;
    return b;
  };
  const row = (caption: string, cls: string, inputs: readonly HTMLInputElement[], reset: HTMLButtonElement): void => {
    // The caption leads its row, on one line with its three fields; the row's reset ends it.
    const r = forgeEl(doc, 'div', `fx-field-row ${cls}`);
    r.append(forgeEl(doc, 'div', 'fx-field-caption', caption), ...inputs.map(fieldLabel), reset);
    fields.append(r);
  };
  const resetPosition = resetButton('position'), resetRotation = resetButton('rotation'), resetScale = resetButton('scale');
  row('Position', 'fx-position-fields', [x, y, z], resetPosition);
  row('Rotation °', 'fx-rotation-fields', [pitch, yaw, roll], resetRotation);
  row('Scale', 'fx-scale-fields', [sx, sy, sz], resetScale);
  const lock = forgeEl(doc, 'button', 'fx-lock fx-lock-icon', '');
  lock.type = 'button';
  lock.title = 'Lock the selection: it cannot be selected or moved until it is unlocked in the outliner';
  lock.disabled = true;
  const data = forgeEl(doc, 'dl', 'fx-inspect-data');
  data.hidden = true;
  /**
   * Two folding sections (the owner, 2026-11-11: "the transform section, and Properties section, I want to be able to
   * collapse them"): Transform (position, rotation, scale and the lock), Properties (the selection's own fields and its
   * record). Each one's open state kept in this browser; Properties drawn only while the selection has some.
   */
  const section = (id: string, title: string, ...content: HTMLElement[]): HTMLDetailsElement => {
    const d = forgeEl(doc, 'details', 'fx-fold fx-inspect-section');   // the dock's one section look (`.fx-fold`)
    d.dataset['inspectSection'] = id;
    const s = forgeEl(doc, 'summary', 'fx-inspect-section-title', title);
    d.append(s, ...content);
    const key = `forge.inspector.${id}.open`;
    try { d.open = globalThis.localStorage?.getItem(key) !== '0'; } catch { d.open = true; }
    d.addEventListener('toggle', () => { try { globalThis.localStorage?.setItem(key, d.open ? '1' : '0'); } catch { /* kept for the session only */ } });
    return d;
  };
  // The lock in the head, left of the kind at its right, on the same line (the owner, 2026-11-11); an icon (the page's).
  name.after(lock);
  body.append(head, section('transform', 'Transform', fields), section('properties', 'Properties', data));
  return { body, head, name, kind, fields, x, y, z, pitch, yaw, roll, sx, sy, sz, resetPosition, resetRotation, resetScale, lock, data };
}

/** A data row's value: a number to three places, a list of numbers on one line, anything else as text. */
const dataValue = (v: unknown): string =>
  typeof v === 'number' ? String(Math.round(v * 1000) / 1000)
    : Array.isArray(v) ? `[${v.map(dataValue).join(', ')}]` : String(v);
/** Lists this long, or longer, of numbers alone read on one line; any other list row by row. */
const isNumberList = (v: unknown): boolean => Array.isArray(v) && v.every((n) => typeof n === 'number');

/**
 * A record as the Inspector's Data rows (a browser adaptation, FG.R2): each field by its name, a nested one by its path
 * (`rect.minX`, `sites.0.team`), a list of numbers on one row; no function, no undefined. Read only, every field shown.
 */
export function dataRows(value: unknown, prefix = '', depth = 0): [string, string][] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || isNumberList(value) || depth > 5) return prefix ? [[prefix, dataValue(value)]] : [];
  const out: [string, string][] = [];
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
  for (const [k, v] of entries) {
    if (v === undefined || typeof v === 'function') continue;
    out.push(...dataRows(v, prefix ? `${prefix}.${k}` : k, depth + 1));
  }
  return out;
}

/**
 * A field of the selection the layout keeps, editable in the Data list (a browser adaptation, FG.R2): its words, its
 * widget and its value; `covers` the read-only rows it stands for (left out); `set` the edit, on a change (Enter or
 * leaving the field), never on each key.
 */
export interface InspectorEditor {
  label: string;
  /** `button`: a press, no value of its own -- its `value` the button's words, `set(true)` the press. */
  kind: 'text' | 'number' | 'select' | 'check' | 'button';
  value: string | number | boolean;
  /** Each `[value, label, greyed?]`: a greyed one listed, not choosable. */
  options?: readonly (readonly [string, string, boolean?])[];
  covers?: readonly string[];
  title?: string;
  disabled?: boolean;
  set(value: string | number | boolean): void;
  /**
   * A number field's live preview while it is scrubbed (`../scrub`; a browser adaptation, FG.R2): the scene follows each
   * value with no edit made; null puts it back as it was (Escape, or just before the release's one edit, `set`).
   */
  preview?(value: number | null): void;
}

/**
 * The Data list in the Inspector: the editable fields first (`editors`), then each read-only row, a name and its value;
 * none, the list hidden. Left as it is while a text or number field is being typed in, so a redraw never takes the typing.
 */
/**
 * A dropdown of the Data list held open (a browser adaptation, FG.R2): a redraw replaces its element, which closes the
 * browser's list under the pointer -- the maps' census landing in the background did that. While one is open the redraw
 * waits (its latest call kept) and runs once the list closes: a choice, Escape / Enter / Tab, a second press, or the focus gone.
 */
const heldOpen = new WeakMap<HTMLElement, { open: boolean; pending: (() => void) | null }>();

function holdWhileOpen(data: HTMLElement, s: HTMLSelectElement): void {
  const close = (): void => {
    const h = heldOpen.get(data);
    if (!h || !h.open) return;
    h.open = false;
    // After the choice's own edit (its `change`), so a redraw it asks for wins over the one kept.
    setTimeout(() => { const run = h.pending; h.pending = null; run?.(); }, 0);
  };
  s.addEventListener('mousedown', () => {
    const h = heldOpen.get(data) ?? { open: false, pending: null };
    heldOpen.set(data, h);
    if (h.open) close(); else h.open = true;
  });
  s.addEventListener('change', close);
  s.addEventListener('blur', close);
  s.addEventListener('keydown', (k) => { if (k.key === 'Escape' || k.key === 'Enter' || k.key === 'Tab') close(); });
}

export function showInspectorData(dom: Pick<InspectorDom, 'data'>, rows: readonly (readonly [string, string])[], editors: readonly InspectorEditor[] = []): void {
  const doc = dom.data.ownerDocument;
  const held = heldOpen.get(dom.data);
  if (held?.open) { held.pending = () => showInspectorData(dom, rows, editors); return; }
  if (held) held.pending = null;
  const sig = JSON.stringify([rows, editors.map((e) => [e.label, e.kind, e.value, e.options, e.disabled])]);
  // Held only while a text or number field is being typed in; a choice (a select, a box) redraws at once, so a field
  // that depends on it (a door's on its map) follows, the focus kept on the same field.
  const active = doc.activeElement;
  const typing = active instanceof HTMLInputElement && active.type !== 'checkbox' && dom.data.contains(active);
  if (dom.data.dataset['sig'] === sig || typing) return;
  const refocus = active && dom.data.contains(active) ? active.getAttribute('aria-label') : null;
  dom.data.dataset['sig'] = sig;
  const covered = new Set(editors.flatMap((e) => e.covers ?? []));
  const fields = editors.flatMap((e) => {
    // A button (an ambient effect's sound played, a preview): its words its value, its press `set(true)`.
    if (e.kind === 'button') {
      const b = forgeEl(doc, 'button', 'fx-tool fx-inspect-edit fx-inspect-button', String(e.value));
      b.type = 'button';
      b.disabled = e.disabled === true;
      b.setAttribute('aria-label', e.label);
      if (e.title) b.title = e.title;
      b.addEventListener('click', () => e.set(true));
      const dd = forgeEl(doc, 'dd', '');
      dd.append(b);
      return [forgeEl(doc, 'dt', '', e.label), dd];
    }
    let input: HTMLInputElement | HTMLSelectElement;
    if (e.kind === 'select') {
      const s = forgeEl(doc, 'select', 'fx-select fx-inspect-edit');
      for (const [v, w, off] of e.options ?? []) { const o = forgeEl(doc, 'option', '', w); o.value = v; if (off) o.disabled = true; s.append(o); }
      s.value = String(e.value);
      holdWhileOpen(dom.data, s);
      input = s;
    } else {
      const i = forgeEl(doc, 'input', e.kind === 'check' ? 'fx-inspect-edit' : 'fx-num fx-inspect-edit');
      i.type = e.kind === 'check' ? 'checkbox' : e.kind === 'number' ? 'number' : 'text';
      if (e.kind === 'check') i.checked = e.value === true; else i.value = String(e.value);
      input = i;
    }
    input.disabled = e.disabled === true;
    input.setAttribute('aria-label', e.label);
    if (e.title) input.title = e.title;
    input.addEventListener('change', () => {
      if (e.kind === 'check') e.set((input as HTMLInputElement).checked);
      else if (e.kind === 'number') { e.preview?.(null); const n = Number(input.value); if (Number.isFinite(n)) e.set(n); }
      else e.set(input.value);
    });
    // A scrub's values shown live (`preview`), the release's `change` the one edit.
    if (e.kind === 'number' && e.preview) {
      input.addEventListener('fx-scrub', (ev) => {
        const { value, cancelled } = (ev as CustomEvent<ScrubDetail>).detail;
        e.preview!(cancelled ? null : value);
      });
    }
    if (input instanceof HTMLInputElement && e.kind !== 'check') input.addEventListener('keydown', (k) => { if (k.key === 'Enter') input.blur(); });
    const dd = forgeEl(doc, 'dd', '');
    dd.append(input);
    return [forgeEl(doc, 'dt', '', e.label), dd];
  });
  const shown = rows.filter(([k]) => !covered.has(k));
  dom.data.replaceChildren(...fields, ...shown.flatMap(([k, v]) => [forgeEl(doc, 'dt', '', k), forgeEl(doc, 'dd', '', v)]));
  dom.data.hidden = fields.length + shown.length === 0;
  if (refocus !== null) [...dom.data.querySelectorAll<HTMLElement>('.fx-inspect-edit')].find((el) => el.getAttribute('aria-label') === refocus)?.focus();
}

/** Its pad path: a START row that shows it with the selection's name (the pad edits the selection in the view). */
export function inspectorPanel(dom: InspectorDom, reveal: (id: string) => void): ForgePanel {
  const menuSection = (): MenuItem[] => [revealRow(reveal, 'inspector', 'Inspector', dom.name.textContent ?? '',
    'The selection’s place and turn · ✕ shows it in the dock')];
  return builtPanel({ id: 'inspector', title: 'Inspector', dock: 'right', order: 20, defaultOpen: true,
    padLegend: [{ button: 'circle', label: 'Deselect' }, { button: 'dpad', label: 'Rotate' }], menuSection }, dom.body);
}
