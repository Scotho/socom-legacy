import { describe, expect, it, vi } from 'vitest';
import { Matrix4 } from 'three';
import type { LoadedMap } from '../../src/loadMap';
import { packGround, groundGrid, groundPolygons } from '../../src/mover';
import { floorGround, layoutGround, prototypePolygons } from '../../src/forge/ground';
import { createCreatorCatalogue, type CreatorCatalogueState } from '../../src/creator/catalogue';
import { createForgeAgentApi, validateForgeAgentArguments, type ForgeAgentSnapshot, type ForgeAgentFacade } from '../../src/forge/agent/api';
import { createForgePageTarget } from '../../src/agent/forgeTarget';
import { authorizeRequest, OPERATIONS, type AgentRequest } from '@s2u/forge-agent-protocol';

// Synthetic reader-shaped geometry/hulls, no disc data. Product-track inspection only.
function source(count = 2): LoadedMap {
  const ground = floorGround(1000);
  const props = Array.from({ length: count }, (_, i) => ({ modelName: i ? `tree${i}` : 'crate',
    parts: [{ positions: new Float32Array([-2, 0, -1, 2, 4, 1, -2, 4, 1]), alternate: false }],
    matrices: Float32Array.from(new Matrix4().makeTranslation(100, 0, 0).elements), order: i,
    alternate: false, facade: 0, lod: null, paths: [`world/${i}`] }));
  const points = new Float32Array([98, 4, -1, 102, 4, -1, 102, 4, 1, 98, 4, 1]);
  const poly = { modelName: 'crate', path: 'world/0', ditype: 3, material: 0, region: 0, cameratype: 0, ptcount: 4, points };
  return { archive: 'MP2', path: 'RUN/MP2.ZDB', props, ground: packGround(ground.grid, [poly], [{ modelName: 'crate', path: 'world/0', first: 0, count: 1 }]) } as unknown as LoadedMap;
}
function rig(count = 2) {
  const map = source(count); let revision = 7;
  const state: CreatorCatalogueState = { revision: () => revision, maps: () => [map], grid: () => groundGrid(floorGround(1000)), obstacles: () => [] };
  return { map, state, catalogue: createCreatorCatalogue(state), edit: () => revision++ };
}
describe('FCW-04 loaded asset inspection adaptation', () => {
  function cube() {
    const map = source(1), floor = floorGround(1000), min = 98, max = 102;
    const faces = [
      [min, 0, -1, max, 0, -1, max, 0, 1, min, 0, 1],
      [min, 4, -1, max, 4, -1, max, 4, 1, min, 4, 1],
      [min, 0, -1, min, 4, -1, min, 4, 1, min, 0, 1],
      [max, 0, -1, max, 4, -1, max, 4, 1, max, 0, 1],
      [min, 0, -1, min, 4, -1, max, 4, -1, max, 0, -1],
      [min, 0, 1, min, 4, 1, max, 4, 1, max, 0, 1],
    ].map((points, i) => ({ modelName: 'crate', path: 'world/0', ditype: i === 1 ? 3 : 2, material: 0, region: 0, cameratype: 0, ptcount: 4, points: new Float32Array(points) }));
    map.ground = packGround(floor.grid, faces, [{ modelName: 'crate', path: 'world/0', first: 0, count: faces.length }]);
    return { map, floor, polys: prototypePolygons(map, 'crate')! };
  }
  it.each([[0, 4, 0], [4, 0, 0]])('accepts endpoint-only hull contact at %j without claiming traversal', (x, y, z) => {
    const c = cube(), grid = groundGrid(layoutGround(c.floor, [{ owner: 'prior', polys: c.polys, m: new Matrix4().elements }]));
    const catalogue = createCreatorCatalogue({ revision: () => 7, maps: () => [c.map], grid: () => grid, obstacles: () => [] });
    const ref = catalogue.queryCreatorAssets({}).items[0]!.ref;
    const report = catalogue.checkPlacement(ref, { at: [x, y, z] });
    expect(report.diagnostics.map(d => d.code)).not.toContain('OBSTRUCTED');
    expect(report.diagnostics.map(d => d.code)).not.toContain('UNSUPPORTED');
    expect(report.diagnostics.map(d => d.code)).toContain('TRAVERSABILITY_UNVERIFIED');
  });
  it.each([false, true])('still catches an interior crossing with an earlier endpoint=%s', (endpoint) => {
    const c = cube(), floor = groundPolygons(c.floor);
    const walls = (endpoint ? [-2, 0] : [0]).map(x => ({ modelName: 'wall', path: `wall/${x}`, ditype: 2, material: 0, region: 0, cameratype: 0, ptcount: 4,
      points: new Float32Array([x, -1, -10, x, 8, -10, x, 8, 10, x, -1, 10]) }));
    const ground = packGround(c.floor.grid, [...floor, ...walls], [...c.floor.owners, ...walls.map((w, i) => ({ modelName: w.modelName, path: w.path, first: floor.length + i, count: 1 }))]);
    const catalogue = createCreatorCatalogue({ revision: () => 7, maps: () => [c.map], grid: () => groundGrid(ground), obstacles: () => [] });
    const ref = catalogue.queryCreatorAssets({}).items[0]!.ref;
    expect(catalogue.checkPlacement(ref, { at: [0, 0, 0] }).diagnostics.map(d => d.code)).toContain('OBSTRUCTED');
    expect(catalogue.checkPlacement(ref, { at: [0, 0, 0] }, { positionEncoding: 'record-v2' }).diagnostics.map(d => d.code)).toContain('OBSTRUCTED');
  });
  it('limits explicit v2 support comparison to one half-step for a source floor', () => {
    const c = cube();
    let grid = groundGrid(c.floor);
    const catalogue = createCreatorCatalogue({ revision: () => 7, maps: () => [c.map], grid: () => grid, obstacles: () => [] });
    const ref = catalogue.queryCreatorAssets({}).items[0]!.ref;
    const floorAt = (y: number) => {
      const floor = floorGround(1000);
      for (let i = 1; i < floor.points.length; i += 3) floor.points[i] = y;
      grid = groundGrid(floor);
    };
    floorAt(0.034);
    expect(catalogue.checkPlacement(ref, { at: [0, 0, 0] }).diagnostics.map(d => d.code)).toContain('UNSUPPORTED');
    const checked = catalogue.checkPlacement(ref, { at: [0, 0, 0] }, { positionEncoding: 'record-v2' });
    expect(checked.diagnostics.map(d => d.code)).not.toContain('UNSUPPORTED');
    expect(checked.supportComparison).toMatchObject({ evidence: 'record-v2-serialization-adaptation', sourceTolerance: 0.05, serializedSupportTolerance: 0.1 });
    floorAt(-0.0501);
    expect(catalogue.checkPlacement(ref, { at: [0, 0, 0] }, { positionEncoding: 'record-v2' }).diagnostics.map(d => d.code)).toContain('UNSUPPORTED');
    expect(() => catalogue.checkPlacement(ref, { at: [0, 0.034, 0] }, { positionEncoding: 'record-v2' })).toThrow('INVALID_RECORD_POSITION');
  });
  it('uses two half-steps only for explicitly identified serialized support owners', () => {
    const c = cube();
    const floor = floorGround(1000);
    for (let i = 1; i < floor.points.length; i += 3) floor.points[i] = 0.066;
    floor.owners[0]!.path = 'prior-record';
    let grid = groundGrid(floor);
    const catalogue = createCreatorCatalogue({ revision: () => 7, maps: () => [c.map], grid: () => grid, obstacles: () => [] });
    const ref = catalogue.queryCreatorAssets({}).items[0]!.ref;
    expect(catalogue.checkPlacement(ref, { at: [0, 0, 0] }, { positionEncoding: 'record-v2' }).diagnostics.map(d => d.code)).toContain('UNSUPPORTED');
    const options = { positionEncoding: 'record-v2' as const, supportOwners: ['prior-record'] };
    expect(catalogue.checkPlacement(ref, { at: [0, 0, 0] }, options).diagnostics.map(d => d.code)).not.toContain('UNSUPPORTED');
    for (let i = 1; i < floor.points.length; i += 3) floor.points[i] = -0.1001;
    grid = groundGrid(floor);
    expect(catalogue.checkPlacement(ref, { at: [0, 0, 0] }, options).diagnostics.map(d => d.code)).toContain('UNSUPPORTED');
    expect(catalogue.checkPlacement(ref, { at: [600, 0, 0] }, options).diagnostics.map(d => d.code)).toContain('UNSUPPORTED');
    const noGround = createCreatorCatalogue({ revision: () => 7, maps: () => [c.map], grid: () => null, obstacles: () => [] });
    const noGroundRef = noGround.queryCreatorAssets({}).items[0]!.ref;
    expect(noGround.checkPlacement(noGroundRef, { at: [0, 0, 0] }, options).diagnostics.map(d => d.code)).toContain('GROUND_UNAVAILABLE');
  });
  it('reads prototype-local visual bounds and hull roles, never solidity from tree names', () => {
    const r = rig(), page = r.catalogue.queryCreatorAssets({});
    expect(page.items[0]).toMatchObject({ asset: 'MP2:crate', source: { archive: 'MP2', path: 'RUN/MP2.ZDB' },
      bounds: { min: [-2, 0, -1], max: [2, 4, 1] }, collision: { state: 'available', polygons: 1, bounds: { min: [-2, 4, -1], max: [2, 4, 1] } }, roles: ['visual', 'ground-surface'] });
    expect(page.items[1]).toMatchObject({ collision: { state: 'none', polygons: 0 }, roles: ['visual'] });
    expect(r.catalogue.queryCreatorAssets({ role: 'wall-surface' }).items).toEqual([]);
    expect(r.catalogue.queryCreatorAssets({ query: 'absent-tree' }).items).toEqual([]);
  });
  it('reports unloaded archives and missing/invalid geometry and collision explicitly', () => {
    const r = rig();
    expect(r.catalogue.queryCreatorAssets({ archive: 'MP99' }).diagnostics).toContain('ARCHIVE_NOT_LOADED');
    delete r.map.ground;
    expect(r.catalogue.queryCreatorAssets({}).items[0]!.collision.state).toBe('unavailable');
    r.map.props[0]!.parts[0]!.positions[0] = NaN;
    expect(r.catalogue.queryCreatorAssets({}).items[0]).toMatchObject({ bounds: null, diagnostics: ['INVALID_GEOMETRY'] });
  });
  it('keeps compound prototypes whole and excludes world facades', () => {
    const r = rig(); r.map.props[0]!.parts.push(r.map.props[0]!.parts[0]!);
    r.map.props.push({ ...r.map.props[0]!, modelName: 'worldmodel', facade: 1 });
    expect(r.catalogue.queryCreatorAssets({}).items[0]).toMatchObject({ geometry: { parts: 2, separability: 'whole-prototype-only' } });
    expect(r.catalogue.queryCreatorAssets({ query: 'worldmodel' }).items).toEqual([]);
  });
  it('bounds pages, binds cursors to revision AND filters, and requires previously queried refs', () => {
    const r = rig(120), page = r.catalogue.queryCreatorAssets({ limit: 1 });
    expect(page.items).toHaveLength(1); expect(page.nextCursor).toBeTruthy();
    expect(r.catalogue.queryCreatorAssets({ limit: 1 }, page.nextCursor!).items[0]!.ref).not.toBe(page.items[0]!.ref);
    expect(() => r.catalogue.queryCreatorAssets({ query: 'tree', limit: 1 }, page.nextCursor!)).toThrow('INVALID_CURSOR');
    expect(() => r.catalogue.checkPlacement('asset:7:119', { at: [0, 0, 0], yaw: 0 })).toThrow('INVALID_REFERENCE');
    r.edit();
    expect(() => r.catalogue.queryCreatorAssets({ limit: 1 }, page.nextCursor!)).toThrow('STALE_REVISION');
    expect(() => r.catalogue.checkPlacement(page.items[0]!.ref, { at: [0, 0, 0], yaw: 0 })).toThrow('STALE_REVISION');
  });
  it('refuses invalid inputs, absent refs and visual-only placement solidity claims', () => {
    const r = rig(), rows = r.catalogue.queryCreatorAssets({}).items;
    expect(() => r.catalogue.queryCreatorAssets({ limit: 101 })).toThrow('INVALID_ARGUMENT');
    expect(() => r.catalogue.checkPlacement('absent', { at: [0, 0, 0], yaw: 0 })).toThrow('INVALID_REFERENCE');
    expect(() => r.catalogue.checkPlacement(rows[0]!.ref, { at: [Infinity, 0, 0], yaw: 0 })).toThrow('INVALID_ARGUMENT');
    expect(r.catalogue.checkPlacement(rows[1]!.ref, { at: [0, 0, 0], yaw: 0 })).toMatchObject({ traversability: 'unverified', diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'NO_COLLISION' })]) });
  });
  it('transforms actual geometry for yaw and translation, and detects unsupported proposals with the floor probe', () => {
    const r = rig(), ref = r.catalogue.queryCreatorAssets({ query: 'crate' }).items[0]!.ref;
    const check = r.catalogue.checkPlacement(ref, { at: [10, 20, 30], yaw: Math.PI / 2 });
    expect(check.bounds.min[0]).toBeCloseTo(9); expect(check.bounds.max[2]).toBeCloseTo(32);
    expect(check.diagnostics).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED', evidence: 'hull-ground-probe' }));
    expect(check.traversability).toBe('unverified');
  });
  it('labels conservative overlaps bounds-only, while actual wall intersections cite hull evidence', () => {
    const r = rig(), ref = r.catalogue.queryCreatorAssets({}).items[0]!.ref;
    const floor = floorGround(1000), wall = { modelName: 'wall', path: 'wall', ditype: 2, material: 0, region: 0, cameratype: 0, ptcount: 4,
      points: new Float32Array([0, -10, -10, 0, 10, -10, 0, 10, 10, 0, -10, 10]) };
    r.state.grid = () => groundGrid(packGround(floor.grid, [wall], [{ modelName: 'wall', path: 'wall', first: 0, count: 1 }]));
    r.state.obstacles = () => [{ ref: 'piece:0', bounds: { min: [-3, -1, -3], max: [3, 5, 3] } }];
    const report = r.catalogue.checkPlacement(ref, { at: [0, 0, 0], yaw: 0 });
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'BOUNDS_OVERLAP', evidence: 'bounds-only' }));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'OBSTRUCTED', evidence: 'hull-segment-probe' }));
    expect(report.traversability).toBe('unverified');
  });
  it('caps wire results and diagnostics, and never loses the traversability warning', () => {
    const r = rig(120), page = r.catalogue.queryCreatorAssets({ limit: 100 });
    expect(page.items.length).toBeLessThanOrEqual(100);
    expect(new TextEncoder().encode(JSON.stringify(page)).length).toBeLessThan(48_000);
    r.state.obstacles = () => Array.from({ length: 100 }, (_, i) => ({ ref: `piece:${i}`, bounds: { min: [-3, -1, -3], max: [3, 5, 3] } }));
    const report = r.catalogue.checkPlacement(page.items[0]!.ref, { at: [0, 0, 0] });
    expect(report.diagnostics.length).toBeLessThanOrEqual(32);
    expect(report.omittedDiagnostics).toBeGreaterThan(0);
    expect(report.diagnostics.at(-1)!.code).toBe('TRAVERSABILITY_UNVERIFIED');
  });
  it('refuses invalid collision and refs whose source archive was replaced', () => {
    const r = rig();
    r.map.ground!.points[0] = NaN;
    const bad = r.catalogue.queryCreatorAssets({ query: 'crate' }).items[0]!;
    expect(bad.collision.state).toBe('invalid');
    expect(() => r.catalogue.checkPlacement(bad.ref, { at: [0, 0, 0] })).toThrow('INVALID_COLLISION');
    const other = rig(), ref = other.catalogue.queryCreatorAssets({}).items[0]!.ref;
    other.state.maps = () => [source()];
    expect(() => other.catalogue.checkPlacement(ref, { at: [0, 0, 0] })).toThrow('STALE_REVISION');
  });
});

describe('FCW-04 agent boundary', () => {
  const request = (operation: string, args: unknown = {}): AgentRequest => ({ version: 1, requestId: 'one', sessionId: 'placeholder', targetId: 'target', epoch: 'epoch', expectedRevision: 7, operation, args });
  it('advertises independent inspect/diagnose permissions on editor only', () => {
    expect(OPERATIONS['forge.assets']).toMatchObject({ permission: 'inspect', mutation: false, surfaces: ['forge-editor'] });
    expect(OPERATIONS['forge.placement']).toMatchObject({ permission: 'diagnose', mutation: false, surfaces: ['forge-editor'] });
    expect(authorizeRequest(request('forge.placement'), { sessionId: 'placeholder', targetId: 'target', epoch: 'epoch', surface: 'forge-editor', permissions: ['inspect'] })).toBe('PERMISSION_DENIED');
  });
  it('validates bounded schema, including unknown fields and nonfinite values', () => {
    expect(() => validateForgeAgentArguments('assets.query', { query: 'tree', limit: 5 })).not.toThrow();
    for (const args of [{ limit: 101 }, { query: 'a'.repeat(161) }, { arbitrary: true }]) expect(() => validateForgeAgentArguments('assets.query', args)).toThrow();
    expect(() => validateForgeAgentArguments('placement.check', { ref: 'asset:7:0', at: [0, NaN, 0] })).toThrow();
  });
  it('delegates read-only wrappers and refuses Play/live-network surfaces', async () => {
    const snapshot = { ready: true, mode: 'forge-editor', revision: 7, layout: null, selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false } as ForgeAgentSnapshot;
    const prepare = vi.fn<ForgeAgentFacade['prepare']>(async () => ({ commit: () => ({ bounded: true }), dispose() {} }));
    const api = createForgeAgentApi({ snapshot: () => snapshot, prepare });
    const target = createForgePageTarget({ api, build: 'test' }), signal = new AbortController().signal;
    expect(await target.dispatch(request('forge.assets', { query: 'tree' }), signal)).toMatchObject({ outcome: 'ok', data: { bounded: true } });
    expect(prepare.mock.calls[0]![0]).toBe('assets.query');
    expect(await target.dispatch(request('forge.placement', { ref: 'asset:7:0', at: [0, 0, 0] }), signal)).toMatchObject({ outcome: 'ok' });
    expect(await target.dispatch({ ...request('forge.assets'), expectedRevision: 6 }, signal)).toMatchObject({ outcome: 'refused', code: 'STALE_REVISION' });
    for (const mode of ['forge-play', 'blocked'] as const) {
      snapshot.mode = mode;
      expect(await target.dispatch(request('forge.assets'), signal)).toMatchObject({ outcome: 'refused', code: 'SURFACE_DENIED' });
      expect((await api.execute('placement.check', { ref: 'asset:7:0', at: [0, 0, 0] })).ok).toBe(false);
    }
  });
});

describe('FCW-04 independent catalogue epoch (product adaptation)', () => {
  // Synthetic checks against existing payload fields; page wiring and rendered acceptance are separate.
  it('retires observations when the host removes and re-publishes a map through the same array', () => {
    const r = rig(), published = [r.map];
    r.state.maps = () => published;
    const before = r.catalogue.queryCreatorAssets({ limit: 1 });
    published.pop();
    // Placement must notice publication changes even before another asset query.
    expect(() => r.catalogue.checkPlacement(before.items[0]!.ref, { at: [0, 0, 0] })).toThrow('STALE_REVISION');
    const empty = r.catalogue.queryCreatorAssets({});
    expect(empty.total).toBe(0);
    expect(empty.revision).toBeGreaterThan(before.revision);
    published.push(r.map);
    const restored = r.catalogue.queryCreatorAssets({ limit: 1 });
    expect(restored.revision).toBeGreaterThan(empty.revision);
    expect(restored.items[0]!.ref).not.toBe(before.items[0]!.ref);
    expect(() => r.catalogue.queryCreatorAssets({ limit: 1 }, before.nextCursor!)).toThrow('STALE_REVISION');
  });

  it('does not reuse an observation epoch when a host restores an earlier layout revision', () => {
    const r = rig(); let layoutRevision = 7;
    r.state.revision = () => layoutRevision;
    const before = r.catalogue.queryCreatorAssets({ limit: 1 });
    layoutRevision = 8;
    const changed = r.catalogue.queryCreatorAssets({ limit: 1 });
    layoutRevision = 7;
    const restored = r.catalogue.queryCreatorAssets({ limit: 1 });
    expect(restored.revision).toBeGreaterThan(changed.revision);
    expect(restored.items[0]!.ref).not.toBe(before.items[0]!.ref);
    expect(() => r.catalogue.checkPlacement(before.items[0]!.ref, { at: [0, 0, 0] })).toThrow('STALE_REVISION');
    expect(() => r.catalogue.queryCreatorAssets({ limit: 1 }, before.nextCursor!)).toThrow('STALE_REVISION');
  });

  it('retires observations when another archive is published without a layout edit', () => {
    const r = rig(), published = [r.map];
    r.state.maps = () => [...published];
    const before = r.catalogue.queryCreatorAssets({ limit: 1 });
    const oldRef = before.items[0]!.ref;
    expect(before.nextCursor).toBeTruthy();
    expect(r.catalogue.checkPlacement(oldRef, { at: [0, 0, 0] }).asset).toBe('MP2:crate');

    const added = source(1); added.archive = 'MP3'; added.path = 'RUN/MP3.ZDB';
    published.push(added); // The layout revision callback is unchanged: publishing an archive is not an edit.
    const after = r.catalogue.queryCreatorAssets({ limit: 1 });

    expect(after.total).toBe(3);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(() => r.catalogue.queryCreatorAssets({ limit: 1 }, before.nextCursor!)).toThrow('STALE_REVISION');
    expect(() => r.catalogue.checkPlacement(oldRef, { at: [0, 0, 0] })).toThrow('STALE_REVISION');
    const addedPage = r.catalogue.queryCreatorAssets({ archive: 'MP3' });
    expect(addedPage.items.map(item => item.asset)).toEqual(['MP3:crate']);
    expect(addedPage.revision).toBe(after.revision);
    expect(r.catalogue.checkPlacement(after.items[0]!.ref, { at: [0, 0, 0] }).revision).toBe(after.revision);
  });

  it('keeps refs and pagination valid across repeated reads of unchanged published archives', () => {
    const r = rig(3), published = [r.map];
    // The host can return a fresh container on each read without publishing different decoded map objects.
    r.state.maps = () => [...published];
    const before = r.catalogue.queryCreatorAssets({ limit: 1 });
    const firstCheck = r.catalogue.checkPlacement(before.items[0]!.ref, { at: [0, 0, 0] });

    expect(r.catalogue.queryCreatorAssets({ limit: 1 })).toEqual(before);
    expect(r.catalogue.checkPlacement(before.items[0]!.ref, { at: [0, 0, 0] })).toEqual(firstCheck);
    const next = r.catalogue.queryCreatorAssets({ limit: 1 }, before.nextCursor!);
    expect(next.items.map(item => item.asset)).toEqual(['MP2:tree1']);
    expect(next.revision).toBe(before.revision);
    expect(r.catalogue.queryCreatorAssets({ limit: 1 })).toEqual(before);
    expect(r.catalogue.checkPlacement(before.items[0]!.ref, { at: [0, 0, 0] }).revision).toBe(before.revision);
  });

  it('never aliases an old ref after a fresh query of a replacement with the same archive and asset IDs', () => {
    const r = rig(), published = [r.map];
    r.state.maps = () => [...published];
    const before = r.catalogue.queryCreatorAssets({ limit: 1 });
    const oldRef = before.items[0]!.ref;
    const replacement = source();
    replacement.props[0]!.parts[0]!.positions[0] = -8;
    published[0] = replacement; // Pack reload: same archive/path/palette names, different decoded bytes/object.

    const after = r.catalogue.queryCreatorAssets({ limit: 1 });

    expect(after.items[0]).toMatchObject({ asset: 'MP2:crate', bounds: { min: [-8, 0, -1], max: [2, 4, 1] } });
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.items[0]!.ref).not.toBe(oldRef);
    expect(() => r.catalogue.queryCreatorAssets({ limit: 1 }, before.nextCursor!)).toThrow('STALE_REVISION');
    expect(() => r.catalogue.checkPlacement(oldRef, { at: [0, 0, 0] })).toThrow('STALE_REVISION');
    expect(r.catalogue.checkPlacement(after.items[0]!.ref, { at: [0, 0, 0] })).toMatchObject({
      revision: after.revision, bounds: { min: [-8, 0, -1], max: [2, 4, 1] },
    });
  });

  it('retires placement observations after a committed piece changes the layout collision context', () => {
    const r = rig(), before = r.catalogue.queryCreatorAssets({ limit: 1 });
    expect(r.catalogue.checkPlacement(before.items[0]!.ref, { at: [0, 0, 0] }).diagnostics
      .some(diagnostic => diagnostic.code === 'BOUNDS_OVERLAP')).toBe(false);
    r.state.obstacles = () => [{ ref: 'piece:committed', bounds: { min: [-3, -1, -3], max: [3, 5, 3] } }];
    r.edit();

    expect(() => r.catalogue.checkPlacement(before.items[0]!.ref, { at: [0, 0, 0] })).toThrow('STALE_REVISION');
    expect(() => r.catalogue.queryCreatorAssets({ limit: 1 }, before.nextCursor!)).toThrow('STALE_REVISION');
    const after = r.catalogue.queryCreatorAssets({ limit: 1 });
    expect(after.revision).toBeGreaterThan(before.revision);
    const report = r.catalogue.checkPlacement(after.items[0]!.ref, { at: [0, 0, 0] });
    expect(report.revision).toBe(after.revision);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'BOUNDS_OVERLAP', evidence: 'bounds-only', ref: 'piece:committed',
    }));
  });
});
