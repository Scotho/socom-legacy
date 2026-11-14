// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Euler, Matrix4, Quaternion } from 'three';
import { contentAssetKey, type ContentRef } from '@s2u/creator-contracts';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { recordOfLayout } from '../../src/forge/record';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';
// FC2-4: found and pressed through the contributor's editor (`./helpers/EDITOR-MAP.md`).
import { assetTiles, inspector as inspectorPanel, inspectorField, pressMenubar, showTab, statusLine } from './helpers/editor';

/**
 * FC2-7, part A (the Forge Crispy2 lane, `socomlegacy/docs/plans/2026-11-13-forge-crispy2.md`; a browser adaptation, FG.R2 --
 * the game has no editor, nothing here is the original's): a placed piece's pose fields where two features meet in
 * `forge/page.ts` -- FX-9's Pitch, Roll and Scale (the WORLD turn and scale, kept on the layout record's lattice:
 * whole degrees, scale steps of 0.01 within 0.1..4) and the contributor's tree (`Layout.tree`: position and Yaw shown
 * and edited LOCAL to a parent; whatever is under a moved placement carried along by composing and decomposing
 * matrices). Each case is named by what a person in the editor sees and asserts a property that must hold whichever
 * frame the fields later share. Titles start RED (expected to fail on the import's head, `77ba4fcfb0`) or CONTROL
 * (expected green there), each with its reason by reading; NOTHING here was run when it was written (part A: tests and
 * a read only). The page is mounted as `pagePanels.test.ts` mounts it (only the GPU and disc I/O replaced). Part B
 * (`bb74b53236`, ours: the record's lattice and bounds) turns most REDs green, each case's comment says which; the
 * `page.ts:<line>` citations are at `77ba4fcfb0`, before part B moved them.
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

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
async function syntheticArchive(stem: string, models: readonly string[]): Promise<LoadedMap> {
  const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
  return {
    ...blankLibraryMap(stem, 1000), path: `synthetic/${stem}`, name: stem, world: [floorMesh(1000)],
    props: models.map((modelName) => ({ modelName, parts: [floorMesh(4)], matrices: IDENTITY.slice(), order: 0, alternate: false, facade: 0, lod: null, paths: [`world/${modelName}`] })),
  } as LoadedMap;
}

/** The record's rows this file reads (`creator-contracts` `PieceRow`, `PoseRow`, `tree`). */
interface RecordRows { pieces: (number | boolean)[][]; poses?: number[][]; tree?: [string, string][] }
/** The nine transform fields, in the Inspector's order. */
const FIELDS = ['X', 'Y', 'Z', 'Pitch', 'Yaw', 'Roll', 'Scale X', 'Scale Y', 'Scale Z'] as const;
/** What a person sees of one piece, and the scene's own numbers the agent's refs carry (`at`, three's `rotation.y`). */
interface PieceSeen { fields: string[]; at: number[]; yaw: number }
interface Seen { rows: string; pieces: Record<string, PieceSeen> }
const DEG = Math.PI / 180;
/** A turn in degrees in the `YXZ` order (`forge/transformStubs` `turnQuaternion`, the record's `PoseRow` order). */
const turnQ = (yaw: number, pitch: number, roll: number): Quaternion => new Quaternion().setFromEuler(new Euler(pitch * DEG, yaw * DEG, roll * DEG, 'YXZ'));
/** The angle between two turns, in degrees. */
const apart = (a: Quaternion, b: Quaternion): number => (2 * Math.acos(Math.min(1, Math.abs(a.dot(b))))) / DEG;
/** Whether `v` is on the record's scale lattice (`RECORD_SCALE_DENOMINATOR` 100) and within its bounds (0.1..4). */
const onScaleLattice = (v: number): boolean => Math.round(v * 100) / 100 === v && v >= 0.1 && v <= 4;

describe('FC2-7: one frame for a piece\'s pose fields under a parent (the mounted page)', () => {
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
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  async function mounted(): Promise<ForgeAgentApi> {
    const { mountForge } = await import('../../src/forge/page');
    let api!: ForgeAgentApi;
    await mountForge(document, { onAgentReady: (a) => { api = a; }, panels: [] });
    const based = await api.execute('layout.base', { base: { kind: 'map', archive: 'MP2' } }, api.read().revision);
    expect(based, JSON.stringify(based)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(assetTiles(document)).toHaveLength(2));
    showTab(document, 'object');                                    // map D6: the Object tab (the Outliner's)
    return api;
  }
  const field = (label: string): HTMLInputElement => inspectorField(document, label);
  const values = (): string[] => FIELDS.map((l) => field(l).value);
  const typed = (label: string, value: string): void => { const f = field(label); f.value = value; f.dispatchEvent(new Event('change')); };
  const pointer = (target: EventTarget, type: string, x: number): void => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 }));
  };
  /** A field scrubbed `px` pixels in one move and let go (`forge/scrub`: the preview, then one `change`), as FX-9's case drags. */
  const scrubbed = (label: string, px: number): void => {
    pointer(field(label), 'pointerdown', 0);
    pointer(document, 'pointermove', px);
    pointer(document, 'pointerup', px);
  };
  /** A field scrubbed through each of `xs` (pixels from the press) and let go at the last. */
  const scrubbedThrough = (label: string, xs: readonly number[]): void => {
    pointer(field(label), 'pointerdown', 0);
    for (const x of xs) pointer(document, 'pointermove', x);
    pointer(document, 'pointerup', xs[xs.length - 1] ?? 0);
  };
  const rows = (api: ForgeAgentApi): RecordRows => api.read().layout as unknown as RecordRows;
  const ref = (api: ForgeAgentApi, id: string): { at: number[]; yaw: number } =>
    (api.read().refs as { ref: string; at: number[]; yaw: number }[]).find((r) => r.ref === id)!;
  /** One piece selected, the Inspector showing it (its head names its parent when it has one: `· in <parent>`). */
  async function select(api: ForgeAgentApi, id: string): Promise<void> {
    expect(await api.execute('selection.set', { refs: [id] }, api.read().revision)).toMatchObject({ ok: true });
    const underParent = (rows(api).tree ?? []).some(([c]) => c === id);
    const head = inspectorPanel(document);
    await vi.waitFor(() => {
      expect(head.querySelector('.fx-inspect-kind')!.textContent).toBe('Piece');
      expect(head.querySelector('.fx-inspect-name')!.textContent!.includes(' · in '), `${id} shown with its parent`).toBe(underParent);
    });
  }
  /** What each of `ids` shows, and the record's piece rows, poses and tree. */
  async function seen(api: ForgeAgentApi, ids: readonly string[]): Promise<Seen> {
    const r = rows(api);
    const out: Seen = { rows: JSON.stringify({ pieces: r.pieces, poses: r.poses ?? null, tree: r.tree ?? null }), pieces: {} };
    for (const id of ids) {
      await select(api, id);
      const { at, yaw } = ref(api, id);
      out.pieces[id] = { fields: values(), at: [...at], yaw };
    }
    return out;
  }
  /** Saved and reopened: the record as `layout.import` takes it (`layoutOfRecord`), as FX-9's case reopens. */
  async function reopened(api: ForgeAgentApi): Promise<void> {
    const saved = JSON.parse(JSON.stringify(api.read().layout)) as Record<string, unknown> & RecordRows;
    expect(await api.execute('layout.import', { layout: saved }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => {
      expect(rows(api).pieces).toHaveLength(saved.pieces.length);
      expect(rows(api).tree ?? null).toEqual(saved.tree ?? null);
    });
  }
  /**
   * A save and a reopen give back what the editor showed: the record's rows, every field of every piece, and the scene's
   * own place (within the record's tenth of a unit, `tenth`) and turn (three's `rotation.y`, to float noise) -- a piece
   * whose turn or scale is off the record's lattice comes back changed, whatever frame its fields are in.
   */
  async function keptThroughReopen(api: ForgeAgentApi, ids: readonly string[]): Promise<void> {
    const before = await seen(api, ids);
    await reopened(api);
    const after = await seen(api, ids);
    expect(after.rows, 'the record').toBe(before.rows);
    for (const id of ids) {
      const [b, a] = [before.pieces[id]!, after.pieces[id]!];
      expect(a.fields, `${id}: the fields (${FIELDS.join(', ')})`).toEqual(b.fields);
      for (const k of [0, 1, 2]) expect(Math.abs(a.at[k]! - b.at[k]!), `${id}: its place, axis ${k}`).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(a.yaw, `${id}: its turn (rotation.y)`).toBeCloseTo(b.yaw, 6);
    }
  }
  /**
   * Two pieces: `piece:0` at the origin given `parent`'s fields, `piece:1` at x 50 given `child`'s (both typed while
   * neither has a parent, so every field is world there), then `piece:1` put under `piece:0` through the record's tree, as
   * FC2-2's case does (each keeps its world place, `Layout.tree`).
   */
  async function parentAndChild(api: ForgeAgentApi, parent: readonly [string, string][], child: readonly [string, string][]): Promise<void> {
    for (const at of [[0, 0, 0], [50, 0, 0]]) expect(await api.execute('piece.place', { asset: 'MP2:crate', at }, api.read().revision)).toMatchObject({ ok: true });
    await select(api, 'piece:0');
    for (const [label, v] of parent) typed(label, v);
    await select(api, 'piece:1');
    for (const [label, v] of child) typed(label, v);
    const saved = JSON.parse(JSON.stringify(api.read().layout)) as Record<string, unknown>;
    expect(await api.execute('layout.import', { layout: { ...saved, tree: [['piece:1', 'piece:0']] } }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(rows(api).tree).toEqual([['piece:1', 'piece:0']]));
  }
  /** A piece's world turn and scale as the record keeps them (its row's yaw; its pose row's pitch, roll and scale). */
  const recordPose = (api: ForgeAgentApi, i: number): { q: Quaternion; s: number[] } => {
    const r = rows(api);
    const pose = (r.poses ?? []).find((p) => p[0] === i);
    return { q: turnQ(r.pieces[i]![4] as number, pose?.[1] ?? 0, pose?.[2] ?? 0), s: pose ? pose.slice(3, 6) : [1, 1, 1] };
  };
  /**
   * The six pose fields describe ONE frame: Pitch, Yaw and Roll composed (`YXZ`) are the piece's turn read either in the
   * world or local to its parent, within the fields' and the record's whole-degree rounding (2.5 degrees all told); the
   * Scale fields are its scale in that frame (the parents here are at scale 1, where the two frames' scales are one).
   * Passes if all six are world or all six are local; fails if they are mixed.
   */
  const oneFrame = (api: ForgeAgentApi, i: number, parentIndex: number | null, why: string): void => {
    const shown = turnQ(Number(field('Yaw').value), Number(field('Pitch').value), Number(field('Roll').value));
    const world = recordPose(api, i);
    const asWorld = apart(shown, world.q);
    const asLocal = parentIndex === null ? asWorld : apart(shown, recordPose(api, parentIndex).q.invert().multiply(world.q));
    expect(Math.min(asWorld, asLocal), `${why}: the shown turn is ${asWorld.toFixed(2)} deg from the world turn, ${asLocal.toFixed(2)} deg from the local one`).toBeLessThan(2.5);
    expect([field('Scale X').value, field('Scale Y').value, field('Scale Z').value].map(Number), `${why}: the scale`).toEqual(world.s);
  };

  it('CONTROL: a piece with no parent -- its six pose fields, a typed Yaw, Pitch, Roll and Scale, a save and a reopen agree', async () => {
    // Expected GREEN today: with no parent `localMatrixOf` is the world matrix (page.ts:3093), so the Yaw field (his,
    // `localPose`, page.ts:5346-5351) and FX-9's Pitch, Roll and Scale (`fillStubFields`, page.ts:5226-5233) read the same
    // matrix in the same `YXZ` order; a whole-degree Yaw is set exactly (`setLocalAxis`, page.ts:3111-3115) and Pitch,
    // Roll and Scale go through `poseOn` (page.ts:5240-5241) onto the lattice, so the record (layout.ts `poseOf`) writes
    // what the scene holds. FX-9's four mounted cases in `pagePanels.test.ts` run this path and were green on his editor.
    const api = await mounted();
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    await select(api, 'piece:0');
    typed('Yaw', '40');
    typed('Pitch', '30');
    typed('Roll', '20');
    typed('Scale X', '2');
    typed('Scale Z', '0.5');
    expect(values().slice(3)).toEqual(['30', '40', '20', '2', '1', '0.5']);
    oneFrame(api, 0, null, 'no parent');
    await keptThroughReopen(api, ['piece:0']);
    oneFrame(api, 0, null, 'no parent, reopened');
  }, 90_000);

  // FC2 (H453 (5), the owner's): one frame for the six pose fields is the contributor's editor's design to choose (all
  // local, or all world); until then they show two frames under a turned parent: held as `it.fails`, registered.
  it.fails('RED: a piece under a parent pitched 30 and rolled 20 shows its six pose fields in one frame, before and after a typed Pitch or Yaw', async () => {
    // Expected RED: his design to decide (FC2-7, parked for the owner) -- part B (`bb74b53236`) changes no field's frame.
    // Why, at the first `oneFrame`: the child is at the world's identity turn under a parent turned
    // Rx(30)*Rz(20). Its Yaw field is LOCAL (`localPose` of P^-1 * C, page.ts:3105-3109, shown at 5351): the `YXZ` yaw of
    // Rz(-20)*Rx(-30), atan2(sin20*sin30, cos30), about 11 degrees; its Pitch and Roll are WORLD (`turnOf(piece.quaternion)`,
    // page.ts:5226-5230): 0 and 0. Read all-world, Yaw 11 / Pitch 0 / Roll 0 is 11 degrees from the identity; read
    // all-local, Ry(11) is tens of degrees from Rz(-20)*Rx(-30) (the parent's pitch and roll are not in it). Mixed, so
    // neither reading is within 2.5.
    const api = await mounted();
    await parentAndChild(api, [['Pitch', '30'], ['Roll', '20']], []);
    await select(api, 'piece:1');
    oneFrame(api, 1, 0, 'just put under its parent');
    typed('Pitch', '25');
    expect(field('Pitch').value).toBe('25');
    oneFrame(api, 1, 0, 'after a typed Pitch');
    typed('Yaw', '45');
    expect(field('Yaw').value).toBe('45');
    oneFrame(api, 1, 0, 'after a typed Yaw');
  }, 90_000);

  it('CONTROL: a piece under a parent pitched 30 and rolled 20 keeps a typed Pitch as shown through a save and a reopen', async () => {
    // Expected GREEN today: a typed Pitch is FX-9's `commitTurnField` (page.ts:5255-5274), which sets the child's WORLD
    // turn through `poseOn` (5262, 5240-5241): whole degrees, so the record (layout.ts `poseOf`, 2034-2052) writes exactly
    // the scene's turn and the reopen gives it back; the Yaw field, local, is recomputed from the same two matrices. (A
    // later frame for Pitch must keep this green: a pitch typed in the parent's frame lands the world turn off whole
    // degrees unless it is snapped after.)
    const api = await mounted();
    await parentAndChild(api, [['Pitch', '30'], ['Roll', '20']], []);
    await select(api, 'piece:1');
    typed('Pitch', '25');
    expect(field('Pitch').value).toBe('25');
    await keptThroughReopen(api, ['piece:0', 'piece:1']);
  }, 90_000);

  it('RED: a piece under a parent pitched 30 and rolled 20 keeps a typed Yaw as shown through a save and a reopen', async () => {
    // Expected green since `bb74b53236`: the typed commit now puts the piece's world pose on the lattice (`poseOn`) inside
    // the same `carrying`; the Yaw field then reads the local yaw of the snapped turn, 45.03 here by hand, shown 45.
    // Was RED on `1abfcb3cfc`: a typed Yaw is the contributor's `setLocalAxis(s, 'yaw', v)` (page.ts:6439-6444, 3111-3115):
    // the LOCAL `YXZ` yaw set to 45, then the world matrix P * local decomposed into the child (3098-3103). With P a
    // pitch and a roll, that world turn is off the whole-degree lattice and nothing snaps it (no `poseOn` on this path).
    // The record rounds it (layout.ts `poseOf`, 2046-2051: `Math.round` of the pitch, `wholeDeg` of the roll and yaw), so
    // the reopened child's turn differs from the one shown: `rotation.y` moves by up to about half a degree, and a
    // field may too. (The same scene goes to a lobby unrounded: `createLobby(... layoutNow())`, page.ts:11639, 11671.)
    const api = await mounted();
    await parentAndChild(api, [['Pitch', '30'], ['Roll', '20']], []);
    await select(api, 'piece:1');
    typed('Yaw', '45');
    expect(field('Yaw').value).toBe('45');
    await keptThroughReopen(api, ['piece:0', 'piece:1']);
  }, 90_000);

  it('RED: a parent scaled 2 along X then pitched 30 carries its child (turned 45 under it) on the record\'s lattice, and a save and a reopen give the child back as shown', async () => {
    // Expected green since `bb74b53236`: `carryFollowers` puts each carried piece on the lattice (`poseOn`), so the child
    // shows Scale 1.58 / 1 / 1.58 and a whole-degree turn, which a save and a reopen give back. The SHAPE it lost (the
    // shear below) is not given back: what a non-uniformly scaled parent does to a turned child is his tree's design.
    // Was RED on `1abfcb3cfc`, at the lattice line: the parent's Scale X scrub carries the child (`carrying`, page.ts:6388;
    // `carryFollowers`, 3076-3082) to P * rel = S(2,1,1) * T(50) * Ry(45), whose linear part S * Ry(45) has SHEAR (its X
    // and Z columns are (2cos45, 0, -sin45) and (2sin45, 0, cos45), not perpendicular). `Matrix4.decompose` (3079) takes
    // the column lengths as the scale -- sqrt(2.5) = 1.5811 on X and Z, off the 0.01 lattice -- and a turn from the
    // non-orthogonal columns; the shear is dropped and the child's shape changes. The pitch scrub then turns that (P'
    // * rel = Rx(30) * R' * S', no new shear) off whole degrees. The Scale fields show 1.581 (page.ts:5227); the record
    // writes 1.58 (layout.ts:2037, `scaleOnLattice`), so the reopen gives a different child too.
    const api = await mounted();
    await parentAndChild(api, [], [['Yaw', '45']]);
    await select(api, 'piece:0');
    scrubbed('Scale X', 100);                                        // 0.01 a pixel: 1 -> 2 (FX-9's scrub case)
    expect(field('Scale X').value).toBe('2');
    scrubbed('Pitch', 30);                                           // a degree a pixel: 0 -> 30
    expect(field('Pitch').value).toBe('30');
    await select(api, 'piece:1');
    for (const label of ['Scale X', 'Scale Y', 'Scale Z']) expect(onScaleLattice(Number(field(label).value)), `the child's ${label} ${field(label).value} on the record's lattice`).toBe(true);
    await keptThroughReopen(api, ['piece:0', 'piece:1']);
  }, 90_000);

  it('RED: a parent\'s Scale X dragged toward 3 keeps its child (at Scale X 2 under it) within the record\'s 0.1..4, and a save and a reopen give it back as shown', async () => {
    // Expected green since `bb74b53236`: the scale scrub's preview stops where the child would pass 4 (`followersFit`),
    // the field showing the last scale that fit, which the release commits: the parent at 2, the child at 4.
    // Was RED on `1abfcb3cfc`: the scrub carries the child to S(3,1,1) * T(50) * S(2,1,1) (page.ts:6388, 3076-3082), a scale
    // of 6 along X: nothing bounds a carried follower (the Scale fields' 0.1..4 bound a scrub of the piece itself,
    // page.ts:5211, 6395). The field shows 6; the record clamps it to 4 (layout.ts:2037, `scaleOnLattice`), so the
    // reopen gives a child two thirds the size; and a lobby made of this scene is refused by central
    // (`layoutWithinBounds` -> `pieceMatrixError`, forgeLobby.ts:410, pieceMatrix.ts:56-57: "the x axis scale 6 is over 4").
    // FC2-7 part B's rule (the coordinator's, 2026-11-13): such a drag STOPS where the first carried piece would leave
    // 0.1..4, as FX-9's group scale stops (`clampedFactor`): dragged through 1.5, 2, 2.5 and 3, the parent stays at 2,
    // the last that keeps its child (2 x 2 = 4) within the bounds; let go there, that is the step. (Part A's form scrubbed
    // straight to 3 and asserted the parent at 3: changed with the rule, the one assertion here that is not part A's.)
    const api = await mounted();
    await parentAndChild(api, [], [['Scale X', '2']]);
    await select(api, 'piece:0');
    scrubbedThrough('Scale X', [50, 100, 150, 200]);                 // 0.01 a pixel: 1.5, 2, 2.5, 3
    expect(field('Scale X').value, 'the parent stopped at the last scale that keeps its child within 4').toBe('2');
    await select(api, 'piece:1');
    expect(field('Scale X').value).toBe('4');
    for (const label of ['Scale X', 'Scale Y', 'Scale Z']) expect(onScaleLattice(Number(field(label).value)), `the child's ${label} ${field(label).value} within 0.1..4 on the lattice`).toBe(true);
    await keptThroughReopen(api, ['piece:0', 'piece:1']);
  }, 90_000);

  it('CONTROL: moving a parent that is scaled along X and pitched (its child turned under it) changes no follower\'s shape or turn', async () => {
    // Expected GREEN today: a typed X on the parent (page.ts:6439-6444) carries the child by rel = P^-1 * M_C taken before
    // the move (`followersOf`, 3071) and P' * rel after it (3079), with P' = T * P a pure translation of P, so the child's
    // new matrix is T * M_C to float noise: M_C is already the child's own T*R*S (it was decomposed into its position,
    // quaternion and scale), so the decompose gives back the same turn and scale. Only its place moves, by the parent's.
    // (The shape it lost was lost at the scale's carry, the RED case above; a move loses nothing more.)
    const api = await mounted();
    await parentAndChild(api, [], [['Yaw', '45']]);
    await select(api, 'piece:0');
    scrubbed('Scale X', 100);
    scrubbed('Pitch', 30);
    await select(api, 'piece:1');
    const before = { fields: values(), ...ref(api, 'piece:1') };
    const at0 = [...before.at];
    await select(api, 'piece:0');
    typed('X', '20');
    expect(field('X').value).toBe('20');
    await select(api, 'piece:1');
    expect(values(), 'the child\'s fields: its place local to the parent, its turn and its scale').toEqual(before.fields);
    const after = ref(api, 'piece:1');
    expect(after.yaw, 'its turn (rotation.y)').toBeCloseTo(before.yaw, 6);
    expect(after.at[0]! - at0[0]!, 'moved with the parent').toBeCloseTo(20, 6);
    expect(after.at[1]!).toBeCloseTo(at0[1]!, 6);
    expect(after.at[2]!).toBeCloseTo(at0[2]!, 6);
  }, 90_000);

  it('CONTROL: one undo after a parent\'s typed Yaw, or its scrubbed Roll, puts back the parent and the child it carried', async () => {
    // Expected GREEN today: the history is the layout's whole text (`layoutText`, page.ts:4356) recorded at the edit's end
    // (`edit`, 4410-4416), after `carrying` moved the followers inside the same perform (typed Yaw: 6439-6444; a scrub's
    // preview carries before its `change` commits the step, 6388 then 5266-5272); an undo puts that whole text back
    // (`restore`, 9184-9196). So the carried child is in the parent's one step.
    const api = await mounted();
    await parentAndChild(api, [], []);
    const child0 = [...ref(api, 'piece:1').at];
    await select(api, 'piece:0');
    typed('Yaw', '90');
    expect(ref(api, 'piece:1').at[0], 'the child carried round the parent').toBeCloseTo(0, 4);
    expect(ref(api, 'piece:1').at[2]).toBeCloseTo(-50, 4);
    const undoBtn = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('[data-forge="undo"]')!;
    expect(undoBtn().title).toMatch(/^Undo: Rotate · pad SELECT/);
    undoBtn().click();
    await vi.waitFor(() => { for (const [k, v] of child0.entries()) expect(ref(api, 'piece:1').at[k], `child axis ${k}`).toBeCloseTo(v, 4); });
    expect(rows(api).pieces[0]![4], 'the parent\'s yaw back').toBe(0);
    await select(api, 'piece:0');
    scrubbed('Roll', 30);                                            // about Z: the child at x 50 rises (a pitch, about X, would not move it)
    expect(ref(api, 'piece:1').at[1], 'the child carried by the roll').not.toBeCloseTo(child0[1]!, 2);
    undoBtn().click();
    await vi.waitFor(() => { for (const [k, v] of child0.entries()) expect(ref(api, 'piece:1').at[k], `child axis ${k}`).toBeCloseTo(v, 4); });
    expect(rows(api).poses, 'the parent\'s roll back').toBeUndefined();
  }, 90_000);

  it('RED: a typed Roll on a parent carries its child: the child keeps its place and its turn relative to the parent', async () => {
    // Expected green since `bb74b53236`: `commitTurnField`'s step runs inside `carrying([piece], ...)`.
    // Part B's first RED (new). Was RED on `1abfcb3cfc`: a typed Pitch, Roll or Scale is FX-9's `commitTurnField`,
    // whose step (page.ts:5266-5272) sets the piece's quaternion and scale with no `carrying`, so the child stays where it
    // was -- while a typed Yaw (6441), a scrub (6388) and the gizmo (2827) carry it.
    const api = await mounted();
    await parentAndChild(api, [], []);
    const [p0, c0] = [[...ref(api, 'piece:0').at], [...ref(api, 'piece:1').at]];
    const [dx, dy, dz] = [c0[0]! - p0[0]!, c0[1]! - p0[1]!, c0[2]! - p0[2]!];
    await select(api, 'piece:0');
    typed('Roll', '30');
    expect(field('Roll').value).toBe('30');
    // Rz(30) about the parent's place: the child's offset turned with it, and the child itself turned by it.
    const [c, s] = [Math.cos(30 * DEG), Math.sin(30 * DEG)];
    const at = ref(api, 'piece:1').at;
    expect(at[0]! - p0[0]!, 'the child carried: x').toBeCloseTo(dx * c - dy * s, 4);
    expect(at[1]! - p0[1]!, 'the child carried: y').toBeCloseTo(dx * s + dy * c, 4);
    expect(at[2]! - p0[2]!, 'the child carried: z').toBeCloseTo(dz, 4);
    expect(rows(api).poses, 'the parent and the child, each rolled 30').toEqual([[0, 0, 30, 1, 1, 1], [1, 0, 30, 1, 1, 1]]);
  }, 90_000);

  it('RED: a Yaw of 45.5 typed on a piece with no parent is kept as shown through a save and a reopen', async () => {
    // Expected green since `bb74b53236`: the typed Yaw's commit snaps the piece's world turn (`poseOn`): 46 kept.
    // Part B's second RED (new). Was RED on `1abfcb3cfc`: a typed Yaw is `setLocalAxis` (page.ts:6441, 3114), which
    // sets 45.5 degrees exactly and snaps nothing; the field shows 46 (`deg` rounds, 4533) and the record writes 46
    // (layout.ts `wholeDeg`), so the reopened piece's `rotation.y` differs from the scene's by half a degree (and a lobby
    // is sent 45.5: `createLobby(... layoutNow())`, page.ts:11671).
    const api = await mounted();
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    await select(api, 'piece:0');
    typed('Yaw', '45.5');
    expect(field('Yaw').value).toBe('46');
    await keptThroughReopen(api, ['piece:0']);
  }, 90_000);

  it('RED: a typed Scale X on a parent that would carry a piece under it past 4 is refused in words, the parent and the child as they were', async () => {
    // Expected green since `bb74b53236`: `commitTurnField` asks `followersFit` first and refuses in
    // `FOLLOWER_SIZE_REFUSAL`'s words (`forge/transformStubs`), nothing changed.
    // Part B's third RED (new). Was RED on `1abfcb3cfc`: the typed scale is applied (page.ts:5266-5272), nothing
    // checks what it would carry, and nothing is said: the parent goes to 3 (its child, not carried, stays at 2).
    const api = await mounted();
    await parentAndChild(api, [], [['Scale X', '2']]);
    const child0 = [...ref(api, 'piece:1').at];
    await select(api, 'piece:0');
    const revision = api.read().revision;
    typed('Scale X', '3');
    expect(statusLine(document).textContent).toBe('A piece under it would go past the sizes a layout keeps (0.1 to 4 an axis): scale it less, or take that piece out from under it');
    expect(api.read().revision, 'no edit').toBe(revision);
    expect(field('Scale X').value, 'the parent as it was').toBe('1');
    await select(api, 'piece:1');
    expect(field('Scale X').value, 'the child as it was').toBe('2');
    for (const [k, v] of child0.entries()) expect(ref(api, 'piece:1').at[k], `child axis ${k}`).toBeCloseTo(v, 6);
  }, 90_000);

  /**
   * Two parent and child pairs set up alike (`piece:0` over `piece:1`, `piece:2` over `piece:3`, the second pair 200
   * along Z), each child given `child`'s fields before the tree is made; then one parent's `label` scrubbed one pixel a
   * step to `to` and let go, the other's typed to `to`. The two children must end alike -- the six fields and the place
   * local to the parent, the turn (`rotation.y`), the place relative to the parent -- and both on the lattice (a save and
   * a reopen give them back).
   */
  async function scrubbedLikeTyped(label: string, to: number, child: readonly [string, string][]): Promise<void> {
    const api = await mounted();
    for (const at of [[0, 0, 0], [50, 0, 0], [0, 0, 200], [50, 0, 200]]) expect(await api.execute('piece.place', { asset: 'MP2:crate', at }, api.read().revision)).toMatchObject({ ok: true });
    for (const id of ['piece:1', 'piece:3']) { await select(api, id); for (const [l, v] of child) typed(l, v); }
    const saved = JSON.parse(JSON.stringify(api.read().layout)) as Record<string, unknown>;
    const tree = [['piece:1', 'piece:0'], ['piece:3', 'piece:2']];
    expect(await api.execute('layout.import', { layout: { ...saved, tree } }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(rows(api).tree).toEqual(tree));
    await select(api, 'piece:0');
    scrubbedThrough(label, Array.from({ length: to }, (_, i) => i + 1));   // a degree a pixel: 40 moves, previews from 3 px on
    expect(field(label).value).toBe(String(to));
    await select(api, 'piece:2');
    typed(label, String(to));
    expect(field(label).value).toBe(String(to));
    const childOf = async (id: string, parent: string): Promise<{ fields: string[]; yaw: number; rel: number[] }> => {
      await select(api, id);
      const [c, p] = [ref(api, id), ref(api, parent)];
      return { fields: values(), yaw: c.yaw, rel: c.at.map((v, k) => v - p.at[k]!) };
    };
    const scrubbedChild = await childOf('piece:1', 'piece:0');
    const typedChild = await childOf('piece:3', 'piece:2');
    expect(scrubbedChild.fields, `the six fields and the local place (${FIELDS.join(', ')})`).toEqual(typedChild.fields);
    expect(scrubbedChild.yaw, 'its turn (rotation.y)').toBeCloseTo(typedChild.yaw, 6);
    for (const k of [0, 1, 2]) expect(scrubbedChild.rel[k]!, `its place relative to its parent, axis ${k}`).toBeCloseTo(typedChild.rel[k]!, 4);
    await keptThroughReopen(api, ['piece:1', 'piece:3']);
  }

  it('RED: a parent\'s Pitch scrubbed to 40 in small steps and let go leaves its child (turned 45) exactly where one typed Pitch of 40 leaves it', async () => {
    // Expected RED at `edc5d19c0b` (part B's first form): `carryFollowers` snaps a carried piece at EVERY carry
    // (page.ts `poseOn` in `carryFollowers`), and the scrub's preview carries afresh at each step (`carrying` takes the
    // follower's place relative to the parent anew), so each degree of pitch is Rx(1) times the child's last SNAPPED turn,
    // snapped again: by hand (Python over three's `YXZ` order and `snappedTurn`'s rounding) the scrubbed child ends near
    // yaw 50, pitch 40, roll 40, the typed one at Rx(40)*Ry(45) snapped once, yaw 53, pitch 27, roll 31. The fields differ.
    // Expected green since `a4d40eb805` (the fold): a preview carries unsnapped (exact composition), the release snaps
    // once (`carrying`'s commit), as the typed edit does.
    await scrubbedLikeTyped('Pitch', 40, [['Yaw', '45']]);
  }, 90_000);

  it('CONTROL: a parent\'s Yaw scrubbed to 40 in small steps and let go leaves its child (turned 45) exactly where one typed Yaw of 40 leaves it', async () => {
    // Expected GREEN at `edc5d19c0b` and after the fold. The case the coordinator named, kept as a control: a parent
    // with no parent of its own, scrubbed in Yaw, turns by Ry(1 degree) about the world's vertical each step
    // (`setLocalAxis` keeps the pitch and the roll, and the `YXZ` yaw is the outermost turn), and Ry(1) times a
    // whole-degree `YXZ` turn is again whole (its yaw one more), so the per-step snap rounds nothing away. The drift
    // shows on a turn that is not about the vertical: the Pitch case above.
    await scrubbedLikeTyped('Yaw', 40, [['Yaw', '45']]);
  }, 90_000);

  /*
   * FC2 (ours), the hand-merge review's F1 and F3 (2026-11-13; the plan's Log): a marker -- a spawn, a respawn point, an
   * NPC, a hostage, a door... -- is SAVED by three's `rotation.y` (`page.ts` the layout's writer, `yaw: r.rotation.y`),
   * while the Inspector shows its yaw read in the `YXZ` order (`localPose`). The merge gave the typed Yaw, the scrub and
   * the tree's carry the contributor's `setLocalAxis` / `carryFollowers` for every kind: each writes the quaternion from
   * a decomposed matrix, and three then re-derives `rotation` in its default `XYZ` order, where a pure yaw past 90
   * degrees reads as (180, 180 - yaw, 180): `rotation.y` is no longer the yaw. Cited at the import's head `11c1777cd3`.
   */
  /** One marker selected, the Inspector showing it as `kind` (its head names its parent when it has one). */
  async function selectAs(api: ForgeAgentApi, id: string, kind: string): Promise<void> {
    expect(await api.execute('selection.set', { refs: [id] }, api.read().revision)).toMatchObject({ ok: true });
    const underParent = (rows(api).tree ?? []).some(([c]) => c === id);
    const head = inspectorPanel(document);
    await vi.waitFor(() => {
      expect(head.querySelector('.fx-inspect-kind')!.textContent).toBe(kind);
      expect(head.querySelector('.fx-inspect-name')!.textContent!.includes(' · in '), `${id} shown with its parent`).toBe(underParent);
    });
  }
  /** A marker's yaw as the record keeps it: its row's whole degrees (`creator-contracts` `SpawnRow`: team, x, y, z, yaw). */
  const recordYaw = (api: ForgeAgentApi, list: 'spawns' | 'respawns', i: number): unknown =>
    (api.read().layout as unknown as Record<string, unknown[][] | undefined>)[list]?.[i]?.[4];
  /** Three's `rotation.y` (radians) as a whole degree in 0..359, the record's form (`wholeDeg`). */
  const wholeDegOf = (rad: number): number => ((Math.round(rad / DEG) % 360) + 360) % 360;
  /** A piece at the origin and a spawn at x 50 (`spawnYaw` radians, the agent's `spawn.place`), the spawn put under the piece. */
  async function spawnUnderPiece(api: ForgeAgentApi, spawnYaw: number): Promise<void> {
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('spawn.place', { team: 'A', at: [50, 0, 0], yaw: spawnYaw }, api.read().revision)).toMatchObject({ ok: true });
    const saved = JSON.parse(JSON.stringify(api.read().layout)) as Record<string, unknown>;
    expect(await api.execute('layout.import', { layout: { ...saved, tree: [['spawn:0', 'piece:0']] } }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(rows(api).tree).toEqual([['spawn:0', 'piece:0']]));
  }

  it('RED: a spawn\'s Yaw typed 180 is 180 after a save and a reopen, and 120 is 120', async () => {
    // Expected RED today (`11c1777cd3`), at the first record line: "expected 0 to be 180". A typed Yaw is `setLocalAxis`
    // for any kind (page.ts:6510, 3158-3163): the YXZ yaw set to 180, the matrix decomposed into the spawn's quaternion
    // (3148), and three re-derives `rotation` in XYZ: Ry(180) is (180, 0, 180) there, so `rotation.y` is 0 and the
    // writer (page.ts:4265, `yaw: r.rotation.y`) saves 0 -- while the field shows 180 (`localPose`, YXZ). 120 is
    // (180, 60, 180): saved 60. Expected GREEN after the fix: a marker's pose is finished yaw-only (`rotation.set(0, yaw,
    // 0)`, its YXZ yaw), so `rotation.y` is the yaw again.
    const api = await mounted();
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    for (const v of ['180', '120']) {
      await selectAs(api, 'spawn:0', 'Spawn');
      typed('Yaw', v);
      expect(field('Yaw').value, `${v}: the field shows the yaw typed`).toBe(v);
      expect(recordYaw(api, 'spawns', 0), `${v}: the record`).toBe(Number(v));
      expect(wholeDegOf(ref(api, 'spawn:0').yaw), `${v}: its rotation.y`).toBe(Number(v));
      await reopened(api);
      await selectAs(api, 'spawn:0', 'Spawn');
      expect(field('Yaw').value, `${v}: reopened, it faces where it was shown`).toBe(v);
      expect(recordYaw(api, 'spawns', 0), `${v}: reopened, the record`).toBe(Number(v));
    }
  }, 90_000);

  it('RED: a respawn point\'s Yaw typed 180 is 180 after a save and a reopen', async () => {
    // Expected RED today, as the spawn's case: the respawn point is saved by `rotation.y` too (page.ts:4264), and the
    // typed Yaw is the same `setLocalAxis` (XYZ re-derived: 0 saved). Expected GREEN after the fix.
    const api = await mounted();
    expect(await api.execute('respawn.place', { team: 'A', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    await selectAs(api, 'respawn:0', 'Respawn point');
    typed('Yaw', '180');
    expect(field('Yaw').value).toBe('180');
    expect(recordYaw(api, 'respawns', 0), 'the record').toBe(180);
    await reopened(api);
    await selectAs(api, 'respawn:0', 'Respawn point');
    expect(field('Yaw').value, 'reopened').toBe('180');
  }, 90_000);

  it('RED: a spawn\'s Yaw scrubbed to 180 and let go is 180 after a save and a reopen', async () => {
    // Expected RED today: the scrub's preview is `setLocalAxis` (page.ts:6452) and its release the typed path's (6510),
    // both re-deriving `rotation.y` in XYZ: 0 saved. Expected GREEN after the fix (the yaw-only finish in both).
    const api = await mounted();
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    await selectAs(api, 'spawn:0', 'Spawn');
    scrubbed('Yaw', 180);                                            // a degree a pixel: 0 -> 180
    expect(field('Yaw').value).toBe('180');
    expect(recordYaw(api, 'spawns', 0), 'the record').toBe(180);
    await reopened(api);
    await selectAs(api, 'spawn:0', 'Spawn');
    expect(field('Yaw').value, 'reopened').toBe('180');
  }, 90_000);

  it('CONTROL: a spawn\'s Yaw typed 45 saves 45 and reopens at 45', async () => {
    // Expected GREEN today and after: Ry(45) read in XYZ is (0, 45, 0) -- below 90 degrees the two orders agree on a
    // pure yaw -- so `rotation.y` is the yaw and the writer saves 45.
    const api = await mounted();
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    await selectAs(api, 'spawn:0', 'Spawn');
    typed('Yaw', '45');
    expect(field('Yaw').value).toBe('45');
    expect(recordYaw(api, 'spawns', 0)).toBe(45);
    await reopened(api);
    await selectAs(api, 'spawn:0', 'Spawn');
    expect(field('Yaw').value).toBe('45');
  }, 90_000);

  it('CONTROL: a piece\'s Yaw typed 180 saves 180 and reopens as shown', async () => {
    // Expected GREEN today and after: a piece's record row is written from its matrix (layout.ts `poseOf`, the YXZ
    // yaw), never from `rotation.y`, and the typed commit puts it on the lattice (`poseOn`, page.ts:6514); the yaw-only
    // finish leaves a piece alone.
    const api = await mounted();
    expect(await api.execute('piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, api.read().revision)).toMatchObject({ ok: true });
    await select(api, 'piece:0');
    typed('Yaw', '180');
    expect(field('Yaw').value).toBe('180');
    expect(rows(api).pieces[0]![4], 'the record').toBe(180);
    await keptThroughReopen(api, ['piece:0']);
  }, 90_000);

  it('RED: a spawn under a piece that is then given Yaw 90 and Pitch 30 keeps a yaw-only turn, saved as it faces', async () => {
    // Expected RED today, at the record line: "expected 60 to be 90". The parent's typed Pitch (`commitTurnField`, page.ts
    // 5325) carries the spawn (`carryFollowers`, 3100): the spawn's world matrix P * rel = Ry(90) Rx(30) * T(50) is
    // decomposed into its quaternion -- a TILTED marker -- and `rotation.y`, re-derived in XYZ, is asin(cos 30) = 60:
    // saved 60, so the reopened spawn faces 30 degrees off. Expected GREEN after the fix: a carried marker is finished
    // yaw-only, at the YXZ yaw of its carried turn (90): saved 90, `rotation.y` 90; its Yaw field (local to the parent:
    // the YXZ yaw of Rx(-30), 0) the same before and after the reopen. (What the page lets a test read of a marker's turn
    // is its `rotation.y` and its Yaw field; a tilt that kept `rotation.y` at 90 would not show here -- the record line
    // and the reopen are what hold it.)
    const api = await mounted();
    await spawnUnderPiece(api, 0);
    await select(api, 'piece:0');
    typed('Yaw', '90');
    typed('Pitch', '30');
    expect(field('Pitch').value).toBe('30');
    await selectAs(api, 'spawn:0', 'Spawn');
    const shown = field('Yaw').value;
    expect(['Pitch', 'Roll'].map((l) => field(l).value), 'a marker shows no tilt fields').toEqual(['', '']);
    expect(recordYaw(api, 'spawns', 0), 'the record: it faces as its parent turned it, about the vertical').toBe(90);
    expect(ref(api, 'spawn:0').yaw, 'its rotation.y').toBeCloseTo(Math.PI / 2, 6);
    await reopened(api);
    await selectAs(api, 'spawn:0', 'Spawn');
    expect(field('Yaw').value, 'reopened, the Yaw shown').toBe(shown);
    expect(ref(api, 'spawn:0').yaw, 'reopened, its rotation.y').toBeCloseTo(Math.PI / 2, 6);
  }, 90_000);

  it('CONTROL: a spawn facing 45 under a piece that is only moved keeps its yaw', async () => {
    // Expected GREEN today and after: a typed X carries the spawn by a pure translation (`carryFollowers`), and Ry(45) read
    // in XYZ is still (0, 45, 0): saved 45, moved with the parent.
    const api = await mounted();
    await spawnUnderPiece(api, Math.PI / 4);
    const at0 = [...ref(api, 'spawn:0').at];
    await select(api, 'piece:0');
    typed('X', '20');
    expect(recordYaw(api, 'spawns', 0)).toBe(45);
    expect(ref(api, 'spawn:0').at[0]! - at0[0]!, 'moved with the parent').toBeCloseTo(20, 6);
    await selectAs(api, 'spawn:0', 'Spawn');
    expect(field('Yaw').value).toBe('45');
  }, 90_000);

  it('RED: a spawn facing 120 under a piece that is only moved keeps its yaw', async () => {
    // Expected RED today: "expected 60 to be 120". The move's carry decomposes the spawn's matrix (`carryFollowers`,
    // page.ts:3100) and three re-derives `rotation.y` in XYZ: Ry(120) is (180, 60, 180) there, saved 60 -- F3 needs no
    // tilt, a turn past 90 is enough. Expected GREEN after the fix (the carry's yaw-only finish).
    const api = await mounted();
    await spawnUnderPiece(api, (2 * Math.PI) / 3);
    expect(recordYaw(api, 'spawns', 0), 'placed').toBe(120);
    await select(api, 'piece:0');
    typed('X', '20');
    expect(recordYaw(api, 'spawns', 0), 'carried by the move').toBe(120);
    await selectAs(api, 'spawn:0', 'Spawn');
    expect(field('Yaw').value).toBe('120');
  }, 90_000);

  it('RED: a spawn under a piece given Scale X 2 is carried to its place at its own size, as a save and a reopen give it back', async () => {
    // FC2-6 (the lane's list: "a marker under a scaled parent still takes the scale in the scene; the record keeps none").
    // Expected RED today, at the first scale line: "expected [2, 1, 1] to deeply equal [1, 1, 1]". The parent's typed
    // Scale X carries the spawn (`carryFollowers`): its world matrix P * rel is decomposed whole, scale included, so the
    // spawn is drawn twice as wide, while the record keeps a marker's place and yaw alone (`isMarker`: no `s`), so a reopen
    // draws it at 1. Its place is carried as the record keeps it either way (50 along X under the parent becomes 100).
    // Expected GREEN after the fix: a carried marker is finished at unit scale (`yawOnly`). Read through the page's
    // development instrument `__forgeScaleOf` (the agent's refs carry no scale).
    const scaleOf = (id: string): number[] | null => (globalThis as unknown as { __forgeScaleOf: (r: string) => number[] | null }).__forgeScaleOf(id);
    const api = await mounted();
    await spawnUnderPiece(api, 0);
    await select(api, 'piece:0');
    typed('Scale X', '2');
    expect(scaleOf('piece:0'), 'CONTROL: the parent scaled').toEqual([2, 1, 1]);
    expect(scaleOf('spawn:0'), 'the spawn at its own size').toEqual([1, 1, 1]);
    expect(ref(api, 'spawn:0').at[0], 'carried to its place').toBeCloseTo(100, 6);
    expect(recordYaw(api, 'spawns', 0), 'its yaw').toBe(0);
    await reopened(api);
    expect(scaleOf('spawn:0'), 'reopened, its size').toEqual([1, 1, 1]);
    expect(ref(api, 'spawn:0').at[0], 'reopened, its place').toBeCloseTo(100, 6);
  }, 90_000);

  it('RED: the turn-step key (.) on a piece carries the spawn under it round with it, as the Yaw field and the gizmo do', async () => {
    // FC2-6 (the lane's list: "the turn-step keys turn a piece with no carry of what is under it"). Expected RED today at
    // "carried round": `turnSelected` (page.ts, the pad's and the keys' turn) turns the selection with no `carrying`, so
    // the spawn 50 along X under the crate stays at (50, 0, 0) facing 0 while its parent turns. Expected GREEN after the
    // fix: `.` is the turn right (`keys.ts` Period: `turnRight`, a step of -15 by default, `DEFAULT_TURN_STEP`): the crate
    // at -15 (saved 345), the spawn carried about it to (50 cos 15, 0, 50 sin 15) and facing as it turned (saved 345).
    const api = await mounted();
    await spawnUnderPiece(api, 0);
    await select(api, 'piece:0');
    (document.activeElement as HTMLElement | null)?.blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Period', key: '.', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(rows(api).pieces[0]![4], 'the crate turned').toBe(345));
    const at = ref(api, 'spawn:0').at;
    expect([at[0]!, at[2]!].map((v) => Math.round(v * 1000) / 1000), 'carried round').toEqual([48.296, 12.941]);
    expect(recordYaw(api, 'spawns', 0), 'facing as it was turned').toBe(345);
    await reopened(api);
    expect([ref(api, 'spawn:0').at[0]!, ref(api, 'spawn:0').at[2]!].map((v) => Math.round(v * 10) / 10), 'reopened, its place').toEqual([48.3, 12.9]);
  }, 90_000);

  /*
   * FC2-6 (ours; the lane's defects list, 2026-11-13): the three places `4727a498a1`'s author named as copying a marker's
   * turn the same broken way -- the selection's Duplicate, `swapRoot`, a switch's rebuild -- each `r.quaternion.copy(
   * s.quaternion)`, which has three re-derive the copy's `rotation` in `XYZ` (Ry(180) reads (180, 0, 180): `rotation.y`
   * 0; Ry(120) reads (180, 60, 180)), while the writer saves `yaw: r.rotation.y`. Cited at `9c4403bdb5`. NOTHING here was
   * run when it was written (the host short of memory): each expectation is by reading.
   */
  /** `n` spawns in the record (`creator-contracts` `SpawnRow`). */
  const spawnRows = (api: ForgeAgentApi): number => ((api.read().layout as unknown as { spawns?: unknown[] }).spawns ?? []).length;

  it('RED: a spawn at Yaw 180 duplicated (Edit > Duplicate) faces 180 like its source, after a save and a reopen', async () => {
    // Expected RED today, at the copy's record line: "expected 0 to be 180". `duplicate`'s `place` (page.ts:10662-10664)
    // builds the copy afresh (`spawnMarker`) and writes `r.quaternion.copy(s.quaternion)`: the source's (0, 1, 0, ~0)
    // re-derived in XYZ is (180, ~0, 180), so the writer (page.ts:4319, `yaw: r.rotation.y`) saves 0 -- while the copy's
    // Yaw field (`localPose`, YXZ) shows 180. Expected GREEN after the fix (the copy finished yaw-only, `yawOnly`).
    const api = await mounted();
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0], yaw: Math.PI }, api.read().revision)).toMatchObject({ ok: true });
    expect(recordYaw(api, 'spawns', 0), 'the source').toBe(180);
    await selectAs(api, 'spawn:0', 'Spawn');
    pressMenubar(document, 'Edit', 'Duplicate');                     // EDITOR-MAP T7: Edit > Duplicate (his menu; Ctrl+D)
    await vi.waitFor(() => expect(spawnRows(api)).toBe(2));
    expect(recordYaw(api, 'spawns', 0), 'the source, unchanged').toBe(180);
    expect(recordYaw(api, 'spawns', 1), 'the copy').toBe(180);
    expect(wholeDegOf(ref(api, 'spawn:1').yaw), 'the copy\'s rotation.y').toBe(180);
    await reopened(api);
    expect(recordYaw(api, 'spawns', 1), 'reopened, the copy').toBe(180);
    await selectAs(api, 'spawn:1', 'Spawn');
    expect(field('Yaw').value, 'reopened, the copy faces as its source').toBe('180');
  }, 90_000);

  it('CONTROL: a spawn at Yaw 45 duplicated (Edit > Duplicate) keeps 45', async () => {
    // Expected GREEN today and after: Ry(45) re-derived in XYZ is (0, 45, 0) -- below 90 degrees the two orders agree on a
    // pure yaw -- so the copied quaternion leaves `rotation.y` at 45 and the writer saves 45.
    const api = await mounted();
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0], yaw: Math.PI / 4 }, api.read().revision)).toMatchObject({ ok: true });
    await selectAs(api, 'spawn:0', 'Spawn');
    pressMenubar(document, 'Edit', 'Duplicate');
    await vi.waitFor(() => expect(spawnRows(api)).toBe(2));
    expect(recordYaw(api, 'spawns', 1), 'the copy').toBe(45);
    await reopened(api);
    expect(recordYaw(api, 'spawns', 1), 'reopened, the copy').toBe(45);
    await selectAs(api, 'spawn:1', 'Spawn');
    expect(field('Yaw').value).toBe('45');
  }, 90_000);

  it('RED: two spawns at Yaw 180 and 120 duplicated together (a group\'s Duplicate) give copies facing 180 and 120', async () => {
    // Expected RED today, at the first copy's record line: "expected 0 to be 180" (and the second's 60, not 120).
    // Two picked, Duplicate is the group's (`duplicateGroup`, page.ts:10626-10650): each copy built through `copyOf`
    // (`spawnMarker`) then `r.quaternion.copy(s.quaternion)` (10638) -- re-derived in XYZ as the single copy's is.
    // Expected GREEN after the fix (each copy finished yaw-only).
    const api = await mounted();
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 0], yaw: Math.PI }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('spawn.place', { team: 'A', at: [0, 0, 60], yaw: (2 * Math.PI) / 3 }, api.read().revision)).toMatchObject({ ok: true });
    expect(await api.execute('selection.set', { refs: ['spawn:0', 'spawn:1'] }, api.read().revision)).toMatchObject({ ok: true });
    pressMenubar(document, 'Edit', 'Duplicate');
    await vi.waitFor(() => expect(spawnRows(api)).toBe(4));
    expect([0, 1, 2, 3].map((i) => recordYaw(api, 'spawns', i)), 'the sources, then their copies').toEqual([180, 120, 180, 120]);
    await reopened(api);
    expect([0, 1, 2, 3].map((i) => recordYaw(api, 'spawns', i)), 'reopened').toEqual([180, 120, 180, 120]);
  }, 90_000);

  it('RED: a switch at Yaw 180 given another Look (its rebuild) still faces 180, after a save and a reopen', async () => {
    // Expected RED today, at the rebuilt switch's record line: "expected 0 to be 180". The Inspector's Look (page.ts:6268-
    // 6279) rebuilds the switch (`setOpt`'s rebuild, 6249-6265: `newSwitch`, then `r.quaternion.copy(s.quaternion)`,
    // 6254), so the new switch's `rotation` is re-derived in XYZ and the writer (page.ts:4341, `yaw: r.rotation.y`) saves
    // 0. 'Custom prop' is chosen because its rebuild reads only what the import's own `newSwitch` read (the lever's look),
    // nothing more of the synthetic disc. Expected GREEN after the fix (the rebuilt switch finished yaw-only).
    const api = await mounted();
    const switchYaw = (): unknown => (api.read().layout as unknown as { switches?: unknown[][] }).switches?.[0]?.[4];
    const saved = JSON.parse(JSON.stringify(api.read().layout)) as Record<string, unknown>;
    // `SwitchRow`: [gate, x, y, z, yaw (whole degrees), action, look, prompt, range, elevation, points, script].
    const switches = [[-1, 0, 0, 0, 180, '', '', null, null, null, null, null]];
    expect(await api.execute('layout.import', { layout: { ...saved, switches } }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(switchYaw()).toBe(180));
    await selectAs(api, 'switch:0', 'Switch');
    const look = (): HTMLSelectElement => inspectorPanel(document).querySelector<HTMLSelectElement>('select[aria-label="Look"]')!;
    const revision = api.read().revision;
    look().value = 'prop';
    look().dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(api.read().revision, 'the rebuild\'s edit made').toBeGreaterThan(revision));
    expect(switchYaw(), 'the rebuilt switch').toBe(180);
    await reopened(api);
    expect(switchYaw(), 'reopened').toBe(180);
  }, 90_000);

  /*
   * FC2 (ours; the batch review's B-3, 2026-11-13): FX-9's rule for a creator pack's piece -- a turn about the vertical at
   * its own size (`PACK_PIECE_POSE_REFUSAL`), which F2 (4727a498a1) holds for the typed Pitch, Roll and Scale, the two
   * resets and the Pitch/Roll scrub (`followersRefusal`) -- held for the Yaw too. A Yaw is local to the parent
   * (`setLocalAxis`): it turns about the parent's own Y, which under a tilted grandparent is no vertical, so it can carry a
   * pack piece off level -- and a tilted pack piece is neither drawn nor solid in the composed match (`transformStubs`).
   * The layout: a disc crate G (`piece:0`) pitched `gPitch`; a disc crate P (`piece:1`) unturned under G; the pack's crate
   * K (`piece:2`, its pack not here: the missing stand-in, its reference kept, `packPiece`) unturned at x 50 under
   * `kUnder`. Written, not run (the host rule); each case's expectation is by reading.
   */
  const PACK_CRATE: ContentRef = { kind: 'pack', pack: { id: 'crates', version: '1.0.0', hash: 'a'.repeat(64) }, assetId: 'crate' };
  const PACK_WORDS = 'Pack pieces turn about the vertical at their own size: tilt or scale a disc prop instead';
  async function packUnderTilt(api: ForgeAgentApi, gPitch: number, kUnder: 'piece:0' | 'piece:1'): Promise<void> {
    const m = (x: number, pitch = 0): number[] => new Matrix4().makeRotationX(pitch * DEG).setPosition(x, 0, 0).toArray();
    const layout: Layout = { ...emptyLayout({ kind: 'map', archive: 'MP2' } as Layout['base']), name: 'Tilted',
      pieces: [{ asset: 'MP2:crate', m: m(0, gPitch) }, { asset: 'MP2:crate', m: m(0) }, { asset: contentAssetKey(PACK_CRATE), m: m(50), content: PACK_CRATE }],
      tree: [['piece:1', 'piece:0'], ['piece:2', kUnder]] };
    expect(await api.execute('layout.import', { layout: recordOfLayout(layout, 'Tilted') }, api.read().revision)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(rows(api).tree ?? []).toHaveLength(2));
  }

  it('FC2 (ours), RED: a typed Yaw on a piece under a parent pitched 30 that would carry a pack piece off level is refused in the pack rule\'s words, nothing moved', async () => {
    // Expected RED before the fix, at the status line: the typed Yaw (page.ts, the X/Y/Z/Yaw `change` handler) runs
    // `setLocalAxis(s, 'yaw', 45)` inside `carrying(..., true)` with no `followersRefusal`: P's world turn becomes
    // Rx(30) Ry(45) Rx(-30), a turn about G's tilted Y, and K carried with it is tilted (its pose row written), nothing
    // said. Expected GREEN after: refused through the notifier in `PACK_PIECE_POSE_REFUSAL`'s words, the record as it was.
    const api = await mounted();
    await packUnderTilt(api, 30, 'piece:1');
    await select(api, 'piece:1');
    const before = JSON.stringify(rows(api));
    const revision = api.read().revision;
    typed('Yaw', '45');
    expect(statusLine(document).textContent).toBe(PACK_WORDS);
    expect(api.read().revision, 'no edit').toBe(revision);
    expect(JSON.stringify(rows(api)), 'P and K as they were').toBe(before);
    expect(Number(field('Yaw').value) % 360, 'P\'s Yaw as it was (0, or 360 from float noise)').toBe(0);
  }, 90_000);

  it('FC2 (ours), RED: a pack piece under a parent pitched 30 has its own Yaw typed: refused in the pack rule\'s words, nothing moved', async () => {
    // Expected RED before the fix: K's Yaw field is on (FX-9 turns off a pack piece's Pitch, Roll and Scale, not its Yaw),
    // and its local yaw under G turns it about G's tilted Y -- Rx(30) Ry(45) Rx(-30) -- so K is tilted and its pose row
    // written. Expected GREEN after: the selected pack piece's new world turn is tested too, and refused in the words.
    const api = await mounted();
    await packUnderTilt(api, 30, 'piece:0');
    await select(api, 'piece:2');
    const before = JSON.stringify(rows(api));
    const revision = api.read().revision;
    expect(field('Yaw').disabled, 'a pack piece keeps its Yaw field').toBe(false);
    typed('Yaw', '45');
    expect(statusLine(document).textContent).toBe(PACK_WORDS);
    expect(api.read().revision, 'no edit').toBe(revision);
    expect(JSON.stringify(rows(api)), 'K as it was').toBe(before);
    expect(Number(field('Yaw').value) % 360, 'K\'s Yaw as it was (0, or 360 from float noise)').toBe(0);
  }, 90_000);

  it('FC2 (ours), RED: a Yaw scrubbed on a piece under a parent pitched 30 stops where it would carry a pack piece off level; the release leaves it so', async () => {
    // Expected RED before the fix: the Yaw scrub's preview (`fx-scrub`, `setLocalAxis(s, 'yaw', value)`) asks nothing, so
    // P turns to 45 about G's tilted Y and K is carried tilted; the release commits 45 (the typed path), its pose rows
    // written. Expected GREEN after: the preview stops at the last yaw that kept K level (0, P's own: any other yaw here
    // tilts it), the field shows it, and the release commits that -- the record as it was.
    const api = await mounted();
    await packUnderTilt(api, 30, 'piece:1');
    await select(api, 'piece:1');
    const before = JSON.stringify(rows(api));
    scrubbed('Yaw', 45);                                             // a degree a pixel: 0 -> 45
    expect(Number(field('Yaw').value) % 360, 'the last level yaw (0, or 360 from float noise)').toBe(0);
    expect(JSON.stringify(rows(api)), 'P and K as they were').toBe(before);
    // G is pitched 30 on purpose (`packUnderTilt`), so its own pose row stands: nothing ELSE is tilted (the runner's
    // `fc2-rfix-c17ada32f`: this line read the whole list and so found G's row -- the test's slip, not the fix's).
    expect((rows(api).poses ?? []).filter(([piece]) => piece !== 0), 'nothing but G tilted').toEqual([]);
  }, 90_000);

  it('FC2 (ours), CONTROL: with nothing tilted above, a typed Yaw on the pack piece\'s parent is taken and carries it level', async () => {
    // Green before and after: G unturned, so P's Yaw turns about the vertical and K is carried round it level -- Ry(45)
    // about P's origin takes K from (50, 0, 0) to (50 cos 45, 0, -50 sin 45), turned 45 -- no pose row for anyone.
    const api = await mounted();
    await packUnderTilt(api, 0, 'piece:1');
    await select(api, 'piece:1');
    const revision = api.read().revision;
    typed('Yaw', '45');
    expect(statusLine(document).textContent).not.toBe(PACK_WORDS);
    expect(api.read().revision, 'a Yaw is an edit').not.toBe(revision);
    expect(rows(api).poses, 'neither tilted nor scaled').toBeUndefined();
    const k = ref(api, 'piece:2');
    expect(k.yaw, 'K turned with it (rotation.y)').toBeCloseTo(45 * DEG, 6);
    expect(k.at[0], 'K carried, x').toBeCloseTo(50 * Math.cos(45 * DEG), 1);
    expect(k.at[2], 'K carried, z').toBeCloseTo(-50 * Math.sin(45 * DEG), 1);
  }, 90_000);
});
