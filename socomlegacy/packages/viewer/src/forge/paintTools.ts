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
  private readonly tabs = new Map<string, HTMLButtonElement>();
  private readonly tabList: HTMLElement;
  /** The tabs placed after Apply (`addTab`'s `after` 'apply'), made when the first is. */
  private tailList: HTMLElement | null = null;
  private readonly doc: Document;

  constructor(doc: Document, opts: PaintToolBarOptions) {
    this.doc = doc;
    this.row = doc.createElement('div');
    this.row.className = 'fx-paint-tools';
    const tabs = doc.createElement('div');
    this.tabList = tabs;
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

  /**
   * A tool of the caller's own as a tab beside these (Geometry mode's Block; the owner, 2026-11-17: "it should be Tool
   * Select | Block"), after `after`'s tab; `key` its name for `show` and `setShown`.
   */
  addTab(key: string, label: string, title: string, after: string, onClick: () => void): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.className = 'fx-asset-tab';
    b.setAttribute('role', 'tab');
    b.dataset['paintTool'] = key;
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', () => { onClick(); b.blur(); });
    // After Apply (the owner, 2026-11-17: "in collision layer mode, move the apply button to the left of the create
    // button ... consistent with the texture layer"): a tab group of its own past Apply, so Apply stays with the modes it applies.
    if (after === 'apply') {
      if (!this.tailList) {
        this.tailList = this.doc.createElement('div');
        this.tailList.className = this.tabList.className;
        this.tailList.setAttribute('role', 'tablist');
        this.tailList.setAttribute('aria-label', 'Tool');
        this.apply.after(this.tailList);
      }
      this.tailList.append(b);
    } else {
      const prev = this.tabs.get(after);
      if (prev) prev.after(b); else this.tabList.append(b);
    }
    this.tabs.set(key, b);
    return b;
  }

  /** A tab by its key (a paint mode's, or one `addTab` made). */
  tabOf(key: string): HTMLButtonElement | undefined { return this.tabs.get(key); }

  /** A tab (by its key) or Apply shown or hidden: a layer offering only some of the tools. */
  setShown(key: string, on: boolean): void {
    const b = key === 'apply' ? this.apply : this.tabs.get(key);
    if (b) b.hidden = !on;
  }

  /** The tab of the tool on lit (a paint mode's, or a caller's own `addTab`). */
  show(t: string): void {
    for (const [k, b] of this.tabs) { const on = k === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }
  }
}
