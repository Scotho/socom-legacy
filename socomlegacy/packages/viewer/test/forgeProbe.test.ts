import { describe, expect, it, vi } from 'vitest';
import { Object3D } from 'three';
import { FORGE_PROBE_LIMITS, type AgentRequest } from '@s2u/forge-agent-protocol';
import type { WorldPoly } from '@s2u/scene';
import { ForgeAgentError, createForgeAgentApi } from '../src/forge/agent/api';
import { createForgeAgentRevisions, createForgeEditorFacade, type ForgeAgentEditor } from '../src/forge/agent/editorFacade';
import { probeForge, type ForgeProbeWorld } from '../src/forge/agent/probe';
import { createForgePageTarget } from '../src/agent/forgeTarget';
import { floorGround } from '../src/forge/ground';
import { placementGridOf } from '../src/forge/placement';
import { emptyLayout, type Layout, type LayoutBase } from '../src/forge/layout';

/**
 * AX-17 (plan item 17; a browser adaptation, product track): `forge.probe` over a small fixture -- the blank floor's hull
 * at y = 0 (`floorGround`) and one box piece (`forge/piece_0`, the page's owner name) whose top is ground at y = 50 over
 * x 100..200, z -50..50, with a wall face at x = 100. The probe reads the same placement grid and piece bounds the
 * editor's placement check reads; nothing here is a simulation value.
 */
const poly = (path: string, ditype: number, points: number[]): WorldPoly =>
  ({ modelName: 'box', path, region: 0, ditype, material: 0, ptcount: points.length / 3, cameratype: 0, points: new Float32Array(points) });
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function world(over: Partial<ForgeProbeWorld> = {}): ForgeProbeWorld {
  const top = poly('box', 3, [100, 50, -50, 200, 50, -50, 200, 50, 50, 100, 50, 50]);
  const wall = poly('box', 2, [100, 0, -50, 100, 50, -50, 100, 50, 50, 100, 0, 50]);
  const grid = placementGridOf(floorGround(2000), [{ owner: 'forge/piece_0', polys: [top, wall], m: IDENTITY }]);
  return {
    grid,
    obstacles: [{ ref: 'piece:0', bounds: { min: [100, 0, -50], max: [200, 50, 50] } }],
    refOfOwner: (path) => (path === 'forge/piece_0' ? 'piece:0' : null),
    gridStep: 25,
    ...over,
  };
}
const refusalOf = (f: () => unknown): ForgeAgentError => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(ForgeAgentError); return e as ForgeAgentError; }
  throw new Error('expected a refusal');
};

describe('forge.probe: ground', () => {
  it('answers the floor height and the base under an open point', () => {
    const out = probeForge(world(), { kind: 'ground', at: [0, 0] }, 7) as Record<string, unknown>;
    expect(out).toMatchObject({ kind: 'ground', revision: 7, hit: true, y: 0, point: [0, 0, 0], surface: { kind: 'base', path: 'forge_floor' },
      traversability: 'unverified', partial: false });
    expect(String(out['diagnostic'])).toMatch(/never certif/);
  });

  it('answers the top of a placed piece, by its ref, with the floor below it as another surface', () => {
    const out = probeForge(world(), { kind: 'ground', at: [150, 0] }, 7) as { y: number; surface: unknown; others: { y: number; surface: unknown }[] };
    expect(out.y).toBe(50);
    expect(out.surface).toEqual({ kind: 'piece', ref: 'piece:0' });
    expect(out.others).toEqual([{ y: 0, surface: { kind: 'base', path: 'forge_floor' } }]);
  });

  it('takes the highest surface at or below `below`', () => {
    const out = probeForge(world(), { kind: 'ground', at: [150, 0], below: 10 }, 7) as { y: number; surface: unknown };
    expect(out.y).toBe(0);
    expect(out.surface).toEqual({ kind: 'base', path: 'forge_floor' });
  });

  it('answers hit:false off the hull, and refuses NO_GROUND without a placement grid', () => {
    expect(probeForge(world(), { kind: 'ground', at: [5000, 5000] }, 7)).toMatchObject({ hit: false });
    expect(refusalOf(() => probeForge(world({ grid: null }), { kind: 'ground', at: [0, 0] }, 7)).code).toBe('NO_GROUND');
  });

  it('refuses a kind missing its own arguments', () => {
    expect(refusalOf(() => probeForge(world(), { kind: 'ground' }, 7)).code).toBe('INVALID_ARGUMENT');
    expect(refusalOf(() => probeForge(world(), { kind: 'ray', from: [0, 0, 0] }, 7)).code).toBe('INVALID_ARGUMENT');
    expect(refusalOf(() => probeForge(world(), { kind: 'free', near: [0, 0, 0] }, 7)).code).toBe('INVALID_ARGUMENT');
  });
});

describe('forge.probe: ray', () => {
  it("answers the first hit along a segment: the piece's wall, its point and normal", () => {
    const out = probeForge(world(), { kind: 'ray', from: [0, 25, 0], to: [300, 25, 0] }, 7) as { hit: boolean; point: number[]; normal: number[]; distance: number; surface: unknown };
    expect(out.hit).toBe(true);
    expect(out.point[0]).toBeCloseTo(100, 3);
    expect(out.point[1]).toBeCloseTo(25, 3);
    expect(Math.abs(out.normal[0]!)).toBeCloseTo(1, 3);
    expect(out.distance).toBeCloseTo(100, 3);
    expect(out.surface).toEqual({ kind: 'piece', ref: 'piece:0' });
  });

  it('answers the floor for a downward ray and hit:false for a ray that meets nothing', () => {
    expect(probeForge(world(), { kind: 'ray', from: [-300, 100, 0], to: [-300, -100, 0] }, 7)).toMatchObject({ hit: true, point: [-300, 0, 0], surface: { kind: 'base' } });
    expect(probeForge(world(), { kind: 'ray', from: [-300, 100, 0], to: [-300, 200, 0] }, 7)).toMatchObject({ hit: false });
  });

  it('refuses a ray past its bound, and a ray of no length', () => {
    expect(refusalOf(() => probeForge(world(), { kind: 'ray', from: [0, 0, 0], to: [FORGE_PROBE_LIMITS.ray + 1, 0, 0] }, 7)).code).toBe('PROBE_TOO_LARGE');
    expect(refusalOf(() => probeForge(world(), { kind: 'ray', from: [1, 2, 3], to: [1, 2, 3] }, 7)).code).toBe('INVALID_ARGUMENT');
  });
});

describe('forge.probe: free', () => {
  it('answers ground points near a point whose footprint overlaps no placed piece, nearest first', () => {
    const out = probeForge(world(), { kind: 'free', near: [150, 0, 0], radius: 200, footprint: [20, 20], limit: 8 }, 7) as {
      candidates: { point: number[]; distance: number; surface: unknown }[]; samples: number; partial: boolean };
    expect(out.candidates).toHaveLength(8);
    for (const c of out.candidates) {
      const [x, , z] = c.point as [number, number, number];
      const overlaps = x + 10 > 100 && x - 10 < 200 && z + 10 > -50 && z - 10 < 50;
      expect(overlaps, `${x},${z}`).toBe(false);
      expect(c.point[1]).toBe(0);
      expect(c.surface).toEqual({ kind: 'base', path: 'forge_floor' });
      expect(Math.hypot(x - 150, z)).toBeLessThanOrEqual(200 + 1e-9);
    }
    const d = out.candidates.map((c) => c.distance);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(out.partial).toBe(false);
  });

  it('defaults its step to the editor grid step and answers on that lattice', () => {
    const out = probeForge(world(), { kind: 'free', near: [-500, 0, -500], radius: 30 }, 7) as { step: number; candidates: { point: number[] }[] };
    expect(out.step).toBe(25);
    expect(out.candidates[0]!.point).toEqual([-500, 0, -500]);
  });

  it('refuses an oversized radius', () => {
    const e = refusalOf(() => probeForge(world(), { kind: 'free', near: [0, 0, 0], radius: FORGE_PROBE_LIMITS.radius + 1 }, 7));
    expect(e.code).toBe('PROBE_TOO_LARGE');
  });

  it('caps the samples: a fine step over a wide radius is widened, and the answer says so', () => {
    const out = probeForge(world(), { kind: 'free', near: [0, 0, 0], radius: FORGE_PROBE_LIMITS.radius, step: 1, limit: FORGE_PROBE_LIMITS.candidates },
      7) as { samples: number; sampleCap: number; step: number; partial: boolean; bounds: string[] };
    expect(out.sampleCap).toBe(FORGE_PROBE_LIMITS.samples);
    expect(out.samples).toBeLessThanOrEqual(FORGE_PROBE_LIMITS.samples);
    expect(out.step).toBeGreaterThan(1);
    expect(out.partial).toBe(true);
    expect(out.bounds).toContain('sample-cap');
  });

  it('stops at the time budget with a partial answer', () => {
    let t = 0;
    const out = probeForge(world(), { kind: 'free', near: [0, 0, 0], radius: 500, limit: 32 }, 7,
      { now: () => (t += FORGE_PROBE_LIMITS.budgetMs / 4) }) as { samples: number; partial: boolean; bounds: string[] };
    expect(out.partial).toBe(true);
    expect(out.bounds).toContain('time-budget');
    expect(out.samples).toBeLessThan(8);
  });
});

/** The facade's fake editor (as `forgeEditorFacade.test.ts`'s rig): no page, no scene, no disc. */
function rig(over: Partial<ForgeAgentEditor> = {}) {
  const base: LayoutBase = { kind: 'blank', library: 'MP2' } as LayoutBase;
  const layout: Layout = emptyLayout(base);
  const view = { wireframe: false, untextured: false, collision: false, grid: false, spawns: false, fog: true, shadows: true, detail: true,
    billboards: true, alternate: false, blendgraded: true, engineorder: false, ps2: false };
  const editor: ForgeAgentEditor = {
    revisions: createForgeAgentRevisions(),
    play: { execute: vi.fn(() => ({ ok: true, data: null })), status: () => null, read: () => null, cancel: vi.fn() } as unknown as ForgeAgentEditor['play'],
    operations: { active: () => null, get: () => undefined } as unknown as ForgeAgentEditor['operations'],
    shotDriver: null, mapBounds: () => null, savedElsewhereWords: '',
    mode: () => 'forge-editor', picks: () => [] as Object3D[], base: () => base, busy: () => false, checking: () => false,
    layoutName: () => 'Test', layoutNow: () => JSON.parse(JSON.stringify(layout)) as Layout,
    selectionIds: () => [], placementIds: () => new Map(), npcOf: () => undefined, bombKindOf: () => null, lockedOf: () => false,
    entries: () => [], palette: () => [], characters: () => [], charLabel: () => '', absent: () => new Set(), paletteArchive: () => 'MP2',
    chosen: () => null, npcChoice: () => null, favourites: () => new Set(), filter: () => 'all', showChars: () => false, query: () => '',
    hiddenKeys: () => new Set(), baseMap: () => null, charMap: () => null, view: () => view, snap: () => false, gridStep: () => 25,
    turnStep: () => 15, tool: () => 'select', gizmoMode: () => 'translate', camera: () => ({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }),
    named: () => [], namedAt: () => 0,
    history: { canUndo: () => false, canRedo: () => false, peekUndo: () => null, peekRedo: () => null, undo: vi.fn(), redo: vi.fn() } as unknown as ForgeAgentEditor['history'],
    inMatch: () => false, matchOfLobby: () => false, playing: () => false, statusText: () => '', clipboard: () => [],
    queryAssets: vi.fn(), checkPlacement: vi.fn(), starterContext: vi.fn(), missingPacks: () => [], missingPacksWords: () => '',
    prepareLayout: vi.fn(), applyPicked: vi.fn(), changed: vi.fn(), refreshUndo: vi.fn(), edit: vi.fn(), noteMissingPacks: vi.fn(), adoptLayoutCamera: vi.fn(),
    copySelection: vi.fn(), collectCheck: vi.fn(async () => null), loadArchive: vi.fn(), setPalette: vi.fn(), lookAtPoint: vi.fn(),
    saveCamera: vi.fn(), persistNamed: vi.fn(async () => 'written' as const), startMatch: vi.fn(async () => undefined),
    startPlay: vi.fn(async () => undefined), setView: vi.fn(), setCameraPose: vi.fn(), lookFrom: vi.fn(), focusOn: vi.fn(), setQuery: vi.fn(),
    setPaletteFilter: vi.fn(), choose: vi.fn(), setFavourite: vi.fn(), setSnap: vi.fn(), setTool: vi.fn(), stopPlay: vi.fn(), endMatch: vi.fn(), rereadLists: vi.fn(),
    probeWorld: () => world(),
    ...over,
  };
  return { editor, facade: createForgeEditorFacade(editor) };
}

describe('forge.probe through the facade and the page target', () => {
  it('is read-only: the layout revision, history and edits are unchanged after a probe', async () => {
    const r = rig();
    const api = createForgeAgentApi(r.facade);
    const before = api.status().revision;
    for (const args of [{ kind: 'ground', at: [150, 0] }, { kind: 'ray', from: [0, 25, 0], to: [300, 25, 0] }, { kind: 'free', near: [0, 0, 0], radius: 100 }]) {
      const result = await api.execute('world.probe', args);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      expect(result.revision).toBe(before);
    }
    expect(api.status().revision).toBe(before);
    expect(r.editor.edit).not.toHaveBeenCalled();
    expect(r.editor.changed).not.toHaveBeenCalled();
    expect(r.editor.prepareLayout).not.toHaveBeenCalled();
  });

  it('refuses UNSUPPORTED on a page without the probe hook, and PROBE_TOO_LARGE by name', async () => {
    const bare = createForgeAgentApi(rig({ probeWorld: undefined }).facade);
    expect(await bare.execute('world.probe', { kind: 'ground', at: [0, 0] })).toMatchObject({ ok: false, code: 'UNSUPPORTED' });
    const api = createForgeAgentApi(rig().facade);
    expect(await api.execute('world.probe', { kind: 'free', near: [0, 0, 0], radius: FORGE_PROBE_LIMITS.radius + 1 })).toMatchObject({ ok: false, code: 'PROBE_TOO_LARGE' });
  });

  it('routes the wire operation forge.probe to world.probe, with a hint on its refusal', async () => {
    const api = createForgeAgentApi(rig().facade);
    const target = createForgePageTarget({ api, build: 'test' });
    const request = (args: unknown, n: number): AgentRequest => ({ version: 1, requestId: `p${n}`, sessionId: 's', targetId: 't', epoch: 'e', operation: 'forge.probe', args } as AgentRequest);
    const ok = await target.dispatch(request({ kind: 'ground', at: [150, 0] }, 1), new AbortController().signal);
    expect(ok).toMatchObject({ outcome: 'ok', data: { kind: 'ground', y: 50, surface: { kind: 'piece', ref: 'piece:0' } } });
    const refused = await target.dispatch(request({ kind: 'free', near: [0, 0, 0], radius: FORGE_PROBE_LIMITS.radius + 1 }, 2), new AbortController().signal);
    expect(refused).toMatchObject({ outcome: 'refused', code: 'PROBE_TOO_LARGE' });
    expect(refused.hint).toContain(String(FORGE_PROBE_LIMITS.radius));
  });
});
