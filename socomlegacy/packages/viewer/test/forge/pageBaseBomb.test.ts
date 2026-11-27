// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';
import type { MapAction } from '../../src/mapActions';
import { freshSavesDb } from './fakeSaves';
import { toolbarButton } from './helpers/editor';   // FC2-4: his editor's ways in (EDITOR-MAP.md)

/**
 * FN-5 (product track, a browser adaptation, FG.R2; FG-51 as kept, FN.R4): a Demolition layout with no bomb start of
 * its own, on a base with its own StartBomb and a site for each team, plays the base's bomb and plant sites
 * (`../../src/forge/objectives` `usesBaseBomb`, `applyForgeObjectives`); the map check's sheet says so in plain words, in
 * its notes. A layout with a start of its own plays its own bomb and the sheet says nothing of it (CONTROL). The page is
 * mounted as `../forgeAgentPage.test.ts` mounts it (only the GPU and the disc I/O replaced); the base is its synthetic
 * archive with a StartBomb and the two tents, as `./objectives.test.ts`'s `discMap`.
 */

const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
const archiveEntries = vi.hoisted(() => [] as { stem: string; path: string; label: string; campaign: boolean }[]);

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: archiveEntries, problems: [] });
  load = archiveLoad;
  census = async () => null;
  props = async () => null;
  scriptNames = async () => null;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

const LINE = "No bomb start placed: the map's own bomb and plant sites are used.";

function tent(node: string, at: [number, number, number]): MapAction {
  return {
    node, type: 'MPBOMB', typeCode: 4, valve: '', anims: ['BombPlace'], team: null, range: 15, elevation: 15, points: 0,
    bitmap: '', path: `worldmodel/${node}`, at,
  };
}

/** A disc Demolition map as the room reads it: its StartBomb and the two tents (`seal_tent` the Terrorists'). */
async function demolitionBase(stem: string): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  return {
    ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000)],
    bombStart: [90, 0, 70],
    meta: {
      stem, actions: [tent('terrorist_tent', [100, 0, 0]), tent('seal_tent', [-100, 0, 0])],
      instances: [], instanceByPath: new Map(), initial: [], diagnostics: [],
    },
  } as LoadedMap;
}

const notes = (): string => document.querySelector('.fx-check-card .fx-check-notes')?.textContent ?? '';
const closeSheet = (): void => {
  [...document.querySelectorAll<HTMLButtonElement>('.fx-check-card button')].find((b) => b.textContent === 'Close')!.click();
};

describe("FN-5: the map check says when Demolition plays the base map's bomb", () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    freshSavesDb();
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
    archiveLoad.mockReset().mockImplementation((stem) => demolitionBase(stem));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mounted(): Promise<ForgeAgentApi> {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (target) => { api = target; } });
    await vi.waitFor(() => expect(api.read().ready).toBe(true));
    return api;
  }
  const exec = async (api: ForgeAgentApi, operation: string, args: Record<string, unknown> = {}): Promise<void> => {
    const r = await api.execute(operation, args, api.read().revision);
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  };
  const check = async (): Promise<string> => {
    toolbarButton(document, 'Check').click();
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card')).not.toBeNull());
    return notes();
  };

  it("no bomb start placed on a Demolition base: the sheet says the map's own bomb and plant sites are used; a start placed, nothing (CONTROL)", async () => {
    const api = await mounted();
    await exec(api, 'layout.base', { base: { kind: 'map', archive: 'MP2' } });
    await exec(api, 'type.set', { type: 2 });
    await exec(api, 'bomb.place', { kind: 'seal', at: [40, 0, 0] });
    await exec(api, 'bomb.place', { kind: 'terrorist', at: [-40, 0, 0] });
    const said = await check();
    expect(said).toContain(LINE);
    expect(said).toContain('The plant sites placed here are not used.');
    closeSheet();
    expect(document.querySelector('.fx-check-card')).toBeNull();
    // CONTROL: the layout's own start -- its whole bomb plays, and the sheet says nothing of the base's.
    await exec(api, 'bomb.place', { kind: 'start', at: [0, 0, 0] });
    const own = await check();
    expect(own).not.toContain('No bomb start placed');
  }, 90_000);
});
