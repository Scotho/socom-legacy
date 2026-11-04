// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mesh, type Material, type Object3D } from 'three';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgePanel } from '../../src/forge/shell/panel';
import type { ForgePanelContext } from '../../src/forge/shell/context';
import { FORGE_REFUSALS } from '../../src/forge/shell/state';
import type { LoadedMap } from '../../src/loadMap';

/**
 * R3-B (1, 2; a browser adaptation, FG.R2 -- the game has no editor): the editor seam's viewport adapter (`viewport`,
 * `projectDrop`, `sourceIdentity`) and the staged piece's ghost (`show`, `hide`), on the mounted page as
 * `forgeAgentPage.test.ts` mounts it (only the GPU and disc I/O replaced). The drop's snapped point and yaw are the page's
 * own (the pad ghost's `placeAt` and turn), never the caller's rounding; its refusals are `FORGE_REFUSALS`' words.
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

const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
const materialsOf = (o: Object3D): Material[] => {
  const out: Material[] = [];
  o.traverse((m) => { if (m instanceof Mesh) out.push(...(Array.isArray(m.material) ? m.material : [m.material])); });
  return out;
};

describe('R3-B: the viewport adapter and the staged ghost on the mounted Forge', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mounted(): Promise<{ api: ForgeAgentApi; c: ForgePanelContext }> {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    let ctx: ForgePanelContext | null = null;
    const drop: ForgePanel = { id: 'drop', title: 'Drop', dock: 'right', order: 70, defaultOpen: false, padLegend: [],
      mount: (_host, c) => { ctx = c; return { dispose: () => undefined }; } };
    await mountForge(document, { onAgentReady: (a) => { api = a; }, panels: [drop] });
    await vi.waitFor(() => expect(ctx).not.toBeNull());
    const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
    archiveLoad.mockResolvedValue({ ...blankLibraryMap('MP84', 1000), path: 'synthetic/MP84', world: [floorMesh(1000)],
      props: [{ modelName: 'synthetic', parts: [floorMesh(4)], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        order: 0, alternate: false, facade: 0, lod: null, paths: ['synthetic/prop'] }] } as LoadedMap);
    for (const e of document.querySelectorAll<HTMLElement>('.fx-viewport, .fx-input')) e.getBoundingClientRect = () => RECT;
    return { api, c: ctx as unknown as ForgePanelContext };
  }

  it('1: viewport() is the view; projectDrop answers the point, the page\'s snapped point and turn, or a refusal; sourceIdentity is stable per source', async () => {
    const { api, c } = await mounted();
    const editor = c.editor!;
    expect(editor.viewport()).toBe(document.querySelector('.fx-viewport'));
    // The page's own snap: grid 25, turn 15 degrees (the agent's snap.set, as the dock's switch sets it).
    expect(await api.execute('snap.set', { on: true, grid: 25, rotation: 15 }, api.read().revision)).toMatchObject({ ok: true });
    const drop = editor.projectDrop(400, 300);
    expect('reason' in drop, JSON.stringify(drop)).toBe(false);
    if ('reason' in drop) return;
    expect(drop.point.every(Number.isFinite)).toBe(true);
    expect(drop.snapped.every(Number.isFinite)).toBe(true);
    expect(Math.abs(drop.snapped[0] / 25 - Math.round(drop.snapped[0] / 25))).toBeLessThan(1e-9);
    expect(Math.abs(drop.snapped[2] / 25 - Math.round(drop.snapped[2] / 25))).toBeLessThan(1e-9);
    const turn = (15 * Math.PI) / 180;
    expect(Math.abs(drop.yaw / turn - Math.round(drop.yaw / turn))).toBeLessThan(1e-9);
    // Outside the view: a refusal, never a point.
    // R4 (3): in FORGE_REFUSALS' words, the panels' one table
    expect(editor.projectDrop(-20, 300)).toEqual({ reason: FORGE_REFUSALS.outsideView });
    expect(editor.projectDrop(400, 900)).toEqual({ reason: FORGE_REFUSALS.outsideView });
    // A placement not admitted (the START menu over the editor): the page's own words.
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    expect(editor.projectDrop(400, 300)).toEqual({ reason: FORGE_REFUSALS.card });
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    // The source: none before its archive is read; once read, one object, the same at each call.
    expect(editor.sourceIdentity('MP84:synthetic')).toBeNull();
    const staged = await editor.stagePiece('MP84:synthetic');
    expect(staged).not.toBeNull();
    const source = editor.sourceIdentity('MP84:synthetic');
    expect(source).not.toBeNull();
    expect(typeof source).toBe('object');
    expect(editor.sourceIdentity('MP84:synthetic')).toBe(source);
    expect(editor.sourceIdentity('MP99:else')).toBeNull();
    staged!.dispose();
  }, 20_000);

  it('2: show puts the staged piece in the scene at the point and turn, tinted as admitted or refused; hide hides it; place consumes it, dispose removes it', async () => {
    const { api, c } = await mounted();
    const editor = c.editor!;
    const before = api.read();
    const staged = await editor.stagePiece('MP84:synthetic');
    expect(staged).not.toBeNull();
    expect(staged!.object.parent).toBeNull();                      // hidden until the first show
    staged!.show([40, 0, 25], 0.5, true);
    expect(staged!.object.parent).not.toBeNull();                  // in the scene
    expect(staged!.object.visible).toBe(true);
    expect(staged!.object.position.toArray()).toEqual([40, 0, 25]);
    expect(staged!.object.rotation.y).toBeCloseTo(0.5);
    expect(staged!.object.userData['forgeGhost']).toBe('admitted');
    expect(materialsOf(staged!.object).every((m) => m.transparent && m.opacity < 1)).toBe(true);
    staged!.show([50, 0, 25], 0, false);
    expect(staged!.object.userData['forgeGhost']).toBe('refused');
    expect(staged!.object.position.x).toBe(50);
    staged!.hide();
    expect(staged!.object.visible).toBe(false);
    expect(api.read().layout).toEqual(before.layout);              // a ghost writes nothing
    expect(api.read().canUndo).toBe(before.canUndo);
    staged!.show([40, 0, 25], 0.5, true);
    const letGo = vi.spyOn(staged!, 'dispose');
    const placed = await editor.place(staged!, [40, 0, 25], 0.5);
    expect(placed, JSON.stringify(placed)).toMatchObject({ ok: true });
    expect(staged!.disposed).toBe(true);
    expect(letGo).not.toHaveBeenCalled();                         // R4 (3): consumed by the place, never let go
    expect(staged!.object.parent).toBeNull();                      // the ghost became the piece: one, not two
    expect(api.read().layout!.pieces).toHaveLength(before.layout!.pieces.length + 1);
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(api.read().layout).toEqual(before.layout);              // one history step
    // Let go: dispose takes the ghost out of the scene.
    const other = await editor.stagePiece('MP84:synthetic');
    other!.show([0, 0, 0], 0, true);
    expect(other!.object.parent).not.toBeNull();
    other!.dispose();
    expect(other!.object.parent).toBeNull();
    other!.show([0, 0, 0], 0, true);                               // a disposed piece shows nothing
    expect(other!.object.parent).toBeNull();
  }, 20_000);
});
