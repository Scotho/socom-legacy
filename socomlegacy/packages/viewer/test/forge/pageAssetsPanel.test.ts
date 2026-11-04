// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalFile, LocalPackApi, LocalPackSummary } from '../../src/agent/localPacks';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgePanel } from '../../src/forge/shell/panel';
import type { ForgePanelContext } from '../../src/forge/shell/context';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

/**
 * R4 (the UI seat's rulings to dot, 2026-10-25 11:34Z-11:41Z; a browser adaptation, FG.R2 -- the game has no editor): on
 * the mounted Forge, (1) the panels' pulse reaches the pad through the page's one haptic path; (2) the local packs are
 * the page's, one instance for its lifetime, handed to the agent's dock and to the Assets panel alike, and a closed agent
 * dock disposes nothing; (3) dot's Assets panel registered, the person's, with the page's one file chooser in it --
 * FUI-22 (D5, FUI.R21): its grid gone, its pack loading the Local files panel in the right dock's Content tab. The page is mounted as `forgeAgentPage.test.ts` mounts it (only the GPU and
 * disc I/O replaced); IndexedDB is `fake-indexeddb`.
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

/** A stand-in for the page's local packs: what is staged, by id, and whether it was disposed. */
function fakePacks(): LocalPackApi & { staged: Map<string, LocalPackSummary>; disposed: number } {
  const staged = new Map<string, LocalPackSummary>();
  const packs = {
    staged, disposed: 0,
    stage: vi.fn(async (files: readonly LocalFile[]) => {
      if (packs.disposed) throw new Error('The local pack API has been disposed.');
      const out = files.map((f): LocalPackSummary => ({ id: `staged:${f.name}`, kind: 'unknown', name: f.name, files: 1, bytes: f.size,
        staged: true, imported: false, stored: false, enabled: false, applied: false, diagnostics: [] }));
      for (const s of out) staged.set(s.id, s);
      return out;
    }),
    setDirectory: vi.fn(),
    list: vi.fn(async () => [...staged.values()]),
    import: vi.fn(async () => { throw new Error('not in this rig'); }),
    remove: vi.fn(async () => { throw new Error('not in this rig'); }),
    subscribe: vi.fn(() => () => undefined),
    dispose: vi.fn(() => { packs.disposed++; }),
  };
  return packs;
}

/** Chooses `name` in the file input `input` as a person does. */
function choose(input: HTMLInputElement, name: string): void {
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['{}'], name, { type: 'application/json' })] });
  input.dispatchEvent(new Event('change'));
}

describe('R4: the shared local packs, dot\'s Assets panel and the pulse on the mounted Forge', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('2, 3: one local packs instance for the page -- the agent dock\'s and the Assets panel\'s; the Local files panel in the right dock, the one file chooser; closing the agent dock disposes nothing', async () => {
    const packs = fakePacks();
    const made = vi.fn((_api: ForgeAgentApi) => packs);
    let handed: LocalPackApi | null = null;
    const { mountForge } = await import('../../src/forge/page');
    const shell = await mountForge(document, {
      localPacks: made,
      panels: [(page) => import('../../src/agent/install').then((m) => { handed = page.packs; return m.forgeAgentPanel({ packs: page.packs }); })],
    });
    await vi.waitFor(() => expect(document.querySelector('[data-forge-panel="agent"]')).not.toBeNull());
    expect(made).toHaveBeenCalledOnce();                              // one for the page's lifetime
    expect(handed).toBe(packs);
    // dot's Assets panel. FUI-22 (D5, FUI.R21): its grid of the palette's names is gone (the page's one list is the left
    // dock's only list); what stays of the panel is its pack loading, the Local files panel, the right dock's Content tab.
    const assets = document.querySelector<HTMLDetailsElement>('.fx-right > details.fx-panel[data-forge-panel="creator-assets"]');
    expect(assets).not.toBeNull();
    expect(assets!.querySelector(':scope > summary')!.textContent).toBe('Local files');
    expect(document.querySelectorAll('.fx-left ul.fx-assets')).toHaveLength(1);
    expect(assets!.querySelector('ul.fx-assets')).toBeNull();
    // the drag's hint (the one list's tiles') sits in the view, the editor's viewport (the positioned .fx-viewport)
    expect(document.querySelector('.fx-viewport > .fx-asset-drop-hint')).not.toBeNull();
    // one file chooser: the Assets panel's; the agent's dock opens it instead of carrying its own
    const choosers = [...document.querySelectorAll<HTMLInputElement>('input[type="file"][aria-label="Add local files"]')];
    expect(choosers).toHaveLength(1);
    expect(assets!.contains(choosers[0]!)).toBe(true);
    const open = document.querySelector<HTMLButtonElement>('[data-forge-panel="agent"] [data-agent-open-staging]');
    expect(open).not.toBeNull();
    assets!.open = false;
    open!.click();
    expect(assets!.open).toBe(true);
    // staged through the Assets panel into the page's instance -- the one the agent's target reads
    choose(choosers[0]!, 'crate.json');
    await vi.waitFor(() => expect(packs.stage).toHaveBeenCalledOnce());
    expect((await packs.list()).map((s) => s.id)).toEqual(['staged:crate.json']);
    // the agent's dock closed: the packs are not its to dispose; the staged file is still there for Assets
    shell.unregister('agent');
    expect(document.querySelector('[data-forge-panel="agent"]')).toBeNull();
    expect(packs.dispose).not.toHaveBeenCalled();
    expect((await packs.list()).map((s) => s.id)).toEqual(['staged:crate.json']);
    choose(document.querySelector<HTMLInputElement>('[data-forge-panel="creator-assets"] input[type="file"]')!, 'barrel.json');
    await vi.waitFor(() => expect(packs.stage).toHaveBeenCalledTimes(2));
    expect((await packs.list()).map((s) => s.id)).toEqual(['staged:crate.json', 'staged:barrel.json']);
    // the page's teardown is the packs' one owner
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    expect(packs.dispose).toHaveBeenCalledOnce();
  }, 20_000);

  it('1: a panel\'s pulse(\'navigate\') rumbles the pad once with no toast; accepted(words) rumbles and toasts; a refusal does not rumble', async () => {
    const playEffect = vi.fn(async () => 'complete');
    const pad = { connected: true, id: 'pad', mapping: 'standard', vibrationActuator: { playEffect, reset: vi.fn(async () => 'complete') } };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    try {
      let ctx: ForgePanelContext | null = null;
      const probe: ForgePanel = { id: 'probe', title: 'Probe', dock: 'right', order: 70, defaultOpen: false, padLegend: [],
        mount: (_host, c) => { ctx = c; return { dispose: () => undefined }; } };
      const { mountForge } = await import('../../src/forge/page');
      await mountForge(document, { panels: [probe] });
      await vi.waitFor(() => expect(ctx).not.toBeNull());
      const c = ctx as unknown as ForgePanelContext;
      const toast = document.querySelector('.fx-toast')!;
      playEffect.mockClear();
      c.ui.pulse('navigate');
      expect(playEffect).toHaveBeenCalledOnce();
      expect(toast.classList.contains('is-on')).toBe(false);
      c.ui.accepted('Placed');
      expect(playEffect).toHaveBeenCalledTimes(2);
      expect(toast.classList.contains('is-on')).toBe(true);
      expect(toast.textContent).toContain('Placed');
      c.ui.refused('Return to Build to place assets');
      expect(playEffect).toHaveBeenCalledTimes(2);
    } finally { delete (navigator as { getGamepads?: unknown }).getGamepads; }
  }, 20_000);
});
