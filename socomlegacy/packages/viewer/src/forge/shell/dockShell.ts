import type { MenuItem } from '../padMenu';
import { panelContext, type ForgePageContext, type ForgeStore } from './context';
import { ForgePanelError, PANELS_MENU_HEADING, type ForgeDock, type ForgePanel, type ForgePanelInstance, type ForgeShellPage } from './panel';

/**
 * The Forge's docking workbench (the owner, 2026-11-11: "I want to be able to drag any panel to any other panel, but each
 * panel allows its own top/left/center/right/bottom section ... each panel can be split into many sub panels. Basically
 * how Visual Studio works"; a browser adaptation, FG.R2: the editor's own layout, nothing of the game's).
 *
 * The area between the toolbar and the status bar is one tree (`DockNode`): a split lays its children side by side
 * (`row`) or one over another (`column`) by their shares (`sizes`, dragged at the sashes between them); a group is a tab
 * strip over its panels, the active one drawn. A tab dragged onto a group docks it there -- the group's left, right, top or
 * bottom edge splits it, its middle adds a tab -- or onto the workbench's own edge, beside everything. The tree, the
 * closed panels' places and the sizes are kept per viewer (one key). The viewport is a panel as the rest (it cannot be
 * closed or moved, and its group draws no strip while it is alone). Docks off, Walk or a match: the viewport's alone.
 *
 * The registry's contract is the shell's (`./panel` `ForgeShellPage`): mount, visibility, frame, the START menu's Panels
 * rows, the pad's focus and the workspace slot, as before.
 */
export type DockNode =
  | { kind: 'split'; dir: 'row' | 'column'; sizes: number[]; children: DockNode[] }
  | { kind: 'group'; id: string; tabs: string[]; active: string | null };
type DockGroup = Extract<DockNode, { kind: 'group' }>;
type DockSplit = Extract<DockNode, { kind: 'split' }>;
export type DockZoneDrop = 'left' | 'right' | 'top' | 'bottom' | 'center';

export interface DockShellOptions {
  doc: Document;
  /** The workbench element the tree is drawn in. */
  workbench: HTMLElement;
  /** The workspace slot (`./panel` `createWorkspaceDock`), for a panel of dock `workspace`. */
  workspace?: HTMLElement;
  context: ForgePageContext;
  store: ForgeStore;
  /** The key the tree is kept under. */
  storeKey: string;
  /** The default tree, and each dock's home group (where a panel of that dock not in the tree goes). */
  defaults: { root: DockNode; homes: Partial<Record<ForgeDock, string>> };
  /** Whether a panel's dock is drawn (docks off, Walk, a match); every one when absent. */
  dockShown?(dock: ForgeDock): boolean;
  /** Only the viewport drawn now (docks off, Walk, a match): the tree waits. */
  maximized?(): boolean;
  /** The panel the viewport is (drawn alone while `maximized`). */
  viewportId: string;
  /** The docks shown again (a reveal while maximized). */
  showDocks?(): void;
  /** A tab's icon (its SVG markup) by its key (`dockTabKeyOf`), drawn left of its word; none, its word alone. */
  tabIcon?(key: string): string;
}

interface Mounted { panel: ForgePanel; host: HTMLElement; instance: ForgePanelInstance; abort: AbortController; shown: boolean }

/** The smallest share a pane keeps at a sash (px). */
const MIN_PANE_PX = 80;
/** How near the workbench's own edge a drop docks beside everything (px). */
const ROOT_EDGE_PX = 26;
/** How far into a group its edge zones reach (a share of its width or height). */
const EDGE_SHARE = 0.28;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
let groupSeq = 0;
const newGroupId = (): string => `g-${Date.now().toString(36)}-${(groupSeq++).toString(36)}`;

/** Whether `v` is a tree as the key may hold one. */
function nodeOk(v: unknown, depth = 0): v is DockNode {
  if (!v || typeof v !== 'object' || depth > 24) return false;
  const n = v as Record<string, unknown>;
  if (n['kind'] === 'group') return typeof n['id'] === 'string' && Array.isArray(n['tabs']) && n['tabs'].every((t) => typeof t === 'string') && (n['active'] === null || typeof n['active'] === 'string');
  if (n['kind'] !== 'split' || (n['dir'] !== 'row' && n['dir'] !== 'column') || !Array.isArray(n['children']) || !Array.isArray(n['sizes'])) return false;
  const kids = n['children'] as unknown[], sizes = n['sizes'] as unknown[];
  return kids.length > 0 && kids.length === sizes.length && sizes.every((s) => typeof s === 'number' && s > 0) && kids.every((k) => nodeOk(k, depth + 1));
}
/** Every group of a tree. */
function groupsOf(n: DockNode, out: DockGroup[] = []): DockGroup[] {
  if (n.kind === 'group') out.push(n); else for (const c of n.children) groupsOf(c, out);
  return out;
}
/** A node's parent split and its place there; null for the root. */
function parentOf(root: DockNode, target: DockNode): { split: DockSplit; at: number } | null {
  if (root.kind === 'group') return null;
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i]!;
    if (c === target) return { split: root, at: i };
    const deeper = parentOf(c, target);
    if (deeper) return deeper;
  }
  return null;
}
/** The tree tidied: empty groups out, a split of one child its child, a split in a split of its own direction merged. */
function normalize(n: DockNode): DockNode | null {
  if (n.kind === 'group') return n.tabs.length ? n : null;
  const kids: DockNode[] = [], sizes: number[] = [];
  n.children.forEach((c, i) => {
    const k = normalize(c);
    if (!k) return;
    const s = n.sizes[i] ?? 1;
    if (k.kind === 'split' && k.dir === n.dir) {
      const total = k.sizes.reduce((a, b) => a + b, 0) || 1;
      k.children.forEach((cc, j) => { kids.push(cc); sizes.push((s * k.sizes[j]!) / total); });
    } else { kids.push(k); sizes.push(s); }
  });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0]!;
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return { kind: 'split', dir: n.dir, children: kids, sizes: sizes.map((s) => s / total) };
}

/** A drop's place: a group's edge or middle (`before` a tab of its strip, `bar` where that is drawn), or the workbench's edge. */
type Drop = { group: DockGroup | null; zone: DockZoneDrop; before?: string; bar?: { x: number; top: number; height: number } };
/** A panel's tab (the unit docked and dragged): its `tab` label slugged, else its own id. Its sections share it. */
const slug = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tab';
export const dockTabKeyOf = (p: Pick<ForgePanel, 'id' | 'tab'>): string => (p.tab ? slug(p.tab) : p.id);

export function createDockShell(options: DockShellOptions): ForgeShellPage {
  const { doc, workbench, store, storeKey, context } = options;
  const mounted = new Map<string, Mounted>();
  let disposed = false;
  /** The viewport's tab key (its panel's). */
  let viewportKey = options.viewportId;
  /** The tree, each closed tab's last group (its way back), and each section's open state (the viewer's own). */
  const loaded = ((): { root: DockNode; closed: Record<string, string>; open: Record<string, boolean> } | null => {
    try {
      const raw = JSON.parse(store.get(storeKey) ?? 'null') as { v?: unknown; root?: unknown; closed?: unknown; open?: unknown } | null;
      if (!raw || raw.v !== 2 || !nodeOk(raw.root)) return null;
      const rec = <T>(v: unknown, ok: (x: unknown) => boolean): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => ok(x))) as Record<string, T> : {});
      return { root: raw.root, closed: rec<string>(raw.closed, (x) => typeof x === 'string'), open: rec<boolean>(raw.open, (x) => typeof x === 'boolean') };
    } catch { return null; }
  })();
  let root: DockNode = loaded?.root ?? clone(options.defaults.root);
  const closed: Record<string, string> = loaded?.closed ?? {};
  const open: Record<string, boolean> = loaded?.open ?? {};
  const save = (): void => { store.set(storeKey, JSON.stringify({ v: 2, root, closed, open })); };

  /* ---------- the workspace slot (as the zone shell's) ---------- */
  let workspaceOpen: string | null = null;
  const workspaceParts = (): { root: HTMLElement; body: HTMLElement; crumb: HTMLElement; title: HTMLElement | null; back: HTMLElement } | null => {
    const w = options.workspace;
    const body = w?.querySelector<HTMLElement>('.fx-workspace-body');
    const crumb = w?.querySelector<HTMLElement>('.fx-workspace-crumb');
    const back = w?.querySelector<HTMLElement>('[data-forge-workspace-back]');
    const title = w?.querySelector<HTMLElement>('[data-forge-workspace-title]') ?? null;
    return w && body && crumb && back ? { root: w, body, crumb, title, back } : null;
  };
  const workspace = workspaceParts();
  const closeWorkspace = (): boolean => {
    if (!workspace || workspaceOpen === null) return false;
    const m = mounted.get(workspaceOpen);
    if (m) m.host.hidden = true;
    workspaceOpen = null;
    workspace.root.hidden = true;
    workspace.crumb.textContent = '';
    if (workspace.title) workspace.title.textContent = '';
    syncShown();
    return true;
  };
  const onBack = (): void => { closeWorkspace(); };
  const onWorkspaceKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && closeWorkspace()) { e.preventDefault(); e.stopPropagation(); } };
  workspace?.back.addEventListener('click', onBack);
  workspace?.root.addEventListener('keydown', onWorkspaceKey);

  /* ---------- the tree's questions ---------- */
  const available = (p: ForgePanel): boolean => !p.availableIn || p.availableIn.includes(context.state().surface);
  const sorted = (): Mounted[] => [...mounted.values()].sort((a, b) => (a.panel.order - b.panel.order) || a.panel.id.localeCompare(b.panel.id));
  /** A tab's sections now: its panels registered and available, in their order. */
  const sectionsOf = (key: string): Mounted[] => sorted().filter((m) => m.panel.dock !== 'workspace' && dockTabKeyOf(m.panel) === key && available(m.panel));
  /** A group's tabs drawn now: those with a section. */
  const liveTabs = (g: DockGroup): string[] => g.tabs.filter((k) => !closed[k] && sectionsOf(k).length > 0);   // a closed one kept, not drawn
  const groupOf = (key: string): DockGroup | undefined => groupsOf(root).find((g) => g.tabs.includes(key));
  const activeOf = (g: DockGroup): string | null => { const live = liveTabs(g); return live.find((k) => k === g.active) ?? live[0] ?? null; };
  const maximized = (): boolean => options.maximized?.() ?? false;
  /** A section open: the viewer's choice, else its panel's default; a tab of one section always. */
  const sectionOpen = (m: Mounted): boolean => sectionsOf(dockTabKeyOf(m.panel)).length <= 1 || (open[m.panel.id] ?? m.panel.defaultOpen);
  /** Whether a panel is drawn now: its tab its group's active one, its section open (maximized: the viewport alone). */
  const drawnNow = (m: Mounted): boolean => {
    const key = dockTabKeyOf(m.panel);
    if (maximized()) return key === viewportKey;
    const g = groupOf(key);
    return !!g && activeOf(g) === key && sectionOpen(m);
  };
  const shownNow = (m: Mounted): boolean => {
    if (doc.visibilityState === 'hidden' || !available(m.panel)) return false;
    if (options.dockShown && !options.dockShown(m.panel.dock)) return false;
    if (m.panel.dock === 'workspace') return workspaceOpen === m.panel.id;
    return drawnNow(m);
  };
  const setShown = (m: Mounted, shown: boolean): void => { if (m.shown !== shown) { m.shown = shown; m.instance.visibility?.(shown); } };
  const syncShown = (): void => { for (const m of mounted.values()) setShown(m, shownNow(m)); };
  doc.addEventListener('visibilitychange', syncShown);

  /* ---------- drawing ---------- */
  /** Where the tabs not drawn wait (their markup and state kept). */
  const stash = doc.createElement('div');
  stash.className = 'fx-dg-stash';
  stash.hidden = true;
  const overlay = doc.createElement('div');
  overlay.className = 'fx-dg-preview';
  overlay.hidden = true;
  const canvas = doc.createElement('div');
  canvas.className = 'fx-dg-root';
  /**
   * The docking guides (the owner, 2026-11-11: "show the labels of where it can be dropped"): over the group under the
   * drag, a compass of its five places, each named (Top, Left, Tab, Right, Bottom), the one a drop takes lit; along the
   * workbench's edges, its four places beside everything, named too.
   */
  const ZONE_WORDS: Record<DockZoneDrop, string> = { top: 'Top', left: 'Left', center: 'Tab', right: 'Right', bottom: 'Bottom' };
  const compass = doc.createElement('div');
  compass.className = 'fx-dg-compass';
  compass.hidden = true;
  const targets = new Map<DockZoneDrop, HTMLElement>();
  for (const zone of ['top', 'left', 'center', 'right', 'bottom'] as const) {
    const t = doc.createElement('div');
    t.className = `fx-dg-target fx-dg-target--${zone}`;
    t.dataset['zone'] = zone;
    t.textContent = ZONE_WORDS[zone];
    targets.set(zone, t);
    compass.append(t);
  }
  const edges = new Map<DockZoneDrop, HTMLElement>();
  const edgeLayer = doc.createElement('div');
  edgeLayer.className = 'fx-dg-edges';
  for (const zone of ['left', 'right', 'top', 'bottom'] as const) {
    const e = doc.createElement('div');
    e.className = `fx-dg-edge fx-dg-edge--${zone}`;
    e.textContent = zone === 'top' ? 'Dock above everything' : zone === 'bottom' ? 'Dock below everything' : `Dock ${zone} of everything`;
    edges.set(zone, e);
    edgeLayer.append(e);
  }
  /** The group the compass stands over now. */
  let compassGroup: DockGroup | null = null;
  workbench.append(canvas, overlay, compass, edgeLayer, stash);
  let drawnKey = '';
  /** Whether a node has something to draw now (a tab with a section). */
  const liveNode = (n: DockNode): boolean => (n.kind === 'group' ? liveTabs(n).length > 0 : n.children.some(liveNode));
  /** Each group's element as drawn, for a drop's hit test. */
  const elementOf = new Map<DockNode, HTMLElement>();
  const render = (): void => {
    if (disposed) return;
    for (const m of mounted.values()) if (m.panel.dock !== 'workspace') stash.append(m.host);
    canvas.replaceChildren();
    elementOf.clear();
    if (maximized()) {
      const alone = doc.createElement('div');
      alone.className = 'fx-dg-group fx-dg-viewport fx-dg-alone';
      alone.append(tabBody(viewportKey));
      canvas.append(alone);
    } else if (liveNode(root)) canvas.append(draw(root));
    syncShown();
  };
  /** A node drawn: a split's live children (one alone drawn as itself) with sashes between, a group its strip and body. */
  const draw = (n: DockNode): HTMLElement => {
    if (n.kind === 'group') return drawGroup(n);
    const kids = n.children.map((c, i) => [c, i] as const).filter(([c]) => liveNode(c));
    if (kids.length === 1) return draw(kids[0]![0]);
    const el = doc.createElement('div');
    el.className = `fx-dg-split fx-dg-${n.dir}`;
    elementOf.set(n, el);
    // The drawn children's shares made whole: a share is a fraction of the split, and flex grows its items by only the
    // sum of their grows when that sum is under 1 -- a hidden child's (a closed tab's group) left as an empty strip.
    const liveTotal = kids.reduce((sum, [, i]) => sum + (n.sizes[i] ?? 0), 0) || 1;
    kids.forEach(([c, i], k) => {
      if (k > 0) el.append(sash(n, kids[k - 1]![1], i, kids.map(([, x]) => x)));
      const childEl = draw(c);
      childEl.style.flex = `${(n.sizes[i] ?? 0) / liveTotal} 1 0`;
      el.append(childEl);
    });
    return el;
  };
  /** A sash between a split's children `ia` and `ib` (`drawn` its live ones): its drag moves the share between the two. */
  const sash = (split: DockSplit, ia: number, ib: number, drawn: readonly number[]): HTMLElement => {
    const el = doc.createElement('div');
    el.className = 'fx-dg-sash';
    el.setAttribute('role', 'separator');
    el.setAttribute('aria-orientation', split.dir === 'row' ? 'vertical' : 'horizontal');
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-resizing');
      const box = el.parentElement!.getBoundingClientRect();
      const length = Math.max(1, split.dir === 'row' ? box.width : box.height);
      const total = drawn.reduce((a, x) => a + split.sizes[x]!, 0) || 1;
      const startA = split.sizes[ia]!, startB = split.sizes[ib]!;
      const pair = startA + startB;
      const from = split.dir === 'row' ? e.clientX : e.clientY;
      const min = Math.min(pair / 2, (MIN_PANE_PX / length) * total);
      const before = el.previousElementSibling as HTMLElement | null, after = el.nextElementSibling as HTMLElement | null;
      const move = (ev: PointerEvent): void => {
        const d = (((split.dir === 'row' ? ev.clientX : ev.clientY) - from) / length) * total;
        const na = Math.min(pair - min, Math.max(min, startA + d));
        split.sizes[ia] = na;
        split.sizes[ib] = pair - na;
        // Over the drawn children's total, as `draw` sets them (the shares made whole).
        if (before) before.style.flex = `${split.sizes[ia] / total} 1 0`;
        if (after) after.style.flex = `${split.sizes[ib] / total} 1 0`;
      };
      const up = (): void => {
        el.removeEventListener('pointermove', move);
        el.classList.remove('is-resizing');
        save();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up, { once: true });
      el.addEventListener('pointercancel', up, { once: true });
    });
    return el;
  };
  /**
   * A tab's body: its sections stacked as before (each its title, folded or open, the viewer's choice kept) -- a tab of one
   * section draws it alone, no title.
   */
  const tabBody = (key: string): HTMLElement => {
    const body = doc.createElement('div');
    body.className = 'fx-dg-body';
    const sections = sectionsOf(key);
    body.classList.toggle('is-single', sections.length <= 1);
    for (const m of sections) {
      const host = m.host as HTMLDetailsElement;
      const want = sectionOpen(m);
      if (host.open !== want) { setting = true; host.open = want; setting = false; }
      body.append(host);
    }
    return body;
  };
  /** The shell's own change of a section's `open` (its toggle not the viewer's). */
  let setting = false;
  const tabLabel = (key: string): string => { const s = sectionsOf(key); return s.find((m) => m.panel.tab)?.panel.tab ?? s[0]?.panel.title ?? key; };
  const drawGroup = (g: DockGroup): HTMLElement => {
    const el = doc.createElement('div');
    el.className = 'fx-dg-group';
    el.dataset['dockGroup'] = g.id;
    elementOf.set(g, el);
    const live = liveTabs(g);
    const active = activeOf(g);
    // Every group its strip, the viewport's too (its own tabs: the owner, 2026-11-11).
    el.classList.toggle('fx-dg-viewport', live.includes(viewportKey));
    {
      const strip = doc.createElement('div');
      strip.className = 'fx-dg-tabs';
      strip.setAttribute('role', 'tablist');
      strip.setAttribute('aria-label', `${PANELS_MENU_HEADING} · L1 / R1`);
      for (const k of live) strip.append(tabButton(g, k, k === active));
      el.append(strip);
    }
    if (active) el.append(tabBody(active));
    return el;
  };
  const tabButton = (g: DockGroup, key: string, on: boolean): HTMLElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'fx-dg-tab';
    b.setAttribute('role', 'tab');
    b.dataset['forgeTab'] = key;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    const word = doc.createElement('span');
    const label = tabLabel(key);
    word.textContent = label;
    // Its icon left of its word (the owner, 2026-11-11).
    const art = options.tabIcon?.(key) ?? '';
    if (art) { const i = doc.createElement('span'); i.className = 'fx-dg-tab-icon'; i.setAttribute('aria-hidden', 'true'); i.innerHTML = art; b.append(i); }
    b.append(word);
    const sections = sectionsOf(key);
    b.title = `${sections.map((m) => m.panel.title).join(' · ')} · drag to dock it anywhere · L1 / R1 another tab`;
    const movable = sections.every((m) => m.panel.movable !== false);
    b.addEventListener('click', () => { if (!justDragged) activate(g, key); });
    if (movable) b.addEventListener('pointerdown', (e) => startTabDrag(e, key, b));
    // Its close (the owner, 2026-11-11: the toolbar's Window menu opens it again, so a tab closes again): never the
    // viewport's. Its press is its own -- no drag, no activation.
    if (movable) {
      const x = doc.createElement('span');
      x.className = 'fx-dg-tab-close';
      x.textContent = '✕';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', `Close ${label}`);
      x.title = `Close ${label} (Window opens it again)`;
      x.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      x.addEventListener('click', (e) => { e.stopPropagation(); closeTab(key); });
      b.append(x);
    }
    return b;
  };
  /**
   * A tab out of the docks, kept in its place (the owner, 2026-11-11: "it should go back to where it was when it was
   * toggled off"): it stays in its group's tabs, at its index, marked `closed` -- not drawn (`liveTabs`), and a group of
   * closed tabs alone not drawn either (`liveNode`), its split's share kept -- so opening it again (`reveal`) brings it
   * back to that very group, place and size. The group shows another of its tabs meanwhile.
   */
  const closeTab = (key: string): void => {
    const g = groupOf(key);
    if (!g || key === viewportKey || sectionsOf(key).some((m) => m.panel.movable === false)) return;
    closed[key] = g.id;
    if (g.active === key) g.active = liveTabs(g)[0] ?? null;
    save();
    render();
  };
  const activate = (g: DockGroup, key: string): void => {
    if (g.active === key) return;
    g.active = key;
    save();
    render();
    for (const m of sectionsOf(key)) m.instance.update?.();
    focusTab(key);
  };

  /* ---------- a tab dragged and docked ---------- */
  let dragging = false;
  /** A drag just ended: the click its release makes is no tab's press. */
  let justDragged = false;
  const startTabDrag = (e: PointerEvent, key: string, tab: HTMLElement): void => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let ghost: HTMLElement | null = null;
    let drop: Drop | null = null;
    const move = (ev: PointerEvent): void => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ghost = doc.createElement('div');
        ghost.className = 'fx-dg-ghost';
        ghost.textContent = tabLabel(key);
        doc.body.append(ghost);
        dragging = true;
        doc.body.classList.add('fx-dg-dragging');
      }
      ghost.style.left = `${ev.clientX + 12}px`;
      ghost.style.top = `${ev.clientY + 10}px`;
      drop = hitTest(ev.clientX, ev.clientY, key);
      showPreview(drop);
      showGuides(ev.clientX, ev.clientY, drop);
    };
    const up = (): void => {
      tab.removeEventListener('pointermove', move);
      tab.removeEventListener('pointerup', up);
      tab.removeEventListener('pointercancel', cancel);
      ghost?.remove();
      overlay.hidden = true;
      compass.hidden = true;
      compassGroup = null;
      edgeLayer.classList.remove('is-quiet');
      for (const e of edges.values()) e.classList.remove('is-on');
      doc.body.classList.remove('fx-dg-dragging');
      const was = dragging;
      dragging = false;
      if (was) { justDragged = true; setTimeout(() => { justDragged = false; }, 0); }
      if (was && drop) dock(key, drop.group, drop.zone, drop.before);
    };
    const cancel = (): void => { drop = null; up(); };
    tab.setPointerCapture(e.pointerId);
    tab.addEventListener('pointermove', move);
    tab.addEventListener('pointerup', up);
    tab.addEventListener('pointercancel', cancel);
  };
  /**
   * Where a drop at (x, y) docks: beside everything at the workbench's edge; on a group's tab strip, among its tabs before
   * `before` (the owner, 2026-11-11: "make the tabs re-orderable"; `undefined` at the end); else a group's edge or middle.
   */
  const hitTest = (x: number, y: number, key: string): Drop | null => {
    const wb = workbench.getBoundingClientRect();
    if (x < wb.left || x > wb.right || y < wb.top || y > wb.bottom) return null;
    // A tab strip first (the owner, 2026-11-11: "tab re-ordering in the tab area should not show the compass ... only
    // re-order tabs"): a place among its tabs or nothing -- never the workbench's edge (a strip may sit along it) nor a dock.
    for (const g of groupsOf(root)) {
      const strip = elementOf.get(g)?.querySelector<HTMLElement>(':scope > .fx-dg-tabs');
      const sr = strip?.getBoundingClientRect();
      if (!strip || !sr || x < sr.left || x > sr.right || y < sr.top || y > sr.bottom) continue;
      {
        const tabs = [...strip.querySelectorAll<HTMLElement>('.fx-dg-tab')];
        let before: string | undefined, barX = sr.left;
        const last = tabs[tabs.length - 1]?.getBoundingClientRect();
        barX = last ? last.right : sr.left;
        for (const t of tabs) {
          const b = t.getBoundingClientRect();
          if (x < b.left + b.width / 2) { before = t.dataset['forgeTab']; barX = b.left; break; }
        }
        if (before === key) {
          // Before itself: the next one's place, no move.
          return null;
        }
        if (liveTabs(g).length === 1 && g.tabs.includes(key)) return null;
        const after = before === undefined ? tabs[tabs.length - 1]?.dataset['forgeTab'] : tabs[tabs.findIndex((t) => t.dataset['forgeTab'] === before) - 1]?.dataset['forgeTab'];
        if (after === key) return null;                         // right after itself: where it is
        return { group: g, zone: 'center', ...(before !== undefined ? { before } : {}), bar: { x: barX, top: sr.top, height: sr.height } };
      }
    }
    if (x - wb.left < ROOT_EDGE_PX) return { group: null, zone: 'left' };
    if (wb.right - x < ROOT_EDGE_PX) return { group: null, zone: 'right' };
    if (y - wb.top < ROOT_EDGE_PX) return { group: null, zone: 'top' };
    if (wb.bottom - y < ROOT_EDGE_PX) return { group: null, zone: 'bottom' };
    for (const g of groupsOf(root)) {
      const el = elementOf.get(g);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const fx = (x - r.left) / Math.max(1, r.width), fy = (y - r.top) / Math.max(1, r.height);
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
      // Its middle a tab -- the viewport's group too (the owner, 2026-11-11: "the viewport to have its own tab system").
      let zone: DockZoneDrop = 'center';
      if (edge < EDGE_SHARE) zone = edge === fx ? 'left' : edge === 1 - fx ? 'right' : edge === fy ? 'top' : 'bottom';
      // Over one of the compass's targets: that place, exactly.
      if (compassGroup === g && !compass.hidden) {
        for (const [z, t] of targets) {
          if (t.classList.contains('is-off')) continue;
          const b = t.getBoundingClientRect();
          if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) { zone = z; break; }
        }
      }
      if (liveTabs(g).length === 1 && g.tabs.includes(key)) return null;   // its own lone group: nothing to do
      if (zone === 'center' && g.tabs.includes(key)) return null;
      return { group: g, zone };
    }
    return null;
  };
  /** The compass over the group under the drag (none over a tab strip or the workbench's edge), its drop's place lit. */
  const showGuides = (x: number, y: number, drop: Drop | null): void => {
    // Over a tab strip: a reorder only (the owner, 2026-11-11) -- no compass, no edges, the insertion bar alone.
    const overStrip = [...workbench.querySelectorAll<HTMLElement>('.fx-dg-tabs')].some((st) => {
      const b = st.getBoundingClientRect();
      return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    });
    edgeLayer.classList.toggle('is-quiet', overStrip);
    if (overStrip) { compass.hidden = true; compassGroup = null; for (const e of edges.values()) e.classList.remove('is-on'); return; }
    for (const [z, e] of edges) e.classList.toggle('is-on', !!drop && !drop.group && drop.zone === z);
    const over = groupsOf(root).find((g) => {
      const b = elementOf.get(g)?.getBoundingClientRect();
      return !!b && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    });
    if (!over || drop?.bar || (drop && !drop.group)) { compass.hidden = true; compassGroup = null; return; }
    const b = elementOf.get(over)!.getBoundingClientRect();
    const wb = workbench.getBoundingClientRect();
    compassGroup = over;
    compass.style.left = `${b.left - wb.left + b.width / 2}px`;
    compass.style.top = `${b.top - wb.top + b.height / 2}px`;
    // A small group: the compass scaled down to fit it.
    compass.style.setProperty('--fx-dg-compass-scale', String(Math.max(0.5, Math.min(1, (Math.min(b.width, b.height) - 12) / 168))));
    for (const [z, t] of targets) t.classList.toggle('is-on', !!drop && drop.group === over && drop.zone === z);
    compass.hidden = false;
  };
  const showPreview = (drop: Drop | null): void => {
    if (!drop) { overlay.hidden = true; return; }
    const wb = workbench.getBoundingClientRect();
    overlay.classList.toggle('is-bar', !!drop.bar);
    if (drop.bar) {
      overlay.style.left = `${drop.bar.x - wb.left - 1}px`;
      overlay.style.top = `${drop.bar.top - wb.top}px`;
      overlay.style.width = '3px';
      overlay.style.height = `${drop.bar.height}px`;
      overlay.hidden = false;
      return;
    }
    const r = drop.group ? elementOf.get(drop.group)?.getBoundingClientRect() : wb;
    if (!r) { overlay.hidden = true; return; }
    const share = drop.group ? 0.5 : 0.22;
    let left = r.left, top = r.top, w = r.width, h = r.height;
    if (drop.zone === 'left') w *= share;
    if (drop.zone === 'right') { left += w * (1 - share); w *= share; }
    if (drop.zone === 'top') h *= share;
    if (drop.zone === 'bottom') { top += h * (1 - share); h *= share; }
    overlay.style.left = `${left - wb.left}px`;
    overlay.style.top = `${top - wb.top}px`;
    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;
    overlay.hidden = false;
  };
  /** Take a tab out of its group (the group gone, at the next tidy, if it empties); its group's id. */
  const takeOut = (key: string): string | null => {
    const g = groupOf(key);
    if (!g) return null;
    g.tabs = g.tabs.filter((t) => t !== key);
    if (g.active === key) g.active = g.tabs[0] ?? null;
    return g.id;
  };
  /**
   * Dock a tab: into `group`'s middle (a tab), at its edge (the group split, the tab's new group beside it), or with no
   * group at the workbench's edge (beside everything). One step, kept.
   */
  const dock = (key: string, group: DockGroup | null, zone: DockZoneDrop, before?: string): void => {
    takeOut(key);
    const dir: 'row' | 'column' = zone === 'left' || zone === 'right' ? 'row' : 'column';
    const first = zone === 'left' || zone === 'top';
    if (group && zone === 'center') {
      const at = before === undefined ? -1 : group.tabs.indexOf(before);
      if (at < 0) group.tabs.push(key); else group.tabs.splice(at, 0, key);
      group.active = key;
    } else {
      const fresh: DockGroup = { kind: 'group', id: newGroupId(), tabs: [key], active: key };
      if (!group) {
        if (root.kind === 'split' && root.dir === dir) {
          const total = root.sizes.reduce((a, b) => a + b, 0) || 1;
          root.children.splice(first ? 0 : root.children.length, 0, fresh);
          root.sizes.splice(first ? 0 : root.sizes.length, 0, total * 0.22);
        } else root = { kind: 'split', dir, children: first ? [fresh, root] : [root, fresh], sizes: first ? [0.22, 0.78] : [0.78, 0.22] };
      } else {
        const p = parentOf(root, group);
        const share = group.tabs.includes(viewportKey) ? 0.3 : 0.5;
        if (p && p.split.dir === dir) {
          const s = p.split.sizes[p.at]!;
          p.split.sizes[p.at] = s * (1 - share);
          p.split.children.splice(first ? p.at : p.at + 1, 0, fresh);
          p.split.sizes.splice(first ? p.at : p.at + 1, 0, s * share);
        } else {
          const split: DockSplit = { kind: 'split', dir, children: first ? [fresh, group] : [group, fresh], sizes: first ? [share, 1 - share] : [1 - share, share] };
          if (p) p.split.children[p.at] = split; else root = split;
        }
      }
    }
    delete closed[key];
    root = normalize(root) ?? clone(options.defaults.root);
    save();
    render();
  };
  /** A tab put where it belongs when it is not in the tree: its closed group, else its dock's home, else the largest group. */
  const place = (key: string, dockOf: ForgeDock): void => {
    const groups = groupsOf(root);
    const back = closed[key] ? groups.find((g) => g.id === closed[key]) : undefined;
    const home = options.defaults.homes[dockOf];
    const target = back ?? groups.find((g) => g.id === home) ?? groups.find((g) => !g.tabs.includes(viewportKey)) ?? groups[0];
    delete closed[key];
    if (!target) return;
    if (!target.tabs.includes(key)) target.tabs.push(key);
    if (!target.active) target.active = key;
  };
  /* ---------- the menu and the pad ---------- */
  const panelRow = (m: Mounted, own: MenuItem | undefined): MenuItem => {
    const id = m.panel.id;
    const toggle = (): void => { if (shell.isOpen(id)) shell.collapse(id); else shell.reveal(id); };
    return {
      ...own, id: `panel-${id}`, label: own?.label ?? m.panel.title, value: own?.value ?? (shell.isOpen(id) ? 'Shown' : 'Folded'),
      note: own?.note ?? '✕ shows or folds it · ← folds it · → shows it',
      act: () => { (own?.act ?? toggle)(); if (shell.isOpen(id)) focusTab(dockTabKeyOf(m.panel)); },
      left: () => shell.collapse(id), right: () => shell.reveal(id),
    };
  };
  const focusTab = (key: string): void => { workbench.querySelector<HTMLElement>(`.fx-dg-tab[data-forge-tab="${CSS.escape(key)}"]`)?.focus(); };
  let lastAvailability = '';
  let lastMaximized = false;
  const availabilityKey = (): string => [...mounted.values()].map((m) => (available(m.panel) ? '1' : '0')).join('');

  const shell: ForgeShellPage = {
    register(panel) {
      if (disposed) throw new ForgePanelError('DISPOSED', `${panel.id}: the Forge has closed`);
      if (mounted.has(panel.id)) throw new ForgePanelError('DUPLICATE', `${panel.id}: a panel of that id is registered`);
      let host: HTMLElement;
      const abort = new AbortController();
      if (panel.dock === 'workspace') {
        if (!workspace) throw new ForgePanelError('NO_DOCK', `${panel.id}: the Forge has no workspace dock`);
        host = doc.createElement('section');
        host.hidden = true;
        workspace.body.append(host);
      } else {
        // A section as before: its title a fold (the viewer's choice kept); a tab of one section draws no title.
        const d = doc.createElement('details');
        d.className = 'fx-panel';
        const summary = doc.createElement('summary');
        summary.textContent = panel.title;
        d.append(summary);
        d.open = open[panel.id] ?? panel.defaultOpen;
        d.addEventListener('toggle', () => {
          if (setting) return;
          const m = mounted.get(panel.id);
          if (!m || sectionsOf(dockTabKeyOf(panel)).length <= 1) return;
          if (d.open !== (open[panel.id] ?? panel.defaultOpen)) { open[panel.id] = d.open; save(); }
          if (d.open) m.instance.update?.();
          syncShown();
        }, { signal: abort.signal });
        host = d;
        stash.append(host);
      }
      host.dataset['forgePanel'] = panel.id;
      host.setAttribute('aria-label', panel.title);
      let instance: ForgePanelInstance;
      try { instance = panel.mount(host, panelContext(context, abort.signal)); }
      catch (e) { abort.abort(); host.remove(); throw e; }
      mounted.set(panel.id, { panel, host, instance, abort, shown: true });
      if (panel.id === options.viewportId) viewportKey = dockTabKeyOf(panel);
      // Its tab not in the tree and not closed by the viewer: where it belongs (new to a kept layout, or the first visit).
      const key = dockTabKeyOf(panel);
      // A tab the viewer closed stays closed (`closed`) till the Window menu opens it again.
      if (panel.dock !== 'workspace' && !groupOf(key) && !closed[key]) { place(key, panel.dock); save(); }
      lastAvailability = availabilityKey();
      render();
    },
    unregister(id) {
      const m = mounted.get(id);
      if (!m) return;
      mounted.delete(id);
      if (workspaceOpen === id) closeWorkspace();
      m.abort.abort();
      try { m.instance.dispose(); } finally { m.host.remove(); }
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener('visibilitychange', syncShown);
      workspace?.back.removeEventListener('click', onBack);
      workspace?.root.removeEventListener('keydown', onWorkspaceKey);
      for (const m of sorted().reverse()) { mounted.delete(m.panel.id); m.abort.abort(); try { m.instance.dispose(); } finally { m.host.remove(); } }
      canvas.remove(); overlay.remove(); stash.remove();
    },
    panels: () => sorted().map((m) => m.panel.id),
    menuItems() {
      const listed = sorted().filter((m) => available(m.panel) && m.panel.dock !== 'workspace' && m.panel.id !== options.viewportId);
      const own = new Map<string, MenuItem>();
      const sections: MenuItem[] = [];
      for (const m of sorted().filter((x) => available(x.panel))) {
        const rows: MenuItem[] = [];
        for (const r of m.panel.menuSection?.() ?? []) { if (r.id === `panel-${m.panel.id}`) own.set(m.panel.id, r); else rows.push(r); }
        if (rows.some((r) => !r.heading)) sections.push(...rows);
      }
      if (listed.length === 0) return sections;
      return [...sections, { id: 'panels', label: PANELS_MENU_HEADING, heading: true }, ...listed.map((m) => panelRow(m, own.get(m.panel.id)))];
    },
    update() {
      for (const m of mounted.values()) m.instance.update?.();
      const key = availabilityKey() + (maximized() ? 'M' : '');
      if (key !== lastAvailability) { lastAvailability = key; render(); } else syncShown();
    },
    refresh() {
      const key = availabilityKey() + (maximized() ? 'M' : '');
      if (key !== drawnKey) { drawnKey = key; render(); } else syncShown();
    },
    frame(dt, now) {
      // Docks off, Walk or a match begun or ended: the tree drawn again (the viewport alone, or everything).
      const max = maximized();
      if (max !== lastMaximized) { lastMaximized = max; render(); }
      syncShown();
      for (const m of mounted.values()) if (m.shown) m.instance.frame?.(dt, now);
    },
    reveal(id) {
      const m = mounted.get(id);
      if (!m) return;
      if (m.panel.dock === 'workspace') {
        if (!workspace) return;
        if (workspaceOpen !== null && workspaceOpen !== id) closeWorkspace();
        workspaceOpen = id;
        m.host.hidden = false;
        workspace.crumb.textContent = `Forge › ${m.panel.title}`;
        if (workspace.title) workspace.title.textContent = m.panel.title;
        workspace.root.hidden = false;
        workspace.back.focus();
        syncShown();
        return;
      }
      if (maximized()) options.showDocks?.();
      const key = dockTabKeyOf(m.panel);
      // A tab closed in its place: back there, as it was (`closeTab`); one no group holds (a layout kept before): placed.
      if (closed[key] && groupOf(key)) delete closed[key];
      else if (!groupOf(key)) place(key, m.panel.dock);
      const g = groupOf(key);
      if (g) g.active = key;
      open[id] = true;                                         // shown: its section open, the viewer's choice
      save();
      render();
      m.instance.update?.();
      m.host.scrollIntoView?.({ block: 'nearest' });
    },
    collapse(id) {
      const m = mounted.get(id);
      if (!m) return;
      if (m.panel.dock === 'workspace') { if (workspaceOpen === id) closeWorkspace(); return; }
      if (m.panel.movable === false) return;                    // the viewport stays
      const key = dockTabKeyOf(m.panel);
      // A section of several folded, as before; a tab of one closed (the Window menu opens it again).
      if (sectionsOf(key).length > 1) { open[id] = false; save(); render(); return; }
      closeTab(key);
    },
    windowItems() {
      // A row a tab (its sections together), by the tab's word, in the panels' order.
      const seen = new Set<string>();
      const out: { id: string; key: string; title: string; docked: boolean }[] = [];
      for (const m of sorted()) {
        if (!available(m.panel) || m.panel.dock === 'workspace' || m.panel.movable === false || m.panel.id === options.viewportId) continue;
        const key = dockTabKeyOf(m.panel);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: m.panel.id, key, title: tabLabel(key), docked: !closed[key] && !!groupOf(key) });
      }
      return out;
    },
    closeTabOf(id) {
      const m = mounted.get(id);
      if (m && m.panel.dock !== 'workspace') closeTab(dockTabKeyOf(m.panel));
    },
    isOpen(id) {
      const m = mounted.get(id);
      if (!m) return false;
      if (m.panel.dock === 'workspace') return workspaceOpen === id;
      const g = groupOf(dockTabKeyOf(m.panel));
      return !!g && activeOf(g) === dockTabKeyOf(m.panel) && sectionOpen(m);
    },
    back: () => closeWorkspace(),
    padInput(input) {
      const active = doc.activeElement;
      if (!active || active === doc.body || !workbench.contains(active)) return false;
      if (input === 'back') { (active as HTMLElement).blur?.(); return true; }
      const groupEl = active.closest<HTMLElement>('.fx-dg-group');
      const g = groupsOf(root).find((x) => x.id === groupEl?.dataset['dockGroup']);
      if ((input === 'prevSection' || input === 'nextSection') && g) {
        const live = liveTabs(g);
        const at = live.indexOf(activeOf(g) ?? '');
        const next = live[(at + (input === 'nextSection' ? 1 : live.length - 1) + live.length) % live.length];
        if (next) { activate(g, next); focusTab(next); }
        return true;
      }
      const m = [...mounted.values()].find((x) => x.host.contains(active));
      return !!m && m.shown && (m.instance.pad?.(input) ?? false);
    },
    padTo(id, input) {
      const m = mounted.get(id);
      return !!m && m.shown && (m.instance.pad?.(input) ?? false);
    },
    isShown: (id) => mounted.get(id)?.shown ?? false,
    layoutOf: () => 'tabs',
    tabOf: () => null,
    moveTab(_from, tab, to) {
      // The zone shell's move (a tab group to a dock): that tab to the dock's home group.
      const home = options.defaults.homes[to];
      const g = groupsOf(root).find((x) => x.id === home);
      if (!g || !sectionsOf(tab).length || sectionsOf(tab).some((m) => m.panel.movable === false)) return;
      dock(tab, g, 'center');
    },
    resetLayout() {
      root = clone(options.defaults.root);
      for (const k of Object.keys(closed)) delete closed[k];
      for (const k of Object.keys(open)) delete open[k];
      for (const m of mounted.values()) {
        const key = dockTabKeyOf(m.panel);
        if (m.panel.dock !== 'workspace' && !groupOf(key)) place(key, m.panel.dock);
      }
      save();
      render();
    },
  };
  return shell;
}
