// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

/**
 * FC-1's review fold (F1; a browser adaptation, FG.R2 -- the game has no editor): `FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION`
 * flipped on the mounted Forge, not only pinned as text. Off, the stubs come back -- the Scale tool, R picking the scale
 * gizmo, the "W / E / R / G" shortcuts row, the Inspector's Pitch / Roll fields and its Scale row, the rotate gizmo's
 * tilt rings; on (again), they are hidden. The switch is read through a getter (`vi.mock`), each mount reading it anew;
 * the gizmo is the page's own TransformControls, recorded as it is made. The page is mounted as `pagePanels.test.ts`
 * mounts it (only the GPU and disc I/O replaced); IndexedDB is `fake-indexeddb`.
 */

const stubs = vi.hoisted(() => ({ hidden: true }));
vi.mock('../../src/forge/transformStubs', () => ({
  get FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION() { return stubs.hidden; },
}));
const gizmos = vi.hoisted(() => [] as { showX: boolean; showZ: boolean; mode: string }[]);
vi.mock('three/examples/jsm/controls/TransformControls.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('three/examples/jsm/controls/TransformControls.js')>();
  class Recorded extends real.TransformControls {
    constructor(...args: ConstructorParameters<typeof real.TransformControls>) {
      super(...args);
      gizmos.push(this as unknown as { showX: boolean; showZ: boolean; mode: string });
    }
  }
  return { ...real, TransformControls: Recorded };
});
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

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
async function syntheticArchive(stem: string, models: readonly string[]): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  return {
    ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000)],
    props: models.map((modelName) => ({ modelName, parts: [floorMesh(4)], matrices: IDENTITY.slice(), order: 0, alternate: false, facade: 0, lod: null, paths: [`world/${modelName}`] })),
  } as LoadedMap;
}

describe('FC-1: the transform stubs\' switch, flipped on the mounted Forge', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    if (!('scrollIntoView' in Element.prototype)) Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveEntries.length = 0;
    archiveEntries.push({ stem: 'MP2', path: 'synthetic/MP2', label: 'Frostfire', campaign: false });
    const loaded = new Map<string, Promise<LoadedMap>>();
    archiveLoad.mockReset().mockImplementation((stem) => {
      let p = loaded.get(stem);
      if (!p) { p = syntheticArchive(stem, ['crate', 'barrel']); loaded.set(stem, p); }
      return p;
    });
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); document.body.replaceChildren(); });

  const key = (code: string, k = code): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: k, bubbles: true, cancelable: true })); };

  /** The page mounted with the switch at `hidden`, one crate placed and selected; what the stubs show, read back. */
  async function mountedWith(hidden: boolean) {
    stubs.hidden = hidden;
    const made = gizmos.length;
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (a) => { api = a; } });
    expect(await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(document.querySelectorAll('.fx-left ul.fx-assets > li[data-asset]')).toHaveLength(2));
    const right = document.querySelector<HTMLElement>('.fx-right')!;
    right.querySelector<HTMLButtonElement>('[data-forge-tab="object"]')!.click();
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    const inspector = right.querySelector<HTMLElement>('[data-forge-panel="inspector"]')!;
    await vi.waitFor(() => expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece'));
    expect(gizmos.length, 'this mount made its own gizmo').toBe(made + 1);
    const gizmo = gizmos[gizmos.length - 1]!;
    const shown = (e: Element | null): boolean => {
      for (let n = e; n && n !== inspector; n = n.parentElement) if ((n as HTMLElement).hidden) return false;
      return e !== null;
    };
    const field = (label: string): Element | null => inspector.querySelector(`input[data-label="${label}"]`);
    const scaleTool = document.querySelector<HTMLButtonElement>('button.fx-tool[title^="Scale with the gizmo"]');
    key('KeyE', 'e');
    const rotate = { mode: api.read().view.gizmo, showX: gizmo.showX, showZ: gizmo.showZ };
    key('KeyR', 'r');
    return {
      fields: ['Pitch', 'Roll', 'Scale X', 'Scale Y', 'Scale Z'].map((l) => [l, shown(field(l))]),
      kept: ['X', 'Y', 'Z', 'Yaw'].map((l) => shown(field(l))),
      scaleRow: shown(inspector.querySelector('.fx-scale-fields')),
      scaleTool: scaleTool !== null && !scaleTool.hidden,
      keysRow: { withR: document.body.innerHTML.includes('W / E / R / G'), withoutR: document.body.innerHTML.includes('W / E / G') },
      rotate,
      afterR: api.read().view.gizmo,
    };
  }

  const hiddenLook = {
    fields: [['Pitch', false], ['Roll', false], ['Scale X', false], ['Scale Y', false], ['Scale Z', false]],
    kept: [true, true, true, true], scaleRow: false, scaleTool: false,
    keysRow: { withR: false, withoutR: true },
    rotate: { mode: 'rotate', showX: false, showZ: false }, afterR: 'rotate',
  };

  it('on (as shipped): every stub hidden, R picks nothing, the tilt rings off', async () => {
    expect(await mountedWith(true)).toEqual(hiddenLook);
  }, 90_000);

  it('off: the Scale tool, R, the W / E / R / G row, Pitch / Roll and the Scale row, and the tilt rings come back', async () => {
    expect(await mountedWith(false)).toEqual({
      fields: [['Pitch', true], ['Roll', true], ['Scale X', true], ['Scale Y', true], ['Scale Z', true]],
      kept: [true, true, true, true], scaleRow: true, scaleTool: true,
      keysRow: { withR: true, withoutR: false },
      rotate: { mode: 'rotate', showX: true, showZ: true }, afterR: 'scale',
    });
  }, 90_000);

  it('on again: hidden as before', async () => {
    expect(await mountedWith(true)).toEqual(hiddenLook);
  }, 90_000);
});
