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
    await vi.waitFor(() => expect(document.querySelectorAll('.fx-left ul.fx-assets > li[data-asset]')).toHaveLength(2));
    return api;
  }
  const tile = (asset: string): HTMLElement => document.querySelector<HTMLElement>(`.fx-left ul.fx-assets > li[data-asset="${asset}"]`)!;
  const tip = (): HTMLElement | null => document.querySelector<HTMLElement>('.fx-asset-tip');
  const tipName = (): string | null => tip()?.querySelector('.fx-preview-name')?.textContent ?? null;
  const key = (code: string, k = code): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: k, bubbles: true, cancelable: true })); };

  it('D5 / D3: one asset list -- the archive select, the filter row on one line, stars and counts; no Asset preview; the creator grid gone, its pack loading the Content tab\'s', async () => {
    await mounted();
    const left = document.querySelector<HTMLElement>('.fx-left')!;
    expect(left.querySelector('.fx-asset-preview, [aria-label="Asset preview"]')).toBeNull();
    expect(left.textContent).not.toContain('Asset preview');
    expect(left.querySelectorAll('details.fx-panel'), 'no panel of its own in the left dock').toHaveLength(0);
    expect(left.querySelectorAll('ul.fx-assets'), 'one list').toHaveLength(1);
    expect(left.querySelector(':scope > select.fx-select')).not.toBeNull();
    // The search and the filters on one row, not the status strip's chips (whose rule clipped it), and never shrunk.
    const row = left.querySelector<HTMLElement>(':scope > .fx-asset-filters')!;
    expect(row).not.toBeNull();
    expect(row.matches('.fx-chips')).toBe(false);
    expect(row.querySelector('input.fx-search')).not.toBeNull();
    expect([...row.querySelectorAll('button.fx-chip')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['All', 'Favourites', 'Characters']);
    expect(ruleOf('.fx-asset-filters')).toMatch(/flex:\s*none/);
    // A tile: its star, its name, its count, draggable, a control of its own to focus.
    const barrel = tile('MP2:barrel');
    expect(barrel.draggable).toBe(true);
    expect(barrel.querySelector('button.fx-star')).not.toBeNull();
    expect(barrel.querySelector('button.fx-asset-pick .fx-asset-name')!.textContent).toBe('barrel');
    expect(barrel.textContent).toContain('×1');
    // A favourite stays the same row style, starred, first.
    barrel.querySelector<HTMLButtonElement>('button.fx-star')!.click();
    expect(tile('MP2:barrel').querySelector('.fx-star')!.classList.contains('is-on')).toBe(true);
    expect(document.querySelector('.fx-left ul.fx-assets > li[data-asset]')!.getAttribute('data-asset')).toBe('MP2:barrel');
    // The pack loading: the Local files panel, the right dock's Content tab, the page's one file chooser.
    const files = document.querySelector<HTMLElement>('.fx-right > details.fx-panel[data-forge-panel="creator-assets"]')!;
    expect(files).not.toBeNull();
    expect(files.querySelector(':scope > summary')!.textContent).toBe('Local files');
    expect(files.querySelector('input[type="file"]')).not.toBeNull();
    expect(document.querySelectorAll('input[type="file"][aria-label="Add local files"]')).toHaveLength(1);
  }, 90_000);

  it('D6 / D2: Edit, World and Content each show their own sections; one section style; the Inspector\'s sticky head; one stepper', async () => {
    const api = await mounted();
    const right = document.querySelector<HTMLElement>('.fx-right')!;
    const tabs = (): string[] => [...right.querySelectorAll('[data-forge-tab]')].map((b) => b.textContent ?? '');
    const drawn = (): string[] => [...right.querySelectorAll<HTMLElement>(':scope > details.fx-panel')].filter((d) => !d.hidden).map((d) => d.dataset['forgePanel']!);
    expect(tabs()).toEqual(['Edit', 'World', 'Content']);
    // FCW-32 step 4 (FUI.R23 D1): the Rules panel under Edit, after the Outliner, before Settings.
    expect(drawn()).toEqual(['inspector', 'outliner', 'rules', 'settings']);
    right.querySelector<HTMLButtonElement>('[data-forge-tab="world"]')!.click();
    expect(drawn(), 'the starters are world content').toEqual(['view', 'starters']);
    right.querySelector<HTMLButtonElement>('[data-forge-tab="content"]')!.click();
    expect(drawn()).toEqual(['creator-assets']);
    right.querySelector<HTMLButtonElement>('[data-forge-tab="edit"]')!.click();
    // One section style: every open section's body is the one .fx-section, its padding and gap on the tokens.
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    document.querySelector<HTMLElement>('.fx-menu li[data-forge-menu-row="panel-starters"]')!.click();
    expect(drawn()).toEqual(['view', 'starters']);
    for (const t of ['edit', 'world', 'content']) {
      right.querySelector<HTMLButtonElement>(`[data-forge-tab="${t}"]`)!.click();
      for (const d of right.querySelectorAll<HTMLDetailsElement>(':scope > details.fx-panel:not([hidden])[open]')) {
        expect(d.querySelectorAll(':scope > .fx-section'), d.dataset['forgePanel']).toHaveLength(1);
      }
    }
    const section = ruleOf('.fx-dock .fx-panel > .fx-section');
    expect(section).toMatch(/padding:\s*var\(--s2u-space-/);
    expect(section).toMatch(/gap:\s*var\(--s2u-space-/);
    for (const old of ['.fx-inspector', '.fx-view', '.fx-settings']) expect(ruleOf(old), `${old}'s own padding gone`).not.toMatch(/padding/);
    expect(ruleOf('.fx-section h3'), 'one sub-heading').toMatch(/text-transform:\s*uppercase/);
    // Every number field of the dock is the one stepper control.
    const numbers = [...right.querySelectorAll<HTMLInputElement>('input[type="number"]')];
    expect(numbers.length).toBeGreaterThanOrEqual(7);
    expect(numbers.filter((i) => !i.classList.contains('fx-stepper')).map((i) => i.title || i.dataset['label'])).toEqual([]);
    expect(ruleOf('.fx-stepper')).toMatch(/height:/);
    // The Inspector's head: sticky, the selection's name and kind; nothing selected said in one line.
    right.querySelector<HTMLButtonElement>('[data-forge-tab="edit"]')!.click();
    const head = right.querySelector<HTMLElement>('[data-forge-panel="inspector"] .fx-inspect-head')!;
    expect(head).not.toBeNull();
    expect(ruleOf('.fx-inspect-head')).toMatch(/position:\s*sticky/);
    expect(head.querySelector('.fx-inspect-name')!.textContent).toBe('Nothing selected');
    expect(head.querySelector('.fx-inspect-kind')!.textContent).toBe('');
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(head.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece'));
    expect(head.querySelector('.fx-inspect-name')!.textContent).toContain('crate');
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
    const setting = document.querySelector<HTMLInputElement>('.fx-right input[data-forge-setting="assetTips"]')!;
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
    // Escape: the queue cancelled, the selection kept; a second Escape deselects.
    key('Escape');
    expect((api.read().view as { tool: string }).tool).toBe('select');
    expect(probe.ctx()!.palette!.chosen()).toBeNull();
    expect(api.read().selection).toEqual(['piece:0']);
    key('Escape');
    expect(api.read().selection).toEqual([]);
    // Nothing queued: the wheel is the camera's as before (its speed trim).
    wheel(-100);
    expect(speed()).not.toBe(was);
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
      document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
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
