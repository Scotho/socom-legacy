import type { MenuItem } from '../padMenu';
import { panelContext, type ForgePageContext, type ForgePanelContext, type ForgeStore } from './context';
import type { ForgeSurface } from './state';

/**
 * FUI-1 (the review's IA-9, UX-1, UX-7, UX-12, UX-15; FUI.R5; a browser adaptation, FG.R2): the Forge's panel registry.
 * A panel is registered, not hand-appended: the registry renders it (a `details.fx-panel` with its title, the page's
 * `panel()` helper before it), orders it in its dock, remembers whether it is open per viewer, ticks it with the
 * frame while it is actually shown, tells it when it is shown or hidden, and on `unregister` or `dispose` takes it all
 * down again. FUI-1b: every panel has a pad path by construction -- the shell's own "Panels" START section lists each
 * registered panel (show it, fold it) -- so `menuSection` and `pad` are optional (desktop-first panels, OT.R87 /
 * FUI.R18). FUI.R5: a dock past five panels draws a tab strip, one tab open at a time; FUI-22 (FUI.R22): a tab shows
 * only its own sections, the other tabs' hidden. Nothing here changes what the
 * game does.
 */
export type ForgeDock = 'left' | 'right' | 'workspace';
type SideDock = Exclude<ForgeDock, 'workspace'>;

/** The pad's buttons a legend names (FUI.R6 draws them as the design system's glyphs, FUI-3). */
export type ForgePadButton = 'cross' | 'circle' | 'square' | 'triangle' | 'dpad' | 'l1r1' | 'start' | 'select';
export interface ForgePadLegend { button: ForgePadButton; label: string }

/** The pad's inputs a focused panel takes (the review's principle 1: one scheme). */
export type ForgePanelPadInput = 'up' | 'down' | 'left' | 'right' | 'act' | 'back' | 'secondary' | 'remove' | 'prevSection' | 'nextSection';

export interface ForgePanelInstance {
  /** The page's state changed (a layout or surface revision), or `reveal` / `collapse` / a tab opened or folded it: redraw. */
  update?(): void;
  /** A pad input while the page's focus is inside the panel (`ForgeShellPage.padInput`); true when it took it. */
  pad?(input: ForgePanelPadInput): boolean;
  /** Each editor frame while the panel is actually shown (`visibility`), never under a match. */
  frame?(dt: number, now: number): void;
  /**
   * Shown or hidden, as actually drawn: the tab visible, the surface one it names (`availableIn`), its dock drawn (not
   * folded away, not under Walk or a match), and the panel open (a side dock's details) or active (the workspace). A
   * panel is taken as shown at its mount; the shell says so at once when it is not. A poller stops while hidden (FCW.R5).
   */
  visibility?(visible: boolean): void;
  dispose(): void;
}

export interface ForgePanel {
  id: string;
  title: string;
  dock: ForgeDock;
  /** Its place in the dock, least first (Inspector 10, Outliner 20, View 30, Settings 40, the agent 50). */
  order: number;
  /**
   * Open on a viewer's first visit; after it, the viewer's own choice (one key, `FORGE_PANELS_KEY`), in either layout
   * (R3-A): a dock in tabs opens a tab's panels by those choices -- every one of them when all are folded, so a tab
   * always shows something -- and a reveal, a collapse or a hand toggle inside a tab is written; a tab switch by itself
   * writes nothing. The open tab is not remembered across a reload (a recorded deviation, for the rendered pass, 5c).
   */
  defaultOpen: boolean;
  padLegend: readonly ForgePadLegend[];
  /** The surfaces it is shown on; every one when absent. */
  availableIn?: readonly ForgeSurface[];
  /**
   * FUI.R5: the tab it sits under once its dock draws tabs -- a label its panels share (the review's Edit / World /
   * Content / Agent); its own title, alone, when absent.
   */
  tab?: string;
  /**
   * Its own START menu rows, beyond the shell's "Panels" row for it (asked each time the menu draws). A row of id
   * `panel-<id>` is that row: the shell lists it under Panels in place of its generic one.
   */
  menuSection?(): MenuItem[];
  /** Build into `host` (the panel's `details`, its summary in place; a workspace's surface). */
  mount(host: HTMLElement, ctx: ForgePanelContext): ForgePanelInstance;
}

export interface ForgeShell {
  register(panel: ForgePanel): void;
  unregister(id: string): void;
  dispose(): void;
}

/** What the page drives beside the three calls. */
export interface ForgeShellPage extends ForgeShell {
  /** The registered ids, by dock then order. */
  panels(): string[];
  /** The registered panels' START rows, in dock order then panel order, then the shell's "Panels" section. */
  menuItems(): MenuItem[];
  update(): void;
  /** Re-read what is actually shown (the docks toggled, a match begun or ended) and tell the panels. */
  refresh(): void;
  frame(dt: number, now: number): void;
  reveal(id: string): void;
  collapse(id: string): void;
  isOpen(id: string): boolean;
  /** Circle and Back on an open workspace: closes it; false when none is open. */
  back(): boolean;
  /**
   * A pad input while the page's focus is inside a side dock: L1 / R1 (`prevSection` / `nextSection`) step its tabs,
   * Circle (`back`) gives the focus back to the editor, any other goes to the panel holding the focus. False (the
   * editor's own input) when the focus is not in a dock or nothing took it.
   */
  padInput(input: ForgePanelPadInput): boolean;
  /** FUI-2: a pad input for the panel holding the focus lease (`./context` `ForgeFocus`); false when it is not shown or did not take it. */
  padTo(id: string, input: ForgePanelPadInput): boolean;
  /** FUI-2: whether the panel is actually shown now (what its `visibility` last said); the lease is let go when it is not. */
  isShown(id: string): boolean;
  /** The dock's layout by FUI.R5's count. */
  layoutOf(dock: ForgeDock): ForgeDockLayout;
  /** The dock's open tab while it draws tabs (its `data-forge-tab`), else null. */
  tabOf(dock: ForgeDock): string | null;
}

export class ForgePanelError extends Error {
  constructor(readonly code: 'DUPLICATE' | 'NO_DOCK' | 'DISPOSED', message: string) { super(message); }
}

/** FUI.R5: stacked collapsible panels until five register in a dock; past five, a tab strip, one tab open at a time. */
export const FORGE_DOCK_STACK_MAX = 5;
export type ForgeDockLayout = 'stacked' | 'tabs';
export const dockLayoutOf = (count: number): ForgeDockLayout => (count > FORGE_DOCK_STACK_MAX ? 'tabs' : 'stacked');

/** FUI-1b: the shell's own START section, every registered panel's row under it. */
export const PANELS_MENU_HEADING = 'Panels';

export interface ForgeShellOptions {
  doc: Document;
  /** The docks' elements: the asides, and the workspace surface (`createWorkspaceDock`). */
  docks: Partial<Record<ForgeDock, HTMLElement>>;
  context: ForgePageContext;
  store: ForgeStore;
  /** The key the panels' open state is kept under (one `PAGE_SETTING_KEYS` entry). */
  storeKey: string;
  /** Make a dock visible (the page's docks toggle); called by `reveal`. */
  showDock?(dock: ForgeDock): void;
  /** Whether a dock is drawn now (the page's: not folded away, not under Walk or a match); every one is when absent. */
  dockShown?(dock: ForgeDock): boolean;
}

interface Mounted {
  panel: ForgePanel;
  host: HTMLElement;
  instance: ForgePanelInstance;
  abort: AbortController;
  off: () => void;
  shown: boolean;
}

interface DockTabs { active: string | null; before: string | null; strip: HTMLElement }
interface TabSpec { key: string; label: string; titles: string[] }

/** The workspace slot (FUI.R5): a full-viewport surface with a breadcrumb, its title and Back; hidden while it holds nothing open. */
export function createWorkspaceDock(doc: Document): HTMLElement {
  const root = doc.createElement('section');
  root.className = 'fx-workspace';
  root.dataset['forgeDock'] = 'workspace';
  root.dataset['forgeWorkspace'] = '';
  root.setAttribute('role', 'region');
  root.hidden = true;
  const head = doc.createElement('header');
  head.className = 'fx-workspace-head';
  const back = doc.createElement('button');
  back.type = 'button';
  back.className = 'fx-tool';
  back.dataset['forgeWorkspaceBack'] = '';
  back.textContent = 'Back';
  back.title = 'Back to the editor · pad ○ · Esc';
  const crumb = doc.createElement('nav');
  crumb.className = 'fx-workspace-crumb';
  crumb.setAttribute('aria-label', 'Breadcrumb');
  const title = doc.createElement('h2');
  title.className = 'fx-workspace-title';
  title.dataset['forgeWorkspaceTitle'] = '';
  head.append(back, crumb, title);
  const body = doc.createElement('div');
  body.className = 'fx-workspace-body';
  root.append(head, body);
  return root;
}

const readOpen = (store: ForgeStore, key: string): Record<string, boolean> => {
  try {
    const raw = JSON.parse(store.get(key) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>;
  } catch { return {}; }
};

const slug = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tab';
const tabKeyOf = (p: ForgePanel): string => (p.tab ? slug(p.tab) : p.id);
const isSide = (d: ForgeDock): d is SideDock => d !== 'workspace';

export function createForgeShell(options: ForgeShellOptions): ForgeShellPage {
  const { doc, docks, context, store, storeKey } = options;
  const mounted = new Map<string, Mounted>();
  const open = readOpen(store, storeKey);
  let disposed = false;
  let workspaceOpen: string | null = null;
  /** FUI.R5: a side dock's tab strip and open tab, while it draws tabs. The viewer's kept choices hold in both layouts (R3-A). */
  const tabs: Partial<Record<SideDock, DockTabs>> = {};
  const lastRevealed: Partial<Record<SideDock, string>> = {};
  /**
   * R3-A: the open state the shell itself last gave a side panel's `details`, until its `toggle` event is read. The
   * browser fires `toggle` (queued, coalesced) for a programmatic `open` too: a toggle that lands on the state the shell
   * set is the shell's own and is not written as the viewer's choice.
   */
  const shellSet = new Map<HTMLElement, boolean>();

  const kept = (p: ForgePanel): boolean => open[p.id] ?? p.defaultOpen;
  const writeOpen = (id: string, value: boolean): void => {
    open[id] = value;
    store.set(storeKey, JSON.stringify(open));
  };
  /** The shell's own change of a side panel's open state (never written as the viewer's choice by its toggle). */
  const setOpen = (host: HTMLElement, want: boolean): boolean => {
    const d = host as HTMLDetailsElement;
    if (d.open === want) return false;
    d.open = want;
    shellSet.set(host, want);
    return true;
  };
  const sorted = (): Mounted[] => [...mounted.values()].sort((a, b) =>
    (DOCK_ORDER[a.panel.dock] - DOCK_ORDER[b.panel.dock]) || (a.panel.order - b.panel.order) || a.panel.id.localeCompare(b.panel.id));
  const inDock = (dock: ForgeDock): Mounted[] => sorted().filter((m) => m.panel.dock === dock);
  const available = (p: ForgePanel): boolean => !p.availableIn || p.availableIn.includes(context.state().surface);
  const setShown = (m: Mounted, shown: boolean): void => {
    if (m.shown === shown) return;
    m.shown = shown;
    m.instance.visibility?.(shown);
  };
  /** Actually shown: the tab visible, the surface allowed, the dock drawn, the panel open (or the workspace's own). */
  const shownNow = (m: Mounted): boolean => {
    if (doc.visibilityState === 'hidden' || !available(m.panel)) return false;
    if (options.dockShown && !options.dockShown(m.panel.dock)) return false;
    if (m.panel.dock === 'workspace') return workspaceOpen === m.panel.id;
    return (m.host as HTMLDetailsElement).open && !m.host.hidden;
  };
  /**
   * FUI-22 (D6, FUI.R22: a right-dock tab shows only its own sections): a side panel is drawn when its surface allows it
   * and, while its dock draws tabs, when its tab is the open one -- another tab's panels are hidden, not folded in view.
   */
  const sideHidden = (m: Mounted): boolean => {
    if (!available(m.panel)) return true;
    const t = isSide(m.panel.dock) ? tabs[m.panel.dock] : undefined;
    return !!t && tabKeyOf(m.panel) !== t.active;
  };
  const applyHidden = (dock: SideDock): void => { for (const m of inDock(dock)) m.host.hidden = sideHidden(m); };
  const syncShown = (): void => { for (const m of mounted.values()) setShown(m, shownNow(m)); };
  doc.addEventListener('visibilitychange', syncShown);

  const workspaceParts = (): { root: HTMLElement; body: HTMLElement; crumb: HTMLElement; title: HTMLElement | null; back: HTMLElement } | null => {
    const root = docks.workspace;
    const body = root?.querySelector<HTMLElement>('.fx-workspace-body');
    const crumb = root?.querySelector<HTMLElement>('.fx-workspace-crumb');
    const back = root?.querySelector<HTMLElement>('[data-forge-workspace-back]');
    const title = root?.querySelector<HTMLElement>('[data-forge-workspace-title]') ?? null;
    return root && body && crumb && back ? { root, body, crumb, title, back } : null;
  };
  const closeWorkspace = (): boolean => {
    const w = workspaceParts();
    if (!w || workspaceOpen === null) return false;
    const m = mounted.get(workspaceOpen);
    if (m) m.host.hidden = true;
    workspaceOpen = null;
    w.root.hidden = true;
    w.crumb.textContent = '';
    if (w.title) w.title.textContent = '';
    syncShown();
    return true;
  };
  const workspace = workspaceParts();
  const onBack = (): void => { closeWorkspace(); };
  const onWorkspaceKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && closeWorkspace()) { e.preventDefault(); e.stopPropagation(); } };
  workspace?.back.addEventListener('click', onBack);
  workspace?.root.addEventListener('keydown', onWorkspaceKey);

  /* ---------- FUI.R5: the tab strip of a dock past five panels ---------- */
  const tabList = (dock: SideDock): TabSpec[] => {
    const out: TabSpec[] = [];
    for (const m of inDock(dock)) {
      if (!available(m.panel)) continue;
      const key = tabKeyOf(m.panel);
      const t = out.find((x) => x.key === key);
      if (t) t.titles.push(m.panel.title); else out.push({ key, label: m.panel.tab ?? m.panel.title, titles: [m.panel.title] });
    }
    return out;
  };
  /**
   * The strip's buttons, kept (R3-A): a redraw (each `update`, the page's 250 ms state tick) changes a button's words,
   * its selection and its tab stop in place and adds or takes out only the tabs that came or went, so a tab holding the
   * focus keeps it (a pad user's L1 / R1 and Circle stay the dock's). Should the focused tab still be replaced, the focus
   * goes back to the button of the same tab.
   */
  const drawStrip = (dock: SideDock): void => {
    const t = tabs[dock];
    if (!t) return;
    const focusedKey = (() => {
      const a = doc.activeElement;
      return a instanceof HTMLElement && t.strip.contains(a) ? a.dataset['forgeTab'] ?? null : null;
    })();
    const have = new Map<string, HTMLButtonElement>();
    for (const b of t.strip.querySelectorAll<HTMLButtonElement>(':scope > button[data-forge-tab]')) have.set(b.dataset['forgeTab']!, b);
    const list = tabList(dock);
    const wanted = new Set(list.map((x) => x.key));
    for (const [key, b] of have) if (!wanted.has(key)) { b.remove(); have.delete(key); }
    list.forEach((tab, i) => {
      let b = have.get(tab.key);
      if (!b) {
        b = doc.createElement('button');
        b.type = 'button';
        b.className = 'fx-dock-tab';
        b.setAttribute('role', 'tab');
        b.dataset['forgeTab'] = tab.key;
        b.addEventListener('click', () => selectTab(dock, tab.key));
        have.set(tab.key, b);
      }
      if (b.textContent !== tab.label) b.textContent = tab.label;
      const title = `${tab.titles.join(' · ')} · L1 / R1 another tab`;
      if (b.title !== title) b.title = title;
      const on = tab.key === t.active;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      const at = t.strip.children[i];
      if (at !== b) t.strip.insertBefore(b, at ?? null);              // only a tab out of place moves
    });
    if (focusedKey !== null) {
      const again = have.get(focusedKey);
      if (again && doc.activeElement !== again) again.focus();
    }
  };
  /**
   * One tab open: its panels opened by the viewer's kept choices (all of them when every one is folded), every other
   * tab's folded. The shell's own change, so nothing is written.
   */
  const selectTab = (dock: SideDock, key: string): void => {
    const t = tabs[dock];
    if (!t) return;
    if (t.active !== key) { t.before = t.active; t.active = key; }
    const group = inDock(dock).filter((m) => tabKeyOf(m.panel) === key);
    const anyKept = group.some((m) => kept(m.panel));
    for (const m of inDock(dock)) {
      const want = tabKeyOf(m.panel) === key && (!anyKept || kept(m.panel));
      if (setOpen(m.host, want)) m.instance.update?.();
    }
    applyHidden(dock);
    drawStrip(dock);
    syncShown();
  };
  const focusTab = (dock: SideDock, key: string): void => {
    tabs[dock]?.strip.querySelector<HTMLElement>(`[data-forge-tab="${key}"]`)?.focus();
  };
  /** The dock's layout by its count: entering tabs opens one tab, leaving them puts back the viewer's kept choices. */
  const relayout = (dock: ForgeDock): void => {
    if (!isSide(dock)) return;
    const el = docks[dock];
    if (!el) return;
    const layout = shell.layoutOf(dock);
    el.dataset['forgeDockLayout'] = layout;
    const t = tabs[dock];
    if (layout === 'tabs') {
      const list = tabList(dock);
      if (!t) {
        const strip = doc.createElement('div');
        strip.className = 'fx-dock-tabs';
        strip.dataset['forgeTabs'] = '';
        strip.setAttribute('role', 'tablist');
        strip.setAttribute('aria-label', `${PANELS_MENU_HEADING} · L1 / R1`);
        el.prepend(strip);
        tabs[dock] = { active: null, before: null, strip };
        // The tab of the panel last shown, if it is still open (a toolbar's reveal before the dock filled); else the first.
        const seedId = lastRevealed[dock];
        const seed = seedId === undefined ? undefined : mounted.get(seedId);
        const first = seed && (seed.host as HTMLDetailsElement).open ? tabKeyOf(seed.panel) : list[0]?.key;
        if (first) selectTab(dock, first); else drawStrip(dock);
      } else if (!list.some((x) => x.key === t.active)) {
        if (list[0]) selectTab(dock, list[0].key); else drawStrip(dock);
      } else drawStrip(dock);
    } else if (t) {
      t.strip.remove();
      delete tabs[dock];
      for (const m of inDock(dock)) if (setOpen(m.host, kept(m.panel))) m.instance.update?.();
    }
    applyHidden(dock);
    syncShown();
  };

  /** The panel's host: a `details.fx-panel` in a side dock (in order), a hidden section in the workspace. */
  const hostFor = (panel: ForgePanel): { host: HTMLElement; off: () => void } => {
    if (panel.dock === 'workspace') {
      if (!workspace) throw new ForgePanelError('NO_DOCK', `${panel.id}: the Forge has no workspace dock`);
      const host = doc.createElement('section');
      host.dataset['forgePanel'] = panel.id;
      host.setAttribute('aria-label', panel.title);
      host.hidden = true;
      workspace.body.append(host);
      return { host, off: () => undefined };
    }
    const side = panel.dock;
    const dock = docks[side];
    if (!dock) throw new ForgePanelError('NO_DOCK', `${panel.id}: the Forge has no ${side} dock`);
    const host = doc.createElement('details');
    host.className = 'fx-panel';
    host.dataset['forgePanel'] = panel.id;
    const t = tabs[side];
    // In tabs, as `selectTab` opens a tab: by the kept choice, or open when nothing of the open tab is kept open.
    const tabShows = (): boolean => tabKeyOf(panel) === t!.active
      && (kept(panel) || !inDock(side).some((m) => tabKeyOf(m.panel) === t!.active && kept(m.panel)));
    setOpen(host, t ? tabShows() : kept(panel));
    const summary = doc.createElement('summary');
    summary.textContent = panel.title;
    host.append(summary);
    const after = sorted().find((m) => m.panel.dock === side && m.panel.order > panel.order);
    if (after) dock.insertBefore(host, after.host); else dock.append(host);
    // The browser fires `toggle` for a programmatic `open` too: the shell's own (`setOpen`) is not written; a viewer's
    // change from what is kept is, in either layout (R3-A); in tabs, a panel of another tab opened by hand opens its tab.
    const onToggle = (): void => {
      const own = shellSet.has(host) && shellSet.get(host) === host.open;
      shellSet.delete(host);
      if (!own) {
        if (host.open !== kept(panel)) writeOpen(panel.id, host.open);
        const tabbed = tabs[side];
        if (tabbed && host.open && tabKeyOf(panel) !== tabbed.active) selectTab(side, tabKeyOf(panel));
      }
      syncShown();
    };
    host.addEventListener('toggle', onToggle);
    return { host, off: () => { host.removeEventListener('toggle', onToggle); shellSet.delete(host); } };
  };

  const teardownOne = (m: Mounted): void => {
    if (workspaceOpen === m.panel.id) closeWorkspace();
    m.off();
    m.abort.abort();
    try { m.instance.dispose(); } finally { m.host.remove(); }
  };

  /** The pad's landing in a panel from its Panels row: its tab in a tabbed dock, else its summary (a workspace focuses its Back). */
  const focusPanel = (m: Mounted): void => {
    if (!isSide(m.panel.dock)) return;
    if (tabs[m.panel.dock]) focusTab(m.panel.dock, tabKeyOf(m.panel));
    else m.host.querySelector<HTMLElement>(':scope > summary')?.focus();
  };
  /** FUI-1b: a panel's row under Panels -- its own `panel-<id>` row when it has one -- that shows it or folds it. */
  const panelRow = (m: Mounted, own: MenuItem | undefined): MenuItem => {
    const id = m.panel.id;
    const toggle = (): void => { if (shell.isOpen(id)) shell.collapse(id); else shell.reveal(id); };
    return {
      ...own, id: `panel-${id}`, label: own?.label ?? m.panel.title, value: own?.value ?? (shell.isOpen(id) ? 'Shown' : 'Folded'),
      note: own?.note ?? '✕ shows or folds it · ← folds it · → shows it',
      act: () => { (own?.act ?? toggle)(); if (shell.isOpen(id)) focusPanel(m); },
      left: () => shell.collapse(id), right: () => shell.reveal(id),
    };
  };

  const shell: ForgeShellPage = {
    register(panel) {
      if (disposed) throw new ForgePanelError('DISPOSED', `${panel.id}: the Forge has closed`);
      if (mounted.has(panel.id)) throw new ForgePanelError('DUPLICATE', `${panel.id}: a panel of that id is registered`);
      const { host, off } = hostFor(panel);
      const abort = new AbortController();
      let instance: ForgePanelInstance;
      try { instance = panel.mount(host, panelContext(context, abort.signal)); }
      catch (e) { off(); abort.abort(); host.remove(); throw e; }
      mounted.set(panel.id, { panel, host, instance, abort, off, shown: true });
      host.hidden = panel.dock === 'workspace' || !available(panel);
      relayout(panel.dock);
      syncShown();
    },
    unregister(id) {
      const m = mounted.get(id);
      if (!m) return;
      mounted.delete(id);
      teardownOne(m);
      relayout(m.panel.dock);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener('visibilitychange', syncShown);
      workspace?.back.removeEventListener('click', onBack);
      workspace?.root.removeEventListener('keydown', onWorkspaceKey);
      for (const m of sorted().reverse()) { mounted.delete(m.panel.id); teardownOne(m); }
      for (const d of ['left', 'right'] as const) { tabs[d]?.strip.remove(); delete tabs[d]; }
    },
    panels: () => sorted().map((m) => m.panel.id),
    menuItems() {
      const listed = sorted().filter((m) => available(m.panel));
      const own = new Map<string, MenuItem>();
      const sections: MenuItem[] = [];
      for (const m of listed) {
        const rows: MenuItem[] = [];
        for (const r of m.panel.menuSection?.() ?? []) { if (r.id === `panel-${m.panel.id}`) own.set(m.panel.id, r); else rows.push(r); }
        if (rows.some((r) => !r.heading)) sections.push(...rows);           // a heading left with no row of its own goes
      }
      if (listed.length === 0) return sections;
      return [...sections, { id: 'panels', label: PANELS_MENU_HEADING, heading: true }, ...listed.map((m) => panelRow(m, own.get(m.panel.id)))];
    },
    update() {
      for (const m of sorted()) {
        if (m.panel.dock !== 'workspace') m.host.hidden = sideHidden(m);
        m.instance.update?.();
      }
      relayout('left');
      relayout('right');
      syncShown();
    },
    refresh: () => syncShown(),
    frame(dt, now) {
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
      const side = m.panel.dock;
      options.showDock?.(side);
      lastRevealed[side] = id;
      const d = m.host as HTMLDetailsElement;
      if (tabs[side]) selectTab(side, tabKeyOf(m.panel));
      if (setOpen(m.host, true)) m.instance.update?.();
      if (!kept(m.panel)) writeOpen(id, true);                     // R3-A: shown is the viewer's choice in tabs too
      d.scrollIntoView?.({ block: 'nearest' });
      syncShown();
    },
    collapse(id) {
      const m = mounted.get(id);
      if (!m) return;
      if (m.panel.dock === 'workspace') { if (workspaceOpen === id) closeWorkspace(); return; }
      const side = m.panel.dock;
      const t = tabs[side];
      if (setOpen(m.host, false)) m.instance.update?.();
      if (kept(m.panel)) writeOpen(id, false);                     // R3-A: folded is the viewer's choice in tabs too
      // A tab left with nothing open gives way to the one open before it (the starters' Close: back to Edit).
      const emptied = !!t && t.active === tabKeyOf(m.panel) && !inDock(side).some((x) => tabKeyOf(x.panel) === t.active && (x.host as HTMLDetailsElement).open);
      if (t?.before && emptied && tabList(side).some((x) => x.key === t.before)) selectTab(side, t.before);
      syncShown();
    },
    isOpen(id) {
      const m = mounted.get(id);
      return !!m && (m.panel.dock === 'workspace' ? workspaceOpen === id : (m.host as HTMLDetailsElement).open);
    },
    back: () => closeWorkspace(),
    padInput(input) {
      const active = doc.activeElement;
      if (!active || active === doc.body) return false;
      const side = (['left', 'right'] as const).find((d) => docks[d]?.contains(active));
      if (!side) return false;
      if (input === 'back') { (active as HTMLElement).blur?.(); return true; }
      const t = tabs[side];
      if ((input === 'prevSection' || input === 'nextSection') && t) {
        const list = tabList(side);
        const at = list.findIndex((x) => x.key === t.active);
        const next = list[(at + (input === 'nextSection' ? 1 : list.length - 1) + list.length) % list.length];
        if (next) { selectTab(side, next.key); focusTab(side, next.key); }
        return true;
      }
      const m = inDock(side).find((x) => x.host.contains(active));
      return !!m && m.shown && (m.instance.pad?.(input) ?? false);
    },
    padTo(id, input) {
      const m = mounted.get(id);
      return !!m && m.shown && (m.instance.pad?.(input) ?? false);
    },
    isShown: (id) => mounted.get(id)?.shown ?? false,
    layoutOf: (dock) => dockLayoutOf([...mounted.values()].filter((m) => m.panel.dock === dock).length),
    tabOf: (dock) => (isSide(dock) ? tabs[dock]?.active ?? null : null),
  };
  return shell;
}

const DOCK_ORDER: Record<ForgeDock, number> = { left: 0, right: 1, workspace: 2 };

/**
 * A panel whose body the page builds (the four first registrants: the page's closure keeps wiring their controls), and
 * which the registry places, orders, remembers and takes down.
 */
export function builtPanel(def: Omit<ForgePanel, 'mount'>, body: HTMLElement, instance: Omit<ForgePanelInstance, 'dispose'> = {}): ForgePanel {
  return { ...def, mount: (host) => { host.append(body); return { ...instance, dispose: () => body.remove() }; } };
}

/** The page's element helper (`./page` `el`), for the panels' own markup. */
export function forgeEl<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** A panel's own START row that shows it (listed under the shell's Panels section, FUI-1b, in place of the generic one). */
export function revealRow(reveal: (id: string) => void, id: string, label: string, value: string | undefined, note: string): MenuItem {
  return { id: `panel-${id}`, label, ...(value === undefined ? {} : { value }), note, act: () => reveal(id) };
}
