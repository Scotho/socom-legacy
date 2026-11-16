/**
 * The paint tools' modes (the owner, 2026-11-16: "We have 3 modes. Select(default), Paint, Sample. Depending on the mode
 * it highlights the mode button in the toolbar ... bring back the apply button, it applies [what is active] on the
 * current selection ... Pressing esc on any of these tools brings back to select ... Sample ... we can quickly toggle to
 * that mode by pressing shift+click (when in paint mode)"; a browser adaptation, FG.R2): one row for every paintable
 * layer -- the textures and the collision of Geometry mode (`./geometry/editor`), the AI cells (`./aiPaint`).
 *
 * - Select: the tool's own selection (faces, edges, objects, vertices; or AI cells), drag to select many.
 * - Paint: a click or a drag lays what is active on what the brush passes over; Shift+click samples instead.
 * - Sample: a click takes what is under the pointer as what is active, then the tool before it again.
 * - Apply: what is active laid on the selection, one edit.
 */
export type PaintTool = 'select' | 'paint' | 'sample';

export interface PaintToolBarOptions {
  /** A mode's tab pressed. */
  onTool: (t: PaintTool) => void;
  /** Apply pressed: what is active on the selection. */
  onApply: () => void;
  /** Each control's tooltip, the tool's own words. */
  titles: { select: string; paint: string; sample: string; apply: string };
}

export class PaintToolBar {
  /** The modes' tabs, then Apply: one group for the toolbar. */
  readonly row: HTMLElement;
  readonly apply: HTMLButtonElement;
  private readonly tabs = new Map<PaintTool, HTMLButtonElement>();

  constructor(doc: Document, opts: PaintToolBarOptions) {
    this.row = doc.createElement('div');
    this.row.className = 'fx-paint-tools';
    const tabs = doc.createElement('div');
    tabs.className = 'fx-asset-tabs fx-geo-layer-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Tool');
    for (const [t, label] of [['select', 'Select'], ['paint', 'Paint'], ['sample', 'Sample']] as const) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'fx-asset-tab';
      b.setAttribute('role', 'tab');
      b.dataset['paintTool'] = t;
      b.textContent = label;
      b.title = opts.titles[t];
      b.addEventListener('click', () => { opts.onTool(t); b.blur(); });
      this.tabs.set(t, b);
      tabs.append(b);
    }
    this.apply = doc.createElement('button');
    this.apply.type = 'button';
    this.apply.className = 'fx-tool';
    this.apply.dataset['paintApply'] = '';
    this.apply.textContent = 'Apply';
    this.apply.title = opts.titles.apply;
    this.apply.addEventListener('click', () => { opts.onApply(); this.apply.blur(); });
    this.row.append(tabs, this.apply);
  }

  /** The tab of the mode on lit. */
  show(t: PaintTool): void {
    for (const [k, b] of this.tabs) { const on = k === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }
  }
}
