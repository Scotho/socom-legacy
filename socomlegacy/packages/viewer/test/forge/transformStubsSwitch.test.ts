// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { layoutOfRecord, recordOfLayout, RECORD_ANGLE_DENOMINATOR, type Layout } from '@s2u/creator-contracts';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { LOCAL_TURN_WHOLE_EPSILON_ADAPTATION, recordTurn, turnOf, turnQuaternion, wholeOrKeptTurn, type PieceTurn } from '../../src/forge/transformStubs';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';
import { inspector as inspectorPanel, showTab } from './helpers/editor';   // FC2-4: his editor's ways in (EDITOR-MAP.md)

/**
 * FC-1's review fold (F1; a browser adaptation, FG.R2 -- the game has no editor): `FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION`
 * flipped on the mounted Forge, not only pinned as text. FX-9 (FX.R3) ships it off: the controls are real -- the Scale
 * tool, R picking the scale gizmo, the Inspector's Pitch / Roll fields and its Scale
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
      // The page's own gizmo only: the contributor's geometry editor (OT.R112; `src/forge/geometry/editor.ts`) makes its own.
      if (!/geometry[\\/]editor\.ts/.test(new Error().stack ?? '')) gizmos.push(this as unknown as GizmoProbe);
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
  census = async () => null;
  props = async () => null;
  scriptNames = async () => null;
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

  /**
   * The page's Scale tool (`scaleBtn`), by its word: its title is empty until Geometry mode is toggled (the contributor's
   * toolbar, OT.R112: page.ts `scaleBtn`, its title set as Geometry mode turns on or off), so it is found by its label, hidden or not.
   */
  const scaleToolOf = (doc: Document): HTMLButtonElement | null => {
    const found = [...doc.querySelectorAll<HTMLButtonElement>('button.fx-tool')].filter((b) => b.textContent?.trim() === 'Scale');
    expect(found, 'one Scale tool').toHaveLength(1);
    return found[0]!;
  };

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
    const scaleTool = scaleToolOf(document);
    key('KeyE', 'e');
    const rotate = { mode: api.read().view.gizmo, showX: gizmo.showX, showZ: gizmo.showZ };
    key('KeyR', 'r');
    return {
      fields: ['Pitch', 'Roll', 'Scale X', 'Scale Y', 'Scale Z'].map((l) => [l, shown(field(l))]),
      kept: ['X', 'Y', 'Z', 'Yaw'].map((l) => shown(field(l))),
      scaleRow: shown(inspector.querySelector('.fx-scale-fields')),
      scaleTool: scaleTool !== null && !scaleTool.hidden,
      // The menu's "W / E / R / G" shortcuts row is gone with the contributor's shortcut editor (OT.R112): not read.
      rotate,
      afterR: api.read().view.gizmo,
    };
  }

  const hiddenLook = {
    fields: [['Pitch', false], ['Roll', false], ['Scale X', false], ['Scale Y', false], ['Scale Z', false]],
    kept: [true, true, true, true], scaleRow: false, scaleTool: false,
    rotate: { mode: 'rotate', showX: false, showZ: false }, afterR: 'rotate',
  };

  const liveLook = {
    fields: [['Pitch', true], ['Roll', true], ['Scale X', true], ['Scale Y', true], ['Scale Z', true]],
    kept: [true, true, true, true], scaleRow: true, scaleTool: true,
    rotate: { mode: 'rotate', showX: true, showZ: true }, afterR: 'scale',
  };

  it('off (as shipped, FX-9): the Scale tool, R, Pitch / Roll and the Scale row, and the tilt rings', async () => {
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
    const tool = scaleToolOf(document)!;
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

  /*
   * FN-3's follow-up (ours; the FORGE-NEXT batch review's finding; the owner, 2026-11-14, "agreed on your lean": FN.R4, a
   * rotation-only carry under a one-axis STRETCH; a browser adaptation, FG.R2 -- the game has no editor): a carry is
   * decided by the CHANGE of the parent's scale in the edit, not by the parent's state. A uniform change (the scale
   * gizmo's all-axes handle, XYZ, which three's TransformControls applies as one factor to every axis) on a parent ALREADY
   * stretched still scales what is under it, about the parent, without a shear. The uniform path used here is the single
   * piece's gizmo: `transformRefusal('scale')` is null for a lone piece that is not a pack's, and `objectChange` only
   * clamps it to 0.1..4; the drag is written as `drag` writes three's (its start, the object changed, its release).
   * Written, not run (the host rule).
   */
  it('FN-3 follow-up, RED: a uniform scale (XYZ handle, 2 -> 4) of a parent already stretched to (2, 1, 1) scales its child (turned 45) by 2, unsheared', async () => {
    // Expected RED on `0038018097`, at the child's pose row ("expected undefined to deeply equal [1, 0, 0, 2, 2, 2]"):
    // `carriedMatrix` keeps the child's size whenever the parent's scale is not uniform at the edit's start or now, and
    // (2, 1, 1) is not, so the child stays 1, 1, 1 (no pose row) while its place doubles. Expected GREEN after the fix:
    // the change (4, 2, 2) / (2, 1, 1) = 2 on each axis is uniform, so the child is composed as `a.matrix * rel`:
    // S(4,2,2) * [S(1/2,1,1) * T(100) * Ry(45)] = T(200) * Ry(45) * S(2) -- the parent's stretch cancels, the factor 2 a
    // scalar: size 2, 2, 2, still turned 45 about the vertical (pitch and roll 0), its place 100 -> 200.
    const { api, gizmo } = await placed('piece');
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [50, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    // The tree through the record (as `poseFrame.test.ts` `parentAndChild` makes it), the child's row turned 45.
    const saved = JSON.parse(JSON.stringify(api.read().layout)) as Record<string, unknown> & { pieces: number[][] };
    saved.pieces[1]![4] = 45;
    expect(await api.execute('layout.import', { layout: { ...saved, tree: [['piece:1', 'piece:0']] } }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect((api.read().layout as { tree?: unknown }).tree).toEqual([['piece:1', 'piece:0']]));
    expect(await api.execute('selection.set', { refs: ['piece:0'] }, api.read().revision)).toMatchObject({ ok: true });
    const inspector = inspectorPanel(document);
    await vi.waitFor(() => {
      expect(inspector.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece');
      expect(inspector.querySelector('.fx-inspect-name')!.textContent!.includes(' · in '), 'the parent shown (it has no parent)').toBe(false);
    });
    const rowsOf = (): { pieces: number[][]; poses?: number[][] } => api.read().layout as unknown as { pieces: number[][]; poses?: number[][] };
    const poseRow = (i: number): number[] | undefined => (rowsOf().poses ?? []).find((p) => p[0] === i);
    const refOf = (id: string): { at: number[]; yaw: number } => (api.read().refs as { ref: string; at: number[]; yaw: number }[]).find((r) => r.ref === id)!;
    const scaleOf = (id: string): number[] => (globalThis as unknown as { __forgeScaleOf: (r: string) => number[] }).__forgeScaleOf(id).map((v) => Math.round(v * 1e6) / 1e6);
    // The stretch first, typed: a one-axis change, so the child keeps its size (FN-3) and only its place stretches.
    const scaleX = inspector.querySelector<HTMLInputElement>('input[data-label="Scale X"]')!;
    scaleX.value = '2';
    scaleX.dispatchEvent(new Event('change'));
    expect(poseRow(0), 'CONTROL: the parent stretched').toEqual([0, 0, 0, 2, 1, 1]);
    expect(poseRow(1), 'CONTROL: the child at its own size after the stretch').toBeUndefined();
    expect(refOf('piece:1').at[0], 'CONTROL: its place stretched, 50 -> 100').toBeCloseTo(100, 4);
    // Then the uniform scale: the gizmo's XYZ handle, a factor of 2 on every axis.
    key('KeyR', 'r');
    expect(gizmo.mode).toBe('scale');
    expect(gizmo.object!.scale.toArray(), 'the gizmo on the parent').toEqual([2, 1, 1]);
    drag(gizmo, 'XYZ', (o) => { o.scale.set(4, 2, 2); });
    expect(poseRow(0), 'the parent scaled uniformly').toEqual([0, 0, 0, 4, 2, 2]);
    expect(poseRow(1), 'the child twice its size, pitch and roll 0 (no shear)').toEqual([1, 0, 0, 2, 2, 2]);
    expect(rowsOf().pieces[1]![4], 'its yaw').toBe(45);
    expect(scaleOf('piece:1'), 'the child drawn twice its size').toEqual([2, 2, 2]);
    const child = refOf('piece:1');
    expect(child.yaw, 'its turn (rotation.y)').toBeCloseTo(45 * DEG, 6);
    expect(child.at[0], 'its place doubled from the parent, 100 -> 200').toBeCloseTo(200, 4);
    expect(child.at[1], 'y').toBeCloseTo(0, 4);
    expect(child.at[2], 'z').toBeCloseTo(0, 4);
  }, 90_000);
});

/*
 * FN-4 (ours; the Forge lane's FN.R5, the owner: "agreed with your suggestion"; a browser adaptation, FG.R2 -- the game has
 * no editor): the page's world-lattice snap (`transformStubs` `recordTurn`) is the record's own reading of a turn
 * (`creator-contracts` `poseOf`): a piece's yaw, pitch and roll on a hundredth of a degree (`RECORD_ANGLE_DENOMINATOR`),
 * yaw and roll in 0..359.99, pitch signed, the gimbal's one form. Pure functions, no page. Written, NOT RUN (the host
 * rule). Every case RED at the RED commit (`recordTurn` and `RECORD_ANGLE_DENOMINATOR` not exported yet) and GREEN from
 * the page commit (`recordTurn`; the record's half from the writer's commit).
 */
describe('FN-4: the world turn on the record\'s hundredth of a degree (recordTurn), as the record keeps it', () => {
  const q = (t: PieceTurn): Quaternion => turnQuaternion(t);

  it('RED: each angle on the hundredth, the yaw and roll in 0..359.99, the pitch signed', () => {
    expect(RECORD_ANGLE_DENOMINATOR).toBe(100);
    expect(recordTurn(q({ yaw: 58.673, pitch: 38.931, roll: 27.029 }))).toEqual({ yaw: 58.67, pitch: 38.93, roll: 27.03 });
    expect(recordTurn(q({ yaw: -10.006, pitch: -20.5, roll: -30.25 }))).toEqual({ yaw: 349.99, pitch: -20.5, roll: 329.75 });
    // a pitch and roll under half a hundredth: the record's yaw-only form (no -0 anywhere)
    expect(recordTurn(q({ yaw: 12.341, pitch: 0.001, roll: -0.002 }))).toEqual({ yaw: 12.34, pitch: 0, roll: 0 });
  });

  it('RED: the gimbal\'s one form: a pitch that is 90 on the lattice writes roll 0, its turn in the yaw', () => {
    // 89.996 is 90 on the hundredth: Ry(30) Rx(90) Rz(20) is Ry(10) Rx(90); at -90 the roll adds (Ry(50) Rx(-90)).
    expect(recordTurn(q({ yaw: 30, pitch: 89.996, roll: 20 }))).toEqual({ yaw: 10, pitch: 90, roll: 0 });
    expect(recordTurn(q({ yaw: 30, pitch: -90, roll: 20 }))).toEqual({ yaw: 50, pitch: -90, roll: 0 });
    // 89.99 stays 89.99; read at the gimbal (|sin| past three's 0.9999999), its roll goes into the yaw, 10 - 20
    expect(recordTurn(q({ yaw: 10, pitch: 89.99, roll: 20 }))).toEqual({ yaw: 350, pitch: 89.99, roll: 0 });
  });

  it('RED: the page and the record agree: for each pose the snapped turn is the one recordOfLayout then layoutOfRecord give back', () => {
    const poses: PieceTurn[] = [
      { yaw: 58.673, pitch: 38.931, roll: 27.029 }, { yaw: -10.006, pitch: -20.5, roll: -30.25 }, { yaw: 30, pitch: 89.996, roll: 20 },
      { yaw: 12.341, pitch: 0.001, roll: -0.002 }, { yaw: 200.5, pitch: 45.25, roll: 180 }, { yaw: 0, pitch: 0, roll: 0 },
      { yaw: 10, pitch: 89.99, roll: 20 }, { yaw: 40, pitch: 30, roll: 20 },
    ];
    for (const t of poses) {
      const at = JSON.stringify(t);
      const turn = q(t);
      const kept = recordTurn(turn);
      const layout: Layout = { forge: 1, base: { kind: 'map', archive: 'MP2' }, spawns: [],
        pieces: [{ asset: 'MP2:crate', m: new Matrix4().compose(new Vector3(1, 2, 3), turn, new Vector3(1, 1, 1)).toArray() }] };
      const r = recordOfLayout(layout, 'Yard');
      // the record's own numbers are the snap's
      expect(r.pieces[0]![4], `${at}: the row's yaw`).toBe(kept.yaw);
      expect(r.poses ?? [], `${at}: the pose row`).toEqual(kept.pitch === 0 && kept.roll === 0 ? [] : [[0, kept.pitch, kept.roll, 1, 1, 1]]);
      expect(r.version, `${at}: the version`).toBe([kept.yaw, kept.pitch, kept.roll].every(Number.isInteger) ? 3 : 4);
      // and the turn a reopen gives back is the snapped turn, to float noise
      const back = new Quaternion();
      new Matrix4().fromArray(layoutOfRecord(r).pieces[0]!.m).decompose(new Vector3(), back, new Vector3());
      expect(1 - Math.abs(back.dot(q(kept))), `${at}: the reopened turn`).toBeLessThan(1e-12);
    }
  });
});

/*
 * FN-4, fix round 1 (F1; ours, a browser adaptation, FG.R2): an edit that is not about angles keeps a piece's turn
 * relative to its parent (`page.ts` `poseOn` with `whole` false), unless it is already within
 * `LOCAL_TURN_WHOLE_EPSILON_ADAPTATION` of its whole-degree triple, when it is put exactly on it -- the choice is
 * `wholeOrKeptTurn`, by the ANGLE between the two turns (2 acos |qA . qB|), never by a difference of Euler angles (those
 * grow as 1 / cos pitch near the vertical). Pure functions, no page. Written, NOT RUN (the host rule). Both cases RED at
 * the RED commit (`wholeOrKeptTurn` and the constant not exported yet: the mock's spread of the real module has no such
 * export) and GREEN from the fix. The numbers were computed by plain arithmetic in the `YXZ` order.
 */
describe('FN-4 fix F1: a relative turn kept, or put on its whole degrees within LOCAL_TURN_WHOLE_EPSILON_ADAPTATION (wholeOrKeptTurn)', () => {
  const DEG = Math.PI / 180;
  /** The angle between two turns, in degrees. */
  const apart = (a: Quaternion, b: Quaternion): number => (2 * Math.acos(Math.min(1, Math.abs(a.dot(b))))) / DEG;
  /** A turn of `d` degrees about `axis`. */
  const about = (axis: Vector3, d: number): Quaternion => new Quaternion().setFromAxisAngle(axis, d * DEG);

  it('RED: 0.1 degrees; a turn 0.02 off a whole triple is put on it, one 0.3 off is kept as it is, one on it is unchanged', () => {
    // FN-4, fix round 3: the constant's pin moves from 0.05 to 0.1 (RED at 0d1d738787 at this line, GREEN from the fix);
    // the three turns below are as they were, on the same side of 0.1 as of 0.05.
    expect(LOCAL_TURN_WHOLE_EPSILON_ADAPTATION).toBe(0.1);
    const whole = turnQuaternion({ yaw: 10, pitch: 20, roll: 30 });
    const near = whole.clone().multiply(about(new Vector3(1, 0, 0), 0.02));
    expect(apart(near, whole), 'the test\'s own turn: 0.02 off').toBeCloseTo(0.02, 6);
    expect(wholeOrKeptTurn(near).toArray(), '0.02 off: put on the whole triple').toEqual(whole.toArray());
    const far = whole.clone().multiply(about(new Vector3(1, 0, 0), 0.3));
    expect(apart(far, whole), 'the test\'s own turn: 0.3 off').toBeCloseTo(0.3, 6);
    expect(wholeOrKeptTurn(far).toArray(), '0.3 off: kept').toEqual(far.toArray());
    expect(wholeOrKeptTurn(whole).toArray(), 'on it: unchanged').toEqual(whole.toArray());
  });

  it('RED: near the vertical the choice is by the angle between the turns, not by the Euler angles', () => {
    // A whole triple at pitch 89 turned 0.005 degrees about its own Y: its `YXZ` yaw and roll read 10.2688 and 20.2687
    // (each 0.27 off, 1 / cos 89 = 57 times the turn), its pitch 88.9983 -- far apart as Euler angles, 0.005 degrees apart
    // as turns: put back on 10 / 89 / 20.
    const whole = turnQuaternion({ yaw: 10, pitch: 89, roll: 20 });
    const near = whole.clone().multiply(about(new Vector3(0, 1, 0), 0.005));
    const t = turnOf(near);
    expect(Math.abs(t.yaw - 10), 'its Euler yaw moved').toBeGreaterThan(0.2);
    expect(Math.abs(t.roll - 20), 'its Euler roll moved').toBeGreaterThan(0.2);
    expect(apart(near, whole), 'the turn moved 0.005').toBeLessThan(0.006);
    expect(wholeOrKeptTurn(near).toArray(), 'put back on its whole triple').toEqual(whole.toArray());
    // At a pitch of 89.6 the whole triple is the gimbal's form at 90 (yaw 10 - 20 = -10, roll 0): 20 degrees off in yaw
    // and in roll as Euler angles, 0.4 degrees as a turn (a turn moves the pitch by no more than its angle, so no turn at
    // a pitch of 89.6 is within 0.1 of a whole one): kept as it is.
    const steep = turnQuaternion({ yaw: 10, pitch: 89.6, roll: 20 });
    expect(apart(steep, turnQuaternion({ yaw: -10, pitch: 90, roll: 0 })), 'the gimbal form: 0.4 off').toBeCloseTo(0.4, 6);
    expect(wholeOrKeptTurn(steep).toArray(), 'kept').toEqual(steep.toArray());
  });

  it('FN-4 fix round 3, RED: a turn 0.06 degrees off its whole triple is put on it (the gimbal edge moves a turn by up to 0.0555)', () => {
    // Written, NOT RUN (the host rule). Expected RED at 0d1d738787 at the 0.06 line: 0.06 is past 0.05, so the turn is
    // kept. GREEN from the fix (0.1). Why 0.06 must be put back, by hand: a true pitch of 89.9745 is inside the record's
    // gimbal window (90 - 89.9745 = 0.0255 < 0.025623 degrees), so `poseOf` / `recordTurn` read roll 0 and put the roll in
    // the yaw, and the pitch goes on the hundredth as 89.97. With roll 180: Rx(90 - d) Rz(180) against
    // Ry(-180) Rx(90 - d') (d = 0.0255, d' = 0.03) is a turn about x whose second column goes from the angle -90 - d to
    // -90 + d', d + d' = 0.0555 degrees. A whole-degree child read back off such a record is that far off its triple.
    // CONTROL beside it (green before and after): 0.02 off is put on it, 0.3 off is kept.
    const whole = turnQuaternion({ yaw: 10, pitch: 20, roll: 30 });
    const six = whole.clone().multiply(about(new Vector3(1, 0, 0), 0.06));
    expect(apart(six, whole), 'the test\'s own turn: 0.06 off').toBeCloseTo(0.06, 6);
    expect(wholeOrKeptTurn(six).toArray(), '0.06 off: put on the whole triple').toEqual(whole.toArray());
    const near = whole.clone().multiply(about(new Vector3(0, 0, 1), 0.02));
    expect(wholeOrKeptTurn(near).toArray(), '0.02 off: put on it').toEqual(whole.toArray());
    const far = whole.clone().multiply(about(new Vector3(0, 0, 1), 0.3));
    expect(wholeOrKeptTurn(far).toArray(), '0.3 off: kept').toEqual(far.toArray());
  });
});
