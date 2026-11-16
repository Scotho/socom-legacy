import { DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector2, Vector3, type Scene } from 'three';
import type { AiLoc } from '@s2u/scene';
import { AI_BRUSH_SIZES, AI_PAINT_KINDS, aiCellKey, aiSoilName, type AiPaintKind } from './aiSoil';
import { aiSoilKind, type AiSoilKind } from './aiMapOverlay';
import { brushCursor, hexOf, sampleCursor } from './paintCursor';
import { PaintToolBar, type PaintTool } from './paintTools';

/**
 * The AI Navigation mode's cell tools (the owner, 2026-11-16: "a similar workflow to the collision paint but for ai
 * navigation tiles", then "Select(default), Paint, Sample ... the apply button ... follow this same pattern for the ai nav
 * mode"; a browser adaptation, FG.R2), as Geometry mode's paintable layers have them (`./paintTools`):
 *
 * - the soil kinds as quick tabs, each with its colour in the AI map overlay (`./aiMapOverlay`): a tab is the active soil
 *   (Walkable and Blocked stand for several of the original's soils, research 200 section 2: their tab opens the soils,
 *   the one chosen shown on it, as the collision's Climbable shows its flag);
 * - Select: a click takes the cells under the pointer (`size` across), a drag sweeps more in; Shift adds, Ctrl takes out;
 *   Apply lays the active soil on them (one edit);
 * - Paint: a click or a drag lays the active soil on the cells it passes (one edit a stroke); Shift+click samples;
 * - Sample: a click takes the cell's soil as the active one, then the mode before it;
 * - Esc: Paint or Sample back to Select; in Select, the selection let go.
 */

export interface AiPaintDeps {
  doc: Document;
  /** The viewport's pointer surface. */
  input: HTMLElement;
  scene: Scene;
  say(text: string, warn?: boolean): void;
  /** Whether the mode is on (the tools answer the pointer only then). */
  active(): boolean;
  /** The stored cell under viewport point `ndc` and its soil as the layout has it, or null off the grid. */
  cellAt(ndc: Vector2): { loc: AiLoc; soil: number } | null;
  /** The brush's cells about `loc` (`aiBrushCells`), each with where its tile is drawn (its centre on its floor). */
  brushCells(loc: AiLoc, size: number): { loc: AiLoc; at: [number, number, number]; size: [number, number] }[];
  /** A cell painted `soil` (drawn at once; the layout holds it). False when it already was. */
  paint(loc: AiLoc, soil: number): boolean;
  /** A stroke or an Apply over: its cells one edit (one undo step). */
  commit(cells: number, label: string): void;
}

type Cell = { loc: AiLoc; at: [number, number, number]; size: [number, number] };

/** The selection's colour: the editor's own (Geometry mode's `HIGHLIGHT`). */
const SELECTED = 0xffa630;

export class AiPaintTool {
  /** The active soil kind, and each kind's soil chosen (its menu's; its first by default). */
  private kind: AiSoilKind = AI_PAINT_KINDS[0]!.kind;
  private readonly soilOf = new Map<AiSoilKind, number>(AI_PAINT_KINDS.map((k) => [k.kind, k.soils[0]!]));
  private size: number = AI_BRUSH_SIZES[0];
  private tool: PaintTool = 'select';
  private toolBeforeSample: 'select' | 'paint' = 'select';
  private shiftHeld = false;
  private readonly tabs = new Map<AiSoilKind, HTMLButtonElement>();
  private readonly soilLabels = new Map<AiSoilKind, HTMLElement>();
  private readonly sizeTabs = new Map<number, HTMLButtonElement>();
  private readonly toolBar: PaintToolBar;
  private menu: HTMLElement | null = null;
  private menuAway: ((e: Event) => void) | null = null;
  private stroke: { pointerId: number; done: Set<string>; cells: number } | null = null;
  /** A Select press: what it does to the cells it passes (Shift adds, Ctrl takes out, else a fresh selection). */
  private picking: { pointerId: number; op: 'add' | 'remove' } | null = null;
  private readonly selected = new Map<string, Cell>();
  private selectedMesh: InstancedMesh | null = null;
  private tip: HTMLElement | null = null;
  private hoverMesh: InstancedMesh | null = null;
  private readonly tileGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly hoverMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: DoubleSide });
  private readonly selectedMaterial = new MeshBasicMaterial({ color: SELECTED, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: DoubleSide });
  private lastPointer: { x: number; y: number; ndc: Vector2 } | null = null;
  /** The soil tabs (`Soil`), the brush's size (`Size`) and the modes with Apply (`Tool`), for the mode's toolbar. */
  readonly soilRow: HTMLElement;
  readonly sizeRow: HTMLElement;
  readonly toolRow: HTMLElement;

  constructor(private readonly deps: AiPaintDeps) {
    const { doc, input } = deps;
    this.toolBar = new PaintToolBar(doc, {
      onTool: (t) => this.setTool(t),
      onApply: () => this.applySelected(),
      titles: {
        select: 'Select: click AI cells (the size across), drag to sweep more in; Shift adds, Ctrl takes out (Esc)',
        paint: 'Paint: click or drag over the AI cells to lay the active soil; Shift+click samples',
        sample: 'Sample: click an AI cell to take its soil as the active one',
        apply: 'Apply the active soil to the selected AI cells',
      },
    });
    this.toolRow = this.toolBar.row;
    this.soilRow = doc.createElement('div');
    this.soilRow.className = 'fx-asset-tabs fx-geo-layer-tabs';
    this.soilRow.setAttribute('role', 'tablist');
    this.soilRow.setAttribute('aria-label', 'AI soil');
    for (const k of AI_PAINT_KINDS) this.soilRow.append(this.tabOf(k));
    this.sizeRow = doc.createElement('div');
    this.sizeRow.className = 'fx-asset-tabs fx-geo-layer-tabs';
    this.sizeRow.setAttribute('role', 'tablist');
    this.sizeRow.setAttribute('aria-label', 'Brush size');
    for (const n of AI_BRUSH_SIZES) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'fx-asset-tab';
      b.setAttribute('role', 'tab');
      b.textContent = String(n);
      b.title = `${n} by ${n} cell${n === 1 ? '' : 's'} at a time (Select and Paint)`;
      b.addEventListener('click', () => { this.size = n; this.ui(); this.hover(); b.blur(); });
      this.sizeTabs.set(n, b);
      this.sizeRow.append(b);
    }
    input.addEventListener('pointerdown', (e) => this.onDown(e), true);
    input.addEventListener('pointermove', (e) => this.onMove(e), true);
    input.addEventListener('pointerup', (e) => this.onUp(e), true);
    input.addEventListener('pointercancel', () => { this.endStroke(); this.picking = null; });
    input.addEventListener('pointerleave', () => { this.lastPointer = null; this.hover(); });
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.setShift(true);
      if (!deps.active() || e.key !== 'Escape' || this.menu) return;
      if (this.tool === 'select' && !this.selected.size) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.tool !== 'select') this.setTool('select'); else this.clearSelection();
    }, true);
    doc.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.setShift(false); }, true);
    doc.defaultView?.addEventListener('blur', () => this.setShift(false));
    this.ui();
  }

  /** The mode left: Select again, the selection let go, the tip and the hover gone. */
  leave(): void {
    this.endStroke();
    this.picking = null;
    this.closeMenu();
    this.tool = 'select';
    this.clearSelection();
    this.lastPointer = null;
    this.hover();
    this.ui();
  }

  /** The tools as they stand (a test instrument reads them). */
  painting(): { kind: AiSoilKind; soil: number; size: number; tool: PaintTool; selected: number } {
    return { kind: this.kind, soil: this.soilOf.get(this.kind)!, size: this.size, tool: this.tool, selected: this.selected.size };
  }

  private tabOf(k: AiPaintKind): HTMLButtonElement {
    const doc = this.deps.doc;
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'fx-asset-tab';
    b.setAttribute('role', 'tab');
    b.dataset['aiKind'] = k.kind;
    const sw = doc.createElement('span');
    sw.className = 'fx-type-swatch';
    sw.style.background = hexOf(k.colour);
    const word = doc.createElement('span');
    word.textContent = k.label;
    b.append(sw, word);
    if (k.soils.length > 1) {
      const soil = doc.createElement('span');
      soil.className = 'fx-climb-flag';
      const caret = doc.createElement('span');
      caret.className = 'fx-climb-caret';
      caret.textContent = '▾';
      b.append(soil, caret);
      this.soilLabels.set(k.kind, soil);
      b.setAttribute('aria-haspopup', 'menu');
      b.title = `${k.label}: ${k.note}. Click to choose the soil (${k.soils.map(aiSoilName).join(', ')}); Paint or Apply lays it`;
      b.addEventListener('click', () => { this.toggleMenu(k, b); b.blur(); });
    } else {
      b.title = `${k.label} (${aiSoilName(k.soils[0]!)}): ${k.note}. The active soil; Paint or Apply lays it`;
      b.addEventListener('click', () => { this.pickKind(k.kind); b.blur(); });
    }
    this.tabs.set(k.kind, b);
    return b;
  }

  /** A kind's soils under its tab (placed fixed under it: the toolbar may clip what hangs out); a pick is the active soil. */
  private toggleMenu(k: AiPaintKind, tab: HTMLElement): void {
    if (this.menu) { this.closeMenu(); return; }
    const doc = this.deps.doc;
    const menu = doc.createElement('div');
    menu.className = 'fx-climb-menu';
    menu.setAttribute('role', 'menu');
    for (const s of k.soils) {
      const on = this.kind === k.kind && this.soilOf.get(k.kind) === s;
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `fx-climb-item${on ? ' is-on' : ''}`;
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(on));
      b.textContent = `${s} · ${aiSoilName(s)}`;
      b.addEventListener('click', () => { this.closeMenu(); this.soilOf.set(k.kind, s); this.pickKind(k.kind); });
      menu.append(b);
    }
    const r = tab.getBoundingClientRect();
    menu.style.left = `${Math.round(r.left)}px`;
    menu.style.top = `${Math.round(r.bottom + 4)}px`;
    doc.body.append(menu);
    this.menu = menu;
    const away = (e: Event): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menu.contains(e.target as Node) && !tab.contains(e.target as Node)) {
        this.closeMenu();
        if (e instanceof KeyboardEvent) { e.stopImmediatePropagation(); e.preventDefault(); }
      }
    };
    this.menuAway = away;
    doc.addEventListener('pointerdown', away, true);
    doc.addEventListener('keydown', away, true);
  }
  private closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
    if (this.menuAway) {
      this.deps.doc.removeEventListener('pointerdown', this.menuAway, true);
      this.deps.doc.removeEventListener('keydown', this.menuAway, true);
      this.menuAway = null;
    }
  }

  private kindLabel(): string { return AI_PAINT_KINDS.find((x) => x.kind === this.kind)!.label.toLowerCase(); }
  private soilNow(): number { return this.soilOf.get(this.kind)!; }

  /** A kind's tab (or a soil of its menu): the active soil, what Paint and Apply lay; the mode left as it is. */
  private pickKind(kind: AiSoilKind): void {
    this.kind = kind;
    this.ui();
    this.hover();
    this.deps.say(`AI soil: ${this.kindLabel()} (${aiSoilName(this.soilNow())})${this.tool === 'paint' ? '' : ' -- Apply lays it on the selected cells; Paint lays it as you click'}`);
  }

  /** The mode (`./paintTools`): Select, Paint or Sample. */
  private setTool(t: PaintTool): void {
    if (t === this.tool) { this.ui(); return; }
    this.endStroke();
    this.picking = null;
    if (t === 'sample') this.toolBeforeSample = this.tool === 'paint' ? 'paint' : 'select';
    this.tool = t;
    this.ui();
    this.hover();
    if (t === 'paint') this.deps.say(`Paint ${this.kindLabel()} (${aiSoilName(this.soilNow())}): click or drag over the AI cells; Shift+click samples; Esc selects`);
    else if (t === 'sample') this.deps.say('Sample: click an AI cell to take its soil; Esc selects');
  }

  private setShift(on: boolean): void {
    if (on === this.shiftHeld) return;
    this.shiftHeld = on;
    if (this.tool === 'paint' && this.deps.active()) { this.ui(); this.hover(); }
  }

  /** The sampler's cursor and hover: the Sample mode, or Shift held while painting. */
  private sampleNow(): boolean { return this.tool === 'sample' || (this.tool === 'paint' && this.shiftHeld); }

  private colourNow(): number { return AI_PAINT_KINDS.find((k) => k.kind === this.kind)!.colour; }

  /** The tabs, the modes and the cursor as they stand: the active kind's tab lit, each menu kind's soil on it, the size's. */
  private ui(): void {
    for (const [kind, b] of this.tabs) { const on = this.kind === kind; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }
    for (const [kind, l] of this.soilLabels) l.textContent = aiSoilName(this.soilOf.get(kind)!);
    for (const [n, b] of this.sizeTabs) { const on = this.size === n; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }
    this.toolBar.show(this.tool);
    if (!this.deps.active()) { this.deps.input.style.cursor = ''; return; }
    this.deps.input.style.cursor = this.sampleNow() ? sampleCursor() : this.tool === 'paint' ? brushCursor(this.colourNow()) : '';
  }

  private ndcOf(e: PointerEvent): Vector2 {
    const r = this.deps.input.getBoundingClientRect();
    return new Vector2(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1);
  }

  private onDown(e: PointerEvent): void {
    // The camera's own (Alt orbits, the right button looks) left to it; a left press in the mode is the tools' alone.
    if (!this.deps.active() || e.button !== 0 || e.altKey) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const ndc = this.ndcOf(e);
    if (this.tool === 'sample') { if (this.sampleAt(ndc)) this.setTool(this.toolBeforeSample); return; }
    if (this.tool === 'paint' && e.shiftKey) { this.sampleAt(ndc); return; }   // Shift+click: a sample, the brush kept
    try { this.deps.input.setPointerCapture(e.pointerId); } catch { /* still heard on the surface */ }
    if (this.tool === 'paint') {
      this.stroke = { pointerId: e.pointerId, done: new Set(), cells: 0 };
      this.paintAt(ndc);
      return;
    }
    // Select: Shift adds, Ctrl takes out, a plain press starts afresh.
    const op = e.ctrlKey || e.metaKey ? 'remove' : 'add';
    if (!e.shiftKey && op === 'add') this.selected.clear();
    this.picking = { pointerId: e.pointerId, op };
    this.selectAt(ndc);
  }

  private onMove(e: PointerEvent): void {
    if (!this.deps.active()) return;
    this.lastPointer = { x: e.clientX, y: e.clientY, ndc: this.ndcOf(e) };
    this.setShift(e.shiftKey);
    if (this.stroke && this.stroke.pointerId === e.pointerId) { this.paintAt(this.lastPointer.ndc); e.stopImmediatePropagation(); }
    else if (this.picking && this.picking.pointerId === e.pointerId) { this.selectAt(this.lastPointer.ndc); e.stopImmediatePropagation(); }
    this.hover();
  }

  private onUp(e: PointerEvent): void {
    const mine = (this.stroke?.pointerId ?? this.picking?.pointerId) === e.pointerId;
    if (!mine) return;
    e.stopImmediatePropagation();
    try { this.deps.input.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (this.picking) {
      this.picking = null;
      const n = this.selected.size;
      this.deps.say(n ? `${n} AI cell${n === 1 ? '' : 's'} selected: Apply lays ${this.kindLabel()} (${aiSoilName(this.soilNow())}) on them` : 'No AI cells selected');
    }
    this.endStroke();
  }

  private paintAt(ndc: Vector2): void {
    const st = this.stroke;
    if (!st) return;
    const hit = this.deps.cellAt(ndc);
    if (!hit) return;
    const soil = this.soilNow();
    for (const c of this.deps.brushCells(hit.loc, this.size)) {
      const key = aiCellKey(c.loc);
      if (st.done.has(key)) continue;
      st.done.add(key);
      if (this.deps.paint(c.loc, soil)) st.cells++;
    }
  }

  /** The cells under `ndc` (the size across) into the selection, or out of it. */
  private selectAt(ndc: Vector2): void {
    const p = this.picking;
    const hit = p ? this.deps.cellAt(ndc) : null;
    if (!p || !hit) return;
    let changed = false;
    for (const c of this.deps.brushCells(hit.loc, this.size)) {
      const key = aiCellKey(c.loc);
      if (p.op === 'remove') changed = this.selected.delete(key) || changed;
      else if (!this.selected.has(key)) { this.selected.set(key, c); changed = true; }
    }
    if (changed) this.drawSelected();
  }

  private clearSelection(): void {
    this.selected.clear();
    this.drawSelected();
  }

  /** The selected cells, lit in the selection's colour. */
  private drawSelected(): void {
    if (this.selectedMesh) { this.selectedMesh.removeFromParent(); this.selectedMesh.dispose(); this.selectedMesh = null; }
    const cells = [...this.selected.values()];
    if (!cells.length) return;
    this.selectedMesh = this.tiles(cells, this.selectedMaterial, 3, 'forge ai selected cells');
  }

  private tiles(cells: readonly Cell[], material: MeshBasicMaterial, order: number, name: string): InstancedMesh {
    const mesh = new InstancedMesh(this.tileGeometry, material, cells.length);
    const m = new Matrix4(), at = new Vector3(), size = new Vector3(), turn = new Quaternion();
    cells.forEach((c, i) => mesh.setMatrixAt(i, m.compose(at.set(c.at[0], c.at[1] + 0.8, c.at[2]), turn, size.set(c.size[0] * 0.92, 1, c.size[1] * 0.92))));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.name = name;
    this.deps.scene.add(mesh);
    return mesh;
  }

  /** Apply: the active soil on the selected cells, one edit (the selection kept, to lay another on). */
  private applySelected(): void {
    if (!this.selected.size) { this.deps.say('Select AI cells first (Select, then click or drag over them)', true); return; }
    const soil = this.soilNow();
    let cells = 0;
    for (const c of this.selected.values()) if (this.deps.paint(c.loc, soil)) cells++;
    if (!cells) { this.deps.say(`The selected cells are ${aiSoilName(soil)} already`); return; }
    this.deps.commit(cells, `${cells} AI cell${cells === 1 ? '' : 's'} set ${this.kindLabel()} (${aiSoilName(soil)})`);
    this.hover();
  }

  /** The sampler's click: the cell's soil as the active one (its kind's tab, its soil in that kind). Whether it took one. */
  private sampleAt(ndc: Vector2): boolean {
    const hit = this.deps.cellAt(ndc);
    if (!hit) { this.deps.say('Sample: no AI cell there', true); return false; }
    const k = AI_PAINT_KINDS.find((x) => x.soils.includes(hit.soil));
    if (!k) { this.deps.say(`Sample: soil ${hit.soil} (${aiSoilName(hit.soil)}) is none of the tabs' soils`, true); return false; }
    this.soilOf.set(k.kind, hit.soil);
    this.kind = k.kind;
    this.ui();
    this.hover();
    this.deps.say(`Sampled ${aiSoilName(hit.soil)} (${k.label.toLowerCase()})`);
    return true;
  }

  /** A stroke over: one edit for all it painted (the layout already holds them), nothing for none. */
  private endStroke(): void {
    const st = this.stroke;
    this.stroke = null;
    if (!st || !st.cells) return;
    this.deps.commit(st.cells, `${st.cells} AI cell${st.cells === 1 ? '' : 's'} painted ${this.kindLabel()} (${aiSoilName(this.soilNow())})`);
  }

  /**
   * The cells under the pointer: the brush's in the kind's colour while painting, the size's lit white in Select, the one
   * cell while sampling; and the tip beside it -- the cell's soil, and while painting what a click makes it.
   */
  private hover(): void {
    const p = this.lastPointer;
    const hit = p && this.deps.active() ? this.deps.cellAt(p.ndc) : null;
    const sampling = this.sampleNow();
    const cells = hit ? this.deps.brushCells(hit.loc, sampling ? 1 : this.size) : [];
    if (this.hoverMesh) { this.hoverMesh.removeFromParent(); this.hoverMesh.dispose(); this.hoverMesh = null; }
    if (cells.length) {
      const painting = this.tool === 'paint' && !sampling;
      this.hoverMaterial.color.setHex(painting ? this.colourNow() : 0xffffff);
      this.hoverMaterial.opacity = painting ? 0.85 : 0.45;
      this.hoverMesh = this.tiles(cells, this.hoverMaterial, 4, 'forge ai paint hover');
    }
    let text: string | null = null;
    if (hit) {
      const now = `${aiSoilName(hit.soil)} (${aiSoilKind(hit.soil)})`;
      if (sampling) text = `Sample: ${now}`;
      else if (this.tool === 'paint' && this.soilNow() !== hit.soil) text = `${aiSoilName(hit.soil)} → ${aiSoilName(this.soilNow())}`;
      else text = now;
    }
    this.showTip(text);
  }

  private showTip(text: string | null): void {
    const at = this.lastPointer;
    if (!text || !at) { if (this.tip) this.tip.hidden = true; return; }
    if (!this.tip) {
      this.tip = this.deps.doc.createElement('div');
      this.tip.className = 'fx-paint-tip';
      this.deps.doc.body.append(this.tip);
    }
    this.tip.hidden = false;
    this.tip.textContent = text;
    this.tip.style.left = `${Math.round(at.x + 18)}px`;
    this.tip.style.top = `${Math.round(at.y + 18)}px`;
  }
}
