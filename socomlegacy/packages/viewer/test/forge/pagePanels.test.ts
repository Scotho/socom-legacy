// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgePanel } from '../../src/forge/shell/panel';
import type { ForgePanelContext } from '../../src/forge/shell/context';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';
// FC2-4: found and pressed through the contributor's editor (`./helpers/EDITOR-MAP.md`).
import {
  assetTile, assetTiles, dockOf, inspector as inspectorPanel, inspectorField, menubarRow, menuOpen, menuRow, openMenu, outliner,
  outlinerSection, panel, panelMounted, showPanel, showTab, snapToggle, tabButton, userRows,
} from './helpers/editor';

/**
 * FUI-22 (the owner, 2026-10-27: "The Asset Viewer should dissapear, but keep the object preview and add it as a tooltip
 * overlay on any of the hovered or active Assets"; "In that pass, include a right panel UI refresh and a left panel polish
 * pass."; "please make mouse wheel spin assets in forge too. Esc to cancel selection" ... "when you have an item queued
 * to place"; a browser adaptation, FG.R2 -- the game has no editor, nothing here is the original's): on the mounted
 * Forge, D5 / FUI.R21 the one asset list, D3 its polish, D6 / FUI.R22 the right dock's tabs that filter, D2 its one
 * section style, D1 the tooltip on that list, D4 the wheel and Escape with a prop queued. The page is mounted as
 * `pagePalette.test.ts` mounts it (only the GPU and disc I/O replaced); IndexedDB is `fake-indexeddb`.
 */

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
const archiveEntries = vi.hoisted(() => [] as { stem: string; path: string; label: string; campaign: boolean }[]);
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: archiveEntries, problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

const here = dirname(fileURLToPath(import.meta.url));
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
async function syntheticArchive(stem: string, models: readonly string[]): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  return {
    ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000)],
    props: models.map((modelName) => ({ modelName, parts: [floorMesh(4)], matrices: IDENTITY.slice(), order: 0, alternate: false, facade: 0, lod: null, paths: [`world/${modelName}`] })),
  } as LoadedMap;
}
function probePanel(): { panel: ForgePanel; ctx: () => ForgePanelContext | null } {
  let ctx: ForgePanelContext | null = null;
  const panel: ForgePanel = { id: 'probe', title: 'Probe', dock: 'workspace', order: 90, defaultOpen: false, padLegend: [],
    mount: (_host, c) => { ctx = c; return { dispose: () => undefined }; } };
  return { panel, ctx: () => ctx };
}
const css = readFileSync(resolve(here, '../../src/forge/forge.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1]!.trim().split(/\s*,\s*/), body: m[2]! }));
const ruleOf = (selector: string): string => rules.filter((r) => r.selectors.includes(selector)).map((r) => r.body).join(';');

describe('FUI-22: the Forge\'s panels pass on the mounted page', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    // jsdom has no scrollIntoView; the prop step scrolls the picked row into view.
    if (!('scrollIntoView' in Element.prototype)) Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
    // One map a stem, as `Archives.load` keeps one promise a stem: a staged piece's source is the same loaded map.
    const loaded = new Map<string, Promise<LoadedMap>>();
    archiveLoad.mockReset().mockImplementation((stem) => {
      let p = loaded.get(stem);
      if (!p) { p = syntheticArchive(stem, ['crate', 'barrel']); loaded.set(stem, p); }
      return p;
    });
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mounted(panels: ForgePanel[] = []): Promise<ForgeAgentApi> {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (a) => { api = a; }, panels });
    const based = await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision);
    expect(based, JSON.stringify(based)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(assetTiles(document)).toHaveLength(2));   // map A1: the Assets panel's list
    return api;
  }
  const tile = (asset: string): HTMLElement => assetTile(document, asset);
  const tip = (): HTMLElement | null => document.querySelector<HTMLElement>('.fx-asset-tip');
  const tipName = (): string | null => tip()?.querySelector('.fx-preview-name')?.textContent ?? null;
  const key = (code: string, k = code): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: k, bubbles: true, cancelable: true })); };

  it("FP-1b, under FC2.R2 (2): the Environment's light rig editor edits a disc map and a blank floor alike; the copied sky is a blank floor's alone", async () => {
    // FC2.R2 (2) (the owner, 2026-11-13: a layout may relight and re-fog a disc map in a Forge-started match): the
    // contributor's page shows the rig editor on a disc map too (`envEditable`, page.ts:3679; `rigEditor.body.hidden`
    // page.ts:3769, `rigEditor.top.hidden` page.ts:1415), where FP-1b hid it. A disc map's sky stays its own: the copied
    // dome's choices are a blank floor's alone (`skyChoices`, page.ts:1369) -- a disc map's Sky list holds only None.
    const api = await mounted();
    const body = (): HTMLElement => document.querySelector<HTMLElement>('.fx-light-rig')!;
    const top = (): HTMLElement => document.querySelector<HTMLElement>('.fx-light-rig__top')!;
    const skies = (): number => body().querySelector<HTMLSelectElement>('select.fx-light-rig__sky')!.options.length;
    await vi.waitFor(() => expect(body().hidden, 'a disc map is edited too (FC2.R2 (2))').toBe(false));
    expect(top().hidden).toBe(false);
    expect(body().querySelector('[aria-label="Night vision lens alpha"]')).not.toBeNull();
    expect(skies(), "a disc map keeps its own sky: None alone").toBe(1);
    const blank = await api.execute('layout.base', { base: { kind: 'blank', library: 'MP2' } }, api.read().revision);
    expect(blank, JSON.stringify(blank)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(skies(), "a blank floor's sky: None, then the disc maps'").toBeGreaterThan(1));
    expect(body().hidden).toBe(false);
    expect(top().hidden).toBe(false);
    expect(body().querySelector('[aria-label="Night vision lens alpha"]')).not.toBeNull();
    const back = await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision);
    expect(back, JSON.stringify(back)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(skies()).toBe(1));
    expect(body().hidden).toBe(false);
  }, 90_000);

  it('D5 / D3: one asset list -- the archive select, filter row, view settings popup, previews and counts; the creator grid gone, its pack loading the Content tab\'s', async () => {
    // FC2-4: the same intent on the contributor's dock shell (`./helpers/EDITOR-MAP.md` D1, D3, D6-D8, D11): the assets
    // group (the old left dock), the viewport's group (the old centre), Window > Reset layout (the toolbar's button gone).
    await mounted();
    const left = dockOf(document, 'assets');
    expect(panel(document, 'viewport').querySelector(':scope > .fx-viewport')).not.toBeNull();
    const viewportTab = tabButton(document, 'viewport');
    expect(viewportTab.textContent).toBe('Viewport');
    expect(viewportTab.querySelector('.fx-dg-tab-close'), 'the viewport cannot be closed or moved').toBeNull();
    expect(document.querySelector<HTMLElement>('.fx-dg-target--center')?.textContent, 'the drop guide\'s middle: a tab').toBe('Tab');
    expect(menubarRow(document, 'Window', 'Reset layout').disabled).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));   // the menu shut
    expect(left.querySelector('.fx-asset-preview, [aria-label="Asset preview"]')).toBeNull();
    expect(left.querySelector<HTMLElement>('#fx-asset-view-popup')?.hidden).toBe(true);
    const assetsPanel = panel(document, 'asset-browser');
    expect(assetsPanel.closest('.fx-dg-group'), 'the asset palette is the Assets tab').toBe(left);
    expect(tabButton(document, 'assets').querySelector('.fx-dg-tab-close'), 'a movable tab: it closes and docks').not.toBeNull();
    expect(left.querySelectorAll('ul.fx-assets'), 'one list').toHaveLength(1);
    expect(assetsPanel!.querySelector(':scope > .fx-assets-pane > select.fx-select')).not.toBeNull();
    // The search and the filters on one row, not the status strip's chips (whose rule clipped it), and never shrunk.
    const row = assetsPanel!.querySelector<HTMLElement>(':scope > .fx-assets-pane > .fx-asset-filters')!;
    expect(row).not.toBeNull();
    expect(row.matches('.fx-chips')).toBe(false);
    expect(row.querySelector('input.fx-search')).not.toBeNull();
    expect([...row.querySelectorAll('button.fx-chip')].map((b) => b.getAttribute('aria-label') ?? b.textContent))
      .toEqual(['All', 'Favourites', 'Characters', 'Asset view options']);
    expect(row.querySelector('[aria-label="Asset view options"] svg')).not.toBeNull();
    // The format (list / grid) at the browser's foot, under the list.
    const modes = assetsPanel!.querySelector<HTMLElement>('.fx-asset-display-modes')!;
    expect(modes.querySelector('[aria-label="List view"] svg')).not.toBeNull();
    expect(modes.querySelector('[aria-label="Grid view"] svg')).not.toBeNull();
    expect(document.querySelector('.fx-viewport-modes-summary svg')).not.toBeNull();
    expect(assetsPanel!.querySelector<HTMLUListElement>('.fx-assets')?.dataset['view']).toBe('grid');
    expect(ruleOf('.fx-asset-filters')).toMatch(/flex:\s*none/);
    // Its bar always shown (scroll), thin, its gutter kept.
    expect(ruleOf('.fx-assets')).toMatch(/overflow-y:\s*scroll/);
    expect(ruleOf('.fx-assets')).toMatch(/scrollbar-width:\s*thin/);
    expect(ruleOf('.fx-assets')).toMatch(/scrollbar-gutter:\s*stable/);
    // FC2-4: dropped -- `.fx-assets::-webkit-scrollbar`'s 12 px (his stylesheet has no such rule) and
    // `.fx-right > .fx-panel[data-forge-panel="asset-browser"]`'s flex (no right dock, EDITOR-MAP D2).
    // A tile: its star, its name, its count, draggable, a control of its own to focus.
    const barrel = tile('MP2:barrel');
    expect(barrel.draggable).toBe(true);
    expect(barrel.querySelector('button.fx-star')).not.toBeNull();
    expect(barrel.querySelector('button.fx-asset-pick .fx-asset-name')!.textContent).toBe('barrel');
    // Its placed count in the list view (a grid tile shows its picture and name only), then the grid again.
    modes.querySelector<HTMLButtonElement>('[aria-label="List view"]')!.click();
    expect(tile('MP2:barrel').textContent).toContain('×1');
    modes.querySelector<HTMLButtonElement>('[aria-label="Grid view"]')!.click();
    // A favourite stays the same row style, starred, first.
    barrel.querySelector<HTMLButtonElement>('button.fx-star')!.click();
    expect(tile('MP2:barrel').querySelector('.fx-star')!.classList.contains('is-on')).toBe(true);
    expect(assetTiles(document)[0]!.getAttribute('data-asset')).toBe('MP2:barrel');
    // The pack loading: the Local files panel, the Content tab (EDITOR-MAP A4), the page's one file chooser.
    const files = showPanel(document, 'creator-assets');
    expect(files).not.toBeNull();
    expect(files.querySelector(':scope > summary')!.textContent).toBe('Local files');
    expect(files.querySelector('input[type="file"]')).not.toBeNull();
    expect(document.querySelectorAll('input[type="file"][aria-label="Add local files"]')).toHaveLength(1);
  }, 90_000);

  it('D6 / D2: his tabs (Object, Map, Content) each show their own sections; one section style; the Inspector\'s sticky head; one stepper', async () => {
    // FC2-4: the same intent on the contributor's dock shell (`./helpers/EDITOR-MAP.md` D2, D6, D8, O2-O4, I1-I3): the
    // old right dock is his Object / Map / Content / Agent group over the Inspector's own; World is his Map tab, and the
    // Rules panel is under Map (panels/rulesPanel.ts:179); the outliner's tree is two section rows.
    const api = await mounted();
    const tabs = (): string[] => [...dockOf(document, 'object').querySelectorAll<HTMLElement>(':scope > .fx-dg-tabs .fx-dg-tab')].map((b) => b.dataset['forgeTab'] ?? '');
    const drawnIn = (key: string): string[] =>
      [...dockOf(document, key).querySelectorAll<HTMLElement>(':scope > .fx-dg-body > details.fx-panel')].map((d) => d.dataset['forgePanel']!);
    expect(tabs().slice(0, 3)).toEqual(['object', 'map', 'content']);
    expect(drawnIn('object')).toEqual(['outliner']);
    expect(drawnIn('inspector')).toEqual(['inspector']);
    const tree = outliner(document);
    // One tree (his: two top-level sections, User Objects then Map Objects, each folding what it holds).
    expect([...tree.querySelectorAll<HTMLElement>(':scope > li.fx-outliner-section')].map((li) => li.dataset['outlinerSection'])).toEqual(['user', 'map']);
    outlinerSection(document, 'map').click();
    expect(outlinerSection(document, 'map').getAttribute('aria-expanded')).toBe('false');
    outlinerSection(document, 'map').click();
    expect(outlinerSection(document, 'map').getAttribute('aria-expanded')).toBe('true');
    showTab(document, 'map');
    // Map (the old World): the settings, the environment (the layout's lighting and the map's own), the rules, the starters.
    expect(drawnIn('map'), 'view controls are in the viewport dropdown').toEqual(['settings', 'environment', 'rules', 'starters']);
    const settings = panel(document, 'settings').querySelector<HTMLElement>('.fx-settings')!;
    expect(settings.querySelector('input[aria-label="Grid step"], input[aria-label="Turn step (°)"], input[aria-label="Snap"]')).toBeNull();
    expect(settings.querySelector('[data-forge-setting="assetTips"]')).toBeNull();
    const environment = panel(document, 'environment').querySelector<HTMLElement>('.fx-environment')!;
    expect(environment.querySelector('input[aria-label="Night to day"]')).not.toBeNull();   // Day / night, moved from Settings
    expect(panel(document, 'settings').querySelector('input[aria-label="Night to day"]')).toBeNull();
    showTab(document, 'content');
    expect(drawnIn('content')).toEqual(['creator-assets']);
    showTab(document, 'object');
    // The menu's Panels row brings the starters' tab (Map) forward, the starters open.
    openMenu(document);
    menuRow(document, 'panel-starters').click();
    expect(drawnIn('map')).toEqual(['settings', 'environment', 'rules', 'starters']);
    expect((panel(document, 'starters') as HTMLDetailsElement).open).toBe(true);
    // One section style: every open section's body is the one .fx-section, its padding and gap on the tokens.
    for (const t of ['object', 'map', 'content']) {
      showTab(document, t);
      for (const d of dockOf(document, t).querySelectorAll<HTMLDetailsElement>(':scope > .fx-dg-body > details.fx-panel[open]')) {
        expect(d.querySelectorAll(':scope > .fx-section'), d.dataset['forgePanel']).toHaveLength(1);
      }
    }
    // His rule's selector names the workbench beside the old dock (`:is(.fx-dock, .fx-workbench) .fx-panel > .fx-section`).
    const section = rules.filter((r) => r.selectors.join(', ').includes('.fx-workbench) .fx-panel > .fx-section')).map((r) => r.body).join(';');
    expect(section).toMatch(/padding:\s*var\(--s2u-space-/);
    expect(section).toMatch(/gap:\s*var\(--s2u-space-/);
    for (const old of ['.fx-inspector', '.fx-view', '.fx-settings']) expect(ruleOf(old), `${old}'s own padding gone`).not.toMatch(/padding/);
    expect(ruleOf('.fx-section h3'), 'one sub-heading').toMatch(/text-transform:\s*uppercase/);
    // Every number field of the docked panels is the one stepper control.
    const numbers = ['outliner', 'inspector', 'settings', 'environment', 'rules', 'starters', 'creator-assets']
      .flatMap((id) => [...panelMounted(document, id).querySelectorAll<HTMLInputElement>('input[type="number"]')]);
    expect(numbers.length).toBeGreaterThanOrEqual(7);
    // A field named by its title, its data-label, else its aria-label (his reverb fields carry only the last).
    expect(numbers.filter((i) => !i.classList.contains('fx-stepper')).map((i) => i.title || i.dataset['label'] || i.getAttribute('aria-label'))).toEqual([]);
    expect(ruleOf('.fx-stepper')).toMatch(/height:/);
    // The Inspector's head: sticky, the selection's name and kind; nothing selected said in one line.
    showTab(document, 'object');
    const head = inspectorPanel(document).querySelector<HTMLElement>('.fx-inspect-head')!;
    expect(head).not.toBeNull();
    expect(inspectorPanel(document).querySelectorAll('.fx-position-fields .fx-field')).toHaveLength(3);
    expect(inspectorPanel(document).querySelector('.fx-rotation-fields .fx-field > input[data-label="Yaw"]')).not.toBeNull();
    const field = (label: string): HTMLInputElement => inspectorField(document, label);
    expect(ruleOf('.fx-inspect-head')).toMatch(/position:\s*sticky/);
    expect(head.querySelector('.fx-inspect-name')!.textContent).toBe('Nothing selected');
    expect(head.querySelector('.fx-inspect-kind')!.textContent).toBe('');
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(head.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece'));
    expect(head.querySelector('.fx-inspect-name')!.textContent).toContain('crate');
    // Pitch, roll and scale (FX-9: real, the FX-9 case below edits them): the piece's own values, each field live.
    await vi.waitFor(() => expect(field('Pitch').value).toBe('0'));
    expect([field('Roll').value, field('Scale X').value, field('Scale Y').value, field('Scale Z').value]).toEqual(['0', '1', '1', '1']);
    expect([field('Pitch'), field('Roll'), field('Scale X')].some((i) => i.disabled)).toBe(false);
    expect(userRows(document)[0]?.textContent).toContain('crate');
    for (const at of [[10, 0, 0], [20, 0, 0]]) {
      expect(await api.execute('piece.place', { asset: 'MP2:crate', at }, api.read().revision)).toMatchObject({ ok: true });
    }
    userRows(document)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    userRows(document)[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(userRows(document).filter((r) => r.classList.contains('is-on'))).toHaveLength(3);
    if (!menuOpen(document)) openMenu(document);
    expect(document.querySelector('.fx-menu-list [data-forge-menu-row="frame-selection"]')?.classList.contains('is-off')).toBe(false);
  }, 90_000);

  it('FX-9: a piece takes Pitch 30, Roll -45 and Scale 2 / 1 / 0.5 from the Inspector, one step each; undo, redo, a save and a reopen keep it', async () => {
    // The owner, 2026-11-11 (FX.R3: "finish scale and rotate 100%"; a browser adaptation, FG.R2): the record keeps a
    // piece's pitch, roll and scale (FX-1), so Crispy's fields edit -- each change one step, as Yaw's (FUI-6).
    const api = await mounted();
    showTab(document, 'object');                                    // map D6: the Object tab (the Outliner's)
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    const inspector = inspectorPanel(document);                     // map I1: its own tab, drawn
    await vi.waitFor(() => expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece'));
    const shown = (e: Element | null): boolean => {
      for (let n = e; n && n !== inspector; n = n.parentElement) if ((n as HTMLElement).hidden) return false;
      return e !== null;
    };
    const field = (label: string): HTMLInputElement => inspector.querySelector<HTMLInputElement>(`input[data-label="${label}"]`)!;
    const values = (): string[] => ['Pitch', 'Yaw', 'Roll', 'Scale X', 'Scale Y', 'Scale Z'].map((l) => field(l).value);
    const typed = (label: string, value: string): void => { const f = field(label); f.value = value; f.dispatchEvent(new Event('change')); };
    const undoBtn = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!;
    const redoBtn = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-forge="redo"]')!;
    const poses = (): unknown => (api.read().layout as { poses?: unknown }).poses;
    // Shown and live for a piece: the Rotation row's three fields and the Scale row, each bounded as the record is.
    for (const label of ['X', 'Y', 'Z', 'Pitch', 'Yaw', 'Roll', 'Scale X', 'Scale Y', 'Scale Z']) {
      expect(shown(field(label)), label).toBe(true);
      expect(field(label).disabled, label).toBe(false);
    }
    expect(shown(inspector.querySelector('.fx-scale-fields')), 'the Scale row').toBe(true);
    expect([field('Pitch').min, field('Pitch').max, field('Scale X').min, field('Scale X').max]).toEqual(['-90', '90', '0.1', '4']);
    // Pitch 30: one step, named as Yaw's ("Rotate"), the record keeping it.
    let revision = api.read().revision;
    typed('Pitch', '30');
    expect(api.read().revision).toBeGreaterThan(revision);
    expect(undoBtn().title).toMatch(/^Undo: Rotate · pad SELECT/);
    expect(poses()).toEqual([[0, 30, 0, 1, 1, 1]]);
    // Scale 2 / 1 / 0.5: an axis a step ("Set scale"); Y unchanged at 1 makes no step.
    typed('Scale X', '2');
    expect(undoBtn().title).toMatch(/^Undo: Set scale · pad SELECT/);
    revision = api.read().revision;
    typed('Scale Y', '1');
    expect(api.read().revision, 'a value already kept makes no step').toBe(revision);
    typed('Scale Z', '0.5');
    expect(poses()).toEqual([[0, 30, 0, 2, 1, 0.5]]);
    expect(values()).toEqual(['30', '0', '0', '2', '1', '0.5']);
    // A roll shown signed (-45), the record keeping 315.
    typed('Roll', '-45');
    expect(values()).toEqual(['30', '0', '-45', '2', '1', '0.5']);
    expect(poses()).toEqual([[0, 30, 315, 2, 1, 0.5]]);
    // A finer value is rounded and shown rounded; one past the bounds is held at them.
    typed('Scale Y', '9');
    expect(field('Scale Y').value).toBe('4');
    typed('Scale Y', '1.004');
    expect(field('Scale Y').value).toBe('1');
    expect(poses()).toEqual([[0, 30, 315, 2, 1, 0.5]]);
    // A yaw typed keeps the tilt and the scale.
    typed('Yaw', '90');
    expect(values()).toEqual(['30', '90', '-45', '2', '1', '0.5']);
    expect(api.read().layout!.pieces[0]![4]).toBe(90);
    // Undo walks back one step an edit; redo brings it back.
    undoBtn().click();
    await vi.waitFor(() => expect(values()).toEqual(['30', '0', '-45', '2', '1', '0.5']));
    redoBtn().click();
    await vi.waitFor(() => expect(values()).toEqual(['30', '90', '-45', '2', '1', '0.5']));
    // Saved and reopened (the record, then back: `layout.import` reads it through `layoutOfRecord`): the piece as left.
    const saved = JSON.parse(JSON.stringify(api.read().layout)) as Record<string, unknown>;
    expect(saved['poses']).toEqual([[0, 30, 315, 2, 1, 0.5]]);
    expect(await api.execute('layout.import', { layout: saved }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(api.read().layout!.pieces).toHaveLength(1));
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(values()).toEqual(['30', '90', '-45', '2', '1', '0.5']));
    expect(poses()).toEqual([[0, 30, 315, 2, 1, 0.5]]);
    // A finer pitch is rounded (30.4 is the 30 kept: no step); one past 90 is held at 90, where the roll goes into the
    // yaw (the record's one form at the gimbal: yaw 90 less a roll of -45 is 135).
    const reopened = api.read().revision;
    typed('Pitch', '30.4');
    expect(field('Pitch').value).toBe('30');
    expect(api.read().revision, 'the value kept: no step').toBe(reopened);
    typed('Pitch', '120');
    expect(api.read().revision).toBeGreaterThan(reopened);
    expect(values()).toEqual(['90', '135', '0', '2', '1', '0.5']);
    expect(poses()).toEqual([[0, 90, 0, 2, 1, 0.5]]);
    expect(api.read().layout!.pieces[0]![4]).toBe(135);
  }, 90_000);

  it("FC2-2: a pose field's scrub cancelled (Escape) puts back what it carried -- a parent's X scrubbed then cancelled, its child back at its place too", async () => {
    // Ours, written at the contributor's import (MISSION OT.R112: his tree, `Layout.tree`): FX-9's early cancel restores
    // the placement inside `carrying`, so the children the scrub's preview carried go back with it. A control: it holds
    // what the page does now (the main controller's condition).
    const api = await mounted();
    showTab(document, 'object');                                    // map D6: the Object tab (the Outliner's)
    for (const at of [[0, 0, 0], [50, 0, 0]]) expect(await api.execute('piece.place', { asset: 'MP2:crate', at }, api.read().revision)).toMatchObject({ ok: true });
    // The tree: piece 1 under piece 0, read back through the record as a saved layout is.
    const saved = JSON.parse(JSON.stringify(api.read().layout)) as Record<string, unknown>;
    expect(await api.execute('layout.import', { layout: { ...saved, tree: [['piece:1', 'piece:0']] } }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(api.read().layout!.pieces).toHaveLength(2));
    expect((api.read().layout as { tree?: unknown }).tree).toEqual([['piece:1', 'piece:0']]);
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    const inspector = inspectorPanel(document);                     // map I1: its own tab, drawn
    await vi.waitFor(() => expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece'));
    const x = inspector.querySelector<HTMLInputElement>('input[data-label="X"]')!;
    const at = (ref: string): number[] => (api.read().refs as { ref: string; at: number[] }[]).find((r) => r.ref === ref)!.at;
    const [parent0, child0] = [at('piece:0'), at('piece:1')];
    // The scrub's live preview: the parent 30 along X, its child carried by the same step.
    x.dispatchEvent(new CustomEvent('fx-scrub', { detail: { value: parent0[0]! + 30 } }));
    expect(at('piece:0')[0]).toBeCloseTo(parent0[0]! + 30, 4);
    expect(at('piece:1')[0], 'the child carried').toBeCloseTo(child0[0]! + 30, 4);
    // Escape: both back where they were.
    x.dispatchEvent(new CustomEvent('fx-scrub', { detail: { value: parent0[0]! + 30, cancelled: true } }));
    for (const [k, v] of parent0.entries()) expect(at('piece:0')[k], `parent ${k}`).toBeCloseTo(v, 4);
    for (const [k, v] of child0.entries()) expect(at('piece:1')[k], `child ${k}`).toBeCloseTo(v, 4);
  }, 90_000);

  it("FX-9's review: a turn step (the `.` and `,` keys, the pad's turn) turns a piece about the vertical from its own yaw and keeps its tilt and scale; a paste keeps a copy's scale", async () => {
    // The fresh review of FX-9: `turnSelected` set `rotation.set(0, rotation.y + step, 0)`, which wiped a piece's pitch and
    // roll, and read three's XYZ angle as the yaw -- wrong past 90 degrees once the Yaw field writes the quaternion. And
    // the clipboard kept a piece's turn but not its scale. Players turn a piece with the pad: this is their main path.
    const api = await mounted();
    showTab(document, 'object');                                    // map D6: the Object tab (the Outliner's)
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    const inspector = inspectorPanel(document);                     // map I1: its own tab, drawn
    await vi.waitFor(() => expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece'));
    const field = (label: string): HTMLInputElement => inspector.querySelector<HTMLInputElement>(`input[data-label="${label}"]`)!;
    const values = (): string[] => ['Pitch', 'Yaw', 'Roll', 'Scale X', 'Scale Y', 'Scale Z'].map((l) => field(l).value);
    const typed = (label: string, value: string): void => { const f = field(label); f.value = value; f.dispatchEvent(new Event('change')); };
    const undoBtn = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!;
    const poses = (): unknown => (api.read().layout as { poses?: unknown }).poses;
    const yawOfPiece = (i: number): number => api.read().layout!.pieces[i]![4] as number;

    // An UNTILTED piece first, its yaw typed past 90 (the Yaw field writes the quaternion): `.` is one turn step right.
    typed('Yaw', '135');
    expect(yawOfPiece(0)).toBe(135);
    let revision = api.read().revision;
    key('Period', '.');
    expect(api.read().revision, 'one step').toBeGreaterThan(revision);
    expect(yawOfPiece(0), 'a turn step from 135, not from the XYZ angle 45').toBe(120);
    expect(poses(), 'an untilted piece writes no pose row').toBeUndefined();
    key('Comma', ',');
    expect(yawOfPiece(0)).toBe(135);

    // Tilted and scaled: the turn step changes the yaw alone.
    typed('Pitch', '30');
    typed('Roll', '10');
    typed('Scale X', '2');
    typed('Scale Z', '0.5');
    expect(values()).toEqual(['30', '135', '10', '2', '1', '0.5']);
    revision = api.read().revision;
    key('Period', '.');
    expect(api.read().revision, 'one step').toBeGreaterThan(revision);
    expect(undoBtn().title).toMatch(/^Undo: Rotate · pad SELECT/);
    expect(values(), 'the pitch, the roll and the scale kept').toEqual(['30', '120', '10', '2', '1', '0.5']);
    expect(poses()).toEqual([[0, 30, 10, 2, 1, 0.5]]);
    expect(yawOfPiece(0)).toBe(120);
    // Undo is that one step: the yaw back, the tilt and the scale as they were.
    undoBtn().click();
    await vi.waitFor(() => expect(values()).toEqual(['30', '135', '10', '2', '1', '0.5']));
    expect(poses()).toEqual([[0, 30, 10, 2, 1, 0.5]]);

    // A copy pasted at a point (the agent's paste, then Ctrl+C / Ctrl+V): the copy is the size and the tilt of its source.
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('selection.copy', {}, api.read().revision)).toMatchObject({ ok: true, data: { copied: 1 } });
    const pasted = await api.execute('selection.paste', { at: [120, 0, 120] }, api.read().revision);
    expect(pasted, JSON.stringify(pasted)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(api.read().layout!.pieces).toHaveLength(2));
    expect(poses(), "the agent's paste").toEqual([[0, 30, 10, 2, 1, 0.5], [1, 30, 10, 2, 1, 0.5]]);
    const chord = (code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.slice(3).toLowerCase(), ctrlKey: true })); };
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    chord('KeyC');
    chord('KeyV');
    await vi.waitFor(() => expect(api.read().layout!.pieces).toHaveLength(3));
    expect(poses(), 'Ctrl+V').toEqual([[0, 30, 10, 2, 1, 0.5], [1, 30, 10, 2, 1, 0.5], [2, 30, 10, 2, 1, 0.5]]);
  }, 90_000);

  it('FX-9: a scrubbed Pitch or Scale previews live with no step; Escape puts the piece back; the release is one step', async () => {
    const api = await mounted();
    showTab(document, 'object');                                    // map D6: the Object tab (the Outliner's)
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    const inspector = inspectorPanel(document);                     // map I1: its own tab, drawn
    await vi.waitFor(() => expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece'));
    const field = (label: string): HTMLInputElement => inspector.querySelector<HTMLInputElement>(`input[data-label="${label}"]`)!;
    const pointer = (target: EventTarget, type: string, x: number): void => {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 }));
    };
    const revision = api.read().revision;
    // Pitch dragged 20 px (a degree a pixel): the piece pitched live, no step.
    pointer(field('Pitch'), 'pointerdown', 100);
    pointer(document, 'pointermove', 110);
    pointer(document, 'pointermove', 120);
    const poses = (): unknown => (api.read().layout as { poses?: unknown }).poses;
    expect(field('Pitch').value).toBe('20');
    expect(poses()).toEqual([[0, 20, 0, 1, 1, 1]]);
    expect(api.read().revision, 'a preview is no edit').toBe(revision);
    // Escape mid-drag: the piece and the field back, still no step.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    expect(field('Pitch').value).toBe('0');
    expect(poses()).toBeUndefined();
    expect(api.read().revision).toBe(revision);
    // The Escape is the scrub one, not the editor deselect: the piece stays selected.
    expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece');
    // The same for every other field the scrub previews: Roll, a Scale axis, a Position axis, each back exactly.
    const escaped = (label: string, px: number): void => {
      pointer(field(label), 'pointerdown', 100);
      pointer(document, 'pointermove', 100 + px);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    };
    pointer(field('Roll'), 'pointerdown', 100);
    pointer(document, 'pointermove', 130);
    expect(poses(), 'Roll previews').toBeDefined();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    expect(poses(), 'Roll put back').toBeUndefined();
    pointer(field('Scale Z'), 'pointerdown', 100);
    pointer(document, 'pointermove', 150);
    expect(poses()).toEqual([[0, 0, 0, 1, 1, 1.5]]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    expect(poses(), 'Scale Z put back').toBeUndefined();
    expect(field('Scale Z').value).toBe('1');
    escaped('X', 10);
    expect(api.read().layout!.pieces[0]![1], 'X put back').toBeCloseTo(0, 9);
    expect(field('X').value).toBe('0');
    expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece');
    expect(api.read().revision).toBe(revision);
    // Scale X dragged 100 px (0.01 a pixel) and let go: one step, on the lattice.
    pointer(field('Scale X'), 'pointerdown', 0);
    pointer(document, 'pointermove', 100);
    expect(poses()).toEqual([[0, 0, 0, 2, 1, 1]]);
    expect(api.read().revision).toBe(revision);
    pointer(document, 'pointerup', 100);
    expect(api.read().revision).toBeGreaterThan(revision);
    expect(field('Scale X').value).toBe('2');
    expect(document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!.title).toMatch(/^Undo: Set scale · pad SELECT/);
  }, 90_000);

  it('FX-9: a marker keeps a yaw alone: its Pitch, Roll and Scale stay off and empty, and a change to one makes no edit', async () => {
    const api = await mounted();
    showTab(document, 'object');                                    // map D6: the Object tab (the Outliner's)
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('selection.set', { refs: ['spawn:0'] }, api.read().revision)).toMatchObject({ ok: true });
    const inspector = inspectorPanel(document);                     // map I1: its own tab, drawn
    await vi.waitFor(() => expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe('Spawn'));
    const field = (label: string): HTMLInputElement => inspector.querySelector<HTMLInputElement>(`input[data-label="${label}"]`)!;
    for (const label of ['Pitch', 'Roll', 'Scale X', 'Scale Y', 'Scale Z']) {
      expect(field(label).disabled, label).toBe(true);
      expect(field(label).value, label).toBe('');
    }
    expect(field('Yaw').disabled).toBe(false);
    const revision = api.read().revision;
    const f = field('Pitch');
    f.value = '30';
    f.dispatchEvent(new Event('change'));
    expect(api.read().revision, 'no edit for a marker').toBe(revision);
    expect(field('Pitch').value).toBe('');
    expect((api.read().layout as { poses?: unknown }).poses).toBeUndefined();
  }, 90_000);

  it('D1: a hovered tile shows the tooltip with its name; the pad\'s prop step shows it beside the picked tile at once; Escape hides it; the setting turns it off', async () => {
    await mounted();
    expect(tip(), 'one overlay').not.toBeNull();
    expect(tip()!.hidden).toBe(true);
    const over = (el: Element): void => {
      const e = new MouseEvent('pointerover', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'pointerType', { value: 'mouse' });
      el.dispatchEvent(e);
    };
    over(tile('MP2:crate').querySelector('.fx-asset-name')!);
    expect(tip()!.hidden, 'a short delay first').toBe(true);
    await vi.waitFor(() => expect(tip()!.hidden).toBe(false));
    await vi.waitFor(() => expect(tip()!.textContent).toContain('crate'), { timeout: 5_000 });
    expect(tipName()).toBe('crate');
    key('Escape');
    expect(tip()!.hidden).toBe(true);
    // The pad's (and ] key's) prop step: the next prop picked, its tooltip beside it with no hover.
    key('BracketRight', ']');
    expect(tip()!.hidden).toBe(false);
    await vi.waitFor(() => expect(tipName()).toBe('barrel'));
    expect(tile('MP2:barrel').classList.contains('is-on')).toBe(true);
    key('Escape');
    expect(tip()!.hidden).toBe(true);
    // The Forge setting: off, a hover shows nothing.
    // Map A2: the Assets panel's own view options (its dock, D1, is the contributor's).
    panel(document, 'asset-browser').querySelector<HTMLButtonElement>('[aria-label="Asset view options"]')!.click();
    const setting = panel(document, 'asset-browser').querySelector<HTMLInputElement>('input[aria-label="Asset preview on hover"]')!;
    expect(setting).not.toBeNull();
    expect(setting.checked).toBe(true);
    setting.click();
    expect(setting.checked).toBe(false);
    over(tile('MP2:crate').querySelector('.fx-asset-name')!);
    await new Promise((done) => setTimeout(done, 700));
    expect(tip()!.hidden).toBe(true);
  }, 90_000);

  it('D4: with a prop queued a wheel notch turns it one turn step and the camera keeps its speed; with none the wheel is the camera\'s; Escape cancels the queue, then the selection', async () => {
    const probe = probePanel();
    const api = await mounted([probe.panel]);
    await vi.waitFor(() => expect(probe.ctx()).not.toBeNull());
    const editor = probe.ctx()!.editor!;
    const input = document.querySelector<HTMLElement>('.fx-input')!;
    input.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const speed = (): string => document.querySelector('.fx-cell--speed')!.textContent ?? '';
    const yaw = (): number => { const p = editor.projectDrop(400, 300); expect('yaw' in p, JSON.stringify(p)).toBe(true); return (p as { yaw: number }).yaw; };
    const wheel = (deltaY: number): WheelEvent => { const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }); input.dispatchEvent(e); return e; };
    const turn = (a: number, b: number): number => Math.round((((b - a) * 180 / Math.PI) % 360 + 540) % 360 - 180);
    // A placement selected, then a prop queued (the Place tool, a chosen prop).
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().selection).toEqual(['piece:0']);
    tile('MP2:barrel').click();
    expect((api.read().view as { tool: string }).tool).toBe('place');
    const turnStep = (api.read().view as { turnStep: number }).turnStep;
    expect(turnStep).toBe(15);
    const before = yaw(), was = speed();
    expect(wheel(-100).defaultPrevented).toBe(true);
    expect(turn(before, yaw()), 'one notch, one turn step').toBe(15);
    wheel(-100);
    expect(turn(before, yaw())).toBe(30);
    wheel(100);
    expect(turn(before, yaw())).toBe(15);
    expect(speed(), 'the camera unmoved').toBe(was);
    expect(document.querySelector('.fx-status-msg')!.textContent).toMatch(/15°/);
    // Escape (the owner, 2026-11: "on any of the tools ... set the current tool to select tool and deselect any objects"):
    // the queue cancelled, the Select tool, and the selection dropped, at once.
    key('Escape');
    expect((api.read().view as { tool: string }).tool).toBe('select');
    expect(probe.ctx()!.palette!.chosen()).toBeNull();
    expect(api.read().selection).toEqual([]);
    // Nothing queued: the wheel is the camera's -- in the forge it moves the camera along its look, its speed kept.
    const at = (): unknown => (api.read().view as { camera: unknown }).camera;
    const from = JSON.stringify(at());
    wheel(-100);
    await vi.waitFor(() => expect(JSON.stringify(at())).not.toBe(from));
    expect(speed()).toBe(was);
  }, 90_000);

  it('F1 (the review): a new palette row starts unturned; with snap on a changed Turn step keeps the carried turn on the new grid', async () => {
    const probe = probePanel();
    const api = await mounted([probe.panel]);
    await vi.waitFor(() => expect(probe.ctx()).not.toBeNull());
    const editor = probe.ctx()!.editor!;
    const input = document.querySelector<HTMLElement>('.fx-input')!;
    input.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    const yaw = (): number => { const p = editor.projectDrop(400, 300); expect('yaw' in p, JSON.stringify(p)).toBe(true); return (p as { yaw: number }).yaw; };
    const wheel = (deltaY: number): void => { input.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })); };
    const turn = (a: number, b: number): number => Math.round((((b - a) * 180 / Math.PI) % 360 + 540) % 360 - 180);
    tile('MP2:barrel').click();
    const before = yaw();
    wheel(-100); wheel(-100);
    expect(turn(before, yaw())).toBe(30);
    tile('MP2:crate').click();
    expect(turn(before, yaw()), 'another prop picked: unturned').toBe(0);
    // Snap on: three notches (45 deg) at 15, then the step 20: the carried turn lies on the 20 deg grid.
    expect(await api.execute('snap.set', { on: true, rotation: 15 }, api.read().revision)).toMatchObject({ ok: true });
    expect(snapToggle(document, 'Rotation snap').classList.contains('is-on')).toBe(true);   // EDITOR-MAP V1: his snap pill
    wheel(-100); wheel(-100); wheel(-100);
    expect(await api.execute('snap.set', { on: true, rotation: 20 }, api.read().revision)).toMatchObject({ ok: true });
    const deg = (yaw() * 180) / Math.PI;
    const r = ((deg % 20) + 20) % 20;
    expect(Math.min(r, 20 - r), 'the yaw on the new grid').toBeLessThan(0.01);
  }, 90_000);

  describe('FUI-22 fold: every route to a new asset starts it unturned; re-picking the same asset keeps its turn', () => {
    const setup = async () => {
      const probe = probePanel();
      const api = await mounted([probe.panel]);
      await vi.waitFor(() => expect(probe.ctx()).not.toBeNull());
      const editor = probe.ctx()!.editor!;
      const input = document.querySelector<HTMLElement>('.fx-input')!;
      input.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) });
      const yaw = (): number => (editor.projectDrop(400, 300) as { yaw: number }).yaw;
      const wheel = (deltaY: number): void => { input.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })); };
      const turn = (a: number, b: number): number => Math.round((((b - a) * 180 / Math.PI) % 360 + 540) % 360 - 180);
      tile('MP2:barrel').click();
      const before = yaw();
      wheel(-100); wheel(-100);
      expect(turn(before, yaw())).toBe(30);
      return { api, yaw, before, turn };
    };
    it('the pad menu\'s Props screen: a different prop arrives unturned', async () => {
      const { yaw, before, turn } = await setup();
      openMenu(document);                                           // map T1: Controls > Forge menu (M), the pointer's way
      const props = await vi.waitFor(() => { const r = document.querySelector<HTMLElement>('.fx-menu li[data-forge-menu-row="props"]'); expect(r).not.toBeNull(); return r!; });
      props.click();
      const cell = await vi.waitFor(() => { const r = document.querySelector<HTMLElement>('.fx-menu li[data-forge-menu-row="prop-MP2:crate"]'); expect(r).not.toBeNull(); return r!; });
      cell.click();
      expect(turn(before, yaw()), 'chooseProp: unturned').toBe(0);
    }, 90_000);
    it('the pad\'s previous/next prop step: the next prop arrives unturned', async () => {
      const { yaw, before, turn } = await setup();
      key('BracketRight', ']');
      expect(tile('MP2:crate').classList.contains('is-on')).toBe(true);
      expect(turn(before, yaw()), 'stepAsset: unturned').toBe(0);
    }, 90_000);
    it('the seam\'s choose (palette.choose): a different prop arrives unturned', async () => {
      const { api, yaw, before, turn } = await setup();
      expect(await api.execute('palette.choose', { asset: 'MP2:crate' }, api.read().revision)).toMatchObject({ ok: true });
      expect(turn(before, yaw()), 'the facade choose: unturned').toBe(0);
    }, 90_000);
    it('re-picking the same asset keeps its turn', async () => {
      const { yaw, before, turn } = await setup();
      tile('MP2:barrel').click();
      expect(turn(before, yaw())).toBe(30);
    }, 90_000);
  });

  it('F2 (the review): picking a tile by its button keeps focus on the redrawn tile and the tooltip on it', async () => {
    await mounted();
    const button = tile('MP2:barrel').querySelector<HTMLButtonElement>('.fx-asset-pick')!;
    button.focus();
    button.click();
    const now = tile('MP2:barrel');
    expect(now.classList.contains('is-on')).toBe(true);
    expect(document.activeElement, 'focus on the redrawn pick button').toBe(now.querySelector('.fx-asset-pick'));
    expect(tip()!.hidden).toBe(false);
    expect(now.getAttribute('aria-describedby')).toBe(tip()!.id);
  }, 90_000);
});

/**
 * Found against main 600eb91bd during FUI-22's rendered pass (the panels pass owns the right dock): PF.R60's detail
 * distance row is a `label.fx-toggle` holding a range input, and the toggle's `.fx-toggle input` rule drew any input in
 * a toggle row as the 28x14 switch pill. The switch rule now reaches only checkboxes; the range takes the panels' own
 * slider style (`.fx-range`) and the row's free width.
 */
describe('FUI-22: the View panel\'s detail distance draws as a slider, not a switch', () => {
  it('the row\'s input is an `.fx-range`; the switch rule reaches checkboxes only; the slider fills the row', async () => {
    const { buildDetailDistance } = await import('../../src/forge/panels/viewPanel');
    const { input, row } = buildDetailDistance(document, { ps2: () => false, value: () => 2, step: () => undefined }, () => undefined);
    expect(input.type).toBe('range');
    expect(input.classList.contains('fx-range')).toBe(true);
    expect(row.classList.contains('fx-toggle')).toBe(true);
    expect(ruleOf('.fx-toggle input')).toBe('');
    expect(ruleOf('.fx-toggle input[type=checkbox]')).toMatch(/appearance:\s*none/);
    expect(ruleOf('.fx-toggle input[type=checkbox]')).toMatch(/width:\s*28px/);
    expect(ruleOf('.fx-detail-distance .fx-range')).toMatch(/flex:\s*1 1 auto/);
  });
});

/**
 * FP-2 (FP.R5; a browser adaptation, FG.R2 -- the game has no editor): Draw > Picture's RENDER SCALE row, built on the
 * detail distance's shape (`buildDetailDistance`): a three-stop slider over the presets, its word, disabled under the PS2
 * picture (which draws the console's 640 x 448), and moving it writes the page's one video setting (`../../src/videoSettings`
 * `VIDEO_SETTINGS_KEY`, the launcher's and VIDEO OPTIONS') through the page's storage door.
 */
describe('FP-2: the Draw dropdown\'s render scale row on the mounted page', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveEntries.length = 0;
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('a 3-stop slider after the detail distance, its word; disabled under PS2; moving it writes the keeper\'s key; a change elsewhere redraws it', async () => {
    const { pageSettings } = await import('../../src/pageStore');
    const { VIDEO_SETTINGS_KEY, videoSettingsKeeper } = await import('../../src/videoSettings');
    const { mountForge } = await import('../../src/forge/page');
    await mountForge(document, {});
    const row = document.querySelector<HTMLLabelElement>('.fx-viewport-modes-list .fx-render-scale')!;
    expect(row, 'the row in Draw').not.toBeNull();
    expect(row.classList.contains('fx-viewport-mode')).toBe(true);
    expect(row.classList.contains('fx-toggle')).toBe(true);
    expect(row.previousElementSibling?.classList.contains('fx-detail-distance'), 'right after the detail distance').toBe(true);
    const input = row.querySelector<HTMLInputElement>('input')!;
    const word = (): string => row.querySelector('.fx-render-scale__value')?.textContent ?? '';
    expect(row.textContent).toContain('Render scale');
    expect([input.type, input.min, input.max, input.step]).toEqual(['range', '0', '2', '1']);
    expect(input.classList.contains('fx-range')).toBe(true);
    expect(input.value).toBe('1');                                                // nothing stored: Balanced
    expect(word()).toBe('Balanced');
    // moved: the keeper's key through the page's door (`pageSettings`)
    const set = vi.spyOn(pageSettings, 'set');
    input.value = '2';
    input.dispatchEvent(new Event('input'));
    expect(set).toHaveBeenCalledWith(VIDEO_SETTINGS_KEY, expect.any(String));
    expect(JSON.parse(localStorage.getItem(VIDEO_SETTINGS_KEY)!)).toMatchObject({ renderScale: 'quality' });
    expect(word()).toBe('Quality');
    // a change from VIDEO OPTIONS (the page's shared keeper) redraws the row
    videoSettingsKeeper().set({ renderScale: 'performance' });
    expect(input.value).toBe('0');
    expect(word()).toBe('Performance');
    // under the PS2 picture: the console's frame, the row disabled, a move ignored
    const ps2 = document.querySelector<HTMLInputElement>('input[aria-label="PS2 picture (640×448)"]')!;
    ps2.checked = true;
    ps2.dispatchEvent(new Event('change'));
    expect(input.disabled).toBe(true);
    expect(word()).toBe('640 x 448 (PS2)');
    expect(row.title).toMatch(/PS2 picture draws the console's/);
    input.value = '2';
    input.dispatchEvent(new Event('input'));
    expect(JSON.parse(localStorage.getItem(VIDEO_SETTINGS_KEY)!)).toMatchObject({ renderScale: 'performance' });
    ps2.checked = false;
    ps2.dispatchEvent(new Event('change'));
    expect(input.disabled).toBe(false);
    expect(word()).toBe('Performance');
  }, 90_000);

  it('the row\'s CSS: the detail distance\'s rules copied for fx-render-scale, the value span wide enough for the longest word', async () => {
    expect(ruleOf('.fx-render-scale .fx-range')).toBe(ruleOf('.fx-detail-distance .fx-range'));
    // FP-2 review 1: the value span holds the longest word ("Performance", 11 characters), so the slider keeps its width
    // between stops; the detail distance's 3.5ch fits its own fixed-width numbers only.
    expect(ruleOf('.fx-render-scale__value')).toMatch(/min-width:\s*11ch/);
    expect(Math.max(...Object.values((await import('../../src/videoSettings')).RENDER_SCALE_WORDS).map((w) => w.length))).toBeLessThanOrEqual(11);
    expect(ruleOf('.fx-viewport-mode.fx-render-scale')).toBe(ruleOf('.fx-viewport-mode.fx-detail-distance'));
    expect(ruleOf('.fx-viewport-mode.fx-render-scale > span:first-child')).toBe(ruleOf('.fx-viewport-mode.fx-detail-distance > span:first-child'));
    expect(ruleOf('.fx-render-scale .fx-range')).toMatch(/flex:\s*1 1 auto/);
  });
});
