import type { MenuItem } from '../padMenu';
import { builtPanel, forgeEl, revealRow, type ForgePanel } from '../shell/panel';

/**
 * FUI-1 (a browser adaptation, FG.R2): the Inspector, the first registrant of the right dock. Its markup is the page's as
 * it was (`.fx-inspector`, `.fx-fields`, `.fx-field`, `.fx-num`, `.fx-lock`); the page's closure keeps wiring the fields.
 * FUI-22 (D2, a browser adaptation): the dock's one section style (`.fx-section`), the selection's sticky head (its name
 * and kind) and the dock's one stepper control (`.fx-stepper`) for its numbers.
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
  yaw: HTMLInputElement;
  lock: HTMLButtonElement;
}

export function buildInspector(doc: Document): InspectorDom {
  const body = forgeEl(doc, 'div', 'fx-inspector fx-section');
  const head = forgeEl(doc, 'div', 'fx-inspect-head');
  const name = forgeEl(doc, 'div', 'fx-inspect-name', 'Nothing selected');
  const kind = forgeEl(doc, 'span', 'fx-inspect-kind');
  head.append(name, kind);
  const field = (label: string): HTMLInputElement => {
    const i = forgeEl(doc, 'input', 'fx-num fx-stepper');
    i.type = 'number';
    i.step = '1';
    i.dataset['label'] = label;
    return i;
  };
  const x = field('X'), y = field('Y'), z = field('Z'), yaw = field('Yaw');
  const fields = forgeEl(doc, 'div', 'fx-fields');
  for (const f of [x, y, z, yaw]) { const w = forgeEl(doc, 'label', 'fx-field'); w.append(forgeEl(doc, 'span', '', f.dataset['label'] ?? ''), f); fields.append(w); }
  const lock = forgeEl(doc, 'button', 'fx-chip fx-lock', 'Lock');
  lock.type = 'button';
  lock.title = 'Lock the selection: it cannot be selected or moved until it is unlocked in the outliner';
  lock.disabled = true;
  body.append(head, fields, lock);
  return { body, head, name, kind, fields, x, y, z, yaw, lock };
}

/** Its pad path: a START row that shows it with the selection's name (the pad edits the selection in the view). */
export function inspectorPanel(dom: InspectorDom, reveal: (id: string) => void): ForgePanel {
  const menuSection = (): MenuItem[] => [revealRow(reveal, 'inspector', 'Inspector', dom.name.textContent ?? '',
    'The selection’s place and turn · ✕ shows it in the dock')];
  return builtPanel({ id: 'inspector', title: 'Inspector', dock: 'right', order: 10, defaultOpen: true, tab: 'Edit',
    padLegend: [{ button: 'circle', label: 'Deselect' }, { button: 'dpad', label: 'Turn' }], menuSection }, dom.body);
}
