// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';
import { toolbarButton } from './helpers/editor';

const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
// Only the GPU and disc I/O are replaced (as `./pageRefusals.test.ts`): the editor, its keys and its toolbar are real.
vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  census = async () => null;
  props = async () => null;
  scriptNames = async () => null;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

/**
 * PR #5's import (seat-forge, item A7): the Forge's owner removed place mode (OT.R112: the Forge's UI is his; his words
 * in the PR, page.ts `spawnAtCentre`: "Spawned at the view's centre and kept at once: a tile's click, a button's, a
 * key's"). A toolbar button no longer arms a placing tool: it spawns its object at the view's centre, kept as one edit,
 * and selects it; the shortcut table's `forge.deselect` (Escape) lets the selection go. These replace the retired
 * place-mode cases (pageRefusals' "Place with no prop chosen", the agent page's armed tool and ghost, the panels'
 * ghost turned by the wheel). A browser adaptation (FG.R2); nothing the game does.
 */
describe("PR #5: a toolbar button spawns at once and selects; Escape deselects", () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  const mount = async (): Promise<ForgeAgentApi> => {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (target) => { api = target; } });
    return api;
  };

  it('Spawn SEAL: one spawn made and selected at once, no tool left armed; Escape lets it go and the spawn stays', async () => {
    const api = await mount();
    const before = api.read();
    expect(before.selection, 'nothing selected at the start').toEqual([]);
    toolbarButton(document, 'Spawn SEAL').click();
    await vi.waitFor(() => expect(api.read().selection).toHaveLength(1));
    const after = api.read();
    expect(after.selection[0], 'the spawn made is the one selected').toMatch(/^spawn/);
    expect(after.revision, 'kept as an edit').toBeGreaterThan(before.revision);
    expect(after.view.tool, 'no placing tool left armed: Select stays the tool').toBe('select');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await vi.waitFor(() => expect(api.read().selection).toEqual([]));
    // The layout revision counts a selection change too (LATER 422, page.ts `agentRevisions`), so the layout is compared.
    expect(api.read().layout, 'Escape deselects; it undoes nothing').toEqual(after.layout);
    expect((api.read().layout as { spawns: unknown[] }).spawns, 'the spawn stays').toHaveLength((before.layout as { spawns: unknown[] }).spawns.length + 1);
  }, 90_000);
});
