// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Camera, Object3D, Scene } from 'three';
import { contentAssetKey, type PackRef } from '@s2u/creator-contracts';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgeContentSource } from '../../src/forge/page';
import type { ForgePanel } from '../../src/forge/shell/panel';
import type { ForgePanelContext } from '../../src/forge/shell/context';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { BLANK_LIBRARY } from '../../src/forge/matchMap';
import { recordOfLayout } from '../../src/forge/record';
import { encodeShare } from '../../src/forge/share';
import { readAssetDefinition, type AssetDefinition } from '../../src/packs/content/assets';
import { CONTENT_METRES_PER_UNIT_ADAPTATION } from '../../src/packs/content/collision';
import { FORGE_LAYOUT_KEY } from '../../src/pageStore';
import type { LoadedMap } from '../../src/loadMap';
import { MAP_PACK, minimalMapJson } from '../../../creator-contracts/test/contentMapFixtures';
import { REF, solidJson, visualJson } from '../packs/contentFixtures';
import { freshSavesDb } from './fakeSaves';

/**
 * R6 (3, 7; product track, a browser adaptation with no original -- the forge and its packs are the port's own): the
 * page's creator content. (3) A layout's pack piece whose definition resolves is drawn from its pack's GLB -- the root
 * scaled by 1 / CONTENT_METRES_PER_UNIT_ADAPTATION once, under the piece's own place and turn -- and its hull is in the
 * page's ground (`layoutGround`'s content entries), so a drop over it rests on its top; a visual-only one is drawn with
 * no hull; one that does not resolve is listed in the Check sheet's missing list. (7) A layout on an authored map (a
 * content base) opens through `loadContentMap` when its pack is here, its stages in the loading line; else the open is
 * refused in words and the world kept -- the Open file and a share code alike. The content source is the test's in
 * memory (`ForgeContentSource`); the page's own default answers nothing until the registry publishes its members.
 */

const rendered = vi.hoisted(() => ({ scene: null as Scene | null }));
// The renderer's draw, as three's does it: the scene's and the camera's world matrices brought up to date, then kept.
vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native',
  render: (scene: Scene, camera: Camera) => { scene.updateMatrixWorld(); if (!camera.parent) camera.updateMatrixWorld(); rendered.scene = scene; },
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

/** A GLB of one upward triangle over the crate's top (metres, y 1.5), double-sided: what the pack's visual draws. */
function crateGlb(): Uint8Array {
  const positions = new Float32Array([-1, 1.5, -0.5, 0, 1.5, 0.5, 1, 1.5, -0.5]);
  const json = JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'crate' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], materials: [{ doubleSided: true }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 1.5, -0.5], max: [1, 1.5, 0.5] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }], buffers: [{ byteLength: positions.byteLength }],
  });
  const text = new TextEncoder().encode(json);
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binLength = positions.byteLength;
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, out.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLength); out.set(text, 20);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  out.set(new Uint8Array(positions.buffer), 28 + jsonLength);
  return out;
}
const defOf = (json: Record<string, unknown>): AssetDefinition => {
  const got = readAssetDefinition(json, REF);
  if (Array.isArray(got)) throw new Error('the fixture does not read');
  return got as AssetDefinition;
};
/** The in-memory content source: the asset's definition and its GLB member, and the authored map's member. */
function memorySource(asset: AssetDefinition | null, map: unknown = null): ForgeContentSource & { members: string[] } {
  const members: string[] = [];
  return {
    members,
    asset: (ref) => (asset && ref.assetId === asset.ref.assetId && ref.pack.id === asset.ref.pack.id ? asset : null),
    member: (pack, path) => { members.push(`${pack.id}/${path}`); return asset && path === asset.visual.member ? crateGlb() : null; },
    map: (ref) => (map !== null && ref.pack.id === MAP_PACK.id && ref.assetId === 'yard' ? JSON.parse(JSON.stringify(map)) as unknown : null),
  };
}
/** A blank-floor layout with the pack's crate at (50, 0, 50), turned a quarter. */
const withCrate = (): Layout => ({
  ...emptyLayout({ kind: 'blank', library: BLANK_LIBRARY }), name: 'Crated',
  pieces: [{ asset: contentAssetKey(REF), m: [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 50, 0, 50, 1], content: REF }],
  spawns: [{ team: 'A', p: [10, 0, 10], yaw: 0 }],
});
const contentBase = (): Layout => ({ ...emptyLayout({ kind: 'content', ref: MAP_PACK, mapId: 'yard', library: 'MP2' } as Layout['base']), name: 'On the yard' });
const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
const statusLine = (): string => document.querySelector('.fx-status-msg')?.textContent ?? '';

describe('R6: creator content on the mounted Forge', () => {
  let queued: FrameRequestCallback[] = [];
  let clock = 0;
  const frame = (): void => { clock += 1000 / 60; for (const cb of queued.splice(0)) cb(clock); };
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    queued = []; clock = performance.now(); rendered.scene = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued.push(cb); return queued.length; });
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mount(content?: ForgeContentSource, packs: readonly PackRef[] = []): Promise<{ api: ForgeAgentApi; ctx: ForgePanelContext }> {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    let ctx: ForgePanelContext | null = null;
    const probe: ForgePanel = { id: 'probe', title: 'Probe', dock: 'right', order: 70, defaultOpen: false, padLegend: [],
      mount: (_host, c) => { ctx = c; return { dispose: () => undefined }; } };
    await mountForge(document, { onAgentReady: (a) => { api = a; }, availablePacks: () => packs, panels: [probe], ...(content ? { content } : {}) });
    await vi.waitFor(() => expect(ctx).not.toBeNull());
    for (const e of document.querySelectorAll<HTMLElement>('.fx-viewport, .fx-input')) e.getBoundingClientRect = () => RECT;
    return { api, ctx: ctx as unknown as ForgePanelContext };
  }
  const tagged = (): Object3D[] => {
    const out: Object3D[] = [];
    rendered.scene?.traverse((o) => { if (o.userData['forgeContentKey'] === contentAssetKey(REF)) out.push(o); });
    return out;
  };
  /** A drop at the view's centre from straight over (50, 50): where the page's own probe rests it. */
  const restAt = async (api: ForgeAgentApi, ctx: ForgePanelContext): Promise<number> => {
    expect(await api.execute('camera.look', { from: [50, 120, 50.001], to: [50, 0, 50] }, api.read().revision)).toMatchObject({ ok: true });
    frame();
    const drop = ctx.editor!.projectDrop(400, 300);
    if ('reason' in drop) throw new Error(drop.reason);
    expect(drop.snapped[0]).toBeCloseTo(50, 0);
    expect(drop.snapped[2]).toBeCloseTo(50, 0);
    return drop.snapped[1];
  };

  it('3: a solid pack piece is drawn from its GLB, scaled once to game units under its place and turn, and a probe over it rests on its hull', async () => {
    localStorage.setItem(FORGE_LAYOUT_KEY, JSON.stringify(recordOfLayout(withCrate(), 'Crated')));
    const source = memorySource(defOf(solidJson()));
    const { api, ctx } = await mount(source, [REF.pack]);
    expect(api.read().layout!.pieces).toHaveLength(1);
    await vi.waitFor(() => { frame(); expect(tagged()).toHaveLength(1); });
    const piece = tagged()[0]!;
    expect(source.members).toContain(`${REF.pack.id}/assets/crate.glb`);
    expect(piece.userData['forgeMissing']).toBeUndefined();
    expect([piece.position.x, piece.position.y, piece.position.z]).toEqual([50, 0, 50]);
    expect(piece.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    // The GLB's root: one scale, metres to game units (x 10 at 0.1 m a unit), exactly once.
    expect(piece.children).toHaveLength(1);
    const root = piece.children[0]!;
    expect(root.scale.toArray()).toEqual([1 / CONTENT_METRES_PER_UNIT_ADAPTATION, 1 / CONTENT_METRES_PER_UNIT_ADAPTATION, 1 / CONTENT_METRES_PER_UNIT_ADAPTATION]);
    let meshes = 0;
    root.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) { meshes++; expect(o.scale.toArray()).toEqual([1, 1, 1]); } });
    expect(meshes).toBe(1);
    // The hull is the page's: a drop over the crate rests on its top, 1.5 m up.
    expect(await restAt(api, ctx)).toBeCloseTo(1.5 / CONTENT_METRES_PER_UNIT_ADAPTATION, 3);
    // The Check lists no miss for it.
    document.querySelector<HTMLButtonElement>('[data-forge="check"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card')).not.toBeNull());
    expect(document.querySelector('.fx-check-card li[data-kind="content-miss"]')).toBeNull();
  }, 90_000);

  it('3: a visual-only pack piece is drawn with no hull: the drop over it rests on the floor', async () => {
    localStorage.setItem(FORGE_LAYOUT_KEY, JSON.stringify(recordOfLayout(withCrate(), 'Crated')));
    const { api, ctx } = await mount(memorySource(defOf(visualJson())), [REF.pack]);
    await vi.waitFor(() => { frame(); expect(tagged()).toHaveLength(1); });
    expect(await restAt(api, ctx)).toBeCloseTo(0, 3);
  }, 90_000);

  it('3: with no resolver (the page\'s default) the piece is the stand-in and the Check sheet lists the miss beside the missing pack', async () => {
    localStorage.setItem(FORGE_LAYOUT_KEY, JSON.stringify(recordOfLayout(withCrate(), 'Crated')));
    await mount();
    frame();
    expect(tagged()).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('[data-forge="check"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('.fx-check-card')).not.toBeNull());
    const misses = [...document.querySelectorAll('.fx-check-card li[data-kind="content-miss"]')].map((li) => li.textContent ?? '');
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain(`${REF.pack.id}@${REF.pack.version}`);
    expect(misses[0]).toContain('crate');
    expect(document.querySelector('.fx-check-card li[data-kind="missing-pack"]')!.textContent).toContain(`${REF.pack.id}@${REF.pack.version}`);
  }, 90_000);

  /** Opens `record` through the toolbar's Open, as a person chooses a file. */
  const openFile = (record: unknown): void => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept=".json,application/json"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([JSON.stringify(record)], 'yard.json', { type: 'application/json' })] });
    input.dispatchEvent(new Event('change'));
  };

  it('7: Open of a layout on an authored map loads it through loadContentMap when its pack is here, its stages in the loading line', async () => {
    const { api } = await mount(memorySource(null, minimalMapJson()), [MAP_PACK]);
    expect(api.status().map).toBe(`blank:${BLANK_LIBRARY}`);
    const lines: string[] = [];
    const line = document.querySelector('.fx-loading-line')!;
    new MutationObserver(() => { if (line.textContent) lines.push(line.textContent); }).observe(line, { childList: true, characterData: true, subtree: true });
    openFile(recordOfLayout(contentBase(), 'On the yard'));
    await vi.waitFor(() => expect(api.status().map).toBe(`content:${MAP_PACK.id}@${MAP_PACK.version}/yard`));
    expect(api.read().layout!.name).toBe('On the yard');
    expect(document.querySelector('.fx-vp-label')!.textContent).toContain('Yard');
    await vi.waitFor(() => expect(lines.join(' | ')).toMatch(/hull/i));
  }, 90_000);

  it('7: Open of a layout whose authored map\'s pack is not here is refused in words; the world is kept', async () => {
    const { api } = await mount(memorySource(null, null));
    const before = api.read().layout;
    openFile(recordOfLayout(contentBase(), 'On the yard'));
    await vi.waitFor(() => expect(statusLine()).toContain(`This layout needs pack ${MAP_PACK.id}@${MAP_PACK.version}`));
    expect(api.status().map).toBe(`blank:${BLANK_LIBRARY}`);
    expect(api.read().layout).toEqual(before);
  }, 90_000);

  it('7: a share code with an authored map opens it when its pack is here; one whose pack is not here is refused in words and the floor opens', async () => {
    const code = await encodeShare(recordOfLayout(contentBase(), 'On the yard'));
    history.replaceState(null, '', `/forge?floor#forge=${code}`);
    const { api } = await mount(memorySource(null, minimalMapJson()), [MAP_PACK]);
    await vi.waitFor(() => expect(api.status().map).toBe(`content:${MAP_PACK.id}@${MAP_PACK.version}/yard`));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    for (const e of Array.from(document.body.children)) e.remove();
    freshSavesDb();
    localStorage.clear();
    history.replaceState(null, '', `/forge?floor#forge=${code}`);
    const refused = await mount(memorySource(null, null));
    await vi.waitFor(() => expect(statusLine()).toContain(`This layout needs pack ${MAP_PACK.id}@${MAP_PACK.version}`));
    expect(refused.api.status().map).toBe(`blank:${BLANK_LIBRARY}`);
  }, 90_000);

  /** The authored map with the pack's crate as its own prop at (5, 0, 5) m: (50, 0, 50) in game units. */
  const yardWithCrate = (): Record<string, unknown> => minimalMapJson({ props: [{ content: REF, at: [5, 0, 5], yaw: 0 }], dependencies: [REF.pack] });

  it('R7-3: an authored map\'s own prop is drawn from its GLB where its hull is, and is no piece of the layout', async () => {
    const { api } = await mount(memorySource(defOf(solidJson()), yardWithCrate()), [MAP_PACK, REF.pack]);
    openFile(recordOfLayout(contentBase(), 'On the yard'));
    await vi.waitFor(() => expect(api.status().map).toBe(`content:${MAP_PACK.id}@${MAP_PACK.version}/yard`));
    await vi.waitFor(() => { frame(); expect(tagged()).toHaveLength(1); });
    const prop = tagged()[0]!;
    expect([prop.position.x, prop.position.y, prop.position.z].map((v) => Math.round(v * 1000) / 1000)).toEqual([50, 0, 50]);
    let meshes = 0;
    prop.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
    expect(meshes).toBe(1);
    expect(prop.userData['forgePiece']).toBeUndefined();               // the base's, not a placement: never picked or saved
    expect(api.read().layout!.pieces).toHaveLength(0);
    // The blank floor chosen from it: the base's props go with its world.
    const sel = document.querySelector<HTMLSelectElement>('select[title^="The base"]')!;
    sel.value = 'blank';
    sel.dispatchEvent(new Event('change'));
    document.querySelector<HTMLButtonElement>('.fx-base-ask button.fx-primary')!.click();
    await vi.waitFor(() => expect(api.status().map).toMatch(/^blank:/));
    frame();
    expect(tagged()).toHaveLength(0);
  }, 90_000);

  it('R7-4: on an authored map the base select names it (content:<ref>); the blank floor chosen from it asks, Cancel keeps it', async () => {
    const { api } = await mount(memorySource(null, minimalMapJson()), [MAP_PACK]);
    openFile(recordOfLayout(contentBase(), 'On the yard'));
    await vi.waitFor(() => expect(api.status().map).toBe(`content:${MAP_PACK.id}@${MAP_PACK.version}/yard`));
    const sel = document.querySelector<HTMLSelectElement>('select[title^="The base"]')!;
    const own = `content:${MAP_PACK.id}@${MAP_PACK.version}/yard`;
    expect(sel.value).toBe(own);
    expect(sel.options[sel.selectedIndex]?.textContent).toContain('Yard');
    const ask = document.querySelector<HTMLElement>('.fx-base-ask')!;
    sel.value = 'blank';
    sel.dispatchEvent(new Event('change'));
    expect(ask.hidden, 'leaving the authored map asks').toBe(false);
    ask.querySelector<HTMLButtonElement>('button:not(.fx-primary)')!.click();          // Cancel
    expect(ask.hidden).toBe(true);
    expect(sel.value).toBe(own);
    expect(api.status().map).toBe(own);
  }, 90_000);
});

