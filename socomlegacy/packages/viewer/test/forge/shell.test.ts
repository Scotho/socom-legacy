// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { createForgeShell, createWorkspaceDock, dockLayoutOf, PANELS_MENU_HEADING, revealRow, type ForgePanel, type ForgeShellPage } from '../../src/forge/shell/panel';
import { panelContext, type ForgeEditor, type ForgePageContext, type ForgePanelContext, type ForgeStore, type StagedPiece } from '../../src/forge/shell/context';
import { agentModeOf, FORGE_REFUSALS, forgeEditRefusal, forgeSurfaceState, LOBBY_HOLDS_REASON } from '../../src/forge/shell/state';
import { FORGE_PANELS_KEY, PAGE_SETTING_KEYS } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';
import type { MenuItem } from '../../src/forge/padMenu';

/**
 * FUI-1 (the review's IA-9, UX-1, UX-2, UX-7, UX-12, UX-13; FUI.R3, FUI.R5; a browser adaptation, FG.R2): the Forge's
 * panel registry, its context and its lifecycle; FUI-1's fix-up (A1 honest visibility, A2-A3 the dock card and the
 * workspace's CSS, A4 the tab strip) and FUI-1b (B1 the Build-only edit rule and canPlace, B2 the editor seam, B3 the
 * shell's Panels section). The registry is tested on its own over plain docks; the page is mounted as
 * `forgeAgentPage.test.ts` mounts it (only the GPU and disc I/O replaced) for the first registrants and the seam.
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

const memoryStore = (): ForgeStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
};

function rig(store = memoryStore()) {
  const left = document.createElement('aside'), right = document.createElement('aside'), workspace = createWorkspaceDock(document);
  const top = document.createElement('aside'), bottom = document.createElement('aside'), center = document.createElement('aside');
  document.body.append(left, right, top, bottom, center, workspace);
  let surface: 'build' | 'walk' | 'play' | 'blocked' = 'build';
  let docksDrawn = true;
  const context: ForgePageContext = {
    get forge(): ForgeAgentApi { throw new Error('no facade in this rig'); },
    ui: { notify: vi.fn(), toast: vi.fn(), reveal: (id) => shell.reveal(id), collapse: (id) => shell.collapse(id) },
    state: () => ({ surface, canEdit: true, canPlace: true, reason: null, revision: 0 }),
    store, doc: document,
  };
  const showDock = vi.fn();
  const shell: ForgeShellPage = createForgeShell({ doc: document, docks: { left, right, top, bottom, center, workspace }, context, store, storeKey: FORGE_PANELS_KEY, showDock,
    dockShown: () => docksDrawn });
  return { shell, store, left, right, top, bottom, center, workspace, showDock, setSurface: (s: typeof surface) => { surface = s; }, setDocksDrawn: (on: boolean) => { docksDrawn = on; } };
}

const panel = (id: string, over: Partial<ForgePanel> = {}): ForgePanel => ({
  id, title: id.toUpperCase(), dock: 'right', order: 10, defaultOpen: true, padLegend: [],
  menuSection: () => [{ id: `row-${id}`, label: id }],
  mount: (host) => { host.append(document.createElement('div')); return { dispose: () => undefined }; },
  ...over,
});

describe('the Forge shell: the panel registry (FUI-1)', () => {
  beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('B3: lists every registered panel under its own Panels section -- one with no pad path of its own too', () => {
    const { shell, right } = rig();
    const dispose = vi.fn();
    shell.register(panel('bare', { order: 20, menuSection: undefined, mount: () => ({ dispose }) }));    // no NO_PAD_PATH any more
    shell.register(panel('inspector', { menuSection: () => [revealRow((id) => shell.reveal(id), 'inspector', 'Inspector', 'Crate', 'Its own note')] }));
    shell.register(panel('view', { order: 25, menuSection: () => [{ id: 'view-fog', label: 'Fog' }] }));
    const ownAct = vi.fn();
    shell.register(panel('agent', { order: 30, defaultOpen: false, title: 'Connect your agent',
      menuSection: () => [{ id: 'agent', label: 'Agent', heading: true }, { id: 'panel-agent', label: 'Connect your agent', act: ownAct }] }));
    expect(shell.panels()).toEqual(['inspector', 'bare', 'view', 'agent']);
    expect(right.querySelectorAll('details.fx-panel')).toHaveLength(4);
    const items = shell.menuItems();
    // A panel's own `panel-<id>` row is its Panels row (listed once); a heading left with no row of its own goes.
    expect(items.map((r) => r.id)).toEqual(['view-fog', 'panels', 'panel-inspector', 'panel-bare', 'panel-view', 'panel-agent']);
    expect(items[1]).toMatchObject({ label: PANELS_MENU_HEADING, heading: true });
    expect(items.find((r) => r.id === 'panel-inspector')).toMatchObject({ label: 'Inspector', value: 'Crate', note: 'Its own note' });
    const bareRow = (): MenuItem => shell.menuItems().find((r) => r.id === 'panel-bare')!;
    expect(bareRow()).toMatchObject({ label: 'BARE', value: 'Shown' });
    bareRow().act!();                                              // Cross: folds a shown panel, shows a folded one
    expect(shell.isOpen('bare')).toBe(false);
    expect(bareRow().value).toBe('Folded');
    bareRow().right!();
    expect(shell.isOpen('bare')).toBe(true);
    bareRow().left!();
    expect(shell.isOpen('bare')).toBe(false);
    shell.menuItems().find((r) => r.id === 'panel-agent')!.act!();
    expect(ownAct).toHaveBeenCalledTimes(1);
    expect(() => shell.register(panel('bare'))).toThrow(/registered/);
    shell.unregister('bare');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('renders each panel as the page did -- a details.fx-panel with its title -- in its order, whatever the order of registration', () => {
    const { shell, right } = rig();
    shell.register(panel('settings', { order: 40 }));
    shell.register(panel('inspector', { order: 10 }));
    shell.register(panel('agent', { order: 50, defaultOpen: false }));
    shell.register(panel('view', { order: 30 }));
    const rows = [...right.children] as HTMLDetailsElement[];
    expect(rows.map((d) => [d.tagName, d.className, d.querySelector('summary')!.textContent, d.open, d.dataset['forgePanel']])).toEqual([
      ['DETAILS', 'fx-panel', 'INSPECTOR', true, 'inspector'], ['DETAILS', 'fx-panel', 'VIEW', true, 'view'],
      ['DETAILS', 'fx-panel', 'SETTINGS', true, 'settings'], ['DETAILS', 'fx-panel', 'AGENT', false, 'agent'],
    ]);
    expect(shell.menuItems().map((r) => r.id)).toEqual(['row-inspector', 'row-view', 'row-settings', 'row-agent',
      'panels', 'panel-inspector', 'panel-view', 'panel-settings', 'panel-agent']);
  });

  it('unregister and dispose leave no listener, timer or element: the panel\'s signal aborts and its dispose runs once', () => {
    vi.useFakeTimers();
    const { shell, right, store } = rig();
    const dispose = vi.fn();
    let signal!: AbortSignal;
    shell.register(panel('poller', { mount: (host, ctx) => {
      signal = ctx.signal;
      const timer = setInterval(() => undefined, 1000);
      ctx.signal.addEventListener('abort', () => clearInterval(timer));
      host.append(document.createElement('p'));
      return { dispose };
    } }));
    vi.advanceTimersByTime(0);                                     // the browser's queued toggle task, if any
    expect(vi.getTimerCount()).toBe(1);
    const details = right.querySelector<HTMLDetailsElement>('details')!;
    shell.unregister('poller');
    expect(signal.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(right.children).toHaveLength(0);
    // Its toggle listener is off: a toggle on the old element writes nothing.
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    expect(store.data.has(FORGE_PANELS_KEY)).toBe(false);
    shell.unregister('poller');                                    // twice is nothing
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('takes its own document listeners off at dispose, and a late registration is refused', () => {
    const add = vi.spyOn(document, 'addEventListener'), remove = vi.spyOn(document, 'removeEventListener');
    const { shell } = rig();
    shell.register(panel('one'));
    const visible = vi.fn();
    shell.register(panel('two', { order: 20, mount: () => ({ visibility: visible, dispose: () => undefined }) }));
    shell.dispose();
    const added = add.mock.calls.map((c) => c[0]), removed = remove.mock.calls.map((c) => c[0]);
    expect(added).toContain('visibilitychange');
    expect(removed.filter((t) => t === 'visibilitychange')).toHaveLength(added.filter((t) => t === 'visibilitychange').length);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(visible).not.toHaveBeenCalled();
    expect(shell.panels()).toEqual([]);
    expect(() => shell.register(panel('late'))).toThrow(/closed/);
    add.mockRestore(); remove.mockRestore();
  });

  it('keeps each panel\'s open state under one PAGE_SETTING_KEYS entry, so it survives a reload', () => {
    expect(PAGE_SETTING_KEYS).toContain(FORGE_PANELS_KEY);
    const store = memoryStore();
    const first = rig(store);
    first.shell.register(panel('outliner', { order: 20 }));
    first.shell.register(panel('agent', { order: 50, defaultOpen: false }));
    // An open equal to the default writes nothing (the browser fires toggle for a programmatic open too).
    for (const d of first.right.querySelectorAll('details')) d.dispatchEvent(new Event('toggle'));
    expect(store.data.has(FORGE_PANELS_KEY)).toBe(false);
    const outliner = first.right.querySelector<HTMLDetailsElement>('[data-forge-panel="outliner"]')!;
    outliner.open = false;
    outliner.dispatchEvent(new Event('toggle'));
    first.shell.reveal('agent');
    expect(first.showDock).toHaveBeenCalledWith('right');
    expect(JSON.parse(store.data.get(FORGE_PANELS_KEY)!)).toEqual({ outliner: false, agent: true });
    first.shell.dispose();
    document.body.replaceChildren();
    const second = rig(store);
    second.shell.register(panel('outliner', { order: 20 }));
    second.shell.register(panel('agent', { order: 50, defaultOpen: false }));
    expect(second.shell.isOpen('outliner')).toBe(false);
    expect(second.shell.isOpen('agent')).toBe(true);
    // A kept value that is not a boolean, or a broken record, is the default.
    store.set(FORGE_PANELS_KEY, '{"outliner":"no"');
    document.body.replaceChildren();
    const third = rig(store);
    third.shell.register(panel('outliner', { order: 20 }));
    expect(third.shell.isOpen('outliner')).toBe(true);
  });

  it('shows a panel only on the surfaces it names and tells it when it is hidden', () => {
    const { shell, right, setSurface } = rig();
    const visible = vi.fn();
    shell.register(panel('builder', { availableIn: ['build'], mount: () => ({ visibility: visible, dispose: () => undefined }) }));
    const host = right.querySelector<HTMLElement>('[data-forge-panel="builder"]')!;
    expect(host.hidden).toBe(false);
    setSurface('walk');
    shell.update();
    expect(host.hidden).toBe(true);
    expect(visible).toHaveBeenLastCalledWith(false);
    expect(shell.menuItems()).toEqual([]);
    setSurface('build');
    shell.update();
    expect(visible).toHaveBeenLastCalledWith(true);
  });

  it('A1: frame() runs and visibility() says true only while a panel is actually shown -- open, its dock drawn', () => {
    const r = rig();
    const frame = vi.fn(), visible = vi.fn();
    r.shell.register(panel('poll', { mount: () => ({ frame, visibility: visible, dispose: () => undefined }) }));
    r.shell.frame(0.016, 1);
    expect(frame).toHaveBeenCalledTimes(1);
    expect(visible).not.toHaveBeenCalled();                        // taken as shown at its mount, and it is
    // Folded by the shell (a START row, a starters' Close): hidden at once, and its frame stops.
    r.shell.collapse('poll');
    expect(visible).toHaveBeenLastCalledWith(false);
    r.shell.frame(0.016, 2);
    expect(frame).toHaveBeenCalledTimes(1);
    r.shell.reveal('poll');
    expect(visible).toHaveBeenLastCalledWith(true);
    r.shell.frame(0.016, 3);
    expect(frame).toHaveBeenCalledTimes(2);
    // Folded and opened by hand (the summary's click: the details' toggle).
    const host = r.right.querySelector<HTMLDetailsElement>('[data-forge-panel="poll"]')!;
    host.open = false; host.dispatchEvent(new Event('toggle'));
    expect(visible).toHaveBeenLastCalledWith(false);
    host.open = true; host.dispatchEvent(new Event('toggle'));
    expect(visible).toHaveBeenLastCalledWith(true);
    // The docks folded away (Docks, Walk, a match): hidden, no frame; drawn again, the next frame says so and ticks it.
    r.setDocksDrawn(false);
    r.shell.refresh();
    expect(visible).toHaveBeenLastCalledWith(false);
    r.shell.frame(0.016, 4);
    expect(frame).toHaveBeenCalledTimes(2);
    r.setDocksDrawn(true);
    r.shell.frame(0.016, 5);
    expect(visible).toHaveBeenLastCalledWith(true);
    expect(frame).toHaveBeenCalledTimes(3);
    // One registered folded is told at once; a workspace panel is shown only while its workspace is.
    const folded = vi.fn(), work = vi.fn(), workFrame = vi.fn();
    r.shell.register(panel('late', { order: 20, defaultOpen: false, mount: () => ({ visibility: folded, dispose: () => undefined }) }));
    expect(folded).toHaveBeenCalledWith(false);
    r.shell.register(panel('graph', { dock: 'workspace', mount: () => ({ visibility: work, frame: workFrame, dispose: () => undefined }) }));
    expect(work).toHaveBeenLastCalledWith(false);
    r.shell.frame(0.016, 6);
    expect(workFrame).not.toHaveBeenCalled();
    r.shell.reveal('graph');
    expect(work).toHaveBeenLastCalledWith(true);
    r.shell.frame(0.016, 7);
    expect(workFrame).toHaveBeenCalledTimes(1);
    r.shell.back();
    expect(work).toHaveBeenLastCalledWith(false);
  });

  it('has a workspace slot (FUI.R5) that holds nothing open yet; a workspace panel opens over it with its title and Back closes it', () => {
    const { shell, workspace } = rig();
    expect(workspace.dataset['forgeDock']).toBe('workspace');
    expect(workspace.matches('section.fx-workspace[data-forge-workspace]')).toBe(true);
    expect(workspace.hidden).toBe(true);
    expect(shell.back()).toBe(false);
    shell.register(panel('graph', { dock: 'workspace', title: 'Mission graph' }));
    expect(workspace.hidden).toBe(true);
    shell.reveal('graph');
    expect(workspace.hidden).toBe(false);
    expect(workspace.querySelector('.fx-workspace-crumb')!.textContent).toBe('Forge › Mission graph');
    expect(workspace.querySelector('header.fx-workspace-head [data-forge-workspace-title]')!.textContent).toBe('Mission graph');
    expect(shell.isOpen('graph')).toBe(true);
    workspace.querySelector<HTMLButtonElement>('[data-forge-workspace-back]')!.click();
    expect(workspace.hidden).toBe(true);
    shell.reveal('graph');
    workspace.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(workspace.hidden).toBe(true);
    shell.reveal('graph');
    expect(shell.back()).toBe(true);
    expect(workspace.hidden).toBe(true);
  });

  it('lays a dock out stacked until five panels register, then as tabs (FUI.R5)', () => {
    expect([1, 5, 6].map(dockLayoutOf)).toEqual(['stacked', 'stacked', 'tabs']);
  });

  it('A4: past five panels the dock draws a tab strip, one tab open at a time; L1 / R1 step it while the focus is in the dock', () => {
    const r = rig();
    const six = [panel('inspector', { order: 10, tab: 'Edit' }), panel('outliner', { order: 20, tab: 'Edit' }), panel('view', { order: 30, tab: 'World' }),
      panel('settings', { order: 40, tab: 'World' }), panel('agent', { order: 50, defaultOpen: false, title: 'Connect your agent', tab: 'Agent' }),
      panel('starters', { order: 60, defaultOpen: false, title: 'Starter experiences' })];
    for (const p of six.slice(0, 5)) r.shell.register(p);
    expect(r.right.dataset['forgeDockLayout']).toBe('stacked');
    expect(r.right.querySelector('[data-forge-tabs]')).toBeNull();
    const open = (): string[] => r.shell.panels().filter((id) => r.shell.isOpen(id));
    expect(open()).toEqual(['inspector', 'outliner', 'view', 'settings']);
    r.shell.register(six[5]!);
    expect(r.right.dataset['forgeDockLayout']).toBe('tabs');
    const strip = r.right.firstElementChild as HTMLElement;
    expect(strip.matches('div.fx-dock-tabs[data-forge-tabs][role="tablist"]')).toBe(true);
    expect([...strip.querySelectorAll<HTMLButtonElement>('[data-forge-tab]')].every((button) => button.draggable)).toBe(true);
    expect([...r.right.querySelectorAll<HTMLElement>('details.fx-panel > summary')].some((summary) => summary.draggable)).toBe(false);
    const tabs = (): (string | null | undefined)[][] => [...strip.querySelectorAll<HTMLButtonElement>('button[role="tab"][data-forge-tab]')]
      .map((b) => [b.dataset['forgeTab'], b.textContent, b.getAttribute('aria-selected')]);
    expect(tabs()).toEqual([['edit', 'Edit', 'true'], ['world', 'World', 'false'], ['agent', 'Agent', 'false'], ['starters', 'Starter experiences', 'false']]);
    expect(open()).toEqual(['inspector', 'outliner']);             // the summaries stay; one tab's panels open
    expect(r.right.querySelectorAll('details.fx-panel > summary')).toHaveLength(6);
    strip.querySelector<HTMLButtonElement>('[data-forge-tab="world"]')!.click();
    expect(open()).toEqual(['view', 'settings']);
    expect(r.shell.tabOf('right')).toBe('world');
    // A reveal (the toolbar's Starters, a START row) opens its tab; its Close gives the tab before back.
    r.shell.reveal('starters');
    expect(open()).toEqual(['starters']);
    r.shell.collapse('starters');
    expect(open()).toEqual(['view', 'settings']);
    // A folded panel's summary opened by hand opens its tab.
    const agent = r.right.querySelector<HTMLDetailsElement>('[data-forge-panel="agent"]')!;
    agent.open = true; agent.dispatchEvent(new Event('toggle'));
    expect(open()).toEqual(['agent']);
    // R3-A (2): in tabs too, a panel's own open or folded choice is kept (the one key) -- the agent opened by hand, the
    // starters folded by their Close; a tab switch by itself writes nothing.
    expect(JSON.parse(r.store.data.get(FORGE_PANELS_KEY)!)).toEqual({ starters: false, agent: true });
    // L1 / R1: only while the focus is in the dock; they wrap; Circle gives the focus back to the editor.
    expect(r.shell.padInput('nextSection')).toBe(false);
    strip.querySelector<HTMLButtonElement>('[data-forge-tab="agent"]')!.focus();
    expect(r.shell.padInput('nextSection')).toBe(true);
    expect(r.shell.tabOf('right')).toBe('starters');
    expect(document.activeElement).toBe(strip.querySelector('[data-forge-tab="starters"]'));
    expect(r.shell.padInput('nextSection')).toBe(true);
    expect(r.shell.tabOf('right')).toBe('edit');
    expect(r.shell.padInput('prevSection')).toBe(true);
    expect(r.shell.tabOf('right')).toBe('starters');
    expect(open()).toEqual(['starters']);
    expect(r.shell.padInput('back')).toBe(true);
    expect(document.activeElement).toBe(document.body);
    expect(r.shell.padInput('prevSection')).toBe(false);
    // Back to five: stacked, the strip gone, the viewer's kept choices back (the agent's opened by hand in the tabs).
    r.shell.unregister('starters');
    expect(r.right.dataset['forgeDockLayout']).toBe('stacked');
    expect(r.right.querySelector('[data-forge-tabs]')).toBeNull();
    expect(r.shell.tabOf('right')).toBeNull();
    expect(open()).toEqual(['inspector', 'outliner', 'view', 'settings', 'agent']);
  });

  it('moves and persists a complete tab group; panel summaries are not drag handles', () => {
    const r = rig();
    const group = [
      panel('inspector', { order: 10, tab: 'Edit' }),
      panel('outliner', { order: 20, tab: 'Edit' }),
      panel('settings', { order: 30, tab: 'Edit' }),
      panel('view', { order: 40, tab: 'World' }),
      panel('starters', { order: 50, title: 'Starter experiences', tab: 'World' }),
      panel('agent', { order: 60, title: 'Connect your agent', tab: 'Agent' }),
      panel('files', { order: 70, title: 'Local files', tab: 'Content' }),
    ];
    for (const p of group) r.shell.register(p);

    r.shell.moveTab('right', 'edit', 'left');
    r.shell.moveTab('right', 'world', 'left');
    expect(r.shell.tabOf('left')).toBe('world');                     // a moved group opens where it lands (`moveTab`)
    expect([...r.left.querySelectorAll<HTMLElement>(':scope > details.fx-panel')].map((host) => host.dataset['forgePanel']))
      .toEqual(['inspector', 'outliner', 'settings', 'view', 'starters']);
    r.left.querySelector<HTMLButtonElement>('[data-forge-tab="world"]')!.click();
    const inspector = r.left.querySelector<HTMLDetailsElement>('[data-forge-panel="inspector"]')!;
    inspector.open = true;
    inspector.dispatchEvent(new Event('toggle'));
    expect(r.shell.tabOf('left'), 'opening a moved panel selects its current dock tab').toBe('edit');
    expect([...r.left.querySelectorAll<HTMLElement>('details.fx-panel > summary')].some((summary) => summary.draggable)).toBe(false);
    expect(JSON.parse(r.store.data.get(`${FORGE_PANELS_KEY}.layout`)!)).toMatchObject({
      inspector: 'left', outliner: 'left', settings: 'left', view: 'left', starters: 'left',
    });

    r.shell.moveTab('left', 'edit', 'right');
    r.shell.moveTab('left', 'world', 'right');
    expect(r.shell.tabOf('right')).toBe('world');                    // the group moved last opens
    expect(r.left.hidden).toBe(true);
    expect(JSON.parse(r.store.data.get(`${FORGE_PANELS_KEY}.layout`)!)).toMatchObject({
      inspector: 'right', outliner: 'right', settings: 'right', view: 'right', starters: 'right',
    });

    r.shell.moveTab('right', 'content', 'bottom');
    r.shell.moveTab('right', 'agent', 'bottom');
    expect(r.shell.tabOf('right')).toBe('world');                    // the right dock's open tab kept
    expect([...r.right.querySelectorAll<HTMLButtonElement>(':scope > [data-forge-tabs] [data-forge-tab]')].map((button) => button.textContent))
      .toEqual(['Edit', 'World']);
    expect(r.shell.tabOf('bottom')).toBe('agent');                     // the group moved last opens

    r.shell.collapse('inspector');
    r.shell.resetLayout();
    expect(r.left.hidden).toBe(true);
    expect([...r.right.querySelectorAll<HTMLElement>(':scope > details.fx-panel')].map((host) => host.dataset['forgePanel']))
      .toEqual(['inspector', 'outliner', 'settings', 'view', 'starters', 'agent', 'files']);
    expect(r.shell.tabOf('right')).toBe('edit');
    expect(r.shell.isOpen('inspector')).toBe(true);
    expect(JSON.parse(r.store.data.get(`${FORGE_PANELS_KEY}.layout`)!)).toEqual({});
  });

  it('keeps the center as a full-viewport tab dock with the viewport available as its own tab', () => {
    const r = rig();
    r.shell.register(panel('viewport', { dock: 'center', title: 'Viewport', tab: 'Viewport', order: 0, movable: false }));
    r.shell.register(panel('tool', { title: 'Tool', tab: 'Tool' }));

    expect(r.center.dataset['forgeDockLayout']).toBe('tabs');
    expect(r.shell.tabOf('center')).toBe('viewport');
    const viewportTab = r.center.querySelector<HTMLButtonElement>('[data-forge-tab="viewport"]');
    expect(viewportTab?.textContent).toBe('Viewport');
    expect(viewportTab?.draggable).toBe(false);

    r.shell.moveTab('right', 'tool', 'center');
    expect(r.shell.tabOf('center')).toBe('tool');
    expect(r.center.querySelector('[data-forge-tab="viewport"]')).not.toBeNull();
    expect(r.center.querySelector('[data-forge-tab="tool"]')?.getAttribute('aria-selected')).toBe('true');
    r.shell.moveTab('center', 'viewport', 'left');
    expect(r.center.querySelector('[data-forge-panel="viewport"]')).not.toBeNull();   // the viewport is not movable: it stays
  });

  it('FUI-22 (D6, FUI.R22): a tab shows only its own sections -- the others\' hidden, not folded in view; L1 / R1 and a reveal keep the jump inside the tabs', () => {
    const r = rig();
    const field = (id: string) => (host: HTMLElement) => { const b = document.createElement('button'); b.dataset['field'] = id; host.append(b); return { dispose: () => undefined }; };
    for (const p of [panel('inspector', { order: 10, tab: 'Edit', mount: field('inspector') }), panel('outliner', { order: 20, tab: 'Edit', mount: field('outliner') }),
      panel('view', { order: 30, tab: 'World', mount: field('view') }), panel('settings', { order: 40, tab: 'Edit', mount: field('settings') }),
      panel('agent', { order: 50, defaultOpen: false, title: 'Connect your agent', tab: 'Agent', mount: field('agent') }),
      panel('starters', { order: 60, defaultOpen: false, title: 'Starter experiences', tab: 'World', mount: field('starters') }),
      panel('files', { order: 70, title: 'Local files', tab: 'Content', mount: field('files') })]) r.shell.register(p);
    expect(r.right.dataset['forgeDockLayout']).toBe('tabs');
    const drawn = (): string[] => [...r.right.querySelectorAll<HTMLElement>(':scope > details.fx-panel')].filter((d) => !d.hidden).map((d) => d.dataset['forgePanel']!);
    const tab = (key: string): HTMLButtonElement => r.right.querySelector<HTMLButtonElement>(`[data-forge-tab="${key}"]`)!;
    expect([...r.right.querySelectorAll('[data-forge-tab]')].map((b) => b.textContent)).toEqual(['Edit', 'World', 'Agent', 'Content']);
    expect(drawn()).toEqual(['inspector', 'outliner', 'settings']);
    tab('world').click();
    expect(drawn(), 'World: the View and the starters').toEqual(['view', 'starters']);
    tab('agent').click();
    expect(drawn()).toEqual(['agent']);
    tab('content').click();
    expect(drawn()).toEqual(['files']);
    // L1 / R1 from inside the dock: the strip's own jump, the next tab's sections alone.
    tab('content').focus();
    expect(r.shell.padInput('nextSection')).toBe(true);
    expect(r.shell.tabOf('right')).toBe('edit');
    expect(drawn()).toEqual(['inspector', 'outliner', 'settings']);
    // A reveal of another tab's panel (a START row, the agent chip) takes its tab, the rest hidden.
    r.shell.reveal('starters');
    expect(r.shell.tabOf('right')).toBe('world');
    expect(drawn()).toEqual(['view', 'starters']);
    expect(r.shell.isOpen('starters')).toBe(true);
    // The state tick (update) keeps the filter; a hidden panel is not shown (no frame, no visibility).
    r.shell.update();
    expect(drawn()).toEqual(['view', 'starters']);
    expect(r.shell.isShown('inspector')).toBe(false);
    // Back to five panels: stacked, every panel drawn again.
    r.shell.unregister('files');
    r.shell.unregister('starters');
    expect(r.right.dataset['forgeDockLayout']).toBe('stacked');
    expect(drawn()).toEqual(['inspector', 'outliner', 'view', 'settings', 'agent']);
  });

  const sixPanels = (): ForgePanel[] => [panel('inspector', { order: 10, tab: 'Edit' }), panel('outliner', { order: 20, tab: 'Edit' }),
    panel('view', { order: 30, tab: 'World' }), panel('settings', { order: 40, tab: 'World' }),
    panel('agent', { order: 50, defaultOpen: false, title: 'Connect your agent', tab: 'Agent' }),
    panel('starters', { order: 60, defaultOpen: false, title: 'Starter experiences' })];

  it('R3-A (1): a redraw keeps the focused tab -- update() (the 250 ms state tick) neither replaces it nor drops the focus', () => {
    const r = rig();
    for (const p of sixPanels()) r.shell.register(p);
    r.shell.register(panel('extra', { order: 70, defaultOpen: false, title: 'Extra' }));
    const strip = r.right.querySelector<HTMLElement>('[data-forge-tabs]')!;
    const world = strip.querySelector<HTMLButtonElement>('[data-forge-tab="world"]')!;
    world.click();
    world.focus();
    expect(document.activeElement).toBe(world);
    r.shell.update();
    r.shell.update();
    expect(document.activeElement, 'the focus stays on the World tab').toBe(world);
    expect(world.isConnected).toBe(true);
    expect(world.getAttribute('aria-selected')).toBe('true');
    expect(r.shell.padInput('nextSection')).toBe(true);           // L1 / R1 still step the tabs
    expect(r.shell.tabOf('right')).toBe('agent');
    const agentTab = strip.querySelector<HTMLButtonElement>('[data-forge-tab="agent"]')!;
    expect(document.activeElement).toBe(agentTab);
    expect(world.getAttribute('aria-selected')).toBe('false');
    expect(world.tabIndex).toBe(-1);
    expect(agentTab.tabIndex).toBe(0);
    // A tab that goes (its panel unregistered) is the only button taken out; the others are the same buttons.
    const kept = [...strip.querySelectorAll('[data-forge-tab]')].slice(0, 4);
    r.shell.update();
    expect(document.activeElement).toBe(agentTab);
    r.shell.unregister('extra');
    expect([...strip.querySelectorAll('[data-forge-tab]')].map((b) => (b as HTMLElement).dataset['forgeTab'])).toEqual(['edit', 'world', 'agent', 'starters']);
    expect([...strip.querySelectorAll('[data-forge-tab]')]).toEqual(kept);
    expect(document.activeElement).toBe(agentTab);
  });

  it('R3-A (2): in tabs, a panel folded inside its tab stays folded across a reload (the same key); a tab of folded panels opens them all', () => {
    const store = memoryStore();
    const first = rig(store);
    for (const p of sixPanels()) first.shell.register(p);
    expect(first.shell.tabOf('right')).toBe('edit');
    const outliner = first.right.querySelector<HTMLDetailsElement>('[data-forge-panel="outliner"]')!;
    outliner.open = false;
    outliner.dispatchEvent(new Event('toggle'));
    expect(JSON.parse(store.data.get(FORGE_PANELS_KEY)!)).toEqual({ outliner: false });
    // A tab switch writes nothing, and the folded panel stays folded when its tab comes back.
    first.right.querySelector<HTMLButtonElement>('[data-forge-tab="world"]')!.click();
    first.right.querySelector<HTMLButtonElement>('[data-forge-tab="edit"]')!.click();
    expect(first.shell.isOpen('inspector')).toBe(true);
    expect(first.shell.isOpen('outliner')).toBe(false);
    expect(JSON.parse(store.data.get(FORGE_PANELS_KEY)!)).toEqual({ outliner: false });
    first.shell.dispose();
    document.body.replaceChildren();
    const second = rig(store);
    for (const p of sixPanels()) second.shell.register(p);
    expect(second.right.dataset['forgeDockLayout']).toBe('tabs');
    expect(second.shell.isOpen('inspector')).toBe(true);
    expect(second.shell.isOpen('outliner'), 'folded across the reload').toBe(false);
    // The Agent tab's one panel is folded by default: its tab still shows it.
    second.right.querySelector<HTMLButtonElement>('[data-forge-tab="agent"]')!.click();
    expect(second.shell.isOpen('agent')).toBe(true);
    second.shell.reveal('outliner');
    expect(second.shell.isOpen('outliner')).toBe(true);
    expect(JSON.parse(store.data.get(FORGE_PANELS_KEY)!)).toEqual({ outliner: true });
  });
});

describe('the Forge shell: one surface and edit rule (UX-13; FUI-1b B1)', () => {
  const flags = { lobbyHolds: false, serverMatch: false, match: false, walking: false, modal: false, checking: false, card: false, busy: false };

  it('canEdit is Build\'s only: false in Walk, Play, a lobby\'s hold or its match, under a dialog and while the check runs', () => {
    expect(forgeSurfaceState(flags)).toEqual({ surface: 'build', canEdit: true, canPlace: true, reason: null });
    expect(forgeSurfaceState({ ...flags, match: true, walking: true })).toEqual({ surface: 'play', canEdit: false, canPlace: false, reason: FORGE_REFUSALS.match });
    expect(forgeSurfaceState({ ...flags, walking: true })).toEqual({ surface: 'walk', canEdit: false, canPlace: false, reason: FORGE_REFUSALS.walking });
    expect(forgeSurfaceState({ ...flags, serverMatch: true, match: true })).toMatchObject({ surface: 'blocked', canEdit: false, reason: FORGE_REFUSALS.serverMatch });
    expect(forgeSurfaceState({ ...flags, lobbyHolds: true, walking: true })).toEqual({ surface: 'blocked', canEdit: false, canPlace: false, reason: LOBBY_HOLDS_REASON });
    expect(forgeSurfaceState({ ...flags, modal: true })).toMatchObject({ surface: 'build', canEdit: false, canPlace: false, reason: FORGE_REFUSALS.modal });
    expect(forgeSurfaceState({ ...flags, checking: true })).toMatchObject({ surface: 'build', canEdit: false, reason: FORGE_REFUSALS.checking });
  });

  it('canPlace adds no card open and not loading; the page\'s own refusal of an edit is still only the lobby\'s hold', () => {
    expect(forgeSurfaceState({ ...flags, card: true })).toEqual({ surface: 'build', canEdit: true, canPlace: false, reason: FORGE_REFUSALS.card });
    expect(forgeSurfaceState({ ...flags, busy: true })).toEqual({ surface: 'build', canEdit: true, canPlace: false, reason: FORGE_REFUSALS.busy });
    expect(forgeSurfaceState({ ...flags, walking: true, card: true }).reason).toBe(FORGE_REFUSALS.walking);   // the edit rule's word first
    expect(forgeEditRefusal({ lobbyHolds: false })).toBeNull();
    expect(forgeEditRefusal({ lobbyHolds: true })).toBe(LOBBY_HOLDS_REASON);
    expect((['build', 'walk', 'play', 'blocked'] as const).map(agentModeOf)).toEqual(['forge-editor', 'forge-play', 'forge-play', 'blocked']);
  });
});

describe('the Forge shell: its stylesheet (A2, A3, A4)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(resolve(here, '../../src/forge/forge.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  /** Each top-level rule's selector list and its declarations (an at-rule's own body is read as its inner rules). */
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1]!.trim().split(/\s*,\s*/), body: m[2]! }));
  const ruleOf = (selector: string): string => rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body).join(';');

  it('A2: a card registered into a dock takes the dock\'s width; the dialog\'s card keeps its 420 px', () => {
    expect(ruleOf('.fx-dock .fx-card')).toMatch(/(^|;)\s*width:\s*auto\s*(;|$)/);
    expect(ruleOf('.fx-dock .fx-card')).toMatch(/max-width:\s*100%/);
    expect(ruleOf('.fx-dock .fx-card')).toMatch(/overflow-x:\s*hidden/);
    expect(ruleOf('.fx-card')).toMatch(/width:\s*min\(420px, calc\(100vw - 32px\)\)/);
  });

  it('A3: the workspace dock is a fixed surface over the viewport under the toolbar, its header the crumb, the title and Back', () => {
    const ws = ruleOf('.fx-workspace');
    for (const d of [/position:\s*fixed/, /top:\s*var\(--fx-top\)/, /left:\s*0/, /right:\s*0/, /z-index:\s*var\(--fx-z-[a-z-]+\)/]) expect(ws).toMatch(d);
    expect(ruleOf('.fx-workspace[hidden]')).toMatch(/display:\s*none/);
    expect(ruleOf('.fx-workspace-head')).toMatch(/display:\s*flex/);
    expect(ruleOf('.fx-workspace-body')).toMatch(/overflow:\s*auto/);
  });

  it('A4: the tab strip and its open tab are drawn', () => {
    expect(ruleOf('.fx-dock-tabs')).toMatch(/display:\s*flex/);
    expect(ruleOf('.fx-dock-tabs')).toMatch(/flex:\s*0 0 auto/);
    expect(ruleOf('.fx-dock-tabs')).toMatch(/flex-wrap:\s*nowrap/);
    expect(ruleOf('.fx-left > .fx-dock-tabs')).toMatch(/margin:\s*calc\(-1 \* var\(--s2u-space-2\)\)\s+calc\(-1 \* var\(--s2u-space-2\)\)\s+0/);
    expect(ruleOf('.fx-dock-center')).toMatch(/top:\s*calc\(var\(--fx-top\)\s*\+\s*var\(--fx-dock-top\)\)/);
    expect(ruleOf('.fx-dock-center')).toMatch(/bottom:\s*calc\(var\(--fx-status\)\s*\+\s*var\(--fx-dock-bottom\)\)/);
    expect(ruleOf('.fx-dock-center')).toMatch(/display:\s*grid/);
    expect(ruleOf('.fx-dock-center')).toMatch(/grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
    expect(ruleOf('.fx-dock-center > .fx-panel')).toMatch(/display:\s*flex/);
    expect(ruleOf('.fx-dock-center > .fx-panel')).toMatch(/position:\s*relative/);
    expect(ruleOf('.fx-dock-center > .fx-panel > .fx-viewport')).toMatch(/position:\s*absolute/);
    expect(ruleOf('.fx-dock-tab')).toMatch(/flex:\s*0 0 auto/);
    expect(ruleOf('.fx-dock-tab')).toMatch(/border-radius:\s*var\(--fx-radius\) var\(--fx-radius\) 0 0/);   // the system's corner token (FUI-7)
    expect(ruleOf('.fx-dock-tab[aria-selected="true"]')).toMatch(/border-bottom-color/);
  });

  it('sizes dock previews and resize handles to match their destination docks', () => {
    expect(ruleOf(".fx-dock-preview[data-zone='left']")).toMatch(/width:\s*var\(--fx-left\)/);
    expect(ruleOf(".fx-dock-preview[data-zone='right']")).toMatch(/width:\s*var\(--fx-right\)/);
    expect(ruleOf(".fx-dock-preview[data-zone='top']")).toMatch(/height:\s*var\(--fx-dock-top\)/);
    expect(ruleOf(".fx-dock-preview[data-zone='bottom']")).toMatch(/height:\s*var\(--fx-dock-bottom\)/);
    expect(ruleOf(".fx-dock-preview[data-zone='center']")).toMatch(/inset:\s*calc\(var\(--fx-top\)\s*\+\s*var\(--fx-dock-top\)\)\s*var\(--fx-right\)\s*calc\(var\(--fx-status\)\s*\+\s*var\(--fx-dock-bottom\)\)\s*var\(--fx-left\)/);
    expect(ruleOf("body:not(.has-fx-dock-left) .fx-dock-preview[data-zone='center']")).toMatch(/left:\s*0/);
    expect(ruleOf("body:not(.has-fx-dock-right) .fx-dock-preview[data-zone='center']")).toMatch(/right:\s*0/);
    expect(ruleOf("body:not(.has-fx-dock-top) .fx-dock-preview[data-zone='center']")).toMatch(/top:\s*var\(--fx-top\)/);
    expect(ruleOf("body:not(.has-fx-dock-bottom) .fx-dock-preview[data-zone='center']")).toMatch(/bottom:\s*var\(--fx-status\)/);
    expect(ruleOf('.fx-left')).toMatch(/top:\s*var\(--fx-top\)/);
    expect(ruleOf('.fx-left')).toMatch(/bottom:\s*var\(--fx-status\)/);
    expect(ruleOf('.fx-right')).toMatch(/top:\s*var\(--fx-top\)/);
    expect(ruleOf('.fx-right')).toMatch(/bottom:\s*var\(--fx-status\)/);
    expect(ruleOf('body:not(.has-fx-dock-top) .fx-viewport')).toMatch(/top:\s*var\(--fx-top\)/);
    expect(ruleOf('body:not(.has-fx-dock-bottom) .fx-viewport')).toMatch(/bottom:\s*var\(--fx-status\)/);
    expect(ruleOf('.fx-dock-resizer--right')).toMatch(/top:\s*var\(--fx-top\)/);
    expect(ruleOf('.fx-dock-resizer--right')).toMatch(/bottom:\s*var\(--fx-status\)/);
  });
});

describe('the mounted Forge: the first registrants (FUI-1) and the editor seam (FUI-1b)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  const summaries = (): string[] => [...document.querySelectorAll('.fx-right > details.fx-panel > summary')].map((s) => s.textContent ?? '');

  it('registers Inspector, Outliner and Settings with their classes unchanged, then the starters; returns the shell', async () => {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    const shell = await mountForge(document, { onAgentReady: (a) => { api = a; } });
    expect(api.read().ready).toBe(true);
    // FUI-22 (D5): the Local files panel (the creator's pack loading) joins the right dock last, so six draw the tabs
    // even before the agent's dock is handed in. View controls live in the viewport dropdown, not a World panel.
    // The Environment panel (World: the map's light rig, fog, night and shadows, read only) between Rules and Settings.
    expect(summaries()).toEqual(['Outliner', 'Inspector', 'Rules', 'Environment', 'Settings', 'Starter experiences', 'Local files']);
    const panels = [...document.querySelectorAll<HTMLDetailsElement>('.fx-right > details.fx-panel')];
    // The Object tab shows at mount; Environment and Settings sit in World's (closed until it shows), Rules starts folded.
    expect(panels.map((d) => d.open)).toEqual([true, true, false, false, false, false, false]);
    expect(document.querySelector('.fx-right')!.getAttribute('data-forge-dock-layout')).toBe('tabs');
    // The bodies the e2e specs reach, as they were: directly under each details.
    expect(document.querySelector('[data-forge-panel="inspector"] > .fx-inspector .fx-fields .fx-field input.fx-num')).not.toBeNull();
    expect(document.querySelector('[data-forge-panel="outliner"] > div > .fx-outliner-tools > input.fx-search')).not.toBeNull();
    expect(document.querySelector('[data-forge-panel="outliner"] > div > ul.fx-outliner')).not.toBeNull();
    expect(document.querySelector('[data-forge-panel="view"]')).toBeNull();
    expect(document.querySelector('.fx-viewport-modes-list [aria-label="Wireframe"]')).not.toBeNull();
    expect(document.querySelector('[data-forge-panel="settings"] > .fx-settings select.fx-game-type[aria-label="Game type"]')).not.toBeNull();
    // The starters (FCW-03's card, unchanged): folded, no card in the page (its list would sit beside the Saves card's);
    // START > Panels shows it (R6: the toolbar's Starters button is gone, the rendered pass's R4), its Close folds it again.
    expect(document.querySelector('[data-creator-examples]')).toBeNull();
    expect(document.querySelector('[data-forge="examples"]')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    document.querySelector<HTMLElement>('.fx-menu li[data-forge-menu-row="panel-starters"]')!.click();
    expect(panels[5]!.open).toBe(true);
    expect(document.querySelector('.fx-dock [data-forge-panel="starters"] > .fx-card[data-creator-examples]')).not.toBeNull();
    [...document.querySelectorAll<HTMLButtonElement>('[data-creator-examples] button')].find((b) => b.textContent === 'Close')!.click();
    expect(panels[5]!.open).toBe(false);
    expect(document.querySelector('[data-creator-examples]')).toBeNull();
    expect(document.querySelector('.fx-workspace[data-forge-dock="workspace"][data-forge-workspace]')).not.toBeNull();
    expect(shell.register).toBeTypeOf('function');
  }, 90_000);

  it('places a panel handed in after Settings, collapsed, as the agent dock is (FUI.R3); six draw the review\'s tabs; the menu carries every section', async () => {
    const { mountForge } = await import('../../src/forge/page');
    const late: ForgePanel = { id: 'agent', title: 'Connect your agent', dock: 'right', order: 50, defaultOpen: false, padLegend: [], tab: 'Agent',
      menuSection: () => [{ id: 'panel-agent', label: 'Connect your agent' }],
      mount: (host, ctx) => { expect(ctx.forge.status().mode).toBe('forge-editor'); host.append(document.createElement('section')); return { dispose: () => undefined }; } };
    const shell = await mountForge(document, { panels: [Promise.resolve(late)] });
    await vi.waitFor(() => expect(summaries()).toEqual(['Outliner', 'Inspector', 'Rules', 'Environment', 'Settings', 'Connect your agent', 'Starter experiences', 'Local files']));
    expect(document.querySelector<HTMLDetailsElement>('[data-forge-panel="agent"]')!.open).toBe(false);
    // FUI.R5: the panels draw the tabs, Object open (the e2e specs' Outliner and Inspector together; Settings under World).
    expect(document.querySelector('.fx-right')!.getAttribute('data-forge-dock-layout')).toBe('tabs');
    expect([...document.querySelectorAll('.fx-right > [data-forge-tabs] [data-forge-tab]')].map((b) => b.textContent)).toEqual(['Object', 'World', 'Agent', 'Content']);
    expect([...document.querySelectorAll<HTMLDetailsElement>('.fx-right > details.fx-panel')].filter((d) => d.open).map((d) => d.dataset['forgePanel']))
      .toEqual(['outliner', 'inspector']);
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    const labels = [...document.querySelectorAll('.fx-menu li .fx-menu-label')].map((l) => l.textContent);
    const wanted = ['Inspector', 'Outliner', 'Settings', 'Wireframe', 'Day / night', 'Friendly fire', 'Connect your agent', 'Starter experiences', 'Saves'];
    for (const label of wanted) expect(labels).toContain(label);
    expect(labels.filter((l) => l === 'Connect your agent')).toHaveLength(1);
    expect([...document.querySelectorAll('.fx-menu li.is-head')].map((h) => h.textContent)).toContain(PANELS_MENU_HEADING);
    shell.unregister('agent');
    expect(summaries()).not.toContain('Connect your agent');
    // FUI-22: six remain (the Local files panel's), so the tabs stay; the Agent tab goes with its panel.
    expect(document.querySelector('.fx-right')!.getAttribute('data-forge-dock-layout')).toBe('tabs');
    expect([...document.querySelectorAll('.fx-right > [data-forge-tabs] [data-forge-tab]')].map((b) => b.textContent)).toEqual(['Object', 'World', 'Content']);
  }, 90_000);

  it('A4 fix-up: in tabs (the agent dock handed in), every dock control the e2e specs drive sits in an open panel -- Settings opens with Edit', async () => {
    const { mountForge } = await import('../../src/forge/page');
    const late: ForgePanel = { id: 'agent', title: 'Connect your agent', dock: 'right', order: 50, defaultOpen: false, padLegend: [], tab: 'Agent',
      mount: (host) => { host.append(document.createElement('section')); return { dispose: () => undefined }; } };
    await mountForge(document, { panels: [Promise.resolve(late)] });
    await vi.waitFor(() => expect(document.querySelector('.fx-right')!.getAttribute('data-forge-dock-layout')).toBe('tabs'));
    // Playwright drives a control only once it is visible, and a closed details' content is not (forgeDemolition.spec's
    // `getByLabel('Game type').selectOption`, forgeEditor.spec's outliner filter and search and the inspector's fields).
    const shown = (sel: string): boolean => {
      const at = document.querySelector(sel);
      if (!at) return false;
      for (let e: Element | null = at; e; e = e.parentElement) if (e instanceof HTMLDetailsElement && !e.open) return false;
      return true;
    };
    for (const sel of ['.fx-outliner-tools select', '.fx-outliner-tools input', '.fx-inspector .fx-field input', 'ul.fx-outliner']) {
      expect(shown(sel), sel).toBe(true);
    }
    expect(document.querySelector('.fx-right > [data-forge-tabs] [aria-selected="true"]')!.textContent).toBe('Object');
    expect(document.querySelector('.fx-right > [data-forge-tabs] [data-forge-tab="object"]')!.getAttribute('title')).toContain('Outliner');
    // Settings is under World: its Game type shown once that tab is (forgeDemolition.spec opens it first).
    document.querySelector<HTMLButtonElement>('.fx-right > [data-forge-tabs] [data-forge-tab="world"]')!.click();
    expect(shown('select.fx-game-type[aria-label="Game type"]')).toBe(true);
    expect(document.querySelector('.fx-right > [data-forge-tabs] [data-forge-tab="world"]')!.getAttribute('title')).toContain('Settings');
  }, 90_000);

  it('remembers a folded panel across a reload of the page', async () => {
    const { mountForge } = await import('../../src/forge/page');
    await mountForge(document);
    const outliner = document.querySelector<HTMLDetailsElement>('[data-forge-panel="outliner"]')!;
    outliner.open = false;
    outliner.dispatchEvent(new Event('toggle'));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    await mountForge(document);
    expect(document.querySelector<HTMLDetailsElement>('[data-forge-panel="outliner"]')!.open).toBe(false);
    expect(document.querySelector<HTMLDetailsElement>('[data-forge-panel="inspector"]')!.open).toBe(true);
  }, 90_000);

  it('R3-A (2): with the agent dock handed in (six panels, tabs), a folded Outliner stays folded across a reload', async () => {
    const { mountForge } = await import('../../src/forge/page');
    const agentDock = (): ForgePanel => ({ id: 'agent', title: 'Connect your agent', dock: 'right', order: 50, defaultOpen: false, padLegend: [], tab: 'Agent',
      mount: (host) => { host.append(document.createElement('section')); return { dispose: () => undefined }; } });
    const layout = (): string | null => document.querySelector('.fx-right')!.getAttribute('data-forge-dock-layout');
    await mountForge(document, { panels: [Promise.resolve(agentDock())] });
    await vi.waitFor(() => expect(layout()).toBe('tabs'));
    const outliner = document.querySelector<HTMLDetailsElement>('[data-forge-panel="outliner"]')!;
    expect(outliner.open).toBe(true);
    outliner.open = false;
    outliner.dispatchEvent(new Event('toggle'));
    await new Promise((done) => setTimeout(done, 5));              // the browser's own queued toggle events run
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    await mountForge(document, { panels: [Promise.resolve(agentDock())] });
    await vi.waitFor(() => expect(layout()).toBe('tabs'));
    await new Promise((done) => setTimeout(done, 5));
    expect(document.querySelector<HTMLDetailsElement>('[data-forge-panel="outliner"]')!.open).toBe(false);
    expect(document.querySelector<HTMLDetailsElement>('[data-forge-panel="inspector"]')!.open).toBe(true);
  }, 90_000);

  it('B2: ctx.editor stages the real piece off the scene and places it as one history step; a lapsed admission is refused and disposed', async () => {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    let ctx: ForgePanelContext | null = null;
    const drop: ForgePanel = { id: 'drop', title: 'Drop', dock: 'right', order: 70, defaultOpen: false, padLegend: [],
      mount: (_host, c) => { ctx = c; return { dispose: () => undefined }; } };
    await mountForge(document, { onAgentReady: (a) => { api = a; }, panels: [drop] });
    await vi.waitFor(() => expect(ctx).not.toBeNull());
    const c = ctx as unknown as ForgePanelContext;
    expect(c.state()).toMatchObject({ surface: 'build', canEdit: true, canPlace: true, reason: null });
    // A prop the facade's record carries (`<archive>:<prototype>`), its archive the disc's (here a synthetic one, as
    // `forgeAgentPage.test.ts` builds it).
    const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
    archiveLoad.mockResolvedValue({ ...blankLibraryMap('MP84', 1000), path: 'synthetic/MP84', world: [floorMesh(1000)],
      props: [{ modelName: 'synthetic', parts: [floorMesh(4)], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        order: 0, alternate: false, facade: 0, lod: null, paths: ['synthetic/prop'] }] } as LoadedMap);
    const editor = c.editor!;
    expect(editor).toBeDefined();
    const before = api.read();
    expect(await editor.stagePiece('MP84:absent')).toBeNull();     // no such prototype: nothing staged
    const staged = await editor.stagePiece('MP84:synthetic');
    expect(staged).not.toBeNull();
    expect(staged!.asset).toBe('MP84:synthetic');
    expect(staged!.object.parent).toBeNull();                      // off the scene
    expect(api.read().layout).toEqual(before.layout);              // staging writes nothing
    expect(api.read().canUndo).toBe(before.canUndo);
    const placed = await editor.place(staged!, [40, 0, 0], 0);
    expect(placed, JSON.stringify(placed)).toMatchObject({ ok: true });
    expect(placed.revision).toBe(api.read().revision);
    expect(staged!.disposed).toBe(true);
    expect(api.read().layout!.pieces).toHaveLength(before.layout!.pieces.length + 1);
    expect(api.read().canUndo).toBe(true);
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout).toEqual(before.layout);              // one step undoes it all
    // A staged piece placed again, or one the page did not stage, is refused.
    expect(await editor.place(staged!, [0, 0, 0])).toMatchObject({ ok: false, code: 'NOT_STAGED' });
    // Staged, then the admission lapses (the START menu opened over the editor): refused, disposed, nothing written.
    const lapsed = await editor.stagePiece('MP84:synthetic');
    expect(lapsed).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    expect(c.state()).toMatchObject({ canEdit: true, canPlace: false, reason: FORGE_REFUSALS.card });
    const refused = await editor.place(lapsed!, [40, 0, 0]);
    expect(refused).toMatchObject({ ok: false, code: 'ADMISSION_LOST' });
    expect(lapsed!.disposed).toBe(true);
    expect(api.read().layout).toEqual(before.layout);
    // Nor is a piece staged while a placement is not admitted.
    expect(await editor.stagePiece('MP84:synthetic')).toBeNull();
  }, 90_000);
});

describe('the Forge shell: a panel\'s editor is the page\'s, whole (R4 5, the round 3 review)', () => {
  it('every member of the page\'s editor reaches the panel through ctx.editor -- viewport, projectDrop, sourceIdentity and a later one -- with only stagePiece and place its own', async () => {
    const view = document.createElement('main');
    const source = {};
    const pieces: StagedPiece[] = [];
    const stagedPiece = (asset: string): StagedPiece => {
      let gone = false;
      const s: StagedPiece = { asset, object: {} as StagedPiece['object'], get disposed() { return gone; }, dispose: vi.fn(() => { gone = true; }),
        show: vi.fn(), hide: vi.fn() };
      pieces.push(s);
      return s;
    };
    // a page editor of a class (its members on the prototype, one reading `this`), with a member the contract does not name yet
    class PageEditor implements ForgeEditor {
      private readonly view = view;
      stagePiece = vi.fn(async (asset: string) => stagedPiece(asset));
      place = vi.fn(async (staged: StagedPiece) => { staged.dispose(); return { ok: true, revision: 2 }; });
      viewport(): HTMLElement { return this.view; }
      projectDrop(x: number, y: number) { return { point: [x, 0, y] as [number, number, number], snapped: [x, 0, y] as [number, number, number], yaw: 0.5 }; }
      sourceIdentity(asset: string): object | null { return asset === 'MP84:crate' ? source : null; }
      later(): string { return `${this.view.tagName}:later`; }
    }
    const pageEditor = new PageEditor();
    const abort = new AbortController();
    const page: ForgePageContext = {
      get forge(): ForgeAgentApi { throw new Error('no facade'); },
      editor: pageEditor,
      ui: { notify: vi.fn(), toast: vi.fn(), reveal: vi.fn(), collapse: vi.fn() },
      state: () => ({ surface: 'build', canEdit: true, canPlace: true, reason: null, revision: 1 }),
      store: memoryStore(), doc: document,
    };
    const ctx = panelContext(page, abort.signal);
    const editor = ctx.editor as ForgeEditor & { later?(): string };
    expect(editor).toBeDefined();
    expect(editor.viewport()).toBe(view);
    expect(editor.projectDrop(3, 4)).toEqual({ point: [3, 0, 4], snapped: [3, 0, 4], yaw: 0.5 });
    expect(editor.sourceIdentity('MP84:crate')).toBe(source);
    expect(editor.sourceIdentity('MP84:else')).toBeNull();
    expect(typeof editor.later).toBe('function');                 // a member the shell does not name passes through
    expect(editor.later!()).toBe('MAIN:later');
    expect(ctx.editor).toBe(editor);                              // one wrapper a registration
    // the per-panel tracking stays: a piece staged and not placed is disposed when the panel's signal aborts
    const kept = await editor.stagePiece('MP84:crate');
    const placed = await editor.stagePiece('MP84:crate');
    expect(await editor.place(placed!, [0, 0, 0])).toMatchObject({ ok: true });
    expect(pageEditor.place).toHaveBeenCalledOnce();
    abort.abort();
    expect(kept!.disposed).toBe(true);
    expect(kept!.dispose).toHaveBeenCalledOnce();
    expect(placed!.dispose).toHaveBeenCalledOnce();               // the page's place, not the abort's
    expect(await editor.stagePiece('MP84:crate')).toBeNull();     // a piece staged after the abort is let go at once
    expect(pieces.at(-1)!.disposed).toBe(true);
  });
});
