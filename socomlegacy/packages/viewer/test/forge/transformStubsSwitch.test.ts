// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Euler, type Object3D } from 'three';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';
import { inspector as inspectorPanel, showTab } from './helpers/editor';   // FC2-4: his editor's ways in (EDITOR-MAP.md)

/**
 * FC-1's review fold (F1; a browser adaptation, FG.R2 -- the game has no editor): `FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION`
 * flipped on the mounted Forge, not only pinned as text. FX-9 (FX.R3) ships it off: the controls are real -- the Scale
 * tool, R picking the scale gizmo, the "W / E / R / G" shortcuts row, the Inspector's Pitch / Roll fields and its Scale
 * row, the rotate gizmo's tilt rings; on, they are hidden again, as FC-1 hid them. The switch is read through a getter (`vi.mock`), each mount reading it anew;
 * the gizmo is the page's own TransformControls, recorded as it is made. The page is mounted as `pagePanels.test.ts`
 * mounts it (only the GPU and disc I/O replaced); IndexedDB is `fake-indexeddb`.
 */

const stubs = vi.hoisted(() => ({ hidden: false }));
vi.mock('../../src/forge/transformStubs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/forge/transformStubs')>();
  return { ...real, get FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION() { return stubs.hidden; } };
});
/** The page's gizmo as the tests drive it: its rings shown, its mode and axis, its object, and its events. */
interface GizmoProbe {
  showX: boolean; showZ: boolean; mode: string; axis: string | null; object?: Object3D;
  dispatchEvent(e: { type: string; value?: boolean }): void;
}
const gizmos = vi.hoisted(() => [] as GizmoProbe[]);
vi.mock('three/examples/jsm/controls/TransformControls.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('three/examples/jsm/controls/TransformControls.js')>();
  class Recorded extends real.TransformControls {
    constructor(...args: ConstructorParameters<typeof real.TransformControls>) {
      super(...args);
      gizmos.push(this as unknown as GizmoProbe);
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

describe("FC-1 and FX-9: the transform controls' switch, flipped on the mounted Forge", () => {
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
    await vi.waitFor(() => expect(document.querySelectorAll('[data-forge-panel="asset-browser"] ul.fx-assets > li[data-asset]')).toHaveLength(2));
    showTab(document, 'object');                                    // EDITOR-MAP D6: the Object tab
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    const inspector = inspectorPanel(document);                     // EDITOR-MAP I1
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

  const liveLook = {
    fields: [['Pitch', true], ['Roll', true], ['Scale X', true], ['Scale Y', true], ['Scale Z', true]],
    kept: [true, true, true, true], scaleRow: true, scaleTool: true,
    keysRow: { withR: true, withoutR: false },
    rotate: { mode: 'rotate', showX: true, showZ: true }, afterR: 'scale',
  };

  it('off (as shipped, FX-9): the Scale tool, R, the W / E / R / G row, Pitch / Roll and the Scale row, and the tilt rings', async () => {
    expect(await mountedWith(false)).toEqual(liveLook);
  }, 90_000);

  it('on: every control hidden, R picks nothing, the tilt rings off (as FC-1 hid them)', async () => {
    expect(await mountedWith(true)).toEqual(hiddenLook);
  }, 90_000);

  it('off again: live as shipped', async () => {
    expect(await mountedWith(false)).toEqual(liveLook);
  }, 90_000);

  /** FX-9: the page as shipped, a crate (or a spawn A) placed and selected; the page's own gizmo, as it was made. */
  async function placed(what: 'piece' | 'spawn') {
    stubs.hidden = false;
    const made = gizmos.length;
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (a) => { api = a; } });
    expect(await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(document.querySelectorAll('[data-forge-panel="asset-browser"] ul.fx-assets > li[data-asset]')).toHaveLength(2));
    if (what === 'piece') expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    else {
      expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
      expect(await api.execute('selection.set', { refs: ['spawn:0'] }, api.read().revision)).toMatchObject({ ok: true });
    }
    const inspector = document.querySelector<HTMLElement>('[data-forge-panel="inspector"]')!;
    await vi.waitFor(() => expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe(what === 'piece' ? 'Piece' : 'Spawn'));
    expect(gizmos.length, 'this mount made its own gizmo').toBe(made + 1);
    return { api, gizmo: gizmos[gizmos.length - 1]! };
  }
  /** A gizmo drag as three's TransformControls makes one: its start, the object changed, its change, its release. */
  const drag = (gizmo: GizmoProbe, axis: string, change: (o: Object3D) => void): void => {
    gizmo.axis = axis;
    gizmo.dispatchEvent({ type: 'dragging-changed', value: true });
    change(gizmo.object!);
    gizmo.dispatchEvent({ type: 'objectChange' });
    gizmo.dispatchEvent({ type: 'dragging-changed', value: false });
  };
  const poses = (api: ForgeAgentApi): unknown => (api.read().layout as { poses?: unknown }).poses;
  const undoTitle = (): string => document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!.title;
  const statusLine = (): string => document.querySelector('.fx-status-msg')?.textContent ?? '';
  const DEG = Math.PI / 180;

  it('FX-9: a piece pitched on the X ring is one step (Rotate), put on the whole degree at the release, kept by the record', async () => {
    const { api, gizmo } = await placed('piece');
    key('KeyE', 'e');
    expect([gizmo.mode, gizmo.showX, gizmo.showZ]).toEqual(['rotate', true, true]);
    const revision = api.read().revision;
    drag(gizmo, 'X', (o) => { o.quaternion.setFromEuler(new Euler(29.7 * DEG, 0, 0, 'YXZ')); });
    expect(api.read().revision).toBeGreaterThan(revision);
    expect(undoTitle()).toMatch(/^Undo: Rotate · pad SELECT/);
    expect(poses(api)).toEqual([[0, 30, 0, 1, 1, 1]]);
    expect(new Euler().setFromQuaternion(gizmo.object!.quaternion, 'YXZ').x / DEG).toBeCloseTo(30, 9);
    expect(document.querySelector<HTMLInputElement>('[data-forge-panel="inspector"] input[data-label="Pitch"]')!.value).toBe('30');
  }, 90_000);

  /*
   * FC2-6 (the lane's list: "the gizmo's Y-ring turn is kept unsnapped"): the record keeps a whole degree of yaw for a
   * piece (`creator-contracts` `recordOfLayout`, `poseOf`'s yaw through `wholeDeg`) and for a marker (`SpawnRow`'s
   * `wholeDeg(s.yaw)`), and FC2-7 part B put a typed Yaw on it (`poseOn`); the gizmo's release still put only a tilt or a
   * scale there (`posed`: "a turn about Y alone is kept as it was let go"), so a Y-ring drag let go at 45.37 drew 45.37
   * while a save, a reopen and a lobby gave 45. Expected RED before the fix at the scene's yaw; GREEN after: the release
   * puts a Y turn on the whole degree too, a piece through `poseOn` and a marker through `yawTo`.
   */
  it('FC2-6: a piece turned on the Y ring is put on the whole degree at the release, as the record keeps it', async () => {
    const { api, gizmo } = await placed('piece');
    key('KeyE', 'e');
    drag(gizmo, 'Y', (o) => { o.quaternion.setFromEuler(new Euler(0, 45.37 * DEG, 0, 'YXZ')); });
    expect(undoTitle()).toMatch(/^Undo: Rotate · pad SELECT/);
    expect(new Euler().setFromQuaternion(gizmo.object!.quaternion, 'YXZ').y / DEG, 'the scene').toBeCloseTo(45, 9);
    expect((api.read().layout as { pieces: number[][] }).pieces[0]![4], 'the record').toBe(45);
    expect(poses(api) ?? [], 'still no pose row').toEqual([]);
  }, 90_000);

  it('FC2-6: a spawn turned on the Y ring is put on the whole degree at the release, as the record keeps it', async () => {
    const { api, gizmo } = await placed('spawn');
    key('KeyE', 'e');
    drag(gizmo, 'Y', (o) => { o.quaternion.setFromEuler(new Euler(0, 120.4 * DEG, 0, 'YXZ')); });
    expect(gizmo.object!.rotation.y / DEG, 'the scene').toBeCloseTo(120, 9);
    expect((api.read().layout as { spawns: unknown[][] }).spawns[0]![4], 'the record').toBe(120);
  }, 90_000);

  it('FX-9: a piece scaled by the Scale tool is held within 0.1..4 while dragged, one step (Set scale) on the lattice; undo takes it back', async () => {
    const { api, gizmo } = await placed('piece');
    key('KeyR', 'r');
    expect(gizmo.mode).toBe('scale');
    const tool = document.querySelector<HTMLButtonElement>('button.fx-tool[title^="Scale with the gizmo"]')!;
    expect(tool.title).not.toMatch(/not wired/);
    drag(gizmo, 'X', (o) => { o.scale.set(9, 1, 0.456); });
    expect(gizmo.object!.scale.toArray()).toEqual([4, 1, 0.46]);
    expect(undoTitle()).toMatch(/^Undo: Set scale · pad SELECT/);
    expect(poses(api)).toEqual([[0, 0, 0, 4, 1, 0.46]]);
    drag(gizmo, 'Y', (o) => { o.scale.set(4, -3, 0.46); });
    expect(gizmo.object!.scale.toArray(), 'never mirrored, never flat').toEqual([4, 0.1, 0.46]);
    document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!.click();
    await vi.waitFor(() => expect(poses(api)).toEqual([[0, 0, 0, 4, 1, 0.46]]));
    document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!.click();
    await vi.waitFor(() => expect(poses(api)).toBeUndefined());
  }, 90_000);

  it('FX-9: a group of pieces scales uniformly about its centre, one step a drag, stopping whole where a piece reaches 4', async () => {
    const { api, gizmo } = await placed('piece');
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [10, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('selection.set', { refs: ['piece:0', 'piece:1'] }, api.read().revision)).toMatchObject({ ok: true });
    key('KeyR', 'r');
    expect(gizmo.mode).toBe('scale');
    const xs = (): number[] => api.read().layout!.pieces.map((p) => p[1]);
    // One axis dragged to 3: the whole group 3 times, each piece 3, 3, 3, each offset from the centre (5) 3 times.
    drag(gizmo, 'X', (o) => { o.scale.set(3, 1, 1); });
    expect(undoTitle()).toMatch(/^Undo: Set scale · pad SELECT/);
    expect(poses(api)).toEqual([[0, 0, 0, 3, 3, 3], [1, 0, 0, 3, 3, 3]]);
    expect(xs()).toEqual([-10, 20]);
    // Twice again would make 6: the drag stops, whole, where the pieces reach 4 (a factor of 4 / 3).
    drag(gizmo, 'Y', (o) => { o.scale.set(1, 2, 1); });
    expect(poses(api)).toEqual([[0, 0, 0, 4, 4, 4], [1, 0, 0, 4, 4, 4]]);
    expect(xs()).toEqual([-15, 25]);
  }, 90_000);

  it('FX-9: a group of pieces tilts about its centre on the X ring; a group holding a marker keeps the yaw ring and refuses a scale', async () => {
    const { api, gizmo } = await placed('piece');
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [10, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('selection.set', { refs: ['piece:0', 'piece:1'] }, api.read().revision)).toMatchObject({ ok: true });
    key('KeyE', 'e');
    expect([gizmo.showX, gizmo.showZ]).toEqual([true, true]);
    drag(gizmo, 'X', (o) => { o.quaternion.setFromEuler(new Euler(20.2 * DEG, 0, 0, 'YXZ')); });
    // The registry's words for a turn of two (`shell/operations.ts` `piece.rotate`: `counted('Rotate')`), as a group's yaw.
    expect(undoTitle()).toMatch(/^Undo: Rotate 2 · pad SELECT/);
    expect(poses(api)).toEqual([[0, 20, 0, 1, 1, 1], [1, 20, 0, 1, 1, 1]]);
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 20] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('selection.set', { refs: ['piece:0', 'spawn:0'] }, api.read().revision)).toMatchObject({ ok: true });
    key('KeyE', 'e');
    expect([gizmo.showX, gizmo.showZ]).toEqual([false, false]);
    const revision = api.read().revision;
    gizmo.axis = 'E';
    document.querySelector('.fx-input')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    expect(statusLine()).toBe('A group with a marker turns about the vertical only: select pieces alone to tilt them');
    key('KeyR', 'r');
    gizmo.axis = 'XYZ';
    document.querySelector('.fx-input')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    expect(statusLine()).toBe('A group with a marker keeps its size: select pieces alone to scale them');
    expect(api.read().revision).toBe(revision);
  }, 90_000);

  it('FX-9: the agent sets a piece pitch and scale, one step each named (agent); the Inspector shows them; undo takes each back', async () => {
    const { api } = await placed('piece');
    const field = (label: string): HTMLInputElement => document.querySelector<HTMLInputElement>(`[data-forge-panel="inspector"] input[data-label="${label}"]`)!;
    expect(await api.execute('placement.set', { ref: 'piece:0', field: 'pitch', value: 30 }, api.read().revision)).toMatchObject({ ok: true });
    expect(undoTitle()).toMatch(/^Undo: Set pitch \(agent\) · pad SELECT/);
    expect(await api.execute('placement.set', { ref: 'piece:0', field: 'scale', value: [2, 1, 0.5] }, api.read().revision)).toMatchObject({ ok: true });
    expect(undoTitle()).toMatch(/^Undo: Set scale \(agent\) · pad SELECT/);
    expect(poses(api)).toEqual([[0, 30, 0, 2, 1, 0.5]]);
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(['Pitch', 'Scale X', 'Scale Y', 'Scale Z'].map((l) => field(l).value)).toEqual(['30', '2', '1', '0.5']));
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(poses(api)).toEqual([[0, 30, 0, 1, 1, 1]]);
    expect(await api.execute('undo', {}, api.read().revision)).toMatchObject({ ok: true });
    expect(poses(api)).toBeUndefined();
    expect(await api.execute('spawn.place', { team: 'A', at: [5, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('placement.set', { ref: 'spawn:0', field: 'scale', value: 2 }, api.read().revision)).toMatchObject({ ok: false, code: 'UNSUPPORTED' });
  }, 90_000);

  it('FX-9: a marker keeps the yaw ring alone; a grab of the view ring or a scale handle is refused in words, no edit', async () => {
    const { api, gizmo } = await placed('spawn');
    key('KeyE', 'e');
    expect([gizmo.mode, gizmo.showX, gizmo.showZ]).toEqual(['rotate', false, false]);
    const revision = api.read().revision;
    const grab = (axis: string): void => {
      gizmo.axis = axis;
      document.querySelector('.fx-input')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    };
    grab('E');
    expect(statusLine()).toBe('Markers turn about the vertical only: use the Y ring or Yaw');
    key('KeyR', 'r');
    expect(gizmo.mode).toBe('scale');
    grab('X');
    expect(statusLine()).toBe('Markers keep their size: select a piece to scale it');
    expect(api.read().revision).toBe(revision);
  }, 90_000);
});
