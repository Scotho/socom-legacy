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
import { pressNew, pressForgeMenu } from './helpers/editor';   // FC2-4: his editor's ways in (EDITOR-MAP.md)

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
  census = async () => null;
  props = async () => null;
  scriptNames = async () => null;
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
/**
 * OT.R112 (the Forge's UI is its contributor's): the toolbar has no base list (the owner, 2026-11-06, in his third
 * commit) -- the current base is named on the forge menu's "New layout" row (`optionLabel(baseSel)`), and another base
 * is chosen from New's own card (`chooseNewBase`, a select labelled "New layout").
 */
const menuBaseLabel = (): string => {
  if (!document.querySelector('.fx-menu li[data-forge-menu-row="base"]')) pressForgeMenu(document);   // EDITOR-MAP T1: Controls > Forge menu (M), the old button's toggle
  return document.querySelector('.fx-menu li[data-forge-menu-row="base"] .fx-menu-value')?.textContent ?? '';
};
const closeMenu = (): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); };
/** New's card: its base list (a select labelled "New layout"), its Cancel and its Next. */
const newCard = (): { sel: HTMLSelectElement; cancel: HTMLButtonElement; next: HTMLButtonElement } => {
  const sel = document.querySelector<HTMLSelectElement>('.fx-card select[aria-label="New layout"]')!;
  const card = sel.closest('.fx-card')!;
  return { sel, cancel: [...card.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!, next: card.querySelector<HTMLButtonElement>('button.fx-primary')! };
};

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

  it('FX-9 (T10): a pack piece keeps a turn about the vertical at its own size: its Pitch, Roll and Scale are off, said, and refused', async () => {
    // A pack piece tilted or scaled would be neither drawn nor solid in the composed match map (`pieceYaw`), so the
    // Inspector refuses it in words; its Yaw stays.
    localStorage.setItem(FORGE_LAYOUT_KEY, JSON.stringify(recordOfLayout(withCrate(), 'Crated')));
    const { api } = await mount(memorySource(defOf(solidJson())), [REF.pack]);
    await vi.waitFor(() => { frame(); expect(tagged()).toHaveLength(1); });
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(document.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece'));
    const field = (label: string): HTMLInputElement => document.querySelector<HTMLInputElement>(`.fx-fields input[data-label="${label}"]`)!;
    const words = 'Pack pieces turn about the vertical at their own size: tilt or scale a disc prop instead';
    for (const label of ['Pitch', 'Roll', 'Scale X', 'Scale Y', 'Scale Z']) {
      expect(field(label).disabled, label).toBe(true);
      expect(field(label).title, label).toBe(words);
    }
    expect(field('Yaw').disabled).toBe(false);
    const revision = api.read().revision;
    const f = field('Pitch');
    f.value = '30';
    f.dispatchEvent(new Event('change'));
    expect(statusLine()).toBe(words);
    expect(field('Pitch').value).toBe('0');
    expect(api.read().revision, 'no edit').toBe(revision);
    expect((api.read().layout as { poses?: unknown }).poses).toBeUndefined();
    // The agent is refused the same, by name.
    expect(await api.execute('placement.set', { ref: 'piece:0', field: 'scale', value: 2 }, api.read().revision)).toMatchObject({ ok: false, code: 'UNSUPPORTED' });
    expect((api.read().layout as { poses?: unknown }).poses).toBeUndefined();
  }, 90_000);

  /*
   * FC2 (ours), the hand-merge review's F2 (2026-11-13; `socomlegacy/docs/plans/2026-11-13-forge-crispy2.md`, the Log): FX-9's
   * rule for a pack piece held through the tree (`Layout.tree`). The pack's crate (`piece:0`, at (50, 0, 50), a quarter
   * turn) is put under a disc prop (`piece:1`, `MP2:crate` at the origin, unturned) in the layout opened; a typed Pitch or
   * Scale on the disc prop would carry the pack piece tilted or scaled (`carrying` -> `carryFollowers`), which the composed
   * match map cannot draw or make solid (`pieceYaw`). Cited at the import's head `11c1777cd3`.
   */
  const IDENTITY_M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  /** The pack's crate under a disc prop, the disc archive in memory (one model, `crate`); the Inspector showing the prop. */
  async function packUnderDiscProp(): Promise<{ api: ForgeAgentApi; field: (label: string) => HTMLInputElement }> {
    const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
    const disc = { ...blankLibraryMap('MP2', 1000), path: 'synthetic/MP2', name: 'MP2', world: [floorMesh(1000)],
      props: [{ modelName: 'crate', parts: [floorMesh(4)], matrices: new Float32Array(IDENTITY_M), order: 0, alternate: false, facade: 0, lod: null, paths: ['world/crate'] }] } as LoadedMap;
    archiveLoad.mockReset().mockImplementation(async (stem) => { if (stem === 'MP2') return disc; throw new Error('No disc supplied'); });
    const layout: Layout = { ...withCrate(), pieces: [...withCrate().pieces, { asset: 'MP2:crate', m: IDENTITY_M }], tree: [['piece:0', 'piece:1']] };
    localStorage.setItem(FORGE_LAYOUT_KEY, JSON.stringify(recordOfLayout(layout, 'Crated')));
    const { api } = await mount(memorySource(defOf(solidJson())), [REF.pack]);
    await vi.waitFor(() => { frame(); expect(tagged()).toHaveLength(1); });
    expect((api.read().layout as { tree?: unknown }).tree, 'the pack piece under the disc prop').toEqual([['piece:0', 'piece:1']]);
    expect(await api.execute('selection.set', { refs: ['piece:1'] }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(document.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece'));
    const field = (label: string): HTMLInputElement => document.querySelector<HTMLInputElement>(`.fx-fields input[data-label="${label}"]`)!;
    expect(field('Pitch').disabled, 'a disc prop tilts').toBe(false);
    return { api, field };
  }
  const PACK_WORDS = 'Pack pieces turn about the vertical at their own size: tilt or scale a disc prop instead';

  it('FC2 (ours), RED: a typed Pitch on a disc prop with a pack piece under it is refused in the pack rule\'s words, nothing moved; a typed Yaw carries it', async () => {
    // Expected RED today (`11c1777cd3`), at the status line: `commitTurnField` asks only `followersFit` (page.ts:5314),
    // whose `followersWithin` (3111-3116) checks a carried piece's size bounds alone; the pack crate stays at scale 1,
    // so the Pitch is applied (`carrying`, 5325) and the pack piece carried tilted -- the revision moves, the record
    // gains pose rows, nothing is said. Expected GREEN after the fix: `followersWithin` / `followersFit` also refuse
    // an edit that would leave a pack piece (`packPiece`) with anything but a turn about the vertical at unit scale, in
    // `PACK_PIECE_POSE_REFUSAL`'s words. The Yaw at the end is a CONTROL (green today and after): a turn about the
    // vertical keeps the pack piece's own.
    const { api, field } = await packUnderDiscProp();
    const revision = api.read().revision;
    field('Pitch').value = '30';
    field('Pitch').dispatchEvent(new Event('change'));
    expect(statusLine()).toBe(PACK_WORDS);
    expect(api.read().revision, 'no edit').toBe(revision);
    expect(field('Pitch').value, 'the disc prop as it was').toBe('0');
    expect((api.read().layout as { poses?: unknown }).poses, 'neither piece tilted').toBeUndefined();
    field('Yaw').value = '45';
    field('Yaw').dispatchEvent(new Event('change'));
    expect(api.read().revision, 'a Yaw is an edit').not.toBe(revision);
    expect((api.read().layout as { poses?: unknown }).poses, 'still neither tilted nor scaled').toBeUndefined();
  }, 90_000);

  it('FN-3 (ours), RED: a typed Scale X on a disc prop with a pack piece under it is taken, the pack piece carried level at its own size', async () => {
    // FN-3 (ours; the owner, 2026-11-14, "agreed on your lean": FN.R4, `socomlegacy/docs/plans/2026-11-14-forge-next.md`):
    // changed with the rule. Under a parent stretched in the edit (a change of scale that is not uniform: FN-3's
    // follow-up decides by the change) a carried piece keeps its own size and its turn relative to the parent's; only its
    // place stretches (`page.ts` `carriedMatrix`). So the disc prop's S(2, 1, 1) no
    // longer scales the quarter-turned pack crate along its own Z: it stays a turn about the vertical at unit scale, which
    // the pack rule allows, and the edit is taken -- the crate carried from (50, 0, 50) to (100, 0, 50). Expected RED
    // before FN-3, at the status line (the refusal in `PACK_PIECE_POSE_REFUSAL`'s words); GREEN after.
    // FC2's form (before FN-3): the stretch carried the crate to a scale of 2 along its own Z, refused in the pack words.
    const { api, field } = await packUnderDiscProp();
    const revision = api.read().revision;
    field('Scale X').value = '2';
    field('Scale X').dispatchEvent(new Event('change'));
    expect(statusLine()).not.toBe(PACK_WORDS);
    expect(api.read().revision, 'an edit').not.toBe(revision);
    expect(field('Scale X').value, 'the disc prop stretched').toBe('2');
    expect((api.read().layout as { poses?: unknown }).poses, 'the disc prop scaled, the pack piece neither tilted nor scaled').toEqual([[1, 0, 0, 2, 1, 1]]);
    const crate = (api.read().refs as { ref: string; at: number[] }[]).find((r) => r.ref === 'piece:0')!.at;
    expect(crate[0], 'the pack piece carried, x').toBeCloseTo(100, 4);
    expect(crate[2], 'the pack piece carried, z').toBeCloseTo(50, 4);
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
    // The map named on the forge menu's New layout row (OT.R112: no base list on the toolbar).
    expect(menuBaseLabel()).toContain('Yard');
    closeMenu();
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
    // The blank floor chosen from it (New, its card's base list; OT.R112): the base's props go with its world.
    pressNew(document);                                           // EDITOR-MAP T2: File > New...
    await vi.waitFor(() => expect(document.querySelector('.fx-card select[aria-label="New layout"]')).not.toBeNull());
    const card = newCard();
    card.sel.value = 'blank';
    card.next.click();
    await vi.waitFor(() => expect(api.status().map).toMatch(/^blank:/));
    frame();
    expect(tagged()).toHaveLength(0);
  }, 90_000);

  // OT.R112: the base is changed from New's card, not a toolbar select; the authored map is named on the menu's row and
  // is no row of New's list (its option is disabled: never chosen), and Cancel there keeps it.
  it('R7-4: on an authored map the menu names it; New offers the other bases, not it, and Cancel keeps it', async () => {
    const { api } = await mount(memorySource(null, minimalMapJson()), [MAP_PACK]);
    openFile(recordOfLayout(contentBase(), 'On the yard'));
    const own = `content:${MAP_PACK.id}@${MAP_PACK.version}/yard`;
    await vi.waitFor(() => expect(api.status().map).toBe(own));
    expect(menuBaseLabel()).toContain('Yard');
    closeMenu();
    pressNew(document);                                           // EDITOR-MAP T2: File > New...
    await vi.waitFor(() => expect(document.querySelector('.fx-card select[aria-label="New layout"]')).not.toBeNull());
    const card = newCard();
    expect([...card.sel.options].map((o) => o.value)).not.toContain(own);
    card.sel.value = 'blank';
    card.cancel.click();
    await vi.waitFor(() => expect(document.querySelector('.fx-card select[aria-label="New layout"]')).toBeNull());
    expect(api.status().map).toBe(own);
  }, 90_000);
});

