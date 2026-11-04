import { describe, expect, it, vi } from 'vitest';
import { Matrix4 } from 'three';
import { floorGround, layoutGround, prototypePolygons, type PieceHull } from '../src/forge/ground';
import { checkRecord, layoutOfRecord, recordOfLayout, readSaved } from '../src/forge/record';
import { createForgeAgentApi, type ForgeAgentFacade } from '../src/forge/agent/api';
import { History } from '../src/forge/history';
import { checkMap } from '../src/forge/validate';
import { packGround, groundPolygons, groundGrid } from '../src/mover';
import { createCreatorCatalogue } from '../src/creator/catalogue';
import type { LoadedMap } from '../src/loadMap';
import { STARTERS, previewStarter, applyStarter, type StarterContext, type StarterAsset } from '../src/creator/examples';
import { checkStarterLayout } from '../src/creator/examples/validation';

function asset(model = 'crate'): StarterAsset {
  return { ref: `asset:${model}`, revision: 7, asset: `M99:${model}`, model, source: { archive: 'M99', path: 'local' },
    bounds: { min: [-10, -2, -10], max: [10, 18, 10] }, geometry: { parts: 1, separability: 'whole-prototype-only' },
    collision: { state: 'available', polygons: 6, ground: 1, walls: 4, bounds: { min: [-8, -3, -8], max: [8, 13, 8] } },
    roles: ['visual', 'ground-surface', 'wall-surface'], diagnostics: [] };
}
function context(): StarterContext {
  const c: StarterContext = { revision: 7, archives: [{ stem: 'M99', label: 'Supplied campaign room', campaign: true }],
    map: { archive: 'M99', name: 'Supplied room', ground: floorGround(4000), slots: [
      { side: 0, index: 0, position: [-200, 0, 0], step: 0, facing: [0, -1], onFloor: true },
      { side: 1, index: 0, position: [200, 0, 0], step: 4, facing: [0, 1], onFloor: true },
    ], types: { seal: [{}], terrorist: [null, {}] }, props: [] } as unknown as LoadedMap,
    assets: [asset()], checkPlacement: () => ({ revision: 7, diagnostics: [] }) };
  // The final validator uses real reader-shaped synthetic source hulls, never a no-op actor validator.
  const map = c.map!, floor = map.ground!, polys = groundPolygons(floor), owners = [...floor.owners];
  for (const [name, x] of [['crate', 300], ['pine', 500]] as const) {
    const path = `world/${name}`, lx = x - 8, hx = x + 8, ly = 0, hy = 16, lz = -8, hz = 8;
    const faces = [
      [lx, ly, lz, hx, ly, lz, hx, ly, hz, lx, ly, hz], [lx, hy, lz, hx, hy, lz, hx, hy, hz, lx, hy, hz],
      [lx, ly, lz, lx, hy, lz, lx, hy, hz, lx, ly, hz], [hx, ly, lz, hx, hy, lz, hx, hy, hz, hx, ly, hz],
      [lx, ly, lz, lx, hy, lz, hx, hy, lz, hx, ly, lz], [lx, ly, hz, lx, hy, hz, hx, hy, hz, hx, ly, hz],
    ].map((points, i) => ({ modelName: name, path, ditype: i === 1 ? 3 : 2, material: 0, region: 0, cameratype: 0, ptcount: 4, points: new Float32Array(points) }));
    owners.push({ modelName: name, path, first: polys.length, count: faces.length }); polys.push(...faces);
    map.props.push({ modelName: name, parts: [], matrices: Float32Array.from(new Matrix4().makeTranslation(x, 3, 0).elements),
      order: 0, alternate: false, facade: 0, lod: null, paths: [path] });
  }
  map.ground = packGround(floor.grid, polys, owners);
  c.checkLayout = record => ({ revision: c.revision, diagnostics: checkStarterLayout(record, c.map, c.map ? [c.map] : []) });
  return c;
}

describe('authored creator starters (browser adaptation)', () => {
  it.each([['arena', 0.034, 16], ['crate-stack', 0, 16.034]] as const)('accepts %s at existing v2 serialization precision using actual source hulls', async (id, floorY, height) => {
    const c = context(), map = c.map!, floor = floorGround(4000);
    for (let i = 1; i < floor.points.length; i += 3) floor.points[i] = floorY;
    const polys = groundPolygons(floor), path = 'world/crate', x = 300, lx = x - 8, hx = x + 8, ly = floorY, hy = floorY + height;
    const faces = [
      [lx, ly, -8, hx, ly, -8, hx, ly, 8, lx, ly, 8], [lx, hy, -8, hx, hy, -8, hx, hy, 8, lx, hy, 8],
      [lx, ly, -8, lx, hy, -8, lx, hy, 8, lx, ly, 8], [hx, ly, -8, hx, hy, -8, hx, hy, 8, hx, ly, 8],
      [lx, ly, -8, lx, hy, -8, hx, hy, -8, hx, ly, -8], [lx, ly, 8, lx, hy, 8, hx, hy, 8, hx, ly, 8],
    ].map((points, i) => ({ modelName: 'crate', path, ditype: i === 1 ? 3 : 2, material: 0, region: 0, cameratype: 0, ptcount: 4, points: new Float32Array(points) }));
    map.ground = packGround(floor.grid, [...polys, ...faces], [...floor.owners, { modelName: 'crate', path, first: polys.length, count: faces.length }]);
    map.props = [{ modelName: 'crate', parts: [{ positions: new Float32Array([-8, 0, -8, 8, height, 8, -8, height, 8]), alternate: false }] as LoadedMap['props'][number]['parts'],
      matrices: Float32Array.from(new Matrix4().makeTranslation(x, floorY, 0).elements), paths: [path], order: 0, alternate: false, facade: 0, lod: null }];
    for (const slot of map.slots) slot.position[1] = floorY;
    let grid = groundGrid(map.ground);
    const catalogue = createCreatorCatalogue({ revision: () => c.revision, maps: () => [map], grid: () => grid, obstacles: () => [] });
    c.assets = catalogue.queryCreatorAssets({}).items;
    c.checkPlacement = (ref, transform, prior) => {
      const hulls: PieceHull[] = prior.map((row, i) => ({ owner: `starter:${i}`, polys: prototypePolygons(map, 'crate')!,
        m: new Matrix4().makeRotationY(row[4] * Math.PI / 180).setPosition(row[1], row[2], row[3]).elements }));
      grid = groundGrid(layoutGround(map.ground!, hulls));
      const report = catalogue.checkPlacement(ref, transform, { positionEncoding: 'record-v2', supportOwners: hulls.map(h => h.owner) });
      return { revision: report.revision, diagnostics: report.diagnostics.filter(d => d.code !== 'TRAVERSABILITY_UNVERIFIED') };
    };
    const preview = await previewStarter(id, c);
    expect(preview.diagnostics).toEqual([]); expect(preview.record).not.toBeNull();
    expect(checkRecord(preview.record)).toBeNull();
    expect(checkStarterLayout(preview.record!, map, [map])).toEqual([]);
    expect(preview.traversability).toBe('unverified');
  });
  it.each(STARTERS.map((s) => s.id))('%s produces deterministic, valid saved recipes', async (id) => {
    const c = context();
    if (id === 'frostfire-trees') {
      c.archives[0]!.label = 'Frostfire'; c.archives[0]!.campaign = false;
      c.assets.push(asset('pine')); c.treeRefs = ['asset:pine'];
    }
    const a = await previewStarter(id, c), b = await previewStarter(id, c);
    expect(a.diagnostics).toEqual([]); expect(a.record).not.toBeNull();
    expect(a).toEqual(b); expect(checkRecord(a.record)).toBeNull();
    expect(readSaved(JSON.stringify(a.record), 'Example')).toEqual(a.record);
    expect(recordOfLayout(layoutOfRecord(a.record!), a.record!.name)).toEqual(a.record);
    expect(a.requirements.length).toBeGreaterThan(0);
  });
  it('sizes stair stacks from collision bounds, not the rendered box', async () => {
    const p = await previewStarter('crate-stack', context());
    expect(p.record!.pieces).toHaveLength(6);
    expect(p.record!.pieces.map((r) => r[2])).toEqual([3, 3, 19, 3, 19, 35]);
    expect(p.traversability).toBe('unverified');
  });
  it('checks NPC seats on completed source hulls, with clear player starts unchanged', () => {
    const c = context(), record = { v: 2 as const, base: 'M99', name: 'NPC clearance', assets: ['M99:crate'],
      pieces: [[0, 0, 3, 0, 0] as [number, number, number, number, number]], spawns: [
        ['A', -200, 0, 0, 0] as ['A', number, number, number, number], ['B', 200, 0, 0, 180] as ['B', number, number, number, number],
      ] };
    expect(checkStarterLayout(record, c.map, [c.map!])).toEqual([]);
    expect(checkStarterLayout({ ...record, npcs: [['terrorist', 1, -7, 0, 0, 0]] }, c.map, [c.map!])).toContainEqual(expect.objectContaining({ code: 'ACTOR_OBSTRUCTED', message: expect.stringContaining('inside geometry') }));
  });
  it('refuses final validation that completes after the human revision changed', async () => {
    const c = context(), actual = c.checkLayout!;
    let release!: () => void, entered = false;
    const wait = new Promise<void>(resolve => { release = resolve; });
    c.checkLayout = async record => { entered = true; await wait; return actual(record); };
    const pending = previewStarter('crate-stack', c);
    await vi.waitFor(() => expect(entered).toBe(true));
    c.revision++; release();
    const preview = await pending;
    expect(preview.record).toBeNull(); expect(preview.diagnostics.map(d => d.code)).toContain('STALE_CATALOGUE');
  });
  it('authors safe starts from the loaded floor when a campaign room has no multiplayer spawn slots', async () => {
    const c = context(); c.map!.slots = [];
    const p = await previewStarter('arena', c);
    expect(p.diagnostics).toEqual([]); expect(p.record!.spawns).toHaveLength(2);
    expect(p.record!.spawns[0]!.slice(1, 4)).not.toEqual(p.record!.spawns[1]!.slice(1, 4));
  });
  it('uses the loaded bomb context for a rehearsal pickup instead of inventing a replacement location', async () => {
    const c = context(); c.map!.bombStart = [10, 1, 20];
    const p = await previewStarter('demolition', c);
    expect(p.record!.objectives!.bomb!.start).toEqual([10, 0, 20]);
  });
  it.each([
    ['missing map', (c: StarterContext) => { c.map = null; }, 'MAP_UNAVAILABLE'],
    ['missing archive', (c: StarterContext) => { c.archives = []; }, 'ARCHIVE_UNAVAILABLE'],
    ['missing asset', (c: StarterContext) => { c.assets = []; }, 'ASSET_UNAVAILABLE'],
    ['missing hull', (c: StarterContext) => { c.assets[0]!.collision.state = 'none'; }, 'COLLISION_UNAVAILABLE'],
    ['bad geometry', (c: StarterContext) => { c.assets[0]!.geometry.parts = 0; }, 'GEOMETRY_INCOMPATIBLE'],
    ['no floor', (c: StarterContext) => { delete c.map!.ground; }, 'NO_SAFE_FLOOR'],
    ['stale catalogue', (c: StarterContext) => { c.assets[0]!.revision = 6; }, 'STALE_CATALOGUE'],
    ['missing checker', (c: StarterContext) => { delete c.checkPlacement; }, 'PLACEMENT_UNAVAILABLE'],
    ['missing completed-layout check', (c: StarterContext) => { delete c.checkLayout; }, 'LAYOUT_VALIDATION_UNAVAILABLE'],
  ] as const)('blocks %s without a partial record', async (_name, change, code) => {
    const c = context(); change(c);
    const p = await previewStarter('crate-stack', c);
    expect(p.record).toBeNull(); expect(p.diagnostics.map((d) => d.code)).toContain(code);
  });
  it('requires campaign context for arena and runtime Frostfire label for remix', async () => {
    const c = context(); c.archives[0]!.campaign = false;
    expect((await previewStarter('arena', c)).diagnostics[0]!.code).toBe('MAP_INCOMPATIBLE');
    expect((await previewStarter('frostfire-trees', c)).diagnostics[0]!.code).toBe('MAP_INCOMPATIBLE');
  });
  it('names alone never certify a tree or collision', async () => {
    const c = context(); c.archives[0]!.label = 'Frostfire'; c.assets = [asset('tree')];
    expect((await previewStarter('frostfire-trees', c)).diagnostics.map((d) => d.code)).toContain('TREE_UNVERIFIED');
    c.treeRefs = ['asset:tree']; c.assets[0]!.collision.bounds = null;
    expect((await previewStarter('frostfire-trees', c)).record).toBeNull();
  });
  it('uses a loaded hostile type index and blocks unsupported character ranges', async () => {
    const c = context(); const p = await previewStarter('hostile-range', c);
    expect(p.record!.npcs!.map((n) => [n[0], n[1]])).toEqual([['terrorist', 1], ['terrorist', 1], ['terrorist', 1]]);
    c.hostileType = 0;
    expect((await previewStarter('hostile-range', c)).diagnostics.map((d) => d.code)).toContain('ACTOR_UNAVAILABLE');
    c.hostileType = 255;
    expect((await previewStarter('hostile-range', c)).record).toBeNull();
  });
  it('keeps placement refusals, including obstacles and unsupported floors', async () => {
    const c = context(); c.checkPlacement = () => ({ revision: 7, diagnostics: [{ code: 'OBSTRUCTED', message: 'Actual hull blocks placement' }] });
    const p = await previewStarter('arena', c);
    expect(p.record).toBeNull(); expect(p.diagnostics.some((d) => d.code === 'OBSTRUCTED')).toBe(true);
  });
  it('does not publish a mood preset whose player cap needs more starts than supplied', async () => {
    const c = context(), p = await previewStarter('static-mood', c);
    expect(checkMap(layoutOfRecord(p.record!), c.map!.ground!, []).issues.filter((i) => i.kind === 'spawn-count')).toEqual([]);
  });
  it('blocks range seats embedded in existing hull walls', async () => {
    const c = context(), g = c.map!.ground!;
    const all = groundPolygons(g);
    all.push({ modelName: 'wall', path: 'wall', ditype: 2, material: 0, ptcount: 4, cameratype: 0, region: 0,
      points: new Float32Array([201, 0, -30, 201, 30, -30, 201, 30, 30, 201, 0, 30]) });
    c.map!.ground = packGround(g.grid, all, [...g.owners, { modelName: 'wall', path: 'wall', first: all.length - 1, count: 1 }]);
    const p = await previewStarter('hostile-range', c);
    expect(p.record).toBeNull(); expect(p.diagnostics.some((d) => d.code === 'ACTOR_OBSTRUCTED')).toBe(true);
  });
  it('applies once through layout.import with its preview revision; undo restores all old work', async () => {
    const c = context(), p = await previewStarter('arena', c);
    const old = { v: 2 as const, base: 'M99', name: 'My existing work', assets: [], pieces: [], spawns: [], hidden: ['thing@0,0,0'] };
    let record = old as typeof p.record, revision = 7;
    const history = new History(JSON.stringify(old));
    const facade: ForgeAgentFacade = {
      snapshot: () => ({ ready: true, mode: 'forge-editor', revision, layout: record, selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: true, canRedo: false }),
      prepare: async (_op, args) => ({ commit: () => { record = args['layout'] as typeof record; history.record(JSON.stringify(record)); revision++; }, dispose: () => undefined }),
    };
    const api = createForgeAgentApi(facade);
    expect((await applyStarter(p, api)).ok).toBe(true); expect(revision).toBe(8);
    expect(record).toEqual(p.record); expect(JSON.parse(history.undo()!)).toEqual(old);
    expect((await applyStarter(p, api)).code).toBe('STALE_REVISION');
  });
  it('refuses blocked previews, changed/Play/live contexts, and preserves denied import errors', async () => {
    const p = await previewStarter('static-mood', context());
    for (const mode of ['forge-play', 'blocked'] as const) {
      let called = false;
      const api = { read: () => ({ mode, revision: 7, ready: true }), execute: async () => { called = true; return { ok: false, revision: 7 }; } };
      expect((await applyStarter(p, api)).ok).toBe(false); expect(called).toBe(false);
    }
    const denied = { read: () => ({ mode: 'forge-editor' as const, revision: 7, ready: true }), execute: async () => ({ ok: false, revision: 7, code: 'DENIED' }) };
    expect((await applyStarter(p, denied)).code).toBe('DENIED');
    const blocked = await previewStarter('arena', { ...context(), assets: [] });
    expect((await applyStarter(blocked, denied)).code).toBe('REQUIREMENTS_UNMET');
  });
});
