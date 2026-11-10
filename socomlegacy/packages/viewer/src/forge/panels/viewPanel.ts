import type { MenuItem } from '../padMenu';
import { builtPanel, forgeEl, type ForgePanel } from '../shell/panel';
import { DETAIL_DISTANCE_MAX, DETAIL_DISTANCE_MIN, DETAIL_DISTANCE_STEP, formatDetailDistance } from '../../detailDistance';
import { RENDER_SCALE_WORDS, RENDER_SCALES, type RenderScale } from '../../videoSettings';

/**
 * FUI-1 (a browser adaptation, FG.R2): the View panel -- the editor's draw switches, grouped as the page grouped them
 * (`.fx-view`, an `h3` per group, `label.fx-toggle` rows). Its START section is the switches the menu always carried.
 */
export interface ViewToggleSpec<Id extends string = string> { id: Id; label: string; group: string }

export interface ViewDom<Id extends string> {
  body: HTMLDivElement;
  inputs: Map<Id, HTMLInputElement>;
}

export function buildView<Id extends string>(doc: Document, toggles: readonly ViewToggleSpec<Id>[]): ViewDom<Id> {
  const body = forgeEl(doc, 'div', 'fx-view fx-section');            // FUI-22 (D2): the dock's one section style
  const inputs = new Map<Id, HTMLInputElement>();
  for (const g of [...new Set(toggles.map((t) => t.group))]) {
    body.append(forgeEl(doc, 'h3', '', g));
    for (const t of toggles.filter((x) => x.group === g)) {
      const w = forgeEl(doc, 'label', 'fx-toggle');
      const i = forgeEl(doc, 'input');
      i.type = 'checkbox';
      inputs.set(t.id, i);
      w.append(i, forgeEl(doc, 'span', '', t.label));
      body.append(w);
    }
  }
  return { body, inputs };
}

/** The switches the START menu carries, with the menu's own labels. */
export const VIEW_MENU_ROWS = [['wireframe', 'Wireframe'], ['collision', 'Collision hull'], ['fog', 'Fog'], ['ps2', 'PS2 picture']] as const;

export interface ViewMenuHooks<Id extends string> { on(id: Id): boolean; toggle(id: Id): void }

/** One row a switch: On / Off, Cross and ← → each turn it, the menu kept open. */
export function viewMenuSection<Id extends string>(rows: readonly (readonly [Id, string])[], hooks: ViewMenuHooks<Id>): MenuItem[] {
  return rows.map(([id, label]) => ({
    id: `view-${id}`, label, value: hooks.on(id) ? 'On' : 'Off', keepOpen: true,
    act: () => hooks.toggle(id), left: () => hooks.toggle(id), right: () => hooks.toggle(id),
  }));
}

/**
 * PF.R60 (`../../detailDistance`, a browser adaptation over PF-30's gate, PF.R50): the detail distance -- the page's
 * one stored factor, the front end's launcher Options' too -- beside the PS2 picture switch. Under the PS2 picture the
 * original's (1) is drawn and the row does not apply.
 */
export interface DetailDistanceHooks { value(): number; step(d: -1 | 1): void; ps2(): boolean }

/** The START menu's row: ← → step the factor by 0.1; under the PS2 picture it reads the original's and is disabled. */
export function detailDistanceMenuItem(hooks: DetailDistanceHooks): MenuItem {
  if (hooks.ps2()) return { id: 'view-detailDistance', label: 'Detail distance', value: `${formatDetailDistance(1)} (PS2)`, disabled: true, keepOpen: true };
  return {
    id: 'view-detailDistance', label: 'Detail distance', value: formatDetailDistance(hooks.value()), keepOpen: true,
    left: () => hooks.step(-1), right: () => hooks.step(1),
  };
}

/**
 * The panel's slider (1.0-4.0 by 0.1) and its value, under a 'Detail distance' label; `sync` redraws it from the hooks (the
 * caller's first `sync` draws it: the hooks may read state not made yet when the row is built).
 */
export function buildDetailDistance(doc: Document, hooks: DetailDistanceHooks, set: (v: number) => void): { row: HTMLLabelElement; input: HTMLInputElement; sync(): void } {
  const row = forgeEl(doc, 'label', 'fx-toggle fx-detail-distance');
  const input = forgeEl(doc, 'input', 'fx-range');
  input.type = 'range';
  input.min = String(DETAIL_DISTANCE_MIN); input.max = String(DETAIL_DISTANCE_MAX); input.step = String(DETAIL_DISTANCE_STEP);
  const out = forgeEl(doc, 'span', 'fx-detail-distance__value');
  row.append(forgeEl(doc, 'span', '', 'Detail distance'), input, out);
  const sync = (): void => {
    const ps2 = hooks.ps2();
    input.disabled = ps2;
    input.value = String(ps2 ? 1 : hooks.value());
    out.textContent = ps2 ? `${formatDetailDistance(1)} (PS2)` : formatDetailDistance(hooks.value());
    row.title = ps2 ? 'The PS2 picture draws the original detail distance.' : 'How far the detail textures reach (1.0× is the original).';
  };
  input.addEventListener('input', () => { if (!hooks.ps2()) { set(Number(input.value)); sync(); } });
  return { row, input, sync };
}

/**
 * FP-2 (FP.R5; a browser adaptation, FG.R2 -- the game has no editor): the render scale -- the page's one stored video
 * setting (`../../videoSettings`, CPS.R7), the launcher's and VIDEO OPTIONS' too -- beside the detail distance, on its
 * shape. Under the PS2 picture the console's 640 x 448 frame is drawn and the row does not apply.
 */
export interface RenderScaleHooks { value(): RenderScale; step(d: -1 | 1): void; ps2(): boolean }

/** FP-2: the row's words under the PS2 picture: the console's frame, whatever the preset. */
export const RENDER_SCALE_PS2_WORDS = '640 x 448 (PS2)';

/** FP-2: the START menu's row, as `detailDistanceMenuItem`'s: ← → step the preset; under the PS2 picture it reads the console's frame and is disabled. */
export function renderScaleMenuItem(hooks: RenderScaleHooks): MenuItem {
  if (hooks.ps2()) return { id: 'view-renderScale', label: 'Render scale', value: RENDER_SCALE_PS2_WORDS, disabled: true, keepOpen: true };
  return {
    id: 'view-renderScale', label: 'Render scale', value: RENDER_SCALE_WORDS[hooks.value()], keepOpen: true,
    left: () => hooks.step(-1), right: () => hooks.step(1),
  };
}

/**
 * FP-2: the panel's slider (one stop a preset, `RENDER_SCALES`' order) and its word, under a 'Render scale' label; `sync`
 * redraws it from the hooks (the caller's first `sync` draws it), as `buildDetailDistance`'s.
 */
export function buildRenderScale(doc: Document, hooks: RenderScaleHooks, set: (v: RenderScale) => void): { row: HTMLLabelElement; input: HTMLInputElement; sync(): void } {
  const row = forgeEl(doc, 'label', 'fx-toggle fx-render-scale');
  const input = forgeEl(doc, 'input', 'fx-range');
  input.type = 'range';
  input.min = '0'; input.max = String(RENDER_SCALES.length - 1); input.step = '1';
  const out = forgeEl(doc, 'span', 'fx-render-scale__value');
  row.append(forgeEl(doc, 'span', '', 'Render scale'), input, out);
  const sync = (): void => {
    const ps2 = hooks.ps2(), value = hooks.value();
    input.disabled = ps2;
    input.value = String(RENDER_SCALES.indexOf(value));
    out.textContent = ps2 ? RENDER_SCALE_PS2_WORDS : RENDER_SCALE_WORDS[value];
    row.title = ps2 ? "The PS2 picture draws the console's 640 x 448 frame." : 'How sharp the viewport draws: the render scale the launcher and VIDEO OPTIONS set.';
  };
  input.addEventListener('input', () => {
    const to = RENDER_SCALES[Number(input.value)];
    if (!hooks.ps2() && to) { set(to); sync(); }
  });
  return { row, input, sync };
}

export function viewPanel<Id extends string>(dom: ViewDom<Id>, hooks: ViewMenuHooks<Id>, rows: readonly (readonly [Id, string])[], detail?: DetailDistanceHooks): ForgePanel {
  return builtPanel({ id: 'view', title: 'View', dock: 'right', order: 30, defaultOpen: true, tab: 'World',
    padLegend: [{ button: 'cross', label: 'Switch' }],
    menuSection: () => [...viewMenuSection(rows, hooks), ...(detail ? [detailDistanceMenuItem(detail)] : [])] }, dom.body);
}
